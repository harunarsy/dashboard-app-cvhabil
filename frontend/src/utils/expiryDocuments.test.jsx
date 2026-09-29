import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import NotaPreview from "../components/common/NotaPreview";
import { generateNotaPDF } from "./generateNotaPDF";
import { generateAdjustmentPDF } from "./generateAdjustmentPDF";
import { generateInventoryPDF } from "./generateInventoryPDF";
import { generateOpnamePDF } from "./generateOpnamePDF";
import { buildSalesDocumentViewModel, groupSaleItems } from "./documents/salesDocumentModel";
import { generateSalesDocumentPDF } from "./documents/generateSalesDocumentPDF";
import { allText } from "./documents/__fixtures__/pdfTestUtils";

vi.mock("jsbarcode", () => ({ default: vi.fn() }));
afterEach(cleanup);

const items = ["month", "day"].map((precision) => ({
  product_name: "Produk uji precision",
  product_id: 1,
  qty: 1,
  qty_in_unit: 1,
  unit: "pcs",
  unit_price: 1000,
  batch_id_snapshot: 10,
  batch_no_snapshot: "BATCH-ED",
  expired_date_snapshot: "2028-02-29",
  expired_date_snapshot_precision: precision,
}));
const order = {
  order_number: "HSB-NOTA-2802001",
  customer_name: "Toko uji",
  sale_date: "2028-02-12",
  due_date: "2028-02-29",
  total: 2000,
  items,
};

describe("Dokumen ED precision", () => {
  it("grouping tidak menyatukan month dan day dengan DATE dan batch yang sama", () => {
    expect(groupSaleItems(items)).toHaveLength(2);
    const vm = buildSalesDocumentViewModel(order);
    expect(vm.items.map((item) => item.expiredDatePrecision)).toEqual(["month", "day"]);
  });

  it("preview nota memisahkan ED month/day tanpa memendekkan jatuh tempo", () => {
    render(<NotaPreview form={order} items={items} />);
    expect(screen.getByText(/ED: Feb 2028/)).toBeInTheDocument();
    expect(screen.getByText(/ED: 29 Feb 2028/)).toBeInTheDocument();
    expect(screen.getByText(/Jatuh Tempo Pembayaran/)).toHaveTextContent("29 Feb 2028");
  });

  it.each(["A4", "A5", "A6"])("PDF legacy %s menampilkan precision snapshot", (format) => {
    const text = allText(generateNotaPDF(order, { format }));
    expect(text).toContain("ED: Feb 2028");
    expect(text).toContain("ED: 29 Feb 2028");
    expect(text).toContain("12 Feb 2028");
  });

  it.each(["A4", "A5", "A6"])("PDF v2 %s menampilkan precision snapshot", (format) => {
    const text = allText(generateSalesDocumentPDF(order, { format }));
    expect(text).toContain("ED: Feb 2028");
    expect(text).toContain("ED: 29 Feb 2028");
    expect(text).toContain("12 Feb 2028");
  });

  it("PDF inventory dan opname membawa precision dari setiap batch", () => {
    const rows = ["month", "day"].map((precision, index) => ({
      product_id: 1,
      name: "Produk uji",
      product_name: "Produk uji",
      batch_no: precision === "month" ? "B-MONTH" : "B-DAY",
      expired_date: "2028-02-29",
      expired_date_precision: precision,
      qty_current: 5,
      physical_qty: index + 1,
    }));
    for (const generator of [generateInventoryPDF, generateOpnamePDF]) {
      const text = allText(generator(rows));
      expect(text).toContain("(Feb 2028)");
      expect(text).toContain("(29 Feb 2028)");
    }
  });

  it("PDF adjustment memakai metadata original dan replacement secara terpisah", () => {
    const text = allText(generateAdjustmentPDF({
      type: "exchange",
      adjustment_date: "2028-02-12",
      items: [
        { direction: "returned", original_expired_date: "2028-02-29", original_expired_date_precision: "month" },
        { direction: "replacement", replacement_expired_date: "2028-02-29", replacement_expired_date_precision: "day" },
      ],
    }));
    expect(text).toContain("(Feb 2028)");
    expect(text).toContain("(29 Feb 2028)");
    expect(text).toContain("12/02/2028");
  });
});
