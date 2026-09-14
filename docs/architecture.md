# Architecture

```text
Manual controls ─┐
MCP client → stdio server → loopback bridge → browser command handler
                └── validated transaction → document → canvas projection
                                         ├→ bounded history
                                         └→ JSON / SVG / PNG
Worker ← benchmark generation
```

## Source map

- `src/core/model.ts`: versioned schema, inferred parent relationships, atomic transaction validation, cascade deletion, absolute geometry.
- `src/core/containment.ts`: overlap-based ownership and expanded component hosts.
- `src/core/routing.ts`: shared automatic border anchors and obstacle routing for canvas and exports.
- `src/core/projection.ts`: transforms the architecture model into React Flow nodes/edges. Containment and logical groups are distinct. Collapsed/overview edges reference their original contract.
- `src/core/analysis.ts`: validated historical topology, scoped coupling and stressor/residue records.
- `src/components/AnalysisPanel.tsx`: saved-snapshot selection, coupling/incidence tables and residue editing.
- `src/core/nk-demo.ts`: illustrative order-platform analysis; `scripts/export-nk-demo.ts` generates its portable JSON.
- `src/core/history.ts`: bounded, session-only undo/redo.
- `src/core/export.ts`: renderer-independent vector export and bounded raster export. Off-screen data is included.
- `src/core/library.ts`, `sample.ts`: original local vector symbols and the example architecture.
- `src/core/worker-tasks.ts`, `src/workers/compute.ts`: computation kept off the interaction thread.
- `src/components/CanvasItems.tsx`: memoized component and connection rendering; zoom detail uses a stepped selector.
- `src/components/Inspector.tsx`: component and connection technical forms.
- `src/components/LibraryPanel.tsx`, `CanvasToolbar.tsx`: independent library and tool controls.
- `src/components/FreehandLayer.tsx`: pen sampling outside React document state, committed as one stroke.
- `src/App.tsx`: application composition, interaction state, menus, and command integration.
- `server/bridge.ts`: named authoritative browser connections, bounded requests, timeouts, origin checks. `server/canvas-registry.ts` reserves unique names before document replacement and routes commands to their owning sockets.
- `server/mcp.ts`: stdio tool definitions and file persistence. No AI provider is embedded in the application.
- `vite.config.ts`: production build and no-store response headers for the app.
- `public/sw.js`: retirement worker for legacy offline installations; deletes only Dedalo caches, unregisters, and navigates clients to the live app.

## Editing contract

`Project` owns semantic data; React Flow owns temporary selection and drag state. Drag/resize commits at the end of the gesture. Manual edits and MCP transactions are validated before changing the document. A revision mismatch rejects the entire MCP edit. Failed imports leave the current document untouched.

Project records have stable IDs. Children use parent-relative coordinates after ownership is inferred from positive-area overlap. Expanded hosts cannot parent one another. Moving a parent does not rewrite descendant positions. Validation sorts parents before descendants and rejects cycles, missing parents/endpoints, duplicate IDs, invalid dimensions, and unsupported versions.

Worker results include a source revision check in the caller. If the user edits while computation runs, that result is discarded. Undo/redo always advances the document revision, preventing an old AI edit from becoming valid again.

An MCP acknowledgement reports the committed browser model, not an optimistic bridge broadcast. If a request times out after delivery, its outcome may be unknown: read back before retrying. The bridge does not replay uncertain mutations.

## Extension points

Add a component kind in the schema, its default in `makeItem`, a library entry, and a renderer branch. All kinds share purpose, owner, and normalized groups. Component status/security and manual parent/port controls are removed; the inferred parent is displayed read-only above Name, and View mode disables inspector editing; connection transport and payload fields are shown only for arrows. Add contract fields in `detailsSchema` and the inspector field list; introduce version migrations when changes are incompatible.

Future alternate renderers should consume `Project`, never become the source of truth. A GPU renderer would require additional text editing, selection, accessibility, and export work. Start that only after representative browser profiles justify it.

The prototype's JSON is self-contained for its supported built-in symbols, strokes, and templates. Adding external assets requires an asset table, embedded bytes or portable archive, validation, and both screen/export support.

## Benchmarks

Use production mode. Compare overview, one expanded domain, and dense detail views at 1k/5k/10k. Record device/browser, view, frame intervals, mounted nodes, and load time. The current navigation probe uses requestAnimationFrame and includes application overhead; it does not measure GPU presentation directly. Worker generation time includes messaging and main-thread handoff.

## Session lifecycle

Each load starts from `sampleProject()` with empty history and no custom templates. Files load only through explicit import or MCP load_project. The bridge sends a fresh process-session ID on each connection. A changed ID reloads the browser to fetch current code and reset state; reconnecting to the same ID preserves the open session. No browser autosave or offline app cache is used. Each connected tab registers its current project name. The bridge includes unsaved canvases in discovery and requires an explicit name when several tabs are connected. Name changes reserve the new name before committing; duplicate names and concurrent document changes leave the document and history untouched. Offline local edits register a unique name upon reconnecting before MCP reports ready.

New connections and longer labels reserve space between sibling branches, shift neighboring cards in the affected lane, and grow their containing boundary. Examples use the same spacing helper; ordinary imports and manual moves retain their geometry. Labels wrap in the canvas and SVG/PNG exports.
