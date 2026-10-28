import { useSyncExternalStore } from "react";
import {
  getTheme,
  nextTheme,
  setTheme,
  subscribeTheme,
  type ThemeMode,
  themeLabel,
} from "./theme.js";

/** The current theme choice, re-rendering when it changes. */
export function useTheme(): ThemeMode {
  return useSyncExternalStore(subscribeTheme, getTheme, getTheme);
}

const ICON_PROPS = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

/** A screen for "follow the system", a sun for Light, a moon for Dark. */
function ThemeIcon({ mode }: { mode: ThemeMode }) {
  if (mode === "light")
    return (
      <svg {...ICON_PROPS}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  if (mode === "dark")
    return (
      <svg {...ICON_PROPS}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    );
  return (
    <svg {...ICON_PROPS}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

/** The top bar's theme switch, next to Settings: one icon, the words in its tooltip. */
export function ThemeButton() {
  const mode = useTheme();
  const next = nextTheme(mode);
  const text = `Theme: ${themeLabel(mode)}. Click for ${themeLabel(next)}.`;
  return (
    <button
      type="button"
      className="theme-button"
      title={text}
      aria-label={text}
      onClick={() => setTheme(next)}
    >
      <ThemeIcon mode={mode} />
    </button>
  );
}
