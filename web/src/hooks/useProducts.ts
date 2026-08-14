import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface ProductRow {
  id: number;
  code: string | null;
  name: string;
  base_unit: string | null;
  unit: string | null;
  total_stock: number | string;
  stock_value: number | string;
  batch_cost_tiers: Array<{ hna: number; qty: number }> | null;
  nearest_expiry: string | null;
}

export function useProducts() {
  return useQuery<ProductRow[]>({
    queryKey: ['products'],
    queryFn: async () => (await api.get('/inventory/products?limit=2000')).data,
    staleTime: 2 * 60 * 1000,
  });
}
