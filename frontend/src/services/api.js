import axios from 'axios';

const isLocal = window.location.hostname === 'localhost';
const configuredApiUrl = process.env.REACT_APP_API_URL?.trim();
const localApiFallback = 'http://localhost:5001/api';
const API_BASE_URL = configuredApiUrl || (isLocal ? localApiFallback : '/api');
// Cache bust v2

/* ─── sessionStorage master data cache (60 dtk TTL) ─── */
// TTL dipersingkat 5mnt → 60dtk: multi-operator (Harun/Fivin/Ferry) di device beda,
// perubahan master (customer/produk/distributor) dari 1 device kebaca device lain
// maks 60 dtk (dulu 5 mnt). Mutasi via app tetap langsung invalidate cache lokal.
const CACHE_PREFIX = 'mc_';
const CACHE_TTL = 60 * 1000; // 60 detik

function cacheKey(url) {
  return CACHE_PREFIX + url;
}

function cacheGet(url) {
  try {
    const raw = sessionStorage.getItem(cacheKey(url));
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) {
      sessionStorage.removeItem(cacheKey(url));
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function cacheSet(url, data) {
  try {
    sessionStorage.setItem(cacheKey(url), JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // sessionStorage full or unavailable — silent
  }
}

function cacheInvalidate(prefix) {
  try {
    const toRemove = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX + prefix)) {
        toRemove.push(key);
      }
    }
    toRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    // silent
  }
}
/* ─── end cache ─── */

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

if (configuredApiUrl) {
  console.log(`[API] Initialized with REACT_APP_API_URL override: ${API_BASE_URL}`);
} else if (isLocal) {
  console.log(`[API] Initialized with local fallback endpoint: ${API_BASE_URL}`);
} else {
  console.log(`[API] Initialized with dynamic production endpoint.`);
}

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (username, password) => api.post('/auth/login', { username, password }),
  logout: () => api.post('/auth/logout'),
};

export const ordersAPI = {
  getAll: () => api.get('/orders'),
  create: (data) => api.post('/orders', data),
  update: (id, data) => api.put(`/orders/${id}`, data),
};

export const invoicesAPI = {
  getAll: () => api.get('/invoices', { params: { limit: 5000 } }),
  getById: (id) => api.get(`/invoices/${id}`),
  getTrash: () => api.get('/invoices/trash'),
  getDraft: () => api.get('/invoices/draft'),
  saveDraft: (data) => api.post('/invoices/draft', { draft_data: data }),
  clearDraft: () => api.delete('/invoices/draft/clear'),
  create: (data) => api.post('/invoices', data),
  update: (id, data) => api.put(`/invoices/${id}`, data),
  updatePaymentStatus: (id, status, payment_date) =>
    api.patch(`/invoices/${id}/payment-status`, { status, ...(payment_date && { payment_date }) }),
  softDelete: (id) => api.delete(`/invoices/${id}`),
  restore: (id) => api.put(`/invoices/${id}/restore`),
  permanentDelete: (id) => api.delete(`/invoices/${id}/permanent`),
};

export const distributorsAPI = {
  getAll: (params) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    const url = '/distributors' + qs;
    const cached = cacheGet(url);
    if (cached) return Promise.resolve({ data: cached });
    return api.get('/distributors', { params }).then((res) => {
      cacheSet(url, res.data);
      return res;
    });
  },
  add: (input) => {
    cacheInvalidate('/distributors');
    const rawPayload = typeof input === 'string' ? { name: input } : { ...(input || {}) };
    const name = rawPayload.name ? String(rawPayload.name).trim() : '';
    if (!name) {
      const err = new Error('Nama distributor wajib');
      console.error('[distributorsAPI.add] Invalid payload:', input, err);
      return Promise.reject(err);
    }
    const payload = {
      ...rawPayload,
      name,
      short_code: rawPayload.short_code || null,
      salesman_name: rawPayload.salesman_name || null,
      salesman_phone: rawPayload.salesman_phone || null,
    };
    return api.post('/distributors', payload).catch((e) => {
      console.error('[distributorsAPI.add] Failed:', e.response?.data || e.message);
      throw e;
    });
  },
  remove: (name) => { cacheInvalidate('/distributors'); return api.delete('/distributors', { data: { name } }); },
  rename: (oldName, newName) => { cacheInvalidate('/distributors'); return api.patch('/distributors', { oldName, newName }); },
  // v1.47.0: update penuh (rename + field salesman/short_code) via PATCH.
  update: (oldName, data) => {
    cacheInvalidate('/distributors');
    return api.patch('/distributors', {
      oldName,
      newName: data.name,
      short_code: data.short_code || null,
      salesman_name: data.salesman_name || null,
      salesman_phone: data.salesman_phone || null,
    });
  },
};

