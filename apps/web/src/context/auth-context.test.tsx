// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { AuthProvider, useAuth } from "./auth-context";
import { UserDashboard } from "@/components/auth/user-dashboard";
import * as apiClient from "@/lib/api-client";

// Mock the API client
vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    getProxy: vi.fn(),
    postProxy: vi.fn(),
  };
});

// A dummy component to consume the context
function TestComponent() {
  const { user, loading, globalError, login, logout, refreshUser, clearError } = useAuth();

  return (
    <div>
      <div data-testid="loading">{loading.toString()}</div>
      <div data-testid="user">{user ? user.email : "none"}</div>
      <div data-testid="globalError">{globalError || "none"}</div>
      <button onClick={() => login("test@test.com", "password")}>Login</button>
      <button onClick={logout}>Logout</button>
      <button onClick={refreshUser}>Refresh</button>
      <button onClick={clearError}>Clear</button>
    </div>
  );
}

describe("AuthContext and UserDashboard Behavior", () => {
  const mockGetProxy = vi.mocked(apiClient.getProxy);
  const mockPostProxy = vi.mocked(apiClient.postProxy);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("handles missing session (no_session) gracefully on init", async () => {
    // /api/auth/refresh returns has_session: false
    mockGetProxy.mockImplementation(async (path) => {
      if (path === "/api/auth/refresh") return { has_session: false };
      throw new Error("Unexpected path");
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByTestId("loading")).toHaveTextContent("true");

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
    });

    expect(screen.getByTestId("user")).toHaveTextContent("none");
    expect(screen.getByTestId("globalError")).toHaveTextContent("none");
  });

  it("handles 503 auth_unavailable error on init by setting globalError", async () => {
    // /api/auth/refresh returns has_session: true
    // /api/auth/me returns 503
    mockGetProxy.mockImplementation(async (path) => {
      if (path === "/api/auth/refresh") return { has_session: true };
      if (path === "/api/auth/me") {
        throw new apiClient.ApiRequestError(503, "Unavailable", "auth_unavailable");
      }
      throw new Error("Unexpected path");
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
    });

    expect(screen.getByTestId("user")).toHaveTextContent("none");
    expect(screen.getByTestId("globalError")).toHaveTextContent("Failed to connect to the authentication service.");
  });

  it("handles 401 invalid_session error on init by clearing state without globalError", async () => {
    mockGetProxy.mockImplementation(async (path) => {
      if (path === "/api/auth/refresh") return { has_session: true };
      if (path === "/api/auth/me") {
        throw new apiClient.ApiRequestError(401, "Invalid", "invalid_session");
      }
      throw new Error("Unexpected path");
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
    });

    expect(screen.getByTestId("user")).toHaveTextContent("none");
    expect(screen.getByTestId("globalError")).toHaveTextContent("none");
  });

  it("handles 429 rate_limited on refreshUser while preserving existing user data", async () => {
    mockGetProxy.mockImplementation(async (path) => {
      if (path === "/api/auth/refresh") return { has_session: true };
      if (path === "/api/auth/me") return { id: "1", email: "gamer@example.com" };
      throw new Error("Unexpected path");
    });

    const { getByTestId, getByText } = render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(getByTestId("user")).toHaveTextContent("gamer@example.com");
    });

    // Now user wants to refresh, but it fails with 429
    mockGetProxy.mockImplementation(async (path) => {
      if (path === "/api/auth/me") throw new apiClient.ApiRequestError(429, "Too many requests", "rate_limited");
      throw new Error("Unexpected");
    });

    await userEvent.click(getByText("Refresh"));

    await waitFor(() => {
      expect(getByTestId("globalError")).toHaveTextContent("Failed to verify session. Please try again.");
    });
    // User is preserved!
    expect(getByTestId("user")).toHaveTextContent("gamer@example.com");
  });

  it("handles successful logout correctly", async () => {
    mockGetProxy.mockImplementation(async (path) => {
      if (path === "/api/auth/refresh") return { has_session: true };
      if (path === "/api/auth/me") return { id: "1", email: "gamer@example.com" };
      throw new Error("Unexpected");
    });

    mockPostProxy.mockImplementation(async (path) => {
      if (path === "/api/auth/logout") return { logged_out: true, provider_session_revoked: false };
      throw new Error("Unexpected");
    });

    const { getByTestId, getByText } = render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(getByTestId("user")).toHaveTextContent("gamer@example.com");
    });

    await userEvent.click(getByText("Logout"));

    await waitFor(() => {
      expect(getByTestId("user")).toHaveTextContent("none");
      expect(getByTestId("globalError")).toHaveTextContent("none");
    });
  });

  it("handles failed logout correctly by preserving user state and showing error", async () => {
    mockGetProxy.mockImplementation(async (path) => {
      if (path === "/api/auth/refresh") return { has_session: true };
      if (path === "/api/auth/me") return { id: "1", email: "gamer@example.com" };
      throw new Error("Unexpected");
    });

    mockPostProxy.mockImplementation(async (path) => {
      if (path === "/api/auth/logout") throw new apiClient.ApiRequestError(500, "Logout failed", "local_logout_failed");
      throw new Error("Unexpected");
    });

    const { getByTestId, getByText } = render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(getByTestId("user")).toHaveTextContent("gamer@example.com");
    });

    await userEvent.click(getByText("Logout"));

    await waitFor(() => {
      expect(getByTestId("globalError")).toHaveTextContent("Logout failed. Please try again.");
    });
    expect(getByTestId("user")).toHaveTextContent("gamer@example.com"); // Still there
  });
});

describe("UserDashboard Component", () => {
  const mockGetProxy = vi.mocked(apiClient.getProxy);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("handles user with null email safely", async () => {
    mockGetProxy.mockImplementation(async (path) => {
      if (path === "/api/auth/refresh") return { has_session: true };
      if (path === "/api/auth/me") return { id: "1", email: null };
      throw new Error("Unexpected");
    });

    render(
      <AuthProvider>
        <UserDashboard />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Welcome, Gamer!")).toBeInTheDocument();
      expect(screen.getByText("No email provided")).toBeInTheDocument();
    });
  });
});
