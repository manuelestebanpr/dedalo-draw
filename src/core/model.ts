import { z } from 'zod';
import { analysisSchema, validateAnalysis } from './analysis';
import { canContain, inferContainment } from './containment';
import { brandIcons } from './brands';

export const palette = {
  navy: '#0B1F3A',
  slate: '#475569',
  canvas: '#F8FAFC',
  blue: '#526F91',
  teal: '#487477',
  border: '#CBD5E1',
  success: '#716A84',
  warning: '#806746',
  error: '#956161',
};
export const accentColors = [
  'navy',
  'slate',
  'blue',
  'teal',
  'success',
  'warning',
  'error',
] as const;
export const normalizeGroup = (value: string) => value.trim().toLowerCase();
export const displayGroup = (value: string) =>
  normalizeGroup(value).replace(/\b\p{L}/gu, (c) => c.toUpperCase());
export const matchesGroup = (groups: string[], value: string) =>
  groups.some((g) => normalizeGroup(g) === normalizeGroup(value));
const groupsSchema = z
  .array(z.string().max(80))
  .max(30)
  .default([])
  .transform((values) => [...new Set(values.map(normalizeGroup).filter(Boolean))]);
export const kindColors = {
  service: 'blue',
  database: 'teal',
  client: 'navy',
  queue: 'warning',
  container: 'slate',
  note: 'slate',
  icon: 'error',
  stroke: 'navy',
  process: 'blue',
  decision: 'slate',
  terminal: 'navy',
  input: 'teal',
  document: 'slate',
  participant: 'slate',
} as const;
export function entityColor(entity: {
  color?: (typeof accentColors)[number];
  kind?: keyof typeof kindColors;
}) {
  return palette[entity.color ?? (entity.kind ? kindColors[entity.kind] : 'slate')];
}
export const componentDetailKeys: (keyof Details)[] = ['description', 'owner'];
const id = z.string().min(1).max(160);
const text = z.string().max(20000);
const number = z.number().finite();
export const detailsSchema = z
  .object({
    description: text.default(''),
    protocol: text.default(''),
    encoding: text.default(''),
    request: text.default(''),
    response: text.default(''),
    failure: text.default(''),
    timeout: text.default(''),
    security: text.default(''),
    owner: text.default(''),
  })
  .strict();
export const kinds = [
  'service',
  'database',
  'client',
  'queue',
  'container',
  'note',
  'icon',
  'stroke',
  'process',
  'decision',
  'terminal',
  'input',
  'document',
  'participant',
] as const;
export const icons = [
  'server',
  'database',
  'browser',
  'queue',
  'cloud',
  'shield',
  'box',
  'code',
  'user',
  'decision',
  'process',
  'terminal',
  'document',
  'network',
  'storage',
  'clock',
  ...brandIcons,
] as const;
export const defaultPurposes: Record<(typeof kinds)[number], string> = {
  service: 'Provides a capability to other components.',
  database: 'Stores and retrieves application data.',
  client: 'Lets users interact with the system.',
  queue: 'Delivers messages between components asynchronously.',
  container: 'Groups related components within a system boundary.',
  note: 'Documents a decision, assumption, or context.',
  icon: 'Represents a resource or external system.',
  stroke: 'Highlights or annotates part of the diagram.',
  process: 'Performs an action or operation.',
  decision: 'Chooses the next step based on a condition.',
  terminal: 'Marks the start or end of a flow.',
  input: 'Receives input or presents output.',
  document: 'Represents a document or report.',
  participant: 'Sends and receives messages in this interaction.',
};
const currentItemSchema = z
  .object({
    id,
    kind: z.enum(kinds),
    defaultPurpose: z
      .boolean()
      .default(true)
      .describe(
        'Use a starter purpose when description is omitted. Set false for an empty purpose.',
      ),
    name: z.string().min(1).max(160),
    x: number,
    y: number,
    width: number.min(4).max(100000).default(240),
    height: number.min(4).max(100000).default(120),
    parentId: id.optional(),
    groups: groupsSchema,
    color: z.enum(accentColors).optional(),
    icon: z.enum(icons).default('box'),
    shape: z.enum(['card', 'decision', 'terminal', 'input', 'document', 'process']).default('card'),
    strokeWidth: number.min(0.1).max(1000).optional(),
    canContain: z.boolean().default(false),
    collapsed: z.boolean().default(false),
    points: z
      .array(z.tuple([number, number]))
      .max(100000)
      .optional(),
    details: detailsSchema
      .omit({ security: true })
      .extend({ description: text.optional() })
      .prefault({}),
  })
  .strict()
  .transform((item) => ({
    ...item,
    details: {
      ...item.details,
      description:
        item.details.description ?? (item.defaultPurpose ? defaultPurposes[item.kind] : ''),
    },
  }));
