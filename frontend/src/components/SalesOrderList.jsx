import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, Trash2, Edit2, X, FileText, ChevronsUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { salesAPI, customersAPI, inventoryAPI, printSettingsAPI, countersAPI } from '../services/api';
import { getProductUnits, formatQtyWithConversion, isPackUnit, resolveTierPrice } from '../constants/units';
import { generateNotaPDF } from '../utils/generateNotaPDF';
import { generateLaporanPDF } from '../utils/generateLaporanPDF';
import MasterSelect from './MasterSelect';
import Skeleton from './common/Skeleton';
import ConfirmModal from './common/ConfirmModal';
import Breadcrumb from './common/Breadcrumb';

if (typeof document !== 'undefined' && !document.getElementById('habil-pulse-style')) {
  const s = document.createElement('style'); s.id = 'habil-pulse-style';
  s.textContent = '@keyframes habil-pulse{0%,100%{opacity:1}50%{opacity:0.35}}';
  document.head.appendChild(s);
}

const fmtRp = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const addDays = (dateStr, n) => {
  const base = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  base.setDate(base.getDate() + n);
  return `${base.getFullYear()}-${String(base.getMonth()+1).padStart(2,'0')}-${String(base.getDate()).padStart(2,'0')}`;
};
const notaDaysDiff = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.ceil((d - now) / 86400000);
};

const blankItem = () => ({ product_name: '', qty: 1, unit: 'pcs', unit_price: 0, unit_hpp: 0 });

