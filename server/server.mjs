import { createServer } from 'node:http';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import rules from './room-rules.cjs';
import tuning190 from './tuning-190.cjs';
import routeRules from './route-rules.cjs';
import sharedRules from './shared-rules.cjs';

const {ROOM_ROUNDS,ALL_ROUND_VEHICLES,lockRoomVehicle,tally,settle,settleChaseRound,tagChaseRunner,retire,beginTuning,beginRoomRound,
  roomVehicle,roomParts,roomBuildProblem,roomBudgetProblems,blindBudget} = rules;

const LIMIT = 4;
const ROOM_LIMIT = 500;
const MATCH_LIMIT = 20 * 60_000;
const RECONNECT = 15_000;
const CAMPUSES = new Set(['szu','ucl','shunde']);
const VEHICLE_RULES = new Set(['bike','trail','ebike','chair','any']);
const VEHICLES = new Set(['bike','trail','ebike','chair']);
const WEATHERS = new Set(['day','sunset','night','rain']);
const PAINTS = new Set(['classic','shared','bay','red','white','amethyst','obsidian']);
const SKIN_CONSTANTS = sharedRules.SKIN_CONSTANTS;
const SKIN_VERSION = SKIN_CONSTANTS.schemaVersion;
const SKIN_IDS = new Set(['default']);
const REMOVED_SKIN_IDS = new Set(['yellow-orb']);
const SKIN_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,47}$/;
const SKIN_PRIMITIVES = new Set(['ellipsoid','tube','box']);
const SKIN_TRIANGLE_COSTS = SKIN_CONSTANTS.modelTriangleCosts;
const SKIN_ACCESSORIES = new Set(SKIN_CONSTANTS.accessories);
const SKIN_VEHICLES = new Set(SKIN_CONSTANTS.vehicles);
const SKIN_HEAD_MODES = new Set(SKIN_CONSTANTS.headModes);
const SKIN_LIMB_MODES = new Set(SKIN_CONSTANTS.limbModes);
const SKIN_ANIMATION_PROFILES = new Set(SKIN_CONSTANTS.animationProfiles);
const SKIN_ANCHORS = new Set(['body','head','neck','back','leftHand','rightHand','leftFoot','rightFoot']);
const SKIN_ACCESSORY_ANCHORS = new Set(['body','head','back','leftHand','rightHand']);
const SKIN_PART_ID = /^[a-z][a-z0-9_-]{0,31}$/;
const SKIN_MATERIAL = /^[a-z][a-zA-Z0-9_-]{0,23}$/;
const FORBIDDEN_SKIN_PART = /helmet|backpack/i;
const SKIN_GEOMETRY_RULES = SKIN_CONSTANTS.geometryRules;
const RIDER_HIP = SKIN_CONSTANTS.riderHip;
const MAX_SKIN_SPEC_BYTES = SKIN_CONSTANTS.maxSpecBytes;
const BICYCLE_LOOK = {
  category:['campus','road','climb','gravel'], rim:['auto','spokes','deep'], sidewall:['black','tan'],
  accessory:['none','bottle','basket','computer'], trim:['coal','brown','orange'],
};
const SOUND_KEYS = new Set(['countdown','go','checkpoint','finish','bell','rejoin']);
const SOUND_TYPES = {'.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.m4a':'audio/mp4','.webm':'audio/webm'};
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const identifier = () => randomBytes(8).toString('hex');
const normalizeTraffic = value => value==='off'||value==='standard'?value:'sparse';

const normalizeWindMode=value=>value==='steady'?'steady':'gust';

