import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, Printer, Smartphone, Monitor } from 'lucide-react';
import Skeleton from './common/Skeleton';
import { printSettingsAPI, countersAPI } from '../services/api';

export default function PrintSettings({ isDarkMode, isSidebarOpen }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [counters, setCounters] = useState({});

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data } = await printSettingsAPI.get();
      setSettings(data);
    } catch (e) {
      console.error('Error fetching settings:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchCounters = async () => {
    try {
      const { data } = await countersAPI.getAll();
      const map = {};
      data.forEach(c => map[c.key] = c.value);
      setCounters(map);
    } catch (e) {
      console.error('Error fetching counters:', e);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchCounters();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await printSettingsAPI.update(settings);
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

  if (loading) return (
    <div style={{ padding: '2rem', marginLeft: isSidebarOpen ? '256px' : '80px', backgroundColor: bg, minHeight: '100vh', transition: 'margin-left 0.3s' }}>
      <Skeleton width="200px" height="32px" style={{ marginBottom: '24px' }} />
      <div style={{ backgroundColor: cardBg, borderRadius: '16px', padding: '24px', border: `1px solid ${border}` }}>
        <Skeleton width="100%" height="20px" style={{ marginBottom: '16px' }} />
        <Skeleton width="100%" height="20px" style={{ marginBottom: '16px' }} />
        <Skeleton width="80%" height="20px" style={{ marginBottom: '16px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '24px' }}>
          <Skeleton height="100px" borderRadius="12px" />
          <Skeleton height="100px" borderRadius="12px" />
        </div>
      </div>
    </div>
  );

  if (!settings) return <div style={{ padding: '40px', textAlign: 'center', color: sub }}>Gagal memuat pengaturan.</div>;

  return (
    <div style={{ padding: '2rem', marginLeft: isSidebarOpen ? '256px' : '80px', backgroundColor: bg, minHeight: '100vh', transition: 'margin-left 0.3s' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: '700', color: text, margin: 0 }}>Pengaturan Cetak</h1>
            <p style={{ color: sub, margin: '4px 0 0', fontSize: '14px' }}>Konfigurasi printer dan format dokumen</p>
          </div>
          <button 
            onClick={handleSave}
            disabled={saving}
            style={{ 
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: '#007AFF', color: '#FFF', 
              border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', transition: 'opacity 0.2s'
            }}
          >
            {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
            {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
          </button>
        </div>

        <div style={{ backgroundColor: cardBg, borderRadius: '16px', padding: '24px', border: `1px solid ${border}`, boxShadow: isDarkMode ? 'none' : '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <section>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: text, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Printer size={18} color="#007AFF" /> Header Invoice
              </h3>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: sub, marginBottom: '8px', fontWeight: '600' }}>NAMA TOKO</label>
                <input 
                  type="text" 
                  value={settings.shop_name} 
                  onChange={e => setSettings({...settings, shop_name: e.target.value})}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', color: text }} 
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: sub, marginBottom: '8px', fontWeight: '600' }}>ALAMAT</label>
                <textarea 
                  rows={3} 
                  value={settings.address} 
                  onChange={e => setSettings({...settings, address: e.target.value})}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', color: text, resize: 'none' }} 
                />
              </div>
            </section>

            <section>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: text, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Monitor size={18} color="#FF9500" /> Kontak & Info
              </h3>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: sub, marginBottom: '8px', fontWeight: '600' }}>NOMOR TELEPON</label>
                <input 
                  type="text" 
                  value={settings.phone} 
                  onChange={e => setSettings({...settings, phone: e.target.value})}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', color: text }} 
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: sub, marginBottom: '8px', fontWeight: '600' }}>CATATAN KAKI (FOOTER)</label>
                <input 
                  type="text" 
                  value={settings.footer} 
                  onChange={e => setSettings({...settings, footer: e.target.value})}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', color: text }} 
                />
              </div>
            </section>
          </div>
        </div>

        {toast && (
          <div style={{ position: 'fixed', bottom: '24px', right: '24px', padding: '12px 24px', backgroundColor: '#1C1C1E', color: '#FFF', borderRadius: '12px', fontSize: '14px', fontWeight: '600', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
