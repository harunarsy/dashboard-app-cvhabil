import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, X } from 'lucide-react';
import { ledgerAPI } from '../services/api';

const fmtRp = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

const CATEGORIES = ['Penjualan', 'Pembelian', 'Operasional', 'Gaji', 'Toko Online', 'Lain-lain'];

export default function LedgerPage({ isDarkMode, isSidebarOpen }) {
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState({ byCategory: [], monthly: [], totals: { total_debit: 0, total_credit: 0, net_balance: 0 } });
  const [tab, setTab] = useState('entries');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [toast, setToast] = useState('');
  const [form, setForm] = useState({ entry_date: new Date().toISOString().split('T')[0], account_name: '', description: '', debit: 0, credit: 0, category: 'Penjualan' });

  const bg = isDarkMode ? '#000' : '#F5F5F7';
  const cardBg = isDarkMode ? '#1C1C1E' : '#FFF';
  const border = isDarkMode ? '#2C2C2E' : '#E5E5EA';
  const text = isDarkMode ? '#FFF' : '#000';
  const sub = '#86868B';

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };
  const inputStyle = { width: '100%', padding: '10px 12px', border: `1px solid ${border}`, borderRadius: '10px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', color: text, fontSize: '14px', outline: 'none', boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontSize: '11px', fontWeight: '700', color: sub, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' };

  const fetchEntries = async () => { try { const { data } = await ledgerAPI.getAll(); setEntries(data); } catch (e) { console.error(e); } };
  const fetchSummary = async () => { try { const { data } = await ledgerAPI.getSummary(); setSummary(data); } catch (e) { console.error(e); } };

  useEffect(() => { fetchEntries(); fetchSummary(); }, []);

  const openCreate = () => { setEditId(null); setForm({ entry_date: new Date().toISOString().split('T')[0], account_name: '', description: '', debit: 0, credit: 0, category: 'Penjualan' }); setShowModal(true); };
  const openEdit = (e) => { setEditId(e.id); setForm({ entry_date: e.entry_date?.split('T')[0] || '', account_name: e.account_name, description: e.description || '', debit: parseFloat(e.debit) || 0, credit: parseFloat(e.credit) || 0, category: e.category || 'Penjualan' }); setShowModal(true); };

  const handleSave = async () => {
    if (!form.account_name.trim()) return alert('Nama akun wajib');
    try {
      if (editId) { await ledgerAPI.update(editId, form); flash('Entry diperbarui'); }
      else { await ledgerAPI.create(form); flash('Entry ditambahkan'); }
      setShowModal(false); fetchEntries(); fetchSummary();
    } catch (e) { alert(e.response?.data?.error || e.message); }
  };

  const handleDelete = async (id) => { if (!window.confirm('Hapus entry?')) return; try { await ledgerAPI.remove(id); flash('Dihapus'); fetchEntries(); fetchSummary(); } catch (e) { alert(e.response?.data?.error || e.message); } };

  return (
    <div style={{ padding: '2rem', marginLeft: isSidebarOpen ? '256px' : '80px', backgroundColor: bg, minHeight: '100vh', transition: 'margin-left 0.3s' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: '700', margin: 0, color: text }}>📒 Buku Besar</h1>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: sub }}>Khusus Direktur • {entries.length} entries</p>
        </div>
        <button onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 18px', backgroundColor: '#5856D6', color: '#FFF', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>
          <Plus size={18} /> Tambah Entry
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '12px', padding: '18px' }}>
          <p style={{ margin: 0, fontSize: '11px', fontWeight: '700', color: sub, textTransform: 'uppercase' }}>Total Debit</p>
          <p style={{ margin: '6px 0 0', fontSize: '22px', fontWeight: '800', color: '#34C759' }}>{fmtRp(summary.totals?.total_debit)}</p>
        </div>
        <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '12px', padding: '18px' }}>
          <p style={{ margin: 0, fontSize: '11px', fontWeight: '700', color: sub, textTransform: 'uppercase' }}>Total Credit</p>
          <p style={{ margin: '6px 0 0', fontSize: '22px', fontWeight: '800', color: '#FF3B30' }}>{fmtRp(summary.totals?.total_credit)}</p>
        </div>
        <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '12px', padding: '18px' }}>
          <p style={{ margin: 0, fontSize: '11px', fontWeight: '700', color: sub, textTransform: 'uppercase' }}>Saldo Bersih</p>
          <p style={{ margin: '6px 0 0', fontSize: '22px', fontWeight: '800', color: '#007AFF' }}>{fmtRp(summary.totals?.net_balance)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', backgroundColor: isDarkMode ? '#1C1C1E' : '#E5E5EA', borderRadius: '10px', padding: '3px', marginBottom: '1.5rem', maxWidth: '400px' }}>
        {[['entries', '📋 Jurnal'], ['categories', '📊 Per Kategori']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{ flex: 1, padding: '8px 12px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700', backgroundColor: tab === key ? (isDarkMode ? '#2C2C2E' : '#FFF') : 'transparent', color: tab === key ? text : sub, boxShadow: tab === key ? '0 1px 4px rgba(0,0,0,0.12)' : 'none' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Entries Tab */}
      {tab === 'entries' && (
        <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '12px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: isDarkMode ? '#1C1C1E' : '#F5F5F7' }}>
                {['Tanggal', 'Akun', 'Kategori', 'Keterangan', 'Debit', 'Kredit', 'Aksi'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '700', color: sub, fontSize: '11px', textTransform: 'uppercase', borderBottom: `1px solid ${border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} style={{ borderBottom: `1px solid ${border}` }}>
                  <td style={{ padding: '10px 12px', color: text }}>{fmtDate(e.entry_date)}</td>
                  <td style={{ padding: '10px 12px', fontWeight: '600', color: text }}>{e.account_name}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '4px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', color: sub }}>{e.category}</span>
                  </td>
                  <td style={{ padding: '10px 12px', color: sub, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.description}</td>
                  <td style={{ padding: '10px 12px', fontWeight: '600', color: parseFloat(e.debit) > 0 ? '#34C759' : sub }}>{fmtRp(e.debit)}</td>
                  <td style={{ padding: '10px 12px', fontWeight: '600', color: parseFloat(e.credit) > 0 ? '#FF3B30' : sub }}>{fmtRp(e.credit)}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => openEdit(e)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><Edit2 size={14} color="#007AFF" /></button>
                      <button onClick={() => handleDelete(e.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><Trash2 size={14} color="#FF3B30" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!entries.length && <tr><td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: sub }}>Belum ada entry. Klik "Tambah Entry" untuk memulai.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Categories Tab */}
      {tab === 'categories' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
          {summary.byCategory.map((c, i) => (
            <div key={i} style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '12px', padding: '18px' }}>
              <h4 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: '700', color: text }}>{c.category || 'Umum'}</h4>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', color: sub }}>Debit</span>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#34C759' }}>{fmtRp(c.total_debit)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', color: sub }}>Kredit</span>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#FF3B30' }}>{fmtRp(c.total_credit)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${border}`, paddingTop: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: '700', color: text }}>Saldo</span>
                <span style={{ fontSize: '14px', fontWeight: '800', color: parseFloat(c.balance) >= 0 ? '#34C759' : '#FF3B30' }}>{fmtRp(c.balance)}</span>
              </div>
            </div>
          ))}
          {!summary.byCategory.length && <p style={{ color: sub }}>Belum ada data.</p>}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div onClick={() => setShowModal(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: cardBg, borderRadius: '16px', width: '100%', maxWidth: '480px', overflow: 'hidden', boxShadow: '0 32px 64px rgba(0,0,0,0.35)' }}>
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: text }}>{editId ? '✏️ Edit Entry' : '➕ Entry Baru'}</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color={sub} /></button>
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
                <button onClick={handleSave} style={{ flex: 1, padding: '13px', backgroundColor: '#5856D6', color: '#FFF', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>{editId ? 'Simpan' : 'Tambah'}</button>
                <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: '13px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', color: text, border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Batal</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div style={{ position: 'fixed', bottom: '24px', right: '24px', backgroundColor: '#34C759', color: '#FFF', padding: '12px 20px', borderRadius: '10px', fontWeight: '600', fontSize: '14px', boxShadow: '0 8px 24px rgba(0,0,0,0.2)', zIndex: 99999 }}>✅ {toast}</div>}
    </div>
  );
}
