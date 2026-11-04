const test = require('node:test');
const assert = require('node:assert');
const { loadCode, clientScript } = require('./helpers');

const pts = [[3.10, 101.70], [3.12, 101.70], [3.14, 101.70]];

test('alongRoute: bila Photon gagal, server TIDAK menunggu Overpass (lambat) — terus beri ralat supaya telefon cuba sendiri', () => {
  let overpassCalls = 0;
  const { ctx } = loadCode({ UrlFetchApp: {
    fetchAll: reqs => reqs.map(() => ({ getResponseCode: () => 503, getContentText: () => '' })),
    fetch: () => { overpassCalls++; return { getResponseCode: () => 200, getContentText: () => '{"elements":[]}' }; }
  } });
  assert.throws(() => ctx.alongRoute('u1', 'fuel', pts), /tidak tersedia sekarang/);
  assert.strictEqual(overpassCalls, 0);
});

test('alongRoute: Photon berjaya → hasil dipulangkan', () => {
  const body = JSON.stringify({ features: [{ properties: { osm_key: 'amenity', osm_value: 'fuel', name: 'Petronas' },
    geometry: { coordinates: [101.7001, 3.1101] } }] });
  const { ctx } = loadCode({ UrlFetchApp: {
    fetchAll: reqs => reqs.map(() => ({ getResponseCode: () => 200, getContentText: () => body })),
    fetch: () => { throw new Error('tidak sepatutnya dipanggil'); }
  } });
  const out = ctx.alongRoute('u1', 'fuel', pts);
  assert.ok(out.length >= 1 && /Petronas/.test(JSON.stringify(out)));
});

test('saluran uji: Overpass dari telefon ditanya serentak (bukan satu demi satu) & berlumba dengan server', () => {
  const s = clientScript('IndexUji.html');
  assert.ok(!/for \(let k = 0; k < OVERPASS\.length; k\+\+\)/.test(s), 'pelayan Overpass masih dicuba satu demi satu');
  assert.match(s, /const hedge = setTimeout\(startDirect, 5000\)/);
});

test('saluran uji: pertanyaan Overpass guna kotak kecil sepanjang laluan (bukan "around" 60 km yang tamat masa)', () => {
  const s = clientScript('IndexUji.html');
  const vm = require('vm');
  const ctx = {};
  vm.runInNewContext(s.match(/function alongQuery\(c, pts\) \{[\s\S]*?\n\}/)[0] + ';this.f = alongQuery;', ctx);
  const pts = Array.from({ length: 60 }, (_, i) => [3.1 + i * 0.009, 101.7 + i * 0.002]);
  const q = ctx.f(['["amenity"="fuel"]', 300, 'Stesen minyak'], pts);
  assert.ok(!/around:/.test(q));
  const boxes = q.match(/nw\["amenity"="fuel"\]\(([\d.,-]+)\);/g);
  assert.ok(boxes.length >= 14 && boxes.length <= 16, 'bilangan kotak: ' + boxes.length);
  // setiap titik laluan berada dalam sekurang-kurangnya satu kotak
  const bb = boxes.map(b => b.match(/\(([^)]*)\)/)[1].split(',').map(Number));
  pts.forEach(p => assert.ok(bb.some(b => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3])));
});

test('alongRoute: pemilik nampak kod HTTP Photon dalam ralat (siasatan); pengguna lain tidak', () => {
  const fx = { UrlFetchApp: { fetchAll: reqs => reqs.map(() => ({ getResponseCode: () => 403, getContentText: () => '' })) } };
  const a = loadCode(fx);
  assert.throws(() => a.ctx.alongRoute('u1', 'fuel', pts), e => !/Photon server/.test(e.message));
  const b = loadCode(fx);
  b.session.email = b.session.owner;
  assert.throws(() => b.ctx.alongRoute('u1', 'fuel', pts), /\[Photon server: HTTP 403×3\]/);
});

test('saluran uji: telefon juga cuba Photon terus (selain Overpass)', () => {
  const s = clientScript('IndexUji.html');
  assert.match(s, /function photonDirect\(/);
  assert.match(s, /direct = directAlong\(cat, pts, diag\)/);
});

test('Index.html: carian sepanjang laluan guna kotak kecil & berlumba dengan server (disahkan di iPhone, 2026.11.04-l)', () => {
  const s = clientScript();
  assert.match(s, /function alongQuery\(c, pts\)/);
  assert.match(s, /const hedge = setTimeout\(startDirect, 5000\)/);
  assert.ok(!/around:\$\{c\[1\]\}/.test(s));
});
