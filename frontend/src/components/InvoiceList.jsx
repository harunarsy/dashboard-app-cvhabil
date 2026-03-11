import React, { useState, useEffect, useRef } from 'react';
import { invoicesAPI, distributorsAPI, productsAPI } from '../services/api';
import { Plus, Upload, X, ChevronDown, ChevronUp, Trash2, RotateCcw, Search, AlertTriangle, Clock, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import MasterSelect from './MasterSelect';

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
// Parse date string as local date (avoid UTC timezone shift)
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
  disc_cod_ada: false, disc_cod_amount: '',
  due_date: '', payment_date: '', status: 'Pending',
  total_hna: 0, hna_baru: 0, hna_final: 0,
  ppn_masukan: 0, ppn_pembulatan: 0, hna_plus_ppn: 0, harga_per_produk: 0,
});

const calcItem = (item) => {
  const qty = parseNum(item.quantity);
  const hna = parseNum(item.hna);
  const hna_times_qty = hna * qty;
  const disc_percent = parseNum(item.disc_percent);
  const disc_nominal = hna_times_qty * (disc_percent / 100);
  const hna_baru = hna_times_qty - disc_nominal;
  const hna_per_item = qty > 0 ? hna_baru / qty : 0;           // HPP tanpa PPN
  const hpp_per_item = qty > 0 ? (hna_baru * 1.11) / qty : 0; // HPP dengan PPN 11%
  return { ...item, hna_times_qty, disc_nominal, hna_baru, hna_per_item, hpp_per_item };
};

const calcTotals = (items, form) => {
  const total_hna = items.reduce((s, i) => s + i.hna_times_qty, 0);
  const hna_baru = items.reduce((s, i) => s + i.hna_baru, 0);
  const disc_cod_amount = form.disc_cod_ada ? parseNum(form.disc_cod_amount) : 0;
  const hna_final = hna_baru - disc_cod_amount;
  const ppn_masukan = hna_final * 0.11;
  const ppn_pembulatan = Math.floor(ppn_masukan);
  const hna_plus_ppn = hna_final + ppn_masukan;
  const totalQty = items.reduce((s, i) => s + parseNum(i.quantity), 0);
  const harga_per_produk = totalQty > 0 ? hna_plus_ppn / totalQty : 0;
  const discount_amount = items.reduce((s, i) => s + i.disc_nominal, 0);
  return { total_hna, discount_amount, hna_baru, hna_final, ppn_masukan, ppn_pembulatan, hna_plus_ppn, harga_per_produk };
};

