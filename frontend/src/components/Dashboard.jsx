import React from 'react';

const changelog = [
  {
    version: 'v0.6.3', date: '11 Mar 2026', status: 'latest',
    changes: [
      { type: 'fix', text: 'ESLint warnings bersih: unused imports & missing dependencies diperbaiki' },
      { type: 'fix', text: 'Database branch isolation: otomatis deteksi branch git & load .env.dev di dev branch' },
      { type: 'fix', text: 'Stabilitas koneksi: network access via IP 192.168.3.4 & port 5002 sinkron' },
      { type: 'new', text: 'Clean Repo: hapus ~10MB file sampah, build lama, dan CRA boilerplate' },
    ]
  },
  {
    version: 'v0.6.2', date: '11 Mar 2026', status: 'stable',
    changes: [
      { type: 'fix', text: 'Bug tanggal: restore parseLocalDate/formatLocalDate + TO_CHAR di backend — tidak lagi shift +1 hari' },
      { type: 'fix', text: 'Tombol rename distributor & produk di dropdown (pencil icon) yang hilang di v0.6.1' },
      { type: 'fix', text: 'Rekap per distributor selalu tampil semua, 0 faktur / Rp 0 kalau kosong di bulan tsb' },
      { type: 'fix', text: 'Universal search sekarang include nama produk' },
      { type: 'fix', text: 'Tanggal dibayar muncul di row kolom Status kalau sudah Paid' },
      { type: 'fix', text: 'Field tanggal bayar disabled kalau Belum Bayar, max hari ini, otomatis clear kalau status diubah' },
      { type: 'fix', text: 'Jatuh tempo dipindah ke bawah kolom Status — lebih rapi dan kontekstual' },
      { type: 'new', text: 'Warna unik per distributor di rekap stack & row tabel — mudah dibaca sekilas' },
      { type: 'new', text: 'Urutan kolom tabel: Tgl Faktur → No Faktur → Distributor → dst' },
      { type: 'new', text: 'Badge Jatuh Tempo sejajar toolbar Add Invoice & Trash — "Semua OK" kalau tidak ada masalah' },
      { type: 'new', text: 'Riwayat Perubahan: timeline vertikal, tabel before/after hanya field yang berubah' },
      { type: 'new', text: 'Disc COD didistribusikan per produk proporsional — tampil di modal & expanded row' },
    ]
  },
  {
    version: 'v0.6.1', date: '11 Mar 2026', status: 'stable',
    changes: [
      { type: 'fix', text: 'Disc COD sekarang bisa input % atau nominal langsung — hasil langsung muncul sebagai nominal' },
      { type: 'fix', text: 'Validasi form: minimal 1 produk, QTY & HNA harus > 0, jatuh tempo tidak boleh sebelum tgl faktur' },
      { type: 'fix', text: 'Popup sukses (toast hijau) muncul setelah simpan/update/delete/restore faktur' },
      { type: 'new', text: 'Sorting kolom tabel: klik header No Faktur, Distributor, Tgl, HNA, Status, dll' },
      { type: 'new', text: 'Pagination dengan filter 5 / 10 / 25 / 50 per halaman' },
      { type: 'new', text: 'Rekap per Distributor tampil otomatis di bawah summary cards' },
      { type: 'new', text: 'Riwayat perubahan faktur (audit log): CREATE, UPDATE, DELETE, RESTORE' },
      { type: 'removed', text: 'Import Excel dihapus sementara (belum stabil untuk migrasi data)' },
      { type: 'removed', text: 'Dashboard diganti menjadi halaman Changelog & Upcoming ini' },
    ]
  },
  {
    version: 'v0.5.2', date: '11 Mar 2026', status: 'stable',
    changes: [
      { type: 'fix', text: 'Fix root cause data invoice tertimpa diam-diam saat nomor duplikat' },
      { type: 'new', text: 'Dialog konfirmasi duplikat: Edit existing, Timpa, atau Batal ganti nomor' },
      { type: 'new', text: 'Draft autosave debounce — save 1.5 detik setelah setiap perubahan input' },
    ]
  },
  {
    version: 'v0.5.1', date: '11 Mar 2026', status: 'stable',
    changes: [
      { type: 'new', text: 'Universal search bar + collapsible advanced filters dengan indikator aktif' },
      { type: 'new', text: 'Due date / jatuh tempo: badge merah/orange/kuning, alert counter di header, auto-sort' },
      { type: 'new', text: 'Trash & soft-delete: faktur ke trash dulu, bisa restore atau hapus permanen' },
      { type: 'new', text: 'HNA per Item di form dan expanded view' },
      { type: 'new', text: 'HPP/item tampil di list faktur' },
    ]
  },
  {
    version: 'v0.5.0', date: '11 Mar 2026', status: 'stable',
    changes: [
      { type: 'new', text: 'MasterSelect: dropdown custom dengan search, tambah inline, delete double-confirm' },
      { type: 'new', text: 'Products master database (products_master table)' },
      { type: 'new', text: 'Delete distributor dari dropdown' },
    ]
  },
  {
    version: 'v0.4.0', date: '11 Mar 2026', status: 'stable',
    changes: [
      { type: 'new', text: 'Form faktur didesain ulang: per-item HNA, QTY, Disc%, HNA Baru — semua auto-kalkulasi' },
      { type: 'new', text: 'PPN Masukan = HNA Final × 11%, PPN Pembulatan = INT(PPN), HPP per produk' },
      { type: 'new', text: 'Disc COD dengan toggle Ada/Tidak Ada' },
      { type: 'new', text: 'Expired Date per produk' },
    ]
  },
  {
    version: 'v0.3.0', date: '11 Mar 2026', status: 'stable',
    changes: [
      { type: 'new', text: 'Invoice Management System (CRUD lengkap)' },
      { type: 'new', text: 'Distributor dropdown + tambah inline' },
      { type: 'new', text: 'Rupiah currency input formatter' },
      { type: 'new', text: 'Filter faktur: bulan, distributor, status, date range' },
    ]
  },
];

