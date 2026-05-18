import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_RUNTIME_ID, getRuntimeOption, RUNTIME_OPTIONS } from './runtimeRegistry.js';

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
