import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  clearSessionCookies: vi.fn<() => Promise<void>>(),
  getAccessToken: vi.fn<() => Promise<string | undefined>>(),
  getRefreshToken: vi.fn<() => Promise<string | undefined>>(),
  setSessionCookies: vi.fn<
    (tokens: { accessToken: string; refreshToken: string; expiresIn: number }) => Promise<void>
  >(),
}));

vi.mock("@/lib/session", () => session);

import { POST } from "./route";

const requestBody = { igdb_id: 1942, platform_igdb_id: 6 };
const createdEntry = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  game: {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    igdb_id: 1942,
    title: "The Witcher 3: Wild Hunt",
  },
  platform: {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    igdb_id: 6,
    slug: "pc",
    name: "PC",
  },
  status: "backlog",
  source: "manual",
  created: true,
};
const rotatedTokens = {
  access_token: "new-access-token",
  refresh_token: "new-refresh-token",
  expires_in: 3600,
};

function request(body: unknown = requestBody, origin = "http://localhost"): NextRequest {
  return new NextRequest("http://localhost/api/auth/library/entries", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      "Sec-Fetch-Site": "same-origin",
    },
    body: JSON.stringify(body),
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/auth/library/entries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    session.getAccessToken.mockResolvedValue("current-access-token");
    session.getRefreshToken.mockResolvedValue("current-refresh-token");
    session.clearSessionCookies.mockResolvedValue();
    session.setSessionCookies.mockResolvedValue();
  });

  it("rejects a user without session before calling FastAPI", async () => {
    session.getAccessToken.mockResolvedValue(undefined);
    session.getRefreshToken.mockResolvedValue(undefined);

    const response = await POST(request());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "no_session" });
    expect(fetch).not.toHaveBeenCalled();
    expect(session.clearSessionCookies).not.toHaveBeenCalled();
  });

  it("clears cookies after the provider confirms an expired refresh token", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ detail: "Unauthorized" }, 401))
      .mockResolvedValueOnce(jsonResponse({ detail: "Invalid credentials" }, 401));

    const response = await POST(request());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "invalid_session" });
    expect(session.clearSessionCookies).toHaveBeenCalledOnce();
  });

  it("clears cookies when a freshly rotated access token is rejected", async () => {
    session.getAccessToken.mockResolvedValue(undefined);
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(rotatedTokens))
      .mockResolvedValueOnce(jsonResponse({ detail: "Unauthorized" }, 401));

    const response = await POST(request());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "invalid_session" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(session.setSessionCookies).toHaveBeenCalledOnce();
    expect(session.clearSessionCookies).toHaveBeenCalledOnce();
  });

  it.each([
    [404, "catalog_game_not_found"],
    [422, "catalog_platform_not_found"],
  ])("forwards a validated %i selection error", async (status, code) => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ code, detail: "Invalid catalog selection" }, status),
    );

    const response = await POST(request());

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({
      code,
      detail: "Invalid catalog selection",
    });
    expect(session.clearSessionCookies).not.toHaveBeenCalled();
  });

  it("adds the selected game and platform without accepting a browser user id", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(createdEntry, 201));

    const response = await POST(request());

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(createdEntry);
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(String(url)).toBe("http://localhost:8000/library/entries/from-catalog");
    expect(init).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer current-access-token" }),
      body: JSON.stringify(requestBody),
    });
    expect(JSON.stringify(init)).not.toContain("profile_id");

    const rejected = await POST(
      request({ ...requestBody, profile_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }),
    );
    expect(rejected.status).toBe(400);
    await expect(rejected.json()).resolves.toMatchObject({ code: "invalid_library_request" });
  });

  it("returns the existing entry when the same combination is repeated", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ ...createdEntry, created: false }, 200),
    );

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: createdEntry.id,
      created: false,
    });
  });

  it.each([
    [429, "catalog_upstream_rate_limited"],
    [503, "catalog_unavailable"],
    [503, "library_unavailable"],
  ])("preserves session cookies for a transient %i response", async (status, code) => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ code, detail: "Temporary failure" }, status),
    );

    const response = await POST(request());

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ code });
    expect(session.clearSessionCookies).not.toHaveBeenCalled();
    expect(session.setSessionCookies).not.toHaveBeenCalled();
  });

  it("preserves rotated cookies when the retried write fails transiently", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ detail: "Unauthorized" }, 401))
      .mockResolvedValueOnce(jsonResponse(rotatedTokens))
      .mockResolvedValueOnce(
        jsonResponse(
          { code: "library_unavailable", detail: "Library service unavailable" },
          503,
        ),
      );

    const response = await POST(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "library_unavailable" });
    expect(session.setSessionCookies).toHaveBeenCalledWith({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      expiresIn: 3600,
    });
    expect(session.clearSessionCookies).not.toHaveBeenCalled();
  });

  it("preserves cookies when refresh is rate limited", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ detail: "Unauthorized" }, 401))
      .mockResolvedValueOnce(
        jsonResponse({ detail: "Authentication rate limit exceeded" }, 429),
      );

    const response = await POST(request());

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ code: "rate_limited" });
    expect(session.clearSessionCookies).not.toHaveBeenCalled();
  });

  it("rejects cross-origin writes before reading session cookies", async () => {
    const response = await POST(request(requestBody, "https://attacker.example"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "invalid_origin" });
    expect(fetch).not.toHaveBeenCalled();
    expect(session.getAccessToken).not.toHaveBeenCalled();
  });
});
