import React, { useState, useEffect, useRef } from 'react';
import { invoicesAPI } from '../services/api';
import { Edit2, Trash2, Plus, Upload, X } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function InvoiceList({ isDarkMode, isSidebarOpen }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const fileInputRef = useRef(null);
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
  }, []);

  const fetchInvoices = async () => {
    try {
      const response = await invoicesAPI.getAll();
      setInvoices(response.data);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching invoices:', err);
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
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
      resetForm();
      setShowModal(false);
    } catch (err) {
      console.error('Error saving invoice:', err);
      alert('Error saving invoice: ' + err.message);
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
    if (window.confirm('Delete this invoice?')) {
      try {
        await invoicesAPI.delete(id);
        fetchInvoices();
      } catch (err) {
        console.error('Error:', err);
        alert('Error deleting invoice');
      }
    }
  };

  const handleExcelImport = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const workbook = XLSX.read(file, { type: 'array' });
      const worksheet = workbook.Sheets['Faktur Pembelian']; // Sheet name
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      console.log('Excel data:', jsonData);

      // Import setiap row
      for (const row of jsonData) {
        await invoicesAPI.create({
          invoice_number: row['No Faktur'] || row['invoice_number'] || '',
          purchase_date: new Date(row['Tanggal Pembelian'] || row['purchase_date']).toISOString().split('T')[0],
          distributor_name: row['Nama Distributor'] || row['distributor_name'] || '',
          total_hna: parseFloat(row['Total HNA'] || row['total_hna'] || 0),
          discount_amount: parseFloat(row['Diskon'] || row['discount_amount'] || 0),
          ppn_input: parseFloat(row['PPN Masukan'] || row['ppn_input'] || 0),
          final_hna: parseFloat(row['HNA Akhir'] || row['final_hna'] || 0),
          payment_date: row['Tanggal Bayar'] ? new Date(row['Tanggal Bayar']).toISOString().split('T')[0] : null,
          status: row['Status'] || 'Pending'
        });
      }

      alert(`✅ Successfully imported ${jsonData.length} invoices!`);
      fetchInvoices();
      event.target.value = ''; // Reset file input
    } catch (err) {
      console.error('Error importing excel:', err);
      alert('Error importing Excel: ' + err.message);
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

  if (loading) {
    return (
      <div style={{ 
        padding: '2rem',
        marginLeft: isSidebarOpen ? '256px' : '80px',
        backgroundColor: isDarkMode ? '#000000' : '#FFFFFF',
        minHeight: '100vh',
        color: isDarkMode ? '#FFFFFF' : '#000000',
        transition: 'margin-left 0.3s'
      }}>
        Loading...
      </div>
    );
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', margin: 0, color: isDarkMode ? '#FFF' : '#000' }}>
          📄 Invoice Management
        </h1>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
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
          Add New Invoice
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleExcelImport}
          style={{ display: 'none' }}
        />
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

      {/* Modal Backdrop */}
      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
        >
          {/* Modal Content */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: isDarkMode ? '#1C1C1E' : '#FFFFFF',
              borderRadius: '1rem',
              padding: '2rem',
              width: '90%',
              maxWidth: '600px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px rgba(0, 0, 0, 0.3)'
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0, color: isDarkMode ? '#FFF' : '#000' }}>
                {editingId ? '✏️ Edit Invoice' : '➕ Create New Invoice'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0.5rem',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <X size={24} color={isDarkMode ? '#FFF' : '#000'} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <FormField label="Invoice Number" name="invoice_number" value={formData.invoice_number} onChange={handleInputChange} isDarkMode={isDarkMode} required />
                <FormField label="Distributor" name="distributor_name" value={formData.distributor_name} onChange={handleInputChange} isDarkMode={isDarkMode} required />
                <FormField label="Purchase Date" name="purchase_date" type="date" value={formData.purchase_date} onChange={handleInputChange} isDarkMode={isDarkMode} required />
                <FormField label="Total HNA" name="total_hna" type="number" value={formData.total_hna} onChange={handleInputChange} isDarkMode={isDarkMode} required />
                <FormField label="Discount" name="discount_amount" type="number" value={formData.discount_amount} onChange={handleInputChange} isDarkMode={isDarkMode} />
                <FormField label="PPN Input" name="ppn_input" type="number" value={formData.ppn_input} onChange={handleInputChange} isDarkMode={isDarkMode} />
                <FormField label="Final HNA" name="final_hna" type="number" value={formData.final_hna} onChange={handleInputChange} isDarkMode={isDarkMode} required />
                <FormField label="Payment Date" name="payment_date" type="date" value={formData.payment_date} onChange={handleInputChange} isDarkMode={isDarkMode} />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: isDarkMode ? '#FFF' : '#000' }}>Status</label>
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

              <div style={{ display: 'flex', gap: '1rem' }}>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    backgroundColor: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontWeight: '600'
                  }}
                >
                  {editingId ? 'Update' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    backgroundColor: isDarkMode ? '#2C2C2E' : '#f3f4f6',
                    color: isDarkMode ? '#FFF' : '#000',
                    border: isDarkMode ? '1px solid #424245' : '1px solid #d1d5db',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontWeight: '600'
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
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
              <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '700', color: isDarkMode ? '#FFF' : '#000' }}>Invoice #</th>
              <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '700', color: isDarkMode ? '#FFF' : '#000' }}>Distributor</th>
              <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '700', color: isDarkMode ? '#FFF' : '#000' }}>Date</th>
              <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '700', color: isDarkMode ? '#FFF' : '#000' }}>Amount</th>
              <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '700', color: isDarkMode ? '#FFF' : '#000' }}>Status</th>
              <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '700', color: isDarkMode ? '#FFF' : '#000' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map(inv => (
              <tr key={inv.id} style={{ borderBottom: isDarkMode ? '1px solid #424245' : '1px solid #e5e7eb' }}>
                <td style={{ padding: '1rem', color: isDarkMode ? '#FFF' : '#000' }}><strong>{inv.invoice_number}</strong></td>
                <td style={{ padding: '1rem', color: isDarkMode ? '#FFF' : '#000' }}>{inv.distributor_name}</td>
                <td style={{ padding: '1rem', color: isDarkMode ? '#FFF' : '#000' }}>{new Date(inv.purchase_date).toLocaleDateString('id-ID')}</td>
                <td style={{ padding: '1rem', color: isDarkMode ? '#FFF' : '#000' }}><strong>Rp {parseInt(inv.total_hna).toLocaleString('id-ID')}</strong></td>
                <td style={{ padding: '1rem' }}>
                  <span style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: '9999px',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    backgroundColor: inv.status === 'Paid' ? '#dcfce7' : '#fef3c7',
                    color: inv.status === 'Paid' ? '#166534' : '#92400e'
                  }}>
                    {inv.status === 'Paid' ? '✓ Paid' : '⏳ Pending'}
                  </span>
                </td>
                <td style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => handleEdit(inv)}
                      style={{
                        padding: '0.4rem 0.8rem',
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.375rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: '500'
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(inv.id)}
                      style={{
                        padding: '0.4rem 0.8rem',
                        backgroundColor: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.375rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: '500'
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {invoices.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', color: isDarkMode ? '#86868B' : '#6b7280' }}>
            No invoices yet. Try importing Excel or create one!
          </div>
        )}
      </div>
    </div>
  );
}

function FormField({ label, name, type = 'text', value, onChange, isDarkMode, required = false }) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: isDarkMode ? '#FFF' : '#000' }}>
        {label}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        required={required}
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