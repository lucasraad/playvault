/**
 * API client for the FastAPI backend.
 *
 * Client components use NEXT_PUBLIC_API_URL directly for unauthenticated
 * endpoints (signup). Authenticated requests go through the Next.js
 * server-side proxy (/api/auth/*) which attaches tokens from HttpOnly
 * cookies.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/* ---------- Types ---------- */

export interface ApiError {
  status: number;
  detail: string;
  code?: string;
  validationErrors?: ValidationError[];
}

export interface ValidationError {
  loc: (string | number)[];
  msg: string;
  type: string;
}

export interface SessionTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface AuthUser {
  id: string;
  email: string | null;
}

export interface GameSearchPlatform {
  igdb_id: number;
  name: string;
  abbreviation: string | null;
}

export interface GameSearchGenre {
  igdb_id: number;
  name: string;
}

export interface GameSearchResult {
  /** External catalog reference. This is not the internal games.id UUID. */
  igdb_id: number;
  name: string;
  slug: string;
  summary: string | null;
  first_release_date: string | null;
  cover_url: string | null;
  platforms: GameSearchPlatform[];
  genres: GameSearchGenre[];
}

export interface GameSearchResponse {
  query: string;
  limit: number;
  results: GameSearchResult[];
}

/* ---------- Helpers ---------- */

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
    public readonly code?: string,
    public readonly validationErrors?: ValidationError[],
    /** Seconds to wait before retrying, when provided by the server. */
    public readonly retryAfter?: number,
  ) {
    super(detail);
    this.name = "ApiRequestError";
  }
}

async function parseErrorResponse(res: Response): Promise<ApiRequestError> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return new ApiRequestError(res.status, res.statusText || "Request failed");
  }

  const parsed = (body || {}) as {
    detail?: unknown;
    code?: string;
    retry_after?: unknown;
  };

  const retryAfter =
    typeof parsed.retry_after === "number" && parsed.retry_after > 0
      ? parsed.retry_after
      : undefined;

  // FastAPI 422 returns { detail: [ { loc, msg, type } ] }
  if (res.status === 422 && Array.isArray(parsed.detail)) {
    return new ApiRequestError(
      422,
      "Validation failed",
      parsed.code,
      parsed.detail as ValidationError[],
      retryAfter,
    );
  }

  const detail =
    typeof parsed.detail === "string"
      ? parsed.detail
      : "An unexpected error occurred";
  return new ApiRequestError(res.status, detail, parsed.code, undefined, retryAfter);
}

/* ---------- Public API ---------- */

/**
 * POST JSON to the FastAPI backend (direct, not proxied).
 * Used by server-side route handlers only.
 */
export async function postDirect<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) throw await parseErrorResponse(res);
  return res.json() as Promise<T>;
}

/**
 * GET from the FastAPI backend with a Bearer token.
 * Used by server-side route handlers only.
 */
export async function getDirect<T>(
  path: string,
  token: string,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) throw await parseErrorResponse(res);
  return res.json() as Promise<T>;
}

/**
 * POST JSON to the Next.js proxy routes (/api/auth/*).
 * Used by client components.
 */
export async function postProxy<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
  });

  if (!res.ok) throw await parseErrorResponse(res);
  return res.json() as Promise<T>;
}

/**
 * GET from the Next.js proxy routes (/api/auth/*).
 * Used by client components. Cookies are sent automatically.
 */
export async function getProxy<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });

  if (!res.ok) throw await parseErrorResponse(res);
  return res.json() as Promise<T>;
}

/** Search the external catalog through the Next.js BFF. Does not persist games. */
export async function searchGames(
  query: string,
  limit = 10,
  signal?: AbortSignal,
): Promise<GameSearchResponse> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  return getProxy<GameSearchResponse>(`/api/catalog/games/search?${params}`, signal);
}

/**
 * POST to the Next.js proxy for logout.
 */
export async function postProxyNoBody(path: string): Promise<void> {
  const res = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
  });

  if (!res.ok) throw await parseErrorResponse(res);
}
