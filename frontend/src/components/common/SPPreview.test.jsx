import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SPPreview from './SPPreview';

describe('SPPreview (format baru: monokrom + mark H, tanpa harga)', () => {
  it('menampilkan mark H, judul, penerima, dan tabel tanpa kolom harga', () => {
    render(
      <SPPreview
        form={{
          po_number: 'HSB-SP-2609001',
          distributor_name: 'PT Distributor Sejahtera',
          distributor_address: 'Jl. Raya No. 1',
          order_date: '2026-09-26',
          expected_date: '2026-09-30',
          pic_name: 'Harun Al Rasyid',
          notes: 'Kirim pagi',
        }}
        items={[{ product_name: 'Barang A', qty: 2, unit: 'pcs' }]}
        settings={{ company_name: 'CV HABIL SEJAHTERA BERSAMA', npwp: '93.813.949.0-609.000' }}
      />,
    );

    const logo = screen.getByAltText('Mark Habil');
    expect(logo).toHaveAttribute('src', '/habil-mark.svg');
    // Logo ter-center vertikal terhadap blok identitas (pola yang sama dengan PDF SP)
    expect(logo.parentElement).toHaveStyle({ alignItems: 'center' });
    expect(screen.getByText('SURAT PESANAN')).toHaveStyle({ color: 'rgb(17, 17, 17)' });
    expect(screen.getByText('PT Distributor Sejahtera')).toBeInTheDocument();
    expect(screen.getByText('Nama Barang').closest('tr')).toHaveStyle({
      backgroundColor: 'rgb(232, 232, 232)',
    });
    expect(screen.queryByText('Harga Satuan')).not.toBeInTheDocument();
    expect(screen.queryByText(/GRAND TOTAL/)).not.toBeInTheDocument();
    expect(screen.getByText('Hormat Kami,')).toHaveStyle({ color: 'rgb(17, 17, 17)' });
  });

  it('paritas PDF: qty_in_unit diutamakan + sub-line konversi untuk satuan pack', () => {
    render(
      <SPPreview
        form={{ po_number: 'HSB-SP-2609002', distributor_name: 'PT X' }}
        items={[{
          product_name: 'Barang B',
          qty: 48,
          qty_in_unit: 2,
          unit: 'pack',
          pack_size_at_po: 24,
          unit_base: 'pcs',
        }]}
        settings={{}}
      />,
    );

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('(= 48 pcs)')).toBeInTheDocument();
  });
});
