const ONLINE_FORMAT = {bo1:'BO1',bo3:'BO3',league:'积分联赛',random:'盲盒随机',triathlon:'铁人三项'};
const ONLINE_VEHICLE_RULE = {bike:'统一自行车',trail:'统一越野小摩托',ebike:'统一电动自行车',chair:'统一电动轮椅',any:'自由混选'};
const ONLINE_API = '/online/rooms';
const ONLINE_HOST_KEY = 'szu-litchi-online-host-1';
let onlineRoom = null;
let onlineBusy = false;
let onlineNotice = '';
let onlineAppMode = false;
let onlineKeepalive = null;

function stopAppHost(keepalive=false) {
  if (!onlineAppMode) return Promise.resolve();
  return fetch('/app/host/stop',{method:'POST',keepalive,cache:'no-store'}).catch(()=>{});
}

async function initOnlineApp() {
  if (!onlineSite() || !['127.0.0.1','localhost','[::1]'].includes(location.hostname)) return;
  try {
    const response = await fetch('/app/status',{cache:'no-store',signal:AbortSignal.timeout(6000)});
    if (!response.ok) return;
    const data = await response.json().catch(()=>null);
    if (data?.app!=='szu-litchi-loop') return;
    onlineAppMode = true;
    onlineKeepalive = new EventSource('/app/keepalive');
    if (!ui.onlineHostInput.value.trim()) ui.onlineHostInput.value = loadOnlineHost();
    void hydrateLocalSave();
    renderOnline();
  } catch {}
}

function loadOnlineHost() {
  try { return localStorage.getItem(ONLINE_HOST_KEY) ?? ''; }
  catch { return ''; }
}

function saveOnlineHost(value) {
  try {
    const trimmed = value.trim();
    if (trimmed) localStorage.setItem(ONLINE_HOST_KEY,trimmed);
    else localStorage.removeItem(ONLINE_HOST_KEY);
  } catch {}
}

function normalizeOnlineHost(raw) {
  const text = (raw ?? '').trim();
  if (!text) return '';
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
  const stripped = hasScheme ? text : text.replace(/\/.*$/, '');
  const needsPort = !hasScheme && !/:\d+$/.test(stripped) &&
    (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(stripped) || /^\[[^\]]+\]$/.test(stripped) || stripped.toLowerCase()==='localhost');
  const candidate = hasScheme ? text : 'http://' + stripped + (needsPort ? ':8787' : '');
  let parsed;
  try { parsed = new URL(candidate); }
  catch { throw new Error('房主地址格式无效，例如 26.1.2.3 或 192.168.1.5:8787。'); }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error('房主地址仅支持 http 或 https。');
  return parsed.origin;
}

async function copyOnlineText(text) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch {}
  try {
    const box = document.createElement('textarea');
    box.value = text;
    box.setAttribute('readonly','');
    box.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.append(box);
    box.select();
    const ok = document.execCommand('copy');
    box.remove();
    return ok;
  } catch { return false; }
}

function onlineInviteLink(session) {
  const hash = '#room='+session.state.code;
  if (session.ownedHost && session.hostAddresses?.length) return session.hostAddresses[0].url+'/'+hash;
  if (session.origin) return session.origin+'/'+hash;
  if (onlineSite()) {
    const url = new URL(location.href);
    const localHost = url.hostname==='127.0.0.1'||url.hostname==='localhost'||url.hostname==='[::1]';
    if (localHost && session.hostAddresses?.length) return session.hostAddresses[0].url+'/'+hash;
    url.hash = 'room='+session.state.code;
    return url.href;
  }
  return session.state.code;
}

async function loadOnlineHostInfo(session) {
  if (!session.origin && !location.hostname) return;
  try {
    const info = await onlineRequest((session.origin ?? '')+'/online/host-info');
    if (onlineRoom===session && Array.isArray(info?.addresses)) {
      session.hostAddresses = info.addresses;
      renderOnline();
    }
  } catch {}
}

function onlineProfilePayload() {
  const {tyres,gears,brakes,frame,sprint} = race.bike;
  const activeVeh = onlineRoom ? onlineVehicleForSession(onlineRoom) : driverProfile.vehicle;
  return {
    name:driverProfile.name,paint:driverProfile.paint,vehicle:driverProfile.vehicle,look:bicycleStyle(driverProfile.look),
    bike:{tyres,gears,brakes,frame,sprint},
    tuning:vehicleTunings[activeVeh] ?? vehicleTunings[driverProfile.vehicle] ?? {},
    tunings:vehicleTunings,
  };
}

function onlineRoundBuild() {
  const build=onlineRoom?.state.round?.builds?.[onlineRoom.id];
  if(onlineRoom?.state.phase!=='race'||!build) return null;
  const {vehicle,parts}=build;
  return {vehicle,illegal:tuning190.summarize(vehicle,parts).illegal,
    bike:vehicle==='bike'?buildBike(parts.tyres,parts.gears,parts.brakes,parts.frame,parts.sprint):race.bike,
    tuning:vehicle==='bike'?null:buildVehicleTuning(vehicle,parts)};
}

