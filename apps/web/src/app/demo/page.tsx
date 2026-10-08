"use client";

import { useEffect, useState } from "react";
import { GameSearch } from "@/components/catalog/game-search";

const MOCK_RESULTS = [
  {
    igdb_id: 1,
    name: "The Legend of Mock",
    slug: "legend-of-mock",
    summary: "A mock game for testing.",
    first_release_date: "2023-01-01",
    cover_url: "https://placehold.co/264x352/7c5cff/white?text=Legend+of+Mock",
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
    cover_url: "https://placehold.co/264x352/22d3ee/white?text=Mockcraft",
    platforms: [{ igdb_id: 1, name: "PC", abbreviation: "PC" }],
    genres: [{ igdb_id: 3, name: "Sandbox" }]
  },
  {
    igdb_id: 4,
    name: "Grand Theft Mock V",
    slug: "grand-theft-mock-v",
    summary: "Mock around the city.",
    first_release_date: "2013-09-17",
    cover_url: "https://placehold.co/264x352/ef4444/white?text=GTM+V",
    platforms: [{ igdb_id: 3, name: "Xbox Series X", abbreviation: "XSX" }],
    genres: [{ igdb_id: 4, name: "Action" }]
  }
];

export default function DemoPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = input instanceof Request ? input.url : input.toString();
      
      if (urlStr.includes("/api/catalog/games/search")) {
        const urlObj = new URL(urlStr, window.location.origin);
        const query = urlObj.searchParams.get("q") || "";
        
        // Fake network delay
        await new Promise((resolve) => setTimeout(resolve, 800));

        // Test error
        if (query.toLowerCase() === "error") {
          return new Response(JSON.stringify({ detail: "Simulated error for demo purposes. Try another term." }), { 
            status: 500, 
            statusText: "Internal Server Error",
            headers: { "Content-Type": "application/json" }
          });
        }
        
        // Test empty
        if (query.toLowerCase() === "vazia" || query.toLowerCase() === "empty") {
          return new Response(JSON.stringify({ query, limit: 10, results: [] }), { 
            status: 200, 
            headers: { "Content-Type": "application/json" } 
          });
        }

        // Return mock data filtered by query (or all if query is generic)
        const filtered = MOCK_RESULTS.filter(r => r.name.toLowerCase().includes(query.toLowerCase()));
        
        return new Response(JSON.stringify({
          query,
          limit: 10,
          results: filtered.length > 0 ? filtered : MOCK_RESULTS
        }), { 
          status: 200, 
          headers: { "Content-Type": "application/json" } 
        });
      }

      return originalFetch(input, init);
    };

    const t = setTimeout(() => setMounted(true), 0);

    return () => {
      window.fetch = originalFetch;
      clearTimeout(t);
    };
  }, []);

  if (!mounted) return null;

  return (
    <div className="dashboard" id="demo-dashboard">
      <header className="dashboard__header">
        <div className="dashboard__brand">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="dashboard__logo" aria-hidden="true">
            <rect width="28" height="28" rx="6" fill="#7c5cff" />
            <path d="M8 18V10a4 4 0 014-4h4a4 4 0 014 4v4a4 4 0 01-4 4h-2l-3 4v-4H8z" fill="white" fillOpacity="0.9" />
          </svg>
          <span className="dashboard__brand-name">Gamer Profile (Demo)</span>
        </div>
        <nav className="dashboard__nav" aria-label="Main navigation">
          <button className="dashboard__nav-tab dashboard__nav-tab--active" aria-current="page" id="nav-search-demo">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M12.5 12.5L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span>Search</span>
          </button>
        </nav>
        <div className="dashboard__user-area">
          <div className="dashboard__avatar" aria-hidden="true">D</div>
          <button className="dashboard__logout" disabled id="demo-user-badge">Demo User</button>
        </div>
      </header>
      <main className="dashboard__main">
        <GameSearch />
      </main>
    </div>
  );
}
