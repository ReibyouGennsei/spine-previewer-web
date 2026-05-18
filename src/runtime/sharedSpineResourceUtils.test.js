import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAtlasImageFileMap,
  parseAtlasPageNames,
  readSkeletonAsset,
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