export const productsAPI = {
  getAll: (params) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    const url = '/products' + qs;
    const cached = cacheGet(url);
    if (cached) return Promise.resolve({ data: cached });
    return api.get('/products', { params }).then((res) => {
      cacheSet(url, res.data);
      return res;
    });
  },
  add: (input) => {
    cacheInvalidate('/products');
    const payload = typeof input === 'string' ? { name: input } : input;
    if (!payload || (!payload.name)) {
      const err = new Error('product name required');
      console.error('[productsAPI.add] Invalid payload:', payload, err);
      return Promise.reject(err);
    }
    return api.post('/products', payload).catch((e) => {
      console.error('[productsAPI.add] Failed:', e.response?.data || e.message);
      throw e;
    });
  },
  remove: (name) => { cacheInvalidate('/products'); return api.delete('/products', { data: { name } }); },
  rename: (oldName, newName) => { cacheInvalidate('/products'); return api.patch('/products', { oldName, newName }); },
};

export default api;

export const auditAPI = {
  getByInvoice: (id) => api.get(`/invoices/${id}/audit`),
};

export const customersAPI = {
  getAll: (params) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    const url = '/customers' + qs;
    const cached = cacheGet(url);
    if (cached) return Promise.resolve({ data: cached });
    return api.get('/customers', { params }).then((res) => {
      cacheSet(url, res.data);
      return res;
    });
  },
  getById: (id) => api.get(`/customers/${id}`),
  create: (data) => { cacheInvalidate('/customers'); return api.post('/customers', data); },
  update: (id, data) => { cacheInvalidate('/customers'); return api.put(`/customers/${id}`, data); },
  remove: (id) => { cacheInvalidate('/customers'); return api.delete(`/customers/${id}`); },
};

export const priceListAPI = {
  getAll: () => api.get('/price-list'),
  setPrice: (productId, data) => api.put(`/price-list/${productId}`, data),
  getHistory: (productId) => api.get(`/price-list/${productId}/history`),
  getFeeProfiles: () => api.get('/price-list/fee-profiles'),
  updateFeeProfile: (id, data) => api.put(`/price-list/fee-profiles/${id}`, data),
  recommend: (data) => api.post('/price-list/recommend', data),
};

export const insightsAPI = {
  getCustomer: (id, params) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    const url = `/insights/customer/${id}${qs}`;
    const cached = cacheGet(url);
    if (cached) return Promise.resolve({ data: cached });
    return api.get(`/insights/customer/${id}`, { params }).then((res) => {
      cacheSet(url, res.data);
      return res;
    });
  },
  getRestock: () => api.get('/insights/restock'),
  getProductHealth: () => api.get('/insights/product-health'),
  getWeeklySummary: () => api.get('/insights/weekly-summary'),
  getCopurchase: (productName) =>
    api.get('/insights/copurchase', { params: { product_name: productName } }),
  getSalesBaseline: (productName, customerName) =>
    api.get('/insights/baselines/sales', {
      params: { product_name: productName, ...(customerName ? { customer_name: customerName } : {}) },
    }),
  getPurchaseBaseline: (productId) =>
    api.get('/insights/baselines/purchase', { params: { product_id: productId } }),
  getChurn: () => api.get('/insights/churn'),
  getDormant: (minDays) =>
    api.get('/insights/dormant', { params: minDays ? { min_days: minDays } : {} }),
  getEffectiveFees: () => api.get('/insights/effective-fees'),
};

export const salesAPI = {
  getAll: () => api.get('/sales', { params: { limit: 5000 } }),
  getById: (id) => api.get(`/sales/${id}`),
  getDraft: () => api.get('/sales/draft'),
  saveDraft: (data) => api.post('/sales/draft', { draft_data: data }),
  clearDraft: () => api.delete('/sales/draft/clear'),
  create: (data) => api.post('/sales', data),
  update: (id, data) => api.put(`/sales/${id}`, data),
  remove: (id) => api.delete(`/sales/${id}`),
  getTrash: () => api.get('/sales/trash'),
  restore: (id) => api.put(`/sales/${id}/restore`),
  updatePdfStatus: (id, pdf_status) => api.patch(`/sales/${id}/pdf-status`, { pdf_status }),
  updatePaymentStatus: (id, payment_status, paid_at) => api.patch(`/sales/${id}/payment-status`, { payment_status, ...(paid_at && { paid_at }) }),
};

// v1.57.0: pajak — rekap PPN + penandaan PPN keluaran (role direktur/pajak)
export const taxAPI = {
  getSummary: (month) => api.get('/tax/summary', { params: { month } }),
  getNotas: (month) => api.get('/tax/notas', { params: { month } }),
  setPpn: (id, excluded) => api.patch(`/tax/notas/${id}/ppn`, { excluded }),
  exportCsv: (month) => api.get('/tax/export', { params: { month }, responseType: 'blob' }),
};

// v1.54.0: peminjaman produk (nota pinjaman + retur + konversi jadi nota penjualan)
export const loansAPI = {
  getAll: () => api.get('/loans'),
  create: (data) => api.post('/loans', data),
  returnItems: (id, data) => api.post(`/loans/${id}/return`, data),
  convert: (id, data) => api.post(`/loans/${id}/convert`, data),
  remove: (id) => api.delete(`/loans/${id}`),
};

