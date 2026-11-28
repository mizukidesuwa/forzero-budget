import { TAU, add, headingVector } from '../core/math.js';
import { getLanguage, message, translate } from './language.js';
import { getActiveCampus, getPreferences, worldState } from '../core/state.js';
import { districtChaseRules } from '../data/modes.js';
import { CampusCourier } from '../race/courier.js';
import { replayAt } from '../replay/ghost.js';
import { mapReplay } from '../replay/map-replay.js';
import { along, citySolid, courseFrame, footprintCorners, lotPart, offsetVertex, treeSites } from '../world/geometry.js';
import {
  mountainRoads, parkBounds, parkEdgesList, parkFrames, parkPavilion, parkTower,
  pavilionWalk, shundeHighRiskShortcuts,
} from '../world/maps/shunde.js';
import {
  athleticsField, bank, basins, campus, campusBoundary, campusGates, campusLanes,
  campusOutlines, canghaiGates, cityExtent, cityRoads, clay, courts, dujuanHill,
  huidian, inCampus, laneColors, ovalPoint, parkOutline, parkWalks, parkX, parkZ,
  perimeterLots, roads, yuehaiSportsPlaza,
} from '../world/maps/szu.js';
import {
  ioe, londonGardens, londonNorth, londonPaths, londonPlaces,
  senateHouse, tubeStops, uclBounds, uclBuildings, uclLandmarks,
  uclQuad, uclWays,
} from '../world/maps/ucl.js';
import { campuses } from '../world/scene-builder.js';

export const mapCache = new WeakMap();
let showMapComparison = true;

export function getShowMapComparison() {
  return showMapComparison;
}

export function setShowMapComparison(value) {
  showMapComparison = Boolean(value);
  return showMapComparison;
}

export function drawHillContours(ctx,project,compact) {
  for(const height of [1,2.5,4.0]) {
    const r=Math.sqrt(1-Math.sqrt(height/dujuanHill.height));
    const {x,z,rx,rz}=dujuanHill;
    const points=Array.from({length:40},(_,i)=>[x+rx*r*Math.cos(i*TAU/40),0,z+rz*r*Math.sin(i*TAU/40)]);
    mapPath(ctx,project,points,true);
    ctx.lineWidth=.8;
    ctx.strokeStyle=compact?'#c2ce9b5a':'#747f4f8a';
    ctx.stroke();
  }
}

export const mapExtent = {minX:-232,maxX:366,minZ:-269,maxZ:287};

export function mapPath(ctx, project, points, close = false) {
  ctx.beginPath();
  points.forEach((p, index) => {
    const [x,y] = project(p);
    if (index) ctx.lineTo(x,y);
    else ctx.moveTo(x,y);
  });
  if (close) ctx.closePath();
}

