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

import { POST as logout } from "./logout/route";
import { GET as getMe } from "./me/route";
import { POST as refresh } from "./refresh/route";

const rotatedTokens = {
  access_token: "new-access-token",
  refresh_token: "new-refresh-token",
  token_type: "bearer",
  expires_in: 3600,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/auth/refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    session.getRefreshToken.mockResolvedValue("current-refresh-token");
    session.clearSessionCookies.mockResolvedValue();
    session.setSessionCookies.mockResolvedValue();
  });

  it("returns a distinct no-session response without touching cookies", async () => {
    session.getRefreshToken.mockResolvedValue(undefined);

    const response = await refresh();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      code: "no_session",
      detail: "No active session",
    });
    expect(session.clearSessionCookies).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rotates both cookies and never returns tokens to JavaScript", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(rotatedTokens));

    const response = await refresh();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(session.setSessionCookies).toHaveBeenCalledWith({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      expiresIn: 3600,
    });
    expect(body).toEqual({ authenticated: true, expires_in: 3600 });
    expect(JSON.stringify(body)).not.toContain("token");
  });

  it("clears cookies only when the refresh token is rejected", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ detail: "Invalid credentials" }, 401));

    const response = await refresh();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      code: "invalid_session",
      detail: "Session expired",
    });
    expect(session.clearSessionCookies).toHaveBeenCalledOnce();
  });

  it.each([
    [429, "rate_limited", "Authentication rate limit exceeded"],
    [503, "auth_unavailable", "Authentication service unavailable"],
  ])("preserves cookies and propagates a %i response", async (status, code, detail) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ detail }, status));

    const response = await refresh();

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ code, detail });
    expect(session.clearSessionCookies).not.toHaveBeenCalled();
    expect(session.setSessionCookies).not.toHaveBeenCalled();
  });

  it("preserves cookies and reports network failures as unavailable", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("network unavailable"));

    const response = await refresh();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: "auth_unavailable",
      detail: "Authentication service unavailable",
    });
    expect(session.clearSessionCookies).not.toHaveBeenCalled();
  });
});

describe("GET /api/auth/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    session.getAccessToken.mockResolvedValue("current-access-token");
    session.getRefreshToken.mockResolvedValue("current-refresh-token");
    session.clearSessionCookies.mockResolvedValue();
    session.setSessionCookies.mockResolvedValue();
  });

  it("returns no_session when neither cookie exists", async () => {
    session.getAccessToken.mockResolvedValue(undefined);
    session.getRefreshToken.mockResolvedValue(undefined);

    const response = await getMe();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "no_session" });
    expect(session.clearSessionCookies).not.toHaveBeenCalled();
  });

  it.each([
    [429, "rate_limited"],
    [503, "auth_unavailable"],
  ])("propagates a direct /auth/me %i without clearing cookies", async (status, code) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ detail: "upstream failure" }, status));

    const response = await getMe();

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ code, detail: "upstream failure" });
    expect(session.clearSessionCookies).not.toHaveBeenCalled();
  });

  it("preserves cookies when refresh is rate limited after an access-token 401", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ detail: "Unauthorized" }, 401))
      .mockResolvedValueOnce(
        jsonResponse({ detail: "Authentication rate limit exceeded" }, 429),
      );

    const response = await getMe();

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ code: "rate_limited" });
    expect(session.clearSessionCookies).not.toHaveBeenCalled();
  });

  it("clears cookies when refresh is rejected after an access-token 401", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ detail: "Unauthorized" }, 401))
      .mockResolvedValueOnce(jsonResponse({ detail: "Invalid credentials" }, 401));

    const response = await getMe();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "invalid_session" });
    expect(session.clearSessionCookies).toHaveBeenCalledOnce();
  });

  it("rotates cookies and returns the user after a successful retry", async () => {
    const user = { id: "13ab3db9-b678-4716-9d21-cd8df3733e7b", email: "player@example.com" };
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ detail: "Unauthorized" }, 401))
      .mockResolvedValueOnce(jsonResponse(rotatedTokens))
      .mockResolvedValueOnce(jsonResponse(user));

    const response = await getMe();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(user);
    expect(session.setSessionCookies).toHaveBeenCalledWith({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      expiresIn: 3600,
    });
    expect(session.clearSessionCookies).not.toHaveBeenCalled();
    expect(vi.mocked(fetch).mock.calls[2]?.[1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: "Bearer new-access-token" }),
    });
  });

  it("preserves rotated cookies when the retry fails transiently", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ detail: "Unauthorized" }, 401))
      .mockResolvedValueOnce(jsonResponse(rotatedTokens))
      .mockResolvedValueOnce(jsonResponse({ detail: "Database unavailable" }, 503));

    const response = await getMe();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: "auth_unavailable",
      detail: "Database unavailable",
    });
    expect(session.setSessionCookies).toHaveBeenCalledOnce();
    expect(session.clearSessionCookies).not.toHaveBeenCalled();
  });

  it("clears rotated cookies when the retry rejects the new access token", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ detail: "Unauthorized" }, 401))
      .mockResolvedValueOnce(jsonResponse(rotatedTokens))
      .mockResolvedValueOnce(jsonResponse({ detail: "Unauthorized" }, 401));

    const response = await getMe();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "invalid_session" });
    expect(session.setSessionCookies).toHaveBeenCalledOnce();
    expect(session.clearSessionCookies).toHaveBeenCalledOnce();
  });
});

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.clearSessionCookies.mockResolvedValue();
  });

  it("reports successful local logout without claiming provider revocation", async () => {
    const response = await logout();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      logged_out: true,
      provider_session_revoked: false,
    });
    expect(session.clearSessionCookies).toHaveBeenCalledOnce();
  });

  it("reports failure when local cookies cannot be cleared", async () => {
    session.clearSessionCookies.mockRejectedValue(new Error("cookie store unavailable"));

    const response = await logout();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      code: "local_logout_failed",
      detail: "Local session could not be cleared",
      logged_out: false,
      provider_session_revoked: false,
    });
  });
});
