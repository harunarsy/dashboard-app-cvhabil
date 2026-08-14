// Buku Besar 2.0 (v1.64.0) — metode pembukuan Harun dipindah dari Excel:
// mutasi bank (import e-statement) → kategorisasi cepat → laporan alokasi amplop bulanan
// (pct × laba kotor − pengeluaran + carry-over) terpisah PPN / non-PPN + pembanding laba sistem.
// + tab Hutang Piutang di luar transaksi (per orang, running total). Khusus Direktur.
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, X, RefreshCw } from 'lucide-react';
import { ledgerAPI } from '../services/api';
import Skeleton from './common/Skeleton';
import ConfirmModal from './common/ConfirmModal';
import Breadcrumb from './common/Breadcrumb';
import ToastNotice from './common/ToastNotice';
import { UI_MOTION, uiTransition } from '../constants/ui';

const fmtRp = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : '-');
const CATEGORIES = ['KULAK', 'LABA KOTOR PENJUALAN', 'GAJI KARYAWAN', 'OPERASIONAL', 'BENSIN', 'LISTRIK/PLN', 'INTERNET', 'PAJAK', 'MODAL', 'LAIN LAIN'];
const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function LedgerPage({ isDarkMode, isSidebarOpen, isMobile, isVantaMode }) {
  const bg = isDarkMode ? '#000' : 'var(--color-bg)';
  const cardBg = isDarkMode ? 'rgba(28,28,30,0.7)' : 'rgba(255,255,255,0.7)';
  const border = isDarkMode ? 'var(--color-surface-raised)' : 'var(--color-border)';
  const text = isDarkMode ? '#FFF' : '#000';
  const sub = 'var(--color-text-subtle)';
  const inputStyle = { padding: '9px 11px', border: `1px solid ${border}`, borderRadius: '10px', backgroundColor: isDarkMode ? 'var(--color-surface-raised)' : 'var(--color-bg)', color: text, fontSize: '13px', outline: 'none', boxSizing: 'border-box' };

  const [tab, setTab] = useState('entries');
  const [toast, setToast] = useState('');
  const [toastType, setToastType] = useState('success');
  const flash = (msg, type = 'success') => { setToast(msg); setToastType(type); setTimeout(() => setToast(''), type === 'error' ? UI_MOTION.duration.toastError : UI_MOTION.duration.toastSuccess); };

  // ── Jurnal state ──
  const [entries, setEntries] = useState([]);
  const [month, setMonth] = useState(thisMonth());
  const [onlyReview, setOnlyReview] = useState(false);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [bulkCat, setBulkCat] = useState('KULAK');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [form, setForm] = useState({ entry_date: new Date().toISOString().split('T')[0], account_name: 'Bank BCA', description: '', debit: 0, credit: 0, category: 'KULAK' });

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 1000 };
      if (month) params.month = `${month}-01`;
      if (onlyReview) params.needs_review = '1';
      if (q.trim()) params.q = q.trim();
      const { data } = await ledgerAPI.getAll(params);
      setEntries(Array.isArray(data) ? data : []);
      setSelected(new Set());
    } catch (e) { flash('Gagal memuat — cek koneksi', 'error'); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, onlyReview, q]);
  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const setCategory = async (id, category) => {
    try {
      await ledgerAPI.bulkCategory({ ids: [id], category });
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, category, needs_review: false, auto_cat: false } : e)));
    } catch (e) { flash(e.response?.data?.error || e.message, 'error'); }
  };
  const applyBulk = async () => {
    if (!selected.size) return flash('Pilih baris dulu (centang)', 'error');
    try {
      await ledgerAPI.bulkCategory({ ids: [...selected], category: bulkCat });
      flash(`${selected.size} baris → ${bulkCat}`);
      fetchEntries();
    } catch (e) { flash(e.response?.data?.error || e.message, 'error'); }
  };
  const toggleSel = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const handleSave = async () => {
    if (!form.account_name.trim()) return flash('Nama akun wajib', 'error');
    try { await ledgerAPI.create(form); flash('Entry ditambahkan'); setShowModal(false); fetchEntries(); }
    catch (e) { flash(e.response?.data?.error || e.message, 'error'); }
  };
  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    try { await ledgerAPI.remove(deleteConfirmId); flash('Dihapus'); fetchEntries(); }
    catch (e) { flash(e.response?.data?.error || e.message, 'error'); }
    finally { setDeleteConfirmId(null); }
  };

  // ── Laporan state ──
  const [repMonth, setRepMonth] = useState(thisMonth());
  const [scope, setScope] = useState('ppn');
  const [report, setReport] = useState(null);
  const [repLoading, setRepLoading] = useState(false);
  useEffect(() => {
    if (tab !== 'report') return;
    setRepLoading(true);
    ledgerAPI.getMonthlyReport(repMonth).then(({ data }) => setReport(data)).catch(() => setReport(null)).finally(() => setRepLoading(false));
  }, [tab, repMonth]);

  // ── Hutang state ──
  const [loans, setLoans] = useState({ rows: [], summary: [] });
  const [loanForm, setLoanForm] = useState({ person: '', loan_date: new Date().toISOString().split('T')[0], amount: '', note: '', direction: 'pinjam' });
  const fetchLoans = () => ledgerAPI.getLoans().then(({ data }) => setLoans(data)).catch(() => {});
  useEffect(() => { if (tab === 'loans') fetchLoans(); }, [tab]);
  const saveLoan = async () => {
    const amt = Math.abs(parseFloat(loanForm.amount) || 0);
    if (!loanForm.person.trim() || !amt) return flash('Nama & nominal wajib', 'error');
    try {
      await ledgerAPI.saveLoan({ person: loanForm.person, loan_date: loanForm.loan_date, amount: loanForm.direction === 'pinjam' ? amt : -amt, note: loanForm.note });
      flash('Tersimpan'); setLoanForm((f) => ({ ...f, amount: '', note: '' })); fetchLoans();
    } catch (e) { flash(e.response?.data?.error || e.message, 'error'); }
  };

  // ── Per kategori (summary lama) ──
  const [summary, setSummary] = useState({ byCategory: [], totals: {} });
  useEffect(() => { if (tab === 'categories') ledgerAPI.getSummary().then(({ data }) => setSummary(data)).catch(() => {}); }, [tab]);

  const reviewCount = entries.filter((e) => e.needs_review).length;
  const scopeRep = report ? report[scope] : null;

  const tabBtn = (key, label) => (
    <button key={key} onClick={() => setTab(key)} className="ui-motion-button ui-focus-ring" style={{ flex: 1, minHeight: '40px', padding: '8px 10px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 700, backgroundColor: tab === key ? (isDarkMode ? 'var(--color-surface-raised)' : '#FFF') : 'transparent', color: tab === key ? text : sub, boxShadow: tab === key ? '0 1px 4px rgba(0,0,0,0.12)' : 'none', whiteSpace: 'nowrap' }}>{label}</button>
  );

  return (
    <div className="ui-motion-page" style={{ padding: isMobile ? '1rem' : '2rem', paddingTop: isMobile ? '4rem' : '2rem', backgroundColor: isVantaMode ? 'transparent' : bg, minHeight: '100vh', transition: uiTransition('margin-left', UI_MOTION.duration.page, UI_MOTION.easing.standard) }}>
      <Breadcrumb title="Buku Besar" isMobile={isMobile} isDarkMode={isDarkMode} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, margin: 0, color: text }}>📒 Buku Besar</h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: sub }}>Khusus Direktur · mutasi bank → kategori → laporan amplop bulanan</p>
        </div>
        <button onClick={() => setShowModal(true)} className="ui-motion-button ui-focus-ring" style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '10px 18px', backgroundColor: 'var(--color-primary-hover)', color: '#FFF', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}><Plus size={18} /> Entry Manual</button>
      </div>

      <div style={{ display: 'flex', gap: 4, backgroundColor: isDarkMode ? 'var(--color-surface-elevated)' : 'var(--color-border)', borderRadius: 10, padding: 3, marginBottom: '1.2rem', maxWidth: 620, overflowX: 'auto' }}>
        {tabBtn('entries', '📋 Jurnal')}
        {tabBtn('report', '📆 Laporan Bulanan')}
        {tabBtn('loans', '🤝 Hutang Piutang')}
        {tabBtn('categories', '📊 Per Kategori')}
      </div>

      {/* ── Jurnal ── */}
      {tab === 'entries' && (
        <div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={inputStyle} />
            <input placeholder="Cari keterangan…" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...inputStyle, minWidth: 170 }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: text, cursor: 'pointer', padding: '8px 12px', borderRadius: 10, border: `1px solid ${onlyReview ? '#F59E0B' : border}`, backgroundColor: onlyReview ? 'rgba(245,158,11,0.1)' : 'transparent' }}>
              <input type="checkbox" checked={onlyReview} onChange={(e) => setOnlyReview(e.target.checked)} /> Perlu review{reviewCount ? ` (${reviewCount})` : ''}
            </label>
            <button onClick={fetchEntries} className="ui-motion-button ui-focus-ring" style={{ ...inputStyle, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}><RefreshCw size={13} /> Muat ulang</button>
            {selected.size > 0 && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '6px 10px', borderRadius: 10, backgroundColor: 'rgba(10,132,255,0.1)', border: '1px solid var(--color-primary)' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-primary)' }}>{selected.size} dipilih →</span>
                <select value={bulkCat} onChange={(e) => setBulkCat(e.target.value)} style={{ ...inputStyle, padding: '5px 8px' }}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
                <button onClick={applyBulk} className="ui-motion-button ui-focus-ring" style={{ padding: '6px 12px', border: 'none', borderRadius: 8, backgroundColor: 'var(--color-primary)', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Terapkan</button>
              </div>
            )}
          </div>
          <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: 12, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 780 }}>
              <thead><tr style={{ backgroundColor: isDarkMode ? 'var(--color-surface-elevated)' : 'var(--color-bg)' }}>
                {['✓', 'Tgl', 'Keterangan', 'Masuk', 'Keluar', 'Kategori', ''].map((h, i) => (
                  <th key={i} style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 700, color: sub, fontSize: 11, textTransform: 'uppercase', borderBottom: `1px solid ${border}` }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {loading ? [1, 2, 3, 4, 5].map((i) => (
                  <tr key={i}><td colSpan={7} style={{ padding: 12 }}><Skeleton width="100%" height="14px" /></td></tr>
                )) : entries.map((e) => (
                  <tr key={e.id} style={{ borderBottom: `1px solid ${border}`, backgroundColor: e.needs_review ? 'rgba(245,158,11,0.07)' : 'transparent' }}>
                    <td style={{ padding: '7px 10px' }}><input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleSel(e.id)} /></td>
                    <td style={{ padding: '7px 10px', color: text, whiteSpace: 'nowrap' }}>{fmtDate(e.entry_date)}</td>
                    <td style={{ padding: '7px 10px', color: text, maxWidth: 340 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.description}>{e.description || e.account_name}</div>
                      <div style={{ fontSize: 10, color: sub }}>{e.source === 'estatement' ? 'e-statement' : e.source}{e.auto_cat ? ' · auto — cek' : ''}{e.tax_scope === 'non_ppn' ? ' · NON-PPN' : ''}</div>
                    </td>
                    <td style={{ padding: '7px 10px', color: parseFloat(e.debit) > 0 ? 'var(--color-success)' : sub, whiteSpace: 'nowrap', fontWeight: parseFloat(e.debit) > 0 ? 600 : 400 }}>{parseFloat(e.debit) > 0 ? fmtRp(e.debit) : ''}</td>
                    <td style={{ padding: '7px 10px', color: parseFloat(e.credit) > 0 ? 'var(--color-danger)' : sub, whiteSpace: 'nowrap', fontWeight: parseFloat(e.credit) > 0 ? 600 : 400 }}>{parseFloat(e.credit) > 0 ? fmtRp(e.credit) : ''}</td>
                    <td style={{ padding: '7px 10px' }}>
                      <select value={e.category || ''} onChange={(ev) => setCategory(e.id, ev.target.value)} style={{ ...inputStyle, padding: '5px 7px', fontSize: 12, borderColor: e.needs_review ? '#F59E0B' : border, minWidth: 120 }}>
                        <option value="" disabled>— pilih —</option>
                        {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '7px 6px' }}><button onClick={() => setDeleteConfirmId(e.id)} aria-label="Hapus" className="ui-focus-ring" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><Trash2 size={13} color="var(--color-danger)" /></button></td>
                  </tr>
                ))}
                {!loading && !entries.length && <tr><td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: sub }}>Tidak ada entri di filter ini.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Laporan Bulanan ── */}
      {tab === 'report' && (
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
            <input type="month" value={repMonth} onChange={(e) => setRepMonth(e.target.value)} style={inputStyle} />
            <div style={{ display: 'flex', gap: 3, backgroundColor: isDarkMode ? 'var(--color-surface-elevated)' : 'var(--color-border)', borderRadius: 9, padding: 3 }}>
              {[['ppn', 'PPN (utama)'], ['non_ppn', 'Non-PPN (dus lipat)']].map(([k, l]) => (
                <button key={k} onClick={() => setScope(k)} className="ui-focus-ring" style={{ padding: '7px 13px', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700, backgroundColor: scope === k ? (isDarkMode ? 'var(--color-surface-raised)' : '#FFF') : 'transparent', color: scope === k ? text : sub }}>{l}</button>
              ))}
            </div>
          </div>
          {repLoading && <p style={{ color: sub }}>Menghitung…</p>}
          {!repLoading && scopeRep && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
                {[['Laba Kotor (ledger)', scopeRep.laba_kotor, 'var(--color-success)'],
                  ['Total Pengeluaran', scopeRep.total_pengeluaran, 'var(--color-danger)'],
                  ['Laba Bersih', scopeRep.laba_bersih, 'var(--color-primary)'],
                  ['Pembanding: Laba Nota (sistem)', report.pembanding_sistem?.laba_nota, sub]].map(([l, v, c], i) => (
                  <div key={i} className="ui-motion-card" style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: 16 }}>
                    <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: sub, textTransform: 'uppercase' }}>{l}</p>
                    <p style={{ margin: '6px 0 0', fontSize: 19, fontWeight: 800, color: c }}>{fmtRp(v)}</p>
                  </div>
                ))}
              </div>
              <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: 12, overflowX: 'auto', marginBottom: 14 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
                  <thead><tr style={{ backgroundColor: isDarkMode ? 'var(--color-surface-elevated)' : 'var(--color-bg)' }}>
                    {['Amplop', '%', 'Alokasi (dari laba)', 'Pengeluaran', 'Lebihan Bln Sblm', 'Sisa'].map((h) => <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: sub, fontSize: 11, textTransform: 'uppercase', borderBottom: `1px solid ${border}` }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {scopeRep.envelopes.map((r) => (
                      <tr key={r.name} style={{ borderBottom: `1px solid ${border}` }}>
                        <td style={{ padding: '8px 12px', fontWeight: 700, color: text }}>{r.name}</td>
                        <td style={{ padding: '8px 12px', color: sub }}>{Math.round(r.pct * 100)}%</td>
                        <td style={{ padding: '8px 12px', color: text }}>{fmtRp(r.alokasi)}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--color-danger)' }}>{fmtRp(r.pengeluaran)}</td>
                        <td style={{ padding: '8px 12px', color: sub }}>{fmtRp(r.lebihan_sebelumnya)}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 800, color: r.sisa >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{fmtRp(r.sisa)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!!scopeRep.non_envelope.length && (
                <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: 14 }}>
                  <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: sub, textTransform: 'uppercase' }}>Pengeluaran di luar amplop</p>
                  {scopeRep.non_envelope.map((o) => (
                    <div key={o.category} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                      <span style={{ color: text }}>{o.category}</span><span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>{fmtRp(o.pengeluaran)}</span>
                    </div>
                  ))}
                </div>
              )}
              <p style={{ fontSize: 11, color: sub, marginTop: 10 }}>Laba kotor = jumlah entri "LABA KOTOR PENJUALAN" bulan ini (metode Excel-mu). Sisa amplop otomatis nyambung berantai dari bulan-bulan sebelumnya. Baris LABA hasil backfill engine ditandai "auto — cek" di Jurnal — boleh dikoreksi/hapus.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Hutang Piutang ── */}
      {tab === 'loans' && (
        <div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {loans.summary.map((s) => (
              <div key={s.person} style={{ padding: '10px 16px', borderRadius: 12, backgroundColor: cardBg, border: `1px solid ${border}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: sub }}>{s.person}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: s.outstanding > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>{fmtRp(s.outstanding)}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14, padding: 12, borderRadius: 12, backgroundColor: cardBg, border: `1px solid ${border}` }}>
            <input placeholder="Nama (mis. Direktur)" value={loanForm.person} onChange={(e) => setLoanForm((f) => ({ ...f, person: e.target.value }))} style={{ ...inputStyle, width: 150 }} />
            <input type="date" value={loanForm.loan_date} onChange={(e) => setLoanForm((f) => ({ ...f, loan_date: e.target.value }))} style={inputStyle} />
            <select value={loanForm.direction} onChange={(e) => setLoanForm((f) => ({ ...f, direction: e.target.value }))} style={inputStyle}>
              <option value="pinjam">Pinjam (+)</option><option value="cicil">Cicil/Kembali (−)</option>
            </select>
            <input type="number" placeholder="Nominal" value={loanForm.amount} onChange={(e) => setLoanForm((f) => ({ ...f, amount: e.target.value }))} style={{ ...inputStyle, width: 130 }} />
            <input placeholder="Keterangan" value={loanForm.note} onChange={(e) => setLoanForm((f) => ({ ...f, note: e.target.value }))} style={{ ...inputStyle, minWidth: 160 }} />
            <button onClick={saveLoan} className="ui-motion-button ui-focus-ring" style={{ padding: '9px 16px', border: 'none', borderRadius: 10, backgroundColor: 'var(--color-primary)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Simpan</button>
          </div>
          <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: 12, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
              <thead><tr style={{ backgroundColor: isDarkMode ? 'var(--color-surface-elevated)' : 'var(--color-bg)' }}>
                {['Orang', 'Tanggal', 'Nominal', 'Saldo Berjalan', 'Keterangan', 'Status', ''].map((h) => <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: sub, fontSize: 11, textTransform: 'uppercase', borderBottom: `1px solid ${border}` }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {loans.rows.map((r) => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${border}` }}>
                    <td style={{ padding: '8px 12px', fontWeight: 700, color: text }}>{r.person}</td>
                    <td style={{ padding: '8px 12px', color: text }}>{new Date(r.loan_date).toLocaleDateString('id-ID')}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 600, color: parseFloat(r.amount) > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>{fmtRp(r.amount)}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 700, color: text }}>{fmtRp(r.running_total)}</td>
                    <td style={{ padding: '8px 12px', color: sub, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.note}>{r.note}</td>
                    <td style={{ padding: '8px 12px', color: sub }}>{r.status}</td>
                    <td style={{ padding: '8px 6px' }}><button onClick={async () => { await ledgerAPI.removeLoan(r.id); fetchLoans(); }} aria-label="Hapus" className="ui-focus-ring" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><Trash2 size={13} color="var(--color-danger)" /></button></td>
                  </tr>
                ))}
                {!loans.rows.length && <tr><td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: sub }}>Belum ada catatan.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Per Kategori ── */}
      {tab === 'categories' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          {summary.byCategory.map((c, i) => (
            <div key={i} style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: 16 }}>
              <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: text }}>{c.category || '(belum dikategorikan)'}</h4>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}><span style={{ color: sub }}>Masuk</span><span style={{ color: 'var(--color-success)', fontWeight: 600 }}>{fmtRp(c.total_debit)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}><span style={{ color: sub }}>Keluar</span><span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>{fmtRp(c.total_credit)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, borderTop: `1px solid ${border}`, paddingTop: 7 }}><span style={{ fontWeight: 700, color: text }}>Saldo</span><span style={{ fontWeight: 800, color: parseFloat(c.balance) >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{fmtRp(c.balance)}</span></div>
            </div>
          ))}
          {!summary.byCategory.length && <p style={{ color: sub }}>Belum ada data.</p>}
        </div>
      )}

      {/* Modal entry manual */}
      {showModal && (
        <div onClick={() => setShowModal(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} className="ui-motion-modal" style={{ backgroundColor: isDarkMode ? '#1c1c1e' : '#fff', borderRadius: 16, width: '100%', maxWidth: 460, overflow: 'hidden', boxShadow: '0 32px 64px rgba(0,0,0,0.35)' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: text }}>➕ Entry Manual</h3>
              <button onClick={() => setShowModal(false)} aria-label="Tutup" className="ui-focus-ring" style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color={sub} /></button>
            </div>
            <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 11 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
                <input type="date" value={form.entry_date} onChange={(e) => setForm((f) => ({ ...f, entry_date: e.target.value }))} style={inputStyle} />
                <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} style={inputStyle}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
              </div>
              <input value={form.account_name} onChange={(e) => setForm((f) => ({ ...f, account_name: e.target.value }))} placeholder="Akun (Bank BCA / Kas)" style={inputStyle} />
              <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Keterangan" style={inputStyle} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
                <div><label style={{ fontSize: 10, fontWeight: 700, color: sub }}>MASUK (debit)</label><input type="number" min="0" value={form.debit} onChange={(e) => setForm((f) => ({ ...f, debit: Math.max(0, parseFloat(e.target.value) || 0) }))} style={{ ...inputStyle, width: '100%' }} /></div>
                <div><label style={{ fontSize: 10, fontWeight: 700, color: sub }}>KELUAR (kredit)</label><input type="number" min="0" value={form.credit} onChange={(e) => setForm((f) => ({ ...f, credit: Math.max(0, parseFloat(e.target.value) || 0) }))} style={{ ...inputStyle, width: '100%' }} /></div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={handleSave} className="ui-motion-button ui-focus-ring" style={{ flex: 1, padding: 12, backgroundColor: 'var(--color-primary-hover)', color: '#FFF', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>Simpan</button>
                <button onClick={() => setShowModal(false)} className="ui-focus-ring" style={{ flex: 1, padding: 12, backgroundColor: isDarkMode ? 'var(--color-surface-raised)' : 'var(--color-bg)', color: text, border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Batal</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal isOpen={!!deleteConfirmId} onClose={() => setDeleteConfirmId(null)} onConfirm={confirmDelete} title="Hapus Entri" message="Yakin hapus entri ini?" isDarkMode={isDarkMode} />
      {toast && <ToastNotice message={toast} type={toastType === 'error' ? 'error' : 'success'} isMobile={isMobile} />}
    </div>
  );
}
