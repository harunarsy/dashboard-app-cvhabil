// v1.41.0: TanStack Query — cache + stale-while-revalidate biar load berasa "instant".
// Data tampil instan dari cache, refresh diam-diam di belakang saat sudah stale.
import { QueryClient } from "@tanstack/react-query";

// v1.67.24: master data (produk/customer/distributor/daftar harga) jarang berubah
// tapi dipakai di banyak dropdown → tahan lebih lama di cache supaya pindah-pindah
// tab tidak memicu rentetan refetch ke Neon. Mutasi tetap memaksa data segar lewat
// invalidateQueries/refetch eksplisit (staleTime tidak menghalangi invalidasi).
const MASTER_DATA_KEYS = new Set([
  "products",
  "customers",
  "distributors",
  "price-list",
  "print-settings",
  "counters",
]);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 60 dtk dianggap fresh → kunjungan ulang halaman instan tanpa refetch.
      // Master data: 10 menit (di-invalidate eksplisit saat berubah).
      staleTime: (query) =>
        MASTER_DATA_KEYS.has(String(query.queryKey?.[0] || ""))
          ? 10 * 60 * 1000
          : 60 * 1000,
      // cache disimpan 10 menit setelah tidak dipakai.
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: true, // balik ke tab → revalidate diam-diam (hanya yang sudah stale)
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
