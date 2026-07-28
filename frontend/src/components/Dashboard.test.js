import React from "react";
// Mock before other imports using a factory to bypass original file logic
jest.mock("../services/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
  tasksAPI: {
    getAll: jest.fn(() => Promise.resolve({ data: [] })),
    getTrash: jest.fn(() => Promise.resolve({ data: [] })),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    restore: jest.fn(),
    getHistory: jest.fn(() => Promise.resolve({ data: [] })),
  },
  dashboardAPI: {
    getStats: jest.fn(),
    getHeatmap: jest.fn(),
    getDailyNotas: jest.fn(),
  },
  insightsAPI: {
    getWeeklySummary: jest.fn(),
    // v1.64.1: Dashboard.jsx:4336 memanggil ketiganya lewat Promise.allSettled.
    // Mock ini sempat ketinggalan → suite merah walau produksi sehat.
    getRestock: jest.fn(() => Promise.resolve({ data: { items: [] } })),
    getDormant: jest.fn(() => Promise.resolve({ data: { items: [] } })),
  },
  loansAPI: {
    getAll: jest.fn(() => Promise.resolve({ data: [] })),
  },
}));

// Mock useOnboarding to avoid pending setTimeout(900ms)
jest.mock("../hooks/useOnboarding", () => () => ({
  active: false,
  currentStep: null,
  stepIndex: 0,
  steps: [],
  next: jest.fn(),
  skip: jest.fn(),
}));

// Mock sessionStorage so release modal doesn't auto-show (no pending timers)
global.sessionStorage = {
  getItem: () => "true",
  setItem: jest.fn(),
};

jest.mock("./dashboard/StockMovementChart", () => () => (
  <div data-testid="stock-movement-chart" />
));

jest.mock(
  "react-router-dom",
  () => ({
    useNavigate: () => jest.fn(),
  }),
  { virtual: true },
);

import { render, screen, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Dashboard from "./Dashboard";
import api, { dashboardAPI, insightsAPI, loansAPI, tasksAPI } from "../services/api";

// Mock lucide-react broadly because Dashboard renders child widgets that import
// many icons directly.
jest.mock("lucide-react", () => {
  const React = require("react");
  const MockIcon = (props) => <svg data-testid="icon" {...props} />;

  return new Proxy(
    { __esModule: true },
    {
      get: (target, prop) => target[prop] || MockIcon,
    },
  );
});

const renderWithQueryClient = (ui) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
};

describe("Dashboard Component - Loading State", () => {
  const mockStats = {
    totalPenjualan: 1000000,
    suratPesananAktif: 5,
    stokLowExpired: 2,
    totalCustomer: 50,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    api.get.mockResolvedValue({ data: [] });
    tasksAPI.getAll.mockResolvedValue({ data: [] });
    insightsAPI.getWeeklySummary.mockResolvedValue({ data: null });
    // CRA memasang resetMocks:true → implementasi dari jest.mock() factory dihapus
    // tiap test. Jadi default-nya HARUS dipasang di sini, bukan di factory.
    insightsAPI.getRestock.mockResolvedValue({ data: { items: [] } });
    insightsAPI.getDormant.mockResolvedValue({ data: { items: [] } });
    loansAPI.getAll.mockResolvedValue({ data: [] });
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    window.matchMedia = jest.fn().mockReturnValue({
      matches: true,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
    });
  });

  test("renders skeletons while loading", async () => {
    // Setup API mock to stay pending initially
    let resolveApi;
    const apiPromise = new Promise((resolve) => {
      resolveApi = resolve;
    });
    dashboardAPI.getStats.mockReturnValue(apiPromise);

    jest.useFakeTimers();
    renderWithQueryClient(<Dashboard isDarkMode={false} isSidebarOpen={true} />);
    act(() => { jest.runAllTimers(); });
    jest.useRealTimers();

    // Check if skeletons are present
    // Based on Dashboard.jsx, there should be 4 stats card skeletons
    const skeletons = document.querySelectorAll(".skeleton");
    expect(skeletons.length).toBeGreaterThan(0);

    // Specifically check for the height and width patterns used for stats cards
    // Dashboard.jsx uses Skeleton with various widths/heights

    // Resolve the API
    await act(async () => {
      resolveApi({ data: mockStats });
    });

    // Wait for the labels to be present (getAllByText: "Total Penjualan" juga
    // muncul di teks changelog/RELEASES, jadi cukup pastikan ada minimal 1).
    await waitFor(() => {
      expect(screen.getAllByText(/Total Penjualan/i).length).toBeGreaterThan(0);
    });

    // Wait for skeletons to disappear (reflecting loading: false)
    await waitFor(
      () => {
        const skeletons = document.querySelectorAll(".skeleton");
        expect(skeletons.length).toBe(0);
      },
      { timeout: 3000 },
    );

    // Verify data is rendered with the current full currency formatting.
    expect(
      screen.getByText((content) =>
        content.replace(/\s/g, "").includes("Rp1.000.000"),
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/^5$/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^2$/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Stok Low\/Expired/i).length).toBeGreaterThan(0);
  });
});
