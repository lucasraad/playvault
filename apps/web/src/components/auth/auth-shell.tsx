"use client";

/**
 * AuthShell — main orchestrator component.
 *
 * Renders:
 * - Full-screen loading spinner during session check
 * - Login/Signup forms when unauthenticated
 * - UserDashboard when authenticated
 */

import { useState } from "react";

import { useAuth } from "@/context/auth-context";
import { LoginForm } from "@/components/auth/login-form";
import { SignupForm } from "@/components/auth/signup-form";
import { UserDashboard } from "@/components/auth/user-dashboard";

type AuthView = "login" | "signup";

export function AuthShell() {
  const { user, loading } = useAuth();
  const [view, setView] = useState<AuthView>("login");

  // Initial session check
  if (loading) {
    return (
      <div className="auth-loading" role="status" id="auth-loading">
        <div className="auth-loading__spinner" aria-hidden="true" />
        <p className="auth-loading__text">Loading your profile…</p>
      </div>
    );
  }

  // Authenticated
  if (user) {
    return <UserDashboard />;
  }

  // Unauthenticated
  return (
    <div className="auth-page" id="auth-page">
      <div className="auth-page__background" aria-hidden="true">
        <div className="auth-page__orb auth-page__orb--1" />
        <div className="auth-page__orb auth-page__orb--2" />
        <div className="auth-page__orb auth-page__orb--3" />
      </div>

      <div className="auth-page__container">
        <div className="auth-page__brand">
          <svg
            width="36"
            height="36"
            viewBox="0 0 28 28"
            fill="none"
            className="auth-page__logo"
            aria-hidden="true"
          >
            <rect width="28" height="28" rx="6" fill="url(#auth-logo-grad)" />
            <path
              d="M8 18V10a4 4 0 014-4h4a4 4 0 014 4v4a4 4 0 01-4 4h-2l-3 4v-4H8z"
              fill="white"
              fillOpacity="0.9"
            />
            <circle cx="12" cy="13" r="1.5" fill="url(#auth-logo-grad)" />
            <circle cx="17" cy="13" r="1.5" fill="url(#auth-logo-grad)" />
            <defs>
              <linearGradient id="auth-logo-grad" x1="0" y1="0" x2="28" y2="28">
                <stop stopColor="#7c5cff" />
                <stop offset="1" stopColor="#22d3ee" />
              </linearGradient>
            </defs>
          </svg>
          <span className="auth-page__brand-name">Gamer Profile</span>
        </div>

        <div className="auth-page__card">
          {view === "login" ? (
            <LoginForm onSwitchToSignup={() => setView("signup")} />
          ) : (
            <SignupForm onSwitchToLogin={() => setView("login")} />
          )}
        </div>
      </div>
    </div>
  );
}
