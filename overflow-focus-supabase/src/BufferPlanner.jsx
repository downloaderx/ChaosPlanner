import { useCallback, useEffect, useRef, useState } from "react";
import {
  Plus,
  X,
  ArrowRight,
  ArrowLeft,
  Check,
  Clock,
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
  Info,
  Hash,
  Pencil,
} from "lucide-react";
import { supabase } from "./supabaseClient";
import { ThemeSwitcher } from "./theme.jsx";

const ROTATIONS = [-2, 1.5, -1, 2, -1.5, 1, -2.5, 0.5];
const ACTIVE_CAP = 6;
const ARCHIVE_LIMIT = 100;
const PROJECT_TASK_PREVIEW_LIMIT = 5;
const POMODORO_FOCUS_SECONDS = 25 * 60;
const POMODORO_BREAK_SECONDS = 5 * 60;
const POMODORO_AUDIO_SRC = "/audio/pomodoro.mp3";
const DAILY_GOAL_DEFAULT = 3;
const DAILY_GOAL_MAX = 20;
const POMODORO_STORAGE_VERSION = 1;
const GUEST_ITEMS_STORAGE_KEY = "the-one-thing-guest-items";
const GUEST_SYNC_PROMPT_SNOOZE_KEY = "the-one-thing-guest-sync-prompt-snoozed-at";
const GUEST_SYNC_PROMPT_DELAY_MS = 2 * 60 * 1000;
const GUEST_SYNC_PROMPT_SNOOZE_MS = 24 * 60 * 60 * 1000;
const GUEST_SYNC_PROMPT_MIN_ITEMS = 3;

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
    projectTag: row.project_tag || "",
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    rot: rotationFromId(row.id),
  };
}

function createLocalItem({ column, text, projectTag = "", startedAt = new Date().toISOString(), finishedAt = null }) {
  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    user_id: "guest",
    column,
    text,
    project_tag: projectTag || null,
    started_at: startedAt,
    finished_at: finishedAt,
  };
}

