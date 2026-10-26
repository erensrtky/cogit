import { describe, expect, it } from "vitest";
import { CONFIG_SCHEMA, Config } from "../src/schema/config.js";
import { PANEL_EDITABLE_KEYS } from "../src/view/model.js";
import {
  DEFAULT_SETTINGS,
  editableSettings,
  formatSetting,
  settingsSections,
  withDefaults,
} from "../src/view/settings.js";

describe("settings model", () => {
  it("keeps the defaults in step with the config schema", () => {
    const parsed = Config.parse({ schema: CONFIG_SCHEMA });
    expect(DEFAULT_SETTINGS).toEqual({
      language: parsed.language,
      updateEveryTurns: parsed.updateEveryTurns,
      sessionEndCatchUp: parsed.sessionEndCatchUp,
      catchUpModel: parsed.catchUpModel,
      messageSummaries: parsed.messageSummaries,
      startupContext: parsed.startupContext,
      shareConversations: parsed.shareConversations,
      recordCommit: parsed.recordCommit,
      gitPolicy: parsed.gitPolicy,
      agents: parsed.agents,
    });
  });

  it("lets the embedded values override the defaults", () => {
    expect(withDefaults(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(withDefaults({ updateEveryTurns: 9, gitPolicy: "commit" })).toEqual({
      ...DEFAULT_SETTINGS,
      updateEveryTurns: 9,
      gitPolicy: "commit",
    });
  });

  it("has one section with every field and edits only the allow-listed keys over http", () => {
    const sections = settingsSections(true);
    expect(sections.map((section) => section.title)).toEqual(["Recording"]);
    const fields = sections[0]?.fields ?? [];
    expect(fields.map((field) => field.key)).toEqual([
      ...PANEL_EDITABLE_KEYS,
      "gitPolicy",
      "agents",
    ]);
    for (const field of fields) {
      expect(field.label).not.toBe("");
      expect(field.help.length).toBeGreaterThan(10);
      expect(field.editable).toBe((PANEL_EDITABLE_KEYS as readonly string[]).includes(field.key));
    }
  });

  it("shows everything read-only over file://", () => {
    const fields = settingsSections(false).flatMap((section) => section.fields);
    expect(fields).toHaveLength(PANEL_EDITABLE_KEYS.length + 2);
    expect(fields.every((field) => !field.editable)).toBe(true);
  });

  it("returns only the editable keys with their current values", () => {
    const settings = { ...DEFAULT_SETTINGS, language: "tr", updateEveryTurns: 8 };
    expect(editableSettings(settings)).toEqual({
      messageSummaries: false,
      startupContext: true,
      language: "tr",
      updateEveryTurns: 8,
      sessionEndCatchUp: true,
      catchUpModel: "haiku",
      shareConversations: false,
      recordCommit: "ask",
    });
    expect(Object.keys(editableSettings(settings)).sort()).toEqual([...PANEL_EDITABLE_KEYS].sort());
  });

  it("formats a read-only value for the modal", () => {
    expect(formatSetting(true)).toBe("yes");
    expect(formatSetting(false)).toBe("no");
    expect(formatSetting(["claude-code", "codex"])).toBe("claude-code, codex");
    expect(formatSetting([])).toBe("—");
    expect(formatSetting("auto")).toBe("auto");
    expect(formatSetting(5)).toBe("5");
    expect(formatSetting(undefined)).toBe("—");
  });
});
