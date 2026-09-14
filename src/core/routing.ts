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
function anchor(n: RoutingNode, side: Side, offset?: number, fraction = 0.5): Point {
  if (n.item.kind === 'participant')
    return { x: n.x + n.width / 2, y: n.y + Math.min(n.height - 1, Math.max(64, offset ?? 120)) };
  const horizontal = side === 'top' || side === 'bottom';
  let x = horizontal ? n.width * fraction : side === 'left' ? 1 : n.width - 1;
  let y = horizontal ? (side === 'top' ? 1 : n.height - 1) : n.height * fraction;
  if (n.item.shape === 'decision') {
    if (horizontal) {
      const inset = (Math.abs(x - n.width / 2) / (n.width / 2 - 1)) * (n.height / 2 - 1);
      y = side === 'top' ? 1 + inset : n.height - 1 - inset;
    } else {
      const inset = (Math.abs(y - n.height / 2) / (n.height / 2 - 1)) * (n.width / 2 - 1);
      x = side === 'left' ? 1 + inset : n.width - 1 - inset;
    }
  }
  if (n.item.shape === 'input' && !horizontal) {
    const t = (y - 1) / (n.height - 2);
    x =
      side === 'left' ? n.width * 0.12 * (1 - t) + t : (n.width - 1) * (1 - t) + n.width * 0.88 * t;
  }
  if (n.item.shape === 'terminal') {
    const r = Math.min(n.height / 2, (n.width - 2) / 2, (n.height - 2) / 2);
    if (!horizontal) {
      const dy = y - Math.max(1 + r, Math.min(n.height - 1 - r, y));
      const inset = r - Math.sqrt(Math.max(0, r * r - dy * dy));
      x += side === 'left' ? inset : -inset;
    } else {
      const dx = x - Math.max(1 + r, Math.min(n.width - 1 - r, x));
      const inset = r - Math.sqrt(Math.max(0, r * r - dx * dx));
      y += side === 'top' ? inset : -inset;
    }
  }
  if (n.item.shape === 'document' && side === 'bottom') {
    const cubic = (t: number, a: number, b: number, c: number, d: number) =>
      (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d;
    let lo = 0,
      hi = 1;
    for (let i = 0; i < 30; i++) {
      const t = (lo + hi) / 2;
      if (cubic(t, n.width - 1, n.width * 0.65, n.width * 0.35, 1) > x) lo = t;
      else hi = t;
    }
    y = cubic((lo + hi) / 2, n.height - 18, n.height - 42, n.height + 12, n.height - 18);
  }
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
  const result: Point[] = [];
  for (const p of points) {
    const b = result.at(-1),
      a = result.at(-2);
    if (b && p.x === b.x && p.y === b.y) continue;
    if (
      a &&
      b &&
      ((a.x === b.x && b.x === p.x && (b.y - a.y) * (p.y - b.y) > 0) ||
        (a.y === b.y && b.y === p.y && (b.x - a.x) * (p.x - b.x) > 0))
    )
      result.pop();
    result.push(p);
  }
  return result;
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
  options: {
    sourceSide?: Side;
    targetSide?: Side;
    sourceFraction?: number;
    targetFraction?: number;
    occupied?: Point[][];
  } = {},
) {
  const sequence = a.item.kind === 'participant' && b.item.kind === 'participant';
  const self = a.item.id === b.item.id;
  const sourceSides: Side[] = options.sourceSide
    ? [options.sourceSide]
    : a.item.kind === 'participant'
      ? [a.x <= b.x ? 'right' : 'left']
      : sides;
  const targetSides: Side[] = options.targetSide
    ? [options.targetSide]
    : b.item.kind === 'participant'
      ? [a.x <= b.x ? 'left' : 'right']
      : sides;
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
      const start = anchor(a, sourceSide, edge.sourceOffset, options.sourceFraction),
        end = anchor(b, targetSide, edge.targetOffset, options.targetFraction);
      const sv = vectors[sourceSide],
        tv = vectors[targetSide];
      const sourceStub = Math.max(
        20,
        sourceSide === 'left'
          ? start.x - a.x + 20
          : sourceSide === 'right'
            ? a.x + a.width - start.x + 20
            : sourceSide === 'top'
              ? start.y - a.y + 20
              : a.y + a.height - start.y + 20,
      );
      const targetStub = Math.max(
        20,
        targetSide === 'left'
          ? end.x - b.x + 20
          : targetSide === 'right'
            ? b.x + b.width - end.x + 20
            : targetSide === 'top'
              ? end.y - b.y + 20
              : b.y + b.height - end.y + 20,
      );
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
        for (const x of new Set(xs))
          candidates.push([start, s, { x, y: s.y }, { x, y: t.y }, t, end]);
        for (const y of new Set(ys))
          candidates.push([start, s, { x: s.x, y }, { x: t.x, y }, t, end]);
      };
      if (!(self && sequence)) {
        for (const route of options.occupied ?? [])
          for (const p of route) {
            xs.push(p.x - 16, p.x + 16);
            ys.push(p.y - 16, p.y + 16);
          }
        addLanes();
      }
      const valid = (candidate: Point[]) => {
        const points = compact(candidate);
        if (points.length < 2) return false;
        // Reject hairpins: extra lanes must never double back over the same segment.
        for (let i = 2; i < points.length; i++) {
          const a = points[i - 2],
            b = points[i - 1],
            c = points[i];
          if ((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) < 0) return false;
        }
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
      let validOptions = candidates.filter(valid);
      if (!validOptions.length) {
        // Outside lanes route around intervening cards rather than through their contents.
        for (const n of boxes) {
          xs.push(n.x - 24, n.x + n.width + 24);
          ys.push(n.y - 24, n.y + n.height + 24);
        }
        addLanes();
        validOptions = candidates.filter(valid);
      }
      for (const points of validOptions) {
        const clean = compact(points),
          cost =
            length(clean) + (clean.length - 2) * 12 + congestion(clean, options.occupied ?? []);
        if (!best || cost < best.cost) best = { points: clean, cost, sourceSide, targetSide };
      }
    }
  // Intersecting endpoint cards can have no unobstructed route. Keep the route below cards.
  if (!best) {
    const sourceSide: Side = a.x <= b.x ? 'right' : 'left',
      targetSide: Side = a.x <= b.x ? 'left' : 'right';
    const start = anchor(a, sourceSide, edge.sourceOffset, options.sourceFraction),
      end = anchor(b, targetSide, edge.targetOffset, options.targetFraction);
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

/** Penalize shared/nearby parallel runs much more than isolated crossings. */
function congestion(points: Point[], occupied: Point[][]) {
  let cost = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      horizontal = a.y === b.y;
    for (const route of occupied)
      for (let j = 1; j < route.length; j++) {
        const c = route[j - 1],
          d = route[j];
        if (horizontal === (c.y === d.y)) {
          const distance = Math.abs(horizontal ? a.y - c.y : a.x - c.x);
          const overlap = horizontal
            ? Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) -
              Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x))
            : Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) -
              Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y));
          if (distance < 12 && overlap > 0) cost += overlap * 20 * (1 - distance / 12) + 200;
        } else {
          const h1 = horizontal ? a : c,
            h2 = horizontal ? b : d;
          const v1 = horizontal ? c : a,
            v2 = horizontal ? d : b;
          if (
            v1.x > Math.min(h1.x, h2.x) &&
            v1.x < Math.max(h1.x, h2.x) &&
            h1.y > Math.min(v1.y, v2.y) &&
            h1.y < Math.max(v1.y, v2.y)
          )
            cost += 40;
        }
      }
  }
  return cost;
}

