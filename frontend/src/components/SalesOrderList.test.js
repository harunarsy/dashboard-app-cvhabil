import React from 'react';
// Mock before other imports
jest.mock('../services/api', () => ({
  salesAPI: {
    getAll: jest.fn(),
    getDraft: jest.fn(),
    saveDraft: jest.fn(),
    clearDraft: jest.fn()
  },
  customersAPI: {
    getAll: jest.fn()
  },
  productsAPI: {
    getAll: jest.fn()
  },
  priceListAPI: {
    getAll: jest.fn(),
    getFeeProfiles: jest.fn()
  },
  inventoryAPI: {
    getProducts: jest.fn()
  },
  printSettingsAPI: {
    get: jest.fn()
  },
  countersAPI: {
    getAll: jest.fn()
  },
  settingsAPI: {
    getProfitThresholds: jest.fn()
  }
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
  useLocation: () => ({ state: null }),
}), { virtual: true });

import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SalesOrderList from './SalesOrderList';
import { salesAPI, customersAPI, productsAPI, priceListAPI, inventoryAPI, printSettingsAPI, countersAPI, settingsAPI } from '../services/api';

// Mock lucide-react
// v1.65.1: dulu daftar-putih 15 ikon — tiap ikon BARU yang dipakai komponen bikin
// test ini gagal dengan "Element type is invalid ... got: undefined", padahal
// produksinya sehat (kejadian saat MessageCircle ditambahkan). Sekarang Proxy:
// nama ikon apa pun otomatis dapat komponen tiruan, jadi test tidak lagi rapuh
// terhadap penambahan ikon. testid tetap mengikuti nama ikonnya.
jest.mock('lucide-react', () => new Proxy({}, {
  get: (_target, name) => {
    if (name === '__esModule') return true;
    const Icon = () => <div data-testid={`icon-${String(name)}`} />;
    Icon.displayName = `MockIcon(${String(name)})`;
    return Icon;
  },
}));

const renderWithQueryClient = (ui) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
};

describe('SalesOrderList Component - Loading State', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default resolves for other APIs
    customersAPI.getAll.mockResolvedValue({ data: [] });
    productsAPI.getAll.mockResolvedValue({ data: [] });
    priceListAPI.getAll.mockResolvedValue({ data: [] });
    priceListAPI.getFeeProfiles.mockResolvedValue({ data: [] });
    inventoryAPI.getProducts.mockResolvedValue({ data: [] });
    printSettingsAPI.get.mockResolvedValue({ data: { nota_layout: {} } });
    countersAPI.getAll.mockResolvedValue({ data: [] });
    settingsAPI.getProfitThresholds.mockResolvedValue({ data: { profit_thresholds: { high: 20, normal: 5, thin: 0 } } });
    salesAPI.getDraft.mockResolvedValue({ data: { draft_data: null } });
    salesAPI.saveDraft.mockResolvedValue({ data: {} });
    salesAPI.clearDraft.mockResolvedValue({ data: {} });
  });

  test('renders table row skeletons while loading', async () => {
    // Setup salesAPI.getAll to stay pending
    let resolveSales;
    const salesPromise = new Promise((resolve) => {
      resolveSales = resolve;
    });
    salesAPI.getAll.mockReturnValue(salesPromise);

    renderWithQueryClient(<SalesOrderList isDarkMode={false} isSidebarOpen={true} />);

    // Check if skeletons are present in the table body
    // SalesOrderList.jsx renders 5 skeleton rows
    const skeletons = document.querySelectorAll('.skeleton');
    expect(skeletons.length).toBeGreaterThan(0);

    // Resolve the API
    await act(async () => {
      resolveSales({ data: [
        { id: 1, order_number: 'NOTA-001', sale_date: '2026-03-12', customer_name: 'Test Customer', total: 150000, payment_method: 'Tunai', status: 'final', items: [] }
      ] });
    });

    // Wait for loading to finish (500ms delay in SalesOrderList.jsx)
    await waitFor(() => {
      expect(screen.getByText('NOTA-001')).toBeInTheDocument();
    }, { timeout: 2000 });

    // Skeletons should be gone
    const remainingSkeletons = document.querySelectorAll('.skeleton');
    expect(remainingSkeletons.length).toBe(0);
  });
});