function sanitizeSkinSpec(value, requestedId) {
  if (!value || typeof value!=='object' || Array.isArray(value)) return null;
  let json;
  try { json=JSON.stringify(value); } catch { return null; }
  if (json.length>MAX_SKIN_SPEC_BYTES || value.schemaVersion!==SKIN_VERSION || value.rig!=='shared-rider-v1' || value.class!=='model') return null;
  if (typeof value.id!=='string' || !SKIN_ID_PATTERN.test(value.id) || value.id!==requestedId) return null;
  const label=typeof value.label==='string'&&value.label.trim().length<=64?value.label.trim():value.id;
  const palette=value.palette;
  if (!palette||typeof palette!=='object'||Array.isArray(palette)||Object.keys(palette).length>8) return null;
  const cleanPalette={};
  for (const [key,color] of Object.entries(palette)) {
    if (!/^[a-z][a-zA-Z0-9_-]{0,23}$/.test(key)||typeof color!=='string'||!/^#[0-9a-f]{6}$/i.test(color)) return null;
    cleanPalette[key]=color.toLowerCase();
  }
  const proportionRanges=SKIN_CONSTANTS.proportionRules;
  const proportionDefaults=SKIN_CONSTANTS.proportionDefaults;
  if (!value.proportions||typeof value.proportions!=='object'||Array.isArray(value.proportions)) return null;
  const proportions={};
  for (const [key,[min,max]] of Object.entries(proportionRanges)) {
    const number=value.proportions[key]??proportionDefaults[key];
    if (!Number.isFinite(number)||number<min||number>max) return null;
    proportions[key]=number;
  }
  const boundRanges=SKIN_CONSTANTS.boundsRules;
  if (!value.bounds||typeof value.bounds!=='object'||Array.isArray(value.bounds)) return null;
  const bounds={};
  for (const [key,[min,max]] of Object.entries(boundRanges)) {
    const number=value.bounds[key];
    if (!Number.isFinite(number)||number<min||number>max) return null;
    bounds[key]=number;
  }
  if (!SKIN_HEAD_MODES.has(value.headMode)||!SKIN_LIMB_MODES.has(value.limbMode)||!SKIN_ANIMATION_PROFILES.has(value.animationProfile)) return null;
  const accessoriesInput=value.accessories??[];
  if (!Array.isArray(accessoriesInput)||accessoriesInput.length>6) return null;
  const accessories=[];
  for (const item of accessoriesInput) {
    const source=typeof item==='string'?{type:item}:item;
    if (!source||typeof source!=='object'||Array.isArray(source)||!SKIN_ACCESSORIES.has(source.type)) return null;
    const anchor=source.anchor??(['eye','antenna'].includes(source.type)?'head':'body');
    const scale=source.scale??1, color=source.color??null;
    if (!SKIN_ACCESSORY_ANCHORS.has(anchor)||!Number.isFinite(scale)||scale<.5||scale>1.5||
        (color!==null&&(typeof color!=='string'||!/^#[0-9a-f]{6}$/i.test(color)))) return null;
    accessories.push({type:source.type,anchor,scale,...(color?{color:color.toLowerCase()}: {})});
  }
  const vehiclesInput=value.allowedVehicles??['bike','ebike','chair','trail'];
  if (!Array.isArray(vehiclesInput)||!vehiclesInput.length) return null;
  const allowedVehicles=[...new Set(vehiclesInput)];
  if (allowedVehicles.some(vehicle=>!SKIN_VEHICLES.has(vehicle))) return null;
  const triangleBudget=value.triangleBudget;
  if (!Number.isInteger(triangleBudget)||triangleBudget<1||triangleBudget>2400) return null;
  const unlock=value.unlock==null?null:value.unlock;
  if (unlock!==null&&(typeof unlock!=='string'||unlock.length>80)) return null;
  const model=value.model;
  if (!model||model.version!==1||!Array.isArray(model.parts)||model.parts.length<2||model.parts.length>32) return null;
  const vector=(input,limits=[-2.5,2.5])=>Array.isArray(input)&&input.length===3&&input.every(number=>typeof number==='number'&&Number.isFinite(number)&&number>=limits[0]&&number<=limits[1]);
  const partIds=new Set(), parts=[];
  for (const part of model.parts) {
    if (!part||typeof part!=='object'||Array.isArray(part)||typeof part.id!=='string'||!SKIN_PART_ID.test(part.id)||FORBIDDEN_SKIN_PART.test(part.id)||partIds.has(part.id)||
        !SKIN_PRIMITIVES.has(part.primitive)||typeof part.material!=='string'||!SKIN_MATERIAL.test(part.material)||!Object.hasOwn(cleanPalette,part.material)||
        (part.anchor!=null&&!SKIN_ANCHORS.has(part.anchor))) return null;
    partIds.add(part.id);
    const id=part.id, primitive=part.primitive, material=part.material;
    const anchor=part.anchor==null?null:part.anchor;
    const yaw=part.yaw??0, roll=part.roll??0;
    if (!Number.isFinite(yaw)||!Number.isFinite(roll)||Math.abs(yaw)>Math.PI*4||Math.abs(roll)>Math.PI*4) return null;
    const common={id,primitive,material,...(anchor?{anchor}: {})};
    if (primitive==='tube') {
      const radius=part.radius, radius2=part.radius2??part.radius;
      if (!vector(part.from)||!vector(part.to)||!Number.isFinite(radius)||!Number.isFinite(radius2)||radius<.004||radius>.45||radius2<.004||radius2>.45) return null;
      parts.push({...common,from:part.from.slice(),to:part.to.slice(),radius,radius2,yaw,roll});
    } else {
      if (!vector(part.center)||!vector(part.size,[.004,1.2])||part.size.some(number=>Number(number)<.004)) return null;
      parts.push({...common,center:part.center.slice(),size:part.size.slice(),yaw,roll});
    }
  }
  if (!partIds.has('body')||!partIds.has('head')) return null;
  const modelEnvelope = (() => {
    const height=proportions.heightScale, width=proportions.bodyWidthScale, depth=proportions.bodyDepthScale;
    const headHeight=proportions.headHeightScale, headWidth=proportions.headWidthScale;
    const limbRadius=proportions.limbRadiusScale;
    const low=[Infinity,Infinity,Infinity], high=[-Infinity,-Infinity,-Infinity];
    const partBounds=new Map();
    const point = ([x,y,z]) => [
      RIDER_HIP[0] + (x - RIDER_HIP[0]) * depth,
      RIDER_HIP[1] + (y - RIDER_HIP[1]) * height,
      z * width,
    ];
    const include = (id, center, extent) => {
      const lo=center.map((value,axis)=>value-extent[axis]);
      const hi=center.map((value,axis)=>value+extent[axis]);
      for (let axis=0;axis<3;axis++) {
        low[axis]=Math.min(low[axis],lo[axis]);
        high[axis]=Math.max(high[axis],hi[axis]);
      }
      partBounds.set(id,{low:lo,high:hi});
    };
    for (const part of parts) {
      const isHead=/head|eye/i.test(part.id);
      const axisScale=[depth,height*(isHead?headHeight:1),width*(isHead?headWidth:1)];
      if (part.primitive==='tube') {
        const from=point(part.from), to=point(part.to), radius=Math.max(part.radius,part.radius2??part.radius)*limbRadius;
        include(part.id,from.map((value,axis)=>(value+to[axis])*.5),[
          Math.abs(to[0]-from[0])*.5+radius,
          Math.abs(to[1]-from[1])*.5+radius,
          Math.abs(to[2]-from[2])*.5+radius,
        ]);
        continue;
      }
      const center=point(part.center);
      const scaled=part.size.map((value,axis)=>value*axisScale[axis]);
      const rotated=Math.abs(part.yaw)>1e-6||Math.abs(part.roll)>1e-6;
      const extent=part.primitive==='ellipsoid'
        ? (rotated?[Math.hypot(...scaled),Math.hypot(...scaled),Math.hypot(...scaled)]:scaled)
        : (rotated?[Math.hypot(...scaled)*.5,Math.hypot(...scaled)*.5,Math.hypot(...scaled)*.5]:scaled.map(value=>value*.5));
      include(part.id,center,extent);
    }
    return {low,high,partBounds};
  })();
  const [minX,minY,minZ]=modelEnvelope.low, [maxX,maxY,maxZ]=modelEnvelope.high;
  const actual={depth:maxX-minX,height:maxY-minY,width:maxZ-minZ};
  for (const key of ['depth','height','width']) {
    const [min,max]=SKIN_GEOMETRY_RULES[key];
    if (actual[key]<min||actual[key]>max||actual[key]>bounds[key]) return null;
  }
  for (const [id,part] of [['body',parts.find(item=>item.id==='body')],['head',parts.find(item=>item.id==='head')]]) {
    if (!part) return null;
    if (part.primitive==='tube') return null;
    const rule=SKIN_GEOMETRY_RULES[`${id}${part.primitive==='ellipsoid'?'Ellipsoid':'Box'}`];
    if (rule && part.size.some((number,axis)=>number<rule[axis][0]||number>rule[axis][1])) return null;
    const centerRule=SKIN_GEOMETRY_RULES[`${id}Center`];
    if (centerRule && part.center.some((number,axis)=>number<centerRule[axis][0]||number>centerRule[axis][1])) return null;
  }
  for (const [id,range] of [['body',SKIN_GEOMETRY_RULES.bodySpan],['head',SKIN_GEOMETRY_RULES.headSpan]]) {
    const part=modelEnvelope.partBounds.get(id);
    if (!part) return null;
    const span=Math.max(...part.high.map((value,axis)=>value-part.low[axis]));
    if (span<range[0]||span>range[1]) return null;
  }
  const offset=SKIN_GEOMETRY_RULES.hipOffset;
  const depthLimit=Math.max(bounds.depth*offset.xFactor,offset.xMinimum);
  const widthLimit=bounds.width*offset.zFactor, heightLimit=bounds.height*offset.yFactor;
  if (Math.max(Math.abs(minX-RIDER_HIP[0]),Math.abs(maxX-RIDER_HIP[0]))>depthLimit ||
      Math.max(Math.abs(minY-RIDER_HIP[1]),Math.abs(maxY-RIDER_HIP[1]))>heightLimit ||
      Math.max(Math.abs(minZ),Math.abs(maxZ))>widthLimit) return null;
  const modelTriangles=parts.reduce((sum,part)=>sum+(SKIN_TRIANGLE_COSTS[part.primitive]??0),0);
  if (modelTriangles>triangleBudget) return null;
  return {
    schemaVersion:SKIN_VERSION,id:value.id,label,class:'model',rig:'shared-rider-v1',palette:cleanPalette,
    proportions,headMode:value.headMode,limbMode:value.limbMode,animationProfile:value.animationProfile,
    accessories,allowedVehicles,bounds,triangleBudget,model:{version:1,parts},unlock,
  };
}

function canonicalSkinText(spec) {
  return JSON.stringify({
    schemaVersion:spec.schemaVersion,id:spec.id,label:spec.label,class:spec.class,rig:spec.rig,
    palette:spec.palette,proportions:spec.proportions,headMode:spec.headMode,limbMode:spec.limbMode,
    animationProfile:spec.animationProfile,accessories:spec.accessories,allowedVehicles:spec.allowedVehicles,
    bounds:spec.bounds,triangleBudget:spec.triangleBudget,model:spec.model??null,unlock:spec.unlock??null,
  });
}

function skinSpecHash(spec) {
  let hash=2166136261;
  for (const char of canonicalSkinText(spec)) { hash^=char.codePointAt(0); hash=Math.imul(hash,16777619)>>>0; }
  return `fnv1a-${hash.toString(16).padStart(8,'0')}`;
}

function sanitizeProfile(body,rule) {
  const vehicle=VEHICLES.has(body?.vehicle)?body.vehicle:'bike';
  const current=VEHICLES.has(rule)?rule:vehicle;
  const requestedSkin=typeof body?.skinId==='string'?body.skinId:'';
  const customSkin=!SKIN_IDS.has(requestedSkin)&&!REMOVED_SKIN_IDS.has(requestedSkin)&&SKIN_ID_PATTERN.test(requestedSkin)?sanitizeSkinSpec(body?.skinSpec,requestedSkin):null;
  const customHash=customSkin?skinSpecHash(customSkin):null;
  return {
    paint: PAINTS.has(body?.paint) ? body.paint : 'classic',
    skinId: customSkin ? requestedSkin : SKIN_IDS.has(body?.skinId) ? body.skinId : 'default',
    skinVersion: SKIN_VERSION,
    skinSpec: customSkin,
    // The server always publishes the hash of its canonicalized spec. A client
    // supplied hash is advisory and is never allowed to desynchronize cache keys.
    skinSpecHash: customHash,
    vehicle,
    look: Object.fromEntries(Object.entries(BICYCLE_LOOK).map(([key,choices])=>[
      key,choices.includes(body?.look?.[key])?body.look[key]:choices[0],
    ])),
    bike:tuning190.sanitize('bike',body?.bike),
    tunings:Object.fromEntries(['trail','ebike','chair'].map(id=>[
      id,tuning190.sanitize(id,body?.tunings?.[id]??(current===id?body?.tuning:null))
    ])),
  };
}

async function serveSound(req,res,soundDir,pathname) {
  if (req.method!=='GET' || !pathname.startsWith('/sound/')) return false;
  if (pathname==='/sound/manifest.json') {
    const files = {};
    if (soundDir) {
      try {
        for (const entry of await readdir(soundDir)) {
          const match = /^([a-z]+)(\.[a-z0-9]+)$/i.exec(entry);
          if (!match) continue;
          const key = match[1].toLowerCase(), ext = match[2].toLowerCase();
          if (SOUND_KEYS.has(key) && Object.hasOwn(SOUND_TYPES,ext) && !files[key]) files[key] = '/sound/'+entry;
        }
      } catch {}
    }
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...CORS_HEADERS});
    res.end(JSON.stringify({files}));
    return true;
  }
  const name = pathname.slice(7);
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  if (!soundDir || !/^[a-zA-Z0-9._-]+$/.test(name) || !Object.hasOwn(SOUND_TYPES,ext)) {
    res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8',...CORS_HEADERS}).end('Not Found');
    return true;
  }
  try {
    const data = await readFile(new URL(name,pathToFileURL(soundDir + '/')));
    res.writeHead(200,{'Content-Type':SOUND_TYPES[ext],'Cache-Control':'no-cache',...CORS_HEADERS});
    res.end(data);
  } catch {
    res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8',...CORS_HEADERS}).end('Not Found');
  }
  return true;
}
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Private-Network': 'true',
  'Access-Control-Max-Age': '600',
};

export function listHostAddresses(port) {
  const entries = [];
  const seen = new Set();
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const info of list ?? []) {
      if (info.family!=='IPv4' || info.internal || info.address.startsWith('169.254.') || seen.has(info.address)) continue;
      seen.add(info.address);
      const virtual = /vethernet|wsl|hyper-v|docker|vmware|virtualbox|vbox/i.test(name);
      const radmin = info.address.startsWith('26.') || /radmin/i.test(name);
      const vpn = !radmin && (/^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(info.address) || /tailscale|zerotier|hamachi|wireguard|tun|tap|vpn/i.test(name));
      const lan = !radmin && !vpn && /^(?:192\.168\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(info.address);
      const kind = radmin?'radmin':vpn?'vpn':lan?'lan':'other';
      const label = radmin?'Radmin VPN':vpn?'虚拟局域网':lan?'局域网':'网络';
      const priority = (radmin?0:vpn?1:lan?2:3)+(virtual?10:0);
      entries.push({name,address:info.address,port,url:`http://${info.address}:${port}`,kind,label,priority});
    }
  }
  entries.sort((a,b)=>a.priority-b.priority||a.address.localeCompare(b.address));
  return entries.map(({priority,...item})=>item);
}

