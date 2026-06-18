// v1.41.0: TanStack Query — cache + stale-while-revalidate biar load berasa "instant".
// Data tampil instan dari cache, refresh diam-diam di belakang saat sudah stale.
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 60 dtk dianggap fresh → kunjungan ulang halaman instan tanpa refetch.
      staleTime: 60 * 1000,
      // cache disimpan 10 menit setelah tidak dipakai.
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: true, // balik ke tab → revalidate diam-diam
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});

// Kunci query terpusat biar konsisten + gampang prefetch/invalidate.
// Hirarkis: invalidate parent (mis. ["sales"]) otomatis kena semua turunannya.
export const qk = {
  products: ["products"],
  customers: ["customers"],
  distributors: ["distributors"],
  dashboardStats: ["dashboard", "stats"],
  weeklySummary: ["insights", "weekly-summary"],
  // list per-domain
  sales: ["sales"], // daftar nota → ["sales","list"]
  salesList: ["sales", "list"],
  invoices: ["invoices"], // daftar faktur → ["invoices","list"]
  invoicesList: ["invoices", "list"],
  purchaseOrders: ["purchase-orders"],
  purchaseOrdersList: ["purchase-orders", "list"],
  inventoryAlerts: ["inventory", "alerts"],
  inventoryInsights: ["insights", "inventory"],
  priceList: ["price-list", "all"],
  feeProfiles: ["price-list", "fee-profiles"],
  counters: ["counters"],
};
