import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchAtlasImages, parseAtlasPages, readSkeletonAsset, usesPma } from '../src/resources.js';

const encode = (text) => new TextEncoder().encode(text);
const binaryString = (text) => Uint8Array.from([text.length + 1, ...encode(text)]);

test('识别带 BOM 的 JSON 内容，不依赖 json/txt/bytes 后缀', () => {
  const { version } = readSkeletonAsset(encode('\uFEFF {"skeleton":{"spine":"3.8.99"},"bones":[]}'));
  assert.equal(version, '3.8.99');
});

test('读取旧版字符串 hash 和新版八字节 hash 的二进制版本头', () => {
  const old = Uint8Array.from([...binaryString('hash'), ...binaryString('3.8.99')]);
  const modern = Uint8Array.from([...new Uint8Array(8), ...binaryString('4.2.43')]);
  const noHash = Uint8Array.from([0, ...binaryString('3.8.99')]);
  assert.equal(readSkeletonAsset(old).version, '3.8.99');
  assert.equal(readSkeletonAsset(modern).version, '4.2.43');
  assert.equal(readSkeletonAsset(noHash).version, '3.8.99');
});

test('未知版本、缺失版本、损坏二进制明确拒绝', () => {
  assert.throws(() => readSkeletonAsset(encode('{"skeleton":{"spine":"3.6.53"},"bones":[]}')), /3.6.53 尚未支持/);
  assert.throws(() => readSkeletonAsset(encode('{"bones":[]}')), /无法读取/);
  assert.throws(() => readSkeletonAsset(new Uint8Array([255, 255, 255])), /无法读取/);
});

test('解析多页 atlas，区分各页的 PMA 字段', () => {
  const pages = parseAtlasPages('\uFEFF\r\nimages/a.png\r\nsize: 16,16\r\npma: true\r\npart-a\r\n  size: 8,8\r\n\r\nb.png\r\nsize: 16,16\r\npma: false\r\npart-b\r\n  size: 8,8\r\n');
  assert.deepEqual(pages, [{ name: 'images/a.png', pma: true }, { name: 'b.png', pma: false }]);
  assert.equal(usesPma(pages[0], 'auto'), true);
  assert.equal(usesPma(pages[1], 'auto'), false);
  assert.equal(usesPma(pages[0], 'straight'), false);
  assert.equal(usesPma(pages[1], 'pma'), true);
});

test('按路径、大小写和唯一文件名匹配，上传顺序不影响结果', () => {
  const a = { name: 'A.PNG' };
  const b = { name: 'b.png' };
  const map = matchAtlasImages([{ name: './images\\a.png' }, { name: 'b.png' }], [b, a]);
  assert.equal(map.get('./images\\a.png'), a);
  assert.equal(map.get('b.png'), b);
});

test('缺失贴图不再使用第一张替代，同名歧义拒绝加载', () => {
  assert.throws(() => matchAtlasImages([{ name: 'b.png' }], [{ name: 'a.png' }]), /缺少 atlas 贴图：b.png/);
  assert.throws(() => matchAtlasImages([{ name: 'a.png' }], [{ name: 'a.png' }, { name: 'a.png' }]), /多个同名候选/);
  const a = { name: 'a.png', webkitRelativePath: 'first/a.png' };
  const b = { name: 'a.png', webkitRelativePath: 'second/a.png' };
  assert.equal(matchAtlasImages([{ name: 'second/a.png' }], [a, b]).get('second/a.png'), b);
});
