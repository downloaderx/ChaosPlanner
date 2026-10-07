import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronDown,
  Cloud,
  Cpu,
  Gamepad2,
  Heart,
  Leaf,
  Rocket,
  Scissors,
  Shuffle,
  Sparkles,
  Sprout,
  Square,
  Waves,
  Wind,
} from "lucide-react";

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
  { id: "seafoam", label: "Seafoam", Icon: Waves },
  { id: "airship", label: "Airship", Icon: Wind },
  { id: "cosmos", label: "Cosmos", Icon: Rocket },
];

const STORAGE_KEY = "overflow-focus-theme";
const INTRO_QUICK_THEME_IDS = ["cozy", "comic", "pixel"];
const MOBILE_THEME_MENU_QUERY = "(max-width: 640px)";

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
  const [open, setOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const activeTheme = THEMES.find((item) => item.id === theme) || THEMES[0];
  const ActiveIcon = activeTheme.Icon;

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const mediaQuery = window.matchMedia(MOBILE_THEME_MENU_QUERY);
    const updateMobileMenu = () => setMobileMenu(mediaQuery.matches);

    updateMobileMenu();
    mediaQuery.addEventListener?.("change", updateMobileMenu);

    return () => {
      mediaQuery.removeEventListener?.("change", updateMobileMenu);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    document.documentElement.classList.toggle("theme-menu-open", open);

    return () => {
      document.documentElement.classList.remove("theme-menu-open");
    };
  }, [open]);

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

  const themePopover = (
    <div
      className={`theme-menu-popover${mobileMenu ? " mobile-theme-menu-portal" : ""}`}
      role="group"
      aria-label="Choose app theme"
    >
      {THEMES.map((t) => {
        const Icon = t.Icon;

        return (
          <button
            key={t.id}
            type="button"
            className={`theme-btn theme-menu-option theme-${t.id}${theme === t.id ? " active" : ""}`}
            onClick={() => pickTheme(t.id)}
            aria-pressed={theme === t.id}
            aria-label={`${t.label} theme`}
            title={`${t.label} theme`}
          >
            <Icon className="theme-icon" aria-hidden="true" size={14} strokeWidth={2.4} />
            <span className="theme-label">{t.label}</span>
            <Check className="theme-menu-check" aria-hidden="true" size={13} strokeWidth={2.6} />
          </button>
        );
      })}

      <button
        type="button"
        className="theme-btn theme-menu-option random-theme-btn"
        onClick={randomizeTheme}
        aria-label="Random theme"
        title="Random theme"
      >
        <Shuffle className="theme-icon" aria-hidden="true" size={14} strokeWidth={2.4} />
        <span className="theme-label">Random</span>
      </button>
    </div>
  );

  return (
    <div className={`theme-menu${open ? " open" : ""}`}>
      <span className="theme-menu-title">Theme</span>
      <button
        type="button"
        className={`theme-btn theme-menu-trigger theme-${activeTheme.id}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Choose app theme"
        title="Choose app theme"
      >
        <ActiveIcon className="theme-icon" aria-hidden="true" size={14} strokeWidth={2.4} />
        <span className="theme-label">{activeTheme.label}</span>
        <ChevronDown className="theme-menu-chevron" aria-hidden="true" size={14} strokeWidth={2.4} />
      </button>

      {open && mobileMenu && typeof document !== "undefined" ? createPortal(themePopover, document.body) : null}
      {open && !mobileMenu ? themePopover : null}
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
