import './style.css';
import { Application, Graphics, Point, Rectangle } from 'pixi.js';
import { matchAtlasImages, parseAtlasPages, readSkeletonAsset, usesPma } from './resources.js';
import { loadSpineResources } from './runtimes.js';

const els = {
  viewport: document.getElementById('viewport'),
  skeletonFile: document.getElementById('skeletonFile'),
  atlasFile: document.getElementById('atlasFile'),
  imageFiles: document.getElementById('imageFiles'),
  alphaMode: document.getElementById('alphaMode'),
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
  slotList: document.getElementById('slotList'),
  resourceSummary: document.getElementById('resourceSummary'),
  status: document.getElementById('status'),
  transformInputs: [...document.querySelectorAll('[data-transform]')],
};

const state = {
  app: null,
  spineObject: null,
  overlay: null,
  bounds: null,
  selected: null,
  playing: true,
  core: null,
  disposeResources: null,
  refreshRenderPose: null,
  regionUsesBone: false,
  hiddenSlots: new Set(),
  hiddenSlotAttachments: new Map(),
};

boot().catch((error) => {
  console.error(error);
  setStatus(`初始化失败：${error?.message || error}`, 'error');
});

async function boot() {
  const app = new Application({
    resizeTo: els.viewport,
    antialias: true,
    backgroundAlpha: 0,
  });

  els.viewport.appendChild(app.view);
  app.stage.eventMode = 'static';
  app.stage.hitArea = new Rectangle(0, 0, els.viewport.clientWidth, els.viewport.clientHeight);
  app.stage.on('pointerdown', onStagePointerDown);
  app.view.addEventListener('wheel', onViewportWheel, { passive: false });

  state.app = app;

  app.ticker.add(() => {
    if (!state.spineObject || !state.overlay) return;
    if (state.playing) state.spineObject.update(app.ticker.deltaMS / 1000);
    applySlotVisibility();
    if (state.hiddenSlots.size) state.refreshRenderPose?.();
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
    resetSkeletonPose();
    if (els.animationSelect.value) applySelectedAnimation();
    forcePoseRefresh();
    drawOverlay();
    syncTransformInputsFromSelection();
  });

  els.applyTransformBtn.addEventListener('click', () => {
    if (!state.selected?.slot?.bone) return;
    const selectedBone = state.selected.slot.bone;
    const bone = bonePose(selectedBone);
    for (const input of els.transformInputs) {
      bone[input.dataset.transform] = Number(input.value || 0);
    }
    updateWorldTransform();
    drawOverlay();
    refreshSelectionPanel();
    setStatus(`已应用 Bone：${selectedBone.data.name}`, 'ok');
  });

  els.resetBoneBtn.addEventListener('click', () => {
    if (!state.selected?.slot?.bone) return;
    const bone = state.selected.slot.bone;
    if (bone.setupPose) bone.setupPose();
    else bone.setToSetupPose();
    updateWorldTransform();
    syncTransformInputsFromSelection();
    drawOverlay();
    refreshSelectionPanel();
    setStatus(`已重置 Bone：${state.selected.slot.bone.data.name}`, 'ok');
  });

  els.clearSelectionBtn.addEventListener('click', clearSelection);
  els.exportCurrentBtn.addEventListener('click', () => exportPng('current').catch(handleLoadError));
  els.exportSetupBtn.addEventListener('click', () => exportPng('setup').catch(handleLoadError));

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

  const atlasText = await atlasFile.text();
  const pages = parseAtlasPages(atlasText);
  const imageMap = matchAtlasImages(pages, imageFiles);
  const skeletonScale = Number(els.skeletonScale.value || 1);
  const { asset, version } = readSkeletonAsset(new Uint8Array(await skeletonFile.arrayBuffer()));
  const alphaMode = els.alphaMode.value;
  setStatus(`正在使用 Spine ${version} 对应运行库加载…`, 'warn');
  const resources = await loadSpineResources({ asset, version, atlasText, pages, imageMap, scale: skeletonScale, alphaMode });

  cleanupCurrentSpine();
  state.spineObject = resources.object;
  state.core = resources.core;
  state.disposeResources = resources.dispose;
  state.refreshRenderPose = resources.refresh;
  state.regionUsesBone = resources.regionUsesBone;
  state.bounds = resources.bounds;
  state.overlay = new Graphics();
  state.overlay.eventMode = 'none';
  state.spineObject.addChild(state.overlay);
  state.app.stage.addChild(state.spineObject);

  populateAnimationSelect();
  populateSkinSelect();
  refreshSlotList();
  applySelectedSkin();
  applySelectedAnimation();
  forcePoseRefresh();
  fitSpineToView();
  setPlayback(true);
  clearSelection(false);

  const modes = pages.map((page) => `${page.name}：${usesPma(page, alphaMode) ? 'PMA' : '直通 Alpha'}`);
  setStatus(`加载成功 · Spine ${version}\n${modes.join('\n')}\n支持点击选择 slot / bone / attachment。`, 'ok');
  els.loadBtn.disabled = false;
}

