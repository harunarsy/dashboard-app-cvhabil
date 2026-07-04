import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Plus,
  AlertTriangle,
  Clock,
  Trash2,
  Edit2,
  ArrowDownCircle,
  ArrowUpCircle,
  ClipboardCheck,
  ChevronRight,
  ChevronDown,
  Eye,
  AlertCircle,
  FileDown,
  Camera,
  Barcode,
} from "lucide-react";
import { inventoryAPI, printSettingsAPI, insightsAPI } from "../services/api";
import { BASE_UNITS, PACK_UNITS } from "../constants/units";
import MasterSelect from "./MasterSelect";
import Skeleton from "./common/Skeleton";
import ConfirmModal from "./common/ConfirmModal";
import Breadcrumb from "./common/Breadcrumb";
import ProductDrawer from "./inventory/ProductDrawer";
import OpnameModal from "./inventory/OpnameModal";
import BatchFormModal from "./inventory/BatchFormModal";
import { hppFromHna, hppForBatch, formatRupiah } from "../utils/rupiah";
import HnaHppInput from "./common/HnaHppInput";
import BulkEditModal from "./inventory/BulkEditModal";
import BarcodeScanner from "./common/BarcodeScanner";
import PrintBarcodeModal from "./inventory/PrintBarcodeModal";
import SearchBox from "./common/SearchBox";
import ToastNotice from "./common/ToastNotice";
import useDebouncedValue from "../hooks/useDebouncedValue";
import { useProducts, useInventoryAlerts } from "../hooks/useMasterData";
import Tooltip from "./common/Tooltip";
import EmptyState, { EmptyStateIcons } from "./common/EmptyState";
import Icons from "./common/Icon";
import { UI_MOTION, UI_SIZE, uiTransition } from "../constants/ui";
import useBodyScrollLock from "../hooks/useBodyScrollLock";

const renderPortal = (node) =>
  typeof document === "undefined" ? node : createPortal(node, document.body);

const fmtRp = (n, decimals = 0) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n || 0);
const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "-";
const daysUntil = (d) =>
  d ? Math.ceil((new Date(d) - new Date()) / 86400000) : null;

const getProductDisplayHna = (product) =>
  parseFloat(product?.latest_hna ?? product?.hna) || 0;

const getProductDisplayHpp = (product) =>
  hppFromHna(getProductDisplayHna(product));

function expirySeverity(date, isDarkMode) {
  if (!date)
    return {
      color: "var(--color-text-subtle)",
      bg: "transparent",
      label: "—",
      plain: true,
    };
  const days = daysUntil(date);
  const redBg = isDarkMode
    ? "var(--color-danger-soft)"
    : "var(--color-danger-soft)";
  const orangeBg = isDarkMode
    ? "var(--color-warning-soft)"
    : "var(--color-warning-soft)";
  if (days <= 0)
    return {
      color: "var(--color-danger)",
      bg: redBg,
      label: `EXPIRED · ${fmtDate(date)}`,
    };
  if (days < 30)
    return {
      color: "var(--color-danger)",
      bg: redBg,
      label: `${fmtDate(date)} (${days}d)`,
    };
  if (days < 120)
    return {
      color: "#FF9F0A",
      bg: orangeBg,
      label: `${fmtDate(date)} (${days}d)`,
    };
  return {
    color: "var(--color-success)",
    bg: "transparent",
    label: fmtDate(date),
    plain: true,
  };
}

