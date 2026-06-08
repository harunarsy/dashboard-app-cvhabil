# Smoke Checklist — Cross-Platform UX Stability (v1.17.3)

This checklist verifies that every major page in Habil SuperApp renders correctly on
small mobile (375px), standard mobile (390–414px), tablet (768px), and desktop (≥1024px)
across both light and dark modes.

## Legend

| Icon | Meaning |
|------|---------|
| [ ] | Not tested yet |
| [✓] | Passed |
| [✗] | Failed (log in FEEDBACK_LOG.md) |
| [N] | Not applicable to this page |

---

## 1. Dashboard

| Check | 375px | 768px | Desktop | Notes |
|-------|-------|-------|---------|-------|
| Modal (What's New / Welcome) centers correctly | [ ] | [ ] | [ ] | Uses `fixed inset-0 flex items-center justify-center` + `createPortal` |
| Body scroll lock active while modal open | [ ] | [ ] | [ ] | `useBodyScrollLock` call present |
| Table horizontal scroll (stock movement) | [ ] | [ ] | [ ] | Check overflow-x on data tables |
| All touch targets ≥40px (buttons, links) | [ ] | [ ] | [ ] | Card click targets, action buttons |
| Input fields readable in light mode | [ ] | [ ] | [ ] | CSS variable-driven colors |
| Input fields readable in dark mode | [ ] | [ ] | [ ] | CSS variable-driven colors |
| Content fits without horizontal overflow | [ ] | [ ] | [ ] | 100vw max with padding |

## 2. Sales (SalesOrderList)

| Check | 375px | 768px | Desktop | Notes |
|-------|-------|-------|---------|-------|
| Create/Edit modal centers vertically & horizontally | [ ] | [ ] | [ ] | `maxWidth: min(1200px, calc(100vw - 32px))` + portal |
| Body scroll lock active while modal open | [ ] | [ ] | [ ] | `useBodyScrollLock(showModal || showPrintModal || ...)` |
| Table horizontal scroll (items list in modal) | [ ] | [ ] | [ ] | Tables inside `overflow: auto` container |
| Touch targets ≥40px (close X, action buttons) | [ ] | [ ] | [ ] | Close X button — padding added in v1.17.3 |
| Print options modal readable | [ ] | [ ] | [ ] | `maxWidth: 360px` with `width: 100%` |
| Payment confirmation modal readable | [ ] | [ ] | [ ] | `maxWidth: 360px` with `width: 100%` |
| Invoice table responsive (no broken columns) | [ ] | [ ] | [ ] | Fixed column widths may overflow |
| Form inputs visible in dark mode | [ ] | [ ] | [ ] | CSS variable-driven |

## 3. Invoices (InvoiceList)

| Check | 375px | 768px | Desktop | Notes |
|-------|-------|-------|---------|-------|
| Modal centers correctly | [ ] | [ ] | [ ] | Uses `createPortal` + `fixed inset-0` |
| Body scroll lock active | [ ] | [ ] | [ ] | `useBodyScrollLock` call |
| Table horizontal scroll (history items) | [ ] | [ ] | [ ] | `overflow: auto` on table container |
| Touch targets ≥40px | [ ] | [ ] | [ ] | Close buttons, action buttons |
| Form fields readable in dark mode | [ ] | [ ] | [ ] | CSS variable-driven |
| Content responsive at 375px | [ ] | [ ] | [ ] | No hardcoded widths that break |

## 4. Purchase Orders (PurchaseOrderList)

| Check | 375px | 768px | Desktop | Notes |
|-------|-------|-------|---------|-------|
| Create/Edit SP modal centers correctly | [ ] | [ ] | [ ] | `maxWidth: min(1100px, calc(100vw - 32px))` + portal |
| Receive goods modal centers correctly | [ ] | [ ] | [ ] | `maxWidth: 640px` with `width: 100%` |
| Distributor modal centers correctly | [ ] | [ ] | [ ] | `maxWidth: 480px` with `width: 100%` |
| Body scroll lock active for all modals | [ ] | [ ] | [ ] | `useBodyScrollLock(showModal || ...)` |
| Table horizontal scroll (items) | [ ] | [ ] | [ ] | Tables in scrollable containers |
| Touch targets ≥40px | [ ] | [ ] | [ ] | Close X, action buttons |
| Form fields readable (light & dark) | [ ] | [ ] | [ ] | CSS variable-driven |
| SP preview hidden on mobile (2-col layout) | [ ] | [ ] | [ ] | Check `isMobile` conditional |

## 5. Inventory (InventoryDashboard)

| Check | 375px | 768px | Desktop | Notes |
|-------|-------|-------|---------|-------|
| Product modal (ModalShell) centers correctly | [ ] | [ ] | [ ] | Uses `ModalShell` with `createPortal` |
| Stock-In modal centers correctly | [ ] | [ ] | [ ] | Uses `ModalShell` / renderPortal |
| Stock-Out modal centers correctly | [ ] | [ ] | [ ] | Uses renderPortal |
| Opname modal centers correctly | [ ] | [ ] | [ ] | `maxWidth: 960px` with `width: 100%`, full-screen on mobile |
| Batch form modal centers correctly | [ ] | [ ] | [ ] | `maxWidth: 480px` + portal |
| Print barcode modal centers correctly | [ ] | [ ] | [ ] | `maxWidth: 920px` + portal |
| Bulk edit modal centers correctly | [ ] | [ ] | [ ] | `maxWidth: 760px` + portal |
| Body scroll lock active for all modals | [ ] | [ ] | [ ] | Each modal calls `useBodyScrollLock(true)` |
| Table horizontal scroll (product list, batches) | [ ] | [ ] | [ ] | Product list, batch tables |
| Touch targets ≥40px | [ ] | [ ] | [ ] | Close buttons in ModalShell — padding added in v1.17.3 |
| Form fields readable (light & dark) | [ ] | [ ] | [ ] | CSS variable-driven |
| Product Drawer closes with Escape + overlay click | [ ] | [ ] | [ ] | Uses `createPortal` + `fixed inset-0` |
| Product Drawer content scrollable | [ ] | [ ] | [ ] | `overflow: auto` inside drawer |

## 6. Customers (CustomerList)

| Check | 375px | 768px | Desktop | Notes |
|-------|-------|-------|---------|-------|
| Customer modal centers correctly | [ ] | [ ] | [ ] | `maxWidth: 460px` with `width: 100%` + portal |
| Body scroll lock active | [ ] | [ ] | [ ] | `useBodyScrollLock(showModal || ...)` |
| Touch targets ≥40px | [ ] | [ ] | [ ] | Close X button — padding improved in v1.17.3 |
| Form fields readable (light & dark) | [ ] | [ ] | [ ] | CSS variable-driven |
| Responsive at 375px | [ ] | [ ] | [ ] | Search bar, card layout |

## 7. Tasks (TasksKanban)

| Check | 375px | 768px | Desktop | Notes |
|-------|-------|-------|---------|-------|
| Add task modal centers correctly | [ ] | [ ] | [ ] | Tailwind `fixed inset-0 flex items-center justify-center` + portal |
| Edit task modal centers correctly | [ ] | [ ] | [ ] | Same pattern |
| Trash modal centers correctly | [ ] | [ ] | [ ] | Same pattern |
| Body scroll lock active when any modal open | [ ] | [ ] | [ ] | `useBodyScrollLock(showAddModal || ...)` |
| Touch targets ≥40px | [ ] | [ ] | [ ] | Close X uses `p-2` (~36px) — borderline |
| Kanban card drag-and-drop on mobile | [ ] | [ ] | [ ] | Touch events may differ from mouse |
| Form fields readable (light & dark) | [ ] | [ ] | [ ] | CSS variable-driven |

## 8. Settings (Sidebar / PrintSettings / LedgerPage)

| Check | 375px | 768px | Desktop | Notes |
|-------|-------|-------|---------|-------|
| Sidebar report modal centers correctly | [ ] | [ ] | [ ] | `maxWidth: 460px` + portal |
| Body scroll lock active | [ ] | [ ] | [ ] | Modal uses `useBodyScrollLock`? — verify |
| Touch targets ≥40px | [ ] | [ ] | [ ] | Sidebar nav links, close buttons |
| Print settings form readable (light & dark) | [ ] | [ ] | [ ] | CSS variable-driven |
| Ledger page table responsive | [ ] | [ ] | [ ] | Check overflow on data tables |
| Invoice history modal centers correctly | [ ] | [ ] | [ ] | Uses renderPortal |

---

## Cross-cutting Checks

| Check | Status | Notes |
|-------|--------|-------|
| All modals use `createPortal` (no inline modals without portal) | [✓] | Audit confirms all page-level modals use renderPortal |
| All modal overlays use `position: fixed; inset: 0` | [✓] | Consistent across all modals |
| Overlay click closes modal | [ ] | Verify each modal uses `onClick={(e) => e.target === e.currentTarget && onClose()}` |
| Escape key closes modal | [ ] | Verify `Escape` keydown handler in each modal |
| `useBodyScrollLock` called for every modal | [✓] | All page components and modal components have it |
| Scrollbar width compensation on lock | [✓] | `useBodyScrollLock.js` handles scrollbar width |
| Dark mode → all text/inputs readable | [ ] | Spot-check each page |
| Light mode → no washed-out text | [ ] | Spot-check each page |
| No hardcoded fixed widths that break at 375px | [✓] | All modals use `width: 100%` + `maxWidth` |
| No inline `<style>` overrides that leak | [ ] | Check for global style pollution |
| Touch targets ≥40px for all interactive elements | [ ] | Partially fixed in v1.17.3 (close X buttons) |

---

## Operator Smoke Checklist (v1.21.8)

Gunakan section ini saat smoke harian operator. Mark `[✓]` hanya setelah dites manual di browser/app.

| Flow | Check | Notes |
|------|-------|-------|
| Auth | Login lalu logout kembali ke `/login` tanpa token sisa | Pastikan token lokal terhapus dan refresh tetap aman. |
| Modal | Create/Edit modal buka-tutup bersih di tiap modul yang relevan | Cek overlay, Escape, dan CTA close. |
| Sidebar | Navigasi sidebar konsisten di desktop dan mobile drawer | Inventory/Customer/Sales/Invoices/Orders/Print Settings harus parity. |
| Tables | Action button selalu terlihat tanpa hover | Fokus ke desktop and mobile state. |
| Contrast | Light/dark mode tetap readable di shell utama | Cek teks, chip status, input, dan tombol primary. |
| Mobile 375 | Tidak ada horizontal overflow | Pastikan `document.documentElement.scrollWidth <= window.innerWidth + 1`. |

---

## Devices to Test

| Class | Viewport | Examples |
|-------|----------|---------|
| Small phone | 375×667 | iPhone SE (Gen 3), iPhone 13 mini, Galaxy S22 |
| Standard phone | 390×844 | iPhone 14/15 Pro, Pixel 7 |
| Large phone | 414×896 | iPhone 14/15 Plus, Galaxy S24+ |
| Small tablet | 768×1024 | iPad mini, Galaxy Tab A |
| Large tablet | 1024×1366 | iPad Air/Pro, Galaxy Tab S |
| Desktop | 1280×800 | Laptop |
| Wide desktop | 1440×900+ | External monitor |

---

## Version Info

- **Release:** v1.17.3
- **Last updated:** v1.21.8
- **Created:** 2026-06-03
- **Previous:** v1.17.2 (72519e3)
