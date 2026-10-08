"use client";

import { useMemo, useState } from "react";
import { UserDashboard } from "@/components/auth/user-dashboard";
import { AuthContext } from "@/context/auth-context";
import type { GameSearchResponse } from "@/lib/api-client";
import { ApiRequestError } from "@/lib/api-client";

const MOCK_RESULTS = [
  {
    igdb_id: 1,
    name: "The Legend of Mock",
    slug: "legend-of-mock",
    summary: "A mock game for testing.",
    first_release_date: "2023-01-01",
    cover_url: null,
    platforms: [{ igdb_id: 1, name: "PC", abbreviation: "PC" }],
    genres: [{ igdb_id: 1, name: "Adventure" }]
  },
  {
    igdb_id: 2,
    name: "Mock Effect",
    slug: "mock-effect",
    summary: "Space mock.",
    first_release_date: "2023-02-01",
    cover_url: null,
    platforms: [{ igdb_id: 2, name: "PlayStation 5", abbreviation: "PS5" }],
    genres: [{ igdb_id: 2, name: "RPG" }]
  },
  {
    igdb_id: 3,
    name: "Mockcraft",
    slug: "mockcraft",
    summary: "Build mock things.",
    first_release_date: "2011-11-11",
    cover_url: null,
    platforms: [{ igdb_id: 1, name: "PC", abbreviation: "PC" }],
    genres: [{ igdb_id: 3, name: "Sandbox" }]
  },
  {
    igdb_id: 4,
    name: "Grand Theft Mock V",
    slug: "grand-theft-mock-v",
    summary: "Mock around the city.",
    first_release_date: "2013-09-17",
    cover_url: null,
    platforms: [{ igdb_id: 3, name: "Xbox Series X", abbreviation: "XSX" }],
    genres: [{ igdb_id: 4, name: "Action" }]
  }
];

function delayWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new DOMException("Aborted", "AbortError"));
    }
    const timeout = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener("abort", () => {
        clearTimeout(timeout);
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    }
  });
}

export default function DemoPage() {
  const [errorCount, setErrorCount] = useState(0);

  const mockFetcher = async (query: string, limit = 10, signal?: AbortSignal): Promise<GameSearchResponse> => {
    await delayWithSignal(800, signal);

    if (query.toLowerCase() === "error") {
      // Allow testing retry recovery: alternate between error and success
      if (errorCount % 2 === 0) {
        setErrorCount((c) => c + 1);
        throw new ApiRequestError(500, "Simulated error for demo purposes. Click 'Try again' to recover.");
      } else {
        setErrorCount((c) => c + 1);
        // Recover with mock results
        return {
          query,
          limit,
          results: MOCK_RESULTS.slice(0, 1),
        };
      }
    }

    const filtered = MOCK_RESULTS.filter((r) => r.name.toLowerCase().includes(query.toLowerCase()));

    // "Uma busca sem correspondência deve retornar vazio de verdade"
    return {
      query,
      limit,
      results: filtered,
    };
  };

  const mockAuthContext = useMemo(() => ({
    user: { id: "00000000-0000-0000-0000-000000000000", email: "demo@playvault.mock" },
    loading: false,
    error: null,
    globalError: null,
    login: async () => {},
    signup: async () => ({ message: "success" }),
    logout: async () => {},
    refreshUser: async () => {},
    clearError: () => {},
  }), []);

  return (
    <AuthContext.Provider value={mockAuthContext}>
      <div className="demo-banner" style={{ background: "#f59e0b", color: "#fff", textAlign: "center", padding: "4px", fontSize: "14px", fontWeight: "bold" }}>
        Demo Mode: Using mock data (Not affiliated with IGDB)
      </div>
      <UserDashboard searchFetcher={mockFetcher} />
    </AuthContext.Provider>
  );
}
