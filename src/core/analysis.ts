import { z } from 'zod';
import { canContain } from './containment';
import type { Project } from './model';

const id = z.string().min(1).max(160);
const text = z.string().max(20000);
export const topologySchema = z
  .object({
    nodes: z
      .array(
        z
          .object({
            id,
            name: id,
            kind: id,
            parentId: id.optional(),
            canContain: z.boolean().optional(),
          })
          .strict(),
      )
      .max(50000),
    edges: z
      .array(
        z
          .object({ id, source: id, target: id, direction: z.enum(['one-way', 'bidirectional']) })
          .strict(),
      )
      .max(100000),
  })
  .strict();
export const impactStates = ['unknown', 'unaffected', 'degraded', 'failed'] as const;
export const stressorSchema = z
  .object({
    id,
    name: id,
    scenario: text.default(''),
    set: z.enum(['training', 'holdout']).default('training'),
    impacts: z
      .array(
        z
          .object({ componentId: id, state: z.enum(impactStates), evidence: text.default('') })
          .strict(),
      )
      .max(50000)
      .default([]),
  })
  .strict();
export const residueSchema = z
  .object({
    id,
    name: id,
    stressorIds: z.array(id).max(1000).default([]),
    componentIds: z.array(id).max(50000).default([]),
    survives: text.default(''),
    adaptation: text.default(''),
    remaining: text.default(''),
    evidence: text.default(''),
    status: z.enum(['hypothesis', 'tested', 'rejected']).default('hypothesis'),
  })
  .strict();
export const analysisSchema = z
  .object({
    id,
    name: id,
    scopeId: id.optional(),
    baselineRevision: z.number().int().nonnegative(),
    topology: topologySchema,
    assumptions: text.default(''),
    recommendations: text.default(''),
    stressors: z.array(stressorSchema).max(1000).default([]),
    residues: z.array(residueSchema).max(1000).default([]),
  })
  .strict();
export type Analysis = z.infer<typeof analysisSchema>;
export type Topology = z.infer<typeof topologySchema>;
export function topologyOf(project: Project): Topology {
  const excluded = new Set(['note', 'stroke', 'document']);
  const nodes = project.items
    .filter((i) => !excluded.has(i.kind))
    .map(({ id, name, kind, parentId, canContain }) => ({
      id,
      name,
      kind,
      ...(parentId ? { parentId } : {}),
      ...(canContain ? { canContain } : {}),
    }));
  const ids = new Set(nodes.map((n) => n.id));
  return {
    nodes,
    edges: project.connections
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map(({ id, source, target, direction }) => ({ id, source, target, direction })),
  };
}
export function topologyKey(t: Topology) {
  return JSON.stringify({
    nodes: [...t.nodes].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...t.edges].sort((a, b) => a.id.localeCompare(b.id)),
  });
}
export function createAnalysis(project: Project, scopeId?: string): Analysis {
  const topology = topologyOf(project);
  if (scopeId && !topology.nodes.some((n) => n.id === scopeId && canContain(n)))
    throw new Error('Analysis scope must be a boundary or expanded component');
  return analysisSchema.parse({
    id: crypto.randomUUID(),
    name: scopeId
      ? topology.nodes.find((n) => n.id === scopeId)!.name + ' · submodules'
      : 'Parent modules',
    ...(scopeId ? { scopeId } : {}),
    baselineRevision: project.revision,
    topology,
  });
}
/** Collapse descendants into immediate children of the selected boundary. */
export function coupling(analysis: Analysis) {
  const { nodes, edges } = analysis.topology;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const modules = nodes.filter((n) => n.parentId === analysis.scopeId);
  const moduleIds = new Set(modules.map((n) => n.id));
  const lift = (id: string) => {
    let n = byId.get(id);
    const seen = new Set<string>();
    while (n && !moduleIds.has(n.id)) {
      if (seen.has(n.id)) return undefined;
      seen.add(n.id);
      n = n.parentId ? byId.get(n.parentId) : undefined;
    }
    return n?.id;
  };
  const links = new Map<string, Set<string>>();
  modules.forEach((n) => links.set(n.id, new Set()));
  const external: Topology['edges'] = [];
  for (const e of edges) {
    const a = lift(e.source),
      b = lift(e.target);
    if (a && b && a !== b) {
      links.get(a)!.add(b);
      if (e.direction === 'bidirectional') links.get(b)!.add(a);
    } else if (Boolean(a) !== Boolean(b)) external.push(e);
  }
  const incoming = new Map(modules.map((n) => [n.id, [] as string[]]));
  for (const [source, targets] of links)
    for (const target of targets) incoming.get(target)!.push(source);
  const rows = modules.map((n) => ({
    ...n,
    outgoing: [...links.get(n.id)!],
    incoming: incoming.get(n.id)!,
  }));
  const L = rows.reduce((sum, n) => sum + n.outgoing.length, 0),
    N = rows.length;
  return { rows, L, N, K: N ? L / N : 0, density: N > 1 ? L / (N * (N - 1)) : 0, external };
}
export function validateAnalysis(a: Analysis) {
  const ids = new Set<string>();
  for (const n of a.topology.nodes) {
    if (ids.has(n.id)) throw new Error('Duplicate analysis component');
    ids.add(n.id);
  }
  const nodes = new Map(a.topology.nodes.map((n) => [n.id, n]));
  for (const n of nodes.values()) {
    const seen = new Set([n.id]);
    let parent = n.parentId;
    while (parent) {
      if (seen.has(parent) || !nodes.get(parent) || !canContain(nodes.get(parent)!))
        throw new Error('Invalid analysis hierarchy');
      seen.add(parent);
      parent = nodes.get(parent)!.parentId;
    }
  }
  if (a.scopeId && (!nodes.get(a.scopeId) || !canContain(nodes.get(a.scopeId)!)))
    throw new Error('Invalid analysis scope');
  const edgeIds = new Set<string>();
  for (const e of a.topology.edges) {
    if (edgeIds.has(e.id) || !ids.has(e.source) || !ids.has(e.target))
      throw new Error('Invalid analysis edge');
    edgeIds.add(e.id);
  }
  const scoped = new Set(coupling(a).rows.map((n) => n.id));
  const stressors = new Set<string>();
  for (const s of a.stressors) {
    if (stressors.has(s.id)) throw new Error('Duplicate stressor');
    stressors.add(s.id);
    const impacts = new Set<string>();
    for (const i of s.impacts) {
      if (!scoped.has(i.componentId) || impacts.has(i.componentId))
        throw new Error('Invalid stressor component');
      impacts.add(i.componentId);
    }
  }
  const residues = new Set<string>();
  for (const r of a.residues) {
    if (
      residues.has(r.id) ||
      r.componentIds.some((id) => !scoped.has(id)) ||
      r.stressorIds.some((id) => !stressors.has(id))
    )
      throw new Error('Invalid residue reference');
    residues.add(r.id);
  }
}