function roomBudgetLabel(state) {
  const limit=state.tuning?.budget??state.round?.budget??tuning190.budgetLimit(state.budget);
  if(limit!==null) return (state.blind?'盲盒 ':'')+'预算 ¥'+limit;
  return state.blind?'每轮抽取预算':state.budget==='party'?'娱乐房 · 允许违禁件':'不限预算';
}

function onlineRouteKey(route) {
  return route ? `${route.campus}:${route.id}:${route.seed??''}:${route.layout}` : '';
}

function onlineVehicleForSession(session) {
  const rule = session?.state.vehicleRule ?? 'bike';
  return rule==='any' ? knownVehicle(driverProfile.vehicle) : knownVehicle(rule);
}

function syncOnlineProfile() {
  const session = onlineRoom;
  if (!session || session.state.phase==='race') return;
  session.originalBike = race.bike;
  const targetVehicle = onlineVehicleForSession(session);
  if (race.rider.vehicle!==targetVehicle) race.setVehicle(targetVehicle);
  void onlineCommand(session,{action:'profile',...onlineProfilePayload()}).catch(()=>{});
  renderOnline();
}

function showOnlineMessage(message) {
  onlineNotice = message;
  setText(ui.onlineStatus,message);
}

function onlineRequest(url,body,token,keepalive=false) {
  const options = {cache:'no-store',signal:AbortSignal.timeout(8000)};
  if (body) Object.assign(options,{method:'POST',keepalive,body:JSON.stringify(body),headers:{
    'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})
  }});
  return fetch(url,options).then(async response=>{
    const result = await response.json().catch(()=>null);
    if (!response.ok || !result) throw new Error(result?.error??'无法连接联机服务。');
    return result;
  });
}

function onlineCommand(session,body,keepalive=false) {
  return onlineRequest(session.url+'/command?id='+session.id,body,session.token,keepalive);
}

function onlineSite() { return /^https?:$/.test(location.protocol); }

function onlineDataLinks(session) {
  let linked = 0;
  for (const player of session.state.players) {
    const peer = session.peers.get(player.id);
    if (peer?.pc.connectionState==='connected' && peer.channel?.readyState==='open') linked++;
  }
  return linked;
}

function updateOnlineLatency(session,now) {
  ui.onlineLatency.hidden = !session;
  if (!session) return;
  const measured = [];
  for (const label of ui.onlinePlayers.querySelectorAll('[data-latency-peer]')) {
    const id = label.dataset.latencyPeer;
    const ms = onlinePeerLatency(session.peers.get(id),now);
    if (ms!==null) measured.push(ms);
    setText(label,ms===null?'延迟 —':`延迟 ${ms} ms`);
  }
  setText(ui.onlineLatency,measured.length?`延迟 ${Math.max(...measured)} ms`:'延迟 —');
  ui.onlineLatency.title = '本机与已测量骑手之间的最高往返延迟';
}

function onlineStandings(state) {
  ui.onlineRounds.replaceChildren();
  ui.onlineStanding.replaceChildren();
  const rows = [...state.history];
  if (state.phase==='race') rows.push(state.round);
  const names = new Map([...state.standing,...state.players].map(({id,name})=>[id,name]));
  for (const round of rows) {
    const line = document.createElement('li');
    const results = [...round.results].sort((a,b)=>(a.ms??Infinity)-(b.ms??Infinity));
    line.textContent = '第 '+round.number+' 轮 · '+(results.map(({id,ms})=>
      (names.get(id)??'已退出骑手')+' '+(ms===null?'未完赛':timeLabel(ms))).join(' / ') || '骑行中');
    ui.onlineRounds.append(line);
  }
  for (const player of state.standing) {
    const row = document.createElement('li');
    row.textContent = (state.winners.includes(player.id)?'冠军 · ':'')+player.name+' · '+player.wins+' 胜 · '+player.points+' 分';
    ui.onlineStanding.append(row);
  }
  ui.onlineRounds.hidden = !rows.length;
  ui.onlineStanding.hidden = !state.standing.length;
}

function playerGearSummary(player,rule) {
  const vehicle = rule==='any' ? knownVehicle(player.vehicle) : knownVehicle(rule);
  if (vehicle!=='bike') {
    const slots = vehicleTuningChoices[vehicle];
    const parts = player.tuning;
    if (!slots || !parts) return vehicleChoices[vehicle].name;
    const labels = slots.map(s=>s.options[parts[s.key]]?.name).filter(Boolean);
    return labels.length ? vehicleChoices[vehicle].name+' · '+labels.join('/') : vehicleChoices[vehicle].name;
  }
  const b = player.bike;
  if (!b) return '标准自行车';
  const tags = [tyreChoices[b.tyres]?.name??'均衡胎',gearChoices[b.gears]?.name??'标准齿比',brakeChoices[b.brakes]?.name??'均衡刹车'];
  if (b.frame && b.frame!=='stock' && frameChoices[b.frame]) tags.push(frameChoices[b.frame].name);
  if (b.sprint && b.sprint!=='stock' && sprintChoices[b.sprint]) tags.push(sprintChoices[b.sprint].name);
  return tags.join('/');
}

