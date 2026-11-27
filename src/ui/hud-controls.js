import { clamp } from '../core/math.js';
import { cameraViews, interfaceScale, knownHudScale, knownTouchSize } from '../data/interface.js';
import { rocketSkill, vehicleSkills } from '../data/vehicle-skills.js';
import { getLanguage, message, setLabel, setLanguageAttribute, setText, translate } from './language.js';

function updateDriveMeter(meter, fill, output, value) {
  const percent = String(value);
  if (meter.getAttribute('aria-valuenow') === percent) return;
  fill.style.transform = 'scaleX(' + (value / 100) + ')';
  meter.setAttribute('aria-valuenow', percent);
  setText(output, percent + '%');
}

export function createDrivingHud(stage, ui) {
  const touchSkill = stage.querySelector('.touch [data-drive="sprint"]');
  let shownSkill, shownLanguage;
  return function updateDrivingHud(rider) {
    const rocket = rider.tuning?.rocketBoost;
    const skill = rocket ? rocketSkill : vehicleSkills[rider.vehicle];
    const language = getLanguage();
    if (stage.dataset.vehicle !== rider.vehicle) stage.dataset.vehicle = rider.vehicle;
    if (shownSkill !== skill || shownLanguage !== language) {
      shownSkill = skill;
      shownLanguage = language;
      setLabel(touchSkill, skill.action);
      ui.sprintKeys.lastChild.nodeValue = ' ' + translate(skill.action) + ' ';
      setLanguageAttribute(ui.sprintMeter, 'aria-label', translate(skill.meter));
    }

    const load = clamp(rider.gripLoad ?? 0, 0, 1);
    const loadStatus = load > .90 ? 'limit' : load > .72 ? 'high' : 'normal';
    if (ui.gripMeter.dataset.load !== loadStatus) ui.gripMeter.dataset.load = loadStatus;
    updateDriveMeter(ui.gripMeter, ui.gripFill, ui.gripValue, Math.round(100 * (1 - load)));
    updateDriveMeter(ui.sprintMeter, ui.sprintFill, ui.sprintValue, Math.round(rider.energy * 100));
    ui.sprintMeter.parentElement.toggleAttribute('data-skill-active', Boolean(rider.sprinting || rider.skill));
    const idle = rocket ? (rider.rocketTime > 0 ? rocketSkill.cooldown : rocketSkill.ready) : skill.meter;
    setLabel(ui.sprintHint, rider.sprinting ? '冲刺中' : rider.skill || idle);

    const posture = rider.vehicle === 'bike' ? rider.posture : null;
    const showPosture = posture === 'tuck' || posture === 'stand';
    ui.bikePosture.hidden = !showPosture;
    if (showPosture) {
      ui.bikePosture.dataset.posture = posture;
      setLabel(ui.bikePosture, posture === 'tuck' ? '伏身破风' : '起身摇车');
    } else delete ui.bikePosture.dataset.posture;
  };
}

export function showCameraMode(stage, ui, view) {
  const { tag, label } = cameraViews[view];
  stage.dataset.cameraView = view;
  setText(ui.cameraModeTag, tag);
  const description = message`切换视角，当前${translate(label)}`;
  setLanguageAttribute(ui.cameraToggle, 'aria-label', description);
  setLanguageAttribute(ui.cameraToggle, 'title', description);
}

export function observeStageControls(stage, controls) {
  new ResizeObserver(([entry]) => {
    stage.style.setProperty('--stage-controls-height', `${entry.target.offsetHeight}px`);
  }).observe(controls);
}

export function applyHudLayout(stage, ui, value) {
  const hudScale = knownHudScale(value);
  stage.dataset.hudScale = hudScale;
  if (hudScale === 'auto') stage.style.removeProperty('--hud-scale');
  else stage.style.setProperty('--hud-scale', hudScale / 100);
  ui.settingsHudAuto.setAttribute('aria-pressed', String(hudScale === 'auto'));
  ui.settingsHudScale.value = hudScale === 'auto' ? interfaceScale.normal : hudScale;
  setLabel(ui.settingsHudScaleValue, hudScale === 'auto' ? '自动' : `${hudScale}%`);
}

export function applyTouchLayout(stage, ui, value) {
  const size = knownTouchSize(value);
  stage.style.setProperty('--touch-scale', size / 100);
  ui.settingsTouchSize.value = size;
  ui.settingsTouchSizeValue.value = `${size}%`;
}

export function installHudControls(ui, preferences, applyHud, applyTouch, save) {
  const { min, max, step } = interfaceScale;
  for (const [key, input, apply] of [
    ['hudScale', ui.settingsHudScale, applyHud], ['touchSize', ui.settingsTouchSize, applyTouch],
  ]) {
    Object.assign(input, { min, max, step });
    const preview = () => {
      preferences[key] = Number(input.value);
      apply();
    };
    input.addEventListener('input', preview);
    input.addEventListener('change', () => { preview(); save(); });
  }
  ui.settingsHudAuto.addEventListener('click', () => {
    preferences.hudScale = 'auto';
    applyHud();
    save();
  });
}