export default function InventoryDashboard({
  isDarkMode,
  isSidebarOpen,
  isMobile,
  isVantaMode,
}) {
  const [tab, setTab] = useState("products");
  // v1.45.0: TanStack Query — products & alerts di-cache & dibagi antar halaman.
  // fetchProducts/fetchAlerts = refetch (nama dipertahankan utk call-site lama).
  const {
    data: products = [],
    isLoading: loading,
    refetch: fetchProducts,
  } = useProducts();
  const {
    data: alerts = { expiring: [], lowStock: [] },
    refetch: fetchAlerts,
  } = useInventoryAlerts();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [statusFilter, setStatusFilter] = useState("all"); // all | low | expiring | expired
  const [pageSize, setPageSize] = useState(20); // 10 | 20 | 50 | -1 (Semua)
  const [currentPage, setCurrentPage] = useState(1);
  const [showModal, setShowModal] = useState(null); // null | 'product' | 'stockIn' | 'stockOut' | 'opname'
  const [editId, setEditId] = useState(null);
  const [toast, setToast] = useState({ msg: "", type: "success" });
  const [modalError, setModalError] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const toastTimerRef = useRef(null);

  // Expand + Drawer state (Phase 2 additions)
  const [expandedIds, setExpandedIds] = useState(new Set());
  // v1.11.13: bulk edit selection
  const [selectedProductIds, setSelectedProductIds] = useState(new Set());
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [batchesCache, setBatchesCache] = useState({});
  const [batchesLoading, setBatchesLoading] = useState({});
  const [drawerProductId, setDrawerProductId] = useState(null);
  const [productModalTab, setProductModalTab] = useState("profile");
  const [batchModal, setBatchModal] = useState(null); // { mode, batch?, productId, productName }
  const [adjustBatch, setAdjustBatch] = useState(null); // { ...batch, productName? }
  const [adjustForm, setAdjustForm] = useState({ new_qty: 0, reason: "" });
  const [batchActionError, setBatchActionError] = useState("");
  const [deleteBatchConfirm, setDeleteBatchConfirm] = useState(null);
  const [batchActionSaving, setBatchActionSaving] = useState(false);
  const [scannerMode, setScannerMode] = useState(null); // stockIn | stockOut
  const [barcodePrintOpen, setBarcodePrintOpen] = useState(false);
  // Insight stok: saran restock + skor kesehatan produk (rule-based, best-effort)
  const [restockItems, setRestockItems] = useState([]);
  const [healthScores, setHealthScores] = useState({}); // product_id -> {grade,score,metrics}
  const [insightsLoading, setInsightsLoading] = useState(true);

  // Product form (v1.6.0 multi-unit: base_unit + pack_unit + pack_size + sell_price_pack; v1.7.0 tiers)
  const [pForm, setPForm] = useState({
    code: "",
    name: "",
    unit: "pcs",
    hna: 0,
    sell_price: 0,
    category: "",
    min_stock: 5,
    base_unit: "pcs",
    pack_unit: "",
    pack_size: 1,
    sell_price_pack: 0,
    weight_gram: 0,
    price_tiers: [],
  });
  // Stock in form
  const [siForm, setSiForm] = useState({
    product_name: "",
    batch_no: "",
    expired_date: "",
    qty: 1,
    hna: 0,
  });
  // Stock out form (v1.7.0: selected_batch_id untuk manual batch override)
  const [soForm, setSoForm] = useState({
    product_id: "",
    qty: 1,
    notes: "",
    selected_batch_id: "",
  });
  const [soBatches, setSoBatches] = useState([]);
  // Modal save loading flags
  const [modalSaving, setModalSaving] = useState(false);

  const bg = "var(--color-bg)";
  const cardBg = "var(--color-surface)";
  const border = "var(--color-border)";
  const text = "var(--color-text)";
  const sub = "var(--color-text-subtle)";
  useBodyScrollLock(
    showModal ||
      bulkEditOpen ||
      barcodePrintOpen ||
      !!drawerProductId ||
      !!deleteConfirmId,
  );
  const surface = "var(--color-surface-elevated)";

  // Insight stok: saran restock + skor kesehatan, best-effort (tidak blok halaman).
  const fetchInsights = useCallback(async () => {
    setInsightsLoading(true);
    try {
      const [restockRes, healthRes] = await Promise.all([
        insightsAPI.getRestock(),
        insightsAPI.getProductHealth(),
      ]);
      setRestockItems(restockRes.data?.items || []);
      const map = {};
      (healthRes.data?.items || []).forEach((it) => {
        map[it.product_id] = it;
      });
      setHealthScores(map);
    } catch (e) {
      console.error("Failed to fetch inventory insights:", e);
    } finally {
      setInsightsLoading(false);
    }
  }, []);

  useEffect(() => {
    // products & alerts auto-fetch via hooks TanStack Query.
    fetchInsights();
  }, [fetchInsights]);
  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    [],
  );

  const fetchBatches = useCallback(
    async (productId, force = false) => {
      if (!force && batchesCache[productId]) return;
      setBatchesLoading((prev) => ({ ...prev, [productId]: true }));
      try {
        const { data } = await inventoryAPI.getProductBatches(productId);
        setBatchesCache((prev) => ({ ...prev, [productId]: data }));
      } catch (e) {
        console.error(e);
      } finally {
        setBatchesLoading((prev) => ({ ...prev, [productId]: false }));
      }
    },
    [batchesCache],
  );

  const toggleExpand = (productId) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else {
        next.add(productId);
        fetchBatches(productId);
      }
      return next;
    });
  };

  const refreshAfterChange = useCallback(
    async (productId) => {
      await Promise.all([
        fetchProducts(),
        fetchAlerts(),
        fetchInsights(),
        productId ? fetchBatches(productId, true) : Promise.resolve(),
      ]);
    },
    [fetchProducts, fetchAlerts, fetchInsights, fetchBatches],
  );

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    return products.filter((p) => {
      const matchSearch =
        p.name.toLowerCase().includes(q) ||
        (p.code || "").toLowerCase().includes(q) ||
        (p.category || "").toLowerCase().includes(q);
      if (!matchSearch) return false;
      if (statusFilter === "all") return true;
      const stock = parseInt(p.total_stock) || 0;
      const days = daysUntil(p.nearest_expiry);
      if (statusFilter === "low") return stock < p.min_stock;
      if (statusFilter === "expiring")
        return days !== null && days > 0 && days < 120;
      if (statusFilter === "expired") return days !== null && days <= 0;
      return true;
    });
  }, [products, debouncedSearch, statusFilter]);

  // Pagination: reset ke halaman 1 tiap filter/ukuran berubah
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, pageSize]);

  // v1.48.0: pageSize -1 = "Semua" (tampilkan semua tanpa paging).
  const showAll = pageSize === -1;
  const effPageSize = showAll ? Math.max(1, filtered.length) : pageSize;
  const totalPages = Math.max(1, Math.ceil(filtered.length / effPageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paged = useMemo(() => {
    if (showAll) return filtered;
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize, showAll]);

  // v1.10.2: total nilai persediaan = Σ HPP(inc PPN) × stok (ikut filter aktif)
  const totalNilai = useMemo(
    () =>
      filtered.reduce(
        (s, p) =>
          s + getProductDisplayHpp(p) * (parseInt(p.total_stock) || 0),
        0,
      ),
    [filtered],
  );
  const selectedBarcodeProducts = useMemo(
    () => products.filter((p) => selectedProductIds.has(p.id)),
    [products, selectedProductIds],
  );

  const flashSuccess = (msg) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, type: "success" });
    toastTimerRef.current = setTimeout(
      () => setToast({ msg: "", type: "success" }),
      UI_MOTION.duration.toastSuccess,
    );
  };
  const flashError = (msg) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, type: "error" });
    toastTimerRef.current = setTimeout(
      () => setToast({ msg: "", type: "error" }),
      UI_MOTION.duration.toastError,
    );
  };
  const findProductByCode = (code) => {
    const normalized = String(code || "")
      .trim()
      .toLowerCase();
    if (!normalized) return null;
    return (
      products.find(
        (p) =>
          String(p.code || "")
            .trim()
            .toLowerCase() === normalized,
      ) || null
    );
  };
  const openScanner = (mode) => {
    setModalError("");
    setScannerMode(mode);
  };
  const handleScannerResult = (code) => {
    const product = findProductByCode(code);
    if (!product) {
      const msg = `Kode ${code} tidak ditemukan di inventory`;
      setModalError(msg);
      flashError(msg);
      return;
    }
    if (scannerMode === "stockIn") {
      setSiForm((p) => ({
        ...p,
        product_name: product.name,
        hna: getProductDisplayHna(product),
      }));
      flashSuccess(`Produk discan: ${product.name}`);
    }
    if (scannerMode === "stockOut") {
      setSoForm((p) => ({
        ...p,
        product_id: product.id,
        selected_batch_id: "",
      }));
      loadStockOutBatches(product.id);
      flashSuccess(`Produk discan: ${product.name}`);
    }
  };

  const inputStyle = {
    width: "100%",
    padding: "7px 10px",
    border: `1px solid ${border}`,
    borderRadius: "9px",
    backgroundColor: surface,
    color: text,
    fontSize: "13px",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
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

  // ─── Product CRUD ─────────────────────────────────────────────────────
  const openAddProduct = () => {
    setEditId(null);
    setProductModalTab("profile");
    setPForm({
      code: "",
      name: "",
      unit: "pcs",
      hna: 0,
      sell_price: 0,
      category: "",
      min_stock: 5,
      base_unit: "pcs",
      pack_unit: "",
      pack_size: 1,
      sell_price_pack: 0,
      weight_gram: 0,
      price_tiers: [],
    });
    setModalError("");
    setShowModal("product");
  };
  const openEditProduct = async (p) => {
    setEditId(p.id);
    setProductModalTab("profile");
    setPForm({
      code: p.code || "",
      name: p.name,
      unit: p.unit || "pcs",
      hna: parseFloat(p.hna) || 0,
      sell_price: parseFloat(p.sell_price) || 0,
      category: p.category || "",
      min_stock: p.min_stock || 5,
      base_unit: p.base_unit || p.unit || "pcs",
      pack_unit: p.pack_unit || "",
      pack_size: parseInt(p.pack_size) || 1,
      sell_price_pack: parseFloat(p.sell_price_pack) || 0,
      weight_gram: Math.max(0, parseInt(p.weight_gram) || 0),
      price_tiers: [],
    });
    setModalError("");
    setShowModal("product");
    fetchBatches(p.id, true);
    // v1.7.0: fetch tiers async
    try {
      const { data } = await inventoryAPI.getProductTiers(p.id);
      setPForm((prev) => ({ ...prev, price_tiers: data || [] }));
    } catch (e) {
      console.error("Failed to fetch product tiers", p.id, e);
      /* tiers optional, skip silently */
    }
  };
  // v1.7.0 tier handlers
  const addTier = () =>
    setPForm((p) => ({
      ...p,
      price_tiers: [
        ...(p.price_tiers || []),
        { unit: p.base_unit || "pcs", min_qty: 1, max_qty: "", price: 0 },
      ],
    }));
  const updateTier = (idx, field, value) =>
    setPForm((p) => {
      const n = [...(p.price_tiers || [])];
      n[idx] = { ...n[idx], [field]: value };
      return { ...p, price_tiers: n };
    });
  const removeTier = (idx) =>
    setPForm((p) => ({
      ...p,
      price_tiers: (p.price_tiers || []).filter((_, i) => i !== idx),
    }));
  const saveProduct = async () => {
    if (!pForm.name.trim()) {
      setModalError("Nama produk wajib diisi");
      return;
    }
    if (!pForm.code.trim()) {
      setModalError("KODE produk wajib diisi (identitas unik tiap barang)");
      return;
    }
    const payload = { ...pForm, code: pForm.code.trim().toUpperCase() };
    setModalError("");
    setModalSaving(true);
    try {
      let productId = editId;
      if (editId) {
        await inventoryAPI.updateProduct(editId, payload);
      } else {
        const { data: created } = await inventoryAPI.createProduct(payload);
        productId = created?.id;
      }
      // v1.7.0: PUT tiers (bulk replace) — kalau ada perubahan
      if (productId) {
        await inventoryAPI.updateProductTiers(
          productId,
          pForm.price_tiers || [],
        );
      }
      flashSuccess(editId ? "Produk diperbarui" : "Produk ditambahkan");
      setShowModal(null);
      fetchProducts();
    } catch (e) {
      const msg = e.response?.data?.error || e.message;
      setModalError(msg);
    } finally {
      setModalSaving(false);
    }
  };
  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await inventoryAPI.deleteProduct(deleteConfirmId);
      flashSuccess("Produk dinonaktifkan");
      fetchProducts();
    } catch (e) {
      flashError(e.response?.data?.error || e.message);
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const openBatchEdit = (batch, product) => {
    setBatchActionError("");
    setBatchModal({
      mode: "edit",
      batch,
      productId: product.id,
      productName: product.name,
    });
  };
  const openBatchAdd = (product) => {
    setBatchActionError("");
    setBatchModal({
      mode: "add",
      productId: product.id,
      productName: product.name,
    });
  };
  const refreshBatchProduct = async (productId) => {
    await refreshAfterChange(productId);
    if (editId === productId) await fetchBatches(productId, true);
  };
  // AUDIT-UX-03: hapus batch (apalagi yang masih ber-stok = nol-kan uang) lewat
  // ConfirmModal, bukan window.confirm yang gampang ke-Enter tanpa kebaca.
  const deleteBatch = (batch, product) =>
    setDeleteBatchConfirm({ batch, product });
  const executeDeleteBatch = async () => {
    if (!deleteBatchConfirm) return;
    const { batch, product } = deleteBatchConfirm;
    setDeleteBatchConfirm(null);
    setBatchActionError("");
    setBatchActionSaving(true);
    try {
      await inventoryAPI.deleteBatch(batch.id);
      flashSuccess("Batch dihapus");
      await refreshBatchProduct(product.id);
    } catch (e) {
      setBatchActionError(e.response?.data?.error || e.message);
      flashError(e.response?.data?.error || e.message);
    } finally {
      setBatchActionSaving(false);
    }
  };
  const openAdjustBatch = (batch, product) => {
    setBatchActionError("");
    setAdjustBatch({
      ...batch,
      productName: product.name,
      product_id: product.id,
    });
    setAdjustForm({ new_qty: batch.qty_current, reason: "" });
  };
  const submitAdjustBatch = async () => {
    if (!adjustBatch) return;
    if (!adjustForm.reason.trim()) {
      setBatchActionError("Alasan adjustment wajib diisi");
      return;
    }
    setBatchActionError("");
    setBatchActionSaving(true);
    try {
      await inventoryAPI.adjustBatch(adjustBatch.id, {
        new_qty: parseInt(adjustForm.new_qty),
        reason: adjustForm.reason,
      });
      flashSuccess("Qty batch diperbarui");
      const productId = adjustBatch.product_id || adjustBatch.productId;
      setAdjustBatch(null);
      setAdjustForm({ new_qty: 0, reason: "" });
      await refreshBatchProduct(productId);
    } catch (e) {
      setBatchActionError(e.response?.data?.error || e.message);
    } finally {
      setBatchActionSaving(false);
    }
  };

  const handleAddProduct = async (name) => {
    await inventoryAPI.createProduct({
      name,
      unit: "pcs",
      hna: 0,
      sell_price: 0,
      category: "",
      min_stock: 5,
    });
    fetchProducts();
  };
  const handleRemoveProduct = async (name) => {
    const prod = products.find((p) => p.name === name);
    if (prod) await inventoryAPI.deleteProduct(prod.id);
    fetchProducts();
  };

  // ─── Stock In ─────────────────────────────────────────────────────────
  const openStockIn = (p) => {
    setSiForm({
      product_name: p?.name || "",
      batch_no: "",
      expired_date: "",
      qty: 1,
      hna: getProductDisplayHna(p),
    });
    setModalError("");
    setShowModal("stockIn");
  };
  const saveStockIn = async () => {
    if (!siForm.product_name || !siForm.qty) {
      setModalError("Pilih produk dan qty");
      return;
    }
    setModalSaving(true);
    try {
      const prod = products.find((p) => p.name === siForm.product_name);
      if (!prod) {
        setModalError("Produk tidak ditemukan");
        setModalSaving(false);
        return;
      }
      const payload = { ...siForm, product_id: prod.id };
      delete payload.product_name;
      await inventoryAPI.stockIn(payload);
      flashSuccess("Stok masuk berhasil");
      setShowModal(null);
      refreshAfterChange(prod.id);
    } catch (e) {
      setModalError(e.response?.data?.error || e.message);
    } finally {
      setModalSaving(false);
    }
  };

  // ─── Stock Out ────────────────────────────────────────────────────────
  const loadStockOutBatches = useCallback(async (productId) => {
    if (!productId) {
      setSoBatches([]);
      return;
    }
    try {
      const { data } = await inventoryAPI.getProductBatches(productId);
      setSoBatches((data || []).filter((b) => b.qty_current > 0));
    } catch (e) {
      console.error("Failed to load stock out batches", e);
      setSoBatches([]);
    }
  }, []);
  const openStockOut = (p) => {
    setSoForm({
      product_id: p?.id || "",
      qty: 1,
      notes: "",
      selected_batch_id: "",
    });
    setModalError("");
    setShowModal("stockOut");
    if (p?.id) loadStockOutBatches(p.id);
    else setSoBatches([]);
  };
  const saveStockOut = async () => {
    if (!soForm.product_id || !soForm.qty) {
      setModalError("Pilih produk dan qty");
      return;
    }
    setModalSaving(true);
    try {
      const payload = { ...soForm };
      if (!payload.selected_batch_id) delete payload.selected_batch_id; // kirim hanya kalau ada override
      await inventoryAPI.stockOut(payload);
      flashSuccess(
        payload.selected_batch_id
          ? "Stok keluar berhasil (manual batch)"
          : "Stok keluar berhasil (FEFO)",
      );
      setShowModal(null);
      refreshAfterChange(soForm.product_id);
    } catch (e) {
      setModalError(e.response?.data?.error || e.message);
    } finally {
      setModalSaving(false);
    }
  };

  const handleExportOpnameTemplate = async () => {
    try {
      let settings = {};
      try {
        const { data } = await printSettingsAPI.get();
        settings = data?.nota_layout || data || {};
      } catch (_) {
        console.error("Failed to fetch print settings", _);
        /* fallback default */
      }
      const { data: rows } = await inventoryAPI.getOpnameTemplate();
      const { generateInventoryPDF } =
        await import("../utils/generateInventoryPDF");
      const doc = generateInventoryPDF(rows, { settings });
      const stamp = new Date().toISOString().slice(0, 10);
      doc.save(`Template_Opname_${stamp}.pdf`);
      flashSuccess("Template opname berhasil diunduh");
    } catch (e) {
      flashError(`Gagal generate PDF: ${e.message}`);
    }
  };

  const totalAlerts = alerts.expiring.length + alerts.lowStock.length;
  const headerBtn = (color, Icon, label, onClick) => (
    <button
      onClick={onClick}
      className="btn-primary ui-motion-button ui-focus-ring"
      data-magnetic="true"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        minHeight: "36px",
        padding: "7px 12px",
        backgroundColor: color,
        color: "#FFF",
        border: "none",
        borderRadius: "9px",
        cursor: "pointer",
        fontWeight: "700",
        fontSize: "12.5px",
        boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
      }}
    >
      <Icon size={UI_SIZE.icon.sm} /> {label}
    </button>
  );

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
        title="Inventory & Stok"
        count={
          loading
            ? "…"
            : `${products.length} produk${totalAlerts > 0 ? ` · ${totalAlerts} alert` : ""}`
        }
        isMobile={isMobile}
        isDarkMode={isDarkMode}
      />

      {/* Tabs + tombol aksi sejajar (hemat tempat di atas). v1.35.0 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "0.875rem",
        }}
      >
        <div
          className="ui-toolbar"
          style={{
            display: "flex",
            gap: "4px",
            backgroundColor: "var(--color-surface)",
            borderRadius: "10px",
            padding: "3px",
            flex: "0 1 auto",
          }}
        >
          {[
            ["products", "📦 Produk"],
            ["alerts", `⚠️ Alert ${totalAlerts > 0 ? `(${totalAlerts})` : ""}`],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="ui-motion-button ui-focus-ring"
              style={{
                minHeight: "40px",
                padding: "8px 16px",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: "700",
                backgroundColor: tab === key ? cardBg : "transparent",
                color: tab === key ? text : sub,
                boxShadow: tab === key ? "0 1px 4px rgba(0,0,0,0.12)" : "none",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {headerBtn("var(--color-primary)", Plus, "Produk", openAddProduct)}
          {headerBtn("var(--color-success)", ArrowDownCircle, "Stok Masuk", () =>
            openStockIn(null),
          )}
          {headerBtn("var(--color-warning)", ArrowUpCircle, "Stok Keluar", () =>
            openStockOut(null),
          )}
          {headerBtn("var(--color-primary-hover)", ClipboardCheck, "Opname", () =>
            setShowModal("opname"),
          )}
          {headerBtn(
            "var(--color-text-subtle)",
            FileDown,
            "Cetak Template",
            handleExportOpnameTemplate,
          )}
        </div>
      </div>

      {/* Search + filter */}
      {tab === "products" && (
        <div
          className="ui-toolbar"
          style={{
            display: "flex",
            gap: "8px",
            marginBottom: "0.875rem",
            flexWrap: "wrap",
          }}
        >
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Cari produk, kode, kategori..."
            ariaLabel="Cari produk"
            style={{ maxWidth: "420px" }}
            inputStyle={{
              backgroundColor: inputStyle.backgroundColor,
              borderColor: border,
              color: text,
            }}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="ui-focus-ring"
            style={{ ...inputStyle, maxWidth: "180px", cursor: "pointer" }}
          >
            <option value="all">Semua status</option>
            <option value="low">Stok rendah</option>
            <option value="expiring">ED ≤4 bulan (harus dikeluarkan)</option>
            <option value="expired">Sudah expired</option>
          </select>
        </div>
      )}

      {/* ✨ Saran Restock — insight stok rule-based */}
      {tab === "products" && (insightsLoading || restockItems.length > 0) && (
        <div
          className="ui-panel"
          style={{
            marginBottom: "0.875rem",
            padding: "12px 14px",
            borderRadius: "14px",
            border: `1px solid ${border}`,
            backgroundColor: cardBg,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: text }}>✨ Saran Restock</span>
            <span style={{ fontSize: 11, color: sub }}>
              {insightsLoading
                ? "menyiapkan saran…"
                : `${restockItems.length} produk hampir habis`}
            </span>
          </div>
          {insightsLoading ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile
                  ? "1fr"
                  : "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 8,
              }}
            >
              {[...Array(isMobile ? 2 : 4)].map((_, i) => (
                <Skeleton key={i} width="100%" height="48px" borderRadius="10px" />
              ))}
            </div>
          ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 8,
            }}
          >
            {restockItems.slice(0, 12).map((item) => {
              const tone = item.days_left < 7 ? "danger" : item.days_left < 14 ? "warning" : "primary";
              return (
                <button
                  key={item.product_id}
                  type="button"
                  onClick={() => setDrawerProductId(item.product_id)}
                  className="ui-focus-ring"
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: surface,
                    border: `1px solid ${border}`,
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span
                      style={{
                        display: "block",
                        fontWeight: 700,
                        color: text,
                        fontSize: 12.5,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.name}
                    </span>
                    <span style={{ display: "block", marginTop: 3, fontSize: 11, color: sub }}>
                      stok {item.stock} · laku ~{item.velocity_per_day}/hari
                      {item.avg_order_qty
                        ? ` · biasa order ${Math.round(item.avg_order_qty)} ${item.order_unit}`
                        : ""}
                    </span>
                  </span>
                  <span
                    style={{
                      flexShrink: 0,
                      padding: "3px 9px",
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 800,
                      backgroundColor: `var(--color-${tone}-soft)`,
                      color: `var(--color-${tone})`,
                      whiteSpace: "nowrap",
                    }}
                  >
                    ±{item.days_left} hari
                  </span>
                </button>
              );
            })}
          </div>
          )}
        </div>
      )}

      {/* ─── Products Tab ───────────────────────────────────────────────── */}
      {tab === "products" && (
        <div
          className="ui-table-shell"
          style={{
            backgroundColor: cardBg,
            border: `1px solid ${border}`,
            borderRadius: "14px",
            overflow: "hidden",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "13px",
                minWidth: "760px",
              }}
            >
              <thead>
                <tr style={{ backgroundColor: surface }}>
                  <th
                    style={{
                      ...thStyle(sub, border),
                      width: "40px",
                      textAlign: "center",
                    }}
                    aria-label="Pilih semua"
                  >
                    <input
                      type="checkbox"
                      checked={
                        filtered.length > 0 &&
                        filtered.every((p) => selectedProductIds.has(p.id))
                      }
                      ref={(el) => {
                        if (el)
                          el.indeterminate =
                            selectedProductIds.size > 0 &&
                            !filtered.every((p) =>
                              selectedProductIds.has(p.id),
                            );
                      }}
                      onChange={(e) => {
                        if (e.target.checked)
                          setSelectedProductIds(
                            new Set(filtered.map((p) => p.id)),
                          );
                        else setSelectedProductIds(new Set());
                      }}
                      style={{
                        cursor: "pointer",
                        width: "14px",
                        height: "14px",
                      }}
                      aria-label="Pilih semua produk (filtered)"
                    />
                  </th>
                  <th style={thStyle(sub, border)} aria-label="Expand"></th>
                  <th style={thStyle(sub, border)}>Kode</th>
                  <th style={thStyle(sub, border)}>Nama Produk</th>
                  <th style={thStyle(sub, border)}>Satuan</th>
                  <th
                    style={{ ...thStyle(sub, border), textAlign: "right" }}
                    title="Harga Netto Apotek - raw, sebelum PPN 11%"
                  >
                    HNA
                    <br />
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: "400",
                        color: sub,
                      }}
                    >
                      (exc PPN)
                    </span>
                  </th>
                  <th
                    style={{ ...thStyle(sub, border), textAlign: "right" }}
                    title="Harga Pokok Penjualan = HNA + PPN 11%"
                  >
                    HPP
                    <br />
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: "400",
                        color: sub,
                      }}
                    >
                      (inc PPN)
                    </span>
                  </th>
                  <th style={{ ...thStyle(sub, border), textAlign: "right" }}>
                    Harga Jual
                  </th>
                  <th style={{ ...thStyle(sub, border), textAlign: "center" }}>
                    Stok
                  </th>
                  <th
                    style={{ ...thStyle(sub, border), textAlign: "right" }}
                    title="Nilai persediaan = HPP (inc PPN 11%) × stok"
                  >
                    Nilai
                  </th>
                  <th style={thStyle(sub, border)}>Exp Terdekat</th>
                  <th style={{ ...thStyle(sub, border), textAlign: "right" }}>
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? [...Array(5)].map((_, i) => (
                      <tr
                        key={i}
                        style={{ borderBottom: `1px solid ${border}` }}
                      >
                        <td style={tdStyle}></td>
                        <td style={tdStyle}></td>
                        <td style={tdStyle}>
                          <Skeleton width="60px" height="14px" />
                        </td>
                        <td style={tdStyle}>
                          <Skeleton width="150px" height="14px" />
                        </td>
                        <td style={tdStyle}>
                          <Skeleton width="40px" height="14px" />
                        </td>
                        <td style={tdStyle}>
                          <Skeleton width="80px" height="14px" />
                        </td>
                        <td style={tdStyle}>
                          <Skeleton width="80px" height="14px" />
                        </td>
                        <td style={tdStyle}>
                          <Skeleton width="80px" height="14px" />
                        </td>
                        <td style={tdStyle}>
                          <Skeleton width="40px" height="14px" />
                        </td>
                        <td style={tdStyle}>
                          <Skeleton width="80px" height="14px" />
                        </td>
                        <td style={tdStyle}>
                          <Skeleton width="100px" height="18px" />
                        </td>
                        <td style={tdStyle}>
                          <Skeleton width="80px" height="20px" />
                        </td>
                      </tr>
                    ))
                  : paged.map((p) => {
                      const sev = expirySeverity(p.nearest_expiry, isDarkMode);
                      const stock = parseInt(p.total_stock) || 0;
                      const minStockNum = parseInt(p.min_stock) || 0;
                      const hasMinStock = minStockNum > 0;
                      const isLowStock = hasMinStock && stock < minStockNum;
                      const isExpanded = expandedIds.has(p.id);
                      // Bar visible HANYA bila min_stock terdefinisi (> 0). Tanpa threshold = no gauge.
                      const stockPct = hasMinStock
                        ? Math.min(100, (stock / (minStockNum * 2)) * 100)
                        : 0;
                      const stockColor =
                        stock <= 0
                          ? "var(--color-danger)"
                          : isLowStock
                            ? "var(--color-warning)"
                            : "var(--color-success)";
                      const isSelected = selectedProductIds.has(p.id);
                      return (
                        <React.Fragment key={p.id}>
                          <tr
                            className="ui-row"
                            style={{
                              borderBottom: `1px solid ${border}`,
                              background: isSelected
                                ? "color-mix(in srgb, var(--color-primary) 10%, transparent)"
                                : isExpanded
                                  ? surface
                                  : "transparent",
                            }}
                          >
                            <td
                              style={{
                                ...tdStyle,
                                width: "40px",
                                textAlign: "center",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  setSelectedProductIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(p.id)) next.delete(p.id);
                                    else next.add(p.id);
                                    return next;
                                  });
                                }}
                                style={{
                                  cursor: "pointer",
                                  width: "14px",
                                  height: "14px",
                                }}
                                aria-label={`Pilih ${p.name}`}
                              />
                            </td>
                            <td style={{ ...tdStyle, width: "36px" }}>
                              <button
                                onClick={() => toggleExpand(p.id)}
                                aria-label={
                                  isExpanded ? "Tutup batch" : "Lihat batch"
                                }
                                className="ui-motion-button ui-focus-ring"
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  cursor: "pointer",
                                  padding: "4px",
                                  display: "flex",
                                  alignItems: "center",
                                  color: sub,
                                  transform: isExpanded
                                    ? "rotate(0deg)"
                                    : "rotate(0deg)",
                                }}
                              >
                                {isExpanded ? (
                                  <ChevronDown size={16} />
                                ) : (
                                  <ChevronRight size={16} />
                                )}
                              </button>
                            </td>
                            <td
                              style={{
                                ...tdStyle,
                                color: sub,
                                fontFamily: "monospace",
                                fontSize: "12px",
                              }}
                            >
                              {p.code || "—"}
                            </td>
                            <td style={tdStyle}>
                              <button
                                onClick={() => setDrawerProductId(p.id)}
                                className="ui-focus-ring"
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  cursor: "pointer",
                                  padding: 0,
                                  fontWeight: "600",
                                  color: text,
                                  fontSize: "13px",
                                  textAlign: "left",
                                  fontFamily: "inherit",
                                }}
                              >
                                {p.name}
                              </button>
                              {healthScores[p.id] &&
                                (() => {
                                  const h = healthScores[p.id];
                                  const c =
                                    h.grade === "A" || h.grade === "B"
                                      ? "success"
                                      : h.grade === "C"
                                        ? "warning"
                                        : "danger";
                                  const m = h.metrics || {};
                                  return (
                                    <Tooltip
                                      text={`Skor ${h.score}/100 · laku ${m.movement}% · margin ${m.margin_pct}% · tren ${m.trend}% · risiko ED ${m.ed_risk}%`}
                                      position="top"
                                    >
                                      <span
                                        style={{
                                          display: "inline-block",
                                          marginLeft: 8,
                                          padding: "1px 7px",
                                          borderRadius: 6,
                                          fontSize: 11,
                                          fontWeight: 800,
                                          verticalAlign: "middle",
                                          backgroundColor: `var(--color-${c}-soft)`,
                                          color: `var(--color-${c})`,
                                        }}
                                      >
                                        {h.grade}
                                      </span>
                                    </Tooltip>
                                  );
                                })()}
                              {p.category && (
                                <p
                                  style={{
                                    margin: "2px 0 0",
                                    fontSize: "11px",
                                    color: sub,
                                  }}
                                >
                                  {p.category}
                                </p>
                              )}
                            </td>
                            <td style={{ ...tdStyle, color: sub }}>{p.unit}</td>
                            <td
                              style={{
                                ...tdStyle,
                                color: text,
                                textAlign: "right",
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {fmtRp(getProductDisplayHna(p), 2)}
                            </td>
                            <td
                              style={{
                                ...tdStyle,
                                color: text,
                                textAlign: "right",
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {fmtRp(getProductDisplayHpp(p), 2)}
                            </td>
                            <td
                              style={{
                                ...tdStyle,
                                color: text,
                                textAlign: "right",
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {fmtRp(p.sell_price)}
                            </td>
                            <td
                              style={{
                                ...tdStyle,
                                textAlign: "center",
                                verticalAlign: "middle",
                              }}
                            >
                              <div
                                aria-label={
                                  hasMinStock
                                    ? `Stok ${stock} dari minimum ${minStockNum}`
                                    : `Stok ${stock}`
                                }
                                style={{
                                  display: "inline-flex",
                                  flexDirection: "column",
                                  alignItems: "center",
                                  gap: "4px",
                                  minWidth: "52px",
                                }}
                              >
                                <span
                                  style={{
                                    fontWeight: "700",
                                    color: stockColor,
                                    fontSize: "14px",
                                    fontVariantNumeric: "tabular-nums",
                                  }}
                                >
                                  {stock}
                                </span>
                                {hasMinStock && (
                                  <div
                                    style={{
                                      width: "40px",
                                      height: "4px",
                                      background: isDarkMode
                                        ? "var(--color-surface-raised)"
                                        : "var(--color-border)",
                                      borderRadius: "2px",
                                      overflow: "hidden",
                                    }}
                                  >
                                    <div
                                      style={{
                                        height: "100%",
                                        width: `${stockPct}%`,
                                        background: stockColor,
                                        transition: uiTransition(
                                          "width",
                                          UI_MOTION.duration.page,
                                        ),
                                      }}
                                    />
                                  </div>
                                )}
                              </div>
                            </td>
                            <td
                              style={{
                                ...tdStyle,
                                color: text,
                                textAlign: "right",
                                fontVariantNumeric: "tabular-nums",
                                fontWeight: "600",
                              }}
                            >
                              {fmtRp(getProductDisplayHpp(p) * stock)}
                            </td>
                            <td style={{ ...tdStyle, verticalAlign: "middle" }}>
                              {p.nearest_expiry ? (
                                sev.plain ? (
                                  <span
                                    style={{
                                      fontSize: "12px",
                                      fontWeight: "600",
                                      color: sev.color,
                                      fontVariantNumeric: "tabular-nums",
                                    }}
                                  >
                                    {sev.label}
                                  </span>
                                ) : (
                                  <span
                                    style={{
                                      fontSize: "12px",
                                      fontWeight: "600",
                                      color: sev.color,
                                      padding: "3px 8px",
                                      borderRadius: "6px",
                                      backgroundColor: sev.bg,
                                      fontVariantNumeric: "tabular-nums",
                                      display: "inline-block",
                                    }}
                                  >
                                    {sev.label}
                                  </span>
                                )
                              ) : (
                                <span style={{ color: sub }}>—</span>
                              )}
                            </td>
                            <td style={{ ...tdStyle, textAlign: "right" }}>
                              <div
                                className="ui-row-action"
                                style={{ display: "inline-flex", gap: "2px" }}
                              >
                                <IconBtn
                                  onClick={() => setDrawerProductId(p.id)}
                                  label="Lihat detail"
                                  Icon={Eye}
                                  color={sub}
                                />
                                <IconBtn
                                  onClick={() => openStockIn(p)}
                                  label="Stok Masuk"
                                  Icon={ArrowDownCircle}
                                  color="var(--color-success)"
                                />
                                <IconBtn
                                  onClick={() => openStockOut(p)}
                                  label="Stok Keluar"
                                  Icon={ArrowUpCircle}
                                  color="var(--color-warning)"
                                />
                                <IconBtn
                                  onClick={() => openEditProduct(p)}
                                  label="Edit Produk"
                                  Icon={Icons.Edit2}
                                  color="var(--color-primary)"
                                />
                                <IconBtn
                                  onClick={() => setDeleteConfirmId(p.id)}
                                  label="Nonaktifkan"
                                  Icon={Icons.Trash2}
                                  color="var(--color-danger)"
                                />
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr
                              className="ui-row"
                              style={{
                                background: surface,
                                borderBottom: `1px solid ${border}`,
                              }}
                            >
                              <td></td>
                              <td
                                colSpan={11}
                                style={{ padding: "8px 14px 16px" }}
                              >
                                <ExpandedBatches
                                  product={p}
                                  batches={batchesCache[p.id]}
                                  loading={batchesLoading[p.id]}
                                  sub={sub}
                                  text={text}
                                  border={border}
                                  cardBg={cardBg}
                                  isDarkMode={isDarkMode}
                                  onAddBatch={() => openBatchAdd(p)}
                                  onOpenDrawer={() => setDrawerProductId(p.id)}
                                  onEditBatch={(batch) =>
                                    openBatchEdit(batch, p)
                                  }
                                  onAdjustBatch={(batch) =>
                                    openAdjustBatch(batch, p)
                                  }
                                  onDeleteBatch={(batch) =>
                                    deleteBatch(batch, p)
                                  }
                                />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                {!loading && !filtered.length && (
                  <tr>
                    <td colSpan={12} style={{ padding: "2rem 1rem" }}>
                      <EmptyState
                        compact
                        icon={EmptyStateIcons.box}
                        title={
                          search || statusFilter !== "all"
                            ? `Tidak ada hasil untuk '${search || "filter aktif"}'`
                            : 'Belum ada produk. Klik "Produk" untuk menambahkan.'
                        }
                        description={
                          search || statusFilter !== "all"
                            ? "Coba kata kunci lain atau reset filter."
                            : "Produk baru akan langsung muncul di inventaris setelah disimpan."
                        }
                        action={
                          !(search || statusFilter !== "all") ? (
                            <button
                              onClick={openAddProduct}
                              className="btn-primary ui-motion-button ui-focus-ring"
                              data-magnetic="true"
                              style={{
                                padding: "10px 14px",
                                backgroundColor: "var(--color-primary)",
                                color: "#FFF",
                                border: "none",
                                borderRadius: "10px",
                                cursor: "pointer",
                                fontWeight: "700",
                                fontSize: "13px",
                              }}
                            >
                              + Produk
                            </button>
                          ) : null
                        }
                      />
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: `2px solid ${border}` }}>
                  <td
                    colSpan={9}
                    style={{
                      ...tdStyle,
                      textAlign: "right",
                      fontWeight: "700",
                      color: text,
                    }}
                  >
                    Total Nilai Inventaris (inc PPN){" "}
                    <span
                      style={{
                        fontWeight: "400",
                        color: sub,
                        fontSize: "11px",
                      }}
                    >
                      (sesuai filter aktif)
                    </span>
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      textAlign: "right",
                      fontWeight: "800",
                      color: text,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {fmtRp(totalNilai)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
          {filtered.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "12px",
                marginTop: "14px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "13px",
                  color: sub,
                }}
              >
                <span>Tampilkan</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="ui-focus-ring"
                  style={{ ...inputStyle, padding: "6px 8px", cursor: "pointer" }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={-1}>Semua</option>
                </select>
                <span>per halaman</span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  fontSize: "13px",
                  color: sub,
                }}
              >
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  {showAll || filtered.length === 0
                    ? filtered.length
                    : `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, filtered.length)}`}{" "}
                  dari {filtered.length}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    className="ui-focus-ring"
                    style={{
                      padding: "6px 12px",
                      borderRadius: "8px",
                      border: `1px solid ${border}`,
                      background: "transparent",
                      color: text,
                      cursor: safePage <= 1 ? "not-allowed" : "pointer",
                      opacity: safePage <= 1 ? 0.45 : 1,
                      fontWeight: 600,
                      fontSize: "13px",
                    }}
                  >
                    Prev
                  </button>
                  <span style={{ color: text, fontWeight: 700 }}>
                    {safePage}/{totalPages}
                  </span>
                  <button
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={safePage >= totalPages}
                    className="ui-focus-ring"
                    style={{
                      padding: "6px 12px",
                      borderRadius: "8px",
                      border: `1px solid ${border}`,
                      background: "transparent",
                      color: text,
                      cursor: safePage >= totalPages ? "not-allowed" : "pointer",
                      opacity: safePage >= totalPages ? 0.45 : 1,
                      fontWeight: 600,
                      fontSize: "13px",
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Alerts Tab ─────────────────────────────────────────────────── */}
      {tab === "alerts" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div
            className="ui-panel ui-hover-delight"
            style={{
              borderRadius: "14px",
              padding: "18px",
            }}
          >
            <h3
              style={{
                margin: "0 0 12px",
                fontSize: "15px",
                fontWeight: "700",
                color: "var(--color-warning)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Clock size={18} /> Harus Dikeluarkan — ED ≤4 bulan / expired ({alerts.expiring.length})
            </h3>
            {alerts.expiring.length ? (
              alerts.expiring.map((b, i) => {
                const days = daysUntil(b.expired_date);
                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 0",
                      borderBottom:
                        i < alerts.expiring.length - 1
                          ? `1px solid ${border}`
                          : "none",
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: "600", color: text }}>
                        {b.product_name}
                      </span>
                      <span
                        style={{
                          marginLeft: "8px",
                          fontSize: "12px",
                          color: sub,
                        }}
                      >
                        Batch: {b.batch_no || "—"} · Qty: {b.qty_current}{" "}
                        {b.unit}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: "700",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        backgroundColor:
                          days < 30
                            ? "var(--color-danger-soft)"
                            : "var(--color-warning-soft)",
                        color:
                          days < 30
                            ? "var(--color-danger)"
                            : "var(--color-warning)",
                      }}
                    >
                      {days <= 0 ? "EXPIRED!" : `${days} hari lagi`}
                    </span>
                  </div>
                );
              })
            ) : (
              <p style={{ color: sub, fontSize: "14px", margin: 0 }}>
                ✅ Tidak ada stok yang perlu dikeluarkan (semua ED &gt; 4 bulan).
              </p>
            )}
          </div>

          <div
            className="ui-panel ui-hover-delight"
            style={{
              borderRadius: "14px",
              padding: "18px",
            }}
          >
            <h3
              style={{
                margin: "0 0 12px",
                fontSize: "15px",
                fontWeight: "700",
                color: "var(--color-danger)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <AlertTriangle size={18} /> Stok Rendah ({alerts.lowStock.length})
            </h3>
            {alerts.lowStock.length ? (
              alerts.lowStock.map((p, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 0",
                    borderBottom:
                      i < alerts.lowStock.length - 1
                        ? `1px solid ${border}`
                        : "none",
                  }}
                >
                  <span style={{ fontWeight: "600", color: text }}>
                    {p.name}
                  </span>
                  <span
                    style={{
                      fontSize: "12px",
                      color: "var(--color-danger)",
                      fontWeight: "600",
                    }}
                  >
                    {p.total_stock} / min {p.min_stock}
                  </span>
                </div>
              ))
            ) : (
              <p style={{ color: sub, fontSize: "14px", margin: 0 }}>
                ✅ Semua stok di atas minimum.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ─── Product Modal ──────────────────────────────────────────────── */}
      {showModal === "product" &&
        renderPortal(
          <ModalShell
            onClose={() => setShowModal(null)}
            cardBg={cardBg}
            title={editId ? "Edit Produk" : "Produk Baru"}
            text={text}
            border={border}
            sub={sub}
            isMobile={isMobile}
            maxWidth={editId ? "760px" : "520px"}
            hidden={!!batchModal || !!adjustBatch}
          >
            <div
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              {editId && (
                <div
                  role="tablist"
                  aria-label="Edit produk"
                  style={{
                    display: "flex",
                    gap: "4px",
                    background: surface,
                    borderRadius: "10px",
                    padding: "3px",
                    marginBottom: "4px",
                  }}
                >
                  {[
                    ["profile", "Profil"],
                    [
                      "batches",
                      `Batch (${(batchesCache[editId] || []).length})`,
                    ],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={productModalTab === key}
                      onClick={() => {
                        setProductModalTab(key);
                        if (key === "batches") fetchBatches(editId, true);
                      }}
                      style={{
                        flex: 1,
                        minHeight: "38px",
                        border: "none",
                        borderRadius: "8px",
                        background:
                          productModalTab === key ? cardBg : "transparent",
                        color: productModalTab === key ? text : sub,
                        cursor: "pointer",
                        fontSize: "13px",
                        fontWeight: "700",
                        boxShadow:
                          productModalTab === key
                            ? "0 1px 4px rgba(0,0,0,0.12)"
                            : "none",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {(!editId || productModalTab === "profile") && (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "12px",
                    }}
                  >
                    <div>
                      <label style={labelStyle}>
                        Kode{" "}
                        <span style={{ color: "var(--color-danger)" }}>*</span>
                      </label>
                      <input
                        value={pForm.code}
                        onChange={(e) =>
                          setPForm((p) => ({
                            ...p,
                            code: e.target.value.toUpperCase(),
                          }))
                        }
                        placeholder="BRAND-VARIAN-UKURAN (mis. ENTMX-VAN-555G)"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Kategori</label>
                      <input
                        value={pForm.category}
                        onChange={(e) =>
                          setPForm((p) => ({ ...p, category: e.target.value }))
                        }
                        placeholder="Obat, Nutrisi..."
                        style={inputStyle}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Nama Produk *</label>
                    <input
                      value={pForm.name}
                      onChange={(e) => {
                        setPForm((p) => ({ ...p, name: e.target.value }));
                        setModalError("");
                      }}
                      placeholder="Paracetamol 500mg"
                      style={inputStyle}
                    />
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "12px",
                    }}
                  >
                    <div>
                      <label style={labelStyle}>Satuan Eceran *</label>
                      <select
                        value={pForm.base_unit || pForm.unit || "pcs"}
                        onChange={(e) =>
                          setPForm((p) => ({
                            ...p,
                            base_unit: e.target.value,
                            unit: e.target.value,
                          }))
                        }
                        style={inputStyle}
                      >
                        {BASE_UNITS.map((u, i) => (
                          <option key={`${u.value}-${i}`} value={u.value}>
                            {u.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Jual / eceran</label>
                      <input
                        type="number"
                        value={pForm.sell_price}
                        onChange={(e) =>
                          setPForm((p) => ({
                            ...p,
                            sell_price: parseFloat(e.target.value) || 0,
                          }))
                        }
                        style={inputStyle}
                      />
                    </div>
                  </div>
                  <HnaHppInput
                    value={pForm.hna}
                    onChange={(v) => setPForm((p) => ({ ...p, hna: v }))}
                    decimals={2}
                    isDarkMode={isDarkMode}
                  />
                  {parseFloat(pForm.hna) > 0 && (
                    <p
                      style={{
                        margin: "0 0 4px",
                        fontSize: "11px",
                        color: sub,
                        padding: "6px 10px",
                        background: surface,
                        borderRadius: "8px",
                      }}
                    >
                      Margin per {pForm.base_unit || pForm.unit || "pcs"} (jual
                      − HPP inc PPN):{" "}
                      <strong
                        style={{
                          color:
                            pForm.sell_price - hppFromHna(pForm.hna) > 0
                              ? "var(--color-success)"
                              : "var(--color-danger)",
                        }}
                      >
                        {formatRupiah(
                          pForm.sell_price - hppFromHna(pForm.hna),
                          0,
                        )}
                      </strong>
                    </p>
                  )}

                  <div
                    style={{
                      background: surface,
                      border: `1px solid ${border}`,
                      borderRadius: "10px",
                      padding: "12px",
                    }}
                  >
                    <label style={labelStyle}>
                      Berat per {pForm.base_unit || pForm.unit || "pcs"} (gram)
                    </label>
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={pForm.weight_gram || 0}
                      onChange={(e) =>
                        setPForm((p) => ({
                          ...p,
                          weight_gram: Math.max(
                            0,
                            parseInt(e.target.value) || 0,
                          ),
                        }))
                      }
                      placeholder="Contoh: 100"
                      style={inputStyle}
                    />
                    <p
                      style={{
                        margin: "6px 0 0",
                        fontSize: "11px",
                        color: sub,
                      }}
                    >
                      Dipakai untuk estimasi berat paket di Nota Penjualan.
                      {parseInt(pForm.weight_gram) > 0
                        ? ` ${((parseInt(pForm.weight_gram) || 0) / 1000)
                            .toLocaleString("id-ID", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })} kg per ${pForm.base_unit || pForm.unit || "pcs"}.`
                        : ""}
                    </p>
                  </div>

                  {/* v1.6.0 Multi-Unit Packaging — optional */}
                  <div
                    style={{
                      background: surface,
                      border: `1px dashed ${border}`,
                      borderRadius: "10px",
                      padding: "12px",
                    }}
                  >
                    <p
                      style={{
                        margin: "0 0 10px",
                        fontSize: "12px",
                        fontWeight: "700",
                        color: text,
                      }}
                    >
                      📦 Kemasan (opsional) — kalau barang juga dijual per
                      karton/dus
                    </p>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 1.2fr",
                        gap: "12px",
                      }}
                    >
                      <div>
                        <label style={labelStyle}>Satuan Kemasan</label>
                        <select
                          value={pForm.pack_unit || ""}
                          onChange={(e) =>
                            setPForm((p) => ({
                              ...p,
                              pack_unit: e.target.value,
                              pack_size: e.target.value
                                ? p.pack_size > 1
                                  ? p.pack_size
                                  : 12
                                : 1,
                            }))
                          }
                          style={inputStyle}
                        >
                          <option value="">— Tidak ada —</option>
                          {PACK_UNITS.map((u) => (
                            <option key={u.value} value={u.value}>
                              {u.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>
                          Isi per {pForm.pack_unit || "kemasan"}
                        </label>
                        <input
                          type="number"
                          min="1"
                          disabled={!pForm.pack_unit}
                          value={pForm.pack_size || 1}
                          onChange={(e) =>
                            setPForm((p) => ({
                              ...p,
                              pack_size: parseInt(e.target.value) || 1,
                            }))
                          }
                          style={{
                            ...inputStyle,
                            opacity: pForm.pack_unit ? 1 : 0.5,
                          }}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>
                          Jual / {pForm.pack_unit || "kemasan"}
                        </label>
                        <input
                          type="number"
                          disabled={!pForm.pack_unit}
                          value={pForm.sell_price_pack || 0}
                          onChange={(e) =>
                            setPForm((p) => ({
                              ...p,
                              sell_price_pack: parseFloat(e.target.value) || 0,
                            }))
                          }
                          style={{
                            ...inputStyle,
                            opacity: pForm.pack_unit ? 1 : 0.5,
                          }}
                        />
                      </div>
                    </div>
                    {pForm.pack_unit && pForm.pack_size > 1 && (
                      <p
                        style={{
                          margin: "8px 0 0",
                          fontSize: "11px",
                          color: sub,
                        }}
                      >
                        📐 1 {pForm.pack_unit} = {pForm.pack_size}{" "}
                        {pForm.base_unit || pForm.unit || "pcs"}
                        {pForm.sell_price_pack > 0 && pForm.pack_size > 0 && (
                          <>
                            {" "}
                            · Per {pForm.base_unit || pForm.unit || "pcs"}:{" "}
                            {fmtRp(pForm.sell_price_pack / pForm.pack_size)}
                          </>
                        )}
                      </p>
                    )}
                  </div>

                  {/* v1.7.0 Tiered Pricing (Grosir) — optional */}
                  <div
                    style={{
                      background: surface,
                      border: `1px dashed ${border}`,
                      borderRadius: "10px",
                      padding: "12px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "10px",
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          fontSize: "12px",
                          fontWeight: "700",
                          color: text,
                        }}
                      >
                        💰 Harga Grosir (Tier) — opsional
                      </p>
                      <button
                        onClick={addTier}
                        type="button"
                        style={{
                          background: "var(--color-primary)",
                          color: "#FFF",
                          border: "none",
                          padding: "4px 10px",
                          borderRadius: "6px",
                          fontSize: "11px",
                          cursor: "pointer",
                          fontWeight: "600",
                        }}
                      >
                        + Tier
                      </button>
                    </div>
                    {(pForm.price_tiers || []).length === 0 && (
                      <p
                        style={{
                          margin: 0,
                          fontSize: "11px",
                          color: sub,
                          fontStyle: "italic",
                        }}
                      >
                        Belum ada tier. Klik "+ Tier" untuk tambah harga grosir
                        per qty.
                      </p>
                    )}
                    {(pForm.price_tiers || []).map((tier, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "grid",
                          // v1.56.1: mobile 2 kolom wrap — grid fixed 5 kolom kesempitan di HP
                          gridTemplateColumns: isMobile
                            ? "1fr 1fr"
                            : "1.1fr 70px 70px 1fr 28px",
                          gap: "6px",
                          marginBottom: "6px",
                          alignItems: "center",
                        }}
                      >
                        <select
                          value={tier.unit}
                          onChange={(e) =>
                            updateTier(idx, "unit", e.target.value)
                          }
                          style={{
                            ...inputStyle,
                            fontSize: "12px",
                            padding: "8px",
                          }}
                        >
                          <option value={pForm.base_unit || "pcs"}>
                            {pForm.base_unit || "pcs"}
                          </option>
                          {pForm.pack_unit && (
                            <option value={pForm.pack_unit}>
                              {pForm.pack_unit}
                            </option>
                          )}
                        </select>
                        <input
                          type="number"
                          min="1"
                          placeholder="Min"
                          value={tier.min_qty}
                          onChange={(e) =>
                            updateTier(
                              idx,
                              "min_qty",
                              parseInt(e.target.value) || 1,
                            )
                          }
                          style={{
                            ...inputStyle,
                            fontSize: "12px",
                            padding: "8px",
                          }}
                        />
                        <input
                          type="number"
                          placeholder="Max"
                          value={tier.max_qty || ""}
                          onChange={(e) =>
                            updateTier(idx, "max_qty", e.target.value)
                          }
                          title="Kosongkan = tanpa batas atas"
                          style={{
                            ...inputStyle,
                            fontSize: "12px",
                            padding: "8px",
                          }}
                        />
                        <input
                          type="number"
                          placeholder="Harga (Rp)"
                          value={tier.price}
                          onChange={(e) =>
                            updateTier(
                              idx,
                              "price",
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          style={{
                            ...inputStyle,
                            fontSize: "12px",
                            padding: "8px",
                          }}
                        />
                        <Tooltip text="Hapus tier harga" position="top">
                          <button
                            onClick={() => removeTier(idx)}
                            type="button"
                            aria-label="Hapus tier harga"
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              padding: 0,
                            }}
                          >
                            <Trash2 size={14} color="var(--color-danger)" />
                          </button>
                        </Tooltip>
                      </div>
                    ))}
                    {(pForm.price_tiers || []).length > 0 && (
                      <p
                        style={{
                          margin: "6px 0 0",
                          fontSize: "11px",
                          color: sub,
                        }}
                      >
                        💡 Auto-apply ke Nota saat qty matches range. Tier
                        dengan <code>min_qty</code> tertinggi yang match =
                        menang.
                      </p>
                    )}
                  </div>

                  <div>
                    <label style={labelStyle}>
                      Stok Minimum (di {pForm.base_unit || pForm.unit || "pcs"})
                    </label>
                    <input
                      type="number"
                      value={pForm.min_stock}
                      onChange={(e) =>
                        setPForm((p) => ({
                          ...p,
                          min_stock: parseInt(e.target.value) || 0,
                        }))
                      }
                      style={inputStyle}
                    />
                  </div>
                </>
              )}
              {editId && productModalTab === "batches" && (
                <ProductBatchPanel
                  product={{
                    id: editId,
                    name: pForm.name,
                    unit: pForm.unit,
                    base_unit: pForm.base_unit,
                    pack_unit: pForm.pack_unit,
                    pack_size: pForm.pack_size,
                  }}
                  batches={batchesCache[editId]}
                  loading={batchesLoading[editId]}
                  sub={sub}
                  text={text}
                  border={border}
                  cardBg={cardBg}
                  surface={surface}
                  isDarkMode={isDarkMode}
                  onAddBatch={() =>
                    openBatchAdd({ id: editId, name: pForm.name })
                  }
                  onEditBatch={(batch) =>
                    openBatchEdit(batch, { id: editId, name: pForm.name })
                  }
                  onAdjustBatch={(batch) =>
                    openAdjustBatch(batch, { id: editId, name: pForm.name })
                  }
                  onDeleteBatch={(batch) =>
                    deleteBatch(batch, { id: editId, name: pForm.name })
                  }
                />
              )}
              {batchActionError && (
                <div
                  role="alert"
                  style={{
                    backgroundColor: "var(--color-danger-soft)",
                    border:
                      "1px solid color-mix(in srgb, var(--color-danger) 24%, transparent)",
                    borderRadius: "10px",
                    padding: "10px 14px",
                    color: "var(--color-danger)",
                    fontSize: "13px",
                    fontWeight: "600",
                    display: "flex",
                    gap: "8px",
                    alignItems: "flex-start",
                  }}
                >
                  <AlertCircle
                    size={16}
                    style={{ flexShrink: 0, marginTop: "1px" }}
                  />{" "}
                  <span>{batchActionError}</span>
                </div>
              )}
              {modalError && (
                <div
                  style={{
                    backgroundColor: "var(--color-danger-soft)",
                    border:
                      "1px solid color-mix(in srgb, var(--color-danger) 24%, transparent)",
                    borderRadius: "10px",
                    padding: "10px 14px",
                    color: "var(--color-danger)",
                    fontSize: "13px",
                    fontWeight: "600",
                    display: "flex",
                    gap: "8px",
                    alignItems: "flex-start",
                  }}
                >
                  <AlertCircle
                    size={16}
                    style={{ flexShrink: 0, marginTop: "1px" }}
                  />{" "}
                  <span>{modalError}</span>
                </div>
              )}
              {(!editId || productModalTab === "profile") && (
                <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
                  <button
                    onClick={saveProduct}
                    disabled={modalSaving}
                    className="btn-primary ui-motion-button ui-focus-ring"
                    data-magnetic="true"
                    style={primaryBtn("var(--color-primary)", modalSaving)}
                  >
                    {modalSaving
                      ? "Menyimpan..."
                      : editId
                        ? "Simpan"
                        : "Tambah"}
                  </button>
                  {/* v1.11.12: tombol Simpan warna konsistensi — semua biru */}
                  <button
                    onClick={() => setShowModal(null)}
                    disabled={modalSaving}
                    style={secondaryBtn(surface, text, border)}
                  >
                    Batal
                  </button>
                </div>
              )}
            </div>
          </ModalShell>,
        )}

      {/* ─── Stock In Modal ──────────────────────────────────────────────── */}
      {showModal === "stockIn" &&
        renderPortal(
          <ModalShell
            onClose={() => setShowModal(null)}
            cardBg={cardBg}
            title="📥 Stok Masuk"
            titleColor="var(--color-success)"
            text={text}
            border={border}
            sub={sub}
            isMobile={isMobile}
            maxWidth="480px"
          >
            <div
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "8px",
                    marginBottom: "6px",
                  }}
                >
                  <label style={{ ...labelStyle, marginBottom: 0 }}>
                    Produk *
                  </label>
                  <button
                    type="button"
                    onClick={() => openScanner("stockIn")}
                    style={{
                      minHeight: "34px",
                      padding: "7px 11px",
                      border: `1px solid ${border}`,
                      borderRadius: "9px",
                      background: surface,
                      color: text,
                      fontSize: "12px",
                      fontWeight: "800",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                    aria-label="Scan barcode produk untuk stok masuk"
                  >
                    <Camera size={14} /> Scan
                  </button>
                </div>
                <MasterSelect
                  value={siForm.product_name}
                  onChange={(v) => {
                    setSiForm((pv) => ({ ...pv, product_name: v }));
                    const prod = products.find((p) => p.name === v);
                    if (prod)
                      setSiForm((pv) => ({
                        ...pv,
                        hna: parseFloat(prod.hna) || 0,
                      }));
                  }}
                  options={products.map((p) => ({ name: p.name }))}
                  onAdd={handleAddProduct}
                  onRemove={handleRemoveProduct}
                  isDarkMode={isDarkMode}
                  placeholder="Pilih atau tambah produk..."
                />
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                }}
              >
                <div>
                  <label style={labelStyle}>No. Batch</label>
                  <input
                    value={siForm.batch_no}
                    onChange={(e) =>
                      setSiForm((p) => ({ ...p, batch_no: e.target.value }))
                    }
                    placeholder="B2603-01"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Qty *</label>
                  <input
                    type="number"
                    value={siForm.qty}
                    min="1"
                    onChange={(e) =>
                      setSiForm((p) => ({
                        ...p,
                        qty: parseInt(e.target.value) || 0,
                      }))
                    }
                    style={inputStyle}
                  />
                </div>
              </div>
              <HnaHppInput
                value={siForm.hna}
                onChange={(v) => setSiForm((p) => ({ ...p, hna: v }))}
                decimals={2}
                isDarkMode={isDarkMode}
              />
              <div>
                <label style={labelStyle}>Tanggal Expired</label>
                <input
                  type="date"
                  value={siForm.expired_date}
                  onChange={(e) =>
                    setSiForm((p) => ({ ...p, expired_date: e.target.value }))
                  }
                  style={inputStyle}
                />
              </div>
              {modalError && (
                <div
                  style={{
                    backgroundColor: "var(--color-danger-soft)",
                    border:
                      "1px solid color-mix(in srgb, var(--color-danger) 24%, transparent)",
                    borderRadius: "10px",
                    padding: "10px 14px",
                    color: "var(--color-danger)",
                    fontSize: "13px",
                    fontWeight: "600",
                    display: "flex",
                    gap: "8px",
                    alignItems: "flex-start",
                  }}
                >
                  <AlertCircle
                    size={16}
                    style={{ flexShrink: 0, marginTop: "1px" }}
                  />{" "}
                  <span>{modalError}</span>
                </div>
              )}
              <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
                <button
                  onClick={saveStockIn}
                  disabled={modalSaving}
                  className="btn-primary ui-motion-button ui-focus-ring"
                  data-magnetic="true"
                  style={primaryBtn("var(--color-primary)", modalSaving)}
                >
                  {modalSaving ? "Menyimpan..." : "Simpan"}
                </button>
                <button
                  onClick={() => setShowModal(null)}
                  disabled={modalSaving}
                  style={secondaryBtn(surface, text, border)}
                >
                  Batal
                </button>
              </div>
            </div>
          </ModalShell>,
        )}

      {/* ─── Stock Out Modal ─────────────────────────────────────────────── */}
      {showModal === "stockOut" &&
        renderPortal(
          <ModalShell
            onClose={() => setShowModal(null)}
            cardBg={cardBg}
            title="📤 Stok Keluar"
            titleColor="var(--color-warning)"
            text={text}
            border={border}
            sub={sub}
            isMobile={isMobile}
            maxWidth="480px"
          >
            <div
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "8px",
                    marginBottom: "6px",
                  }}
                >
                  <label style={{ ...labelStyle, marginBottom: 0 }}>
                    Produk *
                  </label>
                  <button
                    type="button"
                    onClick={() => openScanner("stockOut")}
                    style={{
                      minHeight: "34px",
                      padding: "7px 11px",
                      border: `1px solid ${border}`,
                      borderRadius: "9px",
                      background: surface,
                      color: text,
                      fontSize: "12px",
                      fontWeight: "800",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                    aria-label="Scan barcode produk untuk stok keluar"
                  >
                    <Camera size={14} /> Scan
                  </button>
                </div>
                <select
                  value={soForm.product_id}
                  onChange={(e) => {
                    const newId = parseInt(e.target.value) || "";
                    setSoForm((p) => ({
                      ...p,
                      product_id: newId,
                      selected_batch_id: "",
                    }));
                    if (newId) loadStockOutBatches(newId);
                    else setSoBatches([]);
                  }}
                  style={inputStyle}
                >
                  <option value="">Pilih produk...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (stok: {p.total_stock})
                    </option>
                  ))}
                </select>
              </div>
              {/* v1.7.0: Batch dropdown — FEFO default + manual override */}
              {soForm.product_id && soBatches.length > 0 && (
                <div>
                  <label style={labelStyle}>Pilih Batch (override FEFO)</label>
                  <select
                    value={soForm.selected_batch_id}
                    onChange={(e) =>
                      setSoForm((p) => ({
                        ...p,
                        selected_batch_id: e.target.value,
                      }))
                    }
                    style={inputStyle}
                  >
                    <option value="">
                      🤖 Auto FEFO — pilih batch dengan ED terdekat
                    </option>
                    {soBatches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.batch_no || "(tanpa no)"} · ED:{" "}
                        {b.expired_date ? fmtDate(b.expired_date) : "-"} · Stok:{" "}
                        {b.qty_current}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label style={labelStyle}>Qty *</label>
                <input
                  type="number"
                  value={soForm.qty}
                  min="1"
                  onChange={(e) =>
                    setSoForm((p) => ({
                      ...p,
                      qty: parseInt(e.target.value) || 0,
                    }))
                  }
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Catatan</label>
                <input
                  value={soForm.notes}
                  onChange={(e) =>
                    setSoForm((p) => ({ ...p, notes: e.target.value }))
                  }
                  placeholder="Alasan stok keluar"
                  style={inputStyle}
                />
              </div>
              {!soForm.selected_batch_id && (
                <p style={{ margin: 0, fontSize: "11px", color: sub }}>
                  ℹ️ Stok akan diambil otomatis dari batch dengan ED terdekat
                  (FEFO).
                </p>
              )}
              {soForm.selected_batch_id && (
                <p
                  style={{
                    margin: 0,
                    fontSize: "11px",
                    color: "var(--color-warning)",
                    fontWeight: "600",
                  }}
                >
                  ⚠️ Mode manual — qty akan dipotong dari batch yang dipilih
                  saja.
                </p>
              )}
              {modalError && (
                <div
                  style={{
                    backgroundColor: "var(--color-danger-soft)",
                    border:
                      "1px solid color-mix(in srgb, var(--color-danger) 24%, transparent)",
                    borderRadius: "10px",
                    padding: "10px 14px",
                    color: "var(--color-danger)",
                    fontSize: "13px",
                    fontWeight: "600",
                    display: "flex",
                    gap: "8px",
                    alignItems: "flex-start",
                  }}
                >
                  <AlertCircle
                    size={16}
                    style={{ flexShrink: 0, marginTop: "1px" }}
                  />{" "}
                  <span>{modalError}</span>
                </div>
              )}
              <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
                <button
                  onClick={saveStockOut}
                  disabled={modalSaving}
                  className="btn-primary ui-motion-button ui-focus-ring"
                  data-magnetic="true"
                  style={primaryBtn("var(--color-warning)", modalSaving)}
                >
                  {modalSaving ? "Menyimpan..." : "Keluarkan"}
                </button>
                <button
                  onClick={() => setShowModal(null)}
                  disabled={modalSaving}
                  style={secondaryBtn(surface, text, border)}
                >
                  Batal
                </button>
              </div>
            </div>
          </ModalShell>,
        )}

      {/* ─── Opname Modal (extracted, per-batch) ────────────────────────── */}
      {showModal === "opname" &&
        renderPortal(
          <OpnameModal
            products={products}
            isDarkMode={isDarkMode}
            isMobile={isMobile}
            onClose={() => setShowModal(null)}
            onSaved={(msg) => {
              flashSuccess(msg);
              fetchProducts();
              fetchAlerts();
              setBatchesCache({});
            }}
            onProductsChanged={() => {
              fetchProducts();
            }}
          />,
        )}

      {scannerMode && (
        <BarcodeScanner
          isDarkMode={isDarkMode}
          onClose={() => setScannerMode(null)}
          onScan={handleScannerResult}
        />
      )}

      {/* v1.11.13: Sticky action bar — muncul kalau ada produk dipilih */}
      {selectedProductIds.size > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            background: isDarkMode
              ? "var(--color-surface-elevated)"
              : "#FFFFFF",
            color: text,
            border: `1px solid ${border}`,
            borderRadius: "14px",
            boxShadow: "0 12px 40px rgba(0,0,0,0.2)",
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            gap: "14px",
            zIndex: 1000,
            fontSize: "13px",
            fontWeight: "600",
          }}
        >
          <span>
            <strong style={{ color: "var(--color-primary)" }}>
              {selectedProductIds.size}
            </strong>{" "}
            produk dipilih
          </span>
          <button
            onClick={() => setBulkEditOpen(true)}
            style={{
              padding: "8px 14px",
              background: "var(--color-primary)",
              color: "#FFF",
              border: "none",
              borderRadius: "8px",
              fontWeight: "600",
              fontSize: "12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Edit2 size={13} /> Edit Massal
          </button>
          <button
            onClick={() => setBarcodePrintOpen(true)}
            style={{
              padding: "8px 14px",
              background: "#111111",
              color: "#FFF",
              border: "none",
              borderRadius: "8px",
              fontWeight: "600",
              fontSize: "12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
            aria-label="Cetak stiker barcode"
          >
            <Barcode size={13} /> Cetak Stiker Barcode
          </button>
          <button
            onClick={() => setSelectedProductIds(new Set())}
            style={{
              padding: "8px 12px",
              background: "transparent",
              color: sub,
              border: `1px solid ${border}`,
              borderRadius: "8px",
              fontWeight: "600",
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            Batal
          </button>
        </div>
      )}

      {/* v1.11.13: Bulk edit modal */}
      {bulkEditOpen && (
        <BulkEditModal
          products={products.filter((p) => selectedProductIds.has(p.id))}
          allProducts={products}
          allCategories={Array.from(
            new Set(products.map((p) => p.category).filter(Boolean)),
          ).sort()}
          onClose={() => setBulkEditOpen(false)}
          onSaved={(n) => {
            if (n > 0) {
              fetchProducts();
              setSelectedProductIds(new Set());
              flashSuccess(`${n} produk berhasil di-update`);
            }
          }}
          isDarkMode={isDarkMode}
        />
      )}

      {barcodePrintOpen && (
        <PrintBarcodeModal
          products={selectedBarcodeProducts}
          isDarkMode={isDarkMode}
          onClose={() => setBarcodePrintOpen(false)}
          onGenerated={({ printed, skippedCount }) => {
            if (printed > 0) {
              flashSuccess(
                `${printed} stiker barcode siap dicetak${skippedCount > 0 ? ` · ${skippedCount} produk dilewati` : ""}`,
              );
            }
          }}
        />
      )}

      {/* Detail Drawer */}
      {drawerProductId && (
        <ProductDrawer
          productId={drawerProductId}
          isDarkMode={isDarkMode}
          isMobile={isMobile}
          onClose={() => setDrawerProductId(null)}
          onEdit={(p) => {
            setDrawerProductId(null);
            openEditProduct(p);
          }}
          onStockIn={(p) => {
            setDrawerProductId(null);
            openStockIn(p);
          }}
          onStockOut={(p) => {
            setDrawerProductId(null);
            openStockOut(p);
          }}
          onChanged={() => {
            void refreshAfterChange(drawerProductId);
          }}
        />
      )}

      {/* Delete Confirm Modal */}
      <ConfirmModal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={confirmDelete}
        title="Nonaktifkan Produk"
        message="Apakah Anda yakin ingin menonaktifkan produk ini? (data tetap tersimpan, hanya disembunyikan dari list)"
        isDarkMode={isDarkMode}
        confirmLabel="Nonaktifkan"
      />

      <ConfirmModal
        isOpen={!!deleteBatchConfirm}
        onClose={() => setDeleteBatchConfirm(null)}
        onConfirm={executeDeleteBatch}
        title="Hapus Batch"
        message={
          deleteBatchConfirm
            ? `Hapus batch "${deleteBatchConfirm.batch.batch_no || "(tanpa no.)"}"?${
                deleteBatchConfirm.batch.qty_current > 0
                  ? ` Stok ${deleteBatchConfirm.batch.qty_current} akan di-NOL-kan dan dicatat di mutasi.`
                  : ""
              }`
            : ""
        }
        isDarkMode={isDarkMode}
      />

      {batchModal && (
        <BatchFormModal
          mode={batchModal.mode}
          batch={batchModal.batch}
          productId={batchModal.productId}
          productName={batchModal.productName}
          isDarkMode={isDarkMode}
          onClose={() => setBatchModal(null)}
          onSaved={async () => {
            setBatchModal(null);
            await refreshBatchProduct(batchModal.productId);
          }}
        />
      )}

      {adjustBatch && (
        <ModalShell
          onClose={() => {
            setAdjustBatch(null);
            setBatchActionError("");
          }}
          cardBg={cardBg}
          title="Adjust Qty Batch"
          text={text}
          border={border}
          sub={sub}
          isMobile={isMobile}
          maxWidth="420px"
        >
          <div style={{ display: "grid", gap: "12px" }}>
            <p style={{ margin: 0, fontSize: "12px", color: sub }}>
              {adjustBatch.productName} · batch{" "}
              <strong style={{ color: text }}>
                {adjustBatch.batch_no || "(tanpa no.)"}
              </strong>{" "}
              · sistem {adjustBatch.qty_current}
            </p>
            <div>
              <label style={labelStyle}>Qty Baru *</label>
              <input
                type="number"
                min="0"
                value={adjustForm.new_qty}
                onChange={(e) =>
                  setAdjustForm((p) => ({ ...p, new_qty: e.target.value }))
                }
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Alasan *</label>
              <input
                value={adjustForm.reason}
                onChange={(e) =>
                  setAdjustForm((p) => ({ ...p, reason: e.target.value }))
                }
                placeholder="contoh: koreksi opname, rusak, hilang"
                style={inputStyle}
              />
            </div>
            {batchActionError && (
              <div
                role="alert"
                style={{
                  backgroundColor: "var(--color-danger-soft)",
                  border:
                    "1px solid color-mix(in srgb, var(--color-danger) 24%, transparent)",
                  borderRadius: "10px",
                  padding: "10px 14px",
                  color: "var(--color-danger)",
                  fontSize: "13px",
                  fontWeight: "600",
                }}
              >
                {batchActionError}
              </div>
            )}
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={submitAdjustBatch}
                disabled={batchActionSaving}
                className="btn-primary ui-motion-button ui-focus-ring"
                data-magnetic="true"
                style={primaryBtn("var(--color-primary)", batchActionSaving)}
              >
                {batchActionSaving ? "Menyimpan..." : "Simpan"}
              </button>
              <button
                onClick={() => {
                  setAdjustBatch(null);
                  setBatchActionError("");
                }}
                disabled={batchActionSaving}
                style={secondaryBtn(surface, text, border)}
              >
                Batal
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      <ToastNotice message={toast.msg} type={toast.type} isMobile={isMobile} />
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────
const thStyle = (sub, border) => ({
  padding: "12px 14px",
  textAlign: "left",
  fontWeight: "700",
  color: sub,
  fontSize: "11px",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  borderBottom: `1px solid ${border}`,
});
const tdStyle = { padding: "12px 14px" };

const primaryBtn = (color, disabled) => ({
  flex: 1,
  padding: "13px",
  backgroundColor: color,
  color: "#FFF",
  border: "none",
  borderRadius: "12px",
  cursor: disabled ? "wait" : "pointer",
  fontWeight: "700",
  fontSize: "14px",
  opacity: disabled ? 0.7 : 1,
});
const secondaryBtn = (surface, text, border) => ({
  flex: 1,
  padding: "13px",
  backgroundColor: surface,
  color: text,
  border: `1px solid ${border}`,
  borderRadius: "12px",
  cursor: "pointer",
  fontSize: "14px",
  fontWeight: "600",
});

function IconBtn({ onClick, label, Icon, color }) {
  return (
    <Tooltip text={label} position="top">
      <button
        onClick={onClick}
        aria-label={label}
        className="ui-motion-button ui-focus-ring"
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          width: "34px",
          height: "34px",
          padding: 0,
          borderRadius: "8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: uiTransition("background", UI_MOTION.duration.fast),
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = color + "20")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <Icon size={15} color={color} />
      </button>
    </Tooltip>
  );
}

function ExpandedBatches({
  product,
  batches,
  loading,
  sub,
  text,
  border,
  cardBg,
  isDarkMode,
  onAddBatch,
  onOpenDrawer,
  onEditBatch,
  onAdjustBatch,
  onDeleteBatch,
}) {
  const packSize = parseInt(product?.pack_size) || 1;
  const packUnit = product?.pack_unit;
  const baseUnit = product?.base_unit || product?.unit || "pcs";
  if (loading)
    return (
      <p style={{ color: sub, fontSize: "12px", padding: "8px 0" }}>
        Memuat batch...
      </p>
    );
  if (!batches || batches.length === 0) {
    return (
      <EmptyState
        compact
        icon={EmptyStateIcons.box}
        title="Belum ada batch tercatat."
        description="Batch pertama bisa dibuat dari stok masuk atau dari tombol batch baru."
        action={
          <button
            onClick={onAddBatch}
            className="btn-primary ui-motion-button ui-focus-ring"
            data-magnetic="true"
            style={{
              background: "var(--color-success)",
              color: "#FFF",
              border: "none",
              padding: "10px 14px",
              borderRadius: "10px",
              cursor: "pointer",
              fontWeight: "700",
              fontSize: "12px",
            }}
          >
            + Stok Masuk
          </button>
        }
      />
    );
  }
  return (
    <div
      className="ui-table-shell"
      style={{
        background: cardBg,
        border: `1px solid ${border}`,
        borderRadius: "10px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 14px",
          borderBottom: `1px solid ${border}`,
        }}
      >
        <span
          style={{
            fontSize: "11px",
            fontWeight: "700",
            color: sub,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {batches.length} batch
        </span>
        <button
          onClick={onOpenDrawer}
          className="ui-motion-button ui-focus-ring"
          style={{
            background: "transparent",
            color: "var(--color-primary)",
            border: "none",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: "600",
            minHeight: "32px",
          }}
        >
          Buka detail
        </button>
      </div>
      <table
        style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}
      >
        <thead>
          <tr style={{ background: "transparent" }}>
            <th
              style={{
                ...thStyle(sub, border),
                borderBottom: "none",
                padding: "8px 14px",
              }}
            >
              No. Batch
            </th>
            <th
              style={{
                ...thStyle(sub, border),
                borderBottom: "none",
                padding: "8px 14px",
              }}
            >
              ED
            </th>
            <th
              style={{
                ...thStyle(sub, border),
                borderBottom: "none",
                padding: "8px 14px",
                textAlign: "right",
              }}
            >
              Qty
            </th>
            <th
              style={{
                ...thStyle(sub, border),
                borderBottom: "none",
                padding: "8px 14px",
                textAlign: "right",
              }}
              title="HNA per pcs (raw, exc PPN)"
            >
              HNA
              <br />
              <span style={{ fontSize: "9px", fontWeight: "400", color: sub }}>
                (exc PPN)
              </span>
            </th>
            <th
              style={{
                ...thStyle(sub, border),
                borderBottom: "none",
                padding: "8px 14px",
                textAlign: "right",
              }}
              title="HPP per pcs = HNA + PPN 11%"
            >
              HPP
              <br />
              <span style={{ fontSize: "9px", fontWeight: "400", color: sub }}>
                (inc PPN)
              </span>
            </th>
            <th
              style={{
                ...thStyle(sub, border),
                borderBottom: "none",
                padding: "8px 14px",
                textAlign: "right",
              }}
            >
              Aksi
            </th>
          </tr>
        </thead>
        <tbody>
          {batches.map((b) => {
            const sev = expirySeverity(b.expired_date, isDarkMode);
            return (
              <tr key={b.id} style={{ borderTop: `1px solid ${border}` }}>
                <td
                  style={{
                    padding: "8px 14px",
                    color: text,
                    fontWeight: "600",
                  }}
                >
                  {b.batch_no || (
                    <em style={{ color: sub, fontWeight: "400" }}>
                      (tanpa no.)
                    </em>
                  )}
                </td>
                <td style={{ padding: "8px 14px" }}>
                  {b.expired_date ? (
                    sev.plain ? (
                      <span
                        style={{
                          color: sev.color,
                          fontWeight: "600",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {sev.label}
                      </span>
                    ) : (
                      <span
                        style={{
                          color: sev.color,
                          fontWeight: "600",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          background: sev.bg,
                          fontVariantNumeric: "tabular-nums",
                          display: "inline-block",
                        }}
                      >
                        {sev.label}
                      </span>
                    )
                  ) : (
                    <span style={{ color: sub }}>—</span>
                  )}
                </td>
                <td
                  style={{
                    padding: "8px 14px",
                    textAlign: "right",
                    color: text,
                    fontWeight: "600",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {b.qty_current} {baseUnit}
                  {packUnit && packSize > 1 && (
                    <div
                      style={{
                        fontSize: "10px",
                        color: sub,
                        fontWeight: "500",
                      }}
                    >
                      ={" "}
                      {(b.qty_current / packSize).toFixed(
                        b.qty_current % packSize === 0 ? 0 : 1,
                      )}{" "}
                      {packUnit}
                    </div>
                  )}
                </td>
                <td
                  style={{
                    padding: "8px 14px",
                    textAlign: "right",
                    color: sub,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {fmtRp(b.hna, 2)}
                </td>
                <td
                  style={{
                    padding: "8px 14px",
                    textAlign: "right",
                    color: sub,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {fmtRp(hppForBatch(b), 2)}
                </td>
                <td style={{ padding: "8px 14px", textAlign: "right" }}>
                  <div
                    className="ui-row-action"
                    style={{ display: "inline-flex", gap: "2px" }}
                  >
                    <IconBtn
                      onClick={() => onEditBatch?.(b)}
                      label="Edit batch"
                      Icon={Edit2}
                      color="var(--color-primary)"
                    />
                    <IconBtn
                      onClick={() => onAdjustBatch?.(b)}
                      label="Adjust qty batch"
                      Icon={AlertCircle}
                      color="var(--color-warning)"
                    />
                    <IconBtn
                      onClick={() => onDeleteBatch?.(b)}
                      label="Hapus batch"
                      Icon={Trash2}
                      color="var(--color-danger)"
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProductBatchPanel({
  product,
  batches,
  loading,
  sub,
  text,
  border,
  cardBg,
  surface,
  isDarkMode,
  onAddBatch,
  onEditBatch,
  onAdjustBatch,
  onDeleteBatch,
}) {
  const packSize = parseInt(product?.pack_size) || 1;
  const packUnit = product?.pack_unit;
  const baseUnit = product?.base_unit || product?.unit || "pcs";
  const rows = batches || [];

  if (loading)
    return (
      <p style={{ color: sub, fontSize: "13px", margin: 0 }}>Memuat batch...</p>
    );

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              color: text,
              fontSize: "13px",
              fontWeight: "700",
            }}
          >
            Batch produk
          </p>
          <p style={{ margin: "2px 0 0", color: sub, fontSize: "12px" }}>
            Edit no. batch, ED, HNA, notes, adjust qty, atau hapus batch
            langsung di sini.
          </p>
        </div>
        <button
          type="button"
          onClick={onAddBatch}
          className="btn-primary ui-motion-button ui-focus-ring"
          data-magnetic="true"
          style={{
            minHeight: "38px",
            padding: "0 14px",
            background: "var(--color-primary)",
            color: "#FFF",
            border: "none",
            borderRadius: "10px",
            fontWeight: "700",
            fontSize: "13px",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Batch Baru
        </button>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          compact
          icon={EmptyStateIcons.box}
          title="Belum ada batch untuk produk ini."
          description="Tambah batch baru untuk mulai mencatat stok fisik per produk."
          action={
            <button
              onClick={onAddBatch}
              className="btn-primary ui-motion-button ui-focus-ring"
              data-magnetic="true"
              style={{
                background: "var(--color-primary)",
                color: "#FFF",
                border: "none",
                padding: "10px 14px",
                borderRadius: "10px",
                cursor: "pointer",
                fontWeight: "700",
                fontSize: "12px",
              }}
            >
              + Batch Baru
            </button>
          }
        />
      ) : (
        <div
          className="ui-table-shell"
          style={{
            border: `1px solid ${border}`,
            borderRadius: "12px",
            overflow: "hidden",
            background: cardBg,
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "12px",
                minWidth: "620px",
              }}
            >
              <thead>
                <tr style={{ background: surface }}>
                  <th style={thStyle(sub, border)}>No. Batch</th>
                  <th style={thStyle(sub, border)}>ED</th>
                  <th style={{ ...thStyle(sub, border), textAlign: "right" }}>
                    Qty
                  </th>
                  <th style={{ ...thStyle(sub, border), textAlign: "right" }}>
                    HPP
                  </th>
                  <th style={thStyle(sub, border)}>Notes</th>
                  <th style={{ ...thStyle(sub, border), textAlign: "right" }}>
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => {
                  const sev = expirySeverity(b.expired_date, isDarkMode);
                  return (
                    <tr key={b.id} style={{ borderTop: `1px solid ${border}` }}>
                      <td
                        style={{
                          padding: "10px 14px",
                          color: text,
                          fontWeight: "700",
                        }}
                      >
                        {b.batch_no || (
                          <em style={{ color: sub, fontWeight: "400" }}>
                            (tanpa no.)
                          </em>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {b.expired_date ? (
                          <span
                            style={{
                              color: sev.color,
                              background: sev.plain ? "transparent" : sev.bg,
                              padding: sev.plain ? 0 : "3px 8px",
                              borderRadius: "6px",
                              fontWeight: "700",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {sev.label}
                          </span>
                        ) : (
                          <span style={{ color: sub }}>—</span>
                        )}
                      </td>
                      <td
                        style={{
                          padding: "10px 14px",
                          textAlign: "right",
                          color: text,
                          fontWeight: "700",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {b.qty_current} {baseUnit}
                        {packUnit && packSize > 1 && (
                          <div
                            style={{
                              color: sub,
                              fontSize: "10px",
                              fontWeight: "500",
                            }}
                          >
                            {(b.qty_current / packSize).toFixed(
                              b.qty_current % packSize === 0 ? 0 : 1,
                            )}{" "}
                            {packUnit}
                          </div>
                        )}
                      </td>
                      <td
                        style={{
                          padding: "10px 14px",
                          textAlign: "right",
                          color: text,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {fmtRp(hppForBatch(b), 2)}
                      </td>
                      <td
                        style={{
                          padding: "10px 14px",
                          color: sub,
                          maxWidth: "160px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {b.notes || "—"}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "2px" }}>
                          <IconBtn
                            onClick={() => onEditBatch(b)}
                            label="Edit batch"
                            Icon={Edit2}
                            color="var(--color-primary)"
                          />
                          <IconBtn
                            onClick={() => onAdjustBatch(b)}
                            label="Adjust qty batch"
                            Icon={AlertCircle}
                            color="var(--color-warning)"
                          />
                          <IconBtn
                            onClick={() => onDeleteBatch(b)}
                            label="Hapus batch"
                            Icon={Trash2}
                            color="var(--color-danger)"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ModalShell({
  onClose,
  cardBg,
  title,
  titleColor,
  text,
  border,
  sub,
  isMobile,
  maxWidth = "480px",
  hidden = false,
  children,
}) {
  useEffect(() => {
    if (hidden) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, hidden]);
  return (
    <div
      onClick={(e) => !hidden && e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.6)",
        display: hidden ? "none" : "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: isMobile ? 0 : "1rem",
      }}
    >
      <div
        className="ui-motion-modal ui-modal-shell"
        style={{
          backgroundColor: cardBg,
          borderRadius: isMobile ? 0 : "16px",
          width: "100%",
          maxWidth,
          maxHeight: isMobile ? "100%" : "90vh",
          overflow: "auto",
          boxShadow: "0 32px 64px rgba(0,0,0,0.35)",
          height: isMobile ? "100%" : "auto",
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
            backgroundColor: cardBg,
            zIndex: 1,
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: "16px",
              fontWeight: "700",
              color: titleColor || text,
            }}
          >
            {title}
          </h3>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="ui-motion-button ui-focus-ring"
            style={{
              background: "transparent",
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
            <Icons.X size={18} color={sub} />
          </button>
        </div>
        <div style={{ padding: "20px 22px" }}>{children}</div>
      </div>
    </div>
  );
}
