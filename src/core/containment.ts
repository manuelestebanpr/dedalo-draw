import type { Item } from './model';

export function canContain(item: { kind: string; canContain?: boolean }) {
  return item.kind === 'container' || (canBecomeParent(item) && !!item.canContain);
}
export function canBecomeParent(item: { kind: string }) {
  return !['container', 'participant', 'stroke', 'note', 'icon'].includes(item.kind);
}
/** World positions first; changing ownership never changes a card's visible position. */
export function inferContainment(items: Item[]): Item[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const positions = new Map<string, { x: number; y: number }>();
  const position = (item: Item): { x: number; y: number } => {
    const cached = positions.get(item.id);
    if (cached) return cached;
    const parent = item.parentId ? byId.get(item.parentId) : undefined;
    const p = parent ? position(parent) : { x: 0, y: 0 };
    const result = { x: p.x + item.x, y: p.y + item.y };
    positions.set(item.id, result);
    return result;
  };
  items.forEach(position);
  const hosts = items.filter((i) => i.kind === 'container' || (canBecomeParent(i) && i.canContain));
  const overlap = (a: Item, b: Item) => {
    const p = positions.get(a.id)!,
      q = positions.get(b.id)!;
    return (
      Math.max(0, Math.min(p.x + a.width, q.x + b.width) - Math.max(p.x, q.x)) *
      Math.max(0, Math.min(p.y + a.height, q.y + b.height) - Math.max(p.y, q.y))
    );
  };
  return items.map((item) => {
    // Boundaries are roots. Expanded component hosts can only belong to a boundary.
    // Annotation strokes never become owned merely because they cross a card.
    const candidates = !canBecomeParent(item)
      ? []
      : hosts.filter(
          (host) =>
            host.id !== item.id &&
            (!item.canContain || host.kind === 'container') &&
            (!host.collapsed || item.parentId === host.id) &&
            ((host.collapsed && item.parentId === host.id) || overlap(item, host) > 0),
        );
    candidates.sort(
      (a, b) =>
        Number(b.kind !== 'container') - Number(a.kind !== 'container') ||
        a.width * a.height - b.width * b.height ||
        Number(b.id === item.parentId) - Number(a.id === item.parentId) ||
        a.id.localeCompare(b.id),
    );
    const parentId = candidates[0]?.id;
    const p = positions.get(item.id)!,
      q = parentId ? positions.get(parentId)! : { x: 0, y: 0 };
    if (parentId === item.parentId && item.x === p.x - q.x && item.y === p.y - q.y) return item;
    const { parentId: _oldParent, ...rest } = item;
    return { ...rest, ...(parentId ? { parentId } : {}), x: p.x - q.x, y: p.y - q.y };
  });
}
