# Habil SuperApp — Deep-Freeze Testing Report

Status: **PASS through Fase 8A; coverage expansion pending**

Current version: `v1.67.1-stable`

Date: 23 August 2026

## Safety Boundary

- `DATABASE_URL` is never accepted as a fallback; the helper requires `TEST_DATABASE_URL`.
- `NODE_ENV=test` and `ALLOW_DEEP_FREEZE_WRITES=true` are both mandatory.
- The database host must be local and the database name must contain `test` or `ci`.
- Shared, remote, audit, staging, production-smoke, and production-like targets are rejected before a connection is opened.
- DDL and transaction-control statements from a test body are blocked before reaching PostgreSQL.
- Statement/test timeout is capped at 30 seconds; lock timeout defaults to five seconds.

## Disposable Safety Gate

The initial single-connection probe ran on an ephemeral local PostgreSQL 15 cluster provisioned under `/tmp`:

| Check | Observed |
|---|---:|
| Row count before transaction | 0 |
| Row count inside transaction | 1 |
| Row count after `ROLLBACK` | 0 |
| Cluster stopped and removed | PASS |

Provisioning DDL was executed before the test transaction on the disposable cluster. No DDL ran inside the test.

## Fase 8A — Wrapper Verification

`backend/utils/testTransaction.js` exposes `createTestClient()` and `runWithRollback()` with an in-memory query ledger. The real-database verification covers:

1. Local/test-named target acceptance and remote/production-like rejection.
2. Write visibility inside the transaction followed by a real rollback.
3. Rollback after an intentional test-body exception.
4. DDL and transaction-control guard behavior without sending forbidden SQL.
5. Rollback after a bounded test timeout.

| Runtime | Result | Final fixture rows | DDL during test |
|---|---:|---:|---:|
| Node 24.19.0 | 5 / 5 PASS | 0 | 0 |
| Bun 1.4.0 | 5 / 5 PASS | 0 | 0 |

The disposable cluster was stopped and deleted after both runtime passes.
