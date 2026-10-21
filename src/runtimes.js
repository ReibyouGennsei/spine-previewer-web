import { ALPHA_MODES, BaseTexture, ImageResource } from 'pixi.js';
import { TextureAtlas as LegacyAtlas } from '@pixi-spine/base';
import { usesPma } from './resources.js';

const runtimeLoaders = {
  '3.7': () => import('@pixi-spine/runtime-3.7'),
  '3.8': () => import('@pixi-spine/runtime-3.8'),
  '4.0': () => import('@pixi-spine/runtime-4.0'),
  '4.1': () => import('@pixi-spine/runtime-4.1'),
  '4.2': () => import('spine-pixi-4.2'),
  '4.3': () => import('spine-pixi-4.3'),
};

export async function loadSpineResources({ asset, version, atlasText, pages, imageMap, scale, alphaMode }) {
  const minor = version.split('.').slice(0, 2).join('.');
  const core = await runtimeLoaders[minor]();
  if (asset instanceof Uint8Array && !core.SkeletonBinary) {
    throw new Error(`Spine ${minor} 当前仅支持 JSON 骨架；此版本的二进制解析器尚未接入。`);
  }
  const textures = new Map();
  let object;
  let atlas;
  const dispose = () => {
    object?.destroy({ children: true });
    atlas?.dispose();
    for (const texture of textures.values()) texture.destroy();
  };

  try {
    for (const page of pages) {
      const url = URL.createObjectURL(imageMap.get(page.name));
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const mode = usesPma(page, alphaMode) ? ALPHA_MODES.PMA : ALPHA_MODES.UNPACK;
        // Preserve PNG RGB for PMA textures. ImageBitmap defaults can premultiply it a second time.
        const resource = new ImageResource(image, { createBitmap: false, alphaMode: mode });
        textures.set(page.name, new BaseTexture(resource, { alphaMode: mode }));
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    const legacy = !core.SpineTexture;
    if (legacy) {
      atlas = await new Promise((resolve) => {
        new LegacyAtlas(atlasText, (name, callback) => callback(textures.get(name)), resolve);
      });
      // Older atlas readers can override the upload mode while parsing pma fields.
      for (const page of pages) textures.get(page.name).alphaMode = usesPma(page, alphaMode) ? ALPHA_MODES.PMA : ALPHA_MODES.UNPACK;
    } else {
      atlas = new core.TextureAtlas(atlasText);
      for (const page of atlas.pages) page.setTexture(core.SpineTexture.from(textures.get(page.name)));
    }

    const attachmentLoader = new core.AtlasAttachmentLoader(atlas);
    const reader = asset instanceof Uint8Array ? new core.SkeletonBinary(attachmentLoader) : new core.SkeletonJson(attachmentLoader);
    reader.scale = scale;
    const data = reader.readSkeletonData(asset);
    if (legacy) {
      // These Pixi parsers defer region offsets to their sprites. Bounds and picking need them too.
      for (const skin of data.skins) {
        for (const attachments of skin.attachments) {
          for (const attachment of Object.values(attachments || {})) {
            if (attachment instanceof core.RegionAttachment) (attachment.updateRegion || attachment.updateOffset).call(attachment);
          }
        }
      }
    }
    object = legacy ? new core.Spine(data) : new core.Spine({ skeletonData: data, autoUpdate: false });
    object.autoUpdate = false;
    const refresh = () => {
      if (!legacy) return;
      // Legacy render meshes are rebuilt in update(). Keep the user's current bone/slot pose intact.
      const apply = object.state.apply;
      object.state.apply = () => {};
      try {
        object.update(0);
      } finally {
        object.state.apply = apply;
      }
    };
    return { object, core, dispose, refresh, regionUsesBone: ['3.7', '3.8', '4.0'].includes(minor), bounds: new core.SkeletonBounds() };
  } catch (error) {
    dispose();
    throw new Error(`Spine ${version} 加载失败：${error.message || error}`);
  }
}
