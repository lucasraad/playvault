"use client";

import { useState, type FormEvent } from "react";

import { useAuth } from "@/context/auth-context";

interface LoginFormProps {
  onSwitchToSignup: () => void;
}

export function LoginForm({ onSwitchToSignup }: LoginFormProps) {
  const { login, loading, error, clearError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!email.trim() || !password.trim()) {
      setLocalError("Please fill in all fields");
      return;
    }

    try {
      await login(email, password);
    } catch {
      // Error is handled by auth context
    }
  }

  const displayError = localError ?? error;

  return (
    <form className="auth-form" onSubmit={handleSubmit} id="login-form">
      <div className="auth-form__header">
        <p className="auth-form__eyebrow">Welcome back</p>
        <h1 className="auth-form__title" id="login-title">
          Sign in
        </h1>
        <p className="auth-form__subtitle">
          Access your Gamer Profile
        </p>
      </div>

      {displayError && (
        <div className="auth-form__error" role="alert" id="login-error">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 4.5v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="8" cy="11" r="0.75" fill="currentColor" />
          </svg>
          {displayError}
        </div>
      )}

      <div className="auth-form__field">
        <label htmlFor="login-email" className="auth-form__label">
          Email
        </label>
        <input
          id="login-email"
          type="email"
          className="auth-form__input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
          disabled={loading}
        />
      </div>

      <div className="auth-form__field">
        <label htmlFor="login-password" className="auth-form__label">
          Password
        </label>
        <input
          id="login-password"
          type="password"
          className="auth-form__input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          required
          disabled={loading}
        />
      </div>

      <button
        type="submit"
        className="auth-form__submit"
        disabled={loading}
        id="login-submit"
      >
        {loading ? (
          <span className="auth-form__spinner" aria-label="Signing in" />
        ) : (
          "Sign in"
        )}
      </button>

      <p className="auth-form__footer">
        Don&apos;t have an account?{" "}
        <button
          type="button"
          className="auth-form__link"
          onClick={onSwitchToSignup}
          id="switch-to-signup"
        >
          Create one
        </button>
      </p>
    </form>
  );
}
