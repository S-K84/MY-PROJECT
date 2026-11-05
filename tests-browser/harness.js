// Pembantu ujian pelayar: hidangkan Index.html / IndexUji.html secara setempat dengan Leaflet dari node_modules dan
// servis Apps Script (google.script.run) olok-olok, kemudian buka dalam Chromium (Playwright). Tiada rangkaian luar.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');

function enc(v) {
  v = Math.round(v * 1e5); v = v < 0 ? ~(v << 1) : v << 1;
  let o = ''; while (v >= 0x20) { o += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; }
  return o + String.fromCharCode(v + 63);
}
function polyline(pts) {
  let s = '', pl = 0, pg = 0;
  pts.forEach(([la, lg]) => { s += enc(la - pl) + enc(lg - pg); pl = la; pg = lg; });
  return s;
}

// Laluan ujian: ~11 km lurus ke utara di KL
const ROUTE = {
  summary: 'Jalan Ujian', polyline: polyline(Array.from({ length: 101 }, (_, i) => [3.1 + i * 0.001, 101.7])),
  distanceM: 11100, distanceText: '11.1 km', durationSec: 600, durationText: '10 min', delaySec: 60,
  steps: [
    { text: 'Terus ke utara', road: 'Jalan Ujian', exit: '', distText: '5 km', distM: 5000, lat: 3.1, lng: 101.7, maneuver: '' },
    { text: 'Belok kanan', road: 'Jalan Dua', exit: '', distText: '6 km', distM: 6000, lat: 3.145, lng: 101.7, maneuver: 'turn-right' },
    { text: 'Destinasi', road: 'Destinasi', exit: '', distText: '0 m', distM: 0, lat: 3.2, lng: 101.7, maneuver: '' }]
};
const TYPES = { POLIS: ['Polis', '👮', 60], KEMALANGAN: ['Kemalangan', '💥', 90], SESAK: ['Kesesakan', '🚗', 45],
  BAHAYA: ['Bahaya', '⚠️', 120], KAMERA: ['Kamera AES', '📷', 43200], KERJA_JALAN: ['Kerja Jalan', '🚧', 4320] };

function buildPage(file) {
  let s = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const types = {};
  Object.keys(TYPES).forEach(k => { types[k] = { label: TYPES[k][0], icon: TYPES[k][1], ttlMin: TYPES[k][2] }; });
  const ver = file === 'IndexUji.html' ? '"ujian (uji)"' : '"ujian"';
  [['<?!= typesJson ?>', JSON.stringify(types)], ['<?!= initialJson ?>', 'null'], ['<?!= appUrlJson ?>', '"https://jalankita.example/exec"'],
    ['<?!= trackJson ?>', 'null'], ['<?!= versionJson ?>', ver]].forEach(([a, b]) => { s = s.split(a).join(b); });
  s = s.split('https:\\/\\/unpkg.com/leaflet@1.9.4/dist/').join('/leaflet/')
    .split('https://unpkg.com/leaflet@1.9.4/dist/').join('/leaflet/')
    .split('https:\\/\\/unpkg.com/leaflet-rotate@0.2.8/dist/').join('/rotate/')
    .split('https://unpkg.com/leaflet-rotate@0.2.8/dist/').join('/rotate/');
  s = s.replace(/ integrity="[^"]*"/g, '');
  const stub = `<script>
window.__route = ${JSON.stringify(ROUTE)}; window.__reports = []; window.__users = []; window.__calls = [];
window.__resp = function (fn, args) {
  if (window.__override && fn in window.__override) return window.__override[fn](args);
  return { getSession: { token: 'g_ujian12345.sig' }, loadPrefs: { t: 1, name: 'Ali', settings: {} },
    getLiveData: { reports: __reports.map(r => Object.assign({ time: Date.now() - 60000 }, r)), users: __users, v: 'ujian' },
    getRoute: [JSON.parse(JSON.stringify(__route))], submitReports: { ok: true, ids: ['abcdef12-0001'], merged: 0 },
    getProfile: { points: 0, reports: 0, upReceived: 0, joined: Date.now() } }[fn];
};
window.google = { script: { get run() { let ok = null, bad = null; const px = new Proxy({}, { get(t, p) {
  if (p === 'withSuccessHandler') return f => { ok = f; return px; };
  if (p === 'withFailureHandler') return f => { bad = f; return px; };
  return (...a) => { __calls.push(p); setTimeout(() => { let r; try { r = __resp(p, a); } catch (e) { return bad && bad(e); }
    ok && ok(r === undefined ? { ok: true } : r); }, 2); }; } }); return px; } } };
</script>`;
  return s.replace('<head>', '<head>' + stub);
}

function serve() {
  const pages = {};
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    const send = (type, body) => { res.writeHead(200, { 'Content-Type': type }); res.end(body); };
    if (u.startsWith('/page/')) return send('text/html; charset=utf-8', pages[u.slice(6)] || (pages[u.slice(6)] = buildPage(u.slice(6))));
    const map = [['/leaflet/', 'node_modules/leaflet/dist/'], ['/rotate/', 'node_modules/leaflet-rotate/dist/']];
    for (const [pre, dir] of map) {
      if (u.startsWith(pre)) {
        const f = path.join(ROOT, dir, path.basename(u));
        if (fs.existsSync(f)) return send(f.endsWith('.css') ? 'text/css' : 'application/javascript', fs.readFileSync(f));
      }
    }
    res.writeHead(404); res.end();
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

/** Buka halaman; pulangkan { page, errors, close }. Permintaan ke luar 127.0.0.1 disekat (kecuali yang diolok dalam ujian). */
// Jubin PNG 1×1 (untuk ujian simpanan jubin peta).
const TILE_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

/** extra.tiles: layan jubin OSM palsu (dengan CORS) & kira permintaan dalam tiles.requests. */
async function open(file, opts, extra) {
  const server = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage(Object.assign({ viewport: { width: 390, height: 844 } }, opts || {}));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => (/^http:\/\/127\.0\.0\.1/.test(r.request().url()) ? r.continue() : r.abort()));
  // Cadangan perjalanan bergantung pada jam (petang hari kerja → kad "Pulang ke rumah?"), jadi dimatikan secara lalai
  // supaya ujian lain tidak bergantung pada masa CI. Ujian cadangan perjalanan menghidupkannya sendiri.
  await page.addInitScript(() => {
    try { if (!localStorage.getItem('jk_settings')) localStorage.setItem('jk_settings', JSON.stringify({ tripSuggest: false })); }
    catch (e) { /* tiada storan */ }
  });
  const tiles = { requests: [] };
  if (extra && extra.tiles) {
    await page.route(/^https:\/\/[abc]\.tile\.openstreetmap\.org\//, r => {
      tiles.requests.push(r.request().url());
      r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: TILE_PNG });
    });
  }
  await page.goto(`http://127.0.0.1:${server.address().port}/page/${file}`);
  await page.waitForFunction(() => window.__appStarted === true, null, { timeout: 15000 });
  return { page, errors, tiles, server, close: async () => { await browser.close(); server.close(); } };
}

module.exports = { open, ROUTE };
