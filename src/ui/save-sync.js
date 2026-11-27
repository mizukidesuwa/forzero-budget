import { desktopInstallId } from '../core/browser-storage.js';
import { getPreferences, getStorage, worldState } from '../core/state.js';
import { desktopSaveTiming } from '../data/interface.js';
import { blindNavRules, chaseRules } from '../data/modes.js';
import { recordRules } from '../data/race.js';
import { BlindNav } from '../race/blind-nav.js';
import { ShadowChase } from '../race/chase.js';
import { CampusCourier, readExplorerProgress } from '../race/courier.js';
import saveRules from '../data/shared-rules.cjs';
import { friendArchiveTransaction, friendScoreKey, readFriendScores, readSavedFriendGhost, recordingRules, validReplay } from '../replay/ghost.js';
import { setActiveWeather } from '../render/atmosphere.js';
import { CUSTOM_SKIN_KEY, refreshRiderSkinRegistry, restoredRiderSkinLibrary } from '../ride/rider-skin.js';
import { DRIVER_KEY, knownVehicle, readDriverProfile, savedBike, savedVehicleTunings } from '../ride/vehicles.js';

export const SAVE_FORMAT = 'litchi-save';
export const SAVE_VERSION = 1;
const { MAX_SAVE_BYTES } = saveRules;
const saveEncoder = new TextEncoder();
const pendingRecordImportKey = 'forzero-pending-record-import';
const retrySaveMessage = '桌面存档写入失败，正在重试。';
let saveSyncTimer = null;
let saveSyncBusy = false;
let saveHydrated = false;
let retryStatusText = null;
let restoreVehiclePending = false;
let pendingRestores = 0;
let restoreQueue = Promise.resolve();

