import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Search, ClipboardCheck, ChevronRight, CheckCircle2 } from 'lucide-react';
import { inventoryAPI } from '../../services/api';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const daysUntil = (d) => d ? Math.ceil((new Date(d) - new Date()) / 86400000) : null;

function expiryBadge(date, sub) {
  if (!date) return { color: sub, bg: 'transparent', text: '-' };
  const days = daysUntil(date);
  if (days <= 0) return { color: '#FF3B30', bg: '#FFF5F5', text: `EXP ${fmtDate(date)}` };
  if (days < 90) return { color: '#FF9500', bg: '#FFF8F0', text: `${fmtDate(date)} (${days}d)` };
  return { color: '#34C759', bg: '#F0FBF3', text: fmtDate(date) };
}

// Per-batch stok opname modal.
// State: { [batchId]: { product_id, product_name, batch_no, qty_current, expired_date, physical_qty, notes } }
export default function OpnameModal({ products, isDarkMode, isMobile, onClose, onSaved }) {
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [search, setSearch] = useState('');
  const [batchesByProduct, setBatchesByProduct] = useState({}); // { productId: [batches] }
  const [inputs, setInputs] = useState({}); // { batchId: { physical_qty, notes, product_id, product_name, batch_no, qty_current, expired_date } }
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const bg = isDarkMode ? '#1C1C1E' : '#FFF';
  const border = isDarkMode ? '#2C2C2E' : '#E5E5EA';
  const text = isDarkMode ? '#FFF' : '#000';
  const sub = '#86868B';
  const surface = isDarkMode ? '#2C2C2E' : '#F5F5F7';

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.code || '').toLowerCase().includes(q)
    );
  }, [products, search]);

  const loadBatches = useCallback(async (productId) => {
    if (batchesByProduct[productId]) return;
    setLoadingBatches(true);
    try {
      const { data } = await inventoryAPI.getProductBatches(productId);
      setBatchesByProduct(prev => ({ ...prev, [productId]: data }));
    } catch (e) {
      console.error(e);
    } finally { setLoadingBatches(false); }
  }, [batchesByProduct]);

  useEffect(() => {
    if (selectedProductId) loadBatches(selectedProductId);
  }, [selectedProductId, loadBatches]);

  const handleInput = (batch, product, value) => {
    const v = value === '' ? '' : parseInt(value);
    setInputs(prev => ({
      ...prev,
      [batch.id]: {
        ...(prev[batch.id] || {}),
        product_id: product.id,
        product_name: product.name,
        batch_no: batch.batch_no,
        qty_current: batch.qty_current,
        expired_date: batch.expired_date,
        physical_qty: v,
        notes: prev[batch.id]?.notes || '',
      },
    }));
  };

  const handleNotes = (batchId, notes) => {
    setInputs(prev => ({ ...prev, [batchId]: { ...(prev[batchId] || {}), notes } }));
  };

  const changedItems = useMemo(() => {
    return Object.entries(inputs)
      .filter(([_, v]) => v.physical_qty !== '' && parseInt(v.physical_qty) !== v.qty_current)
      .map(([batch_id, v]) => ({
        batch_id: parseInt(batch_id),
        physical_qty: parseInt(v.physical_qty),
        notes: v.notes || null,
      }));
  }, [inputs]);

  const totalProductsChanged = useMemo(() => {
    return new Set(Object.entries(inputs)
      .filter(([_, v]) => v.physical_qty !== '' && parseInt(v.physical_qty) !== v.qty_current)
      .map(([_, v]) => v.product_id)
    ).size;
  }, [inputs]);

  const handleSave = async () => {
    if (changedItems.length === 0) { setError('Tidak ada perubahan untuk disimpan'); return; }
    setSaving(true);
    setError('');
    try {
      await inventoryAPI.createOpname({ items: changedItems });
      onSaved?.(`Opname tersimpan: ${changedItems.length} batch di ${totalProductsChanged} produk`);
      onClose();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally { setSaving(false); }
  };

  const selectedProduct = products.find(p => p.id === selectedProductId);
  const currentBatches = selectedProductId ? (batchesByProduct[selectedProductId] || []) : [];
  const inputCount = Object.values(inputs).filter(v => v.physical_qty !== '').length;

  return (
    <div onClick={(e) => e.target === e.currentTarget && onClose()} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? 0 : '1rem',
    }}>
      <div style={{
        background: bg, color: text, borderRadius: isMobile ? 0 : '20px',
        width: '100%', maxWidth: '960px', height: isMobile ? '100%' : '85vh',
        display: 'flex', flexDirection: 'column', boxShadow: '0 32px 64px rgba(0,0,0,0.35)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#FF950015', color: '#FF9500', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ClipboardCheck size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>Stok Opname (per Batch)</h2>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: sub }}>
              Pilih produk → input qty fisik per batch. Hanya batch yang berubah yang disimpan.
            </p>
          </div>
          <button onClick={onClose} aria-label="Tutup" style={{
            background: surface, border: 'none', borderRadius: '8px', padding: '8px', cursor: 'pointer', color: text,
          }}><X size={16} /></button>
        </div>

        {/* Body: 2-pane */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', flexDirection: isMobile ? 'column' : 'row' }}>
          {/* LEFT — product list */}
          <div style={{
            width: isMobile ? '100%' : '320px',
            borderRight: isMobile ? 'none' : `1px solid ${border}`,
            borderBottom: isMobile ? `1px solid ${border}` : 'none',
            background: surface, display: 'flex', flexDirection: 'column',
            maxHeight: isMobile ? '180px' : 'auto',
          }}>
            <div style={{ padding: '12px', borderBottom: `1px solid ${border}` }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: sub }} />
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari produk..."
                  style={{
                    width: '100%', padding: '8px 12px 8px 34px', border: `1px solid ${border}`,
                    borderRadius: '10px', background: bg, color: text, fontSize: '13px',
                    outline: 'none', boxSizing: 'border-box',
                  }} />
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              {filteredProducts.map(p => {
                const productInputCount = Object.values(inputs).filter(v => v.product_id === p.id && v.physical_qty !== '').length;
                const isSelected = selectedProductId === p.id;
                return (
                  <button key={p.id} onClick={() => setSelectedProductId(p.id)} style={{
                    width: '100%', padding: '10px 14px', textAlign: 'left', background: isSelected ? '#007AFF15' : 'transparent',
                    border: 'none', borderLeft: isSelected ? '3px solid #007AFF' : '3px solid transparent',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
                      <p style={{ margin: '2px 0 0', fontSize: '11px', color: sub }}>{p.code || '—'} · Stok: {p.total_stock || 0}</p>
                    </div>
                    {productInputCount > 0 && (
                      <span style={{ background: '#34C759', color: '#FFF', fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '8px' }}>{productInputCount}</span>
                    )}
                    <ChevronRight size={14} style={{ color: sub, flexShrink: 0 }} />
                  </button>
                );
              })}
              {filteredProducts.length === 0 && (
                <p style={{ padding: '20px', fontSize: '12px', color: sub, textAlign: 'center' }}>Tidak ditemukan</p>
              )}
            </div>
          </div>

          {/* RIGHT — batch input area */}
          <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
            {!selectedProduct && (
              <div style={{ textAlign: 'center', color: sub, paddingTop: '60px' }}>
                <ClipboardCheck size={40} style={{ color: sub, opacity: 0.4 }} />
                <p style={{ marginTop: '12px', fontSize: '14px' }}>Pilih produk dari list kiri untuk mulai opname</p>
              </div>
            )}
            {selectedProduct && (
              <>
                <div style={{ marginBottom: '16px' }}>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '700' }}>{selectedProduct.name}</h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: sub }}>
                    {selectedProduct.code || '—'} · Total sistem: {selectedProduct.total_stock || 0} {selectedProduct.unit}
                  </p>
                </div>
                {loadingBatches && <p style={{ color: sub, fontSize: '13px' }}>Memuat batch...</p>}
                {!loadingBatches && currentBatches.length === 0 && (
                  <div style={{ padding: '24px', background: surface, borderRadius: '12px', textAlign: 'center', color: sub, fontSize: '13px' }}>
                    Belum ada batch untuk produk ini. Lakukan Stok Masuk dulu.
                  </div>
                )}
                <div style={{ display: 'grid', gap: '10px' }}>
                  {currentBatches.map(b => {
                    const input = inputs[b.id] || {};
                    const physicalQty = input.physical_qty;
                    const hasInput = physicalQty !== '' && physicalQty !== undefined;
                    const diff = hasInput ? parseInt(physicalQty) - b.qty_current : 0;
                    const diffColor = diff > 0 ? '#34C759' : diff < 0 ? '#FF3B30' : sub;
                    const eb = expiryBadge(b.expired_date, sub);
                    return (
                      <div key={b.id} style={{
                        padding: '12px', background: surface, borderRadius: '12px', border: `1px solid ${border}`,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                          <div>
                            <p style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>
                              {b.batch_no || <em style={{ color: sub }}>(tanpa no. batch)</em>}
                            </p>
                            <span style={{
                              display: 'inline-block', marginTop: '4px', padding: '2px 8px', borderRadius: '6px',
                              background: eb.bg, color: eb.color, fontSize: '11px', fontWeight: '600',
                            }}>{eb.text}</span>
                          </div>
                          {hasInput && diff !== 0 && (
                            <span style={{ fontSize: '13px', fontWeight: '700', color: diffColor }}>
                              {diff > 0 ? '+' : ''}{diff}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '8px', alignItems: 'end' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: sub, textTransform: 'uppercase', marginBottom: '4px' }}>Sistem</label>
                            <div style={{ padding: '8px 10px', background: bg, border: `1px solid ${border}`, borderRadius: '8px', fontSize: '14px', fontWeight: '600' }}>{b.qty_current}</div>
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: sub, textTransform: 'uppercase', marginBottom: '4px' }}>Fisik</label>
                            <input type="number" min="0" value={physicalQty ?? ''}
                              onChange={(e) => handleInput(b, selectedProduct, e.target.value)}
                              placeholder={String(b.qty_current)}
                              style={{
                                width: '100%', padding: '8px 10px', border: `1px solid ${hasInput && diff !== 0 ? diffColor : border}`,
                                borderRadius: '8px', background: bg, color: text, fontSize: '14px', fontWeight: '600',
                                outline: 'none', boxSizing: 'border-box',
                              }} />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: sub, textTransform: 'uppercase', marginBottom: '4px' }}>Catatan</label>
                            <input type="text" value={input.notes || ''}
                              onChange={(e) => handleNotes(b.id, e.target.value)}
                              placeholder="opsional"
                              style={{
                                width: '100%', padding: '8px 10px', border: `1px solid ${border}`,
                                borderRadius: '8px', background: bg, color: text, fontSize: '13px',
                                outline: 'none', boxSizing: 'border-box',
                              }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px', borderTop: `1px solid ${border}`, background: surface,
          display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          <div style={{ flex: 1 }}>
            {error && <p style={{ margin: 0, color: '#FF3B30', fontSize: '13px' }}>{error}</p>}
            {!error && (
              <p style={{ margin: 0, fontSize: '13px', color: sub }}>
                {changedItems.length === 0 ? (
                  <>Belum ada perubahan ({inputCount} input terisi tapi sama dengan sistem)</>
                ) : (
                  <><CheckCircle2 size={14} style={{ display: 'inline', verticalAlign: '-2px', color: '#34C759', marginRight: '4px' }} />
                    <strong style={{ color: text }}>{changedItems.length}</strong> batch berubah di <strong style={{ color: text }}>{totalProductsChanged}</strong> produk</>
                )}
              </p>
            )}
          </div>
          <button onClick={onClose} disabled={saving} style={{
            padding: '10px 18px', background: bg, color: text, border: `1px solid ${border}`,
            borderRadius: '10px', fontWeight: '600', fontSize: '13px', cursor: 'pointer',
          }}>Batal</button>
          <button onClick={handleSave} disabled={saving || changedItems.length === 0} style={{
            padding: '10px 18px', background: changedItems.length > 0 ? '#FF9500' : sub, color: '#FFF',
            border: 'none', borderRadius: '10px', fontWeight: '600', fontSize: '13px',
            cursor: saving || changedItems.length === 0 ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}>{saving ? 'Menyimpan...' : 'Simpan Opname'}</button>
        </div>
      </div>
    </div>
  );
}