export const itemSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const { status: _legacyStatus, ...item } = value as Record<string, unknown>;
  if (item.details && typeof item.details === 'object' && !Array.isArray(item.details)) {
    const { security: _legacySecurity, ...details } = item.details as Record<string, unknown>;
    item.details = details;
  }
  return item;
}, currentItemSchema);
const currentConnectionSchema = z
  .object({
    id,
    source: id,
    target: id,
    name: z.string().max(160).default('Connection'),
    sourceOffset: number.min(64).max(100000).optional(),
    targetOffset: number.min(64).max(100000).optional(),
    lineStyle: z.enum(['solid', 'dashed']).default('solid'),
    direction: z.enum(['one-way', 'bidirectional']).default('one-way'),
    groups: groupsSchema,
    color: z.enum(accentColors).optional(),
    details: detailsSchema.default(() => detailsSchema.parse({})),
  })
  .strict();
// Import old projects without preserving obsolete manually selected ports.
export const connectionSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const {
    sourcePort: _source,
    targetPort: _target,
    ...connection
  } = value as Record<string, unknown>;
  return connection;
}, currentConnectionSchema);
export const projectSchema = z
  .object({
    format: z.literal('dedalo-draw'),
    version: z.literal(1),
    name: z.string().min(1).max(160),
    revision: z.number().int().nonnegative().default(0),
    items: z.array(itemSchema).max(50000),
    connections: z.array(connectionSchema).max(100000),
    analyses: z.array(analysisSchema).max(100).default([]),
    library: z.array(itemSchema).max(500).default([]),
  })
  .strict();
export type Item = z.infer<typeof itemSchema>;
export type Connection = z.infer<typeof connectionSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Details = z.infer<typeof detailsSchema>;
export type Kind = Item['kind'];
export const transactionSchema = z
  .object({
    baseRevision: z.number().int().nonnegative(),
    upsertItems: z.array(itemSchema).max(50000).default([]),
    upsertConnections: z.array(connectionSchema).max(100000).default([]),
    upsertAnalyses: z.array(analysisSchema).max(100).default([]),
    deleteAnalysisIds: z.array(id).max(100).default([]),
    deleteIds: z.array(id).max(100000).default([]),
  })
  .strict();
export type Transaction = z.infer<typeof transactionSchema>;