export default function SalesOrderList({ isDarkMode, isSidebarOpen, isMobile }) {

  const [orders, setOrders] = useState([]);
  // v1.7.0 multi-select bulk export
  const [selectedNotaIds, setSelectedNotaIds] = useState(new Set());
  const [exportingPdf, setExportingPdf] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [printOrder, setPrintOrder] = useState(null);
  const [printOptions, setPrintOptions] = useState({ format: 'A5', type: 'nota' });
  const [layoutSettings, setLayoutSettings] = useState(null);
  const [editId, setEditId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [paymentModal, setPaymentModal] = useState({ open: false, order: null, date: '', mode: 'pay' });
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Filters
  const [filterMonth, setFilterMonth] = useState('all');
  const [filterYear, setFilterYear] = useState('all');

  // Form state
  const [isAutoNota, setIsAutoNota] = useState(true);
  const [manualNumber, setManualNumber] = useState('');
  const [notaCounter, setNotaCounter] = useState({ prefix: 'NT', last_number: 0 });
  const numberInputRef = useRef(null);
  const [form, setForm] = useState({
    order_number: '',
    customer_name: '',
    customer_address: '',
    sale_date: new Date().toISOString().split('T')[0],
    notes: '',
    payment_method: 'Tunai',
    payment_details: '',
    channel: 'offline',
    due_date: '',
    payment_terms: null,
  });
  const [items, setItems] = useState([blankItem()]);
  const [itemBatches, setItemBatches] = useState([]);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const bg = isDarkMode ? '#000' : '#F5F5F7';
  const cardBg = isDarkMode ? '#1C1C1E' : '#FFF';
  const border = isDarkMode ? '#2C2C2E' : '#E5E5EA';
  const text = isDarkMode ? '#FFF' : '#000';
  const sub = '#86868B';
  const labelStyle = { display: 'block', fontSize: '12px', fontWeight: '700', color: sub, marginBottom: '8px', textTransform: 'uppercase' };

  const fetchOrders = async () => {
    setLoading(true);
    try { 
      const { data } = await salesAPI.getAll(); 
      setOrders(data); 
    } catch (e) { 
      console.error(e); 
    } finally {
      setTimeout(() => setLoading(false), 500);
    }
  };
  const fetchCustomers = async () => {
    try { const { data } = await customersAPI.getAll(); setCustomers(data); } catch (e) { console.error(e); }
  };
  const fetchProducts = async () => {
    try { const { data } = await inventoryAPI.getProducts(); setProducts(data); } catch (e) { console.error(e); }
  };
  const fetchSettings = async () => {
    try { const { data } = await printSettingsAPI.get(); setLayoutSettings(data.nota_layout); } catch (e) { console.error(e); }
  };
  const fetchCounters = async () => {
    try {
      const { data } = await countersAPI.getAll();
      const nt = data.find(c => c.doc_type === 'NOTA');
      if (nt) setNotaCounter(nt);
    } catch (e) { console.error(e); }
  };

  const openPaymentModal = (order) => {
    const today = new Date().toISOString().split('T')[0];
    const existingDate = order.paid_at ? new Date(order.paid_at).toISOString().split('T')[0] : today;
    setPaymentModal({
      open: true,
      order,
      date: order.payment_status === 'paid' ? existingDate : today,
      mode: order.payment_status === 'paid' ? 'edit' : 'pay',
    });
  };

  const handlePaymentSave = async () => {
    if (!paymentModal.order || !paymentModal.date) return;
    setPaymentSaving(true);
    try {
      await salesAPI.updatePaymentStatus(paymentModal.order.id, 'paid', paymentModal.date);
      flash('Tanggal pelunasan disimpan');
      setPaymentModal({ open: false, order: null, date: '', mode: 'pay' });
      fetchOrders();
    } catch (e) { flash(e.response?.data?.error || e.message); }
    finally { setPaymentSaving(false); }
  };

  const handlePaymentUnpay = async () => {
    if (!paymentModal.order) return;
    setPaymentSaving(true);
    try {
      await salesAPI.updatePaymentStatus(paymentModal.order.id, 'unpaid');
      flash('Status dikembalikan ke Belum Bayar');
      setPaymentModal({ open: false, order: null, date: '', mode: 'pay' });
      fetchOrders();
    } catch (e) { flash(e.response?.data?.error || e.message); }
    finally { setPaymentSaving(false); }
  };

  // Customer CRUD Handlers
  const handleAddCustomer = async (name) => {
    try {
      await customersAPI.create({ name, address: '' });
      flash('Customer ditambahkan');
      fetchCustomers();
    } catch (e) { flash(e.response?.data?.error || e.message); }
  };

  const handleRemoveCustomer = async (name) => {
    try {
      const customer = customers.find(c => c.name === name);
      if (customer) {
        await customersAPI.remove(customer.id);
        flash('Customer dihapus');
        fetchCustomers();
      }
    } catch (e) { flash(e.response?.data?.error || e.message); }
  };

  const handleRenameCustomer = async (oldName, newName) => {
    try {
      const customer = customers.find(c => c.name === oldName);
      if (customer) {
        await customersAPI.update(customer.id, { name: newName, address: customer.address || '' });
        flash('Customer diubah');
        fetchCustomers();
      }
    } catch (e) { flash(e.response?.data?.error || e.message); }
  };

  // Product CRUD Handlers
  const handleAddProduct = async (name) => {
    try {
      await inventoryAPI.createProduct({ name, unit: 'pcs', hna: 0, sell_price: 0, category: '', min_stock: 5 });
      flash('Produk ditambahkan');
      fetchProducts();
    } catch (e) { flash(e.response?.data?.error || e.message); }
  };

  const handleRemoveProduct = async (name) => {
    try {
      const product = products.find(p => p.name === name);
      if (product) {
        await inventoryAPI.deleteProduct(product.id);
        flash('Produk dinonaktifkan');
        fetchProducts();
      }
    } catch (e) { flash(e.response?.data?.error || e.message); }
  };

  const handleRenameProduct = async (oldName, newName) => {
    try {
      const product = products.find(p => p.name === oldName);
      if (product) {
        await inventoryAPI.updateProduct(product.id, {
          name: newName,
          code: product.code,
          unit: product.unit,
          hna: product.hna,
          sell_price: product.sell_price,
          category: product.category,
          min_stock: product.min_stock,
        });
        flash('Nama produk diubah');
        fetchProducts();
      }
    } catch (e) { flash(e.response?.data?.error || e.message); }
  };

  useEffect(() => { fetchOrders(); fetchCustomers(); fetchProducts(); fetchSettings(); fetchCounters(); }, []);

  // Filters
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterChannel, setFilterChannel] = useState('all');
  const [sortKey, setSortKey] = useState('sale_date'); // 'sale_date' | 'total' | 'order_number'
  const [sortDir, setSortDir] = useState('desc'); // 'asc' | 'desc'

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const filtered = orders
    .filter(o => {
      const orderDate = new Date(o.sale_date);
      const matchesSearch = o.order_number.toLowerCase().includes(search.toLowerCase()) ||
                            o.customer_name.toLowerCase().includes(search.toLowerCase());
      const isAllMonth = String(filterMonth) === 'all';
      const isAllYear = String(filterYear) === 'all';
      const matchesMonth = isAllMonth || (orderDate.getMonth() + 1) === parseInt(filterMonth, 10);
      const matchesYear = isAllYear || orderDate.getFullYear() === parseInt(filterYear, 10);
      const matchesStatus = filterStatus === 'all' || o.payment_status === filterStatus;
      const matchesChannel = filterChannel === 'all' || (o.channel || 'offline') === filterChannel;
      return matchesSearch && matchesMonth && matchesYear && matchesStatus && matchesChannel;
    })
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'sale_date') return (new Date(a.sale_date) - new Date(b.sale_date)) * dir;
      if (sortKey === 'total') return ((parseFloat(a.total) || 0) - (parseFloat(b.total) || 0)) * dir;
      if (sortKey === 'order_number') return String(a.order_number).localeCompare(String(b.order_number)) * dir;
      return 0;
    });

  const openAdd = () => {
    // v1.8.4: refetch counter biar preview Auto field selalu fresh (handle delete/concurrent)
    fetchCounters();
    setIsAutoNota(true);
    setManualNumber('');
    setEditId(null);
    setForm({
      order_number: '',
      customer_name: '',
      customer_address: '',
      sale_date: new Date().toISOString().split('T')[0],
      notes: '',
      payment_method: 'Tunai',
      payment_details: '',
      channel: 'offline',
      due_date: '',
      payment_terms: null,
    });
    setItems([blankItem()]);
    setItemBatches([]);
    setShowModal(true);
  };

  const openEdit = async (order) => {
    setEditId(order.id);
    setForm({
      order_number: order.order_number,
      customer_name: order.customer_name,
      customer_address: order.customer_address || '',
      sale_date: order.sale_date ? order.sale_date.split('T')[0] : '',
      notes: order.notes || '',
      payment_method: order.payment_method || 'Tunai',
      payment_details: order.payment_details || '',
      channel: order.channel || 'offline',
      due_date: order.due_date ? order.due_date.split('T')[0] : '',
      payment_terms: order.payment_terms || null,
    });
    // v1.8.1: include batch snapshot fields supaya batch picker bisa pre-fill
    const editItems = order.items?.length
      ? order.items.map(i => ({
          product_name: i.product_name,
          qty: i.qty,
          unit: i.unit || 'pcs',
          unit_price: parseFloat(i.unit_price) || 0,
          unit_hpp: parseFloat(i.unit_hpp) || 0,
          _selected_batch: i.batch_no_snapshot || '',
          batch_no_snapshot: i.batch_no_snapshot,
          expired_date_snapshot: i.expired_date_snapshot,
        }))
      : [blankItem()];
    setItems(editItems);
    setItemBatches(editItems.map(() => []));
    setShowModal(true);

    // v1.8.1: re-fetch batches per item supaya dropdown bisa render + match snapshot
    if (order.items?.length) {
      for (let idx = 0; idx < order.items.length; idx++) {
        const item = order.items[idx];
        const prod = products.find(p => p.name?.toLowerCase() === item.product_name?.toLowerCase());
        if (!prod) continue;
        try {
          const { data: batches } = await inventoryAPI.getAvailableBatches(prod.id);
          setItemBatches(prev => {
            const n = [...prev];
            n[idx] = batches || [];
            return n;
          });
          // Cache product reference di item (untuk consistency dgn updateItem product flow)
          setItems(prev => {
            const n = [...prev];
            if (n[idx]) n[idx] = { ...n[idx], _product: prod };
            return n;
          });
        } catch (e) { /* batch fetch failed, dropdown akan kosong → fallback Auto FEFO */ }
      }
    }
  };

  const handleSave = async () => {
    setSaveError('');
    const errors = {};
    if (!form.customer_name.trim()) errors.customer_name = 'Customer wajib diisi';
    const validItems = items.filter(i => i.product_name.trim());
    if (!validItems.length) errors.items = 'Minimal 1 produk harus ditambahkan';
    if (!isAutoNota && !manualNumber && !editId) errors.order_number = 'Nomor Nota wajib diisi (mode Manual)';
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      const payload = { ...form, items: validItems };
      if (!isAutoNota && !editId) {
        payload.order_number = notaCounter.prefix + manualNumber;
      }
      if (isAutoNota && !editId) {
        delete payload.order_number;
      }
      if (editId) {
        await salesAPI.update(editId, { ...payload, status: 'final' });
        flash('Nota diperbarui');
      } else {
        await salesAPI.create(payload);
        flash('Nota berhasil dibuat');
        fetchCounters(); 
      }
      setShowModal(false);
      fetchOrders();
    } catch (e) { setSaveError(e.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = (id) => setDeleteConfirmId(id);
  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await salesAPI.remove(deleteConfirmId);
      flash('Nota dihapus');
      fetchOrders();
      fetchCounters(); // v1.8.4: re-sync preview ke MAX setelah delete
    } catch (e) { flash(e.response?.data?.error || e.message); }
    finally { setDeleteConfirmId(null); }
  };

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const handlePrintPDF = async () => {
    if (!printOrder || pdfLoading) return;
    setPdfLoading(true);
    try {
      const doc = generateNotaPDF(printOrder, {
        ...printOptions,
        settings: layoutSettings
      });
      doc.save(`${printOptions.type === 'terima' ? 'TT' : 'Nota'}_${printOrder.order_number}.pdf`);
      await salesAPI.updatePdfStatus(printOrder.id, 'sudah_dicetak');
      flash('PDF berhasil diunduh');
      setShowPrintModal(false);
      fetchOrders();
    } catch (e) { flash('Gagal membuat PDF: ' + e.message); }
    finally { setPdfLoading(false); }
  };

  const openPrintOptions = (order) => {
    setPrintOrder(order);
    setShowPrintModal(true);
  };

  const addItem = () => { setItems([...items, blankItem()]); setItemBatches([...itemBatches, []]); };
  const removeItem = (idx) => { setItems(items.filter((_, i) => i !== idx)); setItemBatches(itemBatches.filter((_, i) => i !== idx)); };

  // v1.7.0 multi-select handlers
  const toggleNotaSelect = (id) => {
    setSelectedNotaIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAllVisible = (visibleOrders) => {
    setSelectedNotaIds(prev => {
      const visibleIds = visibleOrders.map(o => o.id);
      const allSelected = visibleIds.length > 0 && visibleIds.every(id => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        visibleIds.forEach(id => next.delete(id));
        return next;
      }
      return new Set([...prev, ...visibleIds]);
    });
  };
  const handleExportPdfLaporan = async () => {
    if (selectedNotaIds.size === 0) return;
    setExportingPdf(true);
    try {
      const selected = orders.filter(o => selectedNotaIds.has(o.id));
      generateLaporanPDF(selected, {
        companyName: 'HABIL SUPERAPP',
        filterInfo: `${selected.length} nota dipilih`,
        dateRange: 'Custom selection',
      });
    } catch (e) {
      setSaveError('Export PDF gagal: ' + e.message);
    } finally { setExportingPdf(false); }
  };
  const updateItem = async (idx, field, value) => {
    const newItems = [...items];
    let updated = { ...newItems[idx], [field]: value };
    
    // Auto-fill HPP and Price when product changes
    if (field === 'product_name') {
      const match = products.find(p => p.name.toLowerCase() === value.toLowerCase());
      if (match) {
        updated.unit_price = parseFloat(match.sell_price) || 0;
        updated.unit = match.base_unit || match.unit || 'pcs';
        updated._product_id = match.id;
        updated._product = match; // v1.6.0: cache product (pack info) untuk dropdown unit + konversi

        // Fetch available batches + tiers (v1.7.0 parallel) for dropdown
        try {
          const [batchesResp, tiersResp] = await Promise.all([
            inventoryAPI.getAvailableBatches(match.id),
            inventoryAPI.getProductTiers(match.id).catch(() => ({ data: [] })),
          ]);
          const batches = batchesResp.data || [];
          const tiers = tiersResp.data || [];
          updated._product = { ...match, price_tiers: tiers }; // v1.7.0: cache tiers di item
          const newBatches = [...itemBatches];
          newBatches[idx] = batches;
          setItemBatches(newBatches);
          // Auto-select FEFO (first batch)
          if (batches.length > 0) {
            updated.unit_hpp = parseFloat(batches[0].hna) || 0;
            updated._selected_batch = batches[0].batch_no;
          } else {
            updated.unit_hpp = parseFloat(match.hna) || 0;
          }
        } catch (e) {
          updated.unit_hpp = parseFloat(match.hna) || 0;
        }
      } else {
        // Clear batch list when product name doesn't match
        const newBatches = [...itemBatches];
        newBatches[idx] = [];
        setItemBatches(newBatches);
        updated._product = null;
      }
    }

    // v1.6.0: When unit changes (base → pack atau sebaliknya), recalc unit_price + unit_hpp
    if (field === 'unit') {
      const match = newItems[idx]._product || products.find(p => p.name?.toLowerCase() === newItems[idx].product_name?.toLowerCase());
      if (match) {
        const wasPackUnit = isPackUnit(newItems[idx].unit, match);
        const isPack = isPackUnit(value, match);
        const packSize = parseInt(match.pack_size) || 1;
        const currentHppBase = wasPackUnit ? (newItems[idx].unit_hpp / packSize) : newItems[idx].unit_hpp;
        if (isPack) {
          // Switch ke pack unit → price per pack
          updated.unit_price = parseFloat(match.sell_price_pack) > 0
            ? parseFloat(match.sell_price_pack)
            : (parseFloat(match.sell_price) || 0) * packSize;
          updated.unit_hpp = currentHppBase * packSize;
        } else {
          // Switch ke base unit → price per pcs
          updated.unit_price = parseFloat(match.sell_price) || 0;
          updated.unit_hpp = currentHppBase;
        }
      }
    }

    // When batch is manually selected
    if (field === '_selected_batch') {
      const batches = itemBatches[idx] || [];
      const batch = batches.find(b => b.batch_no === value);
      if (batch) {
        const match = newItems[idx]._product || products.find(p => p.name?.toLowerCase() === newItems[idx].product_name?.toLowerCase());
        const isPack = match && isPackUnit(newItems[idx].unit, match);
        const packSize = parseInt(match?.pack_size) || 1;
        updated.unit_hpp = (parseFloat(batch.hna) || 0) * (isPack ? packSize : 1);
      }
    }

    // v1.7.0: Auto-resolve tier price saat qty/unit/product berubah
    if (['qty', 'unit', 'product_name'].includes(field)) {
      const productWithTiers = updated._product;
      if (productWithTiers?.price_tiers?.length && updated.qty > 0) {
        const tierPrice = resolveTierPrice(updated.qty, updated.unit, productWithTiers.price_tiers);
        if (tierPrice !== null) {
          updated.unit_price = tierPrice;
          updated._tier_applied = true;
        } else {
          updated._tier_applied = false;
        }
      } else {
        updated._tier_applied = false;
      }
    }

    newItems[idx] = updated;
    setItems(newItems);
  };

  const grandTotal = items.reduce((sum, it) => sum + (it.qty || 0) * (it.unit_price || 0), 0);

  const inputStyle = {
    width: '100%', padding: '10px 12px', border: `1px solid ${border}`,
    borderRadius: '10px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7',
    color: text, fontSize: '14px', outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ padding: isMobile ? '1rem' : '2rem', paddingTop: isMobile ? '4rem' : '2rem', backgroundColor: bg, minHeight: '100vh', transition: 'margin-left 0.3s' }}>
      <Breadcrumb title="Nota Penjualan" isMobile={isMobile} isDarkMode={isDarkMode} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: '700', margin: 0, color: text }}>🧾 Nota Penjualan</h1>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: sub }}>{loading ? <Skeleton width="140px" height="14px" /> : `${orders.length} nota tercatat`}</p>
        </div>
        <button onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 18px', backgroundColor: '#34C759', color: '#FFF', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>
          <Plus size={18} /> Buat Nota
        </button>
      </div>

      {/* Search & Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '300px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: sub }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nomor nota atau customer..."
            style={{ ...inputStyle, paddingLeft: '36px' }} />
        </div>
        
        {/* v1.7.1 filter selects: fixed width override inputStyle's width:100% (sebelumnya stack vertical) + ellipsis */}
        <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={{ ...inputStyle, width: '170px', flex: '0 0 auto', paddingRight: '32px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
          <option value="all">Semua Bulan</option>
          {['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'].map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>

        <select value={filterYear} onChange={e => setFilterYear(e.target.value)} style={{ ...inputStyle, width: '130px', flex: '0 0 auto', paddingRight: '32px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
          <option value="all">Semua Tahun</option>
          {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inputStyle, width: '170px', flex: '0 0 auto', paddingRight: '32px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
          <option value="all">Semua Status</option>
          <option value="unpaid">Belum Bayar</option>
          <option value="paid">Sudah Lunas</option>
        </select>

        <select value={filterChannel} onChange={e => setFilterChannel(e.target.value)} style={{ ...inputStyle, width: '170px', flex: '0 0 auto', paddingRight: '32px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
          <option value="all">Semua Saluran</option>
          <option value="offline">🏪 Offline</option>
          <option value="online">🛒 Online</option>
        </select>
      </div>

      {/* v1.7.0 Multi-select action bar */}
      {selectedNotaIds.size > 0 && (
        <div style={{
          position: 'sticky', top: '10px', zIndex: 10, marginBottom: '10px',
          padding: '12px 16px', background: '#007AFF', color: '#FFF',
          borderRadius: '10px', boxShadow: '0 4px 12px rgba(0, 122, 255, 0.3)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
        }}>
          <span style={{ fontSize: '13px', fontWeight: '700' }}>
            📊 {selectedNotaIds.size} nota dipilih
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setSelectedNotaIds(new Set())} disabled={exportingPdf} style={{
              padding: '8px 14px', background: 'rgba(255,255,255,0.2)', color: '#FFF',
              border: '1px solid rgba(255,255,255,0.3)', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '12px',
            }}>Batal</button>
            <button onClick={handleExportPdfLaporan} disabled={exportingPdf} style={{
              padding: '8px 16px', background: '#FFF', color: '#007AFF',
              border: 'none', borderRadius: '8px', cursor: exportingPdf ? 'wait' : 'pointer',
              fontWeight: '700', fontSize: '12px', opacity: exportingPdf ? 0.7 : 1,
            }}>{exportingPdf ? 'Generating...' : '📄 Export Laporan PDF'}</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '12px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '640px' }}>
          <thead>
            <tr style={{ backgroundColor: isDarkMode ? '#1C1C1E' : '#F5F5F7' }}>
              <th style={{ padding: '12px 8px', textAlign: 'center', width: '36px', borderBottom: `1px solid ${border}` }}>
                <input type="checkbox"
                  checked={filtered.length > 0 && filtered.every(o => selectedNotaIds.has(o.id))}
                  onChange={() => toggleSelectAllVisible(filtered)}
                  title="Select all visible"
                  style={{ cursor: 'pointer' }} />
              </th>
              {[
                { label: 'No. Nota', key: 'order_number', sortable: true },
                { label: 'Tanggal', key: 'sale_date', sortable: true },
                { label: 'Customer', key: null, sortable: false },
                { label: 'Total', key: 'total', sortable: true },
                { label: 'Bayar', key: null, sortable: false },
                { label: 'Status Doc', key: null, sortable: false },
                { label: 'Aksi', key: null, sortable: false },
              ].map(({ label, key, sortable }) => {
                const isActive = sortable && sortKey === key;
                const SortIcon = !sortable ? null : (!isActive ? ChevronsUpDown : (sortDir === 'asc' ? ChevronUp : ChevronDown));
                return (
                  <th key={label}
                    onClick={() => sortable && toggleSort(key)}
                    aria-sort={!sortable ? 'none' : isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    style={{
                      padding: '12px 14px', textAlign: 'left', fontWeight: '700',
                      color: isActive ? '#007AFF' : sub,
                      fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em',
                      borderBottom: `1px solid ${border}`,
                      cursor: sortable ? 'pointer' : 'default',
                      userSelect: 'none',
                    }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      {label}
                      {SortIcon && <SortIcon size={12} style={{ opacity: isActive ? 1 : 0.4 }} />}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${border}` }}>
                  <td style={{ padding: '12px 8px' }}><Skeleton width="16px" height="16px" /></td>
                  <td style={{ padding: '12px 14px' }}><Skeleton width="80px" height="16px" /></td>
                  <td style={{ padding: '12px 14px' }}><Skeleton width="90px" height="16px" /></td>
                  <td style={{ padding: '12px 14px' }}><Skeleton width="120px" height="16px" /></td>
                  <td style={{ padding: '12px 14px' }}><Skeleton width="70px" height="16px" /></td>
                  <td style={{ padding: '12px 14px' }}><Skeleton width="50px" height="16px" /></td>
                  <td style={{ padding: '12px 14px' }}><Skeleton width="60px" height="20px" /></td>
                  <td style={{ padding: '12px 14px' }}><Skeleton width="80px" height="16px" /></td>
                </tr>
              ))
            ) : (
              filtered.map(o => (
                <React.Fragment key={o.id}>
                  <tr style={{ borderBottom: `1px solid ${border}`, cursor: 'pointer', backgroundColor: selectedNotaIds.has(o.id) ? (isDarkMode ? '#007AFF15' : '#007AFF08') : 'transparent' }} onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}>
                    <td style={{ padding: '12px 8px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedNotaIds.has(o.id)} onChange={() => toggleNotaSelect(o.id)} style={{ cursor: 'pointer' }} />
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: '600', color: '#007AFF' }}>{o.order_number}</td>
                    <td style={{ padding: '12px 14px', color: text }}>{fmtDate(o.sale_date)}</td>
                    <td style={{ padding: '12px 14px', color: text }}>
                      <div>{o.customer_name}</div>
                      <span style={{ fontSize: '9px', fontWeight: '700', padding: '1px 5px', borderRadius: '3px',
                        backgroundColor: o.channel === 'online' ? '#007AFF15' : '#8E8E9315',
                        color: o.channel === 'online' ? '#007AFF' : '#8E8E93' }}>
                        {o.channel === 'online' ? '🛒 ONLINE' : '🏪 OFFLINE'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: '600', color: text }}>{fmtRp(o.total)}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); openPaymentModal(o); }}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        <span style={{ fontSize: '10px', fontWeight: '800', padding: '4px 10px', borderRadius: '6px',
                          backgroundColor: o.payment_status === 'paid' ? '#34C75925' : '#FF3B3015',
                          color: o.payment_status === 'paid' ? '#34C759' : '#FF3B30',
                          border: `1px solid ${o.payment_status === 'paid' ? '#34C75930' : '#FF3B3020'}` }}>
                          {o.payment_status === 'paid' ? 'LUNAS' : 'BELUM BAYAR'}
                        </span>
                      </button>
                      {o.paid_at && (
                        <p
                          style={{ margin: '4px 0 0', fontSize: '9px', color: sub, cursor: 'pointer' }}
                          onClick={(e) => { e.stopPropagation(); openPaymentModal(o); }}
                        >
                          {fmtDate(o.paid_at)} ✏️
                        </p>
                      )}
                      {o.payment_status !== 'paid' && o.due_date && (() => {
                        const diff = notaDaysDiff(o.due_date);
                        if (diff === null) return null;
                        if (diff < 0) return <p style={{ margin: '4px 0 0', fontSize: '9px', fontWeight: '700', color: '#FF3B30', animation: 'habil-pulse 1.2s ease-in-out infinite' }}>Terlambat {Math.abs(diff)}h</p>;
                        if (diff <= 3) return <p style={{ margin: '4px 0 0', fontSize: '9px', fontWeight: '700', color: '#FF9500' }}>JT {diff}h lagi</p>;
                        return <p style={{ margin: '4px 0 0', fontSize: '9px', color: sub }}>JT: {fmtDate(o.due_date)}</p>;
                      })()}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px',
                        backgroundColor: o.status === 'final' ? '#007AFF18' : '#8E8E9318',
                        color: o.status === 'final' ? '#007AFF' : '#8E8E93' }}>
                        {o.status === 'final' ? 'Final' : 'Draft'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <button onClick={(e) => { e.stopPropagation(); openPrintOptions(o); }} aria-label={`Cetak nota ${o.order_number}`} title="Cetak PDF" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><FileText size={15} color="#34C759" /></button>
                        <button onClick={(e) => { e.stopPropagation(); openEdit(o); }} aria-label={`Edit nota ${o.order_number}`} title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><Edit2 size={15} color="#007AFF" /></button>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(o.id); }} aria-label={`Hapus nota ${o.order_number}`} title="Hapus" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><Trash2 size={15} color="#FF3B30" /></button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === o.id && o.items?.length > 0 && (
                    <tr>
                      <td colSpan={8} style={{ padding: '0 14px 14px', backgroundColor: isDarkMode ? '#0A0A0A' : '#FAFAFA' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '8px', fontSize: '12px' }}>
                          <thead><tr>
                            {['Produk', 'Qty', 'Satuan', 'HPP', 'Harga', 'Subtotal'].map(h => (
                              <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: '600', color: sub, borderBottom: `1px solid ${border}` }}>{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {o.items.map((it, idx) => (
                              <tr key={idx}>
                                <td style={{ padding: '6px 10px', color: text }}>{it.product_name}</td>
                                <td style={{ padding: '6px 10px', color: text }}>{it.qty}</td>
                                <td style={{ padding: '6px 10px', color: sub }}>{it.unit}</td>
                                <td style={{ padding: '6px 10px', color: sub }}>{fmtRp(it.unit_hpp)}</td>
                                <td style={{ padding: '6px 10px', color: text }}>{fmtRp(it.unit_price)}</td>
                                <td style={{ padding: '6px 10px', fontWeight: '600', color: text }}>{fmtRp(it.subtotal)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {o.notes && <p style={{ margin: '8px 0 0', fontSize: '12px', color: sub }}>📝 {o.notes}</p>}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
            {!loading && !filtered.length && (
              <tr><td colSpan={8} style={{ padding: '2.5rem 1rem', textAlign: 'center', color: sub }}>
                {search || filterMonth !== 'all' || filterYear !== 'all' || filterStatus !== 'all' || filterChannel !== 'all'
                  ? 'Tidak ada nota yang cocok dengan filter.'
                  : 'Belum ada nota penjualan.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div onClick={() => setShowModal(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()} className="glass-target glass-target--clear" style={{ backgroundColor: cardBg, borderRadius: '16px', width: '100%', maxWidth: '640px', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 32px 64px rgba(0,0,0,0.35)' }}>
            {/* Header */}
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, backgroundColor: cardBg, zIndex: 1 }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: text }}>{editId ? '✏️ Edit Nota' : '🧾 Buat Nota Baru'}</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color={sub} /></button>
            </div>

            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              {!editId && (
                <div>
                  <label style={labelStyle}>Nomor Nota *</label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      value={notaCounter.prefix}
                      disabled
                      style={{ ...inputStyle, width: '130px', backgroundColor: isDarkMode ? '#333' : '#F5F5F7', opacity: 0.7, fontWeight: '600', textAlign: 'center' }}
                    />
                    <input
                      ref={numberInputRef}
                      value={isAutoNota
                        ? (notaCounter.next_preview
                            ? notaCounter.next_preview.replace(notaCounter.prefix, '')
                            : String((notaCounter.month_max || 0) + 1).padStart(3, '0'))
                        : manualNumber}
                      onChange={e => !isAutoNota && setManualNumber(e.target.value.replace(/\D/g, ''))}
                      disabled={isAutoNota}
                      placeholder="2605001"
                      style={{ ...inputStyle, flex: 1, backgroundColor: isAutoNota ? (isDarkMode ? '#333' : '#F5F5F7') : cardBg, opacity: isAutoNota ? 0.7 : 1 }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const newMode = !isAutoNota;
                        setIsAutoNota(newMode);
                        if (!newMode) {
                          // v1.8.2: kalau switch ke manual, prefill dgn next_preview YYMM logic
                          const previewNum = notaCounter.next_preview
                            ? notaCounter.next_preview.replace(notaCounter.prefix, '')
                            : String((notaCounter.month_max || 0) + 1).padStart(3, '0');
                          setManualNumber(previewNum);
                          setTimeout(() => {
                            if (numberInputRef.current) {
                              numberInputRef.current.focus();
                              numberInputRef.current.select();
                            }
                          }, 50);
                        } else {
                          setManualNumber('');
                        }
                      }}
                      style={{
                        padding: '10px 14px', borderRadius: '8px', border: `1px solid ${border}`,
                        backgroundColor: isAutoNota ? '#E8F5E9' : '#FFF3E0', color: isAutoNota ? '#2E7D32' : '#E65100',
                        fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', minWidth: '110px', justifyContent: 'center'
                      }}
                    >
                      {isAutoNota ? '🔒 Auto' : '🔓 Manual'}
                    </button>
                  </div>
                  {!isAutoNota && <p style={{ fontSize: '10px', color: '#E65100', marginTop: '4px' }}>Mode Manual: Counter sistem tidak akan bertambah.</p>}
                  {saveError && <p style={{ fontSize: '12px', color: '#FF3B30', marginTop: '6px', fontWeight: '500' }}>{saveError}</p>}
                </div>
              )}
              {editId && (
                <div>
                  <label style={labelStyle}>Nomor Nota</label>
                  <input value={form.order_number} disabled style={{...inputStyle, opacity: 0.6}} />
                </div>
              )}

              {/* Customer */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: formErrors.customer_name ? '#FF3B30' : sub, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Customer *</label>
                <div style={formErrors.customer_name ? { border: '2px solid #FF3B30', borderRadius: '10px' } : {}}>
                  <MasterSelect 
                    value={form.customer_name} 
                    onChange={v => {
                      setForm(p => ({ ...p, customer_name: v }));
                      setFormErrors(e => ({ ...e, customer_name: undefined }));
                      const match = customers.find(c => c.name === v);
                      if (match) setForm(p => ({ ...p, customer_address: match.address || '' }));
                    }} 
                    options={customers}
                    onAdd={handleAddCustomer}
                    onRemove={handleRemoveCustomer}
                    onRename={handleRenameCustomer}
                    placeholder="Pilih atau tambah customer..."
                    isDarkMode={isDarkMode}
                  />
                </div>
                {formErrors.customer_name && <p style={{ color: '#FF3B30', fontSize: '12px', margin: '4px 0 0', fontWeight: 500 }}>{formErrors.customer_name}</p>}
              </div>

              {/* Address */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: sub, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Alamat</label>
                <input value={form.customer_address} onChange={e => setForm(p => ({ ...p, customer_address: e.target.value }))} placeholder="Alamat" style={inputStyle} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Tanggal</label>
                  <input type="date" value={form.sale_date} onChange={e => setForm(p => ({ ...p, sale_date: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Metode Pembayaran</label>
                  <select value={form.payment_method} onChange={e => {
                    const v = e.target.value;
                    setForm(p => ({
                      ...p,
                      payment_method: v,
                      // v1.8.1: Tunai → auto-clear due_date (gak ada tempo untuk cash)
                      ...(v === 'Tunai' ? { due_date: '', payment_terms: null } : {})
                    }));
                  }} style={inputStyle}>
                    <option value="Tunai">Tunai</option>
                    <option value="Transfer">Transfer</option>
                    <option value="QRIS">QRIS</option>
                  </select>
                </div>
              </div>

              {/* Tempo Pembayaran — v1.8.1: hide kalau Tunai (cash gak ada tempo) */}
              {form.payment_method !== 'Tunai' ? (
                <div>
                  <label style={labelStyle}>Tempo Pembayaran (Jatuh Tempo)</label>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    {[7,14,30].map(n => {
                      const target = addDays(form.sale_date, n);
                      const active = form.due_date === target && form.payment_terms === n;
                      return (
                        <button key={n} type="button"
                          onClick={() => setForm(p => ({ ...p, due_date: target, payment_terms: n }))}
                          style={{ padding: '6px 14px', fontSize: '12px', fontWeight: '700', borderRadius: '8px', border: `1px solid ${active ? '#007AFF' : (isDarkMode ? '#3A3A3C' : '#D1D1D6')}`, backgroundColor: active ? '#007AFF' : 'transparent', color: active ? '#FFF' : (isDarkMode ? '#ABABAB' : '#555'), cursor: 'pointer' }}>
                          {n} hari
                        </button>
                      );
                    })}
                  </div>
                  <input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value, payment_terms: null }))} style={{ ...inputStyle, fontSize: '12px' }} placeholder="Atau pilih tanggal manual" />
                </div>
              ) : (
                <div style={{ padding: '10px 12px', background: isDarkMode ? '#1C1C1E' : '#F5F5F7', borderRadius: '10px', border: `1px dashed ${isDarkMode ? '#3A3A3C' : '#D1D1D6'}` }}>
                  <p style={{ margin: 0, fontSize: '11px', color: sub }}>
                    Pembayaran <strong>Tunai</strong> — tidak ada tempo. Ganti metode (Transfer / QRIS) kalau perlu jatuh tempo.
                  </p>
                </div>
              )}

              <div>
                <label style={labelStyle}>Saluran Penjualan</label>
                <select value={form.channel} onChange={e => setForm(p => ({ ...p, channel: e.target.value }))} style={inputStyle}>
                  <option value="offline">🏪 Offline</option>
                  <option value="online">🛒 Online / Marketplace</option>
                </select>
              </div>

              {/* Items */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: sub, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Produk</label>
                
                {/* Column Headers */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 60px 45px 80px 100px 30px', gap: '6px', marginBottom: '8px', alignItems: 'center' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: sub }}>Nama</div>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: sub, textAlign: 'center' }}>Qty</div>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: sub, textAlign: 'center' }}>Unit</div>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: sub, textAlign: 'center' }}>HPP</div>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: sub, textAlign: 'center' }}>Harga</div>
                  <div></div>
                </div>
                
                {items.map((it, idx) => {
                  const batches = itemBatches[idx] || [];
                  const product = it._product || products.find(p => p.name?.toLowerCase() === it.product_name?.toLowerCase());
                  const unitOptions = getProductUnits(product);
                  const showConversion = product && isPackUnit(it.unit, product) && it.qty > 0;
                  return (
                    <div key={idx} style={{ marginBottom: '10px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 60px 70px 80px 100px 30px', gap: '6px', alignItems: 'center' }}>
                        <MasterSelect
                          value={it.product_name}
                          onChange={v => updateItem(idx, 'product_name', v)}
                          options={products.map(p => ({ name: p.name }))}
                          onAdd={handleAddProduct}
                          onRemove={handleRemoveProduct}
                          onRename={handleRenameProduct}
                          isDarkMode={isDarkMode}
                          placeholder="Nama produk"
                        />
                        <input type="number" value={it.qty} onChange={e => updateItem(idx, 'qty', parseInt(e.target.value) || 0)} min="1" style={{ ...inputStyle, fontSize: '13px', padding: '8px 6px', textAlign: 'center' }} />
                        <select value={it.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} style={{ ...inputStyle, fontSize: '12px', padding: '8px 4px' }}>
                          {unitOptions.map((u, i) => <option key={`${u.value}-${i}`} value={u.value}>{u.value}</option>)}
                        </select>
                        <input type="number" value={it.unit_hpp} onChange={e => updateItem(idx, 'unit_hpp', parseFloat(e.target.value) || 0)} min="0" placeholder="0" style={{ ...inputStyle, fontSize: '12px', padding: '8px 6px', backgroundColor: isDarkMode ? '#1C1C1E' : '#EBEBEB', border: `1px dashed ${border}`, textAlign: 'center' }} />
                        <input type="number" value={it.unit_price} onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)} min="0" placeholder="0" style={{ ...inputStyle, fontSize: '13px', padding: '8px 6px', textAlign: 'center' }} />
                        {items.length > 1 && (
                          <button onClick={() => removeItem(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}><Trash2 size={14} color="#FF3B30" /></button>
                        )}
                      </div>
                      {showConversion && (
                        <p style={{ margin: '4px 0 0 4px', fontSize: '11px', color: sub }}>📐 {formatQtyWithConversion(it.qty, it.unit, product)}</p>
                      )}
                      {it._tier_applied && (
                        <p style={{ margin: '4px 0 0 4px', fontSize: '11px', color: '#34C759', fontWeight: '600' }}>🏷️ Harga grosir tier diaplikasikan</p>
                      )}
                      {batches.length > 0 && (
                        <div style={{ marginTop: '4px', paddingLeft: '2px' }}>
                          <select value={it._selected_batch || ''} onChange={e => updateItem(idx, '_selected_batch', e.target.value)}
                            style={{ ...inputStyle, fontSize: '11px', padding: '5px 8px', backgroundColor: isDarkMode ? '#1C1C1E' : '#F0F8FF', border: `1px solid #007AFF40`, color: '#007AFF' }}>
                            {batches.map(b => (
                              <option key={b.batch_no} value={b.batch_no}>
                                Batch: {b.batch_no} | ED: {b.expired_date ? new Date(b.expired_date).toLocaleDateString('id-ID', {day:'2-digit',month:'short',year:'numeric'}) : '-'} | Stok: {b.qty_current} | HNA: {new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0}).format(b.hna)}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}

                <button onClick={addItem} style={{ fontSize: '13px', color: '#007AFF', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600', marginTop: '4px' }}>+ Tambah Produk</button>
              </div>

              {/* Notes */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: sub, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Catatan</label>
                <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Opsional..." style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
              </div>

              {/* Total */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: `1px solid ${border}` }}>
                <span style={{ fontSize: '14px', fontWeight: '600', color: sub }}>Grand Total</span>
                <span style={{ fontSize: '18px', fontWeight: '800', color: '#34C759' }}>{fmtRp(grandTotal)}</span>
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: '10px' }}>
                {formErrors.items && <p style={{ color: '#FF3B30', fontSize: '12px', margin: '0 0 8px', fontWeight: 500, textAlign: 'center' }}>{formErrors.items}</p>}
                <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: '13px', backgroundColor: saving ? '#86868B' : '#34C759', color: '#FFF', border: 'none', borderRadius: '10px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '14px', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Menyimpan...' : (editId ? 'Simpan Perubahan' : 'Buat Nota')}
                </button>
                <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: '13px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', color: text, border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
                  Batal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print Options Modal */}
      {showPrintModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div className="glass-target glass-target--clear" style={{ backgroundColor: cardBg, width: '100%', maxWidth: '360px', borderRadius: '20px', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', margin: 0, color: text }}>Opsi Cetak</h2>
              <button onClick={() => setShowPrintModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: sub }}><X size={20} /></button>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ ...labelStyle, marginBottom: '12px' }}>Ukuran Kertas</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                {['A5', 'A6'].map(f => (
                  <button key={f} onClick={() => setPrintOptions({ ...printOptions, format: f })}
                    style={{ flex: 1, padding: '12px', borderRadius: '12px', border: `2px solid ${printOptions.format === f ? '#007AFF' : border}`, 
                             backgroundColor: printOptions.format === f ? '#007AFF10' : 'transparent', color: printOptions.format === f ? '#007AFF' : text,
                             fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                    <span style={{ fontSize: '15px' }}>{f}</span>
                    {f === 'A5' && <span style={{ fontSize: '9px', fontWeight: '500', opacity: 0.8 }}>(Landscape)</span>}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ ...labelStyle, marginBottom: '12px' }}>Tipe Dokumen</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '10px', borderRadius: '10px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7' }}>
                  <input type="radio" checked={printOptions.type === 'nota'} onChange={() => setPrintOptions({ ...printOptions, type: 'nota' })} />
                  <span style={{ fontSize: '14px', color: text }}>Nota Penjualan</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: (printOptions.format === 'A6' ? 'pointer' : 'not-allowed'), opacity: (printOptions.format === 'A6' ? 1 : 0.5), padding: '10px', borderRadius: '10px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7' }}>
                  <input type="radio" checked={printOptions.type === 'terima'} disabled={printOptions.format !== 'A6'} onChange={() => setPrintOptions({ ...printOptions, type: 'terima' })} />
                  <span style={{ fontSize: '14px', color: text }}>Tanda Terima (Khusus A6)</span>
                </label>
              </div>
            </div>

            <button onClick={handlePrintPDF} disabled={pdfLoading} style={{ width: '100%', padding: '14px', backgroundColor: '#007AFF', color: '#FFF', border: 'none', borderRadius: '14px', cursor: pdfLoading ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '15px', opacity: pdfLoading ? 0.7 : 1 }}>
              {pdfLoading ? 'Membuat PDF...' : 'Cetak Sekarang'}
            </button>
          </div>
        </div>
      )}

      {/* Payment Date Modal */}
      {paymentModal.open && (
        <div onClick={() => setPaymentModal({ open: false, order: null, date: '', mode: 'pay' })} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, backdropFilter: 'blur(4px)' }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: cardBg, width: '100%', maxWidth: '360px', borderRadius: '20px', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: text }}>
                {paymentModal.mode === 'edit' ? '✏️ Edit Tanggal Pelunasan' : '💰 Konfirmasi Pelunasan'}
              </h3>
              <button onClick={() => setPaymentModal({ open: false, order: null, date: '', mode: 'pay' })} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color={sub} /></button>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Tanggal Pelunasan</label>
              <input
                type="date"
                value={paymentModal.date}
                onChange={e => setPaymentModal(p => ({ ...p, date: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                onClick={handlePaymentSave}
                disabled={paymentSaving || !paymentModal.date}
                style={{ width: '100%', padding: '13px', backgroundColor: paymentSaving ? '#86868B' : '#34C759', color: '#FFF', border: 'none', borderRadius: '10px', cursor: paymentSaving ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '14px' }}
              >
                {paymentSaving ? 'Menyimpan...' : 'Simpan'}
              </button>
              {paymentModal.mode === 'edit' && (
                <button
                  onClick={handlePaymentUnpay}
                  disabled={paymentSaving}
                  style={{ width: '100%', padding: '13px', backgroundColor: 'transparent', color: '#FF3B30', border: '1px solid #FF3B30', borderRadius: '10px', cursor: paymentSaving ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '14px' }}
                >
                  Batalkan Pelunasan
                </button>
              )}
              <button
                onClick={() => setPaymentModal({ open: false, order: null, date: '', mode: 'pay' })}
                disabled={paymentSaving}
                style={{ width: '100%', padding: '13px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', color: text, border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      <ConfirmModal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={confirmDelete}
        title="Hapus Nota"
        message="Apakah Anda yakin ingin menghapus nota ini? Tindakan ini tidak dapat dibatalkan."
        isDarkMode={isDarkMode}
      />

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', backgroundColor: '#34C759', color: '#FFF', padding: '12px 20px', borderRadius: '10px', fontWeight: '600', fontSize: '14px', boxShadow: '0 8px 24px rgba(0,0,0,0.2)', zIndex: 99999 }}>
          ✅ {toast}
        </div>
      )}
    </div>
  );
}
