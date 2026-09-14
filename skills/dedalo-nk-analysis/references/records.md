# Records

Current MCP schemas are authoritative. Start from get_analysis({canvasName}) on the selected live canvas; do not invent topology. canvasName is a tool argument, not a field in the analysis record. IDs, drafts, and revisions are scoped to that canvas, including when it has not been saved to disk.

Analysis:
- id,name, optional scopeId (boundary or canContain:true component; omit for parent scope), baselineRevision.
- topology: nodes [{id,name,kind,parentId?,canContain?}], edges [{id,source,target,direction}].
- assumptions,recommendations.
- stressors: [{id,name,scenario,set:"training"|"holdout",impacts:[{componentId,state,evidence}]}].
- residues: [{id,name,stressorIds:[],componentIds:[],survives,adaptation,remaining,evidence,status:"hypothesis"|"tested"|"rejected"}].

Impact/residue component IDs must be immediate modules in the selected scope. Stressor references must exist in the same analysis. Missing impact cells render unknown.

    apply_transaction({canvasName,baseRevision:latestSceneRevision,upsertAnalyses:[completeAnalysis]})

Mutation baseRevision and snapshot baselineRevision may differ. Normally commit new architecture first, then request its draft.

get_analysis({canvasName,id}) reads a saved record. Without id it returns a current draft and saved summaries. Select snapshots to compare baseline/candidate or parent/child reviews; there is no automatic causal/diff engine.

Canvas edits do not rewrite historical analyses. Changed names, hierarchy, endpoints or directions produce a stale-topology warning; geometry alone does not, but a move/resize that changes inferred ownership does. Component status was removed; residue validation status remains part of the analysis. Deleted components remain in historical snapshots but cannot be focused on the live canvas.

Save/export JSON retains all analyses. Architecture SVG/PNG does not render their tables. Sessions are not durable until saved/exported.