export function drawCourseMap(ctx,project,compact,event) {
  const solid=event.path.rows.filter(r=>r.distance<event.length).map(r=>r.p);
  solid.push(event.gates.at(-1).p);
  mapPath(ctx,project,solid);
  ctx.strokeStyle = compact ? '#162c23b8' : '#39563c';
  ctx.lineWidth = compact ? 3.70 : 6.45;
  ctx.stroke();
  ctx.lineWidth = compact ? 1.55 : 2.98;
  if(event.stages) {
    for(const stage of event.stages) {
      const points=[along(event.path,stage.from),...event.path.rows
        .filter(row=>row.distance>stage.from&&row.distance<stage.to).map(row=>row.p),along(event.path,stage.to)];
      mapPath(ctx,project,points);
      ctx.strokeStyle=stage.color;
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = event.campus==='ucl'?'#dcc8f3':compact?'#d6e697':'#edeeac';
    ctx.stroke();
  }
  if (!compact && event.shortcut) {
    ctx.save();
    mapPath(ctx, project, event.shortcut.path.rows.map(row => row.p));
    ctx.setLineDash([3.4, 2.5]);
    ctx.strokeStyle = '#8c683a';
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.restore();
  }
  if (!compact) {
    for (let d = 13; d < event.length-7; d += event.stages?79:33) {
      const p = courseFrame(event.path,d);
      const [x,y] = project(p.p);
      ctx.save();
      ctx.translate(x,y);
      ctx.rotate(Math.atan2(p.f[2],p.f[0]));
      ctx.beginPath();
      ctx.moveTo(-3,-3); ctx.lineTo(2,0); ctx.lineTo(-3,3);
      ctx.strokeStyle = '#2a4e39';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
  }
}


export function travelPin(ctx,project,campus,compact) {
  const [x,y]=project(campuses[campus].arrival), radius=compact?3.2:5.4;
  ctx.beginPath();
  ctx.arc(x,y,radius,0,TAU);
  ctx.fillStyle='#9fd9de';
  ctx.strokeStyle='#183b42';
  ctx.lineWidth=1.5;
  ctx.fill();
  ctx.stroke();
  if(!compact) {
    ctx.font='700 10px "Microsoft YaHei", sans-serif';
    ctx.textAlign='center';
    ctx.lineWidth=2.8;
    ctx.strokeStyle='#e8eee4';
    ctx.fillStyle='#18454c';
    const station = translate(campuses[campus].station);
    ctx.strokeText(station,x,y+12);
    ctx.fillText(station,x,y+12);
  }
}

export function uclChart(width,height,dpr,compact,event,focus,exploring,cityView) {
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(width*dpr));
  canvas.height=Math.max(1,Math.round(height*dpr));
  const ctx=canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle=compact?'#293137':'#e5dfd2';
  ctx.fillRect(0,0,width,height);
  const c=Math.cos(londonNorth),s=Math.sin(londonNorth);
  const turn=(x,z)=>[c*x+s*z,c*z-s*x];
  const frame=focus?event.extent:uclBounds;
  const corners=[[frame.minX,frame.minZ],[frame.minX,frame.maxZ],
    [frame.maxX,frame.minZ],[frame.maxX,frame.maxZ]].map(([x,z])=>turn(x,z));
  const minX=Math.min(...corners.map(p=>p[0])),maxX=Math.max(...corners.map(p=>p[0]));
  const minY=Math.min(...corners.map(p=>p[1])),maxY=Math.max(...corners.map(p=>p[1]));
  const pad=compact?6:focus?30:16;
  const fit=Math.max(.01,Math.min((width-2*pad)/(maxX-minX),(height-2*pad)/(maxY-minY)));
  const left=(width-(maxX-minX)*fit)/2,top=(height-(maxY-minY)*fit)/2;
  const project=([x,,z])=>{
    const [u,v]=turn(x,z);
    return [left+(u-minX)*fit,top+(v-minY)*fit];
  };
  const unproject=(x,y)=>{
    const u=minX+(x-left)/fit,v=minY+(y-top)/fit;
    return [c*u-s*v,s*u+c*v];
  };
  const plot=(outline)=>mapPath(ctx,project,outline.map(([x,z])=>[x,0,z]),true);
  plot([[uclBounds.minX,uclBounds.minZ],[uclBounds.minX,uclBounds.maxZ],
    [uclBounds.maxX,uclBounds.maxZ],[uclBounds.maxX,uclBounds.minZ]]);
  ctx.fillStyle=compact?'#3e4749':'#dbd3c1';
  ctx.fill();
  for(const {outline} of londonGardens) {
    plot(outline);
    ctx.fillStyle=compact?'#738c70':'#a4b486';
    ctx.fill();
  }
  mapPath(ctx,project,footprintCorners(uclQuad),true);
  ctx.fillStyle=compact?'#989188':'#cbb69f';
  ctx.fill();
  ctx.lineJoin=ctx.lineCap='round';
  for(const {id,path} of uclWays) {
    mapPath(ctx,project,path.rows.map(row=>row.p));
    ctx.strokeStyle=londonPaths.has(id)?(compact?'#7e8b88':'#b9a899'):(compact?'#8c9896':'#f8f5ec');
    ctx.lineWidth=Math.max(compact?1.0:1.35,(path.width*2+1.7)*fit);
    ctx.stroke();
  }
  const buildingColors={
    wilkins:'#c5a988',cruciform:'#a86d60',hospital:'#72949b',ioe:'#8998b1',
    senate:'#a08066',soas:'#9c95a4',student:'#a68a65',shop:'#b78c67',
    'russell-tube':'#9c5755','warren-tube':'#a59d8c'
  };
  for(const lot of uclBuildings) {
    for(const part of lot.parts??[lot]) {
      mapPath(ctx,project,footprintCorners(part),true);
      ctx.fillStyle=buildingColors[lot.style]??(compact?'#656b69':'#b1a597');
      ctx.strokeStyle=compact?'#e9dfce28':'#f4ebda';
      ctx.lineWidth=.55;
      ctx.fill();ctx.stroke();
    }
  }
  if(!exploring||focus) drawCourseMap(ctx,project,compact,event);
  const reserved=[];
  const [pinX,pinY]=project(campuses.ucl.arrival);
  reserved.push([pinX-14,pinY-10,pinX+14,pinY+10]);
  const label=(name,x,z,rotation,color,size,large=false)=>{
    const [px,py]=project([x,0,z]);
    ctx.font=(large?'700 ':'600 ')+size+'px system-ui,sans-serif';
    const caption=translate(name);
    const length=ctx.measureText(caption).width+5, heightOfText=size+4;
    const dx=(Math.abs(Math.cos(rotation))*length+Math.abs(Math.sin(rotation))*heightOfText)/2;
    const dy=(Math.abs(Math.sin(rotation))*length+Math.abs(Math.cos(rotation))*heightOfText)/2;
    const offsets=compact?[[0,0],[0,-12],[0,12]]:
      [[0,0],[0,-15],[0,16],[0,-30],[0,30],[-23,-17],[23,17]];
    for(const [ox,oy] of offsets) {
      const x0=px+ox,y0=py+oy,bounds=[x0-dx,y0-dy,x0+dx,y0+dy];
      const [left,top,right,bottom]=bounds;
      if(left<7||right>width-7||top<7||bottom>height-7||
        reserved.some(([a,b,c,d])=>left<c&&right>a&&top<d&&bottom>b)) continue;
      reserved.push(bounds);
      if(!compact&&Math.hypot(ox,oy)>16) {
        ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(x0,y0);
        ctx.lineWidth=.8;ctx.strokeStyle='#82776888';ctx.stroke();
      }
      ctx.save();ctx.translate(x0,y0);ctx.rotate(rotation);
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.lineWidth=2.5;ctx.strokeStyle=compact?'#333d41':'#ede8dc';ctx.fillStyle=color;
      ctx.strokeText(caption,0,0);ctx.fillText(caption,0,0);ctx.restore();
      break;
    }
  };
  if(!compact) {
    const roads=[
      ['Euston Road',47,-147,0],['Gower Street',1,114,Math.PI/2],
      ['Gordon Street',124,-24,Math.PI/2],['Torrington Place',-62,181,0],
      ['Malet Street',64,362,Math.PI/2],['Bedford Way',259,253,Math.PI/2],
      ['Torrington Square',124,223,Math.PI/2],['Woburn Place',337,219,Math.PI/2],
      ['Montague Place',130,514,0],['Tottenham Court Rd',-166,101,Math.PI/2],
      ['Bernard Street',405,380,0]
    ];
    label('UCL · Main Quad',uclQuad.x,uclQuad.z,0,'#382c48',12,true);
    label('UoL · Senate House',senateHouse.x,senateHouse.z,0,'#382c48',12,true);
    label('IOE · 20 Bedford Way',ioe.x,ioe.z,0,'#382c48',12,true);
    for(const place of tubeStops) label(place.name,place.x,place.z+18,0,'#245176',10,true);
    for(const {name,x,z} of uclLandmarks) {
      if(['UCL · Main Quad',senateHouse.name,ioe.name].includes(name)) continue;
      label(name,x,z,0,'#364640',10);
    }
    label('旅行站',campuses.ucl.arrival[0]-14,campuses.ucl.arrival[2]-10,0,'#20515d',9);
    for(const [name,x,z,rotation] of roads) label(name,x,z,rotation-londonNorth,'#625953',9);
    if(exploring&&!focus) for(const place of londonPlaces) {
      if(place.kind==='shop') label(place.name,place.x,place.z,0,'#714c32',9);
    }
    ctx.font='700 11px system-ui,sans-serif';
    ctx.fillStyle='#413e3a';ctx.textAlign='center';
    ctx.fillText(translate('北 ↑'),width-25,20);
  } else if(exploring) {
    label('UCL',uclQuad.x,uclQuad.z,0,'#f0e2c9',8,true);
    label('UoL',senateHouse.x,senateHouse.z,0,'#f0e2c9',8,true);
    label('IOE',ioe.x,ioe.z,0,'#dde2f2',8,true);
  }
  for(const place of londonPlaces) {
    if((compact||!exploring||focus)&&place.kind!=='tube') continue;
    const [x,y]=project([place.x,0,place.z]);
    if(x<4||x>width-4||y<4||y>height-4) continue;
    if(place.kind==='tube') {
      const r=compact?2.44:4.5;
      ctx.beginPath();ctx.arc(x,y,r,0,TAU);
      ctx.fillStyle='#f6f0e5';ctx.fill();ctx.lineWidth=compact?1.12:1.7;
      ctx.strokeStyle='#bb3440';ctx.stroke();
      ctx.fillStyle='#2c426e';ctx.fillRect(x-r-1,y-.78,2*r+2,1.56);
    } else {
      ctx.fillStyle=place.kind==='bus'?'#a93846':'#906540';
      ctx.fillRect(x-2.1,y-2.1,4.2,4.2);
    }
  }
  travelPin(ctx,project,'ucl',true);
  return {canvas,project,unproject,width,height,dpr,event,focus,exploring,cityView};
}

export function parkChart(width,height,dpr,compact,event,focus,exploring,cityView) {
  const canvas=document.createElement('canvas');canvas.width=width*dpr;canvas.height=height*dpr;
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
  const pad=compact?8:24;
  const {minX,maxX,minZ,maxZ}=focus?event.extent:parkBounds;
  const centerX=(minX+maxX)/2,centerZ=(minZ+maxZ)/2;
  const k=Math.min((width-2*pad)/(maxX-minX+18),(height-2*pad)/(maxZ-minZ+18));
  const project=([x,,z])=>[width/2+(x-centerX)*k,height/2+(z-centerZ)*k];
  const unproject=(x,y)=>[(x-width/2)/k+centerX,(y-height/2)/k+centerZ];
  const path=(points,closed=true)=>{ctx.beginPath();points.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](...project(p)));if(closed) ctx.closePath();};
  ctx.fillStyle='#304f40';ctx.fillRect(0,0,width,height);
  path(parkEdgesList.map(e=>e.bank));ctx.fillStyle='#477e77';ctx.fill();
  const channel=parkFrames.map((f,i)=>[f,parkEdgesList[i]]).filter(([,e])=>e.crossing>0);
  path([...channel.map(([,e])=>e.bank),...channel.reverse().map(([f,e])=>offsetVertex(f,e.outerWater,0))]);ctx.fill();
  path(parkFrames.map(f=>f.p));ctx.strokeStyle='#e2d5ab';ctx.lineWidth=compact?1.7:3.4;ctx.stroke();
  path(pavilionWalk.rows.map(r=>r.p),false);ctx.strokeStyle='#e2bc89';ctx.lineWidth=compact?1.2:2.2;ctx.stroke();
  for(const [lane,tone] of [[mountainRoads[0],'#e8aa6d'],[mountainRoads[1],'#92cfd0']]) {
    path(lane.path.rows.map(r=>r.p),false);ctx.strokeStyle=tone;ctx.stroke();
  }
  if(!compact) {
    ctx.save();
    ctx.setLineDash([4,4]);ctx.lineWidth=1.8;ctx.strokeStyle='#ff9a52';
    for(const cut of shundeHighRiskShortcuts) {
      path(cut.points.map(([x,z])=>[x,0,z]),false);ctx.stroke();
    }
    ctx.restore();
  }
  if(!exploring||focus) {
    path(event.path.rows.map(r=>r.p),false);ctx.strokeStyle='#fff0b0';ctx.lineWidth=compact?2:4.4;ctx.stroke();
  }
  travelPin(ctx,project,'shunde',compact);
  if(!compact) {
    ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.fillStyle='#eafaec';
    for(const [x,z,label] of [[-104,58,'桂海芳丛'],[-28,175,'青云湖'],[153,186,'伏波桥'],[...parkTower,'青云塔'],[...parkPavilion,'湖心亭'],
      [322,150,'上山 · 林荫折返'],[311,-28,'下山 · 碎石连弯'],[430,103,'神步山观景台']]) {
      const [sx,sy]=project([x,0,z]);ctx.fillText(translate(label),sx,sy-9);
    }
  }
  return {canvas,width,height,dpr,event,focus,exploring,cityView,project,unproject};
}

