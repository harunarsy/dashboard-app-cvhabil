# Phase 0 Baseline Report

Status: **PASS — exact known DB baseline preserved**

Date: 23 August 2026

Source commit: `f80595b31b5dc8c6abe5ffa8076859e125f59cc2`

Branch: `codex/bun-modernization-audit`

## Safety State

- Worktree is isolated from the dirty `main` worktree.
- PostgreSQL startup-level `PGOPTIONS=-c default_transaction_read_only=on` was rejected by Neon port 6543.
- Session-level `SET default_transaction_read_only = on` was verified successfully.
- DB-connected regression scripts were wrapped with a fail-closed read-only pool that verifies `transaction_read_only=on` before each query.
- HTTP smoke tests use a DB-isolated mock that rejects SQL other than `SELECT`, `SHOW`, or `WITH`.
- No database write, schema change, or migration was executed.

## Runtime and Package State

| Item | Observed state |
|---|---|
| Local runtime | Node `25.8.0`, npm `11.11.0` |
| Target baseline runtime | Node `20.20.2`, npm `10.9.9` through isolated `npx` runtime |
| Bun | `1.4.0` |
| Frontend lock | Tracked, initially out of sync with `package.json` (`yaml@2.9.0` missing) |
| Backend lock | Absent from committed HEAD; a local ignored lockfile existed in the original worktree |

Initial frontend `npm ci` failed because the committed lockfile was stale. After regenerating the lockfile deterministically, clean install and build succeeded. The updated lockfile remains uncommitted because Phase 0 stopped.

Dependency installation reported 46 frontend advisories (2 critical, 24 high, 9 moderate, 11 low) and one backend high-severity advisory. No automatic audit fix was applied.

## Verified Commands

| Check | Result |
|---|---|
| Node 20 availability | PASS — `v20.20.2` |
| npm target availability | PASS — `10.9.9` |
| PostgreSQL read-only session probe | PASS — `transaction_read_only=on` |
| Frontend clean install | PASS with synchronized lockfile |
| Frontend test | PASS — 7 suites, 16 tests |
| Frontend production build | PASS |
| Backend route regression | PASS — 18 tests; DB guard printed `transaction_read_only=on` |
| Backend HTTP smoke | PASS — 14 tests, including zero mutating DB query attempts |
| Backend DB regression | EXPECTED BASELINE — 15 pass, exactly 3 known failures |
| Backend startup smoke | PASS — Node 20 health response and graceful shutdown |

## Resolved Baseline Blocker

`backend/routes/marketplace.js` invokes `ensureSchema()` at module import. The function contains `CREATE TABLE`, `CREATE INDEX`, and `ALTER TABLE` statements. Importing the Express app during HTTP smoke testing therefore attempted DDL despite `NODE_ENV=test`.

The fail-closed HTTP DB mock rejected the query before any PostgreSQL connection was used. Human approval was obtained before applying the minimal fix.

**Pre-existing issue:** `ensureSchema()` DDL on import. Fixed with a minimal test-mode guard to enable baseline testing. No schema logic was moved or otherwise changed.

The complete Phase 0 suite was rerun after the fix. HTTP smoke reported zero mutating query attempts.

## Verified Database Baseline

The database regression baseline remains exactly 15 pass and three known failure categories:

- Six duplicate active-batch groups.
- Two purchase orders whose status does not match received quantities.
- One active inventory batch with negative stock.

Every query in the DB regression run executed only after the test guard printed `transaction_read_only=on`. No database write or schema mutation occurred.
