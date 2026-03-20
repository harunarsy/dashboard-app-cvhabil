  import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, Printer, Monitor } from 'lucide-react';
import Skeleton from './common/Skeleton';
import { printSettingsAPI } from '../services/api';

export default function PrintSettings({ isDarkMode, isSidebarOpen, isMobile }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data } = await printSettingsAPI.get();
      // The backend returns { nota_layout: { ... } }
      if (data && data.nota_layout) {
        setSettings({
          shop_name: data.nota_layout.shop_name || data.nota_layout.company_name || '',
          address: data.nota_layout.address || '',
          phone: data.nota_layout.phone || '',
          footer: data.nota_layout.footer || data.nota_layout.footer_text || ''
        });
      } else {
        // Fallback to empty if no settings found
        setSettings({ shop_name: '', address: '', phone: '', footer: '' });
      }
    } catch (e) {
      console.error('Error fetching settings:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      // The backend expects a flat object of key-value pairs
      // nota_layout is the key used for print settings
      const payload = {
        nota_layout: {
          shop_name: settings.shop_name,
          address: settings.address,
          phone: settings.phone,
          footer: settings.footer
        }
      };
      await printSettingsAPI.update(payload);
      setToast('Pengaturan berhasil disimpan');
      setTimeout(() => setToast(''), 3000);
    } catch (e) {
      console.error('Update error:', e);
      setToast('Gagal menyimpan pengaturan');
    } finally {
      setSaving(false);
    }
  };

  const bg = isDarkMode ? '#000' : '#F5F5F7';
  const cardBg = isDarkMode ? '#1C1C1E' : '#FFF';
  const border = isDarkMode ? '#2C2C2E' : '#E5E5EA';
  const text = isDarkMode ? '#FFF' : '#000';
  const sub = isDarkMode ? '#86868B' : '#6B7280';
  const inputBg = isDarkMode ? '#2C2C2E' : '#F5F5F7';

  if (loading) return (
    <div style={{ padding: isMobile ? '1rem' : '2rem', paddingTop: isMobile ? '4rem' : '2rem', backgroundColor: bg, minHeight: '100vh', transition: 'margin-left 0.3s' }}>
      <Skeleton width="200px" height="32px" style={{ marginBottom: '24px' }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div style={{ backgroundColor: cardBg, borderRadius: '16px', padding: '24px', border: `1px solid ${border}` }}>
          <Skeleton width="100%" height="20px" style={{ marginBottom: '16px' }} />
          <Skeleton width="100%" height="20px" style={{ marginBottom: '16px' }} />
          <Skeleton width="80%" height="20px" style={{ marginBottom: '16px' }} />
        </div>
        <Skeleton height="350px" borderRadius="16px" />
      </div>
    </div>
  );

  if (!settings) return <div style={{ padding: '40px', textAlign: 'center', color: sub }}>Gagal memuat pengaturan.</div>;

  // Live preview derived values
  const previewName = settings.shop_name || 'NAMA TOKO';
  const previewAddr = settings.address || 'Alamat toko Anda akan muncul di sini';
  const previewPhone = settings.phone || '';
  const previewFooter = settings.footer || 'Dokumen dicetak otomatis oleh Habil SuperApp';

  return (
    <div style={{ padding: isMobile ? '1rem' : '2rem', paddingTop: isMobile ? '4rem' : '2rem', backgroundColor: bg, minHeight: '100vh', transition: 'margin-left 0.3s' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        {/* Page Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: '700', color: text, margin: 0 }}>Pengaturan</h1>
            <p style={{ color: sub, margin: '4px 0 0', fontSize: '14px' }}>Konfigurasi identitas toko untuk dokumen cetak</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
              backgroundColor: '#007AFF', color: '#FFF', border: 'none', borderRadius: '10px',
              fontSize: '14px', fontWeight: '600', cursor: 'pointer', transition: 'opacity 0.2s',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
            {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
          </button>
        </div>

        {/* Split Layout: Form (left) + Preview (right) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
          
          {/* LEFT — Form Inputs */}
          <div style={{ backgroundColor: cardBg, borderRadius: '16px', padding: '24px', border: `1px solid ${border}`, boxShadow: isDarkMode ? 'none' : '0 1px 3px rgba(0,0,0,0.05)' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: text, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Printer size={18} color="#007AFF" /> Identitas Toko
            </h3>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: sub, marginBottom: '8px', fontWeight: '600', textTransform: 'uppercase' }}>NAMA TOKO</label>
              <input
                type="text"
                value={settings.shop_name}
                onChange={e => setSettings({ ...settings, shop_name: e.target.value })}
                placeholder="Contoh: CV HABIL SEJAHTERA"
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: inputBg, color: text, boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: sub, marginBottom: '8px', fontWeight: '600', textTransform: 'uppercase' }}>ALAMAT</label>
              <textarea
                rows={3}
                value={settings.address}
                onChange={e => setSettings({ ...settings, address: e.target.value })}
                placeholder="Jl. Contoh No. 1, Surabaya"
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: inputBg, color: text, resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: sub, marginBottom: '8px', fontWeight: '600', textTransform: 'uppercase' }}>NOMOR TELEPON</label>
              <input
                type="text"
                value={settings.phone}
                onChange={e => setSettings({ ...settings, phone: e.target.value })}
                placeholder="0812-xxxx-xxxx"
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: inputBg, color: text, boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: sub, marginBottom: '8px', fontWeight: '600', textTransform: 'uppercase' }}>CATATAN KAKI (FOOTER)</label>
              <input
                type="text"
                value={settings.footer}
                onChange={e => setSettings({ ...settings, footer: e.target.value })}
                placeholder="Terima kasih atas kepercayaan Anda"
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: inputBg, color: text, boxSizing: 'border-box' }}
              />
              <p style={{ fontSize: '11px', color: sub, marginTop: '6px' }}>Teks ini muncul di bagian bawah setiap dokumen cetak.</p>
            </div>
          </div>

          {/* RIGHT — Live Preview */}
          <div style={{ position: 'sticky', top: '24px' }}>
            <div style={{ backgroundColor: cardBg, borderRadius: '16px', padding: '20px', border: `1px solid ${border}`, boxShadow: isDarkMode ? 'none' : '0 1px 3px rgba(0,0,0,0.05)' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '700', color: text, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Monitor size={18} color="#FF9500" /> Preview Dokumen
              </h3>
              <p style={{ fontSize: '11px', color: sub, marginBottom: '16px', marginTop: '-8px' }}>Tampilan real-time saat diisi.</p>

              {/* Document Preview Card */}
              <div style={{
                backgroundColor: '#FFF', borderRadius: '10px', padding: '20px',
                border: '1px solid #E5E5EA', boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                fontFamily: 'Helvetica, Arial, sans-serif',
              }}>
                {/* Header area */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: '800', color: '#007AFF', marginBottom: '3px' }}>
                      {previewName}
                    </div>
                    <div style={{ fontSize: '9px', color: '#555', lineHeight: '1.4' }}>{previewAddr}</div>
                    {previewPhone && <div style={{ fontSize: '9px', color: '#555' }}>Telp: {previewPhone}</div>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '11px', fontWeight: '800', color: '#000', marginBottom: '2px' }}>NOTA PENJUALAN</div>
                    <div style={{ fontSize: '8px', color: '#777' }}>No: NT/2026/001</div>
                    <div style={{ fontSize: '8px', color: '#777' }}>14 Mar 2026</div>
                  </div>
                </div>

                {/* Divider */}
                <div style={{ height: '1.5px', backgroundColor: '#007AFF', marginBottom: '10px', borderRadius: '2px' }} />

                {/* Body placeholder */}
                <div style={{ marginBottom: '8px' }}>
                  <span style={{ fontSize: '9px', color: '#555' }}>Kepada Yth: </span>
                  <span style={{ fontSize: '9px', fontWeight: '700', color: '#000' }}>Nama Customer</span>
                </div>
                <div style={{ backgroundColor: '#F5F5F7', borderRadius: '6px', overflow: 'hidden', marginBottom: '10px' }}>
                  <table style={{ width: '100%', fontSize: '8px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#007AFF', color: '#FFF' }}>
                        {['No', 'Nama Barang', 'Qty', 'Harga', 'Total'].map(h => (
                          <th key={h} style={{ padding: '3px 5px', textAlign: 'left' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ padding: '3px 5px', color: '#3A3A3C' }}>1</td>
                        <td style={{ padding: '3px 5px', color: '#3A3A3C' }}>Contoh Produk</td>
                        <td style={{ padding: '3px 5px', color: '#3A3A3C' }}>2</td>
                        <td style={{ padding: '3px 5px', color: '#3A3A3C' }}>Rp 50.000</td>
                        <td style={{ padding: '3px 5px', color: '#3A3A3C' }}>Rp 100.000</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div style={{ textAlign: 'right', fontSize: '10px', fontWeight: '800', color: '#000', marginBottom: '12px' }}>
                  GRAND TOTAL: Rp 100.000
                </div>

                {/* Footer */}
                <div style={{ borderTop: '1px dashed #E5E5EA', paddingTop: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '8px', color: '#AEAEB2' }}>{previewFooter}</div>
                </div>
              </div>

              {/* Info legend */}
              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {[
                  { color: '#007AFF', label: 'Nama Toko' },
                  { color: '#555', label: 'Alamat & Telepon' },
                  { color: '#AEAEB2', label: 'Footer / Catatan Kaki' },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: item.color, flexShrink: 0 }} />
                    <span style={{ fontSize: '11px', color: sub }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div style={{ position: 'fixed', bottom: '24px', right: '24px', padding: '12px 24px', backgroundColor: '#1C1C1E', color: '#FFF', borderRadius: '12px', fontSize: '14px', fontWeight: '600', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', zIndex: 9999 }}>
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
