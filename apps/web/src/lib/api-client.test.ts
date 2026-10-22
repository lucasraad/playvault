import { describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "./api-client";

// We need to re-import after verifying the module structure
describe("ApiRequestError.retryAfter", () => {
  it("preserves retryAfter when provided", () => {
    const err = new ApiRequestError(429, "Rate limited", "catalog_visitor_rate_limited", undefined, 12);
    expect(err.retryAfter).toBe(12);
    expect(err.status).toBe(429);
    expect(err.code).toBe("catalog_visitor_rate_limited");
  });

  it("defaults retryAfter to undefined when not provided", () => {
    const err = new ApiRequestError(500, "Server error");
    expect(err.retryAfter).toBeUndefined();
  });

  it("is an instance of Error", () => {
    const err = new ApiRequestError(400, "Bad request");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ApiRequestError");
    expect(err.message).toBe("Bad request");
  });
});

describe("parseErrorResponse (via searchGames/getProxy)", () => {
  it("parses retry_after from JSON error body", async () => {
    const mockResponse = new Response(
      JSON.stringify({
        code: "catalog_visitor_rate_limited",
        detail: "Visitor game search limit exceeded",
        retry_after: 12,
      }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const { getProxy } = await import("./api-client");

    try {
      await getProxy("/api/catalog/games/search?q=Halo");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiRequestError);
      const apiErr = err as ApiRequestError;
      expect(apiErr.status).toBe(429);
      expect(apiErr.code).toBe("catalog_visitor_rate_limited");
      expect(apiErr.retryAfter).toBe(12);
    }

    vi.unstubAllGlobals();
  });

  it("ignores non-positive retry_after", async () => {
    const mockResponse = new Response(
      JSON.stringify({
        code: "catalog_unavailable",
        detail: "unavailable",
        retry_after: 0,
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const { getProxy } = await import("./api-client");

    try {
      await getProxy("/test");
      expect.unreachable("should have thrown");
    } catch (err) {
      const apiErr = err as ApiRequestError;
      expect(apiErr.retryAfter).toBeUndefined();
    }

    vi.unstubAllGlobals();
  });

  it("ignores non-numeric retry_after", async () => {
    const mockResponse = new Response(
      JSON.stringify({
        code: "catalog_unavailable",
        detail: "unavailable",
        retry_after: "soon",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const { getProxy } = await import("./api-client");

    try {
      await getProxy("/test");
      expect.unreachable("should have thrown");
    } catch (err) {
      const apiErr = err as ApiRequestError;
      expect(apiErr.retryAfter).toBeUndefined();
    }

    vi.unstubAllGlobals();
  });
});

describe("addCatalogGameToLibrary", () => {
  it("posts only the external game and platform identifiers to the authenticated BFF", async () => {
    const payload = {
      id: "entry-id",
      game: { id: "game-id", igdb_id: 740, title: "Halo" },
      platform: { id: "platform-id", igdb_id: 11, slug: "xbox", name: "Xbox" },
      status: "backlog",
      source: "manual",
      created: true,
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { addCatalogGameToLibrary } = await import("./api-client");

    await expect(addCatalogGameToLibrary(740, 11)).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/library/entries",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({ igdb_id: 740, platform_igdb_id: 11 }),
      }),
    );
    vi.unstubAllGlobals();
  });
});
