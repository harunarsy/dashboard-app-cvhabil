import React, { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import Icons from "./common/Icon";
import api from "../services/api";
import TasksKanban from "./TasksKanban";
import Skeleton from "./common/Skeleton";
import EmptyState, { EmptyStateIcons } from "./common/EmptyState";
import { UI_MOTION } from "../constants/ui";
import useCountUp from "../hooks/useCountUp";
import useOnboarding from "../hooks/useOnboarding";
import useBodyScrollLock from "../hooks/useBodyScrollLock";
import OnboardingTour from "./common/OnboardingTour";
const StockMovementChart = lazy(() => import("./dashboard/StockMovementChart"));

const {
  Info,
  X,
  Activity,
  ShoppingCart,
  Package,
  Plus,
  Sparkles,
  Wrench,
  Palette,
  Zap,
  BarChart3,
  Tags,
  ArrowUpRight,
  ArrowDownRight,
  Users,
  TrendingUp,
} = Icons;

const RELEASES = [
  {
    version: "v1.16.1-stable",
    date: "3 Juni 2026",
    status: "latest",
    changes: [
      {
        type: "fix",
        text: "Invoice list ordering now deterministic: ORDER BY purchase_date DESC, id DESC",
        dev: "",
      },
      {
        type: "fix",
        text: "Login rate limiter no longer double-counted by general API limiter",
        dev: "",
      },
      {
        type: "fix",
        text: "Release change type metadata consistency (fixed → fix)",
        dev: "",
      },
      {
        type: "fix",
        text: "Added composite index idx_invoices_purchase_date_id",
        dev: "",
      },
    ],
  },
  {
    version: "v1.16.0-stable",
    date: "3 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "changed",
        text: "Backend: DB pool config explicit (max:20, idleTimeout:30s, connectionTimeout:5s)",
        dev: "",
      },
      {
        type: "changed",
        text: "Backend: General API rate limiter (300 req/15min), JSON body size limit (1mb)",
        dev: "",
      },
      {
        type: "fix",
        text: "Invoices, Sales, Ledger list endpoints now have safe LIMIT (default 100/200, max 500/1000)",
        dev: "",
      },
      {
        type: "fix",
        text: "Invoices DELETE operations wrapped in transactions",
        dev: "",
      },
      {
        type: "fix",
        text: "Added missing indexes: idx_invoices_purchase_date, idx_inventory_mutations_ref",
        dev: "",
      },
    ],
  },
  {
    version: "v1.15.9-stable",
    date: "3 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "resolveProductByIdOrName fallback name lookup now also filters is_active = TRUE (was only filtering by ID)",
        dev: "",
      },
    ],
  },
  {
    version: "v1.15.8-stable",
    date: "3 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Release modal center viewport + portal. Escape close + X button added. Dashboard test timeout: mock useOnboarding + sessionStorage, fake timers flush. InvoiceList SP prefill qty: now uses ordered qty (it.qty), not received_qty. Active product filter: resolveProductByIdOrName now only matches active products. Backfill also from active unique only.",
        dev: "",
      },
      {
        type: "change",
        text: "Backend: product_id + name lookups filter is_active = TRUE.",
        dev: "",
      },
      {
        type: "security",
        text: "Inactive products cannot be used for new stock-in operations.",
        dev: "",
      },
    ],
  },
  {
    version: "v1.15.7-stable",
    date: "3 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Explicit product mapping untuk Faktur linked SP. Matching sekarang prioritas product_id, fallback product_name normalized. Data lama tetap backward-compatible.",
        dev: "purchase_order_items + invoice_items sekarang punya product_id column. Backend resolveProductByIdOrName dan loadProductLookupForItems untuk batch lookup. Frontend SP/Faktur form state + payload kirim product_id. Version v1.15.7-stable.",
      },
    ],
  },
  {
    version: "v1.15.6-stable",
    date: "3 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "perf",
        text: "Maintainability ringan: context login dan toast timer sekarang lebih stabil tanpa mengubah flow bisnis.",
        dev: "AuthContext memakai useCallback/useMemo agar consumer tidak re-render karena object baru tiap render. Toast timer di Nota/Faktur/Inventory disimpan di ref dan dibersihkan saat unmount. TooltipButton Surat Pesanan dipindah ke module scope.",
      },
    ],
  },
  {
    version: "v1.15.5-stable",
    date: "3 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "security",
        text: "Hardening backend ringan: login sekarang punya lockout tambahan, token default lebih pendek, security headers aktif, dan input debit/kredit Buku Besar divalidasi.",
        dev: "Server memakai Helmet tanpa CSP agar aset lama tetap aman, auth menambahkan username-based lockout + JWT fallback 8 jam, dan ledger menolak amount non-angka/negatif serta entry debit-kredit kosong.",
      },
    ],
  },
  {
    version: "v1.15.4-stable",
    date: "3 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Integritas stok SP/Faktur diperketat: Terima Barang dan Faktur linked sekarang sama-sama mengisi stok berdasarkan sisa qty per item SP, bukan boolean global.",
        dev: "Backend invoices.js dan purchaseOrders.js memakai purchase_order_items.received_qty sebagai SSOT stock-in. Faktur linked hanya nambah room tersisa, Terima Barang setelah faktur tidak dobel, stock_received jadi derived display, dan PUT faktur posted dibungkus transaction + blokir edit item.",
      },
    ],
  },
  {
    version: "v1.15.3-stable",
    date: "3 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "perf",
        text: "Bundle utama dipotong drastis: halaman besar, Vanta/Three, dan generator PDF sekarang dimuat lazy sesuai kebutuhan. Test frontend juga kembali hijau.",
        dev: "Route-level React.lazy + Suspense di App.js, dynamic import untuk Vanta/Three dan util PDF call-sites, hapus dead deps socket.io-client/xlsx, fix test rot Skeleton/Dashboard, serta valid DOM nesting Nota. Main chunk turun sekitar 476 kB gzip.",
      },
    ],
  },
  {
    version: "v1.15.2-stable",
    date: "2 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Hotfix Terima Barang SP: satu produk sekarang bisa diterima dalam beberapa batch sekaligus, dan error database parameter type mismatch saat update stok sudah diperbaiki.",
        dev: "PurchaseOrderList.jsx menambah split batch rows + validasi total per PO item. purchaseOrders.js memisahkan boolean stock_received dari placeholder status agar PostgreSQL tidak menduga tipe $1 secara konflik. generateNotaPDF.js dan HNA/HPP SSOT tidak disentuh.",
      },
    ],
  },
  {
    version: "v1.15.1-stable",
    date: "2 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "polish",
        text: "Print Settings sekarang lebih rapi dan premium: form dua kolom responsif, label konsisten, input memakai field style bersama, section header lebih jelas, tombol simpan punya loading state, dan live preview tampil sebagai card elevated.",
        dev: "PrintSettings.jsx diformat pada commit terpisah agar diff reviewable, lalu dipoles dengan SectionHeader shared tanpa mengubah API call, state shape, load logic, generateNotaPDF.js, backend route, atau HNA/HPP SSOT.",
      },
    ],
  },
  {
    version: "v1.15.0-stable",
    date: "2 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "polish",
        text: "Polish marginal Dribbble-ready: error form inline lebih halus, search/filter lebih enak dengan debounce dan clear button, toast lebih premium, skeleton wave lebih lembut, dan onboarding tour pertama kali hadir di Dashboard.",
        dev: "Tambah FieldError, SearchBox, ToastNotice, OnboardingTour, useDebouncedValue, dan useOnboarding. Sweep utama di Login, Inventory, Nota, Faktur, SP, Customer, Tasks, BatchFormModal, ProductDrawer, serta CSS motion/token. generateNotaPDF.js, backend route, dan HNA SSOT tidak disentuh.",
      },
    ],
  },
  {
    version: "v1.14.4-stable",
    date: "1 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Micro-hotfix row hover: row Nota sekarang pakai highlight table-friendly yang benar-benar terlihat di browser, dan card Customer mendapat hover glow yang lebih jelas.",
        dev: "frontend/src/index.css dan CustomerList.jsx disesuaikan untuk hover visual tanpa menyentuh generateNotaPDF.js atau business logic. Label versi canonical disinkronkan ke v1.14.4.",
      },
    ],
  },
  {
    version: "v1.14.3-stable",
    date: "1 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Hover row table di Nota dan SP sekarang konsisten dengan lift+glow dashboard cards, dan modal page-level utama menutup dengan Escape secara seragam tanpa ganggu modal child yang sudah punya handling sendiri.",
        dev: "frontend/src/components/SalesOrderList.jsx, PurchaseOrderList.jsx, InvoiceList.jsx, TasksKanban.jsx, serta label versi canonical di Login.jsx, Sidebar.jsx, index.js, CHANGELOG.md, dan SUPERAPP_BRAIN.md disinkronkan ke v1.14.3. generateNotaPDF.js tetap tidak disentuh.",
      },
    ],
  },
  {
    version: "v1.14.2-stable",
    date: "1 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Micro-hotfix readability: HNA/HPP field lebih terbaca, nota PDF customer address lebih jelas, nota preview lebih lega, dan body scroll lock diterapkan ke modal portal utama agar background tetap statis.",
        dev: "frontend/src/components/common/HnaHppInput.jsx, common/NotaPreview.jsx, frontend/src/hooks/useBodyScrollLock.js, InventoryDashboard.jsx, CustomerList.jsx, SalesOrderList.jsx, InvoiceList.jsx, PurchaseOrderList.jsx, TasksKanban.jsx, ProductDrawer.jsx, OpnameModal.jsx, BatchFormModal.jsx, PrintBarcodeModal.jsx, dan BulkEditModal.jsx disinkronkan ke v1.14.2. generateNotaPDF.js tetap aman tanpa ubah layout bisnis.",
      },
    ],
  },
  {
    version: "v1.14.1-stable",
    date: "1 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Close gap v1.14.0 diselesaikan: ESC handler untuk modal shared, empty state inline SVG, dark mode atmosphere lebih dalam, form polish lebih konsisten, dan icon wrapper dipakai di kontrol yang paling sering disentuh.",
        dev: "frontend/src/components/common/ConfirmModal.jsx, inventory/PrintBarcodeModal.jsx, EmptyState.jsx, index.css, InventoryDashboard.jsx, InvoiceList.jsx, SalesOrderList.jsx, PurchaseOrderList.jsx, CustomerList.jsx, BatchFormModal.jsx, ProductDrawer.jsx, OpnameModal.jsx, dan common/Icon.jsx disinkronkan ke v1.14.1. generateNotaPDF.js tetap tidak disentuh.",
      },
    ],
  },
  {
    version: "v1.14.0-stable",
    date: "1 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "ui",
        text: "Purge Liquid Glass selesai: modal regressed dipusatkan lagi, dashboard dapat heatmap nota harian plus delta KPI, form input lebih solid, dan surface utama kembali full token-driven.",
        dev: "frontend/src/index.css, App.js, common modal surfaces, Dashboard.jsx, StockMovementChart.jsx, RupiahInput.jsx, Login.jsx, CLAUDE.md, dan SUPERAPP_BRAIN.md disinkronkan ke release ini. generateNotaPDF.js tetap tidak disentuh.",
      },
    ],
  },
  {
    version: "v1.13.3-stable",
    date: "1 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "ui",
        text: "HOTFIX: lima page kritikal yang sempat ter-mash oleh sweep otomatis di v1.13.2 dipulihkan, lalu glass-target dibersihkan manual lewat edit proper tanpa merusak JSX.",
        dev: "frontend/src/components/InventoryDashboard.jsx, InvoiceList.jsx, PurchaseOrderList.jsx, SalesOrderList.jsx, dan TasksKanban.jsx dipulihkan dari baseline lalu dipurge manual untuk glass-target. generateNotaPDF.js tetap tidak disentuh.",
      },
    ],
  },
  {
    version: "v1.13.0-stable",
    date: "1 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "ui",
        text: "Visual identity refresh ke palette Stripe Modern: Inter/JetBrains Mono self-hosted, token warna/spacing/elevation baru, surface lebih border-first, dan hover-reveal actions di tabel utama.",
        dev: "frontend/src/constants/ui.js, index.css, App.css, App.js, Login.jsx, Sidebar.jsx, InventoryDashboard.jsx, InvoiceList.jsx, SalesOrderList.jsx, PurchaseOrderList.jsx, PrintSettings.jsx, CustomerList.jsx, LedgerPage.jsx, OnlineStoreDashboard.jsx, BugReports.jsx, serta shared preview components disinkronkan ke Stripe Modern theme dan typography system.",
      },
    ],
  },
  {
    version: "v1.12.8-stable",
    date: "31 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Stabilitas backend diperketat: draft invoice tetap per-user, settings counter auth-gated, rollback/release error tidak silent, dan lookup produk di hot path tetap pakai indeks yang aman.",
        dev: "backend/routes/invoices.js, settings.js, sales.js, purchaseOrders.js, bugs.js, dan scripts/check-db.js diperbarui logging/rollback-nya. Backend tetap source of truth, sementara badge versi di frontend ikut naik ke release terakhir.",
      },
    ],
  },
  {
    version: "v1.12.7-stable",
    date: "31 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "ui",
        text: "Surface daftar dan dashboard sekarang lebih konsisten: Customer, Invoice, Tasks, Online Store, dan Ledger share motion, loading, empty state, dan error feedback yang sama.",
        dev: "frontend/src/components/CustomerList.jsx, InvoiceList.jsx, TasksKanban.jsx, OnlineStoreDashboard.jsx, dan LedgerPage.jsx disinkronkan ke label versi terbaru. Range chart, counter, dan aksi icon button tetap mengikuti token motion yang sama dari frontend/src/constants/ui.js.",
      },
    ],
  },
  {
    version: "v1.12.6-stable",
    date: "31 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "ui",
        text: "Inventory surface jadi lebih rapi: drawer produk, batch actions, opname per-batch, dan modal print barcode sekarang lebih konsisten dengan motion / focus / hover yang sama.",
        dev: "frontend/src/components/InventoryDashboard.jsx, inventory/ProductDrawer.jsx, inventory/OpnameModal.jsx, inventory/PrintBarcodeModal.jsx, dan MasterSelect.jsx disinkronkan ke label versi terbaru. Nilai inventaris tetap pakai HPP inc PPN supaya angka di list dan detail tetap satu bahasa.",
      },
    ],
  },
  {
    version: "v1.12.4-stable",
    date: "31 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "ui",
        text: "Motion foundation dan accessibility polish: modal/ drawer entrance, toast slide-in, button press feedback, focus ring, skeleton shimmer, dan cleanup silent catch / icon button label di surface utama.",
        dev: "frontend/src/constants/ui.js: SSOT timing motion. index.css: ui-motion classes + reduced-motion. Shared surfaces (Skeleton, ConfirmModal, Breadcrumb, BarcodeScanner) dikunci ke micro-interaction yang konsisten.",
      },
    ],
  },
  {
    version: "v1.12.3-stable",
    date: "31 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Audit/stability pass: draft invoice sekarang per-user, endpoint settings/counters diproteksi auth, lookup nama produk di hot path diindeks, dan note audit overwrite disimpan dengan benar.",
        dev: "backend/routes/invoices.js: draft autosave pakai owner_id di draft_data.__meta + claim legacy draft sekali. backend/routes/settings.js: auth gate + validasi payload counter. backend/routes/inventory.js: functional index LOWER(TRIM(name)). backend/routes/sales.js / purchaseOrders.js / invoices.js: samakan predicate lookup ke bentuk normalisasi.",
      },
    ],
  },
  {
    version: "v1.12.1-stable",
    date: "31 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "feat",
        text: "Stiker barcode batch sekarang bisa dicetak langsung dari Inventory. Pilih beberapa produk, atur qty stiker per produk, pilih layout A4, lalu generate PDF Code128 siap cetak.",
        dev: "Tambah PrintBarcodeModal.jsx + generateBarcodePDF.js, lazy-load jsbarcode dari PDF generator, integrasi tombol di sticky multi-select InventoryDashboard. Produk tanpa kode diskip, layout support 21/33/custom per A4.",
      },
    ],
  },
  {
    version: "v1.12.0-stable",
    date: "31 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "feat",
        text: "Inventory sekarang bisa scan barcode/QR produk lewat kamera untuk Stok Masuk, Stok Keluar, dan Opname. Operator tinggal tap Scan, arahkan kamera ke kode produk, lalu produk otomatis terpilih.",
        dev: "Tambah html5-qrcode + BarcodeScanner.jsx dengan cleanup kamera saat unmount, guard multi-scan, permission/error state, dan retry. InventoryDashboard.jsx integrasi scanner ke siForm/soForm; OpnameModal.jsx scan produk lalu select, scroll, dan highlight row.",
      },
    ],
  },
  {
    version: "v1.11.14-stable",
    date: "31 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "feat",
        text: "Nota Penjualan sekarang bisa difilter berdasarkan profitabilitas: untung tinggi, normal, tipis, atau rugi. Cocok untuk cepat cek nota yang margin-nya perlu ditinjau.",
        dev: "SalesOrderList.jsx: tambah filterProfit + computeNotaMargin() dari items (revenue, margin, pct), dropdown toolbar, dan empty-state aware filter aktif. Margin pakai hppFromHna(unit_hpp) agar storage HNA exc PPN tetap SSOT.",
      },
    ],
  },
  {
    version: "v1.11.13-stable",
    date: "31 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "feat",
        text: 'Inventory — Bulk Edit Kode & Kategori: centang banyak produk → tombol "Edit Massal" muncul di bawah → modal kasih tabel mapping (nama produk + input kode baru + input kategori baru per row). Hemat waktu kalau mau standardize kode/kategori banyak produk sekaligus (mis. tambah prefix "OBT-" ke semua obat).',
        dev: "frontend/src/components/inventory/BulkEditModal.jsx (BARU): mapping table, mode selector [Kode|Kategori|Kode+Kategori], duplicate kode validation, sequential save loop dgn progress + result per-row. InventoryDashboard.jsx: +selectedProductIds Set state, checkbox column (header select-all filtered + per row), sticky bottom bar conditional render. Update colSpan tfoot 8→9, expanded 10→11, empty 11→12.",
      },
    ],
  },
  {
    version: "v1.11.12-stable",
    date: "31 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: 'KRITIS — Dashboard kartu "Laba Kotor bln ini" sebelumnya OVERSTATE ~11% karena formula backend lupa hitung PPN masukan (cost beli yg gak ke-account). Contoh: HNA 100rb jual 130rb → sebelumnya tampil margin 30rb, sekarang benar 19rb (= 130 − 100×1,11). Skala bulanan bisa beda jutaan. Sekarang konsisten dgn kolom Margin di list Nota expanded.',
        dev: "backend/routes/dashboard.js: rewrite query total_laba → JOIN sales_items, hitung SUM(qty × (unit_price − unit_hpp × 1.11)) langsung. Bypass field sales_orders.gross_profit (jadi legacy). backend/routes/sales.js: fix formula gross_profit INSERT+UPDATE pakai × 1.11 utk konsistensi data baru. Field legacy gak di-backfill — Dashboard skrg gak baca field itu lagi.",
      },
      {
        type: "ui",
        text: "Polish modal Edit Batch: dulu kalau buka dari tab Batch di Edit Produk, 2 modal numpuk visible. Sekarang modal Edit Produk auto-hide pas Edit Batch/Adjust Qty kebuka — modal kedua jadi clean, state Edit Produk preserved pas balik.",
        dev: "ModalShell tambah prop hidden — set display:none kalau batchModal||adjustBatch aktif. Tutup BatchFormModal → parent ModalShell muncul lagi dgn state utuh (gak re-mount).",
      },
      {
        type: "ui",
        text: "Tombol Simpan di modal Stok Masuk dulu hijau, sekarang biru — konsisten dgn semua tombol Simpan di modal lain (Edit Produk, Edit Batch). Warna hijau dipertahankan utk badge LUNAS/sukses, bukan tombol aksi.",
        dev: "InventoryDashboard:761 primaryBtn(var(--color-success))→primaryBtn(var(--color-primary)) di Simpan Stok Masuk.",
      },
    ],
  },
  {
    version: "v1.11.11-stable",
    date: "31 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "feat",
        text: "Di list Nota Penjualan, expand baris nota → sekarang ada kolom Margin per produk + Total Margin Nota di footer. Hijau = untung, merah = jual rugi. UI-ONLY (PDF cetak nota TIDAK ada margin — pembeli gak boleh lihat modal/keuntungan).",
        dev: "SalesOrderList expanded row (:745): tambah th Margin (right) + td margin per item (hijau≥0 / merah<0) + tfoot Total Margin colSpan=6. Margin = (unit_price − hppFromHna(unit_hpp)) × qty. Hint kuning kalau ada item HPP=0 (overstate). generateNotaPDF.js UNCHANGED.",
      },
    ],
  },
  {
    version: "v1.11.10-stable",
    date: "31 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "feat",
        text: 'Diskon per produk di Faktur Pembelian sekarang bisa pakai persen (%) atau nominal (Rp) — tinggal klik toggle [% | Rp] di pojok kanan atas kotak Disc. Sesuai faktur asli yang kadang nulis disc nominal langsung (mis. Rp 758.100), bukan persen. Helper text otomatis tampil konversi balik (mis. "= 20%" kalau input nominal).',
        dev: "InvoiceList.jsx: blankItem +disc_mode (percent|nominal), +disc_input (raw). calcItem switch by mode — derive yg lain otomatis. Keduanya tetap disimpan ke DB (disc_percent + disc_nominal kolom existing, no migration). UI: card terpisah dgn segmented toggle + helper conversion. Grid disc-col 0.7fr→1fr (lebih lega). Backward compat: old data disc_percent → mode percent auto.",
      },
    ],
  },
  {
    version: "v1.11.9-stable",
    date: "31 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "feat",
        text: "Input harga produk sekarang punya DUA kotak bersebelahan: HNA (exc PPN) dan HPP (inc PPN 11%). Edit salah satu, yang lain otomatis ikut. Jadi kalau ketemu kulak 40rb (HPP), tinggal ketik di kotak HPP — sistem hitung HNA-nya otomatis (gak perlu bagi 1,11 manual). Berlaku di: Stok Masuk, Edit Produk, Edit Batch.",
        dev: "Komponen baru frontend/src/components/common/HnaHppInput.jsx (2-kolom grid RupiahInput HNA + HPP, locked sync via hppFromHna/hnaFromHpp). Replace di 3 lokasi: InventoryDashboard Stok Masuk (:754), Edit Produk (:621), inventory/BatchFormModal (:146). Storage tetap HNA exc PPN (SSOT, backend unchanged). Round-trip stabil: HPP→hnaFromHpp(HPP)=HNA→hppFromHna(HNA)=HPP.",
      },
      {
        type: "ui",
        text: "Angka di kartu Dashboard sekarang nominal penuh (mis. Rp 22.100.000), bukan compact Jt/M lagi — sesuai permintaan untuk desain yang lebih spesifik.",
        dev: "Dashboard formatRupiah (:866): hapus branch ≥1jt/≥1M → langsung Intl id-ID currency penuh utk semua nilai.",
      },
    ],
  },
  {
    version: "v1.11.8-stable",
    date: "31 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "ui",
        text: 'Angka di kartu Dashboard pakai istilah Indonesia: "Jt" (Juta) & "M" (Miliar) — bukan "M" gaya Inggris yang rancu. Contoh: Rp 20,6 Jt.',
        dev: 'Dashboard formatRupiah (:856) dibenerin beneran (edit sebelumnya gagal string-mismatch): ≥1M→"Rp X,XX M"(Miliar), ≥1jt→"Rp X,X Jt", else Intl id-ID penuh. Sebelumnya semua ≥1jt tampil "M" + nominal <1jt format inkonsisten.',
      },
    ],
  },
  {
    version: "v1.11.7-stable",
    date: "30 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Kolom HPP di Buat Nota sekarang benar (termasuk PPN 11%), sama dengan angka di dropdown batch. Sebelumnya kolom HPP menampilkan harga sebelum PPN (mis. 30.096 padahal HPP batch 33.407). Kalau diisi manual, ketik HPP final (inc PPN) — sistem simpan otomatis.",
        dev: "SalesOrderList field HPP item row (:980): value Math.round(hppFromHna(it.unit_hpp)), onChange hnaFromHpp(input) → storage unit_hpp tetap HNA exc PPN (round-trip stabil). Detail expand (:758) fmtRp(hppFromHna). Import +hnaFromHpp.",
      },
      {
        type: "ui",
        text: 'Angka di kartu Dashboard pakai istilah Indonesia: "Jt" (Juta) & "M" (Miliar) — bukan "M" gaya Inggris yang rancu. Contoh Rp 20,6 Jt.',
        dev: 'Dashboard formatRupiah dibenerin: ≥1M→"Rp X,XX M" (Miliar), ≥1jt→"Rp X,X Jt", else Intl id-ID penuh. Sebelumnya else-branch juga /1e6+"M" (nominal <1jt tampil salah).',
      },
      {
        type: "feat",
        text: "Polish Inventory & Opname: batch bisa di-edit/adjust/hapus langsung dari baris produk yang di-expand, Edit Produk punya tab Profil & Batch, Opname ada tombol Samakan & Clear, nilai inventaris di drawer konsisten pakai HPP inc PPN.",
        dev: "Codex 13600b6: InventoryDashboard (colSpan fix, expanded batch actions, tab Profil/Batch), BatchFormModal (z-index), ProductDrawer (nilai HPP inc PPN), OpnameModal (Samakan/Clear + footer summary).",
      },
      {
        type: "fix",
        text: 'Perbaikan error "stock_received does not exist" saat simpan Faktur Pembelian. Sekarang Faktur bisa disimpan normal.',
        dev: "Codex 13600b6: ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS stock_received (purchaseOrders.js + guard invoices.js) + patch Neon prod.",
      },
      {
        type: "feat",
        text: "Saat input Faktur, harga unit bisa dipilih mode HNA (exc PPN) atau HPP (inc PPN) — kalau pilih HPP, sistem hitung balik ke HNA untuk simpanan supaya stok tetap konsisten.",
        dev: "Codex 13600b6: InvoiceList field item — mode HNA/HPP, convert hnaFromHpp saat HPP, helper text disimpan-sebagai-HNA / estimasi-HPP.",
      },
    ],
  },
  {
    version: "v1.11.6-stable",
    date: "30 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: 'Perjelas harga modal: di dropdown batch saat Buat Nota, label "HNA" diganti "HPP (inc PPN)" supaya gak rancu — itu harga modal sudah termasuk PPN. Juga: kolom "Harga per Produk" rata-rata di Faktur (yang menyesatkan kalau 1 faktur banyak produk) dihapus; HPP tetap akurat per produk di tiap barisnya.',
        dev: "SalesOrderList: label batch dropdown HNA→HPP pakai hppFromHna(b.hna) (b.hna=raw exc PPN SSOT). InvoiceList: hapus display field harga_per_produk (rata-rata hna_plus_ppn÷totalQty — ngawur multi-produk). Storage HNA tetap single source, gak ada perubahan kalkulasi tersimpan.",
      },
    ],
  },
  {
    version: "v1.11.5-stable",
    date: "29 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "ui",
        text: "Sidebar sekarang tampil mengambang (floating) — ada jarak dari tepi layar, sudut membulat, dan bayangan halus. Terlihat lebih modern & rapi.",
        dev: "Sidebar.jsx desktop branch: position fixed top/left 14px, height calc(100vh-28px), borderRadius 20px, boxShadow, overflow hidden, border penuh (ganti borderRight). App.js marginLeft konten disinkronkan 256→284 (open) & 80→108 (collapsed) = gap 14 kiri+kanan. Mobile branch tidak diubah.",
      },
    ],
  },
  {
    version: "v1.11.4-stable",
    date: "29 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "ui",
        text: 'Tampilan daftar Nota Penjualan dirapikan: label "BELUM BAYAR", "LUNAS", status, dan saluran (Offline/Online) tidak lagi turun 2 baris saat sidebar dibuka.',
        dev: "SalesOrderList: badge BAYAR/STATUS DOC/channel +whiteSpace nowrap +display inline-block supaya gak wrap di kolom sempit.",
      },
    ],
  },
  {
    version: "v1.11.3-stable",
    date: "29 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "CSV Rekap PPN sekarang 1 baris per produk: kalau 1 faktur isi beberapa produk, tiap produk jadi baris sendiri (No Faktur diulang) dengan DPP, PPN, dan Total masing-masing. Sebelumnya produk-produk digabung jadi 1 sel.",
        dev: "handleExportCSV jadi async: Promise.all invoicesAPI.getById(id) tiap faktur terpilih → 1 baris per invoice_item (Tgl·No Faktur·Distributor·Produk·Qty·Satuan·DPP·PPN·Total). DPP per-item = hna_baru (fallback hna×quantity), PPN = DPP×0.11, Total = DPP×1.11. Baris TOTAL = sum. Loading toast saat fetch.",
      },
    ],
  },
  {
    version: "v1.11.2-stable",
    date: "29 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "ui",
        text: "Polish tampilan: CSV Rekap PPN sekarang ikut kolom Produk & Total Qty; nomor HP & alamat di Customer lebih jelas dibaca; ikon sidebar pas dikecilin lebih center; panah dropdown filter gak mepet lagi.",
        dev: "InvoiceList handleExportCSV +kolom product_names & total_qty (header & baris TOTAL ikut). CustomerList: phone/address fontSize 13.5 + weight 500 + warna teks utama (bukan sub); select sort paddingRight 32. Sidebar: nav button justifyContent center + padding simetris saat collapsed. InvoiceList rekap month select paddingRight 28.",
      },
    ],
  },
  {
    version: "v1.11.1-stable",
    date: "29 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Perbaikan tampilan Faktur Pembelian: (1) centang faktur satu-satu sekarang jalan, (2) urutan default kembali ke faktur terbaru di atas, (3) tampilan nama distributor di tabel & rekap dirapikan (gak berantakan lagi).",
        dev: "InvoiceList: checkbox InvoiceRow onChange={onToggleSelect} (dulu onChange kosong + onClick stopPropagation makan event). Sort default applyFilters else-branch → purchase_date desc murni (buang prioritas due_date). Distributor chip baris tabel → dot + nama plain ellipsis (hapus kotak bg flop). Rekap per distributor → grid auto-fill compact (dot + nama ellipsis + Nx + nominal 1 baris).",
      },
    ],
  },
  {
    version: "v1.11.0-stable",
    date: "29 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "feat",
        text: "Faktur Pembelian sekarang bisa dipilih banyak sekaligus (centang di tabel) lalu di-Export CSV Rekap PPN — buat lapor/setor pajak masukan. Filenya kebuka di Excel: kolom Tanggal, No Faktur, Distributor, DPP, PPN 11%, Total + baris TOTAL.",
        dev: 'InvoiceList: state selectedIds (Set), kolom checkbox (header select-all scope filteredInvoices + InvoiceRow + skeleton, grid 8→9 kolom di 3 tempat), sticky action bar saat ada pilihan, handleExportCSV (delimiter ";", BOM utf-8 utk Excel-ID, angka toFixed(2) plain, baris TOTAL). selectedIds reset saat filter berubah. Tanpa lib eksternal.',
      },
    ],
  },
  {
    version: "v1.10.5-stable",
    date: "29 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "feat",
        text: 'Stok Opname makin lengkap: (1) kode produk bisa diedit langsung saat opname (klik ikon pensil di sebelah kode), dan (2) tombol "Export PDF" buat cetak Berita Acara Stok Opname — daftar batch yang berubah beserta Sistem vs Fisik + Selisih, buat arsip/bukti.',
        dev: "OpnameModal: state editingCode+codeInput+codeMap, handleSaveCode → inventoryAPI.updateProduct (prop onProductsChanged → parent fetchProducts). handleExportPDF pakai util baru generateOpnamePDF.js (landscape A4, helvetica no-emoji, kolom No·Kode·Produk·Batch·ED·Sistem·Fisik·Selisih·Catatan), data dari inputs difilter spt changedItems. Tombol Export PDF di footer (aktif kalau ada perubahan).",
      },
    ],
  },
  {
    version: "v1.10.4-stable",
    date: "29 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "feat",
        text: 'Cetak Template Opname sekarang per-batch: tiap batch jadi 1 baris dengan kolom No. Batch + ED. Kalau batch atau ED belum ada, tertulis "(kosong)" supaya bisa diisi tangan saat opname fisik lalu diinput ke sistem.',
        dev: 'Endpoint baru GET /inventory/opname-template (LEFT JOIN batch aktif qty>0, produk tanpa batch tetap 1 baris null). inventoryAPI.getOpnameTemplate. generateInventoryPDF di-rewrite per-batch: kolom No.Batch + ED (kosong→"(kosong)"), header Total Produk + Total Baris Batch. handleExportOpnameTemplate fetch endpoint baru.',
      },
    ],
  },
  {
    version: "v1.10.3-stable",
    date: "29 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Hapus batch sekarang langsung bisa walau stoknya masih ada — tidak perlu adjust ke 0 dulu. Sisa stok otomatis di-nol-kan (tetap tercatat di riwayat) lalu batch dihapus.",
        dev: 'Backend deleteBatch (inventory.js): buang guard qty_current>0; kalau ada stok → INSERT inventory_mutations (out, reference adjust, "Hapus batch: stok N → 0") lalu qty_current=0, baru is_active=FALSE — semua dalam 1 transaksi. Frontend OpnameModal: teks konfirmasi info sisa stok akan di-nol-kan. Catatan: edit No.Batch/ED saat opname sudah tersedia via ikon pensil per batch.',
      },
    ],
  },
  {
    version: "v1.10.2-stable",
    date: "29 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "feat",
        text: 'Inventory sekarang punya kolom "Nilai" per produk (HPP × stok, termasuk PPN) + Total Nilai Inventaris di paling bawah tabel. Totalnya ikut filter/pencarian yang aktif.',
        dev: 'InventoryDashboard: th "Nilai" setelah Stok, td fmtRp(hppFromHna(p.hna)*stock) per baris, useMemo totalNilai (reduce atas filtered), tfoot grand total. colSpan baris expanded (8→9) & empty-state (9→10) disesuaikan utk kolom baru.',
      },
    ],
  },
  {
    version: "v1.10.1-stable",
    date: "29 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Harga HNA di Stok Masuk tampil benar lagi. Sebelumnya angka HNA muncul ×100 (mis. produk 76.000 tampil jadi 7.600.000) padahal HPP-nya benar — sekarang sudah pas.",
        dev: 'Root cause: nilai numeric dari DB datang sbg string "76000.00"; formatRupiah→parseRupiah salah anggap titik = pemisah ribuan → hapus titik → 7600000. Fix di RupiahInput: coerce parseFloat(value) sebelum formatRupiah (benerin SEMUA field RupiahInput sekaligus). Defensif juga: siForm.hna di InventoryDashboard di-parseFloat saat openStockIn + saat pilih produk.',
      },
    ],
  },
  {
    version: "v1.10.0-stable",
    date: "29 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: 'Stok tidak lagi dobel saat catat Faktur Pembelian dari Surat Pesanan. Di Buat Faktur ada pilihan "Dari Surat Pesanan" — pilih SP-nya, produk otomatis terisi, dan sistem cek supaya stok cuma masuk sekali (mau lewat Terima Barang dulu atau langsung Faktur).',
        dev: 'Akar masalah: Terima Barang SP (purchaseOrders receive) DAN Faktur Pembelian (invoices create) dua-duanya stock-in ke inventory_batches+mutations tanpa linkage → stok dobel. Fix flag-based: kolom baru invoices.purchase_order_id + purchase_orders.stock_received. Receive set stock_received=TRUE saat fully received + skip insert kalau alreadyStocked. Faktur create terima purchase_order_id: kalau SP sudah stock_received → SKIP stock-in, cuma backfill HNA ke batch source_type=purchase; kalau belum → stock-in + set flag; tanpa SP → stock-in normal (legacy aman). Frontend InvoiceList: dropdown "Dari SP" (purchaseOrdersAPI.getAll/getById) prefill items + distributor, purchase_order_id ikut ...form ke payload.',
      },
    ],
  },
  {
    version: "v1.9.0-stable",
    date: "28 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "feat",
        text: "Buat SP sekarang punya Preview Live — dokumen Surat Pesanan tampil real-time di samping form sambil diisi (distributor, produk, tanggal langsung kebaca), persis seperti di Nota. Cek tampilan dulu sebelum cetak.",
        dev: "Komponen baru common/SPPreview.jsx (mirror NotaPreview, render dokumen SP HTML real-time, TANPA harga/total sesuai SP price-free). PurchaseOrderList.jsx: tambah state layoutSettings (fetch printSettingsAPI.get().nota_layout on-mount), modal Buat SP jadi 2-kolom (form kiri + SPPreview sticky kanan, gridTemplateColumns 1.2fr 1fr), maxWidth diperlebar ke min(1100px, calc(100vw - 32px)), preview disembunyikan di mobile. po_number preview ikut nomor Auto/manual dari spCounter.",
      },
    ],
  },
  {
    version: "v1.8.9-stable",
    date: "28 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "ui",
        text: 'Dropdown produk di "Buat SP" sekarang sama persis seperti di Nota — bisa cari, pilih, atau tambah produk baru langsung dari dropdown.',
        dev: 'PurchaseOrderList.jsx: ganti `<input list="inv-product-list">` (datalist free-text) → komponen `MasterSelect` (dropdown creatable, sama yang dipakai Nota SalesOrderList.jsx:965 + Distributor di modal yang sama). options dari inventoryAPI.getProducts. Hapus `<datalist>`. updateItem dibikin atomik: autofill unit dari base_unit saat produk dipilih (sekalian benerin latent double-updateItem bug). SP sisi beli → harga TIDAK auto-fill dari sell_price, tetap manual.',
      },
      {
        type: "feat",
        text: "Tambah produk baru dari SP otomatis mendaftarkannya ke Inventory. Tidak ada lagi produk yang stoknya hilang saat barang diterima.",
        dev: "Handler handleAddProduct/Remove/Rename diport dari Nota — onAdd panggil inventoryAPI.createProduct({name, unit:pcs, hna:0, ...}) → product_master langsung muncul di Inventory (stok 0, LEFT JOIN). Hardening backend purchaseOrders.js receive: produk yg belum terdaftar (SP lama / produk dinonaktifkan) di-auto-create dulu sebelum stock-in, jadi `if (product)` gak pernah skip diam-diam.",
      },
      {
        type: "ui",
        text: "Surat Pesanan (SP) gak ada kolom Harga & Total lagi — SP murni daftar pesanan barang (produk + qty). Nominal harga muncul di Faktur Pembelian setelah barang + faktur dari distributor datang.",
        dev: "PurchaseOrderList.jsx: hapus input unit_price di baris produk, blok Total di modal, kolom Total di tabel list, kolom Harga + Subtotal di detail expand. Hapus helper fmtRp + grandTotal yg jadi unused. Backend tetap simpan unit_price/total default 0 — tanpa migrasi.",
      },
    ],
  },
  {
    version: "v1.8.8-stable",
    date: "27 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "ui",
        text: "Kanban Manajemen Tugas sekarang BENAR-benar glass — wrapper container gak lagi solid putih override class.",
        dev: "Root cause Dashboard.jsx:672 dulu ada inline background solid yang ngalahin tint token. Fix: hapus inline background total, biarin CSS var apply tint. Sama untuk stats cards (line 684) + Version badge button (line 663). Plus TasksKanban root wrapper (line 210) hapus inline `backgroundColor: bg`.",
      },
      {
        type: "ui",
        text: "Liquid Glass akhirnya konsisten di seluruh UI: Faktur Pembelian, Surat Pesanan, Buku Besar, Toko Online, Pengaturan Cetak, Bug Reports — sebelumnya 0% glass adoption (solid putih).",
        dev: "Audit komprehensif: 6 page components hardcoded `backgroundColor: cardBg` dgn `cardBg = #FFF` solid. Strategi: ratakan ke token surface + border-first shell, lalu pilih surface motion card di consumer utama. InvoiceList khusus: hapus solid bg dari S.card style object dan konsistenkan wrapper card.",
      },
      {
        type: "fix",
        text: 'Modal "Apa Yang Baru" content area gak hardcoded white lagi.',
        dev: 'Dashboard.jsx:754 sebelumnya `<div className="bg-white dark:bg-gray-800 ...">` hardcoded Tailwind. Ganti jadi surface token-aware dengan card shell yang konsisten.',
      },
      {
        type: "ui",
        text: "Sidebar translucent saat Vanta + Glass nyala — gak solid putih lagi.",
        dev: "Sidebar.jsx:250-255 inline `backgroundColor: bg` solid (`#FBFBFD` light / `#000` dark) override tint token. Ganti jadi token surface yang lebih konsisten dan pertahankan layout fixed tanpa glass toggle.",
      },
    ],
  },
  {
    version: "v1.8.7-stable",
    date: "27 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "feat",
        text: "Background fog Vanta sekarang tembus di semua halaman (Nota, Customer, Faktur, Surat Pesanan, Inventory, Toko Online, Buku Besar, Pengaturan) — gak cuma Dashboard.",
        dev: 'Plumb prop `isVantaMode` dari App.js → ProtectedRoute → AppRoutes → 11 page component (Dashboard, SalesOrderList, CustomerList, InvoiceList, PurchaseOrderList, PrintSettings, InventoryDashboard, OnlineStoreDashboard, LedgerPage, Login, BugReports). Setiap page wrapper div: `backgroundColor: isVantaMode ? "transparent" : bg`. Pendekatan prop-based vs CSS `!important` karena inline style menang specificity. Hapus CSS rule `.min-h-screen` v1.8.6.1 yang sudah obsolete.',
      },
      {
        type: "ui",
        text: "Kanban Manajemen Tugas gak ada blok putih solid lagi — column + card sekarang translucent dgn backdrop blur effect.",
        dev: "TasksKanban.jsx color tokens: cardBg `rgba(255,255,255,0.85)` light / `rgba(28,28,30,0.85)` dark, columnBg `rgba(...,0.45)`. Column container tambah `backdropFilter: blur(14px)`, card tambah `backdropFilter: blur(10px)`. Vanta tembus tanpa bikin teks gak readable karena backdrop blur = shield.",
      },
      {
        type: "ui",
        text: "Dark mode card sekarang punya layering depth + Vanta-friendly translucent (sebelumnya flat var(--color-surface-elevated) di atas #000 = kontras 1.08:1).",
        dev: "Dashboard.jsx color tokens dark mode: bg `#0A0A0C` (bukan pure 000), cardBg `rgba(28,28,30,0.85)` translucent, border `rgba(60,60,67,0.6)` softer. Cards otomatis benefit dari Liquid Glass mode backdrop-blur kalau aktif.",
      },
      {
        type: "feat",
        text: "Liquid Glass theme sekarang AKTIF by default — text tetep readable walaupun Vanta nyala karena ada blur shield.",
        dev: "Legacy visual toggle line 31 dulu default flip dari `false` jadi `true` kalau localStorage empty. Backward compat: user yang sudah pernah toggle OFF tetap OFF — respect choice. User existing yang ON tetap ON. Cuma fresh visitor + user yang gak pernah toggle dapat ON default.",
      },
    ],
  },
  {
    version: "v1.8.6-stable",
    date: "27 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "feat",
        text: "Background dashboard sekarang punya efek fog animasi yg adem — bisa di-toggle on/off via tombol angin di sidebar atau di halaman Login.",
        dev: "Integrasi Vanta.js FOG (three.js based WebGL) via hook custom `useVantaBackground.js`. Theme-aware: color scheme swap otomatis saat dark/light mode toggle. Performance guards: auto-disable kalau `prefers-reduced-motion: reduce`, atau `navigator.deviceMemory < 4` (low-spec device), atau URL kill switch `?vanta=off`. State persist via localStorage `habil_vanta_mode` (default ON). Container fixed `inset:0 z-index:0 pointer-events:none` di `App.js` root, content wrapper `z-index:1`. Cards/sidebar/topbar tetap solid bg → readability terjaga. Compose dgn Liquid Glass mode (translucent surface tembus ke Vanta = bagus). Toggle UI: tombol `Wind` icon di Login top-right + Sidebar bottom (sebelah Dark Mode).",
      },
    ],
  },
  {
    version: "v1.8.5-stable",
    date: "26 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Nota PDF cetak gak split ke 2 halaman lagi kalau cuma sedikit item — sekarang muat di 1 halaman sesuai expected.",
        dev: "Refactor pre-calc page-break di `generateNotaPDF.js`. Hapus single-decision bundle (totalNeeded) yg false-positive trigger split. Ganti adaptive per-block: ketentuan render per wrapped line dgn ensureSpace(), bank+sig+footer kept-together via 1 conditional addPage check. SigBlockH recalibrate 30→26 (A4/A5) — actual sigGap+sigNameOffset render footprint. Debug log behind `localStorage.pdfDebug` flag.",
      },
      {
        type: "fix",
        text: "Tabel nota sekarang punya border rounded — match preview Dokumen di Pengaturan.",
        dev: 'jspdf-autotable v5 gak support border-radius native. Approach: theme `plain` (hapus default grid border), set `lineWidth: 0` di headStyles + bodyStyles `lineColor [229,229,234] lineWidth 0.1` untuk inner separator halus. Manual `doc.roundedRect(margin, startY, w, h, 2, 2, "S")` untuk outer border 2mm radius. Sweet-spot tradeoff: outer-only rounded (~30 baris kode) vs full per-cell rounded (~100+ baris complex).',
      },
      {
        type: "feat",
        text: "Modal Buat Nota Baru sekarang ada preview live di samping form — bisa lihat hasil nota real-time saat ngetik customer/produk/harga sebelum klik Simpan.",
        dev: "Component baru `frontend/src/components/common/NotaPreview.jsx` — pure JSX presentational mirror layout `PrintSettings.jsx:194-284` tapi terima props live (form/items/settings). Extract helper `angkaKeTerbilang` ke `utils/angkaKeTerbilang.js` untuk shared use. Modal `SalesOrderList.jsx` width 640→`min(1200px, calc(100vw-32px))`, content layout `flex-col` → `grid 1.1fr 1fr` (form kiri + preview sticky kanan). Order number auto-compute dgn `notaCounter.next_preview` fallback.",
      },
      {
        type: "feat",
        text: 'Halaman Inventory sekarang punya tombol "Cetak Template" — generate PDF list produk dgn kolom Stok Fisik/Selisih/Catatan kosong untuk dicetak A4, dicoret manual saat opname, lalu balik input ke app.',
        dev: 'File baru `frontend/src/utils/generateInventoryPDF.js` — jsPDF landscape A4, autoTable theme grid 9 kolom (No/Kode/Nama/Satuan/StokSistem/EDTerdekat/StokFisik/Selisih/Catatan). MinCellHeight 8mm cukup tulisan tangan. Fill greybox di kolom kosong utk highlight area input manual. Footer per page: page N of M + signature lines "Diperiksa/Disetujui oleh" di last page. Tombol di `InventoryDashboard.jsx` header pakai `headerBtn` helper existing + handler `handleExportOpnameTemplate` fetch printSettings + save PDF dgn timestamp filename.',
      },
    ],
  },
  {
    version: "v1.8.3-stable",
    date: "26 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Nomor nota di modal Buat Nota Baru sekarang nampil benar — sebelumnya nyangkut di nomor lama (misal nampil 2605015 padahal harusnya 2605026). Sekarang otomatis ikut nota terbaru.",
        dev: 'PostgreSQL `SUBSTRING(order_number FROM $param)` ternyata treat parameter as REGEX pattern, bukan numeric position. Param 14 → match literal "14" di string → MAX kebaca 14 dari `HSB-NOTA-2605014`. Fix: ganti ke `REPLACE(order_number, prefix, "")` parameter-safe. Affect `backend/routes/settings.js` (preview) + `backend/routes/sales.js` (generateOrderNumber).',
      },
      {
        type: "fix",
        text: "Habis hapus nota, nomor baru otomatis ikut nomor yang baru kehapus — gak perlu refresh halaman manual lagi.",
        dev: "FE refetch counter di `openAdd()` saat klik tombol Buat Nota + di `confirmDelete()` success branch. Sebelumnya `notaCounter` state cuma fetch sekali di mount, jadi setelah delete preview stale sampai user F5.",
      },
      {
        type: "fix",
        text: 'Nomor nota yang udah dihapus sekarang bisa dipakai ulang — sebelumnya muncul error "Nomor Nota sudah digunakan" padahal nota nya udah didelete.',
        dev: "Soft-delete (is_deleted=TRUE) tetap leave `order_number` di table → UNIQUE constraint full-table conflict. Fix: DROP `sales_orders_order_number_key` + CREATE partial unique index `WHERE is_deleted = FALSE`. Constraint cuma enforce uniqueness untuk row aktif. Migration idempotent di `ensureSchema()`, auto-apply saat backend start.",
      },
    ],
  },
  {
    version: "v1.8.2-stable",
    date: "26 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "🔢 Counter preview Auto field fix — modal Buat Nota Baru sekarang tampil `HSB-NOTA-{YYMM}{NNN}` real-time (sebelumnya masih tampil format lama dari last_number stale). Backend `/counters` enrich response dengan `next_preview` per doc_type (compute MAX per current month + YYMM).",
      },
      {
        type: "fix",
        text: "🔄 product_master.hna auto-sync — saat faktur create/edit, `product_master.hna` otomatis ke-update ke RAW HNA per pcs dari item faktur terbaru. Hilangin drift antara product.hna vs batch.hna. Existing data: edit & save 1 faktur per produk untuk trigger sync, ATAU jalanin `node backend/scripts/backfill-hna-raw.js` (sekali).",
      },
    ],
  },
  {
    version: "v1.8.1-stable",
    date: "26 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "🔢 Counter nomor nota fix — sebelumnya nyantol di bulan lama (mis. 2603 padahal Mei). Sekarang dynamic per-bulan: `HSB-NOTA-{YYMM}{NNN}` reset counter ke 001 tiap bulan baru. Sync to MAX active nota per current month.",
      },
      {
        type: "fix",
        text: "🔄 Edit Nota stock sync: edit qty di nota sekarang reverse-old + apply-new ke inventory_batches (sebelumnya stock gak ke-update). Mirror DELETE behavior — transactional safe.",
      },
      {
        type: "fix",
        text: "🎯 Edit Nota batch picker pre-fill: dropdown batch sekarang tampil + auto-select batch yang sebelumnya dipilih (dari batch_no_snapshot). Sebelumnya kosong setiap buka Edit.",
      },
      {
        type: "fix",
        text: "📋 PUT /sales re-snapshot batch + ED: edit nota update batch_no_snapshot + expired_date_snapshot ke FEFO terbaru (sebelumnya tetap NULL).",
      },
      {
        type: "fix",
        text: "📄 PDF print page-split A5/A6: pre-calc page-break safety buffer + sigBlockH dihitung lebih akurat. 5-10 items nota A5 sekarang fit 1 page tanpa split.",
      },
      {
        type: "feat",
        text: "💰 PDF Nota tax-friendly breakdown: tampilkan Subtotal (DPP), PPN 11%, Grand Total. Untuk laporan SPT customer-facing.",
      },
      {
        type: "feat",
        text: "📅 PDF Nota tampilkan Jatuh Tempo di header kalau payment non-Tunai (Transfer/QRIS).",
      },
      {
        type: "feat",
        text: "💵 Form nota: payment Tunai → field Tempo Pembayaran auto-hidden + auto-clear. Cash tidak pakai jatuh tempo.",
      },
    ],
  },
  {
    version: "v1.8.0-stable",
    date: "26 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "feat",
        text: '🏷️ HNA / HPP Consistency: kolom Inventory split jadi 2 — "HNA (exc PPN)" (raw cost) + "HPP (inc PPN)" (raw × 1.11). Edit Produk + Edit Batch + Stok Masuk semua tampil chip HPP computed auto. Bedain mana harga kulak sebenarnya vs harga raw.',
      },
      {
        type: "feat",
        text: '💰 Decimal Precision: input HNA / Disc COD / Stok Masuk kini support 2 digit desimal dengan format Indo "Rp 288.288,25" (titik ribuan + koma desimal). Lebih akurat untuk faktur masukan.',
      },
      {
        type: "feat",
        text: '✂️ Edit Faktur Simplified: hide cascade fields (HNA × QTY, Disc Nominal, HNA Baru, HNA/Item, COD Bagian, HNA After COD) by default. Tampil HPP final highlight + tombol "Detail kalkulasi" untuk yang mau verify breakdown.',
      },
      {
        type: "feat",
        text: '📐 Karton UX Sync: Faktur form tampil conversion preview "20 karton (= 240 pcs)" mirror SalesOrderList. SP PDF tambah sub-line "(= X pcs)" konsisten dengan Nota PDF.',
      },
      {
        type: "fix",
        text: "Backend /batches-by-product: HPP computation salah formula (hna/qty × 1.11) — sekarang fix ke hna × 1.11 (hna sudah per-pcs).",
      },
      {
        type: "fix",
        text: "PPN rate konsolidasi via konstanta (backend/utils/tax.js + frontend/utils/rupiah.js) — gak hardcoded 1.11 di banyak tempat lagi.",
      },
      {
        type: "fix",
        text: 'PDF Laporan: HPP sub-row label eksplisit "HPP/pcs (inc PPN)" + 2 decimal digit untuk akurasi.',
      },
    ],
  },
  {
    version: "v1.7.0-stable",
    date: "25 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "feat",
        text: '💰 Tiered Pricing (Grosir): set harga per qty range per produk (contoh: 1-4 karton @212k, 5-9 @208k, 10+ @204k). Auto-apply ke Nota saat qty match — tampil tag "🏷️ Harga grosir tier" untuk transparency.',
      },
      {
        type: "feat",
        text: "📊 Multi-Select Nota Penjualan → Export PDF Laporan: checkbox column di list nota + sticky action bar saat ada selection. Export PDF landscape A4 berisi tabel ringkasan, Grand Total, breakdown Lunas vs Belum Bayar.",
      },
      {
        type: "feat",
        text: "📦 Stok Keluar Batch Picker: dropdown batch di modal Stok Keluar (default FEFO terdekat, bisa override pilih batch tertentu). Backend single-batch deduction kalau manual override.",
      },
      {
        type: "feat",
        text: "PDF Nota item: tampil batch_no + ED snapshot per item (kalau ada di sales_items snapshot). Audit trail clear di nota cetak.",
      },
      {
        type: "fix",
        text: "Filter textbox Nota: text tidak kepotong lagi (ellipsis + paddingRight adequate untuk chevron + minWidth sesuai opsi terpanjang).",
      },
      {
        type: "fix",
        text: 'Hapus footer "Business Management System" di root level — gak ikut dark mode + redundant dengan version di Sidebar/Login/Dashboard.',
      },
    ],
  },
  {
    version: "v1.6.0-stable",
    date: "25 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "feat",
        text: "📦 Multi-Unit Packaging (Carton ↔ Pcs): produk kini support dual unit — eceran (pcs/btl/sachet) + kemasan (karton/dus/box). Set pack_size + harga jual per kemasan di Produk form. Auto-konversi qty di Faktur Masukan, Surat Pesanan, dan Nota Penjualan.",
      },
      {
        type: "feat",
        text: "Dual Pricing: sell_price (per eceran) + sell_price_pack (per kemasan) independent — allow diskon grosir per karton vs harga eceran. Auto-fill di Nota saat user pilih unit.",
      },
      {
        type: "feat",
        text: "Unit Dropdown Universal: replace free-text unit input dengan dropdown smart di 4 form (Produk, PO, Faktur, Nota). Options dinamis berdasarkan product.base_unit + pack_unit.",
      },
      {
        type: "fix",
        text: "Faktur Masukan: tambah kolom Satuan (sebelumnya MISSING) — distributor invoice unit kini tersimpan.",
      },
      {
        type: "fix",
        text: "SP Receive: unit asal PO kini dipertahankan saat receive → inventory_batches (sebelumnya unit di-drop, qty selalu dianggap pcs).",
      },
      {
        type: "ui",
        text: 'Inventory batch display: append "240 pcs (= 20 karton)" preview untuk produk dengan pack_size > 1. PDF Nota & SP juga tampil unit user-friendly.',
      },
    ],
  },
  {
    version: "v1.5.1-stable",
    date: "25 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "feat",
        text: '🔧 OpnameModal CRUD Inline: Tambah/Edit/Hapus/Adjust batch langsung dari modal Stok Opname per-Batch. Tombol "+ Batch Baru" di header produk; per-batch action icons (Sliders/Pencil/Trash2) dengan tooltip. Zero context switch ke ProductDrawer.',
      },
      {
        type: "fix",
        text: "🛡️ Backend Safety — Deleted Batch Tidak Bocor ke Nota: 4 query backend di-patch dengan filter COALESCE(is_active, TRUE) = TRUE. Dropdown batch nota + FEFO stock-out (stock-out, nota, opname legacy) semua skip batch yang sudah di-hapus.",
      },
      {
        type: "ui",
        text: 'Empty State Polish: Produk tanpa batch kini tampilkan tombol "+ Tambah Batch Pertama" (CTA inline) — bukan pesan static "Lakukan Stok Masuk dulu".',
      },
    ],
  },
  {
    version: "v1.5.0-stable",
    date: "25 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "feat",
        text: "🪟 Liquid Glass Theme (Beta): Tema visual Apple-style (WWDC25) — sidebar/modal/drawer/cards berubah jadi semi-transparent dengan backdrop blur + saturate + inner glow. Toggle di Login page sebelah Dark Mode (icon Sparkles).",
      },
      {
        type: "feat",
        text: "Toggle Glass dari Login: Tombol di pojok kanan atas Login page. First-time enable tampil warning + auto-detect device <4GB RAM. Persist via localStorage habil_glass_mode.",
      },
      {
        type: "feat",
        text: "Animasi Transisi 350ms: Crossfade smooth saat toggle on/off (backdrop-filter + bg + border + shadow). Icon Glass micro-animation scale 1.08 saat aktif + ripple saat click.",
      },
      {
        type: "fix",
        text: "Triple Safety Net: (1) Git tag v1.4.2-pre-glass-stable untuk rollback. (2) URL kill switch ?glass=off untuk emergency disable. (3) Try-catch wrapper di hook — auto-disable kalau gagal.",
      },
      {
        type: "ui",
        text: "Glass overlay ringan: frost 18/24/12, saturate terjaga, respect prefers-reduced-transparency + prefers-reduced-motion. Tabel & input field tetap solid untuk readability.",
      },
      {
        type: "feat",
        text: 'Stats Cards Tinted: 4 metric card Dashboard pakai glass dengan tint warna sesuai (green/blue/orange/purple). Welcome modal "APA YANG BARU?" cards juga glass-aware.',
      },
    ],
  },
  {
    version: "v1.4.2-stable",
    date: "25 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Dashboard Dark Mode: Kanban Manajemen Tugas, task cards, DRAG HERE TO DELETE zone, modal add/edit tugas — semua kini ikut dark mode (sebelumnya hardcoded putih).",
      },
      {
        type: "fix",
        text: "Inventory Visual: Mini bar Stok tidak lagi muncul untuk produk tanpa Stok Minimum (hilangkan garis nyasar). Kolom Exp Terdekat: produk aman (>90 hari) tampil plain text, hanya yang mendekati/expired yang punya badge background.",
      },
      {
        type: "feat",
        text: "Nota Penjualan — Sort Kolom: Klik header No.Nota / Tanggal / Total untuk sort asc/desc dengan indicator chevron. Default sort by Tanggal terbaru.",
      },
      {
        type: "feat",
        text: "Customer — Metadata Cards: Setiap card kini tampil jumlah nota, total transaksi (compact), dan tanggal transaksi terakhir. Sort dropdown: A-Z / Z-A / Paling Aktif / Top Spender / Terlama.",
      },
      {
        type: "ui",
        text: 'Customer Cards: Customer tanpa telepon & alamat tampil callout "Lengkapi data →" (clickable). Empty state baru dengan CTA "Tambah Customer Pertama".',
      },
      {
        type: "ui",
        text: "Accessibility: Aria-label untuk semua icon button (Cetak/Edit/Hapus di Nota + Customer cards). Fix colspan empty state Nota Penjualan (6 → 7).",
      },
    ],
  },
  {
    version: "v1.4.1-stable",
    date: "24 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "feat",
        text: "Dark Mode di Login: Toggle ☀️/🌙 muncul di pojok kanan atas Login page — preferensi tersimpan di localStorage dan persist ke seluruh app.",
      },
      {
        type: "feat",
        text: 'Welcome Modal Auto-Sync: Popup "APA YANG BARU?" tiap login otomatis render dari RELEASES[0].changes (ikon + badge per type: feat/fix/ui/perf). Tidak hardcoded lagi.',
      },
      {
        type: "ui",
        text: "Roadmap Cleanup: Password Hashing dipindah dari Upcoming → sudah implemented sejak v1.3.40 (bcrypt dual-mode). Tambah QR Scanner + Predictive Restocking + TypeScript Migration sebagai upcoming.",
      },
    ],
  },
  {
    version: "v1.4.0-stable",
    date: "24 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "feat",
        text: "Inventory — Expandable Row: Klik chevron ▶ di list produk untuk lihat semua batch (No.Batch, ED, Qty, HNA) tanpa pindah halaman.",
      },
      {
        type: "feat",
        text: "Inventory — Detail Drawer: Klik nama produk → panel slide-in dari kanan dengan 3 tab: Profil, Batch (CRUD lengkap), Riwayat (timeline mutasi).",
      },
      {
        type: "feat",
        text: "Inventory — Edit Batch Penuh: No.Batch, ED, HNA, Catatan bisa di-edit langsung; qty via tombol Adjust dengan audit trail (alasan wajib).",
      },
      {
        type: "feat",
        text: "Stok Opname Per Batch: Modal opname rombak total — 2-pane layout, input fisik per batch, selisih ke-trace ke batch spesifik (bukan per-produk lagi).",
      },
      {
        type: "ui",
        text: "Inventory Toolbar: Tombol Stok Keluar kini di header (sebelumnya hanya icon row); tambah filter status (low/expiring/expired); mini stock bar visual di kolom Stok.",
      },
      {
        type: "feat",
        text: "Endpoint Baru: GET /products/:id/full, PUT/DELETE /batches/:id, POST /batches/:id/adjust + realtime socket emit setelah batch berubah.",
      },
      {
        type: "fix",
        text: "Schema: ALTER stock_opname.batch_id + inventory_batches.notes/is_active untuk per-batch tracking & soft-delete batch.",
      },
    ],
  },
  {
    version: "v1.3.47-stable",
    date: "24 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: 'Tambah Produk Gagal: Error "duplicate key value violates unique constraint product_master_pkey" saat tambah produk baru di Inventory kini sudah teratasi. Penyebab: sequence ID tertinggal setelah migrasi data Supabase → Neon. Fix: auto-resync sequence saat backend start (juga untuk batch, mutations, dan opname).',
      },
    ],
  },
  {
    version: "v1.3.46-stable",
    date: "11 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Nota PDF — Layout 1 Halaman: PDF nota tidak lagi terpecah menjadi 2 halaman. NOTE, rekening, QRIS, dan tanda tangan kini selalu muncul bersama di bawah grand total — tidak ada lagi halaman kosong.",
      },
    ],
  },
  {
    version: "v1.3.45-stable",
    date: "11 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: 'Nota PDF — Footer Sync: "Dengan senang hati melayani anda" dan data Pengaturan kini benar-benar masuk ke PDF (fix key mismatch shop_name/footer → company_name/footer_text).',
      },
      {
        type: "feat",
        text: 'Nota PDF — Nama Penanda Tangan: Garis kanan nota kini menampilkan "Hormat kami," + nama penanda tangan yang diatur di Pengaturan.',
      },
      {
        type: "feat",
        text: "Nota PDF — Ketentuan / Notes: Tambah field ketentuan pengembalian di Pengaturan — tampil merah di PDF (NOTE: 1. 2. 3.).",
      },
      {
        type: "feat",
        text: "Nota PDF — Info Rekening & QRIS: Tambah field rekening bank dan teks QRIS di Pengaturan — tampil di PDF sebelum tanda tangan.",
      },
      {
        type: "ui",
        text: "Pengaturan Cetak: Tambah 4 field baru (Nama Penanda Tangan, Rekening Bank, QRIS, Ketentuan) dengan live preview yang menampilkan semua elemen nota.",
      },
    ],
  },
  {
    version: "v1.3.45-stable",
    date: "10 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Schema payment_status + paid_at: Kolom ini kini dibuat otomatis via ALTER TABLE — dashboard stats dan update status bayar tidak lagi crash pada fresh DB.",
      },
      {
        type: "fix",
        text: "Product Rename Sync: Rename produk kini juga update product_catalog — nama lama tidak lagi muncul di dropdown setelah diganti.",
      },
      {
        type: "fix",
        text: "Opname FOR UPDATE: Deduction batch saat opname kini pakai SELECT FOR UPDATE — mencegah double-deduct jika 2 opname berjalan bersamaan.",
      },
      {
        type: "fix",
        text: "Batch Picker Expired Filter: Dropdown batch di nota penjualan tidak lagi menampilkan batch yang sudah expired.",
      },
      {
        type: "fix",
        text: "Soft-delete GET/:id: Faktur dan Surat Pesanan yang sudah dihapus kini mengembalikan 404 — tidak bisa diakses via direct URL.",
      },
      {
        type: "fix",
        text: "Over-receive Guard: Penerimaan barang (SP → Faktur) kini divalidasi — tidak bisa menerima lebih dari qty yang dipesan.",
      },
      {
        type: "fix",
        text: 'HPP NaN Fix: Kolom HPP di daftar faktur tidak lagi menampilkan "NaN" untuk item dengan hna_per_item = 0.',
      },
      {
        type: "perf",
        text: "API Timeout: Timeout global naik dari 10s → 30s — PDF dan operasi besar tidak lagi timeout di production.",
      },
      {
        type: "perf",
        text: "Kanban History: Hapus wasted API call (tasksAPI.getAll) setiap buka history task.",
      },
    ],
  },
  {
    version: "v1.3.43-stable",
    date: "10 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "FEFO Transaction Safety: Stock deduction nota penjualan kini berada di dalam DB transaction — mencegah race condition stok negatif saat 2 user order bersamaan.",
      },
      {
        type: "fix",
        text: "FEFO Expired Filter: Batch yang sudah expired tidak lagi dipakai untuk penjualan (filter expired_date >= today).",
      },
      {
        type: "fix",
        text: "Stok Kurang Error: Jika stok tidak cukup saat buat nota, transaksi dibatalkan otomatis + pesan error jelas (sebelumnya: nota tersimpan tapi stok tidak terpotong).",
      },
      {
        type: "fix",
        text: "Invoice Transaction: Simpan faktur masukan kini atomic — jika auto stock-in gagal, seluruh faktur dibatalkan (tidak ada data setengah-setengah).",
      },
      {
        type: "fix",
        text: "Invoice Delete Cleanup: Hapus permanen faktur kini juga membersihkan inventory_batches dan mutations terkait — tidak ada lagi phantom stock.",
      },
      {
        type: "fix",
        text: "Schema Missing Columns: Tambah ALTER TABLE untuk gross_profit (sales_orders) dan unit_hpp (sales_items) — fresh DB tidak lagi crash saat buat nota.",
      },
      {
        type: "perf",
        text: "Invoice List: Faktur tidak lagi auto-expand semua baris saat halaman dibuka — menghilangkan 50+ API calls beruntun yang memperlambat halaman.",
      },
      {
        type: "ui",
        text: "Filter Tahun Dinamis: Dropdown filter tahun di Nota Penjualan kini auto-generate ±2 tahun dari tahun sekarang — tidak lagi stuck di 2024-2026.",
      },
    ],
  },
  {
    version: "v1.3.42-stable",
    date: "10 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "feat",
        text: "Product MasterSelect di Nota: Dropdown produk di form nota penjualan kini dilengkapi CRUD inline — cari, tambah, rename, dan hapus produk langsung dari nota.",
      },
      {
        type: "feat",
        text: "HPP Auto-fill Reliable: Pilih produk via dropdown → HPP/HNA otomatis terisi dari batch FEFO, bisa diedit manual per baris.",
      },
      {
        type: "fix",
        text: "Error Feedback Inventory: Pesan error saat tambah/edit produk kini tampil merah (❌) di dalam modal dan sebagai toast — tidak lagi tampil hijau seperti sukses.",
      },
    ],
  },
  {
    version: "v1.3.42-stable",
    date: "05 Mei 2026",
    status: "stable",
    changes: [
      {
        type: "feat",
        text: "Batch Number Faktur: Field No. Batch/Lot per item di faktur masukan — tersimpan ke inventory batch untuk traceability.",
      },
      {
        type: "feat",
        text: "Tempo Pembayaran Nota: Quick-select 7/14/30 hari di form nota penjualan — due_date otomatis terhitung dari tanggal jual.",
      },
      {
        type: "feat",
        text: "Quick-Select Jatuh Tempo Faktur: Tombol +1/+7/+21/+30 hari di form faktur untuk isi due_date cepat.",
      },
      {
        type: "feat",
        text: "Dropdown Batch Harga Nota: Pilih batch spesifik (batch_no + ED + stok + HNA) saat input produk di nota — harga otomatis dari batch FEFO.",
      },
      {
        type: "ui",
        text: "Animasi Overdue: Badge jatuh tempo merah berkedip (pulse) saat faktur/nota sudah melewati due_date.",
      },
      {
        type: "fix",
        text: "Persistent Login: Token JWT diperpanjang 15 menit → 7 hari — user tidak perlu login ulang setiap buka browser.",
      },
    ],
  },
  {
    version: "v1.3.40-stable",
    date: "26 Apr 2026",
    status: "stable",
    changes: [
      {
        type: "feat",
        text: "Keamanan: Password hashing bcrypt (dual-mode migration) — plaintext otomatis di-upgrade saat login.",
      },
      {
        type: "feat",
        text: "Rate Limiting: Login dibatasi 5x per 15 menit per IP untuk mencegah brute force.",
      },
      {
        type: "feat",
        text: "Auth Middleware: Semua endpoint Tasks kini memerlukan token JWT.",
      },
      {
        type: "feat",
        text: "Validasi Hapus Customer: Customer yang masih punya nota belum lunas tidak bisa dihapus.",
      },
      {
        type: "ui",
        text: "Toast Notifications: Semua alert() browser diganti dengan toast notification in-app.",
      },
      {
        type: "ui",
        text: 'Empty States: Tampilan "belum ada data" di semua halaman list.',
      },
      {
        type: "ui",
        text: 'PDF Loading State: Tombol Cetak menampilkan "Membuat PDF..." dan di-disable saat proses berlangsung.',
      },
      {
        type: "ui",
        text: "Mobile Responsive Tables: Semua tabel kini bisa di-scroll horizontal di layar kecil.",
      },
    ],
  },
  {
    version: "v1.3.39-stable",
    date: "29 Apr 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Pelunasan Date Picker: Klik badge BELUM BAYAR → modal pilih tanggal pelunasan. Tanggal LUNAS bisa diedit kapan saja (✏️).",
      },
      {
        type: "new",
        text: "Batalkan Pelunasan: Modal edit menampilkan tombol untuk mengembalikan status ke Belum Bayar.",
      },
      {
        type: "new",
        text: "Channel Online/Offline: Setiap nota kini punya flag 🏪 Offline / 🛒 Online — untuk laporan pajak (digunggung vs tidak). Tidak tampil di PDF.",
      },
      {
        type: "ui",
        text: 'Filter Saluran: Dropdown filter baru "Semua Saluran / Offline / Online" di halaman Nota Penjualan.',
      },
      {
        type: "ui",
        text: "Badge Channel: Kolom Customer menampilkan badge OFFLINE/ONLINE di bawah nama customer.",
      },
    ],
  },
  {
    version: "v1.3.38-stable",
    date: "23 Apr 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: 'Edit SP Loading: Tombol Simpan kini menampilkan "Menyimpan..." dan error edit tampil inline.',
      },
      {
        type: "fix",
        text: "Auto Counter SP: Counter sync ke MAX aktual sebelum increment — tidak loncat setelah SP dihapus.",
      },
      {
        type: "fix",
        text: "Manual SP: Nomor SP yang sudah dihapus kini bisa dipakai ulang (partial unique index).",
      },
      {
        type: "fix",
        text: 'Edit SP Date: Estimasi Tiba kosong tidak lagi menyebabkan error "invalid input syntax for type date".',
      },
      {
        type: "ui",
        text: "Sort Tabel SP: Klik header kolom untuk sort asc/desc · Shift+klik untuk multi-column sort (contoh: Tanggal ▼ + No.SP ▼ = terkini) · tombol ↺ Reset Sort muncul saat aktif.",
      },
    ],
  },
  {
    version: "v1.3.38-stable",
    date: "23 Apr 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Duplicate Key Customer: Reset sequence customers_id_seq — mencegah error saat tambah customer baru di Nota Penjualan.",
      },
      {
        type: "fix",
        text: "Duplicate Key Bug Report: Reset sequence bug_reports_id_seq — mencegah error saat kirim laporan bug.",
      },
      {
        type: "fix",
        text: "Cleanup Supabase: Hapus sisa referensi Supabase dari kode aktif. Sistem kini full Neon.",
      },
    ],
  },
  {
    version: "v1.3.36-stable",
    date: "20 Mar 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Counter Auto Desync: Manual save otomatis mengupdate sequence counter (Purchase Orders & Sales).",
      },
    ],
  },
  {
    version: "v1.3.34-stable",
    date: "20 Mar 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Duplicate Key Error Items: Sinkronisasi sequence tabel items dengan id maksimal real di DB.",
      },
    ],
  },
  {
    version: "v1.3.33-stable",
    date: "20 Mar 2026",
    status: "stable",
    changes: [
      {
        type: "ui",
        text: "Split Number Field: Prefix HSB-SP-/NOTA- dibuat readonly; field angka memiliki input mandiri.",
      },
      {
        type: "fix",
        text: "Counter Increment Refetch: Memastikan frontend memanggil ulang fetchCounters setelah save mode Auto.",
      },
    ],
  },
  {
    version: "v1.3.32-stable",
    date: "20 Mar 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Document Counter: Sinkronisasi nilai MAX(id) untuk SP untuk mencegah collision manual SP.",
      },
      {
        type: "ui",
        text: "Mode Dokumen: Sentralisasi tombol Auto/Manual ke dalam UI Pembuatan SP dan Nota.",
      },
    ],
  },
  {
    version: "v1.3.31-stable",
    date: "20 Mar 2026",
    status: "stable",
    changes: [
      {
        type: "ui",
        text: "UX Polish: Standarisasi seluruh copy/teks UI ke Bahasa Indonesia (Tombol Buat, Nama Menu, dll).",
      },
      {
        type: "ui",
        text: "Safe Actions: Universal Confirm Modal menggantikan window.confirm default browser.",
      },
      {
        type: "ui",
        text: "Navigasi: Breadcrumbs ditambahkan untuk semua halaman.",
      },
    ],
  },
  {
    version: "v1.3.30-stable",
    date: "20 Mar 2026",
    status: "stable",
    changes: [
      {
        type: "ui",
        text: "Mobile: Content area full-width saat sidebar hidden (centralized padding).",
      },
      {
        type: "fix",
        text: "Inventory Alert: Counter header sinkron dengan isi tab (exclude expired batches).",
      },
      {
        type: "fix",
        text: "Release Modal: sessionStorage di-clear saat logout — modal muncul setiap login baru.",
      },
      {
        type: "ui",
        text: "Form Nota: Validasi inline (red border + pesan error) menggantikan alert mentah.",
      },
      {
        type: "ui",
        text: 'Loading: Skeleton loader di header mencegah flash "0 records".',
      },
    ],
  },
  {
    version: "v1.3.29-stable",
    date: "20 Mar 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "BUG-001: Task creation — validasi input wajib, null-safe binding teratasi dari error 500 Vercel.",
      },
      {
        type: "fix",
        text: "BUG-002: HPP auto-fill dari FEFO batch — fallback multi-tier ke sell_price produk.",
      },
    ],
  },
  {
    version: "v1.3.28-stable",
    date: "16 Mar 2026",
    status: "stable",
    changes: [
      {
        type: "ui",
        text: "Sidebar Mobile: Redesign ke Modal Navigation Drawer (overlay 0.5 + blur, rounded edge, shadow lebih dalam).",
      },
      {
        type: "ui",
        text: "Animasi: Slide-in/out + backdrop fade 280ms dengan easing smooth.",
      },
      {
        type: "fix",
        text: "UX Drawer: Klik backdrop/menu auto-close, swipe kiri untuk tutup, focus trap + Escape, dan lock body scroll.",
      },
    ],
  },
  {
    version: "v1.3.21-stable",
    date: "15 Mar 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Nota: Header PDF kini menampilkan alamat & nomor telepon CV Habil dari pengaturan.",
      },
      {
        type: "fix",
        text: "Nota: Field HPP di form sekarang punya label yang jelas (sebelumnya hanya placeholder).",
      },
      {
        type: "feat",
        text: "Nota: Customer dropdown diupgrade ke MasterSelect dengan search, edit, delete, & tambah baru.",
      },
    ],
  },
  {
    version: "v1.3.19-stable",
    date: "14 Mar 2026",
    status: "stable",
    changes: [
      {
        type: "feat",
        text: "Tasks: Fitur Tempat Sampah (Trash) untuk melihat & restore task yang dihapus.",
      },
      {
        type: "feat",
        text: "Tasks: Support penghapusan permanen dari database via Trash.",
      },
      {
        type: "ui",
        text: "Tasks: Modal interaktif Trash yang elegan dan user-friendly.",
      },
    ],
  },
  {
    version: "v1.3.18-stable",
    date: "14 Mar 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: 'Pengaturan: Perbaikan error "Gagal menyimpan pengaturan" & sinkronisasi data.',
      },
      {
        type: "feat",
        text: "Nota: Tracking status pembayaran (Lunas/Belum) dengan 1-click toggle.",
      },
      {
        type: "feat",
        text: "Nota: CRUD HPP per item barang dan kalkulasi otomatis Laba Kotor.",
      },
    ],
  },
  {
    version: "v1.3.17-stable",
    date: "14 Mar 2026",
    status: "stable",
    changes: [
      {
        type: "feat",
        text: "Nota: Tracking status pembayaran (Lunas/Belum) dengan 1-click toggle.",
      },
      {
        type: "feat",
        text: "Nota: CRUD HPP per item barang dan kalkulasi otomatis Laba Kotor.",
      },
      {
        type: "ui",
        text: "Dashboard: Card statistik baru untuk total Laba Kotor (Paid Only).",
      },
      {
        type: "fix",
        text: "Inventory: Auto-fill HPP default dari master produk saat pilih barang di Nota.",
      },
    ],
  },
  {
    version: "v1.3.15-stable",
    date: "14 Mar 2026",
    status: "stable",
    changes: [
      {
        type: "feat",
        text: "Infrastructure: Migrasi database ke Neon.tech (Postgres Serverless) untuk optimasi kecepatan.",
      },
      {
        type: "fix",
        text: "Performance: Penurunan latency query database dan cold-start yang lebih responsif.",
      },
    ],
  },
  {
    version: "v1.3.7-stable",
    date: "14 Mar 2026",
    status: "stable",
    changes: [
      {
        type: "docs",
        text: "SOP Maintenance: Penutupan sesi, auto-journaling insiden schema Vercel.",
      },
      {
        type: "fix",
        text: "Global Audit: Verifikasi stabilitas database API dan sistem log v1.3.7.",
      },
    ],
  },
  {
    version: "v1.3.6-stable",
    date: "14 Mar 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: 'Database: Migrasi skema "pic" pada tabel tasks untuk mencegah error 500 saat Simpan Tugas.',
      },
      {
        type: "feat",
        text: "Stability: Inisialisasi ulang seluruh skema Kanban pada database cloud.",
      },
    ],
  },
  {
    version: "v1.3.5-stable",
    date: "14 Mar 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Kanban: Resolusi tombol Simpan yang tidak responsif di beberapa skenario.",
      },
      {
        type: "fix",
        text: "Kanban: Penyelarasan opsi prioritas (High/Medium/Low) di modal pembuatan tugas.",
      },
      {
        type: "fix",
        text: "State Management: Perbaikan pembersihan form (state reset) setelah tugas tersimpan.",
      },
    ],
  },
  {
    version: "v1.3.4-standard",
    date: "14 Mar 2026",
    status: "stable",
    changes: [
      {
        type: "feat",
        text: "Stability: Konsolidasi database connection pool untuk mencegah error MaxClients.",
      },
      {
        type: "feat",
        text: "Kanban: Fitur penugasan PIC (Harun/Fivin/Admin) dengan react-select.",
      },
      {
        type: "fix",
        text: "Kanban: Perbaikan bug tombol Simpan dan sinkronisasi modal detail.",
      },
      {
        type: "ui",
        text: 'Sidebar: Rename "Pengaturan Cetak" menjadi "Pengaturan" yang lebih universal.',
      },
    ],
  },
  {
    version: "v1.3.2-standard",
    date: "13 Mar 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Universal Sync: Sinkronisasi total label versi ke format v1.3.2-standard.",
      },
      {
        type: "new",
        text: "UI Audit: Pembersihan sisa-sisa label versi lama di seluruh tampilan.",
      },
    ],
  },
  {
    version: "v1.2.5",
    date: "13 Mar 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Global Version Sync: Penyelarasan seluruh label versi di UI & Dokumentasi.",
      },
      {
        type: "new",
        text: "Consistency: Sinkronisasi riwayat changelog modal dengan CHANGELOG.md.",
      },
    ],
  },
  {
    version: "v1.2.5",
    date: "13 Mar 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Session Shutdown: Penutupan sesi dan auditing SOP otomatis.",
      },
    ],
  },
  {
    version: "v1.2.1",
    date: "13 Mar 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Auto-Release Popup: Menampilkan ringkasan update HANYA SEKALI setelah login.",
      },
      {
        type: "fix",
        text: "Pre-Deployment Audit: Koneksi production dipastikan stabil.",
      },
    ],
  },
  {
    version: "v1.2.0",
    date: "13 Mar 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Master Distributor: Penambahan short_code, nama salesman, dan nomor HP.",
      },
      {
        type: "new",
        text: "Surat Pesanan (SP): UI PIC Dropdown (Harun/Fivin) & Info Salesman Otomatis.",
      },
      {
        type: "new",
        text: 'Print SP A6: Layout "Blue Area" khusus kertas A6 tersentral.',
      },
    ],
  },
  {
    version: "v1.1.9",
    date: "13 Mar 2026",
    status: "stable",
    changes: [
      { type: "new", text: "Branding: App kini resmi bernama HABIL SUPERAPP." },
      {
        type: "new",
        text: "Migrasi Counter: Sistem Auto-Numbering untuk SP, Nota, TT (Lock/Unlock feature).",
      },
    ],
  },
  {
    version: "v1.1.8",
    date: "13 Mar 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Documentation Consolidation: Single technical source of truth di CHANGELOG.md",
      },
      {
        type: "new",
        text: "Health Check Automatis: Pre-flight check DB setiap npm run dev",
      },
      {
        type: "fix",
        text: "Performance: Database indexing untuk pencarian produk",
      },
    ],
  },
  {
    version: "v1.1.7",
    date: "13 Mar 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "AI Efficiency Rules: Standarisasi Port 6543 & Dynamic API URL",
      },
      {
        type: "fix",
        text: "Smart API: Deteksi otomatis environment Lokal vs Vercel",
      },
    ],
  },
  {
    version: "v1.1.6",
    date: "12 Mar 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Data Sync: Auto-restore data produk & customer dari cloud backup",
      },
      {
        type: "new",
        text: "Sync Script: Tool mandiri untuk tarik data terbaru dari Supabase",
      },
    ],
  },
  {
    version: "v1.1.5",
    date: "12 Mar 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Cloud Bridge: Koneksi langsung ke database Supabase via Cloud URI",
      },
      {
        type: "fix",
        text: "Diagnostic Check: Script verifikasi koneksi database (Lokal/Cloud)",
      },
    ],
  },
  {
    version: "v1.1.4",
    date: "12 Mar 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Quality Assurance: Automated tests untuk Skeleton components",
      },
      {
        type: "fix",
        text: "Dashboard Fix: Perbaikan import React yang hilang",
      },
    ],
  },
  {
    version: "v1.1.3",
    date: "12 Mar 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Premium UX: Implementasi Skeleton Loading (Apple Style)",
      },
      {
        type: "fix",
        text: "Layout Consistency: Pencegahan layout shift saat muat data",
      },
    ],
  },
  {
    version: "v1.1.2",
    date: "12 Mar 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Dashboard Notes: Menambahkan bagian catatan/pengumuman penting untuk feedback user",
      },
      {
        type: "fix",
        text: "Version Sync: Sinkronisasi versi v1.1.2 di seluruh sistem (Anti-Belang)",
      },
      {
        type: "fix",
        text: "UI Fix: Perbaikan minor di halaman Print Settings",
      },
    ],
  },
  {
    version: "v1.1.1",
    date: "12 Mar 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Cloud Migration: Integrasi penuh dengan Vercel & Supabase (Singapore Region)",
      },
      {
        type: "fix",
        text: "CORS Fix: Perbaikan akses antar domain di lingkungan produksi",
      },
      { type: "new", text: "Nota PDF Builder: Layout landscape untuk A5 & A6" },
    ],
  },
  {
    version: "v1.1.0",
    date: "12 Mar 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Dashboard Stats Integrasi: Angka penjualan, pesanan aktif, stok low, dan customer kini real-time dari database",
      },
      {
        type: "new",
        text: "Database Seed Master: Integrasi data existing SP, Customer, dan Distributor ke sistem",
      },
    ],
  },
  {
    version: "v1.0.0",
    date: "12 Mar 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Toko Online: Import CSV Shopee & TikTok, Kalkulasi profit",
      },
      {
        type: "new",
        text: "Buku Besar: Sistem Jurnal Keuangan Khusus Direktur",
      },
      {
        type: "new",
        text: "Surat Pesanan: Auto-PO, tracking receive langsung masuk Inventory",
      },
      { type: "new", text: "Inventory: FEFO tracking otomatis" },
    ],
  },
  {
    version: "v0.6.3",
    date: "11 Mar 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "ESLint warnings bersih: unused imports & missing dependencies diperbaiki",
      },
      {
        type: "fix",
        text: "Database branch isolation: otomatis deteksi branch git & load .env.dev di dev branch",
      },
      {
        type: "new",
        text: "Clean Repo: hapus ~10MB file sampah, build lama, dan CRA boilerplate",
      },
    ],
  },
  {
    version: "v0.6.2",
    date: "11 Mar 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Bug tanggal: restore parseLocalDate/formatLocalDate + TO_CHAR di backend",
      },
      {
        type: "new",
        text: "Warna unik per distributor di rekap stack & row tabel",
      },
    ],
  },
];

