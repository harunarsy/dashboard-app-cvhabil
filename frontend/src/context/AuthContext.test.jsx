import { useContext } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../lib/queryClient', () => ({ queryClient: { clear: vi.fn() } }));
vi.mock('../services/api', () => ({
  authAPI: { login: vi.fn() },
}));

import { AuthProvider, AuthContext } from './AuthContext';
import { queryClient } from '../lib/queryClient';
import { authAPI } from '../services/api';

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;

describe('AuthContext cache hygiene', () => {
  it('membersihkan cache saat logout', () => {
    const { result } = renderHook(() => useContext(AuthContext), { wrapper });
    act(() => result.current.logout());
    expect(queryClient.clear).toHaveBeenCalledTimes(1);
  });

  it('membersihkan cache saat login berhasil', async () => {
    authAPI.login.mockResolvedValue({
      data: { token: 'a.b.c', user: { id: 1, username: 'admin', role: 'admin' } },
    });
    const { result } = renderHook(() => useContext(AuthContext), { wrapper });

    await act(async () => {
      const res = await result.current.login('admin', 'rahasia');
      expect(res.success).toBe(true);
    });

    expect(queryClient.clear).toHaveBeenCalledTimes(1);
  });
});
