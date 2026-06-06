import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Plus,
  Phone,
  MapPin,
  FileText,
  AlertCircle,
} from "lucide-react";
import { customersAPI } from "../services/api";
import Skeleton from "./common/Skeleton";
import ConfirmModal from "./common/ConfirmModal";
import Breadcrumb from "./common/Breadcrumb";
import EmptyState, { EmptyStateIcons } from "./common/EmptyState";
import Icons from "./common/Icon";
import { UI_MOTION, uiTransition } from "../constants/ui";
import useBodyScrollLock from "../hooks/useBodyScrollLock";
import SearchBox from "./common/SearchBox";
import ToastNotice from "./common/ToastNotice";
import useDebouncedValue from "../hooks/useDebouncedValue";

const fmtRp = (n) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(parseFloat(n) || 0);
const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "-";

const renderPortal = (node) =>
  typeof document === "undefined" ? node : createPortal(node, document.body);

export default function CustomerList({
  isDarkMode,
  isSidebarOpen,
  isMobile,
  isVantaMode,
}) {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [sortBy, setSortBy] = useState("name_asc"); // name_asc | name_desc | most_active | top_spender | oldest
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({
    name: "",
    address: "",
    phone: "",
    type: "offline",
  });
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const bg = "var(--color-bg)";
  const cardBg = "var(--color-surface)";
  const surface = "var(--color-surface-elevated)";
  const border = "var(--color-border)";
  const text = "var(--color-text)";
  const sub = "var(--color-text-subtle)";
  useBodyScrollLock(showModal || !!deleteConfirmId);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const { data } = await customersAPI.getAll();
      setCustomers(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    const list = customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone || "").includes(debouncedSearch) ||
        (c.address || "").toLowerCase().includes(q),
    );
    const sorted = [...list].sort((a, b) => {
      switch (sortBy) {
        case "name_asc":
          return a.name.localeCompare(b.name);
        case "name_desc":
          return b.name.localeCompare(a.name);
        case "most_active":
          return (b.total_orders || 0) - (a.total_orders || 0);
        case "top_spender":
          return (
            (parseFloat(b.total_spent) || 0) - (parseFloat(a.total_spent) || 0)
          );
        case "oldest":
          return (
            new Date(a.last_sale_date || 0) - new Date(b.last_sale_date || 0)
          );
        default:
          return 0;
      }
    });
    return sorted;
  }, [customers, debouncedSearch, sortBy]);

  const openAdd = () => {
    setEditId(null);
    setForm({ name: "", address: "", phone: "", type: "offline" });
    setShowModal(true);
  };
  const openEdit = (c) => {
    setEditId(c.id);
    setForm({
      name: c.name,
      address: c.address || "",
      phone: c.phone || "",
      type: c.type || "offline",
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      flash("Nama customer wajib diisi");
      return;
    }
    setIsSaving(true);
    try {
      if (editId) {
        await customersAPI.update(editId, form);
        flash("Customer diperbarui");
      } else {
        await customersAPI.create(form);
        flash("Customer ditambahkan");
      }
      setShowModal(false);
      fetchCustomers();
    } catch (e) {
      flash(e.response?.data?.error || e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (id) => setDeleteConfirmId(id);
  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await customersAPI.remove(deleteConfirmId);
      flash("Customer dihapus");
      fetchCustomers();
    } catch (e) {
      flash(e.response?.data?.error || e.message);
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), UI_MOTION.duration.toastSuccess);
  };

  useEffect(() => {
    if (!showModal) return;
    const onKey = (e) => {
      if (e.key === "Escape") setShowModal(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showModal]);

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    border: `1px solid ${border}`,
    borderRadius: "10px",
    backgroundColor: surface,
    color: text,
    fontSize: "14px",
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

  // Compress big numbers (1.2M, 870K)
  const compact = (n) => {
    const v = parseFloat(n) || 0;
    if (v >= 1_000_000)
      return `Rp ${(v / 1_000_000).toFixed(1).replace(".0", "")}M`;
    if (v >= 1_000) return `Rp ${(v / 1_000).toFixed(0)}K`;
    return fmtRp(v);
  };

  return (
    <div
      className="ui-motion-page"
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
        color: text,
      }}
    >
      <Breadcrumb
        title="Master Customer"
        isMobile={isMobile}
        isDarkMode={isDarkMode}
      />

      {/* Header */}
      <div
        className="ui-surface-panel"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
          flexWrap: "wrap",
          gap: "12px",
          padding: isMobile ? "16px" : "18px 20px",
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
            👥 Master Customer
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: "14px", color: sub }}>
            {loading ? (
              <Skeleton width="160px" height="14px" />
            ) : (
              `${customers.length} customer terdaftar`
            )}
          </p>
        </div>
        <button
          onClick={openAdd}
          className="btn-primary ui-motion-button ui-focus-ring"
          data-magnetic="true"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            minHeight: "44px",
            padding: "10px 18px",
            backgroundColor: "var(--color-primary)",
            color: "#FFF",
            border: "none",
            borderRadius: "12px",
            cursor: "pointer",
            fontWeight: "700",
            fontSize: "14px",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <Plus size={18} /> Tambah Customer
        </button>
      </div>

      {/* Search + Sort */}
      <div
        className="ui-surface-panel"
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          alignItems: "center",
          padding: "12px",
        }}
      >
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Cari nama, telepon, atau alamat..."
          ariaLabel="Cari customer"
          style={{ flex: "1 1 280px", maxWidth: "480px" }}
          inputStyle={{
            backgroundColor: inputStyle.backgroundColor,
            borderColor: border,
            color: text,
          }}
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          style={{
            ...inputStyle,
            width: "auto",
            minWidth: "180px",
            cursor: "pointer",
            paddingRight: "32px",
          }}
        >
          <option value="name_asc">📝 Nama A → Z</option>
          <option value="name_desc">📝 Nama Z → A</option>
          <option value="most_active">🔥 Paling Aktif</option>
          <option value="top_spender">💰 Transaksi Terbesar</option>
          <option value="oldest">⏱ Terlama Bertransaksi</option>
        </select>
      </div>

      {/* Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile
            ? "1fr"
            : "repeat(auto-fill, minmax(320px, 1fr))",
          gap: "12px",
        }}
      >
        {loading ? (
          [1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="ui-surface-panel ui-motion-card"
              style={{
                backgroundColor: cardBg,
                border: `1px solid ${border}`,
                padding: "16px 18px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "12px",
                }}
              >
                <Skeleton width="60%" height="20px" />
                <div style={{ display: "flex", gap: "4px" }}>
                  <Skeleton width="24px" height="24px" />
                  <Skeleton width="24px" height="24px" />
                </div>
              </div>
              <Skeleton
                width="80%"
                height="14px"
                style={{ marginBottom: "8px" }}
              />
              <Skeleton
                width="40%"
                height="14px"
                style={{ marginBottom: "12px" }}
              />
              <Skeleton width="60px" height="18px" borderRadius="4px" />
            </div>
          ))
        ) : (
          <>
            {filtered.map((c) => {
              const incomplete = !c.phone && !c.address;
              const totalOrders = parseInt(c.total_orders) || 0;
              const totalSpent = parseFloat(c.total_spent) || 0;
              const hasActivity = totalOrders > 0;
              return (
                <div
                  key={c.id}
                  className="ui-surface-panel ui-hover-delight"
                  style={{
                    backgroundColor: cardBg,
                    border: `1px solid ${border}`,
                    padding: "16px 18px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  {/* Header */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "8px",
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: "15px",
                          fontWeight: "700",
                          color: text,
                          marginBottom: "6px",
                          wordBreak: "break-word",
                        }}
                      >
                        {c.name}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: "6px",
                          flexWrap: "wrap",
                          alignItems: "center",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "10px",
                            fontWeight: "700",
                            padding: "2px 8px",
                            borderRadius: "4px",
                            backgroundColor:
                              c.type === "reseller"
                                ? "var(--color-warning-soft)"
                                : c.type === "institusi"
                                  ? "var(--color-primary-hover)18"
                                  : "var(--color-primary-soft)",
                            color:
                              c.type === "reseller"
                                ? "var(--color-warning)"
                                : c.type === "institusi"
                                  ? "var(--color-primary-hover)"
                                  : "var(--color-primary)",
                          }}
                        >
                          {c.type === "reseller"
                            ? "Reseller"
                            : c.type === "institusi"
                              ? "Institusi"
                              : "Offline"}
                        </span>
                        {!hasActivity && (
                          <span
                            style={{
                              fontSize: "10px",
                              fontWeight: "600",
                              color: sub,
                              fontStyle: "italic",
                            }}
                          >
                            Belum ada transaksi
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "4px" }}>
                      <button
                        onClick={() => openEdit(c)}
                        aria-label={`Edit customer ${c.name}`}
                        title="Edit"
                        className="ui-motion-button ui-focus-ring"
                        style={iconBtnStyle}
                      >
                        <Icons.Edit2 size={16} color="var(--color-primary)" />
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
                        aria-label={`Hapus customer ${c.name}`}
                        title="Hapus"
                        className="ui-motion-button ui-focus-ring"
                        style={iconBtnStyle}
                      >
                        <Icons.Trash2 size={16} color="var(--color-danger)" />
                      </button>
                    </div>
                  </div>

                  {/* Contact info */}
                  {(c.phone || c.address) && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px",
                      }}
                    >
                      {c.phone && (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            fontSize: "13.5px",
                            fontWeight: "500",
                            color: isDarkMode
                              ? "var(--color-text-muted)"
                              : "var(--color-border-strong)",
                          }}
                        >
                          <Phone
                            size={14}
                            style={{ color: sub, flexShrink: 0 }}
                          />{" "}
                          {c.phone}
                        </div>
                      )}
                      {c.address && (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "6px",
                            fontSize: "13.5px",
                            fontWeight: "500",
                            color: isDarkMode
                              ? "var(--color-text-muted)"
                              : "var(--color-border-strong)",
                            lineHeight: "1.45",
                          }}
                        >
                          <MapPin
                            size={14}
                            style={{
                              marginTop: "2px",
                              flexShrink: 0,
                              color: sub,
                            }}
                          />{" "}
                          <span>{c.address}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Incomplete warning (clickable) */}
                  {incomplete && (
                    <button
                      onClick={() => openEdit(c)}
                      aria-label="Lengkapi data customer"
                      style={{
                        background: isDarkMode
                          ? "var(--color-warning-soft)"
                          : "var(--color-warning-soft)",
                        border: "none",
                        borderRadius: "8px",
                        padding: "8px 10px",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        color: "#FF9F0A",
                        fontSize: "11px",
                        fontWeight: "600",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <AlertCircle size={14} />
                      <span>Lengkapi telepon & alamat →</span>
                    </button>
                  )}

                  {/* Metadata badges */}
                  <div
                    style={{
                      display: "flex",
                      gap: "6px",
                      flexWrap: "wrap",
                      borderTop: `1px solid ${border}`,
                      paddingTop: "10px",
                      marginTop: "auto",
                    }}
                  >
                    <MetaBadge
                      icon={FileText}
                      label={`${totalOrders} nota`}
                      color={hasActivity ? "var(--color-success)" : sub}
                      sub={sub}
                      cardBg={surface}
                    />
                    {hasActivity && (
                      <MetaBadge
                        label={compact(totalSpent)}
                        color="var(--color-primary)"
                        sub={sub}
                        cardBg={surface}
                      />
                    )}
                    {c.last_sale_date && (
                      <MetaBadge
                        label={`Last: ${fmtDate(c.last_sale_date)}`}
                        color={sub}
                        sub={sub}
                        cardBg={surface}
                      />
                    )}
                  </div>
                </div>
              );
            })}
            {!filtered.length && !loading && (
            <div style={{ gridColumn: "1 / -1", padding: "1.5rem 1rem" }}>
              <EmptyState
                compact
                icon={EmptyStateIcons.users}
                title={
                  search
                    ? `Tidak ada hasil untuk '${search}'`
                    : "Belum ada customer terdaftar"
                }
                description={
                  search
                    ? "Coba kata kunci lain atau reset filter."
                    : "Data customer yang aktif akan tampil di sini untuk memudahkan transaksi berikutnya."
                }
                action={
                  !search ? (
                    <button
                      onClick={openAdd}
                      className="btn-primary ui-motion-button ui-focus-ring"
                      data-magnetic="true"
                      style={{
                        marginTop: "4px",
                        padding: "10px 18px",
                        background: "var(--color-primary)",
                        color: "#FFF",
                        border: "none",
                        borderRadius: "10px",
                        cursor: "pointer",
                        fontWeight: "700",
                        fontSize: "13px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <Plus size={14} /> Tambah Customer Pertama
                    </button>
                  ) : null
                }
              />
            </div>
            )}
          </>
        )}
      </div>

      {/* Modal */}
      {showModal && renderPortal(
        <div
          onClick={() => setShowModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15,23,42,0.58)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "1rem",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="ui-motion-modal ui-modal-shell ui-surface-panel"
            style={{
              backgroundColor: cardBg,
              width: "100%",
              maxWidth: "460px",
              maxHeight: "calc(100dvh - 32px)",
              overflow: "auto",
              border: `1px solid ${border}`,
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
                {editId ? "✏️ Edit Customer" : "➕ Tambah Customer"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                aria-label="Tutup"
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
                <Icons.X size={18} color={sub} />
              </button>
            </div>
            <div
              style={{
                padding: "20px 22px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <div>
                <label style={labelStyle}>Nama *</label>
                <input
                  value={form.name}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="Nama customer"
                  className="ui-form-field ui-focus-ring"
                  style={inputStyle}
                  autoFocus
                />
              </div>
              <div>
                <label style={labelStyle}>Telepon</label>
                <input
                  value={form.phone}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      phone: e.target.value.replace(/[^0-9+\-\s]/g, ""),
                    }))
                  }
                  inputMode="tel"
                  placeholder="08xx xxxx xxxx"
                  className="ui-form-field ui-focus-ring"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Alamat</label>
                <textarea
                  value={form.address}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, address: e.target.value }))
                  }
                  rows={2}
                  placeholder="Alamat"
                  className="ui-form-field ui-focus-ring"
                  style={{
                    ...inputStyle,
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                />
              </div>
              <div>
                <label style={labelStyle}>Tipe</label>
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, type: e.target.value }))
                  }
                  className="ui-form-field ui-focus-ring"
                  style={inputStyle}
                >
                  <option value="offline">Offline</option>
                  <option value="reseller">Reseller</option>
                  <option value="institusi">Institusi</option>
                </select>
              </div>
              <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="ui-motion-button ui-focus-ring"
                  style={{
                    flex: 1,
                    padding: "13px",
                    backgroundColor: isSaving ? "var(--color-text-subtle)" : "var(--color-primary)",
                    color: "#FFF",
                    border: "none",
                    borderRadius: "10px",
                    cursor: isSaving ? "not-allowed" : "pointer",
                    fontWeight: "700",
                    fontSize: "14px",
                    opacity: isSaving ? 0.7 : 1,
                  }}
                >
                  {isSaving ? "Menyimpan..." : editId ? "Simpan" : "Tambah"}
                </button>
                <button
                  onClick={() => setShowModal(false)}
                  className="ui-motion-button ui-focus-ring"
                  style={{
                    flex: 1,
                    padding: "13px",
                    backgroundColor: surface,
                    color: text,
                    border: `1px solid ${border}`,
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
        </div>
      )}

      {/* Delete Confirm Modal */}
      <ConfirmModal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={confirmDelete}
        title="Hapus Customer"
        message="Apakah Anda yakin ingin menghapus customer ini?"
        isDarkMode={isDarkMode}
      />

      <ToastNotice message={toast} type="success" isMobile={isMobile} />
    </div>
  );
}

const iconBtnStyle = {
  background: "var(--color-surface-elevated)",
  border: "1px solid var(--color-border)",
  cursor: "pointer",
  padding: "8px",
  minWidth: "40px",
  minHeight: "40px",
  borderRadius: "10px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: uiTransition("background", UI_MOTION.duration.fast),
};

function MetaBadge({ icon: Icon, label, color, cardBg }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "11px",
        fontWeight: "600",
        color,
        padding: "4px 8px",
        borderRadius: "8px",
        backgroundColor: cardBg,
      }}
    >
      {Icon && <Icon size={11} />} {label}
    </span>
  );
}
