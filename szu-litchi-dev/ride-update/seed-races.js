const seedVersion=2;
const seedNetworks={szu:shenzhenSeedRoads,ucl:londonSeedRoads};
const loadedSeedNetworks=new Map();
const seedCourses={szu:null,ucl:null};

// Construct the Monday from local calendar fields. UTC arithmetic here avoids
// subtracting a 24-hour interval across a daylight-saving transition.
function weeklySeed(campus, now=new Date()) {
  const monday=new Date(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()));
  monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);
  return readSeedCode('W'+monday.toISOString().slice(0,10).replaceAll('-',''),campus);
}

function readSeedCode(value,campus) {
  const code=value.trim().toUpperCase();
  const parts=/^(?:([SU])(\d)-)?([A-Z0-9]{1,12})$/.exec(code);
  if(!parts) return null;
  const [,region,version,token]=parts;
  const prefix=campus==='ucl'?'U':'S';
  if(region&&(region!==prefix||Number(version)!==seedVersion)) return null;
  return prefix+seedVersion+'-'+token;
}

function seedRandom(code) {
  let seed=2166136261;
  for(const symbol of code) seed=Math.imul(seed^symbol.charCodeAt(0),16777619);
  return randomSource(seed);
}

function viableSeedTrack(path,network) {
  if(path.length<network.minimum||path.length>network.maximum) return false;
  const access=Boolean(network.cityAccess);
  const clear=(x,z)=>safeToRide(x,z,access)&&surfaceAt(x,z,access);
  const start=courseFrame(path,0),finish=courseFrame(path,path.length);
  for(const [frame,offset] of [[start,-5.2],[start,-2.6],[finish,.8]]) {
    const [x,,z]=add(frame.p,scale(frame.f,offset));
    if(!clear(x,z)) return false;
  }
  const occupied=new Map();
  for(let distance=0;distance<path.length;distance+=2.4) {
    const frame=courseFrame(path,distance),[x,,z]=frame.p;
    const grade=activeCampus==='szu'?Math.abs(hillGrade(x,z,frame.f[0],frame.f[2])):0;
    const turn=dot(courseFrame(path,distance-2.8).f,courseFrame(path,distance+2.8).f);
    if(turn<-.31||grade>.149||turn<.66&&grade>.082) return false;
    const a=Math.floor(x/3),b=Math.floor(z/3);
    for(let i=a-1;i<=a+1;i++) for(let j=b-1;j<=b+1;j++) {
      const nearby=occupied.get(i+','+j)??[];
      if(nearby.some(p=>distance-p.distance>15&&Math.hypot(x-p.x,z-p.z)<2.9)) return false;
    }
    const key=a+','+b;
    if(!occupied.has(key)) occupied.set(key,[]);
    occupied.get(key).push({x,z,distance});
  }
  for(let distance=0;distance<=path.length;distance+=.75) {
    const frame=courseFrame(path,distance);
    for(const offset of [-.48,.48]) {
      const [x,,z]=offsetVertex(frame,offset,0);
      if(!clear(x,z)) return false;
    }
  }
  return clear(finish.p[0],finish.p[2]);
}

function searchSeedTrack(network,random) {
  const {points,edges,endpoints,minimum,maximum}=network;
  const targets=Object.keys(endpoints);
  const separation=(a,b)=>Math.hypot(points[a][0]-points[b][0],points[a][1]-points[b][1]);
  for(let attempt=0;attempt<24;attempt++) {
    const start=targets[Math.floor(random()*targets.length)];
    const goals=targets.filter(node=>separation(node,start)>minimum*.45);
    const goal=goals[Math.floor(random()*goals.length)];
    const visited=new Set([start]),route=[];
    const preferredLength=mix(minimum,maximum,.21+random()*.53);
    let budget=340,checks=0;
    function visit(node,length) {
      if(--budget<0||checks>=7||length+separation(node,goal)>maximum+16) return null;
      if(node===goal) {
        if(route.length<4||length<minimum) return null;
        checks++;
        const starts=[],path=joinTrack(route,starts);
        if(viableSeedTrack(path,network)) return {path,route:route.slice(),starts,start,goal};
        return null;
      }
      if(route.length>=22) return null;
      const previous=route.at(-1);
      const options=edges.get(node).filter(edge=>!visited.has(edge.to)&&
        (!previous||dot(previous.exit,edge.entry)>-.57));
      const pull=length+separation(node,goal)>preferredLength?1.32:.22;
      const choices=options.map(edge=>({edge,score:random()+pull*separation(edge.to,goal)/minimum}));
      choices.sort((a,b)=>a.score-b.score);
      for(const {edge} of choices) {
        route.push(edge);
        visited.add(edge.to);
        const candidate=visit(edge.to,length+edge.span);
        if(candidate) return candidate;
        visited.delete(edge.to);
        route.pop();
      }
      return null;
    }
    const course=visit(start,0);
    if(course) return course;
  }
  return null;
}

