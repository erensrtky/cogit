# template

Private workspace package: the React app that becomes `lineage.html`. Vite and
`vite-plugin-singlefile` inline every asset, including React Flow's stylesheet and
the bundled ELK layout engine, so the page makes no external requests and works
from `file://`.

## Dev

```bash
npm run dev -w template   # renders src/fixture.ts through the same app
npm run build -w template # writes dist/index.html (embedded by the CLI build)
```

`src/graph.ts` turns the view model into an ELK hierarchy (epoch → session → node)
and returns React Flow nodes with parent-relative positions. Only expanded groups
send their children to ELK; the page opens with the most recent session expanded.

## Layout budget

Measured 2026-10-21 in Chromium from `file://`, 495 nodes across 15 sessions in 3
epochs, every group expanded:
- `elk.layout` for the full hierarchy: 96–155 ms (smaller partial layouts: 15–90 ms).
- The map renders 513 React Flow nodes with no console errors and no long main-thread
  block; collapsing a group re-runs the layout in well under 100 ms.
- Default view of the same project (groups collapsed, latest session expanded): ~41 ms.

`document.documentElement.dataset.layoutMs` always carries the last measured time,
which is how these numbers were read from the built page.
