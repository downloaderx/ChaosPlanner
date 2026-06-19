import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import Auth from "./Auth";
import BufferPlanner from "./BufferPlanner";

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const recoveryFromUrl =
      window.location.hash.includes("type=recovery") ||
      window.location.search.includes("type=recovery");

    supabase.auth.getSession().then(({ data, error }) => {
      if (!isMounted) return;
      if (error) console.error("Error loading auth session", error);

      setSession(data?.session ?? null);

      if (recoveryFromUrl) {
        setRecoveryMode(true);
      }

      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);

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
    return <div className="loading-screen">loading your planner…</div>;
  }

  if (recoveryMode) {
    return (
      <Auth
        recoveryMode
        onRecoveryComplete={() => {
          setRecoveryMode(false);
          window.history.replaceState({}, document.title, window.location.origin);
        }}
      />
    );
  }

  if (!session?.user) {
    return <Auth />;
  }

  return <BufferPlanner user={session.user} />;
}