import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CanvasRegistry } from '../server/canvas-registry';

test('live names are unique, including simultaneous pending name changes', () => {
  const registry = new CanvasRegistry<string>();
  assert.equal(registry.register('first', 'Architecture'), 'Architecture');
  assert.equal(registry.register('second', 'architecture'), 'architecture (2)');
  assert.equal(registry.resolve(' ARCHITECTURE '), 'first');
  assert.throws(() => registry.resolve(), /Multiple canvases/);
  registry.reserve('first', 'New canvas');
  assert.throws(() => registry.reserve('second', ' NEW CANVAS '), /already open/);
  assert.throws(() => registry.reserve('second', 'Ｎｅｗ ｃａｎｖａｓ'), /already open/);
  assert.equal(registry.resolve('Architecture'), 'first');
  assert.throws(() => registry.resolve('New canvas'), /No connected canvas/);
  registry.activate('first', 'New canvas');
  assert.equal(registry.resolve('new canvas'), 'first');
  assert.throws(() => registry.resolve('Architecture'), /No connected canvas/);
  registry.remove('first');
  assert.equal(registry.reserve('second', 'New canvas'), 'New canvas');
  registry.activate('second', 'New canvas');
  assert.equal(registry.resolve(), 'second');
});

test('cancelled reservations and disconnected editors release names', () => {
  const registry = new CanvasRegistry<number>();
  registry.register(1, 'First');
  registry.register(2, 'Second');
  registry.reserve(1, 'Reserved');
  registry.activate(1, 'First');
  registry.reserve(2, 'Reserved');
  registry.remove(2);
  registry.reserve(1, 'Reserved');
  assert.throws(() => registry.reserve(1, '   '), /1–160/);
  assert.throws(() => registry.reserve(1, 'x'.repeat(161)), /1–160/);
  assert.throws(() => registry.activate(1, 'Unreserved'), /not reserved/);
});
