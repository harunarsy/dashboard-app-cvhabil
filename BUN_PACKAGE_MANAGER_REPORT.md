# Phase 2 Bun Package-Manager Pilot

Status: **PASS WITH NON-BLOCKING CAVEATS**

## Scope

- Bun version: `1.4.0`.
- Frontend and backend remain separate packages.
- npm scripts and both `package-lock.json` files remain unchanged and authoritative fallback artifacts.
- No default script was changed from Node to Bun.

## Lock and Install Results

| Package | npm lock entries | Bun lock entries | Bun full install |
|---|---:|---:|---:|
| Backend | 181 | 176 | 175 packages in 1.51 s |
| Frontend | 1426 | 1349 | 1348 packages in 6.00 s |

Bun migrated each lock from the corresponding npm lockfile. Every declared direct dependency resolved to the same version under npm and Bun.

The lower Bun lock counts reflect a different lock/deduplication representation. Backend `npm ls --all` reported no problems after Bun install. Frontend reported two nested packages as extraneous from npm's perspective: `yaml@2.9.0` under `postcss-load-config` and `picomatch@4.0.4` under `fdir`. These did not cause missing-module, peer, test, or build failures.

## Verification

| Check through Bun-installed tree | Result |
|---|---|
| Backend DB-independent route regression | 15 pass, 0 fail |
| Backend HTTP smoke | 14 pass, 0 fail; zero mutating-query attempts |
| Backend pricing engine | 38 pass, 0 fail |
| Backend DB regression | Exact baseline: 15 pass, 3 known failures; `transaction_read_only=on` |
| Frontend test | 7 suites, 16 tests pass |
| Frontend production build via `bun run build` | Pass |
| Bun frozen-lock dry run | Pass for frontend and backend |

`bun run` still invokes the existing explicit `node` commands in backend package scripts. Therefore these results validate Bun as installer/script launcher, not as backend runtime; runtime validation belongs to Phase 3.

## Artifact Difference

The CRA build under `bun run` produced small gzip-size differences compared with the npm/Node baseline. A follow-up Node 20 build over the Bun-installed tree returned most chunk sizes to the npm baseline, isolating the larger difference to runner/tooling behavior. No functional regression was detected, but byte-identical build output is not claimed.

## Decision

- Keep npm `10.9.9` as the official fallback/default package manager.
- Commit `bun.lock` files as reproducible pilot artifacts.
- Proceed to the parallel backend Bun runtime pilot without changing default Node scripts.
