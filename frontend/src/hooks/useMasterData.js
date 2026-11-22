// v1.41.0: hook data master via TanStack Query — di-cache & dibagi antar halaman.
// v1.45.0: diperluas ke semua data list per-domain (nota, faktur, SP, inventory,
//   daftar harga, dashboard) supaya kunjungan ulang halaman tampil instan dari cache.
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  inventoryAPI,
  customersAPI,
  distributorsAPI,
  salesAPI,
  invoicesAPI,
  purchaseOrdersAPI,
  priceListAPI,
  insightsAPI,
  dashboardAPI,
  loansAPI,
} from "../services/api";
import { qk } from "../lib/queryClient";

// ── fetchers (dipakai juga utk prefetch) ──────────────────────────────────
export const fetchProductsList = async () => {
  // limit 2000 = sama dgn picker faktur, biar 1 cache lengkap utk semua halaman.
  const { data } = await inventoryAPI.getProducts({ limit: 2000 });
  return Array.isArray(data) ? data : [];
};

export const fetchCustomersList = async () => {
  const { data } = await customersAPI.getAll();
  return Array.isArray(data) ? data : data?.data || [];
};

const arr = (data) => (Array.isArray(data) ? data : data?.data || []);

// ── master data (dipakai banyak halaman) ──────────────────────────────────
export function useProducts(options = {}) {
  return useQuery({
    queryKey: qk.products,
    queryFn: fetchProductsList,
    staleTime: 2 * 60 * 1000, // master produk jarang berubah
    ...options,
  });
}

export function useCustomers(options = {}) {
  return useQuery({
    queryKey: qk.customers,
    queryFn: fetchCustomersList,
    staleTime: 2 * 60 * 1000,
    ...options,
  });
}

export function useDistributors(options = {}) {
  return useQuery({
    queryKey: qk.distributors,
    queryFn: async () => arr((await distributorsAPI.getAll()).data),
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

// ── list per-domain ───────────────────────────────────────────────────────
export function useSalesOrders(options = {}) {
  return useQuery({
    queryKey: qk.salesList,
    queryFn: async () => arr((await salesAPI.getAll()).data),
    staleTime: 60 * 1000,
    ...options,
  });
}

export function useInvoices(options = {}) {
  return useQuery({
    queryKey: qk.invoicesList,
    queryFn: async () => arr((await invoicesAPI.getAll()).data),
    staleTime: 60 * 1000,
    ...options,
  });
}

export function usePurchaseOrders(options = {}) {
  return useQuery({
    queryKey: qk.purchaseOrdersList,
    queryFn: async () => arr((await purchaseOrdersAPI.getAll()).data),
    staleTime: 60 * 1000,
    ...options,
  });
}

export function useInventoryAlerts(options = {}) {
  return useQuery({
    queryKey: qk.inventoryAlerts,
    queryFn: async () => {
      const { data } = await inventoryAPI.getAlerts();
      return data && typeof data === "object"
        ? data
        : { expiring: [], lowStock: [] };
    },
    staleTime: 60 * 1000,
    ...options,
  });
}

export function usePriceList(options = {}) {
  return useQuery({
    queryKey: qk.priceList,
    queryFn: async () => arr((await priceListAPI.getAll()).data),
    staleTime: 60 * 1000,
    ...options,
  });
}

export function useFeeProfiles(options = {}) {
  return useQuery({
    queryKey: qk.feeProfiles,
    queryFn: async () => arr((await priceListAPI.getFeeProfiles()).data),
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useWeeklySummary(options = {}) {
  return useQuery({
    queryKey: qk.weeklySummary,
    queryFn: async () => (await insightsAPI.getWeeklySummary()).data,
    staleTime: 10 * 60 * 1000,
    ...options,
  });
}

export function useDashboardBootstrap(month, options = {}) {
  return useQuery({
    queryKey: ["dashboard", "bootstrap", month || "current"],
    queryFn: async () => (await dashboardAPI.getBootstrap(month)).data,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
    ...options,
  });
}

// dashboardAPI mungkin belum ada → guard supaya tidak crash kalau API absen.
// v1.58.0: statistik dashboard bisa difilter per bulan (YYYY-MM). queryKey memuat
// month → tiap bulan cache sendiri (tidak silang). keepPreviousData → angka bulan
// sebelumnya tetap tampil saat pindah bulan (no kedip/blank).
export function useDashboardStats(month, options = {}) {
  return useQuery({
    queryKey: [...qk.dashboardStats, month || "current"],
    queryFn: async () => (await dashboardAPI.getStats(month)).data,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
    ...options,
  });
}

// ── dashboard: insight & detail harian ───────────────────────────────────
// Tiga request digabung dalam satu query supaya hasilnya di-cache bersama dan
// pindah halaman tidak memicu rentetan fetch ulang.
export function useDashboardInsights(options = {}) {
  return useQuery({
    queryKey: qk.dashboardInsights,
    queryFn: async () => {
      const [restock, dormant, loans] = await Promise.allSettled([
        insightsAPI.getRestock(),
        insightsAPI.getDormant(30),
        loansAPI.getAll(),
      ]);
      const items = (result) =>
        result.status === "fulfilled" ? result.value?.data?.items || [] : [];
      const loanRows = loans.status === "fulfilled" ? loans.value?.data || [] : [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const overdueLoans = loanRows.filter((loan) => {
        if (loan.status === "selesai" || !loan.due_date) return false;
        const sisa = (loan.items || []).reduce(
          (sum, item) =>
            sum +
            ((parseInt(item.qty) || 0) -
              (parseInt(item.qty_returned) || 0) -
              (parseInt(item.qty_purchased) || 0)),
          0,
        );
        if (sisa <= 0) return false;
        const due = new Date(String(loan.due_date).split("T")[0] + "T00:00:00");
        return due < today;
      });
      return { restock: items(restock), dormant: items(dormant), overdueLoans };
    },
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useDayNotas(date, options = {}) {
  return useQuery({
    queryKey: qk.dayNotas(date),
    queryFn: async () => {
      const { data } = await dashboardAPI.getDailyNotas(date);
      return Array.isArray(data) ? data : [];
    },
    enabled: Boolean(date),
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}
