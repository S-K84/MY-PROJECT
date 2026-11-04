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
