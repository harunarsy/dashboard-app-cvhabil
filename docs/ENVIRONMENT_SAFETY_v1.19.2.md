# HABIL Environment Safety SOP v1.19.2

Tujuan SOP ini: mencegah audit, smoke test, dan eksperimen UI besar menyentuh data produksi tanpa sengaja. Database tetap source of truth; environment harus jelas sebelum agent atau developer menjalankan test, audit, atau repair.

## Environment Roles

| Environment | Fungsi | DB target | Boleh write? |
| --- | --- | --- | --- |
| `prod` | Data live operasional keluarga / toko | Neon production branch | Hanya hotfix/repair eksplisit setelah dry-run, backup/snapshot, dan approval |
| `dev` / `staging` | Develop, smoke, theme pilot, QA visual | Neon branch terpisah atau clone lokal | Boleh untuk testing, bukan data live |
| `audit-readonly` | Audit kesehatan data dan laporan risiko | Prod read-only role atau snapshot | Tidak boleh write |

## Required Defaults

- Semua script audit wajib default read-only atau dry-run.
- Semua script repair wajib default `--dry-run`; write hanya aktif dengan flag eksplisit `--apply`.
- Jangan menjalankan theme pilot, browser smoke berulang, atau eksperimen UI besar dengan kredensial DB production write.
- `DATABASE_URL` untuk lokal/dev harus menunjuk ke branch dev/staging, bukan prod.
- Prod repair harus selalu didahului output dry-run yang disimpan di laporan/commit note.

## Local Login Seeds

Credential lokal/dev yang harus stabil:

| Role | Username | Password |
| --- | --- | --- |
| Direktur | `direktur` | `<password-dihapus-dari-riwayat>` |
| Admin | `admin` | `<password-dihapus-dari-riwayat>` |

Jika DB lokal/dev kosong, jalankan aplikasi backend normal agar seed auth membuat user default. Jika login gagal saat smoke, cek dulu backend target dan `DATABASE_URL` yang dipakai, bukan langsung mengubah data prod.

## Frontend API Targeting

Frontend lokal wajib bisa diarahkan ke backend yang jelas lewat `REACT_APP_API_URL`.

| Mode | Contoh `REACT_APP_API_URL` | Catatan |
| --- | --- | --- |
| Local backend | `http://localhost:5001/api` | Default fallback saat frontend dibuka di `localhost` tanpa env override |
| Dev/staging backend | `https://<dev-backend>.vercel.app/api` | Untuk smoke theme dan audit UI tanpa menyentuh prod write |
| Prod read-only smoke | `https://habil-backend.vercel.app/api` | Hanya buka halaman/inspect; jangan submit/save/delete |

Jika `REACT_APP_API_URL` diset, frontend harus memakai value tersebut termasuk saat berjalan di `localhost`. Ini mencegah kasus `.env` menunjuk backend tertentu tetapi app tetap memaksa endpoint fallback lama.

Untuk backend lokal/dev, gunakan `backend/.env.dev` sebagai sumber utama. Bila remote DB dipakai saat local/dev, wajib set `HABIL_DB_TARGET=dev|audit|prod-smoke`. Target `prod` lokal diblokir kecuali `ALLOW_PROD_LOCAL=true`.

## Safe Command Matrix

| Aktivitas | Environment | Command / pola |
| --- | --- | --- |
| Health audit | `audit-readonly` atau `dev` | `cd backend && npm run health` |
| Repair preview | `dev` dulu, prod hanya setelah approval | `node scripts/<repair>.js --dry-run` |
| Repair apply | `dev`; prod hanya hotfix terkontrol | `node scripts/<repair>.js --apply` |
| UI smoke theme | `dev` / `staging` | frontend lokal + backend dev/staging |
| Production gate | `prod` | `curl https://habil-backend.vercel.app/api/health` |

## Agent Guardrails

- Sebelum menjalankan script DB, agent wajib menyebut environment target: `prod`, `dev/staging`, atau `audit-readonly`.
- Jika `DATABASE_URL` tidak jelas, stop dan minta operator memilih target.
- Jangan memakai `--apply` di prod dari prompt umum seperti "audit" atau "cek"; harus ada instruksi eksplisit repair production.
- Theme work harus frontend-only sampai ada instruksi terpisah; `git diff backend/` dan `git diff frontend/src/utils/generateNotaPDF.js` harus kosong.
- Jika muncul drift antara localhost dan production login, perlakukan sebagai environment mismatch terlebih dahulu.
