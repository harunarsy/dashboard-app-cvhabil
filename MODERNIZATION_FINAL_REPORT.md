# Habil SuperApp Modernization — Final Report

Status: **PASS through Fase 8C; Fase 8D–8E remain**

Branch: `codex/bun-modernization-audit`

Current version: `v1.67.3-stable`

Execution date: 23 August 2026

## Outcome

- Node 24.19.0 LTS is the official default runtime; Node 20 has been retired from engines and CI after reaching EOL.
- Bun 1.4 is available as a reversible package-manager and backend-runtime pilot; Node remains default because Bun used about 22% more RSS in the final startup benchmark.
- Frontend now uses Vite 8, Vitest 4, and local Tailwind 4/PostCSS. CRA and Tailwind CDN are removed.
- Socket.io and every repository-local emitter are removed after confirming there is no frontend consumer.
- Habil Smart-Assistant is implemented as a transparent deterministic rule engine. It does not use an LLM SDK, Python, RAG, or a vector database.
- `PRODUCT.md`, `DESIGN.md`, the Smart-Assistant surface brief, and the Impeccable sidecar preserve the shipped product and visual decisions for future agents.
- Frontend interaction styling now uses semantic action, selection, focus, information, and status roles instead of hue-bound component tokens or vendor-style doctrine.
- Deep-freeze write tests now have a fail-closed, same-connection rollback wrapper restricted to local disposable test databases.
- Six write-operation scenarios now prove rollback for PO, nota, inventory, delete, authentication, and batch flows without changing row/value or sequence fingerprints.
- Six actual Express write routes now run through the same-connection deep-freeze adapter; row counts and fixture values restore for Node and Bun with zero DDL during test.
- PostgreSQL remained read-only throughout execution. No DML, DDL, migration, or schema mutation was executed.

## Phase Ledger

| Phase | Version | Commit | Result |
|---|---|---|---|
| 0 — Safety and baseline | v1.66.9 | `3428c53` | Minimal marketplace DDL test guard; full baseline preserved |
| 1 — Runtime hardening | v1.66.10 | `133ffc4` | Node 20 pin, npm fallback, CI matrix |
| 2 — Bun package manager | v1.66.11 | `ddbf180` | Reversible Bun locks and dependency/test parity |
| 3 — Bun backend runtime | v1.66.12 | `666446c` | Parallel scripts and compatibility benchmark |
| 4A–4E — Frontend | v1.66.13–v1.66.17 | `975ecb4`–`f493f0a` | Vite/Vitest/Tailwind migration, CRA removal, UI hardening |
| 5 — Socket.io cleanup | v1.66.18 | `aeb8bef` | Dead realtime infrastructure removed |
| 6 — Smart-Assistant | v1.66.19 | final phase commit | Rule engine, secured API, premium transparent UI |
| 7A — Dead weight/security | v1.66.20 | `c0dbc3d` | Three/Vanta removal and zero npm advisories |
| 7B — Node 24 promotion | v1.66.21 | phase commit | Node 24.19.0 default, engine/CI parity |
| 7C — Bundle optimization | v1.66.22 | phase commit | Workbook loaded on demand; all chunks below 500 kB |
| 7D — Explicit schema lifecycle | v1.66.23 | phase commit | 17 route schema initializers extracted; normal startup executes zero DDL |
| 7E — Design-system liberation | v1.67.0 | phase commit | Semantic interaction roles, accessible contrast, and doctrine-neutral product/design contracts |
| 8A — Transaction wrapper | v1.67.1 | phase commit | Local/test-only target guard; success/error/timeout rollback parity on Node and Bun |
| 8B — Write coverage | v1.67.2 | phase commit | Six full-schema scenarios; row/value and sequence fingerprints unchanged |
| 8C — Existing suite integration | v1.67.3 | current phase commit | Six HTTP write routes; row/value rollback parity on Node and Bun; zero DDL |

## Smart-Assistant Architecture

