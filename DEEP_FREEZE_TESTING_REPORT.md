# Habil SuperApp — Deep-Freeze Testing Report

Status: **PASS through Fase 8C; safety-net and guide work remain**

Current version: `v1.67.3-stable`

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

## Fase 8B — Write-Operation Coverage

The disposable database was provisioned with the complete application schema: 47 public tables and all 17 explicit route-schema migrations. Six scenarios then ran exclusively inside `runWithRollback()`:

| Scenario | Mutation verified inside transaction | State verified after rollback |
|---|---|---|
| Create Purchase Order | Header and item joined with expected subtotal | Header/item absent; counts restored |
| Edit Sales Nota | Header total/note and item quantity/price changed | Original header/item values restored |
| Update stock | Batch reduced and outbound mutation visible | Original quantity restored; mutation absent |
| Delete operation | Distributor removed | Original distributor row restored |
| Authentication | User created, password checked, JWT session verified and disposed | Test user absent |
| Batch operation | Batch and inbound mutation joined | Batch/mutation absent |

Node 24.19.0 and Bun 1.4.0 each passed 6/6. After both runs:

- row/value fingerprint: **unchanged**;
- all public sequence fingerprint: **unchanged**;
- DDL executed during tests: **0**;
- disposable cluster cleanup: **PASS**.

## Fase 8C — Existing Suite Integration

`backend/scripts/test-route-http.js` supports an explicit `DEEP_FREEZE_MODE=true` branch. The branch injects a transaction-aware database pool into the Express app; route-level `BEGIN`/`COMMIT` is translated to savepoints while all ordinary queries remain on the wrapper's outer connection. The default HTTP smoke path remains DB-mocked and mutation-blocked.

Six actual write routes were exercised against the fully provisioned disposable schema:

| Route flow | Mutation verified inside transaction | State verified after rollback |
|---|---|---|
| Create Purchase Order | Header and item created | Both absent; counts restored |
| Edit Sales Nota | Header/item and stock mutation resynced | Original nota, stock, and mutation state restored |
| Stock out | Batch reduced and outbound mutation created | Original batch quantity; mutation absent |
| Delete distributor | Distributor deleted | Original distributor restored |
| Login/session/logout | Authenticated read and logout flow | `app_users` count restored |
| Stock in | Batch and inbound mutation created | Both absent; counts restored |

| Runtime | Result | DDL during test | Cleanup |
|---|---:|---:|---:|
| Node 24.19.0 | 6 / 6 PASS | 0 | disposable cluster removed |
| Bun 1.4.0 | 6 / 6 PASS | 0 | disposable cluster removed |

Route-generated serial IDs are deliberately not included in the HTTP sequence fingerprint claim. The cluster is disposable and is destroyed after both runtime passes; direct Fase 8B tests retain the stronger sequence-fingerprint assertion using explicit IDs.
