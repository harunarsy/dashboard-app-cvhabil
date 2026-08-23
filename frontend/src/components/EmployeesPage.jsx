// Karyawan (v1.64.0) — master karyawan + catatan pembayaran gaji (harian/bulanan) per orang,
// dipindah dari sheet "GAJI KARYAWAN" Excel. Khusus Direktur (route backend roleGuard direktur).
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { ledgerAPI } from '../services/api';
import Breadcrumb from './common/Breadcrumb';
import ToastNotice from './common/ToastNotice';
import { UI_MOTION, uiTransition } from '../constants/ui';

const fmtRp = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);
const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function EmployeesPage({ isDarkMode, isSidebarOpen, isMobile }) {
  const cardBg = isDarkMode ? 'rgba(28,28,30,0.7)' : 'rgba(255,255,255,0.7)';
  const border = isDarkMode ? 'var(--color-surface-raised)' : 'var(--color-border)';
  const text = isDarkMode ? '#FFF' : '#000';
  const sub = 'var(--color-text-subtle)';
  const inputStyle = { padding: '9px 11px', border: `1px solid ${border}`, borderRadius: '10px', backgroundColor: isDarkMode ? 'var(--color-surface-raised)' : 'var(--color-bg)', color: text, fontSize: '13px', outline: 'none', boxSizing: 'border-box' };

  const [employees, setEmployees] = useState([]);
  const [salaries, setSalaries] = useState([]);
  const [month, setMonth] = useState(thisMonth());
  const [toast, setToast] = useState('');
  const [showEmp, setShowEmp] = useState(false);
  const [empForm, setEmpForm] = useState({ name: '', role: 'Karyawan', daily_wage: '' });
  const [payForm, setPayForm] = useState({ employee_id: '', pay_date: new Date().toISOString().split('T')[0], amount: '', note: '' });
  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), UI_MOTION.duration.toastSuccess); };

  const load = useCallback(() => {
    ledgerAPI.getEmployees().then(({ data }) => setEmployees(Array.isArray(data) ? data : [])).catch(() => {});
    ledgerAPI.getSalaries(month).then(({ data }) => setSalaries(Array.isArray(data) ? data : [])).catch(() => {});
  }, [month]);
  useEffect(() => { load(); }, [load]);

  const saveEmp = async () => {
    if (!empForm.name.trim()) return flash('Nama wajib');
    try { await ledgerAPI.saveEmployee({ ...empForm, daily_wage: parseFloat(empForm.daily_wage) || 0 }); setShowEmp(false); setEmpForm({ name: '', role: 'Karyawan', daily_wage: '' }); flash('Karyawan tersimpan'); load(); }
    catch (e) { flash(e.response?.data?.error || e.message); }
  };
  const savePay = async () => {
    if (!payForm.employee_id || !payForm.amount) return flash('Pilih karyawan & nominal');
    try { await ledgerAPI.saveSalary(payForm); setPayForm((f) => ({ ...f, amount: '', note: '' })); flash('Gaji tercatat'); load(); }
    catch (e) { flash(e.response?.data?.error || e.message); }
  };

  const monthTotal = salaries.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const activeEmp = employees.filter((e) => e.active);

  return (
    <div className="ui-motion-page" style={{ padding: isMobile ? '1rem' : '2rem', paddingTop: isMobile ? '4rem' : '2rem', backgroundColor: 'transparent', minHeight: '100vh', transition: uiTransition('margin-left', UI_MOTION.duration.page, UI_MOTION.easing.standard) }}>
      <Breadcrumb title="Karyawan" isMobile={isMobile} isDarkMode={isDarkMode} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, margin: 0, color: text }}>👥 Karyawan</h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: sub }}>{activeEmp.length} aktif · gaji {month}: <b style={{ color: text }}>{fmtRp(monthTotal)}</b></p>
        </div>
        <button onClick={() => setShowEmp(true)} className="ui-motion-button ui-focus-ring" style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '10px 18px', backgroundColor: 'var(--color-action-hover)', color: '#FFF', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}><Plus size={18} /> Karyawan</button>
      </div>

      {/* kartu karyawan */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
        {activeEmp.map((e) => (
          <div key={e.id} className="ui-motion-card" style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: 14 }}>
            <div style={{ fontWeight: 700, color: text, fontSize: 15 }}>{e.name}</div>
            <div style={{ fontSize: 11, color: sub }}>{e.role || 'Karyawan'}{parseFloat(e.daily_wage) > 0 ? ` · ${fmtRp(e.daily_wage)}/hari` : ''}</div>
            <div style={{ fontSize: 12, color: sub, marginTop: 8 }}>Total dibayar</div>
            <div style={{ fontWeight: 800, color: 'var(--color-action)', fontSize: 16 }}>{fmtRp(e.total_paid)}</div>
            {e.last_paid && <div style={{ fontSize: 10, color: sub }}>terakhir {new Date(e.last_paid).toLocaleDateString('id-ID')}</div>}
          </div>
        ))}
      </div>

      {/* form catat gaji */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14, padding: 12, borderRadius: 12, backgroundColor: cardBg, border: `1px solid ${border}` }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: text }}>Catat gaji:</span>
        <select value={payForm.employee_id} onChange={(e) => setPayForm((f) => ({ ...f, employee_id: e.target.value }))} style={inputStyle}>
          <option value="">— pilih —</option>
          {activeEmp.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <input type="date" value={payForm.pay_date} onChange={(e) => setPayForm((f) => ({ ...f, pay_date: e.target.value }))} style={inputStyle} />
        <input type="number" placeholder="Nominal" value={payForm.amount} onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))} style={{ ...inputStyle, width: 120 }} />
        <input placeholder="Catatan" value={payForm.note} onChange={(e) => setPayForm((f) => ({ ...f, note: e.target.value }))} style={{ ...inputStyle, minWidth: 140 }} />
        <button onClick={savePay} className="ui-motion-button ui-focus-ring" style={{ padding: '9px 16px', border: 'none', borderRadius: 10, backgroundColor: 'var(--color-action)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Simpan</button>
        <span style={{ flex: 1 }} />
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={inputStyle} />
      </div>

      {/* riwayat gaji bulan */}
      <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: 12, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
          <thead><tr style={{ backgroundColor: isDarkMode ? 'var(--color-surface-elevated)' : 'var(--color-bg)' }}>
            {['Tanggal', 'Nama', 'Nominal', 'Status', 'Catatan', ''].map((h) => <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: sub, fontSize: 11, textTransform: 'uppercase', borderBottom: `1px solid ${border}` }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {salaries.map((r) => (
              <tr key={r.id} style={{ borderBottom: `1px solid ${border}` }}>
                <td style={{ padding: '8px 12px', color: text, whiteSpace: 'nowrap' }}>{new Date(r.pay_date).toLocaleDateString('id-ID')}</td>
                <td style={{ padding: '8px 12px', fontWeight: 700, color: text }}>{r.employee_name}</td>
                <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--color-action)' }}>{fmtRp(r.amount)}</td>
                <td style={{ padding: '8px 12px', color: /sudah/i.test(r.status || '') ? 'var(--color-success)' : '#F59E0B', fontWeight: 600, fontSize: 12 }}>{r.status}</td>
                <td style={{ padding: '8px 12px', color: sub }}>{r.note}</td>
                <td style={{ padding: '8px 6px' }}><button onClick={async () => { await ledgerAPI.removeSalary(r.id); load(); }} aria-label="Hapus" className="ui-focus-ring" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><Trash2 size={13} color="var(--color-danger)" /></button></td>
              </tr>
            ))}
            {!salaries.length && <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: sub }}>Belum ada pembayaran gaji di bulan ini.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* modal tambah karyawan */}
      {showEmp && (
        <div onClick={() => setShowEmp(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} className="ui-motion-modal" style={{ backgroundColor: isDarkMode ? '#1c1c1e' : '#fff', borderRadius: 16, width: '100%', maxWidth: 400, overflow: 'hidden', boxShadow: '0 32px 64px rgba(0,0,0,0.35)' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: text }}>➕ Karyawan</h3>
              <button onClick={() => setShowEmp(false)} aria-label="Tutup" className="ui-focus-ring" style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color={sub} /></button>
            </div>
            <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 11 }}>
              <input value={empForm.name} onChange={(e) => setEmpForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nama" style={inputStyle} />
              <select value={empForm.role} onChange={(e) => setEmpForm((f) => ({ ...f, role: e.target.value }))} style={inputStyle}>
                {['Karyawan', 'Direktur', 'Komisaris'].map((r) => <option key={r}>{r}</option>)}
              </select>
              <input type="number" value={empForm.daily_wage} onChange={(e) => setEmpForm((f) => ({ ...f, daily_wage: e.target.value }))} placeholder="Upah harian (Rp)" style={inputStyle} />
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={saveEmp} className="ui-motion-button ui-focus-ring" style={{ flex: 1, padding: 12, backgroundColor: 'var(--color-action-hover)', color: '#FFF', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>Simpan</button>
                <button onClick={() => setShowEmp(false)} className="ui-focus-ring" style={{ flex: 1, padding: 12, backgroundColor: isDarkMode ? 'var(--color-surface-raised)' : 'var(--color-bg)', color: text, border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Batal</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <ToastNotice message={toast} type="success" isMobile={isMobile} />}
    </div>
  );
}
