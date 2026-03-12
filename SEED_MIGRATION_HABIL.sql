-- ============================================================
-- CV HABIL SEJAHTERA BERSAMA — SOFT MIGRATION SEED DATA
-- Generated from: CV_HABIL_2026.xlsx, DATA_CV_2025.xlsx
-- Target DB: dashboard_db (PostgreSQL 15)
-- Jalankan ini SEKALI saat setup awal / fresh database
-- ============================================================

-- ------------------------------------------------------------
-- 1. DISTRIBUTOR
-- ------------------------------------------------------------
INSERT INTO distributors (name) VALUES
  ('AMS'),
  ('AAM'),
  ('APL'),
  ('ENSEVAL'),
  ('JNI / PT JNI MITRAJAYA'),
  ('NUTRIFOOD'),
  ('PADMATIRTA WISESA'),
  ('PPG (PARIT PADANG)')
ON CONFLICT (name) DO NOTHING;


-- ------------------------------------------------------------
-- 2. MASTER PRODUK
-- Catatan:
--   - hna = Harga Netto Apotik (harga beli dari distributor)
--   - harga_jual = harga jual ke customer
--   - Data HNA yang kosong (NULL) perlu diisi manual nanti
--   - CLASSIC & DIABTX = TS SWEET CLASSIC / TS SWEET DIABTX (nama lengkap perlu dikonfirmasi)
--   - NUTRICAN ada 2 entri harga jual berbeda — pilih yang terbaru (90000)
-- ------------------------------------------------------------
INSERT INTO product_master (name, hna, sell_price, unit, is_active) VALUES
  ('TS SWEET CLASSIC',             84000,    88830,    'pcs',  true),
  ('TS SWEET DIABTX',              83000,    77167,    'pcs',  true),
  ('TS NFDM 1000G',               184000,   189810,    'pcs',  true),
  ('DIANERAL',                     36100,    36100,    'pcs',  true),
  ('ENSURE GOLD VANILA 850G',       NULL,   270000,    'pcs',  true),
  ('ENTRAMIX 555',                132000,   161520,    'pcs',  true),
  ('ENTRAMIX COKLAT 174G',          NULL,    60000,    'pcs',  true),
  ('ENTRAMIX VANILA 174G',          NULL,     NULL,    'pcs',  true),
  ('ENTRAKID VANILA 185G',          NULL,     NULL,    'pcs',  true),
  ('ENTRAKID COKLAT 185G',          NULL,     NULL,    'pcs',  true),
  ('ENTRASOY ALMOND SOYA 200G',   55000,    57173,    'pcs',  true),
  ('HEPATOSOL VANILA',            105000,   106560,    'pcs',  true),
  ('HEPATOSOL LOLA',              133500,   139150,    'pcs',  true),
  ('INFATRINI CAIR',                NULL,    35000,    'pcs',  true),
  ('ISOCAL 400G',                   NULL,    60960,    'pcs',  true),
  ('NEPHRISOL VANILA 201G',         NULL,    72960,    'pcs',  true),
  ('NEPHRISOL CAPPUCINO',           NULL,    72960,    'pcs',  true),
  ('NEPHRISOL D VANILA',          71000,    75600,    'pcs',  true),
  ('NEPHRISOL CAP',                 NULL,     NULL,    'pcs',  true),
  ('NUTRICAN',                      NULL,    90000,    'pcs',  true),
  ('NUTRINIDRINK 200ML',            NULL,    29000,    'pcs',  true),
  ('OLIGO BANANA 165G',           95000,    98903,    'pcs',  true),
  ('PEPTAMEN DEWASA',               NULL,   290115,    'pcs',  true),
  ('PEPTAMEN JUNIOR',               NULL,   304605,    'pcs',  true),
  ('PEPTIBREN VANILA',              NULL,    75000,    'pcs',  true),
  ('PEPTIMUNE VANILA',              NULL,    79380,    'pcs',  true),
  ('PEPTISOL VANILA',               NULL,    74655,    'pcs',  true),
  ('PEPTISOL COKLAT',               NULL,    74655,    'pcs',  true),
  ('PULMOSOL',                      NULL,    64260,    'pcs',  true),
  ('SGM ISOPRO ANANDA 6-12 400G',   NULL,    60480,    'pcs',  true),
  ('SGM LLM 200G',                  NULL,    43032,    'pcs',  true),
  ('SGM LLM 400G',                  NULL,    78435,    'pcs',  true),
  ('SUN KARA 200',                  NULL,     7250,    'pcs',  true),
  ('TS SWEETENER GULA JAWA 350ML',  NULL,    66292,    'pcs',  true),
  ('DSOL O CALSWEET',               NULL,     NULL,    'pcs',  true),
  ('FF UHT STRAWBERRY OMG 36X110ML',NULL,    NULL,    'karton',true)
