vi.mock('jsbarcode', () => ({ default: vi.fn() }));

import { generateNotaPDF } from './generateNotaPDF';

const ONE_PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('generateNotaPDF compact pagination', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
      configurable: true,
      value: () => ONE_PIXEL_PNG,
    });
  });

  const createCompactMultiBatchOrder = () => ({
    order_number: 'TEST-NOTA-001',
    sale_date: '2026-08-18',
    customer_name: 'PELANGGAN UJI MULTI BATCH',
    customer_phone: '0800-0000-0000',
    customer_address: 'ALAMAT PELANGGAN UJI - KOTA CONTOH',
    payment_method: 'Transfer',
    total: 2160000,
    items: [
      {
        product_name: 'Produk Nutrisi Vanila 174 g',
        qty: 12,
        qty_in_unit: 12,
        unit: 'pcs',
        unit_price: 72000,
        batch_no_snapshot: '26T0506GU',
        expired_date_snapshot: '2027-12-02',
      },
      {
        product_name: 'Produk Nutrisi Vanila 174 g',
        qty: 12,
        qty_in_unit: 12,
        unit: 'pcs',
        unit_price: 72000,
        batch_no_snapshot: '25Q1102GU',
        expired_date_snapshot: '2027-09-11',
      },
      {
        product_name: 'Produk Nutrisi Vanila 174 g',
        qty: 6,
        qty_in_unit: 6,
        unit: 'pcs',
        unit_price: 72000,
        batch_no_snapshot: '26T0507GU',
        expired_date_snapshot: '2027-12-02',
      },
    ],
  });

  const settings = {
    company_name: 'CV HABIL SEJAHTERA BERSAMA',
    address: 'Jl. Siwalankerto Tengah No.8, Wonocolo, Surabaya. 60236',
    phone: '0851-4117-5248',
    bank_info: 'BCA CV HABIL SEJAHTERA BERSAMA 5603004174',
    ketentuan: 'HARAP MENGECEK KEMBALI BARANG YANG DITERIMA\nWAJIB VIDEO UNBOXING APABILA PENGIRIMAN MENGGUNAKAN EKSPEDISI\nBARANG YANG SUDAH DIBELI TIDAK DAPAT DIKEMBALIKAN',
    footer_text: 'dengan senang hati melayani anda',
  };

  const createThreeItemDueDateOrder = () => ({
    order_number: 'TEST-NOTA-002',
    sale_date: '2026-09-02',
    due_date: '2026-09-02',
    customer_name: 'PELANGGAN UJI TIGA ITEM',
    customer_phone: '0800-1111-2222',
    customer_address: 'Gedung Pelanggan Uji Jalan Raya Kota Contoh',
    payment_method: 'Transfer',
    total: 1968000,
    items: [
      {
        product_name: 'Produk Bebas Gula Rasa Madu 350 ml',
        qty: 15,
        qty_in_unit: 15,
        unit: 'pcs',
        unit_price: 71000,
        batch_no_snapshot: 'ANPF24W',
        expired_date_snapshot: '2028-06-24',
      },
      {
        product_name: 'Produk Pemanis Rasa Gula Jawa 350 ml',
        qty: 12,
        qty_in_unit: 12,
        unit: 'pcs',
        unit_price: 68000,
        batch_no_snapshot: 'ANQF19V',
        expired_date_snapshot: '2027-12-19',
      },
      {
        product_name: 'Produk Kecap Manis Rendah Gula 200 ml',
        qty: 3,
        qty_in_unit: 3,
        unit: 'pcs',
        unit_price: 29000,
        batch_no_snapshot: 'ANPF03VB',
        expired_date_snapshot: '2026-12-03',
      },
    ],
  });

  it('keeps a three-item A5 nota with a rendered barcode on one page', () => {
    const doc = generateNotaPDF(createCompactMultiBatchOrder(), {
      format: 'A5',
      settings,
    });

    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('keeps an A5 three-item due-date nota on one page', () => {
    const doc = generateNotaPDF(createThreeItemDueDateOrder(), {
      format: 'A5',
      settings: {
        ...settings,
        ketentuan: [
          'HARAP MENGECEK KEMBALI BARANG YANG DITERIMA',
          'WAJIB VIDEO UNBOXING APABILA PENGIRIMAN MENGGUNAKAN EKSPEDISI',
          'BARANG YANG SUDAH DIBELI TIDAK DAPAT DIKEMBALIKAN KECUALI ADA CACAT PRODUK ATAU ED TIDAK SESUAI DAN BUKAN KESALAHAN KURIR',
        ].join('\n'),
      },
    });

    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('keeps an A6 three-item due-date nota on one page', () => {
    const doc = generateNotaPDF(createThreeItemDueDateOrder(), {
      format: 'A6',
      settings: {
        ...settings,
        ketentuan: [
          'HARAP MENGECEK KEMBALI BARANG YANG DITERIMA',
          'WAJIB VIDEO UNBOXING APABILA PENGIRIMAN MENGGUNAKAN EKSPEDISI',
          'BARANG YANG SUDAH DIBELI TIDAK DAPAT DIKEMBALIKAN KECUALI ADA CACAT PRODUK ATAU ED TIDAK SESUAI DAN BUKAN KESALAHAN KURIR',
        ].join('\n'),
      },
    });

    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('keeps a compact A6 multi-batch nota on one page', () => {
    const doc = generateNotaPDF(createCompactMultiBatchOrder(), {
      format: 'A6',
      settings,
    });

    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('moves notes, bank, and signatures together when an A6 needs a continuation', () => {
    const order = createCompactMultiBatchOrder();
    order.items = Array.from({ length: 6 }, (_, index) => ({
      ...order.items[0],
      batch_no_snapshot: `26T050${index + 1}GU`,
      expired_date_snapshot: `2028-01-${String(index + 2).padStart(2, '0')}`,
    }));

    const doc = generateNotaPDF(order, {
      format: 'A6',
      settings,
    });
    const firstPageCommands = doc.internal.pages[1].join('\n');
    const secondPageCommands = doc.internal.pages[2].join('\n');

    expect(doc.getNumberOfPages()).toBe(2);
    expect(firstPageCommands).toContain('26T0503GU');
    expect(firstPageCommands).not.toContain('26T0504GU');
    expect(secondPageCommands).toContain('26T0504GU');
    expect(secondPageCommands).toContain('NOTE:');
    expect(secondPageCommands).toContain('REK BCA CV HABIL SEJAHTERA BERSAMA 5603004174');
    expect(secondPageCommands).toContain('26T0506GU');
  });

  it('keeps the final tail with the last table page for many A5 items', () => {
    const order = createCompactMultiBatchOrder();
    order.items = Array.from({ length: 8 }, (_, index) => ({
      ...order.items[0],
      product_name: `Produk Panjang ${index + 1}`,
      batch_no_snapshot: `BATCH-${index + 1}`,
    }));

    const doc = generateNotaPDF(order, {
      format: 'A5',
      settings,
    });
    const firstPageCommands = doc.internal.pages[1].join('\n');
    const lastPageCommands = doc.internal.pages[doc.getNumberOfPages()].join('\n');

    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    expect(firstPageCommands).toContain('Produk Panjang 4');
    expect(firstPageCommands).not.toContain('Produk Panjang 5');
    expect(lastPageCommands).toContain('Produk Panjang 5');
    expect(lastPageCommands).toContain('Produk Panjang 8');
    expect(lastPageCommands).toContain('GRAND TOTAL:');
    expect(lastPageCommands).toContain('NOTE:');
    expect(lastPageCommands).toContain('REK BCA CV HABIL SEJAHTERA BERSAMA 5603004174');
  });

  it('supports an empty A4 item list without creating a blank continuation', () => {
    const order = createCompactMultiBatchOrder();
    order.items = [];

    const doc = generateNotaPDF(order, { format: 'A4', settings });
    const pageCommands = doc.internal.pages[1].join('\n');

    expect(doc.getNumberOfPages()).toBe(1);
    expect(pageCommands).toContain('GRAND TOTAL:');
    expect(pageCommands).toContain('Penerima,');
  });

  it('paginates wrapped A6 items across more than two pages without losing rows', () => {
    const order = createCompactMultiBatchOrder();
    order.items = Array.from({ length: 36 }, (_, index) => ({
      ...order.items[0],
      product_name: `Item Uji ${index + 1} dengan nama produk sangat panjang untuk membungkus kolom nota`,
      batch_no_snapshot: `WRAP-${index + 1}`,
    }));

    const doc = generateNotaPDF(order, { format: 'A6', settings });
    const allCommands = doc.internal.pages.flat().join('\n');
    const lastPageCommands = doc.internal.pages[doc.getNumberOfPages()].join('\n');

    expect(doc.getNumberOfPages()).toBeGreaterThan(2);
    for (let index = 1; index <= order.items.length; index += 1) {
      expect(allCommands).toContain(`WRAP-${index}`);
    }
    expect(lastPageCommands).toContain('GRAND TOTAL:');
    expect(lastPageCommands).toContain('Penerima,');
  });

  it('paginates an oversized A6 tail and keeps bank plus signatures on the final page', () => {
    const longTerms = Array.from(
      { length: 55 },
      (_, index) => `Ketentuan uji ${index + 1} dengan uraian panjang yang harus dibungkus dan tidak boleh keluar halaman`,
    ).join('\n');

    const doc = generateNotaPDF(createThreeItemDueDateOrder(), {
      format: 'A6',
      settings: { ...settings, ketentuan: longTerms },
    });
    const allCommands = doc.internal.pages.flat().join('\n');
    const penultimatePageCommands = doc.internal.pages[doc.getNumberOfPages() - 1].join('\n');
    const lastPageCommands = doc.internal.pages[doc.getNumberOfPages()].join('\n');

    expect(doc.getNumberOfPages()).toBeGreaterThan(2);
    expect(allCommands).toContain('Ketentuan uji 1');
    expect(allCommands).toContain('Ketentuan uji 55');
    expect(penultimatePageCommands).not.toContain('REK BCA CV HABIL SEJAHTERA BERSAMA 5603004174');
    expect(lastPageCommands).toContain('REK BCA CV HABIL SEJAHTERA BERSAMA 5603004174');
    expect(lastPageCommands).toContain('Penerima,');
    expect(lastPageCommands).toContain('Hormat kami,');
  });
});
