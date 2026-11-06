const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers');

test('tetapan di server menyimpan "Terkini" (maks 8, dibersihkan) — iPhone boleh membuang storan pelayar', () => {
  const { ctx } = loadCode();
  const recent = Array.from({ length: 10 }, (_, i) => ({ title: 'Tempat ' + i + '<b>', sub: 'x', lat: 3 + i / 100, lng: 101.7 }));
  recent.push({ title: 'Rosak', lat: 'abc', lng: 999 });
  ctx.savePrefs('g_A', JSON.stringify({ places: { home: null, work: null, favs: [], recent } }));
  const p = JSON.parse(JSON.stringify(ctx.loadPrefs('g_A')));
  assert.strictEqual(p.places.recent.length, 8);
  assert.strictEqual(p.places.recent[0].title, 'Tempat 0b');           // < > dibuang
  assert.ok(p.places.recent.every(r => Number.isFinite(r.lat) && Number.isFinite(r.lng)));
});
