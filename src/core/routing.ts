import type { Item, Connection } from './model';
import { canContain } from './containment';
export type Point = { x: number; y: number };
export type RoutingNode = { item: Item; x: number; y: number; width: number; height: number };
type Side = 'left' | 'right' | 'top' | 'bottom';
const sides: Side[] = ['left', 'right', 'top', 'bottom'];
const vectors: Record<Side, Point> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};
function anchor(n: RoutingNode, side: Side, offset?: number): Point {
  if (n.item.kind === 'participant')
    return { x: n.x + n.width / 2, y: n.y + Math.min(n.height - 1, Math.max(64, offset ?? 120)) };
  // Side centers are exact perimeter points for cards, diamonds and capsules.
  let x = side === 'left' ? 1 : side === 'right' ? n.width - 1 : n.width / 2;
  let y = side === 'top' ? 1 : side === 'bottom' ? n.height - 1 : n.height / 2;
  if (n.item.shape === 'input') {
    if (side === 'left') x = n.width * 0.06 + 0.5;
    if (side === 'right') x = n.width * 0.94 - 0.5;
  }
  if (n.item.shape === 'document' && side === 'bottom') y = n.height - 15.75;
  return { x: n.x + x, y: n.y + y };
}
export function crossesInterior(
  a: Point,
  b: Point,
  r: { x: number; y: number; width: number; height: number },
) {
  const eps = 0.01;
  if (a.x === b.x)
    return (
      a.x > r.x + eps &&
      a.x < r.x + r.width - eps &&
      Math.max(a.y, b.y) > r.y + eps &&
      Math.min(a.y, b.y) < r.y + r.height - eps
    );
  if (a.y === b.y)
    return (
      a.y > r.y + eps &&
      a.y < r.y + r.height - eps &&
      Math.max(a.x, b.x) > r.x + eps &&
      Math.min(a.x, b.x) < r.x + r.width - eps
    );
  return false;
}
function compact(points: Point[]) {
  return points.filter((p, i) => !i || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
}
function length(points: Point[]) {
  return points
    .slice(1)
    .reduce((sum, p, i) => sum + Math.abs(p.x - points[i].x) + Math.abs(p.y - points[i].y), 0);
}
export function routeConnection(
  a: RoutingNode,
  b: RoutingNode,
  edge: Connection,
  nodes: RoutingNode[] = [],
) {
  const sequence = a.item.kind === 'participant' && b.item.kind === 'participant';
  const self = a.item.id === b.item.id;
  const sourceSides: Side[] =
    a.item.kind === 'participant' ? [a.x <= b.x ? 'right' : 'left'] : sides;
  const targetSides: Side[] =
    b.item.kind === 'participant' ? [a.x <= b.x ? 'left' : 'right'] : sides;
  const obstacles = nodes.filter(
    (n) =>
      n.item.id !== a.item.id &&
      n.item.id !== b.item.id &&
      n.item.kind !== 'stroke' &&
      n.item.kind !== 'participant' &&
      !canContain(n.item),
  );
  // Endpoint boxes are also obstacles, except when one endpoint contains the other.
  const endpointBoxes = [a, b]
    .filter((n) => n.item.kind !== 'participant' && !canContain(n.item))
    .map((n) => ({ ...n, x: n.x + 2, y: n.y + 2, width: n.width - 4, height: n.height - 4 }));
  const boxes = [...endpointBoxes, ...obstacles];
  let best: { points: Point[]; cost: number; sourceSide: Side; targetSide: Side } | undefined;
  for (const sourceSide of sourceSides)
    for (const targetSide of targetSides) {
      if (self && !sequence && sourceSide === targetSide) continue;
      const start = anchor(a, sourceSide, edge.sourceOffset),
        end = anchor(b, targetSide, edge.targetOffset);
      const sv = vectors[sourceSide],
        tv = vectors[targetSide];
      const sourceStub = a.item.shape === 'input' ? Math.max(20, a.width * 0.12) : 20;
      const targetStub = b.item.shape === 'input' ? Math.max(20, b.width * 0.12) : 20;
      const s = { x: start.x + sv.x * sourceStub, y: start.y + sv.y * sourceStub },
        t = { x: end.x + tv.x * targetStub, y: end.y + tv.y * targetStub };
      const candidates: Point[][] =
        !self && (start.x === end.x || start.y === end.y) ? [[start, end]] : [];
      if (self && sequence) {
        const bottom = end.y === start.y ? Math.min(a.y + a.height - 1, start.y + 40) : end.y;
        candidates.push([
          start,
          { x: start.x + 40, y: start.y },
          { x: start.x + 40, y: bottom },
          { x: end.x, y: bottom },
          end,
        ]);
      }
      if (!(self && sequence))
        candidates.push(
          [start, s, { x: t.x, y: s.y }, t, end],
          [start, s, { x: s.x, y: t.y }, t, end],
        );
      const xs = [(s.x + t.x) / 2],
        ys = [(s.y + t.y) / 2];
      const addLanes = () => {
        for (const x of xs) candidates.push([start, s, { x, y: s.y }, { x, y: t.y }, t, end]);
        for (const y of ys) candidates.push([start, s, { x: s.x, y }, { x: t.x, y }, t, end]);
      };
      if (!(self && sequence)) addLanes();
      const valid = (candidate: Point[]) => {
        const points = compact(candidate);
        if (points.length < 2) return false;
        const first = points[1],
          last = points[points.length - 2];
        // Perimeter normals keep routes out of endpoint shapes, including slanted cards.
        if (
          a.item.kind !== 'participant' &&
          (first.x - start.x) * sv.x + (first.y - start.y) * sv.y <= 0
        )
          return false;
        if (b.item.kind !== 'participant' && (last.x - end.x) * tv.x + (last.y - end.y) * tv.y <= 0)
          return false;
        return !points.slice(1).some((p, i) =>
          boxes.some((r) => {
            if (r.item.id === a.item.id && i === 0) return false;
            if (r.item.id === b.item.id && i === points.length - 2) return false;
            return crossesInterior(points[i], p, r);
          }),
        );
      };
      let options = candidates.filter(valid);
      if (!options.length) {
        // Outside lanes route around intervening cards rather than through their contents.
        for (const n of boxes) {
          xs.push(n.x - 24, n.x + n.width + 24);
          ys.push(n.y - 24, n.y + n.height + 24);
        }
        addLanes();
        options = candidates.filter(valid);
      }
      for (const points of options) {
        const clean = compact(points),
          cost = length(clean) + clean.length * 0.1;
        if (!best || cost < best.cost) best = { points: clean, cost, sourceSide, targetSide };
      }
    }
  // Intersecting endpoint cards can have no unobstructed route. Keep the route below cards.
  if (!best) {
    const sourceSide: Side = a.x <= b.x ? 'right' : 'left',
      targetSide: Side = a.x <= b.x ? 'left' : 'right';
    const start = anchor(a, sourceSide, edge.sourceOffset),
      end = anchor(b, targetSide, edge.targetOffset);
    best = {
      points: [
        start,
        { x: (start.x + end.x) / 2, y: start.y },
        { x: (start.x + end.x) / 2, y: end.y },
        end,
      ],
      cost: 0,
      sourceSide,
      targetSide,
    };
  }
  const points = best.points;
  const total = length(points);
  let walked = 0,
    label = points[0];
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1],
      q = points[i],
      len = Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
    if (walked + len >= total / 2) {
      const ratio = len ? (total / 2 - walked) / len : 0;
      label = { x: p.x + (q.x - p.x) * ratio, y: p.y + (q.y - p.y) * ratio };
      break;
    }
    walked += len;
  }
  return { ...best, path: points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' '), label };
}
