import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nkDemo } from '../src/core/nk-demo';
import { coupling, createAnalysis, topologyKey, topologyOf } from '../src/core/analysis';
import { applyTransaction, validateProject } from '../src/core/model';
import { History } from '../src/core/history';

test('demo computes parent aggregation, internal coupling and boundary crossings', () => {
  const p = nkDemo();
  const parent = coupling(p.analyses[0]);
  assert.equal(parent.N, 5);
  assert.equal(parent.L, 5);
  assert.equal(parent.K, 1);
  const order = coupling(p.analyses[1]);
  assert.equal(order.N, 3);
  assert.equal(order.L, 2);
  assert.equal(order.external.length, 4);
  assert.equal(coupling(p.analyses[2]).K, 0.5);
  assert.equal(
    p.analyses[0].stressors
      .find((s) => s.set === 'holdout')!
      .impacts.every((i) => i.state === 'unknown'),
    true,
  );
});
test('parallel edges deduplicate, bidirectional edges count both ways, self edges excluded', () => {
  const a = createAnalysis(nkDemo(), 'orders');
  a.topology.edges.push({ ...a.topology.edges[1], id: 'parallel' });
  a.topology.edges.push({ id: 'self', source: 'api', target: 'api', direction: 'bidirectional' });
  assert.equal(coupling(a).L, 2);
  a.topology.edges[1].direction = 'bidirectional';
  assert.equal(coupling(a).L, 3);
  assert.equal(coupling(a).rows.find((n) => n.id === 'api')!.incoming.length, 1);
});
test('empty and singleton scopes have finite metrics', () => {
  const p = validateProject({
    format: 'dedalo-draw',
    version: 1,
    name: 'Empty',
    items: [],
    connections: [],
  });
  assert.equal(coupling(createAnalysis(p)).K, 0);
  const a = createAnalysis(nkDemo());
  a.topology.nodes = [a.topology.nodes[0]];
  a.topology.edges = [];
  assert.equal(coupling(a).density, 0);
});
test('analysis transactions are atomic, revision guarded, portable and undoable', () => {
  const p = nkDemo(),
    h = new History();
  const a = { ...p.analyses[0], name: 'Reviewed' };
  h.push(p);
  const next = applyTransaction(p, { baseRevision: 0, upsertAnalyses: [a] });
  assert.equal(next.analyses[0].name, 'Reviewed');
  assert.equal(validateProject(JSON.parse(JSON.stringify(next))).analyses.length, 3);
  assert.equal(h.undo(next).analyses[0].name, p.analyses[0].name);
  assert.throws(
    () => applyTransaction(next, { baseRevision: 0, upsertAnalyses: [a] }),
    /Revision conflict/,
  );
  const invalid = structuredClone(a);
  invalid.residues[0].stressorIds = ['missing'];
  assert.throws(
    () => applyTransaction(next, { baseRevision: 1, upsertAnalyses: [invalid] }),
    /residue reference/,
  );
  assert.equal(next.analyses[0].name, 'Reviewed');
});
test('deleting canvas components preserves historical analysis and flags changed topology', () => {
  const p = nkDemo(),
    next = applyTransaction(p, { baseRevision: 0, deleteIds: ['orders'] });
  assert.deepEqual(next.analyses, p.analyses);
  assert.notEqual(topologyKey(topologyOf(next)), topologyKey(p.analyses[0].topology));
  assert.equal(coupling(next.analyses[0]).N, 5);
  const moved = structuredClone(p);
  moved.items[0].x += 100;
  assert.equal(topologyKey(topologyOf(moved)), topologyKey(topologyOf(p)));
});
test('legacy project imports default to no analyses and rejects malformed snapshots', () => {
  const { analyses, ...legacy } = nkDemo();
  assert.deepEqual(validateProject(legacy).analyses, []);
  const p = nkDemo();
  p.analyses[0].topology.nodes[0].parentId = 'missing';
  assert.throws(() => validateProject(p), /hierarchy/);
});
test('rejects duplicate impacts, invalid scope and invalid component membership', () => {
  const p = nkDemo();
  const a = structuredClone(p.analyses[0]);
  a.stressors[0].impacts.push(a.stressors[0].impacts[0]);
  assert.throws(() => validateProject({ ...p, analyses: [a] }), /stressor component/);
  assert.throws(() => createAnalysis(p, 'api'), /boundary/);
  a.stressors[0].impacts = [];
  a.residues[0].componentIds = ['api'];
  assert.throws(() => validateProject({ ...p, analyses: [a] }), /residue reference/);
});
