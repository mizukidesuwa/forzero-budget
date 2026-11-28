import { signCanvas } from '../../core/canvas.js';
import {
  CITY_ASPHALT, ROAD_Y, TAU, UP, add, choose, clamp, cross, dot, lerpPoint,
  mix, normalize, random, randomSource, range, rgb, scale, subtract, tint,
} from '../../core/math.js';
import { Shape } from '../../core/shape.js';
import { getActiveCampus, worldState } from '../../core/state.js';
import { OBSTACLE_MARGIN, nearestStreet, treeBlocks } from '../collision-index.js';
import {
  academicBlock, along, bench, buildingNameplate, campusFixtures, campusFootprint,
  cityJunctions, citySolid, cityVehicles, closeToBlock, courseFrame, deciduous, emitTerrain,
  facadeName, facadeOf, fitsBetweenBuildings, foliage, glazing,
  inOutline, indexStreets, lamppost, landmark, londonPaving, lotBox, lotPart, lotPoint,
  masonry, namedSign, nearestPathSpot, offsetVertex, palm, pavement,
  placeTravelSign, plate, pointDistance, ribbon, road, scenery, signs,
  street, streetCell, streetGapSquared, treeSites, urban,
  wallPanel, water,
} from '../geometry.js';
import { registerCampus } from '../registry.js';
import {
  buildSzuShortcutVisuals, indexGroundSurfaces, lawnPatch, pavedGroundAt,
  shortcutRibbonContains, szuHighRiskShortcuts,
} from '../surfaces.js';

import {
  geo, campusGates, centralSquare, sportsCenter, campusBoundary, perimeter,
  westToNorth, northToSouth, southToLake, westReturn, teachingConnector, throughCenter, betweenLakes, southConnector,
  roads, westEnd, eastEnd, canghaiPerimeter, campusOutlines, canghaiGates, canghaiStreets, openStreets, cityLinks,
  cityRoads, cityRoadIndex, indexCityRoads, cityExtent, northSpine, lectureCross, learningLink,
  lakeRim, librarySouth, sportsConnector, researchConnector,
  eastTeachingCrossing, hospitalCrossing, libraryEastConnector, hillReturn, innerSections, dujuanFoot, dujuanCrest,
  dujuanPass, parkWalks,
} from './szu/layout.js';
import { emitSzuBarriers } from './szu/barriers.js';
import { emitSzuFrontageDetails } from '../assets/campus-v220.js';
import { emitLowHedgeBorder } from '../assets/rail-fence.js';
import { emitCityTrafficVehicle } from '../assets/traffic-vehicles.js';
import { emitGatePalm } from '../assets/trees.js';
import { szuFrontageDetailStyles } from '../../data/map-assets.js';
import { dujuanHill, hillHeight, hillGrade, hillNormal, szuRiderGrade, flyover, flyoverHeight, flyoverAt } from './szu/terrain.js';
import {
  lakeRoute, libraryRoute, teachingRoute, ringPath, ringLength, enduranceFlyoverParts,
  enduranceCourse, hillCourse, hillCourses, buildPerimeterCourse, perimeterCourses, createSzuCourses,
} from './szu/courses.js';

const pale = ['#c3b493','#e2d6b8','#5e716c','#60786d'];
const clay = ['#b07c66','#dbc2a5','#526d67','#765e59'];
const limestone = ['#cec3a7','#e5dbbf','#607b73','#72847d'];
const sage = ['#abb2a5','#dae0cf','#435f62','#55797e'];
const originalCampus = [
  {name:'教育学部', use:'原师范学院', at:geo(22.534375,113.933275), w:27, depth:24, floors:3, palette:clay},
  {name:'汇元楼', use:'办公楼', at:geo(22.532600,113.934721), w:28, depth:18, floors:3, palette:pale},
  {name:'校医院', use:'', at:geo(22.532389,113.938647), w:23, depth:16, floors:3, palette:limestone},
  {name:'本原楼', use:'校内建筑', at:geo(22.530729,113.937263), w:25, depth:20, floors:3, palette:sage},
  {name:'文山湖餐厅', use:'', at:geo(22.529596,113.934016), roadSetback:2.04, w:17.2, depth:10.2, floors:1, palette:limestone},
  {name:'', use:'', at:[-148,153], w:14, depth:21, floors:4, palette:clay},
  {name:'', use:'', at:[-150,181], w:16, depth:20, floors:3, palette:limestone},
  {name:'', use:'', at:[-155,199], w:22, depth:13, floors:3, palette:clay},
  {name:'', use:'', at:[-83,-107], w:8, depth:24, floors:2, palette:limestone},
  {name:'', use:'', at:[111,-31], w:28, depth:16, floors:4, palette:sage},
  {name:'', use:'', at:[120,87], w:15, depth:16, floors:3, palette:limestone}
].map(({at,...block})=>{
  const {roadSetback=0,...details}=block;
  const lot={...campusFootprint(at[0]+roadSetback,at[1],block.w,block.depth),...details};
  if(block.name==='汇元楼') Object.assign(lot,{kind:'huiyuan',outline:huiyuanPlan(lot.w,lot.depth),height:10.55});
  return lot;
});

// Wenshan Lake shorelines follow the guide's long axes and use the same outline for riding and drawing.
const basins = [
  {name:'下文山湖', x:-104,z:164,rx:23.5,rz:12.3,y:.017,angle:.52,yaw:-1.31},
  {name:'上文山湖', x:-31,z:125,rx:25.5,rz:13.3,y:.017,angle:2.2,yaw:.53},
  {name:'', x:-78,z:-125.8,rx:7.9,rz:4.2,y:.017,angle:1.22,yaw:.77}
].map(basin=>({...basin,c:Math.cos(basin.yaw),s:Math.sin(basin.yaw)}));

function bankRatio(basin,angle) {
  return 1+.073*Math.cos(angle*3+basin.angle)+.045*Math.sin(angle*5-basin.angle);
}
function bank(basin,angle,inset=0,y=basin.y) {
  const r = bankRatio(basin,angle);
  return lotPoint(basin,(basin.rx-inset)*Math.cos(angle)*r,y,(basin.rz-inset)*Math.sin(angle)*r);
}
function lakeClearance(x,z) {
  let clearance=Infinity;
  for (const basin of basins) {
    const dx=x-basin.x,dz=z-basin.z;
    const u=(basin.c*dx-basin.s*dz)/basin.rx, v=(basin.s*dx+basin.c*dz)/basin.rz;
    const r=Math.hypot(u,v);
    const gap = r ? Math.hypot(dx,dz)*(1-bankRatio(basin,Math.atan2(v,u))/r) : -basin.rz;
    clearance=Math.min(clearance,gap);
  }
  return clearance;
}


function inCampus(x,z) {
  if (inOutline(x,z,perimeter)) return true;
  return x>168 && z>169 && inOutline(x,z,canghaiPerimeter);
}


const CITY_EDGE_MARGIN = .28;

function nearestCitySegment(x,z,skip=null,extra=0,shoulders=true) {
  indexCityRoads();
  const cell=cityRoadIndex.get(streetCell(x,z))??[];
  let best=Infinity, selected=null;
  for(const segment of cell) {
    if(segment.path===skip) continue;
    const info=cityRoads.get(segment.path);
    const width=info.width+(shoulders?info.shoulder:0)+extra;
    const gap=streetGapSquared(segment,x,z);
    if(gap<best&&gap<=width*width) {best=gap;selected=info;}
  }
  return selected;
}

function junctionContains(polygon,x,z) {
  return x>=polygon.minX&&x<=polygon.maxX&&z>=polygon.minZ&&z<=polygon.maxZ&&
    inOutline(x,z,polygon.points);
}

function cityStreetAt(x,z) {
  const hit=nearestCitySegment(x,z,null,CITY_EDGE_MARGIN);
  if(hit) return hit;
  return cityJunctions.find(j=>junctionContains(j.paving,x,z))?.roads[0];
}

function cityRoadContains(info,x,z,extra=0) {
  const cell=cityRoadIndex?.get(streetCell(x,z))??[];
  const reach=info.width+info.shoulder+extra;
  return cell.some(segment=>segment.path===info.path&&streetGapSquared(segment,x,z)<=reach*reach);
}

function roadClearsBuilding(x,z,halfW,halfD) {
  for(const gate of [...campusGates,...canghaiGates]) {
    const [gx,gz]=gate.xy;
    const reach=gate.name==='立德门'?32:23;
    const dx=Math.max(0,Math.abs(x-gx)-halfW),dz=Math.max(0,Math.abs(z-gz)-halfD);
    if(dx*dx+dz*dz<reach*reach) return false;
  }
  return [...cityRoads.values()].every(info=>info.path.rows.every(({p})=>{
    const dx=Math.max(0,Math.abs(p[0]-x)-halfW), dz=Math.max(0,Math.abs(p[2]-z)-halfD);
    const edge=info.width+info.shoulder+1.25;
    return dx*dx+dz*dz>edge*edge;
  }));
}

function roadInfoAt(x,z) {
  indexCityRoads();
  const cell=cityRoadIndex.get(streetCell(x,z))??[];
  const hits=new Set();
  for(const segment of cell) {
    const info=cityRoads.get(segment.path);
    if(hits.has(info)) continue;
    const width=info.width+info.shoulder+CITY_EDGE_MARGIN;
    if(streetGapSquared(segment,x,z)<=width*width) hits.add(info);
  }
  for(const junction of cityJunctions) {
    if(junctionContains(junction.paving,x,z)) for(const info of junction.roads) hits.add(info);
  }
  return hits;
}

function roadEdgeCrossing(a,b,da,db,sa,sb,w1,w2) {
  const fa=courseFrame(a,da),fb=courseFrame(b,db);
  const sideA=Math.sign(dot(fa.side,fb.f))*sb;
  const sideB=Math.sign(dot(fb.side,fa.f))*sa;
  const shoulders=[sideA*w1,sideB*w2];
  const edge=(path,station,side,direction)=>{
    const reach=58,count=48;
    return Array.from({length:count+1},(_,i)=>{
      const d=clamp(station+direction*(-2+i*reach/count),0,path.length);
      return {d,p:offsetVertex(courseFrame(path,d),side,0)};
    });
  };
  const points=[edge(a,da,shoulders[0],sa),edge(b,db,shoulders[1],sb)];
  function cross2(a,b) { return a[0]*b[2]-a[2]*b[0]; }
  for(let i=1;i<points[0].length;i++) {
    const start=points[0][i-1], end=points[0][i], u=subtract(end.p,start.p);
    for(let j=1;j<points[1].length;j++) {
      const left=points[1][j-1], right=points[1][j], v=subtract(right.p,left.p);
      const det=cross2(u,v);
      if(Math.abs(det)<.00001) continue;
      const diff=subtract(left.p,start.p), s=cross2(diff,v)/det, t=cross2(diff,u)/det;
      if(s<0||s>1||t<0||t>1) continue;
      return {corner:lerpPoint(start.p,end.p,s),da:mix(start.d,end.d,s),db:mix(left.d,right.d,t),shoulders};
    }
  }
  return null;
}

function cornerApron(a,b,da,db,sa,sb,w1,w2,rounding) {
  const intersection=roadEdgeCrossing(a,b,da,db,sa,sb,w1,w2);
  if(!intersection) return null;
  const {corner,shoulders}=intersection;
  const fa=courseFrame(a,intersection.da+sa*rounding), fb=courseFrame(b,intersection.db+sb*rounding);
  const first=offsetVertex(fa,shoulders[0]*.99,0),last=offsetVertex(fb,shoulders[1]*.99,0);
  const root=add(corner,scale(add(scale(fa.f,sa),scale(fb.f,sb)),-1.8));
  const points=[root];
  for(let i=0;i<=8;i++) {
    const t=i/8;
    points.push(lerpPoint(lerpPoint(first,corner,t),lerpPoint(corner,last,t),t));
  }
  const flat=points.map(([x,,z])=>[x,z]);
  return {points:flat,minX:Math.min(...flat.map(p=>p[0])),maxX:Math.max(...flat.map(p=>p[0])),
    minZ:Math.min(...flat.map(p=>p[1])),maxZ:Math.max(...flat.map(p=>p[1]))};
}

function junctionSurface(mesh,polygon,y,color) {
  const points=polygon.points.map(([x,z])=>[x,y,z]);
  for(let i=1;i<points.length-1;i++) mesh.triangle(points[0],points[i],points[i+1],color);
}

function drawPublicJunctions() {
  const [nanhai,shennan,baishi,east]=openStreets.map(({path})=>path);
  const pairs=[
    [nanhai,shennan,[-132,-240]], [nanhai,baishi,[-223,261]],
    [shennan,east,[295,-216]], [baishi,east,[172,175]]
  ];
  for(const [a,b,xy] of pairs) {
    const distances=[pointDistance(a,xy),pointDistance(b,xy)];
    const fa=courseFrame(a,distances[0]), fb=courseFrame(b,distances[1]);
    const det=fa.f[0]*fb.f[2]-fa.f[2]*fb.f[0];
    if(Math.abs(det)<.38) continue;
    const info=[cityRoads.get(a),cityRoads.get(b)];
    for(const sa of [-1,1]) for(const sb of [-1,1]) {
      const available=(path,d,sign)=>sign<0?d:path.length-d;
      if(available(a,distances[0],sa)<b.width+2 || available(b,distances[1],sb)<a.width+2) continue;
      const [da,db]=distances;
      const asphalt=cornerApron(a,b,da,db,sa,sb,a.width,b.width,5.3);
      const paving=cornerApron(a,b,da,db,sa,sb,a.width+info[0].shoulder,b.width+info[1].shoulder,4.7);
      if(!asphalt||!paving) continue;
      cityJunctions.push({asphalt,paving,roads:info});
      junctionSurface(road,asphalt,CITY_ASPHALT,'#586765');
      junctionSurface(pavement,paving,.017,'#cec9b7');
    }
  }
}

function pavedJunctionAt(x,z,path) {
  return nearestCitySegment(x,z,path,.62,false) ||
    cityJunctions.some(j=>junctionContains(j.asphalt,x,z));
}

function publicMarking(path,offset,width,from,to,color) {
  const clear=d=>{
    const [x,,z]=offsetVertex(courseFrame(path,d),offset,0);
    if(pavedJunctionAt(x,z,path)) return false;
    const hit=nearestStreet(x,z);
    return !hit.street||hit.distance>hit.street.width+.45;
  };
  const count=Math.ceil((to-from)/1.18);
  let start=null;
  for(let i=0;i<count;i++) {
    const a=mix(from,to,i/count), b=mix(from,to,(i+1)/count);
    const paint=clear(a)&&clear((a+b)/2)&&clear(b);
    if(paint) {
      start??=a;
      if(i+1===count) ribbon(masonry,path,offset-width,offset+width,CITY_ASPHALT+.008,color,start,b,2.65);
    } else if(start!==null) {
      ribbon(masonry,path,offset-width,offset+width,CITY_ASPHALT+.008,color,start,a,2.65);
      start=null;
    }
  }
}

function drawCityLinks() {
  for(const {path} of [...cityLinks,...canghaiStreets]) {
    const w=path.width, edge=w+cityRoads.get(path).shoulder;
    ribbon(pavement,path,-edge,edge,.017,'#cec9b7',0,path.length,.80);
    ribbon(road,path,-w,w,CITY_ASPHALT,'#586765',0,path.length,.69);
    for(const side of [-1,1]) publicMarking(path,side*(w-.19),.041,0,path.length,'#d1d2b9');
  }
}

