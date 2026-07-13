// Tab "Produk & Harga" di Toko Online — kelola harga & stok listing marketplace (TikTok/Shopee)
// per TOKO. Template diproses di browser (SheetJS); backend cuma terima baris JSON + simpan
// katalog per toko di DB (lengket — buka lagi tanpa upload). Auto-match nebak produk HABIL
// (ditandai "auto — cek"), user tinggal koreksi. Stok template diisi dari inventory HABIL
// (selisih ditandai) tanpa mengubah inventory (stok opname tetap sumber kebenaran).
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Upload, Download, Save, Link2, AlertTriangle, CheckCircle2, X, Search, Store, Sparkles } from 'lucide-react';
import { marketplaceAPI, inventoryAPI } from '../services/api';
import { parseFile, downloadFilled, PLATFORM_LABEL } from '../utils/marketplaceTemplate';

const fmtRp = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Math.round(n || 0));
const shopIdFromName = (fn = '') => { const m = String(fn).match(/sales_info_(\d+)_/); return m ? m[1] : null; };
const PLAT_COLOR = { tiktok: '#000000', shopee: '#EE4D2D' };

export default function MarketplaceProductTab({ isDarkMode, isMobile, flash }) {
  const cardBg = isDarkMode ? 'rgba(28,28,30,0.7)' : 'rgba(255,255,255,0.7)';
  const border = isDarkMode ? 'var(--color-surface-raised)' : 'var(--color-border)';
  const text = isDarkMode ? '#FFF' : '#000';
  const sub = 'var(--color-text-subtle)';
  const inputStyle = { padding: '7px 9px', border: `1px solid ${border}`, borderRadius: '8px', backgroundColor: isDarkMode ? 'var(--color-surface-raised)' : 'var(--color-bg)', color: text, fontSize: '13px', outline: 'none', boxSizing: 'border-box' };

  const fileRef = useRef(null);
  const bufferRef = useRef(null); // ArrayBuffer template asli utk isi ulang (hanya saat upload)
  const [stores, setStores] = useState([]);
  const [filename, setFilename] = useState('');
  const [platform, setPlatform] = useState(null);
  const [storeId, setStoreId] = useState(null);
  const [storeName, setStoreName] = useState('');
  const [rawRows, setRawRows] = useState([]);
  const [rows, setRows] = useState([]);
  const [finals, setFinals] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mapRow, setMapRow] = useState(null);
  const [products, setProducts] = useState([]);
  const [pending, setPending] = useState(null); // {parsed} menunggu nama toko sebelum analyze
  const hasBuffer = !!bufferRef.current;

  const loadStores = () => marketplaceAPI.getStores().then(({ data }) => setStores(Array.isArray(data) ? data : [])).catch(() => {});
  useEffect(() => {
    loadStores();
    inventoryAPI.getProducts({ limit: 2000 }).then(({ data }) => setProducts(Array.isArray(data) ? data : (data?.data || []))).catch(() => {});
  }, []);

  const applyRows = (dataRows) => {
    setRows(dataRows);
    const nf = {};
    dataRows.forEach((r) => {
      nf[r.excelRow ?? r.match_key] = {
        price: r.final_price ?? (r.matched ? (r.matched.recommended_price ?? r.current_price) : (r.current_price ?? '')),
        stock: r.matched ? (r.matched.stock_habil ?? r.current_stock) : (r.current_stock ?? ''),
      };
    });
    setFinals(nf);
  };

  // Upload → parse → minta nama toko dulu
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    setLoading(true);
    try {
      const parsed = await parseFile(file);
      bufferRef.current = parsed.buffer;
      const guess = stores.find((s) => s.platform === parsed.platform)?.name || '';
      setPending({ parsed, suggestedName: guess });
      setStoreName(guess);
    } catch (err) { flash(err.message || 'Gagal membaca template'); }
    finally { setLoading(false); }
  };

  const confirmUpload = async () => {
    if (!pending) return;
    const name = storeName.trim();
    if (!name) return flash('Isi nama toko dulu');
    const { parsed } = pending;
    setPending(null);
    setLoading(true);
    try {
      const { data } = await marketplaceAPI.analyze({
        platform: parsed.platform, store_name: name,
        external_shop_id: shopIdFromName(parsed.filename), filename: parsed.filename, rows: parsed.rows,
      });
      setPlatform(parsed.platform); setFilename(parsed.filename);
      setStoreId(data.store.id); setStoreName(data.store.name); setRawRows(parsed.rows);
      applyRows(data.rows);
      loadStores();
      flash(`${data.total} produk · ${data.matched} cocok (${data.matched_auto} auto), ${data.unmatched} perlu dipetakan`);
    } catch (e) { flash(e.response?.data?.error || e.message); }
    finally { setLoading(false); }
  };

  // Buka toko tersimpan dari DB (tanpa upload; download perlu upload file terbaru)
  const openStore = async (s) => {
    setLoading(true);
    bufferRef.current = null; setRawRows([]);
    try {
      const { data } = await marketplaceAPI.getStoreListings(s.id);
      setPlatform(data.store.platform); setFilename(data.store.last_filename || '');
      setStoreId(data.store.id); setStoreName(data.store.name);
      // baris dari DB tak punya excelRow → pakai match_key sbg key
      const mapped = data.rows.map((r, i) => ({ ...r, excelRow: null, _key: r.match_key || i }));
      applyRows(mapped);
      flash(`Toko ${data.store.name} · ${data.total} produk (${data.matched} cocok)`);
    } catch (e) { flash(e.response?.data?.error || e.message); }
    finally { setLoading(false); }
  };

  const reAnalyze = async () => {
    if (bufferRef.current && rawRows.length) {
      const { data } = await marketplaceAPI.analyze({ platform, store_name: storeName, filename, rows: rawRows });
      applyRows(data.rows); loadStores();
    } else if (storeId) { openStore({ id: storeId }); }
  };

  const doMap = async (productId, bundleQty) => {
    if (!mapRow) return;
    try {
      await marketplaceAPI.saveSkuMap({
        platform, match_key: mapRow.match_key, key_type: mapRow.key_type, product_id: productId,
        bundle_qty: bundleQty || mapRow.bundle_qty || 1, listing_name: mapRow.product_name, variation: mapRow.variation, store_id: storeId,
      });
      setMapRow(null);
      flash('Mapping disimpan, menghitung ulang…');
      await reAnalyze();
    } catch (e) { flash(e.response?.data?.error || e.message); }
  };

  const keyOf = (r) => r.excelRow ?? r._key ?? r.match_key;
  const setFinal = (r, field, val) => setFinals((f) => ({ ...f, [keyOf(r)]: { ...f[keyOf(r)], [field]: val } }));

  const handleDownload = () => {
    if (!bufferRef.current) return flash('Upload file template terbaru dulu untuk download');
    const updates = rows.map((r) => ({ excelRow: r.excelRow, price: finals[keyOf(r)]?.price, stock: finals[keyOf(r)]?.stock }));
    const base = (filename || 'template').replace(/\.xlsx$/i, '');
    downloadFilled(bufferRef.current, updates, `${base}-HABIL.xlsx`);
    flash('Template terisi diunduh — upload ke marketplace');
  };

  const channel = platform === 'tiktok' ? 'tokopedia_tiktok' : 'shopee';
  const handleSavePrices = async () => {
    const entries = rows.filter((r) => r.matched && finals[keyOf(r)]?.price)
      .map((r) => ({ product_id: r.matched.product_id, channel, price: Number(finals[keyOf(r)].price), match_key: r.match_key }));
    if (!entries.length) return flash('Tidak ada harga untuk disimpan');
    setSaving(true);
    try { const { data } = await marketplaceAPI.savePrices({ store_id: storeId, entries }); flash(`${data.saved_count} harga tersimpan ke Daftar Harga HABIL`); }
    catch (e) { flash(e.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };

  const stats = useMemo(() => {
    const matched = rows.filter((r) => r.matched).length;
    const auto = rows.filter((r) => r.matched?.auto).length;
    const needUp = rows.filter((r) => r.matched && !r.matched.no_hpp && r.current_price != null && r.matched.harga_bep != null && r.current_price < r.matched.harga_bep).length;
    const noHpp = rows.filter((r) => r.matched?.no_hpp).length;
    return { total: rows.length, matched, auto, unmatched: rows.length - matched, needUp, noHpp };
  }, [rows]);

  const statChip = (label, val, color) => (
    <div style={{ padding: '8px 14px', borderRadius: 10, backgroundColor: cardBg, border: `1px solid ${border}`, minWidth: 88 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: color || text }}>{val}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: sub, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
    </div>
  );

  const btn = (kids, onClick, opts = {}) => (
    <button onClick={onClick} disabled={opts.disabled} className="ui-motion-button ui-focus-ring" style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 40, padding: opts.primary ? '9px 16px' : '9px 14px', backgroundColor: opts.primary ? 'var(--color-primary)' : (isDarkMode ? 'var(--color-surface-raised)' : 'var(--color-bg)'), color: opts.primary ? '#FFF' : text, border: opts.primary ? 'none' : `1px solid ${border}`, borderRadius: 10, cursor: opts.disabled ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13, opacity: opts.disabled ? 0.5 : 1 }}>{kids}</button>
  );

  return (
    <div>
      <input ref={fileRef} type="file" accept=".xlsx" onChange={handleFile} style={{ display: 'none' }} />

      {/* Daftar Toko */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Store size={16} color={sub} /><span style={{ fontSize: 13, fontWeight: 700, color: text }}>Toko tersimpan</span>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {stores.map((s) => (
            <div key={s.id} onClick={() => openStore(s)} className="ui-motion-card" style={{ cursor: 'pointer', padding: '10px 14px', borderRadius: 12, border: `1.5px solid ${storeId === s.id && !hasBuffer ? 'var(--color-primary)' : border}`, backgroundColor: cardBg, minWidth: 150, position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: text }}>{s.name}</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6, color: '#fff', backgroundColor: PLAT_COLOR[s.platform] || sub }}>{PLATFORM_LABEL[s.platform] || s.platform}</span>
              </div>
              <div style={{ fontSize: 11, color: sub, marginTop: 3 }}>{s.listing_count} produk · {s.matched_count} cocok</div>
            </div>
          ))}
          <button onClick={() => fileRef.current?.click()} className="ui-motion-button ui-focus-ring" style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 12, border: `1.5px dashed ${border}`, backgroundColor: 'transparent', color: 'var(--color-primary)', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
            <Upload size={15} /> Toko baru / upload file
          </button>
        </div>
      </div>

      {/* Panel nama toko setelah pilih file */}
      {pending && (
        <div style={{ padding: 16, borderRadius: 12, border: `1px solid ${border}`, backgroundColor: cardBg, marginBottom: 16 }}>
          <p style={{ margin: '0 0 10px', fontSize: 13, color: text }}>File <b>{PLATFORM_LABEL[pending.parsed.platform]}</b> terbaca ({pending.parsed.rowCount} produk). Toko ini namanya apa?</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input autoFocus value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="mis. Semesta" onKeyDown={(e) => e.key === 'Enter' && confirmUpload()} style={{ ...inputStyle, minWidth: 200, padding: '10px 12px' }} />
            {btn(<>Proses</>, confirmUpload, { primary: true })}
            {btn('Batal', () => { setPending(null); bufferRef.current = null; })}
          </div>
        </div>
      )}

      {loading && <div style={{ padding: '2rem', textAlign: 'center', color: sub }}>Memproses…</div>}

      {!!rows.length && !loading && (
        <div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {statChip('Produk', stats.total)}
              {statChip('Cocok', stats.matched, 'var(--color-success)')}
              {statChip('Auto (cek)', stats.auto, stats.auto ? '#8B5CF6' : sub)}
              {statChip('Belum dipetakan', stats.unmatched, stats.unmatched ? 'var(--color-danger)' : sub)}
              {statChip('Perlu naik harga', stats.needUp, stats.needUp ? '#F59E0B' : sub)}
              {statChip('HPP kosong', stats.noHpp, stats.noHpp ? '#F59E0B' : sub)}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {btn(<><Save size={15} /> Simpan harga ke HABIL</>, handleSavePrices, { disabled: saving })}
              {btn(<><Download size={15} /> Download template terisi</>, handleDownload, { primary: true, disabled: !hasBuffer })}
            </div>
          </div>

          <div style={{ marginBottom: 10, fontSize: 12, color: sub, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, color: text }}>{storeName}</span> · {PLATFORM_LABEL[platform]} {filename ? `· ${filename}` : ''}
            {!hasBuffer && <span style={{ color: '#F59E0B' }}>· dibuka dari DB — untuk download, upload file template terbaru</span>}
          </div>

          <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: 12, overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 940, borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ backgroundColor: isDarkMode ? 'var(--color-surface-elevated)' : 'var(--color-bg)' }}>
                  {['Produk (listing)', 'Produk HABIL', 'HPP', 'Stok HABIL', 'Harga skrg', 'Rekomendasi', 'Harga final', 'Stok upload'].map((h) => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: sub, fontSize: 11, textTransform: 'uppercase', borderBottom: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const m = r.matched;
                  const losing = m && !m.no_hpp && r.current_price != null && m.harga_bep != null && r.current_price < m.harga_bep;
                  const stockMismatch = m && r.current_stock != null && m.stock_habil !== r.current_stock;
                  const k = keyOf(r);
                  return (
                    <tr key={k} style={{ borderBottom: `1px solid ${border}`, backgroundColor: !m ? 'rgba(245,158,11,0.06)' : (m.auto ? 'rgba(139,92,246,0.05)' : 'transparent') }}>
                      <td style={{ padding: '9px 12px', maxWidth: 240 }}>
                        <div style={{ fontWeight: 600, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.product_name}</div>
                        <div style={{ fontSize: 11, color: sub }}>{[r.variation, r.sku].filter(Boolean).join(' · ') || '—'}{r.bundle_qty > 1 ? ` · bundle ×${r.bundle_qty}` : ''}</div>
                      </td>
                      <td style={{ padding: '9px 12px', maxWidth: 220 }}>
                        {m ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: text }}>
                              {m.auto ? <Sparkles size={13} color="#8B5CF6" /> : <CheckCircle2 size={14} color="var(--color-success)" />} {m.name}
                            </span>
                            <button onClick={() => setMapRow(r)} style={{ alignSelf: 'flex-start', fontSize: 11, color: m.auto ? '#8B5CF6' : sub, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>{m.auto ? 'auto — cek / ganti' : 'ganti'}</button>
                          </div>
                        ) : (
                          <button onClick={() => setMapRow(r)} className="ui-motion-button ui-focus-ring" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', border: '1px solid #F59E0B', color: '#F59E0B', background: 'transparent', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}><Link2 size={13} /> Petakan…</button>
                        )}
                      </td>
                      <td style={{ padding: '9px 12px', color: m?.no_hpp ? '#F59E0B' : text, whiteSpace: 'nowrap' }}>{m ? (m.no_hpp ? 'kosong' : fmtRp(m.hpp_bundle)) : '—'}</td>
                      <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                        {m ? <span style={{ color: m.stock_habil <= 0 ? 'var(--color-danger)' : text, fontWeight: stockMismatch ? 700 : 400 }}>{m.stock_habil}{stockMismatch ? ` (toko: ${r.current_stock})` : ''}</span> : '—'}
                      </td>
                      <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: losing ? 'var(--color-danger)' : text, fontWeight: losing ? 700 : 400 }}>
                        {r.current_price != null ? fmtRp(r.current_price) : '—'}{losing && <AlertTriangle size={12} color="var(--color-danger)" style={{ verticalAlign: 'middle', marginLeft: 4 }} />}
                      </td>
                      <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                        {m ? (m.no_hpp ? <span style={{ fontSize: 11, color: '#F59E0B' }}>lengkapi HPP dulu</span> : (
                          <div><div style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{fmtRp(m.recommended_price)}</div><div style={{ fontSize: 10, color: sub }}>laba {fmtRp(m.estimasi_laba)} · {m.margin_laba}%</div></div>
                        )) : '—'}
                      </td>
                      <td style={{ padding: '9px 12px' }}><input type="number" value={finals[k]?.price ?? ''} onChange={(e) => setFinal(r, 'price', e.target.value)} style={{ ...inputStyle, width: 100 }} /></td>
                      <td style={{ padding: '9px 12px' }}><input type="number" value={finals[k]?.stock ?? ''} onChange={(e) => setFinal(r, 'stock', e.target.value)} style={{ ...inputStyle, width: 76 }} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 11, color: sub, marginTop: 10 }}>💜 "Auto — cek" = tebakan otomatis, pastikan benar sebelum pakai. Kolom stok upload default dari stok HABIL; download TIDAK mengubah inventory (stok opname tetap sumber kebenaran).</p>
        </div>
      )}

      {!rows.length && !loading && !pending && (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: sub, fontSize: 13 }}>Pilih toko di atas atau upload file template baru.</div>
      )}

      {mapRow && <MapModal row={mapRow} products={products} isDarkMode={isDarkMode} onClose={() => setMapRow(null)} onMap={doMap} />}
    </div>
  );
}

function MapModal({ row, products, isDarkMode, onClose, onMap }) {
  const border = isDarkMode ? 'var(--color-surface-raised)' : 'var(--color-border)';
  const cardBg = isDarkMode ? '#1c1c1e' : '#fff';
  const text = isDarkMode ? '#FFF' : '#000';
  const sub = 'var(--color-text-subtle)';
  const [q, setQ] = useState('');
  const [bundle, setBundle] = useState(row.bundle_qty || 1);
  const inputStyle = { width: '100%', padding: '10px 12px', border: `1px solid ${border}`, borderRadius: 10, backgroundColor: isDarkMode ? 'var(--color-surface-raised)' : 'var(--color-bg)', color: text, fontSize: 14, outline: 'none', boxSizing: 'border-box' };
  const list = useMemo(() => {
    const base = row.suggestions?.length ? row.suggestions.map((s) => ({ id: s.product_id, name: s.name, code: s.code, score: s.score })) : [];
    const term = q.trim().toLowerCase();
    return term ? products.filter((p) => p.name?.toLowerCase().includes(term) || p.code?.toLowerCase().includes(term)).slice(0, 30) : base;
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
