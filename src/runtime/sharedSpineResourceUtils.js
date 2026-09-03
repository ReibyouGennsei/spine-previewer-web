export function parseAtlasPageNames(atlasText) {
  const lines = String(atlasText || '').split(/\r?\n/);
  const pages = [];
  let expectingPage = true;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      expectingPage = true;
      continue;
    }
    if (expectingPage && !line.includes(':')) {
      pages.push(line);
      expectingPage = false;
    }
  }

  return pages;
}

export function buildAtlasImageFileMap(pageNames, imageFiles) {
  const fileMap = new Map();
  const warnings = [];
  const files = [...(imageFiles || [])];
  const byName = new Map(files.map((file) => [file.name.toLowerCase(), file]));
  const byBase = new Map(files.map((file) => [baseName(file.name), file]));

  if (!pageNames.length) {
    if (files[0]) {
      fileMap.set('default', files[0]);
      warnings.push('No atlas page names were found, so the first image will be used as the default texture source.');
    }
    return { fileMap, warnings };
  }

  for (const pageName of pageNames) {
    let file = byName.get(pageName.toLowerCase()) || byBase.get(baseName(pageName));
    if (!file) {
      file = files[0];
      warnings.push(`Atlas page "${pageName}" did not match an uploaded image, so "${file?.name || 'the first image'}" will be used.`);
    }
    if (file) fileMap.set(pageName, file);
  }

  return { fileMap, warnings };
}

export async function readSkeletonAsset(file) {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.json')) {
    const text = await file.text();

    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || !('bones' in parsed)) {
        throw new Error('JSON is missing the required "bones" field.');
      }
      return parsed;
    } catch (error) {
      throw new Error(`Failed to parse skeleton JSON: ${error?.message || error}`);
    }
  }

  if (lowerName.endsWith('.skel') || lowerName.endsWith('.bytes')) {
    return new Uint8Array(await file.arrayBuffer());
  }

  throw new Error(`Unsupported skeleton file type: ${file.name}. Please import a .json, .skel, or .bytes file.`);
}

function baseName(name) {
  return String(name).split('/').pop().split('\\').pop().toLowerCase();
}

/**
 * Parses a Spine editor version string such as "4.0.58" into its parts.
 * Returns null when the text does not start with "major.minor".
 */
export function parseSpineVersion(versionText) {
  const match = String(versionText || '').trim().match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) return null;
  return {
    version: match[0],
    major: Number(match[1]),
    minor: Number(match[2]),
    majorMinor: `${match[1]}.${match[2]}`,
  };
}

/**
 * Detects the Spine editor version that exported a skeleton asset.
 * Accepts the value returned by readSkeletonAsset(): a parsed JSON object or a Uint8Array (.skel).
 */
export function detectSkeletonVersion(asset) {
  if (!asset) return null;
  if (asset instanceof Uint8Array || ArrayBuffer.isView(asset)) {
    return readBinarySkeletonVersion(new Uint8Array(asset.buffer, asset.byteOffset, asset.byteLength));
  }
  if (typeof asset === 'object') {
    return parseSpineVersion(asset?.skeleton?.spine);
  }
  return null;
}

/**
 * Detects the Spine version from a File without parsing the whole skeleton,
 * so it can run on file selection before the user presses "load".
 */
export async function detectSkeletonVersionFromFile(file) {
  if (!file) return null;
  const lowerName = String(file.name || '').toLowerCase();

  if (lowerName.endsWith('.json')) {
    const head = await file.slice(0, 64 * 1024).text();
    const match = head.match(/"spine"\s*:\s*"([^"]+)"/);
    return parseSpineVersion(match?.[1]);
  }

  const bytes = new Uint8Array(await file.slice(0, 256).arrayBuffer());
  return readBinarySkeletonVersion(bytes);
}

/**
 * Upgrades a Spine 4.0 / 4.1 skeleton JSON object in place so the Spine 4.2 runtime reads it faithfully.
 * - bone "transform" (4.0/4.1) becomes "inherit" (4.2); otherwise inherit modes are silently dropped.
 * - animation "deform" (4.0) becomes "attachments.{skin}.{slot}.{attachment}.deform" (4.1+);
 *   otherwise mesh deform timelines are silently dropped.
 * Returns the same object. Binary assets and 4.2+ JSON are returned untouched.
 */
export function upgradeSkeletonJsonForSpine42(json) {
  if (!json || typeof json !== 'object' || ArrayBuffer.isView(json)) return json;
  const version = detectSkeletonVersion(json);
  if (!version || version.major !== 4 || version.minor >= 2) return json;

  for (const bone of json.bones || []) {
    if (bone && bone.transform !== undefined && bone.inherit === undefined) {
      bone.inherit = bone.transform;
      delete bone.transform;
    }
  }

  for (const animation of Object.values(json.animations || {})) {
    if (!animation || typeof animation !== 'object' || !animation.deform) continue;
    const attachments = animation.attachments || (animation.attachments = {});
    for (const [skinName, slots] of Object.entries(animation.deform)) {
      const outSkin = attachments[skinName] || (attachments[skinName] = {});
      for (const [slotName, slotAttachments] of Object.entries(slots || {})) {
        const outSlot = outSkin[slotName] || (outSkin[slotName] = {});
        for (const [attachmentName, frames] of Object.entries(slotAttachments || {})) {
          outSlot[attachmentName] = { ...(outSlot[attachmentName] || {}), deform: frames };
        }
      }
    }
    delete animation.deform;
  }

  return json;
}

// Spine 4.x .skel files start with an 8-byte hash followed by the version string;
// Spine 3.x files start with two strings (hash, version). Strings are a varint byte count
// (0 = null, 1 = empty, otherwise count - 1 UTF-8 bytes) followed by the bytes.
function readBinarySkeletonVersion(bytes) {
  if (!bytes || bytes.length < 10) return null;

  const fromV4 = readBinaryString(bytes, 8);
  if (isPlainVersionText(fromV4?.text)) return parseSpineVersion(fromV4.text);

  const hash = readBinaryString(bytes, 0);
  if (!hash) return null;
  const fromV3 = readBinaryString(bytes, hash.pos);
  return isPlainVersionText(fromV3?.text) ? parseSpineVersion(fromV3.text) : null;
}

function isPlainVersionText(text) {
  return /^\d+\.\d+(?:\.\d+)?$/.test(String(text || '').trim());
}

function readBinaryString(bytes, start) {
  const varint = readVarint(bytes, start);
  if (!varint) return null;
  const { value: byteCount, pos } = varint;
  if (byteCount === 0) return { text: null, pos };
  if (byteCount === 1) return { text: '', pos };

  const length = byteCount - 1;
  if (length > 64 || pos + length > bytes.length) return null;
  const text = new TextDecoder('utf-8').decode(bytes.subarray(pos, pos + length));
  return { text, pos: pos + length };
}

function readVarint(bytes, start) {
  let pos = start;
  let result = 0;
  for (let shift = 0; shift < 35; shift += 7) {
    if (pos >= bytes.length) return null;
    const byte = bytes[pos++];
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value: result >>> 0, pos };
  }
  return null;
}
