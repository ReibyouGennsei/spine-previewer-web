import assert from 'node:assert/strict';
import test from 'node:test';
import { runRuntimeFrameLoop } from './runtimeFrameLoop.js';

test('runRuntimeFrameLoop advances manual runtimes with ticker delta seconds before rendering', () => {
  const calls = [];
  const runtime = {
    usesManualTicker: true,
    updateSpineObject: (spineObject, deltaSeconds) => calls.push(['update', spineObject.id, deltaSeconds]),
    renderApplication: (app) => calls.push(['render', app.id]),
  };
  const app = { id: 'app', ticker: { deltaMS: 125 } };
  const spineObject = { id: 'spine' };

  runRuntimeFrameLoop({ runtime, app, spineObject, playing: true });

  assert.deepEqual(calls, [
    ['update', 'spine', 0.125],
    ['render', 'app'],
  ]);
});

test('runRuntimeFrameLoop renders manual runtimes without advancing while paused', () => {
  const calls = [];
  const runtime = {
    usesManualTicker: true,
    updateSpineObject: () => calls.push(['update']),
    renderApplication: (app) => calls.push(['render', app.id]),
  };

  runRuntimeFrameLoop({
    runtime,
    app: { id: 'app', ticker: { deltaMS: 16.7 } },
    spineObject: { id: 'spine' },
    playing: false,
  });

  assert.deepEqual(calls, [['render', 'app']]);
});

test('runRuntimeFrameLoop leaves auto-update runtimes to their renderer tick', () => {
  const calls = [];
  const runtime = {
    usesManualTicker: false,
    updateSpineObject: () => calls.push(['update']),
    renderApplication: () => calls.push(['render']),
  };

  runRuntimeFrameLoop({
    runtime,
    app: { id: 'app', ticker: { deltaMS: 16.7 } },
    spineObject: { id: 'spine' },
    playing: true,
  });

  assert.deepEqual(calls, []);
});
