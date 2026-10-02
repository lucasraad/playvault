import { NextRequest, NextResponse } from "next/server";

import {
  CatalogProtectionUnavailable,
  checkCatalogVisitorRateLimit,
  getCatalogVisitor,
  setCatalogVisitorCookie,
} from "@/lib/catalog-protection";

const API_BASE =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000";
const ALLOWED_ERROR_CODES = new Set([
  "invalid_search",
  "catalog_visitor_rate_limited",
  "catalog_global_rate_limited",
  "catalog_upstream_rate_limited",
  "catalog_protection_unavailable",
  "catalog_unavailable",
  "invalid_catalog_response",
  "catalog_upstream_error",
]);

interface CatalogError {
  code: string;
  detail: string;
  retry_after?: number;
}

interface GameSearchResult {
  igdb_id: number;
  name: string;
  slug: string;
  summary: string | null;
  first_release_date: string | null;
  cover_url: string | null;
  platforms: Array<{
    igdb_id: number;
    name: string;
    abbreviation: string | null;
  }>;
  genres: Array<{ igdb_id: number; name: string }>;
}

interface GameSearchResponse {
  query: string;
  limit: number;
  results: GameSearchResult[];
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const visitor = getCatalogVisitor(request);
    const decision = await checkCatalogVisitorRateLimit(visitor.signedId);
    if (!decision.allowed) {
      return withVisitorCookie(
        NextResponse.json(
          {
            code: "catalog_visitor_rate_limited",
            detail: "Visitor game search limit exceeded",
            retry_after: decision.retryAfter,
          },
          { status: 429 },
        ),
        visitor,
      );
    }

    const input = readSearchInput(request.nextUrl.searchParams);
    if ("error" in input) {
      return withVisitorCookie(NextResponse.json(input.error, { status: 400 }), visitor);
    }

    const upstreamUrl = new URL("/catalog/games/search", API_BASE);
    upstreamUrl.searchParams.set("q", input.query);
    upstreamUrl.searchParams.set("limit", String(input.limit));
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-PlayVault-Catalog-Visitor": visitor.signedId,
      },
      cache: "no-store",
    });
    const payload: unknown = await upstream.json().catch(() => null);

    if (!upstream.ok) {
      return withVisitorCookie(forwardCatalogError(upstream.status, payload), visitor);
    }
    if (!isGameSearchResponse(payload)) {
      return withVisitorCookie(
        catalogError(502, "invalid_catalog_response", "Invalid game catalog response"),
        visitor,
      );
    }
    return withVisitorCookie(
      NextResponse.json(payload, {
        headers: { "Cache-Control": "private, no-store" },
      }),
      visitor,
    );
  } catch (error) {
    if (error instanceof CatalogProtectionUnavailable) {
      return catalogError(
        503,
        "catalog_protection_unavailable",
        "Game search protection unavailable",
      );
    }
    return catalogError(503, "catalog_unavailable", "Game catalog unavailable");
  }
}

function withVisitorCookie(
  response: NextResponse,
  visitor: ReturnType<typeof getCatalogVisitor>,
): NextResponse {
  setCatalogVisitorCookie(response, visitor);
  return response;
}

function readSearchInput(searchParams: URLSearchParams):
  | { query: string; limit: number }
  | { error: CatalogError } {
  const query = (searchParams.get("q") ?? "").replace(/\s+/g, " ").trim();
  if (query.length < 2 || query.length > 80) {
    return {
      error: { code: "invalid_search", detail: "Search query must contain 2 to 80 characters" },
    };
  }
  if (!/^[\p{L}\p{N}_\s:.'&+!?(),/\-]+$/u.test(query)) {
    return {
      error: { code: "invalid_search", detail: "Search query contains unsupported characters" },
    };
  }

  const rawLimit = searchParams.get("limit") ?? "10";
  if (!/^\d+$/.test(rawLimit)) {
    return { error: { code: "invalid_search", detail: "Search limit must be an integer" } };
  }
  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
    return { error: { code: "invalid_search", detail: "Search limit must be between 1 and 20" } };
  }
  return { query, limit };
}

function forwardCatalogError(status: number, payload: unknown): NextResponse {
  if (!isCatalogError(payload) || !ALLOWED_ERROR_CODES.has(payload.code)) {
    return catalogError(502, "catalog_upstream_error", "Game catalog request failed");
  }
  const allowedStatus = [400, 429, 502, 503].includes(status) ? status : 502;
  return NextResponse.json(payload, { status: allowedStatus });
}

function catalogError(status: number, code: string, detail: string): NextResponse {
  return NextResponse.json({ code, detail }, { status });
}

function isCatalogError(value: unknown): value is CatalogError {
  if (!isRecord(value) || typeof value.code !== "string" || typeof value.detail !== "string") {
    return false;
  }
  return value.retry_after === undefined || typeof value.retry_after === "number";
}

function isGameSearchResponse(value: unknown): value is GameSearchResponse {
  return (
    isRecord(value) &&
    typeof value.query === "string" &&
    Number.isInteger(value.limit) &&
    Array.isArray(value.results) &&
    value.results.every(isGameSearchResult)
  );
}

function isGameSearchResult(value: unknown): value is GameSearchResult {
  return (
    isRecord(value) &&
    Number.isInteger(value.igdb_id) &&
    typeof value.name === "string" &&
    typeof value.slug === "string" &&
    isNullableString(value.summary) &&
    isNullableString(value.first_release_date) &&
    isNullableString(value.cover_url) &&
    Array.isArray(value.platforms) &&
    value.platforms.every(
      (platform) =>
        isRecord(platform) &&
        Number.isInteger(platform.igdb_id) &&
        typeof platform.name === "string" &&
        isNullableString(platform.abbreviation),
    ) &&
    Array.isArray(value.genres) &&
    value.genres.every(
      (genre) =>
        isRecord(genre) &&
        Number.isInteger(genre.igdb_id) &&
        typeof genre.name === "string",
    )
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