function populateOnlineLobbyCourses(campus,currentId) {
  ui.onlineLobbyCourse.replaceChildren();
  for (const event of availableCourses(campus)) {
    const opt = document.createElement('option');
    opt.value = event.id;
    opt.textContent = event.name;
    ui.onlineLobbyCourse.append(opt);
  }
  if (currentId && Array.from(ui.onlineLobbyCourse.options).some(o=>o.value===currentId)) {
    ui.onlineLobbyCourse.value = currentId;
  }
}

function onlineTuningRemainingSec(session,now=performance.now()) {
  if (session?.state.phase!=='tuning'||!Number.isFinite(session.state.tuning?.endsAt)) return null;
  return Math.max(0,Math.ceil((session.state.tuning.endsAt-(now+(session.serverOffset??0)))/1000));
}

function updateOnlineTuningBanner(session,now=performance.now()) {
  const tuning = session?.state.phase==='tuning';
  const rem = onlineTuningRemainingSec(session,now);
  const readyCount = session ? session.state.players.filter(p=>p.online&&p.ready).length : 0;
  const onlineCount = session ? session.state.players.filter(p=>p.online).length : 0;
  const self = session?.state.players.find(p=>p.id===session.id);
  const isHost = Boolean(session && session.id===session.state.host);
  const problem=tuning?session.state.budgetProblems?.find(item=>item.id===session.id):null;
  const label = tuning ? `${roomBudgetLabel(session.state)} · ${rem===null?'等待合规配车':`改车倒计时 ${rem}s`} · 已完成 ${readyCount}/${onlineCount}${problem?' · '+problem.reason:''}` : '';
  if (ui.onlineTuningBanner) {
    ui.onlineTuningBanner.hidden = !tuning;
    if (tuning) setText(ui.onlineTuningBanner,label+(self?.ready?'（你已确认改装，等待他人或发车）':' · 可点「车库改装」调整配装'));
  }
  if (ui.settingsTuneBar) {
    ui.settingsTuneBar.hidden = !tuning;
    if (tuning) {
      setText(ui.settingsTuneText,label);
      setText(ui.settingsTuneReady,self?.ready?'继续改装':'完成改装');
      ui.settingsTuneReady.disabled = onlineBusy;
      ui.settingsTuneSkip.hidden = !isHost;
      ui.settingsTuneSkip.disabled = onlineBusy;
    }
  }
}

