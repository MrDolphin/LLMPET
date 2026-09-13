'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { loadRenderer } = require('./dom-stub');
const { sanitize } = require('../backend/config');
const i18n = require('../shared/i18n');
const root = path.join(__dirname, '..');
const assetDir = path.join(root, 'assets', 'deepseek-maid');
const manifest = JSON.parse(fs.readFileSync(path.join(assetDir, 'manifest.json')));

// Parse GIF blocks, not compressed-byte pattern matches: a pixel stream may
// contain a fake image separator or control-extension byte sequence.
function gifMetadata(bytes) {
  assert(/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii')));
  const size = [bytes.readUInt16LE(6), bytes.readUInt16LE(8)];
  let p = 13 + ((bytes[10] & 0x80) ? 3 * (1 << ((bytes[10] & 7) + 1)) : 0);
  const delaysMs = [];
  let delay = null;
  let loop = null;
  const subblocks = () => {
    const blocks = [];
    while (true) {
      assert(p < bytes.length, 'truncated GIF subblock');
      const length = bytes[p++];
      if (!length) break;
      assert(p + length <= bytes.length, 'truncated GIF payload');
      blocks.push(bytes.subarray(p, p + length));
      p += length;
    }
    return blocks;
  };
  while (p < bytes.length) {
    const marker = bytes[p++];
    if (marker === 0x3b) break;
    if (marker === 0x21) {
      const kind = bytes[p++];
      const blocks = subblocks();
      if (kind === 0xf9) {
        assert.strictEqual(blocks[0].length, 4);
        delay = blocks[0].readUInt16LE(1) * 10;
      } else if (kind === 0xff && blocks[0].toString('ascii') === 'NETSCAPE2.0') {
        assert.strictEqual(blocks[1][0], 1);
        loop = blocks[1].readUInt16LE(1);
      }
    } else if (marker === 0x2c) {
      assert(p + 9 <= bytes.length, 'truncated image descriptor');
      const packed = bytes[p + 8];
      p += 9;
      if (packed & 0x80) p += 3 * (1 << ((packed & 7) + 1));
      p++; // LZW minimum code size
      subblocks();
      assert(delay > 0, 'every frame needs a nonzero explicit delay');
      delaysMs.push(delay);
      delay = null;
    } else {
      assert.fail(`unexpected GIF block 0x${marker.toString(16)}`);
    }
  }
  return { size, delaysMs, loop, frameCount: delaysMs.length };
}

assert.strictEqual(manifest.id, 'deepseek-maid');
assert.strictEqual(manifest.animationCount, 23);
assert.strictEqual(manifest.animations.length, 23);
const actualFiles = fs.readdirSync(assetDir).filter((file) => file.endsWith('.gif')).sort();
assert.deepStrictEqual(actualFiles, manifest.animations.map((a) => a.file).sort());
let frames = 0;
let duration = 0;
for (const animation of manifest.animations) {
  const bytes = fs.readFileSync(path.join(assetDir, animation.file));
  assert.strictEqual(crypto.createHash('sha256').update(bytes).digest('hex'), animation.sha256,
    `${animation.file} must be the byte-identical selected delivery`);
  const meta = gifMetadata(bytes);
  assert.deepStrictEqual(meta.size, [360, 360]);
  assert.strictEqual(meta.frameCount, animation.frameCount);
  assert(meta.frameCount > 1, 'not a static replacement');
  assert.deepStrictEqual(meta.delaysMs, animation.delaysMs);
  assert.strictEqual(meta.loop, animation.loop);
  assert.strictEqual(meta.delaysMs.reduce((a, b) => a + b, 0), animation.durationMs);
  frames += meta.frameCount;
  duration += animation.durationMs;
}
assert.strictEqual(frames, 731);
assert.strictEqual(duration, 31840);
assert.strictEqual(frames, manifest.totalFrames);
assert.strictEqual(duration, manifest.totalDurationMs);
const animation = (action) => manifest.animations.find((a) => a.action === action);
assert.strictEqual(animation('sweeping').sha256, '78f041ac997862bf7fc91116fff0be8c224192fdf2975c6ce34ac7cc0a356fd3');
assert.strictEqual(animation('loafing').sha256, '7c074767f4de3e9aba64901170ca8d844aec185ecb61ec46a622c249a0e2aae4');
assert.strictEqual(animation('working-4').sha256, '5c8be7b54607dc1189ef80e29a3113ca03a6d4ae432434517a3de34791dbac5f');

for (const role of ['skin', 'skinCodex', 'skinDsh']) {
  assert.strictEqual(sanitize({ [role]: 'deepseek-maid' })[role], 'deepseek-maid');
}
assert.strictEqual(sanitize({}).skin, 'mascot', 'do not silently change existing defaults');
for (const lang of ['zh', 'en', 'ja']) {
  assert(Object.hasOwn(i18n.DICT[lang], 'skin.deepseek-maid'), `${lang} needs its own label, not a fallback`);
  i18n.setLang(lang);
  assert(i18n.t('skin.deepseek-maid').includes('DeepSeek'));
}
i18n.setLang('zh');

const w = loadRenderer(['shared/i18n.js', 'shared/states.js', 'renderer/pet.js']);
w.handlers.config({ skin: 'deepseek-maid', muted: true });
assert(w.document.body.classList.contains('skin-deepseek-maid'));
assert(w.document.body.classList.contains('skin-cat'), 'reuse the GIF rendering path');
assert(!w.document.body.classList.contains('skin-whale'), 'keep old whale-specific effects isolated');
const pack = vm.runInContext("MEME_PACKS['deepseek-maid']", w.sandbox);
const mappedFiles = new Set([...Object.values(pack.states), ...Object.values(pack.pools).flat()]);
assert.deepStrictEqual([...mappedFiles].sort(), actualFiles, 'all 23 actions must be reachable');
const src = () => w.elements('cat-img').getAttribute('src');
for (const [state, file] of Object.entries(pack.states)) {
  vm.runInContext(`poolIdx = 0; updateCat(${JSON.stringify(state)})`, w.sandbox);
  assert.strictEqual(src(), `../assets/deepseek-maid/${file}`, `${state} selects its own new-pack asset`);
}
for (const [state, files] of Object.entries(pack.pools)) {
  files.forEach((file, index) => {
    vm.runInContext(`poolIdx = ${index}; updateCat(${JSON.stringify(state)})`, w.sandbox);
    assert.strictEqual(src(), `../assets/deepseek-maid/${file}`);
  });
}
vm.runInContext("applySkin('whale'); toggleSkin()", w.sandbox);
assert.strictEqual(vm.runInContext('skin', w.sandbox), 'deepseek-maid');
assert(w.calls.some((call) => call[0] === 'setSkin' && call[1][0] === 'deepseek-maid'));
vm.runInContext('toggleSkin()', w.sandbox);
assert.strictEqual(vm.runInContext('skin', w.sandbox), 'mascot');
assert(!w.document.body.classList.contains('skin-deepseek-maid'), 'no class leakage when switching away');
vm.runInContext("applySkin('cat'); updateCat('sweeping')", w.sandbox);
assert.strictEqual(src(), '../assets/cat/cat-sweeping.gif');
vm.runInContext("applySkin('whale'); updateCat('sweeping')", w.sandbox);
assert.strictEqual(src(), '../assets/whale/whale-sweeping.gif');
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
for (const suffix of ['', ", 'codex'", ", 'dsh'"]) {
  assert(main.includes(`applySkin('deepseek-maid'${suffix})`), 'tray must expose the pack to every pet role');
}
console.log('deepseek-maid: 23 byte-identical animated assets, exact timeline, every state/pool, three roles, and skin switching passed');
// The real renderer starts recurring UI timers. This standalone test has
// completed all synchronous assertions; don't keep npm test alive on them.
process.exit(0);
