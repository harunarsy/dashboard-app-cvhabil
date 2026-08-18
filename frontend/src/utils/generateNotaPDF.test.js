jest.mock('jsbarcode', () => jest.fn());

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

  const createMultiBatchOrder = () => ({
    order_number: 'HSB-NOTA-2608032',
    sale_date: '2026-08-18',
    customer_name: 'PRAKTIK DR VIKO',
    customer_phone: '+62 822-5766-3816',
    customer_address: 'PRAKTIK DR VIKO - PRAMBON - SIDOARJO',
    payment_method: 'Transfer',
    total: 2160000,
    items: [
      {
        product_name: 'Entramix Vanila 174 g',
        qty: 12,
        qty_in_unit: 12,
        unit: 'pcs',
        unit_price: 72000,
        batch_no_snapshot: '26T0506GU',
        expired_date_snapshot: '2027-12-02',
      },
      {
        product_name: 'Entramix Vanila 174 g',
        qty: 12,
        qty_in_unit: 12,
        unit: 'pcs',
        unit_price: 72000,
        batch_no_snapshot: '25Q1102GU',
        expired_date_snapshot: '2027-09-11',
      },
      {
        product_name: 'Entramix Vanila 174 g',
        qty: 6,
        qty_in_unit: 6,
        unit: 'pcs',
        unit_price: 72000,
        batch_no_snapshot: '26T0506GU',
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

  it('keeps a three-item A5 nota with a rendered barcode on one page', () => {
    const doc = generateNotaPDF(createMultiBatchOrder(), {
      format: 'A5',
      settings,
    });

    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('keeps the Dr Viko A6 multi-batch nota on one page', () => {
    const doc = generateNotaPDF(createMultiBatchOrder(), {
      format: 'A6',
      settings,
    });

    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('moves notes, bank, and signatures together when an A6 needs a continuation', () => {
    const order = createMultiBatchOrder();
    order.items[2] = {
      ...order.items[2],
      batch_no_snapshot: '26T0507GU',
      expired_date_snapshot: '2028-01-02',
    };

    const doc = generateNotaPDF(order, {
      format: 'A6',
      settings,
    });
    const secondPageCommands = doc.internal.pages[2].join('\n');

    expect(doc.getNumberOfPages()).toBe(2);
    expect(secondPageCommands).toContain('NOTE:');
    expect(secondPageCommands).toContain('REK BCA CV HABIL SEJAHTERA BERSAMA 5603004174');
  });
});
