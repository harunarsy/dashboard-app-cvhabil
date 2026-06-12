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
}), { virtual: true });

import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import SalesOrderList from './SalesOrderList';
import { salesAPI, customersAPI, productsAPI, priceListAPI, inventoryAPI, printSettingsAPI, countersAPI, settingsAPI } from '../services/api';

// Mock lucide-react
jest.mock('lucide-react', () => ({
  Plus: () => <div data-testid="icon-plus" />,
  Search: () => <div data-testid="icon-search" />,
  Trash2: () => <div data-testid="icon-trash" />,
  Edit2: () => <div data-testid="icon-edit" />,
  X: () => <div data-testid="icon-x" />,
  FileText: () => <div data-testid="icon-file-text" />,
  ChevronsUpDown: () => <div data-testid="icon-sort" />,
  ChevronUp: () => <div data-testid="icon-chevron-up" />,
  ChevronDown: () => <div data-testid="icon-chevron-down" />,
  ChevronRight: () => <div data-testid="icon-chevron-right" />,
  ArrowLeft: () => <div data-testid="icon-arrow-left" />,
  AlertTriangle: () => <div data-testid="icon-alert" />,
  Clock: () => <div data-testid="icon-clock" />,
  RotateCcw: () => <div data-testid="icon-rotate" />,
  History: () => <div data-testid="icon-history" />
}));

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

    render(<SalesOrderList isDarkMode={false} isSidebarOpen={true} />);

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
