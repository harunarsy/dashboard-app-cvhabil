import React, { useState, useEffect, useRef } from 'react';
import { invoicesAPI, distributorsAPI } from '../services/api';
import { Plus, Upload, X, ChevronDown, ChevronUp, Trash2, Edit2, Eye, Package } from 'lucide-react';
import * as XLSX from 'xlsx';

// ─── Helpers ────────────────────────────────────────────────────────────────

const parseNum = (v) => {
  if (v === '' || v === null || v === undefined) return 0;
  const s = String(v).replace(/[^0-9.]/g, '');
  return parseFloat(s) || 0;
};

const formatRp = (number, withCents = false) => {
  if (!number && number !== 0) return 'Rp 0';
  const num = parseFloat(number);
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: withCents ? 2 : 0,
    maximumFractionDigits: withCents ? 2 : 0,
  }).format(num);
};

const formatRpInput = (rawNum) => {
  if (!rawNum && rawNum !== 0) return '';
  const n = Math.floor(parseFloat(rawNum));
  if (isNaN(n)) return '';
  return n.toLocaleString('id-ID');
};

// ─── Blank item template ─────────────────────────────────────────────────────
const blankItem = () => ({
  _id: Math.random().toString(36).slice(2),
  product_name: '',
  expired_date: '',
  quantity: '',
  hna: '',
  hna_times_qty: 0,
  disc_percent: '',
  disc_nominal: 0,
  hna_baru: 0,
});

// ─── Blank form template ─────────────────────────────────────────────────────
const blankForm = () => ({
  invoice_number: '',
  purchase_date: '',
  distributor_name: '',
  discount_amount: '',   // DISC total (sum from items)
  disc_cod_ada: false,
  disc_cod_amount: '',
  payment_date: '',
  status: 'Pending',
  // computed — will be set automatically
  total_hna: 0,
  hna_baru: 0,
  hna_final: 0,
  ppn_masukan: 0,
  ppn_pembulatan: 0,
  hna_plus_ppn: 0,
  harga_per_produk: 0,
});

// ─── Calculation engine ──────────────────────────────────────────────────────
const calcItem = (item) => {
  const qty = parseNum(item.quantity);
  const hna = parseNum(item.hna);
  const hna_times_qty = hna * qty;
  const disc_percent = parseNum(item.disc_percent);
  const disc_nominal = hna_times_qty * (disc_percent / 100);
  const hna_baru = hna_times_qty - disc_nominal;
  return { ...item, hna_times_qty, disc_nominal, hna_baru };
};

