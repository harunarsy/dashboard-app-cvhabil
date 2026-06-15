# Changelog HABIL SUPERAPP

Semua perubahan signifikan pada Habil SuperApp akan dicatat di file ini.

## [v1.32.0-stable] - 2026-06-15

### Changed
- **Dashboard ditata ulang**: metrik utama (Total Penjualan, Laba Kotor, Surat Pesanan Aktif, Stok Low/Expired) digabung jadi satu kotak ringkas dibagi 4 di bagian atas agar langsung terbaca. Akses Cepat dipindah ke bawah ringkasan/KPI. Manajemen Tugas kini collapsible dengan animasi dan default tertutup (jarang dipakai → hemat ruang).

## [v1.31.0-stable] - 2026-06-15

### Added
- **Estimasi berat paket Nota Penjualan**: berat produk disimpan per satuan eceran di Inventory, berat kemasan bisa diisi per nota, total berat tersimpan sebagai snapshot, tampil live di form nota, dan ikut tercetak di PDF nota customer bila nilainya tersedia.

## [v1.30.0-stable] - 2026-06-15

### Added
- **Akses Cepat dipindah ke atas** (antara Ringkasan Minggu Ini & Manajemen Tugas) + tombol baru **Buat Faktur Pembelian**. Tombol Buat Nota/SP/Faktur sekarang langsung membuka form create di tab terkait (navigate + auto-open modal), bukan cuma pindah halaman.

### Changed
- Cache master data (customer/produk/distributor) dipersingkat dari 5 menit → **60 detik**, supaya perubahan data antar perangkat operator (Harun/Fivin/Ferry) lebih cepat sinkron.

### Fixed
- **Ringkasan Mingguan**: produk yang pernah di-rename (mis. Tropicana Slim Classic 160) tidak lagi kebaca 2x (naik + turun) karena beda penulisan nama snapshot lama vs master. Movers sekarang grup by nama canonical (master + alias); 7 alias produk lama yang kelewat saat rename Fase 0 sudah di-seed.
- **Customer CATUR LIMAS** yang hanya ada sebagai teks di 1 nota lama kini ditambahkan ke master + nota lama di-link, jadi muncul di dropdown Buat Nota.

## [v1.29.0-stable] - 2026-06-14

### Added
- **Halaman Finance**: hutang ke distributor & piutang dari customer dalam satu tampilan. Faktur belum lunas bisa ditandai lunas langsung dari sini. Khusus role direktur.
- **Export Excel laporan bulanan**: unduh Ringkasan + Nota Penjualan + Faktur Pembelian dalam satu file `.xlsx` langsung dari halaman Finance.
- **Heatmap kalender bulan penuh**: Aktivitas Nota Harian sekarang tampil per bulan dengan navigasi prev/next. Klik tile untuk lihat daftar nota lengkap hari itu beserta customer dan status bayar.

### Fixed
- Grafik Pergerakan Stok 30 Hari tidak lagi meledak oleh data outlier ONGKIR (qty 999.999) — query sekarang hanya hitung produk yang punya KODE.

## [v1.28.4-stable] - 2026-06-13

### Changed
- Saran Harga sekarang pakai pembulatan psikologis yang lebih halus untuk rentang harga kecil, jadi BEP/Laba Tipis/Laba Sehat/Aman Promo tidak lagi jatuh ke angka yang sama terus.
- Tiap kartu saran harga kini bisa diklik langsung untuk memakai tier itu, bukan cuma tombol bawah.

## [v1.28.3-stable] - 2026-06-13

### Changed
- Row Inventory dan detail drawer sekarang baca HNA/HPP dari batch aktif terbaru, jadi batch baru langsung kelihatan di list walau `product_master.hna` masih kosong.
- Refresh inventory setelah batch mutasi juga ikut narik insight stack, supaya Saran Restock tidak stale.

## [v1.28.2-stable] - 2026-06-13

### Changed
- Daftar Harga tidak lagi menutup backdrop Vanta dengan lapisan abu-abu; halaman jadi transparan saat mode backdrop aktif, jadi UI belakangnya lebih menyatu.

## [v1.28.1-stable] - 2026-06-13

### Changed
- Ringkasan Minggu Ini sekarang menyatu ke stack header Dashboard, jadi bukan card terpisah lagi di bawah board tugas.

## [v1.28.0-stable] - 2026-06-13

### Added — Mini AI (rule-based, tanpa API eksternal)
- **#7 Ringkasan Minggu Ini (Dashboard)**: kartu omzet & margin 7 hari terakhir vs minggu sebelumnya + produk naik-daun/melambat, dirangkai jadi kalimat. Endpoint `GET /api/insights/weekly-summary`.
- **#2 Saran Restock (Stok)**: prediksi habis stok dari kecepatan jual (blend 30d/90d base-pcs) → "habis ±N hari · biasa order M". Endpoint `GET /api/insights/restock`.
- **#9 Skor Kesehatan Produk A–E (Stok)**: bobot perputaran 30 + margin 30 + tren 20 + risiko ED 20. Badge + tooltip rincian. Endpoint `GET /api/insights/product-health`.
- **#5 Radar Customer Hilang (Customer)**: customer yang lewat 2× interval order normal (median interval via LAG + PERCENTILE_CONT) + tombol WA follow-up. Endpoint `GET /api/insights/churn`.
- **#10 Sering Dibeli Bersama (Nota)**: market-basket self-join 180 hari → chip "+ produk (confidence%)" 1-klik tambah. Endpoint `GET /api/insights/copurchase`.
- **#3 Deteksi Anomali Input**: qty nota tak biasa (z-score, `GET /api/insights/baselines/sales`) & HNA faktur menyimpang >40% dari median (`GET /api/insights/baselines/purchase`) — warning non-blocking.
- **#1 Penjaga Harga Rugi (Nota)**: konfirmasi modal sebelum simpan kalau ada item dijual di bawah HPP.

### Backend
- Route baru `routes/insights.js` (auth, parameterized, satu query efisien/endpoint, formula HPP `unitHppCostSql` konsisten dashboard.js).
- `sales_orders.settlement_amount` (idempotent ALTER) sebagai fondasi #6 Fee Marketplace Belajar — endpoint `GET /api/insights/effective-fees` siap; UI input settlement + saran fee ditunda (nota belum per-platform).

### Safety
- Semua fitur non-blocking, read-only kecuali kolom baru idempotent. Tidak menyentuh stok, batch, FEFO, HNA/HPP/PPN, payload simpan inti, atau generator PDF.

## [v1.27.0-stable] - 2026-06-13

### Added
- **Mini AI awal di Nota Penjualan**: form Nota sekarang punya warning non-blocking kalau harga jual berada di bawah HPP atau margin terlalu tipis, sehingga operator bisa koreksi sebelum simpan tanpa mengubah flow lama.
- **Insight customer “Biasanya Beli”**: ketika customer dipilih, form menampilkan produk yang sering dibeli berdasarkan riwayat penjualan. Chip bisa diklik untuk prefill baris produk lewat jalur batch/HPP existing.
- **Draft pesan WhatsApp**: form Nota menyediakan tombol salin draft WA dan buka WhatsApp dari ringkasan nota saat ini.
- **Endpoint insight read-only**: tambah `GET /api/insights/customer/:id` yang auth-protected dan parameterized untuk riwayat pembelian customer.

### Safety
- Semua fitur Mini AI v1.27.0 bersifat non-blocking dan tidak mengubah payload simpan Nota, stok, batch, FEFO, HNA/HPP/PPN, atau generator PDF.

## [v1.26.2-stable] - 2026-06-13

### Changed
- **Upcoming Features audit**: item roadmap di popup Changelog & Roadmap dibuat lebih spesifik. Export PDF/Excel tidak lagi ditulis generik karena sebagian export sudah ada; gap yang tersisa sekarang disebut sebagai **Export Excel laporan bulanan profesional**.
- **Roadmap rules untuk agent berikutnya**: tambah `docs/UPCOMING_FEATURES_RULES.md` agar setiap AI yang bump versi wajib mengecek `upcoming`, memindahkan fitur shipped ke `RELEASES`, dan tidak meninggalkan roadmap yang misleading.

## [v1.26.1-stable] - 2026-06-13

### Changed
- **Daftar Harga UI recovery**: tabel desktop dibuat lebih lega dan scannable, input harga per saluran minimal 44px, tombol ✨ saran harga dan 🕘 riwayat lebih konsisten, header/toolbar dibuat surface solid agar light/dark tetap terbaca.
- **Modal Biaya Admin lebih usable**: modal sekarang centered, tinggi dibatasi `calc(100dvh - 32px)`, isi scroll sendiri, profil fee tampil sebagai kartu 2 kolom di desktop / 1 kolom di mobile, field fee lebih besar, dan status "belum disimpan" terlihat jelas per profil.

## [v1.26.0-stable] - 2026-06-13

### Added
- **Harga per saluran di Daftar Harga**: `price_list_entries` +kolom `channel` (offline/shopee/tokopedia_tiktok, default offline — data lama otomatis jadi offline) + index `(product_id, channel, effective_date DESC, id DESC)`. GET `/api/price-list` mengembalikan harga terkini per 3 saluran (window function rn=1 per channel); PUT menerima `channel` dan idempoten per saluran; history menyertakan channel.
- **UI 3 kolom harga inline**: tiap saluran = kotak isian langsung di tabel (Enter = simpan, efektif otomatis hari ini; Escape = batal; border biru = belum disimpan). Hint di bawah harga online: perkiraan **bersih setelah fee efektif** marketplace + margin vs HPP (hijau/merah). Tombol ✨ per saluran membuka SuggestDrawer dengan platform preset, "Pakai harga" langsung tersimpan ke saluran itu. Tombol 🕘 per produk = modal riwayat harga semua saluran.
- **✨ Harga Pintar (form nota)**: pilih produk → harga jual auto-isi dari Daftar Harga sesuai saluran nota (offline→offline; online→shopee, fallback tokopedia_tiktok) + toast sumber harga; fallback tetap `sell_price` master.

### Changed
- Daftar Harga dirapikan mengikuti design language halaman Nota/Faktur: pill status berwarna di header (✓ hijau sudah di-set, ⏳ amber belum), kode produk monospace biru, header kategori pakai `--color-primary-soft`, tombol Cetak A4 bergaya pill + shadow, toolbar hint "Enter untuk simpan". Update harga tanpa refetch penuh (state lokal).

## [v1.25.1-stable] - 2026-06-13

### Added
- **Metode pembayaran "Kartu Kredit" + fee EDC di nota**: kolom baru `sales_orders.payment_fee_rate/payment_fee_mode/payment_fee`. Dua mode: **absorb** (harga customer tetap; `fee = total × r` dipotong dari `gross_profit` payload + snapshot AUDIT-LS-06; TIDAK tampil di nota) dan **pass_on** (tagihan di-gross-up `fee = total × r/(1−r)` supaya net yang diterima tetap = total — margin utuh; baris "Biaya Kartu Kredit" tercetak di PDF & preview, TANPA PPN, `productTotal = total − ongkir − ccFee`).
- Form nota: opsi "Kartu Kredit" → panel fee (persen prefill dari fee profile `offline/credit_card` di Biaya Admin, bisa diubah per nota) + toggle "Potong margin"/"Bebankan ke customer" + kalkulasi live "customer bayar X / margin terpotong Y".
- Breakdown margin expand & `computeNotaMargin` ikut motong fee absorb (pass_on netral); Dashboard `qTotalLaba`/`qPrevLaba` minus fee absorb (konsisten snapshot).
- NotaPreview: blok total kini menampilkan baris **Ongkir** (dulu preview hanya total produk) + baris Biaya Kartu Kredit saat pass_on; terbilang pakai total bayar penuh.

## [v1.25.0-stable] - 2026-06-13

### Added
- **Pricing engine — Saran Harga per marketplace** (`backend/utils/pricingEngine.js`, pure + 36 unit test `scripts/test-pricing-engine.js`): rumus `recommended = (hpp_total + packing_fee + target_profit + fixed_order_fee) / (1 − total_variable_fee_rate)`; mode fee **effective** (pakai `safe_effective_fee_rate` dari riwayat, `fixed_order_fee` dipaksa 0 — anti double-count) vs **official** (admin_rate + service_rate + fixed); output: harga BEP / laba tipis (+5%) / laba sehat (+15%) / aman promo, pembulatan psikologis selalu ke atas (…900: 49.900, 54.900, 129.900), estimasi penghasilan bersih + laba + margin %, warning laba negatif & warning rugi saat campaign/voucher boost (Tokopedia/TikTok dihitung pakai rate boost 32%).
- **Tabel `marketplace_fee_profiles`** (seed 8 profil: Shopee F&B 18,5% / Shopee Kesehatan 19,5% / Shopee umum 20% / Tokopedia-TikTok 19% / voucher boost 32% / offline tunai 0% / QRIS 0,7% / kartu kredit EDC 2,5%): fee bisa diedit dari dashboard (tombol **⚙️ Biaya Admin** di Daftar Harga), kolom `source` menyimpan asal angka (official / historical_order / manual_override) dengan prioritas resolve historical > manual > official; seed `ON CONFLICT DO NOTHING` supaya edit admin tidak ketimpa cold start.
- **Drawer "✨ Saran"** di Daftar Harga: pilih marketplace, isi bundle + biaya packing + biaya promo opsional (diskon toko/affiliate/campaign %), hasil real-time (debounce 350ms), tombol "Pakai harga" langsung mengisi form Set Harga. Endpoint `POST /api/price-list/recommend` + `GET/PUT /api/price-list/fee-profiles`.
- `utils/pricingEngine.applyPaymentFee()`: helper fee metode bayar (kartu kredit dkk) mode `absorb` (margin dipotong) vs `pass_on` (tagihan di-gross-up supaya net utuh) — disiapkan untuk integrasi pembayaran berikutnya.

### Changed
- **Daftar Harga revamp**: produk dikelompokkan per kategori (header section + jumlah), header tabel sticky, kolom kosong tidak lagi penuh "—" ("belum ada pembelian"/"belum di-set"), badge margin Rp + %, filter cepat "X belum di-set", tombol aksi per baris dirapikan (Set Harga + ✨ Saran). Mobile: tampil sebagai kartu per produk, drawer full-screen.
- **Mobile Buat Nota**: Form dan Preview jadi 2 tab di layar < 768px — preview tidak lagi menutupi/menggencet kolom isian saat keyboard muncul; preview non-sticky di mobile.
- **Mobile daftar nota**: 5 dropdown filter dilipat ke tombol "⚙ Filter" (badge jumlah filter aktif) → grid 2 kolom full-width; desktop tidak berubah (`display: contents`).

### Performance
- `useIsMobile` debounce 150ms (iOS Safari fire `resize` puluhan kali saat scroll/zoom → re-render seluruh app per fire).
- `@keyframes ui-field-error-in` ganti `max-height` → `clip-path` (animasi GPU-only, hilangkan layout thrash).
- `GET /api/price-list` ditulis ulang: 3 LATERAL subquery per produk → CTE `DISTINCT ON` + window function `ROW_NUMBER()` (satu pass).
- Pool PG `max: 5` saat berjalan di Vercel (per-instance; cegah total koneksi semua instance warm melewati limit Neon); lokal tetap 20.
- Index baru: `sales_orders(is_deleted, status, sale_date DESC)`, `invoice_items(invoice_id)`, `inventory_mutations(product_id, created_at DESC)`.
- `generatePriceListPDF` jadi dynamic import — jsPDF tidak ikut bundle awal halaman Daftar Harga.

## [v1.24.0-stable] - 2026-06-12

### Added
- **Menu "Daftar Harga"** (sidebar, ikon Tags, route `/price-list`): semua produk aktif dari Inventory dengan **HPP pembelian terakhir** (batch terbaru by `created_at`, tax-aware via `hppForBatch`) sebagai acuan, **harga jual bisa di-set inline** per produk + **tanggal berlaku** (`effective_date`), margin live (harga − HPP). Riwayat perubahan harga tersimpan append-only di tabel baru `price_list_entries` — harga sebelumnya tampil di bawah harga aktif; endpoint `GET /api/price-list/:id/history` tersedia.
- **Cetak A4**: tombol "Cetak A4" → PDF portrait (`generatePriceListPDF`) siap print: header CV + NPWP + alamat + "Berlaku per <tanggal efektif terbaru>", kolom No/Kode/Nama/Harga Eceran/Harga Karton (dari `sell_price_pack`). **Tanpa HPP/margin** — dokumen customer-facing. Produk tanpa harga otomatis dilewati; mengikuti filter pencarian aktif.
- Backend: route baru `/api/price-list` (`backend/routes/priceList.js`), PUT idempotent (harga+tanggal sama → tidak menambah baris riwayat).

## [v1.23.2-stable] - 2026-06-12

### Fixed
- **Edit Nota karton mental jadi pcs**: form Edit Nota sekarang memuat jumlah dari `qty_in_unit` (qty yang user input), bukan `qty` basis pcs. Contoh Omela: 3 karton tersimpan sebagai 36 pcs di stok, tapi saat edit ulang tetap tampil 3 karton — bukan 36 karton. Helper margin list juga distandardkan agar uang dihitung dengan qty satuan jual.

## [v1.23.1-stable] - 2026-06-12

### Fixed
- **HPP karton ketimpa per-pcs saat Edit Nota**: re-match batch di `openEdit` menimpa `unit_hpp` dengan `batch.hna` (per pcs) tanpa mengalikan `pack_size` saat unit nota karton → HPP Omela 1 L tampil 15.486 padahal per karton 185.832; kalau disimpan, gross_profit ikut korup. Sekarang dikali `pack_size`; synthetic legacy batch disimpan per-pcs (dibagi `pack_size`) supaya re-pilih dari dropdown tidak double-scale.
- **Dashboard omzet/margin item karton melenceng 12×**: semua query revenue/margin di `dashboard.js` mengalikan `si.qty` (basis pcs) × `si.unit_price` (per satuan jual). Sekarang `COALESCE(si.qty_in_unit, si.qty)`. Berlaku ke Laba Kotor bln ini, Margin per Channel, Top Kategori.
- **Margin di daftar nota (expand)**: per-item & total pakai `qty_in_unit` (dulu qty basis pcs × harga per karton).
- **Data repair**: 4 sales_items FRISIAN FLAG OMELA karton lama menyimpan `unit_hpp` = 185.832 (nilai inc-PPN) → dibetulkan ke HNA 167.416,20 (batch.hna × 12) + `gross_profit` nota terkait dihitung ulang (2605026: 26.168; 2606005: 181.680; 2606006: 14.168; 2606018: 52.336).

## [v1.23.0-stable] - 2026-06-12

### Added
- **Draft otomatis form Buat Nota** (mirror draft faktur): autosave debounced ke tabel baru `form_drafts` (UNIQUE `doc_type+owner_id`, upsert tunggal), banner "Pulihkan Draft / Hapus Draft" di halaman Nota. Draft = form WIP murni — tanpa nomor nota, tanpa potong stok, tak tampil di list/Dashboard.
- **No. HP customer di nota**: field baru di form (atas Alamat, prefill dari master), tampil berlabel `No. HP:` + `Alamat:` di preview & PDF nota. Nomor/alamat yang diisi di nota **auto-sync balik ke master Customer** (`syncCustomerContact` post-COMMIT; field kosong tidak menimpa data lama).
- **NPWP CV (93.813.949.0-609.000)** di bawah nama perusahaan pada semua dokumen keluar: preview nota, PDF nota/tanda terima, preview SP, PDF SP. Bisa dioverride via `settings.npwp`.

### Fixed
- **Nota LUNAS hilang dari Dashboard**: status dokumen 'draft' lama bersifat accidental (default DB; 'final' cuma ke-set saat nota diedit) sementara Dashboard memfilter `paid AND final`. Sekarang nota tersimpan = dokumen sah: POST INSERT `status='final'` eksplisit, PUT default `'final'`, kolom default diganti, backfill one-time `sales_orders_status_final_v1`. Kolom "Status Doc" dihapus dari list (selalu Final = noise).
- **Selisih misterius Total Margin Nota**: baris ongkir di breakdown margin dulu hanya muncul kalau ongkir ditagih > 0 — padahal biaya kurir tanpa ongkir ditagih tetap memotong margin. Sekarang muncul kalau salah satunya > 0, format "Ongkir (ditagih X − biaya Y)".
- **PDF nota — alamat panjang**: alamat di-wrap (`splitTextToSize`) dan `tableStartY` dinamis mengikuti tinggi blok customer, tidak lagi berisiko ketumpuk tabel.

### Changed
- **Optimasi draft faktur**: penyimpanan pindah dari baris palsu `is_draft=TRUE` di tabel `invoices` (transaksi FOR UPDATE tiap save) ke `form_drafts` upsert tunggal; draft lama dimigrasi + dibersihkan (runOnce `form_drafts_migrate_v1`). Autosave kini skip mode edit (dulu Edit Faktur ikut menimpa draft form baru!), skip form kosong, dan skip kalau isi tidak berubah.
- Label Dashboard "paid/final" → "nota lunas"; hint kartu Customer kondisional ("Lengkapi no. HP" / "Lengkapi alamat" / keduanya); icon sidebar: Faktur Pembelian = ReceiptText, Surat Pesanan = ClipboardList, Inventory = Boxes, Pengaturan = Settings (gear).

## [v1.22.4-stable] - 2026-06-12

### Fixed
- **Form Buat Nota — kolom Harga ketutupan preview**: nama produk panjang (nowrap di MasterSelect) memaksa kolom Nama melar melebihi pane form, mendorong kolom Harga ke bawah panel Preview Live. Root fix: wrapper MasterSelect `minWidth: 0` (berlaku semua call site: nota, SP, faktur, dashboard, inventory) + grid baris produk Nota & SP pakai `minmax(0, 2fr)` supaya kolom nama menyusut dan teks terpotong ellipsis.
- **Header kolom form Nota misaligned**: header pakai lebar Unit 45px sementara baris input 70px — disinkronkan 70px.

