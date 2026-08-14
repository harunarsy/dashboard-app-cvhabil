import { createContext, useContext, useState, type ReactNode } from 'react';
import { api } from './api';

interface User { id: number; username: string; role: string }
interface AuthValue {
  token: string | null;
  user: User | null;
  login: (u: string, p: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthValue | null>(null);

function decode(token: string): User | null {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem('habil_v2_token'),
  );
  const user = token ? decode(token) : null;

  const login = async (username: string, password: string) => {
    const { data } = await api.post('/auth/login', { username, password });
    localStorage.setItem('habil_v2_token', data.token);
    setToken(data.token);
  };

  const logout = () => {
    localStorage.removeItem('habil_v2_token');
    setToken(null);
  };

  return <Ctx.Provider value={{ token, user, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth harus dipakai di dalam AuthProvider');
  return v;
}
