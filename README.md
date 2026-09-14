# Dedalo Draw

A local-first architecture editor. Draw by hand or through MCP, model nested systems, and inspect the contracts behind connections.

On mobile, the header contains the logo and Settings. Start in **View** to pan and pinch without editing. Choose **Edit**, then double-tap an empty canvas area to open the component library there. Tap outside to dismiss it. **Free style** starts drawing; **Done drawing** returns to component editing. The editor supports touch-sized controls and scrollable details.

**Settings → New canvas** creates an empty, named canvas and keeps the previous diagram in Undo. Names must be unique across connected tabs, ignoring capitalization and surrounding spaces. New tabs with the same initial name receive a numeric suffix. Creating, renaming, importing, loading examples, and Undo/Redo check name availability before replacing the current document. Unsaved canvases are available to MCP while their tabs remain connected; export to keep them across sessions.

**Settings → Examples** provides previews and loadable system-context, Spring microservice, process, decision, deployment, and sequence diagrams. The Spring example documents cache-aside reads, frontend responses, a 300-second Redis TTL, invalidation, and outbox delivery. The sequence example shows a cache miss with editable participant lifelines and ordered request/response messages. Loading replaces the canvas and can be undone. Freehand paths retain their sampled geometry and visible pen width without grid snapping, smoothing, or recognition.

Component details show the calculated Parent above Name, followed by Purpose, Groups and Owner. View mode allows inspecting these attributes but disables edits. Parent ownership follows any partial overlap with a boundary or expanded component. Use the card **+** to enlarge it for subcomponents; expanded components cannot own each other. Examples and new connections reserve label-sized gaps, moving neighboring components and growing boundaries when necessary. Long labels wrap. Sequence headings provide **+/−** timeline controls; select a heading to resize its bottom edge, or click two timeline bodies to add a message.

Selecting an arrow hides every other arrow and highlights its line, arrowheads, and label in palette navy (teal when the original color is navy). Selecting a component instead shows arrows touching that component or its owned descendants. Clearing selection restores all arrows and their original colors. These are temporary view effects; saved diagrams and exports retain every connection and its configured color. In Edit mode, two-finger trackpad scrolling pans the canvas and pinch gestures zoom; touch dragging and pinching retain their existing behavior.

## Run

Requires **Node.js 22.12+** and npm. Windows, macOS, and Linux use the same commands.

```sh
npm ci
npm run build
npm start
```

Open **http://localhost:5174**. The command starts the web app and its loopback-only MCP bridge (port **4783**). Excalidraw on port 3000 can run alongside it. Stop both Dedalo processes with Ctrl+C.

For development, use `npm run dev`. After changing code, rebuild before using `npm start`. Reload fetches the current server build with caching disabled. Existing offline service workers are retired automatically. Restarting the bridge causes connected editors to reload into the example diagram.

## Use

- Choose a component from the grouped, searchable library. Select it to edit its name, explicit color, shape, technical details, and embedded symbol or technology logo. Library categories start closed. Color, symbol/logo, and shape controls are at the bottom of details, with symbol and logo pickers collapsed by default. The toolbar library toggle is the only desktop show/hide control.
- Move a component into a boundary or expanded component to infer its parent. The inspector displays **Parent** as read-only; subsequent parent moves carry its children. Duplicate and delete include descendants and internal connections.
- Drag between the four ports to connect components. Click an arrow to edit protocol, encoding, request, response, failure behavior, timeout, security, and ownership.
- **V** selects, **H** pans, **P** draws freehand. Scroll/pinch to zoom; middle/right drag pans. Shift selects multiple items. Delete removes the selection. Ctrl/Cmd+Z undoes; add Shift to redo.
- **Save to library** makes a reusable component template for the current session. A boundary template contains the boundary itself, not its descendants.
- **Highlight group** dims unrelated items. Components can belong to multiple groups independently of their parent. Search jumps to a component.
- Collapse boundaries in the inspector. Below 22% zoom, nested internals automatically become an overview; zoom in to see details.
- Connection arrow types support one-way events and bidirectional request/response flows.

## Save and move between PCs

Every page load starts with the example. Diagrams, custom library templates, and undo history stay in memory for the current session only. **Settings → Save project** creates a versioned `.dedalo.json` file containing the complete editable model, connection details, sketches, and templates. Import that file explicitly to resume it, including after reloading or restarting the server.

