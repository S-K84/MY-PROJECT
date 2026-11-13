// Ambil jalan ber-"maxspeed" (had laju) seluruh Malaysia dari Overpass (OpenStreetMap), kawasan demi kawasan (kotak 0.5° ≈ 55 km),
// dan simpan sebagai fail statik docs/data/had/<i>_<j>.json (dihidang oleh GitHub Pages) + docs/data/had/indeks.json.
// Dijalankan sebulan sekali oleh .github/workflows/had-bulanan.yml. Aplikasi memuat hanya kawasan di sekitar laluan (1–2 fail);
// Overpass dari telefon hanya sandaran. Penjelasan keputusan: CLAUDE.md ("Had laju jalan").
// Format kawasan: { v: 1, w: [[had_kmj, [lat1, lng1, lat2, lng2, ...]], ...] }   (semua bucu jalan dikekalkan: klien menyemak setiap bucu)
// Format indeks:  { v: 1, t: 'YYYY-MM-DD', k: ['5_203', ...] }                   (kawasan yang ada fail; kunci = lantai(lat*2)_lantai(lng*2))
'use strict';
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'docs', 'data', 'had');
const SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
// Kurang daripada 60% bilangan jalan lama dalam satu kawasan dianggap data rosak (jawapan separa) → fail lama dikekalkan
const MIN_RATIO = 0.6;

/** Kunci kawasan 0.5° bagi satu titik. */
const cellKey = (lat, lng) => Math.floor(lat * 2) + '_' + Math.floor(lng * 2);
/** Semua kawasan Semenanjung (lat 0.5–7.5, lng 99.5–105) dan Borneo (lat 0.5–7.5, lng 109.5–119.5): [i, j]. Laut antara keduanya dilangkau. */
function allCells() {
  const out = [];
  for (let i = 1; i <= 14; i++) {
    for (let j = 199; j <= 238; j++) if (j <= 209 || j >= 219) out.push([i, j]);
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

async function queryCell(i, j) {
  const b = [i / 2, j / 2, (i + 1) / 2, (j + 1) / 2].join(',');
  const q = `[out:json][timeout:180];way["highway"]["maxspeed"](${b});out tags geom;`;
  let last;
  for (let round = 0; round < 3; round++) {
    for (const url of SERVERS) {
      try {
        const res = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'JomRoute-data-bulanan' },
          signal: AbortSignal.timeout(240000) });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const j2 = await res.json();
        if (j2.remark && /error|timed out|out of memory/i.test(j2.remark)) throw new Error(j2.remark);
        return j2.elements || [];
      } catch (e) { last = e; }
    }
    await new Promise(r => setTimeout(r, 20000 * (round + 1)));
  }
  throw new Error(`kawasan ${i}_${j}: ${last && last.message}`);
}

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  const cells = allCells();
  let written = 0, kept = 0, failed = 0, bytes = 0;
  for (const [i, j] of cells) {
    const key = i + '_' + j, file = path.join(DIR, key + '.json');
    let prev = 0;
    try { prev = (JSON.parse(fs.readFileSync(file, 'utf8')).w || []).length; } catch (e) { /* belum ada */ }
    try {
      const ways = compactWays(await queryCell(i, j));
      const act = decide(prev, ways.length);
      if (act === 'tulis') { const s = JSON.stringify({ v: 1, w: ways }); fs.writeFileSync(file, s + '\n'); written++; bytes += s.length; }
      else if (act === 'kekal') { kept++; console.error(`${key}: ${ways.length} jalan (lama ${prev}) — fail lama dikekalkan`); }
    } catch (e) { failed++; console.error(e.message); }
    await new Promise(r => setTimeout(r, 1000));          // berlembut dengan pelayan percuma
  }
  const keys = fs.readdirSync(DIR).filter(f => /^\d+_\d+\.json$/.test(f)).map(f => f.replace('.json', '')).sort();
  if (!keys.length) throw new Error('Tiada kawasan berjaya diambil');
  if (failed > cells.length / 2) throw new Error(`Terlalu banyak kawasan gagal (${failed}/${cells.length})`);
  fs.writeFileSync(path.join(DIR, 'indeks.json'), JSON.stringify({ v: 1, t: new Date().toISOString().slice(0, 10), k: keys }) + '\n');
  console.log(`Selesai: ${written} kawasan ditulis (${(bytes / 1e6).toFixed(1)} MB), ${kept} dikekalkan, ${failed} gagal, ${keys.length} kawasan dalam indeks`);
}

module.exports = { cellKey, allCells, parseMaxspeed, compactWays, decide };
if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
