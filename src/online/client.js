import { COUNTDOWN_TICKS, STEP_MS } from '../core/clock.js';
import { add, clamp, mix } from '../core/math.js';
import { getActiveCampus, getPreferences, worldState } from '../core/state.js';
import { seedVersion } from '../race/seed-code.js';
import { knownWeather, setActiveWeather, weatherChoices } from '../render/atmosphere.js';
import { ghostCourseKey } from '../replay/ghost.js';
import { workshopBudget } from '../ride/budget.js';
import { tuning190 } from '../ride/tuning-rules.js';
import {
  bicycleStyle, brakeChoices, buildBike, buildVehicleTuning, frameChoices, gearChoices, knownPaint, knownVehicle, sprintChoices,
  tyreChoices, vehicleChoices, vehicleTuningChoices,
} from '../ride/vehicles.js';
import { knownSkinId, skinForProfile, skinSpecHash } from '../ride/rider-skin.js';
import { WIND_LABELS, knownWindMode } from '../world/environment.js';
import { pointDistance } from '../world/geometry.js';
import { coursesByCampus } from '../world/scene-builder.js';
import { availableCourses, makeNetworkCourse, makeSeedCourse, networkForCampus } from '../world/seed-courses.js';
import { resolveRouteRef, routeRefForCourse } from '../world/route-resolver.js';
import { knownTraffic } from '../world/traffic.js';
import { flushLocalSave, hydrateLocalSave } from '../ui/save-sync.js';
import { courseTitle, message, translate } from '../ui/language.js';
import { onlineNoticeLabel } from '../ui/presentation-text.js';
import { nearestCourierLandmark } from '../race/courier.js';
import {
  evaluateOnlineChasePeers, isOnlineChaseRoom, onlineChaseNextHunterId, onlineChaseSnapshot,
} from '../race/online-chase.js';

let app = {
  setText: (el, text) => { if (el && el.textContent !== text) el.textContent = text; },
  clearInput: () => {},
  focusStage: () => {},
  openSettings: () => {},
  closeSettings: () => {},
  isSettingsOpen: () => false,
  getPriorTimestamp: () => undefined,
  setPriorTimestamp: () => {},
  isReady: () => false,
  populateCoursePicker: () => {},
  selectCourse: () => {},
  beginTrial: () => {},
  beginOnlineChaseRound: () => {},
  rebuildCourseHud: () => {},
  updateHud: () => {},
  highlightBudgetParts: () => {},
  timeLabel: (ms) => String(ms),
};

export function bindOnlineApp(callbacks) {
  app = { ...app, ...callbacks };
}

const ONLINE_POSE_BYTES = 32;
const ONLINE_POSE_INTERVAL = 1000/15;
const ONLINE_INTERPOLATION = 125;
const ONLINE_PROBE_INTERVAL = 1000;
const ONLINE_PROBE_TIMEOUT = 2500;
const ONLINE_PROBE_BYTES = 5;
const ONLINE_PING = 1;
const ONLINE_PONG = 2;
const ONLINE_CHANNEL = 'ride-v'+tuning190.protocol;

function probeOnlinePeer(peer,now) {
  if (peer.channel?.readyState!=='open'||peer.pc.connectionState!=='connected'||peer.channel.bufferedAmount>4096) return;
  if (peer.probe && now-peer.probe.sentAt<ONLINE_PROBE_TIMEOUT) return;
  peer.probeSerial = ((peer.probeSerial??0)+1)>>>0;
  const packet = new ArrayBuffer(ONLINE_PROBE_BYTES), view = new DataView(packet);
  view.setUint8(0,ONLINE_PING);
  view.setUint32(1,peer.probeSerial);
  if (sendOnlineProbe(peer,packet)) peer.probe = {serial:peer.probeSerial,sentAt:now};
}

function sendOnlineProbe(peer,packet) {
  if (peer.channel?.readyState!=='open'||peer.channel.bufferedAmount>4096) return false;
  try { peer.channel.send(packet);return true; }
  catch { return false; }
}

function receiveOnlineProbe(peer,packet) {
  if (!(packet instanceof ArrayBuffer)||packet.byteLength!==ONLINE_PROBE_BYTES) return false;
  const view = new DataView(packet), type = view.getUint8(0), serial = view.getUint32(1);
  if (type===ONLINE_PING) {
    view.setUint8(0,ONLINE_PONG);
    sendOnlineProbe(peer,packet);
  } else if (type===ONLINE_PONG&&peer.probe?.serial===serial) {
    const at = performance.now(), ms = at-peer.probe.sentAt;
    peer.probe = null;
    if (ms<=ONLINE_PROBE_TIMEOUT) peer.latency = {ms,at};
  }
  return true;
}

function onlinePeerLatency(peer,now) {
  if (peer?.pc.connectionState!=='connected'||peer.channel?.readyState!=='open'||!peer.latency||
      now-peer.latency.at>ONLINE_PROBE_TIMEOUT+ONLINE_PROBE_INTERVAL) return null;
  return Math.round(peer.latency.ms);
}

function addOnlinePeer(session,id,offer) {
  const pc = new RTCPeerConnection({iceServers:session.iceServers});
  const peer = {pc,channel:null,signals:Promise.resolve(),ice:[],samples:[]};
  session.peers.set(id,peer);

  function useChannel(channel) {
    if(channel.label!==ONLINE_CHANNEL) {
      channel.close();
      showOnlineMessage('骑手版本不一致，请更新到支持协议 v3 的版本。');
      return;
    }
    peer.channel = channel;
    channel.binaryType = 'arraybuffer';
    channel.onopen = renderOnline;
    channel.onclose = renderOnline;
    channel.onmessage = ({data})=>{
      if (!receiveOnlineProbe(peer,data)) receiveOnlinePose(session,peer,data);
    };
  }

  pc.ondatachannel = event=>useChannel(event.channel);
  pc.onicecandidate = ({candidate})=>{
    if (candidate) void sendOnlineSignal(session,id,{type:'candidate',ice:candidate.toJSON()});
  };
  pc.onconnectionstatechange = ()=>{
    renderOnline();
    if (pc.connectionState==='failed' && session.id<id && !peer.restarted) {
      peer.restarted = true;
      queuePeerSignal(session,peer,()=>offerOnlinePeer(session,id,peer,true));
    }
  };
  if (offer) {
    useChannel(pc.createDataChannel(ONLINE_CHANNEL,{ordered:false,maxRetransmits:0}));
    queuePeerSignal(session,peer,()=>offerOnlinePeer(session,id,peer));
  }
  return peer;
}

function queuePeerSignal(session,peer,action) {
  peer.signals = peer.signals.then(()=>{
    if (onlineRoom===session && peer.pc.signalingState!=='closed') return action();
  }).catch(()=>{
    if (onlineRoom===session && peer.pc.signalingState!=='closed') {
      showOnlineMessage('与一位骑手的连接遇到问题。可重新进房，或切换网络后重试。');
    }
  });
}