**Export SVG** and **Export PNG** include the full expanded document, including off-screen items. SVG is self-contained and includes project metadata. Re-import uses `.dedalo.json`; image exports are for presentation. Large PNGs scale down to a maximum dimension of 8192 pixels / 24 megapixels; SVG retains vector detail. Built-in symbols are original bundled SVG paths; 23 technology logos are bundled from Simple Icons v16 (CC0-1.0, see public/brands/NOTICE.md). Neither requires a CDN. There are no runtime font downloads.

The server must be running to load the app. No offline app cache or automatic browser-storage restore is used. Local editing needs no AI service; MCP needs the local bridge. Exported files are the way to keep work across sessions. There is no automatic cross-PC synchronization.

## Connect AI through MCP

Start the app and leave your canvas tabs open. Register the server with your MCP client using the included `.mcp.json`, or adapt this portable example to the checkout path:

```json
{
  "mcpServers": {
    "dedalo-draw": {
      "command": "node",
      "args": [
        "/absolute/path/dedalo-draw/node_modules/tsx/dist/cli.mjs",
        "/absolute/path/dedalo-draw/server/mcp.ts"
      ]
    }
  }
}
```

Tools: `get_scene`, `apply_transaction`, `focus`, `save_project`, `load_project`, `export_svg`.

The intended workflow is **read → edit at that revision → read back**. One transaction is one undo step. Each open tab registers its live canvas, including unsaved canvases. Use `list_canvases` to discover names and pass `canvasName` to target reads, edits, analysis, save/load, and exports. With multiple canvases open, omitting the target is rejected. The bridge rejects foreign browser origins and binds only to loopback. It is not an authenticated internet service.

See [MCP examples](docs/mcp.md). `DEDALO_BRIDGE_PORT` configures the bridge/server and `VITE_DEDALO_BRIDGE_PORT` the web build. `DEDALO_WEB_PORT` changes the bridge's allowed web origin (also change the Vite port). `DEDALO_SCENES_DIR` changes the MCP save directory; default is `scenes/` here. Existing saved files are never silently overwritten.

## Performance prototype

Open **Settings → Performance** to generate 1k, 5k, or 10k components, plus their boundaries and connections. Generation runs in a Web Worker. The canonical document remains complete; overview rendering hides internals and summarizes connections. Viewport culling limits mounted nodes when zoomed in. Detailed text is omitted at lower zoom levels.

**Measure current view** pans for three seconds and reports observed animation-frame frequency and p95 frame interval. This is a browser responsiveness probe, not a GPU or presented-frame profiler. Test both overview and zoomed-in views on the least powerful target PC. Results depend on hardware, browser, visible items, and development vs production mode. No universal 60 FPS claim is made.

## Maintain

```sh
npm test                 # model, exports, hierarchy, history, palette
npm run build            # TypeScript + production bundle
npx playwright install chromium  # first browser-test setup only
npm run test:e2e          # with npm start running in another terminal
npm run format
npm run format:check
```

See [architecture](docs/architecture.md) and [palette rationale](docs/palette.md). The dependency lockfile is committed to the project files; use `npm ci` for reproducible installs.

## Deliberate prototype limits

- React Flow uses DOM/SVG, not a WebGL/WebGPU scene renderer. Workers perform computations, not DOM rendering.
- Connectors choose facing borders automatically and route around ordinary cards. Selection keeps arrows below component cards. Draggable routing waypoints are not implemented.
- Collapsed/overview parallel connections show a representative connection per direction type, not a merged contract.
- No real-time collaboration, automatic sync, sketch recognition, Excalidraw importer, or arbitrary image/font ingestion. Library symbols are bundled with the app.
- Text export uses a portable system-font approximation. PNG/SVG exports show the expanded document rather than the current collapsed/highlighted view.
- History is session-only and bounded (30 snapshots, reduced for large documents). Export before reloading, restarting the server, or replacing the document with a benchmark.

## NK and residuality analysis

Open **NK analysis** for parent/submodule coupling tables, stressor incidence and residue records. Load the **NK residuality analysis** example from Settings → Examples for a complete order-platform review. JSON export retains all analysis snapshots.

See the [usage and theory guide](docs/nk-analysis.md), [live-canvas skill](skills/dedalo-live-canvas/SKILL.md), and [NK skill](skills/dedalo-nk-analysis/SKILL.md). Install reviewed project/user skill copies with python3 scripts/install-skills.py.
