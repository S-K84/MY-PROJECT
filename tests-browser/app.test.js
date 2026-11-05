// Ujian pelayar (Chromium) — dijalankan oleh CI pada setiap PR: npm run test:browser
// Nota: lulus di Chromium TIDAK menjamin Safari iPhone (lihat CLAUDE.md) — saluran uji masih perlu.
const test = require('node:test');
const assert = require('node:assert');
const { open } = require('./harness');

const FILES = ['Index.html', 'IndexUji.html'];
const wait = (page, ms) => page.waitForTimeout(ms);

/** Tetapkan lokasi, rancang laluan & mula navigasi. */
async function startNav(page) {
  await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    state.manualLoc = false;
    setMe({ lat: 3.1, lng: 101.7, heading: 0, speed: 0, t: Date.now() }); await w(50);
    planRoute({ title: 'Ujian', lat: 3.2, lng: 101.7 }); await w(300);
    startNav(); await w(100);
  });
}
/** Memandu ke utara: n bacaan GPS, satu sesaat (masa olok-olok). */
async function drive(page, n, speed) {
  await page.evaluate(async ([n, speed]) => {
    let t = Date.now();
    for (let i = 0; i < n; i++) {
      t += 1000;
      setMe({ lat: state.me.lat + 0.0003, lng: 101.7, heading: 0, speed, t, acc: 5 });
      await new Promise(r => setTimeout(r, 5));
    }
  }, [n, speed]);
}

for (const file of FILES) {
  test(`${file}: bermula tanpa ralat, dalam BM & English`, async () => {
    const { page, errors, close } = await open(file);
    try {
      assert.strictEqual(await page.evaluate(() => !!document.getElementById('fatal')), false);
      await page.evaluate(() => setVoiceLang('en'));
      await wait(page, 100);
      assert.match(await page.textContent('#home'), /Where to\?/);
      assert.deepStrictEqual(errors, []);
    } finally { await close(); }
  });

  test(`${file}: setiap halaman tetapan & pilihan dibuka tanpa ralat (BM & English)`, async () => {
    const { page, errors, close } = await open(file);
    try {
      const bad = await page.evaluate(async () => {
        const out = [];
        for (const lang of ['ms', 'en']) {
          setVoiceLang(lang);
          const ids = Object.keys(PAGES).concat(Object.keys(CHOICES).map(k => 'choice:' + k));
          for (const id of ids) {
            try { openSet(id); if (!$('setTitle').textContent.trim()) out.push(lang + ':' + id + ' tiada tajuk'); }
            catch (e) { out.push(lang + ':' + id + ' ' + e.message); }
          }
          closeSettings();
          openDrawer(); closeDrawer();
        }
        return out;
      });
      assert.deepStrictEqual(bad, []);
      assert.deepStrictEqual(errors, []);
    } finally { await close(); }
  });

  test(`${file}: navigasi — laluan pada Canvas, banner & panel dikemas kini`, async () => {
    const { page, errors, close } = await open(file);
    try {
      await startNav(page);
      await drive(page, 20, 60);
      const r = await page.evaluate(() => ({
        nav: state.navigating, canvas: state.routeLayers[0].options.renderer === lineRenderer,
        banner: $('navTop').textContent, left: $('navLeft').textContent
      }));
      assert.ok(r.nav && r.canvas);
      assert.match(r.banner, /Jalan Dua/);
      assert.match(r.left, /min/);
      await page.evaluate(() => cancelRoute());
      assert.deepStrictEqual(errors, []);
    } finally { await close(); }
  });

  test(`${file}: lapor pantas → dihantar, kemudian Batal memadam`, async () => {
    const { page, errors, close } = await open(file);
    try {
      await page.evaluate(async () => {
        setMe({ lat: 3.1, lng: 101.7, heading: 0, speed: 0, t: Date.now() });
        openReport(); await new Promise(r => setTimeout(r, 30));
        document.querySelector('[data-quick="POLIS"]').click();
      });
      await page.waitForFunction(() => $('askCard').style.display === 'block');
      await page.click('#askYes');
      await page.waitForFunction(() => __calls.includes('deleteMyReport'));
      assert.ok(await page.evaluate(() => __calls.includes('submitReports')));
      assert.deepStrictEqual(errors, []);
    } finally { await close(); }
  });

  test(`${file}: cari sepanjang laluan (server gagal → Overpass dari telefon)`, async () => {
    const { page, errors, close } = await open(file);
    try {
      await startNav(page);
      const text = await page.evaluate(async () => {
        window.__override = { alongRoute: () => { throw new Error('Carian sepanjang laluan tidak tersedia sekarang. Cuba lagi sebentar.'); } };
        window.fetch = url => (/overpass/.test(url)
          ? Promise.resolve({ ok: true, status: 200, json: async () => ({ elements: [{ lat: 3.15, lon: 101.7001, tags: { name: 'Petronas Ujian' } }] }) })
          : new Promise(() => {}));
        searchAlong('fuel');
        for (let i = 0; i < 100 && !/Petronas/.test($('alongList').textContent); i++) await new Promise(r => setTimeout(r, 50));
        return $('alongList').textContent;
      });
      assert.match(text, /Petronas Ujian/);
      assert.deepStrictEqual(errors, []);
    } finally { await close(); }
  });

  test(`${file}: had laju automatik & kamera laju dari OpenStreetMap`, async () => {
    const { page, errors, close } = await open(file);
    try {
      await page.evaluate(() => {
        window.__said = []; window.speak = t => __said.push(t);
        const line = (a, b, n) => Array.from({ length: n }, (_, i) => ({ lat: a[0] + (b[0] - a[0]) * i / (n - 1), lon: a[1] + (b[1] - a[1]) * i / (n - 1) }));
        window.fetch = () => Promise.resolve({ ok: true, status: 200, json: async () => ({ elements: [
          { type: 'way', tags: { highway: 'primary', maxspeed: '90' }, geometry: line([3.1, 101.7], [3.2, 101.7], 11) },
          { type: 'node', id: 7, lat: 3.13, lon: 101.7001, tags: { highway: 'speed_camera' } }] }) });
        S.speedLimit = -1;
        if (S.alertTypes.indexOf('KAMERA') < 0) S.alertTypes.push('KAMERA');
      });
      await startNav(page);
      await drive(page, 90, 100);              // kamera di 3.13 (~3.3 km); amaran ≤ 1 km sebelum
      const r = await page.evaluate(() => ({ sign: $('speedSign').textContent, over: $('speedo').classList.contains('over'), said: __said }));
      assert.strictEqual(r.sign, '90');
      assert.ok(r.over);
      assert.ok(r.said.some(x => /Kamera laju/.test(x)), r.said.join(' | '));
      assert.deepStrictEqual(errors, []);
    } finally { await close(); }
  });
}

