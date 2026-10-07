// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";

import { ApiRequestError } from "@/lib/api-client";
import type { GameSearchResponse } from "@/lib/api-client";

/* ---------- Mock api-client ---------- */

const mockSearchGames = vi.fn<
  (query: string, limit?: number, signal?: AbortSignal) => Promise<GameSearchResponse>
>();

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    searchGames: (...args: Parameters<typeof mockSearchGames>) => mockSearchGames(...args),
  };
});

import { GameSearch } from "./game-search";

/* ---------- Fixtures ---------- */

const HALO_RESULTS: GameSearchResponse = {
  query: "Halo",
  limit: 10,
  results: [
    {
      igdb_id: 740,
      name: "Halo: Combat Evolved",
      slug: "halo-combat-evolved",
      summary: "A great game",
      first_release_date: "2001-11-15",
      cover_url: "https://images.igdb.com/cover/halo.jpg",
      platforms: [
        { igdb_id: 11, name: "Xbox", abbreviation: "XBOX" },
        { igdb_id: 6, name: "PC (Microsoft Windows)", abbreviation: "PC" },
      ],
      genres: [
        { igdb_id: 5, name: "Shooter" },
        { igdb_id: 31, name: "Adventure" },
      ],
    },
    {
      igdb_id: 741,
      name: "Halo 2",
      slug: "halo-2",
      summary: null,
      first_release_date: null,
      cover_url: null,
      platforms: [],
      genres: [],
    },
  ],
};

const EMPTY_RESULTS: GameSearchResponse = {
  query: "xyznonexistent",
  limit: 10,
  results: [],
};

/* ---------- Tests ---------- */

