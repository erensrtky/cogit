import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { LineageViewModel, ViewSwitcherProject } from "../../cli/src/view/model.js";
import { filterSwitcherProjects, recentSwitcherProjects } from "../../cli/src/view/switcher.js";
import { isLivePage } from "./data.js";
import { formatDate, formatTime } from "./format.js";

/**
 * The map's project switcher (Story 8.12): the most recently active projects as
 * a tab strip, and Ctrl/Cmd+K for a search over every registered project. Each
 * entry carries the line that says where its work left off, and choosing one
 * opens that project's map at its own "left off here". Ordering and filtering
 * live in `view/switcher.ts` so they are testable without a DOM.
 */

/** The map of another project, at its HEAD: the server path when served by it. */
export function projectMapHref(entry: ViewSwitcherProject): string {
  const base = isLivePage() ? `/map?dir=${encodeURIComponent(entry.path)}` : entry.lineageUrl;
  return `${base}#focus=head`;
}

/** The key label the user expects; the handler accepts both Ctrl and Cmd. */
function shortcutLabel(): string {
  return /mac/i.test(navigator.platform) ? "⌘ K" : "Ctrl K";
}

export function ProjectSwitcher({ model }: { model: LineageViewModel }) {
  const projects = useMemo(() => model.switcher ?? [], [model.switcher]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => filterSwitcherProjects(projects, query), [projects, query]);
  const recent = recentSwitcherProjects(projects);

  // Ctrl/Cmd+K opens (and closes) the search anywhere on the page; Escape closes.
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
        setQuery("");
        setActive(0);
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (projects.length === 0) return null;

  function go(entry: ViewSwitcherProject): void {
    window.location.href = projectMapHref(entry);
  }

  function onSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, Math.max(results.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const hit = results[active];
      if (hit) go(hit);
    }
  }

  return (
    <div className="switcher">
      <nav className="switcher-tabs" aria-label="Recent projects">
        {recent.map((project) => (
          <a
            key={project.path}
            aria-current={project.current ? "page" : undefined}
            className={project.current ? "switcher-tab is-current" : "switcher-tab"}
            href={projectMapHref(project)}
            title={project.leftOff || project.path}
          >
            <span className="switcher-name">{project.name}</span>
            <span className="switcher-time">{formatDate(project.lastActivity)}</span>
          </a>
        ))}
        <button
          type="button"
          className="switcher-more"
          onClick={() => {
            setOpen(true);
            setQuery("");
            setActive(0);
          }}
          aria-haspopup="dialog"
        >
          Switch project <kbd>{shortcutLabel()}</kbd>
        </button>
      </nav>

      {open ? (
        <div
          className="switcher-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            className="switcher-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Switch project"
          >
            <input
              ref={inputRef}
              className="switcher-input"
              role="combobox"
              aria-expanded="true"
              aria-controls="switcher-results"
              aria-activedescendant={results[active] ? `switcher-${active}` : undefined}
              aria-autocomplete="list"
              placeholder="Search projects by name, path or where you left off…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={onSearchKeyDown}
            />
            {results.length === 0 ? (
              <p className="empty switcher-none">No project matches.</p>
            ) : (
              <ul className="switcher-results" id="switcher-results" role="listbox">
                {results.map((project, index) => (
                  <li
                    key={project.path}
                    id={`switcher-${index}`}
                    role="option"
                    aria-selected={index === active}
                    className={index === active ? "switcher-result is-active" : "switcher-result"}
                    onMouseMove={() => setActive(index)}
                    onClick={() => go(project)}
                  >
                    <span className="switcher-result-head">
                      <span className="switcher-name">{project.name}</span>
                      {project.current ? <span className="badge">current</span> : null}
                      <span className="switcher-time">{formatTime(project.lastActivity)}</span>
                    </span>
                    <span className="switcher-leftoff">
                      {project.leftOff || "Nothing recorded yet."}
                    </span>
                    <span className="switcher-path">{project.path}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="switcher-hint">↑↓ to move · Enter to open · Esc to close</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
