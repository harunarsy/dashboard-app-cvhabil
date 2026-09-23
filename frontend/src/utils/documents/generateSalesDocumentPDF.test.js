vi.mock('jsbarcode', () => ({ default: vi.fn() }));

import { generateSalesDocumentPDF } from './generateSalesDocumentPDF';
import { buildSalesDocumentViewModel } from './salesDocumentModel';
import { SALES_DOCUMENT_FIXTURES } from './__fixtures__/salesDocumentFixtures';
import { SALES_DOCUMENT_GOLDEN } from './__fixtures__/salesDocumentGolden';
import { allText, dumpPages } from './__fixtures__/pdfTestUtils';

const ONE_PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('generateSalesDocumentPDF', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
      configurable: true,
      value: () => ONE_PIXEL_PNG,
    });
  });

  it('A4 memuat judul formal, identitas, dan nomor nota', () => {
    const { order, settings } = SALES_DOCUMENT_FIXTURES[0];
    const doc = generateSalesDocumentPDF(order, { format: 'A4', settings });
    const text = allText(doc);
    expect(text).toContain('FAKTUR PENJUALAN');
    expect(text).toContain('CV HABIL SEJAHTERA BERSAMA');
    expect(text).toContain(order.order_number);
  });

  it('A4 tidak mencetak placeholder teknis untuk field kosong', () => {
    const { order, settings } = SALES_DOCUMENT_FIXTURES[0];
    const text = allText(generateSalesDocumentPDF(order, { format: 'A4', settings }));
    expect(text).not.toMatch(/undefined|null|NaN/);
    expect(text).not.toContain('Ditagihkan kepada');
  });

  it('field kosong tidak menghasilkan label yatim (kriteria #8)', () => {
    const { order, settings } = SALES_DOCUMENT_FIXTURES[0];
    const text = allText(generateSalesDocumentPDF(order, { format: 'A4', settings }));
    expect(text).not.toContain('NPWP Pembeli:');
    expect(text).not.toContain('No. PO');
  });

  it('nota tanpa PPN menyembunyikan rincian DPP/PPN tanpa mengubah total', () => {
    const { order, settings } = SALES_DOCUMENT_FIXTURES.find((f) => f.id === 'ppn-excluded');
    const text = allText(generateSalesDocumentPDF(order, { format: 'A4', settings }));
    expect(text).not.toContain('DPP:');
    expect(text).not.toContain('PPN ');
    expect(text).toContain('GRAND TOTAL: Rp 500.000');
  });

  it('menerima view-model siap pakai lewat options.vm', () => {
    const { order, settings } = SALES_DOCUMENT_FIXTURES[0];
    const vm = buildSalesDocumentViewModel(order, settings);
    const text = allText(generateSalesDocumentPDF(order, { format: 'A4', settings, vm }));
    expect(text).toContain('HSB-NOTA-2609001');
    expect(text).toContain('GRAND TOTAL: Rp 72.000');
  });

  it('halaman lanjutan membawa konteks dokumen, bukan halaman kosong (kriteria #7)', () => {
    const { order, settings } = SALES_DOCUMENT_FIXTURES.find((f) => f.id === 'many-items-multipage');
    const pages = dumpPages(generateSalesDocumentPDF(order, { format: 'A4', settings }));
    expect(pages).toHaveLength(2);
    expect(pages[0]).not.toContain('GRAND TOTAL:');
    expect(pages[1]).toContain('FAKTUR PENJUALAN - Lanjutan');
    expect(pages[1]).toContain('HSB-NOTA-2609003');
    expect(pages[1]).toContain('GRAND TOTAL:');
    expect(pages[1]).toContain('Penerima,');
  });

  it('daftar item kosong tidak membuat halaman lanjutan kosong', () => {
    const doc = generateSalesDocumentPDF(
      { order_number: 'HSB-NOTA-KOSONG', total: 0, items: [] },
      { format: 'A4' },
    );
    const text = allText(doc);
    expect(doc.getNumberOfPages()).toBe(1);
    expect(text).toContain('GRAND TOTAL: Rp 0');
    expect(text).toContain('Penerima,');
  });

  it('golden render cocok untuk semua fixture (A4 + A5 + A6)', () => {
    for (const [fixtureId, perFormat] of Object.entries(SALES_DOCUMENT_GOLDEN)) {
      const { order, settings } = SALES_DOCUMENT_FIXTURES.find((f) => f.id === fixtureId);
      for (const format of ['A4', 'A5', 'A6']) {
        const golden = perFormat[format];
        if (!golden) continue;
        const doc = generateSalesDocumentPDF(order, { format, settings });
        expect(doc.getNumberOfPages(), `${fixtureId} ${format} page count`).toBe(golden.pages);
        const text = allText(doc);
        for (const fragment of golden.mustContain) {
          expect(text, `${fixtureId} ${format} contains "${fragment}"`).toContain(fragment);
        }
        for (const fragment of golden.mustNotContain || []) {
          expect(text, `${fixtureId} ${format} excludes "${fragment}"`).not.toContain(fragment);
        }
      }
    }
  });

  it('grand total identik antar ukuran (kriteria penerimaan #2)', () => {
    const { order, settings } = SALES_DOCUMENT_FIXTURES.find((f) => f.id === 'five-items');
    const extract = (format) => {
      const text = allText(generateSalesDocumentPDF(order, { format, settings }));
      return text.match(/GRAND TOTAL: (Rp[^\n]*)/)?.[1];
    };
    const values = ['A4', 'A5', 'A6'].map(extract);
    expect(new Set(values).size).toBe(1);
  });

  it('DPP, PPN, ongkir, dan terbilang identik antar ukuran (kriteria penerimaan #2)', () => {
    const { order, settings } = SALES_DOCUMENT_FIXTURES.find((f) => f.id === 'ongkir-and-fee');
    const extract = (format, pattern) => {
      const text = allText(generateSalesDocumentPDF(order, { format, settings }));
      return text.match(pattern)?.[1];
    };
    const fields = [
      ['DPP', /DPP: (Rp [\d.]+)/],
      ['PPN', /PPN 11%: (Rp [\d.]+)/],
      ['Ongkir', /Ongkir: (Rp [\d.]+)/],
      ['Terbilang', /Terbilang: ([^\n)]+)/],
    ];
    for (const [label, pattern] of fields) {
      const values = ['A4', 'A5', 'A6'].map((format) => extract(format, pattern));
      expect(values.every((value) => value !== undefined), `${label} found in all sizes`).toBe(true);
      expect(new Set(values).size, `${label} identical across sizes`).toBe(1);
    }
  });

  it('catatan A6 dibatasi dua baris, ukuran lain tidak dipotong (matriks §9)', () => {
    const notes = [
      'Barang dikirim melalui ekspedisi terpercaya dan wajib diperiksa saat diterima di depan kurir.',
      'Simpan produk pada suhu ruang, jauh dari sinar matahari langsung, dan jangan dibuka sebelum digunakan.',
      'Klaim kekurangan atau kerusakan maksimal satu hari setelah barang diterima dengan menyertakan video unboxing.',
      'Untuk pemesanan ulang, sebutkan nomor nota ini agar riwayat pembelian dapat ditelusuri dengan cepat.',
      'Pembayaran transfer dianggap sah setelah dana diterima dan dikonfirmasi oleh bagian keuangan Habil.',
      'Terima kasih telah berbelanja; kepuasan dan kepercayaan Anda adalah prioritas layanan kami setiap hari.',
      'Kata penutup unik',
    ].join(' ');
    const order = {
      order_number: 'HSB-NOTA-CATATAN',
      sale_date: '2026-09-22',
      customer_name: 'Toko Catatan',
      customer_phone: '0812-0000-0011',
      total: 100000,
      notes,
      items: [{ product_name: 'Produk Uji', qty: 1, qty_in_unit: 1, unit: 'pcs', unit_price: 100000 }],
    };
    const a6 = allText(generateSalesDocumentPDF(order, { format: 'A6' }));
    expect(a6).toContain('Catatan: Barang dikirim');
    expect(a6).toContain(' ...');
    expect(a6).not.toContain('Kata penutup unik');

    const a4 = allText(generateSalesDocumentPDF(order, { format: 'A4' }));
    expect(a4).toContain('Kata penutup unik');
    expect(a4).not.toContain(' ...');
  });

  it('A6 tidak pernah merender blok Referensi Pengadaan generik (spec §8)', () => {
    const base = {
      order_number: 'HSB-NOTA-A6-PROC',
      sale_date: '2026-09-22',
      customer_name: 'RSUD Dr. Soetomo',
      customer_phone: '031-5501000',
      total: 100000,
      items: [{ product_name: 'Produk Uji', qty: 1, qty_in_unit: 1, unit: 'pcs', unit_price: 100000 }],
    };
    const agency = 'Dinas Kesehatan Provinsi Jawa Timur';
    const cases = [
      { label: 'agency-only', extra: { government_agency: agency }, instansiCount: 1 },
      { label: 'method-only', extra: { procurement_method: 'Penunjukan Langsung' }, instansiCount: 0 },
      {
        label: 'method+agency',
        extra: { procurement_method: 'Penunjukan Langsung', government_agency: agency },
        instansiCount: 1,
      },
    ];
    for (const { label, extra, instansiCount } of cases) {
      const text = allText(generateSalesDocumentPDF({ ...base, ...extra }, { format: 'A6' }));
      expect(text, `${label}: blok generik tidak dirender`).not.toContain('Referensi Pengadaan');
      expect(text, `${label}: baris metode tidak bocor`).not.toContain('Metode Pengadaan');
      expect((text.match(/Instansi: /g) || []).length, `${label}: Instansi sekali`).toBe(instansiCount);
      if (instansiCount) {
        expect(text, `${label}: instansi tampil di blok customer`).toContain(`Instansi: ${agency}`);
      }
    }
  });
});
