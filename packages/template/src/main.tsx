import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { DATA_ELEMENT_ID, type PageModel } from "../../cli/src/view/model.js";
import { App } from "./App.js";
import { isLivePage, loadViewModel, parseViewModel } from "./data.js";
import { Panel } from "./Panel.js";
import "./styles.css";
import { initTheme } from "./theme.js";

initTheme();

/** Re-reads the served page and takes its embedded model; null on any failure. */
async function fetchLatestModel(): Promise<PageModel | null> {
  try {
    const response = await fetch(location.href, { cache: "no-store" });
    if (!response.ok) return null;
    const doc = new DOMParser().parseFromString(await response.text(), "text/html");
    const raw = doc.getElementById(DATA_ELEMENT_ID)?.textContent?.trim();
    return raw ? parseViewModel(raw) : null;
  } catch {
    return null;
  }
}

/**
 * On the local server the page follows rebuilds: swapping the model in place
 * keeps the map's open session, selection and viewport, which a reload would
 * lose. Over `file://` there is no server to ask, so nothing is subscribed.
 */
function Page({ initial }: { initial: PageModel }) {
  const [model, setModel] = useState(initial);

  useEffect(() => {
    if (!isLivePage()) return;
    const source = new EventSource(`/events${location.search}`);
    source.addEventListener("change", () => {
      void fetchLatestModel().then((next) => {
        if (next) setModel(next);
      });
    });
    return () => source.close();
  }, []);

  return model.kind === "lineage" ? <App model={model} /> : <Panel model={model} />;
}

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");

loadViewModel()
  .then((model) => {
    createRoot(root).render(
      <StrictMode>
        <Page initial={model} />
      </StrictMode>,
    );
  })
  .catch((err: unknown) => {
    const message = document.createElement("p");
    message.className = "error";
    message.textContent = err instanceof Error ? err.message : String(err);
    root.replaceChildren(message);
  });
