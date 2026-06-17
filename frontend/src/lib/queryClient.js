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
export const qk = {
  products: ["products"],
  customers: ["customers"],
  dashboardStats: ["dashboard", "stats"],
};
