import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAtlasImageFileMap,
  detectSkeletonVersion,
  detectSkeletonVersionFromFile,
  parseAtlasPageNames,
  parseSpineVersion,
  readSkeletonAsset,
  upgradeSkeletonJsonForSpine42,
} from './sharedSpineResourceUtils.js';

test('parseAtlasPageNames reads each page header from atlas text', () => {
  const atlas = [
    'page-a.png',
    'size: 256,256',
    'format: RGBA8888',
    '',
    'page-b.png',
    'size: 512,512',
  ].join('\n');

  assert.deepEqual(parseAtlasPageNames(atlas), ['page-a.png', 'page-b.png']);
});

test('buildAtlasImageFileMap matches by exact file name and base name', () => {
  const files = [
    { name: 'page-a.png' },
    { name: 'folder\\page-b.png' },
  ];

  const result = buildAtlasImageFileMap(['page-a.png', 'page-b.png'], files);

  assert.equal(result.fileMap.get('page-a.png').name, 'page-a.png');
  assert.equal(result.fileMap.get('page-b.png').name, 'folder\\page-b.png');
  assert.deepEqual(result.warnings, []);
});

test('buildAtlasImageFileMap falls back to the first image when a page is missing', () => {
  const result = buildAtlasImageFileMap(['missing.png'], [{ name: 'fallback.png' }]);

  assert.equal(result.fileMap.get('missing.png').name, 'fallback.png');
  assert.equal(result.warnings.length, 1);
});

test('readSkeletonAsset parses JSON skeleton files', async () => {
  const file = {
    name: 'hero.json',
    text: async () => JSON.stringify({ skeleton: { spine: '4.1.00' }, bones: [] }),
  };

  assert.deepEqual(await readSkeletonAsset(file), { skeleton: { spine: '4.1.00' }, bones: [] });
});

function binaryString(text) {
  const bytes = new TextEncoder().encode(text);
  return [bytes.length + 1, ...bytes];
}

function mockFile(name, content) {
  return {
    name,
    slice(start, end) {
      const part = content.slice(start, end);
      return {
        text: async () => (typeof part === 'string' ? part : new TextDecoder().decode(part)),
        arrayBuffer: async () => (typeof part === 'string' ? new TextEncoder().encode(part).buffer : part.buffer),
      };
    },
  };
}

test('parseSpineVersion splits editor version strings', () => {
  assert.deepEqual(parseSpineVersion('4.0.58'), { version: '4.0.58', major: 4, minor: 0, majorMinor: '4.0' });
  assert.deepEqual(parseSpineVersion('4.2'), { version: '4.2', major: 4, minor: 2, majorMinor: '4.2' });
  assert.equal(parseSpineVersion('latest'), null);
  assert.equal(parseSpineVersion(undefined), null);
});

test('detectSkeletonVersion reads JSON and binary skeleton headers', () => {
  assert.equal(detectSkeletonVersion({ skeleton: { spine: '4.0.58' }, bones: [] }).majorMinor, '4.0');
  assert.equal(detectSkeletonVersion({ bones: [] }), null);

  const skel4 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, ...binaryString('4.1.24'), 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(detectSkeletonVersion(skel4).version, '4.1.24');

  const skel3 = new Uint8Array([...binaryString('PUmwp/E7BgQ'), ...binaryString('3.8.99'), 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(detectSkeletonVersion(skel3).version, '3.8.99');

  assert.equal(detectSkeletonVersion(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])), null);
});

test('detectSkeletonVersionFromFile only reads the file head', async () => {
  const json = mockFile('hero.json', JSON.stringify({ skeleton: { hash: 'x', spine: '4.0.58' }, bones: [] }));
  assert.equal((await detectSkeletonVersionFromFile(json)).version, '4.0.58');

  const skel = mockFile('hero.skel', new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9, ...binaryString('4.2.43'), 0, 0, 0, 0, 0, 0, 0, 0]));
  assert.equal((await detectSkeletonVersionFromFile(skel)).version, '4.2.43');

  assert.equal(await detectSkeletonVersionFromFile(mockFile('hero.json', '{"bones":[]}')), null);
});

test('upgradeSkeletonJsonForSpine42 converts 4.0 JSON to the 4.2 layout', () => {
  const json = {
    skeleton: { spine: '4.0.58' },
    bones: [{ name: 'root' }, { name: 'arm', transform: 'noRotationOrReflection' }],
    animations: {
      idle: {
        deform: { default: { body: { body: [{ time: 0, vertices: [1, 2] }] } } },
        attachments: { default: { body: { other: { deform: [] } } } },
      },
    },
  };

  const result = upgradeSkeletonJsonForSpine42(json);

  assert.equal(result, json);
  assert.deepEqual(result.bones[1], { name: 'arm', inherit: 'noRotationOrReflection' });
  assert.equal('deform' in result.animations.idle, false);
  assert.deepEqual(result.animations.idle.attachments.default.body, {
    other: { deform: [] },
    body: { deform: [{ time: 0, vertices: [1, 2] }] },
  });
});

test('upgradeSkeletonJsonForSpine42 leaves 4.2 JSON and binary data untouched', () => {
  const json = { skeleton: { spine: '4.2.11' }, bones: [{ name: 'a', transform: 'noScale' }], animations: { idle: { deform: {} } } };
  upgradeSkeletonJsonForSpine42(json);
  assert.deepEqual(json.bones[0], { name: 'a', transform: 'noScale' });
  assert.ok(json.animations.idle.deform);

  const bytes = new Uint8Array([1, 2, 3]);
  assert.equal(upgradeSkeletonJsonForSpine42(bytes), bytes);
});
