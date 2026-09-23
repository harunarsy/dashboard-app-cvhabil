import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/api", () => ({
  printSettingsAPI: { get: vi.fn(), update: vi.fn(), save: vi.fn() },
  settingsAPI: { getProfitThresholds: vi.fn(), updateProfitThresholds: vi.fn() },
}));

import { printSettingsAPI, settingsAPI } from "../services/api";
import PrintSettings from "./PrintSettings";

const OLD_LAYOUT = {
  company_name: "CV HABIL SEJAHTERA BERSAMA",
  address: "Jl. Lama No. 1",
  phone: "0851-4117-5248",
  footer_text: "footer lama",
  signer_name: "Harun Al Rasyid, S.Kom",
  bank_info: "BCA CV HABIL SEJAHTERA BERSAMA 5603004174",
  qris_text: "QRIS",
  ketentuan: "ketentuan lama",
  npwp: "93.813.949.0-609.000",
  email: "ops@habil.example",
  future_key: "jangan-hilang",
};

describe("PrintSettings — preservasi kunci nota_layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    printSettingsAPI.get.mockResolvedValue({
      data: { nota_layout: { ...OLD_LAYOUT } },
    });
    printSettingsAPI.update.mockResolvedValue({ data: { success: true } });
    settingsAPI.getProfitThresholds.mockResolvedValue({ data: {} });
  });

  it("menyimpan field yang diedit tanpa menghapus npwp/email/kunci lain", async () => {
    render(
      <MemoryRouter>
        <PrintSettings />
      </MemoryRouter>,
    );
    const addressInput = await screen.findByDisplayValue("Jl. Lama No. 1");
    fireEvent.change(addressInput, { target: { value: "Jl. Baru No. 2" } });
    fireEvent.click(screen.getByRole("button", { name: /simpan perubahan/i }));

    await waitFor(() =>
      expect(printSettingsAPI.update).toHaveBeenCalledTimes(1),
    );
    const payload = printSettingsAPI.update.mock.calls[0][0];
    expect(payload.nota_layout.address).toBe("Jl. Baru No. 2");
    expect(payload.nota_layout.npwp).toBe("93.813.949.0-609.000");
    expect(payload.nota_layout.email).toBe("ops@habil.example");
    expect(payload.nota_layout.future_key).toBe("jangan-hilang");
    expect(payload.nota_layout.company_name).toBe("CV HABIL SEJAHTERA BERSAMA");
  });
});
