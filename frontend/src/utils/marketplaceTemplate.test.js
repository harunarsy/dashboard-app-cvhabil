import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  fillWorkbook,
  parseWorkbook,
} from "./marketplaceTemplate";

const createShopeeWorkbook = () => {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    [
      "et_title_product_name",
      "et_title_variation_price",
      "et_title_variation_stock",
    ],
    ["Produk Uji", 10000, 5],
  ]);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" });
};

describe("marketplace workbook adapter", () => {
  it("parses a Shopee workbook with SheetJS 0.20.3", () => {
    const parsed = parseWorkbook(createShopeeWorkbook());

    expect(parsed.platform).toBe("shopee");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({
      product_name: "Produk Uji",
      price: 10000,
      stock: 5,
    });
  });

  it("writes price and stock updates without changing the workbook contract", () => {
    const output = fillWorkbook(createShopeeWorkbook(), [
      { excelRow: 2, price: 12000, stock: 7 },
    ]);
    const worksheet = XLSX.read(output, { type: "array" }).Sheets.Sheet1;

    expect(worksheet.B2.v).toBe(12000);
    expect(worksheet.C2.v).toBe(7);
  });
});
