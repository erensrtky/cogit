import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

/**
 * Git gives a `pre-push` hook no sign of `--dry-run`, so the `git push` that ran
 * the hook is read from the process tree: the hook's shell, then git. Linux reads
 * `/proc`, macOS asks `ps`; elsewhere (Windows) nothing is found and the push
 * counts as real, as before.
 */

/** One process: its parent's pid, its argument list and, where known, when it started (ms). */
export interface ProcessInfo {
  ppid: number;
  args: string[];
  started?: number;
}

export type ReadProcess = (pid: number) => ProcessInfo | undefined;

/** How far up to look: cogit ← its shell (or a subshell) ← hook shell ← git. */
const MAX_DEPTH = 6;

/** The arguments of the nearest `git … push …` above this process, if any. */
export function findPushArgs(startPid: number, read: ReadProcess): string[] | undefined {
  let pid = startPid;
  for (let depth = 0; depth < MAX_DEPTH && pid > 1; depth++) {
    const info = read(pid);
    if (info === undefined) return undefined;
    const name = basename(info.args[0] ?? "").replace(/\.exe$/i, "");
    if (name === "git" && info.args.includes("push")) return info.args;
    pid = info.ppid;
  }
  return undefined;
}

/** `git push` options that take the next word as their value. */
const VALUE_OPTIONS = new Set(["--push-option", "--repo", "--receive-pack", "--exec"]);

/** True when these `git … push …` arguments ask for `--dry-run` (or `-n`). */
export function isDryRun(args: readonly string[]): boolean {
  const start = args.indexOf("push");
  if (start === -1) return false;
  for (let i = start + 1; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (arg === "--") return false;
    if (arg === "--dry-run") return true;
    if (VALUE_OPTIONS.has(arg)) {
      i++;
      continue;
    }
    if (!/^-[^-]/.test(arg)) continue;
    // A bundle of short flags, such as `-fn`; `-o` takes the rest (or the next word).
    for (let c = 1; c < arg.length; c++) {
      if (arg[c] === "n") return true;
      if (arg[c] === "o") {
        if (c === arg.length - 1) i++;
        break;
      }
    }
  }
  return false;
}

/** True when the `git push` running this hook is a dry run; false when unknown. */
export function pushIsDryRun(read: ReadProcess = (pid) => readProcess(pid)): boolean {
  const args = findPushArgs(process.ppid, read);
  return args !== undefined && isDryRun(args);
}

export function readProcess(
  pid: number,
  platform: NodeJS.Platform = process.platform,
): ProcessInfo | undefined {
  if (platform === "linux") return readProc(pid);
  if (platform === "darwin") return readPs(pid);
  return undefined;
}

export function readProc(pid: number): ProcessInfo | undefined {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    // The command name sits in parentheses and may hold spaces: read after the last one.
    const ppid = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
    const args = readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").filter(Boolean);
    return Number.isInteger(ppid) ? { ppid, args } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Windows has neither `/proc` nor `ps`: one PowerShell call lists every process
 * with its parent, command line and start time, and the caller walks that
 * table. Undefined when PowerShell does not answer in time. It takes about half
 * a second, so it is read once per walk, never per process.
 */
export function readWindowsProcesses(
  run: typeof spawnSync = spawnSync,
): Map<number, ProcessInfo> | undefined {
  const script =
    "Get-CimInstance Win32_Process | ForEach-Object { [pscustomobject]@{ " +
    "p = $_.ProcessId; pp = $_.ParentProcessId; n = $_.Name; c = $_.CommandLine; " +
    "t = if ($_.CreationDate) { ([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() } else { 0 } " +
    "} } | ConvertTo-Json -Compress";
  const out = run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    timeout: 10_000,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  return out.status === 0 ? parseWindowsProcesses(out.stdout ?? "") : undefined;
}

/**
 * The table `readWindowsProcesses` prints: one object, or an array of them, with
 * the pid, parent pid, image name, command line (null when Windows hides it)
 * and start time.
 */
export function parseWindowsProcesses(json: string): Map<number, ProcessInfo> | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return undefined;
  }
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const table = new Map<number, ProcessInfo>();
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const { p, pp, n, c, t } = row as Record<string, unknown>;
    if (typeof p !== "number" || typeof pp !== "number") continue;
    const args =
      typeof c === "string" && c.trim() !== ""
        ? windowsCommandLine(c)
        : typeof n === "string"
          ? [n]
          : [];
    table.set(p, { ppid: pp, args, ...(typeof t === "number" && t > 0 ? { started: t } : {}) });
  }
  return table;
}

/** A Windows command line as arguments: quoted runs kept whole, enough to read the program and its script. */
export function windowsCommandLine(line: string): string[] {
  return [...line.matchAll(/"([^"]*)"|[^\s"]+/g)].map((match) => match[1] ?? match[0]);
}

/** `ps` joins the arguments with spaces; enough to spot `push` and its flags. */
export function readPs(pid: number): ProcessInfo | undefined {
  const out = spawnSync("ps", ["-o", "ppid=,args=", "-p", String(pid)], {
    encoding: "utf8",
    timeout: 1000,
  });
  const match = /^(\d+)\s+([\s\S]*)$/.exec((out.stdout ?? "").trim());
  if (out.status !== 0 || match === null) return undefined;
  return { ppid: Number(match[1]), args: (match[2] ?? "").trim().split(/\s+/) };
}
