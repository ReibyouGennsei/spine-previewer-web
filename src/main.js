import './style.css';
import { inject } from '@vercel/analytics';
import { Application, Assets, Cache, Graphics, Rectangle, TextureSource } from 'pixi.js';
import * as spine from '@esotericsoftware/spine-pixi-v8';
import { getPngExportTarget } from './exportTarget.js';
import { slotMatchesSearch } from './slotSearch.js';
import { applyBulkSlotVisibility, getBulkSlotVisibilityState } from './slotVisibility.js';
import {
  STAGE_ROTATION_LIMITS,
  STAGE_SCALE_LIMITS,
  computeAnchoredPosition,
  computePanPosition,
  computeZoomAtPoint,
  degreesToRadians,
  normalizeStageRotation,
  radiansToDegrees,
  roundViewportValue,
} from './viewportTransform.js';

// Initialize Vercel Web Analytics
inject();

const els = {
  viewport: document.getElementById('viewport'),
  skeletonFile: document.getElementById('skeletonFile'),
  atlasFile: document.getElementById('atlasFile'),
  imageFiles: document.getElementById('imageFiles'),
  skeletonScale: document.getElementById('skeletonScale'),
  loadBtn: document.getElementById('loadBtn'),
  animationSelect: document.getElementById('animationSelect'),
  skinSelect: document.getElementById('skinSelect'),
  playPauseBtn: document.getElementById('playPauseBtn'),
  refitBtn: document.getElementById('refitBtn'),
  resetPoseBtn: document.getElementById('resetPoseBtn'),
  loopCheckbox: document.getElementById('loopCheckbox'),
  pauseOnSelectCheckbox: document.getElementById('pauseOnSelectCheckbox'),
  showBoundsCheckbox: document.getElementById('showBoundsCheckbox'),
  selectionInfo: document.getElementById('selectionInfo'),
  applyTransformBtn: document.getElementById('applyTransformBtn'),
  resetBoneBtn: document.getElementById('resetBoneBtn'),
  clearSelectionBtn: document.getElementById('clearSelectionBtn'),
  exportCurrentBtn: document.getElementById('exportCurrentBtn'),
  exportSetupBtn: document.getElementById('exportSetupBtn'),
  slotSearchInput: document.getElementById('slotSearchInput'),
  filteredSlotsToggle: document.getElementById('filteredSlotsToggle'),
  filteredSlotsToggleText: document.getElementById('filteredSlotsToggleText'),
  slotSearchCount: document.getElementById('slotSearchCount'),
  slotList: document.getElementById('slotList'),
  resourceSummary: document.getElementById('resourceSummary'),
  selectedSlotSummary: document.getElementById('selectedSlotSummary'),
  status: document.getElementById('status'),
  stageScaleInput: document.getElementById('stageScaleInput'),
  stageScaleValue: document.getElementById('stageScaleValue'),
  stageRotationInput: document.getElementById('stageRotationInput'),
  stageRotationValue: document.getElementById('stageRotationValue'),
  resetViewBtn: document.getElementById('resetViewBtn'),
  transformInputs: [...document.querySelectorAll('[data-transform]')],
};

const state = {
  app: null,
  spineObject: null,
  overlay: null,
  bounds: null,
  selected: null,
  playing: true,
  urls: [],
  loadCounter: 0,
  hiddenSlots: new Set(),
  hiddenSlotAttachments: new Map(),
  pan: {
    active: false,
    dragging: false,
    pointerId: null,
    startPoint: null,
    startPosition: null,
  },
};

boot().catch((error) => {
  console.error(error);
  setStatus(`初始化失败：${error?.message || error}`, 'error');
});

async function boot() {
  const app = new Application();
  await app.init({
    resizeTo: els.viewport,
    antialias: true,
    backgroundAlpha: 0,
    preference: 'webgl',
  });

  els.viewport.appendChild(app.canvas);
  app.stage.eventMode = 'static';
  app.stage.hitArea = new Rectangle(0, 0, els.viewport.clientWidth, els.viewport.clientHeight);
  app.stage.on('pointerdown', onStagePointerDown);
  app.stage.on('pointermove', onStagePointerMove);
  app.stage.on('pointerup', onStagePointerUp);
  app.stage.on('pointerupoutside', onStagePointerUpOutside);
  app.canvas.addEventListener('wheel', onViewportWheel, { passive: false });

  state.app = app;

  app.ticker.add(() => {
    if (!state.spineObject || !state.overlay) return;
    applySlotVisibility();
    if (state.selected || els.showBoundsCheckbox.checked) {
      drawOverlay();
    }
  });

  const resizeObserver = new ResizeObserver(() => {
    if (!state.app) return;
    state.app.stage.hitArea = new Rectangle(0, 0, els.viewport.clientWidth, els.viewport.clientHeight);
    if (state.spineObject) fitSpineToView();
  });
  resizeObserver.observe(els.viewport);

  bindUI();
  refreshResourceSummary();
  refreshSelectionPanel();
  refreshTransformPanel();
  syncStageControls();
  refreshSlotList();
}