async function offerOnlinePeer(session,id,peer,restart=false) {
  const {pc} = peer;
  const offer = await pc.createOffer({iceRestart:restart});
  await pc.setLocalDescription(offer);
  await sendOnlineSignal(session,id,pc.localDescription.toJSON());
}

async function sendOnlineSignal(session,id,data) {
  if (onlineRoom!==session) return;
  try { await onlineCommand(session,{action:'signal',to:id,data}); }
  catch {
    if (onlineRoom===session && session.peers.has(id)) showOnlineMessage('信令发送失败，可重新进房重试。');
  }
}

function handleOnlineSignal(session,{from,data}) {
  const peer = session.peers.get(from)??addOnlinePeer(session,from,false);
  queuePeerSignal(session,peer,async()=>{
    const {pc} = peer;
    if (data.type==='candidate') {
      if (pc.remoteDescription) {
        try { await pc.addIceCandidate(data.ice); }
        catch { if (peer.ice.length<32) peer.ice.push(data.ice); }
      } else if (peer.ice.length<32) peer.ice.push(data.ice);
      return;
    }
    await pc.setRemoteDescription({type:data.type,sdp:data.sdp});
    for (const candidate of peer.ice.splice(0)) await pc.addIceCandidate(candidate).catch(()=>{});
    if (data.type==='offer') {
      await pc.setLocalDescription(await pc.createAnswer());
      await sendOnlineSignal(session,from,pc.localDescription.toJSON());
    }
  });
}

function sendOnlinePose(session,now) {
  if (session.nextPose>now) return;
  session.nextPose = now+ONLINE_POSE_INTERVAL;
  const rider = worldState.race.rider;
  if (worldState.race.lastRejoin!==session.lastRejoin) {
    session.lastRejoin = worldState.race.lastRejoin;
    session.epoch++;
  }
  const packet = new ArrayBuffer(ONLINE_POSE_BYTES);
  const view = new DataView(packet);
  view.setUint16(0,session.startedRound);
  view.setUint16(2,++session.sequence);
  view.setUint16(4,session.epoch);
  view.setInt16(6,Math.round(clamp(rider.steering,-1,1)*32767));
  const pose = [...rider.position,rider.heading,rider.speed,rider.travel];
  for (const [index,value] of pose.entries()) view.setFloat32(8+index*4,value);
  for (const peer of session.peers.values()) {
    const channel = peer.channel;
    if (channel?.readyState==='open' && channel.bufferedAmount<4096) channel.send(packet);
  }
}

function receiveOnlinePose(session,peer,packet) {
  if (onlineRoom!==session || session.state.phase!=='race' || !(packet instanceof ArrayBuffer) || packet.byteLength!==ONLINE_POSE_BYTES) return;
  const view = new DataView(packet);
  const round = view.getUint16(0), sequence = view.getUint16(2), epoch = view.getUint16(4);
  if (round!==session.state.round.number) return;
  const last = peer.samples.at(-1);
  if (last?.round===round && sequence<=last.sequence) return;
  const pose = Array.from({length:6},(_,index)=>view.getFloat32(8+index*4));
  if (pose.some(value=>!Number.isFinite(value)) || pose.slice(0,3).some(value=>Math.abs(value)>2500) ||
      Math.abs(pose[3])>Math.PI+.01 || Math.abs(pose[4])>30 || Math.abs(pose[5])>50_000) return;
  if (last?.round!==round || last.epoch!==epoch) peer.samples.length = 0;
  const [x,y,z,heading,speed,travel] = pose;
  peer.samples.push({round,sequence,epoch,at:performance.now(),position:[x,y,z],heading,speed,travel,steering:view.getInt16(6)/32767});
  if (peer.samples.length>12) peer.samples.shift();
  return true;
}

function onlineRiderPoses(now) {
  const session = onlineRoom;
  if (!session?.startedRound || session.state.phase!=='race') return [];
  const target = now-ONLINE_INTERPOLATION;
  const riders = [];
  for (const [id,peer] of session.peers) {
    const {samples} = peer, last = samples.at(-1);
    if (last?.round!==session.startedRound || now-last.at>2000) continue;
    let pose = samples[0];
    if (target>=last.at) {
      const dt = Math.min(.16,(target-last.at)/1000);
      pose = {...last,position:add(last.position,[Math.cos(last.heading)*last.speed*dt,0,Math.sin(last.heading)*last.speed*dt]),
        travel:last.travel+last.speed*dt};
    } else if (target>pose.at) {
      const next = samples.findIndex(sample=>sample.at>=target);
      const a = samples[next-1], b = samples[next];
      const fraction = (target-a.at)/(b.at-a.at);
      const turn = Math.atan2(Math.sin(b.heading-a.heading),Math.cos(b.heading-a.heading));
      pose = {position:a.position.map((value,i)=>mix(value,b.position[i],fraction)),heading:a.heading+turn*fraction,
        speed:mix(a.speed,b.speed,fraction),travel:mix(a.travel,b.travel,fraction),steering:mix(a.steering,b.steering,fraction)};
    }
    const info = session.state.players.find(player=>player.id===id);
    const rule = session.state.vehicleRule ?? 'bike';
    const vehicle = rule==='any' ? knownVehicle(info?.vehicle) : knownVehicle(rule);
    const remoteProfile = { skinId: info?.skinId, skinVersion: Number(info?.skinVersion) || 1, skinSpec: info?.skinSpec };
    const remoteSkin = skinForProfile(remoteProfile);
    // Derive the cache key from the validated model received in the profile.
    // A stale or malformed advertised hash must never select an old rig.
    riders.push({id,name:info?.name??'',paint:knownPaint(info?.paint),vehicle,
      ...remoteProfile, skin: remoteSkin, skinSpecHash: skinSpecHash(remoteSkin), ...pose});
  }
  return riders;
}

function onlineRaceRank(now) {
  const session = onlineRoom;
  if (!session || session.state.phase!=='race' || !session.course || isOnlineChaseRoom(session)) return null;
  const finished = new Map((session.state.round?.results ?? []).map(r=>[r.id,r.ms]));
  const total = session.state.players.length;
  const progressOf = (id,pos,travel,isSelf) => {
    const ms = finished.get(id);
    if (ms !== undefined && ms !== null) return 1e9 - ms;
    if (ms === null) return -1e6;
    if (isSelf) return worldState.race.progressEstimate;
    return pointDistance(session.course.path, pos);
  };
  const selfProg = progressOf(session.id, worldState.race.rider.position, worldState.race.rider.travel, true);
  const rows = [{id:session.id, name:worldState.driverProfile.name, prog:selfProg}];
  for (const remote of onlineRiderPoses(now)) {
    rows.push({id:remote.id, name:remote.name, prog:progressOf(remote.id, remote.position, remote.travel, false)});
  }
  for (const player of session.state.players) {
    if (!rows.some(r=>r.id===player.id)) rows.push({id:player.id, name:player.name, prog:finished.has(player.id)?progressOf(player.id,[0,0,0],0,false):-1});
  }
  rows.sort((a,b)=>b.prog-a.prog);
  const rank = rows.findIndex(r=>r.id===session.id) + 1;
  const leader = rows[0];
  const gapMeters = rank > 1 && leader.prog < 1e8 && selfProg >= 0 ? Math.max(1, Math.round(leader.prog - selfProg)) : 0;
  return {rank, total, gapMeters, leaderName: leader?.name ?? ''};
}

