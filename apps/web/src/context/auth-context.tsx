"use client";

/**
 * AuthProvider — React context for authentication state.
 *
 * On mount, checks whether a session exists by calling GET /api/auth/refresh
 * (which only checks for cookie presence) and then GET /api/auth/me to
 * validate it. If the session is stale, the BFF proxy transparently
 * refreshes it.
 *
 * Provides: user, loading, login, signup, logout, refreshUser.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

import {
  ApiRequestError,
  type AuthUser,
  getProxy,
  postProxy,
  postProxyNoBody,
} from "@/lib/api-client";

/* ---------- Types ---------- */

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<SignupResult>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  clearError: () => void;
}

interface SignupResult {
  message: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/* ---------- Provider ---------- */

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });


  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const user = await getProxy<AuthUser>("/api/auth/me");
      setState({ user, loading: false, error: null });
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) {
        setState({ user: null, loading: false, error: null });
      } else {
        setState({ user: null, loading: false, error: null });
      }
    }
  }, []);

  // Check for existing session on mount
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // Check if a session cookie exists
        const { has_session } = await getProxy<{ has_session: boolean }>(
          "/api/auth/refresh",
        );

        if (!has_session) {
          if (!cancelled) setState({ user: null, loading: false, error: null });
          return;
        }

        // Session cookie exists — validate it (BFF will refresh if needed)
        const user = await getProxy<AuthUser>("/api/auth/me");
        if (!cancelled) setState({ user, loading: false, error: null });
      } catch {
        if (!cancelled) setState({ user: null, loading: false, error: null });
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      await postProxy<{ authenticated: boolean }>("/api/auth/login", {
        email,
        password,
      });

      // Login succeeded — fetch user data
      const user = await getProxy<AuthUser>("/api/auth/me");
      setState({ user, loading: false, error: null });
    } catch (err) {
      let message = "An unexpected error occurred";

      if (err instanceof ApiRequestError) {
        switch (err.status) {
          case 401:
            message = "Invalid email or password";
            break;
          case 422:
            message =
              err.validationErrors
                ?.map((e) => e.msg)
                .join(". ") ?? "Please check your input";
            break;
          case 429:
            message = "Too many attempts. Please wait a moment and try again";
            break;
          case 503:
            message =
              "Authentication service is temporarily unavailable. Please try again later";
            break;
          default:
            message = err.detail;
        }
      }

      setState((prev) => ({ ...prev, loading: false, error: message }));
      throw err;
    }
  }, []);

  const signup = useCallback(
    async (email: string, password: string): Promise<SignupResult> => {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const result = await postProxy<{ message: string }>(
          "/api/auth/signup",
          { email, password },
        );
        setState((prev) => ({ ...prev, loading: false }));
        return result;
      } catch (err) {
        let message = "An unexpected error occurred";

        if (err instanceof ApiRequestError) {
          switch (err.status) {
            case 400:
              message = "Registration failed. The email may already be in use";
              break;
            case 422:
              message =
                err.validationErrors
                  ?.map((e) => e.msg)
                  .join(". ") ?? "Please check your input";
              break;
            case 429:
              message =
                "Too many attempts. Please wait a moment and try again";
              break;
            case 503:
              message =
                "Authentication service is temporarily unavailable. Please try again later";
              break;
            default:
              message = err.detail;
          }
        }

        setState((prev) => ({ ...prev, loading: false, error: message }));
        throw err;
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }));

    try {
      await postProxyNoBody("/api/auth/logout");
    } catch {
      // Even if the logout call fails, clear local state
    }

    setState({ user: null, loading: false, error: null });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      signup,
      logout,
      refreshUser,
      clearError,
    }),
    [state, login, signup, logout, refreshUser, clearError],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

/* ---------- Hook ---------- */

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
