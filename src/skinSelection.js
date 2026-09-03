const RENDERABLE_ATTACHMENT_TYPES = new Set(['region', 'mesh', 'linkedmesh']);

// Numeric attachment types used by pixi-spine (AttachmentType enum order).
const NUMERIC_ATTACHMENT_TYPE_NAMES = ['region', 'boundingbox', 'mesh', 'linkedmesh', 'path', 'point', 'clipping'];

// Skin attachment containers are shallow (skin.attachments -> per-slot map -> attachment),
// so anything deeper is runtime internals (textures, pages, caches) that must not be walked.
const MAX_ATTACHMENT_CONTAINER_DEPTH = 4;

export function getInitialSkinName(skins, preferredName = '') {
  const list = [...(skins || [])];
  if (!list.length) return '';

  const preferred = list.find((skin) => skin?.name === preferredName);
  if (preferred && skinHasRenderableAttachments(preferred)) {
    return preferred.name;
  }

  const renderable = list.find(skinHasRenderableAttachments);
  return (renderable || list[0]).name || '';
}

export function getDefaultMergedSkinNames(skins, fallbackName = '') {
  const list = [...(skins || [])];
  const renderableNames = list
    .filter(skinHasRenderableAttachments)
    .map((skin) => skin.name)
    .filter(Boolean);

  if (renderableNames.length > 1) return renderableNames;
  if (fallbackName && list.some((skin) => skin?.name === fallbackName)) return [fallbackName];
  return renderableNames.length ? renderableNames : list.slice(0, 1).map((skin) => skin.name).filter(Boolean);
}

export function getSkinsByName(skeletonData, skinNames) {
  const names = [...new Set((skinNames || []).filter(Boolean))];
  return names.map((name) => {
    const skin = skeletonData?.findSkin?.(name)
      || [...(skeletonData?.skins || [])].find((item) => item?.name === name);
    if (!skin) {
      throw new Error(`Skin not found: ${name}`);
    }
    return skin;
  });
}

export function createCombinedSkin(skins, name = 'combined-skin') {
  const list = [...(skins || [])].filter(Boolean);
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];

  const SkinCtor = list[0].constructor;
  const combined = new SkinCtor(name);

  for (const skin of list) {
    if (typeof combined.addSkin !== 'function') {
      throw new Error('The selected Spine runtime does not support skin merging.');
    }
    combined.addSkin(skin);
  }

  return combined;
}

export function skinHasRenderableAttachments(skin) {
  for (const attachment of collectSkinAttachments(skin)) {
    if (isRenderableAttachment(attachment)) return true;
  }
  return false;
}

/**
 * Returns a lowercase attachment type name ("region", "mesh", "clipping", ...) for an attachment
 * from either runtime, or '' when the value does not look like an attachment.
 *
 * Works with: string `type` (JSON / spine-core), numeric `type` (pixi-spine AttachmentType enum,
 * where Region is 0), and constructor names, including bundler-renamed ones such as
 * "RegionAttachment2".
 */
export function getAttachmentTypeName(attachment) {
  if (!attachment || typeof attachment !== 'object') return '';

  const { type } = attachment;
  if (typeof type === 'number') return NUMERIC_ATTACHMENT_TYPE_NAMES[type] || '';
  if (typeof type === 'string' && type) return type.toLowerCase();

  const ctorMatch = String(attachment.constructor?.name || '').match(/^(\w+?)Attachment\d*$/);
  if (ctorMatch) return ctorMatch[1].toLowerCase();

  if (Array.isArray(attachment.triangles) || attachment.triangles?.length > 0) return 'mesh';
  if (attachment.worldVerticesLength === 8) return 'region';

  return '';
}

function isRenderableAttachment(attachment) {
  return RENDERABLE_ATTACHMENT_TYPES.has(getAttachmentTypeName(attachment));
}

function collectSkinAttachments(skin) {
  const attachments = [];
  collectAttachmentValues(skin?.attachments, attachments, 0, new WeakSet());
  return attachments;
}

function collectAttachmentValues(value, output, depth, seen) {
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);

  // Skin entry objects ({ slotIndex, name, attachment }) from skin.getAttachments().
  if (value.attachment && typeof value.attachment === 'object') {
    output.push(value.attachment);
    return;
  }

  if (isLikelyAttachment(value)) {
    output.push(value);
    return;
  }

  if (depth >= MAX_ATTACHMENT_CONTAINER_DEPTH) return;

  if (Array.isArray(value)) {
    for (const item of value) collectAttachmentValues(item, output, depth + 1, seen);
    return;
  }

  if (value instanceof Map) {
    for (const item of value.values()) collectAttachmentValues(item, output, depth + 1, seen);
    return;
  }

  for (const item of Object.values(value)) collectAttachmentValues(item, output, depth + 1, seen);
}

function isLikelyAttachment(value) {
  if (!value || typeof value !== 'object') return false;
  if (getAttachmentTypeName(value)) return true;
  // Runtime attachments always carry a name plus region/vertex data.
  return typeof value.name === 'string'
    && ('region' in value || Array.isArray(value.vertices) || ArrayBuffer.isView(value.vertices));
}
