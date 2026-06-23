import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { ThemeSwitcher } from "./theme.jsx";

function getPasswordErrors(password) {
  const errors = [];

  if (password.length < 8) errors.push("at least 8 characters");
  if (!/[a-z]/.test(password)) errors.push("one lowercase letter");
  if (!/[A-Z]/.test(password)) errors.push("one uppercase letter");
  if (!/[0-9]/.test(password)) errors.push("one number");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("one symbol");

  return errors;
}

export default function Auth({
  recoveryMode = false,
  initialMode = "sign-in",
  onRecoveryComplete,
  theme,
  onThemeChange,
  onContinueAsGuest,
}) {
  const [mode, setMode] = useState(recoveryMode ? "update-password" : initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (recoveryMode) {
      setMode("update-password");
      setError("");
      setMessage("Enter a new password for your account.");
      return;
    }

    setMode(initialMode);
    setError("");
    setMessage("");
  }, [initialMode, recoveryMode]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (mode === "reset-password") {
      await handlePasswordResetRequest();
      return;
    }

    if (mode === "update-password") {
      await handlePasswordUpdate();
      return;
    }

    if (!email.trim() || !password.trim()) {
      setError("Add your email and password first.");
      return;
    }

    if (mode === "sign-up") {
      const passwordErrors = getPasswordErrors(password);

      if (passwordErrors.length > 0) {
        setError(`Password must include: ${passwordErrors.join(", ")}.`);
        return;
      }
    }

    setBusy(true);

    try {
      const authCall =
        mode === "sign-up"
          ? supabase.auth.signUp({
              email: email.trim(),
              password,
              options: {
                emailRedirectTo: `${window.location.origin}/`,
              },
            })
          : supabase.auth.signInWithPassword({ email: email.trim(), password });

      const { error: authError } = await authCall;

      if (authError) throw authError;

      if (mode === "sign-up") {
        setMessage(
          "Check your email for the next step. If this address is already registered, try signing in or resetting your password."
        );
      } else {
        setMessage("You're in.");
      }
    } catch (err) {
      const message = err.message || "";

      if (
        mode === "sign-up" &&
        (message.toLowerCase().includes("already") ||
          message.toLowerCase().includes("registered") ||
          message.toLowerCase().includes("user"))
      ) {
        setError("This email may already have an account. Try signing in or resetting your password.");
      } else {
        setError(message || "Something went wrong. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordResetRequest() {
    if (!email.trim()) {
      setError("Add your email first.");
      return;
    }

    setBusy(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/`,
      });

      if (resetError) throw resetError;

      setMessage("If this email exists, a password reset link has been sent.");
    } catch (err) {
      setError(err.message || "Something went wrong while sending the reset link.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordUpdate() {
    if (!password.trim()) {
      setError("Add your new password first.");
      return;
    }

    const passwordErrors = getPasswordErrors(password);

    if (passwordErrors.length > 0) {
      setError(`Password must include: ${passwordErrors.join(", ")}.`);
      return;
    }

    setBusy(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) throw updateError;

      setMessage("Password updated. Opening your planner...");

      setTimeout(() => {
        onRecoveryComplete?.();
      }, 800);
    } catch (err) {
      setError(err.message || "Something went wrong while updating your password.");
    } finally {
      setBusy(false);
    }
  }

  function getTitle() {
    if (mode === "reset-password") return "Reset your password";
    if (mode === "update-password") return "Choose a new password";
    return "The One Thing";
  }

  function getSubtitle() {
    if (mode === "reset-password") {
      return "Enter your email and we'll send you a link to reset your password.";
    }

    if (mode === "update-password") {
      return "Make it a little stronger this time.";
    }

    return "An anti-chaos planner for noisy minds.";
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <span className="logo-mark" aria-hidden="true" />

        <h1>{getTitle()}</h1>

        <p className="auth-subtitle">{getSubtitle()}</p>

        {theme && onThemeChange && <ThemeSwitcher theme={theme} onChange={onThemeChange} />}

        <form onSubmit={handleSubmit} className="auth-form">
          {mode !== "update-password" && (
            <label>
              Email
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
              />
            </label>
          )}

          {mode !== "reset-password" && (
            <label>
              Password
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete={mode === "sign-up" || mode === "update-password" ? "new-password" : "current-password"}
                placeholder={mode === "sign-in" ? "your password" : "8+ chars, Aa, 1, symbol"}
              />

              {(mode === "sign-up" || mode === "update-password") && (
                <small style={{ color: "#6F7A65", fontSize: 12 }}>
                  Use at least 8 characters with uppercase, lowercase, number, and symbol.
                </small>
              )}
            </label>
          )}

          {error && <p className="auth-error">{error}</p>}
          {message && <p className="auth-message">{message}</p>}

          <button type="submit" disabled={busy}>
            {busy
              ? "one sec..."
              : mode === "sign-up"
                ? "Create account"
                : mode === "reset-password"
                  ? "Send reset link"
                  : mode === "update-password"
                    ? "Update password"
                    : "Sign in"}
          </button>
        </form>

        {mode === "sign-in" && (
          <button
            className="mode-switch"
            type="button"
            onClick={() => {
              setMode("reset-password");
              setError("");
              setMessage("");
              setPassword("");
            }}
          >
            Forgot password?
          </button>
        )}

        {mode !== "update-password" && (
          <button
            className="mode-switch"
            type="button"
            onClick={() => {
              setMode(mode === "sign-in" ? "sign-up" : "sign-in");
              setError("");
              setMessage("");
              setPassword("");
            }}
          >
            {mode === "sign-in" ? "Need an account? Create one" : "Already have an account? Sign in"}
          </button>
        )}

        {!recoveryMode && (
          <button className="mode-switch guest-switch" type="button" onClick={onContinueAsGuest}>
            Continue without account
          </button>
        )}
      </section>
    </main>
  );
}