function bindUI() {
  els.loadBtn.addEventListener('click', () => loadSpine().catch(handleLoadError));
  els.skeletonFile.addEventListener('change', refreshResourceSummary);
  els.atlasFile.addEventListener('change', refreshResourceSummary);
  els.imageFiles.addEventListener('change', refreshResourceSummary);

  els.animationSelect.addEventListener('change', () => {
    if (!state.spineObject) return;
    applySelectedAnimation();
    forcePoseRefresh();
  });

  els.skinSelect.addEventListener('change', () => {
    if (!state.spineObject) return;
    applySelectedSkin();
    forcePoseRefresh();
    fitSpineToView();
  });

  els.loopCheckbox.addEventListener('change', () => {
    if (!state.spineObject) return;
    applySelectedAnimation();
    forcePoseRefresh();
  });

  els.playPauseBtn.addEventListener('click', () => {
    if (!state.spineObject) return;
    setPlayback(!state.playing);
  });

  els.refitBtn.addEventListener('click', () => {
    if (state.spineObject) fitSpineToView();
  });

  els.resetPoseBtn.addEventListener('click', () => {
    if (!state.spineObject) return;
    state.spineObject.skeleton.setToSetupPose();
    if (els.animationSelect.value) applySelectedAnimation();
    forcePoseRefresh();
    drawOverlay();
    syncTransformInputsFromSelection();
  });

  els.applyTransformBtn.addEventListener('click', () => {
    if (!state.selected?.slot?.bone) return;
    const bone = state.selected.slot.bone;
    for (const input of els.transformInputs) {
      bone[input.dataset.transform] = Number(input.value || 0);
    }
    state.spineObject.skeleton.updateWorldTransform(spine.Physics.update);
    drawOverlay();
    refreshSelectionPanel();
    setStatus(`已应用 Bone：${bone.data.name}`, 'ok');
  });

  els.resetBoneBtn.addEventListener('click', () => {
    if (!state.selected?.slot?.bone) return;
    state.selected.slot.bone.setToSetupPose();
    state.spineObject.skeleton.updateWorldTransform(spine.Physics.update);
    syncTransformInputsFromSelection();
    drawOverlay();
    refreshSelectionPanel();
    setStatus(`已重置 Bone：${state.selected.slot.bone.data.name}`, 'ok');
  });

  els.clearSelectionBtn.addEventListener('click', clearSelection);
  els.exportCurrentBtn.addEventListener('click', () => exportPng('current').catch(handleLoadError));
  els.exportSetupBtn.addEventListener('click', () => exportPng('setup').catch(handleLoadError));
  els.slotSearchInput.addEventListener('input', refreshSlotList);
  els.filteredSlotsToggle.addEventListener('change', onFilteredSlotsToggleChange);
  els.stageScaleInput.min = String(STAGE_SCALE_LIMITS.min);
  els.stageScaleInput.max = String(STAGE_SCALE_LIMITS.max);
  els.stageRotationInput.min = String(STAGE_ROTATION_LIMITS.min);
  els.stageRotationInput.max = String(STAGE_ROTATION_LIMITS.max);
  els.stageScaleInput.addEventListener('input', () => {
    if (!state.spineObject) return;
    applyStageScale(Number(els.stageScaleInput.value || 1));
  });
  els.stageRotationInput.addEventListener('input', () => {
    if (!state.spineObject) return;
    applyStageRotation(Number(els.stageRotationInput.value || 0));
  });
  els.resetViewBtn.addEventListener('click', resetStageView);

  els.transformInputs.forEach((input) => {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        els.applyTransformBtn.click();
      }
    });
  });
}

function refreshResourceSummary() {
  const skeleton = els.skeletonFile.files?.[0];
  const atlas = els.atlasFile.files?.[0];
  const images = [...(els.imageFiles.files || [])];

  const lines = [
    `Skeleton：${skeleton ? skeleton.name : '未选择'}`,
    `Atlas：${atlas ? atlas.name : '未选择'}`,
    `图片：${images.length ? images.map((f) => f.name).join(', ') : '未选择'}`,
  ];

  els.resourceSummary.textContent = lines.join('\n');
}

