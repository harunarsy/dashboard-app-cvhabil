# Runtime Hardening and Promotion Report

Status: **PASS**

## Current Runtime Policy

- Node `24.19.0` LTS is pinned in `.nvmrc` and `.node-version` and is the only supported Node engine (`>=24.19.0 <25`).
- npm `10.9.9` remains the default package manager.
- Bun `1.4.0` remains a reversible package-manager and backend-runtime pilot, not the production default.
- CI runs mandatory frontend and DB-independent backend gates on Node `24.19.0`.

Node 20 reached EOL on 24 March 2026 and was removed from engines and CI after Node 24 parity passed. Official references: <https://nodejs.org/en/about/eol> and <https://nodejs.org/en/about/previous-releases>.

## CI Scope

- Frontend: clean npm install, Vitest suite, production build.
- Backend: DB-independent route regression, DB-isolated HTTP smoke, pricing engine tests.
- Database regression remains local/manual and must use the fail-closed read-only guard unless a dedicated isolated test database is explicitly provisioned.

No database secrets or write-capable database steps are present in CI.

## Node 24 Promotion Verification

| Gate | Node 24.19.0 |
|---|---:|
| Frontend tests | 9 files / 23 tests |
| Frontend build | PASS |
| Backend compatibility | 5 / 5 |
| Smart-Assistant contract | 5 / 5 |
| Pricing engine | 38 / 38 |
| HTTP smoke | 17 / 17, zero mutation |
| Route regression | 18 / 18, read-only proven |
| Live assistant | 8 / 8 bounded, read-only proven |
| DB regression | 15 pass / 3 known failures, exact baseline |
| Startup/health/shutdown | PASS |

Fase 7C subsequently resolved the 529.37 kB warning through on-demand workbook loading; all production chunks are now below 500 kB.

## Historical Baseline

Fase 1 originally pinned Node `20.20.2` and ran Node 20/24 in parallel to establish migration evidence. Those results remain available in Git history and `BASELINE_REPORT.md`; they are no longer the active runtime policy.
