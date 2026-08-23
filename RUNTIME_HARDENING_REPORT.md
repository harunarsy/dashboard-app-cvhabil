# Phase 1 Runtime Hardening Report

Status: **PASS**

## Runtime Policy

- Node `20.20.2` is pinned as the legacy deployment-compatibility baseline requested by the owner.
- npm `10.9.9` is the official fallback package manager.
- Package engine ranges also allow supported Node 22/24 so migration can be tested without manifest churn.
- CI runs Node `20.20.2` and Node `24` in parallel.

## Security Note

Node 20 reached official end-of-life on 24 March 2026 and no longer receives upstream security fixes. It is retained only to reproduce the current deployment baseline. Node 24 LTS is the supported comparison lane and should replace Node 20 after application/deployment parity is verified.

Official reference: <https://nodejs.org/en/about/eol>

## CI Scope

- Frontend: clean install, Jest/RTL suite, production build.
- Backend: DB-independent route regression, DB-isolated HTTP smoke, pricing engine tests.
- Database regression remains local/manual and requires the fail-closed read-only guard plus an explicit audit credential.

No database secrets or write-capable database steps are present in CI.

## Verification

| Runtime | Frontend | Backend DB-independent suites |
|---|---|---|
| Node 20.20.2 | 16/16 tests and production build pass | 15 route + 14 HTTP + 38 pricing tests pass |
| Node 24 | 16/16 tests and production build pass | 15 route + 14 HTTP + 38 pricing tests pass |

Node 24 production build emits a CRA dependency deprecation warning for `fs.F_OK`, but compiles successfully. This is additional evidence for replacing CRA during Phase 4; it is not an application regression.

The committed backend lockfile now makes `npm ci` reproducible. The frontend lockfile remains synchronized from Phase 0.