/** Allocate ports together, then reserve lanes in stable connection-ID order. */
export function routeConnections(nodes: RoutingNode[], connections: Connection[]) {
  const byId = new Map(nodes.map((n) => [n.item.id, n]));
  const entries = [...connections]
    .sort((a, b) => a.id.localeCompare(b.id))
    .flatMap((edge) => {
      const a = byId.get(edge.source),
        b = byId.get(edge.target);
      if (!a || !b) return [];
      const initial = routeConnection(a, b, edge, nodes);
      return [{ edge, a, b, initial, sourceFraction: 0.5, targetFraction: 0.5 }];
    });
  type Port = { entry: (typeof entries)[number]; source: boolean; order: number };
  const ports = new Map<string, Port[]>();
  for (const entry of entries)
    for (const source of [true, false]) {
      const node = source ? entry.a : entry.b,
        other = source ? entry.b : entry.a;
      if (node.item.kind === 'participant') continue;
      const side = source ? entry.initial.sourceSide : entry.initial.targetSide;
      const key = `${node.item.id}:${side}`;
      const list = ports.get(key) ?? [];
      list.push({
        entry,
        source,
        order:
          side === 'left' || side === 'right'
            ? other.y + other.height / 2
            : other.x + other.width / 2,
      });
      ports.set(key, list);
    }
  for (const list of ports.values()) {
    list.sort((a, b) => a.order - b.order || a.entry.edge.id.localeCompare(b.entry.edge.id));
    list.forEach((port, i) => {
      port.entry[port.source ? 'sourceFraction' : 'targetFraction'] =
        list.length === 1 ? 0.5 : 0.2 + (0.6 * i) / (list.length - 1);
    });
  }
  const result = new Map<string, ReturnType<typeof routeConnection>>();
  const occupied: Point[][] = [];
  for (const entry of entries) {
    const { a, b, edge, initial, sourceFraction, targetFraction } = entry;
    const sequence = a.item.kind === 'participant' && b.item.kind === 'participant';
    const route = sequence
      ? initial
      : routeConnection(a, b, edge, nodes, {
          sourceSide: initial.sourceSide,
          targetSide: initial.targetSide,
          sourceFraction,
          targetFraction,
          occupied,
        });
    result.set(edge.id, route);
    if (!sequence) occupied.push(route.points);
  }
  return result;
}
