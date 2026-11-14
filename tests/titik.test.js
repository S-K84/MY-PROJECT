const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { clientScript } = require('./helpers');

const ROOT = path.join(__dirname, '..');
const fn = (s, name) => s.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'))[0];

const { spawnSync } = require('child_process');

test('ambil_titik.py: ujian unit Python (jenis kamera/lampu, Singapura, pendua, semakan jumlah)', t => {
  const r = spawnSync('python3', [path.join(ROOT, 'tests', 'py', 'test_ambil_titik.py')], { encoding: 'utf8' });
  if (r.error) return t.skip('python3 tiada');
  assert.strictEqual(r.status, 0, r.stderr);
});

for (const file of ['Index.html', 'IndexUji.html']) {
test(`${file}: titik dibaca dari fail statik dahulu, Overpass sandaran; mesej diagnostik sementara dibuang`, () => {
  const s = clientScript(file);
  assert.match(s, /TITIK_URL = 'https:\\\/\\\/s-k84\.github\.io\/MY-PROJECT\/data\/titik\.json'/);
  assert.match(s, /loadTitik\(\)\.then\(d => d \? titikElements\(d, bx\) : overpassRaw\(qN/);
  assert.ok(!/toast\(['`]🚦/.test(s) && !/toast\(['`]🛣️/.test(s), 'mesej diagnostik 🚦/🛣️ masih ada');
  assert.ok(!/slDiag|wDiag|sigToast|wayToast/.test(s));
});

test(`${file}: titikElements memberi hanya titik dalam kotak, berbentuk Overpass`, () => {
  const s = clientScript(file);
  const ctx = {};
  vm.runInNewContext(fn(s, 'titikElements') + ';this.f = titikElements;', ctx);
  const d = { c: [[3.1, 101.7, 11], [4.0, 102.0, 12]], s: [[3.1005, 101.7005, 21], [9, 9, 22]] };
  const out = ctx.f(d, ['3.099,101.699,3.102,101.702']);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(out.map(e => [e.id, e.tags.highway]))),
    [[11, 'speed_camera'], [21, 'traffic_signals']]);
  assert.strictEqual(out[0].type, 'node');
  assert.strictEqual(out[0].lon, 101.7);
});

test(`${file}: loadTitik memuat sekali sahaja; gagal → null (sandaran Overpass)`, async () => {
  const s = clientScript(file);
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
}

