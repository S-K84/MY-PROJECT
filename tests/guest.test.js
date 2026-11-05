const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers');

/** Pengguna tanpa log masuk Google (a_…) hanya MELIHAT: ID a_ boleh dicipta tanpa had, jadi tanpa sekatan ini seorang
 *  penyalahguna boleh menghabiskan had global bersama (laluan, laporan, carian) untuk semua pengguna. */
const P = { lat: 3.139, lng: 101.687 }, Q = { lat: 3.2, lng: 101.7 };
const MSG = /Log masuk akaun Google/;
const G = 'a_0123456789abcdef0123';

test('tetamu (a_) tidak boleh lapor, undi, cari, kira laluan, kongsi perjalanan atau cari sepanjang laluan', () => {
  const { ctx } = loadCode();
  const calls = {
    submitReports: () => ctx.submitReports(G, { lat: P.lat, lng: P.lng, name: 'x', items: [{ type: 'POLIS' }] }),
    submitReport: () => ctx.submitReport(G, { lat: P.lat, lng: P.lng, name: 'x', type: 'POLIS' }),
    voteReport: () => ctx.voteReport(G, '0123abcd', true),
    searchPlaces: () => ctx.searchPlaces(G, 'KLCC', P.lat, P.lng),
    resolveLocation: () => ctx.resolveLocation(G, 'https://maps.app.goo.gl/abc'),
    getRoute: () => ctx.getRoute(G, P, Q, {}),
    startShare: () => ctx.startShare(G, { minutes: 15 }),
    updateShare: () => ctx.updateShare(G, '0123456789abcdef0123456789abcdef', {}),
    alongRoute: () => ctx.alongRoute(G, 'fuel', [[P.lat, P.lng]]),
    nearbyPlaces: () => ctx.nearbyPlaces(G, 'fuel', P.lat, P.lng)
  };
  for (const [name, fn] of Object.entries(calls)) assert.throws(fn, MSG, name);
});

test('tetamu: fungsi latar senyap (tiada ralat, tiada kesan) — lokasi tidak dikongsi, tiada geocode, tetapan tidak disimpan', () => {
  const env = loadCode(), { ctx } = env;
  const J = v => JSON.stringify(v);
  assert.strictEqual(J(ctx.updateLocation(G, { lat: P.lat, lng: P.lng, speed: 30 })), J({ ok: false, guest: true }));
  ctx.getLiveData(G, P.lat, P.lng, { lat: P.lat, lng: P.lng, speed: 30 });
  assert.strictEqual(ctx.CacheService.getScriptCache().get('u_' + G), null, 'lokasi tetamu disimpan');
  assert.strictEqual(ctx.getActiveUsers_('g_LAIN', P).length, 0);
  assert.strictEqual(J(ctx.whereAmI(G, P.lat, P.lng)), J({ road: '' }));
  assert.strictEqual(J(ctx.savePrefs(G, '{}')), J({ ok: false, guest: true }));
});

test('pengguna log masuk Google (g_) tidak terjejas', () => {
  const env = loadCode(), { ctx } = env;
  const r = ctx.submitReports('g_A', { lat: P.lat, lng: P.lng, name: 'A', items: [{ type: 'POLIS' }] });
  assert.ok(r);
  assert.notStrictEqual(JSON.stringify(ctx.savePrefs('g_A', '{}')), JSON.stringify({ ok: false, guest: true }));
  ctx.updateLocation('g_B', { lat: P.lat, lng: P.lng, speed: 30 });
  assert.notStrictEqual(ctx.CacheService.getScriptCache().get('u_g_B'), null, 'lokasi pengguna Google tidak disimpan');
});
