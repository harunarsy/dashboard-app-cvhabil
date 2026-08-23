import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icons from "./common/Icon";
import { smartAssistantAPI } from "../services/api";

const {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Boxes,
  CheckCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
} = Icons;

const SCOPE_OPTIONS = [
  {
    value: "overview",
    label: "Prioritas hari ini",
    prompt: "Apa prioritas bisnis hari ini?",
    icon: Sparkles,
  },
  {
    value: "inventory",
    label: "Stok prioritas",
    prompt: "Stok apa yang perlu segera direstock?",
    icon: Boxes,
  },
  {
    value: "customers",
    label: "Follow-up customer",
    prompt: "Customer mana yang perlu difollow-up?",
    icon: Users,
  },
  {
    value: "sales",
    label: "Tren penjualan",
    prompt: "Bagaimana ritme penjualan minggu ini?",
    icon: BarChart3,
  },
];

const SEVERITY = {
  critical: {
    label: "Kritis",
    color: "var(--assistant-danger-text)",
    background: "var(--color-danger-soft)",
  },
  high: {
    label: "Prioritas",
    color: "var(--assistant-danger-text)",
    background: "var(--color-danger-soft)",
  },
  medium: {
    label: "Perlu dicek",
    color: "var(--assistant-warning-text)",
    background: "var(--color-warning-soft)",
  },
  info: {
    label: "Informasi",
    color: "var(--assistant-accent-text)",
    background: "var(--color-selection)",
  },
};

const getErrorMessage = (error) =>
  error?.response?.data?.error?.message ||
  "Smart-Assistant belum bisa memeriksa data. Coba lagi sebentar.";

