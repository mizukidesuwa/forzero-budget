let friendScores = [];
let friendBoardMessage = '正在读取友人对战…';
let friendBoardRead = 0;
let selectedFriendIds = [];

function updateFriendMultiBar() {
  if (!ui.friendMultiBar) return;
  const count = selectedFriendIds.length;
  ui.friendMultiBar.hidden = count < 2;
  if (count >= 2) setText(ui.friendMultiCount, `已选 ${count}/3 条同场群跑影子`);
}

function setFriendOptions(select,labels,scores,field,preferred) {
  const counts = new Map();
  for (const score of scores) counts.set(score[field],(counts.get(score[field])??0)+1);
  select.replaceChildren(...Array.from(labels,([key,label])=>{
    const count = counts.get(key);
    return new Option(count?label+'（'+count+'）':label,key);
  }));
  select.value = labels.has(preferred)?preferred:scores[0]?.[field]??labels.keys().next().value;
}

function updateFriendFilters({campus,course,vehicle}={}) {
  const campusLabels = new Map(Object.entries(campuses).map(([key,data])=>[key,data.name]));
  setFriendOptions(ui.friendCampus,campusLabels,friendScores,'campus',campus??ui.friendCampus.value);
  const region = ui.friendCampus.value;
  const campusScores = friendScores.filter(score=>score.campus===region);
  const seedCodes = new Set([weeklySeed(region),seedCourses[region]?.seed,...campusScores.map(score=>score.seed)]);
  const courseLabels = new Map(coursesByCampus[region].map(event=>[event.id,event.name]));
  for (const code of seedCodes) {
    if (!code) continue;
    const name = /^[SU]\d-W\d{8}$/.test(code)?'每周挑战 ':'种子赛 ';
    courseLabels.set('seed-'+code,name+code);
  }
  setFriendOptions(ui.friendCourse,courseLabels,campusScores,'courseId',course??ui.friendCourse.value);
  const courseScores = campusScores.filter(score=>score.courseId===ui.friendCourse.value);
  const vehicles = new Map(Object.entries(vehicleChoices).filter(([,data])=>data.race).map(([key,data])=>[key,data.name]));
  setFriendOptions(ui.friendVehicle,vehicles,courseScores,'vehicle',vehicle??ui.friendVehicle.value);
  renderFriendScores(courseScores);
}

function friendScoreRow(score,compatible) {
  const row = ui.friendScoreTemplate.content.firstElementChild.cloneNode(true);
  row.querySelector('.friend-score-name').textContent = score.name;
  const time = timeLabel(score.time);
  row.querySelector('.friend-score-time').textContent = time;
  const description = score.name+' · '+time;
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
        if (!selectedFriendIds.includes(score.id)) selectedFriendIds.push(score.id);
      } else {
        selectedFriendIds = selectedFriendIds.filter(id => id !== score.id);
      }
      updateFriendMultiBar();
    });
  }
  play.disabled = !compatible;
  play.setAttribute('aria-label','对战 '+description);
  remove.setAttribute('aria-label','移除 '+description);
  play.addEventListener('click',()=>void playSavedFriend(score.id));
  remove.addEventListener('click',()=>void deleteFriendScore(score,remove));
  return row;
}

function renderFriendScores(courseScores) {
  const {value:campus} = ui.friendCampus, {value:course} = ui.friendCourse;
  const scores = courseScores.filter(score=>score.vehicle===ui.friendVehicle.value)
    .sort((a,b)=>a.time-b.time||a.id-b.id);
  const visibleIds = new Set(scores.map(s => s.id));
  selectedFriendIds = selectedFriendIds.filter(id => visibleIds.has(id));
  updateFriendMultiBar();
  const message = friendBoardMessage || (scores.length?'':'这个赛道和车型还没有影子成绩。');
  setText(ui.friendBoardNote,message);
  ui.friendBoardNote.hidden = !message;
  ui.friendScores.replaceChildren();
  if (!scores.length || friendBoardMessage) return;

  const event = coursesByCampus[campus].find(item=>item.id===course)??
    (seedCourses[campus]?.id===course?seedCourses[campus]:null);
  const currentLayout = event?ghostCourseKey(event):null;
  const validSeed = !course.startsWith('seed-')||readSeedCode(course.slice(5),campus)===course.slice(5);
  const groups = new Map();
  for (const score of scores) {
    if (!groups.has(score.layout)) groups.set(score.layout,[]);
    groups.get(score.layout).push(score);
  }
  const layouts = [...groups.keys()].sort((a,b)=>Number(b===currentLayout)-Number(a===currentLayout));
  for (const layout of layouts) {
    const compatible = validSeed&&(!currentLayout||layout===currentLayout);
    if (layouts.length>1||!compatible) {
      const title = document.createElement('h3');
      title.textContent = (compatible?'布局 ':'旧版布局 ')+layout;
      ui.friendScores.append(title);
    }
    const list = document.createElement('ol');
    list.className = 'friend-ranking';
    for (const score of groups.get(layout)) list.append(friendScoreRow(score,compatible));
    ui.friendScores.append(list);
  }
}

async function refreshFriendBoard() {
  const read = ++friendBoardRead;
  ui.friendScores.setAttribute('aria-busy','true');
  try {
    const scores = await readFriendScores();
    if (read!==friendBoardRead||!ui.friendDialog.open) return;
    friendScores = scores.reverse();
    friendBoardMessage = '';
  } catch (error) {
    if (read!==friendBoardRead||!ui.friendDialog.open) return;
    console.error(error);
    friendScores = [];
    friendBoardMessage = '暂时无法读取本机友人对战。';
  } finally {
    if (read===friendBoardRead) ui.friendScores.setAttribute('aria-busy','false');
  }
  updateFriendFilters();
}

async function deleteFriendScore(score,button) {
  if (friendImporting) return;
  button.disabled = true;
  try {
    await removeSavedFriendGhost(score.id);
    if (!ui.friendDialog.open) return;
    await refreshFriendBoard();
    if (!ui.friendDialog.open||friendImporting) return;
    setText(ui.friendStatus,'已移除 '+score.name+' 的影子。');
    if (document.activeElement===document.body) ui.friendCourse.focus();
  } catch (error) {
    console.error(error);
    button.disabled = false;
    if (ui.friendDialog.open&&!friendImporting) setText(ui.friendStatus,'暂时无法移除这条影子。');
  }
}

function initFriendBoard() {
  ui.friendCampus.addEventListener('change',()=>{selectedFriendIds=[];updateFriendFilters({course:'',vehicle:''});});
  ui.friendCourse.addEventListener('change',()=>{selectedFriendIds=[];updateFriendFilters({vehicle:''});});
  ui.friendVehicle.addEventListener('change',()=>{selectedFriendIds=[];updateFriendFilters();});
  ui.friendMultiPlay?.addEventListener('click',()=>{
    if (selectedFriendIds.length >= 2) void playSavedMultiFriends(selectedFriendIds.slice(0,3));
  });
}