## [v1.22.3-stable] - 2026-06-12

### Fixed (audit menyeluruh — 3 auditor paralel: Code/Arch, Logic/Security, UI/UX)
- **🔴 LS-01**: overwrite faktur via POST (re-submit/double-click) tidak lagi memposting stok dobel — guard `alreadyPosted` mirror PUT; item berubah pada faktur posted → 400.
- **🔴 LS-02**: HNA batch tidak lagi menggelembung saat qty faktur di-clamp room SP — pembagi `effectiveHna` selalu qty penuh baris.
- **🔴 UX-01**: HPP batch asal pembelian Nota di Inventory/ProductDrawer tampil tanpa ×1,11 (`hppForBatch` tax-aware) + label dinamis.
- **🟠**: tax_type menjalar ke `invoice_items` + `inventory_batches` saat diubah di edit faktur (LS-03); faktur Nota linked SP backfill harga beli + tax_type ke batch purchase (LS-04); permanent delete faktur mengembalikan room SP & ditolak bila batch sudah dipakai nota (LS-05); `gross_profit` nota dihitung dari tax_type batch aktual (LS-06); validasi sales/PUT pindah sebelum BEGIN — tidak ada lagi koneksi idle-in-transaction (CA-01); Dashboard `/stats` 13 query paralel `Promise.all` (CA-02); backfill ensureSchema jadi one-time via `schema_meta` (CA-03); stock-out manual FEFO pakai `FOR UPDATE` (CA-04); toast error kini merah + `role=alert` di semua halaman (UX-02/09); hapus permanen faktur & hapus batch ber-stok pakai ConfirmModal (UX-03); MasterSelect bisa keyboard (UX-04); label HPP form faktur mode Nota + badge NOTA di list (UX-05); fetch gagal menampilkan error, bukan empty-state palsu (UX-06).
- **🟡**: validasi qty/harga backend semua jalur tulis (LS-09); nama produk kembar diblokir 409 (LS-10); `trust proxy` Vercel (LS-11); fefo-hna & selected-batch filter `is_active` + tax_type (LS-07/08); JWT default 15m (LS-13); `received_qty` SP carry-over server-side saat edit (CA-09); limit produk 2000 & LIMIT GET SP (CA-10/12); dedup ALTER tax_type + CREATE document_counters (CA-08); dedup blok stock-in identik (CA-06); input uang `min=0` (UX-08); toast PO clearTimeout (UX-13).

## [v1.22.2-stable] - 2026-06-11

### Added
- **Alias produk otomatis (invisible)**: tabel `product_aliases` dengan unique index pada nama ternormalisasi (1 alias = tepat 1 produk). Resolver faktur (lookup batch + by-id-or-name), nota penjualan, dan SP sekarang ikut mengecek alias setelah nama master.
- **Auto-seed alias**: (a) rename produk di Inventory / katalog faktur → nama lama tersimpan sebagai alias; (b) faktur tersimpan dengan nama item ≠ nama master (match via id/alias) → nama versi distributor tersimpan sebagai alias (post-commit, gagal seed tidak mengganggu faktur). Guard: alias ditolak jika bentrok dengan nama master aktif.

## [v1.22.1-stable] - 2026-06-11

### Changed
- Surat Pesanan: picker produk di form SP menampilkan `KODE — Nama` dan menyimpan `product_id` saat dipilih dari master (konsisten dengan Faktur Pembelian).
- Faktur linked SP: fallback pencocokan by-nama di `pickPurchaseOrderItem` difilter — hanya untuk PO item legacy tanpa `product_id` atau yang `product_id`-nya sama, mencegah qty SP produk lain yang kebetulan senama ikut terpotong.

## [v1.22.0-stable] - 2026-06-11

### Added
- Pembelian kini dibedakan **Faktur** (ada PPN masukan 11%) vs **Nota** (tanpa PPN) via toggle di form Faktur Pembelian. Mode Nota: PPN masukan `0`, HPP = harga beli apa adanya (tanpa ×1,11), batch inventory menyimpan harga beli riil dengan `tax_type='nota'`, dan `product_master.hna` tidak di-overwrite. Mode Faktur: perilaku lama tidak berubah.
- Jalur cost end-to-end ikut sadar `tax_type`: `sales_items.unit_hpp_tax_type` di-snapshot dari batch terpilih/FEFO saat nota penjualan dibuat, Dashboard (Total Laba, margin per channel/kategori) menghitung cost per item sesuai tipe pajaknya, dan UI nota penjualan (margin, kolom HPP, dropdown batch) menampilkan HPP nota tanpa ×1,11. Data lama default `faktur` — tidak ada perubahan angka untuk transaksi existing.

## [v1.21.20-stable] - 2026-06-11

### Fixed
- Faktur Pembelian: produk yang belum dikenali master Inventory sekarang ditolak dengan HTTP `422` sebelum invoice/items/stok disimpan. UI menampilkan daftar produk bermasalah dan tidak lagi memberi pesan "tersimpan" ketika stok akan skip diam-diam.

## [v1.21.19-stable] - 2026-06-11

### Changed
- Faktur Pembelian: picker produk sekarang mengambil data dari master Inventory (`id`, `code`, `name`) dan menampilkan `KODE — Nama`. Saat operator memilih produk master, payload faktur mengirim `product_id` sehingga stok/HPP masuk ke produk yang benar. Input nama bebas tetap tersedia sementara untuk data distributor yang belum dipetakan.

## [v1.21.18-stable] - 2026-06-11

### Changed
- Produk (tambah/edit): **KODE wajib & unik** (Fase 1a fondasi identitas by-KODE). `inventory.js` POST/PUT memvalidasi `code` non-kosong + cek duplikat `UPPER(TRIM(code))` (exclude self saat PUT) → balas 409 bila bentrok; kode dinormalisasi uppercase saat simpan. Form `InventoryDashboard`: field Kode ditandai wajib (*), auto-uppercase, validasi sisi klien sebelum submit. Mencegah produk tanpa identitas → prasyarat matching by-KODE/ID, gate anti stok-hilang, dan alias di fase berikutnya.

## [v1.21.17-stable] - 2026-06-11

### Added
- Inventory: **pagination** pada daftar produk. Pemilih ukuran halaman 10 / 20 / 50 (default 10) + kontrol Prev/Next dan info "X–Y dari Z" di bawah tabel. `InventoryDashboard`: state `pageSize`/`currentPage`, `paged = filtered.slice(...)`, `useEffect` reset ke halaman 1 saat `debouncedSearch`/`statusFilter`/`pageSize` berubah. "Pilih semua" tetap mengacu seluruh hasil filter.

### Changed
- Data (Fase 0 — fondasi identitas by-KODE): seluruh produk inventory dirapikan namanya + diberi **KODE unik** (skema `BRAND-VARIAN-UKURAN`, mis. `ENTMX-VAN-555G`). 50 produk di-rename + diberi kode (sinkron `product_master` + `product_catalog` + `invoice_items`), 1 produk (TS Strawberry Jam) diaktifkan kembali, dan 27 produk baru ditambahkan (stok 0, `sell_price` 0, satuan `pcs` — harga menyusul). Produk ONGKIR legacy tidak disentuh. Total 79 produk, semua aktif ber-KODE (kecuali ONGKIR). Menyiapkan fase berikutnya: matching by-KODE/ID, gate anti stok-hilang, toggle Faktur/Nota (PPN vs non-PPN), SP by-ID, dan alias nama distributor.

## [v1.21.16-stable] - 2026-06-10

### Fixed
- Dashboard "Total Laba": kini menyertakan untung/rugi ongkir (`SUM(ongkir − ongkir_cost)`) agar konsisten dengan "Total Penjualan" yang sudah memuat ongkir. Sebelumnya laba hanya dari margin produk (`sales_items`) sehingga ongkir menaikkan pemasukan tapi tidak laba. `total_laba` + `prev_total_laba` di `dashboard.js` ditambah subquery ongkir yang di-scope per-order (tidak terkali jumlah item). Breakdown channel/kategori tetap product-level (ongkir tidak punya kategori).

## [v1.21.15-stable] - 2026-06-10

### Fixed
- Nota Penjualan: "Total Margin Nota" di list sekarang menyertakan untung ongkir (`ongkir − ongkir_cost`), sebelumnya hanya margin produk (inline `items.reduce` tidak ikut ongkir). Ditambah baris ongkir terpisah pada footer margin.
- Data: sinkron semua batch DIANERAL 180G aktif ke HNA 30.096,57 (HPP 33.407,19). Batch dari invoice-122 (faktur 29.05) tersimpan 30.324 (HPP 33.659,64) karena tidak menerapkan diskon COD 0,75% → menyebabkan HPP tidak konsisten antar batch + nota mengambil HPP terlalu tinggi via FEFO. Snapshot HPP & gross_profit nota terdampak (HSB-NOTA-2606019) ikut dikoreksi.

## [v1.21.14-stable] - 2026-06-10

### Added
- Nota Penjualan: fitur **ongkir nota-level**. Dua kolom baru di `sales_orders`: `ongkir` (ditagih ke customer, masuk total + muncul di PDF nota) dan `ongkir_cost` (biaya kurir asli, internal, untuk hitung untung — TIDAK muncul di nota). `total += ongkir`; `gross_profit += (ongkir − ongkir_cost)` → mendukung kirim sendiri (untung), pihak ketiga (impas), dan subsidi ongkir (motong margin). PDF: ongkir baris terpisah, TIDAK kena PPN (DPP/PPN tetap dihitung dari nilai produk saja). Produk "ONGKIR" lama disembunyikan dari pemilih produk nota; nota lama yang masih memakai produk ONGKIR dibiarkan utuh (non-destruktif).

## [v1.21.13-stable] - 2026-06-10

### Fixed
- Faktur Pembelian: update status pembayaran (Sudah/Belum Bayar) untuk faktur yang sudah jadi stok tidak lagi tertolak. Root cause: `invoiceItemsChanged` membandingkan nilai uang dengan 4 desimal padahal kolom DB `DECIMAL(15,2)` membulatkan ke 2 desimal (mis. hna_baru 314176.875 vs tersimpan 314176.88) → false-positive "items changed". Sekarang field uang (hna/hna_baru/unit_price) dibandingkan pada 2 desimal, dan `toDateOnly` memakai komponen tanggal lokal (TZ-safe) bukan `toISOString`.

## [v1.21.12-stable] - 2026-06-10

### Fixed
- Data integrity: koreksi `product_master.hna` untuk 7 produk yang tersimpan sebagai HPP (inc PPN 11%) bukan HNA (exc PPN) — ENTRAMIX 555, ENTRASOY ALMOND SOYA 200G, PEPTIBREN VANILA, PEPTISOL COKLAT, PEPTISOL VANILA, TS NFDM 1000G, TS SWEET DIABTX 150'S. Root cause: nama produk di faktur distributor tidak cocok dengan product_master → syncProductHna tidak berjalan → produk diedit manual dengan nilai HPP.
- Data integrity: koreksi `inventory_batches.hna` untuk PEPTISOL COKLAT dan PEPTISOL VANILA (batch HNA sebelumnya 0 → 67.500 sesuai HNA after diskon 10%).
- UX: warning toast otomatis muncul saat faktur disimpan dengan nama produk yang tidak cocok di master produk, sehingga silent bug "stok tidak masuk" tidak terjadi diam-diam.

## [v1.21.11-stable] - 2026-06-08

### Fixed
- Faktur table: distributor column no longer collapses/vanishes on narrow viewports (e.g. Arc with sidebar open). Added minmax(160px,1fr) + grid min-width 1080px so the table scrolls horizontally instead of squishing.

## [v1.21.10-stable] - 2026-06-08

### Changed
- Template opname cetak sekarang lebih rapi untuk input manual: kolom Batch/ED kosong tidak lagi menampilkan teks `(kosong)`, area tulis dibuat lebih lega, dan instruksi pengisian ditambahkan di header.

## [v1.21.9-stable] - 2026-06-08

### Fixed
- Faktur Pembelian: update status lunas untuk faktur posted tidak lagi tertolak karena mismatch normalisasi tanggal expired item.
- Faktur Pembelian: teks distributor di rekap/list light mode kembali memakai token teks, bukan token surface.

## [v1.21.8-stable] - 2026-06-08

### Added
- Operator smoke checklist dirapikan untuk flow login/logout, modal open-close, sidebar parity, table actions, contrast, dan mobile 375 overflow.
- Shell smoke test ditambahkan untuk memastikan sidebar navigation parity dan logout kembali ke `/login` tanpa DB write path.

## [v1.21.7-stable] - 2026-06-08

### Added
- Fresh visual QA follow-up tetap clean; tidak ada frontend fix baru yang perlu dipaksa untuk inventory/customers/dashboard shell.

## [v1.21.6-stable] - 2026-06-08

### Added
- Visual QA baseline report v1.21.6: audit light/dark pada login, dashboard, sales, invoices, orders, inventory, customers, tasks section, dan print settings menemukan tidak ada P0/P1/P2.

### Fixed
- Fresh dashboard session still shows the release modal and onboarding tour in a dismissable way; overlay behavior stays intentional and non-blocking after CTA close/skip.

## [v1.21.5-stable] - 2026-06-08

### Fixed
- Runtime env lokal/dev sekarang lebih aman: backend prefer `backend/.env.dev`, remote DB wajib jelas lewat `HABIL_DB_TARGET`, dan target `prod` lokal diblokir tanpa override eksplisit.

### Changed
- Frontend API fallback lokal diseragamkan ke `http://localhost:5001/api`, selaras dengan backend port canonical baru.

## [v1.21.4-stable] - 2026-06-08

### Fixed
- Login transition respects reduced-motion: navigate immediately (no 300ms delay) when prefers-reduced-motion; exit timer cleaned up on unmount

### Added
- docs/ENV_SETUP.md — local/dev/prod DB SOP (dev branch, dry-run audit rule, local login)

## [v1.21.3-stable] - 2026-06-08

### Added
- Login → dashboard and logout → login zoom transition (route-fade scale + fade; login submit zoom-out exit). Respects reduced-motion.

## [v1.21.2-stable] - 2026-06-07

### Fixed
- Faktur: distributor name visible in light mode (was using surface token as text color → invisible)
- Changelog release notes readable in light mode (border-strong → text-muted)
- Table action buttons always visible, no hover required (.ui-row-action) — Faktur, Nota, Inventory
- Login copyright centered
### Added
- Login page entrance zoom animation (ui-auth-enter), respects reduced-motion

## [v1.21.1-stable] - 2026-06-07

### Changed
- Inventory & Stok mendapat readability pass: header, tabs, filter, product table, alert cards, dan batch rows dibuat solid dan token-driven.
- Tint selected row yang invalid diperbaiki ke `color-mix`, sementara flow stok masuk/keluar/opname/batch tetap tidak berubah.

## [v1.21.0-stable] - 2026-06-07

### Changed
- Faktur Pembelian dan Surat Pesanan dipulihkan ke surface solid: KPI, filter, tabel, modal shell, dan action icon lebih readable di light/dark mode.
- Sisa efek glass pada Surat Pesanan dihapus dari live surface tanpa mengubah flow terima barang, edit SP, invoice stock-in, atau formula finansial.

## [v1.20.9-stable] - 2026-06-07

### Changed
- Halaman Pengaturan/Print Settings dibuat lebih solid dan readable: form panel, preview, input, dan header tidak lagi bergantung pada surface transparan.
- Live Preview tetap customer-facing white preview, tetapi wrapper-nya lebih stabil dan tidak sticky di mobile.

## [v1.20.8-stable] - 2026-06-07

### Changed
- Nota Penjualan memakai surface yang lebih solid untuk header, filter, dan table shell agar teks/filter/status lebih readable di light dan dark mode.
- Root Nota Penjualan disamakan ke `ui-motion-page` supaya transisi klik sidebar terasa konsisten dengan Dashboard/Customer.

## [v1.20.7-stable] - 2026-06-07

### Fixed
- Angka KPI Dashboard dibuat stabil di card sempit memakai utility container-aware, sehingga nominal panjang tidak crop saat sidebar terbuka atau di Arc default.

## [v1.20.6-stable] - 2026-06-07

### Changed
- Login, mode toggle, dan surface di atas background animasi diberi readability guard agar teks tidak lagi bergantung pada gradient/Vanta.
- Dashboard header benar-benar memakai `ui-toolbar`, selaras dengan release note sebelumnya.

## [v1.20.5-stable] - 2026-06-07

### Fixed
- Frontend lokal sekarang menghormati `REACT_APP_API_URL` sebelum fallback localhost, jadi audit bisa diarahkan eksplisit ke local/dev/staging/prod read-only.
- Dokumentasi environment safety diperjelas dengan contoh API target non-secret agar login smoke lokal tidak salah endpoint.

## [v1.20.4-stable] - 2026-06-07

### Changed
- Header dan strip kontrol di Dashboard serta Tasks diseragamkan ke `ui-toolbar` agar shell terasa lebih rapat tanpa mengubah data, drag/drop, atau alur modal.

## [v1.20.3-stable] - 2026-06-07

### Fixed
- Dashboard mobile dan desktop sekarang tetap rapat di viewport: root page tidak melebar, drawer sidebar tetap fixed overlay, dan TasksKanban tetap scroll internal tanpa mendorong root ke samping.

## [v1.20.2-stable] - 2026-06-07

### Changed
- Sidebar sekarang lebih rapat dan operasional: active state lebih jelas, touch target footer tetap aman, dan drawer mobile tetap fixed tanpa backdrop-close.

## [v1.20.1-stable] - 2026-06-06

### Changed
- Login polish: panel, input, error state, dan tombol masuk diselaraskan dengan design foundation v1.20 tanpa mengubah auth flow

## [v1.20.0-stable] - 2026-06-06

### Added
- Utility design foundation tervalidasi dari pilot Customers, Tasks, dan Dashboard: `ui-page`, `ui-panel`, `ui-toolbar`, `ui-action-button`, `ui-density-compact`, `ui-stat-card`, dan `ui-dialog-shell`
- Dokumentasi design system v1.20 diperbarui agar rollout tema berikutnya tetap additive dan per halaman

## [v1.19.7-stable] - 2026-06-06

### Changed
- Pilot theme Dashboard: KPI card, panel data, quick actions, dan popup rilis diselaraskan dengan surface premium operational console
- Touch target tombol popup Dashboard dirapikan tanpa mengubah fetch, chart, onboarding, atau urutan release history

## [v1.19.6-stable] - 2026-06-06

### Changed
- Pilot theme Tasks: header, toolbar, kanban columns, task cards, trash, dan modal dibuat lebih konsisten dengan pola Customers
- Touch target tombol Tasks dirapikan agar lebih nyaman di mobile/tablet tanpa mengubah drag/drop atau status logic

## [v1.19.5-stable] - 2026-06-06

### Changed
- Compact nominal di halaman Customers memakai format Indonesia (`rb`/`jt`) agar lebih natural untuk operator lokal

## [v1.19.4-stable] - 2026-06-06

### Added
- Dokumentasi design system v1.20 dari hasil pilot Customers: surface, toolbar, card/table, modal/form, mobile, dan rollout rules

## [v1.19.3-stable] - 2026-06-06

### Changed
- Pilot theme Customers: header, search toolbar, customer cards, modal shell, dan action buttons dibuat lebih konsisten dengan gaya premium operational console
- Touch target tombol aksi customer diperbesar agar lebih nyaman di tablet/mobile

## [v1.19.2-stable] - 2026-06-06

### Added
- SOP environment safety untuk memisahkan prod, dev/staging, dan audit read-only sebelum theme pilot atau repair data
- Guardrail audit/repair: default dry-run/read-only, `--apply` hanya untuk repair eksplisit, dan seed login lokal wajib stabil

## [v1.19.1-stable] - 2026-06-05

### Fixed
- Kotak petunjuk SP di form Faktur sekarang memakai border color-mix yang valid, jadi garis tepinya tampil tipis seperti yang diharapkan
- Komentar placeholder nudge SP diselaraskan ke versi rilis terbaru

## [v1.19.0-stable] - 2026-06-04

### Changed
- Invoice SP dropdown sorts matching SPs (same distributor + product overlap) to top
- Added inline hint with "Sambungkan" button when matching SP found but not linked
- Hint is non-blocking, disappears once SP is linked

## [v1.18.8-stable] - 2026-06-04

### Changed
- Schema init in route modules guarded by NODE_ENV!=='test' (13 routes); test-route-http.js runs in test mode → smoke test no longer writes schema to prod DB on import. Prod behavior unchanged.

## [v1.18.7-stable] - 2026-06-04

### Changed
- DB connection: strip sslmode from connstring, SSL controlled via ssl object (silences pg v9 deprecation warning, TLS behavior unchanged)

## [v1.18.6-stable] - 2026-06-04

### Fixed
- Health check PO status: accept legitimate draft/sent before receive (no more false FAIL on new SP)
- Health check 8b HPP: COD-aware — compare vs effective HNA after COD discount (clears 16 false positives)
- RELEASES v1.18.1 entries rewritten in operator-friendly language (changelog convention)

## [v1.18.5-stable] - 2026-06-04

### Fixed
- SP preview number now includes YYMM prefix (fixes v1.18.4 regression)

## [v1.18.4-stable] - 2026-06-04

### Fixed
- SP preview number now matches backend generator: per-month, 3-digit format
- PurchaseOrderList autoSPNumber helper replaces spCounter.last_number + 1

## [v1.18.3-stable] - 2026-06-04

### Fixed
- SP auto-number now resets monthly instead of sticking on previous month
- REPLACE month prefix instead of REGEXP_REPLACE all-digits
- NULLIF('') guard prevents CAST empty string crash
- Sets last_yymm for future monthly reset detection

## [v1.18.1-stable] - 2026-06-03

### Fixed
- Health check HPP false positive: removed incorrect division by qty, check8 is now REPORT only
- Null batch duplicates: repair script with --dry-run/--apply
- Distributor API validation: trims name, requires non-empty, rejects short_code-only
- HTTP route test: assertions now validate exact 401 + error body, reject 500 as pass

