"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { api, setAccessToken } from "@/lib/api";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  workspace_id: string;
  is_active: boolean;
  created_at: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  user_id: string;
  workspace_id: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    fullName: string,
    workspaceName: string,
  ) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Silent refresh: exchange HTTP-only cookie for a fresh access token
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/auth/refresh`,
          { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" } },
        );
        if (!res.ok) { setAccessToken(null); return; }
        const data = await res.json();
        if (data.access_token) {
          setAccessToken(data.access_token);
          const me = await api.get<User>("/api/auth/me");
          if (!cancelled) setUser(me);
        }
      } catch {
        setAccessToken(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await api.post<TokenResponse>("/api/auth/login", {
        email,
        password,
      });
      setAccessToken(data.access_token);
      const me = await api.get<User>("/api/auth/me");
      setUser(me);
      router.push("/dashboard");
    },
    [router],
  );

  const register = useCallback(
    async (
      email: string,
      password: string,
      fullName: string,
      workspaceName: string,
    ) => {
      const data = await api.post<TokenResponse>("/api/auth/register", {
        email,
        password,
        full_name: fullName,
        workspace_name: workspaceName,
      });
      setAccessToken(data.access_token);
      const me = await api.get<User>("/api/auth/me");
      setUser(me);
      router.push("/dashboard");
    },
    [router],
  );

  const logout = useCallback(() => {
    // Call server logout to revoke refresh tokens and clear cookie
    api.post("/api/auth/logout").catch(() => {});
    setAccessToken(null);
    setUser(null);
    router.push("/login");
  }, [router]);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
