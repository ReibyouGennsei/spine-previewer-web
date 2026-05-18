export const DEFAULT_RUNTIME_ID = 'spine42-pixi8';

export const RUNTIME_OPTIONS = [
  {
    id: 'spine42-pixi8',
    label: 'Spine 4.2 / PixiJS 8',
    spineVersion: '4.2',
    pixiVersion: '8',
  },
  {
    id: 'spine41-pixi6',
    label: 'Spine 4.1 / PixiJS 6.5.10',
    spineVersion: '4.1',
    pixiVersion: '6.5.10',
  },
];

export function getRuntimeOption(id) {
  return RUNTIME_OPTIONS.find((option) => option.id === id) || RUNTIME_OPTIONS[0];
}
