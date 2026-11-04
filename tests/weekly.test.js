const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers');

/** Hamparan sandaran olok-olok: helaian bernama, getSheets/deleteSheet/getUrl. */
function fakeBook() {
  const sheets = [{ name: 'Sheet1' }];
  const mk = n => { const o = { name: n, getName: () => o.name, setName: x => { o.name = x; return o; } }; return o; };
  sheets[0] = mk('Sheet1');
  return {
    sheets, mk,
    getId: () => 'bk', getUrl: () => 'https://docs.google.com/spreadsheets/d/bk',
    getSheets: () => sheets.slice(),
    getSheetByName: n => sheets.find(s => s.name === n) || null,
    deleteSheet: s => { const i = sheets.indexOf(s); if (i >= 0) sheets.splice(i, 1); }
  };
}

function setup() {
  const mails = [];
  const env = loadCode({ MailApp: { sendEmail: o => mails.push(o) } });
  const bk = fakeBook();
  const main = { getSheetByName: n => env.sheets[n] || null };
  Object.values(env.sheets).forEach(sh => { sh.copyTo = dest => { const c = dest.mk('Copy of'); dest.sheets.push(c); return c; }; });
  env.ctx.SpreadsheetApp = { openById: id => (id === 'bk' ? bk : main), create: () => bk };
  env.session.email = env.session.owner;
  return Object.assign(env, { mails, bk });
}

test('weeklyReportNow: e-mel ringkasan kepada pemilik + sandaran helaian data', () => {
  const env = setup();
  env.ctx.submitReports('g_A1234567', { lat: 3.14, lng: 101.69, name: 'Ali', items: [{ type: 'POLIS', desc: '' }] });
  env.clock.now += 864e5;                                    // ringkasan = 7 hari lepas, tidak termasuk hari ini
  const r = env.ctx.weeklyReportNow();
  assert.strictEqual(env.mails.length, 1);
  assert.strictEqual(env.mails[0].to, env.session.owner);
  assert.match(env.mails[0].htmlBody, /Laporan baharu<\/td><td><b>1</);
  assert.match(env.mails[0].htmlBody, /Pengguna aktif<\/td><td><b>1</);
  assert.ok(r.backup && r.backup.url);
  const names = env.bk.sheets.map(s => s.name);
  assert.ok(!names.includes('Sheet1'));
  assert.strictEqual(names.length, 4);                       // Laporan, Statistik, DataPengguna, Kongsi
  assert.ok(names.every(n => / \d{4}-\d{2}-\d{2}$/.test(n)));
});

test('sandaran: hanya 4 minggu terakhir disimpan', () => {
  const env = setup();
  for (let w = 0; w < 6; w++) { env.ctx.weeklyReportNow(); env.clock.now += 7 * 864e5; }
  const tags = [...new Set(env.bk.sheets.map(s => s.name.slice(-10)))];
  assert.strictEqual(tags.length, 4);
});

test('weeklyTasks_: hanya Isnin selepas 8 pagi (waktu Malaysia), sekali sahaja', () => {
  const env = setup();
  // 2026-11-09 ialah hari Isnin. 07:30 MYT = 23:30 UTC hari sebelumnya.
  env.clock.now = Date.UTC(2026, 10, 8, 23, 30);
  assert.strictEqual(env.ctx.weeklyTasks_(false), null);
  env.clock.now = Date.UTC(2026, 10, 9, 1, 0);              // 09:00 MYT Isnin
  assert.ok(env.ctx.weeklyTasks_(false));
  assert.strictEqual(env.ctx.weeklyTasks_(false), null);    // kali kedua hari yang sama
  env.clock.now = Date.UTC(2026, 10, 10, 1, 0);             // Selasa
  assert.strictEqual(env.ctx.weeklyTasks_(false), null);
  assert.strictEqual(env.mails.length, 1);
});

test('weeklyReportNow: bukan pemilik ditolak', () => {
  const env = setup();
  env.session.email = 'orang@example.com';
  assert.throws(() => env.ctx.weeklyReportNow(), /Tidak dibenarkan/);
});