async function loadSpine() {
  const skeletonFile = els.skeletonFile.files?.[0];
  const atlasFile = els.atlasFile.files?.[0];
  const imageFiles = [...(els.imageFiles.files || [])];

  if (!skeletonFile || !atlasFile || imageFiles.length === 0) {
    throw new Error('请至少选择 skeleton、atlas 和一张图片。');
  }

  els.loadBtn.disabled = true;
  setStatus('正在解析资源并加载 Spine…', 'warn');

  cleanupCurrentSpine();
  revokeAllObjectUrls();
  state.loadCounter += 1;
  state.hiddenSlots.clear();
  state.hiddenSlotAttachments.clear();

  const token = `spine-${Date.now()}-${state.loadCounter}`;
  const skeletonAlias = `${token}-skeleton`;
  const atlasAlias = `${token}-atlas`;

  const skeletonUrl = registerUrl(URL.createObjectURL(skeletonFile));
  const atlasUrl = registerUrl(URL.createObjectURL(atlasFile));
  const atlasText = await atlasFile.text();

  const pageNames = parseAtlasPageNames(atlasText);
  const { imageMap, warnings } = await buildAtlasImageMap(pageNames, imageFiles);
  const skeletonScale = Number(els.skeletonScale.value || 1);
  const skeletonAsset = await readSkeletonAsset(skeletonFile);

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

  if (!spineObject?.skeleton) {
    throw new Error('Spine resources were read, but the runtime did not create a skeleton. Check the skeleton file format, atlas/image matching, and Spine export/runtime version compatibility.');
  }

  state.spineObject = spineObject;
  state.bounds = new spine.SkeletonBounds();
  state.overlay = new Graphics();
  state.overlay.eventMode = 'none';
  spineObject.addChild(state.overlay);
  state.app.stage.addChild(spineObject);

  populateAnimationSelect();
  populateSkinSelect();
  refreshSlotList();
  applySelectedSkin();
  applySelectedAnimation();
  forcePoseRefresh();
  fitSpineToView({ resetRotation: true });
  setPlayback(true);
  clearSelection(false);

  const warnText = warnings.length ? `\n\n警告：\n- ${warnings.join('\n- ')}` : '';
  setStatus(`加载成功。支持点击选择 slot / bone / attachment。${warnText}`, warnings.length ? 'warn' : 'ok');
  els.loadBtn.disabled = false;
}

