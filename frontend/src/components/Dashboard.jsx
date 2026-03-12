import React, { useState, useEffect } from 'react';
import { Info, X, Activity, ShoppingCart, Users, Package } from 'lucide-react';
import api from '../services/api';

const changelog = [
  {
    version: 'v1.1.0', date: '12 Mar 2026', status: 'latest',
    changes: [
      { type: 'new', text: 'Dashboard Stats Integrasi: Angka penjualan, pesanan aktif, stok low, dan customer kini real-time dari database' },
      { type: 'new', text: 'Database Seed Master: Integrasi data existing SP, Customer, dan Distributor ke sistem' }
    ]
  },
  {
    version: 'v1.1.1', date: '12 Mar 2026', status: 'stable',
    changes: [
      { type: 'fix', text: 'Perbaikan Database Connection: Timeout saat login telah diperbaiki dengan auto-fallback jaringan lokal' },
      { type: 'fix', text: 'Keamanan Sesi: Auto-logout JWT 15 menit diterapkan untuk menghindari bentrok data antar user' },
      { type: 'fix', text: 'Tombol quick-login dihapus dari production untuk alasan keamanan' },
      { type: 'new', text: 'UI Dashboard baru dengan Modal Popup Release History & Upcoming Features' },
    ]
  },
  {
    version: 'v1.0.0', date: '12 Mar 2026', status: 'stable',
    changes: [
      { type: 'new', text: 'Toko Online: Import CSV Shopee & TikTok, Kalkulasi profit' },
      { type: 'new', text: 'Buku Besar: Sistem Jurnal Keuangan Khusus Direktur' },
      { type: 'new', text: 'Surat Pesanan: Auto-PO, tracking receive langsung masuk Inventory' },
      { type: 'new', text: 'Inventory: FEFO tracking otomatis' },
    ]
  },
  {
    version: 'v0.6.3', date: '11 Mar 2026', status: 'stable',
    changes: [
      { type: 'fix', text: 'ESLint warnings bersih: unused imports & missing dependencies diperbaiki' },
      { type: 'fix', text: 'Database branch isolation: otomatis deteksi branch git & load .env.dev di dev branch' },
      { type: 'new', text: 'Clean Repo: hapus ~10MB file sampah, build lama, dan CRA boilerplate' },
    ]
  },
  {
    version: 'v0.6.2', date: '11 Mar 2026', status: 'stable',
    changes: [
      { type: 'fix', text: 'Bug tanggal: restore parseLocalDate/formatLocalDate + TO_CHAR di backend' },
      { type: 'new', text: 'Warna unik per distributor di rekap stack & row tabel' },
    ]
  }
];

const upcoming = [
  { priority: 'high', title: 'Export PDF / Excel', desc: 'Export faktur individual atau rekap bulanan ke PDF & Excel untuk laporan dan arsip' },
  { priority: 'high', title: 'Halaman Finance & Karyawan', desc: 'Modul lanjutan untuk penggajian dan manajemen hutang/piutang' },
  { priority: 'medium', title: 'Password Hashing', desc: 'Keamanan login dengan bcrypt' },
];

