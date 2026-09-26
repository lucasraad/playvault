/**
 * POST /api/auth/signup
 *
 * Proxies signup to the FastAPI backend. No session cookie is set
 * because the user must confirm their e-mail first.
 */

import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();

    const upstream = await fetch(`${API_BASE}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await upstream.json().catch(() => ({}));

    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json(
      { detail: "Internal error" },
      { status: 500 },
    );
  }
}
