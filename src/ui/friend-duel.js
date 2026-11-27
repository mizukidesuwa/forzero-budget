import { getActiveCampus, worldState } from '../core/state.js';
import { weeklySeed } from '../race/seed-code.js';
import {
  GhostFileError, MAX_GHOST_BYTES, ghostCourseKey, loadFriendGhost, makeGhostFile,
  readFriendScores, readGhostFile, readSavedFriendGhost, removeSavedFriendGhost,
  resolveFriendGhostCourse, saveFriendGhost,
} from '../replay/ghost.js';
import { vehicleChoices } from '../ride/vehicles.js';
import { campuses, coursesByCampus } from '../world/scene-builder.js';
import { courseTitle, message, setLabel as setText, setText as setRawText, translate } from './language.js';
import { ghostLabel } from './presentation-text.js';

export function createFriendDuelController({
  ui,
  race,
  driverProfile,
  timeLabel,
  clearInput,
  focusStage,
  populateCoursePicker,
  selectCourse,
  openMap,
  isSeedAvailable,
  getSettingsOpen,
  setPriorTimestamp,
  setPendingCampus,
  setZoomMap,
}) {
  let friendScores = [];
  let friendBoardMessage = '正在读取友人对战…';
  let friendBoardRead = 0;
  let friendBoardRender = 0;
  let selectedFriendIds = [];
  let friendImporting = false;

  function updateFriendMultiBar() {
    if (!ui.friendMultiBar) return;
    const count = selectedFriendIds.length;
    ui.friendMultiBar.hidden = count < 2;
    if (count >= 2) setText(ui.friendMultiCount, message`已选 ${count}/3 条同场群跑影子`);
  }

  function setFriendOptions(select, labels, scores, field, preferred) {
    const counts = new Map();
    for (const score of scores) counts.set(score[field], (counts.get(score[field]) ?? 0) + 1);
    select.replaceChildren(...Array.from(labels, ([key, label]) => {
      const count = counts.get(key);
      const caption = translate(label);
      return new Option(count ? message`${caption}（${count}）` : caption, key);
    }));
    select.value = labels.has(preferred) ? preferred : scores[0]?.[field] ?? labels.keys().next().value;
  }

  function updateFriendFilters({ campus, course, vehicle } = {}) {
    const campusLabels = new Map(Object.entries(campuses).map(([key, data]) => [key, data.name]));
    setFriendOptions(ui.friendCampus, campusLabels, friendScores, 'campus', campus ?? ui.friendCampus.value);
    const region = ui.friendCampus.value;
    const campusScores = friendScores.filter(score => score.campus === region);
    const seedCodes = new Set([region === 'shunde' ? null : weeklySeed(region), worldState.seedCourses[region]?.seed, ...campusScores.map(score => score.seed)]);
    const courseLabels = new Map(coursesByCampus[region].map(event => [event.id, courseTitle(event)]));
    const custom = worldState.customCourses[region];
    if (custom) courseLabels.set(custom.id, courseTitle(custom));
    for (const code of seedCodes) {
      if (!code) continue;
      const name = /^[SU]\d-W\d{8}$/.test(code) ? message`每周挑战 ${code}` : message`种子赛 ${code}`;
      courseLabels.set('seed-' + code, name);
    }
    for (const { courseId } of campusScores) {
      if (courseLabels.has(courseId) || !/^network-[0-9a-f]{8}$/.test(courseId)) continue;
      courseLabels.set(courseId, message`道路路线 · ${courseId.slice(8)}`);
    }
    setFriendOptions(ui.friendCourse, courseLabels, campusScores, 'courseId', course ?? ui.friendCourse.value);
    const courseScores = campusScores.filter(score => score.courseId === ui.friendCourse.value);
    const vehicles = new Map(Object.entries(vehicleChoices).filter(([, data]) => data.race).map(([key, data]) => [key, data.name]));
    setFriendOptions(ui.friendVehicle, vehicles, courseScores, 'vehicle', vehicle ?? ui.friendVehicle.value);
    void renderFriendScores(courseScores);
  }

  function friendScoreRow(score, compatible) {
    const row = ui.friendScoreTemplate.content.firstElementChild.cloneNode(true);
    row.querySelector('.friend-score-name').textContent = score.name;
    const time = timeLabel(score.time);
    row.querySelector('.friend-score-time').textContent = time;
    const description = score.name + ' · ' + time;
    const pick = row.querySelector('.friend-pick');
    const play = row.querySelector('.friend-play'), remove = row.querySelector('.friend-remove');
    if (pick) {
      pick.disabled = !compatible;
      pick.checked = compatible && selectedFriendIds.includes(score.id);
      pick.addEventListener('change', () => {
        if (pick.checked) {
          if (selectedFriendIds.length >= 3) {
            pick.checked = false;
            setText(ui.friendStatus, '同场群跑最多同时选择 3 条影子。');
            return;
          }
          if (friendScores.some(item => selectedFriendIds.includes(item.id) && item.layout !== score.layout)) {
            pick.checked = false;
            setText(ui.friendStatus, '同场群跑需要相同的赛道布局。');
            return;
          }
          if (!selectedFriendIds.includes(score.id)) selectedFriendIds.push(score.id);
        } else {
          selectedFriendIds = selectedFriendIds.filter(id => id !== score.id);
        }
        updateFriendMultiBar();
      });
    }
    play.disabled = !compatible;
    play.setAttribute('aria-label', message`对战 ${description}`);
    remove.setAttribute('aria-label', message`移除 ${description}`);
    play.addEventListener('click', () => void playSavedFriend(score.id));
    remove.addEventListener('click', () => void deleteFriendScore(score, remove));
    return row;
  }

  async function layoutCanReplay(scores) {
    for (const score of scores) {
      try {
        const replay = JSON.parse(await readSavedFriendGhost(score.id));
        const course = replay?.course;
        if (course?.campus === score.campus && course.id === score.courseId && course.layout === score.layout &&
            resolveFriendGhostCourse(course, replay.run?.splits?.length)) return true;
      } catch {}
    }
    return false;
  }

  async function renderFriendScores(courseScores) {
    const render = ++friendBoardRender;
    const { value: campus } = ui.friendCampus, { value: course } = ui.friendCourse;
    const scores = courseScores.filter(score => score.vehicle === ui.friendVehicle.value)
      .sort((a, b) => a.time - b.time || a.id - b.id);
    const visibleIds = new Set(scores.map(s => s.id));
    selectedFriendIds = selectedFriendIds.filter(id => visibleIds.has(id));
    updateFriendMultiBar();
    const msg = friendBoardMessage || (scores.length ? '' : '这个赛道和车型还没有影子成绩。');
    setText(ui.friendBoardNote, msg);
    ui.friendBoardNote.hidden = !msg;
    ui.friendScores.replaceChildren();
    if (!scores.length || friendBoardMessage) return;

    const event = coursesByCampus[campus].find(item => item.id === course) ??
      (worldState.seedCourses[campus]?.id === course ? worldState.seedCourses[campus] : null);
    const currentLayout = event ? ghostCourseKey(event) : null;
    const groups = new Map();
    for (const score of scores) {
      if (!groups.has(score.layout)) groups.set(score.layout, []);
      groups.get(score.layout).push(score);
    }
    const layouts = [...groups.keys()].sort((a, b) => Number(b === currentLayout) - Number(a === currentLayout));
    const compatibleLayouts = await Promise.all(layouts.map(layout => layoutCanReplay(groups.get(layout))));
    if (render !== friendBoardRender) return;
    for (const [index, layout] of layouts.entries()) {
      const compatible = compatibleLayouts[index];
      if (layouts.length > 1 || !compatible) {
        const title = document.createElement('h3');
        title.textContent = compatible ? message`布局 ${layout}` : message`旧版布局 ${layout}`;
        ui.friendScores.append(title);
      }
      const list = document.createElement('ol');
      list.className = 'friend-ranking';
      for (const score of groups.get(layout)) list.append(friendScoreRow(score, compatible));
      ui.friendScores.append(list);
    }
  }

  async function refreshFriendBoard() {
    const read = ++friendBoardRead;
    ui.friendScores.setAttribute('aria-busy', 'true');
    try {
      const scores = await readFriendScores();
      if (read !== friendBoardRead || !ui.friendDialog.open) return;
      friendScores = scores.reverse();
      friendBoardMessage = '';
    } catch (error) {
      if (read !== friendBoardRead || !ui.friendDialog.open) return;
      console.error(error);
      friendScores = [];
      friendBoardMessage = '暂时无法读取本机友人对战。';
    } finally {
      if (read === friendBoardRead) ui.friendScores.setAttribute('aria-busy', 'false');
    }
    updateFriendFilters();
  }

  async function deleteFriendScore(score, button) {
    if (friendImporting) return;
    button.disabled = true;
    try {
      await removeSavedFriendGhost(score.id);
      if (!ui.friendDialog.open) return;
      await refreshFriendBoard();
      if (!ui.friendDialog.open || friendImporting) return;
      setRawText(ui.friendStatus, message`已移除 ${score.name} 的影子。`);
      if (document.activeElement === document.body) ui.friendCourse.focus();
    } catch (error) {
      console.error(error);
      button.disabled = false;
      if (ui.friendDialog.open && !friendImporting) setText(ui.friendStatus, '暂时无法移除这条影子。');
    }
  }

  function initFriendBoard() {
    ui.friendCampus.addEventListener('change', () => { selectedFriendIds = []; updateFriendFilters({ course: '', vehicle: '' }); });
    ui.friendCourse.addEventListener('change', () => { selectedFriendIds = []; updateFriendFilters({ vehicle: '' }); });
    ui.friendVehicle.addEventListener('change', () => { selectedFriendIds = []; updateFriendFilters(); });
    ui.friendMultiPlay?.addEventListener('click', () => {
      if (selectedFriendIds.length >= 2) void playSavedMultiFriends(selectedFriendIds.slice(0, 3));
    });
  }

  function canImportFriend() {
    return isSeedAvailable() && !ui.seedDialog.open;
  }

  function openFriendDialog(week = null) {
    if (!canImportFriend() || ui.friendDialog.open) return;
    clearInput();
    setPriorTimestamp(undefined);
    const opponent = race.opponent;
    setText(ui.friendStatus, opponent ? message`已载入 ${ghostLabel(opponent)} · ${timeLabel(opponent.time)}` :
      '影子保存在当前浏览器。完赛后可导出自己的影子。');
    updateFriendFilters({ campus: getActiveCampus(), course: week ? 'seed-' + week : race.event.id, vehicle: race.entryVehicle });
    ui.friendDialog.showModal();
    void refreshFriendBoard();
  }

  function setFriendImporting(active) {
    friendImporting = active;
    ui.friendDrop.disabled = ui.friendClose.disabled = ui.friendFilters.disabled = active;
    ui.friendScores.inert = active;
  }

  function activateFriendChallenge({ event, opponent }, archive, extraOpponents = []) {
    if (event.seed) worldState.seedCourses[getActiveCampus()] = event;
    else if (event.networkEdges?.length) worldState.customCourses[getActiveCampus()] = event;
    populateCoursePicker();
    selectCourse(event, opponent, extraOpponents);
    setZoomMap(false);
    openMap(false);

    const close = () => {
      setFriendImporting(false);
      ui.friendDialog.close();
    };
    if (!archive) { close(); return; }
    setText(ui.friendStatus, '正在保存影子…');
    void saveFriendGhost({ event, opponent }).then(close, error => {
      console.error(error);
      setFriendImporting(false);
      setText(ui.friendStatus, '影子已载入对战，暂时无法保存到友人对战。');
      ui.friendClose.focus();
    });
  }

  function friendImportFailed(error) {
    setFriendImporting(false);
    if (!(error instanceof GhostFileError)) console.error(error);
    setText(ui.friendStatus, error instanceof GhostFileError ? error.message : '读取影子文件失败，请重新选择。');
  }

  function prepareFriendChallenge(ghost, archive, extraGhosts = []) {
    if (ghost.course.campus === getActiveCampus()) {
      const primary = loadFriendGhost(ghost);
      const extras = extraGhosts.map(item => loadFriendGhost(item).opponent);
      activateFriendChallenge(primary, archive, extras);
      return;
    }
    setRawText(ui.friendStatus, message`正在载入 ${translate(campuses[ghost.course.campus].name)}…`);
    setPendingCampus({ destination: ghost.course.campus, at: performance.now() + 30, ghost, archive, extraGhosts });
  }

  async function importFriendFiles(files) {
    if (!canImportFriend() || friendImporting) return;
    openFriendDialog();
    if (files.length !== 1) {
      setText(ui.friendStatus, '一次请选择一个影子文件。');
      return;
    }
    const file = files[0];
    if (file.size > MAX_GHOST_BYTES) {
      setText(ui.friendStatus, '文件过大，请选择游戏导出的影子文件。');
      return;
    }
    clearInput();
    setFriendImporting(true);
    setText(ui.friendStatus, '正在读取影子文件…');
    try {
      const ghost = readGhostFile(await file.text());
      if (!canImportFriend()) {
        setFriendImporting(false);
        return;
      }
      prepareFriendChallenge(ghost, true);
    } catch (error) { friendImportFailed(error); }
  }

  async function playSavedFriend(id) {
    if (!canImportFriend() || friendImporting) return;
    setFriendImporting(true);
    setText(ui.friendStatus, '正在读取已保存的影子…');
    try {
      const replay = await readSavedFriendGhost(id);
      if (!replay) {
        void refreshFriendBoard();
        throw new GhostFileError('这条影子已被移除。');
      }
      prepareFriendChallenge(readGhostFile(replay), false);
    } catch (error) { friendImportFailed(error); }
  }

  async function playSavedMultiFriends(ids) {
    if (!canImportFriend() || friendImporting || !Array.isArray(ids) || ids.length < 2) return;
    setFriendImporting(true);
    setText(ui.friendStatus, '正在载入同场群跑影子…');
    try {
      const ghosts = [];
      for (const id of ids.slice(0, 3)) {
        const replay = await readSavedFriendGhost(id);
        if (!replay) {
          void refreshFriendBoard();
          throw new GhostFileError('部分已选影子已被移除，请重新选择。');
        }
        ghosts.push(readGhostFile(replay));
      }
      if (ghosts.some(({course}) => course.layout !== ghosts[0].course.layout)) {
        throw new GhostFileError('同场群跑需要相同的赛道布局。');
      }
      ghosts.sort((a, b) => a.run.time - b.run.time);
      prepareFriendChallenge(ghosts[0], false, ghosts.slice(1));
    } catch (error) { friendImportFailed(error); }
  }

  function exportFriendGhost() {
    if (race.phase !== 'done' || !race.lastRun || race.lastRun.unranked) return;
    const ghost = makeGhostFile(race.event, race.lastRun, driverProfile);
    const filename = ghost.rider.name.replace(/[<>:"/\\|?*]/g, '_') + '-' +
      (ghost.course.seed ?? ghost.course.id) + '-' + timeLabel(ghost.run.time).replaceAll(':', '-') + '.ghost.json';
    const url = URL.createObjectURL(new Blob([JSON.stringify(ghost)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function friendResult(opponent, time) {
    const gap = time - opponent.time;
    if (Math.abs(gap) < 5) return message`与 ${opponent.name} 持平`;
    const seconds = (Math.abs(gap) / 1000).toFixed(2);
    return gap < 0 ? message`领先 ${opponent.name} ${seconds} 秒` : message`落后 ${opponent.name} ${seconds} 秒`;
  }

  function initFriendDuel() {
    initFriendBoard();
    ui.friendButton.addEventListener('click', () => openFriendDialog());
    ui.friendDrop.addEventListener('click', () => ui.friendFile.click());
    ui.friendFile.addEventListener('change', () => {
      const files = Array.from(ui.friendFile.files);
      ui.friendFile.value = '';
      if (files.length) void importFriendFiles(files);
    });
    ui.friendClose.addEventListener('click', () => ui.friendDialog.close());
    ui.friendDialog.addEventListener('cancel', event => { if (friendImporting) event.preventDefault(); });
    ui.friendDialog.addEventListener('close', () => {
      clearInput();
      setPriorTimestamp(undefined);
      if (!getSettingsOpen() && !ui.seedDialog.open) focusStage();
    });
    window.addEventListener('dragover', event => {
      if (!event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
      const allowed = canImportFriend() && !friendImporting;
      event.dataTransfer.dropEffect = allowed ? 'copy' : 'none';
      ui.friendDrop.classList.toggle('dragging', allowed && ui.friendDrop.contains(event.target));
    });
    ui.friendDrop.addEventListener('dragleave', () => ui.friendDrop.classList.remove('dragging'));
    window.addEventListener('drop', event => {
      if (!event.dataTransfer?.files.length) return;
      event.preventDefault();
      ui.friendDrop.classList.remove('dragging');
      void importFriendFiles(Array.from(event.dataTransfer.files));
    });
    ui.friendExport.addEventListener('click', exportFriendGhost);
  }

  return {
    openFriendDialog,
    activateFriendChallenge,
    friendImportFailed,
    friendResult,
    updateFriendFilters,
    exportFriendGhost,
    initFriendDuel,
  };
}