const upcoming = [
  { priority: 'high', title: 'Export PDF / Excel', desc: 'Export faktur individual atau rekap bulanan ke PDF & Excel untuk laporan dan arsip' },
  { priority: 'high', title: 'Rekap Keuangan Bulanan', desc: 'Summary total pengeluaran per bulan, per distributor, trend grafik' },
  { priority: 'medium', title: 'Password Hashing', desc: 'Keamanan login dengan bcrypt — saat ini masih plaintext (aman karena in-house)' },
  { priority: 'medium', title: 'Halaman Orders & Products', desc: 'Manajemen pesanan dan stok produk yang terintegrasi dengan data invoice' },
  { priority: 'medium', title: 'Halaman Finance', desc: 'Laporan keuangan: hutang, piutang, rekap PPN' },
  { priority: 'low', title: 'Notifikasi Jatuh Tempo', desc: 'Reminder otomatis via WhatsApp/email saat faktur mendekati jatuh tempo' },
  { priority: 'low', title: 'Multi-user & Role', desc: 'Tambah user dengan role berbeda: admin, finance, viewer' },
  { priority: 'low', title: 'Barcode / QR Scanner', desc: 'Scan produk saat input faktur menggunakan kamera atau scanner' },
];

export default function Dashboard({ isDarkMode, isSidebarOpen }) {
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
  const statusConfig = {
    latest: { label: 'Latest',  color: '#34C759', bg: '#34C75918' },
    stable: { label: 'Stable',  color: '#007AFF', bg: '#007AFF18' },
  };

  return (
    <div style={{ padding: '2rem', marginLeft: isSidebarOpen ? '256px' : '80px', backgroundColor: bg, minHeight: '100vh', transition: 'margin-left 0.3s' }}>

      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: '700', margin: '0 0 4px', color: text }}>📋 Changelog & Roadmap</h1>
        <p style={{ margin: 0, fontSize: '14px', color: sub }}>Riwayat pembaruan dan fitur yang akan datang — CV Habil Dashboard</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start' }}>

        {/* Changelog */}
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: '700', margin: '0 0 1rem', color: text, display: 'flex', alignItems: 'center', gap: '8px' }}>
            🕐 Release History
          </h2>
          {changelog.map((release, ri) => (
            <div key={ri} style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '12px', padding: '16px 18px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '16px', fontWeight: '700', color: text }}>{release.version}</span>
                  <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '6px',
                    backgroundColor: statusConfig[release.status].bg, color: statusConfig[release.status].color }}>
                    {statusConfig[release.status].label}
                  </span>
                </div>
                <span style={{ fontSize: '12px', color: sub }}>{release.date}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {release.changes.map((c, ci) => {
                  const cfg = typeConfig[c.type];
                  return (
                    <div key={ci} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '4px', backgroundColor: cfg.bg, color: cfg.color, flexShrink: 0, marginTop: '1px' }}>
                        {cfg.label}
                      </span>
                      <span style={{ fontSize: '13px', color: isDarkMode ? '#EBEBF0' : '#3A3A3C', lineHeight: '1.4' }}>{c.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Upcoming */}
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: '700', margin: '0 0 1rem', color: text, display: 'flex', alignItems: 'center', gap: '8px' }}>
            🚀 Upcoming Features
          </h2>
          {upcoming.map((item, i) => {
            const cfg = priorityConfig[item.priority];
            return (
              <div key={i} style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '12px', padding: '14px 18px', marginBottom: '10px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: cfg.color, marginTop: '6px', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '14px', fontWeight: '600', color: text }}>{item.title}</span>
                    <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 7px', borderRadius: '6px', backgroundColor: cfg.bg, color: cfg.color }}>
                      {cfg.label}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '12px', color: sub, lineHeight: '1.5' }}>{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}