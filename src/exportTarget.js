export function getPngExportTarget({ mode, stage, spineObject }) {
  return mode === 'current' ? stage : spineObject;
}