export function drawReplayPins(ctx,project,race,compact) {
  if(compact||!mapReplay.run||mapReplay.run!==race.lastRun||race.phase!=='done') return false;
  const run=race.lastRun, ref=run.comparison??race.reference;
  mapPin(ctx,project,replayAt(ref,Math.min(mapReplay.time,ref.time)),false,true);
  mapPin(ctx,project,replayAt(run,Math.min(mapReplay.time,run.time)),false);
  return true;
}

export function drawComparisonTraces(ctx, project, race, compact) {
  if (compact || !showMapComparison || !race.lastRun?.samples?.length) return;
  const drawPolyline = (samples, fromTime, toTime, color, width, dash = []) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(dash);
    ctx.beginPath();
    let prev = null;
    for (const sample of samples) {
      if (sample[0] < fromTime - 1 || sample[0] > toTime + 1) continue;
      if (prev && Math.hypot(sample[1] - prev[1], sample[3] - prev[3]) > 15) {
        ctx.stroke();
        ctx.beginPath();
        prev = null;
      }
      const [x, y] = project([sample[1], 0, sample[3]]);
      if (!prev) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      prev = sample;
    }
    ctx.stroke();
    ctx.restore();
  };

  const ref=race.lastRun.comparison??race.reference;
  if (ref?.samples?.length) {
    drawPolyline(ref.samples, 0, ref.time + 1, 'rgba(126, 224, 232, 0.78)', 2.4, [6, 5]);
  }
  const splits = race.lastRun.splits ?? [];
  const refSplits = ref?.splits ?? [];
  let startMs = 0;
  for (let i = 0; i < splits.length; i++) {
    const endMs = splits[i];
    const dur = endMs - startMs;
    const refDur = refSplits[i] !== undefined ? refSplits[i] - (refSplits[i - 1] ?? 0) : null;
    const color = refDur === null || Math.abs(dur - refDur) < 25 ? '#f5b85b' : dur < refDur ? '#7ef089' : '#ff8c69';
    drawPolyline(race.lastRun.samples, startMs, endMs, color, 3.1);
    startMs = endMs;
  }
}

