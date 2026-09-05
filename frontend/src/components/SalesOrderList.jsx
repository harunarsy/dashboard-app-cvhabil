import React, { useState, useEffect, useRef, useMemo } from "react";
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
  Clock,
  AlertTriangle,
  RotateCcw,
  MessageCircle,
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
import NewProductModal from "./common/NewProductModal";
import LoanList from "./LoanList";
import Skeleton from "./common/Skeleton";
import ConfirmModal from "./common/ConfirmModal";
import Breadcrumb from "./common/Breadcrumb";
import NotaPreview from "./common/NotaPreview";
import EmptyState, { EmptyStateIcons } from "./common/EmptyState";
import Icons from "./common/Icon";
import RupiahInput from "./common/RupiahInput";
import { UI_MOTION, uiTransition } from "../constants/ui";
import useBodyScrollLock from "../hooks/useBodyScrollLock";
import FieldError from "./common/FieldError";
import SearchBox from "./common/SearchBox";
import ToastNotice from "./common/ToastNotice";
import useDebouncedValue from "../hooks/useDebouncedValue";
import {
  buildNotaWaMessage,
  buildDueReminderMessage,
  buildWaUrl,
  copyTextToClipboard,
} from "../utils/waMessage";
import {
  useSalesOrders,
  useCustomers,
  useProducts,
} from "../hooks/useMasterData";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "../lib/queryClient";
import Pagination from "./common/Pagination";
import { importWithReload } from "../utils/importWithReload";
import { dateOnlyTimestamp, formatDateOnly } from "../utils/dateOnly";

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
// v1.37.0: pilih default batch FEFO — utamakan batch in-stock & belum ED (ED terdekat),
// fallback ke batch pertama (mis. semua stok 0) supaya nota tetap punya source batch+ED.
const pickFefoBatch = (batches) => {
  if (!batches || !batches.length) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTime = today.getTime();
  const sortByEd = (arr) =>
    [...arr].sort((a, b) => {
      const ea = dateOnlyTimestamp(a.expired_date) ?? Infinity;
      const eb = dateOnlyTimestamp(b.expired_date) ?? Infinity;
      return ea - eb;
    });
  const inStock = batches.filter(
    (b) =>
      (parseFloat(b.qty_current) || 0) > 0 &&
      (!b.expired_date || dateOnlyTimestamp(b.expired_date) >= todayTime),
  );
  return sortByEd(inStock)[0] || sortByEd(batches)[0];
};
const fmtDate = (d) =>
  formatDateOnly(d, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
// Tanggal + nama hari (mis. "Selasa, 01 Jul 2026") — buat info jatuh tempo.
const fmtDateDay = (d) => {
  if (!d) return "-";
  const dt = new Date(String(d).split("T")[0] + "T00:00:00");
  if (isNaN(dt.getTime())) return "-";
  return dt.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};
const addDays = (dateStr, n) => {
  const base = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
  base.setDate(base.getDate() + n);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
};
const notaDaysDiff = (dateStr) => {
  if (!dateStr) return null;
  // due_date bisa date-only ("2026-06-19") atau ISO penuh → ambil tanggalnya saja.
  const d = new Date(String(dateStr).split("T")[0] + "T00:00:00");
  if (isNaN(d.getTime())) return null;
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
}) {
  // v1.46.0: TanStack Query — list & master di-cache (kunjungan ulang instan).
  // fetchX = refetch (call-site refresh lama tetap jalan). products buang ONGKIR via useMemo.
  const {
    data: orders = [],
    isLoading: loading,
    refetch: fetchOrders,
  } = useSalesOrders();
  const queryClient = useQueryClient();
  // Optimistic: patch cache list dari response server (full row) → row langsung
  // muncul/terupdate tanpa nunggu refetch. fetchOrders() tetap dipanggil utk
  // rekonsiliasi (mis. items via json_agg yg tidak ada di RETURNING).
  const upsertOrderCache = (saved) => {
    if (!saved?.id) return;
    queryClient.setQueryData(qk.salesList, (prev = []) => {
      const list = prev || [];
      return list.some((o) => o.id === saved.id)
        ? list.map((o) => (o.id === saved.id ? { ...o, ...saved } : o))
        : [saved, ...list];
    });
  };
  const { data: customers = [], refetch: fetchCustomers } = useCustomers();
  const { data: productsRaw = [], refetch: fetchProducts } = useProducts();
  const products = useMemo(
    () =>
      (productsRaw || []).filter(
        (p) => (p.name || "").trim().toUpperCase() !== "ONGKIR",
      ),
    [productsRaw],
  );
  // v1.7.0 multi-select bulk export
  const [selectedNotaIds, setSelectedNotaIds] = useState(new Set());
  const [exportingPdf, setExportingPdf] = useState(false);
  const [profitThresholds, setProfitThresholds] = useState(
    DEFAULT_PROFIT_THRESHOLDS,
  );
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  // v1.54.0: tab Penjualan | Pinjaman — peminjaman produk (LoanList) numpang halaman ini
  const [pageTab, setPageTab] = useState("nota");
  const [showModal, setShowModal] = useState(false);
  // Auto-buka modal create saat datang dari Akses Cepat Dashboard (state quickCreate).
  const location = useLocation();
  useEffect(() => {
    if (location.state?.quickCreate) {
      setShowModal(true);
      window.history.replaceState({}, document.title); // cegah re-open saat reload/back
    }
    // v1.54.0: banner pinjaman overdue di Dashboard → langsung buka tab Pinjaman
    if (location.state?.loanTab) {
      setPageTab("pinjaman");
      window.history.replaceState({}, document.title);
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
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [paymentModal, setPaymentModal] = useState({
    open: false,
    order: null,
    date: "",
    mode: "pay",
  });
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [notesEdit, setNotesEdit] = useState({ open: false, order: null, notes: "", saving: false });
  const [adjustmentHistory, setAdjustmentHistory] = useState([]);
  const [adjustmentHistoryLoading, setAdjustmentHistoryLoading] = useState(false);
  const [adjustmentPrint, setAdjustmentPrint] = useState({ open: false, data: null, format: "A5", saving: false });
  const [adjustmentModal, setAdjustmentModal] = useState({
    open: false,
    order: null,
    originalItems: [],
    lines: [],
    originalItemId: "",
    item: null,
    replacementProductId: "",
    replacementProductName: "",
    returnQty: "1",
    replacementQty: "1",
    replacementBatchId: "",
    replacementUnitPrice: "",
    sourceInvoiceId: "",
    idempotencyKey: "",
    returnCondition: "saleable",
    conditionReason: "",
    reason: "",
    batches: [],
    loading: false,
    saving: false,
  });
  // v1.49.0: tandai lunas massal (centang beberapa nota → lunas + tanggal serentak)
  const [bulkPay, setBulkPay] = useState({ open: false, date: "", saving: false });
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
  // v1.65.8: modal buat produk baru langsung dari dropdown item (produk baru wajib punya KODE)
  const [newProductFor, setNewProductFor] = useState(null); // { name, idx }
  const [customerInsights, setCustomerInsights] = useState([]);
  const [customerInsightsLoading, setCustomerInsightsLoading] = useState(false);
  const [addingInsightProduct, setAddingInsightProduct] = useState("");
  // v1.56.2: di 768–1023px (iPad portrait) form & preview berdampingan → kolom form
  // cuma ~360px; grid item 6-kolom desktop tidak muat. Layout item bertumpuk dipakai
  // bila isMobile ATAU viewport < 1024 (bukan cuma <768).
  const [viewportW, setViewportW] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1440,
  );
  useEffect(() => {
    const onResize = () => setViewportW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const stackedItems = isMobile || viewportW < 1024;

  // v1.56.0: markup harga dari HPP (+5/+10/+15/custom %) — custom % diingat antar sesi
  const [customMarkupPct, setCustomMarkupPct] = useState(() => {
    try {
      return localStorage.getItem("habil_markup_custom") || "";
    } catch (e) {
      return "";
    }
  });
  const saveCustomMarkup = (v) => {
    setCustomMarkupPct(v);
    try {
      localStorage.setItem("habil_markup_custom", v);
    } catch (e) {
      /* private mode — abaikan */
    }
  };
  // v1.56.3: pembulatan 3 arah — bawah / setengah / atas. Step: ≥10rb → ribuan
  // (setengah = 500), <10rb → ratusan (setengah = 50).
  // Contoh 76.123 → ⬇76.000 · ½76.500 · ⬆77.000.
  const roundStepFor = (v) => (v >= 10000 ? 1000 : 100);
  const roundDownPrice = (v) => Math.floor(v / roundStepFor(v)) * roundStepFor(v);
  const roundHalfPrice = (v) => {
    const half = roundStepFor(v) / 2;
    return Math.ceil(v / half) * half;
  };
  const roundUpPrice = (v) =>
    Math.ceil(v / roundStepFor(v)) * roundStepFor(v);
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
  // Trash (nota terhapus → bisa dipulihkan)
  const [showTrash, setShowTrash] = useState(false);
  const [trashItems, setTrashItems] = useState([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [restoringId, setRestoringId] = useState(null);
  useBodyScrollLock(showModal || showPrintModal || !!deleteConfirmId || showTrash);
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

  // v1.49.0: tandai lunas massal — semua nota terpilih jadi 'paid' di tanggal sama.
  const openBulkPay = () => {
    if (selectedNotaIds.size === 0) return;
    setBulkPay({
      open: true,
      date: new Date().toISOString().split("T")[0],
      saving: false,
    });
  };
  const handleBulkPaySave = async () => {
    if (!bulkPay.date || selectedNotaIds.size === 0) return;
    setBulkPay((p) => ({ ...p, saving: true }));
    const ids = orders
      .filter((o) => selectedNotaIds.has(o.id) && o.payment_status !== "paid")
      .map((o) => o.id);
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      try {
        await salesAPI.updatePaymentStatus(id, "paid", bulkPay.date);
        ok++;
      } catch (e) {
        fail++;
        console.error("Bulk pay gagal utk nota", id, e);
      }
    }
    await fetchOrders();
    setBulkPay({ open: false, date: "", saving: false });
    setSelectedNotaIds(new Set());
    flash(
      fail === 0
        ? `${ok} nota ditandai lunas`
        : `${ok} nota lunas, ${fail} gagal — cek koneksi`,
      fail === 0 ? "success" : "error",
    );
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
  // v1.65.8: produk baru wajib punya KODE (backend menolak tanpa code) — buka modal
  // NewProductModal yang mengurus KODE, bukan panggil createProduct langsung dari sini.
  const handleAddProduct = (name, idx) => {
    setNewProductFor({ name, idx });
  };

  // Dipanggil NewProductModal setelah produk baru (atau produk existing yang dipilih
  // ulang via _reusedExisting) selesai dibuat.
  const handleProductCreated = async (prod) => {
    const idx = newProductFor?.idx;
    await fetchProducts(); // segarkan master produk supaya dropdown & lookup lain ikut update
    if (idx != null) {
      await updateItem(idx, "product_name", prod.name);
      // Jaga-jaga: kalau closure `products` di updateItem masih data lama (refetch
      // belum ke-render ulang), _product_id bisa lolos null — tambal manual dari
      // objek produk yang baru dibuat/dipilih.
      setItems((prev) => {
        const next = [...prev];
        if (next[idx] && !next[idx]._product_id) {
          next[idx] = { ...next[idx], _product_id: prod.id, _product: prod };
        }
        return next;
      });
    }
    flash(prod._reusedExisting ? "Produk dipilih" : "Produk ditambahkan");
    setNewProductFor(null);
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
    // orders/customers/products auto-fetch via hooks TanStack Query.
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

  const loadDraft = async () => {
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

    // v1.52.2: hidrasi batch per item saat draft dipulihkan — dulu itemBatches
    // dikosongkan sehingga batch picker (render kalau batches.length>0) hilang &
    // batch yang sebelumnya terpilih tidak muncul sampai user klik manual.
    // Mirror alur Edit: fetch semua batch per produk lalu re-match batch terpilih.
    for (let idx = 0; idx < draftItems.length; idx++) {
      const item = draftItems[idx];
      if (!item?.product_name) continue;
      const prod = products.find(
        (p) => p.name?.toLowerCase() === item.product_name?.toLowerCase(),
      );
      if (!prod) continue;
      try {
        const { data: allBatches } = await inventoryAPI.getProductBatches(
          prod.id,
        );
        const batches = allBatches || [];
        // re-match batch terpilih: by id dulu, fallback ke batch_no
        const selId = item._selected_batch_id;
        const selNo = item._selected_batch || item.batch_no_snapshot;
        let matched = null;
        if (selId != null && !String(selId).startsWith("legacy-")) {
          matched = batches.find((b) => String(b.id) === String(selId));
        }
        if (!matched && selNo) {
          matched = batches.find((b) => b.batch_no === selNo);
        }
        setItemBatches((prev) => {
          const n = [...prev];
          n[idx] = batches;
          return n;
        });
        setItems((prev) => {
          const n = [...prev];
          if (n[idx]) {
            n[idx] = {
              ...n[idx],
              _product: prod,
              ...(matched
                ? {
                    _selected_batch_id: matched.id,
                    _selected_batch: matched.batch_no,
                    batch_no_snapshot: matched.batch_no,
                    expired_date_snapshot: matched.expired_date,
                  }
                : {}),
            };
          }
          return n;
        });
      } catch (e) {
        console.error("Error hidrasi batch draft:", e);
      }
    }
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
    flash("Draft tersimpan sudah dihapus");
  };

  // Filters
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterChannel, setFilterChannel] = useState("all");
  const [filterProfit, setFilterProfit] = useState("all");
  const [filterPpn, setFilterPpn] = useState("all"); // v1.65.1: filter PPN — all | ppn | non_ppn
  const [filterDue, setFilterDue] = useState("all"); // all | overdue | soon
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
      // angka di query → cari juga berdasarkan TOTAL nominal (mis. "236250").
      const qDigits = q.replace(/\D/g, "");
      const totalDigits = String(Math.round(parseFloat(o.total) || 0));
      const matchesSearch =
        !q ||
        o.order_number.toLowerCase().includes(q) ||
        o.customer_name.toLowerCase().includes(q) ||
        (qDigits.length >= 3 && totalDigits.includes(qDigits)) ||
        // cari berdasarkan NAMA PRODUK di dalam nota
        (Array.isArray(o.items) &&
          o.items.some((it) =>
            (it.product_name || "").toLowerCase().includes(q),
          ));
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
      // v1.65.1: filter PPN — ppn_excluded null/undefined = perlakukan sebagai ber-PPN (dengan PPN)
      const matchesPpn =
        filterPpn === "all" ||
        (filterPpn === "ppn" && !o.ppn_excluded) ||
        (filterPpn === "non_ppn" && o.ppn_excluded === true);
      const dueDiff = notaDaysDiff(o.due_date);
      const unpaid = o.payment_status !== "paid";
      const matchesDue =
        filterDue === "all" ||
        (filterDue === "overdue" && dueDiff !== null && dueDiff < 0 && unpaid) ||
        (filterDue === "soon" &&
          dueDiff !== null &&
          dueDiff >= 0 &&
          dueDiff <= 7 &&
          unpaid);
      return (
        matchesSearch &&
        matchesMonth &&
        matchesYear &&
        matchesStatus &&
        matchesChannel &&
        matchesProfit &&
        matchesPpn &&
        matchesDue
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

  // Badge ringkasan jatuh tempo (atas daftar) — basis seluruh nota aktif.
  const overdueCount = orders.filter((o) => {
    const d = notaDaysDiff(o.due_date);
    return d !== null && d < 0 && o.payment_status !== "paid";
  }).length;
  const dueSoonCount = orders.filter((o) => {
    const d = notaDaysDiff(o.due_date);
    return d !== null && d >= 0 && d <= 7 && o.payment_status !== "paid";
  }).length;

  // v1.50.0: pagination (default 20). Reset hal saat filter/sort berubah.
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  useEffect(() => {
    setCurrentPage(1);
  }, [
    debouncedSearch,
    filterMonth,
    filterYear,
    filterStatus,
    filterChannel,
    filterProfit,
    filterPpn, // v1.65.1: reset halaman saat filter PPN berubah
    filterDue,
    sortKey,
    sortDir,
    pageSize,
  ]);
  const pagedOrders =
    pageSize === -1
      ? filtered
      : filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

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
      ppn_excluded: false, // v1.65.0: Nota PPN vs Tanpa PPN
    });
    setItems([blankItem()]);
    setItemBatches([]);
    setFormErrors({});
    setSaveError("");
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
      ppn_excluded: !!order.ppn_excluded, // v1.65.0: Nota PPN vs Tanpa PPN
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
    setFormErrors({});
    setSaveError("");
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
            // v1.44.0: HPP nota DIBEKUKAN di snapshot saat terjual — JANGAN timpa
            // unit_hpp/tax_type dari batch terkini di sini (dulu auto-overwrite bikin
            // HPP "berubah-ubah" tiap nota dibuka di Edit, dan rawan salah saat harga
            // beli batch dikoreksi). Cukup set metadata batch utk picker. Refresh HPP
            // dilakukan EKSPLISIT via tombol "Perbarui HPP dari batch terkini".
            setItems((prev) => {
              const n = [...prev];
              if (n[idx]) {
                n[idx] = {
                  ...n[idx],
                  _selected_batch_id: matchedBatch.id,
                  _selected_batch: matchedBatch.batch_no,
                  batch_no_snapshot: matchedBatch.batch_no,
                  expired_date_snapshot: matchedBatch.expired_date,
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

  // v1.36.0: buka edit nota langsung dari klik nota di heatmap Dashboard
  // (navigate "/sales" state.editNotaNumber). Tunggu daftar nota termuat.
  useEffect(() => {
    const num = location.state?.editNotaNumber;
    if (!num || !orders.length) return;
    const target = orders.find((o) => o.order_number === num);
    if (target) {
      openEdit(target);
      window.history.replaceState({}, document.title);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, orders]);

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
      // v1.65.0: ppn_excluded — nota PPN vs Tanpa PPN
      payload.ppn_excluded = !!form.ppn_excluded;
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
        const res = await salesAPI.update(editId, { ...payload, status: "final" });
        upsertOrderCache(res?.data);
        flash("Nota diperbarui");
      } else {
        const res = await salesAPI.create(payload);
        upsertOrderCache(res?.data);
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
      flash("Nota dipindahkan ke trash");
      fetchOrders();
      fetchCounters(); // v1.8.4: re-sync preview ke MAX setelah delete
    } catch (e) {
      flash(e.response?.data?.error || e.message, "error");
    } finally {
      setDeleteConfirmId(null);
    }
  };

  // Trash: muat nota terhapus + pulihkan (restore re-deduct stok di backend).
  const fetchTrash = async () => {
    setTrashLoading(true);
    try {
      const r = await salesAPI.getTrash();
      setTrashItems(Array.isArray(r.data) ? r.data : []);
    } catch (e) {
      flash("Gagal memuat trash: " + (e.response?.data?.error || e.message), "error");
    } finally {
      setTrashLoading(false);
    }
  };
  const handleRestore = async (id) => {
    setRestoringId(id);
    try {
      await salesAPI.restore(id);
      flash("Nota dipulihkan");
      setTrashItems((prev) => prev.filter((t) => t.id !== id));
      fetchOrders();
      fetchCounters();
    } catch (e) {
      flash(e.response?.data?.error || e.message, "error");
    } finally {
      setRestoringId(null);
    }
  };

  const openNotesEdit = (order) => setNotesEdit({ open: true, order, notes: order.notes || "", saving: false });
  const saveNotesEdit = async () => {
    if (!notesEdit.order || notesEdit.saving) return;
    setNotesEdit((prev) => ({ ...prev, saving: true }));
    try {
      const { data } = await salesAPI.updateNotes(notesEdit.order.id, notesEdit.notes);
      upsertOrderCache(data);
      flash("Catatan nota diperbarui");
      setNotesEdit({ open: false, order: null, notes: "", saving: false });
      fetchOrders();
    } catch (e) {
      flash(e.response?.data?.error || e.message, "error");
      setNotesEdit((prev) => ({ ...prev, saving: false }));
    }
  };

  const loadReplacementBatches = async (productId) => {
    if (!productId) {
      setAdjustmentModal((prev) => ({ ...prev, batches: [], replacementBatchId: "", loading: false }));
      return;
    }
    setAdjustmentModal((prev) => ({ ...prev, loading: true, batches: [], replacementBatchId: "" }));
    try {
      const { data } = await inventoryAPI.getProductBatches(productId);
      const batches = Array.isArray(data) ? data : [];
      setAdjustmentModal((prev) => ({
        ...prev,
        batches,
        replacementBatchId: String(batches.find((batch) => Number(batch.qty_current) > 0)?.id || ""),
        loading: false,
      }));
    } catch (error) {
      flash(error.response?.data?.error || error.message, "error");
      setAdjustmentModal((prev) => ({ ...prev, loading: false }));
    }
  };

  const loadLineBatches = async (lineIndex, productId) => {
    if (!productId) return;
    setAdjustmentModal((prev) => ({
      ...prev,
      lines: prev.lines.map((line, index) => index === lineIndex ? { ...line, loading: true, batches: [], replacementBatchId: "" } : line),
    }));
    try {
      const { data } = await inventoryAPI.getProductBatches(productId);
      const batches = Array.isArray(data) ? data : [];
      setAdjustmentModal((prev) => ({
        ...prev,
        lines: prev.lines.map((line, index) => index === lineIndex ? {
          ...line,
          batches,
          replacementBatchId: String(batches.find((batch) => Number(batch.qty_current) > 0)?.id || ""),
          loading: false,
        } : line),
      }));
    } catch (error) {
      flash(error.response?.data?.error || error.message, "error");
      setAdjustmentModal((prev) => ({
        ...prev,
        lines: prev.lines.map((line, index) => index === lineIndex ? { ...line, loading: false } : line),
      }));
    }
  };

  const openAdjustment = async (order) => {
    const originalItems = (order.items || []).filter((candidate) => candidate.batch_id_snapshot);
    if (!originalItems.length) {
      flash("Nota ini tidak memiliki snapshot batch untuk retur.", "error");
      return;
    }
    const lines = originalItems.map((item) => {
      const product = products.find(
        (candidate) => candidate.name?.trim().toLowerCase() === item.product_name?.trim().toLowerCase(),
      );
      return {
        originalItemId: String(item.id),
        item,
        replacementProductId: String(product?.id || ""),
        replacementProductName: product?.name || item.product_name,
        returnQty: String(item.qty_in_unit || item.qty || 1),
        replacementQty: String(item.qty_in_unit || item.qty || 1),
        replacementBatchId: "",
        replacementUnitPrice: String(item.unit_price || ""),
        sourceInvoiceNumber: "",
        returnCondition: "saleable",
        conditionReason: "",
        batches: [],
        loading: false,
      };
    });
    if (lines.some((line) => !line.replacementProductId)) {
      flash("Ada produk nota yang tidak ditemukan di master produk.", "error");
      return;
    }
    const idempotencyKey = `adjustment-${order.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setAdjustmentModal((prev) => ({
      ...prev,
      open: true,
      order,
      originalItems,
      lines,
      idempotencyKey,
      loading: true,
    }));
    setAdjustmentHistoryLoading(true);
    try {
      const { data } = await salesAPI.getAdjustments(order.id);
      setAdjustmentHistory(Array.isArray(data) ? data : []);
    } catch (error) {
      flash(error.response?.data?.error || error.message, "error");
      setAdjustmentHistory([]);
    } finally {
      setAdjustmentHistoryLoading(false);
    }
    await Promise.all(lines.map((line, index) => loadLineBatches(index, line.replacementProductId)));
  };

  const selectOriginalItem = async (itemId) => {
    const item = adjustmentModal.originalItems.find((candidate) => String(candidate.id) === String(itemId));
    if (!item) return;
    const product = products.find(
      (candidate) => candidate.name?.trim().toLowerCase() === item.product_name?.trim().toLowerCase(),
    );
    if (!product) {
      flash("Produk retur tidak ditemukan di master produk.", "error");
      return;
    }
    setAdjustmentModal((prev) => ({
      ...prev,
      originalItemId: String(item.id),
      item,
      replacementProductId: String(product.id),
      replacementProductName: product.name,
      returnQty: String(item.qty_in_unit || item.qty || 1),
      replacementQty: String(item.qty_in_unit || item.qty || 1),
      replacementUnitPrice: String(item.unit_price || ""),
    }));
    await loadReplacementBatches(product.id);
  };

  const saveAdjustment = async () => {
    if (adjustmentModal.saving || !adjustmentModal.order || !adjustmentModal.lines.length) return;
    if (!adjustmentModal.reason.trim() || adjustmentModal.lines.some((line) => (
      !Number.isFinite(Number(line.returnQty)) || Number(line.returnQty) <= 0 ||
      !Number.isFinite(Number(line.replacementQty)) || Number(line.replacementQty) <= 0 ||
      !Number.isFinite(Number(line.replacementBatchId)) ||
      (line.returnCondition !== "saleable" && !line.conditionReason.trim())
    ))) {
      flash("Isi alasan, semua qty, batch pengganti, dan keterangan kondisi retur.", "error");
      return;
    }
    setAdjustmentModal((prev) => ({ ...prev, saving: true }));
    try {
      const { data: created } = await salesAPI.createAdjustment(adjustmentModal.order.id, {
        type: "exchange",
        idempotency_key: adjustmentModal.idempotencyKey,
        reason: adjustmentModal.reason.trim(),
        items: adjustmentModal.lines.flatMap((line) => [
          {
            direction: "returned",
            original_sales_item_id: line.item.id,
            qty_base: Number(line.returnQty),
            qty_in_unit: Number(line.returnQty),
            unit: line.item.unit || "pcs",
            condition: line.returnCondition,
            condition_reason: line.conditionReason.trim() || undefined,
          },
          {
            direction: "replacement",
            replacement_batch_id: Number(line.replacementBatchId),
            qty_base: Number(line.replacementQty),
            qty_in_unit: Number(line.replacementQty),
            unit: line.item.unit || "pcs",
            product_name: line.replacementProductName,
            unit_price: Number(line.replacementUnitPrice) || 0,
            source_invoice_number: line.sourceInvoiceNumber.trim() || undefined,
          },
        ]),
      });
      flash("Retur/tukar berhasil dicatat. Nominal nota asli tetap.");
      const { data: history } = await salesAPI.getAdjustments(adjustmentModal.order.id);
      const posted = Array.isArray(history) ? history.find((entry) => entry.id === created.adjustment?.id) || history[0] : null;
      if (posted) {
        setAdjustmentPrint({
          open: true,
          format: "A5",
          saving: false,
          data: { ...posted, order_number: adjustmentModal.order.order_number, customer_name: adjustmentModal.order.customer_name, payment_status: adjustmentModal.order.payment_status },
        });
      }
      setAdjustmentHistory(Array.isArray(history) ? history : []);
      setAdjustmentModal({ open: false, order: null, originalItems: [], lines: [], originalItemId: "", item: null, replacementProductId: "", replacementProductName: "", returnQty: "1", replacementQty: "1", replacementBatchId: "", replacementUnitPrice: "", sourceInvoiceId: "", idempotencyKey: "", returnCondition: "saleable", conditionReason: "", reason: "", batches: [], loading: false, saving: false });
      fetchOrders();
    } catch (error) {
      flash(error.response?.data?.error || error.message, "error");
      setAdjustmentModal((prev) => ({ ...prev, saving: false }));
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
      const { generateNotaPDF } = await importWithReload(() => import("../utils/generateNotaPDF"));
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

  const handlePrintAdjustment = async () => {
    if (!adjustmentPrint.data || adjustmentPrint.saving) return;
    setAdjustmentPrint((prev) => ({ ...prev, saving: true }));
    try {
      const { generateAdjustmentPDF } = await importWithReload(() => import("../utils/generateAdjustmentPDF"));
      const doc = generateAdjustmentPDF(adjustmentPrint.data, {
        format: adjustmentPrint.format,
        settings: layoutSettings,
      });
      doc.save(`${adjustmentPrint.data.type === "return" ? "Retur" : "Tukar"}_${adjustmentPrint.data.adjustment_number}.pdf`);
      flash("Dokumen retur/tukar berhasil diunduh");
      setAdjustmentPrint({ open: false, data: null, format: "A5", saving: false });
    } catch (error) {
      flash(`Gagal membuat dokumen retur/tukar: ${error.message}`, "error");
      setAdjustmentPrint((prev) => ({ ...prev, saving: false }));
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

  // v1.44.0: sinkron HPP MANUAL (opt-in). Default nota DIBEKUKAN di HPP saat terjual
  // (laba historis aman). Tombol ini menarik ulang HPP dari batch terkini PER ITEM
  // (batch yg sama spt snapshot, fallback FEFO/legacy) — buat kasus KOREKSI harga
  // beli yg salah. Tidak otomatis: operator yg putuskan, lalu Simpan.
  const syncHppFromBatch = () => {
    let changed = 0;
    setItems((prev) =>
      prev.map((it, idx) => {
        const prod =
          it._product ||
          products.find(
            (p) => p.name?.toLowerCase() === it.product_name?.toLowerCase(),
          );
        if (!prod) return it;
        const batches = itemBatches[idx] || [];
        let b = null;
        if (it._selected_batch_id)
          b = batches.find((x) => String(x.id) === String(it._selected_batch_id));
        if (!b && it.batch_no_snapshot)
          b = batches.find((x) => x.batch_no === it.batch_no_snapshot);
        // batch sintetik legacy (id "legacy-...") = harga snapshot lama → skip (no-op)
        if (!b || String(b.id).startsWith("legacy-")) return it;
        const isPack = isPackUnit(it.unit, prod);
        const packSize = parseInt(prod.pack_size) || 1;
        const newHpp = (parseFloat(b.hna) || 0) * (isPack ? packSize : 1);
        const newTax = b.tax_type === "nota" ? "nota" : "faktur";
        if (
          Math.abs((parseFloat(it.unit_hpp) || 0) - newHpp) > 0.005 ||
          it.unit_hpp_tax_type !== newTax
        )
          changed++;
        return { ...it, unit_hpp: newHpp, unit_hpp_tax_type: newTax };
      }),
    );
    flash(
      changed > 0
        ? `HPP ${changed} item diperbarui dari batch terkini. Periksa lalu Simpan.`
        : "HPP sudah sama dengan batch terkini.",
      changed > 0 ? "success" : "info",
    );
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
        inventoryAPI.getProductBatches(match.id),
        inventoryAPI.getProductTiers(match.id).catch(() => ({ data: [] })),
      ]);
      const batches = batchesResp.data || [];
      const tiers = tiersResp.data || [];
      prepared._product = { ...match, price_tiers: tiers };
      const fefo = pickFefoBatch(batches);
      if (fefo) {
        prepared.unit_hpp = parseFloat(fefo.hna) || 0;
        prepared.unit_hpp_tax_type =
          fefo.tax_type === "nota" ? "nota" : "faktur";
        prepared._selected_batch = fefo.batch_no;
        prepared._selected_batch_id = fefo.id || null;
        prepared.batch_no_snapshot = fefo.batch_no;
        prepared.expired_date_snapshot = fefo.expired_date;
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
        await importWithReload(() => import("../utils/generateLaporanPDF"));
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
            inventoryAPI.getProductBatches(match.id),
            inventoryAPI.getProductTiers(match.id).catch(() => ({ data: [] })),
          ]);
          const batches = batchesResp.data || [];
          const tiers = tiersResp.data || [];
          updated._product = { ...match, price_tiers: tiers }; // v1.7.0: cache tiers di item
          setItemBatches((prev) => {
            const n = [...prev];
            n[idx] = batches;
            return n;
          });
          // Auto-select FEFO (batch in-stock ED terdekat; fallback batch pertama)
          const fefo = pickFefoBatch(batches);
          if (fefo) {
            updated.unit_hpp = parseFloat(fefo.hna) || 0;
            updated.unit_hpp_tax_type =
              fefo.tax_type === "nota" ? "nota" : "faktur";
            updated._selected_batch = fefo.batch_no;
            updated._selected_batch_id = fefo.id || null;
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
        setItemBatches((prev) => {
          const n = [...prev];
          n[idx] = [];
          return n;
        });
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

    setItems((prev) => prev.map((it, i) => (i === idx ? updated : it)));
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
  const currentWaMessage = () => {
    // enrich tiap item dgn batch_no + ED dari batch terpilih (atau snapshot saat edit)
    const enriched = items
      .map((item, idx) => {
        if (!item.product_name?.trim()) return null;
        const b = (itemBatches[idx] || []).find(
          (x) => String(x.id) === String(item._selected_batch_id),
        );
        return {
          ...item,
          _batch_no: item.batch_no_snapshot || b?.batch_no || item._selected_batch || "",
          _expired_date: item.expired_date_snapshot || b?.expired_date || "",
        };
      })
      .filter(Boolean);
    // v1.56.1: preview nomor auto WAJIB ikut format asli {prefix}{YYMM}{NNN} —
    // sebelumnya tanpa YYMM sehingga pesan WA bilang "HSB-NOTA-011" padahal
    // nota tersimpan jadi "HSB-NOTA-2607011".
    const now = new Date();
    const yymm = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const orderNumber = editId
      ? form.order_number
      : isAutoNota
        ? `${notaCounter.prefix || "HSB-NOTA-"}${yymm}${String((notaCounter.month_max || 0) + 1).padStart(3, "0")}`
        : `${notaCounter.prefix || "HSB-NOTA-"}${manualNumber}`;
    return buildNotaWaMessage({
      form,
      items: enriched,
      total: grandTotal,
      orderNumber,
      dueDate: form.payment_method !== "Tunai" ? form.due_date : "",
    });
  };
  const handleCopyWaMessage = async () => {
    const ok = await copyTextToClipboard(currentWaMessage());
    flash(
      ok ? "Draft pesan WA disalin" : "Gagal menyalin draft WA — coba lagi",
      ok ? "success" : "error",
    );
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
    padding: "7px 10px",
    border: `1px solid ${border}`,
    borderRadius: "9px",
    backgroundColor: "var(--color-surface-elevated)",
    color: text,
    fontSize: "13px",
    outline: "none",
    boxSizing: "border-box",
  };

  // v1.54.0: segmented tab Penjualan | Pinjaman — dipakai kedua branch render
  // v1.56.5: mobile centered + full-width biar seimbang
  const pageTabBar = (
    <div style={{ textAlign: isMobile ? "center" : "left" }}>
    <div
      style={{
        display: "inline-flex",
        gap: "4px",
        padding: "4px",
        borderRadius: "10px",
        backgroundColor: isDarkMode
          ? "var(--color-surface-raised)"
          : "var(--color-border)",
        marginBottom: "0.875rem",
      }}
    >
      {[
        { key: "nota", label: "Penjualan" },
        { key: "pinjaman", label: "Pinjaman" },
      ].map((t) => (
        <button
          key={t.key}
          onClick={() => setPageTab(t.key)}
          className="ui-motion-button"
          style={{
            padding: "6px 16px",
            borderRadius: "8px",
            border: "none",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: "13px",
            backgroundColor:
              pageTab === t.key ? "var(--color-action)" : "transparent",
            color: pageTab === t.key ? "#FFF" : isDarkMode ? "#FFF" : "#000",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
    </div>
  );

  if (pageTab === "pinjaman") {
    return (
      <div
        className="ui-page ui-motion-page"
        style={{
          padding: isMobile ? "1rem" : "2rem",
          paddingTop: isMobile ? "4rem" : "2rem",
          backgroundColor: "transparent",
          minHeight: "100vh",
          transition: uiTransition(
            "margin-left",
            UI_MOTION.duration.page,
            UI_MOTION.easing.standard,
          ),
        }}
      >
        <Breadcrumb
          title="Peminjaman Produk"
          count="barang dipinjam — belum dihitung penjualan"
          isMobile={isMobile}
          isDarkMode={isDarkMode}
        />
        {pageTabBar}
        <LoanList isDarkMode={isDarkMode} isMobile={isMobile} />
      </div>
    );
  }

  return (
    <div
      className="ui-page ui-motion-page"
      style={{
        padding: isMobile ? "1rem" : "2rem",
        paddingTop: isMobile ? "4rem" : "2rem",
        backgroundColor: "transparent",
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
      />
      {pageTabBar}

      {/* Toolbar aksi — mirror Faktur: tombol kiri · draft tengah · badge kanan */}
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          marginBottom: "1.25rem",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            flexWrap: "wrap",
            // v1.56.5: mobile — Buat Nota kiri, Trash kanan (full row)
            width: isMobile ? "100%" : undefined,
            justifyContent: isMobile ? "space-between" : "flex-start",
          }}
        >
          <button
            onClick={openAdd}
            className="ui-motion-button"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 14px",
              backgroundColor: "var(--color-success)",
              color: "#FFF",
              border: "none",
              borderRadius: "9px",
              cursor: "pointer",
              fontWeight: "700",
              fontSize: "13px",
            }}
          >
            <Plus size={15} /> Buat Nota
          </button>
          <button
            onClick={() => {
              const next = !showTrash;
              setShowTrash(next);
              if (next) fetchTrash();
            }}
            className="ui-motion-button ui-focus-ring"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "10px 16px",
              backgroundColor: showTrash
                ? "var(--color-danger)"
                : isDarkMode
                  ? "var(--color-surface-raised)"
                  : "var(--color-border)",
              color: showTrash ? "#FFF" : isDarkMode ? "#FFF" : "#000",
              border: "none",
              borderRadius: "9px",
              cursor: "pointer",
              fontWeight: "700",
              fontSize: "13px",
            }}
          >
            <Trash2 size={15} /> Trash
          </button>
        </div>
        {/* Draft tersimpan — kompak di tengah baris aksi (kotak oren opaque, readable) */}
        {draftBanner && savedDraft && (
          <div
            className="ui-motion-card"
            style={{
              display: "flex",
              alignItems: "center",
              gap: isMobile ? "6px" : "10px",
              padding: isMobile ? "6px 10px" : "8px 12px",
              borderRadius: "10px",
              backgroundColor: isDarkMode
                ? "color-mix(in srgb, var(--color-warning) 25%, var(--color-surface))"
                : "color-mix(in srgb, var(--color-warning) 30%, white)",
              border: "1px solid var(--color-warning)",
              flexWrap: "nowrap",
              // v1.56.5: mobile 1 baris rapi (jam disembunyikan, tombol rapat)
              width: isMobile ? "100%" : undefined,
              justifyContent: isMobile ? "space-between" : "flex-start",
            }}
          >
            <FileText size={15} color="var(--color-warning)" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: "12px", fontWeight: 700, color: text, whiteSpace: "nowrap" }}>
              Draft tersimpan
            </span>
            {!isMobile && (
            <span style={{ fontSize: "11px", color: sub }}>
              {savedDraftUpdatedAt
                ? formatRelativeTime(savedDraftUpdatedAt)
                : "otomatis"}
            </span>
            )}
            <button
              onClick={loadDraft}
              className="btn-primary ui-motion-button ui-focus-ring"
              style={{
                padding: "6px 12px",
                backgroundColor: "var(--color-action)",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: "12px",
              }}
            >
              Pulihkan
            </button>
            <button
              onClick={dismissDraft}
              className="ui-motion-button ui-focus-ring"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "6px 12px",
                backgroundColor: "var(--color-danger)",
                color: "#FFF",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: "12px",
              }}
            >
              <Trash2 size={13} /> Hapus
            </button>
          </div>
        )}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {overdueCount > 0 && (
            <button
              type="button"
              onClick={() =>
                setFilterDue((p) => (p === "overdue" ? "all" : "overdue"))
              }
              className="ui-motion-button ui-focus-ring"
              style={{
                cursor: "pointer",
                padding: "8px 14px",
                backgroundColor: "var(--color-danger)",
                border:
                  filterDue === "overdue"
                    ? "2px solid var(--color-text)"
                    : "2px solid transparent",
                borderRadius: "10px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                color: "#FFF",
                fontSize: "13px",
                fontWeight: "700",
              }}
            >
              <AlertTriangle size={14} color="#FFF" />
              {overdueCount} Terlambat
            </button>
          )}
          {dueSoonCount > 0 && (
            <button
              type="button"
              onClick={() =>
                setFilterDue((p) => (p === "soon" ? "all" : "soon"))
              }
              className="ui-motion-button ui-focus-ring"
              style={{
                cursor: "pointer",
                padding: "8px 14px",
                backgroundColor: "var(--color-warning)",
                border:
                  filterDue === "soon"
                    ? "2px solid var(--color-text)"
                    : "2px solid transparent",
                borderRadius: "10px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                color: "#FFF",
                fontSize: "13px",
                fontWeight: "700",
              }}
            >
              <Clock size={14} color="#FFF" />
              {dueSoonCount} Jatuh Tempo
            </button>
          )}
          {filterDue !== "all" && (
            <button
              type="button"
              onClick={() => setFilterDue("all")}
              className="ui-motion-button ui-focus-ring"
              title="Reset filter jatuh tempo / terlambat"
              style={{
                cursor: "pointer",
                padding: "8px 14px",
                backgroundColor: "var(--color-surface-elevated)",
                border: `1px solid ${border}`,
                borderRadius: "10px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                color: text,
                fontSize: "13px",
                fontWeight: "700",
              }}
            >
              <X size={14} /> Reset
            </button>
          )}
        </div>
      </div>

      {/* Modal Trash — nota terhapus, bisa dipulihkan */}
      {showTrash &&
        createPortal(
          <div
            onClick={() => setShowTrash(false)}
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 99999,
              padding: "16px",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="ui-panel ui-motion-modal"
              style={{
                backgroundColor: "var(--color-surface)",
                border: `1px solid ${border}`,
                borderRadius: "16px",
                width: "100%",
                maxWidth: "640px",
                maxHeight: "80vh",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "16px 18px",
                  borderBottom: `1px solid ${border}`,
                }}
              >
                <span style={{ fontSize: "16px", fontWeight: "800", color: text, display: "flex", alignItems: "center", gap: "8px" }}>
                  <Trash2 size={18} /> Trash Nota
                </span>
                <button
                  onClick={() => setShowTrash(false)}
                  className="ui-focus-ring"
                  style={{ background: "transparent", border: "none", cursor: "pointer", color: sub }}
                >
                  <X size={20} />
                </button>
              </div>
              <div style={{ padding: "12px 18px", overflowY: "auto" }}>
                {trashLoading ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} width="100%" height="64px" borderRadius="10px" />
                    ))}
                  </div>
                ) : trashItems.length === 0 ? (
                  <p style={{ textAlign: "center", color: sub, padding: "32px 0", fontSize: "14px" }}>
                    Trash kosong — tidak ada nota terhapus.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {trashItems.map((t) => {
                      const tItems = Array.isArray(t.items) ? t.items : [];
                      const paid = t.payment_status === "paid";
                      const dueDiff = !paid ? notaDaysDiff(t.due_date) : null;
                      return (
                        <div
                          key={t.id}
                          style={{
                            padding: "12px 14px",
                            borderRadius: "10px",
                            border: `1px solid ${border}`,
                            backgroundColor: "var(--color-surface-elevated)",
                          }}
                        >
                          {/* Header: no nota + tanggal + customer + Pulihkan */}
                          <div
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              justifyContent: "space-between",
                              gap: "12px",
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: "700", color: text, fontSize: "13.5px" }}>
                                {t.order_number}
                                <span style={{ fontWeight: "500", color: sub, fontSize: "11.5px" }}>
                                  {"  "}· {fmtDate(t.sale_date)}
                                  {t.channel ? ` · ${String(t.channel).toUpperCase()}` : ""}
                                </span>
                              </div>
                              <div style={{ fontSize: "12px", color: text, marginTop: "2px", fontWeight: 600 }}>
                                {t.customer_name || "-"}
                              </div>
                              <div style={{ fontSize: "12px", color: sub, marginTop: "1px" }}>
                                {fmtRp(t.total)} · {t.item_count || tItems.length || 0} item
                              </div>
                              {/* status bayar */}
                              <div style={{ fontSize: "11px", marginTop: "3px" }}>
                                {paid ? (
                                  <span style={{ color: "var(--color-success)", fontWeight: 700 }}>
                                    LUNAS{t.paid_at ? ` · ${fmtDateDay(t.paid_at)}` : ""}
                                  </span>
                                ) : (
                                  <span style={{ color: "var(--color-danger)", fontWeight: 700 }}>
                                    BELUM BAYAR
                                    {t.due_date ? ` · jatuh tempo ${fmtDateDay(t.due_date)}` : ""}
                                    {dueDiff !== null
                                      ? dueDiff < 0
                                        ? ` (telat ${Math.abs(dueDiff)} hari)`
                                        : dueDiff === 0
                                          ? " (hari ini)"
                                          : ` (${dueDiff} hari lagi)`
                                      : ""}
                                  </span>
                                )}
                              </div>
                              {t.updated_at && (
                                <div style={{ fontSize: "11px", color: sub, marginTop: "1px" }}>
                                  dihapus {formatRelativeTime(t.updated_at)}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => handleRestore(t.id)}
                              disabled={restoringId === t.id}
                              className="ui-motion-button ui-focus-ring"
                              style={{
                                flexShrink: 0,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                padding: "8px 14px",
                                backgroundColor: "var(--color-action)",
                                color: "#FFF",
                                border: "none",
                                borderRadius: "8px",
                                cursor: restoringId === t.id ? "wait" : "pointer",
                                fontWeight: "700",
                                fontSize: "12.5px",
                                opacity: restoringId === t.id ? 0.6 : 1,
                              }}
                            >
                              <RotateCcw size={14} />
                              {restoringId === t.id ? "Memulihkan…" : "Pulihkan"}
                            </button>
                          </div>
                          {/* Detail item */}
                          {tItems.length > 0 && (
                            <div
                              style={{
                                marginTop: "10px",
                                paddingTop: "8px",
                                borderTop: `1px dashed ${border}`,
                                display: "flex",
                                flexDirection: "column",
                                gap: "6px",
                              }}
                            >
                              {tItems.map((it, idx) => {
                                const hppInc = hppIncFor(it);
                                const qtyUnit = saleItemDisplayQty(it);
                                const subtotal = (parseFloat(it.unit_price) || 0) * qtyUnit;
                                const margin = ((parseFloat(it.unit_price) || 0) - hppInc) * qtyUnit;
                                return (
                                  <div key={idx} style={{ fontSize: "11.5px" }}>
                                    <div style={{ color: text, fontWeight: 600 }}>
                                      {it.product_name}
                                    </div>
                                    {(it.batch_no_snapshot || it.expired_date_snapshot) && (
                                      <div style={{ color: sub, fontSize: "10px" }}>
                                        {it.batch_no_snapshot
                                          ? `Batch ${it.batch_no_snapshot}`
                                          : "(tanpa no. batch)"}
                                        {it.expired_date_snapshot
                                          ? ` · ED ${fmtDate(it.expired_date_snapshot)}`
                                          : ""}
                                      </div>
                                    )}
                                    <div style={{ color: sub, marginTop: "1px" }}>
                                      {qtyUnit} {it.unit} × {fmtRp(it.unit_price)} ={" "}
                                      <span style={{ color: text, fontWeight: 600 }}>
                                        {fmtRp(subtotal)}
                                      </span>
                                      {" · "}HPP {fmtRp(hppInc)}
                                      {" · "}
                                      <span
                                        style={{
                                          color:
                                            margin >= 0
                                              ? "var(--color-success)"
                                              : "var(--color-danger)",
                                          fontWeight: 600,
                                        }}
                                      >
                                        margin {fmtRp(margin)}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}


      {/* Search & Filters */}
      <div
        className="ui-toolbar"
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "1rem",
          flexWrap: "wrap",
          alignItems: "center",
          padding: "10px",
        }}
      >
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Cari no nota, customer, produk, atau total..."
          ariaLabel="Cari nota"
          style={{ flex: 1, minWidth: isMobile ? "100%" : "200px" }}
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
                ? "var(--color-selection)"
                : "transparent",
              color: showMobileFilters ? "var(--color-action)" : sub,
              border: `1px solid ${showMobileFilters ? "var(--color-action)" : border}`,
              borderRadius: "10px",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: "13px",
              whiteSpace: "nowrap",
              flex: "0 0 auto",
            }}
          >
            {(() => {
              // v1.65.1: tambah filterPpn ke counter filter aktif
              const n = [filterMonth, filterYear, filterStatus, filterChannel, filterPpn, filterProfit]
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
            width: isMobile ? "100%" : "150px",
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
            width: isMobile ? "100%" : "110px",
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
            width: isMobile ? "100%" : "150px",
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
            width: isMobile ? "100%" : "150px",
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

        {/* v1.65.1: Filter PPN — Dengan PPN / Tanpa PPN */}
        <select
          value={filterPpn}
          onChange={(e) => setFilterPpn(e.target.value)}
          style={{
            ...inputStyle,
            width: isMobile ? "100%" : "150px",
            flex: "0 0 auto",
            paddingRight: "32px",
            textOverflow: "ellipsis",
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          <option value="all">Semua PPN</option>
          <option value="ppn">Dengan PPN</option>
          <option value="non_ppn">Tanpa PPN</option>
        </select>

        <select
          value={filterProfit}
          onChange={(e) => setFilterProfit(e.target.value)}
          style={{
            ...inputStyle,
            width: isMobile ? "100%" : "150px",
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
        </div>
      </div>

      {/* Legend patokan untung — v1.56.5: dikasih background surface biar KEBACA
          di atas background berwarna (dulu teks muted ngambang di vanta) */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          flexWrap: "wrap",
          margin: "-4px 0 10px",
          padding: "5px 10px",
          borderRadius: "9px",
          backgroundColor: "var(--color-surface)",
          border: `1px solid ${border}`,
          fontSize: "10.5px",
          color: sub,
          lineHeight: 1.5,
        }}
      >
        <span style={{ fontWeight: 700 }}>Patokan untung:</span>
        <span>tinggi &gt; {formatProfitPct(activeProfitThresholds.high)}</span>
        <span>·</span>
        <span>
          normal {formatProfitPct(activeProfitThresholds.normal)}–
          {formatProfitPct(activeProfitThresholds.high)}
        </span>
        <span>·</span>
        <span>
          tipis {formatProfitPct(activeProfitThresholds.thin)}–
          {formatProfitPct(activeProfitThresholds.normal)}
        </span>
        <span>·</span>
        <span>rugi &lt; {formatProfitPct(activeProfitThresholds.thin)}</span>
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
            background: "var(--color-action)",
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
              onClick={openBulkPay}
              disabled={exportingPdf}
              style={{
                padding: "8px 16px",
                background: "rgba(255,255,255,0.2)",
                color: "#FFF",
                border: "1px solid rgba(255,255,255,0.45)",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "700",
                fontSize: "12px",
              }}
            >
              ✓ Tandai Lunas
            </button>
            <button
              onClick={handleExportPdfLaporan}
              disabled={exportingPdf}
              style={{
                padding: "8px 16px",
                background: "#FFF",
                color: "var(--color-action)",
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
                      color: isActive ? "var(--color-action)" : sub,
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
              : pagedOrders.map((o) => (
                  <React.Fragment key={o.id}>
                    <tr
                      className="ui-row ui-hover-delight"
                      style={{
                        borderBottom: `1px solid ${border}`,
                        cursor: "pointer",
                        backgroundColor: selectedNotaIds.has(o.id)
                          ? isDarkMode
                            ? "var(--color-selection)"
                            : "color-mix(in srgb, var(--color-action) 3%, transparent)"
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
                          color: "var(--color-action)",
                        }}
                      >
                        {o.order_number}
                      </td>
                      <td style={{ padding: "12px 14px", color: text }}>
                        {fmtDate(o.sale_date)}
                      </td>
                      <td style={{ padding: "12px 14px", color: text }}>
                        <div>{o.customer_name}</div>
                        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "4px" }}>
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
                                  ? "var(--color-selection)"
                                  : "color-mix(in srgb, var(--color-text-subtle) 8%, transparent)",
                              color:
                                o.channel === "online"
                                  ? "var(--color-action)"
                                  : "var(--color-text-subtle)",
                            }}
                          >
                            {o.channel === "online" ? "🛒 ONLINE" : "🏪 OFFLINE"}
                          </span>
                          {/* v1.65.0: badge "TANPA PPN" kalau ppn_excluded = true */}
                          {o.ppn_excluded && (
                            <span
                              style={{
                                fontSize: "9px",
                                fontWeight: "700",
                                padding: "1px 5px",
                                borderRadius: "3px",
                                whiteSpace: "nowrap",
                                display: "inline-block",
                                backgroundColor: "color-mix(in srgb, var(--color-warning) 12%, transparent)",
                                color: "var(--color-warning)",
                              }}
                            >
                              TANPA PPN
                            </span>
                          )}
                        </div>
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
                            {fmtDateDay(o.paid_at)} ✏️
                          </p>
                        )}
                        {o.payment_status !== "paid" &&
                          o.due_date &&
                          (() => {
                            const diff = notaDaysDiff(o.due_date);
                            if (diff === null) return null;
                            const overdue = diff < 0;
                            const soon = diff >= 0 && diff <= 3;
                            const relColor = overdue
                              ? "var(--color-danger)"
                              : soon
                                ? "var(--color-warning)"
                                : sub;
                            const relText = overdue
                              ? `Terlambat bayar ${Math.abs(diff)} hari`
                              : diff === 0
                                ? "Jatuh tempo hari ini"
                                : `Jatuh tempo ${diff} hari lagi`;
                            return (
                              <div style={{ margin: "4px 0 0" }}>
                                <p
                                  style={{
                                    margin: 0,
                                    fontSize: "9px",
                                    color: sub,
                                  }}
                                >
                                  Jatuh Tempo Pembayaran: {fmtDateDay(o.due_date)}
                                </p>
                                <p
                                  style={{
                                    margin: "2px 0 0",
                                    fontSize: "9px",
                                    fontWeight: "700",
                                    color: relColor,
                                    animation: overdue
                                      ? "habil-pulse 1.2s ease-in-out infinite"
                                      : "none",
                                  }}
                                >
                                  {relText}
                                </p>
                                {/* v1.54.1: SALIN teks reminder (bukan buka WA — wa.me
                                    ngerusak emoji & butuh No. HP; salin jalan utk semua nota) */}
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const ok = await copyTextToClipboard(
                                      buildDueReminderMessage({
                                        customerName: o.customer_name,
                                        orderNumber: o.order_number,
                                        total: o.total,
                                        dueDate: o.due_date,
                                      }),
                                    );
                                    flash(
                                      ok
                                        ? `Pesan reminder ${o.order_number} disalin — tinggal paste di WA`
                                        : "Gagal menyalin — coba lagi",
                                      ok ? "success" : "error",
                                    );
                                  }}
                                  title="Salin teks reminder jatuh tempo (paste manual di WA)"
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "3px",
                                    marginTop: "4px",
                                    padding: "2px 8px",
                                    borderRadius: "999px",
                                    fontSize: "9px",
                                    fontWeight: "700",
                                    backgroundColor: "var(--color-success-soft)",
                                    color: "var(--color-success)",
                                    border: "none",
                                    cursor: "pointer",
                                  }}
                                >
                                  💬 Salin reminder
                                </button>
                              </div>
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
                          {/* v1.65.1: tombol salin draft WA di baris daftar nota */}
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              const msg = buildNotaWaMessage({
                                form: {
                                  customer_name: o.customer_name,
                                  order_number: o.order_number,
                                  due_date: o.due_date,
                                },
                                items: o.items || [],
                                total: o.total,
                                orderNumber: o.order_number,
                                dueDate: o.due_date,
                              });
                              const ok = await copyTextToClipboard(msg);
                              flash(
                                ok
                                  ? "Draft WA disalin"
                                  : "Gagal menyalin draft",
                                ok ? "success" : "error",
                              );
                            }}
                            aria-label={`Salin draft WA nota ${o.order_number}`}
                            title="Salin draft WA"
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
                            <MessageCircle size={15} color="var(--color-action)" />
                          </button>
                           {o.payment_status === "paid" && (
                           <button
                             onClick={(e) => {
                               e.stopPropagation();
                               if (o.payment_status === "paid") {
                                 openAdjustment(o);
                                 return;
                               }
                               openPrintOptions(o);
                             }}
                             aria-label={`Retur atau tukar barang ${o.order_number}`}
                             title={o.payment_status === "paid" ? "Retur / Tukar Barang" : "Cetak PDF"}
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
                             {o.payment_status === "paid" ? <RotateCcw size={15} color="var(--color-warning)" /> : <FileText size={15} color="var(--color-success)" />}
                           </button>
                            )}
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
                              // v1.54.0: nota hasil konversi pinjaman dikunci dari edit
                              // (stok sudah keluar saat pinjam — edit bakal motong dobel).
                              if (o.payment_status === "paid") {
                                openNotesEdit(o);
                                return;
                              }
                              if (o.source_loan_id) {
                                flash(
                                  "Nota hasil konversi pinjaman tidak bisa diedit. Hapus nota (item balik berstatus dipinjam) lalu konversi ulang dari tab Pinjaman.",
                                  "error",
                                );
                                return;
                              }
                              openEdit(o);
                            }}
                            aria-label={`Edit nota ${o.order_number}`}
                            title={
                              o.payment_status === "paid"
                                ? "Edit catatan nota lunas"
                                : o.source_loan_id
                                  ? "Terkunci — nota hasil konversi pinjaman"
                                  : "Edit"
                            }
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
                              color="var(--color-action)"
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
                                      {/* v1.49.0: tampilkan batch + ED per item nota */}
                                      {(it.batch_no_snapshot ||
                                        it.expired_date_snapshot) && (
                                        <div
                                          style={{
                                            fontSize: "10px",
                                            color: sub,
                                            marginTop: "2px",
                                          }}
                                        >
                                          {it.batch_no_snapshot
                                            ? `Batch ${it.batch_no_snapshot}`
                                            : "(tanpa no. batch)"}
                                          {it.expired_date_snapshot
                                            ? ` · ED ${fmtDate(it.expired_date_snapshot)}`
                                            : ""}
                                        </div>
                                      )}
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
                      filterPpn !== "all" || // v1.65.1: tambah filterPpn
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
                      filterPpn !== "all" || // v1.65.1: tambah filterPpn
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

      {!loading && (
        <Pagination
          total={filtered.length}
          page={currentPage}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          isMobile={isMobile}
        />
      )}

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
                                ? "2px solid var(--color-action)"
                                : "2px solid transparent",
                            color:
                              formTab === key ? "var(--color-action)" : sub,
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
                      <div style={{ marginBottom: "8px" }}>
                        <div
                          style={{
                            fontSize: "12px",
                            fontWeight: "800",
                            color: text,
                          }}
                        >
                          ✨ Biasanya dibeli customer
                        </div>
                        <div style={{ fontSize: "11px", color: sub }}>
                          Dari riwayat customer — klik chip untuk prefill baris
                          produk.
                        </div>
                      </div>
                      {customerInsightsLoading ? (
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          {[...Array(4)].map((_, i) => (
                            <Skeleton
                              key={i}
                              width={`${90 + i * 18}px`}
                              height="30px"
                              borderRadius="999px"
                            />
                          ))}
                        </div>
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
                      // v1.56.5: mobile stack — input date iOS punya lebar minimum,
                      // 2 kolom di 375px bikin tanggal nabrak select metode
                      gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
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
                                  border: `1px solid ${active ? "var(--color-action)" : border}`,
                                  backgroundColor: active
                                    ? "var(--color-action)"
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
                                border: `1px solid ${active ? "var(--color-action)" : isDarkMode ? "var(--color-border-strong)" : "var(--color-border)"}`,
                                backgroundColor: active
                                  ? "var(--color-action)"
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

                  {/* v1.65.0: Tab "Nota PPN" vs "Nota Tanpa PPN" — segmented control mirip pageTab */}
                  <div>
                    <label style={labelStyle}>Jenis Nota</label>
                    <div
                      style={{
                        display: "inline-flex",
                        gap: "4px",
                        padding: "4px",
                        borderRadius: "10px",
                        backgroundColor: isDarkMode
                          ? "var(--color-surface-raised)"
                          : "var(--color-border)",
                      }}
                    >
                      {[
                        { key: false, label: "Nota PPN" },
                        { key: true, label: "Nota Tanpa PPN" },
                      ].map((t) => (
                        <button
                          key={String(t.key)}
                          onClick={() =>
                            setForm((p) => ({ ...p, ppn_excluded: t.key }))
                          }
                          className="ui-motion-button"
                          style={{
                            padding: "6px 16px",
                            borderRadius: "8px",
                            border: "none",
                            cursor: "pointer",
                            fontWeight: 700,
                            fontSize: "13px",
                            backgroundColor:
                              form.ppn_excluded === t.key
                                ? "var(--color-action)"
                                : "transparent",
                            color:
                              form.ppn_excluded === t.key
                                ? "#FFF"
                                : isDarkMode
                                  ? "#FFF"
                                  : "#000",
                          }}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
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

                    {/* Column Headers — layout sempit pakai label per field (v1.55.1) */}
                    {!stackedItems && (
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
                    )}

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
                      // v1.55.1: elemen input dibuat SEKALI, disusun beda per layar —
                      // desktop grid 6 kolom; mobile bertumpuk (grid fixed 340px bikin
                      // input Nama collapse jadi 0px di layar 375px).
                      const productSelectEl = (
                        <MasterSelect
                          value={it.product_name}
                          onChange={(v) => updateItem(idx, "product_name", v)}
                          options={products.map((p) => ({ name: p.name }))}
                          onAdd={(name) => handleAddProduct(name, idx)}
                          onRemove={handleRemoveProduct}
                          onRename={handleRenameProduct}
                          isDarkMode={isDarkMode}
                          placeholder="Nama produk"
                        />
                      );
                      const qtyInputEl = (
                        <input
                          type="number"
                          value={it.qty}
                          onChange={(e) =>
                            updateItem(idx, "qty", parseInt(e.target.value) || 0)
                          }
                          min="1"
                          aria-label="Qty"
                          style={{
                            ...inputStyle,
                            fontSize: "13px",
                            padding: "8px 6px",
                            textAlign: "center",
                          }}
                        />
                      );
                      const unitSelectEl = (
                        <select
                          value={it.unit}
                          onChange={(e) => updateItem(idx, "unit", e.target.value)}
                          aria-label="Unit"
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
                      );
                      const hppInputEl = (
                        <RupiahInput
                          value={hppIncFor(it)}
                          decimals={0}
                          onChange={(v) =>
                            updateItem(
                              idx,
                              "unit_hpp",
                              it.unit_hpp_tax_type === "nota"
                                ? v || 0
                                : hnaFromHpp(v || 0),
                            )
                          }
                          placeholder="0"
                          aria-label="HPP"
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
                      );
                      const priceInputEl = (
                        <RupiahInput
                          value={it.unit_price}
                          decimals={0}
                          onChange={(v) => updateItem(idx, "unit_price", v || 0)}
                          placeholder="0"
                          aria-label="Harga"
                          style={{
                            ...inputStyle,
                            fontSize: "13px",
                            padding: "8px 6px",
                            textAlign: "center",
                          }}
                        />
                      );
                      const removeBtnEl =
                        items.length > 1 ? (
                          <button
                            onClick={() => removeItem(idx)}
                            aria-label="Hapus baris produk"
                            title="Hapus baris produk"
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              padding: "8px",
                              minWidth: "36px",
                              minHeight: "36px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Trash2 size={14} color="var(--color-danger)" />
                          </button>
                        ) : null;
                      const miniLabel = (t) => (
                        <span
                          style={{
                            display: "block",
                            fontSize: "10px",
                            fontWeight: 700,
                            color: sub,
                            marginBottom: "3px",
                            textTransform: "uppercase",
                          }}
                        >
                          {t}
                        </span>
                      );
                      return (
                        <div
                          key={idx}
                          style={
                            stackedItems
                              ? {
                                  marginBottom: "12px",
                                  padding: "10px",
                                  border: `1px solid ${border}`,
                                  borderRadius: "12px",
                                  backgroundColor: "var(--color-surface)",
                                }
                              : { marginBottom: "10px" }
                          }
                        >
                          {stackedItems ? (
                            <>
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: removeBtnEl
                                    ? "minmax(0, 1fr) 36px"
                                    : "minmax(0, 1fr)",
                                  gap: "6px",
                                  alignItems: "center",
                                }}
                              >
                                <div style={{ minWidth: 0 }}>
                                  {miniLabel("Nama Produk")}
                                  {productSelectEl}
                                </div>
                                {removeBtnEl}
                              </div>
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "1fr 1fr",
                                  gap: "8px",
                                  marginTop: "8px",
                                }}
                              >
                                <div>
                                  {miniLabel("Qty")}
                                  {qtyInputEl}
                                </div>
                                <div>
                                  {miniLabel("Unit")}
                                  {unitSelectEl}
                                </div>
                                <div>
                                  {miniLabel("HPP")}
                                  {hppInputEl}
                                </div>
                                <div>
                                  {miniLabel("Harga")}
                                  {priceInputEl}
                                </div>
                              </div>
                            </>
                          ) : (
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns:
                                  "minmax(0, 2fr) 60px 70px 80px 100px 36px",
                                gap: "6px",
                                alignItems: "center",
                              }}
                            >
                              {productSelectEl}
                              {qtyInputEl}
                              {unitSelectEl}
                              {hppInputEl}
                              {priceInputEl}
                              {removeBtnEl}
                            </div>
                          )}
                          {/* v1.56.0: harga dari HPP — chip +5/+10/+15/custom % + pembulatan ke atas */}
                          {(() => {
                            const hppNow = hppIncFor(it);
                            if (!(hppNow > 0)) return null;
                            const cur = parseFloat(it.unit_price) || 0;
                            const customP = parseFloat(customMarkupPct);
                            const chipStyle = (active) => ({
                              padding: "3px 9px",
                              borderRadius: "999px",
                              border: `1px solid var(--color-action)`,
                              backgroundColor: active
                                ? "var(--color-action)"
                                : "var(--color-selection)",
                              color: active ? "#FFF" : "var(--color-action)",
                              fontSize: "10.5px",
                              fontWeight: 700,
                              cursor: "pointer",
                            });
                            const priceFor = (p) => Math.round(hppNow * (1 + p / 100));
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
                                <span style={{ fontSize: "11px", color: sub, fontWeight: 600 }}>
                                  💰 dari HPP:
                                </span>
                                {[5, 10, 15].map((p) => (
                                  <button
                                    key={p}
                                    type="button"
                                    onClick={() => updateItem(idx, "unit_price", priceFor(p))}
                                    title={`Set harga = HPP + ${p}% = Rp${priceFor(p).toLocaleString("id-ID")}`}
                                    className="ui-focus-ring"
                                    style={chipStyle(cur === priceFor(p))}
                                  >
                                    +{p}%
                                  </button>
                                ))}
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "3px",
                                  }}
                                >
                                  {/* v1.56.3: stepper −/+ — tap-friendly, mulai 1% */}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      saveCustomMarkup(
                                        String(Math.max(0, (parseFloat(customMarkupPct) || 0) - 1)),
                                      )
                                    }
                                    aria-label="Kurangi persen markup"
                                    className="ui-focus-ring"
                                    style={{
                                      width: "24px",
                                      height: "24px",
                                      borderRadius: "999px",
                                      border: `1px solid ${border}`,
                                      backgroundColor: "var(--color-surface-elevated)",
                                      color: text,
                                      fontSize: "13px",
                                      fontWeight: 800,
                                      lineHeight: 1,
                                      cursor: "pointer",
                                    }}
                                  >
                                    −
                                  </button>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    value={customMarkupPct}
                                    onChange={(e) => saveCustomMarkup(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" && customP > 0)
                                        updateItem(idx, "unit_price", priceFor(customP));
                                    }}
                                    placeholder="%"
                                    aria-label="Markup custom persen dari HPP"
                                    style={{
                                      ...inputStyle,
                                      width: "52px",
                                      padding: "3px 6px",
                                      fontSize: "11px",
                                      textAlign: "center",
                                      borderRadius: "999px",
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      saveCustomMarkup(
                                        String((parseFloat(customMarkupPct) || 0) + 1),
                                      )
                                    }
                                    aria-label="Tambah persen markup"
                                    className="ui-focus-ring"
                                    style={{
                                      width: "24px",
                                      height: "24px",
                                      borderRadius: "999px",
                                      border: `1px solid ${border}`,
                                      backgroundColor: "var(--color-surface-elevated)",
                                      color: text,
                                      fontSize: "13px",
                                      fontWeight: 800,
                                      lineHeight: 1,
                                      cursor: "pointer",
                                    }}
                                  >
                                    +
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!(customP > 0)}
                                    onClick={() =>
                                      customP > 0 &&
                                      updateItem(idx, "unit_price", priceFor(customP))
                                    }
                                    title={
                                      customP > 0
                                        ? `Set harga = HPP + ${customP}% = Rp${priceFor(customP).toLocaleString("id-ID")}`
                                        : "Isi persen dulu"
                                    }
                                    className="ui-focus-ring"
                                    style={{
                                      ...chipStyle(customP > 0 && cur === priceFor(customP)),
                                      opacity: customP > 0 ? 1 : 0.45,
                                      cursor: customP > 0 ? "pointer" : "not-allowed",
                                    }}
                                  >
                                    +{customP > 0 ? customP : "…"}%
                                  </button>
                                </span>
                                {cur > 0 &&
                                  (() => {
                                    // v1.56.3: 3 arah pembulatan — tampilkan yang beda dari harga sekarang saja
                                    const opts = [
                                      { icon: "⬇", label: "bawah", val: roundDownPrice(cur) },
                                      { icon: "½", label: "setengah", val: roundHalfPrice(cur) },
                                      { icon: "⬆", label: "atas", val: roundUpPrice(cur) },
                                    ].filter(
                                      (o, i, arr) =>
                                        o.val > 0 &&
                                        o.val !== cur &&
                                        arr.findIndex((x) => x.val === o.val) === i,
                                    );
                                    if (!opts.length) return null;
                                    return (
                                      <span
                                        style={{
                                          display: "inline-flex",
                                          alignItems: "center",
                                          gap: "4px",
                                          flexWrap: "wrap",
                                        }}
                                      >
                                        <span style={{ fontSize: "11px", color: sub, fontWeight: 600 }}>
                                          · bulatkan:
                                        </span>
                                        {opts.map((o) => (
                                          <button
                                            key={o.label}
                                            type="button"
                                            onClick={() => updateItem(idx, "unit_price", o.val)}
                                            title={`Bulatkan ke ${o.label}: Rp${cur.toLocaleString("id-ID")} → Rp${o.val.toLocaleString("id-ID")}`}
                                            className="ui-focus-ring"
                                            style={{
                                              padding: "3px 9px",
                                              borderRadius: "999px",
                                              border: `1px solid var(--color-success)`,
                                              backgroundColor: "var(--color-success-soft)",
                                              color: "var(--color-success)",
                                              fontSize: "10.5px",
                                              fontWeight: 700,
                                              cursor: "pointer",
                                            }}
                                          >
                                            {o.icon} {o.val.toLocaleString("id-ID")}
                                          </button>
                                        ))}
                                      </span>
                                    );
                                  })()}
                              </div>
                            );
                          })()}
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
                          {/* rekomendasi harga per-customer (baca behavior nota lama) */}
                          {(() => {
                            const cust = (form.customer_name || "").trim();
                            if (!cust) return null;
                            const key = `${(it.product_name || "").trim().toLowerCase()}||${cust.toLowerCase()}`;
                            const b = salesBaselines[key];
                            // v1.64.1: "biasanya" = modus (harga paling sering), bukan
                            // rata-rata. price_usual dari backend; price_mean cuma cadangan
                            // buat data lama yang belum kirim field baru.
                            const usual = b?.price_usual ?? b?.price_mean;
                            if (!b || !b.n_samples || !usual || usual <= 0) return null;
                            const prod =
                              it._product ||
                              products.find(
                                (p) =>
                                  p.name?.toLowerCase() === it.product_name?.toLowerCase(),
                              );
                            const sellUmum = parseFloat(prod?.sell_price) || 0;
                            const cur = parseFloat(it.unit_price) || 0;
                            const rec = Math.round(usual);
                            if (rec === Math.round(cur)) return null;
                            return (
                              <div
                                style={{
                                  marginTop: "6px",
                                  padding: "7px 10px",
                                  borderRadius: "9px",
                                  border: `1px solid var(--color-action-border-strong)`,
                                  backgroundColor: "var(--color-selection)",
                                  fontSize: "11px",
                                  lineHeight: 1.45,
                                  display: "flex",
                                  flexWrap: "wrap",
                                  alignItems: "center",
                                  gap: "6px",
                                }}
                              >
                                <span style={{ color: "var(--color-action)", fontWeight: 700 }}>
                                  💡 {cust} biasanya Rp{rec.toLocaleString("id-ID")}
                                </span>
                                {sellUmum > 0 && (
                                  <span style={{ color: sub }}>
                                    · harga umum Rp{sellUmum.toLocaleString("id-ID")}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => updateItem(idx, "unit_price", rec)}
                                  className="ui-focus-ring"
                                  style={{
                                    marginLeft: "auto",
                                    padding: "3px 10px",
                                    borderRadius: "999px",
                                    border: "none",
                                    backgroundColor: "var(--color-action)",
                                    color: "#FFF",
                                    fontSize: "10.5px",
                                    fontWeight: 700,
                                    cursor: "pointer",
                                  }}
                                >
                                  Pakai Rp{rec.toLocaleString("id-ID")}
                                </button>
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
                                      border: `1px solid var(--color-action)`,
                                      backgroundColor: "var(--color-selection)",
                                      color: "var(--color-action)",
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
                                  border: `1px solid var(--color-action-border-strong)`,
                                  color: "var(--color-action)",
                                }}
                              >
                                <option value="">Pilih Batch</option>
                                {batches.map((b) => {
                                  const isHistorical = (b.qty_current || 0) <= 0;
                                  return (
                                    <option key={b.id || b.batch_no} value={String(b.id)}>
                                      {b.batch_no || "(tanpa no. batch)"} | ED:{" "}
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

                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: "14px",
                        marginTop: "4px",
                      }}
                    >
                      <button
                        onClick={addItem}
                        style={{
                          fontSize: "13px",
                          color: "var(--color-action)",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontWeight: "600",
                        }}
                      >
                        + Tambah Produk
                      </button>
                      {/* v1.44.0: sinkron HPP manual — nota default beku di harga saat
                          terjual; tombol ini cuma muncul saat EDIT nota tersimpan. */}
                      {editId && (
                        <button
                          type="button"
                          onClick={syncHppFromBatch}
                          title="Tarik ulang HPP tiap item dari harga beli batch terkini (untuk koreksi). HPP nota default dibekukan di harga saat barang terjual."
                          style={{
                            fontSize: "12px",
                            color: "var(--color-text-muted)",
                            background: "none",
                            border: "1px solid var(--color-border)",
                            borderRadius: "8px",
                            padding: "5px 10px",
                            cursor: "pointer",
                            fontWeight: "600",
                          }}
                        >
                          ↻ Perbarui HPP dari batch terkini
                        </button>
                      )}
                    </div>
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
                      gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
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
                      <RupiahInput
                        value={form.ongkir}
                        decimals={0}
                        onChange={(v) => setForm((f) => ({ ...f, ongkir: v }))}
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
                      <RupiahInput
                        value={form.ongkir_cost}
                        decimals={0}
                        onChange={(v) =>
                          setForm((f) => ({ ...f, ongkir_cost: v }))
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
                          color: "var(--color-action)",
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
                    ppnExcluded={!!form.ppn_excluded}
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
                        border: `2px solid ${printOptions.format === f ? "var(--color-action)" : border}`,
                        backgroundColor:
                          printOptions.format === f
                            ? "var(--color-selection-subtle)"
                            : "transparent",
                        color:
                          printOptions.format === f
                            ? "var(--color-action)"
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
                  backgroundColor: "var(--color-action)",
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
      {/* v1.49.0: modal tandai lunas massal */}
      {bulkPay.open &&
        renderPortal(
          <div
            onClick={() => !bulkPay.saving && setBulkPay({ open: false, date: "", saving: false })}
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10000,
              backdropFilter: "blur(4px)",
              padding: "1rem",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="ui-motion-modal ui-modal-shell ui-surface-panel"
              style={{
                backgroundColor: cardBg,
                width: "100%",
                maxWidth: "400px",
                border: `1px solid ${border}`,
                padding: "22px",
              }}
            >
              <h3 style={{ margin: "0 0 6px", fontSize: "16px", fontWeight: 700, color: text }}>
                Tandai Lunas Massal
              </h3>
              <p style={{ margin: "0 0 16px", fontSize: "13px", color: sub }}>
                {
                  orders.filter(
                    (o) => selectedNotaIds.has(o.id) && o.payment_status !== "paid",
                  ).length
                }{" "}
                nota (yang belum lunas) akan ditandai LUNAS pada tanggal di bawah.
              </p>
              <label style={labelStyle}>Tanggal Pelunasan</label>
              <input
                type="date"
                value={bulkPay.date}
                onChange={(e) => setBulkPay((p) => ({ ...p, date: e.target.value }))}
                className="ui-form-field ui-focus-ring"
                style={inputStyle}
              />
              <div style={{ display: "flex", gap: "10px", marginTop: "18px" }}>
                <button
                  onClick={handleBulkPaySave}
                  disabled={bulkPay.saving || !bulkPay.date}
                  className="btn-primary ui-motion-button ui-focus-ring"
                  style={{
                    flex: 1,
                    padding: "12px",
                    backgroundColor: "var(--color-action)",
                    color: "#FFF",
                    border: "none",
                    borderRadius: "10px",
                    cursor: bulkPay.saving ? "wait" : "pointer",
                    fontWeight: 700,
                    fontSize: "14px",
                    opacity: bulkPay.saving ? 0.7 : 1,
                  }}
                >
                  {bulkPay.saving ? "Menyimpan..." : "Tandai Lunas"}
                </button>
                <button
                  onClick={() => setBulkPay({ open: false, date: "", saving: false })}
                  disabled={bulkPay.saving}
                  className="ui-motion-button ui-focus-ring"
                  style={{
                    flex: 1,
                    padding: "12px",
                    backgroundColor: "var(--color-surface-elevated)",
                    color: text,
                    border: `1px solid ${border}`,
                    borderRadius: "10px",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: "14px",
                  }}
                >
                  Batal
                </button>
              </div>
            </div>
          </div>,
        )}

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

      {notesEdit.open &&
        renderPortal(
          <div
            onClick={() => setNotesEdit({ open: false, order: null, notes: "", saving: false })}
            style={{ position: "fixed", inset: 0, zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", backgroundColor: "rgba(0,0,0,0.5)" }}
          >
            <div onClick={(e) => e.stopPropagation()} className="ui-motion-modal ui-modal-shell" style={{ width: "100%", maxWidth: "520px", padding: "24px", backgroundColor: cardBg, borderRadius: "20px", boxShadow: "0 20px 40px rgba(0,0,0,0.25)" }}>
              <h3 style={{ margin: "0 0 8px", color: text, fontSize: "18px" }}>Edit Catatan Nota Lunas</h3>
              <p style={{ margin: "0 0 18px", color: sub, fontSize: "13px" }}>
                {notesEdit.order?.order_number} tetap lunas dan nominal tidak berubah.
              </p>
              <textarea
                value={notesEdit.notes}
                onChange={(e) => setNotesEdit((prev) => ({ ...prev, notes: e.target.value }))}
                rows={5}
                autoFocus
                style={{ ...inputStyle, width: "100%", resize: "vertical", boxSizing: "border-box" }}
                placeholder="Contoh: Retur 3 pcs batch ANPF03VB, diganti dari faktur 4844989."
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}>
                <button type="button" onClick={() => setNotesEdit({ open: false, order: null, notes: "", saving: false })} disabled={notesEdit.saving} style={{ padding: "10px 16px", border: `1px solid ${border}`, borderRadius: "10px", backgroundColor: "transparent", color: text, fontWeight: 700 }}>Batal</button>
                <button type="button" onClick={saveNotesEdit} disabled={notesEdit.saving} className="btn-primary" style={{ border: "none", borderRadius: "10px", padding: "10px 16px", color: "#fff", fontWeight: 700 }}>{notesEdit.saving ? "Menyimpan..." : "Simpan Catatan"}</button>
              </div>
            </div>
          </div>,
        )}

      {adjustmentModal.open &&
        renderPortal(
          <div
            onClick={() => setAdjustmentModal((prev) => ({ ...prev, open: false }))}
            style={{ position: "fixed", inset: 0, zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", backgroundColor: "rgba(0,0,0,0.5)" }}
          >
            <div onClick={(e) => e.stopPropagation()} className="ui-motion-modal ui-modal-shell" style={{ width: "100%", maxWidth: "560px", maxHeight: "90vh", overflow: "auto", padding: "24px", backgroundColor: cardBg, borderRadius: "20px", boxShadow: "0 20px 40px rgba(0,0,0,0.25)" }}>
              <h3 style={{ margin: "0 0 8px", color: text, fontSize: "18px" }}>Retur / Tukar Barang</h3>
              <p style={{ margin: "0 0 18px", color: sub, fontSize: "13px" }}>
                {adjustmentModal.order?.order_number} tetap lunas. Nota asli dan pembayaran tidak diubah.
              </p>
              {adjustmentModal.lines.map((line, index) => (
                <div key={line.originalItemId} style={{ padding: "12px", borderRadius: "12px", backgroundColor: "var(--color-surface-elevated)", marginBottom: "12px" }}>
                  <strong style={{ color: text }}>{index + 1}. {line.item.product_name}</strong>
                  <div style={{ color: sub, fontSize: "12px", margin: "4px 0 12px" }}>
                    Batch {line.item.batch_no_snapshot || "-"} · ED {line.item.expired_date_snapshot || "-"} · Terjual {line.item.qty_in_unit || line.item.qty}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <label style={labelStyle}>Qty Retur<input type="number" min="0.01" step="0.01" value={line.returnQty} onChange={(e) => setAdjustmentModal((prev) => ({ ...prev, lines: prev.lines.map((candidate, i) => i === index ? { ...candidate, returnQty: e.target.value } : candidate) }))} style={inputStyle} /></label>
                    <label style={labelStyle}>Qty Ganti<input type="number" min="0.01" step="0.01" value={line.replacementQty} onChange={(e) => setAdjustmentModal((prev) => ({ ...prev, lines: prev.lines.map((candidate, i) => i === index ? { ...candidate, replacementQty: e.target.value } : candidate) }))} style={inputStyle} /></label>
                  </div>
                  <label style={{ ...labelStyle, marginTop: "10px" }}>Produk Pengganti<select value={line.replacementProductId} onChange={(e) => { const product = products.find((candidate) => String(candidate.id) === e.target.value); setAdjustmentModal((prev) => ({ ...prev, lines: prev.lines.map((candidate, i) => i === index ? { ...candidate, replacementProductId: e.target.value, replacementProductName: product?.name || "" } : candidate) })); loadLineBatches(index, e.target.value); }} style={inputStyle}>
                    {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                  </select></label>
                  <label style={{ ...labelStyle, marginTop: "10px" }}>Batch Pengganti<select value={line.replacementBatchId} onChange={(e) => setAdjustmentModal((prev) => ({ ...prev, lines: prev.lines.map((candidate, i) => i === index ? { ...candidate, replacementBatchId: e.target.value } : candidate) }))} disabled={line.loading} style={inputStyle}>
                    <option value="">Pilih batch</option>
                    {line.batches.filter((batch) => Number(batch.qty_current) > 0).map((batch) => <option key={batch.id} value={batch.id}>{batch.batch_no || batch.id} · ED {batch.expired_date || "-"} · stok {batch.qty_current}</option>)}
                  </select></label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <label style={labelStyle}>Harga Ganti<input type="number" min="0" value={line.replacementUnitPrice} onChange={(e) => setAdjustmentModal((prev) => ({ ...prev, lines: prev.lines.map((candidate, i) => i === index ? { ...candidate, replacementUnitPrice: e.target.value } : candidate) }))} style={inputStyle} /></label>
                    <label style={labelStyle}>Invoice Sumber<input type="text" value={line.sourceInvoiceNumber} onChange={(e) => setAdjustmentModal((prev) => ({ ...prev, lines: prev.lines.map((candidate, i) => i === index ? { ...candidate, sourceInvoiceNumber: e.target.value } : candidate) }))} style={inputStyle} placeholder="Opsional" /></label>
                  </div>
                  <label style={{ ...labelStyle, marginTop: "10px" }}>Kondisi Retur<select value={line.returnCondition} onChange={(e) => setAdjustmentModal((prev) => ({ ...prev, lines: prev.lines.map((candidate, i) => i === index ? { ...candidate, returnCondition: e.target.value } : candidate) }))} style={inputStyle}>
                    <option value="saleable">ED / masih layak jual</option><option value="damaged">Rusak</option><option value="quarantine">Lainnya / karantina</option>
                  </select></label>
                  {line.returnCondition !== "saleable" && <label style={{ ...labelStyle, marginTop: "10px" }}>Keterangan Kondisi<textarea rows={2} value={line.conditionReason} onChange={(e) => setAdjustmentModal((prev) => ({ ...prev, lines: prev.lines.map((candidate, i) => i === index ? { ...candidate, conditionReason: e.target.value } : candidate) }))} style={{ ...inputStyle, resize: "vertical" }} /></label>}
                </div>
              ))}
              <div style={{ marginTop: "14px", padding: "12px", borderRadius: "12px", border: `1px solid ${border}` }}>
                <strong style={{ color: text, fontSize: "13px" }}>Riwayat Penyesuaian</strong>
                {adjustmentHistoryLoading ? <p style={{ color: sub, fontSize: "12px" }}>Memuat histori...</p> : adjustmentHistory.length === 0 ? <p style={{ color: sub, fontSize: "12px" }}>Belum ada adjustment pada nota ini.</p> : adjustmentHistory.map((entry) => (
                  <div key={entry.id} style={{ marginTop: "8px", color: sub, fontSize: "12px" }}>
                    <strong style={{ color: text }}>{entry.adjustment_number}</strong> · {entry.type} · {entry.status}
                    <div>Refund {fmtRp(entry.refund_amount)} · Tambahan {fmtRp(entry.additional_charge)}</div>
                  </div>
                ))}
              </div>
              <label style={{ ...labelStyle, marginTop: "14px" }}>Alasan Retur/Tukar<textarea rows={3} value={adjustmentModal.reason} onChange={(e) => setAdjustmentModal((prev) => ({ ...prev, reason: e.target.value }))} style={{ ...inputStyle, resize: "vertical" }} placeholder="Contoh: barang retur ditukar dengan batch baru dari faktur 4844989" /></label>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}>
                <button type="button" onClick={() => setAdjustmentModal((prev) => ({ ...prev, open: false }))} disabled={adjustmentModal.saving} style={{ padding: "10px 16px", border: `1px solid ${border}`, borderRadius: "10px", backgroundColor: "transparent", color: text, fontWeight: 700 }}>Batal</button>
                <button type="button" onClick={saveAdjustment} disabled={adjustmentModal.saving || adjustmentModal.loading} className="btn-primary" style={{ border: "none", borderRadius: "10px", padding: "10px 16px", color: "#fff", fontWeight: 700 }}>{adjustmentModal.saving ? "Memproses..." : "Post Retur / Tukar"}</button>
              </div>
            </div>
          </div>,
        )}

      {adjustmentPrint.open &&
        renderPortal(
          <div
            onClick={() => setAdjustmentPrint({ open: false, data: null, format: "A5", saving: false })}
            style={{ position: "fixed", inset: 0, zIndex: 10001, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", backgroundColor: "rgba(0,0,0,0.5)" }}
          >
            <div onClick={(e) => e.stopPropagation()} className="ui-motion-modal ui-modal-shell" style={{ width: "100%", maxWidth: "420px", padding: "24px", backgroundColor: cardBg, borderRadius: "20px", boxShadow: "0 20px 40px rgba(0,0,0,0.25)" }}>
              <h3 style={{ margin: "0 0 8px", color: text, fontSize: "18px" }}>Cetak Dokumen Retur/Tukar</h3>
              <p style={{ margin: "0 0 16px", color: sub, fontSize: "13px" }}>{adjustmentPrint.data?.adjustment_number} siap dicetak untuk customer.</p>
              <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                {["A5", "A6"].map((format) => <button key={format} type="button" onClick={() => setAdjustmentPrint((prev) => ({ ...prev, format }))} style={{ flex: 1, padding: "10px", borderRadius: "10px", border: `2px solid ${adjustmentPrint.format === format ? "var(--color-action)" : border}`, background: "transparent", color: text, fontWeight: 700 }}>{format}</button>)}
              </div>
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setAdjustmentPrint({ open: false, data: null, format: "A5", saving: false })} disabled={adjustmentPrint.saving} style={{ padding: "10px 16px", border: `1px solid ${border}`, borderRadius: "10px", background: "transparent", color: text, fontWeight: 700 }}>Nanti</button>
                <button type="button" onClick={handlePrintAdjustment} disabled={adjustmentPrint.saving} className="btn-primary" style={{ border: "none", borderRadius: "10px", padding: "10px 16px", color: "#fff", fontWeight: 700 }}>{adjustmentPrint.saving ? "Membuat..." : `Cetak ${adjustmentPrint.format}`}</button>
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

      <NewProductModal
        isOpen={!!newProductFor}
        initialName={newProductFor?.name || ""}
        existingProducts={products}
        isDarkMode={isDarkMode}
        onClose={() => setNewProductFor(null)}
        onCreated={handleProductCreated}
      />

      <ToastNotice message={toast} type={toastType} isMobile={isMobile} />
    </div>
  );
}
