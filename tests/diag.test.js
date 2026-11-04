const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers');

test('saveDiag: bukan pemilik ditolak', () => {
  const { ctx } = loadCode();
  assert.throws(() => ctx.saveDiag(['x']), /Tidak dibenarkan/);
});

test('saveDiag: pemilik menyimpan teks dalam kepingan ≤ 40000 aksara, tanpa suntikan formula', () => {
  const { ctx, session, sheets } = loadCode();
  session.email = session.owner;
  const big = 'a'.repeat(90000);
  const n = ctx.saveDiag(['=HYPERLINK("x")', big]);
  assert.strictEqual(n, 4);
  const rows = sheets.Diagnostik.data();
  assert.strictEqual(rows.length, 4);
  assert.strictEqual(rows[0][3], '=HYPERLINK("x")');      // awalan ' dibuang oleh Sheets → teks biasa
  assert.strictEqual(rows.slice(1).map(r => r[3]).join(''), big);
  // Simpanan kedua menggantikan yang pertama
  ctx.saveDiag(['b']);
  assert.strictEqual(sheets.Diagnostik.data().length, 1);
});

test('saveDiag: data bukan senarai ditolak', () => {
  const { ctx, session } = loadCode();
  session.email = session.owner;
  assert.throws(() => ctx.saveDiag('x'), /Data tidak sah/);
});