## [v1.18.0-stable] - 2026-06-03

### Changed
- MasterSelect: added non-breaking onSelect(optionObject) prop (existing onChange unchanged)
### Added
- docs/AUDIT_TECH_DEBT_v1.18.0.md with refactor roadmap

## [v1.17.6-stable] - 2026-06-03

### Added
- backend/scripts/health-check-prod.js: 8 proactive health checks (read-only)
- npm run health command
- Backend health reports: PO over-receive, negative stock, batch integrity, PO status sync, HPP mismatch

## [v1.17.5-stable] - 2026-06-03

### Fixed
- TasksKanban save button now disabled while saving (missing guard)
- Audited all 6 major component groups: all save buttons properly guarded

## [v1.17.4-stable] - 2026-06-03

### Changed
- API cache keys now include query params so pagination/search doesn't hit stale cache
- distributors/products/customers getAll accept optional params argument

## [v1.17.3-stable] - 2026-06-03

### Changed
- Cross-platform UX stability sweep: touch targets 40px across all close buttons (10 files)
- Created docs/SMOKE_CHECKLIST_CROSS_PLATFORM.md for manual QA

## [v1.17.2-stable] - 2026-06-03

### Added
- HTTP integration smoke tests (11 tests): health, auth guard, route mounting, response shape
- app.js extracted from server.js for testability
- supertest devDependency for route testing

### Changed
- npm test now runs DB health (18) + route helper (18) + HTTP smoke (11) = 47 total

## [v1.17.1-stable] - 2026-06-03

### Fixed
- distributorsAPI.add now accepts string OR object (short_code, salesman_name no longer lost)
- productsAPI.add same fix
- Cache properly invalidated on distributor/product mutations
- API error now logs to console.error instead of silent catch

## [v1.17.0-stable] - 2026-06-03

### Added
- Master data cache: products/distributors/customers cached in sessionStorage (TTL 5 min), invalidated on mutation
- Removed duplicate frontend/.env.local

### Changed
- Confirmed recharts lazy-loaded (65.chunk.js 353KB only loaded for dashboard charts)
- Confirmed PDF utilities dynamically imported (795.chunk.js 396KB only loaded on print)
- Total bundle neutral (+1KB for cache layer in main.js)

## [v1.16.9-stable] - 2026-06-03

### Fixed
- Save buttons now properly disabled while submitting across all major forms
- Silent catch blocks replaced with console.error in user-facing flows
- Loading/empty states clarified in CustomerList, InventoryDashboard

### Changed
- API error handling more robust: errors now show user-readable messages

## [v1.16.8-stable] - 2026-06-03

### Added
- Pagination/search safety: 8 list endpoints now have LIMIT + optional ?q= search
- Customers/products/distributors cap 1000-2000 to preserve dropdown UX

### Fixed
- Missing index idx_customers_name_lc for customer search
- Inventory/tasks/bugs list queries bounded

## [v1.16.7-stable] - 2026-06-03

### Added
- Route-level regression tests: 18 tests for batch resolution, PO room logic, faktur stock-in, sales PUT preservation
- npm test now runs both DB health (18 tests) + route regression (18 tests) = 36 total

### Changed
- Sales helper priority behavior locked by tests (selected_batch_id > batch_id_snapshot > batch_no+expired > batch_no only)

## [v1.16.6-stable] - 2026-06-03

### Added
- Backend regression test suite (18 tests) for stock/batch critical flows
- npm test now runs regression tests instead of placeholder

### Fixed
- Duplicate batch detection now includes expired_date in GROUP BY (legitimate different deliveries)

## [v1.16.5-stable] - 2026-06-03

### Fixed
- Data-integrity repair script for PO item 54 duplicate SP receive, missing batch_id_snapshot backfill, and PO status sync
- Sales create/update now returns 400 for ambiguous batch snapshots (was 500)
- Added FOR UPDATE locking to batch_no snapshot lookups in sales route

## [v1.16.4-stable] - 2026-06-03

### Fixed
- Sales edit batch dropdown now resolves legacy batch_no_snapshot when batch_id_snapshot is null
- Backend resolveSelectedBatchForSale helper with priority: id > name+date > name-only
- Safe backfill of batch_id_snapshot for unique snapshot matches

## [v1.16.3-stable] - 2026-06-03

### Fixed
- Partial SP faktur no longer duplicates stock: remaining room logic, no existing batch iteration
- Batch cost sync narrowed to matching batch_number, not blanket PO batch update
- Sales edit respects selected batch; edit modal shows snapshot batches even if stock 0

## [v1.16.2-stable] - 2026-06-03

### Changed
- Faktur stock-in: batch HNA now uses effective cost after discount/COD (effectiveHna helper)
- Faktur linked SP: existing received batches are now respected, no duplicate batch creation

### Added
- GET /purchase-orders/:id now returns received_batches per item
- effectiveHna() helper for consistent discount-aware cost calculation

### Fixed
- Invoice items HNA prorata bug: now uses per-unit values consistently

## [v1.16.1-stable] - 2026-06-03

### Fixed
- Invoice list ordering now deterministic: ORDER BY purchase_date DESC, id DESC
- Login rate limiter no longer double-counted by general API limiter
- Release change type metadata consistency (fixed → fix)
- Added composite index idx_invoices_purchase_date_id

## [v1.16.0-stable] - 2026-06-03

### Changed
- Backend: DB pool config explicit (max:20, idleTimeout:30s, connectionTimeout:5s)
- Backend: General API rate limiter (300 req/15min), JSON body size limit (1mb)

### Fixed
- Invoices, Sales, Ledger list endpoints now have safe LIMIT (default 100/200, max 500/1000)
- Invoices DELETE operations wrapped in transactions
- Added missing indexes: idx_invoices_purchase_date, idx_inventory_mutations_ref

## [v1.15.9-stable] - 2026-06-03

### Fixed
- resolveProductByIdOrName fallback name lookup now also filters is_active = TRUE (was only filtering by ID)

## [v1.15.8-stable] - 2026-06-03

### Fixed
- Release modal center viewport + portal. Escape close + X button added.
- Dashboard test timeout: mock useOnboarding + sessionStorage, fake timers flush.
- InvoiceList SP prefill qty: now uses ordered qty (it.qty), not received_qty.
- Active product filter: resolveProductByIdOrName now only matches active products. Backfill also from active unique only.

### Changed
- Backend: product_id + name lookups filter is_active = TRUE.

### Security
- Inactive products cannot be used for new stock-in operations.

## [v1.15.7-stable] - 2026-06-03

### Added
- product_id column di purchase_order_items dan invoice_items (nullable, backward-compatible)

### Changed
- Backend matching Faktur linked SP prioritas product_id, fallback normalized product_name
- Frontend SP/Faktur form state dan payload sekarang mengirim product_id

### Fixed
- Duplicate product name tidak lagi menyebabkan salah stok saat linked faktur

## [v1.15.6-stable] - 2026-06-03

### Changed

- `AuthContext` sekarang memakai `useCallback` dan `useMemo` supaya consumer tidak re-render karena value object baru di setiap render provider.
- Timer toast di Nota Penjualan, Faktur Pembelian, dan Inventory sekarang disimpan di `useRef` dan dibersihkan saat komponen unmount.
- Tooltip action Surat Pesanan dipindah ke module scope agar tidak dibuat ulang di setiap render list.

### Notes

- Tidak ada perubahan API, logika finansial, HNA/HPP SSOT, atau `generateNotaPDF.js`.
- Format ulang file one-liner besar dan automated stock regression test masih deferred karena membutuhkan diff/test harness terpisah.

## [v1.15.5-stable] - 2026-06-03

### Security

- Backend sekarang memakai `helmet` untuk security headers dasar tanpa mengaktifkan CSP yang berisiko mematahkan aset legacy.
- Login punya lockout tambahan berbasis username setelah percobaan gagal berulang, selain rate-limit IP yang sudah ada.
- Default masa berlaku JWT dipendekkan dari 7 hari menjadi 8 jam bila `JWT_EXPIRE` tidak diset.

### Fixed

- Buku Besar menolak input debit/kredit non-angka, negatif, kosong dua-duanya, atau sama-sama terisi saat membuat entry baru.
- Error backend auth/ledger tidak lagi mengirim detail internal mentah di production.

### Notes

- Rotasi kredensial Neon/JWT secret tetap perlu dilakukan manual di provider karena secret lama sudah pernah tracked.
- `generateNotaPDF.js`, HNA/HPP SSOT, dan flow bisnis frontend tidak disentuh.

## [v1.15.4-stable] - 2026-06-03

### Fixed

- Stock-in dari Terima Barang SP dan Faktur linked sekarang granular memakai `purchase_order_items.received_qty` sebagai source of truth.
- Faktur linked hanya menambah stok sebesar sisa qty SP, sehingga kombinasi receive partial/full dan faktur partial/full tidak dobel atau menghilangkan stok.
- `PUT /invoices/:id` sekarang transactional dan menolak perubahan item/qty faktur yang sudah pernah membuat mutasi stok.

### Notes

- `stock_received` dipertahankan sebagai status display/derived, bukan gate utama stock-in.
- `generateNotaPDF.js` dan HNA/HPP SSOT tidak disentuh.

## [v1.15.3-stable] - 2026-06-03

### Changed

- Route-level code splitting: halaman besar sekarang lazy-loaded dari `App.js`.
- Vanta/Three dan generator PDF tidak lagi masuk main chunk; modul dimuat saat benar-benar dipakai.
- Dead dependency frontend `socket.io-client` dan `xlsx` dihapus karena tidak dipakai di `frontend/src`.

### Fixed

- Test frontend kembali hijau: mock Dashboard diperbarui untuk icon/tasks/chart env terbaru, Skeleton test mengikuti class shimmer baru, dan nesting invalid `<p><div>` di Nota diperbaiki.

### Notes

- Main chunk turun dari sekitar `579.36 kB` ke `102.99 kB` gzip pada build lokal.
- `generateNotaPDF.js`, backend route, dan HNA/HPP SSOT tidak disentuh.

## [v1.15.2-stable] - 2026-06-02

### Fixed

- Terima Barang Surat Pesanan sekarang bisa split satu produk menjadi beberapa batch dalam satu submit.
- Memperbaiki error PostgreSQL `inconsistent types deduced for parameter $1` saat update status/stock_received SP.

### Notes

- `generateNotaPDF.js`, backend route selain `purchaseOrders.js`, dan HNA/HPP SSOT tidak disentuh.

## [v1.15.1-stable] - 2026-06-02

### Changed

- Print Settings dipoles menjadi layout dua kolom responsif dengan section header, label/input konsisten, tombol simpan loading state, dan live preview elevated card.
- `PrintSettings.jsx` diformat di commit terpisah sebelum polish agar diff mudah direview.

### Notes

- API call, state shape, load logic, `generateNotaPDF.js`, backend route, dan HNA/HPP SSOT tidak disentuh.

## [v1.15.0-stable] - 2026-06-02

### Added

- Shared `FieldError`, `SearchBox`, `ToastNotice`, dan onboarding tour Dashboard untuk polish UI user-facing.
- Search/filter utama sekarang punya debounce 300ms, clear button, dan empty state yang lebih spesifik saat hasil filter kosong.

### Changed

- Toast notification dipoles menjadi token-based dengan posisi desktop/mobile yang lebih rapi.
- Skeleton wave memakai gradient token 135deg yang lebih lembut.
- Form error di Login, Nota, Batch, dan ProductDrawer memakai animasi inline yang konsisten.

### Notes

- `generateNotaPDF.js`, HNA/HPP SSOT, dan backend route tidak disentuh.

## [v1.14.4-stable] - 2026-06-01

### Fixed

- Micro-hotfix row hover regression: row Nota Penjualan mendapat highlight table-friendly khusus `<tr>` karena transform table row tidak reliable di browser.
- Card Customer sekarang memakai `ui-hover-delight` penuh sehingga hover lift + soft glow terasa jelas.
- `Dashboard.jsx`, `Login.jsx`, `Sidebar.jsx`, `index.js`, dan `SUPERAPP_BRAIN.md` disinkronkan ke `v1.14.4-stable`.
- `generateNotaPDF.js` tetap tidak disentuh.

## [v1.14.3-stable] - 2026-06-01

### Fixed

- Hover row di Sales Order dan Purchase Order sekarang konsisten dengan lift + glow `ui-hover-delight`, sementara row utama Faktur tetap memakai pola yang sama.
- ESC close untuk modal page-level diseragamkan di halaman transaksi utama supaya pengguna bisa keluar dengan satu tombol tanpa menyentuh modal child yang sudah punya handler sendiri.
- `Dashboard.jsx`, `Login.jsx`, `Sidebar.jsx`, `index.js`, dan `SUPERAPP_BRAIN.md` disinkronkan ke `v1.14.3-stable`.
- `generateNotaPDF.js` tetap tidak disentuh.

## [v1.14.2-stable] - 2026-06-01

### Fixed

- Micro-hotfix readability untuk modal dan nota: HNA/HPP field lebih terbaca, nota preview lebih legible, nota PDF customer address lebih gelap dan compact paper A5/A6 tetap fit satu halaman untuk nota pendek.
- Body scroll lock diterapkan ke modal portal utama supaya background page tetap statis saat modal aktif.
- `Dashboard.jsx`, `Login.jsx`, `Sidebar.jsx`, `index.js`, dan `SUPERAPP_BRAIN.md` disinkronkan ke `v1.14.2-stable`.
- `generateNotaPDF.js` tetap disentuh secara hati-hati tanpa ubah business logic DPP/PPN/Grand Total.

## [v1.14.1-stable] - 2026-06-01

### Fixed

- Close gap v1.14.0 diselesaikan: modal shared punya ESC handler, empty state pakai ilustrasi inline SVG, dark mode lebih dalam, form surface lebih konsisten, dan wrapper icon dipakai di kontrol yang paling sering disentuh.
- `Dashboard.jsx`, `Login.jsx`, `Sidebar.jsx`, `index.js`, dan `SUPERAPP_BRAIN.md` disinkronkan ke `v1.14.1-stable`.
- `generateNotaPDF.js` tetap tidak disentuh.

## [v1.14.0-stable] - 2026-06-01

### Changed

- Purge Liquid Glass dan stabilisasi modal selesai: route fade tidak lagi membawa transform yang bikin fixed overlay meleset, shared modal utama diportal ke `document.body`, dan release modal tetap center.
- Dashboard dapat KPI empty-state yang jelas, delta vs bulan lalu, heatmap nota harian, dan tooltip chart yang lebih rapi.
- Shared input dan login form dapat focus/disabled polish token-driven; `RupiahInput` dipakai sebagai base field yang lebih konsisten.
- `CLAUDE.md` dan `SUPERAPP_BRAIN.md` di-refresh untuk mencerminkan design language Stripe Modern premium SaaS dan versi canonical terbaru.

## [v1.13.3-stable] - 2026-06-01

### Fixed

- HOTFIX: lima page kritikal yang sempat ter-mash oleh sweep otomatis di v1.13.2 dipulihkan, lalu glass-target dibersihkan manual lewat edit proper tanpa merusak JSX.
- Label versi canonical di Login, Sidebar, index.js, Dashboard, CHANGELOG, dan SUPERAPP_BRAIN disinkronkan ke `v1.13.3-stable`.
- `generateNotaPDF.js` tetap tidak disentuh.

## [v1.13.1-stable] - 2026-06-01

### Changed

- Wiring polish lintas surface: icon-only controls yang masih pakai `title` digeser ke tooltip component, `ui-hover-delight` dipasang di card/list/kanban surface yang relevan, dan CTA utama diselaraskan ke `btn-primary` + `data-magnetic="true"`.
- `Dashboard.jsx` kini memakai hook count-up bersama untuk nilai statistik, sementara release metadata dan label versi disinkronkan ke `v1.13.1-stable`.
- `generateNotaPDF.js` tetap tidak disentuh.

## [v1.13.0-stable] - 2026-06-01

### Changed

- Visual identity refresh ke palette Stripe Modern: Inter dan JetBrains Mono self-hosted, token warna/spacing/elevation baru, surface lebih border-first, dan hover-reveal actions di tabel utama.
- Version badge, sidebar label, login footer, dashboard release history, dan header brain doc disinkronkan ke `v1.13.0-stable`.

## [v1.12.9-stable] - 2026-06-01

### Fixed

- Cleanup polish: residual transition hardcoded disatukan ke `UI_MOTION`, dan icon-only controls yang lolos audit diberi `aria-label` yang jelas.
- Version badge, sidebar label, login footer, dan dashboard release history disinkronkan ke `v1.12.9-stable`.

## [v1.12.8-stable] - 2026-05-31

### Fixed

- Stabilitas backend diperketat: draft invoice tetap per-user, settings counter auth-gated, rollback/release error tidak silent, dan lookup produk di hot path tetap pakai indeks yang aman.
- DB check dan schema bootstrap yang tadinya diam-diam sekarang memberi log yang jelas kalau ada masalah, jadi audit lebih enak dibaca.

## [v1.12.7-stable] - 2026-05-31

### Added

- Surface daftar dan dashboard sekarang lebih konsisten: Customer, Invoice, Tasks, Online Store, dan Ledger share motion, loading, empty state, dan error feedback yang sama.
- Range chart, counter, dan aksi icon button di surface ini tetap mengikuti token motion yang sama dari `frontend/src/constants/ui.js`.

## [v1.12.6-stable] - 2026-05-31

### Added

- Inventory surface jadi lebih rapi: drawer produk, batch actions, opname per-batch, dan modal print barcode sekarang lebih konsisten dengan motion / focus / hover yang sama.
- Nilai inventaris di drawer tetap pakai HPP inc PPN, jadi angka yang muncul di tabel dan detail tetap satu bahasa.

## [v1.12.5-stable] - 2026-05-31

### Added

- Form dan navigasi utama sekarang lebih mulus: Login, Sidebar, Purchase Order, Sales Order, dan Bulk Edit punya timing motion yang konsisten, focus state yang jelas, dan affordance icon button yang lebih rapi.
- `frontend/src/index.js`, `Login.jsx`, `Sidebar.jsx`, dan `Dashboard.jsx` disinkronkan ke label versi terbaru supaya release badge dan title browser tetap akurat.

## [v1.12.4-stable] - 2026-05-31

### Added

- Fondasi motion ringan: modal entrance, toast slide-in, hover/press feedback, focus ring halus, dan skeleton shimmer yang konsisten.
- `frontend/src/constants/ui.js` jadi SSOT timing UI supaya delay kecil tidak nyebar sebagai magic number.
- Aksesibilitas dan affordance tombol diperbaiki di surface utama, termasuk cleanup silent catch dan label untuk icon button yang sempat bocor.

## [v1.12.3-stable] - 2026-05-31

### Fixed

- **Audit/Stability Pass v1.12.3**: draft invoice sekarang per-user, endpoint settings/counters diproteksi auth, lookup nama produk di hot path diindeks, dan note audit overwrite disimpan dengan benar.
  - _Detail teknis_: `backend/routes/invoices.js` tagging draft via `draft_data.__meta.owner_id` + fallback legacy draft ter-claim sekali, `backend/routes/settings.js` now auth-gated + validasi payload counter, `backend/routes/inventory.js` tambah functional index `LOWER(TRIM(name))`, dan `backend/routes/sales.js`/`purchaseOrders.js`/`invoices.js` samakan lookup ke predicate yang ter-normalisasi.

## [v1.12.2-stable] - 2026-05-31

### Added

- **⚡ Quick Wins Bundle v1.12.2**: ambang profitabilitas sekarang configurable dari Pengaturan dan dipakai langsung oleh filter profit di Nota Penjualan; Dashboard menambah widget Top 5 Customer bulan ini + mini chart pergerakan stok 30 hari; dan Faktur Draft punya autosave 2 detik dengan restore prompt yang jelas.
  - _Detail teknis_: `backend/routes/settings.js` tambah setting `profit_thresholds` (`high`, `normal`, `thin`) dan `frontend/src/components/PrintSettings.jsx` section baru untuk simpan ambang. `SalesOrderList.jsx` baca threshold dari backend dan update label filter secara dinamis. `backend/routes/dashboard.js` extend `/dashboard/stats` dengan `topCustomers` dan `stockMovement30d`; `Dashboard.jsx` render dua widget baru. `InvoiceList.jsx` autosave draft debounce 2s + restore prompt menampilkan umur draft.

## [v1.12.1-stable] - 2026-05-31

### Added

- **🏷️ Print Stiker Barcode Batch**: dari Inventory, sekarang bisa pilih beberapa produk lalu generate PDF stiker barcode siap cetak. Setiap produk bisa diatur jumlah stikernya, layout bisa 21 per A4, 33 per A4, atau custom. Produk tanpa kode akan otomatis dilewati.
  - _Detail teknis_: `frontend/src/components/inventory/PrintBarcodeModal.jsx` (BARU) + `frontend/src/utils/generateBarcodePDF.js` (BARU). `InventoryDashboard.jsx`: sticky multi-select bar tambah tombol `Cetak Stiker Barcode`. Generator PDF lazy-load `jsbarcode`, render Code128 per stiker, support page break, dan skip item tanpa `code`.

## [v1.12.0-stable] - 2026-05-31

### Added

- **📷 Barcode/QR Scanner Kamera untuk Inventory**: Stok Masuk, Stok Keluar, dan Opname sekarang punya tombol **Scan**. Scan kode produk lewat kamera HP/laptop → produk otomatis terpilih. Kalau kode tidak ditemukan, sistem menampilkan error yang jelas.
  - _Detail teknis_: install `html5-qrcode`; tambah `frontend/src/components/common/BarcodeScanner.jsx` dengan cleanup kamera saat unmount, guard multi-scan, permission denied/error state, beep success, dan retry. `InventoryDashboard.jsx`: integrasi scan ke `siForm` dan `soForm` + auto-load batch Stok Keluar. `inventory/OpnameModal.jsx`: scan produk, select row, scroll, dan highlight sementara.

