const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT, clientScript } = require('./helpers');

test('skrip utama Index.html tiada ralat sintaks', () => {
  assert.doesNotThrow(() => new vm.Script(clientScript(), { filename: 'Index.html' }));
});

test('saluran uji: IndexUji.html (jika ada) tiada ralat sintaks dan dihantar oleh clasp', () => {
  if (!fs.existsSync(path.join(ROOT, 'IndexUji.html'))) return;
  assert.doesNotThrow(() => new vm.Script(clientScript('IndexUji.html'), { filename: 'IndexUji.html' }));
  assert.match(fs.readFileSync(path.join(ROOT, '.claspignore'), 'utf8'), /^!IndexUji\.html$/m);
});

test('versi ditulis di satu tempat sahaja (Code.gs) dan disuntik ke Index.html', () => {
  const code = fs.readFileSync(path.join(ROOT, 'Code.gs'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'Index.html'), 'utf8');
  assert.match(code, /^const APP_VERSION = '\d{4}\.\d{2}\.\d{2}-[a-z]';$/m);
  assert.match(code, /t\.versionJson = jsonForScript_\(APP_VERSION\b/);
  assert.ok(!/\d{4}\.\d{2}\.\d{2}-[a-z]/.test(html), 'Index.html masih ada versi yang ditulis terus');
  assert.strictEqual((html.match(/<\?!= versionJson \?>/g) || []).length, 2);
});

test('setiap jenis arahan suara yang digunakan ada keutamaan', () => {
  const s = clientScript();
  const prio = s.match(/const VOICE_PRIO = \{([^}]*)\}/)[1];
  const kinds = new Set([...s.matchAll(/speak\([^;]*?'([a-zA-Z]+)'\)/g)].map(m => m[1]));
  kinds.forEach(k => assert.ok(new RegExp('\\b' + k + ':').test(prio), 'tiada keutamaan untuk "' + k + '"'));
});

test('appsscript.json sah dan web app dikonfigurasi', () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'appsscript.json'), 'utf8'));
  assert.strictEqual(m.runtimeVersion, 'V8');
  assert.ok(m.webapp && m.webapp.executeAs && m.webapp.access);
});

test('saluran uji: MAIN_AT dalam diagnostik sama dengan baris <script> utama IndexUji.html', () => {
  const f = path.join(ROOT, 'IndexUji.html');
  if (!fs.existsSync(f)) return;
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  const m = lines.join('\n').match(/var MAIN_AT = (\d+),/);
  if (!m) return;
  assert.strictEqual(lines.lastIndexOf('<script>') + 1, Number(m[1]));
});

// Google Apps Script membuang komen JS sebelum menghantar halaman. Pembuang itu mudah keliru (sebahagian kod dianggap
// teks, dan sebaliknya); bila keliru, "//" dalam teks seperti 'https://maps…' dianggap komen dan baki baris dipadam →
// "SyntaxError: Unexpected EOF" di iPhone (PR #5). Peraturan: "//" dan "/*" hanya boleh muncul sebagai permulaan komen
// sebenar (didahului ruang atau awal baris). Dalam teks, tulis 'https:\/\/…'.
test('skrip dalam halaman: tiada "//" atau "/*" di dalam teks (selamat daripada pembuang komen Google)', () => {
  ['Index.html', 'IndexUji.html'].forEach(f => {
    if (!fs.existsSync(path.join(ROOT, f))) return;
    const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const bad = [];
    for (const m of h.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
      const start = h.slice(0, m.index).split('\n').length;
      m[1].split('\n').forEach((l, i) => {
        for (const x of l.matchAll(/\/\/|\/\*/g)) {
          if (x.index > 0 && !/\s/.test(l[x.index - 1])) bad.push(f + ':' + (start + i) + ': ' + l.trim().slice(0, 80));
        }
      });
    }
    assert.deepStrictEqual(bad, []);
  });
});

