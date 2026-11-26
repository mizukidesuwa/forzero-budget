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
  const rider = race.rider;
  if (race.lastRejoin!==session.lastRejoin) {
    session.lastRejoin = race.lastRejoin;
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
    riders.push({id,name:info?.name??'',paint:knownPaint(info?.paint),vehicle,...pose});
  }
  return riders;
}

function onlineDraftingAt(rider,now) {
  if (!onlineRoom || race.phase!=='race' || rider.vehicle!=='bike' || !rider.paved || rider.speed<5.5) return false;
  const poses = onlineRiderPoses(now);
  if (!poses.length) return false;
  const fx = Math.cos(rider.heading), fz = Math.sin(rider.heading);
  for (const other of poses) {
    if (other.speed < 4.5) continue;
    const dx = other.position[0] - rider.position[0], dz = other.position[2] - rider.position[2];
    const ahead = dx * fx + dz * fz;
    if (ahead < 2.0 || ahead > 12.0) continue;
    const lateral = Math.abs(-dx * fz + dz * fx);
    if (lateral > 1.35) continue;
    const align = fx * Math.cos(other.heading) + fz * Math.sin(other.heading);
    if (align > 0.90) return true;
  }
  return false;
}

function onlineRaceRank(now) {
  const session = onlineRoom;
  if (!session || session.state.phase!=='race' || !session.course) return null;
  const finished = new Map((session.state.round?.results ?? []).map(r=>[r.id,r.ms]));
  const total = session.state.players.length;
  const progressOf = (id,pos,travel,isSelf) => {
    const ms = finished.get(id);
    if (ms !== undefined && ms !== null) return 1e9 - ms;
    if (ms === null) return -1e6;
    if (isSelf) return race.progressEstimate;
    return pointDistance(session.course.path, pos);
  };
  const selfProg = progressOf(session.id, race.rider.position, race.rider.travel, true);
  const rows = [{id:session.id, name:driverProfile.name, prog:selfProg}];
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
