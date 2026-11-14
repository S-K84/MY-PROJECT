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

test('klien: parseMaxspeed sama dengan skrip pengambil (nilai rujukan dikongsi dengan ujian Python)', () => {
  const s = clientScript('IndexUji.html'), ctx = {};
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

test('saluran uji: had laju dibaca dari fail statik dahulu, Overpass sandaran; hadKeys & hadElements betul', () => {
  const s = clientScript('IndexUji.html');
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
