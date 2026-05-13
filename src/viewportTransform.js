export const STAGE_SCALE_LIMITS = {
  min: 0.05,
  max: 20,
};

export const STAGE_ROTATION_LIMITS = {
  min: -180,
  max: 180,
};

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function roundViewportValue(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

export function degreesToRadians(degrees) {
  return degrees * (Math.PI / 180);
}

export function radiansToDegrees(radians) {
  return radians * (180 / Math.PI);
}

export function normalizeStageRotation(degrees) {
  return clamp(Number(degrees) || 0, STAGE_ROTATION_LIMITS.min, STAGE_ROTATION_LIMITS.max);
}

export function computeAnchoredPosition({ anchor, local, scale, rotation }) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const scaledX = local.x * scale;
  const scaledY = local.y * scale;

  return {
    x: anchor.x - (scaledX * cos - scaledY * sin),
    y: anchor.y - (scaledX * sin + scaledY * cos),
  };
}

export function computeZoomAtPoint({ currentScale, deltaY, anchor, local, rotation }) {
  const factor = deltaY < 0 ? 1.1 : 1 / 1.1;
  const scale = clamp(currentScale * factor, STAGE_SCALE_LIMITS.min, STAGE_SCALE_LIMITS.max);

  return {
    scale,
    position: computeAnchoredPosition({ anchor, local, scale, rotation }),
  };
}

export function computePanPosition({ startPosition, startPoint, currentPoint }) {
  return {
    x: startPosition.x + currentPoint.x - startPoint.x,
    y: startPosition.y + currentPoint.y - startPoint.y,
  };
}
