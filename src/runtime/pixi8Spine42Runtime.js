import { Application, Assets, Cache, Graphics, Rectangle, TextureSource } from 'pixi.js';
import * as spine from '@esotericsoftware/spine-pixi-v8';
import {
  buildAtlasImageFileMap,
  parseAtlasPageNames,
  readSkeletonAsset,
} from './sharedSpineResourceUtils.js';

export const runtime = {
  id: 'spine42-pixi8',
  label: 'Spine 4.2 / PixiJS 8',
  async createApplication({ resizeTo }) {
    const app = new Application();
    await app.init({
      resizeTo,
      antialias: true,
      backgroundAlpha: 0,
      preference: 'webgl',
    });
    return app;
  },
  getCanvas(app) {
    return app.canvas;
  },
  createRectangle(x, y, width, height) {
    return new Rectangle(x, y, width, height);
  },
  configureStage(stage, hitArea) {
    stage.eventMode = 'static';
    stage.hitArea = hitArea;
  },
  createGraphics() {
    const graphics = new Graphics();
    graphics.eventMode = 'none';
    return graphics;
  },
  createVector2() {
    return new spine.Vector2();
  },
  createSkeletonBounds() {
    return new spine.SkeletonBounds();
  },
  updateWorldTransform(skeleton) {
    skeleton.updateWorldTransform(spine.Physics.update);
  },
  getPointerGlobal(event) {
    return event.global;
  },
  clearGraphics(graphics) {
    graphics.clear();
  },
  drawCircle(graphics, x, y, radius, color, alpha) {
    graphics.circle(x, y, radius).fill({ color, alpha });
  },
  strokePolygon(graphics, vertices, color, alpha) {
    if (!vertices || vertices.length < 4) return;
    graphics.moveTo(vertices[0], vertices[1]);
    for (let i = 2; i < vertices.length; i += 2) {
      graphics.lineTo(vertices[i], vertices[i + 1]);
    }
    graphics.lineTo(vertices[0], vertices[1]);
    graphics.stroke({ color, pixelLine: true, alpha });
  },
  strokeTriangle(graphics, vertices, ia, ib, ic, color, alpha) {
    graphics
      .moveTo(vertices[ia], vertices[ia + 1])
      .lineTo(vertices[ib], vertices[ib + 1])
      .lineTo(vertices[ic], vertices[ic + 1])
      .lineTo(vertices[ia], vertices[ia + 1])
      .stroke({ color, pixelLine: true, alpha });
  },
  async loadSpine({
    token,
    skeletonFile,
    atlasFile,
    imageFiles,
    skeletonScale,
    registerUrl,
  }) {
    const skeletonAlias = `${token}-skeleton`;
    const atlasAlias = `${token}-atlas`;
    const atlasUrl = registerUrl(URL.createObjectURL(atlasFile));
    const atlasText = await atlasFile.text();
    const pageNames = parseAtlasPageNames(atlasText);
    const { fileMap, warnings } = buildAtlasImageFileMap(pageNames, imageFiles);
    const skeletonAsset = await readSkeletonAsset(skeletonFile);
    const imageMap = await createTextureSourceMap(fileMap);

    Cache.set(skeletonAlias, skeletonAsset);

    await Assets.load({
      alias: atlasAlias,
      src: {
        src: atlasUrl,
        parser: 'spineTextureAtlasLoader',
      },
      data: { images: imageMap },
    });

    let spineObject;
    try {
      spineObject = spine.Spine.from({
        skeleton: skeletonAlias,
        atlas: atlasAlias,
        scale: skeletonScale,
        autoUpdate: true,
      });
    } catch (error) {
      throw wrapSpineLoadError(error);
    }

    return { spineObject, warnings };
  },
  downloadPng(app, target, filename) {
    app.renderer.extract.download({ target, filename });
  },
  destroySpineObject(spineObject) {
    spineObject.destroy({ children: true });
  },
  destroyApplication(app) {
    app.destroy(true);
  },
};

async function createTextureSourceMap(fileMap) {
  const imageMap = {};
  for (const [pageName, file] of fileMap.entries()) {
    imageMap[pageName] = await createTextureSource(file);
  }
  return imageMap;
}

async function createTextureSource(file) {
  const bitmap = await createImageBitmap(file);
  return TextureSource.from(bitmap);
}

function wrapSpineLoadError(error) {
  const message = error?.message || String(error);
  const versionHint = 'Selected runtime: Spine 4.2 / PixiJS 8. If your asset was exported from Spine 4.1, try the Spine 4.1 / PixiJS 6.5.10 runtime option.';

  return new Error(`Failed to parse Spine data: ${message}. ${versionHint}`);
}

export default runtime;
