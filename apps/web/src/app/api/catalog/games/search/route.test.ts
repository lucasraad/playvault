import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const protection = vi.hoisted(() => ({
  checkCatalogVisitorRateLimit: vi.fn(),
  getCatalogVisitor: vi.fn(),
  setCatalogVisitorCookie: vi.fn(),
}));

vi.mock("@/lib/catalog-protection", () => ({
  CatalogProtectionUnavailable: class CatalogProtectionUnavailable extends Error {},
  ...protection,
}));

import { GET } from "./route";

const result = {
  query: "Halo",
  limit: 10,
  results: [
    {
      igdb_id: 740,
      name: "Halo: Combat Evolved",
      slug: "halo-combat-evolved",
      summary: null,
      first_release_date: "2001-11-15",
      cover_url: null,
      platforms: [{ igdb_id: 11, name: "Xbox", abbreviation: "XBOX" }],
      genres: [{ igdb_id: 5, name: "Shooter" }],
    },
  ],
};

function request(query = "q=Halo&limit=10"): NextRequest {
  return new NextRequest(`http://localhost/api/catalog/games/search?${query}`, {
    headers: { Cookie: "gp_at=browser-secret; gp_rt=refresh-secret" },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("GET /api/catalog/games/search", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    protection.getCatalogVisitor.mockReturnValue({ signedId: "signed-visitor", isNew: false });
    protection.checkCatalogVisitorRateLimit.mockResolvedValue({
      allowed: true,
      retryAfter: 0,
    });
  });

  it("forwards only validated parameters and returns the stable schema", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(result));
    const browserRequest = request("q=%20Halo%20&limit=10");

    const response = await GET(browserRequest);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(result);
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(String(url)).toBe("http://localhost:8000/catalog/games/search?q=Halo&limit=10");
    expect(init).toMatchObject({
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-PlayVault-Catalog-Visitor": "signed-visitor",
      },
      signal: browserRequest.signal,
    });
    expect(JSON.stringify(init)).not.toContain("browser-secret");
    expect(JSON.stringify(init)).not.toContain("refresh-secret");
    expect(JSON.stringify(init)).not.toContain("Authorization");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it.each(["q=a", "q=Halo%22%3Blimit%20500%3B", "q=Halo&limit=21", "q=Halo&limit=1.5"])(
    "rejects invalid browser input without calling the backend: %s",
    async (query) => {
      const response = await GET(request(query));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ code: "invalid_search" });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    [429, { code: "catalog_global_rate_limited", detail: "Rate limited", retry_after: 2 }],
    [
      503,
      {
        code: "catalog_protection_unavailable",
        detail: "Game search protection unavailable",
      },
    ],
    [503, { code: "catalog_unavailable", detail: "Unavailable" }],
    [502, { code: "invalid_catalog_response", detail: "Invalid response" }],
  ])("forwards the documented %i catalog error", async (status, body) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(body, status));

    const response = await GET(request());

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual(body);
  });

  it("does not expose an unexpected backend error body", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ detail: "secret provider diagnostic", token: "secret" }, 500),
    );

    const response = await GET(request());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      code: "catalog_upstream_error",
      detail: "Game catalog request failed",
    });
  });

  it("maps network failures to a predictable unavailable response", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("network failed"));

    const response = await GET(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: "catalog_unavailable",
      detail: "Game catalog unavailable",
    });
  });

  it("stops before FastAPI when the visitor budget is exhausted", async () => {
    protection.checkCatalogVisitorRateLimit.mockResolvedValue({
      allowed: false,
      retryAfter: 12,
    });

    const response = await GET(request());

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      code: "catalog_visitor_rate_limited",
      detail: "Visitor game search limit exceeded",
      retry_after: 12,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails closed when the visitor protection store is unavailable", async () => {
    const { CatalogProtectionUnavailable } = await import("@/lib/catalog-protection");
    protection.checkCatalogVisitorRateLimit.mockRejectedValue(
      new CatalogProtectionUnavailable("store unavailable"),
    );

    const response = await GET(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: "catalog_protection_unavailable",
      detail: "Game search protection unavailable",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a malformed successful backend response", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ raw_igdb: "must not leak" }));

    const response = await GET(request());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      code: "invalid_catalog_response",
      detail: "Invalid game catalog response",
    });
  });
});
