import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import Auth from "./Auth";
import BufferPlanner from "./BufferPlanner";
import { useTheme } from "./theme.jsx";

const GUEST_MODE_STORAGE_KEY = "the-one-thing-guest-mode";
const GUEST_USER = {
  id: "guest",
  email: "",
  isGuest: true,
};

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [guestMode, setGuestMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(GUEST_MODE_STORAGE_KEY) === "true";
  });
  const [theme, setTheme] = useTheme();

  useEffect(() => {
    let isMounted = true;

    const recoveryFromUrl =
      window.location.hash.includes("type=recovery") ||
      window.location.search.includes("type=recovery");

    supabase.auth.getSession().then(({ data, error }) => {
      if (!isMounted) return;
      if (error) console.error("Error loading auth session", error);

      setSession(data?.session ?? null);
      if (data?.session) {
        setGuestMode(false);
        localStorage.removeItem(GUEST_MODE_STORAGE_KEY);
      }

      if (recoveryFromUrl) {
        setRecoveryMode(true);
      }

      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);

      if (nextSession) {
        setGuestMode(false);
        localStorage.removeItem(GUEST_MODE_STORAGE_KEY);
      }

      if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return <div className="loading-screen">loading your planner...</div>;
  }

  if (recoveryMode) {
    return (
      <Auth
        recoveryMode
        theme={theme}
        onThemeChange={setTheme}
        onRecoveryComplete={() => {
          setRecoveryMode(false);
          window.history.replaceState({}, document.title, window.location.origin);
        }}
      />
    );
  }

  function startGuestMode() {
    setGuestMode(true);
    localStorage.setItem(GUEST_MODE_STORAGE_KEY, "true");
  }

  function exitGuestMode() {
    setGuestMode(false);
    localStorage.removeItem(GUEST_MODE_STORAGE_KEY);
  }

  if (guestMode && !session?.user) {
    return <BufferPlanner user={GUEST_USER} theme={theme} onThemeChange={setTheme} onExitGuest={exitGuestMode} />;
  }

  if (!session?.user) {
    return <Auth theme={theme} onThemeChange={setTheme} onContinueAsGuest={startGuestMode} />;
  }

  return <BufferPlanner user={session.user} theme={theme} onThemeChange={setTheme} />;
}
