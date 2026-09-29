import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { InvoiceModal } from './InvoiceList';

// Semua API di-stub: test ini hanya menguji wiring state modal (tidak ada network).
vi.mock('../services/api', () => {
  const apiProxy = new Proxy({}, { get: () => () => Promise.resolve({ data: [] }) });
  return new Proxy({}, { get: () => apiProxy });
});

afterEach(cleanup);

const S = new Proxy({}, { get: () => ({}) });

const baseForm = {
  invoice_number: '',
  purchase_date: '',
  distributor_name: '',
  tax_type: 'faktur',
  ppn_rate: 0.11,
  disc_cod_ada: false,
  disc_cod_amount: '',
  disc_cod_percent: '',
  due_date: '',
  payment_date: '',
  status: 'Pending',
};

const baseItem = (overrides = {}) => ({
  _id: 'row-1',
  product_name: 'Produk ED',
  product_id: null,
  batch_number: 'B-1',
  quantity: '1',
  hna: '100',
  unit: 'pcs',
  disc_mode: 'percent',
  disc_input: '',
  disc_percent: '',
  price_basis: 'hna_exc',
  expired_date: '',
  expired_date_precision: null,
  ...overrides,
});

const renderModal = (items, updateItem) =>
  render(
    <InvoiceModal
      isDarkMode={false}
      isMobile={false}
      form={baseForm}
      items={items}
      totals={{}}
      editingId={null}
      batchEditMode="metadata"
      onBatchEditModeChange={() => {}}
      distributors={[]}
      products={[]}
      refetchProducts={() => {}}
      onAddDistributor={() => {}}
      onRemoveDistributor={() => {}}
      onRenameDistributor={() => {}}
      onFormChange={() => {}}
      updateItem={updateItem}
      addItem={() => {}}
      removeItem={() => {}}
      onSubmit={() => {}}
      onClose={() => {}}
      isSaving={false}
      S={S}
      formatRpInput={(value) => String(value ?? '')}
      parseNum={(value) => parseFloat(value) || 0}
      formatRp={(value) => String(value)}
      purchaseOrders={[]}
      onSelectSP={() => {}}
    />,
  );

describe('InvoiceModal — wiring ED (regresi v1.67.23)', () => {
  it('pilih bulan + tahun memanggil updateItem expired_date & precision, bukan setItems', () => {
    const updateItem = vi.fn();
    renderModal([baseItem()], updateItem);

    fireEvent.change(screen.getByRole('combobox', { name: 'Tahun ED' }), { target: { value: '2027' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Bulan ED' }), { target: { value: '09' } });

    expect(updateItem).toHaveBeenCalledWith(0, 'expired_date', '2027-09');
    expect(updateItem).toHaveBeenCalledWith(0, 'expired_date_precision', 'month');
  });

  it('mode tanggal lengkap memanggil updateItem dengan tanggal exact + precision day', () => {
    const updateItem = vi.fn();
    renderModal([baseItem()], updateItem);

    fireEvent.change(screen.getByRole('combobox', { name: 'Presisi ED' }), { target: { value: 'day' } });
    fireEvent.change(screen.getByLabelText('ED'), { target: { value: '2027-05-12' } });

    expect(updateItem).toHaveBeenCalledWith(0, 'expired_date', '2027-05-12');
    expect(updateItem).toHaveBeenCalledWith(0, 'expired_date_precision', 'day');
  });

  it('menampilkan ED bulan tersimpan sebagai dropdown bulan+tahun terpilih', () => {
    renderModal([baseItem({ expired_date: '2028-02-29', expired_date_precision: 'month' })], vi.fn());

    expect(screen.getByRole('combobox', { name: 'Bulan ED' })).toHaveValue('02');
    expect(screen.getByRole('combobox', { name: 'Tahun ED' })).toHaveValue('2028');
  });

  it('ED legacy (tanggal lengkap tanpa metadata presisi) tetap tampil utuh di mode tanggal', () => {
    renderModal([baseItem({ expired_date: '2027-05-12', expired_date_precision: null })], vi.fn());

    expect(screen.getByLabelText('ED')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('ED')).toHaveValue('2027-05-12');
  });
});
