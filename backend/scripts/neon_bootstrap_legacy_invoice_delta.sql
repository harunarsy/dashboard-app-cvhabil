-- Habil SuperApp: one-time legacy migration bootstrap for Neon production.
-- Operator procedure: run only on the intended Neon branch/database after a
-- verified backup. This script never replays historical migration functions.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '4min';
SELECT pg_advisory_xact_lock(hashtext('habil_route_schema_migrations'));

DO $$
DECLARE
  missing_relations TEXT[];
  missing_columns TEXT[];
  tracker_has_rows BOOLEAN;
BEGIN
  IF current_setting('transaction_read_only') = 'on' THEN
    RAISE EXCEPTION 'Legacy bootstrap refused: transaction is read-only';
  END IF;

  SELECT array_agg(required_name ORDER BY required_name)
  INTO missing_relations
  FROM unnest(ARRAY[
    'app_users', 'app_settings', 'customers', 'distributors',
    'document_counters', 'product_master', 'inventory_batches',
    'inventory_mutations', 'invoices', 'invoice_items', 'purchase_orders',
    'purchase_order_items', 'sales_orders', 'sales_items'
  ]) AS required(required_name)
  WHERE to_regclass('public.' || required_name) IS NULL;

  IF COALESCE(array_length(missing_relations, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Legacy bootstrap refused: missing relations: %', array_to_string(missing_relations, ', ');
  END IF;

  SELECT array_agg(required.table_name || '.' || required.column_name ORDER BY required.table_name, required.column_name)
  INTO missing_columns
  FROM (
    VALUES
      ('app_users', 'id'), ('app_users', 'username'),
      ('product_master', 'id'), ('product_master', 'name'), ('product_master', 'base_unit'),
      ('inventory_batches', 'id'), ('inventory_batches', 'product_id'), ('inventory_batches', 'qty_current'), ('inventory_batches', 'hna'),
      ('inventory_mutations', 'id'), ('inventory_mutations', 'product_id'), ('inventory_mutations', 'batch_id'), ('inventory_mutations', 'qty'), ('inventory_mutations', 'reference_type'), ('inventory_mutations', 'reference_id'),
      ('invoices', 'id'), ('invoices', 'invoice_number'), ('invoices', 'purchase_order_id'), ('invoices', 'tax_type'),
      ('invoice_items', 'id'), ('invoice_items', 'invoice_id'), ('invoice_items', 'product_id'), ('invoice_items', 'batch_no'), ('invoice_items', 'expired_date'), ('invoice_items', 'quantity'), ('invoice_items', 'unit'), ('invoice_items', 'hna'),
      ('purchase_orders', 'id'), ('purchase_orders', 'status'),
      ('purchase_order_items', 'id'), ('purchase_order_items', 'po_id'), ('purchase_order_items', 'received_qty'),
      ('sales_orders', 'id'), ('sales_orders', 'status'),
      ('sales_items', 'id'), ('sales_items', 'sales_order_id')
  ) AS required(table_name, column_name)
  LEFT JOIN information_schema.columns existing_column
    ON existing_column.table_schema = 'public'
   AND existing_column.table_name = required.table_name
   AND existing_column.column_name = required.column_name
  WHERE existing_column.column_name IS NULL;

  IF COALESCE(array_length(missing_columns, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Legacy bootstrap refused: missing columns: %', array_to_string(missing_columns, ', ');
  END IF;

  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM schema_migrations)' INTO tracker_has_rows;
    IF tracker_has_rows THEN
      RAISE EXCEPTION 'Legacy bootstrap refused: schema_migrations already contains records; investigate migration state first';
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id VARCHAR(160) PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Baseline metadata only. Do not execute historical migrations 001–019.
INSERT INTO schema_migrations (id) VALUES
  ('20260823_001_auth'),
  ('20260823_002_inventory'),
  ('20260823_003_sales'),
  ('20260823_004_invoices'),
  ('20260823_005_purchase_orders'),
  ('20260823_006_distributors'),
  ('20260823_007_loans'),
  ('20260823_008_settings'),
  ('20260823_009_product_catalog'),
  ('20260823_010_customers'),
  ('20260823_011_price_list'),
  ('20260823_012_marketplace'),
  ('20260823_013_online_store'),
  ('20260823_014_print_settings'),
  ('20260823_015_bug_reports'),
  ('20260823_016_ledger'),
  ('20260823_017_tax'),
  ('20260905_018_sales_adjustments'),
  ('20260905_019_sales_adjustments_void_audit');

ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS line_key VARCHAR(120);

ALTER TABLE inventory_mutations
  ADD COLUMN IF NOT EXISTS invoice_line_key VARCHAR(120),
  ADD COLUMN IF NOT EXISTS event_key VARCHAR(160);

CREATE INDEX IF NOT EXISTS idx_invoice_items_line_key
  ON invoice_items(invoice_id, line_key);
CREATE INDEX IF NOT EXISTS idx_inventory_mutations_invoice_line
  ON inventory_mutations(reference_type, reference_id, invoice_line_key);
CREATE INDEX IF NOT EXISTS idx_inventory_mutations_event_key
  ON inventory_mutations(event_key);

CREATE TABLE IF NOT EXISTS invoice_edit_events (
  id BIGSERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL,
  idempotency_key VARCHAR(160) NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  before_snapshot JSONB,
  after_snapshot JSONB,
  stock_delta JSONB,
  hna_revaluations JSONB,
  po_effects JSONB,
  negative_warning JSONB,
  response JSONB,
  created_by INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_edit_events_idempotency
  ON invoice_edit_events(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_invoice_edit_events_invoice
  ON invoice_edit_events(invoice_id, created_at DESC);
ALTER TABLE invoice_edit_events
  DROP CONSTRAINT IF EXISTS invoice_edit_events_invoice_id_fkey;

INSERT INTO schema_migrations (id) VALUES
  ('20260911_020_invoice_delta_edit'),
  ('20260911_021_invoice_edit_event_retention');

COMMIT;

SELECT id, applied_at
FROM schema_migrations
WHERE id IN (
  '20260911_020_invoice_delta_edit',
  '20260911_021_invoice_edit_event_retention'
)
ORDER BY id;

SELECT
  to_regclass('public.invoice_edit_events') AS invoice_edit_events_table,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoice_items' AND column_name = 'line_key'
  ) AS invoice_items_line_key,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_mutations' AND column_name = 'invoice_line_key'
  ) AS inventory_mutations_invoice_line_key,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_mutations' AND column_name = 'event_key'
  ) AS inventory_mutations_event_key;
