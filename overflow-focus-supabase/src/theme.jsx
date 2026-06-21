import { useEffect, useState } from "react";

export const THEMES = [
  { id: "cozy", label: "Cozy", emoji: "🌿" },
  { id: "comic", label: "Comic", emoji: "💥" },
  { id: "scrapbook", label: "Scrapbook", emoji: "✂️" },
  { id: "pixel", label: "Pixel", emoji: "👾" },
  { id: "ghibli", label: "Ghibli", emoji: "☁️" },
  { id: "cyberpunk", label: "Cyberpunk", emoji: "🌆" },
  { id: "plant", label: "Plant", emoji: "🪴" },
  { id: "brutalist", label: "Brutalist", emoji: "▪️" },
];

const STORAGE_KEY = "overflow-focus-theme";

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "cozy";
    return localStorage.getItem(STORAGE_KEY) || "cozy";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      // localStorage unavailable — theme just won't persist, no big deal
    }
  }, [theme]);

  return [theme, setTheme];
}

export function ThemeSwitcher({ theme, onChange }) {
  return (
    <div className="theme-switcher" role="group" aria-label="Choose app theme">
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`theme-btn${theme === t.id ? " active" : ""}`}
          onClick={() => onChange(t.id)}
          aria-pressed={theme === t.id}
        >
          <span aria-hidden="true">{t.emoji}</span> {t.label}
        </button>
      ))}
    </div>
  );
}