function handleLoadError(error) {
  console.error(error);
  setStatus(`加载失败：${error?.message || error}`, 'error');
  els.loadBtn.disabled = false;
}

function cleanupCurrentSpine() {
  state.disposeResources?.();
  state.disposeResources = null;
  state.refreshRenderPose = null;
  state.core = null;
  state.spineObject = null;
  state.overlay = null;
  state.bounds = null;
  state.selected = null;
  state.hiddenSlots.clear();
  state.hiddenSlotAttachments.clear();
  refreshSlotList();
}

function updateWorldTransform() {
  state.spineObject.skeleton.updateWorldTransform(state.core.Physics?.update);
  state.refreshRenderPose?.();
}

function resetSkeletonPose(slotsOnly = false) {
  const skeleton = state.spineObject.skeleton;
  if (slotsOnly) (skeleton.setSlotsToSetupPose || skeleton.setupPoseSlots).call(skeleton);
  else (skeleton.setToSetupPose || skeleton.setupPose).call(skeleton);
}

function bonePose(bone) {
  return bone.pose || bone;
}

function slotPose(slot) {
  return slot.pose || slot;
}

function slotAttachment(slot) {
  return (slot.appliedPose || slot).attachment;
}

function setSlotAttachment(slot, attachment) {
  slotPose(slot).setAttachment(attachment);
  if (slot.appliedPose && slot.appliedPose !== slot.pose) slot.appliedPose.setAttachment(attachment);
}

function drawOrder() {
  const order = state.spineObject.skeleton.drawOrder;
  return order.appliedPose || order;
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
    resetSkeletonPose(true);
    applySlotVisibility();
  }
}

function forcePoseRefresh() {
  if (!state.spineObject) return;
  state.spineObject.state.update(0);
  state.spineObject.state.apply(state.spineObject.skeleton);
  applySlotVisibility();
  updateWorldTransform();
  drawOverlay();
}

function fitSpineToView() {
  if (!state.spineObject) return;
  const skeleton = state.spineObject.skeleton;
  const offset = new Point();
  const size = new Point();
  const temp = [];
  skeleton.getBounds(offset, size, temp);

  const padding = 60;
  const availableWidth = Math.max(els.viewport.clientWidth - padding * 2, 100);
  const availableHeight = Math.max(els.viewport.clientHeight - padding * 2, 100);
  const width = Math.max(size.x, 1);
  const height = Math.max(size.y, 1);
  const scale = Math.min(availableWidth / width, availableHeight / height);

  state.spineObject.scale.set(scale);
  state.spineObject.position.set(
    els.viewport.clientWidth / 2 - (offset.x + width / 2) * scale,
    els.viewport.clientHeight / 2 - (offset.y + height / 2) * scale,
  );

  drawOverlay();
}

function onViewportWheel(event) {
  if (!state.spineObject) return;
  event.preventDefault();

  const currentScale = state.spineObject.scale.x || 1;
  const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
  const newScale = clamp(currentScale * factor, 0.05, 20);
  const rect = state.app.canvas.getBoundingClientRect();
  const pointX = event.clientX - rect.left;
  const pointY = event.clientY - rect.top;
  const local = state.spineObject.toLocal({ x: pointX, y: pointY });

  state.spineObject.scale.set(newScale);
  state.spineObject.position.set(
    pointX - local.x * newScale,
    pointY - local.y * newScale,
  );

  drawOverlay();
}

