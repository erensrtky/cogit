/**
 * The theme switch: System (follow the browser), Light or Dark. The choice is a
 * per-viewer convenience, kept in localStorage, and shown as `data-theme` on
 * `<html>`; the stylesheet keys the light palette off it and off the system
 * preference. Storage can be missing or throw (private windows, `file://` in
 * some browsers), so every access is guarded and System is the fallback.
 */

export type ThemeMode = "system" | "light" | "dark";

export const THEME_KEY = "cogit-theme";
const ORDER: readonly ThemeMode[] = ["system", "light", "dark"];

/** The mode after `mode` in the button's cycle. */
export function nextTheme(mode: ThemeMode): ThemeMode {
  return ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length] as ThemeMode;
}

/** What the button says for a mode. */
export function themeLabel(mode: ThemeMode): string {
  return mode === "system" ? "◐ System" : mode === "light" ? "☀ Light" : "☾ Dark";
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readTheme(storage: Store | undefined): ThemeMode {
  try {
    const value = storage?.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

export function storeTheme(storage: Store | undefined, mode: ThemeMode): void {
  try {
    if (mode === "system") storage?.removeItem(THEME_KEY);
    else storage?.setItem(THEME_KEY, mode);
  } catch {
    // Not remembered; the page still switches.
  }
}

/** Marks `<html>`; System clears the mark so the media query decides. */
export function applyTheme(root: Pick<HTMLElement, "dataset">, mode: ThemeMode): void {
  if (mode === "system") delete root.dataset.theme;
  else root.dataset.theme = mode;
}

function browserStorage(): Store | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

let current: ThemeMode = readTheme(browserStorage());
const listeners = new Set<() => void>();

export function getTheme(): ThemeMode {
  return current;
}

export function setTheme(mode: ThemeMode): void {
  current = mode;
  storeTheme(browserStorage(), mode);
  if (typeof document !== "undefined") applyTheme(document.documentElement, mode);
  for (const listener of listeners) listener();
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Applies the remembered choice before the first paint. */
export function initTheme(): void {
  if (typeof document !== "undefined") applyTheme(document.documentElement, current);
}
