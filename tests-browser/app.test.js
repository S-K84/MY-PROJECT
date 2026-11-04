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

test('IndexUji.html: anggaran kos minyak pada pilihan laluan & halaman Kongsi JalanKita', async () => {
  const { page, errors, close } = await open('IndexUji.html');
  try {
    const r = await page.evaluate(async () => {
      state.manualLoc = false;
      setMe({ lat: 3.1, lng: 101.7, heading: 0, speed: 0, t: Date.now() });
      S.fuelL100 = 7; S.fuelPrice = 2;
      planRoute({ title: 'Ujian', lat: 3.2, lng: 101.7 });
      await new Promise(r => setTimeout(r, 300));
      const card = $('panel').textContent;
      openSet('invite');
      return { card, qr: (document.querySelector('.qr-box img') || {}).src || '' };
    });
    assert.match(r.card, /⛽ ~RM 1\.55/);          // 11.1 km × 7 L/100 km × RM 2
    assert.match(r.qr, /create-qr-code.*jalankita\.example/);
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});
