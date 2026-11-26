const seedAvailable=()=>ready&&!pendingCampus&&!settingsOpen&&!['race','count'].includes(race.phase);
const seedStorageKey=campus=>'szu-litchi-last-seed-'+campus;

function openSeedDialog() {
  if(!seedAvailable()||ui.seedDialog.open) return;
  let remembered='';
  try { remembered=localStorage.getItem(seedStorageKey(activeCampus))??''; } catch {}
  if(!readSeedCode(remembered,activeCampus)) remembered='';
  const prefix=activeCampus==='ucl'?'U':'S';
  ui.seedCampus.textContent=activeCampus==='ucl'?'伦敦 · Bloomsbury':'深圳 · 粤海校区';
  ui.seedInput.placeholder=prefix+seedVersion+'-326';
  ui.seedInput.value=seedCourses[activeCampus]?.seed??remembered;
  ui.weeklyCode.value=weeklySeed(activeCampus);
  ui.seedStatus.textContent='同一张地图输入同一种子码，得到同一条赛道。把种子码发给朋友即可共用赛道。';
  clearInput();
  priorTimestamp=undefined;
  ui.seedDialog.showModal();
  ui.seedInput.select();
}

function chooseSeedCourse(raw) {
  if(!seedAvailable()) return;
  const code=readSeedCode(raw,activeCampus);
  if(!code) {
    const prefix=activeCampus==='ucl'?'U':'S';
    ui.seedStatus.textContent='请输入 1–12 位英文字母或数字，或当前地图的完整种子码（'+prefix+seedVersion+'- 开头）。';
    ui.seedInput.focus();
    return;
  }
  const previous=seedCourses[activeCampus];
  const event=previous?.seed===code?previous:makeSeedCourse(code,activeCampus);
  if(!event) {
    ui.seedStatus.textContent='这个种子没有合适的路线，请试试另一个。';
    return;
  }
  seedCourses[activeCampus]=event;
  try { localStorage.setItem(seedStorageKey(activeCampus),code); } catch {}
  populateCoursePicker();
  selectCourse(event);
  ui.seedDialog.close();
}

function initSeedDialog() {
  let rollover;
  function refreshWeek() {
    clearTimeout(rollover);
    if(!ui.seedDialog.open) return;
    const now=new Date(), next=new Date(now);
    next.setDate(now.getDate()+7-(now.getDay()+6)%7);
    next.setHours(0,0,0,0);
    ui.weeklyCode.value=weeklySeed(activeCampus,now);
    rollover=setTimeout(refreshWeek,Math.max(100,next-now+30));
  }
  ui.seedButton.addEventListener('click',openSeedDialog);
  ui.seedButton.addEventListener('click',refreshWeek);
  window.addEventListener('focus',refreshWeek);
  document.addEventListener('visibilitychange',refreshWeek);
  ui.weeklyPlay.addEventListener('click',()=>{refreshWeek();chooseSeedCourse(ui.weeklyCode.value);});
  ui.weeklyBoard.addEventListener('click',()=>{
    refreshWeek();
    const code = ui.weeklyCode.value;
    ui.seedDialog.close();
    openFriendDialog(code);
  });
  ui.weeklyCopy.addEventListener('click',async()=>{
    refreshWeek();
    try {
      await navigator.clipboard.writeText(ui.weeklyCode.value);
    } catch {
      ui.weeklyCode.focus();
      ui.weeklyCode.select();
      if(!document.execCommand?.('copy')) {
        ui.seedStatus.textContent='种子码已选中，可用系统复制命令。';
        return;
      }
    }
    ui.seedStatus.textContent='已复制 '+ui.weeklyCode.value;
  });
  ui.seedForm.addEventListener('submit',event=>{
    event.preventDefault();
    chooseSeedCourse(ui.seedInput.value);
  });
  ui.seedRandom.addEventListener('click',()=>{
    const value=Math.floor(Math.random()*2**32).toString(36).toUpperCase().padStart(7,'0');
    ui.seedInput.value=value;
    chooseSeedCourse(value);
  });
  ui.seedClose.addEventListener('click',()=>ui.seedDialog.close());
  ui.seedDialog.addEventListener('close',()=>{
    clearTimeout(rollover);
    priorTimestamp=undefined;
    clearInput();
    if (!ui.friendDialog.open) focusStage();
  });
}
