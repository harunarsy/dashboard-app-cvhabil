import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import ProductDrawer from "./ProductDrawer";
import { inventoryAPI } from "../../services/api";

vi.mock("../../services/api", () => ({
  inventoryAPI: { getProductFull: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function renderBatch(expiredDate, precision, now) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  inventoryAPI.getProductFull.mockResolvedValue({
    data: {
      id: 1,
      name: "Produk uji ED",
      unit: "pcs",
      total_stock: 5,
      min_stock: 0,
      latest_hna: 1000,
      sell_price: 2000,
      batches: [{
        id: 10,
        batch_no: "BATCH-ED",
        qty_current: 5,
        hna: 1000,
        tax_type: "nota",
        expired_date: expiredDate,
        expired_date_precision: precision,
      }],
      mutations: [],
    },
  });
  render(<ProductDrawer productId={1} isDarkMode={false} isMobile={false} onClose={() => {}} />);
  const batchTab = await screen.findByRole("button", { name: /^Batch\s*\(\s*1\s*\)$/ });
  fireEvent.click(batchTab);
  const batchHeading = await screen.findByText("BATCH-ED");
  return within(batchHeading.closest(".ui-motion-card"));
}

describe("ProductDrawer status ED", () => {
  it.each([
    [new Date(2027, 4, 12, 0, 1)],
    [new Date(2027, 4, 12, 23, 59)],
  ])("ED day masih berlaku sepanjang hari tanggal ED (%s)", async (now) => {
    const batch = await renderBatch("2027-05-12", null, now);

    expect(batch.queryByText(/EXPIRED/i)).not.toBeInTheDocument();
    expect(batch.getByText(/12 Mei 2027/)).toBeInTheDocument();
  });

  it("ED day expired mulai hari berikutnya", async () => {
    const batch = await renderBatch("2027-05-12", "day", new Date(2027, 4, 13, 0, 1));

    expect(batch.getByText(/EXPIRED.*12 Mei 2027/i)).toBeInTheDocument();
  });

  it("ED besok belum expired walaupun waktu sekarang mendekati tengah malam", async () => {
    const batch = await renderBatch("2027-05-12", "day", new Date(2027, 4, 11, 23, 59));

    expect(batch.queryByText(/EXPIRED/i)).not.toBeInTheDocument();
  });

  it("status timestamp legacy memakai tanggal sumber, bukan hasil konversi UTC", async () => {
    const batch = await renderBatch(
      "2027-05-12T00:30:00+14:00",
      null,
      new Date(2027, 4, 12, 23, 59),
    );

    expect(batch.queryByText(/EXPIRED/i)).not.toBeInTheDocument();
    expect(batch.getByText(/12 Mei 2027/)).toBeInTheDocument();
  });

  it("ED month Februari kabisat berlaku sampai 29 Februari dan tampil bulan", async () => {
    const batch = await renderBatch("2028-02-29", "month", new Date(2028, 1, 29, 23, 59));

    expect(batch.queryByText(/EXPIRED/i)).not.toBeInTheDocument();
    expect(batch.getByText(/Feb 2028/)).toBeInTheDocument();
    expect(batch.queryByText(/29 Feb 2028/)).not.toBeInTheDocument();
  });

  it("ED month Februari kabisat expired mulai 1 Maret", async () => {
    const batch = await renderBatch("2028-02-29", "month", new Date(2028, 2, 1, 0, 1));

    expect(batch.getByText(/EXPIRED.*Feb 2028/i)).toBeInTheDocument();
    expect(batch.queryByText(/29 Feb 2028/)).not.toBeInTheDocument();
  });

  it.each([null, "2027-02-29", "not-a-date"])(
    "ED kosong atau tidak valid (%s) tidak diklasifikasikan expired",
    async (value) => {
      const batch = await renderBatch(value, null, new Date(2027, 2, 1, 12));

      expect(batch.queryByText(/EXPIRED/i)).not.toBeInTheDocument();
    },
  );
});
