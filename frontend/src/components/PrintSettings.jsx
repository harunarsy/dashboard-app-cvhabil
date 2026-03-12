import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, Layout, Type } from 'lucide-react';
import { printSettingsAPI } from '../services/api';

export default function PrintSettings({ isDarkMode }) {
  const [settings, setSettings] = useState({
    company_name: '',
    address: '',
    footer_text: '',
    show_logo: false
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data } = await printSettingsAPI.get();
      if (data.nota_layout) setSettings(data.nota_layout);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSettings(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await printSettingsAPI.save('nota_layout', settings);
      setMessage('✅ Pengaturan disimpan');
      setTimeout(() => setMessage(''), 3000);
    } catch (e) {
      alert('Gagal menyimpan: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const bg = isDarkMode ? '#1C1C1E' : '#FFF';
  const cardBg = isDarkMode ? '#000' : '#F5F5F7';
  const border = isDarkMode ? '#2C2C2E' : '#E5E5EA';
  const text = isDarkMode ? '#FFF' : '#000';
  const sub = isDarkMode ? '#86868B' : '#6B7280';

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: sub }}>Memuat pengaturan...</div>;

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', margin: '0 0 4px 0', color: text }}>Pengaturan Cetak</h1>
          <p style={{ fontSize: '14px', color: sub, margin: 0 }}>Kustomisasi layout PDF Nota & Tanda Terima</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', backgroundColor: '#007AFF', color: '#FFF', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: '700', opacity: saving ? 0.7 : 1 }}>
          {saving ? <RefreshCw size={18} className="spin" /> : <Save size={18} />}
          Simpan Perubahan
        </button>
      </div>

      {message && (
        <div style={{ padding: '12px 16px', backgroundColor: '#34C75915', color: '#34C759', borderRadius: '10px', marginBottom: '20px', fontSize: '14px', fontWeight: '600' }}>
          {message}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Form Section */}
        <div style={{ backgroundColor: bg, padding: '24px', borderRadius: '20px', border: `1px solid ${border}` }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '20px', color: text, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Type size={18} color="#007AFF" /> Header & Footer
          </h3>
          
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: sub, marginBottom: '8px', textTransform: 'uppercase' }}>Nama Perusahaan</label>
            <input value={settings.company_name} onChange={e => setSettings({ ...settings, company_name: e.target.value })}
              style={{ width: '100%', padding: '12px', borderRadius: '10px', border: `1px solid ${border}`, backgroundColor: cardBg, color: text, fontSize: '14px', outline: 'none' }} />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: sub, marginBottom: '8px', textTransform: 'uppercase' }}>Alamat / Kontak</label>
            <textarea value={settings.address} onChange={e => setSettings({ ...settings, address: e.target.value })} rows={3}
              style={{ width: '100%', padding: '12px', borderRadius: '10px', border: `1px solid ${border}`, backgroundColor: cardBg, color: text, fontSize: '14px', outline: 'none', resize: 'none' }} />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: sub, marginBottom: '8px', textTransform: 'uppercase' }}>Teks Footer</label>
            <textarea value={settings.footer_text} onChange={e => setSettings({ ...settings, footer_text: e.target.value })} rows={2}
              style={{ width: '100%', padding: '12px', borderRadius: '10px', border: `1px solid ${border}`, backgroundColor: cardBg, color: text, fontSize: '14px', outline: 'none', resize: 'none' }} />
          </div>
        </div>

        {/* Preview Section */}
        <div style={{ backgroundColor: bg, padding: '24px', borderRadius: '20px', border: `1px solid ${border}`, display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '20px', color: text, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layout size={18} color="#5856D6" /> Live Preview (Header)
          </h3>
          
          <div style={{ flex: 1, backgroundColor: '#FFF', borderRadius: '12px', padding: '20px', border: '1px solid #E5E5EA', color: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: '800', marginBottom: '8px', maxWidth: '100%' }}>{settings.company_name || 'NAMA PERUSAHAAN'}</div>
            <div style={{ fontSize: '10px', color: '#6B7280', whiteSpace: 'pre-wrap' }}>{settings.address || 'Alamat perusahaan akan muncul di sini...'}</div>
            
            <div style={{ width: '100%', height: '1px', backgroundColor: '#000', margin: '15px 0' }}></div>
            
            <div style={{ fontSize: '12px', fontWeight: '700', letterSpacing: '2px', marginBottom: '30px' }}>NOTA PENJUALAN</div>
            
            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', marginBottom: '40px' }}>
               <div style={{ height: '8px', width: '40%', backgroundColor: '#F3F4F6', borderRadius: '4px' }}></div>
               <div style={{ height: '8px', width: '30%', backgroundColor: '#F3F4F6', borderRadius: '4px' }}></div>
            </div>

            <div style={{ width: '100%', height: '60px', backgroundColor: '#F9FAFB', borderRadius: '8px', marginBottom: '20px', border: '1px solid #F3F4F6' }}></div>

            <div style={{ fontSize: '8px', color: '#9CA3AF', marginTop: 'auto' }}>{settings.footer_text || 'Footer text...'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
