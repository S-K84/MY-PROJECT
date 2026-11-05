const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers');

/** doGet dengan HtmlService olok-olok: pulangkan nama fail templat yang dihidangkan & versi yang disuntik. */
let favicon = null;
function serve(params, isOwner) {
  let served = null;
  const env = loadCode({
    HtmlService: { createTemplateFromFile: name => {
      const t = { evaluate() { served = { file: name, version: JSON.parse(t.versionJson) }; return out; } };
      const out = { setTitle: () => out, addMetaTag: () => out, setFaviconUrl: u => { favicon = u; return out; } };
      return t;
    } },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/ujian/exec' }) }
  });
  env.session.email = isOwner ? env.session.owner : 'orang.lain@example.com';
  env.ctx.doGet({ parameter: params });
  return served;
}

test('pengguna biasa sentiasa mendapat Index.html', () => {
  assert.strictEqual(serve({}, false).file, 'Index');
  assert.strictEqual(serve({ uji: '1' }, false).file, 'Index');   // ?uji=1 diabaikan untuk bukan pemilik
});

test('pemilik dengan ?uji=1 mendapat IndexUji.html, versi ditanda (uji)', () => {
  const s = serve({ uji: '1' }, true);
  assert.strictEqual(s.file, 'IndexUji');
  assert.match(s.version, / \(uji\)$/);
  assert.strictEqual(serve({}, true).file, 'Index');
});

test('ikon aplikasi: URL tetap ke assets/icon-180.png dalam repo, dan fail ikon wujud (PNG 180×180)', () => {
  serve({}, false);
  assert.strictEqual(favicon, 'https://raw.githubusercontent.com/S-K84/MY-PROJECT/main/assets/icon-180.png');
  const fs = require('fs'), path = require('path');
  const b = fs.readFileSync(path.join(__dirname, '..', 'assets', 'icon-180.png'));
  assert.strictEqual(b.slice(1, 4).toString(), 'PNG');
  assert.strictEqual(b.readUInt32BE(16), 180);
  assert.strictEqual(b.readUInt32BE(20), 180);
});
