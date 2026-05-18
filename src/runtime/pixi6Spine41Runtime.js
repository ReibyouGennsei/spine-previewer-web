import { Application, BaseTexture, Graphics, Rectangle } from 'pixi.js-v6';
import {
  TextureAtlas,
  Vector2,
} from '@pixi-spine/base';
import {
  AtlasAttachmentLoader,
  SkeletonBinary,
  SkeletonBounds,
  SkeletonJson,
  Spine,
} from '@pixi-spine/runtime-4.1';
import {
  buildAtlasImageFileMap,
  parseAtlasPageNames,
  readSkeletonAsset,
} from './sharedSpineResourceUtils.js';

export const runtime = {
  id: 'spine41-pixi6',
  label: 'Spine 4.1 / PixiJS 6.5.10',
  async createApplication({ resizeTo }) {
    return new Application({
      resizeTo,
      antialias: true,
      backgroundAlpha: 0,
    });
  },
  getCanvas(app) {
    return app.view;
  },
  createRectangle(x, y, width, height) {
    return new Rectangle(x, y, width, height);
  },
  configureStage(stage, hitArea) {
    stage.interactive = true;
    stage.hitArea = hitArea;
  },
  createGraphics() {
    const graphics = new Graphics();
    graphics.interactive = false;
    return graphics;
  },
  createVector2() {
    return new Vector2();
  },
  createSkeletonBounds() {
    return new SkeletonBounds();
  },
  updateWorldTransform(skeleton) {
    skeleton.updateWorldTransform();
  },
  updateSpineObject(spineObject, delta = 0) {
    spineObject?.update?.(delta);
  },
  renderApplication(app) {
    app?.render?.();
  },
  getPointerButton(event) {
    return event.button
      ?? event.data?.button
      ?? event.data?.originalEvent?.button
      ?? 0;
  },
  getPointerId(event) {
    return event.pointerId
      ?? event.data?.pointerId
      ?? event.data?.identifier
      ?? event.data?.originalEvent?.pointerId
      ?? 0;
  },
  getPointerGlobal(event) {
    return event.global || event.data?.global;
  },
  clearGraphics(graphics) {
    graphics.clear();
  },
  drawCircle(graphics, x, y, radius, color, alpha) {
    graphics.beginFill(color, alpha);
    graphics.drawCircle(x, y, radius);
    graphics.endFill();
  },
  strokePolygon(graphics, vertices, color, alpha) {
    if (!vertices || vertices.length < 4) return;
    graphics.lineStyle(1, color, alpha);
    graphics.moveTo(vertices[0], vertices[1]);
    for (let i = 2; i < vertices.length; i += 2) {
      graphics.lineTo(vertices[i], vertices[i + 1]);
    }
    graphics.lineTo(vertices[0], vertices[1]);
  },
  strokeTriangle(graphics, vertices, ia, ib, ic, color, alpha) {
    graphics.lineStyle(1, color, alpha);
    graphics
      .moveTo(vertices[ia], vertices[ia + 1])
      .lineTo(vertices[ib], vertices[ib + 1])
      .lineTo(vertices[ic], vertices[ic + 1])
      .lineTo(vertices[ia], vertices[ia + 1]);
  },
  async loadSpine({
    skeletonFile,
    atlasFile,
    imageFiles,
    skeletonScale,
    registerUrl,
  }) {
    const atlasText = await atlasFile.text();
    const pageNames = parseAtlasPageNames(atlasText);
    const { fileMap, warnings } = buildAtlasImageFileMap(pageNames, imageFiles);
    const skeletonAsset = await readSkeletonAsset(skeletonFile);
    const baseTextures = await createBaseTextureMap(fileMap, registerUrl);
    const atlas = await createTextureAtlas(atlasText, baseTextures);
    const attachmentLoader = new AtlasAttachmentLoader(atlas);
    const parser = skeletonAsset instanceof Uint8Array
      ? new SkeletonBinary(attachmentLoader)
      : new SkeletonJson(attachmentLoader);

    parser.scale = skeletonScale;

    let spineData;
    try {
      spineData = parser.readSkeletonData(skeletonAsset);
    } catch (error) {
      throw wrapSpineLoadError(error);
    }

    const spineObject = new Spine(spineData);
    spineObject.autoUpdate = true;

    return { spineObject, warnings };
  },
  downloadPng(app, target, filename) {
    const canvas = app.renderer.plugins.extract.canvas(target);
    const anchor = document.createElement('a');
    anchor.download = filename;
    anchor.href = canvas.toDataURL('image/png');
    anchor.click();
  },
  destroySpineObject(spineObject) {
    spineObject.destroy({ children: true });
  },
  destroyApplication(app) {
    app.destroy(true, { children: true });
  },
};

async function createBaseTextureMap(fileMap, registerUrl) {
  const textures = new Map();
  for (const [pageName, file] of fileMap.entries()) {
    const url = registerUrl(URL.createObjectURL(file));
    textures.set(pageName, await loadBaseTexture(url));
  }
  return textures;
}

function loadBaseTexture(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(BaseTexture.from(image));
    image.onerror = () => reject(new Error(`Failed to load atlas image: ${url}`));
    image.src = url;
  });
}

function createTextureAtlas(atlasText, baseTextures) {
  return new Promise((resolve) => {
    new TextureAtlas(atlasText, (pageName, callback) => {
      callback(baseTextures.get(pageName) || baseTextures.get('default') || null);
    }, resolve);
  });
}

function wrapSpineLoadError(error) {
  const message = error?.message || String(error);
  const versionHint = 'Selected runtime: Spine 4.1 / PixiJS 6.5.10. If your asset was exported from Spine 4.2, use the default Spine 4.2 / PixiJS 8 runtime option.';

  return new Error(`Failed to parse Spine data: ${message}. ${versionHint}`);
}

export default runtime;
