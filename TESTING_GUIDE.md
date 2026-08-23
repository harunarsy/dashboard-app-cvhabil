# Deep-Freeze Testing Guide

Panduan ini hanya untuk test database disposable lokal. Jangan arahkan deep-freeze ke Neon, Supabase, staging, audit, production-smoke, atau database bersama.

## Safety contract

- `TEST_DATABASE_URL` wajib ada; `DATABASE_URL` tidak pernah dipakai sebagai fallback.
- `NODE_ENV=test` dan `ALLOW_DEEP_FREEZE_WRITES=true` wajib diset eksplisit.
- Host harus lokal (`127.0.0.1`, `localhost`, atau `::1`) dan nama database harus mengandung `test` atau `ci`.
- Schema dan migration hanya dijalankan pada tahap provisioning sebelum test. Test body tidak boleh menjalankan DDL.
- Setiap write harus melalui `runWithRollback()`: koneksi yang sama menjalankan `BEGIN`, operasi test, lalu `ROLLBACK` di `finally`.
- Batas statement/test adalah 30 detik; lock timeout default 5 detik.
- Mismatch row count atau rollback yang gagal menghasilkan kode `ROLLBACK_FAILED` dan menghentikan suite.

## Provision disposable PostgreSQL

Contoh berikut memakai PostgreSQL lokal. Sesuaikan binary PostgreSQL dan port dengan mesin masing-masing.

```bash
PG_BIN=/opt/homebrew/opt/postgresql@15/bin
TEST_PGDATA=$(mktemp -d /tmp/habil-deep-freeze.XXXXXX)
TEST_PGPORT=55443
TEST_DB=habil_phase8_test
TEST_DB_USER=$(id -un)

"$PG_BIN/initdb" -D "$TEST_PGDATA" --no-locale --encoding=UTF8
"$PG_BIN/pg_ctl" -D "$TEST_PGDATA" \
  -o "-p $TEST_PGPORT -c listen_addresses=127.0.0.1" \
  -l /tmp/habil-deep-freeze-postgres.log start
"$PG_BIN/createdb" -h 127.0.0.1 -p "$TEST_PGPORT" -U "$TEST_DB_USER" "$TEST_DB"

"$PG_BIN/psql" -h 127.0.0.1 -p "$TEST_PGPORT" -U "$TEST_DB_USER" \
  -d "$TEST_DB" -v ON_ERROR_STOP=1 -f backend/schema.sql

HABIL_ENV_LOADED=1 HABIL_ENV_FILE=deep-freeze-provision \
NODE_ENV=development HABIL_DB_TARGET=dev \
ALLOW_SCHEMA_MIGRATION=true MIGRATION_TARGET_CONFIRM=127.0.0.1 \
DB_USER="$TEST_DB_USER" DB_HOST=127.0.0.1 DB_PORT="$TEST_PGPORT" \
DB_NAME="$TEST_DB" DB_PASSWORD= \
SEED_ADMIN_PASSWORD=deep-freeze-only \
SEED_DIREKTUR_PASSWORD=deep-freeze-only \
node backend/scripts/migrate.js

"$PG_BIN/psql" -h 127.0.0.1 -p "$TEST_PGPORT" -U "$TEST_DB_USER" \
  -d "$TEST_DB" -v ON_ERROR_STOP=1 \
  -f backend/test/fixtures/deep-freeze-baseline.sql
```

Set target test setelah provisioning:

```bash
export TEST_DATABASE_URL="postgresql://${TEST_DB_USER}@127.0.0.1:${TEST_PGPORT}/${TEST_DB}"
export NODE_ENV=test
export ALLOW_DEEP_FREEZE_WRITES=true
```

## Test commands

Run from repository root, dengan target disposable di atas:

| Command | Coverage |
|---|---|
| `npm --prefix backend run test:transaction` | Wrapper: success, exception, timeout, target guard, rollback dummy row |
| `npm --prefix backend run test:deep-freeze-writes` | Enam operasi database write langsung |
| `npm --prefix backend run test:deep-freeze-safety` | Row-count monitor dan explicit dummy rollback verification |
| `npm --prefix backend run test-http:deep-freeze` | Enam route Express write nyata melalui adapter savepoint |
| `npm --prefix backend run test-route:deep-freeze` | Entry point route regression dalam deep-freeze mode |
| `npm --prefix backend run test-db:deep-freeze` | Entry point DB regression dalam deep-freeze mode |
| `bun backend/scripts/test-transaction-wrapper.js` | Wrapper yang sama pada Bun |
| `bun backend/scripts/test-deep-freeze-writes.js` | Write-operation coverage pada Bun |
| `bun backend/scripts/test-deep-freeze-safety.js` | Safety net pada Bun |
| `DEEP_FREEZE_MODE=true bun backend/scripts/test-route-http.js` | HTTP route coverage pada Bun |
| `DEEP_FREEZE_MODE=true bun backend/scripts/test-route-regression.js` | Route entry point pada Bun |
| `DEEP_FREEZE_MODE=true bun backend/scripts/test-regression.js` | DB entry point pada Bun |

Perintah normal `test-http`, `test-route`, dan `test-db` tetap read-only/mock dan tidak membutuhkan target write. Jangan menambahkan `DEEP_FREEZE_MODE=true` saat memakai database bersama.

## Expected evidence

Output yang valid harus menunjukkan query akhir `ROLLBACK`, row count kembali ke baseline, tidak ada DDL selama test, dan cluster disposable dapat dihentikan/dihapus. Untuk HTTP route yang memakai serial ID, row/value rollback diverifikasi; sequence fingerprint tidak diklaim karena route memang meminta ID serial sebelum rollback.

Jika row count berubah, dummy row tersisa, DDL terdeteksi, timeout melewati batas, atau rollback gagal: hentikan autopilot, simpan log query, dan jangan rerun pada target yang sama sebelum penyebabnya dipahami.

## Cleanup

Setelah seluruh runtime selesai, stop PostgreSQL disposable dengan `pg_ctl -m fast stop`, lalu hapus direktori cluster temporary yang telah dibuat. Jangan menghapus direktori proyek atau database di luar target disposable.