class RoomError extends Error {
  constructor(message,status=409) { super(message); this.status = status; }
}

function json(res,status,data) {
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...CORS_HEADERS});
  res.end(JSON.stringify(data));
}

async function readRequest(req) {
  if (req.headers['content-type']?.split(';')[0]!=='application/json') throw new RoomError('请求格式错误。',415);
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes>32_768) throw new RoomError('请求过大。',413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new RoomError('请求格式错误。',400); }
}

function assertRoute(route) {
  if (!route || !CAMPUSES.has(route.campus) || typeof route.id!=='string' || !/^[a-zA-Z0-9._-]{1,64}$/.test(route.id) ||
      typeof route.layout!=='string' || !/^[0-9a-f]{8}$/.test(route.layout) ||
      (route.campus==='shunde' && route.seed!==null) ||
      (route.seed!==null && (typeof route.seed!=='string' || !/^[SU][0-9]-[A-Z0-9]{1,12}$/.test(route.seed) ||
        route.id!=='seed-'+route.seed || route.seed[0]!==route.campus[0].toUpperCase()))) {
    throw new RoomError('赛道信息无效。',400);
  }
  const candidate = routeRules.normalizeRoute({
    campus: route.campus, id: route.id, seed: route.seed, source: route.networkRevision || route.edges?.length ? 'network' : route.seed ? 'seed' : 'fixed',
    networkRevision: route.networkRevision, edges: route.edges, variant: route.variant,
  });
  if (!candidate || (candidate.source === 'network' && candidate.networkRevision !== routeRules.CAMPUS_NETWORKS[route.campus])) {
    throw new RoomError('赛道身份无效。',400);
  }
  const canonical = routeRules.encodeRoute(candidate);
  if (!canonical || (route.code !== undefined && route.code !== canonical)) throw new RoomError('路线代码与赛道字段不一致。',400);
  const parsed = route.code ? routeRules.parseRouteCode(route.code) : candidate;
  if (!parsed || parsed.campus !== route.campus || parsed.variant.direction !== candidate.variant.direction || parsed.variant.laps !== candidate.variant.laps) {
    throw new RoomError('路线代码版本或变体不一致。',400);
  }
  const {campus,id,layout,seed} = route;
  return {
    campus, id, layout, seed,
    variant: parsed.variant,
    ...(parsed.networkRevision ? { networkRevision: parsed.networkRevision, edges: parsed.edges } : {}),
    code: canonical,
  };
}

