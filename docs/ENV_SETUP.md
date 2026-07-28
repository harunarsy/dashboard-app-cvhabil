# Environment Setup & SOP — HABIL SUPERAPP

Tujuan: bisa develop + audit **lokal** tanpa pernah menyentuh data **produksi**.

## Environment

| Env | DB | File env | Kapan dipakai |
|-----|----|----------|---------------|
| **local / dev** | DB terpisah (Neon dev branch atau Postgres lokal) | `backend/.env.dev` lalu `backend/.env` sebagai fallback legacy | develop & audit di laptop |
| **prod** | Neon (branch utama) | Vercel env vars saja | live, dipakai keluarga |

## Cara backend memilih DB
`backend/config/database.js`:
- Kalau `DATABASE_URL` ada → pakai itu (Neon).
- Kalau tidak → fallback ke `DB_HOST/DB_NAME/...` (localhost).
- Runtime local/dev sekarang prefer `backend/.env.dev` kalau ada, baru fallback `backend/.env`.
- Kalau local/dev menunjuk remote DB, wajib set `HABIL_DB_TARGET=dev|audit|prod-smoke`.
- Kalau local/dev set `HABIL_DB_TARGET=prod`, backend akan menolak start kecuali `ALLOW_PROD_LOCAL=true`.

> Masalah umum: `.env.dev` punya `DATABASE_URL` **kosong** → backend jatuh ke localhost yang tidak jalan → **login lokal gagal**.

## Setup login lokal (rekomendasi: Neon dev branch)

1. Buka Neon console → project HABIL → **Branches** → **Create branch** dari `main` (ini salinan terisolasi, aman; tidak mengubah prod).
2. Copy **connection string** branch baru itu.
3. Isi `backend/.env.dev`:
   ```
   DATABASE_URL=<connection string dev branch>
   HABIL_DB_TARGET=dev
   JWT_SECRET=<isi apa saja untuk lokal>
   NODE_ENV=development
   ```
4. Jalankan: `cd backend && npm run dev`
5. User default ter-*seed* otomatis saat DB kosong: `admin / <password-lihat-CREDENTIALS.local.md>` dan `direktur / <password-lihat-CREDENTIALS.local.md>` (lihat `routes/auth.js`).

Alternatif: Postgres lokal (isi `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD` di `.env.dev`).

## Aturan keras (anti ngacak-ngacak data live)
- **Jangan** develop / audit langsung ke DB prod. Pakai dev branch / lokal.
- Prod smoke read-only boleh hanya untuk inspect, pakai `HABIL_DB_TARGET=prod-smoke` dan jangan jalankan flow write.
- Script audit & repair **default `--dry-run`** (read-only). `--apply` harus eksplisit dan hanya setelah yakin.
  - Contoh: `node scripts/repair-v1181-null-batches.js` (dry-run) vs `... --apply` (eksekusi).
- `health-check-prod.js` read-only — aman dijalankan, tapi idealnya ke dev branch saat develop.
- Jangan commit isi `.env` / `.env.dev` (kredensial). Yang di-commit hanya dokumen ini.
- Frontend lokal default ke `http://localhost:5001/api` bila `REACT_APP_API_URL` kosong.
