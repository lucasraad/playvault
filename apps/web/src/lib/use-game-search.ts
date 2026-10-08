"use client";

/**
 * useGameSearch — debounced game search hook with race-condition protection.
 *
 * Debounces keystrokes (300 ms) and discards stale responses by tracking
 * a monotonically increasing request ID. Each new search increments the
 * counter; when a response arrives, it's only applied if its ID matches
 * the latest request.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  ApiRequestError,
  type GameSearchResponse,
  type GameSearchResult,
  searchGames,
} from "@/lib/api-client";

/* ---------- Error classification ---------- */

export type SearchErrorKind =
  | "invalid_search"
  | "visitor_rate_limited"
  | "global_rate_limited"
  | "upstream_rate_limited"
  | "protection_unavailable"
  | "catalog_unavailable"
  | "bad_gateway"
  | "unknown";

export interface SearchError {
  kind: SearchErrorKind;
  message: string;
  /** Seconds to wait before retrying, when the server provides guidance. */
  retryAfter?: number;
}

function classifyError(error: unknown): SearchError {
  if (error instanceof ApiRequestError) {
    switch (error.code) {
      case "invalid_search":
        return {
          kind: "invalid_search",
          message: error.detail || "Invalid search query. Use 2–80 characters without special symbols.",
        };
      case "catalog_visitor_rate_limited":
        return {
          kind: "visitor_rate_limited",
          message: error.retryAfter
            ? `You're searching too fast. Please wait ${Math.ceil(error.retryAfter)} seconds.`
            : "You're searching too fast. Please wait a moment.",
          retryAfter: error.retryAfter,
        };
      case "catalog_global_rate_limited":
        return {
          kind: "global_rate_limited",
          message: error.retryAfter
            ? `Search is temporarily busy. Try again in ${Math.ceil(error.retryAfter)} seconds.`
            : "Search is temporarily busy. Please try again shortly.",
          retryAfter: error.retryAfter,
        };
      case "catalog_upstream_rate_limited":
        return {
          kind: "upstream_rate_limited",
          message: error.retryAfter
            ? `Game catalog rate limit reached. Try again in ${Math.ceil(error.retryAfter)} seconds.`
            : "Game catalog rate limit reached. Please wait a moment.",
          retryAfter: error.retryAfter,
        };
      case "catalog_protection_unavailable":
        return {
          kind: "protection_unavailable",
          message: "Game search is temporarily unavailable. Please try again later.",
        };
      case "catalog_unavailable":
        return {
          kind: "catalog_unavailable",
          message: "The game catalog is temporarily unavailable. Please try again later.",
        };
      case "invalid_catalog_response":
      case "catalog_upstream_error":
        return {
          kind: "bad_gateway",
          message: "Received an invalid response from the game catalog. Please try again.",
        };
      default:
        break;
    }

    // Fallback by status code
    if (error.status === 429) {
      return {
        kind: "visitor_rate_limited",
        message: error.retryAfter
          ? `Too many searches. Please wait ${Math.ceil(error.retryAfter)} seconds.`
          : "Too many searches. Please wait a moment.",
        retryAfter: error.retryAfter,
      };
    }
    if (error.status === 502) {
      return {
        kind: "bad_gateway",
        message: "Received an invalid response from the game catalog. Please try again.",
      };
    }
    if (error.status === 503) {
      return {
        kind: "catalog_unavailable",
        message: "The game catalog is temporarily unavailable. Please try again later.",
      };
    }
  }

  return {
    kind: "unknown",
    message: "An unexpected error occurred. Please try again.",
  };
}

/* ---------- State ---------- */

export type SearchStatus = "idle" | "loading" | "success" | "empty" | "error";

export interface GameSearchState {
  status: SearchStatus;
  query: string;
  results: GameSearchResult[];
  error: SearchError | null;
}

const INITIAL_STATE: GameSearchState = {
  status: "idle",
  query: "",
  results: [],
  error: null,
};

const DEBOUNCE_MS = 300;

/* ---------- Hook ---------- */

export function useGameSearch() {
  const [state, setState] = useState<GameSearchState>(INITIAL_STATE);

  // Monotonic counter to prevent stale responses from overwriting fresh ones.
  const requestIdRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      controllerRef.current?.abort();
      controllerRef.current = null;
      requestIdRef.current += 1;
    };
  }, []);

  const search = useCallback((rawQuery: string) => {
    const query = rawQuery.trim();
    setState((prev) => ({ ...prev, query: rawQuery }));

    // Cancel any pending debounce timer
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // Stop an already-started request when the query changes.
    controllerRef.current?.abort();
    controllerRef.current = null;

    // Invalidate any in-flight request immediately
    requestIdRef.current += 1;
    const thisRequestId = requestIdRef.current;

    // If query is too short, reset to idle
    if (query.length < 2) {
      setState({ status: "idle", query: rawQuery, results: [], error: null });
      return;
    }

    // Show loading immediately for responsiveness
    setState((prev) => ({ ...prev, status: "loading", error: null }));

    // Debounce the actual API call
    timerRef.current = setTimeout(async () => {
      timerRef.current = null;
      const controller = new AbortController();
      controllerRef.current = controller;
      try {
        const response: GameSearchResponse = await searchGames(query, 10, controller.signal);

        // Only update state if this is still the latest request
        if (thisRequestId !== requestIdRef.current) return;

        if (response.results.length === 0) {
          setState({
            status: "empty",
            query: rawQuery,
            results: [],
            error: null,
          });
        } else {
          setState({
            status: "success",
            query: rawQuery,
            results: response.results,
            error: null,
          });
        }
      } catch (err) {
        // Only update state if this is still the latest request
        if (thisRequestId !== requestIdRef.current) return;

        const searchError = classifyError(err);
        setState({
          status: "error",
          query: rawQuery,
          results: [],
          error: searchError,
        });
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }
      }
    }, DEBOUNCE_MS);
  }, []);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    controllerRef.current?.abort();
    controllerRef.current = null;
    requestIdRef.current += 1;
    setState(INITIAL_STATE);
  }, []);

  return { ...state, search, clear };
}
