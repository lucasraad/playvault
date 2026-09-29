import { NextResponse } from "next/server";

export interface SessionTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export function isSessionTokens(value: unknown): value is SessionTokens {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as Partial<SessionTokens>;
  return (
    typeof candidate.access_token === "string" &&
    candidate.access_token.length > 0 &&
    typeof candidate.refresh_token === "string" &&
    candidate.refresh_token.length > 0 &&
    typeof candidate.expires_in === "number" &&
    candidate.expires_in > 0
  );
}

export function noSessionResponse(): NextResponse {
  return NextResponse.json(
    { code: "no_session", detail: "No active session" },
    { status: 401 },
  );
}

export function invalidSessionResponse(): NextResponse {
  return NextResponse.json(
    { code: "invalid_session", detail: "Session expired" },
    { status: 401 },
  );
}

export function unavailableResponse(): NextResponse {
  return NextResponse.json(
    { code: "auth_unavailable", detail: "Authentication service unavailable" },
    { status: 503 },
  );
}

export function invalidUpstreamResponse(): NextResponse {
  return NextResponse.json(
    { code: "invalid_upstream_response", detail: "Invalid authentication service response" },
    { status: 502 },
  );
}

export async function forwardUpstreamError(response: Response): Promise<NextResponse> {
  const body: unknown = await response.json().catch(() => null);
  const detail =
    typeof body === "object" &&
    body !== null &&
    "detail" in body &&
    typeof body.detail === "string"
      ? body.detail
      : "Authentication request failed";
  const code =
    response.status === 429
      ? "rate_limited"
      : response.status === 503
        ? "auth_unavailable"
        : "auth_upstream_error";

  return NextResponse.json({ code, detail }, { status: response.status });
}