## [v1.11.15-stable] - 2026-05-31

### Added

- **📈 Dashboard Profitability Snapshot**: Dashboard sekarang menampilkan dua insight laba bulan ini setelah kartu statistik: **Margin per Channel** dan **Top Kategori Margin**. Angka hanya memakai nota `paid` + `final` + belum dihapus, jadi lebih cocok untuk monitoring laba real.
  - _Detail teknis_: `backend/routes/dashboard.js`: extend `GET /dashboard/stats` dengan `marginByChannel` dan `topCategoryMargins`. Formula margin tetap `qty × (unit_price − unit_hpp × (1 + PPN_RATE))` memakai `tax.PPN_RATE`, bukan hardcode. `Dashboard.jsx`: tambah panel responsive dengan omzet, margin, margin %, jumlah nota, dan empty/loading state.

## [v1.11.14-stable] - 2026-05-31

### Added

- **📊 Filter Nota by Profitabilitas**: Nota Penjualan sekarang bisa difilter berdasarkan margin: Untung tinggi (>20%), Untung normal (5–20%), Tipis (0–5%), atau Rugi (<0%). Ini membantu operator/direktur cepat menemukan nota yang perlu ditinjau tanpa buka satu-satu.
  - _Detail teknis_: `SalesOrderList.jsx`: tambah `filterProfit`, helper `computeNotaMargin()` berbasis `items`, dropdown toolbar, dan empty-state aware filter aktif. Formula margin tetap pakai `hppFromHna(unit_hpp)` sehingga storage `unit_hpp` tetap HNA exc PPN.

## [v1.11.13-stable] - 2026-05-31

### Added

- **🗃️ Inventory — Bulk Edit Kode & Kategori**: di list Inventory, sekarang ada checkbox di kiri tiap baris produk (+ select-all di header). Centang ≥1 produk → sticky bar muncul di bawah dgn tombol "Edit Massal" → modal kasih tabel mapping per-produk (input Kode Baru + Kategori Baru, kategori auto-suggest dari yg sudah ada). Mode selector: `[Kode saja] [Kategori saja] [Kode + Kategori]`. Validasi: duplicate kode di-block dgn warning merah. Progress indicator "Menyimpan x/N". Hemat waktu standardize kode/kategori banyak produk sekaligus.
  - _Detail teknis_: `frontend/src/components/inventory/BulkEditModal.jsx` (BARU). `InventoryDashboard.jsx`: +`selectedProductIds` Set state, checkbox column (header indeterminate + select-all `filtered`, per-row toggle), sticky bottom bar `position:fixed`. Sequential save loop pakai `inventoryAPI.updateProduct` (backend butuh full body — spread dari product object existing). colSpan adjustments: tfoot 8→9, expanded 10→11, empty 11→12.

## [v1.11.12-stable] - 2026-05-31

### Fixed

- **🚨 KRITIS — Dashboard "Laba Kotor bln ini" OVERSTATE ~11% PPN masukan**: kartu stat Dashboard sebelumnya pakai field `sales_orders.gross_profit` yang dihitung dgn formula `(unit_price − unit_hpp) × qty` — padahal `unit_hpp` = HNA exc PPN (SSOT). PPN masukan (= 11% × harga modal) tidak ke-account sebagai cost → margin overstate. Contoh: HNA 100rb jual 130rb, sebelumnya tampil margin 30rb, sekarang benar Rp 19rb. Skala bulanan beda jutaan.
  - _Detail teknis_: `backend/routes/dashboard.js` query `total_laba` di-rewrite → JOIN `sales_items`, `SUM(qty × (unit_price − unit_hpp × 1.11))` langsung. Bypass field `sales_orders.gross_profit` (jadi legacy unused di Dashboard). `backend/routes/sales.js:194,315` fix formula `gross_profit` INSERT + UPDATE pakai `× (1 + PPN_RATE)` utk konsistensi data baru. Data lama gak di-backfill — Dashboard skrg gak baca field itu lagi.
- **🪟 Modal stacking: Edit Batch tidak numpuk lagi di atas Edit Produk**: kalau buka tab Batch di Edit Produk → klik pensil di batch → modal Edit Produk auto-hide selama Edit Batch/Adjust kebuka. Tutup Edit Batch → Edit Produk balik dgn state utuh.
  - _Detail teknis_: `ModalShell` (`InventoryDashboard.jsx:1090`) tambah prop `hidden` → set `display:none` kalau `batchModal || adjustBatch` aktif. Backdrop juga di-disable saat hidden.

### Changed

- **🎨 Tombol Simpan warna konsistensi**: Stok Masuk dulu hijau `#34C759`, sekarang biru `#007AFF` — konsisten dgn Simpan Edit Produk + Edit Batch. Hijau dipertahankan utk badge LUNAS/sukses status, bukan tombol aksi.

## [v1.11.11-stable] - 2026-05-31

### Added

- **💵 List Nota — kolom Margin per produk + Total Margin Nota (UI-ONLY)**: expand baris nota → sekarang tampil kolom **Margin** di kanan (per produk: `(harga jual − HPP inc PPN) × qty`) + footer **Total Margin Nota**. Hijau = untung, merah = rugi. Kalau ada produk HPP=0, hint kuning "margin mungkin overstate".
  - _Detail teknis_: `SalesOrderList.jsx` expanded row (`:745`): tambah `th` Margin + `td` per item dgn warna (`#34C759` ≥0 / `#FF3B30` <0) + `tfoot` Total Margin (`colSpan={6}`). **PDF cetak nota TIDAK berubah** — `generateNotaPDF.js` unchanged. Pembeli gak boleh lihat modal/keuntungan.

## [v1.11.10-stable] - 2026-05-31

### Added

- **🧾 Faktur Pembelian — Diskon per produk: toggle persen (%) atau nominal (Rp)**: kotak Disc per produk di form Faktur sekarang punya toggle `[% | Rp]` di pojok kanan atas. Pilih `%` untuk input persentase (mis. 20%), atau `Rp` untuk input nominal langsung (mis. Rp 758.100). Sesuai faktur fisik yg sering nulis disc nominal langsung. Helper text otomatis tampil konversi balik.
  - _Detail teknis_: `InvoiceList.jsx` — `blankItem` +`disc_mode` (`percent`|`nominal`) +`disc_input` (raw string). `calcItem` switch by mode: nominal → ambil `disc_input` langsung, derive `disc_percent`; percent → derive `disc_nominal`. Keduanya tetap disimpan ke DB (kolom `disc_percent` + `disc_nominal` existing, no migration). UI: card terpisah dgn segmented toggle + helper conversion. Grid disc-col `0.7fr`→`1fr`. Backward compat: old data dgn `disc_percent` → mode `percent` auto.

## [v1.11.9-stable] - 2026-05-31

### Added

- **💰 HnaHppInput — dual-input HNA + HPP locked sync di Inventory**: input harga produk sekarang tampil DUA kotak bersebelahan (HNA exc PPN + HPP inc PPN 11%). Edit salah satu → yg lain otomatis ikut. User bisa input HPP langsung kalau ketemu kulak dgn harga inc PPN (gak perlu bagi 1,11 manual).
  - _Detail teknis_: Komponen baru `frontend/src/components/common/HnaHppInput.jsx` (2-kolom grid `RupiahInput` HNA + HPP, locked sync via `hppFromHna`/`hnaFromHpp`). Replace di 3 lokasi: `InventoryDashboard` Stok Masuk (`:754`), Edit Produk (`:621`), `inventory/BatchFormModal` (`:146`). Storage tetap HNA exc PPN (SSOT, backend unchanged). Round-trip stabil: `HPP → hnaFromHpp(HPP) = HNA → hppFromHna(HNA) = HPP`.

### Changed

- **🔢 Angka kartu Dashboard nominal penuh (revert compact)**: kartu stat sekarang tampil "Rp 22.100.000" (bukan "Rp 22,1 Jt") — user mau desain spesifik dgn angka penuh. `Dashboard.formatRupiah` (`:866`) di-strip branch compact → langsung Intl id-ID currency penuh.

## [v1.11.8-stable] - 2026-05-31

### Fixed

- **🔢 Angka kartu Dashboard pakai istilah Indonesia**: "Jt" (Juta) & "M" (Miliar) — sebelumnya semua angka ≥1 juta tampil pakai "M" (Million ala Inggris) yang rancu. Contoh: Rp 20,6 Jt.
  - _Detail teknis_: `Dashboard.formatRupiah` (`:856`) — ≥1M→"Rp X,XX M" (Miliar), ≥1jt→"Rp X,X Jt", else format Rupiah penuh. (Catatan: ini perbaikan yang di v1.11.7 sempat tercatat di changelog tapi gagal ke-apply ke kode karena string-mismatch.)

## [v1.11.7-stable] - 2026-05-30

### Fixed

- **💰 Kolom HPP di Buat Nota benar (inc PPN 11%)**: kolom HPP pada baris produk dulu menampilkan harga sebelum PPN (mis. 30.096 padahal HPP batch 33.407). Sekarang konsisten inc PPN, sama dengan dropdown batch. Input manual = ketik HPP final (inc PPN), disimpan otomatis sebagai HNA.
  - _Detail teknis_: `SalesOrderList.jsx` field HPP item row (`:980`) `value=Math.round(hppFromHna(it.unit_hpp))`, `onChange=hnaFromHpp(input)` → storage `unit_hpp` tetap HNA exc PPN (round-trip `hppFromHna(hnaFromHpp(x))=x`). Detail expand (`:758`) `fmtRp(hppFromHna)`. Import `+hnaFromHpp`.
- **📦 Fix error "stock_received does not exist" saat simpan Faktur Pembelian** (commit Codex `13600b6`): `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS stock_received` (purchaseOrders.js + guard invoices.js) + patch Neon prod.
- **🔢 Angka kartu Dashboard pakai istilah Indonesia**: "Jt" (Juta) & "M" (Miliar) — sebelumnya "M" ala Inggris (Million) yang rancu, dan nominal <1 juta pun salah tampil "M". `Dashboard.formatRupiah`: ≥1M→"Rp X,XX M", ≥1jt→"Rp X,X Jt", else format Rupiah penuh.

### Added

- **🗂️ Polish Inventory & Opname** (Codex `13600b6`): expanded batch row punya aksi edit/adjust/hapus; Edit Produk tab Profil & Batch; Opname tombol Samakan & Clear + footer summary; ProductDrawer nilai inventaris pakai HPP inc PPN; BatchFormModal z-index fix.
- **🧾 Input Faktur mode HNA/HPP** (Codex `13600b6`): field harga unit faktur bisa pilih HNA (exc PPN) atau HPP (inc PPN); mode HPP otomatis konversi balik ke HNA untuk storage.

> Catatan: v1.11.7 menggabungkan fix HPP Nota (Claude) + 3 perubahan Codex commit `13600b6` yang sebelumnya belum tercatat di changelog/RELEASES.

## [v1.11.6-stable] - 2026-05-30

### Fixed

- **💰 Label harga modal diperjelas (HNA→HPP)**: di dropdown batch saat Buat Nota, label "HNA" diganti "HPP (inc PPN)" — biar gak rancu, itu harga modal yang sudah termasuk PPN 11%.
- **🧹 Hapus "Harga per Produk" rata-rata yang menyesatkan di Faktur**: field itu = (HNA+PPN) ÷ total qty, jadi ngawur kalau 1 faktur isi beberapa produk beda harga. HPP per produk tetap akurat di tiap baris produk.
  - _Detail teknis_: `SalesOrderList.jsx` label batch dropdown pakai `hppFromHna(b.hna)` (`b.hna` = raw exc PPN, single source of truth). `InvoiceList.jsx` hapus display field `harga_per_produk`. Storage HNA tidak berubah — tidak ada perubahan kalkulasi tersimpan.

## [v1.11.5-stable] - 2026-05-29

### Changed

- **🎨 Sidebar floating**: sidebar desktop kini panel mengambang (jarak 14px dari tepi, sudut membulat 20px, bayangan halus) — tampilan lebih modern. Lebar tetap (256 buka / 80 kecil); margin konten disinkronkan (284 / 108) supaya tidak ketabrak.
  - _Detail teknis_: `Sidebar.jsx` desktop branch `position:fixed top/left:14px height:calc(100vh-28px) borderRadius:20px boxShadow overflow:hidden border penuh`. `App.js` `marginLeft` konten 256→284 / 80→108. Mobile branch tidak diubah.

## [v1.11.4-stable] - 2026-05-29

### Fixed

- **🎨 Badge daftar Nota Penjualan tidak wrap 2 baris**: label BAYAR (LUNAS/BELUM BAYAR), STATUS DOC (Final/Draft), dan saluran (Offline/Online) sebelumnya turun baris & terlihat berantakan saat sidebar dibuka (kolom sempit). Ditambah `whiteSpace: nowrap` + `display: inline-block`.

## [v1.11.3-stable] - 2026-05-29

### Fixed

- **🧾 CSV Rekap PPN jadi 1 baris per produk**: dulu produk dalam 1 faktur digabung jadi 1 sel (cth "Tropicana Skim, Tropicana Slim" jadi satu). Sekarang tiap produk = 1 baris sendiri, No Faktur diulang, dengan DPP/PPN/Total per-produk.
  - _Detail teknis_: `InvoiceList.jsx` `handleExportCSV` → async, `Promise.all(invoicesAPI.getById)` ambil items tiap faktur; 1 baris per `invoice_item` (kolom: Tgl·No Faktur·Distributor·Produk·Qty·Satuan·DPP·PPN 11%·Total). DPP per-item = `hna_baru` (fallback `hna×quantity`), PPN = DPP×0.11, Total = DPP×1.11. Baris TOTAL = sum semua. Toast loading saat fetch.

## [v1.11.2-stable] - 2026-05-29

### Changed

- **🧾 CSV Rekap PPN ikut kolom Produk & Total Qty**: export faktur kini menyertakan daftar produk + total qty per faktur (tetap 1 baris/faktur, rekap PPN tetap akurat).
- **👤 Customer lebih mudah dibaca**: nomor HP & alamat dinaikkan ukuran/ketebalan + warna teks utama (sebelumnya abu-abu kecil).
- **🎯 Sidebar & dropdown polish**: ikon sidebar pas mode kecil lebih center; panah dropdown filter (rekap bulan, sort customer) tidak mepet teks lagi.
  - _Detail teknis_: `InvoiceList.jsx` `handleExportCSV` (+`product_names`,+`total_qty`); `CustomerList.jsx` phone/address `fontSize 13.5 / weight 500 / warna utama` + select sort `paddingRight 32`; `Sidebar.jsx` nav button `justifyContent center` + padding simetris saat collapsed; rekap month select `paddingRight 28`.

## [v1.11.1-stable] - 2026-05-29

### Fixed

- **✅ Centang faktur satu-satu sekarang berfungsi** (sebelumnya hanya "pilih semua" yang jalan): checkbox per baris `onChange` kosong + `onClick stopPropagation` membuat klik mati.
- **🔽 Urutan default Faktur kembali ke terbaru di atas**: sebelumnya default mengurutkan berdasarkan jatuh tempo sehingga terlihat acak. Sekarang murni tanggal faktur terbaru dulu.
- **🎨 Tampilan distributor dirapikan**: chip warna-warni di kolom tabel diganti dot + nama (1 baris, ellipsis); kartu "Rekap per Distributor" jadi grid compact (dot + nama + Nx + nominal dalam 1 baris).
  - _Detail teknis_: `InvoiceList.jsx` — `InvoiceRow` checkbox `onChange={onToggleSelect}`; `applyFilters` else-branch → `sort((a,b)=> new Date(b.purchase_date)-new Date(a.purchase_date))`; distributor cell & `distSummary` rekap di-redesign (grid `auto-fill minmax(280px,1fr)`).

## [v1.11.0-stable] - 2026-05-29

### Added

- **🧾 Faktur multi-select + Export CSV Rekap PPN**: centang beberapa faktur di tabel → muncul bar "N faktur dipilih" → tombol **Export CSV Rekap PPN**. File CSV (kebuka di Excel) berisi kolom Tanggal, No Faktur, Distributor, DPP, PPN 11%, Total + baris TOTAL — untuk rekap/lapor pajak masukan.
  - _Detail teknis_: `InvoiceList.jsx` — state `selectedIds` (Set); kolom checkbox di header (select-all scope `filteredInvoices`), `InvoiceRow`, dan skeleton (grid 8→9 kolom di 3 tempat); sticky action bar saat `selectedIds.size>0`; `handleExportCSV` (delimiter `;`, BOM UTF-8 untuk Excel-ID, angka `toFixed(2)` tanpa pemisah ribuan, baris TOTAL, download via Blob — tanpa library). `selectedIds` di-reset saat filter berubah. NPWP tidak tersedia di data → tidak dimasukkan.

## [v1.10.5-stable] - 2026-05-29

### Added

- **📝 Edit kode produk langsung saat Stok Opname**: di panel produk terpilih, klik ikon pensil di sebelah kode → ubah kode → simpan (Enter), langsung tersimpan ke produk.
- **🧾 Export PDF "Berita Acara Stok Opname"**: tombol Export PDF di footer modal opname mencetak daftar batch yang berubah (Stok Sistem vs Fisik + Selisih + Catatan) untuk arsip/bukti. Aktif saat ada perubahan.
  - _Detail teknis_: `OpnameModal.jsx` — state `editingCode`/`codeInput`/`codeMap`, `handleSaveCode` → `inventoryAPI.updateProduct` (prop `onProductsChanged` → parent `fetchProducts`). `handleExportPDF` memakai util baru `generateOpnamePDF.js` (landscape A4, jsPDF + autotable, helvetica **no-emoji**, kolom No·Kode·Produk·No.Batch·ED·Sistem·Fisik·Selisih·Catatan), data dari `inputs` difilter seperti `changedItems`.

## [v1.10.4-stable] - 2026-05-29

### Changed

- **🖨️ Template Opname jadi per-batch (kolom No. Batch + ED)**: dulu template cetak 1 baris per produk (cuma "ED Terdekat"). Sekarang tiap batch = 1 baris dengan kolom **No. Batch** dan **ED**. Batch/ED yang belum ada tampil **"(kosong)"** supaya petugas mengisinya manual saat opname fisik lalu input ke sistem.
  - _Detail teknis_: endpoint baru `GET /inventory/opname-template` (LEFT JOIN `inventory_batches` aktif & `qty_current>0`; produk tanpa batch tetap 1 baris null). `inventoryAPI.getOpnameTemplate`. `generateInventoryPDF.js` di-rewrite menerima rows per-batch: kolom No.Batch + ED (`fmtDate` default "(kosong)"), header Total Produk + Total Baris Batch + Total Stok. `handleExportOpnameTemplate` fetch endpoint baru.

## [v1.10.3-stable] - 2026-05-29

### Changed

- **🗑️ Hapus batch tanpa harus adjust ke 0 dulu**: dulu batch yang masih ada stoknya tidak bisa dihapus (harus di-adjust 0 manual). Sekarang langsung bisa dihapus — sisa stok otomatis di-nol-kan (tetap tercatat di riwayat mutasi) lalu batch dihapus.
  - _Detail teknis_: `inventory.js` `deleteBatch` — guard `qty_current>0` dibuang; bila ada stok → `INSERT inventory_mutations` (type `out`, reference `adjust`, "Hapus batch: stok N → 0") → `qty_current=0` → `is_active=FALSE`, semua dalam 1 transaksi (`BEGIN/COMMIT`). `OpnameModal.jsx` teks konfirmasi diperbarui. Catatan: edit No.Batch & ED saat opname sudah tersedia via ikon pensil per batch.

## [v1.10.2-stable] - 2026-05-29

### Added

- **📊 Kolom "Nilai" + Total Nilai Inventaris di halaman Inventory**: tiap produk menampilkan nilai persediaan (HPP inc PPN × stok), dan di bawah tabel ada Total Nilai Inventaris keseluruhan. Total mengikuti filter/pencarian yang sedang aktif.
  - _Detail teknis_: `InventoryDashboard.jsx` — `<th>` Nilai setelah Stok, `<td>{fmtRp(hppFromHna(p.hna) * stock)}` per baris, `useMemo totalNilai` (reduce atas `filtered`), `<tfoot>` grand total. `colSpan` baris expanded (8→9) & empty-state (9→10) disesuaikan untuk kolom baru.

## [v1.10.1-stable] - 2026-05-29

### Fixed

- **💰 Harga HNA di Stok Masuk tampil benar (tidak ×100 lagi)**: dulu saat buka Stok Masuk, kolom HNA menampilkan angka 100× lipat (produk Rp 76.000 tampil "Rp 7.600.000") padahal HPP-nya benar dan saat diklik kembali normal. Sekarang langsung tampil benar.
  - _Detail teknis_: nilai numeric dari Postgres datang sebagai string `"76000.00"`. `formatRupiah`→`parseRupiah` menganggap titik sebagai pemisah ribuan lalu menghapusnya → `7600000`. Fix di `RupiahInput.jsx`: `formatRupiah(parseFloat(value), decimals)` (memperbaiki semua field RupiahInput sekaligus). Tambahan defensif: `siForm.hna` di `InventoryDashboard.jsx` di-`parseFloat` saat `openStockIn` dan saat memilih produk.

## [v1.10.0-stable] - 2026-05-29

### Fixed

