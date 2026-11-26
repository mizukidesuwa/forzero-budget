let friendImporting = false;

function canImportFriend() {
  return seedAvailable()&&!ui.seedDialog.open;
}

function openFriendDialog(week=null) {
  if (!canImportFriend() || ui.friendDialog.open) return;
  clearInput();
  priorTimestamp = undefined;
  const opponent = race.opponent;
  setText(ui.friendStatus,opponent?'已载入 '+opponent.kind+' · '+timeLabel(opponent.time):
    '影子保存在当前浏览器。完赛后可导出自己的影子。');
  updateFriendFilters({campus:activeCampus,course:week?'seed-'+week:race.event.id,vehicle:race.entryVehicle});
  ui.friendDialog.showModal();
  void refreshFriendBoard();
}

function setFriendImporting(active) {
  friendImporting = active;
  ui.friendDrop.disabled = ui.friendClose.disabled = ui.friendFilters.disabled = active;
  ui.friendScores.inert = active;
}

function activateFriendChallenge({event,opponent},archive,extraOpponents=[]) {
  if (event.seed) seedCourses[activeCampus] = event;
  populateCoursePicker();
  selectCourse(event,opponent,extraOpponents);
  zoomMap = false;
  openMap(false);

  const close = () => {
    setFriendImporting(false);
    ui.friendDialog.close();
  };
  if (!archive) { close(); return; }
  setText(ui.friendStatus,'正在保存影子…');
  void saveFriendGhost({event,opponent}).then(close,error=>{
    console.error(error);
    setFriendImporting(false);
    setText(ui.friendStatus,'影子已载入对战，暂时无法保存到友人对战。');
    ui.friendClose.focus();
  });
}

function friendImportFailed(error) {
  setFriendImporting(false);
  if (!(error instanceof GhostFileError)) console.error(error);
  setText(ui.friendStatus,error instanceof GhostFileError?error.message:'读取影子文件失败，请重新选择。');
}

function prepareFriendChallenge(ghost,archive,extraGhosts=[]) {
  if (ghost.course.campus===activeCampus) {
    const primary = loadFriendGhost(ghost);
    const extras = extraGhosts.map(item => loadFriendGhost(item).opponent);
    activateFriendChallenge(primary,archive,extras);
    return;
  }
  setText(ui.friendStatus,'正在载入 '+campuses[ghost.course.campus].name+'…');
  pendingCampus = {destination:ghost.course.campus,at:performance.now()+30,ghost,archive,extraGhosts};
}

async function importFriendFiles(files) {
  if (!canImportFriend() || friendImporting) return;
  openFriendDialog();
  if (files.length!==1) {
    setText(ui.friendStatus,'一次请选择一个影子文件。');
    return;
  }
  const file = files[0];
  if (file.size>MAX_GHOST_BYTES) {
    setText(ui.friendStatus,'文件过大，请选择游戏导出的影子文件。');
    return;
  }
  clearInput();
  setFriendImporting(true);
  setText(ui.friendStatus,'正在读取影子文件…');
  try {
    const ghost = readGhostFile(await file.text());
    if (!canImportFriend()) {
      setFriendImporting(false);
      return;
    }
    prepareFriendChallenge(ghost,true);
  } catch(error) { friendImportFailed(error); }
}

async function playSavedFriend(id) {
  if (!canImportFriend() || friendImporting) return;
  setFriendImporting(true);
  setText(ui.friendStatus,'正在读取已保存的影子…');
  try {
    const replay = await readSavedFriendGhost(id);
    if (!replay) {
      void refreshFriendBoard();
      throw new GhostFileError('这条影子已被移除。');
    }
    prepareFriendChallenge(readGhostFile(replay),false);
  } catch(error) { friendImportFailed(error); }
}

async function playSavedMultiFriends(ids) {
  if (!canImportFriend() || friendImporting || !Array.isArray(ids) || ids.length < 2) return;
  setFriendImporting(true);
  setText(ui.friendStatus,'正在载入同场群跑影子…');
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
    ghosts.sort((a, b) => a.run.time - b.run.time);
    prepareFriendChallenge(ghosts[0], false, ghosts.slice(1));
  } catch(error) { friendImportFailed(error); }
}

function exportFriendGhost() {
  if (race.phase!=='done' || !race.lastRun) return;
  const ghost = makeGhostFile(race.event,race.lastRun,driverProfile);
  const filename = ghost.rider.name.replace(/[<>:"/\\|?*]/g,'_')+'-'+
    (ghost.course.seed??ghost.course.id)+'-'+timeLabel(ghost.run.time).replaceAll(':','-')+'.ghost.json';
  const url = URL.createObjectURL(new Blob([JSON.stringify(ghost)],{type:'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function friendResult(opponent,time) {
  const gap = time-opponent.time;
  if (Math.abs(gap)<5) return '与 '+opponent.name+' 持平';
  return (gap<0?'领先 ':'落后 ')+opponent.name+' '+(Math.abs(gap)/1000).toFixed(2)+' 秒';
}

function initFriendDuel() {
  initFriendBoard();
  ui.friendButton.addEventListener('click',()=>openFriendDialog());
  ui.friendDrop.addEventListener('click',()=>ui.friendFile.click());
  ui.friendFile.addEventListener('change',()=>{
    const files = Array.from(ui.friendFile.files);
    ui.friendFile.value = '';
    if (files.length) void importFriendFiles(files);
  });
  ui.friendClose.addEventListener('click',()=>ui.friendDialog.close());
  ui.friendDialog.addEventListener('cancel',event=>{if(friendImporting) event.preventDefault();});
  ui.friendDialog.addEventListener('close',()=>{
    clearInput();
    priorTimestamp = undefined;
    if (!settingsOpen&&!ui.seedDialog.open) focusStage();
  });
  window.addEventListener('dragover',event=>{
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    const allowed = canImportFriend()&&!friendImporting;
    event.dataTransfer.dropEffect = allowed?'copy':'none';
    ui.friendDrop.classList.toggle('dragging',allowed&&ui.friendDrop.contains(event.target));
  });
  ui.friendDrop.addEventListener('dragleave',()=>ui.friendDrop.classList.remove('dragging'));
  window.addEventListener('drop',event=>{
    if (!event.dataTransfer?.files.length) return;
    event.preventDefault();
    ui.friendDrop.classList.remove('dragging');
    void importFriendFiles(Array.from(event.dataTransfer.files));
  });
  ui.friendExport.addEventListener('click',exportFriendGhost);
}
