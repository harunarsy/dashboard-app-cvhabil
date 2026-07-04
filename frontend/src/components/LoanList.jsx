import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Plus,
  X,
  Trash2,
  FileText,
  RotateCcw,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  ShoppingCart,
} from "lucide-react";
import { loansAPI, inventoryAPI, printSettingsAPI } from "../services/api";
import { useCustomers, useProducts } from "../hooks/useMasterData";
import MasterSelect from "./MasterSelect";
import ConfirmModal from "./common/ConfirmModal";
import ToastNotice from "./common/ToastNotice";
import EmptyState, { EmptyStateIcons } from "./common/EmptyState";
import useBodyScrollLock from "../hooks/useBodyScrollLock";
import {
  buildLoanReminderMessage,
  copyTextToClipboard,
} from "../utils/waMessage";

// v1.54.0: Peminjaman produk — "nota gantung": stok sudah keluar saat pinjam,
// belum dihitung penjualan sampai dikembalikan atau dikonversi jadi nota.

const fmtRp = (n) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(n || 0);
const fmtDate = (d) =>
  d
    ? new Date(String(d).split("T")[0] + "T00:00:00").toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "-";
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
const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(String(dateStr).split("T")[0] + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((d - now) / 86400000);
};
const todayStr = () => {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};
const outstandingOf = (it) =>
  (parseInt(it.qty) || 0) -
  (parseInt(it.qty_returned) || 0) -
  (parseInt(it.qty_purchased) || 0);
const loanOutstanding = (loan) =>
  (loan.items || []).reduce((s, it) => s + outstandingOf(it), 0);
// FEFO: batch in-stock & belum ED (ED terdekat) duluan
const pickFefoBatch = (batches) => {
  if (!batches || !batches.length) return null;
  const today = new Date(new Date().toDateString());
  const sortByEd = (arr) =>
    [...arr].sort((a, b) => {
      const ea = a.expired_date ? new Date(a.expired_date).getTime() : Infinity;
      const eb = b.expired_date ? new Date(b.expired_date).getTime() : Infinity;
      return ea - eb;
    });
  const inStock = batches.filter(
    (b) =>
      (parseFloat(b.qty_current) || 0) > 0 &&
      (!b.expired_date || new Date(b.expired_date) >= today),
  );
  return sortByEd(inStock)[0] || null;
};

const blankLoanItem = () => ({
  product_name: "",
  qty: 1,
  unit_price: 0,
  selected_batch_id: "",
});

