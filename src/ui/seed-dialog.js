import { readSeedCode, seedVersion, weeklySeed } from '../race/seed-code.js';
import { getActiveCampus, getStorage, worldState } from '../core/state.js';
import { routeRules } from '../data/routes.js';
import { coursesByCampus } from '../world/scene-builder.js';
import { resolveRouteRef } from '../world/route-resolver.js';
import { makeNetworkCourse, makeSeedCourse, networkForCampus } from '../world/seed-courses.js';
import { message, setLabel as setText, setText as setRawText } from './language.js';

export function createSeedDialogController({
  ui,
  race,
  clearInput,
  focusStage,
  populateCoursePicker,
  selectCourse,
  isSeedAvailable,
  setPriorTimestamp,
}) {
  const seedStorageKey = campus => 'szu-litchi-last-seed-' + campus;

  function openSeedDialog() {
    if (getActiveCampus() === 'shunde' || !isSeedAvailable() || ui.seedDialog.open || ui.friendDialog.open) return;
    let remembered = '';
    try { remembered = getStorage()?.getItem(seedStorageKey(getActiveCampus())) ?? ''; } catch {}
    if (!readSeedCode(remembered, getActiveCampus())) remembered = '';
    const prefix = getActiveCampus() === 'ucl' ? 'U' : 'S';
    setText(ui.seedCampus, getActiveCampus() === 'ucl' ? '伦敦 · Bloomsbury' : '深圳 · 粤海校区');
    ui.seedInput.placeholder = prefix + seedVersion + '-326';
    ui.seedInput.value = worldState.seedCourses[getActiveCampus()]?.seed ?? remembered;
    ui.weeklyCode.value = weeklySeed(getActiveCampus());
    setText(ui.seedStatus, '输入种子码或 R1 路线代码，可在同一张地图重建赛道并分享给朋友。');
    clearInput();
    setPriorTimestamp(undefined);
    ui.seedDialog.showModal();
    ui.seedInput.select();
  }

  function chooseSeedCourse(raw) {
    if (!isSeedAvailable()) return;
    const routeInput = String(raw ?? '').trim();
    if (routeInput.startsWith('R1.')) {
      const resolved = resolveRouteRef(routeInput, {
        coursesByCampus, makeSeedCourse, networkFor: networkForCampus, makeNetworkCourse,
      });
      if (!resolved || resolved.route.campus !== getActiveCampus()) {
        setText(ui.seedStatus, '路线代码无效，或路线不属于当前地图。');
        ui.seedInput.focus();
        return;
      }
      if (resolved.event.seed) worldState.seedCourses[resolved.event.campus] = resolved.event;
      else if (resolved.route.source === 'network') worldState.customCourses[resolved.event.campus] = resolved.event;
      populateCoursePicker();
      selectCourse(resolved.event);
      ui.seedDialog.close();
      return;
    }
    const code = readSeedCode(routeInput, getActiveCampus());
    if (!code) {
      const prefix = getActiveCampus() === 'ucl' ? 'U' : 'S';
      setRawText(ui.seedStatus, message`请输入种子码（${prefix}${seedVersion}- 开头）或 R1 路线代码。`);
      ui.seedInput.focus();
      return;
    }
    const previous = worldState.seedCourses[getActiveCampus()];
    const event = previous?.seed === code ? previous : makeSeedCourse(code, getActiveCampus());
    if (!event) {
      setText(ui.seedStatus, '这个种子没有合适的路线，请试试另一个。');
      return;
    }
    worldState.seedCourses[getActiveCampus()] = event;
    try { getStorage()?.setItem(seedStorageKey(getActiveCampus()), code); } catch {}
    populateCoursePicker();
    selectCourse(event);
    ui.seedDialog.close();
  }

  function initSeedDialog() {
    let rollover;
    function refreshWeek() {
      clearTimeout(rollover);
      if (!ui.seedDialog.open) return;
      const now = new Date(), next = new Date(now);
      next.setDate(now.getDate() + 7 - (now.getDay() + 6) % 7);
      next.setHours(0, 0, 0, 0);
      ui.weeklyCode.value = weeklySeed(getActiveCampus(), now);
      rollover = setTimeout(refreshWeek, Math.max(100, next - now + 30));
    }
    ui.seedInput.maxLength = routeRules.maxCodeLength;
    ui.seedButton.addEventListener('click', openSeedDialog);
    ui.seedButton.addEventListener('click', refreshWeek);
    window.addEventListener('focus', refreshWeek);
    document.addEventListener('visibilitychange', refreshWeek);
    ui.weeklyPlay.addEventListener('click', () => { refreshWeek(); chooseSeedCourse(ui.weeklyCode.value); });
    ui.weeklyBoard.addEventListener('click', () => {
      refreshWeek();
      const code = ui.weeklyCode.value;
      ui.seedDialog.close();
      worldState.hooks.openFriendDialog?.(code);
    });
    ui.weeklyCopy.addEventListener('click', async () => {
      refreshWeek();
      try {
        await navigator.clipboard.writeText(ui.weeklyCode.value);
      } catch {
        ui.weeklyCode.focus();
        ui.weeklyCode.select();
        if (!document.execCommand?.('copy')) {
          setText(ui.seedStatus, '种子码已选中，可用系统复制命令。');
          return;
        }
      }
      setRawText(ui.seedStatus, message`已复制 ${ui.weeklyCode.value}`);
    });
    ui.seedForm.addEventListener('submit', event => {
      event.preventDefault();
      chooseSeedCourse(ui.seedInput.value);
    });
    ui.seedRandom.addEventListener('click', () => {
      const value = Math.floor(Math.random() * 2 ** 32).toString(36).toUpperCase().padStart(7, '0');
      ui.seedInput.value = value;
      chooseSeedCourse(value);
    });
    ui.seedClose.addEventListener('click', () => ui.seedDialog.close());
    ui.seedDialog.addEventListener('close', () => {
      clearTimeout(rollover);
      setPriorTimestamp(undefined);
      clearInput();
      if (!ui.friendDialog.open) focusStage();
    });
  }

  return { openSeedDialog, chooseSeedCourse, initSeedDialog };
}
