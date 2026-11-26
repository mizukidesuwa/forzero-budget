const SAVE_FORMAT = 'litchi-save';
const SAVE_VERSION = 1;
let saveSyncTimer = null;
let saveSyncBusy = false;
let saveHydrated = false;

function collectLocalStorageSave() {
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

async function collectFriendArchiveSave() {
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

async function buildSaveSnapshot() {
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    updatedAt: new Date().toISOString(),
    storage: collectLocalStorageSave(),
    friends: await collectFriendArchiveSave(),
  };
}

async function applySaveSnapshot(snapshot, { preferIncoming = false } = {}) {
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

  // Reload in-memory profile, tunings, display preferences and HUD cleanly
  Object.assign(driverProfile, readDriverProfile());
  Object.assign(vehicleTunings, savedVehicleTunings());
  Object.assign(preferences, readPreferences());
  fillPreferences();
  if (typeof applyTouchSize === 'function') applyTouchSize();
  if (!onlineRoom) setActiveWeather(race.event?.environment?.weather ?? preferences.weather);
  if (typeof CampusCourier !== 'undefined') CampusCourier.progress = readExplorerProgress();
  race.bike = savedBike();
  race.rider.bike = race.bike;
  if (!onlineRoom && race.phase === 'free') {
    race.setVehicle(driverProfile.vehicle);
    race.freeRide();
  }
  ui.driverName.value = driverProfile.name;
  showBikeSetup();
  rebuildCourseHud();
  updateHud();
}

async function flushLocalSave(keepalive = false) {
  if (!onlineAppMode || !saveHydrated) return;
  if (saveSyncBusy) {
    if (!keepalive) scheduleLocalSave();
    return;
  }
  saveSyncBusy = true;
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
      const data=await response.json();
      setText(ui.saveStatus,data.error);
    }
  } catch {}
  finally { saveSyncBusy = false; }
}

function scheduleLocalSave() {
  if (!onlineAppMode) return;
  clearTimeout(saveSyncTimer);
  saveSyncTimer = setTimeout(() => { void flushLocalSave(false); }, 400);
}

async function hydrateLocalSave() {
  if (!onlineAppMode) return;
  try {
    const response = await fetch('/app/save', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      if (response.status === 409) {
        const data=await response.json();
        setText(ui.saveStatus,data.error);
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

async function exportSaveFile() {
  let snapshot;
  try { snapshot = await buildSaveSnapshot(); }
  catch (error) { setText(ui.saveStatus,error.message); return; }
  const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `litchi-save-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setText(ui.saveStatus, snapshot.friends === null
    ? '已导出个人存档，暂时无法读取友人对战记录。'
    : '已导出存档备份（含个人最佳、全车型改装与友人对战）。');
}

async function importSaveFile(file) {
  if (!file) return;
  try {
    if (file.size > 10_000_000) throw new Error('存档文件过大。');
    const parsed = JSON.parse(await file.text());
    await applySaveSnapshot(parsed, { preferIncoming: true });
    scheduleLocalSave();
    setText(ui.saveStatus, '存档已导入并生效。');
  } catch (error) {
    setText(ui.saveStatus, error?.message ?? '存档导入失败。');
  }
}