function setPlayback(playing) {
  state.playing = playing;
  els.playPauseBtn.textContent = playing ? '暂停' : '播放';
}

function onStagePointerDown(event) {
  if (!state.spineObject) return;
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
  setStatus(`已选中 slot：${hit.slot.data.name}`, 'ok');
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

  const slot = drawOrder().find((item) => slotAttachment(item) === bbox)
    || state.spineObject.skeleton.slots.find((item) => slotAttachment(item) === bbox);

  if (!slot) return null;

  return {
    type: 'boundingBox',
    slot,
    attachment: bbox,
    polygon: state.bounds.getPolygon(bbox),
  };
}

function hitTestRenderedAttachments(x, y) {
  const slots = drawOrder();

  for (let i = slots.length - 1; i >= 0; i -= 1) {
    const slot = slots[i];
    const attachment = slotAttachment(slot);
    if (!attachment) continue;

    if (Array.isArray(attachment.triangles) || attachment.triangles?.length) {
      const vertices = new Float32Array(attachment.worldVerticesLength);
      if (slot.pose) attachment.computeWorldVertices(state.spineObject.skeleton, slot, 0, attachment.worldVerticesLength, vertices, 0, 2);
      else attachment.computeWorldVertices(slot, 0, attachment.worldVerticesLength, vertices, 0, 2);
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

    if (attachment instanceof state.core.RegionAttachment) {
      try {
        const vertices = new Float32Array(8);
        if (slot.pose) attachment.computeWorldVertices(slot, attachment.getOffsets(slot.appliedPose), vertices, 0, 2);
        else if (state.regionUsesBone) attachment.computeWorldVertices(slot.bone, vertices, 0, 2);
        else attachment.computeWorldVertices(slot, vertices, 0, 2);
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
    const world = bone.appliedPose || bone;
    state.overlay.lineStyle(0).beginFill(0xffd166, 0.95)
      .drawCircle(world.worldX, world.worldY, 6).endFill();
  }
}

function drawPolygon(vertices, color, alpha) {
  if (!vertices || vertices.length < 4) return;
  state.overlay.lineStyle({ width: 1, color, alpha, native: true });
  state.overlay.moveTo(vertices[0], vertices[1]);
  for (let i = 2; i < vertices.length; i += 2) {
    state.overlay.lineTo(vertices[i], vertices[i + 1]);
  }
  state.overlay.lineTo(vertices[0], vertices[1]);
}

function drawMeshOutline(vertices, triangles, color, alpha) {
  state.overlay.lineStyle({ width: 1, color, alpha, native: true });
  for (let i = 0; i < triangles.length; i += 3) {
    const ia = triangles[i] * 2;
    const ib = triangles[i + 1] * 2;
    const ic = triangles[i + 2] * 2;
    state.overlay
      .moveTo(vertices[ia], vertices[ia + 1])
      .lineTo(vertices[ib], vertices[ib + 1])
      .lineTo(vertices[ic], vertices[ic + 1])
      .lineTo(vertices[ia], vertices[ia + 1]);
  }
}

function applySlotVisibility() {
  if (!state.spineObject) return;

  for (const slot of state.spineObject.skeleton.slots) {
    const slotName = slot.data.name;

    if (state.hiddenSlots.has(slotName)) {
      if (slotAttachment(slot)) {
        state.hiddenSlotAttachments.set(slotName, slotAttachment(slot));
      }
      setSlotAttachment(slot, null);
      continue;
    }

    if (!slotAttachment(slot) && state.hiddenSlotAttachments.has(slotName)) {
      setSlotAttachment(slot, state.hiddenSlotAttachments.get(slotName));
    }

    state.hiddenSlotAttachments.delete(slotName);
  }
}

function refreshSlotList() {
  const slots = state.spineObject?.skeleton?.slots || [];

  if (!slots.length) {
    els.slotList.className = 'slot-list empty';
    els.slotList.innerHTML = '<div>No slots loaded</div>';
    return;
  }

  els.slotList.className = 'slot-list';
  els.slotList.innerHTML = slots.map((slot) => {
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
  updateWorldTransform();
  refreshSlotList();
  drawOverlay();
  setStatus(`Slot visibility updated: ${slotName}`, 'ok');
}

async function exportPng(mode) {
  if (!state.spineObject || !state.app?.renderer?.extract) return;

  const snapshot = captureSkeletonSnapshot();
  const hiddenSlots = new Set(state.hiddenSlots);
  const hiddenSlotAttachments = new Map(state.hiddenSlotAttachments);
  const overlayVisible = state.overlay?.visible ?? true;
  const wasPlaying = state.playing;
  state.playing = false;

  try {
    if (state.overlay) state.overlay.visible = false;

    if (mode === 'setup') {
      state.hiddenSlots.clear();
      state.hiddenSlotAttachments.clear();
      resetSkeletonPose();
      applySelectedSkin();
      applySlotVisibility();
      updateWorldTransform();
    } else {
      applySlotVisibility();
      updateWorldTransform();
    }

    const link = document.createElement('a');
    link.download = buildExportFileName(mode);
    link.href = await state.app.renderer.extract.base64(state.spineObject);
    link.click();
    setStatus(`PNG exported: ${mode === 'setup' ? 'setup pose' : 'current pose'}`, 'ok');
  } finally {
    restoreSkeletonSnapshot(snapshot);
    state.playing = wasPlaying;
    state.hiddenSlots.clear();
    for (const slotName of hiddenSlots) state.hiddenSlots.add(slotName);
    state.hiddenSlotAttachments.clear();
    for (const [slotName, attachment] of hiddenSlotAttachments.entries()) {
      state.hiddenSlotAttachments.set(slotName, attachment);
    }
    applySlotVisibility();
    updateWorldTransform();
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
      x: bonePose(bone).x,
      y: bonePose(bone).y,
      rotation: bonePose(bone).rotation,
      scaleX: bonePose(bone).scaleX,
      scaleY: bonePose(bone).scaleY,
      shearX: bonePose(bone).shearX,
      shearY: bonePose(bone).shearY,
    })),
    slots: skeleton.slots.map((slot) => ({
      attachment: slotPose(slot).attachment,
      color: {
        r: slotPose(slot).color.r,
        g: slotPose(slot).color.g,
        b: slotPose(slot).color.b,
        a: slotPose(slot).color.a,
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
    bone = bonePose(bone);
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
    slotPose(slot).color.set(saved.color.r, saved.color.g, saved.color.b, saved.color.a);
    setSlotAttachment(slot, saved.attachment);
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
  if (showMessage && state.spineObject) setStatus('未命中任何 slot。', 'warn');
}

function refreshSelectionPanel() {
  if (!state.selected?.slot) {
    els.selectionInfo.className = 'info-grid empty';
    els.selectionInfo.innerHTML = '<div>尚未选中任何部位</div>';
    refreshSlotList();
    return;
  }

  const slot = state.selected.slot;
  const bone = slot.bone;
  const attachment = slotAttachment(slot);
  const world = bone && (bone.appliedPose || bone);

  const rows = [
    ['命中类型', state.selected.type],
    ['Slot', slot.data?.name || '-'],
    ['Bone', bone?.data?.name || '-'],
    ['Attachment', attachment?.name || '-'],
    ['Attachment 类型', attachment?.constructor?.name || '-'],
    ['Slot 索引', String(slot.data?.index ?? '-')],
    ['Bone 世界坐标', world ? `${world.worldX.toFixed(2)}, ${world.worldY.toFixed(2)}` : '-'],
  ];

  els.selectionInfo.className = 'info-grid';
  els.selectionInfo.innerHTML = rows
    .map(([key, value]) => `<div class="key">${escapeHtml(key)}</div><div class="value">${escapeHtml(value)}</div>`)
    .join('');
  refreshSlotList();
}

function syncTransformInputsFromSelection() {
  const selectedBone = state.selected?.slot?.bone;
  const bone = selectedBone && bonePose(selectedBone);
  for (const input of els.transformInputs) {
    input.value = bone ? String(roundValue(bone[input.dataset.transform])) : '';
  }
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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function setStatus(text, tone = '') {
  els.status.className = `status ${tone}`.trim();
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
