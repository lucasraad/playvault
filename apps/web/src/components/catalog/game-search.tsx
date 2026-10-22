"use client";

/**
 * GameSearch — the game catalog search component.
 *
 * Renders a search input field with debounced results, cover images with
 * fallback, platforms, genres, and release dates. Shows distinct states
 * for idle, loading, empty results, and errors.
 *
 * Accessible: keyboard-navigable, aria-live for result announcements,
 * proper labeling throughout.
 *
 * Lets authenticated users select a platform and add a result to their library.
 */

import { useCallback, useRef, useState } from "react";

import {
  ApiRequestError,
  addCatalogGameToLibrary,
  type GameSearchResult,
} from "@/lib/api-client";
import { useGameSearch } from "@/lib/use-game-search";

/* ---------- Sub-components ---------- */

function SearchIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="search__input-icon"
    >
      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="2" />
      <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CoverImage({ url, name }: { url: string | null; name: string }) {
  if (!url) {
    return (
      <div className="search-card__cover search-card__cover--fallback" aria-hidden="true">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <rect x="4" y="2" width="24" height="28" rx="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <path d="M10 22l4-5 3 3 5-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="10" r="2" fill="currentColor" />
        </svg>
      </div>
    );
  }

  return (
    <img
      className="search-card__cover"
      src={url}
      alt={`${name} cover`}
      loading="lazy"
      onError={(e) => {
        const target = e.currentTarget;
        target.style.display = "none";
        const fallback = target.nextElementSibling;
        if (fallback instanceof HTMLElement) {
          fallback.style.display = "flex";
        }
      }}
    />
  );
}

function CoverWithFallback({ url, name }: { url: string | null; name: string }) {
  return (
    <div className="search-card__cover-wrapper">
      <CoverImage url={url} name={name} />
      {url && (
        <div
          className="search-card__cover search-card__cover--fallback"
          aria-hidden="true"
          style={{ display: "none" }}
        >
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <rect x="4" y="2" width="24" height="28" rx="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <path d="M10 22l4-5 3 3 5-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="10" r="2" fill="currentColor" />
          </svg>
        </div>
      )}
    </div>
  );
}

function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

type AddState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

function libraryErrorMessage(error: unknown): { message: string } {
  if (!(error instanceof ApiRequestError)) {
    return { message: "We could not add this game. Please try again." };
  }
  if (error.status === 401 || error.code === "no_session" || error.code === "invalid_session") {
    return { message: "Your session expired. Sign in again to add games." };
  }
  if (error.status === 422 || error.code === "catalog_platform_not_found") {
    return { message: "That platform is no longer available for this game. Search again." };
  }
  if (error.status === 429) {
    const wait = error.retryAfter ? ` Try again in ${Math.ceil(error.retryAfter)} seconds.` : " Try again shortly.";
    return { message: `The library is receiving too many requests.${wait}` };
  }
  if (error.status === 503) {
    return { message: "The library is temporarily unavailable. Your session is still active; please try again." };
  }
  return { message: error.detail || "We could not add this game. Please try again." };
}

