// Ambil jalan ber-"maxspeed" (had laju) seluruh Malaysia dari Overpass (OpenStreetMap), kawasan demi kawasan (kotak 0.25° ≈ 28 km),
// dan simpan sebagai fail statik docs/data/had/<i>_<j>.json (dihidang oleh GitHub Pages) + docs/data/had/indeks.json.
// Dijalankan sebulan sekali oleh .github/workflows/had-bulanan.yml. Aplikasi memuat hanya kawasan di sekitar laluan (1–2 fail);
// Overpass dari telefon hanya sandaran. Penjelasan keputusan: CLAUDE.md ("Had laju jalan").
// Format kawasan: { v: 1, w: [[had_kmj, [lat1, lng1, lat2, lng2, ...]], ...] }   (semua bucu jalan dikekalkan: klien menyemak setiap bucu)
// Format indeks:  { v: 1, t: 'YYYY-MM-DD', k: ['12_406', ...] }                   (kawasan yang ada fail; kunci = lantai(lat*4)_lantai(lng*4))
'use strict';
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'docs', 'data', 'had');
const SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
// Kurang daripada 60% bilangan jalan lama dalam satu kawasan dianggap data rosak (jawapan separa) → fail lama dikekalkan
const MIN_RATIO = 0.6;

/** Kunci kawasan 0.5° bagi satu titik. */
const DIV = 4;                       // kawasan 1/DIV darjah (0.25°)
const cellKey = (lat, lng) => Math.floor(lat * DIV) + '_' + Math.floor(lng * DIV);
/** Semua kawasan Semenanjung (lat 0.5–7.5, lng 99.5–105) dan Borneo (lat 0.5–7.5, lng 109.5–119.5): [i, j]. Laut antara keduanya dilangkau. */
function allCells() {
  const out = [];
  for (let i = 2; i <= 29; i++) {
    for (let j = 398; j <= 477; j++) if (j <= 419 || j >= 438) out.push([i, j]);
  }
  return out;
}

/** "50", "60 mph" → km/j (0 = tidak sah / terlalu tinggi). Sama seperti parseMaxspeed() dalam klien. */
function parseMaxspeed(v) {
  const m = String(v || '').match(/^\s*(\d{2,3})\s*(mph)?/i);
  if (!m) return 0;
  const k = m[2] ? Math.round(Number(m[1]) * 1.609) : Number(m[1]);
  return k > 130 ? 0 : k;
}

/** Elemen Overpass (way + geometry + tags) -> [[had, [lat, lng, ...]]] (5 titik perpuluhan ≈ 1 m; tanpa pendua id / jalan tanpa had sah). */
function compactWays(elements) {
  const seen = new Set(), out = [];
  (elements || []).forEach(e => {
    if (!e || e.type !== 'way' || seen.has(e.id)) return;
    const v = parseMaxspeed(e.tags && e.tags.maxspeed), g = e.geometry;
    if (!v || !Array.isArray(g) || g.length < 2) return;
    const flat = [];
    for (const p of g) {
      const lat = Number(p && p.lat), lng = Number(p && p.lon);
      if (!isFinite(lat) || !isFinite(lng)) return;
      flat.push(Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5);
    }
    seen.add(e.id);
    out.push([v, flat, e.id]);
  });
  return out.sort((a, b) => a[2] - b[2]).map(w => [w[0], w[1]]);
}

/** Terima kawasan baharu atau tidak. prevCount = bilangan jalan fail lama (0 = tiada). Pulangkan 'tulis' | 'kekal' | 'langkau'. */
function decide(prevCount, nextCount) {
  if (!nextCount) return prevCount ? 'kekal' : 'langkau';
  if (prevCount && nextCount < prevCount * MIN_RATIO) return 'kekal';
  return 'tulis';
}

