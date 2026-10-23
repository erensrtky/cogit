import { DATA_ELEMENT_ID, LIVE_META_NAME, type PageModel } from "../../cli/src/view/model.js";

/** Parses and checks the JSON contract; throws when the shape is not a page. */
export function parseViewModel(text: string): PageModel {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("The embedded codelineage data is not valid JSON.");
  }
  if (typeof value !== "object" || value === null || !("kind" in value)) {
    throw new Error("The embedded codelineage data is not a view model.");
  }
  if (value.kind !== "lineage" && value.kind !== "panel") {
    throw new Error(`Unsupported codelineage view: ${String(value.kind)}`);
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
  throw new Error("No codelineage data in this page. Run `codelineage build`.");
}

/**
 * True only for a page the local map server served. `file://` pages and the
 * Vite dev server must not subscribe: nothing would answer.
 */
export function isLivePage(doc: Document = document): boolean {
  return doc.querySelector(`meta[name="${LIVE_META_NAME}"]`) !== null;
}
