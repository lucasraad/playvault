// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";

import { AuthProvider, useAuth } from "@/context/auth-context";
import { AuthShell } from "@/components/auth/auth-shell";
import { UserDashboard } from "@/components/auth/user-dashboard";
import {
  ApiRequestError,
  addCatalogGameToLibrary,
  getProxy,
  searchGames,
} from "@/lib/api-client";

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    getProxy: vi.fn(),
    postProxy: vi.fn(),
    searchGames: vi.fn(),
    addCatalogGameToLibrary: vi.fn(),
  };
});

function TestTrigger() {
  const { refreshUser } = useAuth();
  return <button onClick={refreshUser}>Trigger Refresh</button>;
}

describe("Auth UI - Recoverable Errors", () => {
  const mockGetProxy = vi.mocked(getProxy);
  const mockSearchGames = vi.mocked(searchGames);
  const mockAddCatalogGameToLibrary = vi.mocked(addCatalogGameToLibrary);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("AuthShell: displays 503 auth_unavailable correctly and handles 'Try Again'", async () => {
    mockGetProxy.mockImplementation(async (path) => {
      if (path === "/api/auth/refresh") return { has_session: true };
      if (path === "/api/auth/me") throw { name: "ApiRequestError", status: 503, code: "auth_unavailable", detail: "Unavailable" };
      throw new Error("Unexpected");
    });

    render(
      <AuthProvider>
        <AuthShell />
      </AuthProvider>
    );

    // Initial loading
    expect(screen.getByText("Loading your profile…")).toBeInTheDocument();

    // Global error message is displayed
    await waitFor(() => {
      expect(screen.getByText("Authentication service is temporarily unavailable. Please try again later.")).toBeInTheDocument();
    });

    // Try again
    mockGetProxy.mockImplementation(async (path) => {
      if (path === "/api/auth/me") return { id: "1", email: "gamer@example.com" };
      throw new Error("Unexpected");
    });

    await userEvent.click(screen.getByRole("button", { name: "Try Again" }));

    // User dashboard is displayed
    await waitFor(() => {
      expect(screen.getByText("Welcome, gamer!")).toBeInTheDocument();
    });
  });

  it("UserDashboard: displays 429 rate_limited error correctly and handles 'Try Again'", async () => {
    // Initial successful login
    mockGetProxy.mockImplementation(async (path) => {
      if (path === "/api/auth/refresh") return { has_session: true };
      if (path === "/api/auth/me") return { id: "1", email: "gamer@example.com" };
      throw new Error("Unexpected");
    });

    // Need a dummy component to trigger refresh inside UserDashboard, or we just render AuthProvider with a button that calls refresh
    // Wait, UserDashboard does not have a "refresh" button. How do we trigger it in UserDashboard?
    // UserDashboard just displays the globalError and has a "Try Again" button for it.
    // So we can mock a refresh that throws 429.
    
    const { getByText } = render(
      <AuthProvider>
        <UserDashboard />
        <TestTrigger />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(getByText("Welcome, gamer!")).toBeInTheDocument();
    });

    // Trigger refresh with error
    mockGetProxy.mockImplementation(async (path) => {
      if (path === "/api/auth/me") throw { name: "ApiRequestError", status: 429, code: "rate_limited", detail: "Too many requests" };
      throw new Error("Unexpected");
    });

    await userEvent.click(getByText("Trigger Refresh"));

    await waitFor(() => {
      expect(getByText("Too many requests. Please wait a moment and try again.")).toBeInTheDocument();
    });

    // Try again button is in the dashboard banner
    mockGetProxy.mockImplementation(async (path) => {
      if (path === "/api/auth/me") return { id: "1", email: "gamer@example.com" };
      throw new Error("Unexpected");
    });

    await userEvent.click(screen.getByRole("button", { name: "Try Again" }));

    // Error banner is gone
    await waitFor(() => {
      expect(screen.queryByText("Too many requests. Please wait a moment and try again.")).not.toBeInTheDocument();
    });
  });

  it.each(["no_session", "invalid_session"])(
    "AuthShell: returns to login when a library write reports %s",
    async (code) => {
      mockGetProxy.mockImplementation(async (path) => {
        if (path === "/api/auth/refresh") return { has_session: true };
        if (path === "/api/auth/me") return { id: "1", email: "gamer@example.com" };
        throw new Error("Unexpected path");
      });
      mockSearchGames.mockResolvedValue({
        query: "Halo",
        limit: 10,
        results: [{
          igdb_id: 740,
          name: "Halo: Combat Evolved",
          slug: "halo-combat-evolved",
          summary: null,
          first_release_date: null,
          cover_url: null,
          platforms: [{ igdb_id: 11, name: "Xbox", abbreviation: "XBOX" }],
          genres: [],
        }],
      });
      mockAddCatalogGameToLibrary.mockRejectedValue(
        new ApiRequestError(401, "Session unavailable", code),
      );

      render(
        <AuthProvider>
          <AuthShell />
        </AuthProvider>,
      );

      await screen.findByText("Welcome, gamer!");
      await userEvent.click(screen.getByRole("button", { name: "Search" }));
      await userEvent.type(screen.getByRole("searchbox"), "Halo");
      await screen.findByText("Halo: Combat Evolved");
      await userEvent.selectOptions(screen.getByLabelText("Platform"), "11");
      await userEvent.click(screen.getByRole("button", { name: "Add to library" }));

      expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
      expect(screen.queryByText("Welcome, gamer!")).not.toBeInTheDocument();
    },
  );

  it.each([
    [new ApiRequestError(429, "Limited", "catalog_user_rate_limited", undefined, 8), "8 seconds"],
    [new ApiRequestError(503, "Unavailable", "library_unavailable"), "session is still active"],
  ])("AuthShell: preserves the authenticated dashboard for transient library failures", async (failure, message) => {
    mockGetProxy.mockImplementation(async (path) => {
      if (path === "/api/auth/refresh") return { has_session: true };
      if (path === "/api/auth/me") return { id: "1", email: "gamer@example.com" };
      throw new Error("Unexpected path");
    });
    mockSearchGames.mockResolvedValue({
      query: "Halo",
      limit: 10,
      results: [{
        igdb_id: 740,
        name: "Halo: Combat Evolved",
        slug: "halo-combat-evolved",
        summary: null,
        first_release_date: null,
        cover_url: null,
        platforms: [{ igdb_id: 11, name: "Xbox", abbreviation: "XBOX" }],
        genres: [],
      }],
    });
    mockAddCatalogGameToLibrary.mockRejectedValue(failure);

    render(
      <AuthProvider>
        <AuthShell />
      </AuthProvider>,
    );

    await screen.findByText("Welcome, gamer!");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.type(screen.getByRole("searchbox"), "Halo");
    await screen.findByText("Halo: Combat Evolved");
    await userEvent.selectOptions(screen.getByLabelText("Platform"), "11");
    await userEvent.click(screen.getByRole("button", { name: "Add to library" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Sign in" })).not.toBeInTheDocument();
  });
});
