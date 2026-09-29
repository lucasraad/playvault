/**
 * POST /api/auth/logout
 *
 * Clears the HttpOnly session cookies, effectively ending the session
 * on the frontend side. The backend tokens are not revoked (Supabase
 * Auth tokens expire naturally).
 */

import { NextResponse } from "next/server";

import { clearSessionCookies } from "@/lib/session";

export async function POST(): Promise<NextResponse> {
  try {
    await clearSessionCookies();
    return NextResponse.json({
      logged_out: true,
      provider_session_revoked: false,
    });
  } catch {
    return NextResponse.json(
      {
        code: "local_logout_failed",
        detail: "Local session could not be cleared",
        logged_out: false,
        provider_session_revoked: false,
      },
      { status: 500 },
    );
  }
}
