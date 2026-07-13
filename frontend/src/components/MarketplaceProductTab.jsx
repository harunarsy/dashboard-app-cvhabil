// Tab "Produk & Harga" di Toko Online — baca template batch-edit marketplace (TikTok/Shopee)
// di browser, cocokkan ke produk HABIL, tampilkan HPP terkini + stok + rekomendasi harga per
// platform (mini-AI: pricingEngine + fee profile), lalu download template terisi utk di-upload
// balik ke marketplace. Harga final bisa disimpan ke Daftar Harga HABIL. Stok template diisi
// dari inventory HABIL (selisih ditandai) — TIDAK mengubah inventory (nunggu stok opname).
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Upload, Download, Save, Link2, AlertTriangle, CheckCircle2, X, Search } from 'lucide-react';
import { marketplaceAPI, inventoryAPI } from '../services/api';
import { parseFile, downloadFilled, PLATFORM_LABEL } from '../utils/marketplaceTemplate';

const fmtRp = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Math.round(n || 0));

export default function MarketplaceProductTab({ isDarkMode, isMobile, flash }) {
  const cardBg = isDarkMode ? 'rgba(28,28,30,0.7)' : 'rgba(255,255,255,0.7)';
  const border = isDarkMode ? 'var(--color-surface-raised)' : 'var(--color-border)';
  const text = isDarkMode ? '#FFF' : '#000';
  const sub = 'var(--color-text-subtle)';
  const inputStyle = { padding: '7px 9px', border: `1px solid ${border}`, borderRadius: '8px', backgroundColor: isDarkMode ? 'var(--color-surface-raised)' : 'var(--color-bg)', color: text, fontSize: '13px', outline: 'none', boxSizing: 'border-box' };

  const fileRef = useRef(null);
  const bufferRef = useRef(null); // ArrayBuffer template asli utk isi ulang
  const [filename, setFilename] = useState('');
  const [platform, setPlatform] = useState(null);
  const [rawRows, setRawRows] = useState([]);        // hasil parse mentah (utk re-analyze)
  const [rows, setRows] = useState([]);              // hasil analyze (matched/suggestions/rec)
  const [finals, setFinals] = useState({});          // { excelRow: { price, stock } } override user
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mapRow, setMapRow] = useState(null);        // baris yang lagi dipetakan (modal)
  const [products, setProducts] = useState([]);

  useEffect(() => {
    inventoryAPI.getProducts({ limit: 2000 })
      .then(({ data }) => setProducts(Array.isArray(data) ? data : (data?.data || [])))
      .catch(() => {});
  }, []);

  const runAnalyze = async (plat, parsedRows) => {
    setLoading(true);
    try {
      const { data } = await marketplaceAPI.analyze({ platform: plat, rows: parsedRows });
      setRows(data.rows);
      // default harga final = rekomendasi, stok final = stok HABIL (kalau matched)
      const nf = {};
      data.rows.forEach((r) => {
        nf[r.excelRow] = {
          price: r.matched ? (r.matched.recommended_price ?? r.current_price) : (r.current_price ?? ''),
          stock: r.matched ? (r.matched.stock_habil ?? r.current_stock) : (r.current_stock ?? ''),
        };
      });
      setFinals(nf);
    } catch (e) {
      flash(e.response?.data?.error || e.message);
    } finally { setLoading(false); }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const parsed = await parseFile(file);
      bufferRef.current = parsed.buffer;
      setFilename(parsed.filename);
      setPlatform(parsed.platform);
      setRawRows(parsed.rows);
      await runAnalyze(parsed.platform, parsed.rows);
      flash(`${parsed.rowCount} produk dibaca dari ${PLATFORM_LABEL[parsed.platform]}`);
    } catch (err) {
      flash(err.message || 'Gagal membaca template');
      setLoading(false);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const doMap = async (productId, bundleQty) => {
    if (!mapRow) return;
    try {
      await marketplaceAPI.saveSkuMap({
        platform, match_key: mapRow.match_key, key_type: mapRow.key_type,
        product_id: productId, bundle_qty: bundleQty || mapRow.bundle_qty || 1,
        listing_name: mapRow.product_name, variation: mapRow.variation,
      });
      setMapRow(null);
      flash('Mapping disimpan, menghitung ulang…');
      await runAnalyze(platform, rawRows);
    } catch (e) { flash(e.response?.data?.error || e.message); }
  };

  const setFinal = (excelRow, field, val) => setFinals((f) => ({ ...f, [excelRow]: { ...f[excelRow], [field]: val } }));

  const handleDownload = () => {
    if (!bufferRef.current) return;
    const updates = rows.map((r) => ({
      excelRow: r.excelRow,
      price: finals[r.excelRow]?.price,
      stock: finals[r.excelRow]?.stock,
    }));
    const base = filename.replace(/\.xlsx$/i, '');
    downloadFilled(bufferRef.current, updates, `${base}-HABIL.xlsx`);
    flash('Template terisi diunduh — upload ke marketplace');
  };

  const channel = platform === 'tiktok' ? 'tokopedia_tiktok' : 'shopee';
  const handleSavePrices = async () => {
    const entries = rows.filter((r) => r.matched && finals[r.excelRow]?.price)
      .map((r) => ({ product_id: r.matched.product_id, channel, price: Number(finals[r.excelRow].price) }));
    if (!entries.length) return flash('Tidak ada harga untuk disimpan');
    setSaving(true);
    try {
      const { data } = await marketplaceAPI.savePrices(entries);
      flash(`${data.saved_count} harga tersimpan ke Daftar Harga HABIL`);
    } catch (e) { flash(e.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };

  const stats = useMemo(() => {
    const matched = rows.filter((r) => r.matched).length;
    const needUp = rows.filter((r) => r.matched && r.current_price != null && r.matched.harga_bep != null && r.current_price < r.matched.harga_bep).length;
    const stockDiff = rows.filter((r) => r.matched && r.current_stock != null && r.matched.stock_habil !== r.current_stock).length;
    return { total: rows.length, matched, unmatched: rows.length - matched, needUp, stockDiff };
  }, [rows]);

  // ── Empty state / uploader ────────────────────────────────────────────────
  const uploader = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: isMobile ? '2rem 1rem' : '3rem', border: `2px dashed ${border}`, borderRadius: '16px', backgroundColor: cardBg, textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--color-primary-soft, rgba(10,132,255,0.12))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Upload size={26} color="var(--color-primary)" /></div>
      <div>
        <p style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: text }}>Upload template batch-edit</p>
        <p style={{ margin: '6px 0 0', fontSize: '13px', color: sub, maxWidth: 460 }}>Download dulu template "Edit Massal / All Information" dari TikTok Seller Center atau "Ubah Massal Info Penjualan" dari Shopee, lalu upload di sini. File diproses di perangkatmu — tidak dikirim mentah ke server.</p>
      </div>
      <button onClick={() => fileRef.current?.click()} className="ui-motion-button ui-focus-ring" style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: 44, padding: '11px 20px', backgroundColor: 'var(--color-primary)', color: '#FFF', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '14px' }}>
        <Upload size={16} /> Pilih file .xlsx
      </button>
    </div>
  );

  const statChip = (label, val, color) => (
    <div style={{ padding: '8px 14px', borderRadius: 10, backgroundColor: cardBg, border: `1px solid ${border}`, minWidth: 92 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: color || text }}>{val}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: sub, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
    </div>
  );

  return (
    <div>
      <input ref={fileRef} type="file" accept=".xlsx" onChange={handleFile} style={{ display: 'none' }} />
      {!rows.length && !loading && uploader}

      {loading && <div style={{ padding: '2rem', textAlign: 'center', color: sub }}>Memproses template…</div>}

      {!!rows.length && !loading && (
        <div>
          {/* Header actions + stats */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {statChip('Produk', stats.total)}
              {statChip('Cocok', stats.matched, 'var(--color-success)')}
              {statChip('Belum dipetakan', stats.unmatched, stats.unmatched ? 'var(--color-danger)' : sub)}
              {statChip('Perlu naik harga', stats.needUp, stats.needUp ? '#F59E0B' : sub)}
              {statChip('Selisih stok', stats.stockDiff, stats.stockDiff ? '#F59E0B' : sub)}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => fileRef.current?.click()} className="ui-motion-button ui-focus-ring" style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '9px 14px', backgroundColor: isDarkMode ? 'var(--color-surface-raised)' : 'var(--color-bg)', color: text, border: `1px solid ${border}`, borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}><Upload size={15} /> Ganti file</button>
              <button onClick={handleSavePrices} disabled={saving} className="ui-motion-button ui-focus-ring" style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '9px 14px', backgroundColor: isDarkMode ? 'var(--color-surface-raised)' : 'var(--color-bg)', color: text, border: `1px solid ${border}`, borderRadius: 10, cursor: saving ? 'wait' : 'pointer', fontWeight: 700, fontSize: 13, opacity: saving ? 0.6 : 1 }}><Save size={15} /> Simpan harga ke HABIL</button>
              <button onClick={handleDownload} className="ui-motion-button ui-focus-ring" style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '9px 16px', backgroundColor: 'var(--color-primary)', color: '#FFF', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}><Download size={15} /> Download template terisi</button>
            </div>
          </div>

          <div style={{ marginBottom: 10, fontSize: 12, color: sub, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, color: text }}>{PLATFORM_LABEL[platform]}</span> · {filename}
          </div>

          {/* Tabel */}
          <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: 12, overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 920, borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ backgroundColor: isDarkMode ? 'var(--color-surface-elevated)' : 'var(--color-bg)' }}>
                  {['Produk (listing)', 'Produk HABIL', 'HPP', 'Stok HABIL', 'Harga skrg', 'Rekomendasi', 'Harga final', 'Stok utk upload'].map((h) => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: sub, fontSize: 11, textTransform: 'uppercase', borderBottom: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const m = r.matched;
                  const losing = m && r.current_price != null && m.harga_bep != null && r.current_price < m.harga_bep;
                  const stockMismatch = m && r.current_stock != null && m.stock_habil !== r.current_stock;
                  return (
                    <tr key={r.excelRow} style={{ borderBottom: `1px solid ${border}`, backgroundColor: !m ? 'rgba(245,158,11,0.06)' : 'transparent' }}>
                      <td style={{ padding: '9px 12px', maxWidth: 240 }}>
                        <div style={{ fontWeight: 600, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.product_name}</div>
                        <div style={{ fontSize: 11, color: sub }}>{[r.variation, r.sku].filter(Boolean).join(' · ') || '—'}{r.bundle_qty > 1 ? ` · bundle ×${r.bundle_qty}` : ''}</div>
                      </td>
                      <td style={{ padding: '9px 12px', maxWidth: 220 }}>
                        {m ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: text }}><CheckCircle2 size={14} color="var(--color-success)" /> {m.name}</span>
                        ) : (
                          <button onClick={() => setMapRow(r)} className="ui-motion-button ui-focus-ring" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', border: '1px solid #F59E0B', color: '#F59E0B', background: 'transparent', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}><Link2 size={13} /> Petakan…</button>
                        )}
                      </td>
                      <td style={{ padding: '9px 12px', color: text, whiteSpace: 'nowrap' }}>{m ? fmtRp(m.hpp_bundle) : '—'}</td>
                      <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                        {m ? <span style={{ color: m.stock_habil <= 0 ? 'var(--color-danger)' : text, fontWeight: stockMismatch ? 700 : 400 }}>{m.stock_habil}{stockMismatch ? ` (di toko: ${r.current_stock})` : ''}</span> : '—'}
                      </td>
                      <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: losing ? 'var(--color-danger)' : text, fontWeight: losing ? 700 : 400 }}>
                        {r.current_price != null ? fmtRp(r.current_price) : '—'}{losing && <span title="Di bawah BEP — rugi"> <AlertTriangle size={12} color="var(--color-danger)" style={{ verticalAlign: 'middle' }} /></span>}
                      </td>
                      <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                        {m ? (
                          <div>
                            <div style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{fmtRp(m.recommended_price)}</div>
                            <div style={{ fontSize: 10, color: sub }}>laba {fmtRp(m.estimasi_laba)} · {m.margin_laba}%</div>
                          </div>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '9px 12px' }}>
                        <input type="number" value={finals[r.excelRow]?.price ?? ''} onChange={(e) => setFinal(r.excelRow, 'price', e.target.value)} style={{ ...inputStyle, width: 100 }} />
                      </td>
                      <td style={{ padding: '9px 12px' }}>
                        <input type="number" value={finals[r.excelRow]?.stock ?? ''} onChange={(e) => setFinal(r.excelRow, 'stock', e.target.value)} style={{ ...inputStyle, width: 76 }} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 11, color: sub, marginTop: 10 }}>Kolom "Stok utk upload" default dari stok HABIL. Mengunduh template TIDAK mengubah inventory HABIL — lakukan stok opname seperti biasa.</p>
        </div>
      )}

      {/* Modal pemetaan produk */}
      {mapRow && (
        <MapModal row={mapRow} products={products} isDarkMode={isDarkMode} onClose={() => setMapRow(null)} onMap={doMap} />
      )}
    </div>
  );
}

