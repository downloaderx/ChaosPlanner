import { useEffect, useState } from "react";
import { Cloud, Cpu, Gamepad2, Heart, Leaf, Scissors, Shuffle, Sparkles, Sprout, Square } from "lucide-react";

export const THEMES = [
  { id: "cozy", label: "Cozy", Icon: Leaf },
  { id: "comic", label: "Comic", Icon: Sparkles },
  { id: "scrapbook", label: "Scrapbook", Icon: Scissors },
  { id: "pixel", label: "Pixel", Icon: Gamepad2 },
  { id: "ghibli", label: "Ghibli", Icon: Cloud },
  { id: "cyberpunk", label: "Cyberpunk", Icon: Cpu },
  { id: "plant", label: "Plant", Icon: Sprout },
  { id: "pink", label: "Pink", Icon: Heart },
  { id: "brutalist", label: "Brutalist", Icon: Square },
];

const STORAGE_KEY = "overflow-focus-theme";
const INTRO_QUICK_THEME_IDS = ["cozy", "comic", "pixel"];

function getRandomThemeId() {
  return THEMES[Math.floor(Math.random() * THEMES.length)]?.id || "cozy";
}

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "cozy";

    const storedTheme = localStorage.getItem(STORAGE_KEY);
    if (THEMES.some((item) => item.id === storedTheme)) return storedTheme;

    const randomTheme = getRandomThemeId();
    try {
      localStorage.setItem(STORAGE_KEY, randomTheme);
    } catch (e) {
      // localStorage unavailable - the random first theme just won't persist
    }

    return randomTheme;
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      // localStorage unavailable - theme just won't persist, no big deal
    }
  }, [theme]);

  return [theme, setTheme];
}

export function ThemeSwitcher({ theme, onChange }) {
  function randomizeTheme() {
    const availableThemes = THEMES.filter((t) => t.id !== theme);
    const nextTheme = availableThemes[Math.floor(Math.random() * availableThemes.length)] || THEMES[0];
    onChange(nextTheme.id);
  }

  return (
    <div className="theme-switcher" role="group" aria-label="Choose app theme">
      {THEMES.map((t) => {
        const Icon = t.Icon;

        return (
          <button
            key={t.id}
            type="button"
            className={`theme-btn theme-${t.id}${theme === t.id ? " active" : ""}`}
            onClick={() => onChange(t.id)}
            aria-pressed={theme === t.id}
            aria-label={`${t.label} theme`}
            title={`${t.label} theme`}
          >
            <Icon className="theme-icon" aria-hidden="true" size={14} strokeWidth={2.4} />
            <span className="theme-label">{t.label}</span>
          </button>
        );
      })}

      <button
        type="button"
        className="theme-btn random-theme-btn"
        onClick={randomizeTheme}
        aria-label="Random theme"
        title="Random theme"
      >
        <Shuffle className="theme-icon" aria-hidden="true" size={14} strokeWidth={2.4} />
        <span className="theme-label">Random</span>
      </button>
    </div>
  );
}

export function IntroThemePicker({ theme, onChange }) {
  const [open, setOpen] = useState(false);
  const quickThemes = THEMES.filter((item) => INTRO_QUICK_THEME_IDS.includes(item.id));
  const moreThemes = THEMES.filter((item) => !INTRO_QUICK_THEME_IDS.includes(item.id));

  function randomizeTheme() {
    const availableThemes = THEMES.filter((t) => t.id !== theme);
    const nextTheme = availableThemes[Math.floor(Math.random() * availableThemes.length)] || THEMES[0];
    onChange(nextTheme.id);
    setOpen(false);
  }

  function pickTheme(themeId) {
    onChange(themeId);
    setOpen(false);
  }

  return (
    <div className="intro-theme-picker">
      <div className="intro-theme-quick" role="group" aria-label="Quick theme choices">
        {quickThemes.map((t) => {
          const Icon = t.Icon;

          return (
            <button
              key={t.id}
              type="button"
              className={`intro-theme-btn theme-${t.id}${theme === t.id ? " active" : ""}`}
              onClick={() => pickTheme(t.id)}
              aria-pressed={theme === t.id}
              aria-label={`${t.label} theme`}
              title={`${t.label} theme`}
            >
              <Icon className="intro-theme-icon" aria-hidden="true" size={14} strokeWidth={2.4} />
              <span>{t.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          className={`intro-theme-btn intro-theme-more${open ? " active" : ""}`}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label="More themes"
          title="More themes"
        >
          More
        </button>
      </div>

      {open && (
        <div className="intro-theme-popover" role="group" aria-label="More theme choices">
          {moreThemes.map((t) => {
            const Icon = t.Icon;

            return (
              <button
                key={t.id}
                type="button"
                className={`intro-theme-btn theme-${t.id}${theme === t.id ? " active" : ""}`}
                onClick={() => pickTheme(t.id)}
                aria-pressed={theme === t.id}
              >
                <Icon className="intro-theme-icon" aria-hidden="true" size={14} strokeWidth={2.4} />
                <span>{t.label}</span>
              </button>
            );
          })}

          <button type="button" className="intro-theme-btn random-theme-btn" onClick={randomizeTheme}>
            <Shuffle className="intro-theme-icon" aria-hidden="true" size={14} strokeWidth={2.4} />
            <span>Random</span>
          </button>
        </div>
      )}
    </div>
  );
}
