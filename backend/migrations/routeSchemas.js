const bcrypt = require('bcryptjs');
const { DEFAULT_FEE_PROFILES } = require('../utils/pricingEngine');
const tax = require('../utils/tax');

const DEFAULT_PROFIT_THRESHOLDS = {
  high: 20,
  normal: 5,
  thin: 0,
};

const runLegacyOnce = async (db, key, fn) => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key VARCHAR(100) PRIMARY KEY,
      done_at TIMESTAMP DEFAULT NOW()
    )
  `);
  const { rows } = await db.query('SELECT 1 FROM schema_meta WHERE key = $1', [key]);
  if (rows.length > 0) return false;
  await fn();
  await db.query(
    'INSERT INTO schema_meta (key) VALUES ($1) ON CONFLICT (key) DO NOTHING',
    [key],
  );
  return true;
};

const migrations = [
  {
    id: '20260823_001_auth',
    async up(db) {
      await db.query(`
        CREATE TABLE IF NOT EXISTS app_users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          display_name VARCHAR(100),
          role VARCHAR(20) NOT NULL DEFAULT 'admin',
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      const { rowCount } = await db.query('SELECT 1 FROM app_users LIMIT 1');
      if (!rowCount) {
        const seedDirektur = process.env.SEED_DIREKTUR_PASSWORD;
        const seedAdmin = process.env.SEED_ADMIN_PASSWORD;
        if (!seedDirektur || !seedAdmin) {
          throw new Error(
            'app_users is empty; set SEED_DIREKTUR_PASSWORD and SEED_ADMIN_PASSWORD before migration',
          );
        }
        const hashDirektur = await bcrypt.hash(seedDirektur, 12);
        const hashAdmin = await bcrypt.hash(seedAdmin, 12);
        await db.query(
          `INSERT INTO app_users (username, password, display_name, role) VALUES
            ($1, $2, 'Direktur CV Habil', 'direktur'),
            ($3, $4, 'Admin Toko', 'admin')`,
          ['direktur', hashDirektur, 'admin', hashAdmin],
        );
      }
    },
  },
  {
    id: '20260823_002_inventory',
    async up(db) {
      await db.query(`
        CREATE TABLE IF NOT EXISTS product_master (
          id SERIAL PRIMARY KEY,
          code VARCHAR(50) UNIQUE,
          name VARCHAR(255) NOT NULL,
          unit VARCHAR(30) DEFAULT 'pcs',
          hna DECIMAL(15,2) DEFAULT 0,
          sell_price DECIMAL(15,2) DEFAULT 0,
          category VARCHAR(100),
          min_stock INT DEFAULT 5,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS inventory_batches (
          id SERIAL PRIMARY KEY,
          product_id INT NOT NULL REFERENCES product_master(id) ON DELETE CASCADE,
          batch_no VARCHAR(100),
          expired_date DATE,
          qty_current INT DEFAULT 0,
          hna DECIMAL(15,2) DEFAULT 0,
          source_type VARCHAR(30),
          source_ref VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS inventory_mutations (
          id SERIAL PRIMARY KEY,
          product_id INT NOT NULL REFERENCES product_master(id) ON DELETE CASCADE,
          batch_id INT REFERENCES inventory_batches(id),
          type VARCHAR(10) NOT NULL,
          qty INT NOT NULL,
          reference_type VARCHAR(30),
          reference_id INT,
          notes TEXT,
          created_by INT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS stock_opname (
          id SERIAL PRIMARY KEY,
          product_id INT NOT NULL REFERENCES product_master(id) ON DELETE CASCADE,
          system_qty INT NOT NULL DEFAULT 0,
          physical_qty INT NOT NULL DEFAULT 0,
          difference INT NOT NULL DEFAULT 0,
          notes TEXT,
          opname_date DATE NOT NULL DEFAULT CURRENT_DATE,
          created_by INT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_batches_product ON inventory_batches(product_id);
        CREATE INDEX IF NOT EXISTS idx_batches_expired ON inventory_batches(expired_date);
        CREATE INDEX IF NOT EXISTS idx_mutations_product ON inventory_mutations(product_id);
        CREATE INDEX IF NOT EXISTS idx_mutations_created ON inventory_mutations(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_mutations_product_created
          ON inventory_mutations(product_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_opname_date ON stock_opname(opname_date DESC);
        CREATE INDEX IF NOT EXISTS idx_product_master_name_lc ON product_master ((LOWER(TRIM(name))));
      `);
      await db.query(`
        ALTER TABLE inventory_batches
          ADD COLUMN IF NOT EXISTS hna DECIMAL(15,2) DEFAULT 0,
          ADD COLUMN IF NOT EXISTS tax_type VARCHAR(20) DEFAULT 'faktur',
          ADD COLUMN IF NOT EXISTS ppn_rate DECIMAL(5,4) DEFAULT 0.11
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS product_aliases (
          id SERIAL PRIMARY KEY,
          product_id INTEGER NOT NULL REFERENCES product_master(id) ON DELETE CASCADE,
          alias_name VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_product_aliases_norm
          ON product_aliases ((LOWER(TRIM(alias_name))));
        CREATE INDEX IF NOT EXISTS idx_product_aliases_product
          ON product_aliases (product_id)
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS batch_audit_log (
          id SERIAL PRIMARY KEY,
          batch_id INTEGER,
          product_id INTEGER,
          action VARCHAR(20) NOT NULL,
          changes JSONB,
          changed_by INTEGER,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_batch_audit_batch ON batch_audit_log(batch_id);
        CREATE INDEX IF NOT EXISTS idx_batch_audit_created ON batch_audit_log(created_at DESC)
      `);
      await db.query(`
        ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS notes TEXT;
        ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
        ALTER TABLE stock_opname ADD COLUMN IF NOT EXISTS batch_id INT REFERENCES inventory_batches(id);
        CREATE INDEX IF NOT EXISTS idx_opname_batch ON stock_opname(batch_id)
      `);
      await db.query(`
        ALTER TABLE product_master ADD COLUMN IF NOT EXISTS base_unit VARCHAR(30) DEFAULT 'pcs';
        ALTER TABLE product_master ADD COLUMN IF NOT EXISTS pack_unit VARCHAR(30);
        ALTER TABLE product_master ADD COLUMN IF NOT EXISTS pack_size INT DEFAULT 1;
        ALTER TABLE product_master ADD COLUMN IF NOT EXISTS sell_price_pack DECIMAL(15,2) DEFAULT 0;
        ALTER TABLE product_master ADD COLUMN IF NOT EXISTS weight_gram INT DEFAULT 0;
        ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS source_qty_value DECIMAL(15,4);
        ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS source_qty_unit VARCHAR(30);
        ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS source_pack_size INT;
        ALTER TABLE inventory_mutations ADD COLUMN IF NOT EXISTS qty_unit VARCHAR(30);
        ALTER TABLE inventory_mutations ADD COLUMN IF NOT EXISTS qty_in_unit DECIMAL(15,4)
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS product_price_tiers (
          id SERIAL PRIMARY KEY,
          product_id INT NOT NULL REFERENCES product_master(id) ON DELETE CASCADE,
          unit VARCHAR(30) NOT NULL,
          min_qty INT NOT NULL DEFAULT 1,
          max_qty INT,
          price DECIMAL(15,2) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_price_tiers_product_unit
          ON product_price_tiers(product_id, unit, min_qty)
      `);
      await runLegacyOnce(db, 'inventory_backfill_v1', async () => {
        await db.query(`SELECT setval('product_price_tiers_id_seq', COALESCE((SELECT MAX(id) FROM product_price_tiers), 0) + 1, false)`);
        await db.query(`UPDATE product_master SET base_unit = unit WHERE (base_unit IS NULL OR base_unit = 'pcs') AND unit IS NOT NULL AND unit != ''`);
        await db.query(`SELECT setval('product_master_id_seq', COALESCE((SELECT MAX(id) FROM product_master), 0) + 1, false)`);
        await db.query(`SELECT setval('inventory_batches_id_seq', COALESCE((SELECT MAX(id) FROM inventory_batches), 0) + 1, false)`);
        await db.query(`SELECT setval('inventory_mutations_id_seq', COALESCE((SELECT MAX(id) FROM inventory_mutations), 0) + 1, false)`);
        await db.query(`SELECT setval('stock_opname_id_seq', COALESCE((SELECT MAX(id) FROM stock_opname), 0) + 1, false)`);
      });
    },
  },
  {
    id: '20260823_003_sales',
    async up(db) {
      await db.query(`
        CREATE TABLE IF NOT EXISTS sales_orders (
          id SERIAL PRIMARY KEY,
          order_number VARCHAR(50) UNIQUE NOT NULL,
          customer_id INT,
          customer_name VARCHAR(150) NOT NULL,
          customer_address TEXT,
          sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
          total DECIMAL(15,2) DEFAULT 0,
          payment_method VARCHAR(20) DEFAULT 'Tunai',
          payment_details TEXT,
          status VARCHAR(20) DEFAULT 'draft',
          pdf_status VARCHAR(20) DEFAULT 'belum_dicetak',
          notes TEXT,
          is_deleted BOOLEAN DEFAULT FALSE,
          created_by INT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS sales_items (
          id SERIAL PRIMARY KEY,
          sales_order_id INT NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
          product_name VARCHAR(255) NOT NULL,
          qty INT NOT NULL DEFAULT 1,
          unit VARCHAR(30) DEFAULT 'pcs',
          unit_price DECIMAL(15,2) NOT NULL DEFAULT 0,
          subtotal DECIMAL(15,2) NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_sales_orders_date ON sales_orders(sale_date DESC);
        CREATE INDEX IF NOT EXISTS idx_sales_orders_customer ON sales_orders(customer_name);
        CREATE INDEX IF NOT EXISTS idx_sales_items_order ON sales_items(sales_order_id);
        CREATE INDEX IF NOT EXISTS idx_sales_orders_active_status_date
          ON sales_orders(is_deleted, status, sale_date DESC)
      `);
      for (const statement of [
        `ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(30)`,
        `ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS channel VARCHAR(10) DEFAULT 'offline'`,
        `ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS due_date DATE`,
        `ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS payment_terms INTEGER`,
        `ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS gross_profit DECIMAL(15,2) DEFAULT 0`,
        `ALTER TABLE sales_items ADD COLUMN IF NOT EXISTS unit_hpp DECIMAL(15,2) DEFAULT 0`,
        `ALTER TABLE sales_items ADD COLUMN IF NOT EXISTS unit_hpp_tax_type VARCHAR(20) DEFAULT 'faktur'`,
        `ALTER TABLE sales_items ADD COLUMN IF NOT EXISTS unit_hpp_ppn_rate DECIMAL(5,4)`,
        `ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'unpaid'`,
        `ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP`,
        `ALTER TABLE sales_items ADD COLUMN IF NOT EXISTS qty_in_unit DECIMAL(15,4)`,
        `ALTER TABLE sales_items ADD COLUMN IF NOT EXISTS pack_size_at_sale INT`,
        `ALTER TABLE sales_items ADD COLUMN IF NOT EXISTS batch_no_snapshot VARCHAR(100)`,
        `ALTER TABLE sales_items ADD COLUMN IF NOT EXISTS expired_date_snapshot DATE`,
      ]) await db.query(statement);
      await db.query(`
        CREATE TABLE IF NOT EXISTS document_counters (
          doc_type VARCHAR(20) PRIMARY KEY,
          prefix VARCHAR(30),
          last_number INTEGER DEFAULT 0,
          last_yymm VARCHAR(4),
          is_active BOOLEAN DEFAULT TRUE
        )
      `);
      for (const statement of [
        `ALTER TABLE document_counters ADD COLUMN IF NOT EXISTS last_yymm VARCHAR(4)`,
        `ALTER TABLE sales_orders DROP CONSTRAINT IF EXISTS sales_orders_order_number_key`,
        `CREATE UNIQUE INDEX IF NOT EXISTS sales_orders_order_number_active_idx ON sales_orders(order_number) WHERE is_deleted = FALSE`,
        `ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS ongkir DECIMAL(15,2) DEFAULT 0`,
        `ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS ongkir_cost DECIMAL(15,2) DEFAULT 0`,
        `ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS payment_fee_rate NUMERIC(7,5) DEFAULT 0`,
        `ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS payment_fee_mode VARCHAR(10) DEFAULT 'absorb'`,
        `ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS payment_fee DECIMAL(15,2) DEFAULT 0`,
        `ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS settlement_amount DECIMAL(15,2)`,
        `ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS package_weight_gram INT DEFAULT 0`,
        `ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS est_weight_gram INT DEFAULT 0`,
        `ALTER TABLE sales_items ADD COLUMN IF NOT EXISTS batch_id_snapshot INT`,
        `CREATE INDEX IF NOT EXISTS idx_sales_items_batch_snapshot ON sales_items(batch_id_snapshot)`,
        `ALTER TABLE sales_orders ALTER COLUMN status SET DEFAULT 'final'`,
      ]) await db.query(statement);
      await runLegacyOnce(db, 'sales_orders_status_final_v1', async () => {
        await db.query(`UPDATE sales_orders SET status = 'final' WHERE status = 'draft'`);
      });
      await runLegacyOnce(db, 'sales_items_backfill_v1', async () => {
        await db.query(`
          UPDATE sales_items si
          SET batch_id_snapshot = b.id
          FROM inventory_batches b
          JOIN product_master p ON p.id = b.product_id
          WHERE si.batch_id_snapshot IS NULL
            AND si.batch_no_snapshot IS NOT NULL
            AND LOWER(TRIM(p.name)) = LOWER(TRIM(si.product_name))
            AND b.batch_no = si.batch_no_snapshot
            AND (b.expired_date = si.expired_date_snapshot OR (b.expired_date IS NULL AND si.expired_date_snapshot IS NULL))
            AND (SELECT COUNT(*) FROM inventory_batches b2
                 WHERE b2.product_id = p.id
                   AND b2.batch_no = si.batch_no_snapshot
                   AND (b2.expired_date = si.expired_date_snapshot OR (b2.expired_date IS NULL AND si.expired_date_snapshot IS NULL))) = 1
        `);
        await db.query(`
          UPDATE sales_items si
          SET unit_hpp_tax_type = COALESCE(b.tax_type, 'faktur')
          FROM inventory_batches b
          WHERE si.batch_id_snapshot = b.id
            AND (si.unit_hpp_tax_type IS NULL OR si.unit_hpp_tax_type = 'faktur')
            AND COALESCE(b.tax_type, 'faktur') = 'nota'
        `);
      });
    },
  },
  {
    id: '20260823_004_invoices',
    async up(db) {
      await db.query(`
        ALTER TABLE invoices
          ADD COLUMN IF NOT EXISTS hna_baru DECIMAL(15,2),
          ADD COLUMN IF NOT EXISTS disc_cod_ada BOOLEAN DEFAULT FALSE,
          ADD COLUMN IF NOT EXISTS disc_cod_amount DECIMAL(15,2) DEFAULT 0,
          ADD COLUMN IF NOT EXISTS hna_final DECIMAL(15,2),
          ADD COLUMN IF NOT EXISTS ppn_masukan DECIMAL(15,2),
          ADD COLUMN IF NOT EXISTS ppn_pembulatan INTEGER,
          ADD COLUMN IF NOT EXISTS hna_plus_ppn DECIMAL(15,2),
          ADD COLUMN IF NOT EXISTS harga_per_produk DECIMAL(15,2),
          ADD COLUMN IF NOT EXISTS due_date DATE,
          ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
          ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT FALSE,
          ADD COLUMN IF NOT EXISTS draft_data JSONB,
          ADD COLUMN IF NOT EXISTS purchase_order_id INTEGER,
          ADD COLUMN IF NOT EXISTS tax_type VARCHAR(20) DEFAULT 'faktur',
          ADD COLUMN IF NOT EXISTS ppn_rate DECIMAL(5,4) DEFAULT 0.11
      `);
      await db.query(`
        ALTER TABLE invoice_items
          ADD COLUMN IF NOT EXISTS expired_date DATE,
          ADD COLUMN IF NOT EXISTS hna DECIMAL(15,2),
          ADD COLUMN IF NOT EXISTS hna_times_qty DECIMAL(15,2),
          ADD COLUMN IF NOT EXISTS disc_percent DECIMAL(5,2) DEFAULT 0,
          ADD COLUMN IF NOT EXISTS disc_nominal DECIMAL(15,2) DEFAULT 0,
          ADD COLUMN IF NOT EXISTS hna_baru DECIMAL(15,2),
          ADD COLUMN IF NOT EXISTS hna_per_item DECIMAL(15,2),
          ADD COLUMN IF NOT EXISTS product_id INTEGER,
          ADD COLUMN IF NOT EXISTS tax_type VARCHAR(20) DEFAULT 'faktur'
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS invoice_audit_log (
          id SERIAL PRIMARY KEY,
          invoice_id INTEGER NOT NULL,
          invoice_number VARCHAR(100),
          action VARCHAR(50) NOT NULL,
          changed_by VARCHAR(100) DEFAULT 'admin',
          changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          snapshot JSONB,
          note TEXT
        )
      `);
      for (const statement of [
        `CREATE INDEX IF NOT EXISTS idx_audit_invoice_id ON invoice_audit_log(invoice_id)`,
        `CREATE INDEX IF NOT EXISTS idx_invoices_purchase_date ON invoices(purchase_date DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_invoices_purchase_date_id ON invoices(purchase_date DESC, id DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_inventory_mutations_ref ON inventory_mutations(reference_type, reference_id)`,
      ]) await db.query(statement);
      await db.query(`
        ALTER TABLE invoice_items
          ADD COLUMN IF NOT EXISTS hpp_inc_ppn DECIMAL(15,2) DEFAULT 0,
          ADD COLUMN IF NOT EXISTS batch_number VARCHAR(100)
      `);
      await db.query(`
        ALTER TABLE invoice_items
          ADD COLUMN IF NOT EXISTS unit VARCHAR(30) DEFAULT 'pcs',
          ADD COLUMN IF NOT EXISTS qty_in_unit DECIMAL(15,4),
          ADD COLUMN IF NOT EXISTS pack_size_at_invoice INT
      `);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_invoice_items_product_id ON invoice_items(product_id)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id)`);
      await db.query(`
        CREATE TABLE IF NOT EXISTS form_drafts (
          id SERIAL PRIMARY KEY,
          doc_type VARCHAR(20) NOT NULL,
          owner_id VARCHAR(40) NOT NULL DEFAULT '',
          draft_data JSONB NOT NULL DEFAULT '{}',
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(doc_type, owner_id)
        )
      `);
      await runLegacyOnce(db, 'form_drafts_migrate_v1', async () => {
        await db.query(`
          INSERT INTO form_drafts (doc_type, owner_id, draft_data, updated_at)
          SELECT 'faktur', COALESCE(latest.draft_data->'__meta'->>'owner_id', ''),
                 latest.draft_data, COALESCE(latest.updated_at, NOW())
          FROM (
            SELECT DISTINCT ON (COALESCE(draft_data->'__meta'->>'owner_id', ''))
              draft_data, updated_at
            FROM invoices
            WHERE is_draft = TRUE AND deleted_at IS NULL AND draft_data IS NOT NULL
            ORDER BY COALESCE(draft_data->'__meta'->>'owner_id', ''), updated_at DESC NULLS LAST
          ) latest
          ON CONFLICT (doc_type, owner_id) DO NOTHING
        `);
        await db.query(`DELETE FROM invoices WHERE is_draft = TRUE`);
      });
      await runLegacyOnce(db, 'invoice_items_backfill_v1', async () => {
        await db.query(`
          UPDATE invoice_items
          SET
            hna_per_item = CASE WHEN quantity > 0 AND hna_baru > 0 THEN hna_baru / quantity ELSE hna_per_item END,
            hpp_inc_ppn = CASE WHEN quantity > 0 AND hna_baru > 0 THEN (hna_baru / quantity) * ${1 + tax.PPN_RATE} ELSE hpp_inc_ppn END
          WHERE (hpp_inc_ppn = 0 OR hna_per_item = 0) AND quantity > 0 AND hna_baru > 0
        `);
        const { rows: [productMasterExists] } = await db.query(
          `SELECT to_regclass('public.product_master') AS exists`,
        );
        if (productMasterExists?.exists) {
          await db.query(`
            WITH unique_products AS (
              SELECT LOWER(TRIM(name)) AS normalized_name, MIN(id) AS product_id
              FROM product_master
              WHERE is_active = TRUE
              GROUP BY 1
              HAVING COUNT(*) = 1
            )
            UPDATE invoice_items ii
            SET product_id = up.product_id
            FROM unique_products up
            WHERE ii.product_id IS NULL
              AND LOWER(TRIM(ii.product_name)) = up.normalized_name
          `);
        }
      });
    },
  },
  {
    id: '20260823_005_purchase_orders',
    async up(db) {
      await db.query(`
        CREATE TABLE IF NOT EXISTS purchase_orders (
          id SERIAL PRIMARY KEY,
          po_number VARCHAR(50) UNIQUE NOT NULL,
          distributor_name VARCHAR(255) NOT NULL,
          distributor_address TEXT,
          pic_name VARCHAR(150),
          order_date DATE DEFAULT CURRENT_DATE,
          expected_date DATE,
          status VARCHAR(20) DEFAULT 'draft',
          notes TEXT,
          total DECIMAL(15,2) DEFAULT 0,
          is_deleted BOOLEAN DEFAULT FALSE,
          created_by INT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS pic_name VARCHAR(150);
        ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS stock_received BOOLEAN DEFAULT FALSE;
        CREATE TABLE IF NOT EXISTS purchase_order_items (
          id SERIAL PRIMARY KEY,
          po_id INT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
          product_name VARCHAR(255) NOT NULL,
          product_id INTEGER,
          qty INT NOT NULL DEFAULT 1,
          unit VARCHAR(30) DEFAULT 'pcs',
          unit_price DECIMAL(15,2) DEFAULT 0,
          subtotal DECIMAL(15,2) DEFAULT 0,
          received_qty INT DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_po_deleted ON purchase_orders(is_deleted);
        CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status)
      `);
      await db.query(`ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_po_number_key`);
      await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_po_number_active ON purchase_orders(po_number) WHERE is_deleted = FALSE`);
      await db.query(`
        ALTER TABLE purchase_order_items
          ADD COLUMN IF NOT EXISTS product_id INTEGER,
          ADD COLUMN IF NOT EXISTS qty_in_unit DECIMAL(15,4),
          ADD COLUMN IF NOT EXISTS pack_size_at_po INT,
          ADD COLUMN IF NOT EXISTS received_qty_in_unit DECIMAL(15,4)
      `);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_purchase_order_items_product_id ON purchase_order_items(product_id)`);
      await runLegacyOnce(db, 'po_items_backfill_v1', async () => {
        const { rows: [productMasterExists] } = await db.query(
          `SELECT to_regclass('public.product_master') AS exists`,
        );
        if (productMasterExists?.exists) {
          await db.query(`
            WITH unique_products AS (
              SELECT LOWER(TRIM(name)) AS normalized_name, MIN(id) AS product_id
              FROM product_master
              WHERE is_active = TRUE
              GROUP BY 1
              HAVING COUNT(*) = 1
            )
            UPDATE purchase_order_items poi
            SET product_id = up.product_id
            FROM unique_products up
            WHERE poi.product_id IS NULL
              AND LOWER(TRIM(poi.product_name)) = up.normalized_name
          `);
        }
      });
    },
  },
  {
    id: '20260823_006_distributors',
    async up(db) {
      await db.query(`
        CREATE TABLE IF NOT EXISTS distributors (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) UNIQUE NOT NULL,
          short_code VARCHAR(50),
          salesman_name VARCHAR(150),
          salesman_phone VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        ALTER TABLE distributors ADD COLUMN IF NOT EXISTS short_code VARCHAR(50);
        ALTER TABLE distributors ADD COLUMN IF NOT EXISTS salesman_name VARCHAR(150);
        ALTER TABLE distributors ADD COLUMN IF NOT EXISTS salesman_phone VARCHAR(50);
        CREATE TABLE IF NOT EXISTS product_distributors (
          id SERIAL PRIMARY KEY,
          product_id INT NOT NULL,
          distributor_id INT NOT NULL REFERENCES distributors(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(product_id, distributor_id)
        );
        INSERT INTO distributors (name)
        SELECT DISTINCT distributor_name FROM invoices WHERE distributor_name IS NOT NULL
        ON CONFLICT (name) DO NOTHING
      `);
    },
  },
  {
    id: '20260823_007_loans',
    async up(db) {
      await db.query(`
        CREATE TABLE IF NOT EXISTS loans (
          id SERIAL PRIMARY KEY,
          loan_number VARCHAR(50) NOT NULL,
          customer_id INT,
          customer_name VARCHAR(150) NOT NULL,
          customer_address TEXT,
          customer_phone VARCHAR(30),
          loan_date DATE NOT NULL DEFAULT CURRENT_DATE,
          due_days INT DEFAULT 7,
          due_date DATE,
          status VARCHAR(20) DEFAULT 'aktif',
          total_value DECIMAL(15,2) DEFAULT 0,
          notes TEXT,
          is_deleted BOOLEAN DEFAULT FALSE,
          created_by INT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS loan_items (
          id SERIAL PRIMARY KEY,
          loan_id INT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
          product_id INT,
          product_name VARCHAR(255) NOT NULL,
          qty INT NOT NULL,
          unit VARCHAR(30) DEFAULT 'pcs',
          unit_price DECIMAL(15,2) DEFAULT 0,
          unit_hpp DECIMAL(15,2) DEFAULT 0,
          unit_hpp_tax_type VARCHAR(20) DEFAULT 'faktur',
          unit_hpp_ppn_rate DECIMAL(5,4),
          batch_id_snapshot INT,
          batch_no_snapshot VARCHAR(100),
          expired_date_snapshot DATE,
          qty_returned INT DEFAULT 0,
          qty_purchased INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS loan_conversions (
          id SERIAL PRIMARY KEY,
          loan_id INT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
          loan_item_id INT NOT NULL,
          sales_order_id INT NOT NULL,
          qty INT NOT NULL,
          is_reverted BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS loans_number_active_idx
          ON loans(loan_number) WHERE is_deleted = FALSE;
        CREATE INDEX IF NOT EXISTS idx_loan_items_loan ON loan_items(loan_id);
        CREATE INDEX IF NOT EXISTS idx_loan_conversions_order ON loan_conversions(sales_order_id)
      `);
      await db.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS source_loan_id INT`);
    },
  },
  {
    id: '20260823_008_settings',
    async up(db) {
      await db.query(`
        CREATE TABLE IF NOT EXISTS app_settings (
          id SERIAL PRIMARY KEY,
          setting_key VARCHAR(50) UNIQUE NOT NULL,
          setting_value JSONB NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await db.query(
        `INSERT INTO app_settings (setting_key, setting_value)
         VALUES ('profit_thresholds', $1::jsonb)
         ON CONFLICT (setting_key) DO NOTHING`,
        [JSON.stringify(DEFAULT_PROFIT_THRESHOLDS)],
      );
    },
  },
  {
    id: '20260823_009_product_catalog',
    async up(db) {
      await db.query(`
        CREATE TABLE IF NOT EXISTS product_catalog (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) UNIQUE NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    },
  },
  {
    id: '20260823_010_customers',
    async up(db) {
      await db.query(`
        CREATE TABLE IF NOT EXISTS customers (
          id SERIAL PRIMARY KEY,
          name VARCHAR(150) NOT NULL,
          address TEXT,
          phone VARCHAR(30),
          type VARCHAR(30) DEFAULT 'offline',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_customers_name_lc ON customers (LOWER(name))`);
      await db.query(`SELECT setval('customers_id_seq', COALESCE((SELECT MAX(id) FROM customers), 0) + 1, false)`);
    },
  },
  {
    id: '20260823_011_price_list',
    async up(db) {
      await db.query(`
        CREATE TABLE IF NOT EXISTS price_list_entries (
          id SERIAL PRIMARY KEY,
          product_id INT NOT NULL REFERENCES product_master(id) ON DELETE CASCADE,
          price DECIMAL(15,2) NOT NULL,
          effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
          created_by INT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_price_list_product ON price_list_entries(product_id, effective_date DESC, id DESC)`);
      await db.query(`ALTER TABLE price_list_entries ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'offline'`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_price_list_product_channel ON price_list_entries(product_id, channel, effective_date DESC, id DESC)`);
      await db.query(`
        CREATE TABLE IF NOT EXISTS marketplace_fee_profiles (
          id SERIAL PRIMARY KEY,
          platform TEXT NOT NULL,
          category_key TEXT NOT NULL DEFAULT 'default',
          label TEXT,
          admin_rate NUMERIC(7,5) DEFAULT 0,
          service_rate NUMERIC(7,5) DEFAULT 0,
          fixed_order_fee NUMERIC(12,2) DEFAULT 0,
          safe_effective_fee_rate NUMERIC(7,5) DEFAULT 0,
          source TEXT NOT NULL DEFAULT 'official',
          active BOOLEAN DEFAULT TRUE,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(platform, category_key)
        )
      `);
      for (const profile of DEFAULT_FEE_PROFILES) {
        await db.query(
          `INSERT INTO marketplace_fee_profiles
             (platform, category_key, label, admin_rate, service_rate, fixed_order_fee, safe_effective_fee_rate, source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (platform, category_key) DO NOTHING`,
          [
            profile.platform,
            profile.category_key,
            profile.label,
            profile.admin_rate,
            profile.service_rate,
            profile.fixed_order_fee,
            profile.safe_effective_fee_rate,
            profile.source,
          ],
        );
      }
    },
  },
  {
    id: '20260823_012_marketplace',
    async up(db) {
      await db.query(`
        CREATE TABLE IF NOT EXISTS marketplace_sku_map (
          id SERIAL PRIMARY KEY,
          platform TEXT NOT NULL,
          match_key TEXT NOT NULL,
          key_type TEXT NOT NULL DEFAULT 'sku',
          product_id INT REFERENCES product_master(id) ON DELETE CASCADE,
          bundle_qty INT DEFAULT 1,
          listing_name TEXT,
          variation TEXT,
          created_by INT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE (platform, match_key)
        )
      `);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_msku_platform ON marketplace_sku_map(platform)`);
      await db.query(`
        CREATE TABLE IF NOT EXISTS marketplace_stores (
          id SERIAL PRIMARY KEY,
          platform TEXT NOT NULL,
          name TEXT NOT NULL,
          name_key TEXT NOT NULL,
          external_shop_id TEXT,
          last_filename TEXT,
          created_by INT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE (platform, name_key)
        )
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS marketplace_listings (
          id SERIAL PRIMARY KEY,
          store_id INT REFERENCES marketplace_stores(id) ON DELETE CASCADE,
          match_key TEXT NOT NULL,
          key_type TEXT,
          product_name TEXT,
          variation TEXT,
          sku TEXT,
          current_price NUMERIC(14,2),
          current_stock INT,
          bundle_qty INT DEFAULT 1,
          matched_product_id INT REFERENCES product_master(id) ON DELETE SET NULL,
          matched_auto BOOLEAN DEFAULT FALSE,
          hpp_incl NUMERIC(14,2),
          recommended_price NUMERIC(14,2),
          final_price NUMERIC(14,2),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE (store_id, match_key)
        )
      `);
      for (const statement of [
        `CREATE INDEX IF NOT EXISTS idx_mlisting_store ON marketplace_listings(store_id)`,
        `ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS hpp_override NUMERIC(14,2)`,
        `ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS final_stock INT`,
        `ALTER TABLE marketplace_listings ALTER COLUMN bundle_qty TYPE NUMERIC(8,3)`,
        `ALTER TABLE marketplace_stores ADD COLUMN IF NOT EXISTS template_b64 TEXT`,
        `ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS market_price NUMERIC(14,2)`,
        `ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS price_source TEXT`,
      ]) await db.query(statement);
      await db.query(`
        CREATE TABLE IF NOT EXISTS marketplace_store_files (
          id SERIAL PRIMARY KEY,
          store_id INT REFERENCES marketplace_stores(id) ON DELETE CASCADE,
          filename TEXT NOT NULL,
          file_b64 TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE (store_id, filename)
        )
      `);
    },
  },
  {
    id: '20260823_013_online_store',
    async up(db) {
      await db.query(`
        CREATE TABLE IF NOT EXISTS online_store_sales (
          id SERIAL PRIMARY KEY,
          platform VARCHAR(30) NOT NULL,
          order_id VARCHAR(100),
          order_date DATE,
          product_name VARCHAR(255),
          qty INT DEFAULT 1,
          sell_price DECIMAL(15,2) DEFAULT 0,
          shipping_fee DECIMAL(15,2) DEFAULT 0,
          platform_fee DECIMAL(15,2) DEFAULT 0,
          net_amount DECIMAL(15,2) DEFAULT 0,
          buyer_name VARCHAR(255),
          status VARCHAR(30) DEFAULT 'completed',
          batch_import_id VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS online_store_withdrawals (
          id SERIAL PRIMARY KEY,
          platform VARCHAR(30) NOT NULL,
          amount DECIMAL(15,2) NOT NULL,
          withdrawal_date DATE DEFAULT CURRENT_DATE,
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_oss_platform ON online_store_sales(platform);
        CREATE INDEX IF NOT EXISTS idx_oss_date ON online_store_sales(order_date DESC);
        CREATE INDEX IF NOT EXISTS idx_oss_batch ON online_store_sales(batch_import_id)
      `);
    },
  },
  {
    id: '20260823_014_print_settings',
    async up(db) {
      await db.query(`
        CREATE TABLE IF NOT EXISTS print_settings (
          id SERIAL PRIMARY KEY,
          setting_key VARCHAR(50) UNIQUE NOT NULL,
          setting_value JSONB NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await db.query(`
        INSERT INTO print_settings (setting_key, setting_value)
        VALUES ('nota_layout', '{"company_name":"CV HABIL SEJAHTERA BERSAMA","address":"Jl. Siwalankerto Tengah No.8, Wonocolo, Surabaya. 60236","phone":"0851-4117-5248","footer_text":"dengan senang hati melayani anda","signer_name":"Harun Al Rasyid, S.Kom","bank_info":"BCA CV HABIL SEJAHTERA BERSAMA 5603004174","qris_text":"ATAU BISA MELALUI QRIS HABIL >>","ketentuan":"Harap mengecek kembali barang yang diterima\\nWajib video unboxing apabila pengiriman menggunakan ekspedisi\\nBarang yang sudah dibeli tidak dapat dikembalikan kecuali ada cacat produk atau ED tidak sesuai dan bukan kesalahan kurir"}')
        ON CONFLICT (setting_key) DO NOTHING
      `);
    },
  },
  {
    id: '20260823_015_bug_reports',
    async up(db) {
      await db.query(`
        CREATE TABLE IF NOT EXISTS bug_reports (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          steps TEXT,
          contact VARCHAR(255),
          user_agent TEXT,
          reported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          status VARCHAR(50) DEFAULT 'open',
          type VARCHAR(20) DEFAULT 'bug'
        )
      `);
      await db.query(`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'bug'`);
      await db.query(`SELECT setval('bug_reports_id_seq', COALESCE((SELECT MAX(id) FROM bug_reports), 0) + 1, false)`);
    },
  },
  {
    id: '20260823_016_ledger',
    async up(db) {
      await db.query(`
        CREATE TABLE IF NOT EXISTS ledger_entries (
          id SERIAL PRIMARY KEY,
          entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
          account_name VARCHAR(255) NOT NULL,
          description TEXT,
          debit DECIMAL(15,2) DEFAULT 0,
          credit DECIMAL(15,2) DEFAULT 0,
          category VARCHAR(50),
          reference_type VARCHAR(30),
          reference_id INT,
          created_by INT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_ledger_date ON ledger_entries(entry_date DESC);
        CREATE INDEX IF NOT EXISTS idx_ledger_category ON ledger_entries(category);
        CREATE INDEX IF NOT EXISTS idx_ledger_account ON ledger_entries(account_name)
      `);
      for (const statement of [
        `ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS tax_scope TEXT DEFAULT 'ppn'`,
        `ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'`,
        `ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS bank_ref TEXT`,
        `ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT FALSE`,
        `ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS auto_cat BOOLEAN DEFAULT FALSE`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_bankref ON ledger_entries(bank_ref) WHERE bank_ref IS NOT NULL`,
      ]) await db.query(statement);
      await db.query(`
        CREATE TABLE IF NOT EXISTS ledger_budget_targets (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          pct NUMERIC(6,4) NOT NULL DEFAULT 0,
          target_nominal NUMERIC(15,2) DEFAULT 0,
          match_categories TEXT NOT NULL DEFAULT '',
          sort_order INT DEFAULT 0,
          active BOOLEAN DEFAULT TRUE
        )
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS employees (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          role TEXT,
          daily_wage NUMERIC(15,2) DEFAULT 0,
          monthly_salary NUMERIC(15,2) DEFAULT 0,
          active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      for (const statement of [
        `ALTER TABLE employees ADD COLUMN IF NOT EXISTS role TEXT`,
        `ALTER TABLE employees ADD COLUMN IF NOT EXISTS daily_wage NUMERIC(15,2) DEFAULT 0`,
        `ALTER TABLE employees ADD COLUMN IF NOT EXISTS monthly_salary NUMERIC(15,2) DEFAULT 0`,
        `ALTER TABLE employees ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_name ON employees(name)`,
      ]) await db.query(statement);
      await db.query(`
        CREATE TABLE IF NOT EXISTS salary_payments (
          id SERIAL PRIMARY KEY,
          employee_id INT REFERENCES employees(id) ON DELETE CASCADE,
          pay_date DATE NOT NULL,
          amount NUMERIC(15,2) NOT NULL,
          status TEXT DEFAULT 'SUDAH BAYAR',
          note TEXT,
          created_by INT,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_salary_date ON salary_payments(pay_date DESC)
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS personal_loans (
          id SERIAL PRIMARY KEY,
          person TEXT NOT NULL,
          loan_date DATE NOT NULL,
          amount NUMERIC(15,2) NOT NULL,
          note TEXT,
          status TEXT,
          created_by INT,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_loans_person ON personal_loans(person)
      `);
    },
  },
  {
    id: '20260823_017_tax',
    async up(db) {
      await db.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS ppn_excluded BOOLEAN DEFAULT FALSE`);
      await db.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS ppn_marked_by VARCHAR(100)`);
      await db.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS ppn_marked_at TIMESTAMP`);
    },
  },
  {
    id: '20260905_018_sales_adjustments',
    async up(db) {
      await db.query(`
        CREATE TABLE IF NOT EXISTS sales_audit_log (
          id SERIAL PRIMARY KEY,
          sales_order_id INTEGER NOT NULL,
          action VARCHAR(50) NOT NULL,
          changed_by INTEGER,
          changed_at TIMESTAMP NOT NULL DEFAULT NOW(),
          before_snapshot JSONB,
          after_snapshot JSONB,
          note TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_sales_audit_order ON sales_audit_log(sales_order_id, changed_at DESC);
        CREATE TABLE IF NOT EXISTS sales_adjustments (
          id SERIAL PRIMARY KEY,
          adjustment_number VARCHAR(60) UNIQUE NOT NULL,
          original_sales_order_id INTEGER NOT NULL REFERENCES sales_orders(id),
          type VARCHAR(30) NOT NULL CHECK (type IN ('return', 'exchange', 'price_difference', 'cancellation')),
          status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'void')),
          reason TEXT NOT NULL,
          adjustment_date DATE NOT NULL DEFAULT CURRENT_DATE,
          refund_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
          additional_charge NUMERIC(15,2) NOT NULL DEFAULT 0,
          payment_method VARCHAR(30),
          settlement_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (settlement_status IN ('pending', 'confirmed', 'void')),
          ledger_entry_id INTEGER,
          notes TEXT,
          idempotency_key VARCHAR(120),
          created_by INTEGER,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          posted_at TIMESTAMP,
          voided_at TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_sales_adjustments_order ON sales_adjustments(original_sales_order_id, created_at DESC);
        ALTER TABLE sales_adjustments
          ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(120);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_adjustments_idempotency
          ON sales_adjustments(idempotency_key) WHERE idempotency_key IS NOT NULL;
        CREATE TABLE IF NOT EXISTS sales_adjustment_items (
          id SERIAL PRIMARY KEY,
          adjustment_id INTEGER NOT NULL REFERENCES sales_adjustments(id) ON DELETE CASCADE,
          original_sales_item_id INTEGER REFERENCES sales_items(id),
          product_id INTEGER,
          product_name_snapshot VARCHAR(255) NOT NULL,
          original_batch_id INTEGER,
          replacement_batch_id INTEGER,
          original_batch_no VARCHAR(100),
          original_expired_date DATE,
          replacement_batch_no VARCHAR(100),
          replacement_expired_date DATE,
          qty_base NUMERIC(15,4) NOT NULL,
          qty_in_unit NUMERIC(15,4),
          unit VARCHAR(30),
          unit_price NUMERIC(15,2) NOT NULL DEFAULT 0,
          line_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
          direction VARCHAR(20) NOT NULL CHECK (direction IN ('returned', 'replacement')),
          condition VARCHAR(20) CHECK (condition IN ('saleable', 'damaged', 'quarantine')),
          condition_reason TEXT,
          source_invoice_id INTEGER,
          source_invoice_number VARCHAR(100),
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_sales_adjustment_items_adjustment ON sales_adjustment_items(adjustment_id);
        ALTER TABLE sales_adjustment_items
          ADD COLUMN IF NOT EXISTS condition_reason TEXT,
          ADD COLUMN IF NOT EXISTS source_invoice_number VARCHAR(100),
          ADD COLUMN IF NOT EXISTS original_batch_no VARCHAR(100),
          ADD COLUMN IF NOT EXISTS original_expired_date DATE,
          ADD COLUMN IF NOT EXISTS replacement_batch_no VARCHAR(100),
          ADD COLUMN IF NOT EXISTS replacement_expired_date DATE;
        CREATE TABLE IF NOT EXISTS sales_settlements (
          id SERIAL PRIMARY KEY,
          sales_order_id INTEGER NOT NULL REFERENCES sales_orders(id),
          adjustment_id INTEGER REFERENCES sales_adjustments(id),
          type VARCHAR(30) NOT NULL CHECK (type IN ('sale_payment', 'refund', 'additional_charge')),
          amount NUMERIC(15,2) NOT NULL,
          payment_method VARCHAR(30),
          settlement_date DATE NOT NULL DEFAULT CURRENT_DATE,
          bank_reference VARCHAR(120),
          notes TEXT,
          created_by INTEGER,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_sales_settlements_order ON sales_settlements(sales_order_id, settlement_date DESC);
        ALTER TABLE sales_settlements
          ADD COLUMN IF NOT EXISTS settlement_status VARCHAR(20) NOT NULL DEFAULT 'pending',
          ADD COLUMN IF NOT EXISTS ledger_entry_id INTEGER;
      `);
    },
  },
];

const listRouteSchemaMigrations = () => migrations.map(({ id }) => id);

const assertBaselineSchema = async (db) => {
  const required = ['invoices', 'invoice_items'];
  const { rows } = await db.query(
     `SELECT required_name,
            to_regclass('public.' || required_name) AS relation
     FROM unnest($1::text[]) AS required(required_name)`,
    [required],
  );
  const missing = rows.filter((row) => !row.relation).map((row) => row.required_name);
  if (missing.length > 0) {
    throw new Error(
      `Missing baseline schema relation(s): ${missing.join(', ')}. Apply the base schema before route migrations.`,
    );
  }
};

const runRouteSchemaMigrations = async (db, { logger = console } = {}) => {
  await assertBaselineSchema(db);
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id VARCHAR(160) PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  const applied = await db.query('SELECT id FROM schema_migrations');
  const appliedIds = new Set(applied.rows.map((row) => row.id));
  const result = { applied: [], skipped: [] };

  for (const migration of migrations) {
    if (appliedIds.has(migration.id)) {
      result.skipped.push(migration.id);
      logger.log(`[Migration] skip ${migration.id}`);
      continue;
    }
    logger.log(`[Migration] apply ${migration.id}`);
    await migration.up(db);
    await db.query('INSERT INTO schema_migrations (id) VALUES ($1)', [migration.id]);
    result.applied.push(migration.id);
  }

  return result;
};

module.exports = {
  assertBaselineSchema,
  listRouteSchemaMigrations,
  migrations,
  runRouteSchemaMigrations,
};
