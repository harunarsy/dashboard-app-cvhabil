-- ============================================
-- HABIL SUPERAPP — NEON MASTER MIGRATION (v1.3.9)
-- ============================================

-- 1. EXTENSIONS & FUNCTIONS
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 2. AUTH & USER TABLES
CREATE TABLE IF NOT EXISTS app_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    role VARCHAR(20) NOT NULL DEFAULT 'admin',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. INVENTORY & PRODUCT TABLES
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

-- 4. PROCUREMENT TABLES (Purchase Orders)
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

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id SERIAL PRIMARY KEY,
    po_id INT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_name VARCHAR(255) NOT NULL,
    qty INT NOT NULL DEFAULT 1,
    unit VARCHAR(30) DEFAULT 'pcs',
    unit_price DECIMAL(15,2) DEFAULT 0,
    subtotal DECIMAL(15,2) DEFAULT 0,
    received_qty INT DEFAULT 0
);

-- 5. SALES & INVOICE TABLES
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

CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    purchase_date DATE NOT NULL,
    distributor_name VARCHAR(100) NOT NULL,
    total_hna DECIMAL(15,2),
    discount_amount DECIMAL(15,2) DEFAULT 0,
    ppn_input DECIMAL(15,2) DEFAULT 0,
    final_hna DECIMAL(15,2),
    payment_date DATE,
    status VARCHAR(20) DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoice_items (
    id SERIAL PRIMARY KEY,
    invoice_id INT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    product_name VARCHAR(255) NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(15,2),
    margin DECIMAL(15,2) DEFAULT 0,
    expired_date DATE,
    hna DECIMAL(15,2),
    hna_times_qty DECIMAL(15,2),
    disc_percent DECIMAL(5,2) DEFAULT 0,
    disc_nominal DECIMAL(15,2) DEFAULT 0,
    hna_baru DECIMAL(15,2),
    hna_per_item DECIMAL(15,2),
    hpp_inc_ppn DECIMAL(15,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. TASK & KANBAN TABLES
CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'todo' CHECK (status IN ('backlog', 'todo', 'doing', 'done')),
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    due_date TIMESTAMP,
    pic VARCHAR(100),
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS task_history (
    id SERIAL PRIMARY KEY,
    task_id INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    change_type VARCHAR(50),
    old_value TEXT,
    new_value TEXT,
    changed_by VARCHAR(100),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. FINANCIAL & OTHERS
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

CREATE TABLE IF NOT EXISTS distributors (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    short_code VARCHAR(50),
    salesman_name VARCHAR(150),
    salesman_phone VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS document_counters (
    id SERIAL PRIMARY KEY,
    doc_type VARCHAR(20) UNIQUE NOT NULL,
    prefix VARCHAR(20),
    last_number INTEGER DEFAULT 0,
    is_locked BOOLEAN DEFAULT true,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bug_reports (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    severity VARCHAR(20),
    status VARCHAR(20) DEFAULT 'open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS print_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(50) UNIQUE NOT NULL,
    setting_value JSONB,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. INDEXES
CREATE INDEX IF NOT EXISTS idx_batches_product ON inventory_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_mutations_product ON inventory_mutations(product_id);
CREATE INDEX IF NOT EXISTS idx_po_number ON purchase_orders(po_number);
CREATE INDEX IF NOT EXISTS idx_sales_orders_number ON sales_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_ledger_date ON ledger_entries(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- 9. TRIGGERS
DROP TRIGGER IF EXISTS update_tasks_modtime ON tasks;
CREATE TRIGGER update_tasks_modtime
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE PROCEDURE update_modified_column();

-- 10. INITIAL SEEDING
INSERT INTO app_users (username, password, display_name, role) VALUES
    ('direktur', 'direktur123', 'Direktur CV Habil', 'direktur'),
    ('admin',    'admin123',    'Admin Toko',        'admin')
ON CONFLICT (username) DO NOTHING;

INSERT INTO document_counters (doc_type, prefix, last_number, is_locked) 
VALUES 
    ('SP', 'HSB-SP-', 63, true),
    ('NOTA', 'HSB-NOTA-', 235, true),
    ('TT', 'HSB-TT-', 235, true)
ON CONFLICT (doc_type) DO NOTHING;
