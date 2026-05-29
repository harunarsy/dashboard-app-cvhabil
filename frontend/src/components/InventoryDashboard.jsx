import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, Search, AlertTriangle, Clock, Trash2, Edit2, X,
  ArrowDownCircle, ArrowUpCircle, ClipboardCheck, ChevronRight, ChevronDown,
  Eye, AlertCircle, FileDown,
} from 'lucide-react';
import { inventoryAPI, printSettingsAPI } from '../services/api';
import { generateInventoryPDF } from '../utils/generateInventoryPDF';
import { BASE_UNITS, PACK_UNITS } from '../constants/units';
import MasterSelect from './MasterSelect';
import Skeleton from './common/Skeleton';
import ConfirmModal from './common/ConfirmModal';
import Breadcrumb from './common/Breadcrumb';
import ProductDrawer from './inventory/ProductDrawer';
import OpnameModal from './inventory/OpnameModal';
import { hppFromHna, formatRupiah } from '../utils/rupiah';
import RupiahInput from './common/RupiahInput';

const fmtRp = (n, decimals = 0) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const daysUntil = (d) => d ? Math.ceil((new Date(d) - new Date()) / 86400000) : null;

function expirySeverity(date, isDarkMode) {
  if (!date) return { color: '#86868B', bg: 'transparent', label: '—', plain: true };
  const days = daysUntil(date);
  const redBg = isDarkMode ? '#3A1F1F' : '#FFF5F5';
  const orangeBg = isDarkMode ? '#3A2E0F' : '#FFF8F0';
  if (days <= 0) return { color: '#FF453A', bg: redBg, label: `EXPIRED · ${fmtDate(date)}` };
  if (days < 30) return { color: '#FF453A', bg: redBg, label: `${fmtDate(date)} (${days}d)` };
  if (days < 90) return { color: '#FF9F0A', bg: orangeBg, label: `${fmtDate(date)} (${days}d)` };
  return { color: '#34C759', bg: 'transparent', label: fmtDate(date), plain: true };
}