function publicStreetMeshes() {
  drawPublicJunctions();
  for(const {path} of openStreets) {
    const w=path.width, edge=w+cityRoads.get(path).shoulder;
    ribbon(pavement,path,-edge,edge,.017,'#cec9b7',0,path.length,1.45);
    ribbon(road,path,-w,w,CITY_ASPHALT,'#586765',0,path.length,1.45);
    for(const side of [-1,1]) publicMarking(path,side*(w-.33),.047,0,path.length,'#c9cabe');
    for(let d=5;d<path.length-5;d+=9.25) {
      if(path!==flyover.path||d+4.4<flyover.from||d>flyover.to)
        publicMarking(path,0,.058,d,d+4.4,'#d7c692');
      const lanes=w>=12?[.27,.62]:[.46];
      for(const side of [-1,1]) for(const lane of lanes)
        publicMarking(path,side*w*lane,.054,d,d+4.4,'#dddcc5');
    }
    for(let d=14;d<path.length-10;d+=35) {
      const frame=courseFrame(path,d), [x,,z]=offsetVertex(frame,w+1.12,0);
      if(!inCampus(x,z)&&!pavedJunctionAt(x,z,path)) lamppost(x,z,scale(frame.side,-1));
    }
    for(let d=31;d<path.length-14;d+=46) {
      const frame=courseFrame(path,d), [x,,z]=offsetVertex(frame,-w-1.75,0);
      if(inCampus(x,z)) continue;
      const size=range(.82,1.02);
      if(!pavedJunctionAt(x,z,path)) palm(x,z,size);
    }
  }
  drawFlyover();
  for(const [index,distance] of [[0,.51],[1,.64],[2,.51]]) {
    const lane=openStreets[index],frame=courseFrame(lane.path,lane.path.length*distance);
    const p=offsetVertex(frame,lane.path.width+1.8,3.75);
    const yaw=Math.atan2(-frame.f[0],-frame.f[2]);
    urban.tube([p[0],0,p[2]],[p[0],3.8,p[2]],.068,.063,'#677d72',8);
    plate(namedSign(lane.name,'','#577d6f','#eff2db'),p,3.2,.67,yaw);
  }
}


function cityBlocked(x,z) {
  const nearby=worldState.ridingObstacles?.region === 'szu'?worldState.ridingObstacles.city.get(streetCell(x,z)):citySolid;
  return nearby?.some(b => b.depth === undefined
    ? Math.abs(x-b.x)<b.w/2+.34 && Math.abs(z-b.z)<b.d/2+.34
    : closeToBlock(x, z, b, .34))??false;
}

const metroStop = geo(22.539264,113.943972);
const cityIcons = [
  {name:'Southizzahut 滨海大厦',xy:geo(22.522717,113.935187)},
  {name:'华润大厦 · 春笋',xy:geo(22.514871,113.946487)}
];


// 地标中心来自公开的校园图和高德位置。其余体量、铺装和相连的支路按骑行视角概化。
function raiseHillMesh(shape) {
  const { vertices } = shape;
  for (let i = 0; i < vertices.length; i += 11) {
    const x = vertices[i], z = vertices[i + 2];
    if (Math.abs(x - dujuanHill.x) >= dujuanHill.rx || Math.abs(z - dujuanHill.z) >= dujuanHill.rz) continue;
    const height = hillHeight(x, z);
    if (!height) continue;
    vertices[i + 1] += height;
    if (Math.abs(vertices[i + 4]) > 1e-7) {
      const [nx, ny, nz] = hillNormal(x, z, vertices[i + 3], vertices[i + 4], vertices[i + 5]);
      vertices[i + 3] = nx; vertices[i + 4] = ny; vertices[i + 5] = nz;
    }
  }
}

function drawHillGround() {
  const {x,z,rx,rz}=dujuanHill,columns=24,rows=36;
  emitTerrain(terrain => {
    const start=terrain.vertices.length/11;
    for(let row=0;row<=rows;row++) for(let col=0;col<=columns;col++) {
      const xx=x+rx*(2*col/columns-1),zz=z+rz*(2*row/rows-1);
      const h=hillHeight(xx,zz), normal=hillNormal(xx,zz,0,1,0);
      const shade=Math.min(1,h/dujuanHill.height);
      const grass=rgb('#789454').map((value,i)=>mix(value,[.44,.55,.28][i],shade*.74));
      terrain.vertex([xx,h-.0123,zz],normal,grass);
      if(!row||!col) continue;
      const end=start+row*(columns+1)+col,a=end-columns-2;
      if(h||terrain.vertices[(a+1)*11+1]>-.0123||terrain.vertices[(a+columns+1)*11+1]>-.0123||
        terrain.vertices[a*11+1]>-.0123) terrain.indices.push(a,a+columns+1,end,a,end,a+1);
    }
  });
}

function sculptCampusHill() {
  const frame=courseFrame(dujuanPass,8.5);
  const [x,,z]=offsetVertex(frame,dujuanPass.width+1.1,0);
  placeTravelSign(x,z,'杜鹃山','坡道',Math.atan2(-frame.f[0],-frame.f[2]));
  for(const mesh of [road,pavement,masonry,scenery,foliage]) raiseHillMesh(mesh);
  for(const {shape} of signs) raiseHillMesh(shape);
  drawHillGround();
}

const documentedBlocks = [
  {name:'演会中心',use:'会展中心',at:geo(22.533585,113.934177),w:21,depth:15,floors:2,palette:limestone,kind:'auditorium',priority:4},
  {name:'本原设计研究中心',use:'校内建筑',at:geo(22.532839,113.937775),roadSetback:2,w:14.8,depth:8,floors:3,palette:sage,priority:4},
  {name:'国际交流学院',use:'校内建筑',at:geo(22.527787,113.935072),w:23,depth:16,floors:3,palette:pale,priority:6},
  {name:'小西南餐厅',use:'校园餐厅',at:geo(22.527729,113.932079),w:16,depth:12,floors:2,palette:limestone,kind:'hall',priority:4}
].map(({at,roadSetback=0,...b})=>({...campusFootprint(at[0],at[1]-roadSetback,b.w,b.depth),...b}));

const huiwenWings = [
  [1,1,-162,16,10,4,-.15], [2,-17,-169,17,10,4,-.15], [3,-16,-139,17,10,4,-.15],
  [4,-43,-132,15,7,3,.24], [5,-79,-145,16,10,4,.52], [6,-62,-180,18,12,4,1.03]
].map(([wing,x,z,w,d,floors,yaw]) => ({
  ...landmark(`汇文楼 H${wing}`,'文科教学楼','huiwen',x,z,w,d,floors,yaw,clay,wing===1?13:3), wing
}));

const huiziWings = [
  ['A',56,51,14,10,5,-.15], ['B',41,42,14,9,4,-.15],
  ['C',53,1,13,10,5,-.1], ['D',33,-2,12,9,4,-.1]
].map(([wing,x,z,w,d,floors,yaw]) => ({
  ...landmark(`汇紫楼 ${wing} 座`,'教学楼','huizi',x,z,w,d,floors,yaw,limestone,wing==='A'?11:3), wing
}));

const huixing = landmark('汇星楼','科技楼','huixing',41,-61,29,18,8,-.08,sage,15);
const huidian = landmark('汇典楼','图书馆北馆','huidian',1,-1.6,24,15,6,.035,limestone,14);
huidian.parts = [
  lotPart(huidian,0,0,huidian.w,huidian.depth,15.2),
  lotPart(huidian,0,8.30,15.8,1.7,2.16),
  lotPart(huidian,-9.25,8.32,2.64,2.55,2.25),
  lotPart(huidian,9.25,8.32,2.64,2.55,2.25)
];

const huizhi = landmark('汇智楼','图书馆南馆','huizhi',20,86,24,19,5,.10,limestone,14);
huizhi.parts = [
  lotPart(huizhi,-5.85,.25,11.8,18.5,12.2),
  lotPart(huizhi,6.25,1.65,11.1,15.4,11.4),
  lotPart(huizhi,6.25,-12.65,8.34,4.30,5.8)
];

const yuanping = landmark('元平体育馆','体育馆','yuanping',113,-78,25,21,4,.22,limestone,12);
const featuredCampus = [
  ...huiwenWings, ...huiziWings, huixing, huidian, huizhi, yuanping,
  landmark('汇语楼','教学楼','academic',-1,-199,11,9,3,.28,limestone),
  landmark('汇萃楼','教学楼','academic',64,-176,27,14,4,.14,limestone),
  landmark('汇意楼','建筑与城市规划学院','academic',116,-186,24,13,4,.24,limestone)
];

const athleticsField = campusFootprint(205,-102,23,37,-.36);

const yuehaiSportsPlaza=campusFootprint(sportsCenter[0],sportsCenter[1],27,29);
const protectedCampusGrounds=[athleticsField,yuehaiSportsPlaza];
const campusEntranceSetbacks=[...campusGates,...canghaiGates].map(gate=>{
  const [x,z]=gate.xy,[fx,,fz]=gate.facing,main=gate.name==='立德门';
  return campusFootprint(x+fx*14,z+fz*14,main?39:25,main?60:47,Math.atan2(fx,fz));
});

function clearEntranceLot(lot) {
  return campusEntranceSetbacks.every(entrance=>fitsBetweenBuildings(lot,entrance));
}

function clearCampusLand(lot) {
  const plinth=campusFootprint(lot.x,lot.z+.70,lot.w+1.6,lot.depth+2.9,lot.yaw);
  if(!clearEntranceLot(plinth)||protectedCampusGrounds.some(site=>!fitsBetweenBuildings(plinth,site))) return false;
  if(!roadClearsBuilding(plinth.x,plinth.z,plinth.w/2,plinth.depth/2)) return false;
  return roads.every(path=>path.rows.every(({p})=>{
    const x=Math.max(0,Math.abs(p[0]-plinth.x)-plinth.w/2);
    const z=Math.max(0,Math.abs(p[2]-plinth.z)-plinth.depth/2);
    return x*x+z*z>(path.width+.48)**2;
  }));
}

function newLiyemen(gate) {
  // The small west gate meets the campus driveway on the east side of Nanhai Avenue.
  // Set the built threshold inside the curb and align it to the existing drive.
  const link=roads.find(path=>path.rows.at(-1).p[0]===gate.xy[0]&&path.rows.at(-1).p[2]===gate.xy[1]);
  if(!link) return;
  const frame=courseFrame(link,link.length-8.5);
  const [x,,z]=frame.p;
  const gateFrame=entranceFrame({...gate,xy:[x,z],facing:frame.f});
  const {p,box,solid,yaw}=gateFrame;
  box(0,.015,0,9.45,.037,5.2,'#c5c3b5',pavement);
  const main=openStreets[0].path;
  for(const side of [-1,1]) {
    const u=side*3.72;
    const [postX,,postZ]=p(u,0,-.41);
    if(cityRoadContains(cityRoads.get(main),postX,postZ,.47)) continue;
    box(u,.84,-.41,1.20,1.68,1.13,'#97958a');
    box(u,1.71,-.41,1.30,.105,1.25,'#bbb6aa');
    solid(u,-.41,1.20,1.13,1.78);
    const [wingX,,wingZ]=p(side*5.79,0,-.56);
    if(!cityRoadContains(cityRoads.get(main),wingX,wingZ,1.50)) {
      box(side*5.79,.60,-.56,2.01,1.20,.31,'#a8a496');
      for(let i=0;i<8;i++) box(side*(5.0+i*.23),1.38,-.56,.039,.43,.059,'#485854');
      solid(side*5.79,-.56,2.01,.31,1.60);
    }
    if(side===1) plate(namedSign('立业门','深圳大学','#a09d91','#333a35'),p(u,1.10,.23),1.08,.49,yaw);
  }
  const [hutX,,hutZ]=p(4.71,0,-2.28);
  if(!cityRoadContains(cityRoads.get(main),hutX,hutZ,2.20))
    gateBooth(gateFrame,4.71,-2.28,2.34,2.24,'#b6b5aa','#617675');
}
const treeSetbacks = [
  lotPart(huizhi,-1.6,-18.1,28,18.7,0),
  lotPart(huidian,0,12.3,17,10.0,0),
  campusFootprint(centralSquare[0]-4.7,centralSquare[1],17,12.6),
  lotPart(huixing,0,13.3,20,11,0),
  campusFootprint(-103,23.9,25.2,33.2)
];
const campusLanes = [
  {name:'立德路',paths:[westToNorth],color:'#a17478',at:[-65,-71]},
  {name:'立功路',paths:[northToSouth],color:'#b28d56',at:[148,-6]},
  {name:'立言路',paths:[southToLake,westReturn],color:'#728199',at:[-115,110]}
];
const laneColors = new Map(campusLanes.flatMap(lane=>lane.paths.map(path=>[path,lane.color])));

const zhiyi = landmark('致艺楼','艺术学部','zhiyi',221,211,26,15,4,.18,limestone,14);
zhiyi.parts = [
  lotPart(zhiyi,-6.32,1.83,13.20,11.20,10.80),
  lotPart(zhiyi,7.9,2.15,8.86,10.9,11.18),
  lotPart(zhiyi,1.60,-4.46,22.56,5.32,8.95)
];
const canghaiBuildings = [
  zhiyi,
  landmark('致真楼','教学楼','academic',262,208,24,14,4,-.13,limestone,8),
  landmark('致理楼','公共教学楼','academic',299,209,28,17,5,-.14,sage,8),
  landmark('致信楼','教学楼','academic',270,232,23,11,3,.13,limestone,8)
];

function zhiyiBuilding(block) {
  const white='#eeeee4';
  for(const part of block.parts.slice(0,2)) {
    lotBox(part,0,part.height/2,0,part.w,part.height,part.depth,'#dadcd3');
    for(let side=0;side<4;side++) {
      const face=facadeOf(part,side);
      for(let floor=0;floor<4;floor++) glazing(face,1.57+2.4*floor,Math.ceil(face.width/1.72),'#647a7a',1.10);
    }
  }
  const front=block.parts[2], inner=lotPart(front,0,1.60,front.w,1.95,front.height);
  lotBox(inner,0,front.height/2,0,inner.w,front.height,inner.depth,'#b6c2bd');
  for(let floor=0;floor<4;floor++) {
    const y=1.15+floor*2.10;
    glazing(facadeOf(inner,2),y,12,'#4a6770',1.38);
    lotBox(front,0,y-.96,-.13,front.w,.20,front.depth,white);
  }
  lotBox(front,0,front.height+.03,-.13,front.w+.16,.33,front.depth+.08,white);
  for(const side of [-1,1]) lotBox(front,side*(front.w/2-.15),front.height/2,-.15,.32,front.height,front.depth,white);
  const bay=1.84, row=2.10, cols=12, edge=bay*cols/2;
  for(let i=0;i<4;i++) for(let j=0;j<cols;j++) {
    const u=(j-(cols-1)*.5)*bay, y=1.18+i*row;
    const shift=((j*13+i*7)%5-2)*.12;
    const open=.80+((j*7+i*5)%4)*.23;
    const h=.77+((j*3+i*11)%4)*.22, v=-front.depth/2+.06;
    lotBox(front,u+(shift-open/2-bay/2)/2,y,v,bay/2+shift-open/2,row,.27,white);
    lotBox(front,u+(shift+open/2+bay/2)/2,y,v,bay/2-shift-open/2,row,.27,white);
    lotBox(front,u+shift,y+(row+h)/4,v,open,(row-h)/2,.27,white);
    lotBox(front,u+shift,y-(row+h)/4,v,open,(row-h)/2,.27,white);
  }
  for(const s of [-1,1]) lotBox(front,s*(edge+front.w/2)/2,4.34,-front.depth/2+.06,front.w/2-edge,8.68,.27,white);
  facadeName(facadeOf(front,2,-.09),'致艺楼','艺术学部',.72,4.7,.65,white);
}

