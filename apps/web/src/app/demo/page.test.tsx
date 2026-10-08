// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";

// Mock api-client completely to ensure no real network calls are made
const mockSearchGames = vi.fn();
const mockGetProxy = vi.fn();
const mockPostProxy = vi.fn();

vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "mocked-inter" }),
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    searchGames: (...args: unknown[]) => mockSearchGames(...args),
    getProxy: (...args: unknown[]) => mockGetProxy(...args),
    postProxy: (...args: unknown[]) => mockPostProxy(...args),
  };
});

import DemoPage from "./page";
import RootLayout from "../layout";

describe("DemoPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("renders the demo layout and identifies as mock data", () => {
    render(<RootLayout><DemoPage /></RootLayout>);
    expect(screen.getByText(/Demo Mode: Using mock data/i)).toBeInTheDocument();
    expect(screen.getByText(/Welcome, demo/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  });

  it("allows navigation between Home and Search without real calls", async () => {
    render(<RootLayout><DemoPage /></RootLayout>);
    
    // Initially on Home tab
    expect(screen.getByText(/Welcome, demo!/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Search for a game…")).not.toBeInTheDocument();

    // Navigate to Search
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(screen.getByPlaceholderText("Search for a game…")).toBeInTheDocument();

    // Verify no real API calls were made
    expect(mockGetProxy).not.toHaveBeenCalled();
    expect(mockPostProxy).not.toHaveBeenCalled();
    expect(mockSearchGames).not.toHaveBeenCalled();
  });

  it("handles search and cancellation correctly", async () => {
    render(<RootLayout><DemoPage /></RootLayout>);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    
    // Go to search
    await user.click(screen.getByRole("button", { name: "Search" }));
    
    const input = screen.getByPlaceholderText("Search for a game…");
    
    // Type "mock"
    await user.type(input, "mock");
    
    // Advance debounce
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // It should show loading skeletons
    expect(screen.getByText("Searching…")).toBeInTheDocument();

    // Type " effect" to cancel the previous request and start a new one
    await user.type(input, " effect");

    // Advance debounce
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Advance network delay (800ms) for the second request
    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    // Should find Mock Effect and no real API calls
    expect(screen.getByText("Mock Effect")).toBeInTheDocument();
    expect(screen.queryByText("The Legend of Mock")).not.toBeInTheDocument();
    expect(screen.queryByText(/Game data provided by/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "IGDB.com" })).not.toBeInTheDocument();
    expect(screen.getByText("Mock data for demonstration purposes only")).toBeInTheDocument();
    expect(mockSearchGames).not.toHaveBeenCalled();
  });

  it("returns empty state for unmatched queries", async () => {
    render(<RootLayout><DemoPage /></RootLayout>);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.type(screen.getByPlaceholderText("Search for a game…"), "vazia");

    act(() => { vi.advanceTimersByTime(300); });
    await act(async () => { vi.advanceTimersByTime(800); });

    expect(screen.getAllByText(/No games found/i)[0]).toBeInTheDocument();
    expect(mockSearchGames).not.toHaveBeenCalled();
  });

  it("demonstrates error and recovery", async () => {
    render(<RootLayout><DemoPage /></RootLayout>);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    
    await user.click(screen.getByRole("button", { name: "Search" }));
    const input = screen.getByPlaceholderText("Search for a game…");
    
    // Trigger error state
    await user.type(input, "error");

    act(() => { vi.advanceTimersByTime(300); });
    await act(async () => { vi.advanceTimersByTime(800); });

    expect(screen.getAllByText(/An unexpected error occurred/i)[0]).toBeInTheDocument();

    // Click retry to recover
    await user.click(screen.getByRole("button", { name: /Try again/i }));

    // Retry calls search(), which debounces for 300ms, then fetches for 800ms
    // Wait for the full 1100ms
    await act(async () => { vi.advanceTimersByTime(1200); });

    // Should recover and show a result (The Legend of Mock)
    expect(screen.getByText("The Legend of Mock")).toBeInTheDocument();
    expect(mockSearchGames).not.toHaveBeenCalled();
  });
});
