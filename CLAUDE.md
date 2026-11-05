# CLAUDE.md — panduan untuk Claude (dan pembangun) dalam repo JalanKita

JalanKita ialah aplikasi navigasi & laporan trafik komuniti (ala Waze): **Google Apps Script** (server), **Google Sheets**
(pangkalan data), **Leaflet + OpenStreetMap** (peta). Baca `README.md` untuk gambaran ciri dan tempat data disimpan.

## Pemilik & bahasa
- Pemilik projek **bukan pengaturcara**. Jawab dalam **Bahasa Melayu yang mudah**. Bila dia perlu menekan sesuatu
  (GitHub, Apps Script, telefon), beri langkah demi langkah: apa yang ditekan dan apa yang sepatutnya kelihatan.
- Teks dalam aplikasi, komen kod, mesej commit dan penerangan PR ditulis dalam **BM**.

## Aliran kerja (wajib)
1. Semua perubahan melalui **Pull Request** ke `main`. Jangan commit terus ke `main`.
2. `npm test` mesti lulus sebelum push. CI (`.github/workflows/test.yml`) menjalankannya pada setiap PR.
3. Bila PR di-merge, `.github/workflows/deploy.yml` menjalankan ujian, `clasp push`, kemudian `clasp deploy -i <deployment sedia ada>`.
   Pautan `/exec` kekal sama. Semak keputusan di tab Actions (log patut menunjukkan `Created version N`).
4. **Jangan sekali-kali** suruh pemilik mengubah kod dalam editor Apps Script. Deploy seterusnya akan menimpanya.
   `clasp push` menggantikan semua fail projek Apps Script dengan `Code.gs`, `Index.html` dan `appsscript.json` dari repo
   (`.claspignore`).
5. Naikkan **`APP_VERSION`** (bahagian atas `Code.gs`, format `YYYY.MM.DD-x`) dalam setiap PR yang mengubah kod aplikasi.
   Ia satu-satunya tempat versi ditulis, dan disuntik ke `Index.html` melalui `<?!= versionJson ?>`.
   Pemilik menyemak versi di telefon (menu ☰, bahagian bawah).