export default function InventoryDashboard({ isDarkMode, isSidebarOpen, isMobile, isVantaMode }) {
  const [tab, setTab] = useState('products');
  const [products, setProducts] = useState([]);
  const [alerts, setAlerts] = useState({ expiring: [], lowStock: [] });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | low | expiring | expired
  const [showModal, setShowModal] = useState(null); // null | 'product' | 'stockIn' | 'stockOut' | 'opname'
  const [editId, setEditId] = useState(null);
  const [toast, setToast] = useState({ msg: '', type: 'success' });
  const [modalError, setModalError] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Expand + Drawer state (Phase 2 additions)
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [batchesCache, setBatchesCache] = useState({});
  const [batchesLoading, setBatchesLoading] = useState({});
  const [drawerProductId, setDrawerProductId] = useState(null);

  // Product form (v1.6.0 multi-unit: base_unit + pack_unit + pack_size + sell_price_pack; v1.7.0 tiers)
  const [pForm, setPForm] = useState({ code: '', name: '', unit: 'pcs', hna: 0, sell_price: 0, category: '', min_stock: 5, base_unit: 'pcs', pack_unit: '', pack_size: 1, sell_price_pack: 0, price_tiers: [] });
  // Stock in form
  const [siForm, setSiForm] = useState({ product_name: '', batch_no: '', expired_date: '', qty: 1, hna: 0 });
  // Stock out form (v1.7.0: selected_batch_id untuk manual batch override)
  const [soForm, setSoForm] = useState({ product_id: '', qty: 1, notes: '', selected_batch_id: '' });
  const [soBatches, setSoBatches] = useState([]);
  // Modal save loading flags
  const [modalSaving, setModalSaving] = useState(false);

  const bg = isDarkMode ? '#000' : '#F5F5F7';
  const cardBg = isDarkMode ? '#1C1C1E' : '#FFF';
  const border = isDarkMode ? '#2C2C2E' : '#E5E5EA';
  const text = isDarkMode ? '#FFF' : '#000';
  const sub = '#86868B';
  const surface = isDarkMode ? '#2C2C2E' : '#F5F5F7';

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await inventoryAPI.getProducts();
      setProducts(data);
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => setLoading(false), 300);
    }
  }, []);
  const fetchAlerts = useCallback(async () => {
    try { const { data } = await inventoryAPI.getAlerts(); setAlerts(data); } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { fetchProducts(); fetchAlerts(); }, [fetchProducts, fetchAlerts]);

  const fetchBatches = useCallback(async (productId, force = false) => {
    if (!force && batchesCache[productId]) return;
    setBatchesLoading(prev => ({ ...prev, [productId]: true }));
    try {
      const { data } = await inventoryAPI.getProductBatches(productId);
      setBatchesCache(prev => ({ ...prev, [productId]: data }));
    } catch (e) {
      console.error(e);
    } finally {
      setBatchesLoading(prev => ({ ...prev, [productId]: false }));
    }
  }, [batchesCache]);

  const toggleExpand = (productId) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else { next.add(productId); fetchBatches(productId); }
      return next;
    });
  };

  const refreshAfterChange = useCallback(async (productId) => {
    await Promise.all([
      fetchProducts(),
      fetchAlerts(),
      productId ? fetchBatches(productId, true) : Promise.resolve(),
    ]);
  }, [fetchProducts, fetchAlerts, fetchBatches]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(q)
        || (p.code || '').toLowerCase().includes(q)
        || (p.category || '').toLowerCase().includes(q);
      if (!matchSearch) return false;
      if (statusFilter === 'all') return true;
      const stock = parseInt(p.total_stock) || 0;
      const days = daysUntil(p.nearest_expiry);
      if (statusFilter === 'low') return stock < p.min_stock;
      if (statusFilter === 'expiring') return days !== null && days > 0 && days < 90;
      if (statusFilter === 'expired') return days !== null && days <= 0;
      return true;
    });
  }, [products, search, statusFilter]);

  // v1.10.2: total nilai persediaan = Σ HPP(inc PPN) × stok (ikut filter aktif)
  const totalNilai = useMemo(() => filtered.reduce((s, p) => s + hppFromHna(p.hna) * (parseInt(p.total_stock) || 0), 0), [filtered]);

  const flashSuccess = (msg) => { setToast({ msg, type: 'success' }); setTimeout(() => setToast({ msg: '', type: 'success' }), 2500); };
  const flashError = (msg) => { setToast({ msg, type: 'error' }); setTimeout(() => setToast({ msg: '', type: 'success' }), 3500); };

  const inputStyle = {
    width: '100%', padding: '10px 12px', border: `1px solid ${border}`,
    borderRadius: '10px', backgroundColor: surface, color: text, fontSize: '14px',
    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  };
  const labelStyle = { display: 'block', fontSize: '11px', fontWeight: '700', color: sub, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' };

  // ─── Product CRUD ─────────────────────────────────────────────────────
  const openAddProduct = () => { setEditId(null); setPForm({ code: '', name: '', unit: 'pcs', hna: 0, sell_price: 0, category: '', min_stock: 5, base_unit: 'pcs', pack_unit: '', pack_size: 1, sell_price_pack: 0, price_tiers: [] }); setModalError(''); setShowModal('product'); };
  const openEditProduct = async (p) => {
    setEditId(p.id);
    setPForm({ code: p.code || '', name: p.name, unit: p.unit || 'pcs', hna: parseFloat(p.hna) || 0, sell_price: parseFloat(p.sell_price) || 0, category: p.category || '', min_stock: p.min_stock || 5, base_unit: p.base_unit || p.unit || 'pcs', pack_unit: p.pack_unit || '', pack_size: parseInt(p.pack_size) || 1, sell_price_pack: parseFloat(p.sell_price_pack) || 0, price_tiers: [] });
    setModalError(''); setShowModal('product');
    // v1.7.0: fetch tiers async
    try {
      const { data } = await inventoryAPI.getProductTiers(p.id);
      setPForm(prev => ({ ...prev, price_tiers: data || [] }));
    } catch (e) { /* tiers optional, skip silently */ }
  };
  // v1.7.0 tier handlers
  const addTier = () => setPForm(p => ({ ...p, price_tiers: [...(p.price_tiers || []), { unit: p.base_unit || 'pcs', min_qty: 1, max_qty: '', price: 0 }] }));
  const updateTier = (idx, field, value) => setPForm(p => { const n = [...(p.price_tiers || [])]; n[idx] = { ...n[idx], [field]: value }; return { ...p, price_tiers: n }; });
  const removeTier = (idx) => setPForm(p => ({ ...p, price_tiers: (p.price_tiers || []).filter((_, i) => i !== idx) }));
  const saveProduct = async () => {
    if (!pForm.name.trim()) { setModalError('Nama produk wajib diisi'); return; }
    setModalError('');
    setModalSaving(true);
    try {
      let productId = editId;
      if (editId) { await inventoryAPI.updateProduct(editId, pForm); }
      else {
        const { data: created } = await inventoryAPI.createProduct(pForm);
        productId = created?.id;
      }
      // v1.7.0: PUT tiers (bulk replace) — kalau ada perubahan
      if (productId) {
        await inventoryAPI.updateProductTiers(productId, pForm.price_tiers || []);
      }
      flashSuccess(editId ? 'Produk diperbarui' : 'Produk ditambahkan');
      setShowModal(null); fetchProducts();
    } catch (e) {
      const msg = e.response?.data?.error || e.message;
      setModalError(msg);
    } finally { setModalSaving(false); }
  };
  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    try { await inventoryAPI.deleteProduct(deleteConfirmId); flashSuccess('Produk dinonaktifkan'); fetchProducts(); }
    catch (e) { flashError(e.response?.data?.error || e.message); }
    finally { setDeleteConfirmId(null); }
  };

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
    setSiForm({ product_name: p?.name || '', batch_no: '', expired_date: '', qty: 1, hna: parseFloat(p?.hna) || 0 });
    setModalError(''); setShowModal('stockIn');
  };
  const saveStockIn = async () => {
    if (!siForm.product_name || !siForm.qty) { setModalError('Pilih produk dan qty'); return; }
    setModalSaving(true);
    try {
      const prod = products.find(p => p.name === siForm.product_name);
      if (!prod) { setModalError('Produk tidak ditemukan'); setModalSaving(false); return; }
      const payload = { ...siForm, product_id: prod.id };
      delete payload.product_name;
      await inventoryAPI.stockIn(payload);
      flashSuccess('Stok masuk berhasil');
      setShowModal(null);
      refreshAfterChange(prod.id);
    } catch (e) {
      setModalError(e.response?.data?.error || e.message);
    } finally { setModalSaving(false); }
  };

  // ─── Stock Out ────────────────────────────────────────────────────────
  const loadStockOutBatches = useCallback(async (productId) => {
    if (!productId) { setSoBatches([]); return; }
    try {
      const { data } = await inventoryAPI.getProductBatches(productId);
      setSoBatches((data || []).filter(b => b.qty_current > 0));
    } catch (e) { setSoBatches([]); }
  }, []);
  const openStockOut = (p) => {
    setSoForm({ product_id: p?.id || '', qty: 1, notes: '', selected_batch_id: '' });
    setModalError('');
    setShowModal('stockOut');
    if (p?.id) loadStockOutBatches(p.id);
    else setSoBatches([]);
  };
  const saveStockOut = async () => {
    if (!soForm.product_id || !soForm.qty) { setModalError('Pilih produk dan qty'); return; }
    setModalSaving(true);
    try {
      const payload = { ...soForm };
      if (!payload.selected_batch_id) delete payload.selected_batch_id; // kirim hanya kalau ada override
      await inventoryAPI.stockOut(payload);
      flashSuccess(payload.selected_batch_id ? 'Stok keluar berhasil (manual batch)' : 'Stok keluar berhasil (FEFO)');
      setShowModal(null);
      refreshAfterChange(soForm.product_id);
    } catch (e) {
      setModalError(e.response?.data?.error || e.message);
    } finally { setModalSaving(false); }
  };

  const handleExportOpnameTemplate = async () => {
    try {
      let settings = {};
      try { const { data } = await printSettingsAPI.get(); settings = data?.nota_layout || data || {}; } catch (_) { /* fallback default */ }
      const { data: rows } = await inventoryAPI.getOpnameTemplate();
      const doc = generateInventoryPDF(rows, { settings });
      const stamp = new Date().toISOString().slice(0, 10);
      doc.save(`Template_Opname_${stamp}.pdf`);
      flashSuccess('Template opname berhasil diunduh');
    } catch (e) {
      flashError(`Gagal generate PDF: ${e.message}`);
    }
  };

  const totalAlerts = alerts.expiring.length + alerts.lowStock.length;
  const headerBtn = (color, Icon, label, onClick) => (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px',
      backgroundColor: color, color: '#FFF', border: 'none', borderRadius: '10px',
      cursor: 'pointer', fontWeight: '700', fontSize: '13px',
      boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
    }}>
      <Icon size={16} /> {label}
    </button>
  );

  return (
    <div style={{ padding: isMobile ? '1rem' : '2rem', paddingTop: isMobile ? '4rem' : '2rem', backgroundColor: isVantaMode ? 'transparent' : bg, minHeight: '100vh', transition: 'margin-left 0.3s' }}>
      <Breadcrumb title="Inventory" isMobile={isMobile} isDarkMode={isDarkMode} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: '700', margin: 0, color: text }}>📦 Inventory & Stok</h1>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: sub }}>
            {loading ? <Skeleton width="200px" height="14px" /> : <>{products.length} produk aktif • {totalAlerts > 0 ? `⚠️ ${totalAlerts} alert` : '✅ Semua aman'}</>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {headerBtn('#007AFF', Plus, 'Produk', openAddProduct)}
          {headerBtn('#34C759', ArrowDownCircle, 'Stok Masuk', () => openStockIn(null))}
          {headerBtn('#FF9500', ArrowUpCircle, 'Stok Keluar', () => openStockOut(null))}
          {headerBtn('#5E5CE6', ClipboardCheck, 'Opname', () => setShowModal('opname'))}
          {headerBtn('#8E8E93', FileDown, 'Cetak Template', handleExportOpnameTemplate)}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', backgroundColor: isDarkMode ? '#1C1C1E' : '#E5E5EA', borderRadius: '10px', padding: '3px', marginBottom: '1.5rem', maxWidth: '500px' }}>
        {[['products', '📦 Produk'], ['alerts', `⚠️ Alert ${totalAlerts > 0 ? `(${totalAlerts})` : ''}`]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ flex: 1, padding: '8px 12px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700',
              backgroundColor: tab === key ? cardBg : 'transparent',
              color: tab === key ? text : sub,
              boxShadow: tab === key ? '0 1px 4px rgba(0,0,0,0.12)' : 'none' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Search + filter */}
      {tab === 'products' && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: '420px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: sub }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari produk, kode, kategori..." style={{ ...inputStyle, paddingLeft: '36px' }} />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...inputStyle, maxWidth: '180px', cursor: 'pointer' }}>
            <option value="all">Semua status</option>
            <option value="low">Stok rendah</option>
            <option value="expiring">Mendekati expired</option>
            <option value="expired">Sudah expired</option>
          </select>
        </div>
      )}

      {/* ─── Products Tab ───────────────────────────────────────────────── */}
      {tab === 'products' && (
        <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '760px' }}>
              <thead>
                <tr style={{ backgroundColor: surface }}>
                  <th style={thStyle(sub, border)} aria-label="Expand"></th>
                  <th style={thStyle(sub, border)}>Kode</th>
                  <th style={thStyle(sub, border)}>Nama Produk</th>
                  <th style={thStyle(sub, border)}>Satuan</th>
                  <th style={{ ...thStyle(sub, border), textAlign: 'right' }} title="Harga Netto Apotek - raw, sebelum PPN 11%">HNA<br/><span style={{ fontSize: '10px', fontWeight: '400', color: sub }}>(exc PPN)</span></th>
                  <th style={{ ...thStyle(sub, border), textAlign: 'right' }} title="Harga Pokok Penjualan = HNA + PPN 11%">HPP<br/><span style={{ fontSize: '10px', fontWeight: '400', color: sub }}>(inc PPN)</span></th>
                  <th style={{ ...thStyle(sub, border), textAlign: 'right' }}>Harga Jual</th>
                  <th style={{ ...thStyle(sub, border), textAlign: 'center' }}>Stok</th>
                  <th style={{ ...thStyle(sub, border), textAlign: 'right' }} title="Nilai persediaan = HPP (inc PPN 11%) × stok">Nilai</th>
                  <th style={thStyle(sub, border)}>Exp Terdekat</th>
                  <th style={{ ...thStyle(sub, border), textAlign: 'right' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${border}` }}>
                      <td style={tdStyle}></td>
                      <td style={tdStyle}><Skeleton width="60px" height="14px" /></td>
                      <td style={tdStyle}><Skeleton width="150px" height="14px" /></td>
                      <td style={tdStyle}><Skeleton width="40px" height="14px" /></td>
                      <td style={tdStyle}><Skeleton width="80px" height="14px" /></td>
                      <td style={tdStyle}><Skeleton width="80px" height="14px" /></td>
                      <td style={tdStyle}><Skeleton width="80px" height="14px" /></td>
                      <td style={tdStyle}><Skeleton width="40px" height="14px" /></td>
                      <td style={tdStyle}><Skeleton width="100px" height="18px" /></td>
                      <td style={tdStyle}><Skeleton width="80px" height="20px" /></td>
                    </tr>
                  ))
                ) : (
                  filtered.map(p => {
                    const sev = expirySeverity(p.nearest_expiry, isDarkMode);
                    const stock = parseInt(p.total_stock) || 0;
                    const minStockNum = parseInt(p.min_stock) || 0;
                    const hasMinStock = minStockNum > 0;
                    const isLowStock = hasMinStock && stock < minStockNum;
                    const isExpanded = expandedIds.has(p.id);
                    // Bar visible HANYA bila min_stock terdefinisi (> 0). Tanpa threshold = no gauge.
                    const stockPct = hasMinStock ? Math.min(100, (stock / (minStockNum * 2)) * 100) : 0;
                    const stockColor = stock <= 0 ? '#FF3B30' : isLowStock ? '#FF9500' : '#34C759';
                    return (
                      <React.Fragment key={p.id}>
                        <tr style={{ borderBottom: `1px solid ${border}`, background: isExpanded ? surface : 'transparent' }}>
                          <td style={{ ...tdStyle, width: '36px' }}>
                            <button onClick={() => toggleExpand(p.id)} aria-label={isExpanded ? 'Tutup batch' : 'Lihat batch'} style={{
                              background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px',
                              display: 'flex', alignItems: 'center', color: sub,
                              transform: isExpanded ? 'rotate(0deg)' : 'rotate(0deg)',
                            }}>
                              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </button>
                          </td>
                          <td style={{ ...tdStyle, color: sub, fontFamily: 'monospace', fontSize: '12px' }}>{p.code || '—'}</td>
                          <td style={tdStyle}>
                            <button onClick={() => setDrawerProductId(p.id)} style={{
                              background: 'transparent', border: 'none', cursor: 'pointer',
                              padding: 0, fontWeight: '600', color: text, fontSize: '13px',
                              textAlign: 'left', fontFamily: 'inherit',
                            }}>{p.name}</button>
                            {p.category && <p style={{ margin: '2px 0 0', fontSize: '11px', color: sub }}>{p.category}</p>}
                          </td>
                          <td style={{ ...tdStyle, color: sub }}>{p.unit}</td>
                          <td style={{ ...tdStyle, color: text, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtRp(p.hna)}</td>
                          <td style={{ ...tdStyle, color: text, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtRp(hppFromHna(p.hna))}</td>
                          <td style={{ ...tdStyle, color: text, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtRp(p.sell_price)}</td>
                          <td style={{ ...tdStyle, textAlign: 'center', verticalAlign: 'middle' }}>
                            <div
                              aria-label={hasMinStock ? `Stok ${stock} dari minimum ${minStockNum}` : `Stok ${stock}`}
                              style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: '52px' }}
                            >
                              <span style={{ fontWeight: '700', color: stockColor, fontSize: '14px', fontVariantNumeric: 'tabular-nums' }}>{stock}</span>
                              {hasMinStock && (
                                <div style={{ width: '40px', height: '4px', background: isDarkMode ? '#2C2C2E' : '#E5E5EA', borderRadius: '2px', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${stockPct}%`, background: stockColor, transition: 'width 0.3s' }} />
                                </div>
                              )}
                            </div>
                          </td>
                          <td style={{ ...tdStyle, color: text, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: '600' }}>{fmtRp(hppFromHna(p.hna) * stock)}</td>
                          <td style={{ ...tdStyle, verticalAlign: 'middle' }}>
                            {p.nearest_expiry ? (
                              sev.plain ? (
                                <span style={{ fontSize: '12px', fontWeight: '600', color: sev.color, fontVariantNumeric: 'tabular-nums' }}>
                                  {sev.label}
                                </span>
                              ) : (
                                <span style={{ fontSize: '12px', fontWeight: '600', color: sev.color, padding: '3px 8px', borderRadius: '6px', backgroundColor: sev.bg, fontVariantNumeric: 'tabular-nums', display: 'inline-block' }}>
                                  {sev.label}
                                </span>
                              )
                            ) : <span style={{ color: sub }}>—</span>}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '2px' }}>
                              <IconBtn onClick={() => setDrawerProductId(p.id)} label="Lihat detail" Icon={Eye} color={sub} />
                              <IconBtn onClick={() => openStockIn(p)} label="Stok Masuk" Icon={ArrowDownCircle} color="#34C759" />
                              <IconBtn onClick={() => openStockOut(p)} label="Stok Keluar" Icon={ArrowUpCircle} color="#FF9500" />
                              <IconBtn onClick={() => openEditProduct(p)} label="Edit Produk" Icon={Edit2} color="#007AFF" />
                              <IconBtn onClick={() => setDeleteConfirmId(p.id)} label="Nonaktifkan" Icon={Trash2} color="#FF3B30" />
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr style={{ background: surface, borderBottom: `1px solid ${border}` }}>
                            <td></td>
                            <td colSpan={9} style={{ padding: '8px 14px 16px' }}>
                              <ExpandedBatches
                                productId={p.id}
                                product={p}
                                batches={batchesCache[p.id]}
                                loading={batchesLoading[p.id]}
                                sub={sub} text={text} border={border} cardBg={cardBg} isDarkMode={isDarkMode}
                                onAddBatch={() => openStockIn(p)}
                                onOpenDrawer={() => setDrawerProductId(p.id)}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
                {!loading && !filtered.length && (
                  <tr><td colSpan={10} style={{ padding: '3rem 1rem', textAlign: 'center', color: sub }}>
                    {search || statusFilter !== 'all' ? 'Tidak ada produk yang cocok dengan filter.' : 'Belum ada produk. Klik "Produk" untuk menambahkan.'}
                  </td></tr>
                )}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: `2px solid ${border}` }}>
                  <td colSpan={8} style={{ ...tdStyle, textAlign: 'right', fontWeight: '700', color: text }}>Total Nilai Inventaris (inc PPN) <span style={{ fontWeight: '400', color: sub, fontSize: '11px' }}>(sesuai filter aktif)</span></td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: '800', color: text, fontVariantNumeric: 'tabular-nums' }}>{fmtRp(totalNilai)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ─── Alerts Tab ─────────────────────────────────────────────────── */}
      {tab === 'alerts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '18px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: '700', color: '#FF9500', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={18} /> Mendekati Expired ({alerts.expiring.length})
            </h3>
            {alerts.expiring.length ? alerts.expiring.map((b, i) => {
              const days = daysUntil(b.expired_date);
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < alerts.expiring.length - 1 ? `1px solid ${border}` : 'none' }}>
                  <div>
                    <span style={{ fontWeight: '600', color: text }}>{b.product_name}</span>
                    <span style={{ marginLeft: '8px', fontSize: '12px', color: sub }}>Batch: {b.batch_no || '—'} · Qty: {b.qty_current} {b.unit}</span>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', backgroundColor: days < 30 ? '#FF3B3018' : '#FF950018', color: days < 30 ? '#FF3B30' : '#FF9500' }}>
                    {days <= 0 ? 'EXPIRED!' : `${days} hari lagi`}
                  </span>
                </div>
              );
            }) : <p style={{ color: sub, fontSize: '14px', margin: 0 }}>✅ Tidak ada produk mendekati expired.</p>}
          </div>

          <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '18px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: '700', color: '#FF3B30', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={18} /> Stok Rendah ({alerts.lowStock.length})
            </h3>
            {alerts.lowStock.length ? alerts.lowStock.map((p, i) => (
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
        <ModalShell onClose={() => setShowModal(null)} cardBg={cardBg} title={editId ? '✏️ Edit Produk' : '➕ Produk Baru'} text={text} border={border} sub={sub} isMobile={isMobile} maxWidth="520px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div><label style={labelStyle}>Kode</label><input value={pForm.code} onChange={e => setPForm(p => ({ ...p, code: e.target.value }))} placeholder="OBT-001" style={inputStyle} /></div>
              <div><label style={labelStyle}>Kategori</label><input value={pForm.category} onChange={e => setPForm(p => ({ ...p, category: e.target.value }))} placeholder="Obat, Nutrisi..." style={inputStyle} /></div>
            </div>
            <div><label style={labelStyle}>Nama Produk *</label><input value={pForm.name} onChange={e => { setPForm(p => ({ ...p, name: e.target.value })); setModalError(''); }} placeholder="Paracetamol 500mg" style={inputStyle} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Satuan Eceran *</label>
                <select value={pForm.base_unit || pForm.unit || 'pcs'} onChange={e => setPForm(p => ({ ...p, base_unit: e.target.value, unit: e.target.value }))} style={inputStyle}>
                  {BASE_UNITS.map((u, i) => <option key={`${u.value}-${i}`} value={u.value}>{u.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle} title="Harga Netto Apotek (raw, exc PPN)">HNA / eceran (exc PPN)</label>
                <RupiahInput value={pForm.hna} decimals={2} onChange={v => setPForm(p => ({ ...p, hna: v }))} style={inputStyle} />
              </div>
              <div><label style={labelStyle}>Jual / eceran</label><input type="number" value={pForm.sell_price} onChange={e => setPForm(p => ({ ...p, sell_price: parseFloat(e.target.value) || 0 }))} style={inputStyle} /></div>
            </div>
            {parseFloat(pForm.hna) > 0 && (
              <p style={{ margin: '0 0 4px', fontSize: '11px', color: sub, padding: '6px 10px', background: surface, borderRadius: '8px' }}>
                HPP per {pForm.base_unit || pForm.unit || 'pcs'} (inc PPN 11%): <strong style={{ color: text }}>{formatRupiah(hppFromHna(pForm.hna), 2)}</strong> · Margin: <strong style={{ color: (pForm.sell_price - hppFromHna(pForm.hna)) > 0 ? '#34C759' : '#FF3B30' }}>{formatRupiah(pForm.sell_price - hppFromHna(pForm.hna), 0)}</strong>
              </p>
            )}

            {/* v1.6.0 Multi-Unit Packaging — optional */}
            <div style={{ background: surface, border: `1px dashed ${border}`, borderRadius: '10px', padding: '12px' }}>
              <p style={{ margin: '0 0 10px', fontSize: '12px', fontWeight: '700', color: text }}>
                📦 Kemasan (opsional) — kalau barang juga dijual per karton/dus
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Satuan Kemasan</label>
                  <select value={pForm.pack_unit || ''} onChange={e => setPForm(p => ({ ...p, pack_unit: e.target.value, pack_size: e.target.value ? (p.pack_size > 1 ? p.pack_size : 12) : 1 }))} style={inputStyle}>
                    <option value="">— Tidak ada —</option>
                    {PACK_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Isi per {pForm.pack_unit || 'kemasan'}</label>
                  <input type="number" min="1" disabled={!pForm.pack_unit} value={pForm.pack_size || 1} onChange={e => setPForm(p => ({ ...p, pack_size: parseInt(e.target.value) || 1 }))} style={{ ...inputStyle, opacity: pForm.pack_unit ? 1 : 0.5 }} />
                </div>
                <div>
                  <label style={labelStyle}>Jual / {pForm.pack_unit || 'kemasan'}</label>
                  <input type="number" disabled={!pForm.pack_unit} value={pForm.sell_price_pack || 0} onChange={e => setPForm(p => ({ ...p, sell_price_pack: parseFloat(e.target.value) || 0 }))} style={{ ...inputStyle, opacity: pForm.pack_unit ? 1 : 0.5 }} />
                </div>
              </div>
              {pForm.pack_unit && pForm.pack_size > 1 && (
                <p style={{ margin: '8px 0 0', fontSize: '11px', color: sub }}>
                  📐 1 {pForm.pack_unit} = {pForm.pack_size} {pForm.base_unit || pForm.unit || 'pcs'}
                  {pForm.sell_price_pack > 0 && pForm.pack_size > 0 && (
                    <> · Per {pForm.base_unit || pForm.unit || 'pcs'}: {fmtRp(pForm.sell_price_pack / pForm.pack_size)}</>
                  )}
                </p>
              )}
            </div>

            {/* v1.7.0 Tiered Pricing (Grosir) — optional */}
            <div style={{ background: surface, border: `1px dashed ${border}`, borderRadius: '10px', padding: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <p style={{ margin: 0, fontSize: '12px', fontWeight: '700', color: text }}>
                  💰 Harga Grosir (Tier) — opsional
                </p>
                <button onClick={addTier} type="button" style={{ background: '#007AFF', color: '#FFF', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: '600' }}>+ Tier</button>
              </div>
              {(pForm.price_tiers || []).length === 0 && (
                <p style={{ margin: 0, fontSize: '11px', color: sub, fontStyle: 'italic' }}>Belum ada tier. Klik "+ Tier" untuk tambah harga grosir per qty.</p>
              )}
              {(pForm.price_tiers || []).map((tier, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.1fr 70px 70px 1fr 28px', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
                  <select value={tier.unit} onChange={e => updateTier(idx, 'unit', e.target.value)} style={{ ...inputStyle, fontSize: '12px', padding: '8px' }}>
                    <option value={pForm.base_unit || 'pcs'}>{pForm.base_unit || 'pcs'}</option>
                    {pForm.pack_unit && <option value={pForm.pack_unit}>{pForm.pack_unit}</option>}
                  </select>
                  <input type="number" min="1" placeholder="Min" value={tier.min_qty} onChange={e => updateTier(idx, 'min_qty', parseInt(e.target.value) || 1)} style={{ ...inputStyle, fontSize: '12px', padding: '8px' }} />
                  <input type="number" placeholder="Max" value={tier.max_qty || ''} onChange={e => updateTier(idx, 'max_qty', e.target.value)} title="Kosongkan = tanpa batas atas" style={{ ...inputStyle, fontSize: '12px', padding: '8px' }} />
                  <input type="number" placeholder="Harga (Rp)" value={tier.price} onChange={e => updateTier(idx, 'price', parseFloat(e.target.value) || 0)} style={{ ...inputStyle, fontSize: '12px', padding: '8px' }} />
                  <button onClick={() => removeTier(idx)} type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}><Trash2 size={14} color="#FF3B30" /></button>
                </div>
              ))}
              {(pForm.price_tiers || []).length > 0 && (
                <p style={{ margin: '6px 0 0', fontSize: '11px', color: sub }}>
                  💡 Auto-apply ke Nota saat qty matches range. Tier dengan <code>min_qty</code> tertinggi yang match = menang.
                </p>
              )}
            </div>

            <div><label style={labelStyle}>Stok Minimum (di {pForm.base_unit || pForm.unit || 'pcs'})</label><input type="number" value={pForm.min_stock} onChange={e => setPForm(p => ({ ...p, min_stock: parseInt(e.target.value) || 0 }))} style={inputStyle} /></div>
            {editId && (
              <div style={{ background: '#007AFF10', border: '1px solid #007AFF30', padding: '10px 12px', borderRadius: '10px', fontSize: '12px', color: text, display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <AlertCircle size={14} style={{ color: '#007AFF', flexShrink: 0, marginTop: '1px' }} />
                <span>Untuk edit batch (no. batch, ED, qty), buka <button onClick={() => { setShowModal(null); setDrawerProductId(editId); }} style={{ background: 'transparent', border: 'none', color: '#007AFF', fontWeight: '700', cursor: 'pointer', padding: 0, font: 'inherit', textDecoration: 'underline' }}>panel detail produk</button> tab <strong>Batch</strong>.</span>
              </div>
            )}
            {modalError && (
              <div style={{ backgroundColor: '#FFF5F5', border: '1px solid #FFE5E5', borderRadius: '10px', padding: '10px 14px', color: '#FF3B30', fontSize: '13px', fontWeight: '600', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} /> <span>{modalError}</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              <button onClick={saveProduct} disabled={modalSaving} style={primaryBtn('#007AFF', modalSaving)}>{modalSaving ? 'Menyimpan...' : (editId ? 'Simpan' : 'Tambah')}</button>
              <button onClick={() => setShowModal(null)} disabled={modalSaving} style={secondaryBtn(surface, text, border)}>Batal</button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* ─── Stock In Modal ──────────────────────────────────────────────── */}
      {showModal === 'stockIn' && (
        <ModalShell onClose={() => setShowModal(null)} cardBg={cardBg} title="📥 Stok Masuk" titleColor="#34C759" text={text} border={border} sub={sub} isMobile={isMobile} maxWidth="480px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Produk *</label>
              <MasterSelect
                value={siForm.product_name}
                onChange={v => {
                  setSiForm(pv => ({ ...pv, product_name: v }));
                  const prod = products.find(p => p.name === v);
                  if (prod) setSiForm(pv => ({ ...pv, hna: parseFloat(prod.hna) || 0 }));
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
              <div><label style={labelStyle}>Qty *</label><input type="number" value={siForm.qty} min="1" onChange={e => setSiForm(p => ({ ...p, qty: parseInt(e.target.value) || 0 }))} style={inputStyle} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle} title="Harga raw per pcs sebelum PPN 11%">HNA / pcs (exc PPN)</label>
                <RupiahInput value={siForm.hna} decimals={2} onChange={v => setSiForm(p => ({ ...p, hna: v }))} style={inputStyle} />
              </div>
              <div><label style={labelStyle}>Tanggal Expired</label><input type="date" value={siForm.expired_date} onChange={e => setSiForm(p => ({ ...p, expired_date: e.target.value }))} style={inputStyle} /></div>
            </div>
            {parseFloat(siForm.hna) > 0 && (
              <p style={{ margin: '-4px 0 0', fontSize: '11px', color: sub, padding: '6px 10px', background: surface, borderRadius: '8px' }}>
                HPP per pcs (inc PPN 11%): <strong style={{ color: text }}>{formatRupiah(hppFromHna(siForm.hna), 2)}</strong>
              </p>
            )}
            {modalError && (
              <div style={{ backgroundColor: '#FFF5F5', border: '1px solid #FFE5E5', borderRadius: '10px', padding: '10px 14px', color: '#FF3B30', fontSize: '13px', fontWeight: '600', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} /> <span>{modalError}</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              <button onClick={saveStockIn} disabled={modalSaving} style={primaryBtn('#34C759', modalSaving)}>{modalSaving ? 'Menyimpan...' : 'Simpan'}</button>
              <button onClick={() => setShowModal(null)} disabled={modalSaving} style={secondaryBtn(surface, text, border)}>Batal</button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* ─── Stock Out Modal ─────────────────────────────────────────────── */}
      {showModal === 'stockOut' && (
        <ModalShell onClose={() => setShowModal(null)} cardBg={cardBg} title="📤 Stok Keluar" titleColor="#FF9500" text={text} border={border} sub={sub} isMobile={isMobile} maxWidth="480px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Produk *</label>
              <select value={soForm.product_id} onChange={e => {
                const newId = parseInt(e.target.value) || '';
                setSoForm(p => ({ ...p, product_id: newId, selected_batch_id: '' }));
                if (newId) loadStockOutBatches(newId); else setSoBatches([]);
              }} style={inputStyle}>
                <option value="">Pilih produk...</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name} (stok: {p.total_stock})</option>)}
              </select>
            </div>
            {/* v1.7.0: Batch dropdown — FEFO default + manual override */}
            {soForm.product_id && soBatches.length > 0 && (
              <div>
                <label style={labelStyle}>Pilih Batch (override FEFO)</label>
                <select value={soForm.selected_batch_id} onChange={e => setSoForm(p => ({ ...p, selected_batch_id: e.target.value }))} style={inputStyle}>
                  <option value="">🤖 Auto FEFO — pilih batch dengan ED terdekat</option>
                  {soBatches.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.batch_no || '(tanpa no)'} · ED: {b.expired_date ? fmtDate(b.expired_date) : '-'} · Stok: {b.qty_current}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div><label style={labelStyle}>Qty *</label><input type="number" value={soForm.qty} min="1" onChange={e => setSoForm(p => ({ ...p, qty: parseInt(e.target.value) || 0 }))} style={inputStyle} /></div>
            <div><label style={labelStyle}>Catatan</label><input value={soForm.notes} onChange={e => setSoForm(p => ({ ...p, notes: e.target.value }))} placeholder="Alasan stok keluar" style={inputStyle} /></div>
            {!soForm.selected_batch_id && (
              <p style={{ margin: 0, fontSize: '11px', color: sub }}>ℹ️ Stok akan diambil otomatis dari batch dengan ED terdekat (FEFO).</p>
            )}
            {soForm.selected_batch_id && (
              <p style={{ margin: 0, fontSize: '11px', color: '#FF9500', fontWeight: '600' }}>⚠️ Mode manual — qty akan dipotong dari batch yang dipilih saja.</p>
            )}
            {modalError && (
              <div style={{ backgroundColor: '#FFF5F5', border: '1px solid #FFE5E5', borderRadius: '10px', padding: '10px 14px', color: '#FF3B30', fontSize: '13px', fontWeight: '600', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} /> <span>{modalError}</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              <button onClick={saveStockOut} disabled={modalSaving} style={primaryBtn('#FF9500', modalSaving)}>{modalSaving ? 'Menyimpan...' : 'Keluarkan'}</button>
              <button onClick={() => setShowModal(null)} disabled={modalSaving} style={secondaryBtn(surface, text, border)}>Batal</button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* ─── Opname Modal (extracted, per-batch) ────────────────────────── */}
      {showModal === 'opname' && (
        <OpnameModal
          products={products}
          isDarkMode={isDarkMode}
          isMobile={isMobile}
          onClose={() => setShowModal(null)}
          onSaved={(msg) => { flashSuccess(msg); fetchProducts(); fetchAlerts(); setBatchesCache({}); }}
          onProductsChanged={() => { fetchProducts(); }}
        />
      )}

      {/* Detail Drawer */}
      {drawerProductId && (
        <ProductDrawer
          productId={drawerProductId}
          isDarkMode={isDarkMode}
          isMobile={isMobile}
          onClose={() => setDrawerProductId(null)}
          onEdit={(p) => { setDrawerProductId(null); openEditProduct(p); }}
          onStockIn={(p) => { setDrawerProductId(null); openStockIn(p); }}
          onStockOut={(p) => { setDrawerProductId(null); openStockOut(p); }}
          onChanged={() => { fetchProducts(); fetchAlerts(); if (batchesCache[drawerProductId]) fetchBatches(drawerProductId, true); }}
        />
      )}

      {/* Delete Confirm Modal */}
      <ConfirmModal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={confirmDelete}
        title="Nonaktifkan Produk"
        message="Apakah Anda yakin ingin menonaktifkan produk ini? (data tetap tersimpan, hanya disembunyikan dari list)"
        isDarkMode={isDarkMode}
      />

      {/* Toast */}
      {toast.msg && (
        <div role="status" aria-live="polite" style={{
          position: 'fixed', bottom: '24px', right: '24px',
          backgroundColor: toast.type === 'error' ? '#FF3B30' : '#34C759', color: '#FFF',
          padding: '12px 20px', borderRadius: '12px', fontWeight: '600', fontSize: '14px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)', zIndex: 99999,
          animation: 'slideUp 0.2s ease-out',
        }}>
          {toast.type === 'error' ? '❌' : '✅'} {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────
const thStyle = (sub, border) => ({
  padding: '12px 14px', textAlign: 'left', fontWeight: '700', color: sub,
  fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em',
  borderBottom: `1px solid ${border}`,
});
const tdStyle = { padding: '12px 14px' };

const primaryBtn = (color, disabled) => ({
  flex: 1, padding: '13px', backgroundColor: color, color: '#FFF', border: 'none',
  borderRadius: '12px', cursor: disabled ? 'wait' : 'pointer', fontWeight: '700', fontSize: '14px',
  opacity: disabled ? 0.7 : 1,
});
const secondaryBtn = (surface, text, border) => ({
  flex: 1, padding: '13px', backgroundColor: surface, color: text, border: `1px solid ${border}`,
  borderRadius: '12px', cursor: 'pointer', fontSize: '14px', fontWeight: '600',
});

function IconBtn({ onClick, label, Icon, color }) {
  return (
    <button onClick={onClick} title={label} aria-label={label} style={{
      background: 'transparent', border: 'none', cursor: 'pointer',
      padding: '6px', borderRadius: '6px', display: 'flex', alignItems: 'center',
      transition: 'background 0.15s',
    }}
      onMouseEnter={e => e.currentTarget.style.background = color + '20'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <Icon size={15} color={color} />
    </button>
  );
}

function ExpandedBatches({ productId, product, batches, loading, sub, text, border, cardBg, isDarkMode, onAddBatch, onOpenDrawer }) {
  const packSize = parseInt(product?.pack_size) || 1;
  const packUnit = product?.pack_unit;
  const baseUnit = product?.base_unit || product?.unit || 'pcs';
  if (loading) return <p style={{ color: sub, fontSize: '12px', padding: '8px 0' }}>Memuat batch...</p>;
  if (!batches || batches.length === 0) {
    return (
      <div style={{ padding: '12px 16px', background: cardBg, border: `1px dashed ${border}`, borderRadius: '10px', fontSize: '12px', color: sub, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Belum ada batch tercatat.</span>
        <button onClick={onAddBatch} style={{ background: '#34C759', color: '#FFF', border: 'none', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}>+ Stok Masuk</button>
      </div>
    );
  }
  return (
    <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '10px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: `1px solid ${border}` }}>
        <span style={{ fontSize: '11px', fontWeight: '700', color: sub, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {batches.length} batch
        </span>
        <button onClick={onOpenDrawer} style={{ background: 'transparent', color: '#007AFF', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
          Kelola di panel detail →
        </button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr style={{ background: 'transparent' }}>
            <th style={{ ...thStyle(sub, border), borderBottom: 'none', padding: '8px 14px' }}>No. Batch</th>
            <th style={{ ...thStyle(sub, border), borderBottom: 'none', padding: '8px 14px' }}>ED</th>
            <th style={{ ...thStyle(sub, border), borderBottom: 'none', padding: '8px 14px', textAlign: 'right' }}>Qty</th>
            <th style={{ ...thStyle(sub, border), borderBottom: 'none', padding: '8px 14px', textAlign: 'right' }} title="HNA per pcs (raw, exc PPN)">HNA<br/><span style={{ fontSize: '9px', fontWeight: '400', color: sub }}>(exc PPN)</span></th>
            <th style={{ ...thStyle(sub, border), borderBottom: 'none', padding: '8px 14px', textAlign: 'right' }} title="HPP per pcs = HNA + PPN 11%">HPP<br/><span style={{ fontSize: '9px', fontWeight: '400', color: sub }}>(inc PPN)</span></th>
          </tr>
        </thead>
        <tbody>
          {batches.map(b => {
            const sev = expirySeverity(b.expired_date, isDarkMode);
            return (
              <tr key={b.id} style={{ borderTop: `1px solid ${border}` }}>
                <td style={{ padding: '8px 14px', color: text, fontWeight: '600' }}>{b.batch_no || <em style={{ color: sub, fontWeight: '400' }}>(tanpa no.)</em>}</td>
                <td style={{ padding: '8px 14px' }}>
                  {b.expired_date ? (
                    sev.plain ? (
                      <span style={{ color: sev.color, fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>{sev.label}</span>
                    ) : (
                      <span style={{ color: sev.color, fontWeight: '600', padding: '2px 6px', borderRadius: '4px', background: sev.bg, fontVariantNumeric: 'tabular-nums', display: 'inline-block' }}>{sev.label}</span>
                    )
                  ) : <span style={{ color: sub }}>—</span>}
                </td>
                <td style={{ padding: '8px 14px', textAlign: 'right', color: text, fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
                  {b.qty_current} {baseUnit}
                  {packUnit && packSize > 1 && (
                    <div style={{ fontSize: '10px', color: sub, fontWeight: '500' }}>
                      = {(b.qty_current / packSize).toFixed(b.qty_current % packSize === 0 ? 0 : 1)} {packUnit}
                    </div>
                  )}
                </td>
                <td style={{ padding: '8px 14px', textAlign: 'right', color: sub, fontVariantNumeric: 'tabular-nums' }}>{fmtRp(b.hna, 2)}</td>
                <td style={{ padding: '8px 14px', textAlign: 'right', color: sub, fontVariantNumeric: 'tabular-nums' }}>{fmtRp(hppFromHna(b.hna), 2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ModalShell({ onClose, cardBg, title, titleColor, text, border, sub, isMobile, maxWidth = '480px', children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div onClick={(e) => e.target === e.currentTarget && onClose()} style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: isMobile ? 0 : '1rem',
    }}>
      <div className="glass-target glass-target--clear" style={{
        backgroundColor: cardBg, borderRadius: isMobile ? 0 : '16px', width: '100%',
        maxWidth, maxHeight: isMobile ? '100%' : '90vh', overflow: 'auto',
        boxShadow: '0 32px 64px rgba(0,0,0,0.35)', height: isMobile ? '100%' : 'auto',
      }}>
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, backgroundColor: cardBg, zIndex: 1 }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: titleColor || text }}>{title}</h3>
          <button onClick={onClose} aria-label="Tutup" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px' }}><X size={18} color={sub} /></button>
        </div>
        <div style={{ padding: '20px 22px' }}>{children}</div>
      </div>
    </div>
  );
}
