import { cameraViews, interfaceScale, knownHudScale, knownTouchSize } from '../data/interface.js';
import { message, setLabel, setLanguageAttribute, setText, translate } from './language.js';

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
