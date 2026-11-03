const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT, clientScript } = require('./helpers');

/** Muatkan kamus EN + fungsi tr() dari Index.html, dengan bahasa English dipilih. */
function loadTr() {
  const s = clientScript();
  const start = s.indexOf('const EN = {'), end = s.indexOf('const I18N_ATTRS');
  assert.ok(start >= 0 && end > start, 'bahagian terjemahan tidak dijumpai dalam Index.html');
  const ctx = vm.createContext({});
  vm.runInContext(s.slice(start, end) + '\nuiLang = "en";', ctx);
  return msg => vm.runInContext('tr(' + JSON.stringify(msg) + ')', ctx);
}

// Mesej yang hanya dilihat oleh pemilik dalam editor Apps Script, bukan pengguna aplikasi
const OWNER_ONLY = new Set(['Hanya pemilik skrip boleh menjalankan setup().']);

test('setiap mesej ralat server ada terjemahan English', () => {
  const tr = loadTr();
  const code = fs.readFileSync(path.join(ROOT, 'Code.gs'), 'utf8');
  const msgs = new Set([...code.matchAll(/new Error\('((?:[^'\\]|\\.)*)'\)/g)].map(m => m[1]));
  ['MAPS_QUOTA_MSG_'].forEach(c => {
    const m = code.match(new RegExp('const ' + c + " = '([^']*)'"));
    if (m) msgs.add(m[1]);
  });
  const missing = [...msgs].filter(m => !OWNER_ONLY.has(m) && tr(m) === m);
  assert.deepStrictEqual(missing, [], 'Tiada terjemahan untuk:\n  ' + missing.join('\n  '));
});

test('mesej dinamik & paparan biasa diterjemah', () => {
  const tr = loadTr();
  const cases = {
    'Lokasi anda dikesan 10779 km dari destinasi. Semak GPS atau matikan VPN.':
      'Your location was detected 10779 km from the destination. Check your GPS or turn off your VPN.',
    'Pilih 1 hingga 5 jenis laporan.': 'Choose 1 to 5 report types.',
    '🏠 Rumah disimpan.': '🏠 Home saved.',
    '💼 Kerja disimpan.': '💼 Work saved.',
    '➤ Arah ke Timur Laut': '➤ Heading Northeast',
    'oleh Ali': 'by Ali',
    'oleh Ali · baru sahaja · 👍1 👎0': 'by Ali · just now · 👍1 👎0',
    'Laporan ini sudah ada. 👍 anda ditambah. Terima kasih!': 'This report already exists. Your 👍 was added. Thank you!'
  };
  Object.keys(cases).forEach(ms => assert.strictEqual(tr(ms), cases[ms]));
});