function canghaiGrounds() {
  const plaza=campusFootprint(252,223,24.5,8.3,-.14);
  lotBox(plaza,0,.01,0,plaza.w,.042,plaza.depth,'#d4ccbb',pavement);
  lotBox(zhiyi,0,.011,-10.50,16,.041,6.80,'#d8d2c1',pavement);
  for(const [x,z,s] of [[183,222,.93],[193,213,1.0],[201,218,1.28],[215,230,1.16],
    [237,247,.98],[265,246,1.33],[289,234,1.12],[317,223,1.31],[318,193,1.1],[284,197,1.02],
    [273,194,1.18],[202,226,1.18],[301,226,1.14],[328,209,1.06]]) {
    if(!szuBuildingAt(x,z,1.5)&&!cityStreetAt(x,z)) deciduous(x,z,s,Math.round(s*12)%3);
  }
}

const groups=[
  {district:'北区教学楼群', blocks:[
    [-75,-106,10,13,3],[-47,-91,12,9,2],[-65,-59,13,8,3],[-17,-64,18,15,4],[-10,-37,17,12,3],[-73,5,12,12,3],
    [2,-60,15,15,3],[33,-67,12,12,4],[45,-48,15,12,3],[50,-31,13,9,3],[64,-9,12,11,3],
    [77,-9,10,10,3]
  ]},
  {district:'东侧校内楼群', blocks:[
    [143,-128,13,13,3],[129,-148,15,12,3],[157,-112,14,14,3],[176,-154,18,14,4],[201,-137,16,12,3],
    [224,-99,14,14,3],[202,-74,17,12,4],[159,-58,14,13,4],[155,-34,15,10,4],[112,-5,18,13,4],
    [116,1,14,9,3],[106,92,15,12,4],[99,55,16,12,3]
  ]},
  {district:'南区校园楼群', blocks:[
    [-81,67,13,16,3],[-83,114,14,11,3],[-100,105,12,11,3],[-39,72,15,13,3],[-25,75,11,10,3],
    [38,90,12,16,3],[60,85,12,14,3],
    [57,139,14,13,3],[71,125,13,13,4],[60,151,11,11,3],[-92,207,14,12,4],
    [-66,214,13,13,4],[-48,208,15,12,4],[-13,197,12,13,4],
    [-108,235,12,12,3],[-75,237,14,12,3],[-42,236,15,10,3]
  ]}
];

function fitDistrictBlock(block,existing) {
  if (!inCampus(block.x,block.z) || lakeClearance(block.x,block.z)<Math.min(block.w,block.depth)*.70) return false;
  if (!clearCampusLand(block)) return false;
  if (existing.some(other=>(other.parts??[other]).some(part=>!fitsBetweenBuildings(block,part)))) return false;
  return true;
}

const campus = [
  ...originalCampus.filter(block=>block.name||clearCampusLand(block)),
  ...documentedBlocks,...featuredCampus,...canghaiBuildings
];
for(const [groupIndex,group] of groups.entries()) {
  for(const [i,[x,z,w,depth,floors]] of group.blocks.entries()) {
    const block={name:'',district:group.district,use:'楼群体量',x,z,w,depth,floors,
      palette:[limestone,clay,sage,pale][(i+groupIndex)%4],priority:0};
    if (fitDistrictBlock(block,campus)) campus.push(block);
  }
}
// Additional wings in the documented teaching and student residential districts.
const campusEdgeWings=[
  ['西南学生生活区',clay,5,[[-160,232],[-140,232],[-104,232],[-84,236],[-64,236],[-92,208]]],
  ['北区教学组团',limestone,4,[[68,-199],[88,-199],[108,-199],[180,-199],[200,-199],[204,-179]]],
  ['沧海教学组团',sage,5,[[278,196],[254,220],[226,224],[290,224]]]
].flatMap(([district,palette,floors,sites])=>sites.map(([x,z])=>({
  ...campusFootprint(x,z,13,7),name:'',use:'组团配楼',district,palette,floors,priority:0
})));
for(const block of campusEdgeWings) if(fitDistrictBlock(block,campus)) campus.push(block);
const courts=[
  {name:'校友广场',xy:geo(22.534819,113.938298),w:24,d:13},
  {name:'时光广场',xy:centralSquare,w:21,d:11},
  {name:'北馆前庭',xy:[-3,21],w:16,d:7.7},
  {name:'汇文楼前庭',xy:[-44,-179],w:15,d:9.1},
  {name:'元平体育馆前庭',xy:[111,-61],w:17,d:6},
  {name:'天人广场',xy:[0,51],w:17,d:9.2},
  {name:'南馆前庭',xy:[13,98],w:18,d:10}
];

function programBasins() {
  for (const basin of basins) {
    const center=water.vertex([basin.x,basin.y,basin.z],UP,rgb('#619f8b'),0,0);
    for (let i=0;i<=144;i++) {
      const a=TAU*i/144,b=TAU*(i+1)/144;
      const p=water.vertex(bank(basin,a),UP,rgb('#619f8b'),Math.cos(a),Math.sin(a));
      if (i) water.indices.push(center,p,p-1);
      if (i===144) break;
      pavement.quad(bank(basin,a,.12,.032),bank(basin,b,.12,.032),bank(basin,b,-.64,.053),bank(basin,a,-.64,.053),'#a29f7d');
      const outerA=bank(basin,a,-2.15,.019),outerB=bank(basin,b,-2.15,.019);
      if (nearestStreet(outerA[0],outerA[2]).distance>4.7)
        pavement.quad(bank(basin,a,-1.09,.020),bank(basin,b,-1.09,.020),outerB,outerA,'#c3b59b');
    }
    if (basin.rx<20) continue;
    for (let i=0;i<32;i++) {
      const p=bank(basin,range(0,TAU),range(-.42,.08),.036);
      for (let j=0;j<7;j++) {
        const root=add(p,[range(-.19,.19),0,range(-.19,.19)]);
        scenery.tube(root,add(root,[range(-.23,.23),range(.21,.56),range(-.2,.22)]),.013,.006,choose(['#68864e','#82914c','#9b995d']),4,false);
      }
    }
  }
}

function groundCampuses() {
  emitTerrain(terrain => {
    terrain.quad([-1480,-.030,-1450],[1470,-.030,-1450],[1470,-.030,1520],[-1480,-.030,1520],'#abb09a');
    for(const [outline,origin] of [[perimeter,[0,-.012,-1]],[canghaiPerimeter,[254,-.012,210]]]) {
      for(let i=0;i<outline.length;i++) {
        const a=outline[i],b=outline[(i+1)%outline.length];
        terrain.triangle(origin,[a[0],-.012,a[1]],[b[0],-.012,b[1]],'#789454');
      }
    }
  });
  pavement.box([centralSquare[0],.005,centralSquare[1]], [22,.035,13.0], '#c8c0ac');
  const {x,z,w,depth}=yuehaiSportsPlaza;
  scenery.box([x,.035,z],[w,.06,depth],'#b96b5e');
  for(const offset of [-6.35,6.35]) {
    const court=lotPart(yuehaiSportsPlaza,offset,0,10,21.5,0);
    lotBox(court,0,.078,0,11.8,.02,24.5,'#628374',scenery);
    const line=(u,v,w,d)=>lotBox(court,u,.098,v,w,.012,d,'#e5e5d5',scenery);
    for(const side of [-1,1]) {
      line(side*5,0,.064,21.5);
      line(side*3.76,0,.064,21.5);
      line(0,side*10.75,10,.064);
      line(0,side*5.77,7.52,.064);
      lotBox(court,side*5.36,.52,0,.10,1.04,.10,'#495950',scenery);
    }
    line(0,0,.064,11.54);
    for(let i=0;i<=34;i++) {
      const u=(i/34-.5)*10.72, top=.83+.16*(u/5.36)**2;
      lotBox(court,u,top/2+.08,0,.022,top-.08,.022,'#475950',scenery);
    }
    for(let i=0;i<12;i++) {
      const a=(i/12-.5)*10.72,b=((i+1)/12-.5)*10.72;
      const top=u=>.86+.16*(u/5.36)**2;
      scenery.tube(lotPoint(court,a,top(a),0),lotPoint(court,b,top(b),0),.031,.031,'#efead7',5);
    }
    for(const y of [.26,.48,.69]) lotBox(court,0,y,0,10.72,.019,.021,'#4f5f56',scenery);
    campusFixtures.push(lotPart(court,0,0,10.8,.12,1.04));
  }
}

function localGreens() {
  // Keep planted beds tight to the walks so the campus grounds stay distinct from the city blocks.
  const plant = (x,z,s,kind) => {
    if (!inCampus(x,z) || lakeClearance(x,z)<.7 || szuBuildingAt(x,z,1.6)
      || treeSites.some(t=>Math.hypot(t.x-x,t.z-z)<3.9)) return;
    const near=nearestStreet(x,z);
    if (near.street && near.distance<near.street.width+1.7) return;
    if (Math.hypot(sportsCenter[0]-x,sportsCenter[1]-z)<23 || !landmarkClearance(x,z)) return;
    deciduous(x,z,s,kind);
  };
  for (const path of roads.slice(0,8)) {
    for (let d=10;d<path.length-9;d+=17.5) {
      const p=courseFrame(path,d);
      for (const side of [-1,1]) {
        const t=offsetVertex(p,side*(path.width+range(1.9,4.5)),0);
        if (random()<.86) plant(t[0],t[2],range(.95,1.54),Math.round(range(0,2)));
      }
      const t=offsetVertex(p,path.width+.82,0);
      if (inCampus(t[0],t[2]) && !szuBuildingAt(t[0],t[2],.8) && lakeClearance(t[0],t[2])>1
        && nearestStreet(t[0],t[2],path).distance>5.8) lamppost(t[0],t[2],scale(p.side,-1));
    }
  }
  for (let i=0;i<190;i++) {
    const x=range(-173,170),z=range(-209,219);
    if (random()<.64 && x>-78 && x<115) continue;
    plant(x,z,range(.78,1.70),i%3);
  }
  for (const basin of basins.slice(0,2)) {
    for (let i=0;i<17;i++) {
      const p=bank(basin,TAU*i/17,-3.05,0);
      if (i%5===0 && inCampus(p[0],p[2]) && nearestStreet(p[0],p[2]).distance>6.1 && !szuBuildingAt(p[0],p[2],1)) palm(p[0],p[2],1.22);
      else if (i%3!==0) plant(p[0],p[2],range(.91,1.36),i%3);
      if (i%4===1 && nearestStreet(p[0],p[2]).distance>5.75 && !szuBuildingAt(p[0],p[2])) {
        bench(p[0],p[2],TAU*i/17+Math.PI/2);
      }
    }
  }
}
// Yuehai aerial references: https://www.thepaper.cn/newsDetail_forward_18845502
// Each building stays inside its mapped lot. Window faces share the static masonry mesh.
function glazedQuad(a,b,c,d,normal,low,high) {
  const first=masonry.vertex(a,normal,rgb(low));
  masonry.vertex(b,normal,rgb(low));masonry.vertex(c,normal,rgb(high));masonry.vertex(d,normal,rgb(high));
  masonry.indices.push(first,first+1,first+2,first,first+2,first+3);
}

function huiyuanPlan(w,d) {
  // The curved northwest elevation faces the sundial. The rear elevations meet at a right angle.
  const x=w*.18,z=d*.15,rx=x+w/2,rz=z+d/2;
  const points=[[w/2,-d/2],[w/2,d/2],[-w/2,d/2]];
  for(let i=0;i<=14;i++) {
    const a=Math.PI+i*Math.PI/28;
    points.push([x+rx*Math.cos(a),z+rz*Math.sin(a)]);
  }
  return points;
}

function insidePlan(u,v,points,padding) {
  return points.every(([x,z],i)=>{
    const [x2,z2]=points[(i+1)%points.length];
    return (x2-x)*(v-z)-(z2-z)*(u-x)>=-padding*Math.hypot(x2-x,z2-z);
  });
}

function huiyuanBuilding(block) {
  const white='#ebe9df', stone='#cdcfc8', sill='#b5bcb5';
  for(let level=0;level<5;level++) {
    const y=level*2.06, retreat=[0,.18,.54,1.64,3.16][level];
    const plan=huiyuanPlan(block.w-2*retreat,block.depth-1.62*retreat);
    const at=(p,h,factor=1)=>lotPoint(block,p[0]*factor+retreat*.67,h,p[1]*factor+retreat*.47);
    const center=at([0,0],y+2.06);
    for(let i=0;i<plan.length;i++) {
      const a=plan[i],b=plan[(i+1)%plan.length];
      const n=normalize([b[1]-a[1],0,a[0]-b[0]]);
      const band=(bottom,top,factor,color)=>masonry.quad(at(a,bottom,factor),at(b,bottom,factor),
        at(b,top,factor),at(a,top,factor),color,n);
      band(y,y+.43,1,white);
      glazedQuad(at(a,y+.43,.988),at(b,y+.43,.988),at(b,y+1.71,.988),at(a,y+1.71,.988),
        n,level%2?'#475f62':'#52686c','#86999c');
      band(y+1.71,y+2.06,1,white);
      masonry.quad(at(a,y+1.71,1),at(b,y+1.71,1),at(b,y+1.71,.988),at(a,y+1.71,.988),sill,[0,-1,0]);
      masonry.quad(at(a,y+.43,1),at(b,y+.43,1),at(b,y+.43,.988),at(a,y+.43,.988),stone);
      masonry.triangle(center,at(b,y+2.06),at(a,y+2.06),stone);
      const span=Math.hypot(b[0]-a[0],b[1]-a[1]),bays=Math.max(1,Math.round(span/1.9));
      for(let j=0;j<bays;j++) {
        const p=t=>[mix(a[0],b[0],t),mix(a[1],b[1],t)];
        const from=p(j/bays),to=p(j/bays+.115/span);
        masonry.quad(at(from,y+.42,.997),at(to,y+.42,.997),at(to,y+1.72,.997),at(from,y+1.72,.997),'#c6ccc7',n);
      }
    }
  }
  lotBox(block,3.5,10.48,2.1,8.10,.36,3.88,'#d6d7cd');
  const entry=facadeOf(block,1);
  facadeName(entry,'汇元楼','',1.89,3.4,.53,white,'#574a3d');
}

function huiwenBuilding(block) {
  const {w,depth,floors,wing}=block;
  const brick=wing%2?'#a7503d':'#aa5945', ivory='#efebe0', glass='#465d60';
  const pitch=2.36, h=floors*pitch+.68;
  const body=lotPart(block,0,0,w-1.5,depth-1.0,h);
  lotBox(body,0,h/2,0,body.w,h,body.depth,brick);
  for(const side of [0,2]) {
    const face=facadeOf(body,side), cols=Math.max(4,Math.round(w/2.35));
    for(let floor=0;floor<floors;floor++) {
      const y=1.53+floor*pitch;
      face.panel(0,y,face.width-.34,1.52,glass);
      for(let col=1;col<cols;col++) face.panel(face.width*(col/cols-.5),y,.12,1.54,'#d1d4cb',.04);
      const v=(side===0?1:-1)*(depth/2-.19);
      lotBox(block,0,y-.92,v,w-.08,.27,.83,ivory);
      lotBox(block,0,y-.61,v,w-.14,.45,.16,brick);
    }
    for(let col=0;col<=cols;col++) {
      const x=(col/cols-.5)*(w-.42);
      lotBox(block,x,h*.50,(side===0?1:-1)*(depth/2-.20),.18,h,.39,ivory);
    }
  }
  // Tall brick bookends, white vertical reveals and a narrow glazed stair slot.
  for(const side of [1,3]) {
    const dir=side===1?1:-1;
    lotBox(block,dir*(w/2-.29),h*.51,0,.58,h*1.02,depth,brick);
    const end=facadeOf(block,side);
    end.panel(0,h*.51,depth*.29,h*.98,ivory);
    end.panel(0,h*.52,depth*.19,h*.88,'#43595c',.044);
    for(let floor=1;floor<floors;floor++) end.panel(0,floor*pitch+.15,depth*.2,.09,'#98a8a4',.064);
  }
  lotBox(block,0,h+.08,0,w+.22,.22,depth+.18,ivory);
  lotBox(block,0,h+.22,0,w-.48,.12,depth-.56,'#a7a9a1');
  lotBox(block,(wing%2?1:-1)*w*.27,h+.79,-depth*.17,2.68,1.05,2.95,'#dcdcd1');
  facadeName(facadeOf(block),`汇文楼 H${wing}`,'',2.23,3.2,.56,ivory,'#724636');
}

