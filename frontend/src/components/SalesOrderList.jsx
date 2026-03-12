import React, { useState, useEffect } from 'react';
import { Plus, Search, Trash2, Edit2, X, FileText } from 'lucide-react';
import { salesAPI, customersAPI, productsAPI, printSettingsAPI } from '../services/api';
import { generateNotaPDF } from '../utils/generateNotaPDF';
import Skeleton from './common/Skeleton';

const fmtRp = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

const blankItem = () => ({ product_name: '', qty: 1, unit: 'pcs', unit_price: 0 });

export default function SalesOrderList({ isDarkMode, isSidebarOpen }) {

  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printOrder, setPrintOrder] = useState(null);
  const [printOptions, setPrintOptions] = useState({ format: 'A5', type: 'nota' });
  const [layoutSettings, setLayoutSettings] = useState(null);
  const [editId, setEditId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterMonth, setFilterMonth] = useState('all');
  const [filterYear, setFilterYear] = useState('all');

  // Form state
  const [form, setForm] = useState({ 
    customer_name: '', 
    customer_address: '', 
    sale_date: new Date().toISOString().split('T')[0], 
    notes: '',
    payment_method: 'Tunai',
    payment_details: ''
  });
  const [items, setItems] = useState([blankItem()]);

  const bg = isDarkMode ? '#000' : '#F5F5F7';
  const cardBg = isDarkMode ? '#1C1C1E' : '#FFF';
  const border = isDarkMode ? '#2C2C2E' : '#E5E5EA';
  const text = isDarkMode ? '#FFF' : '#000';
  const sub = '#86868B';
  const labelStyle = { display: 'block', fontSize: '12px', fontWeight: '700', color: sub, marginBottom: '8px', textTransform: 'uppercase' };

  const fetchOrders = async () => {
    setLoading(true);
    try { 
      const { data } = await salesAPI.getAll(); 
      setOrders(data); 
    } catch (e) { 
      console.error(e); 
    } finally {
      setTimeout(() => setLoading(false), 500);
    }
  };
  const fetchCustomers = async () => {
    try { const { data } = await customersAPI.getAll(); setCustomers(data); } catch (e) { console.error(e); }
  };
  const fetchProducts = async () => {
    try { const { data } = await productsAPI.getAll(); setProducts(data); } catch (e) { console.error(e); }
  };
  const fetchSettings = async () => {
    try { const { data } = await printSettingsAPI.get(); setLayoutSettings(data.nota_layout); } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchOrders(); fetchCustomers(); fetchProducts(); fetchSettings(); }, []);

  const filtered = orders.filter(o => {
    const orderDate = new Date(o.sale_date);
    const matchesSearch = o.order_number.toLowerCase().includes(search.toLowerCase()) || 
                          o.customer_name.toLowerCase().includes(search.toLowerCase());
    const isAllMonth = String(filterMonth) === 'all';
    const isAllYear = String(filterYear) === 'all';
    const matchesMonth = isAllMonth || (orderDate.getMonth() + 1) === parseInt(filterMonth, 10);
    const matchesYear = isAllYear || orderDate.getFullYear() === parseInt(filterYear, 10);
    return matchesSearch && matchesMonth && matchesYear;
  });

  const openAdd = () => {
    setEditId(null);
    setForm({ 
      customer_name: '', 
      customer_address: '', 
      sale_date: new Date().toISOString().split('T')[0], 
      notes: '',
      payment_method: 'Tunai',
      payment_details: ''
    });
    setItems([blankItem()]);
    setShowModal(true);
  };

  const openEdit = (order) => {
    setEditId(order.id);
    setForm({
      customer_name: order.customer_name,
      customer_address: order.customer_address || '',
      sale_date: order.sale_date ? order.sale_date.split('T')[0] : '',
      notes: order.notes || '',
      payment_method: order.payment_method || 'Tunai',
      payment_details: order.payment_details || '',
    });
    setItems(order.items?.length ? order.items.map(i => ({ product_name: i.product_name, qty: i.qty, unit: i.unit || 'pcs', unit_price: parseFloat(i.unit_price) || 0 })) : [blankItem()]);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.customer_name.trim()) return alert('Nama customer wajib diisi');
    const validItems = items.filter(i => i.product_name.trim());
    if (!validItems.length) return alert('Minimal 1 produk');
    try {
      const payload = { ...form, items: validItems };
      if (editId) {
        await salesAPI.update(editId, { ...payload, status: 'final' });
        flash('Nota diperbarui');
      } else {
        await salesAPI.create(payload);
        flash('Nota berhasil dibuat');
      }
      setShowModal(false);
      fetchOrders();
    } catch (e) { alert(e.response?.data?.error || e.message); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Hapus nota ini?')) return;
    try {
      await salesAPI.remove(id);
      flash('Nota dihapus');
      fetchOrders();
    } catch (e) { alert(e.response?.data?.error || e.message); }
  };

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const handlePrintPDF = async () => {
    if (!printOrder) return;
    try {
      const doc = generateNotaPDF(printOrder, { 
        ...printOptions, 
        settings: layoutSettings 
      });
      doc.save(`${printOptions.type === 'terima' ? 'TT' : 'Nota'}_${printOrder.order_number}.pdf`);
      await salesAPI.updatePdfStatus(printOrder.id, 'sudah_dicetak');
      flash('PDF berhasil diunduh');
      setShowPrintModal(false);
      fetchOrders();
    } catch (e) { alert('Gagal membuat PDF: ' + e.message); }
  };

  const openPrintOptions = (order) => {
    setPrintOrder(order);
    setShowPrintModal(true);
  };

  const addItem = () => setItems([...items, blankItem()]);
  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx, field, value) => {
    const newItems = [...items];
    newItems[idx] = { ...newItems[idx], [field]: value };
    setItems(newItems);
  };

  const grandTotal = items.reduce((sum, it) => sum + (it.qty || 0) * (it.unit_price || 0), 0);

  const inputStyle = {
    width: '100%', padding: '10px 12px', border: `1px solid ${border}`,
    borderRadius: '10px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7',
    color: text, fontSize: '14px', outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ padding: '2rem', marginLeft: isSidebarOpen ? '256px' : '80px', backgroundColor: bg, minHeight: '100vh', transition: 'margin-left 0.3s' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: '700', margin: 0, color: text }}>🧾 Nota Penjualan</h1>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: sub }}>{orders.length} nota tercatat</p>
        </div>
        <button onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 18px', backgroundColor: '#34C759', color: '#FFF', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>
          <Plus size={18} /> Buat Nota
        </button>
      </div>

      {/* Search & Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '300px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: sub }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nomor nota atau customer..."
            style={{ ...inputStyle, paddingLeft: '36px' }} />
        </div>
        
        <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={{ ...inputStyle, width: '140px' }}>
          <option value="all">Semua Bulan</option>
          {['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'].map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>

        <select value={filterYear} onChange={e => setFilterYear(e.target.value)} style={{ ...inputStyle, width: '100px' }}>
          <option value="all">Semua Tahun</option>
          {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Table */}
      <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '12px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ backgroundColor: isDarkMode ? '#1C1C1E' : '#F5F5F7' }}>
              {['No. Nota', 'Tanggal', 'Customer', 'Total', 'Metode', 'Status', 'Aksi'].map(h => (
                <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontWeight: '700', color: sub, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${border}` }}>
                  <td style={{ padding: '12px 14px' }}><Skeleton width="80px" height="16px" /></td>
                  <td style={{ padding: '12px 14px' }}><Skeleton width="90px" height="16px" /></td>
                  <td style={{ padding: '12px 14px' }}><Skeleton width="120px" height="16px" /></td>
                  <td style={{ padding: '12px 14px' }}><Skeleton width="70px" height="16px" /></td>
                  <td style={{ padding: '12px 14px' }}><Skeleton width="50px" height="16px" /></td>
                  <td style={{ padding: '12px 14px' }}><Skeleton width="60px" height="20px" /></td>
                  <td style={{ padding: '12px 14px' }}><Skeleton width="80px" height="16px" /></td>
                </tr>
              ))
            ) : (
              filtered.map(o => (
                <React.Fragment key={o.id}>
                  <tr style={{ borderBottom: `1px solid ${border}`, cursor: 'pointer' }} onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}>
                    <td style={{ padding: '12px 14px', fontWeight: '600', color: '#007AFF' }}>{o.order_number}</td>
                    <td style={{ padding: '12px 14px', color: text }}>{fmtDate(o.sale_date)}</td>
                    <td style={{ padding: '12px 14px', color: text }}>{o.customer_name}</td>
                    <td style={{ padding: '12px 14px', fontWeight: '600', color: text }}>{fmtRp(o.total)}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: '11px', color: (o.payment_method === 'Tunai' ? '#34C759' : '#007AFF'), fontWeight: '600' }}>{o.payment_method}</span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px',
                        backgroundColor: o.status === 'final' ? '#34C75918' : '#FF950018',
                        color: o.status === 'final' ? '#34C759' : '#FF9500' }}>
                        {o.status === 'final' ? 'Final' : 'Draft'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <button onClick={(e) => { e.stopPropagation(); openPrintOptions(o); }} title="Cetak PDF" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><FileText size={15} color="#34C759" /></button>
                        <button onClick={(e) => { e.stopPropagation(); openEdit(o); }} title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><Edit2 size={15} color="#007AFF" /></button>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(o.id); }} title="Hapus" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><Trash2 size={15} color="#FF3B30" /></button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === o.id && o.items?.length > 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: '0 14px 14px', backgroundColor: isDarkMode ? '#0A0A0A' : '#FAFAFA' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '8px', fontSize: '12px' }}>
                          <thead><tr>
                            {['Produk', 'Qty', 'Satuan', 'Harga', 'Subtotal'].map(h => (
                              <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: '600', color: sub, borderBottom: `1px solid ${border}` }}>{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {o.items.map((it, idx) => (
                              <tr key={idx}>
                                <td style={{ padding: '6px 10px', color: text }}>{it.product_name}</td>
                                <td style={{ padding: '6px 10px', color: text }}>{it.qty}</td>
                                <td style={{ padding: '6px 10px', color: sub }}>{it.unit}</td>
                                <td style={{ padding: '6px 10px', color: text }}>{fmtRp(it.unit_price)}</td>
                                <td style={{ padding: '6px 10px', fontWeight: '600', color: text }}>{fmtRp(it.subtotal)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {o.notes && <p style={{ margin: '8px 0 0', fontSize: '12px', color: sub }}>📝 {o.notes}</p>}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
            {!loading && !filtered.length && (
              <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: sub }}>Belum ada nota penjualan.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div onClick={() => setShowModal(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: cardBg, borderRadius: '16px', width: '100%', maxWidth: '640px', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 32px 64px rgba(0,0,0,0.35)' }}>
            {/* Header */}
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, backgroundColor: cardBg, zIndex: 1 }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: text }}>{editId ? '✏️ Edit Nota' : '🧾 Buat Nota Baru'}</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color={sub} /></button>
            </div>

            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Customer */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: sub, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Customer *</label>
                <input list="customer-list" value={form.customer_name} onChange={e => {
                  const val = e.target.value;
                  setForm(p => ({ ...p, customer_name: val }));
                  const match = customers.find(c => c.name === val);
                  if (match) setForm(p => ({ ...p, customer_name: match.name, customer_address: match.address || '' }));
                }} placeholder="Ketik atau pilih customer..." style={inputStyle} />
                <datalist id="customer-list">
                  {customers.map(c => <option key={c.id} value={c.name} />)}
                </datalist>
              </div>

              {/* Address */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: sub, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Alamat</label>
                <input value={form.customer_address} onChange={e => setForm(p => ({ ...p, customer_address: e.target.value }))} placeholder="Alamat" style={inputStyle} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Tanggal</label>
                  <input type="date" value={form.sale_date} onChange={e => setForm(p => ({ ...p, sale_date: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Metode Pembayaran</label>
                  <select value={form.payment_method} onChange={e => setForm(p => ({ ...p, payment_method: e.target.value }))} style={inputStyle}>
                    <option value="Tunai">Tunai</option>
                    <option value="Transfer">Transfer</option>
                    <option value="QRIS">QRIS</option>
                  </select>
                </div>
              </div>

              {/* Items */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: sub, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Produk</label>
                {items.map((it, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 60px 70px 1fr 30px', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
                    <input list="product-list" value={it.product_name} onChange={e => updateItem(idx, 'product_name', e.target.value)} placeholder="Nama produk" style={{ ...inputStyle, fontSize: '13px', padding: '8px 10px' }} />
                    <input type="number" value={it.qty} onChange={e => updateItem(idx, 'qty', parseInt(e.target.value) || 0)} min="1" style={{ ...inputStyle, fontSize: '13px', padding: '8px 6px', textAlign: 'center' }} />
                    <input value={it.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} placeholder="pcs" style={{ ...inputStyle, fontSize: '13px', padding: '8px 6px' }} />
                    <input type="number" value={it.unit_price} onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)} min="0" placeholder="Harga" style={{ ...inputStyle, fontSize: '13px', padding: '8px 6px' }} />
                    {items.length > 1 && (
                      <button onClick={() => removeItem(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}><Trash2 size={14} color="#FF3B30" /></button>
                    )}
                  </div>
                ))}
                <datalist id="product-list">
                  {products.map(p => <option key={p.id || p.name} value={p.name} />)}
                </datalist>
                <button onClick={addItem} style={{ fontSize: '13px', color: '#007AFF', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600', marginTop: '4px' }}>+ Tambah Produk</button>
              </div>

              {/* Notes */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: sub, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Catatan</label>
                <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Opsional..." style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
              </div>

              {/* Total */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: `1px solid ${border}` }}>
                <span style={{ fontSize: '14px', fontWeight: '600', color: sub }}>Grand Total</span>
                <span style={{ fontSize: '18px', fontWeight: '800', color: '#34C759' }}>{fmtRp(grandTotal)}</span>
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={handleSave} style={{ flex: 1, padding: '13px', backgroundColor: '#34C759', color: '#FFF', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>
                  {editId ? 'Simpan Perubahan' : 'Buat Nota'}
                </button>
                <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: '13px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', color: text, border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
                  Batal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print Options Modal */}
      {showPrintModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div style={{ backgroundColor: cardBg, width: '100%', maxWidth: '360px', borderRadius: '20px', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', margin: 0, color: text }}>Opsi Cetak</h2>
              <button onClick={() => setShowPrintModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: sub }}><X size={20} /></button>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ ...labelStyle, marginBottom: '12px' }}>Ukuran Kertas</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                {['A5', 'A6'].map(f => (
                  <button key={f} onClick={() => setPrintOptions({ ...printOptions, format: f })}
                    style={{ flex: 1, padding: '12px', borderRadius: '12px', border: `2px solid ${printOptions.format === f ? '#007AFF' : border}`, 
                             backgroundColor: printOptions.format === f ? '#007AFF10' : 'transparent', color: printOptions.format === f ? '#007AFF' : text,
                             fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                    <span style={{ fontSize: '15px' }}>{f}</span>
                    {f === 'A5' && <span style={{ fontSize: '9px', fontWeight: '500', opacity: 0.8 }}>(Landscape)</span>}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ ...labelStyle, marginBottom: '12px' }}>Tipe Dokumen</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '10px', borderRadius: '10px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7' }}>
                  <input type="radio" checked={printOptions.type === 'nota'} onChange={() => setPrintOptions({ ...printOptions, type: 'nota' })} />
                  <span style={{ fontSize: '14px', color: text }}>Nota Penjualan</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: (printOptions.format === 'A6' ? 'pointer' : 'not-allowed'), opacity: (printOptions.format === 'A6' ? 1 : 0.5), padding: '10px', borderRadius: '10px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7' }}>
                  <input type="radio" checked={printOptions.type === 'terima'} disabled={printOptions.format !== 'A6'} onChange={() => setPrintOptions({ ...printOptions, type: 'terima' })} />
                  <span style={{ fontSize: '14px', color: text }}>Tanda Terima (Khusus A6)</span>
                </label>
              </div>
            </div>

            <button onClick={handlePrintPDF} style={{ width: '100%', padding: '14px', backgroundColor: '#007AFF', color: '#FFF', border: 'none', borderRadius: '14px', cursor: 'pointer', fontWeight: '700', fontSize: '15px' }}>
              Cetak Sekarang
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', backgroundColor: '#34C759', color: '#FFF', padding: '12px 20px', borderRadius: '10px', fontWeight: '600', fontSize: '14px', boxShadow: '0 8px 24px rgba(0,0,0,0.2)', zIndex: 99999 }}>
          ✅ {toast}
        </div>
      )}
    </div>
  );
}
