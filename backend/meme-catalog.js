'use strict';

const fs = require('fs');
const path = require('path');
const { RENDER_STATE_WORDS } = require('../shared/states');

const CATALOG_PATH = path.join(__dirname, '..', 'assets', 'memes', 'catalog.json');
const MEME_ROOT = path.dirname(CATALOG_PATH);
const ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
const MEDIA_RE = /^[a-z0-9][a-z0-9._/-]{1,180}$/i;
const MAX_PROMPT_CHARS = 12000;
const REACTION_STATES = new Set(RENDER_STATE_WORDS);
// Locales an item may carry overrides for. The base fields stay Chinese so an
// item without `i18n` still works — and so the zh build is never a lookup.
const TRANSLATED_LANGS = ['en', 'ja'];

function safeMediaPath(value) {
  if (typeof value !== 'string' || !MEDIA_RE.test(value) || value.includes('..')) return null;
  const full = path.resolve(MEME_ROOT, value);
  return full.startsWith(MEME_ROOT + path.sep) ? full : null;
}

// Per-locale overrides. Every field is optional and falls back to the Chinese
// base, so a partially translated item is still a valid item — but a present
// prompt override gets the same length ceiling as the base prompt.
function validateI18n(id, raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return Object.freeze(out);
  for (const lang of TRANSLATED_LANGS) {
    const entry = raw[lang];
    if (!entry || typeof entry !== 'object') continue;
    if (entry.promptText !== undefined
      && (typeof entry.promptText !== 'string' || !entry.promptText.trim() || entry.promptText.length > MAX_PROMPT_CHARS)) {
      throw new Error(`${id}: i18n.${lang}.promptText 为空或过长`);
    }
    out[lang] = Object.freeze({
      label: entry.label === undefined ? null : String(entry.label).slice(0, 80),
      description: entry.description === undefined ? null : String(entry.description).slice(0, 180),
      reactionLabel: entry.reactionLabel === undefined ? null : String(entry.reactionLabel).slice(0, 80),
      promptText: entry.promptText === undefined ? null : entry.promptText.trim(),
    });
  }
  return Object.freeze(out);
}

function validateItem(raw) {
  if (!raw || typeof raw !== 'object' || !ID_RE.test(raw.id || '')) {
    throw new Error('表情包 id 不合法');
  }
  const gif = safeMediaPath(raw.media && raw.media.gif);
  const audio = safeMediaPath(raw.media && raw.media.audio);
  const prompt = raw.prompt && raw.prompt.text;
  if (!gif || !audio) throw new Error(`${raw.id}: 媒体路径不合法`);
  if (!fs.existsSync(gif) || !fs.existsSync(audio)) throw new Error(`${raw.id}: 媒体文件不存在`);
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MAX_PROMPT_CHARS) {
    throw new Error(`${raw.id}: prompt 为空或过长`);
  }
  const reaction = raw.reaction;
  if (!reaction || typeof reaction !== 'object' || !REACTION_STATES.has(reaction.state)) {
    throw new Error(`${raw.id}: reaction.state 不合法`);
  }
  return Object.freeze({
    id: raw.id,
    label: String(raw.label || raw.id).slice(0, 80),
    description: String(raw.description || '').slice(0, 180),
    i18n: validateI18n(raw.id, raw.i18n),
    category: String(raw.category || 'general').slice(0, 64),
    tags: Object.freeze((Array.isArray(raw.tags) ? raw.tags : []).slice(0, 12).map((v) => String(v).slice(0, 32))),
    media: Object.freeze({
      gif: raw.media.gif,
      audio: raw.media.audio,
      durationMs: Math.max(800, Math.min(30000, Number(raw.media.durationMs) || 3000)),
      placement: raw.media.placement === 'pet-left' ? 'pet-left' : 'pet-right',
    }),
    prompt: Object.freeze({
      version: Math.max(1, Math.floor(Number(raw.prompt.version) || 1)),
      text: prompt.trim(),
    }),
    reaction: Object.freeze({
      state: reaction.state,
      durationMs: Math.max(800, Math.min(30000, Number(reaction.durationMs) || 3000)),
      label: String(reaction.label || '').slice(0, 80),
    }),
  });
}

function loadCatalog(catalogPath = CATALOG_PATH) {
  const raw = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  if (!raw || raw.schemaVersion !== 1 || !Array.isArray(raw.items)) {
    throw new Error('表情包目录 schemaVersion 必须为 1');
  }
  const seen = new Set();
  const items = raw.items.map(validateItem);
  for (const item of items) {
    if (seen.has(item.id)) throw new Error(`表情包 id 重复: ${item.id}`);
    seen.add(item.id);
  }
  return Object.freeze({ schemaVersion: 1, items: Object.freeze(items) });
}

const catalog = loadCatalog();

// Resolve one item's user-visible copy for `lang`, falling back field by field
// to the Chinese base so a missing translation degrades to zh, never to blank.
function localize(item, lang) {
  const tr = (item.i18n && item.i18n[lang]) || null;
  if (!tr) return item;
  return {
    ...item,
    label: tr.label || item.label,
    description: tr.description || item.description,
    reaction: { ...item.reaction, label: tr.reactionLabel || item.reaction.label },
    prompt: { ...item.prompt, text: tr.promptText || item.prompt.text },
  };
}

function publicCatalog(lang = 'zh') {
  return {
    schemaVersion: catalog.schemaVersion,
    items: catalog.items.map((raw) => {
      const item = localize(raw, lang);
      return {
        id: item.id,
        label: item.label,
        description: item.description,
        category: item.category,
        tags: [...item.tags],
        media: { ...item.media },
        reaction: { ...item.reaction },
        promptVersion: item.prompt.version,
      };
    }),
  };
}

function getMeme(id, lang = 'zh') {
  const item = catalog.items.find((entry) => entry.id === id);
  return item ? localize(item, lang) : null;
}

module.exports = {
  CATALOG_PATH,
  MAX_PROMPT_CHARS,
  loadCatalog,
  publicCatalog,
  getMeme,
};