function huiziBuilding(block) {
  const {w,depth,floors,wing}=block;
  const brick='#ab654e', white='#ece9dc', pitch=2.19, h=.36+floors*pitch;
  const inner=lotPart(block,0,0,w-1.66,depth-1.40,h);
  lotBox(inner,0,h/2,0,inner.w,h,inner.depth,'#7b5043');
  for(let side=0;side<4;side++) {
    const face=facadeOf(inner,side), width=face.width;
    for(let i=0;i<floors;i++) {
      face.panel(0,1.34+i*pitch,width-.2,1.37,'#535e5b');
      face.panel(0,.88+i*pitch,width-.18,.18,'#8b6252',.04);
    }
    const streetFace=facadeOf(block,side,.09);
    const bays=Math.max(3,Math.round(streetFace.width/2.46));
    for(let j=0;j<=bays;j++) {
      const point=streetFace.point((j/bays-.5)*(streetFace.width-.36),h/2);
      masonry.box(point,[.29,h,.33],brick,streetFace.yaw);
    }
  }
  for(let i=0;i<=floors;i++) {
    const y=.26+i*pitch;
    lotBox(block,0,y,0,w+.19,.25,depth+.19,white);
    if(i===floors) break;
    for(const side of [0,1,2,3]) {
      const face=facadeOf(block,side);
      face.panel(0,y+.41,face.width-.23,.55,brick);
      face.panel(0,y+.72,face.width-.24,.09,white,.043);
    }
  }
  const lantern=lotPart(block,-w*.17,-depth*.08,w*.47,depth*.49,1.58);
  lotBox(lantern,0,h+.74,0,lantern.w,1.48,lantern.depth,brick);
  for(let side=0;side<4;side++) glazing(facadeOf(lantern,side),h+.94,4,'#445958',.64);
  lotBox(lantern,0,h+1.62,0,lantern.w+.56,.26,lantern.depth+.65,white);
  facadeName(facadeOf(block),`汇紫楼 ${wing} 座`,'',2.53,w*.46,.60,white);
}

function huixingBuilding(block) {
  const {w,depth}=block, silver='#bac5c7', sill='#d8dfe0', blue='#526e80';
  const podium=lotPart(block,0,0,w,depth,5.6);
  lotBox(podium,0,2.8,0,w,5.6,depth,silver);
  for(let side=0;side<4;side++) for(let floor=0;floor<4;floor++)
    glazing(facadeOf(podium,side),.88+floor*1.28,Math.ceil((side%2?depth:w)/2.0),blue,.80);
  lotBox(block,0,5.67,0,w+.3,.24,depth+.32,sill);
  const tower=lotPart(block,1.3,-.46,w*.69,depth*.80,23.05);
  const lo=13.3, hi=19.75, base=5.77, top=tower.height;
  const gapW=tower.w*.51,gapD=tower.depth*.43;
  lotBox(tower,0,(lo+base)/2,0,tower.w,lo-base,tower.depth,silver);
  lotBox(tower,0,(top+hi)/2,0,tower.w,top-hi,tower.depth,silver);
  const pierW=(tower.w-gapW)/2,pierD=(tower.depth-gapD)/2;
  for(const a of [-1,1]) for(const b of [-1,1])
    lotBox(tower,a*(gapW+pierW)/2,(lo+hi)/2,b*(gapD+pierD)/2,pierW,hi-lo,pierD,silver);
  for(let side=0;side<4;side++) {
    const face=facadeOf(tower,side), count=side%2?8:11, bay=face.width/count;
    const gap=side%2?gapD:gapW;
    for(let floor=0;floor<10;floor++) {
      const y=6.69+floor*1.65;
      for(let col=0;col<count;col++) {
        const u=(col+.5-count/2)*bay;
        if(y+.58>lo && y-.58<hi && Math.abs(u)-bay*.31<gap/2) continue;
        face.panel(u,y,bay*.68,1.11,(col+floor)%4===0?'#76909c':blue);
      }
    }
  }
  lotBox(tower,0,top+.08,0,tower.w+.18,.21,tower.depth+.20,sill);
  lotBox(tower,-tower.w*.22,top+.42,-tower.depth*.15,5.2,.57,3.00,'#aab6bc');
  for(let i=0;i<4;i++) lotBox(block,0,.085*(i+1),10.64-i*.44,11.4,.17*(i+1),.45,'#b7bfba');
  lotBox(block,0,.011,12.6,12.5,.039,3.07,'#c1c1af',pavement);
  facadeName(facadeOf(block),'汇星楼','科技楼',3.22,5.20,.78,silver);
}

function huidianBuilding(block) {
  const {w,depth}=block, white='#e9e5d9', stone='#d3cdbd', glass='#567379';
  const levels=[
    {width:w,deep:depth,bottom:0,top:7.5},
    {width:w-2.2,deep:depth-1.6,bottom:7.5,top:11.63},
    {width:w-4.8,deep:depth-3.65,bottom:11.63,top:14.20}
  ];
  // Four wings enclose a common lightwell through all three roof terraces.
  const courtW=5.3,courtD=3.35;
  for(const level of levels) {
    const {width,deep,bottom,top}=level,h=top-bottom,y=(top+bottom)/2;
    const sideW=(width-courtW)/2,endD=(deep-courtD)/2;
    for(const sign of [-1,1]) {
      lotBox(block,sign*(courtW+sideW)/2,y,0,sideW,h,deep,stone);
      lotBox(block,0,y,sign*(courtD+endD)/2,courtW,h,endD,stone);
      lotBox(block,sign*(width/2-.10),top+.10,0,.20,.28,deep,white);
      lotBox(block,0,top+.10,sign*(deep/2-.10),width,.28,.20,white);
    }
    const shell=lotPart(block,0,0,width,deep,top);
    for(let side=0;side<4;side++) {
      const face=facadeOf(shell,side), cols=Math.max(3,Math.floor((face.width-.7)/2.35));
      const bay=(face.width-.9)/cols;
      const rows=bottom===0?[1.26,3.75,6.02]:bottom===7.5?[8.55,10.49]:[12.80];
      for(const row of rows) for(let i=0;i<cols;i++) {
        const u=(i+.5-cols/2)*bay;
        if(side===0 && Math.abs(u)<width*.24 && bottom<11) continue;
        const hw=bay*.34,hh=.56;
        const a=face.point(u-hw,row-hh,.035),b=face.point(u+hw,row-hh,.035);
        const c=face.point(u+hw,row+hh,.035),d=face.point(u-hw,row+hh,.035);
        const outer=(x,y)=>face.point(u+x,row+y,.19);
        glazedQuad(a,b,c,d,face.normal,glass,'#899c9c');
        masonry.quad(outer(-hw-.09,hh+.11),outer(hw+.09,hh+.11),c,d,'#b4b4a9',[0,-1,0]);
        masonry.quad(outer(-hw-.09,-hh-.12),outer(hw+.09,-hh-.12),b,a,white);
        masonry.quad(outer(-hw-.09,-hh-.12),a,d,outer(-hw-.09,hh+.11),stone,face.normal);
        masonry.quad(b,outer(hw+.09,-hh-.12),outer(hw+.09,hh+.11),c,white,face.normal);
      }
      if(side===0 && bottom<11) {
        const upper=top-.39,lower=bottom===0?2.06:bottom;
        face.panel(0,(upper+lower)/2,width*.43,upper-lower,'#5b8288');
        for(let j=-3;j<=3;j++) face.panel(j*width*.055,(upper+lower)/2,.067,upper-lower,'#bdc7be',.041);
        for(let y=lower+1.58;y<upper;y+=1.70) face.panel(0,y,width*.43,.10,white,.044);
      }
    }
  }
  lotBox(block,0,.26,0,courtW,.52,courtD,'#a4aba0');
  const front=depth/2;
  lotBox(block,0,1.98,8.27,17.95,.37,1.71,white);
  for(const u of [-7.3,-3.65,0,3.65,7.3]) lotBox(block,u,.91,8.41,.52,1.82,.58,stone);
  for(const dir of [-1,1]) for(let n=0;n<10;n++) {
    const h=(n+1)*.215;
    lotBox(block,dir*9.20,h/2,front+2.17-n*.255,2.64,h,.27,n%2?stone:white);
  }
  for(const dir of [-1,1]) {
    const x=dir*10.39;
    masonry.tube(lotPoint(block,x,.64,front+2.27),lotPoint(block,x,2.82,front-.24),.045,.045,'#9baba6',6);
    for(let i=0;i<4;i++) lotBox(block,x,.37+i*.67,front+2.19-i*.78,.065,.72,.065,'#889a95');
  }
  facadeName(facadeOf(block),'深圳大学图书馆','',2.50,8.8,.70,white,'#624334');
}

function glassPassage(start,end,y,w=2.40) {
  const dx=end[0]-start[0], dz=end[2]-start[2], span=Math.hypot(dx,dz);
  const lot=campusFootprint((start[0]+end[0])/2,(start[2]+end[2])/2,span,w,-Math.atan2(dz,dx));
  lotBox(lot,0,y-.13,0,span,.26,w,'#b5bab2');
  lotBox(lot,0,y+1.29,0,span,2.50,w-.14,'#63858c');
  lotBox(lot,0,y+2.58,0,span+.13,.23,w+.24,'#dcdfd5');
  for(const side of [-1,1]) {
    for(let i=0;i<=Math.ceil(span/1.25);i++)
      lotBox(lot,-span/2+i*span/Math.ceil(span/1.25),y+1.28,side*(w-.09)/2,.077,2.52,.074,'#cdd8d1');
    lotBox(lot,0,y+1.12,side*(w-.061)/2,span,.077,.075,'#b4c7c3');
  }
}

function huiwenWalkways() {
  for(const [a,b,y] of [[0,1,4.62],[1,2,4.91],[3,4,4.68]]) {
    const first=huiwenWings[a], second=huiwenWings[b];
    const axis=normalize([second.x-first.x,0,second.z-first.z]);
    const terrace=(block,sign)=>{
      const distance=Math.min((block.w/2-.27)/Math.abs(axis[0]*block.c-axis[2]*block.s),
        (block.depth/2-.27)/Math.abs(axis[0]*block.s+axis[2]*block.c));
      return add([block.x,0,block.z],scale(axis,sign*distance));
    };
    glassPassage(terrace(first,1),terrace(second,-1),y,2.22);
  }
}

function huizhiBuilding(block) {
  const [entry,reading,annex]=block.parts, white='#efeee5', shadow='#bfc1b9';
  const h=entry.height, base=4.10, wallDepth=.45;
  const inner=lotPart(entry,0,.76,entry.w-1.60,entry.depth-1.68,h-.43);
  lotBox(inner,0,inner.height/2,0,inner.w,inner.height,inner.depth,'#c4ccc7');
  for(let side=0;side<4;side++) {
    const back=facadeOf(inner,side);
    for(let i=0;i<5;i++) glazing(back,1.13+2.25*i,Math.ceil(back.width/1.7),'#476770',1.47);
  }
  // Rays through the oculi reach glazing set behind the white concrete screen.
  // Square cells share their boundaries. The inner reveal has actual depth.
  function screen(side,rows) {
    const face=facadeOf(entry,side), cols=rows[0].length;
    const cw=face.width/cols, ch=(h-base)/rows.length;
    for(let row=0;row<rows.length;row++) for(let col=0;col<cols;col++) {
      const u=(col+.5-cols/2)*cw,y=base+(row+.5)*ch;
      const r=rows[row][col]*Math.min(cw,ch);
      if(r===0) { face.panel(u,y,cw,ch,white,0); continue; }
      for(let i=0;i<24;i++) {
        const sidePoint=(index,rim,v)=>{
          const a=(index/24+.125)*TAU, x=Math.cos(a), dy=Math.sin(a);
          const k=Math.max(Math.abs(x),Math.abs(dy));
          return face.point(u+(rim?x*r:x*cw/(2*k)),y+(rim?dy*r:dy*ch/(2*k)),v);
        };
        const a=sidePoint(i,true,0),b=sidePoint(i+1,true,0);
        masonry.quad(sidePoint(i,false,0),sidePoint(i+1,false,0),b,a,white,face.normal);
        const backA=sidePoint(i,true,-wallDepth),backB=sidePoint(i+1,true,-wallDepth);
        const angle=((i+.5)/24+.125)*TAU;
        const n=[-Math.cos(face.yaw)*Math.cos(angle),-Math.sin(angle),Math.sin(face.yaw)*Math.cos(angle)];
        masonry.quad(a,b,backB,backA,shadow,n);
      }
    }
  }
  screen(2,[[.29,.39,0,.31,.29],[.37,0,.39,.35,0],[0,.29,.35,0,.37]]);
  screen(3,[[0,.32,.39,0,.29,0],[.41,0,.32,.39,0,.35],[0,.32,0,.29,.38,0]]);
  for(const side of [0,1]) {
    const face=facadeOf(entry,side);
    face.panel(0,(base+h)/2,face.width,h-base,white,0);
    for(let i=0;i<3;i++) glazing(face,base+1.20+2.32*i,Math.ceil(face.width/1.82),'#69818a',1.22);
  }
  lotBox(entry,0,h+.04,0,entry.w+.15,.22,entry.depth+.15,white);
  for(const sign of [-1,1]) lotBox(entry,sign*(entry.w/2-.24),base/2,-entry.depth*.43,.48,base,.70,white);
  for(const part of [reading,annex]) {
    lotBox(part,0,part.height/2,0,part.w,part.height,part.depth,white);
    lotBox(part,0,part.height+.08,0,part.w+.21,.24,part.depth+.21,white);
    for(let side=0;side<4;side++) {
      const face=facadeOf(part,side);
      for(let i=0;i<(part===annex?2:5);i++)
        glazing(face,1.18+2.20*i,Math.ceil(face.width/1.60),'#64808b',1.54);
    }
  }
  glassPassage(lotPoint(reading,0,0,-reading.depth/2),lotPoint(annex,0,0,annex.depth/2),4.14,2.43);
  // The entrance canopy is an open orthogonal concrete grid, with the courtyard visible below.
  const canopy=lotPart(block,-2.26,-11.25,17.56,7.85,4.80);
  for(let i=0;i<=8;i++) lotBox(canopy,(i/8-.5)*canopy.w,4.59,0,.27,.44,canopy.depth,white);
  for(let i=0;i<=4;i++) lotBox(canopy,0,4.59,(i/4-.5)*canopy.depth,canopy.w,.44,.28,white);
  for(const u of [-canopy.w/2,canopy.w/2]) {
    lotBox(canopy,u,2.21,-canopy.depth/2+.12,.32,4.42,.35,white);
    campusFixtures.push(lotPart(canopy,u,-canopy.depth/2+.12,.32,.35,4.42));
  }
  const title=facadeOf(entry,2);
  facadeName(title,'图书馆南馆','',base+.31,6.18,.59,white,'#383e3a');
  const court=lotPart(block,-5.85,-12.15,10.55,6.04,0);
  lotBox(court,0,.011,0,court.w,.039,court.depth,'#c4b8aa',pavement);
  const pool=lotPart(block,-8.05,-13.33,4.34,1.37,.38);
  lotBox(pool,0,.19,0,pool.w,.38,pool.depth,'#a9aaa1',scenery);
  lotBox(pool,0,.39,0,pool.w-.24,.037,pool.depth-.23,'#7fa9a7',scenery);
  campusFixtures.push(pool);
}