;


-- ------------------------------------------------------------
-- 3. CUSTOMER OFFLINE
-- Catatan:
--   - Nomor telepon disimpan sebagai varchar (ada format campuran)
--   - Alamat beberapa masih kosong — perlu dilengkapi manual
-- ------------------------------------------------------------
INSERT INTO customers (name, phone, address) VALUES
  ('PAK AGUS',              '081216067775', 'AMS'),
  ('BABE SUWANDI',          '082229339779', 'Bulak Rukem Timur 2C No 45'),
  ('ALBERT',                NULL,           'Jl Kartini No 9'),
  ('Bu Aida',               '08123006848',  'Jl Dharmahusada Indah 1 No 41 Block B164'),
  ('BU HENNY',              '08123187674',  'Jalan Jambangan VII Baru No.10, Jambangan, Surabaya 60232'),
  ('BU SUSI',               NULL,           NULL),
  ('DENIK',                 '085732206226', NULL),
  ('ENDANG YULIATI',        '085232696024', NULL),
  ('emilyjoyceline',        NULL,           'Jl. Klampis Semolo Timur II Blok AB-12 No.46, Sukolilo 60119'),
  ('Husen Abdullah',        '081553309712', 'Sidosermo Indah Raya No 36'),
  ('Kris Tantular',         '085730879558', 'Jl. Ketintang Selatan 2/31 Surabaya'),
  ('Liana Halim',           '081333577722', 'Ruko Rungkut Megah Raya Blok B 30'),
  ('Mochamad Arif Sholichin','085655221855','Lapangan Dharmawangsa 74a, Gubeng, Surabaya 60286'),
  ('Nur Kholifah',          '083849191759', 'Simo'),
  ('Putut Adji Surjanto',   '081357262832', 'Jl. Rungkut Harapan Blok K/22'),
  ('RETNO ZAKARIA',         '081230076763', 'Klampis Semolo Timur XII No A-4'),
  ('SERA',                  '085277073710', NULL),
  ('Shantyindria',          '081235475349', 'Gubeng Kertajaya XI E No 12'),
  ('Suyono',                '082233499878', 'Northwest Lake Blok NG 20-29, Babat Jerawat, Pakal 60196'),
  ('Syahrul Mahrudin',      '085649010057', 'Dsn Karang Rejo RT002/RW001, Kandat, Kediri'),
  ('TOKO SUSU SURYA JAYA',  NULL,           NULL),
  ('Tonny Sutriono',        '087870006920', 'Jl. Gedangasin 2/74B, Tandes, Surabaya'),
  ('Vidi Yuliantoro',       '082230700312', NULL),
  ('WIDYANINGSIH',          NULL,           NULL),
  ('YUSRON',                '087850752958', 'Jalan Kalimas Hilir III No. 18, Pabean Cantikan 60162'),
  ('YULI APOTIK',           NULL,           NULL),
  ('RENY PRAST',            NULL,           'Jalan Menanggal V No 17C, Gayungan, Surabaya 60234'),
  ('TIONG',                 '08123010537',  'Kutisari'),
  ('Bpk. Moerwana',         '08123261392',  'Jl. Blimbing III No. 5 Pondok Candra Indah, Waru, Sidoarjo'),
  ('Rofiq Achmad',          '087838883343', 'IGD RSUD Dr Soetomo'),
  ('EMIL',                  '0895321163545','Jl Kyai Tambak Deres No 53A'),
  ('Nurul Aini Rizqon',     '0896-3903-9398','RSUD HAJI - ICCU')
;


-- ------------------------------------------------------------



-- ============================================================
-- CATATAN PENTING UNTUK DEVELOPER:
-- ============================================================
-- 1. Tabel yang harus ADA sebelum seed ini dijalankan:
--    distributors, product_master, customers
--
-- 2. Kolom yang WAJIB ada di tabel product_master:
--    id, name, hna, sell_price, unit, is_active
--    + expired_date tracking ada di tabel inventory_batches (per batch)
--
-- 3. Produk dengan nama duplikat (CLASSIC, DIABTX, NUTRICAN):
--    Sudah dibersihkan — gunakan nama lengkap (TS SWEET CLASSIC, dll)
--    Verifikasi ulang dengan owner sebelum go-live
--
-- 4. Nomor telepon customer:
--    Disimpan sebagai varchar karena format tidak konsisten
--    (ada yang pakai 0, +62, tanpa awalan)
--
-- 5. Seed terakhir dijalankan: v1.1.0 (12 Mar 2026)
--    Hasil: 8 distributors, 36 products, 32 customers
-- ============================================================