/** Shared validation for imports, browser edits and MCP. */
export function validateProject(value: unknown): Project {
  const project = projectSchema.parse(value);
  const items = new Map<string, Item>();
  const ids = new Set<string>();
  for (const entity of [...project.items, ...project.connections]) {
    if (ids.has(entity.id)) throw new Error(`Duplicate ID: ${entity.id}`);
    ids.add(entity.id);
  }
  project.items.forEach((item) => items.set(item.id, item));
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const ordered: Item[] = [];
  function visit(item: Item, depth = 0) {
    if (visited.has(item.id)) return;
    if (visiting.has(item.id)) throw new Error('Parent cycle detected');
    if (depth > 64) throw new Error('Nesting exceeds 64 levels');
    visiting.add(item.id);
    if (item.parentId) {
      const parent = items.get(item.parentId);
      if (!parent || !canContain(parent)) throw new Error(`Invalid parent for ${item.id}`);
      visit(parent, depth + 1);
    }
    if (item.kind === 'stroke' && (!item.points || item.points.length < 2))
      throw new Error('A stroke needs at least two points');
    visiting.delete(item.id);
    visited.add(item.id);
    ordered.push(item);
  }
  project.items.forEach((item) => visit(item));
  for (const edge of project.connections) {
    if (!items.has(edge.source) || !items.has(edge.target))
      throw new Error(`Missing endpoint: ${edge.id}`);
    for (const [endpoint, offset] of [
      [edge.source, edge.sourceOffset],
      [edge.target, edge.targetOffset],
    ] as const) {
      if (
        offset !== undefined &&
        (items.get(endpoint)?.kind !== 'participant' || offset > items.get(endpoint)!.height)
      )
        throw new Error('Message positions must be within participant lifelines');
    }
    if (items.get(edge.source)?.kind === 'stroke' || items.get(edge.target)?.kind === 'stroke')
      throw new Error('Connect components, not strokes');
  }
  const analysisIds = new Set<string>();
  for (const a of project.analyses) {
    if (analysisIds.has(a.id)) throw new Error('Duplicate analysis ID');
    analysisIds.add(a.id);
    validateAnalysis(a);
  }
  const inferred = inferContainment(ordered);
  const inferredMap = new Map(inferred.map((i) => [i.id, i]));
  const result: Item[] = [],
    added = new Set<string>();
  function append(item: Item) {
    if (added.has(item.id)) return;
    if (item.parentId) append(inferredMap.get(item.parentId)!);
    added.add(item.id);
    result.push(item);
  }
  inferred.forEach(append);
  return { ...project, items: result };
}
export function applyTransaction(project: Project, input: unknown): Project {
  const tx = transactionSchema.parse(input);
  if (tx.baseRevision !== project.revision)
    throw new Error(`Revision conflict: expected ${project.revision}; read the scene again`);
  const items = new Map(project.items.map((item) => [item.id, item]));
  const edges = new Map(project.connections.map((edge) => [edge.id, edge]));
  tx.upsertItems.forEach((item) => items.set(item.id, item));
  tx.upsertConnections.forEach((edge) => edges.set(edge.id, edge));
  const deleted = new Set(tx.deleteIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of items.values())
      if (item.parentId && deleted.has(item.parentId) && !deleted.has(item.id)) {
        deleted.add(item.id);
        changed = true;
      }
  }
  deleted.forEach((key) => {
    items.delete(key);
    edges.delete(key);
  });
  for (const edge of edges.values())
    if (deleted.has(edge.source) || deleted.has(edge.target)) edges.delete(edge.id);
  const analyses = new Map(project.analyses.map((a) => [a.id, a]));
  tx.upsertAnalyses.forEach((a) => analyses.set(a.id, a));
  tx.deleteAnalysisIds.forEach((id) => analyses.delete(id));
  const next = validateProject({
    ...project,
    analyses: [...analyses.values()],
    revision: project.revision + 1,
    items: [...items.values()],
    connections: [...edges.values()],
  });
  const previous = new Map(project.connections.map((edge) => [edge.id, edge]));
  let moved = false;
  for (const edge of tx.upsertConnections) {
    const old = previous.get(edge.id);
    if (!old || edge.name.length > old.name.length) {
      moved = separateConnectedItems(next, edge) || moved;
    }
  }
  return moved ? validateProject(next) : next;
}

/** Reserve label space on example creation without moving ordinary imported/manual layouts. */
export function spaceConnectionLabels(project: Project): Project {
  const next = { ...project, items: project.items.map((item) => ({ ...item })) };
  for (const edge of next.connections) separateConnectedItems(next, edge);
  return validateProject(next);
}

