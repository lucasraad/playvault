"use client";

import { useState, type FormEvent } from "react";

import { useAuth } from "@/context/auth-context";

interface SignupFormProps {
  onSwitchToLogin: () => void;
}

export function SignupForm({ onSwitchToLogin }: SignupFormProps) {
  const { signup, loading, error, clearError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    clearError();
    setSuccessMessage(null);

    if (!email.trim() || !password.trim() || !confirmPassword.trim()) {
      setLocalError("Please fill in all fields");
      return;
    }

    if (password !== confirmPassword) {
      setLocalError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setLocalError("Password must be at least 6 characters");
      return;
    }

    try {
      const result = await signup(email, password);
      setSuccessMessage(result.message);
    } catch {
      // Error is handled by auth context
    }
  }

  const displayError = localError ?? error;

  if (successMessage) {
    return (
      <div className="auth-form" id="signup-success">
        <div className="auth-form__header">
          <div className="auth-form__success-icon" aria-hidden="true">
            <svg
              width="48"
              height="48"
              viewBox="0 0 48 48"
              fill="none"
            >
              <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2" />
              <path
                d="M15 25l6 6 12-14"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className="auth-form__title" id="signup-success-title">
            Check your email
          </h1>
          <p className="auth-form__subtitle auth-form__subtitle--success">
            {successMessage}
          </p>
        </div>

        <button
          type="button"
          className="auth-form__submit"
          onClick={onSwitchToLogin}
          id="go-to-login"
        >
          Go to sign in
        </button>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} id="signup-form">
      <div className="auth-form__header">
        <p className="auth-form__eyebrow">Get started</p>
        <h1 className="auth-form__title" id="signup-title">
          Create account
        </h1>
        <p className="auth-form__subtitle">
          Build your Gamer Profile
        </p>
      </div>

      {displayError && (
        <div className="auth-form__error" role="alert" id="signup-error">
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
        <label htmlFor="signup-email" className="auth-form__label">
          Email
        </label>
        <input
          id="signup-email"
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
        <label htmlFor="signup-password" className="auth-form__label">
          Password
        </label>
        <input
          id="signup-password"
          type="password"
          className="auth-form__input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 6 characters"
          autoComplete="new-password"
          minLength={6}
          required
          disabled={loading}
        />
      </div>

      <div className="auth-form__field">
        <label htmlFor="signup-confirm-password" className="auth-form__label">
          Confirm password
        </label>
        <input
          id="signup-confirm-password"
          type="password"
          className="auth-form__input"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Repeat your password"
          autoComplete="new-password"
          minLength={6}
          required
          disabled={loading}
        />
      </div>

      <button
        type="submit"
        className="auth-form__submit"
        disabled={loading}
        id="signup-submit"
      >
        {loading ? (
          <span className="auth-form__spinner" aria-label="Creating account" />
        ) : (
          "Create account"
        )}
      </button>

      <p className="auth-form__footer">
        Already have an account?{" "}
        <button
          type="button"
          className="auth-form__link"
          onClick={onSwitchToLogin}
          id="switch-to-login"
        >
          Sign in
        </button>
      </p>
    </form>
  );
}
