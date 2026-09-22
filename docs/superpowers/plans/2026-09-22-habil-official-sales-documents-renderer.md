# Habil Official Sales Documents — Plan 1: Model Kanonis + Renderer A4/A5/A6

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun model dokumen kanonis (`SalesDocumentViewModel`) dan renderer PDF baru (A4/A5/A6, monokrom print-first) yang menggantikan jalur render lama secara bertahap, tanpa mengubah nomor nota, stok, atau nilai transaksi.

**Architecture:** Satu fungsi murni `buildSalesDocumentViewModel(order, settings)` menjadi satu-satunya sumber data dokumen. Renderer baru `generateSalesDocumentPDF(order, options)` mengonsumsi view-model itu dan merakit PDF lewat blok konten + profil per-ukuran (A4 portrait formal, A5/A6 landscape ringkas). Renderer lama (`generateNotaPDF.js`) tetap utuh dan dipakai untuk `tanda terima`/`pinjaman` serta A5/A6 selama flag `documents_renderer_v2` masih `false`. Kolom DB baru bersifat additive (tanpa backfill) untuk menampung metadata legal & pengadaan.

**Tech Stack:** React 19 + Vite 8 (frontend), jsPDF 4 + jspdf-autotable 5 + jsbarcode (PDF), Vitest 4 + jsdom (test), Node.js + Express 5 + `pg` (backend), registry migrasi `backend/migrations/routeSchemas.js`.

**Spec:** `docs/superpowers/specs/2026-09-22-habil-official-sales-documents-design.md`

## Global Constraints

- Versi rilis saat ini **v1.67.17-stable**. Rilis Plan 1 menjadi **v1.67.18-stable**. Ikuti protokol `CHANGELOG.md` + `node scripts/check-version-consistency.mjs`.
- **JANGAN push ke origin.** Commit lokal per task di branch `feat/official-sales-documents`; push hanya atas perintah eksplisit Harun (aturan `ACTION_LOG.md`).
- **JANGAN menjalankan `npm run migrate:schema`** ke database mana pun tanpa izin eksplisit + backup. Database lokal menunjuk DB remote read-only; DDL akan ditolak. Eksekusi migrasi = langkah terpisah yang di-approve Harun.
- Migrasi DB **additive saja**, `IF NOT EXISTS`, tanpa backfill, tanpa UPDATE ke `sales_orders`/`sales_items` historis.
- Satu transaksi = satu `order_number` (`HSB-NOTA-{YYMM}{NNN}`). Tidak ada counter baru untuk A4/A5/A6.
- Dokumen **monokrom, print-first**: latar putih, tinta hitam/abu-abu, tanpa warna aksen, tanpa gradient/emoji. Hirarki lewat bobot, ukuran, alignment, ruang.
- Field kosong **disembunyikan**, tidak dicetak sebagai `null`/`undefined`/`-`.
- Renderer hanya **membaca** snapshot transaksi. Tidak ada mutasi stok/pembayaran/customer dari jalur dokumen.
- Nominal dihitung satu kali di model kanonis; renderer tidak menghitung ulang PPN/total dengan rumusnya sendiri.
- Pajak memakai **snapshot** (`sales_orders.ppn_rate`); order lama yang `NULL` memakai fallback legacy `0.11` (didokumentasikan, tidak mengubah dokumen historis yang sudah tercetak).
- Dokumen Habil **bukan Faktur Pajak**; referensi pajak hanya tampil bila nomornya benar-benar tercatat.
- `type: 'terima'` dan `type: 'pinjaman'` **tetap di renderer lama** pada Plan 1 (di luar cakupan spec dokumen resmi).
- Jalur lama dipertahankan di balik flag `documents_renderer_v2` (print_settings, default `false`) sampai Plan 2.
- Jangan menyentuh 2 file modified (`AGENTS.md`, `.gitignore`) dan file untracked lain yang bukan bagian task. Commit hanya file milik task.
- Test & build dijalankan sekali di akhir oleh mandor (aturan `CLAUDE.md`), bukan per subagent. Verifikasi per task = file test yang relevan saja.

---

## Peta Berkas

**Dibuat (frontend):**

| Berkas | Tanggung jawab |
|---|---|
| `frontend/src/utils/documents/salesDocumentModel.js` | View-model kanonis + total + formatting (murni, tanpa jsPDF) |
| `frontend/src/utils/documents/salesDocumentTheme.js` | Palet monokrom + profil ukuran (margin, font, kolom, blok) |
| `frontend/src/utils/documents/salesDocumentLayout.js` | Helper flow/pagination: ukur tabel, reservasi tail, header lanjutan |
| `frontend/src/utils/documents/generateSalesDocumentPDF.js` | Orkestrator renderer baru (entry point) |
| `frontend/src/utils/documents/monochromeLogo.js` | Ambil + cache logo monokrom sebagai data URL |
| `frontend/src/utils/documents/__fixtures__/salesDocumentFixtures.js` | 10 fixture sesuai spec §14 |
| `frontend/src/utils/documents/__fixtures__/salesDocumentGolden.js` | Ekspektasi golden yang di-review manual |
| `frontend/src/utils/documents/__fixtures__/pdfTestUtils.js` | Helper dump halaman PDF untuk assertion |
| `frontend/src/utils/documents/salesDocumentModel.test.js` | Test model |
| `frontend/src/utils/documents/generateSalesDocumentPDF.test.js` | Test invarian + golden renderer |

**Dimodifikasi:**

| Berkas | Perubahan |
|---|---|
| `backend/migrations/routeSchemas.js` | Bekukan slice migrasi + tambah migrasi `20260922_022_sales_document_legal` |
| `backend/scripts/test-schema-boundary.js` | Daftar `expectedMigrationIds` + assertion bootstrap |
| `backend/routes/sales.js` | POST/PUT menyimpan snapshot legal/pengadaan/`ppn_rate` |
| `backend/routes/customers.js` | Field legal customer master |
| `backend/scripts/test-route-http.js` | Assertion sumber untuk kolom baru |
| `frontend/src/components/CustomerList.jsx` | Form field legal customer |
| `frontend/src/components/SalesOrderList.jsx` | Seksi formal di form nota, ekspos A4, default format, routing flag |
| `frontend/src/services/api.js` | (bila perlu) tidak ada endpoint baru — hanya verifikasi |
| `CHANGELOG.md`, `SUPERAPP_BRAIN.md`, `README.md`, `frontend/src/components/Login.jsx`, `frontend/src/components/Sidebar.jsx`, `frontend/src/components/Dashboard.jsx`, `frontend/src/index.js`, `ACTION_LOG.md` | Rilis v1.67.18-stable |

---

### Task 1: Bekukan ID migrasi delta (perbaikan keamanan registry)

**Files:**
- Modify: `backend/migrations/routeSchemas.js:1121-1127`
- Test: `backend/scripts/test-schema-boundary.js` (tanpa perubahan di task ini)

**Interfaces:**
- Consumes: array `migrations` (literal, urut) di file yang sama.
- Produces: `DELTA_INVOICE_MIGRATION_IDS` (array ID eksplisit) dan `LEGACY_BASELINE_MIGRATION_IDS` (derivasi filter) — dipakai `bootstrapLegacySchemaMigrations` dan test.

**Konteks:** `LEGACY_BASELINE_MIGRATION_IDS = migrations.slice(0, -2)` rusak begitu ada migrasi baru di-append: migrasi ke-22 akan ikut dianggap baseline (tercatat "applied" tanpa dijalankan). Task ini membekukan perilaku SEBELUM menambah migrasi.

- [ ] **Step 1: Jalankan test boundary baseline (harus hijau sekarang)**

Run: `cd backend && npm run test-schema-boundary`
Expected: semua check lulus (baseline sebelum perubahan).

- [ ] **Step 2: Ganti slice menjadi ID eksplisit**

