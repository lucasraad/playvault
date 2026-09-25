/**
 * GET /api/auth/me
 *
 * Reads the access token from the HttpOnly cookie and proxies the
 * request to the FastAPI backend. If the access token is expired,
 * attempts a transparent refresh using the refresh token cookie.
 *
 * This is the only endpoint the client uses to get the current user.
 */

import { NextResponse } from "next/server";

import {
  clearSessionCookies,
  getAccessToken,
  getRefreshToken,
  setSessionCookies,
} from "@/lib/session";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function fetchMe(token: string): Promise<Response> {
  return fetch(`${API_BASE}/auth/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
}

export async function GET(): Promise<NextResponse> {
  try {
    let accessToken = await getAccessToken();

    if (!accessToken) {
      // Try to silently refresh
      const refreshToken = await getRefreshToken();
      if (!refreshToken) {
        return NextResponse.json(
          { detail: "Not authenticated" },
          { status: 401 },
        );
      }

      const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!refreshRes.ok) {
        await clearSessionCookies();
        return NextResponse.json(
          { detail: "Session expired" },
          { status: 401 },
        );
      }

      const tokens = await refreshRes.json();
      await setSessionCookies({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expires_in,
      });
      accessToken = tokens.access_token as string;
    }

    const meRes = await fetchMe(accessToken);

    if (meRes.status === 401) {
      // Access token might be expired; try refresh
      const refreshToken = await getRefreshToken();
      if (refreshToken) {
        const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (refreshRes.ok) {
          const tokens = await refreshRes.json();
          await setSessionCookies({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresIn: tokens.expires_in,
          });

          const retryRes = await fetchMe(tokens.access_token);
          if (retryRes.ok) {
            const user = await retryRes.json();
            return NextResponse.json(user);
          }
        }
      }

      await clearSessionCookies();
      return NextResponse.json(
        { detail: "Session expired" },
        { status: 401 },
      );
    }

    if (!meRes.ok) {
      const data = await meRes.json().catch(() => ({}));
      return NextResponse.json(data, { status: meRes.status });
    }

    const user = await meRes.json();
    return NextResponse.json(user);
  } catch {
    return NextResponse.json(
      { detail: "Internal error" },
      { status: 500 },
    );
  }
}