const ONLINE_FORMAT = {bo1:'BO1',bo3:'BO3',league:'积分联赛',random:'盲盒随机',triathlon:'四项全能',chase:'联机捉人'};
const ONLINE_VEHICLE_RULE = {bike:'统一自行车',trail:'统一越野小摩托',ebike:'统一电动自行车',chair:'统一电动轮椅',any:'自由混选'};
const ONLINE_API = '/online/rooms';
const ONLINE_HOST_KEY = 'szu-litchi-online-host-1';
let onlineRoom = worldState.onlineRoom = null;
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
    if (!worldState.ui.onlineHostInput.value.trim()) worldState.ui.onlineHostInput.value = loadOnlineHost();
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
  const {tyres,gears,brakes,frame,sprint} = worldState.race.bike;
  const activeVeh = onlineRoom ? onlineVehicleForSession(onlineRoom) : worldState.driverProfile.vehicle;
  return {
    name:worldState.driverProfile.name,paint:worldState.driverProfile.paint,vehicle:worldState.driverProfile.vehicle,look:bicycleStyle(worldState.driverProfile.look),
    skinId:knownSkinId(worldState.driverProfile.skinId),skinVersion:Number(worldState.driverProfile.skinVersion)||1,
    skinSpec:worldState.driverProfile.skinSpec ?? null,
    skinSpecHash:worldState.driverProfile.skinSpecHash ?? skinSpecHash(worldState.driverProfile.skinSpec),
    bike:{tyres,gears,brakes,frame,sprint},
    tuning:worldState.vehicleTunings[activeVeh] ?? worldState.vehicleTunings[worldState.driverProfile.vehicle] ?? {},
    tunings:worldState.vehicleTunings,
  };
}

function onlineRoundBuild() {
  const build=onlineRoom?.state.round?.builds?.[onlineRoom.id];
  if(onlineRoom?.state.phase!=='race'||!build) return null;
  const {vehicle,parts}=build;
  return {vehicle,illegal:tuning190.summarize(vehicle,parts).illegal,
    bike:vehicle==='bike'?buildBike(parts.tyres,parts.gears,parts.brakes,parts.frame,parts.sprint):worldState.race.bike,
    tuning:vehicle==='bike'?null:buildVehicleTuning(vehicle,parts)};
}

function roomBudgetLabel(state) {
  const limit=state.tuning?.budget??state.round?.budget??tuning190.budgetLimit(state.budget);
  if(limit!==null) return state.blind?message`盲盒 预算 ¥${limit}`:message`预算 ¥${limit}`;
  return translate(state.blind?'每轮抽取预算':state.budget==='party'?'娱乐房 · 允许违禁件':'不限预算');
}

function onlineRouteKey(route) {
  return route ? (route.code ?? `${route.campus}:${route.id}:${route.seed??''}:${route.layout}`) : '';
}

function onlineRoutePayload(event) {
  const ref = routeRefForCourse(event, {
    direction: event.variant?.direction ?? 'forward',
    laps: event.variant?.laps ?? 1,
    layoutOf: ghostCourseKey,
  });
  return ref ? {
    campus: event.campus, id: event.id, seed: event.seed ?? null, layout: ref.route.layout,
    code: ref.code, variant: ref.route.variant,
    ...(ref.route.networkRevision ? { networkRevision: ref.route.networkRevision, edges: ref.route.edges } : {}),
  } : {
    campus: event.campus, id: event.id, seed: event.seed ?? null, layout: ghostCourseKey(event),
    variant: event.variant ?? { direction: 'forward', laps: 1 },
  };
}

function onlineVehicleForSession(session) {
  const rule = session?.state.vehicleRule ?? 'bike';
  return rule==='any' ? knownVehicle(worldState.driverProfile.vehicle) : knownVehicle(rule);
}

function syncOnlineProfile() {
  const session = onlineRoom;
  if (!session || session.state.phase==='race') return;
  session.originalBike = worldState.race.bike;
  const targetVehicle = onlineVehicleForSession(session);
  if (worldState.race.rider.vehicle!==targetVehicle) worldState.race.setVehicle(targetVehicle);
  void onlineCommand(session,{action:'profile',...onlineProfilePayload()}).catch(()=>{});
  renderOnline();
}

function showOnlineMessage(message) {
  onlineNotice = message;
  app.setText(worldState.ui.onlineStatus,onlineNoticeLabel(message));
}