export default function LoanList({ isDarkMode, isMobile }) {
  const { data: customers = [] } = useCustomers();
  const { data: productsRaw = [] } = useProducts();
  const products = (productsRaw || []).filter(
    (p) => (p.name || "").trim().toUpperCase() !== "ONGKIR",
  );

  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [toast, setToast] = useState("");
  const [toastType, setToastType] = useState("success");
  const toastTimerRef = useRef(null);
  const [saving, setSaving] = useState(false);

  // Form pinjam
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    customer_name: "",
    customer_phone: "",
    customer_address: "",
    loan_date: todayStr(),
    due_choice: "7", // '7' | '14' | '30' | 'custom'
    custom_days: "",
    notes: "",
  });
  const [items, setItems] = useState([blankLoanItem()]);
  const [itemBatches, setItemBatches] = useState([[]]);

  // Modal retur (per item)
  const [returnModal, setReturnModal] = useState(null); // {loan, item, qty, mode, batch_no, expired_date}
  // Modal konversi (per pinjaman — bisa beberapa item sekaligus → 1 nota)
  const [convertModal, setConvertModal] = useState(null); // {loan, rows:[{loan_item_id,...,qty}], payment_method, due_date}
  const [voidTarget, setVoidTarget] = useState(null);

  useBodyScrollLock(showForm || !!returnModal || !!convertModal || !!voidTarget);

  const border = "var(--color-border)";
  const text = "var(--color-text)";
  const sub = "var(--color-text-muted)";
  const cardBg = "var(--color-surface)";

  const showToast = useCallback((msg, type = "success") => {
    setToast(msg);
    setToastType(type);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(""), 3500);
  }, []);

  const fetchLoans = useCallback(async () => {
    try {
      const { data } = await loansAPI.getAll();
      setLoans(Array.isArray(data) ? data : []);
    } catch (e) {
      showToast(
        "Gagal memuat pinjaman: " + (e.response?.data?.error || e.message),
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, [showToast]);
  useEffect(() => {
    fetchLoans();
    return () => toastTimerRef.current && clearTimeout(toastTimerRef.current);
  }, [fetchLoans]);

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
  const labelStyle = {
    display: "block",
    fontSize: "11px",
    fontWeight: 700,
    color: sub,
    marginBottom: "5px",
    textTransform: "uppercase",
  };

  // ─── Form pinjam ───────────────────────────────────────────────────────
  const openForm = () => {
    setForm({
      customer_name: "",
      customer_phone: "",
      customer_address: "",
      loan_date: todayStr(),
      due_choice: "7",
      custom_days: "",
      notes: "",
    });
    setItems([blankLoanItem()]);
    setItemBatches([[]]);
    setShowForm(true);
  };

  const handleProductChange = async (idx, name) => {
    const prod = products.find(
      (p) => (p.name || "").toLowerCase() === (name || "").toLowerCase(),
    );
    setItems((prev) =>
      prev.map((it, i) =>
        i === idx
          ? {
              ...it,
              product_name: name,
              unit_price: prod ? parseFloat(prod.sell_price) || 0 : it.unit_price,
              selected_batch_id: "",
            }
          : it,
      ),
    );
    if (!prod?.id) {
      setItemBatches((prev) => prev.map((b, i) => (i === idx ? [] : b)));
      return;
    }
    try {
      const { data: batches } = await inventoryAPI.getProductBatches(prod.id);
      const usable = (batches || []).filter(
        (b) => (parseFloat(b.qty_current) || 0) > 0,
      );
      setItemBatches((prev) => prev.map((b, i) => (i === idx ? usable : b)));
      const fefo = pickFefoBatch(usable);
      if (fefo) {
        setItems((prev) =>
          prev.map((it, i) =>
            i === idx ? { ...it, selected_batch_id: String(fefo.id) } : it,
          ),
        );
      }
    } catch (e) {
      setItemBatches((prev) => prev.map((b, i) => (i === idx ? [] : b)));
    }
  };

  const updateItem = (idx, field, value) => {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)),
    );
  };
  const addItemRow = () => {
    setItems((prev) => [...prev, blankLoanItem()]);
    setItemBatches((prev) => [...prev, []]);
  };
  const removeItemRow = (idx) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
    setItemBatches((prev) => prev.filter((_, i) => i !== idx));
  };

  const dueDays = () =>
    form.due_choice === "custom"
      ? Math.max(1, parseInt(form.custom_days) || 0)
      : parseInt(form.due_choice);

  const saveLoan = async () => {
    if (!form.customer_name.trim())
      return showToast("Nama customer wajib diisi", "error");
    const valid = items.filter((it) => it.product_name.trim());
    if (!valid.length) return showToast("Minimal 1 produk", "error");
    for (const it of valid) {
      if (!(parseInt(it.qty) > 0))
        return showToast(`Qty "${it.product_name}" harus lebih dari 0`, "error");
      if (!it.selected_batch_id)
        return showToast(`Pilih batch untuk "${it.product_name}"`, "error");
    }
    if (form.due_choice === "custom" && !(parseInt(form.custom_days) > 0))
      return showToast("Isi jumlah hari tempo custom", "error");
    setSaving(true);
    try {
      const match = customers.find((c) => c.name === form.customer_name);
      await loansAPI.create({
        customer_id: match?.id || null,
        customer_name: form.customer_name,
        customer_phone: form.customer_phone,
        customer_address: form.customer_address,
        loan_date: form.loan_date,
        due_days: dueDays(),
        notes: form.notes,
        items: valid.map((it) => ({
          product_name: it.product_name,
          qty: parseInt(it.qty),
          unit_price: parseFloat(it.unit_price) || 0,
          selected_batch_id: parseInt(it.selected_batch_id),
        })),
      });
      showToast("Pinjaman tersimpan — stok sudah dikurangi");
      setShowForm(false);
      fetchLoans();
    } catch (e) {
      showToast(
        "Gagal simpan: " + (e.response?.data?.error || e.message),
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  // ─── Retur ─────────────────────────────────────────────────────────────
  const openReturn = (loan, item) =>
    setReturnModal({
      loan,
      item,
      qty: outstandingOf(item),
      mode: "same",
      batch_no: "",
      expired_date: "",
    });
  const saveReturn = async () => {
    const m = returnModal;
    const qty = parseInt(m.qty);
    if (!(qty > 0)) return showToast("Qty retur harus lebih dari 0", "error");
    if (qty > outstandingOf(m.item))
      return showToast(`Maksimal ${outstandingOf(m.item)}`, "error");
    if (m.mode === "new" && !m.batch_no.trim())
      return showToast("No. Batch baru wajib diisi", "error");
    setSaving(true);
    try {
      await loansAPI.returnItems(m.loan.id, {
        items: [
          {
            loan_item_id: m.item.id,
            qty,
            mode: m.mode,
            batch_no: m.batch_no,
            expired_date: m.expired_date || null,
          },
        ],
      });
      showToast("Barang dikembalikan — stok masuk lagi");
      setReturnModal(null);
      fetchLoans();
    } catch (e) {
      showToast(
        "Gagal retur: " + (e.response?.data?.error || e.message),
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  // ─── Konversi jadi nota ────────────────────────────────────────────────
  const openConvert = (loan) =>
    setConvertModal({
      loan,
      rows: (loan.items || [])
        .filter((it) => outstandingOf(it) > 0)
        .map((it) => ({
          loan_item_id: it.id,
          product_name: it.product_name,
          unit: it.unit || "pcs",
          unit_price: parseFloat(it.unit_price) || 0,
          outstanding: outstandingOf(it),
          qty: outstandingOf(it),
        })),
      payment_method: "Tunai",
      due_date: "",
    });
  const saveConvert = async () => {
    const m = convertModal;
    const chosen = m.rows.filter((r) => parseInt(r.qty) > 0);
    if (!chosen.length)
      return showToast("Isi qty minimal 1 item untuk dijadikan nota", "error");
    for (const r of chosen) {
      if (parseInt(r.qty) > r.outstanding)
        return showToast(
          `Qty ${r.product_name} melebihi sisa pinjaman (${r.outstanding})`,
          "error",
        );
    }
    setSaving(true);
    try {
      const { data } = await loansAPI.convert(m.loan.id, {
        items: chosen.map((r) => ({
          loan_item_id: r.loan_item_id,
          qty: parseInt(r.qty),
        })),
        payment_method: m.payment_method,
        due_date: m.payment_method !== "Tunai" ? m.due_date || null : null,
      });
      showToast(
        `Nota ${data?.order?.order_number || ""} dibuat dari pinjaman (stok tidak dipotong lagi)`,
      );
      setConvertModal(null);
      fetchLoans();
    } catch (e) {
      showToast(
        "Gagal konversi: " + (e.response?.data?.error || e.message),
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  // ─── Void ──────────────────────────────────────────────────────────────
  const confirmVoid = async () => {
    if (!voidTarget) return;
    setSaving(true);
    try {
      const { data } = await loansAPI.remove(voidTarget.id);
      showToast(data?.message || "Pinjaman dibatalkan");
      setVoidTarget(null);
      fetchLoans();
    } catch (e) {
      showToast(
        "Gagal void: " + (e.response?.data?.error || e.message),
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  // ─── PDF + WA ──────────────────────────────────────────────────────────
  const handleLoanPdf = async (loan) => {
    try {
      let settings = {};
      try {
        const { data } = await printSettingsAPI.get();
        settings = data?.nota_layout || {};
      } catch (e) {
        /* pakai default */
      }
      const { generateNotaPDF } = await import("../utils/generateNotaPDF");
      const doc = generateNotaPDF(
        {
          order_number: loan.loan_number,
          sale_date: loan.loan_date,
          due_date: loan.due_date,
          customer_name: loan.customer_name,
          customer_phone: loan.customer_phone,
          customer_address: loan.customer_address,
          total: parseFloat(loan.total_value) || 0,
          notes: loan.notes,
          items: (loan.items || []).map((it) => ({
            product_name: it.product_name,
            qty: it.qty,
            qty_in_unit: it.qty,
            unit: it.unit || "pcs",
            unit_price: parseFloat(it.unit_price) || 0,
            batch_no_snapshot: it.batch_no_snapshot,
            expired_date_snapshot: it.expired_date_snapshot,
            pack_size_at_sale: 1,
          })),
        },
        { format: "A5", type: "pinjaman", settings },
      );
      doc.save(`NotaPinjaman_${loan.loan_number}.pdf`);
    } catch (e) {
      showToast("Gagal membuat PDF: " + e.message, "error");
    }
  };
  // v1.54.1: SALIN teks reminder (bukan buka WA — wa.me ngerusak emoji & butuh No. HP)
  const handleWaReminder = async (loan) => {
    const msg = buildLoanReminderMessage({
      customerName: loan.customer_name,
      loanNumber: loan.loan_number,
      dueDate: loan.due_date,
      items: (loan.items || []).map((it) => ({
        ...it,
        outstanding: outstandingOf(it),
      })),
    });
    const ok = await copyTextToClipboard(msg);
    showToast(
      ok
        ? `Pesan reminder ${loan.loan_number} disalin — tinggal paste di WA`
        : "Gagal menyalin — coba lagi",
      ok ? "success" : "error",
    );
  };

  // ─── Derived ───────────────────────────────────────────────────────────
  const activeLoans = loans.filter((l) => l.status !== "selesai");
  const overdueLoans = activeLoans.filter((l) => {
    const d = daysUntil(l.due_date);
    return d !== null && d < 0 && loanOutstanding(l) > 0;
  });

  const dueBadge = (loan) => {
    if (loan.status === "selesai")
      return (
        <span style={{ fontSize: "11px", fontWeight: 800, color: "var(--color-success)" }}>
          SELESAI
        </span>
      );
    const d = daysUntil(loan.due_date);
    if (d === null) return null;
    if (d < 0)
      return (
        <span
          style={{
            fontSize: "11px",
            fontWeight: 800,
            color: "#FFF",
            backgroundColor: "var(--color-danger)",
            padding: "2px 8px",
            borderRadius: "6px",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <AlertTriangle size={11} /> TERLAMBAT {Math.abs(d)} HARI
        </span>
      );
    if (d === 0)
      return (
        <span style={{ fontSize: "11px", fontWeight: 800, color: "var(--color-warning)" }}>
          BATAS PENGEMBALIAN HARI INI
        </span>
      );
    return (
      <span style={{ fontSize: "11px", fontWeight: 700, color: sub }}>
        {d} hari lagi
      </span>
    );
  };

  const smallBtn = (bgColor, colorTxt = "#FFF") => ({
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    padding: "6px 10px",
    backgroundColor: bgColor,
    color: colorTxt,
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "12px",
  });

  const modalOverlay = {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: "1rem",
  };
  const modalBox = (maxWidth = 560) => ({
    backgroundColor: cardBg,
    borderRadius: "14px",
    border: `1px solid ${border}`,
    padding: "1.25rem",
    width: "100%",
    maxWidth,
    maxHeight: "90vh",
    overflowY: "auto",
    color: text,
  });

  return (
    <div>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginBottom: "1rem",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <button onClick={openForm} className="ui-motion-button" style={smallBtn("var(--color-success)")}>
          <Plus size={15} /> Pinjam Barang
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: "12px", color: sub, fontWeight: 600 }}>
          {activeLoans.length} pinjaman aktif
          {overdueLoans.length > 0 && (
            <span style={{ color: "var(--color-danger)", fontWeight: 800 }}>
              {" "}
              · {overdueLoans.length} lewat batas
            </span>
          )}
        </span>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ color: sub, fontSize: "13px", padding: "2rem 0" }}>
          Memuat pinjaman…
        </div>
      ) : loans.length === 0 ? (
        <EmptyState
          icon={EmptyStateIcons.cart}
          title="Belum ada pinjaman"
          description={'Klik "Pinjam Barang" untuk mencatat barang yang dipinjam customer — stok langsung terpotong dan bisa cetak Nota Pinjaman.'}
          isDarkMode={isDarkMode}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {loans.map((loan) => {
            const isOpen = expandedId === loan.id;
            const outstanding = loanOutstanding(loan);
            return (
              <div
                key={loan.id}
                className="ui-motion-card"
                style={{
                  backgroundColor: cardBg,
                  border: `1px solid ${border}`,
                  borderRadius: "12px",
                  overflow: "hidden",
                }}
              >
                <div
                  onClick={() => setExpandedId(isOpen ? null : loan.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px 14px",
                    cursor: "pointer",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: isMobile ? "100%" : "210px" }}>
                    <div style={{ fontWeight: 800, fontSize: "13px", color: text }}>
                      {loan.loan_number}
                    </div>
                    <div style={{ fontSize: "12px", color: sub }}>
                      {fmtDate(loan.loan_date)}
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: "160px" }}>
                    <div style={{ fontWeight: 700, fontSize: "13px", color: text }}>
                      {loan.customer_name}
                    </div>
                    <div style={{ fontSize: "12px", color: sub }}>
                      Batas kembali: {fmtDateDay(loan.due_date)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", minWidth: "120px" }}>
                    <div style={{ fontWeight: 800, fontSize: "13px", color: text }}>
                      {fmtRp(loan.total_value)}
                    </div>
                    <div style={{ fontSize: "12px", color: sub }}>
                      sisa {outstanding} unit
                    </div>
                  </div>
                  <div style={{ minWidth: "130px", textAlign: "right" }}>
                    {dueBadge(loan)}
                  </div>
                  {isOpen ? (
                    <ChevronUp size={16} color={sub} />
                  ) : (
                    <ChevronDown size={16} color={sub} />
                  )}
                </div>

                {isOpen && (
                  <div style={{ borderTop: `1px solid ${border}`, padding: "12px 14px" }}>
                    {/* Items */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {(loan.items || []).map((it) => {
                        const sisa = outstandingOf(it);
                        return (
                          <div
                            key={it.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                              flexWrap: "wrap",
                              padding: "8px 10px",
                              borderRadius: "9px",
                              backgroundColor: "var(--color-surface-elevated)",
                              border: `1px solid ${border}`,
                            }}
                          >
                            <div style={{ flex: 1, minWidth: "180px" }}>
                              <div style={{ fontWeight: 700, fontSize: "13px", color: text }}>
                                {it.product_name}
                              </div>
                              <div style={{ fontSize: "11px", color: sub }}>
                                {it.batch_no_snapshot
                                  ? `Batch ${it.batch_no_snapshot}`
                                  : "Tanpa batch"}
                                {it.expired_date_snapshot
                                  ? ` · ED ${fmtDate(it.expired_date_snapshot)}`
                                  : ""}
                                {" · "}
                                {fmtRp(it.unit_price)}/{it.unit || "pcs"}
                              </div>
                            </div>
                            <div style={{ fontSize: "12px", color: sub, minWidth: "170px" }}>
                              pinjam <b style={{ color: text }}>{it.qty}</b> · kembali{" "}
                              <b style={{ color: "var(--color-success)" }}>{it.qty_returned}</b> · dibeli{" "}
                              <b style={{ color: "var(--color-primary)" }}>{it.qty_purchased}</b> · sisa{" "}
                              <b style={{ color: sisa > 0 ? "var(--color-warning)" : text }}>{sisa}</b>
                            </div>
                            {sisa > 0 && (
                              <button
                                onClick={() => openReturn(loan, it)}
                                className="ui-motion-button"
                                style={smallBtn("var(--color-success)")}
                              >
                                <RotateCcw size={12} /> Kembalikan
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Nota hasil konversi */}
                    {Array.isArray(loan.conversions) && loan.conversions.length > 0 && (
                      <div style={{ marginTop: "8px", fontSize: "12px", color: sub }}>
                        Sudah jadi nota:{" "}
                        {[...new Set(loan.conversions.map((c) => c.order_number))].join(", ")}
                      </div>
                    )}
                    {loan.notes && (
                      <div style={{ marginTop: "8px", fontSize: "12px", color: sub }}>
                        Catatan: {loan.notes}
                      </div>
                    )}

                    {/* Aksi pinjaman */}
                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                        marginTop: "12px",
                        flexWrap: "wrap",
                      }}
                    >
                      {outstanding > 0 && (
                        <button
                          onClick={() => openConvert(loan)}
                          className="ui-motion-button"
                          style={smallBtn("var(--color-primary)")}
                        >
                          <ShoppingCart size={12} /> Jadikan Nota
                        </button>
                      )}
                      <button
                        onClick={() => handleLoanPdf(loan)}
                        className="ui-motion-button"
                        style={smallBtn(
                          isDarkMode ? "var(--color-surface-raised)" : "var(--color-border)",
                          isDarkMode ? "#FFF" : "#000",
                        )}
                      >
                        <FileText size={12} /> PDF Nota Pinjaman
                      </button>
                      {outstanding > 0 && (
                        <button
                          onClick={() => handleWaReminder(loan)}
                          className="ui-motion-button"
                          style={smallBtn("#25D366")}
                        >
                          <MessageCircle size={12} /> Salin Reminder
                        </button>
                      )}
                      <div style={{ flex: 1 }} />
                      <button
                        onClick={() => setVoidTarget(loan)}
                        className="ui-motion-button"
                        style={smallBtn("var(--color-danger)")}
                      >
                        <Trash2 size={12} /> Void
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Modal: Pinjam Barang ─────────────────────────────────────────── */}
      {showForm && (
        <div style={modalOverlay} onClick={() => !saving && setShowForm(false)}>
          <div style={modalBox(720)} onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1rem",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "16px", color: text }}>Pinjam Barang</h3>
              <button
                onClick={() => setShowForm(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: sub }}
              >
                <X size={18} />
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                gap: "10px",
              }}
            >
              <div>
                <label style={labelStyle}>Customer *</label>
                <MasterSelect
                  value={form.customer_name}
                  onChange={(v) => {
                    const match = customers.find((c) => c.name === v);
                    setForm((p) => ({
                      ...p,
                      customer_name: v,
                      customer_phone: match?.phone || p.customer_phone,
                      customer_address: match?.address || p.customer_address,
                    }));
                  }}
                  options={customers.map((c) => ({ name: c.name }))}
                  isDarkMode={isDarkMode}
                  placeholder="Nama customer / apotek"
                />
              </div>
              <div>
                <label style={labelStyle}>No. HP</label>
                <input
                  style={inputStyle}
                  value={form.customer_phone}
                  onChange={(e) => setForm((p) => ({ ...p, customer_phone: e.target.value }))}
                  placeholder="08xx"
                />
              </div>
              <div>
                <label style={labelStyle}>Tanggal Pinjam</label>
                <input
                  type="date"
                  style={inputStyle}
                  value={form.loan_date}
                  onChange={(e) => setForm((p) => ({ ...p, loan_date: e.target.value }))}
                />
              </div>
              <div>
                <label style={labelStyle}>Batas Pengembalian</label>
                <div style={{ display: "flex", gap: "6px" }}>
                  <select
                    style={{ ...inputStyle, flex: 1 }}
                    value={form.due_choice}
                    onChange={(e) => setForm((p) => ({ ...p, due_choice: e.target.value }))}
                  >
                    <option value="7">7 hari</option>
                    <option value="14">14 hari</option>
                    <option value="30">30 hari</option>
                    <option value="custom">Custom…</option>
                  </select>
                  {form.due_choice === "custom" && (
                    <input
                      type="number"
                      min="1"
                      style={{ ...inputStyle, width: "90px" }}
                      value={form.custom_days}
                      onChange={(e) => setForm((p) => ({ ...p, custom_days: e.target.value }))}
                      placeholder="hari"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Items */}
            <div style={{ marginTop: "14px" }}>
              <label style={labelStyle}>Barang yang dipinjam</label>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {items.map((it, idx) => {
                  const batches = itemBatches[idx] || [];
                  // v1.56.1: mobile pakai label mini per field (stacked tanpa label bikin
                  // qty/harga membingungkan) + qty/harga sebaris; desktop grid 5 kolom tetap.
                  const mini = (t) =>
                    isMobile ? (
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
                    ) : null;
                  const productEl = (
                    <MasterSelect
                      value={it.product_name}
                      onChange={(v) => handleProductChange(idx, v)}
                      options={products.map((p) => ({ name: p.name }))}
                      isDarkMode={isDarkMode}
                      placeholder="Nama produk"
                    />
                  );
                  const batchEl = (
                    <select
                      style={inputStyle}
                      value={it.selected_batch_id}
                      onChange={(e) => updateItem(idx, "selected_batch_id", e.target.value)}
                      aria-label="Batch"
                    >
                      <option value="">Pilih batch…</option>
                      {batches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.batch_no || "(tanpa no)"} · sisa {b.qty_current}
                          {b.expired_date ? ` · ED ${fmtDate(b.expired_date)}` : ""}
                        </option>
                      ))}
                    </select>
                  );
                  const qtyEl = (
                    <input
                      type="number"
                      min="1"
                      style={inputStyle}
                      value={it.qty}
                      onChange={(e) => updateItem(idx, "qty", e.target.value)}
                      placeholder="Qty"
                      aria-label="Qty"
                    />
                  );
                  const priceEl = (
                    <input
                      type="number"
                      min="0"
                      style={inputStyle}
                      value={it.unit_price}
                      onChange={(e) => updateItem(idx, "unit_price", e.target.value)}
                      placeholder="Harga"
                      aria-label="Harga"
                    />
                  );
                  const removeEl = (
                    <button
                      onClick={() => removeItemRow(idx)}
                      disabled={items.length === 1}
                      aria-label="Hapus baris"
                      style={{
                        background: "none",
                        border: "none",
                        cursor: items.length === 1 ? "not-allowed" : "pointer",
                        color: "var(--color-danger)",
                        opacity: items.length === 1 ? 0.4 : 1,
                      }}
                    >
                      <X size={15} />
                    </button>
                  );
                  if (isMobile) {
                    return (
                      <div
                        key={idx}
                        style={{
                          padding: "10px",
                          border: `1px solid ${border}`,
                          borderRadius: "10px",
                          backgroundColor: "var(--color-surface)",
                        }}
                      >
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "minmax(0, 1fr) 26px",
                            gap: "6px",
                            alignItems: "center",
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            {mini("Nama Produk")}
                            {productEl}
                          </div>
                          {removeEl}
                        </div>
                        <div style={{ marginTop: "8px" }}>
                          {mini("Batch / ED")}
                          {batchEl}
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
                            {mini("Qty")}
                            {qtyEl}
                          </div>
                          <div>
                            {mini("Harga")}
                            {priceEl}
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={idx}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "2fr 140px 90px 130px 28px",
                        gap: "8px",
                        alignItems: "center",
                      }}
                    >
                      {productEl}
                      {batchEl}
                      {qtyEl}
                      {priceEl}
                      {removeEl}
                    </div>
                  );
                })}
              </div>
              <button
                onClick={addItemRow}
                className="ui-motion-button"
                style={{
                  ...smallBtn("transparent", "var(--color-primary)"),
                  border: `1px dashed var(--color-primary)`,
                  marginTop: "8px",
                }}
              >
                <Plus size={12} /> Tambah Produk
              </button>
            </div>

            <div style={{ marginTop: "12px" }}>
              <label style={labelStyle}>Catatan</label>
              <input
                style={inputStyle}
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Opsional"
              />
            </div>

            <div
              style={{
                marginTop: "14px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: "12px", color: sub }}>
                Total nilai barang:{" "}
                <b style={{ color: text }}>
                  {fmtRp(
                    items.reduce(
                      (s, it) =>
                        s + (parseInt(it.qty) || 0) * (parseFloat(it.unit_price) || 0),
                      0,
                    ),
                  )}
                </b>
              </span>
              <button
                onClick={saveLoan}
                disabled={saving}
                className="ui-motion-button"
                style={{ ...smallBtn("var(--color-success)"), padding: "9px 18px", opacity: saving ? 0.6 : 1 }}
              >
                {saving ? "Menyimpan…" : "Simpan Pinjaman"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal: Kembalikan ────────────────────────────────────────────── */}
      {returnModal && (
        <div style={modalOverlay} onClick={() => !saving && setReturnModal(null)}>
          <div style={modalBox(440)} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 4px", fontSize: "15px", color: text }}>
              Kembalikan Barang
            </h3>
            <div style={{ fontSize: "12px", color: sub, marginBottom: "12px" }}>
              {returnModal.item.product_name} — sisa dipinjam{" "}
              {outstandingOf(returnModal.item)} {returnModal.item.unit || "pcs"}
            </div>
            <label style={labelStyle}>Qty dikembalikan</label>
            <input
              type="number"
              min="1"
              max={outstandingOf(returnModal.item)}
              style={inputStyle}
              value={returnModal.qty}
              onChange={(e) => setReturnModal((p) => ({ ...p, qty: e.target.value }))}
            />
            <div style={{ marginTop: "10px" }}>
              <label style={labelStyle}>Masuk ke batch</label>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {[
                  {
                    v: "same",
                    label: `Batch sama (${returnModal.item.batch_no_snapshot || "tanpa no"})`,
                  },
                  { v: "new", label: "Batch beda / baru" },
                ].map((opt) => (
                  <label
                    key={opt.v}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "13px",
                      color: text,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="radio"
                      checked={returnModal.mode === opt.v}
                      onChange={() => setReturnModal((p) => ({ ...p, mode: opt.v }))}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
            {returnModal.mode === "new" && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                  gap: "8px",
                  marginTop: "10px",
                }}
              >
                <div>
                  <label style={labelStyle}>No. Batch baru *</label>
                  <input
                    style={inputStyle}
                    value={returnModal.batch_no}
                    onChange={(e) =>
                      setReturnModal((p) => ({ ...p, batch_no: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label style={labelStyle}>Expired Date</label>
                  <input
                    type="date"
                    style={inputStyle}
                    value={returnModal.expired_date}
                    onChange={(e) =>
                      setReturnModal((p) => ({ ...p, expired_date: e.target.value }))
                    }
                  />
                </div>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "14px" }}>
              <button
                onClick={() => setReturnModal(null)}
                className="ui-motion-button"
                style={smallBtn(
                  isDarkMode ? "var(--color-surface-raised)" : "var(--color-border)",
                  isDarkMode ? "#FFF" : "#000",
                )}
              >
                Batal
              </button>
              <button
                onClick={saveReturn}
                disabled={saving}
                className="ui-motion-button"
                style={{ ...smallBtn("var(--color-success)"), opacity: saving ? 0.6 : 1 }}
              >
                {saving ? "Menyimpan…" : "Kembalikan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal: Jadikan Nota ──────────────────────────────────────────── */}
      {convertModal && (
        <div style={modalOverlay} onClick={() => !saving && setConvertModal(null)}>
          <div style={modalBox(560)} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 4px", fontSize: "15px", color: text }}>
              Jadikan Nota Penjualan
            </h3>
            <div style={{ fontSize: "12px", color: sub, marginBottom: "12px" }}>
              {convertModal.loan.loan_number} · {convertModal.loan.customer_name} — item
              terpilih jadi 1 nota penjualan resmi. Stok TIDAK dipotong lagi (sudah keluar
              saat pinjam). Harga pakai harga saat pinjam.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {convertModal.rows.map((r, idx) => (
                <div
                  key={r.loan_item_id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: 1, minWidth: "160px", fontSize: "13px", color: text, fontWeight: 600 }}>
                    {r.product_name}
                    <span style={{ color: sub, fontWeight: 400 }}>
                      {" "}
                      · {fmtRp(r.unit_price)}/{r.unit} · sisa {r.outstanding}
                    </span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max={r.outstanding}
                    style={{ ...inputStyle, width: "90px" }}
                    value={r.qty}
                    onChange={(e) =>
                      setConvertModal((p) => ({
                        ...p,
                        rows: p.rows.map((row, i) =>
                          i === idx ? { ...row, qty: e.target.value } : row,
                        ),
                      }))
                    }
                  />
                </div>
              ))}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                gap: "10px",
                marginTop: "12px",
              }}
            >
              <div>
                <label style={labelStyle}>Metode Bayar</label>
                <select
                  style={inputStyle}
                  value={convertModal.payment_method}
                  onChange={(e) =>
                    setConvertModal((p) => ({ ...p, payment_method: e.target.value }))
                  }
                >
                  <option value="Tunai">Tunai</option>
                  <option value="Transfer">Transfer</option>
                  <option value="Tempo">Tempo</option>
                </select>
              </div>
              {convertModal.payment_method !== "Tunai" && (
                <div>
                  <label style={labelStyle}>Jatuh Tempo Pembayaran</label>
                  <input
                    type="date"
                    style={inputStyle}
                    value={convertModal.due_date}
                    onChange={(e) =>
                      setConvertModal((p) => ({ ...p, due_date: e.target.value }))
                    }
                  />
                </div>
              )}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: "14px",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: "12px", color: sub }}>
                Total nota:{" "}
                <b style={{ color: text }}>
                  {fmtRp(
                    convertModal.rows.reduce(
                      (s, r) => s + (parseInt(r.qty) || 0) * r.unit_price,
                      0,
                    ),
                  )}
                </b>
              </span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => setConvertModal(null)}
                  className="ui-motion-button"
                  style={smallBtn(
                    isDarkMode ? "var(--color-surface-raised)" : "var(--color-border)",
                    isDarkMode ? "#FFF" : "#000",
                  )}
                >
                  Batal
                </button>
                <button
                  onClick={saveConvert}
                  disabled={saving}
                  className="ui-motion-button"
                  style={{ ...smallBtn("var(--color-primary)"), opacity: saving ? 0.6 : 1 }}
                >
                  {saving ? "Membuat nota…" : "Buat Nota"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!voidTarget}
        onClose={() => setVoidTarget(null)}
        onConfirm={confirmVoid}
        title="Void Pinjaman"
        message={`Batalkan pinjaman ${voidTarget?.loan_number || ""}? Sisa barang yang belum dikembalikan/dibeli akan masuk lagi ke stok batch asal. Item yang sudah diretur atau sudah jadi nota TIDAK ikut berubah.`}
        isDarkMode={isDarkMode}
      />

      <ToastNotice message={toast} type={toastType} isMobile={isMobile} />
    </div>
  );
}
