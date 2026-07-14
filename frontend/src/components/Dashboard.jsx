import React, { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import Icons from "./common/Icon";
import api, { insightsAPI, loansAPI, purchaseOrdersAPI } from "../services/api";
import { normalizeIndonesianPhone } from "../utils/waMessage";
import { useDashboardStats, useWeeklySummary } from "../hooks/useMasterData";
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
  ChevronLeft: ChevronLeftIcon,
  ChevronRight: ChevronRightIcon,
  ClipboardList: ClipboardListIcon,
} = Icons;

const RELEASES = [
  {
    version: "v1.64.0-stable",
    date: "14 Juli 2026",
    status: "latest",
    changes: [
      {
        type: "feature",
        text: "Buku Besar 2.0 + menu Karyawan aktif (khusus Direktur) — pembukuan Excel pindah ke aplikasi. (1) 1.218 mutasi rekening BCA Jan–Juni 2026 sudah diimpor; 782 terkategori otomatis (belajar dari catatan lamamu + aturan pintar), sisanya tinggal dipilih kategorinya di Jurnal (ada filter 'Perlu review' + centang banyak baris sekaligus). (2) Tab Laporan Bulanan: laba kotor otomatis dialokasikan ke amplop (GAJI/MODAL/BENSIN/OPERASIONAL/LISTRIK/DARURAT) sesuai persen target, dikurangi pengeluaran aktual, sisa nyambung berantai ke bulan berikutnya — persis metode Excel, terpisah PPN vs Non-PPN (dus lipat), plus pembanding laba versi sistem. (3) Tab Hutang Piutang di luar transaksi per orang dengan saldo berjalan (36 catatan terimpor). (4) Menu Karyawan: 8 karyawan + 464 riwayat gaji terimpor, bisa catat gaji harian.",
        dev: "backend/routes/ledger.js: kolom tax_scope/source/bank_ref(unique)/needs_review/auto_cat; tabel ledger_budget_targets, salary_payments, personal_loans; employees lama ditambal ALTER (role/daily_wage/active) + fix sequence. Endpoint /import (dedup bank_ref + autoCategorize rules), /bulk-category, /monthly-report (rantai carry-over per amplop, scope ppn/non_ppn, pembanding recompute nota via hppSqlForSalesItem), CRUD targets/employees/salaries/loans. Backfill: pdfplumber parse 6 e-statement (1.218 mutasi), label learning dari Excel L-S (402 label), LABA rows Excel + synthetic engine Apr–Jun. Frontend: LedgerPage 4 tab + EmployeesPage baru + route /employees + sidebar Karyawan aktif.",
      },
    ],
  },
  {
    version: "v1.63.2-stable",
    date: "14 Juli 2026",
    status: "stable",
    changes: [
      {
        type: "improvement",
        text: "Set harga jauh lebih cepat di tab Produk & Harga: (1) di bawah Harga Final ada kotak '%' — ketik target margin (mis. 5), tekan Enter, harga langsung dihitung & dibulatkan rapi (…900). (2) 3 tombol cepat: ↧ batas untung (paling murah tapi masih untung), = harga rekomendasi, ↥ margin sehat ~18%. (3) Mengetik harga/stok kini lancar tanpa nge-lag — sebelumnya tiap ketik berat & bikin input serasa 'gabisa diedit'.",
        dev: "Backend /listing-update: recompute matched HANYA saat hpp_override berubah, pakai loadOneProduct(id) (bukan loadProducts) → ringan. Frontend autosave harga/stok tak setRows (no re-render tabel). applyMargin(pct)=HPP/(1−fee−margin) + psychoRound; applyBand(bawah=harga_floor/tengah=recommended/atas=18%).",
      },
    ],
  },
  {
    version: "v1.63.1-stable",
    date: "13 Juli 2026",
    status: "stable",
    changes: [
      {
        type: "feature",
        text: "Tombol 'Apply semua saran' di tab Produk & Harga — sekali klik memetakan semua produk yang punya saran sekaligus (tidak perlu klik satu-satu untuk ratusan produk), lengkap dengan harga otomatis. Yang kurang yakin dilewati. Tetap ditandai 'auto — cek' supaya bisa kamu koreksi.",
        dev: "POST /stores/:id/auto-apply (min_score 0.3): fuzzy top match utk semua listing unmatched → set matched_auto + buildMatched (market-anchored) → recommended/final_price. Frontend tombol handleAutoApply lalu reload store.",
      },
    ],
  },
  {
    version: "v1.63.0-stable",
    date: "13 Juli 2026",
    status: "stable",
    changes: [
      {
        type: "feature",
        text: "Harga jual sekarang berbasis PASAR + riset penarikan: sistem menambang harga jual aktual dari semua penarikan Shopee & TikTok (April–Juli) sebagai jangkar 'harga yang terbukti laku', lalu menyarankan harga yang kompetitif TAPI tetap untung. Untung minimal diturunkan jadi ~3rb (operasional) supaya harga bisa bersaing (bukan margin gemuk). Bundle boleh untung lebih tebal (ada voucher). Tiap saran ditandai sumbernya: 'harga pasar' (kompetitif, sudah untung), 'batas untung' (dinaikkan karena rugi), atau 'CEK (mungkin ecer)' untuk yang harganya jauh di bawah modal (biasanya varian ecer/salah match — jangan langsung dipakai). Semua toko sudah diisi otomatis.",
        dev: "Backend recommendMarket(anchor, bundleQty): anchor = market_price (median harga jual historis per SKU) atau current_price. anchor≥floor→'pasar'; anchor≥bep×0.6→'floor' (target laba FLOOR 3rb, bundle 12%); else 'cek' (pertahankan anchor). Kolom market_price/price_source. Script mining Order.all[18] + Semua pesanan (SubtotalAfterDisc/qty) → 80 SKU. Excel per-toko diregenerate.",
      },
    ],
  },
  {
    version: "v1.62.1-stable",
    date: "13 Juli 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Perbaikan tab Produk & Harga: (1) tombol 'Apply' saran produk sekarang berfungsi (sebelumnya diam saja). (2) Download template dari toko tersimpan kini BENAR mengisi harga & stok — termasuk TikTok yang templatenya banyak file (tiap file terunduh terisi). (3) Urutan sidebar dibetulkan: Dashboard paling atas, lalu Surat Pesanan, Faktur, Nota, Inventory, Customer, Distributor, Daftar Harga, Toko Online, (Buku Besar/Finance/Pajak/Karyawan), Pengaturan paling bawah.",
        dev: "doMap(row,productId,bundle) — hapus dependency pada mapRow supaya Apply inline jalan. Download match-by-key: downloadFilledByKey parse template → matchKeyForRow → isi excelRow (baris DB tak punya excelRow). Tabel marketplace_store_files simpan SEMUA file/toko + GET /stores/:id/templates. templatesRef unduh tiap file.",
      },
    ],
  },
  {
    version: "v1.62.0-stable",
    date: "13 Juli 2026",
    status: "stable",
    changes: [
      {
        type: "feature",
        text: "Tab Produk & Harga jauh lebih pintar & hemat klik: (1) HPP tiap produk kini bisa dikoreksi manual langsung di kolomnya (buat kasus HPP batch lama vs harga kulak baru) — laba & rekomendasi ikut berubah, tanpa merusak data inventory. (2) Semua editan (harga, stok, HPP) OTOMATIS tersimpan — tak perlu pencet tombol lagi. (3) Produk yang belum dipetakan menampilkan saran + tombol Apply satu klik. (4) Barang ecer/repack (mis. 50 sachet dari box 150) bisa dipetakan dengan HPP pecahan yang benar. (5) Toko yang sudah tersimpan (Shopee) bisa langsung Download template tanpa upload ulang. Toko Semesta, Zi Shop, Nabila, Gizi sudah masuk.",
        dev: "Backend: kolom hpp_override/final_stock/template_b64, bundle_qty→NUMERIC (ecer pecahan, HPP di-fold ke total agar lolos clamp qty≥1). Endpoint /listing-update (autosave+recompute), /stores/:id/template (download dari DB). buildMatched(hppOverride) + hpp_source. Frontend: autosave debounce 600ms, HPP editable per baris, inline suggestion Apply, MapModal mode ecer (isi→jual=bundle pecahan), base64→ArrayBuffer utk download. Sidebar: Surat Pesanan dipindah paling atas (permintaan Ayah), urut ulang by workflow.",
      },
    ],
  },
  {
    version: "v1.61.1-stable",
    date: "13 Juli 2026",
    status: "stable",
    changes: [
      {
        type: "improvement",
        text: "Tab Produk & Harga makin enak dipakai: (1) saat kamu ubah 'Harga final', estimasi laba & margin langsung berubah live tanpa refresh; (2) setelah 'Petakan' produk, barisnya update di tempat — tidak lagi reload penuh yang bikin buyar fokus; (3) pop-up pemetaan sekarang benar-benar di tengah layar; (4) deteksi bundle lebih pintar untuk '2 Pouch' dll (mis. HOTTO 2 Pouch dihitung ×2, tidak lagi disamakan 1 pouch).",
        dev: "Frontend: liveProfit(price) = price×(1−fee)−hpp_bundle di render (fee_rate & hpp_bundle dari matched). doMap patch 1 baris pakai matched dari response /sku-map (bukan reAnalyze). MapModal dibungkus createPortal(document.body) → fixed relatif viewport (fix sama spt paymentModal). detectBundleQty(name,variation) + pola POUCH, variasi diprioritaskan; SACHET sengaja bukan multiplier. Backend /sku-map balikin objek matched. Semesta re-import sku_map-aware (mapping manual tidak ketimpa).",
      },
    ],
  },
  {
    version: "v1.61.0-stable",
    date: "13 Juli 2026",
    status: "stable",
    changes: [
      {
        type: "feature",
        text: "Tab 'Produk & Harga' jadi per-Toko: sekarang ada daftar toko (mis. Semesta · Shopee / TikTok) yang tersimpan di database — buka lagi tanpa upload ulang. Saat upload template, sistem otomatis menebak produk HABIL yang cocok (ditandai ungu 'auto — cek') lengkap dengan HPP, stok, dan harga rekomendasi, jadi tidak perlu petakan ratusan produk satu-satu. Tinggal koreksi yang salah, harga bisa disimpan ke Daftar Harga HABIL, lalu download template terisi untuk di-upload balik ke marketplace. Menambah toko baru cukup upload file-nya.",
        dev: "Backend: tabel marketplace_stores + marketplace_listings (katalog snapshot per toko), endpoint /stores & /stores/:id/listings. /analyze upsert toko + katalog + auto-match (fuzzy Jaccard: auto bila skor≥0.6, atau ≥0.4 & unggul ≥0.15 dari kandidat ke-2). buildMatched guard HPP=0 → tak kasih rekomendasi ngawur, flag 'lengkapi HPP'. save-prices tulis final_price ke katalog + price_list_entries. Frontend: MarketplaceProductTab v2 (store selector, badge auto, load dari DB). Toko Semesta (Shopee 207 + TikTok 87) sudah diimpor.",
      },
    ],
  },
  {
    version: "v1.60.0-stable",
    date: "13 Juli 2026",
    status: "stable",
    changes: [
      {
        type: "feature",
        text: "Toko Online punya tab baru 'Produk & Harga'. Upload template edit-massal dari TikTok Seller Center atau Shopee, lalu HABIL otomatis cocokkan tiap produk ke stok & HPP terkini, dan menyarankan harga jual per platform (sudah hitung fee marketplace + margin aman, pembulatan rapi ...900). Sekali sebuah produk dipetakan, toko lain dengan kode yang sama ikut otomatis. Tinggal download template terisi → upload balik ke marketplace. Harga bisa langsung disimpan ke Daftar Harga HABIL, dan stok upload diisi dari inventory (stok opname tidak terganggu).",
        dev: "Client-side: frontend/src/utils/marketplaceTemplate.js parse+fill xlsx via SheetJS di browser (template TikTok 2.7MB tak di-upload; ensureFullRange perbaiki !ref TikTok yg terpotong A1:AL5). Backend: routes/marketplace.js (/analyze, /sku-map CRUD, /save-prices) + tabel marketplace_sku_map (platform,match_key→product_id,bundle_qty). Rekomendasi pakai utils/pricingEngine.recommendPrice + marketplace_fee_profiles, floor laba 5rb. HPP incl-PPN dari batch FEFO. Match by seller_sku→fallback nama+varian; unmatched dapat saran fuzzy (Jaccard token).",
      },
    ],
  },
  {
    version: "v1.59.1-stable",
    date: "12 Juli 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Lanjutan perbaikan HPP: saat mengedit nota, batch & HPP produk kini dikunci ke kondisi saat penjualan — tidak lagi 'mental' pindah ke batch/harga terbaru tiap kali disimpan. Kalau memang mau refresh HPP, pakai tombol 'Perbarui HPP dari batch terkini'.",
        dev: "Update handler: tangkap snapshot lama sebelum DELETE items, lalu setelah re-insert kunci ulang (unit_hpp_tax_type/ppn_rate/batch snapshot) utk item yg tidak di-reprice (match produk+unit+unit_hpp). Recompute gross_profit dgn snapshot final. Item baru/di-reprice tetap pakai snapshot fresh.",
      },
    ],
  },
  {
    version: "v1.59.0-stable",
    date: "12 Juli 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Bug penting HPP: saat mengedit & menyimpan nota, HPP produk tertentu bisa 'mental' naik ~11% tiap kali disimpan (mis. Dianeral 33.407 jadi 37.082) sehingga margin tampil rugi palsu. Sekarang HPP nota terkunci benar dan tidak menggelembung lagi saat diedit.",
        dev: "Akar: resolveItemHppTaxType(item,batch) pakai batch.tax_type||item → saat update, backend re-FEFO batch faktur dan meng-override tag 'nota' item jadi 'faktur'; unit_hpp yang sudah inc-PPN lalu di-gross-up ×1.11 lagi (dobel). Fix: hormati tag item 'nota' dulu (item.unit_hpp_tax_type==='nota' ? 'nota' : batch||item). Item 'faktur' tak berubah. Catatan: batch pada item no-snapshot masih di-FEFO ulang saat edit (belum di-lock ke batch saat jual) — dampak ternetralkan utk item 'nota' karena HPP dipakai apa-adanya.",
      },
    ],
  },
  {
    version: "v1.58.0-stable",
    date: "10 Juli 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Dashboard sekarang ikut bulan yang dipilih di kalender Aktivitas Nota. Geser ke bulan lain (mis. Juni) → Total Penjualan, Laba Kotor, Margin per Channel, Top Kategori, Top 5 Customer, dan grafik Pergerakan Stok semuanya menampilkan bulan itu. Kartu Surat Pesanan Aktif & Stok Low tetap kondisi terkini.",
        dev: "dashboard.js /stats ?month=YYYY-MM (regex-validated → literal SQL aman, no injection). Query bulanan pakai monthStart/prevMonthStart/monthEnd; state-terkini (PO/stok/customer) tetap. useDashboardStats(month): queryKey per-bulan + keepPreviousData (no kedip). Label KPI/kartu dinamis (monthScopeShort/Long). buildStockMovementSeries pakai bulan terpilih (bukan 30d rolling; bulan berjalan dipotong sampai hari ini).",
      },
      {
        type: "fix",
        text: "Tombol 'Salin reminder' & 'Salin pesan WA' tidak lagi salah menampilkan 'Gagal menyalin' padahal teksnya sudah tersalin — notifikasi hijau muncul saat berhasil.",
        dev: "copyTextToClipboard return boolean (dulu undefined → pemanggil kira gagal). SalesOrderList/LoanList/CustomerList cek return; fallback execCommand aman saat izin clipboard ditolak.",
      },
      {
        type: "fix",
        text: "Popup 'Catat Pembayaran / Tandai Lunas' di Faktur Pembelian sekarang selalu di tengah layar (tidak lagi menggantung ke atas & perlu di-scroll). Tombol Reset filter dibuat lebih kontras/jelas.",
        dev: "paymentModal dibungkus renderPortal(document.body) → lepas dari ancestor ber-transform. Reset btn: color muted → text penuh + bg surface-elevated.",
      },
    ],
  },
  {
    version: "v1.57.0-stable",
    date: "5 Juli 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Halaman PAJAK baru (khusus Direktur + akun Konsultan Pajak): rekap PPN per bulan — PPN keluaran vs pajak masukan, perkiraan kurang bayar, dan omzet barang sumber-nota (yang PPN-nya jadi beban penuh). Konsultan bisa menandai nota mana yang masuk/dikecualikan dari PPN keluaran — setiap penandaan tercatat siapa & kapan. Ada export CSV buat bahan lapor.",
        dev: "routes/tax.js (roleGuard direktur+pajak): /summary /notas PATCH /notas/:id/ppn /export. 3 kolom baru sales_orders (ppn_excluded/marked_by/marked_at) — terisolasi, tidak dibaca jalur nota/stok/faktur. Role 'pajak': sidebar 1 menu, redirect paksa /tax, ledger tetap 403.",
      },
    ],
  },
  {
    version: "v1.56.5-stable",
    date: "4 Juli 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Rapi-rapi tampilan HP tahap 2: tab Penjualan|Pinjaman di tengah, Trash pindah kanan, banner draft 1 baris, 'Patokan untung' sekarang terbaca (dikasih latar), tooltip tidak lagi nutupin judul, tombol Inventory jadi 2 kolom rapi, kartu Daftar Harga lebih padat, form nota tidak ada lagi kolom yang saling tabrak, dan padding antar blok konsisten di semua halaman.",
        dev: "index.css: .ui-page/.ui-toolbar mobile override + @media(hover:none) .ui-tooltip off. SalesOrderList: tabbar center, toolbar space-between, draft banner compact, legend surface-bg, grid Tanggal/Metode & Ongkir stack. LoanList chip+badge kanan. InventoryDashboard grid 2 kol. PriceListPage hint hidden + card 10px + label 64px.",
      },
    ],
  },
  {
    version: "v1.56.4-stable",
    date: "4 Juli 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Cetak A4 Daftar Harga sekarang ada pilihan format: 🏪 Tanpa HPP (untuk customer) atau 🔒 Dengan HPP (internal — ada kolom HPP, header merah, dan watermark peringatan supaya tidak tersebar ke customer).",
        dev: "generatePriceListPDF +includeHpp (kolom HPP splice, head merah, watermark, filename -INTERNAL-HPP). PriceListPage: popup showPrintChoice, printable +hpp lastHppFor.",
      },
    ],
  },
  {
    version: "v1.56.3-stable",
    date: "4 Juli 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Pembulatan harga di form nota sekarang 3 arah: ⬇ ke bawah (76.123 → 76.000), ½ ke setengah (→ 76.500), ⬆ ke atas (→ 77.000). Plus persen markup custom dari HPP kini punya tombol − / + (step 1%) biar gampang di HP tanpa ngetik.",
        dev: "SalesOrderList: roundDownPrice/roundHalfPrice/roundUpPrice (step ribuan ≥10rb, ratusan <10rb; half=step/2 ceil), dedup opsi; stepper −/+ saveCustomMarkup ±1.",
      },
    ],
  },
  {
    version: "v1.56.2-stable",
    date: "4 Juli 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Form nota di iPad/tablet (768–1023px) ikut diperbaiki — kolom Nama Produk sempat kegencet karena form tampil berdampingan dengan preview. Tabel transaksi Toko Online kini bisa digeser horizontal di HP (tidak kegencet 8 kolom).",
        dev: "SalesOrderList: stackedItems = isMobile || viewportW<1024 (resize listener). OnlineStoreDashboard: wrapper overflowX auto + table minWidth 760px.",
      },
    ],
  },
  {
    version: "v1.56.1-stable",
    date: "4 Juli 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Optimasi tampilan HP tahap 1 (semua device Android/iOS/iPad): layar tidak lagi zoom sendiri saat mengetik di input, tap tombol lebih responsif, scroll di dalam popup tidak menembus halaman belakang. Form item di Pinjaman/Faktur/Surat Pesanan/tier Inventory dirapikan untuk layar kecil. Nomor nota di pesan WA (draft form) kini sesuai nomor asli.",
        dev: "index.css: input ≥16px @≤767px (anti iOS auto-zoom), touch-action manipulation, overscroll-behavior contain. LoanList item card+label, InvoiceModal +isMobile grid 2x2, PO item/PIC grid, Inventory tier wrap. currentWaMessage: preview nomor +YYMM.",
      },
    ],
  },
  {
    version: "v1.56.0-stable",
    date: "4 Juli 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Rekomendasi harga dari HPP di form nota: tiap produk ber-HPP punya chip +5% / +10% / +15% (klik → harga jual langsung terisi) + input persen custom yang diingat sistem. Plus tombol '⬆ Bulatkan' — harga 75.632 sekali klik jadi 76.000 (di bawah 10rb dibulatkan ke ratusan).",
        dev: "SalesOrderList: roundUpPrice (≥10rb ceil ribuan, <10rb ceil ratusan), customMarkupPct persist localStorage habil_markup_custom, chips priceFor(p)=round(hppIncFor×(1+p/100)).",
      },
    ],
  },
  {
    version: "v1.55.1-stable",
    date: "4 Juli 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Form Buat Nota di HP diperbaiki: kolom Nama Produk yang tadinya kegencet sampai tidak bisa dipakai sekarang tampil penuh — tiap produk jadi kartu sendiri (Nama full-width, lalu Qty/Unit/HPP/Harga rapi 2 kolom). Pilih batch/ED & rekomendasi harga customer tetap jalan normal di HP.",
        dev: "SalesOrderList item row: grid fixed 340px → isMobile stacked card (elemen input dibuat sekali, disusun ulang). Header kolom desktop-only.",
      },
    ],
  },
  {
    version: "v1.55.0-stable",
    date: "2 Juli 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Daftar Harga: deteksi JUAL RUGI otomatis — produk yang harga jualnya (bersih setelah fee marketplace) di bawah/sama dengan HPP pembelian terakhir dapat badge merah '⚠ RUGI' + pill filter '⚠ N jual rugi' di header. HPP kini sadar PPN per-batch (11%/12%). Layout halaman juga dirapatkan.",
        dev: "priceList GET +lb.ppn_rate; PriceListPage lossChannelsFor (net = price×(1−fee) ≤ HPP), filter onlyLoss, border merah input, hint '⚠ rugi' di sel ikut-inventory. Density: header/toolbar/tabel/input compact.",
      },
      {
        type: "new",
        text: "Faktur Pembelian: alert '📈 HNA naik +X%' saat harga beli produk lebih mahal dari pembelian terakhir (tampil distributor & tanggal pembanding), plus strip 'Tempo Bayar' — faktur belum lunas dikelompokkan: lewat tempo / ≤7 hari / nanti, lengkap total & detail per faktur.",
        dev: "insights /baselines/purchase +last_hna/last_date/last_invoice/last_distributor; InvoiceList: alert rise ≥1% di bawah anomali-median; tempoBuckets useMemo + strip collapsible.",
      },
      {
        type: "new",
        text: "Saran Restock di Dashboard sekarang menampilkan DISTRIBUTOR TERMURAH per produk (harga terakhir per pcs, dibandingkan antar distributor setahun terakhir) + tombol 'Draft SP otomatis': satu klik membuat Surat Pesanan draft per distributor termurah, qty ikut kebiasaan order.",
        dev: "insights /restock +LATERAL cheapest (DISTINCT ON distributor, hna per base unit sadar pack_size, MIN) + n_distributors; Dashboard handleAutoSp → purchaseOrdersAPI.create per grup distributor (status draft, harga 0 sesuai aturan SP).",
      },
    ],
  },
  {
    version: "v1.54.1-stable",
    date: "2 Juli 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Tombol WA reminder di Nota Penjualan & Pinjaman sekarang MENYALIN teks pesan (tinggal paste di WhatsApp) — tidak lagi membuka halaman wa.me yang merusak emoji. Tombol juga muncul untuk SEMUA nota terlambat, termasuk yang belum punya No. HP customer.",
        dev: "SalesOrderList & LoanList: buildWaUrl+window.open → copyTextToClipboard + toast. Gating normalizeIndonesianPhone(phone) dihapus (salin tidak butuh nomor).",
      },
    ],
  },
  {
    version: "v1.54.0-stable",
    date: "2 Juli 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Fitur PEMINJAMAN PRODUK: tab baru 'Pinjaman' di halaman Nota Penjualan. Catat barang yang dipinjam customer (lengkap dengan batch & ED), stok langsung terpotong, dan bisa cetak Nota Pinjaman (PDF). Pilih batas pengembalian 7/14/30 hari atau custom.",
        dev: "Tabel loans/loan_items/loan_conversions + nomor dokumen HSB-PJM (counter terpisah, tidak nabrak HSB-NOTA). Stok out via inventory_mutations reference_type='loan'.",
      },
      {
        type: "new",
        text: "Barang pinjaman bisa DIKEMBALIKAN (masuk stok lagi — ke batch yang sama atau batch baru dengan No. Batch + ED berbeda) atau DIJADIKAN NOTA penjualan resmi sebagian/semuanya (harga pakai harga saat pinjam, stok tidak dipotong dua kali).",
        dev: "POST /loans/:id/return (mode same/new batch) & /convert (insert sales_orders+sales_items dari snapshot loan TANPA mutasi stok; sales_orders.source_loan_id link). Nota konversi dikunci dari edit (PUT diblok) — hapus nota = item balik berstatus dipinjam.",
      },
      {
        type: "new",
        text: "Pinjaman yang lewat batas pengembalian otomatis dapat badge merah 'TERLAMBAT X HARI', banner peringatan di Dashboard (klik → langsung ke tab Pinjaman), dan tombol WA Reminder ke customer.",
        dev: "Dashboard: banner overdue loans (klik navigate /sales state.loanTab). buildLoanReminderMessage di waMessage.js. PDF: generateNotaPDF type 'pinjaman' (judul NOTA PINJAMAN, batas pengembalian, tanpa PPN/bank).",
      },
    ],
  },
  {
    version: "v1.53.9-stable",
    date: "30 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Search Nota Penjualan sekarang juga bisa cari berdasarkan NAMA PRODUK di dalam nota (mis. ketik 'peptibren' untuk menemukan semua nota yang ada produk Peptibren). Lengkap: no nota, customer, produk, dan total nominal.",
        dev: "SalesOrderList filtered.matchesSearch +o.items.some(product_name includes q) + guard !q. Placeholder diperbarui.",
      },
    ],
  },
  {
    version: "v1.53.8-stable",
    date: "30 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Kolom pencarian Nota Penjualan sekarang juga bisa cari berdasarkan TOTAL nominal nota (mis. ketik '236250' untuk menemukan nota Rp 236.250) — selain nomor nota & nama customer.",
        dev: "SalesOrderList filtered: matchesSearch +cek total digits (qDigits>=3 includes String(round(total))). Placeholder diperbarui.",
      },
    ],
  },
  {
    version: "v1.53.7-stable",
    date: "30 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Rekomendasi 'Biasanya dibeli customer' tidak lagi memunculkan produk yang sama dua kali akibat beda penulisan nama (mis. Tropicana Slim Classic muncul versi lama & baru). Sekarang digabung jadi satu — mengurangi risiko salah pilih.",
        dev: "insights /customer/:id: item_history group by nama canonical (product_master via product_aliases), mirror weekly-summary. 7x+2x → 1 entri.",
      },
    ],
  },
  {
    version: "v1.53.6-stable",
    date: "29 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Faktur Pembelian dirapatkan: kartu ringkasan (HNA*Qty, PPN, dll) & rekap per distributor lebih kecil dan rapat, tombol Buat Faktur/Trash diperkecil — biar tidak makan tempat.",
        dev: "InvoiceList: KPI grid minmax 200→165, padding 1.25→0.85rem, icon 1.5→1.05rem; rekap padding/margin & grid minmax 280→230; tombol Buat Faktur/Trash 13px/9px radius.",
      },
    ],
  },
  {
    version: "v1.53.5-stable",
    date: "29 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Filter Nota Penjualan dirapikan biar muat satu baris (search & dropdown lebih ramping). Keterangan persen untung dipisah jadi baris info kecil di bawah filter (istilah 'Ambang aktif' diganti 'Patokan untung'). Inventory: jarak antar bagian dirapatkan biar tidak makan tempat.",
        dev: "SalesOrderList: lebar select/search dikecilkan; legend profit dipindah keluar toolbar + rename 'Patokan untung:'. InventoryDashboard: marginBottom section 1.5/1.25rem → 0.875rem + padding restock dikecilkan.",
      },
    ],
  },
  {
    version: "v1.53.4-stable",
    date: "29 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Penyeragaman teks: label tempo pembayaran jadi 'Jatuh Tempo Pembayaran' di PDF nota, preview, dan daftar nota. Subjudul halaman login jadi 'CV Habil Sejahtera Bersama' (bukan 'CV Habil').",
        dev: "generateNotaPDF 'Jatuh Tempo:'→'Jatuh Tempo Pembayaran:'; NotaPreview + SalesOrderList list idem. Login subtitle full PT name.",
      },
    ],
  },
  {
    version: "v1.53.3-stable",
    date: "29 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Nota: No. HP customer di PDF dirapikan (karakter sampah seperti '*'/',' dibersihkan, nama–HP–alamat lurus satu kolom). Tulisan 'JT' diganti 'Jatuh Tempo' di PDF & preview. Pesan WhatsApp nota kini ada baris 'Jatuh tempo pembayaran' di bawah Total.",
        dev: "generateNotaPDF: cleanPhone (regex buang non [0-9+()-spasi]), contactX=nameX (alignment), 'JT:'→'Jatuh Tempo:'. NotaPreview: idem + sanitasi phone/address. waMessage.buildNotaWaMessage +dueDate line; +buildDueReminderMessage.",
      },
      {
        type: "new",
        text: "Di daftar Nota Penjualan, nota yang belum bayar punya tombol '💬 WA reminder' untuk kirim pengingat jatuh tempo ke customer (otomatis berisi no nota, total, & tanggal jatuh tempo).",
        dev: "SalesOrderList: link WA reminder per row (buildDueReminderMessage + buildWaUrl, hanya jika ada phone). CustomerList radar: ikon 📡→✨ + badge 'AI based'.",
      },
    ],
  },
  {
    version: "v1.53.2-stable",
    date: "29 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Tampilan dirapikan biar gak makan tempat: kotak follow-up customer jadi strip ringkas yang bisa disembunyikan, toolbar & tombol di Nota Penjualan dan Inventory dikecilin, search bar di seluruh halaman lebih ramping.",
        dev: "Batch 1 UI density. CustomerList: radar follow-up → strip collapsible (state followUpOpen, baris tipis + max-h scroll). index.css: .ui-toolbar/.ui-action-button/.ui-search-box__input dikompakkan. SalesOrderList & InventoryDashboard: inputStyle (padding/font/radius) + tombol header diperkecil. Faktur (rekap/KPI) & Daftar Harga redesign menyusul.",
      },
    ],
  },
  {
    version: "v1.53.1-stable",
    date: "29 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Perbaikan penting CRM: 164 nota lama yang tidak ter-link ke customer (nama diketik manual) kini tersambung — riwayat order tiap customer & reminder 'lama tak order' jadi akurat (mis. CATUR LIMAS tadinya keliru '70 hari', padahal baru order 14 Jun). Ke depan nota otomatis nyambung ke customer.",
        dev: "Backfill sales_orders.customer_id by exact name match (164 baris). sales.js create+update: auto-resolve customer_id dari nama kalau match tepat 1. Sisa 4 null = nota terhapus + nama tak ada di master (legacy/test).",
      },
      {
        type: "new",
        text: "Kartu insight (Saran Restock & Customer Perlu Follow-up) digabung ke satu zona 'AI based' di atas Dashboard. Customer Perlu Follow-up kini juga menampilkan customer yang BELUM pernah order (punya HP) untuk di-approach, bukan cuma yang lama tak order.",
        dev: "Dashboard: 2 kartu insight dipindah ke dalam panel ringkasan mingguan (sub-card). /insights/dormant +tipe 'never' (customer 0 order final + punya phone, include_never toggle). Kartu type-aware (badge 'belum order' vs 'X hari'). CustomerList radar filter type!=never (never sudah di grid).",
      },
    ],
  },
  {
    version: "v1.53.0-stable",
    date: "29 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Pesan WhatsApp nota lebih lengkap: sapaan pakai nama customer + nomor nota + 'CV Habil Sejahtera Bersama', dan tiap item sekarang menampilkan No. Batch & Expired Date.",
        dev: "waMessage.buildNotaWaMessage: header pakai orderNumber + nama lengkap perusahaan; tiap item +baris 'Batch X · ED Y'. SalesOrderList.currentWaMessage enrich item dgn batch_no/ED dari batch terpilih + kirim orderNumber.",
      },
      {
        type: "new",
        text: "Saat buat nota, muncul rekomendasi harga berdasarkan kebiasaan customer itu (mis. 'CV Surya Sakti biasanya Rp78.000') beserta perbandingan harga umum, lengkap dengan tombol 'Pakai'. Sistem baca dari nota-nota sebelumnya per customer.",
        dev: "SalesOrderList: chip harga dari salesBaselines.price_mean (per produk+customer, 180 hari) vs product_master.sell_price; tombol apply ke unit_price. Data dari /insights/baselines/sales (price_mean sudah ada).",
      },
      {
        type: "new",
        text: "Dashboard dapat 2 kartu insight baru: 'Saran Restock' (produk hampir habis) dan 'Customer Lama Gak Order' (belum order >1 bulan) dengan tombol Chat WA langsung — label AI based.",
        dev: "Endpoint baru GET /insights/dormant (last order > min_days, default 30, 2-step CTE gap→median). Dashboard: fetch getRestock+getDormant, 2 kartu di bawah ringkasan mingguan. CustomerList radar pindah dari /churn ke /dormant(30); pesan WA guard median null + nama PT lengkap.",
      },
    ],
  },
  {
    version: "v1.52.8-stable",
    date: "27 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Nama, No. HP, dan alamat customer yang panjang di nota kini otomatis turun ke baris berikutnya — tidak lagi melar menarik ke kanan / keluar dari area nota (di preview live maupun PDF cetak).",
        dev: "NotaPreview: overflowWrap 'anywhere'+wordBreak pada nama/HP/alamat. generateNotaPDF: nama & HP kini di-splitTextToSize (maxTextW konsisten dgn alamat), addressY mengikuti baris tambahan.",
      },
    ],
  },
  {
    version: "v1.52.7-stable",
    date: "27 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Trash Nota kini menampilkan info lengkap seperti nota biasa: rincian produk (qty, satuan, HPP, harga, subtotal, margin), No. Batch & ED, status bayar (LUNAS + tanggal / BELUM BAYAR + jatuh tempo), tanggal nota, dan saluran. Jadi bisa dicek detailnya sebelum dipulihkan.",
        dev: "GET /sales/trash: tambah json_agg items + customer_phone (mirror list utama). SalesOrderList modal Trash dirombak: header (no/tanggal/channel/customer/total) + status bayar (paid_at/due_date pakai fmtDateDay + notaDaysDiff) + daftar item (hppIncFor/saleItemDisplayQty → subtotal & margin + batch/ED).",
      },
    ],
  },
  {
    version: "v1.52.6-stable",
    date: "27 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "PENTING: nota & faktur lama (mis. April–Mei) yang sebelumnya tidak muncul di daftar kini tampil semua. Datanya tidak pernah hilang — daftar dulu dibatasi 100 data terbaru sehingga yang lama terpotong. Sekarang seluruh nota/faktur dimuat.",
        dev: "GET /sales & /invoices: cap limit 500→5000. salesAPI.getAll & invoicesAPI.getAll kirim params limit:5000 (default backend dulu 100 → 63 nota terlama kepotong dari 163 aktif).",
      },
    ],
  },
  {
    version: "v1.52.5-stable",
    date: "26 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Faktur Pembelian yang barangnya sudah masuk stok kini tetap bisa diedit No. Batch & Expired Date-nya (sebelumnya gagal/ditolak). Qty & produk tetap dikunci demi riwayat stok — koreksi qty lewat Stok Opname.",
        dev: "PUT /invoices/:id: ganti guard invoiceItemsChanged (yg ikut bandingin batch/ED) → invoiceStockFieldsChanged (produk+qtyBase+unit saja). Tambah jalur shouldPatchItemMeta: update invoice_items.batch_number/expired_date + inventory_batches terkait (match source_ref+product_id+nilai lama) tanpa menyentuh qty/mutasi stok.",
      },
      {
        type: "new",
        text: "Tanggal LUNAS/bayar di Nota Penjualan & Faktur Pembelian sekarang menampilkan nama hari juga (mis. 'Jumat, 26 Jun 2026').",
        dev: "SalesOrderList paid_at pakai fmtDateDay; InvoiceList payment_date pakai formatLocalDate weekday:long.",
      },
    ],
  },
  {
    version: "v1.52.4-stable",
    date: "25 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Info jatuh tempo lebih jelas di Faktur Pembelian & Nota Penjualan: di bawah 'BELUM BAYAR' kini tampil tanggal jatuh tempo lengkap dengan nama hari (mis. 'Selasa, 01 Jul 2026') plus sisa harinya dieja penuh ('5 hari lagi', 'Terlambat 3 hari', 'Jatuh tempo hari ini') — tidak perlu buka Ubah lagi.",
        dev: "InvoiceList.getDueStatus: label 'Xh' → 'X hari' penuh + cabang diff===0 'hari ini' + selalu return (>7 hari juga). Render: tanggal+weekday (formatLocalDate weekday:long) di atas badge relatif. SalesOrderList: fmtDateDay helper (weekday), blok due dirombak → selalu tampil tanggal+hari lalu relatif.",
      },
    ],
  },
  {
    version: "v1.52.3-stable",
    date: "25 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Harga Offline di Daftar Harga sekarang SATU harga dengan Inventory — selalu sinkron dua arah. Ubah harga jual di Inventory → harga Offline ikut; ketik harga di kolom Offline → harga Inventory ikut. Sebelumnya Offline bisa 'nyangkut' di harga lama walau Inventory sudah diperbarui (mis. Entrakid Offline Rp66.000 padahal harusnya Rp70.000).",
        dev: "Offline tidak lagi pakai override price_list_entries. priceList GET: list_price offline = NULL (selalu ikut sell_price). PUT channel=offline → UPDATE product_master.sell_price (single source). 13 override offline lama dihapus. PriceListPage: saveChannel offline patch sell_price; stat/filter 'sudah di-set' berbasis sell_price. Shopee/Tokopedia tetap pakai override sendiri.",
      },
      {
        type: "fix",
        text: "Cetak A4 Daftar Harga kini punya kolom terpisah 'Isi/Karton' dan 'Harga/Karton' yang jelas.",
        dev: "generatePriceListPDF: kolom dipecah jadi No | Kode | Nama | Harga Eceran | Isi/Karton | Harga/Karton (dari pack_size & sell_price_pack).",
      },
    ],
  },
  {
    version: "v1.52.2-stable",
    date: "25 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Daftar harga & HPP banyak produk diperbarui dari data terbaru. Diperbaiki juga bug satuan: beberapa produk salah hitung 'pcs' jadi 1 karton (mis. 3 pcs dianggap 72 pcs, harga ikut harga karton) — sekarang pilih 'pcs' = 1 biji, 'karton' = sesuai isi. Nota lama tidak berubah.",
        dev: "DB prod: product_master hna(=HPP/1.11)/sell_price/pack_size/sell_price_pack di-update dari Excel (61 produk), inventory_batches.hna diisi utk 21 batch opname (HNA=0). Fix pack_unit: 49 produk pack_size>1 dgn pack_unit NULL/=base → set 'karton' (uom.isPackUnit hanya fire kalau unit===pack_unit; pack_unit='pcs' bikin base unit ke-treat sbg pack). sales_items snapshot tak disentuh.",
      },
      {
        type: "fix",
        text: "Saat memulihkan draft Nota, nomor batch yang sebelumnya sudah dipilih kini langsung muncul — tidak perlu klik manual lagi.",
        dev: "SalesOrderList.loadDraft: dulu setItemBatches([]) → batch picker (render saat batches.length>0) hilang & _selected_batch_id tak ter-render. Sekarang fetch getProductBatches per item + re-match batch terpilih (by id, fallback batch_no), mirror alur openEdit.",
      },
    ],
  },
  {
    version: "v1.52.1-stable",
    date: "19 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Di daftar Faktur Pembelian, status 'BELUM BAYAR' (atau 'SUDAH DIBAYAR') sekarang bisa diklik langsung untuk memilih tanggal bayar — tidak perlu buka form Ubah penuh. Sama seperti di Nota Penjualan.",
        dev: "Backend PATCH /invoices/:id/payment-status (set status+payment_date, tanpa sentuh item/stok, +audit log PAYMENT_STATUS). invoicesAPI.updatePaymentStatus. InvoiceList: badge status jadi tombol → paymentModal (date picker) + optimistic upsertInvoiceCache; tombol 'Tandai Belum Bayar' saat sudah lunas.",
      },
    ],
  },
  {
    version: "v1.52.0-stable",
    date: "19 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Nota Penjualan dapat 3 peningkatan: (1) badge '⚠ X Terlambat' & '🕒 X Jatuh Tempo' di atas daftar — klik untuk langsung menyaring nota yang perlu ditagih; (2) fitur Trash — nota yang dihapus tidak langsung hilang, bisa dipulihkan lewat tombol Trash (stok ikut dipotong ulang otomatis saat dipulihkan); (3) banner draft tersimpan dirapikan, tombol 'Hapus Draft' kini jelas terbaca.",
        dev: "SalesOrderList: badge overdue/dueSoon (notaDaysDiff diperkuat utk ISO date) + filterDue (overdue/soon) terintegrasi ke `filtered`. Trash: backend GET /sales/trash + PUT /sales/:id/restore (re-deduct stok via net outstanding 'nota-cancelled' in − 'nota-restored' out, guard stok kurang → tolak; mutasi restore pakai reference_type 'nota-restored' agar delete berikutnya tak dobel-reverse). salesAPI.getTrash/restore. Tombol Hapus Draft → danger-soft readable.",
      },
    ],
  },
  {
    version: "v1.51.4-stable",
    date: "19 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "perf",
        text: "Simpan nota & faktur terasa lebih instan: setelah klik simpan, baris baru/perubahan langsung muncul di daftar tanpa jeda menunggu data dimuat ulang. Angka final tetap disinkronkan otomatis dengan server di belakang layar, jadi tidak ada risiko salah tampil.",
        dev: "Optimistic cache: SalesOrderList & InvoiceList patch qk.salesList/qk.invoicesList via setQueryData dari response server (full row — nota POST/PUT return row; faktur POST data.invoice, PUT data). Upsert by id (create=prepend bila id baru, edit=merge). fetchOrders()/fetchInvoices() tetap dipanggil untuk rekonsiliasi (items json_agg & derived fields).",
      },
    ],
  },
  {
    version: "v1.51.3-stable",
    date: "19 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "polish",
        text: "Fitur saran otomatis dirapikan biar serasi dengan tampilan Dashboard: label 'Mini AI' di form nota diganti jadi '✨ Biasanya dibeli customer', dan saat data lagi disiapkan muncul kerangka loading (skeleton) yang halus — bukan tulisan polos atau muncul tiba-tiba. Berlaku di Saran Restock (Inventory), riwayat produk customer (Nota), dan radar customer lama tak order.",
        dev: "Hapus branding 'Mini AI' + badge dev 'non-blocking' dari UI. SalesOrderList customer-insight: skeleton chips saat loading. InventoryDashboard: +insightsLoading flag → Saran Restock skeleton. CustomerList: +churnLoading → panel skeleton churn radar. Komentar 'mini-AI' dinetralkan jadi 'insight rule-based'; docs (BRAIN/UPCOMING) ikut diselaraskan. Entri RELEASES/CHANGELOG historis tidak diubah.",
      },
    ],
  },
  {
    version: "v1.51.2-stable",
    date: "19 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "feat",
        text: "Sesi login sekarang bertahan 4 jam (sebelumnya 15 menit). Operator tidak lagi cepat ke-logout saat lagi menginput nota/faktur.",
        dev: "auth.js: default expiresIn 15m → 4h (override via env JWT_EXPIRE). Catatan: bila prod masih 15m, env JWT_EXPIRE di Vercel backend masih di-set 15m — perlu diubah/dihapus manual.",
      },
    ],
  },
  {
    version: "v1.51.1-stable",
    date: "18 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "PERBAIKAN DARURAT: setelah login, Dashboard tidak lagi jatuh ke layar 'Terjadi gangguan'. Penyebabnya menu Distributor memakai ikon yang belum terdaftar.",
        dev: "common/Icon: expose Truck icon wrapper so Sidebar Distributor menu no longer renders an undefined component (React error #130). Test harness TanStack Query diperbaiki dengan QueryClientProvider.",
      },
    ],
  },
  {
    version: "v1.51.0-stable",
    date: "18 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "PERBAIKAN: layar putih kosong setelah login (terjadi saat ada versi baru di-deploy sementara tab/cache browser masih versi lama). Sekarang aplikasi otomatis memuat ulang versi terbaru — tidak lagi blank. Kalau ada error lain, muncul layar 'Muat Ulang' yang jelas, bukan layar putih.",
        dev: "+common/ErrorBoundary (root, bungkus AppRoutes): ChunkLoadError → auto window.location.reload sekali (guard sessionStorage anti-loop, di-reset saat konten sukses mount); error render lain → fallback UI + tombol Muat Ulang. Root cause blank: stale chunk pasca redeploy (Dashboard render terbukti bersih via test dgn QueryClientProvider — bukan crash kode).",
      },
    ],
  },
  {
    version: "v1.50.0-stable",
    date: "18 Juni 2026",
    status: "latest",
    changes: [
      {
        type: "feat",
        text: "Pagination di semua halaman daftar: Nota Penjualan (default 20), Customer (20), Surat Pesanan (10), Daftar Harga (20) — plus Inventory & Faktur yang sudah ada. Ada pilihan jumlah baris per halaman + 'Semua', tombol halaman sebelumnya/berikutnya, dan info '1–20 dari N'. Daftar jadi ringan walau data banyak.",
        dev: "+common/Pagination.jsx reusable (select size + prev/next + ringkasan, pageSize -1 = Semua). Wire ke CustomerList/PurchaseOrderList/SalesOrderList/PriceListPage (paged slice + reset page on filter/sort). Daftar Harga: slice flat dulu baru group per kategori. Inventory/Faktur pagination existing dibiarkan.",
      },
    ],
  },
  {
    version: "v1.49.0-stable",
    date: "18 Juni 2026",
    status: "latest",
    changes: [
      {
        type: "feat",
        text: "Nota Penjualan lebih lengkap: (1) Tandai Lunas massal — centang beberapa nota lalu set tanggal pelunasan sekaligus. (2) Detail nota kini menampilkan nomor batch + tanggal ED tiap produk. (3) Label jatuh tempo diperjelas: 'Jatuh Tempo Pembayaran' / 'Jatuh tempo X hari lagi' / 'Terlambat bayar X hari'. (4) Nota PDF & preview: 'No. HP' dan 'Alamat:' tampil langsung nilainya tanpa label. (5) Tombol pulihkan draft disamakan gaya tombol utama.",
        dev: "SalesOrderList: +bulkPay modal (loop salesAPI.updatePaymentStatus paid+date utk selected non-paid, refetch+clear) +tombol bulk bar; expanded items +batch_no_snapshot/expired_date_snapshot; relabel JT. generateNotaPDF + NotaPreview: drop 'No. HP:'/'Alamat:' prefix. PrintSettings/draft buttons → btn-primary. Filter sudah/belum bayar + badge terlambat/JT sudah ada sebelumnya.",
      },
    ],
  },
  {
    version: "v1.48.0-stable",
    date: "18 Juni 2026",
    status: "latest",
    changes: [
      {
        type: "fix",
        text: "Inventory: jumlah baris per halaman default jadi 20 (dari 10) + ada opsi 'Semua' untuk tampilkan semua produk sekaligus. Tombol di Pengaturan profitabilitas: teks 'Simpan Ambang' diperpendek jadi 'Simpan'.",
        dev: "InventoryDashboard pageSize default 10→20; opsi value -1 = Semua (showAll → paged=filtered, totalPages=1, label hitung aman). PrintSettings tombol threshold 'Simpan Ambang'→'Simpan'. Pagination Nota/Customer/SP/Daftar Harga menyusul.",
      },
    ],
  },
  {
    version: "v1.47.0-stable",
    date: "18 Juni 2026",
    status: "latest",
    changes: [
      {
        type: "feat",
        text: "Menu baru: Master Distributor (ikon truk di sidebar, dekat Customer). Kelola daftar distributor di satu tempat — nama, kode singkat, nama & no HP sales (klik nomor langsung WhatsApp). Tambah, edit, hapus seperti halaman Customer. Datanya sama dengan yang dipakai di Faktur & Surat Pesanan.",
        dev: "+DistributorList.jsx (useDistributors + distributorsAPI.add/update/remove, refetch sesudah mutasi) + route /distributors + Sidebar entry (Truck icon). +distributorsAPI.update (PATCH oldName→newName + short_code/salesman_name/salesman_phone; rename lama hanya kirim nama → null-kan field). Cache dibagi dgn Faktur/SP.",
      },
    ],
  },
  {
    version: "v1.46.0-stable",
    date: "18 Juni 2026",
    status: "latest",
    changes: [
      {
        type: "perf",
        text: "Performa (fase 2 — selesai): Daftar Harga, Faktur, Nota Penjualan, dan Dashboard kini ikut load instan saat dikunjungi ulang (data di-cache & di-refresh diam-diam). Sekarang seluruh halaman utama terasa cepat berpindah-pindah. Data master (produk/customer/distributor) benar-benar diambil sekali lalu dibagi ke semua halaman.",
        dev: "Migrasi TanStack Query lengkap: PriceListPage (rows+feeProfiles, optimistic setQueryData + seed vals once via ref), InvoiceList (invoices/distributors + products/PO via useMemo transform; optimistic distributor/invoice rename via setQueryData), SalesOrderList (orders/customers/products via hook, products filter ONGKIR via useMemo), Dashboard (stats via useMemo dari useDashboardStats + weekly via useWeeklySummary; heatmap/daily-notas tetap param-driven). Pola: fetchX alias ke refetch; mount fetch dihapus. P1 COMPLETE (6/6 halaman + Customer).",
      },
    ],
  },
  {
    version: "v1.45.0-stable",
    date: "18 Juni 2026",
    status: "latest",
    changes: [
      {
        type: "perf",
        text: "Performa (fase 1): halaman Surat Pesanan & Inventory kini load instan saat dikunjungi ulang — data di-cache (TanStack Query) dan di-refresh diam-diam di belakang. Data master (produk, customer, distributor) cukup di-ambil sekali lalu dipakai bareng antar halaman, jadi makin berasa cepat. Halaman lain (Daftar Harga, Faktur, Nota, Dashboard) menyusul.",
        dev: "qk diperluas (sales/invoices/purchase-orders/distributors/inventory-alerts/price-list/fee-profiles/dll). useMasterData +useDistributors/useSalesOrders/useInvoices/usePurchaseOrders/useInventoryAlerts/usePriceList/useFeeProfiles/useWeeklySummary/useDashboardStats; fetchProductsList limit 2000. +dashboardAPI di api.js. MIGRASI: PurchaseOrderList & InventoryDashboard → hook (orders/products/distributors/alerts), refetch alias dipertahankan utk call-site mutasi; mount fetch dihapus (auto via hook). Faktur/Nota/DaftarHarga/Dashboard fase berikutnya.",
      },
    ],
  },
  {
    version: "v1.44.0-stable",
    date: "18 Juni 2026",
    status: "latest",
    changes: [
      {
        type: "fix",
        text: "HPP di nota sekarang DIBEKUKAN pada harga beli saat barang terjual — tidak lagi berubah-ubah sendiri saat nota dibuka di menu Edit. Laba historis jadi stabil & akurat. Kalau kamu MENGOREKSI harga beli (HPP) suatu produk di Inventory dan ingin nota tertentu ikut diperbarui, buka Edit nota lalu klik tombol '↻ Perbarui HPP dari batch terkini' (manual, kamu yang putuskan). Default: nota lama tidak berubah otomatis.",
        dev: "SalesOrderList: edit-load TIDAK lagi overwrite unit_hpp/unit_hpp_tax_type dari batch (hapus auto-refresh v1.23.1 yg bikin HPP labil + rawan saat koreksi HNA) — pakai snapshot tersimpan apa adanya, set metadata batch saja. +syncHppFromBatch() (opt-in, per item, by snapshot batch_id/no, skip legacy) + tombol '↻ Perbarui HPP dari batch terkini' (muncul saat editId). Pilih batch lain di dropdown tetap update HPP (intent). Kebijakan: snapshot beku + sinkron manual.",
      },
    ],
  },
  {
    version: "v1.43.0-stable",
    date: "17 Juni 2026",
    status: "latest",
    changes: [
      {
        type: "fix",
        text: "PPN sekarang FLEKSIBEL per faktur: default 11%, tapi tiap faktur bisa dipilih 11% atau 12% (mis. Nescafe yang dibeli dengan PPN 12%). Tiap stok 'ingat' PPN-nya sendiri — stok 11% tetap dihitung 11% di Inventory, HPP, dan laba; stok 12% tetap 12%. Tidak ada lagi yang dipukul rata jadi 12%. Plus: Alert Inventory 'Harus Dikeluarkan' kini menandai stok yang kadaluarsa dalam ≤4 bulan (sebelumnya 3 bulan), termasuk yang sudah lewat ED.",
        dev: "Per-batch/faktur PPN: +kolom inventory_batches.ppn_rate (DEF 0.11), invoices.ppn_rate (DEF 0.11), sales_items.unit_hpp_ppn_rate (NULL→fallback 0.11). Derivasi HPP fefo-hna + rupiah.hppForBatch pakai COALESCE(ppn_rate). Aggregates dashboard/reports/insights via tax.hppSqlForSalesItem (per-row rate, hapus param global $1). Nota POST/PUT snapshot ppn_rate batch → gross profit per-batch (tax.hppFromHnaByRate). Faktur form: selektor 11%/12% default 11% (BUKAN 12%), threaded ke calcItem/calcTotals/buildPayload + load/draft/PO. Prod: batch 110 (Nescafe) + invoice-187 di-set 0.12 manual via script idempotent; 106 batch lain tetap 0.11. ED alert window 90→120d incl expired ('harus dikeluarkan').",
      },
    ],
  },
  {
    version: "v1.42.0-stable",
    date: "17 Juni 2026",
    status: "latest",
    changes: [
      {
        type: "fix",
        text: "PERBAIKAN PENTING: HPP di Inventory sempat ikut jadi 12% untuk SEMUA stok gara-gara update PPN — padahal stok lama dibeli saat PPN 11%. Dikembalikan ke 11% (default historis). Tidak ada data yang rusak (hanya tampilan rate-nya). PPN 12% untuk pembelian baru akan ditangani per-faktur menyusul. Plus: halaman Customer kini load instan (cache) dan teks alamat/no HP di mode terang dibuat hitam biar kebaca.",
        dev: "Revert PPN_RATE 0.12→0.11 (tax.js + rupiah.js + generateNotaPDF) — derivasi HPP global balik 11%; tidak ada kolom stored yang berubah. CustomerList: migrasi ke useCustomers (TanStack) + refetch sesudah mutasi; warna phone/address light-mode border-strong→text. TODO proper: kolom ppn_rate per-batch/faktur (old 11% / new 12%).",
      },
    ],
  },
  {
    version: "v1.41.0-stable",
    date: "17 Juni 2026",
    status: "latest",
    changes: [
      {
        type: "perf",
        text: "Fondasi performa: dipasang sistem cache data (TanStack Query) + prefetch data master (produk & customer) saat idle setelah login — persiapan supaya halaman terasa makin instan. Faktur faktur baru (mis. Nescafe 12%) sudah masuk dengan benar.",
        dev: "Tambah @tanstack/react-query v5 + QueryClientProvider (index.js) + lib/queryClient (staleTime 60s, gcTime 10m, refetch on focus/reconnect). hooks/useMasterData (useProducts/useCustomers + fetch fns). App.js: prefetchQuery products+customers via requestIdleCallback saat token ada. Migrasi konsumer (Nota/Inventory/dll) ke useQuery + optimistic UI + keep-warm cold-start = tahap berikutnya.",
      },
    ],
  },
  {
    version: "v1.40.0-stable",
    date: "17 Juni 2026",
    status: "latest",
    changes: [
      {
        type: "feat",
        text: "PPN sistem diperbarui ke 12% (sesuai tarif pajak terbaru) di semua perhitungan HNA↔HPP, nota, dan faktur — satu sumber jadi konsisten. Faktur lama TIDAK terpengaruh (PPN-nya tersimpan per faktur). Plus: kalender Aktivitas Nota kini di tengah saat detail ditutup (tidak ada ruang kosong), dan Manajemen Tugas saat dibuka kolomnya melebar penuh.",
        dev: "PPN_RATE 0.11→0.12 di backend tax.js + frontend rupiah.js (single source). generateNotaPDF + InvoiceList (CSV header + label hint) pakai rate dinamis. ppn_masukan tetap per-faktur STORED → faktur lama aman; hanya derivasi HPP live yang pakai rate baru. Heatmap: justifyContent center saat !selectedDay. TasksKanban kolom flex-shrink-0 w-64 → flex-1 min-w-[240px].",
      },
    ],
  },
  {
    version: "v1.39.0-stable",
    date: "16 Juni 2026",
    status: "latest",
    changes: [
      {
        type: "feat",
        text: "Konsistensi data batch & nota: nama-nama lama di nota yang dulu tidak nyambung ke produk (mis. ENTRAMIX 555, DIANERAL, dll) sekarang otomatis dikenali (25 alias ditambah) sehingga batch-nya muncul konsisten. Perubahan nomor batch / tanggal kadaluarsa kini dicatat (riwayat batch) untuk audit.",
        dev: "DB: +25 product_aliases utk nama-nota orphan (resolusi by inventory). +tabel batch_audit_log (log perubahan batch_no/expired_date/hna di PUT /batches/:id, fire-and-forget) + GET /inventory/batches/:id/audit. Sisa orphan: OMELA 1 CTN (ambigu 39/74), MIKA NASI (no master), LAIN-LAIN (generik).",
      },
    ],
  },
  {
    version: "v1.38.0-stable",
    date: "16 Juni 2026",
    status: "latest",
    changes: [
      {
        type: "ui",
        text: "Aktivitas Nota Harian dipoles: tile kalender dibuat simetris (kotak, tidak kelebaran), saat dibuka langsung menampilkan detail tanggal HARI INI, keterangan warna ditambah (Sepi → Ramai, makin ungu = makin banyak nota), dan panah bulan-berikutnya kini tampil abu-abu + tidak bisa diklik saat sudah di bulan berjalan (tidak hilang lagi).",
        dev: "Dashboard heatmap: tile aspect-square + kolom kalender maxWidth 720, detail panel flex-fill (maxWidth 460, isi sisa ruang). Default selectedDay = hari ini via useRef once-effect (hanya bulan berjalan). Next-month arrow: color transparent → opacity 0.35 + cursor not-allowed (tetap terlihat). Legend + label Sepi/Ramai + title per shade.",
      },
    ],
  },
  {
    version: "v1.37.0-stable",
    date: "16 Juni 2026",
    status: "latest",
    changes: [
      {
        type: "fix",
        text: "Konsistensi batch di Nota: saat buat nota baru, daftar batch sekarang menampilkan SEMUA batch produk (termasuk stok 0/expired/tanpa nomor) — sama seperti saat edit nota — jadi batch + ED tetap bisa dipilih dan muncul di nota. Default tetap memilih batch yang ada stoknya dengan ED terdekat (FEFO).",
        dev: "SalesOrderList create-mode (prepareProductItem + handleItemChange): getAvailableBatches → getProductBatches (semua batch). +pickFefoBatch (utamakan in-stock non-expired ED terdekat, fallback batch pertama). Dropdown label batch_no null → '(tanpa no. batch)'. CATATAN: nama produk non-master (mis. 'ENTRAMIX 555') tetap tak resolve ke batch — itu isu data/alias, bukan filter.",
      },
    ],
  },
  {
    version: "v1.36.0-stable",
    date: "16 Juni 2026",
    status: "latest",
    changes: [
      {
        type: "feat",
        text: "Aktivitas Nota Harian dirombak: kalender dibuat lebih ringkas (tile lebih kecil) dan saat tanggal diklik, detail notanya muncul di sebelah kanan (bukan di bawah lagi). Tiap nota di detail bisa langsung diklik untuk membuka edit nota itu.",
        dev: "Dashboard heatmap: tile aspect-square → h-12/md:h-14; calendar + detail dibungkus flex (panel detail 340px di kanan, stack di mobile); nota row onClick navigate('/sales', {state:{editNotaNumber}}). SalesOrderList: useEffect baca location.state.editNotaNumber → openEdit(order match by order_number) setelah daftar termuat.",
      },
    ],
  },
  {
    version: "v1.35.0-stable",
    date: "16 Juni 2026",
    status: "latest",
    changes: [
      {
        type: "ui",
        text: "Rapi-rapi besar: breadcrumb halaman (Nota, Faktur, Customer, SP, Inventory) tidak dobel lagi dan 'Dashboard' bisa diklik untuk balik. Tombol Buat Nota/SP/Tambah Customer kini sejajar breadcrumb di kanan. Di Inventory tombol aksi (Produk, Stok Masuk, dll) pindah sejajar tab biar hemat tempat. Di Dashboard jarak antar-bagian dirapatkan, posisi Catatan Developer & Version ditukar, dan popup Catatan Developer kini muncul di tengah layar. Di Faktur, kotak Terlambat/Jatuh Tempo dibuat warna penuh biar kebaca dan info draft dipindah ringkas ke baris tombol.",
        dev: "Breadcrumb.jsx +count/+rightSlot; 5 halaman pakai shared Breadcrumb (hapus breadcrumb inline dobel). InventoryDashboard: action buttons → baris tab (justify-between). Dashboard: section mb-6→mb-4, Catatan Developer↔Version swap, dev-notes modal pakai createPortal(document.body) + baris Ekspektasi Performa dihapus. InvoiceList: badge Terlambat/Jatuh Tempo solid (bukan soft), draft banner compact dipindah ke tengah action row.",
      },
    ],
  },
  {
    version: "v1.34.0-stable",
    date: "15 Juni 2026",
    status: "latest",
    changes: [
      {
        type: "feat",
        text: "Daftar Harga: kolom harga yang belum di-set sekarang menampilkan harga jual dari Inventory sebagai acuan (tulisan abu 'ikut inventory'). Begitu kamu isi harga sendiri, harga itu tersimpan terpisah per channel (Offline/Shopee/Tokopedia) dan tidak mengubah harga di Inventory.",
        dev: "PriceListPage.priceCell: inheritPrice = r.sell_price; saat cur==null → placeholder = harga inventory + hint 'ikut inventory'. saveChannel tetap nulis ke price_list_entries saja (bukan product_master). effectivePrice fallback ke sell_price tetap utk PDF/stats.",
      },
    ],
  },
  {
    version: "v1.33.0-stable",
    date: "15 Juni 2026",
    status: "latest",
    changes: [
      {
        type: "ui",
        text: "Header semua halaman utama (Nota, Faktur, Customer, Surat Pesanan, Inventory) dirapikan jadi breadcrumb kecil 'Dashboard › Halaman · N tercatat' biar hemat tempat dan isi/daftar langsung kelihatan. Di Nota Penjualan, tombol Buat Nota dipindah ke antara filter dan daftar nota.",
        dev: "InvoiceList/SalesOrderList/CustomerList/PurchaseOrderList/InventoryDashboard: header h1 2rem + subtitle → breadcrumb row (Dashboard › title + count badge, pemisah '›'). SalesOrderList: tombol Buat Nota dipindah dari header ke atas tabel (antara toolbar filter & list). Dashboard.test getByText → getAllByText utk label yang juga muncul di teks RELEASES.",
      },
    ],
  },
  {
    version: "v1.32.0-stable",
    date: "15 Juni 2026",
    status: "latest",
    changes: [
      {
        type: "ui",
        text: "Dashboard dirapikan: metrik penting (Total Penjualan, Laba Kotor, Surat Pesanan Aktif, Stok Low/Expired) sekarang jadi satu kotak ringkas di atas biar langsung kebaca. Akses Cepat pindah ke bawahnya, dan Manajemen Tugas bisa disembunyikan/ditampilkan dengan animasi — defaultnya tertutup biar tidak makan tempat.",
        dev: "Dashboard.jsx: 4 stat cards → compact KPI strip (1 box dibagi 4, grid-cols-2/lg:grid-cols-4, divider per cell) dipindah ke atas (bawah header/Ringkasan). Akses Cepat dipindah ke setelah KPI. TasksKanban dibungkus collapsible (gridTemplateRows 0fr↔1fr transition 0.3s, default tasksOpen=false, chevron rotate) + dipindah ke paling bawah. +ClipboardList icon, +tasksOpen state.",
      },
    ],
  },
  {
    version: "v1.31.0-stable",
    date: "15 Juni 2026",
    status: "latest",
    changes: [
      {
        type: "new",
        text: "Nota Penjualan sekarang menampilkan estimasi berat paket dari berat produk + berat kemasan, supaya operator bisa memperkirakan ongkir dan kebutuhan packing sebelum kirim.",
        dev: "product_master.weight_gram + sales_orders.package_weight_gram/est_weight_gram; SalesOrderList live estimator; generateNotaPDF prints weight line only when snapshot > 0.",
      },
    ],
  },
  {
    version: "v1.30.0-stable",
    date: "15 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "ui",
        text: "Akses Cepat dipindah ke atas (antara Ringkasan & Manajemen Tugas) dan ditambah tombol Buat Faktur Pembelian. Klik Buat Nota/SP/Faktur langsung membuka form-nya di tab terkait, jadi sekali klik langsung isi.",
        dev: "Dashboard quick-access navigate('/sales'|'/orders'|'/invoices', {state:{quickCreate:true}}); SalesOrderList/PurchaseOrderList/InvoiceList useLocation effect auto-open modal create + history.replaceState anti re-open.",
      },
      {
        type: "fix",
        text: "Data master (customer/produk/distributor) kini lebih cepat ter-update antar perangkat operator — perubahan dari satu HP kebaca di HP lain maksimal 60 detik (sebelumnya 5 menit).",
        dev: "api.js CACHE_TTL 5min → 60s untuk sessionStorage master-data cache.",
      },
      {
        type: "fix",
        text: "Ringkasan Mingguan tidak lagi menampilkan produk yang sama dua kali (mis. Tropicana Slim Classic) akibat beda penulisan nama lama vs baru.",
        dev: "weekly-summary movers GROUP BY nama canonical via product_master + product_aliases; seed 7 alias produk lama.",
      },
    ],
  },
  {
    version: "v1.29.0-stable",
    date: "14 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Halaman Finance baru: lihat hutang ke distributor & piutang dari customer dalam satu tampilan, lengkap dengan tombol tandai lunas untuk faktur pembelian.",
        dev: "backend/routes/finance.js: GET /summary + PATCH /hutang/:invoiceNumber/lunas. frontend/src/components/FinancePage.jsx. Sidebar Finance active:true.",
      },
      {
        type: "new",
        text: "Export Excel laporan bulanan: Ringkasan + Nota Penjualan + Faktur Pembelian — unduh langsung dari halaman Finance.",
        dev: "backend/routes/reports.js: GET /monthly?month=YYYY-MM → xlsx buffer. reportsAPI.downloadMonthly di api.js.",
      },
      {
        type: "ui",
        text: "Heatmap Aktivitas Nota berubah jadi kalender bulan penuh: navigasi bulan prev/next, klik tile untuk lihat detail nota & customer hari itu.",
        dev: "Dashboard.jsx: buildMonthCalendarSeries + /dashboard/heatmap + /dashboard/daily-notas endpoints baru.",
      },
      {
        type: "fix",
        text: "Grafik Pergerakan Stok 30 Hari tidak lagi meledak oleh data test ONGKIR (qty 999,999) — hanya produk dengan KODE yang masuk hitungan.",
        dev: "dashboard.js qStockMove: JOIN product_master WHERE code IS NOT NULL AND code != ''.",
      },
    ],
  },
  {
    version: "v1.28.4-stable",
    date: "13 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "ui",
        text: "Saran Harga sekarang lebih halus untuk harga kecil, jadi BEP/Laba Tipis/Laba Sehat/Aman Promo tidak lagi mentok di angka yang sama. Setiap kartu saran juga bisa diklik langsung untuk memakai tier itu.",
        dev: "backend/utils/pricingEngine.js: psychologicalRound dibuat lebih granular di rentang harga kecil; PriceListPage SuggestDrawer row cards now clickable to apply each tier directly. Tests updated to expect distinct low-price outputs.",
      },
    ],
  },
  {
    version: "v1.28.3-stable",
    date: "13 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "ui",
        text: "Inventory list dan detail drawer sekarang membaca HNA/HPP dari batch aktif terbaru, jadi batch baru langsung tercermin walau master product masih kosong. Saran Restock juga ikut refresh setelah mutasi batch.",
        dev: "InventoryDashboard uses latest active batch HNA for list/detail display and refreshAfterChange now refetches insights; backend /inventory/products and /products/:id/full expose latest_hna/latest_batch_* without changing PDF or business flows.",
      },
    ],
  },
  {
    version: "v1.28.2-stable",
    date: "13 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Daftar Harga sekarang transparan saat backdrop Vanta aktif, jadi lapisan abu-abu di belakang UI tidak lagi menutup background.",
        dev: "PriceListPage root backgroundColor now respects isVantaMode and stays transparent over Vanta; no data, routing, or PDF logic changed.",
      },
    ],
  },
  {
    version: "v1.28.1-stable",
    date: "13 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Ringkasan Minggu Ini sekarang menyatu ke stack header Dashboard, jadi tidak tampil sebagai card terpisah di bawah board tugas.",
        dev: "Dashboard header now carries the weekly summary inline; layout stays read-only and keeps the dashboard stack visually unified.",
      },
    ],
  },
  {
    version: "v1.27.0-stable",
    date: "13 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Mini AI awal hadir di form Nota: sistem memberi peringatan harga rugi atau margin tipis, menampilkan produk yang biasanya dibeli customer, dan menyediakan draft pesan WhatsApp yang bisa disalin atau dibuka langsung.",
        dev: "Added auth-protected GET /api/insights/customer/:id, cached insightsAPI wrapper, WA draft utility, non-blocking Sales form margin guard, customer usual-buy chips, and WA draft actions. No stock/save payload/PDF formula changes.",
      },
    ],
  },
  {
    version: "v1.26.2-stable",
    date: "13 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Roadmap di popup Apa yang Baru dirapikan: fitur yang sudah sebagian jadi kenyataan tidak lagi ditulis terlalu umum. Upcoming sekarang lebih spesifik supaya operator dan AI berikutnya tahu mana yang benar-benar belum dikerjakan.",
        dev: "Dashboard upcoming audit: Export PDF/Excel narrowed to professional monthly Excel/PDF reporting; Predictive Restocking marked as Mini AI velocity work; added docs/UPCOMING_FEATURES_RULES.md as release-bump companion rule.",
      },
    ],
  },
  {
    version: "v1.26.1-stable",
    date: "13 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "ui",
        text: "Daftar Harga dirapikan lagi supaya lebih enak dipakai: tabel desktop lebih lega, kolom harga Offline/Shopee/TikTok tidak saling tabrakan, tombol saran harga dan riwayat lebih mudah diklik, dan modal Biaya Admin sekarang tampil di tengah dengan layout kartu yang lebih jelas.",
        dev: "PriceListPage UI recovery: table minWidth/colgroup, input channel min-height 44px, channel cell minWidth 196px desktop, solid ui-panel header/toolbar, fee profile modal max-height calc(100dvh - 32px), scrollable body, sticky header/footer semantics, per-profile dirty state.",
      },
    ],
  },
  {
    version: "v1.26.0-stable",
    date: "13 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "ui",
        text: "Daftar Harga dirombak total mengikuti gaya halaman lain: harga jual kini 3 kolom per saluran — Offline, Shopee, dan TikTok/Tokopedia — masing-masing berupa kotak isian langsung. Ketik harga lalu tekan Enter → tersimpan dan tanggal berlaku otomatis hari ini. Di bawah harga online langsung kelihatan perkiraan uang bersih setelah potongan marketplace dan untungnya (hijau/merah). Tombol ✨ di samping tiap kolom membuka saran harga khusus saluran itu, dan tombol 🕘 menampilkan riwayat perubahan harga per produk.",
        dev: "price_list_entries +channel (offline/shopee/tokopedia_tiktok) + index komposit; GET / join rn=1 per channel; PUT terima channel + idempotent per channel; history return channel. PriceListPage rewrite: vals map per produk×saluran, Enter=save Escape=revert, update lokal tanpa refetch, hint net = harga×(1−safe_effective_fee_rate default per platform), SuggestDrawer initialKey per saluran + onApply simpan langsung, HistoryModal.",
      },
      {
        type: "new",
        text: "✨ Harga Pintar di form nota: saat kamu pilih produk, harga jual otomatis terisi dari Daftar Harga sesuai saluran nota — nota Offline pakai harga offline, nota Online pakai harga Shopee (atau TikTok/Tokped kalau Shopee belum di-set). Muncul notifikasi kecil supaya kamu tahu harga itu datang dari mana.",
        dev: "priceMap (productId → harga per channel) di-fetch sekali saat mount; updateItem product_name override sell_price master bila ada entri Daftar Harga; fallback berjenjang shopee→tokopedia utk channel online.",
      },
    ],
  },
  {
    version: "v1.25.1-stable",
    date: "13 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Metode pembayaran 'Kartu Kredit' di nota, lengkap dengan biaya mesin EDC-nya. Kamu pilih siapa yang menanggung: 'Potong margin' (harga customer tetap, fee jadi beban internal — tidak tampil di nota) atau 'Bebankan ke customer' (tagihan otomatis di-gross-up supaya uang yang kamu terima tetap utuh — baris 'Biaya Kartu Kredit' ikut tercetak di nota). Persen fee terisi otomatis dari profil Biaya Admin (bisa diubah per nota), breakdown margin dan Dashboard ikut menghitung dengan benar. Preview nota juga kini menampilkan baris ongkir.",
        dev: "sales_orders +payment_fee_rate/payment_fee_mode/payment_fee; pass_on fee = total×r/(1−r) (net tetap = total), absorb fee = total×r dipotong gross_profit (payload + snapshot AUDIT-LS-06); dashboard qTotalLaba/qPrevLaba minus fee absorb; computeNotaMargin + tfoot breakdown row; NotaPreview totals useMemo (ongkir + ccFee TANPA PPN); generateNotaPDF baris Biaya Kartu Kredit (productTotal = total − ongkir − ccFee); prefill rate dari fee profile offline/credit_card.",
      },
    ],
  },
  {
    version: "v1.25.0-stable",
    date: "13 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Daftar Harga naik kelas: produk dikelompokkan per kategori, dan ada tombol '✨ Saran' yang menghitung rekomendasi harga jual per marketplace (Shopee, Tokopedia/TikTok, offline tunai/QRIS/kartu kredit) — lengkap dengan harga BEP, laba tipis, laba sehat, harga aman saat promo, pembulatan psikologis (49.900, 54.900, dst), estimasi uang yang diterima bersih, dan peringatan kalau harga bakal rugi saat campaign/voucher boost aktif. Biaya admin tiap marketplace bisa diubah sendiri lewat tombol '⚙️ Biaya Admin' kapan pun fee berubah.",
        dev: "utils/pricingEngine.js (pure, 36 unit test): recommended = (hpp_total+packing+target_profit+fixed_fee)/(1−total_variable_rate); fee_mode effective (safe_effective_fee_rate, fixed=0 anti double-count) vs official (admin+service+fixed); tabel marketplace_fee_profiles (source: official/historical_order/manual_override, prioritas historical) + seed 8 profil; endpoint /api/price-list/recommend & /fee-profiles; drawer SuggestDrawer debounce 350ms; psychologicalRound selalu ke atas.",
      },
      {
        type: "ui",
        text: "Tampilan HP dibenahi: di form Buat Nota, Form dan Preview sekarang jadi 2 tab terpisah (preview tidak lagi menutupi kolom isian saat mengetik), dan deretan filter di daftar nota dilipat ke satu tombol 'Filter' supaya layar tidak penuh dropdown. Daftar Harga di HP tampil sebagai kartu yang enak dibaca, bukan tabel yang digeser-geser.",
        dev: "SalesOrderList: formTab form/preview (grid 1fr di mobile, sticky off), filter wrapper display:contents desktop vs grid 2 kolom mobile + badge jumlah filter aktif; PriceListPage mobile card layout + sticky thead desktop + grouping kategori.",
      },
      {
        type: "perf",
        text: "Aplikasi lebih ringan dan responsif: scroll/zoom di iPhone tidak lagi memicu render ulang seluruh aplikasi, animasi pesan error form lebih mulus, query Daftar Harga di server dipangkas dari ratusan sub-query jadi satu kali jalan, koneksi database di server dibatasi supaya tidak mentok limit, dan beberapa index database ditambah supaya buka daftar nota/faktur/riwayat stok lebih cepat.",
        dev: "useIsMobile debounce 150ms; @keyframes ui-field-error-in clip-path (drop max-height layout thrash); priceList GET pakai CTE window function (ganti 3 LATERAL/row); pool max 5 saat VERCEL; index baru: sales_orders(is_deleted,status,sale_date), invoice_items(invoice_id), inventory_mutations(product_id,created_at); generatePriceListPDF jadi dynamic import.",
      },
    ],
  },
  {
    version: "v1.24.0-stable",
    date: "12 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Menu baru 'Daftar Harga' di sidebar: semua produk aktif dari Inventory tampil dengan HPP pembelian terakhir sebagai acuan, harga jual bisa di-set langsung per produk lengkap dengan tanggal berlaku, dan riwayat perubahan harga tersimpan (harga lama tetap kelihatan). Tombol Cetak A4 menghasilkan PDF daftar harga siap print — header CV + NPWP + 'Berlaku per tanggal'.",
        dev: "Tabel price_list_entries (riwayat append-only, effective_date); route /api/price-list (GET join LATERAL batch terbaru + entry terbaru + entry sebelumnya, PUT insert idempotent); PriceListPage (inline edit + margin live vs HPP batch terakhir via hppForBatch); generatePriceListPDF A4 portrait autoTable (eceran + harga karton dari sell_price_pack), tanpa HPP di printout (customer-facing).",
      },
    ],
  },
  {
    version: "v1.23.2-stable",
    date: "12 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Edit Nota untuk produk karton sekarang membuka jumlah sesuai yang diketik operator. Contoh: 3 karton tetap 3 karton saat nota dibuka ulang, bukan berubah menjadi 36 karton. Hitungan margin di daftar nota juga ikut memakai jumlah satuan jual yang benar.",
        dev: "SalesOrderList openEdit pakai qty_in_unit sebagai form qty; fallback qty hanya untuk data lama. computeNotaMargin dan detail expand distandardkan via saleItemDisplayQty() supaya sales_items.qty (base pcs) tidak lagi dipakai sebagai qty display/money untuk unit pack.",
      },
    ],
  },
  {
    version: "v1.23.1-stable",
    date: "12 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Perbaikan hitungan nota satuan karton: HPP tidak lagi tertukar antara per-pcs dan per-karton saat nota diedit, dan angka omzet/laba di Dashboard kini menghitung pakai jumlah karton (bukan jumlah pcs dikali harga karton — dulu bisa melenceng 12 kali lipat). Margin di daftar nota juga sudah benar. 4 nota Omela lama yang HPP-nya keselip ikut dibetulkan datanya.",
        dev: "Edit Nota re-match batch: unit_hpp = batch.hna × pack_size kalau unit pack (dulu ketimpa per-pcs); synthetic legacy batch hna dibagi pack_size (anti double-scale); tabel margin expand pakai qty_in_unit; dashboard.js semua revenue/margin SUM pakai COALESCE(qty_in_unit, qty); repair SQL 4 sales_items FRISIAN OMELA (185832 inc → 167416.20 hna) + recompute gross_profit order aktif.",
      },
    ],
  },
  {
    version: "v1.23.0-stable",
    date: "12 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Form Buat Nota sekarang punya draft otomatis seperti Faktur — ketikan tersimpan sendiri, kalau ketutup/kepencet keluar tinggal klik 'Pulihkan Draft'. Nota juga mencantumkan No. HP & Alamat customer (ikut tercetak di PDF), NPWP CV tampil di semua dokumen, dan nomor HP yang diisi di nota otomatis tersimpan ke data Customer.",
        dev: "form_drafts table (UNIQUE doc_type+owner) + endpoint sales/invoices draft upsert tunggal (ganti baris palsu is_draft di invoices, migrasi runOnce); autosave skip edit-mode/empty/dirty-check; syncCustomerContact post-COMMIT (COALESCE NULLIF, no-wipe); NPWP di NotaPreview/SPPreview/generateNotaPDF/generateSPPDF; PDF alamat splitTextToSize + tableStartY dinamis.",
      },
      {
        type: "fix",
        text: "Nota LUNAS yang tidak pernah diedit dulu tidak ikut kehitung di Dashboard (status dokumen nyangkut 'Draft'). Sekarang semua nota tersimpan otomatis sah/final dan langsung masuk hitungan — kolom 'Status Doc' yang membingungkan dihapus. Breakdown margin juga selalu menampilkan baris ongkir (plus/minus), jadi Total Margin Nota tidak ada selisih misterius.",
        dev: "sales POST INSERT status='final' eksplisit + PUT default final + ALTER DEFAULT + backfill runOnce sales_orders_status_final_v1; baris ongkir tampil saat ongkir>0 ATAU ongkir_cost>0; label Dashboard 'paid/final'→'lunas'; hint Customer kondisional per field kosong; icon sidebar ReceiptText/ClipboardList/Boxes/Settings.",
      },
    ],
  },
  {
    version: "v1.22.4-stable",
    date: "12 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Form Buat Nota: kolom Harga jual tidak lagi ketutupan panel preview saat nama produk panjang. Nama produk yang kepanjangan sekarang dipotong rapi dengan titik-titik (…), semua kolom input tetap kelihatan. Berlaku juga di form Surat Pesanan dan Faktur.",
        dev: "MasterSelect wrapper minWidth:0 (root fix semua call site); grid baris produk nota & SP pakai minmax(0,2fr) supaya kolom nama bisa menyusut; header grid nota disinkronkan 45px→70px (kolom Unit sempat misaligned vs baris).",
      },
    ],
  },
  {
    version: "v1.22.3-stable",
    date: "12 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Hasil audit menyeluruh (3 auditor paralel): faktur yang disimpan ulang tidak bisa lagi bikin stok dobel, harga modal batch tidak lagi menggelembung saat faktur terhubung SP, dan HPP batch dari pembelian Nota kini tampil benar di Inventory (tanpa tambahan 11%). Notifikasi error sekarang merah (bukan hijau seperti sukses), dan Dashboard utama loading jauh lebih cepat.",
        dev: "AUDIT v1.22.3: LS-01 guard alreadyPosted overwrite-POST; LS-02 batchHna pembagi qty penuh; LS-03 tax_type menjalar ke items+batches saat edit; LS-04 syncPurchaseBatchForNota; LS-05 permanent delete restore room SP + tolak batch terpakai nota; LS-06 gross_profit dari snapshot batch; LS-07/08 filter is_active fefo-hna & selected batch; LS-09 validasi qty/harga backend; LS-10 blokir nama produk kembar; LS-11 trust proxy; LS-13 JWT 15m; LS-14 constraint SP; CA-01 validasi sblm BEGIN; CA-02 dashboard Promise.all; CA-03 backfill one-time (schema_meta); CA-04 FOR UPDATE stock-out manual; CA-06 dedup stock-in; CA-08 dedup ALTER+CREATE document_counters; CA-09 received_qty carry-over server; CA-10/12 limit; UX-01 hppForBatch; UX-02/09/13 toast error; UX-03/07 ConfirmModal; UX-04 MasterSelect keyboard; UX-05 label+badge NOTA; UX-06 fetch error feedback; UX-08 input min 0.",
      },
    ],
  },
  {
    version: "v1.22.2-stable",
    date: "11 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Sistem sekarang otomatis mengingat nama lama produk. Habis rename produk, faktur dari distributor yang masih pakai nama lama tetap langsung dikenali — stok dan HPP masuk ke produk yang benar tanpa perlu pilih ulang. Berlaku juga kalau distributor menulis nama dengan gaya berbeda: sekali dipetakan, seterusnya hafal.",
        dev: "Tabel product_aliases (FK product_master, UNIQUE LOWER(TRIM(alias_name))). Resolver alias di invoices (lookup+resolveProductByIdOrName), sales (productMap POST/PUT), purchaseOrders. Auto-seed: rename inventory PUT & products PATCH (nama lama), faktur POST/PUT post-commit (nama item ≠ nama master). Seed guard: skip kalau bentrok nama master aktif; ON CONFLICT DO NOTHING.",
      },
    ],
  },
  {
    version: "v1.22.1-stable",
    date: "11 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "stability",
        text: "Surat Pesanan makin anti-salah: pilih produk di form SP sekarang menampilkan KODE — Nama dan tersimpan dengan identitas produk (bukan cuma teks nama). Pencocokan terima barang lewat faktur juga diperketat supaya qty SP produk lain yang kebetulan senama tidak ikut terpotong.",
        dev: "PurchaseOrderList: MasterSelect +onSelect simpan product_id + label KODE — Nama. invoices.js pickPurchaseOrderItem: fallback by-name difilter — hanya PO item legacy tanpa product_id atau yang id-nya sama (cegah cross-product room deduction).",
      },
    ],
  },
  {
    version: "v1.22.0-stable",
    date: "11 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "new",
        text: "Pembelian sekarang bisa dibedakan: Faktur (ada PPN masukan 11%) atau Nota (tanpa PPN). Kalau beli pakai nota, HPP dicatat sesuai harga beli asli — tidak lagi ketambahan 11% yang sebenarnya tidak kita bayar. Laba di Dashboard dan margin nota penjualan ikut akurat.",
        dev: "invoices/inventory_batches/invoice_items/sales_items +tax_type (default 'faktur', backward compatible). Mode nota: PPN masukan 0, batch hna = harga beli, skip sync product_master.hna, skip ×1.11 di HPP. sales.js: snapshot unit_hpp_tax_type per item dari batch terpilih/FEFO; dashboard.js: cost CASE per tax_type. Frontend: toggle Faktur/Nota di form pembelian, kalkulasi PPN faktor 0 utk nota, SalesOrderList hppIncFor() per item + label batch dropdown.",
      },
    ],
  },
  {
    version: "v1.21.20-stable",
    date: "11 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Faktur Pembelian sekarang menolak produk yang belum dikenali master Inventory, supaya stok dan HPP tidak hilang diam-diam.",
        dev: "Invoice POST/PUT editable: resolve semua item di awal transaksi. Unmatched/ambiguous product rollback + HTTP 422 dengan unmatchedProducts; frontend menampilkan daftar produk bermasalah dan tidak menutup modal sebagai sukses.",
      },
    ],
  },
  {
    version: "v1.21.19-stable",
    date: "11 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "changed",
        text: "Picker produk di Faktur Pembelian sekarang memakai master produk ber-ID dan menampilkan KODE — Nama, supaya stok masuk ke produk yang tepat walau nama distributor berbeda.",
        dev: "InvoiceList: produk dropdown pindah ke inventoryAPI.getProducts({ limit: 2000 }); MasterSelect.onSelect menyimpan product_id. Input nama bebas tetap boleh sementara dengan product_id null untuk fase gate berikutnya.",
      },
    ],
  },
  {
    version: "v1.21.18-stable",
    date: "11 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "changed",
        text: "Tambah/edit produk sekarang WAJIB isi KODE, dan KODE nggak boleh kembar (mis. ENTMX-VAN-555G). Mencegah barang nyelonong tanpa identitas — fondasi biar stok & HPP nggak ketuker.",
        dev: "Fase 1a. inventory.js POST/PUT: validasi code required + cek unik (UPPER(TRIM(code)), exclude self saat PUT) → 409 kalau bentrok; code dinormalisasi uppercase. Form InventoryDashboard: field Kode wajib + auto-uppercase + validasi klien.",
      },
    ],
  },
  {
    version: "v1.21.17-stable",
    date: "11 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "ui",
        text: "Halaman Inventory sekarang ada pagination — bisa pilih tampil 10 / 20 / 50 produk per halaman (default 10), biar nggak scroll panjang.",
        dev: "InventoryDashboard: state pageSize/currentPage, paged = filtered.slice, useEffect reset page saat search/status/pageSize berubah, bar kontrol Prev/Next + selector di bawah tabel.",
      },
      {
        type: "changed",
        text: "Semua produk inventory dirapikan namanya + dikasih KODE unik (mis. ENTMX-VAN-555G), dan 27 produk baru ditambahkan (stok 0, harga menyusul).",
        dev: "Fase 0: rename 50 + aktifkan 1 + insert 27 produk via product_master/product_catalog/invoice_items, semua ber-KODE. Fondasi identitas by-KODE untuk fase berikutnya (resolver/alias/gate anti stok hilang).",
      },
    ],
  },
  {
    version: "v1.21.16-stable",
    date: "10 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Dashboard 'Total Laba' sekarang ikut menghitung untung/rugi ongkir (sebelumnya pemasukan naik karena ongkir tapi laba tidak ikut — tidak konsisten).",
        dev: "dashboard.js total_laba + prev_total_laba: tambah subquery scoped SUM(ongkir - ongkir_cost). Channel/category breakdown tetap product-level (ongkir tidak punya kategori).",
      },
    ],
  },
  {
    version: "v1.21.15-stable",
    date: "10 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Untung ongkir sekarang ikut kehitung di 'Total Margin Nota' (sebelumnya cuma margin produk). Muncul baris ongkir terpisah juga biar jelas.",
        dev: "SalesOrderList tfoot totalMargin: itemMargin + (ongkir - ongkir_cost), tambah baris ongkir. Data: sinkron batch DIANERAL ke HNA 30096.57 (HPP 33407.19) — batch invoice-122 ketinggalan COD 0.75%.",
      },
    ],
  },
  {
    version: "v1.21.14-stable",
    date: "10 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "feature",
        text: "Ongkir bisa diisi langsung di nota — gak perlu bikin produk ONGKIR lagi. Ada 2 kolom: yang ditagih ke customer (muncul di nota) dan biaya kurir asli (opsional, buat hitung untung, gak muncul di nota). Cocok buat kirim sendiri (untung), pihak ketiga (impas), atau subsidi ongkir (motong margin).",
        dev: "sales_orders +ongkir +ongkir_cost. POST/PUT: total += ongkir, gross_profit += (ongkir - ongkir_cost). PDF: ongkir baris terpisah, TIDAK kena PPN (DPP/PPN dari nilai produk saja). Produk ONGKIR legacy disembunyikan dari product picker. Nota lama dibiarkan utuh.",
      },
    ],
  },
  {
    version: "v1.21.13-stable",
    date: "10 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Faktur yang sudah jadi stok sekarang bisa diubah status bayarnya (Sudah/Belum Bayar) tanpa ditolak — sebelumnya gagal simpan untuk faktur yang harganya ada pecahan koma.",
        dev: "invoiceItemsChanged false-positive: canonical compare money fields (hna/hna_baru/unit_price) now round2 to match DECIMAL(15,2); toDateOnly uses local date parts (TZ-safe) instead of toISOString.",
      },
    ],
  },
  {
    version: "v1.21.12-stable",
    date: "10 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Koreksi HNA 7 produk yang tersimpan sebagai HPP (inc PPN) — ENTRAMIX 555, ENTRASOY ALMOND SOYA, PEPTIBREN VANILA, PEPTISOL COKLAT/VANILA, TS NFDM, TS SWEET DIABTX. HPP di inventory sekarang akurat.",
        dev: "DB fix: product_master.hna ROUND(hna/1.11) for id IN (7,12,26,29,28,4,3). inventory_batches.hna=67500 for PEPTISOL batch #33,34.",
      },
      {
        type: "fix",
        text: "Warning otomatis muncul saat simpan faktur dengan nama produk yang tidak cocok di master — stok tidak masuk diam-diam tidak terjadi lagi.",
        dev: "Backend POST/PUT /api/invoices returns unmatchedProducts[]. Frontend doSave shows amber toast (8s) listing unmatched names.",
      },
    ],
  },
  {
    version: "v1.21.11-stable",
    date: "8 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Tabel Faktur sekarang bisa di-scroll samping di layar sempit — nama distributor tidak hilang lagi saat sidebar browser dibuka.",
        dev: "InvoiceList table header+rows: distributor minmax(160px,1fr) + grid minWidth 1080px; ui-table-shell scrolls instead of collapsing on narrow viewports.",
      },
    ],
  },
  {
    version: "v1.21.10-stable",
    date: "8 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "ui",
        text: "Template opname cetak sekarang lebih rapi untuk input manual: kolom Batch/ED kosong tidak lagi menampilkan teks kosong dan area tulis dibuat lebih lega.",
        dev: "generateInventoryPDF.js removes printed empty placeholders from Batch/ED, adds print instructions, increases row height, and widens manual input columns for Stok Fisik/Selisih/Catatan.",
      },
    ],
  },
  {
    version: "v1.21.9-stable",
    date: "8 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Faktur Pembelian lebih aman: update status lunas untuk faktur yang sudah masuk stok tidak lagi tertolak, dan teks distributor di light mode kembali terbaca.",
        dev: "backend/routes/invoices.js normalizes Date objects to ISO date before comparing posted invoice items; InvoiceList distributor summary/row text uses text tokens instead of surface token.",
      },
    ],
  },
  {
    version: "v1.21.8-stable",
    date: "8 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "smoke",
        text: "Operator smoke checklist dan sidebar shell test diperjelas: login/logout, modal flow, sidebar parity, table actions, contrast, dan overflow 375 sekarang punya pegangan yang lebih rapi.",
        dev: "docs/SMOKE_CHECKLIST_CROSS_PLATFORM.md ditambah operator smoke flow; frontend/src/components/SidebarSmoke.test.js memverifikasi sidebar navigation parity dan logout tanpa DB write path.",
      },
    ],
  },
  {
    version: "v1.21.7-stable",
    date: "8 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "note",
        text: "Follow-up visual QA tetap clean; tidak ada frontend fix baru yang perlu dipaksakan untuk shell inventory/customers/dashboard.",
        dev: "v1.21.6 baseline report tetap berlaku: 375/768/1280/1440 light-dark checks pass; TasksKanban tetap divalidasi lewat Dashboard karena tidak ada route /tasks terpisah.",
      },
    ],
  },
  {
    version: "v1.21.6-stable",
    date: "8 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "report",
        text: "Visual QA baseline sudah dicatat: login, dashboard, sales, invoices, orders, inventory, customers, tasks section, dan print settings lolos tanpa P0/P1/P2.",
        dev: "docs/VISUAL_QA_v1.21.6.md merangkum audit light/dark di 375, 768, 1440, dan desktop Arc/default; `/tasks` bukan route terpisah di App.js jadi divalidasi lewat TasksKanban pada Dashboard.",
      },
    ],
  },
  {
    version: "v1.21.5-stable",
    date: "8 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Environment lokal sekarang lebih tegas: backend/dev prefer .env.dev, remote DB wajib label target, dan prod lokal diblokir tanpa override eksplisit.",
        dev: "backend/app.js + backend/scripts/check-db.js + test/health scripts share runtime env loader; local/prod guardrails added via HABIL_DB_TARGET and ALLOW_PROD_LOCAL. Frontend API fallback also synced to localhost:5001.",
      },
    ],
  },
  {
    version: "v1.21.4-stable",
    date: "8 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Transisi login lebih rapi: kalau perangkat mengaktifkan mode hemat animasi, langsung masuk dashboard tanpa jeda.",
        dev: "Login respects useReducedMotion: skip 300ms exit delay + cleanup timer on unmount. Added docs/ENV_SETUP.md.",
      },
    ],
  },
  {
    version: "v1.21.3-stable",
    date: "8 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "ui",
        text: "Animasi transisi: masuk dari login ke dashboard dan keluar (logout) sekarang punya efek zoom halus yang mulus.",
        dev: "route-fade scale+fade; login submit ui-auth-exit zoom-out; respects prefers-reduced-motion.",
      },
    ],
  },
  {
    version: "v1.21.2-stable",
    date: "7 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Perbaikan keterbacaan & kerapian: nama distributor di Faktur kembali tampil, teks changelog di light mode lebih jelas, tombol aksi tabel selalu terlihat (tanpa perlu hover), copyright login di tengah, plus animasi masuk halaman login.",
        dev: "fix invisible distributor (surface-elevated→text), changelog light contrast (border-strong→text-muted), .ui-row-action opacity 1, login copyright flex-center, ui-auth-enter zoom keyframe.",
      },
    ],
  },
  {
    version: "v1.21.1-stable",
    date: "7 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "ui",
        text: "Inventory & Stok diselesaikan readability-nya: header, tabs, filter, product table, alert cards, dan batch rows memakai surface solid serta angka tabular.",
        dev: "InventoryDashboard.jsx visual-only pass: tokenized bg/card/text, readable header/search/tabs, ui-table-shell for product and batch tables, fixed invalid selected-row tint. Stock in/out/opname/batch logic untouched.",
      },
    ],
  },
  {
    version: "v1.21.0-stable",
    date: "7 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "ui",
        text: "Faktur Pembelian dan Surat Pesanan dibuat lebih solid: panel KPI, filter, tabel, status, dan action icon sekarang lebih readable tanpa rasa glass yang mengganggu.",
        dev: "InvoiceList.jsx and PurchaseOrderList.jsx visual-only pass: tokenized surfaces, ui-table-shell usage, stronger action hit targets, and solid dialog shells. Purchase receive, invoice stock-in, SP-link, HNA/HPP/PPN formulas, backend, and PDF untouched.",
      },
    ],
  },
  {
    version: "v1.20.9-stable",
    date: "7 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "ui",
        text: "Pengaturan cetak diperbaiki: panel form dan live preview sekarang solid, readable, dan lebih aman di desktop maupun mobile.",
        dev: "PrintSettings.jsx visual-only: token surface, readable header, solid form/preview panels, desktop sticky preview disabled on mobile. printSettingsAPI/settingsAPI signatures and save flow unchanged.",
      },
    ],
  },
  {
    version: "v1.20.8-stable",
    date: "7 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "ui",
        text: "Nota Penjualan lebih readable: header/filter/table dibuat lebih solid, angka tetap tabular, dan transisi halaman disamakan dengan surface Dashboard/Customer.",
        dev: "SalesOrderList.jsx visual-only: root uses ui-page/ui-motion-page, header/filter/table use readable utility surfaces, row action hit targets strengthened. Save payload, batch selection, FEFO, SP nudge, PDF, and backend untouched.",
      },
    ],
  },
  {
    version: "v1.20.7-stable",
    date: "7 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Angka KPI Dashboard lebih stabil di Arc/sidebar terbuka: nominal panjang sekarang mengecil berdasarkan lebar card dan tidak keluar container.",
        dev: "Add ui-stat-card-fluid + ui-fluid-number container-query utilities; Dashboard KPI cards use them. Tasks/Dashboard data fetch and drag/drop/status logic unchanged.",
      },
    ],
  },
  {
    version: "v1.20.6-stable",
    date: "7 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "ui",
        text: "Readability guard ditambahkan: teks Login, toggle mode, dan surface di atas background animasi dibuat lebih solid agar tetap terbaca di light maupun dark mode.",
        dev: "index.css adds ui-readable-surface/ui-over-media-copy/ui-mode-toggle. Login.jsx and Sidebar.jsx apply stronger contrast states; Dashboard header uses ui-toolbar. No auth, backend, stock, PDF, or business logic changes.",
      },
    ],
  },
  {
    version: "v1.20.5-stable",
    date: "7 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Local audit lebih aman: frontend sekarang menghormati REACT_APP_API_URL di localhost, jadi dev/staging/prod read-only bisa dipilih eksplisit tanpa menyentuh data live.",
        dev: "services/api.js memakai env override sebelum fallback localhost. Environment SOP dan frontend .env.example non-secret ditambah; tidak ada backend business logic, schema, atau PDF yang disentuh.",
      },
    ],
  },
  {
    version: "v1.20.4-stable",
    date: "7 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "polish",
        text: "Header dan strip kontrol di Dashboard serta Tasks sekarang lebih konsisten karena memakai ui-toolbar yang sama, jadi shell terasa lebih rapat tanpa mengubah data atau interaksi.",
        dev: "Dashboard header action bar dan TasksKanban header/search strip diselaraskan ke ui-toolbar; data fetch, drag/drop, modal, dan route logic tetap utuh.",
      },
    ],
  },
  {
    version: "v1.20.3-stable",
    date: "7 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Dashboard mobile dan desktop sekarang tetap rapat di viewport: root page dikunci ke lebar kontainer, sidebar tetap fixed overlay, dan TasksKanban tetap scroll di dalam panel tanpa mendorong root ke samping.",
        dev: "App.js flex-1 diberi min-width: 0, Dashboard root constrained, dan TasksKanban panel/board memakai min-w-0 + overflow-hidden/overflow-x-auto agar shell tidak melebar sementara interaksi drawer tetap sama.",
      },
    ],
  },
  {
    version: "v1.20.2-stable",
    date: "7 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "polish",
        text: "Sidebar diubah jadi operational console yang lebih rapat, jelas, dan stabil di desktop maupun mobile.",
        dev: "Sidebar.jsx menajamkan active state, touch target, footer console shell, dan behavior drawer tanpa mengubah menu items, role logic, route paths, auth/logout logic, atau bug report payload.",
      },
    ],
  },
  {
    version: "v1.20.1-stable",
    date: "6 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "polish",
        text: "Login dibuat lebih solid dan nyaman: panel, input, error, dan tombol masuk diselaraskan dengan design foundation v1.20",
        dev: "Login.jsx visual polish only; auth flow, token storage, backend login, and Vanta behavior unchanged",
      },
    ],
  },
  {
    version: "v1.20.0-stable",
    date: "6 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "change",
        text: "Design foundation v1.20 diformalisasi dari pilot Customers, Tasks, dan Dashboard untuk rollout tema berikutnya",
        dev: "index.css adds additive ui-page/ui-panel/ui-toolbar/ui-action-button/ui-density-compact/ui-stat-card/ui-dialog-shell utilities; docs updated",
      },
    ],
  },
  {
    version: "v1.19.7-stable",
    date: "6 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "polish",
        text: "Pilot Dashboard merapikan KPI, panel data, quick actions, dan popup rilis agar lebih scannable tanpa mengubah data",
        dev: "Dashboard surface classes only; API fetch, charts, onboarding, and release ordering preserved",
      },
    ],
  },
  {
    version: "v1.19.6-stable",
    date: "6 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "polish",
        text: "Pilot tampilan Tasks dibuat lebih solid: panel, kartu tugas, modal, dan tombol aksi lebih nyaman di desktop dan mobile",
        dev: "TasksKanban visual pilot only; drag/drop/status/data flow unchanged",
      },
    ],
  },
  {
    version: "v1.19.5-stable",
    date: "6 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "polish",
        text: "Nominal ringkas di halaman Customer sekarang memakai format Indonesia seperti rb dan jt",
        dev: "Customer compact currency labels now use id-ID separators and rb/jt suffixes",
      },
    ],
  },
  {
    version: "v1.19.4-stable",
    date: "6 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "change",
        text: "Design system v1.20 didokumentasikan dari hasil pilot Customer supaya rollout tema berikutnya lebih aman dan konsisten",
        dev: "docs/DESIGN_SYSTEM_v1.20.md captures surface, toolbar, card/table, modal/form, mobile, and rollout rules",
      },
    ],
  },
  {
    version: "v1.19.3-stable",
    date: "6 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "change",
        text: "Pilot tampilan Customer dibuat lebih rapi: toolbar, kartu, modal, dan tombol aksi lebih konsisten di desktop dan mobile",
        dev: "CustomerList pilot only; no backend/schema/PDF/business logic touched",
      },
    ],
  },
  {
    version: "v1.19.2-stable",
    date: "6 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "change",
        text: "Pengamanan environment: audit dan repair data sekarang wajib jelas target DB-nya sebelum theme pilot berjalan",
        dev: "docs/ENVIRONMENT_SAFETY_v1.19.2.md defines prod/dev/audit-readonly roles, dry-run defaults, and local seed login",
      },
    ],
  },
  {
    version: "v1.19.1-stable",
    date: "4 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "change",
        text: "Rapikan tampilan kotak petunjuk SP di form Faktur",
        dev: "InvoiceList hint box border now uses valid color-mix() border and keeps matching SP nudge inline",
      },
    ],
  },
  {
    version: "v1.19.0-stable",
    date: "4 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "change",
        text: "Faktur baru: SP yang cocok tampil otomatis di urutan atas + hint sambungkan biar stok tidak dobel",
        dev: "sort matching SPs by distributor+product overlap, inline nudge with Sambungkan button",
      },
    ],
  },
  {
    version: "v1.18.8-stable",
    date: "4 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "polish",
        text: "Penguatan internal: pengujian otomatis tidak lagi menyentuh data produksi",
        dev: "schema init guarded by NODE_ENV!=='test' (13 routes); test-route-http runs hermetic",
      },
    ],
  },
  {
    version: "v1.18.7-stable",
    date: "4 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Peningkatan stabilitas koneksi database (persiapan kompatibilitas versi mendatang)",
        dev: "database.js + health-check: strip sslmode from connstring, SSL via ssl object (pg v9 deprecation)",
      },
    ],
  },
  {
    version: "v1.18.6-stable",
    date: "4 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Pemeriksaan kesehatan data lebih akurat — tidak lagi salah alarm untuk Surat Pesanan draft & produk berdiskon COD",
        dev: "health check4 allow draft/sent pre-receive; check8b COD-aware (effective HNA after COD)",
      },
      {
        type: "polish",
        text: "Catatan rilis versi sebelumnya dibuat lebih ramah dibaca operator",
        dev: "RELEASES v1.18.1 entries: text→operator language, jargon moved to dev field",
      },
    ],
  },
  {
    version: "v1.18.5-stable",
    date: "4 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Perbaikan preview nomor SP yang sebelumnya kehilangan kode bulan",
        dev: "autoSPNumber return yymm+seq instead of seq-only",
      },
    ],
  },
  {
    version: "v1.18.4-stable",
    date: "4 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Preview nomor SP otomatis sekarang sesuai dengan nomor yang tersimpan",
        dev: "autoSPNumber useMemo computes per-month seq from orders state, 3-digit format",
      },
    ],
  },
  {
    version: "v1.18.3-stable",
    date: "4 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Nomor Surat Pesanan otomatis sekarang reset tiap bulan — tidak lagi stuck di angka bulan lalu.",
        dev: "generatePONumber: REPLACE prefix per-month, monthly reset via last_yymm",
      },
    ],
  },
  {
    version: "v1.18.1-stable",
    date: "3 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fixed",
        text: "Pemeriksaan kesehatan data HPP diperbaiki agar tidak salah memberi peringatan",
        dev: "check8 HPP: removed incorrect division by qty, REPORT-only",
      },
      {
        type: "fixed",
        text: "Perbaikan data batch kosong yang terduplikasi",
        dev: "repair-v1181-null-batches.js with --dry-run/--apply",
      },
      {
        type: "fixed",
        text: "Tambah distributor lebih aman — nama wajib diisi, data salesman ikut tersimpan",
        dev: "distributorsAPI.add: trim + reject empty, preserve metadata via spread",
      },
      {
        type: "fixed",
        text: "Penguatan pengujian internal rute API",
        dev: "HTTP route test: assert exact 401 + error body, reject 500",
      },
    ],
  },
  {
    version: "v1.18.0-stable",
    date: "3 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "changed",
        text: "MasterSelect: added non-breaking onSelect(optionObject) prop (existing onChange unchanged)",
        dev: "",
      },
      {
        type: "added",
        text: "docs/AUDIT_TECH_DEBT_v1.18.0.md with refactor roadmap",
        dev: "",
      },
    ],
  },
  {
    version: "v1.17.6-stable",
    date: "3 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "added",
        text: "backend/scripts/health-check-prod.js: 8 proactive health checks (read-only)",
        dev: "",
      },
      {
        type: "added",
        text: "npm run health command",
        dev: "",
      },
      {
        type: "added",
        text: "Backend health reports: PO over-receive, negative stock, batch integrity, PO status sync, HPP mismatch",
        dev: "",
      },
    ],
  },
  {
    version: "v1.17.5-stable",
    date: "3 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fixed",
        text: "TasksKanban save button now disabled while saving (missing guard)",
        dev: "",
      },
      {
        type: "fixed",
        text: "Audited all 6 major component groups: all save buttons properly guarded",
        dev: "",
      },
    ],
  },
  {
    version: "v1.17.4-stable",
    date: "3 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "changed",
        text: "API cache keys now include query params so pagination/search doesn't hit stale cache",
        dev: "",
      },
      {
        type: "changed",
        text: "distributors/products/customers getAll accept optional params argument",
        dev: "",
      },
    ],
  },
  {
    version: "v1.17.3-stable",
    date: "3 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "changed",
        text: "Cross-platform UX stability sweep: touch targets 40px across all close buttons (10 files)",
        dev: "",
      },
      {
        type: "changed",
        text: "Created docs/SMOKE_CHECKLIST_CROSS_PLATFORM.md for manual QA",
        dev: "",
      },
    ],
  },
  {
    version: "v1.17.2-stable",
    date: "3 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "added",
        text: "HTTP integration smoke tests (11 tests): health, auth guard, route mounting, response shape",
        dev: "",
      },
      {
        type: "added",
        text: "app.js extracted from server.js for testability",
        dev: "",
      },
      {
        type: "added",
        text: "supertest devDependency for route testing",
        dev: "",
      },
      {
        type: "changed",
        text: "npm test now runs DB health (18) + route helper (18) + HTTP smoke (11) = 47 total",
        dev: "",
      },
    ],
  },
  {
    version: "v1.17.1-stable",
    date: "3 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fixed",
        text: "distributorsAPI.add now accepts string OR object (short_code, salesman_name no longer lost)",
        dev: "",
      },
      {
        type: "fixed",
        text: "productsAPI.add same fix",
        dev: "",
      },
      {
        type: "fixed",
        text: "Cache properly invalidated on distributor/product mutations",
        dev: "",
      },
      {
        type: "fixed",
        text: "API error now logs to console.error instead of silent catch",
        dev: "",
      },
    ],
  },
  {
    version: "v1.17.0-stable",
    date: "3 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "added",
        text: "Master data cache: products/distributors/customers cached in sessionStorage (TTL 5 min), invalidated on mutation",
        dev: "",
      },
      {
        type: "added",
        text: "Removed duplicate frontend/.env.local",
        dev: "",
      },
      {
        type: "changed",
        text: "Confirmed recharts lazy-loaded (65.chunk.js 353KB only loaded for dashboard charts)",
        dev: "",
      },
      {
        type: "changed",
        text: "Confirmed PDF utilities dynamically imported (795.chunk.js 396KB only loaded on print)",
        dev: "",
      },
      {
        type: "changed",
        text: "Total bundle neutral (+1KB for cache layer in main.js)",
        dev: "",
      },
    ],
  },
  {
    version: "v1.16.9-stable",
    date: "3 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fixed",
        text: "Save buttons now properly disabled while submitting across all major forms",
        dev: "",
      },
      {
        type: "fixed",
        text: "Silent catch blocks replaced with console.error in user-facing flows",
        dev: "",
      },
      {
        type: "fixed",
        text: "Loading/empty states clarified in CustomerList, InventoryDashboard",
        dev: "",
      },
      {
        type: "changed",
        text: "API error handling more robust: errors now show user-readable messages",
        dev: "",
      },
    ],
  },
  {
    version: "v1.16.8-stable",
    date: "3 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "added",
        text: "Pagination/search safety: 8 list endpoints now have LIMIT + optional ?q= search",
        dev: "",
      },
      {
        type: "added",
        text: "Customers/products/distributors cap 1000-2000 to preserve dropdown UX",
        dev: "",
      },
      {
        type: "fix",
        text: "Missing index idx_customers_name_lc for customer search",
        dev: "",
      },
      {
        type: "fix",
        text: "Inventory/tasks/bugs list queries bounded",
        dev: "",
      },
    ],
  },
  {
    version: "v1.16.7-stable",
    date: "3 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "added",
        text: "Route-level regression tests: 18 tests for batch resolution, PO room logic, faktur stock-in, sales PUT preservation",
        dev: "",
      },
      {
        type: "added",
        text: "npm test now runs both DB health (18 tests) + route regression (18 tests) = 36 total",
        dev: "",
      },
      {
        type: "changed",
        text: "Sales helper priority behavior locked by tests (selected_batch_id > batch_id_snapshot > batch_no+expired > batch_no only)",
        dev: "",
      },
    ],
  },
  {
    version: "v1.16.6-stable",
    date: "3 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "added",
        text: "Backend regression test suite (18 tests) for stock/batch critical flows",
        dev: "",
      },
      {
        type: "added",
        text: "npm test now runs regression tests instead of placeholder",
        dev: "",
      },
      {
        type: "fix",
        text: "Duplicate batch detection now includes expired_date in GROUP BY (legitimate different deliveries)",
        dev: "",
      },
    ],
  },
  {
    version: "v1.16.5-stable",
    date: "3 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Data-integrity repair script: PO item 54 duplicate SP receive, batch_id_snapshot backfill, PO status sync",
        dev: "",
      },
      {
        type: "fix",
        text: "Sales create/update returns 400 for ambiguous batch snapshots (was 500)",
        dev: "",
      },
      {
        type: "fix",
        text: "FOR UPDATE locking on batch_no snapshot lookups in sales route",
        dev: "",
      },
    ],
  },
  {
    version: "v1.16.4-stable",
    date: "3 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Sales edit batch dropdown now resolves legacy batch_no_snapshot when batch_id_snapshot is null",
        dev: "",
      },
      {
        type: "fix",
        text: "Backend resolveSelectedBatchForSale helper with priority: id > name+date > name-only",
        dev: "",
      },
      {
        type: "fix",
        text: "Safe backfill of batch_id_snapshot for unique snapshot matches",
        dev: "",
      },
    ],
  },
  {
    version: "v1.16.3-stable",
    date: "3 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "fix",
        text: "Partial SP faktur no longer duplicates stock: remaining room logic, no existing batch iteration",
        dev: "",
      },
      {
        type: "fix",
        text: "Batch cost sync narrowed to matching batch_number, not blanket PO batch update",
        dev: "",
      },
      {
        type: "fix",
        text: "Sales edit respects selected batch; edit modal shows snapshot batches even if stock 0",
        dev: "",
      },
    ],
  },
  {
    version: "v1.16.2-stable",
    date: "3 Juni 2026",
    status: "stable",
    changes: [
      {
        type: "changed",
        text: "Faktur stock-in: batch HNA now uses effective cost after discount/COD (effectiveHna helper)",
        dev: "",
      },
      {
        type: "changed",
        text: "Faktur linked SP: existing received batches are now respected, no duplicate batch creation",
        dev: "",
      },
      {
        type: "new",
        text: "GET /purchase-orders/:id now returns received_batches per item",
        dev: "",
      },
      {
        type: "new",
        text: "effectiveHna() helper for consistent discount-aware cost calculation",
        dev: "",
      },
      {
        type: "fix",
        text: "Invoice items HNA prorata bug: now uses per-unit values consistently",
        dev: "",
      },
    ],
  },
  {
    version: "v1.16.1-stable",
    date: "3 Juni 2026",
    status: "stable",
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
// Roadmap — DIPERBARUI tiap rilis (lihat docs/UPCOMING_FEATURES_RULES.md):
// fitur shipped DIHAPUS dari sini & masuk RELEASES, lalu AI menambah rekomendasi baru.
// Dibersihkan v1.34.x: Export Excel bulanan (v1.29), Finance hutang/piutang (v1.29),
// dan Predictive Restocking (live di Inventory) sudah shipped → dipindah ke RELEASES.
const upcoming = [
  {
    priority: "high",
    title: "Notifikasi otomatis stok menipis",
    desc: "Peringatan proaktif (in-app + draft WA) saat produk mendekati habis, memakai data velocity restock yang sudah berjalan",
  },
  {
    priority: "medium",
    title: "Ongkir otomatis dari berat paket",
    desc: "Hitung estimasi ongkir per kurir dari total berat nota — lanjutan fitur estimasi berat paket (v1.31)",
  },
  {
    priority: "medium",
    title: "Scanner Barcode/QR",
    desc: "Input stok & item nota lebih cepat lewat kamera/scanner untuk kurangi salah ketik",
  },
  {
    priority: "low",
    title: "Penggajian (Payroll) Karyawan",
    desc: "Modul gaji karyawan; Finance hutang/piutang dasar sudah ada sejak v1.29",
  },
  {
    priority: "low",
    title: "TypeScript Migration",
    desc: "Full type safety untuk seluruh codebase (refactor besar, jangan digabung hotfix transaksi)",
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
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false); // v1.32.0: Manajemen Tugas default tutup (jarang dipakai)
  const [showDevNotes, setShowDevNotes] = useState(false);
  // v1.58.0: bulan aktif dashboard (dipilih via kalender Aktivitas Nota). Didefinisikan
  // di sini agar bisa dipakai useDashboardStats (KPI + kartu bawah ikut bulan ini).
  const [heatmapMonth, setHeatmapMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  // v1.46.0: stats & weekly via TanStack Query — instan saat balik ke Dashboard.
  // v1.58.0: stats ikut bulan terpilih (heatmapMonth).
  const { data: statsRaw, isLoading: loading } = useDashboardStats(heatmapMonth);
  const { data: weekly } = useWeeklySummary();
  const [expandedChanges, setExpandedChanges] = useState(new Set());
  const onboarding = useOnboarding(true);
  // Show release modal once per session (per new login), reset on new version
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const releaseVersion = RELEASES[0]?.version || "v1.28.4-stable";
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

  // v1.46.0: stats diturunkan dari cache query + normalisasi array (shape sama spt dulu).
  const stats = useMemo(
    () => ({
      totalPenjualan: 0,
      prevTotalPenjualan: 0,
      totalLaba: 0,
      prevTotalLaba: 0,
      suratPesananAktif: 0,
      stokLowExpired: 0,
      totalCustomer: 0,
      ...(statsRaw || {}),
      marginByChannel: Array.isArray(statsRaw?.marginByChannel)
        ? statsRaw.marginByChannel
        : [],
      topCategoryMargins: Array.isArray(statsRaw?.topCategoryMargins)
        ? statsRaw.topCategoryMargins
        : [],
      topCustomers: Array.isArray(statsRaw?.topCustomers)
        ? statsRaw.topCustomers
        : [],
      dailyNota30d: Array.isArray(statsRaw?.dailyNota30d)
        ? statsRaw.dailyNota30d
        : [],
      stockMovement30d: Array.isArray(statsRaw?.stockMovement30d)
        ? statsRaw.stockMovement30d
        : [],
    }),
    [statsRaw],
  );

  // Heatmap calendar state
  const [heatmapData, setHeatmapData] = useState([]);
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [dayNotas, setDayNotas] = useState([]);
  const [dayNotasLoading, setDayNotasLoading] = useState(false);
  // Insight: saran restock + customer lama gak order (rule-based / AI based)
  const [restockList, setRestockList] = useState([]);
  const [dormantList, setDormantList] = useState([]);
  // v1.54.0: pinjaman lewat batas pengembalian → banner warning
  const [overdueLoans, setOverdueLoans] = useState([]);
  const [insightLoading, setInsightLoading] = useState(true);
  // v1.55.0: auto-draft SP dari Saran Restock — grup per distributor termurah.
  // idle → confirm (tampil ringkasan) → saving → done/error
  const [spDraft, setSpDraft] = useState({ state: "idle", msg: "" });
  const handleAutoSp = async () => {
    const withDist = restockList.filter((r) => r.cheapest_distributor);
    if (!withDist.length) return;
    setSpDraft({ state: "saving", msg: "" });
    try {
      const groups = new Map();
      withDist.forEach((r) => {
        if (!groups.has(r.cheapest_distributor)) groups.set(r.cheapest_distributor, []);
        groups.get(r.cheapest_distributor).push(r);
      });
      const made = [];
      for (const [dist, items] of groups) {
        const { data } = await purchaseOrdersAPI.create({
          distributor_name: dist,
          notes: "Auto-draft dari Saran Restock (AI based) — cek qty sebelum dikirim",
          items: items.map((r) => ({
            product_name: r.name,
            qty: Math.max(1, Math.round(r.avg_order_qty || 1)),
            unit: r.order_unit || "pcs",
            unit_price: 0,
          })),
        });
        made.push(data?.po_number || dist);
      }
      setSpDraft({ state: "done", msg: `${made.length} SP draft dibuat` });
      setTimeout(() => navigate("/orders"), 1200);
    } catch (e) {
      setSpDraft({
        state: "error",
        msg: e.response?.data?.error || e.message || "Gagal membuat SP",
      });
    }
  };
  useEffect(() => {
    let cancelled = false;
    setInsightLoading(true);
    Promise.allSettled([
      insightsAPI.getRestock(),
      insightsAPI.getDormant(30),
      loansAPI.getAll(),
    ])
      .then(([r, d, l]) => {
        if (cancelled) return;
        setRestockList(r.status === "fulfilled" ? r.value.data?.items || [] : []);
        setDormantList(d.status === "fulfilled" ? d.value.data?.items || [] : []);
        const loans = l.status === "fulfilled" ? l.value.data || [] : [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        setOverdueLoans(
          loans.filter((loan) => {
            if (loan.status === "selesai" || !loan.due_date) return false;
            const sisa = (loan.items || []).reduce(
              (s, it) =>
                s +
                ((parseInt(it.qty) || 0) -
                  (parseInt(it.qty_returned) || 0) -
                  (parseInt(it.qty_purchased) || 0)),
              0,
            );
            if (sisa <= 0) return false;
            const due = new Date(String(loan.due_date).split("T")[0] + "T00:00:00");
            return due < today;
          }),
        );
      })
      .finally(() => {
        if (!cancelled) setInsightLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setHeatmapLoading(true);
    api
      .get(`/dashboard/heatmap?month=${heatmapMonth}`)
      .then(({ data }) => {
        if (!cancelled) setHeatmapData(Array.isArray(data) ? data : []);
      })
      .catch((e) => console.error("Failed to fetch heatmap", e))
      .finally(() => { if (!cancelled) setHeatmapLoading(false); });
    return () => { cancelled = true; };
  }, [heatmapMonth]);

  const handleDayClick = useCallback((day) => {
    if (selectedDay === day) { setSelectedDay(null); setDayNotas([]); return; }
    setSelectedDay(day);
    setDayNotasLoading(true);
    api
      .get(`/dashboard/daily-notas?date=${day}`)
      .then(({ data }) => setDayNotas(Array.isArray(data) ? data : []))
      .catch((e) => console.error("Failed to fetch day notas", e))
      .finally(() => setDayNotasLoading(false));
  }, [selectedDay]);

  const navigateHeatmapMonth = useCallback((delta) => {
    setSelectedDay(null);
    setDayNotas([]);
    setHeatmapMonth((prev) => {
      const [y, m] = prev.split("-").map(Number);
      const d = new Date(y, m - 1 + delta, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
  }, []);

  // v1.38.0: default buka detail tanggal HARI INI saat load (hanya bulan berjalan, sekali).
  const didInitDayRef = useRef(false);
  useEffect(() => {
    if (didInitDayRef.current || heatmapLoading) return;
    const now = new Date();
    const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    if (heatmapMonth !== curMonth) return;
    didInitDayRef.current = true;
    const todayStr = `${curMonth}-${String(now.getDate()).padStart(2, "0")}`;
    setSelectedDay(todayStr);
    setDayNotasLoading(true);
    api
      .get(`/dashboard/daily-notas?date=${todayStr}`)
      .then(({ data }) => setDayNotas(Array.isArray(data) ? data : []))
      .catch((e) => console.error("Failed to init day notas", e))
      .finally(() => setDayNotasLoading(false));
  }, [heatmapLoading, heatmapMonth]);

  // v1.46.0: weekly summary + dashboard stats kini via TanStack Query (hook di atas) —
  // di-cache & refresh diam-diam; tak perlu useEffect fetch manual lagi.

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
  // v1.58.0: sumbu grafik ikut BULAN terpilih (bukan 30-hari-terakhir hardcoded), biar
  // data bulan lama tampil benar. Bulan berjalan → dipotong sampai hari ini (tak ada
  // tanggal masa depan yg kosong menggantung).
  const buildStockMovementSeries = (rows = [], monthStr) => {
    const map = new Map(rows.map((row) => [String(row.day).slice(0, 10), row]));
    const [y, m] = monthStr.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const now = new Date();
    const isCur = y === now.getFullYear() && m === now.getMonth() + 1;
    const lastDay = isCur ? now.getDate() : daysInMonth;
    return Array.from({ length: lastDay }, (_, index) => {
      const d = index + 1;
      const date = new Date(y, m - 1, d);
      const key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
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
  const buildMonthCalendarSeries = (rows = [], monthStr) => {
    const map = new Map(rows.map((row) => [String(row.day).slice(0, 10), row]));
    const [y, m] = monthStr.split("-").map(Number);
    const firstDay = new Date(y, m - 1, 1);
    const daysInMonth = new Date(y, m, 0).getDate();
    // Sunday=0 in JS; we want Mon=0
    const offset = (firstDay.getDay() + 6) % 7;
    const cells = [];
    for (let i = 0; i < offset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const row = map.get(key) || {};
      const notaCount = parseInt(row.notaCount ?? 0) || 0;
      cells.push({
        day: key,
        dayLabel: String(d),
        notaCount,
        totalSales: parseFloat(row.totalSales ?? 0) || 0,
      });
    }
    return cells;
  };
  const monthCalendarSeries = buildMonthCalendarSeries(heatmapData, heatmapMonth);
  const maxHeatmapCount = Math.max(1, ...monthCalendarSeries.filter(Boolean).map((c) => c.notaCount));
  const heatmapMonthLabel = (() => {
    const [y, m] = heatmapMonth.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  })();
  const isCurrentMonth = (() => {
    const now = new Date();
    return heatmapMonth === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  })();
  // v1.58.0: label scope bulan — "bln ini" saat bulan berjalan (default, familiar utk
  // operator harian), atau nama bulan ("Juni 2026") saat kalender digeser ke bulan lain.
  const monthScopeShort = isCurrentMonth ? "bln ini" : heatmapMonthLabel;
  const monthScopeLong = isCurrentMonth ? "bulan ini" : heatmapMonthLabel;

  const stockMovementSeries = buildStockMovementSeries(stockMovementRows, heatmapMonth);
  const weeklySummary = weekly
    ? (() => {
        const revThis = Number(weekly?.revenue?.this_week) || 0;
        const revPrev = Number(weekly?.revenue?.prev_week) || 0;
        const revPct =
          revPrev > 0 ? ((revThis - revPrev) / revPrev) * 100 : null;
        const mThis = Number(weekly?.margin_pct?.this_week) || 0;
        const mPrev = Number(weekly?.margin_pct?.prev_week) || 0;
        const mDelta = Math.round((mThis - mPrev) * 10) / 10;
        const topUp = Array.isArray(weekly?.top_up) ? weekly.top_up : [];
        const topDown = Array.isArray(weekly?.top_down) ? weekly.top_down : [];
        const revUp = revPct === null ? null : revPct >= 0;
        const sentence =
          revThis === 0 && revPrev === 0
            ? "Belum ada penjualan tercatat dalam 14 hari terakhir."
            : [
                `Omzet minggu ini ${formatRupiah(revThis)}` +
                  (revPct === null
                    ? " (belum ada pembanding minggu lalu)."
                    : ` (${revUp ? "naik" : "turun"} ${Math.abs(revPct).toFixed(0)}% vs minggu lalu).`),
                `Margin produk ${mThis.toFixed(1)}%` +
                  (mDelta === 0
                    ? " (stabil)."
                    : ` (${mDelta > 0 ? "naik" : "turun"} ${Math.abs(mDelta).toFixed(1)} poin).`),
                topUp.length
                  ? `Naik daun: ${topUp.map((p) => p.name).slice(0, 2).join(", ")}.`
                  : "",
                topDown.length
                  ? `Melambat: ${topDown.map((p) => p.name).slice(0, 2).join(", ")}.`
                  : "",
              ]
                .filter(Boolean)
                .join(" ");
        return (
          <div>
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <Sparkles size={18} style={{ color: "var(--color-primary)" }} />
                <h2 className="text-lg font-bold" style={{ color: text }}>
                  Ringkasan Minggu Ini
                </h2>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: "var(--color-primary-soft)", color: "var(--color-primary)" }}>
                  AI based
                </span>
              </div>
              {/* Catatan Developer — pindah ke baris judul Ringkasan. v1.35.0 */}
              <button
                onClick={() => setShowDevNotes(true)}
                className="ui-motion-button ui-focus-ring flex items-center gap-2 px-3 py-1.5 rounded-full border border-blue-100 bg-blue-50/30 text-blue-600 hover:bg-blue-50 transition-colors shrink-0"
              >
                <Info size={15} />
                <span className="text-xs font-bold">Catatan Developer</span>
              </button>
            </div>
            <p
              className="text-sm font-medium mb-5"
              style={{ color: sub, lineHeight: 1.6 }}
            >
              {sentence}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div
                className="rounded-2xl p-4"
                style={{
                  backgroundColor: "var(--color-bg)",
                  border: `1px solid ${border}`,
                }}
              >
                <p className="text-xs font-semibold mb-1" style={{ color: sub }}>
                  Omzet 7 hari
                </p>
                <p className="text-xl font-bold" style={{ color: text }}>
                  {formatRupiah(revThis)}
                </p>
                {revPct !== null && (
                  <p
                    className="text-xs font-semibold mt-1"
                    style={{
                      color: revUp
                        ? "var(--color-success)"
                        : "var(--color-danger)",
                    }}
                  >
                    {revUp ? "▲" : "▼"} {Math.abs(revPct).toFixed(0)}% vs minggu lalu
                  </p>
                )}
              </div>
              <div
                className="rounded-2xl p-4"
                style={{
                  backgroundColor: "var(--color-bg)",
                  border: `1px solid ${border}`,
                }}
              >
                <p className="text-xs font-semibold mb-1" style={{ color: sub }}>
                  Margin produk
                </p>
                <p className="text-xl font-bold" style={{ color: text }}>
                  {mThis.toFixed(1)}%
                </p>
                {mDelta !== 0 && (
                  <p
                    className="text-xs font-semibold mt-1"
                    style={{
                      color:
                        mDelta > 0
                          ? "var(--color-success)"
                          : "var(--color-warning)",
                    }}
                  >
                    {mDelta > 0 ? "▲" : "▼"} {Math.abs(mDelta).toFixed(1)} poin
                  </p>
                )}
              </div>
              <div
                className="rounded-2xl p-4"
                style={{
                  backgroundColor: "var(--color-bg)",
                  border: `1px solid ${border}`,
                }}
              >
                <p className="text-xs font-semibold mb-1" style={{ color: sub }}>
                  Produk bergerak
                </p>
                {topUp.slice(0, 2).map((p) => (
                  <p
                    key={`up-${p.name}`}
                    className="text-xs font-medium truncate"
                    style={{ color: text }}
                  >
                    <span style={{ color: "var(--color-success)" }}>▲</span>{" "}
                    {p.name}
                  </p>
                ))}
                {topDown.slice(0, 2).map((p) => (
                  <p
                    key={`dn-${p.name}`}
                    className="text-xs font-medium truncate"
                    style={{ color: text }}
                  >
                    <span style={{ color: "var(--color-warning)" }}>▼</span>{" "}
                    {p.name}
                  </p>
                ))}
                {!topUp.length && !topDown.length && (
                  <p className="text-xs" style={{ color: sub }}>
                    Belum ada data
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })()
    : null;

  return (
    <div
      className="ui-motion-page font-sans min-h-screen transition-all duration-300"
      style={{
        width: "100%",
        maxWidth: "100%",
        padding: isMobile ? "1rem" : "2.5rem",
        paddingTop: isMobile ? "4rem" : "1rem",
        backgroundColor: isVantaMode ? "transparent" : bg,
        overflowX: "hidden",
      }}
    >
      {/* Header Stack — alignItems stretch override: .ui-toolbar set align-items:center
          yg bikin anak ke-center saat flex-col; stretch = full-width → judul kiri, version kanan */}
      <div
        className="ui-surface-panel ui-toolbar mb-4 flex flex-col gap-4 p-4 md:p-5"
        style={{ alignItems: "stretch" }}
      >
        {weeklySummary}

        {/* v1.54.0: pinjaman lewat batas pengembalian — banner warning klik → tab Pinjaman */}
        {overdueLoans.length > 0 && (
          <button
            onClick={() => navigate("/sales", { state: { loanTab: true } })}
            className="ui-motion-card w-full text-left rounded-2xl border p-3 flex items-center gap-3 flex-wrap"
            style={{
              backgroundColor: "var(--color-danger-soft)",
              borderColor: "var(--color-danger)",
              cursor: "pointer",
            }}
          >
            <span style={{ fontSize: "15px" }}>⚠️</span>
            <span className="text-xs font-bold" style={{ color: "var(--color-danger)" }}>
              {overdueLoans.length} pinjaman lewat batas pengembalian
            </span>
            <span className="text-[11px] truncate" style={{ color: "var(--color-danger)", opacity: 0.85 }}>
              {overdueLoans
                .slice(0, 3)
                .map((l) => `${l.customer_name} (${l.loan_number})`)
                .join(" · ")}
              {overdueLoans.length > 3 ? ` · +${overdueLoans.length - 3} lagi` : ""}
            </span>
            <span className="text-[11px] font-semibold ml-auto whitespace-nowrap" style={{ color: "var(--color-danger)" }}>
              Kelola →
            </span>
          </button>
        )}

        {/* Insight AI: Saran Restock + Customer Lama Gak Order — satu zona dgn ringkasan */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Saran Restock */}
          <div
            className="ui-motion-card rounded-2xl border p-4"
            style={{ backgroundColor: "var(--color-surface-elevated)", borderColor: border }}
          >
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span style={{ fontSize: "15px" }}>✨</span>
              <h3 className="text-sm font-bold" style={{ color: text }}>
                Saran Restock
              </h3>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: "var(--color-primary-soft)", color: "var(--color-primary)" }}>
                AI based
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* v1.55.0: auto-draft SP — grup produk per distributor termurah */}
              {restockList.some((r) => r.cheapest_distributor) &&
                (spDraft.state === "idle" || spDraft.state === "error" ? (
                  <button
                    onClick={() => setSpDraft({ state: "confirm", msg: "" })}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: "var(--color-success-soft)", color: "var(--color-success)" }}
                  >
                    📝 Draft SP otomatis
                  </button>
                ) : spDraft.state === "confirm" ? (
                  <span className="text-[11px] font-semibold flex items-center gap-1.5" style={{ color: text }}>
                    Buat SP draft utk{" "}
                    {new Set(restockList.filter((r) => r.cheapest_distributor).map((r) => r.cheapest_distributor)).size}{" "}
                    distributor?
                    <button onClick={handleAutoSp} className="px-2 py-0.5 rounded-full font-bold"
                      style={{ backgroundColor: "var(--color-success)", color: "#FFF" }}>
                      ✓ Ya
                    </button>
                    <button onClick={() => setSpDraft({ state: "idle", msg: "" })} className="px-2 py-0.5 rounded-full font-bold"
                      style={{ backgroundColor: "var(--color-bg-subtle)", color: text }}>
                      ✕
                    </button>
                  </span>
                ) : spDraft.state === "saving" ? (
                  <span className="text-[11px] font-semibold" style={{ color: sub }}>Membuat SP…</span>
                ) : (
                  <span className="text-[11px] font-bold" style={{ color: "var(--color-success)" }}>
                    ✓ {spDraft.msg} → Surat Pesanan
                  </span>
                ))}
              {spDraft.state === "error" && (
                <span className="text-[10.5px]" style={{ color: "var(--color-danger)" }}>{spDraft.msg}</span>
              )}
              <button onClick={() => navigate("/inventory")} className="text-xs font-semibold"
                style={{ color: "var(--color-primary)" }}>
                Lihat semua →
              </button>
            </div>
          </div>
          {insightLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 rounded-xl animate-pulse" style={{ backgroundColor: "var(--color-bg-subtle)" }} />
              ))}
            </div>
          ) : restockList.length === 0 ? (
            <p className="text-xs" style={{ color: sub }}>Semua stok aman 👍</p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {restockList.slice(0, 6).map((r) => (
                <button
                  key={r.product_id}
                  onClick={() => navigate("/inventory")}
                  className="w-full text-left px-3 py-2 rounded-xl border flex items-center justify-between gap-2"
                  style={{ borderColor: border, backgroundColor: "var(--color-surface-elevated)" }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="text-xs font-semibold truncate" style={{ color: text }}>{r.name}</div>
                    <div className="text-[10.5px]" style={{ color: sub }}>
                      stok {r.stock} · laku ~{r.velocity_per_day}/hari
                      {r.avg_order_qty ? ` · biasa order ${r.avg_order_qty} ${r.order_unit}` : ""}
                    </div>
                    {r.cheapest_distributor && (
                      <div className="text-[10.5px] font-semibold truncate" style={{ color: "var(--color-success)" }}>
                        🏷 termurah: {r.cheapest_distributor} · {formatRupiah(r.cheapest_hna)}/{r.base_unit || "pcs"}
                        {r.n_distributors > 1 ? ` (dari ${r.n_distributors} distributor)` : ""}
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap"
                    style={{
                      backgroundColor: r.days_left <= 3 ? "var(--color-danger-soft)" : "var(--color-warning-soft)",
                      color: r.days_left <= 3 ? "var(--color-danger)" : "var(--color-warning)",
                    }}>
                    ±{r.days_left} hari
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

          {/* Customer perlu follow-up (dormant + belum pernah order) */}
          <div
            className="ui-motion-card rounded-2xl border p-4"
            style={{ backgroundColor: "var(--color-surface-elevated)", borderColor: border }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span style={{ fontSize: "15px" }}>✨</span>
                <h3 className="text-sm font-bold" style={{ color: text }}>
                  Customer Perlu Follow-up
                </h3>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: "var(--color-primary-soft)", color: "var(--color-primary)" }}>
                  AI based
                </span>
              </div>
              <button onClick={() => navigate("/customers")} className="text-xs font-semibold"
                style={{ color: "var(--color-primary)" }}>
                Lihat semua →
              </button>
            </div>
            {insightLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-10 rounded-xl animate-pulse" style={{ backgroundColor: "var(--color-bg-subtle)" }} />
                ))}
              </div>
            ) : dormantList.length === 0 ? (
              <p className="text-xs" style={{ color: sub }}>Semua customer aktif 👍</p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {dormantList.slice(0, 8).map((d) => {
                  const isNever = d.type === "never";
                  const phone = normalizeIndonesianPhone(d.phone);
                  const msg = isNever
                    ? `Halo ${d.name}, perkenalkan kami dari CV Habil Sejahtera Bersama. Ada kebutuhan yang bisa kami bantu? Terima kasih 🙏`
                    : `Halo ${d.name}, sudah ${d.days_silent} hari sejak order terakhir di CV Habil Sejahtera Bersama${d.median_interval_days ? ` (biasanya tiap ${d.median_interval_days} hari)` : ""}. Ada yang bisa kami bantu untuk restok? Terima kasih 🙏`;
                  return (
                    <div
                      key={`${d.type}-${d.customer_id}`}
                      className="px-3 py-2 rounded-xl border flex items-center justify-between gap-2"
                      style={{ borderColor: border, backgroundColor: cardBg }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div className="text-xs font-semibold truncate flex items-center gap-1.5" style={{ color: text }}>
                          {d.name}
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap"
                            style={{
                              backgroundColor: isNever ? "var(--color-bg-subtle)" : "var(--color-warning-soft)",
                              color: isNever ? "var(--color-text-subtle)" : "var(--color-warning)",
                            }}>
                            {isNever ? "belum order" : `${d.days_silent} hari`}
                          </span>
                        </div>
                        <div className="text-[10.5px]" style={{ color: sub }}>
                          {isNever
                            ? "Belum ada order tercatat — follow-up baru"
                            : `${d.order_count}x order · ~${formatRupiah(d.avg_total)}`}
                        </div>
                      </div>
                      {phone ? (
                        <a
                          href={`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap"
                          style={{ backgroundColor: "var(--color-success-soft)", color: "var(--color-success)" }}
                        >
                          Chat WA
                        </a>
                      ) : (
                        <span className="text-[10px] px-2 py-1 rounded-full whitespace-nowrap" style={{ color: sub }}>
                          no HP
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPI ringkas — 1 kotak dibagi 4, ditaruh atas biar metrik penting langsung kebaca. v1.32.0 */}
      <div
        data-onboarding="kpi"
        className="ui-surface-panel ui-motion-card mb-4 grid grid-cols-2 lg:grid-cols-4 overflow-hidden rounded-3xl border shadow-sm"
        style={{ backgroundColor: cardBg, borderColor: border }}
      >
        {[
          {
            metric: "penjualan",
            label: `Total Penjualan ${monthScopeShort}`,
            value: stats.totalPenjualan,
            previousValue: stats.prevTotalPenjualan,
            type: "currency",
            tint: "green",
            icon: <Activity size={24} className="text-green-500" />,
            emptyHint: `Belum ada nota lunas ${monthScopeLong}.`,
          },
          {
            metric: "laba",
            label: `Laba Kotor ${monthScopeShort}`,
            value: stats.totalLaba,
            previousValue: stats.prevTotalLaba,
            type: "currency",
            tint: "blue",
            icon: <Activity size={24} className="text-blue-500" />,
            emptyHint: `Belum ada nota lunas ${monthScopeLong}.`,
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
          const delta = stat.metric === "laba" ? labaDelta : penjualanDelta;
          const showDelta = typeof stat.previousValue !== "undefined" && delta;
          return (
            <div
              key={i}
              className={`ui-hover-delight flex flex-col gap-1.5 p-4 md:p-5 ${
                i >= 2 ? "border-t lg:border-t-0" : ""
              } ${i % 2 === 1 ? "border-l" : ""} ${i >= 1 ? "lg:border-l" : ""}`}
              style={{ borderColor: border }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0 opacity-90">{stat.icon}</span>
                  <span
                    className="text-[11px] md:text-xs font-semibold truncate"
                    style={{ color: sub }}
                  >
                    {stat.label}
                  </span>
                </div>
                {showDelta && (
                  <div
                    className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold shrink-0"
                    style={{
                      color: delta.positive
                        ? "var(--color-success)"
                        : "var(--color-danger)",
                      backgroundColor: delta.positive
                        ? "var(--color-success-soft)"
                        : "var(--color-danger-soft)",
                    }}
                  >
                    <delta.icon size={11} />
                    <span>{delta.label}</span>
                  </div>
                )}
              </div>
              {loading ? (
                <Skeleton width="70%" height="28px" />
              ) : (
                <h3
                  className="text-lg md:text-2xl font-bold leading-tight"
                  style={{ color: text }}
                >
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
                <p className="text-[11px] font-medium" style={{ color: sub }}>
                  {stat.emptyHint}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Akses Cepat — di bawah Ringkasan & KPI. Tombol create navigate ke tab
          terkait + auto-buka modal create (state quickCreate). */}
      <div
        data-onboarding="quick-actions"
        className="ui-surface-panel ui-motion-card ui-hover-delight mb-4 rounded-3xl p-5 border shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4"
        style={{ backgroundColor: cardBg, borderColor: border }}
      >
        <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
          <h2 className="text-lg font-bold whitespace-nowrap" style={{ color: text }}>
            Akses Cepat
          </h2>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => navigate("/sales", { state: { quickCreate: true } })}
              className="ui-motion-button px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-1"
            >
              <Plus size={14} /> Buat Nota
            </button>
            <button
              onClick={() => navigate("/orders", { state: { quickCreate: true } })}
              className="ui-motion-button px-4 py-2 rounded-xl border text-xs font-semibold transition-all hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center gap-1"
              style={{ borderColor: border, color: text }}
            >
              <Plus size={14} /> Buat SP
            </button>
            <button
              onClick={() => navigate("/invoices", { state: { quickCreate: true } })}
              className="ui-motion-button px-4 py-2 rounded-xl border text-xs font-semibold transition-all hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center gap-1"
              style={{ borderColor: border, color: text }}
            >
              <Plus size={14} /> Buat Faktur Pembelian
            </button>
            <button
              onClick={() => navigate("/online-store")}
              className="ui-motion-button px-4 py-2 rounded-xl border text-xs font-semibold transition-all hover:bg-gray-50 dark:hover:bg-gray-800"
              style={{ borderColor: border, color: text }}
            >
              CSV Online
            </button>
          </div>
        </div>

        {/* Version & Release Notes — pindah ke baris Akses Cepat. v1.35.0 */}
        <button
          onClick={() => setShowModal(true)}
          className="ui-motion-button ui-focus-ring flex items-center gap-2 px-4 py-2 rounded-full border transition-colors hover:shadow-sm shrink-0"
          style={{ borderColor: border, color: text }}
        >
          <Info size={15} className="text-blue-500" />
          <span className="text-xs font-semibold">
            Version {RELEASES[0]?.version}
          </span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
            Release Notes
          </span>
        </button>
      </div>

      {/* Activity Heatmap */}
      <section
        className="ui-surface-panel ui-motion-card ui-hover-delight rounded-3xl p-6 border shadow-sm mb-4"
        style={{ backgroundColor: cardBg, borderColor: border }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-lg font-bold" style={{ color: text }}>
              Aktivitas Nota Harian
            </h2>
            <p className="text-xs font-medium mt-1" style={{ color: sub }}>
              {heatmapMonthLabel} · nota final
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigateHeatmapMonth(-1)}
              className="p-2 rounded-xl border transition-colors"
              style={{ borderColor: border, color: sub, backgroundColor: "transparent" }}
              title="Bulan sebelumnya"
            >
              <ChevronLeftIcon size={16} />
            </button>
            <button
              onClick={() => navigateHeatmapMonth(1)}
              disabled={isCurrentMonth}
              className="p-2 rounded-xl border transition-colors"
              style={{
                borderColor: border,
                color: sub,
                opacity: isCurrentMonth ? 0.35 : 1,
                backgroundColor: "transparent",
                cursor: isCurrentMonth ? "not-allowed" : "pointer",
              }}
              title="Bulan berikutnya"
            >
              <ChevronRightIcon size={16} />
            </button>
            <div
              className="p-3 rounded-xl ml-1"
              style={{ backgroundColor: "var(--color-primary-soft)", color: "var(--color-primary)" }}
            >
              <BarChart3 size={22} />
            </div>
          </div>
        </div>

        {/* Calendar + detail berdampingan (detail geser ke kanan saat tile diklik). v1.36.0 */}
        {/* v1.40.0: saat detail ditutup, kalender di-center biar tidak ada ruang kosong kanan */}
        <div
          style={{
            display: "flex",
            gap: "16px",
            alignItems: "flex-start",
            flexDirection: isMobile ? "column" : "row",
            justifyContent: !isMobile && !selectedDay ? "center" : "flex-start",
          }}
        >
        <div
          style={{
            flex: "1 1 0",
            minWidth: 0,
            width: "100%",
            maxWidth: isMobile ? "100%" : "720px",
          }}
        >
        {/* Day-of-week headers */}
        <div className="grid gap-2 mb-1" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
          {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((d) => (
            <div key={d} className="text-center text-[10px] font-semibold" style={{ color: sub }}>
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
          {heatmapLoading
            ? Array.from({ length: 35 }, (_, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-xl"
                  style={{ backgroundColor: isDarkMode ? "var(--color-surface-raised)" : "var(--color-bg-subtle)" }}
                />
              ))
            : monthCalendarSeries.map((cell, idx) => {
                if (!cell) {
                  return <div key={`pad-${idx}`} className="aspect-square" />;
                }
                const intensity = Math.max(0, Math.min(1, cell.notaCount / maxHeatmapCount));
                const fill = cell.notaCount
                  ? `color-mix(in srgb, var(--color-primary) ${Math.round(18 + intensity * 52)}%, transparent)`
                  : isDarkMode
                    ? "var(--color-surface-raised)"
                    : "var(--color-bg-subtle)";
                const isSelected = selectedDay === cell.day;
                return (
                  <button
                    key={cell.day}
                    onClick={() => handleDayClick(cell.day)}
                    title={`${cell.day} · ${cell.notaCount} nota`}
                    className="aspect-square rounded-xl border p-1.5 flex flex-col justify-between transition-all"
                    style={{
                      backgroundColor: fill,
                      borderColor: isSelected
                        ? "var(--color-primary)"
                        : cell.notaCount
                          ? "color-mix(in srgb, var(--color-primary) 26%, transparent)"
                          : border,
                      boxShadow: isSelected ? "0 0 0 2px var(--color-primary)" : undefined,
                      cursor: "pointer",
                    }}
                  >
                    <span className="text-[10px] font-semibold leading-none" style={{ color: cell.notaCount ? text : sub }}>
                      {cell.dayLabel}
                    </span>
                    {cell.notaCount > 0 && (
                      <span className="text-[11px] font-bold text-right leading-none" style={{ color: "var(--color-primary)" }}>
                        {cell.notaCount}
                      </span>
                    )}
                  </button>
                );
              })}
        </div>
        </div>

        {/* Day detail panel — geser ke kanan saat tile diklik. v1.36.0 */}
        {selectedDay && (
          <div
            style={{
              width: isMobile ? "100%" : "auto",
              flex: isMobile ? "none" : "1 1 300px",
              minWidth: 0,
              maxWidth: isMobile ? "100%" : "460px",
            }}
          >
          <div
            className="rounded-2xl border p-4"
            style={{ borderColor: "var(--color-primary-soft)", backgroundColor: isDarkMode ? "color-mix(in srgb, var(--color-primary) 8%, transparent)" : "var(--color-primary-soft)" }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold" style={{ color: text }}>
                {new Date(selectedDay + "T00:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" })}
              </span>
              <button onClick={() => { setSelectedDay(null); setDayNotas([]); }} style={{ color: sub }}>
                <X size={14} />
              </button>
            </div>
            {dayNotasLoading ? (
              <p className="text-xs" style={{ color: sub }}>Memuat...</p>
            ) : dayNotas.length === 0 ? (
              <p className="text-xs" style={{ color: sub }}>Tidak ada nota pada tanggal ini.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {dayNotas.map((n) => (
                  <div
                    key={n.notaNumber}
                    onClick={() =>
                      navigate("/sales", {
                        state: { editNotaNumber: n.notaNumber },
                      })
                    }
                    title={`Edit ${n.notaNumber}`}
                    className="ui-motion-button flex items-center justify-between gap-2 rounded-xl px-3 py-2 border"
                    style={{ borderColor: border, backgroundColor: cardBg, cursor: "pointer" }}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-semibold truncate" style={{ color: text }}>{n.notaNumber}</span>
                      <span className="text-[11px] truncate" style={{ color: sub }}>{n.customerName}</span>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <span className="text-xs font-semibold" style={{ color: text }}>{formatRupiah(n.total)}</span>
                      <span
                        className="text-[10px] font-semibold rounded px-1"
                        style={{
                          color: n.paymentStatus === "paid" ? "var(--color-success)" : "var(--color-warning)",
                          backgroundColor: n.paymentStatus === "paid"
                            ? "color-mix(in srgb, var(--color-success) 12%, transparent)"
                            : "color-mix(in srgb, var(--color-warning) 12%, transparent)",
                        }}
                      >
                        {n.paymentStatus === "paid" ? "Lunas" : "Belum"}
                      </span>
                    </div>
                  </div>
                ))}
                <p className="text-[11px] text-right mt-1" style={{ color: sub }}>
                  Total {dayNotas.length} nota · {formatRupiah(dayNotas.reduce((s, n) => s + n.total, 0))}
                </p>
              </div>
            )}
          </div>
          </div>
        )}
        </div>

        <div className="flex items-center justify-between gap-4 mt-4 text-xs font-medium flex-wrap" style={{ color: sub }}>
          <span>Klik tile untuk lihat detail · klik nota untuk edit</span>
          <span className="inline-flex items-center gap-2">
            <span style={{ color: sub }}>Sepi</span>
            <span className="w-3 h-3 rounded-md border" title="Tidak ada / sedikit nota" style={{ backgroundColor: isDarkMode ? "var(--color-surface-raised)" : "var(--color-bg-subtle)", borderColor: border }} />
            <span className="w-3 h-3 rounded-md border" title="Cukup banyak nota" style={{ backgroundColor: "color-mix(in srgb, var(--color-primary) 42%, transparent)", borderColor: "color-mix(in srgb, var(--color-primary) 30%, transparent)" }} />
            <span className="w-3 h-3 rounded-md border" title="Paling ramai nota" style={{ backgroundColor: "color-mix(in srgb, var(--color-primary) 72%, transparent)", borderColor: "color-mix(in srgb, var(--color-primary) 48%, transparent)" }} />
            <span style={{ color: sub }}>Ramai (makin ungu = makin banyak nota)</span>
          </span>
        </div>
      </section>

      {/* Profitability Snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-4">
        <section
          data-onboarding="chart"
          className="ui-surface-panel ui-motion-card ui-hover-delight rounded-3xl p-6 border shadow-sm"
          style={{ backgroundColor: cardBg, borderColor: border }}
        >
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="text-lg font-bold" style={{ color: text }}>
                Margin per Channel
              </h2>
              <p className="text-xs font-medium mt-1" style={{ color: sub }}>
                Nota lunas {monthScopeLong}
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
              title="Belum ada nota lunas bulan ini."
              description="Ringkasan performa akan muncul begitu ada transaksi final yang masuk ke bulan ini."
            />
          )}
        </section>

        <section
          className="ui-surface-panel ui-motion-card ui-hover-delight rounded-3xl p-6 border shadow-sm"
          style={{ backgroundColor: cardBg, borderColor: border }}
        >
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="text-lg font-bold" style={{ color: text }}>
                Top Kategori Margin
              </h2>
              <p className="text-xs font-medium mt-1" style={{ color: sub }}>
                Urutan kontribusi laba {monthScopeLong}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-4 items-start">
        <section
          className="ui-surface-panel ui-motion-card ui-hover-delight rounded-3xl p-6 border shadow-sm"
          style={{ backgroundColor: cardBg, borderColor: border }}
        >
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="text-lg font-bold" style={{ color: text }}>
                Top 5 Customer {isCurrentMonth ? "Bulan Ini" : heatmapMonthLabel}
              </h2>
              <p className="text-xs font-medium mt-1" style={{ color: sub }}>
                Berdasarkan total pembelian nota lunas
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
          className="ui-surface-panel ui-motion-card ui-hover-delight rounded-3xl p-6 border shadow-sm"
          style={{ backgroundColor: cardBg, borderColor: border }}
        >
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="text-lg font-bold" style={{ color: text }}>
                Pergerakan Stok {isCurrentMonth ? "Bulan Ini" : heatmapMonthLabel}
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

        {/* Manajemen Tugas — collapsible, default tutup (jarang dipakai → hemat tempat). v1.32.0 */}
        <div
          data-onboarding="tasks"
          className="ui-surface-panel ui-motion-card mb-4 min-w-0 overflow-hidden rounded-3xl border shadow-sm lg:col-span-2"
          style={{ borderColor: border }}
        >
          <button
            onClick={() => setTasksOpen((v) => !v)}
            aria-expanded={tasksOpen}
            className="ui-motion-button ui-focus-ring w-full flex items-center justify-between gap-3 p-5 md:p-6 text-left"
          >
            <div className="flex items-center gap-2">
              <ClipboardListIcon size={18} style={{ color: "var(--color-primary)" }} />
              <h2 className="text-lg font-bold" style={{ color: text }}>
                Manajemen Tugas
              </h2>
            </div>
            <span
              className="flex items-center gap-2 text-xs font-semibold"
              style={{ color: sub }}
            >
              {tasksOpen ? "Sembunyikan" : "Tampilkan"}
              <ChevronRightIcon
                size={18}
                style={{
                  transition: "transform 0.3s ease",
                  transform: tasksOpen ? "rotate(90deg)" : "rotate(0deg)",
                }}
              />
            </span>
          </button>
          <div
            style={{
              maxHeight: tasksOpen ? "3000px" : "0px",
              opacity: tasksOpen ? 1 : 0,
              overflow: "hidden",
              transition:
                "max-height 0.45s ease-in-out, opacity 0.3s ease-in-out",
            }}
          >
            <div className="px-5 md:px-8 pb-5 md:pb-8">
              <TasksKanban isDarkMode={isDarkMode} isMobile={isMobile} />
            </div>
          </div>
        </div>
      </div>


      {/* Auto-Release Popup v1.2.1 */}
      {showReleaseModal &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 transition-opacity">
            <div
              className="ui-surface-panel ui-motion-modal ui-modal-shell w-full max-w-[min(1040px,calc(100vw-32px))] max-h-[calc(100dvh-32px)] overflow-hidden rounded-3xl shadow-2xl flex flex-col transform transition-all scale-100"
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
                  className="ui-motion-button ui-focus-ring absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
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
              className="ui-surface-panel ui-motion-modal ui-modal-shell w-full max-w-[min(1040px,calc(100vw-32px))] max-h-[calc(100dvh-32px)] overflow-hidden rounded-3xl shadow-2xl flex flex-col"
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
                className="ui-motion-button ui-focus-ring w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
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
                      className="ui-surface-card ui-hover-delight rounded-2xl p-5 mb-4 border shadow-sm"
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
                                          : "var(--color-text-muted)",
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
                        className="ui-surface-card ui-motion-card rounded-2xl p-5 mb-3 border flex gap-4 items-start shadow-sm transition-transform hover:-translate-y-0.5"
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
                className="ui-motion-button ui-focus-ring min-h-10 px-6 py-2 rounded-xl bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>,
          document.body,
        )}
      {/* Developer Notes Modal */}
      {showDevNotes &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px] transition-opacity">
          <div
            className="ui-surface-panel ui-motion-modal ui-modal-shell w-full max-w-md overflow-hidden rounded-3xl shadow-2xl flex flex-col"
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
                className="ui-motion-button ui-focus-ring w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
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
        </div>,
        document.body,
      )}
    </div>
  );
}
