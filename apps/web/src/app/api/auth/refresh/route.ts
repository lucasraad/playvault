/**
 * POST /api/auth/refresh
 *
 * Uses the refresh token from the HttpOnly cookie to obtain a new
 * session from the FastAPI backend. Performs token rotation: the old
 * refresh token is replaced with the new one returned by the backend.
 *
 * GET /api/auth/refresh
 *
 * Returns whether a refresh token cookie exists (for the client to
 * know if a session can potentially be recovered on page load).
 */

import { NextResponse } from "next/server";

import {
  clearSessionCookies,
  getRefreshToken,
  setSessionCookies,
} from "@/lib/session";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function POST(): Promise<NextResponse> {
  try {
    const refreshToken = await getRefreshToken();

    if (!refreshToken) {
      return NextResponse.json(
        { detail: "No session to refresh" },
        { status: 401 },
      );
    }

    const upstream = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!upstream.ok) {
      // Refresh failed — session expired, clear stale cookies
      await clearSessionCookies();
      const data = await upstream.json().catch(() => ({}));
      return NextResponse.json(data, { status: upstream.status });
    }

    const tokens = await upstream.json();

    // Rotate tokens
    await setSessionCookies({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
    });

    return NextResponse.json({
      authenticated: true,
      expires_in: tokens.expires_in,
    });
  } catch {
    return NextResponse.json(
      { detail: "Internal error" },
      { status: 500 },
    );
  }
}

export async function GET(): Promise<NextResponse> {
  const refreshToken = await getRefreshToken();
  return NextResponse.json({ has_session: !!refreshToken });
}
