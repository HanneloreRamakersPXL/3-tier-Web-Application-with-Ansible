import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../services/api';
import type { User, LoginRequest, RegisterRequest } from '../types/auth';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('cv_token');
    if (!token) { setLoading(false); return; }
    api.auth.me()
      .then(setUser)
      .catch(() => localStorage.removeItem('cv_token'))
      .finally(() => setLoading(false));
  }, []);

  const login = async (data: LoginRequest) => {
    const result = await api.auth.login(data);
    localStorage.setItem('cv_token', result.token);
    setUser(result.user);
  };

  const register = async (data: RegisterRequest) => {
    const result = await api.auth.register(data);
    localStorage.setItem('cv_token', result.token);
    setUser(result.user);
  };

  const logout = () => {
    localStorage.removeItem('cv_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
