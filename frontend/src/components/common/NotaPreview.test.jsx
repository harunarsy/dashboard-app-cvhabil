import React from 'react';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import NotaPreview from './NotaPreview';

const settings = {
  company_name: 'CV HABIL SEJAHTERA BERSAMA',
  npwp: '93.813.949.0-609.000',
  address: 'Jl. Siwalankerto Tengah No.8',
  phone: '0851-4117-5248',
  ketentuan: 'Barang dicek saat terima',
  bank_info: 'BCA CV HABIL SEJAHTERA BERSAMA 5603004174',
  footer_text: 'dengan senang hati melayani anda',
};

const items = [
  {
    product_name: 'Tropicana Slim Diabtx 150 sachet',
    qty: 2,
    unit: 'pcs',
    unit_price: 1000,
    batch_no_snapshot: 'ANG0036CA',
  },
];

// jsdom tidak punya canvas untuk barcode → JsBarcode melempar dan ditangkap komponen.
beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => {
  console.error.mockRestore();
});

describe('NotaPreview (bahasa desain baru, paritas PDF monokrom)', () => {
  it('menampilkan mark H dan palet tinta monokrom — bukan aksen biru', () => {
    render(
      <NotaPreview
        form={{ order_number: 'HSB-NOTA-2609001', customer_name: 'Toko A' }}
        items={items}
        settings={settings}
      />,
    );

    expect(screen.getByAltText('Mark Habil')).toHaveAttribute('src', '/habil-mark.svg');
    expect(screen.getByText('CV HABIL SEJAHTERA BERSAMA')).toHaveStyle({ color: 'rgb(17, 17, 17)' });
    expect(screen.getByText('Nama Barang').closest('tr')).toHaveStyle({
      backgroundColor: 'rgb(232, 232, 232)',
    });
    expect(screen.getByText('NOTE:')).toHaveStyle({ color: 'rgb(17, 17, 17)' });
    expect(screen.getByText(/GRAND TOTAL/)).toBeInTheDocument();
    expect(screen.getByText(/REK BCA/)).toBeInTheDocument();
  });

  it('menampilkan estimasi berat paket bila tersedia (paritas PDF)', () => {
    render(
      <NotaPreview
        form={{ order_number: 'HSB-NOTA-2609002', customer_name: 'Toko B', est_weight_gram: 7000 }}
        items={items}
        settings={settings}
      />,
    );

    expect(screen.getByText('Estimasi Berat Paket: 7,00 kg')).toBeInTheDocument();
  });

  it('tidak menampilkan baris DPP/PPN ketika ppnExcluded aktif', () => {
    render(
      <NotaPreview
        form={{ order_number: 'HSB-NOTA-2609003', customer_name: 'Toko C' }}
        items={items}
        settings={settings}
        ppnExcluded
      />,
    );

    expect(screen.queryByText(/Subtotal \(DPP\)/)).not.toBeInTheDocument();
    expect(screen.getByText(/GRAND TOTAL/)).toBeInTheDocument();
  });
});