// Pick the straightest road point near target so seed checkpoints never straddle sharp intersections.
function straightGateDistance(path, target, minDist, maxDist) {
  let bestDist = clamp(target, minDist, maxDist), bestScore = -Infinity;
  const lo = Math.max(minDist, target - 30);
  const hi = Math.min(maxDist, target + 30);
  for (let d = lo; d <= hi; d += 2) {
    const f0 = courseFrame(path, d).f;
    let minDot = 1;
    for (const step of [-10, -5, 5, 10]) {
      const q = clamp(d + step, 0, path.length);
      minDot = Math.min(minDot, dot(f0, courseFrame(path, q).f));
    }
    const score = minDot - Math.abs(d - target) * 0.003;
    if (score > bestScore) { bestScore = score; bestDist = d; }
  }
  return bestDist;
}

function makeSeedCourse(code,campus) {
  if(activeCampus!==campus||readSeedCode(code,campus)!==code) return null;
  if(!loadedSeedNetworks.has(campus)) loadedSeedNetworks.set(campus,seedNetworks[campus]());
  const network=loadedSeedNetworks.get(campus);
  let candidate=searchSeedTrack(network,seedRandom(code));
  const weekly=new RegExp('^[SU]'+seedVersion+'-W\\d{8}$').test(code);
  if(weekly&&!candidate) candidate=searchSeedTrack(network,seedRandom(readSeedCode('326',campus)));
  if(!candidate) return null;
  const {path,route,starts,start,goal}=candidate;
  const startName=network.endpoints[start],goalName=network.endpoints[goal];
  const spec=[[0,startName]],count=Math.max(3,Math.round(path.length/112));
  let prevDist = 0;
  for(let i=1;i<=count;i++) {
    const raw = path.length*i/(count+1);
    const minAllowed = Math.max(prevDist + 45, 45);
    const maxAllowed = Math.max(minAllowed, path.length - (count - i + 1) * 45);
    const distance = straightGateDistance(path, raw, minAllowed, maxAllowed);
    prevDist = distance;
    let part = 0;
    while(part<starts.length-1&&path.rows[starts[part+1]].distance<=distance) part++;
    spec.push([distance,route[part].name]);
  }
  spec.push([path.length,goalName]);
  const cityAccess=campus==='szu'&&path.rows.some(({p:[x,,z]})=>!inCampus(x,z));
  const event=makeCourse('seed-'+code,(weekly?'每周挑战 ':'种子赛 ')+code,
    startName+' → '+goalName+' · '+Math.round(path.length)+' 米',path,spec,path.length,
    {absolute:true,campus,cityAccess,thresholds:[.965,1.11,1.29]});
  event.seed=code;
  event.environment=weekly&&typeof weeklyEnvironment==='function'?weeklyEnvironment(code):null;
  event.corners=brakingCorners(event);
  event.benchmark=makeBenchmark(event);
  event.benchmark.corners=referenceCornerScores(event,event.benchmark);
  event.medalTimes=Object.fromEntries(['gold','silver','bronze'].map((name,i)=>
    [name,Math.round(event.benchmark.time*event.thresholds[i]/10)*10]));
  if(campus==='ucl') refineLondonRace(event);
  return event;
}

const availableCourses=campus=>seedCourses[campus]?
  [...coursesByCampus[campus],seedCourses[campus]]:coursesByCampus[campus];