function yuanpingGym(block) {
  const {w,depth}=block, white='#e9e9e1', blue='#79898c', wall='#c5c6bb';
  lotBox(block,0,2.95,0,w,5.90,depth,wall);
  const roof=(x,z)=>lotPoint(block,x,5.90+3.16*(1-(x/(w*.52))**2),z);
  const panels=16,half=depth*.52;
  for(let i=0;i<panels;i++) {
    const a=(i/panels-.5)*w*1.04,b=((i+1)/panels-.5)*w*1.04;
    const p=roof(a,-half),q=roof(a,half),r=roof(b,half),s=roof(b,-half);
    masonry.quad(p,q,r,s,i%4===0?'#c7ccc8':'#dcdfda',normalize(cross(subtract(q,p),subtract(r,p))));
    for(const sign of [-1,1]) {
      const z=sign*depth/2;
      masonry.quad(lotPoint(block,a,5.86,z),lotPoint(block,b,5.86,z),roof(b,z),roof(a,z),white,[sign*block.s,0,sign*block.c]);
    }
  }
  for(let j=0;j<4;j++) {
    const v=(j-1.5)*depth*.205,extent=w*.46;
    for(const sign of [-1,1]) {
      const outer=roof(sign*extent,v),inner=roof(sign*extent*.34,v);
      const peak=add(inner,[0,1.28,0]);
      const back=roof(sign*extent*.34,v+2.63),tail=roof(sign*extent,v+2.63);
      masonry.triangle(outer,peak,inner,blue,[block.s,0,block.c]);
      masonry.quad(outer,peak,back,tail,white,normalize(cross(subtract(tail,outer),subtract(peak,outer))));
      masonry.tube(outer,peak,.073,.073,'#f1f1e9',5,false);
    }
  }
  for(let side=0;side<4;side++) {
    const face=facadeOf(block,side);
    glazing(face,3.5,Math.ceil(face.width/1.66),'#667f83',1.94);
    for(let i=0;i<=8;i++) {
      const p=face.point((i/8-.5)*(face.width-.5),2.86,.07);
      masonry.box(p,[.26,5.72,.41],white,face.yaw);
    }
  }
  facadeName(facadeOf(block),'元平体育馆','',5.11,7.22,.69,white,'#534d47');
}

function campusAuditorium(block) {
  const {w,depth}=block, brick='#a65e46',trim='#e5dcca';
  lotBox(block,0,2.80,0,w,5.60,depth,brick);
  for(let side=0;side<4;side++) {
    const face=facadeOf(block,side);
    glazing(face,2.49,Math.ceil(face.width/1.72),'#5c7470',2.53);
    for(let i=0;i<=6;i++) {
      const u=(i/6-.5)*(face.width-.45);
      masonry.box(face.point(u,3.08,.085),[.37,6.16,.40],brick,face.yaw);
    }
    face.panel(0,4.23,face.width,.22,trim,.065);
  }
  lotBox(block,0,5.73,0,w+.20,.28,depth+.24,trim);
  lotBox(block,0,5.92,0,w-.85,.24,depth-1.12,'#c78162');
  for(let i=0;i<15;i++) lotBox(block,(i/14-.5)*(w-1.55),6.09,0,.12,.17,depth-1.58,'#dda183');
  for(const sign of [-1,1]) {
    lotBox(block,sign*(w/2-.23),6.23,0,.46,1.18,depth,brick);
    lotBox(block,0,6.23,sign*(depth/2-.23),w,1.18,.46,brick);
  }
  facadeName(facadeOf(block),'演会中心','',4.83,5.1,.67,trim,'#654638');
}

function renderCampusLandmark(block) {
  switch(block.kind) {
    case 'auditorium': campusAuditorium(block); break;
    case 'huiyuan': huiyuanBuilding(block); break;
    case 'huiwen': huiwenBuilding(block); break;
    case 'huizi': huiziBuilding(block); break;
    case 'huixing': huixingBuilding(block); break;
    case 'huidian': huidianBuilding(block); break;
    case 'huizhi': huizhiBuilding(block); break;
    case 'yuanping': yuanpingGym(block); break;
    case 'zhiyi': zhiyiBuilding(block); break;
    case 'academic': {
      const h=block.floors*2.28+1;
      lotBox(block,0,h/2,0,block.w,h,block.depth,'#d7d1bb');
      lotBox(block,0,h+.10,0,block.w+.34,.23,block.depth+.36,'#b4bbad');
      for(let side=0;side<4;side++) {
        const face=facadeOf(block,side);
        for(let i=0;i<block.floors;i++) glazing(face,1.64+2.28*i,Math.floor(face.width/1.68));
      }
      facadeName(facadeOf(block),block.name,block.use,2.66,Math.min(block.w*.58,8.7),.73);
      break;
    }
    default: return false;
  }
  return true;
}

function entranceFrame({xy,facing}) {
  const frame=campusFootprint(xy[0],xy[1],0,0,Math.atan2(facing[0],facing[2]));
  const p=(u,y,v)=>lotPoint(frame,u,y,v);
  const box=(u,y,v,w,h,d,color,mesh=scenery)=>lotBox(frame,u,y,v,w,h,d,color,mesh);
  const solid=(u,v,w,d,h,padding=0)=>campusFixtures.push(lotPart(frame,u,v,w+padding,d+padding,h));
  return {frame,p,box,solid,yaw:frame.yaw};
}

// Street-level west gate and the planted approach, referenced against the Yuehai campus photographs.
function westGateWing(f,side) {
  const {p,box,solid}=f;
  // A rounded inner end sweeps into a longer curved tile wall along the boundary.
  const profile=[];
  for(let i=0;i<=10;i++) {
    const a=(.5+i/10)*Math.PI;
    profile.push([9.71+2.03*Math.cos(a),7.85+1.67*Math.sin(a)]);
  }
  profile.push([12.40,6.10],[15.05,5.64],[17.00,4.64],[17.34,5.60],
    [15.12,7.40],[12.58,8.94]);
  function skin(scaleAt,low,high,shade) {
    const center=p(side*11.35,high,7.35);
    for(let i=0;i<profile.length;i++) {
      const a=profile[i],b=profile[(i+1)%profile.length];
      const point=([u,v],height)=>p(side*(11.35+(u-11.35)*scaleAt),height,7.35+(v-7.35)*scaleAt);
      const l=point(a,low),r=point(b,low),top=point(b,high),end=point(a,high);
      const n=normalize(scale(cross(subtract(r,l),UP),-side));
      scenery.quad(l,r,top,end,shade,n);
      if(high>=3.25) scenery.triangle(center,end,top,'#dadbd6');
    }
  }
  skin(.98,.04,.47,'#a7a8a0');
  skin(1,.47,3.20,'#e9e9e4');
  for(const y of [.94,1.42,1.9,2.38,2.86]) skin(1.002,y,y+.028,'#c9ccc6');
  skin(1.017,3.20,3.35,'#f7f5ec');
  box(side*11.1,.69,5.79,4.08,1.33,1.07,'#bcbbb0');
  box(side*11.1,1.40,5.79,4.23,.16,1.18,'#e7e7dc');
  solid(side*9.64,7.85,3.73,2.9,3.35);
  solid(side*12.26,7.52,2.90,2.22,3.35);
  solid(side*15.08,7.49,3.37,1.12,3.35);
  // The guard booth sits back on the campus side of the white wall.
  gateBooth(f,side*10.62,5.96,2.45,2.22,'#c8c9c1','#58696a');
  for(let i=0;i<5;i++) box(side*5.01,.039,6.24+.5*i,2.38,.013,.17,'#dedbc7',masonry);
}

function gatePalm(f, u, v, h) {
  emitGatePalm({ point: f.p, u, v, height: h }, { scenery, foliage, solid: f.solid });
}

function lideGate(gate) {
  const f=entranceFrame(gate),{p,box,solid,yaw}=f;
  box(0,.009,4.40,27.5,.043,15.8,'#c4c1b4',pavement);
  lawnPatch(scenery,()=>scenery.ellipsoid(p(0,.026,4.27),[1.85,.105,4.04],'#83a34e',26,4,0,yaw));
  box(0,.22,3.66,3.64,.30,1.75,'#aaa59a');
  box(0,.41,3.66,3.44,.13,1.38,'#855745');
  box(0,1.14,3.68,3.36,1.37,.84,'#a36c58');
  box(0,1.85,3.68,3.40,.075,.87,'#b28069');
  solid(0,3.66,3.62,1.67,1.90);
  const name=signCanvas(768,250,(ctx,w,h)=>{
    ctx.fillStyle='#a66e57';ctx.fillRect(0,0,w,h);
    const grain=randomSource(1983);
    for(let i=0;i<5200;i++){
      ctx.fillStyle=i%3?'rgba(66,39,31,.14)':'rgba(245,219,192,.29)';
      ctx.fillRect(grain()*w,grain()*h,1+grain()*2.6,1+grain()*1.4);
    }
    ctx.fillStyle='#272620';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font='bold 140px KaiTi, STKaiti, FangSong, "Noto Serif CJK SC", serif';
    ctx.fillText('深圳大学',w*.5,h*.50);
  });
  plate(name,p(0,1.15,4.114),3.28,1.25,yaw);
  plate(name,p(0,1.15,3.246),3.28,1.25,yaw+Math.PI);
  for(const side of [-1,1]) {
    westGateWing(f,side);
    gatePalm(f,side*10.85,side === -1 ? 6.8 : 2.38,4.25);
    gatePalm(f,side*14.35,side === -1 ? 7.7 : 3.26,4.85);
    for(let j=0;j<4;j++) {
      const u=side*(8.8+j*1.62),v=10.22-j*.49;
      foliage.ellipsoid(p(u,.33,v),[.99,.36,.51],j%2?'#849e54':'#739452',8,4,0,yaw);
    }
  }
  const label=namedSign('立德门','','#e8e9e3','#724941');
  plate(label,p(11.01,1.90,9.37),1.42,.39,yaw);
}

function sundialGarden(court) {
  // Shenzhen University Facilities Department, Campus Walk, 2023: sundial lawn on the west entrance axis.
  const lot=campusFootprint(court.xy[0]-5.05,court.xy[1],9.6,6.45);
  lotBox(lot,0,.01,0,lot.w+1.0,.040,lot.depth+1.0,'#c7c1b2',pavement);
  lawnPatch(scenery,()=>lotBox(lot,0,.039,0,lot.w,.038,lot.depth,'#84a35d',scenery));
  const pos=(x,y,z)=>lotPoint(lot,x,y,z);
  scenery.tube(pos(0,.06,0),pos(0,.25,0),1.61,1.61,'#b8b9b1',32);
  scenery.tube(pos(0,.25,0),pos(0,.43,0),.91,.86,'#a0a6a0',32);
  scenery.ellipsoid(pos(0,1.00,.67),[.90,.82,.87],'#909c99',28,12);
  const center=pos(0,1.84,-.03),tilt=22.53*Math.PI/180;
  const axis=[0,Math.sin(tilt),-Math.cos(tilt)],upInPlane=[0,Math.cos(tilt),Math.sin(tilt)];
  const mark=(a,r,offset)=>add(add(center,scale(axis,offset)),[Math.cos(a)*r,
    Math.sin(a)*r*upInPlane[1],Math.sin(a)*r*upInPlane[2]]);
  scenery.tube(add(center,scale(axis,-.095)),add(center,scale(axis,.095)),1.50,1.50,'#b8bfba',48);
  for(let i=0;i<48;i++) {
    const a=i*TAU/48,length=i%4?.12:.26;
    scenery.quad(mark(a-.007,1.40,.101),mark(a+.007,1.40,.101),
      mark(a+.007,1.40-length,.101),mark(a-.007,1.40-length,.101),'#6a6c5a',axis);
  }
  scenery.tube(add(center,scale(axis,-.32)),add(center,scale(axis,2.12)),.079,.017,'#555e5d',9);
  campusFixtures.push(lotPart(lot,0,0,2.74,2.08,3.12));
}

function gateBooth(gate,u,v,w,d,skin,glass) {
  const {box,solid}=gate;
  box(u,.24,v,w,.48,d,skin);
  box(u,1.34,v,w-.16,1.76,d-.15,glass);
  box(u,2.29,v,w+.25,.25,d+.25,skin);
  for(const a of [-1,1]) for(const b of [-1,1])
    box(u+a*(w-.13)/2,1.35,v+b*(d-.13)/2,.084,1.91,.080,skin);
  for(let i=-1;i<=1;i++) box(u+i*w*.24,1.34,v+d*.473,.057,1.8,.040,skin);
  solid(u,v,w,d,2.44);
}

function foldedRoof({p},profile,front,back) {
  for(let i=1;i<profile.length;i++) {
    const [a,ha]=profile[i-1], [b,hb]=profile[i];
    const low=.23, slope=.45;
    const af=p(a,ha,front), bf=p(b,hb,front), ar=p(a,ha+slope,back), br=p(b,hb+slope,back);
    const under=vertex=>add(vertex,[0,-low,0]);
    const n=normalize(cross(subtract(bf,af),subtract(ar,af)));
    scenery.quad(af,bf,br,ar,i%2?'#c9d4d3':'#a4b5b6',n);
    scenery.quad(under(bf),under(af),under(ar),under(br),'#728587',scale(n,-1));
    scenery.quad(af,bf,under(bf),under(af),'#8a9c9c',normalize(cross(subtract(bf,af),[0,1,0])));
    scenery.quad(br,ar,under(ar),under(br),'#90a2a1',normalize(cross(subtract(ar,br),[0,1,0])));
  }
}

function ligongGate(gate) {
  const f=entranceFrame(gate), {p,box,yaw}=f;
  box(0,.009,1.54,20,.043,11.45,'#bebeb3',pavement);
  for(const s of [-1,1]) {
    gateBooth(f,s*6.57,-.42,3.27,3.18,'#d2d7d2','#5b7e83');
    for(const d of [-1.45,1.14]) {
      scenery.tube(p(s*5.82,.15,d),p(s*6.69,4.30,d),.097,.085,'#839493',6);
      scenery.tube(p(s*7.72,1.1,d),p(s*6.65,4.33,d),.068,.067,'#9aabaa',6);
    }
  }
  foldedRoof(f,[[-9.9,4.52],[-5.75,4.11],[-1.35,4.76],[3.05,4.28],[9.88,4.65]],1.52,-2.47);
  const sign=namedSign('深圳大学','立功门','#cbd3ce','#374a4b');
  plate(sign,p(6.57,1.77,1.14),3.02,.65,yaw);
  plate(sign,p(-6.57,1.77,-1.948),3.02,.65,yaw+Math.PI);
}

function liyanGate(gate) {
  const [x,z]=gate.xy;
  const f=entranceFrame({...gate,xy:[x-1.12,z+2.19]}), {p,box,yaw}=f;
  box(0,.01,0,15.2,.040,9.1,'#bdbbb0',pavement);
  for(const s of [-1,1]) gateBooth(f,s*6.64,-.83,2.60,3.10,'#b7b0a1','#5f7778');
  box(0,3.66,-.86,15.6,.41,3.47,'#a5aaa3');
  box(0,3.88,-.86,15.87,.14,3.67,'#d9d9ce');
  const sign=namedSign('立言门','','#b8beb5','#3d4e49');
  plate(sign,p(0,3.69,.886),4.19,.43,yaw);
}

