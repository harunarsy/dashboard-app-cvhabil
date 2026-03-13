import React, { useState, useEffect } from 'react';
import { Info, X, Activity, ShoppingCart, Users, Package } from 'lucide-react';
import api from '../services/api';
import TasksKanban from './TasksKanban';
import Skeleton from './common/Skeleton';

const changelog = [
  {
    version: 'v1.3.1-standard', date: '13 Mar 2026', status: 'latest',
    changes: [
      { type: 'fix', text: 'Universal Sync: Sinkronisasi total label versi ke format v1.3.1-standard.' },
      { type: 'new', text: 'UI Audit: Pembersihan sisa-sisa label versi lama di seluruh tampilan.' }
    ]
  },
  {
    version: 'v1.2.5', date: '13 Mar 2026', status: 'stable',
    changes: [
      { type: 'fix', text: 'Global Version Sync: Penyelarasan seluruh label versi di UI & Dokumentasi.' },
      { type: 'new', text: 'Consistency: Sinkronisasi riwayat changelog modal dengan CHANGELOG.md.' }
    ]
  },
  {
    version: 'v1.2.5', date: '13 Mar 2026', status: 'stable',
    changes: [
      { type: 'new', text: 'Session Shutdown: Penutupan sesi dan auditing SOP otomatis.' }
    ]
  },
  {
    version: 'v1.2.1', date: '13 Mar 2026', status: 'stable',
    changes: [
      { type: 'new', text: 'Auto-Release Popup: Menampilkan ringkasan update HANYA SEKALI setelah login.' },
      { type: 'fix', text: 'Pre-Deployment Audit: Koneksi production dipastikan stabil.' }
    ]
  },
  {
    version: 'v1.2.0', date: '13 Mar 2026', status: 'stable',
    changes: [
      { type: 'new', text: 'Master Distributor: Penambahan short_code, nama salesman, dan nomor HP.' },
      { type: 'new', text: 'Surat Pesanan (SP): UI PIC Dropdown (Harun/Fivin) & Info Salesman Otomatis.' },
      { type: 'new', text: 'Print SP A6: Layout "Blue Area" khusus kertas A6 tersentral.' }
    ]
  },
  {
    version: 'v1.1.9', date: '13 Mar 2026', status: 'stable',
    changes: [
      { type: 'new', text: 'Branding: App kini resmi bernama HABIL SUPERAPP.' },
      { type: 'new', text: 'Migrasi Counter: Sistem Auto-Numbering untuk SP, Nota, TT (Lock/Unlock feature).' }
    ]
  },
  {
    version: 'v1.1.8', date: '13 Mar 2026', status: 'stable',
    changes: [
      { type: 'new', text: 'Documentation Consolidation: Single technical source of truth di CHANGELOG.md' },
      { type: 'new', text: 'Health Check Automatis: Pre-flight check DB setiap npm run dev' },
      { type: 'fix', text: 'Performance: Database indexing untuk pencarian produk' }
    ]
  },
  {
    version: 'v1.1.7', date: '13 Mar 2026', status: 'stable',
    changes: [
      { type: 'new', text: 'AI Efficiency Rules: Standarisasi Port 6543 & Dynamic API URL' },
      { type: 'fix', text: 'Smart API: Deteksi otomatis environment Lokal vs Vercel' }
    ]
  },
  {
    version: 'v1.1.6', date: '12 Mar 2026', status: 'stable',
    changes: [
      { type: 'new', text: 'Data Sync: Auto-restore data produk & customer dari cloud backup' },
      { type: 'new', text: 'Sync Script: Tool mandiri untuk tarik data terbaru dari Supabase' }
    ]
  },
  {
    version: 'v1.1.5', date: '12 Mar 2026', status: 'stable',
    changes: [
      { type: 'new', text: 'Cloud Bridge: Koneksi langsung ke database Supabase via Cloud URI' },
      { type: 'fix', text: 'Diagnostic Check: Script verifikasi koneksi database (Lokal/Cloud)' }
    ]
  },
  {
    version: 'v1.1.4', date: '12 Mar 2026', status: 'stable',
    changes: [
      { type: 'fix', text: 'Quality Assurance: Automated tests untuk Skeleton components' },
      { type: 'fix', text: 'Dashboard Fix: Perbaikan import React yang hilang' }
    ]
  },
  {
    version: 'v1.1.3', date: '12 Mar 2026', status: 'stable',
    changes: [
      { type: 'new', text: 'Premium UX: Implementasi Skeleton Loading (Apple Style)' },
      { type: 'fix', text: 'Layout Consistency: Pencegahan layout shift saat muat data' }
    ]
  },
  {
    version: 'v1.1.2', date: '12 Mar 2026', status: 'stable',
    changes: [
      { type: 'new', text: 'Dashboard Notes: Menambahkan bagian catatan/pengumuman penting untuk feedback user' },
      { type: 'fix', text: 'Version Sync: Sinkronisasi versi v1.1.2 di seluruh sistem (Anti-Belang)' },
      { type: 'fix', text: 'UI Fix: Perbaikan minor di halaman Print Settings' }
    ]
  },
  {
    version: 'v1.1.1', date: '12 Mar 2026', status: 'stable',
    changes: [
      { type: 'new', text: 'Cloud Migration: Integrasi penuh dengan Vercel & Supabase (Singapore Region)' },
      { type: 'fix', text: 'CORS Fix: Perbaikan akses antar domain di lingkungan produksi' },
      { type: 'new', text: 'Nota PDF Builder: Layout landscape untuk A5 & A6' }
    ]
  },
  {
    version: 'v1.1.0', date: '12 Mar 2026', status: 'stable',
    changes: [
      { type: 'new', text: 'Dashboard Stats Integrasi: Angka penjualan, pesanan aktif, stok low, dan customer kini real-time dari database' },
      { type: 'new', text: 'Database Seed Master: Integrasi data existing SP, Customer, dan Distributor ke sistem' }
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
  const [showDevNotes, setShowDevNotes] = useState(false);
  const [loading, setLoading] = useState(true);
  // Show release modal only once per session
  const [showReleaseModal, setShowReleaseModal] = useState(() => {
    return !sessionStorage.getItem('habil_release_seen_v126');
  });

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
      setLoading(true);
      try {
        const { data } = await api.get('/dashboard/stats');
        setStats(data);
      } catch (error) {
        console.error('Failed to fetch dashboard stats', error);
      } finally {
        setTimeout(() => setLoading(false), 500); // Small delay for smooth transition
      }
    };
    fetchStats();
  }, []);

  const closeReleaseModal = () => {
    setShowReleaseModal(false);
    sessionStorage.setItem('habil_release_seen_v126', 'true');
  };

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
          <p className="text-sm font-medium" style={{ color: sub }}>Welcome back to HABIL SUPERAPP.</p>
        </div>
        
        {/* Version Badge & Changelog Trigger */}
        <button 
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-full border transition-colors hover:shadow-sm"
          style={{ backgroundColor: cardBg, borderColor: border, color: text }}
        >
          <Info size={16} className="text-blue-500" />
          <span className="text-sm font-semibold">Version 1.2.6-standard</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium ml-2">Release Notes</span>
        </button>
      </div>

      {/* Kanban Tasks Section - MOVED TO TOP */}
      <div className="mb-10 rounded-3xl p-8 border shadow-sm" style={{ backgroundColor: cardBg, borderColor: border }}>
        <TasksKanban />
      </div>

      {/* Quick Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {[
          { label: 'Total Penjualan bln ini', value: stats.totalPenjualan, type: 'currency', icon: <Activity size={24} className="text-green-500"/> },
          { label: 'Surat Pesanan Aktif', value: stats.suratPesananAktif, type: 'number', icon: <ShoppingCart size={24} className="text-blue-500"/> },
          { label: 'Stok Low/Expired', value: stats.stokLowExpired, type: 'number', icon: <Package size={24} className="text-orange-500"/> },
          { label: 'Total Customer', value: stats.totalCustomer, type: 'number', icon: <Users size={24} className="text-indigo-500"/> },
        ].map((stat, i) => (
          <div key={i} className="rounded-2xl p-6 border shadow-sm" style={{ backgroundColor: cardBg, borderColor: border }}>
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-gray-50 rounded-xl dark:bg-gray-800">{stat.icon}</div>
            </div>
            {loading ? (
              <Skeleton width="80%" height="36px" className="mb-2" />
            ) : (
              <h3 className="text-3xl font-bold mb-1" style={{ color: text }}>
                {stat.type === 'currency' ? formatRupiah(stat.value) : stat.value.toString()}
              </h3>
            )}
            <p className="text-sm font-medium" style={{ color: sub }}>{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Quick Access Section - Compacted Row */}
      <div className="flex flex-col md:flex-row gap-6 mb-10">
        <div className="flex-1 rounded-3xl p-6 border shadow-sm flex items-center justify-between" style={{ backgroundColor: cardBg, borderColor: border }}>
          <div className="flex items-center gap-6">
            <h2 className="text-lg font-bold" style={{ color: text }}>Akses Cepat</h2>
            <div className="flex flex-wrap gap-3">
              <a href="/sales" className="px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold transition-all shadow-sm hover:shadow-md">Buat Nota</a>
              <a href="/orders" className="px-4 py-2 rounded-xl border text-xs font-semibold transition-all hover:bg-gray-50 dark:hover:bg-gray-800" style={{ borderColor: border, color: text }}>Tambah SP</a>
              <a href="/online-store" className="px-4 py-2 rounded-xl border text-xs font-semibold transition-all hover:bg-gray-50 dark:hover:bg-gray-800" style={{ borderColor: border, color: text }}>CSV Online</a>
            </div>
          </div>
          
          <button 
            onClick={() => setShowDevNotes(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-blue-100 bg-blue-50/30 text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <Info size={14} />
            <span className="text-xs font-bold">Catatan Developer</span>
          </button>
        </div>
      </div>

      {/* Auto-Release Popup v1.2.1 */}
      {showReleaseModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px] transition-opacity">
          <div 
            className="w-full max-w-lg overflow-hidden rounded-3xl shadow-2xl flex flex-col transform transition-all scale-100"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
          >
            {/* Spotlight Header */}
            <div className="relative p-8 text-center" style={{ background: 'linear-gradient(135deg, #007AFF 0%, #5856D6 100%)' }}>
              <div className="mx-auto w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-4 shadow-inner backdrop-blur-sm">
                <span className="text-3xl">🚀</span>
              </div>
              <h2 className="text-2xl font-extrabold text-white tracking-tight">APA YANG BARU?</h2>
              <p className="text-white/80 font-medium mt-1">Habil SuperApp v1.3.1-standard telah mengudara!</p>
            </div>

            {/* Content Highlights */}
            <div className="p-6 pb-2" style={{ backgroundColor: bg }}>
              <div className="flex flex-col gap-4">
                <div className="flex gap-4 items-start p-4 rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700">
                  <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                    <Activity size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white mb-1">Branding SuperApp</h3>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400 leading-relaxed">Sistem resmi berganti nama menjadi HABIL SUPERAPP dengan identitas yang lebih segar.</p>
                  </div>
                </div>

                <div className="flex gap-4 items-start p-4 rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700">
                  <div className="p-2 rounded-xl bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                    <Package size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white mb-1">Modul SP A6 & Master Distributor</h3>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400 leading-relaxed">Buat Surat Pesanan super cepat, pilih PIC, dan cetak langsung dengan format A6 (Blue Area Layout).</p>
                  </div>
                </div>

                <div className="flex gap-4 items-start p-4 rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700">
                  <div className="p-2 rounded-xl bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">
                    <Info size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white mb-1">Otomasi Nomor Dokumen</h3>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400 leading-relaxed">Selamat tinggal input manual! Nomor SP & Nota kini digenerate otomatis, dengan opsi edit masa transisi.</p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* CTA Button */}
            <div className="p-6 pt-4 flex justify-center" style={{ backgroundColor: bg }}>
              <button 
                onClick={closeReleaseModal}
                className="w-full py-3.5 rounded-xl text-white font-bold text-base shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all outline-none focus:ring-4 focus:ring-blue-500/50"
                style={{ background: 'linear-gradient(135deg, #007AFF 0%, #5856D6 100%)' }}
              >
                Siap, Gas!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Changelog & Upcoming Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px] transition-opacity">
          <div 
            className="w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-3xl shadow-2xl flex flex-col"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
          >
            {/* Modal Header */}
            <div className="flex justify-between items-center p-6 border-b" style={{ borderColor: border }}>
              <div>
                <h2 className="text-xl font-bold" style={{ color: text }}>🚀 Changelog & Roadmap</h2>
                <p className="text-xs mt-1" style={{ color: sub }}>Aktual: v1.3.1-standard - Terakhir diupdate 13 Mar 2026</p>
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
      {/* Developer Notes Modal */}
      {showDevNotes && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px] transition-opacity">
          <div 
            className="w-full max-w-md overflow-hidden rounded-3xl shadow-2xl flex flex-col"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
          >
            <div className="flex justify-between items-center p-6 border-b" style={{ borderColor: border }}>
              <div className="flex items-center gap-3 text-blue-500">
                <Info size={20} />
                <h2 className="text-lg font-bold">Catatan Developer</h2>
              </div>
              <button onClick={() => setShowDevNotes(false)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <X size={20} style={{ color: sub }} />
              </button>
            </div>
            <div className="p-8">
              <p className="text-sm leading-relaxed mb-6" style={{ color: sub }}>
                Mungkin ada beberapa fitur yang belum work atau "ganjel" dalam penggunaannya, bisa dilaporkan via 
                <span className="font-bold text-blue-500 mx-1">Bug / Saran Fitur</span> 
                di sidebar agar segera diperbaiki oleh tim pengembang.
              </p>
              <div className="p-4 rounded-2xl bg-blue-50 text-xs font-medium text-blue-600 flex gap-3 items-start border border-blue-100">
                 <Activity size={16} className="mt-0.5 shrink-0" />
                 <span>Ekspektasi Performa: Latency antar pulau (Singapore) ~500ms - 1s (Normal).</span>
              </div>
            </div>
            <div className="p-4 border-t flex justify-center" style={{ borderColor: border, backgroundColor: bg }}>
              <button 
                onClick={() => setShowDevNotes(false)}
                className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-all"
              >
                Tutup Catatan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}