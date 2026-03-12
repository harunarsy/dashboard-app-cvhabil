--
-- PostgreSQL database dump
--

\restrict MA9c2I45RqYkKytdDkwt09XIVyTKOBQZSYZpr26Mi8qoSeosn6P5jBwJvbHewLe

-- Dumped from database version 15.17 (Homebrew)
-- Dumped by pg_dump version 15.17 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public.transactions DROP CONSTRAINT IF EXISTS transactions_created_by_fkey;
ALTER TABLE IF EXISTS ONLY public.stock_opname DROP CONSTRAINT IF EXISTS stock_opname_product_id_fkey;
ALTER TABLE IF EXISTS ONLY public.sales_items DROP CONSTRAINT IF EXISTS sales_items_sales_order_id_fkey;
ALTER TABLE IF EXISTS ONLY public.purchase_order_items DROP CONSTRAINT IF EXISTS purchase_order_items_po_id_fkey;
ALTER TABLE IF EXISTS ONLY public.order_items DROP CONSTRAINT IF EXISTS order_items_product_id_fkey;
ALTER TABLE IF EXISTS ONLY public.order_items DROP CONSTRAINT IF EXISTS order_items_order_id_fkey;
ALTER TABLE IF EXISTS ONLY public.invoice_items DROP CONSTRAINT IF EXISTS invoice_items_invoice_id_fkey;
ALTER TABLE IF EXISTS ONLY public.inventory_mutations DROP CONSTRAINT IF EXISTS inventory_mutations_product_id_fkey;
ALTER TABLE IF EXISTS ONLY public.inventory_mutations DROP CONSTRAINT IF EXISTS inventory_mutations_batch_id_fkey;
ALTER TABLE IF EXISTS ONLY public.inventory_batches DROP CONSTRAINT IF EXISTS inventory_batches_product_id_fkey;
DROP INDEX IF EXISTS public.idx_transactions_type;
DROP INDEX IF EXISTS public.idx_transactions_created_at;
DROP INDEX IF EXISTS public.idx_sales_orders_date;
DROP INDEX IF EXISTS public.idx_sales_orders_customer;
DROP INDEX IF EXISTS public.idx_sales_items_order;
DROP INDEX IF EXISTS public.idx_products_stock;
DROP INDEX IF EXISTS public.idx_products_category;
DROP INDEX IF EXISTS public.idx_po_status;
DROP INDEX IF EXISTS public.idx_po_deleted;
DROP INDEX IF EXISTS public.idx_oss_platform;
DROP INDEX IF EXISTS public.idx_oss_date;
DROP INDEX IF EXISTS public.idx_oss_batch;
DROP INDEX IF EXISTS public.idx_orders_status;
DROP INDEX IF EXISTS public.idx_orders_created_at;
DROP INDEX IF EXISTS public.idx_order_items_order_id;
DROP INDEX IF EXISTS public.idx_opname_date;
DROP INDEX IF EXISTS public.idx_mutations_product;
DROP INDEX IF EXISTS public.idx_mutations_created;
DROP INDEX IF EXISTS public.idx_ledger_date;
DROP INDEX IF EXISTS public.idx_ledger_category;
DROP INDEX IF EXISTS public.idx_ledger_account;
DROP INDEX IF EXISTS public.idx_invoices_status;
DROP INDEX IF EXISTS public.idx_invoices_purchase_date;
DROP INDEX IF EXISTS public.idx_invoices_distributor;
DROP INDEX IF EXISTS public.idx_invoice_items_invoice_id;
DROP INDEX IF EXISTS public.idx_employees_department;
DROP INDEX IF EXISTS public.idx_batches_product;
DROP INDEX IF EXISTS public.idx_batches_expired;
DROP INDEX IF EXISTS public.idx_audit_invoice_id;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_username_key;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_email_key;
ALTER TABLE IF EXISTS ONLY public.transactions DROP CONSTRAINT IF EXISTS transactions_pkey;
ALTER TABLE IF EXISTS ONLY public.stock_opname DROP CONSTRAINT IF EXISTS stock_opname_pkey;
ALTER TABLE IF EXISTS ONLY public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_pkey;
ALTER TABLE IF EXISTS ONLY public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_order_number_key;
ALTER TABLE IF EXISTS ONLY public.sales_items DROP CONSTRAINT IF EXISTS sales_items_pkey;
ALTER TABLE IF EXISTS ONLY public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_po_number_key;
ALTER TABLE IF EXISTS ONLY public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_pkey;
ALTER TABLE IF EXISTS ONLY public.purchase_order_items DROP CONSTRAINT IF EXISTS purchase_order_items_pkey;
ALTER TABLE IF EXISTS ONLY public.products DROP CONSTRAINT IF EXISTS products_sku_key;
ALTER TABLE IF EXISTS ONLY public.products DROP CONSTRAINT IF EXISTS products_pkey;
ALTER TABLE IF EXISTS ONLY public.product_master DROP CONSTRAINT IF EXISTS product_master_pkey;
ALTER TABLE IF EXISTS ONLY public.product_master DROP CONSTRAINT IF EXISTS product_master_code_key;
ALTER TABLE IF EXISTS ONLY public.product_catalog DROP CONSTRAINT IF EXISTS product_catalog_pkey;
ALTER TABLE IF EXISTS ONLY public.product_catalog DROP CONSTRAINT IF EXISTS product_catalog_name_key;
ALTER TABLE IF EXISTS ONLY public.print_settings DROP CONSTRAINT IF EXISTS print_settings_pkey;
ALTER TABLE IF EXISTS ONLY public.print_settings DROP CONSTRAINT IF EXISTS print_settings_key_key;
ALTER TABLE IF EXISTS ONLY public.orders DROP CONSTRAINT IF EXISTS orders_pkey;
ALTER TABLE IF EXISTS ONLY public.orders DROP CONSTRAINT IF EXISTS orders_order_number_key;
ALTER TABLE IF EXISTS ONLY public.order_items DROP CONSTRAINT IF EXISTS order_items_pkey;
ALTER TABLE IF EXISTS ONLY public.online_store_withdrawals DROP CONSTRAINT IF EXISTS online_store_withdrawals_pkey;
ALTER TABLE IF EXISTS ONLY public.online_store_sales DROP CONSTRAINT IF EXISTS online_store_sales_pkey;
ALTER TABLE IF EXISTS ONLY public.ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_pkey;
ALTER TABLE IF EXISTS ONLY public.invoices DROP CONSTRAINT IF EXISTS invoices_pkey;
ALTER TABLE IF EXISTS ONLY public.invoices DROP CONSTRAINT IF EXISTS invoices_invoice_number_key;
ALTER TABLE IF EXISTS ONLY public.invoice_items DROP CONSTRAINT IF EXISTS invoice_items_pkey;
ALTER TABLE IF EXISTS ONLY public.invoice_audit_log DROP CONSTRAINT IF EXISTS invoice_audit_log_pkey;
ALTER TABLE IF EXISTS ONLY public.inventory_mutations DROP CONSTRAINT IF EXISTS inventory_mutations_pkey;
ALTER TABLE IF EXISTS ONLY public.inventory_batches DROP CONSTRAINT IF EXISTS inventory_batches_pkey;
ALTER TABLE IF EXISTS ONLY public.employees DROP CONSTRAINT IF EXISTS employees_pkey;
ALTER TABLE IF EXISTS ONLY public.employees DROP CONSTRAINT IF EXISTS employees_email_key;
ALTER TABLE IF EXISTS ONLY public.distributors DROP CONSTRAINT IF EXISTS distributors_pkey;
ALTER TABLE IF EXISTS ONLY public.distributors DROP CONSTRAINT IF EXISTS distributors_name_key;
ALTER TABLE IF EXISTS ONLY public.customers DROP CONSTRAINT IF EXISTS customers_pkey;
ALTER TABLE IF EXISTS ONLY public.bug_reports DROP CONSTRAINT IF EXISTS bug_reports_pkey;
ALTER TABLE IF EXISTS ONLY public.app_users DROP CONSTRAINT IF EXISTS app_users_username_key;
ALTER TABLE IF EXISTS ONLY public.app_users DROP CONSTRAINT IF EXISTS app_users_pkey;
ALTER TABLE IF EXISTS public.users ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.transactions ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.stock_opname ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.sales_orders ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.sales_items ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.purchase_orders ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.purchase_order_items ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.products ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.product_master ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.product_catalog ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.print_settings ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.orders ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.order_items ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.online_store_withdrawals ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.online_store_sales ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ledger_entries ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.invoices ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.invoice_items ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.invoice_audit_log ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.inventory_mutations ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.inventory_batches ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.employees ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.distributors ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.customers ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.bug_reports ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.app_users ALTER COLUMN id DROP DEFAULT;
DROP SEQUENCE IF EXISTS public.users_id_seq;
DROP TABLE IF EXISTS public.users;
DROP SEQUENCE IF EXISTS public.transactions_id_seq;
DROP TABLE IF EXISTS public.transactions;
DROP SEQUENCE IF EXISTS public.stock_opname_id_seq;
DROP TABLE IF EXISTS public.stock_opname;
DROP SEQUENCE IF EXISTS public.sales_orders_id_seq;
DROP TABLE IF EXISTS public.sales_orders;
DROP SEQUENCE IF EXISTS public.sales_items_id_seq;
DROP TABLE IF EXISTS public.sales_items;
DROP SEQUENCE IF EXISTS public.purchase_orders_id_seq;
DROP TABLE IF EXISTS public.purchase_orders;
DROP SEQUENCE IF EXISTS public.purchase_order_items_id_seq;
DROP TABLE IF EXISTS public.purchase_order_items;
DROP SEQUENCE IF EXISTS public.products_id_seq;
DROP TABLE IF EXISTS public.products;
DROP SEQUENCE IF EXISTS public.product_master_id_seq;
DROP TABLE IF EXISTS public.product_master;
DROP SEQUENCE IF EXISTS public.product_catalog_id_seq;
DROP TABLE IF EXISTS public.product_catalog;
DROP SEQUENCE IF EXISTS public.print_settings_id_seq;
DROP TABLE IF EXISTS public.print_settings;
DROP SEQUENCE IF EXISTS public.orders_id_seq;
DROP TABLE IF EXISTS public.orders;
DROP SEQUENCE IF EXISTS public.order_items_id_seq;
DROP TABLE IF EXISTS public.order_items;
DROP SEQUENCE IF EXISTS public.online_store_withdrawals_id_seq;
DROP TABLE IF EXISTS public.online_store_withdrawals;
DROP SEQUENCE IF EXISTS public.online_store_sales_id_seq;
DROP TABLE IF EXISTS public.online_store_sales;
DROP SEQUENCE IF EXISTS public.ledger_entries_id_seq;
DROP TABLE IF EXISTS public.ledger_entries;
DROP SEQUENCE IF EXISTS public.invoices_id_seq;
DROP TABLE IF EXISTS public.invoices;
DROP SEQUENCE IF EXISTS public.invoice_items_id_seq;
DROP TABLE IF EXISTS public.invoice_items;
DROP SEQUENCE IF EXISTS public.invoice_audit_log_id_seq;
DROP TABLE IF EXISTS public.invoice_audit_log;
DROP SEQUENCE IF EXISTS public.inventory_mutations_id_seq;
DROP TABLE IF EXISTS public.inventory_mutations;
DROP SEQUENCE IF EXISTS public.inventory_batches_id_seq;
DROP TABLE IF EXISTS public.inventory_batches;
DROP SEQUENCE IF EXISTS public.employees_id_seq;
DROP TABLE IF EXISTS public.employees;
DROP SEQUENCE IF EXISTS public.distributors_id_seq;
DROP TABLE IF EXISTS public.distributors;
DROP SEQUENCE IF EXISTS public.customers_id_seq;
DROP TABLE IF EXISTS public.customers;
DROP SEQUENCE IF EXISTS public.bug_reports_id_seq;
DROP TABLE IF EXISTS public.bug_reports;
DROP SEQUENCE IF EXISTS public.app_users_id_seq;
DROP TABLE IF EXISTS public.app_users;
SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: app_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_users (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    password character varying(255) NOT NULL,
    display_name character varying(100),
    role character varying(20) DEFAULT 'admin'::character varying NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: app_users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.app_users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: app_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.app_users_id_seq OWNED BY public.app_users.id;


--
-- Name: bug_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bug_reports (
    id integer NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    steps text,
    contact character varying(255),
    user_agent text,
    reported_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    status character varying(50) DEFAULT 'open'::character varying,
    type character varying(20) DEFAULT 'bug'::character varying
);


--
-- Name: bug_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bug_reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bug_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bug_reports_id_seq OWNED BY public.bug_reports.id;


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id integer NOT NULL,
    name character varying(150) NOT NULL,
    address text,
    phone character varying(30),
    type character varying(30) DEFAULT 'offline'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: customers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.customers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.customers_id_seq OWNED BY public.customers.id;


--
-- Name: distributors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.distributors (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: distributors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.distributors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: distributors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.distributors_id_seq OWNED BY public.distributors.id;


--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    email character varying(100),
    phone character varying(20),
    department character varying(50),
    "position" character varying(50),
    salary numeric(12,2),
    hire_date date,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: employees_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.employees_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: employees_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.employees_id_seq OWNED BY public.employees.id;


--
-- Name: inventory_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_batches (
    id integer NOT NULL,
    product_id integer NOT NULL,
    batch_no character varying(100),
    expired_date date,
    qty_current integer DEFAULT 0,
    source_type character varying(30),
    source_ref character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: inventory_batches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inventory_batches_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inventory_batches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inventory_batches_id_seq OWNED BY public.inventory_batches.id;


--
-- Name: inventory_mutations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_mutations (
    id integer NOT NULL,
    product_id integer NOT NULL,
    batch_id integer,
    type character varying(10) NOT NULL,
    qty integer NOT NULL,
    reference_type character varying(30),
    reference_id integer,
    notes text,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: inventory_mutations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inventory_mutations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inventory_mutations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inventory_mutations_id_seq OWNED BY public.inventory_mutations.id;


--
-- Name: invoice_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_audit_log (
    id integer NOT NULL,
    invoice_id integer NOT NULL,
    invoice_number character varying(100),
    action character varying(50) NOT NULL,
    changed_by character varying(100) DEFAULT 'admin'::character varying,
    changed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    snapshot jsonb,
    note text
);


--
-- Name: invoice_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invoice_audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invoice_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.invoice_audit_log_id_seq OWNED BY public.invoice_audit_log.id;


--
-- Name: invoice_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_items (
    id integer NOT NULL,
    invoice_id integer NOT NULL,
    product_name character varying(255) NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    total_price numeric(15,2),
    margin numeric(15,2) DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    expired_date date,
    hna numeric(15,2),
    hna_times_qty numeric(15,2),
    disc_percent numeric(5,2) DEFAULT 0,
    disc_nominal numeric(15,2) DEFAULT 0,
    hna_baru numeric(15,2),
    hna_per_item numeric(15,2),
    disc_cod_per_item numeric(15,2) DEFAULT 0,
    hna_after_cod numeric(15,2) DEFAULT 0,
    hpp_inc_ppn numeric(15,2) DEFAULT 0
);


--
-- Name: invoice_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invoice_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invoice_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.invoice_items_id_seq OWNED BY public.invoice_items.id;


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id integer NOT NULL,
    invoice_number character varying(50) NOT NULL,
    purchase_date date NOT NULL,
    distributor_name character varying(100) NOT NULL,
    total_hna numeric(15,2),
    discount_amount numeric(15,2) DEFAULT 0,
    ppn_input numeric(15,2) DEFAULT 0,
    final_hna numeric(15,2),
    payment_date date,
    status character varying(20) DEFAULT 'Pending'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    hna_baru numeric(15,2),
    disc_cod_ada boolean DEFAULT false,
    disc_cod_amount numeric(15,2) DEFAULT 0,
    hna_final numeric(15,2),
    ppn_masukan numeric(15,2),
    ppn_pembulatan integer,
    hna_plus_ppn numeric(15,2),
    harga_per_produk numeric(15,2),
    due_date date,
    deleted_at timestamp without time zone,
    is_draft boolean DEFAULT false,
    draft_data jsonb
);


--
-- Name: invoices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invoices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invoices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.invoices_id_seq OWNED BY public.invoices.id;


--
-- Name: ledger_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ledger_entries (
    id integer NOT NULL,
    entry_date date DEFAULT CURRENT_DATE NOT NULL,
    account_name character varying(255) NOT NULL,
    description text,
    debit numeric(15,2) DEFAULT 0,
    credit numeric(15,2) DEFAULT 0,
    category character varying(50),
    reference_type character varying(30),
    reference_id integer,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: ledger_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ledger_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ledger_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ledger_entries_id_seq OWNED BY public.ledger_entries.id;


--
-- Name: online_store_sales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.online_store_sales (
    id integer NOT NULL,
    platform character varying(30) NOT NULL,
    order_id character varying(100),
    order_date date,
    product_name character varying(255),
    qty integer DEFAULT 1,
    sell_price numeric(15,2) DEFAULT 0,
    shipping_fee numeric(15,2) DEFAULT 0,
    platform_fee numeric(15,2) DEFAULT 0,
    net_amount numeric(15,2) DEFAULT 0,
    buyer_name character varying(255),
    status character varying(30) DEFAULT 'completed'::character varying,
    batch_import_id character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: online_store_sales_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.online_store_sales_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: online_store_sales_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.online_store_sales_id_seq OWNED BY public.online_store_sales.id;


--
-- Name: online_store_withdrawals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.online_store_withdrawals (
    id integer NOT NULL,
    platform character varying(30) NOT NULL,
    amount numeric(15,2) NOT NULL,
    withdrawal_date date DEFAULT CURRENT_DATE,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: online_store_withdrawals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.online_store_withdrawals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: online_store_withdrawals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.online_store_withdrawals_id_seq OWNED BY public.online_store_withdrawals.id;


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id integer NOT NULL,
    order_id integer NOT NULL,
    product_id integer NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    subtotal numeric(12,2),
    CONSTRAINT order_items_quantity_check CHECK ((quantity > 0))
);


--
-- Name: order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.order_items_id_seq OWNED BY public.order_items.id;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id integer NOT NULL,
    order_number character varying(50) NOT NULL,
    customer_name character varying(100) NOT NULL,
    customer_email character varying(100),
    customer_phone character varying(20),
    total_amount numeric(12,2),
    status character varying(20) DEFAULT 'pending'::character varying,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.orders_id_seq OWNED BY public.orders.id;


--
-- Name: print_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.print_settings (
    id integer NOT NULL,
    key character varying(50) NOT NULL,
    value jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: print_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.print_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: print_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.print_settings_id_seq OWNED BY public.print_settings.id;


--
-- Name: product_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_catalog (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: product_catalog_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_catalog_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_catalog_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_catalog_id_seq OWNED BY public.product_catalog.id;


--
-- Name: product_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_master (
    id integer NOT NULL,
    code character varying(50),
    name character varying(255) NOT NULL,
    unit character varying(30) DEFAULT 'pcs'::character varying,
    hna numeric(15,2) DEFAULT 0,
    sell_price numeric(15,2) DEFAULT 0,
    category character varying(100),
    min_stock integer DEFAULT 5,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: product_master_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_master_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_master_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_master_id_seq OWNED BY public.product_master.id;


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    sku character varying(50),
    category character varying(50),
    description text,
    price numeric(12,2) NOT NULL,
    stock integer DEFAULT 0,
    reorder_level integer DEFAULT 10,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.products_id_seq OWNED BY public.products.id;


--
-- Name: purchase_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_order_items (
    id integer NOT NULL,
    po_id integer NOT NULL,
    product_name character varying(255) NOT NULL,
    qty integer DEFAULT 1 NOT NULL,
    unit character varying(30) DEFAULT 'pcs'::character varying,
    unit_price numeric(15,2) DEFAULT 0,
    subtotal numeric(15,2) DEFAULT 0,
    received_qty integer DEFAULT 0
);


--
-- Name: purchase_order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchase_order_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchase_order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.purchase_order_items_id_seq OWNED BY public.purchase_order_items.id;


--
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_orders (
    id integer NOT NULL,
    po_number character varying(50) NOT NULL,
    distributor_name character varying(255) NOT NULL,
    distributor_address text,
    order_date date DEFAULT CURRENT_DATE,
    expected_date date,
    status character varying(20) DEFAULT 'draft'::character varying,
    notes text,
    total numeric(15,2) DEFAULT 0,
    is_deleted boolean DEFAULT false,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: purchase_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchase_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchase_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.purchase_orders_id_seq OWNED BY public.purchase_orders.id;


--
-- Name: sales_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_items (
    id integer NOT NULL,
    sales_order_id integer NOT NULL,
    product_name character varying(255) NOT NULL,
    qty integer DEFAULT 1 NOT NULL,
    unit character varying(30) DEFAULT 'pcs'::character varying,
    unit_price numeric(15,2) DEFAULT 0 NOT NULL,
    subtotal numeric(15,2) DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: sales_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sales_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sales_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sales_items_id_seq OWNED BY public.sales_items.id;


--
-- Name: sales_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_orders (
    id integer NOT NULL,
    order_number character varying(50) NOT NULL,
    customer_id integer,
    customer_name character varying(150) NOT NULL,
    customer_address text,
    sale_date date DEFAULT CURRENT_DATE NOT NULL,
    total numeric(15,2) DEFAULT 0,
    status character varying(20) DEFAULT 'draft'::character varying,
    pdf_status character varying(20) DEFAULT 'belum_dicetak'::character varying,
    notes text,
    is_deleted boolean DEFAULT false,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    payment_method character varying(20) DEFAULT 'Tunai'::character varying,
    payment_details text
);


--
-- Name: sales_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sales_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sales_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sales_orders_id_seq OWNED BY public.sales_orders.id;


--
-- Name: stock_opname; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_opname (
    id integer NOT NULL,
    product_id integer NOT NULL,
    system_qty integer DEFAULT 0 NOT NULL,
    physical_qty integer DEFAULT 0 NOT NULL,
    difference integer DEFAULT 0 NOT NULL,
    notes text,
    opname_date date DEFAULT CURRENT_DATE NOT NULL,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: stock_opname_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_opname_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_opname_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_opname_id_seq OWNED BY public.stock_opname.id;


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id integer NOT NULL,
    type character varying(20) NOT NULL,
    category character varying(50),
    amount numeric(12,2) NOT NULL,
    description text,
    reference_id integer,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transactions_id_seq OWNED BY public.transactions.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    email character varying(100) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(20) DEFAULT 'user'::character varying,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: app_users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_users ALTER COLUMN id SET DEFAULT nextval('public.app_users_id_seq'::regclass);


--
-- Name: bug_reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bug_reports ALTER COLUMN id SET DEFAULT nextval('public.bug_reports_id_seq'::regclass);


--
-- Name: customers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers ALTER COLUMN id SET DEFAULT nextval('public.customers_id_seq'::regclass);


--
-- Name: distributors id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.distributors ALTER COLUMN id SET DEFAULT nextval('public.distributors_id_seq'::regclass);


--
-- Name: employees id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees ALTER COLUMN id SET DEFAULT nextval('public.employees_id_seq'::regclass);


--
-- Name: inventory_batches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_batches ALTER COLUMN id SET DEFAULT nextval('public.inventory_batches_id_seq'::regclass);


--
-- Name: inventory_mutations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_mutations ALTER COLUMN id SET DEFAULT nextval('public.inventory_mutations_id_seq'::regclass);


--
-- Name: invoice_audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_audit_log ALTER COLUMN id SET DEFAULT nextval('public.invoice_audit_log_id_seq'::regclass);


--
-- Name: invoice_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items ALTER COLUMN id SET DEFAULT nextval('public.invoice_items_id_seq'::regclass);


--
-- Name: invoices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices ALTER COLUMN id SET DEFAULT nextval('public.invoices_id_seq'::regclass);


--
-- Name: ledger_entries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_entries ALTER COLUMN id SET DEFAULT nextval('public.ledger_entries_id_seq'::regclass);


--
-- Name: online_store_sales id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_store_sales ALTER COLUMN id SET DEFAULT nextval('public.online_store_sales_id_seq'::regclass);


--
-- Name: online_store_withdrawals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_store_withdrawals ALTER COLUMN id SET DEFAULT nextval('public.online_store_withdrawals_id_seq'::regclass);


--
-- Name: order_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items ALTER COLUMN id SET DEFAULT nextval('public.order_items_id_seq'::regclass);


--
-- Name: orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders ALTER COLUMN id SET DEFAULT nextval('public.orders_id_seq'::regclass);


--
-- Name: print_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.print_settings ALTER COLUMN id SET DEFAULT nextval('public.print_settings_id_seq'::regclass);


--
-- Name: product_catalog id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_catalog ALTER COLUMN id SET DEFAULT nextval('public.product_catalog_id_seq'::regclass);


--
-- Name: product_master id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_master ALTER COLUMN id SET DEFAULT nextval('public.product_master_id_seq'::regclass);


--
-- Name: products id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products ALTER COLUMN id SET DEFAULT nextval('public.products_id_seq'::regclass);


--
-- Name: purchase_order_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items ALTER COLUMN id SET DEFAULT nextval('public.purchase_order_items_id_seq'::regclass);


--
-- Name: purchase_orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders ALTER COLUMN id SET DEFAULT nextval('public.purchase_orders_id_seq'::regclass);


--
-- Name: sales_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_items ALTER COLUMN id SET DEFAULT nextval('public.sales_items_id_seq'::regclass);


--
-- Name: sales_orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders ALTER COLUMN id SET DEFAULT nextval('public.sales_orders_id_seq'::regclass);


--
-- Name: stock_opname id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_opname ALTER COLUMN id SET DEFAULT nextval('public.stock_opname_id_seq'::regclass);


--
-- Name: transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions ALTER COLUMN id SET DEFAULT nextval('public.transactions_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: app_users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.app_users (id, username, password, display_name, role, is_active, created_at) FROM stdin;
1	direktur	direktur123	Direktur CV Habil	direktur	t	2026-03-11 23:56:16.768452
2	admin	admin123	Admin Toko	admin	t	2026-03-11 23:56:16.768452
\.


--
-- Data for Name: bug_reports; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.bug_reports (id, title, description, steps, contact, user_agent, reported_at, status, type) FROM stdin;
8	Saran Import Excel	Untuk Import excel tambahkan contoh format excel atau CSV			Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	2026-03-11 16:35:43	resolved	bug
16	discount cod	Untuk disc COD input persentase keluar nominal hasil persentase selanjutnya mengurangi nilai terakhir.\ndan harusnya dimasukkan ke per produk untuk discount cod nya 		Harun (Dev)	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	2026-03-11 18:47:11	open	bug
7	Disc COD	Untuk disc COD input persentase keluar nominal hasil persentase selanjutnya mengurangi nilai terakhir.			Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	2026-03-11 16:34:09	resolved	bug
6	Tambahkan Fitur Sorting	berdasarkan tanggal/nomor faktur, harga, status based from title no faktur distributor hingga aksi, yang perlu saja		Harun	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	2026-03-11 16:07:30	resolved	feature
5	Setelah Simpan Faktur 	harusnya ada popup faktur telah tersimpan		harun	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	2026-03-11 16:05:59	resolved	bug
17	Riwayat Perubahan	harusnya riwayat perubahan supaya lebih rapi dan jelas lagi sih, karena masih rancu dan membingungkan before afternya. coba cari guide ux design perkara hal ini		Harun (Dev)	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	2026-03-11 18:48:42	open	feature
2	111	111	111	111	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	2026-03-11 08:13:57.207	resolved	bug
1	123	123	123	123	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	2026-03-11 08:12:21.341	resolved	bug
4	saran	fitur		dong	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	2026-03-11 15:28:43	resolved	feature
3	123	123	123	233	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	2026-03-11 15:18:45	resolved	bug
18	Jatuh Tempo	fitur jatuh tempo harusnya dimasukkan atau dijejerkan ke belum bayar sih biar jelas, jangan ditaruh dibawah no faktur gitu		Harun (Dev)	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	2026-03-11 18:52:56	open	feature
13	Tombol Edit List	Tombol edit list di distributor dan nama produk hilang		Harun (Dev)	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	2026-03-11 18:43:36	resolved	bug
12	Fitur Universal Search	universal search harusnya nama produknya juga masuk sih kalau disearch		Harun (Dev)	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	2026-03-11 18:43:04	resolved	feature
11	Bug Tanggal edit dan dashboard	Bug Tanggal edit dan dashboard muncul lagi tidak singkron, harusnya tanggal di edit dan di dashboard singkron			Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	2026-03-11 18:42:34	resolved	bug
10	Tanggal Sudah Dibayar di tiap Stack	harusnya ada tanggal sudah di bayar di tiap stack dimunculkan sesuai tanggal pembayarannya		Harun (Dev)	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	2026-03-11 18:41:46	resolved	feature
9	tes update	tes update	tes	tes	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	2026-03-11 18:27:10	resolved	bug
19	Desain UI Stack kalau bisa lebih diperjelas sih	mungkin dikasih warna tiap distributor, tapi ga harus juga sih. cuman dari segi ui/ux di Stack per invoice agak kurang sih		Harun (Dev)	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	2026-03-11 18:55:25	resolved	feature
15	Jatuh Tempo	fitur jatuh tempo harusnya lurus dengan add invoice dan trash, tapi di sebelah kanan biar ux friendly		Harun (Dev)	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	2026-03-11 18:45:30	resolved	feature
14	Rekap per distributor	ketika bulan diganti di rekap per distributor, misal datanya masih empty dia hilang. harusnya masih muncul tapi 0 transaksi gitu sih		Harun (Dev)	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	2026-03-11 18:44:52	resolved	bug
\.


--
-- Data for Name: customers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customers (id, name, address, phone, type, created_at, updated_at) FROM stdin;
1	Toko Farmasi Sejahtera	Jl. Merdeka 10	08123456789	offline	2026-03-12 00:06:58.44993	2026-03-12 00:06:58.44993
2	PAK AGUS	AMS	081216067775	offline	2026-03-12 02:31:51.416836	2026-03-12 02:31:51.416836
3	BABE SUWANDI	Bulak Rukem Timur 2C No 45	082229339779	offline	2026-03-12 02:31:51.416836	2026-03-12 02:31:51.416836
4	ALBERT	Jl Kartini No 9	\N	offline	2026-03-12 02:31:51.416836	2026-03-12 02:31:51.416836
5	Bu Aida	Jl Dharmahusada Indah 1 No 41 Block B164	08123006848	offline	2026-03-12 02:31:51.416836	2026-03-12 02:31:51.416836
6	BU HENNY	Jalan Jambangan VII Baru No.10, Jambangan, Surabaya 60232	08123187674	offline	2026-03-12 02:31:51.416836	2026-03-12 02:31:51.416836
7	BU SUSI	\N	\N	offline	2026-03-12 02:31:51.416836	2026-03-12 02:31:51.416836
8	DENIK	\N	085732206226	offline	2026-03-12 02:31:51.416836	2026-03-12 02:31:51.416836
9	ENDANG YULIATI	\N	085232696024	offline	2026-03-12 02:31:51.416836	2026-03-12 02:31:51.416836
10	emilyjoyceline	Jl. Klampis Semolo Timur II Blok AB-12 No.46, Sukolilo 60119	\N	offline	2026-03-12 02:31:51.416836	2026-03-12 02:31:51.416836
11	Husen Abdullah	Sidosermo Indah Raya No 36	081553309712	offline	2026-03-12 02:31:51.416836	2026-03-12 02:31:51.416836
12	Kris Tantular	Jl. Ketintang Selatan 2/31 Surabaya	085730879558	offline	2026-03-12 02:31:51.416836	2026-03-12 02:31:51.416836
13	Liana Halim	Ruko Rungkut Megah Raya Blok B 30	081333577722	offline	2026-03-12 02:31:51.416836	2026-03-12 02:31:51.416836
14	Mochamad Arif Sholichin	Lapangan Dharmawangsa 74a, Gubeng, Surabaya 60286	085655221855	offline	2026-03-12 02:31:51.416836	2026-03-12 02:31:51.416836
15	Nur Kholifah	Simo	083849191759	offline	2026-03-12 02:31:51.416836	2026-03-12 02:31:51.416836
16	Putut Adji Surjanto	Jl. Rungkut Harapan Blok K/22	081357262832	offline	2026-03-12 02:31:51.416836	2026-03-12 02:31:51.416836
17	RETNO ZAKARIA	Klampis Semolo Timur XII No A-4	081230076763	offline	2026-03-12 02:31:51.416836	2026-03-12 02:31:51.416836
18	SERA	\N	085277073710	offline	2026-03-12 02:31:51.416836	2026-03-12 02:31:51.416836
19	Shantyindria	Gubeng Kertajaya XI E No 12	081235475349	offline	2026-03-12 02:31:51.416836	2026-03-12 02:31:51.416836
20	Suyono	Northwest Lake Blok NG 20-29, Babat Jerawat, Pakal 60196	082233499878	offline	2026-03-12 02:31:51.416836	2026-03-12 02:31:51.416836
21	Syahrul Mahrudin	Dsn Karang Rejo RT002/RW001, Kandat, Kediri	085649010057	offline	2026-03-12 02:31:51.416836	2026-03-12 02:31:51.416836
22	TOKO SUSU SURYA JAYA	\N	\N	offline	2026-03-12 02:31:51.416836	2026-03-12 02:31:51.416836
23	Tonny Sutriono	Jl. Gedangasin 2/74B, Tandes, Surabaya	087870006920	offline	2026-03-12 02:31:51.416836	2026-03-12 02:31:51.416836
24	Vidi Yuliantoro	\N	082230700312	offline	2026-03-12 02:31:51.416836	2026-03-12 02:31:51.416836
25	WIDYANINGSIH	\N	\N	offline	2026-03-12 02:31:51.416836	2026-03-12 02:31:51.416836
26	YUSRON	Jalan Kalimas Hilir III No. 18, Pabean Cantikan 60162	087850752958	offline	2026-03-12 02:31:51.416836	2026-03-12 02:31:51.416836
27	YULI APOTIK	\N	\N	offline	2026-03-12 02:31:51.416836	2026-03-12 02:31:51.416836
28	RENY PRAST	Jalan Menanggal V No 17C, Gayungan, Surabaya 60234	\N	offline	2026-03-12 02:31:51.416836	2026-03-12 02:31:51.416836
29	TIONG	Kutisari	08123010537	offline	2026-03-12 02:31:51.416836	2026-03-12 02:31:51.416836
30	Bpk. Moerwana	Jl. Blimbing III No. 5 Pondok Candra Indah, Waru, Sidoarjo	08123261392	offline	2026-03-12 02:31:51.416836	2026-03-12 02:31:51.416836
31	Rofiq Achmad	IGD RSUD Dr Soetomo	087838883343	offline	2026-03-12 02:31:51.416836	2026-03-12 02:31:51.416836
32	EMIL	Jl Kyai Tambak Deres No 53A	0895321163545	offline	2026-03-12 02:31:51.416836	2026-03-12 02:31:51.416836
33	Nurul Aini Rizqon	RSUD HAJI - ICCU	0896-3903-9398	offline	2026-03-12 02:31:51.416836	2026-03-12 02:31:51.416836
\.


--
-- Data for Name: distributors; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.distributors (id, name, created_at) FROM stdin;
1	PT. ANTARMITRA SEMBADA (AMS)	2026-03-11 12:17:44.515788
3	PT. APL	2026-03-11 14:49:17.278306
4	PT. ENSEVAL	2026-03-11 16:19:45.156848
6	AMS	2026-03-12 02:31:51.368429
7	AAM	2026-03-12 02:31:51.368429
8	APL	2026-03-12 02:31:51.368429
9	ENSEVAL	2026-03-12 02:31:51.368429
10	JNI / PT JNI MITRAJAYA	2026-03-12 02:31:51.368429
11	NUTRIFOOD	2026-03-12 02:31:51.368429
12	PADMATIRTA WISESA	2026-03-12 02:31:51.368429
13	PPG (PARIT PADANG)	2026-03-12 02:31:51.368429
\.


--
-- Data for Name: employees; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.employees (id, name, email, phone, department, "position", salary, hire_date, is_active, created_at, updated_at) FROM stdin;
1	Budi Santoso	budi@company.com	\N	IT	Developer	25000000.00	\N	t	2026-03-10 20:56:20.204201	2026-03-10 20:56:20.204201
2	Siti Nurhaliza	siti@company.com	\N	Sales	Manager	20000000.00	\N	t	2026-03-10 20:56:20.204201	2026-03-10 20:56:20.204201
\.


--
-- Data for Name: inventory_batches; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.inventory_batches (id, product_id, batch_no, expired_date, qty_current, source_type, source_ref, created_at) FROM stdin;
1	1	B2603-01	2026-06-15	50	manual	\N	2026-03-12 00:19:34.517873
2	5	\N	2023-01-01	110	manual	\N	2026-03-12 09:23:48.259355
\.


--
-- Data for Name: inventory_mutations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.inventory_mutations (id, product_id, batch_id, type, qty, reference_type, reference_id, notes, created_by, created_at) FROM stdin;
1	1	1	in	50	manual	\N		2	2026-03-12 00:19:34.517873
2	5	2	in	110	manual	\N		2	2026-03-12 09:23:48.259355
\.


--
-- Data for Name: invoice_audit_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.invoice_audit_log (id, invoice_id, invoice_number, action, changed_by, changed_at, snapshot, note) FROM stdin;
1	1	1260300020	UPDATE	admin	2026-03-11 18:09:53.457037	{"id": 1, "status": "Pending", "due_date": "2026-03-15T17:00:00.000Z", "hna_baru": "23519500.00", "is_draft": false, "final_hna": "954000.00", "hna_final": "23519500.00", "ppn_input": "2587145.00", "total_hna": "27670000.00", "created_at": "2026-03-10T19:18:28.589Z", "deleted_at": null, "draft_data": null, "updated_at": "2026-03-11T08:24:52.285Z", "ppn_masukan": "2587145.00", "disc_cod_ada": false, "hna_plus_ppn": "26106645.00", "payment_date": null, "purchase_date": "2026-03-01T17:00:00.000Z", "invoice_number": "1260300020", "ppn_pembulatan": 2587145, "disc_cod_amount": null, "discount_amount": "4150500.00", "distributor_name": "PT. ANTARMITRA SEMBADA (AMS)", "harga_per_produk": "81329.11"}	
2	1	1260300020	UPDATE	admin	2026-03-11 18:10:00.757192	{"id": 1, "status": "Pending", "due_date": "2026-03-14T17:00:00.000Z", "hna_baru": "23392000.00", "is_draft": false, "final_hna": "954000.00", "hna_final": "23392000.00", "ppn_input": "2573120.00", "total_hna": "27520000.00", "created_at": "2026-03-10T19:18:28.589Z", "deleted_at": null, "draft_data": null, "updated_at": "2026-03-11T11:09:53.461Z", "ppn_masukan": "2573120.00", "disc_cod_ada": false, "hna_plus_ppn": "25965120.00", "payment_date": null, "purchase_date": "2026-02-28T17:00:00.000Z", "invoice_number": "1260300020", "ppn_pembulatan": 2573120, "disc_cod_amount": null, "discount_amount": "4128000.00", "distributor_name": "PT. ANTARMITRA SEMBADA (AMS)", "harga_per_produk": "81141.00"}	
3	1	1260300020	DELETE	admin	2026-03-11 18:29:43.745991	{"id": 1, "status": "Pending", "due_date": "2026-03-13T17:00:00.000Z", "hna_baru": "23392000.00", "is_draft": false, "final_hna": "954000.00", "hna_final": "23392000.00", "ppn_input": "2573120.00", "total_hna": "27520000.00", "created_at": "2026-03-10T19:18:28.589Z", "deleted_at": null, "draft_data": null, "updated_at": "2026-03-11T11:10:00.760Z", "ppn_masukan": "2573120.00", "disc_cod_ada": false, "hna_plus_ppn": "25965120.00", "payment_date": null, "purchase_date": "2026-02-27T17:00:00.000Z", "invoice_number": "1260300020", "ppn_pembulatan": 2573120, "disc_cod_amount": null, "discount_amount": "4128000.00", "distributor_name": "PT. ANTARMITRA SEMBADA (AMS)", "harga_per_produk": "81141.00"}	
4	1	1260300020	RESTORE	admin	2026-03-11 18:29:58.699074	{"id": 1, "status": "Pending", "due_date": "2026-03-13T17:00:00.000Z", "hna_baru": "23392000.00", "is_draft": false, "final_hna": "954000.00", "hna_final": "23392000.00", "ppn_input": "2573120.00", "total_hna": "27520000.00", "created_at": "2026-03-10T19:18:28.589Z", "deleted_at": null, "draft_data": null, "updated_at": "2026-03-11T11:10:00.760Z", "ppn_masukan": "2573120.00", "disc_cod_ada": false, "hna_plus_ppn": "25965120.00", "payment_date": null, "purchase_date": "2026-02-27T17:00:00.000Z", "invoice_number": "1260300020", "ppn_pembulatan": 2573120, "disc_cod_amount": null, "discount_amount": "4128000.00", "distributor_name": "PT. ANTARMITRA SEMBADA (AMS)", "harga_per_produk": "81141.00"}	
5	1	1260300020	UPDATE	admin	2026-03-11 18:32:44.766959	{"id": 1, "status": "Pending", "due_date": "2026-03-13T17:00:00.000Z", "hna_baru": "23392000.00", "is_draft": false, "final_hna": "954000.00", "hna_final": "23392000.00", "ppn_input": "2573120.00", "total_hna": "27520000.00", "created_at": "2026-03-10T19:18:28.589Z", "deleted_at": null, "draft_data": null, "updated_at": "2026-03-11T11:10:00.760Z", "ppn_masukan": "2573120.00", "disc_cod_ada": false, "hna_plus_ppn": "25965120.00", "payment_date": null, "purchase_date": "2026-02-27T17:00:00.000Z", "invoice_number": "1260300020", "ppn_pembulatan": 2573120, "disc_cod_amount": null, "discount_amount": "4128000.00", "distributor_name": "PT. ANTARMITRA SEMBADA (AMS)", "harga_per_produk": "81141.00"}	
6	1	1260300020	UPDATE	admin	2026-03-11 18:32:57.843102	{"id": 1, "status": "Pending", "due_date": "2026-03-12T17:00:00.000Z", "hna_baru": "23392000.00", "is_draft": false, "final_hna": "954000.00", "hna_final": "23158080.00", "ppn_input": "2547388.80", "total_hna": "27520000.00", "created_at": "2026-03-10T19:18:28.589Z", "deleted_at": null, "draft_data": null, "updated_at": "2026-03-11T11:32:44.770Z", "ppn_masukan": "2547388.80", "disc_cod_ada": true, "hna_plus_ppn": "25705468.80", "payment_date": null, "purchase_date": "2026-02-26T17:00:00.000Z", "invoice_number": "1260300020", "ppn_pembulatan": 2547388, "disc_cod_amount": "233920.00", "discount_amount": "4128000.00", "distributor_name": "PT. ANTARMITRA SEMBADA (AMS)", "harga_per_produk": "80329.59"}	
7	20	12780948023	UPDATE	admin	2026-03-11 18:40:18.946658	{"id": 20, "status": "Pending", "due_date": "2026-04-10T17:00:00.000Z", "hna_baru": "1879680.00", "is_draft": false, "final_hna": null, "hna_final": "1879680.00", "ppn_input": "206764.80", "total_hna": "2136000.00", "created_at": "2026-03-11T09:42:36.441Z", "deleted_at": null, "draft_data": null, "updated_at": "2026-03-11T09:42:36.441Z", "ppn_masukan": "206764.80", "disc_cod_ada": false, "hna_plus_ppn": "2086444.80", "payment_date": null, "purchase_date": "2026-03-10T17:00:00.000Z", "invoice_number": "12780948023", "ppn_pembulatan": 206764, "disc_cod_amount": null, "discount_amount": "256320.00", "distributor_name": "PT. ENSEVAL", "harga_per_produk": "86935.20"}	
8	20	12780948023	UPDATE	admin	2026-03-11 19:21:31.334793	{"id": 20, "status": "Paid", "due_date": "2026-04-09T17:00:00.000Z", "hna_baru": "1879680.00", "is_draft": false, "final_hna": null, "hna_final": "1879680.00", "ppn_input": "206764.80", "total_hna": "2136000.00", "created_at": "2026-03-11T09:42:36.441Z", "deleted_at": null, "draft_data": null, "updated_at": "2026-03-11T11:40:18.951Z", "ppn_masukan": "206764.80", "disc_cod_ada": false, "hna_plus_ppn": "2086444.80", "payment_date": "2026-03-10T17:00:00.000Z", "purchase_date": "2026-03-09T17:00:00.000Z", "invoice_number": "12780948023", "ppn_pembulatan": 206764, "disc_cod_amount": null, "discount_amount": "256320.00", "distributor_name": "PT. ENSEVAL", "harga_per_produk": "86935.20"}	
9	20	12780948023	UPDATE	admin	2026-03-11 19:21:46.195107	{"id": 20, "status": "Paid", "due_date": "2026-04-08T17:00:00.000Z", "hna_baru": "1879680.00", "is_draft": false, "final_hna": null, "hna_final": "1879680.00", "ppn_input": "206764.80", "total_hna": "2136000.00", "created_at": "2026-03-11T09:42:36.441Z", "deleted_at": null, "draft_data": null, "updated_at": "2026-03-11T12:21:31.343Z", "ppn_masukan": "206764.80", "disc_cod_ada": false, "hna_plus_ppn": "2086444.80", "payment_date": "2026-03-11T17:00:00.000Z", "purchase_date": "2026-03-08T17:00:00.000Z", "invoice_number": "12780948023", "ppn_pembulatan": 206764, "disc_cod_amount": null, "discount_amount": "256320.00", "distributor_name": "PT. ENSEVAL", "harga_per_produk": "86935.20"}	
10	20	12780948023	UPDATE	admin	2026-03-11 19:27:38.946169	{"id": 20, "status": "Pending", "due_date": "2026-04-07T17:00:00.000Z", "hna_baru": "1879680.00", "is_draft": false, "final_hna": null, "hna_final": "1879680.00", "ppn_input": "206764.80", "total_hna": "2136000.00", "created_at": "2026-03-11T09:42:36.441Z", "deleted_at": null, "draft_data": null, "updated_at": "2026-03-11T12:21:46.197Z", "ppn_masukan": "206764.80", "disc_cod_ada": false, "hna_plus_ppn": "2086444.80", "payment_date": null, "purchase_date": "2026-03-07T17:00:00.000Z", "invoice_number": "12780948023", "ppn_pembulatan": 206764, "disc_cod_amount": null, "discount_amount": "256320.00", "distributor_name": "PT. ENSEVAL", "harga_per_produk": "86935.20"}	
11	20	12780948023	UPDATE	admin	2026-03-11 19:27:53.784998	{"id": 20, "status": "Paid", "due_date": "2026-04-06T17:00:00.000Z", "hna_baru": "1879680.00", "is_draft": false, "final_hna": null, "hna_final": "1879680.00", "ppn_input": "206764.80", "total_hna": "2136000.00", "created_at": "2026-03-11T09:42:36.441Z", "deleted_at": null, "draft_data": null, "updated_at": "2026-03-11T12:27:38.950Z", "ppn_masukan": "206764.80", "disc_cod_ada": false, "hna_plus_ppn": "2086444.80", "payment_date": "2026-03-10T17:00:00.000Z", "purchase_date": "2026-03-06T17:00:00.000Z", "invoice_number": "12780948023", "ppn_pembulatan": 206764, "disc_cod_amount": null, "discount_amount": "256320.00", "distributor_name": "PT. ENSEVAL", "harga_per_produk": "86935.20"}	
12	1	1260300020	UPDATE	admin	2026-03-11 19:30:18.421205	{"id": 1, "status": "Pending", "due_date": "2026-03-11T17:00:00.000Z", "hna_baru": "23392000.00", "is_draft": false, "final_hna": "954000.00", "hna_final": "23392000.00", "ppn_input": "2573120.00", "total_hna": "27520000.00", "created_at": "2026-03-10T19:18:28.589Z", "deleted_at": null, "draft_data": null, "updated_at": "2026-03-11T11:32:57.845Z", "ppn_masukan": "2573120.00", "disc_cod_ada": false, "hna_plus_ppn": "25965120.00", "payment_date": null, "purchase_date": "2026-02-25T17:00:00.000Z", "invoice_number": "1260300020", "ppn_pembulatan": 2573120, "disc_cod_amount": null, "discount_amount": "4128000.00", "distributor_name": "PT. ANTARMITRA SEMBADA (AMS)", "harga_per_produk": "81141.00"}	
13	20	12780948023	UPDATE	admin	2026-03-11 19:34:12.577663	{"id": 20, "status": "Pending", "due_date": "2026-04-05T17:00:00.000Z", "hna_baru": "1879680.00", "is_draft": false, "final_hna": null, "hna_final": "1879680.00", "ppn_input": "206764.80", "total_hna": "2136000.00", "created_at": "2026-03-11T09:42:36.441Z", "deleted_at": null, "draft_data": null, "updated_at": "2026-03-11T12:27:53.790Z", "ppn_masukan": "206764.80", "disc_cod_ada": false, "hna_plus_ppn": "2086444.80", "payment_date": null, "purchase_date": "2026-03-05T17:00:00.000Z", "invoice_number": "12780948023", "ppn_pembulatan": 206764, "disc_cod_amount": null, "discount_amount": "256320.00", "distributor_name": "PT. ENSEVAL", "harga_per_produk": "86935.20"}	
14	20	12780948023	UPDATE	admin	2026-03-11 19:34:21.509538	{"id": 20, "status": "Paid", "due_date": "2026-04-04T17:00:00.000Z", "hna_baru": "1879680.00", "is_draft": false, "final_hna": null, "hna_final": "1879680.00", "ppn_input": "206764.80", "total_hna": "2136000.00", "created_at": "2026-03-11T09:42:36.441Z", "deleted_at": null, "draft_data": null, "updated_at": "2026-03-11T12:34:12.580Z", "ppn_masukan": "206764.80", "disc_cod_ada": false, "hna_plus_ppn": "2086444.80", "payment_date": "2026-03-10T17:00:00.000Z", "purchase_date": "2026-03-04T17:00:00.000Z", "invoice_number": "12780948023", "ppn_pembulatan": 206764, "disc_cod_amount": null, "discount_amount": "256320.00", "distributor_name": "PT. ENSEVAL", "harga_per_produk": "86935.20"}	
15	13	1402286436	UPDATE	admin	2026-03-11 19:41:07.641169	{"id": 13, "status": "Pending", "due_date": "2026-03-20T17:00:00.000Z", "hna_baru": "1863720.00", "is_draft": false, "final_hna": null, "hna_final": "1863720.00", "ppn_input": "205009.20", "total_hna": "1863720.00", "created_at": "2026-03-11T07:51:08.571Z", "deleted_at": null, "draft_data": null, "updated_at": "2026-03-11T07:51:08.571Z", "ppn_masukan": "205009.20", "disc_cod_ada": false, "hna_plus_ppn": "2068729.20", "payment_date": null, "purchase_date": "2026-03-06T17:00:00.000Z", "invoice_number": "1402286436", "ppn_pembulatan": 205009, "disc_cod_amount": null, "discount_amount": null, "distributor_name": "PT. APL", "harga_per_produk": "86197.05"}	
16	13	1402286436	UPDATE	admin	2026-03-11 19:41:19.413965	{"id": 13, "status": "Pending", "due_date": "2026-03-11T17:00:00.000Z", "hna_baru": "1863720.00", "is_draft": false, "final_hna": null, "hna_final": "1863720.00", "ppn_input": "205009.20", "total_hna": "1863720.00", "created_at": "2026-03-11T07:51:08.571Z", "deleted_at": null, "draft_data": null, "updated_at": "2026-03-11T12:41:07.643Z", "ppn_masukan": "205009.20", "disc_cod_ada": false, "hna_plus_ppn": "2068729.20", "payment_date": null, "purchase_date": "2026-03-05T17:00:00.000Z", "invoice_number": "1402286436", "ppn_pembulatan": 205009, "disc_cod_amount": null, "discount_amount": null, "distributor_name": "PT. APL", "harga_per_produk": "86197.05"}	
\.


--
-- Data for Name: invoice_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.invoice_items (id, invoice_id, product_name, quantity, unit_price, total_price, margin, created_at, expired_date, hna, hna_times_qty, disc_percent, disc_nominal, hna_baru, hna_per_item, disc_cod_per_item, hna_after_cod, hpp_inc_ppn) FROM stdin;
22	18	TROPICANA SLIM CLASSIC 160	300	90000.00	27000000.00	0.00	2026-03-11 16:05:27.987817	2029-01-01	90000.00	27000000.00	5.00	1350000.00	25650000.00	85500.00	0.00	0.00	0.00
33	1	TROPICANA SLIM DIABTX 150	320	86000.00	27520000.00	0.00	2026-03-11 19:30:18.426351	2028-09-26	86000.00	27520000.00	15.00	4128000.00	23392000.00	73100.00	0.00	0.00	0.00
35	20	HEPATOSOL LOLA	24	89000.00	2136000.00	0.00	2026-03-11 19:34:21.514871	2027-09-01	89000.00	2136000.00	12.00	256320.00	1879680.00	78320.00	0.00	0.00	0.00
37	13	SGM EKSPLOR GAIN 400G	24	77655.00	1863720.00	0.00	2026-03-11 19:41:19.41913	2027-10-26	77655.00	1863720.00	0.00	0.00	1863720.00	77655.00	0.00	0.00	0.00
\.


--
-- Data for Name: invoices; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.invoices (id, invoice_number, purchase_date, distributor_name, total_hna, discount_amount, ppn_input, final_hna, payment_date, status, created_at, updated_at, hna_baru, disc_cod_ada, disc_cod_amount, hna_final, ppn_masukan, ppn_pembulatan, hna_plus_ppn, harga_per_produk, due_date, deleted_at, is_draft, draft_data) FROM stdin;
1	1260300020	2026-02-25	PT. ANTARMITRA SEMBADA (AMS)	27520000.00	4128000.00	2573120.00	954000.00	\N	Pending	2026-03-11 02:18:28.589587	2026-03-11 19:30:18.423533	23392000.00	f	\N	23392000.00	2573120.00	2573120	25965120.00	81141.00	\N	\N	f	\N
13	1402286436	2026-03-05	PT. APL	1863720.00	\N	205009.20	\N	\N	Pending	2026-03-11 14:51:08.571452	2026-03-11 19:41:19.416794	1863720.00	f	\N	1863720.00	205009.20	205009	2068729.20	86197.05	2026-03-20	\N	f	\N
18	1260300177	2026-03-02	PT. ANTARMITRA SEMBADA (AMS)	27000000.00	1350000.00	2821500.00	\N	\N	Pending	2026-03-11 16:05:27.981328	2026-03-11 16:05:27.981328	25650000.00	f	\N	25650000.00	2821500.00	2821500	28471500.00	94905.00	\N	\N	f	\N
20	12780948023	2026-03-04	PT. ENSEVAL	2136000.00	256320.00	206764.80	\N	\N	Pending	2026-03-11 16:42:36.441439	2026-03-11 19:34:21.5116	1879680.00	f	\N	1879680.00	206764.80	206764	2086444.80	86935.20	2026-04-04	\N	f	\N
39	DRAFT-1773256298	2026-03-12	DRAFT	\N	0.00	0.00	\N	\N	Pending	2026-03-12 02:11:38.429616	2026-03-12 10:14:06.276685	\N	f	0.00	\N	\N	\N	\N	\N	\N	\N	t	{"form": {"status": "Pending", "due_date": "", "disc_cod_ada": false, "payment_date": "", "purchase_date": "", "invoice_number": "", "disc_cod_amount": "", "disc_cod_percent": "", "distributor_name": ""}, "items": [{"_id": "fp1ih5lfge5", "hna": "", "hna_baru": 0, "quantity": "", "disc_nominal": 0, "disc_percent": "", "expired_date": "", "hna_per_item": 0, "product_name": "", "hna_times_qty": 0}]}
\.


--
-- Data for Name: ledger_entries; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.ledger_entries (id, entry_date, account_name, description, debit, credit, category, reference_type, reference_id, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: online_store_sales; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.online_store_sales (id, platform, order_id, order_date, product_name, qty, sell_price, shipping_fee, platform_fee, net_amount, buyer_name, status, batch_import_id, created_at) FROM stdin;
\.


--
-- Data for Name: online_store_withdrawals; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.online_store_withdrawals (id, platform, amount, withdrawal_date, notes, created_at) FROM stdin;
\.


--
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.order_items (id, order_id, product_id, quantity, unit_price, subtotal) FROM stdin;
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.orders (id, order_number, customer_name, customer_email, customer_phone, total_amount, status, notes, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: print_settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.print_settings (id, key, value, created_at, updated_at) FROM stdin;
1	nota_layout	{"address": "Surabaya, Jawa Timur — Indonesia", "show_logo": false, "footer_text": "Dokumen ini dicetak secara otomatis oleh Dashboard CV Habil Sejahtera Bersama", "company_name": "CV HABIL SEJAHTERA BERSAMA - SURABAYA"}	2026-03-12 09:51:53.317299	2026-03-12 10:03:26.524818
\.


--
-- Data for Name: product_catalog; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.product_catalog (id, name, created_at) FROM stdin;
1	TROPICANA SKIM MILK NFDM 1KG	2026-03-11 13:01:02.204182
2	TROPICANA SLIM DIABTX 150	2026-03-11 13:31:37.219398
3	SGM EKSPLOR GAIN 400G	2026-03-11 14:49:41.04891
4	TROPICANA SLIM CLASSIC 160	2026-03-11 16:04:48.860418
5	HEPATOSOL LOLA	2026-03-11 16:20:53.098084
\.


--
-- Data for Name: product_master; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.product_master (id, code, name, unit, hna, sell_price, category, min_stock, is_active, created_at, updated_at) FROM stdin;
1	OBT-001	Paracetamol 500mg	box	8000.00	12000.00	Obat	10	t	2026-03-12 00:19:17.639834	2026-03-12 00:19:17.639834
2	\N	TS SWEET CLASSIC	pcs	84000.00	88830.00	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
3	\N	TS SWEET DIABTX	pcs	83000.00	77167.00	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
4	\N	TS NFDM 1000G	pcs	184000.00	189810.00	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
5	\N	DIANERAL	pcs	36100.00	36100.00	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
6	\N	ENSURE GOLD VANILA 850G	pcs	\N	270000.00	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
7	\N	ENTRAMIX 555	pcs	132000.00	161520.00	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
8	\N	ENTRAMIX COKLAT 174G	pcs	\N	60000.00	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
9	\N	ENTRAMIX VANILA 174G	pcs	\N	\N	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
10	\N	ENTRAKID VANILA 185G	pcs	\N	\N	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
11	\N	ENTRAKID COKLAT 185G	pcs	\N	\N	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
12	\N	ENTRASOY ALMOND SOYA 200G	pcs	55000.00	57173.00	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
13	\N	HEPATOSOL VANILA	pcs	105000.00	106560.00	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
14	\N	HEPATOSOL LOLA	pcs	133500.00	139150.00	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
15	\N	INFATRINI CAIR	pcs	\N	35000.00	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
16	\N	ISOCAL 400G	pcs	\N	60960.00	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
17	\N	NEPHRISOL VANILA 201G	pcs	\N	72960.00	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
18	\N	NEPHRISOL CAPPUCINO	pcs	\N	72960.00	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
19	\N	NEPHRISOL D VANILA	pcs	71000.00	75600.00	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
20	\N	NEPHRISOL CAP	pcs	\N	\N	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
21	\N	NUTRICAN	pcs	\N	90000.00	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
22	\N	NUTRINIDRINK 200ML	pcs	\N	29000.00	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
23	\N	OLIGO BANANA 165G	pcs	95000.00	98903.00	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
24	\N	PEPTAMEN DEWASA	pcs	\N	290115.00	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
25	\N	PEPTAMEN JUNIOR	pcs	\N	304605.00	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
26	\N	PEPTIBREN VANILA	pcs	\N	75000.00	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
27	\N	PEPTIMUNE VANILA	pcs	\N	79380.00	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
28	\N	PEPTISOL VANILA	pcs	\N	74655.00	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
29	\N	PEPTISOL COKLAT	pcs	\N	74655.00	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
30	\N	PULMOSOL	pcs	\N	64260.00	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
31	\N	SGM ISOPRO ANANDA 6-12 400G	pcs	\N	60480.00	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
32	\N	SGM LLM 200G	pcs	\N	43032.00	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
33	\N	SGM LLM 400G	pcs	\N	78435.00	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
34	\N	SUN KARA 200	pcs	\N	7250.00	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
35	\N	TS SWEETENER GULA JAWA 350ML	pcs	\N	66292.00	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
36	\N	DSOL O CALSWEET	pcs	\N	\N	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
37	\N	FF UHT STRAWBERRY OMG 36X110ML	karton	\N	\N	\N	5	t	2026-03-12 02:31:51.412532	2026-03-12 02:31:51.412532
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.products (id, name, sku, category, description, price, stock, reorder_level, created_at, updated_at) FROM stdin;
1	Laptop Lenovo	LAPTOP-001	Electronics	\N	8500000.00	15	10	2026-03-10 20:56:20.20341	2026-03-10 20:56:20.20341
2	Mouse Logitech	MOUSE-001	Accessories	\N	350000.00	50	10	2026-03-10 20:56:20.20341	2026-03-10 20:56:20.20341
3	Keyboard Mechanical	KEYBOARD-001	Accessories	\N	1200000.00	20	10	2026-03-10 20:56:20.20341	2026-03-10 20:56:20.20341
\.


--
-- Data for Name: purchase_order_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.purchase_order_items (id, po_id, product_name, qty, unit, unit_price, subtotal, received_qty) FROM stdin;
\.


--
-- Data for Name: purchase_orders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.purchase_orders (id, po_number, distributor_name, distributor_address, order_date, expected_date, status, notes, total, is_deleted, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: sales_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sales_items (id, sales_order_id, product_name, qty, unit, unit_price, subtotal, created_at) FROM stdin;
1	1	Paracetamol 500mg	10	box	15000.00	150000.00	2026-03-12 00:07:35.438896
2	2	HEPATOSOL LOLA	1	pcs	0.00	0.00	2026-03-12 01:23:03.842484
5	3	Produk A	2	pcs	50000.00	100000.00	2026-03-12 11:30:22.87274
\.


--
-- Data for Name: sales_orders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sales_orders (id, order_number, customer_id, customer_name, customer_address, sale_date, total, status, pdf_status, notes, is_deleted, created_by, created_at, updated_at, payment_method, payment_details) FROM stdin;
2	NT26030002	\N	Tes	Tes	2026-03-11	0.00	draft	sudah_dicetak	tes	f	2	2026-03-12 01:23:03.842484	2026-03-12 10:36:08.400523	Tunai	\N
1	NT26030001	\N	Toko Farmasi Sejahtera	Jl. Merdeka 10	2026-03-11	150000.00	draft	sudah_dicetak		f	2	2026-03-12 00:07:35.438896	2026-03-12 11:15:53.44747	Tunai	\N
3	NT26030003	\N	Test Customer Transfer	Jl. Transfer No. 123	2026-03-10	100000.00	final	sudah_dicetak		f	2	2026-03-12 11:18:37.113055	2026-03-12 11:30:22.87274	Tunai	
\.


--
-- Data for Name: stock_opname; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.stock_opname (id, product_id, system_qty, physical_qty, difference, notes, opname_date, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: transactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.transactions (id, type, category, amount, description, reference_id, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, username, email, password_hash, role, is_active, created_at, updated_at) FROM stdin;
2	user1	user1@company.com	hashed_password_here	user	t	2026-03-10 20:56:20.199036	2026-03-10 20:56:20.199036
1	admin	admin@company.com	$2b$10$aw5sEftTtqVn0RSwMIW.Eu66S/fcNw45I7Ob6Lg6q991T3o8T/qjK	admin	t	2026-03-10 20:56:20.199036	2026-03-10 20:56:20.199036
\.


--
-- Name: app_users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.app_users_id_seq', 2, true);


--
-- Name: bug_reports_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.bug_reports_id_seq', 19, true);


--
-- Name: customers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.customers_id_seq', 33, true);


--
-- Name: distributors_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.distributors_id_seq', 13, true);


--
-- Name: employees_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.employees_id_seq', 3, true);


--
-- Name: inventory_batches_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.inventory_batches_id_seq', 2, true);


--
-- Name: inventory_mutations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.inventory_mutations_id_seq', 2, true);


--
-- Name: invoice_audit_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.invoice_audit_log_id_seq', 16, true);


--
-- Name: invoice_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.invoice_items_id_seq', 37, true);


--
-- Name: invoices_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.invoices_id_seq', 39, true);


--
-- Name: ledger_entries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.ledger_entries_id_seq', 1, false);


--
-- Name: online_store_sales_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.online_store_sales_id_seq', 1, false);


--
-- Name: online_store_withdrawals_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.online_store_withdrawals_id_seq', 1, false);


--
-- Name: order_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.order_items_id_seq', 1, false);


--
-- Name: orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.orders_id_seq', 1, false);


--
-- Name: print_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.print_settings_id_seq', 11, true);


--
-- Name: product_catalog_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.product_catalog_id_seq', 5, true);


--
-- Name: product_master_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.product_master_id_seq', 37, true);


--
-- Name: products_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.products_id_seq', 4, true);


--
-- Name: purchase_order_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.purchase_order_items_id_seq', 1, false);


--
-- Name: purchase_orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.purchase_orders_id_seq', 1, false);


--
-- Name: sales_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.sales_items_id_seq', 5, true);


--
-- Name: sales_orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.sales_orders_id_seq', 3, true);


--
-- Name: stock_opname_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.stock_opname_id_seq', 1, false);


--
-- Name: transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.transactions_id_seq', 1, false);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 3, true);


--
-- Name: app_users app_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_users
    ADD CONSTRAINT app_users_pkey PRIMARY KEY (id);


--
-- Name: app_users app_users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_users
    ADD CONSTRAINT app_users_username_key UNIQUE (username);


--
-- Name: bug_reports bug_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bug_reports
    ADD CONSTRAINT bug_reports_pkey PRIMARY KEY (id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: distributors distributors_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.distributors
    ADD CONSTRAINT distributors_name_key UNIQUE (name);


--
-- Name: distributors distributors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.distributors
    ADD CONSTRAINT distributors_pkey PRIMARY KEY (id);


--
-- Name: employees employees_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_email_key UNIQUE (email);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: inventory_batches inventory_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_batches
    ADD CONSTRAINT inventory_batches_pkey PRIMARY KEY (id);


--
-- Name: inventory_mutations inventory_mutations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_mutations
    ADD CONSTRAINT inventory_mutations_pkey PRIMARY KEY (id);


--
-- Name: invoice_audit_log invoice_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_audit_log
    ADD CONSTRAINT invoice_audit_log_pkey PRIMARY KEY (id);


--
-- Name: invoice_items invoice_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_invoice_number_key UNIQUE (invoice_number);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: ledger_entries ledger_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_entries
    ADD CONSTRAINT ledger_entries_pkey PRIMARY KEY (id);


--
-- Name: online_store_sales online_store_sales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_store_sales
    ADD CONSTRAINT online_store_sales_pkey PRIMARY KEY (id);


--
-- Name: online_store_withdrawals online_store_withdrawals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_store_withdrawals
    ADD CONSTRAINT online_store_withdrawals_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_order_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: print_settings print_settings_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.print_settings
    ADD CONSTRAINT print_settings_key_key UNIQUE (key);


--
-- Name: print_settings print_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.print_settings
    ADD CONSTRAINT print_settings_pkey PRIMARY KEY (id);


--
-- Name: product_catalog product_catalog_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_catalog
    ADD CONSTRAINT product_catalog_name_key UNIQUE (name);


--
-- Name: product_catalog product_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_catalog
    ADD CONSTRAINT product_catalog_pkey PRIMARY KEY (id);


--
-- Name: product_master product_master_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_master
    ADD CONSTRAINT product_master_code_key UNIQUE (code);


--
-- Name: product_master product_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_master
    ADD CONSTRAINT product_master_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: products products_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_sku_key UNIQUE (sku);


--
-- Name: purchase_order_items purchase_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_pkey PRIMARY KEY (id);


--
-- Name: purchase_orders purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);


--
-- Name: purchase_orders purchase_orders_po_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_po_number_key UNIQUE (po_number);


--
-- Name: sales_items sales_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_items
    ADD CONSTRAINT sales_items_pkey PRIMARY KEY (id);


--
-- Name: sales_orders sales_orders_order_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT sales_orders_order_number_key UNIQUE (order_number);


--
-- Name: sales_orders sales_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT sales_orders_pkey PRIMARY KEY (id);


--
-- Name: stock_opname stock_opname_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_opname
    ADD CONSTRAINT stock_opname_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: idx_audit_invoice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_invoice_id ON public.invoice_audit_log USING btree (invoice_id);


--
-- Name: idx_batches_expired; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_batches_expired ON public.inventory_batches USING btree (expired_date);


--
-- Name: idx_batches_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_batches_product ON public.inventory_batches USING btree (product_id);


--
-- Name: idx_employees_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_department ON public.employees USING btree (department);


--
-- Name: idx_invoice_items_invoice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_items_invoice_id ON public.invoice_items USING btree (invoice_id);


--
-- Name: idx_invoices_distributor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_distributor ON public.invoices USING btree (distributor_name);


--
-- Name: idx_invoices_purchase_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_purchase_date ON public.invoices USING btree (purchase_date);


--
-- Name: idx_invoices_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_status ON public.invoices USING btree (status);


--
-- Name: idx_ledger_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ledger_account ON public.ledger_entries USING btree (account_name);


--
-- Name: idx_ledger_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ledger_category ON public.ledger_entries USING btree (category);


--
-- Name: idx_ledger_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ledger_date ON public.ledger_entries USING btree (entry_date DESC);


--
-- Name: idx_mutations_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mutations_created ON public.inventory_mutations USING btree (created_at DESC);


--
-- Name: idx_mutations_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mutations_product ON public.inventory_mutations USING btree (product_id);


--
-- Name: idx_opname_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_opname_date ON public.stock_opname USING btree (opname_date DESC);


--
-- Name: idx_order_items_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_order_id ON public.order_items USING btree (order_id);


--
-- Name: idx_orders_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_created_at ON public.orders USING btree (created_at DESC);


--
-- Name: idx_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_status ON public.orders USING btree (status);


--
-- Name: idx_oss_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oss_batch ON public.online_store_sales USING btree (batch_import_id);


--
-- Name: idx_oss_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oss_date ON public.online_store_sales USING btree (order_date DESC);


--
-- Name: idx_oss_platform; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oss_platform ON public.online_store_sales USING btree (platform);


--
-- Name: idx_po_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_deleted ON public.purchase_orders USING btree (is_deleted);


--
-- Name: idx_po_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_status ON public.purchase_orders USING btree (status);


--
-- Name: idx_products_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_category ON public.products USING btree (category);


--
-- Name: idx_products_stock; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_stock ON public.products USING btree (stock);


--
-- Name: idx_sales_items_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_items_order ON public.sales_items USING btree (sales_order_id);


--
-- Name: idx_sales_orders_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_orders_customer ON public.sales_orders USING btree (customer_name);


--
-- Name: idx_sales_orders_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_orders_date ON public.sales_orders USING btree (sale_date DESC);


--
-- Name: idx_transactions_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_created_at ON public.transactions USING btree (created_at DESC);


--
-- Name: idx_transactions_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_type ON public.transactions USING btree (type);


--
-- Name: inventory_batches inventory_batches_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_batches
    ADD CONSTRAINT inventory_batches_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.product_master(id) ON DELETE CASCADE;


--
-- Name: inventory_mutations inventory_mutations_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_mutations
    ADD CONSTRAINT inventory_mutations_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.inventory_batches(id);


--
-- Name: inventory_mutations inventory_mutations_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_mutations
    ADD CONSTRAINT inventory_mutations_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.product_master(id) ON DELETE CASCADE;


--
-- Name: invoice_items invoice_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: purchase_order_items purchase_order_items_po_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_po_id_fkey FOREIGN KEY (po_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE;


--
-- Name: sales_items sales_items_sales_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_items
    ADD CONSTRAINT sales_items_sales_order_id_fkey FOREIGN KEY (sales_order_id) REFERENCES public.sales_orders(id) ON DELETE CASCADE;


--
-- Name: stock_opname stock_opname_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_opname
    ADD CONSTRAINT stock_opname_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.product_master(id) ON DELETE CASCADE;


--
-- Name: transactions transactions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--

\unrestrict MA9c2I45RqYkKytdDkwt09XIVyTKOBQZSYZpr26Mi8qoSeosn6P5jBwJvbHewLe

