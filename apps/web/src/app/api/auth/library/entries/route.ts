import { NextRequest, NextResponse } from "next/server";

import { authenticatedFetch } from "@/lib/authenticated-bff";

const API_BASE =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000";

const ALLOWED_ERROR_CODES = new Set([
  "catalog_game_not_found",
  "catalog_platform_not_found",
  "catalog_upstream_rate_limited",
  "catalog_unavailable",
  "invalid_catalog_response",
  "catalog_upstream_error",
  "library_unavailable",
]);

interface AddLibraryRequest {
  igdb_id: number;
  platform_igdb_id: number;
}

interface LibraryEntryResponse {
  id: string;
  game: { id: string; igdb_id: number; title: string };
  platform: { id: string; igdb_id: number; slug: string; name: string };
  status: string;
  source: string;
  created: boolean;
}

interface LibraryError {
  code: string;
  detail: string;
  retry_after?: number;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(request)) {
    return errorResponse(403, "invalid_origin", "Cross-origin library writes are not allowed");
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return errorResponse(415, "invalid_content_type", "Content-Type must be application/json");
  }

  const body: unknown = await request.json().catch(() => null);
  if (!isAddLibraryRequest(body)) {
    return errorResponse(
      400,
      "invalid_library_request",
      "igdb_id and platform_igdb_id must be positive integers",
    );
  }

  try {
    const result = await authenticatedFetch((accessToken) =>
      fetch(`${API_BASE}/library/entries/from-catalog`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: request.signal,
      }),
    );
    if (result.error) return result.error;

    const payload: unknown = await result.response.json().catch(() => null);
    if (!result.response.ok) {
      return forwardLibraryError(result.response.status, payload);
    }
    if (!isLibraryEntryResponse(payload)) {
      return errorResponse(502, "invalid_library_response", "Invalid library response");
    }
    return NextResponse.json(payload, {
      status: result.response.status === 201 ? 201 : 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return errorResponse(503, "library_unavailable", "Library service unavailable");
  }
}

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (origin !== request.nextUrl.origin) return false;
  return fetchSite === null || fetchSite === "same-origin";
}

function isAddLibraryRequest(value: unknown): value is AddLibraryRequest {
  if (!isRecord(value)) return false;
  if (Object.keys(value).some((key) => key !== "igdb_id" && key !== "platform_igdb_id")) {
    return false;
  }
  return isPositiveInteger(value.igdb_id) && isPositiveInteger(value.platform_igdb_id);
}

function forwardLibraryError(status: number, payload: unknown): NextResponse {
  if (!isLibraryError(payload) || !ALLOWED_ERROR_CODES.has(payload.code)) {
    return errorResponse(502, "library_upstream_error", "Library request failed");
  }
  const allowedStatus = [404, 422, 429, 502, 503].includes(status) ? status : 502;
  return NextResponse.json(payload, { status: allowedStatus });
}

function errorResponse(status: number, code: string, detail: string): NextResponse {
  return NextResponse.json({ code, detail }, { status });
}

function isLibraryError(value: unknown): value is LibraryError {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.detail === "string" &&
    (value.retry_after === undefined || typeof value.retry_after === "number")
  );
}

function isLibraryEntryResponse(value: unknown): value is LibraryEntryResponse {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isRecord(value.game) &&
    typeof value.game.id === "string" &&
    isPositiveInteger(value.game.igdb_id) &&
    typeof value.game.title === "string" &&
    isRecord(value.platform) &&
    typeof value.platform.id === "string" &&
    isPositiveInteger(value.platform.igdb_id) &&
    typeof value.platform.slug === "string" &&
    typeof value.platform.name === "string" &&
    typeof value.status === "string" &&
    typeof value.source === "string" &&
    typeof value.created === "boolean"
  );
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
