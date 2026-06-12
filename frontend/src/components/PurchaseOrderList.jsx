import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Plus, Trash2, X, CheckCircle, FileText } from "lucide-react";
import {
  purchaseOrdersAPI,
  distributorsAPI,
  inventoryAPI,
  countersAPI,
  printSettingsAPI,
} from "../services/api";
import { getProductUnits, formatQtyWithConversion } from "../constants/units";
import MasterSelect from "./MasterSelect";
import Skeleton from "./common/Skeleton";
import ConfirmModal from "./common/ConfirmModal";
import Breadcrumb from "./common/Breadcrumb";
import SPPreview from "./common/SPPreview";
import EmptyState, { EmptyStateIcons } from "./common/EmptyState";
import Icons from "./common/Icon";
import { UI_MOTION, uiTransition } from "../constants/ui";
import useBodyScrollLock from "../hooks/useBodyScrollLock";
import SearchBox from "./common/SearchBox";
import ToastNotice from "./common/ToastNotice";
import useDebouncedValue from "../hooks/useDebouncedValue";

const renderPortal = (node) =>
  typeof document === "undefined" ? node : createPortal(node, document.body);

const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "-";
const blankItem = () => ({
  product_name: "",
  product_id: null,
  qty: 1,
  unit: "pcs",
  unit_price: 0,
  _custom_unit: false,
});

const statusColors = {
  draft: {
    bg: "var(--color-warning-soft)",
    color: "var(--color-warning)",
    label: "Draft",
  },
  sent: {
    bg: "var(--color-primary-soft)",
    color: "var(--color-primary)",
    label: "Dikirim",
  },
  partial: {
    bg: "var(--color-primary-hover)18",
    color: "var(--color-primary-hover)",
    label: "Partial",
  },
  received: {
    bg: "var(--color-success-soft)",
    color: "var(--color-success)",
    label: "Diterima",
  },
};

const TooltipButton = ({
  label,
  children,
  className = "",
  style = {},
  isDarkMode,
  ...buttonProps
}) => (
  <span className="group relative inline-flex">
    <button
      {...buttonProps}
      aria-label={label}
      className={`ui-motion-button ui-focus-ring ${className}`.trim()}
      style={style}
    >
      {children}
    </button>
    <span
      role="tooltip"
      className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md border px-2.5 py-1 text-[10px] font-semibold shadow-lg opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      style={{
        backgroundColor: isDarkMode ? "var(--color-surface-elevated)" : "#FFF",
        color: isDarkMode ? "#FFF" : "#000",
        borderColor: isDarkMode
          ? "var(--color-surface-raised)"
          : "var(--color-border)",
      }}
    >
      {label}
    </span>
  </span>
);

