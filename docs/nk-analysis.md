# NK and residuality analysis in Dedalo

The new workspace connects a diagram's wiring to an explicit architectural review: measure parent coupling, inspect internals, apply stressors, then record surviving behavior, adaptations and remaining weaknesses.

## Try the example

1. Run npm run dev and open http://localhost:5174.
2. Open Settings → Examples → Load NK residuality analysis. Loading replaces the current canvas; Undo restores it.
3. Click NK analysis in the top bar.
4. Under Saved analysis, review 01 · Parent modules, 02 · Orders · submodules, then 03 · Fulfillment · submodules.
5. Inspect component coupling, expand the interaction matrix and boundary crossings, and read the recommendations.
6. Review the component × stressor table and residue records. Every demo conclusion is a hypothesis with proposed validation; the holdout remains unknown.
7. Export project JSON from Settings to keep the diagram and analyses. The current session is not automatically saved.

The portable example is [nk-order-platform.dedalo.json](../scenes/nk-order-platform.dedalo.json). Import it through Settings, or use MCP load_project with name "nk-order-platform" and the current baseRevision when the server uses its default scenes directory. Regenerate it after demo changes with node --import tsx scripts/export-nk-demo.ts.

## Create a review

Choose Parent modules as scope and New analysis. This captures topology at the current revision. Give it a name, document assumptions and recommendations, then create further analyses for each meaningful container's immediate submodules.

Add stressors, describe their context, and choose training or holdout. Each table cell records unknown, unaffected, degraded or failed plus evidence. Missing cells mean unassessed. The app does not infer failure propagation from arrows.

Add a residue, select its stressors and participating modules, then record what survives, what changes, what still fails, and the validation evidence. Status starts at hypothesis. Use tested only with concrete observations.

Text fields commit when focus leaves the field; selectors and checkboxes commit immediately. Changes support the editor's Undo/Redo. Removing a stressor also removes its links from residues. Deleting canvas elements preserves historical analyses.

For a candidate, modify the diagram and create a new analysis. The previous one remains available. A warning identifies changed topology; select snapshots to compare them. There is no automatic candidate diff or causal simulation. Geometry changes alone do not mark topology stale.

## What the numbers mean

| Measure | Dedalo convention                                    |
| ------- | ---------------------------------------------------- |
| N       | Immediate modules in the selected scope              |
| L       | Distinct directed interactions between those modules |
| Kᵢ      | Number of distinct incoming neighbors                |
| K̄       | L/N; zero for an empty scope                         |
| Density | L/[N(N−1)]; zero when N < 2                          |

Descendant connections roll up to their owning module. Parallel connections count once; bidirectional connections count in both directions; self-links are excluded. Drilldowns list boundary crossings separately. Notes, freehand and document annotations are excluded; collapsed/offscreen modules remain included. All modules appear in the component table; the dense matrix preview is limited to 60.

These are interaction metrics. An event delivery arrow may point in a different direction from runtime dependency. Record arrow semantics and missing infrastructure before drawing conclusions.

The demo has five parent modules and five directed interactions: N=5, L=5, K̄=1. Orders has three internal submodules and two interactions (K̄≈0.67); Fulfillment has two and one (K̄=0.5). External crossings explain what those internal numbers leave out.

## Theory and architectural purpose

Barry M. O’Reilly's work links stressor exploration and network analysis to architectural decomposition, and describes residues as representations of change under environmental stress. See the primary [2022 paper](https://doi.org/10.1016/j.procs.2022.03.084) and [2023 paper](https://oro.open.ac.uk/98044/).

Dedalo's categorical impacts, record schema and measurement convention are implementation choices inspired by this work. They do not implement a Kauffman Boolean-network simulation, estimate attractors or bias P, calculate a residual index, or establish criticality. Lower K does not prove resilience.

The demo makes several concrete design arguments:

- Keep order state and outbox intent in one atomic transaction and ownership boundary.
- Retain durable acceptance during a broker outage, but account for finite backlog capacity and recovery throughput.
- Represent ambiguous payment outcomes as pending and reconcile them using stable idempotency keys.
- Separate local event deduplication from the harder problem of external carrier effects.
- Question the Fulfillment → Orders callback. Replacing it with a versioned event projection removes one drawn interaction but adds freshness, cancellation and schema responsibilities.
- Keep compound regional/organizational stress as an unassessed holdout, not a fabricated success.

The purpose is to improve decisions about cohesion, boundaries and survivable business behavior. Choose joins or separations from invariants, ownership and evidence rather than score minimization. Freeze a candidate before holdout evaluation; if results drive redesign, use fresh holdouts for further evaluation.

## Skills and MCP

Project source skills:

- [dedalo-live-canvas](../skills/dedalo-live-canvas/SKILL.md): connection checks, current-canvas inspection, catalog, composition and safe revision-aware edits.
- [dedalo-nk-analysis](../skills/dedalo-nk-analysis/SKILL.md): parent-first coupling, internal reviews, stressor incidence and residue documentation.

The installer copies these into project .agents/skills and user CODEX_HOME/skills (default ~/.codex/skills), verifies bytes, and refuses to overwrite different existing skills. Run python3 scripts/install-skills.py after reviewing changed copies.

Example prompts:

    Use $dedalo-live-canvas to inspect the loaded canvas and add an Orders boundary with an API, ledger and outbox relay.

    Use $dedalo-nk-analysis to review parent coupling, then each boundary's internals. Add stressors and residues, distinguish assumptions from tested outcomes, and preserve the baseline.

The skills instruct agents to use a host skill loader when one exists and read SKILL.md directly otherwise. They load sibling guidance only for relevant tasks and skill-creator before skill edits.

New MCP tools:

- get_connection_status: bridge reachability, editor ownership and loaded scene identity.
- get_catalog: live component/section/enum discovery.
- inspect_canvas: revision-consistent expanded SVG plus scene summary, not a viewport screenshot.
- get_analysis: current draft and computed coupling, or a saved review.

apply_transaction now accepts upsertAnalyses and deleteAnalysisIds atomically with architecture edits. Imports, JSON save/load and undo preserve analyses. Historical references validate against the snapshot, not the current canvas. SVG/PNG exports contain architecture, not analysis tables.

The requested Excalidraw skill folder was not found in the accessible home-directory search. This implementation uses the primary sources above.
