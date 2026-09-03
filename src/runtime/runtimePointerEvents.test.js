import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime } from './runtimeRegistry.js';

test('pixi 6 runtime reads pointer button and id from InteractionEvent data', async () => {
  const runtime = await loadRuntime('spine41-pixi6');
  const event = { data: { button: 0, pointerId: 7, global: { x: 1, y: 2 } } };

  assert.equal(runtime.getPointerButton(event), 0);
  assert.equal(runtime.getPointerId(event), 7);
  assert.deepEqual(runtime.getPointerGlobal(event), { x: 1, y: 2 });
  assert.equal(runtime.getPointerButton({ data: { button: 2 } }), 2);
  assert.equal(runtime.getPointerId({ data: { identifier: 3 } }), 3);
});

test('pixi 8 runtime reads pointer button and id from FederatedPointerEvent', async () => {
  const runtime = await loadRuntime('spine42-pixi8');
  const event = { button: 0, pointerId: 5, global: { x: 3, y: 4 } };

  assert.equal(runtime.getPointerButton(event), 0);
  assert.equal(runtime.getPointerId(event), 5);
  assert.deepEqual(runtime.getPointerGlobal(event), { x: 3, y: 4 });
});
