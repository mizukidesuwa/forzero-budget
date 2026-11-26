import { clamp } from '../core/math.js';
import { setActiveCampus } from '../core/state.js';
import { cameraViews } from '../data/interface.js';
import { riderSkinPromptEn, riderSkinPromptZh } from '../data/rider-skin-prompt.js';
import { getOnlineRoom, showOnlineDialog, syncOnlineProfile } from '../online/client.js';
import { BlindNav } from '../race/blind-nav.js';
import { ShadowChase } from '../race/chase.js';
import { isPaintUnlocked, courseMedalSummary } from '../race/records.js';
import { knownWeather, setActiveWeather } from '../render/atmosphere.js';
import { knownSkinId, skinForProfile, skinSpecHash } from '../ride/rider-skin.js';
import { bicyclePaints, knownPaint, riderName, storeDriverProfile, vehicleChoices } from '../ride/vehicles.js';
import { knownWindMode } from '../world/environment.js';
import { knownTraffic, trialTraffic } from '../world/traffic.js';
import { setRideAudioMuted } from './audio.js';
import { applyHudLayout, applyTouchLayout, installHudControls, showCameraMode } from './hud-controls.js';
import {
  bindText, getLanguage, message, setLanguageAttribute, setLabel as setText, translate,
} from './language.js';
import { exportSaveFile, importSaveFile, scheduleLocalSave } from './save-sync.js';

