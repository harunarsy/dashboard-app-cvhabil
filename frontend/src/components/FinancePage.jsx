import React, { useState, useEffect, useCallback } from "react";
import Icons from "./common/Icon";
import { financeAPI, reportsAPI } from "../services/api";

const { AlertTriangle, CheckCircle, Download, RefreshCw, DollarSign } = Icons;

const formatRupiah = (n) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(parseFloat(n) || 0);

const formatDate = (d) => {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
};

const currentMonthStr = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

export default function FinancePage({ isDarkMode }) {
  const [data, setData] = useState({ hutang: [], piutang: [], totalHutang: 0, totalPiutang: 0 });
  const [loading, setLoading] = useState(true);
  const [markingLunas, setMarkingLunas] = useState(null);
  const [downloadMonth, setDownloadMonth] = useState(currentMonthStr());
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    financeAPI.getSummary()
      .then(({ data: d }) => setData(d))
      .catch((e) => setError(e.message || "Gagal memuat data"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleMarkLunas = async (invoiceNumber) => {
    if (!window.confirm(`Tandai faktur ${invoiceNumber} sebagai lunas?`)) return;
    setMarkingLunas(invoiceNumber);
    try {
      await financeAPI.markHutangLunas(invoiceNumber);
      fetchData();
    } catch (e) {
      alert("Gagal: " + (e.response?.data?.error || e.message));
    } finally {
      setMarkingLunas(null);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await reportsAPI.downloadMonthly(downloadMonth);
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `HABIL_Laporan_${downloadMonth}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Gagal download: " + (e.response?.data?.error || e.message));
    } finally {
      setDownloading(false);
    }
  };

  const bg = isDarkMode ? "var(--color-bg)" : "var(--color-bg)";
  const cardBg = isDarkMode ? "var(--color-surface)" : "#fff";
  const border = "var(--color-border)";
  const text = "var(--color-text)";
  const sub = "var(--color-text-subtle)";

  return (
    <div style={{ backgroundColor: bg, minHeight: "100vh", padding: "24px 20px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-8 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl" style={{ backgroundColor: "var(--color-primary-soft)", color: "var(--color-primary)" }}>
              <DollarSign size={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold" style={{ color: text }}>Keuangan</h1>
              <p className="text-xs font-medium mt-0.5" style={{ color: sub }}>Hutang & piutang dari data existing</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Excel download */}
            <input
              type="month"
              value={downloadMonth}
              onChange={(e) => setDownloadMonth(e.target.value)}
              className="text-sm rounded-xl border px-3 py-2"
              style={{ borderColor: border, backgroundColor: cardBg, color: text }}
            />
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
              style={{ backgroundColor: "var(--color-primary)", color: "#fff", opacity: downloading ? 0.6 : 1 }}
            >
              <Download size={15} />
              {downloading ? "Mengunduh..." : "Export Excel"}
            </button>
            <button
              onClick={fetchData}
              className="p-2 rounded-xl border transition-colors"
              style={{ borderColor: border, color: sub }}
              title="Refresh"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border px-4 py-3 mb-6 flex items-center gap-2 text-sm" style={{ borderColor: "var(--color-danger)", color: "var(--color-danger)", backgroundColor: "color-mix(in srgb, var(--color-danger) 8%, transparent)" }}>
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        {/* Summary pills */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          {[
            { label: "Total Hutang", value: data.totalHutang, color: "var(--color-danger)" },
            { label: "Total Piutang", value: data.totalPiutang, color: "var(--color-warning)" },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border p-5" style={{ borderColor: border, backgroundColor: cardBg }}>
              <p className="text-xs font-semibold mb-1" style={{ color: sub }}>{item.label}</p>
              <p className="text-2xl font-bold" style={{ color: item.color }}>{formatRupiah(item.value)}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Hutang */}
          <section className="rounded-3xl border shadow-sm" style={{ borderColor: border, backgroundColor: cardBg }}>
            <div className="px-6 py-4 border-b" style={{ borderColor: border }}>
              <h2 className="text-base font-bold" style={{ color: text }}>
                Hutang ke Distributor
                <span className="ml-2 text-sm font-normal" style={{ color: sub }}>({data.hutang.length})</span>
              </h2>
              <p className="text-xs mt-0.5" style={{ color: sub }}>Faktur pembelian belum lunas</p>
            </div>
            {loading ? (
              <div className="px-6 py-8 text-sm text-center" style={{ color: sub }}>Memuat...</div>
            ) : data.hutang.length === 0 ? (
              <div className="px-6 py-8 text-sm text-center" style={{ color: sub }}>Tidak ada hutang outstanding</div>
            ) : (
              <div className="divide-y" style={{ borderColor: border }}>
                {data.hutang.map((row) => (
                  <div key={row.invoiceNumber} className="px-6 py-4 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold truncate" style={{ color: text }}>{row.invoiceNumber}</span>
                        {row.isOverdue && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: "color-mix(in srgb, var(--color-danger) 12%, transparent)", color: "var(--color-danger)" }}>
                            Jatuh tempo
                          </span>
                        )}
                      </div>
                      <p className="text-xs truncate" style={{ color: sub }}>{row.distributor}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: sub }}>
                        {formatDate(row.invoiceDate)}{row.dueDate ? ` · Jatuh tempo: ${formatDate(row.dueDate)}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-sm font-bold" style={{ color: "var(--color-danger)" }}>{formatRupiah(row.totalAmount)}</span>
                      <button
                        onClick={() => handleMarkLunas(row.invoiceNumber)}
                        disabled={markingLunas === row.invoiceNumber}
                        className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors"
                        style={{ backgroundColor: "color-mix(in srgb, var(--color-success) 12%, transparent)", color: "var(--color-success)" }}
                      >
                        <CheckCircle size={11} />
                        {markingLunas === row.invoiceNumber ? "..." : "Lunas"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Piutang */}
          <section className="rounded-3xl border shadow-sm" style={{ borderColor: border, backgroundColor: cardBg }}>
            <div className="px-6 py-4 border-b" style={{ borderColor: border }}>
              <h2 className="text-base font-bold" style={{ color: text }}>
                Piutang dari Customer
                <span className="ml-2 text-sm font-normal" style={{ color: sub }}>({data.piutang.length})</span>
              </h2>
              <p className="text-xs mt-0.5" style={{ color: sub }}>Nota penjualan belum lunas</p>
            </div>
            {loading ? (
              <div className="px-6 py-8 text-sm text-center" style={{ color: sub }}>Memuat...</div>
            ) : data.piutang.length === 0 ? (
              <div className="px-6 py-8 text-sm text-center" style={{ color: sub }}>Tidak ada piutang outstanding</div>
            ) : (
              <div className="divide-y" style={{ borderColor: border }}>
                {data.piutang.map((row) => (
                  <div key={row.notaNumber} className="px-6 py-4 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold truncate" style={{ color: text }}>{row.notaNumber}</span>
                        {row.isOverdue && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: "color-mix(in srgb, var(--color-warning) 12%, transparent)", color: "var(--color-warning)" }}>
                            &gt;30 hari
                          </span>
                        )}
                      </div>
                      <p className="text-xs truncate" style={{ color: sub }}>{row.customerName}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: sub }}>{formatDate(row.saleDate)} · {row.channel || "offline"}</p>
                    </div>
                    <span className="text-sm font-bold shrink-0" style={{ color: "var(--color-warning)" }}>{formatRupiah(row.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
