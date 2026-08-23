// v1.47.0: Master Distributor — halaman list + CRUD (mirip Master Customer).
// Data via TanStack Query (useDistributors), dibagi dengan Faktur/SP.
import React, { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { Plus, Phone, User, Tag } from "lucide-react";
import { distributorsAPI } from "../services/api";
import { useDistributors } from "../hooks/useMasterData";
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
import {
  normalizeIndonesianPhone,
  copyTextToClipboard,
} from "../utils/waMessage";

const renderPortal = (node) =>
  typeof document === "undefined" ? node : createPortal(node, document.body);

const blankForm = () => ({
  name: "",
  short_code: "",
  salesman_name: "",
  salesman_phone: "",
});

export default function DistributorList({
  isDarkMode,
  isSidebarOpen,
  isMobile,
}) {
  const {
    data: distributors = [],
    isLoading: loading,
    refetch: refetchDistributors,
  } = useDistributors();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [showModal, setShowModal] = useState(false);
  const [editName, setEditName] = useState(null); // nama lama saat edit
  const [form, setForm] = useState(blankForm());
  const [toast, setToast] = useState("");
  const [toastType, setToastType] = useState("success");
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { name }
  const [isSaving, setIsSaving] = useState(false);

  const cardBg = "var(--color-surface)";
  const surface = "var(--color-surface-elevated)";
  const border = "var(--color-border)";
  const text = "var(--color-text)";
  const sub = "var(--color-text-subtle)";
  useBodyScrollLock(showModal || !!deleteConfirm);

  const flash = (msg, type = "success") => {
    setToast(msg);
    setToastType(type);
    setTimeout(
      () => setToast(""),
      type === "error"
        ? UI_MOTION.duration.toastError
        : UI_MOTION.duration.toastSuccess,
    );
  };

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    const list = q
      ? distributors.filter(
          (d) =>
            d.name?.toLowerCase().includes(q) ||
            (d.short_code || "").toLowerCase().includes(q) ||
            (d.salesman_name || "").toLowerCase().includes(q),
        )
      : distributors;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [distributors, debouncedSearch]);

  const openAdd = () => {
    setEditName(null);
    setForm(blankForm());
    setShowModal(true);
  };
  const openEdit = (d) => {
    setEditName(d.name);
    setForm({
      name: d.name || "",
      short_code: d.short_code || "",
      salesman_name: d.salesman_name || "",
      salesman_phone: d.salesman_phone || "",
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    const name = form.name.trim();
    if (!name) {
      flash("Nama distributor wajib diisi", "error");
      return;
    }
    // cegah duplikat nama (kecuali dirinya sendiri saat edit)
    const dup = distributors.some(
      (d) =>
        d.name.toLowerCase() === name.toLowerCase() &&
        d.name.toLowerCase() !== (editName || "").toLowerCase(),
    );
    if (dup) {
      flash("Nama distributor sudah ada", "error");
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        name,
        short_code: form.short_code.trim() || null,
        salesman_name: form.salesman_name.trim() || null,
        salesman_phone: form.salesman_phone.trim() || null,
      };
      if (editName) await distributorsAPI.update(editName, payload);
      else await distributorsAPI.add(payload);
      await refetchDistributors();
      setShowModal(false);
      flash(editName ? "Distributor diperbarui" : "Distributor ditambahkan");
    } catch (e) {
      flash(e.response?.data?.error || e.message, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    const name = deleteConfirm?.name;
    setDeleteConfirm(null);
    if (!name) return;
    try {
      await distributorsAPI.remove(name);
      await refetchDistributors();
      flash("Distributor dihapus");
    } catch (e) {
      flash(e.response?.data?.error || e.message, "error");
    }
  };

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

  const waLink = (phone) => {
    const n = normalizeIndonesianPhone(phone);
    return n ? `https://wa.me/${n}` : null;
  };

  return (
    <div
      className="ui-motion-page"
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
        color: text,
      }}
    >
      <Breadcrumb
        title="Master Distributor"
        count={loading ? "…" : `${distributors.length} distributor terdaftar`}
        isMobile={isMobile}
        isDarkMode={isDarkMode}
        rightSlot={
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
            <Plus size={18} /> Tambah Distributor
          </button>
        }
      />

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
          placeholder="Cari nama, kode, atau sales..."
          ariaLabel="Cari distributor"
          style={{ flex: "1 1 280px", maxWidth: "480px" }}
          inputStyle={{
            backgroundColor: surface,
            borderColor: border,
            color: text,
          }}
        />
      </div>

      {loading ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? "1fr"
              : "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "14px",
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} height={120} />
          ))}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? "1fr"
              : "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "14px",
          }}
        >
          {filtered.map((d) => {
            const wa = waLink(d.salesman_phone);
            return (
              <div
                key={d.id || d.name}
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
                      {d.name}
                    </div>
                    {d.short_code ? (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          fontSize: "10px",
                          fontWeight: "700",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          backgroundColor: "var(--color-primary-soft)",
                          color: "var(--color-primary)",
                        }}
                      >
                        <Tag size={10} /> {d.short_code}
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: "600",
                          color: sub,
                          fontStyle: "italic",
                        }}
                      >
                        Tanpa kode
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "4px" }}>
                    <button
                      onClick={() => openEdit(d)}
                      aria-label={`Edit distributor ${d.name}`}
                      title="Edit"
                      className="ui-motion-button ui-focus-ring"
                      style={iconBtnStyle}
                    >
                      <Icons.Edit2 size={16} color="var(--color-primary)" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm({ name: d.name })}
                      aria-label={`Hapus distributor ${d.name}`}
                      title="Hapus"
                      className="ui-motion-button ui-focus-ring"
                      style={iconBtnStyle}
                    >
                      <Icons.Trash2 size={16} color="var(--color-danger)" />
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    fontSize: "13px",
                    color: text,
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: "8px" }}
                  >
                    <User size={14} color={sub} />
                    <span>{d.salesman_name || "—"}</span>
                  </div>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: "8px" }}
                  >
                    <Phone size={14} color={sub} />
                    {d.salesman_phone ? (
                      wa ? (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: "var(--color-primary)",
                            textDecoration: "none",
                            fontWeight: 600,
                          }}
                        >
                          {d.salesman_phone}
                        </a>
                      ) : (
                        <button
                          onClick={() => copyTextToClipboard(d.salesman_phone)}
                          style={{
                            background: "none",
                            border: "none",
                            color: text,
                            cursor: "pointer",
                            padding: 0,
                          }}
                          title="Salin nomor"
                        >
                          {d.salesman_phone}
                        </button>
                      )
                    ) : (
                      <span style={{ color: sub }}>—</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ gridColumn: "1 / -1", padding: "1.5rem 1rem" }}>
              <EmptyState
                icon={EmptyStateIcons.users}
                title={
                  search
                    ? "Distributor tidak ditemukan"
                    : "Belum ada distributor"
                }
                description={
                  search
                    ? "Coba kata kunci lain."
                    : "Tambah distributor pertama lewat tombol di atas."
                }
              />
            </div>
          )}
        </div>
      )}

      {showModal &&
        renderPortal(
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
                  {editName ? "✏️ Edit Distributor" : "➕ Tambah Distributor"}
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
                  <label style={labelStyle}>Nama Distributor *</label>
                  <input
                    value={form.name}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, name: e.target.value }))
                    }
                    placeholder="Nama distributor"
                    className="ui-form-field ui-focus-ring"
                    style={inputStyle}
                    autoFocus
                  />
                </div>
                <div>
                  <label style={labelStyle}>Kode Singkat</label>
                  <input
                    value={form.short_code}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, short_code: e.target.value }))
                    }
                    placeholder="mis. KAEF, AAM"
                    className="ui-form-field ui-focus-ring"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Nama Sales</label>
                  <input
                    value={form.salesman_name}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, salesman_name: e.target.value }))
                    }
                    placeholder="Nama salesman"
                    className="ui-form-field ui-focus-ring"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>No. HP Sales</label>
                  <input
                    value={form.salesman_phone}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        salesman_phone: e.target.value.replace(
                          /[^0-9+\-\s]/g,
                          "",
                        ),
                      }))
                    }
                    inputMode="tel"
                    placeholder="08xx xxxx xxxx"
                    className="ui-form-field ui-focus-ring"
                    style={inputStyle}
                  />
                </div>
                <div
                  style={{ display: "flex", gap: "10px", marginTop: "6px" }}
                >
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="ui-motion-button ui-focus-ring"
                    style={{
                      flex: 1,
                      padding: "13px",
                      backgroundColor: isSaving
                        ? "var(--color-text-subtle)"
                        : "var(--color-primary)",
                      color: "#FFF",
                      border: "none",
                      borderRadius: "10px",
                      cursor: isSaving ? "not-allowed" : "pointer",
                      fontWeight: "700",
                      fontSize: "14px",
                      opacity: isSaving ? 0.7 : 1,
                    }}
                  >
                    {isSaving ? "Menyimpan..." : editName ? "Simpan" : "Tambah"}
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
          </div>,
        )}

      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="Hapus Distributor"
        message={`Yakin hapus distributor "${deleteConfirm?.name}"? Tindakan ini tidak bisa dibatalkan.`}
        confirmLabel="Hapus"
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        isDarkMode={isDarkMode}
      />

      <ToastNotice message={toast} type={toastType} isMobile={isMobile} />
    </div>
  );
}