export function campusChart(width,height,dpr,compact,event,focus,exploring,cityView) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const pad = compact ? 7 : 21;
  const bounds = cityView ? cityExtent : focus ? {
    minX:event.extent.minX-37,maxX:event.extent.maxX+37,
    minZ:event.extent.minZ-41,maxZ:event.extent.maxZ+41
  } : !exploring&&event.cityAccess ? {
    minX:Math.min(mapExtent.minX,event.extent.minX-22),maxX:Math.max(mapExtent.maxX,event.extent.maxX+22),
    minZ:Math.min(mapExtent.minZ,event.extent.minZ-22),maxZ:Math.max(mapExtent.maxZ,event.extent.maxZ+22)
  } : mapExtent;
  const w=bounds.maxX-bounds.minX,h=bounds.maxZ-bounds.minZ;
  const fit = Math.max(.02, Math.min((width - pad * 2) / w, (height - pad * 2) / h));
  const left = (width - w * fit) * .5, top = (height - h * fit) * .5;
  const project=p=>[left+(p[0]-bounds.minX)*fit,top+(p[2]-bounds.minZ)*fit];
  const unproject=(x,y)=>[bounds.minX+(x-left)/fit,bounds.minZ+(y-top)/fit];
  const campusColor = compact ? '#344442' : '#c0c6b7';
  ctx.fillStyle = campusColor;
  ctx.fillRect(0,0,width,height);
  ctx.lineWidth = 1;
  ctx.strokeStyle = compact ? '#b7ceaf1c' : '#79886630';
  const step = (compact ? 23 : 10) * fit;
  for (let x = left; x < width; x += step) {
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,height); ctx.stroke();
  }
  for (let y = top; y < height; y += step) {
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(width,y); ctx.stroke();
  }
  const {minX,maxX,minZ,maxZ}=campusBoundary;
  for(const outline of campusOutlines) {
    mapPath(ctx,project,outline.map(([x,z])=>[x,0,z]),true);
    ctx.fillStyle=compact?'#395747':'#adbf94';
    ctx.fill();
    ctx.strokeStyle=compact?'#89ab8a79':'#728767';
    ctx.lineWidth=compact?1.2:2.15;
    ctx.stroke();
  }
  ctx.lineJoin=ctx.lineCap='round';
  mapPath(ctx,project,parkOutline.map(([x,z])=>[x,0,z]),true);
  ctx.fillStyle=compact?'#5e804e':'#96b782';ctx.fill();
  for(const path of parkWalks) {
    mapPath(ctx,project,path.rows.map(r=>r.p));
    ctx.lineWidth=Math.max(.7,path.width*2*fit);ctx.strokeStyle='#d9cfb6';ctx.stroke();
  }
  for(const b of citySolid) {
    if(b.kind!=='frontage'&&b.kind!=='tower') continue;
    const [px,py]=project([b.x-b.w/2,0,b.z-b.d/2]);
    ctx.fillStyle=compact?'#6c7977':b.kind==='frontage'?'#9caaa5':'#aab2ac';
    ctx.fillRect(px,py,b.w*fit,b.d*fit);
  }
  for(const path of cityRoads.keys()) {
    mapPath(ctx,project,path.rows.map(r=>r.p));
    ctx.strokeStyle=compact?'#83918d':'#7c9291';
    ctx.lineWidth=Math.max(2,path.width*2*fit);ctx.stroke();
    ctx.strokeStyle=compact?'#b7bfaa45':'#c3cabc';
    ctx.lineWidth=compact?.58:1.25;ctx.stroke();
  }
  for (const tree of treeSites) {
    if (tree.x < minX+1 || tree.x > maxX-1 || tree.z < minZ+1 || tree.z > maxZ-1) continue;
    const [x,y] = project([tree.x,0,tree.z]);
    ctx.beginPath(); ctx.arc(x,y,Math.max(1,tree.r*fit*.79),0,TAU);
    ctx.fillStyle = compact ? '#82a67835' : ['#7d9c6b99','#92a4739e','#8da47b95'][tree.color];
    ctx.fill();
  }
  for (const basin of basins) {
    mapPath(ctx,project,Array.from({length:92},(_,i)=>bank(basin,TAU*i/92)),true);
    ctx.fillStyle=compact?'#427369':'#61928c';ctx.fill();
    ctx.strokeStyle=compact?'#82a798ad':'#e0e7c9';ctx.lineWidth=compact?.75:1.45;ctx.stroke();
  }

  drawHillContours(ctx,project,compact);
  ctx.lineJoin = ctx.lineCap = 'round';
  for (const street of roads) {
    mapPath(ctx,project,street.rows.map(item => item.p));
    ctx.strokeStyle = compact ? '#a6b99979' : laneColors.get(street) ?? '#e8dfc0';
    ctx.lineWidth = Math.max(1.2, (2 * street.width + 1.1) * fit);
    ctx.stroke();
  }
  mapPath(ctx,project,footprintCorners(yuehaiSportsPlaza),true);
  ctx.fillStyle=compact?'#a77963':'#b67656';ctx.fill();
  for(const offset of [-6.35,6.35]) {
    mapPath(ctx,project,footprintCorners(lotPart(yuehaiSportsPlaza,offset,0,10,21.5,0)),true);
    ctx.fillStyle=compact?'#52694e':'#80a196';ctx.fill();
  }
  const oval = (width,length,y) => Array.from({length:50},(_,i)=>
    ovalPoint(athleticsField,(i<25?0:-Math.PI)+.00001+(Math.PI-.00002)*(i%25)/24,width,length,y));
  mapPath(ctx,project,oval(athleticsField.w,athleticsField.depth,0),true);
  ctx.fillStyle=compact?'#a77963':'#b67656';ctx.fill();
  mapPath(ctx,project,oval(athleticsField.w-5.8,athleticsField.depth-5.8,0),true);
  ctx.fillStyle=compact?'#52694e':'#95aa75';ctx.fill();
  if (exploring&&cityView) travelPin(ctx,project,'szu',compact);
  if (!exploring || focus) drawCourseMap(ctx,project,compact,event);

  const labelBuildings=width>=294&&height>=229;
  const labels=[];
  const fontSize = Math.min(13, Math.max(10, fit * 4.8));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for(const block of campus) {
    ctx.fillStyle = compact ? '#b5c0a973' : (block.palette === clay ? '#ac8068' : '#879589');
    ctx.strokeStyle = compact ? '#d9e2c32d' : '#fff1cc9e';
    ctx.lineWidth=.85;
    for(const foot of block.parts??[block]) {
      mapPath(ctx,project,footprintCorners(foot),true);
      ctx.fill();ctx.stroke();
    }
    if(!compact && block===huidian) {
      mapPath(ctx,project,footprintCorners(lotPart(block,0,0,5.3,3.35,0)),true);
      ctx.fillStyle='#bdc7b5';ctx.fill();ctx.stroke();
    }
    const wing = block.kind==='huiwen' || block.kind==='huizi';
    if(!compact&&labelBuildings&&block.name&&(!wing||focus||fit>1.42||block.priority>=10)) {
      const [x,y]=project([block.x,0,block.z]);
      const name=wing?(focus||fit>1.42 ?
        (block.kind==='huiwen'?'H'+block.wing:message`${block.wing} 座`) :
        (block.kind==='huiwen'?'汇文楼':'汇紫楼')):block.name;
      labels.push({block,x,y,name});
    }
  }
  labels.sort((a,b)=>(b.block.priority??0)-(a.block.priority??0));
  const printed=[];
  ctx.font='600 '+fontSize.toFixed(1)+'px "Microsoft YaHei","PingFang SC",sans-serif';
  for(const {name,x,y} of labels) {
    const caption=translate(name);
    const w=ctx.measureText(caption).width+6;
    if(x-w*.5<4||x+w*.5>width-3||y<14||y>height-17||
      printed.some(p=>Math.abs(p.x-x)<(p.w+w)/2&&Math.abs(p.y-y)<fontSize+3)) continue;
    printed.push({x,y,w});
    ctx.lineWidth=3;ctx.strokeStyle='#eef0cae8';ctx.fillStyle='#2a4136';
    ctx.strokeText(caption,x,y);ctx.fillText(caption,x,y);
  }
  ctx.fillStyle=compact?'#dfeadb':'#fff6da';
  ctx.font='600 '+(compact?8:11)+'px "Microsoft YaHei","PingFang SC",sans-serif';
  if (compact) {
    const [x,y]=project([-67,0,135]);
    ctx.fillText(translate('文山湖'),x,y);
  } else {
    for(const b of basins.slice(0,2)) {
      const [x,y]=project([b.x,0,b.z]);ctx.fillText(translate(b.name),x,y);
    }
  }
  if(!compact) {
    ctx.font='500 10px "Microsoft YaHei",sans-serif';
    const labels=[
      ...courts.filter(c=>['校友广场','时光广场','天人广场'].includes(c.name)).map(c=>[c.name,...c.xy]),
      ['田径运动场',athleticsField.x,athleticsField.z],['杜鹃山',dujuanHill.x,dujuanHill.z-7],
      ...(focus||fit>1.42?[['汇文楼组团',-41,-185],['汇紫楼',54,29]]:[]),
      ...campusLanes.map(lane=>[lane.name,...lane.at])
    ];
    for(const [name,x,z] of labels) {
      const [ax,ay]=project([x,0,z]);
      ctx.fillStyle='#3a5946';ctx.strokeStyle='#dfe8c7';ctx.lineWidth=3;
      ctx.strokeText(translate(name),ax,ay);ctx.fillText(translate(name),ax,ay);
    }
  }
  if(!compact) {
    ctx.font='700 '+(width<400?10:11)+'px "Microsoft YaHei","PingFang SC",sans-serif';
    for(const gate of [...campusGates,...canghaiGates]) {
      const [x,y]=project([gate.xy[0],0,gate.xy[1]]);
      ctx.beginPath();ctx.arc(x,y,2.9,0,TAU);
      ctx.fillStyle='#d8b16b';ctx.fill();
      ctx.strokeStyle='#485a4e';ctx.lineWidth=1.35;ctx.stroke();
      ctx.fillStyle='#334b3d';ctx.strokeStyle='#e3e9cb';ctx.lineWidth=2.8;
      const yOff=gate.name==='立德门'?9:-9;
      ctx.strokeText(translate(gate.name),x,y+yOff);ctx.fillText(translate(gate.name),x,y+yOff);
    }
    for(const [name,x,z] of [['荔香公园',parkX,parkZ],...perimeterLots.filter(l=>l.name).map(l=>[l.name,l.x,l.z]),['南海大道',-142,25],['深南大道',-11,-244],['白石路',157,177],['粤海南区',297,256]]) {
      const [px,py]=project([x,0,z]);
      ctx.fillStyle='#304b41';ctx.strokeStyle='#e5e9cd';ctx.lineWidth=2.8;
      ctx.strokeText(translate(name),px,py);ctx.fillText(translate(name),px,py);
    }
    const x = width - 21, y = 28;
    ctx.fillStyle = '#324f3e'; ctx.strokeStyle = '#f1efca';
    ctx.beginPath(); ctx.moveTo(x,y - 9); ctx.lineTo(x - 4,y + 3); ctx.lineTo(x + 4,y + 3); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.font = '600 12px "Microsoft YaHei",sans-serif';
    ctx.fillText(translate('北'),x,y + 12);
    const ruler=fit>1.62?20:50,span=ruler*fit,by=height-15;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#2e4838';
    ctx.fillRect(15,by,span,1.8);
    ctx.fillRect(15,by - 3,1.2,4.8);
    ctx.fillRect(15 + span,by - 3,1.2,4.8);
    ctx.font = '600 11px "Microsoft YaHei",sans-serif';
    ctx.fillText(message`${ruler} 游戏米`,20 + span,by - 1);
  }
  return {width,height,dpr,canvas,project,unproject,event,focus,exploring,cityView};
}

