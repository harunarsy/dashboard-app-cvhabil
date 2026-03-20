import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, Phone, MapPin, X } from 'lucide-react';
import { customersAPI } from '../services/api';
import Skeleton from './common/Skeleton';
import ConfirmModal from './common/ConfirmModal';
import Breadcrumb from './common/Breadcrumb';

export default function CustomerList({ isDarkMode, isSidebarOpen, isMobile }) {

  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', address: '', phone: '', type: 'offline' });
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const bg = isDarkMode ? '#000' : '#F5F5F7';
  const cardBg = isDarkMode ? '#1C1C1E' : '#FFF';
  const border = isDarkMode ? '#2C2C2E' : '#E5E5EA';
  const text = isDarkMode ? '#FFF' : '#000';
  const sub = '#86868B';

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const { data } = await customersAPI.getAll();
      setCustomers(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchCustomers(); }, []);

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || '').includes(search) ||
    (c.address || '').toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => { setEditId(null); setForm({ name: '', address: '', phone: '', type: 'offline' }); setShowModal(true); };
  const openEdit = (c) => { setEditId(c.id); setForm({ name: c.name, address: c.address || '', phone: c.phone || '', type: c.type || 'offline' }); setShowModal(true); };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    try {
      if (editId) {
        await customersAPI.update(editId, form);
        flash('Customer diperbarui');
      } else {
        await customersAPI.create(form);
        flash('Customer ditambahkan');
      }
      setShowModal(false);
      fetchCustomers();
    } catch (e) { alert(e.response?.data?.error || e.message); }
  };

  const handleDelete = (id) => setDeleteConfirmId(id);
  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await customersAPI.remove(deleteConfirmId);
      flash('Customer dihapus');
      fetchCustomers();
    } catch (e) { alert(e.response?.data?.error || e.message); }
    finally { setDeleteConfirmId(null); }
  };

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const inputStyle = {
    width: '100%', padding: '10px 12px', border: `1px solid ${border}`,
    borderRadius: '10px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7',
    color: text, fontSize: '14px', outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ padding: isMobile ? '1rem' : '2rem', paddingTop: isMobile ? '4rem' : '2rem', backgroundColor: bg, minHeight: '100vh', transition: 'margin-left 0.3s' }}>
      <Breadcrumb title="Master Customer" isMobile={isMobile} isDarkMode={isDarkMode} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: '700', margin: 0, color: text }}>👥 Master Customer</h1>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: sub }}>{loading ? <Skeleton width="160px" height="14px" /> : `${customers.length} customer terdaftar`}</p>
        </div>
        <button onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 18px', backgroundColor: '#007AFF', color: '#FFF', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>
          <Plus size={18} /> Tambah Customer
        </button>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '1.5rem', maxWidth: '400px' }}>
        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: sub }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama, telepon, atau alamat..."
          style={{ ...inputStyle, paddingLeft: '36px' }} />
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px' }}>
        {loading ? (
          [1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '12px', padding: '16px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <Skeleton width="60%" height="20px" />
                <div style={{ display: 'flex', gap: '4px' }}><Skeleton width="24px" height="24px" /><Skeleton width="24px" height="24px" /></div>
              </div>
              <Skeleton width="80%" height="14px" style={{ marginBottom: '8px' }} />
              <Skeleton width="40%" height="14px" style={{ marginBottom: '12px' }} />
              <Skeleton width="60px" height="18px" borderRadius="4px" />
            </div>
          ))
        ) : (
          <>
            {filtered.map(c => (
              <div key={c.id} style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '12px', padding: '16px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: text, marginBottom: '6px' }}>{c.name}</div>
                    {c.phone && <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: sub, marginBottom: '4px' }}><Phone size={13} /> {c.phone}</div>}
                    {c.address && <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: sub }}><MapPin size={13} /> {c.address}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => openEdit(c)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><Edit2 size={16} color="#007AFF" /></button>
                    <button onClick={() => handleDelete(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><Trash2 size={16} color="#FF3B30" /></button>
                  </div>
                </div>
                <div style={{ marginTop: '8px' }}>
                  <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', backgroundColor: c.type === 'reseller' ? '#FF950018' : '#007AFF18', color: c.type === 'reseller' ? '#FF9500' : '#007AFF' }}>
                    {c.type === 'reseller' ? 'Reseller' : c.type === 'institusi' ? 'Institusi' : 'Offline'}
                  </span>
                </div>
              </div>
            ))}
            {!filtered.length && <p style={{ color: sub, fontSize: '14px', gridColumn: '1 / -1', textAlign: 'center', padding: '2rem' }}>Belum ada customer.</p>}
          </>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div onClick={() => setShowModal(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: cardBg, borderRadius: '16px', width: '100%', maxWidth: '440px', overflow: 'hidden', boxShadow: '0 32px 64px rgba(0,0,0,0.35)' }}>
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: text }}>{editId ? '✏️ Edit Customer' : '➕ Tambah Customer'}</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color={sub} /></button>
            </div>
            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: sub, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Nama *</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Nama customer" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: sub, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Telepon</label>
                <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="08xx" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: sub, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Alamat</label>
                <textarea value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} rows={2} placeholder="Alamat" style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: sub, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Tipe</label>
                <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} style={inputStyle}>
                  <option value="offline">Offline</option>
                  <option value="reseller">Reseller</option>
                  <option value="institusi">Institusi</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                <button onClick={handleSave} style={{ flex: 1, padding: '13px', backgroundColor: '#007AFF', color: '#FFF', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>
                  {editId ? 'Simpan' : 'Tambah'}
                </button>
                <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: '13px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', color: text, border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Batal</button>
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
        title="Hapus Customer"
        message="Apakah Anda yakin ingin menghapus customer ini?"
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