function GameCard({
  game,
  onSessionInvalid,
}: {
  game: GameSearchResult;
  onSessionInvalid?: () => void;
}) {
  const [platformId, setPlatformId] = useState("");
  const [addState, setAddState] = useState<AddState>({ status: "idle" });
  const submittingRef = useRef(false);
  const completedPlatformsRef = useRef(new Set<number>());
  const [completedPlatforms, setCompletedPlatforms] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const releaseDate = formatDate(game.first_release_date);
  const platforms = game.platforms
    .map((p) => p.abbreviation || p.name)
    .filter(Boolean);
  const genres = game.genres.map((g) => g.name);
  const isPending = addState.status === "pending";
  const selectedPlatform = Number(platformId);
  const isSelectedComplete =
    Number.isSafeInteger(selectedPlatform) &&
    completedPlatforms.has(selectedPlatform);

  const handleAdd = useCallback(async () => {
    if (submittingRef.current) return;
    const selectedPlatform = Number(platformId);
    if (!Number.isSafeInteger(selectedPlatform) || selectedPlatform <= 0) {
      setAddState({ status: "error", message: "Select a platform before adding this game." });
      return;
    }
    if (completedPlatformsRef.current.has(selectedPlatform)) return;

    submittingRef.current = true;
    setAddState({ status: "pending" });
    try {
      const entry = await addCatalogGameToLibrary(game.igdb_id, selectedPlatform);
      completedPlatformsRef.current.add(selectedPlatform);
      setCompletedPlatforms(new Set(completedPlatformsRef.current));
      setAddState({
        status: "success",
        message: entry.created
          ? `${entry.game.title} was added to your library on ${entry.platform.name}.`
          : `${entry.game.title} is already in your library on ${entry.platform.name}.`,
      });
    } catch (error) {
      if (
        error instanceof ApiRequestError &&
        (error.code === "no_session" || error.code === "invalid_session")
      ) {
        onSessionInvalid?.();
        return;
      }
      setAddState({ status: "error", ...libraryErrorMessage(error) });
    } finally {
      submittingRef.current = false;
    }
  }, [game.igdb_id, onSessionInvalid, platformId]);

  return (
    <article className="search-card" id={`game-${game.igdb_id}`}>
      <CoverWithFallback url={game.cover_url} name={game.name} />
      <div className="search-card__info">
        <h3 className="search-card__title">{game.name}</h3>
        <div className="search-card__meta">
          {releaseDate && (
            <span className="search-card__date">{releaseDate}</span>
          )}
          {platforms.length > 0 && (
            <span className="search-card__platforms">
              {platforms.join(" · ")}
            </span>
          )}
        </div>
        {genres.length > 0 && (
          <div className="search-card__genres">
            {genres.map((g) => (
              <span key={g} className="search-card__genre-tag">
                {g}
              </span>
            ))}
          </div>
        )}
        <div className="search-card__library-actions">
          <label className="search-card__platform-label" htmlFor={`platform-${game.igdb_id}`}>
            Platform
          </label>
          <div className="search-card__library-controls">
            <select
              id={`platform-${game.igdb_id}`}
              className="search-card__platform-select"
              value={platformId}
              disabled={isPending || game.platforms.length === 0}
              onChange={(event) => {
                setPlatformId(event.target.value);
                setAddState({ status: "idle" });
              }}
            >
              <option value="">Select platform</option>
              {game.platforms.map((platform) => (
                <option key={platform.igdb_id} value={platform.igdb_id}>
                  {platform.abbreviation || platform.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="search-card__add-button"
              disabled={isPending || isSelectedComplete || game.platforms.length === 0}
              onClick={handleAdd}
            >
              {isPending
                ? "Adding…"
                : isSelectedComplete
                  ? "In library"
                  : "Add to library"}
            </button>
          </div>
          {game.platforms.length === 0 && (
            <p className="search-card__feedback search-card__feedback--neutral">
              No supported platform is available for this result.
            </p>
          )}
          {(addState.status === "success" || addState.status === "error") && (
            <p
              className={`search-card__feedback search-card__feedback--${addState.status}`}
              role={addState.status === "error" ? "alert" : "status"}
            >
              {addState.message}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

function LoadingSkeleton() {
  return (
    <div className="search__skeleton-list" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="search-card search-card--skeleton">
          <div className="search-card__cover search-card__cover--skeleton" />
          <div className="search-card__info">
            <div className="search-card__skeleton-line search-card__skeleton-line--title" />
            <div className="search-card__skeleton-line search-card__skeleton-line--meta" />
            <div className="search-card__skeleton-line search-card__skeleton-line--tags" />
          </div>
        </div>
      ))}
    </div>
  );
}

function IdleState() {
  return (
    <div className="search__state search__state--idle" id="search-idle">
      <div className="search__state-icon" aria-hidden="true">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="22" cy="22" r="14" stroke="currentColor" strokeWidth="2.5" />
          <path d="M32 32L42 42" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>
      <p className="search__state-text">
        Search for games by name to explore the catalog.
      </p>
      <p className="search__state-hint">
        Type at least 2 characters to start searching.
      </p>
    </div>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="search__state search__state--empty" id="search-empty" role="status">
      <div className="search__state-icon" aria-hidden="true">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="18" stroke="currentColor" strokeWidth="2" />
          <path d="M16 30c2-3 6-5 8-5s6 2 8 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
          <circle cx="18" cy="20" r="2" fill="currentColor" />
          <circle cx="30" cy="20" r="2" fill="currentColor" />
        </svg>
      </div>
      <p className="search__state-text">
        No games found for &ldquo;{query.trim()}&rdquo;
      </p>
      <p className="search__state-hint">
        Try a different search term or check the spelling.
      </p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="search__state search__state--error" id="search-error" role="alert">
      <div className="search__state-icon search__state-icon--error" aria-hidden="true">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="18" stroke="currentColor" strokeWidth="2" />
          <path d="M24 14v14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <circle cx="24" cy="34" r="2" fill="currentColor" />
        </svg>
      </div>
      <p className="search__state-text">{message}</p>
      <button
        className="search__retry-button"
        onClick={onRetry}
        type="button"
        id="search-retry"
      >
        Try again
      </button>
    </div>
  );
}

function IgdbAttribution() {
  return (
    <div className="search__attribution" id="igdb-attribution">
      <span className="search__attribution-text">
        Game data provided by{" "}
        <a
          href="https://www.igdb.com"
          target="_blank"
          rel="noopener noreferrer"
          className="search__attribution-link"
        >
          IGDB.com
        </a>
      </span>
    </div>
  );
}

/* ---------- Main component ---------- */

export function GameSearch({ onSessionInvalid }: { onSessionInvalid?: () => void } = {}) {
  const { status, query, results, error, search, clear } = useGameSearch();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      search(e.target.value);
    },
    [search],
  );

  const handleClear = useCallback(() => {
    clear();
    inputRef.current?.focus();
  }, [clear]);

  const handleRetry = useCallback(() => {
    if (query.trim().length >= 2) {
      search(query);
    }
  }, [search, query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        handleClear();
      }
    },
    [handleClear],
  );

  const resultCount = results.length;

  return (
    <section
      className="search"
      aria-labelledby="search-heading"
      id="game-search"
    >
      <h2 className="search__heading" id="search-heading">
        Search Games
      </h2>

      <div className="search__input-wrapper">
        <SearchIcon />
        <input
          ref={inputRef}
          type="search"
          className="search__input"
          id="search-input"
          placeholder="Search for a game…"
          aria-label="Search games by name"
          aria-describedby="search-hint"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          spellCheck={false}
        />
        {query.length > 0 && (
          <button
            className="search__clear-button"
            onClick={handleClear}
            type="button"
            aria-label="Clear search"
            id="search-clear"
          >
            <ClearIcon />
          </button>
        )}
      </div>
      <p className="sr-only" id="search-hint">
        Results will update as you type. Press Escape to clear.
      </p>

      {/* Live region for screen reader announcements */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {status === "loading" && "Searching…"}
        {status === "success" &&
          `${resultCount} game${resultCount !== 1 ? "s" : ""} found.`}
        {status === "empty" && `No games found for "${query.trim()}".`}
        {status === "error" && error?.message}
      </div>

      {/* Content area */}
      <div className="search__content">
        {status === "idle" && <IdleState />}

        {status === "loading" && <LoadingSkeleton />}

        {status === "success" && (
          <>
            <p className="search__result-count" role="status" id="search-count">
              {resultCount} game{resultCount !== 1 ? "s" : ""} found
            </p>
            <div className="search__results" id="search-results">
              {results.map((game) => (
                <GameCard
                  key={game.igdb_id}
                  game={game}
                  onSessionInvalid={onSessionInvalid}
                />
              ))}
            </div>
            <IgdbAttribution />
          </>
        )}

        {status === "empty" && (
          <>
            <EmptyState query={query} />
            <IgdbAttribution />
          </>
        )}

        {status === "error" && error && (
          <ErrorState message={error.message} onRetry={handleRetry} />
        )}
      </div>
    </section>
  );
}