- **📦 Stok tidak lagi dobel saat Faktur Pembelian dibuat dari Surat Pesanan**: dulu Terima Barang SP dan Faktur Pembelian dua-duanya menambah stok tanpa saling tahu → stok masuk 2×. Sekarang di Buat Faktur ada pilihan **"Dari Surat Pesanan"** — pilih SP-nya, produk otomatis terisi, dan sistem memastikan stok hanya masuk sekali (entah lewat Terima Barang dulu, atau langsung dari Faktur kalau lupa Terima Barang). Beli tanpa SP tetap menambah stok seperti biasa.
  - _Detail teknis_: kolom baru `invoices.purchase_order_id` + `purchase_orders.stock_received` (ALTER ADD COLUMN IF NOT EXISTS, aman di Neon). `purchaseOrders.js` receive: set `stock_received=TRUE` saat fully received (`CASE WHEN status='received'`) + skip insert batch kalau `alreadyStocked`. `invoices.js` create: kalau faktur ber-`purchase_order_id` & SP `stock_received` → SKIP stock-in, cuma backfill HNA ke batch `source_type='purchase'`; kalau belum → stock-in + set flag; tanpa SP → stock-in normal (legacy). Frontend `InvoiceList.jsx`: dropdown "Dari SP" (`purchaseOrdersAPI`) prefill items+distributor; `purchase_order_id` ikut `...form` ke payload. Faktur lama (legacy) `purchase_order_id` NULL — tetap normal, tanpa dedup retroaktif.

## [v1.9.0-stable] - 2026-05-28

### Added

- **📄 Preview Live di Buat SP**: dokumen Surat Pesanan tampil real-time di samping form sambil diisi (distributor, produk, tanggal langsung kebaca di preview), persis seperti di Buat Nota. Bisa cek tampilan dokumen sebelum cetak.
  - _Detail teknis_: komponen baru `common/SPPreview.jsx` (mirror `NotaPreview`, render dokumen SP HTML real-time, **tanpa harga/total** sesuai SP price-free). `PurchaseOrderList.jsx`: state `layoutSettings` (fetch `printSettingsAPI.get().nota_layout` on-mount), modal Buat SP jadi 2-kolom (form kiri + `SPPreview` sticky kanan, `gridTemplateColumns: 1.2fr 1fr`), `maxWidth` diperlebar ke `min(1100px, calc(100vw - 32px))`, preview disembunyikan di mobile.

## [v1.8.9-stable] - 2026-05-28

### Changed

- **🔽 Dropdown produk di "Buat SP" sekarang sama persis seperti di Nota**: bisa cari, pilih dari daftar, atau tambah produk baru langsung dari dropdown. Sebelumnya SP satu-satunya yang masih pakai input ketik-bebas (datalist), beda sendiri dari picker produk lain di app.
  - _Detail teknis_: `PurchaseOrderList.jsx` ganti `<input list="inv-product-list">` (datalist free-text) → komponen `MasterSelect` (creatable dropdown, sama yg dipakai Nota `SalesOrderList.jsx:965` + Distributor di modal yg sama). Hapus `<datalist>`. `updateItem` dibikin atomik: autofill `unit` dari `base_unit` saat produk dipilih (sekalian fix latent double-`updateItem` bug di onChange lama). SP sisi pembelian → harga **tidak** auto-fill dari `sell_price` (beda dgn Nota), tetap manual.
- **🧾 SP tanpa kolom Harga & Total**: Surat Pesanan murni daftar pesanan barang (produk + qty). Harga/nominal sengaja dibuang karena saat memesan belum tentu tahu harga — nominal baru relevan di **Faktur Pembelian** setelah barang + faktur dari distributor datang.
  - _Detail teknis_: `PurchaseOrderList.jsx` hapus input `unit_price` di baris produk + blok Total di modal + kolom Total di tabel list + kolom Harga/Subtotal di detail expand (colSpan 6→5). Hapus helper `fmtRp` + `grandTotal` yg jadi unused. SP PDF (`generateSPPDF.js`) memang sudah tanpa harga. Backend `purchase_orders` tetap simpan `unit_price`/`total` default 0 — tanpa migrasi/perubahan schema.

### Fixed

- **📦 Tambah produk baru dari SP otomatis mendaftarkannya ke Inventory**: sebelumnya nama produk yang diketik bebas di SP jadi "hantu" — tidak terdaftar di inventory, dan stoknya **hilang diam-diam** saat barang diterima. Sekarang setiap produk SP dijamin masuk inventory.
  - _Detail teknis_: Handler `handleAddProduct/Remove/Rename` diport dari Nota — `onAdd` panggil `inventoryAPI.createProduct({ name, unit:'pcs', hna:0, ... })` → `product_master` langsung muncul di Inventory (stok 0, LEFT JOIN di `getProducts`). Hardening backend `purchaseOrders.js` receive handler: produk yg belum terdaftar (SP lama / produk dinonaktifkan) di-auto-create dulu (`INSERT INTO product_master`) sebelum stock-in, jadi `if (product)` tidak pernah di-skip diam-diam.

## [v1.8.8-stable] - 2026-05-27

### Fixed

- **🪟 Kanban Manajemen Tugas BENAR-benar glass**: wrapper container gak lagi solid putih override class. Sebelumnya v1.8.7 cuma fix token internal Kanban, tapi outer wrapper di Dashboard masih punya inline bg yang menang spec vs CSS glass-target.
  - _Detail teknis_: Root cause Dashboard.jsx:672 punya `<div className="glass-target" style={{ backgroundColor: cardBg, ... }}>`. CSS `.liquid-glass-active .glass-target { background-color: var(...) !important }` kalah specificity vs inline style. Fix: hapus inline `backgroundColor` property total dari Kanban container + stats cards (line 684) + Version badge button (line 663). Plus TasksKanban root wrapper (line 210) hapus inline `backgroundColor: bg` dan biarkan parent glass.
- **🎨 Modal "Apa Yang Baru" content area gak hardcoded white lagi**: card per-item changelog sebelumnya `bg-white dark:bg-gray-800` Tailwind hardcoded yang override glass.
  - _Detail teknis_: Dashboard.jsx:754 ganti dari `<div className="bg-white dark:bg-gray-800 ...">` ke `<div className="glass-target glass-target--ultra ...">`. CSS var theme-aware tint apply, gak perlu Tailwind class hardcoded.

### Changed

- **🌫️ Liquid Glass akhirnya konsisten di seluruh UI**: Faktur Pembelian, Surat Pesanan, Buku Besar, Toko Online, Pengaturan Cetak, Bug Reports — semua sekarang translucent dgn backdrop blur. Sebelumnya 0% glass adoption (solid putih).
  - _Detail teknis_: 6 page components audit ulang. Strategi: (1) translucent `cardBg = isDarkMode ? 'rgba(28,28,30,0.7)' : 'rgba(255,255,255,0.7)'` di setiap file, (2) inject inline `backdropFilter: 'blur(12px)'` + `-webkit-backdrop-filter` ke semua card consumer (4-7 per file). InvoiceList khusus: hapus solid bg dari `S.card` style object def line 549, tambah `className="glass-target"` ke 6 consumer JSX wrappers via batch sed. Total 24+ surface translucent + blur effect.
- **🧱 Sidebar translucent saat Vanta + Glass nyala**: sebelumnya solid `#FBFBFD` light / `#000` dark override glass tint walaupun ada class `glass-target`.
  - _Detail teknis_: Sidebar.jsx:250-255 inline bg ganti jadi `rgba(255,255,255,0.7)` / `rgba(0,0,0,0.7)` + inject `backdropFilter: blur(16px)` inline. Compose dgn glass-target class dari CSS = layered glass effect dgn stronger blur (16px > default 18px).

## [v1.8.7-stable] - 2026-05-27

### Added

- **🌫️ Vanta fog tembus di semua halaman**: sebelumnya cuma Dashboard yang punya background fog visible. Sekarang Nota Penjualan, Customer, Faktur Pembelian, Surat Pesanan, Inventory, Toko Online, Buku Besar, Pengaturan, Login, Bug Reports — semua halaman fog visible behind content.
  - _Detail teknis_: Plumb prop `isVantaMode` dari `App.js` → `ProtectedRoute` → `AppRoutes` → 11 page component. Setiap wrapper div: `backgroundColor: isVantaMode ? 'transparent' : bg`. Pendekatan prop-based dipilih karena inline style menang specificity vs CSS `!important`. Hapus CSS rule `body.vanta-active div.min-h-screen { background: transparent !important }` (v1.8.6.1) yang gak match pages tanpa class `min-h-screen` (mayoritas pages pakai `minHeight: '100vh'` inline). Pattern repeat di SalesOrderList:550, CustomerList:109, PurchaseOrderList:244, PrintSettings:77/103, InventoryDashboard:277, OnlineStoreDashboard:73, LedgerPage:63, BugReports:144, InvoiceList:564 (variant dgn inline `isDarkMode ? '#000' : '#F5F5F7'`), Dashboard:624, Login:74.
- **🪟 Liquid Glass enable by default**: sebelumnya OFF default, user perlu toggle manual. Sekarang Glass ON for fresh visitor — text tetap readable walaupun Vanta nyala karena backdrop-blur shield di cards/surfaces.
  - _Detail teknis_: `useGlassMode.js` line 31 fallback flip dari `localStorage === '1'` jadi `stored === null ? true : stored === '1'`. Backward compat: user yang sebelumnya toggle OFF (localStorage `"0"`) tetap OFF respected. User ON (`"1"`) tetap ON. Cuma `localStorage === null` (never toggled) dapat default `true`.

### Changed

- **🎨 Kanban Manajemen Tugas translucent**: gak ada blok putih solid besar lagi. Column + task card sekarang translucent dgn backdrop blur effect — Vanta visible behind, text contrast tetep tinggi (WCAG AA passed).
  - _Detail teknis_: TasksKanban.jsx tokens: `cardBg` `rgba(255,255,255,0.85)` light / `rgba(28,28,30,0.85)` dark, `columnBg` `rgba(...,0.45)`, `surface` `rgba(...,0.7)`. Column container tambah `backdropFilter: blur(14px)`, card `backdropFilter: blur(10px)` + `-webkit-backdrop-filter` fallback Safari. Contrast `#1D1D1F` text di `rgba(255,255,255,0.85)` ≈ 14:1 ✅.
- **🌗 Dark mode layering depth**: sebelumnya card `#1C1C1E` di atas bg `#000` = kontras 1.08:1 (flat). Sekarang bg `#0A0A0C` + cardBg translucent `rgba(28,28,30,0.85)` + border softer `rgba(60,60,67,0.6)` — kasih depth + Vanta-friendly.
  - _Detail teknis_: Dashboard.jsx color tokens line 563-566 update. Translucent cardBg otomatis benefit dari Liquid Glass mode backdrop-blur.

## [v1.8.6-stable] - 2026-05-27

### Added

- **🌫️ Animated background fog di seluruh app**: efek fog animasi (Vanta.js WebGL) di belakang konten seluruh halaman — bisa di-toggle on/off via tombol angin (Wind icon) di sidebar bawah atau di pojok kanan atas halaman Login. Default ON tapi otomatis OFF kalau device low-spec atau OS user prefer reduced motion.
  - _Detail teknis_: Integrasi `vanta@latest` + `three@latest` via custom hook `frontend/src/hooks/useVantaBackground.js`. Resolution order: (1) URL kill switch `?vanta=off|on`, (2) `prefers-reduced-motion: reduce`, (3) `navigator.deviceMemory < 4` low-spec auto-disable, (4) localStorage `habil_vanta_mode` (default ON). Theme-aware color scheme — light: highlightColor `#5AC8FA` midtone `#007AFF` lowlight `#FFFFFF` base `#F5F5F7` blurFactor 0.6 speed 0.5; dark: lowlight `#1C1C1E` base `#000000` blurFactor 0.75. Re-init effect saat isDarkMode change. Container `<div id="vanta-bg">` di `App.js` root dgn CSS `position:fixed inset:0 z-index:0 pointer-events:none` — canvas tidak intercept klik UI. App content `.app-content` `position:relative z-index:1`. Body `vanta-active` class drive `background:transparent` agar canvas tembus. Cards/sidebar/topbar tetap solid bg → readability terjaga. Compose well dgn Liquid Glass mode (translucent surface tembus ke Vanta). Toggle UI: `<Wind>` icon button — Login top-right (sebelah Glass + Dark mode), Sidebar bottom (sebelah Dark Mode). Cleanup `effectRef.destroy()` di unmount + saat enabled→false.

## [v1.8.5-stable] - 2026-05-26

### Fixed

- **📄 Nota PDF gak split halaman lagi kalau cuma sedikit item**: nota Albert (1 item DIANERAL 180G) yang sebelumnya split jadi 2 halaman (page 1 stop di Terbilang, page 2 cuma NOTE + signatures dgn ~150mm whitespace) sekarang muat di 1 halaman sesuai expected.
  - _Detail teknis_: Refactor pre-calc page-break di `frontend/src/utils/generateNotaPDF.js`. Hapus single-decision bundle (`totalNeeded = ketentuanH + bankH + sigBlockH + footerReserve + safetyBuffer`) yg false-positive trigger split. Ganti dengan adaptive per-block: ketentuan render per wrapped line dgn helper `ensureSpace()`, bank+sig+footer dijaga together via 1 conditional addPage check sebelum bank. SigBlockH recalibrate 30→26 (A4/A5) — actual sigGap(7)+sigNameOffset(19)=26 footprint. Debug log behind `localStorage.pdfDebug` flag.
- **🎨 Tabel nota sekarang punya border rounded**: match preview Dokumen di halaman Pengaturan.
  - _Detail teknis_: jspdf-autotable v5 gak support border-radius native. Approach: `theme: 'plain'` + headStyles `lineWidth: 0` + bodyStyles `lineColor [229,229,234] lineWidth 0.1` untuk inner separator halus. Manual `doc.roundedRect(margin, startY, w, h, 2, 2, 'S')` post-autoTable untuk outer border 2mm radius. Sweet-spot tradeoff: outer-only rounded vs full per-cell rounded (~100+ baris complex via didDrawCell hook).

### Added

- **👁️ Live preview di modal Buat Nota Baru**: split modal jadi 2 kolom — form di kiri, preview real-time di kanan. Bisa lihat hasil nota saat ngetik customer/produk/harga/tempo sebelum klik Simpan. Mirror pattern preview di halaman Pengaturan.
  - _Detail teknis_: Component baru `frontend/src/components/common/NotaPreview.jsx` — pure JSX presentational. Mirror layout `PrintSettings.jsx:194-284` tapi terima props live (form/items/settings). Extract `angkaKeTerbilang` ke `utils/angkaKeTerbilang.js` untuk shared use. Modal `SalesOrderList.jsx`: width `640px` → `min(1200px, calc(100vw - 32px))`, content layout `flex-col` → `grid 1.1fr 1fr` (form kiri + preview sticky kanan). Order number auto-compute dgn `notaCounter.next_preview` fallback. Preview update via React re-render (single source of truth: form/items state).
- **🖨️ Cetak Template Opname dari halaman Inventory**: tombol baru di header Inventory "Cetak Template" → generate PDF list produk dgn kolom Stok Fisik/Selisih/Catatan kosong untuk dicetak A4 → operator coret-coret di kertas saat opname → balik input ke app. Unblock workflow opname offline.
  - _Detail teknis_: File baru `frontend/src/utils/generateInventoryPDF.js` — jsPDF landscape A4, autoTable theme grid 9 kolom (No/Kode/Nama/Satuan/StokSistem/EDTerdekat/StokFisik/Selisih/Catatan). MinCellHeight 8mm cukup untuk tulisan tangan. Fill greybox di kolom kosong untuk highlight area input manual. Footer per page: page N of M + signature lines "Diperiksa/Disetujui oleh" di last page. Tombol di `InventoryDashboard.jsx` header pakai `headerBtn` helper existing + handler `handleExportOpnameTemplate` fetch printSettings + save PDF dgn filename timestamp.

### Migration safety

- Git tag rollback: `v1.8.4-pre-pdf-fix`
- No schema changes (frontend-only release).

---

## [v1.8.3-stable] - 2026-05-26

### Fixed

- **🔢 Nomor nota di Buat Nota Baru sekarang akurat**: sebelumnya preview nyangkut di nomor lama (mis. tampil `2605015` padahal latest `HSB-NOTA-2605025`).
  - _Detail teknis_: PostgreSQL `SUBSTRING(text FROM $param)` ternyata treat parameter sebagai **REGEX pattern** (bukan numeric position). Param `14` → match literal "14" di string → MAX kebaca `14` dari `HSB-NOTA-2605014`. Fix: ganti ke `REPLACE(order_number, $prefix, '')` parameter-safe. Affect: `backend/routes/settings.js` + `backend/routes/sales.js`.
- **🔄 Habis hapus nota, nomor baru auto-update**: gak perlu refresh manual lagi.
  - _Detail teknis_: FE refetch `notaCounter` di `openAdd()` (klik Buat Nota) + `confirmDelete()` success branch. Sebelumnya state fetch sekali di mount.
- **♻️ Nomor nota yang udah dihapus bisa dipakai ulang**: sebelumnya muncul error "Nomor Nota sudah digunakan" padahal nota udah didelete.
  - _Detail teknis_: Soft-delete tetap leave `order_number` di table → UNIQUE constraint full-table block re-use. Fix: DROP `sales_orders_order_number_key`, CREATE partial unique index `ON sales_orders(order_number) WHERE is_deleted = FALSE`. Migration idempotent di `ensureSchema()`, auto-apply saat backend start.

### Changed (UX)

- **📝 Changelog modal sekarang dual-language**: tiap baris perubahan tampil bahasa user-friendly default, dengan toggle "▶ Detail teknis (developer)" untuk expand penjelasan code-level. Goal: Fivin/Ferry/Ayah baca tanpa pusing istilah dev, tim dev tetap punya context lengkap.

---

## [v1.8.2-stable] - 2026-05-26

### Fixed (Hotfix)

- **🔢 Counter preview Auto field**: modal "Buat Nota Baru" Auto field sebelumnya tampil format lama (mis. `HSB-NOTA-26030003`) karena baca `last_number` raw dari `document_counters` (stale dari pattern lama). Sekarang backend `GET /api/settings/counters` (settings.js) enrich response dengan `next_preview` per doc_type — apply YYMM dynamic logic + MAX active nota per current month. Frontend `SalesOrderList` pakai `notaCounter.next_preview` untuk display.
- **🔄 product_master.hna auto-sync ke RAW HNA**: drift bug — `product_master.hna` stale (nilai lama dari user input manual di Edit Produk sebelum v1.8.0 label fix). Saat ini batch.hna = 288.289 (raw, benar) tapi product.hna = 301.720 (HPP lama). Fix forward: `backend/routes/invoices.js` POST + PUT sekarang auto-UPDATE `product_master.hna = item.hna` (RAW HNA per pcs) tiap kali faktur create/edit. Source of truth = faktur terbaru.

### Backfill instruction (existing data)

Untuk fix product.hna stale di data existing tanpa menunggu faktur baru:

- **Option A** (per produk): buka faktur existing untuk produk tsb → klik "Update Faktur" tanpa edit apa-apa → trigger auto-sync.
- **Option B** (bulk): jalanin sekali `node backend/scripts/backfill-hna-raw.js` dari `backend/` dir dengan DATABASE_URL pointing ke prod. Script log report perubahan per produk.

---

## [v1.8.1-stable] - 2026-05-26

### Fixed (Critical Bugs)

- **🔢 Counter nomor nota dynamic per bulan**: sebelumnya nyantol di YYMM bulan lama (mis. nota Mei tapi format `2603xxx`). Sekarang `generateOrderNumber()` di `backend/routes/sales.js` deteksi current YYMM, reset counter ke 001 tiap bulan baru via `last_yymm` column. Sync to MAX active nota per current month untuk handle delete + re-use. Schema additive: `ALTER TABLE document_counters ADD COLUMN IF NOT EXISTS last_yymm VARCHAR(4)`.
- **🔄 Edit Nota stock sync (PUT /sales)**: sebelumnya PUT cuma DELETE+INSERT sales_items tanpa sentuh inventory → edit qty 5→12, stock di batch gak update. Sekarang implement reverse-old + apply-new pattern (mirror DELETE): fetch old 'out' mutations → reverse qty ke batch → DELETE mutations lama → FEFO re-deduct + INSERT mutations baru. Transactional safe.
- **🎯 Edit Nota batch picker pre-fill**: `openEdit()` di `SalesOrderList.jsx` sekarang include `batch_no_snapshot` + `expired_date_snapshot` di items + re-fetch batches per item via `getAvailableBatches()` + set `_selected_batch` dari snapshot. Dropdown tampil + auto-select batch yang dipilih sebelumnya.
- **📋 PUT /sales re-snapshot batch + ED**: PUT handler peek first FEFO batch + update `batch_no_snapshot` + `expired_date_snapshot` di sales_items (mirror POST). PDF nota print sekarang tampil batch/ED sub-line walaupun nota di-edit.
- **📄 PDF Nota page-split A5/A6 fix**: `generateNotaPDF.js` sigBlockH dihitung lebih akurat dari `sigGap + sigNameOffset + bottomBuffer` (sebelumnya undercount 14mm). Safety buffer 5mm + page-fit check pakai `pageHeight - margin` (sebelumnya cuma `-4`). 5-10 items A5 sekarang fit 1 page tanpa split.

### Added (Nota Tax-Friendly + UX)

- **💰 PDF Nota tax-friendly breakdown**: tampilkan Subtotal (DPP) + PPN 11% + Grand Total decompose dari `order.total` (Grand Total = DPP × 1.11, asumsi harga jual gross/inc PPN). Untuk laporan SPT customer-facing.
- **📅 PDF Nota Jatuh Tempo header**: kalau `due_date` ada AND payment_method non-Tunai → tampil "JT: 09 Jun 2026" di header info kanan (merah, bold).
- **💵 Form nota conditional due_date**: pilih `payment_method='Tunai'` → field Tempo Pembayaran auto-hidden + auto-clear (`due_date=''`, `payment_terms=null`). Tampil hint "Pembayaran Tunai — tidak ada tempo". Switch ke Transfer/QRIS → field muncul kembali.

### Migration safety

- Git tag rollback: `v1.8.0-pre-nota-fix`
- Schema additive only — `ALTER TABLE document_counters ADD COLUMN IF NOT EXISTS last_yymm` safe re-run.

---

## [v1.8.0-stable] - 2026-05-26

### Added (Major Features)

