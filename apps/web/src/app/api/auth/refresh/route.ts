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
  forwardUpstreamError,
  invalidSessionResponse,
  invalidUpstreamResponse,
  isSessionTokens,
  noSessionResponse,
  unavailableResponse,
} from "@/lib/auth-bff";
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
      return noSessionResponse();
    }

    const upstream = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!upstream.ok) {
      if (upstream.status === 401) {
        await clearSessionCookies();
        return invalidSessionResponse();
      }

      return forwardUpstreamError(upstream);
    }

    const tokens: unknown = await upstream.json().catch(() => null);
    if (!isSessionTokens(tokens)) return invalidUpstreamResponse();

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
    return unavailableResponse();
  }
}

export async function GET(): Promise<NextResponse> {
  const refreshToken = await getRefreshToken();
  return NextResponse.json({ has_session: !!refreshToken });
}