export const inventoryAPI = {
  getProducts: (params) => api.get('/inventory/products', { params }),
  getOpnameTemplate: () => api.get('/inventory/opname-template'),
  getProduct: (id) => api.get(`/inventory/products/${id}`),
  createProduct: (data) => api.post('/inventory/products', data),
  updateProduct: (id, data) => api.put(`/inventory/products/${id}`, data),
  deleteProduct: (id) => api.delete(`/inventory/products/${id}`),
  stockIn: (data) => api.post('/inventory/stock-in', data),
  stockOut: (data) => api.post('/inventory/stock-out', data),
  getAlerts: () => api.get('/inventory/alerts'),
  getMutations: () => api.get('/inventory/mutations'),
  getOpname: () => api.get('/inventory/opname'),
  createOpname: (data) => api.post('/inventory/opname', data),
  getFefoHna: (productId) => api.get(`/inventory/fefo-hna/${productId}`),
  getAvailableBatches: (productId) => api.get(`/inventory/batches-by-product/${productId}`),
  // Phase 1: batch CRUD + product full
  getProductFull: (id) => api.get(`/inventory/products/${id}/full`),
  getProductBatches: (id) => api.get(`/inventory/products/${id}/batches`),
  updateBatch: (id, data) => api.put(`/inventory/batches/${id}`, data),
  deleteBatch: (id) => api.delete(`/inventory/batches/${id}`),
  adjustBatch: (id, data) => api.post(`/inventory/batches/${id}/adjust`, data),
  // v1.7.0: tiered pricing
  getProductTiers: (id) => api.get(`/inventory/products/${id}/tiers`),
  updateProductTiers: (id, tiers) => api.put(`/inventory/products/${id}/tiers`, { tiers }),
};

export const purchaseOrdersAPI = {
  getAll: () => api.get('/purchase-orders'),
  getById: (id) => api.get(`/purchase-orders/${id}`),
  create: (data) => api.post('/purchase-orders', data),
  update: (id, data) => api.put(`/purchase-orders/${id}`, data),
  remove: (id) => api.delete(`/purchase-orders/${id}`),
  receive: (id, data) => api.post(`/purchase-orders/${id}/receive`, data),
};

export const onlineStoreAPI = {
  importCSV: (data) => api.post('/online-store/import', data),
  getSales: (params) => api.get('/online-store/sales', { params }),
  getSummary: () => api.get('/online-store/summary'),
  getWithdrawals: () => api.get('/online-store/withdrawals'),
  createWithdrawal: (data) => api.post('/online-store/withdrawals', data),
};

export const tasksAPI = {
  getAll: () => api.get('/tasks'),
  getTrash: () => api.get('/tasks/trash'),
  getHistory: (id) => api.get(`/tasks/${id}/history`),
  create: (data) => api.post('/tasks', data),
  update: (id, data) => api.put(`/tasks/${id}`, data),
  softDelete: (id) => api.patch(`/tasks/${id}/soft-delete`),
  restore: (id) => api.patch(`/tasks/${id}/restore`),
  permanentDelete: (id) => api.delete(`/tasks/${id}/permanent`),
};

export const ledgerAPI = {
  getAll: (params) => api.get('/ledger', { params }),
  getSummary: () => api.get('/ledger/summary'),
  create: (data) => api.post('/ledger', data),
  update: (id, data) => api.put(`/ledger/${id}`, data),
  remove: (id) => api.delete(`/ledger/${id}`),
};

export const printSettingsAPI = {
  get: () => api.get('/print-settings'),
  save: (key, value) => api.post('/print-settings', { key, value }),
  update: (settings) => api.post('/print-settings/bulk', settings),
};

export const settingsAPI = {
  getProfitThresholds: () => api.get('/settings/profit-thresholds'),
  updateProfitThresholds: (profitThresholds) => api.put('/settings/profit-thresholds', { profit_thresholds: profitThresholds }),
};

export const countersAPI = {
  getAll: () => api.get('/settings/counters'),
  update: (doc_type, data) => api.put(`/settings/counters/${doc_type}`, data),
};

export const reportsAPI = {
  downloadMonthly: (month) =>
    api.get('/reports/monthly', { params: { month }, responseType: 'blob' }),
};

export const financeAPI = {
  getSummary: () => api.get('/finance/summary'),
  markHutangLunas: (invoiceNumber) => api.patch(`/finance/hutang/${invoiceNumber}/lunas`),
};

// v1.45.0: dashboard endpoints (sebelumnya dipanggil via api.get langsung di Dashboard.jsx)
export const dashboardAPI = {
  getStats: (month) => api.get('/dashboard/stats', month ? { params: { month } } : undefined),
  getHeatmap: (month) => api.get(`/dashboard/heatmap`, { params: { month } }),
  getDailyNotas: (date) => api.get(`/dashboard/daily-notas`, { params: { date } }),
};
