import { describe, expect, it } from "vitest";
import {
  applyTheme,
  nextTheme,
  readTheme,
  storeTheme,
  THEME_KEY,
  themeLabel,
} from "../src/theme.js";

function memory(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  } as Storage;
}

const broken = {
  getItem: () => {
    throw new Error("denied");
  },
  setItem: () => {
    throw new Error("denied");
  },
  removeItem: () => {
    throw new Error("denied");
  },
} as unknown as Storage;

describe("the theme switch", () => {
  it("cycles System → Light → Dark and labels each", () => {
    expect(nextTheme("system")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("system");
    expect(themeLabel("system")).toContain("System");
    expect(themeLabel("light")).toContain("Light");
    expect(themeLabel("dark")).toContain("Dark");
  });

  it("remembers a choice and forgets System", () => {
    const storage = memory();
    expect(readTheme(storage)).toBe("system");
    storeTheme(storage, "dark");
    expect(storage.getItem(THEME_KEY)).toBe("dark");
    expect(readTheme(storage)).toBe("dark");
    storeTheme(storage, "system");
    expect(storage.getItem(THEME_KEY)).toBeNull();
    storage.setItem(THEME_KEY, "purple");
    expect(readTheme(storage)).toBe("system");
  });

  it("falls back to System when storage is missing or throws", () => {
    expect(readTheme(undefined)).toBe("system");
    expect(readTheme(broken)).toBe("system");
    expect(() => storeTheme(broken, "light")).not.toThrow();
  });

  it("marks the page for Light and Dark and clears the mark for System", () => {
    const root = { dataset: {} as DOMStringMap };
    applyTheme(root, "light");
    expect(root.dataset.theme).toBe("light");
    applyTheme(root, "system");
    expect(root.dataset.theme).toBeUndefined();
  });
});
