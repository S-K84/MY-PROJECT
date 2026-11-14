const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { clientScript } = require('./helpers');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const fn = (s, name) => s.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'))[0];

test('ambil_had.py: ujian unit Python (kunci kawasan sama dengan klien, penapis had laju, kawasan, semakan jumlah)', t => {
  const r = spawnSync('python3', [path.join(ROOT, 'tests', 'py', 'test_ambil_had.py')], { encoding: 'utf8' });
  if (r.error) return t.skip('python3 tiada');
  assert.strictEqual(r.status, 0, r.stderr);
});

test('ambil_poi.py: ujian unit Python (kategori sama dengan klien, tajuk/sub, kawasan, semakan jumlah)', t => {
  const r = spawnSync('python3', [path.join(ROOT, 'tests', 'py', 'test_ambil_poi.py')], { encoding: 'utf8' });
  if (r.error) return t.skip('python3 tiada');
  assert.strictEqual(r.status, 0, r.stderr);
});

for (const file of ['Index.html', 'IndexUji.html']) {
test(`${file}: tempat dibaca dari fail statik dahulu (poiElements, loadPoi, orNull); kategori Python sepadan dengan ALONG_Q klien`, async () => {
  const s = clientScript(file);
  assert.match(s, /POI_URL = 'https:\\\/\\\/s-k84\.github\.io\/MY-PROJECT\/data\/poi\/'/);
  assert.match(s, /let list = await orNull\(poiAlong\(cat, pts\), 4000\)/);
  assert.match(s, /orNull\(poiNear\(cat, me\), 4000\) \|\| await call\('nearbyPlaces'/);
  // kategori: klien ALONG_Q dan skrip Python mesti ada kunci yang sama
  const clientCats = Object.keys(new Function('return ' + s.match(/const ALONG_Q = (\{[\s\S]*?\n\});?/)[0].replace('const ALONG_Q = ', '').replace(/;\s*$/, ''))());
  const py = fs.readFileSync(path.join(ROOT, 'scripts', 'ambil_poi.py'), 'utf8');
  clientCats.forEach(c => assert.ok(py.includes("'" + c + "'"), 'kategori ' + c + ' tiada dalam ambil_poi.py'));
  // fungsi
  const ctx = { window: { fetch: true }, Date, Promise, setTimeout, ALONG_Q: { fuel: ['', 300, 'x'] }, POI_URL: 'u/' };
  const seen = [];
  ctx.fetch = u => { seen.push(u); return Promise.resolve(/indeks/.test(u)
    ? { ok: true, json: async () => ({ k: { fuel: ['12_406', '99_99'] } }) }
    : { ok: true, json: async () => ({ p: [[3.15, 101.7, 'A', 's'], [9, 9, 'Jauh', '']] }) }); };
  const f = n => fn(s, n);
  vm.runInNewContext('let poiIdxP = null, poiIdxFailAt = 0; const poiTiles = {};' + f('fetchJson') + f('loadPoiIndex') + f('poiElements') + (/function poiTilesFor/.test(s) ? f('poiTilesFor') : '') + f('loadPoi') + f('hadKeys') +
    'const orNull = (p, ms) => Promise.race([p.catch(() => null), new Promise(r => setTimeout(() => r(null), ms))]);this.l = loadPoi; this.o = orNull;', ctx);
  const out = await ctx.l('fuel', ['3.099,101.699,3.202,101.702']);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(out)), [{ title: 'A', sub: 's', lat: 3.15, lng: 101.7 }]);
  assert.ok(seen.includes('u/fuel/12_406.json') && !seen.some(x => /99_99/.test(x)), seen.join());
  assert.strictEqual(await ctx.l('atm', ['3.099,101.699,3.202,101.702']), null);          // kategori tiada dalam indeks → sandaran
  assert.strictEqual(await ctx.o(new Promise(() => {}), 20), null);                        // tidak menjawab → null selepas had masa
});
}

