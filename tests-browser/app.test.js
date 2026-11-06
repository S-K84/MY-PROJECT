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

for (const file of FILES) test(`${file}: anggaran kos minyak pada pilihan laluan & halaman Kongsi Jalan Malaysia`, async () => {
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
    assert.match(decodeURIComponent(r.qr), /create-qr-code.*data=https:\/\/s-k84\.github\.io\/MY-PROJECT\/#pasang$/);   // pautan pendek dengan ikon
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

for (const file of FILES) test(`${file}: pulang ke Rumah → tawar "Beritahu keluarga" (WhatsApp dengan masa tiba)`, async () => {
  const { page, errors, close } = await open(file);
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

for (const file of FILES) test(`${file}: laluan dengan kemalangan dilaporkan — laluan lain disyorkan ("Elak sesak") & amaran ditunjuk`, async () => {
  const { page, errors, close } = await open(file);
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

for (const file of FILES) test(`${file}: 👍 baharu pada laporan anda → ucapan terima kasih sekali`, async () => {
  const { page, errors, close } = await open(file);
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

for (const file of FILES) test(`${file}: halaman "Tambah ke skrin utama" ada butang ke halaman ikon 🇲🇾 (GitHub Pages)`, async () => {
  const { page, errors, close } = await open(file);
  try {
    const r = await page.evaluate(() => {
      openSet('homescreen');
      const a = document.getElementById('hsInstall');
      return { href: a ? a.href : '', target: a ? a.target : '', text: document.body.innerText };
    });
    assert.strictEqual(r.href, 'https://s-k84.github.io/MY-PROJECT/#pasang');
    assert.strictEqual(r.target, '_top');
    assert.match(r.text, /guna Chrome/);
    assert.doesNotMatch(r.text, /iPhone · Safari/);
    // Langkah "Kongsi → Tambah ke Skrin Utama" tidak dipapar dalam aplikasi: jika diikut di sini, ikon jadi huruf "J"
    assert.doesNotMatch(r.text, /Pilih Tambah ke Skrin Utama/);
    assert.match(r.text, /Tekan butang biru dahulu/);
    assert.match(r.text, /ikon jadi huruf “J”/);
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});

for (const file of FILES) test(`${file}: pulang ke Rumah dalam waktu solat → kad "Beritahu keluarga" dahulu, kemudian kad solat`, async () => {
  const { page, errors, close } = await open(file);
  try {
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      window.open = () => {};
      S.prayerRemind = true;
      const p = places(); p.home = { title: 'Rumah', lat: 3.2, lng: 101.7 }; savePlaces(p);
      state.manualLoc = false; setMe({ lat: 3.1, lng: 101.7, heading: 0, speed: 0, t: Date.now() }); await w(50);
      // Waktu Asar SEKARANG (seperti pemilik: 16:03), bukan bergantung pada jam CI.
      const day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
      const now = new Date(), t = {}; PRAYERS.forEach(([k]) => { t[k] = new Date(now.getTime() + 864e5); }); t.asar = now;
      state.prayerCache = { day, lat: 3.1, lng: 101.7, t }; state.prayerSaid = new Set();
      planRoute({ title: 'Rumah', lat: 3.2, lng: 101.7 }); await w(300); startNav(); await w(100);
      const first = $('askText').textContent; $('askNo').click();
      onNavTick(); await w(50);
      return { first, second: $('askText').textContent, shown: $('askCard').style.display };
    });
    assert.strictEqual(r.first, 'Beritahu keluarga?');
    assert.strictEqual(r.second, 'Waktu Asar');
    assert.strictEqual(r.shown, 'block');
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});

for (const file of FILES) test(`${file}: kad lain sedang dipapar semasa mula ke Rumah → "Beritahu keluarga" menunggu giliran`, async () => {
  const { page, errors, close } = await open(file);
  try {
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      S.prayerRemind = false;
      const p = places(); p.home = { title: 'Rumah', lat: 3.2, lng: 101.7 }; savePlaces(p);
      state.manualLoc = false; setMe({ lat: 3.1, lng: 101.7, heading: 0, speed: 0, t: Date.now() }); await w(50);
      planRoute({ title: 'Rumah', lat: 3.2, lng: 101.7 }); await w(300);
      showAsk({ icon: 'ℹ️', text: 'Kad lain', yes: 'Ya', no: 'Tidak', ms: 60000 });
      startNav(); await w(100);
      const during = $('askText').textContent; $('askNo').click();
      onNavTick(); await w(50);
      return { during, after: $('askText').textContent };
    });
    assert.strictEqual(r.during, 'Kad lain');
    assert.strictEqual(r.after, 'Beritahu keluarga?');
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});

for (const file of FILES) test(`${file}: cadangan perjalanan — petang hari kerja "Pulang ke rumah?" → terus navigasi; sekali sehari; tiada pada hujung minggu`, async () => {
  const { page, errors, close } = await open(file);
  try {
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      const realNow = Date.now;
      const at = iso => { const t = Date.parse(iso); Date.now = () => t; };
      try {
        const p = places(); p.home = { title: 'Rumah', lat: 3.2, lng: 101.7 }; p.work = { title: 'Kerja', lat: 3.0, lng: 101.6 }; savePlaces(p);
        S.prayerRemind = false; S.tripSuggest = true; state.manualLoc = false;
        const kinds = ['2026-11-05T09:30:00Z', '2026-11-05T00:30:00Z', '2026-11-05T05:00:00Z', '2026-11-07T09:30:00Z']
          .map(t => tripSuggestion(Date.parse(t)));                         // Khamis 17:30, Khamis 08:30, Khamis 13:00, Sabtu 17:30
        at('2026-11-07T09:30:00Z'); setMe({ lat: 3.1, lng: 101.7, heading: 0, speed: 0, t: Date.now() }); await w(50);
        const weekend = $('askCard').style.display;
        at('2026-11-05T09:30:00Z'); setMe({ lat: 3.1, lng: 101.7, heading: 0, speed: 0, t: Date.now() }); await w(50);
        const text = $('askText').textContent;
        Date.now = realNow;
        $('askYes').click(); await w(400);
        const nav = { navigating: state.navigating, dest: state.dest && state.dest.title };
        cancelRoute(); hideAsk(); await w(50);
        at('2026-11-05T10:00:00Z'); setMe({ lat: 3.1, lng: 101.7, heading: 0, speed: 0, t: Date.now() }); await w(50);
        const again = $('askCard').style.display, mode = document.body.dataset.mode;
        store.del('jk_trip'); setMe({ lat: 3.1, lng: 101.7, heading: 0, speed: 0, t: Date.now() }); await w(50);
        const nextDay = $('askText').textContent;                            // tanpa rekod "sudah ditanya" → ditanya lagi
        return { kinds, weekend, text, nav, again, mode, nextDay };
      } finally { Date.now = realNow; }
    });
    assert.deepStrictEqual(r.kinds, ['home', 'work', null, null]);
    assert.notStrictEqual(r.weekend, 'block');
    assert.strictEqual(r.text, 'Pulang ke rumah?');
    assert.deepStrictEqual(r.nav, { navigating: true, dest: 'Rumah' });
    assert.strictEqual(r.mode, 'idle');
    assert.notStrictEqual(r.again, 'block');                                // sekali sehari sahaja
    assert.strictEqual(r.nextDay, 'Pulang ke rumah?');
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});

for (const file of FILES) test(`${file}: jubin peta disimpan dalam telefon — selepas muat semula, kawasan sama tidak dimuat turun lagi`, async () => {
  const { page, errors, tiles, close } = await open(file, null, { tiles: true });
  try {
    await page.waitForFunction(async () => (await (await caches.open('jk-tiles-v1')).keys()).length >= 4, null, { timeout: 15000 });
    await page.waitForTimeout(500);
    const first = new Set(tiles.requests);
    await page.reload();
    await page.waitForFunction(() => window.__appStarted === true, null, { timeout: 15000 });
    await page.waitForFunction(() => tileStat.hit >= 4, null, { timeout: 15000 });
    await page.waitForTimeout(500);
    const again = tiles.requests.slice(first.size).filter(u => first.has(u));
    const blobs = await page.evaluate(() => [...document.querySelectorAll('.leaflet-tile')].filter(i => i.src.startsWith('blob:')).length);
    assert.deepStrictEqual(again, [], 'jubin yang sudah disimpan dimuat turun semula');
    assert.ok(blobs >= 4, 'jubin tidak dipapar dari simpanan telefon');
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});


for (const file of FILES) test(`${file}: peta malam tidak lagi guna CARTO (perlu kunci API) & jubin CARTO lama dibuang dari telefon`, async () => {
  const { page, errors, tiles, close } = await open(file, null, { tiles: true });
  try {
    await page.evaluate(async () => {
      const c = await caches.open('jk-tiles-v1');
      await c.put('https:\/\/a.basemaps.cartocdn.com/dark_all/15/1/1@2x.png', new Response('x', { headers: { 'Content-Type': 'image/png' } }));
    });
    await page.reload();
    await page.waitForFunction(() => window.__appStarted === true, null, { timeout: 15000 });
    await page.evaluate(() => { S.dark = 'always'; applyTheme(); map.setView([3.2, 101.7], 15); });
    await page.waitForTimeout(1500);
    const r = await page.evaluate(async () => ({
      carto: (await (await caches.open('jk-tiles-v1')).keys()).filter(k => /cartocdn/.test(k.url)).length,
      filter: getComputedStyle(document.querySelector('.leaflet-tile-pane')).filter }));
    assert.strictEqual(r.carto, 0, 'jubin CARTO lama masih disimpan');
    assert.ok(!tiles.requests.some(u => /cartocdn/.test(u)), 'masih memuat jubin CARTO');
    assert.match(r.filter, /brightness/);
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});

for (const file of FILES) test(`${file}: WhatsApp di telefon dibuka terus (whatsapp://, tiada tab kosong); wa.me hanya jika app tidak terbuka`, async () => {
  const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1';
  const { page, errors, close } = await open(file, { userAgent: ua });
  try {
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      const calls = []; window.open = (u, t) => { calls.push([u.split('?')[0], t]); };
      // 1) app WhatsApp dibuka → halaman tersembunyi → tiada wa.me
      openWhatsApp('hai');
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      await w(WA_FALLBACK_MS + 200);
      const opened = calls.splice(0);
      // 2) app tidak terbuka (halaman kekal kelihatan) → wa.me sebagai sandaran
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      openWhatsApp('hai');
      await w(WA_FALLBACK_MS + 200);
      return { opened, fallback: calls };
    });
    assert.deepStrictEqual(r.opened, [['whatsapp://send', '_top']]);
    assert.deepStrictEqual(r.fallback, [['whatsapp://send', '_top'], ['https://wa.me/', '_blank']]);
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});

for (const file of FILES) test(`${file}: setiap destinasi yang dinavigasi masuk "Terkini" (bukan Rumah) & "Terkini" dipulihkan dari server`, async () => {
  const { page, errors, close } = await open(file);
  try {
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      S.prayerRemind = false;
      const p = places(); p.home = { title: 'Rumah', lat: 3.2, lng: 101.7 }; p.recent = []; savePlaces(p);
      state.manualLoc = false; setMe({ lat: 3.1, lng: 101.7, heading: 0, speed: 0, t: Date.now() }); await w(50);
      // Destinasi BUKAN dari carian (cth. tekan lama / pautan) → kini tetap dicatat
      planRoute({ title: 'Kedai Ujian', sub: 'Kuantan', lat: 3.15, lng: 101.7 }); await w(300); startNav(); await w(100);
      cancelRoute(); hideAsk(); await w(50);
      planRoute({ title: 'Rumah', lat: 3.2, lng: 101.7 }); await w(300); startNav(); await w(100);
      cancelRoute(); hideAsk(); await w(50);
      const afterNav = places().recent.map(x => x.title);
      const listText = $('recentList').textContent;
      // Telefon kehilangan storan → server memulangkan "Terkini"
      const q = places(); q.recent = []; savePlaces(q);
      applyPrefs({ t: Date.now(), settings: {}, places: { home: q.home, work: null, favs: [], recent: [{ title: 'Dari Server', sub: '', lat: 3.3, lng: 101.8 }] } });
      return { afterNav, listText, restored: places().recent.map(x => x.title), built: buildPrefs().places.recent.length };
    });
    assert.deepStrictEqual(r.afterNav, ['Kedai Ujian']);
    assert.match(r.listText, /Kedai Ujian/);
    assert.deepStrictEqual(r.restored, ['Dari Server']);
    assert.strictEqual(r.built, 1);
    assert.deepStrictEqual(errors, []);
  } finally { await close(); }
});

for (const file of ['Index.html', 'IndexUji.html']) {
  test(`${file}: kamera AES diberi amaran walaupun dilapor dari arah bertentangan; laporan lain arah bertentangan senyap`, async () => {
    const { page, errors, close } = await open(file);
    try {
      const r = await page.evaluate(async () => {
        const w = ms => new Promise(r => setTimeout(r, ms));
        const said = []; window.speechSynthesis && (window.speechSynthesis.speak = u => said.push(u.text));
        S.alertTypes = Object.keys(TYPES); state.manualLoc = false; state.alerted = new Set();
        // Memandu ke utara (heading 0); laporan 300 m di hadapan, dilapor oleh pemandu arah selatan (heading 180)
        state.reports = [
          { id: 'cam-x', type: 'KAMERA', lat: 3.1027, lng: 101.7, heading: 180, name: 'A', up: 1, down: 0, time: Date.now() },
          { id: 'pol-x', type: 'POLIS', lat: 3.1027, lng: 101.7001, heading: 180, name: 'B', up: 1, down: 0, time: Date.now() }];
        setMe({ lat: 3.1, lng: 101.7, heading: 0, speed: 25, t: Date.now() }); await w(50);
        checkHazards(); await w(50);
        return { alerted: [...state.alerted] };
      });
      assert.ok(r.alerted.includes('cam-x'), 'kamera AES arah bertentangan tidak diberi amaran');
      assert.ok(!r.alerted.includes('pol-x'), 'laporan polis arah bertentangan diberi amaran');
      assert.deepStrictEqual(errors, []);
    } finally { await close(); }
  });
}

for (const file of ['Index.html', 'IndexUji.html']) {
  test(`${file}: kad lokasi muncul sebelum pertanyaan lokasi telefon; GPS hanya bermula selepas pengguna tekan Benarkan`, async () => {
    const { page, errors, close } = await open(file, null, { geoPerm: 'prompt' });
    try {
      await page.evaluate(() => {
        window.__geoCalls = 0;
        const w = navigator.geolocation.watchPosition.bind(navigator.geolocation);
        navigator.geolocation.watchPosition = (a, b, c) => { window.__geoCalls++; return w(a, b, c); };
      });
      await page.waitForSelector('#locModal', { state: 'visible' });
      assert.strictEqual(await page.textContent('#locTitle'), 'Benarkan lokasi');
      assert.strictEqual(await page.evaluate(() => window.__geoCalls), 0, 'GPS dimulakan sebelum pengguna setuju');
      await page.click('#locGo');
      await page.waitForSelector('#locModal', { state: 'hidden' });
      assert.ok(await page.evaluate(() => window.__geoCalls) >= 1, 'GPS tidak bermula selepas tekan Benarkan');
      assert.deepStrictEqual(errors, []);
    } finally { await close(); }
  });
}

for (const file of ['Index.html', 'IndexUji.html']) {
  test(`${file}: lokasi disekat → kad langkah tetapan; lokasi sudah dibenarkan → tiada kad`, async () => {
    let t = await open(file, null, { geoPerm: 'denied' });
    try {
      await t.page.waitForSelector('#locModal', { state: 'visible' });
      assert.strictEqual(await t.page.textContent('#locTitle'), 'Lokasi disekat');
      assert.ok(await t.page.isVisible('#locDenied'));
      await t.page.click('#locManual');
      await t.page.waitForSelector('#locModal', { state: 'hidden' });
      assert.ok(await t.page.evaluate(() => state.manualLoc), 'pilihan peta tidak menetapkan lokasi manual');
      assert.deepStrictEqual(t.errors, []);
    } finally { await t.close(); }
    t = await open(file);
    try {
      await t.page.waitForTimeout(500);
      assert.ok(!(await t.page.isVisible('#locModal')), 'kad lokasi muncul walaupun lokasi sudah dibenarkan');
    } finally { await t.close(); }
  });
}

for (const file of ['Index.html', 'IndexUji.html']) {
  test(`${file}: kad lokasi ditutup sendiri bila pengguna membenarkan lokasi dari tempat lain`, async () => {
    const { page, errors, close } = await open(file, null, { geoPerm: 'prompt' });
    try {
      await page.waitForSelector('#locModal', { state: 'visible' });
      await page.evaluate(() => window.__setGeoPerm('granted'));
      await page.waitForSelector('#locModal', { state: 'hidden' });
      assert.ok(await page.evaluate(() => geoReady));
      assert.deepStrictEqual(errors, []);
    } finally { await close(); }
  });
}
