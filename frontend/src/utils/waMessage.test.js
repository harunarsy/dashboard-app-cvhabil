import { buildNotaWaMessage } from "./waMessage";

// Regresi v1.65.4 (nota HSB-NOTA-2608018): baris item memakai `qty` (base unit/pcs)
// padahal `unit` + `unit_price` per satuan jual → 4 karton tampil "48 karton" dan
// subtotal 12x lipat, tidak cocok dgn Total. Angka di bawah = kasus asli Omela.
const digitsOf = (s) => (s.match(/[\d.]+/g) || []).map((x) => x.replace(/\./g, ""));

describe("buildNotaWaMessage — qty satuan jual", () => {
  const omela = {
    product_name: "Omela Foaming Milk Professional 1 L",
    qty: 48, // base unit (pcs) — 4 karton x pack_size 12
    qty_in_unit: 4, // yang diketik operator
    unit: "karton",
    unit_price: 212000, // per karton
  };

  it("nota tersimpan: pakai qty_in_unit, subtotal cocok dgn total", () => {
    const msg = buildNotaWaMessage({
      form: { customer_name: "TITIKALAMANGSA" },
      items: [omela],
      total: 848000,
      orderNumber: "HSB-NOTA-2608018",
    });

    expect(msg).toContain("4 karton");
    expect(msg).not.toContain("48 karton");

    // subtotal baris HARUS sama dengan total (nota 1 item)
    const line = msg.split("\n").find((l) => l.startsWith("1."));
    const nums = digitsOf(line);
    expect(nums[nums.length - 1]).toBe("848000");
  });

  it("item form (belum punya qty_in_unit): qty dipakai apa adanya", () => {
    const msg = buildNotaWaMessage({
      items: [{ ...omela, qty: 4, qty_in_unit: undefined }],
      total: 848000,
    });
    expect(msg).toContain("4 karton");
  });

  it("qty_in_unit null dari DB tidak bikin qty jadi 0", () => {
    const msg = buildNotaWaMessage({
      items: [
        {
          product_name: "Entramix Vanila 555 g",
          qty: 10,
          qty_in_unit: null,
          unit: "pcs",
          unit_price: 175000,
        },
      ],
      total: 1750000,
    });
    expect(msg).toContain("10 pcs");
  });
});
