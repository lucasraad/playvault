/**
 * @vitest-environment jsdom
 */
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useGameSearch } from "./use-game-search";
import { searchGames, type GameSearchResponse } from "@/lib/api-client";

// Mock the API client
vi.mock("@/lib/api-client", () => {
  class ApiRequestError extends Error {
    code: string;
    status: number;
    constructor(code: string, status: number, message: string) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }

  return {
    searchGames: vi.fn(),
    ApiRequestError,
  };
});

const mockSearchGames = vi.mocked(searchGames);

describe("useGameSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSearchGames.mockClear();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("should discard the response of search A if it arrives during the debounce of search B", async () => {
    const { result, unmount } = renderHook(() => useGameSearch());

    // Setup promises to manually control the resolution of search A
    let resolveSearchA: (value: GameSearchResponse) => void;
    const promiseA = new Promise<GameSearchResponse>((resolve) => {
      resolveSearchA = resolve;
    });

    // 1. User types "zel" (Search A)
    mockSearchGames.mockImplementationOnce(() => promiseA);
    act(() => {
      result.current.search("zel");
    });

    // Advance timers by 300ms to trigger the API call for A
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(mockSearchGames).toHaveBeenCalledWith("zel", 10, expect.any(AbortSignal));
    expect(mockSearchGames).toHaveBeenCalledTimes(1);

    // 2. User types "zelda" (Search B) before A resolves
    // This should immediately invalidate A
    act(() => {
      result.current.search("zelda");
    });

    // 3. Response for A arrives during the debounce of B
    await act(async () => {
      resolveSearchA!({
        query: "zel",
        limit: 10,
        results: [
          {
            igdb_id: 1,
            name: "Zelda A",
            slug: "zelda-a",
            summary: null,
            first_release_date: null,
            cover_url: null,
            platforms: [],
            genres: [],
          },
        ],
      });
      // Wait for the microtask queue
      await Promise.resolve();
    });

    // State should still be loading for "zelda", NOT success with "Zelda A"
    expect(result.current.status).toBe("loading");
    expect(result.current.query).toBe("zelda");
    expect(result.current.results).toEqual([]);

    // Optional: Let B resolve to verify it works normally
    let resolveSearchB: (value: GameSearchResponse) => void;
    const promiseB = new Promise<GameSearchResponse>((resolve) => {
      resolveSearchB = resolve;
    });
    mockSearchGames.mockImplementationOnce(() => promiseB);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(mockSearchGames).toHaveBeenCalledWith("zelda", 10, expect.any(AbortSignal));
    expect(mockSearchGames).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveSearchB!({
        query: "zelda",
        limit: 10,
        results: [
          {
            igdb_id: 2,
            name: "Zelda B",
            slug: "zelda-b",
            summary: null,
            first_release_date: null,
            cover_url: null,
            platforms: [],
            genres: [],
          },
        ],
      });
      await Promise.resolve();
    });

    expect(result.current.status).toBe("success");
    expect(result.current.results).toEqual([
      {
        igdb_id: 2,
        name: "Zelda B",
        slug: "zelda-b",
        summary: null,
        first_release_date: null,
        cover_url: null,
        platforms: [],
        genres: [],
      },
    ]);
    
    unmount();
  });

  it("should cancel the pending timer on unmount", () => {
    const { result, unmount } = renderHook(() => useGameSearch());

    act(() => {
      result.current.search("zelda");
    });

    // Unmount before the debounce timer fires
    unmount();

    // Advance timers
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // The API should never have been called because the component unmounted
    expect(mockSearchGames).not.toHaveBeenCalled();
  });

  it("should abort an in-flight request on unmount", () => {
    let signal: AbortSignal | undefined;
    mockSearchGames.mockImplementation((_query, _limit, requestSignal) => {
      signal = requestSignal;
      return new Promise<GameSearchResponse>(() => undefined);
    });
    const { result, unmount } = renderHook(() => useGameSearch());

    act(() => {
      result.current.search("zelda");
      vi.advanceTimersByTime(300);
    });

    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});