const calcTotals = (items, form) => {
  const total_hna = items.reduce((s, i) => s + i.hna_times_qty, 0);
  const total_disc = items.reduce((s, i) => s + i.disc_nominal, 0);
  const hna_baru = items.reduce((s, i) => s + i.hna_baru, 0); // HNA setelah disc item

  const disc_cod_amount = form.disc_cod_ada ? parseNum(form.disc_cod_amount) : 0;
  const hna_final = hna_baru - disc_cod_amount;

  // PPN Masukan = HNA Final * (11/12 * 12%) = HNA Final * 11%
  const ppn_masukan = hna_final * (11 / 100);
  const ppn_pembulatan = Math.floor(ppn_masukan);
  const hna_plus_ppn = hna_final + ppn_masukan;

  const totalQty = items.reduce((s, i) => s + parseNum(i.quantity), 0);
  const harga_per_produk = totalQty > 0 ? hna_plus_ppn / totalQty : 0;

  return {
    total_hna,
    discount_amount: total_disc,
    hna_baru,
    hna_final,
    ppn_masukan,
    ppn_pembulatan,
    hna_plus_ppn,
    harga_per_produk,
  };
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function InvoiceList({ isDarkMode, isSidebarOpen }) {
  const [invoices, setInvoices] = useState([]);
  const [filteredInvoices, setFilteredInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [distributors, setDistributors] = useState([]);
  const [showAddDist, setShowAddDist] = useState(false);
  const [newDistName, setNewDistName] = useState('');
  const fileInputRef = useRef(null);
  const [expandedRows, setExpandedRows] = useState({});

  // Filter states
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [searchDist, setSearchDist] = useState('');
  const [searchInv, setSearchInv] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Form state
  const [form, setForm] = useState(blankForm());
  const [items, setItems] = useState([blankItem()]);

  // ── Computed totals ──
  const totals = calcTotals(items, form);

  useEffect(() => { fetchInvoices(); fetchDistributors(); }, []);
  useEffect(() => { applyFilters(); }, [invoices, selectedMonth, searchDist, searchInv, filterStatus, dateFrom, dateTo]);

  const fetchInvoices = async () => {
    try {
      const res = await invoicesAPI.getAll();
      setInvoices(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const fetchDistributors = async () => {
    try {
      const res = await distributorsAPI.getAll();
      setDistributors(res.data);
    } catch (err) { console.error(err); }
  };

  const applyFilters = () => {
    let f = invoices;
    if (selectedMonth !== 'all') {
      f = f.filter(i => {
        const m = new Date(i.purchase_date).toLocaleString('id-ID', { month: 'long', year: 'numeric' });
        return m === selectedMonth;
      });
    }
    if (searchDist) f = f.filter(i => i.distributor_name?.toLowerCase().includes(searchDist.toLowerCase()));
    if (searchInv) f = f.filter(i => i.invoice_number?.toLowerCase().includes(searchInv.toLowerCase()));
    if (filterStatus !== 'all') f = f.filter(i => i.status === filterStatus);
    if (dateFrom) f = f.filter(i => new Date(i.purchase_date) >= new Date(dateFrom));
    if (dateTo) f = f.filter(i => new Date(i.purchase_date) <= new Date(dateTo));
    setFilteredInvoices(f);
  };

  const getUniqueMonths = () => {
    const s = new Set();
    invoices.forEach(i => {
      const m = new Date(i.purchase_date).toLocaleString('id-ID', { month: 'long', year: 'numeric' });
      s.add(m);
    });
    return Array.from(s).sort();
  };

  // ── Item handlers ──
  const updateItem = (idx, field, rawValue) => {
    setItems(prev => {
      const next = [...prev];
      next[idx] = calcItem({ ...next[idx], [field]: rawValue });
      return next;
    });
  };

  const addItem = () => setItems(prev => [...prev, blankItem()]);
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));

  // ── Form handlers ──
  const handleFormChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleAddDistributor = async () => {
    if (!newDistName.trim()) return;
    try {
      const res = await distributorsAPI.add(newDistName.trim());
      const saved = res.data.name || newDistName.trim();
      setDistributors(prev => {
        const exists = prev.some(d => d.name === saved);
        if (exists) return prev;
        return [...prev, { name: saved }].sort((a, b) => a.name.localeCompare(b.name));
      });
      setForm(prev => ({ ...prev, distributor_name: saved }));
      setNewDistName('');
      setShowAddDist(false);
    } catch (err) {
      alert('Error: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleSubmit = async () => {
    if (!form.invoice_number || !form.purchase_date || !form.distributor_name) {
      alert('Lengkapi No Faktur, Tanggal, dan Distributor');
      return;
    }

    const payload = {
      ...form,
      ...totals,
      disc_cod_amount: form.disc_cod_ada ? parseNum(form.disc_cod_amount) : 0,
      items: items.filter(i => i.product_name.trim() !== '').map(i => ({
        product_name: i.product_name,
        expired_date: i.expired_date || null,
        quantity: parseNum(i.quantity),
        hna: parseNum(i.hna),
        unit_price: parseNum(i.hna),
        hna_times_qty: i.hna_times_qty,
        total_price: i.hna_times_qty,
        disc_percent: parseNum(i.disc_percent),
        disc_nominal: i.disc_nominal,
        hna_baru: i.hna_baru,
        margin: 0,
      })),
    };

    try {
      if (editingId) {
        await invoicesAPI.update(editingId, payload);
      } else {
        await invoicesAPI.create(payload);
      }
      fetchInvoices();
      fetchDistributors();
      resetForm();
      setShowModal(false);
    } catch (err) {
      alert('Error: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleEdit = async (inv) => {
    try {
      const res = await invoicesAPI.getById(inv.id);
      const { invoice, items: invItems } = res.data;
      setForm({
        invoice_number: invoice.invoice_number,
        purchase_date: invoice.purchase_date?.split('T')[0] || '',
        distributor_name: invoice.distributor_name,
        discount_amount: invoice.discount_amount || '',
        disc_cod_ada: invoice.disc_cod_ada || false,
        disc_cod_amount: invoice.disc_cod_amount || '',
        payment_date: invoice.payment_date?.split('T')[0] || '',
        status: invoice.status,
        total_hna: invoice.total_hna || 0,
        hna_baru: invoice.hna_baru || 0,
        hna_final: invoice.hna_final || invoice.final_hna || 0,
        ppn_masukan: invoice.ppn_masukan || invoice.ppn_input || 0,
        ppn_pembulatan: invoice.ppn_pembulatan || 0,
        hna_plus_ppn: invoice.hna_plus_ppn || 0,
        harga_per_produk: invoice.harga_per_produk || 0,
      });
      setItems(invItems.length > 0
        ? invItems.map(i => calcItem({
            _id: Math.random().toString(36).slice(2),
            product_name: i.product_name || '',
            expired_date: i.expired_date?.split('T')[0] || '',
            quantity: i.quantity || '',
            hna: i.hna || i.unit_price || '',
            hna_times_qty: i.hna_times_qty || i.total_price || 0,
            disc_percent: i.disc_percent || '',
            disc_nominal: i.disc_nominal || 0,
            hna_baru: i.hna_baru || 0,
          }))
        : [blankItem()]
      );
      setEditingId(inv.id);
      setShowModal(true);
    } catch (err) {
      alert('Error loading invoice');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Hapus invoice ini?')) return;
    try {
      await invoicesAPI.delete(id);
      fetchInvoices();
    } catch (err) { alert('Error deleting'); }
  };

  const resetForm = () => {
    setForm(blankForm());
    setItems([blankItem()]);
    setEditingId(null);
    setShowAddDist(false);
    setNewDistName('');
  };

  const handleExcelImport = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const workbook = XLSX.read(file, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(sheet);
      let imported = 0;
      for (const row of jsonData) {
        try {
          await invoicesAPI.create({
            invoice_number: row['No Faktur'] || row['invoice_number'] || `INV-${Date.now()}`,
            purchase_date: new Date(row['Tanggal Belanja/ Faktur'] || row['purchase_date']).toISOString().split('T')[0],
            distributor_name: (row['Distributor'] || row['distributor_name'] || 'Unknown').trim(),
            total_hna: parseFloat(row['HNA*QTY'] || row['total_hna'] || 0),
            discount_amount: parseFloat(row['DISC'] || row['discount_amount'] || 0),
            ppn_input: parseFloat(row['PPN MASUKAN'] || row['ppn_input'] || 0),
            ppn_masukan: parseFloat(row['PPN MASUKAN'] || row['ppn_input'] || 0),
            final_hna: parseFloat(row['HNA FINAL'] || row['final_hna'] || 0),
            hna_final: parseFloat(row['HNA FINAL'] || row['hna_final'] || 0),
            payment_date: null,
            status: 'Pending',
          });
          imported++;
        } catch (err) { console.warn('Skip row:', row); }
      }
      alert(`✅ Imported ${imported} invoices`);
      fetchInvoices();
      fetchDistributors();
      event.target.value = '';
    } catch (err) {
      alert('Error importing Excel');
    }
  };

  // ── Summary for filtered list ──
  const summaryData = (filteredInvoices.length > 0 ? filteredInvoices : invoices);
  const summaryTotalHna = summaryData.reduce((s, i) => s + parseFloat(i.total_hna || 0), 0);
  const summaryHnaFinal = summaryData.reduce((s, i) => s + parseFloat(i.hna_final || i.final_hna || 0), 0);
  const summaryPpn = summaryData.reduce((s, i) => s + parseFloat(i.ppn_masukan || i.ppn_input || 0), 0);

  // ─── Style helpers ───────────────────────────────────────────────────────────
  const card = {
    backgroundColor: isDarkMode ? '#1C1C1E' : '#FFFFFF',
    border: `1px solid ${isDarkMode ? '#2C2C2E' : '#E5E5EA'}`,
    borderRadius: '12px',
  };
  const txt = { color: isDarkMode ? '#FFFFFF' : '#000000' };
  const muted = { color: '#86868B' };
  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    border: `1px solid ${isDarkMode ? '#3A3A3C' : '#D1D1D6'}`,
    borderRadius: '10px',
    backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7',
    color: isDarkMode ? '#FFF' : '#000',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
  };
  const inputDisabled = {
    ...inputStyle,
    backgroundColor: isDarkMode ? '#1C1C1E' : '#E5E5EA',
    color: isDarkMode ? '#636366' : '#8E8E93',
    cursor: 'not-allowed',
  };
  const labelStyle = {
    display: 'block',
    fontSize: '12px',
    fontWeight: '600',
    marginBottom: '6px',
    color: isDarkMode ? '#EBEBF0' : '#3A3A3C',
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
  };

  if (loading) return (
    <div style={{ padding: '2rem', marginLeft: isSidebarOpen ? '256px' : '80px', ...txt }}>
      Loading...
    </div>
  );

  return (
    <div style={{
      padding: '2rem',
      marginLeft: isSidebarOpen ? '256px' : '80px',
      backgroundColor: isDarkMode ? '#000000' : '#F5F5F7',
      minHeight: '100vh',
      transition: 'margin-left 0.3s',
    }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: '700', margin: '0 0 4px 0', ...txt }}>
          📄 Invoice Management
        </h1>
        <p style={{ margin: 0, fontSize: '14px', ...muted }}>Faktur Pembelian — CV Habil</p>
      </div>

      {/* ── Summary Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Total HNA*QTY', value: formatRp(summaryTotalHna), icon: '💰', color: '#30B0C0' },
          { label: 'Total PPN Masukan', value: formatRp(summaryPpn, true), icon: '📊', color: '#FF9500' },
          { label: 'HNA Final', value: formatRp(summaryHnaFinal), icon: '📈', color: '#34C759' },
          { label: 'Jumlah Faktur', value: `${summaryData.length} faktur`, icon: '📋', color: '#AF52DE' },
        ].map((m, i) => (
          <div key={i} style={{ ...card, padding: '1.25rem' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{m.icon}</div>
            <p style={{ margin: '0 0 4px 0', fontSize: '12px', fontWeight: '600', ...muted }}>{m.label}</p>
            <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: m.color }}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* ── Action Buttons ── */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button onClick={() => { resetForm(); setShowModal(true); }} style={{
          padding: '10px 20px', backgroundColor: '#007AFF', color: 'white',
          border: 'none', borderRadius: '10px', cursor: 'pointer',
          fontWeight: '600', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <Plus size={16} /> Add Invoice
        </button>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleExcelImport} style={{ display: 'none' }} />
        <button onClick={() => fileInputRef.current?.click()} style={{
          padding: '10px 20px', backgroundColor: '#34C759', color: 'white',
          border: 'none', borderRadius: '10px', cursor: 'pointer',
          fontWeight: '600', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <Upload size={16} /> Import Excel
        </button>
      </div>

      {/* ── Filters ── */}
      <div style={{ ...card, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <p style={{ margin: '0 0 12px 0', fontWeight: '600', fontSize: '13px', ...muted }}>🔍 Filter & Pencarian</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
          {/* Month */}
          <div>
            <label style={labelStyle}>Bulan</label>
            <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={inputStyle}>
              <option value="all">Semua Bulan</option>
              {getUniqueMonths().map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Distributor</label>
            <input style={inputStyle} value={searchDist} onChange={e => setSearchDist(e.target.value)} placeholder="Cari..." />
          </div>
          <div>
            <label style={labelStyle}>No Faktur</label>
            <input style={inputStyle} value={searchInv} onChange={e => setSearchInv(e.target.value)} placeholder="Cari..." />
          </div>
          <div>
            <label style={labelStyle}>Status</label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={inputStyle}>
              <option value="all">Semua</option>
              <option value="Pending">Pending</option>
              <option value="Paid">Paid</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Dari Tanggal</label>
            <input type="date" style={inputStyle} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Sampai</label>
            <input type="date" style={inputStyle} value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
        </div>
        <button onClick={() => { setSelectedMonth('all'); setSearchDist(''); setSearchInv(''); setFilterStatus('all'); setDateFrom(''); setDateTo(''); }}
          style={{ marginTop: '12px', padding: '8px 16px', backgroundColor: isDarkMode ? '#2C2C2E' : '#E5E5EA', color: isDarkMode ? '#FFF' : '#000', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
          Hapus Filter
        </button>
      </div>

      {/* ── Invoice Table ── */}
      <div style={{ ...card, overflow: 'hidden' }}>
        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '140px 1fr 110px 130px 130px 130px 100px 110px',
          gap: '0',
          padding: '12px 16px',
          backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7',
          borderBottom: `1px solid ${isDarkMode ? '#3A3A3C' : '#E5E5EA'}`,
        }}>
          {['No Faktur', 'Distributor', 'Tgl Faktur', 'HNA*QTY', 'HNA Final', 'HNA+PPN', 'Status', 'Aksi'].map(h => (
            <div key={h} style={{ fontSize: '11px', fontWeight: '700', ...muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</div>
          ))}
        </div>

        {filteredInvoices.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', ...muted }}>
            {invoices.length === 0 ? 'Belum ada faktur' : 'Tidak ada faktur yang cocok dengan filter'}
          </div>
        ) : (
          filteredInvoices.map(inv => (
            <InvoiceRow
              key={inv.id}
              inv={inv}
              isDarkMode={isDarkMode}
              expanded={!!expandedRows[inv.id]}
              onToggleExpand={() => setExpandedRows(prev => ({ ...prev, [inv.id]: !prev[inv.id] }))}
              onEdit={() => handleEdit(inv)}
              onDelete={() => handleDelete(inv.id)}
              formatRp={formatRp}
            />
          ))
        )}
      </div>

      {/* ── Modal ── */}
      {showModal && (
        <InvoiceModal
          isDarkMode={isDarkMode}
          form={form}
          items={items}
          totals={totals}
          editingId={editingId}
          distributors={distributors}
          showAddDist={showAddDist}
          setShowAddDist={setShowAddDist}
          newDistName={newDistName}
          setNewDistName={setNewDistName}
          handleAddDistributor={handleAddDistributor}
          onFormChange={handleFormChange}
          updateItem={updateItem}
          addItem={addItem}
          removeItem={removeItem}
          onSubmit={handleSubmit}
          onClose={() => { setShowModal(false); resetForm(); }}
          inputStyle={inputStyle}
          inputDisabled={inputDisabled}
          labelStyle={labelStyle}
          formatRpInput={formatRpInput}
          parseNum={parseNum}
          formatRp={formatRp}
        />
      )}
    </div>
  );
}

// ─── Invoice Row ─────────────────────────────────────────────────────────────
function InvoiceRow({ inv, isDarkMode, expanded, onToggleExpand, onEdit, onDelete, formatRp }) {
  const statusColor = inv.status === 'Paid'
    ? { bg: '#D1FAE5', text: '#065F46' }
    : { bg: '#FEF3C7', text: '#92400E' };

  const rowBase = {
    display: 'grid',
    gridTemplateColumns: '140px 1fr 110px 130px 130px 130px 100px 110px',
    padding: '14px 16px',
    borderBottom: `1px solid ${isDarkMode ? '#2C2C2E' : '#F0F0F0'}`,
    alignItems: 'center',
    backgroundColor: isDarkMode ? '#1C1C1E' : '#FFFFFF',
    cursor: 'pointer',
    transition: 'background 0.15s',
  };

  return (
    <>
      <div style={rowBase} onMouseEnter={e => e.currentTarget.style.backgroundColor = isDarkMode ? '#2C2C2E' : '#F9F9F9'}
        onMouseLeave={e => e.currentTarget.style.backgroundColor = isDarkMode ? '#1C1C1E' : '#FFFFFF'}>

        {/* No Faktur */}
        <div>
          <div style={{ fontWeight: '700', fontSize: '13px', color: '#007AFF' }}>{inv.invoice_number}</div>
          {inv.item_count > 0 && (
            <div style={{ fontSize: '11px', color: '#86868B', marginTop: '2px' }}>
              {inv.item_count} produk · {inv.total_qty || 0} qty
            </div>
          )}
        </div>

        {/* Distributor */}
        <div>
          <div style={{ fontWeight: '600', fontSize: '13px', color: isDarkMode ? '#FFF' : '#000' }}>{inv.distributor_name}</div>
          {inv.payment_date && (
            <div style={{ fontSize: '11px', color: '#86868B', marginTop: '2px' }}>
              Bayar: {new Date(inv.payment_date).toLocaleDateString('id-ID')}
            </div>
          )}
        </div>

        {/* Tgl */}
        <div style={{ fontSize: '13px', color: isDarkMode ? '#EBEBF0' : '#3A3A3C' }}>
          {new Date(inv.purchase_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
        </div>

        {/* HNA*QTY */}
        <div style={{ fontSize: '13px', fontWeight: '600', color: isDarkMode ? '#FFF' : '#000' }}>
          {formatRp(inv.total_hna)}
          {inv.discount_amount > 0 && (
            <div style={{ fontSize: '11px', color: '#FF3B30', fontWeight: '400' }}>
              Disc: {formatRp(inv.discount_amount)}
            </div>
          )}
        </div>

        {/* HNA Final */}
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#34C759' }}>
          {formatRp(inv.hna_final || inv.final_hna)}
        </div>

        {/* HNA+PPN */}
        <div>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#007AFF' }}>
            {formatRp(inv.hna_plus_ppn)}
          </div>
          <div style={{ fontSize: '11px', color: '#86868B', marginTop: '2px' }}>
            PPN: {formatRp(inv.ppn_masukan || inv.ppn_input, true)}
          </div>
        </div>

        {/* Status */}
        <div>
          <span style={{
            padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '700',
            backgroundColor: statusColor.bg, color: statusColor.text,
          }}>
            {inv.status}
          </span>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {inv.item_count > 0 && (
            <button onClick={onToggleExpand} title="Lihat produk" style={{
              padding: '6px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7',
              border: 'none', borderRadius: '8px', cursor: 'pointer',
            }}>
              {expanded ? <ChevronUp size={14} color="#86868B" /> : <ChevronDown size={14} color="#86868B" />}
            </button>
          )}
          <button onClick={onEdit} title="Edit" style={{
            padding: '6px 10px', backgroundColor: '#007AFF', color: 'white',
            border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600',
          }}>Edit</button>
          <button onClick={onDelete} title="Hapus" style={{
            padding: '6px', backgroundColor: '#FF3B30', color: 'white',
            border: 'none', borderRadius: '8px', cursor: 'pointer',
          }}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Expanded product rows */}
      {expanded && (
        <ExpandedItems invoiceId={inv.id} isDarkMode={isDarkMode} formatRp={formatRp} />
      )}
    </>
  );
}

// ─── Expanded Items ───────────────────────────────────────────────────────────
function ExpandedItems({ invoiceId, isDarkMode, formatRp }) {
  const [items, setItems] = useState(null);

  useEffect(() => {
    invoicesAPI.getById(invoiceId).then(res => setItems(res.data.items)).catch(() => setItems([]));
  }, [invoiceId]);

  if (items === null) return (
    <div style={{ padding: '12px 24px', backgroundColor: isDarkMode ? '#111' : '#FAFAFA', fontSize: '13px', color: '#86868B' }}>
      Memuat produk...
    </div>
  );
  if (items.length === 0) return null;

  return (
    <div style={{ backgroundColor: isDarkMode ? '#111111' : '#FAFAFA', borderBottom: `1px solid ${isDarkMode ? '#2C2C2E' : '#E5E5EA'}` }}>
      <div style={{ padding: '8px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 100px 100px 80px 110px 100px', gap: '8px', padding: '6px 0', borderBottom: `1px solid ${isDarkMode ? '#2C2C2E' : '#E5E5EA'}`, marginBottom: '4px' }}>
          {['Nama Produk', 'QTY', 'HNA', 'HNA*QTY', 'Disc%', 'Disc Nominal', 'HNA Baru'].map(h => (
            <div key={h} style={{ fontSize: '10px', fontWeight: '700', color: '#86868B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</div>
          ))}
        </div>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 80px 100px 100px 80px 110px 100px', gap: '8px', padding: '6px 0', borderBottom: `1px solid ${isDarkMode ? '#1C1C1E' : '#F0F0F0'}` }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '500', color: isDarkMode ? '#FFF' : '#000' }}>{item.product_name}</div>
              {item.expired_date && <div style={{ fontSize: '11px', color: '#FF9500' }}>Exp: {new Date(item.expired_date).toLocaleDateString('id-ID')}</div>}
            </div>
            <div style={{ fontSize: '13px', color: isDarkMode ? '#FFF' : '#000' }}>{item.quantity}</div>
            <div style={{ fontSize: '13px', color: isDarkMode ? '#FFF' : '#000' }}>{formatRp(item.hna || item.unit_price)}</div>
            <div style={{ fontSize: '13px', color: isDarkMode ? '#FFF' : '#000' }}>{formatRp(item.hna_times_qty || item.total_price)}</div>
            <div style={{ fontSize: '13px', color: '#FF3B30' }}>{item.disc_percent || 0}%</div>
            <div style={{ fontSize: '13px', color: '#FF3B30' }}>{formatRp(item.disc_nominal)}</div>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#34C759' }}>{formatRp(item.hna_baru)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// INVOICE MODAL
// ═══════════════════════════════════════════════════════════════════════════════
function InvoiceModal({
  isDarkMode, form, items, totals, editingId,
  distributors, showAddDist, setShowAddDist, newDistName, setNewDistName, handleAddDistributor,
  onFormChange, updateItem, addItem, removeItem,
  onSubmit, onClose,
  inputStyle, inputDisabled, labelStyle,
  formatRpInput, parseNum, formatRp,
}) {
  const sectionStyle = {
    marginBottom: '1.5rem',
    paddingBottom: '1.5rem',
    borderBottom: `1px solid ${isDarkMode ? '#2C2C2E' : '#E5E5EA'}`,
  };
  const sectionTitle = {
    fontSize: '13px', fontWeight: '700', marginBottom: '12px',
    color: isDarkMode ? '#EBEBF0' : '#1C1C1E',
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
  };
  const row2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' };
  const computed = {
    ...inputDisabled,
    fontWeight: '600',
    color: isDarkMode ? '#30D158' : '#1C7C2A',
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0,
      backgroundColor: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      zIndex: 1000, padding: '2rem 1rem', overflowY: 'auto',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        backgroundColor: isDarkMode ? '#1C1C1E' : '#FFFFFF',
        borderRadius: '16px',
        width: '100%', maxWidth: '780px',
        boxShadow: '0 32px 64px rgba(0,0,0,0.35)',
        overflow: 'hidden',
        marginBottom: '2rem',
      }}>
        {/* Modal Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 24px',
          borderBottom: `1px solid ${isDarkMode ? '#2C2C2E' : '#E5E5EA'}`,
          backgroundColor: isDarkMode ? '#000' : '#F5F5F7',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: isDarkMode ? '#FFF' : '#000' }}>
              {editingId ? '✏️ Edit Faktur' : '➕ Buat Faktur Baru'}
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#86868B' }}>Faktur Pembelian</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px' }}>
            <X size={20} color="#86868B" />
          </button>
        </div>

        <div style={{ padding: '24px' }}>

          {/* ── Section 1: Info Faktur ── */}
          <div style={sectionStyle}>
            <p style={sectionTitle}>📦 Informasi Faktur</p>
            <div style={row2}>
              {/* No Faktur */}
              <div>
                <label style={labelStyle}>No Faktur</label>
                <input style={inputStyle} value={form.invoice_number}
                  onChange={e => onFormChange('invoice_number', e.target.value)}
                  placeholder="Contoh: 1260300020" />
              </div>
              {/* Distributor */}
              <div>
                <label style={labelStyle}>Distributor</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select value={form.distributor_name}
                    onChange={e => onFormChange('distributor_name', e.target.value)}
                    style={{ ...inputStyle, flex: 1 }}>
                    <option value="">-- Pilih Distributor --</option>
                    {distributors.map((d, i) => <option key={i} value={d.name}>{d.name}</option>)}
                  </select>
                  <button type="button" onClick={() => setShowAddDist(!showAddDist)} style={{
                    padding: '10px 14px', backgroundColor: '#34C759', color: 'white',
                    border: 'none', borderRadius: '10px', cursor: 'pointer',
                    fontSize: '13px', fontWeight: '700', whiteSpace: 'nowrap',
                  }}>+ Add</button>
                </div>
                {showAddDist && (
                  <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                    <input style={{ ...inputStyle, flex: 1 }} value={newDistName}
                      onChange={e => setNewDistName(e.target.value)}
                      placeholder="Nama distributor baru..."
                      onKeyDown={e => e.key === 'Enter' && handleAddDistributor()} />
                    <button type="button" onClick={handleAddDistributor} style={{
                      padding: '10px 14px', backgroundColor: '#007AFF', color: 'white',
                      border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '600',
                    }}>Simpan</button>
                  </div>
                )}
              </div>
            </div>
            <div style={{ ...row2, marginTop: '12px' }}>
              <div>
                <label style={labelStyle}>Tanggal Belanja / Faktur</label>
                <input type="date" style={inputStyle} value={form.purchase_date}
                  onChange={e => onFormChange('purchase_date', e.target.value)} />
              </div>
            </div>
          </div>

          {/* ── Section 2: Daftar Produk ── */}
          <div style={sectionStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <p style={{ ...sectionTitle, margin: 0 }}>📦 Nama Produk</p>
              <button type="button" onClick={addItem} style={{
                padding: '6px 14px', backgroundColor: '#007AFF', color: 'white',
                border: 'none', borderRadius: '8px', cursor: 'pointer',
                fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px',
              }}>
                <Plus size={13} /> Tambah Produk
              </button>
            </div>

            {/* Item header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '2fr 100px 100px 110px 80px 110px 110px 36px',
              gap: '6px', marginBottom: '6px', padding: '0 4px',
            }}>
              {['Nama Produk', 'Exp. Date', 'QTY', 'HNA', 'Disc%', 'HNA*QTY', 'HNA Baru', ''].map(h => (
                <div key={h} style={{ fontSize: '10px', fontWeight: '700', color: '#86868B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</div>
              ))}
            </div>

            {items.map((item, idx) => (
              <div key={item._id} style={{
                display: 'grid',
                gridTemplateColumns: '2fr 100px 100px 110px 80px 110px 110px 36px',
                gap: '6px', marginBottom: '6px', alignItems: 'center',
              }}>
                <input style={inputStyle} value={item.product_name}
                  onChange={e => updateItem(idx, 'product_name', e.target.value)}
                  placeholder="Nama produk" />
                <input type="date" style={inputStyle} value={item.expired_date}
                  onChange={e => updateItem(idx, 'expired_date', e.target.value)} />
                <input style={inputStyle} value={item.quantity}
                  onChange={e => updateItem(idx, 'quantity', e.target.value)}
                  placeholder="0" type="number" min="0" />
                {/* HNA input — format Rupiah */}
                <input style={inputStyle}
                  value={item.hna === '' ? '' : formatRpInput(parseNum(item.hna))}
                  onChange={e => {
                    const raw = e.target.value.replace(/\./g, '').replace(/[^0-9]/g, '');
                    updateItem(idx, 'hna', raw);
                  }}
                  placeholder="Rp 0" />
                {/* Disc % */}
                <input style={inputStyle} value={item.disc_percent}
                  onChange={e => updateItem(idx, 'disc_percent', e.target.value)}
                  placeholder="0" type="number" min="0" max="100" step="0.01" />
                {/* HNA*QTY — computed */}
                <input style={{ ...computed }} value={formatRpInput(item.hna_times_qty)} readOnly />
                {/* HNA Baru — computed */}
                <input style={{ ...computed }} value={formatRpInput(item.hna_baru)} readOnly />
                {/* Remove */}
                {items.length > 1 && (
                  <button type="button" onClick={() => removeItem(idx)} style={{
                    padding: '8px', backgroundColor: '#FF3B30', color: 'white',
                    border: 'none', borderRadius: '8px', cursor: 'pointer',
                  }}>
                    <X size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* ── Section 3: Kalkulasi Finansial ── */}
          <div style={sectionStyle}>
            <p style={sectionTitle}>💰 Kalkulasi Finansial</p>
            <div style={row2}>
              {/* HNA*QTY Total */}
              <div>
                <label style={labelStyle}>HNA*QTY Total</label>
                <input style={computed} value={formatRpInput(totals.total_hna)} readOnly />
              </div>
              {/* DISC */}
              <div>
                <label style={labelStyle}>DISC (Total dari produk)</label>
                <input style={computed} value={formatRpInput(totals.discount_amount)} readOnly />
              </div>
            </div>
            <div style={{ ...row2, marginTop: '12px' }}>
              {/* HNA Baru (HNA-DISC) */}
              <div>
                <label style={labelStyle}>HNA Baru (HNA−DISC)</label>
                <input style={computed} value={formatRpInput(totals.hna_baru)} readOnly />
              </div>
              {/* Disc COD */}
              <div>
                <label style={labelStyle}>Disc COD</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <select value={form.disc_cod_ada ? 'ada' : 'tidak'}
                    onChange={e => onFormChange('disc_cod_ada', e.target.value === 'ada')}
                    style={{ ...inputStyle, width: '110px', flex: 'none' }}>
                    <option value="tidak">Tidak Ada</option>
                    <option value="ada">Ada</option>
                  </select>
                  <input
                    style={form.disc_cod_ada ? inputStyle : inputDisabled}
                    disabled={!form.disc_cod_ada}
                    value={form.disc_cod_ada ? (form.disc_cod_amount === '' ? '' : formatRpInput(parseNum(form.disc_cod_amount))) : '—'}
                    onChange={e => {
                      const raw = e.target.value.replace(/\./g, '').replace(/[^0-9]/g, '');
                      onFormChange('disc_cod_amount', raw);
                    }}
                    placeholder="Rp 0"
                  />
                </div>
              </div>
            </div>
            <div style={{ ...row2, marginTop: '12px' }}>
              {/* HNA Final */}
              <div>
                <label style={labelStyle}>HNA Final (HNA Baru−Disc COD)</label>
                <input style={computed} value={formatRpInput(totals.hna_final)} readOnly />
              </div>
              {/* PPN Masukan */}
              <div>
                <label style={labelStyle}>PPN Masukan (HNA Final × 11/12 × 12%)</label>
                <input style={{ ...computed, color: '#FF9500' }}
                  value={new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totals.ppn_masukan)}
                  readOnly />
              </div>
            </div>
            <div style={{ ...row2, marginTop: '12px' }}>
              {/* PPN Pembulatan */}
              <div>
                <label style={labelStyle}>PPN Pembulatan (INT PPN Masukan)</label>
                <input style={{ ...inputDisabled, color: isDarkMode ? '#8E8E93' : '#6E6E73' }}
                  value={formatRpInput(totals.ppn_pembulatan)} readOnly />
              </div>
              {/* HNA+PPN */}
              <div>
                <label style={labelStyle}>HNA + PPN Masukan</label>
                <input style={{ ...computed, fontSize: '15px', fontWeight: '700', color: '#007AFF' }}
                  value={formatRpInput(totals.hna_plus_ppn)} readOnly />
              </div>
            </div>
            {/* Harga per Produk / HPP */}
            <div style={{ marginTop: '12px' }}>
              <label style={labelStyle}>Harga per Produk / HPP (HNA+PPN ÷ Total QTY)</label>
              <input style={{ ...computed, color: '#AF52DE' }} value={formatRpInput(totals.harga_per_produk)} readOnly />
            </div>
          </div>

          {/* ── Section 4: Pembayaran ── */}
          <div style={{ marginBottom: '1.5rem' }}>
            <p style={sectionTitle}>📅 Pembayaran</p>
            <div style={row2}>
              <div>
                <label style={labelStyle}>Tanggal Pembayaran Faktur</label>
                <input type="date" style={inputStyle} value={form.payment_date}
                  onChange={e => onFormChange('payment_date', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Status</label>
                <select value={form.status} onChange={e => onFormChange('status', e.target.value)} style={inputStyle}>
                  <option value="Pending">Pending</option>
                  <option value="Paid">Paid</option>
                </select>
              </div>
            </div>
          </div>

          {/* ── Submit Buttons ── */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button type="button" onClick={onSubmit} style={{
              flex: 1, padding: '14px',
              backgroundColor: '#007AFF', color: 'white',
              border: 'none', borderRadius: '12px', cursor: 'pointer',
              fontSize: '15px', fontWeight: '700',
            }}>
              {editingId ? '💾 Update Faktur' : '✅ Simpan Faktur'}
            </button>
            <button type="button" onClick={onClose} style={{
              flex: 1, padding: '14px',
              backgroundColor: isDarkMode ? '#2C2C2E' : '#E5E5EA',
              color: isDarkMode ? '#FFF' : '#000',
              border: 'none', borderRadius: '12px', cursor: 'pointer',
              fontSize: '15px', fontWeight: '600',
            }}>
              Batal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
