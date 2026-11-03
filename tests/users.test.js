const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers');

const KL = { lat: 3.139, lng: 101.687 };

function setup() {
  const env = loadCode();
  env.up = (id, lat, lng, extra) =>
    env.ctx.updateLocation(id, Object.assign({ lat, lng, name: id, speed: 57, mood: '😎' }, extra));
  env.seen = (me, p) => env.ctx.getActiveUsers_(me, p || KL).map(u => u.name).sort().join(',');
  return env;
}

test('pengguna dekat kelihatan; jauh dan diri sendiri tidak', () => {
  const { up, seen } = setup();
  up('g_A', KL.lat, KL.lng);
  up('g_B', 3.150, 101.700);
  up('g_C', 5.414, 100.329);                  // Pulau Pinang
  assert.strictEqual(seen('g_A'), 'g_B');
});

test('merentas sempadan sel: 14 km kelihatan, 16 km tidak', () => {
  const { up, seen } = setup();
  up('g_N14', KL.lat + 0.126, KL.lng);        // sel jiran
  up('g_N16', KL.lat + 0.144, KL.lng);
  assert.strictEqual(seen('g_A'), 'g_N14');
});

test('data awam dikaburkan: ~100 m, laju dibundarkan, tiada id atau arah', () => {
  const { ctx, up } = setup();
  up('g_B', 3.15012, 101.70033, { heading: 90 });
  const u = ctx.getActiveUsers_('g_A', KL)[0];
  assert.strictEqual(JSON.stringify(Object.keys(u).sort()), JSON.stringify(['lat', 'lng', 'mood', 'name', 'speed']));
  assert.strictEqual(u.lat, 3.15);
  assert.strictEqual(u.lng, 101.7);
  assert.strictEqual(u.speed, 60);
});

test('nama disanitasi dan mood luar senarai dibuang', () => {
  const { ctx, up } = setup();
  up('g_X', 3.141, 101.69, { name: '<b>=SUM(1)</b>' + 'x'.repeat(50), mood: 'jahat' });
  const u = ctx.getActiveUsers_('g_A', KL)[0];
  assert.ok(!/[<>]/.test(u.name) && u.name.length <= 30);
  assert.strictEqual(u.mood, '');
});

test('mod halimunan: hilang serta-merta walaupun masih dalam indeks sel', () => {
  const { ctx, up, seen } = setup();
  up('g_B', 3.150, 101.700);
  ctx.hideMe('g_B');
  assert.strictEqual(seen('g_A'), '');
});

test('bergerak ke sel lain: muncul sekali sahaja, di lokasi baharu', () => {
  const { ctx, up, clock } = setup();
  up('g_M', 3.19, 101.69);
  clock.now += 30000;
  up('g_M', 3.21, 101.69);
  const m = ctx.getActiveUsers_('g_A', KL).filter(x => x.name === 'g_M');
  assert.strictEqual(m.length, 1);
  assert.strictEqual(m[0].lat, 3.21);
});

test('tiada kemas kini lebih 180 s: hilang dari peta', () => {
  const { up, seen, clock } = setup();
  up('g_B', 3.150, 101.700);
  clock.now += 181000;
  assert.strictEqual(seen('g_A'), '');
});

test('indeks pentadbir u_all ditulis paling kerap sekali setiap 5 minit', () => {
  const { up, cache, clock } = setup();
  let writes = 0;
  const put = cache.put;
  cache.put = (k, ...a) => { if (k === 'u_all') writes++; return put(k, ...a); };
  for (let i = 0; i < 10; i++) { up('g_A', KL.lat, KL.lng); clock.now += 30000; }
  assert.strictEqual(writes, 1);
  assert.ok(JSON.parse(cache.get('u_all')).g_A);
});

test('1,600 pengguna dalam satu sel: nilai cache < 100 KB, respons maks 200', () => {
  const { ctx, up, cache } = setup();
  for (let i = 0; i < 1600; i++) {
    up('g_bulk' + String(i).padStart(14, '0'), KL.lat + (i % 40) * 0.001, KL.lng + Math.floor(i / 40) * 0.001);
  }
  assert.strictEqual(ctx.getActiveUsers_('g_Z', KL).length, 200);
  assert.ok(cache.maxValue < 100000, 'nilai terbesar ' + cache.maxValue);
});
