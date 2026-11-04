const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers');

/** doGet dengan HtmlService olok-olok: pulangkan nama fail templat yang dihidangkan & versi yang disuntik. */
function serve(params, isOwner) {
  let served = null;
  const env = loadCode({
    HtmlService: { createTemplateFromFile: name => {
      const t = { evaluate() { served = { file: name, version: JSON.parse(t.versionJson) }; return out; } };
      const out = { setTitle: () => out, addMetaTag: () => out };
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
