-- Disposable baseline for Fase 8 write-operation tests.
-- Run only after schema provisioning on a local test-named database.
-- This file contains DML fixtures only; test bodies execute no DDL.

BEGIN;

INSERT INTO product_master (
  id, code, name, unit, hna, sell_price, category, min_stock,
  is_active, base_unit, pack_size, weight_gram
) VALUES (
  8101, 'DF-PRODUCT-001', 'Deep Freeze Product', 'pcs', 10000, 15000,
  'Testing', 5, TRUE, 'pcs', 1, 100
);

INSERT INTO inventory_batches (
  id, product_id, batch_no, expired_date, qty_current, hna,
  source_type, source_ref, tax_type, ppn_rate, is_active
) VALUES (
  8201, 8101, 'DF-BATCH-BASE', CURRENT_DATE + 365, 50, 10000,
  'test-baseline', 'DF-BASELINE', 'faktur', 0.11, TRUE
);

INSERT INTO sales_orders (
  id, order_number, customer_name, sale_date, total, status, notes,
  is_deleted, payment_status
) VALUES (
  8301, 'DF-NOTA-BASE', 'Deep Freeze Customer', CURRENT_DATE,
  15000, 'final', 'baseline-note', FALSE, 'unpaid'
);

INSERT INTO sales_items (
  id, sales_order_id, product_name, qty, unit, unit_price, subtotal,
  unit_hpp, batch_id_snapshot, batch_no_snapshot, expired_date_snapshot
) VALUES (
  8302, 8301, 'Deep Freeze Product', 1, 'pcs', 15000, 15000,
  10000, 8201, 'DF-BATCH-BASE', CURRENT_DATE + 365
);

INSERT INTO distributors (
  id, name, short_code, salesman_name, salesman_phone
) VALUES (
  8401, 'Deep Freeze Distributor', 'DFD', 'Fixture Sales', '080000000000'
);

COMMIT;