test('semua fail workflow GitHub ialah YAML yang sah (tugas tidak gagal serta-merta tanpa log)', t => {
  const r = spawnSync('python3', [path.join(ROOT, 'tests', 'py', 'test_workflows.py')], { encoding: 'utf8' });
  if (r.error) return t.skip('python3 tiada');
  assert.strictEqual(r.status, 0, r.stderr);
});

test('klien: parseMaxspeed sama dengan skrip pengambil (nilai rujukan dikongsi dengan ujian Python)', () => {
  const s = clientScript('Index.html'), ctx = {};
  vm.runInNewContext(fn(s, 'parseMaxspeed') + ';this.f = parseMaxspeed;', ctx);
  const ref = { '90': 90, '60 mph': 97, '140': 140, 'walk': 0, '': 0, '30': 30 };
  Object.keys(ref).forEach(v => assert.strictEqual(ctx.f(v), ref[v], v));   // klien tidak menapis > 130 di sini; speedIntervals yang menapis
});

test('had-bulanan.yml: berjadual bulanan, hanya menyimpan docs/data/had', () => {
  const y = fs.readFileSync(path.join(ROOT, '.github/workflows/had-bulanan.yml'), 'utf8');
  assert.match(y, /cron: '\d+ \d+ \d+ \* \*'/);
  assert.match(y, /workflow_dispatch/);
  assert.match(y, /git add -A docs\/data\/had/);
  assert.match(y, /timeout-minutes: \d+/);
  assert.match(y, /download\.geofabrik\.de\/asia\/malaysia-singapore-brunei-latest\.osm\.pbf/);
  assert.ok(!/overpass/i.test(y.replace(/^#.*$/gm, '')), 'tugas bulanan tidak lagi menggunakan Overpass');
  assert.ok(!/git add (-A|\.)\s*$/m.test(y));
});

for (const file of ['Index.html', 'IndexUji.html']) {
test(`${file}: had laju dibaca dari fail statik dahulu, Overpass sandaran; hadKeys & hadElements betul`, () => {
  const s = clientScript(file);
  assert.match(s, /HAD_URL = 'https:\\\/\\\/s-k84\.github\.io\/MY-PROJECT\/data\/had\/'/);
  assert.match(s, /loadHad\(bx\)\.then\(els => els \? \{ elements: els \} : overpassRaw\(qW/);
  const ctx = {};
  vm.runInNewContext(fn(s, 'hadKeys') + fn(s, 'hadElements') + ';this.k = hadKeys; this.e = hadElements;', ctx);
  // kotak merentas sempadan kawasan 0.25° (lat 3.5, lng 101.5)
  assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.k(['3.499,101.499,3.502,101.502']))).sort(), ['13_405', '13_406', '14_405', '14_406']);
  const tiles = [{ w: [[90, [3.1, 101.7, 3.2, 101.7]], [50, [4.9, 100.1, 4.95, 100.1]]] }, null];
  const els = ctx.e(tiles, ['3.099,101.699,3.102,101.702']);
  assert.strictEqual(els.length, 1);
  assert.strictEqual(els[0].tags.maxspeed, '90');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(els[0].geometry)), [{ lat: 3.1, lon: 101.7 }, { lat: 3.2, lon: 101.7 }]);
});
}

test('tugas bulanan (titik & had/tempat): buka isu bila gagal, dan boleh diuji dengan input ujian_gagal', () => {
  ['titik-bulanan.yml', 'had-bulanan.yml'].forEach(f => {
    const y = fs.readFileSync(path.join(ROOT, '.github/workflows', f), 'utf8');
    assert.match(y, /issues: write/, f);
    assert.match(y, /ujian_gagal:/, f);
    assert.match(y, /if: \$\{\{ github\.event\.inputs\.ujian_gagal == 'true' \}\}\n\s+run: exit 1/, f);
    assert.match(y, /Buka isu jika gagal\n\s+if: failure\(\)[\s\S]*gh issue create/, f);
    assert.ok(!/\$\{\{\s*github\.event\.(issue|pull_request|comment)/.test(y), 'input tidak dipercayai dalam run: ' + f);
  });
});
