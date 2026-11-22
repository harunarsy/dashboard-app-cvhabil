import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../services/api', () => ({
  insightsAPI: {
    getRestock: vi.fn(),
    getDormant: vi.fn(),
  },
  dashboardAPI: {
    getDailyNotas: vi.fn(),
  },
  loansAPI: {
    getAll: vi.fn(),
  },
}));

import { insightsAPI, dashboardAPI, loansAPI } from '../services/api';
import { useDashboardInsights, useDayNotas } from './useMasterData';

const makeWrapper = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 5 * 60 * 1000 } },
  });
  return ({ children }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
};

describe('hook dashboard berbasis cache', () => {
  it('insight hanya diambil sekali saat halaman dibuka ulang', async () => {
    insightsAPI.getRestock.mockResolvedValue({ data: { items: [{ product_name: 'A' }] } });
    insightsAPI.getDormant.mockResolvedValue({ data: { items: [{ customer_name: 'B' }] } });
    loansAPI.getAll.mockResolvedValue({ data: [] });
    const wrapper = makeWrapper();

    const first = renderHook(() => useDashboardInsights(), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    expect(first.result.current.data.restock).toHaveLength(1);
    expect(first.result.current.data.dormant).toHaveLength(1);
    first.unmount();

    const second = renderHook(() => useDashboardInsights(), { wrapper });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

    expect(insightsAPI.getRestock).toHaveBeenCalledTimes(1);
    expect(insightsAPI.getDormant).toHaveBeenCalledTimes(1);
    expect(loansAPI.getAll).toHaveBeenCalledTimes(1);
  });

  it('pinjaman lewat jatuh tempo dihitung dari data yang sama', async () => {
    insightsAPI.getRestock.mockResolvedValue({ data: { items: [] } });
    insightsAPI.getDormant.mockResolvedValue({ data: { items: [] } });
    loansAPI.getAll.mockResolvedValue({
      data: [
        {
          status: 'dipinjam',
          due_date: '2020-01-01',
          items: [{ qty: 2, qty_returned: 0, qty_purchased: 0 }],
        },
        {
          status: 'dipinjam',
          due_date: '2020-01-01',
          items: [{ qty: 2, qty_returned: 2, qty_purchased: 0 }],
        },
      ],
    });

    const { result } = renderHook(() => useDashboardInsights(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data.overdueLoans).toHaveLength(1);
  });

  it('detail nota harian tidak diambil sebelum tanggal dipilih, lalu di-cache', async () => {
    dashboardAPI.getDailyNotas.mockResolvedValue({ data: [{ order_number: 'X' }] });
    const wrapper = makeWrapper();

    const { result, rerender, unmount } = renderHook(
      ({ date }) => useDayNotas(date),
      { wrapper, initialProps: { date: null } },
    );
    expect(dashboardAPI.getDailyNotas).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');

    rerender({ date: '2026-11-22' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ order_number: 'X' }]);
    expect(dashboardAPI.getDailyNotas).toHaveBeenCalledTimes(1);
    unmount();

    const again = renderHook(() => useDayNotas('2026-11-22'), { wrapper });
    await waitFor(() => expect(again.result.current.isSuccess).toBe(true));
    expect(dashboardAPI.getDailyNotas).toHaveBeenCalledTimes(1);
  });
});
