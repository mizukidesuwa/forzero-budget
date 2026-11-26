function knownTraffic(mode) {
  return mode==='off'||mode==='standard'?mode:'sparse';
}

function trafficSeedFor(event, round) {
  if(round) return round.trafficSeed??(event.id+':'+round.goAt);
  if(/^[SU]\d-W\d{8}$/.test(event.seed??'')) return event.seed;
  return String(Math.floor(Math.random()*0x100000000));
}

function trafficPosition(actor,time) {
  const {path,start,speed,direction,offset}=actor;
  const distance=((start+direction*speed*time)%path.length+path.length)%path.length;
  const frame=courseFrame(path,distance);
  return {frame,point:offsetVertex(frame,offset,.042)};
}

function makeTrafficFormation(actors, mode, seed, spawn=null, countdown=3) {
  if(mode==='off') return [];
  let hash=2166136261;
  for(const ch of String(seed)) hash=Math.imul(hash^ch.charCodeAt(0),16777619);
  const random=randomSource(hash>>>0);
  const groups=new Map(), lineup=[];
  for(const actor of actors) {
    if(!groups.has(actor.path)) groups.set(actor.path,[]);
    groups.get(actor.path).push(actor);
  }
  for(const [path,pool] of groups) {
    const park=path===parkPath;
    const cap=park?(mode==='standard'?5:3):(mode==='standard'?7:4);
    const count=Math.min(cap,pool.length);
    const speedByDirection={1:pool[0].speed*(.86+random()*.25),'-1':pool[0].speed*(.86+random()*.25)};
    const placed=[];
    const firstDirection=random()<.5?-1:1;
    for(let i=0;i<count;i++) {
      const pair=i%3===1&&(mode==='standard'||random()<.38);
      const leader=pair?placed.at(-1):null;
      const direction=leader?.direction??(i%2?-firstDirection:firstDirection);
      const available=pool.filter(actor=>actor.direction===direction);
      if(!available.length) continue;
      const pick=available[Math.floor(random()*available.length)];
      const speed=speedByDirection[direction];
      for(let tries=0;tries<30;tries++) {
        const ahead=leader&&tries===0?leader.start+direction*(park?29:22):random()*path.length;
        const start=(ahead+path.length)%path.length;
        const actor={...pick,direction,start,speed};
        if(placed.some(other=>{
          if(direction!==other.direction) return false;
          const gap=Math.abs(start-other.start);
          return Math.min(gap,path.length-gap)<(park?27:20);
        })) continue;
        if(spawn) {
          let blocked=false;
          for(let t=-countdown;t<=2;t+=.25) {
            const {point}=trafficPosition(actor,t);
            if(Math.hypot(point[0]-spawn[0],point[2]-spawn[2])<28+speed*.125) {blocked=true;break;}
          }
          if(blocked) continue;
        }
        placed.push(actor);
        break;
      }
    }
    lineup.push(...placed);
  }
  return lineup;
}

function trialTraffic(trial) {
  const session=typeof onlineRoom==='undefined'?null:onlineRoom;
  const mode=knownTraffic(session?session.state.traffic:typeof preferences==='undefined'?undefined:preferences.traffic);
  if(trial.phase!=='free'&&trial.raceTraffic) return trial.raceTraffic;
  const cache=trial.freeTraffic;
  if(cache?.mode===mode&&cache.campus===activeCampus&&cache.revision===trafficSceneRevision) return cache;
  return trial.freeTraffic={mode,campus:activeCampus,revision:trafficSceneRevision,
    vehicles:makeTrafficFormation(cityVehicles,mode,'free:'+activeCampus)};
}

function stageRaceTraffic(trial) {
  const session=typeof onlineRoom==='undefined'?null:onlineRoom;
  const mode=knownTraffic(session?session.state.traffic:typeof preferences==='undefined'?undefined:preferences.traffic);
  const seed=trafficSeedFor(trial.event,session?.state.round);
  trial.trafficElapsed=0;
  trial.raceTraffic={mode,seed,vehicles:makeTrafficFormation(cityVehicles,mode,seed,trial.rider.position,trial.countdown)};
}

function raceTrafficTime(trial) {
  if(trial.phase==='count') return -trial.countdown;
  return trial.phase==='free'?trial.freeClock:trial.trafficElapsed??0;
}
let trafficSceneRevision=0;
