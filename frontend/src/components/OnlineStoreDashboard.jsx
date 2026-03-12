import React, { useState, useEffect } from 'react';
import { Upload, DollarSign, TrendingUp, X } from 'lucide-react';
import { onlineStoreAPI } from '../services/api';
import Skeleton from './common/Skeleton';

const fmtRp = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);

export default function OnlineStoreDashboard({ isDarkMode, isSidebarOpen }) {
  const [tab, setTab] = useState('summary');
  const [summary, setSummary] = useState({ platforms: [], monthly: [] });
  const [sales, setSales] = useState([]);
  const [showImport, setShowImport] = useState(false);
  const [showWithdrawal, setShowWithdrawal] = useState(false);
  const [importForm, setImportForm] = useState({ platform: 'shopee', csv_text: '' });
  const [wdForm, setWdForm] = useState({ platform: 'shopee', amount: 0, withdrawal_date: new Date().toISOString().split('T')[0], notes: '' });
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);

  const bg = isDarkMode ? '#000' : '#F5F5F7';
  const cardBg = isDarkMode ? '#1C1C1E' : '#FFF';
  const border = isDarkMode ? '#2C2C2E' : '#E5E5EA';
  const text = isDarkMode ? '#FFF' : '#000';
  const sub = '#86868B';

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };
  const inputStyle = { width: '100%', padding: '10px 12px', border: `1px solid ${border}`, borderRadius: '10px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', color: text, fontSize: '14px', outline: 'none', boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontSize: '11px', fontWeight: '700', color: sub, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' };

  const fetchSummary = async () => { 
    try { 
      const { data } = await onlineStoreAPI.getSummary(); 
      setSummary(data); 
    } catch (e) { 
      console.error(e); 
    } 
  };
  const fetchSales = async () => { 
    setLoading(true);
    try { 
      const { data } = await onlineStoreAPI.getSales({ limit: 50 }); 
      setSales(data.data || []); 
    } catch (e) { 
      console.error(e); 
    } finally {
      setTimeout(() => setLoading(false), 500);
    }
  };

  useEffect(() => { fetchSummary(); fetchSales(); }, []);

  const handleImport = async () => {
    if (!importForm.csv_text.trim()) return alert('Paste CSV data');
    try {
      const { data } = await onlineStoreAPI.importCSV(importForm);
      flash(data.message); setShowImport(false); fetchSummary(); fetchSales();
    } catch (e) { alert(e.response?.data?.error || e.message); }
  };

  const handleWithdrawal = async () => {
    if (!wdForm.amount) return alert('Amount required');
    try { await onlineStoreAPI.createWithdrawal(wdForm); flash('Withdrawal recorded'); setShowWithdrawal(false); }
    catch (e) { alert(e.response?.data?.error || e.message); }
  };

  const totalGross = summary.platforms.reduce((s, p) => s + parseFloat(p.gross_revenue || 0), 0);
  const totalNet = summary.platforms.reduce((s, p) => s + parseFloat(p.net_revenue || 0), 0);
  const totalOrders = summary.platforms.reduce((s, p) => s + parseInt(p.total_orders || 0), 0);

  const platformColors = { shopee: '#EE4D2D', tiktok: '#000000' };

  return (
    <div style={{ padding: '2rem', marginLeft: isSidebarOpen ? '256px' : '80px', backgroundColor: bg, minHeight: '100vh', transition: 'margin-left 0.3s' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: '700', margin: 0, color: text }}>🛒 Toko Online</h1>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: sub }}>{totalOrders} total pesanan • {summary.platforms.length} platform</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowImport(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px', backgroundColor: '#EE4D2D', color: '#FFF', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}>
            <Upload size={16} /> Import CSV
          </button>
          <button onClick={() => setShowWithdrawal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px', backgroundColor: '#34C759', color: '#FFF', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}>
            <DollarSign size={16} /> Tarik Saldo
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', backgroundColor: isDarkMode ? '#1C1C1E' : '#E5E5EA', borderRadius: '10px', padding: '3px', marginBottom: '1.5rem', maxWidth: '400px' }}>
        {[['summary', '📊 Rangkuman'], ['sales', '📋 Transaksi']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{ flex: 1, padding: '8px 12px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700', backgroundColor: tab === key ? (isDarkMode ? '#2C2C2E' : '#FFF') : 'transparent', color: tab === key ? text : sub, boxShadow: tab === key ? '0 1px 4px rgba(0,0,0,0.12)' : 'none' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Summary Tab */}
      {tab === 'summary' && (
        <div>
          {/* Overview Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '12px', padding: '18px' }}>
              <p style={{ margin: 0, fontSize: '11px', fontWeight: '700', color: sub, textTransform: 'uppercase' }}>Total Revenue</p>
              {loading ? <Skeleton width="120px" height="28px" marginTop="6px" /> : <p style={{ margin: '6px 0 0', fontSize: '24px', fontWeight: '800', color: '#34C759' }}>{fmtRp(totalGross)}</p>}
            </div>
            <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '12px', padding: '18px' }}>
              <p style={{ margin: 0, fontSize: '11px', fontWeight: '700', color: sub, textTransform: 'uppercase' }}>Net Profit</p>
              {loading ? <Skeleton width="120px" height="28px" marginTop="6px" /> : <p style={{ margin: '6px 0 0', fontSize: '24px', fontWeight: '800', color: '#007AFF' }}>{fmtRp(totalNet)}</p>}
            </div>
            <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '12px', padding: '18px' }}>
              <p style={{ margin: 0, fontSize: '11px', fontWeight: '700', color: sub, textTransform: 'uppercase' }}>Total Orders</p>
              {loading ? <Skeleton width="60px" height="28px" marginTop="6px" /> : <p style={{ margin: '6px 0 0', fontSize: '24px', fontWeight: '800', color: text }}>{totalOrders}</p>}
            </div>
          </div>

          {/* Per Platform */}
          <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: '700', color: text, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={18} /> Per Platform
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
            {summary.platforms.length ? summary.platforms.map((p, i) => (
              <div key={i} style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '12px', padding: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '16px', fontWeight: '700', color: platformColors[p.platform] || text, textTransform: 'capitalize' }}>{p.platform}</span>
                  <span style={{ fontSize: '12px', color: sub }}>{p.total_orders} pesanan</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', color: sub }}>Gross</span>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: text }}>{fmtRp(p.gross_revenue)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', color: sub }}>Platform Fee</span>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#FF3B30' }}>-{fmtRp(p.total_fees)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${border}`, paddingTop: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: text }}>Net</span>
                  <span style={{ fontSize: '14px', fontWeight: '800', color: '#34C759' }}>{fmtRp(p.net_revenue)}</span>
                </div>
              </div>
            )) : <p style={{ color: sub }}>Belum ada data. Import CSV untuk memulai.</p>}
          </div>
        </div>
      )}

      {/* Transactions Tab */}
      {tab === 'sales' && (
        <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '12px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: isDarkMode ? '#1C1C1E' : '#F5F5F7' }}>
                {['Platform', 'Order ID', 'Tanggal', 'Produk', 'Qty', 'Harga Jual', 'Fee', 'Net'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '700', color: sub, fontSize: '11px', textTransform: 'uppercase', borderBottom: `1px solid ${border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${border}` }}>
                    <td style={{ padding: '10px 12px' }}><Skeleton width="60px" height="12px" /></td>
                    <td style={{ padding: '10px 12px' }}><Skeleton width="80px" height="10px" /></td>
                    <td style={{ padding: '10px 12px' }}><Skeleton width="70px" height="12px" /></td>
                    <td style={{ padding: '10px 12px' }}><Skeleton width="150px" height="14px" /></td>
                    <td style={{ padding: '10px 12px' }}><Skeleton width="30px" height="12px" /></td>
                    <td style={{ padding: '10px 12px' }}><Skeleton width="80px" height="12px" /></td>
                    <td style={{ padding: '10px 12px' }}><Skeleton width="80px" height="12px" /></td>
                    <td style={{ padding: '10px 12px' }}><Skeleton width="80px" height="12px" /></td>
                  </tr>
                ))
              ) : (
                sales.map(s => (
                  <tr key={s.id} style={{ borderBottom: `1px solid ${border}` }}>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '4px', backgroundColor: s.platform === 'shopee' ? '#EE4D2D18' : '#00000018', color: s.platform === 'shopee' ? '#EE4D2D' : (isDarkMode ? '#FFF' : '#000'), textTransform: 'capitalize' }}>{s.platform}</span>
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '11px', color: sub }}>{s.order_id}</td>
                    <td style={{ padding: '10px 12px', color: text }}>{s.order_date ? new Date(s.order_date).toLocaleDateString('id-ID') : '-'}</td>
                    <td style={{ padding: '10px 12px', fontWeight: '600', color: text, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.product_name}</td>
                    <td style={{ padding: '10px 12px', color: text }}>{s.qty}</td>
                    <td style={{ padding: '10px 12px', color: text }}>{fmtRp(s.sell_price)}</td>
                    <td style={{ padding: '10px 12px', color: '#FF3B30' }}>-{fmtRp(s.platform_fee)}</td>
                    <td style={{ padding: '10px 12px', fontWeight: '600', color: '#34C759' }}>{fmtRp(s.net_amount)}</td>
                  </tr>
                ))
              )}
              {!loading && !sales.length && <tr><td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: sub }}>Belum ada transaksi. Import CSV untuk memulai.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <div onClick={() => setShowImport(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: cardBg, borderRadius: '16px', width: '100%', maxWidth: '520px', overflow: 'hidden', boxShadow: '0 32px 64px rgba(0,0,0,0.35)' }}>
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#EE4D2D' }}>📄 Import CSV</h3>
              <button onClick={() => setShowImport(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color={sub} /></button>
            </div>
            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Platform</label>
                <select value={importForm.platform} onChange={e => setImportForm(f => ({ ...f, platform: e.target.value }))} style={inputStyle}>
                  <option value="shopee">Shopee</option>
                  <option value="tiktok">TikTok Shop</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Paste CSV Data</label>
                <textarea value={importForm.csv_text} onChange={e => setImportForm(f => ({ ...f, csv_text: e.target.value }))} rows={8} placeholder="Paste isi CSV dari export Shopee/TikTok..." style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '12px', resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={handleImport} style={{ flex: 1, padding: '13px', backgroundColor: '#EE4D2D', color: '#FFF', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>Import</button>
                <button onClick={() => setShowImport(false)} style={{ flex: 1, padding: '13px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', color: text, border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Batal</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Withdrawal Modal */}
      {showWithdrawal && (
        <div onClick={() => setShowWithdrawal(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: cardBg, borderRadius: '16px', width: '100%', maxWidth: '420px', overflow: 'hidden', boxShadow: '0 32px 64px rgba(0,0,0,0.35)' }}>
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#34C759' }}>💰 Tarik Saldo</h3>
              <button onClick={() => setShowWithdrawal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color={sub} /></button>
            </div>
            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Platform</label>
                <select value={wdForm.platform} onChange={e => setWdForm(f => ({ ...f, platform: e.target.value }))} style={inputStyle}>
                  <option value="shopee">Shopee</option>
                  <option value="tiktok">TikTok Shop</option>
                </select>
              </div>
              <div><label style={labelStyle}>Jumlah</label><input type="number" value={wdForm.amount} onChange={e => setWdForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} style={inputStyle} /></div>
              <div><label style={labelStyle}>Tanggal</label><input type="date" value={wdForm.withdrawal_date} onChange={e => setWdForm(f => ({ ...f, withdrawal_date: e.target.value }))} style={inputStyle} /></div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={handleWithdrawal} style={{ flex: 1, padding: '13px', backgroundColor: '#34C759', color: '#FFF', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>Simpan</button>
                <button onClick={() => setShowWithdrawal(false)} style={{ flex: 1, padding: '13px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', color: text, border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Batal</button>
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
