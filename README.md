# JalanKita

Aplikasi navigasi dan laporan trafik komuniti (ala Waze), dibina dengan **Google Apps Script**, **Google Sheets** dan **Leaflet / OpenStreetMap**. Ia dibuka sebagai web app dalam pelayar telefon, tanpa perlu pasang apa-apa.

## Ciri utama
- **Navigasi** dengan arahan suara (BM / English), zum automatik, peta ikut arah perjalanan, dan semakan "laluan lebih pantas" setiap 10 minit. Laluan dikira oleh servis Maps Apps Script.
- **Laporan komuniti**: polis, kemalangan, kesesakan, bahaya, banjir, jalan berlubang, kerja jalan, kamera AES dan kenderaan rosak. Ia disertai undian 👍/👎, soalan "Masih ada?", dan gabungan laporan berulang.
- **Pengguna lain di peta**: lokasi dikaburkan ~100 m, dan mod halimunan tersedia.
- **Carian tempat** (Google Places / Photon / Geocoder), **pautan lokasi WhatsApp**, **cari di sepanjang laluan** (minyak, R&R, masjid, makan, ATM, caj EV, stesen…), "Berdekatan" dan titik singgah. Data tempat dibaca dari fail statik, jadi berfungsi walaupun liputan hilang selepas navigasi bermula.
- **Had laju jalan, lampu isyarat dan kamera laju** semasa navigasi, dari data OpenStreetMap (lihat "Data statik bulanan"). Amaran suara kamera dan had laju boleh dikawal dalam Tetapan.
- **Kongsi perjalanan langsung**: pautan dihantar ke rakan, dan mati sendiri bila perjalanan tamat.
- **Profil**: mata, lencana dan mood. Tetapan disegerak ke server kerana iPhone membuang storan pelayar.
- **Panel pentadbir** (pemilik sahaja): kuota, laporan, dan sekatan pengguna.

## Struktur
| Fail | Isi |
|---|---|
| `Code.gs` | Server (Apps Script): identiti bertandatangan, had kadar, laporan, laluan, carian, kongsi, pentadbir. **`APP_VERSION`** di bahagian atas. |
| `Index.html` | Aplikasi web (HTML/CSS/JS, satu fail): peta, navigasi, suara, terjemahan, tetapan. |
| `IndexUji.html` | Saluran uji: ciri baharu diuji dahulu oleh pemilik di `.../exec?uji=1`, kemudian disalin ke `Index.html`. |
| `scripts/` | Skrip data bulanan (Python): `ambil_had.py`, `ambil_poi.py`, `ambil_titik.py`. |
| `data/kamera-tambahan.csv` | Kamera laju tambahan oleh pemilik (`lat,lng,nama`). |
| `docs/data/` | Data statik yang dihidang oleh GitHub Pages (dijana oleh tugas bulanan; jangan edit tangan). |
| `appsscript.json` | Manifest Apps Script (zon masa, V8, tetapan web app). |
| `tests/` | Ujian automatik (`npm test`), dengan servis Apps Script olok-olok. |
| `.github/workflows/` | `test.yml` (ujian setiap PR), `deploy.yml` (deploy automatik bila kod masuk ke `main`) dan `had-bulanan.yml` (data OSM bulanan). |
| `docs/DEPLOY.md` | Persediaan deploy automatik (clasp + secret GitHub). |

### Di mana data disimpan
| Data | Tempat | Tempoh |
|---|---|---|
| Laporan | Sheet **Laporan** (+ salinan cache untuk bacaan) | Ikut jenis (45 minit – 30 hari) |
| Lokasi pengguna | `CacheService` sahaja, **bukan** Sheet | 3 minit |
| Tetapan, Rumah/Kerja, kegemaran | Sheet **DataPengguna** | Dipadam selepas 180 hari tidak aktif |
| Mata & statistik | Sheet **Statistik** | Dipadam selepas 365 hari tidak aktif |
| Kongsi perjalanan | Sheet **Kongsi** + cache | Dipadam sehari selepas tamat |

`cleanup()` berjalan setiap jam (pencetus masa) untuk membuang data lama.

### Data statik bulanan (OpenStreetMap)
Overpass dan Photon dari telefon tidak boleh diharap (sering sibuk atau menyekat), jadi data berikut dimuat turun **sekali sebulan** dan dihidang sebagai fail biasa oleh GitHub Pages (`https://s-k84.github.io/MY-PROJECT/data/…`). Aplikasi membacanya dahulu; Overpass hanya sandaran.

| Data | Fail | Skrip |
|---|---|---|
| Lampu isyarat & kamera laju | `docs/data/titik.json` | `scripts/ambil_titik.py` |
| Had laju jalan (kawasan 0.25°) | `docs/data/had/` | `scripts/ambil_had.py` |
| Tempat (minyak, masjid, makan…) | `docs/data/poi/` | `scripts/ambil_poi.py` |

