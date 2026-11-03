const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers');

test('penggunaan biasa (getLiveData setiap 15 s selama 6 jam) tidak pernah disekat', () => {
  const { ctx, clock } = loadCode();
  let fails = 0;
  for (let t = 0; t < 6 * 3600; t += 15) {
    clock.now = 1.8e12 + t * 1000;
    try { ctx.rateLimit_('live', 'g_user'); } catch (e) { fails++; }
  }
  assert.strictEqual(fails, 0);
});

test('penyalahguna masih disekat: 1,000 panggilan serentak, had 720', () => {
  const { ctx } = loadCode();
  let fails = 0;
  for (let i = 0; i < 1000; i++) { try { ctx.rateLimit_('live', 'g_spam'); } catch (e) { fails++; } }
  assert.strictEqual(fails, 280);
});

test('had global penuh: permintaan ditolak TANPA menghabiskan had pengguna', () => {
  const { ctx, cache } = loadCode();
  for (let i = 0; i < 1000; i++) ctx.rateLimit_('G_vote');
  assert.throws(() => ctx.rateLimitAll_([['vote', 'g_x'], ['G_vote']]), /Terlalu banyak permintaan/);
  assert.strictEqual(cache.get(ctx.rlKey_('vote', 'g_x')), null);
});

test('tetingkap baharu bermula dari kosong', () => {
  const { ctx, clock } = loadCode();
  for (let i = 0; i < 10; i++) ctx.rateLimit_('report', 'g_r');
  assert.throws(() => ctx.rateLimit_('report', 'g_r'), /Terlalu banyak/);
  clock.now += 3600 * 1000;
  assert.doesNotThrow(() => ctx.rateLimit_('report', 'g_r'));
});