export function createSettingsController({
  ui,
  race,
  stage,
  preferences,
  prefKey,
  driverProfile,
  getReady,
  getPendingCampus,
  getSettingsOpen,
  setSettingsOpen,
  setPriorTimestamp,
  bumpCameraRevision,
  bumpGraphicsRevision,
  clearInput,
  focusStage,
  openMap,
  rebuildCourseHud,
  updateHud,
  refreshBicycleModels,
  workshop,
}) {
  const cameraOrder = Object.keys(cameraViews);

  function graphicsScale(width, height, adaptive) {
    const screen = Math.min(devicePixelRatio || 1, 1.60);
    const mode = preferences.resolution;
    const factor = mode === 'sharp' ? 1.25 : mode === 'fast' ? .75 : adaptive;
    const budget = mode === 'sharp' ? 2580000 : mode === 'fast' ? 930000 : 1680000;
    return Math.min(screen * factor, Math.sqrt(budget / (width * height)));
  }

  function updateGraphicsStatus(frame) {
    const aa = frame.samples ? frame.samples + '× MSAA + FXAA' : frame.fxaa ? 'FXAA' : translate('抗锯齿已关闭');
    setText(ui.settingsStatus, frame.width + ' × ' + frame.height + ' · ' + aa);
  }

  function applyHudScale() {
    applyHudLayout(stage, ui, preferences.hudScale);
  }

  function applyTouchSize() {
    applyTouchLayout(stage, ui, preferences.touchSize);
  }

  function fillPreferences() {
    ui.settingsResolution.value = preferences.resolution;
    ui.settingsAA.value = preferences.aa;
    ui.settingsGhost.checked = preferences.ghost;
    ui.settingsBrakeLine.checked = preferences.brakeLine;
    if (ui.settingsFps) ui.settingsFps.checked = preferences.fps !== false;
    ui.settingsWeather.value = knownWeather(preferences.weather);
    if (ui.settingsSound) ui.settingsSound.checked = preferences.sound !== false;
    applyTouchSize();
    applyHudScale();
    if (stage.dataset.cameraView !== preferences.cameraView) bumpCameraRevision();
    showCameraMode(stage, ui, preferences.cameraView);
    ui.settingsTraffic.value = preferences.traffic;
    ui.settingsTraffic.disabled = Boolean(getOnlineRoom()) || race.phase === 'race' || race.phase === 'count';
    ui.settingsCollision.disabled = Boolean(getOnlineRoom()) || trialTraffic(race).mode === 'off';
    ui.settingsCollision.checked = preferences.collision === true;
    if (ui.settingsWindSpeed) ui.settingsWindSpeed.value = String(preferences.windSpeed ?? 0);
    ui.settingsWindMode.value = knownWindMode(preferences.windMode);
    if (ui.settingsWindDir) ui.settingsWindDir.value = String(preferences.windDir ?? 0);
  }

  function savePreferences() {
    try { localStorage.setItem(prefKey, JSON.stringify(preferences)); } catch {}
    bumpGraphicsRevision();
    if (typeof scheduleLocalSave === 'function') scheduleLocalSave();
  }

  function cycleCamera() {
    if (!getReady() || getPendingCampus()) return;
    preferences.cameraView = cameraOrder[(cameraOrder.indexOf(preferences.cameraView) + 1) % cameraOrder.length];
    bumpCameraRevision();
    showCameraMode(stage, ui, preferences.cameraView);
    savePreferences();
  }

  function isFullscreen() {
    return document.fullscreenElement === stage || stage.classList.contains('expanded');
  }

  function updateSettingsActions() {
    const active = race.phase === 'race' || race.phase === 'count';
    setText(ui.settingsContinue, active && !race.paused ? '继续比赛' : '返回骑行');
    ui.recover.hidden = race.phase !== 'race';
    ui.settingsExit.hidden = race.phase === 'free';
    setText(ui.settingsExit, active ? '退出比赛' : '返回自由骑行');
    ui.settingsUnfullscreen.hidden = !isFullscreen();
    setText(ui.settingsState, active ? '比赛已暂停，计时停止' : '');
    ui.settingsState.hidden = !active;
  }

  function updateSettingsLabels() {
    const garage = !ui.bikeSettings.hidden, guide = ui.guideSettings && !ui.guideSettings.hidden;
    setText(ui.settingsTitle, garage ? '车库' : guide ? '玩法说明' : '设置');
    if (ui.settingsGuideBtn) {
      ui.settingsGuideBtn.hidden = garage;
      setText(ui.settingsGuideBtn, guide ? '返回设置' : '玩法说明');
    }
  }

  function commitDriverName() {
    const name = riderName(ui.driverName.value);
    ui.driverName.value = name;
    if (driverProfile.name === name) return;
    driverProfile.name = name;
    storeDriverProfile(driverProfile);
    updateHud();
  }

  function setSettingsPanel(panel = 'display') {
    if (panel !== 'display' && !ui.displaySettings.hidden) commitDriverName();
    const garage = panel === 'bike', guide = panel === 'guide';
    ui.displaySettings.hidden = garage || guide;
    ui.bikeSettings.hidden = !garage;
    if (ui.guideSettings) ui.guideSettings.hidden = !guide;
    updateSettingsLabels();
    if (garage) workshop.showBikeSetup();
    else if (!guide) ui.driverName.value = driverProfile.name;
  }

  function openSettings(panel = 'display') {
    if (getSettingsOpen() || getPendingCampus() || (getOnlineRoom() && (panel !== 'bike' || getOnlineRoom().state.phase === 'race'))) return;
    clearInput(); setPriorTimestamp(undefined); setSettingsOpen(true);
    setSettingsPanel(panel);
    updateSettingsActions();
    ui.settingsDialog.showModal();
    ui.settingsContinue.focus({ preventScroll: true });
  }

  function closeSettings() {
    if (!getSettingsOpen()) return;
    if (!ui.displaySettings.hidden) commitDriverName();
    setSettingsOpen(false); setPriorTimestamp(undefined); clearInput();
    ui.settingsDialog.close();
    if (getOnlineRoom()) {
      if (getOnlineRoom().state.phase !== 'race') { syncOnlineProfile(); showOnlineDialog(); }
      else focusStage();
      return;
    }
    focusStage();
  }

  function updateFullscreenLabels(expanded) {
    const label = translate(expanded ? '退出全屏' : '全屏');
    setLanguageAttribute(ui.expand, 'aria-label', label);
    setLanguageAttribute(ui.expand, 'title', label);
  }

  async function leaveFullscreen() {
    if (stage.classList.contains('expanded')) stage.classList.remove('expanded');
    if (document.fullscreenElement === stage) {
      try { await document.exitFullscreen(); } catch {}
    }
    const expanded = isFullscreen();
    updateFullscreenLabels(expanded);
    if (getSettingsOpen()) updateSettingsActions();
  }

  function quitTrial() {
    if (race.phase === 'free' && !ShadowChase.active) return;
    ShadowChase.stop();
    BlindNav.leave(setActiveWeather);
    BlindNav.setEnabled(false);
    clearInput();
    race.opponent = null;
    race.extraOpponents = [];
    race.abandon(); bumpCameraRevision(); setPriorTimestamp(undefined);
    refreshBicycleModels();
    openMap(false); rebuildCourseHud(); updateHud();
    closeSettings(); focusStage();
    if (isFullscreen()) void leaveFullscreen();
  }

  function initSettings(initMapReplay) {
    workshop.initBicycleWorkshop();
    initMapReplay();
    fillPreferences();
    ui.driverName.value = driverProfile.name;
    for (const [choices, select] of [[vehicleChoices, ui.vehiclePicker], [bicyclePaints, ui.bikePaint]]) {
      for (const [value, choice] of Object.entries(choices)) {
        const option = document.createElement('option');
        option.value = value;
        bindText(option, () => translate(choice.name));
        select.appendChild(option);
      }
    }
    ui.driverName.addEventListener('change', commitDriverName);
    ui.vehiclePicker.addEventListener('change', () => {
      const choice = ui.vehiclePicker.value;
      if (!race.setVehicle(choice)) { workshop.showBikeSetup(); return; }
      driverProfile.vehicle = choice;
      storeDriverProfile(driverProfile);
      workshop.showBikeSetup();
      rebuildCourseHud();
      updateHud();
      updateSettingsActions();
      if (typeof getOnlineRoom() !== 'undefined' && getOnlineRoom()?.state.phase === 'tuning') syncOnlineProfile();
    });
    ui.bikePaint.addEventListener('change', () => {
      if (race.rider.vehicle !== 'bike' || race.phase === 'race' || race.phase === 'count' || !isPaintUnlocked(ui.bikePaint.value, courseMedalSummary())) { workshop.showBikeSetup(); return; }
      driverProfile.paint = knownPaint(ui.bikePaint.value);
      storeDriverProfile(driverProfile);
      workshop.showBikeSetup();
      if (typeof getOnlineRoom() !== 'undefined' && getOnlineRoom()?.state.phase === 'tuning') syncOnlineProfile();
    });
    ui.riderSkin.addEventListener('change', () => {
      if (race.phase === 'race' || race.phase === 'count') { workshop.showBikeSetup(); return; }
      const skinId = knownSkinId(ui.riderSkin.value);
      const selectedSkin = skinForProfile({ skinId });
      driverProfile.skinId = skinId;
      driverProfile.skinVersion = selectedSkin.schemaVersion;
      if (skinId === 'default') {
        delete driverProfile.skinSpec;
        delete driverProfile.skinSpecHash;
      } else if (selectedSkin.class === 'model') {
        driverProfile.skinSpec = selectedSkin;
        driverProfile.skinSpecHash = skinSpecHash(selectedSkin);
      } else {
        delete driverProfile.skinSpec;
        delete driverProfile.skinSpecHash;
      }
      storeDriverProfile(driverProfile);
      workshop.showBikeSetup();
      if (typeof getOnlineRoom() !== 'undefined' && getOnlineRoom()?.state.phase === 'tuning') syncOnlineProfile();
    });
    ui.riderSkinPrompt.addEventListener('click', async () => {
      const riderSkinPromptText = getLanguage() === 'en' ? riderSkinPromptEn : riderSkinPromptZh;
      try {
        await navigator.clipboard.writeText(riderSkinPromptText);
        setText(ui.riderSkinStatus, '已复制 SkinModelSpec 提示词，请把参考图和提示词交给其他 AI。');
      } catch {
        ui.riderSkinImport.value = riderSkinPromptText;
        ui.riderSkinImport.select();
        setText(ui.riderSkinStatus, '提示词已放入文本框，可手动复制。');
      }
    });
    ui.riderSkinFile.addEventListener('click', () => ui.riderSkinFileInput.click());
    ui.riderSkinClear.addEventListener('click', () => { ui.riderSkinImport.value = ''; });
    ui.riderSkinFileInput.addEventListener('change', async () => {
      const file = ui.riderSkinFileInput.files?.[0];
      if (!file) return;
      try {
        ui.riderSkinImport.value = await file.text();
        setText(ui.riderSkinStatus, message`已读取 ${file.name}，点击“导入并预览”完成校验。`);
      } catch { setText(ui.riderSkinStatus, '无法读取模型文件。'); }
    });
    ui.riderSkinImportButton.addEventListener('click', () => {
      try {
        const result = workshop.importRiderSkinText(ui.riderSkinImport.value);
        setText(ui.riderSkinStatus, message`已导入并应用 ${result.spec.label} · ${result.hash}`);
      } catch (error) { setText(ui.riderSkinStatus, error.message); }
    });
    ui.settingsButton.addEventListener('click', () => openSettings());
    ui.settingsGuideBtn?.addEventListener('click', () => setSettingsPanel(ui.guideSettings?.hidden ? 'guide' : 'display'));
    ui.bikeButton.addEventListener('click', () => openSettings('bike'));
    ui.bikeTyres.addEventListener('change', workshop.installBikeParts);
    ui.bikeGears.addEventListener('change', workshop.installBikeParts);
    ui.bikeBrakes.addEventListener('change', workshop.installBikeParts);
    ui.bikeFrame.addEventListener('change', workshop.installBikeParts);
    ui.bikeSprint.addEventListener('change', workshop.installBikeParts);
    for (const sel of [ui.vehSlot0, ui.vehSlot1, ui.vehSlot2]) sel.addEventListener('change', workshop.installVehicleTuning);
    ui.saveExport.addEventListener('click', () => void exportSaveFile());
    ui.saveImport.addEventListener('click', () => ui.saveFile.click());
    ui.saveFile.addEventListener('change', () => {
      const f = ui.saveFile.files[0];
      ui.saveFile.value = '';
      void importSaveFile(f);
    });
    ui.settingsContinue.addEventListener('click', closeSettings);
    ui.settingsExit.addEventListener('click', quitTrial);
    ui.settingsUnfullscreen.addEventListener('click', leaveFullscreen);
    ui.settingsDialog.addEventListener('cancel', event => { event.preventDefault(); closeSettings(); });
    ui.settingsDialog.addEventListener('close', () => {
      if (getSettingsOpen()) {
        setSettingsOpen(false); setPriorTimestamp(undefined); clearInput(); focusStage();
      }
    });
    for (const [key, control] of [['resolution', ui.settingsResolution], ['aa', ui.settingsAA], ['weather', ui.settingsWeather]]) {
      control.addEventListener('change', () => {
        preferences[key] = control.value;
        if (key === 'weather' && !getOnlineRoom() && !race.event?.environment) setActiveWeather(control.value);
        savePreferences();
      });
    }
    for (const [key, control] of [['ghost', ui.settingsGhost], ['brakeLine', ui.settingsBrakeLine], ['sound', ui.settingsSound], ['collision', ui.settingsCollision], ['fps', ui.settingsFps]]) {
      if (!control) continue;
      control.addEventListener('change', () => {
        preferences[key] = control.checked;
        if (key === 'sound' && typeof setRideAudioMuted === 'function') setRideAudioMuted(!control.checked);
        savePreferences();
      });
    }
    installHudControls(ui, preferences, applyHudScale, applyTouchSize, savePreferences);
    ui.settingsTraffic.addEventListener('change', () => {
      preferences.traffic = knownTraffic(ui.settingsTraffic.value);
      ui.settingsCollision.disabled = preferences.traffic === 'off';
      savePreferences();
    });
    ui.settingsWindSpeed?.addEventListener('change', () => {
      const w = Math.round(clamp(Number(ui.settingsWindSpeed.value) || 0, 0, 15) * 10) / 10;
      ui.settingsWindSpeed.value = String(w);
      preferences.windSpeed = w;
      savePreferences();
      updateHud();
    });
    ui.settingsWindMode.addEventListener('change', () => {
      preferences.windMode = knownWindMode(ui.settingsWindMode.value);
      savePreferences();
    });
    ui.settingsWindDir?.addEventListener('change', () => {
      const d = Math.round(clamp(Number(ui.settingsWindDir.value) || 0, 0, 7));
      ui.settingsWindDir.value = String(d);
      preferences.windDir = d;
      savePreferences();
      updateHud();
    });
    document.addEventListener('fullscreenchange', () => { if (getSettingsOpen()) updateSettingsActions(); });
  }

  return {
    graphicsScale,
    updateGraphicsStatus,
    fillPreferences,
    applyHudScale,
    applyTouchSize,
    cycleCamera,
    savePreferences,
    isFullscreen,
    updateSettingsActions,
    updateSettingsLabels,
    setSettingsPanel,
    openSettings,
    closeSettings,
    updateFullscreenLabels,
    leaveFullscreen,
    quitTrial,
    initSettings,
  };
}
