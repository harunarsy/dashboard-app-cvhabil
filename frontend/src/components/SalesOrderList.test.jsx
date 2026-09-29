import React from 'react';
// Mock before other imports
vi.mock('../services/api', () => ({
  salesAPI: {
    getAll: vi.fn(),
    getDraft: vi.fn(),
    saveDraft: vi.fn(),
    clearDraft: vi.fn(),
    updateNotes: vi.fn(),
    getAdjustments: vi.fn(),
    createAdjustment: vi.fn(),
    update: vi.fn(),
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
    getProducts: vi.fn(),
    getProductBatches: vi.fn(),
    getProductTiers: vi.fn(),
  },
  insightsAPI: {
    getCustomer: vi.fn(),
    getCopurchase: vi.fn(),
    getSalesBaseline: vi.fn(),
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

import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SalesOrderList from './SalesOrderList';
import { salesAPI, customersAPI, productsAPI, priceListAPI, inventoryAPI, printSettingsAPI, countersAPI, settingsAPI, insightsAPI } from '../services/api';

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
    inventoryAPI.getProductTiers.mockResolvedValue({ data: [] });
    insightsAPI.getCopurchase.mockResolvedValue({ data: { items: [] } });
    insightsAPI.getSalesBaseline.mockResolvedValue({ data: {} });
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

  test('pilihan Tanda Terima tetap aktif saat ukuran diganti A5, A4, lalu A6', async () => {
    salesAPI.getAll.mockResolvedValue({ data: [
      { id: 11, order_number: 'HSB-NOTA-2609001', sale_date: '2026-09-13',
        customer_name: 'Toko Sehat', customer_address: 'Surabaya', total: 72000,
        payment_method: 'Tunai', status: 'final', items: [{ product_name: 'Produk A', qty: 1, unit_price: 72000 }] },
    ] });
    renderWithQueryClient(<SalesOrderList isDarkMode={false} isSidebarOpen={true} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cetak nota HSB-NOTA-2609001' }));

    const receipt = screen.getByRole('radio', { name: /Tanda Terima/ });
    expect(receipt).toBeEnabled();
    fireEvent.click(receipt);
    expect(receipt).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Ukuran kertas A4' }));
    expect(receipt).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Ukuran kertas A6' }));
    expect(receipt).toBeChecked();
  });

  test.each([
    ['2027-05-12', null],
    ['2027-09-30', 'month'],
    [null, null],
  ])('edit nota mempertahankan snapshot ED %s (%s) walaupun batch terkini berubah', async (snapshotDate, snapshotPrecision) => {
    const order = {
      id: 12, order_number: 'HSB-NOTA-2609002', sale_date: '2026-09-13',
      customer_name: 'Toko uji snapshot', total: 10000, status: 'final',
      items: [{
        product_name: 'Produk uji ED', qty: 1, qty_in_unit: 1, unit: 'pcs',
        unit_price: 10000, unit_hpp: 1000, unit_hpp_tax_type: 'nota',
        batch_id_snapshot: 10, batch_no_snapshot: 'B-LAMA',
        expired_date_snapshot: snapshotDate, expired_date_snapshot_precision: snapshotPrecision,
      }],
    };
    inventoryAPI.getProducts.mockResolvedValue({ data: [{ id: 1, name: 'Produk uji ED', unit: 'pcs' }] });
    inventoryAPI.getProductBatches.mockResolvedValue({ data: [{
      id: 10, batch_no: 'B-BARU', expired_date: '2028-02-29',
      expired_date_precision: 'month', qty_current: 5, hna: 1000, tax_type: 'nota',
    }] });
    salesAPI.getAll.mockResolvedValue({ data: [order] });
    salesAPI.update.mockResolvedValue({ data: order });

    renderWithQueryClient(<SalesOrderList isDarkMode={false} isSidebarOpen={true} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit nota HSB-NOTA-2609002' }));
    await screen.findByRole('option', { name: /B-BARU.*Feb 2028/ });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Perubahan' }));

    await waitFor(() => expect(salesAPI.update).toHaveBeenCalled());
    expect(salesAPI.update.mock.calls[0][1].items[0]).toMatchObject({
      batch_no_snapshot: 'B-LAMA', expired_date_snapshot: snapshotDate,
      expired_date_snapshot_precision: snapshotPrecision,
    });
  });

  const expiryLine = (overrides = {}) => ({
    id: 17, sales_order_id: 12, product_name: 'Produk uji ED', qty: 1, qty_in_unit: 1,
    unit: 'pcs', unit_price: 10000, unit_hpp: 1000, unit_hpp_tax_type: 'nota',
    batch_id_snapshot: 101, batch_no_snapshot: 'B-101',
    expired_date_snapshot: '2027-05-12', expired_date_snapshot_precision: null,
    ...overrides,
  });
  const expiryBatches = [
    { id: 101, batch_no: 'B-101', expired_date: '2028-01-31', expired_date_precision: 'month', qty_current: 5, hna: 1000, tax_type: 'nota' },
    { id: 102, batch_no: 'B-102', expired_date: '2028-02-29', expired_date_precision: 'month', qty_current: 5, hna: 1000, tax_type: 'nota' },
  ];
  const openExpiryOrder = async (items, batches = expiryBatches, products = [{ id: 1, name: 'Produk uji ED', unit: 'pcs', base_unit: 'pcs', pack_size: 1 }]) => {
    const order = {
      id: 12, order_number: 'HSB-NOTA-2609002', sale_date: '2026-09-13',
      customer_name: 'Toko uji snapshot', total: 20000, status: 'final', items,
    };
    inventoryAPI.getProducts.mockResolvedValue({ data: products });
    inventoryAPI.getProductBatches.mockResolvedValue({ data: batches });
    salesAPI.getAll.mockResolvedValue({ data: [order] });
    salesAPI.update.mockResolvedValue({ data: order });
    renderWithQueryClient(<SalesOrderList isDarkMode={false} isSidebarOpen={true} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit nota HSB-NOTA-2609002' }));
    await waitFor(() => {
      expect(screen.getAllByRole('option', { name: 'Pilih Batch' })).toHaveLength(items.length);
    });
    return screen.getAllByRole('option', { name: 'Pilih Batch' }).map((option) => option.closest('select'));
  };
  const saveExpiryOrder = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Perubahan' }));
    await waitFor(() => expect(salesAPI.update).toHaveBeenCalled());
    return salesAPI.update.mock.calls[0][1].items;
  };

  test.each([
    [17, '2027-05-12', null],
    [undefined, '2027-06-30', 'month'],
  ])('fix-wave legacy hydrate item %s: inferred batch ID bukan aksi ganti batch', async (id, date, precision) => {
    await openExpiryOrder([expiryLine({ id, batch_id_snapshot: null, expired_date_snapshot: date, expired_date_snapshot_precision: precision })]);
    const [saved] = await saveExpiryOrder();
    expect(saved).toMatchObject({
      selected_batch_changed: false, batch_no_snapshot: 'B-101',
      expired_date_snapshot: date, expired_date_snapshot_precision: precision,
    });
    if (id != null) expect(saved.id).toBe(id);
  });

  test('fix-wave dua baris produk sama membawa ID masing-masing dan intent hanya pada baris yang batchnya diganti', async () => {
    const pickers = await openExpiryOrder([
      expiryLine(),
      expiryLine({ id: 18, batch_id_snapshot: 102, batch_no_snapshot: 'B-102', expired_date_snapshot: '2027-06-30', expired_date_snapshot_precision: 'month' }),
    ]);
    fireEvent.change(pickers[0], { target: { value: '102' } });
    const saved = await saveExpiryOrder();
    expect(saved).toHaveLength(2);
    expect(saved[0]).toMatchObject({
      id: 17, selected_batch_id: 102, selected_batch_changed: true,
      expired_date_snapshot: '2028-02-29', expired_date_snapshot_precision: 'month',
    });
    expect(saved[1]).toMatchObject({
      id: 18, selected_batch_id: 102, selected_batch_changed: false,
      expired_date_snapshot: '2027-06-30', expired_date_snapshot_precision: 'month',
    });
  });

  test('fix-wave memilih batch sama atau memperbarui HPP tidak mengubah intent/snapshot', async () => {
    const [picker] = await openExpiryOrder([expiryLine()]);
    fireEvent.change(picker, { target: { value: '101' } });
    fireEvent.click(screen.getByRole('button', { name: /Perbarui HPP dari batch terkini/ }));
    const [saved] = await saveExpiryOrder();
    expect(saved).toMatchObject({
      id: 17, selected_batch_changed: false,
      expired_date_snapshot: '2027-05-12', expired_date_snapshot_precision: null,
    });
  });

  test('fix-wave mengosongkan pilihan batch adalah intent eksplisit, bukan no-op legacy', async () => {
    const [picker] = await openExpiryOrder([expiryLine()]);
    fireEvent.change(picker, { target: { value: '' } });
    const [saved] = await saveExpiryOrder();
    expect(saved).toMatchObject({
      id: 17, selected_batch_id: null, selected_batch_changed: true,
      expired_date_snapshot: null, expired_date_snapshot_precision: null,
    });
  });

  test('fix-wave mengganti produk melepas ID sales item lama dan menandai auto-selection FEFO baru', async () => {
    await openExpiryOrder([expiryLine()], expiryBatches, [
      { id: 1, name: 'Produk uji ED', base_unit: 'pcs', pack_size: 1 },
      { id: 2, name: 'Produk Baru', base_unit: 'pcs', pack_size: 1, sell_price: 10000 },
    ]);
    inventoryAPI.getProductBatches.mockImplementation(async (productId) => ({ data: productId === 2 ? [{
      id: 103, batch_no: 'BARU', expired_date: '2028-03-31', expired_date_precision: 'month', qty_current: 5, hna: 1000, tax_type: 'nota',
    }] : expiryBatches }));
    fireEvent.click(screen.getByRole('button', { name: /^Produk uji ED/ }));
    fireEvent.click(screen.getByText('Produk Baru'));
    await screen.findByRole('option', { name: /BARU.*Mar 2028/ });
    const [saved] = await saveExpiryOrder();
    expect(saved.id == null).toBe(true);
    expect(saved).toMatchObject({
      product_name: 'Produk Baru', selected_batch_id: 103, selected_batch_changed: true,
      expired_date_snapshot: '2028-03-31', expired_date_snapshot_precision: 'month',
    });
  });

  test('fix-wave hidrasi nama+DATE membedakan legacy day dari month dengan DATE sama', async () => {
    const [picker] = await openExpiryOrder([expiryLine({ batch_id_snapshot: null, batch_no_snapshot: 'SAMA', expired_date_snapshot: '2028-02-29' })], [
      { ...expiryBatches[0], batch_no: 'SAMA', expired_date: '2028-02-29' },
      { ...expiryBatches[1], batch_no: 'SAMA', expired_date_precision: 'day' },
    ]);
    expect(picker).toHaveValue('102');
    const [saved] = await saveExpiryOrder();
    expect(saved).toMatchObject({ id: 17, selected_batch_changed: false, expired_date_snapshot_precision: null });
  });

  test('fix-wave lookup legacy ambigu tidak memilih salah satu batch terkini secara arbitrer', async () => {
    const [picker] = await openExpiryOrder([expiryLine({ batch_id_snapshot: null, batch_no_snapshot: 'SAMA' })], [
      { ...expiryBatches[0], batch_no: 'SAMA' }, { ...expiryBatches[1], batch_no: 'SAMA' },
    ]);
    expect(picker.value).not.toBe('101');
    expect(picker.value).not.toBe('102');
    const [saved] = await saveExpiryOrder();
    expect(saved).toMatchObject({ id: 17, selected_batch_changed: false, expired_date_snapshot: '2027-05-12', expired_date_snapshot_precision: null });
  });
});
