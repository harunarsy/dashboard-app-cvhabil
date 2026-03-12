import React from 'react';
// Mock before other imports
jest.mock('../services/api', () => ({
  salesAPI: {
    getAll: jest.fn()
  },
  customersAPI: {
    getAll: jest.fn()
  },
  productsAPI: {
    getAll: jest.fn()
  },
  printSettingsAPI: {
    get: jest.fn()
  }
}));

import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import SalesOrderList from './SalesOrderList';
import { salesAPI, customersAPI, productsAPI, printSettingsAPI } from '../services/api';

// Mock lucide-react
jest.mock('lucide-react', () => ({
  Plus: () => <div data-testid="icon-plus" />,
  Search: () => <div data-testid="icon-search" />,
  Trash2: () => <div data-testid="icon-trash" />,
  Edit2: () => <div data-testid="icon-edit" />,
  X: () => <div data-testid="icon-x" />,
  FileText: () => <div data-testid="icon-file-text" />
}));

describe('SalesOrderList Component - Loading State', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default resolves for other APIs
    customersAPI.getAll.mockResolvedValue({ data: [] });
    productsAPI.getAll.mockResolvedValue({ data: [] });
    printSettingsAPI.get.mockResolvedValue({ data: { nota_layout: {} } });
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
