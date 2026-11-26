import { getActiveCampus } from '../core/state.js';
import { getOnlineRoom } from '../online/client.js';
import { courseMedalSummary, isPaintUnlocked } from '../race/records.js';
import { campuses } from '../world/scene-builder.js';
import {
  courseTitle, message, setLanguageAttribute, setLabel as setText, setText as setRawText, translate,
} from './language.js';

export function createMedalTravelController({
  ui,
  race,
  stage,
  canvas,
  timeLabel,
  clearInput,
  focusStage,
  selectCourse,
  openMap,
  updateHud,
  getReady,
  getSettingsOpen,
  getPendingCampus,
  setPendingCampus,
  setPriorTimestamp,
  setCameraRevision,
  getZoomMap,
}) {
  function renderMedalSection(listEl, items, canJump) {
    if (!listEl) return;
    const nodes = items.map(({ event, tier, label, time, authorMs, goldMs }) => {
      const li = document.createElement('li');
      li.className = 'medal-item';
      const badge = document.createElement('span');
      badge.className = 'medal-pill';
      badge.dataset.tier = tier || 'none';
      badge.textContent = translate(label || '未获');
      const info = document.createElement('div');
      info.className = 'medal-info';
      const title = document.createElement('strong');
      title.textContent = courseTitle(event);
      const sub = document.createElement('small');
      sub.textContent = message`最佳 ${time === null ? '—' : timeLabel(time)} · 紫 ${timeLabel(authorMs)} / 金 ${timeLabel(goldMs)}`;
      info.append(title, sub);
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'action medal-go';
      go.textContent = translate('前往');
      go.disabled = !canJump;
      go.addEventListener('click', () => {
        if (ui.medalDialog?.open) ui.medalDialog.close();
        if (event.campus === getActiveCampus()) {
          selectCourse(event);
        } else {
          if (race.phase === 'race' || race.phase === 'count') race.abandon();
          setPendingCampus({ destination: event.campus, at: performance.now() + 30, targetCourseId: event.id });
          updateHud();
        }
        focusStage();
      });
      li.append(badge, info, go);
      return li;
    });
    listEl.replaceChildren(...nodes);
  }

  function renderMedalDialog() {
    if (!ui.medalDialog) return;
    const stats = courseMedalSummary();
    setText(ui.medalSummary, message`完成 ${stats.cleared}/${stats.total} · 紫牌 ${stats.authorCount} · 金牌 ${stats.goldPlus - stats.authorCount} · 银牌 ${stats.silverPlus - stats.goldPlus} · 铜牌 ${stats.bronzePlus - stats.silverPlus}`);
    const ameOk = isPaintUnlocked('amethyst', stats);
    const obsOk = isPaintUnlocked('obsidian', stats);
    const amethyst = ameOk ? translate('（已解锁）') : message`（需 6 金+ 或 1 紫 · 当前 ${stats.goldPlus}/6）`;
    const obsidian = translate(obsOk ? '（已解锁）' : '（需 1 枚紫牌）');
    setRawText(ui.medalUnlocks, message`限定车漆：紫水晶${amethyst} · 暗曜金${obsidian}`);
    const canJump = !getOnlineRoom() && !getPendingCampus() && race.phase !== 'race' && race.phase !== 'count';
    renderMedalSection(ui.medalListSzu, stats.rows.szu, canJump);
    renderMedalSection(ui.medalListUcl, stats.rows.ucl, canJump);
    renderMedalSection(document.getElementById('medalListPark'), stats.rows.shunde, canJump);
  }

  function openMedalDialog() {
    if (!ui.medalDialog || getSettingsOpen() || getOnlineRoom()) return;
    clearInput();
    renderMedalDialog();
    ui.medalDialog.showModal();
    ui.medalClose?.focus({ preventScroll: true });
  }

  function initMedalDialog() {
    ui.medalButton?.addEventListener('click', openMedalDialog);
    ui.medalClose?.addEventListener('click', () => { ui.medalDialog.close(); focusStage(); });
    ui.medalDialog?.addEventListener('close', () => { setPriorTimestamp(undefined); clearInput(); });
  }

  function updateElevationMap() {
    const stats = race.event.elevation;
    ui.elevationPanel.hidden = !stats || (race.phase === 'free' && !getZoomMap());
    if (ui.elevationPanel.hidden) return;
    setRawText(ui.elevationStats, message`爬升 ${stats.gain.toFixed(1)} m · 下降 ${stats.loss.toFixed(1)} m`);
    const chart = ui.elevationChart, ctx = chart.getContext('2d'), w = chart.width, h = chart.height;
    const maxHeight = Math.max(...stats.profile.map(item => item[1]), .1);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#1e3026'; ctx.fillRect(0, 0, w, h);
    ctx.beginPath(); ctx.moveTo(0, h - 8);
    for (const [distance, elevation] of stats.profile) {
      ctx.lineTo(distance / race.event.length * w, h - 8 - elevation / maxHeight * (h - 17));
    }
    ctx.lineTo(w, h - 8); ctx.closePath();
    ctx.fillStyle = '#6c8b50'; ctx.fill();
    ctx.strokeStyle = '#dce8b5'; ctx.lineWidth = 2; ctx.stroke();
    chart.setAttribute('aria-label', message`从起点到终点的路线剖面。累计爬升 ${stats.gain.toFixed(1)} 米，下降 ${stats.loss.toFixed(1)} 米`);
  }

  function canTravel() {
    return getReady() && race.phase === 'free' && !race.paused && !getSettingsOpen() && !getPendingCampus() && !getOnlineRoom();
  }

  function atTravelPoint() {
    const [x, , z] = race.rider.position, [sx, , sz] = campuses[getActiveCampus()].arrival;
    return Math.hypot(x - sx, z - sz) <= 11;
  }

  function arriveAtStation() {
    const { arrival, heading } = campuses[getActiveCampus()];
    clearInput();
    Object.assign(race.rider, {
      position: arrival.slice(), heading, paved: true, speed: 0, steering: 0, throttle: 0, brake: 0,
      yawRate: 0, lean: 0, slip: 0, stationaryBrake: 0, sprinting: false, sprintLocked: false,
    });
    race.previousRiderPose = null;
    race.moved = true;
    race.accumulator = 0;
    setCameraRevision();
    setPriorTimestamp(undefined);
    openMap(false);
    focusStage();
  }

  function requestTravel() {
    if (!canTravel() || ui.travelDialog.open) return;
    clearInput();
    if (!atTravelPoint()) { arriveAtStation(); updateHud(); return; }
    setText(ui.travelStation, campuses[getActiveCampus()].station);
    const choices = Object.entries(campuses).filter(([id]) => id !== getActiveCampus()).map(([id, site]) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'action'; button.dataset.destination = id;
      button.textContent = translate(site.name) + ' · ' + translate(site.station);
      button.addEventListener('click', () => {
        if (!canTravel() || !atTravelPoint() || !ui.travelDialog.open) return;
        ui.travelDialog.close();
        setPendingCampus({ destination: id, at: performance.now() + 90 });
        ui.notice.hidden = false;
        setRawText(ui.notice, message`正在前往${translate(site.name)}…`);
        updateHud();
      });
      return button;
    });
    ui.travelChoices.replaceChildren(...choices);
    ui.travelDialog.showModal();
  }

  function updateTravelButton() {
    ui.travel.hidden = race.phase !== 'free';
    ui.travel.disabled = !canTravel();
    setText(ui.travel, atTravelPoint() ? '选择目的地' : message`到${translate(campuses[getActiveCampus()].station)}`);
  }

  function updateCampusLabels() {
    const info = campuses[getActiveCampus()];
    stage.dataset.campus = getActiveCampus(); setText(ui.campusName, info.name);
    setText(ui.miniButton.querySelector('span'), getActiveCampus() === 'shunde' ? '顺峰山导览' : getActiveCampus() === 'ucl' ? '街区小地图' : '校园小地图');
    setText(ui.mapTitle, { szu: '校园俯视地图', ucl: 'Bloomsbury 地图', shunde: '顺峰山公园导览图' }[getActiveCampus()]);
    ui.szuReferences.hidden = getActiveCampus() !== 'szu';
    ui.uclReference.hidden = getActiveCampus() !== 'ucl';
    setLanguageAttribute(canvas, 'aria-label', message`${translate(info.name)}三维骑行地图`);
  }

  return {
    openMedalDialog,
    initMedalDialog,
    updateElevationMap,
    canTravel,
    atTravelPoint,
    arriveAtStation,
    requestTravel,
    updateTravelButton,
    updateCampusLabels,
  };
}
