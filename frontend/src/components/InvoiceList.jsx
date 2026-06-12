import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  invoicesAPI,
  distributorsAPI,
  inventoryAPI,
  auditAPI,
  purchaseOrdersAPI,
} from "../services/api";
import {
  BASE_UNITS,
  PACK_UNITS,
  formatQtyWithConversion,
  isPackUnit,
} from "../constants/units";
import {
  Plus,
  X,
  Trash2,
  RotateCcw,
  Search,
  AlertTriangle,
  Clock,
  FileText,
  ChevronLeft,
  ChevronRight,
  History,
} from "lucide-react";
import MasterSelect from "./MasterSelect";
import ConfirmModal from "./common/ConfirmModal";
import Skeleton from "./common/Skeleton";
import Breadcrumb from "./common/Breadcrumb";
import EmptyState, { EmptyStateIcons } from "./common/EmptyState";
import { PPN_RATE } from "../utils/rupiah";
import RupiahInput from "./common/RupiahInput";
import Icons from "./common/Icon";
import { UI_MOTION, uiTransition } from "../constants/ui";
import useBodyScrollLock from "../hooks/useBodyScrollLock";
import useDebouncedValue from "../hooks/useDebouncedValue";

const renderPortal = (node) =>
  typeof document === "undefined" ? node : createPortal(node, document.body);

const OVERDUE_PULSE_CSS = `@keyframes habil-pulse{0%,100%{opacity:1}50%{opacity:0.35}}`;
if (
  typeof document !== "undefined" &&
  !document.getElementById("habil-pulse-style")
) {
  const s = document.createElement("style");
  s.id = "habil-pulse-style";
  s.textContent = OVERDUE_PULSE_CSS;
  document.head.appendChild(s);
}

