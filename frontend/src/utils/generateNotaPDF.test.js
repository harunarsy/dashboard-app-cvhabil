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

  it('mempertahankan judul 12pt dan memakai isi 10pt khusus A6 landscape', () => {
    const fontBefore = (commands, needle) => {
      const index = commands.indexOf(needle);
      if (index < 0) return null;
      const before = commands.slice(0, index);
      const matches = [...before.matchAll(/\/(F\d+) ([\d.]+) Tf/g)];
      return matches.length ? Number(matches[matches.length - 1][2]) : null;
    };

    for (const format of ['A4', 'A5', 'A6']) {
      const doc = generateNotaPDF(createThreeItemDueDateOrder(), { format, settings });
      const commands = doc.internal.pages.slice(1).map((page) => page.join('\n')).join('\n');

      expect(fontBefore(commands, 'NOTA PENJUALAN')).toBe(12);
      const bodySize = format === 'A6' ? 10 : 12;
      expect(fontBefore(commands, 'Produk Bebas Gula')).toBe(bodySize);
      expect(fontBefore(commands, 'GRAND TOTAL:')).toBe(bodySize);
    }
  });

  describe.each(['nota', 'terima'])('ukuran cetak %s', (type) => {
    it.each([
      ['A4', 210, 297],
      ['A5', 210, 148],
      ['A6', 148, 105],
    ])('%s seluruh halaman berukuran %s × %s mm', (format, width, height) => {
      const doc = generateNotaPDF(createCompactMultiBatchOrder(), { format, type, settings });
      for (let page = 1; page <= doc.getNumberOfPages(); page += 1) {
        doc.setPage(page);
        expect(doc.internal.pageSize.getWidth()).toBeCloseTo(width, 0);
        expect(doc.internal.pageSize.getHeight()).toBeCloseTo(height, 0);
      }
    });
  });

  it('Nota Pinjaman A5 tetap portrait', () => {
    const doc = generateNotaPDF(createCompactMultiBatchOrder(), { format: 'A5', type: 'pinjaman', settings });
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(148, 0);
    expect(doc.internal.pageSize.getHeight()).toBeCloseTo(210, 0);
  });

  it.each([['A5', 'nota'], ['A5', 'terima'], ['A6', 'nota'], ['A6', 'terima']])('%s %s satu barang muat dengan tanda tangan dan logo', (format, type) => {
    const order = createThreeItemDueDateOrder();
    order.items = order.items.slice(0, 1);
    order.total = 1065000;
    const doc = generateNotaPDF(order, { format, type, settings: {
      ...settings, logo_data_url: ONE_PIXEL_PNG,
      ketentuan: `${settings.ketentuan} KECUALI ADA CACAT PRODUK ATAU ED TIDAK SESUAI DAN BUKAN KESALAHAN KURIR`,
    } });
    expect(doc.getNumberOfPages()).toBe(1);
    const content = doc.internal.pages[1].join('\n');
    expect(content).toContain('ANPF24W');
    expect(content).toContain('Penerima,');
    expect(content).toContain('Hormat kami,');
    if (type === 'nota') expect(content).toContain('GRAND TOTAL:');
  });

  it('catatan Tanda Terima A6 tidak menempel ke label tanda tangan', () => {
    const order = createCompactMultiBatchOrder();
    order.items = order.items.slice(0, 1);
    order.notes = Array.from({ length: 21 }, (_, index) => `Baris catatan ${index + 1}`).join('\n');
    const doc = generateNotaPDF(order, { format: 'A6', type: 'terima', settings: { ...settings, footer_text: '' } });
    const lastPage = doc.internal.pages[doc.getNumberOfPages()].join('\n');
    const baselines = new Map();
    for (const match of lastPage.matchAll(/BT\n([\s\S]*?)\nET/g)) {
      const block = match[1];
      const y = Number(block.match(/[\d.]+ ([\d.]+) Td/)?.[1]);
      const leading = Number(block.match(/([\d.]+) TL/)?.[1]);
      [...block.matchAll(/\(([^()]+)\) Tj/g)].forEach((text, index) => baselines.set(text[1], y - index * leading));
    }
    expect(baselines.get('Baris catatan 21') - baselines.get('Penerima,')).toBeGreaterThan(8.5);
  });

  it('A6 menulis label Jatuh Tempo Pembayaran lengkap, bukan JT', () => {
    const doc = generateNotaPDF(createThreeItemDueDateOrder(), { format: 'A6', settings });
    const text = doc.internal.pages.flat().join('\n');
    expect(text).toContain('Jatuh Tempo Pembayaran:');
    expect(text).not.toContain('JT:');
  });

  it('A6 tetap menghasilkan PDF bila gambar logo rusak', () => {
    expect(() => generateNotaPDF(createThreeItemDueDateOrder(), {
      format: 'A6', settings: { ...settings, logo_data_url: 'data:image/png;base64,broken' },
    })).not.toThrow();
  });

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

  it('A5 12pt: nota tiga item dengan barcode tetap menyimpan semua baris dan tail utuh', () => {
    const doc = generateNotaPDF(createCompactMultiBatchOrder(), {
      format: 'A5',
      settings,
    });
    const pages = doc.internal.pages.slice(1).map((page) => page.join('\n'));
    const lastPage = pages[pages.length - 1];

    // 12pt menambah tinggi baris: nota pendek boleh memakai halaman lanjutan,
    // yang wajib adalah tidak ada baris hilang dan tail tetap satu halaman.
    expect(doc.getNumberOfPages()).toBeLessThanOrEqual(2);
    expect(pages.join('\n')).toContain('26T0506GU');
    expect(pages.join('\n')).toContain('25Q1102GU');
    expect(pages.join('\n')).toContain('26T0507GU');
    expect(lastPage).toContain('GRAND TOTAL:');
    expect(lastPage).toContain('Penerima,');
  });

  it('A5 12pt: nota tiga item dengan jatuh tempo menyimpan label penuh dan tail utuh', () => {
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
    const pages = doc.internal.pages.slice(1).map((page) => page.join('\n'));

    expect(doc.getNumberOfPages()).toBeLessThanOrEqual(2);
    expect(pages.join('\n')).toContain('Jatuh Tempo Pembayaran:');
    expect(pages[pages.length - 1]).toContain('GRAND TOTAL:');
    expect(pages[pages.length - 1]).toContain('Penerima,');
  });

  it('keeps all three A6 due-date items and the final summary across readable pages', () => {
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

    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    const pages = doc.internal.pages.slice(1).map((page) => page.join('\n'));
    const lastPage = pages[pages.length - 1];
    expect(pages.join('\n')).toContain('Jatuh Tempo Pembayaran:');
    expect(pages.join('\n')).toContain('ANPF24W');
    expect(pages.join('\n')).toContain('ANQF19V');
    expect(pages.join('\n')).toContain('ANPF03VB');
    expect(lastPage).toContain('GRAND TOTAL:');
    expect(lastPage).toContain('Penerima,');
  });

  it('keeps every A6 multi-batch row and the final summary across readable pages', () => {
    const doc = generateNotaPDF(createCompactMultiBatchOrder(), {
      format: 'A6',
      settings,
    });

    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    const pages = doc.internal.pages.slice(1).map((page) => page.join('\n'));
    expect(pages.join('\n')).toContain('26T0506GU');
    expect(pages.join('\n')).toContain('25Q1102GU');
    expect(pages.join('\n')).toContain('26T0507GU');
    const lastPage = pages[pages.length - 1];
    expect(lastPage).toContain('GRAND TOTAL:');
    expect(lastPage).toContain('Penerima,');
  });

  it('A6 12pt: nota enam batch memakai halaman lanjutan tanpa kehilangan baris dan tail tetap di halaman akhir', () => {
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
    const pages = doc.internal.pages.slice(1).map((page) => page.join('\n'));
    const lastPageCommands = pages[pages.length - 1];

    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    for (let index = 1; index <= 6; index += 1) {
      expect(pages.join('\n')).toContain(`26T050${index}GU`);
    }
    expect(lastPageCommands).toContain('26T0506GU');
    expect(lastPageCommands).toContain('NOTE:');
    expect(lastPageCommands).toContain('REK BCA CV HABIL SEJAHTERA BERSAMA 5603004174');
    expect(lastPageCommands).toContain('Penerima,');
  });

  it('A5 12pt: tail tetap menempel di halaman tabel terakhir untuk nota banyak item', () => {
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
    const pages = doc.internal.pages.slice(1).map((page) => page.join('\n'));
    const lastPageCommands = pages[pages.length - 1];
    const allCommands = pages.join('\n');

    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    for (let index = 1; index <= 8; index += 1) {
      expect(allCommands).toContain(`Produk Panjang ${index}`);
    }
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

  it.each(['A4', 'A5', 'A6'])('tanda terima %s mencetak barang tanpa nilai uang dan memakai logo Habil', (format) => {
    const doc = generateNotaPDF(createCompactMultiBatchOrder(), {
      format, type: 'terima', settings: { ...settings, logo_data_url: ONE_PIXEL_PNG },
    });
    const content = doc.internal.pages.flat().join('\n');
    expect(content).toContain('TANDA TERIMA');
    expect(content).toContain('TEST-NOTA-001');
    expect(content).toContain('Produk Nutrisi Vanila');
    expect(content).toContain('Penerima,');
    expect(content).toContain('Hormat kami,');
    expect(content).not.toContain('GRAND TOTAL');
    expect(content).not.toContain('Harga Satuan');
    expect(content).not.toContain('Rp');
    expect(Object.keys(doc.internal.collections.addImage_images || {})).toHaveLength(1);
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
