import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { loadViewModel } from "./data.js";
import { Panel } from "./Panel.js";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");

loadViewModel()
  .then((model) => {
    createRoot(root).render(
      <StrictMode>
        {model.kind === "lineage" ? <App model={model} /> : <Panel model={model} />}
      </StrictMode>,
    );
  })
  .catch((err: unknown) => {
    const message = document.createElement("p");
    message.className = "error";
    message.textContent = err instanceof Error ? err.message : String(err);
    root.replaceChildren(message);
  });
