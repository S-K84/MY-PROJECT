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

test('saluran uji: MAIN_AT dalam diagnostik sama dengan baris <script> utama IndexUji.html', () => {
  const f = path.join(ROOT, 'IndexUji.html');
  if (!fs.existsSync(f)) return;
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  const m = lines.join('\n').match(/var MAIN_AT = (\d+),/);
  if (!m) return;
  assert.strictEqual(lines.lastIndexOf('<script>') + 1, Number(m[1]));
});

// Google Apps Script membuang komen JS sebelum menghantar halaman. Pembuang itu mudah keliru (sebahagian kod dianggap
// teks, dan sebaliknya); bila keliru, "//" dalam teks seperti 'https://maps…' dianggap komen dan baki baris dipadam →
// "SyntaxError: Unexpected EOF" di iPhone (PR #5). Peraturan: "//" dan "/*" hanya boleh muncul sebagai permulaan komen
// sebenar (didahului ruang atau awal baris). Dalam teks, tulis 'https:\/\/…'.
test('skrip dalam halaman: tiada "//" atau "/*" di dalam teks (selamat daripada pembuang komen Google)', () => {
  ['Index.html', 'IndexUji.html'].forEach(f => {
    if (!fs.existsSync(path.join(ROOT, f))) return;
    const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const bad = [];
    for (const m of h.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
      const start = h.slice(0, m.index).split('\n').length;
      m[1].split('\n').forEach((l, i) => {
        for (const x of l.matchAll(/\/\/|\/\*/g)) {
          if (x.index > 0 && !/\s/.test(l[x.index - 1])) bad.push(f + ':' + (start + i) + ': ' + l.trim().slice(0, 80));
        }
      });
    }
    assert.deepStrictEqual(bad, []);
  });
});

test('saluran uji: peta tidak berkelip semasa bergerak (tiada pudar jubin, jubin dimuat semasa bergerak)', () => {
  const f = path.join(ROOT, 'IndexUji.html');
  if (!fs.existsSync(f)) return;
  const s = clientScript('IndexUji.html');
  assert.match(s, /L\.map\('map', \{[^}]*fadeAnimation: false/);
  assert.match(s, /L\.tileLayer\([^)]*updateWhenIdle: false/);
});

test('saluran uji: garisan laluan & trafik dilukis pada Canvas (SVG berkelip di Safari iPhone semasa peta bergerak)', () => {
  const f = path.join(ROOT, 'IndexUji.html');
  if (!fs.existsSync(f)) return;
  const s = clientScript('IndexUji.html');
  assert.match(s, /const lineRenderer = L\.canvas\(/);
  const lines = [...s.matchAll(/L\.polyline\(([\s\S]*?)\)\.addTo\(map\)/g)].map(m => m[1])
    .filter(x => /routeLayers|JAM_COLOR|#33ccff/.test(x));
  assert.ok(lines.length >= 2, 'garisan laluan/trafik tidak dijumpai');
  lines.forEach(x => assert.match(x, /renderer: lineRenderer/));
});

test('Index.html: pembaikan kelipan (disahkan di iPhone melalui saluran uji) — jubin & garisan laluan', () => {
  const s = clientScript();
  assert.match(s, /L\.map\('map', \{[^}]*fadeAnimation: false/);
  assert.match(s, /L\.tileLayer\([^)]*updateWhenIdle: false/);
  assert.match(s, /const lineRenderer = L\.canvas\(/);
  assert.match(s, /function moveMeMarker\(/);
  assert.ok(!/reportLayer\.clearLayers\(\)/.test(s), 'pin laporan masih dicipta semula setiap kali');
});

test('saluran uji: had laju automatik — tafsir maxspeed & pilih selang pada laluan', () => {
  const s = clientScript('IndexUji.html');
  const vm = require('vm');
  const fn = name => s.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'))[0];
  const ctx = {};
  vm.runInNewContext(fn('parseMaxspeed') + fn('speedAt') + ';this.p = parseMaxspeed; this.at = speedAt;', ctx);
  assert.strictEqual(ctx.p('90'), 90);
  assert.strictEqual(ctx.p('110 km/h'), 110);
  assert.strictEqual(ctx.p('50 mph'), 80);
  assert.strictEqual(ctx.p('MY:urban'), 0);
  const iv = [{ s: 0, e: 5000, v: 90 }, { s: 1000, e: 1200, v: 60 }];
  assert.strictEqual(ctx.at(iv, 500), 90);
  assert.strictEqual(ctx.at(iv, 1100), 60);       // selang terpendek (jalan kecil di dalam) diutamakan
  assert.strictEqual(ctx.at(iv, 9000), 0);
  assert.match(s, /speedLimit: -1,/);              // lalai: Automatik untuk pengguna baharu
});

test('saluran uji: lapor satu tekan (Polis, Kemalangan, Sesak, Bahaya)', () => {
  const s = clientScript('IndexUji.html');
  assert.match(s, /const QUICK_TYPES = \['POLIS', 'KEMALANGAN', 'SESAK', 'BAHAYA'\]/);
  assert.match(s, /sendReport\(\[\{ type: b\.dataset\.quick/);
});

test('saluran uji: jimat bateri — GPS ketepatan rendah & segar 60 s bila diam lama', () => {
  const s = clientScript('IndexUji.html');
  assert.match(s, /enableHighAccuracy: false/);
  assert.match(s, /if \(!isIdle\(\) \|\| Date\.now\(\) - \(state\.lastRefreshAt \|\| 0\) >= 60000\) refresh\(\)/);
});

test('saluran uji: kesesakan automatik dari pengguna lain (arah sama, ≥ 2 perlahan)', () => {
  const s = clientScript('IndexUji.html');
  assert.match(s, /function autoJams\(r, box\)/);
  assert.match(s, /autoJams\(r, box\)\.forEach\(x => raw\.push\(x\)\)/);
  assert.match(s, /sameDirection\(\{ heading: u\.dir \}/);
});
