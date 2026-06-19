import { useState } from "react";
import { Sparkles } from "lucide-react";
import { supabase } from "./supabaseClient";

export default function Auth() {
  const [mode, setMode] = useState("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!email.trim() || !password.trim()) {
      setError("Add your email and password first.");
      return;
    }

    if (password.length < 6) {
      setError("Password should have at least 6 characters.");
      return;
    }

    setBusy(true);

    try {
      const authCall =
        mode === "sign-up"
          ? supabase.auth.signUp({ email: email.trim(), password })
          : supabase.auth.signInWithPassword({ email: email.trim(), password });

      const { data, error: authError } = await authCall;

      if (authError) throw authError;

      if (mode === "sign-up" && !data.session) {
        setMessage("Account created. Check your email to confirm it, then sign in.");
      } else {
        setMessage("You're in.");
      }
    } catch (err) {
      setError(err.message || "Something went wrong while signing in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <span className="logo-mark">
          <Sparkles size={18} color="#FFE066" />
        </span>
        <h1>Overflow & Focus</h1>
        <p className="auth-subtitle">
          A soft place to catch noisy thoughts, choose one thing, and let the rest wait.
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
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

          <label>
            Password
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
              placeholder="at least 6 characters"
            />
          </label>

          {error && <p className="auth-error">{error}</p>}
          {message && <p className="auth-message">{message}</p>}

          <button type="submit" disabled={busy}>
            {busy ? "one sec…" : mode === "sign-up" ? "Create account" : "Sign in"}
          </button>
        </form>

        <button
          className="mode-switch"
          type="button"
          onClick={() => {
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
            setError("");
            setMessage("");
          }}
        >
          {mode === "sign-in" ? "Need an account? Create one" : "Already have an account? Sign in"}
        </button>
      </section>
    </main>
  );
}
