import axios from 'axios';

const isLocal = window.location.hostname === 'localhost';
const API_BASE_URL = isLocal 
  ? 'http://localhost:5006/api' 
  : (process.env.REACT_APP_API_URL || '/api');
// Cache bust v2

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

if (isLocal) {
  console.log(`[API] Initialized with static local endpoint: ${API_BASE_URL}`);
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
  getAll: () => api.get('/invoices'),
  getById: (id) => api.get(`/invoices/${id}`),
  getTrash: () => api.get('/invoices/trash'),
  getDraft: () => api.get('/invoices/draft'),
  saveDraft: (data) => api.post('/invoices/draft', { draft_data: data }),
  clearDraft: () => api.delete('/invoices/draft/clear'),
  create: (data) => api.post('/invoices', data),
  update: (id, data) => api.put(`/invoices/${id}`, data),
  softDelete: (id) => api.delete(`/invoices/${id}`),
  restore: (id) => api.put(`/invoices/${id}/restore`),
  permanentDelete: (id) => api.delete(`/invoices/${id}/permanent`),
};

export const distributorsAPI = {
  getAll: () => api.get('/distributors'),
  add: (name) => api.post('/distributors', { name }),
  remove: (name) => api.delete('/distributors', { data: { name } }),
  rename: (oldName, newName) => api.patch('/distributors', { oldName, newName }),
};

export const productsAPI = {
  getAll: () => api.get('/products'),
  add: (name) => api.post('/products', { name }),
  remove: (name) => api.delete('/products', { data: { name } }),
  rename: (oldName, newName) => api.patch('/products', { oldName, newName }),
};

export default api;

export const auditAPI = {
  getByInvoice: (id) => api.get(`/invoices/${id}/audit`),
};

export const customersAPI = {
  getAll: () => api.get('/customers'),
  getById: (id) => api.get(`/customers/${id}`),
  create: (data) => api.post('/customers', data),
  update: (id, data) => api.put(`/customers/${id}`, data),
  remove: (id) => api.delete(`/customers/${id}`),
};

export const salesAPI = {
  getAll: () => api.get('/sales'),
  getById: (id) => api.get(`/sales/${id}`),
  create: (data) => api.post('/sales', data),
  update: (id, data) => api.put(`/sales/${id}`, data),
  remove: (id) => api.delete(`/sales/${id}`),
  updatePdfStatus: (id, pdf_status) => api.patch(`/sales/${id}/pdf-status`, { pdf_status }),
  updatePaymentStatus: (id, payment_status, paid_at) => api.patch(`/sales/${id}/payment-status`, { payment_status, ...(paid_at && { paid_at }) }),
};

export const inventoryAPI = {
  getProducts: () => api.get('/inventory/products'),
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

export const countersAPI = {
  getAll: () => api.get('/settings/counters'),
  update: (doc_type, data) => api.put(`/settings/counters/${doc_type}`, data),
};