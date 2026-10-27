import { isLivePage } from "./data.js";

/**
 * The product name in the top bar of every page. On a map served by the local
 * server it leads back to the panel; elsewhere it is plain text.
 */
export function Brand({ home = false }: { home?: boolean }) {
  const label = (
    <>
      cogit<span className="brand-tagline">Cogito, ergo commit.</span>
    </>
  );
  if (home || !isLivePage())
    return (
      <span className="brand" aria-label="cogit">
        {label}
      </span>
    );
  return (
    <a className="brand" href="/" aria-label="cogit: all projects">
      {label}
    </a>
  );
}

/**
 * The way back from a project's map to the panel, under the project switcher. Only
 * a served map has a panel to go back to.
 */
export function BackToPanel() {
  if (!isLivePage()) return null;
  return (
    <a className="back-link" href="/">
      ← All projects
    </a>
  );
}
