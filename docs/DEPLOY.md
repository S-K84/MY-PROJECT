# Deploy automatik ke Apps Script

Bila kod masuk ke cawangan `main` (contohnya PR di-merge), GitHub Actions akan:

1. Jalankan ujian (`npm test`). Kalau gagal, deploy **tidak** dibuat.
2. Hantar `Code.gs`, `Index.html` dan `appsscript.json` ke projek Apps Script (`clasp push`).
3. Kemas kini **deployment sedia ada** kepada versi baharu (`clasp deploy -i …`). Pautan `/exec` kekal sama.

Anda juga boleh jalankannya sendiri: **Actions → Deploy ke Apps Script → Run workflow** (cawangan `main`).

Sebelum secret ditetapkan, aliran kerja deploy hanya memberi amaran dan melangkau deploy. Ujian tetap berjalan.

---

## Persediaan (sekali sahaja, ~15 minit)

Anda perlukan **komputer** (Windows / Mac / Linux). Telefon tidak boleh digunakan untuk langkah 3.

### 1. Hidupkan Apps Script API
Buka https://script.google.com/home/usersettings dan tukar **Google Apps Script API** kepada **On**.

### 2. Salin dua ID dari editor Apps Script
- **Script ID**: ⚙️ **Project Settings** (menu kiri) → bahagian **IDs** → **Script ID** → Copy.
- **Deployment ID**: **Deploy → Manage deployments** → pilih deployment aktif (yang pautannya digunakan) → **Deployment ID** → Copy.
  Pastikan anda salin ID deployment yang **sedia ada**, bukan "Test deployments".

### 3. Log masuk clasp di komputer
1. Pasang **Node.js LTS** dari https://nodejs.org (pilih butang "LTS").
2. Buka **Command Prompt** (Windows) atau **Terminal** (Mac), kemudian jalankan:
   ```
   npx @google/clasp@2.4.2 login
   ```
   Versi `2.4.2` mesti sama dengan yang digunakan oleh aliran kerja.
3. Pelayar akan terbuka. Pilih akaun Google **pemilik projek JalanKita**, kemudian tekan **Allow**.
4. Satu fail kelayakan dicipta:
   - Windows: `C:\Users\<nama anda>\.clasprc.json`
   - Mac / Linux: `~/.clasprc.json`

### 4. Simpan secret di GitHub
1. Repo → **Settings → Environments → New environment** → namakan **`apps-script`** → **Configure environment**.
2. **Deployment branches and tags** → **Selected branches and tags** → **Add deployment branch rule** → `main`.
   Ini memastikan hanya kod di `main` boleh guna secret ini.
3. **Environment secrets → Add environment secret**, tambah tiga secret:

   | Nama | Nilai |
   |---|---|
   | `CLASPRC_JSON` | **Seluruh** isi fail `.clasprc.json` (buka dengan Notepad, Ctrl+A, Ctrl+C) |
   | `SCRIPT_ID` | Script ID dari langkah 2 |
   | `DEPLOYMENT_ID` | Deployment ID dari langkah 2 |

### 5. Uji
Selepas PR di-merge (atau **Actions → Deploy ke Apps Script → Run workflow** pada `main`), semak:
- Tab **Actions** di GitHub: semua langkah ✅.
- Apps Script → **Deploy → Manage deployments**: versi baharu dengan penerangan `GitHub <commit>`.

---

## ⚠️ Keselamatan

- `.clasprc.json` memberi akses kepada projek Apps Script **dan Google Drive** akaun anda.
  **Jangan** hantar isinya kepada sesiapa: tidak dalam chat, e-mel atau commit. Simpan hanya sebagai secret GitHub.
  `.gitignore` sudah menghalangnya daripada di-commit secara tidak sengaja.
- Hanya berikan akses **Admin** repo kepada orang yang anda percayai. Admin boleh mengubah tetapan environment.
- Kalau kelayakan bocor: buka https://myaccount.google.com/permissions, buang akses **clasp**, kemudian ulang langkah 3–4.
- `clasp push` **menggantikan** semua fail dalam projek Apps Script dengan fail dari repo. Fail yang hanya wujud di editor Apps Script akan **dipadam**.
  Sentiasa buat perubahan dalam repo (melalui PR), bukan terus dalam editor.

## Ujian tempatan

```
npm test
```

Ujian berada dalam `tests/`. Ia memuatkan `Code.gs` dengan servis Apps Script olok-olok (`CacheService`, `Maps`), jadi tiada akaun Google diperlukan.