async function readSkeletonAsset(file) {
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

function wrapSpineLoadError(error) {
  const message = error?.message || String(error);
  const versionHint = 'If this is a Spine version mismatch, align @esotericsoftware/spine-pixi-v8 major.minor with the Spine Editor export version.';

  return new Error(`Failed to parse Spine data: ${message}. ${versionHint}`);
}

function handleLoadError(error) {
  console.error(error);
  setStatus(`加载失败：${error?.message || error}`, 'error');
  els.loadBtn.disabled = false;
}

function cleanupCurrentSpine() {
  if (state.spineObject) {
    state.spineObject.destroy({ children: true });
  }
  state.spineObject = null;
  state.overlay = null;
  state.bounds = null;
  state.selected = null;
  state.hiddenSlots.clear();
  state.hiddenSlotAttachments.clear();
  refreshSlotList();
}

function revokeAllObjectUrls() {
  for (const url of state.urls) URL.revokeObjectURL(url);
  state.urls = [];
}

function registerUrl(url) {
  state.urls.push(url);
  return url;
}

function parseAtlasPageNames(atlasText) {
  const lines = atlasText.split(/\r?\n/);
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

async function buildAtlasImageMap(pageNames, imageFiles) {
  const imageMap = {};
  const warnings = [];
  const byName = new Map(imageFiles.map((file) => [file.name.toLowerCase(), file]));
  const byBase = new Map(imageFiles.map((file) => [baseName(file.name), file]));

  if (pageNames.length === 0) {
    if (imageFiles[0]) {
      imageMap.default = await createTextureSource(imageFiles[0]);
      warnings.push('未从 atlas 中解析出 page 名称，已退回使用首张图片作为默认贴图来源。');
    }
    return { imageMap, warnings };
  }

  for (const pageName of pageNames) {
    let file = byName.get(pageName.toLowerCase()) || byBase.get(baseName(pageName));
    if (!file) {
      file = imageFiles[0];
      warnings.push(`atlas 引用的页面 ${pageName} 未找到同名图片，已退回使用 ${file?.name || '首张图片'}。`);
    }
    if (file) {
      imageMap[pageName] = await createTextureSource(file);
    }
  }

  return { imageMap, warnings };
}

async function createTextureSource(file) {
  const bitmap = await createImageBitmap(file);
  return TextureSource.from(bitmap);
}

function baseName(name) {
  return name.split('/').pop().split('\\').pop().toLowerCase();
}

function populateAnimationSelect() {
  const animations = state.spineObject?.skeleton?.data?.animations || [];
  els.animationSelect.innerHTML = '';
  for (const animation of animations) {
    const option = document.createElement('option');
    option.value = animation.name;
    option.textContent = animation.name;
    els.animationSelect.appendChild(option);
  }
}

function populateSkinSelect() {
  const skins = state.spineObject?.skeleton?.data?.skins || [];
  els.skinSelect.innerHTML = '';
  for (const skin of skins) {
    const option = document.createElement('option');
    option.value = skin.name;
    option.textContent = skin.name;
    els.skinSelect.appendChild(option);
  }
}

function applySelectedAnimation() {
  if (!state.spineObject) return;
  const name = els.animationSelect.value;
  state.spineObject.state.clearTracks();
  if (name) {
    state.spineObject.state.setAnimation(0, name, els.loopCheckbox.checked);
  }
}

function applySelectedSkin() {
  if (!state.spineObject) return;
  const skinName = els.skinSelect.value;
  if (skinName) {
    const skin = state.spineObject.skeleton.data.findSkin(skinName);
    if (!skin) {
      throw new Error(`Skin not found: ${skinName}`);
    }
    state.spineObject.skeleton.setSkin(skin);
    state.spineObject.skeleton.setSlotsToSetupPose();
    applySlotVisibility();
  }
}

function forcePoseRefresh() {
  if (!state.spineObject) return;
  state.spineObject.state.update(0);
  state.spineObject.state.apply(state.spineObject.skeleton);
  applySlotVisibility();
  state.spineObject.skeleton.updateWorldTransform(spine.Physics.update);
  drawOverlay();
}

function fitSpineToView({ resetRotation = false } = {}) {
  if (!state.spineObject) return;
  const skeleton = state.spineObject.skeleton;
  const offset = new spine.Vector2();
  const size = new spine.Vector2();
  const temp = [];
  skeleton.getBounds(offset, size, temp);

  const padding = 60;
  const availableWidth = Math.max(els.viewport.clientWidth - padding * 2, 100);
  const availableHeight = Math.max(els.viewport.clientHeight - padding * 2, 100);
  const width = Math.max(size.x, 1);
  const height = Math.max(size.y, 1);
  const scale = Math.min(availableWidth / width, availableHeight / height);
  const rotation = resetRotation ? 0 : state.spineObject.rotation;
  const position = computeAnchoredPosition({
    anchor: getViewportCenter(),
    local: {
      x: offset.x + width / 2,
      y: offset.y + height / 2,
    },
    scale,
    rotation,
  });

  state.spineObject.scale.set(scale);
  state.spineObject.rotation = rotation;
  state.spineObject.position.set(position.x, position.y);

  drawOverlay();
  syncStageControls();
}

function onViewportWheel(event) {
  if (!state.spineObject) return;
  event.preventDefault();

  const currentScale = state.spineObject.scale.x || 1;
  const rect = state.app.canvas.getBoundingClientRect();
  const pointX = event.clientX - rect.left;
  const pointY = event.clientY - rect.top;
  const anchor = { x: pointX, y: pointY };
  const local = state.spineObject.toLocal(anchor);
  const next = computeZoomAtPoint({
    currentScale,
    deltaY: event.deltaY,
    anchor,
    local,
    rotation: state.spineObject.rotation,
  });

  state.spineObject.scale.set(next.scale);
  state.spineObject.position.set(next.position.x, next.position.y);

  drawOverlay();
  syncStageControls();
}

function setPlayback(playing) {
  state.playing = playing;
  if (state.spineObject) {
    state.spineObject.autoUpdate = playing;
  }
  els.playPauseBtn.textContent = playing ? '暂停' : '播放';
}

function onStagePointerDown(event) {
  if (!state.spineObject) return;
  if (event.button !== 0) return;

  state.pan.active = true;
  state.pan.dragging = false;
  state.pan.pointerId = event.pointerId;
  state.pan.startPoint = { x: event.global.x, y: event.global.y };
  state.pan.startPosition = {
    x: state.spineObject.position.x,
    y: state.spineObject.position.y,
  };
}

function onStagePointerMove(event) {
  if (!state.spineObject || !isActivePanEvent(event)) return;

  const currentPoint = { x: event.global.x, y: event.global.y };
  const moveX = currentPoint.x - state.pan.startPoint.x;
  const moveY = currentPoint.y - state.pan.startPoint.y;
  if (!state.pan.dragging && Math.hypot(moveX, moveY) < 4) return;

  state.pan.dragging = true;
  els.viewport.classList.add('is-panning');
  const position = computePanPosition({
    startPosition: state.pan.startPosition,
    startPoint: state.pan.startPoint,
    currentPoint,
  });
  state.spineObject.position.set(position.x, position.y);
  drawOverlay();
}

function onStagePointerUp(event) {
  if (!state.spineObject || !isActivePanEvent(event)) return;
  const wasDragging = state.pan.dragging;
  resetPanState();

  if (wasDragging) return;

  const local = state.spineObject.toLocal(event.global);
  const hit = hitTest(local.x, local.y);

  if (!hit) {
    clearSelection();
    return;
  }

  state.selected = hit;
  if (els.pauseOnSelectCheckbox.checked) setPlayback(false);
  refreshSelectionPanel();
  syncTransformInputsFromSelection();
  refreshTransformPanel();
  drawOverlay();
}

function onStagePointerUpOutside(event) {
  if (isActivePanEvent(event)) resetPanState();
}

function isActivePanEvent(event) {
  return state.pan.active && state.pan.pointerId === event.pointerId;
}

function resetPanState() {
  state.pan.active = false;
  state.pan.dragging = false;
  state.pan.pointerId = null;
  state.pan.startPoint = null;
  state.pan.startPosition = null;
  els.viewport.classList.remove('is-panning');
}

function hitTest(x, y) {
  const bboxHit = hitTestBoundingBoxes(x, y);
  if (bboxHit) return bboxHit;
  return hitTestRenderedAttachments(x, y);
}

function hitTestBoundingBoxes(x, y) {
  if (!state.bounds || !state.spineObject) return null;
  state.bounds.update(state.spineObject.skeleton, true);
  const bbox = state.bounds.aabbContainsPoint(x, y) ? state.bounds.containsPoint(x, y) : null;
  if (!bbox) return null;

  const slot = state.spineObject.skeleton.drawOrder.find((item) => item.attachment === bbox)
    || state.spineObject.skeleton.slots.find((item) => item.attachment === bbox);

  if (!slot) return null;

  return {
    type: 'boundingBox',
    slot,
    attachment: bbox,
    polygon: state.bounds.getPolygon(bbox),
  };
}

function hitTestRenderedAttachments(x, y) {
  const drawOrder = state.spineObject?.skeleton?.drawOrder || [];

  for (let i = drawOrder.length - 1; i >= 0; i -= 1) {
    const slot = drawOrder[i];
    const attachment = slot.attachment;
    if (!attachment) continue;

    if (Array.isArray(attachment.triangles) || attachment.triangles?.length) {
      const vertices = new Float32Array(attachment.worldVerticesLength);
      attachment.computeWorldVertices(slot, 0, attachment.worldVerticesLength, vertices, 0, 2);
      if (pointInTriangles(x, y, vertices, attachment.triangles)) {
        return {
          type: 'mesh',
          slot,
          attachment,
          vertices: Array.from(vertices),
          triangles: Array.from(attachment.triangles),
        };
      }
      continue;
    }

    if (attachment.worldVerticesLength === 8 && typeof attachment.computeWorldVertices === 'function') {
      try {
        const vertices = new Float32Array(8);
        attachment.computeWorldVertices(slot, vertices, 0, 2);
        if (pointInPolygon(x, y, vertices)) {
          return {
            type: 'region',
            slot,
            attachment,
            vertices: Array.from(vertices),
          };
        }
      } catch {
        // 某些 attachment 并不匹配 region 的函数签名，忽略即可。
      }
    }
  }

  return null;
}

function pointInPolygon(x, y, vertices) {
  let inside = false;
  const points = Array.from(vertices);
  for (let i = 0, j = points.length - 2; i < points.length; i += 2) {
    const xi = points[i];
    const yi = points[i + 1];
    const xj = points[j];
    const yj = points[j + 1];

    const intersects = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-8) + xi);
    if (intersects) inside = !inside;
    j = i;
  }
  return inside;
}

