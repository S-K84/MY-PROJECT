const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers');

const idOf = t => String(t).split('.')[0];

/** Pengguna "Ali" dengan mata & data tersimpan; kemudian Google menukar kunci (ID) akaunnya. */
function setup() {
  const env = loadCode();
  env.ctx.verify_ = env.ctx.realVerify_;              // ujian ini memerlukan token sebenar (HMAC)
  env.stats = env.sheet('SHEET_STATS');
  env.prefs = env.sheet('SHEET_PREFS');
  env.login = key => { env.session.key = key; return env.ctx.getSession(env.oldToken || null); };
  env.session.key = 'kunci-lama';
  env.oldToken = env.ctx.getSession(null).token;
  env.oldId = idOf(env.oldToken);
  const day = 864e5;
  env.stats.appendRow([env.oldId, 'Ali', 3, 2, 1, new Date(env.clock.now - 200 * day), new Date(env.clock.now - day)]);   // 41 mata
  env.prefs.appendRow([env.oldId, '{"t":1,"name":"Ali"}', new Date(env.clock.now - day)]);
  return env;
}

test('ID bertukar: getSession menawarkan pindah (nama & mata sahaja, tiada alamat)', () => {
  const env = setup();
  const s = env.login('kunci-baharu');
  assert.notStrictEqual(idOf(s.token), env.oldId);
  assert.strictEqual(JSON.stringify(s.migrate), JSON.stringify({ name: 'Ali', points: 41 }));
});

test('pindah: mata & data pengguna dipindah ke ID baharu, ID lama tiada data lagi', () => {
  const env = setup();
  const s = env.login('kunci-baharu'), newId = idOf(s.token);
  const r = env.ctx.migrateData(s.token, env.oldToken);
  assert.strictEqual(r.points, 41);
  assert.strictEqual(JSON.stringify(env.stats.data().map(x => [x[0], x[2], x[3], x[4]])), JSON.stringify([[newId, 3, 2, 1]]));
  assert.strictEqual(JSON.stringify(env.prefs.data().map(x => x[0])), JSON.stringify([newId]));
});

test('pindah hanya sekali: token lama yang digunakan semula (cth. dicuri) tidak mendapat apa-apa', () => {
  const env = setup();
  const s = env.login('kunci-baharu');
  env.ctx.migrateData(s.token, env.oldToken);
  const thief = env.login('kunci-orang-lain');
  assert.strictEqual(thief.migrate, undefined);
  assert.throws(() => env.ctx.migrateData(thief.token, env.oldToken), /Tiada data untuk dipulihkan/);
});

test('pelayar dikongsi: akaun lain yang sudah ada mata tidak ditawarkan data orang lain', () => {
  const env = setup();
  env.session.key = 'kunci-B';                                 // pengguna B, akaun Google lain yang sudah aktif
  const idB = idOf(env.ctx.getSession(null).token);
  env.stats.appendRow([idB, 'Bob', 1, 0, 0, new Date(env.clock.now), new Date(env.clock.now)]);
  assert.strictEqual(env.login('kunci-B').migrate, undefined);
});

test('token palsu / ditukar: tiada tawaran, migrateData ditolak', () => {
  const env = setup();
  env.oldToken = env.oldId + '.tandatanganPalsu';
  const s = env.login('kunci-baharu');
  assert.strictEqual(s.migrate, undefined);
  assert.throws(() => env.ctx.migrateData(s.token, env.oldToken), /Token lama tidak sah/);
});

test('sekatan dipindah serta-merta (tanpa pengesahan): pengguna disekat tidak bebas selepas 30 hari', () => {
  const env = setup();
  env.props.BANNED = JSON.stringify([env.oldId]);
  const s = env.login('kunci-baharu');
  assert.ok(JSON.parse(env.props.BANNED).includes(idOf(s.token)));
  assert.throws(() => env.ctx.verify_(s.token), /disekat/);
});

test('ID baharu sudah ada baris statistik kosong: kiraan digabung, tarikh Sertai paling awal dikekalkan', () => {
  const env = setup();
  const s = env.login('kunci-baharu'), newId = idOf(s.token);
  env.stats.appendRow([newId, 'Ali', 0, 0, 0, new Date(env.clock.now), new Date(env.clock.now)]);
  env.ctx.migrateData(s.token, env.oldToken);
  const rows = env.stats.data();
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0][0], newId);
  assert.strictEqual(rows[0][2], 3);
  assert.strictEqual(new Date(rows[0][5]).getTime(), env.clock.now - 200 * 864e5);
});

test('kedua-dua ID ada data pengguna: yang paling baharu dikekalkan', () => {
  const env = setup();
  const s = env.login('kunci-baharu'), newId = idOf(s.token);
  env.prefs.appendRow([newId, '{"t":2,"name":"Lama di server"}', new Date(env.clock.now - 10 * 864e5)]);
  env.ctx.migrateData(s.token, env.oldToken);
  const rows = env.prefs.data();
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0][0], newId);
  assert.match(String(rows[0][1]), /"name":"Ali"/);
});

test('ID sama (tiada pertukaran): tiada tawaran', () => {
  const env = setup();
  assert.strictEqual(env.login('kunci-lama').migrate, undefined);
});
