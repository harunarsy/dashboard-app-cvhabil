import React, { useState, useEffect } from 'react';
import { Plus, Search, Trash2, Edit2, X, CheckCircle } from 'lucide-react';
import { purchaseOrdersAPI, distributorsAPI, inventoryAPI } from '../services/api';

const fmtRp = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const blankItem = () => ({ product_name: '', qty: 1, unit: 'pcs', unit_price: 0 });

const statusColors = {
  draft: { bg: '#FF950018', color: '#FF9500', label: 'Draft' },
  sent: { bg: '#007AFF18', color: '#007AFF', label: 'Dikirim' },
  partial: { bg: '#5856D618', color: '#5856D6', label: 'Partial' },
  received: { bg: '#34C75918', color: '#34C759', label: 'Diterima' },
};

export default function PurchaseOrderList({ isDarkMode, isSidebarOpen }) {
  const [orders, setOrders] = useState([]);
  const [distributors, setDistributors] = useState([]);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(null); // null | 'create' | 'receive'
  const [editId, setEditId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [toast, setToast] = useState('');

  const [form, setForm] = useState({ distributor_name: '', distributor_address: '', order_date: new Date().toISOString().split('T')[0], expected_date: '', notes: '' });
  const [items, setItems] = useState([blankItem()]);
  const [receiveItems, setReceiveItems] = useState([]);

  const bg = isDarkMode ? '#000' : '#F5F5F7';
  const cardBg = isDarkMode ? '#1C1C1E' : '#FFF';
  const border = isDarkMode ? '#2C2C2E' : '#E5E5EA';
  const text = isDarkMode ? '#FFF' : '#000';
  const sub = '#86868B';

  const fetchOrders = async () => { try { const { data } = await purchaseOrdersAPI.getAll(); setOrders(data); } catch (e) { console.error(e); } };
  const fetchDistributors = async () => { try { const { data } = await distributorsAPI.getAll(); setDistributors(data); } catch (e) { console.error(e); } };
  const fetchProducts = async () => { try { const { data } = await inventoryAPI.getProducts(); setProducts(data); } catch (e) { console.error(e); } };

  useEffect(() => { fetchOrders(); fetchDistributors(); fetchProducts(); }, []);

  const filtered = orders.filter(o =>
    o.po_number.toLowerCase().includes(search.toLowerCase()) ||
    o.distributor_name.toLowerCase().includes(search.toLowerCase())
  );

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };
  const inputStyle = {
    width: '100%', padding: '10px 12px', border: `1px solid ${border}`,
    borderRadius: '10px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7',
    color: text, fontSize: '14px', outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle = { display: 'block', fontSize: '11px', fontWeight: '700', color: sub, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' };

  const openCreate = () => {
    setEditId(null);
    setForm({ distributor_name: '', distributor_address: '', order_date: new Date().toISOString().split('T')[0], expected_date: '', notes: '' });
    setItems([blankItem()]);
    setShowModal('create');
  };

  const openEdit = (o) => {
    setEditId(o.id);
    setForm({ distributor_name: o.distributor_name, distributor_address: o.distributor_address || '', order_date: o.order_date?.split('T')[0] || '', expected_date: o.expected_date?.split('T')[0] || '', notes: o.notes || '' });
    setItems(o.items?.length ? o.items.map(i => ({ product_name: i.product_name, qty: i.qty, unit: i.unit || 'pcs', unit_price: parseFloat(i.unit_price) || 0 })) : [blankItem()]);
    setShowModal('create');
  };

  const openReceive = (o) => {
    setEditId(o.id);
    setReceiveItems(o.items?.map(i => ({ po_item_id: i.id, product_name: i.product_name, ordered_qty: i.qty, already_received: i.received_qty || 0, received_qty: 0, batch_no: '', expired_date: '' })) || []);
    setShowModal('receive');
  };

  const handleSave = async () => {
    if (!form.distributor_name.trim()) return alert('Nama distributor wajib');
    const validItems = items.filter(i => i.product_name.trim());
    if (!validItems.length) return alert('Min 1 produk');
    try {
      const payload = { ...form, items: validItems };
      if (editId) { await purchaseOrdersAPI.update(editId, payload); flash('SP diperbarui'); }
      else { await purchaseOrdersAPI.create(payload); flash('SP berhasil dibuat'); }
      setShowModal(null); fetchOrders();
    } catch (e) { alert(e.response?.data?.error || e.message); }
  };

  const handleReceive = async () => {
    const toReceive = receiveItems.filter(i => (parseInt(i.received_qty) || 0) > 0);
    if (!toReceive.length) return alert('Masukkan qty yang diterima');
    try {
      await purchaseOrdersAPI.receive(editId, { items: toReceive });
      flash('Barang diterima & stok diperbarui'); setShowModal(null); fetchOrders();
    } catch (e) { alert(e.response?.data?.error || e.message); }
  };

  const handleDelete = async (id) => { if (!window.confirm('Hapus SP ini?')) return; try { await purchaseOrdersAPI.remove(id); flash('SP dihapus'); fetchOrders(); } catch (e) { alert(e.response?.data?.error || e.message); } };
  const addItem = () => setItems([...items, blankItem()]);
  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx, f, v) => { const n = [...items]; n[idx] = { ...n[idx], [f]: v }; setItems(n); };
  const grandTotal = items.reduce((s, i) => s + (i.qty || 0) * (i.unit_price || 0), 0);

  return (
    <div style={{ padding: '2rem', marginLeft: isSidebarOpen ? '256px' : '80px', backgroundColor: bg, minHeight: '100vh', transition: 'margin-left 0.3s' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: '700', margin: 0, color: text }}>📋 Surat Pesanan</h1>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: sub }}>{orders.length} SP tercatat</p>
        </div>
        <button onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 18px', backgroundColor: '#5856D6', color: '#FFF', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>
          <Plus size={18} /> Buat SP
        </button>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '1.5rem', maxWidth: '400px' }}>
        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: sub }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nomor SP atau distributor..." style={{ ...inputStyle, paddingLeft: '36px' }} />
      </div>

      {/* Table */}
      <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '12px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ backgroundColor: isDarkMode ? '#1C1C1E' : '#F5F5F7' }}>
              {['No. SP', 'Tanggal', 'Distributor', 'Total', 'Status', 'Aksi'].map(h => (
                <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontWeight: '700', color: sub, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(o => {
              const sc = statusColors[o.status] || statusColors.draft;
              return (
                <React.Fragment key={o.id}>
                  <tr style={{ borderBottom: `1px solid ${border}`, cursor: 'pointer' }} onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}>
                    <td style={{ padding: '12px 14px', fontWeight: '600', color: '#5856D6' }}>{o.po_number}</td>
                    <td style={{ padding: '12px 14px', color: text }}>{fmtDate(o.order_date)}</td>
                    <td style={{ padding: '12px 14px', color: text }}>{o.distributor_name}</td>
                    <td style={{ padding: '12px 14px', fontWeight: '600', color: text }}>{fmtRp(o.total)}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', backgroundColor: sc.bg, color: sc.color }}>{sc.label}</span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
                        {o.status !== 'received' && <button onClick={() => openReceive(o)} title="Terima Barang" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><CheckCircle size={15} color="#34C759" /></button>}
                        <button onClick={() => openEdit(o)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><Edit2 size={15} color="#007AFF" /></button>
                        <button onClick={() => handleDelete(o.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><Trash2 size={15} color="#FF3B30" /></button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === o.id && o.items?.length > 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: '0 14px 14px', backgroundColor: isDarkMode ? '#0A0A0A' : '#FAFAFA' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '8px', fontSize: '12px' }}>
                          <thead><tr>
                            {['Produk', 'Qty', 'Satuan', 'Harga', 'Subtotal', 'Diterima'].map(h => (
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
                                <td style={{ padding: '6px 10px', fontWeight: '600', color: (it.received_qty || 0) >= it.qty ? '#34C759' : '#FF9500' }}>
                                  {it.received_qty || 0}/{it.qty}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {o.notes && <p style={{ margin: '8px 0 0', fontSize: '12px', color: sub }}>📝 {o.notes}</p>}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {!filtered.length && <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: sub }}>Belum ada Surat Pesanan.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Create/Edit Modal */}
      {showModal === 'create' && (
        <div onClick={() => setShowModal(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: cardBg, borderRadius: '16px', width: '100%', maxWidth: '640px', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 32px 64px rgba(0,0,0,0.35)' }}>
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, backgroundColor: cardBg, zIndex: 1 }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: text }}>{editId ? '✏️ Edit SP' : '📋 Buat SP Baru'}</h3>
              <button onClick={() => setShowModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color={sub} /></button>
            </div>
            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Distributor *</label>
                <input list="dist-list" value={form.distributor_name} onChange={e => setForm(p => ({ ...p, distributor_name: e.target.value }))} placeholder="Pilih distributor..." style={inputStyle} />
                <datalist id="dist-list">{distributors.map((d, i) => <option key={i} value={d.name} />)}</datalist>
              </div>
              <div><label style={labelStyle}>Alamat</label><input value={form.distributor_address} onChange={e => setForm(p => ({ ...p, distributor_address: e.target.value }))} style={inputStyle} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div><label style={labelStyle}>Tanggal SP</label><input type="date" value={form.order_date} onChange={e => setForm(p => ({ ...p, order_date: e.target.value }))} style={inputStyle} /></div>
                <div><label style={labelStyle}>Estimasi Tiba</label><input type="date" value={form.expected_date} onChange={e => setForm(p => ({ ...p, expected_date: e.target.value }))} style={inputStyle} /></div>
              </div>
              <div>
                <label style={labelStyle}>Produk</label>
                {items.map((it, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 60px 70px 1fr 30px', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
                    <input list="inv-product-list" value={it.product_name} onChange={e => updateItem(idx, 'product_name', e.target.value)} placeholder="Produk" style={{ ...inputStyle, fontSize: '13px', padding: '8px 10px' }} />
                    <input type="number" value={it.qty} onChange={e => updateItem(idx, 'qty', parseInt(e.target.value) || 0)} min="1" style={{ ...inputStyle, fontSize: '13px', padding: '8px 6px', textAlign: 'center' }} />
                    <input value={it.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} placeholder="pcs" style={{ ...inputStyle, fontSize: '13px', padding: '8px 6px' }} />
                    <input type="number" value={it.unit_price} onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)} min="0" placeholder="Harga" style={{ ...inputStyle, fontSize: '13px', padding: '8px 6px' }} />
                    {items.length > 1 && <button onClick={() => removeItem(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}><Trash2 size={14} color="#FF3B30" /></button>}
                  </div>
                ))}
                <datalist id="inv-product-list">{products.map(p => <option key={p.id} value={p.name} />)}</datalist>
                <button onClick={addItem} style={{ fontSize: '13px', color: '#5856D6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600', marginTop: '4px' }}>+ Tambah Produk</button>
              </div>
              <div><label style={labelStyle}>Catatan</label><textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} /></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: `1px solid ${border}` }}>
                <span style={{ fontSize: '14px', fontWeight: '600', color: sub }}>Total</span>
                <span style={{ fontSize: '18px', fontWeight: '800', color: '#5856D6' }}>{fmtRp(grandTotal)}</span>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={handleSave} style={{ flex: 1, padding: '13px', backgroundColor: '#5856D6', color: '#FFF', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>{editId ? 'Simpan' : 'Buat SP'}</button>
                <button onClick={() => setShowModal(null)} style={{ flex: 1, padding: '13px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', color: text, border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Batal</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Receive Modal */}
      {showModal === 'receive' && (
        <div onClick={() => setShowModal(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: cardBg, borderRadius: '16px', width: '100%', maxWidth: '640px', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 32px 64px rgba(0,0,0,0.35)' }}>
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, backgroundColor: cardBg, zIndex: 1 }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#34C759' }}>✅ Terima Barang</h3>
              <button onClick={() => setShowModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color={sub} /></button>
            </div>
            <div style={{ padding: '20px 22px' }}>
              <p style={{ fontSize: '13px', color: sub, margin: '0 0 12px' }}>Masukkan qty yang diterima, batch, dan tanggal expired. Stok akan otomatis bertambah.</p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead><tr>
                  {['Produk', 'Pesan', 'Sudah', 'Terima', 'Batch', 'Expired'].map(h => (
                    <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '700', color: sub, fontSize: '10px', textTransform: 'uppercase', borderBottom: `1px solid ${border}` }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {receiveItems.map((ri, idx) => (
                    <tr key={idx} style={{ borderBottom: `1px solid ${border}` }}>
                      <td style={{ padding: '6px 8px', fontWeight: '600', color: text }}>{ri.product_name}</td>
                      <td style={{ padding: '6px 8px', color: sub }}>{ri.ordered_qty}</td>
                      <td style={{ padding: '6px 8px', color: ri.already_received >= ri.ordered_qty ? '#34C759' : '#FF9500' }}>{ri.already_received}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <input type="number" value={ri.received_qty} min="0" max={ri.ordered_qty - ri.already_received} onChange={e => {
                          const n = [...receiveItems]; n[idx] = { ...n[idx], received_qty: parseInt(e.target.value) || 0 }; setReceiveItems(n);
                        }} style={{ ...inputStyle, width: '60px', padding: '4px 6px', fontSize: '12px', textAlign: 'center' }} />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input value={ri.batch_no} onChange={e => { const n = [...receiveItems]; n[idx] = { ...n[idx], batch_no: e.target.value }; setReceiveItems(n); }} placeholder="Batch" style={{ ...inputStyle, width: '80px', padding: '4px 6px', fontSize: '12px' }} />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input type="date" value={ri.expired_date} onChange={e => { const n = [...receiveItems]; n[idx] = { ...n[idx], expired_date: e.target.value }; setReceiveItems(n); }} style={{ ...inputStyle, width: '120px', padding: '4px 6px', fontSize: '12px' }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                <button onClick={handleReceive} style={{ flex: 1, padding: '13px', backgroundColor: '#34C759', color: '#FFF', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>Terima & Update Stok</button>
                <button onClick={() => setShowModal(null)} style={{ flex: 1, padding: '13px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', color: text, border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Batal</button>
              </div>
            </div>
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