- **🏷️ HNA / HPP Consistency Refactor**: Inventory list split kolom "HNA (exc PPN)" + "HPP (inc PPN)" yang computed `hna × 1.11`. Edit Produk + Edit Batch + Stok Masuk semua tampil chip computed HPP. Bedain mana harga raw vs harga kulak dengan PPN. **Konvensi storage**: `product_master.hna` dan `inventory_batches.hna` = RAW HNA per pcs (exc PPN). HPP dihitung di display layer.
- **💰 Decimal Precision Input (Indo format)**: `frontend/src/utils/rupiah.js` (`formatRupiah`/`parseRupiah`/`hppFromHna`) + `frontend/src/components/common/RupiahInput.jsx` (dual-mode focus=edit/blur=format). Input HNA / Disc COD / Stok Masuk support 2 digit desimal dengan format Indo "Rp 288.288,25" (titik ribuan + koma desimal). Backend `DECIMAL(15,2)` sudah support, frontend kini gak truncate ke integer.
- **✂️ Edit Faktur Simplification**: Per row sembunyikan cascade fields (HNA × QTY, Disc Nominal, HNA Baru, HNA/Item, COD Bagian, HNA After COD) by default. Tampil HPP final highlight (green chip) + tombol "Detail kalkulasi" expandable untuk yang mau verify breakdown.
- **📐 Karton UX Consistency**: Faktur form tambah conversion preview "20 karton (= 240 pcs)" mirror SalesOrderList. SP PDF tambah sub-line `(= X pcs)` konsisten dengan Nota PDF.
- **🧮 Tax Helper Konsolidasi**: `backend/utils/tax.js` (`PPN_RATE`/`hppFromHna`/`hnaFromHpp`) + `frontend/src/utils/rupiah.js` mirror. Replace `* 1.11` hardcoded di 4+ lokasi (backend invoices.js, backend inventory.js, frontend InvoiceList.jsx ×3).

### Fixed

- **Backend `/batches-by-product` HPP formula salah**: sebelumnya `(hna / qty_current) * 1.11` — `hna` di batch sudah per-pcs jadi pembagian salah. Fix ke `hna * 1.11`.
- **PDF Laporan HPP label**: sub-row sebelumnya cuma `HPP Rp X` — sekarang eksplisit `HPP/pcs (inc PPN): Rp X,XX` dengan 2 decimal digit.

### Backfill

- **Script `backend/scripts/backfill-hna-raw.js`**: one-time sync `product_master.hna` → RAW HNA dari latest active batch. Run manual: `node backend/scripts/backfill-hna-raw.js`. Log report perubahan (before/after/delta) per produk. Skip produk tanpa active batch.

### Migration safety

- Git tag rollback: `v1.7.0-pre-hna-hpp-refactor`
- Schema additive only — no DROP, no rename existing column.

---

## [v1.7.0-stable] - 2026-05-25

### Added (Major Features)

- **💰 Tiered Pricing (Grosir Tier)**: Schema `product_price_tiers` (per-unit, per-qty-range). Backend `backend/utils/pricing.js` resolver + endpoints GET + PUT `/products/:id/tiers`. Frontend Product form modal: inline CRUD tier rows. SalesOrderList auto-resolve saat qty/unit/product change + UI tag "🏷️ Harga grosir tier diaplikasikan".
- **📊 Multi-Select Nota Penjualan + Export PDF Laporan**: Checkbox column + sticky action bar. `frontend/src/utils/generateLaporanPDF.js` (landscape A4, tabel ringkasan, Grand Total, breakdown Lunas/Belum Bayar).
- **📦 Stok Keluar Batch Picker**: Dropdown batch di modal Stok Keluar (default FEFO terdekat, bisa override manual). Backend `POST /stock-out` accept `selected_batch_id` → single-batch deduction skip FEFO loop.
- **PDF Nota item: batch_no + ED snapshot**: `sales_items` add `batch_no_snapshot` + `expired_date_snapshot` (additive ALTER). POST `/sales` peek first FEFO batch saat INSERT sales_items. `generateNotaPDF` tampil sub-line "Batch: X · ED: Y" kalau snapshot ada.

### Fixed

- **Filter textbox Nota tidak kepotong**: tambah `textOverflow: ellipsis` + `whiteSpace: nowrap` + `overflow: hidden` + `paddingRight: 32px` (ruang chevron) + minWidth sesuai opsi terpanjang.
- **Footer "Business Management System" di root level dihapus** (`index.js`): gak ikut theme system (dark mode bocor) + redundant dengan version label di Sidebar badge, Login footer, Dashboard footer, document.title.

### Infrastructure

- Git tag `v1.6.0-pre-tier-pricing` di-push sebelum overhaul (rollback aman).
- Neon manual snapshot dibuat user.
- Schema 100% additive (`CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... IF NOT EXISTS`). Backward-compat: tier resolution return NULL kalau tabel kosong → fallback ke `sell_price`/`sell_price_pack` existing.

---

## [v1.6.0-stable] - 2026-05-25

### Added (Major Feature: Multi-Unit Packaging — Carton ↔ Pcs)

- **product_master Dual-Unit + Dual-Price**: schema additions `base_unit` (canonical pcs/btl/sachet), `pack_unit` (karton/dus/box, optional), `pack_size` (1 pack = N base, default 1 = backward compat), `sell_price_pack` (harga per kemasan independent dari `sell_price` per eceran). Allow user kasih diskon grosir per karton vs eceran.
- **Backend Conversion Utility** (`backend/utils/uom.js`): `toBase()` / `fromBase()` / `pricePerBase()` — single source of truth untuk konversi unit. Dipakai di 4 backend flow.
- **Inflow Backend**: POST `/api/invoices` + POST `/api/purchase-orders` + receive endpoint auto-convert qty input → base unit + snapshot fields (`qty_in_unit`, `pack_size_at_*`, `source_qty_value/unit/pack_size` di inventory_batches) untuk audit trail lengkap.
- **Outflow Backend**: POST `/api/sales` convert qty → base sebelum FEFO deduct + sales_items snapshot. inventory_mutations tambah `qty_unit` + `qty_in_unit` untuk audit context.
- **invoice_items.unit column** (sebelumnya **MISSING** sama sekali): distributor invoice unit kini tersimpan. Kritis untuk multi-unit accuracy.
- **purchase_order_items**: tambah `qty_in_unit` + `pack_size_at_po` + `received_qty_in_unit` snapshot. Receive flow preserve unit (sebelumnya unit di-drop, qty dianggap pcs).

### Added (Frontend)

- **`frontend/src/constants/units.js`**: `BASE_UNITS` + `PACK_UNITS` lists + utility mirrors (`toBase`, `fromBase`, `isPackUnit`, `getProductUnits`, `formatQtyWithConversion`).
- **Product Form Modal** (InventoryDashboard): 4 field baru — Base Unit dropdown, Pack Unit dropdown (optional), Pack Size, Sell Price per Pack. UI hint live preview "1 karton (12 pcs) — Per pcs: Rp 20.833".
- **SalesOrderList**: unit dropdown smart (product-aware) + auto-fill price/HPP saat unit berubah (base ↔ pack) + conversion preview "📐 1 karton = 12 pcs" + auto-pickup `sell_price_pack` saat pack unit dipilih.
- **PurchaseOrderList**: unit dropdown + conversion preview.
- **InvoiceList**: ADD kolom Satuan (sebelumnya MISSING di UI) — dropdown dengan optgroup Eceran vs Kemasan.

### Display Updates

- **InventoryDashboard batch row**: append "240 pcs (= 20 karton)" preview kalau pack_size > 1.
- **PDF Nota Penjualan** (`generateNotaPDF.js`): qty cell display user-friendly form (qty_in_unit + unit), append "(= N pcs)" sub-line di product_name kalau pack dipakai. Audit transparency.
- **PDF Surat Pesanan** (`generateSPPDF.js`): qty cell pakai qty_in_unit snapshot.

### Backward Compatibility

- Schema migrations 100% additive (`ALTER TABLE ... IF NOT EXISTS` dgn sensible defaults `pack_size=1`). Existing data unchanged — `pack_size=1` artinya `qty == qty_in_unit` (no conversion).
- Existing nota/faktur lama tetap behave normal — snapshot fields default NULL = treat as base unit.
- Backfill `base_unit` dari kolom `unit` existing (one-time UPDATE di ensureSchema).

### Infrastructure

- **Git tag** `v1.5.1-pre-multi-unit` di-push sebelum overhaul — rollback aman.
- **Neon snapshot manual** dibuat user sebelum migration (33.51 MB di "production" branch).

---

## [v1.5.1-stable] - 2026-05-25

### Added (UX Enhancement: OpnameModal Inline Batch CRUD)

- **Add Batch dari Modal Opname**: Tombol "+ Batch Baru" di header produk di sisi kanan modal Stok Opname per-Batch. Buka `BatchFormModal` (mode 'add') secara nested (zIndex 2100 > opname 2000). Tidak perlu close modal opname lalu navigate ke ProductDrawer.
- **Edit + Delete + Adjust per Batch**: Setiap batch card kini punya icon row (Sliders/Pencil/Trash2) di pojok kanan atas. Adjust qty inline dengan alasan audit (wajib diisi). Delete soft (`is_active=FALSE`) dengan guard `qty_current = 0` di backend — error message muncul kalau qty > 0.
- **Empty State CTA**: Produk tanpa batch kini tampilkan tombol "+ Tambah Batch Pertama" (CTA inline biru) — bukan pesan static "Lakukan Stok Masuk dulu".

### Fixed (Backend Safety: Deleted Batch Tidak Bocor ke Nota)

- Audit menemukan 4 query backend yang baca `inventory_batches` dengan filter `qty_current > 0` TANPA filter `is_active`. Kalau ada batch soft-deleted dengan qty residual > 0 (race-condition edge case), bisa bocor ke flow stock-out/FEFO.
- **Patches**:
  - `backend/routes/inventory.js:205-207` — `/stock-out` FEFO query
  - `backend/routes/inventory.js:431` — opname legacy fallback FEFO
  - `backend/routes/inventory.js:538-543` — `/batches-by-product/:productId` (dropdown batch di nota)
  - `backend/routes/sales.js:157-163` — POST nota auto-stock-out FEFO
- Semua tambah `AND COALESCE(is_active, TRUE) = TRUE` (fail-safe untuk legacy NULL rows pre-v1.4.0).

### Infrastructure

- **Git tag `v1.5.0-pre-opname-crud`** di-push sebelum rework — rollback aman via `git checkout` atau `git revert`.
- **Reuse `BatchFormModal` & `inventoryAPI`** — zero duplikasi component/method. `stockIn`, `deleteBatch`, `adjustBatch`, `updateBatch`, `getProductBatches` sudah ada.
- **CI build pre-check** per `feedback_cra_ci_build_check.md` — `CI=true npm run build` lulus sebelum push.

---

## [v1.5.0-stable] - 2026-05-25

### Added (Major Feature: Liquid Glass Theme)

- **🪟 Liquid Glass Theme Overlay (Beta)**: Tema visual berbasis Apple Liquid Glass (WWDC25, iOS 26 / macOS 26 design language). Sidebar, modal, drawer, cards (stats Dashboard, Customer cards, welcome modal cards, changelog modal, kanban add/edit/trash modal, ConfirmModal, opname/batch/product modal) berubah jadi semi-transparent dengan backdrop blur + saturate + inner glow + subtle border.
- **Toggle di Login Page**: Tombol Sparkles icon di pojok kanan atas, sebelah Dark Mode toggle. Filled saat ON, outline saat OFF. First-time enable tampil warning modal (sekali aja, persist via `localStorage.habil_glass_warned`). Auto-detect device <4GB RAM via `navigator.deviceMemory` → tampil hint.
- **Animasi 350ms Crossfade**: CSS transition `cubic-bezier(0.4, 0, 0.2, 1)` untuk `backdrop-filter` + `background-color` + `box-shadow` + `border-color`. Icon Glass micro-animation: scale 1.08 saat aktif, scale 0.88 saat click (ripple). Body bg auto-transition.
- **3 Glass Tier (Apple HIG)**: Regular (frost 18px) untuk sidebar, Clear (24px) untuk modal/drawer/sheet, Ultra (12px) untuk toast/chip. Saturate 180% sesuai Apple guideline.
- **4 Tint Variants**: `glass-target--tint-blue/green/orange/purple` untuk accent overlay. Diterapkan ke 4 stats cards Dashboard sesuai metrik.

### Safety (Triple Layer)

- **Git Tag Backup**: `v1.4.2-pre-glass-stable` di-push sebelum mulai overhaul. Rollback via `git checkout` atau `git revert`.
- **URL Kill Switch**: `?glass=off` di URL force-disable walau localStorage ON. `?glass=on` force enable untuk demo.
- **Try-catch Wrapper**: `useGlassMode` hook wrap `localStorage` access + `body.classList.toggle()` → auto-disable + console.warn kalau gagal.
- **OS Preference Respect**: `@media (prefers-reduced-transparency: reduce)` → auto-disable glass walau toggle ON. `prefers-reduced-motion: reduce` → animasi jadi instant.
- **Browser Fallback**: `@supports not (backdrop-filter)` → fallback ke solid 92% opacity bg.

### Added (Infrastructure)

- **`frontend/src/styles/liquid-glass.css`**: Single source of truth untuk glass styling, scoped via `body.liquid-glass-active` class. Zero impact saat toggle OFF (specificity tidak match).
- **`frontend/src/hooks/useGlassMode.js`**: Centralized state hook dengan 3-tier resolution (URL > OS pref > localStorage).
- **Skill `frontend-design`** dari Anthropic terinstall di `~/.claude/skills/frontend-design/` untuk bantu Tailwind/CSS animation pattern.

### Excluded from Glass (Intentional)

Tabel rows (Inventory/Nota/Customer) — readability critical, tetap solid bg.
Form input fields — focus state harus crisp.
Severity badges (expired, low stock) — contrast critical.
TasksKanban container — terlalu banyak nested element, hanya modal-nya yang glass.
Toast notifications — durasi terlalu singkat, glass effect kurang impactful.

## [v1.4.2-stable] - 2026-05-25

### Fixed

- **Dashboard Dark Mode (Kanban)**: Section Manajemen Tugas + task cards + DRAG HERE TO DELETE zone + modal add/edit kini ikut dark mode. Root cause: `TasksKanban` di-render tanpa prop `isDarkMode` plus banyak hardcoded `bg-white/[0.x]` di komponen. Fix: pass props + ganti semua color jadi inline conditional + tambah dark variants `PRIORITY_COLORS`.
- **Inventory — Mini Stock Bar**: Bar visual di kolom Stok kini disembunyikan untuk produk tanpa `min_stock` (sebelumnya bar full-width nyasar). Tambah aria-label "Stok X dari minimum Y".
- **Inventory — Exp Terdekat Konsistensi**: Produk aman (>90 hari) tampil plain green text (tanpa badge bg), hanya yang mendekati/expired punya badge solid. Dark mode badge bg di-tuning ke tone gelap proper.
- **Nota Penjualan — Empty State Colspan**: Fix `colSpan={6}` → `7` di empty state + expanded item row (tabel jebol di tablet/mobile sebelumnya).

### Added

- **Nota Penjualan — Sort Header**: Klik header No.Nota / Tanggal / Total → toggle sort asc/desc dengan chevron indicator. Default Tanggal terbaru.
- **Nota Penjualan — Filter Empty State Smart**: Pesan empty state otomatis sesuai konteks ("Tidak ada nota yang cocok dengan filter" vs "Belum ada nota penjualan").
- **Customer — Aggregate Metadata**: Setiap card tampil badge `📄 N nota · 💰 Rp X.XM · ⏱ Last: tanggal`. Backend `GET /customers` join `sales_orders` (by customer_id + fallback name) untuk hitung total_orders, total_spent, last_sale_date.
- **Customer — Sort Dropdown**: A→Z / Z→A / Paling Aktif / Top Spender / Terlama Bertransaksi.
- **Customer — Empty Data Callout**: Customer tanpa telepon & alamat tampil banner orange "Lengkapi telepon & alamat →" (clickable → buka edit modal).
- **Customer — Empty State CTA**: Ganti generic "Belum ada customer" dengan ikon Users + CTA primary "Tambah Customer Pertama".
- **Accessibility**: Aria-label untuk semua icon button (Cetak/Edit/Hapus nota, Edit/Hapus customer, Stok in/out/edit/delete inventory). Toast pakai `role="status" aria-live="polite"`.

## [v1.4.1-stable] - 2026-05-24

### Added

- **Dark Mode di Login**: Toggle ☀️/🌙 di pojok kanan atas Login page. Preferensi tersimpan ke `localStorage.habil_dark_mode` dan persist saat lanjut ke main app — tidak perlu login dulu untuk ganti tema.
- **Welcome Modal Auto-Sync**: Popup "APA YANG BARU?" tiap login otomatis render dari `RELEASES[0].changes`. Setiap perubahan punya ikon + badge type (Sparkles/Wrench/Palette/Zap untuk feat/fix/ui/perf). Tidak hardcoded lagi — tinggal tambah RELEASES entry, modal auto-update.

### Changed

- **Roadmap Modal**: Password Hashing dihapus dari Upcoming Features karena sudah ter-implement sejak v1.3.40 (bcrypt dual-mode dengan auto-upgrade plaintext saat login).
- **Upcoming Features baru**: QR/Barcode Scanner, Predictive Restocking Alerts, TypeScript Migration ditambahkan sebagai planning publik.
- **Komentar `upcoming` array**: Tambah dokumentasi inline di `Dashboard.jsx` — fitur yang shipped harus DIHAPUS dari upcoming dan dipindah ke RELEASES[0].changes.

## [v1.4.0-stable] - 2026-05-24

### Added (Inventory Module Revamp)

- **Expandable Row per Produk**: Chevron di kolom pertama list — klik untuk lihat semua batch (No. Batch, ED, Qty, HNA) langsung tanpa pindah halaman. Sudah tidak misteri "ada batch apa di balik nama produk".
- **Detail Drawer (Slide-in dari Kanan)**: Klik nama produk → drawer 520px desktop / fullscreen mobile dengan 3 tab: **Profil** (master + total stok + nilai inventaris), **Batches** (CRUD lengkap: edit, adjust qty, hapus), **Riwayat** (20 mutasi terakhir dengan timeline).
- **Edit Batch Penuh**: Modal edit batch dengan field No. Batch, Tanggal Expired, HNA, Catatan. Untuk ubah qty pakai tombol **Adjust** yang menulis ke audit trail (alasan wajib).
- **Adjust Qty Batch**: Dialog adjust qty manual dengan field alasan wajib — semua adjustment tercatat sebagai mutation `adjust` dengan keterangan jelas.
- **Stok Opname Per Batch**: Modal opname total rombak — 2-pane layout (kiri list produk + search, kanan list batch dengan input fisik per batch). Selisih ke-trace ke batch spesifik di audit trail. Backward-compat dengan opname lama.
- **Tombol Stok Keluar di Header**: Sebelumnya hanya di icon row, sekarang prominent di toolbar (parity dengan Stok Masuk).
- **Filter Status Produk**: Dropdown filter di toolbar — Semua / Stok rendah / Mendekati expired / Sudah expired.
- **Mini Stock Bar**: Visual bar kecil di kolom Stok (qty vs min_stock ratio) dengan color coding hijau/orange/merah.
- **Endpoint Baru**: `GET /inventory/products/:id/full` (single payload product+batches+mutations untuk drawer), `PUT/DELETE /inventory/batches/:id`, `POST /inventory/batches/:id/adjust`, `GET /inventory/products/:id/batches`.

### Changed

- **Schema**: `stock_opname.batch_id` (nullable FK) + `inventory_batches.notes` + `inventory_batches.is_active` untuk soft-delete batch.
- **Opname Adjustment Logic**: Per-batch INSERT mutation type `in`/`out` dengan `reference_id = stock_opname.id` — audit trail lebih granular daripada per-product proportional FIFO lama.
- **Modal UX**: Loading state di tombol Simpan, error inline merah dengan ikon, Esc untuk tutup, click-overlay-to-close konsisten.
- **Realtime Emit**: `inventoryBatchUpdated` event ke Socket.io setelah edit/delete/adjust batch — drawer & list auto-refresh.

### Skills (Design System Bootstrap)

- Install Claude Code skill **ux-designer** (WCAG 2.2 AA, Apple HIG audit) + **design-auditor** (19-rule design review) di `~/.claude/skills/` untuk gating kualitas UI iterasi berikutnya.

## [v1.3.47-stable] - 2026-05-24

### Fixed (Critical)

- **Tambah Produk Gagal — Duplicate Key Constraint**: Error `duplicate key value violates unique constraint "product_master_pkey"` saat tambah produk baru di Inventory. Root cause: sequence `product_master_id_seq` tertinggal di angka lama setelah data migration Supabase → Neon (incident v1.3.11) — saat INSERT baru, sequence return ID yang sudah dipakai → tabrakan dengan baris existing. Fix: tambah `setval()` resync di `ensureSchema()` untuk 4 tabel SERIAL (`product_master`, `inventory_batches`, `inventory_mutations`, `stock_opname`). Idempotent, jalan tiap cold-start.

## [v1.3.46-stable] - 2026-05-11

### Fixed

- **Nota PDF — Layout 2 Halaman**: PDF nota tidak lagi terpecah menjadi 2 halaman. Root cause: fallback `finalY = pageHeight - 80` terlalu besar sehingga bank info check memicu `addPage()`, plus signature fixed di `pageHeight - 28` tanpa mempertimbangkan konten di atasnya. Fix: fallback diperbaiki, space pre-dihitung sebelum render, semua elemen bawah (NOTE, rekening, QRIS, tanda tangan) dipindahkan sekaligus jika tidak cukup ruang, signature kini mengikuti posisi konten (relatif, bukan fixed).

## [v1.3.45-stable] - 2026-05-11

### Fixed