test('saluran uji: peta tidak berkelip semasa bergerak (tiada pudar jubin, jubin dimuat semasa bergerak)', () => {
  const f = path.join(ROOT, 'IndexUji.html');
  if (!fs.existsSync(f)) return;
  const s = clientScript('IndexUji.html');
  assert.match(s, /L\.map\('map', \{[^}]*fadeAnimation: false/);
  assert.match(s, /(?:L\.tileLayer|new CachedTiles)\([^)]*updateWhenIdle: false/);
});

test('saluran uji: garisan laluan & trafik dilukis pada Canvas (SVG berkelip di Safari iPhone semasa peta bergerak)', () => {
  const f = path.join(ROOT, 'IndexUji.html');
  if (!fs.existsSync(f)) return;
  const s = clientScript('IndexUji.html');
  assert.match(s, /const lineRenderer = L\.canvas\(/);
  const lines = [...s.matchAll(/L\.polyline\(([\s\S]*?)\)\.addTo\(map\)/g)].map(m => m[1])
    .filter(x => /routeLayers|JAM_COLOR|#33ccff/.test(x));
  assert.ok(lines.length >= 2, 'garisan laluan/trafik tidak dijumpai');
  lines.forEach(x => assert.match(x, /renderer: lineRenderer/));
});

test('Index.html: pembaikan kelipan (disahkan di iPhone melalui saluran uji) — jubin & garisan laluan', () => {
  const s = clientScript();
  assert.match(s, /L\.map\('map', \{[^}]*fadeAnimation: false/);
  assert.match(s, /(?:L\.tileLayer|new CachedTiles)\([^)]*updateWhenIdle: false/);
  assert.match(s, /const lineRenderer = L\.canvas\(/);
  assert.match(s, /function moveMeMarker\(/);
  assert.ok(!/reportLayer\.clearLayers\(\)/.test(s), 'pin laporan masih dicipta semula setiap kali');
});

test('saluran uji: had laju automatik — tafsir maxspeed & pilih selang pada laluan', () => {
  const s = clientScript('IndexUji.html');
  const vm = require('vm');
  const fn = name => s.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'))[0];
  const ctx = {};
  vm.runInNewContext(fn('parseMaxspeed') + fn('speedAt') + ';this.p = parseMaxspeed; this.at = speedAt;', ctx);
  assert.strictEqual(ctx.p('90'), 90);
  assert.strictEqual(ctx.p('110 km/h'), 110);
  assert.strictEqual(ctx.p('50 mph'), 80);
  assert.strictEqual(ctx.p('MY:urban'), 0);
  const iv = [{ s: 0, e: 5000, v: 90 }, { s: 1000, e: 1200, v: 60 }];
  assert.strictEqual(ctx.at(iv, 500), 90);
  assert.strictEqual(ctx.at(iv, 1100), 60);       // selang terpendek (jalan kecil di dalam) diutamakan
  assert.strictEqual(ctx.at(iv, 9000), 0);
  assert.match(s, /speedLimit: -1,/);              // lalai: Automatik untuk pengguna baharu
});

test('saluran uji: lapor satu tekan (Polis, Kemalangan, Sesak, Bahaya)', () => {
  const s = clientScript('IndexUji.html');
  assert.match(s, /const QUICK_TYPES = \['POLIS', 'KEMALANGAN', 'SESAK', 'BAHAYA'\]/);
  assert.match(s, /sendReport\(\[\{ type: k, desc: ''/);
});

test('saluran uji: jimat bateri — GPS ketepatan rendah & segar 60 s bila diam lama', () => {
  const s = clientScript('IndexUji.html');
  assert.match(s, /enableHighAccuracy: false/);
  assert.match(s, /if \(!isIdle\(\) \|\| Date\.now\(\) - \(state\.lastRefreshAt \|\| 0\) >= 60000\) refresh\(\)/);
});

test('saluran uji: kesesakan automatik dari pengguna lain (arah sama, ≥ 2 perlahan)', () => {
  const s = clientScript('IndexUji.html');
  assert.match(s, /function autoJams\(r, box\)/);
  assert.match(s, /autoJams\(r, box\)\.forEach\(x => raw\.push\(x\)\)/);
  assert.match(s, /sameDirection\(\{ heading: u\.dir \}/);
});

test('saluran uji: lokasi ikut getLiveData, tunda bila server sibuk, tawar muat semula versi baharu', () => {
  const s = clientScript('IndexUji.html');
  assert.ok(!/call\('updateLocation'/.test(s), 'lokasi masih dihantar dalam panggilan berasingan');
  assert.match(s, /call\('getLiveData', token, me\.lat, me\.lng, loc\)/);
  assert.match(s, /state\.liveBackoffUntil = Date\.now\(\) \+ state\.liveBackoff/);
  assert.match(s, /function checkVersion\(v\)/);
});

test('Index.html: ciri yang disahkan di jalan (had laju & kesesakan automatik, lapor pantas, jimat bateri, versi, Photon)', () => {
  const s = clientScript();
  assert.match(s, /function updateRoadLimit\(\)/);
  assert.match(s, /function autoJams\(r, box\)/);
  assert.match(s, /const QUICK_TYPES = /);
  assert.match(s, /enableHighAccuracy: false/);
  assert.match(s, /function checkVersion\(v\)/);
  assert.match(s, /function photonDirect\(/);
  assert.ok(!/call\('updateLocation'/.test(s));
});

test('popup laporan: butang "Padam laporan saya" untuk laporan sendiri (Index & IndexUji)', () => {
  ['Index.html', 'IndexUji.html'].forEach(f => {
    const s = clientScript(f);
    assert.match(s, /data-del-mine=/, f);
    assert.match(s, /call\('deleteMyReport', token, id\)/, f);
  });
});

test('saluran uji: kamera laju OSM, suara had laju baharu, batal lapor pantas, panduan skrin utama', () => {
  const s = clientScript('IndexUji.html');
  assert.match(s, /node\["highway"="speed_camera"\]/);
  assert.match(s, /function checkCameras\(along\)/);
  assert.match(s, /speak\(VOICE\[voiceLang\]\.limit\(/);
  assert.match(s, /yes: 'Batal', no: 'OK', ms: 6000/);
  assert.match(s, /homescreen: \(\) =>/);
  const vm = require('vm');
  const fn = name => s.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'))[0];
  const ctx = { locate: p => ({ off: Math.abs(p.lng - 101.7) * 111000, along: (p.lat - 3.1) * 111000 }) };
  vm.runInNewContext(fn('routeCameras') + ';this.f = routeCameras;', ctx);
  const cams = ctx.f({}, [
    { type: 'node', id: 1, lat: 3.11, lon: 101.7001, tags: { highway: 'speed_camera' } },     // di atas laluan
    { type: 'node', id: 2, lat: 3.12, lon: 101.705, tags: { highway: 'speed_camera' } },      // ~550 m dari laluan
    { type: 'way', id: 3, tags: { highway: 'primary', maxspeed: '90' }, geometry: [] }], 0, 1e9);
  assert.strictEqual(JSON.stringify(cams.map(c => c.id)), '["cam-1"]');
});

test('saluran uji: panduan skrin utama ditulis penuh dalam bahasa paparan (tidak bercampur BM/English)', () => {
  const s = clientScript('IndexUji.html');
  assert.match(s, /const en = voiceLang === 'en';/);
  assert.match(s, /'Tap the <b>Share<\/b> button/);
});

test('Index.html: kamera laju, suara had laju, batal lapor pantas, panduan skrin utama (disahkan di jalan)', () => {
  const s = clientScript();
  assert.match(s, /node\["highway"="speed_camera"\]/);
  assert.match(s, /function checkCameras\(along\)/);
  assert.match(s, /speak\(VOICE\[voiceLang\]\.limit\(/);
  assert.match(s, /yes: 'Batal', no: 'OK', ms: 6000/);
  assert.match(s, /const en = voiceLang === 'en';/);
});

test('saluran uji: kesesakan merah baharu di hadapan → semak laluan lain serta-merta, dengan anggaran lewat laporan', () => {
  const s = clientScript('IndexUji.html');
  assert.match(s, /const urgent = fresh\.length && Date\.now\(\) - state\.fasterAt >= 120000/);
  assert.match(s, /function jamPenalty\(r, along\)/);
  assert.match(s, /const leftNow = remainingSec\(cur\) \+ jamPenalty\(cur, along\)/);
});

test('saluran uji: waktu solat (anggaran JAKIM) munasabah untuk Kuala Lumpur', () => {
  const s = clientScript('IndexUji.html');
  const vm = require('vm');
  const fn = name => s.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'))[0];
  const ctx = {};
  vm.runInNewContext(fn('prayerTimes') + ';this.f = prayerTimes;', ctx);
  const t = ctx.f(new Date(2026, 10, 4), 3.139, 101.687);
  const hm = k => { const d = new Date(t[k].getTime() + 8 * 3600e3); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
  const near = (k, h, m) => assert.ok(Math.abs(hm(k) - (h * 60 + m)) <= 10, k + ' ' + hm(k));
  near('subuh', 5, 44); near('zohor', 12, 58); near('asar', 16, 14); near('maghrib', 18, 57); near('isyak', 20, 7);
});

test('saluran uji: hujan lebat di hadapan dikesan pada masa tiba (Open-Meteo)', () => {
  const s = clientScript('IndexUji.html');
  const vm = require('vm');
  const fn = name => s.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'))[0];
  const ctx = { RAIN_MM: 4, STORM_CODES: [95, 96, 99], HEAVY_CODES: [65, 82] };
  vm.runInNewContext(fn('rainAhead') + ';this.f = rainAhead;', ctx);
  const now = Date.UTC(2026, 10, 4, 6, 10);
  const hourly = (mm, code) => ({ hourly: { time: ['2026-11-04T06:00', '2026-11-04T07:00'], precipitation: mm, weather_code: code } });
  const pts = [{ d: 2000, eta: 0 }, { d: 12000, eta: 3600 }];
  assert.strictEqual(ctx.f(pts, [hourly([0, 0], [1, 1]), hourly([0.5, 0.5], [61, 61])], now), null);
  const hit = ctx.f(pts, [hourly([0, 0], [1, 1]), hourly([0, 7], [3, 63])], now);    // titik 2, jam ke-2 (tiba ~07:10)
  assert.strictEqual(hit.d, 12000);
  assert.strictEqual(ctx.f(pts, [hourly([0, 0], [95, 1]), hourly([0, 0], [1, 1])], now).storm, true);
});

test('saluran uji: peringatan rehat, kecemasan & saiz tulisan', () => {
  const s = clientScript('IndexUji.html');
  assert.match(s, /const REST_MS = 2 \* 3600000/);
  assert.match(s, /href="tel:999"/);
  assert.match(s, /function sosShare\(\)/);
  assert.match(s, /textSize: \[\['normal', 'Biasa'\], \['large', 'Besar'\]\]/);
  assert.match(s, /'https:\\\/\\\/api\.open-meteo\.com/);
});

test('saluran uji: kawalan peta (tulisan OpenStreetMap) ada lapisan GPU sendiri — tidak berkelip di iPhone', () => {
  const html = fs.readFileSync(path.join(ROOT, 'IndexUji.html'), 'utf8');
  assert.match(html, /\.leaflet-top, \.leaflet-bottom \{[^}]*transform:translateZ\(0\)/);
});

test('Index.html: ciri yang disahkan pemilik (tukar laluan bila kemalangan, rehat, hujan, solat, kecemasan, saiz tulisan, kos minyak, QR, tekan lama, kawalan peta)', () => {
  const s = clientScript();
  const html = fs.readFileSync(path.join(ROOT, 'Index.html'), 'utf8');
  ['function jamPenalty(', 'function checkRest(', 'function checkRain(', 'function prayerTimes(', 'function sosShare(',
    "textSize: [['normal', 'Biasa']", 'function fuelCost(', 'create-qr-code', 'function onLongPress('].forEach(k =>
    assert.ok(s.includes(k), 'tiada: ' + k));
  assert.match(html, /\.leaflet-top, \.leaflet-bottom \{[^}]*transform:translateZ\(0\)/);
  assert.match(html, /\.qr-box \{[^}]*box-sizing:content-box/);
});

for (const file of ['Index.html', 'IndexUji.html']) test(`${file}: peta malam dimalapkan, bukan diterbalikkan (invert menjadikan jalan hitam atas latar gelap)`, () => {
  const s = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const rule = s.match(/body\.dark-map(?::not\(\.dark-tiles\))? \.leaflet-tile-pane \{ filter:([^;]+);/);
  assert.ok(rule, 'peraturan penapis peta malam tiada');
  assert.doesNotMatch(rule[1], /invert/);
  const b = Number((rule[1].match(/brightness\(([\d.]+)\)/) || [])[1]);
  assert.ok(b > 0.4 && b < 0.9, 'peta malam mesti dimalapkan (brightness 0.4–0.9), dapat ' + b);
});

for (const file of ['Index.html', 'IndexUji.html']) test(`${file}: polish UI — butang menu bulat, butang lapor arang + kuning, maklum balas tekan & reduced-motion`, () => {
  const s = fs.readFileSync(path.join(ROOT, file), 'utf8');
  assert.match(s, /#btnMenu \{ border-radius:50%; \}/);
  assert.match(s, /--report-bg:#23262c; --report-fg:#ffd000;/);
  assert.match(s, /\.ctl:active \{ transform:translateZ\(0\) scale\(\.93\)/);   // kekal lapisan GPU (elak berkelip)
  assert.match(s, /@media \(prefers-reduced-motion: reduce\) \{\s*\.ctl, \.btn/);
});

for (const file of ['Index.html', 'IndexUji.html']) test(`${file}: identiti papan tanda jalan raya — banner hijau dengan bingkai putih, fon Overpass, tiada label huruf besar`, () => {
  const s = fs.readFileSync(path.join(ROOT, file), 'utf8');
  assert.match(s, /--sign-green:#00704a;/);
  assert.match(s, /--nav-bg:var\(--sign-green\)/);
  assert.match(s, /inset 0 0 0 8\.5px var\(--sign-white\)/);
  assert.match(s, /fonts\.googleapis\.com\/css2\?family=Overpass/);
  assert.match(s, /font-family:"JKDot", "Overpass", system-ui/);        // fon sistem sebagai sandaran
  assert.match(s, /font-family:"JKDot"; src:local\("Helvetica Neue"\)[^}]*unicode-range:U\+00B7;/);  // "·" dari fon sistem
  assert.doesNotMatch(s, /\.sec-title \{[^}]*text-transform:uppercase/);
});
