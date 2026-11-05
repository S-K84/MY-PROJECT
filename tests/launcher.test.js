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
  assert.strictEqual(m.name, 'Jalan Malaysia');
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

test('ikon Jalur Gemilang: kanton biru (kiri atas), jalur merah di bawah — sama dalam assets/ & docs/', () => {
  const zlib = require('zlib');
  // Nyahkod PNG RGB 8-bit (tanpa pakej): kumpul IDAT, inflate, buka penapis baris.
  const pixel = (file, x, y) => {
    const b = fs.readFileSync(file), w = b.readUInt32BE(16);
    const parts = []; let o = 8;
    while (o < b.length) { const n = b.readUInt32BE(o), t = b.toString('ascii', o + 4, o + 8);
      if (t === 'IDAT') parts.push(b.slice(o + 8, o + 8 + n)); o += 12 + n; }
    const raw = zlib.inflateSync(Buffer.concat(parts)), bpp = 3, stride = w * bpp;
    let prev = Buffer.alloc(stride), row;
    for (let r = 0; r <= y; r++) {
      const f = raw[r * (stride + 1)], src = raw.slice(r * (stride + 1) + 1, (r + 1) * (stride + 1));
      row = Buffer.alloc(stride);
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? row[i - bpp] : 0, up = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
        const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
        row[i] = (src[i] + [0, a, up, (a + up) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? up : c][f]) & 255;
      }
      prev = row;
    }
    return [...row.slice(x * bpp, x * bpp + 3)];
  };
  for (const d of ['assets', 'docs']) {
    const f = path.join(__dirname, '..', d, 'icon-180.png');
    const [r1, g1, b1] = pixel(f, 6, 60);     // kanton
    assert.ok(b1 > 80 && r1 < 30 && g1 < 30, `${d}: kanton biru ${[r1, g1, b1]}`);
    const [r2, g2, b2] = pixel(f, 170, 6);    // jalur merah teratas
    assert.ok(r2 > 180 && g2 < 30 && b2 < 30, `${d}: jalur merah ${[r2, g2, b2]}`);
  }
});

test('pembuka: ikon dibenam (data:) supaya tidak jadi tanda "?" bila halaman terus melompat', () => {
  const m = html.match(/<img src="data:image\/png;base64,([^"]+)"/);
  assert.ok(m, 'ikon mesti dibenam sebagai data: (bukan fail berasingan)');
  assert.ok(Buffer.from(m[1], 'base64').equals(fs.readFileSync(path.join(dir, 'icon-180.png'))), 'ikon dibenam mesti sama dengan icon-180.png');
});
