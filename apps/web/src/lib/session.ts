/**
 * Shared cookie helpers for session management.
 *
 * SESSION STRATEGY:
 * - access_token  → HttpOnly, Secure, SameSite=Lax cookie ("gp_at")
 * - refresh_token → HttpOnly, Secure, SameSite=Strict cookie ("gp_rt")
 *
 * Neither token is ever exposed to client-side JavaScript, stored in
 * localStorage, or included in URLs/logs. The Next.js API routes act as
 * a BFF (Backend For Frontend) proxy that injects the tokens from cookies
 * into requests to the FastAPI backend.
 *
 * Cookie attributes:
 * - HttpOnly: prevents XSS from reading the token
 * - Secure: cookie is sent only over HTTPS (disabled in dev for localhost)
 * - SameSite=Lax/Strict: mitigates CSRF (refresh is Strict because it is
 *   only used by same-origin POST requests)
 * - Path=/api/auth: cookies are scoped to the BFF routes only
 */

import { cookies } from "next/headers";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

export const ACCESS_TOKEN_COOKIE = "gp_at";
export const REFRESH_TOKEN_COOKIE = "gp_rt";

interface SetSessionOptions {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
}

/**
 * Write both session cookies after a successful login or token refresh.
 */
export async function setSessionCookies(opts: SetSessionOptions): Promise<void> {
  const jar = await cookies();

  jar.set(ACCESS_TOKEN_COOKIE, opts.accessToken, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: "lax",
    path: "/api/auth",
    maxAge: opts.expiresIn,
  });

  jar.set(REFRESH_TOKEN_COOKIE, opts.refreshToken, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: "strict",
    path: "/api/auth",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}

/**
 * Clear both session cookies (logout).
 */
export async function clearSessionCookies(): Promise<void> {
  const jar = await cookies();

  jar.set(ACCESS_TOKEN_COOKIE, "", {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 0,
  });

  jar.set(REFRESH_TOKEN_COOKIE, "", {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: "strict",
    path: "/api/auth",
    maxAge: 0,
  });
}

/**
 * Read the current access token from cookies (server-side only).
 */
export async function getAccessToken(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(ACCESS_TOKEN_COOKIE)?.value;
}

/**
 * Read the current refresh token from cookies (server-side only).
 */
export async function getRefreshToken(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(REFRESH_TOKEN_COOKIE)?.value;
}
