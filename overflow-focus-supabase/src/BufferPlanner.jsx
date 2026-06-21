import { useCallback, useEffect, useRef, useState } from "react";
import {
  Plus,
  X,
  ArrowRight,
  ArrowUp,
  Check,
  Clock,
  Sparkles,
  LogOut,
  KeyRound,
  Trash2,
  UserCircle,
  ChevronDown,
  Play,
  Pause,
  RotateCcw,
  Lightbulb,
  Trophy,
  Music2,
} from "lucide-react";
import { supabase } from "./supabaseClient";
import { ThemeSwitcher } from "./theme.jsx";

const ROTATIONS = [-2, 1.5, -1, 2, -1.5, 1, -2.5, 0.5];
const ACTIVE_CAP = 6;
const ARCHIVE_LIMIT = 100;
const POMODORO_FOCUS_SECONDS = 25 * 60;
const POMODORO_BREAK_SECONDS = 5 * 60;
const DAILY_GOAL_DEFAULT = 3;

function rotationFromId(id) {
  const str = String(id || "");
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) % 997;
  }
  return ROTATIONS[hash % ROTATIONS.length];
}

function normalizeItem(row) {
  return {
    id: row.id,
    text: row.text,
    column: row.column,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    rot: rotationFromId(row.id),
  };
}

function sortNewestFirst(a, b, field = "startedAt") {
  return new Date(b[field] || 0).getTime() - new Date(a[field] || 0).getTime();
}

function isFinishedToday(item) {
  const finished = new Date(item.finishedAt);
  if (!finished.getTime()) return false;

  const today = new Date();
  return (
    finished.getFullYear() === today.getFullYear() &&
    finished.getMonth() === today.getMonth() &&
    finished.getDate() === today.getDate()
  );
}