- **Nota PDF Footer Sync**: "Dengan senang hati melayani anda" (dan semua data Pengaturan) kini benar-benar masuk ke PDF. Root cause: mismatch key `shop_name`/`footer` (yang disimpan UI) vs `company_name`/`footer_text` (yang dibaca PDF generator). Semua layer kini pakai key yang konsisten dengan fallback backward-compat.

### Added

- **Pengaturan Cetak — 4 Field Baru**: Nama Penanda Tangan, Info Rekening Bank, Teks QRIS, dan Ketentuan/Notes. Semua field langsung tampil di live preview Pengaturan.
- **Nota PDF — Hormat kami + Nama**: Garis tanda tangan kanan kini menampilkan label "Hormat kami," dan nama penanda tangan dari Pengaturan (sebelumnya hanya garis kosong dengan nama toko).
- **Nota PDF — NOTE/Ketentuan**: Field ketentuan pengembalian barang tampil merah bernomor di PDF (isi per baris di Pengaturan).
- **Nota PDF — Info Rekening & QRIS**: Rekening bank dan teks QRIS tampil di atas tanda tangan pada PDF nota.

## [v1.3.44-stable] - 2026-05-10

### Fixed (Critical)

- **Schema payment_status + paid_at**: Dua kolom ini kini dibuat otomatis via `ALTER TABLE IF NOT EXISTS` — dashboard stats laba kotor dan endpoint update status bayar tidak lagi crash pada fresh DB deployment.
- **Product Rename Sync**: Rename produk kini mengupdate `product_catalog`, `product_master`, dan `invoice_items` secara bersamaan — nama lama tidak lagi muncul di dropdown setelah rename.
- **Opname FOR UPDATE**: Deduction batch stok saat opname kini menggunakan `SELECT ... FOR UPDATE` — mencegah double-deduct jika 2 opname berjalan bersamaan untuk produk yang sama.
- **Batch Picker Expired Filter**: Dropdown pemilih batch di nota penjualan tidak lagi menampilkan batch yang sudah melewati `expired_date`.
- **Soft-delete GET/:id**: Faktur dan Surat Pesanan yang sudah dihapus kini mengembalikan 404 saat diakses via direct URL — sebelumnya masih bisa dibuka.
- **Over-receive Guard**: Penerimaan barang di Surat Pesanan kini divalidasi — tidak bisa menerima lebih dari qty yang dipesan, dengan error jelas dan ROLLBACK otomatis.
- **HPP NaN Fix**: Kolom HPP di daftar faktur tidak lagi menampilkan "NaN" untuk item dengan `hna_per_item = 0` atau undefined.

### Performance

- **API Timeout**: Timeout global Axios naik dari 10s → 30s — operasi besar seperti generate PDF tidak lagi gagal timeout di production.
- **Kanban History**: Hapus wasted API call (`tasksAPI.getAll`) yang terpanggil sia-sia setiap kali membuka history task.

## [v1.3.43-stable] - 2026-05-10

### Fixed (Critical)

- **FEFO Transaction Safety**: Stock deduction saat buat nota penjualan kini berada di dalam DB transaction (sebelum COMMIT) — mencegah race condition yang bisa menyebabkan stok negatif jika 2 user order produk sama bersamaan. Menggunakan `SELECT ... FOR UPDATE` untuk lock batch.
- **FEFO Expired Filter**: Batch yang sudah melewati `expired_date` tidak lagi digunakan untuk FEFO deduction — mencegah penjualan produk kadaluarsa.
- **Stok Kurang → Error + Rollback**: Jika stok tidak cukup untuk memenuhi nota, transaksi dibatalkan seluruhnya (ROLLBACK) dan user mendapat error jelas "Stok X tidak mencukupi (kurang: Y)" — sebelumnya nota tersimpan tapi stok tidak terpotong.
- **Invoice Create Transaction**: Simpan faktur masukan kini fully atomic — jika auto stock-in gagal di salah satu item, seluruh faktur di-rollback. Tidak ada lagi kondisi invoice tersimpan setengah-setengah.
- **Invoice Delete Cleanup**: Hapus permanen faktur kini juga menghapus `inventory_batches` dan `inventory_mutations` terkait — mencegah phantom stock yang menggelembungkan laporan stok.
- **Schema Missing Columns**: Tambah `ALTER TABLE IF NOT EXISTS` untuk `gross_profit` (sales_orders) dan `unit_hpp` (sales_items) — fresh DB deployment tidak lagi crash saat buat nota pertama.
- **Draft Clear Scoped**: Draft delete saat save invoice kini hanya hapus draft milik invoice yang bersangkutan, bukan SEMUA draft — mencegah draft user lain terhapus secara tidak sengaja.

### Performance

- **Invoice List N+1 Fix**: Hapus auto-expand semua baris faktur saat halaman dibuka — menghilangkan 50+ API calls beruntun yang membuat halaman berat. Faktur kini mulai collapsed, expand per-klik.

### UI

- **Filter Tahun Dinamis**: Dropdown filter tahun di Nota Penjualan kini auto-generate ±2 tahun dari tahun berjalan — tidak lagi hardcoded 2024-2026.

## [v1.3.42-stable] - 2026-05-10

### Added

- **Product MasterSelect di Nota Penjualan**: Dropdown produk pada form nota penjualan kini menggunakan komponen MasterSelect — lengkap dengan pencarian, tambah produk baru inline, rename, dan hapus produk (soft-delete). Konsisten dengan pola dropdown Customer.
- **HPP Auto-fill Reliable**: Saat memilih produk via MasterSelect, HPP/HNA otomatis terisi dari batch FEFO dan tetap bisa diedit manual per baris produk.

### Fixed

- **Error Feedback Inventory**: Pesan error saat menambah/mengedit produk di modul Inventory kini tampil dengan benar — toast merah (❌) dan pesan inline di dalam modal. Sebelumnya error ditampilkan sebagai toast hijau (✅) sehingga terkesan berhasil padahal gagal.

## [v1.3.41-stable] - 2026-05-05

### Added

- **Batch Number Faktur**: Field "No. Batch/Lot" per item di faktur masukan. Nilai ini tersimpan ke `invoice_items.batch_number` dan juga digunakan sebagai `batch_no` di `inventory_batches` saat auto stock-in — memungkinkan traceability batch ke level penjualan.
- **Tempo Pembayaran Nota**: Quick-select 7/14/30 hari di form nota penjualan. Klik tombol → `due_date` otomatis dihitung dari `sale_date`. Kolom `due_date` dan `payment_terms` (jumlah hari) kini tersimpan di DB.
- **Quick-Select Jatuh Tempo Faktur**: Tombol +1/+7/+21/+30 hari di form faktur masukan — mengisi `due_date` relatif terhadap `purchase_date` dengan satu klik. Tombol aktif di-highlight biru.
- **Dropdown Batch Harga di Nota**: Saat memilih produk di nota penjualan, sistem menampilkan dropdown semua batch tersedia (batch_no, ED, stok, HNA) dari `inventory_batches`. Pilih batch → HPP otomatis terisi. Endpoint baru: `GET /api/inventory/batches-by-product/:productId`.

### UI/UX

- **Animasi Overdue Faktur & Nota**: Badge "Terlambat Xh" beranimasi pulse (kelap-kelip halus) saat faktur/nota sudah melewati due_date — lebih mudah terlihat tanpa mengganggu keterbacaan.

### Fixed

- **Persistent Login (7 Hari)**: Token JWT diperpanjang dari 15 menit ke 7 hari — user tidak perlu login ulang setiap membuka browser di komputer yang sama.

## [v1.3.40-stable] - 2026-04-26

### Security

- **bcrypt Password Hashing**: Dual-mode migration — password plaintext otomatis di-hash bcrypt saat login pertama kali. Seed user baru langsung ter-hash.
- **Rate Limiting Login**: Endpoint `/api/auth/login` dibatasi 5 percobaan per 15 menit per IP menggunakan express-rate-limit.
- **Auth Middleware Tasks**: Semua endpoint `/api/tasks` kini memerlukan autentikasi JWT.

### Added

- **Validasi Hapus Customer**: Customer yang masih memiliki nota penjualan belum lunas tidak bisa dihapus (return 400 dengan pesan informatif).

### UI/UX

- **Toast Notifications**: Seluruh `alert()` browser (30+ lokasi) diganti dengan toast notification in-app di semua komponen.
- **PDF Loading State**: Tombol cetak di Nota Penjualan dan Surat Pesanan menampilkan "Membuat PDF..." dan di-disable selama proses.
- **Mobile Table Overflow**: Semua tabel (`<table>`) kini dibungkus `overflowX: auto` — dapat di-scroll horizontal di layar kecil.

### Fixed

- **Console.log Production**: Hapus 3 `console.log` debug dari Dashboard.jsx yang tidak diperlukan di production.

## [v1.3.39-stable] - 2026-04-29

### Added

- **Pelunasan Date Picker**: Klik badge "BELUM BAYAR" kini membuka modal konfirmasi dengan date picker — user bisa memilih tanggal pelunasan secara manual (bukan otomatis `NOW()`). Tanggal yang sudah tersimpan di bawah badge "LUNAS" juga bisa diklik (✏️) untuk diedit kapan saja.
- **Batalkan Pelunasan**: Modal edit pelunasan menampilkan tombol "Batalkan Pelunasan" untuk mengembalikan status nota ke Belum Bayar.
- **Channel Online/Offline**: Setiap nota penjualan kini memiliki flag saluran — 🏪 Offline (default) atau 🛒 Online/Marketplace. Berguna sebagai pembeda untuk keperluan laporan pajak (digunggung vs tidak digunggung). Flag ini hanya tampil di sistem, **tidak masuk PDF nota**.
- **Filter Saluran**: Filter bar Nota Penjualan kini memiliki dropdown "Semua Saluran / Offline / Online" untuk menyaring berdasarkan channel.
- **Badge Channel di Tabel**: Kolom Customer menampilkan badge kecil 🏪 OFFLINE / 🛒 ONLINE di bawah nama customer.
- **Field Saluran di Form**: Modal buat/edit nota memiliki dropdown "Saluran Penjualan" untuk memilih Offline atau Online/Marketplace.

### Technical

- Backend: `PATCH /sales/:id/payment-status` menerima `paid_at` opsional di body — jika dikirim dipakai, jika tidak fallback ke `NOW()`.
- Backend: Kolom `channel VARCHAR(10) DEFAULT 'offline'` ditambahkan ke tabel `sales_orders` via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (aman, data lama otomatis 'offline').
- Backend: `POST /sales` dan `PUT /sales/:id` menerima dan menyimpan field `channel`.

## [v1.3.38-stable] - 2026-04-23

### Fixed

- **Edit SP Loading State**: Tambah `isSaving` state pada form Edit SP — tombol "Simpan" berubah menjadi "Menyimpan..." dan di-disable saat request berlangsung. Error saat edit kini tampil inline di bawah form (sebelumnya tersembunyi).
- **Auto Counter SP Loncat**: `generatePONumber` kini sync `last_number` ke `MAX(actual non-deleted SP numbers)` sebelum increment — counter tidak loncat setelah SP dihapus.
- **Manual SP Nomor Deleted**: Ganti UNIQUE constraint kolom `po_number` menjadi partial unique index (`WHERE is_deleted = FALSE`) — nomor SP yang sudah dihapus kini bisa dipakai ulang tanpa error "sudah digunakan".
- **Edit SP Date Empty**: Sanitize `expected_date` dan `order_date` ke `null` di backend PUT route saat nilai kosong — mencegah error `invalid input syntax for type date: ""` saat edit SP dengan Estimasi Tiba dikosongkan.

## [v1.3.37-stable] - 2026-04-23

### Fixed

- **Duplicate Key Customer**: Reset sequence `customers_id_seq` otomatis saat server start — mencegah error "duplicate key violates constraint customers_pkey" saat menambah customer baru di form Nota Penjualan. Root cause: sequence tidak tersinkron setelah migrasi data dari Supabase.
- **Duplicate Key Bug Report**: Reset sequence `bug_reports_id_seq` otomatis saat server start — mencegah error saat mengirim laporan bug via form "Kirim Laporan".

### Changed

- **Cleanup Supabase**: Hapus semua referensi aktif Supabase dari kode (database.js, deep_migrate.js, env files). Sistem sepenuhnya berjalan di Neon PostgreSQL.
- **Infra**: Tambah `CREDENTIALS.local.md` (lokal, tidak di-commit) sebagai referensi terpusat untuk semua kredensial akses sistem.

## [v1.3.36-stable] - 2026-03-20

### Fixed

- **Release Notes Sync**: Sinkronisasi konten array `RELEASES` di `Dashboard.jsx` agar benar-benar sesuai dengan entri dari `CHANGELOG.md` terbaru (mulai dari v1.3.29 hingga v1.3.35).
- **Duplicate Document ID Error**: Mengubah error database mentah (kode 23505 constraint unique) saat user memasukkan Nomor SP atau Nota yang sudah ada di mode Manual, menjadi pesan error inline di form pembuatan dokumen.

## [v1.3.35-stable] - 2026-03-20

- **Counter Auto Desync**: Menambahkan logika di backend (`purchaseOrders.js` dan `sales.js`) untuk memverifikasi nomor dokumen saat `mode=Manual`. Jika digit ID dokumen manual lebih besar dari nilai _counter_ auto saat ini, nilai _last_number_ di tabel `document_counters` otomatis diperbarui untuk mencegah collision pada nomor berikutnya.

## [v1.3.34-stable] - 2026-03-20

### Fixed

- **Duplicate Key Error Items**: Me-reset _sequence_ ID pada tabel `purchase_order_items`, `sales_items`, dan `invoice_items` di database karena adanya ketidaksinkronan antara nilai `MAX(id)` dan `last_value` sequence (terutama pada tabel `invoice_items`). Hal ini memperbaiki error "duplicate key value violates unique constraint" saat menyimpan data dengan banyak produk.

## [v1.3.33-stable] - 2026-03-20

### Fixed / UX Polish

- **Counter Increment Refetch**: Memastikan frontend memanggil `fetchCounters()` sesudah pembuatan SP (Purchase Order) maupun Nota Penjualan agar angka Auto UI sinkron dengan _database index_ yang di-increment otomatis oleh backend.
- **Split Number Field UX**: Merombak UI pembuatan SP dan Nota khusus mode Manual. Prefix nomor dokumen (`HSB-SP-` dan `HSB-NOTA-`) kini _readonly_ untuk menghindari kesalahan modifikasi _prefix string_. Hanya blok angka yang bisa disunting, dengan fitur _autofocus_ saat toggle Manual diklik.

## [v1.3.32-stable] - 2026-03-20

### Fixed

- **Duplicate Key Error SP**: Sinkronisasi nilai _counter_ `document_counters` untuk Surat Pesanan menjadi `75` untuk mencegah collision dengan nomor SP manual (`SP26030001`).
- **Document Counters UI**: Memindahkan toggle Lock/Unlock (Auto/Manual) penomoran SP dan Nota langsung ke dalam Modal Create masing-masing. Mode Manual tidak akan meng-increment counter di database, mode Auto akan otomatis di-handle backend.

## [v1.3.31-stable] - 2026-03-20

### UX Polish

- **Konsistensi Bahasa**: Mengubah semua istilah UI ke Bahasa Indonesia (Trash -> Sampah, Invoice -> Faktur, Edit -> Ubah, dsb.)
- **Konsistensi Tombol Create**: Menyamakan format tombol tambah data menjadi "+ Buat/Tambah [Item]"
- **Custom Delete Modal**: Mengganti `window.confirm` bawaan browser dengan custom modal `ConfirmModal` pada aksi hapus (Customer, SP, Nota, Faktur, Transaksi)
- **Breadcrumb Navigation**: Menambahkan komponen `<Breadcrumb />` di semua halaman navigasi utama

## [v1.3.30-stable] - 2026-03-20

### Fixed

- **UX — Mobile Content Full-Width**: Content area sekarang 100% width di mobile (centralized `marginLeft` di `App.js` ProtectedRoute wrapper, removed dari semua 11 komponen). Ditambahkan `isMobile` hook + responsive padding.
- **UX — Alert Count Sync**: Alert counter header sinkron dengan isi tab Alert. Backend query `expiring` batches sekarang exclude batches yang sudah expired (`>= CURRENT_DATE`).
- **UX — Release Modal Per-Login**: `sessionStorage` key `habil_release_seen_*` di-clear saat logout. Modal "Apa yang Baru" sekarang muncul untuk setiap login baru.
- **UX — Form Validation Nota**: Validasi inline menggantikan `window.alert()`. Red border + pesan error Bahasa Indonesia di field Customer. Tombol "Buat Nota" disabled + "Menyimpan..." saat proses simpan.
- **UX — Loading Flicker**: Skeleton loader di header stats (produk, customer, nota, SP counts) mencegah flash "0 records" saat data sedang di-fetch.

## [v1.3.29-stable] - 2026-03-20

### Fixed

- **Bug — Task Creation HTTP 500**: Menambahkan validasi input (judul wajib), null-safe parameter binding (`due_date || null`, `pic || null`), dan error logging detail di endpoint `POST /api/tasks`. Root cause asli: transient error dari cold start Vercel — task terbuat di DB tapi response timeout. Sekarang lebih robust.
- **Bug — HPP Auto-fill = 0 dari FEFO Batch**: FEFO endpoint (`GET /inventory/fefo-hna/:productId`) sekarang menggunakan fallback 3 tier: batch HNA → product master HNA → sell_price. Sebelumnya return `hna: 0.00` karena batch DIANERAL punya `hna=0` di `inventory_batches` dan fallback ke `product_master.hna` juga 0. Sekarang return `hna: 36100` (dari `sell_price`).

## [v1.3.28-stable] - 2026-03-16

### Changed

- **UI/UX — Mobile Sidebar**: Redesign ke pattern **Modal Navigation Drawer** yang lebih premium: lebar 80% (max 300px), scrim/backdrop gelap (0.5) + blur, rounded ending edge, shadow lebih dalam, animasi slide+fade 280ms.
- **UX — Drawer Behavior**: Klik backdrop/klik menu item auto-close, swipe kiri untuk tutup, focus trap + Escape untuk tutup, dan prevent body scroll saat drawer terbuka.

## [v1.3.27-stable] - 2026-03-15

### Fixed

- **Bug — Section "Kepada Yth" hilang total di PDF Nota**: Root cause: tabel PDF punya `startY` fixed `margin+30` sehingga menimpa blok customer. Tabel sekarang mulai setelah blok customer (`addressY + padding`). Nama customer selalu tampil; alamat/telepon tampil hanya jika ada di DB.

## [v1.3.26-stable] - 2026-03-15

### Fixed

- **Bug — Alamat & telepon customer tidak muncul di PDF Nota**: API GET /api/sales sekarang JOIN customers untuk customer_phone; kolom customer_phone ditambah di sales_orders. Form Nota punya field Telepon, auto-fill dari customer terpilih. generateNotaPDF render address/phone hanya bila ada data.

## [v1.3.25-stable] - 2026-03-15

### Fixed

- **Bug — Alamat & telepon CV Habil tampil "-" di PDF Nota**: Normalisasi field mapping (shop_name→company_name, footer→footer_text). Hanya render baris alamat/telepon bila ada data; kosong di DB = baris tidak muncul. Refetch print_settings saat buka modal cetak dan sebelum generate PDF.

## [v1.3.24-stable] - 2026-03-15

### Fixed

- **Bug — Data Pengaturan (print_settings) hilang setelah refresh**: GET endpoint sekarang menormalisasi `setting_value` (parse JSON jika string dari DB/driver). BULK update memastikan nilai di-`JSON.stringify` sebelum INSERT. Data Pengaturan kini persisten setelah refresh, login ulang, atau buka dari device lain.

## [v1.3.23-stable] - 2026-03-15

### Fixed

- **Bug #1 — Header PDF SP**: Tampilkan `settings.address` dan `settings.phone` di bawah nama perusahaan, menggunakan `-` saat kosong.
- **Bug #2 — Audit log Invoice**: Render per-field diff `field: lama → baru` dengan visual `lama` merah strikethrough, `baru` hijau bold; fallback aman jika `snapshot` null/undefined.

## [v1.3.22-stable] - 2026-03-15

### Fixed

- **Bug #1 — Login Version Text**: Perbaiki kontras teks versi di halaman Login dari `text-white/40` menjadi `text-gray-700` agar terbaca jelas tanpa di-highlight.
- **Bug #2 — Release Modal Session**: Modal "Apa yang Baru" kini muncul otomatis setiap login baru menggunakan sessionStorage berbasis versi terbaru. Gunakan `habil_release_seen_v${version}` key untuk memastikan modal muncul ketika ada versi upgrade.

### Added

- **PROTOKOL A — Auto-Versioning**: Dokumentasi yang wajib dicek sebelum commit — include grep-command untuk memastikan versi file sinkron di seluruh frontend.
- **PROTOKOL B — Token Efficiency**: SOP untuk efisiensi token, baca file per range 100 baris, jangan dump seluruh file, dan progress ringkas.

## [v1.3.21-stable] - 2026-03-15

### Added

- **Fitur #1 — HNA/HPP per Batch**: Tambahkan field HNA/HPP di form Stok Masuk. Nilai default diambil dari master produk, bisa diubah manual per batch. Saat pilih produk di Nota Penjualan, HPP auto-fill dari batch FEFO (expired date paling dekat).
  - Kolom `hna` di tabel `inventory_batches` untuk menyimpan HPP per batch
  - Field HNA di form Stok Masuk dengan auto-fill dari product master
  - Endpoint `/inventory/fefo-hna/:productId` untuk get HPP dari batch FEFO
  - Auto-fill HPP di Nota Penjualan saat produk dipilih

- **Fitur #2 — Standarisasi Dropdown ke MasterSelect**: Refactoring semua dropdown master data ke komponen `MasterSelect` yang sama:
  - Dropdown Produk di Stok Masuk (InventoryDashboard): search + edit + hapus + tambah baru
  - Dropdown Distributor di Surat Pesanan (PurchaseOrderList): search + edit + hapus + tambah baru
  - Dropdown Customer di Nota Penjualan (SalesOrderList): sudah menggunakan MasterSelect sejak v1.3.20
  - Semua edit dan hapus dari dropdown langsung update database
  - Konsisten menggunakan 1 shared component MasterSelect