describe("GameSearch component", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("renders idle state initially", () => {
    render(<GameSearch />);

    expect(screen.getByText("Search Games")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search for a game…")).toBeInTheDocument();
    expect(screen.getByText(/Search for games by name/)).toBeInTheDocument();
    expect(screen.getByText(/Type at least 2 characters/)).toBeInTheDocument();
  });

  it("shows results after typing and debounce", async () => {
    mockSearchGames.mockResolvedValueOnce(HALO_RESULTS);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<GameSearch />);

    const input = screen.getByPlaceholderText("Search for a game…");
    await user.type(input, "Halo");

    // Advance past debounce
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText("Halo: Combat Evolved")).toBeInTheDocument();
      expect(screen.getByText("Halo 2")).toBeInTheDocument();
    });

    // Check metadata display
    expect(screen.getByText("Nov 15, 2001")).toBeInTheDocument();
    expect(screen.getByText("XBOX · PC")).toBeInTheDocument();
    expect(screen.getByText("Shooter")).toBeInTheDocument();
    expect(screen.getByText("Adventure")).toBeInTheDocument();

    // Check result count
    expect(screen.getByText("2 games found")).toBeInTheDocument();

    // Check IGDB attribution
    expect(screen.getByText(/Game data provided by/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "IGDB.com" })).toHaveAttribute("href", "https://www.igdb.com");
  });

  it("shows empty state when no results", async () => {
    mockSearchGames.mockResolvedValueOnce(EMPTY_RESULTS);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<GameSearch />);

    const input = screen.getByPlaceholderText("Search for a game…");
    await user.type(input, "xyznonexistent");

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getAllByText(/No games found for/)[0]).toBeInTheDocument();
    });

    // Attribution visible even with empty results
    expect(screen.getByText(/Game data provided by/)).toBeInTheDocument();
  });

  it("returns to idle when query is cleared", async () => {
    mockSearchGames.mockResolvedValueOnce(HALO_RESULTS);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<GameSearch />);

    const input = screen.getByPlaceholderText("Search for a game…");
    await user.type(input, "Halo");

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText("Halo: Combat Evolved")).toBeInTheDocument();
    });

    // Click clear button
    const clearButton = screen.getByLabelText("Clear search");
    await user.click(clearButton);

    await waitFor(() => {
      expect(screen.getByText(/Search for games by name/)).toBeInTheDocument();
    });

    expect(screen.queryByText("Halo: Combat Evolved")).not.toBeInTheDocument();
  });

  it("does not search when query is less than 2 characters", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<GameSearch />);

    const input = screen.getByPlaceholderText("Search for a game…");
    await user.type(input, "H");

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    // Should remain in idle
    expect(screen.getByText(/Search for games by name/)).toBeInTheDocument();
    expect(mockSearchGames).not.toHaveBeenCalled();
  });

  it("handles invalid_search error", async () => {
    mockSearchGames.mockRejectedValueOnce(
      new ApiRequestError(400, "Search query contains unsupported characters", "invalid_search"),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<GameSearch />);

    const input = screen.getByPlaceholderText("Search for a game…");
    await user.type(input, "Te\"st");

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getAllByText("Search query contains unsupported characters")[0]).toBeInTheDocument();
    });

    // Retry button should be present
    expect(screen.getByText("Try again")).toBeInTheDocument();
  });

  it("handles visitor rate limit with retryAfter", async () => {
    mockSearchGames.mockRejectedValueOnce(
      new ApiRequestError(429, "Visitor game search limit exceeded", "catalog_visitor_rate_limited", undefined, 12),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<GameSearch />);

    await user.type(screen.getByPlaceholderText("Search for a game…"), "Halo");

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getAllByText(/wait 12 seconds/)[0]).toBeInTheDocument();
    });
  });

  it("handles global rate limit", async () => {
    mockSearchGames.mockRejectedValueOnce(
      new ApiRequestError(429, "Rate limited", "catalog_global_rate_limited", undefined, 5),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<GameSearch />);

    await user.type(screen.getByPlaceholderText("Search for a game…"), "Zelda");

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getAllByText(/temporarily busy.*5 seconds/)[0]).toBeInTheDocument();
    });
  });

  it("handles upstream rate limit", async () => {
    mockSearchGames.mockRejectedValueOnce(
      new ApiRequestError(429, "Rate limited", "catalog_upstream_rate_limited"),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<GameSearch />);

    await user.type(screen.getByPlaceholderText("Search for a game…"), "Mario");

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getAllByText(/rate limit reached/)[0]).toBeInTheDocument();
    });
  });

  it("handles catalog_protection_unavailable", async () => {
    mockSearchGames.mockRejectedValueOnce(
      new ApiRequestError(503, "Game search protection unavailable", "catalog_protection_unavailable"),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<GameSearch />);

    await user.type(screen.getByPlaceholderText("Search for a game…"), "Sonic");

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getAllByText("Game search is temporarily unavailable. Please try again later.")[0]).toBeInTheDocument();
    });
  });

  it("handles catalog_unavailable", async () => {
    mockSearchGames.mockRejectedValueOnce(
      new ApiRequestError(503, "Unavailable", "catalog_unavailable"),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<GameSearch />);

    await user.type(screen.getByPlaceholderText("Search for a game…"), "Link");

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getAllByText("The game catalog is temporarily unavailable. Please try again later.")[0]).toBeInTheDocument();
    });
  });

  it("handles 502 bad gateway", async () => {
    mockSearchGames.mockRejectedValueOnce(
      new ApiRequestError(502, "Invalid response", "invalid_catalog_response"),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<GameSearch />);

    await user.type(screen.getByPlaceholderText("Search for a game…"), "Kirby");

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getAllByText("Received an invalid response from the game catalog. Please try again.")[0]).toBeInTheDocument();
    });
  });

  it("handles unknown errors gracefully", async () => {
    mockSearchGames.mockRejectedValueOnce(new Error("Network failure"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<GameSearch />);

    await user.type(screen.getByPlaceholderText("Search for a game…"), "Test");

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getAllByText("An unexpected error occurred. Please try again.")[0]).toBeInTheDocument();
    });
  });

  it("discards stale responses (race condition protection)", async () => {
    // First search returns slowly
    let resolveFirst: (value: GameSearchResponse) => void;
    const firstPromise = new Promise<GameSearchResponse>((resolve) => {
      resolveFirst = resolve;
    });
    mockSearchGames.mockReturnValueOnce(firstPromise);

    // Second search returns immediately
    const secondResults: GameSearchResponse = {
      query: "Zelda",
      limit: 10,
      results: [
        {
          igdb_id: 1025,
          name: "The Legend of Zelda",
          slug: "the-legend-of-zelda",
          summary: null,
          first_release_date: "1986-02-21",
          cover_url: null,
          platforms: [{ igdb_id: 18, name: "NES", abbreviation: "NES" }],
          genres: [{ igdb_id: 31, name: "Adventure" }],
        },
      ],
    };
    mockSearchGames.mockResolvedValueOnce(secondResults);

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<GameSearch />);

    const input = screen.getByPlaceholderText("Search for a game…");

    // Type first query
    await user.type(input, "Ha");
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    // Clear and type second query before first resolves
    await user.clear(input);
    await user.type(input, "Zelda");
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    // Wait for second results to appear
    await waitFor(() => {
      expect(screen.getByText("The Legend of Zelda")).toBeInTheDocument();
    });

    // Now resolve the first (stale) response
    resolveFirst!(HALO_RESULTS);
    await act(async () => {
      vi.advanceTimersByTime(50);
    });

    // Stale response should not overwrite
    expect(screen.getByText("The Legend of Zelda")).toBeInTheDocument();
    expect(screen.queryByText("Halo: Combat Evolved")).not.toBeInTheDocument();
  });

  it("handles game with null fields gracefully", async () => {
    const results: GameSearchResponse = {
      query: "Test",
      limit: 10,
      results: [
        {
          igdb_id: 999,
          name: "Mystery Game",
          slug: "mystery-game",
          summary: null,
          first_release_date: null,
          cover_url: null,
          platforms: [],
          genres: [],
        },
      ],
    };
    mockSearchGames.mockResolvedValueOnce(results);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<GameSearch />);

    await user.type(screen.getByPlaceholderText("Search for a game…"), "Test");

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText("Mystery Game")).toBeInTheDocument();
    });

    // No date, platforms, or genres should be shown
    expect(screen.getByText("1 game found")).toBeInTheDocument();
  });

  it("retries search on retry button click", async () => {
    mockSearchGames.mockRejectedValueOnce(
      new ApiRequestError(503, "Unavailable", "catalog_unavailable"),
    );
    mockSearchGames.mockResolvedValueOnce(HALO_RESULTS);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<GameSearch />);

    const input = screen.getByPlaceholderText("Search for a game…");
    await user.type(input, "Halo");

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getAllByText(/temporarily unavailable/)[0]).toBeInTheDocument();
    });

    // Click retry
    const retryButton = screen.getByText("Try again");
    await user.click(retryButton);

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText("Halo: Combat Evolved")).toBeInTheDocument();
    });
  });

  it("has accessible search input with proper aria attributes", () => {
    render(<GameSearch />);

    const input = screen.getByRole("searchbox");
    expect(input).toHaveAttribute("aria-label", "Search games by name");
    expect(input).toHaveAttribute("aria-describedby", "search-hint");
    expect(input).toHaveAttribute("id", "search-input");
  });

  it("handles platforms with abbreviation null, falling back to name", async () => {
    const results: GameSearchResponse = {
      query: "Test",
      limit: 10,
      results: [
        {
          igdb_id: 800,
          name: "Platform Test",
          slug: "platform-test",
          summary: null,
          first_release_date: "2020-01-01",
          cover_url: null,
          platforms: [
            { igdb_id: 99, name: "Stadia", abbreviation: null },
            { igdb_id: 100, name: "Xbox One", abbreviation: "XONE" },
          ],
          genres: [{ igdb_id: 5, name: "Shooter" }],
        },
      ],
    };
    mockSearchGames.mockResolvedValueOnce(results);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<GameSearch />);

    await user.type(screen.getByPlaceholderText("Search for a game…"), "Test");

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText("Stadia · XONE")).toBeInTheDocument();
    });
  });
});
