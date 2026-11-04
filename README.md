# JalanKita

Aplikasi navigasi dan laporan trafik komuniti (ala Waze), dibina dengan **Google Apps Script**, **Google Sheets** dan **Leaflet / OpenStreetMap**. Ia dibuka sebagai web app dalam pelayar telefon, tanpa perlu pasang apa-apa.

## Ciri utama
- **Navigasi** dengan arahan suara (BM / English), zum automatik, peta ikut arah perjalanan, dan semakan "laluan lebih pantas" setiap 10 minit. Laluan dikira oleh servis Maps Apps Script.
- **Laporan komuniti**: polis, kemalangan, kesesakan, bahaya, banjir, jalan berlubang, kerja jalan, kamera AES dan kenderaan rosak. Ia disertai undian 👍/👎, soalan "Masih ada?", dan gabungan laporan berulang.
- **Pengguna lain di peta**: lokasi dikaburkan ~100 m, dan mod halimunan tersedia.
- **Carian tempat** (Google Places / Photon / Geocoder), **pautan lokasi WhatsApp**, **cari di sepanjang laluan** (minyak, R&R, masjid…) dan titik singgah.
- **Kongsi perjalanan langsung**: pautan dihantar ke rakan, dan mati sendiri bila perjalanan tamat.
- **Profil**: mata, lencana dan mood. Tetapan disegerak ke server kerana iPhone membuang storan pelayar.
- **Panel pentadbir** (pemilik sahaja): kuota, laporan, dan sekatan pengguna.

## Struktur
| Fail | Isi |
|---|---|
| `Code.gs` | Server (Apps Script): identiti bertandatangan, had kadar, laporan, laluan, carian, kongsi, pentadbir. **`APP_VERSION`** di bahagian atas. |
| `Index.html` | Aplikasi web (HTML/CSS/JS, satu fail): peta, navigasi, suara, terjemahan, tetapan. |
| `appsscript.json` | Manifest Apps Script (zon masa, V8, tetapan web app). |
| `tests/` | Ujian automatik (`npm test`), dengan servis Apps Script olok-olok. |
| `.github/workflows/` | `test.yml` (ujian setiap PR) dan `deploy.yml` (deploy automatik bila kod masuk ke `main`). |
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
- Aplikasi web tidak boleh berjalan bila ditutup: tiada notifikasi push, dan GPS mungkin berhenti bila bertukar app.