export function mapPin(ctx, project, rider, compact, ghost=false) {
  const [x,y] = project(rider.position);
  const r = compact ? 4.2 : 7.2;
  ctx.save();
  ctx.translate(x,y);
  const [aheadX,aheadY]=project(add(rider.position,headingVector(rider.heading)));
  ctx.rotate(Math.atan2(aheadY-y,aheadX-x)+Math.PI/2);
  ctx.beginPath();
  ctx.moveTo(0,-r*1.48); ctx.lineTo(r*.83,r*.83); ctx.lineTo(0,r*.41); ctx.lineTo(-r*.83,r*.83); ctx.closePath();
  ctx.fillStyle = ghost?'#91dadc':'#f2ad6a';
  ctx.strokeStyle = ghost?'#214b50':'#46372c';
  ctx.lineWidth = compact ? 1.15 : 1.8;
  ctx.fill(); ctx.stroke();
  ctx.restore();
  if (!compact && !ghost) {
    ctx.font = '700 13px "Microsoft YaHei","PingFang SC",sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#253f34';
    ctx.fillStyle = '#fff6da';
    ctx.strokeText(worldState.driverProfile.name,x+10,y+1);
    ctx.fillText(worldState.driverProfile.name,x+10,y+1);
  }
}

function drawDistrictZones(ctx,project,district,compact) {
  const radius = compact ? 6.5 : 10;
  ctx.save();
  ctx.font = `700 ${compact?9:12}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const zone of districtChaseRules.zones) {
    const [x,y] = project([zone.x,0,zone.z]);
    const clue = district.clueId===zone.id;
    ctx.beginPath();
    ctx.arc(x,y,radius,0,TAU);
    ctx.fillStyle = zone.kind==='exit' ? (district.triggered?'#9ce7ad':'#b9bfbb') : '#ffd780';
    ctx.strokeStyle = '#252e2b';
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
    if (clue) {
      ctx.beginPath();
      ctx.arc(x,y,radius+(compact?4:7),0,TAU);
      ctx.strokeStyle = '#ff934b';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    ctx.fillStyle = '#1e2b27';
    ctx.fillText(zone.id,x,y+.4);
  }
  ctx.restore();
}

export function renderCampusMap(element,race,compact,focused=false,overlay=null) {
  const width = element.clientWidth, height = element.clientHeight;
  if (!width || !height) return;
  const dpr=Math.min(2,devicePixelRatio||1),event=race.event;
  const district = overlay?.district;
  const exploring = Boolean(district) || race.phase === 'free';
  if (district) focused = false;
  const outside = getActiveCampus()==='szu'&&!inCampus(race.rider.position[0],race.rider.position[2]);
  const cityView=getActiveCampus()==='szu'&&(exploring&&!compact&&!focused || outside&&(exploring||!event.cityAccess));
  let layout = mapCache.get(element);
  if (!layout || layout.width !== width || layout.height !== height || layout.dpr !== dpr || layout.event!==event ||
      layout.language!==getLanguage() || layout.focus!==focused || layout.exploring!==exploring || layout.cityView!==cityView || layout.campus!==getActiveCampus()) {
    const chart=getActiveCampus()==='shunde'?parkChart:getActiveCampus()==='ucl'?uclChart:campusChart;
    layout=chart(width,height,dpr,compact,event,focused,exploring,cityView);
    layout.campus=getActiveCampus();
    layout.language=getLanguage();
    element.width = layout.canvas.width;
    element.height = layout.canvas.height;
    mapCache.set(element,layout);
  }
  const ctx = element.getContext('2d');
  ctx.setTransform(1,0,0,1,0,0);
  ctx.drawImage(layout.canvas,0,0);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  for(const gate of (exploring || overlay?.hideCourse) && !focused ? [] : event.gates) {
    const [x,y] = layout.project(gate.p);
    const active = race.phase !== 'free' && race.phase !== 'done' && race.nextGate === gate.index;
    const passed = race.phase !== 'free' && race.nextGate > gate.index;
    const terminal = gate.index === 0 || gate.index===event.gates.length-1;
    const r = compact ? (active ? 3.5 : 2.65) : (active ? 9 : 7);
    ctx.beginPath();
    ctx.arc(x,y,r,0,TAU);
    ctx.fillStyle = active ? '#eaf5a1' : passed ? '#6b8b58' : terminal ? '#f2d291' : '#405e49';
    ctx.strokeStyle = compact ? '#b3cbab' : '#eff2d1';
    ctx.lineWidth = active ? 1.75 : 1.3;
    ctx.fill(); ctx.stroke();
    if (!compact) {
      ctx.font = '700 9px "Microsoft YaHei","PingFang SC",sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = active || terminal ? '#294535' : '#f1f4d9';
      ctx.fillText(terminal ? translate(gate.number)[0] : String(gate.index),x,y+.2);
    }
  }
  let replay = false;
  if (district) {
    drawDistrictZones(ctx,layout.project,district,compact);
  } else {
    const shadow=getPreferences().ghost?race.ghost:null;
    drawComparisonTraces(ctx,layout.project,race,compact);
    replay=drawReplayPins(ctx,layout.project,race,compact);
    if(!replay&&shadow&&!worldState.onlineRoom&&!race.rivals?.length) mapPin(ctx,layout.project,shadow,compact,true);
    if(!replay) for(const rival of race.rivals??[]) if(rival.pose) mapPin(ctx,layout.project,rival.pose,compact,true);
    if(getPreferences().ghost&&!worldState.onlineRoom) for (const extra of race.extraGhosts) mapPin(ctx,layout.project,extra,compact,true);
    for (const rider of (worldState.hooks.onlineRiderPoses ?? (() => []))(performance.now())) mapPin(ctx,layout.project,rider,compact,true);
  }
  if(!worldState.onlineRoom&&CampusCourier.active&&CampusCourier.target&&CampusCourier.campus===getActiveCampus()&&race.phase==='free') {
    const [cx,cy]=layout.project(CampusCourier.target.p);
    ctx.beginPath();ctx.arc(cx,cy,compact?4.5:9,0,TAU);
    ctx.fillStyle='#67f2bf';ctx.strokeStyle='#15392d';ctx.lineWidth=2;ctx.fill();ctx.stroke();
  }
  const pings = overlay?.chasePings ?? (overlay?.chasePing ? [overlay.chasePing] : []);
  for (const ping of pings) {
    const [px, py] = layout.project(ping.position);
    const ratio = Math.min(1, Math.max(0, (ping.ageMs ?? 0) / Math.max(1, ping.fadeMs ?? 5500)));
    const ringR = (compact ? 6 : 11) + ratio * (compact ? 9 : 18);
    ctx.save();
    ctx.globalAlpha = Math.max(.25, 1 - ratio * .7);
    ctx.beginPath();
    ctx.arc(px, py, ringR, 0, TAU);
    ctx.strokeStyle = ping.role === 'hunter' ? '#ff725e' : '#ff9852';
    ctx.lineWidth = compact ? 1.5 : 2.3;
    ctx.stroke();
    ctx.restore();
    mapPin(ctx, layout.project, ping, compact, true);
  }
  const rb = !compact ? overlay?.routeBuilder : null;
  if (rb?.active && rb.network?.points) {
    for (const [id, pt] of Object.entries(rb.network.points)) {
      if (!rb.network.edges?.get(id)?.length) continue;
      const [nx, ny] = layout.project([pt[0], 0, pt[1]]);
      const named = Boolean(rb.network.endpoints?.[id]);
      ctx.beginPath();
      ctx.arc(nx, ny, named ? 4.4 : 2.8, 0, TAU);
      ctx.fillStyle = named ? '#ffe088b8' : '#90dfbab0';
      ctx.strokeStyle = '#14261ec8';
      ctx.lineWidth = 1.2;
      ctx.fill();
      ctx.stroke();
    }
    if (rb.draft?.polyline?.length >= 2) {
      ctx.save();
      ctx.beginPath();
      rb.draft.polyline.forEach((pt, idx) => {
        const [px, py] = layout.project([pt[0], 0, pt[1]]);
        if (idx) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      });
      ctx.strokeStyle = rb.draft.valid ? '#7ef3a8' : '#f4b86a';
      ctx.lineWidth = 4.2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
    }
    rb.waypoints?.forEach((id, idx) => {
      const pt = rb.network.points[id];
      if (!pt) return;
      const [wx, wy] = layout.project([pt[0], 0, pt[1]]);
      ctx.beginPath();
      ctx.arc(wx, wy, 8, 0, TAU);
      ctx.fillStyle = idx === 0 ? '#7ef3a8' : '#ffd56f';
      ctx.strokeStyle = '#182b22';
      ctx.lineWidth = 1.6;
      ctx.fill();
      ctx.stroke();
      ctx.font = '700 10px "Microsoft YaHei","PingFang SC",sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#182b22';
      ctx.fillText(String(idx + 1), wx, wy + .3);
    });
  }
  if(!replay) mapPin(ctx,layout.project,race.rider,compact);
}

