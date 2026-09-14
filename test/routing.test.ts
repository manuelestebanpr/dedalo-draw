import test from 'node:test';
import assert from 'node:assert/strict';
import { itemSchema, connectionSchema } from '../src/core/model';
import { routeConnections, crossesInterior, type Point } from '../src/core/routing';
const node = (id: string, x: number, y: number, shape = 'card') => {
  const item = itemSchema.parse({
    id,
    kind: 'service',
    name: id,
    x,
    y,
    width: 160,
    height: 120,
    shape,
  });
  return { item, x, y, width: 160, height: 120 };
};
const edge = (id: string, source: string, target: string) =>
  connectionSchema.parse({ id, source, target });
function sharedLength(a: Point[], b: Point[]) {
  let total = 0;
  for (let i = 1; i < a.length; i++)
    for (let j = 1; j < b.length; j++) {
      const p = a[i - 1],
        q = a[i],
        r = b[j - 1],
        s = b[j];
      if (p.x === q.x && r.x === s.x && p.x === r.x)
        total += Math.max(
          0,
          Math.min(Math.max(p.y, q.y), Math.max(r.y, s.y)) -
            Math.max(Math.min(p.y, q.y), Math.min(r.y, s.y)),
        );
      if (p.y === q.y && r.y === s.y && p.y === r.y)
        total += Math.max(
          0,
          Math.min(Math.max(p.x, q.x), Math.max(r.x, s.x)) -
            Math.max(Math.min(p.x, q.x), Math.min(r.x, s.x)),
        );
    }
  return total;
}
function assertSeparate(routes: ReturnType<typeof routeConnections>) {
  const values = [...routes.values()];
  for (let i = 0; i < values.length; i++) {
    const points = values[i].points;
    for (let k = 1; k < points.length; k++)
      assert.ok(points[k].x === points[k - 1].x || points[k].y === points[k - 1].y);
    for (let k = 2; k < points.length; k++)
      assert.ok(
        (points[k - 1].x - points[k - 2].x) * (points[k].x - points[k - 1].x) +
          (points[k - 1].y - points[k - 2].y) * (points[k].y - points[k - 1].y) >=
          0,
        'no hairpins',
      );
    for (let j = i + 1; j < values.length; j++) {
      assert.equal(sharedLength(points, values[j].points), 0, 'no shared segments');
      for (const p of [points[0], points.at(-1)])
        for (const q of [values[j].points[0], values[j].points.at(-1)])
          assert.notDeepEqual(p, q, 'distinct ports');
    }
  }
}
test('parallel and reverse connections have distinct ports and lanes before and after moving', () => {
  const edges = [edge('1', 'a', 'b'), edge('2', 'a', 'b'), edge('3', 'b', 'a')];
  for (const [x, y] of [
    [420, 0],
    [420, 220],
    [0, 400],
    [-420, 100],
  ]) {
    const nodes = [node('a', 0, 0), node('b', x, y)];
    const routes = routeConnections(nodes, edges);
    assertSeparate(routes);
    assert.deepEqual(
      routes,
      routeConnections(nodes, [...edges].reverse()),
      'stable across input ordering',
    );
  }
});
test('fan-in ports and obstacle detours do not share runs', () => {
  const nodes = [node('a', 0, 0), node('b', 0, 200), node('c', 600, 100), node('block', 300, 80)];
  const routes = routeConnections(nodes, [edge('1', 'a', 'c'), edge('2', 'b', 'c')]);
  assertSeparate(routes);
  for (const route of routes.values())
    for (let i = 1; i < route.points.length; i++)
      assert.equal(crossesInterior(route.points[i - 1], route.points[i], nodes[3]), false);
});
test('diamond ports lie on the visible perimeter', () => {
  const nodes = [node('a', 0, 0, 'decision'), node('b', 420, 0)];
  const routes = routeConnections(nodes, [edge('1', 'a', 'b'), edge('2', 'a', 'b')]);
  assertSeparate(routes);
  for (const route of routes.values()) {
    const p = route.points[0];
    assert.ok(Math.abs(Math.abs(p.x - 80) / 79 + Math.abs(p.y - 60) / 59 - 1) < 1e-8);
  }
});
test('explicit sequence message times are preserved', () => {
  const nodes = [node('a', 0, 0), node('b', 420, 0)].map((n) => ({
    ...n,
    item: { ...n.item, kind: 'participant' as const },
  }));
  const routes = routeConnections(nodes, [
    connectionSchema.parse({
      id: '1',
      source: 'a',
      target: 'b',
      sourceOffset: 80,
      targetOffset: 80,
    }),
  ]);
  assert.equal(routes.get('1')!.points[0].y, 80);
  assert.equal(routes.get('1')!.points.at(-1)!.y, 80);
});