function clampTuningSeconds(value,fallback=0) {
  if (value===undefined||value===null||value==='') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new RoomError('改车时间无效。',400);
  return Math.max(0,Math.min(180,Math.round(n)));
}

function clampWindSpeed(value,fallback=0) {
  if (value===undefined||value===null||value==='') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new RoomError('风速设置无效。',400);
  return Math.round(Math.max(0,Math.min(15,n))*10)/10;
}

function clampWindDir(value,fallback=0) {
  if (value===undefined||value===null||value==='') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n)||n<0||n>7) throw new RoomError('风向设置无效。',400);
  return n;
}

function addPlayer(room,name,profile={}) {
  if (room.players.size>=LIMIT) throw new RoomError('房间已满。');
  if (typeof name!=='string' || name.length>48) throw new RoomError('骑手名无效。',400);
  const nickname = Array.from(name.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu,'').trim())
    .slice(0,12).join('') || 'player';
  const clean = sanitizeProfile(profile,room.vehicleRule);
  const player = {id:identifier(),name:nickname,token:randomBytes(24).toString('base64url'),ready:false,
    paint:clean.paint,skinId:clean.skinId,skinVersion:clean.skinVersion,skinSpec:clean.skinSpec,skinSpecHash:clean.skinSpecHash,vehicle:clean.vehicle,look:clean.look,bike:clean.bike,tunings:clean.tunings,
    stream:null,expires:Date.now()+RECONNECT,signals:[],signalWindow:0,signalCount:0};
  room.players.set(player.id,player);
  return player;
}

function event(player,type,value) {
  const stream = player.stream;
  if (!stream) return false;
  if (stream.writableLength>65_536) { stream.destroy(); return false; }
  stream.write(`event: ${type}\ndata: ${JSON.stringify(value)}\n\n`);
  return true;
}

function roomState(room) {
  return {protocol:tuning190.protocol,code:room.code,host:room.host,route:room.route,format:room.format,
    vehicleRule:room.vehicleRule,weather:room.weather,phase:room.phase,
    windSpeed:room.windSpeed??0,windDir:room.windDir??0,windMode:room.windMode,windSeed:room.windSeed,
    budget:room.budget,blind:room.blind,budgetProblems:roomBudgetProblems(room),
    tuningSeconds:room.tuningSeconds??0,collision:Boolean(room.collision),traffic:room.traffic??'sparse',tuning:room.tuning??null,
    players:Array.from(room.players.values(),player=>{
      const {id,name,ready,stream,paint,skinId,skinVersion,skinSpec,skinSpecHash,vehicle,look,bike}=player;
      return {id,name,ready,online:Boolean(stream),paint,skinId,skinVersion,skinSpec,skinSpecHash,vehicle,look,bike,
        tuning:roomVehicle(room,player)==='bike'?{}:roomParts(room,player)};
    }),
    roundsTotal:ROOM_ROUNDS[room.format],
    ...(room.format === 'triathlon' && { vehicleRotation: ALL_ROUND_VEHICLES }),
    round:room.round,history:room.history,standing:room.standing,winners:room.winners};
}

function publish(room) {
  const state = roomState(room);
  for (const player of room.players.values()) event(player,'room',state);
}

function removePlayer(room,player) {
  room.players.delete(player.id);
  player.stream?.end();
  if (room.host===player.id) room.host=room.players.keys().next().value;
  retire(room,player.id);
  if ((room.phase==='between'||room.phase==='tuning') && room.players.size<2) {
    room.phase = 'done';
    room.tuning = null;
    room.winners = tally(room);
  }
  publish(room);
}

