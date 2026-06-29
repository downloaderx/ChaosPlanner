import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, LogIn, Music2, Play, SkipBack, Sparkles, UserPlus } from "lucide-react";
import { supabase } from "./supabaseClient";
import { IntroThemePicker, THEMES } from "./theme.jsx";

const GALLERY_SLIDE_COUNT = 6;
const GALLERY_AUTOPLAY_MS = 8000;
const GALLERY_SLIDE_TITLES = [
  "See the planner",
  "How the pieces work",
  "Try without an account",
  "Focus player",
  "Themes for every brain",
  "Save progress later",
];

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
  const [formActive, setFormActive] = useState(false);
  const [gallerySlide, setGallerySlide] = useState(0);

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

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      return undefined;
    }

    const galleryTimer = window.setTimeout(() => {
      setGallerySlide((slide) => (slide + 1) % GALLERY_SLIDE_COUNT);
    }, GALLERY_AUTOPLAY_MS);

    return () => {
      window.clearTimeout(galleryTimer);
    };
  }, [gallerySlide]);

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

  function getSubmitIcon() {
    if (mode === "sign-up") return <UserPlus size={15} aria-hidden="true" />;
    return <LogIn size={15} aria-hidden="true" />;
  }

  function activateForm() {
    setFormActive(true);
  }

  function deactivateForm() {
    window.setTimeout(() => {
      if (!document.activeElement?.closest?.(".auth-form")) {
        setFormActive(false);
      }
    }, 80);
  }

  function showPreviousGallerySlide() {
    setGallerySlide((slide) => (slide === 0 ? GALLERY_SLIDE_COUNT - 1 : slide - 1));
  }

  function showNextGallerySlide() {
    setGallerySlide((slide) => (slide + 1) % GALLERY_SLIDE_COUNT);
  }

  return (
    <main className={formActive ? "auth-shell form-active" : "auth-shell"}>
      <div className="auth-creature-path" aria-hidden="true">
        <div className="auth-creature-runner">
          <span className="auth-creature-shadow" />
          <span className="auth-creature-sprite" />
        </div>
      </div>

      <section className="auth-premenu">
        <div className="auth-story-panel">
          <div className="auth-brand-row">
            <span className="logo-mark" aria-hidden="true" />
            {theme && onThemeChange && <IntroThemePicker theme={theme} onChange={onThemeChange} />}
          </div>

          <div className="auth-story-copy">
            <h1>The One Thing</h1>
            <p>
              You start one task, remember seven others, then lose the thread. Drop every thought, choose one for now,
              and let the rest wait without vanishing.
            </p>
          </div>

          <div className="auth-product-gallery" aria-label="Product preview gallery">
            <div className="auth-gallery-topline">
              <span>{GALLERY_SLIDE_TITLES[gallerySlide]}</span>
            </div>

            <div className="auth-gallery-frame">
              <div className="auth-gallery-controls">
                <button type="button" onClick={showPreviousGallerySlide} aria-label="Show previous preview">
                  <ChevronLeft size={18} aria-hidden="true" />
                </button>
                <button type="button" onClick={showNextGallerySlide} aria-label="Show next preview">
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              </div>

              {gallerySlide === 0 && (
                <div className="auth-gallery-shot">
                  <img
                    src="/auth-gallery-screenshot.png"
                    alt="The One Thing planner with live thoughts, focus, later, and done panels"
                  />
                </div>
              )}

              {gallerySlide === 1 && (
                <div className="auth-layout-map" aria-label="The One Thing layout map">
                  <div className="auth-map-panel auth-map-live">
                    <span>Live</span>
                    <strong>fresh thoughts</strong>
                    <small>new tasks land here first</small>
                  </div>

                  <div className="auth-map-center">
                    <div className="auth-map-panel auth-map-focus">
                      <span>The One Thing</span>
                      <strong>one task now</strong>
                      <small>play starts focus</small>
                    </div>

                    <div className="auth-map-panel auth-map-later">
                      <span>Later</span>
                      <strong>saved for when it can wait</strong>
                    </div>
                  </div>

                  <div className="auth-map-panel auth-map-done">
                    <span>Done</span>
                    <strong>cleared today</strong>
                    <small>completed tasks and project mix</small>
                    <div className="auth-map-projects" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </div>
                  </div>

                  <div className="auth-map-callouts" aria-hidden="true">
                    <svg className="auth-map-arrows" viewBox="0 0 900 470" preserveAspectRatio="none">
                      <defs>
                        <marker
                          id="auth-map-arrowhead"
                          viewBox="0 0 10 10"
                          refX="8"
                          refY="5"
                          markerWidth="7"
                          markerHeight="7"
                          orient="auto-start-reverse"
                        >
                          <path d="M 1.5 2 L 8 5 L 1.5 8" />
                        </marker>
                      </defs>
                      <path className="auth-map-arrow-path" d="M 170 382 C 140 340, 132 282, 136 226" />
                      <path className="auth-map-arrow-path" d="M 420 232 C 450 184, 478 170, 522 154" />
                      <path className="auth-map-arrow-path" d="M 456 404 C 438 384, 428 366, 424 346" />
                      <path className="auth-map-arrow-path" d="M 728 374 C 768 328, 786 274, 784 216" />
                    </svg>
                    <span className="auth-map-callout callout-live">dump thoughts here first</span>
                    <span className="auth-map-callout callout-focus">pick one to play</span>
                    <span className="auth-map-callout callout-later">not now? save it</span>
                    <span className="auth-map-callout callout-done">finished stuff lands here</span>
                  </div>
                </div>
              )}

              {gallerySlide === 2 && (
                <div className="auth-gallery-message auth-gallery-guest">
                  <Sparkles size={19} aria-hidden="true" />
                  <strong>No account needed for trying.</strong>
                  <p>Open guest mode, drop a few thoughts, and see if the one-task flow calms the noise.</p>
                  <button type="button" onClick={onContinueAsGuest}>
                    <Play size={15} aria-hidden="true" />
                    Try in guest mode
                  </button>
                </div>
              )}

              {gallerySlide === 3 && (
                <div className="auth-gallery-message auth-gallery-player">
                  <Music2 size={19} aria-hidden="true" />
                  <strong>Music and time, in the same focus lane.</strong>
                  <p>Start a 25-minute focus block, switch tracks when your brain needs a different texture, then unlock a 5-minute break.</p>
                  <div className="auth-player-preview" aria-label="Music focus timer preview">
                    <div className="auth-player-kicker">
                      <span />
                      <strong>The One Thing</strong>
                    </div>
                    <div className="auth-player-screen">
                      <strong>one task now</strong>
                      <small>pick one thought and press play</small>
                    </div>
                    <div className="auth-player-controls" aria-hidden="true">
                      <button type="button">
                        <Play size={13} />
                      </button>
                      <button type="button" className="active">
                        <SkipBack size={13} />
                      </button>
                      <button type="button">
                        <Music2 size={13} />
                      </button>
                      <span>25</span>
                      <span>5</span>
                      <i>
                        <Music2 size={11} />
                        Volume
                      </i>
                      <b>05:00</b>
                    </div>
                    <div className="auth-player-progress" aria-hidden="true">
                      <i />
                    </div>
                  </div>
                </div>
              )}

              {gallerySlide === 4 && (
                <div className="auth-gallery-message auth-gallery-themes">
                  <Sparkles size={19} aria-hidden="true" />
                  <strong>Lots of moods, same simple system.</strong>
                  <p>Pick the surface that matches your brain today. The palette includes cozy, comic, scrapbook, pixel, ghibli, cyberpunk, plant, pink, and brutalist modes.</p>
                  <div className="auth-theme-preview" aria-hidden="true">
                    {THEMES.map((item) => {
                      const Icon = item.Icon;

                      return (
                        <span key={item.id} className={`theme-btn theme-${item.id}`}>
                          <Icon className="theme-icon" aria-hidden="true" size={14} strokeWidth={2.4} />
                          <span className="theme-label">{item.label}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {gallerySlide === 5 && (
                <div className="auth-gallery-message auth-gallery-account">
                  <UserPlus size={19} aria-hidden="true" />
                  <strong>Create an account when progress matters.</strong>
                  <p>Keep your cleared tasks, project progress, and daily rhythm available after today.</p>
                  <div className="auth-account-preview" aria-hidden="true">
                    <span>cleared tasks stay in history</span>
                    <span>project progress stays visible</span>
                    <span>sync when you switch devices</span>
                  </div>
                </div>
              )}
            </div>

            <div className="auth-gallery-dots" aria-label="Preview slides">
              {GALLERY_SLIDE_TITLES.map((title, index) => (
                <button
                  key={title}
                  type="button"
                  className={gallerySlide === index ? "active" : ""}
                  onClick={() => setGallerySlide(index)}
                  aria-label={`Show ${title.toLowerCase()} preview`}
                  aria-pressed={gallerySlide === index}
                />
              ))}
            </div>
          </div>
        </div>

        <section className="auth-card">
          <h2>{getTitle()}</h2>

          <p className="auth-subtitle">{getSubtitle()}</p>

          <form onSubmit={handleSubmit} className="auth-form">
            {mode !== "update-password" && (
              <label>
                Email
                <input
                  value={email}
                  onFocus={activateForm}
                  onBlur={deactivateForm}
                  onChange={(event) => {
                    setEmail(event.target.value);
                  }}
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
                  onFocus={activateForm}
                  onBlur={deactivateForm}
                  onChange={(event) => {
                    setPassword(event.target.value);
                  }}
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
              {!busy && getSubmitIcon()}
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
            <>
              <div className="auth-divider">
                <span>or skip the account for now</span>
              </div>

              <div className="guest-entry">
                <button className="guest-primary" type="button" onClick={onContinueAsGuest}>
                  <Play size={16} aria-hidden="true" />
                  Try in guest mode
                </button>
                <p>Guest notes stay in this browser. You can import them later only if you choose to.</p>
              </div>
            </>
          )}
        </section>
      </section>
    </main>
  );
}