function pointInTriangles(x, y, vertices, triangles) {
  for (let i = 0; i < triangles.length; i += 3) {
    const ia = triangles[i] * 2;
    const ib = triangles[i + 1] * 2;
    const ic = triangles[i + 2] * 2;

    if (pointInTriangle(
      x,
      y,
      vertices[ia], vertices[ia + 1],
      vertices[ib], vertices[ib + 1],
      vertices[ic], vertices[ic + 1],
    )) {
      return true;
    }
  }
  return false;
}

function pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const v0x = cx - ax;
  const v0y = cy - ay;
  const v1x = bx - ax;
  const v1y = by - ay;
  const v2x = px - ax;
  const v2y = py - ay;

  const dot00 = v0x * v0x + v0y * v0y;
  const dot01 = v0x * v1x + v0y * v1y;
  const dot02 = v0x * v2x + v0y * v2y;
  const dot11 = v1x * v1x + v1y * v1y;
  const dot12 = v1x * v2x + v1y * v2y;

  const denominator = dot00 * dot11 - dot01 * dot01;
  if (Math.abs(denominator) < 1e-8) return false;

  const inv = 1 / denominator;
  const u = (dot11 * dot02 - dot01 * dot12) * inv;
  const v = (dot00 * dot12 - dot01 * dot02) * inv;
  return u >= 0 && v >= 0 && u + v <= 1;
}

function drawOverlay() {
  if (!state.overlay || !state.spineObject) return;
  state.overlay.clear();

  if (els.showBoundsCheckbox.checked && state.bounds) {
    state.bounds.update(state.spineObject.skeleton, true);
    for (const bbox of state.bounds.boundingBoxes) {
      const polygon = state.bounds.getPolygon(bbox);
      if (polygon) drawPolygon(polygon, 0x4cc9f0, 0.28);
    }
  }

  if (!state.selected) return;

  if (state.selected.type === 'boundingBox' && state.selected.polygon) {
    drawPolygon(state.selected.polygon, 0x90f1ff, 0.95);
  }

  if (state.selected.type === 'region' && state.selected.vertices) {
    drawPolygon(state.selected.vertices, 0x90f1ff, 0.95);
  }

  if (state.selected.type === 'mesh' && state.selected.vertices && state.selected.triangles) {
    drawMeshOutline(state.selected.vertices, state.selected.triangles, 0x90f1ff, 0.95);
  }

  const bone = state.selected.slot?.bone;
  if (bone) {
    state.overlay
      .circle(bone.worldX, bone.worldY, 6)
      .fill({ color: 0xffd166, alpha: 0.95 });
  }
}