function applyCommand(room,player,body) {
  switch (body?.action) {
    case 'ready':
      if (room.phase!=='lobby' && room.phase!=='between' && room.phase!=='tuning') throw new RoomError('当前无法准备。');
      if(body.ready===true&&(room.phase==='tuning'||(!room.blind&&!room.tuningSeconds))) {
        const why=roomBuildProblem(room,player);
        if(why) throw new RoomError(why+'，请先在车库调整。');
      }
      player.ready = body.ready===true;
      if (room.phase==='tuning') {
        const onlinePlayers = [...room.players.values()].filter(item=>item.stream);
        if (onlinePlayers.length && onlinePlayers.every(item=>item.ready)) beginRoomRound(room,Date.now());
      }
      break;
    case 'profile': {
      if (room.phase==='race') throw new RoomError('比赛中无法更换配置。');
      const clean = sanitizeProfile(body,room.vehicleRule);
      player.paint = clean.paint;
      player.skinId = clean.skinId;
      player.skinVersion = clean.skinVersion;
      player.skinSpec = clean.skinSpec;
      player.skinSpecHash = clean.skinSpecHash;
      player.vehicle = clean.vehicle;
      player.look = clean.look;
      player.bike = clean.bike;
      player.tunings = clean.tunings;
      if(room.phase==='tuning'&&roomBuildProblem(room,player)) player.ready=false;
      if (typeof body.name==='string' && body.name.length<=48) {
        const nickname = Array.from(body.name.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu,'').trim())
          .slice(0,12).join('');
        if (nickname) player.name = nickname;
      }
      break;
    }
    case 'config': {
      if (room.host!==player.id || room.phase==='race') throw new RoomError('当前无法修改房间设置。');
      if (body.route!==undefined) room.route = assertRoute(body.route);
      if (body.format!==undefined) {
        if (!Object.hasOwn(ROOM_ROUNDS,body.format)) throw new RoomError('赛制无效。',400);
        room.format = body.format;
      }
      if (body.vehicleRule!==undefined) {
        if (!VEHICLE_RULES.has(body.vehicleRule)) throw new RoomError('车型规则无效。',400);
        room.vehicleRule = body.vehicleRule;
      }
      if (body.weather!==undefined) {
        if (!WEATHERS.has(body.weather)) throw new RoomError('天气无效。',400);
        room.weather = body.weather;
      }
      if (body.windSpeed!==undefined) room.windSpeed = clampWindSpeed(body.windSpeed,room.windSpeed??0);
      if (body.windDir!==undefined) room.windDir = clampWindDir(body.windDir,room.windDir??0);
      if(body.windMode!==undefined) room.windMode=normalizeWindMode(body.windMode);
      if(body.budget!==undefined) room.budget=tuning190.normalizeBudget(body.budget);
      if(body.blind!==undefined) room.blind=body.blind===true;
      if (body.tuningSeconds!==undefined) room.tuningSeconds = clampTuningSeconds(body.tuningSeconds,room.tuningSeconds??0);
    if (body.collision!==undefined) room.collision = Boolean(body.collision);
    if (body.traffic!==undefined) room.traffic = normalizeTraffic(body.traffic);
      if (room.phase==='done') {
        room.phase = 'lobby';
        room.round = null;
        room.tuning = null;
        room.history = [];
        room.standing = [];
        room.winners = [];
        delete room.roster;
      }
      lockRoomVehicle(room);
      if (room.phase==='tuning') {
        room.tuning.budget=room.blind?blindBudget(room.tuning.seed,room.budget):tuning190.budgetLimit(room.budget);
        if ((room.tuningSeconds??0)===0&&!room.blind) beginRoomRound(room,Date.now());
        else if (body.tuningSeconds!==undefined) {
          const seconds=room.tuningSeconds||30;
          Object.assign(room.tuning,{seconds,endsAt:Date.now()+seconds*1000});
        }
      } else {
        for (const member of room.players.values()) member.ready = false;
      }
      break;
    }
    case 'start': {
      if (room.host!==player.id || (room.phase!=='lobby' && room.phase!=='between')) throw new RoomError('当前无法发车。');
      const players = [...room.players.values()];
      if (players.length<2 || players.some(item=>!item.ready||!item.stream)) throw new RoomError('至少两人，且所有骑手都需准备。');
      if ((room.tuningSeconds??0)>0||room.blind) beginTuning(room,Date.now());
      else {
        const blocked=beginRoomRound(room,Date.now());
        if(blocked.length) throw new RoomError(blocked.map(({name,reason})=>name+'：'+reason).join('；'));
      }
      break;
    }
    case 'skipTuning': {
      if (room.host!==player.id || room.phase!=='tuning') throw new RoomError('当前不在改装倒计时阶段。');
      const blocked=beginRoomRound(room,Date.now());
      if(blocked.length) throw new RoomError(blocked.map(({name,reason})=>name+'：'+reason).join('；'));
      break;
    }
    case 'finish':
      if (room.format==='chase') throw new RoomError('捉人模式无需冲线。',409);
      if (room.phase!=='race' || body.round!==room.round.number || !room.roster.some(item=>item.id===player.id)) throw new RoomError('这一轮已结算。');
      if (!Number.isInteger(body.ms)||body.ms<1||body.ms>MATCH_LIMIT+120_000||Date.now()<room.round.goAt) {
        throw new RoomError('完赛时间与本轮时间不符。');
      }
      if (!room.round.results.some(item=>item.id===player.id)) room.round.results.push({id:player.id,ms:body.ms});
      settle(room);
      break;
    case 'tag': {
      if (room.phase!=='race' || room.format!=='chase' || body.round!==room.round?.number || !room.round?.chase) {
        throw new RoomError('这一轮已结算。');
      }
      const chase = room.round.chase;
      if (player.id!==chase.hunterId) throw new RoomError('只有捉人者可以提交拦截。',403);
      if (Date.now()<room.round.goAt+chase.headStartMs-500) throw new RoomError('逃跑者先行时间尚未结束。');
      if (typeof body.targetId!=='string') throw new RoomError('拦截目标无效。',400);
      const ms = Math.max(1,Math.min(chase.durationMs,Math.round(Number(body.ms)||Math.max(1,Date.now()-room.round.goAt))));
      if (!tagChaseRunner(room,player.id,body.targetId,ms)) throw new RoomError('无法拦截该目标或目标已被抓获。');
      break;
    }
    case 'retire':
      if (body.round===room.round?.number) retire(room,player.id);
      break;
    case 'leave':
      removePlayer(room,player);
      return;
    case 'signal': {
      const now = Date.now();
      if (now>=player.signalWindow) { player.signalWindow=now+10_000; player.signalCount=0; }
      if (++player.signalCount>120) throw new RoomError('建连请求过于频繁。',429);
      const other = room.players.get(body.to), signal = body.data;
      if (!other || other===player || !signal || typeof signal!=='object') throw new RoomError('连接目标已离开。');
      const description = (signal.type==='offer'||signal.type==='answer') && typeof signal.sdp==='string' && signal.sdp.length<=24_000;
      const candidate = signal.type==='candidate' && signal.ice && typeof signal.ice.candidate==='string' && signal.ice.candidate.length<=2000;
      if (!description && !candidate) throw new RoomError('连接信息无效。',400);
      const payload = {from:player.id,data:signal};
      if (!event(other,'signal',payload) && other.signals.length<32) other.signals.push(payload);
      return;
    }
    default: throw new RoomError('未知的房间操作。',400);
  }
  publish(room);
}

export async function loadStaticAssets(dirUrl) {
  const specs = [
    ['/index.html','index.html','text/html; charset=utf-8',true],
    ['/game.js','game.js','application/javascript; charset=utf-8',false],
    ['/style.css','style.css','text/css; charset=utf-8',false],
  ];
  const assets = {};
  for (const [route,file,contentType,required] of specs) {
    try {
      assets[route] = {contentType,body:await readFile(new URL(file,dirUrl))};
    } catch (error) {
      if (error.code!=='ENOENT' || required) throw error;
    }
  }
  return assets;
}

function buildStaticFiles({page,assets}) {
  const staticFiles = new Map();
  const addStatic = (route,contentType,body)=>{
    const raw = Buffer.isBuffer(body)?body:Buffer.from(body);
    staticFiles.set(route,{contentType,raw,gzip:gzipSync(raw)});
  };
  if (assets) {
    for (const [route,entry] of Object.entries(assets)) addStatic(route,entry.contentType,entry.body);
  }
  if (page && !staticFiles.has('/index.html')) addStatic('/index.html','text/html; charset=utf-8',page);
  if (staticFiles.has('/index.html')) staticFiles.set('/',staticFiles.get('/index.html'));
  return staticFiles;
}

function serveStatic(req,res,staticFiles,pathname) {
  const asset = req.method==='GET' ? staticFiles.get(pathname) : null;
  if (!asset) return false;
  const useGzip = /(?:^|,\s*)gzip(?:,|$)/i.test(req.headers['accept-encoding']??'');
  res.writeHead(200,{'Content-Type':asset.contentType,'Vary':'Accept-Encoding','Cache-Control':'no-cache',
    'Referrer-Policy':'no-referrer',...(useGzip?{'Content-Encoding':'gzip'}:{})});
  res.end(useGzip?asset.gzip:asset.raw);
  return true;
}

