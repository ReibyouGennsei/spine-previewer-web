const RENDERABLE_ATTACHMENT_TYPES = new Set(['region', 'mesh']);

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

function isRenderableAttachment(attachment) {
  if (!attachment || typeof attachment !== 'object') return false;

  const type = String(attachment.type || attachment.constructor?.name || '').toLowerCase();
  if (RENDERABLE_ATTACHMENT_TYPES.has(type)) return true;
  if (type.includes('region') || type.includes('mesh')) return true;

  return Array.isArray(attachment.triangles)
    || attachment.triangles?.length > 0
    || attachment.worldVerticesLength === 8;
}

function collectSkinAttachments(skin) {
  const attachments = [];
  collectAttachmentValues(skin?.attachments, attachments);
  return attachments;
}

function collectAttachmentValues(value, output) {
  if (!value) return;

  if (value.attachment) {
    output.push(value.attachment);
    return;
  }

  if (isLikelyAttachment(value)) {
    output.push(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectAttachmentValues(item, output);
    return;
  }

  if (value instanceof Map) {
    for (const item of value.values()) collectAttachmentValues(item, output);
    return;
  }

  if (typeof value === 'object') {
    for (const item of Object.values(value)) collectAttachmentValues(item, output);
  }
}

function isLikelyAttachment(value) {
  if (!value || typeof value !== 'object') return false;
  return Boolean(value.type)
    || Boolean(value.constructor?.name?.endsWith('Attachment'))
    || Array.isArray(value.triangles)
    || value.triangles?.length > 0
    || value.worldVerticesLength === 8;
}