6. Tambah ujian dalam `tests/` untuk setiap pembaikan atau ciri baharu, dan pastikan ujian itu **gagal pada kod lama**.
7. **Saluran uji** untuk perubahan klien yang berisiko: letak kod baharu dalam `IndexUji.html`, merge, kemudian pemilik buka
   `.../exec?uji=1` di telefon (hanya pemilik; versi ditanda "(uji)"). Bila sudah disahkan di telefon sebenar, salin ke
   `Index.html` dalam PR berasingan. Lulus ujian Chromium/Node **tidak** menjamin Safari iPhone berfungsi (lihat PR #5/#6).

## Keselamatan
- **Jangan minta** isi `.clasprc.json` atau nilai secret GitHub (`CLASPRC_JSON`, `SCRIPT_ID`, `DEPLOYMENT_ID` dalam
  environment `apps-script`). Script ID dan Deployment ID tidak sensitif.
- Dalam `Code.gs`, **setiap fungsi tanpa `_` di hujung boleh dipanggil oleh sesiapa** melalui `google.script.run`.
  Fungsi dalaman mesti berakhir dengan `_`. Setiap fungsi awam untuk pengguna bermula dengan `verify_(token)`, dan fungsi
  pentadbir dengan `requireOwner_(token)`. `setup()` dan `cleanup()` menyemak `isOwner_()` / `isRealTrigger_()`.
- Input pengguna yang ditulis ke Sheet mesti melalui `cell_()` / `protectCell_()`, untuk menghalang suntikan formula `= + - @`.
- Data ke dalam `<script>` dalam templat mesti melalui `jsonForScript_()`. Dalam klien, teks pengguna ke HTML mesti melalui
  `esc()`, atau guna `textContent`.
- URL luaran (UrlFetch) mestilah senarai TETAP, tidak boleh datang dari pengguna (SSRF). Pautan lokasi disemak oleh `allowedLink_()`.

## Struktur kod
| Bahagian | Di mana | Nota |
|---|---|---|
| Konfigurasi & had kadar | `CONFIG` (atas `Code.gs`) | `CONFIG.LIMITS`: `[maks, tetingkap_saat]`; kunci `G_` = global |
| Had kadar | `rateLimitAll_`, `rlKey_` | Tetingkap tetap: nombor tetingkap ada dalam kunci cache. Semak semua had dahulu, baru tolak. |
| Kunci skrip | `lock_()` | `tryLock` + mesej "Sistem sibuk". Jangan guna `waitLock`. |
| Identiti | `getSession`, `verify_`, `sign_`, `tokenId_` | Token `id.HMAC`. ID `g_…` dari `Session.getTemporaryActiveUserKey()`, yang **dirotasi setiap 30 hari** → `migrationOffer_` / `migrateData`, `carryBan_` |
| Laporan | `submitReports`, `voteReport`, `getReports_`, `rebuildReports_` | Cache laporan **dibina semula selepas setiap penulisan** (pecahan < 100 KB). Laporan sama (≤200 m, arah ±60°) digabung sebagai 👍 (`findDuplicate_`). |
| Lokasi pengguna | `updateLocation`, `getActiveUsers_` | **CacheService sahaja**, bukan Sheet: `u_<id>` (180 s), indeks sel `uc_<i>_<j>` (~22 km), `u_all` |
| Laluan | `getRoute` | Servis Maps Apps Script. > `ROUTE_MAX_KM_` → mesej "semak GPS/VPN" tanpa memanggil Google. |
| Penyelenggaraan | `cleanup` (pencetus setiap jam) | Buang laporan luput, data pengguna 180 hari, statistik 365 hari, kongsi tamat. |
| Klien | `Index.html` (satu fail) | Peta, navigasi, suara (`speak` + `VOICE_PRIO`), tetapan, i18n (`EN`, `EN_RULES`, `tr`) |

## Perangkap yang pernah berlaku
- **`CacheService.put` menetapkan semula tempoh luput.** Jangan guna satu kunci yang ditulis semula sebagai pembilang tetingkap,
  kerana ia tidak akan reset (pepijat lama: pengguna disekat selepas ~3 jam).
- Nilai cache maks **100 KB**, dan tempoh maks **6 jam**. Pecahkan data besar; jangan potong di tengah pasangan surrogate (emoji).
- Setiap `google.script.run` ialah satu pelaksanaan Apps Script atas akaun pemilik (had ~30 serentak). Kurangkan panggilan
  yang kerap; panggilan klien ada had masa 60 s (`call()` dalam `Index.html`).
- `google.script.run` memberi mesej ralat berawalan `"Error: "`; `call()` membuangnya. Mesej `"Lock timeout"` bukan ralat rangkaian.
- **Setiap mesej ralat server baharu mesti ada terjemahan** dalam `EN` (`Index.html`). `tests/i18n.test.js` akan gagal jika tiada.
- Peraturan `EN_RULES` disemak sebelum pemecahan `' · '`. Jangan tulis corak yang menelan seluruh baris (contoh `^oleh (.+)$`).
- Teks paparan ditulis dalam BM dalam kod; terjemahan English berlaku pada DOM (MutationObserver). Teks dinamik perlukan corak dalam `EN_RULES`.
- **Google membuang komen JS sebelum menghantar halaman**, dan pembuang itu mudah keliru. Bila keliru, `//` dalam teks
  (cth. `'https://maps…'`) dianggap komen dan baki baris dipadam → `SyntaxError: Unexpected EOF` di iPhone (punca PR #5).
  Peraturan: dalam skrip, `//` dan `/*` hanya sebagai permulaan komen; dalam teks tulis `'https:\/\/…'`. Diuji oleh
  `tests/client.test.js`.
- Pelayan percuma (Overpass, Photon) sering menyekat server Google → carian sepanjang laluan & had laju dibuat dari
  TELEFON (kotak kecil, pelayan ditanya serentak), server hanya cuba Photon sekali.
- **PR #5 (2026.11.04-b) gagal di Safari iPhone** dengan `SyntaxError: Unexpected EOF (baris 1946)` walaupun lulus semua ujian
  dan sah dalam V8/acorn/esprima/QuickJS; ditarik balik dalam PR #6. Skrin ralat kini memaparkan diagnostik (panjang & hujung
  skrip yang diterima pelayar) untuk siasatan melalui saluran uji.

## Ujian
```bash
npm test
```
- `npm test`: Node 20+, tanpa pakej tambahan. `tests/helpers.js` memuatkan `Code.gs` dalam `vm` dengan olok-olok `CacheService`
  (meniru tempoh luput & had 100 KB), `SpreadsheetApp` (`FakeSheet`), `LockService`, `PropertiesService`, `Session`,
  `Utilities` (HMAC sebenar) dan `Maps` (dalam ujian laluan).
- `loadCode()` menggantikan `verify_` (token = id). Ujian yang memerlukan token sebenar guna `ctx.verify_ = ctx.realVerify_`.
- `clientScript()` memulangkan skrip utama `Index.html` dengan tag templat diganti, untuk semakan sintaks dan ujian i18n.
- **Ujian pelayar**: `npm run test:browser` (`tests-browser/`, Playwright + Leaflet dari `devDependencies`, servis Apps Script
  olok-olok dalam `harness.js`). CI menjalankannya pada setiap PR (`browser` dalam `test.yml`). Ujian ini membuka
  `Index.html` dan `IndexUji.html`: permulaan BM/English, semua halaman tetapan, navigasi, lapor pantas, carian sepanjang
  laluan, had laju & kamera. Tambah ujian di sini untuk ciri klien baharu. Lulus di Chromium ≠ lulus di Safari iPhone.

## Keputusan yang sudah dibuat
- **Ikon skrin utama iPhone:** Apps Script tidak boleh menetapkan `apple-touch-icon`, jadi halaman pembuka `docs/index.html`
  (GitHub Pages, `https://s-k84.github.io/MY-PROJECT/`) memberi ikon dan terus lompat ke `/exec`. `#pasang` memaparkan
  langkah pasang. Tambah ke skrin utama dari **Chrome** iPhone (Safari tidak dapat membuka web app Apps Script ini).
- **Jubin peta:** kekal `tile.openstreetmap.org` buat masa ini. MapTiler/Stadia (pakej percuma: bukan komersial) ditangguh
  sehingga pengguna bertambah.
- **ID 30 hari:** pindah data perlu pengesahan pengguna ("Pulihkan data anda?"), kerana pelayar boleh dikongsi oleh akaun Google
  lain. Sekatan dipindah automatik. Data dipindah, bukan disalin.
- **Deploy:** `@google/clasp@2.4.2` dipin. `clasp login` pemilik juga guna versi ini (format `.clasprc.json` berbeza antara versi).