/** Move the destination column as a unit so siblings keep their spacing. */
function separateConnectedItems(project: Project, edge: Connection) {
  const items = new Map(project.items.map((item) => [item.id, item]));
  const ancestors = (id: string) => {
    const chain: Item[] = [];
    let item = items.get(id);
    while (item) {
      chain.unshift(item);
      item = item.parentId ? items.get(item.parentId) : undefined;
    }
    return chain;
  };
  const source = ancestors(edge.source),
    target = ancestors(edge.target);
  while (source.length && target.length && source[0].id === target[0].id) {
    source.shift();
    target.shift();
  }
  // Move a sibling branch as a unit; ancestor/descendant connections need no nudge.
  const a = source[0],
    b = target[0];
  if (!a || !b) return false;
  const horizontal =
    Math.abs(b.x + b.width / 2 - a.x - a.width / 2) >=
    Math.abs(b.y + b.height / 2 - a.y - a.height / 2);
  const axis = horizontal ? 'x' : 'y';
  const size = horizontal ? 'width' : 'height';
  const direction = b[axis] + b[size] / 2 >= a[axis] + a[size] / 2 ? 1 : -1;
  const gap = direction > 0 ? b[axis] - a[axis] - a[size] : a[axis] - b[axis] - b[size];
  const desiredGap = horizontal
    ? Math.min(240, edge.name.length * 6.5 + 28) + 40
    : Math.max(80, Math.ceil((edge.name.length + 2) / 34) * 14 + 40);
  const distance = Math.ceil(Math.max(0, desiredGap - gap) / 10) * 10;
  if (!distance) return false;
  const destination = b[axis];
  for (const sibling of project.items) {
    if (
      sibling.parentId === b.parentId &&
      sibling.id !== a.id &&
      (sibling[axis] - destination) * direction >= 0
    ) {
      // Translate only this lane, retaining unrelated rows/columns.
      const cross = horizontal ? 'y' : 'x';
      const crossSize = horizontal ? 'height' : 'width';
      if (
        sibling[cross] < b[cross] + b[crossSize] &&
        sibling[cross] + sibling[crossSize] > b[cross]
      )
        sibling[axis] += direction * distance;
    }
  }
  // Grow the containing boundary instead of accidentally ejecting shifted subcomponents.
  let parent = b.parentId ? items.get(b.parentId) : undefined;
  while (parent) {
    const children = project.items.filter((item) => item.parentId === parent!.id);
    const left = Math.min(0, ...children.map((child) => child.x));
    const top = Math.min(0, ...children.map((child) => child.y));
    if (left || top) {
      parent.x += left;
      parent.y += top;
      parent.width -= left;
      parent.height -= top;
      for (const child of children) {
        child.x -= left;
        child.y -= top;
      }
    }
    parent.width = Math.max(parent.width, ...children.map((child) => child.x + child.width + 40));
    parent.height = Math.max(
      parent.height,
      ...children.map((child) => child.y + child.height + 40),
    );
    parent = parent.parentId ? items.get(parent.parentId) : undefined;
  }
  return distance > 0;
}
export function absolutePositions(items: Item[]) {
  const result = new Map<string, { x: number; y: number }>();
  for (const item of items) {
    const p = item.parentId ? result.get(item.parentId) : undefined;
    result.set(item.id, { x: item.x + (p?.x ?? 0), y: item.y + (p?.y ?? 0) });
  }
  return result;
}
export function makeItem(
  kind: Kind,
  x = 0,
  y = 0,
  options: { defaultPurpose?: boolean } = {},
): Item {
  const names = {
    service: 'Service',
    database: 'Database',
    client: 'Web client',
    queue: 'Message queue',
    container: 'System boundary',
    note: 'Architecture note',
    icon: 'Cloud',
    stroke: 'Sketch',
    process: 'Process',
    decision: 'Decision',
    terminal: 'Start / end',
    input: 'Input / output',
    document: 'Document',
    participant: 'Participant',
  };
  const icon = {
    service: 'server',
    database: 'database',
    client: 'browser',
    queue: 'queue',
    container: 'box',
    note: 'code',
    icon: 'cloud',
    stroke: 'code',
    process: 'process',
    decision: 'decision',
    terminal: 'terminal',
    input: 'document',
    document: 'document',
    participant: 'user',
  };
  return itemSchema.parse({
    id: crypto.randomUUID(),
    kind,
    name: names[kind],
    ...options,
    color: kindColors[kind],
    icon: icon[kind],
    shape: ['process', 'decision', 'terminal', 'input', 'document'].includes(kind) ? kind : 'card',
    x,
    y,
    width: kind === 'container' ? 620 : kind === 'icon' ? 96 : 240,
    height:
      kind === 'participant'
        ? 820
        : kind === 'decision'
          ? 180
          : kind === 'container'
            ? 380
            : kind === 'icon'
              ? 96
              : 120,
  });
}
