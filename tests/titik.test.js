const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { clientScript } = require('./helpers');
const { compact, checkAgainst } = require('../scripts/ambil-titik');

const ROOT = path.join(__dirname, '..');
const fn = (s, name) => s.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'))[0];

test('ambil-titik: compact membuang pendua, koordinat rosak & luar Malaysia, membundar dan menyusun ikut id', () => {
  const out = compact([
    { type: 'node', id: 9, lat: 3.123456789, lon: 101.7 },
    { type: 'node', id: 2, lat: 5.4, lon: 100.3 },
    { type: 'node', id: 9, lat: 3.2, lon: 101.8 },            // pendua
    { type: 'node', id: 3, lat: 51.5, lon: -0.1 },            // London
    { type: 'node', id: 4, lat: 'x', lon: 101 },              // rosak
    { type: 'way', id: 5, lat: 3, lon: 101 }                  // bukan nod
  ]);
  assert.deepStrictEqual(out, [[5.4, 100.3, 2], [3.12346, 101.7, 9]]);
});

test('ambil-titik: data kosong atau susut mendadak ditolak (fail lama dikekalkan)', () => {
  const full = { c: Array(100).fill([3, 101, 1]), s: Array(1000).fill([3, 101, 1]) };
  assert.match(checkAgainst(null, { c: [], s: [[1, 1, 1]] }), /kosong/);
  assert.match(checkAgainst(full, { c: full.c, s: Array(300).fill([3, 101, 1]) }), /lampu isyarat susut/);
  assert.match(checkAgainst(full, { c: Array(10).fill([3, 101, 1]), s: full.s }), /kamera susut/);
  assert.strictEqual(checkAgainst(full, { c: Array(95).fill([3, 101, 1]), s: Array(990).fill([3, 101, 1]) }), '');
  assert.strictEqual(checkAgainst(null, { c: [[3, 101, 1]], s: [[3, 101, 1]] }), '');
});

test('saluran uji: titik dibaca dari fail statik dahulu, Overpass sandaran; mesej diagnostik sementara dibuang', () => {
  const s = clientScript('IndexUji.html');
  assert.match(s, /TITIK_URL = 'https:\\\/\\\/s-k84\.github\.io\/MY-PROJECT\/data\/titik\.json'/);
  assert.match(s, /loadTitik\(\)\.then\(d => d \? titikElements\(d, bx\) : overpassRaw\(qN/);
  assert.ok(!/toast\(['`]🚦/.test(s) && !/toast\(['`]🛣️/.test(s), 'mesej diagnostik 🚦/🛣️ masih ada');
  assert.ok(!/slDiag|wDiag|sigToast|wayToast/.test(s));
});

test('saluran uji: titikElements memberi hanya titik dalam kotak, berbentuk Overpass', () => {
  const s = clientScript('IndexUji.html');
  const ctx = {};
  vm.runInNewContext(fn(s, 'titikElements') + ';this.f = titikElements;', ctx);
  const d = { c: [[3.1, 101.7, 11], [4.0, 102.0, 12]], s: [[3.1005, 101.7005, 21], [9, 9, 22]] };
  const out = ctx.f(d, ['3.099,101.699,3.102,101.702']);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(out.map(e => [e.id, e.tags.highway]))),
    [[11, 'speed_camera'], [21, 'traffic_signals']]);
  assert.strictEqual(out[0].type, 'node');
  assert.strictEqual(out[0].lon, 101.7);
});

test('saluran uji: loadTitik memuat sekali sahaja; gagal → null (sandaran Overpass)', async () => {
  const s = clientScript('IndexUji.html');
  let calls = 0, mode = 'ok';
  const ctx = { window: { fetch: true }, Date, Promise, TITIK_URL: 'u',
    fetch: () => { calls++; return mode === 'ok'
      ? Promise.resolve({ ok: true, json: () => Promise.resolve({ c: [], s: [] }) })
      : Promise.resolve({ ok: false, status: 404 }); } };
  vm.runInNewContext('let titikP = null, titikFailAt = 0;' + fn(s, 'loadTitik') + ';this.f = loadTitik;', ctx);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(await ctx.f())), { c: [], s: [] });
  await ctx.f(); assert.strictEqual(calls, 1);
  const ctx2 = Object.assign({}, ctx); mode = 'gagal';
  vm.runInNewContext('let titikP = null, titikFailAt = 0;' + fn(s, 'loadTitik') + ';this.f = loadTitik;', ctx2);
  assert.strictEqual(await ctx2.f(), null);
});

test('titik-bulanan.yml: berjadual bulanan, hanya menyimpan docs/data/titik.json', () => {
  const y = fs.readFileSync(path.join(ROOT, '.github/workflows/titik-bulanan.yml'), 'utf8');
  assert.match(y, /cron: '\d+ \d+ \d+ \* \*'/);
  assert.match(y, /workflow_dispatch/);
  assert.match(y, /git add docs\/data\/titik\.json/);
  assert.ok(!/git add (-A|\.)/.test(y));
});
