import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "../shared/types";
import { api } from "./api";
import { savedCrawls } from "./storage";

interface AuthState {
  /** undefined while the first check is in flight */
  user: User | null | undefined;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Moves crawls created on this device into the account (best effort). */
async function claimDeviceCrawls() {
  const local = savedCrawls.list().map(({ slug, editToken }) => ({ slug, editToken }));
  if (!local.length) return;
  try {
    await api.claimCrawls(local);
  } catch {
    // Not fatal: they stay editable on this device and can be claimed next login.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const u = await api.login(email, password);
    await claimDeviceCrawls();
    setUser(u);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const u = await api.register(name, email, password);
    await claimDeviceCrawls();
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    // Forget this device's edit tokens for crawls that live in the account, so
    // the next person on this phone can't edit them after logging out.
    try {
      const mine = await api.myCrawls();
      mine.forEach((c) => savedCrawls.remove(c.slug));
    } catch {
      // ignore
    }
    await api.logout().catch(() => undefined);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, login, register, logout }), [user, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