```js
// ID migrasi delta invoice dibekukan eksplisit. Jangan kembali memakai
// slice(-2): menambah migrasi baru di akhir array akan menggeser irisan dan
// membuat migrasi baru ikut tercatat sebagai baseline legacy.
const DELTA_INVOICE_MIGRATION_IDS = [
  '20260911_020_invoice_delta_edit',
  '20260911_021_invoice_edit_event_retention',
];

// Baseline = semua migrasi sebelum pasangan delta invoice. Migrasi yang
// ditambahkan setelah pasangan ini TIDAK termasuk baseline: ia hanya boleh
// dijalankan oleh runRouteSchemaMigrations biasa, bukan legacy bootstrap.
const LEGACY_BASELINE_MIGRATION_IDS = migrations
  .filter(({ id }) => id < DELTA_INVOICE_MIGRATION_IDS[0])
  .map(({ id }) => id);
```

- [ ] **Step 3: Jalankan test boundary (harus tetap hijau, tanpa perubahan test)**

Run: `cd backend && npm run test-schema-boundary`
Expected: PASS. Assertion `result.applied` tetap `['20260911_020_invoice_delta_edit', '20260911_021_invoice_edit_event_retention']` dan `appliedIds.size` tetap `LEGACY_BASELINE_MIGRATION_IDS.length + 2`.

- [ ] **Step 4: Commit**

```bash
git add backend/migrations/routeSchemas.js
git commit -m "fix: freeze legacy baseline migration ids before adding new migration"
```

---

### Task 2: Migrasi 022 — kolom legal/pengadaan + seed settings

**Files:**
- Modify: `backend/migrations/routeSchemas.js` (append sebelum `];` di baris ~1101)
- Modify: `backend/scripts/test-schema-boundary.js:9-31` (`expectedMigrationIds`)

**Interfaces:**
- Produces: kolom DB yang dibaca Task 3 (backend), Task 5 (form), Task 6 (model):
  - `customers`: `npwp`, `nik`, `entity_type`, `billing_address`, `shipping_address`, `pic_name`, `pic_position`, `work_unit`
  - `sales_orders`: `buyer_npwp`, `buyer_nik`, `buyer_entity_type`, `buyer_email`, `buyer_pic_name`, `buyer_pic_position`, `buyer_work_unit`, `billing_address`, `shipping_address`, `procurement_source`, `platform_order_number`, `purchase_order_number`, `package_number`, `contract_number`, `procurement_method`, `government_agency`, `ppn_rate`, `tax_invoice_status`, `tax_invoice_number`, `tax_invoice_date`
  - `print_settings`: key `nota_layout.npwp` + key baru `documents_renderer_v2` = `{"enabled": false}`

- [ ] **Step 1: Tambahkan migrasi ke registry**

Append sebelum `];` (baris ~1101), setelah migrasi `20260911_021_invoice_edit_event_retention`:

```js
{
  id: '20260922_022_sales_document_legal',
  async up(db) {
    // Additive saja — tanpa backfill, tanpa menyentuh baris transaksi historis.
    await db.query(`
      ALTER TABLE customers
        ADD COLUMN IF NOT EXISTS npwp VARCHAR(30),
        ADD COLUMN IF NOT EXISTS nik VARCHAR(30),
        ADD COLUMN IF NOT EXISTS entity_type VARCHAR(30),
        ADD COLUMN IF NOT EXISTS billing_address TEXT,
        ADD COLUMN IF NOT EXISTS shipping_address TEXT,
        ADD COLUMN IF NOT EXISTS pic_name VARCHAR(150),
        ADD COLUMN IF NOT EXISTS pic_position VARCHAR(100),
        ADD COLUMN IF NOT EXISTS work_unit VARCHAR(150)
    `);
    await db.query(`
      ALTER TABLE sales_orders
        ADD COLUMN IF NOT EXISTS buyer_npwp VARCHAR(30),
        ADD COLUMN IF NOT EXISTS buyer_nik VARCHAR(30),
        ADD COLUMN IF NOT EXISTS buyer_entity_type VARCHAR(30),
        ADD COLUMN IF NOT EXISTS buyer_email VARCHAR(150),
        ADD COLUMN IF NOT EXISTS buyer_pic_name VARCHAR(150),
        ADD COLUMN IF NOT EXISTS buyer_pic_position VARCHAR(100),
        ADD COLUMN IF NOT EXISTS buyer_work_unit VARCHAR(150),
        ADD COLUMN IF NOT EXISTS billing_address TEXT,
        ADD COLUMN IF NOT EXISTS shipping_address TEXT,
        ADD COLUMN IF NOT EXISTS procurement_source VARCHAR(30),
        ADD COLUMN IF NOT EXISTS platform_order_number VARCHAR(100),
        ADD COLUMN IF NOT EXISTS purchase_order_number VARCHAR(100),
        ADD COLUMN IF NOT EXISTS package_number VARCHAR(100),
        ADD COLUMN IF NOT EXISTS contract_number VARCHAR(100),
        ADD COLUMN IF NOT EXISTS procurement_method VARCHAR(50),
        ADD COLUMN IF NOT EXISTS government_agency VARCHAR(150),
        ADD COLUMN IF NOT EXISTS ppn_rate DECIMAL(5,4) DEFAULT 0.11,
        ADD COLUMN IF NOT EXISTS tax_invoice_status VARCHAR(20),
        ADD COLUMN IF NOT EXISTS tax_invoice_number VARCHAR(50),
        ADD COLUMN IF NOT EXISTS tax_invoice_date DATE
    `);
    // NPWP pindah dari hardcode frontend ke print_settings (hanya bila belum ada).
    await db.query(`
      UPDATE print_settings
         SET setting_value = setting_value || '{"npwp":"93.813.949.0-609.000"}'::jsonb,
             updated_at = NOW()
       WHERE setting_key = 'nota_layout'
         AND NOT (setting_value ? 'npwp')
    `);
    // Flag rollout renderer baru — default OFF (jalur lama tetap dipakai).
    await db.query(`
      INSERT INTO print_settings (setting_key, setting_value)
      VALUES ('documents_renderer_v2', '{"enabled": false}'::jsonb)
      ON CONFLICT (setting_key) DO NOTHING
    `);
  },
},
```

- [ ] **Step 2: Perbarui daftar migrasi yang diharapkan di test boundary**

Di `backend/scripts/test-schema-boundary.js`, tambahkan `'20260922_022_sales_document_legal',` setelah `'20260911_021_invoice_edit_event_retention',` (baris ~30).

- [ ] **Step 3: Jalankan test boundary**

Run: `cd backend && npm run test-schema-boundary`
Expected: PASS. Test "Migration registry executes once against a database mock" menjalankan `up()` migrasi baru terhadap mock; test legacy bootstrap tetap melaporkan `applied` = 2 ID delta invoice (migrasi 022 tidak ikut baseline).

- [ ] **Step 4: Verifikasi daftar migrasi tanpa koneksi DB**

Run: `cd backend && npm run migrate:schema:list`
Expected: daftar berakhir dengan `20260922_022_sales_document_legal`, tanpa baris `[DB] Attempting`.

- [ ] **Step 5: Commit**

```bash
git add backend/migrations/routeSchemas.js backend/scripts/test-schema-boundary.js
git commit -m "feat: add additive legal and procurement columns for official documents"
```

**Catatan eksekusi DB (di luar task, butuh izin Harun):** setelah semua task Plan 1 selesai dan direview, jalankan migrasi ke DB target dengan backup lebih dulu:
`ALLOW_SCHEMA_MIGRATION=true MIGRATION_TARGET_CONFIRM=<host> npm run migrate:schema`. Jangan jalankan sekarang.

---

### Task 3: Backend menyimpan snapshot legal/pengadaan/`ppn_rate`

**Files:**
- Modify: `backend/routes/sales.js:275-341` (POST) dan `backend/routes/sales.js:1112-1200` (PUT)
- Modify: `backend/routes/customers.js:71-98`
- Modify: `backend/scripts/test-route-http.js:98-116` (assertion sumber)

