import React, { useState, useEffect, useCallback } from 'react';
import { X, Edit2, Trash2, Plus, Sliders, ArrowDownCircle, ArrowUpCircle, ClipboardCheck, Package } from 'lucide-react';
import { inventoryAPI } from '../../services/api';
import BatchFormModal from './BatchFormModal';
import { hppFromHna } from '../../utils/rupiah';

const fmtRp = (n, decimals = 0) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
const daysUntil = (d) => d ? Math.ceil((new Date(d) - new Date()) / 86400000) : null;

function expiryBadge(date, sub) {
  if (!date) return { color: sub, bg: 'transparent', text: '-' };
  const days = daysUntil(date);
  if (days <= 0) return { color: '#FF3B30', bg: '#FFF5F5', text: `EXPIRED ${fmtDate(date)}` };
  if (days < 90) return { color: '#FF9500', bg: '#FFF8F0', text: `${fmtDate(date)} (${days}d)` };
  return { color: '#34C759', bg: '#F0FBF3', text: fmtDate(date) };
}

const mutationLabel = {
  in: { label: 'Masuk', color: '#34C759', icon: ArrowDownCircle },
  out: { label: 'Keluar', color: '#FF9500', icon: ArrowUpCircle },
};

export default function ProductDrawer({ productId, isDarkMode, isMobile, onClose, onEdit, onChanged, onStockIn, onStockOut }) {
  const [tab, setTab] = useState('profil');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [batchModal, setBatchModal] = useState(null); // null | { mode: 'add'|'edit', batch?: {} }
  const [adjustFor, setAdjustFor] = useState(null); // batch object
  const [adjustForm, setAdjustForm] = useState({ new_qty: 0, reason: '' });
  const [error, setError] = useState('');

  const bg = isDarkMode ? '#1C1C1E' : '#FFF';
  const border = isDarkMode ? '#2C2C2E' : '#E5E5EA';
  const text = isDarkMode ? '#FFF' : '#000';
  const sub = '#86868B';
  const surface = isDarkMode ? '#2C2C2E' : '#F5F5F7';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await inventoryAPI.getProductFull(productId);
      setData(data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => { if (productId) load(); }, [productId, load]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !batchModal && !adjustFor) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, batchModal, adjustFor]);

  const handleDeleteBatch = async (batchId) => {
    if (!window.confirm('Hapus batch ini? (qty harus 0)')) return;
    try {
      await inventoryAPI.deleteBatch(batchId);
      await load();
      onChanged?.();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  };

  const handleAdjust = async () => {
    setError('');
    if (!adjustForm.reason.trim()) { setError('Alasan adjustment wajib diisi'); return; }
    try {
      await inventoryAPI.adjustBatch(adjustFor.id, {
        new_qty: parseInt(adjustForm.new_qty),
        reason: adjustForm.reason,
      });
      setAdjustFor(null);
      setAdjustForm({ new_qty: 0, reason: '' });
      await load();
      onChanged?.();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const tabBtn = (id, label, count) => (
    <button
      key={id}
      onClick={() => setTab(id)}
      style={{
        flex: 1, padding: '10px 8px', background: tab === id ? bg : 'transparent',
        color: tab === id ? '#007AFF' : sub, border: 'none',
        borderBottom: tab === id ? '2px solid #007AFF' : '2px solid transparent',
        fontSize: '13px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.15s',
      }}
    >
      {label}{count !== undefined && <span style={{ marginLeft: '6px', color: sub, fontWeight: '500' }}>({count})</span>}
    </button>
  );

  const drawerWidth = isMobile ? '100%' : '520px';
  const totalStock = data?.total_stock || 0;
  const minStock = data?.min_stock || 0;
  const inventoryValue = (data?.batches || []).reduce((sum, b) => sum + (parseInt(b.qty_current) || 0) * hppFromHna(b.hna), 0);
  const stockPct = minStock > 0 ? Math.min(100, (totalStock / (minStock * 2)) * 100) : 100;
  const stockColor = totalStock <= 0 ? '#FF3B30' : totalStock < minStock ? '#FF9500' : '#34C759';

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1900,
        animation: 'fadeIn 0.2s ease-out',
      }} />
      <div className="glass-target glass-target--clear" style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: drawerWidth, maxWidth: '100%',
        background: bg, color: text, zIndex: 1950, display: 'flex', flexDirection: 'column',
        boxShadow: '-12px 0 32px rgba(0,0,0,0.15)', animation: 'slideIn 0.25s ease-out',
      }}>
        <style>{`
          @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        `}</style>

        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#007AFF15', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#007AFF', flexShrink: 0 }}>
            <Package size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: '11px', color: sub, fontWeight: '600', letterSpacing: '0.05em' }}>{data?.code || '— TIDAK ADA KODE —'}</p>
            <h2 style={{ margin: '2px 0 0', fontSize: '18px', fontWeight: '700', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {data?.name || (loading ? 'Memuat...' : '-')}
            </h2>
          </div>
          <button onClick={() => onEdit?.(data)} aria-label="Edit Produk" disabled={!data} style={{
            background: surface, border: 'none', borderRadius: '8px', padding: '8px',
            cursor: data ? 'pointer' : 'default', color: text, opacity: data ? 1 : 0.4,
          }}><Edit2 size={16} /></button>
          <button onClick={onClose} aria-label="Tutup" style={{
            background: surface, border: 'none', borderRadius: '8px', padding: '8px',
            cursor: 'pointer', color: text,
          }}><X size={16} /></button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${border}`, background: surface }}>
          {tabBtn('profil', 'Profil')}
          {tabBtn('batches', 'Batch', data?.batches?.length || 0)}
          {tabBtn('history', 'Riwayat', data?.mutations?.length || 0)}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          {loading && <p style={{ color: sub, fontSize: '14px' }}>Memuat...</p>}

          {/* PROFIL TAB */}
          {!loading && data && tab === 'profil' && (
            <div style={{ display: 'grid', gap: '16px' }}>
              {/* Stock summary card */}
              <div style={{ padding: '16px', background: surface, borderRadius: '14px', border: `1px solid ${border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: sub, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Stok</span>
                  <span style={{ fontSize: '24px', fontWeight: '700', color: stockColor }}>
                    {totalStock} <span style={{ fontSize: '13px', color: sub, fontWeight: '500' }}>{data.unit}</span>
                  </span>
                </div>
                <div style={{ height: '6px', background: isDarkMode ? '#000' : '#E5E5EA', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${stockPct}%`, background: stockColor, transition: 'width 0.3s' }} />
                </div>
                <p style={{ margin: '8px 0 0', fontSize: '12px', color: sub }}>
                  Stok minimum: {minStock} {data.unit} · Nilai inventaris: <strong style={{ color: text }}>{fmtRp(inventoryValue)}</strong>
                </p>
              </div>

              {/* Profile grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Field label="Kategori" value={data.category || '-'} sub={sub} text={text} />
                <Field label="Satuan" value={data.unit || '-'} sub={sub} text={text} />
                <Field label="HNA per pcs (exc PPN)" value={fmtRp(data.hna, 2)} sub={sub} text={text} />
                <Field label="HPP per pcs (inc PPN 11%)" value={fmtRp(hppFromHna(data.hna), 2)} sub={sub} text={text} />
                <Field label="Harga Jual" value={fmtRp(data.sell_price)} sub={sub} text={text} />
              </div>

              {/* Quick actions */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
                <button onClick={() => onStockIn?.(data)} style={btnStyle('#34C759')}>
                  <ArrowDownCircle size={16} /> Stok Masuk
                </button>
                <button onClick={() => onStockOut?.(data)} style={btnStyle('#FF9500')}>
                  <ArrowUpCircle size={16} /> Stok Keluar
                </button>
              </div>
            </div>
          )}

          {/* BATCHES TAB */}
          {!loading && data && tab === 'batches' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '13px', color: sub }}>{data.batches.length} batch tercatat</span>
                <button onClick={() => setBatchModal({ mode: 'add' })} style={{
                  display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px',
                  background: '#007AFF', color: '#FFF', border: 'none', borderRadius: '10px',
                  fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                }}>
                  <Plus size={14} /> Batch Baru
                </button>
              </div>
              {data.batches.length === 0 && (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: sub, fontSize: '13px', background: surface, borderRadius: '12px' }}>
                  Belum ada batch. Klik "Batch Baru" atau Stok Masuk.
                </div>
              )}
              <div style={{ display: 'grid', gap: '8px' }}>
                {data.batches.map(b => {
                  const eb = expiryBadge(b.expired_date, sub);
                  return (
                    <div key={b.id} style={{
                      padding: '12px', background: surface, borderRadius: '12px', border: `1px solid ${border}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <p style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>{b.batch_no || <em style={{ color: sub }}>(tanpa no. batch)</em>}</p>
                          <span style={{
                            display: 'inline-block', marginTop: '4px', padding: '2px 8px', borderRadius: '6px',
                            background: eb.bg, color: eb.color, fontSize: '11px', fontWeight: '600',
                          }}>{eb.text}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button onClick={() => setBatchModal({ mode: 'edit', batch: b })} aria-label="Edit batch" style={iconBtn(text, isDarkMode)}>
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => { setAdjustFor(b); setAdjustForm({ new_qty: b.qty_current, reason: '' }); }} aria-label="Adjust qty" style={iconBtn('#007AFF', isDarkMode)}>
                            <Sliders size={14} />
                          </button>
                          <button onClick={() => handleDeleteBatch(b.id)} aria-label="Hapus batch" style={iconBtn('#FF3B30', isDarkMode)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: sub, flexWrap: 'wrap' }}>
                        <span>Qty: <strong style={{ color: text, fontSize: '14px' }}>{b.qty_current}</strong></span>
                        <span>HNA (exc PPN): <strong style={{ color: text }}>{fmtRp(b.hna, 2)}</strong></span>
                        <span>HPP (inc PPN): <strong style={{ color: text }}>{fmtRp(hppFromHna(b.hna), 2)}</strong></span>
                      </div>
                      {b.notes && <p style={{ margin: '6px 0 0', fontSize: '11px', color: sub, fontStyle: 'italic' }}>{b.notes}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* HISTORY TAB */}
          {!loading && data && tab === 'history' && (
            <div style={{ display: 'grid', gap: '6px' }}>
              {data.mutations.length === 0 && (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: sub, fontSize: '13px' }}>
                  Belum ada mutasi tercatat.
                </div>
              )}
              {data.mutations.map(m => {
                const info = mutationLabel[m.type] || { label: m.type, color: sub, icon: ClipboardCheck };
                const Icon = info.icon;
                return (
                  <div key={m.id} style={{
                    display: 'flex', gap: '12px', padding: '10px 12px', borderRadius: '10px',
                    background: surface, border: `1px solid ${border}`,
                  }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: info.color + '20', color: info.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon size={16} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '600' }}>
                          {info.label} {m.type === 'in' ? '+' : '−'}{m.qty} {m.batch_no && <span style={{ color: sub, fontWeight: '400' }}>· {m.batch_no}</span>}
                        </span>
                        <span style={{ fontSize: '11px', color: sub, whiteSpace: 'nowrap' }}>{fmtDateTime(m.created_at)}</span>
                      </div>
                      {m.notes && <p style={{ margin: '2px 0 0', fontSize: '11px', color: sub, lineHeight: 1.4 }}>{m.notes}</p>}
                      <p style={{ margin: '2px 0 0', fontSize: '10px', color: sub, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '600' }}>{m.reference_type}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Adjust qty modal (small) */}
      {adjustFor && (
        <div onClick={(e) => e.target === e.currentTarget && setAdjustFor(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2100,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div className="glass-target glass-target--clear" style={{ background: bg, color: text, borderRadius: '20px', padding: '24px', width: '100%', maxWidth: '420px' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: '17px', fontWeight: '700' }}>Adjust Qty Batch</h3>
            <p style={{ margin: '0 0 16px', fontSize: '12px', color: sub }}>
              Batch <strong>{adjustFor.batch_no || '(no batch)'}</strong> · Sistem: {adjustFor.qty_current}
            </p>
            {error && (
              <div style={{ padding: '10px 12px', background: '#FFF5F5', color: '#FF3B30', borderRadius: '10px', fontSize: '13px', marginBottom: '12px' }}>
                {error}
              </div>
            )}
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: sub, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Qty Baru</label>
            <input type="number" min="0" value={adjustForm.new_qty}
              onChange={(e) => setAdjustForm({ ...adjustForm, new_qty: e.target.value })}
              style={{ width: '100%', padding: '10px 12px', border: `1px solid ${border}`, borderRadius: '10px', background: surface, color: text, fontSize: '14px', outline: 'none', boxSizing: 'border-box', marginBottom: '12px' }} />
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: sub, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Alasan *</label>
            <input type="text" value={adjustForm.reason}
              onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
              placeholder="contoh: Hilang, rusak, koreksi data"
              style={{ width: '100%', padding: '10px 12px', border: `1px solid ${border}`, borderRadius: '10px', background: surface, color: text, fontSize: '14px', outline: 'none', boxSizing: 'border-box', marginBottom: '16px' }} />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleAdjust} style={{ flex: 1, padding: '12px', background: '#007AFF', color: '#FFF', border: 'none', borderRadius: '12px', fontWeight: '600', cursor: 'pointer' }}>Simpan</button>
              <button onClick={() => { setAdjustFor(null); setError(''); }} style={{ flex: 1, padding: '12px', background: surface, color: text, border: `1px solid ${border}`, borderRadius: '12px', fontWeight: '600', cursor: 'pointer' }}>Batal</button>
            </div>
          </div>
        </div>
      )}

      {/* Batch form modal */}
      {batchModal && (
        <BatchFormModal
          mode={batchModal.mode}
          batch={batchModal.batch}
          productId={productId}
          productName={data?.name}
          isDarkMode={isDarkMode}
          onClose={() => setBatchModal(null)}
          onSaved={() => { load(); onChanged?.(); }}
        />
      )}
    </>
  );
}

function Field({ label, value, sub, text }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: '11px', fontWeight: '700', color: sub, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
      <p style={{ margin: '4px 0 0', fontSize: '14px', color: text, fontWeight: '500' }}>{value}</p>
    </div>
  );
}

const btnStyle = (color) => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
  padding: '10px 12px', background: color, color: '#FFF', border: 'none',
  borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
});

const iconBtn = (color, dark) => ({
  background: dark ? '#1C1C1E' : '#FFF', border: 'none', borderRadius: '8px',
  width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', color,
});
