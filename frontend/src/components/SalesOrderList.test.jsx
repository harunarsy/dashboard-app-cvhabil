import React from 'react';
// Mock before other imports
vi.mock('../services/api', () => ({
  salesAPI: {
    getAll: vi.fn(),
    getDraft: vi.fn(),
    saveDraft: vi.fn(),
    clearDraft: vi.fn()
  },
  customersAPI: {
    getAll: vi.fn()
  },
  productsAPI: {
    getAll: vi.fn()
  },
  priceListAPI: {
    getAll: vi.fn(),
    getFeeProfiles: vi.fn()
  },
  inventoryAPI: {
    getProducts: vi.fn()
  },
  printSettingsAPI: {
    get: vi.fn()
  },
  countersAPI: {
    getAll: vi.fn()
  },
  settingsAPI: {
    getProfitThresholds: vi.fn()
  }
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ state: null }),
}));

import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SalesOrderList from './SalesOrderList';
import { salesAPI, customersAPI, productsAPI, priceListAPI, inventoryAPI, printSettingsAPI, countersAPI, settingsAPI } from '../services/api';

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
    vi.clearAllMocks();
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