// Modal pilih produk HABIL utk baris yang belum dipetakan.
function MapModal({ row, products, isDarkMode, onClose, onMap }) {
  const border = isDarkMode ? 'var(--color-surface-raised)' : 'var(--color-border)';
  const cardBg = isDarkMode ? '#1c1c1e' : '#fff';
  const text = isDarkMode ? '#FFF' : '#000';
  const sub = 'var(--color-text-subtle)';
  const [q, setQ] = useState('');
  const [bundle, setBundle] = useState(row.bundle_qty || 1);
  const inputStyle = { width: '100%', padding: '10px 12px', border: `1px solid ${border}`, borderRadius: 10, backgroundColor: isDarkMode ? 'var(--color-surface-raised)' : 'var(--color-bg)', color: text, fontSize: 14, outline: 'none', boxSizing: 'border-box' };
  const list = useMemo(() => {
    const base = row.suggestions?.length ? row.suggestions.map((s) => ({ id: s.product_id, name: s.name, code: s.code })) : [];
    const term = q.trim().toLowerCase();
    const filtered = term
      ? products.filter((p) => p.name?.toLowerCase().includes(term) || p.code?.toLowerCase().includes(term)).slice(0, 30)
      : base;
    return filtered;
  }, [q, products, row]);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="ui-motion-modal" style={{ backgroundColor: cardBg, borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 32px 64px rgba(0,0,0,0.35)' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: text }}>Petakan ke produk HABIL</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: sub }}>{row.product_name}{row.variation ? ` · ${row.variation}` : ''}</p>
          </div>
          <button onClick={onClose} aria-label="Tutup" className="ui-motion-button ui-focus-ring" style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color={sub} /></button>
        </div>
        <div style={{ padding: '14px 20px', display: 'flex', gap: 10, alignItems: 'center', borderBottom: `1px solid ${border}` }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={15} color={sub} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama / kode produk…" style={{ ...inputStyle, paddingLeft: 32 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 11, color: sub, fontWeight: 700 }}>Bundle ×</label>
            <input type="number" min={1} value={bundle} onChange={(e) => setBundle(Math.max(1, parseInt(e.target.value, 10) || 1))} style={{ ...inputStyle, width: 60 }} />
          </div>
        </div>
        <div style={{ overflowY: 'auto', padding: '8px 12px' }}>
          {!list.length && <p style={{ padding: 20, textAlign: 'center', color: sub, fontSize: 13 }}>{q ? 'Tidak ada produk cocok.' : 'Ketik untuk mencari produk.'}</p>}
          {list.map((p) => (
            <button key={p.id} onClick={() => onMap(p.id, bundle)} className="ui-motion-button ui-focus-ring" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', textAlign: 'left', padding: '11px 12px', border: `1px solid ${border}`, borderRadius: 10, background: 'transparent', color: text, cursor: 'pointer', marginBottom: 6, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>{p.name}</span>
              <span style={{ fontSize: 11, color: sub, fontFamily: 'monospace' }}>{p.code || ''}{p.score ? ` · ${Math.round(p.score * 100)}%` : ''}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
