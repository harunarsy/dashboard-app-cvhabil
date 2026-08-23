# Fase 7D — Explicit Schema Lifecycle Report

Status: **PASS — code extraction only; migration not executed**

Version: `v1.66.23-stable`

Date: 23 August 2026

## Outcome

- Removed import-time schema mutation from 17 backend routes.
- Moved tables, columns, indexes, default seeds, sequence repairs, and legacy one-time backfills into `backend/migrations/routeSchemas.js`.
- Added `backend/scripts/migrate.js` as the only supported route-schema execution path.
- Added the schema-boundary regression to mandatory backend CI.
- Removed the obsolete runtime `migrationOnce` helper and DDL ownership from `formDrafts`.
- Normal Node/Bun server startup now performs zero database statements before a request.

No migration command was executed against PostgreSQL during this phase.

## Deployment Contract

Inventory without a DB connection:

```bash
cd backend
npm run migrate:schema:list
```

Actual execution is intentionally fail-closed and requires all of the following:

- `NODE_ENV` must not be `test`.
- `ALLOW_SCHEMA_MIGRATION=true`.
- `MIGRATION_TARGET_CONFIRM` must exactly match the resolved database hostname.
- `HABIL_DB_TARGET` must not be `audit` or `prod-smoke`.
- The baseline `invoices` and `invoice_items` relations must already exist.
- If `app_users` is empty, both seed-password environment variables must be supplied.

The runner uses one explicit transaction, a transaction-scoped advisory lock, a ten-second lock timeout, a four-minute statement timeout, and rollback on failure. PostgreSQL sequence operations (`setval`) are inherently non-transactional; schedule first execution as a controlled deployment with a verified backup.

## Verification

| Check | Result |
|---|---:|
| Route DDL/static initializer inventory | 0 findings |
| Migration registry | 17 ordered steps |
| Registry mock execution + second-run idempotency | PASS |
| Missing baseline relation preflight | Fail-closed before migration |
| `--list` under test mode | PASS; no DB pool load |
| Test-mode execution refusal | PASS; no DB pool load |
| Missing exact-host confirmation | Refused before DB pool load |
| Transaction/advisory-lock controls | Present and ordered |
| Mocked development app import | 0 DB statements |
| Node 24 + Bun development startup/health/shutdown | PASS; unreachable DB; 0 query |
| Frontend Vitest + build (Node 24 / Bun) | 10 files / 25 tests; PASS |
| HTTP smoke | 17/17; 0 mutation attempt |
| Route regression | 18/18; DB session proven read-only |
| Smart-Assistant contract | 5/5 |
| Pricing regression | 38/38 |
| Compatibility checks | 5/5 |
| Live assistant integration (Node 24 / Bun) | 8/8 bounded; read-only proven |
| DB regression (Node 24 / Bun) | 15 pass / exact 3 known failures; read-only proven |
| npm audit (frontend/backend) | 0 vulnerabilities |

## Behavior Change

Schema errors were previously logged and swallowed during route import. Routes now assume deployment has applied the required schema; a missing relation or column fails the affected request instead of silently attempting DDL from the web process. Migration failures are surfaced and stop deployment.

## Rollback

This phase did not mutate a database, so rollback is code-only: revert the Fase 7D commit. Do not run a down migration or reset PostgreSQL. If the explicit migration is authorized in a future deployment, prepare and test a separate database rollback procedure first.