function drawPolygon(vertices, color, alpha) {
  if (!vertices || vertices.length < 4) return;
  state.overlay.moveTo(vertices[0], vertices[1]);
  for (let i = 2; i < vertices.length; i += 2) {
    state.overlay.lineTo(vertices[i], vertices[i + 1]);
  }
  state.overlay.lineTo(vertices[0], vertices[1]);
  state.overlay.stroke({ color, pixelLine: true, alpha });
}

function drawMeshOutline(vertices, triangles, color, alpha) {
  for (let i = 0; i < triangles.length; i += 3) {
    const ia = triangles[i] * 2;
    const ib = triangles[i + 1] * 2;
    const ic = triangles[i + 2] * 2;
    state.overlay
      .moveTo(vertices[ia], vertices[ia + 1])
      .lineTo(vertices[ib], vertices[ib + 1])
      .lineTo(vertices[ic], vertices[ic + 1])
      .lineTo(vertices[ia], vertices[ia + 1])
      .stroke({ color, pixelLine: true, alpha });
  }
}

function applySlotVisibility() {
  if (!state.spineObject) return;

  for (const slot of state.spineObject.skeleton.slots) {
    const slotName = slot.data.name;

    if (state.hiddenSlots.has(slotName)) {
      if (slot.attachment) {
        state.hiddenSlotAttachments.set(slotName, slot.attachment);
      }
      slot.setAttachment(null);
      continue;
    }

    if (!slot.attachment && state.hiddenSlotAttachments.has(slotName)) {
      slot.setAttachment(state.hiddenSlotAttachments.get(slotName));
    }

    state.hiddenSlotAttachments.delete(slotName);
  }
}

function refreshSlotList() {
  const slots = state.spineObject?.skeleton?.slots || [];

  if (!slots.length) {
    els.slotList.className = 'slot-list empty';
    els.slotList.innerHTML = '<div>No slots loaded</div>';
    els.slotSearchCount.textContent = '0';
    refreshFilteredSlotsToggle([]);
    return;
  }

  const filteredSlots = getFilteredSlots();
  els.slotSearchCount.textContent = `${filteredSlots.length}/${slots.length}`;
  refreshFilteredSlotsToggle(filteredSlots);

  if (!filteredSlots.length) {
    els.slotList.className = 'slot-list empty';
    els.slotList.innerHTML = '<div>未找到匹配的 Slot</div>';
    return;
  }

  els.slotList.className = 'slot-list';
  els.slotList.innerHTML = filteredSlots.map((slot) => {
    const name = slot.data.name;
    const isShown = !state.hiddenSlots.has(name);
    const active = state.selected?.slot?.data?.name === name ? ' active' : '';

    return `
      <label class="slot-item${active}">
        <div class="slot-meta">
          <div class="slot-name">${escapeHtml(name)}</div>
          <div class="slot-bone">${escapeHtml(slot.bone?.data?.name || '-')}</div>
        </div>
        <span class="slot-toggle">
          <input type="checkbox" data-slot-toggle="${escapeHtml(name)}" ${isShown ? 'checked' : ''} />
          <span>${isShown ? 'Shown' : 'Hidden'}</span>
        </span>
      </label>
    `;
  }).join('');

  for (const input of els.slotList.querySelectorAll('[data-slot-toggle]')) {
    input.addEventListener('change', onSlotToggleChange);
  }

  scrollSelectedSlotIntoView();
}

function onSlotToggleChange(event) {
  const slotName = event.currentTarget.dataset.slotToggle;
  if (!slotName || !state.spineObject) return;

  if (event.currentTarget.checked) {
    state.hiddenSlots.delete(slotName);
  } else {
    state.hiddenSlots.add(slotName);
    if (state.selected?.slot?.data?.name === slotName) {
      clearSelection(false);
    }
  }

  applySlotVisibility();
  state.spineObject.skeleton.updateWorldTransform(spine.Physics.update);
  refreshSlotList();
  drawOverlay();
  setStatus(`Slot visibility updated: ${slotName}`, 'ok');
}

function onFilteredSlotsToggleChange(event) {
  if (!state.spineObject) return;
  const filteredSlots = getFilteredSlots();
  const visible = event.currentTarget.checked;

  applyBulkSlotVisibility(filteredSlots, state.hiddenSlots, visible);
  if (state.selected && state.hiddenSlots.has(state.selected.slot.data.name)) {
    clearSelection(false);
  }
  applySlotVisibility();
  state.spineObject.skeleton.updateWorldTransform(spine.Physics.update);
  refreshSlotList();
  drawOverlay();
  setStatus(`${visible ? 'Shown' : 'Hidden'} ${filteredSlots.length} filtered slots`, 'ok');
}

