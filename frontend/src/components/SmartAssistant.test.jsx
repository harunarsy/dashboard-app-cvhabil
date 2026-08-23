import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import SmartAssistant from "./SmartAssistant";
import { smartAssistantAPI } from "../services/api";

vi.mock("../services/api", () => ({
  smartAssistantAPI: {
    getRecommendations: vi.fn(),
  },
}));

const response = {
  assistant: {
    name: "Habil Smart-Assistant",
    mode: "rule_based",
    disclosure: "Rule-based smart suggestions",
  },
  summary: "1 saran ditemukan, 1 perlu prioritas.",
  recommendations: [
    {
      id: "restock-1",
      type: "restock",
      severity: "high",
      title: "Restock Produk A",
      summary: "Stok diperkirakan bertahan sekitar 5 hari.",
      reason: "Velocity penjualan tertimbang.",
      evidence: [
        { label: "Stok", value: "10 pcs" },
        { label: "Estimasi sisa", value: "5 hari" },
      ],
      action: { label: "Buka inventory", path: "/inventory" },
    },
  ],
  meta: {
    generated_at: "2026-08-23T00:00:00.000Z",
    rules_evaluated: ["restock_velocity"],
  },
};

const renderAssistant = () =>
  render(
    <MemoryRouter>
      <SmartAssistant isDarkMode={false} />
    </MemoryRouter>,
  );

describe("Habil Smart-Assistant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    smartAssistantAPI.getRecommendations.mockResolvedValue({ data: response });
  });

  test("loads an explicit rule-based overview with evidence", async () => {
    renderAssistant();

    expect(screen.getByText(/Rule-based smart suggestions/)).toBeInTheDocument();
    expect(screen.getByText(/bukan jawaban generatif/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Restock Produk A")).toBeInTheDocument();
    });
    expect(screen.getByText("Dasar: Velocity penjualan tertimbang.")).toBeInTheDocument();
    expect(screen.getByText("Read-only verified")).toBeInTheDocument();
    expect(smartAssistantAPI.getRecommendations).toHaveBeenCalledWith({
      message: "Apa prioritas bisnis hari ini?",
      scope: "overview",
      limit: 8,
    });
  });

  test("scope controls send a deterministic focused request", async () => {
    renderAssistant();
    await screen.findByText("Restock Produk A");

    const overview = screen.getByRole("radio", { name: "Prioritas hari ini" });
    overview.focus();
    fireEvent.keyDown(overview, { key: "ArrowRight" });

    await waitFor(() => {
      expect(smartAssistantAPI.getRecommendations).toHaveBeenLastCalledWith({
        message: "Stok apa yang perlu segera direstock?",
        scope: "inventory",
        limit: 8,
      });
    });
    expect(screen.getByRole("radio", { name: "Stok prioritas" })).toHaveFocus();
  });

  test("shows an actionable recovery state", async () => {
    smartAssistantAPI.getRecommendations.mockRejectedValueOnce({
      response: { data: { error: { message: "Read-only guard gagal." } } },
    });
    renderAssistant();

    expect(await screen.findByRole("alert")).toHaveTextContent("Read-only guard gagal.");
    expect(screen.getByRole("button", { name: "Coba lagi" })).toBeInTheDocument();
  });

  test("announces loading and renders a useful empty state", async () => {
    let resolveRequest;
    smartAssistantAPI.getRecommendations.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );
    renderAssistant();

    expect(screen.getByRole("status")).toHaveTextContent("Memeriksa aturan bisnis");

    resolveRequest({
      data: {
        ...response,
        summary: "Tidak ada saran yang memenuhi aturan pada cakupan ini.",
        recommendations: [],
      },
    });

    expect(
      await screen.findByText("Tidak ada prioritas yang terdeteksi"),
    ).toBeInTheDocument();
  });
});