export default function SmartAssistant({ isDarkMode }) {
  const navigate = useNavigate();
  const scopeRefs = useRef([]);
  const [input, setInput] = useState("");
  const [activeScope, setActiveScope] = useState("overview");
  const [lastRequest, setLastRequest] = useState({
    message: "Apa prioritas bisnis hari ini?",
    scope: "overview",
  });
  const [status, setStatus] = useState("loading");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const runAssistant = async ({ message, scope }) => {
    const safeMessage = String(message || "").trim();
    const request = { message: safeMessage, scope, limit: 8 };
    setLastRequest({ message: safeMessage, scope });
    setActiveScope(scope);
    setStatus("loading");
    setError("");

    try {
      const response = await smartAssistantAPI.getRecommendations(request);
      setResult(response.data);
      setStatus("success");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      setStatus("error");
    }
  };

  useEffect(() => {
    runAssistant(lastRequest);
    // Initial overview is intentionally loaded once when the route opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScope = (option) => {
    setInput("");
    runAssistant({ message: option.prompt, scope: option.value });
  };

  const handleScopeKeyDown = (event, index) => {
    const lastIndex = SCOPE_OPTIONS.length - 1;
    let nextIndex = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = index === lastIndex ? 0 : index + 1;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = index === 0 ? lastIndex : index - 1;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = lastIndex;
    }
    if (nextIndex === null) return;

    event.preventDefault();
    const option = SCOPE_OPTIONS[nextIndex];
    scopeRefs.current[nextIndex]?.focus();
    handleScope(option);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const message = input.trim();
    if (!message || status === "loading") return;
    runAssistant({ message, scope: activeScope });
    setInput("");
  };

  const recommendations = result?.recommendations || [];
  const isEmpty = status === "success" && recommendations.length === 0;
  const surface = isDarkMode
    ? "color-mix(in srgb, var(--color-surface) 94%, black)"
    : "var(--color-surface)";

  return (
    <main className="smart-assistant-page ui-page" aria-labelledby="smart-assistant-title">
      <div className="mx-auto w-full max-w-[1480px] px-4 pb-8 pt-20 md:px-7 md:pt-7">
        <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3">
              <span className="smart-assistant-mark" aria-hidden="true">
                <Sparkles size={22} />
              </span>
              <h1
                id="smart-assistant-title"
                className="text-3xl font-black tracking-[-0.03em] md:text-4xl"
                style={{ color: "var(--color-text)" }}
              >
                Habil Smart-Assistant
              </h1>
            </div>
            <p
              className="mt-3 max-w-[68ch] text-sm leading-6 md:text-base"
              style={{ color: "var(--color-text-muted)" }}
            >
              <strong style={{ color: "var(--assistant-accent-text)" }}>
                Rule-based smart suggestions.
              </strong>{" "}
              Membaca pola stok, customer, dan penjualan memakai aturan bisnis yang dapat dijelaskan—bukan jawaban generatif.
            </p>
          </div>
          <div
            className="flex max-w-md items-start gap-2 text-xs leading-5"
            style={{ color: "var(--color-text-muted)" }}
          >
            <ShieldCheck
              size={18}
              className="mt-0.5 shrink-0"
              style={{ color: "var(--color-success)" }}
              aria-hidden="true"
            />
            <span>
              Data hanya dibaca dalam transaksi database read-only. Saran tetap perlu keputusan operator.
            </span>
          </div>
        </header>

        <section
          className="smart-assistant-shell"
          style={{ background: surface }}
          aria-label="Pemeriksaan aturan Smart-Assistant"
          aria-busy={status === "loading"}
        >
          <aside className="smart-assistant-scopes" aria-label="Cakupan analisis">
            <h2 className="text-sm font-extrabold" style={{ color: "var(--color-text)" }}>
              Mau cek apa?
            </h2>
            <p className="mt-1 text-xs leading-5" style={{ color: "var(--color-text-muted)" }}>
              Pilih fokus agar aturan yang diperiksa tetap relevan.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-1" role="radiogroup" aria-label="Fokus analisis">
              {SCOPE_OPTIONS.map((option, index) => {
                const ScopeIcon = option.icon;
                const selected = activeScope === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    tabIndex={selected ? 0 : -1}
                    ref={(element) => {
                      scopeRefs.current[index] = element;
                    }}
                    disabled={status === "loading"}
                    onClick={() => handleScope(option)}
                    onKeyDown={(event) => handleScopeKeyDown(event, index)}
                    className="smart-assistant-scope ui-focus-ring"
                    data-selected={selected}
                  >
                    <ScopeIcon size={18} aria-hidden="true" />
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="smart-assistant-method">
              <div className="flex items-center gap-2 font-extrabold" style={{ color: "var(--color-text)" }}>
                <CheckCircle size={17} style={{ color: "var(--color-success)" }} aria-hidden="true" />
                Cara kerja
              </div>
              <ul className="mt-2 space-y-1.5 pl-4 text-xs leading-5" style={{ color: "var(--color-text-muted)" }}>
                <li>Stok kritis: estimasi sisa di bawah 21 hari.</li>
                <li>Customer dormant: tanpa order lebih dari 30 hari.</li>
                <li>Tren: tujuh hari terakhir dibanding periode sebelumnya.</li>
              </ul>
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <div className="smart-assistant-thread" aria-live="polite">
              <div className="smart-assistant-query">
                <span>Fokus pemeriksaan</span>
                <strong>{lastRequest.message}</strong>
              </div>

              {status === "loading" && (
                <div className="smart-assistant-result" role="status">
                  <div>
                    <div className="flex items-start gap-3">
                      <RefreshCw
                        size={19}
                        className="smart-assistant-loader mt-0.5 shrink-0"
                        style={{ color: "var(--color-action)" }}
                        aria-hidden="true"
                      />
                    <div>
                      <div className="text-sm font-extrabold" style={{ color: "var(--color-text)" }}>
                        Memeriksa aturan bisnis…
                      </div>
                      <div className="mt-0.5 text-xs" style={{ color: "var(--color-text-muted)" }}>
                        Membaca data operasional tanpa mengubah database.
                      </div>
                    </div>
                  </div>
                    <div className="smart-assistant-progress" aria-hidden="true">
                      <span />
                    </div>
                  </div>
                </div>
              )}

              {status === "error" && (
                <div className="smart-assistant-result" role="alert">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={20} className="mt-0.5 shrink-0" style={{ color: "var(--color-danger)" }} />
                    <div className="min-w-0 flex-1">
                      <h2 className="text-sm font-extrabold" style={{ color: "var(--color-text)" }}>
                        Analisis belum berhasil
                      </h2>
                      <p className="mt-1 text-sm leading-6" style={{ color: "var(--color-text-muted)" }}>
                        {error}
                      </p>
                      <button
                        type="button"
                        onClick={() => runAssistant(lastRequest)}
                        className="ui-focus-ring mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-extrabold"
                        style={{ color: "var(--assistant-accent-text)", background: "var(--color-selection)" }}
                      >
                        <RefreshCw size={16} aria-hidden="true" />
                        Coba lagi
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {status === "success" && (
                <div className="smart-assistant-result">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-base font-black" style={{ color: "var(--color-text)" }}>
                        {result?.summary}
                      </h2>
                      <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
                        Hasil dari {result?.meta?.rules_evaluated?.length || 0} aturan · {" "}
                        {new Date(result?.meta?.generated_at).toLocaleString("id-ID", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>
                    <span
                      className="rounded-full px-2.5 py-1 text-[11px] font-extrabold"
                      style={{ color: "var(--assistant-success-text)", background: "var(--color-success-soft)" }}
                    >
                      Read-only verified
                    </span>
                  </div>

                  {isEmpty ? (
                    <div className="smart-assistant-empty">
                      <CheckCircle size={28} style={{ color: "var(--color-success)" }} aria-hidden="true" />
                      <div>
                        <div className="font-extrabold" style={{ color: "var(--color-text)" }}>
                          Tidak ada prioritas yang terdeteksi
                        </div>
                        <p className="mt-1 text-sm leading-6" style={{ color: "var(--color-text-muted)" }}>
                          Coba cakupan lain atau periksa kembali setelah data transaksi bertambah.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-5 divide-y" style={{ borderColor: "var(--color-border)" }}>
                      {recommendations.map((item) => {
                        const severity = SEVERITY[item.severity] || SEVERITY.info;
                        return (
                          <article key={item.id} className="smart-assistant-recommendation">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-black" style={{ color: "var(--color-text)" }}>
                                  {item.title}
                                </h3>
                                <span
                                  className="rounded-full px-2 py-0.5 text-[10px] font-extrabold"
                                  style={{ color: severity.color, background: severity.background }}
                                >
                                  {severity.label}
                                </span>
                              </div>
                              <p className="mt-1 text-sm leading-6" style={{ color: "var(--color-text-muted)" }}>
                                {item.summary}
                              </p>
                              <p className="mt-2 text-xs leading-5" style={{ color: "var(--color-text-subtle)" }}>
                                Dasar: {item.reason}
                              </p>
                              <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                                {item.evidence.map((evidence) => (
                                  <div key={evidence.label}>
                                    <dt className="text-[10px] font-bold uppercase tracking-[0.05em]" style={{ color: "var(--color-text-subtle)" }}>
                                      {evidence.label}
                                    </dt>
                                    <dd className="mt-0.5 text-xs font-extrabold tabular-nums" style={{ color: "var(--color-text)" }}>
                                      {evidence.value}
                                    </dd>
                                  </div>
                                ))}
                              </dl>
                            </div>
                            <button
                              type="button"
                              onClick={() => navigate(item.action.path)}
                              className="ui-focus-ring inline-flex min-h-11 shrink-0 items-center gap-1.5 self-start rounded-xl px-3 text-xs font-extrabold"
                              style={{ color: "var(--assistant-accent-text)", background: "var(--color-selection)" }}
                            >
                              {item.action.label}
                              <ArrowUpRight size={15} aria-hidden="true" />
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mx-3 mt-1 md:mx-7">
              <label
                htmlFor="smart-assistant-question"
                className="mb-2 block text-xs font-extrabold"
                style={{ color: "var(--color-text)" }}
              >
                Tambah konteks pemeriksaan
              </label>
              <form className="smart-assistant-composer" onSubmit={handleSubmit}>
                <input
                  id="smart-assistant-question"
                  aria-describedby="smart-assistant-question-hint"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  maxLength={500}
                  disabled={status === "loading"}
                  className="ui-focus-ring min-w-0 flex-1 bg-transparent text-base outline-none"
                  style={{ color: "var(--color-text)" }}
                  placeholder="Contoh: prioritaskan stok paling kritis"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || status === "loading"}
                  className="smart-assistant-send ui-focus-ring"
                  aria-label="Jalankan rule"
                >
                  <Send size={17} aria-hidden="true" />
                  <span className="hidden sm:inline">Jalankan rule</span>
                </button>
              </form>
              <p
                id="smart-assistant-question-hint"
                className="mt-2 px-1 text-[11px] leading-5"
                style={{ color: "var(--color-text-subtle)" }}
              >
                Teks hanya memberi konteks pada cakupan aktif. Sistem tidak membuat fakta atau rekomendasi di luar rule tersebut.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
