'use strict';

// Persistent Codex token ledger.
//
// Codex rollout token_count events expose both total_token_usage (a cumulative
// counter that can reset after compaction/context reconstruction) and
// last_token_usage (the exact current request). We ledger last_token_usage once
// per append-only event. Using positive cumulative deltas over-counted a real
// day by >10x because every cumulative reset re-added a large partial history.
// Cached input and reasoning output are subsets of input/output, so they are
// reported separately but never added on top of total_tokens.

const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const { log } = require('./log');

const SESSIONS_DIR = path.join(os.homedir(), '.codex', 'sessions');
const STATE_DIR = path.join(os.homedir(), '.octopus');
const STATE_PATH = path.join(STATE_DIR, 'codex-usage.json');
const SCHEMA_VERSION = 2;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function emptyUsage() {
  return {
    tokens: 0, input: 0, output: 0, cachedInput: 0,
    reasoningOutput: 0, cacheWrite: 0,
  };
}

function normalizeUsage(raw) {
  const u = raw && typeof raw === 'object' ? raw : {};
  const input = num(u.input_tokens ?? u.inputTokens);
  const output = num(u.output_tokens ?? u.outputTokens);
  return {
    tokens: num(u.total_tokens ?? u.totalTokens) || input + output,
    input,
    output,
    cachedInput: num(u.cached_input_tokens ?? u.cachedInputTokens),
    reasoningOutput: num(u.reasoning_output_tokens ?? u.reasoningOutputTokens),
    cacheWrite: num(u.cache_write_input_tokens ?? u.cacheWriteInputTokens),
  };
}

function deltaUsage(previous, current) {
  const a = previous || emptyUsage();
  const b = current || emptyUsage();
  // A lower total means Codex restarted its cumulative counter. Treat the new
  // snapshot as a fresh segment instead of producing a negative delta.
  const reset = num(b.tokens) < num(a.tokens);
  const out = {};
  for (const key of Object.keys(emptyUsage())) {
    out[key] = reset ? num(b[key]) : Math.max(0, num(b[key]) - num(a[key]));
  }
  return out;
}

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function emptyDay() {
  return { ...emptyUsage(), msgs: 0 };
}

function addUsage(target, delta, messageDelta = 0) {
  for (const key of Object.keys(emptyUsage())) target[key] = num(target[key]) + num(delta[key]);
  target.msgs = num(target.msgs) + messageDelta;
}

