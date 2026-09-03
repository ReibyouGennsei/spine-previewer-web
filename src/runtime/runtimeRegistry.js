export const DEFAULT_RUNTIME_ID = 'spine42-pixi8';

export const RUNTIME_OPTIONS = [
  {
    id: 'spine42-pixi8',
    label: 'Spine 4.2 / PixiJS 8',
    spineVersion: '4.2',
    pixiVersion: '8',
    // 4.0 / 4.1 JSON is upgraded on the fly (see upgradeSkeletonJsonForSpine42); .skel needs an exact match.
    supportedSpineVersions: ['4.2'],
    upgradableJsonVersions: ['4.0', '4.1'],
  },
  {
    id: 'spine41-pixi6',
    label: 'Spine 4.1 / PixiJS 6.5.10',
    spineVersion: '4.1',
    pixiVersion: '6.5.10',
    // pixi-spine's 4.1 loader natively reads 4.0 and 4.1 exports.
    supportedSpineVersions: ['4.0', '4.1'],
    upgradableJsonVersions: [],
  },
];

export function getRuntimeOption(id) {
  return RUNTIME_OPTIONS.find((option) => option.id === id) || RUNTIME_OPTIONS[0];
}

/**
 * Picks the runtime that natively supports a detected skeleton version (e.g. { majorMinor: '4.0' }).
 * Returns null when no runtime supports it (for example Spine 3.8 exports).
 */
export function getRecommendedRuntimeId(version) {
  const majorMinor = version?.majorMinor;
  if (!majorMinor) return null;
  const option = RUNTIME_OPTIONS.find((item) => item.supportedSpineVersions.includes(majorMinor));
  return option ? option.id : null;
}

/**
 * Returns 'native', 'upgradable' (JSON only, converted on load) or 'unsupported'
 * for loading a skeleton of the given version with the given runtime.
 */
export function getRuntimeCompatibility(runtimeId, version, { isBinary = false } = {}) {
  const option = getRuntimeOption(runtimeId);
  const majorMinor = version?.majorMinor;
  if (!majorMinor) return 'unknown';
  if (option.supportedSpineVersions.includes(majorMinor)) return 'native';
  if (!isBinary && option.upgradableJsonVersions.includes(majorMinor)) return 'upgradable';
  return 'unsupported';
}

export async function loadRuntime(id) {
  const option = getRuntimeOption(id);
  if (option.id === 'spine41-pixi6') {
    return (await import('./pixi6Spine41Runtime.js')).default;
  }
  return (await import('./pixi8Spine42Runtime.js')).default;
}