function renderOnline() {
  const session = onlineRoom;
  ui.onlineLobby.hidden = !session;
  ui.onlineSetup.hidden = Boolean(session);
  const hasHost = Boolean(ui.onlineHostInput.value.trim());
  const canCreate = onlineAppMode || onlineSite() || hasHost;
  const canJoin = hasHost || (onlineSite() && !onlineAppMode);
  ui.onlineCreate.disabled = onlineBusy||!canCreate||!window.RTCPeerConnection;
  ui.onlineJoin.disabled = onlineBusy||!canJoin||!window.RTCPeerConnection;
  ui.onlineHostInput.disabled = onlineBusy;
  ui.onlineLeave.disabled = onlineBusy;
  if (!session) {
    ui.onlineHostHint.hidden = true;
    ui.onlineHostControls.hidden = true;
    if (ui.onlineFormat.value === 'triathlon') {
      ui.onlineVehicleRule.value = 'bike';
      ui.onlineVehicleRule.disabled = true;
    } else {
      ui.onlineVehicleRule.disabled = onlineBusy;
    }
    updateOnlineTuningBanner(null);
    updateOnlineLatency(null,performance.now());
    return;
  }
  const {state} = session;
  const self = state.players.find(player=>player.id===session.id);
  const waiting = state.phase==='lobby'||state.phase==='between';
  const tuning = state.phase==='tuning';
  const isHost = session.id===state.host;
  const linked = onlineDataLinks(session);
  const rule = state.vehicleRule ?? 'bike';
  const weather = knownWeather(state.weather);
  setText(ui.onlineTitle,ONLINE_FORMAT[state.format]+' · '+(session.course?.name??'载入赛道')+' · '+weatherChoices[weather].name);
  setText(ui.onlineCode,state.code);
  const activeVeh = onlineVehicleForSession(session);
  const {tyres,gears,brakes} = race.bike;
  const wSpd = state.windSpeed ?? 0;
  const wLabel = wSpd > 0 ? `${(typeof WIND_LABELS!=='undefined'?WIND_LABELS[state.windDir??0]:'')||'风'} ${Number(wSpd).toFixed(1)}m/s` : '无风';
  const ruleTags = `碰撞箱：${state.collision?'开':'关'} · 改车 ${state.tuningSeconds??0}s · ${wLabel} · ${roomBudgetLabel(state)}`;
  if (state.format==='triathlon') {
    const step = Math.min(3,state.history.length+(state.phase==='done'?0:1));
    setText(ui.onlineBike,`铁人三项第 ${step}/3 轮（${vehicleChoices[activeVeh].name}）· 自行车→轮椅→越野 · ${ruleTags}`);
  } else {
    setText(ui.onlineBike,ONLINE_VEHICLE_RULE[rule]+' · 我的配置：'+
      (activeVeh==='bike'?[tyreChoices[tyres].name,gearChoices[gears].name,brakeChoices[brakes].name].join(' / '):vehicleChoices[activeVeh].name)+
      ` · ${ruleTags}`);
  }
  let hostHint = '';
  if ((session.ownedHost || !session.origin) && session.hostAddresses?.length) {
    hostHint = '房主地址 · '+session.hostAddresses.slice(0,3).map(item=>`${item.address}:${item.port}（${item.label}）`).join(' / ');
  } else if (session.origin) {
    hostHint = '已连主机 · '+session.origin.replace(/^https?:\/\//,'');
  }
  ui.onlineHostHint.hidden = !hostHint;
  setText(ui.onlineHostHint,hostHint);

  const canConfig = isHost && state.phase!=='race' && !tuning;
  ui.onlineHostControls.hidden = !canConfig;
  if (canConfig) {
    const routeCampus = state.route?.campus ?? activeCampus;
    if (ui.onlineLobbyCampus.value !== routeCampus) ui.onlineLobbyCampus.value = routeCampus;
    populateOnlineLobbyCourses(routeCampus, state.route?.id);
    ui.onlineLobbyVehicle.value = rule;
    ui.onlineLobbyWeather.value = weather;
    ui.onlineLobbyBudget.value = tuning190.normalizeBudget(state.budget);
    ui.onlineLobbyWindMode.value = knownWindMode(state.windMode);
    ui.onlineLobbyBlind.value = state.blind?'on':'off';
    ui.onlineLobbyBudget.disabled=ui.onlineLobbyWindMode.disabled=ui.onlineLobbyBlind.disabled=onlineBusy;
    if (ui.onlineLobbyTuning) ui.onlineLobbyTuning.value = String(state.tuningSeconds ?? 0);
    if (ui.onlineLobbyCollision) ui.onlineLobbyCollision.value = state.collision ? 'on' : 'off';
    if (ui.onlineLobbyWindSpeed) ui.onlineLobbyWindSpeed.value = String(state.windSpeed ?? 0);
    if (ui.onlineLobbyWindDir) ui.onlineLobbyWindDir.value = String(state.windDir ?? 0);
    ui.onlineLobbyCampus.disabled = ui.onlineLobbyCourse.disabled = ui.onlineLobbyWeather.disabled = onlineBusy;
    if (ui.onlineLobbySeed) {
      ui.onlineLobbySeed.hidden = routeCampus==='shunde';
      ui.onlineLobbySeed.disabled = onlineBusy || routeCampus==='shunde';
    }
    if (ui.onlineLobbyTuning) ui.onlineLobbyTuning.disabled = onlineBusy;
    if (ui.onlineLobbyCollision) ui.onlineLobbyCollision.disabled = onlineBusy;
    if (ui.onlineLobbyWindSpeed) ui.onlineLobbyWindSpeed.disabled = onlineBusy;
    if (ui.onlineLobbyWindDir) ui.onlineLobbyWindDir.disabled = onlineBusy;
    ui.onlineLobbyVehicle.disabled = onlineBusy || state.format==='triathlon';
  }

  const roster = state.players.map(player=>{
    const row = document.createElement('li');
    const peer = session.peers.get(player.id);
    const connected = player===self||(peer?.pc.connectionState==='connected'&&peer.channel?.readyState==='open');
    const readyLabel = !player.online?'重连中':!connected?'建连中':
      tuning?(player.ready?'改装完成':'改装中'):
      (player.ready&&waiting?'已准备':'已连接');
    row.textContent = [player.name+(player===self?'（你）':''),player.id===state.host?'房主':'',
      readyLabel,playerGearSummary(player,rule)].filter(Boolean).join(' · ');
    if (player!==self) {
      const label = document.createElement('span');
      label.className = 'online-peer-latency';
      label.dataset.latencyPeer = player.id;
      row.append(label);
    }
    return row;
  });
  ui.onlinePlayers.replaceChildren(...roster);
  updateOnlineLatency(session,performance.now());
  ui.onlineReady.hidden = !(waiting||tuning);
  ui.onlineReady.disabled = onlineBusy||!session.course||!session.clockReady||
    (waiting && !self?.ready && (state.players.length<2||linked!==state.players.length-1));
  setText(ui.onlineReady,tuning?(self?.ready?'继续改装':'完成改装'):(self?.ready?'取消准备':'准备'));
  ui.onlineStart.hidden = !(waiting||tuning)||!isHost;
  setText(ui.onlineStart,tuning?'立即发车':'发车');
  ui.onlineStart.disabled = onlineBusy||(waiting&&(state.players.length<2||!state.players.every(player=>player.online&&player.ready)||linked!==state.players.length-1));
  ui.onlineGarage.hidden = state.phase==='race';
  ui.onlineGarage.disabled = onlineBusy || (waiting && Boolean(self?.ready));
  ui.onlineInvite.hidden = state.phase!=='lobby';
  onlineStandings(state);
  updateOnlineTuningBanner(session,performance.now());
  if (onlineNotice) return;
  const guidance = !session.course?'正在载入房间赛道…':!session.clockReady?'正在同步发车时钟…':state.phase==='done'?
    (state.winners.length?'比赛结束。房主可切换赛道开始下一局。':'比赛结束，暂无完赛骑手。'):
    tuning?'改装倒计时中：可进入车库调校配装，全员完成后自动发车。':
    state.phase==='race'?'本轮进行中。':state.players.length<2?'复制邀请链接或把房主地址发给好友。':
    linked!==state.players.length-1?'正在建立骑手间连接…':'准备前可点「车库改装」调整配装。';
  setText(ui.onlineStatus,guidance);
}

function showOnlineDialog() {
  if (!ready || settingsOpen || ui.seedDialog.open || ui.friendDialog.open || ui.onlineDialog.open) return;
  if (!onlineRoom && (pendingCampus || race.phase==='race'||race.phase==='count')) return;
  clearInput();
  if (!onlineRoom) {
    priorTimestamp = undefined;
    ui.onlineWeather.value = knownWeather(preferences.weather);
    ui.onlineWindMode.value = knownWindMode(preferences.windMode);
    if (ui.onlineWindSpeed) ui.onlineWindSpeed.value = String(preferences.windSpeed ?? 0);
    if (ui.onlineWindDir) ui.onlineWindDir.value = String(preferences.windDir ?? 0);
  }
  showOnlineMessage('');
  if (!window.RTCPeerConnection) showOnlineMessage('这个浏览器无法建立 WebRTC 连接。');
  else if (!onlineRoom&&!onlineAppMode&&!onlineSite()&&!ui.onlineHostInput.value.trim()) {
    showOnlineMessage('输入房主 IP 加入房间；如需自己建房，请通过「启动游戏.bat」打开。');
  }
  renderOnline();
  ui.onlineDialog.showModal();
}

function findOnlineCourse(route) {
  const event = route.seed ? makeSeedCourse(route.seed,route.campus) : coursesByCampus[route.campus].find(course=>course.id===route.id);
  if (!event||event.id!==route.id||ghostCourseKey(event)!==route.layout) throw new Error('房间赛道与本机版本不一致。');
  return event;
}

async function setOnlineCourse(session) {
  const route = session.state.route;
  const routeKey = onlineRouteKey(route);
  const event = route.campus===activeCampus ? findOnlineCourse(route) : await new Promise((resolve,reject)=>{
    pendingCampus = {destination:route.campus,at:performance.now()+30,online:{route,resolve,reject}};
  });
  if (onlineRoom!==session) return;
  session.course = event;
  session.routeKey = routeKey;
  race.online = true;
  race.practice = null;
  race.bike = session.originalBike;
  race.opponent = null;
  race.setVehicle(onlineVehicleForSession(session));
  setActiveWeather(session.state.weather ?? 'day');
  if (event.seed) seedCourses[event.campus] = event;
  populateCoursePicker();
  selectCourse(event);
  renderOnline();
}

async function syncOnlineClock(session) {
  let best = Infinity;
  for (let i=0;i<3;i++) {
    const before = performance.now();
    const {now} = await onlineRequest((session.origin ?? '')+'/online/time');
    const after = performance.now(), rtt = after-before;
    if (rtt<best) {
      best = rtt;
      session.serverOffset = now-(before+after)/2;
    }
  }
  session.clockReady = true;
  renderOnline();
}

function receiveOnlineRoom(session,state) {
  if (onlineRoom!==session) return;
  if(state.protocol!==tuning190.protocol) {
    leaveOnline();
    showOnlineMessage('联机版本不匹配，请更新到支持协议 v3 的版本。');
    return;
  }
  const previous = session.state;
  session.state = state;
  const players = new Set(state.players.map(player=>player.id));
  for (const [id,peer] of session.peers) {
    if (players.has(id)) continue;
    session.peers.delete(id);
    peer.pc.close();
  }
  for (const player of state.players) {
    if (player.id!==session.id && !session.peers.has(player.id)) addOnlinePeer(session,player.id,session.id<player.id);
  }
  setActiveWeather(state.weather ?? 'day');
  if (state.phase!=='race') {
    const targetVeh = onlineVehicleForSession(session);
    if (race.rider.vehicle!==targetVeh) race.setVehicle(targetVeh);
  }
  refreshBicycleModels();
  const nextRouteKey = onlineRouteKey(state.route);
  if (session.course && nextRouteKey && nextRouteKey !== session.routeKey) {
    session.course = null;
    session.startedRound = 0;
    void setOnlineCourse(session).catch(error=>showOnlineMessage(error.message));
  }
  if (state.phase==='tuning' && previous.phase!=='tuning') {
    showOnlineMessage('');
    if (session.course && !settingsOpen && ui.onlineDialog.open && !state.players.find(p=>p.id===session.id)?.ready) {
      ui.onlineDialog.close();
      openSettings('bike');
    }
  }
  if (state.phase==='race' && (previous.phase!=='race'||previous.round?.number!==state.round.number)) {
    showOnlineMessage('');
    if (settingsOpen) closeSettings();
    ui.onlineDialog.close();
  }
  if ((state.phase==='between'||state.phase==='done') && previous.phase!==state.phase) {
    if (race.phase==='race'||race.phase==='count') race.abandon();
    if (settingsOpen) closeSettings();
    showOnlineDialog();
    if (state.phase==='between' && previous.phase==='race' && state.format==='random' && session.id===state.host) {
      const campus = state.route?.campus ?? activeCampus;
      let nextCourse;
      if (campus==='shunde') {
        const list = coursesByCampus.shunde;
        nextCourse = list[Math.floor(Math.random()*list.length)];
      } else {
        const randCode = `${campus==='ucl'?'U':'S'}${seedVersion}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
        nextCourse = makeSeedCourse(randCode,campus);
        seedCourses[campus] = nextCourse;
      }
      void onlineCommand(session,{action:'config',route:{campus:nextCourse.campus,id:nextCourse.id,seed:nextCourse.seed??null,layout:ghostCourseKey(nextCourse)}}).catch(error=>showOnlineMessage(error.message));
    }
  }
  renderOnline();
}

function subscribeOnline(session) {
  const events = new EventSource(session.url+'/events?id='+session.id+'&token='+session.token);
  session.events = events;
  events.onopen = ()=>{if(onlineRoom===session){showOnlineMessage('');renderOnline();}};
  events.onerror = ()=>{
    if (onlineRoom!==session) return;
    if (events.readyState===EventSource.CLOSED) {
      leaveOnline(false);
      showOnlineDialog();
      showOnlineMessage('房间连接已关闭，请重新进房。');
    } else showOnlineMessage('正在重新连接房间服务…');
  };
  events.addEventListener('room',event=>receiveOnlineRoom(session,JSON.parse(event.data)));
  events.addEventListener('signal',event=>{
    if (onlineRoom===session) handleOnlineSignal(session,JSON.parse(event.data));
  });
}

async function joinOnline(code) {
  if (onlineBusy || onlineRoom || !window.RTCPeerConnection) return;
  const creatingLocal = !code && onlineAppMode;
  let origin = '', ownedHost = false, initialAddresses = [];
  if (!creatingLocal) {
    try {
      origin = normalizeOnlineHost(ui.onlineHostInput.value);
      if (!origin && (onlineAppMode || !onlineSite())) {
        throw new Error(code?'请输入房主 IP 地址。':'请通过「启动游戏.bat」打开游戏后再创建房间，或输入房主 IP 加入。');
      }
    } catch (error) {
      showOnlineMessage(error.message);
      return;
    }
    if (origin) saveOnlineHost(ui.onlineHostInput.value);
  }
  onlineBusy = true;
  showOnlineMessage(creatingLocal?'正在开启房间…':'正在连接房间…');
  renderOnline();
  let session;
  try {
    if (creatingLocal) {
      const started = await onlineRequest('/app/host/start',{});
      origin = started.localOrigin;
      ownedHost = true;
      initialAddresses = Array.isArray(started.addresses) ? started.addresses : [];
    }
    const event = race.event;
    const entry = {...onlineProfilePayload(),protocol:tuning190.protocol};
    let routeEvent = event;
    if (!code && ui.onlineFormat.value==='random') {
      if (event.campus==='shunde') {
        const list = coursesByCampus.shunde;
        routeEvent = list[Math.floor(Math.random()*list.length)];
      } else {
        const randCode = `${event.campus==='ucl'?'U':'S'}${seedVersion}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
        routeEvent = makeSeedCourse(randCode,event.campus);
        seedCourses[event.campus] = routeEvent;
      }
    }
    const details = code ? {code} : {
      format:ui.onlineFormat.value,
      vehicleRule:ui.onlineFormat.value==='triathlon'?'bike':ui.onlineVehicleRule.value,
      weather:ui.onlineWeather.value,
      budget:ui.onlineBudget.value,blind:ui.onlineBlind.value==='on',windMode:ui.onlineWindMode.value,
      windSpeed:Math.round(Math.max(0,Math.min(15,Number(ui.onlineWindSpeed?.value??0)||0))*10)/10,
      windDir:Math.max(0,Math.min(7,Math.round(Number(ui.onlineWindDir?.value??0)||0))),
      tuningSeconds:Math.max(0,Math.min(180,Math.round(Number(ui.onlineTuningTime?.value??30)||0))),
      collision:ui.onlineCollision?.value==='on',
      route:{campus:routeEvent.campus,id:routeEvent.id,seed:routeEvent.seed??null,layout:ghostCourseKey(routeEvent)},
    };
    const {id,token,room,iceServers} = await onlineRequest(origin+ONLINE_API,{...entry,...details});
    onlineRoom = session = {id,token,origin,ownedHost,state:room,iceServers,url:origin+ONLINE_API+'/'+room.code,peers:new Map(),
      hostAddresses:initialAddresses,originalVehicle:race.vehicle,originalBike:race.bike,routeKey:onlineRouteKey(room.route)};
    subscribeOnline(session);
    if (!ownedHost) void loadOnlineHostInfo(session);
    await Promise.all([setOnlineCourse(session),syncOnlineClock(session)]);
    showOnlineMessage('');
  } catch (error) {
    if (session && onlineRoom===session) leaveOnline();
    else if (ownedHost) void stopAppHost();
    showOnlineMessage(error.message);
  } finally {
    onlineBusy = false;
    renderOnline();
  }
}

function leaveOnline(notify=true) {
  const session = onlineRoom;
  if (!session) return;
  onlineRoom = null;
  const cleanup = notify ? onlineCommand(session,{action:'leave'},true).catch(()=>{}) : Promise.resolve();
  if (session.ownedHost) void cleanup.finally(()=>stopAppHost(true));
  session.events?.close();
  for (const peer of session.peers.values()) peer.pc.close();
  if (pendingCampus?.online) {
    pendingCampus.online.reject(new Error('已退出房间。'));
    pendingCampus = null;
  }
  race.online = false;
  race.bike = session.originalBike;
  race.vehicle = session.originalVehicle;
  race.abandon();
  refreshBicycleModels();
  setActiveWeather(race.event?.environment?.weather ?? preferences.weather);
  clearInput();
  priorTimestamp = undefined;
  rebuildCourseHud();
  updateHud();
  showOnlineMessage(session.ownedHost?'已关闭房间。':'已退出房间。');
  renderOnline();
}

async function onlineLobbyCommand(body) {
  if (!onlineRoom||onlineBusy) return;
  onlineBusy = true;
  const session = onlineRoom;
  showOnlineMessage('');
  renderOnline();
  try {
    if (body.ready) await syncOnlineClock(session);
    await onlineCommand(session,body);
  } catch (error) { showOnlineMessage(error.message); }
  finally { onlineBusy = false; renderOnline(); }
}

async function hostUpdateOnlineConfig(changes) {
  const session = onlineRoom;
  if (!session || session.id!==session.state.host || session.state.phase==='race') return;
  await onlineLobbyCommand({action:'config',...changes});
}

async function hostSelectOnlineCourse(campus,courseId,randomSeed=false) {
  const session = onlineRoom;
  if (!session || session.id!==session.state.host || session.state.phase==='race') return;
  let event;
  if (randomSeed) {
    const code = `${campus==='ucl'?'U':'S'}${seedVersion}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
    event = makeSeedCourse(code,campus);
    seedCourses[campus] = event;
  } else {
    event = availableCourses(campus).find(c=>c.id===courseId) ?? coursesByCampus[campus][0];
  }
  await hostUpdateOnlineConfig({
    route:{campus:event.campus,id:event.id,seed:event.seed??null,layout:ghostCourseKey(event)},
  });
}

function tickOnline(now) {
  const session = onlineRoom;
  if (session&&now>=(session.nextProbeAt??0)) {
    session.nextProbeAt = now+ONLINE_PROBE_INTERVAL;
    for (const peer of session.peers.values()) probeOnlinePeer(peer,now);
    updateOnlineLatency(session,now);
  }
  if (session?.state.phase==='tuning') updateOnlineTuningBanner(session,now);
  if (!session?.course||!session.clockReady||session.state.phase!=='race') return;
  const {round} = session.state;
  const countdownAt = round.goAt-session.serverOffset-COUNTDOWN_TICKS*STEP_MS;
  if (now<countdownAt) return;
  if (session.startedRound!==round.number) {
    if (settingsOpen) closeSettings();
    ui.onlineDialog.close();
    session.startedRound = round.number;
    session.sequence = session.epoch = 0;
    session.lastRejoin = -Infinity;
    session.nextPose = 0;
    session.reported = false;
    session.retired = false;
    beginTrial();
    priorTimestamp = countdownAt;
  }
  if (session.retired) return;
  if (now-(priorTimestamp??now)>3500 && (race.phase==='count'||race.phase==='race')) {
    session.retired = true;
    race.abandon();
    void onlineCommand(session,{action:'retire',round:round.number}).catch(error=>showOnlineMessage(error.message));
    showOnlineDialog();
    showOnlineMessage('页面暂停太久，本轮计为未完赛。');
    return;
  }
  if (race.phase==='count'||race.phase==='race') sendOnlinePose(session,now);
  if (race.phase==='done'&&!session.reported) {
    session.reported = true;
    const ms = Math.round(race.elapsed);
    void onlineCommand(session,{action:'finish',round:round.number,ms}).catch(error=>{
      if (onlineRoom!==session || session.state.phase!=='race'||session.state.round.number!==round.number) return;
      showOnlineMessage(error.message);
      setTimeout(()=>{if(session.state.round.number===round.number) session.reported=false;},2500);
    });
  }
}

function initOnline() {
  const params = new URLSearchParams(location.hash.slice(1));
  const invite = params.get('room');
  const host = params.get('host');
  if (/^[A-Z2-9]{8}$/.test(invite??'')) ui.onlineCodeInput.value = invite;
  if (host) ui.onlineHostInput.value = host;
  else if (!onlineSite()) ui.onlineHostInput.value = loadOnlineHost();
  ui.onlineHostInput.addEventListener('input',renderOnline);
  ui.onlineFormat.addEventListener('change',renderOnline);
  ui.onlineButton.addEventListener('click',showOnlineDialog);
  ui.onlineClose.addEventListener('click',()=>ui.onlineDialog.close());
  ui.onlineDialog.addEventListener('close',()=>{clearInput();if(!onlineRoom) priorTimestamp=undefined;focusStage();});
  ui.onlineCreate.addEventListener('click',()=>void joinOnline());
  ui.onlineJoinForm.addEventListener('submit',event=>{
    event.preventDefault();
    const code = ui.onlineCodeInput.value.trim().toUpperCase();
    if (!/^[A-Z2-9]{8}$/.test(code)) { showOnlineMessage('请输入 8 位房间码。'); return; }
    void joinOnline(code);
  });
  ui.onlineLobbyCampus.addEventListener('change',()=>{
    const campus = ui.onlineLobbyCampus.value;
    void hostSelectOnlineCourse(campus,coursesByCampus[campus][0].id,false);
  });
  ui.onlineLobbyCourse.addEventListener('change',()=>{
    void hostSelectOnlineCourse(ui.onlineLobbyCampus.value,ui.onlineLobbyCourse.value,false);
  });
  ui.onlineLobbySeed.addEventListener('click',()=>{
    void hostSelectOnlineCourse(ui.onlineLobbyCampus.value,null,true);
  });
  ui.onlineLobbyVehicle.addEventListener('change',()=>{
    void hostUpdateOnlineConfig({vehicleRule:ui.onlineLobbyVehicle.value});
  });
  ui.onlineLobbyWeather.addEventListener('change',()=>{
    void hostUpdateOnlineConfig({weather:ui.onlineLobbyWeather.value});
  });
  ui.onlineLobbyBudget.addEventListener('change',()=>void hostUpdateOnlineConfig({budget:ui.onlineLobbyBudget.value}));
  ui.onlineLobbyBlind.addEventListener('change',()=>void hostUpdateOnlineConfig({blind:ui.onlineLobbyBlind.value==='on'}));
  ui.onlineLobbyWindMode.addEventListener('change',()=>void hostUpdateOnlineConfig({windMode:ui.onlineLobbyWindMode.value}));
  ui.onlineLobbyTuning?.addEventListener('change',()=>{
    const clamped = Math.max(0,Math.min(180,Math.round(Number(ui.onlineLobbyTuning.value)||0)));
    ui.onlineLobbyTuning.value = String(clamped);
    void hostUpdateOnlineConfig({tuningSeconds:clamped});
  });
  ui.onlineLobbyCollision?.addEventListener('change',()=>{
    void hostUpdateOnlineConfig({collision:ui.onlineLobbyCollision.value==='on'});
  });
  ui.onlineLobbyWindSpeed?.addEventListener('change',()=>{
    const w = Math.round(Math.max(0,Math.min(15,Number(ui.onlineLobbyWindSpeed.value)||0))*10)/10;
    ui.onlineLobbyWindSpeed.value = String(w);
    void hostUpdateOnlineConfig({windSpeed:w});
  });
  ui.onlineLobbyWindDir?.addEventListener('change',()=>{
    const d = Math.max(0,Math.min(7,Math.round(Number(ui.onlineLobbyWindDir.value)||0)));
    ui.onlineLobbyWindDir.value = String(d);
    void hostUpdateOnlineConfig({windDir:d});
  });
  ui.onlineGarage.addEventListener('click',async()=>{
    if (!onlineRoom || onlineRoom.state.phase==='race') return;
    const self = onlineRoom.state.players.find(p=>p.id===onlineRoom.id);
    if (onlineRoom.state.phase==='tuning' && self?.ready) await onlineLobbyCommand({action:'ready',ready:false});
    ui.onlineDialog.close();
    openSettings('bike');
  });
  ui.onlineInvite.addEventListener('click',async()=>{
    const href = onlineInviteLink(onlineRoom);
    const copied = await copyOnlineText(href);
    showOnlineMessage(copied?'邀请链接已复制：'+href:'邀请链接 '+href);
  });
  ui.onlineReady.addEventListener('click',()=>void onlineLobbyCommand({action:'ready',
    ready:!onlineRoom.state.players.find(player=>player.id===onlineRoom.id)?.ready}));
  ui.onlineStart.addEventListener('click',()=>void onlineLobbyCommand({
    action:onlineRoom?.state.phase==='tuning'?'skipTuning':'start'}));
  ui.settingsTuneReady?.addEventListener('click',async()=>{
    const session = onlineRoom;
    if (!session || session.state.phase!=='tuning' || onlineBusy) return;
    const self = session.state.players.find(p=>p.id===session.id);
    const nextReady = !self?.ready;
    if (nextReady) {
      await onlineCommand(session,{action:'profile',...onlineProfilePayload()}).catch(()=>{});
      const {over,illegal}=workshopBudget(race);
      if(over||(illegal&&session.state.budget!=='party')) {
        if(over) highlightBudgetParts();
        return;
      }
      closeSettings();
    }
    await onlineLobbyCommand({action:'ready',ready:nextReady});
  });
  ui.settingsTuneSkip?.addEventListener('click',()=>void onlineLobbyCommand({action:'skipTuning'}));
  ui.onlineLeave.addEventListener('click',()=>leaveOnline());
  window.addEventListener('pagehide',()=>{
    if (onlineRoom) {
      void onlineCommand(onlineRoom,{action:'leave'},true).catch(()=>{});
      if (onlineRoom.ownedHost) void stopAppHost(true);
    }
    void flushLocalSave(true);
    onlineKeepalive?.close();
  });
  setTimeout(()=>void initOnlineApp(),0);
}
