import assert from 'node:assert/strict';
import test from 'node:test';
import { loadRuntime } from './runtimeRegistry.js';

test('Pixi 6 runtime exposes hooks to update a loaded spine object and flush a render frame', async () => {
  const runtime = await loadRuntime('spine41-pixi6');
  const calls = [];

  assert.equal(runtime.usesManualTicker, true);
  runtime.updateSpineObject({ update: (delta) => calls.push(['update', delta]) }, 0);
  runtime.renderApplication({ render: () => calls.push(['render']) });

  assert.deepEqual(calls, [
    ['update', 0],
    ['render'],
  ]);
});

test('Pixi 8 runtime exposes the same frame flush hooks for the shared app flow', async () => {
  const runtime = await loadRuntime('spine42-pixi8');
  const calls = [];

  runtime.updateSpineObject({ update: (delta) => calls.push(['update', delta]) }, 0);
  runtime.renderApplication({ render: () => calls.push(['render']) });

  assert.deepEqual(calls, [
    ['update', 0],
    ['render'],
  ]);
});
