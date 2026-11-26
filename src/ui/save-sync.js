import { getPreferences, worldState } from '../core/state.js';
import { CampusCourier, readExplorerProgress } from '../race/courier.js';
import { friendArchiveTransaction, friendScoreKey, readFriendScores, readSavedFriendGhost } from '../replay/ghost.js';
import { setActiveWeather } from '../render/atmosphere.js';
import { readDriverProfile, savedBike, savedVehicleTunings } from '../ride/vehicles.js';

export const SAVE_FORMAT = 'litchi-save';
export const SAVE_VERSION = 1;
let saveSyncTimer = null;
let saveSyncBusy = false;
let saveHydrated = false;

let saveCallbacks = {
  getOnlineRoom: () => worldState.onlineRoom,
  isOnlineAppMode: () => false,
  readPreferences: () => getPreferences(),
  fillPreferences: () => {},
  applyTouchSize: () => {},
  showBikeSetup: () => {},
  rebuildCourseHud: () => {},
  updateHud: () => {},
  setText: (el, text) => { if (el && el.textContent !== text) el.textContent = text; },
};

export function bindSaveUi(callbacks) {
  saveCallbacks = { ...saveCallbacks, ...callbacks };
}

export function collectLocalStorageSave() {
  const storage = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('szu-litchi-') || key.startsWith('checkpoints:'))) {
        storage[key] = localStorage.getItem(key);
      }
    }
  } catch { throw new Error('无法读取浏览器存档。'); }
  return storage;
}

export async function collectFriendArchiveSave() {
  const friends = [];
  try {
    const scores = await readFriendScores();
    for (const score of scores ?? []) {
      const replay = await readSavedFriendGhost(score.id);
      if (typeof replay !== 'string') return null;
      friends.push({ score, replay });
    }
  } catch { return null; }
  return friends;
}

export async function buildSaveSnapshot() {
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    updatedAt: new Date().toISOString(),
    storage: collectLocalStorageSave(),
    friends: await collectFriendArchiveSave(),
  };
}

export async function applySaveSnapshot(snapshot, { preferIncoming = false } = {}) {
  if (!snapshot || snapshot.format !== SAVE_FORMAT || snapshot.version !== SAVE_VERSION ||
      !snapshot.storage || typeof snapshot.storage !== 'object' || Array.isArray(snapshot.storage)) {
    throw new Error('请选择有效的 FORZERO: BUDGET（或荔园环骑）存档文件。');
  }
  try {
    for (const [key, value] of Object.entries(snapshot.storage)) {
      if (typeof value !== 'string') continue;
      if (!key.startsWith('szu-litchi-') && !key.startsWith('checkpoints:')) continue;
      const existing = localStorage.getItem(key);
      if (key.startsWith('checkpoints:') && existing && !preferIncoming) {
        try {
          const cur = JSON.parse(existing), inc = JSON.parse(value);
          if (typeof cur?.time === 'number' && typeof inc?.time === 'number' && cur.time <= inc.time) continue;
        } catch {}
      }
      if (existing === null || preferIncoming || key.startsWith('checkpoints:')) {
        localStorage.setItem(key, value);
      }
    }
  } catch { throw new Error('无法写入浏览器存档。'); }

  if (Array.isArray(snapshot.friends) && snapshot.friends.length) {
    try {
      await friendArchiveTransaction(['scores', 'replays'], 'readwrite', transaction => {
        const scores = transaction.objectStore('scores'), replays = transaction.objectStore('replays');
        for (const item of snapshot.friends) {
          if (!item?.score || typeof item.replay !== 'string') continue;
          const { campus, courseId, seed, layout, name, vehicle, time } = item.score;
          if (!campus || !courseId || !layout || !name || !vehicle || typeof time !== 'number') continue;
          const cleanScore = { campus, courseId, seed: seed ?? null, layout, name, vehicle, time };
          const matches = scores.index('result').openKeyCursor(friendScoreKey.map(field => cleanScore[field]));
          matches.onsuccess = () => {
            const match = matches.result;
            if (!match) {
              const write = scores.add(cleanScore);
              write.onsuccess = () => replays.add(item.replay, write.result);
              return;
            }
            const cur = replays.get(match.primaryKey);
            cur.onsuccess = () => { if (cur.result !== item.replay) match.continue(); };
          };
        }
      });
    } catch { throw new Error('无法写入友人对战记录。'); }
  }

  // Reload in-memory profile, tunings, display preferences and HUD cleanly (preserving shared object references)
  const driverProfile = worldState.driverProfile;
  const vehicleTunings = worldState.vehicleTunings;
  const preferences = getPreferences();
  const race = worldState.race;
  const onlineRoom = saveCallbacks.getOnlineRoom?.() ?? worldState.onlineRoom;
  const ui = worldState.ui;

  if (driverProfile) Object.assign(driverProfile, readDriverProfile());
  if (vehicleTunings) Object.assign(vehicleTunings, savedVehicleTunings());
  if (preferences) Object.assign(preferences, saveCallbacks.readPreferences());
  saveCallbacks.fillPreferences();
  saveCallbacks.applyTouchSize?.();
  if (!onlineRoom) setActiveWeather(race?.event?.environment?.weather ?? preferences.weather);
  CampusCourier.progress = readExplorerProgress();
  if (race) {
    race.bike = savedBike();
    race.rider.bike = race.bike;
    if (!onlineRoom && race.phase === 'free') {
      if (driverProfile) race.setVehicle(driverProfile.vehicle);
      race.freeRide();
    }
  }
  if (ui?.driverName && driverProfile) ui.driverName.value = driverProfile.name;
  saveCallbacks.showBikeSetup();
  saveCallbacks.rebuildCourseHud();
  saveCallbacks.updateHud();
}

