# ED Dual Precision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development. Controller runs all tests/build/DB/git operations; workers edit only assigned files and never spawn agents.

**Goal:** Input ED bulan/tahun berfungsi di seluruh aplikasi sambil mempertahankan tanggal lengkap existing.

**Architecture:** PostgreSQL DATE tetap canonical; nullable precision metadata mempertahankan makna day/month. Parser backend ED khusus dan helper/component frontend ED khusus menyatukan input, snapshots, FEFO, tampilan dan dokumen.

**Tech Stack:** React 19, Express 5/CommonJS, PostgreSQL, Vitest, jsPDF.

**Spec:** `docs/superpowers/specs/2026-09-29-expiry-precision-design.md`

## Global Constraints
- Existing tanggal lengkap tidak dibulatkan/backfill, NULL tanggal tetap NULL.
- `month` = DATE akhir bulan; `day` = tanggal lengkap sumber. Existing precision NULL dibaca day.
- `expired_date_precision`, `expired_date_snapshot_precision`, `original_expired_date_precision`, `replacement_expired_date_precision` adalah nama metadata resmi.
- Owner sudah mengizinkan migration, commit dan push main produksi. Controller backup/verify sebelum migration.
- No changes user work `.gitignore`, `AGENTS.md`, untracked tooling/core/Docker; no secret output.
- Workers tidak menjalankan test/build/DB/git stage/commit/push. Test-first dilakukan lewat checkpoint controller.

---

### Task 1: Backend ED contract, migrations and writers

**Files:** create `backend/utils/expiry.js`, `backend/scripts/test-expiry.js`; modify `backend/migrations/routeSchemas.js`, `backend/routes/{inventory,invoices,purchaseOrders,sales,loans}.js`, `backend/services/invoiceDeltaService.js`, `backend/utils/invoiceDelta.js`, `backend/package.json`, relevant backend test fixtures.

**Interfaces:** exports `normalizeExpiry(value, precision)` → `{ date: string|null, precision: 'day'|'month'|null }`; error with `code='INVALID_DATE'`, status 400. Parse only valid calendar, trim empty, accept legacy ISO timestamp date prefix. Precision omitted + full DATE = day; omitted + YYYY-MM = month. Explicit month + DATE requires end-of-month. Shared helper used all ED writes, never global optionalDbDate behavior for non-ED dates.

- [ ] Write tests first around existing `optionalDbDate('2028-02', 'expired_date')` expecting `2028-02-29` and legacy `2027-05-12` unchanged. Add helper tests once exported contract exists. Controller run and record expected failing month case.
- [ ] Implement strict helper and additive migration `20260929_023_expiry_precision`: six nullable TEXT columns on inventory_batches/invoice_items/sales_items/loan_items/sales_adjustment_items, CHECK precision IN ('day','month') or NULL. Do not UPDATE old dates. Keep migration transactional via existing runner.
- [ ] Normalize all inputs before SQL; propagate precision across explicit projections, item/batch INSERT/UPDATE, delta snapshots/hash/comparison/audit, loan conversion/returns and adjustment quarantine. Preserve unchanged historical snapshots when editing non-batch data. Return 400 for invalid ED, never SQL 500.
- [ ] Delta tests verify same date but changed precision is metadata change, legacy omission no-op, empty clears both. Controller run backend suite, inspect query placeholder alignment, review all SQL writers.

### Task 2: Frontend input, logic and document ED

**Files:** create `frontend/src/utils/expiry.js`, `frontend/src/components/common/ExpiryInput.jsx`, corresponding tests; modify audited ED callers across InvoiceList, InventoryDashboard, inventory BatchFormModal/ProductDrawer/OpnameModal, PurchaseOrderList, SalesOrderList, LoanList, NotaPreview, WA/PDF legacy/v2/helpers/golden fixtures.

**Interfaces:** `formatExpiry(value, precision, fallback='-')`, `expiryDate(value, precision)`, `expiryInputValue(value, precision)` and `ExpiryInput({value,precision,onChange, ...props})`; `onChange(dateValue, precision)` keeps exact old date if not interacted. Month control value YYYY-MM with precision month; day control YYYY-MM-DD. Defaults new empty to month; existing nonempty metadata omitted to day.

- [ ] Write behavioral tests first for month labels, full legacy day labels, leap-Feb canonical date, mode toggling and unchanged exact date. Controller run targeted Vitest and record failure before production changes.
- [ ] Build ED helper/component using existing styles and native month/date with visible mode selector. User requested autonomous completion; apply anti-slop during work without extra preference question. No redesign unrelated UI.
- [ ] Replace five ED inputs and propagate precision state/payload/edit/prefill/drafts. Fix snapshot refresh only when batch changes; auto-selected product clears stale ED and takes chosen batch date+precision. Invoice delta preview renders before/after ED.
- [ ] ED formatting only for ED at all list/picker/preview/PDF/WA surfaces. Keep general date formatters for non-ED dates. Carry precision in model/grouping; use local date-only parsing for timezone stability; invalid ED not considered expired; expired condition `days < 0` aligns backend >= CURRENT_DATE.
- [ ] Controller FE test/build plus PDF parity/golden review and task review.

### Task 3: Review, database migration and shipping

**Files:** `ACTION_LOG.md`, `CHANGELOG.md`, `README.md`, `SUPERAPP_BRAIN.md`, frontend version markers, feature spec/plan.

- [ ] Independent review backend/frontend contract, day legacy round-trip, six SQL metadata fields, preview/hash/delta, PDF/WA and explicit projections. Fix only proven regressions then repeat covering tests.
- [ ] Controller inspect migration runner/database config and backup tools; backup target database, capture counts/hash of old ED columns in read-only query; apply migration explicitly; verify six columns and identical legacy dates. Exercise new day/month writes under BEGIN/ROLLBACK, no persisted test rows.
- [ ] Version bump `v1.67.22-stable`; update logs with actual evidence and rollback (redeploy previous app, leave additive metadata).
- [ ] Run backend npm test, frontend Vitest/build, version checker and diff check. Inspect git status/diff/log -10, stage intended files only, commit matching repo style. Fetch/recheck remote then push main without force.
- [ ] Verify production health, new assets/version, read-only ED data projection. Record deployment result and final commit/DB/test evidence.
