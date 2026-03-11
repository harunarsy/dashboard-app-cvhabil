import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

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
  rename: (oldName, newName) => api.patch('/distributors', { oldName, newName }),
  remove: (name) => api.delete('/distributors', { data: { name } }),
};

export const productsAPI = {
  getAll: () => api.get('/products'),
  add: (name) => api.post('/products', { name }),
  rename: (oldName, newName) => api.patch('/products', { oldName, newName }),
  remove: (name) => api.delete('/products', { data: { name } }),
};

export default api;