export async function flushLocalSave(keepalive = false) {
  if (!saveCallbacks.isOnlineAppMode() || !saveHydrated) return;
  if (saveSyncBusy) {
    if (!keepalive) scheduleLocalSave();
    return;
  }
  saveSyncBusy = true;
  const ui = worldState.ui;
  try {
    const snapshot = keepalive
      ? { format: SAVE_FORMAT, version: SAVE_VERSION, updatedAt: new Date().toISOString(), storage: collectLocalStorageSave(), friends: null }
      : await buildSaveSnapshot();
    const response = await fetch('/app/save', {
      method: 'POST',
      keepalive,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    });
    if (response.status === 409) {
      const data = await response.json();
      if (ui?.saveStatus) saveCallbacks.setText(ui.saveStatus, data.error);
    }
  } catch {}
  finally { saveSyncBusy = false; }
}

export function scheduleLocalSave() {
  if (!saveCallbacks.isOnlineAppMode()) return;
  clearTimeout(saveSyncTimer);
  saveSyncTimer = setTimeout(() => { void flushLocalSave(false); }, 400);
}

export async function hydrateLocalSave() {
  if (!saveCallbacks.isOnlineAppMode()) return;
  const ui = worldState.ui;
  try {
    const response = await fetch('/app/save', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      if (response.status === 409) {
        const data = await response.json();
        if (ui?.saveStatus) saveCallbacks.setText(ui.saveStatus, data.error);
      }
      return;
    }
    const payload = await response.json().catch(() => null);
    if (!payload || typeof payload.exists !== 'boolean') return;
    if (payload?.exists && payload.data) {
      await applySaveSnapshot(payload.data, { preferIncoming: false });
    } else if (payload.exists) return;
    saveHydrated = true;
    scheduleLocalSave();
  } catch {}
}

export async function exportSaveFile() {
  const ui = worldState.ui;
  let snapshot;
  try { snapshot = await buildSaveSnapshot(); }
  catch (error) { if (ui?.saveStatus) saveCallbacks.setText(ui.saveStatus, error.message); return; }
  const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `litchi-save-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  if (ui?.saveStatus) {
    saveCallbacks.setText(ui.saveStatus, snapshot.friends === null
      ? '已导出个人存档，暂时无法读取友人对战记录。'
      : '已导出存档备份（含个人最佳、全车型改装与友人对战）。');
  }
}

export async function importSaveFile(file) {
  const ui = worldState.ui;
  if (!file) return;
  try {
    if (file.size > 10_000_000) throw new Error('存档文件过大。');
    const parsed = JSON.parse(await file.text());
    await applySaveSnapshot(parsed, { preferIncoming: true });
    scheduleLocalSave();
    if (ui?.saveStatus) saveCallbacks.setText(ui.saveStatus, '存档已导入并生效。');
  } catch (error) {
    if (ui?.saveStatus) saveCallbacks.setText(ui.saveStatus, error?.message ?? '存档导入失败。');
  }
}

worldState.hooks.scheduleSave = scheduleLocalSave;
