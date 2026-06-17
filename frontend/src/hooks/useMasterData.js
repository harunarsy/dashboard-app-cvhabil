// v1.41.0: hook data master via TanStack Query — di-cache & dibagi antar halaman.
// Tujuan: produk/customer yang dipakai di banyak halaman (Nota, SP, Faktur, Inventory,
// Daftar Harga) cukup di-fetch sekali; kunjungan berikutnya tampil instan dari cache.
import { useQuery } from "@tanstack/react-query";
import { inventoryAPI, customersAPI } from "../services/api";
import { qk } from "../lib/queryClient";

export const fetchProductsList = async () => {
  const { data } = await inventoryAPI.getProducts();
  return Array.isArray(data) ? data : [];
};

export const fetchCustomersList = async () => {
  const { data } = await customersAPI.getAll();
  return Array.isArray(data) ? data : data?.data || [];
};

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
