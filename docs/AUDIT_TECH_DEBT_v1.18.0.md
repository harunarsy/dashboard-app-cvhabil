# Audit & Tech Debt — v1.18.0

**Date:** 2026-06-03
**HEAD:** 72519e3 (v1.17.2)
**Scope:** Refactor plan, non-breaking MasterSelect prop, future DB cleanup

---

## 1. InvoiceList Split (Phased Refactor)

### Goal
Break up the monolithic `InvoiceList.jsx` (~4000+ lines) into maintainable modules without changing visible behavior.

### Phase 1 — Extract Format Utilities (Pure, Safe)
- Move all currency/date formatting helpers and constants from `InvoiceList.jsx` into `frontend/src/utils/invoice-format.js`.
- No functional change — just relocate pure functions.
- **Risk:** Near-zero (pure re-exports).

### Phase 2 — Extract InvoiceFormModal
- Move invoice create/edit modal into `frontend/src/components/InvoiceFormModal.jsx`.
- Extract all form state, validation, and submit logic from `InvoiceList.jsx`.
- **Risk:** Medium — requires verifying all parent callbacks (onSave, onClose, etc.) still wire up correctly.

### Phase 3 — Extract InvoiceTable
- Move the table/list rendering component into `frontend/src/components/InvoiceTable.jsx`.
- Keep list-level state (pagination, selection, sort) in parent or a shared hook.
- **Risk:** Medium — requires confirming all column renderers, action buttons, and row event handlers are self-contained.

### Future (v1.19+)
- Extract `InvoiceFilters` (search, date range, status filter).
- Extract `InvoiceSummary` (totals footer).
- Consider `useInvoiceList` custom hook for shared pagination/filter state.

---

## 2. MasterSelect — Non-breaking `onSelect(optionObject)` Prop

### Current API
```jsx
<MasterSelect
  value={selectedName}       // string
  onChange={(name) => ...}   // string callback
  options={[{ name: '...' }, { name: '...' }]}
  onAdd={async (name) => ...}
  onRemove={async (name) => ...}
  onRename={async (oldName, newName) => ...}
/>
```

### New API (Additive, Non-breaking)
```jsx
<MasterSelect
  value={selectedName}
  onChange={(name) => ...}        // unchanged — string callback still works
  onSelect={(option) => ...}      // NEW — full option object { name, ...rest }
  options={[{ name: '...', ...rest }]}
  ...
/>
```

### Implementation
- If `onSelect` is passed, call it inside `handleSelect` with the full option object (found by matching `opt.name === name`).
- `onChange` continues to fire with just the string as before.
- `onSelect` is purely additive — existing callers pass `onChange` only and see zero change.

### Impact
- **Zero breaking changes.** All current consumers continue to work unchanged.
- `onSelect` is optional; old code works without modification.
- See `frontend/src/components/MasterSelect.jsx` for the implementation diff.

### Migration Path (Optional — Not Urgent)
- New code that needs the full option object can use `onSelect`.
- Existing `onChange`-only callers can stay as-is forever.
- No grep-and-replace needed.

---

## 3. Future DB Cleanup: Column Renames

These are **not** scheduled yet — documented here for the next major version.

| Current Name | Should Be | Table | Reason |
|---|---|---|---|
| `invoices.hna_final` | `invoices.hpp_final` (or keep `hna_final`?) | invoices | `hna` is historical terminology; actual field stores HPP after disc |
| `invoices.final_hna` | Removed (duplicate of `hna_final`) | invoices | Both `hna_final` and `final_hna` exist — likely the same data |
| `invoices.ppn_masukan` | `invoices.ppn_input` | invoices | Inconsistent naming (`ppn_input` already exists) |
| `invoices.ppn_input` | Keep `ppn_input` | invoices | Already the canonical name |

### Cleanup Steps (When Scheduled)
1. Confirm `hna_final` and `final_hna` contain identical data.
2. If identical: drop `final_hna`, rename `hna_final` → `hpp_final` (or keep `hna_final` for backward compat).
3. Confirm `ppn_masukan` == `ppn_input` in all rows.
4. If identical: drop `ppn_masukan`.
5. Update all backend queries and frontend references in the same deploy.

---

## 4. Batch Null Policy — FEFO Deterministic Tiebreaker

### Problem
When two active batches for the same product have the same `expired_date` (both non-null), FEFO selection is non-deterministic because `ORDER BY expired_date ASC, id ASC` is not always guaranteed stable across queries.

### Current Query Pattern (Example)
```sql
SELECT * FROM inventory_batches
WHERE product_id = $1 AND is_active = TRUE AND qty_current > 0
ORDER BY expired_date ASC NULLS LAST, id ASC
```

### Policy
- **Primary sort:** `expired_date ASC NULLS LAST` (earliest expiry first).
- **Tiebreaker:** `id ASC` (oldest batch first).
- This ensures deterministic FEFO: same data always produces the same order.

### Enforcement
- Add `id ASC` to all FEFO queries in the backend.
- Review and update all batch-picking logic in:
  - `backend/routes/inventory.js`
  - `backend/routes/sales.js`
  - `backend/routes/purchase.js`
  - Any `hpp` calculation that picks a batch.

### Non-issue
- Batches with NULL expired_date are **always** sorted last (`NULLS LAST`), which is the safest default (assume longest shelf life).

---

## Summary of v1.18.0 Deliverables

| Item | Type | File(s) | Status |
|---|---|---|---|
| MasterSelect `onSelect` prop | Non-breaking feature | `frontend/src/components/MasterSelect.jsx` | Implemented |
| Audit/Tech Debt doc | Documentation | `docs/AUDIT_TECH_DEBT_v1.18.0.md` | Created |
| InvoiceList split plan | Plan only | This doc Section 1 | Planned |
| InvoiceList actual split | Code | (deferred to v1.19+) | Not started |
| DB column cleanup | Plan only | This doc Section 3 | Planned |
| Batch null policy | Guideline | This doc Section 4 | Documented |

---

## Version Bump Notes

When tagging v1.18.0:
```
git add -A && git commit -m "v1.18.0: audit tech debt plan + MasterSelect onSelect prop"
git tag -a v1.18.0 -m "v1.18.0: audit tech debt plan + MasterSelect onSelect prop"
```