for (const file of FILES) test(`${file}: anggaran kos minyak pada pilihan laluan & halaman Kongsi JalanKita`, async () => {
  const { page, errors, close } = await open(file);
  try {
    const r = await page.evaluate(async () => {
      state.manualLoc = false;
      setMe({ lat: 3.1, lng: 101.7, heading: 0, speed: 0, t: Date.now() });
      S.fuelL100 = 7; S.fuelPrice = 2;
      planRoute({ title: 'Ujian', lat: 3.2, lng: 101.7 });
      await new Promise(r => setTimeout(r, 300));
      const card = $('panel').textContent;
      openSet('invite');
      const img = document.querySelector('.qr-box img'), box = document.querySelector('.qr-box');
      const a = img.getBoundingClientRect(), b = box.getBoundingClientRect();
      return { card, qr: img.src || '', fits: a.right <= b.right + 0.5 && a.bottom <= b.bottom + 0.5 };
    });
    assert.match(r.card, /⛽ ~RM 1\.55/);          // 11.1 km × 7 L/100 km × RM 2
    assert.match(r.qr, /create-qr-code.*jalankita\.example/);
    assert.ok(r.fits, 'gambar QR terkeluar dari kotak putih');
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});

for (const [file, row, url] of [['Index.html', 'ujiOn', /\?uji=1$/], ['IndexUji.html', 'ujiOff', /\/exec$/]]) {
  test(`${file}: pemilik boleh bertukar antara versi biasa & versi uji dari menu`, async () => {
    const { page, errors, close } = await open(file);
    try {
      const r = await page.evaluate(row => {
        state.isOwner = true; let opened = null; window.open = u => { opened = u; };
        openDrawer();
        const b = document.querySelector(`#drawerPane [data-do="${row}"]`);
        if (b) b.click();
        const notOwner = (() => { state.isOwner = false; renderDrawer(); return !!document.querySelector('[data-do^="uji"]'); })();
        return { found: !!b, opened, notOwner };
      }, row);
      assert.ok(r.found);
      assert.match(r.opened || '', url);
      assert.strictEqual(r.notOwner, false);          // pengguna biasa tidak nampak butang ini
      assert.deepStrictEqual(errors, []);
    } finally { await close(); }
  });
}

for (const file of FILES) test(`${file}: tekan lama pada peta → Pergi ke sini / Simpan sebagai Rumah (lokasi tepat)`, async () => {
  const { page, errors, close } = await open(file, { hasTouch: true });
  try {
    await page.evaluate(() => { setMe({ lat: 3.1, lng: 101.7, heading: 0, speed: 0, t: Date.now() }); map.setView([3.1, 101.7], 16, { animate: false }); });
    const box = await page.locator('#map').boundingBox();
    const x = box.x + box.width / 2 + 40, y = box.y + 300;
    // tekan lama (≥ 550 ms tanpa bergerak)
    await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(800); await page.mouse.up();
    await page.waitForSelector('.leaflet-popup [data-lp="home"]');
    const expected = await page.evaluate(([x, y]) => { const ll = map.containerPointToLatLng(L.point(x - map.getContainer().getBoundingClientRect().left, y - map.getContainer().getBoundingClientRect().top)); return { lat: ll.lat, lng: ll.lng }; }, [x, y]);
    await page.click('.leaflet-popup [data-lp="home"]');
    const home = await page.evaluate(() => places().home);
    assert.ok(home && Math.abs(home.lat - expected.lat) < 1e-5 && Math.abs(home.lng - expected.lng) < 1e-5, JSON.stringify([home, expected]));
    // tekan sekejap (klik biasa) tidak membuka menu
    await page.mouse.click(x - 80, y + 40); await page.waitForTimeout(900);
    assert.strictEqual(await page.locator('.leaflet-popup [data-lp]').count(), 0);
    assert.strictEqual(await page.locator('.lp-pin').count(), 0);           // pin dibuang bila menu ditutup
    // tekan lama lagi → Pergi ke sini → laluan dirancang
    await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(800); await page.mouse.up();
    await page.click('.leaflet-popup [data-lp="go"]');
    await page.waitForFunction(() => state.dest && state.routes.length > 0);
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});

test('IndexUji.html: pulang ke Rumah → tawar "Beritahu keluarga" (WhatsApp dengan masa tiba)', async () => {
  const { page, errors, close } = await open('IndexUji.html');
  try {
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      let opened = ''; window.open = u => { opened = u; };
      S.prayerRemind = false;      // jangan biar kad waktu solat (bergantung pada jam CI) muncul dahulu
      const p = places(); p.home = { title: 'Rumah', lat: 3.2, lng: 101.7 }; savePlaces(p);
      state.manualLoc = false; setMe({ lat: 3.1, lng: 101.7, heading: 0, speed: 0, t: Date.now() }); await w(50);
      planRoute({ title: 'Rumah', lat: 3.2, lng: 101.7 }); await w(300); startNav(); await w(100);
      const card = $('askText').textContent; $('askYes').click();
      return { card, opened: decodeURIComponent(opened) };
    });
    assert.strictEqual(r.card, 'Beritahu keluarga?');
    assert.match(r.opened, /wa\.me.*perjalanan pulang, anggaran tiba/);
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});

test('IndexUji.html: laluan dengan kemalangan dilaporkan — laluan lain disyorkan ("Elak sesak") & amaran ditunjuk', async () => {
  const { page, errors, close } = await open('IndexUji.html');
  try {
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      const enc = v => { v = Math.round(v * 1e5); v = v < 0 ? ~(v << 1) : v << 1; let o = ''; while (v >= 0x20) { o += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; } return o + String.fromCharCode(v + 63); };
      const poly = pts => { let s = '', a = 0, b = 0; pts.forEach(([la, lg]) => { s += enc(la - a) + enc(lg - b); a = la; b = lg; }); return s; };
      const main = JSON.parse(JSON.stringify(__route));
      const alt = Object.assign({}, main, { summary: 'Jalan Lencong', durationSec: 700,
        polyline: poly([[3.1, 101.7], [3.1, 101.72], [3.2, 101.72], [3.2, 101.7]]) });
      window.__override = { getRoute: () => [JSON.parse(JSON.stringify(main)), alt] };
      window.__reports = [{ id: 'acc-1', type: 'KEMALANGAN', lat: 3.15, lng: 101.7001, desc: '', name: 'X', up: 1, down: 0, heading: null }];
      state.manualLoc = false; setMe({ lat: 3.1, lng: 101.7, heading: 0, speed: 0, t: Date.now() }); await w(50);
      await refresh();
      planRoute({ title: 'Ujian', lat: 3.2, lng: 101.7 }); await w(300);
      return { sel: state.selRoute, cards: [...document.querySelectorAll('.route-card')].map(c => c.innerText.replace(/\s+/g, ' ')) };
    });
    assert.strictEqual(r.sel, 1, JSON.stringify(r));
    assert.match(r.cards[0], /⚠️ 1 kemalangan/);
    assert.match(r.cards[1], /Elak sesak/);
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});

test('IndexUji.html: 👍 baharu pada laporan anda → ucapan terima kasih sekali', async () => {
  const { page, errors, close } = await open('IndexUji.html');
  try {
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      store.set('jk_upseen', '2');
      window.__override = { getProfile: () => ({ points: 30, reports: 2, upReceived: 5, joined: Date.now() }) };
      await loadProfile(); await w(50);
      const first = $('toast').textContent;
      $('toast').textContent = '';
      await loadProfile(); await w(50);
      return { first, second: $('toast').textContent, seen: store.get('jk_upseen') };
    });
    assert.match(r.first, /3 pemandu berterima kasih atas laporan anda \(\+15 mata\)/);
    assert.ok(!/berterima kasih/.test(r.second));
    assert.strictEqual(r.seen, '5');
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});
