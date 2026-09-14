# MCP workflow

Start with `list_canvases` to discover connected canvas names, including unsaved canvases. Then call `get_scene` (summary) with `canvasName`, then page `items` and `connections` using `offset`/`limit` or filter with `ids`/`group`. The scene revision is required for edits.

`canvasName` selects a live editor, not a saved file. For example, `get_scene({"canvasName":"Payments"})` reads the unsaved Payments canvas immediately after creation. Every canvas tool accepts this target. It is optional when exactly one canvas is connected and required when several are open. Unknown names fail without falling back to another canvas. `get_connection_status` also lists connected canvases.

Names are unique across connected tabs (case-insensitive, Unicode-normalized, and trimmed). New tabs receive a suffix if their initial name is taken; explicit duplicate names are rejected before replacing a document. Renaming updates the MCP target. Closing a tab removes its canvas from discovery; replacing a canvas removes its previous name until Undo restores it. Unsaved canvases are session-only and do not require a file on disk.

Example arguments for `apply_transaction`:

```json
{
  "canvasName": "Payments",
  "baseRevision": 0,
  "upsertItems": [
    {
      "id": "billing",
      "kind": "container",
      "name": "Billing",
      "x": 1100,
      "y": 100,
      "width": 600,
      "height": 400
    },
    {
      "id": "invoices",
      "kind": "service",
      "name": "Invoice service",
      "parentId": "billing",
      "x": 40,
      "y": 90,
      "icon": "server",
      "groups": ["Finance"],
      "details": { "description": "Creates and tracks invoices", "owner": "Finance platform" }
    }
  ],
  "upsertConnections": [
    {
      "id": "invoice-api",
      "source": "orders",
      "target": "invoices",
      "name": "Create invoice",
      "details": {
        "protocol": "gRPC",
        "encoding": "Protobuf v1",
        "request": "CreateInvoice(orderId, amount, currency)",
        "response": "Invoice(id, status)",
        "failure": "Deduplicate by orderId; reconcile ambiguous timeouts",
        "timeout": "2 seconds",
        "security": "mTLS"
      }
    }
  ]
}
```

Use the actual current revision and existing endpoint IDs. Upserts replace a **complete record**, with schema defaults for omitted fields; read the existing record and preserve its fields when editing it. Related nodes and connections can be created in one transaction. `deleteIds` cascades through descendants and incident connections. Parent coordinates are relative, not global.

`focus` takes `ids` and/or a logical `group`. It changes the view, not document geometry. `save_project` writes `<name>.dedalo.json`; `load_project` needs `name` plus the current `baseRevision`. `export_svg` writes a standalone vector file. File `name` arguments allow letters, numbers, underscores, and hyphens; live `canvasName` values also allow spaces and punctuation; existing files are not overwritten.

The tool server needs no API key. Your MCP client provides the AI. Each canvas object, including sketches and symbols, has a `details` object; connections distinguish protocol/transport from encoding/schema.

The server binds to loopback and routes commands to the named editor tab. For save/load/export, pass both `canvasName` (live target) and `name` (file basename). Loading a project whose title belongs to another connected canvas is rejected. An editor disconnect or timeout is an error, not a success. Read the scene before retrying a potentially applied command. It is intentionally not an internet-exposed remote-control endpoint.

Components receive a starter Purpose (`details.description`) when it is omitted. Set `"defaultPurpose": false` on an item to create it with an empty purpose. An explicit `details.description`, including `""`, always takes precedence. The flag and edited purpose persist through saves, imports, and library copies.

## Canvas inspection and NK analysis

Start with get_connection_status, then get_scene and inspect_canvas before edits. get_catalog returns the live library sections and component templates. inspect_canvas returns expanded SVG text and a revision-consistent scene summary; it is not a screenshot.

get_analysis with no arguments returns a parent-scope draft, coupling report and saved-analysis summaries. Pass scopeId for a container's immediate submodules or id to read a saved analysis. Draft generation does not mutate the project.

apply_transaction additionally accepts upsertAnalyses (complete analysis objects) and deleteAnalysisIds. Snapshot references validate against their captured topology; current canvas deletion does not erase prior reviews. See [the NK guide](nk-analysis.md) and [record reference](../skills/dedalo-nk-analysis/references/records.md).
