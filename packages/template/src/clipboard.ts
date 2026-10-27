/** Copy state shared by the hash and resume buttons. */
export type CopyState = "idle" | "copied" | "failed";

/**
 * `navigator.clipboard` is unavailable or rejected in some `file://` contexts,
 * so fall back to the hidden-textarea + `execCommand("copy")` path.
 * Returns false when both fail, letting the caller select the text instead.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }

  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  } catch {
    return false;
  }
}