export default function Dashboard({ isDarkMode, isSidebarOpen }) {
  const [showModal, setShowModal] = useState(false);

  const bg = isDarkMode ? '#000' : '#F5F5F7';
  const cardBg = isDarkMode ? '#1C1C1E' : '#FFF';
  const border = isDarkMode ? '#2C2C2E' : '#E5E5EA';
  const text = isDarkMode ? '#FFF' : '#000';
  const sub = '#86868B';

  const typeConfig = {
    new:     { label: 'Baru',    color: '#34C759', bg: '#34C75918' },
    fix:     { label: 'Fix',     color: '#007AFF', bg: '#007AFF18' },
    removed: { label: 'Hapus',   color: '#FF3B30', bg: '#FF3B3018' },
  };
  const priorityConfig = {
    high:   { label: 'Prioritas Tinggi', color: '#FF3B30', bg: '#FF3B3018' },
    medium: { label: 'Sedang',           color: '#FF9500', bg: '#FF950018' },
    low:    { label: 'Nanti',            color: '#86868B', bg: '#86868B18' },
  };

  const [stats, setStats] = useState({
    totalPenjualan: 0,
    suratPesananAktif: 0,
    stokLowExpired: 0,
    totalCustomer: 0
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { data } = await api.get('/dashboard/stats');
        setStats(data);
      } catch (error) {
        console.error('Failed to fetch dashboard stats', error);
      }
    };
    fetchStats();
  }, []);

  const formatRupiah = (number) => {
    if (number >= 1000000) {
      return 'Rp ' + (number / 1000000).toFixed(1) + 'M';
    }
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number);
  };


  return (
    <div className="font-sans min-h-screen transition-all duration-300" style={{ padding: '2.5rem', marginLeft: isSidebarOpen ? '256px' : '80px', backgroundColor: bg }}>
      
      {/* Header Section */}
      <div className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-3xl font-bold mb-2 tracking-tight" style={{ color: text }}>Dashboard</h1>
          <p className="text-sm font-medium" style={{ color: sub }}>Welcome back to CV Habil Business Module.</p>
        </div>
        
        {/* Version Badge & Changelog Trigger */}
        <button 
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-full border transition-colors hover:shadow-sm"
          style={{ backgroundColor: cardBg, borderColor: border, color: text }}
        >
          <Info size={16} className="text-blue-500" />
          <span className="text-sm font-semibold">Version 1.1.0</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium ml-2">Release Notes</span>
        </button>
      </div>

      {/* Quick Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {[
          { label: 'Total Penjualan bln ini', value: formatRupiah(stats.totalPenjualan), icon: <Activity size={24} className="text-green-500"/> },
          { label: 'Surat Pesanan Aktif', value: stats.suratPesananAktif.toString(), icon: <ShoppingCart size={24} className="text-blue-500"/> },
          { label: 'Stok Low/Expired', value: stats.stokLowExpired.toString(), icon: <Package size={24} className="text-orange-500"/> },
          { label: 'Total Customer', value: stats.totalCustomer.toString(), icon: <Users size={24} className="text-indigo-500"/> },
        ].map((stat, i) => (
          <div key={i} className="rounded-2xl p-6 border shadow-sm" style={{ backgroundColor: cardBg, borderColor: border }}>
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-gray-50 rounded-xl dark:bg-gray-800">{stat.icon}</div>
            </div>
            <h3 className="text-3xl font-bold mb-1" style={{ color: text }}>{stat.value}</h3>
            <p className="text-sm font-medium" style={{ color: sub }}>{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Quick Links Section */}
      <div className="rounded-3xl p-8 border shadow-sm" style={{ backgroundColor: cardBg, borderColor: border }}>
        <h2 className="text-xl font-bold mb-6" style={{ color: text }}>Akses Cepat</h2>
        <div className="flex flex-wrap gap-4">
          <a href="/sales" className="px-5 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors">Buat Nota Penjualan</a>
          <a href="/orders" className="px-5 py-3 rounded-xl border font-medium transition-colors hover:bg-gray-50 dark:hover:bg-gray-800" style={{ borderColor: border, color: text }}>Tambah Surat Pesanan</a>
          <a href="/online-store" className="px-5 py-3 rounded-xl border font-medium transition-colors hover:bg-gray-50 dark:hover:bg-gray-800" style={{ borderColor: border, color: text }}>Import CSV Toko Online</a>
        </div>
      </div>

      {/* Changelog & Upcoming Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm transition-opacity">
          <div 
            className="w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-3xl shadow-2xl flex flex-col"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
          >
            {/* Modal Header */}
            <div className="flex justify-between items-center p-6 border-b" style={{ borderColor: border }}>
              <div>
                <h2 className="text-xl font-bold" style={{ color: text }}>🚀 Changelog & Roadmap</h2>
                <p className="text-xs mt-1" style={{ color: sub }}>Aktual: v1.1.0 - Terakhir diupdate 12 Mar 2026</p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <X size={20} style={{ color: sub }} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto" style={{ backgroundColor: bg }}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Release History */}
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2" style={{ color: sub }}>
                    🕐 Release History
                  </h3>
                  {changelog.map((release, ri) => (
                    <div key={ri} className="rounded-2xl p-5 mb-4 border shadow-sm" style={{ backgroundColor: cardBg, borderColor: border }}>
                      <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold" style={{ color: text }}>{release.version}</span>
                          <span className="text-xs font-bold px-2.5 py-1 rounded-md" style={{ backgroundColor: release.status === 'latest' ? '#34C75918' : '#007AFF18', color: release.status === 'latest' ? '#34C759' : '#007AFF' }}>
                            {release.status === 'latest' ? 'LATEST' : 'STABLE'}
                          </span>
                        </div>
                        <span className="text-xs font-medium" style={{ color: sub }}>{release.date}</span>
                      </div>
                      <div className="flex flex-col gap-3">
                        {release.changes.map((c, ci) => {
                          const cfg = typeConfig[c.type];
                          return (
                            <div key={ci} className="flex gap-3 items-start">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase mt-0.5 shrink-0" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
                                {cfg.label}
                              </span>
                              <span className="text-sm leading-relaxed" style={{ color: isDarkMode ? '#EBEBF0' : '#3A3A3C' }}>{c.text}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Upcoming */}
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2" style={{ color: sub }}>
                    🌟 Upcoming Features
                  </h3>
                  {upcoming.map((item, i) => {
                    const cfg = priorityConfig[item.priority];
                    return (
                      <div key={i} className="rounded-2xl p-5 mb-3 border flex gap-4 items-start shadow-sm transition-transform hover:-translate-y-0.5" style={{ backgroundColor: cardBg, borderColor: border }}>
                        <div className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: cfg.color, boxShadow: `0 0 8px ${cfg.color}80` }} />
                        <div className="flex-1">
                          <div className="flex justify-between items-center mb-1.5">
                            <span className="font-semibold" style={{ color: text }}>{item.title}</span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
                              {cfg.label}
                            </span>
                          </div>
                          <p className="text-xs leading-relaxed" style={{ color: sub }}>{item.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>
            </div>
            
            {/* Modal Footer */}
            <div className="p-4 border-t flex justify-end" style={{ borderColor: border, backgroundColor: cardBg }}>
              <button 
                onClick={() => setShowModal(false)}
                className="px-6 py-2 rounded-xl bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}