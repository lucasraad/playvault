"use client";

import { useAuth } from "@/context/auth-context";

export function UserDashboard() {
  const { user, logout, loading } = useAuth();

  if (!user) return null;

  // Extract a display name from email (before @)
  const displayName = user.email.split("@")[0] ?? "Gamer";

  // Get first letter for avatar
  const avatarLetter = displayName.charAt(0).toUpperCase();

  return (
    <div className="dashboard" id="dashboard">
      <header className="dashboard__header">
        <div className="dashboard__brand">
          <svg
            width="28"
            height="28"
            viewBox="0 0 28 28"
            fill="none"
            className="dashboard__logo"
            aria-hidden="true"
          >
            <rect width="28" height="28" rx="6" fill="url(#logo-grad)" />
            <path
              d="M8 18V10a4 4 0 014-4h4a4 4 0 014 4v4a4 4 0 01-4 4h-2l-3 4v-4H8z"
              fill="white"
              fillOpacity="0.9"
            />
            <circle cx="12" cy="13" r="1.5" fill="url(#logo-grad)" />
            <circle cx="17" cy="13" r="1.5" fill="url(#logo-grad)" />
            <defs>
              <linearGradient id="logo-grad" x1="0" y1="0" x2="28" y2="28">
                <stop stopColor="#7c5cff" />
                <stop offset="1" stopColor="#22d3ee" />
              </linearGradient>
            </defs>
          </svg>
          <span className="dashboard__brand-name">Gamer Profile</span>
        </div>

        <div className="dashboard__user-area">
          <div className="dashboard__avatar" aria-hidden="true">
            {avatarLetter}
          </div>
          <button
            className="dashboard__logout"
            onClick={logout}
            disabled={loading}
            id="logout-button"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="dashboard__main">
        <section className="dashboard__welcome" aria-labelledby="welcome-title">
          <div className="dashboard__welcome-badge" aria-hidden="true">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
              <rect width="64" height="64" rx="16" fill="url(#avatar-grad)" />
              <text
                x="32"
                y="40"
                textAnchor="middle"
                fill="white"
                fontSize="28"
                fontWeight="bold"
                fontFamily="inherit"
              >
                {avatarLetter}
              </text>
              <defs>
                <linearGradient id="avatar-grad" x1="0" y1="0" x2="64" y2="64">
                  <stop stopColor="#7c5cff" />
                  <stop offset="1" stopColor="#22d3ee" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          <h1 className="dashboard__welcome-title" id="welcome-title">
            Welcome, {displayName}!
          </h1>
          <p className="dashboard__welcome-subtitle">
            Your Gamer Profile is set up and ready to go.
          </p>

          <div className="dashboard__info-cards">
            <div className="dashboard__info-card">
              <div className="dashboard__info-card-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 14a6 6 0 110-12 6 6 0 010 12z"
                    fill="currentColor"
                    fillOpacity="0.5"
                  />
                  <circle cx="10" cy="10" r="3" fill="currentColor" />
                </svg>
              </div>
              <div className="dashboard__info-card-content">
                <span className="dashboard__info-card-label">Profile ID</span>
                <span className="dashboard__info-card-value" id="user-profile-id">
                  {user.id.slice(0, 8)}…
                </span>
              </div>
            </div>

            <div className="dashboard__info-card">
              <div className="dashboard__info-card-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm2 0v2h12V5H4zm0 4v6h12V9H4z"
                    fill="currentColor"
                    fillOpacity="0.5"
                  />
                </svg>
              </div>
              <div className="dashboard__info-card-content">
                <span className="dashboard__info-card-label">Email</span>
                <span className="dashboard__info-card-value" id="user-email">
                  {user.email}
                </span>
              </div>
            </div>

            <div className="dashboard__info-card">
              <div className="dashboard__info-card-icon dashboard__info-card-icon--active" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="4" fill="currentColor" />
                </svg>
              </div>
              <div className="dashboard__info-card-content">
                <span className="dashboard__info-card-label">Session</span>
                <span className="dashboard__info-card-value dashboard__info-card-value--active">
                  Active
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="dashboard__placeholder" aria-labelledby="next-steps-title">
          <h2 className="dashboard__section-title" id="next-steps-title">
            Coming soon
          </h2>
          <p className="dashboard__section-text">
            Your gaming library, integrations, and Gamer DNA will appear here
            once they&apos;re available.
          </p>
          <div className="dashboard__coming-soon-grid">
            <div className="dashboard__coming-soon-card">
              <span className="dashboard__coming-soon-emoji" aria-hidden="true">🎮</span>
              <span>Game Library</span>
            </div>
            <div className="dashboard__coming-soon-card">
              <span className="dashboard__coming-soon-emoji" aria-hidden="true">🔗</span>
              <span>Integrations</span>
            </div>
            <div className="dashboard__coming-soon-card">
              <span className="dashboard__coming-soon-emoji" aria-hidden="true">🧬</span>
              <span>Gamer DNA</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