export default function PurchaseOrderList({
  isDarkMode,
  isSidebarOpen,
  isMobile,
  isVantaMode,
}) {
  const [orders, setOrders] = useState([]);
  const [distributors, setDistributors] = useState([]);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [showModal, setShowModal] = useState(null); // null | 'create' | 'receive' | 'distributor'
  const [editId, setEditId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [toast, setToast] = useState("");
  const [toastType, setToastType] = useState("success");
  const toastTimerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(null); // order id being printed
  const [sortKeys, setSortKeys] = useState([]);
  const [isReceiving, setIsReceiving] = useState(false);
  const [distributorSaving, setDistributorSaving] = useState(false);

  const [isAutoSP, setIsAutoSP] = useState(true);
  const [manualNumber, setManualNumber] = useState("");
  const [spCounter, setSpCounter] = useState({ prefix: "SP", last_number: 0 });
  const numberInputRef = useRef(null);

  // Compute preview SP number matching backend generatePONumber (per-month, 3-digit)
  const autoSPNumber = useMemo(() => {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yymm = yy + mm;
    const monthPrefix = "HSB-SP-" + yymm;
    const seqs = (orders || [])
      .filter((o) => !o.is_deleted && typeof o.po_number === "string" && o.po_number.startsWith(monthPrefix))
      .map((o) => parseInt(o.po_number.slice(monthPrefix.length), 10))
      .filter((n) => Number.isFinite(n));
    const next = (seqs.length ? Math.max(...seqs) : 0) + 1;
    return yymm + String(next).padStart(3, "0");
  }, [orders]);
  const [form, setForm] = useState({
    po_number: "",
    distributor_name: "",
    distributor_address: "",
    pic_name: "Harun Al Rasyid",
    order_date: new Date().toISOString().split("T")[0],
    expected_date: "",
    notes: "",
  });
  const [distForm, setDistForm] = useState({
    name: "",
    short_code: "",
    salesman_name: "",
    salesman_phone: "",
  });
  const [items, setItems] = useState([blankItem()]);
  const [receiveItems, setReceiveItems] = useState([]);
  const [layoutSettings, setLayoutSettings] = useState(null);

  const bg = "var(--color-bg)";
  const cardBg = "var(--color-surface)";
  const border = "var(--color-border)";
  const text = "var(--color-text)";
  const sub = "var(--color-text-subtle)";
  useBodyScrollLock(showModal || !!deleteConfirmId);
  useEffect(() => {
    if (!showModal) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (showModal === "distributor") {
        setShowModal("create");
        return;
      }
      setShowModal(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showModal]);
  const fetchOrders = async () => {
    setLoading(true);
    try {
      const { data } = await purchaseOrdersAPI.getAll();
      setOrders(data);
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => setLoading(false), UI_MOTION.duration.loading);
    }
  };
  const fetchDistributors = async () => {
    try {
      const { data } = await distributorsAPI.getAll();
      setDistributors(data);
    } catch (e) {
      console.error(e);
    }
  };
  const fetchProducts = async () => {
    try {
      const { data } = await inventoryAPI.getProducts();
      setProducts(data);
    } catch (e) {
      console.error(e);
    }
  };
  const fetchCounters = async () => {
    try {
      const { data } = await countersAPI.getAll();
      const sp = data.find((c) => c.doc_type === "SP");
      if (sp) setSpCounter(sp);
    } catch (e) {
      console.error(e);
    }
  };
  const fetchSettings = async () => {
    try {
      const { data } = await printSettingsAPI.get();
      setLayoutSettings(data.nota_layout);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchDistributors();
    fetchProducts();
    fetchCounters();
    fetchSettings();
  }, []);

  const filtered = orders.filter((o) => {
    const q = debouncedSearch.toLowerCase();
    return (
      o.po_number.toLowerCase().includes(q) ||
      o.distributor_name.toLowerCase().includes(q)
    );
  });

  const handleSort = (field, isShift) => {
    setSortKeys((prev) => {
      const idx = prev.findIndex((k) => k.field === field);
      if (isShift) {
        if (idx >= 0) {
          if (prev[idx].dir === "asc")
            return prev.map((k) =>
              k.field === field ? { ...k, dir: "desc" } : k,
            );
          return prev.filter((k) => k.field !== field);
        }
        return [...prev, { field, dir: "asc" }];
      } else {
        if (prev.length === 1 && prev[0].field === field)
          return [{ field, dir: prev[0].dir === "asc" ? "desc" : "asc" }];
        return [{ field, dir: "asc" }];
      }
    });
  };

  const sorted = sortKeys.length
    ? [...filtered].sort((a, b) => {
        for (const { field, dir } of sortKeys) {
          let va = a[field],
            vb = b[field];
          if (field === "order_date") {
            va = new Date(va || 0);
            vb = new Date(vb || 0);
          } else if (field === "total") {
            va = parseFloat(va) || 0;
            vb = parseFloat(vb) || 0;
          } else {
            va = String(va || "").toLowerCase();
            vb = String(vb || "").toLowerCase();
          }
          if (va < vb) return dir === "asc" ? -1 : 1;
          if (va > vb) return dir === "asc" ? 1 : -1;
        }
        return 0;
      })
    : filtered;

  // AUDIT-UX-02 + UX-13: bedakan error vs sukses + clearTimeout biar toast
  // beruntun tidak kepotong timer lama.
  const flash = (msg, type = "success") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    setToastType(type);
    toastTimerRef.current = setTimeout(
      () => setToast(""),
      type === "error"
        ? UI_MOTION.duration.toastError
        : UI_MOTION.duration.toastSuccess,
    );
  };
  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    border: `1px solid ${border}`,
    borderRadius: "10px",
    backgroundColor: isDarkMode
      ? "var(--color-surface-raised)"
      : "var(--color-bg)",
    color: text,
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
  };
  const iconButtonStyle = {
    minWidth: "40px",
    minHeight: "40px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--color-surface-elevated)",
    border: `1px solid ${border}`,
    borderRadius: "10px",
    cursor: "pointer",
    padding: "0",
  };
  const labelStyle = {
    display: "block",
    fontSize: "11px",
    fontWeight: "700",
    color: sub,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: "6px",
  };

  const openCreate = () => {
    setIsAutoSP(true);
    setManualNumber("");
    setEditId(null);
    setSaveError("");
    setForm({
      po_number: "",
      distributor_name: "",
      distributor_address: "",
      pic_name: "Harun Al Rasyid",
      order_date: new Date().toISOString().split("T")[0],
      expected_date: "",
      notes: "",
    });
    setItems([blankItem()]);
    fetchCounters();
    setShowModal("create");
  };

  const openEdit = (o) => {
    setEditId(o.id);
    setForm({
      po_number: o.po_number,
      distributor_name: o.distributor_name,
      distributor_address: o.distributor_address || "",
      pic_name: o.pic_name || "Harun Al Rasyid",
      order_date: o.order_date?.split("T")[0] || "",
      expected_date: o.expected_date?.split("T")[0] || "",
      notes: o.notes || "",
    });
    setItems(
      o.items?.length
        ? o.items.map((i) => ({
            product_name: i.product_name,
            product_id: i.product_id || null,
            qty: i.qty,
            unit: i.unit || "pcs",
            unit_price: parseFloat(i.unit_price) || 0,
          }))
        : [blankItem()],
    );
    setShowModal("create");
  };

  const openReceive = (o) => {
    setEditId(o.id);
    setReceiveItems(
      o.items?.map((i) => ({
        receive_key: `${i.id}-0`,
        po_item_id: i.id,
        product_name: i.product_name,
        ordered_qty: i.qty,
        already_received: i.received_qty || 0,
        received_qty: 0,
        batch_no: "",
        expired_date: "",
      })) || [],
    );
    setShowModal("receive");
  };

  const updateReceiveItem = (idx, patch) => {
    setReceiveItems((prev) =>
      prev.map((item, itemIdx) =>
        itemIdx === idx ? { ...item, ...patch } : item,
      ),
    );
  };

  const getReceiveTotal = (poItemId) =>
    receiveItems
      .filter((item) => item.po_item_id === poItemId)
      .reduce((sum, item) => sum + (parseInt(item.received_qty) || 0), 0);

  const getReceiveLineCount = (poItemId) =>
    receiveItems.filter((item) => item.po_item_id === poItemId).length;

  const addReceiveBatchLine = (idx) => {
    setReceiveItems((prev) => {
      const source = prev[idx];
      if (!source) return prev;
      const lineCount = prev.filter(
        (item) => item.po_item_id === source.po_item_id,
      ).length;
      const next = [...prev];
      next.splice(idx + 1, 0, {
        ...source,
        receive_key: `${source.po_item_id}-${Date.now()}-${lineCount}`,
        received_qty: 0,
        batch_no: "",
        expired_date: source.expired_date || "",
      });
      return next;
    });
  };

  const removeReceiveBatchLine = (idx) => {
    setReceiveItems((prev) => {
      const target = prev[idx];
      const lineCount = prev.filter(
        (item) => item.po_item_id === target?.po_item_id,
      ).length;
      if (!target || lineCount <= 1) return prev;
      return prev.filter((_, itemIdx) => itemIdx !== idx);
    });
  };

  const handleSave = async () => {
    setSaveError("");
    if (!form.distributor_name.trim()) return flash("Nama distributor wajib", "error");
    const validItems = items.filter((i) => i.product_name.trim());
    if (!validItems.length) return flash("Min 1 produk", "error");
    setIsSaving(true);
    try {
      const payload = { ...form, items: validItems };
      if (!isAutoSP && !manualNumber && !editId) {
        setIsSaving(false);
        return flash(
          "Nomor SP wajib diisi secara manual (Sistem sedang dalam mode Manual)",
          "error",
        );
      }
      if (!isAutoSP && !editId) {
        payload.po_number = spCounter.prefix + manualNumber;
      }
      if (isAutoSP && !editId) {
        delete payload.po_number;
      }
      if (editId) {
        await purchaseOrdersAPI.update(editId, payload);
        flash("SP diperbarui");
      } else {
        await purchaseOrdersAPI.create(payload);
        flash("SP berhasil dibuat");
        fetchCounters();
      }
      setShowModal(null);
      fetchOrders();
    } catch (e) {
      setSaveError(e.response?.data?.error || e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDistributor = async () => {
    if (!distForm.name.trim()) return flash("Nama distributor wajib", "error");
    setDistributorSaving(true);
    try {
      const res = await distributorsAPI.add(distForm); // Backend handles UPSERT using name
      flash("Data Distributor Disimpan");
      setForm((p) => ({ ...p, distributor_name: res.data.name }));
      fetchDistributors();
      setShowModal("create");
    } catch (e) {
      flash(e.response?.data?.error || e.message, "error");
    } finally {
      setDistributorSaving(false);
    }
  };

  const handleReceive = async () => {
    const toReceive = receiveItems.filter(
      (i) => (parseInt(i.received_qty) || 0) > 0,
    );
    if (!toReceive.length) return flash("Masukkan qty yang diterima", "error");
    const overReceivedItem = receiveItems.find((item) => {
      const total = getReceiveTotal(item.po_item_id);
      const remaining = item.ordered_qty - item.already_received;
      return total > remaining;
    });
    if (overReceivedItem) {
      return flash(
        `${overReceivedItem.product_name}: total batch melebihi sisa pesanan`,
        "error",
      );
    }
    setIsReceiving(true);
    try {
      await purchaseOrdersAPI.receive(editId, { items: toReceive });
      flash("Barang diterima & stok diperbarui");
      setShowModal(null);
      fetchOrders();
    } catch (e) {
      flash(e.response?.data?.error || e.message, "error");
    } finally {
      setIsReceiving(false);
    }
  };

  const handleDelete = (id) => setDeleteConfirmId(id);
  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await purchaseOrdersAPI.remove(deleteConfirmId);
      flash("SP dihapus");
      fetchOrders();
    } catch (e) {
      flash(e.response?.data?.error || e.message, "error");
    } finally {
      setDeleteConfirmId(null);
    }
  };

  // MasterSelect handlers for Distributor
  const handleAddDistributor = async (name) => {
    await distributorsAPI.add(name);
    fetchDistributors();
  };

  const handleRemoveDistributor = async (name) => {
    await distributorsAPI.remove(name);
    fetchDistributors();
  };

  const handleRenameDistributor = async (oldName, newName) => {
    await distributorsAPI.rename(oldName, newName);
    fetchDistributors();
  };

  // MasterSelect handlers for Produk (mirror Nota — tambah produk baru langsung daftar ke Inventory)
  const handleAddProduct = async (name) => {
    try {
      await inventoryAPI.createProduct({
        name,
        unit: "pcs",
        hna: 0,
        sell_price: 0,
        category: "",
        min_stock: 5,
      });
      flash("Produk ditambahkan");
      fetchProducts();
    } catch (e) {
      flash(
        e.response?.status === 400
          ? "Produk baru wajib punya KODE — buat dulu di halaman Inventory ya"
          : e.response?.data?.error || e.message,
        "error",
      );
    }
  };
  const handleRemoveProduct = async (name) => {
    try {
      const product = products.find((p) => p.name === name);
      if (product) {
        await inventoryAPI.deleteProduct(product.id);
        flash("Produk dinonaktifkan");
        fetchProducts();
      }
    } catch (e) {
      flash(e.response?.data?.error || e.message, "error");
    }
  };
  const handleRenameProduct = async (oldName, newName) => {
    try {
      const product = products.find((p) => p.name === oldName);
      if (product) {
        await inventoryAPI.updateProduct(product.id, {
          name: newName,
          code: product.code,
          unit: product.unit,
          hna: product.hna,
          sell_price: product.sell_price,
          category: product.category,
          min_stock: product.min_stock,
        });
        flash("Nama produk diubah");
        fetchProducts();
      }
    } catch (e) {
      flash(e.response?.data?.error || e.message, "error");
    }
  };

  const addItem = () => setItems([...items, blankItem()]);
  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx, f, v) => {
    const n = [...items];
    let updated = { ...n[idx], [f]: v };
    if (f === "product_option") {
      // v1.22.1: pilih dari master → simpan product_id langsung (anti salah-cocok by-nama)
      updated = {
        ...n[idx],
        product_name: v?.name || "",
        product_id: v?.id || null,
        unit: v?.base_unit || v?.unit || n[idx].unit || "pcs",
      };
    } else if (f === "product_name") {
      const match = products.find(
        (p) => p.name?.toLowerCase() === v?.toLowerCase(),
      );
      if (match) {
        updated.unit = match.base_unit || match.unit || "pcs";
        updated.product_id = match.id || null;
      } else {
        updated.product_id = null;
      }
    }
    n[idx] = updated;
    setItems(n);
  };
  const selectedDistributorInfo = distributors.find(
    (d) => d.name === form.distributor_name,
  );

  const handlePrintSP = async (o) => {
    if (pdfLoading) return;
    setPdfLoading(o.id);
    try {
      const { generateSPPDF } = await import("../utils/generateSPPDF");
      const bInfo = await printSettingsAPI.get();
      const settings = bInfo.data.nota_layout || undefined;
      const sInfo =
        distributors.find((d) => d.name === o.distributor_name) || {};
      const doc = generateSPPDF(o, {
        format: "A6",
        salesmanInfo: sInfo,
        settings,
      });
      doc.save(`SP_${o.po_number}.pdf`);
      flash("Cetak SP Berhasil");
      await purchaseOrdersAPI.update(o.id, { status: "sent" });
      fetchOrders();
    } catch (e) {
      flash("Gagal buat PDF: " + e.message, "error");
    } finally {
      setPdfLoading(null);
    }
  };

  return (
    <div
      className="ui-page ui-motion-page"
      style={{
        padding: isMobile ? "1rem" : "2rem",
        paddingTop: isMobile ? "4rem" : "2rem",
        backgroundColor: isVantaMode ? "transparent" : bg,
        minHeight: "100vh",
        transition: uiTransition(
          "margin-left",
          UI_MOTION.duration.page,
          UI_MOTION.easing.standard,
        ),
      }}
    >
      <Breadcrumb
        title="Surat Pesanan"
        isMobile={isMobile}
        isDarkMode={isDarkMode}
      />
      {/* Header */}
      <div
        className="ui-readable-surface"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          gap: "12px",
          padding: isMobile ? "1rem" : "1.25rem 1.5rem",
          borderRadius: "1rem",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "2rem",
              fontWeight: "700",
              margin: 0,
              color: text,
            }}
          >
            📋 Surat Pesanan
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: "14px", color: sub }}>
            {loading ? (
              <Skeleton width="130px" height="14px" />
            ) : (
              `${orders.length} SP tercatat`
            )}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="btn-primary ui-motion-button ui-focus-ring"
          data-magnetic="true"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "10px 18px",
            backgroundColor: "var(--color-primary-hover)",
            color: "#FFF",
            border: "none",
            borderRadius: "10px",
            cursor: "pointer",
            fontWeight: "700",
            fontSize: "14px",
          }}
        >
          <Plus size={18} /> Buat SP
        </button>
      </div>

      {/* Search */}
      <div
        className="ui-toolbar"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "1.5rem",
        }}
      >
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Cari nomor SP atau distributor..."
          ariaLabel="Cari surat pesanan"
          style={{
            maxWidth: isMobile ? "100%" : "400px",
            minWidth: isMobile ? "100%" : "280px",
            flex: 1,
          }}
          inputStyle={{
            backgroundColor: inputStyle.backgroundColor,
            borderColor: border,
            color: text,
          }}
        />
        {sortKeys.length > 0 && (
          <button
            onClick={() => setSortKeys([])}
            style={{
              padding: "10px 14px",
              border: `1px solid ${border}`,
              borderRadius: "10px",
              background: "none",
              color: sub,
              fontSize: "12px",
              fontWeight: "600",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            ↺ Reset Sort
          </button>
        )}
      </div>

      {/* Table */}
      <div
        className="ui-table-shell"
        style={{
          backgroundColor: cardBg,
          border: `1px solid ${border}`,
          borderRadius: "12px",
          overflowX: "auto",
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "13px",
            minWidth: "640px",
          }}
        >
          <thead>
            <tr
              style={{
                backgroundColor: "var(--color-surface-elevated)",
              }}
            >
              {[
                { label: "No. SP", field: "po_number" },
                { label: "Tanggal", field: "order_date" },
                { label: "Distributor", field: "distributor_name" },
                { label: "Status", field: "status" },
                { label: "Aksi", field: null },
              ].map(({ label, field }) => {
                const keyInfo = field
                  ? sortKeys.find((k) => k.field === field)
                  : null;
                const priority = field
                  ? sortKeys.findIndex((k) => k.field === field) + 1
                  : 0;
                return (
                  <th
                    key={label}
                    onClick={
                      field ? (e) => handleSort(field, e.shiftKey) : undefined
                    }
                    title={
                      field ? "Klik sort · Shift+klik multi-sort" : undefined
                    }
                    style={{
                      padding: "12px 14px",
                      textAlign: "left",
                      fontWeight: "700",
                      color: field && keyInfo ? text : sub,
                      fontSize: "11px",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      borderBottom: `1px solid ${border}`,
                      cursor: field ? "pointer" : "default",
                      userSelect: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {label}
                    {field &&
                      (keyInfo
                        ? ` ${sortKeys.length > 1 ? priority : ""}${keyInfo.dir === "asc" ? "▲" : "▼"}`
                        : " ↕")}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading
              ? [...Array(5)].map((_, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${border}` }}>
                    <td style={{ padding: "12px 14px" }}>
                      <Skeleton width="80px" height="14px" />
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <Skeleton width="90px" height="14px" />
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <Skeleton width="150px" height="14px" />
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <Skeleton width="60px" height="18px" />
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <Skeleton width="80px" height="20px" />
                    </td>
                  </tr>
                ))
              : sorted.map((o) => {
                  const sc = statusColors[o.status] || statusColors.draft;
                  return (
                    <React.Fragment key={o.id}>
                      <tr
                        className="ui-row ui-hover-delight"
                        style={{
                          borderBottom: `1px solid ${border}`,
                          cursor: "pointer",
                        }}
                        onClick={() =>
                          setExpandedId(expandedId === o.id ? null : o.id)
                        }
                      >
                        <td
                          style={{
                            padding: "12px 14px",
                            fontWeight: "600",
                            color: "var(--color-primary-hover)",
                          }}
                        >
                          {o.po_number}
                        </td>
                        <td style={{ padding: "12px 14px", color: text }}>
                          {fmtDate(o.order_date)}
                        </td>
                        <td style={{ padding: "12px 14px", color: text }}>
                          {o.distributor_name}
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <span
                            style={{
                              fontSize: "10px",
                              fontWeight: "700",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              backgroundColor: sc.bg,
                              color: sc.color,
                            }}
                          >
                            {sc.label}
                          </span>
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <div
                            style={{ display: "flex", gap: "4px" }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <TooltipButton
                              label="Cetak SP"
                              isDarkMode={isDarkMode}
                              disabled={pdfLoading === o.id}
                              onClick={() => handlePrintSP(o)}
                              style={{
                                ...iconButtonStyle,
                                cursor:
                                  pdfLoading === o.id
                                    ? "not-allowed"
                                    : "pointer",
                                opacity: pdfLoading === o.id ? 0.5 : 1,
                              }}
                            >
                              <FileText
                                size={15}
                                color="var(--color-primary-hover)"
                              />
                            </TooltipButton>
                            {o.status !== "received" && (
                              <TooltipButton
                                label="Terima Barang"
                                isDarkMode={isDarkMode}
                                onClick={() => openReceive(o)}
                                style={{
                                  ...iconButtonStyle,
                                }}
                              >
                                <CheckCircle
                                  size={15}
                                  color="var(--color-success)"
                                />
                              </TooltipButton>
                            )}
                            <TooltipButton
                              label="Edit pesanan"
                              isDarkMode={isDarkMode}
                              onClick={() => openEdit(o)}
                              style={{
                                ...iconButtonStyle,
                              }}
                            >
                              <Icons.Edit2
                                size={15}
                                color="var(--color-primary)"
                              />
                            </TooltipButton>
                            <TooltipButton
                              label="Hapus pesanan"
                              isDarkMode={isDarkMode}
                              onClick={() => handleDelete(o.id)}
                              style={{
                                ...iconButtonStyle,
                              }}
                            >
                              <Icons.Trash2
                                size={15}
                                color="var(--color-danger)"
                              />
                            </TooltipButton>
                          </div>
                        </td>
                      </tr>
                      {expandedId === o.id && o.items?.length > 0 && (
                        <tr>
                          <td
                            colSpan={5}
                            style={{
                              padding: "0 14px 14px",
                              backgroundColor: isDarkMode
                                ? "var(--color-surface-elevated)"
                                : "var(--color-surface-elevated)",
                            }}
                          >
                            <div style={{ overflowX: "auto" }}>
                              <table
                                style={{
                                  width: "100%",
                                  borderCollapse: "collapse",
                                  marginTop: "8px",
                                  fontSize: "12px",
                                  minWidth: "400px",
                                }}
                              >
                                <thead>
                                  <tr>
                                    {[
                                      "Produk",
                                      "Qty",
                                      "Satuan",
                                      "Diterima",
                                    ].map((h) => (
                                      <th
                                        key={h}
                                        style={{
                                          padding: "6px 10px",
                                          textAlign: "left",
                                          fontWeight: "600",
                                          color: sub,
                                          borderBottom: `1px solid ${border}`,
                                        }}
                                      >
                                        {h}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {o.items.map((it, idx) => (
                                    <tr key={idx}>
                                      <td
                                        style={{
                                          padding: "6px 10px",
                                          color: text,
                                        }}
                                      >
                                        {it.product_name}
                                      </td>
                                      <td
                                        style={{
                                          padding: "6px 10px",
                                          color: text,
                                        }}
                                      >
                                        {it.qty}
                                      </td>
                                      <td
                                        style={{
                                          padding: "6px 10px",
                                          color: sub,
                                        }}
                                      >
                                        {it.unit}
                                      </td>
                                      <td
                                        style={{
                                          padding: "6px 10px",
                                          fontWeight: "600",
                                          color:
                                            (it.received_qty || 0) >= it.qty
                                              ? "var(--color-success)"
                                              : "var(--color-warning)",
                                        }}
                                      >
                                        {it.received_qty || 0}/{it.qty}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {o.notes && (
                              <p
                                style={{
                                  margin: "8px 0 0",
                                  fontSize: "12px",
                                  color: sub,
                                }}
                              >
                                📝 {o.notes}
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
            {!loading && !sorted.length && (
              <tr>
                <td colSpan={5} style={{ padding: isMobile ? "1rem" : "2rem" }}>
                  <EmptyState
                    compact
                    icon={EmptyStateIcons.receipt}
                    title={
                      search
                        ? `Tidak ada hasil untuk '${search}'`
                        : "Belum ada Surat Pesanan."
                    }
                    description={
                      search
                        ? "Coba kata kunci lain atau reset filter."
                        : "Buat SP baru untuk mulai menyusun pesanan ke distributor."
                    }
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create/Edit Modal */}
      {showModal === "create" &&
        renderPortal(
          <div
            onClick={() => setShowModal(null)}
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
              padding: "1rem",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="ui-dialog-shell"
              style={{
                backgroundColor: cardBg,
                borderRadius: "16px",
                width: "100%",
                maxWidth: "min(1100px, calc(100vw - 32px))",
                maxHeight: "90vh",
                overflow: "auto",
                boxShadow: "0 32px 64px rgba(0,0,0,0.35)",
              }}
            >
              <div
                style={{
                  padding: "18px 22px",
                  borderBottom: `1px solid ${border}`,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  position: "sticky",
                  top: 0,
                  backgroundColor: "var(--color-surface)",
                  zIndex: 1,
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: "16px",
                    fontWeight: "700",
                    color: text,
                  }}
                >
                  {editId ? "✏️ Edit SP" : "📋 Buat SP Baru"}
                </h3>
                <button
                  onClick={() => setShowModal(null)}
                  aria-label="Tutup modal SP"
                  className="ui-motion-button ui-focus-ring"
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "10px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: "40px",
                    minHeight: "40px",
                  }}
                >
                  <X size={18} color={sub} />
                </button>
              </div>
              <div
                style={{
                  padding: "20px 22px",
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "1.2fr 1fr",
                  gap: "20px",
                  alignItems: "start",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "14px",
                    minWidth: 0,
                  }}
                >
                  {!editId && (
                    <div>
                      <label style={labelStyle}>Nomor SP *</label>
                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          alignItems: "center",
                        }}
                      >
                        <input
                          value={spCounter.prefix}
                          disabled
                          style={{
                            ...inputStyle,
                            width: "130px",
                            backgroundColor: isDarkMode
                              ? "#333"
                              : "var(--color-bg)",
                            opacity: 0.7,
                            fontWeight: "600",
                            textAlign: "center",
                          }}
                        />
                        <input
                          ref={numberInputRef}
                          value={
                            isAutoSP
                              ? autoSPNumber
                              : manualNumber
                          }
                          onChange={(e) =>
                            !isAutoSP &&
                            setManualNumber(e.target.value.replace(/\D/g, ""))
                          }
                          disabled={isAutoSP}
                          placeholder="0001"
                          style={{
                            ...inputStyle,
                            flex: 1,
                            backgroundColor: isAutoSP
                              ? isDarkMode
                                ? "#333"
                                : "var(--color-bg)"
                              : cardBg,
                            opacity: isAutoSP ? 0.7 : 1,
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newMode = !isAutoSP;
                            setIsAutoSP(newMode);
                            if (!newMode) {
                              setManualNumber(autoSPNumber);
                              setTimeout(() => {
                                if (numberInputRef.current) {
                                  numberInputRef.current.focus();
                                  numberInputRef.current.select();
                                }
                              }, UI_MOTION.duration.micro);
                            } else {
                              setManualNumber("");
                            }
                          }}
                          style={{
                            padding: "10px 14px",
                            borderRadius: "8px",
                            border: `1px solid ${border}`,
                            backgroundColor: isAutoSP ? "#E8F5E9" : "#FFF3E0",
                            color: isAutoSP ? "#2E7D32" : "#E65100",
                            fontWeight: "600",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            cursor: "pointer",
                            minWidth: "110px",
                            justifyContent: "center",
                          }}
                        >
                          {isAutoSP ? "🔒 Auto" : "🔓 Manual"}
                        </button>
                      </div>
                      {!isAutoSP && (
                        <p
                          style={{
                            fontSize: "10px",
                            color: "#E65100",
                            marginTop: "4px",
                          }}
                        >
                          Mode Manual: Counter sistem tidak akan bertambah.
                        </p>
                      )}
                      {saveError && (
                        <p
                          style={{
                            fontSize: "12px",
                            color: "var(--color-danger)",
                            marginTop: "6px",
                            fontWeight: "500",
                          }}
                        >
                          {saveError}
                        </p>
                      )}
                    </div>
                  )}
                  {editId && (
                    <div>
                      <label style={labelStyle}>Nomor SP</label>
                      <input
                        value={form.po_number}
                        disabled
                        style={{ ...inputStyle, opacity: 0.6 }}
                      />
                    </div>
                  )}
                  <div>
                    <label style={labelStyle}>Distributor *</label>
                    <MasterSelect
                      value={form.distributor_name}
                      onChange={(v) => {
                        setForm((p) => ({ ...p, distributor_name: v }));
                        const match = distributors.find((d) => d.name === v);
                        if (match)
                          setForm((p) => ({
                            ...p,
                            distributor_address: match.address || "",
                          }));
                      }}
                      options={distributors}
                      onAdd={handleAddDistributor}
                      onRemove={handleRemoveDistributor}
                      onRename={handleRenameDistributor}
                      isDarkMode={isDarkMode}
                      placeholder="Pilih atau tambah distributor..."
                    />
                    {selectedDistributorInfo && (
                      <div
                        style={{
                          marginTop: "8px",
                          padding: "10px 12px",
                          backgroundColor: isDarkMode ? "#222" : "#F9F9F9",
                          borderRadius: "8px",
                          border: `1px solid ${border}`,
                          fontSize: "12px",
                          color: sub,
                          display: "flex",
                          gap: "16px",
                        }}
                      >
                        <div>
                          <strong style={{ color: text }}>Salesman:</strong>{" "}
                          {selectedDistributorInfo.salesman_name || "-"}
                        </div>
                        <div>
                          <strong style={{ color: text }}>Phone:</strong>{" "}
                          {selectedDistributorInfo.salesman_phone || "-"}
                        </div>
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={labelStyle}>Alamat</label>
                    <input
                      value={form.distributor_address}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          distributor_address: e.target.value,
                        }))
                      }
                      style={inputStyle}
                    />
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: "12px",
                    }}
                  >
                    <div>
                      <label style={labelStyle}>PIC</label>
                      <select
                        value={form.pic_name}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, pic_name: e.target.value }))
                        }
                        style={inputStyle}
                      >
                        <option value="Harun Al Rasyid">Harun Al Rasyid</option>
                        <option value="Fivin Soehaeni">Fivin Soehaeni</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Tanggal SP</label>
                      <input
                        type="date"
                        value={form.order_date}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, order_date: e.target.value }))
                        }
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Estimasi Tiba</label>
                      <input
                        type="date"
                        value={form.expected_date}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            expected_date: e.target.value,
                          }))
                        }
                        style={inputStyle}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Produk</label>
                    {items.map((it, idx) => {
                      const product = products.find(
                        (p) =>
                          p.name?.toLowerCase() ===
                          it.product_name?.toLowerCase(),
                      );
                      const unitOptions = getProductUnits(product);
                      const showPreview =
                        product &&
                        product.pack_unit &&
                        (parseInt(product.pack_size) || 1) > 1;
                      return (
                        <div key={idx} style={{ marginBottom: "8px" }}>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "2fr 70px 110px 30px",
                              gap: "6px",
                              alignItems: "center",
                            }}
                          >
                            <MasterSelect
                              value={it.product_name}
                              onChange={(v) =>
                                updateItem(idx, "product_name", v)
                              }
                              onSelect={(option) =>
                                updateItem(idx, "product_option", option)
                              }
                              options={products.map((p) => ({
                                ...p,
                                label: p.code
                                  ? `${p.code} — ${p.name}`
                                  : p.name,
                              }))}
                              onAdd={handleAddProduct}
                              onRemove={handleRemoveProduct}
                              onRename={handleRenameProduct}
                              isDarkMode={isDarkMode}
                              placeholder="Nama produk"
                            />
                            <input
                              type="number"
                              value={it.qty}
                              onChange={(e) =>
                                updateItem(
                                  idx,
                                  "qty",
                                  parseInt(e.target.value) || 0,
                                )
                              }
                              min="1"
                              style={{
                                ...inputStyle,
                                fontSize: "13px",
                                padding: "8px 6px",
                                textAlign: "center",
                              }}
                            />
                            <select
                              value={it.unit}
                              onChange={(e) =>
                                updateItem(idx, "unit", e.target.value)
                              }
                              style={{
                                ...inputStyle,
                                fontSize: "13px",
                                padding: "8px 6px",
                              }}
                            >
                              {unitOptions.map((u, i) => (
                                <option key={`${u.value}-${i}`} value={u.value}>
                                  {u.label}
                                </option>
                              ))}
                            </select>
                            {items.length > 1 && (
                              <TooltipButton
                                label="Hapus baris produk"
                                isDarkMode={isDarkMode}
                                onClick={() => removeItem(idx)}
                                style={{
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  padding: 0,
                                }}
                              >
                                <Trash2 size={14} color="var(--color-danger)" />
                              </TooltipButton>
                            )}
                          </div>
                          {showPreview && it.qty > 0 && (
                            <p
                              style={{
                                margin: "4px 0 0 8px",
                                fontSize: "11px",
                                color: sub,
                              }}
                            >
                              📐{" "}
                              {formatQtyWithConversion(
                                it.qty,
                                it.unit,
                                product,
                              )}
                            </p>
                          )}
                        </div>
                      );
                    })}
                    <button
                      onClick={addItem}
                      style={{
                        fontSize: "13px",
                        color: "var(--color-primary-hover)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontWeight: "600",
                        marginTop: "4px",
                      }}
                    >
                      + Tambah Produk
                    </button>
                  </div>
                  <div>
                    <label style={labelStyle}>Catatan</label>
                    <textarea
                      value={form.notes}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, notes: e.target.value }))
                      }
                      rows={2}
                      style={{
                        ...inputStyle,
                        resize: "vertical",
                        fontFamily: "inherit",
                      }}
                    />
                  </div>
                  {saveError && editId && (
                    <p
                      style={{
                        fontSize: "12px",
                        color: "var(--color-danger)",
                        margin: "0",
                        fontWeight: "500",
                      }}
                    >
                      {saveError}
                    </p>
                  )}
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="btn-primary ui-motion-button ui-focus-ring"
                      data-magnetic="true"
                      style={{
                        flex: 1,
                        padding: "13px",
                        backgroundColor: "var(--color-primary-hover)",
                        color: "#FFF",
                        border: "none",
                        borderRadius: "10px",
                        cursor: isSaving ? "not-allowed" : "pointer",
                        fontWeight: "700",
                        fontSize: "14px",
                        opacity: isSaving ? 0.7 : 1,
                      }}
                    >
                      {isSaving
                        ? "Menyimpan..."
                        : editId
                          ? "Simpan"
                          : "Buat SP"}
                    </button>
                    <button
                      onClick={() => setShowModal(null)}
                      disabled={isSaving}
                      style={{
                        flex: 1,
                        padding: "13px",
                        backgroundColor: isDarkMode
                          ? "var(--color-surface-raised)"
                          : "var(--color-bg)",
                        color: text,
                        border: "none",
                        borderRadius: "10px",
                        cursor: isSaving ? "not-allowed" : "pointer",
                        fontSize: "14px",
                        fontWeight: "600",
                        opacity: isSaving ? 0.7 : 1,
                      }}
                    >
                      Batal
                    </button>
                  </div>
                </div>
                {!isMobile && (
                  <div
                    style={{ position: "sticky", top: 0, alignSelf: "start" }}
                  >
                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: "700",
                        textTransform: "uppercase",
                        color: sub,
                        marginBottom: "8px",
                        letterSpacing: "0.05em",
                      }}
                    >
                      📄 Preview Live
                    </div>
                    <SPPreview
                      form={{
                        ...form,
                        po_number: editId
                          ? form.po_number
                          : `${spCounter.prefix || ""}${isAutoSP ? autoSPNumber : manualNumber}`,
                      }}
                      items={items}
                      settings={layoutSettings || {}}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>,
        )}

      {/* Receive Modal */}
      {showModal === "receive" &&
        renderPortal(
          <div
            onClick={() => setShowModal(null)}
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
              padding: "1rem",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="ui-dialog-shell"
              style={{
                backgroundColor: cardBg,
                borderRadius: "16px",
                width: "100%",
                maxWidth: "640px",
                maxHeight: "90vh",
                overflow: "auto",
                boxShadow: "0 32px 64px rgba(0,0,0,0.35)",
              }}
            >
              <div
                style={{
                  padding: "18px 22px",
                  borderBottom: `1px solid ${border}`,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  position: "sticky",
                  top: 0,
                  backgroundColor: "var(--color-surface)",
                  zIndex: 1,
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: "16px",
                    fontWeight: "700",
                    color: "var(--color-success)",
                  }}
                >
                  ✅ Terima Barang
                </h3>
                <button
                  onClick={() => setShowModal(null)}
                  aria-label="Tutup modal terima barang"
                  className="ui-motion-button ui-focus-ring"
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "10px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: "40px",
                    minHeight: "40px",
                  }}
                >
                  <X size={18} color={sub} />
                </button>
              </div>
              <div style={{ padding: "20px 22px" }}>
                <p style={{ fontSize: "13px", color: sub, margin: "0 0 12px" }}>
                  Masukkan qty yang diterima, batch, dan tanggal expired. Stok
                  akan otomatis bertambah.
                </p>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "12px",
                  }}
                >
                  <thead>
                    <tr>
                      {[
                        "Produk",
                        "Pesan",
                        "Sudah",
                        "Terima",
                        "Batch",
                        "Expired",
                        "Aksi",
                      ].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: "6px 8px",
                            textAlign: "left",
                            fontWeight: "700",
                            color: sub,
                            fontSize: "10px",
                            textTransform: "uppercase",
                            borderBottom: `1px solid ${border}`,
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {receiveItems.map((ri, idx) => {
                      const receiveTotal = getReceiveTotal(ri.po_item_id);
                      const remaining = ri.ordered_qty - ri.already_received;
                      const lineCount = getReceiveLineCount(ri.po_item_id);
                      const currentQty = parseInt(ri.received_qty) || 0;
                      const maxForLine = Math.max(
                        0,
                        remaining - receiveTotal + currentQty,
                      );
                      return (
                        <tr
                          key={ri.receive_key || idx}
                          style={{ borderBottom: `1px solid ${border}` }}
                        >
                          <td
                            style={{
                              padding: "6px 8px",
                              fontWeight: "600",
                              color: text,
                            }}
                          >
                            {ri.product_name}
                          </td>
                          <td style={{ padding: "6px 8px", color: sub }}>
                            {ri.ordered_qty}
                          </td>
                          <td
                            style={{
                              padding: "6px 8px",
                              color:
                                ri.already_received >= ri.ordered_qty
                                  ? "var(--color-success)"
                                  : "var(--color-warning)",
                            }}
                          >
                            {ri.already_received}
                          </td>
                          <td style={{ padding: "6px 8px" }}>
                            <input
                              type="number"
                              value={ri.received_qty}
                              min="0"
                              max={maxForLine}
                              onChange={(e) => {
                                const nextQty = Math.min(
                                  parseInt(e.target.value) || 0,
                                  maxForLine,
                                );
                                updateReceiveItem(idx, {
                                  received_qty: nextQty,
                                });
                              }}
                              style={{
                                ...inputStyle,
                                width: "60px",
                                padding: "4px 6px",
                                fontSize: "12px",
                                textAlign: "center",
                              }}
                            />
                          </td>
                          <td style={{ padding: "6px 8px" }}>
                            <input
                              value={ri.batch_no}
                              onChange={(e) => {
                                updateReceiveItem(idx, {
                                  batch_no: e.target.value,
                                });
                              }}
                              placeholder="Batch"
                              style={{
                                ...inputStyle,
                                width: "80px",
                                padding: "4px 6px",
                                fontSize: "12px",
                              }}
                            />
                          </td>
                          <td style={{ padding: "6px 8px" }}>
                            <input
                              type="date"
                              value={ri.expired_date}
                              onChange={(e) => {
                                updateReceiveItem(idx, {
                                  expired_date: e.target.value,
                                });
                              }}
                              style={{
                                ...inputStyle,
                                width: "120px",
                                padding: "4px 6px",
                                fontSize: "12px",
                              }}
                            />
                          </td>
                          <td style={{ padding: "6px 8px" }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => addReceiveBatchLine(idx)}
                                aria-label={`Tambah batch untuk ${ri.product_name}`}
                                className="ui-motion-button ui-focus-ring"
                                style={{
                                  minWidth: "32px",
                                  height: "32px",
                                  borderRadius: "8px",
                                  border: `1px solid ${border}`,
                                  background: "var(--color-surface-elevated)",
                                  color: "var(--color-primary)",
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                <Plus size={15} />
                              </button>
                              {lineCount > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeReceiveBatchLine(idx)}
                                  aria-label={`Hapus baris batch ${ri.product_name}`}
                                  className="ui-motion-button ui-focus-ring"
                                  style={{
                                    minWidth: "32px",
                                    height: "32px",
                                    borderRadius: "8px",
                                    border: `1px solid ${border}`,
                                    background: "var(--color-danger-soft)",
                                    color: "var(--color-danger)",
                                    cursor: "pointer",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                >
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div
                  style={{ display: "flex", gap: "10px", marginTop: "16px" }}
                >
                  <button
                    onClick={handleReceive}
                    disabled={isReceiving}
                    className="btn-primary ui-motion-button ui-focus-ring"
                    data-magnetic="true"
                    style={{
                      flex: 1,
                      padding: "13px",
                      backgroundColor: isReceiving ? "var(--color-text-subtle)" : "var(--color-success)",
                      color: "#FFF",
                      border: "none",
                      borderRadius: "10px",
                      cursor: isReceiving ? "not-allowed" : "pointer",
                      fontWeight: "700",
                      fontSize: "14px",
                      opacity: isReceiving ? 0.7 : 1,
                    }}
                  >
                    {isReceiving ? "Menyimpan..." : "Terima & Update Stok"}
                  </button>
                  <button
                    onClick={() => setShowModal(null)}
                    style={{
                      flex: 1,
                      padding: "13px",
                      backgroundColor: isDarkMode
                        ? "var(--color-surface-raised)"
                        : "var(--color-bg)",
                      color: text,
                      border: "none",
                      borderRadius: "10px",
                      cursor: "pointer",
                      fontSize: "14px",
                      fontWeight: "600",
                    }}
                  >
                    Batal
                  </button>
                </div>
              </div>
            </div>
          </div>,
        )}

      {/* Edit Distributor Modal */}
      {showModal === "distributor" &&
        renderPortal(
          <div
            onClick={() => setShowModal("create")}
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 99999,
              padding: "1rem",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="ui-dialog-shell"
              style={{
                backgroundColor: cardBg,
                borderRadius: "16px",
                width: "100%",
                maxWidth: "480px",
                boxShadow: "0 32px 64px rgba(0,0,0,0.35)",
              }}
            >
              <div
                style={{
                  padding: "18px 22px",
                  borderBottom: `1px solid ${border}`,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: "16px",
                    fontWeight: "700",
                    color: text,
                  }}
                >
                  🏢 Master Data Distributor
                </h3>
                <button
                  onClick={() => setShowModal("create")}
                  aria-label="Tutup modal distributor"
                  className="ui-motion-button ui-focus-ring"
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "10px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: "40px",
                    minHeight: "40px",
                  }}
                >
                  <X size={18} color={sub} />
                </button>
              </div>
              <div
                style={{
                  padding: "20px 22px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                }}
              >
                <div>
                  <label style={labelStyle}>Nama Distributor *</label>
                  <input
                    value={distForm.name}
                    onChange={(e) =>
                      setDistForm((p) => ({ ...p, name: e.target.value }))
                    }
                    style={inputStyle}
                    placeholder="Contoh: PT. Bintang Jadi"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Kode Singkat (Short Code)</label>
                  <input
                    value={distForm.short_code}
                    onChange={(e) =>
                      setDistForm((p) => ({ ...p, short_code: e.target.value }))
                    }
                    style={inputStyle}
                    placeholder="Contoh: BTG"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Nama Salesman</label>
                  <input
                    value={distForm.salesman_name}
                    onChange={(e) =>
                      setDistForm((p) => ({
                        ...p,
                        salesman_name: e.target.value,
                      }))
                    }
                    style={inputStyle}
                    placeholder="Nama PIC dari distributor"
                  />
                </div>
                <div>
                  <label style={labelStyle}>No. HP Salesman</label>
                  <input
                    value={distForm.salesman_phone}
                    onChange={(e) =>
                      setDistForm((p) => ({
                        ...p,
                        salesman_phone: e.target.value,
                      }))
                    }
                    style={inputStyle}
                    placeholder="0812xxx"
                  />
                </div>
                <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                  <button
                    onClick={handleSaveDistributor}
                    disabled={distributorSaving}
                    className="btn-primary ui-motion-button ui-focus-ring"
                    data-magnetic="true"
                    style={{
                      flex: 1,
                      padding: "13px",
                      backgroundColor: distributorSaving ? "var(--color-text-subtle)" : "var(--color-primary)",
                      color: "#FFF",
                      border: "none",
                      borderRadius: "10px",
                      cursor: distributorSaving ? "not-allowed" : "pointer",
                      fontWeight: "700",
                      fontSize: "14px",
                      opacity: distributorSaving ? 0.7 : 1,
                    }}
                  >
                    {distributorSaving ? "Menyimpan..." : "Simpan Data Master"}
                  </button>
                  <button
                    onClick={() => setShowModal("create")}
                    style={{
                      flex: 1,
                      padding: "13px",
                      backgroundColor: isDarkMode
                        ? "var(--color-surface-raised)"
                        : "var(--color-bg)",
                      color: text,
                      border: "none",
                      borderRadius: "10px",
                      cursor: "pointer",
                      fontSize: "14px",
                      fontWeight: "600",
                    }}
                  >
                    Batal
                  </button>
                </div>
              </div>
            </div>
          </div>,
        )}

      {/* Delete Confirm Modal */}
      <ConfirmModal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={confirmDelete}
        title="Hapus SP"
        message="Apakah Anda yakin ingin menghapus Surat Pesanan ini?"
        isDarkMode={isDarkMode}
      />

      <ToastNotice message={toast} type={toastType} isMobile={isMobile} />
    </div>
  );
}
