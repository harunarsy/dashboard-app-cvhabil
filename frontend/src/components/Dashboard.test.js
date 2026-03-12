import React from 'react';
// Mock before other imports using a factory to bypass original file logic
jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn()
  }
}));

import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import Dashboard from './Dashboard';
import api from '../services/api';

// Mock lucide-react to avoid issues with icon rendering in tests
jest.mock('lucide-react', () => ({
  Activity: () => <div data-testid="icon-activity" />,
  ShoppingCart: () => <div data-testid="icon-shopping-cart" />,
  Users: () => <div data-testid="icon-users" />,
  Package: () => <div data-testid="icon-package" />,
  Info: () => <div data-testid="icon-info" />,
  X: () => <div data-testid="icon-x" />
}));

describe('Dashboard Component - Loading State', () => {
  const mockStats = {
    totalPenjualan: 1000000,
    suratPesananAktif: 5,
    stokLowExpired: 2,
    totalCustomer: 50
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders skeletons while loading', async () => {
    // Setup API mock to stay pending initially
    let resolveApi;
    const apiPromise = new Promise((resolve) => {
      resolveApi = resolve;
    });
    api.get.mockReturnValue(apiPromise);

    render(<Dashboard isDarkMode={false} isSidebarOpen={true} />);

    // Check if skeletons are present
    // Based on Dashboard.jsx, there should be 4 stats card skeletons
    const skeletons = document.querySelectorAll('.skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
    
    // Specifically check for the height and width patterns used for stats cards
    // Dashboard.jsx uses Skeleton with various widths/heights
    
    // Resolve the API
    await act(async () => {
      resolveApi({ data: mockStats });
    });

    // Wait for the labels to be present
    await waitFor(() => {
      expect(screen.getByText(/Total Penjualan/i)).toBeInTheDocument();
    });

    // Wait for skeletons to disappear (reflecting loading: false)
    await waitFor(() => {
      const skeletons = document.querySelectorAll('.skeleton');
      expect(skeletons.length).toBe(0);
    }, { timeout: 3000 });

    // Verify data is rendered (flexible check for the number)
    expect(screen.getByText(/1\.0M/)).toBeInTheDocument();
    expect(screen.getByText(/^5$/)).toBeInTheDocument();
    expect(screen.getByText(/^50$/)).toBeInTheDocument();
  });
});
