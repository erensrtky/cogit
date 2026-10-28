import { describe, expect, it } from "vitest";
import { CONFIG_SCHEMA, Config } from "../src/schema/config.js";
import { PANEL_EDITABLE_KEYS } from "../src/view/model.js";
import {
  CLI_ONLY,
  configHelpLines,
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
      recorder: parsed.recorder,
      language: parsed.language,
      updateEveryTurns: parsed.updateEveryTurns,
      sideEveryTurns: parsed.sideEveryTurns,
      sessionEndCatchUp: parsed.sessionEndCatchUp,
      sideModel: parsed.sideModel,
      messageSummaries: parsed.messageSummaries,
      startupContext: parsed.startupContext,
      recordHeadless: parsed.recordHeadless,
      tryBeforeNotes: parsed.tryBeforeNotes,
      shareConversations: parsed.shareConversations,
      recordCommit: parsed.recordCommit,
      gitPolicy: parsed.gitPolicy,
      agents: parsed.agents,
      bigChangeLines: parsed.bigChangeLines,
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

  it("has one section with the editable fields only; CLI-only settings stay off the panel", () => {
    const sections = settingsSections(true);
    expect(sections.map((section) => section.title)).toEqual(["Recording"]);
    const fields = sections[0]?.fields ?? [];
    expect(fields.map((field) => field.key)).toEqual([...PANEL_EDITABLE_KEYS]);
    for (const field of fields) {
      expect(field.label).not.toBe("");
      expect(field.help.length).toBeGreaterThan(10);
      // Every field has the longer plain-language "?" text (Story 12.1).
      expect(field.details.length).toBeGreaterThan(field.help.length);
      expect(field.editable).toBe(true);
    }
  });

  it("shows everything read-only over file://", () => {
    const fields = settingsSections(false).flatMap((section) => section.fields);
    expect(fields).toHaveLength(PANEL_EDITABLE_KEYS.length);
    expect(fields.every((field) => !field.editable)).toBe(true);
  });

  it("returns only the editable keys with their current values", () => {
    const settings = { ...DEFAULT_SETTINGS, language: "tr", updateEveryTurns: 8 };
    expect(editableSettings(settings)).toEqual({
      recorder: "mixed",
      messageSummaries: false,
      startupContext: true,
      recordHeadless: false,
      tryBeforeNotes: true,
      language: "tr",
      updateEveryTurns: 8,
      sideEveryTurns: 5,
      sessionEndCatchUp: true,
      sideModel: "haiku",
      shareConversations: false,
      recordCommit: "ask",
    });
    expect(Object.keys(editableSettings(settings)).sort()).toEqual([...PANEL_EDITABLE_KEYS].sort());
  });

  it("prints the same long explanations in `cogit config --help` (Story 12.1)", () => {
    const lines = configHelpLines();
    expect(lines.length).toBe(PANEL_EDITABLE_KEYS.length + CLI_ONLY.length);
    const text = lines.join("\n");
    for (const field of settingsSections(true).flatMap((section) => section.fields)) {
      expect(text).toContain(field.details);
    }
    // The recording-mode explanation states the measured trade-off plainly.
    expect(text).toContain("1–2%");
    expect(text).toContain("5%");
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
