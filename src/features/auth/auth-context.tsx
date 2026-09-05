"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type AuthUser = { id: string; name: string; email: string };

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchSession: () => Promise<void>;
};

type AuthResponse = {
  user?: AuthUser | null;
  data?: { user?: AuthUser | null };
  error?: { message?: string };
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function requestAuth(path: string, init?: RequestInit) {
  const response = await fetch(`/api/auth/${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = (await response.json().catch(() => ({}))) as AuthResponse;
  if (!response.ok) throw new Error(body.error?.message || "Authentication request failed");
  return body;
}

function responseUser(body: AuthResponse) {
  return body.user ?? body.data?.user ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSession = useCallback(async () => {
    try {
      const body = await requestAuth("get-session", { method: "GET" });
      setUser(responseUser(body));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchSession(); }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchSession]);

  const login = useCallback(async (email: string, password: string) => {
    const body = await requestAuth("sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setUser(responseUser(body));
  }, []);

  const signup = useCallback(async (name: string, email: string, password: string) => {
    const body = await requestAuth("sign-up/email", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
    setUser(responseUser(body));
  }, []);

  const logout = useCallback(async () => {
    await requestAuth("sign-out", { method: "POST", body: JSON.stringify({}) });
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, signup, logout, fetchSession }),
    [user, loading, login, signup, logout, fetchSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside an AuthProvider");
  return context;
}


