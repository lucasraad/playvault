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
  await clearSessionCookies();
  return NextResponse.json({ logged_out: true });
}