export function createRideServer({page,assets,soundDir,iceServers=[{urls:'stun:stun.l.google.com:19302'}],turn}={}) {
  const rooms = new Map();
  const staticFiles = buildStaticFiles({page,assets});
  const sweep = setInterval(()=>{
    const now = Date.now();
    for (const [code,room] of rooms) {
      for (const player of room.players.values()) {
        if (!player.stream && player.expires<=now) removePlayer(room,player);
      }
      if (!room.players.size) { rooms.delete(code); continue; }
      if (room.phase==='tuning' && Number.isFinite(room.tuning?.endsAt) && now>=room.tuning.endsAt) {
        beginRoomRound(room,now);
        publish(room);
      }
      if (room.phase==='race' && now>=room.round.deadline) {
        if (room.format==='chase') settleChaseRound(room,true);
        else for (const player of room.roster) retire(room,player.id);
        publish(room);
      }
    }
  },500).unref();
  const heartbeat = setInterval(()=>{
    for (const room of rooms.values()) for (const player of room.players.values()) {
      if (player.stream?.writableLength>65_536) player.stream.destroy();
      else player.stream?.write(': ping\n\n');
    }
  },10_000).unref();

  const server = createServer(async (req,res)=>{
    try {
      const url = new URL(req.url,'http://localhost');
      const {pathname} = url;
      if (req.method==='OPTIONS' && (pathname.startsWith('/online/') || pathname.startsWith('/sound/'))) {
        res.writeHead(204,CORS_HEADERS).end();
        return;
      }
      if (serveStatic(req,res,staticFiles,pathname)) return;
      if (pathname.startsWith('/sound/') && await serveSound(req,res,soundDir,pathname)) return;
      if (req.method==='GET' && pathname==='/online/time') { json(res,200,{now:Date.now()}); return; }
      if (req.method==='GET' && pathname==='/online/host-info') {
        const bound = server.address();
        const port = typeof bound==='object'&&bound ? bound.port : Number(process.env.PORT ?? 8787);
        json(res,200,{port,addresses:listHostAddresses(port)});
        return;
      }
      if (req.method==='POST' && pathname==='/online/rooms') {
        const body = await readRequest(req);
        if (body?.protocol!==tuning190.protocol) throw new RoomError('联机版本不匹配，请更新到支持协议 v3 的版本。',400);
        const joining = typeof body.code==='string';
        let room = joining?rooms.get(body.code):null;
        if (joining && !room) throw new RoomError('找不到房间。',404);
        if (room && room.phase!=='lobby') throw new RoomError('这场比赛已经开始。');
        if (!room) {
          if (rooms.size>=ROOM_LIMIT) throw new RoomError('房间已达上限，请稍后再试。',503);
          if (!Object.hasOwn(ROOM_ROUNDS,body.format)) throw new RoomError('赛制无效。',400);
          const vehicleRule = body.format==='triathlon' ? 'bike' : (body.vehicleRule===undefined ? 'bike' : body.vehicleRule);
          const weather = body.weather===undefined ? 'day' : body.weather;
          const windSpeed = clampWindSpeed(body.windSpeed,0);
          const windDir = clampWindDir(body.windDir,0);
          const tuningSeconds = clampTuningSeconds(body.tuningSeconds,0);
          const collision = Boolean(body.collision);
          const traffic = normalizeTraffic(body.traffic);
          if (!VEHICLE_RULES.has(vehicleRule)) throw new RoomError('车型规则无效。',400);
          if (!WEATHERS.has(weather)) throw new RoomError('天气无效。',400);
          let code;
          do { code = Array.from(randomBytes(8),byte=>alphabet[byte%alphabet.length]).join(''); } while (rooms.has(code));
          room = {code,players:new Map(),format:body.format,route:assertRoute(body.route),
            budget:tuning190.normalizeBudget(body.budget),blind:body.blind===true,
            windMode:normalizeWindMode(body.windMode),windSeed:randomBytes(4).readUInt32LE(),
            vehicleRule,weather,windSpeed,windDir,tuningSeconds,collision,traffic,tuning:null,phase:'lobby',round:null,history:[],standing:[],winners:[]};
        }
        if (req.destroyed && !req.complete) return;
        const player = addPlayer(room,body.name,body);
        if (!joining) { room.host = player.id; rooms.set(room.code,room); }
        publish(room);
        const ice = iceServers.slice();
        if (turn) {
          const username = Math.floor(Date.now()/1000+7200)+':'+player.id;
          ice.push({urls:turn.urls,username,credential:createHmac('sha1',turn.secret).update(username).digest('base64')});
        }
        json(res,200,{id:player.id,token:player.token,room:roomState(room),iceServers:ice});
        return;
      }
      const match = /^\/online\/rooms\/([A-Z2-9]{8})\/(events|command)$/.exec(pathname);
      if (!match) throw new RoomError('找不到此页面。',404);
      const room = rooms.get(match[1]);
      const id = url.searchParams.get('id');
      const player = room?.players.get(id);
      if (match[2]==='events' && req.method==='GET') {
        if (!player || player.token!==url.searchParams.get('token')) {
          res.writeHead(204,CORS_HEADERS).end();
          return;
        }
        player.stream?.end();
        player.stream = res;
        res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform',
          'X-Accel-Buffering':'no',...CORS_HEADERS});
        res.flushHeaders();
        res.write('retry: 1200\n\n');
        publish(room);
        for (const signal of player.signals.splice(0)) event(player,'signal',signal);
        res.on('close',()=>{
          if (player.stream!==res) return;
          player.stream = null;
          player.expires=Date.now()+RECONNECT;
          publish(room);
        });
        return;
      }
      if (match[2]==='command' && req.method==='POST') {
        if (!player || req.headers.authorization!=='Bearer '+player.token) throw new RoomError('房间连接已失效。',403);
        const body = await readRequest(req);
        if (rooms.get(room.code)!==room || room.players.get(id)!==player) throw new RoomError('房间连接已失效。',403);
        applyCommand(room,player,body);
        json(res,200,{ok:true});
        return;
      }
      throw new RoomError('请求方式不支持。',405);
    } catch (error) {
      if (error instanceof RoomError) { if (!res.destroyed) json(res,error.status,{error:error.message}); }
      else { console.error(error); if (!res.destroyed) json(res,500,{error:'联机服务暂时不可用。'}); }
    }
  });
  server.on('close',()=>{clearInterval(sweep);clearInterval(heartbeat);});
  return server;
}

function openBrowser(target) {
  const command = process.platform==='win32' ? ['cmd',['/c','start','',target]] :
    process.platform==='darwin' ? ['open',[target]] : ['xdg-open',[target]];
  try { spawn(command[0],command[1],{detached:true,stdio:'ignore',windowsHide:true}).unref(); } catch {}
}

