// Ambil lampu isyarat & kamera laju seluruh Malaysia dari Overpass (OpenStreetMap) dan simpan sebagai fail statik
// docs/data/titik.json (dihidang oleh GitHub Pages). Dijalankan sebulan sekali oleh .github/workflows/titik-bulanan.yml.
// Aplikasi membaca fail ini dahulu; Overpass dari telefon hanya sandaran (pelayan percuma itu tidak boleh diharap).
// Format: { v: 1, t: 'YYYY-MM-DD', c: [[lat, lng, id], ...] (kamera), s: [[lat, lng, id], ...] (lampu isyarat) }
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'docs', 'data', 'titik.json');
const SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const QUERY = tag => `[out:json][timeout:300];area["ISO3166-1"="MY"][admin_level=2]->.my;node["highway"="${tag}"](area.my);out skel qt;`;
// Kurang daripada 60% bilangan lama dianggap data rosak (Overpass kadang-kadang memulangkan jawapan separa)
const MIN_RATIO = 0.6;

/** Elemen Overpass -> [[lat, lng, id]] (5 titik perpuluhan ≈ 1 m, tersusun mengikut id, tanpa pendua / koordinat rosak). */
function compact(elements) {
  const seen = new Set(), out = [];
  (elements || []).forEach(e => {
    const lat = Number(e && e.lat), lng = Number(e && e.lon), id = Number(e && e.id);
    if (!e || e.type !== 'node' || !isFinite(lat) || !isFinite(lng) || !isFinite(id) || seen.has(id)) return;
    if (lat < -1 || lat > 8 || lng < 98 || lng > 120) return;      // di luar Malaysia (kotak kasar)
    seen.add(id);
    out.push([Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5, id]);
  });
  return out.sort((a, b) => a[2] - b[2]);
}

/** Terima data baharu hanya jika tidak kosong dan tidak susut mendadak berbanding fail lama. Pulangkan mesej ralat atau ''. */
function checkAgainst(prev, next) {
  if (!next.c.length || !next.s.length) return 'data kosong';
  const bad = (k, label) => prev && Array.isArray(prev[k]) && prev[k].length && next[k].length < prev[k].length * MIN_RATIO
    ? `${label} susut daripada ${prev[k].length} kepada ${next[k].length}` : '';
  return bad('c', 'kamera') || bad('s', 'lampu isyarat');
}

async function query(tag) {
  let last;
  for (let round = 0; round < 3; round++) {
    for (const url of SERVERS) {
      try {
        const res = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(QUERY(tag)),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'JomRoute-data-bulanan' },
          signal: AbortSignal.timeout(330000) });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const j = await res.json();
        if (j.remark && /error|timed out|out of memory/i.test(j.remark)) throw new Error(j.remark);
        return j.elements || [];
      } catch (e) { last = e; console.error(`${tag}: ${url.split('/')[2]} gagal (${e.message})`); }
    }
    await new Promise(r => setTimeout(r, 30000 * (round + 1)));
  }
  throw new Error('Semua pelayan Overpass gagal untuk ' + tag + ': ' + (last && last.message));
}

async function main() {
  const next = { v: 1, t: new Date().toISOString().slice(0, 10) };
  next.c = compact(await query('speed_camera'));
  next.s = compact(await query('traffic_signals'));
  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { /* belum ada */ }
  const err = checkAgainst(prev, next);
  if (err) throw new Error('Data baharu ditolak: ' + err);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(next) + '\n');
  console.log(`Disimpan: ${next.c.length} kamera, ${next.s.length} lampu isyarat (${next.t})`);
}

module.exports = { compact, checkAgainst };
if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
