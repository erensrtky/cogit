import {
  DATA_ELEMENT_ID,
  LIVE_META_NAME,
  type PageModel,
  type PanelSettings,
  TOKEN_META_NAME,
} from "../../cli/src/view/model.js";

/** Parses and checks the JSON contract; throws when the shape is not a page. */
export function parseViewModel(text: string): PageModel {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("The embedded cogit data is not valid JSON.");
  }
  if (typeof value !== "object" || value === null || !("kind" in value)) {
    throw new Error("The embedded cogit data is not a view model.");
  }
  if (value.kind !== "lineage" && value.kind !== "panel") {
    throw new Error(`Unsupported cogit view: ${String(value.kind)}`);
  }
  return value as PageModel;
}

/**
 * Reads the JSON contract from the page. Dev mode falls back to the fixture;
 * production builds always embed the data, so a missing element is a real error.
 */
export async function loadViewModel(doc: Document = document): Promise<PageModel> {
  const raw = doc.getElementById(DATA_ELEMENT_ID)?.textContent?.trim();
  if (raw) return parseViewModel(raw);
  if (import.meta.env.DEV) {
    const { fixture } = await import("./fixture.js");
    return fixture;
  }
  throw new Error("No cogit data in this page. Run `cogit build`.");
}

/**
 * True only for a page the local map server served. `file://` pages and the
 * Vite dev server must not subscribe: nothing would answer.
 */
export function isLivePage(doc: Document = document): boolean {
  return doc.querySelector(`meta[name="${LIVE_META_NAME}"]`) !== null;
}

/**
 * The per-server token the local server puts in the panel page. Null over
 * `file://` (and anywhere the page did not come from the server), which is what
 * keeps the settings read-only there.
 */
export function pageToken(doc: Document = document): string | null {
  const content = doc
    .querySelector(`meta[name="${TOKEN_META_NAME}"]`)
    ?.getAttribute("content")
    ?.trim();
  return content ? content : null;
}

/**
 * The live settings the modal opens with (Story 8.13). The server answers with
 * only the keys the modal may change, so a map built before a change still
 * shows the current value.
 */
export async function loadSettings(token: string): Promise<Partial<PanelSettings>> {
  const response = await fetch("/api/config", {
    headers: { "x-cogit-token": token },
    cache: "no-store",
  });
  if (!response.ok) {
    const text = (await response.text()).trim();
    throw new Error(text || `could not read settings (HTTP ${response.status})`);
  }
  const body = (await response.json()) as { settings?: Partial<PanelSettings> };
  return body.settings ?? {};
}

/**
 * How the user left the map (open sessions, row widths) as stored now. The page
 * embeds it at build time, but a reload right after a change can beat the
 * rebuild, so the page asks too.
 */
export async function loadMapView(
  dir: string,
  token: string,
): Promise<{ rowWidths?: unknown; open?: unknown }> {
  const response = await fetch(`/api/map-view?dir=${encodeURIComponent(dir)}`, {
    headers: { "x-cogit-token": token },
    cache: "no-store",
  });
  if (!response.ok) {
    const text = (await response.text()).trim();
    throw new Error(text || `could not read the map view (HTTP ${response.status})`);
  }
  return (await response.json()) as { rowWidths?: unknown; open?: unknown };
}

/** Stores which sessions are open, so a reload opens them again; needs the local server. */
export async function saveOpenSessions(
  dir: string,
  open: readonly string[],
  token: string,
): Promise<void> {
  const response = await fetch("/api/open-sessions", {
    method: "POST",
    headers: { "content-type": "application/json", "x-cogit-token": token },
    body: JSON.stringify({ dir, open }),
  });
  if (!response.ok) {
    const text = (await response.text()).trim();
    throw new Error(text || `could not save the open sessions (HTTP ${response.status})`);
  }
}

/**
 * Stores how wide one session's message rows are, or forgets it (`null`). The
 * state lives in the project's `.cogit/state/`, so this needs the local server;
 * over `file://` the width lasts for the open page only.
 */
export async function saveRowWidth(
  dir: string,
  sessionId: string,
  width: number | null,
  token: string,
): Promise<void> {
  const response = await fetch("/api/row-width", {
    method: "POST",
    headers: { "content-type": "application/json", "x-cogit-token": token },
    body: JSON.stringify({ dir, sessionId, width }),
  });
  if (!response.ok) {
    const text = (await response.text()).trim();
    throw new Error(text || `could not save the row width (HTTP ${response.status})`);
  }
}

/**
 * Dismisses one inbox row (Story 11.1). The state lives in the project's
 * `.cogit/state/`, so this needs the local server; over `file://` the row
 * stays hidden for the open page only. The turn time is what was dismissed, so
 * a newer agent turn brings the row back.
 */
export async function saveDismiss(
  dir: string,
  sessionId: string,
  at: string,
  token: string,
): Promise<void> {
  const response = await fetch("/api/inbox/dismiss", {
    method: "POST",
    headers: { "content-type": "application/json", "x-cogit-token": token },
    body: JSON.stringify({ dir, sessionId, at }),
  });
  if (!response.ok) {
    const text = (await response.text()).trim();
    throw new Error(text || `could not dismiss the row (HTTP ${response.status})`);
  }
}

/**
 * Moves one captured item to a state the user chose (Story 15.1). The list is
 * local to the project, so this needs the local server; over `file://` the row
 * only says so. The server allows only the user's transitions.
 */
export async function saveCaptureState(
  dir: string,
  id: string,
  state: "open" | "dismissed" | "done",
  token: string,
): Promise<void> {
  const response = await fetch("/api/captures/state", {
    method: "POST",
    headers: { "content-type": "application/json", "x-cogit-token": token },
    body: JSON.stringify({ dir, id, state }),
  });
  if (!response.ok) {
    const text = (await response.text()).trim();
    throw new Error(text || `could not save the item (HTTP ${response.status})`);
  }
}

/**
 * One commit's patch for the message details (Story 10.5). Only the local
 * server answers this; over `file://` the diff rows do not expand.
 */
export async function loadDiff(
  dir: string,
  commit: string,
  file: string | undefined,
  token: string,
): Promise<string> {
  const params = new URLSearchParams({ dir, commit });
  if (file !== undefined) params.set("file", file);
  const response = await fetch(`/api/diff?${params.toString()}`, {
    headers: { "x-cogit-token": token },
    cache: "no-store",
  });
  if (!response.ok) {
    const text = (await response.text()).trim();
    throw new Error(text || `could not read the diff (HTTP ${response.status})`);
  }
  const body = (await response.json().catch(() => null)) as { text?: unknown } | null;
  return typeof body?.text === "string" ? body.text : "";
}

/** One settings write; the server validates the key, the value and the token. */
export async function saveSetting(
  key: string,
  value: unknown,
  token: string,
): Promise<PanelSettings[keyof PanelSettings]> {
  const response = await fetch("/api/config", {
    method: "POST",
    headers: { "content-type": "application/json", "x-cogit-token": token },
    body: JSON.stringify({ key, value }),
  });
  if (!response.ok) {
    const text = (await response.text()).trim();
    throw new Error(text || `could not save (HTTP ${response.status})`);
  }
  const body = (await response.json().catch(() => null)) as {
    value?: PanelSettings[keyof PanelSettings];
  } | null;
  return body?.value ?? (value as PanelSettings[keyof PanelSettings]);
}
