import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGE_SCALE_LIMITS,
  computeAnchoredPosition,
  computePanPosition,
  computeZoomAtPoint,
  degreesToRadians,
  normalizeStageRotation,
  roundViewportValue,
} from './viewportTransform.js';

test('zoom computes a clamped scale and preserves the local point under the anchor', () => {
  const result = computeZoomAtPoint({
    currentScale: 2,
    deltaY: -1,
    anchor: { x: 300, y: 200 },
    local: { x: 50, y: 20 },
    rotation: 0,
  });

  assert.equal(result.scale, 2.2);
  assert.deepEqual(result.position, { x: 190, y: 156 });
});

test('zoom clamps to the supported scale range', () => {
  const zoomIn = computeZoomAtPoint({
    currentScale: 100,
    deltaY: -1,
    anchor: { x: 0, y: 0 },
    local: { x: 0, y: 0 },
    rotation: 0,
  });
  const zoomOut = computeZoomAtPoint({
    currentScale: 0.01,
    deltaY: 1,
    anchor: { x: 0, y: 0 },
    local: { x: 0, y: 0 },
    rotation: 0,
  });

  assert.equal(zoomIn.scale, STAGE_SCALE_LIMITS.max);
  assert.equal(zoomOut.scale, STAGE_SCALE_LIMITS.min);
});

test('anchored position accounts for rotation', () => {
  const position = computeAnchoredPosition({
    anchor: { x: 100, y: 100 },
    local: { x: 10, y: 0 },
    scale: 2,
    rotation: degreesToRadians(90),
  });

  assert.equal(roundViewportValue(position.x), 100);
  assert.equal(roundViewportValue(position.y), 80);
});

test('pan position follows pointer delta', () => {
  const position = computePanPosition({
    startPosition: { x: 20, y: 40 },
    startPoint: { x: 100, y: 120 },
    currentPoint: { x: 116, y: 112 },
  });

  assert.deepEqual(position, { x: 36, y: 32 });
});

test('stage rotation is limited to slider bounds', () => {
  assert.equal(normalizeStageRotation(240), 180);
  assert.equal(normalizeStageRotation(-240), -180);
});
