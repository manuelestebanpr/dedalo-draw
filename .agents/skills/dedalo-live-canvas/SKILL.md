---
name: dedalo-live-canvas
description: Inspect and edit a Dedalo live canvas through MCP, including architecture, flowchart, sequence, and deployment diagrams. Use for Dedalo drawing requests, not generic image generation.
---

# Dedalo live canvas

Load this file with the host skill loader when available, otherwise read it directly from the discovered skill directory. Resolve references relative to this folder. Mentioning a skill name does not load its instructions. For NK work also load sibling dedalo-nk-analysis/SKILL.md. Before editing these skills, load the available skill-creator skill.

## Inspect first

1. Discover Dedalo MCP tools; the namespace prefix varies by host.
2. Call get_connection_status and list_canvases. Each connected tab exposes its live canvas, including unsaved canvases. Select the canvas matching the user’s request and pass its canvasName to every subsequent canvas tool. If the target is unspecified and only one canvas is connected, use that name; if several are connected and context does not identify one, ask which canvas. Unknown names fail without fallback. If the bridge or editor is unavailable, report the error; do not claim live edits. Default setup: npm run dev in the project, open http://localhost:5174, connect MCP using npm run mcp.
3. Call get_scene with canvasName and view:"summary", then page items and connections for the affected area. Read every page for whole-canvas reviews. Restart the read if revisions differ across pages. Revisions and entity IDs belong to the selected canvas; never reuse them from another canvas.
4. Call inspect_canvas for the expanded document SVG; render with the host's SVG/browser viewer when available. It is not a viewport screenshot. If visual rendering is unavailable, review scene geometry and state that limitation. For large scenes use filtered pages and a named export_svg file.
5. Read [components.md](references/components.md) and call get_catalog for current sections, templates, kinds, icons and colors.

## Draw and verify

- Preserve existing work unless replacement/deletion was requested. Use stable unused IDs.
- apply_transaction requires the latest baseRevision. Upserts are complete records, not patches; read and merge existing records before editing. Related additions belong in one transaction (one undo step).
- Use container for domain/section boundaries. Ownership is inferred from any positive-area overlap with a component. Read back parentId and relative coordinates after moving/resizing. Expanded components (canContain:true) can own ordinary components but never other expanded components; boundaries remain roots. Groups highlight relationships without establishing parents.
- Ports and component status/security are removed; border routing is automatic. Component groups appear below Purpose.
- Include meaningful purpose/owner and connection protocol, request/response, failure/timeout/security details where known. Identify assumptions.
- Read edited entities back, inspect_canvas after layout changes, and focus the result.
- If a canvas is renamed, replaced, or disconnected, rediscover the intended target before continuing; do not switch to another tab implicitly. On revision conflict re-read and reconcile. On timeout/disconnection inspect IDs and contents before retrying; never blindly replay.
- save_project preserves JSON when requested; load_project replaces the targeted live scene with a revision guard. Pass canvasName for the live target and name for the file basename; these are distinct. File names allow letters, numbers, underscores and hyphens; saves never overwrite. JSON retains analyses; SVG/PNG render architecture only.

## Canvas lifecycle

Settings → New canvas asks for a name (1–160 characters) and replaces the current diagram, analyses, and custom templates with an empty canvas. Undo restores the previous canvas. The new unsaved canvas is immediately accessible to MCP while connected; saving a file is not a prerequisite. The current MCP toolset has no create/new-canvas tool; use the UI when creation is requested.

Names are unique across connected tabs, ignoring case, surrounding spaces, and Unicode compatibility differences. Explicit duplicates are rejected before replacement, including rename, import, load, and Undo/Redo conflicts. New tabs receive a numeric suffix if their initial name is taken. Replacing a canvas removes its old name from discovery until restored; closing its tab disconnects it. Export/save is needed for durability. Offline local changes register a unique name on reconnect before MCP is ready.

If the available tools lack list_canvases or canvasName, the running MCP server may predate this workflow. Explain that the app/bridge and MCP connection need restarting; preserve unsaved work before a restart, which reloads connected editors.

Read [tools.md](references/tools.md) for payloads.

