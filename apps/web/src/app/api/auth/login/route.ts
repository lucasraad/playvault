/**
 * POST /api/auth/login
 *
 * Proxies login to the FastAPI backend and stores the returned tokens
 * in HttpOnly cookies. The response body only confirms success and
 * expiry — no tokens are ever sent to client-side JavaScript.
 */

import { NextRequest, NextResponse } from "next/server";

import { setSessionCookies } from "@/lib/session";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();

    const upstream = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!upstream.ok) {
      const data = await upstream.json().catch(() => ({}));
      return NextResponse.json(data, { status: upstream.status });
    }

    const tokens = await upstream.json();

    await setSessionCookies({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
    });

    // Return only what the client needs — NOT the tokens themselves
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
