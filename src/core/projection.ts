import { canContain } from './containment';
import { routeConnection } from './routing';
import { MarkerType } from '@xyflow/react';
import { matchesGroup, entityColor, absolutePositions, type Project } from './model';
import { type ItemNode, type LinkEdge } from '../components/CanvasItems';
/** Linear projection; logical grouping and containment remain separate concepts. */
export function projectCanvas(
  project: Project,
  group: string,
  overview: boolean,
): { nodes: ItemNode[]; edges: LinkEdge[] } {
  const positions = absolutePositions(project.items);
  const displayHeight = (item: Project['items'][number]) =>
    item.collapsed ? (item.kind === 'participant' ? 64 : 300) : item.height;
  const hidden = new Set<string>(),
    visibleParent = new Map<string, string>();
  const counts = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const item of project.items) {
    if (item.parentId) {
      const names = children.get(item.parentId) || [];
      if (names.length < 5) names.push(item.name);
      children.set(item.parentId, names);
    }
  }
  const matches = new Set(
    project.items.filter((i) => !group || matchesGroup(i.groups, group)).map((i) => i.id),
  );
  const byId = new Map(project.items.map((i) => [i.id, i]));
  // A matching descendant keeps its boundary legible.
  for (const id of [...matches]) {
    let p = byId.get(id)?.parentId;
    while (p) {
      matches.add(p);
      p = byId.get(p)?.parentId;
    }
  }
  for (const item of project.items) {
    if (item.parentId) counts.set(item.parentId, (counts.get(item.parentId) || 0) + 1);
    const parent = item.parentId ? byId.get(item.parentId) : undefined;
    if (parent && (hidden.has(parent.id) || parent.collapsed || overview)) {
      hidden.add(item.id);
      visibleParent.set(item.id, visibleParent.get(parent.id) || parent.id);
    }
  }
  const messageOffsets = new Map<string, Set<number>>();
  for (const edge of project.connections) {
    for (const [id, offset] of [
      [edge.source, edge.sourceOffset],
      [edge.target, edge.targetOffset],
    ] as const) {
      const participant = byId.get(id);
      const messageOffset =
        offset ??
        (participant?.kind === 'participant' ? Math.min(participant.height - 1, 120) : undefined);
      if (messageOffset !== undefined) {
        const offsets = messageOffsets.get(id) || new Set<number>();
        offsets.add(messageOffset);
        messageOffsets.set(id, offsets);
      }
    }
  }
  const nodes: ItemNode[] = project.items
    .filter((item) => !hidden.has(item.id))
    .map((item) => ({
      id: item.id,
      type: 'component',
      position: { x: item.x, y: item.y },
      parentId: item.parentId,
      width: item.width,
      height: displayHeight(item),
      zIndex: item.kind === 'container' ? 0 : canContain(item) ? 2 : 4,
      style: {
        width: item.width,
        height: displayHeight(item),
      },
      data: {
        item,
        messageOffsets: [...(messageOffsets.get(item.id) || [])],
        dim: !!group && !matches.has(item.id),
        count: counts.get(item.id) || 0,
        children: children.get(item.id) || [],
        summarized: overview || item.collapsed,
      },
      ariaLabel: `${item.kind}: ${item.name}`,
    }));
  const seen = new Set<string>();
  const edges: LinkEdge[] = [];
  for (const edge of project.connections) {
    const source = visibleParent.get(edge.source) || edge.source,
      target = visibleParent.get(edge.target) || edge.target;
    const summarized = source !== edge.source || target !== edge.target;
    if (source === target && summarized) continue;
    const key = `${source}:${target}:${edge.direction}`;
    if (summarized && seen.has(key)) continue;
    seen.add(key);
    const a = byId.get(source)!,
      b = byId.get(target)!;
    if ((a.kind === 'participant' && a.collapsed) || (b.kind === 'participant' && b.collapsed))
      continue;
    const route = routeConnection(
      { item: a, ...positions.get(source)!, width: a.width, height: displayHeight(a) },
      { item: b, ...positions.get(target)!, width: b.width, height: displayHeight(b) },
      edge,
    );
    edges.push({
      zIndex: 3,
      id: edge.id,
      type: 'connection',
      source,
      target,
      sourceHandle:
        a.kind !== 'participant'
          ? route.sourceSide
          : `${route.sourceSide}@${edge.sourceOffset ?? Math.min(a.height - 1, 120)}`,
      targetHandle:
        b.kind !== 'participant'
          ? route.targetSide
          : `${route.targetSide}@${edge.targetOffset ?? Math.min(b.height - 1, 120)}`,
      markerEnd: { type: MarkerType.ArrowClosed, color: entityColor(edge), width: 18, height: 18 },
      markerStart:
        edge.direction === 'bidirectional'
          ? {
              type: MarkerType.ArrowClosed,
              color: entityColor(edge),
              width: 18,
              height: 18,
              orient: 'auto-start-reverse',
            }
          : undefined,
      data: {
        connection: edge,
        summarized,
        dim:
          !!group &&
          !matchesGroup(edge.groups, group) &&
          !(matches.has(edge.source) && matches.has(edge.target)),
      },
    });
  }
  return { nodes, edges };
}

/** Focus a component and its owned descendants, without walking dependency edges. */
export function componentScope(items: Project['items'], selected: string): Set<string> {
  if (!items.some((item) => item.id === selected)) return new Set();
  const children = new Map<string, string[]>();
  for (const item of items) {
    if (item.parentId)
      children.set(item.parentId, [...(children.get(item.parentId) || []), item.id]);
  }
  const scope = new Set<string>();
  const pending = [selected];
  while (pending.length) {
    const id = pending.pop()!;
    if (scope.has(id)) continue;
    scope.add(id);
    pending.push(...(children.get(id) || []));
  }
  return scope;
}