async function listenWithFallback(server,host,requestedPort,allowFallback) {
  const maxPort = allowFallback ? requestedPort+12 : requestedPort;
  for (let port=requestedPort; port<=maxPort; port++) {
    try {
      await new Promise((resolve,reject)=>{
        server.once('error',reject);
        server.listen(port,host,()=>{server.off('error',reject);resolve();});
      });
      return server.address().port;
    } catch (error) {
      if (error.code!=='EADDRINUSE' || port===maxPort) throw error;
    }
  }
}

const gameVersion = (page,assets) => /(?:FORZERO:\s*BUDGET[^<]*?|荔园环骑)\s+([0-9.]+)<\/title>/.exec(String(assets?.['/index.html']?.body??page))?.[1]??null;

export function createAppShell({page,assets,soundDir,saveDir,previousSaveFile,iceServers,turn,roomPort=8787,roomHost='0.0.0.0',allowPortFallback=true,idleMs=8000,bootTimeoutMs=60_000,onShutdown}={}) {
  const staticFiles = buildStaticFiles({page,assets});
  const version = gameVersion(page,assets);
  const clients = new Set();
  let hostServer = null, hostPort = null, hostOp = Promise.resolve(), saveOp = Promise.resolve(), closing = false;
  let shutdownTimer = null, bootTimer = null;

  const saveFilePath = saveDir ? fileURLToPath(new URL('player-data.json', pathToFileURL(saveDir + '/'))) : null;
  const saveTmpPath = saveFilePath ? saveFilePath + '.tmp' : null;
  function validSave(data) {
    return data?.format==='litchi-save' && data.version===1 &&
      data.storage && typeof data.storage==='object' && !Array.isArray(data.storage);
  }
  async function readSaveFile() {
    if (!saveFilePath) return null;
    try {
      const data=JSON.parse(await readFile(saveFilePath,'utf8'));
      if (!validSave(data)) throw new SyntaxError('Invalid current save');
      return data;
    } catch (error) {
      if (error instanceof SyntaxError) throw new RoomError('本地 player-data.json 已损坏，原文件已保留。',409);
      if (error.code!=='ENOENT') throw error;
    }
    for(const file of [previousSaveFile??[]].flat()) {
      try {
        const data=JSON.parse(await readFile(file,'utf8'));
        if(validSave(data)) return data;
      } catch(error) {
        if(error.code!=='ENOENT' && !(error instanceof SyntaxError)) throw error;
      }
    }
    return null;
  }
  async function writeSaveFile(incoming) {
    if (!saveFilePath) return;
    const op = saveOp.then(async () => {
      await mkdir(saveDir, { recursive: true });
      const prev = await readSaveFile();
      const merged = {
        format: 'litchi-save',
        version: 1,
        updatedAt: typeof incoming.updatedAt==='string' ? incoming.updatedAt : new Date().toISOString(),
        storage: typeof incoming.storage==='object' && incoming.storage ? incoming.storage : (prev?.storage ?? {}),
        friends: Array.isArray(incoming.friends) ? incoming.friends : (Array.isArray(prev?.friends) ? prev.friends : []),
      };
      await writeFile(saveTmpPath, JSON.stringify(merged, null, 2), 'utf8');
      await rename(saveTmpPath, saveFilePath);
    });
    saveOp = op.catch(() => {});
    return op;
  }

  const sameLocalOrigin = req=>{
    const origin = req.headers.origin;
    if (!origin) return true;
    const bound = server.address();
    const port = typeof bound==='object'&&bound ? bound.port : '';
    return origin===`http://127.0.0.1:${port}` || origin===`http://localhost:${port}`;
  };
  const localJson = (res,status,data)=>{
    res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
    res.end(JSON.stringify(data));
  };
  const hostInfo = ()=>({
    app:'szu-litchi-loop',version,
    hosting:Boolean(hostServer),
    port:hostPort,
    localOrigin:hostPort?`http://127.0.0.1:${hostPort}`:null,
    addresses:hostPort?listHostAddresses(hostPort):[],
  });

  function startHost() {
    hostOp = hostOp.then(async ()=>{
      if (closing) throw new RoomError('游戏正在退出。',503);
      if (hostServer) return {ok:true,...hostInfo()};
      const srv = createRideServer({page,assets,soundDir,iceServers,turn});
      const port = await listenWithFallback(srv,roomHost,roomPort,allowPortFallback);
      hostServer = srv;
      hostPort = port;
      return {ok:true,...hostInfo()};
    });
    const current = hostOp;
    hostOp = hostOp.catch(()=>{});
    return current;
  }

  function stopHost() {
    hostOp = hostOp.then(async ()=>{
      const srv = hostServer;
      hostServer = null;
      hostPort = null;
      if (srv) {
        srv.closeAllConnections?.();
        await new Promise(resolve=>srv.close(()=>resolve()));
      }
      return {ok:true,...hostInfo()};
    });
    const current = hostOp;
    hostOp = hostOp.catch(()=>{});
    return current;
  }

  async function shutdown() {
    if (closing) return;
    closing = true;
    clearTimeout(bootTimer);
    clearTimeout(shutdownTimer);
    clearInterval(heartbeat);
    for (const stream of clients) stream.end();
    clients.clear();
    await stopHost();
    await saveOp;
    server.closeAllConnections?.();
    await new Promise(resolve=>server.close(()=>resolve()));
    onShutdown?.();
  }

  const heartbeat = setInterval(()=>{
    for (const stream of clients) {
      if (stream.writableLength>65_536) stream.destroy();
      else stream.write(': ping\n\n');
    }
  },10_000).unref();

  if (bootTimeoutMs>0) bootTimer = setTimeout(()=>{ if (!clients.size) void shutdown(); },bootTimeoutMs).unref();

  const server = createServer(async (req,res)=>{
    try {
      const {pathname} = new URL(req.url,'http://127.0.0.1');
      if (serveStatic(req,res,staticFiles,pathname)) return;
      if (pathname.startsWith('/sound/') && await serveSound(req,res,soundDir,pathname)) return;
      if (req.method==='GET' && pathname==='/app/status') {
        localJson(res,200,hostInfo());
        return;
      }
      if (req.method==='GET' && pathname==='/app/keepalive') {
        clearTimeout(bootTimer);
        clearTimeout(shutdownTimer);
        res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'});
        res.flushHeaders();
        res.write('retry: 1000\n\n');
        clients.add(res);
        res.on('close',()=>{
          clients.delete(res);
          if (!closing && clients.size===0 && idleMs>0) {
            clearTimeout(shutdownTimer);
            shutdownTimer = setTimeout(()=>{ if (clients.size===0) void shutdown(); },idleMs).unref();
          }
        });
        return;
      }
      if (req.method==='POST' && (pathname==='/app/host/start' || pathname==='/app/host/stop')) {
        if (!sameLocalOrigin(req)) throw new RoomError('仅允许本机游戏页面操作。',403);
        const result = pathname==='/app/host/start' ? await startHost() : await stopHost();
        localJson(res,200,result);
        return;
      }
      if (req.method==='GET' && pathname==='/app/save') {
        const data = await readSaveFile();
        localJson(res,200,{exists:Boolean(data),data});
        return;
      }
      if (req.method==='POST' && pathname==='/app/save') {
        if (!sameLocalOrigin(req)) throw new RoomError('仅允许本机游戏页面操作。',403);
        const chunks = [];
        let bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes>10_000_000) throw new RoomError('存档过大。',413);
          chunks.push(chunk);
        }
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { throw new RoomError('存档格式错误。',400); }
        if (!validSave(body)) throw new RoomError('存档格式或版本不兼容。',400);
        await writeSaveFile(body);
        localJson(res,200,{ok:true});
        return;
      }
      throw new RoomError('找不到此页面。',404);
    } catch (error) {
      if (error instanceof RoomError) { if (!res.destroyed) localJson(res,error.status,{error:error.message}); }
      else { console.error(error); if (!res.destroyed) localJson(res,500,{error:'本地联机控制失败。'}); }
    }
  });
  server.on('close',()=>{clearTimeout(bootTimer);clearTimeout(shutdownTimer);clearInterval(heartbeat);});
  return {server,startHost,stopHost,shutdown,hostInfo};
}

