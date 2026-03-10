import React, { useState, useEffect, useRef } from 'react';
import { invoicesAPI, distributorsAPI } from '../services/api';
import { Edit2, Trash2, Plus, Upload, X, ChevronDown } from 'lucide-react';
import * as XLSX from 'xlsx';

// Format Rupiah helper
const formatRupiah = (number) => {
  if (!number) return 'Rp 0,00';
  const num = parseFloat(number);
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
};

export default function InvoiceList({ isDarkMode, isSidebarOpen }) {
  const [invoices, setInvoices] = useState([]);
  const [filteredInvoices, setFilteredInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showAddDistributor, setShowAddDistributor] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [distributors, setDistributors] = useState([]);
  const [newDistributorName, setNewDistributorName] = useState('');
  const fileInputRef = useRef(null);

  // Filter states
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [searchDistributor, setSearchDistributor] = useState('');
  const [searchInvoiceNum, setSearchInvoiceNum] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [formData, setFormData] = useState({
    invoice_number: '',
    purchase_date: '',
    distributor_name: '',
    total_hna: '',
    discount_amount: '',
    ppn_input: '',
    final_hna: '',
    payment_date: '',
    status: 'Pending'
  });

  useEffect(() => {
    fetchInvoices();
    fetchDistributors();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [invoices, selectedMonth, searchDistributor, searchInvoiceNum, filterStatus, dateFrom, dateTo]);

  const fetchInvoices = async () => {
    try {
      const response = await invoicesAPI.getAll();
      setInvoices(response.data);
      setLoading(false);
    } catch (err) {
      console.error('Error:', err);
      setLoading(false);
    }
  };

  const fetchDistributors = async () => {
    try {
      const response = await distributorsAPI.getAll();
      setDistributors(response.data);
    } catch (err) {
      console.error('Error fetching distributors:', err);
    }
  };

  const applyFilters = () => {
    let filtered = invoices;

    if (selectedMonth !== 'all') {
      filtered = filtered.filter(inv => {
        const invMonth = new Date(inv.purchase_date).toLocaleString('id-ID', { month: 'long', year: 'numeric' });
        return invMonth === selectedMonth;
      });
    }

    if (searchDistributor) {
      filtered = filtered.filter(inv =>
        inv.distributor_name.toLowerCase().includes(searchDistributor.toLowerCase())
      );
    }

    if (searchInvoiceNum) {
      filtered = filtered.filter(inv =>
        inv.invoice_number.toLowerCase().includes(searchInvoiceNum.toLowerCase())
      );
    }

    if (filterStatus !== 'all') {
      filtered = filtered.filter(inv => inv.status === filterStatus);
    }

    if (dateFrom) {
      filtered = filtered.filter(inv => new Date(inv.purchase_date) >= new Date(dateFrom));
    }
    if (dateTo) {
      filtered = filtered.filter(inv => new Date(inv.purchase_date) <= new Date(dateTo));
    }

    setFilteredInvoices(filtered);
  };

  const calculateMetrics = () => {
    const dataToCalculate = filteredInvoices.length > 0 ? filteredInvoices : invoices;
    const totalHna = dataToCalculate.reduce((sum, inv) => sum + parseFloat(inv.total_hna || 0), 0);
    const totalPpn = dataToCalculate.reduce((sum, inv) => sum + parseFloat(inv.ppn_input || 0), 0);
    const totalFinal = dataToCalculate.reduce((sum, inv) => sum + parseFloat(inv.final_hna || 0), 0);
    const margin = totalHna - totalFinal;

    return { totalHna, totalPpn, margin, count: dataToCalculate.length };
  };

  const getUniqueMonths = () => {
    const months = new Set();
    invoices.forEach(inv => {
      const month = new Date(inv.purchase_date).toLocaleString('id-ID', { month: 'long', year: 'numeric' });
      months.add(month);
    });
    return Array.from(months).sort();
  };

  const handleInputChange = (e) => {
  const { name, value } = e.target;
  
  if (['total_hna', 'discount_amount', 'ppn_input', 'final_hna'].includes(name)) {
    // Hanya simpan angka saja (numeric)
    const numericValue = value.replace(/[^\d]/g, '');
    setFormData(prev => ({
      ...prev,
      [name]: numericValue
    }));
  } else {
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  }
};

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      if (editingId) {
        await invoicesAPI.update(editingId, formData);
      } else {
        await invoicesAPI.create(formData);
      }
      
      fetchInvoices();
      fetchDistributors();
      resetForm();
      setShowModal(false);
    } catch (err) {
      console.error('Error:', err);
      alert('Error saving invoice');
    }
  };

  const handleEdit = (invoice) => {
    setFormData({
      invoice_number: invoice.invoice_number,
      purchase_date: invoice.purchase_date.split('T')[0],
      distributor_name: invoice.distributor_name,
      total_hna: invoice.total_hna,
      discount_amount: invoice.discount_amount,
      ppn_input: invoice.ppn_input,
      final_hna: invoice.final_hna,
      payment_date: invoice.payment_date ? invoice.payment_date.split('T')[0] : '',
      status: invoice.status
    });
    setEditingId(invoice.id);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete invoice?')) {
      try {
        await invoicesAPI.delete(id);
        fetchInvoices();
      } catch (err) {
        alert('Error deleting');
      }
    }
  };

  const handleAddDistributor = async () => {
    if (!newDistributorName.trim()) return;
    try {
      await distributorsAPI.add(newDistributorName);
      setFormData(prev => ({ ...prev, distributor_name: newDistributorName }));
      setNewDistributorName('');
      setShowAddDistributor(false);
      fetchDistributors();
    } catch (err) {
      alert('Error adding distributor');
    }
  };

  const handleExcelImport = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const workbook = XLSX.read(file, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet);

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
            final_hna: parseFloat(row['HNA FINAL\n(HNA-DICS)'] || row['HNA FINAL'] || row['final_hna'] || 0),
            payment_date: null,
            status: 'Pending'
          });
          imported++;
        } catch (err) {
          console.warn('Skip:', row);
        }
      }

      alert(`✅ Imported ${imported} invoices`);
      fetchInvoices();
      fetchDistributors();
      event.target.value = '';
    } catch (err) {
      console.error('Error:', err);
      alert('Error importing Excel');
    }
  };

  const resetForm = () => {
    setFormData({
      invoice_number: '',
      purchase_date: '',
      distributor_name: '',
      total_hna: '',
      discount_amount: '',
      ppn_input: '',
      final_hna: '',
      payment_date: '',
      status: 'Pending'
    });
    setEditingId(null);
  };

  const metrics = calculateMetrics();

  if (loading) {
    return <div style={{ padding: '2rem', marginLeft: isSidebarOpen ? '256px' : '80px' }}>Loading...</div>;
  }

  return (
    <div style={{ 
      padding: '2rem',
      marginLeft: isSidebarOpen ? '256px' : '80px',
      backgroundColor: isDarkMode ? '#000000' : '#FFFFFF',
      minHeight: '100vh',
      color: isDarkMode ? '#FFFFFF' : '#000000',
      transition: 'margin-left 0.3s'
    }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '2rem', color: isDarkMode ? '#FFF' : '#000' }}>
        📄 Invoice Management
      </h1>

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <MetricCard isDarkMode={isDarkMode} title="Total HNA" value={formatRupiah(metrics.totalHna)} icon="💰" />
        <MetricCard isDarkMode={isDarkMode} title="Total PPN" value={formatRupiah(metrics.totalPpn)} icon="📊" />
        <MetricCard isDarkMode={isDarkMode} title="Total Margin" value={formatRupiah(metrics.margin)} icon="📈" />
        <MetricCard isDarkMode={isDarkMode} title="Count" value={`${metrics.count} items`} icon="📋" />
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <Plus size={18} />
          Add Invoice
        </button>

        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleExcelImport} style={{ display: 'none' }} />
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <Upload size={18} />
          Import Excel
        </button>
      </div>

      {/* Filters */}
      <div style={{
        backgroundColor: isDarkMode ? '#1C1C1E' : '#f9fafb',
        padding: '1.5rem',
        borderRadius: '0.75rem',
        marginBottom: '2rem',
        border: isDarkMode ? '1px solid #424245' : '1px solid #E5E5EA'
      }}>
        <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem', color: isDarkMode ? '#FFF' : '#000' }}>
          🔍 Filter & Search
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <FilterSelect label="Month" value={selectedMonth} onChange={setSelectedMonth} options={[{ value: 'all', label: 'All Months' }, ...getUniqueMonths().map(m => ({ value: m, label: m }))]} isDarkMode={isDarkMode} />
          <FilterInput label="Distributor" value={searchDistributor} onChange={setSearchDistributor} placeholder="Search..." isDarkMode={isDarkMode} />
          <FilterInput label="Invoice #" value={searchInvoiceNum} onChange={setSearchInvoiceNum} placeholder="Search..." isDarkMode={isDarkMode} />
          <FilterSelect label="Status" value={filterStatus} onChange={setFilterStatus} options={[{ value: 'all', label: 'All' }, { value: 'Pending', label: 'Pending' }, { value: 'Paid', label: 'Paid' }]} isDarkMode={isDarkMode} />
          <FilterInput label="Date From" value={dateFrom} onChange={setDateFrom} type="date" isDarkMode={isDarkMode} />
          <FilterInput label="Date To" value={dateTo} onChange={setDateTo} type="date" isDarkMode={isDarkMode} />
        </div>

        <button
          onClick={() => {
            setSelectedMonth('all');
            setSearchDistributor('');
            setSearchInvoiceNum('');
            setFilterStatus('all');
            setDateFrom('');
            setDateTo('');
          }}
          style={{
            marginTop: '1rem',
            padding: '0.5rem 1rem',
            backgroundColor: isDarkMode ? '#2C2C2E' : '#e5e7eb',
            color: isDarkMode ? '#FFF' : '#000',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontSize: '0.875rem'
          }}
        >
          Clear Filters
        </button>
      </div>

      {/* Modal */}
      {showModal && (
        <InvoiceModal
          isDarkMode={isDarkMode}
          showModal={showModal}
          setShowModal={setShowModal}
          formData={formData}
          setFormData={setFormData}
          handleInputChange={handleInputChange}
          handleSubmit={handleSubmit}
          editingId={editingId}
          distributors={distributors}
          showAddDistributor={showAddDistributor}
          setShowAddDistributor={setShowAddDistributor}
          newDistributorName={newDistributorName}
          setNewDistributorName={setNewDistributorName}
          handleAddDistributor={handleAddDistributor}
        />
      )}

      {/* Table */}
      <div style={{ 
        backgroundColor: isDarkMode ? '#1C1C1E' : 'white', 
        borderRadius: '0.75rem', 
        overflow: 'hidden',
        border: isDarkMode ? '1px solid #424245' : '1px solid #E5E5EA'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ backgroundColor: isDarkMode ? '#2C2C2E' : '#f9fafb' }}>
            <tr>
              <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '700', color: isDarkMode ? '#FFF' : '#000', fontSize: '0.875rem' }}>Invoice #</th>
              <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '700', color: isDarkMode ? '#FFF' : '#000', fontSize: '0.875rem' }}>Distributor</th>
              <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '700', color: isDarkMode ? '#FFF' : '#000', fontSize: '0.875rem' }}>Date</th>
              <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '700', color: isDarkMode ? '#FFF' : '#000', fontSize: '0.875rem' }}>Amount</th>
              <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '700', color: isDarkMode ? '#FFF' : '#000', fontSize: '0.875rem' }}>Status</th>
              <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '700', color: isDarkMode ? '#FFF' : '#000', fontSize: '0.875rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredInvoices.map(inv => (
              <tr key={inv.id} style={{ borderBottom: isDarkMode ? '1px solid #424245' : '1px solid #e5e7eb' }}>
                <td style={{ padding: '1rem', color: isDarkMode ? '#FFF' : '#000', fontSize: '0.875rem' }}><strong>{inv.invoice_number}</strong></td>
                <td style={{ padding: '1rem', color: isDarkMode ? '#FFF' : '#000', fontSize: '0.875rem' }}>{inv.distributor_name}</td>
                <td style={{ padding: '1rem', color: isDarkMode ? '#FFF' : '#000', fontSize: '0.875rem' }}>{new Date(inv.purchase_date).toLocaleDateString('id-ID')}</td>
                <td style={{ padding: '1rem', color: isDarkMode ? '#FFF' : '#000', fontSize: '0.875rem' }}><strong>{formatRupiah(inv.total_hna)}</strong></td>
                <td style={{ padding: '1rem' }}>
                  <span style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    backgroundColor: inv.status === 'Paid' ? '#dcfce7' : '#fef3c7',
                    color: inv.status === 'Paid' ? '#166534' : '#92400e'
                  }}>
                    {inv.status}
                  </span>
                </td>
                <td style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => handleEdit(inv)} style={{ padding: '0.35rem 0.75rem', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.75rem' }}>Edit</button>
                    <button onClick={() => handleDelete(inv.id)} style={{ padding: '0.35rem 0.75rem', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.75rem' }}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredInvoices.length === 0 && invoices.length > 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', color: isDarkMode ? '#86868B' : '#6b7280' }}>
            No invoices match filters
          </div>
        )}
        {invoices.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', color: isDarkMode ? '#86868B' : '#6b7280' }}>
            No invoices yet
          </div>
        )}
      </div>
    </div>
  );
}

