export const interfaceScale = Object.freeze({ min: 50, max: 150, step: 5, normal: 100 });

export const desktopSaveTiming = Object.freeze({ debounceMs: 400, retryMs: 5000, timeoutMs: 8000, pendingConflictRetries: 3 });

export const cameraViews = Object.freeze({
  third: { tag: '3P', label: '第三人称' },
  first: { tag: '1P', label: '第一人称' },
  second: { tag: '2P', label: '第二人称（前方回看）' },
});

export function knownCameraView(value) {
  return typeof value === 'string' && Object.hasOwn(cameraViews, value) ? value : 'third';
}

export const alternateCamera = Object.freeze({
  // Lens height above the rider position in world meters.
  first: { eye: { bike: 1.78, ebike: 1.72, trail: 1.82, chair: 1.42 }, forward: .18, look: 14, near: .20 },
  second: { forward: 6, side: .7, height: 2.65, lookHeight: 1.30 },
  terrainClearance: .12,
});

const previousTouchSizes = { compact: 80, standard: 100, large: 110 };

function normaliseScale(value, fallback) {
  if (typeof value === 'string' && /^\d+$/.test(value)) value = Number(value);
  if (!Number.isFinite(value)) return fallback;
  const { min, max, step } = interfaceScale;
  return Math.max(min, Math.min(max, Math.round(value / step) * step));
}

export function knownHudScale(value) {
  return normaliseScale(value, 'auto');
}

export function knownTouchSize(value) {
  const legacy = typeof value === 'string' && Object.hasOwn(previousTouchSizes, value);
  return normaliseScale(legacy ? previousTouchSizes[value] : value, interfaceScale.normal);
}