const getDueStatus = (due_date, status) => {
  if (status === 'Paid' || !due_date) return null;
  const diff = daysDiff(due_date);
  if (diff < 0) return { label: `Terlambat ${Math.abs(diff)}h`, color: '#FF3B30', bg: '#FF3B3020' };
  if (diff <= 3) return { label: `Jatuh tempo ${diff}h lagi`, color: '#FF9500', bg: '#FF950020' };
  if (diff <= 7) return { label: `${diff}h lagi`, color: '#FFCC00', bg: '#FFCC0020' };
  return null;
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

  // ── Duplicate confirm state ──
  const [dupConfirm, setDupConfirm] = useState(null);
  // { invoiceNumber, existingId, pendingPayload }

  const fileInputRef = useRef(null);
  const draftDebounceRef = useRef(null);

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

  // Form
  const [form, setForm] = useState(blankForm());
  const [items, setItems] = useState([blankItem()]);
  const totals = calcTotals(items, form);

  useEffect(() => {
    fetchInvoices(); fetchDistributors(); fetchProducts(); checkDraft();
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { applyFilters(); },
    [invoices, universalSearch, selectedMonth, searchDist, searchInv, filterStatus, filterDue, dateFrom, dateTo]);

  // ── Debounced draft save on EVERY form/items change ──
  useEffect(() => {
    if (!showModal) return;
    if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current);
    draftDebounceRef.current = setTimeout(() => {
      invoicesAPI.saveDraft({ form, items }).catch(() => {});
    }, 1500); // save 1.5s after last change
    return () => clearTimeout(draftDebounceRef.current);
  }, [form, items, showModal]);

  const fetchInvoices = async () => {
    try { const r = await invoicesAPI.getAll(); setInvoices(r.data); }
    catch (e) { console.error(e); } finally { setLoading(false); }
  };
  const fetchDistributors = async () => {
    try { const r = await distributorsAPI.getAll(); setDistributors(r.data); } catch (e) {}
  };
  const fetchProducts = async () => {
    try { const r = await productsAPI.getAll(); setProducts(r.data); } catch (e) {}
  };
  const fetchTrash = async () => {
    try { const r = await invoicesAPI.getTrash(); setTrashItems(r.data); } catch (e) {}
  };
  const checkDraft = async () => {
    try {
      const r = await invoicesAPI.getDraft();
      if (r.data?.draft_data) { setSavedDraft(r.data.draft_data); setDraftBanner(true); }
    } catch (e) {}
  };

  const applyFilters = () => {
    let f = invoices;
    if (universalSearch.trim()) {
      const q = universalSearch.toLowerCase();
      f = f.filter(i =>
        i.invoice_number?.toLowerCase().includes(q) ||
        i.distributor_name?.toLowerCase().includes(q) ||
        i.status?.toLowerCase().includes(q)
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
    f = [...f].sort((a, b) => {
      const da = daysDiff(a.due_date), db = daysDiff(b.due_date);
      if (da !== null && db !== null) return da - db;
      if (da !== null) return -1; if (db !== null) return 1;
      return new Date(b.purchase_date) - new Date(a.purchase_date);
    });
    setFilteredInvoices(f);
  };

  const getUniqueMonths = () => {
    const s = new Set();
    invoices.forEach(i => s.add(parseLocalDate(i.purchase_date)?.toLocaleString('id-ID', { month: 'long', year: 'numeric' })));
    return Array.from(s).sort();
  };

  const overdueCount = invoices.filter(i => { const d = daysDiff(i.due_date); return d !== null && d < 0 && i.status !== 'Paid'; }).length;
  const soonCount = invoices.filter(i => { const d = daysDiff(i.due_date); return d !== null && d >= 0 && d <= 7 && i.status !== 'Paid'; }).length;

  // ── Item handlers ──
  const updateItem = (idx, field, val) => {
    setItems(prev => { const n = [...prev]; n[idx] = calcItem({ ...n[idx], [field]: val }); return n; });
  };
  const addItem = () => setItems(prev => [...prev, blankItem()]);
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));
  const handleFormChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  // ── Distributor / Product handlers ──
  const handleAddDistributor = async (name) => {
    const res = await distributorsAPI.add(name);
    const saved = res.data.name;
    setDistributors(prev => prev.some(d => d.name === saved) ? prev : [...prev, { name: saved }].sort((a, b) => a.name.localeCompare(b.name)));
  };
  const handleRemoveDistributor = async (name) => {
    await distributorsAPI.remove(name);
    setDistributors(prev => prev.filter(d => d.name !== name));
  };
  const handleAddProduct = async (name) => {
    const res = await productsAPI.add(name);
    const saved = res.data.name;
    setProducts(prev => prev.some(p => p.name === saved) ? prev : [...prev, { name: saved }].sort((a, b) => a.name.localeCompare(b.name)));
  };
  const handleRemoveProduct = async (name) => {
    await productsAPI.remove(name);
    setProducts(prev => prev.filter(p => p.name !== name));
  };
  const handleRenameDistributor = async (oldName, newName) => {
    await distributorsAPI.rename(oldName, newName);
    setDistributors(prev => prev.map(d => d.name === oldName ? { name: newName } : d).sort((a,b) => a.name.localeCompare(b.name)));
  };
  const handleRenameProduct = async (oldName, newName) => {
    await productsAPI.rename(oldName, newName);
    setProducts(prev => prev.map(p => p.name === oldName ? { name: newName } : p).sort((a,b) => a.name.localeCompare(b.name)));
  };

  // ── BUILD PAYLOAD ──
  const buildPayload = (f, it, tot) => ({
    ...f, ...tot,
    disc_cod_amount: f.disc_cod_ada ? parseNum(f.disc_cod_amount) : 0,
    items: it.filter(i => i.product_name.trim()).map(i => ({
      product_name: i.product_name, expired_date: i.expired_date || null,
      quantity: parseNum(i.quantity), hna: parseNum(i.hna),
      unit_price: parseNum(i.hna), hna_times_qty: i.hna_times_qty,
      total_price: i.hna_times_qty, disc_percent: parseNum(i.disc_percent),
      disc_nominal: i.disc_nominal, hna_baru: i.hna_baru,
      hna_per_item: i.hna_per_item, hpp_per_item: i.hpp_per_item || 0, margin: 0,
    })),
  });

  // ── SUBMIT — dengan cek duplikat ──
  const handleSubmit = async () => {
    if (!form.invoice_number || !form.purchase_date || !form.distributor_name) {
      alert('Lengkapi No Faktur, Tanggal, dan Distributor'); return;
    }

    const payload = buildPayload(form, items, totals);

    // Cek apakah nomor invoice sudah ada (dan bukan sedang edit invoice itu sendiri)
    const existing = invoices.find(
      inv => inv.invoice_number === form.invoice_number && inv.id !== editingId
    );

    if (existing && !editingId) {
      // Tampilkan konfirmasi duplikat
      setDupConfirm({
        invoiceNumber: form.invoice_number,
        existingId: existing.id,
        pendingPayload: payload,
      });
      return;
    }

    // Tidak duplikat atau sudah di-edit mode — langsung simpan
    await doSave(payload);
  };

  const doSave = async (payload) => {
    try {
      let savedInvoice;
      if (editingId) {
        const res = await invoicesAPI.update(editingId, payload);
        savedInvoice = res.data;
        // Optimistic update — langsung ganti di state tanpa refetch
        setInvoices(prev => prev.map(inv =>
          inv.id === editingId
            ? { ...inv, ...savedInvoice,
                item_count: payload.items?.length || inv.item_count,
                total_qty: payload.items?.reduce((s,i) => s + (Number(i.quantity)||0), 0) || inv.total_qty }
            : inv
        ));
      } else {
        const res = await invoicesAPI.create(payload);
        savedInvoice = res.data?.invoice || res.data;
        // Add new invoice to top of list
        setInvoices(prev => [
          { ...savedInvoice,
            item_count: payload.items?.length || 0,
            total_qty: payload.items?.reduce((s,i) => s + (Number(i.quantity)||0), 0) || 0 },
          ...prev
        ]);
      }
      try { await invoicesAPI.clearDraft(); } catch(e) {}
      setSavedDraft(null); setDraftBanner(false);
      fetchDistributors(); fetchProducts();
      resetForm(); setShowModal(false);
    } catch (err) {
      alert('Error: ' + (err.response?.data?.error || err.message));
    }
  };

  // ── Duplicate Dialog Handlers ──

  // Tambah produk ke invoice yang ada — merge & langsung save
  const handleDupLoadExisting = async () => {
    if (!dupConfirm) return;
    const { existingId, pendingPayload } = dupConfirm;
    setDupConfirm(null);
    try {
      // 1. Fetch existing invoice items
      const getRes = await invoicesAPI.getById(existingId);
      const { invoice, items: existingItems } = getRes.data;

      // 2. Normalize existing items
      const normalizedExisting = existingItems.map(i => ({
        product_name: i.product_name || '',
        expired_date: i.expired_date || null,
        quantity: parseNum(i.quantity),
        hna: parseNum(i.hna || i.unit_price),
        unit_price: parseNum(i.hna || i.unit_price),
        hna_times_qty: parseNum(i.hna_times_qty || i.total_price),
        total_price: parseNum(i.hna_times_qty || i.total_price),
        disc_percent: parseNum(i.disc_percent),
        disc_nominal: parseNum(i.disc_nominal),
        hna_baru: parseNum(i.hna_baru),
        hna_per_item: parseNum(i.hna_per_item),
        margin: 0,
      }));

      // 3. New items from current form (filter valid only)
      const newItems = pendingPayload.items || [];

      // 4. Merge: existing + new items
      const mergedItems = [...normalizedExisting, ...newItems];

      // 5. Recalculate totals from merged items
      const totalHna = mergedItems.reduce((s, i) => s + (i.hna_times_qty || 0), 0);
      const totalDisc = mergedItems.reduce((s, i) => s + (i.disc_nominal || 0), 0);
      const hnaBaru = mergedItems.reduce((s, i) => s + (i.hna_baru || 0), 0);
      const discCodAda = invoice.disc_cod_ada || false;
      const discCodAmount = discCodAda ? parseNum(invoice.disc_cod_amount) : 0;
      const hnaFinal = hnaBaru - discCodAmount;
      const ppnMasukan = Math.round(hnaFinal * 0.11 * 100) / 100;
      const ppnPembulatan = Math.round(ppnMasukan);
      const hnaPlus = hnaFinal + ppnPembulatan;
      const totalQty = mergedItems.reduce((s, i) => s + parseNum(i.quantity), 0);
      const hargaPerProduk = totalQty > 0 ? Math.round(hnaPlus / totalQty) : 0;

      const mergedPayload = {
        invoice_number: invoice.invoice_number,
        purchase_date: invoice.purchase_date,
        distributor_name: invoice.distributor_name,
        disc_cod_ada: discCodAda,
        disc_cod_amount: discCodAmount,
        due_date: invoice.due_date || null,
        payment_date: invoice.payment_date || null,
        status: invoice.status,
        total_hna: totalHna,
        discount_amount: totalDisc,
        hna_baru: hnaBaru,
        hna_final: hnaFinal,
        ppn_masukan: ppnMasukan,
        ppn_pembulatan: ppnPembulatan,
        hna_plus_ppn: hnaPlus,
        harga_per_produk: hargaPerProduk,
        items: mergedItems,
      };

      // 6. Save langsung + optimistic update
      const updateRes = await invoicesAPI.update(existingId, mergedPayload);
      const savedInvoice = updateRes.data;
      setInvoices(prev => prev.map(inv =>
        inv.id === existingId
          ? { ...inv, ...savedInvoice,
              item_count: mergedItems.length,
              total_qty: mergedItems.reduce((s,i) => s + (Number(i.quantity)||0), 0) }
          : inv
      ));
      try { await invoicesAPI.clearDraft(); } catch(e) {}
      setSavedDraft(null); setDraftBanner(false);
      fetchDistributors(); fetchProducts();
      resetForm(); setShowModal(false);
    } catch (err) {
      alert('Error: ' + (err.response?.data?.error || err.message));
    }
  };

  // Batal — user ganti nomor invoice sendiri
  const handleDupCancel = () => setDupConfirm(null);

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
        due_date: invoice.due_date?.split('T')[0] || '',
        payment_date: invoice.payment_date?.split('T')[0] || '',
        status: invoice.status,
        total_hna: invoice.total_hna || 0, hna_baru: invoice.hna_baru || 0,
        hna_final: invoice.hna_final || invoice.final_hna || 0,
        ppn_masukan: invoice.ppn_masukan || invoice.ppn_input || 0,
        ppn_pembulatan: invoice.ppn_pembulatan || 0,
        hna_plus_ppn: invoice.hna_plus_ppn || 0, harga_per_produk: invoice.harga_per_produk || 0,
      });
      setItems(invItems.length > 0
        ? invItems.map(i => calcItem({
            _id: Math.random().toString(36).slice(2),
            product_name: i.product_name || '',
            expired_date: i.expired_date?.split('T')[0] || '',
            quantity: i.quantity || '', hna: i.hna || i.unit_price || '',
            hna_times_qty: i.hna_times_qty || i.total_price || 0,
            disc_percent: i.disc_percent || '', disc_nominal: i.disc_nominal || 0,
            hna_baru: i.hna_baru || 0, hna_per_item: i.hna_per_item || 0,
          }))
        : [blankItem()]
      );
      setEditingId(inv.id); setShowModal(true);
    } catch (err) { alert('Error loading invoice'); }
  };

  const handleDeleteRequest = (inv) => setDeleteConfirm({ id: inv.id, name: inv.invoice_number });
  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    try { await invoicesAPI.softDelete(deleteConfirm.id); fetchInvoices(); setDeleteConfirm(null); }
    catch (e) { alert('Error'); }
  };
  const handleRestore = async (id) => {
    try { await invoicesAPI.restore(id); fetchTrash(); fetchInvoices(); } catch (e) {}
  };
  const handlePermanentDelete = async (id) => {
    if (!window.confirm('Hapus permanen? Tidak bisa di-undo.')) return;
    try { await invoicesAPI.permanentDelete(id); fetchTrash(); } catch (e) {}
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

  const handleExcelImport = async (event) => {
    const file = event.target.files[0]; if (!file) return;
    try {
      const wb = XLSX.read(file, { type: 'array' });
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      let count = 0;
      for (const row of data) {
        try {
          await invoicesAPI.create({
            invoice_number: row['No Faktur'] || `INV-${Date.now()}`,
            purchase_date: new Date(row['Tanggal Belanja/ Faktur'] || row['purchase_date']).toISOString().split('T')[0],
            distributor_name: (row['Distributor'] || 'Unknown').trim(),
            total_hna: parseFloat(row['HNA*QTY'] || 0),
            discount_amount: parseFloat(row['DISC'] || 0),
            ppn_masukan: parseFloat(row['PPN MASUKAN'] || 0),
            ppn_input: parseFloat(row['PPN MASUKAN'] || 0),
            hna_final: parseFloat(row['HNA FINAL'] || 0),
            payment_date: null, status: 'Pending',
          });
          count++;
        } catch (e) { console.warn('Skip row'); }
      }
      alert(`✅ Imported ${count} invoices`);
      fetchInvoices(); fetchDistributors(); event.target.value = '';
    } catch (e) { alert('Error importing'); }
  };

  const summaryData = filteredInvoices.length > 0 ? filteredInvoices : invoices;
  const sumHna = summaryData.reduce((s, i) => s + parseFloat(i.total_hna || 0), 0);
  const sumFinal = summaryData.reduce((s, i) => s + parseFloat(i.hna_final || i.final_hna || 0), 0);
  const sumPpn = summaryData.reduce((s, i) => s + parseFloat(i.ppn_masukan || i.ppn_input || 0), 0);

  // Styles
  const S = {
    card: { backgroundColor: isDarkMode ? '#1C1C1E' : '#FFFFFF', border: `1px solid ${isDarkMode ? '#2C2C2E' : '#E5E5EA'}`, borderRadius: '12px' },
    input: { width: '100%', padding: '10px 12px', border: `1px solid ${isDarkMode ? '#3A3A3C' : '#D1D1D6'}`, borderRadius: '10px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', color: isDarkMode ? '#FFF' : '#000', fontSize: '14px', outline: 'none', boxSizing: 'border-box' },
    inputDis: { width: '100%', padding: '10px 12px', border: `1px solid ${isDarkMode ? '#2C2C2E' : '#E5E5EA'}`, borderRadius: '10px', backgroundColor: isDarkMode ? '#1C1C1E' : '#E5E5EA', color: isDarkMode ? '#636366' : '#8E8E93', cursor: 'not-allowed', fontSize: '14px', boxSizing: 'border-box' },
    label: { display: 'block', fontSize: '11px', fontWeight: '700', marginBottom: '6px', color: isDarkMode ? '#EBEBF0' : '#3A3A3C', letterSpacing: '0.05em', textTransform: 'uppercase' },
    computed: { width: '100%', padding: '10px 12px', border: `1px solid ${isDarkMode ? '#2C2C2E' : '#E5E5EA'}`, borderRadius: '10px', backgroundColor: isDarkMode ? '#1C1C1E' : '#E5E5EA', color: isDarkMode ? '#30D158' : '#1C7C2A', fontWeight: '600', cursor: 'not-allowed', fontSize: '14px', boxSizing: 'border-box' },
  };

  if (loading) return <div style={{ padding: '2rem', marginLeft: isSidebarOpen ? '256px' : '80px' }}>Loading...</div>;

  return (
    <div style={{ padding: '2rem', marginLeft: isSidebarOpen ? '256px' : '80px', backgroundColor: isDarkMode ? '#000' : '#F5F5F7', minHeight: '100vh', transition: 'margin-left 0.3s' }}>

      {/* Header */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: '700', margin: '0 0 4px 0', color: isDarkMode ? '#FFF' : '#000' }}>📄 Invoice Management</h1>
          <p style={{ margin: 0, fontSize: '14px', color: '#86868B' }}>Faktur Pembelian — CV Habil</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {overdueCount > 0 && (
            <div onClick={() => { setFilterDue('overdue'); setShowFilters(true); }} style={{ cursor: 'pointer', padding: '8px 14px', backgroundColor: '#FF3B3018', border: '1px solid #FF3B30', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertTriangle size={14} color="#FF3B30" />
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#FF3B30' }}>{overdueCount} Terlambat</span>
            </div>
          )}
          {soonCount > 0 && (
            <div onClick={() => { setFilterDue('soon'); setShowFilters(true); }} style={{ cursor: 'pointer', padding: '8px 14px', backgroundColor: '#FF950018', border: '1px solid #FF9500', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={14} color="#FF9500" />
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#FF9500' }}>{soonCount} Jatuh Tempo</span>
            </div>
          )}
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
          { label: 'Jumlah Faktur', value: `${summaryData.length} faktur`, icon: '📋', color: '#AF52DE' },
        ].map((m, i) => (
          <div key={i} style={{ ...S.card, padding: '1.25rem' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '6px' }}>{m.icon}</div>
            <p style={{ margin: '0 0 4px', fontSize: '11px', fontWeight: '700', color: '#86868B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.label}</p>
            <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: m.color }}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <button onClick={() => { resetForm(); setShowModal(true); }} style={{ padding: '10px 20px', backgroundColor: '#007AFF', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={16} /> Add Invoice
        </button>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleExcelImport} style={{ display: 'none' }} />
        <button onClick={() => fileInputRef.current?.click()} style={{ padding: '10px 20px', backgroundColor: '#34C759', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Upload size={16} /> Import Excel
        </button>
        <button onClick={() => { setShowTrash(!showTrash); if (!showTrash) fetchTrash(); }} style={{ padding: '10px 16px', backgroundColor: showTrash ? '#FF3B30' : (isDarkMode ? '#2C2C2E' : '#E5E5EA'), color: showTrash ? 'white' : (isDarkMode ? '#FFF' : '#000'), border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Trash2 size={16} /> Trash
        </button>
      </div>

      {/* Universal Search + Filter */}
      <div style={{ ...S.card, padding: '1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: showFilters ? '12px' : '0' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', borderRadius: '10px', border: `1px solid ${isDarkMode ? '#3A3A3C' : '#D1D1D6'}` }}>
            <Search size={16} color="#86868B" />
            <input value={universalSearch} onChange={e => setUniversalSearch(e.target.value)}
              placeholder="Cari no. faktur, distributor, status..."
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
                  <option value="all">Semua</option><option value="Pending">Pending</option><option value="Paid">Paid</option>
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
          {trashItems.length === 0 ? (
            <p style={{ color: '#86868B', fontSize: '13px', textAlign: 'center', padding: '1rem' }}>Trash kosong</p>
          ) : trashItems.map(inv => (
            <div key={inv.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderRadius: '8px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F9F9F9', marginBottom: '6px', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: '700', fontSize: '13px', color: isDarkMode ? '#FFF' : '#000' }}>{inv.invoice_number}</span>
                <span style={{ fontSize: '12px', color: '#86868B', marginLeft: '10px' }}>{inv.distributor_name}</span>
                <span style={{ fontSize: '11px', color: '#FF3B30', marginLeft: '10px' }}>Dihapus: {formatLocalDate(inv.deleted_at)}</span>
              </div>
              <button onClick={() => handleRestore(inv.id)} style={{ padding: '6px 12px', backgroundColor: '#34C759', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <RotateCcw size={12} /> Restore
              </button>
              <button onClick={() => handlePermanentDelete(inv.id)} style={{ padding: '6px 12px', backgroundColor: '#FF3B30', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                Hapus Permanen
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Invoice Table */}
      <div style={{ ...S.card, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 110px 130px 130px 150px 110px 120px', padding: '12px 16px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', borderBottom: `1px solid ${isDarkMode ? '#3A3A3C' : '#E5E5EA'}` }}>
          {['No Faktur', 'Distributor', 'Tgl Faktur', 'HNA*QTY', 'HNA Final', 'HNA+PPN', 'Status', 'Aksi'].map(h => (
            <div key={h} style={{ fontSize: '11px', fontWeight: '700', color: '#86868B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</div>
          ))}
        </div>
        {filteredInvoices.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#86868B' }}>
            {invoices.length === 0 ? 'Belum ada faktur' : 'Tidak ada yang cocok dengan pencarian'}
          </div>
        ) : filteredInvoices.map(inv => (
          <InvoiceRow key={inv.id} inv={inv} isDarkMode={isDarkMode}
            expanded={!!expandedRows[inv.id]}
            onToggleExpand={() => setExpandedRows(prev => ({ ...prev, [inv.id]: !prev[inv.id] }))}
            onEdit={() => handleEdit(inv)} onDelete={() => handleDeleteRequest(inv)} formatRp={formatRp} />
        ))}
      </div>

      {/* ── Duplicate Confirm Dialog ── */}
      {dupConfirm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ backgroundColor: isDarkMode ? '#1C1C1E' : '#FFF', borderRadius: '16px', padding: '28px', maxWidth: '400px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#FF950020', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <AlertTriangle size={26} color="#FF9500" />
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: '17px', fontWeight: '700', color: isDarkMode ? '#FFF' : '#000', textAlign: 'center' }}>
              Invoice sudah ada!
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: '14px', color: '#86868B', textAlign: 'center' }}>
              Nomor faktur <strong style={{ color: isDarkMode ? '#FFF' : '#000' }}>{dupConfirm.invoiceNumber}</strong> sudah tersimpan sebelumnya.
            </p>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#86868B', textAlign: 'center' }}>Mau ngapain?</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Opsi 1: Tambah produk ke invoice yang ada */}
              <button onClick={handleDupLoadExisting} style={{ padding: '13px', backgroundColor: '#007AFF', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '14px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span>➕ Tambah Produk ke Invoice Ini</span>
                <span style={{ fontSize: '11px', fontWeight: '400', opacity: 0.85 }}>Load data existing, kamu bisa tambah produk baru</span>
              </button>

              {/* Opsi 2: Batal */}
              <button onClick={handleDupCancel} style={{ padding: '12px', backgroundColor: 'transparent', color: '#86868B', border: `1px solid ${isDarkMode ? '#2C2C2E' : '#E5E5EA'}`, borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>
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
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#FF3B3020', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Trash2 size={24} color="#FF3B30" />
            </div>
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

      {/* Modal */}
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
function InvoiceRow({ inv, isDarkMode, expanded, onToggleExpand, onEdit, onDelete, formatRp }) {
  const [hovered, setHovered] = useState(false);
  const sc = inv.status === 'Paid' ? { bg: '#D1FAE5', text: '#065F46' } : { bg: '#FEF3C7', text: '#92400E' };
  const dueStatus = getDueStatus(inv.due_date, inv.status);
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 110px 130px 130px 150px 110px 120px', padding: '14px 16px', borderBottom: `1px solid ${isDarkMode ? '#2C2C2E' : '#F0F0F0'}`, alignItems: 'center', backgroundColor: hovered ? (isDarkMode ? '#2C2C2E' : '#F9F9F9') : (isDarkMode ? '#1C1C1E' : '#FFF'), transition: 'background 0.15s', cursor: inv.item_count > 0 ? 'pointer' : 'default' }}
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        onClick={(e) => { if (e.target.closest('button')) return; if (inv.item_count > 0) onToggleExpand(); }}>
        <div>
          <div style={{ fontWeight: '700', fontSize: '13px', color: '#007AFF' }}>{inv.invoice_number}</div>
          {inv.item_count > 0 && <div style={{ fontSize: '11px', color: '#86868B', marginTop: '2px' }}>{inv.item_count} produk · {inv.total_qty || 0} qty</div>}
          {dueStatus && <div style={{ marginTop: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '8px', backgroundColor: dueStatus.bg }}><span style={{ fontSize: '10px', fontWeight: '700', color: dueStatus.color }}>{dueStatus.label}</span></div>}
        </div>
        <div>
          <div style={{ fontWeight: '600', fontSize: '13px', color: isDarkMode ? '#FFF' : '#000' }}>{inv.distributor_name}</div>
          {inv.payment_date && <div style={{ fontSize: '11px', color: '#86868B', marginTop: '2px' }}>Bayar: {formatLocalDate(inv.payment_date)}</div>}
          {inv.due_date && inv.status !== 'Paid' && <div style={{ fontSize: '11px', color: '#86868B', marginTop: '2px' }}>Jatuh tempo: {formatLocalDate(inv.due_date)}</div>}
        </div>
        <div style={{ fontSize: '13px', color: isDarkMode ? '#EBEBF0' : '#3A3A3C' }}>{formatLocalDate(inv.purchase_date, { day: '2-digit', month: 'short', year: 'numeric' })}</div>
        <div>
          <div style={{ fontSize: '13px', fontWeight: '600', color: isDarkMode ? '#FFF' : '#000' }}>{formatRp(inv.total_hna)}</div>
          {inv.discount_amount > 0 && <div style={{ fontSize: '11px', color: '#FF3B30' }}>Disc: {formatRp(inv.discount_amount)}</div>}
        </div>
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#34C759' }}>{formatRp(inv.hna_final || inv.final_hna)}</div>
        <div>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#007AFF' }}>{formatRp(inv.hna_plus_ppn)}</div>
          <div style={{ fontSize: '11px', color: '#86868B' }}>PPN: {formatRp(inv.ppn_masukan || inv.ppn_input, true)}</div>
        </div>
        <div><span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '700', backgroundColor: sc.bg, color: sc.text }}>{inv.status}</span></div>
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          {inv.item_count > 0 && (
            <button onClick={onToggleExpand} style={{ padding: '6px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
              {expanded ? <ChevronUp size={14} color="#86868B" /> : <ChevronDown size={14} color="#86868B" />}
            </button>
          )}
          <button onClick={onEdit} style={{ padding: '6px 10px', backgroundColor: '#007AFF', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Edit</button>
          <button onClick={onDelete} style={{ padding: '6px', backgroundColor: '#FF3B30', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}><Trash2 size={13} /></button>
        </div>
      </div>
      {expanded && <ExpandedItems invoiceId={inv.id} isDarkMode={isDarkMode} formatRp={formatRp} />}
    </>
  );
}

function ExpandedItems({ invoiceId, isDarkMode, formatRp }) {
  const [items, setItems] = useState(null);
  useEffect(() => { invoicesAPI.getById(invoiceId).then(r => setItems(r.data.items)).catch(() => setItems([])); }, [invoiceId]);
  if (!items) return <div style={{ padding: '12px 24px', backgroundColor: isDarkMode ? '#111' : '#FAFAFA', fontSize: '13px', color: '#86868B' }}>Memuat...</div>;
  if (!items.length) return null;
  const cols = '2fr 80px 100px 100px 80px 110px 100px 100px 110px';
  return (
    <div style={{ backgroundColor: isDarkMode ? '#111' : '#FAFAFA', borderBottom: `1px solid ${isDarkMode ? '#2C2C2E' : '#E5E5EA'}`, padding: '8px 24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '8px', padding: '6px 0', borderBottom: `1px solid ${isDarkMode ? '#2C2C2E' : '#E5E5EA'}`, marginBottom: '4px' }}>
        {['Nama Produk', 'QTY', 'HNA', 'HNA*QTY', 'Disc%', 'Disc Nominal', 'HNA Baru', 'HPP/Item', 'HPP+PPN/Item'].map(h => (
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
          <div style={{ fontSize: '13px', color: isDarkMode ? '#FFF' : '#000' }}>{formatRp(item.hna || item.unit_price)}</div>
          <div style={{ fontSize: '13px', color: isDarkMode ? '#FFF' : '#000' }}>{formatRp(item.hna_times_qty || item.total_price)}</div>
          <div style={{ fontSize: '13px', color: '#FF3B30' }}>{item.disc_percent || 0}%</div>
          <div style={{ fontSize: '13px', color: '#FF3B30' }}>{formatRp(item.disc_nominal)}</div>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#34C759' }}>{formatRp(item.hna_baru)}</div>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#AF52DE' }}>{formatRp(item.hna_per_item)}</div>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#007AFF' }}>{formatRp(item.hpp_per_item || item.hna_per_item * 1.11)}</div>
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px' }}>
                  <div><label style={{ ...S.label, color: '#86868B' }}>HNA × QTY</label><input style={S.computed} value={formatRpInput(item.hna_times_qty)} readOnly /></div>
                  <div><label style={{ ...S.label, color: '#FF3B30' }}>Disc Nominal</label><input style={{ ...S.inputDis, color: '#FF3B30', fontWeight: '600' }} value={formatRpInput(item.disc_nominal)} readOnly /></div>
                  <div><label style={{ ...S.label, color: isDarkMode ? '#30D158' : '#1C7C2A' }}>HNA Baru</label><input style={S.computed} value={formatRpInput(item.hna_baru)} readOnly /></div>
                  <div><label style={{ ...S.label, color: '#AF52DE' }}>HPP/Item (tanpa PPN)</label><input style={{ ...S.computed, color: '#AF52DE' }} value={formatRpInput(item.hna_per_item)} readOnly /></div>
                  <div><label style={{ ...S.label, color: '#007AFF' }}>HPP/Item (+PPN)</label><input style={{ ...S.computed, color: '#007AFF' }} value={formatRpInput(item.hpp_per_item || item.hna_per_item * 1.11)} readOnly /></div>
                </div>
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
              <div>
                <label style={S.label}>Disc COD</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select value={form.disc_cod_ada ? 'ada' : 'tidak'} onChange={e => onFormChange('disc_cod_ada', e.target.value === 'ada')} style={{ ...S.input, width: '120px', flex: 'none' }}>
                    <option value="tidak">Tidak Ada</option><option value="ada">Ada</option>
                  </select>
                  <input style={form.disc_cod_ada ? S.input : S.inputDis} disabled={!form.disc_cod_ada}
                    value={form.disc_cod_ada ? (form.disc_cod_amount === '' ? '' : formatRpInput(parseNum(form.disc_cod_amount))) : '—'}
                    onChange={e => { const raw = e.target.value.replace(/\./g, '').replace(/[^0-9]/g, ''); onFormChange('disc_cod_amount', raw); }} placeholder="Rp 0" />
                </div>
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
              <div><label style={S.label}>Tanggal Pembayaran Faktur</label><input type="date" style={S.input} value={form.payment_date} onChange={e => onFormChange('payment_date', e.target.value)} /></div>
              <div><label style={S.label}>Status</label>
                <select value={form.status} onChange={e => onFormChange('status', e.target.value)} style={S.input}>
                  <option value="Pending">Pending</option><option value="Paid">Paid</option>
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