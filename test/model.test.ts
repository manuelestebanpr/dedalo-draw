import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTransaction, validateProject, palette, absolutePositions } from '../src/core/model';
import { sampleProject } from '../src/core/sample';
import { projectSvg } from '../src/core/export';
import { benchmarkProject } from '../src/core/worker-tasks';
import { History } from '../src/core/history';
import { projectCanvas } from '../src/core/projection';

test('nested movement preserves local coordinates and moves descendants', () => {
  const p = sampleProject();
  const parent = p.items.find((i) => i.id === 'platform')!;
  const next = applyTransaction(p, {
    baseRevision: 0,
    upsertItems: [{ ...parent, x: parent.x + 100 }],
  });
  assert.equal(next.items.find((i) => i.id === 'orders')!.x, 35);
  assert.equal(
    absolutePositions(next.items).get('orders')!.x - absolutePositions(p.items).get('orders')!.x,
    100,
  );
});
test('transactions are atomic and reject invalid endpoints, cycles and stale revisions', () => {
  const p = sampleProject();
  const initial = JSON.stringify(p);
  assert.throws(() => applyTransaction(p, { baseRevision: 9 }), /Revision conflict/);
  assert.throws(
    () =>
      applyTransaction(p, {
        baseRevision: 0,
        upsertConnections: [{ ...p.connections[0], target: 'missing' }],
      }),
    /Missing endpoint/,
  );
  assert.throws(
    () =>
      applyTransaction(p, {
        baseRevision: 0,
        upsertItems: [{ ...p.items[0], parentId: 'platform' }],
      }),
    /cycle/,
  );
  assert.equal(JSON.stringify(p), initial);
});
test('delete cascades descendants and incident edges; undo restores them with monotonic revision', () => {
  const p = sampleProject();
  const history = new History();
  history.push(p);
  const next = applyTransaction(p, { baseRevision: 0, deleteIds: ['platform'] });
  assert.equal(next.items.length, p.items.length - 5);
  assert.equal(next.connections.length, 0);
  const restored = history.undo(next);
  assert.deepEqual(restored.items, p.items);
  assert.equal(restored.revision, 2);
  const redone = history.redo(restored);
  assert.equal(redone.revision, 3);
  assert.equal(redone.items.length, p.items.length - 5);
});
test('project round-trip preserves contract fields and templates, rejects future versions', () => {
  const p = sampleProject();
  p.library = [{ ...p.items[1] }];
  delete p.library[0].parentId;
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))), p);
  assert.throws(() => validateProject({ ...p, version: 2 }));
});
test('SVG includes offscreen nodes and escaped details without remote assets', () => {
  const p = sampleProject();
  p.items[1].name = '<script>alert(1)</script>';
  const { svg } = projectSvg(p);
  assert.ok(svg.includes('&lt;script&gt;'));
  assert.ok(!svg.includes('<script>'));
  assert.ok(svg.includes('Protobuf'));
  assert.ok(svg.includes('Order database'));
  assert.ok(!svg.includes('<foreignObject'));
});
test('collapsed and distant views summarize connections and keep canonical data intact', () => {
  const p = sampleProject();
  const distant = projectCanvas(p, '', true);
  assert.equal(distant.nodes.length, p.items.length - 4);
  assert.equal(distant.edges.length, 1);
  assert.equal(distant.edges[0].target, 'platform');
  assert.equal(p.items.length, 8);
  assert.equal(p.connections[0].target, 'orders');
  const grouped = projectCanvas(p, 'Data', false);
  assert.equal(grouped.nodes.find((n) => n.id === 'store')!.data.dim, false);
  assert.equal(grouped.nodes.find((n) => n.id === 'web')!.data.dim, true);
});
test('benchmark generation scales', () => {
  for (const count of [1000, 5000, 10000]) {
    const p = benchmarkProject(count);
    assert.equal(p.items.filter((i) => i.kind !== 'container').length, count);
    assert.equal(projectCanvas(p, '', true).nodes.length, count / 100);
  }
});
function luminance(hex: string) {
  const rgb = hex
    .slice(1)
    .match(/../g)!
    .map((v) => parseInt(v, 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
test('palette text pairs meet WCAG AA normal-text contrast', () => {
  for (const foreground of [
    palette.navy,
    palette.slate,
    palette.blue,
    palette.teal,
    palette.success,
    palette.warning,
    palette.error,
    '#64748B',
  ]) {
    const ratio = (luminance(palette.canvas) + 0.05) / (luminance(foreground) + 0.05);
    assert.ok(ratio >= 4.5, `${foreground}: ${ratio}`);
  }
  assert.ok(1.05 / (luminance(palette.blue) + 0.05) >= 4.5);
});

test('groups normalize and deduplicate across imports, transactions, templates and projections', () => {
  const p = sampleProject();
  const next = applyTransaction(p, {
    baseRevision: 0,
    upsertItems: [{ ...p.items[1], groups: ['CHECKOUT', ' Checkout ', 'checkout', ''] }],
  });
  assert.deepEqual(next.items[1].groups, ['checkout']);
  for (const group of ['CHECKOUT', 'checkout', ' CheckOut ']) {
    assert.equal(
      projectCanvas(next, group, false).nodes.find((n) => n.id === 'orders')!.data.dim,
      false,
    );
  }
});
test('arrow directions persist and agree in canvas and image exports', () => {
  const p = sampleProject();
  const canvas = projectCanvas(p, '', false);
  assert.ok(canvas.edges.find((e) => e.id === 'checkout')!.markerStart);
  assert.equal(canvas.edges.find((e) => e.id === 'publish')!.markerStart, undefined);
  const svg = projectSvg(p).svg;
  assert.equal((svg.match(/marker-start=/g) || []).length, 3);
  const legacy = JSON.parse(JSON.stringify(p));
  delete legacy.connections[0].direction;
  assert.equal(validateProject(legacy).connections[0].direction, 'one-way');
  assert.equal(
    validateProject(JSON.parse(JSON.stringify(p))).connections[0].direction,
    'bidirectional',
  );
});

test('examples have valid editable semantics, cache contracts and ordered sequence messages', async () => {
  const { examples } = await import('../src/core/examples');
  for (const example of examples) {
    const project = example.create();
    assert.deepEqual(validateProject(JSON.parse(JSON.stringify(project))), project);
    const svg = projectSvg(project).svg;
    assert.ok(!svg.includes('undefined'));
    if (['Process flow', 'Decision flow'].includes(example.title)) {
      assert.ok(project.items.every((i) => i.kind !== 'note' && i.details.description));
      assert.ok(project.items.some((i) => i.kind === 'terminal'));
    }
  }
  const spring = examples.find((e) => e.title === 'Spring microservices')!.create();
  const redis = spring.items.find((i) => i.icon === 'redis')!;
  assert.match(redis.details.description, /TTL: 300 seconds/);
  assert.ok(
    spring.connections.some(
      (e) =>
        e.target === redis.id &&
        e.direction === 'bidirectional' &&
        e.details.request.includes('EX 300'),
    ),
  );
  assert.ok(
    spring.connections
      .filter((e) => e.direction === 'bidirectional')
      .every((e) => e.details.request && e.details.response),
  );
  const sequence = examples.find((e) => e.title === 'Sequence diagram')!.create();
  assert.equal(sequence.items.filter((i) => i.kind === 'participant').length, 5);
  assert.equal(sequence.connections.length, 10);
  sequence.connections.forEach((edge, i) => {
    assert.equal(edge.sourceOffset, edge.targetOffset);
    if (i) assert.ok(edge.sourceOffset! > sequence.connections[i - 1].sourceOffset!);
  });
  assert.ok(sequence.connections.some((e) => e.lineStyle === 'dashed'));
  assert.match(projectSvg(sequence).svg, /stroke-dasharray="6 5"/);
  const canvas = projectCanvas(sequence, '', false);
  assert.ok(
    canvas.edges.every((e) => e.sourceHandle?.includes('@') && e.targetHandle?.includes('@')),
  );
  sequence.connections[0].sourceOffset = 10000;
  assert.throws(() => validateProject(sequence), /lifelines/);
});

test('starter purposes honor omissions, explicit blanks, opt-out and template purposes', async () => {
  const { itemSchema, kinds, makeItem } = await import('../src/core/model');
  const { libraryItem, templates } = await import('../src/core/library');
  for (const kind of kinds) {
    const raw = { id: kind, kind, name: kind, x: 0, y: 0 };
    assert.ok(itemSchema.parse(raw).details.description);
    assert.equal(itemSchema.parse({ ...raw, defaultPurpose: false }).details.description, '');
    assert.equal(
      itemSchema.parse({ ...raw, details: { description: '' } }).details.description,
      '',
    );
    assert.equal(
      itemSchema.parse({ ...raw, defaultPurpose: false, details: { description: 'Custom' } })
        .details.description,
      'Custom',
    );
    assert.equal(makeItem(kind, 0, 0, { defaultPurpose: false }).details.description, '');
  }
  for (const template of templates)
    assert.equal(libraryItem(template).details.description, template.subtitle);
});

test('long labels modestly separate components, preserve manual placement and undo', () => {
  const base = validateProject({
    format: 'dedalo-draw',
    version: 1,
    name: 'Spacing',
    items: [
      { id: 'a', kind: 'service', name: 'A', x: 0, y: 0 },
      { id: 'b', kind: 'service', name: 'B', x: 280, y: 0 },
    ],
    connections: [],
  });
  const history = new History();
  history.push(base);
  const next = applyTransaction(base, {
    baseRevision: 0,
    upsertConnections: [
      { id: 'edge', source: 'a', target: 'b', name: 'A moderately long connection label' },
    ],
  });
  const shift = next.items[1].x - base.items[1].x;
  assert.ok(shift > 0);
  assert.ok(next.items[1].x - next.items[0].x - next.items[0].width >= 240);
  assert.equal(next.items[0].x, 0);
  assert.equal(next.items[1].y, 0);
  const repeated = applyTransaction(next, {
    baseRevision: next.revision,
    upsertConnections: next.connections,
  });
  assert.deepEqual(repeated.items, next.items);
  assert.deepEqual(history.undo(next).items, base.items);
  const manual = applyTransaction(next, {
    baseRevision: next.revision,
    upsertItems: [{ ...next.items[1], x: 270 }],
  });
  assert.equal(manual.items[1].x, 270);
  const short = applyTransaction(base, {
    baseRevision: 0,
    upsertConnections: [{ id: 'short', source: 'a', target: 'b', name: 'Request' }],
  });
  assert.ok(short.items[1].x - short.items[0].x - short.items[0].width >= 100);
});

test('label spacing respects nesting, reversed links, vertical links and existing gaps', () => {
  const create = (x: number, y: number) =>
    validateProject({
      format: 'dedalo-draw',
      version: 1,
      name: 'Nested spacing',
      connections: [],
      items: [
        { id: 'a', kind: 'service', name: 'A', x: 0, y: 0 },
        { id: 'boundary', kind: 'container', name: 'Boundary', x, y },
        { id: 'b', kind: 'service', name: 'B', x: 20, y: 60, parentId: 'boundary' },
      ],
    });
  const connect = (base: ReturnType<typeof create>, sourcePort = 'right') =>
    applyTransaction(base, {
      baseRevision: 0,
      upsertConnections: [
        {
          id: 'edge',
          source: 'a',
          target: 'b',
          sourcePort,
          name: 'A moderately long connection label',
        },
      ],
    });
  const nested = connect(create(280, 0));
  assert.ok(nested.items[1].x > 280);
  assert.equal(nested.items[2].x, 20);
  const reversed = connect(create(-280, 0), 'left');
  assert.ok(reversed.items[1].x < -280);
  const vertical = connect(create(0, 160), 'bottom');
  assert.ok(vertical.items[1].y > 160);
  assert.equal(vertical.items[1].x, 0);
  const distant = create(800, 0);
  assert.deepEqual(connect(distant).items, distant.items);
});

test('partial overlap infers ownership, keeps hosts as siblings and releases moved children', () => {
  const base = validateProject({
    format: 'dedalo-draw',
    version: 1,
    name: 'Containment',
    connections: [],
    items: [
      { id: 'boundary', kind: 'container', name: 'Boundary', x: 0, y: 0, width: 1000, height: 800 },
      {
        id: 'host',
        kind: 'service',
        name: 'Host',
        x: 100,
        y: 100,
        width: 500,
        height: 400,
        canContain: true,
      },
      {
        id: 'peer',
        kind: 'service',
        name: 'Peer',
        x: 200,
        y: 200,
        width: 300,
        height: 200,
        canContain: true,
      },
      { id: 'leaf', kind: 'database', name: 'Leaf', x: 590, y: 400, width: 240, height: 120 },
      { id: 'note', kind: 'note', name: 'Note', x: 200, y: 200 },
    ],
  });
  assert.equal(base.items.find((i) => i.id === 'host')!.parentId, 'boundary');
  assert.equal(base.items.find((i) => i.id === 'peer')!.parentId, 'boundary');
  assert.equal(base.items.find((i) => i.id === 'leaf')!.parentId, 'host');
  assert.equal(base.items.find((i) => i.id === 'note')!.parentId, undefined);
  assert.deepEqual(absolutePositions(base.items).get('leaf'), { x: 590, y: 400 });
  const leaf = base.items.find((i) => i.id === 'leaf')!;
  const next = applyTransaction(base, {
    baseRevision: base.revision,
    upsertItems: [{ ...leaf, x: 1000 }],
  });
  assert.equal(next.items.find((i) => i.id === 'leaf')!.parentId, undefined);
  assert.deepEqual(absolutePositions(next.items).get('leaf'), { x: 1100, y: 400 });
  assert.deepEqual(validateProject(base), base);
});

test('automatic routes use facing borders, avoid intervening cards and agree with SVG', async () => {
  const { routeConnection, crossesInterior } = await import('../src/core/routing');
  const { itemSchema, connectionSchema } = await import('../src/core/model');
  const node = (id: string, x: number, y: number) => {
    const item = itemSchema.parse({ id, kind: 'service', name: id, x, y, width: 100, height: 100 });
    return { item, x, y, width: 100, height: 100 };
  };
  const a = node('a', 0, 0),
    b = node('b', 400, 0),
    obstacle = node('c', 180, -20);
  const edge = connectionSchema.parse({ id: 'link', source: 'a', target: 'b', sourcePort: 'left' });
  const direct = routeConnection(a, b, edge);
  assert.equal(direct.sourceSide, 'right');
  assert.equal(direct.targetSide, 'left');
  assert.deepEqual(direct.points, [
    { x: 99, y: 50 },
    { x: 401, y: 50 },
  ]);
  const nodes = [a, b, obstacle],
    routed = routeConnection(a, b, edge, nodes);
  for (let i = 1; i < routed.points.length; i++)
    assert.equal(crossesInterior(routed.points[i - 1], routed.points[i], obstacle), false);
  const vertical = routeConnection(a, node('d', 0, 200), edge);
  assert.equal(vertical.sourceSide, 'bottom');
  assert.equal(vertical.targetSide, 'top');
  const project = validateProject({
    format: 'dedalo-draw',
    version: 1,
    name: 'Routes',
    items: nodes.map((n) => n.item),
    connections: [edge],
  });
  assert.ok(projectSvg(project).svg.includes(`d="${routed.path}"`));
  assert.equal('sourcePort' in edge, false);
});

test('removed component attributes migrate and sequence collapse preserves messages', async () => {
  const { examples } = await import('../src/core/examples');
  const { itemSchema } = await import('../src/core/model');
  const old = itemSchema.parse({
    id: 'old',
    kind: 'service',
    name: 'Old',
    x: 0,
    y: 0,
    status: 'healthy',
    details: { security: 'old value' },
  });
  assert.equal('status' in old, false);
  assert.equal('security' in old.details, false);
  const sequence = examples.find((e) => e.title === 'Sequence diagram')!.create();
  const participant = sequence.items[0];
  const collapsed = applyTransaction(sequence, {
    baseRevision: sequence.revision,
    upsertItems: [{ ...participant, collapsed: true }],
  });
  const view = projectCanvas(collapsed, '', false);
  assert.equal(view.nodes.find((n) => n.id === participant.id)!.height, 64);
  assert.ok(view.edges.every((e) => e.source !== participant.id && e.target !== participant.id));
  assert.deepEqual(collapsed.connections, sequence.connections);
});

test('expanded components support NK submodule analysis and implicit sequence handles exist', async () => {
  const { createAnalysis, coupling } = await import('../src/core/analysis');
  const p = validateProject({
    format: 'dedalo-draw',
    version: 1,
    name: 'Expanded scope',
    connections: [],
    items: [
      {
        id: 'host',
        kind: 'service',
        name: 'Host',
        x: 0,
        y: 0,
        width: 600,
        height: 400,
        canContain: true,
      },
      { id: 'child', kind: 'service', name: 'Child', x: 100, y: 100 },
    ],
  });
  const analysis = createAnalysis(p, 'host');
  assert.equal(analysis.topology.nodes.find((n) => n.id === 'host')!.canContain, true);
  assert.equal(coupling(analysis).N, 1);
  const sequence = validateProject({
    format: 'dedalo-draw',
    version: 1,
    name: 'Default message',
    items: [
      { id: 'first', kind: 'participant', name: 'First', x: 0, y: 0, height: 400 },
      { id: 'second', kind: 'participant', name: 'Second', x: 400, y: 0, height: 400 },
    ],
    connections: [{ id: 'message', source: 'first', target: 'second' }],
  });
  const canvas = projectCanvas(sequence, '', false);
  assert.equal(canvas.edges[0].sourceHandle, 'right@120');
  assert.equal(canvas.edges[0].targetHandle, 'left@120');
  assert.ok(canvas.nodes.every((n) => n.data.messageOffsets!.includes(120)));
});

test('new nested connections reserve readable space and keep siblings within their parent', () => {
  const base = validateProject({
    format: 'dedalo-draw',
    version: 1,
    name: 'Nested labels',
    connections: [],
    items: [
      {
        id: 'host',
        kind: 'service',
        canContain: true,
        name: 'Host',
        x: 0,
        y: 0,
        width: 720,
        height: 320,
      },
      { id: 'a', kind: 'service', name: 'A', parentId: 'host', x: 30, y: 80 },
      { id: 'b', kind: 'service', name: 'B', parentId: 'host', x: 300, y: 80 },
      { id: 'c', kind: 'service', name: 'C', parentId: 'host', x: 560, y: 80 },
    ],
  });
  const next = applyTransaction(base, {
    baseRevision: 0,
    upsertConnections: [
      { id: 'ab', source: 'a', target: 'b', name: 'Publish the accepted order for fulfillment' },
    ],
  });
  const [host, a, b, c] = ['host', 'a', 'b', 'c'].map((id) => next.items.find((i) => i.id === id)!);
  assert.ok(b.x - a.x - a.width >= 240);
  assert.ok(c.x - b.x - b.width >= 20);
  assert.ok(host.width >= c.x + c.width);
  assert.ok([a, b, c].every((i) => i.parentId === 'host'));
  assert.deepEqual(
    applyTransaction(next, { baseRevision: next.revision, upsertConnections: next.connections })
      .items,
    next.items,
  );
});