// UPCOMING_FEATURES — single source of truth untuk roadmap modal "Changelog & Roadmap".
// Cara update: tambah/edit/hapus entry. Saat fitur shipped, HAPUS dari sini dan tambahkan ke RELEASES[0].changes.
// Fields: priority ('high'|'medium'|'low'), title (string), desc (string).
const upcoming = [
  {
    priority: "high",
    title: "Export PDF / Excel",
    desc: "Export faktur individual atau rekap bulanan ke PDF & Excel untuk laporan dan arsip",
  },
  {
    priority: "high",
    title: "Halaman Finance & Karyawan",
    desc: "Modul lanjutan untuk penggajian dan manajemen hutang/piutang",
  },
  {
    priority: "medium",
    title: "Predictive Restocking",
    desc: "Alert otomatis kapan harus restock berdasarkan velocity penjualan + lead time supplier",
  },
  {
    priority: "low",
    title: "TypeScript Migration",
    desc: "Full type safety untuk seluruh codebase",
  },
];

function CountUpValue({ value, formatter, loading }) {
  const display = useCountUp(value, UI_MOTION.duration.countUp, loading);
  return <>{formatter(display)}</>;
}

export default function Dashboard({
  isDarkMode,
  isSidebarOpen,
  isMobile,
  isVantaMode,
}) {
  const [showModal, setShowModal] = useState(false);
  const [showDevNotes, setShowDevNotes] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedChanges, setExpandedChanges] = useState(new Set());
  const onboarding = useOnboarding(true);
  // Show release modal once per session (per new login), reset on new version
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const releaseVersion = RELEASES[0]?.version || "v1.16.1-stable";
  const releaseStorageKey = `habil_release_seen_${releaseVersion.replace(/\./g, "_")}`;
  useBodyScrollLock(showModal || showReleaseModal);

  // v1.8.7: dark mode lebih layered + translucent (Vanta-friendly + text readable via backdrop blur)
  const bg = "var(--color-bg)";
  const cardBg = "var(--color-surface)";
  const border = "var(--color-border)";
  const text = "var(--color-text)";
  const sub = "var(--color-text-subtle)";

  const typeConfig = {
    new: {
      label: "Baru",
      color: "var(--color-success)",
      bg: "var(--color-success-soft)",
    },
    fix: {
      label: "Fix",
      color: "var(--color-primary)",
      bg: "var(--color-primary-soft)",
    },
    feat: {
      label: "Fitur",
      color: "var(--color-success)",
      bg: "var(--color-success-soft)",
    },
    ui: {
      label: "UI/UX",
      color: "var(--color-primary-hover)",
      bg: "var(--color-primary-hover)18",
    },
    docs: {
      label: "Docs",
      color: "var(--color-warning)",
      bg: "var(--color-warning-soft)",
    },
    changed: {
      label: "Ubah",
      color: "var(--color-warning)",
      bg: "var(--color-warning-soft)",
    },
    stability: {
      label: "Stabil",
      color: "var(--color-success)",
      bg: "var(--color-success-soft)",
    },
    removed: {
      label: "Hapus",
      color: "var(--color-danger)",
      bg: "var(--color-danger-soft)",
    },
  };
  const priorityConfig = {
    high: {
      label: "Prioritas Tinggi",
      color: "var(--color-danger)",
      bg: "var(--color-danger-soft)",
    },
    medium: {
      label: "Sedang",
      color: "var(--color-warning)",
      bg: "var(--color-warning-soft)",
    },
    low: {
      label: "Nanti",
      color: "var(--color-text-subtle)",
      bg: "color-mix(in srgb, var(--color-text-subtle) 18%, transparent)",
    },
  };

  const [stats, setStats] = useState({
    totalPenjualan: 0,
    prevTotalPenjualan: 0,
    totalLaba: 0,
    prevTotalLaba: 0,
    suratPesananAktif: 0,
    stokLowExpired: 0,
    totalCustomer: 0,
    marginByChannel: [],
    topCategoryMargins: [],
    topCustomers: [],
    dailyNota30d: [],
    stockMovement30d: [],
  });

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const { data } = await api.get("/dashboard/stats");
        setStats((prev) => ({
          ...prev,
          ...data,
          marginByChannel: Array.isArray(data?.marginByChannel)
            ? data.marginByChannel
            : [],
          topCategoryMargins: Array.isArray(data?.topCategoryMargins)
            ? data.topCategoryMargins
            : [],
          topCustomers: Array.isArray(data?.topCustomers)
            ? data.topCustomers
            : [],
          dailyNota30d: Array.isArray(data?.dailyNota30d)
            ? data.dailyNota30d
            : [],
          stockMovement30d: Array.isArray(data?.stockMovement30d)
            ? data.stockMovement30d
            : [],
        }));
      } catch (error) {
        console.error("Failed to fetch dashboard stats", error);
      } finally {
        setTimeout(() => setLoading(false), UI_MOTION.duration.page);
      }
    };
    fetchStats();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      try {
        setShowReleaseModal(!sessionStorage.getItem(releaseStorageKey));
      } catch {
        setShowReleaseModal(false);
      }
    }, UI_MOTION.duration.page);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [releaseStorageKey]);

  const closeReleaseModal = useCallback(() => {
    setShowReleaseModal(false);
    try {
      sessionStorage.setItem(releaseStorageKey, "true");
    } catch {}
  }, [releaseStorageKey]);

  // Escape key closes release modal
  useEffect(() => {
    if (!showReleaseModal) return;
    const handler = (e) => {
      if (e.key === "Escape") closeReleaseModal();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showReleaseModal, closeReleaseModal]);

  const formatRupiah = (number) => {
    const n = parseFloat(number) || 0;
    // v1.11.9: nominal penuh utk SEMUA nilai (sebelumnya compact Jt/M — user mau spesifik utk desain kartu)
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n);
  };

  const formatPercent = (number) =>
    `${(parseFloat(number) || 0).toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  const formatQty = (number) =>
    (parseFloat(number) || 0).toLocaleString("id-ID", {
      maximumFractionDigits: 0,
    });
  const channelMargins = stats.marginByChannel || [];
  const topCategoryMargins = stats.topCategoryMargins || [];
  const topCustomers = stats.topCustomers || [];
  const dailyNotaRows = stats.dailyNota30d || [];
  const stockMovementRows = stats.stockMovement30d || [];
  const formatDeltaPct = (currentValue, previousValue) => {
    const current = parseFloat(currentValue) || 0;
    const previous = parseFloat(previousValue) || 0;
    if (!current && !previous) return null;
    if (!previous && current) {
      return { label: "+100%", positive: true, icon: ArrowUpRight };
    }
    const pct = ((current - previous) / Math.abs(previous)) * 100;
    if (!Number.isFinite(pct)) return null;
    return {
      label: `${pct >= 0 ? "+" : ""}${pct.toLocaleString("id-ID", {
        maximumFractionDigits: 1,
      })}%`,
      positive: pct >= 0,
      icon: pct >= 0 ? ArrowUpRight : ArrowDownRight,
    };
  };
  const penjualanDelta = formatDeltaPct(
    stats.totalPenjualan,
    stats.prevTotalPenjualan,
  );
  const labaDelta = formatDeltaPct(stats.totalLaba, stats.prevTotalLaba);
  const maxChannelRevenue = Math.max(
    1,
    ...channelMargins.map((row) => Math.abs(parseFloat(row.revenue) || 0)),
  );
  const maxCategoryMargin = Math.max(
    1,
    ...topCategoryMargins.map((row) => Math.abs(parseFloat(row.margin) || 0)),
  );
  const maxCustomerSpending = Math.max(
    1,
    ...topCustomers.map((row) => Math.abs(parseFloat(row.spending) || 0)),
  );
  const marginColor = (value) =>
    (parseFloat(value) || 0) >= 0
      ? "var(--color-success)"
      : "var(--color-danger)";
  const channelColor = (channel) =>
    channel === "online"
      ? "var(--color-primary)"
      : channel === "offline"
        ? "var(--color-text-subtle)"
        : "var(--color-warning)";
  const toLocalYmd = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const buildStockMovementSeries = (rows = []) => {
    const map = new Map(rows.map((row) => [String(row.day).slice(0, 10), row]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 30 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (29 - index));
      const key = toLocalYmd(date);
      const row = map.get(key) || {};
      return {
        day: key,
        label: date.toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "short",
        }),
        inQty: parseFloat(row.inQty ?? row.in_qty ?? 0) || 0,
        outQty: parseFloat(row.outQty ?? row.out_qty ?? 0) || 0,
      };
    });
  };
  const buildDailyHeatmapSeries = (rows = []) => {
    const map = new Map(rows.map((row) => [String(row.day).slice(0, 10), row]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 30 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (29 - index));
      const key = toLocalYmd(date);
      const row = map.get(key) || {};
      const notaCount = parseFloat(row.notaCount ?? row.nota_count ?? 0) || 0;
      return {
        day: key,
        dayLabel: date.getDate().toString().padStart(2, "0"),
        weekday: date.toLocaleDateString("id-ID", { weekday: "short" }),
        notaCount,
        totalSales: parseFloat(row.totalSales ?? row.total_sales ?? 0) || 0,
      };
    });
  };
  const stockMovementSeries = buildStockMovementSeries(stockMovementRows);
  const dailyHeatmapSeries = buildDailyHeatmapSeries(dailyNotaRows);
  const maxHeatmapCount = Math.max(
    1,
    ...dailyHeatmapSeries.map((row) => row.notaCount || 0),
  );

  return (
    <div
      className="ui-motion-page font-sans min-h-screen transition-all duration-300"
      style={{
        padding: isMobile ? "1rem" : "2.5rem",
        paddingTop: isMobile ? "4rem" : "2.5rem",
        backgroundColor: isVantaMode ? "transparent" : bg,
      }}
    >
      {/* Header Section */}
      <div className="flex justify-between items-center mb-10">
        <div>
          <h1
            className="text-3xl font-bold mb-2 tracking-tight"
            style={{ color: text }}
          >
            Dashboard
          </h1>
          <p className="text-sm font-medium" style={{ color: sub }}>
            Welcome back to HABIL SUPERAPP.
          </p>
        </div>

        {/* Version Badge & Changelog Trigger */}
        <button
          onClick={() => setShowModal(true)}
          className="ui-motion-button ui-focus-ring flex items-center gap-2 px-4 py-2 rounded-full border transition-colors hover:shadow-sm"
          style={{ borderColor: border, color: text }}
        >
          <Info size={16} className="text-blue-500" />
          <span className="text-sm font-semibold">
            Version {RELEASES[0]?.version}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium ml-2">
            Release Notes
          </span>
        </button>
      </div>

      {/* Kanban Tasks Section - MOVED TO TOP. v1.8.8: hapus inline bg supaya CSS token tint apply */}
      <div
        data-onboarding="tasks"
        className="ui-motion-card mb-10 rounded-3xl p-8 border shadow-sm"
        style={{ borderColor: border }}
      >
        <TasksKanban isDarkMode={isDarkMode} isMobile={isMobile} />
      </div>

      {/* Quick Stats Cards */}
      <div
        data-onboarding="kpi"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10"
      >
        {[
          {
            label: "Total Penjualan bln ini",
            value: stats.totalPenjualan,
            previousValue: stats.prevTotalPenjualan,
            type: "currency",
            tint: "green",
            icon: <Activity size={24} className="text-green-500" />,
            emptyHint: "Belum ada nota paid/final bulan ini.",
          },
          {
            label: "Laba Kotor bln ini",
            value: stats.totalLaba,
            previousValue: stats.prevTotalLaba,
            type: "currency",
            tint: "blue",
            icon: <Activity size={24} className="text-blue-500" />,
            emptyHint: "Belum ada nota paid/final bulan ini.",
          },
          {
            label: "Surat Pesanan Aktif",
            value: stats.suratPesananAktif,
            type: "number",
            tint: "orange",
            icon: <ShoppingCart size={24} className="text-orange-500" />,
          },
          {
            label: "Stok Low/Expired",
            value: stats.stokLowExpired,
            type: "number",
            tint: "purple",
            icon: <Package size={24} className="text-red-500" />,
          },
        ].map((stat, i) => {
          const delta =
            stat.label === "Laba Kotor bln ini" ? labaDelta : penjualanDelta;
          const showDelta = typeof stat.previousValue !== "undefined" && delta;
          return (
            <div
              key={i}
              className={`ui-motion-card ui-hover-delight rounded-2xl p-6 border shadow-sm`}
              style={{ borderColor: border }}
            >
              <div className="flex justify-between items-start gap-3 mb-4">
                <div className="p-3 bg-gray-50 rounded-xl dark:bg-gray-800">
                  {stat.icon}
                </div>
                {showDelta && (
                  <div
                    className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                    style={{
                      borderColor: delta.positive
                        ? "var(--color-success-soft)"
                        : "var(--color-danger-soft)",
                      color: delta.positive
                        ? "var(--color-success)"
                        : "var(--color-danger)",
                      backgroundColor: delta.positive
                        ? "var(--color-success-soft)"
                        : "var(--color-danger-soft)",
                    }}
                  >
                    <delta.icon size={12} />
                    <span>{delta.label}</span>
                  </div>
                )}
              </div>
              {loading ? (
                <Skeleton width="80%" height="36px" className="mb-2" />
              ) : (
                <h3 className="text-3xl font-bold mb-1" style={{ color: text }}>
                  <CountUpValue
                    value={stat.value}
                    loading={loading}
                    formatter={
                      stat.type === "currency" ? formatRupiah : formatQty
                    }
                  />
                </h3>
              )}
              {!loading && stat.emptyHint && parseFloat(stat.value) === 0 && (
                <p className="text-sm font-medium mb-1" style={{ color: sub }}>
                  {stat.emptyHint}
                </p>
              )}
              <p className="text-sm font-medium" style={{ color: sub }}>
                {stat.label}
              </p>
            </div>
          );
        })}
      </div>

      {/* Activity Heatmap */}
      <section
        className="ui-motion-card ui-hover-delight rounded-3xl p-6 border shadow-sm mb-10"
        style={{ backgroundColor: cardBg, borderColor: border }}
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-lg font-bold" style={{ color: text }}>
              Aktivitas Nota Harian
            </h2>
            <p className="text-xs font-medium mt-1" style={{ color: sub }}>
              30 hari terakhir · paid/final
            </p>
          </div>
          <div
            className="p-3 rounded-xl"
            style={{
              backgroundColor: "var(--color-primary-soft)",
              color: "var(--color-primary)",
            }}
          >
            <BarChart3 size={22} />
          </div>
        </div>

        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
        >
          {dailyHeatmapSeries.map((cell) => {
            const intensity = Math.max(
              0,
              Math.min(1, cell.notaCount / maxHeatmapCount),
            );
            const fill = cell.notaCount
              ? `color-mix(in srgb, var(--color-primary) ${Math.round(18 + intensity * 52)}%, transparent)`
              : isDarkMode
                ? "var(--color-surface-raised)"
                : "var(--color-bg-subtle)";
            return (
              <div
                key={cell.day}
                title={`${cell.weekday}, ${cell.dayLabel} · ${cell.notaCount} nota`}
                className="aspect-square rounded-2xl border p-2 flex flex-col justify-between"
                style={{
                  backgroundColor: fill,
                  borderColor: cell.notaCount
                    ? "color-mix(in srgb, var(--color-primary) 26%, transparent)"
                    : border,
                }}
              >
                <span
                  className="text-[10px] font-semibold"
                  style={{ color: cell.notaCount ? text : sub }}
                >
                  {cell.dayLabel}
                </span>
                <span
                  className="text-[11px] font-bold text-right"
                  style={{
                    color: cell.notaCount ? "var(--color-primary)" : sub,
                  }}
                >
                  {cell.notaCount}
                </span>
              </div>
            );
          })}
        </div>

        <div
          className="flex items-center justify-between gap-4 mt-4 text-xs font-medium flex-wrap"
          style={{ color: sub }}
        >
          <span>0 = kosong, makin pekat = makin ramai</span>
          <span className="inline-flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-md border"
              style={{
                backgroundColor: isDarkMode
                  ? "var(--color-surface-raised)"
                  : "var(--color-bg-subtle)",
                borderColor: border,
              }}
            />
            <span
              className="w-3 h-3 rounded-md border"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--color-primary) 42%, transparent)",
                borderColor:
                  "color-mix(in srgb, var(--color-primary) 30%, transparent)",
              }}
            />
            <span
              className="w-3 h-3 rounded-md border"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--color-primary) 72%, transparent)",
                borderColor:
                  "color-mix(in srgb, var(--color-primary) 48%, transparent)",
              }}
            />
          </span>
        </div>
      </section>

      {/* Profitability Snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
        <section
          data-onboarding="chart"
          className="ui-motion-card ui-hover-delight rounded-3xl p-6 border shadow-sm"
          style={{ backgroundColor: cardBg, borderColor: border }}
        >
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="text-lg font-bold" style={{ color: text }}>
                Margin per Channel
              </h2>
              <p className="text-xs font-medium mt-1" style={{ color: sub }}>
                Nota paid/final bulan ini
              </p>
            </div>
            <div
              className="p-3 rounded-xl"
              style={{
                backgroundColor: "var(--color-primary-soft)",
                color: "var(--color-primary)",
              }}
            >
              <BarChart3 size={22} />
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col gap-4">
              {[0, 1].map((i) => (
                <Skeleton key={i} width="100%" height="58px" />
              ))}
            </div>
          ) : channelMargins.length ? (
            <div className="flex flex-col">
              {channelMargins.map((row, idx) => {
                const accent = channelColor(row.channel);
                const valueWidth = `${Math.min(100, (Math.abs(parseFloat(row.revenue) || 0) / maxChannelRevenue) * 100)}%`;
                const TrendIcon =
                  (parseFloat(row.margin) || 0) >= 0
                    ? ArrowUpRight
                    : ArrowDownRight;
                return (
                  <div
                    key={row.channel || idx}
                    className="py-4"
                    style={{ borderTop: idx ? `1px solid ${border}` : "none" }}
                  >
                    <div className="flex items-center justify-between gap-4 mb-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: accent }}
                          />
                          <span
                            className="text-sm font-bold truncate"
                            style={{ color: text }}
                          >
                            {row.label}
                          </span>
                        </div>
                        <p className="text-xs mt-1" style={{ color: sub }}>
                          {row.orderCount} nota · Omzet{" "}
                          {formatRupiah(row.revenue)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <div
                          className="flex items-center justify-end gap-1 text-sm font-bold"
                          style={{ color: marginColor(row.margin) }}
                        >
                          <TrendIcon size={14} />
                          {formatRupiah(row.margin)}
                        </div>
                        <p
                          className="text-xs font-semibold"
                          style={{ color: sub }}
                        >
                          {formatPercent(row.marginPct)}
                        </p>
                      </div>
                    </div>
                    <div
                      className="h-1.5 rounded-full overflow-hidden"
                      style={{
                        backgroundColor: isDarkMode
                          ? "var(--color-surface-raised)"
                          : "var(--color-border)",
                      }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{ width: valueWidth, backgroundColor: accent }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              compact
              icon={EmptyStateIcons.chart}
              title="Belum ada nota paid/final bulan ini."
              description="Ringkasan performa akan muncul begitu ada transaksi final yang masuk ke bulan ini."
            />
          )}
        </section>

        <section
          className="ui-motion-card ui-hover-delight rounded-3xl p-6 border shadow-sm"
          style={{ backgroundColor: cardBg, borderColor: border }}
        >
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="text-lg font-bold" style={{ color: text }}>
                Top Kategori Margin
              </h2>
              <p className="text-xs font-medium mt-1" style={{ color: sub }}>
                Urutan kontribusi laba bulan ini
              </p>
            </div>
            <div
              className="p-3 rounded-xl"
              style={{
                backgroundColor: "var(--color-success-soft)",
                color: "var(--color-success)",
              }}
            >
              <Tags size={22} />
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col gap-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} width="100%" height="52px" />
              ))}
            </div>
          ) : topCategoryMargins.length ? (
            <div className="flex flex-col">
              {topCategoryMargins.map((row, idx) => {
                const color = marginColor(row.margin);
                const valueWidth = `${Math.min(100, (Math.abs(parseFloat(row.margin) || 0) / maxCategoryMargin) * 100)}%`;
                return (
                  <div
                    key={row.category || idx}
                    className="py-3.5"
                    style={{ borderTop: idx ? `1px solid ${border}` : "none" }}
                  >
                    <div className="flex items-center justify-between gap-4 mb-2">
                      <div className="min-w-0">
                        <p
                          className="text-sm font-bold truncate"
                          style={{ color: text }}
                        >
                          {row.category}
                        </p>
                        <p className="text-xs mt-1" style={{ color: sub }}>
                          {formatQty(row.qty)} qty · {row.orderCount} nota
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold" style={{ color }}>
                          {formatRupiah(row.margin)}
                        </p>
                        <p
                          className="text-xs font-semibold"
                          style={{ color: sub }}
                        >
                          {formatPercent(row.marginPct)}
                        </p>
                      </div>
                    </div>
                    <div
                      className="h-1.5 rounded-full overflow-hidden"
                      style={{
                        backgroundColor: isDarkMode
                          ? "var(--color-surface-raised)"
                          : "var(--color-border)",
                      }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{ width: valueWidth, backgroundColor: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              compact
              icon={EmptyStateIcons.chart}
              title="Belum ada kategori dengan margin bulan ini."
              description="Kategori dengan kontribusi margin akan tampil otomatis setelah ada nota final."
            />
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
        <section
          className="ui-motion-card ui-hover-delight rounded-3xl p-6 border shadow-sm"
          style={{ backgroundColor: cardBg, borderColor: border }}
        >
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="text-lg font-bold" style={{ color: text }}>
                Top 5 Customer Bulan Ini
              </h2>
              <p className="text-xs font-medium mt-1" style={{ color: sub }}>
                Berdasarkan total pembelian nota paid/final
              </p>
            </div>
            <div
              className="p-3 rounded-xl"
              style={{
                backgroundColor: "var(--color-primary-soft)",
                color: "var(--color-primary)",
              }}
            >
              <Users size={22} />
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col gap-4">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} width="100%" height="52px" />
              ))}
            </div>
          ) : topCustomers.length ? (
            <div className="flex flex-col">
              {topCustomers.map((row, idx) => {
                const valueWidth = `${Math.min(100, (Math.abs(parseFloat(row.spending) || 0) / maxCustomerSpending) * 100)}%`;
                return (
                  <div
                    key={`${row.customerName}-${idx}`}
                    className="py-3.5"
                    style={{ borderTop: idx ? `1px solid ${border}` : "none" }}
                  >
                    <div className="flex items-center justify-between gap-4 mb-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                            style={{
                              backgroundColor: "var(--color-primary-soft)",
                              color: "var(--color-primary)",
                            }}
                          >
                            {idx + 1}
                          </span>
                          <span
                            className="text-sm font-bold truncate"
                            style={{ color: text }}
                          >
                            {row.customerName}
                          </span>
                        </div>
                        <p className="text-xs mt-1" style={{ color: sub }}>
                          {row.notaCount} nota · {formatRupiah(row.spending)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <div
                          className="flex items-center justify-end gap-1 text-sm font-bold"
                          style={{ color: "var(--color-primary)" }}
                        >
                          <TrendingUp size={14} />
                          {formatRupiah(row.spending)}
                        </div>
                        <p
                          className="text-xs font-semibold"
                          style={{ color: sub }}
                        >
                          {row.notaCount} transaksi
                        </p>
                      </div>
                    </div>
                    <div
                      className="h-1.5 rounded-full overflow-hidden"
                      style={{
                        backgroundColor: isDarkMode
                          ? "var(--color-surface-raised)"
                          : "var(--color-border)",
                      }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: valueWidth,
                          backgroundColor: "var(--color-primary)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              compact
              icon={EmptyStateIcons.users}
              title="Belum ada customer dengan transaksi bulan ini."
              description="Daftar pelanggan aktif akan muncul setelah ada nota yang selesai diproses."
            />
          )}
        </section>

        <section
          className="ui-motion-card ui-hover-delight rounded-3xl p-6 border shadow-sm"
          style={{ backgroundColor: cardBg, borderColor: border }}
        >
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="text-lg font-bold" style={{ color: text }}>
                Pergerakan Stok 30 Hari
              </h2>
              <p className="text-xs font-medium mt-1" style={{ color: sub }}>
                Ringkasan stok masuk dan keluar harian
              </p>
            </div>
            <div
              className="p-3 rounded-xl"
              style={{
                backgroundColor: "var(--color-success-soft)",
                color: "var(--color-success)",
              }}
            >
              <BarChart3 size={22} />
            </div>
          </div>

          <div style={{ height: "240px" }}>
            <Suspense fallback={<Skeleton width="100%" height="240px" />}>
              <StockMovementChart
                data={stockMovementSeries}
                isDarkMode={isDarkMode}
                border={border}
                sub={sub}
                formatQty={formatQty}
              />
            </Suspense>
          </div>
          <div
            className="flex items-center gap-4 mt-4 text-xs font-medium"
            style={{ color: sub }}
          >
            <span className="inline-flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: "var(--color-success)" }}
              />{" "}
              Stok Masuk
            </span>
            <span className="inline-flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: "var(--color-danger)" }}
              />{" "}
              Stok Keluar
            </span>
          </div>
        </section>
      </div>

      {/* Quick Access Section - Compacted Row */}
      <div
        data-onboarding="quick-actions"
        className="flex flex-col md:flex-row gap-6 mb-10"
      >
        <div
          className="ui-motion-card ui-hover-delight flex-1 rounded-3xl p-6 border shadow-sm flex items-center justify-between"
          style={{ backgroundColor: cardBg, borderColor: border }}
        >
          <div className="flex items-center gap-6">
            <h2 className="text-lg font-bold" style={{ color: text }}>
              Akses Cepat
            </h2>
            <div className="flex flex-wrap gap-3">
              <a
                href="/sales"
                className="ui-motion-button px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-1"
              >
                <Plus size={14} /> Buat Nota
              </a>
              <a
                href="/orders"
                className="ui-motion-button px-4 py-2 rounded-xl border text-xs font-semibold transition-all hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center gap-1"
                style={{ borderColor: border, color: text }}
              >
                <Plus size={14} /> Buat SP
              </a>
              <a
                href="/online-store"
                className="ui-motion-button px-4 py-2 rounded-xl border text-xs font-semibold transition-all hover:bg-gray-50 dark:hover:bg-gray-800"
                style={{ borderColor: border, color: text }}
              >
                CSV Online
              </a>
            </div>
          </div>

          <button
            onClick={() => setShowDevNotes(true)}
            className="ui-motion-button ui-focus-ring flex items-center gap-2 px-4 py-2 rounded-xl border border-blue-100 bg-blue-50/30 text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <Info size={14} />
            <span className="text-xs font-bold">Catatan Developer</span>
          </button>
        </div>
      </div>

      {/* Auto-Release Popup v1.2.1 */}
      {showReleaseModal &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 transition-opacity">
            <div
              className="ui-motion-modal ui-modal-shell w-full max-w-[min(1040px,calc(100vw-32px))] max-h-[calc(100dvh-32px)] overflow-hidden rounded-3xl shadow-2xl flex flex-col transform transition-all scale-100"
              style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
            >
              {/* Spotlight Header */}
              <div
                className="relative p-8 text-center"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-hover) 100%)",
                }}
              >
                <button
                  onClick={closeReleaseModal}
                  aria-label="Tutup popup rilis"
                  className="ui-motion-button ui-focus-ring absolute top-4 right-4 p-2 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
                >
                  <X size={20} />
                </button>
                <div className="mx-auto w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-4 shadow-inner backdrop-blur-sm">
                  <span className="text-3xl">🚀</span>
                </div>
                <h2 className="text-2xl font-extrabold text-white tracking-tight">
                  APA YANG BARU?
                </h2>
                <p className="text-white/80 font-medium mt-1">
                  Habil SuperApp {RELEASES[0]?.version} telah mengudara!
                </p>
              </div>

              {/* Content Highlights — auto-sourced dari RELEASES[0].changes */}
              <div className="p-6 pb-2" style={{ backgroundColor: bg }}>
                <div className="flex flex-col gap-3 max-h-[55vh] overflow-y-auto pr-1">
                  {(RELEASES[0]?.changes || []).slice(0, 6).map((c, idx) => {
                    const typeMeta = {
                      feat: {
                        Icon: Sparkles,
                        bg: "bg-blue-50 dark:bg-blue-900/30",
                        fg: "text-blue-600 dark:text-blue-400",
                        label: "BARU",
                      },
                      new: {
                        Icon: Sparkles,
                        bg: "bg-blue-50 dark:bg-blue-900/30",
                        fg: "text-blue-600 dark:text-blue-400",
                        label: "BARU",
                      },
                      fix: {
                        Icon: Wrench,
                        bg: "bg-green-50 dark:bg-green-900/30",
                        fg: "text-green-600 dark:text-green-400",
                        label: "FIX",
                      },
                      ui: {
                        Icon: Palette,
                        bg: "bg-purple-50 dark:bg-purple-900/30",
                        fg: "text-purple-600 dark:text-purple-400",
                        label: "UI",
                      },
                      perf: {
                        Icon: Zap,
                        bg: "bg-orange-50 dark:bg-orange-900/30",
                        fg: "text-orange-600 dark:text-orange-400",
                        label: "CEPAT",
                      },
                    }[c.type] || {
                      Icon: Activity,
                      bg: "bg-gray-50 dark:bg-gray-800",
                      fg: "text-gray-500",
                      label: c.type?.toUpperCase(),
                    };
                    const TypeIcon = typeMeta.Icon;
                    const [headLine, ...rest] = (c.text || "").split(":");
                    const heading = rest.length
                      ? headLine
                      : headLine.length > 60
                        ? headLine.slice(0, 60) + "…"
                        : headLine;
                    const body = rest.length ? rest.join(":").trim() : "";
                    return (
                      <div
                        key={idx}
                        className="ui-hover-delight flex gap-3 items-start p-3.5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700"
                      >
                        <div
                          className={`p-2 rounded-xl ${typeMeta.bg} ${typeMeta.fg} flex-shrink-0`}
                        >
                          <TypeIcon size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3
                              className="font-bold leading-tight text-sm"
                              style={{
                                color: isDarkMode
                                  ? "#FFFFFF"
                                  : "var(--color-text)",
                              }}
                            >
                              {heading}
                            </h3>
                            <span
                              className={`text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded ${typeMeta.bg} ${typeMeta.fg}`}
                            >
                              {typeMeta.label}
                            </span>
                          </div>
                          {body && (
                            <p
                              className="text-xs font-medium leading-relaxed"
                              style={{
                                color: isDarkMode
                                  ? "var(--color-text-subtle)"
                                  : "var(--color-text-muted)",
                              }}
                            >
                              {body}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {(RELEASES[0]?.changes?.length || 0) > 6 && (
                    <p className="text-xs text-center text-gray-500 dark:text-gray-400 italic py-1">
                      + {RELEASES[0].changes.length - 6} perubahan lainnya di
                      Changelog
                    </p>
                  )}
                  {(RELEASES[0]?.changes?.length || 0) === 0 && (
                    <p className="text-sm text-center text-gray-500 dark:text-gray-400 py-4">
                      Tidak ada catatan perubahan untuk versi ini.
                    </p>
                  )}
                </div>
              </div>

              {/* CTA Button */}
              <div
                className="p-6 pt-4 flex justify-center"
                style={{ backgroundColor: bg }}
              >
                <button
                  onClick={closeReleaseModal}
                  className="btn-primary ui-motion-button ui-focus-ring w-full py-3.5 rounded-xl text-white font-bold text-base shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all outline-none focus:ring-4 focus:ring-blue-500/50"
                  data-magnetic="true"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-hover) 100%)",
                  }}
                >
                  Siap, Gas!
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      <OnboardingTour
        active={onboarding.active && !showReleaseModal}
        currentStep={onboarding.currentStep}
        stepIndex={onboarding.stepIndex}
        steps={onboarding.steps}
        onNext={onboarding.next}
        onSkip={onboarding.skip}
      />

      {/* Changelog & Upcoming Modal */}
      {showModal &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px] transition-opacity">
            <div
              className="ui-motion-modal ui-modal-shell w-full max-w-[min(1040px,calc(100vw-32px))] max-h-[calc(100dvh-32px)] overflow-hidden rounded-3xl shadow-2xl flex flex-col"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
          >
            {/* Modal Header */}
            <div
              className="flex justify-between items-center p-6 border-b"
              style={{ borderColor: border }}
            >
              <div>
                <h2 className="text-xl font-bold" style={{ color: text }}>
                  🚀 Changelog & Roadmap
                </h2>
                <p className="text-xs mt-1" style={{ color: sub }}>
                  Aktual: {RELEASES[0]?.version} - Terakhir diupdate{" "}
                  {RELEASES[0]?.date}
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                aria-label="Tutup popup rilis"
                className="ui-motion-button ui-focus-ring p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X size={20} style={{ color: sub }} />
              </button>
            </div>

            {/* Modal Body */}
            <div
              className="p-6 overflow-y-auto"
              style={{ backgroundColor: bg }}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Release History */}
                <div>
                  <h3
                    className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2"
                    style={{ color: sub }}
                  >
                    🕐 Release History
                  </h3>
                  {RELEASES.map((rel, ri) => (
                    <div
                      key={ri}
                      className="ui-hover-delight rounded-2xl p-5 mb-4 border shadow-sm"
                      style={{ backgroundColor: cardBg, borderColor: border }}
                    >
                      <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-3">
                          <span
                            className="text-lg font-bold"
                            style={{ color: text }}
                          >
                            {rel.version}
                          </span>
                          <span
                            className="text-xs font-bold px-2.5 py-1 rounded-md"
                            style={{
                              backgroundColor:
                                rel.status === "latest"
                                  ? "var(--color-success-soft)"
                                  : "var(--color-primary-soft)",
                              color:
                                rel.status === "latest"
                                  ? "var(--color-success)"
                                  : "var(--color-primary)",
                            }}
                          >
                            {rel.status === "latest" ? "LATEST" : "STABLE"}
                          </span>
                        </div>
                        <span
                          className="text-xs font-medium"
                          style={{ color: sub }}
                        >
                          {rel.date}
                        </span>
                      </div>
                      <div className="flex flex-col gap-3">
                        {rel.changes && rel.changes.length > 0 ? (
                          rel.changes.map((c, ci) => {
                            try {
                              const cfg = typeConfig[c.type] || typeConfig.fix;
                              const expandKey = `${ri}-${ci}`;
                              const isExpanded = expandedChanges.has(expandKey);
                              return (
                                <div
                                  key={ci}
                                  className="flex gap-3 items-start"
                                >
                                  <span
                                    className="text-[10px] font-bold px-2 py-0.5 rounded uppercase mt-0.5 shrink-0"
                                    style={{
                                      backgroundColor: cfg.bg,
                                      color: cfg.color,
                                    }}
                                  >
                                    {cfg.label}
                                  </span>
                                  <div className="flex-1">
                                    <span
                                      className="text-sm leading-relaxed block"
                                      style={{
                                        color: isDarkMode
                                          ? "var(--color-text-muted)"
                                          : "var(--color-border-strong)",
                                      }}
                                    >
                                      {c.text}
                                    </span>
                                    {c.dev && (
                                      <>
                                        <button
                                          onClick={() => {
                                            setExpandedChanges((prev) => {
                                              const next = new Set(prev);
                                              if (next.has(expandKey))
                                                next.delete(expandKey);
                                              else next.add(expandKey);
                                              return next;
                                            });
                                          }}
                                          className="text-[11px] font-semibold mt-1 hover:underline"
                                          style={{
                                            color: "var(--color-primary)",
                                            background: "none",
                                            border: "none",
                                            padding: 0,
                                            cursor: "pointer",
                                          }}
                                        >
                                          {isExpanded
                                            ? "▼ Sembunyikan detail teknis"
                                            : "▶ Detail teknis (developer)"}
                                        </button>
                                        {isExpanded && (
                                          <div
                                            className="text-xs mt-2 p-3 rounded-lg"
                                            style={{
                                              backgroundColor: isDarkMode
                                                ? "var(--color-surface-elevated)"
                                                : "var(--color-bg)",
                                              color: isDarkMode
                                                ? "#AEAEB2"
                                                : "#48484A",
                                              fontFamily:
                                                "ui-monospace, SFMono-Regular, Menlo, monospace",
                                              lineHeight: 1.6,
                                            }}
                                          >
                                            {c.dev}
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            } catch (err) {
                              console.error(
                                `[Dashboard] Error rendering change at index ${ci}:`,
                                err,
                              );
                              return (
                                <div key={ci} style={{ color: "red" }}>
                                  Error rendering change
                                </div>
                              );
                            }
                          })
                        ) : (
                          <div style={{ color: "orange" }}>
                            No changes recorded
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Upcoming */}
                <div>
                  <h3
                    className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2"
                    style={{ color: sub }}
                  >
                    🌟 Upcoming Features
                  </h3>
                  {upcoming.map((item, i) => {
                    const cfg = priorityConfig[item.priority];
                    return (
                      <div
                        key={i}
                        className="ui-motion-card rounded-2xl p-5 mb-3 border flex gap-4 items-start shadow-sm transition-transform hover:-translate-y-0.5"
                        style={{ backgroundColor: cardBg, borderColor: border }}
                      >
                        <div
                          className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0"
                          style={{
                            backgroundColor: cfg.color,
                            boxShadow: `0 0 8px ${cfg.color}80`,
                          }}
                        />
                        <div className="flex-1">
                          <div className="flex justify-between items-center mb-1.5">
                            <span
                              className="font-semibold"
                              style={{ color: text }}
                            >
                              {item.title}
                            </span>
                            <span
                              className="text-[10px] font-bold px-2 py-0.5 rounded uppercase"
                              style={{
                                backgroundColor: cfg.bg,
                                color: cfg.color,
                              }}
                            >
                              {cfg.label}
                            </span>
                          </div>
                          <p
                            className="text-xs leading-relaxed"
                            style={{ color: sub }}
                          >
                            {item.desc}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              className="p-4 border-t flex justify-end"
              style={{ borderColor: border, backgroundColor: cardBg }}
            >
              <button
                onClick={() => setShowModal(false)}
                className="ui-motion-button ui-focus-ring px-6 py-2 rounded-xl bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>,
          document.body,
        )}
      {/* Developer Notes Modal */}
      {showDevNotes && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px] transition-opacity">
          <div
            className="ui-motion-modal ui-modal-shell w-full max-w-md overflow-hidden rounded-3xl shadow-2xl flex flex-col"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
          >
            <div
              className="flex justify-between items-center p-6 border-b"
              style={{ borderColor: border }}
            >
              <div className="flex items-center gap-3 text-blue-500">
                <Info size={20} />
                <h2 className="text-lg font-bold">Catatan Developer</h2>
              </div>
              <button
                onClick={() => setShowDevNotes(false)}
                aria-label="Tutup catatan developer"
                className="ui-motion-button ui-focus-ring p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X size={20} style={{ color: sub }} />
              </button>
            </div>
            <div className="p-8">
              <p
                className="text-sm leading-relaxed mb-6"
                style={{ color: sub }}
              >
                Mungkin ada beberapa fitur yang belum work atau "ganjel" dalam
                penggunaannya, bisa dilaporkan via
                <span className="font-bold text-blue-500 mx-1">
                  Bug / Saran Fitur
                </span>
                di sidebar agar segera diperbaiki oleh tim pengembang.
              </p>
              <div className="p-4 rounded-2xl bg-blue-50 text-xs font-medium text-blue-600 flex gap-3 items-start border border-blue-100">
                <Activity size={16} className="mt-0.5 shrink-0" />
                <span>
                  Ekspektasi Performa: Latency antar pulau (Singapore) ~500ms -
                  1s (Normal).
                </span>
              </div>
            </div>
            <div
              className="p-4 border-t flex justify-center"
              style={{ borderColor: border, backgroundColor: bg }}
            >
              <button
                onClick={() => setShowDevNotes(false)}
                className="ui-motion-button ui-focus-ring w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-all"
              >
                Tutup Catatan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
