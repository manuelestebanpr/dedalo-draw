# Component catalog and composition

Prefer get_catalog over this shipped mapping when values differ. Section titles are not kinds.

| Section | Templates → kind |
| --- | --- |
| Applications | Service, API gateway, external system, scheduled job, function → service; client, person/actor → client |
| Data & messaging | Database, cache, document store, object storage, search index → database; queue, event stream, topic/pub-sub → queue |
| Infrastructure | Boundary, cluster/network → container; load balancer, identity provider, observability, CI/CD, CDN → service |
| Flowcharts | Start/end → terminal; process/subprocess → process; decision → decision; input/output → input; document → document; swimlane → container |
| Sequence diagrams | Participant/lifeline → participant |
| Annotations | Note → note; freehand → stroke; standalone icon → icon |
| NK analysis workspace | Analysis, stressor, impact, residue are project records, not canvas item kinds. Use get_analysis/upsertAnalyses and the NK analysis button. |

Built-in icons: server, database, browser, queue, cloud, shield, box, code, user, decision, process, terminal, document, network, storage, clock. Brand icons (Java/Spring, PostgreSQL, Kafka, Redis, Kubernetes and others) come from get_catalog. Never use a template title as an icon enum.

Colors: navy, slate, blue, teal, success (lavender), warning, error. Component status and component security are not supported.

Architecture: state whether containers represent ownership or deployment. Parent ownership is inferred by positive-area overlap, preferring the smallest expanded component over a boundary. Boundary/expanded-host ties use the smallest area, existing parent, then ID. Only component cards participate: annotations, standalone icons and sequence participants stay independent. Expanded component hosts cannot parent each other; overlapping hosts remain children of a boundary. Use canContain:true and enlarged card geometry (UI + button) for subcomponents. Read inferred parentId back; its coordinates are relative. The inspector shows Parent read-only above Name. View mode permits inspecting component/connection attributes with mutation controls disabled. Groups support orthogonal concerns and can be selected or added below Purpose. Cards normally measure 240×120. Reserve label-sized gaps (up to 280 px horizontally for wrapped labels), 70–90 px container header inset, and sufficient container dimensions.

Flowcharts: set both kind and shape to process, decision, terminal, input or document; label branches. An MCP item's default card shape does not follow kind automatically.

Sequence: participant cards need sufficient height. sourceOffset/targetOffset are at least 64 and within respective lifeline heights. Increasing offsets represent time; requests solid, returns dashed; direction is explicit. Select a heading to reveal its bottom resize grip; shrink cannot cut off existing messages. The heading +/− control retracts/restores the timeline without deleting messages. Click the timeline body, then another timeline, to create a message at the clicked offsets; click the canvas to cancel.

Connections: endpoint IDs, automatically chosen nearest unobstructed borders, direction one-way/bidirectional, lineStyle solid/dashed. Keep labels concise. Examples, new connections and longer labels reserve readable gaps, shift neighboring cards in the same lane, and grow containing boundaries. Long labels wrap in canvas and image exports. Manual moves/imports retain their layout.

Freehand: stroke needs at least two [x,y] points and may set strokeWidth. Never connect edges to strokes. Notes, strokes and document annotations are excluded from NK topology; operational document-processing systems should be modeled as services.


Canvas inspection: selecting a connection temporarily hides other arrows sharing either endpoint (including projected boundary endpoints). Unrelated arrows remain visible; clear selection to restore all connections. This does not mutate the scene or exports. In Edit mode, trackpad scroll pans and pinch zooms; touchscreen gestures are unchanged.
