const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');

/** Halaman pembuka GitHub Pages (docs/): ikon skrin utama iPhone + lompat terus ke aplikasi. */
const dir = path.join(__dirname, '..', 'docs');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');

test('pembuka: ada apple-touch-icon & manifest, dan fail ikon wujud (PNG)', () => {
  assert.match(html, /<link rel="apple-touch-icon" href="icon-180\.png">/);
  assert.match(html, /<link rel="manifest" href="manifest\.json">/);
  for (const f of ['icon-180.png', 'icon-512.png', 'icon-32.png']) {
    assert.strictEqual(fs.readFileSync(path.join(dir, f)).slice(1, 4).toString(), 'PNG', f);
  }
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.strictEqual(m.name, 'JalanKita');
});

test('pembuka: lompat ke /exec aplikasi, "#pasang" papar langkah tanpa lompat', () => {
  const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const run = (hash) => {
    const els = {}, el = id => (els[id] = els[id] || { style: {}, href: '' });
    let replaced = null, rewritten = null;
    new Function('document', 'location', 'history', js)(
      { getElementById: el },
      { hash, search: '?x=1', pathname: '/MY-PROJECT/', replace: u => { replaced = u; } },
      { replaceState: (a, b, u) => { rewritten = u; } });
    return { els, replaced, rewritten };
  };
  const a = run('');
  assert.match(a.replaced, /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec\?x=1$/);
  const b = run('#pasang');
  assert.strictEqual(b.replaced, null);
  assert.strictEqual(b.els.pasang.style.display, 'block');
  assert.strictEqual(b.rewritten, '/MY-PROJECT/?x=1');   // ikon yang ditambah tidak membawa "#pasang"
  assert.strictEqual(b.els.go.href, a.replaced);
});
