export const SUPPORTED_VERSIONS = ['3.7', '3.8', '4.0', '4.1', '4.2', '4.3'];

export function readSkeletonAsset(bytes) {
  const text = new TextDecoder().decode(bytes.subarray(0, 128)).replace(/^\uFEFF/, '').trimStart();
  if (text.startsWith('{')) {
    let asset;
    try {
      asset = JSON.parse(new TextDecoder().decode(bytes).replace(/^\uFEFF/, ''));
    } catch (error) {
      throw new Error(`骨架 JSON 解析失败：${error.message}`);
    }
    if (!Array.isArray(asset.bones)) throw new Error('骨架 JSON 缺少 bones 数组。');
    return { asset, version: requireVersion(asset.skeleton?.spine) };
  }

  // Spine 4.x starts with an eight-byte hash; older exports use a string hash.
  const modern = readBinaryString(bytes, 8);
  const hash = readBinaryString(bytes, 0);
  const legacy = hash && readBinaryString(bytes, hash.next);
  const version = [modern?.value, legacy?.value].find((value) => /^\d+\.\d+\.\d+(?:[-\w.]*)$/.test(value || ''));
  return { asset: bytes, version: requireVersion(version) };
}

function readBinaryString(bytes, offset) {
  let length = 0;
  for (let shift = 0; shift < 35; shift += 7) {
    if (offset >= bytes.length) return null;
    const byte = bytes[offset++];
    length |= (byte & 127) << shift;
    if (byte & 128) continue;
    if (length === 0) return { value: null, next: offset };
    if (length < 0 || length > 256 || offset + length - 1 > bytes.length) return null;
    return { value: new TextDecoder().decode(bytes.subarray(offset, offset + length - 1)), next: offset + length - 1 };
  }
  return null;
}

function requireVersion(version) {
  const match = /^(\d+\.\d+)(?:\.|$)/.exec(version || '');
  if (!match) throw new Error('无法读取 Spine 导出版本，请检查骨架文件是否完整。');
  if (!SUPPORTED_VERSIONS.includes(match[1])) {
    throw new Error(`Spine ${version} 尚未支持。当前支持 ${SUPPORTED_VERSIONS.join('、')}。`);
  }
  return version;
}

export function parseAtlasPages(text) {
  const pages = [];
  let expectingPage = true;
  let readingPageFields = false;
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/)) {
    const line = raw.trim();
    if (!line) {
      expectingPage = true;
      readingPageFields = false;
    } else if (expectingPage && !line.includes(':')) {
      pages.push({ name: line, pma: false });
      expectingPage = false;
      readingPageFields = true;
    } else if (readingPageFields) {
      if (!line.includes(':')) readingPageFields = false;
      else if (/^pma\s*:/i.test(line)) pages.at(-1).pma = /^pma\s*:\s*true$/i.test(line);
    }
  }
  if (!pages.length) throw new Error('Atlas 中没有找到贴图页面，请检查文件内容。');
  return pages;
}

function normalizedPath(name) {
  return name.normalize('NFC').replaceAll('\\', '/').replace(/^(\.\/)+/, '').toLowerCase();
}

export function matchAtlasImages(pages, files) {
  const imageMap = new Map();
  for (const page of pages) {
    const pagePath = normalizedPath(page.name);
    let matches = files.filter((file) => normalizedPath(file.webkitRelativePath || file.name) === pagePath);
    if (!matches.length) {
      matches = files.filter((file) => normalizedPath(file.name).split('/').at(-1) === pagePath.split('/').at(-1));
    }
    if (matches.length > 1) throw new Error(`贴图 ${page.name} 有多个同名候选，无法确定对应图片。`);
    if (!matches.length) throw new Error(`缺少 atlas 贴图：${page.name}。请选择所有对应图片，不会使用其他贴图代替。`);
    imageMap.set(page.name, matches[0]);
  }
  return imageMap;
}

export function usesPma(page, mode) {
  return mode === 'pma' || (mode !== 'straight' && page.pma);
}
