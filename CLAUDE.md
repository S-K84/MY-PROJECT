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

## Ujian
```bash
npm test
```
- Node 20+, tanpa pakej tambahan. `tests/helpers.js` memuatkan `Code.gs` dalam `vm` dengan olok-olok `CacheService`
  (meniru tempoh luput & had 100 KB), `SpreadsheetApp` (`FakeSheet`), `LockService`, `PropertiesService`, `Session`,
  `Utilities` (HMAC sebenar) dan `Maps` (dalam ujian laluan).
- `loadCode()` menggantikan `verify_` (token = id). Ujian yang memerlukan token sebenar guna `ctx.verify_ = ctx.realVerify_`.
- `clientScript()` memulangkan skrip utama `Index.html` dengan tag templat diganti, untuk semakan sintaks dan ujian i18n.
- Ujian pelayar (Playwright + Leaflet dari npm, servis sebagai olok-olok) dijalankan secara manual bila klien berubah.
  CDN disekat dalam persekitaran ujian, jadi hidangkan fail Leaflet secara setempat.

## Keputusan yang sudah dibuat
- **Jubin peta:** kekal `tile.openstreetmap.org` buat masa ini. MapTiler/Stadia (pakej percuma: bukan komersial) ditangguh
  sehingga pengguna bertambah.
- **ID 30 hari:** pindah data perlu pengesahan pengguna ("Pulihkan data anda?"), kerana pelayar boleh dikongsi oleh akaun Google
  lain. Sekatan dipindah automatik. Data dipindah, bukan disalin.
- **Deploy:** `@google/clasp@2.4.2` dipin. `clasp login` pemilik juga guna versi ini (format `.clasprc.json` berbeza antara versi).
