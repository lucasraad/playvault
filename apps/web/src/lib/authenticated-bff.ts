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
  getAccessToken,
  getRefreshToken,
  setSessionCookies,
} from "@/lib/session";

const API_BASE =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000";

export type AuthenticatedFetchResult =
  | { response: Response; error?: never }
  | { response?: never; error: NextResponse };

export async function authenticatedFetch(
  requestWithAccessToken: (accessToken: string) => Promise<Response>,
): Promise<AuthenticatedFetchResult> {
  let accessToken = await getAccessToken();
  let accessWasRefreshed = false;
  if (!accessToken) {
    const refreshed = await refreshAccessToken(false);
    if ("error" in refreshed) return refreshed;
    accessToken = refreshed.accessToken;
    accessWasRefreshed = true;
  }

  const response = await requestWithAccessToken(accessToken);
  if (response.status !== 401) return { response };
  if (accessWasRefreshed) {
    await clearSessionCookies();
    return { error: invalidSessionResponse() };
  }

  const refreshed = await refreshAccessToken(true);
  if ("error" in refreshed) return refreshed;

  const retry = await requestWithAccessToken(refreshed.accessToken);
  if (retry.status === 401) {
    await clearSessionCookies();
    return { error: invalidSessionResponse() };
  }
  return { response: retry };
}

async function refreshAccessToken(
  accessWasRejected: boolean,
): Promise<{ accessToken: string } | { error: NextResponse }> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    if (accessWasRejected) {
      await clearSessionCookies();
      return { error: invalidSessionResponse() };
    }
    return { error: noSessionResponse() };
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    });
  } catch {
    return { error: unavailableResponse() };
  }

  if (!response.ok) {
    if (response.status === 401) {
      await clearSessionCookies();
      return { error: invalidSessionResponse() };
    }
    return { error: await forwardUpstreamError(response) };
  }

  const tokens: unknown = await response.json().catch(() => null);
  if (!isSessionTokens(tokens)) return { error: invalidUpstreamResponse() };
  await setSessionCookies({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
  });
  return { accessToken: tokens.access_token };
}
