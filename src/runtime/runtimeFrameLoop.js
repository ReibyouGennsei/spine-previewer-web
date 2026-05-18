export function runRuntimeFrameLoop({
  runtime,
  app,
  spineObject,
  playing,
  beforeRender,
}) {
  if (!runtime?.usesManualTicker || !app || !spineObject) return;

  if (playing) {
    runtime.updateSpineObject?.(spineObject, getTickerDeltaSeconds(app));
  }

  beforeRender?.();
  runtime.renderApplication?.(app);
}

function getTickerDeltaSeconds(app) {
  const deltaMS = Number(app?.ticker?.deltaMS);
  if (!Number.isFinite(deltaMS) || deltaMS < 0) return 0;
  return deltaMS / 1000;
}