// Satu percubaan setiap pelayan (had masa 100 s). Dahulu 3 pusingan × 4 pelayan × 240 s: satu kawasan bermasalah boleh makan ~50 minit
// dan seluruh tugas dihentikan GitHub selepas 5½ jam tanpa menyimpan apa-apa (13 Nov 2026).
async function queryCell(i, j) {
  const b = [i / DIV, j / DIV, (i + 1) / DIV, (j + 1) / DIV].join(',');
  const q = `[out:json][timeout:90];way["highway"]["maxspeed"](${b});out tags geom;`;
  let last;
  for (const url of SERVERS) {
    try {
      const res = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'JomRoute-data-bulanan' },
        signal: AbortSignal.timeout(100000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j2 = await res.json();
      if (j2.remark && /error|timed out|out of memory/i.test(j2.remark)) throw new Error(j2.remark);
      return j2.elements || [];
    } catch (e) { last = e; }
  }
  throw new Error(last && last.message);
}

const DEADLINE_MS = 4.5 * 3600 * 1000;      // berhenti sendiri (dan simpan apa yang siap) sebelum had 5½ jam GitHub
const WORKERS = 2;                          // dua pertanyaan serentak sahaja: berlembut dengan pelayan percuma
const MAX_FAIL_RUN = 15;                    // 15 kawasan gagal berturut-turut = pelayan tidak boleh dicapai → berhenti

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  const t0 = Date.now(), has = c => fs.existsSync(path.join(DIR, c[0] + '_' + c[1] + '.json'));
  // Kawasan yang belum ada fail dahulu, supaya larian yang terhenti disambung (bukan diulang) pada larian seterusnya
  const cells = allCells().sort((a, b) => has(a) - has(b));
  const st = { done: 0, written: 0, kept: 0, failed: 0, bytes: 0, run: 0, stop: false };
  let next = 0;
  async function worker() {
    while (!st.stop && next < cells.length) {
      if (Date.now() - t0 > DEADLINE_MS) { st.stop = true; console.log('Had masa 4.5 jam: berhenti dan simpan apa yang siap'); break; }
      const [i, j] = cells[next++], key = i + '_' + j, file = path.join(DIR, key + '.json'), t1 = Date.now();
      let prev = 0;
      try { prev = (JSON.parse(fs.readFileSync(file, 'utf8')).w || []).length; } catch (e) { /* belum ada */ }
      try {
        const ways = compactWays(await queryCell(i, j)), act = decide(prev, ways.length);
        if (act === 'tulis') { const s = JSON.stringify({ v: 1, w: ways }); fs.writeFileSync(file, s + '\n'); st.written++; st.bytes += s.length; }
        else if (act === 'kekal') st.kept++;
        st.run = 0;
        console.log(`[${++st.done}/${cells.length}] ${key}: ${ways.length} jalan, ${act}, ${((Date.now() - t1) / 1000).toFixed(1)} s`);
      } catch (e) {
        st.failed++; st.done++;
        if (++st.run >= MAX_FAIL_RUN) st.stop = true;
        console.log(`[${st.done}/${cells.length}] ${key}: GAGAL (${e.message}), ${((Date.now() - t1) / 1000).toFixed(1)} s`);
      }
      await new Promise(r => setTimeout(r, 600));
    }
  }
  await Promise.all(Array.from({ length: WORKERS }, worker));
  const keys = fs.readdirSync(DIR).filter(f => /^\d+_\d+\.json$/.test(f)).map(f => f.replace('.json', '')).sort();
  if (keys.length) fs.writeFileSync(path.join(DIR, 'indeks.json'), JSON.stringify({ v: 1, t: new Date().toISOString().slice(0, 10), k: keys }) + '\n');
  console.log(`Selesai: ${st.written} kawasan ditulis (${(st.bytes / 1e6).toFixed(1)} MB), ${st.kept} dikekalkan, ${st.failed} gagal, ${keys.length} kawasan dalam indeks, ${((Date.now() - t0) / 60000).toFixed(0)} minit`);
  if (!keys.length) throw new Error('Tiada kawasan berjaya diambil');
  if (st.run >= MAX_FAIL_RUN) throw new Error('Pelayan Overpass tidak dapat dicapai (berhenti awal; kawasan yang siap disimpan)');
}

module.exports = { cellKey, allCells, parseMaxspeed, compactWays, decide };
if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
