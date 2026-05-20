import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCombinedSkin,
  getDefaultMergedSkinNames,
  getInitialSkinName,
  getSkinsByName,
  skinHasRenderableAttachments,
} from './skinSelection.js';

test('initial skin keeps a renderable preferred skin', () => {
  const skins = [
    {
      name: 'default',
      attachments: {
        body: {
          body: { type: 'region' },
        },
      },
    },
    {
      name: 'variant',
      attachments: {
        hat: {
          hat: { type: 'mesh' },
        },
      },
    },
  ];

  assert.equal(getInitialSkinName(skins, 'default'), 'default');
});

test('initial skin skips a non-renderable default skin', () => {
  const skins = [
    {
      name: 'default',
      attachments: {
        mask: {
          mask: { type: 'clipping' },
        },
      },
    },
    {
      name: 'a',
      attachments: {
        body: {
          body: { type: 'mesh' },
        },
      },
    },
  ];

  assert.equal(getInitialSkinName(skins, 'default'), 'a');
});

test('renderable skin detection supports runtime attachment entries', () => {
  const skin = {
    name: 'runtime',
    attachments: [
      { attachment: { constructor: { name: 'ClippingAttachment' } } },
      { attachment: { constructor: { name: 'MeshAttachment' }, triangles: [0, 1, 2] } },
    ],
  };

  assert.equal(skinHasRenderableAttachments(skin), true);
});

test('default merged skin names prefer all renderable skins', () => {
  const skins = [
    {
      name: 'default',
      attachments: {
        mask: {
          mask: { type: 'clipping' },
        },
      },
    },
    {
      name: 'a',
      attachments: {
        body: {
          body: { type: 'region' },
        },
      },
    },
    {
      name: 'b',
      attachments: {
        head: {
          head: { type: 'mesh' },
        },
      },
    },
  ];

  assert.deepEqual(getDefaultMergedSkinNames(skins, 'default'), ['a', 'b']);
});

test('skin lookup finds selected skins by name', () => {
  const a = { name: 'a' };
  const b = { name: 'b' };
  const skeletonData = {
    skins: [a, b],
    findSkin(name) {
      return this.skins.find((skin) => skin.name === name);
    },
  };

  assert.deepEqual(getSkinsByName(skeletonData, ['b', 'a']), [b, a]);
});

test('combined skin adds selected skins in order', () => {
  class MockSkin {
    constructor(name) {
      this.name = name;
      this.added = [];
    }

    addSkin(skin) {
      this.added.push(skin.name);
    }
  }

  const combined = createCombinedSkin([new MockSkin('a'), new MockSkin('b')], 'a+b');

  assert.equal(combined.name, 'a+b');
  assert.deepEqual(combined.added, ['a', 'b']);
});