async function findRunningApp(startPort,version) {
  for (let port=startPort; port<=startPort+12; port++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/app/status`,{signal:AbortSignal.timeout(400)});
      if (response.ok) {
        const data = await response.json().catch(()=>null);
        if (data?.app==='szu-litchi-loop' && (data.version??null)===version) return `http://127.0.0.1:${port}/`;
      }
    } catch {}
  }
  return null;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url) {
  let page, assets, soundDir, saveDir, previousSaveFile;
  if (process.env.RIDE_HTML) {
    page = await readFile(process.env.RIDE_HTML);
  } else {
    assets = await loadStaticAssets(new URL('./',import.meta.url)).catch(error=>{
      if (error.code!=='ENOENT') throw error;
      return null;
    });
    if (assets) {
      soundDir = fileURLToPath(new URL('./sound',import.meta.url));
      saveDir = fileURLToPath(new URL('./save',import.meta.url));
      previousSaveFile = [
        new URL('../forzero-budget-2.5.0/save/player-data.json',import.meta.url),
        new URL('../forzero-budget-2.4.0/save/player-data.json',import.meta.url),
        new URL('../forzero-budget-2.3.4/save/player-data.json',import.meta.url),
        new URL('../forzero-budget-2.3.3.1/save/player-data.json',import.meta.url),
        new URL('../forzero-budget-2.3.3/save/player-data.json',import.meta.url),
        new URL('../forzero-budget-2.3.2/save/player-data.json',import.meta.url),
        new URL('../forzero-budget-2.3.1/save/player-data.json',import.meta.url),
        new URL('../forzero-budget-2.1.0/save/player-data.json',import.meta.url),
        new URL('../forzero-budget-2.0.0/save/player-data.json',import.meta.url),
        new URL('../forzero-budget-1.9.1.1/save/player-data.json',import.meta.url),
        new URL('../forzero-budget-1.9.1/save/player-data.json',import.meta.url),
        new URL('../forzero-budget-1.9.0/save/player-data.json',import.meta.url),
        new URL('../forzero-budget-1.8.8/save/player-data.json',import.meta.url),
        new URL('../forzero-budget-1.8.7/save/player-data.json',import.meta.url),
        new URL('../forzero-budget-1.8.6/save/player-data.json',import.meta.url),
        new URL('../forzero-budget-1.8.5/save/player-data.json',import.meta.url),
        new URL('../forzero-budget-1.8.1/save/player-data.json',import.meta.url),
        ...['1.8.0','1.7.0','1.6.6','1.6.5','1.6.4','1.6.3','1.6.2','1.6.1','1.6.0','1.5.0'].map(version=>
          new URL('../szu-litchi-loop-'+version+'/save/player-data.json',import.meta.url))
      ];
    } else {
      assets = await loadStaticAssets(new URL('../ride-update/release/',import.meta.url));
      soundDir = fileURLToPath(new URL('../ride-update/release/sound',import.meta.url));
      saveDir = fileURLToPath(new URL('../ride-update/release/save',import.meta.url));
    }
  }
  const iceServers = process.env.RIDE_ICE_SERVERS ? JSON.parse(process.env.RIDE_ICE_SERVERS) : undefined;
  const turn = process.env.RIDE_TURN_URLS && process.env.RIDE_TURN_SECRET ?
    {urls:process.env.RIDE_TURN_URLS.split(',').map(url=>url.trim()).filter(Boolean),secret:process.env.RIDE_TURN_SECRET} : undefined;
  const host = process.env.HOST ?? '0.0.0.0';
  const requestedPort = Number(process.env.PORT ?? 8787);
  const version = gameVersion(page,assets);

  if (process.argv.includes('--app')) {
    const appStartPort = Number(process.env.APP_PORT ?? 18787);
    const existing = await findRunningApp(appStartPort,version);
    if (existing) {
      if (process.argv.includes('--open') || process.env.RIDE_OPEN==='1') openBrowser(existing);
      process.exit(0);
    }
    const idleMs = Number(process.env.RIDE_IDLE_MS ?? 8000);
    const shell = createAppShell({
      page,assets,soundDir,saveDir,previousSaveFile,iceServers,turn,roomPort:requestedPort,roomHost:host,allowPortFallback:!process.env.PORT,
      idleMs,onShutdown:()=>process.exit(0),
    });
    const appPort = await listenWithFallback(shell.server,'127.0.0.1',appStartPort,!process.env.APP_PORT);
    const localUrl = `http://127.0.0.1:${appPort}/`;
    if (process.argv.includes('--open') || process.env.RIDE_OPEN==='1') openBrowser(localUrl);
  } else {
    const server = createRideServer({page,assets,soundDir,iceServers,turn});
    const port = await listenWithFallback(server,host,requestedPort,!process.env.PORT);
    const localUrl = `http://127.0.0.1:${port}/`;
    console.log(`\nFORZERO: BUDGET（有限竞速：地贫线）${version?' '+version:''} 房主联机服务已启动（端口 ${port}）`);
    console.log(`本机游戏入口：${localUrl}`);
    const addresses = listHostAddresses(port);
    if (addresses.length) {
      console.log('\n好友可在本地游戏「联机 → 房主地址」填入以下 IP，或直接用浏览器访问：');
      for (const item of addresses) console.log(`  [${item.label} · ${item.name}] ${item.address}:${item.port}  (${item.url}/)`);
    } else {
      console.log('\n未检测到局域网/虚拟局域网 IPv4，请检查网络连接或 Radmin VPN。');
    }
    console.log('\n提示：首次运行若弹出 Windows 防火墙提示，请勾选允许访问。关闭本窗口即停止房主服务。\n');
    if (process.argv.includes('--open') || process.env.RIDE_OPEN==='1') openBrowser(localUrl);
  }
}
