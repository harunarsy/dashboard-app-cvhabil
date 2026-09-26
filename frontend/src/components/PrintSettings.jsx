import React, { useState, useEffect, useRef } from "react";
import { Save, Loader2, Printer, Monitor, Activity } from "lucide-react";
import Skeleton from "./common/Skeleton";
import NotaPreview from "./common/NotaPreview";
import { printSettingsAPI, settingsAPI } from "../services/api";
import Breadcrumb from "./common/Breadcrumb";
import { UI_MOTION, uiTransition } from "../constants/ui";
import SectionHeader from "./common/SectionHeader";
import ToastNotice from "./common/ToastNotice";

// v1.67.20: data contoh untuk Live Preview (pakai komponen NotaPreview asli)
const PREVIEW_FORM = {
  order_number: "HSB-NOTA-0001",
  sale_date: new Date().toISOString().slice(0, 10),
  customer_name: "Contoh Customer",
  customer_phone: "0812-3456-7890",
  customer_address: "Jl. Contoh No. 1, Sidoarjo",
  payment_method: "Tunai",
  channel: "offline",
};
const PREVIEW_ITEMS = [
  { product_name: "Contoh Produk A", qty: 2, qty_in_unit: 2, unit_price: 50000 },
  { product_name: "Contoh Produk B", qty: 1, qty_in_unit: 1, unit_price: 75000 },
];
export default function PrintSettings({
  isDarkMode,
  isSidebarOpen,
  isMobile,
}) {
  const [settings, setSettings] = useState(null);
  const [thresholds, setThresholds] = useState({
    high: 20,
    normal: 5,
    thin: 0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingThresholds, setSavingThresholds] = useState(false);
  const [toast, setToast] = useState("");
  const [loadError, setLoadError] = useState(false);
  const rawLayoutRef = useRef(null);
  const fetchSettings = async () => {
    setLoading(true);
    try {
      const [printResult, thresholdResult] = await Promise.allSettled([
        printSettingsAPI.get(),
        settingsAPI.getProfitThresholds(),
      ]);
      const printData =
        printResult.status === "fulfilled" ? printResult.value?.data : null;
      if (printData && printData.nota_layout) {
        const nl = printData.nota_layout;
        rawLayoutRef.current = { ...nl };
        setSettings({
          company_name: nl.company_name || nl.shop_name || "",
          address: nl.address || "",
          phone: nl.phone || "",
          footer_text: nl.footer_text || nl.footer || "",
          signer_name: nl.signer_name || "",
          bank_info: nl.bank_info || "",
          qris_text: nl.qris_text || "",
          ketentuan: nl.ketentuan || "",
        });
        setLoadError(false);
      } else {
        rawLayoutRef.current = null;
        setLoadError(true);
        setSettings({
          company_name: "",
          address: "",
          phone: "",
          footer_text: "",
          signer_name: "",
          bank_info: "",
          qris_text: "",
          ketentuan: "",
        });
      }
      const rawThresholds =
        thresholdResult.status === "fulfilled"
          ? thresholdResult.value?.data?.profit_thresholds ||
            thresholdResult.value?.data ||
            {}
          : {};
      setThresholds({
        high: Number.isFinite(parseFloat(rawThresholds.high))
          ? parseFloat(rawThresholds.high)
          : 20,
        normal: Number.isFinite(parseFloat(rawThresholds.normal))
          ? parseFloat(rawThresholds.normal)
          : 5,
        thin: Number.isFinite(parseFloat(rawThresholds.thin))
          ? parseFloat(rawThresholds.thin)
          : 0,
      });
    } catch (e) {
      console.error("Error fetching settings:", e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchSettings();
  }, []);
  const handleSave = async () => {
    if (loadError || !rawLayoutRef.current) return;
    setSaving(true);
    try {
      const merged = {
        ...(rawLayoutRef.current || {}),
        company_name: settings.company_name,
        address: settings.address,
        phone: settings.phone,
        footer_text: settings.footer_text,
        signer_name: settings.signer_name,
        bank_info: settings.bank_info,
        qris_text: settings.qris_text,
        ketentuan: settings.ketentuan,
      };
      const payload = { nota_layout: merged };
      await printSettingsAPI.update(payload);
      rawLayoutRef.current = merged;
      setToast("Pengaturan berhasil disimpan");
      setTimeout(() => setToast(""), UI_MOTION.duration.toastSuccess);
    } catch (e) {
      console.error("Update error:", e);
      setToast("Gagal menyimpan pengaturan");
    } finally {
      setSaving(false);
    }
  };
  const handleSaveThresholds = async () => {
    setSavingThresholds(true);
    try {
      await settingsAPI.updateProfitThresholds(thresholds);
      setToast("Ambang profitabilitas berhasil disimpan");
      setTimeout(() => setToast(""), UI_MOTION.duration.toastSuccess);
    } catch (e) {
      console.error("Update thresholds error:", e);
      setToast("Gagal menyimpan ambang profitabilitas");
    } finally {
      setSavingThresholds(false);
    }
  };
  const cardBg = "var(--color-surface)";
  const border = "var(--color-border)";
  const text = "var(--color-text)";
  const sub = "var(--color-text-muted)";
  const inputBg = "var(--color-surface-elevated)";
  if (loading)
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
        }}
      >
        {" "}
        <Breadcrumb
          title="Pengaturan Cetak"
          isMobile={isMobile}
          isDarkMode={isDarkMode}
        />{" "}
        <Skeleton
          width="200px"
          height="32px"
          style={{ marginBottom: "24px" }}
        />{" "}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "24px",
          }}
        >
          {" "}
          <div
            className="ui-motion-card"
            style={{
              backgroundColor: cardBg,
              borderRadius: "16px",
              padding: "24px",
              border: `1px solid ${border}`,
            }}
          >
            {" "}
            <Skeleton
              width="100%"
              height="20px"
              style={{ marginBottom: "16px" }}
            />{" "}
            <Skeleton
              width="100%"
              height="20px"
              style={{ marginBottom: "16px" }}
            />{" "}
            <Skeleton
              width="80%"
              height="20px"
              style={{ marginBottom: "16px" }}
            />{" "}
          </div>{" "}
          <Skeleton height="350px" borderRadius="16px" />{" "}
        </div>{" "}
      </div>
    );
  if (!settings)
    return (
      <div style={{ padding: "40px", textAlign: "center", color: sub }}>
        Gagal memuat pengaturan.
      </div>
    );
  const previewName = settings.company_name || "NAMA TOKO";
  const previewAddr =
    settings.address || "Alamat toko Anda akan muncul di sini";
  const previewPhone = settings.phone || "";
  const previewFooter =
    settings.footer_text || "Dokumen dicetak otomatis oleh Habil Operational";
  const previewKetentuan = settings.ketentuan
    ? settings.ketentuan
        .split("\n")
        .filter((l) => l.trim())
        .slice(0, 2)
    : [];
  const fieldStyle = {
    width: "100%",
    minHeight: "44px",
    padding: "11px 12px",
    borderRadius: "10px",
    border: `1px solid ${border}`,
    backgroundColor: inputBg,
    color: text,
    boxSizing: "border-box",
    fontFamily: "inherit",
  };
  const labelStyle = {
    display: "block",
    fontSize: "11px",
    color: "var(--color-text-muted)",
    marginBottom: "6px",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  };
  const fieldGroupStyle = { minWidth: 0 };
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
      {" "}
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        {" "}
        {/* Page Header */}{" "}
        <div
          className="ui-readable-surface"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "2rem",
            gap: "16px",
            flexWrap: "wrap",
            padding: "18px 20px",
            borderRadius: "18px",
          }}
        >
          {" "}
          <div>
            {" "}
            <h1
              style={{
                fontSize: "28px",
                fontWeight: "700",
                color: text,
                margin: 0,
              }}
            >
              Pengaturan
            </h1>{" "}
            <p style={{ color: sub, margin: "4px 0 0", fontSize: "14px" }}>
              Konfigurasi identitas toko untuk dokumen cetak
            </p>{" "}
          </div>{" "}
          <button
            onClick={handleSave}
            disabled={saving || !!loadError}
            className="btn-primary ui-motion-button ui-focus-ring"
            data-magnetic="true"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              minHeight: "44px",
              padding: "10px 20px",
              backgroundColor: "var(--color-action)",
              color: "#FFF",
              border: "none",
              borderRadius: "10px",
              fontSize: "14px",
              fontWeight: "700",
              cursor: saving ? "wait" : "pointer",
              transition: uiTransition("opacity", UI_MOTION.duration.base),
              opacity: saving ? 0.7 : 1,
            }}
          >
            {" "}
            {saving ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Save size={18} />
            )}{" "}
            {saving ? "Menyimpan..." : "Simpan Perubahan"}{" "}
          </button>{" "}
        </div>{" "}
        {/* Split Layout */}{" "}
        {loadError ? (
          <div
            className="ui-panel ui-motion-card"
            style={{
              backgroundColor: cardBg,
              borderRadius: "16px",
              padding: "40px 24px",
              border: `1px solid ${border}`,
              boxShadow: "var(--shadow-card)",
              textAlign: "center",
            }}
          >
            {" "}
            <p
              style={{
                color: text,
                fontSize: "15px",
                fontWeight: "700",
                margin: "0 0 6px",
              }}
            >
              Gagal memuat pengaturan. Form tidak ditampilkan agar pengaturan
              tersimpan tidak tertimpa.
            </p>{" "}
            <p style={{ color: sub, fontSize: "13px", margin: "0 0 18px" }}>
              Periksa koneksi Anda, lalu coba lagi.
            </p>{" "}
            <button
              onClick={fetchSettings}
              className="btn-primary ui-motion-button ui-focus-ring"
              data-magnetic="true"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                minHeight: "44px",
                padding: "10px 20px",
                backgroundColor: "var(--color-action)",
                color: "#FFF",
                border: "none",
                borderRadius: "10px",
                fontSize: "14px",
                fontWeight: "700",
                cursor: "pointer",
              }}
            >
              {" "}
              Coba lagi{" "}
            </button>{" "}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile
                ? "1fr"
                : "repeat(2, minmax(0, 1fr))",
              gap: "16px",
              alignItems: "start",
            }}
          >
          {" "}
          {/* LEFT — Form Inputs */}{" "}
          <div
            className="ui-panel ui-motion-card"
            style={{
              backgroundColor: cardBg,
              borderRadius: "16px",
              padding: "24px",
              border: `1px solid ${border}`,
              boxShadow: "var(--shadow-card)",
            }}
          >
            {" "}
            <SectionHeader
              title="Nota Layout"
              icon={<Printer size={16} />}
              description="Identitas toko dan catatan yang muncul di dokumen cetak."
            />{" "}
            <div
              className="ui-print-settings__grid"
              style={{
                display: "grid",
                gridTemplateColumns: isMobile
                  ? "1fr"
                  : "repeat(2, minmax(0, 1fr))",
                gap: "16px",
              }}
            >
              <div
                style={{
                  ...fieldGroupStyle,
                  gridColumn: isMobile ? "auto" : "1 / -1",
                }}
              >
                {" "}
                <label style={labelStyle}>NAMA TOKO</label>{" "}
                <input
                  type="text"
                  className="ui-form-field ui-focus-ring"
                  value={settings.company_name}
                  onChange={(e) =>
                    setSettings({ ...settings, company_name: e.target.value })
                  }
                  placeholder="Contoh: CV HABIL SEJAHTERA BERSAMA"
                  style={fieldStyle}
                />{" "}
              </div>{" "}
              <div
                style={{
                  ...fieldGroupStyle,
                  gridColumn: isMobile ? "auto" : "1 / -1",
                }}
              >
                {" "}
                <label style={labelStyle}>ALAMAT</label>{" "}
                <textarea
                  rows={2}
                  className="ui-form-field ui-focus-ring"
                  value={settings.address}
                  onChange={(e) =>
                    setSettings({ ...settings, address: e.target.value })
                  }
                  placeholder="Jl. Contoh No. 1, Surabaya"
                  style={{ ...fieldStyle, resize: "none" }}
                />{" "}
              </div>{" "}
              <div style={fieldGroupStyle}>
                {" "}
                <label style={labelStyle}>NOMOR TELEPON</label>{" "}
                <input
                  type="text"
                  className="ui-form-field ui-focus-ring"
                  value={settings.phone}
                  onChange={(e) =>
                    setSettings({ ...settings, phone: e.target.value })
                  }
                  placeholder="0812-xxxx-xxxx"
                  style={fieldStyle}
                />{" "}
              </div>{" "}
              <div style={fieldGroupStyle}>
                {" "}
                <label style={labelStyle}>NAMA PENANDA TANGAN</label>{" "}
                <input
                  type="text"
                  className="ui-form-field ui-focus-ring"
                  value={settings.signer_name}
                  onChange={(e) =>
                    setSettings({ ...settings, signer_name: e.target.value })
                  }
                  placeholder="Contoh: Harun Al Rasyid, S.Kom"
                  style={fieldStyle}
                />{" "}
                <p style={{ fontSize: "11px", color: sub, marginTop: "6px" }}>
                  Muncul di bawah garis tanda tangan kanan (Hormat kami).
                </p>{" "}
              </div>{" "}
              <div style={fieldGroupStyle}>
                {" "}
                <label style={labelStyle}>
                  INFO REKENING BANK (opsional)
                </label>{" "}
                <input
                  type="text"
                  className="ui-form-field ui-focus-ring"
                  value={settings.bank_info}
                  onChange={(e) =>
                    setSettings({ ...settings, bank_info: e.target.value })
                  }
                  placeholder="Contoh: BCA CV HABIL SEJAHTERA BERSAMA 5603004174"
                  style={fieldStyle}
                />{" "}
              </div>{" "}
              <div style={fieldGroupStyle}>
                {" "}
                <label style={labelStyle}>TEKS QRIS (opsional)</label>{" "}
                <input
                  type="text"
                  className="ui-form-field ui-focus-ring"
                  value={settings.qris_text}
                  onChange={(e) =>
                    setSettings({ ...settings, qris_text: e.target.value })
                  }
                  placeholder="Contoh: ATAU BISA MELALUI QRIS HABIL >>"
                  style={fieldStyle}
                />{" "}
              </div>{" "}
              <div
                style={{
                  ...fieldGroupStyle,
                  gridColumn: isMobile ? "auto" : "1 / -1",
                }}
              >
                {" "}
                <label style={labelStyle}>
                  KETENTUAN / NOTES (opsional)
                </label>{" "}
                <textarea
                  rows={6}
                  className="ui-form-field ui-focus-ring"
                  value={settings.ketentuan}
                  onChange={(e) =>
                    setSettings({ ...settings, ketentuan: e.target.value })
                  }
                  placeholder={
                    "Satu baris = satu poin. Contoh:\nHarap mengecek kembali barang yang diterima\nWajib video unboxing apabila menggunakan ekspedisi"
                  }
                  style={{ ...fieldStyle, resize: "vertical", lineHeight: "1.55" }}
                />{" "}
                <p style={{ fontSize: "11px", color: sub, marginTop: "6px" }}>
                  Satu baris = satu poin ketentuan di nota.
                </p>{" "}
              </div>{" "}
              <div
                style={{
                  ...fieldGroupStyle,
                  gridColumn: isMobile ? "auto" : "1 / -1",
                }}
              >
                {" "}
                <label style={labelStyle}>CATATAN KAKI (FOOTER)</label>{" "}
                <input
                  type="text"
                  className="ui-form-field ui-focus-ring"
                  value={settings.footer_text}
                  onChange={(e) =>
                    setSettings({ ...settings, footer_text: e.target.value })
                  }
                  placeholder="Terima kasih atas kepercayaan Anda"
                  style={fieldStyle}
                />{" "}
                <p style={{ fontSize: "11px", color: sub, marginTop: "6px" }}>
                  Teks kecil di bagian paling bawah dokumen cetak.
                </p>{" "}
              </div>{" "}
            </div>{" "}
            <div
              style={{
                marginTop: "22px",
                padding: "18px",
                borderRadius: "14px",
                border: `1px solid ${border}`,
                backgroundColor: isDarkMode
                  ? "var(--color-surface)"
                  : "var(--color-surface-elevated)",
              }}
            >
              {" "}
              <SectionHeader
                title="Profit Thresholds"
                icon={<Activity size={16} />}
                description="Dipakai oleh filter profit di Nota Penjualan."
              />{" "}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile
                    ? "1fr"
                    : "repeat(3, minmax(0, 1fr))",
                  gap: "12px",
                }}
              >
                {" "}
                {[
                  {
                    key: "high",
                    label: "Untung tinggi (%)",
                    helper: "ambang untung tinggi",
                  },
                  {
                    key: "normal",
                    label: "Untung normal (%)",
                    helper: "ambang untung normal",
                  },
                  {
                    key: "thin",
                    label: "Tipis (%)",
                    helper: "di bawah ini = rugi",
                  },
                ].map((field) => (
                  <div key={field.key}>
                    {" "}
                    <label style={labelStyle}>{field.label}</label>{" "}
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={thresholds[field.key]}
                      onChange={(e) =>
                        setThresholds((prev) => ({
                          ...prev,
                          [field.key]:
                            e.target.value === ""
                              ? ""
                              : parseFloat(e.target.value),
                        }))
                      }
                      className="ui-form-field ui-focus-ring"
                      style={fieldStyle}
                    />{" "}
                    <p
                      style={{
                        fontSize: "11px",
                        color: sub,
                        margin: "6px 0 0",
                      }}
                    >
                      {field.helper}
                    </p>{" "}
                  </div>
                ))}{" "}
              </div>{" "}
              <div
                style={{
                  marginTop: "14px",
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                {" "}
                <button
                  onClick={handleSaveThresholds}
                  disabled={savingThresholds}
                  className="btn-primary ui-motion-button ui-focus-ring"
                  data-magnetic="true"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    minHeight: "44px",
                    padding: "10px 18px",
                    backgroundColor: "var(--color-success)",
                    color: "#FFF",
                    border: "none",
                    borderRadius: "10px",
                    fontSize: "14px",
                    fontWeight: "700",
                    cursor: savingThresholds ? "wait" : "pointer",
                    transition: uiTransition(
                      "opacity",
                      UI_MOTION.duration.base,
                    ),
                    opacity: savingThresholds ? 0.7 : 1,
                  }}
                >
                  {" "}
                  {savingThresholds ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Save size={18} />
                  )}{" "}
                  {savingThresholds ? "Menyimpan..." : "Simpan"}{" "}
                </button>{" "}
              </div>{" "}
            </div>{" "}
          </div>{" "}
          {/* RIGHT — Live Preview */}{" "}
          <div style={{ position: isMobile ? "static" : "sticky", top: "24px" }}>
            {" "}
            <div
              className="ui-panel ui-motion-card"
              style={{
                backgroundColor: cardBg,
                borderRadius: "12px",
                padding: "20px",
                border: `1px solid ${border}`,
                boxShadow: "var(--shadow-card)",
              }}
            >
              {" "}
              <SectionHeader
                title="Live Preview"
                icon={<Monitor size={16} />}
                description="Tampilan real-time saat diisi — lembar landscape (sama dengan hasil cetak)."
              />{" "}
              {/* v1.67.20: Live Preview pakai komponen NotaPreview asli — kini berbentuk
                  lembar landscape konsisten dengan cetak A5/A6; geser kiri/kanan bila sempit */}
              <NotaPreview
                form={PREVIEW_FORM}
                items={PREVIEW_ITEMS}
                settings={settings}
              />
            </div>{" "}
          </div>{" "}
        </div>
        )}{" "}
        {/* Toast */}{" "}
        <ToastNotice
          message={toast}
          type={toast.startsWith("Gagal") ? "error" : "success"}
          isMobile={isMobile}
        />{" "}
      </div>{" "}
    </div>
  );
}
