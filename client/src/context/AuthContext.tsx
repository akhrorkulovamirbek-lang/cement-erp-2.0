import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from '../api/client';
import type { UserRole } from '../types';

interface Me {
  username: string;
  role: UserRole;
  fullName: string;
}

interface AuthState {
  username: string | null;
  role: UserRole | null;
  fullName: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Me>('/auth/me')
      .then((res) => setMe(res))
      .catch(() => setMe(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(username: string, password: string) {
    const res = await api.post<Me>('/auth/login', { username, password });
    setMe(res);
  }

  async function logout() {
    await api.post('/auth/logout');
    setMe(null);
  }

  return (
    <AuthContext.Provider
      value={{ username: me?.username ?? null, role: me?.role ?? null, fullName: me?.fullName ?? null, loading, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { ApiError };
