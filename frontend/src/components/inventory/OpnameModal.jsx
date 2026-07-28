import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import {
  X,
  Search,
  ClipboardCheck,
  ChevronRight,
  CheckCircle2,
  Plus,
  Sliders,
  Pencil,
  Trash2,
  FileText,
  Check,
  Camera,
} from "lucide-react";
import { inventoryAPI, printSettingsAPI } from "../../services/api";
import BatchFormModal from "./BatchFormModal";
import BarcodeScanner from "../common/BarcodeScanner";
import ConfirmModal from "../common/ConfirmModal";
import { UI_MOTION, uiTransition } from "../../constants/ui";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

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

function expiryBadge(date, sub) {
  if (!date) return { color: sub, bg: "transparent", text: "-" };
  const days = daysUntil(date);
  if (days <= 0)
    return {
      color: "var(--color-danger)",
      bg: "var(--color-danger-soft)",
      text: `EXP ${fmtDate(date)}`,
    };
  if (days < 90)
    return {
      color: "var(--color-warning)",
      bg: "var(--color-warning-soft)",
      text: `${fmtDate(date)} (${days}d)`,
    };
  return { color: "var(--color-success)", bg: "#F0FBF3", text: fmtDate(date) };
}

// Per-batch stok opname modal.
// State: { [batchId]: { product_id, product_name, batch_no, qty_current, expired_date, physical_qty, notes } }
export default function OpnameModal({
  products,
  isDarkMode,
  isMobile,
  onClose,
  onSaved,
  onProductsChanged,
}) {
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [search, setSearch] = useState("");
  const [batchesByProduct, setBatchesByProduct] = useState({}); // { productId: [batches] }
  const [inputs, setInputs] = useState({}); // { batchId: { physical_qty, notes, product_id, product_name, batch_no, qty_current, expired_date } }
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // CRUD batch (Phase v1.5.1) — Add/Delete/Adjust inline tanpa keluar modal
  const [batchModal, setBatchModal] = useState(null); // { mode: 'add' | 'edit', batch?: ... }
  const [adjustFor, setAdjustFor] = useState(null);
  const [adjustForm, setAdjustForm] = useState({ new_qty: 0, reason: "" });
  const [actionError, setActionError] = useState("");
  // AUDIT-UX-03: batch menunggu konfirmasi hapus lewat ConfirmModal (bukan window.confirm)
  const [deleteBatchConfirm, setDeleteBatchConfirm] = useState(null);
  // v1.10.5: edit kode produk inline saat opname
  const [editingCode, setEditingCode] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeMap, setCodeMap] = useState({}); // patch lokal { productId: newCode }
  const [exporting, setExporting] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [highlightProductId, setHighlightProductId] = useState(null);
  const productRowRefs = useRef({});
  useBodyScrollLock(true);

  const bg = isDarkMode ? "var(--color-surface-elevated)" : "#FFF";
  const border = isDarkMode
    ? "var(--color-surface-raised)"
    : "var(--color-border)";
  const text = isDarkMode ? "#FFF" : "#000";
  const sub = "var(--color-text-subtle)";
  const surface = isDarkMode
    ? "var(--color-surface-raised)"
    : "var(--color-bg)";
  const iconBtnStyle = {
    width: "28px",
    height: "28px",
    background: "transparent",
    border: `1px solid ${border}`,
    borderRadius: "6px",
    cursor: "pointer",
    color: sub,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  };
  const TooltipButton = ({
    label,
    children,
    className = "",
    style = {},
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
        style={{ backgroundColor: bg, color: text, borderColor: border }}
      >
        {label}
      </span>
    </span>
  );
  const findProductByCode = useCallback(
    (code) => {
      const normalized = String(code || "")
        .trim()
        .toLowerCase();
      if (!normalized) return null;
      return (
        products.find(
          (p) =>
            String(codeMap[p.id] ?? p.code ?? "")
              .trim()
              .toLowerCase() === normalized,
        ) || null
      );
    },
    [products, codeMap],
  );

  const handleScanProduct = useCallback(
    (code) => {
      const product = findProductByCode(code);
      if (!product) {
        setActionError(`Kode ${code} tidak ditemukan di inventory`);
        return;
      }
      setActionError("");
      setSearch("");
      setSelectedProductId(product.id);
      setHighlightProductId(product.id);
      setTimeout(() => {
        productRowRefs.current[product.id]?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, UI_MOTION.duration.scrollIntoView);
      setTimeout(
        () => setHighlightProductId(null),
        UI_MOTION.duration.scanHighlight,
      );
    },
    [findProductByCode],
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.code || "").toLowerCase().includes(q),
    );
  }, [products, search]);

  const loadBatches = useCallback(
    async (productId) => {
      if (batchesByProduct[productId]) return;
      setLoadingBatches(true);
      try {
        const { data } = await inventoryAPI.getProductBatches(productId);
        setBatchesByProduct((prev) => ({ ...prev, [productId]: data }));
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingBatches(false);
      }
    },
    [batchesByProduct],
  );

  useEffect(() => {
    if (selectedProductId) loadBatches(selectedProductId);
  }, [selectedProductId, loadBatches]);

  // CRUD helpers — refetch (force, skip cache) + delete + adjust
  const refetchBatches = useCallback(async (productId) => {
    if (!productId) return;
    try {
      const { data } = await inventoryAPI.getProductBatches(productId);
      setBatchesByProduct((prev) => ({ ...prev, [productId]: data }));
    } catch (e) {
      setActionError(e.response?.data?.error || e.message);
    }
  }, []);

  // AUDIT-UX-03: hapus batch (apalagi yang masih ber-stok = nol-kan uang) lewat
  // ConfirmModal, bukan window.confirm yang gampang ke-Enter tanpa kebaca.
  const handleDelete = (batch) => setDeleteBatchConfirm(batch);
  const executeDeleteBatch = async () => {
    if (!deleteBatchConfirm) return;
    const batch = deleteBatchConfirm;
    setDeleteBatchConfirm(null);
    setActionError("");
    try {
      await inventoryAPI.deleteBatch(batch.id);
      await refetchBatches(selectedProductId);
      setInputs((prev) => {
        const next = { ...prev };
        delete next[batch.id];
        return next;
      });
    } catch (e) {
      setActionError(e.response?.data?.error || e.message);
    }
  };

  const handleAdjustSubmit = async () => {
    if (!adjustForm.reason.trim()) {
      setActionError("Alasan adjustment wajib diisi");
      return;
    }
    try {
      await inventoryAPI.adjustBatch(adjustFor.id, {
        new_qty: parseInt(adjustForm.new_qty),
        reason: adjustForm.reason,
      });
      setAdjustFor(null);
      setAdjustForm({ new_qty: 0, reason: "" });
      setActionError("");
      await refetchBatches(selectedProductId);
    } catch (e) {
      setActionError(e.response?.data?.error || e.message);
    }
  };

  const handleInput = (batch, product, value) => {
    const v = value === "" ? "" : parseInt(value);
    setInputs((prev) => ({
      ...prev,
      [batch.id]: {
        ...(prev[batch.id] || {}),
        product_id: product.id,
        product_name: product.name,
        batch_no: batch.batch_no,
        qty_current: batch.qty_current,
        expired_date: batch.expired_date,
        physical_qty: v,
        notes: prev[batch.id]?.notes || "",
      },
    }));
  };

  const handleNotes = (batchId, notes) => {
    setInputs((prev) => ({
      ...prev,
      [batchId]: { ...(prev[batchId] || {}), notes },
    }));
  };

  const changedItems = useMemo(() => {
    return Object.entries(inputs)
      .filter(
        ([_, v]) =>
          v.physical_qty !== "" && parseInt(v.physical_qty) !== v.qty_current,
      )
      .map(([batch_id, v]) => ({
        batch_id: parseInt(batch_id),
        physical_qty: parseInt(v.physical_qty),
        notes: v.notes || null,
      }));
  }, [inputs]);

  const totalProductsChanged = useMemo(() => {
    return new Set(
      Object.entries(inputs)
        .filter(
          ([_, v]) =>
            v.physical_qty !== "" && parseInt(v.physical_qty) !== v.qty_current,
        )
        .map(([_, v]) => v.product_id),
    ).size;
  }, [inputs]);
  const totalDiff = useMemo(() => {
    return Object.values(inputs)
      .filter(
        (v) =>
          v.physical_qty !== "" && parseInt(v.physical_qty) !== v.qty_current,
      )
      .reduce((sum, v) => sum + (parseInt(v.physical_qty) - v.qty_current), 0);
  }, [inputs]);

  const setBatchPhysical = (batch, product, value) => {
    handleInput(batch, product, value);
  };
  const clearBatchPhysical = (batchId) => {
    setInputs((prev) => {
      const next = { ...prev };
      delete next[batchId];
      return next;
    });
  };

  const handleSave = async () => {
    if (changedItems.length === 0) {
      setError("Tidak ada perubahan untuk disimpan");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await inventoryAPI.createOpname({ items: changedItems });
      onSaved?.(
        `Opname tersimpan: ${changedItems.length} batch di ${totalProductsChanged} produk`,
      );
      onClose();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  // v1.10.5: simpan kode produk baru saat opname (inline)
  const handleSaveCode = async (product) => {
    const newCode = codeInput.trim();
    setEditingCode(false);
    if (newCode === (codeMap[product.id] ?? product.code ?? "")) return;
    try {
      await inventoryAPI.updateProduct(product.id, {
        name: product.name,
        code: newCode,
        unit: product.unit,
        hna: parseFloat(product.hna) || 0,
        sell_price: parseFloat(product.sell_price) || 0,
        category: product.category || "",
        min_stock: product.min_stock || 5,
      });
      setCodeMap((prev) => ({ ...prev, [product.id]: newCode }));
      onProductsChanged?.();
    } catch (e) {
      setActionError(e.response?.data?.error || e.message);
    }
  };

  // v1.10.5: export PDF Berita Acara dari perubahan opname (sebelum / sesudah simpan)
  const handleExportPDF = async () => {
    if (changedItems.length === 0) return;
    setExporting(true);
    try {
      let settings = {};
      try {
        const { data } = await printSettingsAPI.get();
        settings = data?.nota_layout || data || {};
      } catch (_) {
        /* default */
      }
      const rows = Object.entries(inputs)
        .filter(
          ([_, v]) =>
            v.physical_qty !== "" && parseInt(v.physical_qty) !== v.qty_current,
        )
        .map(([_, v]) => ({
          code:
            codeMap[v.product_id] ??
            products.find((p) => p.id === v.product_id)?.code ??
            "-",
          product_name: v.product_name,
          batch_no: v.batch_no,
          expired_date: v.expired_date,
          qty_current: v.qty_current,
          physical_qty: v.physical_qty,
          notes: v.notes,
        }));
      const { generateOpnamePDF } =
        await import("../../utils/generateOpnamePDF");
      const doc = generateOpnamePDF(rows, { settings });
      doc.save(
        `Berita_Acara_Opname_${new Date().toISOString().slice(0, 10)}.pdf`,
      );
    } catch (e) {
      setError(`Gagal export PDF: ${e.message}`);
    } finally {
      setExporting(false);
    }
  };

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const currentBatches = selectedProductId
    ? batchesByProduct[selectedProductId] || []
    : [];
  const inputCount = Object.values(inputs).filter(
    (v) => v.physical_qty !== "",
  ).length;

  const modal = (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: isMobile ? 0 : "1rem",
      }}
    >
      <div
        className="ui-motion-modal ui-modal-shell"
        style={{
          background: bg,
          color: text,
          borderRadius: isMobile ? 0 : "20px",
          width: "100%",
          maxWidth: "960px",
          height: isMobile ? "100%" : "85vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 32px 64px rgba(0,0,0,0.35)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: `1px solid ${border}`,
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              background: "var(--color-warning-soft)",
              color: "var(--color-warning)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ClipboardCheck size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "700" }}>
              Stok Opname (per Batch)
            </h2>
            <p style={{ margin: "2px 0 0", fontSize: "12px", color: sub }}>
              Pilih produk → input qty fisik per batch. Hanya batch yang berubah
              yang disimpan.
            </p>
          </div>
          <TooltipButton
            onClick={onClose}
            label="Tutup"
            className=""
            style={{
              background: surface,
              border: "none",
              borderRadius: "8px",
              padding: "10px",
              cursor: "pointer",
              color: text,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: "40px",
              minHeight: "40px",
            }}
          >
            <X size={20} />
          </TooltipButton>
        </div>

        {/* Body: 2-pane */}
        <div
          style={{
            flex: 1,
            display: "flex",
            overflow: "hidden",
            flexDirection: isMobile ? "column" : "row",
          }}
        >
          {/* LEFT — product list */}
          <div
            style={{
              width: isMobile ? "100%" : "320px",
              borderRight: isMobile ? "none" : `1px solid ${border}`,
              borderBottom: isMobile ? `1px solid ${border}` : "none",
              background: surface,
              display: "flex",
              flexDirection: "column",
              maxHeight: isMobile ? "180px" : "auto",
            }}
          >
            <div
              style={{ padding: "12px", borderBottom: `1px solid ${border}` }}
            >
              <div
                style={{ display: "flex", gap: "8px", alignItems: "center" }}
              >
                <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
                  <Search
                    size={14}
                    style={{
                      position: "absolute",
                      left: "12px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: sub,
                    }}
                  />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari produk..."
                    className="ui-form-field ui-focus-ring"
                    style={{
                      width: "100%",
                      padding: "8px 12px 8px 34px",
                      border: `1px solid ${border}`,
                      borderRadius: "10px",
                      background: bg,
                      color: text,
                      fontSize: "13px",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActionError("");
                    setScannerOpen(true);
                  }}
                  aria-label="Scan barcode produk untuk opname"
                  className="ui-motion-button ui-focus-ring"
                  style={{
                    minHeight: "36px",
                    padding: "8px 11px",
                    border: `1px solid ${border}`,
                    borderRadius: "10px",
                    background: bg,
                    color: text,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "12px",
                    fontWeight: "800",
                    flexShrink: 0,
                  }}
                >
                  <Camera size={14} /> Scan
                </button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: "auto" }}>
              {filteredProducts.map((p) => {
                const productInputCount = Object.values(inputs).filter(
                  (v) => v.product_id === p.id && v.physical_qty !== "",
                ).length;
                const isSelected = selectedProductId === p.id;
                const isHighlighted = highlightProductId === p.id;
                return (
                  <button
                    key={p.id}
                    ref={(el) => {
                      if (el) productRowRefs.current[p.id] = el;
                    }}
                    onClick={() => setSelectedProductId(p.id)}
                    className="ui-motion-card ui-focus-ring"
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      textAlign: "left",
                      background: isHighlighted
                        ? "color-mix(in srgb, var(--color-success) 13%, transparent)"
                        : isSelected
                          ? "var(--color-primary-soft)"
                          : "transparent",
                      border: "none",
                      borderLeft: isSelected
                        ? "3px solid var(--color-primary)"
                        : "3px solid transparent",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      boxShadow: isHighlighted
                        ? "inset 0 0 0 1px color-mix(in srgb, var(--color-success) 40%, transparent)"
                        : "none",
                      transition: `${uiTransition("background", UI_MOTION.duration.base)}, ${uiTransition("box-shadow", UI_MOTION.duration.base)}`,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          margin: 0,
                          fontSize: "13px",
                          fontWeight: "600",
                          color: text,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p.name}
                      </p>
                      <p
                        style={{
                          margin: "2px 0 0",
                          fontSize: "11px",
                          color: sub,
                        }}
                      >
                        {p.code || "—"} · Stok: {p.total_stock || 0}
                      </p>
                    </div>
                    {productInputCount > 0 && (
                      <span
                        style={{
                          background: "var(--color-success)",
                          color: "#FFF",
                          fontSize: "10px",
                          fontWeight: "700",
                          padding: "2px 6px",
                          borderRadius: "8px",
                        }}
                      >
                        {productInputCount}
                      </span>
                    )}
                    <ChevronRight
                      size={14}
                      style={{ color: sub, flexShrink: 0 }}
                    />
                  </button>
                );
              })}
              {filteredProducts.length === 0 && (
                <p
                  style={{
                    padding: "20px",
                    fontSize: "12px",
                    color: sub,
                    textAlign: "center",
                  }}
                >
                  Tidak ditemukan
                </p>
              )}
            </div>
          </div>

          {/* RIGHT — batch input area */}
          <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
            {!selectedProduct && (
              <div
                style={{ textAlign: "center", color: sub, paddingTop: "60px" }}
              >
                <ClipboardCheck
                  size={40}
                  style={{ color: sub, opacity: 0.4 }}
                />
                <p style={{ marginTop: "12px", fontSize: "14px" }}>
                  Pilih produk dari list kiri untuk mulai opname
                </p>
              </div>
            )}
            {selectedProduct && (
              <>
                <div
                  style={{
                    marginBottom: "16px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "12px",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3
                      style={{ margin: 0, fontSize: "17px", fontWeight: "700" }}
                    >
                      {selectedProduct.name}
                    </h3>
                    <div
                      style={{
                        margin: "2px 0 0",
                        fontSize: "12px",
                        color: sub,
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        flexWrap: "wrap",
                      }}
                    >
                      {editingCode ? (
                        <>
                          <input
                            value={codeInput}
                            onChange={(e) => setCodeInput(e.target.value)}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter")
                                handleSaveCode(selectedProduct);
                              if (e.key === "Escape") setEditingCode(false);
                            }}
                            placeholder="Kode produk"
                            className="ui-form-field ui-focus-ring"
                            style={{
                              padding: "3px 8px",
                              border: `1px solid ${border}`,
                              borderRadius: "6px",
                              background: bg,
                              color: text,
                              fontSize: "12px",
                              width: "120px",
                              outline: "none",
                            }}
                          />
                          <TooltipButton
                            onClick={() => handleSaveCode(selectedProduct)}
                            label="Simpan kode"
                            className=""
                            style={{
                              ...iconBtnStyle,
                              width: "24px",
                              height: "24px",
                              color: "var(--color-success)",
                            }}
                          >
                            <Check size={13} />
                          </TooltipButton>
                          <TooltipButton
                            onClick={() => setEditingCode(false)}
                            label="Batal"
                            className=""
                            style={{
                              ...iconBtnStyle,
                              width: "24px",
                              height: "24px",
                            }}
                          >
                            <X size={13} />
                          </TooltipButton>
                        </>
                      ) : (
                        <>
                          <span>
                            {(codeMap[selectedProduct.id] ??
                              selectedProduct.code) ||
                              "—"}
                          </span>
                          <TooltipButton
                            onClick={() => {
                              setCodeInput(
                                codeMap[selectedProduct.id] ??
                                  selectedProduct.code ??
                                  "",
                              );
                              setEditingCode(true);
                              setActionError("");
                            }}
                            label="Edit kode produk"
                            className=""
                            style={{
                              ...iconBtnStyle,
                              width: "22px",
                              height: "22px",
                            }}
                          >
                            <Pencil size={11} />
                          </TooltipButton>
                        </>
                      )}
                      <span>
                        · Total sistem: {selectedProduct.total_stock || 0}{" "}
                        {selectedProduct.unit}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setActionError("");
                      setBatchModal({ mode: "add" });
                    }}
                    className="btn-primary ui-motion-button ui-focus-ring"
                    data-magnetic="true"
                    style={{
                      padding: "8px 14px",
                      background: "var(--color-primary)",
                      color: "#FFF",
                      border: "none",
                      borderRadius: "8px",
                      fontSize: "12px",
                      fontWeight: "600",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      flexShrink: 0,
                    }}
                  >
                    <Plus size={14} /> Batch Baru
                  </button>
                </div>
                {actionError && (
                  <p
                    style={{
                      margin: "0 0 10px",
                      color: "var(--color-danger)",
                      fontSize: "12px",
                    }}
                  >
                    {actionError}
                  </p>
                )}
                {loadingBatches && (
                  <p style={{ color: sub, fontSize: "13px" }}>
                    Memuat batch...
                  </p>
                )}
                {!loadingBatches && currentBatches.length === 0 && (
                  <div
                    style={{
                      padding: "24px",
                      background: surface,
                      borderRadius: "12px",
                      textAlign: "center",
                      color: sub,
                      fontSize: "13px",
                    }}
                  >
                    <p style={{ margin: "0 0 12px" }}>
                      Belum ada batch untuk produk ini.
                    </p>
                    <button
                      onClick={() => {
                        setActionError("");
                        setBatchModal({ mode: "add" });
                      }}
                      className="btn-primary ui-motion-button ui-focus-ring"
                      data-magnetic="true"
                      style={{
                        padding: "8px 16px",
                        background: "var(--color-primary)",
                        color: "#FFF",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "12px",
                        fontWeight: "600",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <Plus size={14} /> Tambah Batch Pertama
                    </button>
                  </div>
                )}
                <div style={{ display: "grid", gap: "10px" }}>
                  {currentBatches.map((b) => {
                    const input = inputs[b.id] || {};
                    const physicalQty = input.physical_qty;
                    const hasInput =
                      physicalQty !== "" && physicalQty !== undefined;
                    const diff = hasInput
                      ? parseInt(physicalQty) - b.qty_current
                      : 0;
                    const diffColor =
                      diff > 0
                        ? "var(--color-success)"
                        : diff < 0
                          ? "var(--color-danger)"
                          : sub;
                    const eb = expiryBadge(b.expired_date, sub);
                    return (
                      <div
                        key={b.id}
                        className="ui-hover-delight"
                        style={{
                          padding: "12px",
                          background: surface,
                          borderRadius: "12px",
                          border: `1px solid ${border}`,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            marginBottom: "10px",
                            gap: "8px",
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p
                              style={{
                                margin: 0,
                                fontSize: "14px",
                                fontWeight: "600",
                              }}
                            >
                              {b.batch_no || (
                                <em style={{ color: sub }}>
                                  (tanpa no. batch)
                                </em>
                              )}
                            </p>
                            <span
                              style={{
                                display: "inline-block",
                                marginTop: "4px",
                                padding: "2px 8px",
                                borderRadius: "6px",
                                background: eb.bg,
                                color: eb.color,
                                fontSize: "11px",
                                fontWeight: "600",
                              }}
                            >
                              {eb.text}
                            </span>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              flexShrink: 0,
                            }}
                          >
                            {hasInput && diff !== 0 && (
                              <span
                                style={{
                                  fontSize: "13px",
                                  fontWeight: "700",
                                  color: diffColor,
                                  marginRight: "4px",
                                }}
                              >
                                {diff > 0 ? "+" : ""}
                                {diff}
                              </span>
                            )}
                            <TooltipButton
                              onClick={() => {
                                setActionError("");
                                setAdjustFor(b);
                                setAdjustForm({
                                  new_qty: b.qty_current,
                                  reason: "",
                                });
                              }}
                              label="Adjust qty (dengan alasan audit)"
                              style={iconBtnStyle}
                            >
                              <Sliders size={13} />
                            </TooltipButton>
                            <TooltipButton
                              onClick={() => {
                                setActionError("");
                                setBatchModal({ mode: "edit", batch: b });
                              }}
                              label="Edit metadata batch (no/ED/HNA/notes)"
                              style={iconBtnStyle}
                            >
                              <Pencil size={13} />
                            </TooltipButton>
                            <TooltipButton
                              onClick={() => handleDelete(b)}
                              label="Hapus batch (stok akan di-nol-kan dan dicatat bila masih ada)"
                              style={{
                                ...iconBtnStyle,
                                color: "var(--color-danger)",
                                borderColor:
                                  "color-mix(in srgb, var(--color-danger) 20%, transparent)",
                              }}
                            >
                              <Trash2 size={13} />
                            </TooltipButton>
                          </div>
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr 2fr",
                            gap: "8px",
                            alignItems: "end",
                          }}
                        >
                          <div>
                            <label
                              style={{
                                display: "block",
                                fontSize: "10px",
                                fontWeight: "700",
                                color: sub,
                                textTransform: "uppercase",
                                marginBottom: "4px",
                              }}
                            >
                              Sistem
                            </label>
                            <div
                              style={{
                                padding: "8px 10px",
                                background: bg,
                                border: `1px solid ${border}`,
                                borderRadius: "8px",
                                fontSize: "14px",
                                fontWeight: "600",
                              }}
                            >
                              {b.qty_current}
                            </div>
                          </div>
                          <div>
                            <label
                              style={{
                                display: "block",
                                fontSize: "10px",
                                fontWeight: "700",
                                color: sub,
                                textTransform: "uppercase",
                                marginBottom: "4px",
                              }}
                            >
                              Fisik
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={physicalQty ?? ""}
                              onChange={(e) =>
                                handleInput(b, selectedProduct, e.target.value)
                              }
                              placeholder={String(b.qty_current)}
                              className="ui-form-field ui-focus-ring"
                              style={{
                                width: "100%",
                                padding: "8px 10px",
                                border: `1px solid ${hasInput && diff !== 0 ? diffColor : border}`,
                                borderRadius: "8px",
                                background: bg,
                                color: text,
                                fontSize: "14px",
                                fontWeight: "600",
                                outline: "none",
                                boxSizing: "border-box",
                              }}
                            />
                            <div
                              style={{
                                display: "flex",
                                gap: "4px",
                                marginTop: "6px",
                              }}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setBatchPhysical(
                                    b,
                                    selectedProduct,
                                    b.qty_current,
                                  )
                                }
                                className="ui-motion-button ui-focus-ring"
                                style={{
                                  flex: 1,
                                  minHeight: "28px",
                                  border: `1px solid ${border}`,
                                  background: bg,
                                  color: sub,
                                  borderRadius: "7px",
                                  fontSize: "10px",
                                  fontWeight: "700",
                                  cursor: "pointer",
                                }}
                              >
                                Samakan
                              </button>
                              <button
                                type="button"
                                onClick={() => clearBatchPhysical(b.id)}
                                className="ui-motion-button ui-focus-ring"
                                style={{
                                  flex: 1,
                                  minHeight: "28px",
                                  border: `1px solid ${border}`,
                                  background: bg,
                                  color: sub,
                                  borderRadius: "7px",
                                  fontSize: "10px",
                                  fontWeight: "700",
                                  cursor: "pointer",
                                }}
                              >
                                Clear
                              </button>
                            </div>
                          </div>
                          <div>
                            <label
                              style={{
                                display: "block",
                                fontSize: "10px",
                                fontWeight: "700",
                                color: sub,
                                textTransform: "uppercase",
                                marginBottom: "4px",
                              }}
                            >
                              Catatan
                            </label>
                            <input
                              type="text"
                              value={input.notes || ""}
                              onChange={(e) =>
                                handleNotes(b.id, e.target.value)
                              }
                              placeholder="opsional"
                              style={{
                                width: "100%",
                                padding: "8px 10px",
                                border: `1px solid ${border}`,
                                borderRadius: "8px",
                                background: bg,
                                color: text,
                                fontSize: "13px",
                                outline: "none",
                                boxSizing: "border-box",
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: `1px solid ${border}`,
            background: surface,
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div style={{ flex: 1 }}>
            {error && (
              <p
                style={{
                  margin: 0,
                  color: "var(--color-danger)",
                  fontSize: "13px",
                }}
              >
                {error}
              </p>
            )}
            {!error && (
              <p style={{ margin: 0, fontSize: "13px", color: sub }}>
                {changedItems.length === 0 ? (
                  <>
                    Belum ada perubahan ({inputCount} input terisi tapi sama
                    dengan sistem)
                  </>
                ) : (
                  <>
                    <CheckCircle2
                      size={14}
                      style={{
                        display: "inline",
                        verticalAlign: "-2px",
                        color: "var(--color-success)",
                        marginRight: "4px",
                      }}
                    />
                    <strong style={{ color: text }}>
                      {changedItems.length}
                    </strong>{" "}
                    batch berubah di{" "}
                    <strong style={{ color: text }}>
                      {totalProductsChanged}
                    </strong>{" "}
                    produk
                    <span
                      style={{
                        marginLeft: "8px",
                        color:
                          totalDiff > 0
                            ? "var(--color-success)"
                            : totalDiff < 0
                              ? "var(--color-danger)"
                              : sub,
                        fontWeight: "700",
                      }}
                    >
                      Selisih total {totalDiff > 0 ? "+" : ""}
                      {totalDiff}
                    </span>
                  </>
                )}
              </p>
            )}
          </div>
          <button
            onClick={handleExportPDF}
            disabled={exporting || changedItems.length === 0}
            title="Cetak Berita Acara Opname"
            className="ui-motion-button ui-focus-ring"
            style={{
              padding: "10px 14px",
              background: bg,
              color: changedItems.length > 0 ? "var(--color-primary)" : sub,
              border: `1px solid ${changedItems.length > 0 ? "var(--color-primary)" : border}`,
              borderRadius: "10px",
              fontWeight: "600",
              fontSize: "13px",
              cursor: changedItems.length === 0 ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <FileText size={14} /> {exporting ? "..." : "Export PDF"}
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            className="ui-motion-button ui-focus-ring"
            style={{
              padding: "10px 18px",
              background: bg,
              color: text,
              border: `1px solid ${border}`,
              borderRadius: "10px",
              fontWeight: "600",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={saving || changedItems.length === 0}
            className="btn-primary ui-motion-button ui-focus-ring"
            data-magnetic="true"
            style={{
              padding: "10px 18px",
              background:
                changedItems.length > 0 ? "var(--color-warning)" : sub,
              color: "#FFF",
              border: "none",
              borderRadius: "10px",
              fontWeight: "600",
              fontSize: "13px",
              cursor:
                saving || changedItems.length === 0 ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Menyimpan..." : "Simpan Opname"}
          </button>
        </div>
      </div>

      {/* Nested: BatchFormModal (add/edit metadata) — zIndex 2100 above OpnameModal 2000 */}
      {batchModal && selectedProduct && (
        <BatchFormModal
          mode={batchModal.mode}
          batch={batchModal.batch}
          productId={selectedProduct.id}
          productName={selectedProduct.name}
          isDarkMode={isDarkMode}
          onClose={() => setBatchModal(null)}
          onSaved={async () => {
            await refetchBatches(selectedProduct.id);
            setBatchModal(null);
          }}
        />
      )}

      {/* Nested: Adjust qty dialog — zIndex 2100 sibling */}
      {adjustFor && (
        <div
          onClick={(e) => e.target === e.currentTarget && setAdjustFor(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 2100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div
            className="ui-motion-modal ui-modal-shell"
            style={{
              background: bg,
              color: text,
              borderRadius: "16px",
              padding: "20px",
              width: "100%",
              maxWidth: "380px",
              boxShadow: "0 32px 64px rgba(0,0,0,0.35)",
            }}
          >
            <h3
              style={{ margin: "0 0 4px", fontSize: "16px", fontWeight: "700" }}
            >
              Adjust Qty Batch
            </h3>
            <p style={{ margin: "0 0 14px", fontSize: "12px", color: sub }}>
              {adjustFor.batch_no || "(tanpa no. batch)"} · sistem saat ini:{" "}
              <strong style={{ color: text }}>{adjustFor.qty_current}</strong>
            </p>
            <label
              style={{
                display: "block",
                fontSize: "11px",
                color: sub,
                marginBottom: "4px",
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Qty Baru
            </label>
            <input
              type="number"
              min="0"
              value={adjustForm.new_qty}
              onChange={(e) =>
                setAdjustForm({ ...adjustForm, new_qty: e.target.value })
              }
              style={{
                width: "100%",
                padding: "10px 12px",
                border: `1px solid ${border}`,
                borderRadius: "10px",
                background: bg,
                color: text,
                fontSize: "14px",
                fontWeight: "600",
                outline: "none",
                marginBottom: "12px",
                boxSizing: "border-box",
              }}
            />
            <label
              style={{
                display: "block",
                fontSize: "11px",
                color: sub,
                marginBottom: "4px",
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Alasan *
            </label>
            <input
              type="text"
              value={adjustForm.reason}
              onChange={(e) =>
                setAdjustForm({ ...adjustForm, reason: e.target.value })
              }
              placeholder="contoh: koreksi data, rusak, hilang"
              style={{
                width: "100%",
                padding: "10px 12px",
                border: `1px solid ${border}`,
                borderRadius: "10px",
                background: bg,
                color: text,
                fontSize: "13px",
                outline: "none",
                marginBottom: "14px",
                boxSizing: "border-box",
              }}
            />
            {actionError && (
              <p
                style={{
                  color: "var(--color-danger)",
                  fontSize: "12px",
                  margin: "0 0 10px",
                }}
              >
                {actionError}
              </p>
            )}
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => {
                  setAdjustFor(null);
                  setActionError("");
                }}
                className="ui-motion-button ui-focus-ring"
                style={{
                  flex: 1,
                  padding: "10px",
                  background: surface,
                  color: text,
                  border: `1px solid ${border}`,
                  borderRadius: "10px",
                  fontWeight: "600",
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                Batal
              </button>
              <button
                onClick={handleAdjustSubmit}
                className="ui-motion-button ui-focus-ring"
                style={{
                  flex: 1,
                  padding: "10px",
                  background: "var(--color-primary)",
                  color: "#FFF",
                  border: "none",
                  borderRadius: "10px",
                  fontWeight: "600",
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
      {scannerOpen && (
        <BarcodeScanner
          isDarkMode={isDarkMode}
          onClose={() => setScannerOpen(false)}
          onScan={handleScanProduct}
        />
      )}

      {/* AUDIT-UX-03: Delete Batch Confirm Modal — ganti window.confirm */}
      <ConfirmModal
        isOpen={!!deleteBatchConfirm}
        onClose={() => setDeleteBatchConfirm(null)}
        onConfirm={executeDeleteBatch}
        title="Hapus Batch"
        message={
          deleteBatchConfirm
            ? `Hapus batch "${deleteBatchConfirm.batch_no || "(tanpa no)"}"?${
                deleteBatchConfirm.qty_current > 0
                  ? ` Sisa stok ${deleteBatchConfirm.qty_current} akan di-nol-kan & dihapus.`
                  : ""
              }`
            : ""
        }
        isDarkMode={isDarkMode}
      />
    </div>
  );
  return typeof document === "undefined"
    ? modal
    : createPortal(modal, document.body);
}
