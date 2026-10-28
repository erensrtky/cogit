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

/** The top bar's System → Light → Dark switch, next to Settings. */
export function ThemeButton() {
  const mode = useTheme();
  const next = nextTheme(mode);
  return (
    <button
      type="button"
      className="settings-button theme-button"
      title={`Theme: ${mode}. Click for ${next}.`}
      aria-label={`Theme: ${mode}. Switch to ${next}.`}
      onClick={() => setTheme(next)}
    >
      {themeLabel(mode)}
    </button>
  );
}
