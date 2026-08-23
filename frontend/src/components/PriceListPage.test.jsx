import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("../services/api", () => ({
  __esModule: true,
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  priceListAPI: {
    getAll: vi.fn(),
    setPrice: vi.fn(),
    getHistory: vi.fn(),
    getFeeProfiles: vi.fn(),
    updateFeeProfile: vi.fn(),
    recommend: vi.fn(),
  },
  printSettingsAPI: {
    get: vi.fn(),
  },
}));

vi.mock("./common/Breadcrumb", () => ({
  default: (props) => <div data-testid="breadcrumb">{props.title}</div>,
}));

vi.mock("./common/SearchBox", () => ({
  default: (props) => (
    <input
      aria-label={props.ariaLabel || "search"}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
    />
  ),
}));

vi.mock("./common/Skeleton", () => ({
  default: (props) => <div className="skeleton" style={props.style || {}} />,
}));

vi.mock("./common/ToastNotice", () => ({
  default: ({ message }) =>
    message ? <div role="status">{message}</div> : null,
}));

vi.mock("./common/EmptyState", () => ({
  __esModule: true,
  default: () => <div data-testid="empty-state" />,
  EmptyStateIcons: { box: "box" },
}));

import PriceListPage from "./PriceListPage";
import { priceListAPI, printSettingsAPI } from "../services/api";

const renderWithQueryClient = (ui) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
};

describe("PriceListPage suggestion drawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    priceListAPI.getAll.mockResolvedValue({
      data: [
        {
          id: 1,
          code: "NSC-CLS-10SCT",
          name: "Nescafe Classic 1 Renceng (10 sachet x 2 g)",
          category: "Lain-lain",
          base_unit: "pcs",
          pack_unit: "",
          pack_size: 1,
          sell_price: null,
          sell_price_pack: 0,
          list_price: null,
          shopee_price: null,
          tokopedia_price: null,
          master_hna: 10475.68,
          last_hna: 10475.68,
          last_tax_type: "faktur",
          last_purchase_at: "2026-06-13",
        },
      ],
    });
    priceListAPI.getFeeProfiles.mockResolvedValue({
      data: [
        {
          id: 11,
          platform: "offline",
          category_key: "default",
          label: "Offline — Tunai / Transfer",
          safe_effective_fee_rate: 0,
          source: "official",
        },
      ],
    });
    priceListAPI.recommend.mockResolvedValue({
      data: {
        product_name: "Nescafe Classic 1 Renceng (10 sachet x 2 g)",
        platform: "offline",
        category_key: "default",
        fee_mode: "effective",
        fee_source: "official",
        fee_profile_label: "Offline — Tunai / Transfer",
        hpp_total: 11628,
        packing_fee: 0,
        fixed_order_fee: 0,
        total_variable_fee_rate: 0,
        harga_bep: 11628,
        harga_laba_tipis: 12209,
        harga_laba_sehat: 13372,
        harga_aman_promo: 12209,
        harga_rekomendasi_psikologis: 13900,
        pembulatan_psikologis: {
          bep: 11900,
          laba_tipis: 12900,
          laba_sehat: 13900,
          aman_promo: 12900,
        },
        estimasi: {
          estimasi_penghasilan_bersih: 13900,
          estimasi_laba: 2272,
          margin_laba: 16.35,
        },
        warnings: [],
      },
    });
    printSettingsAPI.get.mockResolvedValue({ data: { nota_layout: {} } });
  });

  test("card tier bisa diklik dan mengirim harga hasil pembulatan yang berbeda", async () => {
    renderWithQueryClient(
      <PriceListPage isDarkMode={false} isMobile={false} />,
    );

    await screen.findByText("Nescafe Classic 1 Renceng (10 sachet x 2 g)");

    vi.useFakeTimers();
    fireEvent.click(
      screen.getByRole("button", {
        name: /Saran harga Offline untuk Nescafe Classic 1 Renceng/i,
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });
    vi.useRealTimers();

    await screen.findByText("BEP (modal balik)");

    expect(screen.getByText("BEP (modal balik)").closest("button")).toHaveTextContent(/Rp\s*11\.900/);
    expect(screen.getByText("Laba tipis (+5%)").closest("button")).toHaveTextContent(/Rp\s*12\.900/);
    expect(screen.getByText("Laba sehat (+15%)").closest("button")).toHaveTextContent(/Rp\s*13\.900/);

    fireEvent.click(screen.getByText("BEP (modal balik)").closest("button"));

    await waitFor(() => {
      expect(priceListAPI.setPrice).toHaveBeenCalledWith(1, {
        price: 11900,
        channel: "offline",
      });
    });
  });
});
