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
  forwardUpstreamError,
  invalidSessionResponse,
  invalidUpstreamResponse,
  isSessionTokens,
  noSessionResponse,
  type SessionTokens,
  unavailableResponse,
} from "@/lib/auth-bff";
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

async function refreshSession(refreshToken: string): Promise<Response> {
  return fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

async function readAndStoreTokens(response: Response): Promise<SessionTokens | null> {
  const tokens: unknown = await response.json().catch(() => null);
  if (!isSessionTokens(tokens)) return null;

  await setSessionCookies({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
  });
  return tokens;
}

async function handleRefreshFailure(response: Response): Promise<NextResponse> {
  if (response.status === 401) {
    await clearSessionCookies();
    return invalidSessionResponse();
  }

  return forwardUpstreamError(response);
}

export async function GET(): Promise<NextResponse> {
  try {
    let accessToken = await getAccessToken();

    if (!accessToken) {
      // Try to silently refresh
      const refreshToken = await getRefreshToken();
      if (!refreshToken) {
        return noSessionResponse();
      }

      const refreshRes = await refreshSession(refreshToken);

      if (!refreshRes.ok) {
        return handleRefreshFailure(refreshRes);
      }

      const tokens = await readAndStoreTokens(refreshRes);
      if (!tokens) return invalidUpstreamResponse();
      accessToken = tokens.access_token;
    }

    const meRes = await fetchMe(accessToken);

    if (meRes.status === 401) {
      // Access token might be expired; try refresh
      const refreshToken = await getRefreshToken();
      if (!refreshToken) {
        await clearSessionCookies();
        return invalidSessionResponse();
      }

      const refreshRes = await refreshSession(refreshToken);
      if (!refreshRes.ok) return handleRefreshFailure(refreshRes);

      const tokens = await readAndStoreTokens(refreshRes);
      if (!tokens) return invalidUpstreamResponse();

      const retryRes = await fetchMe(tokens.access_token);
      if (retryRes.ok) return NextResponse.json(await retryRes.json());

      if (retryRes.status === 401) {
        await clearSessionCookies();
        return invalidSessionResponse();
      }

      return forwardUpstreamError(retryRes);
    }

    if (!meRes.ok) {
      return forwardUpstreamError(meRes);
    }

    const user = await meRes.json();
    return NextResponse.json(user);
  } catch {
    return unavailableResponse();
  }
}
