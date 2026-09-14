---
name: dedalo-nk-analysis
description: Assess parent-module and submodule coupling and perform Barry O’Reilly-inspired residuality analysis in Dedalo using stressor matrices, surviving residues, adaptations, and remaining weaknesses. Use for architectural NK reviews, not statistical residual regression.
---

# Dedalo NK and residuality analysis

Load this file through the host skill loader or read it directly. For live work also load sibling dedalo-live-canvas/SKILL.md and follow connection → named-canvas selection → scene → visual inspection before mutation. Use the selected canvasName for all analysis, scene, transaction, inspection, focus, and save/load/export calls; drafts and revisions must come from that same canvas. Unsaved canvases support analysis immediately while connected. Load skill-creator before revising skill instructions.

Read [method.md](references/method.md) before interpreting metrics, and [records.md](references/records.md) when writing records.

1. Inventory all parent modules and wiring. Ownership follows positive-area overlap; re-read inferred parentId after canvas moves or resizes. Expanded component hosts cannot contain each other. State scope, arrow semantics, external actors and missing dependencies. This first structural pass is the requested baseline; residuality remains iterative.
2. Call get_analysis({canvasName}) for a parent draft. Review N, L, Kᵢ, K̄, adjacency and crossings. Examine cycles, shared state, ownership and coordinated changes. Degree alone does not establish failures or justify merging.
3. For each meaningful boundary or expanded component (canContain:true), call get_analysis({canvasName,scopeId:moduleId}). Review immediate submodules, lifted descendant interactions and external crossings. Include isolated components in coupling/incidence tables.
4. Explore diverse technical, organizational, commercial, regulatory and compound stressors. Separate training and holdout scenarios before evaluating a candidate. Holdouts used for redesign cease to be independent.
5. Fill component × stressor impacts: unknown, unaffected, degraded, failed. Record evidence or assumptions. Reason about indirect/shared-resource effects through contracts; do not automatically propagate failure along every arrow.
6. Add residues linking stressors and participating modules: surviving behavior, adaptations, remaining weaknesses, evidence and hypothesis/tested/rejected status. Residue does not mean unresolved risk.
7. Recommend joins/separations using invariants, ownership and stress evidence, with tradeoffs and concrete tests. Reassess parent and internal coupling after changes using new snapshots.
8. Save complete records with apply_transaction({canvasName,baseRevision,upsertAnalyses:[...]}). Read back using get_analysis({canvasName,id}); open NK analysis for readable tables. Save/export project JSON to retain the review.

Report assumptions, findings, remaining stress and next experiments concisely. Never claim criticality, antifragility, ideal K or successful fault tests from a drawing. The demo is illustrative with proposed tests.

Demo: Settings → Examples → Load NK residuality analysis, then NK analysis → Saved analysis. Includes parent, Orders and Fulfillment submodule reviews. Loading replaces the selected scene as one undoable action and may change its canvasName. Rediscover the name and read its revision before MCP analysis. A title already used by another connected canvas prevents loading.