function sideGate(gate) {
  const f=entranceFrame(gate), {p,box,solid,yaw}=f;
  const stone=gate.name==='立业门'?'#b7a892':'#c6c9c0';
  box(0,.009,.26,14.4,.040,7.24,'#bfbeb1',pavement);
  gateBooth(f,-5.8,-.71,2.72,2.99,stone,'#526d73');
  box(5.79,.87,.43,2.12,1.74,1.47,stone);
  box(5.79,1.80,.43,2.28,.14,1.61,'#deded2');
  solid(5.79,.43,2.12,1.47,1.87);
  for(const s of [-1,1]) {
    box(s*8.26,.58,0,2.59,1.16,.79,stone);
    solid(s*8.26,0,2.59,.79,1.16);
  }
  const sign=namedSign(gate.name,'深圳大学',stone,'#424c48');
  plate(sign,p(5.79,1.08,1.17),2.02,.68,yaw);
  plate(sign,p(5.79,1.08,-.312),2.02,.68,yaw+Math.PI);
}

function schoolGate(gate) {
  if(gate.name==='立德门') lideGate(gate);
  else if(gate.name==='立功门') ligongGate(gate);
  else if(gate.name==='立言门') liyanGate(gate);
  else if(gate.name==='立业门') newLiyemen(gate);
  else sideGate(gate);
}

function ovalPoint(lot,angle,width,length,y) {
  const round=width*.5;
  const u=Math.cos(angle)*round;
  const v=Math.sin(angle)*round+Math.sign(Math.sin(angle))*(length-width)*.5;
  return lotPoint(lot,u,y,v);
}

function stadiumBand(mesh,lot,width,length,band,y,color) {
  const edge=(angle,inset)=>ovalPoint(lot,angle,width-inset*2,length-inset*2,y);
  // Include both straight sides so all the lanes share clean joins at the bends.
  const angles=Array.from({length:66},(_,i)=>(i<33?0:-Math.PI)+.00001+(Math.PI-.00002)*(i%33)/32);
  for(let i=0;i<angles.length;i++) {
    const a=angles[i], b=angles[(i+1)%angles.length];
    mesh.quad(edge(a,0),edge(b,0),edge(b,band),edge(a,band),color);
  }
}

function athleticsTrack() {
  const lot=athleticsField, w=lot.w-.64,d=lot.depth-.6;
  lotBox(lot,0,.013,0,lot.w,.033,lot.depth,'#aeb3a0',pavement);
  stadiumBand(pavement,lot,w,d,3.03,.036,'#b86248');
  lawnPatch(pavement,()=>stadiumBand(pavement,lot,w-6.06,d-6.06,(w-6.06)/2,.036,'#709353'));
  for(let i=0;i<=4;i++) stadiumBand(masonry,lot,w-.12-i*1.40,d-.12-i*1.40,.034,.041,'#f0dcbd');
  const pitchW=w-10.5,pitchD=d-13.5;
  for(const s of [-1,1]) {
    lotBox(lot,s*pitchW/2,.042,0,.069,.015,pitchD,'#dbe1bc');
    lotBox(lot,0,.042,s*pitchD/2,pitchW,.015,.069,'#dbe1bc');
    lotBox(lot,0,.042,s*(pitchD/2-2.05),pitchW*.42,.015,.069,'#dbe1bc');
    for(let step=0;step<4;step++)
      lotBox(lot,s*(w/2+.69-step*.38),.26+step*.24,0,.39,.49+step*.48,d*.71,step%2?'#a8b5a8':'#d2d3bf',scenery);
    campusFixtures.push(lotPart(lot,s*(w/2+.04),0,1.64,d*.71,1.72));
  }
  lotBox(lot,0,.042,0,pitchW,.015,.062,'#dbe1bc');
  const name=namedSign('田径运动场','深圳大学','#727e6f','#e8e7d6');
  plate(name,lotPoint(lot,0,.78,d/2+.3),6.84,.75,lot.yaw);
}

function campusGroundDetails() {
  athleticsTrack();
  huiwenWalkways();
  sundialGarden(courts.find(court=>court.name==='时光广场'));
  const court=courts.find(({name})=>name==='天人广场');
  const lot=campusFootprint(...court.xy,court.w,court.d,.21);
  lotBox(lot,0,.012,0,lot.w,.040,lot.depth,'#ded2bf',pavement);
  for(let i=-3;i<=3;i++) lotBox(lot,i*2.13,.035,0,.034,.010,lot.depth-.42,'#c1b9a9',pavement);
  for(const s of [-1,1]) {
    lawnPatch(pavement,()=>lotBox(lot,s*4.85,.042,0,5.58,.036,3.31,'#80965e',pavement));
    lotBox(lot,s*4.86,.332,0,2.28,.60,.47,'#a29b87',scenery);
    campusFixtures.push(lotPart(lot,s*4.86,0,2.28,.47,.63));
  }
}

function landmarkClearance(x,z) {
  return !closeToBlock(x,z,athleticsField,1.9) && !campusFixtures.some(f=>closeToBlock(x,z,f,1.15)) &&
    !treeSetbacks.some(lot=>closeToBlock(x,z,lot)) &&
    !campusGates.some(g=>Math.hypot(x-g.xy[0],z-g.xy[1])<9.7);
}

function boundaryEdges() {
  for(const outline of campusOutlines) for(let i=0;i<outline.length;i++) {
    const a=outline[i],b=outline[(i+1)%outline.length];
    const d=Math.hypot(b[0]-a[0],b[1]-a[1]), yaw=-Math.atan2(b[1]-a[1],b[0]-a[0]);
    for(let m=0;m<d;m+=3.1) {
      const q=Math.min(d,m+3.06);
      const nearOpening=[m,(m+q)/2,q].some(along=>{
        const t=along/d, px=mix(a[0],b[0],t), pz=mix(a[1],b[1],t);
        return fenceOpenAt(px,pz);
      });
      const subs=nearOpening?5:1;
      for(let s=0;s<subs;s++) {
        const sm=mix(m,q,s/subs), sq=mix(m,q,(s+1)/subs);
        const c=(sm+sq)/2/d, x=mix(a[0],b[0],c), z=mix(a[1],b[1],c), len=sq-sm;
        if(fenceOpenAt(x,z)) continue;
        scenery.box([x,.33,z],[len,.66,.47],'#b4ac95',yaw);
        citySolid.push(campusFootprint(x, z, len, .47, yaw, 1.14));
        scenery.box([x,.68,z],[len,.10,.58],'#c8c0a9',yaw);
        if(Math.floor(m/3.1)%2===0 && s===0) scenery.box([x,.91,z],[.10,.46,.13],'#62796c');
        scenery.box([x,1.12,z],[len,.05,.2],'#5f746b',yaw);
      }
    }
  }
}

function drawFlyover() {
  const {path,half,from,to,crossing}=flyover, shoulder=half+.31;
  const surface=(frame,d,offset,rise=0)=>offsetVertex(frame,offset,flyoverHeight(d)+rise);
  const count=Math.ceil((to-from)/2.4);
  for(let i=0;i<count;i++) {
    const a=mix(from,to,i/count), b=mix(from,to,(i+1)/count);
    const fa=courseFrame(path,a), fb=courseFrame(path,b);
    const y1=flyoverHeight(a),y2=flyoverHeight(b);
    const rail=d=>.35*clamp((flyoverHeight(d)-.08)/1.8,0,1);
    const p=(u,h=0)=>surface(fa,a,u,h), q=(u,h=0)=>surface(fb,b,u,h);
    urban.quad(p(-half,.002),q(-half,.002),q(half,.002),p(half,.002),'#5a6765');
    const under=Math.min(.56,Math.max(y1,y2)-CITY_ASPHALT);
    urban.quad(p(shoulder,-under),q(shoulder,-under),q(-shoulder,-under),p(-shoulder,-under),'#89958d',[0,-1,0]);
    for(const s of [-1,1]) {
      const edge=s*shoulder, inner=s*half;
      const n=scale(fa.side,s), h1=rail(a),h2=rail(b);
      urban.quad(p(inner,h1),q(inner,h2),q(edge,h2),p(edge,h1),'#c4c6b8');
      urban.quad(p(inner,0),q(inner,0),q(inner,h2),p(inner,h1),'#b0b6ac',scale(n,-1));
      urban.quad(p(edge,-Math.min(under,y1-CITY_ASPHALT)),q(edge,-Math.min(under,y2-CITY_ASPHALT)),
        q(edge,h2),p(edge,h1),'#aeb4a8',n);
      urban.quad(p(s*(half-.18)-.032,.012),q(s*(half-.18)-.032,.012),
        q(s*(half-.18)+.032,.012),p(s*(half-.18)+.032,.012),'#dfddc3');
    }
  }
  for(let d=from+1.6;d<to-2;d+=6.8) {
    const a=courseFrame(path,d), b=courseFrame(path,d+3.45);
    urban.quad(surface(a,d,-.058,.014),surface(b,d+3.45,-.058,.014),
      surface(b,d+3.45,.058,.014),surface(a,d,.058,.014),'#e1d0a0');
  }
  for(const offset of [-49,-29,32,53]) {
    const d=crossing+offset, [x,,z]=along(path,d), y=flyoverHeight(d);
    const pillar={x,z,w:2.10,d:2.18,kind:'bridge-support'};
    citySolid.push(pillar);
    urban.box([x,(y-.52)/2,z],[pillar.w,y-.52,pillar.d],'#b6baaf');
    urban.box([x,y-.76,z],[3.55,.48,2.62],'#a5afa6');
    urban.box([x,.18,z],[2.43,.36,2.51],'#c2c4b5');
  }
}

function walkBridge() {
  const path=openStreets[2].path, d=pointDistance(path,[114,185]);
  const frame=courseFrame(path,d), half=path.width+2.8+1.73, top=5.58;
  const yaw=-Math.atan2(frame.side[2],frame.side[0]);
  const p=(on,y,across=0)=>add(offsetVertex(frame,on,y),scale(frame.f,across));
  scenery.box(p(0,top-.27),[half*2+.55,.54,3.26],'#ccd0c3',yaw);
  for(const side of [-1,1]) {
    scenery.box(p(0,top+.91,side*1.57),[half*2+.42,.12,.11],'#c5cbbd',yaw);
    for(let d=-half;d<half+.2;d+=1.75) scenery.box(p(d,top+.44,side*1.55),[.082,.9,.086],'#788f83',yaw);
  }
  for(const side of [-1,1]) {
    const foot=side*half, [x,,z]=p(foot,0);
    scenery.box(p(foot,(top-.27)/2),[1.52,top-.27,2.02],'#b1b9ad',yaw);
    citySolid.push({x,z,w:1.65,d:2.18});
    const stairs=21, run=.38;
    for(let i=0;i<stairs;i++) {
      const h=top*(1-(i+1)/stairs), offset=-(i+.5)*run;
      if(h>0) scenery.box(p(foot,h/2+.012,offset-1.55),[2.80,h,.39],'#c1c4b5',yaw);
    }
    for(const edge of [-1.36,1.36]) {
      const railStart=p(foot+edge,top+.85,-1.53);
      const railEnd=p(foot+edge,.90,-1.53-stairs*run);
      scenery.tube(railStart,railEnd,.047,.047,'#788c83',5);
      for(let i=0;i<=4;i++) {
        const at=lerpPoint(railStart,railEnd,i/4);
        scenery.tube(add(at,[0,-.88,0]),at,.034,.034,'#84958a',5);
      }
    }
    const base=p(foot,.006,-2.75-stairs*run);
    pavement.box(base,[3.15,.034,3.05],'#cec9b7',yaw);
  }
}

function officeTower(x,z,w,d,h,skin,band,kind) {
  citySolid.push({x,z,w:w+3.9,d:d+2.1,kind:'tower'});
  const roof = tint(skin,.72);
  urban.box([x,h*.5,z],[w,h,d],skin);
  urban.box([x,1.2,z],[w+3.5,2.4,d+2.05],'#c5c4b2');
  urban.box([x,2.37,z],[w+3.9,.32,d+2.1],kind===1?'#807665':'#91a9a3');
  urban.box([x,h+.21,z],[w+.64,.45,d+.51],tint(skin,1.16));
  for(let y=3.95;y<h-.45;y+=kind===1?2.22:2.06) {
    const strip = kind===1 ? .22 : .16;
    for (const side of [-1,1]) {
      wallPanel(urban,x,y,z+side*(d/2+.0475),w+.095,strip,band,0,side);
      wallPanel(urban,x+side*(w/2+.0475),y,z,d+.095,strip,band,side,0);
    }
  }
  const bars = Math.min(11,Math.max(3,Math.floor(w/2.35))), trim = tint(band,.94);
  for(let i=1;i<bars;i++) {
    const off=-.5+i/bars;
    for (const side of [-1,1]) {
      wallPanel(urban,x+w*off,h*.523,z+side*(d/2+.0715),.094,h*.953,trim,0,side);
      wallPanel(urban,x+side*(w/2+.07),h*.523,z+d*off,.096,h*.953,trim,side,0);
    }
  }
  if(kind===1) {
    for(let i=1;i<=3;i++) urban.box([x+w*(i*.223-.44),h*.48,z],[.77,h*.94,d+.41],'#b8a89b');
  }
  if (kind===0) urban.box([x-w*.12,h+1.7,z],[w*.33,3.05,d*.45],roof);
  else urban.box([x+w*.16,h+1.19,z-d*.13],[w*.42,2.04,d*.48],roof);
}

function clearSkylineView(x,z,h) {
  const lookouts=[[119,136],[169,-57]];
  for (let i=0;i<lookouts.length;i++) {
    const a=lookouts[i],b=cityIcons[i].xy;
    const dx=b[0]-a[0],dz=b[1]-a[1], span=dx*dx+dz*dz;
    const t=((x-a[0])*dx+(z-a[1])*dz)/span;
    if (t<.08||t>.92) continue;
    if (Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz)<39) h=Math.min(h,8+t*(i===0?61:87));
  }
  return h;
}

// Use the same GCJ-02 projection as the campus gates. Smaller, unnamed
// buildings represent their block's land use on the compressed street grid.
const [parkX,parkZ]=geo(22.536629,113.929473);
const lixiangPark=campusFootprint(parkX,parkZ,130,167);
const parkOutline=[[-65,-68],[-52,-83],[50,-83],[65,-70],[65,62],[49,83],[-48,83],[-65,67]]
  .map(([dx,dz])=>[parkX+dx,parkZ+dz]);
const parkWalkIndex=indexStreets(parkWalks);
function onParkWalk(x,z) {
  return parkWalkIndex.get(streetCell(x,z))?.some(seg=>streetGapSquared(seg,x,z)<=(seg.path.width+.1)**2)??false;
}

