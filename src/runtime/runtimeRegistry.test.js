import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RUNTIME_ID,
  getRecommendedRuntimeId,
  getRuntimeCompatibility,
  getRuntimeOption,
  loadRuntime,
  RUNTIME_OPTIONS,
} from './runtimeRegistry.js';

test('runtime registry keeps Spine 4.2 on Pixi 8 as the default', () => {
  assert.equal(DEFAULT_RUNTIME_ID, 'spine42-pixi8');
  assert.equal(getRuntimeOption(DEFAULT_RUNTIME_ID).spineVersion, '4.2');
});

test('runtime registry exposes the Spine 4.1 PixiJS 6 compatibility option', () => {
  const option = getRuntimeOption('spine41-pixi6');

  assert.equal(option.spineVersion, '4.1');
  assert.equal(option.pixiVersion, '6.5.10');
  assert.equal(RUNTIME_OPTIONS.length, 2);
});

test('loadRuntime imports the requested runtime adapter', async () => {
  const runtime = await loadRuntime('spine41-pixi6');

  assert.equal(runtime.id, 'spine41-pixi6');
  assert.equal(typeof runtime.createApplication, 'function');
});

test('runtime registry recommends the runtime that natively supports a skeleton version', () => {
  assert.equal(getRecommendedRuntimeId({ majorMinor: '4.0' }), 'spine41-pixi6');
  assert.equal(getRecommendedRuntimeId({ majorMinor: '4.1' }), 'spine41-pixi6');
  assert.equal(getRecommendedRuntimeId({ majorMinor: '4.2' }), 'spine42-pixi8');
  assert.equal(getRecommendedRuntimeId({ majorMinor: '3.8' }), null);
  assert.equal(getRecommendedRuntimeId(null), null);
});

test('runtime registry reports native, upgradable and unsupported combinations', () => {
  assert.equal(getRuntimeCompatibility('spine41-pixi6', { majorMinor: '4.0' }), 'native');
  assert.equal(getRuntimeCompatibility('spine42-pixi8', { majorMinor: '4.0' }), 'upgradable');
  assert.equal(getRuntimeCompatibility('spine42-pixi8', { majorMinor: '4.0' }, { isBinary: true }), 'unsupported');
  assert.equal(getRuntimeCompatibility('spine41-pixi6', { majorMinor: '4.2' }), 'unsupported');
  assert.equal(getRuntimeCompatibility('spine42-pixi8', null), 'unknown');
});
