-- ============================================
-- DASHBOARD DATABASE SCHEMA
-- ============================================

-- Users Table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'user', -- 'admin' or 'user'
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Products/Inventory Table
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  sku VARCHAR(50) UNIQUE,
  category VARCHAR(50),
  description TEXT,
  price DECIMAL(12,2) NOT NULL,
  stock INT DEFAULT 0,
  reorder_level INT DEFAULT 10,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Orders Table
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  order_number VARCHAR(50) UNIQUE NOT NULL,
  customer_name VARCHAR(100) NOT NULL,
  customer_email VARCHAR(100),
  customer_phone VARCHAR(20),
  total_amount DECIMAL(12,2),
  status VARCHAR(20) DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Order Items Table
CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(12,2) NOT NULL,
  subtotal DECIMAL(12,2),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Transactions/Financial Table
CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  type VARCHAR(20) NOT NULL,
  category VARCHAR(50),
  amount DECIMAL(12,2) NOT NULL,
  description TEXT,
  reference_id INT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Employees Table
CREATE TABLE employees (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE,
  phone VARCHAR(20),
  department VARCHAR(50),
  position VARCHAR(50),
  salary DECIMAL(12,2),
  hire_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Indexes for Performance
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_stock ON products(stock);
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_employees_department ON employees(department);

-- Insert test data
INSERT INTO users (username, email, password_hash, role) VALUES
('admin', 'admin@company.com', 'hashed_password_here', 'admin'),
('user1', 'user1@company.com', 'hashed_password_here', 'user');

INSERT INTO products (name, sku, category, price, stock) VALUES
('Laptop Lenovo', 'LAPTOP-001', 'Electronics', 8500000, 15),
('Mouse Logitech', 'MOUSE-001', 'Accessories', 350000, 50),
('Keyboard Mechanical', 'KEYBOARD-001', 'Accessories', 1200000, 20);

INSERT INTO employees (name, email, department, position, salary) VALUES
('Budi Santoso', 'budi@company.com', 'IT', 'Developer', 25000000),
('Siti Nurhaliza', 'siti@company.com', 'Sales', 'Manager', 20000000);

-- ==================== INVOICES SCHEMA (V0.3) ====================

-- Table: invoices (Faktur Pembelian)
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
  status VARCHAR(20) DEFAULT 'Pending', -- 'Paid', 'Pending'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: invoice_items (Detail Faktur)
CREATE TABLE IF NOT EXISTS invoice_items (
  id SERIAL PRIMARY KEY,
  invoice_id INT NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(15,2),
  margin DECIMAL(15,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_invoices_purchase_date ON invoices(purchase_date);
CREATE INDEX IF NOT EXISTS idx_invoices_distributor ON invoices(distributor_name);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);