function formatTimer(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function BufferPlanner({ user, theme, onThemeChange }) {
  const [thoughts, setThoughts] = useState([]);
  const [setAside, setSetAside] = useState([]);
  const [focus, setFocus] = useState(null);
  const [log, setLog] = useState([]);
  const [draft, setDraft] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [accountMessage, setAccountMessage] = useState("");
const [accountError, setAccountError] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [pomodoroMode, setPomodoroMode] = useState("focus");
  const [pomodoroSeconds, setPomodoroSeconds] = useState(POMODORO_FOCUS_SECONDS);
  const [pomodoroRunning, setPomodoroRunning] = useState(false);
  const [pomodoroHelpOpen, setPomodoroHelpOpen] = useState(false);
  const [pomodoroMusicEnabled, setPomodoroMusicEnabled] = useState(true);
  const [dailyGoal, setDailyGoal] = useState(() => {
    if (typeof window === "undefined") return DAILY_GOAL_DEFAULT;
    const stored = Number(localStorage.getItem(`daily-goal-${user.id}`));
    return Number.isFinite(stored) && stored > 0 ? stored : DAILY_GOAL_DEFAULT;
  });
  const [goalCelebrationDismissed, setGoalCelebrationDismissed] = useState(false);
  const inputRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioNodesRef = useRef(null);
  const accountNotice = accountError || accountMessage;
  const clearedToday = log.filter(isFinishedToday);
  const archivedLog = log.filter((item) => !isFinishedToday(item)).slice(0, ARCHIVE_LIMIT);
  const dailyGoalProgress = Math.min(clearedToday.length, dailyGoal);
  const dailyGoalComplete = clearedToday.length >= dailyGoal;
  const dailyGoalPercent = Math.round((dailyGoalProgress / dailyGoal) * 100);

  const runMutation = useCallback(
    async (action) => {
      setBusy(true);
      setError(null);
      try {
        await action();
      } catch (err) {
        setError(err.message || "Saving failed — try again.");
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const loadItems = useCallback(
    async ({ enforceCap = true } = {}) => {
      setError(null);

      const { data, error: loadError } = await supabase
        .from("items")
        .select("id,user_id,column,text,started_at,finished_at")
        .eq("user_id", user.id)
        .order("started_at", { ascending: false });

      if (loadError) throw loadError;

      const normalized = (data || []).map(normalizeItem);
      const nextThoughts = normalized.filter((item) => item.column === "thoughts").sort(sortNewestFirst);

      if (enforceCap && nextThoughts.length > ACTIVE_CAP) {
        const overflow = nextThoughts.slice(ACTIVE_CAP);
        const overflowIds = overflow.map((item) => item.id);

        const { error: overflowError } = await supabase
          .from("items")
          .update({ column: "setaside" })
          .in("id", overflowIds)
          .eq("user_id", user.id);

        if (overflowError) throw overflowError;
        return loadItems({ enforceCap: false });
      }

      const nextSetAside = normalized.filter((item) => item.column === "setaside").sort(sortNewestFirst);
      const focusItems = normalized.filter((item) => item.column === "focus").sort(sortNewestFirst);
      const nextLog = normalized
        .filter((item) => item.column === "log")
        .sort((a, b) => sortNewestFirst(a, b, "finishedAt"));

      setThoughts(nextThoughts);
      setSetAside(nextSetAside);
      setFocus(focusItems[0] || null);
      setLog(nextLog);
      setLoaded(true);
    },
    [user.id]
  );

  useEffect(() => {
    loadItems().catch((err) => {
      setError(err.message || "Couldn't load your saved data.");
      setLoaded(true);
    });
  }, [loadItems]);

  useEffect(() => {
    if (!pomodoroRunning) return undefined;

    const timerId = window.setInterval(() => {
      setPomodoroSeconds((seconds) => Math.max(seconds - 1, 0));
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [pomodoroRunning]);

  useEffect(() => {
    if (!pomodoroRunning || pomodoroSeconds !== 0) return;

    setPomodoroRunning(false);
    setPomodoroMode((mode) => {
      const nextMode = mode === "focus" ? "break" : "focus";
      setPomodoroSeconds(nextMode === "focus" ? POMODORO_FOCUS_SECONDS : POMODORO_BREAK_SECONDS);
      return nextMode;
    });
  }, [pomodoroRunning, pomodoroSeconds]);

  useEffect(() => {
    if (!focus) {
      setPomodoroRunning(false);
      stopPomodoroMusic();
    }
  }, [focus]);

  useEffect(() => {
    if (!pomodoroRunning || pomodoroMusicEnabled) return;
    stopPomodoroMusic();
  }, [pomodoroMusicEnabled, pomodoroRunning]);

  useEffect(() => {
    if (!pomodoroRunning) stopPomodoroMusic();
  }, [pomodoroRunning]);

  useEffect(() => () => stopPomodoroMusic(), []);

  useEffect(() => {
    try {
      localStorage.setItem(`daily-goal-${user.id}`, String(dailyGoal));
    } catch (err) {
      // localStorage unavailable, goal just won't persist for this session
    }
  }, [dailyGoal, user.id]);

  useEffect(() => {
    if (!dailyGoalComplete) setGoalCelebrationDismissed(false);
  }, [dailyGoalComplete]);

  function updateDailyGoal(event) {
    const nextGoal = Number(event.target.value);
    if (!Number.isFinite(nextGoal)) return;
    setDailyGoal(Math.max(1, Math.min(20, nextGoal)));
  }

  function setPomodoroPreset(mode) {
    setPomodoroMode(mode);
    setPomodoroRunning(false);
    setPomodoroSeconds(mode === "focus" ? POMODORO_FOCUS_SECONDS : POMODORO_BREAK_SECONDS);
  }

  function resetPomodoro() {
    setPomodoroRunning(false);
    stopPomodoroMusic();
    setPomodoroSeconds(pomodoroMode === "focus" ? POMODORO_FOCUS_SECONDS : POMODORO_BREAK_SECONDS);
  }

  function stopPomodoroMusic() {
    if (!audioNodesRef.current) return;

    const { oscillators, gain } = audioNodesRef.current;
    const now = audioContextRef.current?.currentTime || 0;

    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.linearRampToValueAtTime(0, now + 0.25);
      oscillators.forEach((oscillator) => oscillator.stop(now + 0.3));
    } catch (err) {
      // Audio nodes may already be stopped; nothing useful to recover here.
    }

    audioNodesRef.current = null;
  }

  async function startPomodoroMusic() {
    if (!pomodoroMusicEnabled || audioNodesRef.current || typeof window === "undefined") return;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    const context = audioContextRef.current || new AudioContext();
    audioContextRef.current = context;
    await context.resume();

    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    const frequencies = [196, 246.94, 329.63];
    const oscillators = frequencies.map((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = index === 1 ? "triangle" : "sine";
      oscillator.frequency.value = frequency;
      oscillator.detune.value = index * 4 - 4;
      oscillator.connect(filter);
      oscillator.start();
      return oscillator;
    });

    filter.type = "lowpass";
    filter.frequency.value = 760;
    filter.Q.value = 0.7;
    gain.gain.value = 0;

    filter.connect(gain);
    gain.connect(context.destination);
    gain.gain.linearRampToValueAtTime(0.035, context.currentTime + 0.45);

    audioNodesRef.current = { oscillators, gain };
  }

  async function togglePomodoroRunning() {
    const shouldRun = !pomodoroRunning;

    if (shouldRun) {
      await startPomodoroMusic();
    } else {
      stopPomodoroMusic();
    }

    setPomodoroRunning(shouldRun);
  }

  function addThought(event) {
    event?.preventDefault?.();
    const text = draft.trim();
    if (!text) return;

    runMutation(async () => {
      const { error: insertError } = await supabase.from("items").insert({
        user_id: user.id,
        column: "thoughts",
        text,
        started_at: new Date().toISOString(),
        finished_at: null,
      });

      if (insertError) throw insertError;

      setDraft("");
      inputRef.current?.focus();
      await loadItems();
    });
  }

  function removeItem(id) {
    runMutation(async () => {
      const { error: deleteError } = await supabase.from("items").delete().eq("id", id).eq("user_id", user.id);
      if (deleteError) throw deleteError;
      await loadItems();
    });
  }

  function bringBack(item) {
    runMutation(async () => {
      const { error: updateError } = await supabase
        .from("items")
        .update({ column: "thoughts", started_at: new Date().toISOString(), finished_at: null })
        .eq("id", item.id)
        .eq("user_id", user.id);

      if (updateError) throw updateError;
      await loadItems();
    });
  }

  function promote(item) {
    runMutation(async () => {
      const now = new Date().toISOString();

      if (focus) {
        const { error: logError } = await supabase
          .from("items")
          .update({ column: "log", finished_at: now })
          .eq("id", focus.id)
          .eq("user_id", user.id);

        if (logError) throw logError;
      }

      const { error: focusError } = await supabase
        .from("items")
        .update({ column: "focus", started_at: now, finished_at: null })
        .eq("id", item.id)
        .eq("user_id", user.id);

      if (focusError) throw focusError;
      await loadItems();
    });
  }

  function finishFocus() {
    if (!focus) return;

    runMutation(async () => {
      const { error: updateError } = await supabase
        .from("items")
        .update({ column: "log", finished_at: new Date().toISOString() })
        .eq("id", focus.id)
        .eq("user_id", user.id);

      if (updateError) throw updateError;
      await loadItems();
    });
  }

  function dropFocusBackToBuffer() {
    if (!focus) return;

    runMutation(async () => {
      const { error: updateError } = await supabase
        .from("items")
        .update({ column: "thoughts", started_at: new Date().toISOString(), finished_at: null })
        .eq("id", focus.id)
        .eq("user_id", user.id);

      if (updateError) throw updateError;
      await loadItems();
    });
  }

async function sendPasswordReset() {
  setAccountMessage("");
  setAccountError("");

  if (!user.email) {
    setAccountError("No email found for this account.");
    return;
  }

  const { error: resetError } = await supabase.auth.resetPasswordForEmail(user.email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });

  if (resetError) {
    setAccountError(resetError.message || "Could not send reset link.");
    return;
  }

  setAccountMessage("Password reset link sent to your email.");
  setAccountOpen(false);
}

function requestDeleteAccount() {
  setAccountError("");
  setAccountMessage(
    "Account deletion is manual in this test version. Contact the app owner if you want your account removed."
  );
  setAccountOpen(false);
}

  async function signOut() {
    await supabase.auth.signOut();
  }

  const accountLabel = user.email || "Account";

  function timeAgo(timestamp) {
    const time = new Date(timestamp).getTime();
    if (!time) return "some time ago";

    const mins = Math.floor((Date.now() - time) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  return (
    <div className="planner-shell">
      <header className="planner-header">
        <div className="header-row">
          <div className="brand-row">
            <span className="brand-mark">
              <Sparkles size={15} color="#FFE066" />
            </span>
            <div className="header-copy">
              
  <h1>Chaos Planner</h1>
  <p>Catch every passing thought. Keep only a handful live. Work on just one at a time.</p>
  <div className="header-controls">
    <ThemeSwitcher theme={theme} onChange={onThemeChange} />
  </div>
</div>
            </div>

          <div className="header-actions">
            <div className="account-menu">
              <button
                className="theme-btn account-trigger"
                type="button"
                onClick={() => setAccountOpen((open) => !open)}
                aria-expanded={accountOpen}
                aria-haspopup="menu"
                title={accountLabel}
              >
                <UserCircle size={14} aria-hidden="true" />
                <span className="account-trigger-label">{accountLabel}</span>
                <ChevronDown size={13} aria-hidden="true" />
              </button>

              {accountOpen && (
                <div className="account-dropdown" role="menu">
                  <div className="account-dropdown-email" title={accountLabel}>
                    {accountLabel}
                  </div>

                  <button className="account-menu-item" type="button" onClick={sendPasswordReset} role="menuitem">
                    <KeyRound size={14} /> Reset password
                  </button>

                  <button className="account-menu-item danger" type="button" onClick={requestDeleteAccount} role="menuitem">
                    <Trash2 size={14} /> Delete account
                  </button>

                  <button className="account-menu-item" type="button" onClick={signOut} role="menuitem">
                    <LogOut size={14} /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
          </div>

        {error && <p className="error-text">{error}</p>}
      </header>

      {accountNotice && (
        <div className={`account-toast${accountError ? " error" : ""}`} role="status" aria-live="polite">
          <span>{accountNotice}</span>
          <button
            className="account-toast-close"
            type="button"
            onClick={() => {
              setAccountMessage("");
              setAccountError("");
            }}
            aria-label="Dismiss message"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <main className="bp-main">
        <section aria-label="Thought overflow" className="panel panel-white">
          <div className="panel-title-row">
            <h2 className="hand-title">whatever just crossed my mind</h2>
            <span className="live-count">
              {thoughts.length}/{ACTIVE_CAP} live
            </span>
          </div>

          <form onSubmit={addThought} className="add-form">
            <input
              ref={inputRef}
              className="bp-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="drop it here before it slips away..."
              disabled={busy}
            />
            <button type="submit" className="bp-icon-btn" aria-label="Add thought" disabled={busy}>
              <Plus size={18} />
            </button>
          </form>

          <div className="bp-scroll thought-list">
            {!loaded ? (
              <p className="muted">loading…</p>
            ) : thoughts.length === 0 ? (
              <p className="muted roomy">
                Nothing parked here. Good. Jot down anything that pops up — you don't have to act on it yet.
              </p>
            ) : (
              thoughts.map((item) => (
                <div key={item.id} className="bp-card sticky-note" style={{ transform: `rotate(${item.rot}deg)` }}>
                  <span>{item.text}</span>
                  <button
                    onClick={() => promote(item)}
                    className="bp-thought-btn promote-btn"
                    title="Make this the one thing"
                    aria-label={`Move ${item.text} to Right now`}
                    disabled={busy}
                  >
                    <ArrowRight size={14} />
                  </button>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="bp-thought-btn ghost-icon"
                    title="Discard"
                    aria-label={`Discard ${item.text}`}
                    disabled={busy}
                  >
                    <X size={15} />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <section aria-label="Set aside for later" className="panel panel-aside">
          <div className="panel-copy">
            <h2>set aside for later</h2>
            <p>The oldest ones quietly land here once the left column fills up — so your mind doesn't have to hold them all.</p>
          </div>

          <div className="bp-scroll aside-list">
            {setAside.length === 0 ? (
              <p className="muted roomy">Empty for now. Once you have more than {ACTIVE_CAP} live thoughts, the older ones will rest here.</p>
            ) : (
              setAside.map((item) => (
                <div key={item.id} className="bp-aside-row">
                  <span>{item.text}</span>
                  <button
                    onClick={() => promote(item)}
                    className="small-outline-btn green"
                    title="Make this the one thing"
                    aria-label={`Move ${item.text} to Right now`}
                    disabled={busy}
                  >
                    <ArrowRight size={12} />
                  </button>
                  <button
                    onClick={() => bringBack(item)}
                    className="small-outline-btn soft"
                    title="Bring back to overflow"
                    aria-label={`Bring ${item.text} back to overflow`}
                    disabled={busy}
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="ghost-icon"
                    title="Discard"
                    aria-label={`Discard ${item.text}`}
                    disabled={busy}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="bp-focus-col" aria-label="Right now">
          <div className="focus-panel">
            <div>
              <div className="focus-kicker">
                <span className={focus ? "pulse-dot active" : "pulse-dot"} />
                <h2>Right now</h2>
              </div>

              {focus ? (
                <p className="focus-title">{focus.text}</p>
              ) : (
                <p className="focus-empty">Nothing chosen yet. Pick one thought from the left — just one — and it lands here.</p>
              )}

              {focus && (
                <p className="focus-time">
                  <Clock size={12} /> on this for {timeAgo(focus.startedAt)}
                </p>
              )}

              <div className="pomodoro-widget" aria-label="Pomodoro timer">
                <div className="pomodoro-row">
                  <div className="pomodoro-player-controls">
                    <button
                      type="button"
                      className="pomodoro-control primary"
                      onClick={togglePomodoroRunning}
                      disabled={!focus}
                      aria-label={pomodoroRunning ? "Pause pomodoro" : "Start pomodoro"}
                    >
                      {pomodoroRunning ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                    <button type="button" className="pomodoro-control" onClick={resetPomodoro} aria-label="Reset pomodoro">
                      <RotateCcw size={14} />
                    </button>
                    <button
                      type="button"
                      className={pomodoroMusicEnabled ? "pomodoro-control active" : "pomodoro-control"}
                      onClick={() => setPomodoroMusicEnabled((enabled) => !enabled)}
                      aria-pressed={pomodoroMusicEnabled}
                      aria-label={pomodoroMusicEnabled ? "Turn pomodoro music off" : "Turn pomodoro music on"}
                    >
                      <Music2 size={14} />
                    </button>
                  </div>

                  <div className="pomodoro-presets" role="group" aria-label="Pomodoro mode">
                    <button
                      type="button"
                      className={pomodoroMode === "focus" ? "pomodoro-chip active" : "pomodoro-chip"}
                      onClick={() => setPomodoroPreset("focus")}
                      aria-pressed={pomodoroMode === "focus"}
                    >
                      25
                    </button>
                    <button
                      type="button"
                      className={pomodoroMode === "break" ? "pomodoro-chip active" : "pomodoro-chip"}
                      onClick={() => setPomodoroPreset("break")}
                      aria-pressed={pomodoroMode === "break"}
                    >
                      5
                    </button>
                  </div>

                  <span className="pomodoro-label">{pomodoroMode === "focus" ? "Focus" : "Break"}</span>

                  <button
                    type="button"
                    className="pomodoro-help-btn"
                    onClick={() => setPomodoroHelpOpen((open) => !open)}
                    aria-expanded={pomodoroHelpOpen}
                    aria-label="How pomodoro works"
                  >
                    <Lightbulb size={14} />
                  </button>

                  <span className="pomodoro-time">{formatTimer(pomodoroSeconds)}</span>

                  {pomodoroHelpOpen && (
                    <div className="pomodoro-help" role="note">
                      <span>Work on one thing for 25 minutes, then take a 5 minute break. Repeat when you're ready.</span>
                      <button
                        type="button"
                        className="pomodoro-help-close"
                        onClick={() => setPomodoroHelpOpen(false)}
                        aria-label="Close pomodoro help"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {focus && (
              <div className="focus-actions">
                <button onClick={finishFocus} className="done-btn" disabled={busy}>
                  <Check size={14} /> Done
                </button>
                <button onClick={dropFocusBackToBuffer} className="not-now-btn" disabled={busy}>
                  Not now
                </button>
              </div>
            )}
          </div>

          <div className="panel panel-white log-panel">
            <h3>Cleared today</h3>
            <div className="daily-goal">
              <div className="daily-goal-row">
                <label htmlFor="daily-goal-input">Daily goal</label>
                <input
                  id="daily-goal-input"
                  type="number"
                  min="1"
                  max="20"
                  value={dailyGoal}
                  onChange={updateDailyGoal}
                  aria-label="Daily cleared goal"
                />
              </div>

              <div className="daily-goal-progress" aria-label={`${dailyGoalProgress} of ${dailyGoal} cleared today`}>
                <span style={{ width: `${dailyGoalPercent}%` }} />
              </div>

              <p className="daily-goal-count">
                {dailyGoalProgress}/{dailyGoal} cleared
              </p>

              {dailyGoalComplete && !goalCelebrationDismissed && (
                <div className="daily-goal-celebration" role="status">
                  <Trophy size={16} />
                  <span>Daily goal complete</span>
                  <button
                    type="button"
                    onClick={() => setGoalCelebrationDismissed(true)}
                    aria-label="Dismiss daily goal celebration"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
            </div>

            <div className="bp-scroll log-list">
              {clearedToday.length === 0 ? (
                <p className="muted roomy">Nothing cleared today yet. This resets at the end of the day.</p>
              ) : (
                clearedToday.map((item) => (
                  <div key={item.id + item.finishedAt} className="log-item">
                    <Check size={12} color="#5C8753" />
                    <span>{item.text}</span>
                    <small>{timeAgo(item.finishedAt)}</small>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="panel panel-white log-panel archive-panel">
            <h3>Archive</h3>
            <div className="bp-scroll archive-list">
              {archivedLog.length === 0 ? (
                <p className="muted roomy">Older cleared items will collect here after today.</p>
              ) : (
                archivedLog.map((item) => (
                  <div key={item.id + item.finishedAt} className="log-item">
                    <Check size={12} color="#5C8753" />
                    <span>{item.text}</span>
                    <small>{timeAgo(item.finishedAt)}</small>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
