import { invoiceFormQuantity } from "./invoiceForm";

describe("invoiceFormQuantity", () => {
  it("memakai qty_in_unit untuk faktur dengan satuan pack", () => {
    expect(invoiceFormQuantity({ quantity: 240, qty_in_unit: 4 })).toBe(4);
  });

  it("fallback ke quantity untuk data lama", () => {
    expect(invoiceFormQuantity({ quantity: 24, qty_in_unit: null })).toBe(24);
  });

  it("mempertahankan nilai nol", () => {
    expect(invoiceFormQuantity({ quantity: 12, qty_in_unit: 0 })).toBe(0);
  });
});