// Components
function MetricCard({ isDarkMode, title, value, icon }) {
  return (
    <div style={{
      backgroundColor: isDarkMode ? '#1C1C1E' : '#f9fafb',
      padding: '1.5rem',
      borderRadius: '0.75rem',
      border: isDarkMode ? '1px solid #424245' : '1px solid #E5E5EA'
    }}>
      <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{icon}</div>
      <p style={{ fontSize: '0.875rem', color: isDarkMode ? '#86868B' : '#6b7280', margin: '0 0 0.5rem 0' }}>{title}</p>
      <p style={{ fontSize: '1.25rem', fontWeight: 'bold', color: isDarkMode ? '#FFF' : '#000', margin: 0 }}>{value}</p>
    </div>
  );
}

function FilterInput({ label, value, onChange, type = 'text', placeholder = '', isDarkMode }) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem', color: isDarkMode ? '#FFF' : '#000' }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '0.75rem',
          border: isDarkMode ? '1px solid #424245' : '1px solid #d1d5db',
          borderRadius: '0.5rem',
          backgroundColor: isDarkMode ? '#2C2C2E' : '#FFF',
          color: isDarkMode ? '#FFF' : '#000',
          fontSize: '0.875rem'
        }}
      />
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, isDarkMode }) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem', color: isDarkMode ? '#FFF' : '#000' }}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          padding: '0.75rem',
          border: isDarkMode ? '1px solid #424245' : '1px solid #d1d5db',
          borderRadius: '0.5rem',
          backgroundColor: isDarkMode ? '#2C2C2E' : '#FFF',
          color: isDarkMode ? '#FFF' : '#000',
          fontSize: '0.875rem'
        }}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