let saveCallbacks = {
  getOnlineRoom: () => worldState.onlineRoom,
  isOnlineAppMode: () => false,
  isVehicleRestoreLocked: () => false,
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

export function applyPendingSaveVehicle({ restarting = false } = {}) {
  if (!restoreVehiclePending) return;
  const { race, driverProfile, vehicleTunings, ui } = worldState;
  const room = saveCallbacks.getOnlineRoom();
  if ((!restarting && race && race.phase !== 'free') || room?.state?.phase === 'race' || saveCallbacks.isVehicleRestoreLocked()) return;
  restoreVehiclePending = false;
  if (driverProfile) {
    const profile = readDriverProfile();
    if (!profile.skinSpec) {
      delete driverProfile.skinSpec;
      delete driverProfile.skinSpecHash;
    }
    Object.assign(driverProfile,profile);
  }
  if (vehicleTunings) Object.assign(vehicleTunings, savedVehicleTunings());
  if (race) {
    if (race.phase !== 'free') race.freeRide();
    race.setBike(savedBike());
    if (!room && driverProfile) race.setVehicle(driverProfile.vehicle);
    worldState.hooks.refreshBicycleModels?.();
  }
  if (ui?.driverName && driverProfile) ui.driverName.value = driverProfile.name;
  saveCallbacks.showBikeSetup();
}

const standaloneSaveKeys = new Set([CUSTOM_SKIN_KEY, blindNavRules.storageKey, chaseRules.storageKey]);
const isSaveKey = key => standaloneSaveKeys.has(key) || key.startsWith('szu-litchi-') || key.startsWith('checkpoints:');

function pendingRecordImports(raw) {
  try {
    const keys = JSON.parse(raw)?.keys;
    return new Set(Array.isArray(keys) ? keys : []);
  } catch { return new Set(); }
}

function savedRecord(raw, gateCount) {
  if (!raw || raw.length > recordRules.maxBytes) return null;
  try {
    const record = JSON.parse(raw);
    return validReplay(record, gateCount ?? record?.splits?.length) && !record.unranked && !record.blind &&
      record.time > recordRules.minTime && record.time <= recordingRules(knownVehicle(record.vehicle)).limit ? record : null;
  } catch { return null; }
}

function keepBrowserRecord(existing, incoming, imported) {
  const diskRecord = savedRecord(incoming);
  const localRecord = savedRecord(existing, diskRecord?.splits.length);
  return Boolean(localRecord && (imported || !diskRecord || localRecord.time < diskRecord.time));
}

export function collectLocalStorageSave() {
  const storage = {};
  try {
    const browserStorage = getStorage();
    if (!browserStorage) throw new Error();
    const keys = browserStorage.keys?.() ?? Array.from({ length: browserStorage.length }, (_, i) => browserStorage.key(i));
    for (const key of keys) {
      if (key && isSaveKey(key)) {
        const value = browserStorage.getItem(key);
        if (value !== null) storage[key] = value;
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

export function encodeSaveSnapshot(snapshot) {
  const complete = JSON.stringify(snapshot);
  if (saveEncoder.encode(complete).length <= MAX_SAVE_BYTES) return { body:complete, archiveTooLarge:false };
  const personal = JSON.stringify({ ...snapshot, friends:null });
  if (saveEncoder.encode(personal).length > MAX_SAVE_BYTES) throw new Error('个人存档过大。');
  return { body:personal, archiveTooLarge:Array.isArray(snapshot.friends) };
}

export function applySaveSnapshot(snapshot, options) {
  pendingRestores++;
  const result = restoreQueue.then(() => restoreSaveSnapshot(snapshot, options)).finally(() => { pendingRestores--; });
  restoreQueue = result.catch(() => {});
  return result;
}

async function restoreSaveSnapshot(snapshot, { preferIncoming = false, fromDisk = false, rememberImport = false } = {}) {
  if (!snapshot || snapshot.format !== SAVE_FORMAT || snapshot.version !== SAVE_VERSION ||
      !snapshot.storage || typeof snapshot.storage !== 'object' || Array.isArray(snapshot.storage)) {
    throw new Error('请选择有效的 FORZERO: BUDGET（或荔园环骑）存档文件。');
  }
  const storage = getStorage();
  if (!storage) throw new Error('无法写入浏览器存档。');
  const updatedRecords = new Set();
  const changes = [];
  const applied = [];
  let imported;
  const stage = (key, value, previous) => {
    if (value !== previous) changes.push({ key, value, previous });
  };
  const write = () => {
    try {
      for (const change of changes) {
        const { key, value } = change;
        const previous = storage.getItem(key);
        const checkpoint = key.startsWith('checkpoints:');
        if (fromDisk && checkpoint && previous !== value && previous !== change.previous &&
            keepBrowserRecord(previous, value, imported.has(key))) continue;
        if (previous !== value) {
          storage.setItem(key, value);
          applied.push({ key, value, previous });
        }
        if (checkpoint) updatedRecords.add(key);
      }
    } catch { throw new Error('无法写入浏览器存档。'); }
  };
  const rollback = () => {
    for (const { key, value, previous } of applied.reverse()) {
      if (storage.getItem(key) !== value) continue;
      if (previous === null) storage.removeItem(key);
      else storage.setItem(key, previous);
    }
  };
  const entries = Object.entries(snapshot.storage).filter(([key]) => isSaveKey(key));
  if (entries.some(([,value]) => typeof value !== 'string') ||
      (snapshot.friends != null && !Array.isArray(snapshot.friends))) {
    throw new Error('存档包含无效的玩家资料。');
  }
  try {
    const previousImport = fromDisk || rememberImport ? storage.getItem(pendingRecordImportKey) : null;
    imported = pendingRecordImports(previousImport);
    for (const [key, value] of entries) {
      if (key===CUSTOM_SKIN_KEY) continue;
      const existing = storage.getItem(key);
      if (key.startsWith('checkpoints:') && existing && fromDisk && existing !== value) {
        if (keepBrowserRecord(existing, value, imported.has(key))) continue;
      } else if (key.startsWith('checkpoints:') && existing && !preferIncoming) {
        try {
          const cur = JSON.parse(existing), inc = JSON.parse(value);
          if (typeof cur?.time === 'number' && typeof inc?.time === 'number' && cur.time <= inc.time) continue;
        } catch {}
      }
      if (existing === null || preferIncoming || key.startsWith('checkpoints:')) {
        stage(key, value, existing);
      }
    }
    let profile = null;
    try { profile = JSON.parse(changes.find(change => change.key === DRIVER_KEY)?.value ?? storage.getItem(DRIVER_KEY)); } catch {}
    const raw = snapshot.storage[CUSTOM_SKIN_KEY];
    const previousLibrary = storage.getItem(CUSTOM_SKIN_KEY);
    const library = restoredRiderSkinLibrary(raw, previousLibrary, profile, preferIncoming);
    if (library !== null) stage(CUSTOM_SKIN_KEY, library, previousLibrary);
    if (rememberImport) {
      const recordKeys = entries.filter(([key]) => key.startsWith('checkpoints:')).map(([key]) => key);
      if (recordKeys.length) {
        // Keep a deliberate overwrite across a shutdown before the disk acknowledges it.
        for (const key of recordKeys) imported.add(key);
        stage(pendingRecordImportKey, JSON.stringify({ token: crypto.randomUUID(), keys: [...imported] }), previousImport);
      }
    }
  } catch { throw new Error('无法写入浏览器存档。'); }

  try {
    if (snapshot.friends?.length) {
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
        write();
      });
    } else write();
  } catch (error) {
    try { rollback(); }
    catch {
      saveHydrated = false;
      throw new Error('浏览器拒绝还原旧存档，请检查可用存储空间。');
    }
    if (error.message === '无法写入浏览器存档。') throw error;
    throw new Error('无法写入友人对战记录。');
  }

  refreshRiderSkinRegistry();
  worldState.race?.refreshRestoredRecords(updatedRecords);
  ShadowChase.refreshProgress();
  BlindNav.refreshProgress();
  const preferences = getPreferences();
  const race = worldState.race;
  const onlineRoom = saveCallbacks.getOnlineRoom?.() ?? worldState.onlineRoom;
  if (preferences) Object.assign(preferences, saveCallbacks.readPreferences());
  saveCallbacks.fillPreferences();
  saveCallbacks.applyTouchSize?.();
  if (!onlineRoom) setActiveWeather(race?.event?.environment?.weather ?? preferences.weather);
  CampusCourier.progress = readExplorerProgress();
  restoreVehiclePending = true;
  applyPendingSaveVehicle();
  saveCallbacks.rebuildCourseHud();
  saveCallbacks.updateHud();
}

export async function flushLocalSave(keepalive = false) {
  if (!desktopInstallId || !saveCallbacks.isOnlineAppMode() || !saveHydrated) return;
  if (saveSyncBusy || pendingRestores) {
    if (!keepalive) scheduleLocalSave();
    return;
  }
  saveSyncBusy = true;
  const ui = worldState.ui;
  let retry = false;
  try {
    const storage = getStorage();
    const pendingImport = storage?.getItem(pendingRecordImportKey);
    const snapshot = keepalive
      ? { format: SAVE_FORMAT, version: SAVE_VERSION, updatedAt: new Date().toISOString(), storage: collectLocalStorageSave(), friends: null }
      : await buildSaveSnapshot();
    let { body, archiveTooLarge } = encodeSaveSnapshot(snapshot);
    const post = body => fetch('/app/save', {
      method: 'POST',
      keepalive,
      cache: 'no-store',
      signal: keepalive ? undefined : AbortSignal.timeout(desktopSaveTiming.timeoutMs),
      headers: { 'Content-Type': 'application/json', 'X-Forzero-Installation': desktopInstallId },
      body,
    });
    let response = await post(body);
    if (response.status===413 && Array.isArray(snapshot.friends) && !archiveTooLarge) {
      ({ body } = encodeSaveSnapshot({ ...snapshot, friends:null }));
      archiveTooLarge = true;
      response = await post(body);
    }
    if (response.ok) {
      if (pendingImport && storage.getItem(pendingRecordImportKey) === pendingImport) storage.removeItem(pendingRecordImportKey);
      if (ui?.saveStatus) {
        if (archiveTooLarge) saveCallbacks.setText(ui.saveStatus, '友人对战档案过大，已自动保存个人成绩、车库和皮肤库。');
        else if (retryStatusText && ui.saveStatus.textContent === retryStatusText) saveCallbacks.setText(ui.saveStatus, '桌面存档已保存。');
      }
      retryStatusText = null;
    } else if (response.status === 409 || response.status === 413) {
      const data = await response.json().catch(() => null);
      if (ui?.saveStatus) saveCallbacks.setText(ui.saveStatus, data?.error ?? '桌面存档写入失败。');
    } else {
      retry = response.status >= 500 || response.status === 408 || response.status === 429;
      if (!retry && ui?.saveStatus) saveCallbacks.setText(ui.saveStatus, '桌面存档写入失败。');
    }
  } catch (error) {
    if (error?.message==='个人存档过大。') {
      if (ui?.saveStatus) saveCallbacks.setText(ui.saveStatus,error.message);
    } else retry = true;
  } finally {
    saveSyncBusy = false;
    if (retry && !keepalive && saveHydrated) {
      if (ui?.saveStatus) {
        saveCallbacks.setText(ui.saveStatus, retrySaveMessage);
        retryStatusText = ui.saveStatus.textContent;
      }
      if (saveSyncTimer === null) scheduleLocalSave(desktopSaveTiming.retryMs);
    }
  }
}

export function scheduleLocalSave(delay = desktopSaveTiming.debounceMs) {
  if (!saveCallbacks.isOnlineAppMode()) return;
  clearTimeout(saveSyncTimer);
  saveSyncTimer = setTimeout(() => {
    saveSyncTimer = null;
    void flushLocalSave(false);
  }, delay);
}

export async function hydrateLocalSave() {
  if (!desktopInstallId || !saveCallbacks.isOnlineAppMode()) return;
  const ui = worldState.ui;
  try {
    const response = await fetch('/app/save', { cache: 'no-store', signal: AbortSignal.timeout(desktopSaveTiming.timeoutMs) });
    if (!response.ok) {
      if (response.status === 409) {
        const data = await response.json();
        if (ui?.saveStatus) saveCallbacks.setText(ui.saveStatus, data.error);
      }
      return;
    }
    const payload = await response.json().catch(() => null);
    if (payload?.instanceId !== desktopInstallId || typeof payload.exists !== 'boolean') return;
    if (payload?.exists && payload.data) {
      await applySaveSnapshot(payload.data, { preferIncoming: true, fromDisk: true });
    } else if (payload.exists) return;
    saveHydrated = true;
    scheduleLocalSave();
  } catch (error) {
    if (ui?.saveStatus) saveCallbacks.setText(ui.saveStatus, error.message);
  }
}

export async function exportSaveFile() {
  const ui = worldState.ui;
  let snapshot, output;
  try { snapshot = await buildSaveSnapshot(); output = encodeSaveSnapshot(snapshot); }
  catch (error) { if (ui?.saveStatus) saveCallbacks.setText(ui.saveStatus, error.message); return; }
  const url = URL.createObjectURL(new Blob([output.body], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `litchi-save-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  if (ui?.saveStatus) {
    saveCallbacks.setText(ui.saveStatus, output.archiveTooLarge
      ? '友人对战档案过大，已导出个人成绩、车库和皮肤库。'
      : snapshot.friends === null
      ? '已导出个人存档，暂时无法读取友人对战记录。'
      : '已导出存档备份（含个人最佳、全车型改装与友人对战）。');
  }
}

export async function importSaveFile(file) {
  const ui = worldState.ui;
  if (!file) return;
  try {
    if (file.size > MAX_SAVE_BYTES) throw new Error('存档文件过大。');
    const parsed = JSON.parse(await file.text());
    await applySaveSnapshot(parsed, { preferIncoming: true, rememberImport: Boolean(desktopInstallId && saveCallbacks.isOnlineAppMode()) });
    scheduleLocalSave();
    if (ui?.saveStatus) saveCallbacks.setText(ui.saveStatus, restoreVehiclePending
      ? '存档已导入。车辆配置将在返回自由骑行或重新发车时生效。'
      : '存档已导入并生效。');
  } catch (error) {
    if (ui?.saveStatus) saveCallbacks.setText(ui.saveStatus, error?.message ?? '存档导入失败。');
  }
}

worldState.hooks.scheduleSave = scheduleLocalSave;