function createCodexMetering(options = {}) {
  const sessionsDir = options.sessionsDir || SESSIONS_DIR;
  const stateDir = options.stateDir || STATE_DIR;
  const statePath = options.statePath || path.join(stateDir, 'codex-usage.json');

  const state = {
    schemaVersion: SCHEMA_VERSION,
    files: {},     // path -> { offset, carry, sessionId, model }
    sessions: {},  // sessionId/path -> latest cumulative usage (reset diagnostics only)
    daily: {},
    hourlyByDay: {},
    byModelByDay: {},
    lifetime: emptyDay(),
    diagnostics: { lastScanTs: 0, scannedFiles: 0, events: 0, resets: 0 },
  };
  let scanning = false;
  let dirty = false;
  let saveTimer = null;
  let timer = null;

  function reset() {
    state.files = {};
    state.sessions = {};
    state.daily = {};
    state.hourlyByDay = {};
    state.byModelByDay = {};
    state.lifetime = emptyDay();
    state.diagnostics = { lastScanTs: 0, scannedFiles: 0, events: 0, resets: 0 };
  }

  function load() {
    try {
      const raw = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      if (!raw || raw.schemaVersion !== SCHEMA_VERSION) return;
      state.files = raw.files && typeof raw.files === 'object' ? raw.files : {};
      state.sessions = raw.sessions && typeof raw.sessions === 'object' ? raw.sessions : {};
      state.daily = raw.daily && typeof raw.daily === 'object' ? raw.daily : {};
      state.hourlyByDay = raw.hourlyByDay && typeof raw.hourlyByDay === 'object' ? raw.hourlyByDay : {};
      state.byModelByDay = raw.byModelByDay && typeof raw.byModelByDay === 'object' ? raw.byModelByDay : {};
      state.lifetime = raw.lifetime && typeof raw.lifetime === 'object' ? { ...emptyDay(), ...raw.lifetime } : emptyDay();
      state.diagnostics = raw.diagnostics && typeof raw.diagnostics === 'object'
        ? { ...state.diagnostics, ...raw.diagnostics } : state.diagnostics;
    } catch {}
  }

  function saveNow() {
    dirty = false;
    try {
      fs.mkdirSync(stateDir, { recursive: true });
      const tmp = path.join(stateDir, `.codex-usage.${process.pid}.${Date.now()}.tmp`);
      fs.writeFileSync(tmp, JSON.stringify(state), { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tmp, statePath);
    } catch (error) {
      log('codex-meter', 'save failed:', error.message);
    }
  }

  function scheduleSave() {
    dirty = true;
    if (saveTimer) return;
    saveTimer = setTimeout(() => { saveTimer = null; if (dirty) saveNow(); }, 2000);
    if (saveTimer.unref) saveTimer.unref();
  }

  async function listFiles(dir = sessionsDir, out = []) {
    let entries;
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return out; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await listFiles(full, out);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) out.push(full);
    }
    return out;
  }

  function record(ts, model, delta) {
    if (num(delta.tokens) <= 0) return;
    const key = dayKey(ts);
    const day = (state.daily[key] = state.daily[key] || emptyDay());
    addUsage(day, delta, 1);
    addUsage(state.lifetime, delta, 1);
    const hour = new Date(ts).getHours();
    const hours = (state.hourlyByDay[key] = state.hourlyByDay[key] || new Array(24).fill(0));
    hours[hour] += delta.tokens;
    const models = (state.byModelByDay[key] = state.byModelByDay[key] || {});
    const modelKey = model || 'unknown';
    const row = (models[modelKey] = models[modelKey] || emptyDay());
    addUsage(row, delta, 1);
  }

  function processObject(fileState, file, object) {
    const payload = object && object.payload && typeof object.payload === 'object' ? object.payload : {};
    if (object.type === 'session_meta') {
      fileState.sessionId = String(payload.id || payload.session_id || fileState.sessionId || file);
      return;
    }
    if (object.type === 'turn_context') {
      if (typeof payload.model === 'string' && payload.model) fileState.model = payload.model;
      return;
    }
    if (object.type !== 'event_msg' || payload.type !== 'token_count') return;
    const info = payload.info && typeof payload.info === 'object' ? payload.info : {};
    const cumulative = normalizeUsage(info.total_token_usage || info.totalTokenUsage);
    const current = normalizeUsage(info.last_token_usage || info.lastTokenUsage);
    if (current.tokens <= 0) return;
    const sessionKey = fileState.sessionId || file;
    const previous = state.sessions[sessionKey] && state.sessions[sessionKey].usage;
    if (previous && cumulative.tokens < num(previous.tokens)) state.diagnostics.resets++;
    state.sessions[sessionKey] = { usage: cumulative, updatedAt: Date.parse(object.timestamp) || Date.now() };
    const ts = Date.parse(object.timestamp) || Date.now();
    record(ts, fileState.model, current);
    state.diagnostics.events++;
  }

  async function scanFile(file) {
    let stat;
    try { stat = await fsp.stat(file); } catch { return; }
    const fileState = state.files[file] || { offset: 0, carry: '', sessionId: null, model: null };
    if (fileState.offset > stat.size) {
      // Rollouts are append-only. A truncation invalidates the cumulative cursor;
      // a full rebuild is safer than silently double counting.
      state.diagnostics.truncated = (state.diagnostics.truncated || 0) + 1;
      return;
    }
    if (fileState.offset === stat.size) return;
    const stream = fs.createReadStream(file, { start: fileState.offset, encoding: 'utf8' });
    let carry = fileState.carry || '';
    for await (const chunk of stream) {
      const lines = (carry + chunk).split('\n');
      carry = lines.pop() || '';
      for (const line of lines) {
        if (!line || line.charCodeAt(0) !== 123) continue;
        let object;
        try { object = JSON.parse(line); } catch { continue; }
        processObject(fileState, file, object);
      }
    }
    fileState.offset = stat.size;
    fileState.carry = carry;
    state.files[file] = fileState;
  }

  async function scan() {
    if (scanning) return;
    scanning = true;
    try {
      const files = (await listFiles()).sort();
      for (const file of files) {
        try { await scanFile(file); } catch (error) { log('codex-meter', 'scanFile failed:', path.basename(file), error.message); }
      }
      state.diagnostics.lastScanTs = Date.now();
      state.diagnostics.scannedFiles = files.length;
      scheduleSave();
    } catch (error) {
      log('codex-meter', 'scan failed:', error.message);
    } finally {
      scanning = false;
    }
  }

  function getStats() {
    const todayKey = dayKey(Date.now());
    return {
      today: { ...emptyDay(), ...(state.daily[todayKey] || {}) },
      lifetime: { ...emptyDay(), ...state.lifetime },
      hourlyTok: (state.hourlyByDay[todayKey] || new Array(24).fill(0)).slice(),
      daily: Object.fromEntries(Object.entries(state.daily).map(([key, value]) => [
        key, { tokens: value.tokens || 0, msgs: value.msgs || 0 },
      ])),
      byModel: state.byModelByDay[todayKey] ? { ...state.byModelByDay[todayKey] } : {},
      diagnostics: {
        ...state.diagnostics,
        sessions: Object.keys(state.sessions).length,
      },
    };
  }

  async function rebuild() {
    reset();
    await scan();
    saveNow();
    return getStats();
  }

  function start(intervalMs = 30000) {
    load();
    scan();
    timer = setInterval(scan, intervalMs);
    if (timer.unref) timer.unref();
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    saveNow();
  }

  return { start, stop, scan, rebuild, getStats, _state: state, _processObject: processObject };
}

module.exports = { createCodexMetering, normalizeUsage, deltaUsage, emptyUsage };
