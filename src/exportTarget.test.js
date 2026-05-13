import test from 'node:test';
import assert from 'node:assert/strict';
import { getPngExportTarget } from './exportTarget.js';

test('current export uses the stage so view scale and rotation are included', () => {
  const stage = { label: 'stage' };
  const spineObject = { label: 'spineObject' };

  assert.equal(getPngExportTarget({ mode: 'current', stage, spineObject }), stage);
});

test('setup export keeps using the spine object for an untransformed source image', () => {
  const stage = { label: 'stage' };
  const spineObject = { label: 'spineObject' };

  assert.equal(getPngExportTarget({ mode: 'setup', stage, spineObject }), spineObject);
});