function InvoiceModal({ isDarkMode, showModal, setShowModal, formData, setFormData, handleInputChange, handleSubmit, editingId, distributors, showAddDistributor, setShowAddDistributor, newDistributorName, setNewDistributorName, handleAddDistributor }) {
  return (
    showModal && (
      <div onClick={() => setShowModal(false)} style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        overflowY: 'auto',
        padding: '2rem 0'
      }}>
        <div onClick={(e) => e.stopPropagation()} style={{
          backgroundColor: isDarkMode ? '#1C1C1E' : '#FFFFFF',
          borderRadius: '1rem',
          padding: '2rem',
          width: '90%',
          maxWidth: '700px',
          boxShadow: '0 20px 25px rgba(0, 0, 0, 0.3)',
          maxHeight: '90vh',
          overflowY: 'auto'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0, color: isDarkMode ? '#FFF' : '#000' }}>
              {editingId ? '✏️ Edit Invoice' : '➕ Create Invoice'}
            </h2>
            <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem' }}>
              <X size={24} color={isDarkMode ? '#FFF' : '#000'} />
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Purchase Information */}
            <div style={{ marginBottom: '2rem', paddingBottom: '2rem', borderBottom: isDarkMode ? '1px solid #424245' : '1px solid #e5e7eb' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1rem', color: isDarkMode ? '#FFF' : '#000' }}>📦 Purchase Information</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <FormField label="Invoice #" name="invoice_number" value={formData.invoice_number} onChange={handleInputChange} isDarkMode={isDarkMode} required />
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: isDarkMode ? '#FFF' : '#000', fontSize: '0.875rem' }}>Distributor</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <select
                      value={formData.distributor_name}
                      onChange={(e) => setFormData(prev => ({ ...prev, distributor_name: e.target.value }))}
                      style={{
                        flex: 1,
                        padding: '0.75rem',
                        border: isDarkMode ? '1px solid #424245' : '1px solid #d1d5db',
                        borderRadius: '0.5rem',
                        backgroundColor: isDarkMode ? '#2C2C2E' : '#FFF',
                        color: isDarkMode ? '#FFF' : '#000'
                      }}
                    >
                      <option value="">-- Select Distributor --</option>
                      {distributors.map((d, i) => (
                        <option key={i} value={d.name}>{d.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowAddDistributor(!showAddDistributor)}
                      style={{
                        padding: '0.75rem 1rem',
                        backgroundColor: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.5rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: '600'
                      }}
                    >
                      + Add
                    </button>
                  </div>
                </div>
              </div>
              {showAddDistributor && (
                <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: isDarkMode ? '#2C2C2E' : '#f3f4f6', borderRadius: '0.5rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text"
                      placeholder="New distributor name..."
                      value={newDistributorName}
                      onChange={(e) => setNewDistributorName(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '0.75rem',
                        border: isDarkMode ? '1px solid #424245' : '1px solid #d1d5db',
                        borderRadius: '0.5rem',
                        backgroundColor: isDarkMode ? '#1C1C1E' : '#FFF',
                        color: isDarkMode ? '#FFF' : '#000'
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleAddDistributor}
                      style={{
                        padding: '0.75rem 1rem',
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.5rem',
                        cursor: 'pointer',
                        fontWeight: '600'
                      }}
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                <FormField label="Purchase Date" name="purchase_date" type="date" value={formData.purchase_date} onChange={handleInputChange} isDarkMode={isDarkMode} required />
                <FormField label="Total HNA" name="total_hna" type="number" value={formData.total_hna} onChange={handleInputChange} isDarkMode={isDarkMode} required isCurrency={true} />
              </div>
            </div>

            {/* Financial Information */}
            <div style={{ marginBottom: '2rem', paddingBottom: '2rem', borderBottom: isDarkMode ? '1px solid #424245' : '1px solid #e5e7eb' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1rem', color: isDarkMode ? '#FFF' : '#000' }}>💰 Financial Information</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <FormField label="Discount" name="discount_amount" type="number" value={formData.discount_amount} onChange={handleInputChange} isDarkMode={isDarkMode} isCurrency={true} />
<FormField label="PPN Input" name="ppn_input" type="number" value={formData.ppn_input} onChange={handleInputChange} isDarkMode={isDarkMode} isCurrency={true} />
<FormField label="Final HNA" name="final_hna" type="number" value={formData.final_hna} onChange={handleInputChange} isDarkMode={isDarkMode} required isCurrency={true} />
              </div>
            </div>

            {/* Payment Information */}
            <div style={{ marginBottom: '2rem', paddingBottom: '2rem', borderBottom: isDarkMode ? '1px solid #424245' : '1px solid #e5e7eb' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1rem', color: isDarkMode ? '#FFF' : '#000' }}>📅 Payment Information</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <FormField label="Payment Date" name="payment_date" type="date" value={formData.payment_date} onChange={handleInputChange} isDarkMode={isDarkMode} />
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: isDarkMode ? '#FFF' : '#000', fontSize: '0.875rem' }}>Status</label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleInputChange}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: isDarkMode ? '1px solid #424245' : '1px solid #d1d5db',
                      borderRadius: '0.5rem',
                      backgroundColor: isDarkMode ? '#2C2C2E' : '#FFF',
                      color: isDarkMode ? '#FFF' : '#000'
                    }}
                  >
                    <option value="Pending">Pending</option>
                    <option value="Paid">Paid</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button type="submit" style={{
                flex: 1,
                padding: '0.75rem',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontWeight: '600'
              }}>
                {editingId ? 'Update' : 'Create'}
              </button>
              <button type="button" onClick={() => setShowModal(false)} style={{
                flex: 1,
                padding: '0.75rem',
                backgroundColor: isDarkMode ? '#2C2C2E' : '#f3f4f6',
                color: isDarkMode ? '#FFF' : '#000',
                border: isDarkMode ? '1px solid #424245' : '1px solid #d1d5db',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontWeight: '600'
              }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  );
}

function FormField({ label, name, type = 'text', value, onChange, isDarkMode, required = false, isCurrency = false }) {
  // Format untuk display saja (jangan ubah value asli)
  const getDisplayValue = () => {
    if (!isCurrency) return value;
    if (!value) return '';
    
    const numericStr = value.toString();
    // Hanya ambil bagian integer (sebelum titik desimal jika ada)
    const integerPart = numericStr.split('.')[0];
    
    // Format dengan titik per 3 digit, tanpa suffix ,00
    const formatted = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `Rp ${formatted}`;
  };
  
  return (
    <div>
      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: isDarkMode ? '#FFF' : '#000', fontSize: '0.875rem' }}>
        {label}
      </label>
      <input
        type={isCurrency ? 'text' : type}
        name={name}
        value={getDisplayValue()}
        onChange={onChange}
        required={required}
        placeholder={isCurrency ? 'Rp 0,00' : ''}
        style={{
          width: '100%',
          padding: '0.75rem',
          border: isDarkMode ? '1px solid #424245' : '1px solid #d1d5db',
          borderRadius: '0.5rem',
          backgroundColor: isDarkMode ? '#2C2C2E' : '#FFF',
          color: isDarkMode ? '#FFF' : '#000'
        }}
      />
    </div>
  );
}