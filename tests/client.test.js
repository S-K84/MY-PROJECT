const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT, clientScript } = require('./helpers');

test('skrip utama Index.html tiada ralat sintaks', () => {
  assert.doesNotThrow(() => new vm.Script(clientScript(), { filename: 'Index.html' }));
});

test('versi sama dalam Code.gs dan Index.html', () => {
  const code = fs.readFileSync(path.join(ROOT, 'Code.gs'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'Index.html'), 'utf8');
  const v = (code.match(/Versi: (\S+)/) || [])[1];
  assert.ok(v, 'versi tidak dijumpai dalam Code.gs');
  assert.ok(html.includes("const APP_VERSION = '" + v + "'"), 'APP_VERSION dalam Index.html bukan ' + v);
  assert.ok(html.includes("'Versi: " + v + "\\n"), 'versi pengesan permulaan dalam Index.html bukan ' + v);
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