const perimeterLots=[];
function addStreetBlock(name,style,x,z,w,d,h,side) {
  perimeterLots.push({...campusFootprint(x,z,w,d,0,h),name,style,side});
}
addStreetBlock('Southizzahut 大厦','tower',...geo(22.540517,113.934497),29,20,69,0);
addStreetBlock('深圳虚拟大学园','research',...geo(22.535663,113.944976),39,17,19,3);
addStreetBlock('软件产业基地 3 栋','research',...geo(22.523511,113.936841),36,21,34,2);
addStreetBlock('软件产业基地 1 栋 C 座','research',...geo(22.524498,113.941099),24,19,33,2);
// Shennan Avenue, the R&D district east of campus, and the mixed-use
// residential streets between Nanhai Avenue and the Xuefu Road area.
for(const [style,side,blocks] of [
  ['research',0,[[-388,-268,42,17,19],[-323,-279,48,18,24],[-202,-279,34,19,22],
    [18,-280,34,19,26],[109,-280,35,17,28],[190,-263,35,17,25],[267,-250,36,16,22],[365,-248,43,19,27],
    [-75,-400,34,21,21],[-77,-349,34,19,25],[-167,-392,28,24,19]]],
  ['research',3,[[323,-169,28,19,28],[311,-121,26,25,19],[289,-74,25,26,22],[254,-27,29,20,21],
    [224,18,27,18,19],[222,69,29,24,27],[224,112,29,23,19],[373,-33,44,20,18]]],
  ['housing',1,[[-161,-11,24,19,16],[-171,51,25,23,19],[-190,101,24,23,21],
    [-218,153,25,25,17],[-251,205,23,22,20],[-278,290,25,21,22],[-294,346,28,22,21],[-310,402,26,25,17]]],
  ['housing',2,[[-365,280,27,17,16],[-317,289,35,21,17],[-179,301,26,19,21],
    [-134,303,27,20,16],[-84,302,30,21,23],[-36,302,26,19,19],[10,294,24,19,22]]],
  ['research',2,[[69,257,24,15,18],[110,216,29,19,16],[145,209,23,14,15],
    [174,340,40,20,23],[89,351,36,21,19],[355,183,24,18,20]]]
]) for(const [x,z,w,d,h] of blocks) addStreetBlock('',style,x,z,w,d,h,side);

function perimeterConflict(x,z,w,d) {
  const intersects=lot=>Math.abs(x-lot.x)<(w+lot.w)/2+1.5&&Math.abs(z-lot.z)<(d+lot.depth)/2+1.5;
  return intersects(lixiangPark)||perimeterLots.some(intersects);
}

/** Legacy 2.1.2 street block retained as the structural base for 2.2.0 facade details. */
function drawStreetBlock(lot) {
  const {w,depth:d,side,style}=lot;
  const h=clearSkylineView(lot.x,lot.z,lot.height);
  const homes=style==='housing',tower=style==='tower';
  const wall=homes?'#cbbba5':tower?'#598493':'#9eaeb0',glass=homes?'#697b78':'#5e7d85';
  // Keep the podium, roof and facade panels inside the solid footprint.
  lotBox(lot,0,1.53,0,w,3.06,d,homes?'#988775':'#9aaba8',urban);
  lotBox(lot,0,(h+3)/2,0,w-2.8,h-3,d-2.8,wall,urban);
  lotBox(lot,0,h-.16,0,w-2.3,.32,d-2.3,'#d1cfbd',urban);
  for(let s=0;s<4;s++) {
    const front=facadeOf(lot,s,1.34);
    const stripe=(y,width,height,color)=>wallPanel(urban,...front.point(0,y,.04),width,height,color,front.normal[0],front.normal[2]);
    const floorPitch=homes?2.5:3.0;
    for(let y=4.65;y<h-.8;y+=floorPitch) stripe(y,front.width-4,homes?.78:1.25,glass);
    if(s===side||tower) {
      const frame=homes?'#c1ac92':'#c3d0cb';
      for(let u=-front.width/2+4;u<front.width/2-2;u+=homes?4.3:6) {
        const p=front.point(u,(h+3.1)/2,.13);
        wallPanel(urban,...p,homes?.65:.26,h-3.1,frame,front.normal[0],front.normal[2]);
      }
    }
  }
  const frontage=facadeOf(lot,side);
  const bays=Math.max(2,Math.floor(frontage.width/4.2));
  for(let i=0;i<bays;i++) {
    const pitch=frontage.width/bays,p=frontage.point((i+.5-bays/2)*pitch,1.34,.04);
    wallPanel(urban,...p,pitch-.55,2.28,i%3?'#586e71':'#526768',frontage.normal[0],frontage.normal[2]);
  }
  if(homes) {
    for(let i=0;i<bays;i++) {
      const u=(i+.5-bays/2)*frontage.width/bays;
      urban.box(frontage.point(u,2.77,-.22),[frontage.width/bays-.24,.23,1.0],
        ['#798f82','#ab806c','#a69a77'][i%3],frontage.yaw);
    }
  } else {
    urban.box(frontage.point(0,3.18,-.6),[frontage.width*.56,.24,1.65],'#aebcb8',frontage.yaw);
    for(const sign of [-1,1]) urban.box(frontage.point(sign*frontage.width*.24,1.48,-.11),
      [.22,2.96,.22],'#c3c9c2',frontage.yaw);
  }
  if(lot.name) {
    const y=tower?h-3.5:4.6;
    plate(namedSign(lot.name,'',tower?'#486977':'#596e70','#f1efe2'),
      frontage.point(0,y,tower?-1.17:-1.20),Math.min(frontage.width*.78,tower?14:11),tower?2.5:1.7,frontage.yaw);
  }
  citySolid.push({x:lot.x,z:lot.z,w,d,kind:'frontage',name:lot.name});
}

function drawLixiangPark() {
  lawnPatch(pavement,()=>londonPaving(pavement,parkOutline,.011,'#79975e'));
  for(const path of parkWalks) ribbon(pavement,path,-path.width,path.width,.023,'#c7bba4',0,path.length,1.4);
  // Low-detail tree crowns share the existing foliage mesh. Keep the through paths clear.
  for(let row=0;row<7;row++) for(let col=0;col<7;col++) {
    const x=parkX-54+col*17+(row%2)*3,z=parkZ-68+row*22+(col%3)*2;
    if(!inOutline(x,z,parkOutline)||parkWalks.some(path=>path.rows.some(({p})=>Math.hypot(x-p[0],z-p[2])<5))) continue;
    const h=3.5+(row+col)%3*.6;
    scenery.tube([x,0,z],[x,h,z],.23,.15,'#796953',6);
    foliage.ellipsoid([x,h,z],[2.5,2.0,2.7],['#61844e','#75935c','#648653'][(row+col)%3],8,4);
    treeSites.push({x,z,r:2.7,color:1});
  }
  const x=parkX+5,z=parkZ+12;
  pavement.tube([x,.016,z],[x,.18,z],3.1,3.1,'#c4b8a2',16);
  scenery.tube([x,.18,z],[x,1.50,z],1.18,1.85,'#ae795c',12);
  scenery.ellipsoid([x,2.0,z],[1.77,1.58,1.77],'#bbd3ab',14,7);
  citySolid.push({x,z,w:3.6,d:3.6,kind:'sculpture'});
}

function denseBlocks() {
  const clusters = [
    {x:-159,z:33,nx:4,nz:5,stepX:-26,stepZ:38,lo:25,hi:78,tint:1},
    {x:-191,z:-177,nx:3,nz:3,stepX:-38,stepZ:-54,lo:32,hi:87,tint:1},
    {x:-88,z:-277,nx:9,nz:3,stepX:44,stepZ:-35,lo:30,hi:115,tint:0},
    {x:221,z:-175,nx:4,nz:10,stepX:40,stepZ:38,lo:33,hi:103,tint:0},
    {x:-212,z:281,nx:9,nz:3,stepX:50,stepZ:43,lo:27,hi:88,tint:0},
    {x:239,z:283,nx:5,nz:5,stepX:46,stepZ:56,lo:50,hi:126,tint:0},
  ];
  const office=['#608796','#6393a0','#6b979e','#789fa4','#78929d','#629da1','#8b9f9e','#81a6ac'];
  const residence=['#b4aa99','#a9a394','#c1b39f','#ac9f95','#b5a99b'];
  for(const c of clusters) for(let i=0;i<c.nx;i++) for(let j=0;j<c.nz;j++) {
    const x=c.x+i*c.stepX+range(-7,7), z=c.z+j*c.stepZ+range(-9,9);
    if(inCampus(x,z)||campus.some(b=>Math.hypot(b.x-x,b.z-z)<23)
      || openStreets.some(({path})=>path.rows.some(({p})=>Math.hypot(x-p[0],z-p[2])<path.width+12))
      || cityIcons.some(g=>Math.hypot(g.xy[0]-x,g.xy[1]-z)<64)) continue;
    const w=range(14,28),d=range(14,28), h=range(c.lo,c.hi)*(i===0?.73:1);
    const color=choose(c.tint?residence:office);
    if(!roadClearsBuilding(x,z,(w+3.9)/2,(d+2.1)/2)) continue;
    if(perimeterConflict(x,z,w+8.6,d+8.2)||citySolid.some(b=>
      Math.abs(x-b.x)<(w+3.9+b.w)/2+1&&Math.abs(z-b.z)<(d+2.1+b.d)/2+1)) continue;
    officeTower(x,z,w,d,clearSkylineView(x,z,h),color,tint(color,c.tint?.72:.81),c.tint);
    pavement.box([x,.008,z],[w+8.6,.024,d+8.2],c.tint?'#c4b7a4':'#acb8ac');
  }
  // Lower street walls and storefront plinths break up the tower frontage across Nanhai Avenue.
  for (const [x,z,w,d,h] of [[-158,23,24,26,12],[-169,63,24,22,16],[-185,112,21,25,10],[-260,226,34,22,15],[-79,-276,32,12,13],[35,-278,34,16,19]]) {
    if(!roadClearsBuilding(x,z,(w+3.9)/2,(d+2.1)/2)) continue;
    if(perimeterConflict(x,z,w+3.9,d+2.1)||citySolid.some(b=>
      Math.abs(x-b.x)<(w+3.9+b.w)/2+1&&Math.abs(z-b.z)<(d+2.1+b.d)/2+1)) continue;
    officeTower(x,z,w,d,h,'#b4ae9f','#7b8a79',1);
  }
}

function shenzhenLandmarks() {
  const [tx,tz]=cityIcons[0].xy;
  const steel='#658f9a', band='#607a82';
  officeTower(tx-18.5,tz-6.4,24,22.5,103,steel,band,0);
  officeTower(tx+19.5,tz+5.3,26,25.5,129,'#587e89','#526d77',0);
  const yaw=-Math.atan2(11.7,38);
  for(const [y,d] of [[21,8.2],[50,10.0],[84,9.5]]) {
    urban.box([tx+.2,y,tz-.55],[26.0,4.8,d], '#af7d53',yaw);
    urban.box([tx+.2,y-.55,tz-1.45],[26.24,2.64,d+.16],'#946a51',yaw);
    urban.box([tx+.2,y+2.5,tz-.55],[27.1,.32,d+.48],'#bb926b',yaw);
  }

  const [bx,bz]=cityIcons[1].xy, height=175;
  const steps=38, columns=30;
  const vertex = (i,j) => {
    const t=j/steps,a=TAU*i/columns;
    const crown=Math.max(0,(t-.64)/.36);
    const r=19.5*(.88+.22*Math.sin(t*Math.PI))*(1-.96*crown*crown);
    return [bx+Math.cos(a)*r,height*t,bz+Math.sin(a)*r];
  };
  for(let j=0;j<steps;j++) for(let i=0;i<columns;i++) {
    const a=TAU*(i+.5)/columns;
    urban.quad(vertex(i,j),vertex(i+1,j),vertex(i+1,j+1),vertex(i,j+1),i%3?'#7aa1a6':'#a7c2bd',[Math.cos(a),.11,Math.sin(a)]);
  }
  for(let i=0;i<columns;i+=2) for(let j=0;j<steps;j+=2) {
    urban.tube(vertex(i,j),vertex(i,Math.min(steps,j+2)),.20,.12,'#9cbab5',4,false);
  }
  urban.box([bx,1.75,bz],[40,3.5,40],'#ccc9b8');
}

function metroEntrance() {
  const main=openStreets[1].path;
  const anchor=courseFrame(main,pointDistance(main,metroStop));
  const [x,,z]=offsetVertex(anchor,-(main.width+6.4),0);
  citySolid.push({x,z,w:10.7,d:4.9});
  urban.box([x,.16,z],[10.7,.32,4.9],'#c7c9ba');
  for (const off of [-4.52,4.52]) {
    urban.box([x+off,1.62,z],[.22,3.24,4.51],'#8aaca5');
    urban.box([x+off,2.90,z],[.38,.23,4.52],'#d2dacf');
  }
  urban.box([x,3.24,z],[10.06,.25,5.02],'#a9b3a6');
  urban.box([x,.91,z-2.12],[9.25,1.78,.17],'#7d8c87');
  const label=namedSign('深大站','SHENZHEN UNIVERSITY','#376e69','#f1edda');
  plate(label,[x,2.85,z+2.43],5.75,.95);
  placeTravelSign(x+4.3,z+2.53,'站点旅行','选择目的地');
}

function vehicleModel(paint, bus) {
  const model = new Shape();
  emitCityTrafficVehicle({ paint, bus }, { shape: model });
  return model;
}

function modelTraffic() {
  const palette=['#daddd0','#8f9e99','#b06a51','#527d7a','#b5b7aa','#679783'];
  const models=palette.map(c=>vehicleModel(c,false));
  models.push(vehicleModel('#5d9f92',true));
  for(let roadId=0;roadId<3;roadId++) {
    const p=openStreets[roadId].path;
    const count = roadId===0?17:roadId===1?13:8;
    for(let i=0;i<count;i++) {
      const dir=i%2?1:-1;
      cityVehicles.push({path:p,model:models[i%8===0?models.length-1:i%palette.length],direction:dir,
        offset:dir*p.width*(i%3===0?.67:.42),start:(i+.3)/count*p.length,speed:range(8.3,14.5),
        halfL:i%8===0?4.4:2.25,halfW:i%8===0?1.22:.96});
    }
  }
}

function campusUrbanWorld() {
  groundCampuses();
  publicStreetMeshes();
  drawCityLinks();
  drawCampusRoads();
  programBasins();
  for(const block of campus) {
    renderCampusBlock(block);
  }
  denseBlocks();
  for(const lot of perimeterLots) drawStreetBlock(lot);
  const frontageSinks = { urban, scenery };
  for (const [index, lot] of perimeterLots.entries()) {
    if (!lot.name && index % 9 !== 0) continue;
    const style = szuFrontageDetailStyles[lot.style];
    if (style) emitSzuFrontageDetails({ x: lot.x, z: lot.z, width: lot.w, depth: lot.depth, height: lot.height, style }, frontageSinks);
  }
  drawLixiangPark();
  shenzhenLandmarks();
  metroEntrance();
  for(const gate of [...campusGates,...canghaiGates]) schoolGate(gate);
  boundaryEdges();
  emitSzuBarriers({ scenery, footprint: (...args) => citySolid.push(campusFootprint(...args)) });
  drawGateLinkBorders();
  campusGroundDetails();
  walkBridge();
  localGreens();
  landscapeInterior();
  modelTraffic();
  canghaiGrounds();
  buildSzuShortcutVisuals();
  indexGroundSurfaces();
  sculptCampusHill();
}