// ─── Helpers ────────────────────────────────────────────────────────────────
// parseNum: Indo decimal aware. "288.288,25" → 288288.25; "288288" → 288288; "288288.25" → 288288.25
const parseNum = (v) => {
  if (v === "" || v == null) return 0;
  let s = String(v).trim().replace(/Rp\s?/gi, "").replace(/\s/g, "");
  if (!s) return 0;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  return parseFloat(s) || 0;
};
const formatRp = (n, cents = false) => {
  if (!n && n !== 0) return "Rp 0";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(parseFloat(n));
};
// formatRpInput: display dengan koma desimal kalau ada (max 2 digit). Integer = no decimal.
const formatRpInput = (n) => {
  const num = parseFloat(n);
  if (isNaN(num) || n === "" || n == null) return "";
  if (!num) return "";
  return num.toLocaleString("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};
const parseLocalDate = (dateStr) => {
  if (!dateStr) return null;
  const s = typeof dateStr === "string" ? dateStr.split("T")[0] : dateStr;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const formatLocalDate = (dateStr, opts) => {
  const d = parseLocalDate(dateStr);
  if (!d) return "";
  return d.toLocaleDateString("id-ID", opts);
};
// Warna per distributor — auto-assign dari palette
const DIST_COLORS = [
  {
    bg: "var(--color-primary)20",
    border: "var(--color-primary)50",
    text: "var(--color-primary)",
    dot: "var(--color-primary)",
  },
  {
    bg: "var(--color-success)20",
    border: "var(--color-success)50",
    text: "var(--color-success)",
    dot: "var(--color-success)",
  },
  {
    bg: "var(--color-warning-soft-strong)",
    border: "var(--color-warning)50",
    text: "var(--color-warning)",
    dot: "var(--color-warning)",
  },
  {
    bg: "var(--color-primary-soft)",
    border: "color-mix(in srgb, var(--color-primary-hover) 32%, transparent)",
    text: "var(--color-primary-hover)",
    dot: "var(--color-primary-hover)",
  },
  { bg: "#FF375F20", border: "#FF375F50", text: "#FF375F", dot: "#FF375F" },
  { bg: "#00C7BE20", border: "#00C7BE50", text: "#00C7BE", dot: "#00C7BE" },
  { bg: "#30B0C720", border: "#30B0C750", text: "#30B0C7", dot: "#30B0C7" },
  { bg: "#FFCC0020", border: "#FFCC0050", text: "#B8860B", dot: "#FFCC00" },
];
const getDistColor = (name, allNames) => {
  const idx = allNames.indexOf(name);
  return DIST_COLORS[idx % DIST_COLORS.length];
};

const toProductOption = (product) => ({
  ...product,
  name: product.name || "",
  label: product.code ? `${product.code} — ${product.name}` : product.name,
});

const daysDiff = (dateStr) => {
  if (!dateStr) return null;
  const d = parseLocalDate(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((d - now) / 86400000);
};
const addDays = (dateStr, n) => {
  const base = dateStr ? parseLocalDate(dateStr) : new Date();
  if (!base) return "";
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const blankItem = () => ({
  _id: Math.random().toString(36).slice(2),
  product_name: "",
  product_id: null,
  batch_number: "",
  expired_date: "",
  quantity: "",
  hna: "",
  hna_times_qty: 0,
  disc_percent: "",
  disc_nominal: 0,
  hna_baru: 0,
  hna_per_item: 0,
  price_basis: "hna_exc", // hna_exc | hpp_inc. Canonical saved value remains raw HNA exc PPN.
  disc_mode: "percent", // v1.11.10: 'percent' | 'nominal'
  disc_input: "", // v1.11.10: raw input field (interpretation tergantung disc_mode)
  unit: "pcs", // v1.6.0 multi-unit: unit input dari distributor (pcs/karton/dus/etc)
});
const normalizeItem = (item) => ({
  price_basis: "hna_exc",
  disc_mode: "percent",
  ...item,
});
// v1.22.0: nota = pembelian tanpa PPN masukan → faktor PPN 0, harga beli = HPP.
const ppnRateFor = (taxType) => (taxType === "nota" ? 0 : PPN_RATE);
const displayUnitPrice = (item, taxType = "faktur") => {
  const hna = parseNum(item.hna);
  return item.price_basis === "hpp_inc"
    ? hna * (1 + ppnRateFor(taxType))
    : hna;
};
const toRawHna = (value, priceBasis, taxType = "faktur") => {
  const n = parseNum(value);
  return priceBasis === "hpp_inc" ? n / (1 + ppnRateFor(taxType)) : n;
};
const blankForm = () => ({
  invoice_number: "",
  purchase_date: "",
  distributor_name: "",
  tax_type: "faktur",
  disc_cod_ada: false,
  disc_cod_amount: "",
  disc_cod_percent: "",
  due_date: "",
  payment_date: "",
  status: "Pending",
});
const calcItem = (item, disc_cod_per_item = 0, taxType = "faktur") => {
  item = normalizeItem(item);
  const qty = parseNum(item.quantity);
  const hna = parseNum(item.hna);
  const hna_times_qty = hna * qty;
  // v1.11.10: disc bisa mode 'percent' atau 'nominal' — derive yg lain otomatis
  const disc_mode = item.disc_mode || "percent";
  let disc_percent, disc_nominal;
  if (disc_mode === "nominal") {
    disc_nominal = parseNum(item.disc_input);
    disc_percent = hna_times_qty > 0 ? (disc_nominal / hna_times_qty) * 100 : 0;
  } else {
    // backward compat: kalau disc_input kosong tp disc_percent ada (old data), pakai disc_percent
    const raw =
      item.disc_input !== "" &&
      item.disc_input !== undefined &&
      item.disc_input !== null
        ? item.disc_input
        : item.disc_percent;
    disc_percent = parseNum(raw);
    disc_nominal = hna_times_qty * (disc_percent / 100);
  }
  const hna_baru = hna_times_qty - disc_nominal;
  const hna_after_cod = hna_baru - disc_cod_per_item;
  const hna_per_item = qty > 0 ? hna_baru / qty : 0;
  const hpp_inc_ppn =
    qty > 0 ? (hna_after_cod / qty) * (1 + ppnRateFor(taxType)) : 0;
  return {
    ...item,
    hna_times_qty,
    disc_percent,
    disc_nominal,
    hna_baru,
    hna_per_item,
    disc_cod_per_item,
    hna_after_cod,
    hpp_inc_ppn,
  };
};
const calcTotals = (items, form) => {
  const total_hna = items.reduce((s, i) => s + i.hna_times_qty, 0);
  const hna_baru_total = items.reduce((s, i) => s + i.hna_baru, 0);
  // Disc COD: bisa pakai % atau nominal
  let disc_cod_amount = 0;
  if (form.disc_cod_ada) {
    if (form.disc_cod_percent && parseNum(form.disc_cod_percent) > 0) {
      disc_cod_amount =
        hna_baru_total * (parseNum(form.disc_cod_percent) / 100);
    } else {
      disc_cod_amount = parseNum(form.disc_cod_amount);
    }
  }
  // Distribusikan disc COD ke tiap item proporsional berdasarkan hna_baru
  const taxType = form.tax_type === "nota" ? "nota" : "faktur";
  const items_with_cod = items.map((i) => {
    const ratio = hna_baru_total > 0 ? i.hna_baru / hna_baru_total : 0;
    const disc_cod_per_item = disc_cod_amount * ratio;
    return calcItem(i, disc_cod_per_item, taxType);
  });
  const hna_final = hna_baru_total - disc_cod_amount;
  const ppn_masukan = hna_final * ppnRateFor(taxType);
  const ppn_pembulatan = Math.floor(ppn_masukan);
  const hna_plus_ppn = hna_final + ppn_masukan;
  const totalQty = items.reduce((s, i) => s + parseNum(i.quantity), 0);
  const harga_per_produk = totalQty > 0 ? hna_plus_ppn / totalQty : 0;
  const discount_amount = items.reduce((s, i) => s + i.disc_nominal, 0);
  return {
    total_hna,
    discount_amount,
    hna_baru: hna_baru_total,
    disc_cod_amount,
    hna_final,
    ppn_masukan,
    ppn_pembulatan,
    hna_plus_ppn,
    harga_per_produk,
    items_with_cod,
  };
};
const getDueStatus = (due_date, status) => {
  if (status === "Paid" || !due_date) return null;
  const diff = daysDiff(due_date);
  if (diff < 0)
    return {
      label: `Terlambat ${Math.abs(diff)}h`,
      color: "var(--color-danger)",
      bg: "var(--color-danger-soft-strong)",
      animation: "habil-pulse 1.2s ease-in-out infinite",
    };
  if (diff <= 3)
    return {
      label: `Jatuh tempo ${diff}h lagi`,
      color: "var(--color-warning)",
      bg: "var(--color-warning-soft-strong)",
    };
  if (diff <= 7)
    return { label: `${diff}h lagi`, color: "#FFCC00", bg: "#FFCC0020" };
  return null;
};

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

const buildAuditDiff = (rawSnapshot, action) => {
  if (!rawSnapshot) return [];
  let snapshot = rawSnapshot;
  if (typeof snapshot === "string") {
    try {
      snapshot = JSON.parse(snapshot);
    } catch (e) {
      return [];
    }
  }
  if (!snapshot || typeof snapshot !== "object") return [];

  let before = snapshot.before || null;
  let after = snapshot.after || null;
  if (!before && !after) {
    if (action === "CREATE" || action === "RESTORE") {
      before = {};
      after = snapshot;
    } else if (action === "DELETE") {
      before = snapshot;
      after = {};
    } else {
      before = snapshot;
      after = snapshot;
    }
  }

  const keys = new Set([
    ...(before ? Object.keys(before) : []),
    ...(after ? Object.keys(after) : []),
  ]);
  const preferredOrder = [
    "invoice_number",
    "distributor_name",
    "status",
    "total_hna",
    "hna_final",
    "hna_plus_ppn",
    "disc_cod_amount",
    "due_date",
    "payment_date",
  ];
  const sortedKeys = [
    ...preferredOrder.filter((k) => keys.has(k)),
    ...[...keys].filter((k) => !preferredOrder.includes(k)),
  ];

  const diffs = [];
  sortedKeys.forEach((key) => {
    const oldVal = before ? before[key] : undefined;
    const newVal = after ? after[key] : undefined;
    const oldLabel =
      oldVal === null || oldVal === undefined || oldVal === ""
        ? "—"
        : String(oldVal);
    const newLabel =
      newVal === null || newVal === undefined || newVal === ""
        ? "—"
        : String(newVal);
    if (oldLabel === newLabel) return;
    diffs.push({ field: key, before: oldLabel, after: newLabel });
  });

  return diffs;
};

// ─── Sort helper ────────────────────────────────────────────────────────────
const sortData = (data, key, dir) => {
  if (!key) return data;
  return [...data].sort((a, b) => {
    let va = a[key],
      vb = b[key];
    if (
      ["total_hna", "hna_final", "hna_plus_ppn", "ppn_masukan"].includes(key)
    ) {
      va = parseFloat(va) || 0;
      vb = parseFloat(vb) || 0;
    } else if (["purchase_date", "due_date"].includes(key)) {
      va = va ? parseLocalDate(va)?.getTime() || 0 : 0;
      vb = vb ? parseLocalDate(vb)?.getTime() || 0 : 0;
    } else {
      va = String(va || "").toLowerCase();
      vb = String(vb || "").toLowerCase();
    }
    if (va < vb) return dir === "asc" ? -1 : 1;
    if (va > vb) return dir === "asc" ? 1 : -1;
    return 0;
  });
};

function IconTooltipButton({
  label,
  children,
  buttonClassName = "",
  buttonStyle = {},
  tooltipStyle = {},
  tooltipBg = "#FFF",
  tooltipColor = "#000",
  tooltipBorder = "var(--color-border)",
  ...buttonProps
}) {
  return (
    <span className="group relative inline-flex">
      <button
        {...buttonProps}
        aria-label={label}
        className={`ui-motion-button ui-focus-ring ${buttonClassName}`.trim()}
        style={buttonStyle}
      >
        {children}
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md border px-2.5 py-1 text-[10px] font-semibold shadow-lg opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        style={{
          backgroundColor: tooltipBg,
          color: tooltipColor,
          borderColor: tooltipBorder,
          ...tooltipStyle,
        }}
      >
        {label}
      </span>
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function InvoiceList({
  isDarkMode,
  isSidebarOpen,
  isMobile,
  isVantaMode,
}) {
  const [invoices, setInvoices] = useState([]);
  const [filteredInvoices, setFilteredInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [distributors, setDistributors] = useState([]);
  const [products, setProducts] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set()); // v1.11.0 multi-select utk export CSV
  const [expandedRows, setExpandedRows] = useState({});
  const [showTrash, setShowTrash] = useState(false);
  const [trashItems, setTrashItems] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [permanentDeleteId, setPermanentDeleteId] = useState(null);
  const [draftBanner, setDraftBanner] = useState(false);
  const [savedDraft, setSavedDraft] = useState(null);
  const [savedDraftUpdatedAt, setSavedDraftUpdatedAt] = useState(null);
  const [dupConfirm, setDupConfirm] = useState(null);
  const [successToast, setSuccessToast] = useState("");
  const [auditModal, setAuditModal] = useState(null); // { invoiceId, invoiceNumber }
  const [auditLog, setAuditLog] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  const draftDebounceRef = useRef(null);
  const toastTimerRef = useRef(null);

  // Sort
  const [sortKey, setSortKey] = useState("");
  const [sortDir, setSortDir] = useState("asc");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Filters
  const [universalSearch, setUniversalSearch] = useState("");
  const debouncedUniversalSearch = useDebouncedValue(universalSearch, 300);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [searchDist, setSearchDist] = useState("");
  const [searchInv, setSearchInv] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDue, setFilterDue] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // Rekap per distributor filters (independent)

  // Form
  const [form, setForm] = useState(blankForm());
  const [items, setItems] = useState([blankItem()]);
  const totals = calcTotals(items, form);
  useBodyScrollLock(showModal || !!auditModal);

  useEffect(() => {
    fetchInvoices();
    fetchDistributors();
    fetchProducts();
    fetchPurchaseOrders();
    checkDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!showModal) return;
    if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current);
    draftDebounceRef.current = setTimeout(() => {
      invoicesAPI.saveDraft({ form, items }).catch((err) => {
        console.error("Error autosaving invoice draft:", err);
      });
    }, UI_MOTION.duration.draftDebounce);
    return () => clearTimeout(draftDebounceRef.current);
  }, [form, items, showModal]);
  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    [],
  );

  const showToast = (msg, durationMs) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setSuccessToast(msg);
    // AUDIT-UX-02: pesan error/gagal tahan lebih lama (operator sempat baca)
    const isErrorish = /^(error|gagal|❌|⚠️)/i.test(String(msg));
    toastTimerRef.current = setTimeout(
      () => setSuccessToast(""),
      durationMs ||
        (isErrorish
          ? UI_MOTION.duration.toastError
          : UI_MOTION.duration.toastSuccess),
    );
  };

  const fetchInvoices = async () => {
    try {
      const r = await invoicesAPI.getAll();
      setInvoices(r.data);
    } catch (e) {
      console.error(e);
      // AUDIT-UX-06: gagal fetch jangan diam — tanpa ini layar tampil "belum ada faktur"
      // palsu dan operator bisa input ulang (dobel data).
      showToast("Gagal memuat daftar faktur — cek koneksi lalu muat ulang halaman", 6000);
    } finally {
      setLoading(false);
    }
  };
  const fetchDistributors = async () => {
    try {
      const r = await distributorsAPI.getAll();
      setDistributors(r.data);
    } catch (e) {
      console.error("Error loading distributors:", e);
    }
  };
  const fetchProducts = async () => {
    try {
      const r = await inventoryAPI.getProducts({ limit: 2000 });
      setProducts((r.data || []).map(toProductOption));
    } catch (e) {
      console.error("Error loading products:", e);
    }
  };
  const fetchPurchaseOrders = async () => {
    try {
      const r = await purchaseOrdersAPI.getAll();
      setPurchaseOrders(
        (r.data || []).filter((po) => po.status && po.status !== "draft"),
      );
    } catch (e) {
      console.error("Error loading purchase orders:", e);
    }
  };
  // v1.10.0: pilih SP sebagai sumber faktur → prefill items + link purchase_order_id (backend skip stock-in kalau SP sudah Terima Barang, cegah stok dobel)
  const handleSelectSP = async (poId) => {
    if (!poId) {
      setForm((f) => ({ ...f, purchase_order_id: null }));
      return;
    }
    try {
      const r = await purchaseOrdersAPI.getById(poId);
      const po = r.data;
      setForm((f) => ({
        ...f,
        purchase_order_id: poId,
        distributor_name: po.distributor_name || f.distributor_name,
      }));
      if (po.items && po.items.length) {
        // v1.16.2: jika PO item punya received_batches, buat satu baris faktur per batch penerimaan
        setItems(
          po.items.flatMap((it) => {
            const poTaxType = form.tax_type === "nota" ? "nota" : "faktur";
            if (it.received_batches && it.received_batches.length > 0) {
              return it.received_batches.map((batch) =>
                calcItem(
                  {
                    ...blankItem(),
                    product_name: it.product_name,
                    product_id: it.product_id || null,
                    batch_number: batch.batch_no || '',
                    expired_date: batch.expired_date || '',
                    quantity: batch.source_qty_value || batch.received_qty_base || it.qty || 1,
                    unit: batch.source_qty_unit || it.unit || 'pcs',
                    hna: batch.hna || '',
                  },
                  0,
                  poTaxType,
                ),
              );
            }
            // Current behavior: one row per PO item
            return [
              calcItem(
                {
                  ...blankItem(),
                  product_name: it.product_name,
                  product_id: it.product_id || null,
                  quantity: it.qty || 1,
                  unit: it.unit || "pcs",
                },
                0,
                poTaxType,
              ),
            ];
          }),
        );
      }
    } catch (e) {
      console.error(e);
    }
  };
  const fetchTrash = async () => {
    try {
      const r = await invoicesAPI.getTrash();
      setTrashItems(r.data);
    } catch (e) {
      console.error("Error loading invoice trash:", e);
    }
  };
  const checkDraft = async () => {
    try {
      const r = await invoicesAPI.getDraft();
      if (r.data?.draft_data) {
        setSavedDraft(r.data.draft_data);
        setSavedDraftUpdatedAt(r.data.updated_at || null);
        setDraftBanner(true);
      }
    } catch (e) {
      console.error("Error loading saved invoice draft:", e);
    }
  };

  const applyFilters = () => {
    let f = invoices;
    if (debouncedUniversalSearch.trim()) {
      const q = debouncedUniversalSearch.toLowerCase();
      f = f.filter(
        (i) =>
          i.invoice_number?.toLowerCase().includes(q) ||
          i.distributor_name?.toLowerCase().includes(q) ||
          i.status?.toLowerCase().includes(q) ||
          (i.product_names && i.product_names.toLowerCase().includes(q)),
      );
    }
    if (selectedMonth !== "all")
      f = f.filter(
        (i) =>
          parseLocalDate(i.purchase_date)?.toLocaleString("id-ID", {
            month: "long",
            year: "numeric",
          }) === selectedMonth,
      );
    if (searchDist)
      f = f.filter((i) =>
        i.distributor_name?.toLowerCase().includes(searchDist.toLowerCase()),
      );
    if (searchInv)
      f = f.filter((i) =>
        i.invoice_number?.toLowerCase().includes(searchInv.toLowerCase()),
      );
    if (filterStatus !== "all") f = f.filter((i) => i.status === filterStatus);
    if (filterDue === "overdue")
      f = f.filter((i) => {
        const d = daysDiff(i.due_date);
        return d !== null && d < 0 && i.status !== "Paid";
      });
    if (filterDue === "soon")
      f = f.filter((i) => {
        const d = daysDiff(i.due_date);
        return d !== null && d >= 0 && d <= 7 && i.status !== "Paid";
      });
    if (dateFrom)
      f = f.filter(
        (i) => parseLocalDate(i.purchase_date) >= parseLocalDate(dateFrom),
      );
    if (dateTo)
      f = f.filter(
        (i) => parseLocalDate(i.purchase_date) <= parseLocalDate(dateTo),
      );
    // Sort
    if (sortKey) {
      f = sortData(f, sortKey, sortDir);
    } else {
      // Default: tanggal faktur terbaru dulu (purchase_date desc)
      f = [...f].sort(
        (a, b) => new Date(b.purchase_date) - new Date(a.purchase_date),
      );
    }
    setFilteredInvoices(f);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const applyFiltersMemo = useCallback(applyFilters, [
    invoices,
    debouncedUniversalSearch,
    selectedMonth,
    searchDist,
    searchInv,
    filterStatus,
    filterDue,
    dateFrom,
    dateTo,
    sortKey,
    sortDir,
  ]);
  useEffect(() => {
    applyFiltersMemo();
    setCurrentPage(1);
  }, [applyFiltersMemo]);

  // v1.11.0: multi-select + export CSV rekap PPN
  const toggleSelect = (id) =>
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const allFilteredSelected =
    filteredInvoices.length > 0 &&
    filteredInvoices.every((i) => selectedIds.has(i.id));
  const toggleSelectAll = () =>
    setSelectedIds((prev) => {
      if (
        filteredInvoices.length > 0 &&
        filteredInvoices.every((i) => prev.has(i.id))
      )
        return new Set();
      return new Set(filteredInvoices.map((i) => i.id));
    });
  // reset pilihan saat filter berubah supaya gak ada id "hantu"
  useEffect(() => {
    setSelectedIds(new Set());
  }, [
    debouncedUniversalSearch,
    selectedMonth,
    searchDist,
    searchInv,
    filterStatus,
    filterDue,
    dateFrom,
    dateTo,
  ]);

  const handleExportCSV = async () => {
    const rows = invoices.filter((i) => selectedIds.has(i.id));
    if (rows.length === 0) return;
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const num = (v) => (parseFloat(v) || 0).toFixed(2);
    showToast("⏳ Menyiapkan CSV...");
    // v1.11.2b: 1 baris PER PRODUK (No Faktur diulang), DPP/PPN/Total per-produk.
    // Fetch detail item tiap faktur (Promise.all biar gak race).
    let details;
    try {
      details = await Promise.all(
        rows.map((r) =>
          invoicesAPI
            .getById(r.id)
            .then((res) => ({ inv: r, items: res.data.items || [] })),
        ),
      );
    } catch (e) {
      showToast("❌ Gagal ambil detail faktur");
      return;
    }
    const PPN = 0.11;
    const header = [
      "Tanggal",
      "No Faktur",
      "Distributor",
      "Produk",
      "Qty",
      "Satuan",
      "DPP",
      "PPN 11%",
      "Total",
    ];
    const lines = [header.join(";")];
    let tDpp = 0,
      tPpn = 0,
      tTot = 0,
      tQty = 0,
      rowCount = 0;
    details.forEach(({ inv, items }) => {
      const list = items.length ? items : [null];
      list.forEach((it) => {
        // DPP per-item = hna_baru (hna×qty net disc, exc PPN). Fallback hna×quantity.
        const dpp = it
          ? parseFloat(it.hna_baru) ||
            (parseFloat(it.hna) || 0) * (parseFloat(it.quantity) || 0)
          : 0;
        const ppn = dpp * PPN;
        const tot = dpp + ppn;
        const qty = it ? parseFloat(it.quantity) || 0 : 0;
        tDpp += dpp;
        tPpn += ppn;
        tTot += tot;
        tQty += qty;
        rowCount++;
        lines.push(
          [
            esc(formatLocalDate(inv.purchase_date)),
            esc(inv.invoice_number),
            esc(inv.distributor_name),
            esc(it ? it.product_name : "(tanpa item)"),
            num(qty),
            esc(it ? it.unit || "pcs" : ""),
            num(dpp),
            num(ppn),
            num(tot),
          ].join(";"),
        );
      });
    });
    lines.push(
      [
        "",
        "",
        esc("TOTAL"),
        "",
        num(tQty),
        "",
        num(tDpp),
        num(tPpn),
        num(tTot),
      ].join(";"),
    );
    const blob = new Blob(["﻿" + lines.join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Rekap_PPN_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(
      `✅ ${rowCount} baris produk dari ${rows.length} faktur diekspor`,
    );
  };

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const getUniqueMonths = () => {
    const s = new Set();
    invoices.forEach((i) =>
      s.add(
        parseLocalDate(i.purchase_date)?.toLocaleString("id-ID", {
          month: "long",
          year: "numeric",
        }),
      ),
    );
    return Array.from(s).sort();
  };

  const overdueCount = invoices.filter((i) => {
    const d = daysDiff(i.due_date);
    return d !== null && d < 0 && i.status !== "Paid";
  }).length;
  const soonCount = invoices.filter((i) => {
    const d = daysDiff(i.due_date);
    return d !== null && d >= 0 && d <= 7 && i.status !== "Paid";
  }).length;

  // Pagination
  const totalPages = Math.ceil(filteredInvoices.length / pageSize);
  const paginatedInvoices = filteredInvoices.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  // Item handlers
  const updateItem = (idx, field, val) => {
    const taxType = form.tax_type === "nota" ? "nota" : "faktur";
    setItems((prev) => {
      const n = [...prev];
      const current = normalizeItem(n[idx]);
      if (field === "unit_price_input") {
        n[idx] = calcItem(
          {
            ...current,
            hna: toRawHna(val, current.price_basis, taxType),
          },
          0,
          taxType,
        );
      } else if (field === "price_basis") {
        n[idx] = calcItem({ ...current, price_basis: val }, 0, taxType);
      } else if (field === "product_option") {
        n[idx] = calcItem(
          {
            ...current,
            product_name: val?.name || "",
            product_id: val?.id || null,
            unit: current.unit || val?.base_unit || val?.unit || "pcs",
          },
          0,
          taxType,
        );
      } else {
        const updated = { ...current, [field]: val };
        if (field === "product_name") {
          const match = products.find(
            (p) => p.name?.toLowerCase() === val?.toLowerCase(),
          );
          updated.product_id = match?.id || null;
        }
        n[idx] = calcItem(updated, 0, taxType);
      }
      return n;
    });
  };
  const addItem = () => setItems((prev) => [...prev, blankItem()]);
  const removeItem = (idx) =>
    setItems((prev) => prev.filter((_, i) => i !== idx));
  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === "tax_type") {
      const taxType = value === "nota" ? "nota" : "faktur";
      setItems((prev) => prev.map((i) => calcItem(i, 0, taxType)));
    }
  };

  const handleAddDistributor = async (name) => {
    const res = await distributorsAPI.add(name);
    const saved = res.data.name;
    setDistributors((prev) =>
      prev.some((d) => d.name === saved)
        ? prev
        : [...prev, { name: saved }].sort((a, b) =>
            a.name.localeCompare(b.name),
          ),
    );
  };
  const handleRemoveDistributor = async (name) => {
    await distributorsAPI.remove(name);
    setDistributors((prev) => prev.filter((d) => d.name !== name));
  };
  const handleRenameDistributor = async (oldName, newName) => {
    try {
      await distributorsAPI.rename(oldName, newName);
      setDistributors((prev) =>
        prev
          .map((d) => (d.name === oldName ? { ...d, name: newName } : d))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.distributor_name === oldName
            ? { ...inv, distributor_name: newName }
            : inv,
        ),
      );
    } catch (e) {
      showToast("Gagal rename: " + (e.response?.data?.error || e.message));
    }
  };
  // Validate
  const validateForm = () => {
    if (!form.invoice_number?.trim()) return "No Faktur wajib diisi";
    if (!form.purchase_date) return "Tanggal Faktur wajib diisi";
    if (!form.distributor_name?.trim()) return "Distributor wajib diisi";
    const validItems = items.filter((i) => i.product_name.trim());
    if (validItems.length === 0) return "Minimal 1 produk harus diisi";
    for (const i of validItems) {
      if (!parseNum(i.quantity) || parseNum(i.quantity) <= 0)
        return `QTY produk "${i.product_name}" harus lebih dari 0`;
      if (!parseNum(i.hna) || parseNum(i.hna) <= 0)
        return `Harga produk "${i.product_name}" harus lebih dari 0`;
    }
    if (
      form.due_date &&
      form.purchase_date &&
      new Date(form.due_date) < new Date(form.purchase_date)
    ) {
      return "Tanggal jatuh tempo tidak boleh sebelum tanggal faktur";
    }
    return null;
  };

  const buildPayload = () => {
    const taxType = form.tax_type === "nota" ? "nota" : "faktur";
    const itemsWithCod =
      totals.items_with_cod ||
      items.map((i) => ({
        ...i,
        disc_cod_per_item: 0,
        hna_after_cod: i.hna_baru,
        hpp_inc_ppn: i.hna_per_item * (1 + ppnRateFor(taxType)),
      }));
    return {
      ...form,
      ...totals,
      disc_cod_amount: totals.disc_cod_amount,
      items: items
        .filter((i) => i.product_name.trim())
        .map((i) => {
          const withCod = itemsWithCod.find((x) => x._id === i._id) || i;
          return {
            product_name: i.product_name,
            product_id: i.product_id || null,
            expired_date: i.expired_date || null,
            quantity: parseNum(i.quantity),
            hna: parseNum(i.hna),
            price_basis: i.price_basis || "hna_exc",
            unit_price: parseNum(i.hna),
            hna_times_qty: i.hna_times_qty,
            total_price: i.hna_times_qty,
            disc_percent: parseNum(i.disc_percent),
            disc_nominal: i.disc_nominal,
            hna_baru: i.hna_baru,
            hna_per_item: i.hna_per_item,
            margin: 0,
            disc_cod_per_item: withCod.disc_cod_per_item || 0,
            hna_after_cod: withCod.hna_after_cod || i.hna_baru,
            hpp_inc_ppn:
              withCod.hpp_inc_ppn ||
              (i.hna_per_item || 0) * (1 + ppnRateFor(taxType)),
            unit: i.unit || "pcs", // v1.6.0: pass unit ke backend untuk konversi qty → base
            batch_number: i.batch_number || null,
          };
        }),
    };
  };

  const handleSubmit = async () => {
    const err = validateForm();
    if (err) {
      showToast(err);
      return;
    }

    const payload = buildPayload();
    const existing = invoices.find(
      (inv) =>
        inv.invoice_number === form.invoice_number && inv.id !== editingId,
    );
    if (existing && !editingId) {
      setDupConfirm({
        invoiceNumber: form.invoice_number,
        existingId: existing.id,
        pendingPayload: payload,
      });
      return;
    }
    await doSave(payload);
  };

  const doSave = async (payload) => {
    setIsSaving(true);
    try {
      const isEdit = !!editingId;
      if (isEdit) {
        await invoicesAPI.update(editingId, payload);
      } else {
        await invoicesAPI.create(payload);
      }
      try {
        await invoicesAPI.clearDraft();
      } catch (e) {
        console.error("Error clearing invoice draft after save:", e);
      }
      setSavedDraft(null);
      setSavedDraftUpdatedAt(null);
      setDraftBanner(false);
      fetchInvoices();
      fetchDistributors();
      fetchProducts();
      resetForm();
      setShowModal(false);
      showToast(
        isEdit
          ? "✅ Faktur berhasil diupdate!"
          : "✅ Faktur berhasil disimpan!",
      );
    } catch (err) {
      const unmatched = err.response?.data?.unmatchedProducts || [];
      if (err.response?.status === 422 && unmatched.length > 0) {
        const names = unmatched.map((u) => `"${u.name}"`).join(", ");
        showToast(
          `⚠️ Faktur tidak disimpan. Produk belum dikenali master Inventory: ${names}. Pilih produk dari master atau buat produk baru dulu.`,
          9000,
        );
        return;
      }
      showToast("Error: " + (err.response?.data?.error || err.message));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDupOverwrite = async () => {
    if (!dupConfirm) return;
    try {
      await invoicesAPI.update(
        dupConfirm.existingId,
        dupConfirm.pendingPayload,
      );
      try {
        await invoicesAPI.clearDraft();
      } catch (e) {
        console.error("Error clearing invoice draft after overwrite:", e);
      }
      setSavedDraft(null);
      setSavedDraftUpdatedAt(null);
      setDraftBanner(false);
      fetchInvoices();
      resetForm();
      setShowModal(false);
      setDupConfirm(null);
      showToast("✅ Faktur berhasil diupdate!");
    } catch (err) {
      showToast("Error: " + (err.response?.data?.error || err.message));
    }
  };

  const handleDupLoadExisting = async () => {
    if (!dupConfirm) return;
    const existingId = dupConfirm.existingId;
    setDupConfirm(null);
    try {
      const res = await invoicesAPI.getById(existingId);
      const { invoice, items: invItems } = res.data;
      const loadedTaxType = invoice.tax_type === "nota" ? "nota" : "faktur";
      setForm({
        invoice_number: invoice.invoice_number,
        purchase_date: invoice.purchase_date?.split("T")[0] || "",
        distributor_name: invoice.distributor_name,
        tax_type: loadedTaxType,
        disc_cod_ada: invoice.disc_cod_ada || false,
        disc_cod_amount: invoice.disc_cod_amount || "",
        disc_cod_percent: "",
        due_date: invoice.due_date?.split("T")[0] || "",
        payment_date: invoice.payment_date?.split("T")[0] || "",
        status: invoice.status,
      });
      setItems(
        invItems.length > 0
          ? invItems.map((i) =>
              calcItem(
                {
                  _id: Math.random().toString(36).slice(2),
                  product_name: i.product_name || "",
                  product_id: i.product_id || null,
                  batch_number: i.batch_number || "",
                  expired_date: i.expired_date?.split("T")[0] || "",
                  quantity: i.quantity || "",
                  hna: i.hna || i.unit_price || "",
                  hna_times_qty: i.hna_times_qty || 0,
                  disc_percent: i.disc_percent || "",
                  disc_nominal: i.disc_nominal || 0,
                  disc_mode: "percent",
                  disc_input: i.disc_percent ? String(i.disc_percent) : "",
                  hna_baru: i.hna_baru || 0,
                  hna_per_item: i.hna_per_item || 0,
                  price_basis: "hna_exc",
                  unit: i.unit || "pcs",
                },
                0,
                loadedTaxType,
              ),
            )
          : [blankItem()],
      );
      setEditingId(existingId);
    } catch (err) {
      showToast("Error loading invoice");
    }
  };

  const handleEdit = async (inv) => {
    try {
      const res = await invoicesAPI.getById(inv.id);
      const { invoice, items: invItems } = res.data;
      const loadedTaxType = invoice.tax_type === "nota" ? "nota" : "faktur";
      setForm({
        invoice_number: invoice.invoice_number,
        purchase_date: invoice.purchase_date?.split("T")[0] || "",
        distributor_name: invoice.distributor_name,
        tax_type: loadedTaxType,
        disc_cod_ada: invoice.disc_cod_ada || false,
        disc_cod_amount: invoice.disc_cod_amount || "",
        disc_cod_percent: "",
        due_date: invoice.due_date?.split("T")[0] || "",
        payment_date: invoice.payment_date?.split("T")[0] || "",
        status: invoice.status,
      });
      setItems(
        invItems.length > 0
          ? invItems.map((i) =>
              calcItem(
                {
                  _id: Math.random().toString(36).slice(2),
                  product_name: i.product_name || "",
                  product_id: i.product_id || null,
                  batch_number: i.batch_number || "",
                  expired_date: i.expired_date?.split("T")[0] || "",
                  quantity: i.quantity || "",
                  hna: i.hna || i.unit_price || "",
                  hna_times_qty: i.hna_times_qty || 0,
                  disc_percent: i.disc_percent || "",
                  disc_nominal: i.disc_nominal || 0,
                  disc_mode: "percent",
                  disc_input: i.disc_percent ? String(i.disc_percent) : "",
                  hna_baru: i.hna_baru || 0,
                  hna_per_item: i.hna_per_item || 0,
                  price_basis: "hna_exc",
                  unit: i.unit || "pcs",
                },
                0,
                loadedTaxType,
              ),
            )
          : [blankItem()],
      );
      setEditingId(inv.id);
      setShowModal(true);
    } catch (err) {
      showToast("Error loading invoice");
    }
  };

  const handleDeleteRequest = (inv) =>
    setDeleteConfirm({ id: inv.id, name: inv.invoice_number });
  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    try {
      await invoicesAPI.softDelete(deleteConfirm.id);
      fetchInvoices();
      setDeleteConfirm(null);
      showToast("🗑️ Faktur dipindahkan ke trash");
    } catch (e) {
      showToast("Gagal menghapus faktur");
    }
  };
  const handleRestore = async (id) => {
    try {
      await invoicesAPI.restore(id);
      fetchTrash();
      fetchInvoices();
      showToast("✅ Faktur berhasil direstore");
    } catch (e) {
      showToast("Gagal restore faktur");
      console.error("Error restoring invoice:", e);
    }
  };
  // AUDIT-UX-03: hapus permanen lewat ConfirmModal, bukan window.confirm
  const handlePermanentDelete = (id) => setPermanentDeleteId(id);
  const executePermanentDelete = async () => {
    const id = permanentDeleteId;
    setPermanentDeleteId(null);
    if (!id) return;
    try {
      await invoicesAPI.permanentDelete(id);
      fetchTrash();
      showToast("🗑️ Faktur dihapus permanen");
    } catch (e) {
      // AUDIT-UX-06: gagal hapus harus kelihatan (backend bisa menolak kalau stok sudah dipakai nota)
      showToast("Gagal hapus permanen: " + (e.response?.data?.error || e.message), 8000);
      console.error("Error permanent deleting invoice:", e);
    }
  };

  const resetForm = useCallback(() => {
    setForm(blankForm());
    setItems([blankItem()]);
    setEditingId(null);
  }, []);
  const loadDraft = () => {
    if (!savedDraft) return;
    const draftTaxType =
      savedDraft.form?.tax_type === "nota" ? "nota" : "faktur";
    if (savedDraft.form) setForm({ ...blankForm(), ...savedDraft.form });
    if (savedDraft.items)
      setItems(savedDraft.items.map((i) => calcItem(i, 0, draftTaxType)));
    setDraftBanner(false);
    setShowModal(true);
  };
  const dismissDraft = async () => {
    try {
      await invoicesAPI.clearDraft();
    } catch (e) {
      console.error("Error clearing invoice draft on dismiss:", e);
    }
    setSavedDraft(null);
    setSavedDraftUpdatedAt(null);
    setDraftBanner(false);
  };

  const openAuditLog = async (inv) => {
    try {
      const r = await auditAPI.getByInvoice(inv.id);
      setAuditLog(r.data);
      setAuditModal({ invoiceId: inv.id, invoiceNumber: inv.invoice_number });
    } catch (e) {
      showToast("Error loading audit log");
      console.error("Error loading invoice audit log:", e);
    }
  };

  useEffect(() => {
    if (!showModal && !showTrash && !dupConfirm && !deleteConfirm && !auditModal)
      return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (auditModal) {
        setAuditModal(null);
        return;
      }
      if (dupConfirm) {
        setDupConfirm(null);
        return;
      }
      if (deleteConfirm) {
        setDeleteConfirm(null);
        return;
      }
      if (showTrash) {
        setShowTrash(false);
        return;
      }
      if (showModal) {
        setShowModal(false);
        resetForm();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showModal, showTrash, dupConfirm, deleteConfirm, auditModal, resetForm]);

  const summaryData = filteredInvoices.length > 0 ? filteredInvoices : invoices;
  const sumHna = summaryData.reduce(
    (s, i) => s + parseFloat(i.total_hna || 0),
    0,
  );
  const sumFinal = summaryData.reduce(
    (s, i) => s + parseFloat(i.hna_final || i.final_hna || 0),
    0,
  );
  const sumPpn = summaryData.reduce(
    (s, i) => s + parseFloat(i.ppn_masukan || i.ppn_input || 0),
    0,
  );

  // Per-distributor summary — always show ALL known distributors, 0 if none in period
  const rekapSource =
    selectedMonth === "all"
      ? invoices
      : invoices.filter(
          (i) =>
            parseLocalDate(i.purchase_date)?.toLocaleString("id-ID", {
              month: "long",
              year: "numeric",
            }) === selectedMonth,
        );
  const allKnownDist = [
    ...new Set(invoices.map((i) => i.distributor_name).filter(Boolean)),
  ];
  const rekapMap = rekapSource.reduce((acc, inv) => {
    const d = inv.distributor_name || "Unknown";
    if (!acc[d]) acc[d] = { name: d, count: 0, total: 0 };
    acc[d].count++;
    acc[d].total += parseFloat(inv.hna_final || inv.final_hna || 0);
    return acc;
  }, {});
  allKnownDist.forEach((d) => {
    if (!rekapMap[d]) rekapMap[d] = { name: d, count: 0, total: 0 };
  });
  const distSummary = Object.values(rekapMap).sort((a, b) => b.total - a.total);

  const S = {
    card: {
      backgroundColor: "var(--color-surface)",
      border: "1px solid var(--color-border)",
      borderRadius: "12px",
      boxShadow: "var(--shadow-card)",
    },
    input: {
      width: "100%",
      padding: "10px 12px",
      border: "1px solid var(--color-border)",
      borderRadius: "10px",
      backgroundColor: "var(--color-surface-elevated)",
      color: "var(--color-text)",
      fontSize: "14px",
      outline: "none",
      boxSizing: "border-box",
    },
    inputDis: {
      width: "100%",
      padding: "10px 12px",
      border: "1px solid var(--color-border)",
      borderRadius: "10px",
      backgroundColor: "var(--color-bg-subtle)",
      color: "var(--color-text-muted)",
      cursor: "not-allowed",
      fontSize: "14px",
      boxSizing: "border-box",
    },
    label: {
      display: "block",
      fontSize: "11px",
      fontWeight: "700",
      marginBottom: "6px",
      color: "var(--color-text-muted)",
      letterSpacing: "0.05em",
      textTransform: "uppercase",
    },
    computed: {
      width: "100%",
      padding: "10px 12px",
      border: "1px solid var(--color-border)",
      borderRadius: "10px",
      backgroundColor: "var(--color-success-soft)",
      color: "var(--color-success)",
      fontWeight: "600",
      cursor: "not-allowed",
      fontSize: "14px",
      boxSizing: "border-box",
    },
  };
  // if (loading) return <div style={{ padding: isMobile ? '1rem' : '2rem', paddingTop: isMobile ? '4rem' : '2rem',  }}>Loading...</div>; (Removed early return to use skeletons)

  const SortIcon = ({ k }) => {
    if (sortKey !== k)
      return (
        <span
          style={{ color: "var(--color-border-strong)", marginLeft: "4px" }}
        >
          ↕
        </span>
      );
    return (
      <span style={{ color: "var(--color-primary)", marginLeft: "4px" }}>
        {sortDir === "asc" ? "↑" : "↓"}
      </span>
    );
  };

  return (
    <div
      className="ui-page ui-motion-page"
      style={{
        padding: isMobile ? "1rem" : "2rem",
        paddingTop: isMobile ? "4rem" : "2rem",
        backgroundColor: isVantaMode ? "transparent" : "var(--color-bg)",
        minHeight: "100vh",
        transition: uiTransition(
          "margin-left",
          UI_MOTION.duration.page,
          UI_MOTION.easing.standard,
        ),
      }}
    >
      <Breadcrumb
        title="Faktur Pembelian"
        isMobile={isMobile}
        isDarkMode={isDarkMode}
      />

      {/* Toast */}
      {/* v1.11.0: sticky action bar untuk multi-select export CSV */}
      {selectedIds.size > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: isDarkMode
              ? "var(--color-surface-elevated)"
              : "#FFF",
            border: `1px solid ${isDarkMode ? "var(--color-border-strong)" : "var(--color-border)"}`,
            borderRadius: "14px",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            gap: "14px",
            zIndex: 9998,
            boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
          }}
        >
          <span
            style={{
              fontSize: "13px",
              fontWeight: "600",
              color: isDarkMode ? "#FFF" : "#000",
            }}
          >
            {selectedIds.size} faktur dipilih
          </span>
          <button
            onClick={handleExportCSV}
            style={{
              padding: "8px 16px",
              backgroundColor: "var(--color-success)",
              color: "#FFF",
              border: "none",
              borderRadius: "10px",
              cursor: "pointer",
              fontWeight: "700",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <FileText size={15} /> Export CSV Rekap PPN
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            style={{
              padding: "8px 14px",
              backgroundColor: isDarkMode
                ? "var(--color-surface-raised)"
                : "var(--color-bg)",
              color: isDarkMode ? "#FFF" : "#000",
              border: "none",
              borderRadius: "10px",
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "13px",
            }}
          >
            Batal
          </button>
        </div>
      )}

      {successToast && (
        <div
          style={{
            position: "fixed",
            top: "24px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: successToast.startsWith("⚠️")
              ? "var(--color-warning, #d97706)"
              : /^(error|gagal|❌)/i.test(successToast)
                ? "var(--color-danger)"
                : "var(--color-success)",
            color: "white",
            padding: "12px 28px",
            borderRadius: "12px",
            fontWeight: "700",
            fontSize: "14px",
            zIndex: 9999,
            boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
            transition: uiTransition("all", UI_MOTION.duration.page),
            maxWidth: "600px",
            textAlign: "center",
            lineHeight: "1.5",
          }}
        >
          {successToast}
        </div>
      )}

      {/* Header */}
      <div
        className="ui-readable-surface"
        style={{
          marginBottom: "1.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "1rem",
          flexWrap: "wrap",
          padding: isMobile ? "1rem" : "1.25rem 1.5rem",
          borderRadius: "1rem",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "2rem",
              fontWeight: "700",
              margin: "0 0 4px 0",
              color: "var(--color-text)",
            }}
          >
            📄 Faktur Pembelian
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              color: "var(--color-text-subtle)",
            }}
          >
            Faktur Pembelian — CV Habil
          </p>
        </div>
      </div>

      {/* Draft Banner */}
      {draftBanner && savedDraft && (
        <div
          className="ui-motion-card"
          style={{
            ...S.card,
            padding: "14px 18px",
            marginBottom: "1.25rem",
            backgroundColor: isDarkMode
              ? "var(--color-surface-elevated)"
              : "var(--color-warning-soft)",
            borderColor: "var(--color-warning)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <FileText size={18} color="var(--color-warning)" />
          <div style={{ flex: 1 }}>
            <span
              style={{
                fontWeight: "700",
                fontSize: "14px",
                color: isDarkMode ? "#FFF" : "#000",
              }}
            >
              Ada draft tersimpan
            </span>
            <span
              style={{
                fontSize: "13px",
                color: "var(--color-text-subtle)",
                marginLeft: "8px",
              }}
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
              color: "var(--color-text-subtle)",
              border: `1px solid ${isDarkMode ? "var(--color-border-strong)" : "var(--color-border)"}`,
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            Hapus Draft
          </button>
        </div>
      )}

      {/* Summary Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        {[
          {
            label: "Total HNA*QTY",
            value: formatRp(sumHna),
            icon: "💰",
            color: "#30B0C0",
          },
          {
            label: "Total PPN Masukan",
            value: formatRp(sumPpn, true),
            icon: "📊",
            color: "var(--color-warning)",
          },
          {
            label: "HNA Final",
            value: formatRp(sumFinal),
            icon: "📈",
            color: "var(--color-success)",
          },
          {
            label: "Jumlah Faktur",
            value: `${filteredInvoices.length} faktur`,
            icon: "📋",
            color: "var(--color-primary-hover)",
          },
        ].map((m, i) => (
          <div
            key={i}
            className="ui-stat-card-fluid ui-hover-delight ui-motion-card"
            style={{ ...S.card, padding: "1.25rem" }}
          >
            <div style={{ fontSize: "1.5rem", marginBottom: "6px" }}>
              {m.icon}
            </div>
            <p
              style={{
                margin: "0 0 4px",
                fontSize: "11px",
                fontWeight: "700",
                color: "var(--color-text-subtle)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {m.label}
            </p>
            {loading ? (
              <Skeleton width="100px" height="24px" />
            ) : (
              <p
                className="ui-kpi-value"
                style={{
                  margin: 0,
                  fontSize: "1.1rem",
                  fontWeight: "700",
                  color: m.color,
                }}
              >
                {m.value}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Per-distributor summary */}
      {distSummary.length > 1 && (
        <div
          className="ui-panel ui-motion-card"
          style={{
            padding: "1rem 1.25rem",
            marginBottom: "1.25rem",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "10px",
              flexWrap: "wrap",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: "11px",
                fontWeight: "700",
                color: "var(--color-text-subtle)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              📦 Rekap per Distributor
            </p>
            {/* Month filter for rekap */}
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{
                padding: "4px 28px 4px 10px",
                border: `1px solid ${isDarkMode ? "var(--color-border-strong)" : "var(--color-border)"}`,
                borderRadius: "8px",
                backgroundColor: isDarkMode
                  ? "var(--color-surface-raised)"
                  : "var(--color-bg)",
                color: isDarkMode ? "#FFF" : "#000",
                fontSize: "12px",
                cursor: "pointer",
                outline: "none",
              }}
            >
              <option value="all">Semua Bulan</option>
              {Array.from(
                new Set(
                  invoices.map((i) =>
                    parseLocalDate(i.purchase_date)?.toLocaleString("id-ID", {
                      month: "long",
                      year: "numeric",
                    }),
                  ),
                ),
              )
                .sort()
                .map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
            </select>
            {(searchDist || selectedMonth !== "all") && (
              <button
                onClick={() => {
                  setSearchDist("");
                  setSelectedMonth("all");
                }}
                style={{
                  padding: "4px 12px",
                  backgroundColor: "var(--color-danger)",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: "700",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <X size={11} /> Reset Filter
              </button>
            )}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "8px",
            }}
          >
            {distSummary.map((d, i) => {
              const isActive = searchDist === d.name;
              const clr = getDistColor(d.name, allKnownDist);
              const isEmpty = d.count === 0;
              return (
                <div
                  key={i}
                  onClick={() =>
                    !isEmpty && setSearchDist(isActive ? "" : d.name)
                  }
                  className="ui-hover-delight"
                  style={{
                    padding: "8px 12px",
                    borderRadius: "10px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    cursor: isEmpty ? "default" : "pointer",
                    transition: uiTransition("all", UI_MOTION.duration.fast),
                    opacity: isEmpty ? 0.45 : 1,
                    backgroundColor: isActive
                      ? clr.dot
                      : isDarkMode
                        ? "var(--color-surface-raised)"
                        : "var(--color-bg-subtle)",
                    border: `1px solid ${isActive ? clr.dot : isDarkMode ? "var(--color-border-strong)" : "var(--color-border)"}`,
                  }}
                >
                  <div
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      backgroundColor: isActive ? "#FFF" : clr.dot,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    title={d.name}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: "12px",
                      fontWeight: "600",
                      color: isActive
                        ? "#FFF"
                        : isDarkMode
                          ? "var(--color-text-muted)"
                          : "var(--color-text)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {d.name}
                  </span>
                  <span
                    style={{
                      fontSize: "11px",
                      color: isActive
                        ? "rgba(255,255,255,0.8)"
                        : "var(--color-text-subtle)",
                      flexShrink: 0,
                    }}
                  >
                    {d.count}×
                  </span>
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: "700",
                      color: isActive ? "#FFF" : clr.text,
                      flexShrink: 0,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatRp(d.total)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Action Buttons */}
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
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="btn-primary ui-motion-button ui-focus-ring"
            data-magnetic="true"
            style={{
              padding: "10px 20px",
              backgroundColor: "var(--color-primary)",
              color: "white",
              border: "none",
              borderRadius: "10px",
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "14px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Plus size={16} /> Buat Faktur
          </button>
          <button
            onClick={() => {
              setShowTrash(!showTrash);
              if (!showTrash) fetchTrash();
            }}
            style={{
              padding: "10px 16px",
              backgroundColor: showTrash
                ? "var(--color-danger)"
                : isDarkMode
                  ? "var(--color-surface-raised)"
                  : "var(--color-border)",
              color: showTrash ? "white" : isDarkMode ? "#FFF" : "#000",
              border: "none",
              borderRadius: "10px",
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "14px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Trash2 size={16} /> Trash
          </button>
        </div>
        {/* Jatuh Tempo — di sebelah kanan toolbar */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {overdueCount > 0 && (
            <div
              onClick={() => {
                setFilterDue("overdue");
                setShowFilters(true);
              }}
              style={{
                cursor: "pointer",
                padding: "8px 14px",
                backgroundColor: "var(--color-danger-soft)",
                border: "1.5px solid var(--color-danger)",
                borderRadius: "10px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <AlertTriangle size={14} color="var(--color-danger)" />
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: "700",
                  color: "var(--color-danger)",
                }}
              >
                {overdueCount} Terlambat
              </span>
            </div>
          )}
          {soonCount > 0 && (
            <div
              onClick={() => {
                setFilterDue("soon");
                setShowFilters(true);
              }}
              style={{
                cursor: "pointer",
                padding: "8px 14px",
                backgroundColor: "var(--color-warning-soft)",
                border: "1.5px solid var(--color-warning)",
                borderRadius: "10px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Clock size={14} color="var(--color-warning)" />
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: "700",
                  color: "var(--color-warning)",
                }}
              >
                {soonCount} Jatuh Tempo
              </span>
            </div>
          )}
          {overdueCount === 0 && soonCount === 0 && invoices.length > 0 && (
            <div
              style={{
                padding: "8px 14px",
                backgroundColor: "var(--color-success-soft)",
                border: "1.5px solid var(--color-success)",
                borderRadius: "10px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Clock size={14} color="var(--color-success)" />
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: "700",
                  color: "var(--color-success)",
                }}
              >
                Semua Jatuh Tempo OK
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Search + Filter */}
      <div
        className="ui-toolbar ui-motion-card"
        style={{
          ...S.card,
          padding: "1rem",
          marginBottom: "1rem",
          flexDirection: "column",
          alignItems: "stretch",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: showFilters ? "12px" : "0",
          }}
        >
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "10px 14px",
              backgroundColor: "var(--color-surface-elevated)",
              borderRadius: "10px",
              border: "1px solid var(--color-border)",
            }}
          >
            <Search size={16} color="var(--color-text-subtle)" />
            <input
              value={universalSearch}
              onChange={(e) => setUniversalSearch(e.target.value)}
              placeholder="Cari no. faktur, distributor, produk, status..."
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                backgroundColor: "transparent",
                color: "var(--color-text)",
                fontSize: "14px",
              }}
            />
            {universalSearch && (
              <IconTooltipButton
                label="Hapus pencarian"
                buttonStyle={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                }}
                tooltipBg={
                  isDarkMode ? "var(--color-surface-elevated)" : "#FFF"
                }
                tooltipColor={isDarkMode ? "#FFF" : "#000"}
                tooltipBorder={
                  isDarkMode
                    ? "var(--color-surface-raised)"
                    : "var(--color-border)"
                }
                onClick={() => setUniversalSearch("")}
              >
                <X size={14} color="var(--color-text-subtle)" />
              </IconTooltipButton>
            )}
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            style={{
              padding: "10px 16px",
              backgroundColor: showFilters
                ? "var(--color-primary)"
                : "var(--color-surface-elevated)",
              color: showFilters ? "white" : "var(--color-text)",
              border: "1px solid var(--color-border)",
              borderRadius: "10px",
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              whiteSpace: "nowrap",
            }}
          >
            Filter {showFilters ? "▲" : "▼"}
            {(selectedMonth !== "all" ||
              searchDist ||
              searchInv ||
              filterStatus !== "all" ||
              filterDue !== "all" ||
              dateFrom ||
              dateTo) && (
              <span
                style={{
                  backgroundColor: "var(--color-danger)",
                  color: "white",
                  borderRadius: "10px",
                  padding: "1px 6px",
                  fontSize: "11px",
                  fontWeight: "700",
                }}
              >
                !
              </span>
            )}
          </button>
        </div>
        {showFilters && (
          <div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: "10px",
                paddingTop: "4px",
              }}
            >
              <div>
                <label style={S.label}>Bulan</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  style={S.input}
                >
                  <option value="all">Semua Bulan</option>
                  {getUniqueMonths().map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={S.label}>Distributor</label>
                <input
                  style={S.input}
                  value={searchDist}
                  onChange={(e) => setSearchDist(e.target.value)}
                  placeholder="Cari..."
                />
              </div>
              <div>
                <label style={S.label}>No Faktur</label>
                <input
                  style={S.input}
                  value={searchInv}
                  onChange={(e) => setSearchInv(e.target.value)}
                  placeholder="Cari..."
                />
              </div>
              <div>
                <label style={S.label}>Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  style={S.input}
                >
                  <option value="all">Semua</option>
                  <option value="Pending">Belum Bayar</option>
                  <option value="Paid">Sudah Dibayar</option>
                </select>
              </div>
              <div>
                <label style={S.label}>Jatuh Tempo</label>
                <select
                  value={filterDue}
                  onChange={(e) => setFilterDue(e.target.value)}
                  style={S.input}
                >
                  <option value="all">Semua</option>
                  <option value="overdue">Terlambat</option>
                  <option value="soon">≤ 7 hari</option>
                </select>
              </div>
              <div>
                <label style={S.label}>Dari Tanggal</label>
                <input
                  type="date"
                  style={S.input}
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div>
                <label style={S.label}>Sampai</label>
                <input
                  type="date"
                  style={S.input}
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>
            <button
              onClick={() => {
                setSelectedMonth("all");
                setSearchDist("");
                setSearchInv("");
                setFilterStatus("all");
                setFilterDue("all");
                setDateFrom("");
                setDateTo("");
              }}
              style={{
                marginTop: "10px",
                padding: "8px 16px",
                backgroundColor: isDarkMode
                  ? "var(--color-surface-raised)"
                  : "var(--color-border)",
                color: isDarkMode ? "#FFF" : "#000",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              Hapus Filter
            </button>
          </div>
        )}
      </div>

      {/* Trash Panel */}
      {showTrash && (
        <div
          className="ui-motion-card"
          style={{
            ...S.card,
            padding: "1.25rem",
            marginBottom: "1.25rem",
            borderColor: "var(--color-danger)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px",
            }}
          >
            <p
              style={{
                margin: 0,
                fontWeight: "700",
                fontSize: "14px",
                color: "var(--color-danger)",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Trash2 size={16} /> Sampah ({trashItems.length})
            </p>
            <IconTooltipButton
              label="Tutup sampah"
              buttonStyle={{
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
              tooltipBg={isDarkMode ? "var(--color-surface-elevated)" : "#FFF"}
              tooltipColor={isDarkMode ? "#FFF" : "#000"}
              tooltipBorder={
                isDarkMode
                  ? "var(--color-surface-raised)"
                  : "var(--color-border)"
              }
              onClick={() => setShowTrash(false)}
            >
              <X size={16} color="var(--color-text-subtle)" />
            </IconTooltipButton>
          </div>
          {trashItems.length === 0 ? (
            <p
              style={{
                color: "var(--color-text-subtle)",
                fontSize: "13px",
                textAlign: "center",
                padding: "1rem",
              }}
            >
              Sampah kosong
            </p>
          ) : (
            trashItems.map((inv) => (
              <div
                key={inv.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  backgroundColor: isDarkMode
                    ? "var(--color-surface-raised)"
                    : "#F9F9F9",
                  marginBottom: "6px",
                  gap: "12px",
                }}
              >
                <div style={{ flex: 1 }}>
                  <span
                    style={{
                      fontWeight: "700",
                      fontSize: "13px",
                      color: isDarkMode ? "#FFF" : "#000",
                    }}
                  >
                    {inv.invoice_number}
                  </span>
                  <span
                    style={{
                      fontSize: "12px",
                      color: "var(--color-text-subtle)",
                      marginLeft: "10px",
                    }}
                  >
                    {inv.distributor_name}
                  </span>
                  <span
                    style={{
                      fontSize: "11px",
                      color: "var(--color-danger)",
                      marginLeft: "10px",
                    }}
                  >
                    Dihapus: {formatLocalDate(inv.deleted_at)}
                  </span>
                </div>
                <button
                  onClick={() => handleRestore(inv.id)}
                  style={{
                    padding: "6px 12px",
                    backgroundColor: "var(--color-success)",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: "600",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <RotateCcw size={12} /> Restore
                </button>
                <button
                  onClick={() => handlePermanentDelete(inv.id)}
                  style={{
                    padding: "6px 12px",
                    backgroundColor: "var(--color-danger)",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: "600",
                  }}
                >
                  Hapus Permanen
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Invoice Table */}
      <div
        className="ui-table-shell ui-motion-card"
        style={{ overflowX: "auto", overflowY: "hidden" }}
      >
        {/* Table header — sortable */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "36px 110px 140px minmax(160px, 1fr) 130px 130px 150px 120px 100px",
            minWidth: "1080px",
            padding: "12px 16px",
            backgroundColor: "var(--color-surface-elevated)",
            borderBottom: "1px solid var(--color-border)",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={toggleSelectAll}
              title="Pilih semua (sesuai filter)"
              style={{ cursor: "pointer", width: "15px", height: "15px" }}
            />
          </div>
          {[
            { label: "Tgl Faktur", key: "purchase_date" },
            { label: "No Faktur", key: "invoice_number" },
            { label: "Distributor", key: "distributor_name" },
            { label: "HNA*QTY", key: "total_hna" },
            { label: "HNA Final", key: "hna_final" },
            { label: "HNA+PPN", key: "hna_plus_ppn" },
            { label: "Status", key: "status" },
            { label: "Aksi", key: null },
          ].map((h) => (
            <div
              key={h.label}
              onClick={() => h.key && handleSort(h.key)}
              style={{
                fontSize: "11px",
                fontWeight: "700",
                color:
                  sortKey === h.key
                    ? "var(--color-primary)"
                    : "var(--color-text-subtle)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                cursor: h.key ? "pointer" : "default",
                userSelect: "none",
                display: "flex",
                alignItems: "center",
              }}
            >
              {h.label}
              {h.key && <SortIcon k={h.key} />}
            </div>
          ))}
        </div>

        {loading ? (
          [...Array(pageSize)].map((_, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns:
                  "36px 110px 140px 1fr 130px 130px 150px 120px 100px",
                padding: "14px 16px",
                borderBottom: "1px solid var(--color-border)",
                alignItems: "center",
                backgroundColor: "var(--color-surface)",
              }}
            >
              <Skeleton width="15px" height="15px" />
              <Skeleton width="80px" height="14px" />
              <Skeleton width="100px" height="14px" />
              <Skeleton width="150px" height="24px" borderRadius="8px" />
              <Skeleton width="90px" height="14px" />
              <Skeleton width="90px" height="14px" />
              <Skeleton width="110px" height="14px" />
              <Skeleton width="80px" height="20px" borderRadius="20px" />
              <Skeleton width="70px" height="24px" borderRadius="8px" />
            </div>
          ))
        ) : paginatedInvoices.length === 0 ? (
          <tr>
            <td colSpan={12} style={{ padding: "2rem 1rem" }}>
              <EmptyState
                compact
                icon={EmptyStateIcons.invoice}
                title={
                  invoices.length === 0
                    ? "Belum ada faktur"
                    : `Tidak ada hasil untuk '${universalSearch || "filter aktif"}'`
                }
                description={
                  invoices.length === 0
                    ? "Buat faktur baru untuk mulai mencatat transaksi dan rekap PPN."
                    : "Coba kata kunci lain atau reset filter."
                }
              />
            </td>
          </tr>
        ) : (
          paginatedInvoices.map((inv) => (
            <InvoiceRow
              key={inv.id}
              inv={inv}
              isDarkMode={isDarkMode}
              selected={selectedIds.has(inv.id)}
              onToggleSelect={() => toggleSelect(inv.id)}
              expanded={!!expandedRows[inv.id]}
              onToggleExpand={() =>
                setExpandedRows((prev) => ({
                  ...prev,
                  [inv.id]: !prev[inv.id],
                }))
              }
              onEdit={() => handleEdit(inv)}
              onDelete={() => handleDeleteRequest(inv)}
              onAudit={() => openAuditLog(inv)}
              allKnownDist={allKnownDist}
              formatRp={formatRp}
            />
          ))
        )}

        {/* Pagination */}
        {filteredInvoices.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              borderTop: `1px solid ${isDarkMode ? "var(--color-surface-raised)" : "var(--color-border)"}`,
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{ fontSize: "13px", color: "var(--color-text-subtle)" }}
              >
                Tampilkan
              </span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                style={{
                  padding: "6px 10px",
                  border: `1px solid ${isDarkMode ? "var(--color-border-strong)" : "var(--color-border)"}`,
                  borderRadius: "8px",
                  backgroundColor: isDarkMode
                    ? "var(--color-surface-raised)"
                    : "var(--color-bg)",
                  color: isDarkMode ? "#FFF" : "#000",
                  fontSize: "13px",
                }}
              >
                {[5, 10, 25, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <span
                style={{ fontSize: "13px", color: "var(--color-text-subtle)" }}
              >
                per halaman · {filteredInvoices.length} total
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{
                  padding: "6px 10px",
                  border: `1px solid ${isDarkMode ? "var(--color-border-strong)" : "var(--color-border)"}`,
                  borderRadius: "8px",
                  backgroundColor: isDarkMode
                    ? "var(--color-surface-raised)"
                    : "#FFF",
                  color: isDarkMode ? "#FFF" : "#000",
                  cursor: currentPage === 1 ? "not-allowed" : "pointer",
                  opacity: currentPage === 1 ? 0.4 : 1,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <ChevronLeft size={14} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(
                  (p) =>
                    p === 1 ||
                    p === totalPages ||
                    Math.abs(p - currentPage) <= 1,
                )
                .map((p, idx, arr) => (
                  <React.Fragment key={p}>
                    {idx > 0 && arr[idx - 1] !== p - 1 && (
                      <span
                        style={{
                          color: "var(--color-text-subtle)",
                          fontSize: "13px",
                        }}
                      >
                        …
                      </span>
                    )}
                    <button
                      onClick={() => setCurrentPage(p)}
                      style={{
                        padding: "6px 12px",
                        border: `1px solid ${p === currentPage ? "var(--color-primary)" : isDarkMode ? "var(--color-border-strong)" : "var(--color-border)"}`,
                        borderRadius: "8px",
                        backgroundColor:
                          p === currentPage
                            ? "var(--color-primary)"
                            : isDarkMode
                              ? "var(--color-surface-raised)"
                              : "#FFF",
                        color:
                          p === currentPage
                            ? "white"
                            : isDarkMode
                              ? "#FFF"
                              : "#000",
                        cursor: "pointer",
                        fontSize: "13px",
                        fontWeight: p === currentPage ? "700" : "400",
                      }}
                    >
                      {p}
                    </button>
                  </React.Fragment>
                ))}
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
                style={{
                  padding: "6px 10px",
                  border: `1px solid ${isDarkMode ? "var(--color-border-strong)" : "var(--color-border)"}`,
                  borderRadius: "8px",
                  backgroundColor: isDarkMode
                    ? "var(--color-surface-raised)"
                    : "#FFF",
                  color: isDarkMode ? "#FFF" : "#000",
                  cursor:
                    currentPage === totalPages ? "not-allowed" : "pointer",
                  opacity: currentPage === totalPages ? 0.4 : 1,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Duplicate Confirm */}
      {dupConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
          }}
        >
          <div
            style={{
              backgroundColor: isDarkMode
                ? "var(--color-surface-elevated)"
                : "#FFF",
              borderRadius: "16px",
              padding: "28px",
              maxWidth: "400px",
              width: "90%",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                backgroundColor: "var(--color-warning-soft-strong)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
              }}
            >
              <AlertTriangle size={26} color="var(--color-warning)" />
            </div>
            <h3
              style={{
                margin: "0 0 8px",
                fontSize: "17px",
                fontWeight: "700",
                color: isDarkMode ? "#FFF" : "#000",
                textAlign: "center",
              }}
            >
              Faktur sudah ada!
            </h3>
            <p
              style={{
                margin: "0 0 20px",
                fontSize: "14px",
                color: "var(--color-text-subtle)",
                textAlign: "center",
              }}
            >
              Nomor faktur{" "}
              <strong style={{ color: isDarkMode ? "#FFF" : "#000" }}>
                {dupConfirm.invoiceNumber}
              </strong>{" "}
              sudah tersimpan sebelumnya.
            </p>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "10px" }}
            >
              <button
                onClick={handleDupLoadExisting}
                style={{
                  padding: "13px",
                  backgroundColor: "var(--color-primary)",
                  color: "white",
                  border: "none",
                  borderRadius: "10px",
                  cursor: "pointer",
                  fontWeight: "700",
                  fontSize: "14px",
                  textAlign: "left",
                  display: "flex",
                  flexDirection: "column",
                  gap: "2px",
                }}
              >
                <span>✏️ Buka & Edit Invoice yang Ada</span>
                <span
                  style={{ fontSize: "11px", fontWeight: "400", opacity: 0.85 }}
                >
                  Load data existing, bisa tambah/ubah produknya
                </span>
              </button>
              <button
                onClick={handleDupOverwrite}
                style={{
                  padding: "13px",
                  backgroundColor: isDarkMode
                    ? "var(--color-surface-raised)"
                    : "var(--color-bg)",
                  color: isDarkMode ? "#FFF" : "#000",
                  border: `1px solid ${isDarkMode ? "var(--color-border-strong)" : "var(--color-border)"}`,
                  borderRadius: "10px",
                  cursor: "pointer",
                  fontWeight: "600",
                  fontSize: "14px",
                  textAlign: "left",
                  display: "flex",
                  flexDirection: "column",
                  gap: "2px",
                }}
              >
                <span>🔄 Timpa dengan Data Sekarang</span>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: "400",
                    color: "var(--color-text-subtle)",
                  }}
                >
                  Faktur lama akan diganti sepenuhnya
                </span>
              </button>
              <button
                onClick={() => setDupConfirm(null)}
                style={{
                  padding: "12px",
                  backgroundColor: "transparent",
                  color: "var(--color-text-subtle)",
                  border: `1px solid ${isDarkMode ? "var(--color-surface-raised)" : "var(--color-border)"}`,
                  borderRadius: "10px",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                Batal — Ganti Nomor Faktur
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent Delete Confirm (trash) — AUDIT-UX-03 */}
      <ConfirmModal
        isOpen={!!permanentDeleteId}
        onClose={() => setPermanentDeleteId(null)}
        onConfirm={executePermanentDelete}
        title="Hapus Permanen"
        message="Faktur akan dihapus PERMANEN beserta batch stok bawaannya. Tidak bisa di-undo. Lanjutkan?"
        isDarkMode={isDarkMode}
        confirmLabel="Hapus Permanen"
      />

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
          }}
        >
          <div
            style={{
              backgroundColor: isDarkMode
                ? "var(--color-surface-elevated)"
                : "#FFF",
              borderRadius: "16px",
              padding: "28px",
              maxWidth: "360px",
              width: "90%",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                backgroundColor: "var(--color-danger-soft-strong)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
              }}
            >
              <Trash2 size={24} color="var(--color-danger)" />
            </div>
            <h3
              style={{
                margin: "0 0 8px",
                fontSize: "17px",
                fontWeight: "700",
                color: isDarkMode ? "#FFF" : "#000",
              }}
            >
              Pindahkan ke Trash?
            </h3>
            <p
              style={{
                margin: "0 0 6px",
                fontSize: "14px",
                color: "var(--color-text-subtle)",
              }}
            >
              Faktur{" "}
              <strong style={{ color: isDarkMode ? "#FFF" : "#000" }}>
                {deleteConfirm.name}
              </strong>{" "}
              akan dipindahkan ke trash.
            </p>
            <p
              style={{
                margin: "0 0 24px",
                fontSize: "12px",
                color: "var(--color-text-subtle)",
              }}
            >
              Kamu bisa restore dari Trash kapan saja.
            </p>
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{
                  flex: 1,
                  padding: "12px",
                  backgroundColor: isDarkMode
                    ? "var(--color-surface-raised)"
                    : "var(--color-border)",
                  color: isDarkMode ? "#FFF" : "#000",
                  border: "none",
                  borderRadius: "10px",
                  cursor: "pointer",
                  fontWeight: "600",
                  fontSize: "14px",
                }}
              >
                Batal
              </button>
              <button
                onClick={handleDeleteConfirm}
                style={{
                  flex: 1,
                  padding: "12px",
                  backgroundColor: "var(--color-danger)",
                  color: "white",
                  border: "none",
                  borderRadius: "10px",
                  cursor: "pointer",
                  fontWeight: "700",
                  fontSize: "14px",
                }}
              >
                Ke Trash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Log Modal */}
      {auditModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
            padding: "2rem",
          }}
        >
          <div
            style={{
              backgroundColor: isDarkMode
                ? "var(--color-surface-elevated)"
                : "#FFF",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "640px",
              maxHeight: "82vh",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "18px 22px",
                borderBottom: `1px solid ${isDarkMode ? "var(--color-surface-raised)" : "var(--color-border)"}`,
                backgroundColor: isDarkMode ? "#000" : "var(--color-bg)",
              }}
            >
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize: "16px",
                    fontWeight: "700",
                    color: isDarkMode ? "#FFF" : "#000",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <History size={16} color="var(--color-primary)" /> Riwayat
                  Perubahan
                </h3>
                <p
                  style={{
                    margin: "2px 0 0",
                    fontSize: "12px",
                    color: "var(--color-text-subtle)",
                  }}
                >
                  Faktur #{auditModal.invoiceNumber} · {auditLog.length} entri
                </p>
              </div>
              <button
                onClick={() => setAuditModal(null)}
                aria-label="Tutup riwayat perubahan"
                className="ui-motion-button ui-focus-ring"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "6px",
                }}
              >
                <X size={18} color="var(--color-text-subtle)" />
              </button>
            </div>

            {/* Timeline */}
            <div style={{ overflowY: "auto", padding: "20px 22px", flex: 1 }}>
              {auditLog.length === 0 ? (
                <p
                  style={{
                    color: "var(--color-text-subtle)",
                    textAlign: "center",
                    padding: "2rem",
                  }}
                >
                  Belum ada riwayat
                </p>
              ) : (
                auditLog.map((log, i) => {
                  const ACTION_CFG = {
                    CREATE: {
                      color: "var(--color-success)",
                      bg: "var(--color-success-soft)",
                      label: "✅ Dibuat",
                      icon: "✅",
                    },
                    UPDATE: {
                      color: "var(--color-primary)",
                      bg: "var(--color-primary-soft)",
                      label: "✏️ Diubah",
                      icon: "✏️",
                    },
                    DELETE: {
                      color: "var(--color-warning)",
                      bg: "var(--color-warning-soft)",
                      label: "🗑️ Dihapus",
                      icon: "🗑️",
                    },
                    RESTORE: {
                      color: "var(--color-success)",
                      bg: "var(--color-success-soft)",
                      label: "♻️ Direstore",
                      icon: "♻️",
                    },
                    PERMANENT_DELETE: {
                      color: "var(--color-danger)",
                      bg: "var(--color-danger-soft)",
                      label: "❌ Hapus Perm.",
                      icon: "❌",
                    },
                  };
                  const cfg = ACTION_CFG[log.action] || {
                    color: "var(--color-text-subtle)",
                    bg: "var(--color-text-subtle)18",
                    label: log.action,
                    icon: "•",
                  };

                  let snap = null;
                  try {
                    snap = log.snapshot
                      ? typeof log.snapshot === "string"
                        ? JSON.parse(log.snapshot)
                        : log.snapshot
                      : null;
                  } catch (e) {
                    console.warn(
                      "[InvoiceList] Failed to parse audit snapshot:",
                      e,
                    );
                  }

                  const isLast = i === auditLog.length - 1;
                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        gap: "14px",
                        marginBottom: isLast ? 0 : "4px",
                      }}
                    >
                      {/* Timeline line */}
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          flexShrink: 0,
                        }}
                      >
                        <div
                          style={{
                            width: "32px",
                            height: "32px",
                            borderRadius: "50%",
                            backgroundColor: cfg.bg,
                            border: `2px solid ${cfg.color}`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "14px",
                          }}
                        >
                          {cfg.icon}
                        </div>
                        {!isLast && (
                          <div
                            style={{
                              width: "2px",
                              flex: 1,
                              backgroundColor: isDarkMode
                                ? "var(--color-surface-raised)"
                                : "var(--color-border)",
                              margin: "4px 0",
                            }}
                          />
                        )}
                      </div>

                      {/* Content */}
                      <div
                        style={{ flex: 1, paddingBottom: isLast ? 0 : "16px" }}
                      >
                        {/* Action + time */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            marginBottom: "6px",
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "13px",
                              fontWeight: "700",
                              color: cfg.color,
                              padding: "3px 10px",
                              backgroundColor: cfg.bg,
                              borderRadius: "20px",
                            }}
                          >
                            {cfg.label}
                          </span>
                          <span
                            style={{
                              fontSize: "12px",
                              color: "var(--color-text-subtle)",
                            }}
                          >
                            {new Date(log.changed_at).toLocaleString("id-ID", {
                              timeZone: "Asia/Jakarta",
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          {log.changed_by && (
                            <span
                              style={{
                                fontSize: "11px",
                                color: "var(--color-text-subtle)",
                                backgroundColor: isDarkMode
                                  ? "var(--color-surface-raised)"
                                  : "var(--color-bg)",
                                padding: "2px 8px",
                                borderRadius: "6px",
                              }}
                            >
                              👤 {log.changed_by}
                            </span>
                          )}
                        </div>

                        {/* Snapshot — before/after style */}
                        {snap && (
                          <div
                            style={{
                              backgroundColor: isDarkMode
                                ? "var(--color-surface-raised)"
                                : "var(--color-bg-subtle)",
                              borderRadius: "10px",
                              padding: "10px 14px",
                              fontSize: "12px",
                              border: `1px solid ${isDarkMode ? "var(--color-border-strong)" : "var(--color-border)"}`,
                            }}
                          >
                            {buildAuditDiff(log.snapshot, log.action).length >
                            0 ? (
                              buildAuditDiff(log.snapshot, log.action).map(
                                (row, idx) => (
                                  <div
                                    key={`${row.field}-${idx}`}
                                    style={{ marginBottom: "6px" }}
                                  >
                                    <span
                                      style={{
                                        color: "var(--color-text-subtle)",
                                        fontSize: "10px",
                                        fontWeight: "700",
                                        textTransform: "uppercase",
                                        letterSpacing: "0.04em",
                                      }}
                                    >
                                      {row.field.replace(/_/g, " ")}
                                    </span>
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "6px",
                                        flexWrap: "wrap",
                                        marginTop: "3px",
                                      }}
                                    >
                                      <span
                                        style={{
                                          color: "var(--color-danger)",
                                          textDecoration: "line-through",
                                          fontSize: "12px",
                                        }}
                                      >
                                        {row.before}
                                      </span>
                                      <span
                                        style={{
                                          fontSize: "11px",
                                          color: "var(--color-text-subtle)",
                                        }}
                                      >
                                        →
                                      </span>
                                      <span
                                        style={{
                                          color: "var(--color-success)",
                                          fontWeight: "700",
                                          fontSize: "12px",
                                        }}
                                      >
                                        {row.after}
                                      </span>
                                    </div>
                                  </div>
                                ),
                              )
                            ) : (
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "1fr 1fr",
                                  gap: "8px",
                                }}
                              >
                                {[
                                  {
                                    label: "Distributor",
                                    val: snap.distributor_name,
                                  },
                                  { label: "Status", val: snap.status },
                                  {
                                    label: "HNA Final",
                                    val: snap.hna_final
                                      ? formatRp(snap.hna_final)
                                      : null,
                                  },
                                  {
                                    label: "HNA+PPN",
                                    val: snap.hna_plus_ppn
                                      ? formatRp(snap.hna_plus_ppn)
                                      : null,
                                  },
                                  {
                                    label: "No Faktur",
                                    val: snap.invoice_number,
                                  },
                                  {
                                    label: "Tgl Faktur",
                                    val: snap.purchase_date
                                      ? formatLocalDate(snap.purchase_date, {
                                          day: "2-digit",
                                          month: "short",
                                          year: "numeric",
                                        })
                                      : null,
                                  },
                                ]
                                  .filter((r) => r.val)
                                  .map((row) => (
                                    <div key={row.label}>
                                      <span
                                        style={{
                                          color: "var(--color-text-subtle)",
                                          fontSize: "10px",
                                          fontWeight: "700",
                                          textTransform: "uppercase",
                                          letterSpacing: "0.04em",
                                        }}
                                      >
                                        {row.label}
                                      </span>
                                      <div
                                        style={{
                                          color: isDarkMode
                                            ? "#FFF"
                                            : "var(--color-surface-elevated)",
                                          fontWeight: "600",
                                          marginTop: "2px",
                                        }}
                                      >
                                        {row.val}
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            )}
                            {log.note && (
                              <div
                                style={{
                                  marginTop: "8px",
                                  paddingTop: "8px",
                                  borderTop: `1px solid ${isDarkMode ? "var(--color-border-strong)" : "var(--color-border)"}`,
                                  color: "var(--color-text-subtle)",
                                  fontSize: "11px",
                                }}
                              >
                                📝 {log.note}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Invoice Modal */}
      {showModal && renderPortal(
        <InvoiceModal
          isDarkMode={isDarkMode}
          form={form}
          items={items}
          totals={totals}
          editingId={editingId}
          distributors={distributors}
          products={products}
          purchaseOrders={purchaseOrders}
          onSelectSP={handleSelectSP}
          onAddDistributor={handleAddDistributor}
          onRemoveDistributor={handleRemoveDistributor}
          onRenameDistributor={handleRenameDistributor}
          onFormChange={handleFormChange}
          updateItem={updateItem}
          addItem={addItem}
          removeItem={removeItem}
          onSubmit={handleSubmit}
          onClose={() => {
            setShowModal(false);
            resetForm();
          }}
          isSaving={isSaving}
          S={S}
          formatRpInput={formatRpInput}
          parseNum={parseNum}
          formatRp={formatRp}
        />
      )}
    </div>
  );
}

// ─── Invoice Row ──────────────────────────────────────────────────────────────
function InvoiceRow({
  inv,
  isDarkMode,
  selected,
  onToggleSelect,
  expanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onAudit,
  allKnownDist = [],
  formatRp,
}) {
  const [hovered, setHovered] = useState(false);
  const isPaid = inv.status === "Paid";
  const sc = isPaid
    ? { bg: "var(--color-success-soft)", text: "var(--color-success)" }
    : {
        bg: isDarkMode ? "#3A2800" : "var(--color-warning-soft)",
        text: isDarkMode ? "#FFCC00" : "var(--color-warning)",
      };
  const statusLabel = isPaid ? "SUDAH DIBAYAR" : "BELUM BAYAR";
  const dueStatus = getDueStatus(inv.due_date, inv.status);
  const clr = getDistColor(inv.distributor_name, allKnownDist);
  return (
    <>
      {/* Main row */}
      <div
        className="ui-row ui-hover-delight"
        onClick={onToggleExpand}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "grid",
          gridTemplateColumns:
            "36px 110px 140px minmax(160px, 1fr) 130px 130px 150px 120px 100px",
          minWidth: "1080px",
          padding: "14px 16px",
          borderBottom: `1px solid ${isDarkMode ? "var(--color-surface-raised)" : "#F0F0F0"}`,
          alignItems: "center",
          backgroundColor: selected
            ? isDarkMode
              ? "#0A2540"
              : "#E8F2FF"
            : hovered
              ? isDarkMode
                ? "var(--color-surface-raised)"
                : "var(--color-bg)"
              : isDarkMode
                ? "var(--color-surface-elevated)"
                : "#FFF",
          transition: uiTransition("background", UI_MOTION.duration.fast),
          cursor: "pointer",
        }}
      >
        {/* Checkbox */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ display: "flex", alignItems: "center" }}
        >
          <input
            type="checkbox"
            checked={!!selected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
            style={{ cursor: "pointer", width: "15px", height: "15px" }}
          />
        </div>
        {/* Tgl Faktur */}
        <div
          style={{
            fontSize: "13px",
            color: isDarkMode
              ? "var(--color-text-muted)"
              : "var(--color-text-muted)",
            fontWeight: "500",
          }}
        >
          {formatLocalDate(inv.purchase_date, {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </div>
        {/* No Faktur */}
        <div>
          <div
            style={{
              fontWeight: "700",
              fontSize: "13px",
              color: "var(--color-primary)",
            }}
          >
            {inv.invoice_number}
            {inv.tax_type === "nota" && (
              <span
                title="Pembelian Nota — tanpa PPN masukan, HPP = harga beli"
                style={{
                  marginLeft: "6px",
                  padding: "1px 6px",
                  borderRadius: "6px",
                  fontSize: "9px",
                  fontWeight: "700",
                  letterSpacing: "0.04em",
                  color: "var(--color-warning)",
                  border: "1px solid color-mix(in srgb, var(--color-warning) 50%, transparent)",
                  background: "color-mix(in srgb, var(--color-warning) 12%, transparent)",
                  verticalAlign: "middle",
                }}
              >
                NOTA
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: "11px",
              color: "var(--color-text-subtle)",
              marginTop: "2px",
            }}
          >
            {inv.item_count > 0
              ? `${inv.item_count} produk · ${inv.total_qty || 0} qty`
              : "0 produk"}
          </div>
          <div
            style={{
              fontSize: "10px",
              color: "var(--color-primary-hover)",
              marginTop: "2px",
              fontWeight: "500",
            }}
          >
            📥 Input:{" "}
            {new Date(inv.created_at).toLocaleString("id-ID", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        </div>
        {/* Distributor — dot + nama plain (rapi, 1 baris) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            minWidth: 0,
          }}
        >
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: clr.dot,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontWeight: "600",
              fontSize: "13px",
              color: "var(--color-text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={inv.distributor_name}
          >
            {inv.distributor_name}
          </span>
        </div>
        {/* HNA*QTY */}
        <div>
          <div
            style={{
              fontSize: "13px",
              fontWeight: "600",
              color: isDarkMode ? "#FFF" : "#000",
            }}
          >
            {formatRp(inv.total_hna)}
          </div>
          {inv.discount_amount > 0 && (
            <div style={{ fontSize: "11px", color: "var(--color-danger)" }}>
              Disc: {formatRp(inv.discount_amount)}
            </div>
          )}
        </div>
        {/* HNA Final */}
        <div
          style={{
            fontSize: "13px",
            fontWeight: "600",
            color: "var(--color-success)",
          }}
        >
          {formatRp(inv.hna_final || inv.final_hna)}
        </div>
        {/* HNA+PPN */}
        <div>
          <div
            style={{
              fontSize: "13px",
              fontWeight: "700",
              color: "var(--color-primary)",
            }}
          >
            {formatRp(inv.hna_plus_ppn)}
          </div>
          <div style={{ fontSize: "11px", color: "var(--color-text-subtle)" }}>
            PPN: {formatRp(inv.ppn_masukan || inv.ppn_input, true)}
          </div>
        </div>
        {/* Status + jatuh tempo */}
        <div>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: "20px",
              fontSize: "10px",
              fontWeight: "800",
              backgroundColor: sc.bg,
              color: sc.text,
              letterSpacing: "0.03em",
              whiteSpace: "nowrap",
            }}
          >
            {statusLabel}
          </span>
          {!isPaid && inv.due_date && dueStatus && (
            <div
              style={{
                marginTop: "5px",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "2px 8px",
                borderRadius: "8px",
                backgroundColor: dueStatus.bg,
                animation: dueStatus.animation || "none",
              }}
            >
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: "700",
                  color: dueStatus.color,
                }}
              >
                {dueStatus.label}
              </span>
            </div>
          )}
          {!isPaid && inv.due_date && !dueStatus && (
            <div
              style={{
                marginTop: "4px",
                fontSize: "11px",
                color: "var(--color-text-subtle)",
              }}
            >
              JT: {formatLocalDate(inv.due_date)}
            </div>
          )}
          {isPaid && inv.payment_date && (
            <div
              style={{
                marginTop: "4px",
                fontSize: "11px",
                color: "var(--color-success)",
                fontWeight: "600",
              }}
            >
              ✅ {formatLocalDate(inv.payment_date)}
            </div>
          )}
          {expanded && (
            <div
              style={{
                marginTop: "4px",
                fontSize: "10px",
                color: "var(--color-text-subtle)",
              }}
            >
              ▲ sembunyikan
            </div>
          )}
        </div>
        {/* Aksi */}
        <div
          className="ui-row-action"
          style={{ display: "flex", gap: "5px", alignItems: "center" }}
          onClick={(e) => e.stopPropagation()}
        >
          <IconTooltipButton
            label="Riwayat"
            buttonStyle={{
              padding: "6px",
              backgroundColor: isDarkMode
                ? "var(--color-surface-raised)"
                : "var(--color-bg)",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
            }}
            tooltipBg={isDarkMode ? "var(--color-surface-elevated)" : "#FFF"}
            tooltipColor={isDarkMode ? "#FFF" : "#000"}
            tooltipBorder={
              isDarkMode ? "var(--color-surface-raised)" : "var(--color-border)"
            }
            onClick={onAudit}
          >
            <History size={13} color="var(--color-text-subtle)" />
          </IconTooltipButton>
          <button
            onClick={onEdit}
            style={{
              padding: "6px 10px",
              backgroundColor: "var(--color-primary)",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: "600",
            }}
          >
            Ubah
          </button>
          <IconTooltipButton
            label="Hapus faktur"
            buttonStyle={{
              padding: "6px",
              backgroundColor: "var(--color-danger)",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
            }}
            tooltipBg={isDarkMode ? "var(--color-surface-elevated)" : "#FFF"}
            tooltipColor={isDarkMode ? "#FFF" : "#000"}
            tooltipBorder={
              isDarkMode ? "var(--color-surface-raised)" : "var(--color-border)"
            }
            onClick={onDelete}
          >
            <Icons.Trash2 size={13} />
          </IconTooltipButton>
        </div>
      </div>
      {expanded && (
        <ExpandedItems
          invoiceId={inv.id}
          isDarkMode={isDarkMode}
          formatRp={formatRp}
          distColor={clr}
        />
      )}
    </>
  );
}

function ExpandedItems({ invoiceId, isDarkMode, formatRp, distColor }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    invoicesAPI
      .getById(invoiceId)
      .then((r) => setItems(r.data.items))
      .catch(() => setItems([]));
  }, [invoiceId]);
  if (!items)
    return (
      <div
        style={{
          padding: "12px 24px",
          fontSize: "13px",
          color: "var(--color-text-subtle)",
        }}
      >
        Memuat...
      </div>
    );
  if (!items.length) return null;
  const cols = "2fr 100px 60px 90px 100px 70px 100px 100px 90px 100px 100px";
  return (
    <div
      style={{
        backgroundColor: isDarkMode ? "#111" : "#FAFAFA",
        borderBottom: `1px solid ${isDarkMode ? "var(--color-surface-raised)" : "var(--color-border)"}`,
        padding: "8px 24px",
        borderLeft: `3px solid ${distColor?.dot || "var(--color-primary)"}`,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: cols,
          gap: "8px",
          padding: "6px 0",
          borderBottom: `1px solid ${isDarkMode ? "var(--color-surface-raised)" : "var(--color-border)"}`,
          marginBottom: "4px",
        }}
      >
        {[
          "Nama Produk",
          "Batch No.",
          "QTY",
          "HNA",
          "HNA*QTY",
          "Disc%",
          "Disc Nom.",
          "HNA Baru",
          "Disc COD",
          "HNA Final",
          "HPP/pcs",
        ].map((h) => (
          <div
            key={h}
            style={{
              fontSize: "10px",
              fontWeight: "700",
              color: "var(--color-text-subtle)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {h}
          </div>
        ))}
      </div>
      {items.map((item, i) => (
        <div
          key={i}
          style={{
            display: "grid",
            gridTemplateColumns: cols,
            gap: "8px",
            padding: "6px 0",
            borderBottom: `1px solid ${isDarkMode ? "var(--color-surface-elevated)" : "#F0F0F0"}`,
          }}
        >
          <div>
            <div
              style={{
                fontSize: "13px",
                fontWeight: "500",
                color: isDarkMode ? "#FFF" : "#000",
              }}
            >
              {item.product_name}
            </div>
            {item.expired_date && (
              <div style={{ fontSize: "11px", color: "var(--color-warning)" }}>
                Exp: {formatLocalDate(item.expired_date)}
              </div>
            )}
          </div>
          <div
            style={{
              fontSize: "12px",
              color: isDarkMode ? "var(--color-text-subtle)" : "#555",
              fontFamily: "monospace",
            }}
          >
            {item.batch_number || (
              <span style={{ color: "var(--color-border-strong)" }}>—</span>
            )}
          </div>
          <div
            style={{ fontSize: "13px", color: isDarkMode ? "#FFF" : "#000" }}
          >
            {item.quantity}
          </div>
          <div
            style={{ fontSize: "13px", color: isDarkMode ? "#FFF" : "#000" }}
          >
            {formatRp(item.hna || item.unit_price)}
          </div>
          <div
            style={{ fontSize: "13px", color: isDarkMode ? "#FFF" : "#000" }}
          >
            {formatRp(item.hna_times_qty || item.total_price)}
          </div>
          <div style={{ fontSize: "13px", color: "var(--color-danger)" }}>
            {item.disc_percent || 0}%
          </div>
          <div style={{ fontSize: "13px", color: "var(--color-danger)" }}>
            {formatRp(item.disc_nominal)}
          </div>
          <div
            style={{
              fontSize: "13px",
              fontWeight: "600",
              color: "var(--color-success)",
            }}
          >
            {formatRp(item.hna_baru)}
          </div>
          <div style={{ fontSize: "13px", color: "var(--color-warning)" }}>
            {item.disc_cod_per_item > 0 ? (
              formatRp(item.disc_cod_per_item)
            ) : (
              <span style={{ color: "var(--color-border-strong)" }}>—</span>
            )}
          </div>
          <div
            style={{
              fontSize: "13px",
              fontWeight: "600",
              color: "var(--color-success)",
            }}
          >
            {item.hna_after_cod > 0
              ? formatRp(item.hna_after_cod)
              : item.hna_baru > 0
                ? formatRp(item.hna_baru)
                : formatRp(item.total_price)}
          </div>
          <div
            style={{
              fontSize: "13px",
              fontWeight: "700",
              color: "var(--color-primary-hover)",
            }}
          >
            {formatRp(
              item.hpp_inc_ppn > 0
                ? item.hpp_inc_ppn
                : (item.hna_per_item > 0
                    ? item.hna_per_item
                    : parseNum(item.hna || item.unit_price)) *
                    (1 + ppnRateFor(item.tax_type)),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL
// ═══════════════════════════════════════════════════════════════════════════════
function InvoiceModal({
  isDarkMode,
  form,
  items,
  totals,
  editingId,
  distributors,
  products,
  onAddDistributor,
  onRemoveDistributor,
  onRenameDistributor,
  onFormChange,
  updateItem,
  addItem,
  removeItem,
  onSubmit,
  onClose,
  isSaving,
  S,
  formatRpInput,
  parseNum,
  formatRp,
  purchaseOrders,
  onSelectSP,
}) {
  const sec = {
    marginBottom: "1.75rem",
    paddingBottom: "1.75rem",
    borderBottom: `1px solid ${isDarkMode ? "var(--color-surface-raised)" : "var(--color-border)"}`,
  };
  const secTitle = {
    fontSize: "11px",
    fontWeight: "700",
    marginBottom: "14px",
    color: isDarkMode
      ? "var(--color-text-muted)"
      : "var(--color-surface-elevated)",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  };
  const r2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" };
  // v1.8.0: collapsible "Detail kalkulasi" per row — default hidden (clean UX, on-demand transparency)
  const [showDetailRows, setShowDetailRows] = useState(new Set());
  const toggleDetail = (id) =>
    setShowDetailRows((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  // v1.19.0: compute matching SPs for nudge — sort matching to top + inline hint
  const invItemNames = items
    ? items.filter((i) => i.product_name?.trim()).map((i) => i.product_name.trim().toLowerCase())
    : [];
  const matchingSPs =
    form.distributor_name && invItemNames.length > 0
      ? (purchaseOrders || []).filter((po) => {
          if (!po.distributor_name || !po.items) return false;
          if (po.distributor_name.trim().toLowerCase() !== form.distributor_name.trim().toLowerCase()) return false;
          const poNames = po.items
            .filter((pi) => pi.product_name?.trim())
            .map((pi) => pi.product_name.trim().toLowerCase());
          return poNames.some((pn) => invItemNames.includes(pn));
        })
      : [];
  const matchingIds = new Set(matchingSPs.map((po) => po.id));
  const sortedPOs = [...(purchaseOrders || [])].sort((a, b) => {
    const aMatch = matchingIds.has(a.id) ? 1 : 0;
    const bMatch = matchingIds.has(b.id) ? 1 : 0;
    return bMatch - aMatch;
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        zIndex: 1000,
        padding: "2rem 1rem",
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: isDarkMode
            ? "var(--color-surface-elevated)"
            : "#FFF",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "780px",
          boxShadow: "0 32px 64px rgba(0,0,0,0.35)",
          overflow: "hidden",
          marginBottom: "2rem",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "20px 24px",
            borderBottom: `1px solid ${isDarkMode ? "var(--color-surface-raised)" : "var(--color-border)"}`,
            backgroundColor: isDarkMode ? "#000" : "var(--color-bg)",
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: "18px",
                fontWeight: "700",
                color: isDarkMode ? "#FFF" : "#000",
              }}
            >
              {editingId ? "✏️ Edit Faktur" : "➕ Buat Faktur Baru"}
            </h2>
            <p
              style={{
                margin: "2px 0 0",
                fontSize: "13px",
                color: "var(--color-text-subtle)",
              }}
            >
              Draft tersimpan otomatis tiap ada perubahan
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup modal riwayat"
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
            <X size={20} color="var(--color-text-subtle)" />
          </button>
        </div>

        <div style={{ padding: "24px" }}>
          {/* Info Faktur */}
          <div style={sec}>
            <p style={secTitle}>📦 Informasi Faktur</p>
            <div style={{ marginBottom: "14px" }}>
              <label style={S.label}>Jenis Pembelian</label>
              <div style={{ display: "flex", gap: "8px" }}>
                {[
                  { value: "faktur", label: "Faktur (ada PPN masukan)" },
                  { value: "nota", label: "Nota (tanpa PPN)" },
                ].map((opt) => {
                  const active =
                    (form.tax_type === "nota" ? "nota" : "faktur") ===
                    opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      className="ui-motion-button ui-focus-ring"
                      onClick={() => onFormChange("tax_type", opt.value)}
                      style={{
                        flex: 1,
                        padding: "9px 12px",
                        borderRadius: "10px",
                        fontSize: "12px",
                        fontWeight: 700,
                        cursor: "pointer",
                        border: `1.5px solid ${active ? "var(--color-primary)" : "var(--color-border)"}`,
                        background: active
                          ? "var(--color-primary-soft)"
                          : "transparent",
                        color: active
                          ? "var(--color-primary)"
                          : "var(--color-text-muted)",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <p
                style={{
                  margin: "5px 0 0",
                  fontSize: "10px",
                  color: "var(--color-text-subtle)",
                  lineHeight: 1.35,
                }}
              >
                {form.tax_type === "nota"
                  ? "Nota: tidak ada PPN masukan. HPP = harga beli apa adanya (tanpa × 1,11)."
                  : "Faktur: ada PPN masukan 11%. HPP = HNA exc PPN × 1,11."}
              </p>
            </div>
            <div style={{ marginBottom: "14px" }}>
              <label style={S.label}>Dari Surat Pesanan (opsional)</label>
              <select
                style={S.input}
                value={form.purchase_order_id || ""}
                onChange={(e) =>
                  onSelectSP(e.target.value ? parseInt(e.target.value) : null)
                }
              >
                <option value="">— Tanpa SP / beli langsung —</option>
                {sortedPOs.map((po) => (
                  <option key={po.id} value={po.id}>
                    {po.po_number} · {po.distributor_name}
                    {po.stock_received ? " (stok sudah diterima)" : ""}
                  </option>
                ))}
              </select>
              {form.purchase_order_id ? (
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: "11px",
                    color: "var(--color-success)",
                    fontWeight: 600,
                  }}
                >
                  ✓ Terhubung ke SP — stok tidak akan dobel.
                </p>
              ) : null}
              {form.purchase_order_id ? (
                <p
                  style={{
                    margin: "2px 0 0",
                    fontSize: "10px",
                    color: "var(--color-text-subtle)",
                    lineHeight: 1.35,
                  }}
                >
                  Jika faktur terhubung ke SP, stok hanya menambah sisa qty SP yang belum diterima.
                </p>
              ) : null}
              {!form.purchase_order_id && matchingSPs.length > 0 ? (
                <div
                  style={{
                    marginTop: "8px",
                    padding: "8px 10px",
                    borderRadius: "8px",
                    background: "var(--color-primary-soft)",
                    border: "1px solid color-mix(in srgb, var(--color-primary) 30%, transparent)",
                    fontSize: "11px",
                    color: "var(--color-primary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "8px",
                  }}
                >
                  <span>
                    Ada SP cocok dari {matchingSPs[0].distributor_name}: {matchingSPs[0].po_number}. Sambungkan biar stok tidak dobel.
                  </span>
                  <button
                    onClick={() => onSelectSP(matchingSPs[0].id)}
                    style={{
                      background: "var(--color-primary)",
                      color: "#fff",
                      border: "none",
                      borderRadius: "6px",
                      padding: "4px 10px",
                      fontSize: "10px",
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    Sambungkan
                  </button>
                </div>
              ) : null}
            </div>
            <div style={r2}>
              <div>
                <label style={S.label}>No Faktur</label>
                <input
                  style={S.input}
                  value={form.invoice_number}
                  onChange={(e) =>
                    onFormChange("invoice_number", e.target.value)
                  }
                  placeholder="Contoh: 1260300020"
                />
              </div>
              <div>
                <label style={S.label}>Tanggal Belanja / Faktur</label>
                <input
                  type="date"
                  style={S.input}
                  value={form.purchase_date}
                  onChange={(e) =>
                    onFormChange("purchase_date", e.target.value)
                  }
                />
              </div>
            </div>
            <div style={{ ...r2, marginTop: "14px" }}>
              <div>
                <label style={S.label}>Distributor</label>
                <MasterSelect
                  value={form.distributor_name}
                  onChange={(v) => onFormChange("distributor_name", v)}
                  options={distributors}
                  onAdd={onAddDistributor}
                  onRemove={onRemoveDistributor}
                  onRename={onRenameDistributor}
                  placeholder="Pilih atau tambah distributor..."
                  isDarkMode={isDarkMode}
                />
              </div>
              <div>
                <label style={S.label}>Tanggal Jatuh Tempo</label>
                <input
                  type="date"
                  style={S.input}
                  value={form.due_date}
                  onChange={(e) => onFormChange("due_date", e.target.value)}
                />
                <div
                  style={{
                    display: "flex",
                    gap: "6px",
                    marginTop: "6px",
                    flexWrap: "wrap",
                  }}
                >
                  {[1, 7, 21, 30].map((n) => {
                    const target = addDays(form.purchase_date, n);
                    const active = form.due_date === target;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => onFormChange("due_date", target)}
                        style={{
                          padding: "4px 10px",
                          fontSize: "11px",
                          fontWeight: "600",
                          borderRadius: "6px",
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
                        +{n}h
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Produk */}
          <div style={sec}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "14px",
              }}
            >
              <p style={{ ...secTitle, margin: 0 }}>📦 Daftar Produk</p>
              <button
                type="button"
                onClick={addItem}
                className="ui-motion-button ui-focus-ring"
                style={{
                  padding: "7px 14px",
                  backgroundColor: "var(--color-primary)",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: "700",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                }}
              >
                <Plus size={13} /> Tambah Produk
              </button>
            </div>
            {editingId ? (
              <p
                style={{
                  margin: "0 0 14px",
                  fontSize: "11px",
                  color: "var(--color-text-subtle)",
                  lineHeight: 1.4,
                  padding: "8px 12px",
                  background: isDarkMode ? "rgba(255,204,0,0.08)" : "rgba(255,149,0,0.06)",
                  borderRadius: "8px",
                  border: `1px solid ${isDarkMode ? "rgba(255,204,0,0.15)" : "rgba(255,149,0,0.15)"}`,
                }}
              >
                Qty/item faktur yang sudah masuk stok tidak bisa diedit. Koreksi stok lewat Opname/Adjust agar riwayat stok tetap rapi.
              </p>
            ) : null}
            {items.map((item, idx) => (
              <div
                key={item._id}
                style={{
                  backgroundColor: isDarkMode
                    ? "var(--color-surface-raised)"
                    : "var(--color-bg-subtle)",
                  borderRadius: "12px",
                  padding: "14px",
                  marginBottom: "10px",
                  border: `1px solid ${isDarkMode ? "var(--color-border-strong)" : "var(--color-border)"}`,
                  position: "relative",
                }}
              >
                {items.length > 1 && (
                  <IconTooltipButton
                    label="Hapus baris produk"
                    buttonStyle={{
                      position: "absolute",
                      top: "10px",
                      right: "10px",
                      padding: "5px",
                      backgroundColor: "var(--color-danger)",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                    }}
                    tooltipBg={
                      isDarkMode ? "var(--color-surface-elevated)" : "#FFF"
                    }
                    tooltipColor={isDarkMode ? "#FFF" : "#000"}
                    tooltipBorder={
                      isDarkMode
                        ? "var(--color-surface-raised)"
                        : "var(--color-border)"
                    }
                    onClick={() => removeItem(idx)}
                  >
                    <X size={12} />
                  </IconTooltipButton>
                )}
                <div style={{ ...r2, marginBottom: "10px" }}>
                  <div>
                    <label style={S.label}>Nama Produk</label>
                    <MasterSelect
                      value={item.product_name}
                      onChange={(v) => updateItem(idx, "product_name", v)}
                      onSelect={(option) =>
                        updateItem(idx, "product_option", option)
                      }
                      options={products}
                      allowCustomValue
                      placeholder="Pilih atau tambah produk..."
                      isDarkMode={isDarkMode}
                    />
                  </div>
                  <div>
                    <label style={S.label}>No. Batch / Lot</label>
                    <input
                      style={S.input}
                      value={item.batch_number}
                      onChange={(e) =>
                        updateItem(idx, "batch_number", e.target.value)
                      }
                      placeholder="Contoh: B2025001"
                    />
                  </div>
                </div>
                <div style={{ ...r2, marginBottom: "10px" }}>
                  <div>
                    <label style={S.label}>Expired Date</label>
                    <input
                      type="date"
                      style={S.input}
                      value={item.expired_date}
                      onChange={(e) =>
                        updateItem(idx, "expired_date", e.target.value)
                      }
                    />
                  </div>
                  <div />
                </div>
                {(() => {
                  const prod = products.find(
                    (p) =>
                      p.name?.toLowerCase() ===
                      item.product_name?.toLowerCase(),
                  );
                  const showConv =
                    prod &&
                    isPackUnit(item.unit, prod) &&
                    parseNum(item.quantity) > 0;
                  return showConv ? (
                    <div
                      style={{
                        marginBottom: "6px",
                        fontSize: "11px",
                        color: "var(--color-primary)",
                        fontWeight: "600",
                        padding: "4px 10px",
                        background: isDarkMode ? "#0A2540" : "#E8F2FF",
                        borderRadius: "6px",
                        display: "inline-block",
                      }}
                    >
                      📐{" "}
                      {formatQtyWithConversion(
                        parseNum(item.quantity),
                        item.unit,
                        prod,
                      )}
                    </div>
                  ) : null;
                })()}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "0.7fr 0.8fr 1.35fr 1fr",
                    gap: "10px",
                    marginBottom: "10px",
                  }}
                >
                  <div>
                    <label style={S.label}>QTY</label>
                    <input
                      style={S.input}
                      type="number"
                      min="0"
                      value={item.quantity}
                      onChange={(e) =>
                        updateItem(idx, "quantity", e.target.value)
                      }
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label style={S.label}>Satuan</label>
                    <select
                      style={S.input}
                      value={item.unit || "pcs"}
                      onChange={(e) => updateItem(idx, "unit", e.target.value)}
                    >
                      <optgroup label="Eceran">
                        {BASE_UNITS.map((u, i) => (
                          <option key={`b-${u.value}-${i}`} value={u.value}>
                            {u.label}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Kemasan">
                        {PACK_UNITS.map((u) => (
                          <option key={`p-${u.value}`} value={u.value}>
                            {u.label}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                  <div>
                    <label
                      style={S.label}
                      title={
                        form.tax_type === "nota"
                          ? "Nota tanpa PPN: harga beli langsung jadi HPP."
                          : "Pilih sesuai angka yang tertulis di faktur. Sistem tetap menyimpan raw HNA exc PPN."
                      }
                    >
                      {form.tax_type === "nota"
                        ? "Harga beli dari nota"
                        : "Harga unit dari faktur"}
                    </label>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          form.tax_type === "nota" ? "1fr" : "1fr 1.05fr",
                        gap: "8px",
                      }}
                    >
                      {form.tax_type !== "nota" && (
                        <select
                          style={S.input}
                          value={item.price_basis || "hna_exc"}
                          onChange={(e) =>
                            updateItem(idx, "price_basis", e.target.value)
                          }
                        >
                          <option value="hna_exc">HNA exc PPN</option>
                          <option value="hpp_inc">HPP inc PPN</option>
                        </select>
                      )}
                      <RupiahInput
                        style={S.input}
                        value={displayUnitPrice(item, form.tax_type)}
                        decimals={2}
                        onChange={(v) => updateItem(idx, "unit_price_input", v)}
                        placeholder="Rp 0,00"
                      />
                    </div>
                    <p
                      style={{
                        margin: "5px 0 0",
                        fontSize: "10px",
                        color: "var(--color-text-subtle)",
                        lineHeight: 1.35,
                      }}
                    >
                      {form.tax_type === "nota"
                        ? `HPP per pcs = harga beli: ${formatRp(parseNum(item.hna), true)}`
                        : item.price_basis === "hpp_inc"
                          ? `Disimpan sebagai HNA exc PPN: ${formatRp(parseNum(item.hna), true)}`
                          : `Estimasi HPP inc PPN: ${formatRp(parseNum(item.hna) * (1 + PPN_RATE), true)}`}
                    </p>
                  </div>
                  <div
                    style={{
                      background: isDarkMode
                        ? "var(--color-surface-elevated)"
                        : "#FFFFFF",
                      border: `1px solid ${isDarkMode ? "var(--color-border-strong)" : "var(--color-border)"}`,
                      borderRadius: "12px",
                      padding: "8px 10px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "4px",
                      }}
                    >
                      <label style={{ ...S.label, marginBottom: 0 }}>
                        Disc
                      </label>
                      <div
                        style={{
                          display: "inline-flex",
                          background: isDarkMode
                            ? "var(--color-surface-raised)"
                            : "#F2F2F7",
                          borderRadius: "6px",
                          padding: "2px",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            updateItem(idx, "disc_mode", "percent")
                          }
                          style={{
                            padding: "2px 8px",
                            fontSize: "10px",
                            fontWeight: "700",
                            border: "none",
                            borderRadius: "4px",
                            cursor: "pointer",
                            background:
                              (item.disc_mode || "percent") === "percent"
                                ? "var(--color-primary)"
                                : "transparent",
                            color:
                              (item.disc_mode || "percent") === "percent"
                                ? "#FFF"
                                : isDarkMode
                                  ? "var(--color-text-subtle)"
                                  : "var(--color-text-muted)",
                          }}
                        >
                          %
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateItem(idx, "disc_mode", "nominal")
                          }
                          style={{
                            padding: "2px 8px",
                            fontSize: "10px",
                            fontWeight: "700",
                            border: "none",
                            borderRadius: "4px",
                            cursor: "pointer",
                            background:
                              item.disc_mode === "nominal"
                                ? "var(--color-primary)"
                                : "transparent",
                            color:
                              item.disc_mode === "nominal"
                                ? "#FFF"
                                : isDarkMode
                                  ? "var(--color-text-subtle)"
                                  : "var(--color-text-muted)",
                          }}
                        >
                          Rp
                        </button>
                      </div>
                    </div>
                    {item.disc_mode === "nominal" ? (
                      <RupiahInput
                        style={{ ...S.input, padding: "8px 10px" }}
                        value={item.disc_input || ""}
                        decimals={2}
                        onChange={(v) => updateItem(idx, "disc_input", v)}
                        placeholder="Rp 0"
                      />
                    ) : (
                      <input
                        style={{ ...S.input, padding: "8px 10px" }}
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={item.disc_input || ""}
                        onChange={(e) =>
                          updateItem(idx, "disc_input", e.target.value)
                        }
                        placeholder="0"
                      />
                    )}
                    {(item.disc_nominal > 0 ||
                      parseNum(item.disc_input) > 0) && (
                      <p
                        style={{
                          margin: "4px 0 0",
                          fontSize: "10px",
                          color: "var(--color-text-subtle)",
                          lineHeight: 1.3,
                        }}
                      >
                        {item.disc_mode === "nominal"
                          ? `= ${item.disc_percent.toFixed(2)}%`
                          : `= ${formatRp(item.disc_nominal, true)}`}
                      </p>
                    )}
                  </div>
                </div>
                {/* HPP Final highlight + Detail toggle (v1.8.0 simplified) */}
                {(() => {
                  const withCod = totals.items_with_cod?.find(
                    (x) => x._id === item._id,
                  );
                  const hppFinal =
                    withCod?.hpp_inc_ppn ||
                    item.hpp_inc_ppn ||
                    (item.hna_per_item || 0) *
                      (1 + ppnRateFor(form.tax_type)) ||
                    0;
                  const expanded = showDetailRows.has(item._id);
                  return (
                    <>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "10px 14px",
                          backgroundColor: isDarkMode ? "#1A2A1A" : "#F0F9F0",
                          borderRadius: "10px",
                          border: `1px solid ${isDarkMode ? "#30D15840" : "var(--color-success-soft-strong)"}`,
                          marginBottom: expanded ? "10px" : 0,
                        }}
                      >
                        <div>
                          <span
                            style={{
                              fontSize: "11px",
                              color: "var(--color-text-subtle)",
                              fontWeight: "600",
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                            }}
                          >
                            {form.tax_type === "nota"
                              ? "HPP final per pcs (nota, tanpa PPN)"
                              : "HPP final per pcs (inc PPN 11%)"}
                          </span>
                          <div
                            style={{
                              fontSize: "17px",
                              fontWeight: "700",
                              color: isDarkMode ? "#30D158" : "#1C7C2A",
                              fontVariantNumeric: "tabular-nums",
                              marginTop: "2px",
                            }}
                          >
                            {formatRp(hppFinal, true)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleDetail(item._id)}
                          style={{
                            background: "transparent",
                            border: `1px solid ${isDarkMode ? "var(--color-border-strong)" : "var(--color-border)"}`,
                            color: isDarkMode
                              ? "var(--color-text-muted)"
                              : "var(--color-surface-elevated)",
                            padding: "6px 12px",
                            borderRadius: "8px",
                            fontSize: "11px",
                            fontWeight: "600",
                            cursor: "pointer",
                          }}
                        >
                          {expanded ? "▲ Sembunyikan" : "▼ Detail kalkulasi"}
                        </button>
                      </div>
                      {expanded && (
                        <div
                          style={{
                            padding: "12px",
                            background: isDarkMode ? "#1A1A1C" : "#FAFAFC",
                            borderRadius: "10px",
                            border: `1px dashed ${isDarkMode ? "var(--color-border-strong)" : "var(--color-border)"}`,
                          }}
                        >
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr 1fr 1fr",
                              gap: "10px",
                              marginBottom:
                                totals.disc_cod_amount > 0 ? "10px" : 0,
                            }}
                          >
                            <div>
                              <label
                                style={{
                                  ...S.label,
                                  color: "var(--color-text-subtle)",
                                }}
                              >
                                HNA × QTY
                              </label>
                              <input
                                style={S.computed}
                                value={formatRpInput(item.hna_times_qty)}
                                readOnly
                              />
                            </div>
                            <div>
                              <label
                                style={{
                                  ...S.label,
                                  color: "var(--color-danger)",
                                }}
                              >
                                Disc Nominal
                              </label>
                              <input
                                style={{
                                  ...S.inputDis,
                                  color: "var(--color-danger)",
                                  fontWeight: "600",
                                }}
                                value={formatRpInput(item.disc_nominal)}
                                readOnly
                              />
                            </div>
                            <div>
                              <label
                                style={{
                                  ...S.label,
                                  color: isDarkMode ? "#30D158" : "#1C7C2A",
                                }}
                              >
                                HNA Baru
                              </label>
                              <input
                                style={S.computed}
                                value={formatRpInput(item.hna_baru)}
                                readOnly
                              />
                            </div>
                            <div>
                              <label
                                style={{
                                  ...S.label,
                                  color: "var(--color-primary-hover)",
                                }}
                              >
                                HNA / Item
                              </label>
                              <input
                                style={{
                                  ...S.computed,
                                  color: "var(--color-primary-hover)",
                                }}
                                value={formatRpInput(item.hna_per_item)}
                                readOnly
                              />
                            </div>
                          </div>
                          {totals.disc_cod_amount > 0 && (
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: "10px",
                                padding: "10px",
                                backgroundColor: isDarkMode
                                  ? "#2C1A00"
                                  : "var(--color-warning-soft)",
                                borderRadius: "8px",
                                border: `1px solid var(--color-warning-soft-strong)`,
                              }}
                            >
                              <div>
                                <label
                                  style={{
                                    ...S.label,
                                    color: "var(--color-warning)",
                                    fontSize: "10px",
                                  }}
                                >
                                  Disc COD Bagian (proporsional)
                                </label>
                                <input
                                  style={{
                                    ...S.inputDis,
                                    color: "var(--color-warning)",
                                    fontWeight: "600",
                                  }}
                                  value={formatRpInput(
                                    withCod?.disc_cod_per_item || 0,
                                  )}
                                  readOnly
                                />
                              </div>
                              <div>
                                <label
                                  style={{
                                    ...S.label,
                                    color: isDarkMode ? "#30D158" : "#1C7C2A",
                                    fontSize: "10px",
                                  }}
                                >
                                  HNA After COD
                                </label>
                                <input
                                  style={S.computed}
                                  value={formatRpInput(
                                    withCod?.hna_after_cod || 0,
                                  )}
                                  readOnly
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            ))}
          </div>

          {/* Kalkulasi */}
          <div style={sec}>
            <p style={secTitle}>💰 Kalkulasi Finansial</p>
            <div style={r2}>
              <div>
                <label style={S.label}>HNA×QTY Total</label>
                <input
                  style={S.computed}
                  value={formatRpInput(totals.total_hna)}
                  readOnly
                />
              </div>
              <div>
                <label style={S.label}>DISC Total</label>
                <input
                  style={{
                    ...S.inputDis,
                    color: "var(--color-danger)",
                    fontWeight: "600",
                  }}
                  value={formatRpInput(totals.discount_amount)}
                  readOnly
                />
              </div>
            </div>
            <div style={{ ...r2, marginTop: "12px" }}>
              <div>
                <label style={S.label}>HNA Baru (HNA−DISC)</label>
                <input
                  style={S.computed}
                  value={formatRpInput(totals.hna_baru)}
                  readOnly
                />
              </div>
              {/* Disc COD — bisa pakai % ATAU nominal */}
              <div>
                <label style={S.label}>Disc COD</label>
                <div
                  style={{ display: "flex", gap: "8px", marginBottom: "8px" }}
                >
                  <select
                    value={form.disc_cod_ada ? "ada" : "tidak"}
                    onChange={(e) =>
                      onFormChange("disc_cod_ada", e.target.value === "ada")
                    }
                    style={{ ...S.input, width: "120px", flex: "none" }}
                  >
                    <option value="tidak">Tidak Ada</option>
                    <option value="ada">Ada</option>
                  </select>
                </div>
                {form.disc_cod_ada && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "8px",
                    }}
                  >
                    <div>
                      <label style={{ ...S.label, fontSize: "10px" }}>
                        Input % (opsional)
                      </label>
                      <input
                        style={S.input}
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={form.disc_cod_percent}
                        onChange={(e) => {
                          onFormChange("disc_cod_percent", e.target.value);
                          onFormChange("disc_cod_amount", "");
                        }}
                        placeholder="Contoh: 2.5"
                      />
                    </div>
                    <div>
                      <label style={{ ...S.label, fontSize: "10px" }}>
                        Atau Nominal
                      </label>
                      <RupiahInput
                        style={S.input}
                        value={parseNum(form.disc_cod_amount)}
                        decimals={2}
                        onChange={(v) => {
                          onFormChange("disc_cod_amount", v);
                          onFormChange("disc_cod_percent", "");
                        }}
                        placeholder="Rp 0,00"
                      />
                    </div>
                  </div>
                )}
                {form.disc_cod_ada && totals.disc_cod_amount > 0 && (
                  <div
                    style={{
                      marginTop: "6px",
                      fontSize: "12px",
                      color: "var(--color-danger)",
                      fontWeight: "600",
                    }}
                  >
                    Disc COD: {formatRp(totals.disc_cod_amount)}
                  </div>
                )}
              </div>
            </div>
            <div style={{ ...r2, marginTop: "12px" }}>
              <div>
                <label style={S.label}>HNA Final (HNA Baru − Disc COD)</label>
                <input
                  style={S.computed}
                  value={formatRpInput(totals.hna_final)}
                  readOnly
                />
              </div>
              <div>
                <label style={S.label}>
                  {form.tax_type === "nota"
                    ? "PPN Masukan (nota: tidak ada)"
                    : "PPN Masukan (HNA Final × 11%)"}
                </label>
                <input
                  style={{
                    ...S.inputDis,
                    color: "var(--color-warning)",
                    fontWeight: "600",
                  }}
                  value={new Intl.NumberFormat("id-ID", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }).format(totals.ppn_masukan)}
                  readOnly
                />
              </div>
            </div>
            <div style={{ ...r2, marginTop: "12px" }}>
              <div>
                <label
                  style={{ ...S.label, color: "var(--color-text-subtle)" }}
                >
                  PPN Pembulatan (INT)
                </label>
                <input
                  style={S.inputDis}
                  value={formatRpInput(totals.ppn_pembulatan)}
                  readOnly
                />
              </div>
              <div>
                <label style={{ ...S.label, color: "var(--color-primary)" }}>
                  {form.tax_type === "nota"
                    ? "Total Bayar (tanpa PPN)"
                    : "HNA + PPN Masukan"}
                </label>
                <input
                  style={{
                    ...S.computed,
                    color: "var(--color-primary)",
                    fontSize: "15px",
                    fontWeight: "700",
                  }}
                  value={formatRpInput(totals.hna_plus_ppn)}
                  readOnly
                />
              </div>
            </div>
          </div>

          {/* Pembayaran */}
          <div style={{ marginBottom: "1.75rem" }}>
            <p style={secTitle}>📅 Pembayaran</p>
            <div style={r2}>
              <div>
                <label style={S.label}>Tanggal Pembayaran Faktur</label>
                <input
                  type="date"
                  style={form.status === "Paid" ? S.input : S.inputDis}
                  value={form.status === "Paid" ? form.payment_date || "" : ""}
                  max={new Date().toISOString().split("T")[0]}
                  disabled={form.status !== "Paid"}
                  onChange={(e) => onFormChange("payment_date", e.target.value)}
                />
                {form.status !== "Paid" && (
                  <p
                    style={{
                      margin: "4px 0 0",
                      fontSize: "11px",
                      color: "var(--color-text-subtle)",
                    }}
                  >
                    Ubah status ke "Sudah Dibayar" untuk isi tanggal
                  </p>
                )}
              </div>
              <div>
                <label style={S.label}>Status</label>
                <select
                  value={form.status}
                  onChange={(e) => {
                    const newStatus = e.target.value;
                    onFormChange("status", newStatus);
                    if (newStatus !== "Paid") onFormChange("payment_date", "");
                  }}
                  style={S.input}
                >
                  <option value="Pending">Belum Bayar</option>
                  <option value="Paid">Sudah Dibayar</option>
                </select>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px" }}>
            <button
              type="button"
              onClick={onSubmit}
              disabled={isSaving}
              className="btn-primary ui-motion-button ui-focus-ring"
              data-magnetic="true"
              style={{
                flex: 1,
                padding: "14px",
                backgroundColor: isSaving ? "var(--color-text-subtle)" : "var(--color-primary)",
                color: "white",
                border: "none",
                borderRadius: "12px",
                cursor: isSaving ? "not-allowed" : "pointer",
                fontSize: "15px",
                fontWeight: "700",
                opacity: isSaving ? 0.7 : 1,
              }}
            >
              {isSaving ? "Menyimpan..." : editingId ? "💾 Update Faktur" : "✅ Simpan Faktur"}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: "14px",
                backgroundColor: isDarkMode
                  ? "var(--color-surface-raised)"
                  : "var(--color-border)",
                color: isDarkMode ? "#FFF" : "#000",
                border: "none",
                borderRadius: "12px",
                cursor: "pointer",
                fontSize: "15px",
                fontWeight: "600",
              }}
            >
              Batal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