**Interfaces:**
- Consumes: kolom Task 2.
- Produces: `GET /api/sales` & `GET /api/sales/:id` mengembalikan field baru otomatis (`SELECT s.*`); payload POST/PUT menerima field baru dari Task 5.

- [ ] **Step 1: Tambah helper normalisasi di `sales.js`**

Dekat helper yang sudah ada di atas router (sekitar baris 12-25, setelah `normalizeBooleanField`):

```js
// Metadata dokumen resmi — string kosong dinormalkan ke NULL supaya renderer
// bisa menyembunyikan field yang tidak diisi.
const emptyToNull = (value) => {
  const text = String(value ?? '').trim();
  return text ? text : null;
};
const parsePpnRate = (value) => {
  const rate = parseFloat(value);
  if (!Number.isFinite(rate)) return 0.11; // snapshot default saat transaksi dibuat
  return Math.min(Math.max(rate, 0), 1);
};
const FORMAL_FIELDS = [
  'buyer_npwp', 'buyer_nik', 'buyer_entity_type', 'buyer_email',
  'buyer_pic_name', 'buyer_pic_position', 'buyer_work_unit',
  'billing_address', 'shipping_address',
  'procurement_source', 'platform_order_number', 'purchase_order_number',
  'package_number', 'contract_number', 'procurement_method', 'government_agency',
  'tax_invoice_status', 'tax_invoice_number',
];
const formalSnapshot = (body) => FORMAL_FIELDS.map((field) => emptyToNull(body[field]));
```

- [ ] **Step 2: POST — destructure + simpan**

Di `router.post('/')` (baris 276), tambahkan `... formalSnapshot` fields ke destructuring body: tambahkan `customer_email` dan sisanya dibaca lewat helper:

```js
  const formal = formalSnapshot(req.body);
  const ppnRate = parsePpnRate(req.body.ppn_rate);
  const taxInvoiceDate = emptyToNull(req.body.tax_invoice_date);
```

Lalu di `INSERT INTO sales_orders (...)` (baris 337-340) tambahkan 21 kolom baru setelah `status`:

```sql
, buyer_npwp, buyer_nik, buyer_entity_type, buyer_email, buyer_pic_name,
  buyer_pic_position, buyer_work_unit, billing_address, shipping_address,
  procurement_source, platform_order_number, purchase_order_number,
  package_number, contract_number, procurement_method, government_agency,
  ppn_rate, tax_invoice_status, tax_invoice_number, tax_invoice_date
```
dengan placeholder `$26..$45` dan parameter `...formal, ppnRate, taxInvoiceDate` (urutan harus sama persis dengan urutan kolom).

- [ ] **Step 3: PUT — destructure + simpan**

Di `router.put('/:id')` (baris 1113), pola yang sama. `UPDATE sales_orders SET ...` (baris ~1187-1192) tambahkan:

```sql
, buyer_npwp=$26, buyer_nik=$27, buyer_entity_type=$28, buyer_email=$29,
  buyer_pic_name=$30, buyer_pic_position=$31, buyer_work_unit=$32,
  billing_address=$33, shipping_address=$34,
  procurement_source=$35, platform_order_number=$36, purchase_order_number=$37,
  package_number=$38, contract_number=$39, procurement_method=$40, government_agency=$41,
  ppn_rate=$42, tax_invoice_status=$43, tax_invoice_number=$44, tax_invoice_date=$45
```
Parameter `$26..$45` = `...formalSnapshot(req.body), parsePpnRate(req.body.ppn_rate), emptyToNull(req.body.tax_invoice_date)`; geser `WHERE id=$25` menjadi `$46`.

Catatan: pada PUT, `ppn_rate` selalu ditulis dari payload. Form selalu mengirim `ppn_rate` (Task 5) sehingga nota lama yang diedit akan mendapat snapshot eksplisit — perilaku ini disengaja dan dicatat di CHANGELOG.

- [ ] **Step 4: customers.js menerima field legal**

Di `backend/routes/customers.js`:
- POST (baris 75) → `INSERT INTO customers (name, address, phone, type, npwp, nik, entity_type, billing_address, shipping_address, pic_name, pic_position, work_unit) VALUES ($1..$11)`.
- PUT (baris 90) → `UPDATE customers SET name=$1, address=$2, phone=$3, type=$4, npwp=$5, nik=$6, entity_type=$7, billing_address=$8, shipping_address=$9, pic_name=$10, pic_position=$11, work_unit=$12, updated_at=NOW() WHERE id=$13`.
- Gunakan normalisasi `emptyToNull` yang sama (duplikat kecil boleh; jangan impor dari sales.js).

- [ ] **Step 5: Perluas assertion sumber di test-route-http.js**

Tambahkan di dalam test "Sales edit preserves explicit batch selection..." (atau test baru di bawahnya):

```js
  await test('Sales routes persist official document snapshot fields', async () => {
    const salesSource = fs.readFileSync(
      path.join(__dirname, '..', 'routes', 'sales.js'),
      'utf8'
    );
    for (const column of ['buyer_npwp', 'government_agency', 'ppn_rate', 'tax_invoice_number']) {
      assert.ok(
        salesSource.includes(column),
        `sales.js must persist ${column} for official documents`
      );
    }
    assert.ok(
      salesSource.includes('FORMAL_FIELDS'),
      'sales.js must normalize formal fields through FORMAL_FIELDS'
    );
  });
```

- [ ] **Step 6: Jalankan test backend yang relevan**

Run: `cd backend && node scripts/test-route-http.js && node scripts/test-schema-boundary.js`
Expected: PASS. (Test berjalan dengan mock read-only; tidak menyentuh DB.)

- [ ] **Step 7: Commit**

```bash
git add backend/routes/sales.js backend/routes/customers.js backend/scripts/test-route-http.js
git commit -m "feat: persist legal and procurement snapshots on sales orders"
```

---

### Task 4: Field legal di Customer master (frontend)

**Files:**
- Modify: `frontend/src/components/CustomerList.jsx` (form modal, sekitar baris 930-980; state form; payload create/update)

**Interfaces:**
- Consumes: endpoint customers Task 3.
- Produces: data customer legal yang dipakai prefill form nota (Task 5).

- [ ] **Step 1: Baca pola form yang ada**

Baca `frontend/src/components/CustomerList.jsx` baris 900-1010 dan state form + handler simpan. Ikuti pola field yang sudah ada (label, `inputStyle`, grid) — jangan memperkenalkan komponen baru.

- [ ] **Step 2: Tambah field (kolom grid baru, urut setelah Alamat)**

Field baru, semua opsional, label singkat: `NPWP`, `NIK`, `Tipe Entitas` (select: `-`, `Perusahaan`, `Perorangan`, `Instansi`, `Rumah Sakit`, `Toko`), `Alamat Penagihan`, `Alamat Pengiriman`, `Nama PIC`, `Jabatan PIC`, `Satuan Kerja`. Semua dikirim apa adanya di payload create/update.

- [ ] **Step 3: Verifikasi build**

Run: `cd frontend && npm run build`
Expected: build sukses, 0 warning baru.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/CustomerList.jsx
git commit -m "feat: add legal customer fields for official documents"
```

---

### Task 5: Seksi formal di form Nota Penjualan (frontend)

**Files:**
- Modify: `frontend/src/components/SalesOrderList.jsx` (state form ~348-366; `blankItem` tidak berubah; `openAdd` ~1061; `openEdit` ~1089; prefill customer ~4156-4162; seksi baru setelah blok Alamat ~4232; payload otomatis lewat `{ ...form }` di ~1279)

**Interfaces:**
- Consumes: field legal customer (Task 4) untuk prefill; kolom order (Task 3).
- Produces: `form` memuat field formal yang otomatis terkirim di payload POST/PUT (`payload = { ...form, items }`), termasuk `ppn_rate` default `0.11`.

- [ ] **Step 1: Tambah field ke state form**

Di `form` state (baris 348-366) tambahkan:

```js
    buyer_npwp: "", buyer_nik: "", buyer_entity_type: "", buyer_email: "",
    buyer_pic_name: "", buyer_pic_position: "", buyer_work_unit: "",
    billing_address: "", shipping_address: "",
    procurement_source: "", platform_order_number: "", purchase_order_number: "",
    package_number: "", contract_number: "", procurement_method: "", government_agency: "",
    ppn_rate: 0.11, tax_invoice_status: "", tax_invoice_number: "", tax_invoice_date: "",