function landscapeInterior() {
  for (const court of courts) {
    const [x,z]=court.xy;
    if (court.name==='天人广场'||court.name==='时光广场') continue;
    pavement.box([x,.003,z],[court.w,.030,court.d],'#c5b6a3');
    if (court.name === '汇文楼前庭') {
      lawnPatch(scenery,()=>scenery.box([x,.019,z],[court.w-1.20,.035,court.d-1.18],'#819957'));
    }
    for(const side of [-1,1]) {
      const xx=x+side*(court.w*.5-.88);
      if (!szuBuildingAt(xx,z,.9)&&nearestStreet(xx,z).distance>4.8) {
        masonry.box([xx,.14,z],[1.59,.28,court.d*.68],'#b5ab8e');
        for(let i=-1;i<=1;i++)
          foliage.ellipsoid([xx,.43,z+i*court.d*.14],[.72,.37,.58],i%2?'#749451':'#5c824c',8,5);
        bench(xx+side*.92,z,side*Math.PI/2);
      }
    }
  }
  for (const path of innerSections) {
    for(let d=8;d<path.length-7;d+=21) {
      const frame=courseFrame(path,d);
      const p=offsetVertex(frame,path.width+.76,0);
      const [x,,z]=p;
      if(!inCampus(x,z)||lakeClearance(x,z)<1.1||szuBuildingAt(x,z,1.2)||nearestStreet(x,z,path).distance<4.2) continue;
      lamppost(x,z,scale(frame.side,-1));
      const t=offsetVertex(frame,-path.width-2.17,0);
      if(d>25&&!szuBuildingAt(t[0],t[2],1.6)&&lakeClearance(t[0],t[2])>2.1&&
        nearestStreet(t[0],t[2],path).distance>5&&landmarkClearance(t[0],t[2])&&!treeSites.some(a=>Math.hypot(a.x-t[0],a.z-t[2])<4.4)) deciduous(t[0],t[2],.90,1);
    }
  }
}

function renderCampusBlock(block) {
  if (renderCampusLandmark(block)) {
    // Keep facade shading draws from shifting the campus trees and the city blocks.
    const shadeSamples = block.floors * Math.floor(block.w / 2.1);
    for (let i = 0; i < shadeSamples; i++) random();
    return;
  }
  academicBlock(block);
  if(block.kind==='hall') {
    const top=3.18+1.93*block.floors;
    masonry.box([block.x,top+.18,block.z],[block.w+1.45,.24,block.depth+.70],'#98aba1');
    masonry.box([block.x,top+.75,block.z],[block.w*.86,.94,block.depth*.61],'#abbaae');
  }
  if(block.name) buildingNameplate(block);
}

function publicGateSpan(frame) {
  const street=cityStreetAt(frame.p[0],frame.p[2]);
  if(!street) return null;
  const ground=flyoverAt(frame.p[0],frame.p[2])===null;
  const edge=direction=>{
    let inside=0;
    for(let d=.25;d<=42;d+=.25) {
      const [x,,z]=offsetVertex(frame,direction*d,0);
      if(!cityRoadContains(street,x,z,CITY_EDGE_MARGIN)||cityBlocked(x,z)||szuBuildingAt(x,z,.35)||(ground&&flyoverAt(x,z)!==null)) break;
      inside=d;
    }
    return direction*inside;
  };
  return {minCross:Math.min(-2.2,edge(-1)),maxCross:Math.max(2.2,edge(1))};
}

function deckRiseAt([x,,z]) {
  const height=flyoverAt(x,z);
  return height===null?0:height-CITY_ASPHALT;
}

function raiseDeckPaint(shape) {
  const {vertices}=shape;
  for(let i=0;i<vertices.length;i+=11) {
    vertices[i+1]+=deckRiseAt([vertices[i],0,vertices[i+2]]);
  }
}

function activeStage(event,nextGate) {
  return event.stages?.find(stage=>nextGate<=stage.finishGate)??event.stages?.at(-1);
}

function szuBuildingAt(x, z, margin = .38, y = 0) {
  const floor = hillHeight(x, z);
  const contains = part => y < floor + (part.height ?? 3.9 + part.floors * 1.93) && closeToBlock(x, z, part, margin) &&
    (!part.outline || insidePlan(x - part.x, z - part.z, part.outline, margin));
  const obs = worldState.ridingObstacles;
  if (obs?.region === 'szu' && margin <= OBSTACLE_MARGIN) {
    return obs.buildings.get(streetCell(x, z))?.find(entry => contains(entry.part))?.lot;
  }
  return campus.find(block => block.parts ? block.parts.some(contains) : contains(block)) ||
    campusFixtures.find(contains);
}

function drawCampusRoads() {
  for (const path of roads) {
    const width = path.width;
    ribbon(pavement, path, -width - .66, width + .66, .022, '#c8b899', 0, path.length);
    ribbon(road, path, -width, width, ROAD_Y - (width < 2.78 ? .0062 : 0), width < 2.78 ? '#8f8978' : '#677a73', 0, path.length);
    for (let d = 2.5; width >= 2.78 && d < path.length - 2; d += 4.75) {
      const p = along(path, d);
      if (nearestStreet(p[0], p[2], path).distance < 5.32 || pavedJunctionAt(p[0], p[2], path)) continue;
      ribbon(masonry, path, -.035, .035, ROAD_Y + .006, '#dbd1aa', d, d + 2.03, 1.1);
    }
    for (let d = 0; d < path.length - 1.3; d += 1.7) {
      const p = along(path, d + .8);
      if (nearestStreet(p[0], p[2], path).distance < 6 || pavedJunctionAt(p[0], p[2], path)) continue;
      for (const side of [-1, 1]) {
        ribbon(masonry, path, side * width - .01, side * width + .16, .056, '#e0cbaa', d, d + 1.69, .95);
        ribbon(masonry, path, side * (width - .18) - .025, side * (width - .18) + .027,
          ROAD_Y + .006, '#cec9a8', d, d + 1.69, .95);
      }
    }
  }
}

let cachedSzuAprons = null;
function szuAprons() {
  if (cachedSzuAprons) return cachedSzuAprons;
  cachedSzuAprons = [...campusGates, ...canghaiGates].map(gate => {
    const frame = campusFootprint(gate.xy[0], gate.xy[1], 0, 0, Math.atan2(gate.facing[0], gate.facing[2]));
    let v = .26, w = 14.4, d = 7.24;
    if (gate.name === '立德门') { v = 4.40; w = 27.5; d = 15.8; }
    else if (gate.name === '立功门') { v = 1.54; w = 20.0; d = 11.45; }
    else if (gate.name === '立言门') { v = 0; w = 15.2; d = 9.1; }
    return { ...lotPart(frame, 0, v, w, d, 0), name: gate.name };
  });
  return cachedSzuAprons;
}

function gateApronAt(x, z) {
  return szuAprons().some(lot => closeToBlock(x, z, lot, 0));
}

let cachedSzuLakeBoxes = null;
function szuWaterBoxes() {
  if (cachedSzuLakeBoxes) return cachedSzuLakeBoxes;
  cachedSzuLakeBoxes = basins.map(({ x, z, rx, rz, c, s }) => ({
    minX: x - 1.18 * Math.hypot(c * rx, s * rz) - .2,
    maxX: x + 1.18 * Math.hypot(c * rx, s * rz) + .2,
    minZ: z - 1.18 * Math.hypot(s * rx, c * rz) - .2,
    maxZ: z + 1.18 * Math.hypot(s * rx, c * rz) + .2,
  }));
  return cachedSzuLakeBoxes;
}

function szuInWater(x, z) {
  if (!szuWaterBoxes().some(b => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ)) return false;
  return lakeClearance(x, z) <= .08;
}

function fenceOpenAt(x, z) {
  return Boolean(cityStreetAt(x, z) || gateApronAt(x, z) || szuBuildingAt(x, z, .35));
}

function drawLowBorder(x, z, len, yaw) {
  emitLowHedgeBorder({ x, z, length: len, yaw }, { scenery });
}

function szuBorderClear(x, z) {
  return !inCampus(x, z) && !gateApronAt(x, z) && !cityStreetAt(x, z) &&
    !szuBuildingAt(x, z, .45) && !cityBlocked(x, z);
}

function drawGateLinkBorders() {
  const gateLinks = [...cityLinks, ...canghaiStreets.filter(w => canghaiGates.some(g => g.name === w.name))];
  for (const { path } of gateLinks) {
    for (let d = .8; d < path.length - .8; d += 1.2) {
      const len = Math.min(1.16, path.length - .8 - d);
      if (len < .45) continue;
      const f = courseFrame(path, d + len * .5), yaw = -Math.atan2(f.f[2], f.f[0]);
      for (const side of [-1, 1]) {
        const [px, , pz] = offsetVertex(f, side * (path.width + 1.08), 0);
        const hx = f.f[0] * len * .45, hz = f.f[2] * len * .45;
        if (szuBorderClear(px, pz) && szuBorderClear(px - hx, pz - hz) && szuBorderClear(px + hx, pz + hz)) {
          drawLowBorder(px, pz, len, yaw);
        }
      }
    }
  }
  for (const lot of szuAprons()) {
    const hw = lot.w * .5, hd = lot.depth * .5;
    const edges = [
      [[-hw, -hd], [hw, -hd]],
      [[hw, -hd], [hw, hd]],
      [[hw, hd], [-hw, hd]],
      [[-hw, hd], [-hw, -hd]],
    ];
    for (const [p1, p2] of edges) {
      const edgeLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const ux = (p2[0] - p1[0]) / edgeLen, uz = (p2[1] - p1[1]) / edgeLen;
      const nx = uz, nz = -ux;
      const outSign = (Math.abs((p1[0] + p2[0]) * .5 + nx * .4) < hw && Math.abs((p1[1] + p2[1]) * .5 + nz * .4) < hd) ? -1 : 1;
      const dx = lot.c * ux + lot.s * uz, dz = -lot.s * ux + lot.c * uz;
      const yaw = -Math.atan2(dz, dx);
      for (let m = 0; m < edgeLen; m += 1.4) {
        const len = Math.min(1.36, edgeLen - m);
        if (len < .45) continue;
        const c = m + len * .5;
        const u = p1[0] + ux * c + outSign * nx * .26, v = p1[1] + uz * c + outSign * nz * .26;
        const [wx, , wz] = lotPoint(lot, u, 0, v);
        const hx = dx * len * .45, hz = dz * len * .45;
        if (szuBorderClear(wx, wz) && szuBorderClear(wx - hx, wz - hz) && szuBorderClear(wx + hx, wz + hz)) {
          drawLowBorder(wx, wz, len, yaw);
        }
      }
    }
  }
}

function szuCityWallAt(x, z, y) {
  if (inCampus(x, z) || y >= 38) return false;
  const obs = worldState.ridingObstacles;
  const nearby = obs?.region === 'szu' ? obs.city.get(streetCell(x, z)) : citySolid;
  return nearby?.some(b => (b.kind === 'frontage' || b.kind === 'tower') &&
    Math.abs(x - b.x) < b.w / 2 + .34 && Math.abs(z - b.z) < b.d / 2 + .34) ?? false;
}

function szuSurfaceAt(x, z, exploring = false) {
  const hit = nearestStreet(x, z);
  return Boolean(hit.street && hit.distance <= hit.street.width + .21 || pavedGroundAt(x, z) ||
    shortcutRibbonContains(szuHighRiskShortcuts, x, z) || (cityStreetAt(x, z) || onParkWalk(x, z) || gateApronAt(x, z)));
}

function szuSafeToRide(x, z, exploring = false, skipHazard = false) {
  const { minX, maxX, minZ, maxZ } = cityExtent;
  if (x < minX || x > maxX || z < minZ || z > maxZ || cityBlocked(x, z)) return false;
  return (skipHazard || lakeClearance(x, z) > .25) && !szuBuildingAt(x, z) && !treeBlocks(x, z, .28);
}

function szuTimingSpan(frame, cityAccess, fallback, minimum = 0) {
  const span = cityAccess ? publicGateSpan(frame) : null;
  if (span) return { ...span, half: Math.max(-span.minCross, span.maxCross) };
  if (cityAccess && !span && onParkWalk(frame.p[0], frame.p[2])) return { half: 1.95 };
  const hit = nearestStreet(frame.p[0], frame.p[2]);
  return { half: Math.max(minimum, (hit.street?.width ?? fallback) + .34) };
}

const szuCampusInfo = {
  name: '深圳大学 · 粤海校区',
  station: '深大站',
  arrival: [metroStop[0] - 8, ROAD_Y, metroStop[1] + 9],
  heading: 0,
  bounds: cityExtent,
};

registerCampus('szu', {
  buildScene: campusUrbanWorld,
  isProtectedGround: (x, z) => protectedCampusGrounds.some(site => closeToBlock(x, z, site, 1.05)),
  shouldSubdivideRibbon: (a) => getActiveCampus() === 'szu' &&
    Math.abs(a.p[0] - dujuanHill.x) < dujuanHill.rx + 6 && Math.abs(a.p[2] - dujuanHill.z) < dujuanHill.rz + 6,
  timingSpan: szuTimingSpan,
  deckRiseAt,
  flyoverHalf: flyover.half,
  safeToRide: szuSafeToRide,
  surfaceAt: szuSurfaceAt,
  buildingAt: szuBuildingAt,
  cityWallAt: szuCityWallAt,
  rideElevation: hillHeight,
  riderGrade: szuRiderGrade,
  waterHazardAt: szuInWater,
  nearestSafeRoad: (x, z) => nearestPathSpot(roads, x, z, hillHeight),
  flyoverAt,
  getRoads: () => roads,
  getBuildings: () => campus,
  raiseMesh: raiseHillMesh,
});

const courses = createSzuCourses();
const selectedCourses=new Map(courses.map(event=>[event.id,event]));

// The paved overlap between the east cross street and the teaching road.
const libraryEvent = selectedCourses.get('libraries');
const libraryCutFrom = pointDistance(libraryRoute, [96, 3.7]);
const libraryCutTo = pointDistance(libraryRoute, [91.28, -6.8]);
const cutEndpoint = distance => {
  const p = along(libraryRoute, distance);
  return [p[0], p[2]];
};
libraryEvent.shortcut = {
  from:libraryCutFrom,
  to:libraryCutTo,
  path:street([cutEndpoint(libraryCutFrom), [93.2,4.15], [91.55,3.1], [90.95,.7],
    [91,-2.4], cutEndpoint(libraryCutTo)], 2.85)
};

export {
  athleticsField, activeStage, basins, betweenLakes, boundaryEdges, buildPerimeterCourse,
  campus, campusBoundary, campusGates, campusLanes, campusOutlines, campusUrbanWorld,
  canghaiGates, canghaiStreets, centralSquare, cityBlocked, cityExtent, cityIcons,
  cityLinks, cityRoadContains, cityRoadIndex, cityRoads, cityStreetAt,
  courses as szuCourses, deckRiseAt, drawCampusRoads, drawGateLinkBorders,
  drawHillGround, dujuanCrest, dujuanFoot, dujuanHill, dujuanPass, eastEnd,
  eastTeachingCrossing, enduranceCourse, enduranceFlyoverParts, flyover, flyoverAt as szuFlyoverAt,
  flyoverHeight, gateApronAt, hillCourse, hillCourses, hillGrade, hillHeight,
  hillNormal, hillReturn, hospitalCrossing, inCampus, innerSections, lakeClearance,
  lakeRim, lakeRoute, laneColors, landmarkClearance, learningLink, lectureCross,
  libraryEastConnector, libraryEvent, libraryRoute, librarySouth, lixiangPark,
  metroStop, northSpine, northToSouth, onParkWalk, openStreets, originalCampus,
  parkOutline, parkWalks, perimeter, perimeterCourses, perimeterLots,
  programBasins, protectedCampusGrounds, publicGateSpan, raiseDeckPaint,
  raiseHillMesh, renderCampusBlock, researchConnector, ringLength, ringPath,
  roads, selectedCourses, southConnector, southToLake, sportsCenter,
  sportsConnector, szuAprons, szuBuildingAt, szuCampusInfo, szuCityWallAt,
  szuInWater, szuRiderGrade, szuSafeToRide, szuSurfaceAt, szuTimingSpan,
  teachingConnector, teachingRoute, throughCenter, westEnd, westReturn, westToNorth,
  yuehaiSportsPlaza, canghaiPerimeter, courts, pavedJunctionAt, nearestCitySegment,
  roadInfoAt, bank, clay, huidian, ovalPoint, parkX, parkZ, fenceOpenAt, szuBorderClear,
};