function getFilteredSlots() {
  const slots = state.spineObject?.skeleton?.slots || [];
  const query = els.slotSearchInput.value;
  return slots.filter((slot) => slotMatchesSearch(slot, query));
}

function refreshFilteredSlotsToggle(filteredSlots) {
  const enabled = filteredSlots.length > 0;
  const bulkState = getBulkSlotVisibilityState(filteredSlots, state.hiddenSlots);

  els.filteredSlotsToggle.disabled = !enabled;
  els.filteredSlotsToggle.checked = enabled && bulkState.checked;
  els.filteredSlotsToggle.indeterminate = enabled && bulkState.indeterminate;
  els.filteredSlotsToggleText.textContent = enabled
    ? `搜索结果：${bulkState.label}`
    : '搜索结果：无匹配';
}

async function exportPng(mode) {
  if (!state.spineObject || !state.app?.renderer?.extract) return;

  const snapshot = captureSkeletonSnapshot();
  const hiddenSlots = new Set(state.hiddenSlots);
  const hiddenSlotAttachments = new Map(state.hiddenSlotAttachments);
  const overlayVisible = state.overlay?.visible ?? true;

  try {
    if (state.overlay) state.overlay.visible = false;

    if (mode === 'setup') {
      state.hiddenSlots.clear();
      state.hiddenSlotAttachments.clear();
      state.spineObject.skeleton.setToSetupPose();
      applySelectedSkin();
      applySlotVisibility();
      state.spineObject.skeleton.updateWorldTransform(spine.Physics.update);
    } else {
      applySlotVisibility();
      state.spineObject.skeleton.updateWorldTransform(spine.Physics.update);
    }

    const target = getPngExportTarget({
      mode,
      stage: state.app.stage,
      spineObject: state.spineObject,
    });

    state.app.renderer.extract.download({
      target,
      filename: buildExportFileName(mode),
    });
    setStatus(`PNG exported: ${mode === 'setup' ? 'setup pose' : 'current pose'}`, 'ok');
  } finally {
    restoreSkeletonSnapshot(snapshot);
    state.hiddenSlots.clear();
    for (const slotName of hiddenSlots) state.hiddenSlots.add(slotName);
    state.hiddenSlotAttachments.clear();
    for (const [slotName, attachment] of hiddenSlotAttachments.entries()) {
      state.hiddenSlotAttachments.set(slotName, attachment);
    }
    applySlotVisibility();
    state.spineObject.skeleton.updateWorldTransform(spine.Physics.update);
    if (state.overlay) state.overlay.visible = overlayVisible;
    refreshSlotList();
    drawOverlay();
  }
}

function captureSkeletonSnapshot() {
  const skeleton = state.spineObject?.skeleton;
  if (!skeleton) return null;

  return {
    skeletonX: skeleton.x,
    skeletonY: skeleton.y,
    bones: skeleton.bones.map((bone) => ({
      x: bone.x,
      y: bone.y,
      rotation: bone.rotation,
      scaleX: bone.scaleX,
      scaleY: bone.scaleY,
      shearX: bone.shearX,
      shearY: bone.shearY,
    })),
    slots: skeleton.slots.map((slot) => ({
      attachment: slot.attachment,
      color: {
        r: slot.color.r,
        g: slot.color.g,
        b: slot.color.b,
        a: slot.color.a,
      },
    })),
  };
}

function restoreSkeletonSnapshot(snapshot) {
  const skeleton = state.spineObject?.skeleton;
  if (!snapshot || !skeleton) return;

  skeleton.x = snapshot.skeletonX;
  skeleton.y = snapshot.skeletonY;

  skeleton.bones.forEach((bone, index) => {
    const saved = snapshot.bones[index];
    if (!saved) return;
    bone.x = saved.x;
    bone.y = saved.y;
    bone.rotation = saved.rotation;
    bone.scaleX = saved.scaleX;
    bone.scaleY = saved.scaleY;
    bone.shearX = saved.shearX;
    bone.shearY = saved.shearY;
  });

  skeleton.slots.forEach((slot, index) => {
    const saved = snapshot.slots[index];
    if (!saved) return;
    slot.color.set(saved.color.r, saved.color.g, saved.color.b, saved.color.a);
    slot.setAttachment(saved.attachment);
  });
}

function buildExportFileName(mode) {
  const skeletonFile = els.skeletonFile.files?.[0]?.name?.replace(/\.[^.]+$/, '') || 'spine';
  return `${skeletonFile}-${mode}.png`;
}

function scrollSelectedSlotIntoView() {
  const selectedSlotName = state.selected?.slot?.data?.name;
  if (!selectedSlotName) return;

  const selectedInput = els.slotList.querySelector(`[data-slot-toggle="${escapeSelector(selectedSlotName)}"]`);
  const selectedItem = selectedInput?.closest('.slot-item');

  if (selectedItem) {
    selectedItem.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  }
}

