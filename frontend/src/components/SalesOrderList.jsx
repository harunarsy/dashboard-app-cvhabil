import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import {
  Plus,
  Trash2,
  X,
  FileText,
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import {
  salesAPI,
  customersAPI,
  inventoryAPI,
  printSettingsAPI,
  countersAPI,
  settingsAPI,
  priceListAPI,
  insightsAPI,
} from "../services/api";
import {
  getProductUnits,
  formatQtyWithConversion,
  isPackUnit,
  resolveTierPrice,
  toBase,
} from "../constants/units";
import { hppFromHna, hnaFromHpp } from "../utils/rupiah";
import MasterSelect from "./MasterSelect";
import Skeleton from "./common/Skeleton";
import ConfirmModal from "./common/ConfirmModal";
import Breadcrumb from "./common/Breadcrumb";
import NotaPreview from "./common/NotaPreview";
import EmptyState, { EmptyStateIcons } from "./common/EmptyState";
import Icons from "./common/Icon";
import { UI_MOTION, uiTransition } from "../constants/ui";
import useBodyScrollLock from "../hooks/useBodyScrollLock";
import FieldError from "./common/FieldError";
import SearchBox from "./common/SearchBox";
import ToastNotice from "./common/ToastNotice";
import useDebouncedValue from "../hooks/useDebouncedValue";
import {
  buildNotaWaMessage,
  buildWaUrl,
  copyTextToClipboard,
} from "../utils/waMessage";

const renderPortal = (node) =>
  typeof document === "undefined" ? node : createPortal(node, document.body);

const formatRelativeTime = (dateStr) => {
  if (!dateStr) return "baru saja";
  const diffMs = Date.now() - new Date(dateStr).getTime();
  if (!Number.isFinite(diffMs)) return "baru saja";
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.round(hours / 24);
  return `${days} hari lalu`;
};

if (
  typeof document !== "undefined" &&
  !document.getElementById("habil-pulse-style")
) {
  const s = document.createElement("style");
  s.id = "habil-pulse-style";
  s.textContent = "@keyframes habil-pulse{0%,100%{opacity:1}50%{opacity:0.35}}";
  document.head.appendChild(s);
}

const fmtRp = (n) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(n || 0);
const fmtKg = (gram) =>
  (Math.max(0, gram || 0) / 1000).toLocaleString("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "-";
const addDays = (dateStr, n) => {
  const base = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
  base.setDate(base.getDate() + n);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
};
const notaDaysDiff = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((d - now) / 86400000);
};

const blankItem = () => ({
  product_name: "",
  qty: 1,
  unit: "pcs",
  unit_price: 0,
  unit_hpp: 0,
  unit_hpp_tax_type: "faktur",
});
// v1.22.0: batch nota = harga beli riil (tanpa PPN) → HPP tidak dikali 1,11.
const hppIncFor = (it) =>
  it?.unit_hpp_tax_type === "nota"
    ? parseFloat(it?.unit_hpp) || 0
    : hppFromHna(parseFloat(it?.unit_hpp) || 0);
// v1.23.2: sales_items.qty = base unit/pcs, qty_in_unit = qty yang user input
// di nota. Form/list money harus pakai qty_in_unit supaya 3 karton tidak mental
// jadi 36 karton ketika nota dibuka ulang.
const saleItemDisplayQty = (it) => parseFloat(it?.qty_in_unit ?? it?.qty) || 0;
const computeNotaMargin = (order) => {
  const items = order.items || [];
  const itemRevenue = items.reduce(
    (s, it) => s + (parseFloat(it.unit_price) || 0) * saleItemDisplayQty(it),
    0,
  );
  const itemMargin = items.reduce(
    (s, it) =>
      s +
      ((parseFloat(it.unit_price) || 0) - hppIncFor(it)) *
        saleItemDisplayQty(it),
    0,
  );
  // v1.21.14: ongkir ikut revenue & margin (untung ongkir = ditagih - biaya asli)
  const ongkir = parseFloat(order.ongkir) || 0;
  const ongkirCost = parseFloat(order.ongkir_cost) || 0;
  // v1.25.1: fee kartu kredit mode absorb motong margin; pass_on netral
  // (fee dibayar customer lalu dipotong provider — tidak menyentuh margin)
  const paymentFee =
    order.payment_fee_mode === "absorb" ? parseFloat(order.payment_fee) || 0 : 0;
  const revenue = itemRevenue + ongkir;
  const margin = itemMargin + (ongkir - ongkirCost) - paymentFee;
  const pct = revenue > 0 ? (margin / revenue) * 100 : 0;
  return { revenue, margin, pct };
};
const DEFAULT_PROFIT_THRESHOLDS = { high: 20, normal: 5, thin: 0 };
const normalizeProfitThresholds = (thresholds = {}) => {
  const safeValues = [thresholds.thin, thresholds.normal, thresholds.high]
    .map((value, idx) => {
      const parsed = parseFloat(value);
      const fallback = [
        DEFAULT_PROFIT_THRESHOLDS.thin,
        DEFAULT_PROFIT_THRESHOLDS.normal,
        DEFAULT_PROFIT_THRESHOLDS.high,
      ][idx];
      return Number.isFinite(parsed) ? parsed : fallback;
    })
    .sort((a, b) => a - b);
  return { thin: safeValues[0], normal: safeValues[1], high: safeValues[2] };
};
const formatProfitPct = (value) =>
  `${(parseFloat(value) || 0).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;

export default function SalesOrderList({
  isDarkMode,
  isSidebarOpen,
  isMobile,
  isVantaMode,
}) {
  const [orders, setOrders] = useState([]);
  // v1.7.0 multi-select bulk export
  const [selectedNotaIds, setSelectedNotaIds] = useState(new Set());
  const [exportingPdf, setExportingPdf] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [profitThresholds, setProfitThresholds] = useState(
    DEFAULT_PROFIT_THRESHOLDS,
  );
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [showModal, setShowModal] = useState(false);
  // Auto-buka modal create saat datang dari Akses Cepat Dashboard (state quickCreate).
  const location = useLocation();
  useEffect(() => {
    if (location.state?.quickCreate) {
      setShowModal(true);
      window.history.replaceState({}, document.title); // cegah re-open saat reload/back
    }
  }, [location.state]);
  // Mobile: form & preview tidak muat berdampingan → tab; filter dilipat default
  const [formTab, setFormTab] = useState("form"); // 'form' | 'preview'
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  useEffect(() => {
    if (showModal) setFormTab("form");
  }, [showModal]);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [printOrder, setPrintOrder] = useState(null);
  const [printOptions, setPrintOptions] = useState({
    format: "A5",
    type: "nota",
  });
  const [layoutSettings, setLayoutSettings] = useState(null);
  const [editId, setEditId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [toast, setToast] = useState("");
  const [toastType, setToastType] = useState("success");
  const [loading, setLoading] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [paymentModal, setPaymentModal] = useState({
    open: false,
    order: null,
    date: "",
    mode: "pay",
  });
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Filters
  const [filterMonth, setFilterMonth] = useState("all");
  const [filterYear, setFilterYear] = useState("all");

  // Form state
  const [isAutoNota, setIsAutoNota] = useState(true);
  const [manualNumber, setManualNumber] = useState("");
  const [notaCounter, setNotaCounter] = useState({
    prefix: "NT",
    last_number: 0,
  });
  const numberInputRef = useRef(null);
  const [form, setForm] = useState({
    order_number: "",
    customer_name: "",
    customer_phone: "",
    customer_address: "",
    sale_date: new Date().toISOString().split("T")[0],
    notes: "",
    payment_method: "Tunai",
    payment_details: "",
    channel: "offline",
    due_date: "",
    payment_terms: null,
    ongkir: "",
    ongkir_cost: "",
    package_weight_gram: "",
    // v1.25.1: fee kartu kredit — rate dalam %, mode absorb (potong margin) / pass_on (bebankan customer)
    payment_fee_rate: "",
    payment_fee_mode: "absorb",
  });
  const [items, setItems] = useState([blankItem()]);
  const [itemBatches, setItemBatches] = useState([]);
  const [customerInsights, setCustomerInsights] = useState([]);
  const [customerInsightsLoading, setCustomerInsightsLoading] = useState(false);
  const [addingInsightProduct, setAddingInsightProduct] = useState("");
  // v1.28.0: #10 sering dibeli bersama + #3 anomali qty + #1 save-guard rugi
  const [copurchaseMap, setCopurchaseMap] = useState({}); // lowername -> [{name,confidence}]
  const [salesBaselines, setSalesBaselines] = useState({}); // name||cust -> {n_samples,qty_mean,qty_std}
  const [lossConfirm, setLossConfirm] = useState(null); // array item rugi sebelum simpan
  const copurFetchingRef = useRef({});
  const baseFetchingRef = useRef({});
  // v1.26.0: ✨ Harga Pintar — peta harga Daftar Harga per saluran; saat produk
  // dipilih di form, harga jual auto-isi sesuai saluran nota (offline/online)
  const [priceMap, setPriceMap] = useState({});
  useEffect(() => {
    priceListAPI
      .getAll()
      .then((r) => {
        const m = {};
        (r.data || []).forEach((p) => {
          m[p.id] = {
            offline: parseFloat(p.list_price) > 0 ? parseFloat(p.list_price) : null,
            shopee: parseFloat(p.shopee_price) > 0 ? parseFloat(p.shopee_price) : null,
            tokopedia_tiktok: parseFloat(p.tokopedia_price) > 0 ? parseFloat(p.tokopedia_price) : null,
          };
        });
        setPriceMap(m);
      })
      .catch(() => {});
  }, []);
  // v1.25.1: default fee kartu kredit dari profil Biaya Admin (offline/credit_card)
  const [ccDefaultRatePct, setCcDefaultRatePct] = useState(2.5);
  useEffect(() => {
    priceListAPI
      .getFeeProfiles()
      .then((r) => {
        const cc = (r.data || []).find(
          (p) => p.platform === "offline" && p.category_key === "credit_card",
        );
        const ratePct = cc ? parseFloat(cc.safe_effective_fee_rate) * 100 : 0;
        if (ratePct > 0) setCcDefaultRatePct(+ratePct.toFixed(3));
      })
      .catch(() => {});
  }, []);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const toastTimerRef = useRef(null);

  // v1.23.0: draft form nota — autosave WIP form Buat Nota (mirror draft faktur).
  const [draftBanner, setDraftBanner] = useState(false);
  const [savedDraft, setSavedDraft] = useState(null);
  const [savedDraftUpdatedAt, setSavedDraftUpdatedAt] = useState(null);
  const draftDebounceRef = useRef(null);
  const lastDraftSnapRef = useRef("");

  const bg = "var(--color-bg)";
  const cardBg = "var(--color-surface)";
  const border = "var(--color-border)";
  const text = "var(--color-text)";
  const sub = "var(--color-text-muted)";
  const selectedCustomer = customers.find((c) => c.name === form.customer_name);
  useBodyScrollLock(showModal || showPrintModal || !!deleteConfirmId);
  useEffect(() => {
    if (!showModal || !selectedCustomer?.id) {
      setCustomerInsights([]);
      setCustomerInsightsLoading(false);
      return;
    }
    let cancelled = false;
    setCustomerInsightsLoading(true);
    insightsAPI
      .getCustomer(selectedCustomer.id, { limit: 6 })
      .then((res) => {
        if (cancelled) return;
        setCustomerInsights(res.data?.usually_buys || []);
      })
      .catch((e) => {
        if (!cancelled) {
          console.error("Customer insight fetch failed:", e);
          setCustomerInsights([]);
        }
      })
      .finally(() => {
        if (!cancelled) setCustomerInsightsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showModal, selectedCustomer?.id]);

  // v1.28.0: #10 co-purchase + #3 baseline qty per produk di form (fetch sekali/produk).
  useEffect(() => {
    if (!showModal) return;
    const names = [
      ...new Set(items.map((it) => it.product_name?.trim()).filter(Boolean)),
    ];
    if (!names.length) return;
    const cust = (form.customer_name || "").trim();
    names.forEach((nm) => {
      const ck = nm.toLowerCase();
      if (!(ck in copurchaseMap) && !copurFetchingRef.current[ck]) {
        copurFetchingRef.current[ck] = true;
        insightsAPI
          .getCopurchase(nm)
          .then(({ data }) =>
            setCopurchaseMap((prev) => ({ ...prev, [ck]: data?.items || [] })),
          )
          .catch(() => {})
          .finally(() => {
            copurFetchingRef.current[ck] = false;
          });
      }
      const bk = `${ck}||${cust.toLowerCase()}`;
      if (!(bk in salesBaselines) && !baseFetchingRef.current[bk]) {
        baseFetchingRef.current[bk] = true;
        insightsAPI
          .getSalesBaseline(nm, cust)
          .then(({ data }) => setSalesBaselines((prev) => ({ ...prev, [bk]: data })))
          .catch(() => {})
          .finally(() => {
            baseFetchingRef.current[bk] = false;
          });
      }
    });
  }, [items, showModal, form.customer_name, copurchaseMap, salesBaselines]);
  useEffect(() => {
    if (!showModal && !showPrintModal && !paymentModal.open) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (paymentModal.open) {
        setPaymentModal({ open: false, order: null, date: "", mode: "pay" });
        return;
      }
      if (showPrintModal) {
        setShowPrintModal(false);
        return;
      }
      if (showModal) {
        setShowModal(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [paymentModal.open, showModal, showPrintModal]);
  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    [],
  );
  const labelStyle = {
    display: "block",
    fontSize: "12px",
    fontWeight: "700",
    color: sub,
    marginBottom: "8px",
    textTransform: "uppercase",
  };

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const { data } = await salesAPI.getAll();
      setOrders(data);
    } catch (e) {
      console.error(e);
      // AUDIT-UX-06: tanpa ini layar tampil "belum ada nota" palsu saat backend down
      flash("Gagal memuat daftar nota — cek koneksi lalu muat ulang halaman", "error");
    } finally {
      setTimeout(() => setLoading(false), UI_MOTION.duration.loading);
    }
  };
  const fetchCustomers = async () => {
    try {
      const { data } = await customersAPI.getAll();
      setCustomers(data);
    } catch (e) {
      console.error(e);
    }
  };
  const fetchProducts = async () => {
    try {
      const { data } = await inventoryAPI.getProducts();
      // v1.21.14: ONGKIR jadi field nota (legacy product disembunyikan dari pemilih produk)
      setProducts(
        (data || []).filter(
          (p) => (p.name || "").trim().toUpperCase() !== "ONGKIR",
        ),
      );
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
  const fetchProfitThresholds = async () => {
    try {
      const { data } = await settingsAPI.getProfitThresholds();
      const raw = data?.profit_thresholds || data || {};
      setProfitThresholds({
        high: Number.isFinite(parseFloat(raw.high))
          ? parseFloat(raw.high)
          : DEFAULT_PROFIT_THRESHOLDS.high,
        normal: Number.isFinite(parseFloat(raw.normal))
          ? parseFloat(raw.normal)
          : DEFAULT_PROFIT_THRESHOLDS.normal,
        thin: Number.isFinite(parseFloat(raw.thin))
          ? parseFloat(raw.thin)
          : DEFAULT_PROFIT_THRESHOLDS.thin,
      });
    } catch (e) {
      console.error(e);
    }
  };
  const fetchCounters = async () => {
    try {
      const { data } = await countersAPI.getAll();
      const nt = data.find((c) => c.doc_type === "NOTA");
      if (nt) setNotaCounter(nt);
    } catch (e) {
      console.error(e);
    }
  };

  const openPaymentModal = (order) => {
    const today = new Date().toISOString().split("T")[0];
    const existingDate = order.paid_at
      ? new Date(order.paid_at).toISOString().split("T")[0]
      : today;
    setPaymentModal({
      open: true,
      order,
      date: order.payment_status === "paid" ? existingDate : today,
      mode: order.payment_status === "paid" ? "edit" : "pay",
    });
  };

  const handlePaymentSave = async () => {
    if (!paymentModal.order || !paymentModal.date) return;
    setPaymentSaving(true);
    try {
      await salesAPI.updatePaymentStatus(
        paymentModal.order.id,
        "paid",
        paymentModal.date,
      );
      flash("Tanggal pelunasan disimpan");
      setPaymentModal({ open: false, order: null, date: "", mode: "pay" });
      fetchOrders();
    } catch (e) {
      flash(e.response?.data?.error || e.message, "error");
    } finally {
      setPaymentSaving(false);
    }
  };

  const handlePaymentUnpay = async () => {
    if (!paymentModal.order) return;
    setPaymentSaving(true);
    try {
      await salesAPI.updatePaymentStatus(paymentModal.order.id, "unpaid");
      flash("Status dikembalikan ke Belum Bayar");
      setPaymentModal({ open: false, order: null, date: "", mode: "pay" });
      fetchOrders();
    } catch (e) {
      flash(e.response?.data?.error || e.message, "error");
    } finally {
      setPaymentSaving(false);
    }
  };

  // Customer CRUD Handlers
  const handleAddCustomer = async (name) => {
    try {
      await customersAPI.create({ name, address: "" });
      flash("Customer ditambahkan");
      fetchCustomers();
    } catch (e) {
      flash(e.response?.data?.error || e.message, "error");
    }
  };

  const handleRemoveCustomer = async (name) => {
    try {
      const customer = customers.find((c) => c.name === name);
      if (customer) {
        await customersAPI.remove(customer.id);
        flash("Customer dihapus");
        fetchCustomers();
      }
    } catch (e) {
      flash(e.response?.data?.error || e.message, "error");
    }
  };

  const handleRenameCustomer = async (oldName, newName) => {
    try {
      const customer = customers.find((c) => c.name === oldName);
      if (customer) {
        await customersAPI.update(customer.id, {
          name: newName,
          address: customer.address || "",
        });
        flash("Customer diubah");
        fetchCustomers();
      }
    } catch (e) {
      flash(e.response?.data?.error || e.message, "error");
    }
  };

  // Product CRUD Handlers
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

  useEffect(() => {
    fetchOrders();
    fetchCustomers();
    fetchProducts();
    fetchSettings();
    fetchProfitThresholds();
    fetchCounters();
    checkDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkDraft = async () => {
    try {
      const r = await salesAPI.getDraft();
      if (r.data?.draft_data?.form) {
        setSavedDraft(r.data.draft_data);
        setSavedDraftUpdatedAt(r.data.updated_at || null);
        setDraftBanner(true);
      }
    } catch (e) {
      console.error("Error checking nota draft:", e);
    }
  };

  // Autosave draft — HANYA form Buat baru (mode edit tidak boleh menimpa draft).
  // Optimasi vs draft faktur lama: skip form kosong + skip kalau isi tidak
  // berubah sejak save terakhir (hemat request, serverless tidak dibangunin).
  useEffect(() => {
    if (!showModal || editId) return;
    const hasContent =
      form.customer_name?.trim() ||
      form.notes?.trim() ||
      items.some((i) => i.product_name?.trim());
    if (!hasContent) return;
    const snap = JSON.stringify({ form, items });
    if (snap === lastDraftSnapRef.current) return;
    if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current);
    draftDebounceRef.current = setTimeout(() => {
      lastDraftSnapRef.current = snap;
      salesAPI.saveDraft({ form, items }).catch((err) => {
        console.error("Error autosaving nota draft:", err);
      });
    }, UI_MOTION.duration.draftDebounce);
    return () => clearTimeout(draftDebounceRef.current);
  }, [form, items, showModal, editId]);

  const loadDraft = () => {
    if (!savedDraft?.form) return;
    fetchCounters();
    setIsAutoNota(true);
    setManualNumber("");
    setEditId(null);
    setForm((prev) => ({ ...prev, ...savedDraft.form, order_number: "" }));
    const draftItems = savedDraft.items?.length
      ? savedDraft.items
      : [blankItem()];
    setItems(draftItems);
    setItemBatches(draftItems.map(() => []));
    setDraftBanner(false);
    lastDraftSnapRef.current = "";
    setShowModal(true);
  };

  const dismissDraft = async () => {
    try {
      await salesAPI.clearDraft();
    } catch (e) {
      console.error("Error clearing nota draft on dismiss:", e);
    }
    setSavedDraft(null);
    setSavedDraftUpdatedAt(null);
    setDraftBanner(false);
    lastDraftSnapRef.current = "";
  };

  // Filters
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterChannel, setFilterChannel] = useState("all");
  const [filterProfit, setFilterProfit] = useState("all");
  const [sortKey, setSortKey] = useState("sale_date"); // 'sale_date' | 'total' | 'order_number'
  const [sortDir, setSortDir] = useState("desc"); // 'asc' | 'desc'
  const activeProfitThresholds = normalizeProfitThresholds(profitThresholds);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const filtered = orders
    .filter((o) => {
      const orderDate = new Date(o.sale_date);
      const q = debouncedSearch.toLowerCase();
      const matchesSearch =
        o.order_number.toLowerCase().includes(q) ||
        o.customer_name.toLowerCase().includes(q);
      const isAllMonth = String(filterMonth) === "all";
      const isAllYear = String(filterYear) === "all";
      const matchesMonth =
        isAllMonth || orderDate.getMonth() + 1 === parseInt(filterMonth, 10);
      const matchesYear =
        isAllYear || orderDate.getFullYear() === parseInt(filterYear, 10);
      const matchesStatus =
        filterStatus === "all" || o.payment_status === filterStatus;
      const matchesChannel =
        filterChannel === "all" || (o.channel || "offline") === filterChannel;
      const { pct } = computeNotaMargin(o);
      const matchesProfit =
        filterProfit === "all" ||
        (filterProfit === "high" && pct > activeProfitThresholds.high) ||
        (filterProfit === "normal" &&
          pct >= activeProfitThresholds.normal &&
          pct <= activeProfitThresholds.high) ||
        (filterProfit === "thin" &&
          pct >= activeProfitThresholds.thin &&
          pct < activeProfitThresholds.normal) ||
        (filterProfit === "loss" && pct < activeProfitThresholds.thin);
      return (
        matchesSearch &&
        matchesMonth &&
        matchesYear &&
        matchesStatus &&
        matchesChannel &&
        matchesProfit
      );
    })
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "sale_date")
        return (new Date(a.sale_date) - new Date(b.sale_date)) * dir;
      if (sortKey === "total")
        return ((parseFloat(a.total) || 0) - (parseFloat(b.total) || 0)) * dir;
      if (sortKey === "order_number")
        return (
          String(a.order_number).localeCompare(String(b.order_number)) * dir
        );
      return 0;
    });

  const openAdd = () => {
    // v1.8.4: refetch counter biar preview Auto field selalu fresh (handle delete/concurrent)
    fetchCounters();
    setIsAutoNota(true);
    setManualNumber("");
    setEditId(null);
    setForm({
      order_number: "",
      customer_name: "",
      customer_phone: "",
      customer_address: "",
      sale_date: new Date().toISOString().split("T")[0],
      notes: "",
      payment_method: "Tunai",
      payment_details: "",
      channel: "offline",
      due_date: "",
      payment_terms: null,
      ongkir: "",
      ongkir_cost: "",
      package_weight_gram: "",
      payment_fee_rate: "",
      payment_fee_mode: "absorb",
    });
    setItems([blankItem()]);
    setItemBatches([]);
    setShowModal(true);
  };

  const openEdit = async (order) => {
    setEditId(order.id);
    setForm({
      order_number: order.order_number,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone || "",
      customer_address: order.customer_address || "",
      sale_date: order.sale_date ? order.sale_date.split("T")[0] : "",
      notes: order.notes || "",
      payment_method: order.payment_method || "Tunai",
      payment_details: order.payment_details || "",
      channel: order.channel || "offline",
      due_date: order.due_date ? order.due_date.split("T")[0] : "",
      payment_terms: order.payment_terms || null,
      ongkir: parseFloat(order.ongkir) > 0 ? String(parseFloat(order.ongkir)) : "",
      ongkir_cost: parseFloat(order.ongkir_cost) > 0 ? String(parseFloat(order.ongkir_cost)) : "",
      package_weight_gram:
        parseInt(order.package_weight_gram) > 0
          ? String(parseInt(order.package_weight_gram))
          : "",
      payment_fee_rate:
        parseFloat(order.payment_fee_rate) > 0
          ? String(+(parseFloat(order.payment_fee_rate) * 100).toFixed(3))
          : "",
      payment_fee_mode: order.payment_fee_mode === "pass_on" ? "pass_on" : "absorb",
    });
    // v1.8.1: include batch snapshot fields supaya batch picker bisa pre-fill
    // v1.16.2: tambah _selected_batch_id untuk lookup berbasis id
    const editItems = order.items?.length
      ? order.items.map((i) => ({
          product_name: i.product_name,
          qty: saleItemDisplayQty(i),
          unit: i.unit || "pcs",
          unit_price: parseFloat(i.unit_price) || 0,
          unit_hpp: parseFloat(i.unit_hpp) || 0,
          unit_hpp_tax_type: i.unit_hpp_tax_type === "nota" ? "nota" : "faktur",
          _selected_batch_id: i.batch_id_snapshot || null,
          _selected_batch: i.batch_no_snapshot || "",
          batch_no_snapshot: i.batch_no_snapshot,
          expired_date_snapshot: i.expired_date_snapshot,
        }))
      : [blankItem()];
    setItems(editItems);
    setItemBatches(editItems.map(() => []));
    setShowModal(true);

    // v1.8.1: re-fetch batches per item supaya dropdown bisa render + match snapshot
    // v1.16.2: gunakan getProductBatches agar batch historis (stok 0 / expired) ikut termuat
    if (order.items?.length) {
      for (let idx = 0; idx < order.items.length; idx++) {
        const item = order.items[idx];
        const prod = products.find(
          (p) => p.name?.toLowerCase() === item.product_name?.toLowerCase(),
        );
        if (!prod) continue;
        try {
          // Gunakan getProductBatches yang mengembalikan SEMUA batch (termasuk stok 0 & expired)
          const { data: allBatches } = await inventoryAPI.getProductBatches(
            prod.id,
          );
          let batches = allBatches || [];
          // v1.16.3: resolusi snapshot batch — coba match dulu, baru synthetic fallback
          let matchedBatch = null;
          if (item.batch_id_snapshot) {
            // a) Match by batch_id_snapshot (id integer)
            matchedBatch = batches.find(
              (b) => String(b.id) === String(item.batch_id_snapshot),
            );
          }
          if (!matchedBatch && item.batch_no_snapshot && item.expired_date_snapshot) {
            // b) Match by batch_no_snapshot + expired_date_snapshot
            matchedBatch = batches.find(
              (b) =>
                b.batch_no === item.batch_no_snapshot &&
                b.expired_date === item.expired_date_snapshot,
            );
          }
          if (!matchedBatch && item.batch_no_snapshot) {
            // c) Match by batch_no_snapshot only
            matchedBatch = batches.find(
              (b) => b.batch_no === item.batch_no_snapshot,
            );
          }
          if (matchedBatch) {
            // Update item fields from matched batch.
            // v1.23.1: batch.hna = per pcs — kalau unit nota karton/pack, HPP
            // WAJIB dikali pack_size (dulu ketimpa per-pcs → margin overstate
            // gila-gilaan tiap nota karton dibuka di Edit lalu disimpan).
            const editIsPack = isPackUnit(item.unit, prod);
            const editPackSize = parseInt(prod.pack_size) || 1;
            setItems((prev) => {
              const n = [...prev];
              if (n[idx]) {
                n[idx] = {
                  ...n[idx],
                  _selected_batch_id: matchedBatch.id,
                  _selected_batch: matchedBatch.batch_no,
                  batch_no_snapshot: matchedBatch.batch_no,
                  expired_date_snapshot: matchedBatch.expired_date,
                  unit_hpp:
                    (parseFloat(matchedBatch.hna) || 0) *
                    (editIsPack ? editPackSize : 1),
                  unit_hpp_tax_type:
                    matchedBatch.tax_type === "nota" ? "nota" : "faktur",
                };
              }
              return n;
            });
          } else if (item.batch_no_snapshot) {
            // Tidak ada match — buat synthetic entry.
            // hna batch = per pcs: unit_hpp per-karton harus dibagi pack_size
            // (kalau tidak, re-pilih batch ini dari dropdown bikin double-scale).
            const legacyIsPack = isPackUnit(item.unit, prod);
            const legacyPackSize = parseInt(prod.pack_size) || 1;
            batches = [
              ...batches,
              {
                id: `legacy-${item.batch_no_snapshot}`,
                batch_no: item.batch_no_snapshot,
                expired_date: item.expired_date_snapshot,
                qty_current: 0,
                hna:
                  (parseFloat(item.unit_hpp) || 0) /
                  (legacyIsPack ? legacyPackSize : 1),
              },
            ];
            setItems((prev) => {
              const n = [...prev];
              if (n[idx]) {
                n[idx] = {
                  ...n[idx],
                  _selected_batch_id: `legacy-${item.batch_no_snapshot}`,
                  _selected_batch: item.batch_no_snapshot,
                };
              }
              return n;
            });
          }
          setItemBatches((prev) => {
            const n = [...prev];
            n[idx] = batches;
            return n;
          });
          // Cache product reference di item (untuk consistency dgn updateItem product flow)
          setItems((prev) => {
            const n = [...prev];
            if (n[idx]) n[idx] = { ...n[idx], _product: prod };
            return n;
          });
        } catch (e) {
          console.error("Batch fetch failed for item idx", idx, e);
          /* dropdown akan kosong → fallback Auto FEFO */
        }
      }
    }
  };

  const handleSave = async (skipLossGuard = false) => {
    setSaveError("");
    const errors = {};
    if (!form.customer_name.trim())
      errors.customer_name = "Customer wajib diisi";
    const validItems = items.filter((i) => i.product_name.trim());
    if (!validItems.length) errors.items = "Minimal 1 produk harus ditambahkan";
    if (!isAutoNota && !manualNumber && !editId)
      errors.order_number = "Nomor Nota wajib diisi (mode Manual)";
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    // #1 Penjaga Harga Rugi: kalau ada item di bawah HPP, konfirmasi dulu (non-blocking).
    if (!skipLossGuard) {
      const lossItems = validItems.filter((it) => {
        const price = parseFloat(it.unit_price) || 0;
        const hpp = hppIncFor(it);
        return price > 0 && hpp > 0 && price < hpp;
      });
      if (lossItems.length) {
        setLossConfirm(lossItems);
        return;
      }
    }

    setSaving(true);
    try {
      const payload = { ...form, items: validItems };
      payload.package_weight_gram = Math.max(
        0,
        parseInt(form.package_weight_gram) || 0,
      );
      // v1.25.1: rate fee di form dalam % → backend pakai desimal; hanya kirim
      // kalau metode Kartu Kredit (metode lain tanpa fee)
      payload.payment_fee_rate =
        form.payment_method === "Kartu Kredit"
          ? (parseFloat(form.payment_fee_rate) || 0) / 100
          : 0;
      payload.payment_fee_mode = form.payment_fee_mode || "absorb";
      // v1.16.2: map batch fields ke payload (selected_batch_id, batch_id_snapshot, dll)
      payload.items = payload.items.map((i) => ({
        ...i,
        selected_batch_id: i._selected_batch_id || null,
        batch_id_snapshot: i._selected_batch_id || null,
        batch_no_snapshot: i.batch_no_snapshot || i._selected_batch || null,
        expired_date_snapshot: i.expired_date_snapshot || null,
        unit_hpp: parseFloat(i.unit_hpp) || 0,
      }));
      if (!isAutoNota && !editId) {
        payload.order_number = notaCounter.prefix + manualNumber;
      }
      if (isAutoNota && !editId) {
        delete payload.order_number;
      }
      if (editId) {
        await salesAPI.update(editId, { ...payload, status: "final" });
        flash("Nota diperbarui");
      } else {
        await salesAPI.create(payload);
        try {
          await salesAPI.clearDraft();
        } catch (e) {
          console.error("Error clearing nota draft after save:", e);
        }
        setSavedDraft(null);
        setSavedDraftUpdatedAt(null);
        setDraftBanner(false);
        lastDraftSnapRef.current = "";
        flash("Nota berhasil dibuat");
        fetchCounters();
      }
      setShowModal(false);
      fetchOrders();
    } catch (e) {
      setSaveError(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id) => setDeleteConfirmId(id);
  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await salesAPI.remove(deleteConfirmId);
      flash("Nota dihapus");
      fetchOrders();
      fetchCounters(); // v1.8.4: re-sync preview ke MAX setelah delete
    } catch (e) {
      flash(e.response?.data?.error || e.message, "error");
    } finally {
      setDeleteConfirmId(null);
    }
  };

  // AUDIT-UX-02: error jangan tampil sebagai toast sukses — operator bisa mengira berhasil
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

  const handlePrintPDF = async () => {
    if (!printOrder || pdfLoading) return;
    setPdfLoading(true);
    try {
      const { generateNotaPDF } = await import("../utils/generateNotaPDF");
      const doc = generateNotaPDF(printOrder, {
        ...printOptions,
        settings: layoutSettings,
      });
      doc.save(
        `${printOptions.type === "terima" ? "TT" : "Nota"}_${printOrder.order_number}.pdf`,
      );
      await salesAPI.updatePdfStatus(printOrder.id, "sudah_dicetak");
      flash("PDF berhasil diunduh");
      setShowPrintModal(false);
      fetchOrders();
    } catch (e) {
      flash("Gagal membuat PDF: " + e.message, "error");
    } finally {
      setPdfLoading(false);
    }
  };

  const openPrintOptions = (order) => {
    setPrintOrder(order);
    setShowPrintModal(true);
  };

  const addItem = () => {
    setItems([...items, blankItem()]);
    setItemBatches([...itemBatches, []]);
  };
  const removeItem = (idx) => {
    setItems(items.filter((_, i) => i !== idx));
    setItemBatches(itemBatches.filter((_, i) => i !== idx));
  };

  const prepareProductItem = async (productName, fallback = {}) => {
    const prepared = {
      ...blankItem(),
      product_name: productName,
      unit: fallback.last_unit || "pcs",
      unit_price: parseFloat(fallback.last_unit_price) || 0,
    };
    const match = products.find(
      (p) => p.name?.toLowerCase() === productName?.toLowerCase(),
    );
    if (!match) return { item: prepared, batches: [] };

    prepared.unit_price =
      parseFloat(match.sell_price) || prepared.unit_price || 0;
    const smartPrice = priceMap[match.id];
    const channelPrice =
      form.channel === "online"
        ? smartPrice?.shopee ?? smartPrice?.tokopedia_tiktok ?? null
        : smartPrice?.offline ?? null;
    if (channelPrice > 0) prepared.unit_price = channelPrice;
    prepared.unit = match.base_unit || match.unit || prepared.unit || "pcs";
    prepared._product_id = match.id;

    try {
      const [batchesResp, tiersResp] = await Promise.all([
        inventoryAPI.getAvailableBatches(match.id),
        inventoryAPI.getProductTiers(match.id).catch(() => ({ data: [] })),
      ]);
      const batches = batchesResp.data || [];
      const tiers = tiersResp.data || [];
      prepared._product = { ...match, price_tiers: tiers };
      if (batches.length > 0) {
        prepared.unit_hpp = parseFloat(batches[0].hna) || 0;
        prepared.unit_hpp_tax_type =
          batches[0].tax_type === "nota" ? "nota" : "faktur";
        prepared._selected_batch = batches[0].batch_no;
        prepared._selected_batch_id = batches[0].id || null;
        prepared.batch_no_snapshot = batches[0].batch_no;
        prepared.expired_date_snapshot = batches[0].expired_date;
      } else {
        prepared.unit_hpp = parseFloat(match.hna) || 0;
        prepared.unit_hpp_tax_type = "faktur";
      }
      return { item: prepared, batches };
    } catch (e) {
      console.error("Insight product prefill failed:", e);
      prepared.unit_hpp = parseFloat(match.hna) || 0;
      prepared.unit_hpp_tax_type = "faktur";
      prepared._product = match;
      return { item: prepared, batches: [] };
    }
  };

  const addInsightProduct = async (suggestion) => {
    if (!suggestion?.product_name || addingInsightProduct) return;
    setAddingInsightProduct(suggestion.product_name);
    try {
      const { item, batches } = await prepareProductItem(
        suggestion.product_name,
        suggestion,
      );
      const blankIndex = items.findIndex((it) => !it.product_name?.trim());
      if (blankIndex >= 0) {
        setItems((prev) => prev.map((it, i) => (i === blankIndex ? item : it)));
        setItemBatches((prev) => {
          const next = [...prev];
          next[blankIndex] = batches;
          return next;
        });
      } else {
        setItems((prev) => [...prev, item]);
        setItemBatches((prev) => [...prev, batches]);
      }
      flash(`Produk ${suggestion.product_name} ditambahkan dari riwayat customer`);
    } catch (e) {
      flash(e.message || "Gagal menambahkan produk dari insight", "error");
    } finally {
      setAddingInsightProduct("");
    }
  };

  // v1.7.0 multi-select handlers
  const toggleNotaSelect = (id) => {
    setSelectedNotaIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAllVisible = (visibleOrders) => {
    setSelectedNotaIds((prev) => {
      const visibleIds = visibleOrders.map((o) => o.id);
      const allSelected =
        visibleIds.length > 0 && visibleIds.every((id) => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      }
      return new Set([...prev, ...visibleIds]);
    });
  };
  const handleExportPdfLaporan = async () => {
    if (selectedNotaIds.size === 0) return;
    setExportingPdf(true);
    try {
      const { generateLaporanPDF } =
        await import("../utils/generateLaporanPDF");
      const selected = orders.filter((o) => selectedNotaIds.has(o.id));
      generateLaporanPDF(selected, {
        companyName: "HABIL SUPERAPP",
        filterInfo: `${selected.length} nota dipilih`,
        dateRange: "Custom selection",
      });
    } catch (e) {
      setSaveError("Export PDF gagal: " + e.message);
    } finally {
      setExportingPdf(false);
    }
  };
  const updateItem = async (idx, field, value) => {
    const newItems = [...items];
    let updated = { ...newItems[idx], [field]: value };

    // Auto-fill HPP and Price when product changes
    if (field === "product_name") {
      const match = products.find(
        (p) => p.name.toLowerCase() === value.toLowerCase(),
      );
      if (match) {
        updated.unit_price = parseFloat(match.sell_price) || 0;
        // v1.26.0: ✨ Harga Pintar — pakai harga Daftar Harga sesuai saluran nota
        // (offline → harga offline; online → Shopee, fallback TikTok/Tokped)
        const pl = priceMap[match.id];
        const smart =
          form.channel === "online"
            ? pl?.shopee ?? pl?.tokopedia_tiktok ?? null
            : pl?.offline ?? null;
        if (smart > 0) {
          updated.unit_price = smart;
          flash(
            `✨ Harga ${match.name} diisi dari Daftar Harga (${
              form.channel === "online"
                ? pl?.shopee
                  ? "Shopee"
                  : "TikTok/Tokped"
                : "Offline"
            })`,
          );
        }
        updated.unit = match.base_unit || match.unit || "pcs";
        updated._product_id = match.id;
        updated._product = match; // v1.6.0: cache product (pack info) untuk dropdown unit + konversi

        // Fetch available batches + tiers (v1.7.0 parallel) for dropdown
        try {
          const [batchesResp, tiersResp] = await Promise.all([
            inventoryAPI.getAvailableBatches(match.id),
            inventoryAPI.getProductTiers(match.id).catch(() => ({ data: [] })),
          ]);
          const batches = batchesResp.data || [];
          const tiers = tiersResp.data || [];
          updated._product = { ...match, price_tiers: tiers }; // v1.7.0: cache tiers di item
          const newBatches = [...itemBatches];
          newBatches[idx] = batches;
          setItemBatches(newBatches);
          // Auto-select FEFO (first batch)
          if (batches.length > 0) {
            updated.unit_hpp = parseFloat(batches[0].hna) || 0;
            updated.unit_hpp_tax_type =
              batches[0].tax_type === "nota" ? "nota" : "faktur";
            updated._selected_batch = batches[0].batch_no;
            updated._selected_batch_id = batches[0].id || null;
          } else {
            updated.unit_hpp = parseFloat(match.hna) || 0;
            updated.unit_hpp_tax_type = "faktur";
          }
        } catch (e) {
          console.error("Failed to fetch batches/tiers for product", match?.id, e);
          updated.unit_hpp = parseFloat(match.hna) || 0;
          updated.unit_hpp_tax_type = "faktur";
        }
      } else {
        // Clear batch list when product name doesn't match
        const newBatches = [...itemBatches];
        newBatches[idx] = [];
        setItemBatches(newBatches);
        updated._product = null;
      }
    }

    // v1.6.0: When unit changes (base → pack atau sebaliknya), recalc unit_price + unit_hpp
    if (field === "unit") {
      const match =
        newItems[idx]._product ||
        products.find(
          (p) =>
            p.name?.toLowerCase() === newItems[idx].product_name?.toLowerCase(),
        );
      if (match) {
        const wasPackUnit = isPackUnit(newItems[idx].unit, match);
        const isPack = isPackUnit(value, match);
        const packSize = parseInt(match.pack_size) || 1;
        const currentHppBase = wasPackUnit
          ? newItems[idx].unit_hpp / packSize
          : newItems[idx].unit_hpp;
        if (isPack) {
          // Switch ke pack unit → price per pack
          updated.unit_price =
            parseFloat(match.sell_price_pack) > 0
              ? parseFloat(match.sell_price_pack)
              : (parseFloat(match.sell_price) || 0) * packSize;
          updated.unit_hpp = currentHppBase * packSize;
        } else {
          // Switch ke base unit → price per pcs
          updated.unit_price = parseFloat(match.sell_price) || 0;
          updated.unit_hpp = currentHppBase;
        }
      }
    }

    // v1.16.2: batch dipilih dari dropdown — cari berdasarkan id, update snapshot fields
    if (field === "_selected_batch") {
      const batches = itemBatches[idx] || [];
      const batch = batches.find((b) => String(b.id) === String(value) || b.batch_no === value);
      if (batch) {
        updated._selected_batch_id = batch.id;
        updated._selected_batch = batch.batch_no;
        updated.batch_no_snapshot = batch.batch_no;
        updated.expired_date_snapshot = batch.expired_date;
        const match =
          newItems[idx]._product ||
          products.find(
            (p) =>
              p.name?.toLowerCase() ===
              newItems[idx].product_name?.toLowerCase(),
          );
        const isPack = match && isPackUnit(newItems[idx].unit, match);
        const packSize = parseInt(match?.pack_size) || 1;
        updated.unit_hpp =
          (parseFloat(batch.hna) || 0) * (isPack ? packSize : 1);
        updated.unit_hpp_tax_type =
          batch.tax_type === "nota" ? "nota" : "faktur";
      }
    }

    // v1.7.0: Auto-resolve tier price saat qty/unit/product berubah
    if (["qty", "unit", "product_name"].includes(field)) {
      const productWithTiers = updated._product;
      if (productWithTiers?.price_tiers?.length && updated.qty > 0) {
        const tierPrice = resolveTierPrice(
          updated.qty,
          updated.unit,
          productWithTiers.price_tiers,
        );
        if (tierPrice !== null) {
          updated.unit_price = tierPrice;
          updated._tier_applied = true;
        } else {
          updated._tier_applied = false;
        }
      } else {
        updated._tier_applied = false;
      }
    }

    newItems[idx] = updated;
    setItems(newItems);
  };

  const productSubtotal = items.reduce(
    (sum, it) => sum + (it.qty || 0) * (it.unit_price || 0),
    0,
  );
  const packageWeightGram = Math.max(0, parseInt(form.package_weight_gram) || 0);
  const findItemProduct = (it) =>
    it._product ||
    products.find(
      (p) => p.name?.toLowerCase() === it.product_name?.toLowerCase(),
    );
  const estimatedItemWeightGram = items.reduce((sum, it) => {
    if (!it.product_name?.trim()) return sum;
    const product = findItemProduct(it);
    const weightGram = Math.max(0, parseInt(product?.weight_gram) || 0);
    if (!product || weightGram <= 0) return sum;
    const qtyBase = toBase(parseFloat(it.qty) || 0, it.unit, product);
    return sum + qtyBase * weightGram;
  }, 0);
  const estimatedWeightGram = Math.round(
    estimatedItemWeightGram + packageWeightGram,
  );
  const missingWeightCount = items.filter((it) => {
    if (!it.product_name?.trim()) return false;
    const product = findItemProduct(it);
    return product && !(parseInt(product.weight_gram) > 0);
  }).length;
  // v1.21.14: ongkir (ditagih) masuk grand total nota.
  const ongkirAmount = Math.max(0, parseFloat(form.ongkir) || 0);
  const grandTotal = productSubtotal + ongkirAmount;
  const getItemMarginWarning = (item) => {
    const price = parseFloat(item.unit_price) || 0;
    const hpp = hppIncFor(item);
    if (!(price > 0) || !(hpp > 0)) return null;
    const marginPct = ((price - hpp) / price) * 100;
    if (price < hpp) {
      return {
        type: "danger",
        title: "Harga di bawah HPP",
        detail: `HPP ${fmtRp(hpp)} lebih tinggi dari harga jual ${fmtRp(price)}.`,
      };
    }
    if (marginPct < activeProfitThresholds.normal) {
      return {
        type: "warning",
        title: "Margin tipis",
        detail: `Estimasi margin ${formatProfitPct(marginPct)} — cek lagi sebelum simpan.`,
      };
    }
    return null;
  };
  const currentWaMessage = () =>
    buildNotaWaMessage({
      form,
      items: items.filter((item) => item.product_name?.trim()),
      total: grandTotal,
    });
  const handleCopyWaMessage = async () => {
    try {
      await copyTextToClipboard(currentWaMessage());
      flash("Draft pesan WA disalin");
    } catch (e) {
      flash(e.message || "Gagal menyalin draft WA", "error");
    }
  };
  const handleOpenWaMessage = () => {
    const url = buildWaUrl(form.customer_phone, currentWaMessage());
    if (!url) {
      flash("No. HP customer belum diisi", "error");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    border: `1px solid ${border}`,
    borderRadius: "10px",
    backgroundColor: "var(--color-surface-elevated)",
    color: text,
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
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
        title="Nota Penjualan"
        count={loading ? "…" : `${orders.length} nota tercatat`}
        isMobile={isMobile}
        isDarkMode={isDarkMode}
        rightSlot={
          <button
            onClick={openAdd}
            className="ui-motion-button"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "10px 18px",
              backgroundColor: "var(--color-success)",
              color: "#FFF",
              border: "none",
              borderRadius: "10px",
              cursor: "pointer",
              fontWeight: "700",
              fontSize: "14px",
            }}
          >
            <Plus size={18} /> Buat Nota
          </button>
        }
      />

      {/* v1.23.0: banner draft nota tersimpan (mirror draft faktur) */}
      {draftBanner && savedDraft && (
        <div
          className="ui-motion-card ui-readable-surface"
          style={{
            padding: "14px 18px",
            marginBottom: "1.25rem",
            backgroundColor: isDarkMode
              ? "var(--color-surface-elevated)"
              : "var(--color-warning-soft)",
            border: "1px solid var(--color-warning)",
            borderRadius: "14px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <FileText size={18} color="var(--color-warning)" />
          <div style={{ flex: 1, minWidth: "220px" }}>
            <span
              style={{ fontWeight: "700", fontSize: "14px", color: text }}
            >
              Ada draft nota tersimpan
            </span>
            <span
              style={{ fontSize: "13px", color: sub, marginLeft: "8px" }}
            >
              {savedDraftUpdatedAt
                ? `disimpan ${formatRelativeTime(savedDraftUpdatedAt)} · `
                : "disimpan otomatis · "}
              lanjutkan atau hapus supaya formulir tetap bersih.
            </span>
          </div>
          <button
            onClick={loadDraft}
            style={{
              padding: "8px 16px",
              backgroundColor: "var(--color-warning)",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "700",
              fontSize: "13px",
            }}
          >
            Pulihkan Draft
          </button>
          <button
            onClick={dismissDraft}
            style={{
              padding: "8px 16px",
              backgroundColor: "transparent",
              color: sub,
              border: `1px solid ${border}`,
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            Hapus Draft
          </button>
        </div>
      )}

      {/* Search & Filters */}
      <div
        className="ui-toolbar"
        style={{
          display: "flex",
          gap: "12px",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          alignItems: "center",
          padding: "14px",
        }}
      >
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Cari nomor nota atau customer..."
          ariaLabel="Cari nota"
          style={{ flex: 1, minWidth: isMobile ? "100%" : "300px" }}
          inputStyle={{
            backgroundColor: inputStyle.backgroundColor,
            borderColor: border,
            color: text,
          }}
        />

        {isMobile && (
          <button
            onClick={() => setShowMobileFilters((v) => !v)}
            className="ui-motion-button ui-focus-ring"
            aria-expanded={showMobileFilters}
            style={{
              padding: "10px 14px",
              backgroundColor: showMobileFilters
                ? "var(--color-primary-soft)"
                : "transparent",
              color: showMobileFilters ? "var(--color-primary)" : sub,
              border: `1px solid ${showMobileFilters ? "var(--color-primary)" : border}`,
              borderRadius: "10px",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: "13px",
              whiteSpace: "nowrap",
              flex: "0 0 auto",
            }}
          >
            {(() => {
              const n = [filterMonth, filterYear, filterStatus, filterChannel, filterProfit]
                .filter((f) => f !== "all").length;
              return `${showMobileFilters ? "✕ Tutup" : "⚙ Filter"}${n ? ` (${n})` : ""}`;
            })()}
          </button>
        )}

        {/* Mobile: filter dilipat ke grid 2 kolom; desktop: display contents = flow toolbar biasa */}
        <div
          style={
            isMobile
              ? {
                  display: showMobileFilters ? "grid" : "none",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "8px",
                  width: "100%",
                }
              : { display: "contents" }
          }
        >
        {/* v1.7.1 filter selects: fixed width override inputStyle's width:100% (sebelumnya stack vertical) + ellipsis */}
        <select
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          style={{
            ...inputStyle,
            width: isMobile ? "100%" : "170px",
            flex: "0 0 auto",
            paddingRight: "32px",
            textOverflow: "ellipsis",
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          <option value="all">Semua Bulan</option>
          {[
            "Januari",
            "Februari",
            "Maret",
            "April",
            "Mei",
            "Juni",
            "Juli",
            "Agustus",
            "September",
            "Oktober",
            "November",
            "Desember",
          ].map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>

        <select
          value={filterYear}
          onChange={(e) => setFilterYear(e.target.value)}
          style={{
            ...inputStyle,
            width: isMobile ? "100%" : "130px",
            flex: "0 0 auto",
            paddingRight: "32px",
            textOverflow: "ellipsis",
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          <option value="all">Semua Tahun</option>
          {Array.from(
            { length: 5 },
            (_, i) => new Date().getFullYear() - 2 + i,
          ).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{
            ...inputStyle,
            width: isMobile ? "100%" : "170px",
            flex: "0 0 auto",
            paddingRight: "32px",
            textOverflow: "ellipsis",
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          <option value="all">Semua Status</option>
          <option value="unpaid">Belum Bayar</option>
          <option value="paid">Sudah Lunas</option>
        </select>

        <select
          value={filterChannel}
          onChange={(e) => setFilterChannel(e.target.value)}
          style={{
            ...inputStyle,
            width: isMobile ? "100%" : "170px",
            flex: "0 0 auto",
            paddingRight: "32px",
            textOverflow: "ellipsis",
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          <option value="all">Semua Saluran</option>
          <option value="offline">🏪 Offline</option>
          <option value="online">🛒 Online</option>
        </select>

        <select
          value={filterProfit}
          onChange={(e) => setFilterProfit(e.target.value)}
          style={{
            ...inputStyle,
            width: isMobile ? "100%" : "190px",
            flex: "0 0 auto",
            paddingRight: "32px",
            textOverflow: "ellipsis",
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          <option value="all">Semua Profit</option>
          <option value="high">
            Untung tinggi (&gt;{formatProfitPct(activeProfitThresholds.high)})
          </option>
          <option value="normal">
            Untung normal ({formatProfitPct(activeProfitThresholds.normal)}–
            {formatProfitPct(activeProfitThresholds.high)})
          </option>
          <option value="thin">
            Tipis ({formatProfitPct(activeProfitThresholds.thin)}–
            {formatProfitPct(activeProfitThresholds.normal)})
          </option>
          <option value="loss">
            Rugi (&lt;{formatProfitPct(activeProfitThresholds.thin)})
          </option>
        </select>
        <div
          style={{
            width: "100%",
            gridColumn: "1 / -1",
            fontSize: "11px",
            color: sub,
            marginTop: "-4px",
            lineHeight: 1.5,
          }}
        >
          Ambang aktif: tinggi &gt;{" "}
          {formatProfitPct(activeProfitThresholds.high)} · normal{" "}
          {formatProfitPct(activeProfitThresholds.normal)}–
          {formatProfitPct(activeProfitThresholds.high)} · tipis{" "}
          {formatProfitPct(activeProfitThresholds.thin)}–
          {formatProfitPct(activeProfitThresholds.normal)} · rugi &lt;{" "}
          {formatProfitPct(activeProfitThresholds.thin)}
        </div>
        </div>
      </div>

      {/* v1.7.0 Multi-select action bar */}
      {selectedNotaIds.size > 0 && (
        <div
          style={{
            position: "sticky",
            top: "10px",
            zIndex: 10,
            marginBottom: "10px",
            padding: "12px 16px",
            background: "var(--color-primary)",
            color: "#FFF",
            borderRadius: "10px",
            boxShadow: "0 4px 12px rgba(0, 122, 255, 0.3)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <span style={{ fontSize: "13px", fontWeight: "700" }}>
            📊 {selectedNotaIds.size} nota dipilih
          </span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => setSelectedNotaIds(new Set())}
              disabled={exportingPdf}
              style={{
                padding: "8px 14px",
                background: "rgba(255,255,255,0.2)",
                color: "#FFF",
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "600",
                fontSize: "12px",
              }}
            >
              Batal
            </button>
            <button
              onClick={handleExportPdfLaporan}
              disabled={exportingPdf}
              style={{
                padding: "8px 16px",
                background: "#FFF",
                color: "var(--color-primary)",
                border: "none",
                borderRadius: "8px",
                cursor: exportingPdf ? "wait" : "pointer",
                fontWeight: "700",
                fontSize: "12px",
                opacity: exportingPdf ? 0.7 : 1,
              }}
            >
              {exportingPdf ? "Generating..." : "📄 Export Laporan PDF"}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div
        className="ui-panel ui-density-compact"
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
                backgroundColor: isDarkMode
                  ? "var(--color-surface-elevated)"
                  : "var(--color-bg)",
              }}
            >
              <th
                style={{
                  padding: "12px 8px",
                  textAlign: "center",
                  width: "36px",
                  borderBottom: `1px solid ${border}`,
                }}
              >
                <input
                  type="checkbox"
                  checked={
                    filtered.length > 0 &&
                    filtered.every((o) => selectedNotaIds.has(o.id))
                  }
                  onChange={() => toggleSelectAllVisible(filtered)}
                  title="Select all visible"
                  style={{ cursor: "pointer" }}
                />
              </th>
              {[
                { label: "No. Nota", key: "order_number", sortable: true },
                { label: "Tanggal", key: "sale_date", sortable: true },
                { label: "Customer", key: null, sortable: false },
                { label: "Total", key: "total", sortable: true },
                { label: "Bayar", key: null, sortable: false },
                { label: "Aksi", key: null, sortable: false },
              ].map(({ label, key, sortable }) => {
                const isActive = sortable && sortKey === key;
                const SortIcon = !sortable
                  ? null
                  : !isActive
                    ? ChevronsUpDown
                    : sortDir === "asc"
                      ? ChevronUp
                      : ChevronDown;
                return (
                  <th
                    key={label}
                    onClick={() => sortable && toggleSort(key)}
                    aria-sort={
                      !sortable
                        ? "none"
                        : isActive
                          ? sortDir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                    }
                    style={{
                      padding: "12px 14px",
                      textAlign: "left",
                      fontWeight: "700",
                      color: isActive ? "var(--color-primary)" : sub,
                      fontSize: "11px",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      borderBottom: `1px solid ${border}`,
                      cursor: sortable ? "pointer" : "default",
                      userSelect: "none",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      {label}
                      {SortIcon && (
                        <SortIcon
                          size={12}
                          style={{ opacity: isActive ? 1 : 0.4 }}
                        />
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading
              ? [...Array(5)].map((_, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${border}` }}>
                    <td style={{ padding: "12px 8px" }}>
                      <Skeleton width="16px" height="16px" />
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <Skeleton width="80px" height="16px" />
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <Skeleton width="90px" height="16px" />
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <Skeleton width="120px" height="16px" />
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <Skeleton width="70px" height="16px" />
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <Skeleton width="50px" height="16px" />
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <Skeleton width="60px" height="20px" />
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <Skeleton width="80px" height="16px" />
                    </td>
                  </tr>
                ))
              : filtered.map((o) => (
                  <React.Fragment key={o.id}>
                    <tr
                      className="ui-row ui-hover-delight"
                      style={{
                        borderBottom: `1px solid ${border}`,
                        cursor: "pointer",
                        backgroundColor: selectedNotaIds.has(o.id)
                          ? isDarkMode
                            ? "var(--color-primary-soft)"
                            : "var(--color-primary)08"
                          : "transparent",
                      }}
                      onClick={() =>
                        setExpandedId(expandedId === o.id ? null : o.id)
                      }
                    >
                      <td
                        style={{ padding: "12px 8px", textAlign: "center" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedNotaIds.has(o.id)}
                          onChange={() => toggleNotaSelect(o.id)}
                          style={{ cursor: "pointer" }}
                        />
                      </td>
                      <td
                        style={{
                          padding: "12px 14px",
                          fontWeight: "600",
                          color: "var(--color-primary)",
                        }}
                      >
                        {o.order_number}
                      </td>
                      <td style={{ padding: "12px 14px", color: text }}>
                        {fmtDate(o.sale_date)}
                      </td>
                      <td style={{ padding: "12px 14px", color: text }}>
                        <div>{o.customer_name}</div>
                        <span
                          style={{
                            fontSize: "9px",
                            fontWeight: "700",
                            padding: "1px 5px",
                            borderRadius: "3px",
                            whiteSpace: "nowrap",
                            display: "inline-block",
                            backgroundColor:
                              o.channel === "online"
                                ? "var(--color-primary-soft)"
                                : "var(--color-text-subtle)15",
                            color:
                              o.channel === "online"
                                ? "var(--color-primary)"
                                : "var(--color-text-subtle)",
                          }}
                        >
                          {o.channel === "online" ? "🛒 ONLINE" : "🏪 OFFLINE"}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "12px 14px",
                          fontWeight: "600",
                          color: text,
                        }}
                      >
                        {fmtRp(o.total)}
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openPaymentModal(o);
                          }}
                          style={{
                            border: "none",
                            background: "none",
                            cursor: "pointer",
                            padding: 0,
                          }}
                        >
                          <span
                            style={{
                              fontSize: "10px",
                              fontWeight: "800",
                              padding: "4px 10px",
                              borderRadius: "6px",
                              whiteSpace: "nowrap",
                              display: "inline-block",
                              backgroundColor:
                                o.payment_status === "paid"
                                  ? "var(--color-success-soft-strong)"
                                  : "var(--color-danger-soft)",
                              color:
                                o.payment_status === "paid"
                                  ? "var(--color-success)"
                                  : "var(--color-danger)",
                              border: `1px solid ${o.payment_status === "paid" ? "var(--color-success-soft-strong)" : "var(--color-danger-soft-strong)"}`,
                            }}
                          >
                            {o.payment_status === "paid"
                              ? "LUNAS"
                              : "BELUM BAYAR"}
                          </span>
                        </button>
                        {o.paid_at && (
                          <p
                            style={{
                              margin: "4px 0 0",
                              fontSize: "9px",
                              color: sub,
                              cursor: "pointer",
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              openPaymentModal(o);
                            }}
                          >
                            {fmtDate(o.paid_at)} ✏️
                          </p>
                        )}
                        {o.payment_status !== "paid" &&
                          o.due_date &&
                          (() => {
                            const diff = notaDaysDiff(o.due_date);
                            if (diff === null) return null;
                            if (diff < 0)
                              return (
                                <p
                                  style={{
                                    margin: "4px 0 0",
                                    fontSize: "9px",
                                    fontWeight: "700",
                                    color: "var(--color-danger)",
                                    animation:
                                      "habil-pulse 1.2s ease-in-out infinite",
                                  }}
                                >
                                  Terlambat {Math.abs(diff)}h
                                </p>
                              );
                            if (diff <= 3)
                              return (
                                <p
                                  style={{
                                    margin: "4px 0 0",
                                    fontSize: "9px",
                                    fontWeight: "700",
                                    color: "var(--color-warning)",
                                  }}
                                >
                                  JT {diff}h lagi
                                </p>
                              );
                            return (
                              <p
                                style={{
                                  margin: "4px 0 0",
                                  fontSize: "9px",
                                  color: sub,
                                }}
                              >
                                JT: {fmtDate(o.due_date)}
                              </p>
                            );
                          })()}
                      </td>
                      {/* v1.23.0: kolom "Status Doc" dihapus — nota tersimpan
                          selalu dokumen sah (final); draft hidup di banner draft */}
                      <td style={{ padding: "12px 14px" }}>
                        <div
                          className="ui-row-action"
                          style={{
                            display: "flex",
                            gap: "6px",
                            alignItems: "center",
                          }}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openPrintOptions(o);
                            }}
                            aria-label={`Cetak nota ${o.order_number}`}
                            title="Cetak PDF"
                          style={{
                              background: "var(--color-surface-elevated)",
                              border: `1px solid ${border}`,
                              cursor: "pointer",
                              padding: "0",
                              width: "40px",
                              height: "40px",
                              borderRadius: "10px",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <FileText size={15} color="var(--color-success)" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(o);
                            }}
                            aria-label={`Edit nota ${o.order_number}`}
                            title="Edit"
                          style={{
                              background: "var(--color-surface-elevated)",
                              border: `1px solid ${border}`,
                              cursor: "pointer",
                              padding: "0",
                              width: "40px",
                              height: "40px",
                              borderRadius: "10px",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Icons.Edit2
                              size={15}
                              color="var(--color-primary)"
                            />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(o.id);
                            }}
                            aria-label={`Hapus nota ${o.order_number}`}
                            title="Hapus"
                          style={{
                              background: "var(--color-surface-elevated)",
                              border: `1px solid ${border}`,
                              cursor: "pointer",
                              padding: "0",
                              width: "40px",
                              height: "40px",
                              borderRadius: "10px",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Icons.Trash2
                              size={15}
                              color="var(--color-danger)"
                            />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === o.id && o.items?.length > 0 && (
                      <tr>
                        <td
                          colSpan={7}
                          style={{
                            padding: "0 14px 14px",
                            backgroundColor: isDarkMode ? "#0A0A0A" : "#FAFAFA",
                          }}
                        >
                          <table
                            style={{
                              width: "100%",
                              borderCollapse: "collapse",
                              marginTop: "8px",
                              fontSize: "12px",
                            }}
                          >
                            <thead>
                              <tr>
                                {[
                                  "Produk",
                                  "Qty",
                                  "Satuan",
                                  "HPP",
                                  "Harga",
                                  "Subtotal",
                                  "Margin",
                                ].map((h) => (
                                  <th
                                    key={h}
                                    style={{
                                      padding: "6px 10px",
                                      textAlign:
                                        h === "Margin" ? "right" : "left",
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
                              {o.items.map((it, idx) => {
                                const hppInc = hppIncFor(it);
                                // v1.23.1: unit_price & unit_hpp = per satuan
                                // jual (karton/pcs) → kalikan qty di satuan
                                // itu juga (qty_in_unit), BUKAN qty basis pcs.
                                // Dulu nota karton: margin dikali 36 pcs
                                // padahal harga per karton (overstate 12×).
                                const qtyUnit = saleItemDisplayQty(it);
                                const margin =
                                  (parseFloat(it.unit_price) - hppInc) *
                                  qtyUnit;
                                return (
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
                                      {qtyUnit}
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
                                        color: sub,
                                      }}
                                    >
                                      {fmtRp(hppInc)}
                                    </td>
                                    <td
                                      style={{
                                        padding: "6px 10px",
                                        color: text,
                                      }}
                                    >
                                      {fmtRp(it.unit_price)}
                                    </td>
                                    <td
                                      style={{
                                        padding: "6px 10px",
                                        fontWeight: "600",
                                        color: text,
                                      }}
                                    >
                                      {fmtRp(it.subtotal)}
                                    </td>
                                    <td
                                      style={{
                                        padding: "6px 10px",
                                        textAlign: "right",
                                        fontWeight: "600",
                                        color:
                                          margin >= 0
                                            ? "var(--color-success)"
                                            : "var(--color-danger)",
                                      }}
                                    >
                                      {fmtRp(margin)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              {(() => {
                                const itemMargin = o.items.reduce(
                                  (s, it) =>
                                    s +
                                      (parseFloat(it.unit_price) - hppIncFor(it)) *
                                      saleItemDisplayQty(it),
                                  0,
                                );
                                // v1.21.14: ongkir ikut total margin (untung = ditagih - biaya asli)
                                const ongkirVal = parseFloat(o.ongkir) || 0;
                                const ongkirCostVal = parseFloat(o.ongkir_cost) || 0;
                                const ongkirMargin = ongkirVal - ongkirCostVal;
                                // v1.25.1: fee kartu absorb motong margin; pass_on netral
                                const ccFee = parseFloat(o.payment_fee) || 0;
                                const ccAbsorb =
                                  o.payment_fee_mode === "absorb" && ccFee > 0;
                                const totalMargin =
                                  itemMargin + ongkirMargin - (ccAbsorb ? ccFee : 0);
                                return (
                                  <>
                                  {(ongkirVal > 0 || ongkirCostVal > 0) && (
                                    <tr style={{ borderTop: `1px dashed ${border}` }}>
                                      <td
                                        colSpan={6}
                                        style={{
                                          padding: "6px 10px",
                                          textAlign: "right",
                                          fontWeight: "600",
                                          fontSize: "12px",
                                          color: sub,
                                        }}
                                      >
                                        Ongkir (ditagih {fmtRp(ongkirVal)} − biaya{" "}
                                        {fmtRp(ongkirCostVal)})
                                      </td>
                                      <td
                                        style={{
                                          padding: "6px 10px",
                                          textAlign: "right",
                                          fontWeight: "600",
                                          fontSize: "12px",
                                          color:
                                            ongkirMargin >= 0
                                              ? "var(--color-success)"
                                              : "var(--color-danger)",
                                        }}
                                      >
                                        {fmtRp(ongkirMargin)}
                                      </td>
                                    </tr>
                                  )}
                                  {ccFee > 0 && (
                                    <tr style={{ borderTop: `1px dashed ${border}` }}>
                                      <td
                                        colSpan={6}
                                        style={{
                                          padding: "6px 10px",
                                          textAlign: "right",
                                          fontWeight: "600",
                                          fontSize: "12px",
                                          color: sub,
                                        }}
                                      >
                                        Biaya kartu kredit{" "}
                                        {ccAbsorb
                                          ? "(dipotong dari margin)"
                                          : `(dibebankan ke customer ${fmtRp(ccFee)} — margin utuh)`}
                                      </td>
                                      <td
                                        style={{
                                          padding: "6px 10px",
                                          textAlign: "right",
                                          fontWeight: "600",
                                          fontSize: "12px",
                                          color: ccAbsorb
                                            ? "var(--color-danger)"
                                            : sub,
                                        }}
                                      >
                                        {ccAbsorb ? fmtRp(-ccFee) : "±0"}
                                      </td>
                                    </tr>
                                  )}
                                  <tr
                                    style={{ borderTop: `2px solid ${border}` }}
                                  >
                                    <td
                                      colSpan={6}
                                      style={{
                                        padding: "8px 10px",
                                        textAlign: "right",
                                        fontWeight: "700",
                                        color: sub,
                                      }}
                                    >
                                      Total Margin Nota
                                    </td>
                                    <td
                                      style={{
                                        padding: "8px 10px",
                                        textAlign: "right",
                                        fontWeight: "700",
                                        fontSize: "13px",
                                        color:
                                          totalMargin >= 0
                                            ? "var(--color-success)"
                                            : "var(--color-danger)",
                                      }}
                                    >
                                      {fmtRp(totalMargin)}
                                    </td>
                                  </tr>
                                  </>
                                );
                              })()}
                            </tfoot>
                          </table>
                          {o.items.some((it) => !parseFloat(it.unit_hpp)) && (
                            <p
                              style={{
                                margin: "6px 0 0",
                                fontSize: "11px",
                                color: "var(--color-warning)",
                                fontWeight: "600",
                              }}
                            >
                              ⚠️ Beberapa produk HPP belum diisi — margin
                              mungkin overstate. Update HPP di Inventory.
                            </p>
                          )}
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
                ))}
            {!loading && !filtered.length && (
              <tr>
                <td colSpan={7} style={{ padding: "2rem 1rem" }}>
                  <EmptyState
                    compact
                    icon={EmptyStateIcons.receipt}
                    title={
                      search ||
                      filterMonth !== "all" ||
                      filterYear !== "all" ||
                      filterStatus !== "all" ||
                      filterChannel !== "all" ||
                      filterProfit !== "all"
                        ? `Tidak ada hasil untuk '${search || "filter aktif"}'`
                        : "Belum ada nota penjualan."
                    }
                    description={
                      search ||
                      filterMonth !== "all" ||
                      filterYear !== "all" ||
                      filterStatus !== "all" ||
                      filterChannel !== "all" ||
                      filterProfit !== "all"
                        ? "Coba kata kunci lain atau reset filter."
                        : "Nota final dan paid akan muncul di sini, lengkap dengan ringkasan margin."
                    }
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal &&
        renderPortal(
          <div
            onClick={() => setShowModal(false)}
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
              className="ui-motion-modal ui-modal-shell"
              style={{
                backgroundColor: cardBg,
                borderRadius: "16px",
                width: "100%",
                maxWidth: "min(1200px, calc(100vw - 32px))",
                maxHeight: "92vh",
                overflow: "auto",
                boxShadow: "0 32px 64px rgba(0,0,0,0.35)",
              }}
            >
              {/* Header */}
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
                    color: text,
                  }}
                >
                  {editId ? "✏️ Edit Nota" : "🧾 Buat Nota Baru"}
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  aria-label="Tutup modal nota"
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

                  {/* Mobile: form & preview jadi tab — preview tidak lagi menutupi form */}
                  {isMobile && (
                    <div
                      role="tablist"
                      style={{
                        display: "flex",
                        gap: "4px",
                        padding: "10px 22px 0",
                        borderBottom: `1px solid ${border}`,
                      }}
                    >
                      {[
                        ["form", "📝 Form"],
                        ["preview", "📄 Preview"],
                      ].map(([key, label]) => (
                        <button
                          key={key}
                          role="tab"
                          aria-selected={formTab === key}
                          onClick={() => setFormTab(key)}
                          className="ui-motion-button"
                          style={{
                            padding: "10px 16px",
                            background: "none",
                            border: "none",
                            borderBottom:
                              formTab === key
                                ? "2px solid var(--color-primary)"
                                : "2px solid transparent",
                            color:
                              formTab === key ? "var(--color-primary)" : sub,
                            fontWeight: 700,
                            fontSize: "13px",
                            cursor: "pointer",
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                  <div
                    style={{
                      padding: "20px 22px",
                      display: "grid",
                      gridTemplateColumns: isMobile ? "1fr" : "1.1fr 1fr",
                  gap: "24px",
                  alignItems: "start",
                }}
              >
                <div
                  style={{
                    display:
                      isMobile && formTab !== "form" ? "none" : "flex",
                    flexDirection: "column",
                    gap: "14px",
                    minWidth: 0,
                  }}
                >
                  {!editId && (
                    <div>
                      <label style={labelStyle}>Nomor Nota *</label>
                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          alignItems: "center",
                        }}
                      >
                        <input
                          value={notaCounter.prefix}
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
                            isAutoNota
                              ? notaCounter.next_preview
                                ? notaCounter.next_preview.replace(
                                    notaCounter.prefix,
                                    "",
                                  )
                                : String(
                                    (notaCounter.month_max || 0) + 1,
                                  ).padStart(3, "0")
                              : manualNumber
                          }
                          onChange={(e) =>
                            !isAutoNota &&
                            setManualNumber(e.target.value.replace(/\D/g, ""))
                          }
                          disabled={isAutoNota}
                          placeholder="2605001"
                          style={{
                            ...inputStyle,
                            flex: 1,
                            backgroundColor: isAutoNota
                              ? isDarkMode
                                ? "#333"
                                : "var(--color-bg)"
                              : cardBg,
                            opacity: isAutoNota ? 0.7 : 1,
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newMode = !isAutoNota;
                            setIsAutoNota(newMode);
                            if (!newMode) {
                              // v1.8.2: kalau switch ke manual, prefill dgn next_preview YYMM logic
                              const previewNum = notaCounter.next_preview
                                ? notaCounter.next_preview.replace(
                                    notaCounter.prefix,
                                    "",
                                  )
                                : String(
                                    (notaCounter.month_max || 0) + 1,
                                  ).padStart(3, "0");
                              setManualNumber(previewNum);
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
                            backgroundColor: isAutoNota ? "#E8F5E9" : "#FFF3E0",
                            color: isAutoNota ? "#2E7D32" : "#E65100",
                            fontWeight: "600",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            cursor: "pointer",
                            minWidth: "110px",
                            justifyContent: "center",
                          }}
                        >
                          {isAutoNota ? "🔒 Auto" : "🔓 Manual"}
                        </button>
                      </div>
                      {!isAutoNota && (
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
                      <FieldError message={saveError} visible={!!saveError} />
                    </div>
                  )}
                  {editId && (
                    <div>
                      <label style={labelStyle}>Nomor Nota</label>
                      <input
                        value={form.order_number}
                        disabled
                        style={{ ...inputStyle, opacity: 0.6 }}
                      />
                    </div>
                  )}

                  {/* Customer */}
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "11px",
                        fontWeight: "700",
                        color: formErrors.customer_name
                          ? "var(--color-danger)"
                          : sub,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        marginBottom: "6px",
                      }}
                    >
                      Customer *
                    </label>
                    <div
                      style={
                        formErrors.customer_name
                          ? {
                              border: "2px solid var(--color-danger)",
                              borderRadius: "10px",
                            }
                          : {}
                      }
                    >
                      <MasterSelect
                        value={form.customer_name}
                        onChange={(v) => {
                          setForm((p) => ({ ...p, customer_name: v }));
                          setFormErrors((e) => ({
                            ...e,
                            customer_name: undefined,
                          }));
                          const match = customers.find((c) => c.name === v);
                          if (match)
                            setForm((p) => ({
                              ...p,
                              customer_phone: match.phone || "",
                              customer_address: match.address || "",
                            }));
                        }}
                        options={customers}
                        onAdd={handleAddCustomer}
                        onRemove={handleRemoveCustomer}
                        onRename={handleRenameCustomer}
                        placeholder="Pilih atau tambah customer..."
                        isDarkMode={isDarkMode}
                      />
                    </div>
                    <FieldError
                      message={formErrors.customer_name}
                      visible={!!formErrors.customer_name}
                    />
                  </div>

                  {/* Phone — v1.23.0: ikut tampil di nota + sync balik ke master customer */}
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "11px",
                        fontWeight: "700",
                        color: sub,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        marginBottom: "6px",
                      }}
                    >
                      No. HP
                    </label>
                    <input
                      value={form.customer_phone}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          customer_phone: e.target.value,
                        }))
                      }
                      placeholder="08xx-xxxx-xxxx"
                      style={inputStyle}
                    />
                  </div>

                  {/* Address */}
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "11px",
                        fontWeight: "700",
                        color: sub,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        marginBottom: "6px",
                      }}
                    >
                      Alamat
                    </label>
                    <input
                      value={form.customer_address}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          customer_address: e.target.value,
                        }))
                      }
                      placeholder="Alamat"
                      style={inputStyle}
                    />
                  </div>

                  {selectedCustomer && (
                    <div
                      style={{
                        border: `1px solid ${border}`,
                        borderRadius: "12px",
                        padding: "12px",
                        backgroundColor: "var(--color-bg-subtle)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "8px",
                          marginBottom: "8px",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: "12px",
                              fontWeight: "800",
                              color: text,
                            }}
                          >
                            Mini AI: Biasanya beli
                          </div>
                          <div style={{ fontSize: "11px", color: sub }}>
                            Dari riwayat customer — klik chip untuk prefill baris
                            produk.
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: "10px",
                            fontWeight: "800",
                            color: "var(--color-primary)",
                            backgroundColor: "var(--color-primary-soft)",
                            borderRadius: "999px",
                            padding: "4px 8px",
                          }}
                        >
                          non-blocking
                        </span>
                      </div>
                      {customerInsightsLoading ? (
                        <p style={{ margin: 0, fontSize: "11px", color: sub }}>
                          Memuat riwayat...
                        </p>
                      ) : customerInsights.length > 0 ? (
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          {customerInsights.map((item) => (
                            <button
                              key={`${item.product_name}-${item.product_id || "legacy"}`}
                              type="button"
                              onClick={() => addInsightProduct(item)}
                              disabled={!!addingInsightProduct}
                              style={{
                                border: `1px solid ${border}`,
                                borderRadius: "999px",
                                padding: "7px 10px",
                                backgroundColor: "var(--color-surface)",
                                color: text,
                                cursor: addingInsightProduct ? "wait" : "pointer",
                                fontSize: "11px",
                                fontWeight: "700",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                              }}
                            >
                              <span>{item.product_name}</span>
                              <span style={{ color: sub }}>
                                {item.order_count}x
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p style={{ margin: 0, fontSize: "11px", color: sub }}>
                          Belum ada riwayat produk untuk customer ini.
                        </p>
                      )}
                    </div>
                  )}

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "12px",
                    }}
                  >
                    <div>
                      <label style={labelStyle}>Tanggal</label>
                      <input
                        type="date"
                        value={form.sale_date}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, sale_date: e.target.value }))
                        }
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Metode Pembayaran</label>
                      <select
                        value={form.payment_method}
                        onChange={(e) => {
                          const v = e.target.value;
                          setForm((p) => ({
                            ...p,
                            payment_method: v,
                            // v1.8.1: Tunai → auto-clear due_date (gak ada tempo untuk cash)
                            ...(v === "Tunai"
                              ? { due_date: "", payment_terms: null }
                              : {}),
                            // v1.25.1: pindah ke Kartu Kredit → prefill fee default;
                            // metode lain → fee dinolkan
                            ...(v === "Kartu Kredit"
                              ? p.payment_fee_rate
                                ? {}
                                : { payment_fee_rate: String(ccDefaultRatePct) }
                              : { payment_fee_rate: "" }),
                          }));
                        }}
                        style={inputStyle}
                      >
                        <option value="Tunai">Tunai</option>
                        <option value="Transfer">Transfer</option>
                        <option value="QRIS">QRIS</option>
                        <option value="Kartu Kredit">Kartu Kredit</option>
                      </select>
                    </div>
                  </div>

                  {/* v1.25.1: fee kartu kredit — potong margin vs bebankan ke customer */}
                  {form.payment_method === "Kartu Kredit" && (
                    <div
                      style={{
                        padding: "12px",
                        borderRadius: "10px",
                        border: `1px solid ${border}`,
                        backgroundColor: "var(--color-bg-subtle)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "120px 1fr",
                          gap: "10px",
                          alignItems: "end",
                        }}
                      >
                        <div>
                          <label style={labelStyle}>Fee Kartu (%)</label>
                          <input
                            type="number"
                            min="0"
                            max="50"
                            step="0.1"
                            value={form.payment_fee_rate}
                            placeholder={String(ccDefaultRatePct)}
                            onChange={(e) =>
                              setForm((p) => ({
                                ...p,
                                payment_fee_rate: e.target.value,
                              }))
                            }
                            style={inputStyle}
                          />
                        </div>
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                          {[
                            ["absorb", "Potong margin"],
                            ["pass_on", "Bebankan ke customer"],
                          ].map(([k, label]) => {
                            const active = form.payment_fee_mode === k;
                            return (
                              <button
                                key={k}
                                type="button"
                                onClick={() =>
                                  setForm((p) => ({ ...p, payment_fee_mode: k }))
                                }
                                style={{
                                  padding: "8px 12px",
                                  fontSize: "12px",
                                  fontWeight: "700",
                                  borderRadius: "8px",
                                  border: `1px solid ${active ? "var(--color-primary)" : border}`,
                                  backgroundColor: active
                                    ? "var(--color-primary)"
                                    : "transparent",
                                  color: active ? "#FFF" : sub,
                                  cursor: "pointer",
                                }}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div style={{ fontSize: "11px", color: sub, lineHeight: 1.5 }}>
                        {(() => {
                          const r = (parseFloat(form.payment_fee_rate) || 0) / 100;
                          if (!(r > 0) || !(grandTotal > 0))
                            return "Isi % fee mesin EDC — biasanya 2–3%. Pilih siapa yang menanggung.";
                          if (form.payment_fee_mode === "pass_on") {
                            const fee = (grandTotal * r) / (1 - r);
                            return `Customer bayar ${fmtRp(grandTotal + fee)} (termasuk biaya kartu ${fmtRp(fee)}) — margin kamu UTUH. Baris biaya kartu ikut tampil di nota.`;
                          }
                          const fee = grandTotal * r;
                          return `Harga customer tetap ${fmtRp(grandTotal)}; margin terpotong fee ${fmtRp(fee)}. Tidak tampil di nota (internal).`;
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Tempo Pembayaran — v1.8.1: hide kalau Tunai (cash gak ada tempo) */}
                  {form.payment_method !== "Tunai" ? (
                    <div>
                      <label style={labelStyle}>
                        Tempo Pembayaran (Jatuh Tempo)
                      </label>
                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          marginBottom: "8px",
                          flexWrap: "wrap",
                        }}
                      >
                        {[7, 14, 30].map((n) => {
                          const target = addDays(form.sale_date, n);
                          const active =
                            form.due_date === target &&
                            form.payment_terms === n;
                          return (
                            <button
                              key={n}
                              type="button"
                              onClick={() =>
                                setForm((p) => ({
                                  ...p,
                                  due_date: target,
                                  payment_terms: n,
                                }))
                              }
                              style={{
                                padding: "6px 14px",
                                fontSize: "12px",
                                fontWeight: "700",
                                borderRadius: "8px",
                                border: `1px solid ${active ? "var(--color-primary)" : isDarkMode ? "var(--color-border-strong)" : "var(--color-border)"}`,
                                backgroundColor: active
                                  ? "var(--color-primary)"
                                  : "transparent",
                                color: active
                                  ? "#FFF"
                                  : isDarkMode
                                    ? "var(--color-text-subtle)"
                                    : "#555",
                                cursor: "pointer",
                              }}
                            >
                              {n} hari
                            </button>
                          );
                        })}
                      </div>
                      <input
                        type="date"
                        value={form.due_date}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            due_date: e.target.value,
                            payment_terms: null,
                          }))
                        }
                        style={{ ...inputStyle, fontSize: "12px" }}
                        placeholder="Atau pilih tanggal manual"
                      />
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: "10px 12px",
                        background: isDarkMode
                          ? "var(--color-surface-elevated)"
                          : "var(--color-bg)",
                        borderRadius: "10px",
                        border: `1px dashed ${isDarkMode ? "var(--color-border-strong)" : "var(--color-border)"}`,
                      }}
                    >
                      <p style={{ margin: 0, fontSize: "11px", color: sub }}>
                        Pembayaran <strong>Tunai</strong> — tidak ada tempo.
                        Ganti metode (Transfer / QRIS) kalau perlu jatuh tempo.
                      </p>
                    </div>
                  )}

                  <div>
                    <label style={labelStyle}>Saluran Penjualan</label>
                    <select
                      value={form.channel}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, channel: e.target.value }))
                      }
                      style={inputStyle}
                    >
                      <option value="offline">🏪 Offline</option>
                      <option value="online">🛒 Online / Marketplace</option>
                    </select>
                  </div>

                  {/* #1 konfirmasi item rugi sebelum simpan */}
                  {lossConfirm &&
                    renderPortal(
                      <div
                        onClick={() => setLossConfirm(null)}
                        style={{
                          position: "fixed",
                          inset: 0,
                          zIndex: 1000,
                          background: "rgba(0,0,0,0.5)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "16px",
                        }}
                      >
                        <div
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            background: "var(--color-surface)",
                            border: `1px solid ${border}`,
                            borderRadius: "16px",
                            maxWidth: "440px",
                            width: "100%",
                            padding: "20px",
                          }}
                        >
                          <h3
                            style={{
                              margin: "0 0 8px",
                              fontSize: "16px",
                              fontWeight: 800,
                              color: "var(--color-danger)",
                            }}
                          >
                            ⚠️ Ada item di bawah modal
                          </h3>
                          <p
                            style={{
                              margin: "0 0 12px",
                              fontSize: "13px",
                              color: sub,
                              lineHeight: 1.5,
                            }}
                          >
                            Item berikut dijual di bawah HPP (rugi). Lanjut simpan?
                          </p>
                          <ul
                            style={{
                              margin: "0 0 16px",
                              paddingLeft: "18px",
                              fontSize: "12.5px",
                              color: text,
                              lineHeight: 1.7,
                            }}
                          >
                            {lossConfirm.map((it, i) => (
                              <li key={i}>
                                <strong>{it.product_name}</strong> — harga{" "}
                                {fmtRp(parseFloat(it.unit_price) || 0)} &lt; HPP{" "}
                                {fmtRp(hppIncFor(it))}
                              </li>
                            ))}
                          </ul>
                          <div
                            style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}
                          >
                            <button
                              type="button"
                              onClick={() => setLossConfirm(null)}
                              style={{
                                padding: "9px 14px",
                                borderRadius: "10px",
                                border: `1px solid ${border}`,
                                background: "var(--color-surface)",
                                color: text,
                                fontWeight: 700,
                                fontSize: "13px",
                                cursor: "pointer",
                              }}
                            >
                              Batal, cek lagi
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setLossConfirm(null);
                                handleSave(true);
                              }}
                              style={{
                                padding: "9px 14px",
                                borderRadius: "10px",
                                border: "none",
                                background: "var(--color-danger)",
                                color: "#fff",
                                fontWeight: 800,
                                fontSize: "13px",
                                cursor: "pointer",
                              }}
                            >
                              Lanjut simpan
                            </button>
                          </div>
                        </div>
                      </div>,
                    )}

                  {/* Items */}
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "11px",
                        fontWeight: "700",
                        color: sub,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        marginBottom: "6px",
                      }}
                    >
                      Produk
                    </label>

                    {/* Column Headers */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "minmax(0, 2fr) 60px 70px 80px 100px 30px",
                        gap: "6px",
                        marginBottom: "8px",
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "11px",
                          fontWeight: "700",
                          color: sub,
                        }}
                      >
                        Nama
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          fontWeight: "700",
                          color: sub,
                          textAlign: "center",
                        }}
                      >
                        Qty
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          fontWeight: "700",
                          color: sub,
                          textAlign: "center",
                        }}
                      >
                        Unit
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          fontWeight: "700",
                          color: sub,
                          textAlign: "center",
                        }}
                      >
                        HPP
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          fontWeight: "700",
                          color: sub,
                          textAlign: "center",
                        }}
                      >
                        Harga
                      </div>
                      <div></div>
                    </div>

                    {items.map((it, idx) => {
                      const batches = itemBatches[idx] || [];
                      const product =
                        it._product ||
                        products.find(
                          (p) =>
                            p.name?.toLowerCase() ===
                            it.product_name?.toLowerCase(),
                        );
                      const unitOptions = getProductUnits(product);
                      const showConversion =
                        product && isPackUnit(it.unit, product) && it.qty > 0;
                      const marginWarning = getItemMarginWarning(it);
                      return (
                        <div key={idx} style={{ marginBottom: "10px" }}>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns:
                                "minmax(0, 2fr) 60px 70px 80px 100px 30px",
                              gap: "6px",
                              alignItems: "center",
                            }}
                          >
                            <MasterSelect
                              value={it.product_name}
                              onChange={(v) =>
                                updateItem(idx, "product_name", v)
                              }
                              options={products.map((p) => ({ name: p.name }))}
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
                                fontSize: "12px",
                                padding: "8px 4px",
                              }}
                            >
                              {unitOptions.map((u, i) => (
                                <option key={`${u.value}-${i}`} value={u.value}>
                                  {u.value}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              value={Math.round(hppIncFor(it))}
                              onChange={(e) =>
                                updateItem(
                                  idx,
                                  "unit_hpp",
                                  it.unit_hpp_tax_type === "nota"
                                    ? parseFloat(e.target.value) || 0
                                    : hnaFromHpp(
                                        parseFloat(e.target.value) || 0,
                                      ),
                                )
                              }
                              min="0"
                              placeholder="0"
                              title={
                                it.unit_hpp_tax_type === "nota"
                                  ? "HPP dari pembelian nota (tanpa PPN) — disimpan apa adanya"
                                  : "HPP inc PPN 11% (disimpan sebagai HNA exc PPN)"
                              }
                              style={{
                                ...inputStyle,
                                fontSize: "12px",
                                padding: "8px 6px",
                                backgroundColor: isDarkMode
                                  ? "var(--color-surface-elevated)"
                                  : "#EBEBEB",
                                border: `1px dashed ${border}`,
                                textAlign: "center",
                              }}
                            />
                            <input
                              type="number"
                              value={it.unit_price}
                              onChange={(e) =>
                                updateItem(
                                  idx,
                                  "unit_price",
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                              min="0"
                              placeholder="0"
                              style={{
                                ...inputStyle,
                                fontSize: "13px",
                                padding: "8px 6px",
                                textAlign: "center",
                              }}
                            />
                            {items.length > 1 && (
                              <button
                                onClick={() => removeItem(idx)}
                                aria-label="Hapus baris produk"
                                title="Hapus baris produk"
                                style={{
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  padding: 0,
                                }}
                              >
                                <Trash2 size={14} color="var(--color-danger)" />
                              </button>
                            )}
                          </div>
                          {showConversion && (
                            <p
                              style={{
                                margin: "4px 0 0 4px",
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
                          {it._tier_applied && (
                            <p
                              style={{
                                margin: "4px 0 0 4px",
                                fontSize: "11px",
                                color: "var(--color-success)",
                                fontWeight: "600",
                              }}
                            >
                              🏷️ Harga grosir tier diaplikasikan
                            </p>
                          )}
                          {marginWarning && (
                            <div
                              style={{
                                marginTop: "6px",
                                padding: "8px 10px",
                                borderRadius: "10px",
                                border: `1px solid ${
                                  marginWarning.type === "danger"
                                    ? "var(--color-danger)"
                                    : "var(--color-warning)"
                                }`,
                                backgroundColor:
                                  marginWarning.type === "danger"
                                    ? "var(--color-danger-soft)"
                                    : "var(--color-warning-soft)",
                                color:
                                  marginWarning.type === "danger"
                                    ? "var(--color-danger)"
                                    : "var(--color-warning)",
                                fontSize: "11px",
                                lineHeight: 1.45,
                              }}
                            >
                              <strong>{marginWarning.title}</strong> —{" "}
                              {marginWarning.detail}
                            </div>
                          )}
                          {/* #3 anomali qty */}
                          {(() => {
                            const cust = (form.customer_name || "").trim().toLowerCase();
                            const key = `${(it.product_name || "").trim().toLowerCase()}||${cust}`;
                            const b = salesBaselines[key];
                            const qty = saleItemDisplayQty(it);
                            if (
                              !b ||
                              !b.n_samples ||
                              b.n_samples < 5 ||
                              !b.qty_std ||
                              b.qty_std <= 0 ||
                              !(qty > 0)
                            )
                              return null;
                            if (Math.abs(qty - b.qty_mean) <= 2 * b.qty_std) return null;
                            return (
                              <div
                                style={{
                                  marginTop: "6px",
                                  padding: "7px 10px",
                                  borderRadius: "9px",
                                  border: `1px solid var(--color-warning)`,
                                  backgroundColor: "var(--color-warning-soft)",
                                  color: "var(--color-warning)",
                                  fontSize: "11px",
                                  lineHeight: 1.4,
                                }}
                              >
                                Biasanya {Math.round(b.qty_mean)} {it.unit} (±
                                {Math.round(b.qty_std)}), ini {qty} — yakin?
                              </div>
                            );
                          })()}
                          {/* #10 sering dibeli bersama */}
                          {(() => {
                            const sugg =
                              copurchaseMap[(it.product_name || "").trim().toLowerCase()];
                            if (!sugg || !sugg.length) return null;
                            const cartNames = new Set(
                              items.map((x) => (x.product_name || "").trim().toLowerCase()),
                            );
                            const fresh = sugg
                              .filter((s) => !cartNames.has((s.name || "").toLowerCase()))
                              .slice(0, 2);
                            if (!fresh.length) return null;
                            return (
                              <div
                                style={{
                                  marginTop: "6px",
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: "6px",
                                  alignItems: "center",
                                }}
                              >
                                <span style={{ fontSize: "11px", color: sub }}>
                                  ✨ Sering dibeli bareng:
                                </span>
                                {fresh.map((s) => (
                                  <button
                                    key={s.name}
                                    type="button"
                                    disabled={!!addingInsightProduct}
                                    onClick={() => addInsightProduct({ product_name: s.name })}
                                    className="ui-focus-ring"
                                    style={{
                                      padding: "3px 9px",
                                      borderRadius: "999px",
                                      border: `1px solid var(--color-primary)`,
                                      backgroundColor: "var(--color-primary-soft)",
                                      color: "var(--color-primary)",
                                      fontSize: "11px",
                                      fontWeight: "700",
                                      cursor: addingInsightProduct ? "wait" : "pointer",
                                    }}
                                  >
                                    + {s.name} ({s.confidence}%)
                                  </button>
                                ))}
                              </div>
                            );
                          })()}
                          {batches.length > 0 && (
                            <div
                              style={{ marginTop: "4px", paddingLeft: "2px" }}
                            >
                              <select
                                // v1.16.3: value wajib pakai String() agar cocok dgn option value String(b.id)
                                value={String(it._selected_batch_id || '')}
                                onChange={(e) =>
                                  updateItem(
                                    idx,
                                    "_selected_batch",
                                    e.target.value,
                                  )
                                }
                                style={{

                                  ...inputStyle,
                                  fontSize: "11px",
                                  padding: "5px 8px",
                                  backgroundColor: isDarkMode
                                    ? "var(--color-surface-elevated)"
                                    : "#F0F8FF",
                                  border: `1px solid var(--color-primary-border-strong)`,
                                  color: "var(--color-primary)",
                                }}
                              >
                                <option value="">Pilih Batch</option>
                                {batches.map((b) => {
                                  const isHistorical = (b.qty_current || 0) <= 0;
                                  return (
                                    <option key={b.id || b.batch_no} value={String(b.id)}>
                                      {b.batch_no} | ED:{" "}
                                      {b.expired_date
                                        ? new Date(
                                            b.expired_date,
                                          ).toLocaleDateString("id-ID", {
                                            day: "2-digit",
                                            month: "short",
                                            year: "numeric",
                                          })
                                        : "-"}{" "}
                                      | Stok: {b.qty_current} | HPP
                                      {b.tax_type === "nota"
                                        ? " (nota)"
                                        : " (inc PPN)"}
                                      :{" "}
                                      {new Intl.NumberFormat("id-ID", {
                                        style: "currency",
                                        currency: "IDR",
                                        minimumFractionDigits: 0,
                                      }).format(
                                        b.tax_type === "nota"
                                          ? parseFloat(b.hna) || 0
                                          : hppFromHna(b.hna),
                                      )}
                                      {isHistorical ? " (historis)" : ""}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <button
                      onClick={addItem}
                      style={{
                        fontSize: "13px",
                        color: "var(--color-primary)",
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

                  {/* Notes */}
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "11px",
                        fontWeight: "700",
                        color: sub,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        marginBottom: "6px",
                      }}
                    >
                      Catatan
                    </label>
                    <textarea
                      value={form.notes}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, notes: e.target.value }))
                      }
                      rows={2}
                      placeholder="Opsional..."
                      style={{
                        ...inputStyle,
                        resize: "vertical",
                        fontFamily: "inherit",
                      }}
                    />
                  </div>

                  {/* v1.21.14: Ongkir (nota-level) */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "12px",
                      padding: "10px 0",
                      borderTop: `1px solid ${border}`,
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "12px",
                          fontWeight: "600",
                          color: sub,
                          marginBottom: "4px",
                        }}
                      >
                        Ongkir (ditagih ke customer)
                      </label>
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={form.ongkir}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, ongkir: e.target.value }))
                        }
                        placeholder="0"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "12px",
                          fontWeight: "600",
                          color: sub,
                          marginBottom: "4px",
                        }}
                      >
                        Biaya kurir asli (opsional)
                      </label>
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={form.ongkir_cost}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, ongkir_cost: e.target.value }))
                        }
                        placeholder="0"
                        style={inputStyle}
                      />
                      <span
                        style={{
                          fontSize: "10px",
                          color: "var(--color-text-subtle)",
                          display: "block",
                          marginTop: "2px",
                        }}
                      >
                        Buat hitung untung — TIDAK muncul di nota
                      </span>
                    </div>
                  </div>

                  {/* v1.31.0: Estimasi berat paket — info logistik, tidak mengubah harga/stok */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: isMobile
                        ? "1fr"
                        : "minmax(0, 1fr) minmax(180px, 0.8fr)",
                      gap: "12px",
                      padding: "12px",
                      borderTop: `1px solid ${border}`,
                      borderRadius: "12px",
                      backgroundColor: "var(--color-surface-elevated)",
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "12px",
                          fontWeight: "600",
                          color: sub,
                          marginBottom: "4px",
                        }}
                      >
                        Berat kemasan (gram)
                      </label>
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={form.package_weight_gram || ""}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            package_weight_gram: e.target.value,
                          }))
                        }
                        placeholder="Contoh: 250"
                        style={inputStyle}
                      />
                      <span
                        style={{
                          fontSize: "10px",
                          color: "var(--color-text-subtle)",
                          display: "block",
                          marginTop: "4px",
                        }}
                      >
                        Input manual per nota, untuk estimasi ongkir/pengiriman.
                      </span>
                    </div>
                    <div
                      style={{
                        border: `1px solid ${border}`,
                        borderRadius: "10px",
                        padding: "10px 12px",
                        backgroundColor: "var(--color-surface)",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        gap: "4px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "11px",
                          color: sub,
                          fontWeight: "700",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        Estimasi berat
                      </span>
                      <strong
                        style={{
                          color: "var(--color-primary)",
                          fontSize: "20px",
                          lineHeight: 1.1,
                        }}
                      >
                        {estimatedWeightGram > 0
                          ? `${fmtKg(estimatedWeightGram)} kg`
                          : "Belum ada"}
                      </strong>
                      <span
                        style={{
                          fontSize: "10px",
                          color: "var(--color-text-subtle)",
                        }}
                      >
                        {missingWeightCount > 0
                          ? `${missingWeightCount} produk belum punya berat di Inventory.`
                          : "Berat produk + kemasan."}
                      </span>
                    </div>
                  </div>

                  {/* Total */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "12px 0",
                      borderTop: `1px solid ${border}`,
                    }}
                  >
                    <span
                      style={{
                        fontSize: "14px",
                        fontWeight: "600",
                        color: sub,
                      }}
                    >
                      Grand Total
                    </span>
                    <span
                      style={{
                        fontSize: "18px",
                        fontWeight: "800",
                        color: "var(--color-success)",
                      }}
                    >
                      {fmtRp(grandTotal)}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      flexWrap: "wrap",
                      padding: "10px 0",
                      borderTop: `1px solid ${border}`,
                    }}
                  >
                    <button
                      type="button"
                      onClick={handleCopyWaMessage}
                      style={{
                        flex: "1 1 150px",
                        padding: "10px 12px",
                        border: `1px solid ${border}`,
                        borderRadius: "10px",
                        backgroundColor: "var(--color-surface-elevated)",
                        color: text,
                        cursor: "pointer",
                        fontSize: "12px",
                        fontWeight: "700",
                      }}
                    >
                      Salin Draft WA
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenWaMessage}
                      style={{
                        flex: "1 1 150px",
                        padding: "10px 12px",
                        border: `1px solid var(--color-success)`,
                        borderRadius: "10px",
                        backgroundColor: "var(--color-success-soft)",
                        color: "var(--color-success)",
                        cursor: "pointer",
                        fontSize: "12px",
                        fontWeight: "800",
                      }}
                    >
                      Buka WhatsApp
                    </button>
                  </div>

                  {/* Buttons */}
                  <div style={{ display: "flex", gap: "10px" }}>
                    <FieldError
                      message={formErrors.items}
                      visible={!!formErrors.items}
                    />
                    <button
                      onClick={() => handleSave()}
                      disabled={saving}
                      style={{
                        flex: 1,
                        padding: "13px",
                        backgroundColor: saving
                          ? "var(--color-text-subtle)"
                          : "var(--color-success)",
                        color: "#FFF",
                        border: "none",
                        borderRadius: "10px",
                        cursor: saving ? "not-allowed" : "pointer",
                        fontWeight: "700",
                        fontSize: "14px",
                        opacity: saving ? 0.7 : 1,
                      }}
                    >
                      {saving
                        ? "Menyimpan..."
                        : editId
                          ? "Simpan Perubahan"
                          : "Buat Nota"}
                    </button>
                    <button
                      onClick={() => setShowModal(false)}
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
                <div
                  style={{
                    position: isMobile ? "static" : "sticky",
                    top: "0",
                    alignSelf: "start",
                    display:
                      isMobile && formTab !== "preview" ? "none" : "block",
                    minWidth: 0,
                  }}
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
                  <NotaPreview
                    form={{
                      ...form,
                      package_weight_gram: packageWeightGram,
                      est_weight_gram: estimatedWeightGram,
                      order_number: editId
                        ? form.order_number
                        : isAutoNota
                          ? notaCounter.next_preview ||
                            `${notaCounter.prefix || "HSB-NOTA-"}${String((notaCounter.month_max || 0) + 1).padStart(3, "0")}`
                          : `${notaCounter.prefix || "HSB-NOTA-"}${manualNumber}`,
                    }}
                    items={items}
                    settings={layoutSettings || {}}
                  />
                </div>
              </div>
            </div>
          </div>,
        )}

      {/* Print Options Modal */}
      {showPrintModal &&
        renderPortal(
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              backdropFilter: "blur(4px)",
            }}
          >
            <div
              className="ui-motion-modal ui-modal-shell"
              style={{
                backgroundColor: cardBg,
                width: "100%",
                maxWidth: "360px",
                borderRadius: "20px",
                padding: "24px",
                boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "20px",
                }}
              >
                <h2
                  style={{
                    fontSize: "18px",
                    fontWeight: "700",
                    margin: 0,
                    color: text,
                  }}
                >
                  Opsi Cetak
                </h2>
                <button
                  onClick={() => setShowPrintModal(false)}
                  aria-label="Tutup modal cetak PDF"
                  className="ui-motion-button ui-focus-ring"
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: sub,
                    padding: "10px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: "40px",
                    minHeight: "40px",
                  }}
                >
                  <X size={20} />
                </button>
              </div>

              <div style={{ marginBottom: "20px" }}>
                <label style={{ ...labelStyle, marginBottom: "12px" }}>
                  Ukuran Kertas
                </label>
                <div style={{ display: "flex", gap: "10px" }}>
                  {["A5", "A6"].map((f) => (
                    <button
                      key={f}
                      onClick={() =>
                        setPrintOptions({ ...printOptions, format: f })
                      }
                      style={{
                        flex: 1,
                        padding: "12px",
                        borderRadius: "12px",
                        border: `2px solid ${printOptions.format === f ? "var(--color-primary)" : border}`,
                        backgroundColor:
                          printOptions.format === f
                            ? "var(--color-primary-soft-weak)"
                            : "transparent",
                        color:
                          printOptions.format === f
                            ? "var(--color-primary)"
                            : text,
                        fontWeight: "700",
                        cursor: "pointer",
                        transition: uiTransition(
                          "all",
                          UI_MOTION.duration.base,
                        ),
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "2px",
                      }}
                    >
                      <span style={{ fontSize: "15px" }}>{f}</span>
                      {f === "A5" && (
                        <span
                          style={{
                            fontSize: "9px",
                            fontWeight: "500",
                            opacity: 0.8,
                          }}
                        >
                          (Landscape)
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: "24px" }}>
                <label style={{ ...labelStyle, marginBottom: "12px" }}>
                  Tipe Dokumen
                </label>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      cursor: "pointer",
                      padding: "10px",
                      borderRadius: "10px",
                      backgroundColor: isDarkMode
                        ? "var(--color-surface-raised)"
                        : "var(--color-bg)",
                    }}
                  >
                    <input
                      type="radio"
                      checked={printOptions.type === "nota"}
                      onChange={() =>
                        setPrintOptions({ ...printOptions, type: "nota" })
                      }
                    />
                    <span style={{ fontSize: "14px", color: text }}>
                      Nota Penjualan
                    </span>
                  </label>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      cursor:
                        printOptions.format === "A6"
                          ? "pointer"
                          : "not-allowed",
                      opacity: printOptions.format === "A6" ? 1 : 0.5,
                      padding: "10px",
                      borderRadius: "10px",
                      backgroundColor: isDarkMode
                        ? "var(--color-surface-raised)"
                        : "var(--color-bg)",
                    }}
                  >
                    <input
                      type="radio"
                      checked={printOptions.type === "terima"}
                      disabled={printOptions.format !== "A6"}
                      onChange={() =>
                        setPrintOptions({ ...printOptions, type: "terima" })
                      }
                    />
                    <span style={{ fontSize: "14px", color: text }}>
                      Tanda Terima (Khusus A6)
                    </span>
                  </label>
                </div>
              </div>

              <button
                onClick={handlePrintPDF}
                disabled={pdfLoading}
                style={{
                  width: "100%",
                  padding: "14px",
                  backgroundColor: "var(--color-primary)",
                  color: "#FFF",
                  border: "none",
                  borderRadius: "14px",
                  cursor: pdfLoading ? "not-allowed" : "pointer",
                  fontWeight: "700",
                  fontSize: "15px",
                  opacity: pdfLoading ? 0.7 : 1,
                }}
              >
                {pdfLoading ? "Membuat PDF..." : "Cetak Sekarang"}
              </button>
            </div>
          </div>,
        )}

      {/* Payment Date Modal */}
      {paymentModal.open &&
        renderPortal(
          <div
            onClick={() =>
              setPaymentModal({
                open: false,
                order: null,
                date: "",
                mode: "pay",
              })
            }
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10000,
              backdropFilter: "blur(4px)",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                backgroundColor: cardBg,
                width: "100%",
                maxWidth: "360px",
                borderRadius: "20px",
                padding: "24px",
                boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "20px",
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
                  {paymentModal.mode === "edit"
                    ? "✏️ Edit Tanggal Pelunasan"
                    : "💰 Konfirmasi Pelunasan"}
                </h3>
                <button
                  onClick={() =>
                    setPaymentModal({
                      open: false,
                      order: null,
                      date: "",
                      mode: "pay",
                    })
                  }
                  aria-label="Tutup modal pembayaran"
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
              <div style={{ marginBottom: "20px" }}>
                <label style={labelStyle}>Tanggal Pelunasan</label>
                <input
                  type="date"
                  value={paymentModal.date}
                  onChange={(e) =>
                    setPaymentModal((p) => ({ ...p, date: e.target.value }))
                  }
                  style={inputStyle}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <button
                  onClick={handlePaymentSave}
                  disabled={paymentSaving || !paymentModal.date}
                  style={{
                    width: "100%",
                    padding: "13px",
                    backgroundColor: paymentSaving
                      ? "var(--color-text-subtle)"
                      : "var(--color-success)",
                    color: "#FFF",
                    border: "none",
                    borderRadius: "10px",
                    cursor: paymentSaving ? "not-allowed" : "pointer",
                    fontWeight: "700",
                    fontSize: "14px",
                  }}
                >
                  {paymentSaving ? "Menyimpan..." : "Simpan"}
                </button>
                {paymentModal.mode === "edit" && (
                  <button
                    onClick={handlePaymentUnpay}
                    disabled={paymentSaving}
                    style={{
                      width: "100%",
                      padding: "13px",
                      backgroundColor: "transparent",
                      color: "var(--color-danger)",
                      border: "1px solid var(--color-danger)",
                      borderRadius: "10px",
                      cursor: paymentSaving ? "not-allowed" : "pointer",
                      fontWeight: "600",
                      fontSize: "14px",
                    }}
                  >
                    Batalkan Pelunasan
                  </button>
                )}
                <button
                  onClick={() =>
                    setPaymentModal({
                      open: false,
                      order: null,
                      date: "",
                      mode: "pay",
                    })
                  }
                  disabled={paymentSaving}
                  style={{
                    width: "100%",
                    padding: "13px",
                    backgroundColor: isDarkMode
                      ? "var(--color-surface-raised)"
                      : "var(--color-bg)",
                    color: text,
                    border: "none",
                    borderRadius: "10px",
                    cursor: "pointer",
                    fontWeight: "600",
                    fontSize: "14px",
                  }}
                >
                  Batal
                </button>
              </div>
            </div>
          </div>,
        )}

      {/* Delete Confirm Modal */}
      <ConfirmModal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={confirmDelete}
        title="Hapus Nota"
        message="Apakah Anda yakin ingin menghapus nota ini? Tindakan ini tidak dapat dibatalkan."
        isDarkMode={isDarkMode}
      />

      <ToastNotice message={toast} type={toastType} isMobile={isMobile} />
    </div>
  );
}
