import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, X } from 'lucide-react';
import { ledgerAPI } from '../services/api';
import Skeleton from './common/Skeleton';
import ConfirmModal from './common/ConfirmModal';
import Breadcrumb from './common/Breadcrumb';
import Tooltip from './common/Tooltip';
import { UI_MOTION, uiTransition } from '../constants/ui';

const fmtRp = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

const CATEGORIES = ['Penjualan', 'Pembelian', 'Operasional', 'Gaji', 'Toko Online', 'Lain-lain'];

export default function LedgerPage({ isDarkMode, isSidebarOpen, isMobile, isVantaMode }) {
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState({ byCategory: [], monthly: [], totals: { total_debit: 0, total_credit: 0, net_balance: 0 } });
  const [tab, setTab] = useState('entries');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [toast, setToast] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [form, setForm] = useState({ entry_date: new Date().toISOString().split('T')[0], account_name: '', description: '', debit: 0, credit: 0, category: 'Penjualan' });
  const [loading, setLoading] = useState(true);

  const bg = isDarkMode ? '#000' : 'var(--color-bg)';
  const cardBg = isDarkMode ? 'rgba(28,28,30,0.7)' : 'rgba(255,255,255,0.7)';
  const border = isDarkMode ? 'var(--color-surface-raised)' : 'var(--color-border)';
  const text = isDarkMode ? '#FFF' : '#000';
  const sub = 'var(--color-text-subtle)';

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(''), UI_MOTION.duration.toastSuccess); };
  const inputStyle = { width: '100%', padding: '10px 12px', border: `1px solid ${border}`, borderRadius: '10px', backgroundColor: isDarkMode ? 'var(--color-surface-raised)' : 'var(--color-bg)', color: text, fontSize: '14px', outline: 'none', boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontSize: '11px', fontWeight: '700', color: sub, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' };

  const fetchEntries = async () => { 
    setLoading(true);
    try { const { data } = await ledgerAPI.getAll(); setEntries(data); } catch (e) { console.error(e); } 
    finally { setLoading(false); }
  };
  const fetchSummary = async () => { try { const { data } = await ledgerAPI.getSummary(); setSummary(data); } catch (e) { console.error(e); } };

  useEffect(() => { fetchEntries(); fetchSummary(); }, []);

  const openCreate = () => { setEditId(null); setForm({ entry_date: new Date().toISOString().split('T')[0], account_name: '', description: '', debit: 0, credit: 0, category: 'Penjualan' }); setShowModal(true); };
  const openEdit = (e) => { setEditId(e.id); setForm({ entry_date: e.entry_date?.split('T')[0] || '', account_name: e.account_name, description: e.description || '', debit: parseFloat(e.debit) || 0, credit: parseFloat(e.credit) || 0, category: e.category || 'Penjualan' }); setShowModal(true); };

  const handleSave = async () => {
    if (!form.account_name.trim()) return flash('Nama akun wajib');
    try {
      if (editId) { await ledgerAPI.update(editId, form); flash('Entry diperbarui'); }
      else { await ledgerAPI.create(form); flash('Entry ditambahkan'); }
      setShowModal(false); fetchEntries(); fetchSummary();
    } catch (e) { flash(e.response?.data?.error || e.message); }
  };

  const handleDelete = (id) => setDeleteConfirmId(id);
  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    try { await ledgerAPI.remove(deleteConfirmId); flash('Dihapus'); fetchEntries(); fetchSummary(); } catch (e) { flash(e.response?.data?.error || e.message); }
    finally { setDeleteConfirmId(null); }
  };

  return (
    <div className="ui-motion-page" style={{ padding: isMobile ? '1rem' : '2rem', paddingTop: isMobile ? '4rem' : '2rem', backgroundColor: isVantaMode ? 'transparent' : bg, minHeight: '100vh', transition: uiTransition('margin-left', UI_MOTION.duration.page, UI_MOTION.easing.standard) }}>
      <Breadcrumb title="Buku Besar" isMobile={isMobile} isDarkMode={isDarkMode} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: '700', margin: 0, color: text }}>📒 Buku Besar</h1>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: sub }}>Khusus Direktur • {entries.length} entries</p>
        </div>
        <button onClick={openCreate} className="btn-primary ui-motion-button ui-focus-ring" data-magnetic="true" style={{ display: 'flex', alignItems: 'center', gap: '6px', minHeight: '44px', padding: '10px 18px', backgroundColor: 'var(--color-primary-hover)', color: '#FFF', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>
          <Plus size={18} /> Buat Transaksi
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="ui-motion-card ui-hover-delight" style={{ backgroundColor: cardBg, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: `1px solid ${border}`, borderRadius: '12px', padding: '18px' }}>
          <p style={{ margin: 0, fontSize: '11px', fontWeight: '700', color: sub, textTransform: 'uppercase' }}>Total Debit</p>
          <p style={{ margin: '6px 0 0', fontSize: '22px', fontWeight: '800', color: 'var(--color-success)' }}>{fmtRp(summary.totals?.total_debit)}</p>
        </div>
        <div className="ui-motion-card ui-hover-delight" style={{ backgroundColor: cardBg, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: `1px solid ${border}`, borderRadius: '12px', padding: '18px' }}>
          <p style={{ margin: 0, fontSize: '11px', fontWeight: '700', color: sub, textTransform: 'uppercase' }}>Total Credit</p>
          <p style={{ margin: '6px 0 0', fontSize: '22px', fontWeight: '800', color: 'var(--color-danger)' }}>{fmtRp(summary.totals?.total_credit)}</p>
        </div>
        <div className="ui-motion-card ui-hover-delight" style={{ backgroundColor: cardBg, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: `1px solid ${border}`, borderRadius: '12px', padding: '18px' }}>
          <p style={{ margin: 0, fontSize: '11px', fontWeight: '700', color: sub, textTransform: 'uppercase' }}>Saldo Bersih</p>
          <p style={{ margin: '6px 0 0', fontSize: '22px', fontWeight: '800', color: 'var(--color-primary)' }}>{fmtRp(summary.totals?.net_balance)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', backgroundColor: isDarkMode ? 'var(--color-surface-elevated)' : 'var(--color-border)', borderRadius: '10px', padding: '3px', marginBottom: '1.5rem', maxWidth: '400px' }}>
        {[['entries', '📋 Jurnal'], ['categories', '📊 Per Kategori']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className="ui-motion-button ui-focus-ring" style={{ flex: 1, minHeight: '40px', padding: '8px 12px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700', backgroundColor: tab === key ? (isDarkMode ? 'var(--color-surface-raised)' : '#FFF') : 'transparent', color: tab === key ? text : sub, boxShadow: tab === key ? '0 1px 4px rgba(0,0,0,0.12)' : 'none' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Entries Tab */}
      {tab === 'entries' && (
        <div className="ui-hover-delight" style={{ backgroundColor: cardBg, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: `1px solid ${border}`, borderRadius: '12px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '600px' }}>
            <thead>
              <tr style={{ backgroundColor: isDarkMode ? 'var(--color-surface-elevated)' : 'var(--color-bg)' }}>
                {['Tanggal', 'Akun', 'Kategori', 'Keterangan', 'Debit', 'Kredit', 'Aksi'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '700', color: sub, fontSize: '11px', textTransform: 'uppercase', borderBottom: `1px solid ${border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1, 2, 3, 4, 5].map(i => (
                  <tr key={i} style={{ borderBottom: `1px solid ${border}` }}>
                    <td style={{ padding: '12px' }}><Skeleton width="80px" /></td>
                    <td style={{ padding: '12px' }}><Skeleton width="120px" /></td>
                    <td style={{ padding: '12px' }}><Skeleton width="60px" borderRadius="4px" /></td>
                    <td style={{ padding: '12px' }}><Skeleton width="180px" /></td>
                    <td style={{ padding: '12px' }}><Skeleton width="90px" /></td>
                    <td style={{ padding: '12px' }}><Skeleton width="90px" /></td>
                    <td style={{ padding: '12px' }}><Skeleton width="40px" /></td>
                  </tr>
                ))
              ) : (
                <>
                  {entries.map(e => (
                    <tr key={e.id} style={{ borderBottom: `1px solid ${border}` }}>
                      <td style={{ padding: '10px 12px', color: text }}>{fmtDate(e.entry_date)}</td>
                      <td style={{ padding: '10px 12px', fontWeight: '600', color: text }}>{e.account_name}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '4px', backgroundColor: isDarkMode ? 'var(--color-surface-raised)' : 'var(--color-bg)', color: sub }}>{e.category}</span>
                      </td>
                      <td style={{ padding: '10px 12px', color: sub, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.description}</td>
                      <td style={{ padding: '10px 12px', fontWeight: '600', color: parseFloat(e.debit) > 0 ? 'var(--color-success)' : sub }}>{fmtRp(e.debit)}</td>
                      <td style={{ padding: '10px 12px', fontWeight: '600', color: parseFloat(e.credit) > 0 ? 'var(--color-danger)' : sub }}>{fmtRp(e.credit)}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <Tooltip text="Edit entry" position="top"><button onClick={() => openEdit(e)} aria-label={`Edit entry ${e.account_name}`} className="ui-motion-button ui-focus-ring" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><Edit2 size={14} color="var(--color-primary)" /></button></Tooltip>
                          <Tooltip text="Hapus entry" position="top"><button onClick={() => handleDelete(e.id)} aria-label={`Hapus entry ${e.account_name}`} className="ui-motion-button ui-focus-ring" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><Trash2 size={14} color="var(--color-danger)" /></button></Tooltip>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!entries.length && <tr><td colSpan={7} style={{ padding: isMobile ? '1rem' : '2rem', paddingTop: isMobile ? '4rem' : '2rem', textAlign: 'center', color: sub }}>Belum ada transaksi. Klik "Buat Transaksi" untuk memulai.</td></tr>}
                </>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Categories Tab */}
      {tab === 'categories' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
          {summary.byCategory.map((c, i) => (
            <div key={i} className="ui-hover-delight" style={{ backgroundColor: cardBg, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: `1px solid ${border}`, borderRadius: '12px', padding: '18px' }}>
              <h4 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: '700', color: text }}>{c.category || 'Umum'}</h4>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', color: sub }}>Debit</span>
                <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-success)' }}>{fmtRp(c.total_debit)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', color: sub }}>Kredit</span>
                <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-danger)' }}>{fmtRp(c.total_credit)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${border}`, paddingTop: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: '700', color: text }}>Saldo</span>
                <span style={{ fontSize: '14px', fontWeight: '800', color: parseFloat(c.balance) >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{fmtRp(c.balance)}</span>
              </div>
            </div>
          ))}
          {!summary.byCategory.length && <p style={{ color: sub }}>Belum ada data.</p>}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div onClick={() => setShowModal(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div onClick={e => e.stopPropagation()} className="glass-target glass-target--clear ui-motion-modal" style={{ backgroundColor: cardBg, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderRadius: '16px', width: '100%', maxWidth: '480px', overflow: 'hidden', boxShadow: '0 32px 64px rgba(0,0,0,0.35)' }}>
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: text }}>{editId ? '✏️ Edit Entry' : '➕ Entry Baru'}</h3>
              <button onClick={() => setShowModal(false)} aria-label="Tutup modal entry" className="ui-motion-button ui-focus-ring" style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color={sub} /></button>
            </div>
            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div><label style={labelStyle}>Tanggal</label><input type="date" value={form.entry_date} onChange={e => setForm(f => ({ ...f, entry_date: e.target.value }))} style={inputStyle} /></div>
                <div>
                  <label style={labelStyle}>Kategori</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={inputStyle}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div><label style={labelStyle}>Nama Akun *</label><input value={form.account_name} onChange={e => setForm(f => ({ ...f, account_name: e.target.value }))} placeholder="Kas, Bank BCA, Hutang Dagang..." style={inputStyle} /></div>
              <div><label style={labelStyle}>Keterangan</label><input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Pembayaran supplier..." style={inputStyle} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div><label style={labelStyle}>Debit</label><input type="number" value={form.debit} onChange={e => setForm(f => ({ ...f, debit: parseFloat(e.target.value) || 0 }))} style={inputStyle} /></div>
                <div><label style={labelStyle}>Kredit</label><input type="number" value={form.credit} onChange={e => setForm(f => ({ ...f, credit: parseFloat(e.target.value) || 0 }))} style={inputStyle} /></div>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                <button onClick={handleSave} className="btn-primary ui-motion-button ui-focus-ring" data-magnetic="true" style={{ flex: 1, padding: '13px', backgroundColor: 'var(--color-primary-hover)', color: '#FFF', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>{editId ? 'Simpan' : 'Buat Transaksi'}</button>
                <button onClick={() => setShowModal(false)} className="ui-motion-button ui-focus-ring" style={{ flex: 1, padding: '13px', backgroundColor: isDarkMode ? 'var(--color-surface-raised)' : 'var(--color-bg)', color: text, border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Batal</button>
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
        title="Hapus Transaksi"
        message="Apakah Anda yakin ingin menghapus transaksi ini?"
        isDarkMode={isDarkMode}
      />

      {/* Toast */}
      {toast && <div className="ui-motion-toast" style={{ position: 'fixed', bottom: '24px', right: '24px', backgroundColor: 'var(--color-success)', color: '#FFF', padding: '12px 20px', borderRadius: '10px', fontWeight: '600', fontSize: '14px', boxShadow: '0 8px 24px rgba(0,0,0,0.2)', zIndex: 99999 }}>✅ {toast}</div>}
    </div>
  );
}