- Endpoint: `POST /api/ai/recommendations`.
- Access: authenticated `admin` and `direktur`; `pajak` receives `403`.
- Controls: 30 requests/minute, 500-character input bound, 12-item output bound, ten-second request timeout, three-second query timeout, and structured errors.
- Data boundary: every data load starts with `BEGIN READ ONLY`, verifies `transaction_read_only=on`, then finishes with `ROLLBACK`.
- Reused rules:
  - weighted 30/90-day sales velocity and stock-life threshold under 21 days;
  - existing product-health weighted score;
  - customer dormancy after 30 days without a final order;
  - current seven-day sales compared with the previous seven days.
- Recommendations expose severity, reason, evidence, and an internal action path. The UI states that results are rule-based and advisory.

## Final Verification

| Gate | Node 20.20.2 | Node 24.19.0 | Bun 1.4.0 |
|---|---:|---:|---:|
| Frontend Vitest | 9 files / 23 tests | 11 / 28 | 11 / 28 |
| Frontend production build | PASS | PASS | PASS |
| Assistant contract | 5 / 5 | 5 / 5 | 5 / 5 |
| HTTP smoke | 17 / 17, zero mutation | 17 / 17, zero mutation | 17 / 17, zero mutation |
| Deep-freeze HTTP routes | — | 6 / 6; rows/values restored | 6 / 6; rows/values restored |
| Route regression | 18 / 18, read-only proven | 18 / 18, read-only proven | 18 / 18, read-only proven |
| Live assistant integration | 8/8 bounded; read-only proven | 8/8 bounded; read-only proven | 8/8 bounded; read-only proven |
| Schema boundary | — | 9 / 9; zero startup statement | 9 / 9; zero startup statement |
| Bun compatibility | — | — | 5 / 5 |
| Startup/health/graceful shutdown | PASS | PASS | PASS |

Live assistant source rows were `restock=9`, `dormant=48`, and `weekly=1`. The npm and Bun direct frontend trees resolve the same Tailwind `4.3.3`, PostCSS `8.5.26`, Vite `8.2.2`, and Vitest `4.1.11` versions.

## Runtime Benchmark

Three rounds, 25 local `/api/health` requests per round:

| Metric | Node 20.20.2 | Bun 1.4.0 |
|---|---:|---:|
| Average startup | 195.30 ms | 165.87 ms |
| Average RSS | 89.09 MB | 109.06 MB |
| Average health latency | 0.409 ms | 0.265 ms |
| Average p95 health latency | 0.668 ms | 0.441 ms |

Bun was faster in this local smoke benchmark but used about 22% more memory, so runtime promotion was not justified.

## Preserved Known DB Baseline

Both Node and Bun returned exactly `15 PASSED, 3 FAILED` after proving `transaction_read_only=on`:

1. Six duplicate active-batch groups.
2. Two purchase orders whose status does not match received quantities.
3. One active batch with negative stock.

These are pre-existing production-data findings. They were not modified or masked.

## Accepted Tradeoffs and Follow-up

- Vite chunk warning is resolved without raising the threshold: Online Store fell from 529.37 kB to 40.47 kB and the on-demand workbook chunk is 489.21 kB.
- Frontend and backend `npm audit` report zero advisories after targeted upgrades, including SheetJS 0.20.3 from its official distribution.
- Node 20 results are retained above only as historical rollback evidence; Node 24.19.0 is the supported default.
- Route imports are now DDL-free. The extracted migration registry is deployment-only, fails closed without explicit enablement and exact-host confirmation, and was **not executed** during modernization.
- Design tokens are now role-based; current color values are replaceable defaults. The detailed inventory and contrast evidence are recorded in `DESIGN_LIBERATION_REPORT.md`.
- The one-time final Impeccable detector returned zero errors and six bounded pre-existing warnings; no finding was suppressed or misreported.

## Rollback

Each phase is isolated by commit and version. Roll back the latest phase without discarding later user work by reverting its commit; do not reset the branch or database. Node/npm paths and npm lockfiles remain available.