### Changed

- **Database**: Auto-migration menambah kolom `hna` ke `inventory_batches`.
- **API**: Updated `/inventory/stock-in`, Purchase Order receive, dan Invoice create untuk handle HNA per batch.

## [v1.3.20-stable] - 2026-03-15

### Fixed

- **Bug #1 — Header PDF**: Tampilkan alamat & nomor telepon CV Habil di bawah nama perusahaan di header kiri PDF Nota Penjualan. Data diambil dari tabel `print_settings`. Jika kosong, tampilkan placeholder "-".
- **Bug #2 — Label HPP**: Tambahkan label kolom "HPP" yang jelas di form Edit Nota. Perbarui placeholder dari "HPP" menjadi "0" untuk konsistensi dengan field lain.

### Added

- **Fitur #3 — Standarisasi Dropdown Customer**: Refactoring dropdown Customer di form Nota Penjualan menggunakan komponen `MasterSelect` (sama seperti dropdown Produk). Fitur baru:
  - 🔍 Search real-time dengan keyword filtering
  - ✏️ Edit customer inline
  - 🗑️ Delete customer langsung dari dropdown
  - ➕ Tombol "+ Tambah Baru" untuk menambah customer tanpa meninggalkan form
  - Semua perubahan langsung update database via API

## [v1.3.19-stable] - 2026-03-14

### Perubahan

- **Fitur**: Tempat Sampah (Trash) untuk Task Management.
- **Backend**: API `/trash`, `/restore`, dan `/permanent` delete untuk tasks.
- **UI/UX**: Modal interaktif Tempat Sampah di papan Kanban.
- **API**: Centralized `tasksAPI` di layanan frontend.

## [v1.3.18-stable] — 2026-03-14

### Fixed

- **Settings Save Bug**: Perbaikan error "Gagal menyimpan pengaturan" dengan implementasi bulk update API dan sinkronisasi state frontend-backend.

## [v1.3.17-stable] — 2026-03-14

### Added

- **Revenue & Profit Tracking**: Tracking status pembayaran (Paid/Unpaid) pada Nota Penjualan.
- **HPP CRUD**: Input HPP kustom per item di Nota Penjualan (HPP default dari Master Produk).
- **Laba Kotor**: Card statistik baru di Dashboard untuk memantau akumulasi laba kotor dari nota lunas bulan ini.
- **Auto-fill HPP**: Otomatis menarik harga HPP (hna) saat memilih produk di form nota.

### Changed

- **Dashboard Stats**: Reorganisasi card statistik untuk menyertakan Laba Kotor.
- **Sales Order API**: Kalkulasi `gross_profit` dipindahkan ke sisi server untuk integritas data.

## [v1.3.16-stable] — 2026-03-14

### Added

- **Mobile Responsive Sidebar**: Hamburger menu untuk layar kecil dengan overlay slide-in.
- **Prompt 2 — UI/UX Standardization**:
  - **PDF Nota**: Customer address now shown below customer name in Nota Penjualan PDF.
  - **PDF SP**: Distributor address now shown in "Kepada Yth." block of Surat Pesanan PDF.
  - **Pengaturan**: Settings page restored with live split-panel document preview (real-time).
  - **Mobile Sidebar**: Hamburger menu + slide-in sidebar with backdrop overlay for screens <768px.

## [v1.3.15-stable] - 2026-03-14

### Fixed

- **Bug #1 — PDF Print Error**: Added null-safety guards (`String(val || '')`) to all `jsPDF.text()` calls in `generateNotaPDF.js` and `generateSPPDF.js`. Prevents "Invalid arguments passed to jsPDF.text" crash on A5/A6 format.
- **Bug #2 — Blank Release Notes Modal**: Expanded `typeConfig` in `Dashboard.jsx` to include `feat`, `ui`, `docs`, `changed`, `stability` types. Added safe fallback so unknown types no longer crash the modal renderer.
- **Bug #3 — Drag-to-Delete Kanban**: Added `PATCH /api/tasks/:id/soft-delete` backend endpoint. Frontend now calls soft-delete (sets `is_deleted = TRUE`) instead of non-existent DELETE route. Tasks properly disappear from board without data loss.

## [v1.3.14-stable] - 2026-03-14

### Fixed

- **Bug Reports Restoration**: Standardized `bug_reports` schema in Neon.tech by renaming `created_at` to `reported_at` and adding missing columns (`steps`, `contact`, `user_agent`). Data parity is now fully restored in the UI.
- **UI Consistency**: Updated version labels across Dashboard, Login, and Sidebar to `v1.3.14-stable`.

## [v1.3.13-stable] - 2026-03-14

### Fixed

- **Build Failure Hotfix**: Removed unused variables and imports in `PrintSettings.jsx` that were blocking Vercel deployment (CI=true).

## [v1.3.12-stable] - 2026-03-14

### Added

- **Final Parity Audit**: Confirmed 100% data integrity across all migrated tables from Supabase to Neon.tech.
- **System Shutdown**: Finalized deployment and merged to main.

## [v1.3.11-stable] - 2026-03-14

### Added

- **Full Database Parity**: Successfully migrated all operational tables from Supabase to Neon.tech.
- **Premium Skeleton Loading**: Implemented across Bugs, Customers, Ledger, Kanban, and Print Settings.
- **Deep Migration Engine**: New robust script for cross-platform data synchronization.

### Fixed

- **Parsing Errors**: Resolved syntax and import issues in `BugReports.jsx` and `PrintSettings.jsx`.
- **Data Gap**: Fixed missing records in `employees`, `products`, and `custom_orders`.

### Changed

- **UX Refinement**: Replaced all legacy loading indicators with visual placeholders.

## [v1.3.11-stable] - 2026-03-14

### Fixed

- **Deep Data Migration**: Selesai memigrasikan data tabel `invoices`, `invoice_items`, `purchase_orders`, `purchase_order_items`, dan `bug_reports` dengan data parity 100%.
- **Database Schema**: Sinkronisasi kolom `disc_cod_per_item` dan `hna_after_cod` pada tabel `invoice_items` di Neon.

### Changed

- **Versioning**: Global bump ke v1.3.11-stable untuk menandai selesainya migrasi infrastruktur penuh.

## [1.3.10-stable] - 2026-03-14

### Changed

- **Session Shutdown**: Final audit versi global dan sin*Terakhir diupdate berdasarkan prosedur Auto-Versioning v1.3.13-stable*
- **Primary Database**: Neon.tech (PostgreSQL 17)
- **Status**: Stable & Migrated
- **Documentation**: Update [SUPERAPP_BRAIN.md](SUPERAPP_BRAIN.md) dan [FEEDBACK_LOG.md](FEEDBACK_LOG.md) dengan recap migrasi database.

## [1.3.9-stable] - 2026-03-14

### Fixed

- **Database Migration**: Full data migration completion from Supabase to Neon.tech. All tables (Users, Invoices, Products, etc.) are now successfully transferred.
- **Data Consistency**: Resolved schema mismatches between old Supabase data and new Neon table structures.

### Changed

- **Infrastructure**: Officially switched to Neon.tech serverless PostgreSQL as the primary database for improved performance.

## [1.3.8-stable] - 2026-03-14

### Changed

- **Infrastructure**: Migrasi database utama dari Supabase ke Neon.tech untuk performa yang lebih tinggi.
- **Backend**: Update konfigurasi database untuk mendukung koneksi Neon serverless.

## [1.3.7-stable] - 2026-03-14

### Changed

- **SOP Maintenance**: Evaluasi insiden missing DB schema di FEEDBACK_LOG dan penutupan log.

## [1.3.6-stable] - 2026-03-14

### Fixed

- **Database**: Migrasi skema `pic` pada tabel `tasks` untuk mencegah error 500 saat Simpan Tugas.
- **Stability**: Inisialisasi ulang seluruh skema Kanban pada database cloud.

## [1.3.5-stable] - 2026-03-14

### Fixed

- **Kanban Functionality**: Memperbaiki tombol "Simpan Tugas" yang tidak responsif pada modal pembuatan dan pengeditan tugas.
- **Kanban UI Consistency**: Menambahkan opsi prioritas "High" yang sebelumnya hilang pada modal pembuatan tugas.
- **State Integrity**: Sinkronisasi pembersihan state PIC dan form setelah data berhasil disimpan ke database.

## [1.3.4-standard] - 2026-03-14

### Changed

- **Session Shutdown Audit**: Finalisasi audit versi global, sinkronisasi label sistem ke v1.3.4-standard, dan pembaharuan log insiden infrastruktur.

## [1.3.3-standard] - 2026-03-14

### Added

- **Kanban PIC Assignment**: Menambahkan field Penanggung Jawab (PIC) pada modul Manajemen Tugas menggunakan `react-select`.

### Fixed

- **Database Connection Optimization**: Konsolidasi seluruh rute API ke _shared connection pool_ untuk mencegah error "MaxClientsInSessionMode".
- **Kanban Functional Fixes**: Perbaikan tombol "Simpan Tugas" yang tidak responsif dan sinkronisasi modal detail.

### Changed

- **Unified Navigation**: Mengubah label sidebar "Pengaturan Cetak" menjadi "Pengaturan" untuk cakupan fungsi yang lebih luas.
- **Global Version Sync**: Pembersihan total label versi lama (`v1.2.6`) di Dashboard dan sinkronisasi ke format v1.3.3-standard.

## [1.3.2-standard] - 2026-03-14

### Changed

- **Final Shutdown Audit**: Sinkronisasi log insiden, pembersihan dokumentasi, dan audit versi global untuk penutupan sesi yang stabil.

## [1.3.1-standard] - 2026-03-14

### Fixed

- **Invoice Filter Synchronization**: Menyatukan state filter bulan antara panel Rekap dan tabel utama untuk mencegah data yang tidak konsisten saat melakukan audit distributor.

## [1.3.0-standard] - 2026-03-14

### Added

- **Invoice Metadata Transparency**: Sekarang setiap faktur menampilkan informasi waktu input asli (timestamp database) untuk audit operasional yang lebih baik.
- **Robust HPP Engine**: Perbaikan bug HPP "0" melalui logika fallback yang lebih cerdas dan skrip migrasi data otomatis untuk record lama.

## [1.2.9-standard] - 2026-03-14

### Fixed

- **Vercel Build Stability**: Perbaikan lint error (unused variables) di `TasksKanban.jsx` yang menyebabkan build gagal saat deployment ke production.

## [1.2.8-standard] - 2026-03-14

### Changed

- **Formal Session Shutdown**: Finalisasi audit versi global dan sinkronisasi seluruh komponen UI ke state v1.2.8-standard.
- **Auto-Versioning Finalization**: Memastikan konsistensi label versi di Login, Dashboard, dan Walkthrough sebelum penutupan sesi.

## [1.2.7-standard] - 2026-03-14

### Added

- **Advanced Kanban Features**: Implementasi modal **Detail Tugas**, fitur **History Log** per tugas, dan area **Trash (Soft-Delete)**.
- **Improved Task UX**: Scroll internal di setiap kolom Kanban (max 3 kartu terlihat) untuk menjaga kerapian Dashboard.

### Changed

- **Dashboard Priority Layout**: Memindahkan modul **Manajemen Tugas** ke posisi paling atas Dashboard sebagai prioritas utama.
- **Popup Logic Optimization**: "Release Notes" sekarang hanya muncul sekali per sesi (session-based) melalui `sessionStorage`.
- **UI Refinement**: Compact "Akses Cepat" dan pengurangan label versi redundan.
- **Global Audit**: Penyelarasan versi v1.2.7-standard di seluruh sistem.

## [1.2.6-standard] - 2026-03-13

### Changed

- **Kanban Board Integration**: Penyatuan modul tugas langsung ke dalam Dashboard utama.
- **UI Refresh**: Catatan Developer dipindah ke popup dan pembersihan sidebar dari link `/tasks`.

## [1.2.5-hotfix-2] - 2026-03-13

### Changed

- **Global Version Synchronization**: Penyelarasan seluruh label versi menjadi v1.2.5-hotfix-2 di seluruh komponen UI (Login, Dashboard, Footer) dan dokumentasi master.
- **Consistency Fix**: Memastikan riwayat changelog di dashboard sinkron dengan dokumentasi fisik.

## [1.2.4] - 2026-03-13

### Changed

- **Session Shutdown**: Menutup sesi pengembangan v1.2.x dengan auditing menyeluruh.
- **Auto-Versioning Finalization**: Sinkronisasi global versi v1.2.5-hotfix-2 di seluruh komponen UI (Login, Dashboard) dan file dokumentasi master.

## [1.2.3] - 2026-03-13

### Changed

- **Documentation Consolidation**: Meluncurkan `SUPERAPP_BRAIN.md` sebagai file master tunggal yang menggabungkan README, Master Framework, dan Roadmap.
- **Dynamic Versioning SOP**: Menstandarisasi referensi versi secara dinamis ke CHANGELOG.md.
- **Auto-Versioning Protocol**: Menetapkan prosedur wajib kenaikan versi (SemVer) dan audit versi global setiap shutdown sesi.

## [1.2.2] - 2026-03-13

### Fixed

- **Database Schema**: Memperbaiki error `relation document_counters does not exist` di Supabase Production Singapore.
- **Counters Sync**: Melakukan inisialisasi data counter awal sesuai standar spreadsheet: SP (#63), Nota (#235), TT (#235).
- **Migration Script**: Menambahkan runner script `run_production_migration.js` untuk pemeliharaan database di masa depan.

## [1.2.1] - 2026-03-13

### Fixed

- **Lint & Build Fix**: Memperbaiki fungsi `closeReleaseModal` yang tidak terdefinisi di `Dashboard.jsx`, yang sebelumnya mencegah build produksi di Vercel.

### Added

- **Auto-Release Popup**: Menambahkan modal "APA YANG BARU?" yang merangkum fitur v1.1.9 & v1.2.0. Modal ini dikonfigurasi untuk tampil setiap kali user login ke dashboard.

### Optimized

- **Pre-Deployment Audit**: Memastikan konsistensi routing koneksi API menuju domain Vercel/Supabase Production dan menyesuaikan setup CORS.
- **Merge & Deployment**: Branch `dev` resmi digabungkan ke `main` dan deploy otomatis ke Vercel production server.

## [1.2.0] - 2026-03-13

### Added

- **SP Module Mastery**: Enhanced `distributors` table with `short_code`, `salesman_name`, and `salesman_phone`. Added a Many-to-Many pivot table `product_distributors`.
- **Master Distributor UI**: Added an inline edit modal inside the Purchase Orders form to update salesman details directly.
- **SP Editor Enhancements**: Added a PIC Dropdown for "Harun Al Rasyid" and "Fivin Soehaeni". Salesman contacts are dynamically displayed based on the selected Distributor.
- **A6 Print Layout for SP**: Developed a custom "Blue Area" PDF generation module (`generateSPPDF.js`) specifically sized for A6 format, featuring a centered header, tabular item list, and designated stamp/signature footer.

## [1.1.9] - 2026-03-13

### Changed

- **Branding & Identity**: Updated app-wide text references from "CV Habil Business System" to **"HABIL SUPERAPP"**. Implemented dynamic tab titles and replaced the favicon.

### Added

- **Document Counters Engine**: Introduced `document_counters` database table for SP, Nota, and TT to deprecate spreadsheet-based numbering.
- **Migration Protocol UI**: Added a System Controls section in Print Settings to Lock/Unlock automated document numbering, allowing manual input during the transition phase.

## [1.1.8] - 2026-03-13

### Optimized

- **Documentation Consolidation**: Menyatukan seluruh riwayat teknis dari `walkthrough.md` ke dalam `CHANGELOG.md` sebagai _Single Source of Truth_.
- **Database Performance**: Menambahkan index pada `product_master(name)` untuk mempercepat pencarian produk.
- **Security**: Mengamankan log API frontend agar tidak membocorkan URL produksi di konsol browser.

### Fixed

- **Startup Automation**: Integrasi `check-db.js` ke dalam `npm run dev` agar verifikasi database berjalan setiap startup.

## [1.1.7] - 2026-03-13

### Optimized

- **AI Efficiency Rules**: Mengadopsi protokol koding baru (Port 6543, Dynamic API URL, Dev Branch isolation).
- **Dynamic API Endpoint**: Frontend sekarang otomatis mendeteksi apakah berjalan di `localhost` (port 5002) atau production tanpa perlu ganti file `.env` manual.
- **Improved Connection SOP**: Mengutamakan Port 6543 untuk Supabase guna menghindari limitasi IPv4 DNS.

## [1.1.6] - 2026-03-12

### Added

- **Local Data Sync Utility**: Menambahkan `backend/scripts/sync-to-local.sh` untuk melakukan kloning data dari Supabase ke environment lokal MacBook.
- **Auto-Restore from Backup**: Melakukan restorasi data otomatis dari `cloud_migration_backup.sql` untuk memastikan login (`admin` / `<password-dihapus-dari-riwayat>`) dan data dashboard (37+ produk) langsung aktif di lokal.

## [1.1.5] - 2026-03-12

### Added

- **Cloud Database Bridge**: Memungkinkan environment lokal untuk terhubung langsung ke database Supabase via `DATABASE_URL`.
- **Database Diagnostic Script**: Menambahkan `backend/scripts/check-db.js` untuk memverifikasi koneksi database (Lokal vs Cloud) secara instan.

### Changed

- **Improved DB Logging**: Backend sekarang memberikan log yang jelas saat mencoba connect ke Lokal atau Cloud, dengan tips perbaikan jika koneksi gagal.

## [1.1.4] - 2026-03-12

### Added

- **Testing & QA (Skeleton Loading)**: Implementasi unit testing untuk komponen `Skeleton.jsx` dan integration testing untuk `Dashboard` serta `SalesOrderList`.
- **Test Infrastructure**: Menambahkan `setupTests.js` dengan polyfills untuk JSDOM (`TextEncoder`, `TextDecoder`) agar mendukung library eksternal dalam testing.

### Fixed

- **Dashboard Imports**: Memperbaiki missing React imports di `Dashboard.jsx` yang menyebabkan kegagalan rendering di environment testing.

## [1.1.3] - 2026-03-12

### Added

- **Skeleton Loading**: Implementasi visual skeleton loading di seluruh modul utama (Dashboard, Sales, Inventory, Invoices, Purchase Orders, dan Online Store) untuk meningkatkan UX saat pengambilan data.
- **Reusable Skeleton Component**: Komponen `Skeleton.jsx` baru yang fleksibel untuk berbagai bentuk dan ukuran placeholder.

## [1.1.2] - 2026-03-12

### Added

- **Dashboard Notes**: Menambahkan modul "Catatan Developer" di dashboard untuk memfasilitasi feedback dan laporan bug dari user.
- **Region Migration**: Selesai memindahkan infrastruktur (Vercel & Supabase) ke region **Singapore** untuk akses data instan.

### Changed

- **Version Sync**: Standarisasi versi v1.1.2 di halaman Login, Dashboard, dan Changelog untuk konsistensi sistem.

## [1.1.1] - 2026-03-12

### Added

- **Sales Order Filters**: Added Month and Year intuitive select filters on the `SalesOrderList` page.
- **Payment Method Integration**: Added `QRIS`, `Transfer`, and `Tunai` payment options. Integrated the persistence of these options directly to the database via `payment_method` and `payment_details`.
- **UI/UX Sales Revamp**: Implemented a modern table design for Sales Orders, including dynamic "Draft/Final" and "Metode Pembayaran" badges.

### Fixed

- **PDF Generation Layout**: Forced A5 and A6 paper sizes to render in _Landscape_ across 'Nota Penjualan' and 'Tanda Terima' types. Recalculated coordinates to prevent text overlapping in the header.
- **Save/Update Error 500**: Fixed database schema mismatch on `dashboard_dev` preventing successful saving of the new payment method features.
- **Month Filter Bug**: Fixed an issue where selecting "Semua Bulan" dynamically returned an empty array on the frontend UI.

## [1.1.0] - 2026-03-12

### Added

- **Dynamic Dashboard Stats API**: Implemented `/api/dashboard/stats` to fetch real-time analytics from the database instead of using mocked UI values.
- **Master Data Seeding**: Successfully migrated 76 rows of core data from legacy Excel sheets (`SEED_MIGRATION_HABIL.sql`) encompassing Distributors, Customes, and Product Masters.

## [1.0.1] - 2026-03-12

### Added

- **Dashboard UI Overhaul**: New modern layout with quick stats cards ("Akses Cepat").
- **Release History Modal**: Interactive popup showing changelog and roadmap history.
- **Cache Busting**: Version subtext updated to `v1.0.1` to force browser cache refresh of environment variables.

### Fixed

- **Database Connectivity**: Resolved "Login Failed" timeout issue by aligning frontend API ports with backend `dev` branch ports (5001 -> 5002).
- **React Environment Stubbornness**: Explicitly hardcoded fallback port in `api.js` to prevent stale caching of old server ports.

### Changed

- **Security Enhancements**: Removed 1-click "Direktur" and "Admin" demo login buttons from production/release UI.
- **Session Timeout**: JWT expiration shortened to `15m` for better session security and data collision prevention.

---

## [1.0.0] - 2026-03-12

### Added

- **Inventory Module**: Full FEFO (First Expired First Out) logic, stock opname, and low-stock alerts.
- **Purchase Order (SP)**: CRUD for purchase orders with automated PO numbers and inventory receive integration.
- **Online Store Integration**: CSV importers for Shopee and TikTok orders with profit calculation.
- **General Ledger (Buku Besar)**: Financial journaling with debit/credit and monthly category summaries.
- **Universal Search**: Sidebar search across modules.

---

## [0.6.3] - 2026-03-11

- ESLint fixes, code decluttering, and DB branch isolation.
