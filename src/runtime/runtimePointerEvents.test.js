import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime } from './runtimeRegistry.js';

test('Pixi 6 runtime reads pointer button and id from InteractionData', async () => {
  const runtime = await loadRuntime('spine41-pixi6');
  const event = {
    data: {
      button: 0,
      identifier: 27,
      global: { x: 12, y: 34 },
    },
  };

  assert.equal(runtime.getPointerButton(event), 0);
  assert.equal(runtime.getPointerId(event), 27);
  assert.deepEqual(runtime.getPointerGlobal(event), { x: 12, y: 34 });
});

test('Pixi 8 runtime reads pointer button and id from the top-level event', async () => {
  const runtime = await loadRuntime('spine42-pixi8');
  const event = {
    button: 0,
    pointerId: 42,
    global: { x: 56, y: 78 },
  };

  assert.equal(runtime.getPointerButton(event), 0);
  assert.equal(runtime.getPointerId(event), 42);
  assert.deepEqual(runtime.getPointerGlobal(event), { x: 56, y: 78 });
});
