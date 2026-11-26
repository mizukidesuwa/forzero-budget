import { clamp } from './core/math.js';
import { getActiveCampus, setActiveCampus } from './core/state.js';
import { getOnlineRoom } from './online/client.js';
import { checkpointRecordKey } from './race/records.js';
import { setActiveWeather } from './render/atmosphere.js';
import { applySaveSnapshot, buildSaveSnapshot } from './ui/save-sync.js';
import { along, courseFrame, plannedSpeed } from './world/geometry.js';
import { courseGround } from './world/query.js';

/**
 * Installs a single namespaced `__FORZERO__` harness bridge on `globalThis`
 * for automated browser tests and performance probes, keeping `src/entry.js`
 * free of global namespace pollution.
 */
export function installDebugBridge(bridge) {
  const api = {
    PREF_KEY: bridge.PREF_KEY,
    race: bridge.race,
    ui: bridge.ui,
    preferences: bridge.preferences,
    canvas: bridge.canvas,
    stage: bridge.stage,
    openSettings: bridge.openSettings,
    closeSettings: bridge.closeSettings,
    updateHud: bridge.updateHud,
    arriveAtStation: bridge.arriveAtStation,
    setActiveWeather,
    checkpointRecordKey,
    buildSaveSnapshot,
    applySaveSnapshot,
    courseFrame,
    courseGround,
    along,
    clamp,
    plannedSpeed,
  };

  Object.defineProperties(api, {
    ready: { get: bridge.isReady, set: bridge.setReady, enumerable: true },
    activeCampus: { get: getActiveCampus, set: setActiveCampus, enumerable: true },
    pendingCampus: { get: bridge.getPendingCampus, set: bridge.setPendingCampus, enumerable: true },
    cameraRevision: { get: bridge.getCameraRevision, set: bridge.setCameraRevision, enumerable: true },
    onlineRoom: { get: getOnlineRoom, enumerable: true },
  });

  Object.defineProperty(globalThis, '__FORZERO__', {
    value: api,
    configurable: true,
    enumerable: false,
  });
  return api;
}
