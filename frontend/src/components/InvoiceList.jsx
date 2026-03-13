import React, { useState, useEffect, useCallback, useRef } from 'react';
import { invoicesAPI, distributorsAPI, productsAPI, auditAPI } from '../services/api';
import { Plus, X, Trash2, RotateCcw, Search, AlertTriangle, Clock, FileText, ChevronLeft, ChevronRight, History } from 'lucide-react';
import MasterSelect from './MasterSelect';
import Skeleton from './common/Skeleton';

// ─── Helpers ────────────────────────────────────────────────────────────────
const parseNum = (v) => {
  if (v === '' || v == null) return 0;
  return parseFloat(String(v).replace(/[^0-9.]/g, '')) || 0;
};
const formatRp = (n, cents = false) => {
  if (!n && n !== 0) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(parseFloat(n));
};
const formatRpInput = (n) => {
  const x = Math.floor(parseFloat(n));
  if (isNaN(x) || n === '' || n == null) return '';
  return x.toLocaleString('id-ID');
};
const parseLocalDate = (dateStr) => {
  if (!dateStr) return null;
  const s = typeof dateStr === 'string' ? dateStr.split('T')[0] : dateStr;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const formatLocalDate = (dateStr, opts) => {
  const d = parseLocalDate(dateStr);
  if (!d) return '';
  return d.toLocaleDateString('id-ID', opts);
};
// Warna per distributor — auto-assign dari palette
const DIST_COLORS = [
  { bg: '#007AFF20', border: '#007AFF50', text: '#007AFF', dot: '#007AFF' },
  { bg: '#34C75920', border: '#34C75950', text: '#34C759', dot: '#34C759' },
  { bg: '#FF950020', border: '#FF950050', text: '#FF9500', dot: '#FF9500' },
  { bg: '#AF52DE20', border: '#AF52DE50', text: '#AF52DE', dot: '#AF52DE' },
  { bg: '#FF375F20', border: '#FF375F50', text: '#FF375F', dot: '#FF375F' },
  { bg: '#00C7BE20', border: '#00C7BE50', text: '#00C7BE', dot: '#00C7BE' },
  { bg: '#30B0C720', border: '#30B0C750', text: '#30B0C7', dot: '#30B0C7' },
  { bg: '#FFCC0020', border: '#FFCC0050', text: '#B8860B', dot: '#FFCC00' },
];
const getDistColor = (name, allNames) => {
  const idx = allNames.indexOf(name);
  return DIST_COLORS[idx % DIST_COLORS.length];
};

const daysDiff = (dateStr) => {
  if (!dateStr) return null;
  const d = parseLocalDate(dateStr);
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.ceil((d - now) / 86400000);
};
const blankItem = () => ({
  _id: Math.random().toString(36).slice(2),
  product_name: '', expired_date: '', quantity: '', hna: '',
  hna_times_qty: 0, disc_percent: '', disc_nominal: 0, hna_baru: 0, hna_per_item: 0,
});
const blankForm = () => ({
  invoice_number: '', purchase_date: '', distributor_name: '',
  disc_cod_ada: false, disc_cod_amount: '', disc_cod_percent: '',
  due_date: '', payment_date: '', status: 'Pending',
});
const calcItem = (item, disc_cod_per_item = 0) => {
  const qty = parseNum(item.quantity);
  const hna = parseNum(item.hna);
  const hna_times_qty = hna * qty;
  const disc_percent = parseNum(item.disc_percent);
  const disc_nominal = hna_times_qty * (disc_percent / 100);
  const hna_baru = hna_times_qty - disc_nominal;
  const hna_after_cod = hna_baru - disc_cod_per_item;
  const hna_per_item = qty > 0 ? hna_baru / qty : 0;
  const hpp_inc_ppn = qty > 0 ? (hna_after_cod / qty) * 1.11 : 0;
  return { ...item, hna_times_qty, disc_nominal, hna_baru, hna_per_item, disc_cod_per_item, hna_after_cod, hpp_inc_ppn };
};
const calcTotals = (items, form) => {
  const total_hna = items.reduce((s, i) => s + i.hna_times_qty, 0);
  const hna_baru_total = items.reduce((s, i) => s + i.hna_baru, 0);
  // Disc COD: bisa pakai % atau nominal
  let disc_cod_amount = 0;
  if (form.disc_cod_ada) {
    if (form.disc_cod_percent && parseNum(form.disc_cod_percent) > 0) {
      disc_cod_amount = hna_baru_total * (parseNum(form.disc_cod_percent) / 100);
    } else {
      disc_cod_amount = parseNum(form.disc_cod_amount);
    }
  }
  // Distribusikan disc COD ke tiap item proporsional berdasarkan hna_baru
  const items_with_cod = items.map(i => {
    const ratio = hna_baru_total > 0 ? i.hna_baru / hna_baru_total : 0;
    const disc_cod_per_item = disc_cod_amount * ratio;
    return calcItem(i, disc_cod_per_item);
  });
  const hna_final = hna_baru_total - disc_cod_amount;
  const ppn_masukan = hna_final * 0.11;
  const ppn_pembulatan = Math.floor(ppn_masukan);
  const hna_plus_ppn = hna_final + ppn_masukan;
  const totalQty = items.reduce((s, i) => s + parseNum(i.quantity), 0);
  const harga_per_produk = totalQty > 0 ? hna_plus_ppn / totalQty : 0;
  const discount_amount = items.reduce((s, i) => s + i.disc_nominal, 0);
  return { total_hna, discount_amount, hna_baru: hna_baru_total, disc_cod_amount, hna_final, ppn_masukan, ppn_pembulatan, hna_plus_ppn, harga_per_produk, items_with_cod };
};
const getDueStatus = (due_date, status) => {
  if (status === 'Paid' || !due_date) return null;
  const diff = daysDiff(due_date);
  if (diff < 0) return { label: `Terlambat ${Math.abs(diff)}h`, color: '#FF3B30', bg: '#FF3B3020' };
  if (diff <= 3) return { label: `Jatuh tempo ${diff}h lagi`, color: '#FF9500', bg: '#FF950020' };
  if (diff <= 7) return { label: `${diff}h lagi`, color: '#FFCC00', bg: '#FFCC0020' };
  return null;
};

// ─── Sort helper ────────────────────────────────────────────────────────────
const sortData = (data, key, dir) => {
  if (!key) return data;
  return [...data].sort((a, b) => {
    let va = a[key], vb = b[key];
    if (['total_hna','hna_final','hna_plus_ppn','ppn_masukan'].includes(key)) {
      va = parseFloat(va) || 0; vb = parseFloat(vb) || 0;
    } else if (['purchase_date','due_date'].includes(key)) {
      va = va ? (parseLocalDate(va)?.getTime() || 0) : 0;
      vb = vb ? (parseLocalDate(vb)?.getTime() || 0) : 0;
    } else {
      va = String(va||'').toLowerCase(); vb = String(vb||'').toLowerCase();
    }
    if (va < vb) return dir === 'asc' ? -1 : 1;
    if (va > vb) return dir === 'asc' ? 1 : -1;
    return 0;
  });
};

// ═══════════════════════════════════════════════════════════════════════════════
export default function InvoiceList({ isDarkMode, isSidebarOpen }) {
  const [invoices, setInvoices] = useState([]);
  const [filteredInvoices, setFilteredInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [distributors, setDistributors] = useState([]);
  const [products, setProducts] = useState([]);
  const [expandedRows, setExpandedRows] = useState({});
  const [showTrash, setShowTrash] = useState(false);
  const [trashItems, setTrashItems] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [draftBanner, setDraftBanner] = useState(false);
  const [savedDraft, setSavedDraft] = useState(null);
  const [dupConfirm, setDupConfirm] = useState(null);
  const [successToast, setSuccessToast] = useState('');
  const [auditModal, setAuditModal] = useState(null); // { invoiceId, invoiceNumber }
  const [auditLog, setAuditLog] = useState([]);

  const draftDebounceRef = useRef(null);

  // Sort
  const [sortKey, setSortKey] = useState('');
  const [sortDir, setSortDir] = useState('asc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Filters
  const [universalSearch, setUniversalSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [searchDist, setSearchDist] = useState('');
  const [searchInv, setSearchInv] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDue, setFilterDue] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // Rekap per distributor filters (independent)

  // Form
  const [form, setForm] = useState(blankForm());
  const [items, setItems] = useState([blankItem()]);
  const totals = calcTotals(items, form);

  useEffect(() => { fetchInvoices(); fetchDistributors(); fetchProducts(); checkDraft(); }, []);
  useEffect(() => {
    if (!showModal) return;
    if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current);
    draftDebounceRef.current = setTimeout(() => {
      invoicesAPI.saveDraft({ form, items }).catch(() => {});
    }, 1500);
    return () => clearTimeout(draftDebounceRef.current);
  }, [form, items, showModal]);

  const showToast = (msg) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(''), 3000);
  };

  const fetchInvoices = async () => {
    try {
      const r = await invoicesAPI.getAll();
      setInvoices(r.data);
      // Auto-expand all rows by default
      const allExpanded = {};
      r.data.forEach(inv => { allExpanded[inv.id] = true; });
      setExpandedRows(allExpanded);
    }
    catch (e) { console.error(e); } finally { setLoading(false); }
  };
  const fetchDistributors = async () => { try { const r = await distributorsAPI.getAll(); setDistributors(r.data); } catch(e){} };
  const fetchProducts = async () => { try { const r = await productsAPI.getAll(); setProducts(r.data); } catch(e){} };
  const fetchTrash = async () => { try { const r = await invoicesAPI.getTrash(); setTrashItems(r.data); } catch(e){} };
  const checkDraft = async () => {
    try {
      const r = await invoicesAPI.getDraft();
      if (r.data?.draft_data) { setSavedDraft(r.data.draft_data); setDraftBanner(true); }
    } catch(e) {}
  };

  const applyFilters = () => {
    let f = invoices;
    if (universalSearch.trim()) {
      const q = universalSearch.toLowerCase();
      f = f.filter(i =>
        i.invoice_number?.toLowerCase().includes(q) ||
        i.distributor_name?.toLowerCase().includes(q) ||
        i.status?.toLowerCase().includes(q) ||
        (i.product_names && i.product_names.toLowerCase().includes(q))
      );
    }
    if (selectedMonth !== 'all') f = f.filter(i => parseLocalDate(i.purchase_date)?.toLocaleString('id-ID', { month: 'long', year: 'numeric' }) === selectedMonth);
    if (searchDist) f = f.filter(i => i.distributor_name?.toLowerCase().includes(searchDist.toLowerCase()));
    if (searchInv) f = f.filter(i => i.invoice_number?.toLowerCase().includes(searchInv.toLowerCase()));
    if (filterStatus !== 'all') f = f.filter(i => i.status === filterStatus);
    if (filterDue === 'overdue') f = f.filter(i => { const d = daysDiff(i.due_date); return d !== null && d < 0 && i.status !== 'Paid'; });
    if (filterDue === 'soon') f = f.filter(i => { const d = daysDiff(i.due_date); return d !== null && d >= 0 && d <= 7 && i.status !== 'Paid'; });
    if (dateFrom) f = f.filter(i => parseLocalDate(i.purchase_date) >= parseLocalDate(dateFrom));
    if (dateTo) f = f.filter(i => parseLocalDate(i.purchase_date) <= parseLocalDate(dateTo));
    // Sort
    if (sortKey) {
      f = sortData(f, sortKey, sortDir);
    } else {
      f = [...f].sort((a, b) => {
        const da = daysDiff(a.due_date), db = daysDiff(b.due_date);
        if (da !== null && db !== null) return da - db;
        if (da !== null) return -1; if (db !== null) return 1;
        return new Date(b.purchase_date) - new Date(a.purchase_date);
      });
    }
    setFilteredInvoices(f);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const applyFiltersMemo = useCallback(applyFilters, [invoices, universalSearch, selectedMonth, searchDist, searchInv, filterStatus, filterDue, dateFrom, dateTo, sortKey, sortDir]);
  useEffect(() => { applyFiltersMemo(); setCurrentPage(1); }, [applyFiltersMemo]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const getUniqueMonths = () => {
    const s = new Set();
    invoices.forEach(i => s.add(parseLocalDate(i.purchase_date)?.toLocaleString('id-ID', { month: 'long', year: 'numeric' })));
    return Array.from(s).sort();
  };

  const overdueCount = invoices.filter(i => { const d = daysDiff(i.due_date); return d !== null && d < 0 && i.status !== 'Paid'; }).length;
  const soonCount = invoices.filter(i => { const d = daysDiff(i.due_date); return d !== null && d >= 0 && d <= 7 && i.status !== 'Paid'; }).length;

  // Pagination
  const totalPages = Math.ceil(filteredInvoices.length / pageSize);
  const paginatedInvoices = filteredInvoices.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Item handlers
  const updateItem = (idx, field, val) => {
    setItems(prev => { const n = [...prev]; n[idx] = calcItem({ ...n[idx], [field]: val }); return n; });
  };
  const addItem = () => setItems(prev => [...prev, blankItem()]);
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));
  const handleFormChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleAddDistributor = async (name) => {
    const res = await distributorsAPI.add(name);
    const saved = res.data.name;
    setDistributors(prev => prev.some(d => d.name === saved) ? prev : [...prev, { name: saved }].sort((a,b) => a.name.localeCompare(b.name)));
  };
  const handleRemoveDistributor = async (name) => { await distributorsAPI.remove(name); setDistributors(prev => prev.filter(d => d.name !== name)); };
  const handleAddProduct = async (name) => {
    const res = await productsAPI.add(name);
    const saved = res.data.name;
    setProducts(prev => prev.some(p => p.name === saved) ? prev : [...prev, { name: saved }].sort((a,b) => a.name.localeCompare(b.name)));
  };
  const handleRemoveProduct = async (name) => { await productsAPI.remove(name); setProducts(prev => prev.filter(p => p.name !== name)); };
  const handleRenameDistributor = async (oldName, newName) => {
    try {
      await distributorsAPI.rename(oldName, newName);
      setDistributors(prev => prev.map(d => d.name === oldName ? { ...d, name: newName } : d).sort((a,b) => a.name.localeCompare(b.name)));
      setInvoices(prev => prev.map(inv => inv.distributor_name === oldName ? { ...inv, distributor_name: newName } : inv));
    } catch(e) { alert('Gagal rename: ' + (e.response?.data?.error || e.message)); }
  };
  const handleRenameProduct = async (oldName, newName) => {
    try {
      await productsAPI.rename(oldName, newName);
      setProducts(prev => prev.map(p => p.name === oldName ? { ...p, name: newName } : p).sort((a,b) => a.name.localeCompare(b.name)));
    } catch(e) { alert('Gagal rename: ' + (e.response?.data?.error || e.message)); }
  };

  // Validate
  const validateForm = () => {
    if (!form.invoice_number?.trim()) return 'No Faktur wajib diisi';
    if (!form.purchase_date) return 'Tanggal Faktur wajib diisi';
    if (!form.distributor_name?.trim()) return 'Distributor wajib diisi';
    const validItems = items.filter(i => i.product_name.trim());
    if (validItems.length === 0) return 'Minimal 1 produk harus diisi';
    for (const i of validItems) {
      if (!parseNum(i.quantity) || parseNum(i.quantity) <= 0) return `QTY produk "${i.product_name}" harus lebih dari 0`;
      if (!parseNum(i.hna) || parseNum(i.hna) <= 0) return `HNA produk "${i.product_name}" harus lebih dari 0`;
    }
    if (form.due_date && form.purchase_date && new Date(form.due_date) < new Date(form.purchase_date)) {
      return 'Tanggal jatuh tempo tidak boleh sebelum tanggal faktur';
    }
    return null;
  };

  const buildPayload = () => {
    const itemsWithCod = totals.items_with_cod || items.map(i => ({...i, disc_cod_per_item: 0, hna_after_cod: i.hna_baru, hpp_inc_ppn: i.hna_per_item * 1.11}));
    return {
      ...form,
      ...totals,
      disc_cod_amount: totals.disc_cod_amount,
      items: items.filter(i => i.product_name.trim()).map(i => {
        const withCod = itemsWithCod.find(x => x._id === i._id) || i;
        return {
          product_name: i.product_name, expired_date: i.expired_date || null,
          quantity: parseNum(i.quantity), hna: parseNum(i.hna),
          unit_price: parseNum(i.hna), hna_times_qty: i.hna_times_qty,
          total_price: i.hna_times_qty, disc_percent: parseNum(i.disc_percent),
          disc_nominal: i.disc_nominal, hna_baru: i.hna_baru,
          hna_per_item: i.hna_per_item, margin: 0,
          disc_cod_per_item: withCod.disc_cod_per_item || 0,
          hna_after_cod: withCod.hna_after_cod || i.hna_baru,
          hpp_inc_ppn: withCod.hpp_inc_ppn || (i.hna_per_item * 1.11),
        };
      }),
    };
  };

  const handleSubmit = async () => {
    const err = validateForm();
    if (err) { alert(err); return; }

    const payload = buildPayload();
    const existing = invoices.find(inv => inv.invoice_number === form.invoice_number && inv.id !== editingId);
    if (existing && !editingId) {
      setDupConfirm({ invoiceNumber: form.invoice_number, existingId: existing.id, pendingPayload: payload });
      return;
    }
    await doSave(payload);
  };

  const doSave = async (payload) => {
    try {
      const isEdit = !!editingId;
      if (isEdit) await invoicesAPI.update(editingId, payload);
      else await invoicesAPI.create(payload);
      try { await invoicesAPI.clearDraft(); } catch(e) {}
      setSavedDraft(null); setDraftBanner(false);
      fetchInvoices(); fetchDistributors(); fetchProducts();
      resetForm(); setShowModal(false);
      showToast(isEdit ? '✅ Faktur berhasil diupdate!' : '✅ Faktur berhasil disimpan!');
    } catch (err) {
      alert('Error: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleDupOverwrite = async () => {
    if (!dupConfirm) return;
    try {
      await invoicesAPI.update(dupConfirm.existingId, dupConfirm.pendingPayload);
      try { await invoicesAPI.clearDraft(); } catch(e) {}
      setSavedDraft(null); setDraftBanner(false);
      fetchInvoices(); resetForm(); setShowModal(false); setDupConfirm(null);
      showToast('✅ Faktur berhasil diupdate!');
    } catch (err) { alert('Error: ' + (err.response?.data?.error || err.message)); }
  };

  const handleDupLoadExisting = async () => {
    if (!dupConfirm) return;
    const existingId = dupConfirm.existingId;
    setDupConfirm(null);
    try {
      const res = await invoicesAPI.getById(existingId);
      const { invoice, items: invItems } = res.data;
      setForm({
        invoice_number: invoice.invoice_number,
        purchase_date: invoice.purchase_date?.split('T')[0] || '',
        distributor_name: invoice.distributor_name,
        disc_cod_ada: invoice.disc_cod_ada || false,
        disc_cod_amount: invoice.disc_cod_amount || '',
        disc_cod_percent: '',
        due_date: invoice.due_date?.split('T')[0] || '',
        payment_date: invoice.payment_date?.split('T')[0] || '',
        status: invoice.status,
      });
      setItems(invItems.length > 0
        ? invItems.map(i => calcItem({ _id: Math.random().toString(36).slice(2), product_name: i.product_name||'', expired_date: i.expired_date?.split('T')[0]||'', quantity: i.quantity||'', hna: i.hna||i.unit_price||'', hna_times_qty: i.hna_times_qty||0, disc_percent: i.disc_percent||'', disc_nominal: i.disc_nominal||0, hna_baru: i.hna_baru||0, hna_per_item: i.hna_per_item||0 }))
        : [blankItem()]
      );
      setEditingId(existingId);
    } catch (err) { alert('Error loading invoice'); }
  };

  const handleEdit = async (inv) => {
    try {
      const res = await invoicesAPI.getById(inv.id);
      const { invoice, items: invItems } = res.data;
      setForm({
        invoice_number: invoice.invoice_number,
        purchase_date: invoice.purchase_date?.split('T')[0] || '',
        distributor_name: invoice.distributor_name,
        disc_cod_ada: invoice.disc_cod_ada || false,
        disc_cod_amount: invoice.disc_cod_amount || '',
        disc_cod_percent: '',
        due_date: invoice.due_date?.split('T')[0] || '',
        payment_date: invoice.payment_date?.split('T')[0] || '',
        status: invoice.status,
      });
      setItems(invItems.length > 0
        ? invItems.map(i => calcItem({ _id: Math.random().toString(36).slice(2), product_name: i.product_name||'', expired_date: i.expired_date?.split('T')[0]||'', quantity: i.quantity||'', hna: i.hna||i.unit_price||'', hna_times_qty: i.hna_times_qty||0, disc_percent: i.disc_percent||'', disc_nominal: i.disc_nominal||0, hna_baru: i.hna_baru||0, hna_per_item: i.hna_per_item||0 }))
        : [blankItem()]
      );
      setEditingId(inv.id); setShowModal(true);
    } catch (err) { alert('Error loading invoice'); }
  };

  const handleDeleteRequest = (inv) => setDeleteConfirm({ id: inv.id, name: inv.invoice_number });
  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    try { await invoicesAPI.softDelete(deleteConfirm.id); fetchInvoices(); setDeleteConfirm(null); showToast('🗑️ Faktur dipindahkan ke trash'); }
    catch(e) { alert('Error'); }
  };
  const handleRestore = async (id) => { try { await invoicesAPI.restore(id); fetchTrash(); fetchInvoices(); showToast('✅ Faktur berhasil direstore'); } catch(e){} };
  const handlePermanentDelete = async (id) => {
    if (!window.confirm('Hapus permanen? Tidak bisa di-undo.')) return;
    try { await invoicesAPI.permanentDelete(id); fetchTrash(); } catch(e) {}
  };

  const resetForm = () => { setForm(blankForm()); setItems([blankItem()]); setEditingId(null); };
  const loadDraft = () => {
    if (!savedDraft) return;
    if (savedDraft.form) setForm(savedDraft.form);
    if (savedDraft.items) setItems(savedDraft.items.map(i => calcItem(i)));
    setDraftBanner(false); setShowModal(true);
  };
  const dismissDraft = async () => {
    try { await invoicesAPI.clearDraft(); } catch(e) {}
    setSavedDraft(null); setDraftBanner(false);
  };

  const openAuditLog = async (inv) => {
    try {
      const r = await auditAPI.getByInvoice(inv.id);
      setAuditLog(r.data);
      setAuditModal({ invoiceId: inv.id, invoiceNumber: inv.invoice_number });
    } catch(e) { alert('Error loading audit log'); }
  };

  const summaryData = filteredInvoices.length > 0 ? filteredInvoices : invoices;
  const sumHna = summaryData.reduce((s, i) => s + parseFloat(i.total_hna||0), 0);
  const sumFinal = summaryData.reduce((s, i) => s + parseFloat(i.hna_final||i.final_hna||0), 0);
  const sumPpn = summaryData.reduce((s, i) => s + parseFloat(i.ppn_masukan||i.ppn_input||0), 0);

  // Per-distributor summary — always show ALL known distributors, 0 if none in period
  const rekapSource = selectedMonth === 'all' ? invoices : invoices.filter(i =>
    parseLocalDate(i.purchase_date)?.toLocaleString('id-ID', { month: 'long', year: 'numeric' }) === selectedMonth
  );
  const allKnownDist = [...new Set(invoices.map(i => i.distributor_name).filter(Boolean))];
  const rekapMap = rekapSource.reduce((acc, inv) => {
    const d = inv.distributor_name || 'Unknown';
    if (!acc[d]) acc[d] = { name: d, count: 0, total: 0 };
    acc[d].count++;
    acc[d].total += parseFloat(inv.hna_final||inv.final_hna||0);
    return acc;
  }, {});
  allKnownDist.forEach(d => { if (!rekapMap[d]) rekapMap[d] = { name: d, count: 0, total: 0 }; });
  const distSummary = Object.values(rekapMap).sort((a,b) => b.total - a.total);

  const S = {
    card: { backgroundColor: isDarkMode ? '#1C1C1E' : '#FFFFFF', border: `1px solid ${isDarkMode ? '#2C2C2E' : '#E5E5EA'}`, borderRadius: '12px' },
    input: { width: '100%', padding: '10px 12px', border: `1px solid ${isDarkMode ? '#3A3A3C' : '#D1D1D6'}`, borderRadius: '10px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', color: isDarkMode ? '#FFF' : '#000', fontSize: '14px', outline: 'none', boxSizing: 'border-box' },
    inputDis: { width: '100%', padding: '10px 12px', border: `1px solid ${isDarkMode ? '#2C2C2E' : '#E5E5EA'}`, borderRadius: '10px', backgroundColor: isDarkMode ? '#1C1C1E' : '#E5E5EA', color: isDarkMode ? '#636366' : '#8E8E93', cursor: 'not-allowed', fontSize: '14px', boxSizing: 'border-box' },
    label: { display: 'block', fontSize: '11px', fontWeight: '700', marginBottom: '6px', color: isDarkMode ? '#EBEBF0' : '#3A3A3C', letterSpacing: '0.05em', textTransform: 'uppercase' },
    computed: { width: '100%', padding: '10px 12px', border: `1px solid ${isDarkMode ? '#2C2C2E' : '#E5E5EA'}`, borderRadius: '10px', backgroundColor: isDarkMode ? '#1C1C1E' : '#E5E5EA', color: isDarkMode ? '#30D158' : '#1C7C2A', fontWeight: '600', cursor: 'not-allowed', fontSize: '14px', boxSizing: 'border-box' },
  };

  // if (loading) return <div style={{ padding: '2rem', marginLeft: isSidebarOpen ? '256px' : '80px' }}>Loading...</div>; (Removed early return to use skeletons)

  const SortIcon = ({ k }) => {
    if (sortKey !== k) return <span style={{ color: '#C7C7CC', marginLeft: '4px' }}>↕</span>;
    return <span style={{ color: '#007AFF', marginLeft: '4px' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div style={{ padding: '2rem', marginLeft: isSidebarOpen ? '256px' : '80px', backgroundColor: isDarkMode ? '#000' : '#F5F5F7', minHeight: '100vh', transition: 'margin-left 0.3s' }}>

      {/* Toast */}
      {successToast && (
        <div style={{ position: 'fixed', top: '24px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#34C759', color: 'white', padding: '12px 28px', borderRadius: '12px', fontWeight: '700', fontSize: '15px', zIndex: 9999, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', transition: 'all 0.3s' }}>
          {successToast}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: '700', margin: '0 0 4px 0', color: isDarkMode ? '#FFF' : '#000' }}>📄 Invoice Management</h1>
          <p style={{ margin: 0, fontSize: '14px', color: '#86868B' }}>Faktur Pembelian — CV Habil</p>
        </div>

      </div>

      {/* Draft Banner */}
      {draftBanner && savedDraft && (
        <div style={{ ...S.card, padding: '14px 18px', marginBottom: '1.25rem', backgroundColor: isDarkMode ? '#1C1C1E' : '#FFF9E6', borderColor: '#FF9500', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <FileText size={18} color="#FF9500" />
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: '700', fontSize: '14px', color: isDarkMode ? '#FFF' : '#000' }}>Ada draft tersimpan</span>
            <span style={{ fontSize: '13px', color: '#86868B', marginLeft: '8px' }}>dari sesi sebelumnya</span>
          </div>
          <button onClick={loadDraft} style={{ padding: '8px 16px', backgroundColor: '#FF9500', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}>Lanjutkan</button>
          <button onClick={dismissDraft} style={{ padding: '8px 16px', backgroundColor: 'transparent', color: '#86868B', border: `1px solid ${isDarkMode ? '#3A3A3C' : '#D1D1D6'}`, borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>Hapus Draft</button>
        </div>
      )}

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Total HNA*QTY', value: formatRp(sumHna), icon: '💰', color: '#30B0C0' },
          { label: 'Total PPN Masukan', value: formatRp(sumPpn, true), icon: '📊', color: '#FF9500' },
          { label: 'HNA Final', value: formatRp(sumFinal), icon: '📈', color: '#34C759' },
          { label: 'Jumlah Faktur', value: `${filteredInvoices.length} faktur`, icon: '📋', color: '#AF52DE' },
        ].map((m, i) => (
          <div key={i} style={{ ...S.card, padding: '1.25rem' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '6px' }}>{m.icon}</div>
            <p style={{ margin: '0 0 4px', fontSize: '11px', fontWeight: '700', color: '#86868B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.label}</p>
            {loading ? (
              <Skeleton width="100px" height="24px" />
            ) : (
              <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: m.color }}>{m.value}</p>
            )}
          </div>
        ))}
      </div>

      {/* Per-distributor summary */}
      {distSummary.length > 1 && (
        <div style={{ ...S.card, padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px', flexWrap: 'wrap' }}>
            <p style={{ margin: 0, fontSize: '11px', fontWeight: '700', color: '#86868B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>📦 Rekap per Distributor</p>
            {/* Month filter for rekap */}
            <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
              style={{ padding: '4px 10px', border: `1px solid ${isDarkMode ? '#3A3A3C' : '#D1D1D6'}`, borderRadius: '8px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', color: isDarkMode ? '#FFF' : '#000', fontSize: '12px', cursor: 'pointer', outline: 'none' }}>
              <option value="all">Semua Bulan</option>
              {Array.from(new Set(invoices.map(i => parseLocalDate(i.purchase_date)?.toLocaleString('id-ID', { month: 'long', year: 'numeric' })))).sort().map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            {(searchDist || selectedMonth !== 'all') && (
              <button onClick={() => { setSearchDist(''); setSelectedMonth('all'); }}
                style={{ padding: '4px 12px', backgroundColor: '#FF3B30', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <X size={11} /> Reset Filter
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {distSummary.map((d, i) => {
              const isActive = searchDist === d.name;
              const clr = getDistColor(d.name, allKnownDist);
              const isEmpty = d.count === 0;
              return (
                <div key={i} onClick={() => !isEmpty && setSearchDist(isActive ? '' : d.name)}
                  style={{ padding: '8px 14px', borderRadius: '10px', display: 'flex', gap: '10px', alignItems: 'center', cursor: isEmpty ? 'default' : 'pointer', transition: 'all 0.15s', opacity: isEmpty ? 0.45 : 1,
                    backgroundColor: isActive ? clr.dot : (isDarkMode ? '#2C2C2E' : clr.bg),
                    border: `1.5px solid ${isActive ? clr.dot : clr.border}`,
                  }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: isActive ? '#FFF' : clr.dot, flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', fontWeight: '700', color: isActive ? '#FFF' : (isDarkMode ? '#FFF' : '#1C1C1E') }}>{d.name}</span>
                  <span style={{ fontSize: '12px', color: isActive ? 'rgba(255,255,255,0.8)' : '#86868B' }}>{d.count} faktur</span>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: isActive ? '#FFF' : clr.text }}>{formatRp(d.total)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button onClick={() => { resetForm(); setShowModal(true); }} style={{ padding: '10px 20px', backgroundColor: '#007AFF', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={16} /> Add Invoice
          </button>
          <button onClick={() => { setShowTrash(!showTrash); if (!showTrash) fetchTrash(); }} style={{ padding: '10px 16px', backgroundColor: showTrash ? '#FF3B30' : (isDarkMode ? '#2C2C2E' : '#E5E5EA'), color: showTrash ? 'white' : (isDarkMode ? '#FFF' : '#000'), border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Trash2 size={16} /> Trash
          </button>
        </div>
        {/* Jatuh Tempo — di sebelah kanan toolbar */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {overdueCount > 0 && (
            <div onClick={() => { setFilterDue('overdue'); setShowFilters(true); }}
              style={{ cursor: 'pointer', padding: '8px 14px', backgroundColor: '#FF3B3015', border: '1.5px solid #FF3B30', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertTriangle size={14} color="#FF3B30" />
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#FF3B30' }}>{overdueCount} Terlambat</span>
            </div>
          )}
          {soonCount > 0 && (
            <div onClick={() => { setFilterDue('soon'); setShowFilters(true); }}
              style={{ cursor: 'pointer', padding: '8px 14px', backgroundColor: '#FF950015', border: '1.5px solid #FF9500', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={14} color="#FF9500" />
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#FF9500' }}>{soonCount} Jatuh Tempo</span>
            </div>
          )}
          {overdueCount === 0 && soonCount === 0 && invoices.length > 0 && (
            <div style={{ padding: '8px 14px', backgroundColor: '#34C75915', border: '1.5px solid #34C759', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={14} color="#34C759" />
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#34C759' }}>Semua Jatuh Tempo OK</span>
            </div>
          )}
        </div>
      </div>

      {/* Search + Filter */}
      <div style={{ ...S.card, padding: '1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: showFilters ? '12px' : '0' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', borderRadius: '10px', border: `1px solid ${isDarkMode ? '#3A3A3C' : '#D1D1D6'}` }}>
            <Search size={16} color="#86868B" />
            <input value={universalSearch} onChange={e => setUniversalSearch(e.target.value)}
              placeholder="Cari no. faktur, distributor, produk, status..."
              style={{ flex: 1, border: 'none', outline: 'none', backgroundColor: 'transparent', color: isDarkMode ? '#FFF' : '#000', fontSize: '14px' }} />
            {universalSearch && <button onClick={() => setUniversalSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}><X size={14} color="#86868B" /></button>}
          </div>
          <button onClick={() => setShowFilters(v => !v)} style={{ padding: '10px 16px', backgroundColor: showFilters ? '#007AFF' : (isDarkMode ? '#2C2C2E' : '#E5E5EA'), color: showFilters ? 'white' : (isDarkMode ? '#FFF' : '#000'), border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
            Filter {showFilters ? '▲' : '▼'}
            {(selectedMonth !== 'all' || searchDist || searchInv || filterStatus !== 'all' || filterDue !== 'all' || dateFrom || dateTo) && (
              <span style={{ backgroundColor: '#FF3B30', color: 'white', borderRadius: '10px', padding: '1px 6px', fontSize: '11px', fontWeight: '700' }}>!</span>
            )}
          </button>
        </div>
        {showFilters && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', paddingTop: '4px' }}>
              <div><label style={S.label}>Bulan</label>
                <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={S.input}>
                  <option value="all">Semua Bulan</option>
                  {getUniqueMonths().map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div><label style={S.label}>Distributor</label><input style={S.input} value={searchDist} onChange={e => setSearchDist(e.target.value)} placeholder="Cari..." /></div>
              <div><label style={S.label}>No Faktur</label><input style={S.input} value={searchInv} onChange={e => setSearchInv(e.target.value)} placeholder="Cari..." /></div>
              <div><label style={S.label}>Status</label>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={S.input}>
                  <option value="all">Semua</option><option value="Pending">Belum Bayar</option><option value="Paid">Sudah Dibayar</option>
                </select>
              </div>
              <div><label style={S.label}>Jatuh Tempo</label>
                <select value={filterDue} onChange={e => setFilterDue(e.target.value)} style={S.input}>
                  <option value="all">Semua</option><option value="overdue">Terlambat</option><option value="soon">≤ 7 hari</option>
                </select>
              </div>
              <div><label style={S.label}>Dari Tanggal</label><input type="date" style={S.input} value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
              <div><label style={S.label}>Sampai</label><input type="date" style={S.input} value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
            </div>
            <button onClick={() => { setSelectedMonth('all'); setSearchDist(''); setSearchInv(''); setFilterStatus('all'); setFilterDue('all'); setDateFrom(''); setDateTo(''); }}
              style={{ marginTop: '10px', padding: '8px 16px', backgroundColor: isDarkMode ? '#2C2C2E' : '#E5E5EA', color: isDarkMode ? '#FFF' : '#000', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
              Hapus Filter
            </button>
          </div>
        )}
      </div>

      {/* Trash Panel */}
      {showTrash && (
        <div style={{ ...S.card, padding: '1.25rem', marginBottom: '1.25rem', borderColor: '#FF3B30' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <p style={{ margin: 0, fontWeight: '700', fontSize: '14px', color: '#FF3B30', display: 'flex', alignItems: 'center', gap: '6px' }}><Trash2 size={16} /> Trash ({trashItems.length})</p>
            <button onClick={() => setShowTrash(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} color="#86868B" /></button>
          </div>
          {trashItems.length === 0
            ? <p style={{ color: '#86868B', fontSize: '13px', textAlign: 'center', padding: '1rem' }}>Trash kosong</p>
            : trashItems.map(inv => (
              <div key={inv.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderRadius: '8px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F9F9F9', marginBottom: '6px', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: '700', fontSize: '13px', color: isDarkMode ? '#FFF' : '#000' }}>{inv.invoice_number}</span>
                  <span style={{ fontSize: '12px', color: '#86868B', marginLeft: '10px' }}>{inv.distributor_name}</span>
                  <span style={{ fontSize: '11px', color: '#FF3B30', marginLeft: '10px' }}>Dihapus: {formatLocalDate(inv.deleted_at)}</span>
                </div>
                <button onClick={() => handleRestore(inv.id)} style={{ padding: '6px 12px', backgroundColor: '#34C759', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <RotateCcw size={12} /> Restore
                </button>
                <button onClick={() => handlePermanentDelete(inv.id)} style={{ padding: '6px 12px', backgroundColor: '#FF3B30', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Hapus Permanen</button>
              </div>
            ))
          }
        </div>
      )}

      {/* Invoice Table */}
      <div style={{ ...S.card, overflow: 'hidden' }}>
        {/* Table header — sortable */}
        <div style={{ display: 'grid', gridTemplateColumns: '110px 140px 1fr 130px 130px 150px 120px 100px', padding: '12px 16px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', borderBottom: `1px solid ${isDarkMode ? '#3A3A3C' : '#E5E5EA'}` }}>
          {[
            { label: 'Tgl Faktur', key: 'purchase_date' },
            { label: 'No Faktur', key: 'invoice_number' },
            { label: 'Distributor', key: 'distributor_name' },
            { label: 'HNA*QTY', key: 'total_hna' },
            { label: 'HNA Final', key: 'hna_final' },
            { label: 'HNA+PPN', key: 'hna_plus_ppn' },
            { label: 'Status', key: 'status' },
            { label: 'Aksi', key: null },
          ].map(h => (
            <div key={h.label}
              onClick={() => h.key && handleSort(h.key)}
              style={{ fontSize: '11px', fontWeight: '700', color: sortKey === h.key ? '#007AFF' : '#86868B', textTransform: 'uppercase', letterSpacing: '0.04em', cursor: h.key ? 'pointer' : 'default', userSelect: 'none', display: 'flex', alignItems: 'center' }}>
              {h.label}{h.key && <SortIcon k={h.key} />}
            </div>
          ))}
        </div>

        {loading ? (
          [...Array(pageSize)].map((_, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '110px 140px 1fr 130px 130px 150px 120px 100px', padding: '14px 16px', borderBottom: `1px solid ${isDarkMode ? '#2C2C2E' : '#F0F0F0'}`, alignItems: 'center', backgroundColor: isDarkMode ? '#1C1C1E' : '#FFF' }}>
              <Skeleton width="80px" height="14px" />
              <Skeleton width="100px" height="14px" />
              <Skeleton width="150px" height="24px" borderRadius="8px" />
              <Skeleton width="90px" height="14px" />
              <Skeleton width="90px" height="14px" />
              <Skeleton width="110px" height="14px" />
              <Skeleton width="80px" height="20px" borderRadius="20px" />
              <Skeleton width="70px" height="24px" borderRadius="8px" />
            </div>
          ))
        ) : paginatedInvoices.length === 0
          ? <div style={{ padding: '3rem', textAlign: 'center', color: '#86868B' }}>{invoices.length === 0 ? 'Belum ada faktur' : 'Tidak ada yang cocok'}</div>
          : paginatedInvoices.map(inv => (
            <InvoiceRow key={inv.id} inv={inv} isDarkMode={isDarkMode}
              expanded={!!expandedRows[inv.id]}
              onToggleExpand={() => setExpandedRows(prev => ({ ...prev, [inv.id]: !prev[inv.id] }))}
              onEdit={() => handleEdit(inv)}
              onDelete={() => handleDeleteRequest(inv)}
              onAudit={() => openAuditLog(inv)}
              allKnownDist={allKnownDist}
              formatRp={formatRp} />
          ))
        }

        {/* Pagination */}
        {filteredInvoices.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: `1px solid ${isDarkMode ? '#2C2C2E' : '#E5E5EA'}`, flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: '#86868B' }}>Tampilkan</span>
              <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                style={{ padding: '6px 10px', border: `1px solid ${isDarkMode ? '#3A3A3C' : '#D1D1D6'}`, borderRadius: '8px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', color: isDarkMode ? '#FFF' : '#000', fontSize: '13px' }}>
                {[5, 10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <span style={{ fontSize: '13px', color: '#86868B' }}>per halaman · {filteredInvoices.length} total</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button onClick={() => setCurrentPage(p => Math.max(1, p-1))} disabled={currentPage === 1}
                style={{ padding: '6px 10px', border: `1px solid ${isDarkMode ? '#3A3A3C' : '#D1D1D6'}`, borderRadius: '8px', backgroundColor: isDarkMode ? '#2C2C2E' : '#FFF', color: isDarkMode ? '#FFF' : '#000', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', opacity: currentPage === 1 ? 0.4 : 1, display: 'flex', alignItems: 'center' }}>
                <ChevronLeft size={14} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i+1).filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1).map((p, idx, arr) => (
                <React.Fragment key={p}>
                  {idx > 0 && arr[idx-1] !== p-1 && <span style={{ color: '#86868B', fontSize: '13px' }}>…</span>}
                  <button onClick={() => setCurrentPage(p)}
                    style={{ padding: '6px 12px', border: `1px solid ${p === currentPage ? '#007AFF' : (isDarkMode ? '#3A3A3C' : '#D1D1D6')}`, borderRadius: '8px', backgroundColor: p === currentPage ? '#007AFF' : (isDarkMode ? '#2C2C2E' : '#FFF'), color: p === currentPage ? 'white' : (isDarkMode ? '#FFF' : '#000'), cursor: 'pointer', fontSize: '13px', fontWeight: p === currentPage ? '700' : '400' }}>
                    {p}
                  </button>
                </React.Fragment>
              ))}
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p+1))} disabled={currentPage === totalPages}
                style={{ padding: '6px 10px', border: `1px solid ${isDarkMode ? '#3A3A3C' : '#D1D1D6'}`, borderRadius: '8px', backgroundColor: isDarkMode ? '#2C2C2E' : '#FFF', color: isDarkMode ? '#FFF' : '#000', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', opacity: currentPage === totalPages ? 0.4 : 1, display: 'flex', alignItems: 'center' }}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Duplicate Confirm */}
      {dupConfirm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ backgroundColor: isDarkMode ? '#1C1C1E' : '#FFF', borderRadius: '16px', padding: '28px', maxWidth: '400px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#FF950020', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <AlertTriangle size={26} color="#FF9500" />
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: '17px', fontWeight: '700', color: isDarkMode ? '#FFF' : '#000', textAlign: 'center' }}>Invoice sudah ada!</h3>
            <p style={{ margin: '0 0 20px', fontSize: '14px', color: '#86868B', textAlign: 'center' }}>
              Nomor faktur <strong style={{ color: isDarkMode ? '#FFF' : '#000' }}>{dupConfirm.invoiceNumber}</strong> sudah tersimpan sebelumnya.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button onClick={handleDupLoadExisting} style={{ padding: '13px', backgroundColor: '#007AFF', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '14px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span>✏️ Buka & Edit Invoice yang Ada</span>
                <span style={{ fontSize: '11px', fontWeight: '400', opacity: 0.85 }}>Load data existing, bisa tambah/ubah produknya</span>
              </button>
              <button onClick={handleDupOverwrite} style={{ padding: '13px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', color: isDarkMode ? '#FFF' : '#000', border: `1px solid ${isDarkMode ? '#3A3A3C' : '#D1D1D6'}`, borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '14px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span>🔄 Timpa dengan Data Sekarang</span>
                <span style={{ fontSize: '11px', fontWeight: '400', color: '#86868B' }}>Invoice lama akan diganti sepenuhnya</span>
              </button>
              <button onClick={() => setDupConfirm(null)} style={{ padding: '12px', backgroundColor: 'transparent', color: '#86868B', border: `1px solid ${isDarkMode ? '#2C2C2E' : '#E5E5EA'}`, borderRadius: '10px', cursor: 'pointer', fontSize: '14px' }}>
                Batal — Ganti Nomor Faktur
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ backgroundColor: isDarkMode ? '#1C1C1E' : '#FFF', borderRadius: '16px', padding: '28px', maxWidth: '360px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', textAlign: 'center' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#FF3B3020', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}><Trash2 size={24} color="#FF3B30" /></div>
            <h3 style={{ margin: '0 0 8px', fontSize: '17px', fontWeight: '700', color: isDarkMode ? '#FFF' : '#000' }}>Pindahkan ke Trash?</h3>
            <p style={{ margin: '0 0 6px', fontSize: '14px', color: '#86868B' }}>Faktur <strong style={{ color: isDarkMode ? '#FFF' : '#000' }}>{deleteConfirm.name}</strong> akan dipindahkan ke trash.</p>
            <p style={{ margin: '0 0 24px', fontSize: '12px', color: '#86868B' }}>Kamu bisa restore dari Trash kapan saja.</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, padding: '12px', backgroundColor: isDarkMode ? '#2C2C2E' : '#E5E5EA', color: isDarkMode ? '#FFF' : '#000', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}>Batal</button>
              <button onClick={handleDeleteConfirm} style={{ flex: 1, padding: '12px', backgroundColor: '#FF3B30', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>Ke Trash</button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Log Modal */}
      {auditModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '2rem' }}>
          <div style={{ backgroundColor: isDarkMode ? '#1C1C1E' : '#FFF', borderRadius: '16px', width: '100%', maxWidth: '640px', maxHeight: '82vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px', borderBottom: `1px solid ${isDarkMode ? '#2C2C2E' : '#E5E5EA'}`, backgroundColor: isDarkMode ? '#000' : '#F5F5F7' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: isDarkMode ? '#FFF' : '#000', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <History size={16} color="#007AFF" /> Riwayat Perubahan
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#86868B' }}>Faktur #{auditModal.invoiceNumber} · {auditLog.length} entri</p>
              </div>
              <button onClick={() => setAuditModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px' }}><X size={18} color="#86868B" /></button>
            </div>

            {/* Timeline */}
            <div style={{ overflowY: 'auto', padding: '20px 22px', flex: 1 }}>
              {auditLog.length === 0
                ? <p style={{ color: '#86868B', textAlign: 'center', padding: '2rem' }}>Belum ada riwayat</p>
                : auditLog.map((log, i) => {
                  const ACTION_CFG = {
                    CREATE:           { color: '#34C759', bg: '#34C75918', label: '✅ Dibuat',      icon: '✅' },
                    UPDATE:           { color: '#007AFF', bg: '#007AFF18', label: '✏️ Diubah',      icon: '✏️' },
                    DELETE:           { color: '#FF9500', bg: '#FF950018', label: '🗑️ Dihapus',     icon: '🗑️' },
                    RESTORE:          { color: '#34C759', bg: '#34C75918', label: '♻️ Direstore',   icon: '♻️' },
                    PERMANENT_DELETE: { color: '#FF3B30', bg: '#FF3B3018', label: '❌ Hapus Perm.', icon: '❌' },
                  };
                  const cfg = ACTION_CFG[log.action] || { color: '#86868B', bg: '#86868B18', label: log.action, icon: '•' };

                  let snap = null;
                  try { snap = log.snapshot ? (typeof log.snapshot === 'string' ? JSON.parse(log.snapshot) : log.snapshot) : null; } catch(e) {}

                  const isLast = i === auditLog.length - 1;
                  return (
                    <div key={i} style={{ display: 'flex', gap: '14px', marginBottom: isLast ? 0 : '4px' }}>
                      {/* Timeline line */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: cfg.bg, border: `2px solid ${cfg.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
                          {cfg.icon}
                        </div>
                        {!isLast && <div style={{ width: '2px', flex: 1, backgroundColor: isDarkMode ? '#2C2C2E' : '#E5E5EA', margin: '4px 0' }} />}
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, paddingBottom: isLast ? 0 : '16px' }}>
                        {/* Action + time */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '13px', fontWeight: '700', color: cfg.color, padding: '3px 10px', backgroundColor: cfg.bg, borderRadius: '20px' }}>{cfg.label}</span>
                          <span style={{ fontSize: '12px', color: '#86868B' }}>
                            {new Date(log.changed_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {log.changed_by && (
                            <span style={{ fontSize: '11px', color: '#86868B', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', padding: '2px 8px', borderRadius: '6px' }}>
                              👤 {log.changed_by}
                            </span>
                          )}
                        </div>

                        {/* Snapshot — before/after style */}
                        {snap && (
                          <div style={{ backgroundColor: isDarkMode ? '#2C2C2E' : '#F9F9FB', borderRadius: '10px', padding: '10px 14px', fontSize: '12px', border: `1px solid ${isDarkMode ? '#3A3A3C' : '#E5E5EA'}` }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                              {[
                                { label: 'Distributor', val: snap.distributor_name },
                                { label: 'Status', val: snap.status },
                                { label: 'HNA Final', val: snap.hna_final ? formatRp(snap.hna_final) : null },
                                { label: 'HNA+PPN', val: snap.hna_plus_ppn ? formatRp(snap.hna_plus_ppn) : null },
                                { label: 'No Faktur', val: snap.invoice_number },
                                { label: 'Tgl Faktur', val: snap.purchase_date ? formatLocalDate(snap.purchase_date, { day: '2-digit', month: 'short', year: 'numeric' }) : null },
                              ].filter(r => r.val).map(row => (
                                <div key={row.label}>
                                  <span style={{ color: '#86868B', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{row.label}</span>
                                  <div style={{ color: isDarkMode ? '#FFF' : '#1C1C1E', fontWeight: '600', marginTop: '2px' }}>{row.val}</div>
                                </div>
                              ))}
                            </div>
                            {log.note && (
                              <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: `1px solid ${isDarkMode ? '#3A3A3C' : '#E5E5EA'}`, color: '#86868B', fontSize: '11px' }}>
                                📝 {log.note}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              }
            </div>
          </div>
        </div>
      )}

      {/* Invoice Modal */}
      {showModal && (
        <InvoiceModal
          isDarkMode={isDarkMode} form={form} items={items} totals={totals} editingId={editingId}
          distributors={distributors} products={products}
          onAddDistributor={handleAddDistributor} onRemoveDistributor={handleRemoveDistributor} onRenameDistributor={handleRenameDistributor}
          onAddProduct={handleAddProduct} onRemoveProduct={handleRemoveProduct} onRenameProduct={handleRenameProduct}
          onFormChange={handleFormChange} updateItem={updateItem} addItem={addItem} removeItem={removeItem}
          onSubmit={handleSubmit} onClose={() => { setShowModal(false); resetForm(); }}
          S={S} formatRpInput={formatRpInput} parseNum={parseNum} formatRp={formatRp}
        />
      )}
    </div>
  );
}

// ─── Invoice Row ──────────────────────────────────────────────────────────────
function InvoiceRow({ inv, isDarkMode, expanded, onToggleExpand, onEdit, onDelete, onAudit, allKnownDist = [], formatRp }) {
  const [hovered, setHovered] = useState(false);
  const isPaid = inv.status === 'Paid';
  const sc = isPaid ? { bg: '#D1FAE5', text: '#065F46' } : { bg: isDarkMode ? '#3A2800' : '#FEF3C7', text: isDarkMode ? '#FFCC00' : '#92400E' };
  const statusLabel = isPaid ? 'SUDAH DIBAYAR' : 'BELUM BAYAR';
  const dueStatus = getDueStatus(inv.due_date, inv.status);
  const clr = getDistColor(inv.distributor_name, allKnownDist);
  return (
    <>
      {/* Main row */}
      <div
        onClick={onToggleExpand}
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        style={{ display: 'grid', gridTemplateColumns: '110px 140px 1fr 130px 130px 150px 120px 100px', padding: '14px 16px', borderBottom: `1px solid ${isDarkMode ? '#2C2C2E' : '#F0F0F0'}`, alignItems: 'center', backgroundColor: hovered ? (isDarkMode ? '#2C2C2E' : '#F5F5F7') : (isDarkMode ? '#1C1C1E' : '#FFF'), transition: 'background 0.15s', cursor: 'pointer' }}>
        {/* Tgl Faktur */}
        <div style={{ fontSize: '13px', color: isDarkMode ? '#EBEBF0' : '#3A3A3C', fontWeight: '500' }}>
          {formatLocalDate(inv.purchase_date, { day: '2-digit', month: 'short', year: 'numeric' })}
        </div>
        {/* No Faktur */}
        <div>
          <div style={{ fontWeight: '700', fontSize: '13px', color: '#007AFF' }}>{inv.invoice_number}</div>
          <div style={{ fontSize: '11px', color: '#86868B', marginTop: '2px' }}>
            {inv.item_count > 0 ? `${inv.item_count} produk · ${inv.total_qty||0} qty` : '0 produk'}
          </div>
          <div style={{ fontSize: '10px', color: '#AF52DE', marginTop: '2px', fontWeight: '500' }}>
            📥 Input: {new Date(inv.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
        {/* Distributor — dengan warna */}
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 10px 3px 8px', borderRadius: '8px', backgroundColor: isDarkMode ? clr.bg.replace('20','15') : clr.bg, border: `1px solid ${clr.border}` }}>
            <div style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: clr.dot, flexShrink: 0 }} />
            <span style={{ fontWeight: '600', fontSize: '13px', color: isDarkMode ? clr.text : '#1C1C1E' }}>{inv.distributor_name}</span>
          </div>
        </div>
        {/* HNA*QTY */}
        <div>
          <div style={{ fontSize: '13px', fontWeight: '600', color: isDarkMode ? '#FFF' : '#000' }}>{formatRp(inv.total_hna)}</div>
          {inv.discount_amount > 0 && <div style={{ fontSize: '11px', color: '#FF3B30' }}>Disc: {formatRp(inv.discount_amount)}</div>}
        </div>
        {/* HNA Final */}
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#34C759' }}>{formatRp(inv.hna_final||inv.final_hna)}</div>
        {/* HNA+PPN */}
        <div>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#007AFF' }}>{formatRp(inv.hna_plus_ppn)}</div>
          <div style={{ fontSize: '11px', color: '#86868B' }}>PPN: {formatRp(inv.ppn_masukan||inv.ppn_input, true)}</div>
        </div>
        {/* Status + jatuh tempo */}
        <div>
          <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: '800', backgroundColor: sc.bg, color: sc.text, letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>{statusLabel}</span>
          {!isPaid && inv.due_date && dueStatus && (
            <div style={{ marginTop: '5px', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '8px', backgroundColor: dueStatus.bg }}>
              <span style={{ fontSize: '10px', fontWeight: '700', color: dueStatus.color }}>{dueStatus.label}</span>
            </div>
          )}
          {!isPaid && inv.due_date && !dueStatus && (
            <div style={{ marginTop: '4px', fontSize: '11px', color: '#86868B' }}>JT: {formatLocalDate(inv.due_date)}</div>
          )}
          {isPaid && inv.payment_date && (
            <div style={{ marginTop: '4px', fontSize: '11px', color: '#34C759', fontWeight: '600' }}>✅ {formatLocalDate(inv.payment_date)}</div>
          )}
          {expanded && <div style={{ marginTop: '4px', fontSize: '10px', color: '#86868B' }}>▲ sembunyikan</div>}
        </div>
        {/* Aksi */}
        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
          <button onClick={onAudit} title="Riwayat" style={{ padding: '6px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><History size={13} color="#86868B" /></button>
          <button onClick={onEdit} style={{ padding: '6px 10px', backgroundColor: '#007AFF', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Edit</button>
          <button onClick={onDelete} style={{ padding: '6px', backgroundColor: '#FF3B30', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Trash2 size={13} /></button>
        </div>
      </div>
      {expanded && <ExpandedItems invoiceId={inv.id} isDarkMode={isDarkMode} formatRp={formatRp} distColor={clr} />}
    </>
  );
}

function ExpandedItems({ invoiceId, isDarkMode, formatRp, distColor }) {
  const [items, setItems] = useState(null);
  useEffect(() => { invoicesAPI.getById(invoiceId).then(r => setItems(r.data.items)).catch(() => setItems([])); }, [invoiceId]);
  if (!items) return <div style={{ padding: '12px 24px', fontSize: '13px', color: '#86868B' }}>Memuat...</div>;
  if (!items.length) return null;
  const cols = '2fr 60px 90px 100px 70px 100px 100px 90px 100px 100px';
  return (
    <div style={{ backgroundColor: isDarkMode ? '#111' : '#FAFAFA', borderBottom: `1px solid ${isDarkMode ? '#2C2C2E' : '#E5E5EA'}`, padding: '8px 24px', borderLeft: `3px solid ${distColor?.dot || '#007AFF'}` }}>
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '8px', padding: '6px 0', borderBottom: `1px solid ${isDarkMode ? '#2C2C2E' : '#E5E5EA'}`, marginBottom: '4px' }}>
        {['Nama Produk','QTY','HNA','HNA*QTY','Disc%','Disc Nom.','HNA Baru','Disc COD','HNA Final','HPP/pcs'].map(h => (
          <div key={h} style={{ fontSize: '10px', fontWeight: '700', color: '#86868B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</div>
        ))}
      </div>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: cols, gap: '8px', padding: '6px 0', borderBottom: `1px solid ${isDarkMode ? '#1C1C1E' : '#F0F0F0'}` }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: '500', color: isDarkMode ? '#FFF' : '#000' }}>{item.product_name}</div>
            {item.expired_date && <div style={{ fontSize: '11px', color: '#FF9500' }}>Exp: {formatLocalDate(item.expired_date)}</div>}
          </div>
          <div style={{ fontSize: '13px', color: isDarkMode ? '#FFF' : '#000' }}>{item.quantity}</div>
          <div style={{ fontSize: '13px', color: isDarkMode ? '#FFF' : '#000' }}>{formatRp(item.hna||item.unit_price)}</div>
          <div style={{ fontSize: '13px', color: isDarkMode ? '#FFF' : '#000' }}>{formatRp(item.hna_times_qty||item.total_price)}</div>
          <div style={{ fontSize: '13px', color: '#FF3B30' }}>{item.disc_percent||0}%</div>
          <div style={{ fontSize: '13px', color: '#FF3B30' }}>{formatRp(item.disc_nominal)}</div>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#34C759' }}>{formatRp(item.hna_baru)}</div>
          <div style={{ fontSize: '13px', color: '#FF9500' }}>{item.disc_cod_per_item > 0 ? formatRp(item.disc_cod_per_item) : <span style={{color:'#C7C7CC'}}>—</span>}</div>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#34C759' }}>{item.hna_after_cod > 0 ? formatRp(item.hna_after_cod) : (item.hna_baru > 0 ? formatRp(item.hna_baru) : formatRp(item.total_price))}</div>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#AF52DE' }}>
            {formatRp(item.hpp_inc_ppn > 0 ? item.hpp_inc_ppn : ((item.hna_per_item > 0 ? item.hna_per_item : (parseNum(item.hna||item.unit_price))) * 1.11))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL
// ═══════════════════════════════════════════════════════════════════════════════
function InvoiceModal({ isDarkMode, form, items, totals, editingId, distributors, products, onAddDistributor, onRemoveDistributor, onRenameDistributor, onAddProduct, onRemoveProduct, onRenameProduct, onFormChange, updateItem, addItem, removeItem, onSubmit, onClose, S, formatRpInput, parseNum, formatRp }) {
  const sec = { marginBottom: '1.75rem', paddingBottom: '1.75rem', borderBottom: `1px solid ${isDarkMode ? '#2C2C2E' : '#E5E5EA'}` };
  const secTitle = { fontSize: '11px', fontWeight: '700', marginBottom: '14px', color: isDarkMode ? '#EBEBF0' : '#1C1C1E', letterSpacing: '0.05em', textTransform: 'uppercase' };
  const r2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '2rem 1rem', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ backgroundColor: isDarkMode ? '#1C1C1E' : '#FFF', borderRadius: '16px', width: '100%', maxWidth: '780px', boxShadow: '0 32px 64px rgba(0,0,0,0.35)', overflow: 'hidden', marginBottom: '2rem' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: `1px solid ${isDarkMode ? '#2C2C2E' : '#E5E5EA'}`, backgroundColor: isDarkMode ? '#000' : '#F5F5F7' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: isDarkMode ? '#FFF' : '#000' }}>{editingId ? '✏️ Edit Faktur' : '➕ Buat Faktur Baru'}</h2>
            <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#86868B' }}>Draft tersimpan otomatis tiap ada perubahan</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px' }}><X size={20} color="#86868B" /></button>
        </div>

        <div style={{ padding: '24px' }}>
          {/* Info Faktur */}
          <div style={sec}>
            <p style={secTitle}>📦 Informasi Faktur</p>
            <div style={r2}>
              <div><label style={S.label}>No Faktur</label><input style={S.input} value={form.invoice_number} onChange={e => onFormChange('invoice_number', e.target.value)} placeholder="Contoh: 1260300020" /></div>
              <div><label style={S.label}>Tanggal Belanja / Faktur</label><input type="date" style={S.input} value={form.purchase_date} onChange={e => onFormChange('purchase_date', e.target.value)} /></div>
            </div>
            <div style={{ ...r2, marginTop: '14px' }}>
              <div><label style={S.label}>Distributor</label><MasterSelect value={form.distributor_name} onChange={v => onFormChange('distributor_name', v)} options={distributors} onAdd={onAddDistributor} onRemove={onRemoveDistributor} onRename={onRenameDistributor} placeholder="Pilih atau tambah distributor..." isDarkMode={isDarkMode} /></div>
              <div><label style={S.label}>Tanggal Jatuh Tempo</label><input type="date" style={S.input} value={form.due_date} onChange={e => onFormChange('due_date', e.target.value)} /></div>
            </div>
          </div>

          {/* Produk */}
          <div style={sec}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <p style={{ ...secTitle, margin: 0 }}>📦 Daftar Produk</p>
              <button type="button" onClick={addItem} style={{ padding: '7px 14px', backgroundColor: '#007AFF', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Plus size={13} /> Tambah Produk
              </button>
            </div>
            {items.map((item, idx) => (
              <div key={item._id} style={{ backgroundColor: isDarkMode ? '#2C2C2E' : '#F9F9FB', borderRadius: '12px', padding: '14px', marginBottom: '10px', border: `1px solid ${isDarkMode ? '#3A3A3C' : '#E5E5EA'}`, position: 'relative' }}>
                {items.length > 1 && (
                  <button type="button" onClick={() => removeItem(idx)} style={{ position: 'absolute', top: '10px', right: '10px', padding: '5px', backgroundColor: '#FF3B30', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}><X size={12} /></button>
                )}
                <div style={{ ...r2, marginBottom: '10px' }}>
                  <div><label style={S.label}>Nama Produk</label><MasterSelect value={item.product_name} onChange={v => updateItem(idx, 'product_name', v)} options={products} onAdd={onAddProduct} onRemove={onRemoveProduct} onRename={onRenameProduct} placeholder="Pilih atau tambah produk..." isDarkMode={isDarkMode} /></div>
                  <div><label style={S.label}>Expired Date</label><input type="date" style={S.input} value={item.expired_date} onChange={e => updateItem(idx, 'expired_date', e.target.value)} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                  <div><label style={S.label}>QTY</label><input style={S.input} type="number" min="0" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} placeholder="0" /></div>
                  <div><label style={S.label}>HNA</label>
                    <input style={S.input} value={item.hna === '' ? '' : formatRpInput(parseNum(item.hna))}
                      onChange={e => { const raw = e.target.value.replace(/\./g, '').replace(/[^0-9]/g, ''); updateItem(idx, 'hna', raw); }} placeholder="Rp 0" />
                  </div>
                  <div><label style={S.label}>Disc %</label><input style={S.input} type="number" min="0" max="100" step="0.01" value={item.disc_percent} onChange={e => updateItem(idx, 'disc_percent', e.target.value)} placeholder="0" /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px', marginBottom: '8px' }}>
                  <div><label style={{ ...S.label, color: '#86868B' }}>HNA × QTY</label><input style={S.computed} value={formatRpInput(item.hna_times_qty)} readOnly /></div>
                  <div><label style={{ ...S.label, color: '#FF3B30' }}>Disc Nominal</label><input style={{ ...S.inputDis, color: '#FF3B30', fontWeight: '600' }} value={formatRpInput(item.disc_nominal)} readOnly /></div>
                  <div><label style={{ ...S.label, color: isDarkMode ? '#30D158' : '#1C7C2A' }}>HNA Baru</label><input style={S.computed} value={formatRpInput(item.hna_baru)} readOnly /></div>
                  <div><label style={{ ...S.label, color: '#AF52DE' }}>HNA/Item</label><input style={{ ...S.computed, color: '#AF52DE' }} value={formatRpInput(item.hna_per_item)} readOnly /></div>
                </div>
                {totals.disc_cod_amount > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', padding: '10px', backgroundColor: isDarkMode ? '#2C1A00' : '#FFF8F0', borderRadius: '10px', border: `1px solid #FF950040` }}>
                    <div>
                      <label style={{ ...S.label, color: '#FF9500', fontSize: '10px' }}>Disc COD Bagian</label>
                      <input style={{ ...S.inputDis, color: '#FF9500', fontWeight: '600' }} value={formatRpInput(totals.items_with_cod?.find(x => x._id === item._id)?.disc_cod_per_item || 0)} readOnly />
                    </div>
                    <div>
                      <label style={{ ...S.label, color: isDarkMode ? '#30D158' : '#1C7C2A', fontSize: '10px' }}>HNA After COD</label>
                      <input style={S.computed} value={formatRpInput(totals.items_with_cod?.find(x => x._id === item._id)?.hna_after_cod || 0)} readOnly />
                    </div>
                    <div>
                      <label style={{ ...S.label, color: '#AF52DE', fontSize: '10px' }}>HPP inc. PPN</label>
                      <input style={{ ...S.computed, color: '#AF52DE' }} value={formatRpInput(totals.items_with_cod?.find(x => x._id === item._id)?.hpp_inc_ppn || 0)} readOnly />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Kalkulasi */}
          <div style={sec}>
            <p style={secTitle}>💰 Kalkulasi Finansial</p>
            <div style={r2}>
              <div><label style={S.label}>HNA×QTY Total</label><input style={S.computed} value={formatRpInput(totals.total_hna)} readOnly /></div>
              <div><label style={S.label}>DISC Total</label><input style={{ ...S.inputDis, color: '#FF3B30', fontWeight: '600' }} value={formatRpInput(totals.discount_amount)} readOnly /></div>
            </div>
            <div style={{ ...r2, marginTop: '12px' }}>
              <div><label style={S.label}>HNA Baru (HNA−DISC)</label><input style={S.computed} value={formatRpInput(totals.hna_baru)} readOnly /></div>
              {/* Disc COD — bisa pakai % ATAU nominal */}
              <div>
                <label style={S.label}>Disc COD</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <select value={form.disc_cod_ada ? 'ada' : 'tidak'} onChange={e => onFormChange('disc_cod_ada', e.target.value === 'ada')} style={{ ...S.input, width: '120px', flex: 'none' }}>
                    <option value="tidak">Tidak Ada</option><option value="ada">Ada</option>
                  </select>
                </div>
                {form.disc_cod_ada && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <label style={{ ...S.label, fontSize: '10px' }}>Input % (opsional)</label>
                      <input style={S.input} type="number" min="0" max="100" step="0.01"
                        value={form.disc_cod_percent}
                        onChange={e => { onFormChange('disc_cod_percent', e.target.value); onFormChange('disc_cod_amount', ''); }}
                        placeholder="Contoh: 2.5" />
                    </div>
                    <div>
                      <label style={{ ...S.label, fontSize: '10px' }}>Atau Nominal</label>
                      <input style={S.input}
                        value={form.disc_cod_amount === '' ? '' : formatRpInput(parseNum(form.disc_cod_amount))}
                        onChange={e => { const raw = e.target.value.replace(/\./g, '').replace(/[^0-9]/g, ''); onFormChange('disc_cod_amount', raw); onFormChange('disc_cod_percent', ''); }}
                        placeholder="Rp 0" />
                    </div>
                  </div>
                )}
                {form.disc_cod_ada && totals.disc_cod_amount > 0 && (
                  <div style={{ marginTop: '6px', fontSize: '12px', color: '#FF3B30', fontWeight: '600' }}>
                    Disc COD: {formatRp(totals.disc_cod_amount)}
                  </div>
                )}
              </div>
            </div>
            <div style={{ ...r2, marginTop: '12px' }}>
              <div><label style={S.label}>HNA Final (HNA Baru − Disc COD)</label><input style={S.computed} value={formatRpInput(totals.hna_final)} readOnly /></div>
              <div><label style={S.label}>PPN Masukan (HNA Final × 11%)</label>
                <input style={{ ...S.inputDis, color: '#FF9500', fontWeight: '600' }}
                  value={new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totals.ppn_masukan)} readOnly />
              </div>
            </div>
            <div style={{ ...r2, marginTop: '12px' }}>
              <div><label style={{ ...S.label, color: '#86868B' }}>PPN Pembulatan (INT)</label><input style={S.inputDis} value={formatRpInput(totals.ppn_pembulatan)} readOnly /></div>
              <div><label style={{ ...S.label, color: '#007AFF' }}>HNA + PPN Masukan</label><input style={{ ...S.computed, color: '#007AFF', fontSize: '15px', fontWeight: '700' }} value={formatRpInput(totals.hna_plus_ppn)} readOnly /></div>
            </div>
            <div style={{ marginTop: '12px' }}>
              <label style={{ ...S.label, color: '#AF52DE' }}>Harga per Produk / HPP (HNA+PPN ÷ Total QTY)</label>
              <input style={{ ...S.computed, color: '#AF52DE' }} value={formatRpInput(totals.harga_per_produk)} readOnly />
            </div>
          </div>

          {/* Pembayaran */}
          <div style={{ marginBottom: '1.75rem' }}>
            <p style={secTitle}>📅 Pembayaran</p>
            <div style={r2}>
              <div>
                <label style={S.label}>Tanggal Pembayaran Faktur</label>
                <input
                  type="date"
                  style={form.status === 'Paid' ? S.input : S.inputDis}
                  value={form.status === 'Paid' ? (form.payment_date || '') : ''}
                  max={new Date().toISOString().split('T')[0]}
                  disabled={form.status !== 'Paid'}
                  onChange={e => onFormChange('payment_date', e.target.value)}
                />
                {form.status !== 'Paid' && (
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#86868B' }}>
                    Ubah status ke "Sudah Dibayar" untuk isi tanggal
                  </p>
                )}
              </div>
              <div>
                <label style={S.label}>Status</label>
                <select value={form.status} onChange={e => {
                  const newStatus = e.target.value;
                  onFormChange('status', newStatus);
                  if (newStatus !== 'Paid') onFormChange('payment_date', '');
                }} style={S.input}>
                  <option value="Pending">Belum Bayar</option>
                  <option value="Paid">Sudah Dibayar</option>
                </select>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button type="button" onClick={onSubmit} style={{ flex: 1, padding: '14px', backgroundColor: '#007AFF', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '15px', fontWeight: '700' }}>
              {editingId ? '💾 Update Faktur' : '✅ Simpan Faktur'}
            </button>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '14px', backgroundColor: isDarkMode ? '#2C2C2E' : '#E5E5EA', color: isDarkMode ? '#FFF' : '#000', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '15px', fontWeight: '600' }}>
              Batal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}