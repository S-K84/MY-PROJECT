const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { clientScript } = require('./helpers');
const { cellKey, allCells, parseMaxspeed, compactWays, decide } = require('../scripts/ambil-had');

const ROOT = path.join(__dirname, '..');
const fn = (s, name) => s.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'))[0];

test('ambil-had: parseMaxspeed sama dengan klien (mph ditukar, > 130 dan teks ditolak)', () => {
  assert.strictEqual(parseMaxspeed('90'), 90);
  assert.strictEqual(parseMaxspeed('60 mph'), 97);
  assert.strictEqual(parseMaxspeed('140'), 0);
  assert.strictEqual(parseMaxspeed('walk'), 0);
  const s = clientScript('IndexUji.html'), ctx = {};
  vm.runInNewContext(fn(s, 'parseMaxspeed') + ';this.f = parseMaxspeed;', ctx);
  ['90', '60 mph', '140', 'walk', '', '30', '110'].forEach(v => assert.strictEqual(ctx.f(v) > 130 ? 0 : ctx.f(v), parseMaxspeed(v), v));
});

test('ambil-had: compactWays membuang jalan tanpa had sah / geometri rosak / pendua, membundar dan menyusun ikut id', () => {
  const g = [{ lat: 3.123456, lon: 101.7 }, { lat: 3.2, lon: 101.8 }];
  const out = compactWays([
    { type: 'way', id: 9, tags: { maxspeed: '60' }, geometry: g },
    { type: 'way', id: 2, tags: { maxspeed: '90' }, geometry: g },
    { type: 'way', id: 9, tags: { maxspeed: '50' }, geometry: g },                 // pendua
    { type: 'way', id: 3, tags: { maxspeed: 'none' }, geometry: g },               // had tidak sah
    { type: 'way', id: 4, tags: { maxspeed: '50' }, geometry: [{ lat: 1, lon: 1 }] }, // satu bucu
    { type: 'way', id: 5, tags: { maxspeed: '50' }, geometry: [{ lat: 'x', lon: 1 }, { lat: 1, lon: 1 }] },
    { type: 'node', id: 6, tags: { maxspeed: '50' } }
  ]);
  assert.deepStrictEqual(out, [[90, [3.12346, 101.7, 3.2, 101.8]], [60, [3.12346, 101.7, 3.2, 101.8]]]);
});

test('ambil-had: decide — data kosong/susut mendadak tidak menimpa fail lama', () => {
  assert.strictEqual(decide(0, 0), 'langkau');
  assert.strictEqual(decide(500, 0), 'kekal');
  assert.strictEqual(decide(500, 200), 'kekal');
  assert.strictEqual(decide(500, 400), 'tulis');
  assert.strictEqual(decide(0, 10), 'tulis');
});

test('ambil-had: kunci kawasan & senarai kawasan merangkumi Kuala Lumpur, Kuching dan Kota Kinabalu, tanpa laut', () => {
  assert.strictEqual(cellKey(3.14, 101.69), '6_203');
  const keys = allCells().map(c => c.join('_'));
  ['6_203', cellKey(1.55, 110.35), cellKey(5.98, 116.07)].forEach(k => assert.ok(keys.includes(k), k));
  assert.ok(!keys.includes(cellKey(4, 107)), 'laut China Selatan');
  assert.ok(allCells().length < 600);
});

test('had-bulanan.yml: berjadual bulanan, hanya menyimpan docs/data/had', () => {
  const y = fs.readFileSync(path.join(ROOT, '.github/workflows/had-bulanan.yml'), 'utf8');
  assert.match(y, /cron: '\d+ \d+ \d+ \* \*'/);
  assert.match(y, /workflow_dispatch/);
  assert.match(y, /git add -A docs\/data\/had/);
  assert.match(y, /timeout-minutes: \d+/);
  assert.ok(!/git add (-A|\.)\s*$/m.test(y));
});

test('saluran uji: had laju dibaca dari fail statik dahulu, Overpass sandaran; hadKeys & hadElements betul', () => {
  const s = clientScript('IndexUji.html');
  assert.match(s, /HAD_URL = 'https:\\\/\\\/s-k84\.github\.io\/MY-PROJECT\/data\/had\/'/);
  assert.match(s, /loadHad\(bx\)\.then\(els => els \? \{ elements: els \} : overpassRaw\(qW/);
  const ctx = {};
  vm.runInNewContext(fn(s, 'hadKeys') + fn(s, 'hadElements') + ';this.k = hadKeys; this.e = hadElements;', ctx);
  // kotak merentas sempadan kawasan 0.5° (lat 3.5, lng 101.5)
  assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.k(['3.499,101.499,3.502,101.502']))).sort(), ['6_202', '6_203', '7_202', '7_203']);
  const tiles = [{ w: [[90, [3.1, 101.7, 3.2, 101.7]], [50, [4.9, 100.1, 4.95, 100.1]]] }, null];
  const els = ctx.e(tiles, ['3.099,101.699,3.102,101.702']);
  assert.strictEqual(els.length, 1);
  assert.strictEqual(els[0].tags.maxspeed, '90');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(els[0].geometry)), [{ lat: 3.1, lon: 101.7 }, { lat: 3.2, lon: 101.7 }]);
});