function clearSelection(showMessage = true) {
  state.selected = null;
  refreshSelectionPanel();
  refreshSlotList();
  refreshTransformPanel();
  if (state.overlay) state.overlay.clear();
}

function refreshSelectionPanel() {
  if (!state.selected?.slot) {
    els.selectedSlotSummary.textContent = '尚未选中 slot';
    els.selectedSlotSummary.className = 'summary selected-slot-summary empty';
    els.selectionInfo.className = 'info-grid empty';
    els.selectionInfo.innerHTML = '<div>尚未选中任何部位</div>';
    refreshSlotList();
    return;
  }

  const slot = state.selected.slot;
  const bone = slot.bone;
  const attachment = slot.attachment;

  els.selectedSlotSummary.textContent = `已选中 slot：${slot.data?.name || '-'}`;
  els.selectedSlotSummary.className = 'summary selected-slot-summary ok';

  const rows = [
    ['命中类型', state.selected.type],
    ['Slot', slot.data?.name || '-'],
    ['Bone', bone?.data?.name || '-'],
    ['Attachment', attachment?.name || '-'],
    ['Attachment 类型', attachment?.constructor?.name || '-'],
    ['Slot 索引', String(slot.data?.index ?? '-')],
    ['Bone 世界坐标', bone ? `${bone.worldX.toFixed(2)}, ${bone.worldY.toFixed(2)}` : '-'],
  ];

  els.selectionInfo.className = 'info-grid';
  els.selectionInfo.innerHTML = rows
    .map(([key, value]) => `<div class="key">${escapeHtml(key)}</div><div class="value">${escapeHtml(value)}</div>`)
    .join('');
  refreshSlotList();
}

function syncTransformInputsFromSelection() {
  const bone = state.selected?.slot?.bone;
  for (const input of els.transformInputs) {
    input.value = bone ? String(roundValue(bone[input.dataset.transform])) : '';
  }
}

function applyStageScale(scale) {
  const anchor = getViewportCenter();
  const local = state.spineObject.toLocal(anchor);
  const nextScale = Math.min(Math.max(scale, STAGE_SCALE_LIMITS.min), STAGE_SCALE_LIMITS.max);
  const position = computeAnchoredPosition({
    anchor,
    local,
    scale: nextScale,
    rotation: state.spineObject.rotation,
  });

  state.spineObject.scale.set(nextScale);
  state.spineObject.position.set(position.x, position.y);
  drawOverlay();
  syncStageControls();
}

function applyStageRotation(rotationDegrees) {
  const anchor = getViewportCenter();
  const local = state.spineObject.toLocal(anchor);
  const rotation = degreesToRadians(normalizeStageRotation(rotationDegrees));
  const position = computeAnchoredPosition({
    anchor,
    local,
    scale: state.spineObject.scale.x || 1,
    rotation,
  });

  state.spineObject.rotation = rotation;
  state.spineObject.position.set(position.x, position.y);
  drawOverlay();
  syncStageControls();
}

function resetStageView() {
  if (!state.spineObject) return;
  fitSpineToView({ resetRotation: true });
}

function syncStageControls() {
  const hasSpine = !!state.spineObject;
  els.stageScaleInput.disabled = !hasSpine;
  els.stageRotationInput.disabled = !hasSpine;
  els.resetViewBtn.disabled = !hasSpine;

  if (!hasSpine) {
    els.stageScaleInput.value = '1';
    els.stageRotationInput.value = '0';
    els.stageScaleValue.textContent = '100%';
    els.stageRotationValue.textContent = '0deg';
    return;
  }

  const scale = roundViewportValue(state.spineObject.scale.x || 1);
  const rotation = roundViewportValue(normalizeStageRotation(radiansToDegrees(state.spineObject.rotation || 0)));
  els.stageScaleInput.value = String(scale);
  els.stageRotationInput.value = String(rotation);
  els.stageScaleValue.textContent = `${Math.round(scale * 100)}%`;
  els.stageRotationValue.textContent = `${rotation}deg`;
}

function getViewportCenter() {
  return {
    x: els.viewport.clientWidth / 2,
    y: els.viewport.clientHeight / 2,
  };
}

function refreshTransformPanel() {
  const enabled = !!state.selected?.slot?.bone;
  for (const input of els.transformInputs) input.disabled = !enabled;
  els.applyTransformBtn.disabled = !enabled;
  els.resetBoneBtn.disabled = !enabled;
  els.clearSelectionBtn.disabled = !enabled;
}

function roundValue(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

function setStatus(text, tone = '') {
  els.status.className = `status ${tone}`.trim();
  els.status.closest('.resource-info')?.setAttribute('data-tone', tone || 'idle');
  els.status.textContent = text;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeSelector(text) {
  if (globalThis.CSS?.escape) {
    return globalThis.CSS.escape(String(text));
  }

  return String(text).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}