```

Samakan di `openAdd` (baris ~1061) dan `openEdit` (baris ~1089, ambil dari `order.<field> || ""`).

- [ ] **Step 2: Prefill dari customer master**

Di `MasterSelect` onChange customer (baris 4156-4162), tambahkan:

```js
                            if (match)
                              setForm((p) => ({
                                ...p,
                                customer_phone: match.phone || "",
                                customer_address: match.address || "",
                                buyer_npwp: p.buyer_npwp || match.npwp || "",
                                buyer_nik: p.buyer_nik || match.nik || "",
                                buyer_entity_type: p.buyer_entity_type || match.entity_type || "",
                                billing_address: p.billing_address || match.billing_address || "",
                                shipping_address: p.shipping_address || match.shipping_address || "",
                                buyer_pic_name: p.buyer_pic_name || match.pic_name || "",
                                buyer_pic_position: p.buyer_pic_position || match.pic_position || "",
                                buyer_work_unit: p.buyer_work_unit || match.work_unit || "",
                              }));
```

- [ ] **Step 3: Tambah seksi collapsible "Dokumen Resmi (A4)" setelah blok Alamat (baris ~4232)**

Seksi memakai `<details>`/`<summary>` atau tombol toggle sederhana + grid 2 kolom yang sudah dipakai form ini. Isi field: NPWP/NIK pembeli, Tipe Entitas, Email, Nama PIC, Jabatan PIC, Satuan Kerja, Alamat Penagihan, Alamat Pengiriman, Sumber Pengadaan (select: `-`, `e-Katalog`, `Pengadaan Langsung`, `Tender`, `Penunjukan Langsung`), No. Pesanan Platform, No. PO/SP, No. Paket, No. Kontrak/SPK, Metode Pengadaan, Instansi Pemerintah, PPN % (number, default 11, disimpan sebagai desimal di payload: `payload.ppn_rate = (parseFloat(form.ppn_rate) || 0) / 100` — tambahkan di blok payload setelah `payload.ppn_excluded`), Status/Nomor/Tanggal Faktur Pajak. Beri teks bantuan kecil: "Dipakai untuk Faktur Penjualan A4 (instansi/perusahaan). Kosongkan bila tidak perlu."

- [ ] **Step 4: Verifikasi build**

Run: `cd frontend && npm run build`
Expected: sukses, 0 warning baru.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SalesOrderList.jsx
git commit -m "feat: capture official document fields on sales nota form"
```

---

### Task 6: Fixture + model kanonis (TDD murni)

**Files:**
- Create: `frontend/src/utils/documents/__fixtures__/salesDocumentFixtures.js`
- Create: `frontend/src/utils/documents/salesDocumentModel.js`
- Create: `frontend/src/utils/documents/salesDocumentModel.test.js`

**Interfaces:**
- Consumes: `angkaKeTerbilang` dari `frontend/src/utils/angkaKeTerbilang.js`; bentuk order dari `GET /api/sales` (Task 3).
- Produces (dipakai Task 7-10):
  - `buildSalesDocumentViewModel(order, settings) → SalesDocumentViewModel` (bentuk persis spec §5)
  - `formatRupiah(value, decimals = 0) → string` (mis. `Rp 1.234.567`)
  - `formatDateID(value) → string` (mis. `13 Sep 2026`)
  - `formatQtyDisplay(item) → string` (mis. `12 pcs`)
  - `groupSaleItems(items) → item[]` (agregasi baris identik, port `generateNotaPDF.js:215-257`)
  - `computeTotals(order) → { productGross, discountTotal, dpp, vatRate, vatAmount, shippingCharge, paymentFee, grandTotal, amountInWords, ppnExcluded }`
  - `parseBankInfo(raw) → { bankName, accountNumber, accountName, raw }`
  - `hasProcurementData(procurement) → boolean`, `hasLegalBuyerData(buyer) → boolean`
  - `LEGACY_PPN_RATE = 0.11`

- [ ] **Step 1: Tulis fixture**

`frontend/src/utils/documents/__fixtures__/salesDocumentFixtures.js` — 10 fixture spec §14. Setiap fixture: `{ id, label, order, settings }`. Contoh kerangka (lengkapi 10 sesuai daftar spec):

```js
const BASE_SETTINGS = {
  company_name: 'CV HABIL SEJAHTERA BERSAMA',
  npwp: '93.813.949.0-609.000',
  address: 'Jl. Siwalankerto Tengah No.8, Wonocolo, Surabaya. 60236',
  phone: '0851-4117-5248',
  email: 'habil@example.com',
  bank_info: 'BCA CV HABIL SEJAHTERA BERSAMA 5603004174',
  signer_name: 'Harun Al Rasyid, S.Kom',
  ketentuan: 'HARAP MENGECEK KEMBALI BARANG YANG DITERIMA\nWAJIB VIDEO UNBOXING',
};

const item = (over = {}) => ({
  product_name: 'Produk Nutrisi Vanila 174 g',
  qty: 12, qty_in_unit: 12, unit: 'pcs', unit_price: 72000,
  batch_no_snapshot: '26T0506GU', expired_date_snapshot: '2027-12-02',
  ...over,
});

export const SALES_DOCUMENT_FIXTURES = [
  { id: 'single-item', label: '1 item sederhana', settings: BASE_SETTINGS,
    order: { order_number: 'HSB-NOTA-2609001', sale_date: '2026-09-13', payment_method: 'Tunai',
      customer_name: 'Toko Sehat', customer_phone: '0812-0000-0001', total: 72000,
      ppn_rate: 0.11, items: [item({ qty: 1, qty_in_unit: 1 })] } },
  // ... 9 fixture lain: five-items, many-items-multipage, long-names, batch-ada/tidak,
  // ppn-aktif / ppn-excluded / tarif-non-default (0.12), ongkir + payment_fee pass_on,
  // customer-instansi-formal (buyer_npwp + procurement lengkap + tax_invoice_number),
  // nilai-besar-pembulatan (mis. total 1234567.89 + ongkir 15000),
];
```

Daftar 10 fixture wajib (spec §14): `single-item`, `five-items`, `many-items-multipage`, `long-names`, `no-batch-meta`, `ppn-excluded`, `ppn-rate-snapshot-12`, `ongkir-and-fee`, `instansi-formal`, `large-rounded-amounts`.

- [ ] **Step 2: Tulis test model yang gagal**

`frontend/src/utils/documents/salesDocumentModel.test.js` — assertion kunci:

