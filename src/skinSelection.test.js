import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCombinedSkin,
  getAttachmentTypeName,
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

test('renderable skin detection handles pixi-spine numeric types and bundler-renamed constructors', () => {
  class RegionAttachment2 {
    constructor() {
      this.type = 0;
      this.name = 'body';
      this.region = { texture: { baseTexture: { resource: {} } } };
    }
  }
  const region = new RegionAttachment2();
  // Runtime textures reference each other; walking them must never happen.
  region.region.texture.baseTexture.resource.baseTexture = region.region.texture.baseTexture;
  region.region.texture.baseTexture.owner = region;

  const skin = { name: 'default', attachments: [undefined, { body: region }] };

  assert.equal(skinHasRenderableAttachments(skin), true);
});

test('renderable skin detection rejects non-renderable numeric attachment types', () => {
  const skin = { name: 'default', attachments: [{ mask: { type: 6, name: 'mask', vertices: [] } }] };

  assert.equal(skinHasRenderableAttachments(skin), false);
});

test('renderable skin detection does not overflow on cyclic containers', () => {
  const container = { name: 'a', nested: {} };
  container.nested.parent = container;
  const skin = { name: 'default', attachments: { slot: container } };

  assert.equal(skinHasRenderableAttachments(skin), false);
});

test('getAttachmentTypeName maps strings, enum numbers and constructor names', () => {
  assert.equal(getAttachmentTypeName({ type: 'Mesh' }), 'mesh');
  assert.equal(getAttachmentTypeName({ type: 0 }), 'region');
  assert.equal(getAttachmentTypeName({ type: 2 }), 'mesh');
  assert.equal(getAttachmentTypeName({ constructor: { name: 'ClippingAttachment3' } }), 'clipping');
  assert.equal(getAttachmentTypeName({ constructor: { name: 'BoundingBoxAttachment' } }), 'boundingbox');
  assert.equal(getAttachmentTypeName({ triangles: [0, 1, 2] }), 'mesh');
  assert.equal(getAttachmentTypeName({ worldVerticesLength: 8 }), 'region');
  assert.equal(getAttachmentTypeName(null), '');
  assert.equal(getAttachmentTypeName({ foo: 1 }), '');
});