function readGuestItems() {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(localStorage.getItem(GUEST_ITEMS_STORAGE_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function writeGuestItems(items) {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(GUEST_ITEMS_STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    throw new Error("Could not save guest data in this browser.");
  }
}

function guestSyncPromptSnoozed() {
  if (typeof window === "undefined") return true;

  const snoozedAt = Number(localStorage.getItem(GUEST_SYNC_PROMPT_SNOOZE_KEY));
  return Number.isFinite(snoozedAt) && Date.now() - snoozedAt < GUEST_SYNC_PROMPT_SNOOZE_MS;
}

function snoozeGuestSyncPrompt() {
  if (typeof window === "undefined") return;
  localStorage.setItem(GUEST_SYNC_PROMPT_SNOOZE_KEY, String(Date.now()));
}

function prepareGuestItemsForInsert(items, userId, includeProjectTag = true) {
  return items
    .filter((item) => item?.text && ["thoughts", "setaside", "focus", "log"].includes(item.column))
    .map((item) => {
      const row = {
        user_id: userId,
        column: item.column,
        text: item.text,
        started_at: item.started_at || new Date().toISOString(),
        finished_at: item.finished_at || null,
      };

      if (includeProjectTag) {
        row.project_tag = item.project_tag || null;
      }

      return row;
    });
}

function normalizeProjectTag(value) {
  return value.trim().replace(/^#+/, "").replace(/\s+/g, " ").slice(0, 40);
}

function isMissingProjectTagColumn(error) {
  return (
    error?.code === "42703" ||
    error?.message?.toLowerCase().includes("project_tag") ||
    error?.details?.toLowerCase().includes("project_tag")
  );
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

function getNextPomodoroMode(mode) {
  return mode === "focus" ? "break" : "focus";
}

function getPomodoroDuration(mode) {
  return mode === "focus" ? POMODORO_FOCUS_SECONDS : POMODORO_BREAK_SECONDS;
}

function getDailyGoalRank(clearedCount, goal) {
  const safeGoal = Math.max(1, goal);
  const ratio = clearedCount / safeGoal;

  if (ratio >= 3) return { label: "Diamond", className: "diamond", icon: "💎" };
  if (ratio >= 2) return { label: "Platinum", className: "platinum", icon: "🏅" };
  if (ratio >= 1) return { label: "Gold", className: "gold", icon: "🥇" };
  if (ratio >= 0.5) return { label: "Silver", className: "silver", icon: "🥈" };
  if (ratio >= 1 / 3) return { label: "Bronze", className: "bronze", icon: "🥉" };
  return null;
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getInitialPomodoroState(userId) {
  const fallback = {
    mode: "focus",
    seconds: POMODORO_FOCUS_SECONDS,
    running: false,
  };

  if (typeof window === "undefined") return fallback;

  try {
    const stored = JSON.parse(localStorage.getItem(`pomodoro-state-${userId}`));
    if (!stored || stored.version !== POMODORO_STORAGE_VERSION) return fallback;

    const mode = stored.mode === "break" ? "break" : "focus";
    const savedSeconds = Number(stored.seconds);
    const seconds = Number.isFinite(savedSeconds) ? Math.max(0, Math.min(getPomodoroDuration(mode), savedSeconds)) : fallback.seconds;

    if (!stored.running) {
      return { mode, seconds: seconds || getPomodoroDuration(mode), running: false };
    }

    const savedAt = Number(stored.savedAt);
    const elapsed = Number.isFinite(savedAt) ? Math.floor((Date.now() - savedAt) / 1000) : 0;
    const remaining = Math.max(0, seconds - Math.max(0, elapsed));

    if (remaining > 0) {
      return { mode, seconds: remaining, running: true };
    }

    const nextMode = getNextPomodoroMode(mode);
    return { mode: nextMode, seconds: getPomodoroDuration(nextMode), running: false };
  } catch (err) {
    return fallback;
  }
}

export default function BufferPlanner({ user, theme, onThemeChange, onExitGuest }) {
  const [thoughts, setThoughts] = useState([]);
  const [setAside, setSetAside] = useState([]);
  const [focus, setFocus] = useState(null);
  const [log, setLog] = useState([]);
  const [draft, setDraft] = useState("");
  const [draftProject, setDraftProject] = useState("");
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingItemValue, setEditingItemValue] = useState("");
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [editingProjectValue, setEditingProjectValue] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [projectTagAvailable, setProjectTagAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [accountMessage, setAccountMessage] = useState("");
  const [accountError, setAccountError] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [initialPomodoro] = useState(() => getInitialPomodoroState(user.id));
  const [pomodoroMode, setPomodoroMode] = useState(initialPomodoro.mode);
  const [pomodoroSeconds, setPomodoroSeconds] = useState(initialPomodoro.seconds);
  const [pomodoroRunning, setPomodoroRunning] = useState(initialPomodoro.running);
  const [pomodoroHelpOpen, setPomodoroHelpOpen] = useState(false);
  const [pomodoroMusicEnabled, setPomodoroMusicEnabled] = useState(true);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [openProjectStat, setOpenProjectStat] = useState(null);
  const [appInfoOpen, setAppInfoOpen] = useState(false);
  const [goalInfoOpen, setGoalInfoOpen] = useState(false);
  const [guestSyncPromptVisible, setGuestSyncPromptVisible] = useState(false);
  const [guestSyncPromptHandled, setGuestSyncPromptHandled] = useState(false);
  const [dailyGoal, setDailyGoal] = useState(() => {
    if (typeof window === "undefined") return DAILY_GOAL_DEFAULT;
    const stored = Number(localStorage.getItem(`daily-goal-${user.id}`));
    return Number.isFinite(stored) && stored > 0 ? stored : DAILY_GOAL_DEFAULT;
  });
  const [dailyGoalDraft, setDailyGoalDraft] = useState(() => String(dailyGoal));
  const [dailyGoalChangedOn, setDailyGoalChangedOn] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(`daily-goal-changed-on-${user.id}`) || "";
  });
  const [goalCelebrationDismissed, setGoalCelebrationDismissed] = useState(false);
  const inputRef = useRef(null);
  const pomodoroAudioRef = useRef(null);
  const audioStartTokenRef = useRef(0);
  const pomodoroRunningRef = useRef(pomodoroRunning);
  const pomodoroMusicEnabledRef = useRef(pomodoroMusicEnabled);
  const isGuest = Boolean(user.isGuest);
  const accountNotice = accountError || accountMessage;
  const clearedToday = log.filter(isFinishedToday);
  const archivedLog = log.slice(0, ARCHIVE_LIMIT);
  const dailyGoalProgress = Math.min(clearedToday.length, dailyGoal);
  const dailyGoalComplete = clearedToday.length >= dailyGoal;
  const dailyGoalPercent = Math.round((dailyGoalProgress / dailyGoal) * 100);
  const dailyGoalRank = getDailyGoalRank(clearedToday.length, dailyGoal);
  const dailyGoalLockedToday = dailyGoalChangedOn === getLocalDateKey();
  const dailyGoalDraftNumber = dailyGoalDraft.trim() ? Number(dailyGoalDraft) : Number.NaN;
  const dailyGoalDraftValue = Number.isFinite(dailyGoalDraftNumber)
    ? Math.max(1, Math.min(DAILY_GOAL_MAX, Math.round(dailyGoalDraftNumber)))
    : dailyGoal;
  const dailyGoalDraftDirty = dailyGoalDraftValue !== dailyGoal;
  const dailyGoalDraftCanSave = !dailyGoalLockedToday && dailyGoalDraftDirty;
  const breakUnlocked = pomodoroMode === "break";
  const allVisibleItems = [...thoughts, ...setAside, ...(focus ? [focus] : []), ...log];
  const projectOptions = Array.from(new Set(allVisibleItems.map((item) => item.projectTag).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
  const projectStats = Object.entries(
    log.reduce((counts, item) => {
      if (!item.projectTag) return counts;
      counts[item.projectTag] = (counts[item.projectTag] || 0) + 1;
      return counts;
    }, {})
  )
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5);
  const totalProjectTaggedItems = projectStats.reduce((sum, [, count]) => sum + count, 0);
  const maxProjectCount = projectStats[0]?.[1] || 0;

  const runMutation = useCallback(
    async (action) => {
      setBusy(true);
      setError(null);
      try {
        await action();
      } catch (err) {
        setError(err.message || "Saving failed - try again.");
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const migrateGuestItems = useCallback(async () => {
    if (isGuest || typeof window === "undefined") return;

    const guestItems = readGuestItems();
    if (guestItems.length === 0) return;

    let rows = prepareGuestItemsForInsert(guestItems, user.id);
    if (rows.length === 0) {
      localStorage.removeItem(GUEST_ITEMS_STORAGE_KEY);
      return;
    }

    let { error: migrationError } = await supabase.from("items").insert(rows);

    if (migrationError && isMissingProjectTagColumn(migrationError)) {
      rows = prepareGuestItemsForInsert(guestItems, user.id, false);
      const retry = await supabase.from("items").insert(rows);
      migrationError = retry.error;
      setProjectTagAvailable(false);
    }

    if (migrationError) throw migrationError;

    localStorage.removeItem(GUEST_ITEMS_STORAGE_KEY);
    localStorage.removeItem(GUEST_SYNC_PROMPT_SNOOZE_KEY);
    setAccountMessage("Imported notes from guest mode into this account.");
  }, [isGuest, user.id]);

  const loadItems = useCallback(
    async ({ enforceCap = true } = {}) => {
      setError(null);

      if (isGuest) {
        setProjectTagAvailable(true);

        let localRows = readGuestItems();
        const normalized = localRows.map(normalizeItem);
        const nextThoughts = normalized.filter((item) => item.column === "thoughts").sort(sortNewestFirst);

        if (enforceCap && nextThoughts.length > ACTIVE_CAP) {
          const overflowIds = new Set(nextThoughts.slice(ACTIVE_CAP).map((item) => item.id));
          localRows = localRows.map((item) =>
            overflowIds.has(item.id)
              ? { ...item, column: "setaside", started_at: new Date().toISOString(), finished_at: null }
              : item
          );
          writeGuestItems(localRows);
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
        return;
      }

      let { data, error: loadError } = await supabase
        .from("items")
        .select("id,user_id,column,text,project_tag,started_at,finished_at")
        .eq("user_id", user.id)
        .order("started_at", { ascending: false });

      if (loadError && isMissingProjectTagColumn(loadError)) {
        setProjectTagAvailable(false);

        const fallback = await supabase
          .from("items")
          .select("id,user_id,column,text,started_at,finished_at")
          .eq("user_id", user.id)
          .order("started_at", { ascending: false });

        data = fallback.data;
        loadError = fallback.error;
      } else if (!loadError) {
        setProjectTagAvailable(true);
      }

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
    [isGuest, user.id]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadPlanner() {
      try {
        if (!cancelled) await loadItems();
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Couldn't load your saved data.");
          setLoaded(true);
        }
      }
    }

    loadPlanner();

    return () => {
      cancelled = true;
    };
  }, [loadItems]);

  useEffect(() => {
    if (guestSyncPromptHandled || guestSyncPromptVisible || guestSyncPromptSnoozed()) return undefined;

    if (!isGuest) {
      if (readGuestItems().length > 0) {
        setGuestSyncPromptVisible(true);
      }
      return undefined;
    }

    function maybeShowGuestPrompt() {
      if (readGuestItems().length >= GUEST_SYNC_PROMPT_MIN_ITEMS) {
        setGuestSyncPromptVisible(true);
      }
    }

    maybeShowGuestPrompt();
    const timerId = window.setTimeout(() => {
      if (readGuestItems().length > 0 && !guestSyncPromptSnoozed()) {
        setGuestSyncPromptVisible(true);
      }
    }, GUEST_SYNC_PROMPT_DELAY_MS);

    return () => window.clearTimeout(timerId);
  }, [guestSyncPromptHandled, guestSyncPromptVisible, isGuest, thoughts.length, setAside.length, focus, log.length]);

  useEffect(() => {
    pomodoroRunningRef.current = pomodoroRunning;
  }, [pomodoroRunning]);

  useEffect(() => {
    pomodoroMusicEnabledRef.current = pomodoroMusicEnabled;
  }, [pomodoroMusicEnabled]);

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
      const nextMode = getNextPomodoroMode(mode);
      setPomodoroSeconds(getPomodoroDuration(nextMode));
      return nextMode;
    });
  }, [pomodoroRunning, pomodoroSeconds]);

  useEffect(() => {
    if (!loaded) return;

    if (!focus) {
      setPomodoroRunning(false);
      stopPomodoroMusic();
    }
  }, [focus, loaded]);

  useEffect(() => {
    if (!pomodoroRunning) return;

    if (pomodoroMusicEnabled) {
      startPomodoroMusic();
      return;
    }

    stopPomodoroMusic();
  }, [pomodoroMusicEnabled, pomodoroRunning]);

  useEffect(() => {
    if (!pomodoroRunning) stopPomodoroMusic();
  }, [pomodoroRunning]);

  useEffect(() => () => stopPomodoroMusic(), []);

  useEffect(() => {
    try {
      localStorage.setItem(
        `pomodoro-state-${user.id}`,
        JSON.stringify({
          version: POMODORO_STORAGE_VERSION,
          mode: pomodoroMode,
          seconds: pomodoroSeconds,
          running: pomodoroRunning,
          savedAt: Date.now(),
        })
      );
    } catch (err) {
      // localStorage unavailable, timer just won't persist for this session
    }
  }, [pomodoroMode, pomodoroRunning, pomodoroSeconds, user.id]);

  useEffect(() => {
    try {
      localStorage.setItem(`daily-goal-${user.id}`, String(dailyGoal));
    } catch (err) {
      // localStorage unavailable, goal just won't persist for this session
    }
  }, [dailyGoal, user.id]);

  useEffect(() => {
    setDailyGoalDraft(String(dailyGoal));
  }, [dailyGoal]);

  useEffect(() => {
    if (!dailyGoalComplete) setGoalCelebrationDismissed(false);
  }, [dailyGoalComplete]);

  useEffect(() => {
    if (!accountMessage) return undefined;

    const timerId = window.setTimeout(() => {
      setAccountMessage("");
    }, 4500);

    return () => window.clearTimeout(timerId);
  }, [accountMessage]);

  function updateDailyGoalDraft(event) {
    setDailyGoalDraft(event.target.value);
  }

  function commitDailyGoal() {
    if (dailyGoalLockedToday) {
      setDailyGoalDraft(String(dailyGoal));
      return;
    }

    const nextGoal = dailyGoalDraft.trim() ? Number(dailyGoalDraft) : Number.NaN;
    if (!Number.isFinite(nextGoal)) {
      setDailyGoalDraft(String(dailyGoal));
      return;
    }

    const normalizedGoal = Math.max(1, Math.min(DAILY_GOAL_MAX, Math.round(nextGoal)));
    setDailyGoalDraft(String(normalizedGoal));
    if (normalizedGoal === dailyGoal) return;

    const changedOn = getLocalDateKey();
    setDailyGoal(normalizedGoal);
    setDailyGoalChangedOn(changedOn);

    try {
      localStorage.setItem(`daily-goal-changed-on-${user.id}`, changedOn);
    } catch (err) {
      // localStorage unavailable, daily edit lock just won't persist for this session
    }
  }

  function handleDailyGoalKeyDown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitDailyGoal();
    }

    if (event.key === "Escape") {
      setDailyGoalDraft(String(dailyGoal));
    }
  }

  function setPomodoroPreset(mode) {
    if (mode === "break" && !breakUnlocked) return;

    setPomodoroMode(mode);
    setPomodoroRunning(false);
    setPomodoroSeconds(getPomodoroDuration(mode));
  }

  function resetPomodoro() {
    setPomodoroRunning(false);
    stopPomodoroMusic();
    setPomodoroSeconds(getPomodoroDuration(pomodoroMode));
  }

  function stopPomodoroMusic() {
    audioStartTokenRef.current += 1;

    const audio = pomodoroAudioRef.current;
    if (!audio) return;

    try {
      audio.pause();
    } catch (err) {
      // Audio may already be paused; nothing useful to recover here.
    }
  }

  async function startPomodoroMusic(forceEnabled = false) {
    if ((!forceEnabled && !pomodoroMusicEnabledRef.current) || typeof window === "undefined") return;

    const startToken = (audioStartTokenRef.current += 1);

    if (!pomodoroAudioRef.current) {
      const audio = new Audio(POMODORO_AUDIO_SRC);
      audio.loop = true;
      audio.volume = 0.55;
      audio.preload = "auto";
      pomodoroAudioRef.current = audio;
    }

    const audio = pomodoroAudioRef.current;

    if (
      startToken !== audioStartTokenRef.current ||
      !pomodoroMusicEnabledRef.current ||
      !pomodoroRunningRef.current
    ) {
      return;
    }

    try {
      await audio.play();
    } catch (err) {
      // Mobile browsers may block playback until the next direct tap.
    }

    if (startToken !== audioStartTokenRef.current) return;

    if (!pomodoroMusicEnabledRef.current || !pomodoroRunningRef.current) {
      audio.pause();
    }
  }

  async function togglePomodoroRunning() {
    const shouldRun = !pomodoroRunningRef.current;
    pomodoroRunningRef.current = shouldRun;
    setPomodoroRunning(shouldRun);

    if (shouldRun) {
      await startPomodoroMusic();
    } else {
      stopPomodoroMusic();
    }
  }

  async function togglePomodoroMusic() {
    const shouldEnable = !pomodoroMusicEnabledRef.current;
    pomodoroMusicEnabledRef.current = shouldEnable;
    setPomodoroMusicEnabled(shouldEnable);

    if (shouldEnable) {
      if (pomodoroRunningRef.current) await startPomodoroMusic(true);
      return;
    }

    stopPomodoroMusic();
  }

  function addThought(event) {
    event?.preventDefault?.();
    const text = draft.trim();
    const projectTag = normalizeProjectTag(draftProject);
    if (!text) return;

    runMutation(async () => {
      if (isGuest) {
        const items = readGuestItems();
        items.unshift(createLocalItem({ column: "thoughts", text, projectTag }));
        writeGuestItems(items);
        setDraft("");
        setDraftProject("");
        inputRef.current?.focus();
        await loadItems();
        return;
      }

      const payload = {
        user_id: user.id,
        column: "thoughts",
        text,
        started_at: new Date().toISOString(),
        finished_at: null,
      };

      if (projectTagAvailable) {
        payload.project_tag = projectTag || null;
      }

      const { error: insertError } = await supabase.from("items").insert(payload);

      if (insertError) throw insertError;

      setDraft("");
      setDraftProject("");
      inputRef.current?.focus();
      await loadItems();
    });
  }

  function startItemEdit(item) {
    setEditingItemId(item.id);
    setEditingItemValue(item.text || "");
  }

  function cancelItemEdit() {
    setEditingItemId(null);
    setEditingItemValue("");
  }

  function saveItemEdit(item) {
    const nextText = editingItemValue.trim();
    if (!nextText) return;

    runMutation(async () => {
      if (isGuest) {
        const items = readGuestItems().map((localItem) =>
          localItem.id === item.id ? { ...localItem, text: nextText } : localItem
        );
        writeGuestItems(items);
        cancelItemEdit();
        await loadItems();
        return;
      }

      const { error: updateError } = await supabase
        .from("items")
        .update({ text: nextText })
        .eq("id", item.id)
        .eq("user_id", user.id);

      if (updateError) throw updateError;
      cancelItemEdit();
      await loadItems();
    });
  }

  function startProjectEdit(item) {
    if (!projectTagAvailable) return;
    setEditingProjectId(item.id);
    setEditingProjectValue(item.projectTag || "");
  }

  function cancelProjectEdit() {
    setEditingProjectId(null);
    setEditingProjectValue("");
  }

  function saveProjectEdit(item) {
    if (!projectTagAvailable) return;

    const nextProjectTag = normalizeProjectTag(editingProjectValue);
    runMutation(async () => {
      if (isGuest) {
        const items = readGuestItems().map((localItem) =>
          localItem.id === item.id ? { ...localItem, project_tag: nextProjectTag || null } : localItem
        );
        writeGuestItems(items);
        cancelProjectEdit();
        await loadItems();
        return;
      }

      const { error: updateError } = await supabase
        .from("items")
        .update({ project_tag: nextProjectTag || null })
        .eq("id", item.id)
        .eq("user_id", user.id);

      if (updateError) throw updateError;
      cancelProjectEdit();
      await loadItems();
    });
  }

  function renderProjectTagControl(item, extraClassName = "") {
    if (editingProjectId === item.id) {
      return (
        <span className={`project-chip-editor ${extraClassName}`.trim()}>
          <Hash size={11} aria-hidden="true" />
          <input
            value={editingProjectValue}
            onChange={(event) => setEditingProjectValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") saveProjectEdit(item);
              if (event.key === "Escape") cancelProjectEdit();
            }}
            list="project-tag-options"
            placeholder="project"
            autoFocus
            disabled={busy}
          />
          <button type="button" onClick={() => saveProjectEdit(item)} disabled={busy} aria-label="Save project tag">
            <Check size={11} />
          </button>
          <button type="button" onClick={cancelProjectEdit} disabled={busy} aria-label="Cancel project tag edit">
            <X size={11} />
          </button>
        </span>
      );
    }

    if (item.projectTag) {
      return (
        <button
          type="button"
          className={`project-chip editable ${extraClassName}`.trim()}
          onClick={() => startProjectEdit(item)}
          disabled={busy || !projectTagAvailable}
          title="Edit project tag"
        >
          #{item.projectTag}
        </button>
      );
    }

    return (
      <button
        type="button"
        className={`project-chip add-project-chip ${extraClassName}`.trim()}
        onClick={() => startProjectEdit(item)}
        disabled={busy || !projectTagAvailable}
        title="Add project tag"
      >
        <Hash size={11} aria-hidden="true" /> tag
      </button>
    );
  }

  function renderEditableItemCopy(item) {
    if (editingItemId === item.id) {
      return (
        <div className="item-edit-block">
          <textarea
            value={editingItemValue}
            onChange={(event) => setEditingItemValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                saveItemEdit(item);
              }
              if (event.key === "Escape") cancelItemEdit();
            }}
            autoFocus
            disabled={busy}
            aria-label="Edit task text"
          />
          <div className="item-edit-actions">
            <button type="button" onClick={() => saveItemEdit(item)} disabled={busy || !editingItemValue.trim()}>
              <Check size={12} /> Save
            </button>
            <button type="button" onClick={cancelItemEdit} disabled={busy}>
              <X size={12} /> Cancel
            </button>
          </div>
        </div>
      );
    }

    return (
      <span className="item-text">{item.text}</span>
    );
  }

  function renderItemEditButton(item) {
    if (editingItemId === item.id) return null;

    return (
      <button
        type="button"
        className="bp-thought-btn edit-entry-btn"
        onClick={() => startItemEdit(item)}
        disabled={busy}
        title="Edit entry"
        aria-label={`Edit ${item.text}`}
      >
        <Pencil size={13} />
      </button>
    );
  }

  function removeItem(id) {
    runMutation(async () => {
      if (isGuest) {
        writeGuestItems(readGuestItems().filter((item) => item.id !== id));
        await loadItems();
        return;
      }

      const { error: deleteError } = await supabase.from("items").delete().eq("id", id).eq("user_id", user.id);
      if (deleteError) throw deleteError;
      await loadItems();
    });
  }

  function bringBack(item) {
    runMutation(async () => {
      if (isGuest) {
        const now = new Date().toISOString();
        const items = readGuestItems().map((localItem) =>
          localItem.id === item.id
            ? { ...localItem, column: "thoughts", started_at: now, finished_at: null }
            : localItem
        );
        writeGuestItems(items);
        await loadItems();
        return;
      }

      const { error: updateError } = await supabase
        .from("items")
        .update({ column: "thoughts", started_at: new Date().toISOString(), finished_at: null })
        .eq("id", item.id)
        .eq("user_id", user.id);

      if (updateError) throw updateError;
      await loadItems();
    });
  }

  function moveToSetAside(item) {
    runMutation(async () => {
      if (isGuest) {
        const now = new Date().toISOString();
        const items = readGuestItems().map((localItem) =>
          localItem.id === item.id
            ? { ...localItem, column: "setaside", started_at: now, finished_at: null }
            : localItem
        );
        writeGuestItems(items);
        await loadItems();
        return;
      }

      const { error: updateError } = await supabase
        .from("items")
        .update({ column: "setaside", started_at: new Date().toISOString(), finished_at: null })
        .eq("id", item.id)
        .eq("user_id", user.id);

      if (updateError) throw updateError;
      await loadItems();
    });
  }

  function promote(item) {
    runMutation(async () => {
      const now = new Date().toISOString();

      if (isGuest) {
        const items = readGuestItems().map((localItem) => {
          if (focus && localItem.id === focus.id) {
            return { ...localItem, column: "log", finished_at: now };
          }

          if (localItem.id === item.id) {
            return { ...localItem, column: "focus", started_at: now, finished_at: null };
          }

          return localItem;
        });
        writeGuestItems(items);
        await loadItems();
        return;
      }

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
      if (isGuest) {
        const now = new Date().toISOString();
        const items = readGuestItems().map((localItem) =>
          localItem.id === focus.id ? { ...localItem, column: "log", finished_at: now } : localItem
        );
        writeGuestItems(items);
        await loadItems();
        return;
      }

      const { error: updateError } = await supabase
        .from("items")
        .update({ column: "log", finished_at: new Date().toISOString() })
        .eq("id", focus.id)
        .eq("user_id", user.id);

      if (updateError) throw updateError;
      await loadItems();
    });
  }

  function moveFocusToSetAside() {
    if (!focus) return;

    runMutation(async () => {
      if (isGuest) {
        const now = new Date().toISOString();
        const items = readGuestItems().map((localItem) =>
          localItem.id === focus.id
            ? { ...localItem, column: "setaside", started_at: now, finished_at: null }
            : localItem
        );
        writeGuestItems(items);
        await loadItems();
        return;
      }

      const { error: updateError } = await supabase
        .from("items")
        .update({ column: "setaside", started_at: new Date().toISOString(), finished_at: null })
        .eq("id", focus.id)
        .eq("user_id", user.id);

      if (updateError) throw updateError;
      await loadItems();
    });
  }

  function deleteProjectTag(project) {
    const confirmed = window.confirm(
      `Remove #${project} from all tasks? The tasks will stay in your planner, but this project will disappear from the mix.`
    );

    if (!confirmed) return;

    runMutation(async () => {
      if (isGuest) {
        const items = readGuestItems().map((localItem) =>
          localItem.project_tag === project ? { ...localItem, project_tag: null } : localItem
        );
        writeGuestItems(items);
        setOpenProjectStat((openProject) => (openProject === project ? null : openProject));
        await loadItems();
        return;
      }

      const { error: updateError } = await supabase
        .from("items")
        .update({ project_tag: null })
        .eq("user_id", user.id)
        .eq("project_tag", project);

      if (updateError) throw updateError;
      setOpenProjectStat((openProject) => (openProject === project ? null : openProject));
      await loadItems();
    });
  }

  async function sendPasswordReset() {
    if (isGuest) return;

    setAccountMessage("");
    setAccountError("");

    if (!user.email) {
      setAccountError("No email found for this account.");
      return;
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/`,
    });

    if (resetError) {
      setAccountError(resetError.message || "Could not send reset link.");
      return;
    }

    setAccountMessage("Password reset link sent to your email.");
    setAccountOpen(false);
  }

  function requestDeleteAccount() {
    if (isGuest) return;

    setAccountError("");
    setAccountMessage(
      "Account deletion is manual in this test version. Contact the app owner if you want your account removed."
    );
    setAccountOpen(false);
  }

  async function signOut() {
    if (isGuest) {
      onExitGuest?.();
      return;
    }

    await supabase.auth.signOut();
  }

  const accountLabel = isGuest ? "Guest mode" : user.email || "Account";

  function createAccountFromGuest() {
    setGuestSyncPromptHandled(true);
    setGuestSyncPromptVisible(false);
    onExitGuest?.("sign-up");
  }

  function dismissGuestSyncPrompt() {
    setGuestSyncPromptHandled(true);
    snoozeGuestSyncPrompt();
    setGuestSyncPromptVisible(false);
  }

  function importGuestItemsToAccount() {
    setGuestSyncPromptHandled(true);
    setGuestSyncPromptVisible(false);
    runMutation(async () => {
      await migrateGuestItems();
      await loadItems();
    });
  }

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
            <div className="header-copy">
              
  <div className="title-row">
    <h1>The One Thing</h1>
    <div className="title-actions">
      <span className="brand-mark" aria-hidden="true" />
      <button
        type="button"
        className="app-info-btn"
        onClick={() => setAppInfoOpen((open) => !open)}
        aria-expanded={appInfoOpen}
        aria-label="What The One Thing is for"
      >
        <Info size={14} />
      </button>
      <div className="account-menu header-account-menu">
        <button
          className="app-info-btn account-trigger"
          type="button"
          onClick={() => setAccountOpen((open) => !open)}
          aria-expanded={accountOpen}
          aria-haspopup="menu"
          title={accountLabel}
          aria-label="Account menu"
        >
          <UserCircle size={14} aria-hidden="true" />
        </button>

        {accountOpen && (
          <div className="account-dropdown" role="menu">
            <div className="account-dropdown-email" title={accountLabel}>
              {accountLabel}
            </div>

            {isGuest ? (
              <>
                <p className="account-dropdown-note">Saved only in this browser.</p>
                <button className="account-menu-item" type="button" onClick={signOut} role="menuitem">
                  <LogOut size={14} /> Sign in to sync
                </button>
              </>
            ) : (
              <>
                <button className="account-menu-item" type="button" onClick={sendPasswordReset} role="menuitem">
                  <KeyRound size={14} /> Reset password
                </button>

                <button className="account-menu-item danger" type="button" onClick={requestDeleteAccount} role="menuitem">
                  <Trash2 size={14} /> Delete account
                </button>

                <button className="account-menu-item" type="button" onClick={signOut} role="menuitem">
                  <LogOut size={14} /> Sign out
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  </div>
  {appInfoOpen && (
    <div className="app-info-popover" role="note">
      <p>
        For the days when your brain opens 37 tabs at once. Drop every thought here, pick one thing for this moment, and
        let the other shiny ideas wait their turn instead of hijacking your afternoon.
      </p>
      <button type="button" onClick={() => setAppInfoOpen(false)} aria-label="Close app info">
        <X size={13} />
      </button>
    </div>
  )}
  <p>An anti-chaos planner for noisy minds.</p>
  <div className="header-controls">
    <ThemeSwitcher theme={theme} onChange={onThemeChange} />
  </div>
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

      {guestSyncPromptVisible && (
        <div className="guest-sync-prompt" role="status" aria-live="polite">
          <div>
            <strong>{isGuest ? "Save this for real?" : "Import guest notes?"}</strong>
            <span>
              {isGuest
                ? "Create an account first. After signing in, you can choose whether to import these guest notes."
                : "This browser has notes from guest mode. Add them to this account only if you want them here."}
            </span>
          </div>
          <button
            type="button"
            className="guest-sync-primary"
            onClick={isGuest ? createAccountFromGuest : importGuestItemsToAccount}
            disabled={busy}
          >
            {isGuest ? "Create account" : "Import"}
          </button>
          <button type="button" className="guest-sync-later" onClick={dismissGuestSyncPrompt} aria-label="Remind me later">
            {isGuest ? "Later" : "Not now"}
          </button>
        </div>
      )}

      <main className="bp-main">
        <section aria-label="Thought overflow" className="panel panel-white thoughts-panel">
          <div className="panel-title-row">
            <div className="panel-title-copy">
              <h2 className="hand-title">whatever just crossed my mind</h2>
              <p>Fresh brain-noise goes here. Tap play to focus it in The One Thing, or arrow it to Later.</p>
            </div>
            <span className="live-count">{thoughts.length}/{ACTIVE_CAP} live</span>
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
            <label className="project-tag-field">
              <Hash size={13} aria-hidden="true" />
              <span className="sr-only">Project tag</span>
              <input
                value={draftProject}
                onChange={(event) => setDraftProject(event.target.value)}
                list="project-tag-options"
                placeholder="project tag"
                disabled={busy}
              />
            </label>
            <datalist id="project-tag-options">
              {projectOptions.map((project) => (
                <option key={project} value={project} />
              ))}
            </datalist>
            <button type="submit" className="bp-icon-btn" aria-label="Add thought" disabled={busy}>
              <Plus size={18} />
            </button>
            {!projectTagAvailable && (
              <p className="project-tag-notice">Run the project_tag SQL once to save project tags.</p>
            )}
          </form>

          <div className="bp-scroll thought-list">
            {!loaded ? (
              <p className="muted">loading...</p>
            ) : thoughts.length === 0 ? (
              <p className="muted roomy">
                Nothing parked here. Good. Jot down anything that pops up - you don't have to act on it yet.
              </p>
            ) : (
              thoughts.map((item) => (
                <div key={item.id} className="bp-card sticky-note" style={{ transform: `rotate(${item.rot}deg)` }}>
                  <div className="item-copy">
                    {renderEditableItemCopy(item)}
                    {renderProjectTagControl(item)}
                  </div>
                  {renderItemEditButton(item)}
                  <button
                    onClick={() => promote(item)}
                    className="bp-thought-btn promote-btn"
                    title="Focus in The One Thing player"
                    aria-label={`Move ${item.text} to The One Thing player`}
                    disabled={busy}
                  >
                    <Play size={13} />
                  </button>
                  <button
                    onClick={() => moveToSetAside(item)}
                    className="bp-thought-btn set-aside-btn"
                    title="Move to Set aside for later"
                    aria-label={`Move ${item.text} to Set aside for later`}
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
            <p>Saved for later. Bring something back to live thoughts when it feels ready to compete for focus.</p>
          </div>

          <div className="bp-scroll aside-list">
            {setAside.length === 0 ? (
              <p className="muted roomy">Empty for now. Once you have more than {ACTIVE_CAP} live thoughts, the older ones will rest here.</p>
            ) : (
              setAside.map((item) => (
                <div key={item.id} className="bp-aside-row">
                  <div className="item-copy">
                    {renderEditableItemCopy(item)}
                    {renderProjectTagControl(item)}
                  </div>
                  {renderItemEditButton(item)}
                  <button
                    onClick={() => bringBack(item)}
                    className="small-outline-btn soft bp-thought-btn"
                    title="Bring back to live thoughts"
                    aria-label={`Bring ${item.text} back to live thoughts`}
                    disabled={busy}
                  >
                    <ArrowLeft size={12} />
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

        <section className="bp-focus-col" aria-label="The One Thing">
          <div className="focus-panel">
            <div>
              <div className="focus-kicker">
                <span className={focus ? "pulse-dot active" : "pulse-dot"} />
                <h2>The One Thing</h2>
              </div>

              <div className={focus ? "focus-spotlight" : "focus-spotlight empty"}>
                {focus ? (
                  <p className="focus-title">
                    {focus.text}
                  </p>
              ) : (
                <p className="focus-empty">Nothing chosen yet. Pick one thought from the left - just one - and it lands here.</p>
              )}

              </div>

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
                      onClick={togglePomodoroMusic}
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
                      disabled={!breakUnlocked}
                      title={breakUnlocked ? "Take a 5 minute break" : "Finish a 25 minute focus session first"}
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
                <button onClick={moveFocusToSetAside} className="not-now-btn" disabled={busy}>
                  Later
                </button>
              </div>
            )}
          </div>

          <div className="panel panel-white log-panel">
            <div className="log-title-row">
              <h3>Cleared today</h3>
              <button
                type="button"
                className="archive-toggle"
                onClick={() => setArchiveOpen((open) => !open)}
                aria-expanded={archiveOpen}
                aria-controls="archive-log"
              >
                Archive
                <span className="archive-switch" aria-hidden="true" />
                <ChevronDown size={14} />
              </button>
            </div>
            <div className="daily-goal">
              <div className="daily-goal-row">
                <div className="daily-goal-label">
                  <label htmlFor="daily-goal-input">Daily goal</label>
                  <button
                    type="button"
                    className="daily-goal-info-btn"
                    onClick={() => setGoalInfoOpen((open) => !open)}
                    aria-expanded={goalInfoOpen}
                    aria-label="Show daily goal medal guide"
                  >
                    <Info size={12} />
                  </button>
                </div>
                <div className="daily-goal-control">
                  <input
                    id="daily-goal-input"
                    type="number"
                    min="1"
                    max={DAILY_GOAL_MAX}
                    value={dailyGoalDraft}
                    onChange={updateDailyGoalDraft}
                    onKeyDown={handleDailyGoalKeyDown}
                    disabled={dailyGoalLockedToday}
                    aria-label="Daily cleared goal"
                  />
                  <button
                    type="button"
                    className="daily-goal-save"
                    onClick={commitDailyGoal}
                    disabled={!dailyGoalDraftCanSave}
                    aria-label="Save daily goal"
                    title={dailyGoalLockedToday ? "Daily goal can be changed again tomorrow" : "Save daily goal"}
                  >
                    <Check size={12} />
                  </button>
                </div>
              </div>

              <div className="daily-goal-progress" aria-label={`${clearedToday.length} of ${dailyGoal} cleared today`}>
                <span style={{ width: `${dailyGoalPercent}%` }} />
              </div>

              <p className="daily-goal-count">
                <span className="daily-goal-count-text">
                  {clearedToday.length}/{dailyGoal} cleared today
                  {dailyGoalRank && (
                    <strong
                      className={`daily-goal-medal ${dailyGoalRank.className}`}
                      aria-label={`${dailyGoalRank.label} rank`}
                      title={dailyGoalRank.label}
                    >
                      {dailyGoalRank.icon}
                    </strong>
                  )}
                </span>
              </p>

              {dailyGoalLockedToday && (
                <p className="daily-goal-lock-note">Goal locked for today. Tomorrow gets one new change.</p>
              )}

              {goalInfoOpen && (
                <div className="daily-goal-info" role="note">
                  <p>
                    <strong>🥉</strong> 1/3 goal · <strong>🥈</strong> half goal · <strong>🥇</strong> goal done ·{" "}
                    <strong>🏅</strong> 2x goal · <strong>💎</strong> 3x goal
                  </p>
                  <button type="button" onClick={() => setGoalInfoOpen(false)} aria-label="Close daily goal medal guide">
                    <X size={13} />
                  </button>
                </div>
              )}

              {dailyGoalComplete && !goalCelebrationDismissed && (
                <div className={`daily-goal-celebration ${dailyGoalRank?.className || ""}`.trim()} role="status">
                  <Trophy size={16} />
                  <span>{dailyGoalRank?.label || "Daily"} goal reached</span>
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
                    <div className="item-copy">
                      {item.text}
                    </div>
                    <small>{timeAgo(item.finishedAt)}</small>
                  </div>
                ))
              )}
            </div>

            <div className="project-stats" aria-label="Project tag summary">
              <h4>Completed project mix</h4>
              {projectStats.length === 0 ? (
                <p className="muted roomy">Project tags will show up here once completed tasks have them.</p>
              ) : (
                <div className="project-stat-list">
                  {projectStats.map(([project, count]) => {
                    const percent = Math.round((count / totalProjectTaggedItems) * 100);
                    const projectItems = log
                      .filter((item) => item.projectTag === project)
                      .sort((a, b) => sortNewestFirst(a, b, "finishedAt"))
                      .slice(0, PROJECT_TASK_PREVIEW_LIMIT);
                    const hiddenProjectItems = Math.max(0, count - projectItems.length);
                    const projectOpen = openProjectStat === project;

                    return (
                      <div key={project} className="project-stat-group">
                        <button
                          type="button"
                          className="project-stat-row"
                          onClick={() => setOpenProjectStat(projectOpen ? null : project)}
                          aria-expanded={projectOpen}
                        >
                          <span>#{project}</span>
                          <div className="project-stat-track" aria-hidden="true">
                            <i style={{ width: `${Math.max(12, Math.round((count / maxProjectCount) * 100))}%` }} />
                          </div>
                          <strong>
                            {percent}% <small>{count}</small>
                          </strong>
                          <button
                            type="button"
                            className="project-stat-delete"
                            onClick={(event) => {
                              event.stopPropagation();
                              deleteProjectTag(project);
                            }}
                            disabled={busy}
                            title={`Remove #${project}`}
                            aria-label={`Remove project tag ${project}`}
                          >
                            <Trash2 size={11} />
                          </button>
                          <ChevronDown size={13} aria-hidden="true" />
                        </button>

                        {projectOpen && (
                          <div className="project-stat-detail">
                            {projectItems.map((item) => (
                              <div key={item.id + item.finishedAt} className="project-stat-task">
                                <Check size={11} aria-hidden="true" />
                                <span>{item.text}</span>
                                <small>{timeAgo(item.finishedAt)}</small>
                              </div>
                            ))}
                            {hiddenProjectItems > 0 && (
                              <p className="project-stat-more">+{hiddenProjectItems} older</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {archiveOpen && (
              <div id="archive-log" className="archive-inline">
                <h4>Last 100 cleared</h4>
                <div className="bp-scroll archive-list">
                  {archivedLog.length === 0 ? (
                    <p className="muted roomy">Completed tasks will collect here.</p>
                  ) : (
                    archivedLog.map((item) => (
                      <div key={item.id + item.finishedAt} className="log-item">
                        <Check size={12} color="#5C8753" />
                        <div className="item-copy">
                          {item.text}
                        </div>
                        <small>{timeAgo(item.finishedAt)}</small>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