```js
import { describe, expect, it } from 'vitest';
import {
  LEGACY_PPN_RATE, buildSalesDocumentViewModel, computeTotals,
  formatDateID, formatQtyDisplay, formatRupiah, groupSaleItems, parseBankInfo,
} from './salesDocumentModel';
import { SALES_DOCUMENT_FIXTURES } from './__fixtures__/salesDocumentFixtures';

const fixture = (id) => SALES_DOCUMENT_FIXTURES.find((f) => f.id === id);

describe('computeTotals', () => {
  it('memisahkan DPP dan PPN dari nilai produk, ongkir tidak kena PPN', () => {
    const totals = computeTotals({ total: 1110000, ongkir: 100000, ppn_rate: 0.11, items: [] });
    expect(totals.shippingCharge).toBe(100000);
    expect(Math.round(totals.dpp)).toBe(909910);
    expect(Math.round(totals.vatAmount)).toBe(100090);
    expect(totals.grandTotal).toBe(1110000);
  });

  it('memakai tarif snapshot order, bukan konstanta', () => {
    const totals = computeTotals({ total: 1120000, ppn_rate: 0.12, items: [] });
    expect(totals.vatRate).toBe(0.12);
  });

  it('fallback 0.11 untuk order lama tanpa ppn_rate', () => {
    expect(computeTotals({ total: 1110000, items: [] }).vatRate).toBe(LEGACY_PPN_RATE);
  });

  it('ppn_excluded menyembunyikan DPP/PPN tanpa mengubah grand total', () => {
    const totals = computeTotals({ total: 500000, ppn_excluded: true, items: [] });
    expect(totals.ppnExcluded).toBe(true);
    expect(totals.dpp).toBe(0);
    expect(totals.vatAmount).toBe(0);
    expect(totals.grandTotal).toBe(500000);
  });

  it('payment_fee hanya dibebankan saat mode pass_on', () => {
    expect(computeTotals({ total: 100000, payment_fee: 2500, payment_fee_mode: 'pass_on', items: [] }).paymentFee).toBe(2500);
    expect(computeTotals({ total: 100000, payment_fee: 2500, payment_fee_mode: 'absorb', items: [] }).paymentFee).toBe(0);
  });
});

describe('groupSaleItems', () => {
  it('menggabungkan baris dengan snapshot batch identik', () => {
    const rows = groupSaleItems([item(), item()]); // gunakan helper lokal
    expect(rows).toHaveLength(1);
    expect(rows[0].qty).toBe(24);
  });
  it('tidak menggabungkan baris tanpa snapshot batch', () => {
    expect(groupSaleItems([
      { product_name: 'A', qty: 1, unit_price: 1000 },
      { product_name: 'A', qty: 1, unit_price: 1000 },
    ])).toHaveLength(2);
  });
});

describe('buildSalesDocumentViewModel', () => {
  it('mengisi kontrak spec §5 dari order + settings', () => {
    const { order, settings } = fixture('instansi-formal');
    const vm = buildSalesDocumentViewModel(order, settings);
    expect(vm.document.orderNumber).toBe(order.order_number);
    expect(vm.identity.companyName).toBe('CV HABIL SEJAHTERA BERSAMA');
    expect(vm.identity.npwp).toBe('93.813.949.0-609.000');
    expect(vm.buyer.npwpOrNik).toBe(order.buyer_npwp);
    expect(vm.procurement.governmentAgency).toBe(order.government_agency);
    expect(vm.totals.grandTotal).toBe(order.total);
    expect(vm.payment.bankName).toBe('BCA');
    expect(vm.payment.accountNumber).toBe('5603004174');
    expect(vm.signatures.issuerName).toBe(settings.signer_name);
  });

  it('menyembunyikan kelompok kosong tanpa nilai teknis', () => {
    const { order, settings } = fixture('single-item');
    const vm = buildSalesDocumentViewModel(order, settings);
    expect(vm.procurement.source).toBeNull();
    expect(vm.buyer.npwpOrNik).toBeNull();
    expect(vm.taxReference.number).toBeNull();
    expect(JSON.stringify(vm)).not.toMatch(/undefined|null,/); // tidak ada undefined bocor
  });
});

describe('formatting', () => {
  it('formatRupiah memakai pemisah id-ID', () => {
    expect(formatRupiah(1234567)).toBe('Rp 1.234.567');
  });
  it('formatDateID stabil untuk tanggal ISO', () => {
    expect(formatDateID('2026-09-13')).toBe('13 Sep 2026');
  });
  it('formatQtyDisplay memakai qty_in_unit', () => {
    expect(formatQtyDisplay({ qty: 12, qty_in_unit: 2, unit: 'karton' })).toBe('2 karton');
  });
  it('parseBankInfo memecah bank / nama / nomor rekening', () => {
    expect(parseBankInfo('BCA CV HABIL SEJAHTERA BERSAMA 5603004174')).toEqual({
      bankName: 'BCA', accountName: 'CV HABIL SEJAHTERA BERSAMA',
      accountNumber: '5603004174', raw: 'BCA CV HABIL SEJAHTERA BERSAMA 5603004174',
    });
  });
});
```

- [ ] **Step 3: Jalankan test, pastikan gagal**

Run: `cd frontend && npx vitest run src/utils/documents/salesDocumentModel.test.js`
Expected: FAIL — modul `./salesDocumentModel` belum ada.

- [ ] **Step 4: Implementasi model**

`frontend/src/utils/documents/salesDocumentModel.js` — implementasi lengkap:
- `computeTotals`: port rumus dari `generateNotaPDF.js:564-591` (grandTotal − ongkir − ccFee = productGross; `dpp = productGross / (1 + vatRate)`; `vatAmount = productGross − dpp`), `vatRate = Number(order.ppn_rate) || LEGACY_PPN_RATE` (guard: nilai `0` pun fallback), `discountTotal = 0` (belum ada data diskon — dicatat sebagai known gap), `amountInWords = (angkaKeTerbilang(grandTotal) + ' Rupiah').trim()`.
- `groupSaleItems`: port `generateNotaPDF.js:215-257` apa adanya (kunci agregasi identik, `hasQtyInUnit` dipertahankan).
- `buildSalesDocumentViewModel`: mapping sesuai kontrak spec §5; setiap field teks lewat `emptyToNull`-style normalisasi (string kosong → `null`); `buyer.billingAddress`/`shippingAddress` fallback ke `order.customer_address`; `document.paymentMethod` default `'Tunai'`; `items` dari `groupSaleItems` dengan `code: null` (product_master belum punya kolom kode — renderer menyembunyikannya); `totals` dari `computeTotals`.
- `parseBankInfo`: `bankName` = token pertama, `accountNumber` = token numerik terakhir (regex `/\d{6,}/`), `accountName` = sisanya, semua trim; bila tidak cocok pola, `bankName = null`, `accountName = null`, `accountNumber = null`, `raw` tetap diisi.

- [ ] **Step 5: Jalankan test, pastikan lulus**

Run: `cd frontend && npx vitest run src/utils/documents/salesDocumentModel.test.js`
Expected: PASS semua.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/utils/documents/
git commit -m "feat: add canonical sales document view model with fixtures"
```

---

### Task 7: Renderer engine + profil A4 (formal monokrom)

**Files:**
- Create: `frontend/src/utils/documents/salesDocumentTheme.js`
- Create: `frontend/src/utils/documents/salesDocumentLayout.js`
- Create: `frontend/src/utils/documents/generateSalesDocumentPDF.js`
- Create: `frontend/src/utils/documents/__fixtures__/pdfTestUtils.js`
- Create: `frontend/src/utils/documents/__fixtures__/salesDocumentGolden.js`
- Create: `frontend/src/utils/documents/generateSalesDocumentPDF.test.js`

**Interfaces:**
- Consumes: `buildSalesDocumentViewModel` (Task 6), `SALES_DOCUMENT_FIXTURES` (Task 6), `angkaKeTerbilang`, `JsBarcode`.
- Produces (dipakai Task 8, 9, 10, dan Plan 2):
  - `generateSalesDocumentPDF(order, options = {}) → jsPDF` — **sinkron**, `options = { format = 'A4', type = 'nota', settings = {}, vm }` (`vm` opsional untuk preview yang sudah punya view-model).
  - `DOCUMENT_PROFILES` dari theme: `{ A4, A5, A6 }` masing-masing `{ paper, orientation, margin, baseFontSize, titleFontSize, tableCellPadding, showParties2Col, maxProcurementRefs, batchMetaMode, showTaxRef, signatureCount, recommendedItems }`.
  - `MONO` palet: `{ ink: [17,17,17], sub: [90,90,90], faint: [150,150,150], rule: [190,190,190], headFill: [232,232,232], zebra: [248,248,248], white: [255,255,255] }`.

**Konteks porting (wajib dibaca sebelum implementasi):** `frontend/src/utils/generateNotaPDF.js` — header 48-150, customer 152-203, tabel + pengukuran 205-498, tail/summary 500-688, tanda tangan 690-720, footer 715-720. Logika pengukuran tabel (`measurementDoc` baris 441-470) dan reservasi tail adalah bagian yang sudah teruji — port apa adanya, jangan menciptakan ulang matematika pagination.

- [ ] **Step 1: Tulis helper test + test invarian yang gagal**

`__fixtures__/pdfTestUtils.js`:

```js
export const dumpPages = (doc) =>
  Array.from({ length: doc.getNumberOfPages() }, (_, index) =>
    (doc.internal.pages[index + 1] || []).join('\n'));
