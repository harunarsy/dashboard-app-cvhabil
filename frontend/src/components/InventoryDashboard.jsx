import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Search, AlertTriangle, Clock, Trash2, Edit2, X, ArrowDownCircle, ArrowUpCircle, ClipboardCheck } from 'lucide-react';
import { inventoryAPI } from '../services/api';
import MasterSelect from './MasterSelect';
import Skeleton from './common/Skeleton';
import ConfirmModal from './common/ConfirmModal';
import Breadcrumb from './common/Breadcrumb';

const fmtRp = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const daysUntil = (d) => d ? Math.ceil((new Date(d) - new Date()) / 86400000) : null;

export default function InventoryDashboard({ isDarkMode, isSidebarOpen, isMobile }) {
  const [tab, setTab] = useState('products'); // products | stockIn | opname | alerts
  const [products, setProducts] = useState([]);
  const [alerts, setAlerts] = useState({ expiring: [], lowStock: [] });
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(null); // null | 'product' | 'stockIn' | 'stockOut' | 'opname'
  const [editId, setEditId] = useState(null);
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Product form
  const [pForm, setPForm] = useState({ code: '', name: '', unit: 'pcs', hna: 0, sell_price: 0, category: '', min_stock: 5 });
  // Stock in form
  const [siForm, setSiForm] = useState({ product_name: '', batch_no: '', expired_date: '', qty: 1, hna: 0 });
  // Stock out form
  const [soForm, setSoForm] = useState({ product_id: '', qty: 1, notes: '' });
  // Opname
  const [opItems, setOpItems] = useState([]);

  const bg = isDarkMode ? '#000' : '#F5F5F7';
  const cardBg = isDarkMode ? '#1C1C1E' : '#FFF';
  const border = isDarkMode ? '#2C2C2E' : '#E5E5EA';
  const text = isDarkMode ? '#FFF' : '#000';
  const sub = '#86868B';

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try { 
      const { data } = await inventoryAPI.getProducts(); 
      setProducts(data); 
    } catch (e) { 
      console.error(e); 
    } finally {
      setTimeout(() => setLoading(false), 500);
    }
  }, []);
  const fetchAlerts = useCallback(async () => {
    try { const { data } = await inventoryAPI.getAlerts(); setAlerts(data); } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { fetchProducts(); fetchAlerts(); }, [fetchProducts, fetchAlerts]);

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.code || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.category || '').toLowerCase().includes(search.toLowerCase())
  );

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const inputStyle = {
    width: '100%', padding: '10px 12px', border: `1px solid ${border}`,
    borderRadius: '10px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7',
    color: text, fontSize: '14px', outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle = { display: 'block', fontSize: '11px', fontWeight: '700', color: sub, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' };

  // ─── Product CRUD ─────────────────────────────────────────────────────
  const openAddProduct = () => { setEditId(null); setPForm({ code: '', name: '', unit: 'pcs', hna: 0, sell_price: 0, category: '', min_stock: 5 }); setShowModal('product'); };
  const openEditProduct = (p) => { setEditId(p.id); setPForm({ code: p.code || '', name: p.name, unit: p.unit || 'pcs', hna: parseFloat(p.hna) || 0, sell_price: parseFloat(p.sell_price) || 0, category: p.category || '', min_stock: p.min_stock || 5 }); setShowModal('product'); };
  const saveProduct = async () => {
    if (!pForm.name.trim()) return flash('Nama produk wajib diisi');
    try {
      if (editId) { await inventoryAPI.updateProduct(editId, pForm); flash('Produk diperbarui'); }
      else { await inventoryAPI.createProduct(pForm); flash('Produk ditambahkan'); }
      setShowModal(null); fetchProducts();
    } catch (e) { flash(e.response?.data?.error || e.message); }
  };
  const deleteProduct = (id) => setDeleteConfirmId(id);
  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    try { await inventoryAPI.deleteProduct(deleteConfirmId); flash('Produk dinonaktifkan'); fetchProducts(); } catch (e) { flash(e.response?.data?.error || e.message); }
    finally { setDeleteConfirmId(null); }
  };

  // MasterSelect handlers for Products
  const handleAddProduct = async (name) => {
    await inventoryAPI.createProduct({ name, unit: 'pcs', hna: 0, sell_price: 0, category: '', min_stock: 5 });
    fetchProducts();
  };
  
  const handleRemoveProduct = async (name) => {
    const prod = products.find(p => p.name === name);
    if (prod) await inventoryAPI.deleteProduct(prod.id);
    fetchProducts();
  };

  // ─── Stock In ─────────────────────────────────────────────────────────
  const openStockIn = (p) => { 
    setSiForm({ 
      product_name: p?.name || '', 
      batch_no: '', 
      expired_date: '', 
      qty: 1,
      hna: p?.hna || 0
    }); 
    setShowModal('stockIn'); 
  };
  const saveStockIn = async () => {
    if (!siForm.product_name || !siForm.qty) return flash('Pilih produk dan qty');
    try {
      const prod = products.find(p => p.name === siForm.product_name);
      if (!prod) return flash('Produk tidak ditemukan');
      const payload = { ...siForm, product_id: prod.id };
      delete payload.product_name;
      await inventoryAPI.stockIn(payload);
      flash('Stok masuk berhasil');
      setShowModal(null);
      fetchProducts();
      fetchAlerts();
    }
    catch (e) { flash(e.response?.data?.error || e.message); }
  };

  // ─── Stock Out ────────────────────────────────────────────────────────
  const openStockOut = (p) => { setSoForm({ product_id: p?.id || '', qty: 1, notes: '' }); setShowModal('stockOut'); };
  const saveStockOut = async () => {
    if (!soForm.product_id || !soForm.qty) return flash('Pilih produk dan qty');
    try { await inventoryAPI.stockOut(soForm); flash('Stok keluar berhasil (FEFO)'); setShowModal(null); fetchProducts(); fetchAlerts(); }
    catch (e) { flash(e.response?.data?.error || e.message); }
  };

  // ─── Opname ───────────────────────────────────────────────────────────
  const openOpname = () => { setOpItems(products.map(p => ({ product_id: p.id, product_name: p.name, system_qty: parseInt(p.total_stock) || 0, physical_qty: parseInt(p.total_stock) || 0, notes: '' }))); setShowModal('opname'); };
  const saveOpname = async () => {
    const changed = opItems.filter(i => i.physical_qty !== i.system_qty);
    if (!changed.length) { flash('Tidak ada perubahan stok'); setShowModal(null); return; }
    try { await inventoryAPI.createOpname({ items: changed }); flash(`Stok opname selesai (${changed.length} produk disesuaikan)`); setShowModal(null); fetchProducts(); fetchAlerts(); }
    catch (e) { flash(e.response?.data?.error || e.message); }
  };

  const totalAlerts = alerts.expiring.length + alerts.lowStock.length;

  return (
    <div style={{ padding: isMobile ? '1rem' : '2rem', paddingTop: isMobile ? '4rem' : '2rem', backgroundColor: bg, minHeight: '100vh', transition: 'margin-left 0.3s' }}>
      <Breadcrumb title="Inventory" isMobile={isMobile} isDarkMode={isDarkMode} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: '700', margin: 0, color: text }}>📦 Inventory & Stok</h1>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: sub }}>{loading ? <Skeleton width="200px" height="14px" /> : <>{products.length} produk aktif • {totalAlerts > 0 ? `⚠️ ${totalAlerts} alert` : '✅ Semua aman'}</>}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={openAddProduct} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px', backgroundColor: '#007AFF', color: '#FFF', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}>
            <Plus size={16} /> Produk
          </button>
          <button onClick={() => openStockIn(null)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px', backgroundColor: '#34C759', color: '#FFF', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}>
            <ArrowDownCircle size={16} /> Stok Masuk
          </button>
          <button onClick={openOpname} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px', backgroundColor: '#FF9500', color: '#FFF', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}>
            <ClipboardCheck size={16} /> Stok Opname
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', backgroundColor: isDarkMode ? '#1C1C1E' : '#E5E5EA', borderRadius: '10px', padding: '3px', marginBottom: '1.5rem', maxWidth: '500px' }}>
        {[['products', '📦 Produk'], ['alerts', `⚠️ Alert ${totalAlerts > 0 ? `(${totalAlerts})` : ''}`]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ flex: 1, padding: '8px 12px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700',
              backgroundColor: tab === key ? (isDarkMode ? '#2C2C2E' : '#FFF') : 'transparent',
              color: tab === key ? text : sub,
              boxShadow: tab === key ? '0 1px 4px rgba(0,0,0,0.12)' : 'none' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Search */}
      {tab === 'products' && (
        <div style={{ position: 'relative', marginBottom: '1.5rem', maxWidth: '400px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: sub }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari produk..." style={{ ...inputStyle, paddingLeft: '36px' }} />
        </div>
      )}

      {/* ─── Products Tab ───────────────────────────────────────────────── */}
      {tab === 'products' && (
        <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '12px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '600px' }}>
            <thead>
              <tr style={{ backgroundColor: isDarkMode ? '#1C1C1E' : '#F5F5F7' }}>
                {['Kode', 'Nama Produk', 'Satuan', 'HNA', 'Harga Jual', 'Stok', 'Exp Terdekat', 'Aksi'].map(h => (
                  <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontWeight: '700', color: sub, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${border}` }}>
                    <td style={{ padding: '12px 14px' }}><Skeleton width="60px" height="14px" /></td>
                    <td style={{ padding: '12px 14px' }}><Skeleton width="150px" height="14px" /></td>
                    <td style={{ padding: '12px 14px' }}><Skeleton width="40px" height="14px" /></td>
                    <td style={{ padding: '12px 14px' }}><Skeleton width="80px" height="14px" /></td>
                    <td style={{ padding: '12px 14px' }}><Skeleton width="80px" height="14px" /></td>
                    <td style={{ padding: '12px 14px' }}><Skeleton width="40px" height="14px" /></td>
                    <td style={{ padding: '12px 14px' }}><Skeleton width="100px" height="18px" /></td>
                    <td style={{ padding: '12px 14px' }}><Skeleton width="80px" height="20px" /></td>
                  </tr>
                ))
              ) : (
                filtered.map(p => {
                  const days = daysUntil(p.nearest_expiry);
                  const isLowStock = parseInt(p.total_stock) < p.min_stock;
                  const isExpiring = days !== null && days < 90;
                  return (
                    <tr key={p.id} style={{ borderBottom: `1px solid ${border}` }}>
                      <td style={{ padding: '12px 14px', color: sub, fontFamily: 'monospace', fontSize: '12px' }}>{p.code || '-'}</td>
                      <td style={{ padding: '12px 14px', fontWeight: '600', color: text }}>{p.name}</td>
                      <td style={{ padding: '12px 14px', color: sub }}>{p.unit}</td>
                      <td style={{ padding: '12px 14px', color: text }}>{fmtRp(p.hna)}</td>
                      <td style={{ padding: '12px 14px', color: text }}>{fmtRp(p.sell_price)}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ fontWeight: '700', color: isLowStock ? '#FF3B30' : '#34C759' }}>{p.total_stock}</span>
                        {isLowStock && <span style={{ fontSize: '10px', color: '#FF3B30', marginLeft: '4px' }}>⚠ Low</span>}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {p.nearest_expiry ? (
                          <span style={{
                            fontSize: '12px', fontWeight: '600',
                            color: days !== null && days <= 0 ? '#FF3B30' : isExpiring ? (days < 30 ? '#FF3B30' : '#FF9500') : '#34C759',
                            padding: '2px 8px', borderRadius: '6px',
                            backgroundColor: days !== null && days <= 0 ? '#FF3B3018' : isExpiring ? '#FF950018' : 'transparent',
                          }}>
                            {fmtDate(p.nearest_expiry)} {days !== null && days <= 0 && '⛔ EXPIRED'}{isExpiring && days > 0 && `(${days}d)`}
                          </span>
                        ) : <span style={{ color: sub }}>-</span>}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button onClick={() => openStockIn(p)} title="Stok Masuk" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><ArrowDownCircle size={15} color="#34C759" /></button>
                          <button onClick={() => openStockOut(p)} title="Stok Keluar" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><ArrowUpCircle size={15} color="#FF9500" /></button>
                          <button onClick={() => openEditProduct(p)} title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><Edit2 size={15} color="#007AFF" /></button>
                          <button onClick={() => deleteProduct(p.id)} title="Hapus" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><Trash2 size={15} color="#FF3B30" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
              {!loading && !filtered.length && <tr><td colSpan={8} style={{ padding: isMobile ? '1rem' : '2rem', paddingTop: isMobile ? '4rem' : '2rem', textAlign: 'center', color: sub }}>Belum ada produk. Klik "Produk" untuk menambahkan.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Alerts Tab ─────────────────────────────────────────────────── */}
      {tab === 'alerts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Expiring Soon */}
          <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '12px', padding: '18px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: '700', color: '#FF9500', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={18} /> Mendekati Expired ({alerts.expiring.length})
            </h3>
            {alerts.expiring.length ? alerts.expiring.map((b, i) => {
              const days = daysUntil(b.expired_date);
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < alerts.expiring.length - 1 ? `1px solid ${border}` : 'none' }}>
                  <div>
                    <span style={{ fontWeight: '600', color: text }}>{b.product_name}</span>
                    <span style={{ marginLeft: '8px', fontSize: '12px', color: sub }}>Batch: {b.batch_no || '-'} • Qty: {b.qty_current} {b.unit}</span>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', backgroundColor: days < 30 ? '#FF3B3018' : '#FF950018', color: days < 30 ? '#FF3B30' : '#FF9500' }}>
                    {days <= 0 ? 'EXPIRED!' : `${days} hari lagi`}
                  </span>
                </div>
              );
            }) : <p style={{ color: sub, fontSize: '14px', margin: 0 }}>✅ Tidak ada produk mendekati expired.</p>}
          </div>

          {/* Low Stock */}
          <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '12px', padding: '18px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: '700', color: '#FF3B30', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={18} /> Stok Rendah ({alerts.lowStock.length})
            </h3>
            {loading ? (
              [...Array(3)].map((_, i) => (
                <div key={i} style={{ padding: '12px 0', borderBottom: i < 2 ? `1px solid ${border}` : 'none' }}>
                  <Skeleton width="40%" height="14px" className="mb-2" />
                  <Skeleton width="60%" height="12px" />
                </div>
              ))
            ) : alerts.lowStock.length ? alerts.lowStock.map((p, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < alerts.lowStock.length - 1 ? `1px solid ${border}` : 'none' }}>
                <span style={{ fontWeight: '600', color: text }}>{p.name}</span>
                <span style={{ fontSize: '12px', color: '#FF3B30', fontWeight: '600' }}>{p.total_stock} / min {p.min_stock}</span>
              </div>
            )) : <p style={{ color: sub, fontSize: '14px', margin: 0 }}>✅ Semua stok di atas minimum.</p>}
          </div>
        </div>
      )}

      {/* ─── Product Modal ──────────────────────────────────────────────── */}
      {showModal === 'product' && (
        <div onClick={() => setShowModal(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: cardBg, borderRadius: '16px', width: '100%', maxWidth: '480px', overflow: 'hidden', boxShadow: '0 32px 64px rgba(0,0,0,0.35)' }}>
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: text }}>{editId ? '✏️ Edit Produk' : '➕ Produk Baru'}</h3>
              <button onClick={() => setShowModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color={sub} /></button>
            </div>
            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div><label style={labelStyle}>Kode</label><input value={pForm.code} onChange={e => setPForm(p => ({ ...p, code: e.target.value }))} placeholder="OBT-001" style={inputStyle} /></div>
                <div><label style={labelStyle}>Kategori</label><input value={pForm.category} onChange={e => setPForm(p => ({ ...p, category: e.target.value }))} placeholder="Obat, Nutrisi..." style={inputStyle} /></div>
              </div>
              <div><label style={labelStyle}>Nama Produk *</label><input value={pForm.name} onChange={e => setPForm(p => ({ ...p, name: e.target.value }))} placeholder="Paracetamol 500mg" style={inputStyle} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div><label style={labelStyle}>Satuan</label><input value={pForm.unit} onChange={e => setPForm(p => ({ ...p, unit: e.target.value }))} placeholder="pcs" style={inputStyle} /></div>
                <div><label style={labelStyle}>HNA</label><input type="number" value={pForm.hna} onChange={e => setPForm(p => ({ ...p, hna: parseFloat(e.target.value) || 0 }))} style={inputStyle} /></div>
                <div><label style={labelStyle}>Harga Jual</label><input type="number" value={pForm.sell_price} onChange={e => setPForm(p => ({ ...p, sell_price: parseFloat(e.target.value) || 0 }))} style={inputStyle} /></div>
              </div>
              <div><label style={labelStyle}>Stok Minimum</label><input type="number" value={pForm.min_stock} onChange={e => setPForm(p => ({ ...p, min_stock: parseInt(e.target.value) || 0 }))} style={inputStyle} /></div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                <button onClick={saveProduct} style={{ flex: 1, padding: '13px', backgroundColor: '#007AFF', color: '#FFF', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>{editId ? 'Simpan' : 'Tambah'}</button>
                <button onClick={() => setShowModal(null)} style={{ flex: 1, padding: '13px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', color: text, border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Batal</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Stock In Modal ──────────────────────────────────────────────── */}
      {showModal === 'stockIn' && (
        <div onClick={() => setShowModal(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: cardBg, borderRadius: '16px', width: '100%', maxWidth: '440px', overflow: 'hidden', boxShadow: '0 32px 64px rgba(0,0,0,0.35)' }}>
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#34C759' }}>📥 Stok Masuk</h3>
              <button onClick={() => setShowModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color={sub} /></button>
            </div>
            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Produk *</label>
                <MasterSelect
                  value={siForm.product_name}
                  onChange={v => {
                    setSiForm(pv => ({ ...pv, product_name: v }));
                    const prod = products.find(p => p.name === v);
                    if (prod) setSiForm(pv => ({ ...pv, hna: prod.hna || 0 }));
                  }}
                  options={products.map(p => ({ name: p.name }))}
                  onAdd={handleAddProduct}
                  onRemove={handleRemoveProduct}
                  isDarkMode={isDarkMode}
                  placeholder="Pilih atau tambah produk..."
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div><label style={labelStyle}>No. Batch</label><input value={siForm.batch_no} onChange={e => setSiForm(p => ({ ...p, batch_no: e.target.value }))} placeholder="B2603-01" style={inputStyle} /></div>
                <div><label style={labelStyle}>Qty</label><input type="number" value={siForm.qty} min="1" onChange={e => setSiForm(p => ({ ...p, qty: parseInt(e.target.value) || 0 }))} style={inputStyle} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div><label style={labelStyle}>HNA / HPP</label><input type="number" step="0.01" value={siForm.hna} onChange={e => setSiForm(p => ({ ...p, hna: parseFloat(e.target.value) || 0 }))} style={inputStyle} /></div>
                <div><label style={labelStyle}>Tanggal Expired</label><input type="date" value={siForm.expired_date} onChange={e => setSiForm(p => ({ ...p, expired_date: e.target.value }))} style={inputStyle} /></div>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                <button onClick={saveStockIn} style={{ flex: 1, padding: '13px', backgroundColor: '#34C759', color: '#FFF', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>Simpan</button>
                <button onClick={() => setShowModal(null)} style={{ flex: 1, padding: '13px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', color: text, border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Batal</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Stock Out Modal ─────────────────────────────────────────────── */}
      {showModal === 'stockOut' && (
        <div onClick={() => setShowModal(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: cardBg, borderRadius: '16px', width: '100%', maxWidth: '440px', overflow: 'hidden', boxShadow: '0 32px 64px rgba(0,0,0,0.35)' }}>
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#FF9500' }}>📤 Stok Keluar</h3>
              <button onClick={() => setShowModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color={sub} /></button>
            </div>
            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Produk *</label>
                <select value={soForm.product_id} onChange={e => setSoForm(p => ({ ...p, product_id: parseInt(e.target.value) }))} style={inputStyle}>
                  <option value="">Pilih produk...</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} (stok: {p.total_stock})</option>)}
                </select>
              </div>
              <div><label style={labelStyle}>Qty</label><input type="number" value={soForm.qty} min="1" onChange={e => setSoForm(p => ({ ...p, qty: parseInt(e.target.value) || 0 }))} style={inputStyle} /></div>
              <div><label style={labelStyle}>Catatan</label><input value={soForm.notes} onChange={e => setSoForm(p => ({ ...p, notes: e.target.value }))} placeholder="Alasan stok keluar" style={inputStyle} /></div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                <button onClick={saveStockOut} style={{ flex: 1, padding: '13px', backgroundColor: '#FF9500', color: '#FFF', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>Keluarkan</button>
                <button onClick={() => setShowModal(null)} style={{ flex: 1, padding: '13px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', color: text, border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Batal</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Opname Modal ────────────────────────────────────────────────── */}
      {showModal === 'opname' && (
        <div onClick={() => setShowModal(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: cardBg, borderRadius: '16px', width: '100%', maxWidth: '640px', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 32px 64px rgba(0,0,0,0.35)' }}>
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, backgroundColor: cardBg, zIndex: 1 }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#FF9500' }}>📋 Stok Opname</h3>
              <button onClick={() => setShowModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color={sub} /></button>
            </div>
            <div style={{ padding: '20px 22px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr>
                    {['Produk', 'Stok Sistem', 'Stok Fisik', 'Selisih'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: '700', color: sub, fontSize: '11px', textTransform: 'uppercase', borderBottom: `1px solid ${border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {opItems.map((item, idx) => {
                    const diff = item.physical_qty - item.system_qty;
                    return (
                      <tr key={idx} style={{ borderBottom: `1px solid ${border}` }}>
                        <td style={{ padding: '8px 10px', fontWeight: '600', color: text }}>{item.product_name}</td>
                        <td style={{ padding: '8px 10px', color: sub }}>{item.system_qty}</td>
                        <td style={{ padding: '8px 10px' }}>
                          <input type="number" value={item.physical_qty} min="0" onChange={e => {
                            const newItems = [...opItems];
                            newItems[idx] = { ...newItems[idx], physical_qty: parseInt(e.target.value) || 0 };
                            setOpItems(newItems);
                          }} style={{ ...inputStyle, width: '80px', padding: '6px 8px', textAlign: 'center' }} />
                        </td>
                        <td style={{ padding: '8px 10px', fontWeight: '700', color: diff === 0 ? sub : (diff > 0 ? '#34C759' : '#FF3B30') }}>
                          {diff === 0 ? '—' : (diff > 0 ? `+${diff}` : diff)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                <button onClick={saveOpname} style={{ flex: 1, padding: '13px', backgroundColor: '#FF9500', color: '#FFF', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>Simpan Opname</button>
                <button onClick={() => setShowModal(null)} style={{ flex: 1, padding: '13px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', color: text, border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Batal</button>
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
        title="Nonaktifkan Produk"
        message="Apakah Anda yakin ingin menonaktifkan produk ini?"
        isDarkMode={isDarkMode}
      />

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', backgroundColor: '#34C759', color: '#FFF', padding: '12px 20px', borderRadius: '10px', fontWeight: '600', fontSize: '14px', boxShadow: '0 8px 24px rgba(0,0,0,0.2)', zIndex: 99999 }}>
          ✅ {toast}
        </div>
      )}
    </div>
  );
}