function onlineRequest(url,body,token,keepalive=false) {
  let resolved;
  try { resolved = new URL(url, location.href); }
  catch { return Promise.reject(new Error('无法连接联机服务。')); }
  if (location.protocol==='https:' && resolved.protocol==='http:') {
    return Promise.reject(new Error('当前为 HTTPS 网页，浏览器会拦截明文 HTTP 房主地址。请改用桌面版「启动游戏.bat」或由房主提供 HTTPS 联机地址。'));
  }
  const options = {cache:'no-store',signal:AbortSignal.timeout(8000)};
  if (body) Object.assign(options,{method:'POST',keepalive,body:JSON.stringify(body),headers:{
    'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})
  }});
  return fetch(resolved.href,options).catch(error=>{
    if (error?.name==='TimeoutError'||error?.name==='AbortError') {
      throw new Error('连接联机服务超时，请检查房主是否在线、防火墙放行或代理设置。');
    }
    const isLocal = ['127.0.0.1','localhost','[::1]'].includes(resolved.hostname);
    throw new Error(isLocal
      ? '无法连接本机联机服务。请通过「启动游戏.bat」重启游戏，并检查代理是否绕过 127.0.0.1 或防火墙是否放行。'
      : '无法连接房主地址，请确认房主已开房、IP/端口正确，且未被防火墙或代理拦截。');
  }).then(async response=>{
    const result = await response.json().catch(()=>null);
    if (!response.ok || !result) {
      if (result?.error) throw new Error(result.error);
      if (resolved.origin===location.origin && !onlineAppMode && onlineSite() &&
          (response.status===404||response.status===405||!result)) {
        throw new Error('当前在线网页为静态站点，无法直接开房。请下载桌面版并通过「启动游戏.bat」建房，或填入 HTTPS 房主地址加入。');
      }
      throw new Error('无法连接联机服务。');
    }
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
  worldState.ui.onlineLatency.hidden = !session;
  if (!session) return;
  const measured = [];
  for (const label of worldState.ui.onlinePlayers.querySelectorAll('[data-latency-peer]')) {
    const id = label.dataset.latencyPeer;
    const ms = onlinePeerLatency(session.peers.get(id),now);
    if (ms!==null) measured.push(ms);
    app.setText(label,ms===null?'延迟 —':message`延迟 ${ms} ms`);
  }
  app.setText(worldState.ui.onlineLatency,measured.length?message`延迟 ${Math.max(...measured)} ms`:'延迟 —');
  worldState.ui.onlineLatency.title = translate('本机与已测量骑手之间的最高往返延迟');
}

function onlineStandings(state) {
  worldState.ui.onlineRounds.replaceChildren();
  worldState.ui.onlineStanding.replaceChildren();
  const rows = [...state.history];
  if (state.phase==='race') rows.push(state.round);
  const names = new Map([...state.standing,...state.players].map(({id,name})=>[id,name]));
  for (const round of rows) {
    const line = document.createElement('li');
    let summary;
    if (state.format==='chase' && round.chase) {
      const caughtCount = Object.keys(round.chase.caught ?? {}).length;
      summary = round.results.map(item => {
        const who = names.get(item.id) ?? translate('已退出骑手');
        if (item.role==='hunter' || item.id===round.chase.hunterId) {
          return `${who} (${translate('捉人')}) ${round.chase.settledReason==='sweep'&&caughtCount?app.timeLabel(item.ms):translate('未能全捉')}`;
        }
        if (item.retired) return `${who} ${translate('已退场')}`;
        if (item.survived) return `${who} ${translate('逃脱')}`;
        if (item.caughtAt!==undefined && item.caughtAt!==null) return `${who} ${translate('被捕')} ${app.timeLabel(item.caughtAt)}`;
        return `${who} ${translate('逃跑中')}`;
      }).join(' / ');
    } else {
      const results = [...round.results].sort((a,b)=>(a.ms??Infinity)-(b.ms??Infinity));
      summary = results.map(({id,ms})=>
        (names.get(id)??translate('已退出骑手'))+' '+(ms===null?translate('未完赛'):app.timeLabel(ms))).join(' / ');
    }
    line.textContent = message`第 ${round.number} 轮 · ${summary || translate('骑行中')}`;
    worldState.ui.onlineRounds.append(line);
  }
  for (const player of state.standing) {
    const row = document.createElement('li');
    const name = state.winners.includes(player.id)?message`冠军 · ${player.name}`:player.name;
    row.textContent = message`${name} · ${player.wins} 胜 · ${player.points} 分`;
    worldState.ui.onlineStanding.append(row);
  }
  worldState.ui.onlineRounds.hidden = !rows.length;
  worldState.ui.onlineStanding.hidden = !state.standing.length;
}

function playerGearSummary(player,rule) {
  const vehicle = rule==='any' ? knownVehicle(player.vehicle) : knownVehicle(rule);
  if (vehicle!=='bike') {
    const slots = vehicleTuningChoices[vehicle];
    const parts = player.tuning;
    const vehicleLabel = translate(vehicleChoices[vehicle].name);
    if (!slots || !parts) return vehicleLabel;
    const labels = slots.map(s=>s.options[parts[s.key]]?.name).filter(Boolean).map(translate);
    return labels.length ? vehicleLabel+' · '+labels.join('/') : vehicleLabel;
  }
  const b = player.bike;
  if (!b) return translate('标准自行车');
  const tags = [tyreChoices[b.tyres]?.name??'均衡胎',gearChoices[b.gears]?.name??'标准齿比',brakeChoices[b.brakes]?.name??'均衡刹车'];
  if (b.frame && b.frame!=='stock' && frameChoices[b.frame]) tags.push(frameChoices[b.frame].name);
  if (b.sprint && b.sprint!=='stock' && sprintChoices[b.sprint]) tags.push(sprintChoices[b.sprint].name);
  return tags.map(translate).join('/');
}

function populateOnlineLobbyCourses(campus,currentId) {
  worldState.ui.onlineLobbyCourse.replaceChildren();
  for (const event of availableCourses(campus)) {
    const opt = document.createElement('option');
    opt.value = event.id;
    opt.textContent = courseTitle(event);
    worldState.ui.onlineLobbyCourse.append(opt);
  }
  if (currentId && Array.from(worldState.ui.onlineLobbyCourse.options).some(o=>o.value===currentId)) {
    worldState.ui.onlineLobbyCourse.value = currentId;
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
  const clock = rem===null?translate('等待合规配车'):message`改车倒计时 ${rem}s`;
  const warning = problem?' · '+onlineNoticeLabel(problem.reason):'';
  const label = tuning ? message`${roomBudgetLabel(session.state)} · ${clock} · 已完成 ${readyCount}/${onlineCount}${warning}` : '';
  if (worldState.ui.onlineTuningBanner) {
    worldState.ui.onlineTuningBanner.hidden = !tuning;
    if (tuning) app.setText(worldState.ui.onlineTuningBanner,label+translate(self?.ready?'（你已确认改装，等待他人或发车）':' · 可点「车库改装」调整配装'));
  }
  if (worldState.ui.settingsTuneBar) {
    worldState.ui.settingsTuneBar.hidden = !tuning;
    if (tuning) {
      app.setText(worldState.ui.settingsTuneText,label);
      app.setText(worldState.ui.settingsTuneReady,self?.ready?'继续改装':'完成改装');
      worldState.ui.settingsTuneReady.disabled = onlineBusy;
      worldState.ui.settingsTuneSkip.hidden = !isHost;
      worldState.ui.settingsTuneSkip.disabled = onlineBusy;
    }
  }
}

function renderOnline() {
  const session = onlineRoom;
  if (onlineNotice) app.setText(worldState.ui.onlineStatus,onlineNoticeLabel(onlineNotice));
  worldState.ui.onlineLobby.hidden = !session;
  worldState.ui.onlineSetup.hidden = Boolean(session);
  const hasHost = Boolean(worldState.ui.onlineHostInput.value.trim());
  const isStaticPages = location.hostname.endsWith('.github.io');
  const canCreate = onlineAppMode || (onlineSite() && !isStaticPages);
  const canJoin = hasHost || (onlineSite() && !onlineAppMode && !isStaticPages);
  worldState.ui.onlineCreate.disabled = onlineBusy||!canCreate||!window.RTCPeerConnection;
  worldState.ui.onlineCreate.title = !canCreate
    ? translate(isStaticPages
      ? '当前在线网页为静态站点，无法直接开房。请下载桌面版并通过「启动游戏.bat」建房，或填入 HTTPS 房主地址加入。'
      : '离线网页模式无法在本机建房。请下载内置 Node.js 的 Windows 完整版并通过「启动游戏.bat」打开（或安装 Node.js 22+）。')
    : '';
  worldState.ui.onlineJoin.disabled = onlineBusy||!canJoin||!window.RTCPeerConnection;
  worldState.ui.onlineHostInput.disabled = onlineBusy;
  worldState.ui.onlineLeave.disabled = onlineBusy;
  if (!session) {
    worldState.ui.onlineHostHint.hidden = true;
    worldState.ui.onlineHostControls.hidden = true;
    if (worldState.ui.onlineFormat.value === 'triathlon') {
      worldState.ui.onlineVehicleRule.value = 'bike';
      worldState.ui.onlineVehicleRule.disabled = true;
    } else {
      worldState.ui.onlineVehicleRule.disabled = onlineBusy;
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
  app.setText(worldState.ui.onlineTitle,translate(ONLINE_FORMAT[state.format])+' · '+(session.course?courseTitle(session.course):translate('载入赛道'))+' · '+translate(weatherChoices[weather].name));
  app.setText(worldState.ui.onlineCode,state.code);
  const activeVeh = onlineVehicleForSession(session);
  const {tyres,gears,brakes} = worldState.race.bike;
  const wSpd = state.windSpeed ?? 0;
  const wLabel = wSpd > 0 ? `${translate(WIND_LABELS[state.windDir??0]||'风')} ${Number(wSpd).toFixed(1)}m/s` : translate('无风');
  const traffic = translate({off:'关闭',sparse:'稀疏',standard:'标准'}[knownTraffic(state.traffic)]);
  const collision = translate(state.collision?'开':'关');
  const ruleTags = message`车流 ${traffic} · 碰撞箱：${collision} · 改车 ${state.tuningSeconds??0}s · ${wLabel} · ${roomBudgetLabel(state)}`;
  if (state.format==='triathlon') {
    const rotation = state.vehicleRotation ?? ['bike', 'chair', 'trail'];
    const total = state.roundsTotal ?? rotation.length;
    const step = Math.min(total, state.history.length + (state.phase === 'done' ? 0 : 1));
    const names = rotation.map(vehicle => translate(ONLINE_VEHICLE_RULE[vehicle])).join(' → ');
    app.setText(worldState.ui.onlineBike,message`${translate(ONLINE_FORMAT[state.format])} 第 ${Math.max(1, step)}/${total} 轮（${translate(vehicleChoices[activeVeh].name)}）· ${names} · ${ruleTags}`);
  } else {
    const build = activeVeh==='bike'?[tyreChoices[tyres].name,gearChoices[gears].name,brakeChoices[brakes].name].map(translate).join(' / '):
      translate(vehicleChoices[activeVeh].name);
    app.setText(worldState.ui.onlineBike,message`${translate(ONLINE_VEHICLE_RULE[rule])} · 我的配置：${build} · ${ruleTags}`);
  }
  let hostHint = '';
  if ((session.ownedHost || !session.origin) && session.hostAddresses?.length) {
    const addresses = session.hostAddresses.slice(0,3).map(item=>message`${item.address}:${item.port}（${translate(item.label)}）`).join(' / ');
    hostHint = message`房主地址 · ${addresses}`;
  } else if (session.origin) {
    hostHint = message`已连主机 · ${session.origin.replace(/^https?:\/\//,'')}`;
  }
  worldState.ui.onlineHostHint.hidden = !hostHint;
  app.setText(worldState.ui.onlineHostHint,hostHint);

  const canConfig = isHost && state.phase!=='race' && !tuning;
  worldState.ui.onlineHostControls.hidden = !canConfig;
  if (canConfig) {
    const routeCampus = state.route?.campus ?? getActiveCampus();
    if (worldState.ui.onlineLobbyCampus.value !== routeCampus) worldState.ui.onlineLobbyCampus.value = routeCampus;
    populateOnlineLobbyCourses(routeCampus, state.route?.id);
    worldState.ui.onlineLobbyVehicle.value = rule;
    worldState.ui.onlineLobbyWeather.value = weather;
    worldState.ui.onlineLobbyBudget.value = tuning190.normalizeBudget(state.budget);
    worldState.ui.onlineLobbyWindMode.value = knownWindMode(state.windMode);
    worldState.ui.onlineLobbyBlind.value = state.blind?'on':'off';
    worldState.ui.onlineLobbyBudget.disabled=worldState.ui.onlineLobbyWindMode.disabled=worldState.ui.onlineLobbyBlind.disabled=onlineBusy;
    if (worldState.ui.onlineLobbyTuning) worldState.ui.onlineLobbyTuning.value = String(state.tuningSeconds ?? 0);
    worldState.ui.onlineLobbyTraffic.value=knownTraffic(state.traffic);
  worldState.ui.onlineLobbyTraffic.disabled=onlineBusy;
  if (worldState.ui.onlineLobbyCollision) worldState.ui.onlineLobbyCollision.value = state.collision ? 'on' : 'off';
    if (worldState.ui.onlineLobbyWindSpeed) worldState.ui.onlineLobbyWindSpeed.value = String(state.windSpeed ?? 0);
    if (worldState.ui.onlineLobbyWindDir) worldState.ui.onlineLobbyWindDir.value = String(state.windDir ?? 0);
    worldState.ui.onlineLobbyCampus.disabled = worldState.ui.onlineLobbyCourse.disabled = worldState.ui.onlineLobbyWeather.disabled = onlineBusy;
    if (worldState.ui.onlineLobbySeed) {
      worldState.ui.onlineLobbySeed.hidden = routeCampus==='shunde';
      worldState.ui.onlineLobbySeed.disabled = onlineBusy || routeCampus==='shunde';
    }
    if (worldState.ui.onlineLobbyTuning) worldState.ui.onlineLobbyTuning.disabled = onlineBusy;
    if (worldState.ui.onlineLobbyCollision) worldState.ui.onlineLobbyCollision.disabled = onlineBusy;
    if (worldState.ui.onlineLobbyWindSpeed) worldState.ui.onlineLobbyWindSpeed.disabled = onlineBusy;
    if (worldState.ui.onlineLobbyWindDir) worldState.ui.onlineLobbyWindDir.disabled = onlineBusy;
    worldState.ui.onlineLobbyVehicle.disabled = onlineBusy || state.format==='triathlon';
  }

  const nextHunterId = state.format==='chase' ? onlineChaseNextHunterId(state) : null;
  const roster = state.players.map(player=>{
    const row = document.createElement('li');
    const peer = session.peers.get(player.id);
    const connected = player===self||(peer?.pc.connectionState==='connected'&&peer.channel?.readyState==='open');
    const readyLabel = !player.online?'重连中':!connected?'建连中':
      tuning?(player.ready?'改装完成':'改装中'):
      (player.ready&&waiting?'已准备':'已连接');
    const chaseRoleLabel = nextHunterId ? (player.id===nextHunterId?'捉人者':'逃跑者') : '';
    row.textContent = [player.name+(player===self?translate('（你）'):''),player.id===state.host?translate('房主'):'',
      chaseRoleLabel?translate(chaseRoleLabel):'',
      translate(readyLabel),playerGearSummary(player,rule)].filter(Boolean).join(' · ');
    if (player!==self) {
      const label = document.createElement('span');
      label.className = 'online-peer-latency';
      label.dataset.latencyPeer = player.id;
      row.append(label);
    }
    return row;
  });
  worldState.ui.onlinePlayers.replaceChildren(...roster);
  updateOnlineLatency(session,performance.now());
  worldState.ui.onlineReady.hidden = !(waiting||tuning);
  worldState.ui.onlineReady.disabled = onlineBusy||!session.course||!session.clockReady||
    (waiting && !self?.ready && (state.players.length<2||linked!==state.players.length-1));
  app.setText(worldState.ui.onlineReady,tuning?(self?.ready?'继续改装':'完成改装'):(self?.ready?'取消准备':'准备'));
  worldState.ui.onlineStart.hidden = !(waiting||tuning)||!isHost;
  app.setText(worldState.ui.onlineStart,tuning?'立即发车':'发车');
  worldState.ui.onlineStart.disabled = onlineBusy||(waiting&&(state.players.length<2||!state.players.every(player=>player.online&&player.ready)||linked!==state.players.length-1));
  worldState.ui.onlineGarage.hidden = state.phase==='race';
  worldState.ui.onlineGarage.disabled = onlineBusy || (waiting && Boolean(self?.ready));
  worldState.ui.onlineInvite.hidden = state.phase!=='lobby';
  onlineStandings(state);
  updateOnlineTuningBanner(session,performance.now());
  if (onlineNotice) return;
  const guidance = !session.course?'正在载入房间赛道…':!session.clockReady?'正在同步发车时钟…':state.phase==='done'?
    (state.winners.length?'比赛结束。房主可切换赛道开始下一局。':'比赛结束，暂无完赛骑手。'):
    tuning?'改装倒计时中：可进入车库调校配装，全员完成后自动发车。':
    state.phase==='race'?'本轮进行中。':state.players.length<2?'复制邀请链接或把房主地址发给好友。':
    linked!==state.players.length-1?'正在建立骑手间连接…':'准备前可点「车库改装」调整配装。';
  app.setText(worldState.ui.onlineStatus,guidance);
}

function showOnlineDialog() {
  if (!app.isReady() || app.isSettingsOpen() || worldState.ui.seedDialog.open || worldState.ui.friendDialog.open || worldState.ui.onlineDialog.open) return;
  if (!onlineRoom && (worldState.hooks.getPendingCampus?.() || worldState.race.phase==='race'||worldState.race.phase==='count')) return;
  app.clearInput();
  if (!onlineRoom) {
    app.setPriorTimestamp(undefined);
    worldState.ui.onlineWeather.value = knownWeather(getPreferences().weather);
    worldState.ui.onlineWindMode.value = knownWindMode(getPreferences().windMode);
    if (worldState.ui.onlineWindSpeed) worldState.ui.onlineWindSpeed.value = String(getPreferences().windSpeed ?? 0);
    if (worldState.ui.onlineWindDir) worldState.ui.onlineWindDir.value = String(getPreferences().windDir ?? 0);
  }
  showOnlineMessage('');
  if (!window.RTCPeerConnection) showOnlineMessage('这个浏览器无法建立 WebRTC 连接。');
  else if (!onlineRoom&&!onlineAppMode&&!onlineSite()) {
    showOnlineMessage('当前为离线网页模式，无法在本机建房。请通过「启动游戏.bat」打开游戏（Windows 完整版已内置 Node.js，或自备 Node.js 22+）；若要加入好友，请填入房主 IP 和房间码。');
  } else if (!onlineRoom&&!onlineAppMode&&location.hostname.endsWith('.github.io')) {
    showOnlineMessage('当前在线网页为静态站点，无法直接开房。请下载桌面版并通过「启动游戏.bat」建房，或填入 HTTPS 房主地址加入。');
  }
  renderOnline();
  worldState.ui.onlineDialog.showModal();
}

function findOnlineCourse(route) {
  const resolved = resolveRouteRef(route, {
    coursesByCampus, makeSeedCourse, networkFor: networkForCampus, makeNetworkCourse,
    layoutOf: ghostCourseKey,
  });
  if (!resolved || (route.id && resolved.event.id !== route.id) || (route.layout && ghostCourseKey(resolved.event) !== route.layout)) {
    throw new Error('房间赛道与本机版本不一致。');
  }
  return resolved.event;
}

async function setOnlineCourse(session) {
  const route = session.state.route;
  const routeKey = onlineRouteKey(route);
  const event = route.campus===getActiveCampus() ? findOnlineCourse(route) : await new Promise((resolve,reject)=>{
    worldState.hooks.setPendingCampus?.({destination:route.campus,at:performance.now()+30,online:{route,resolve,reject}});
  });
  if (onlineRoom!==session) return;
  session.course = event;
  session.routeKey = routeKey;
  worldState.race.online = true;
  worldState.race.practice = null;
  worldState.race.bike = session.originalBike;
  worldState.race.opponent = null;
  worldState.race.setVehicle(onlineVehicleForSession(session));
  setActiveWeather(session.state.weather ?? 'day');
  if (event.seed) worldState.seedCourses[event.campus] = event;
  app.populateCoursePicker();
  app.selectCourse(event);
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
    if (worldState.race.rider.vehicle!==targetVeh) worldState.race.setVehicle(targetVeh);
  }
  worldState.hooks.refreshBicycleModels?.();
  const nextRouteKey = onlineRouteKey(state.route);
  if (session.course && nextRouteKey && nextRouteKey !== session.routeKey) {
    session.course = null;
    session.startedRound = 0;
    void setOnlineCourse(session).catch(error=>showOnlineMessage(error.message));
  }
  if (state.phase==='tuning' && previous.phase!=='tuning') {
    showOnlineMessage('');
    if (session.course && !app.isSettingsOpen() && worldState.ui.onlineDialog.open && !state.players.find(p=>p.id===session.id)?.ready) {
      worldState.ui.onlineDialog.close();
      app.openSettings('bike');
    }
  }
  if (state.phase==='race' && (previous.phase!=='race'||previous.round?.number!==state.round.number)) {
    showOnlineMessage('');
    if (app.isSettingsOpen()) app.closeSettings();
    worldState.ui.onlineDialog.close();
  }
  if ((state.phase==='between'||state.phase==='done') && previous.phase!==state.phase) {
    if (worldState.race.phase==='race'||worldState.race.phase==='count') worldState.race.abandon();
    if (app.isSettingsOpen()) app.closeSettings();
    showOnlineDialog();
    if (state.phase==='between' && previous.phase==='race' && state.format==='random' && session.id===state.host) {
      const campus = state.route?.campus ?? getActiveCampus();
      let nextCourse;
      if (campus==='shunde') {
        const list = coursesByCampus.shunde;
        nextCourse = list[Math.floor(Math.random()*list.length)];
      } else {
        const randCode = `${campus==='ucl'?'U':'S'}${seedVersion}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
        nextCourse = makeSeedCourse(randCode,campus);
        worldState.seedCourses[campus] = nextCourse;
      }
      void onlineCommand(session,{action:'config',route:onlineRoutePayload(nextCourse)}).catch(error=>showOnlineMessage(error.message));
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
      origin = normalizeOnlineHost(worldState.ui.onlineHostInput.value);
      if (!origin && (onlineAppMode || !onlineSite())) {
        throw new Error(code?'请输入房主 IP 地址。':'请通过「启动游戏.bat」打开游戏后再创建房间，或输入房主 IP 加入。');
      }
    } catch (error) {
      showOnlineMessage(error.message);
      return;
    }
    if (origin) saveOnlineHost(worldState.ui.onlineHostInput.value);
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
    const event = worldState.race.event;
    const entry = {...onlineProfilePayload(),protocol:tuning190.protocol};
    let routeEvent = event;
    if (!code && worldState.ui.onlineFormat.value==='random') {
      if (event.campus==='shunde') {
        const list = coursesByCampus.shunde;
        routeEvent = list[Math.floor(Math.random()*list.length)];
      } else {
        const randCode = `${event.campus==='ucl'?'U':'S'}${seedVersion}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
        routeEvent = makeSeedCourse(randCode,event.campus);
        worldState.seedCourses[event.campus] = routeEvent;
      }
    }
    const details = code ? {code} : {
      format:worldState.ui.onlineFormat.value,
      vehicleRule:worldState.ui.onlineFormat.value==='triathlon'?'bike':worldState.ui.onlineVehicleRule.value,
      weather:worldState.ui.onlineWeather.value,
      budget:worldState.ui.onlineBudget.value,blind:worldState.ui.onlineBlind.value==='on',windMode:worldState.ui.onlineWindMode.value,
      windSpeed:Math.round(Math.max(0,Math.min(15,Number(worldState.ui.onlineWindSpeed?.value??0)||0))*10)/10,
      windDir:Math.max(0,Math.min(7,Math.round(Number(worldState.ui.onlineWindDir?.value??0)||0))),
      tuningSeconds:Math.max(0,Math.min(180,Math.round(Number(worldState.ui.onlineTuningTime?.value??30)||0))),
      collision:worldState.ui.onlineCollision?.value==='on',traffic:worldState.ui.onlineTraffic.value,
      route:onlineRoutePayload(routeEvent),
    };
    const {id,token,room,iceServers} = await onlineRequest(origin+ONLINE_API,{...entry,...details});
    onlineRoom = worldState.onlineRoom = session = {id,token,origin,ownedHost,state:room,iceServers,url:origin+ONLINE_API+'/'+room.code,peers:new Map(),
      hostAddresses:initialAddresses,originalVehicle:worldState.race.vehicle,originalBike:worldState.race.bike,routeKey:onlineRouteKey(room.route)};
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
  onlineRoom = worldState.onlineRoom = null;
  const cleanup = notify ? onlineCommand(session,{action:'leave'},true).catch(()=>{}) : Promise.resolve();
  if (session.ownedHost) void cleanup.finally(()=>stopAppHost(true));
  session.events?.close();
  for (const peer of session.peers.values()) peer.pc.close();
  if (worldState.hooks.getPendingCampus?.()?.online) {
    worldState.hooks.getPendingCampus?.().online.reject(new Error('已退出房间。'));
    worldState.hooks.setPendingCampus?.(null);
  }
  worldState.race.online = false;
  worldState.race.bike = session.originalBike;
  worldState.race.vehicle = session.originalVehicle;
  worldState.race.abandon();
  worldState.hooks.refreshBicycleModels?.();
  setActiveWeather(worldState.race.event?.environment?.weather ?? getPreferences().weather);
  app.clearInput();
  app.setPriorTimestamp(undefined);
  app.rebuildCourseHud();
  app.updateHud();
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
    worldState.seedCourses[campus] = event;
  } else {
    event = availableCourses(campus).find(c=>c.id===courseId) ?? coursesByCampus[campus][0];
  }
  await hostUpdateOnlineConfig({
    route:onlineRoutePayload(event),
  });
}

function getOnlineChaseSnapshot(now = performance.now()) {
  const session = onlineRoom;
  return session && isOnlineChaseRoom(session) && session.state.phase==='race'
    ? onlineChaseSnapshot(session, now)
    : null;
}

function getOnlineChaseView(now = performance.now()) {
  const session = onlineRoom;
  if (!session || !isOnlineChaseRoom(session) || session.state.phase!=='race' || !worldState.race?.rider) return null;
  if (!session.chasePingCache) session.chasePingCache = { lastAt: -Infinity, byId: new Map() };
  return evaluateOnlineChasePeers(session, worldState.race.rider.position, onlineRiderPoses(now), now, {
    landmarkAt: nearestCourierLandmark,
    pingCache: session.chasePingCache,
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
    if (app.isSettingsOpen()) app.closeSettings();
    worldState.ui.onlineDialog.close();
    session.startedRound = round.number;
    session.sequence = session.epoch = 0;
    session.lastRejoin = -Infinity;
    session.nextPose = 0;
    session.reported = false;
    session.retired = false;
    session.tagSent = new Set();
    session.chasePingCache = { lastAt: -Infinity, byId: new Map() };
    if (isOnlineChaseRoom(session)) app.beginOnlineChaseRound();
    else app.beginTrial();
    app.setPriorTimestamp(countdownAt);
  }
  if (session.retired) return;
  if (now-(app.getPriorTimestamp()??now)>3500 && (worldState.race.phase==='count'||worldState.race.phase==='race'||isOnlineChaseRoom(session))) {
    session.retired = true;
    worldState.race.abandon();
    void onlineCommand(session,{action:'retire',round:round.number}).catch(error=>showOnlineMessage(error.message));
    showOnlineDialog();
    showOnlineMessage('页面暂停太久，本轮计为未完赛。');
    return;
  }
  if (worldState.race.phase==='count'||worldState.race.phase==='race'||isOnlineChaseRoom(session)) sendOnlinePose(session,now);
  if (isOnlineChaseRoom(session)) {
    const view = getOnlineChaseView(now);
    const snap = view?.snap;
    if (snap?.role==='hunter' && snap.phase==='race' && !snap.hunterLocked && view?.catchCandidate) {
      const cand = view.catchCandidate;
      if (!session.tagSent?.has(cand.id)) {
        session.tagSent ??= new Set();
        session.tagSent.add(cand.id);
        worldState.hooks.playSound?.('finish');
        void onlineCommand(session,{
          action:'tag', round:round.number, targetId:cand.id, ms:Math.max(1,Math.round(snap.elapsedMs)),
        }).catch(() => { session.tagSent?.delete(cand.id); });
      }
    }
    return;
  }
  if (worldState.race.phase==='done'&&!session.reported) {
    session.reported = true;
    const ms = Math.round(worldState.race.elapsed);
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
  if (/^[A-Z2-9]{8}$/.test(invite??'')) worldState.ui.onlineCodeInput.value = invite;
  if (host) worldState.ui.onlineHostInput.value = host;
  else if (!onlineSite()) worldState.ui.onlineHostInput.value = loadOnlineHost();
  worldState.ui.onlineHostInput.addEventListener('input',renderOnline);
  worldState.ui.onlineFormat.addEventListener('change',renderOnline);
  worldState.ui.onlineButton.addEventListener('click',showOnlineDialog);
  worldState.ui.onlineClose.addEventListener('click',()=>worldState.ui.onlineDialog.close());
  worldState.ui.onlineDialog.addEventListener('close',()=>{app.clearInput();if(!onlineRoom) app.setPriorTimestamp(undefined);app.focusStage();});
  worldState.ui.onlineCreate.addEventListener('click',()=>void joinOnline());
  worldState.ui.onlineJoinForm.addEventListener('submit',event=>{
    event.preventDefault();
    const code = worldState.ui.onlineCodeInput.value.trim().toUpperCase();
    if (!/^[A-Z2-9]{8}$/.test(code)) { showOnlineMessage('请输入 8 位房间码。'); return; }
    void joinOnline(code);
  });
  worldState.ui.onlineLobbyCampus.addEventListener('change',()=>{
    const campus = worldState.ui.onlineLobbyCampus.value;
    void hostSelectOnlineCourse(campus,coursesByCampus[campus][0].id,false);
  });
  worldState.ui.onlineLobbyCourse.addEventListener('change',()=>{
    void hostSelectOnlineCourse(worldState.ui.onlineLobbyCampus.value,worldState.ui.onlineLobbyCourse.value,false);
  });
  worldState.ui.onlineLobbySeed.addEventListener('click',()=>{
    void hostSelectOnlineCourse(worldState.ui.onlineLobbyCampus.value,null,true);
  });
  worldState.ui.onlineLobbyVehicle.addEventListener('change',()=>{
    void hostUpdateOnlineConfig({vehicleRule:worldState.ui.onlineLobbyVehicle.value});
  });
  worldState.ui.onlineLobbyWeather.addEventListener('change',()=>{
    void hostUpdateOnlineConfig({weather:worldState.ui.onlineLobbyWeather.value});
  });
  worldState.ui.onlineLobbyBudget.addEventListener('change',()=>void hostUpdateOnlineConfig({budget:worldState.ui.onlineLobbyBudget.value}));
  worldState.ui.onlineLobbyBlind.addEventListener('change',()=>void hostUpdateOnlineConfig({blind:worldState.ui.onlineLobbyBlind.value==='on'}));
  worldState.ui.onlineLobbyWindMode.addEventListener('change',()=>void hostUpdateOnlineConfig({windMode:worldState.ui.onlineLobbyWindMode.value}));
  worldState.ui.onlineLobbyTuning?.addEventListener('change',()=>{
    const clamped = Math.max(0,Math.min(180,Math.round(Number(worldState.ui.onlineLobbyTuning.value)||0)));
    worldState.ui.onlineLobbyTuning.value = String(clamped);
    void hostUpdateOnlineConfig({tuningSeconds:clamped});
  });
  worldState.ui.onlineLobbyTraffic.addEventListener('change',()=>{
    void hostUpdateOnlineConfig({traffic:knownTraffic(worldState.ui.onlineLobbyTraffic.value)});
  });
  worldState.ui.onlineLobbyCollision?.addEventListener('change',()=>{
    void hostUpdateOnlineConfig({collision:worldState.ui.onlineLobbyCollision.value==='on'});
  });
  worldState.ui.onlineLobbyWindSpeed?.addEventListener('change',()=>{
    const w = Math.round(Math.max(0,Math.min(15,Number(worldState.ui.onlineLobbyWindSpeed.value)||0))*10)/10;
    worldState.ui.onlineLobbyWindSpeed.value = String(w);
    void hostUpdateOnlineConfig({windSpeed:w});
  });
  worldState.ui.onlineLobbyWindDir?.addEventListener('change',()=>{
    const d = Math.max(0,Math.min(7,Math.round(Number(worldState.ui.onlineLobbyWindDir.value)||0)));
    worldState.ui.onlineLobbyWindDir.value = String(d);
    void hostUpdateOnlineConfig({windDir:d});
  });
  worldState.ui.onlineGarage.addEventListener('click',async()=>{
    if (!onlineRoom || onlineRoom.state.phase==='race') return;
    const self = onlineRoom.state.players.find(p=>p.id===onlineRoom.id);
    if (onlineRoom.state.phase==='tuning' && self?.ready) await onlineLobbyCommand({action:'ready',ready:false});
    worldState.ui.onlineDialog.close();
    app.openSettings('bike');
  });
  worldState.ui.onlineInvite.addEventListener('click',async()=>{
    const href = onlineInviteLink(onlineRoom);
    const copied = await copyOnlineText(href);
    showOnlineMessage(copied?'邀请链接已复制：'+href:'邀请链接 '+href);
  });
  worldState.ui.onlineReady.addEventListener('click',()=>void onlineLobbyCommand({action:'ready',
    ready:!onlineRoom.state.players.find(player=>player.id===onlineRoom.id)?.ready}));
  worldState.ui.onlineStart.addEventListener('click',()=>void onlineLobbyCommand({
    action:onlineRoom?.state.phase==='tuning'?'skipTuning':'start'}));
  worldState.ui.settingsTuneReady?.addEventListener('click',async()=>{
    const session = onlineRoom;
    if (!session || session.state.phase!=='tuning' || onlineBusy) return;
    const self = session.state.players.find(p=>p.id===session.id);
    const nextReady = !self?.ready;
    if (nextReady) {
      await onlineCommand(session,{action:'profile',...onlineProfilePayload()}).catch(()=>{});
      const {over,illegal}=workshopBudget(worldState.race);
      if(over||(illegal&&session.state.budget!=='party')) {
        if(over) app.highlightBudgetParts();
        return;
      }
      app.closeSettings();
    }
    await onlineLobbyCommand({action:'ready',ready:nextReady});
  });
  worldState.ui.settingsTuneSkip?.addEventListener('click',()=>void onlineLobbyCommand({action:'skipTuning'}));
  worldState.ui.onlineLeave.addEventListener('click',()=>leaveOnline());
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

export function getOnlineRoom() {
  return onlineRoom;
}

export function getOnlineBusy() {
  return onlineBusy;
}

export function getOnlineNotice() {
  return onlineNotice;
}

export function getOnlineAppMode() {
  return onlineAppMode;
}

worldState.hooks.onlineRiderPoses = onlineRiderPoses;
worldState.hooks.onlineRoundBuild = onlineRoundBuild;

export {
  onlineRiderPoses, onlineRaceRank, onlineRoundBuild, syncOnlineProfile,
  showOnlineDialog, findOnlineCourse, setOnlineCourse, leaveOnline, tickOnline, initOnline,
  renderOnline, updateOnlineTuningBanner, getOnlineChaseSnapshot, getOnlineChaseView,
};