- Sumber: fail OSM Malaysia penuh dari Geofabrik. Tugas `had-bulanan.yml` berjalan hari ke-3 setiap bulan (03:41 UTC), atau tekan **Actions → Data OSM bulanan → Run workflow**. Ia siap dalam kira-kira 2 minit dan menyimpan fail data terus ke `main` (pengecualian "jangan commit terus ke `main`": hanya fail data, bukan kod).
- Menu ☰ (pemilik sahaja) memaparkan tarikh setiap data. Jika tarikh lama, semak tab **Actions**. Bila tugas gagal, GitHub membuka satu **isu** secara automatik. GitHub mematikan tugas berjadual selepas 60 hari tanpa aktiviti repo, jadi tekan Run workflow jika tarikh jauh ketinggalan.
- **Kamera tambahan**: tambah baris `lat,lng,nama` dalam `data/kamera-tambahan.csv` (melalui PR), kemudian jalankan tugas bulanan supaya `titik.json` dikemas kini. Koordinat: Google Maps, tekan lama pada tempat kamera. Kamera yang kurang 30 m dari kamera OSM diabaikan.
- Had laju, lampu isyarat dan kamera hanya ada jika OSM ada datanya (jalan tanpa tanda `maxspeed` tiada had laju).
- Skrip diuji oleh `npm test` (`tests/py/`, perlu `python3`).

## Cara kerja (aliran pembangunan)
1. Buat perubahan dalam cawangan baharu dan buka **Pull Request**.
2. GitHub menjalankan ujian secara automatik, dan PR menunjukkan ✅ atau ❌.
3. Selepas disemak, tekan **Merge**. GitHub kemudian menghantar kod ke Apps Script dan mengemas kini deployment sedia ada, jadi pautan aplikasi kekal sama.
4. Naikkan `APP_VERSION` dalam `Code.gs` untuk setiap perubahan, supaya mudah semak versi di telefon (menu ☰ → bawah).

> ⚠️ **Jangan ubah kod terus dalam editor Apps Script.** Deploy seterusnya akan menimpanya dengan kod dari GitHub.

### Ujian
```bash
npm test
```
Ujian memerlukan Node.js 20+ dan tiada pakej tambahan. Ia memuatkan `Code.gs` dengan `CacheService`, `SpreadsheetApp`, `Maps` dan lain-lain sebagai olok-olok, jadi akaun Google tidak diperlukan. Setiap mesej ralat server baharu mesti ada terjemahan dalam kamus `EN` di `Index.html`; `tests/i18n.test.js` menyemaknya.

## Persediaan projek baharu (sekali sahaja)
1. Cipta Google Sheet, kemudian buka **Extensions → Apps Script** dan masukkan `Code.gs`, `Index.html` dan `appsscript.json`.
2. Jalankan fungsi **`setup()`** sekali dari editor. Ia mencipta helaian, rahsia token dan pencetus `cleanup` setiap jam.
3. **Deploy → New deployment → Web app**, dengan *Execute as: Me* dan *Who has access: Anyone with Google account*.
4. (Pilihan) Tambah **`PLACES_API_KEY`** dalam *Project Settings → Script Properties* untuk carian tempat Google Places.
5. Untuk deploy automatik dari GitHub, ikut [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Had yang diketahui
- **ID pengguna bertukar setiap 30 hari.** `Session.getTemporaryActiveUserKey()` dirotasi oleh Google. Selagi pelayar masih menyimpan token lama, aplikasi bertanya *"Pulihkan data anda?"* dan memindah mata & data (`migrateData`); sekatan dipindah secara automatik. Kalau storan pelayar sudah dibuang (biasa di iPhone), data lama tidak dapat dipulihkan.
- **Kuota Google pada akaun pemilik**: ~1,000 laluan sehari untuk Gmail biasa, dan ~30 pelaksanaan serentak. Had kadar dalam `CONFIG.LIMITS` menjaga kuota ini.
- **Jubin peta `tile.openstreetmap.org`** tidak sesuai untuk penggunaan berat. Tukar ke pembekal lain bila pengguna bertambah.
- **Liputan data OSM terhad**: contohnya hanya ~100 kamera laju dalam OSM untuk seluruh Malaysia; kamera lain boleh ditambah dalam `data/kamera-tambahan.csv` atau di OpenStreetMap.
- **Laluan tidak boleh dikira tanpa internet** (dikira oleh Google). Selepas navigasi bermula, had laju dan carian tempat berfungsi tanpa liputan kerana data dimuat awal.
- **Selepas deploy, telefon mungkin ambil beberapa minit** untuk mendapat versi baharu. Tunggu ~5 minit dan tutup app sepenuhnya sebelum menganggapnya rosak (pernah kelihatan halaman kosong).
- Aplikasi web tidak boleh berjalan bila ditutup: tiada notifikasi push, dan GPS mungkin berhenti bila bertukar app.
