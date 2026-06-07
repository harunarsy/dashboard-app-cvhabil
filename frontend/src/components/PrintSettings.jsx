import React, { useState, useEffect } from "react";
import { Save, Loader2, Printer, Monitor, Activity } from "lucide-react";
import Skeleton from "./common/Skeleton";
import { printSettingsAPI, settingsAPI } from "../services/api";
import Breadcrumb from "./common/Breadcrumb";
import { UI_MOTION, uiTransition } from "../constants/ui";
import SectionHeader from "./common/SectionHeader";
import ToastNotice from "./common/ToastNotice";
export default function PrintSettings({
  isDarkMode,
  isSidebarOpen,
  isMobile,
  isVantaMode,
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
      } else {
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
    setSaving(true);
    try {
      const payload = {
        nota_layout: {
          company_name: settings.company_name,
          address: settings.address,
          phone: settings.phone,
          footer_text: settings.footer_text,
          signer_name: settings.signer_name,
          bank_info: settings.bank_info,
          qris_text: settings.qris_text,
          ketentuan: settings.ketentuan,
        },
      };
      await printSettingsAPI.update(payload);
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
  const bg = "var(--color-bg)";
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
          backgroundColor: isVantaMode ? "transparent" : bg,
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
    settings.footer_text || "Dokumen dicetak otomatis oleh Habil SuperApp";
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
        backgroundColor: isVantaMode ? "transparent" : bg,
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
            disabled={saving}
            className="btn-primary ui-motion-button ui-focus-ring"
            data-magnetic="true"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              minHeight: "44px",
              padding: "10px 20px",
              backgroundColor: "var(--color-primary)",
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
              <div style={fieldGroupStyle}>
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
              <div style={fieldGroupStyle}>
                {" "}
                <label style={labelStyle}>ALAMAT</label>{" "}
                <textarea
                  rows={3}
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
                  rows={4}
                  className="ui-form-field ui-focus-ring"
                  value={settings.ketentuan}
                  onChange={(e) =>
                    setSettings({ ...settings, ketentuan: e.target.value })
                  }
                  placeholder={
                    "Satu baris = satu poin. Contoh:\nHarap mengecek kembali barang yang diterima\nWajib video unboxing apabila menggunakan ekspedisi"
                  }
                  style={{ ...fieldStyle, resize: "vertical" }}
                />{" "}
                <p style={{ fontSize: "11px", color: sub, marginTop: "6px" }}>
                  Tampil merah di PDF. Satu baris = satu nomor poin.
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
                    helper: "di atas ambang ini",
                  },
                  {
                    key: "normal",
                    label: "Untung normal (%)",
                    helper: "batas bawah kategori normal",
                  },
                  {
                    key: "thin",
                    label: "Tipis (%)",
                    helper: "di bawah ini dianggap rugi",
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
                  {savingThresholds ? "Menyimpan..." : "Simpan Ambang"}{" "}
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
                description="Tampilan real-time saat diisi."
              />{" "}
              {/* Document Preview Card */}{" "}
              <div
                style={{
                  backgroundColor: "#FFF",
                  borderRadius: "12px",
                  padding: "16px",
                  border: "1px solid var(--color-border)",
                  boxShadow: "var(--shadow-card)",
                  fontFamily: "Helvetica, Arial, sans-serif",
                  maxWidth: "100%",
                  overflow: "hidden",
                }}
              >
                {" "}
                {/* Header */}{" "}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "10px",
                  }}
                >
                  {" "}
                  <div style={{ flex: 1 }}>
                    {" "}
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: "800",
                        color: "var(--color-primary)",
                        marginBottom: "3px",
                      }}
                    >
                      {previewName}
                    </div>{" "}
                    <div
                      style={{
                        fontSize: "9px",
                        color: "#555",
                        lineHeight: "1.4",
                      }}
                    >
                      {previewAddr}
                    </div>{" "}
                    {previewPhone && (
                      <div style={{ fontSize: "9px", color: "#555" }}>
                        {previewPhone}
                      </div>
                    )}{" "}
                  </div>{" "}
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    {" "}
                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: "800",
                        color: "#000",
                        marginBottom: "2px",
                      }}
                    >
                      NOTA PENJUALAN
                    </div>{" "}
                    <div style={{ fontSize: "8px", color: "#777" }}>
                      No: NT/2026/001
                    </div>{" "}
                    <div style={{ fontSize: "8px", color: "#777" }}>
                      11 Mei 2026
                    </div>{" "}
                  </div>{" "}
                </div>{" "}
                <div
                  style={{
                    height: "1.5px",
                    backgroundColor: "var(--color-primary)",
                    marginBottom: "8px",
                    borderRadius: "2px",
                  }}
                />{" "}
                <div style={{ marginBottom: "6px" }}>
                  {" "}
                  <span style={{ fontSize: "9px", color: "#555" }}>
                    Kepada Yth:{" "}
                  </span>{" "}
                  <span
                    style={{
                      fontSize: "9px",
                      fontWeight: "700",
                      color: "#000",
                    }}
                  >
                    Nama Customer
                  </span>{" "}
                </div>{" "}
                <div
                  style={{
                    backgroundColor: "var(--color-bg)",
                    borderRadius: "6px",
                    overflow: "hidden",
                    marginBottom: "8px",
                  }}
                >
                  {" "}
                  <table
                    style={{
                      width: "100%",
                      fontSize: "8px",
                      borderCollapse: "collapse",
                    }}
                  >
                    {" "}
                    <thead>
                      {" "}
                      <tr
                        style={{
                          backgroundColor: "var(--color-primary)",
                          color: "#FFF",
                        }}
                      >
                        {" "}
                        {["No", "Nama Barang", "Qty", "Harga", "Total"].map(
                          (h) => (
                            <th
                              key={h}
                              style={{ padding: "3px 5px", textAlign: "left" }}
                            >
                              {h}
                            </th>
                          ),
                        )}{" "}
                      </tr>{" "}
                    </thead>{" "}
                    <tbody>
                      {" "}
                      <tr>
                        {" "}
                        <td
                          style={{
                            padding: "3px 5px",
                            color: "var(--color-border-strong)",
                          }}
                        >
                          1
                        </td>{" "}
                        <td
                          style={{
                            padding: "3px 5px",
                            color: "var(--color-border-strong)",
                          }}
                        >
                          Contoh Produk
                        </td>{" "}
                        <td
                          style={{
                            padding: "3px 5px",
                            color: "var(--color-border-strong)",
                          }}
                        >
                          2
                        </td>{" "}
                        <td
                          style={{
                            padding: "3px 5px",
                            color: "var(--color-border-strong)",
                          }}
                        >
                          Rp 50.000
                        </td>{" "}
                        <td
                          style={{
                            padding: "3px 5px",
                            color: "var(--color-border-strong)",
                          }}
                        >
                          Rp 100.000
                        </td>{" "}
                      </tr>{" "}
                    </tbody>{" "}
                  </table>{" "}
                </div>{" "}
                <div
                  style={{
                    textAlign: "right",
                    fontSize: "9px",
                    fontWeight: "800",
                    color: "#000",
                    marginBottom: "6px",
                  }}
                >
                  GRAND TOTAL: Rp 100.000
                </div>{" "}
                {/* Ketentuan preview */}{" "}
                {previewKetentuan.length > 0 && (
                  <div style={{ marginBottom: "6px" }}>
                    {" "}
                    <span
                      style={{
                        fontSize: "7px",
                        fontWeight: "700",
                        color: "var(--color-danger)",
                      }}
                    >
                      NOTE:{" "}
                    </span>{" "}
                    {previewKetentuan.map((line, i) => (
                      <div
                        key={i}
                        style={{
                          fontSize: "7px",
                          color: "var(--color-danger)",
                        }}
                      >
                        {i + 1}. {line}
                      </div>
                    ))}{" "}
                    {settings.ketentuan &&
                      settings.ketentuan.split("\n").filter((l) => l.trim())
                        .length > 2 && (
                        <div
                          style={{
                            fontSize: "7px",
                            color: "var(--color-danger)",
                            opacity: 0.6,
                          }}
                        >
                          …
                        </div>
                      )}{" "}
                  </div>
                )}{" "}
                {/* Bank info preview */}{" "}
                {settings.bank_info && (
                  <div
                    style={{
                      textAlign: "center",
                      fontSize: "8px",
                      fontWeight: "700",
                      color: "#000",
                      marginBottom: "4px",
                    }}
                  >
                    {" "}
                    REK {settings.bank_info}{" "}
                  </div>
                )}{" "}
                {settings.qris_text && (
                  <div
                    style={{
                      textAlign: "center",
                      fontSize: "8px",
                      fontWeight: "700",
                      color: "#000",
                      marginBottom: "6px",
                    }}
                  >
                    {" "}
                    {settings.qris_text}{" "}
                  </div>
                )}{" "}
                {/* Signatures preview */}{" "}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "6px",
                    fontSize: "8px",
                  }}
                >
                  {" "}
                  <div style={{ textAlign: "center" }}>
                    {" "}
                    <div style={{ color: "#555" }}>Penerima,</div>{" "}
                    <div
                      style={{
                        borderBottom: "1px solid #555",
                        width: "60px",
                        margin: "10px auto 2px",
                      }}
                    />{" "}
                    <div style={{ color: "#999" }}>( )</div>{" "}
                  </div>{" "}
                  <div style={{ textAlign: "center" }}>
                    {" "}
                    <div style={{ color: "#555" }}>Hormat kami,</div>{" "}
                    <div
                      style={{
                        borderBottom: "1px solid #555",
                        width: "60px",
                        margin: "10px auto 2px",
                      }}
                    />{" "}
                    {settings.signer_name && (
                      <div style={{ color: "#333", fontSize: "7px" }}>
                        {settings.signer_name}
                      </div>
                    )}{" "}
                  </div>{" "}
                </div>{" "}
                {/* Footer */}{" "}
                <div
                  style={{
                    borderTop: "1px dashed var(--color-border)",
                    paddingTop: "5px",
                    textAlign: "center",
                  }}
                >
                  {" "}
                  <div style={{ fontSize: "7px", color: "#AEAEB2" }}>
                    {previewFooter}
                  </div>{" "}
                </div>{" "}
              </div>{" "}
              {/* Legend */}{" "}
              <div
                style={{
                  marginTop: "12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}
              >
                {" "}
                {[
                  { color: "var(--color-primary)", label: "Nama Toko" },
                  { color: "#555", label: "Alamat & Telepon" },
                  { color: "var(--color-danger)", label: "Ketentuan / Notes" },
                  { color: "#AEAEB2", label: "Footer / Catatan Kaki" },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    {" "}
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        backgroundColor: item.color,
                        flexShrink: 0,
                      }}
                    />{" "}
                    <span style={{ fontSize: "11px", color: sub }}>
                      {item.label}
                    </span>{" "}
                  </div>
                ))}{" "}
              </div>{" "}
            </div>{" "}
          </div>{" "}
        </div>{" "}
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
