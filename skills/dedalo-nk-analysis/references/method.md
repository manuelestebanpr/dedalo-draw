# Theory and measurement

O’Reilly connects stressor exploration and network analysis to architectural decomposition. Residues express differences under environmental stress; the objective concerns adaptation beyond individually predicted events.

Primary sources:
- [O’Reilly 2022: Residuality Theory, random simulation, and attractor networks](https://doi.org/10.1016/j.procs.2022.03.084)
- [O’Reilly 2023: Residuality and Representation](https://oro.open.ac.uk/98044/)
- [Author's research collection](https://www.blacktulip.se/research)

Dedalo is a structured review aid inspired by this work. It does not execute Kauffman Boolean networks, infer attractors, measure bias P, compute a residual index or prove criticality. The impact scale, fields and workflow are Dedalo design choices.

N counts siblings at the selected level. Parent scope uses parentless operational nodes; boundary or expanded-component scope uses immediate children. Ownership is inferred from overlap; geometry changes can therefore alter topology. Descendants collapse into their owning child. State whether containers represent ownership or deployment.

L counts distinct directed interactions. Kᵢ counts incoming neighbors; K̄=L/N (0 for empty scope). Density=L/[N(N−1)] (0 for N<2). Bidirectional arrows add two arcs, parallel interactions count once, self-links are excluded. Delivery arrows may differ from dependency direction; explain the distinction.

External crossings stay visible on drilldown. Notes/strokes/document annotations are excluded; collapsed/offscreen nodes remain. The matrix preview shows up to 60 modules; metrics and component tables cover all.

Evaluate business invariants, ownership, consistency and independent change. Joining may preserve an atomic invariant but concentrate failure; splitting may isolate execution but introduce distributed consistency costs. Asynchrony adds lag, replay and schema obligations.

Question boundaries using incidence patterns: what fails together, what survives together, and what shared resource explains it? High degree prompts investigation, not automatic rejection.

Stressors need an event, duration/load/context, business behavior and evidence. Vary order and combinations where relevant. Unknown is unassessed, not survival. Residues distinguish surviving behavior, adaptation, remaining limits/new coupling and validation evidence.

Freeze a trained candidate before holdout evaluation; compare baseline/candidate under identical held-out conditions. If redesign uses holdout findings, create fresh holdouts. Never invent outcomes or probabilities.

