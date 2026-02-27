import * as React from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";

export type Me = {
  id: number;
  email: string;
  username: string;
  is_admin: boolean;
  is_active: boolean;
};

type AuthState = {
  token: string | null;
  me: Me | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function setTokenHeader(token: string | null) {
  if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`;
  else delete api.defaults.headers.common.Authorization;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setTokenHeader(token);
    if (token) {
      refreshMe()
        .catch((err) => {
          if (err?.response?.status === 401) logout();
        })
        .finally(() => setReady(true));
    } else {
      setReady(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = () => logout();
    window.addEventListener("auth:401", handler);
    return () => window.removeEventListener("auth:401", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshMe() {
    const res = await api.get("/me");
    setMe(res.data as Me);
  }

  async function login(username: string, password: string) {
    const body = new URLSearchParams();
    body.set("username", username);
    body.set("password", password);
    const res = await api.post("/auth/login", body, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });
    const t = res.data.access_token as string;
    localStorage.setItem("token", t);
    setToken(t);
    setTokenHeader(t);
    await refreshMe();
  }

  function logout() {
    localStorage.removeItem("token");
    setToken(null);
    setMe(null);
    setTokenHeader(null);
  }

  const value = useMemo(
    () => ({ token, me, ready, login, logout, refreshMe }),
    [token, me, ready]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