export const allText = (doc) => dumpPages(doc).join('\n');
```

`generateSalesDocumentPDF.test.js` — mock mengikuti `generateNotaPDF.test.js:1-14`:

```js
vi.mock('jsbarcode', () => ({ default: vi.fn() }));

import { generateSalesDocumentPDF } from './generateSalesDocumentPDF';
import { SALES_DOCUMENT_FIXTURES } from './__fixtures__/salesDocumentFixtures';
import { SALES_DOCUMENT_GOLDEN } from './__fixtures__/salesDocumentGolden';
import { allText, dumpPages } from './__fixtures__/pdfTestUtils';

const ONE_PIXEL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('generateSalesDocumentPDF', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
      configurable: true, value: () => ONE_PIXEL_PNG,
    });
  });

  it('A4 memuat judul formal, identitas, dan nomor nota', () => {
    const { order, settings } = SALES_DOCUMENT_FIXTURES[0];
    const doc = generateSalesDocumentPDF(order, { format: 'A4', settings });
    const text = allText(doc);
    expect(text).toContain('FAKTUR PENJUALAN');
    expect(text).toContain('CV HABIL SEJAHTERA BERSAMA');
    expect(text).toContain(order.order_number);
  });

  it('A4 tidak mencetak placeholder teknis untuk field kosong', () => {
    const { order, settings } = SALES_DOCUMENT_FIXTURES[0];
    const text = allText(generateSalesDocumentPDF(order, { format: 'A4', settings }));
    expect(text).not.toMatch(/undefined|null|NaN/);
    expect(text).not.toContain('Ditagihkan kepada');
  });

  it('field kosong tidak menghasilkan label yatim (kriteria #8)', () => {
    const { order, settings } = SALES_DOCUMENT_FIXTURES[0];
    const text = allText(generateSalesDocumentPDF(order, { format: 'A4', settings }));
    expect(text).not.toContain('NPWP Pembeli:');
    expect(text).not.toContain('No. PO');
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd frontend && npx vitest run src/utils/documents/generateSalesDocumentPDF.test.js`
Expected: FAIL — modul renderer belum ada.

- [ ] **Step 3: Implementasi theme + layout + engine A4**

`salesDocumentTheme.js`: palet `MONO` + `DOCUMENT_PROFILES` (A4 dulu; A5/A6 diisi Task 8/9 dengan bentuk yang sama). Nilai A4: `paper: 'a4', orientation: 'p', margin: 12, baseFontSize: 10, titleFontSize: 14, tableCellPadding: 1.8, showParties2Col: true, maxProcurementRefs: Infinity, batchMetaMode: 'always', showTaxRef: true, signatureCount: 3, recommendedItems: 12`.

`salesDocumentLayout.js`: port dari `generateNotaPDF.js`:
- `measureTable(profile, tableHead, tableBody) → { headHeight, bodyHeights }` (scratch doc + autoTable, baris 441-454).
- `planTableSplit({ bodyHeights, firstPageCapacity, finalPageCapacity }) → { initialRows, finalRows }` (baris 456-470).
- `drawContinuationHeader(doc, ctx)` (baris 393-409) — versi monokrom.
- `createTailFlow(doc, ctx) → { y, ensure(height), addPage() }` (baris 506-519) — cursor vertikal dengan reservasi.

`generateSalesDocumentPDF.js`: orkestrator:
1. `const vm = options.vm || buildSalesDocumentViewModel(order, options.settings || {})`.
2. `const profile = DOCUMENT_PROFILES[format]` (throw error jelas bila format tak dikenal).
3. Buat jsPDF sesuai `profile.paper`/`profile.orientation`; set font helvetica, warna `MONO.ink`.
4. Blok A4 berurutan: header perusahaan (logo opsional `vm.identity.logo` + nama + NPWP/alamat/telepon/email kiri, judul `FAKTUR PENJUALAN` + `SALES INVOICE` + barcode + nomor/tanggal/jatuh tempo/status kanan), garis rule tipis, para pihak 2 kolom (`Ditagihkan kepada` / `Dikirim kepada`, kolaps jadi satu kolom bila alamat identik) — blok ini hanya dirender bila `hasLegalBuyerData(buyer)` atau alamat pembeli tersedia, sehingga label tidak pernah muncul untuk pembeli walk-in tanpa alamat, referensi pengadaan (hanya bila `hasProcurementData`), tabel barang (kolom: No, Nama Barang (+ metadata kode/batch/ED), Qty, Satuan, Harga Satuan, Diskon, Jumlah; diskon disembunyikan bila semua nol), ringkasan nilai kanan (DPP, Diskon, PPN {rate}%, Ongkir, Biaya Lain, **GRAND TOTAL** bold), terbilang, blok pembayaran (rekening + termin), catatan + ketentuan, referensi faktur pajak (bila ada nomor), 3 area tanda tangan (Penerima / Pemeriksa / Hormat kami), footer `Halaman x dari y`.
5. Header lanjutan pada halaman >1: identitas ringkas + nomor dokumen + `Halaman x dari y`.
6. Barcode: port blok `generateNotaPDF.js:86-104` (CODE128, hitam, tanpa warna aksen).
7. Tail (ringkasan → tanda tangan) hanya di halaman terakhir; tabel mengisi halaman sebelumnya penuh (pakai `planTableSplit`).

- [ ] **Step 4: Jalankan test invarian, pastikan lulus**

Run: `cd frontend && npx vitest run src/utils/documents/generateSalesDocumentPDF.test.js`
Expected: PASS (golden test di step berikutnya).

- [ ] **Step 5: Tangkap golden dengan review eksplisit**

Buat `__fixtures__/salesDocumentGolden.js` dengan struktur `{ [fixtureId]: { A4: { pages, mustContain: [...] } } }`. Isi diambil dari render aktual TAPI harus diperiksa manual sebelum ditulis: jalankan skrip sementara `npx vitest run` dengan `console.log(dumpPages(doc))` untuk tiap fixture, baca halaman yang dihasilkan, lalu tulis ekspektasi (jumlah halaman + string penting: nomor nota, nama customer, total, terbilang, judul). **Dilarang menyalin output apa adanya tanpa membaca** (spec §14: bukan snapshot otomatis tanpa pemeriksaan).

Contoh entri:

```js
export const SALES_DOCUMENT_GOLDEN = {
  'single-item': {
    A4: { pages: 1, mustContain: ['FAKTUR PENJUALAN', 'HSB-NOTA-2609001', 'Toko Sehat', 'GRAND TOTAL', 'Tujuh puluh dua ribu rupiah'] },
  },
  // ... lengkapi per fixture × format saat Task 8/9 menambah A5/A6
};
```

Tambahkan test loop golden ke `generateSalesDocumentPDF.test.js`:

```js
it('golden render cocok untuk semua fixture (A4)', () => {
  for (const [fixtureId, perFormat] of Object.entries(SALES_DOCUMENT_GOLDEN)) {
    const { order, settings } = SALES_DOCUMENT_FIXTURES.find((f) => f.id === fixtureId);
    const doc = generateSalesDocumentPDF(order, { format: 'A4', settings });
    const golden = perFormat.A4;
    expect(doc.getNumberOfPages(), `${fixtureId} page count`).toBe(golden.pages);
    const text = allText(doc);
    for (const fragment of golden.mustContain) {
      expect(text, `${fixtureId} contains "${fragment}"`).toContain(fragment);
    }
  }
});
```

- [ ] **Step 6: Jalankan test penuh modul dokumen**

Run: `cd frontend && npx vitest run src/utils/documents/`
Expected: PASS semua (model + renderer + golden).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/utils/documents/
git commit -m "feat: add monochrome A4 official sales invoice renderer"
```

---

### Task 8: Profil A5 (nota bisnis ringkas)

**Files:**
- Modify: `frontend/src/utils/documents/salesDocumentTheme.js` (profil A5)
- Modify: `frontend/src/utils/documents/generateSalesDocumentPDF.js` (komposisi A5)
- Modify: `frontend/src/utils/documents/__fixtures__/salesDocumentGolden.js` (entri A5)
- Modify: `frontend/src/utils/documents/generateSalesDocumentPDF.test.js` (loop golden A5)

**Interfaces:**
- Consumes: engine Task 7.
- Produces: `DOCUMENT_PROFILES.A5` — `paper: 'a5', orientation: 'l', margin: 8, baseFontSize: 8, showParties2Col: false, maxProcurementRefs: 2, batchMetaMode: 'compact', showTaxRef: false, signatureCount: 2, recommendedItems: 7`.

- [ ] **Step 1: Isi profil A5 + komposisi**

Aturan spec §7: identitas + judul satu header horizontal; customer + referensi utama dua kolom ringkas; maksimal 2 referensi pengadaan; tabel barang/qty/satuan/harga/jumlah; batch+ED sebagai baris metadata kecil bila tersedia; DPP/PPN/ongkir/grand total di kanan; terbilang + rekening di kiri; dua tanda tangan (penerima + Habil). Target 1-7 item nyaman; 8-14 kepadatan lebih tinggi dalam batas keterbacaan.

- [ ] **Step 2: Tambah entri golden A5 + loop test**

Perluas test golden menjadi loop `['A4', 'A5']` — loop harus melewati format yang belum punya entri golden (`const golden = perFormat[format]; if (!golden) continue;`) — dan isi `SALES_DOCUMENT_GOLDEN[fixtureId].A5` setelah review manual seperti Task 7 Step 5.

- [ ] **Step 3: Jalankan test**

Run: `cd frontend && npx vitest run src/utils/documents/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/utils/documents/
git commit -m "feat: add monochrome A5 business nota renderer profile"
```

---

### Task 9: Profil A6 (nota operasional)

**Files:**
- Modify: `frontend/src/utils/documents/salesDocumentTheme.js` (profil A6)
- Modify: `frontend/src/utils/documents/generateSalesDocumentPDF.js` (komposisi A6)
- Modify: `frontend/src/utils/documents/__fixtures__/salesDocumentGolden.js` (entri A6)
- Modify: `frontend/src/utils/documents/generateSalesDocumentPDF.test.js` (loop golden A6 penuh)

**Interfaces:**
- Consumes: engine Task 7.
- Produces: `DOCUMENT_PROFILES.A6` — `paper: 'a6', orientation: 'l', margin: 5, baseFontSize: 7, showParties2Col: false, maxProcurementRefs: 1, batchMetaMode: 'fit', showTaxRef: false, signatureCount: 2, recommendedItems: 5`.

- [ ] **Step 1: Isi profil A6 + komposisi**

Aturan spec §8: header satu baris (identitas, judul, nomor, tanggal); barcode dekat nomor dengan ukuran minimum yang bisa dipindai; customer ringkas (nama, instansi bila ada, telepon); tabel barang/qty/harga/jumlah; satuan digabung ke qty; metadata batch/ED hanya bila muat; PPN satu baris; total paling dominan; terbilang, rekening ringkas, penerima + Habil; referensi eksternal maksimal satu nilai pendek berlabel `Ref:`. Konten panjang **tidak boleh dikecilkan di bawah ambang keterbacaan** — bila tidak muat, halaman lanjutan tetap membawa nomor dokumen + konteks customer (tidak ada halaman kosong khusus tanda tangan).

- [ ] **Step 2: Tambah entri golden A6 + loop penuh + test paritas antar ukuran**

Loop golden menjadi `['A4', 'A5', 'A6']` (tetap melewati format yang belum punya entri); isi ekspektasi A6 setelah review manual.

Tambahkan test paritas (kriteria penerimaan #2) ke `generateSalesDocumentPDF.test.js`:

```js
  it('grand total identik antar ukuran (kriteria penerimaan #2)', () => {
    const { order, settings } = SALES_DOCUMENT_FIXTURES.find((f) => f.id === 'five-items');
    const extract = (format) => {
      const text = allText(generateSalesDocumentPDF(order, { format, settings }));
      return text.match(/GRAND TOTAL: (Rp[^\n]*)/)?.[1];
    };
    const values = ['A4', 'A5', 'A6'].map(extract);
    expect(new Set(values).size).toBe(1);
  });
```

- [ ] **Step 3: Jalankan test penuh dokumen + pastikan test lama tetap hijau**

Run: `cd frontend && npx vitest run src/utils/documents/ src/utils/generateNotaPDF.test.js`
Expected: PASS. `generateNotaPDF.test.js` tidak boleh berubah sama sekali di Plan 1.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/utils/documents/
git commit -m "feat: add monochrome A6 operational nota renderer profile"
```

---

### Task 10: UI — ekspos A4, default konteks, routing flag, logo monokrom

**Files:**
- Create: `frontend/src/utils/documents/monochromeLogo.js`
- Modify: `frontend/src/components/SalesOrderList.jsx` (print state ~285-292; `fetchSettings` ~573-580; `handlePrintPDF` ~1609-1630; format selector ~5944-5990)

**Interfaces:**
- Consumes: `generateSalesDocumentPDF` (Task 7), flag `documents_renderer_v2` (Task 2), settings `nota_layout.npwp` (Task 2).
- Produces: operator bisa memilih A4 dan mencetaknya; A5/A6 memakai engine baru hanya bila flag `enabled: true`.

- [ ] **Step 1: Helper logo monokrom**

`frontend/src/utils/documents/monochromeLogo.js`:

```js
let cachedPromise = null;

// Ambil logo aplikasi lalu ubah ke grayscale via canvas — dokumen resmi
// memakai identitas monokrom (spec §4), dan konversi runtime menghindari
// aset biner baru di repo.
export function getMonochromeLogoDataUrl() {
  if (cachedPromise) return cachedPromise;
  cachedPromise = new Promise((resolve) => {
    if (typeof Image === 'undefined' || typeof document === 'undefined') return resolve(null);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.filter = 'grayscale(1) contrast(1.05)';
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (_) { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = '/logo192.png';
  });
  return cachedPromise;
}
```

- [ ] **Step 2: Baca flag + npwp di `fetchSettings`**

`fetchSettings` (baris 573-580) menyimpan `data.nota_layout`; tambahkan state `documentsV2` dari `data.documents_renderer_v2?.enabled === true`.

- [ ] **Step 3: Routing di `handlePrintPDF`**

Ganti isi handler (baris 1609-1630) menjadi:

```js
  const handlePrintPDF = async () => {
    if (!printOrder || pdfLoading) return;
    setPdfLoading(true);
    try {
      const settingsWithLogo = {
        ...layoutSettings,
        logo_data_url: await getMonochromeLogoDataUrl(),
      };
      const { format, type } = printOptions;
      const useNewEngine = format === 'A4' || (documentsV2 && type === 'nota');
      if (useNewEngine && type === 'nota') {
        const { generateSalesDocumentPDF } = await importWithReload(
          () => import('../utils/documents/generateSalesDocumentPDF'),
        );
        const doc = generateSalesDocumentPDF(printOrder, { format, type, settings: settingsWithLogo });
        doc.save(`Nota_${printOrder.order_number}.pdf`);
      } else {
        const { generateNotaPDF } = await importWithReload(() => import('../utils/generateNotaPDF'));
        const doc = generateNotaPDF(printOrder, { ...printOptions, settings: layoutSettings });
        doc.save(`${printOptions.type === 'terima' ? 'TT' : 'Nota'}_${printOrder.order_number}.pdf`);
      }
      await salesAPI.updatePdfStatus(printOrder.id, 'sudah_dicetak');
    } catch (e) {
      flash(e.message, 'error');
    } finally {
      setPdfLoading(false);
    }
  };
```

Catatan: `useNewEngine` hanya untuk `type === 'nota'`; `terima`/`pinjaman` tetap jalur lama (Global Constraints). Import logo aman dijalankan untuk kedua jalur (old engine mengabaikan `logo_data_url`).

- [ ] **Step 4: Ekspos A4 + default konteks**

1. Format selector (baris 5945): `["A5", "A6"]` → `["A4", "A5", "A6"]`; label sub-teks: A4 `(Portrait · Formal)`, A5 `(Landscape)`, A6 `(Landscape · Ringkas)`.
2. Tambahkan fungsi murni di file yang sama (dekat `openPrintOptions`):

```js
  // Default ukuran mengikuti konteks (spec §11). Sinyal formal = data legal/pengadaan.
  const defaultFormatFor = (order, customers) => {
    if (!order) return "A5";
    const hasFormal = Boolean(
      order.buyer_entity_type || order.buyer_npwp || order.buyer_nik ||
      order.government_agency || order.procurement_source || order.contract_number,
    );
    if (hasFormal) return "A4";
    const master = (customers || []).find((c) => c.name === order.customer_name);
    if (master?.type === "toko") return "A6";
    return "A5";
  };
```

3. `openPrintOptions` (baris 1694-1697): set `printOptions` dengan `format: defaultFormatFor(order, customers)`.
4. Radio "Tanda Terima (Khusus A6)" (baris 6048) tetap `disabled={printOptions.format !== "A6"}`.

- [ ] **Step 5: Verifikasi build**

Run: `cd frontend && npm run build`
Expected: sukses; chunk PDF lama tetap lazy (tidak ada import statis baru di bundle utama).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/utils/documents/monochromeLogo.js frontend/src/components/SalesOrderList.jsx
git commit -m "feat: expose A4 official invoice with flag-gated renderer routing"
```

---

### Task 11: Rilis v1.67.18-stable + dokumentasi

**Files:**
- Modify: `CHANGELOG.md` (entri baru di paling atas), `SUPERAPP_BRAIN.md` (`Current Version:`), `README.md`, `frontend/src/components/Login.jsx`, `frontend/src/components/Sidebar.jsx` (`appVersion`), `frontend/src/index.js`, `frontend/src/components/Dashboard.jsx` (`RELEASES[0]`), `ACTION_LOG.md`, `docs/superpowers/specs/2026-09-22-habil-official-sales-documents-design.md` (status)

**Interfaces:**
- Consumes: semua task sebelumnya.
- Produces: repo konsisten di `v1.67.18-stable`; `node scripts/check-version-consistency.mjs` lulus.

- [ ] **Step 1: Verifikasi penuh (sekali, oleh mandor)**

Run: `cd frontend && npm test && npm run build`
Expected: seluruh test hijau (termasuk `generateNotaPDF.test.js` lama), build sukses.

Run: `cd backend && npm test`
Expected: seluruh script test hijau.

- [ ] **Step 2: Tulis entri CHANGELOG**

`## [v1.67.18-stable] - 2026-09-22` — ringkas: model dokumen kanonis + renderer monokrom A4/A5/A6 (di balik flag `documents_renderer_v2`, default off), A4 resmi diekspos di Opsi Cetak dengan default mengikuti konteks, kolom legal/pengadaan additive + form customer/nota, NPWP pindah ke print_settings. Sebutkan batasan: preview PDF aktual & cutover A5/A6 menyusul di Plan 2.

- [ ] **Step 3: Bump versi di 6 berkas + tambah `RELEASES[0]` Dashboard**

Ikuti `scripts/check-version-consistency.mjs`: `Login.jsx` (`HABIL SUPERAPP v1.67.18-stable`), `Sidebar.jsx` (`const appVersion = "v1.67.18-stable"`), `index.js`, `SUPERAPP_BRAIN.md` (`Current Version: v1.67.18-stable`), `README.md`, `Dashboard.jsx` (entri RELEASES baru dengan `status: "latest"`, entri lama diubah `status: "previous"`).

- [ ] **Step 4: Jalankan checker**

Run: `node scripts/check-version-consistency.mjs`
Expected: `Version consistency OK: v1.67.18-stable`.

- [ ] **Step 5: Update ACTION_LOG.md + status spec**

Tandai Plan 1 selesai (belum di-push), catat: migrasi 022 **belum dijalankan** di DB mana pun, flag `documents_renderer_v2` masih `false`, Plan 2 (preview PDF aktual + validasi + cutover A5/A6) menyusul. Ubah status spec dari "rancangan tertulis untuk review pemilik" menjadi "disetujui; Plan 1 diimplementasikan, Plan 2 menyusul".

- [ ] **Step 6: Commit**

```bash
git add CHANGELOG.md SUPERAPP_BRAIN.md README.md ACTION_LOG.md \
  frontend/src/components/Login.jsx frontend/src/components/Sidebar.jsx \
  frontend/src/index.js frontend/src/components/Dashboard.jsx \
  docs/superpowers/specs/2026-09-22-habil-official-sales-documents-design.md
git commit -m "release: v1.67.18-stable — official sales document renderer core"
```

---

## Self-Review

**Spec coverage (Plan 1):**

| Spec | Task |
|---|---|
| §3 keputusan terkunci | Global Constraints + Task 10 (default konteks, tanpa counter baru) |
| §4 bahasa visual monokrom | Task 7 (`MONO`), Task 10 (logo monokrom) |
| §5 kontrak view-model | Task 6 |
| §6 A4 | Task 7 |
| §7 A5 | Task 8 |
| §8 A6 | Task 9 |
| §9 matriks informasi | Task 7-9 (profil per ukuran) |
| §11 alur operator (default konteks) | Task 10 |
| §13 konsistensi & keamanan | Global Constraints + Task 6 (satu fungsi kanonis) |
| §14 fixture + golden | Task 6-9 |
| §15 batas tahap pertama | Plan 1 = model + renderer + golden; preview PDF + validasi = Plan 2 |
| §16 konsekuensi implementasi | Task 7 (pisah blok vs pagination), Task 10 (status hanya setelah unduh sukses) |
| §17 keputusan lanjutan | Terkunci: logo monokrom; A4 default dari sinyal formal + override manual; batas item = `recommendedItems` profil; metadata formal minimum = kolom Task 2; flag di print_settings |

**Yang sengaja belum ada di Plan 1 (Plan 2):** preview PDF aktual (pdfjs-dist), panel validasi, toolbar/zoom/halaman, penghapusan `NotaPreview.jsx` HTML, cutover default A5/A6 + penghapusan jalur lama, migrasi `terima`/`pinjaman` ke engine baru.

**Known gaps yang dicatat, bukan bug:** `items[].code` selalu `null` (product_master belum punya kolom kode); `discount`/`discountTotal` selalu 0 (diskon saat ini menyatu di `unit_price`); `buyer.email` hanya dari input manual.

**Konsistensi nama:** `buildSalesDocumentViewModel` / `computeTotals` / `groupSaleItems` / `formatRupiah` / `formatDateID` / `formatQtyDisplay` / `parseBankInfo` / `generateSalesDocumentPDF` / `DOCUMENT_PROFILES` / `MONO` / `getMonochromeLogoDataUrl` — dipakai konsisten di seluruh task.

---

## Eksekusi

Plan ini dieksekusi dengan **superpowers:subagent-driven-development** (disarankan) atau **superpowers:executing-plans**. Buat branch dulu:

```bash
git checkout -b feat/official-sales-documents
```

Jangan push. Jangan jalankan migrasi DB. Setelah semua task: review manual Harun (buka Opsi Cetak, pilih A4 pada nota instansi, cek PDF), baru Plan 2 ditulis dan flag `documents_renderer_v2` dipertimbangkan untuk dinyalakan.
