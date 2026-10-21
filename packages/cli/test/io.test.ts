import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@inquirer/prompts", () => ({
  select: vi.fn(async () => "picked"),
  input: vi.fn(async () => "typed"),
  confirm: vi.fn(async () => true),
}));

const { defaultsPrompter, inquirerPrompter, processIo } = await import("../src/io.js");

afterEach(() => vi.restoreAllMocks());

describe("prompters", () => {
  it("forwards questions to inquirer", async () => {
    expect(await inquirerPrompter.select("q", [{ value: "a", name: "A" }], "a")).toBe("picked");
    expect(await inquirerPrompter.input("q", "d")).toBe("typed");
    expect(await inquirerPrompter.confirm("q", false)).toBe(true);
  });

  it("answers with defaults", async () => {
    expect(await defaultsPrompter.select("q", [], "x")).toBe("x");
    expect(await defaultsPrompter.input("q", "d")).toBe("d");
    expect(await defaultsPrompter.confirm("q", false)).toBe(false);
  });
});

describe("processIo", () => {
  it("writes to stdout and stderr and picks the prompter", () => {
    const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const err = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const io = processIo(true);
    io.out("hi");
    io.warn("careful");
    expect(out).toHaveBeenCalledWith("hi\n");
    expect(err).toHaveBeenCalledWith("warning: careful\n");
    expect(io.prompt).toBe(inquirerPrompter);
    expect(processIo(false).prompt).toBe(defaultsPrompter);
    expect(io.now()).toMatch(/^\d{4}-\d\d-\d\dT/);
  });
});
