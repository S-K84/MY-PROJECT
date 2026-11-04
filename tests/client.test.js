const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT, clientScript } = require('./helpers');

test('skrip utama Index.html tiada ralat sintaks', () => {
  assert.doesNotThrow(() => new vm.Script(clientScript(), { filename: 'Index.html' }));
});

test('saluran uji: IndexUji.html (jika ada) tiada ralat sintaks dan dihantar oleh clasp', () => {
  if (!fs.existsSync(path.join(ROOT, 'IndexUji.html'))) return;
  assert.doesNotThrow(() => new vm.Script(clientScript('IndexUji.html'), { filename: 'IndexUji.html' }));
  assert.match(fs.readFileSync(path.join(ROOT, '.claspignore'), 'utf8'), /^!IndexUji\.html$/m);
});

test('versi ditulis di satu tempat sahaja (Code.gs) dan disuntik ke Index.html', () => {
  const code = fs.readFileSync(path.join(ROOT, 'Code.gs'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'Index.html'), 'utf8');
  assert.match(code, /^const APP_VERSION = '\d{4}\.\d{2}\.\d{2}-[a-z]';$/m);
  assert.match(code, /t\.versionJson = jsonForScript_\(APP_VERSION\b/);
  assert.ok(!/\d{4}\.\d{2}\.\d{2}-[a-z]/.test(html), 'Index.html masih ada versi yang ditulis terus');
  assert.strictEqual((html.match(/<\?!= versionJson \?>/g) || []).length, 2);
});

test('setiap jenis arahan suara yang digunakan ada keutamaan', () => {
  const s = clientScript();
  const prio = s.match(/const VOICE_PRIO = \{([^}]*)\}/)[1];
  const kinds = new Set([...s.matchAll(/speak\([^;]*?'([a-zA-Z]+)'\)/g)].map(m => m[1]));
  kinds.forEach(k => assert.ok(new RegExp('\\b' + k + ':').test(prio), 'tiada keutamaan untuk "' + k + '"'));
});

test('appsscript.json sah dan web app dikonfigurasi', () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'appsscript.json'), 'utf8'));
  assert.strictEqual(m.runtimeVersion, 'V8');
  assert.ok(m.webapp && m.webapp.executeAs && m.webapp.access);
});
