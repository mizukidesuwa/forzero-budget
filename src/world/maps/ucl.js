import { signCanvas } from '../../core/canvas.js';
import {
  ROAD_Y, TAU, UP, add, clamp, mix, normalize, rgb, scale,
} from '../../core/math.js';
import { Shape } from '../../core/shape.js';
import { worldState } from '../../core/state.js';
import { cityVehicles } from '../geometry.js';
import { brakingCorners, buildCornerCuts } from '../../race/records.js';
import { referenceCornerScores } from '../../replay/ghost.js';
import { emitLondonLantern } from '../assets/lamps.js';
import { emitIronGateRail, emitRailFence, emitSlopedCourtRail } from '../assets/rail-fence.js';
import { emitUclArrivalCourtDetails, emitUclGardenDetails, emitUclStreetWall, emitUclUrbanInfill } from '../assets/campus-v220.js';
import { OBSTACLE_MARGIN, treeBlocks, uclFixtureAt } from '../collision-index.js';
import {
  bench, campusFootprint, closeToBlock, courseFrame, deciduous, emitTerrain, facadeName, facadeOf,
  fitsBetweenBuildings, foliage, footprintCorners, inOutline,
  londonPaving, lotBox, lotPart, lotPoint, masonry, namedSign,
  offsetVertex, pavement, placeTravelSign, plate, pointDistance, ribbon, road,
  scenery, signs, street, streetCell, streetGapSquared, urban,
  treeSites, uclFixtures, wallPanel,
} from '../geometry.js';
import { registerCampus } from '../registry.js';
import {
  buildUclShortcutVisuals, indexGroundSurfaces, lawnPatch, pavedGroundAt,
  shortcutRibbonContains, uclHighRiskShortcuts,
} from '../surfaces.js';

import { buildLondonTraffic } from './ucl/traffic.js';
import { createLondonCourses, londonSection, makeLondonCourse } from './ucl/courses.js';
import { extraGardenFences, gordonNorthFence, londonGardenLots, londonGardens, russellGarden } from './ucl/gardens.js';
import {
  uclArrivalCourtStyle, uclGardenDetailStyles, uclStreetWallLots, uclStreetWallStyles,
  uclUrbanInfillLots, uclUrbanInfillStyles,
} from '../../data/map-assets.js';
import {
  junction, londonNorth, londonPaths, londonPoint, londonRoads, uclBounds,
  uclCampusInfo, uclStreetIndex, uclWayByPath, uclWays,
} from './ucl/layout.js';

function uclStreetAt(x,z,extra=0) {
  const segments=uclStreetIndex.get(streetCell(x,z))??[];
  let nearest=null,best=Infinity;
  for(const segment of segments) {
    const distance=streetGapSquared(segment,x,z);
    if(distance<best&&distance<=(segment.path.width+extra)**2) {
      nearest=segment.path;
      best=distance;
    }
  }
  return nearest;
}

function londonLot(name,use,style,x,z,w,depth,height,yaw=0) {
  return {...campusFootprint(x,z,w,depth,yaw,height),name,use,style};
}

const [holdenX,holdenZ]=londonPoint(51.52105,-.12874);
const [ioeX,ioeZ]=londonPoint(51.523197,-.12822968);
const [uchX,uchZ]=londonPoint(51.52492,-.13668);
const uclQuad=campusFootprint(28,0,53,54);
// Keep the building-candidate exclusion mask derived from the same arrival
// beds that emit the visible and collision layers. It must not drift back to
// the old wide duplicate planting lots.
const uclQuadPlanting=uclArrivalCourtStyle.beds.flatMap(bed => [-1,1].map(side =>
  campusFootprint(uclCampusInfo.arrival[0] + bed.xOffset, uclCampusInfo.arrival[2] + side * bed.zOffset,
    bed.width, bed.depth, bed.yaw ?? 0, bed.height ?? .68)));
const uclLibrary=londonLot('Wilkins Building','UCL Main Library','wilkins',75,0,30,65,13.1);
uclLibrary.parts=[
  uclLibrary,lotPart(uclLibrary,-19.4,0,8.8,24.7,13.9),lotPart(uclLibrary,-24.9,0,4.1,26,1.3)
];
const cruciform=londonLot('Cruciform Building','UCL','cruciform',-29,4,38,52,20);
cruciform.parts=[
  lotPart(cruciform,-24,0,66,19,20),
  lotPart(cruciform,-61,0,12,49,17),
  lotPart(cruciform,13.5,0,11,52,18),
  ...[-16.8,16.8].map(z=>lotPart(cruciform,15.8,z,8.1,7.95,22))
];
const hospital=londonLot('University College Hospital','235 Euston Road','hospital',uchX-19,uchZ,95,43,22);
hospital.parts=[
  lotPart(hospital,1,2.5,91,35,20.6),
  lotPart(hospital,0,-16.62,91,5.1,20.6),
  lotPart(hospital,-34,.98,24,23,46)
];
const hospitalEntrance=[hospital.x+5.72,ROAD_Y,uchZ-22.7];

const senateHouse=londonLot('Senate House','University of London','senate',holdenX+17,holdenZ,74,113,51);
senateHouse.parts=[
  lotPart(senateHouse,0,0,21,57,21),
  // Wings project from the spine, leaving east and west entrance courts on the Keppel axis.
  ...[-1,1].flatMap(end=>[
    lotPart(senateHouse,0,end*31,65,11,17),
    lotPart(senateHouse,0,end*63,65,11,16.6),
    lotPart(senateHouse,-27,end*47,11,21,15.4),
    lotPart(senateHouse,0,end*47,10,21,17.8)
  ]),
  lotPart(senateHouse,27,47,11,21,16.5),
  lotPart(senateHouse,-14,-47,17,21,6.2)
];
const ioe=londonLot('IOE · 20 Bedford Way','UCL Institute of Education','ioe',ioeX-10,ioeZ+13,29,147,29);
const ioeSpine=lotPart(ioe,1.8,0,23.4,121.9,22.8);
const ioeEnds=[lotPart(ioe,.3,-66.6,18.7,11.5,21.65),lotPart(ioe,-1.6,66.5,16.6,11.8,21.65)];
const ioeCores=[[-10.82,-48.9,19.1,14.2,28.5],[-11.64,-2.7,21.2,15.4,29.3],
  [-11.39,43,20.6,14.8,28.4]].map(parts=>lotPart(ioe,...parts));
const ioeWestWing=lotPart(ioe,-22.3,-19,27.5,18.7,17.8);
const ioeAnnex=lotPart(ioe,-14.9,55.5,15.8,27.2,8.85);
const bedfordNorth=lotPart(ioe,1,-96,21.4,47,21.65);
const bedfordCore=lotPart(ioe,-8,-96,12.8,10.6,25.6);
ioe.parts=[ioeSpine,...ioeEnds,...ioeCores,ioeWestWing,ioeAnnex,bedfordNorth,bedfordCore];
const studentCentreLot=londonLot('UCL Student Centre','27–28 Gordon Square','student',107.6,33.5,24,30.8,16.5);
studentCentreLot.parts=[
  studentCentreLot,lotPart(studentCentreLot,-10,4.2,11.1,34,15.1)
];
const unionBuilding=londonLot('Students’ Union UCL','25 Gordon Street','union',103.5,-59.1,22.75,30.2,19.4);
const gibbsBuilding=londonLot('Welcome Trust · Gibbs Building','215 Euston Road','gibbs',30.5,-110.7,38,44,28.5);
const uclLots=[
  uclLibrary,cruciform,hospital,senateHouse,ioe,studentCentreLot,unionBuilding,gibbsBuilding,
  ...[
    ['Slade School of Fine Art','North Wing','quad-range',34.5,-34,50.9,13,13],
    ['South Wing','Wilkins Building','quad-range',34.5,36,50.9,14,13],
    ['North-West Wing','','stone',14.9,-56.32,10.2,29.5,14],
    ['Chadwick Building','','stone',13,57,14,29,14],
    ['Kathleen Lonsdale Building','','brick',40,-66,40,22,16],
    ['Physics Building','','stone',74,-47,25,24,17],
    ['Bloomsbury Theatre','','modern',106,-5.5,25,43,18.5],
    ['Roberts Building','UCL Engineering','modern',33,152,34,36,19],
    ['Darwin Building','','brick',19,95,24,30,19],
    ['Medical Sciences','','stone',38,68,26,24,15],
    ['Science Library','DMS Watson Building','modern',70,143,22,39,19],
    ['Foster Court','','stone',76,92,26,35,16],
    ['Christopher Ingold Building','UCL Chemistry','modern',151,-8,36,44,22],
    ['The Bartlett','22 Gordon Street','modern',137,-80,23,22,21],
    ['Drayton House','UCL Economics','stone',130,-109,16,32,19],
    ['Institute of Archaeology','','stone',143,62,25,21,18],
    ['London Centre for Nanotechnology','17–19 Gordon Street','modern',107,-34,24,12.5,20],
    ['Bernard Katz Building','South Quad','modern',71,59.4,22,14,15.2],
    ['Rockefeller Building','University Street','brick',-38,75,48,25,18],
    ['School of Slavonic and East European Studies','Taviton Street','modern',197,29,23,35,18],
    ['Medawar Building','Malet Place','brick',67,118,17,9.5,17],
    ['Church of Christ the King','Byng Place','church',90,169.5,49,13,16],
    ['Brunei Gallery','SOAS · Thornhaugh Street','gallery',158,342.6,47,15.6,10],
    ['Elizabeth Garrett Anderson Wing','UCLH','anderson',-24,-105,29,50,22],
    ['Grafton Way Building','UCLH','grafton',-135,-1,44,51,22],
    ['Macmillan Cancer Centre','UCLH','modern',-122,93,22,30,20],
    ['Warburg Institute','University of London','modern',147.8,199.8,24,27,16],
    ['Birkbeck','University of London','stone',93,261,45,77,20],
    ['SOAS · College Buildings','University of London','stone',156,315.5,48,19,17],
    ['SOAS Library','Philips Building','soas',162,283,48,44,20],
    ['Stewart House','University of London','stone',183,486,23,20,20],
    ['London School of Hygiene & Tropical Medicine','Keppel Street','stone',42,386.5,34,43,20],
    ['British Museum','Montague Place','stone',158,553.32,113,46.36,19]
  ].map(data=>londonLot(...data))
];

// Terraced street ranges bound the garden squares. Each entry records its
// street-facing side, so doors and area railings follow the pavement.
const bloomsburyRows=[
  ['Gordon Square','West terrace',106.8,120,14,80,15,1],
  ['Gordon Square','North terrace',167.5,66,15,15,14.6,0],
  ['Gordon Square','South terrace',162,163,67,9.6,14.3,2],
  ['Gordon Square','East terrace',227.4,116,16,60,14.7,3],
  ['Tavistock Square','West terrace',235,41,16,55,15,1],
  ['Woburn Square','West terrace',152.6,235,13,38,13.4,1],
  ['Woburn Square','East terrace',211.1,211.8,10.1,33,13.7,3],
  ['Endsleigh Gardens','Endsleigh Street houses',229.5,-25,15,41,14,3],
  ['Gordon House','29 Gordon Square',106.8,70,15,16,15.4,1],
  ['Russell Square','West terrace',185.5,455,12.5,38,15,1],
  ['Montague Place','Terrace adjoining Stewart House',185,503,25,9,15,0]
].map(([name,use,x,z,w,d,h,side])=>({...londonLot(name,use,'terrace',x,z,w,d,h),side}));

const royalNational=londonLot('Royale National Hotel','Bedford Way','hotel',296,264,58,188,20);
royalNational.parts=[
  lotPart(royalNational,-23,1.5,11,180,19.7),
  lotPart(royalNational,16.8,-2.5,11,172,19.7),
  ...[-1,1].map(side=>lotPart(royalNational,-3.1,side*82,28.9,12,18.9)),
  lotPart(royalNational,-3.1,-19,28.9,11,17.5)
];
const friendsHouse=londonLot('Friends House','173–177 Euston Road','friends',213,-97,66,60,14.2,-.15);
friendsHouse.parts=[
  lotPart(friendsHouse,0,-22,66,16,14.2),lotPart(friendsHouse,0,21,66,14,13.2),
  ...[-1,1].map(side=>lotPart(friendsHouse,side*27,0,12,28,13.2)),
  lotPart(friendsHouse,4,0,29,26,14.6)
];
const bmaHouse=londonLot('BMA House','Tavistock Square','bma',372,94,57,42,18);
bmaHouse.parts=[
  lotPart(bmaHouse,21.5,0,14,42,18),
  ...[-1,1].flatMap(side=>[lotPart(bmaHouse,-7,side*16,43,10,16.5),
    lotPart(bmaHouse,-23,side*7,11,8,16.5)])
];
uclLots.push(...bloomsburyRows,royalNational,friendsHouse,bmaHouse);
const philips=uclLots.find(lot=>lot.style==='soas');
philips.parts=[
  lotPart(philips,0,0,philips.w-4,philips.depth-4,19.5),
  {...lotPart(philips,0,0,philips.w,philips.depth,14.6),bottom:4.1}
];

// Each frontage leaves the cross streets and the entrances visible from the road.
const londonTerraces=[
  [-217.4,-104.6,18.4,17,14],[-212,6,30,82,15],[-201,105,56,87,14],
  [-204,225,47,80,15],[-199,339,43,88,16],[-255,5,31,82,16],
  [-255,116,27,89,16],[-255,232,31,96,17],[-251.5,358,32,108,15],
  [-146,93,18,25,15],[-132,145,39,44,16],[-47,142.5,74,58,16],
  [-27.8,222,41.4,64,15],[-77,221,43,65,15],[-23,350,44,77,15],
  [-76,358,44,61,16],[-24,478,44,113,15],[-72,478,47,118,15],
  [25,252,30,48,16],[29.5,315,30,62,16],[40,469,33,75,16],
  [90,-171,37,21,14],[262.5,-94,18,49,17],
  [295,-91,41,54,17],[284,17,49,55,17],[371,6,46,126,15],
  [372,248,50,164,19],[373,355,53,26,18],[379,449,29,104,18],[428,463,35,94,19],
  [306,550,70,28,15]
].map(([x,z,w,d,h],i)=>londonLot('','',i%4===1?'stone':'brick',x,z,w,d,h));
const uclLandmarks=[
  {name:'UCL · Main Quad',x:uclQuad.x,z:uclQuad.z},
  ...[uclLibrary,cruciform,hospital,senateHouse,ioe,studentCentreLot].map(({name,x,z})=>({name,x,z})),
  {name:'SOAS Library',x:philips.x,z:philips.z},
  {name:'Birkbeck',x:91,z:260}, ...londonGardens.map(({name,center:[x,z]})=>({name,x,z}))
];


function uclBuildingAt(x,z,margin=.38,y=0) {
  const contains=part=>y<part.height&&y+.1>=(part.bottom??0)&&closeToBlock(x,z,part,margin);
  if (worldState.ridingObstacles?.region === 'ucl' && margin<=OBSTACLE_MARGIN) {
    return worldState.ridingObstacles.buildings.get(streetCell(x,z))?.find(entry=>contains(entry.part))?.lot??null;
  }
  for(const lot of uclBuildings) {
    if((lot.parts??[lot]).some(contains)) return lot;
  }
  return null;
}

function canRideUcl(x,z) {
  const {minX,maxX,minZ,maxZ}=uclBounds;
  return x>minX+.6&&x<maxX-.6&&z>minZ+.6&&z<maxZ-.6&&
    !uclBuildingAt(x,z)&&!uclFixtureAt(x,z)&&
    !treeBlocks(x,z,.31);
}

function uclSurfaceAt(x,z) {
  return Boolean(uclStreetAt(x,z,.20)||pavedGroundAt(x,z)||shortcutRibbonContains(uclHighRiskShortcuts,x,z)||
    !uclQuadPlanting.some(lot=>closeToBlock(x,z,lot))&&
    !londonGardens.some(({outline})=>inOutline(x,z,outline)));
}

// Stop names and curb positions follow the TfL interchange map and NaPTAN stop points.
const busStops=[
  ['University College Hospital / Euston Road','Y','euston',51.52529458,-.13674992,1,false],
  ['University College Hospital / Warren Street','W','euston',51.525222,-.13670963,-1,false],
  ['Warren Street Station','V','euston',51.52457789,-.13918658,-1,true],
  ['Tavistock Square','N','woburnPlace',51.52490442,-.12805874,-1,true],
  ['Tavistock Square','K','woburnPlace',51.52533805,-.12874733,1,false],
  ['Russell Square Station','H','woburnLower',51.52321406,-.12638382,1,false]
].map(([name,letter,id,lat,lon,side,shelter])=>{
  const path=londonRoads.get(id), point=londonPoint(lat,lon);
  const frame=courseFrame(path,pointDistance(path,point));
  const [x,,z]=offsetVertex(frame,side*(path.width+1.05),0);
  return {name,letter,frame,side,shelter,x,z,width:path.width};
});

const warrenTube=londonLot('Warren Street','London Underground · Northern / Victoria','warren-tube',-194,-104.5,24,21.8,16.4);
const russellTube=londonLot('Russell Square','London Underground · Piccadilly','russell-tube',417,402,25,22,10.1);
const tubeStops=[
  {name:'Euston Square',use:'地铁 · Circle / Hammersmith & City / Metropolitan',x:11,z:-124},
  {name:warrenTube.name,use:warrenTube.use,x:-181.4,z:-111.25},
  {name:russellTube.name,use:russellTube.use,x:417,z:390.4}
];

function roundel(ctx,x,y,radius,bus=false) {
  ctx.strokeStyle='#cb2635';ctx.lineWidth=radius*.39;
  ctx.beginPath();ctx.arc(x,y,radius*.80,0,TAU);ctx.stroke();
  ctx.fillStyle=bus?'#cb2635':'#233b70';
  ctx.fillRect(x-radius*1.28,y-radius*.26,radius*2.56,radius*.52);
  ctx.font='800 '+radius*.30+'px Arial,sans-serif';
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff7eb';
  ctx.fillText(bus?'BUS STOP':'UNDERGROUND',x,y+.5,radius*2.45);
}

function londonTubeRoundel() {
  return signCanvas(208,160,(ctx,w,h)=>roundel(ctx,w/2,h/2,72));
}

function londonBusShelter(stop,lot) {
  const side=stop.side;
  const box=(u,y,v,w,h,d,color,mesh=scenery)=>lotBox(lot,u,y,v,w,h,d,color,mesh);
  const steel='#41494d', roof='#3b4144', glass='#748887', back=side*.66;
  box(0,.032,0,7.7,.053,2.4,'#bdb2a4',pavement);
  box(0,2.40,0,6.7,.14,1.76,roof);
  box(0,2.48,0,6.8,.035,1.85,'#676f70');
  box(0,2.31,-back,6.65,.14,.068,steel);
  for(const u of [-3.19,0,3.19]) {
    box(u,1.18,back,.09,2.34,.10,steel);
    if(u) box(u,1.18,-back,.09,2.34,.10,steel);
  }
  for(const u of [-1.60,1.60]) {
    const a=lotPoint(lot,u-1.54,.22,back),b=lotPoint(lot,u+1.54,.22,back);
    const c=lotPoint(lot,u+1.54,2.24,back),d=lotPoint(lot,u-1.54,2.24,back);
    // Keep the rear glazing open between the dot bands with the opaque WebGL materials.
    for(const height of [.28,.72,1.36,2.2]) box(u,height,back,3.07,.049,.034,glass);
    scenery.tube(a,d,.018,.018,'#899998',5,false);
    scenery.tube(b,c,.018,.018,'#899998',5,false);
  }
  box(-.65,.50,back*.56,3.0,.10,.39,'#a92d35');
  for(const u of [-1.98,.62]) box(u,.24,back*.56,.077,.49,.15,steel);
  const notice=signCanvas(176,242,(ctx,w,h)=>{
    ctx.fillStyle='#e7e6db';ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#a02530';ctx.fillRect(0,0,w,45);
    ctx.fillStyle='#fff8eb';ctx.font='700 24px Arial';ctx.textAlign='center';
    ctx.fillText('London buses',w/2,30,w-10);
    ctx.fillStyle='#343c41';ctx.font='700 17px Arial';
    ctx.fillText(stop.name,w/2,73,w-14);ctx.fillText('Stop '+stop.letter,w/2,101);
    for(let i=0;i<6;i++) ctx.fillRect(21,123+i*14,w-42,1.8);
  });
  const facing=side>0?lot.yaw+Math.PI:lot.yaw;
  const board=lotPoint(lot,2.46,1.42,back*.87);
  box(2.46,1.42,back*.95,.74,1.02,.079,steel);
  plate(notice,board,.69,.98,facing);
  const fascia=shopSign(stop.name,'#333a3e','#f4f0e1');
  plate(fascia,lotPoint(lot,0,2.313,-back*1.106),5.99,.133,facing);
  uclFixtures.push(campusFootprint(lot.x,lot.z,6.64,1.42,lot.yaw,2.5));
}

function londonTransportMeshes() {
  for(const stop of busStops) {
    const {name,letter,frame,side,shelter,x,z,width}=stop;
    const yaw=-Math.atan2(frame.f[2],frame.f[0]);
    const flagLot=campusFootprint(x,z,0,0,yaw);
    lotBox(flagLot,0,1.14,0,.081,2.28,.081,'#494e50',scenery);
    lotBox(flagLot,0,2.08,0,.48,.65,.046,'#eae6d8',scenery);
    const flag=signCanvas(172,226,(ctx,w,h)=>{
      ctx.fillStyle='#faf7ef';ctx.fillRect(0,0,w,h);
      roundel(ctx,w/2,69,44,true);
      ctx.fillStyle='#b62332';ctx.fillRect(0,126,w,39);
      ctx.fillStyle='#fff6e9';ctx.textAlign='center';ctx.font='800 29px Arial';
      ctx.fillText(letter,w/2,154);
      ctx.fillStyle='#333a40';ctx.font='700 14px Arial';
      ctx.fillText(name.slice(0,29),w/2,188,w-11);
      if(name.length>29) ctx.fillText(name.slice(29).trim(),w/2,208,w-11);
    });
    const signHeight=2.08;
    plate(flag,lotPoint(flagLot,0,signHeight,.026),.47,.64,yaw);
    plate(flag,lotPoint(flagLot,0,signHeight,-.026),.47,.64,yaw+Math.PI);
    uclFixtures.push(campusFootprint(x,z,.11,.11,0,2.32));
    const box=(u,v,w,d)=>scenery.box(add(offsetVertex(frame,side*(width-v),.049),scale(frame.f,u)),
      [w,.009,d],'#d3ae55',yaw);
    box(0,2.12,13.6,.065);
    for(const u of [-6.77,6.77]) box(u,1.06,.065,2.12);
    if(shelter) {
      const [cx,,cz]=add(offsetVertex(frame,side*(width+2.32),0),scale(frame.f,-4.9));
      londonBusShelter(stop,campusFootprint(cx,cz,0,0,yaw));
    }
  }
}

function tubePortal(face,name,u,width,stone,frame,projecting=false) {
  const {point,yaw}=face;
  const box=(x,y,v,w,h,d,color)=>masonry.box(point(x,y,v),[w,h,d],color,yaw);
  box(u,1.68,.16,width,3.34,.26,frame);
  for(let i=0;i<5;i++) {
    const bay=width/5, x=u+(i-2)*bay;
    face.panel(x,1.49,bay-.078,2.80,i===2?'#52686d':'#617879',.307);
    face.panel(x,1.33,.044,.48,'#c9c7b9',.320);
  }
  box(u,3.44,.63,width+.62,.23,1.28,stone);
  plate(shopSign(name.toUpperCase(),'#243e68','#f3efe5'),
    point(u,3.63,.332),width*.96,.39,yaw);
  const offset=projecting?width*.55:0, v=projecting?.74:.341;
  plate(londonTubeRoundel(),point(u+offset,4.59,v),1.87,1.45,yaw+(projecting?Math.PI/2:0));
  if(projecting) plate(londonTubeRoundel(),point(u+offset-.04,4.59,v),1.87,1.45,yaw-Math.PI/2);
}

function gibbsStation(lot) {
  glazedHospitalPart(lot,'#687d81',9,[14,17]);
  const street=facadeOf(lot,3);
  const u=-13.2;
  for(const side of [-1,1])
    masonry.box(street.point(u+side*4.87,2.37,.38),[.46,4.74,.78],'#8b9897',street.yaw);
  tubePortal(street,'Euston Square Station',u,8.85,'#a5afab','#37454a',true);
  pavement.box([10.72,.061,lot.z+u],[1.03,.048,9.21],'#cec3a8');
}

function warrenStation(lot) {
  portlandBlock(lot,5,3.05);
  const facing=facadeOf(lot,1);
  facing.panel(0,2.1,facing.width,4.13,'#d3c6ad',.038);
  tubePortal(facing,'Warren Street Station',5.25,9.5,'#c3b79e','#3c4e53',true);
  tubePortal(facadeOf(lot,2),'Warren Street',1.9,6.9,'#c3b79e','#374149');
}

function russellStation(lot) {
  const tile='#783c38', moulding='#934b40', seam='#5a3231';
  const {height,w,depth}=lot;
  lotBox(lot,0,height/2,0,w,height,depth,tile);
  lotBox(lot,0,height+.14,0,w+.35,.31,depth+.34,moulding);
  const face=facadeOf(lot,2);
  for(let i=1;i<=22;i++) face.panel(0,i*.43,w,.022,seam,.033);
  face.panel(0,4.93,w,.27,moulding,.071);
  face.panel(0,8.93,w,.20,moulding,.072);
  for(const u of [-9.35,-3.14,3.14,9.35]) {
    londonArch(face,u,6.77,3.35,3.08,'#546063',moulding);
    face.panel(u,6.62,2.80,.067,'#9b9683',.075);
    face.panel(u,6.62,.066,2.49,'#9b9683',.075);
    masonry.box(face.point(u-2.75,4.93,.12),[.55,9.85,.32],moulding,face.yaw);
  }
  plate(shopSign('RUSSELL SQUARE STATION',tile,'#f1d8b4'),
    face.point(0,9.42,.059),13.25,.54,face.yaw);
  tubePortal(face,'Russell Square',.25,8.26,'#273b64','#392b30',true);
  for(const u of [-8.0,8.0]) face.panel(u,1.98,3.34,3.69,'#4e4242',.042);
}

// Survey of London, University College London, figure 1 and chapter 4.
const gateLine=8.72;
const frontLodges=[-1,1].map(side=>londonLot(
  side<0?'North Front Lodge':'South Front Lodge','UCL Main Gates · Gower Street',
  'front-lodge',gateLine+1.68,side*6.48,4.38,4.60,4.37));

function lodgeFanlight(face) {
  const spring=2.12;
  function arch(radius,bottom,color,offset) {
    face.panel(0,(spring+bottom)/2,radius*2,spring-bottom,color,offset);
    const centre=face.point(0,spring,offset);
    for(let i=0;i<12;i++) {
      const a=Math.PI*i/12,b=Math.PI*(i+1)/12;
      masonry.triangle(centre,face.point(radius*Math.cos(a),spring+radius*Math.sin(a),offset),
        face.point(radius*Math.cos(b),spring+radius*Math.sin(b),offset),color,face.normal);
    }
  }
  arch(1.12,.55,'#d6cfc0',.041);
  arch(.968,.69,'#52656c',.062);
  face.panel(0,.58,2.31,.12,'#d0c6b5',.08);
  face.panel(0,1.31,.047,1.3,'#dbd5c8',.09);
  for(const y of [1.17,1.63,2.12]) face.panel(0,y,1.94,.052,'#d5cfc2',.094);
  for(const angle of [Math.PI/4,Math.PI/2,3*Math.PI/4]) {
    const onArch=face.point(.95*Math.cos(angle),spring+.95*Math.sin(angle),.099);
    masonry.tube(face.point(0,spring,.099),onArch,.022,.022,'#d5cfc2',6);
  }
}

function frontLodgeBuilding(lot) {
  const {x,z,w,depth}=lot;
  lotBox(lot,0,1.53,0,w,3.06,depth,'#754d40');
  lotBox(lot,0,.11,0,w+.12,.22,depth+.12,'#8e8476');
  lotBox(lot,0,3.065,0,w+.25,.16,depth+.25,'#e4ddd0');
  for(let i=0;i<4;i++) {
    const face=facadeOf(lot,i);
    for(let y=.29;y<2.99;y+=.138) face.panel(0,y,face.width,.012,'#977360',.005);
  }
  const front=facadeOf(lot,3);
  lodgeFanlight(front);
  const back=facadeOf(lot,1);
  back.panel(0,1.29,1.35,2.49,'#cdc5b6',.034);
  back.panel(0,1.26,1.15,2.38,'#344141',.046);
  back.panel(0,1.68,.91,.76,'#708185',.051);
  back.panel(0,1.25,.058,2.31,'#c3b8a7',.056);

  const [left,right]=[x-w/2-.16,x+w/2+.16];
  const [near,far]=[z-depth/2-.16,z+depth/2+.16];
  const eave=3.15,ridge=4.29,l=[x-.70,ridge,z],r=[x+.70,ridge,z];
  masonry.quad([right,eave,near],[left,eave,near],l,r,'#4a5357');
  masonry.quad([left,eave,far],[right,eave,far],r,l,'#515a5c');
  masonry.triangle([left,eave,near],[left,eave,far],l,'#475156');
  masonry.triangle([right,eave,far],[right,eave,near],r,'#515a5e');
  masonry.tube(l,r,.044,.044,'#303737',8);

  const vent=campusFootprint(x-.40,z,.72,1.50,0,.67);
  lotBox(vent,0,4.13,0,vent.w,.87,vent.depth,'#ddd7c9');
  const louvre=facadeOf(vent,3);
  louvre.panel(0,4.26,1.18,.40,'#465154');
  for(let y=4.11;y<4.46;y+=.076) louvre.panel(0,y,1.18,.027,'#bfb9ad',.031);
  lotBox(vent,0,4.61,0,vent.w+.19,.091,vent.depth+.18,'#434d52');
}

function mainGateRail(a, b, tall = 1.68) {
  emitIronGateRail({ from: a, to: b, height: tall }, {
    masonry,
    footprint: (...args) => uclFixtures.push(campusFootprint(...args)),
  });
}

function mainQuadGates() {
  for(const lodge of frontLodges) {
    const side=Math.sign(lodge.z), inner=side*2.13, edge=lodge.x-lodge.w/2;
    mainGateRail([gateLine,inner],[gateLine+1.91,inner]);
    mainGateRail([edge,side*3.79],[edge+.86,side*3.82],1.53);
    mainGateRail([edge,side*8.80],[edge,side*24.9],1.55);
    masonry.box([gateLine,1.07,inner],[.21,2.13,.22],'#202729');
    masonry.tube([gateLine,2.12,inner],[gateLine,2.22,inner],.126,.034,'#252b2e',8);
    masonry.box([edge,.15,side*8.97],[.63,.30,.63],'#ae9f8c');
  }
  const sign=namedSign('UCL','MAIN GATES','#292638','#f2effa');
  plate(sign,[gateLine-.29,1.39,4.90],1.82,.73,-Math.PI/2);
  londonLantern(gateLine-1.05,-9.98);
}

// Street-wall groups from the Survey of London campus plan and the UCL Estates site map.
const londonStreetWall=[
  ['Wellcome Collection','183 Euston Road','stone',65,-113,25,31,20.8],
  ['Bentham House','4–8 Endsleigh Gardens','stone',197,-35,29,29,15],
  ['Pearson Building','UCL · Gower Street','stone',73,-73,21,13,14.8],
  ['Anatomy Building','UCL · Gower Street','stone',18.5,122,18,13.7,15.1],
  ['', 'North Gower Street','brick',23,-172,26,28,14.2],
  ['', 'North Gower Street','brick',-12,-176,24,26,13.7],
  ['', 'Euston Road','stone',-48,-170,39,25,16.5],
  ['', 'Euston Road','brick',-115,-169,45,28,16.2],
  ['', 'Euston Road','brick',-198,-164,32,22,14.7],
  ['', 'Warren Street','brick',-257,-155,28,30,13.5],
  ['', 'Grafton Way','brick',-258,-65,27,25,12.3],
  ['', 'Whitfield Street','brick',-254,438,27,43,13.4],
  ['', 'Whitfield Street','brick',-249,488,32,45,12.8],
  ['', 'Tottenham Court Road','stone',-172,462,40,47,16.8],
  ['', 'Tottenham Court Road','brick',-171,522,37,53,17.6],
  ['', 'Alfred Place','brick',-112,455,22,44,14.4],
  ['', 'Alfred Place','stone',-111,515,24,57,15.1],
  ['', 'Bedford Square','stone',-75,554,38,24,15.6],
  ['', 'Russell Square','brick',390,553,42,42,16.6],
  ['', 'Bernard Street','brick',464,455,23,116,13.4],
  ['', 'Tavistock Place','brick',412,116,33,53,15.5],
  ['', 'Tavistock Place','stone',414,186,33,37,14.8],
  ['', 'Upper Woburn Place','stone',386,-76,55,22,16.4],
  ['', 'Euston Road','stone',403,-156,59,28,19.3],
  ['', 'Euston Road','brick',301,-162,42,24,14.3]
];
// Keep the visual-only 2.2.0 infill layer from drawing a second facade over
// the legacy street-wall shells that still provide the map's base look.
const legacyLondonStreetWallLots=londonStreetWall.map(values=>londonLot(...values));

// Street sides and adjacencies follow the UCL campus plan, Camden conservation
// appraisal and Historic England listings. Dimensions fit the game's compressed grid.
// The facade side runs from south (0) through east, north and west.
const londonFrontages=[
  ['Rayne Building','5 University Street','ribbon',-135,67,44,13,17,2],
  ['Medical School Building','74 Huntley Street','brick',-81,68,32,13,15,3],
  ['Paul O’Gorman Building','72 Huntley Street','louvres',-81,94,32,32,18,3],
  ['Glen House','Tottenham Court Road / Chenies Street','stone',-132,266,17,13,18,3],
  ['Minerva House','North Crescent','stone',-106,266,26,17,14,0],
  ['Drill Hall','16 Chenies Street','brick',-76,309,31,21,12,2],
  ['Tottenham Court Road','East frontage south of Chenies Street','stone',-129,311,18,37,14,3],
  ['Tottenham Court Road','East frontage opposite Goodge Street','brick',-127,350,18,34,17,3],
  ['Tottenham Court Road','East frontage at Store Street','stone',-125,378,18,16,15,3],
  ['Tottenham Court Road','East frontage south of Store Street','brick',-125,410,16,18,14,3],
  ['Gower Street','Listed west-side terrace north of Chenies Street','brick',-13,276,15,31,13,1],
  ['Gower Street','West-side terrace toward Bedford Square','brick',-2,549,16,24,13,1],
  ['Hiltown London Euston','17–18 Upper Woburn Place','stone',318,-33,17,22,15,1],
  ['Hiltown London Euston','Endsleigh Gardens return','stone',286,-35,42,16,14,2],
  ['Tavistock Court','North side of Tavistock Square','brick',276,60,32,24,19,0],
  ['Woburn House','20 Tavistock Square','stone',311,59,32,24,19,0],
  ['Lynton House','7–12 Tavistock Square','brick',360,124,27,14,22,3],
  ['Tavis House','1–6 Tavistock Square','brick',360,142,27,15,23,3],
  ['Tavistock Hotel','South side of Tavistock Square','ribbon',295,168,66,8,18,2],
  ['25–29 Russell Square','West terrace','brick',186,396,14,31,15,1,-.36],
  ['44–49 Russell Square','South terrace','brick',243,544,39,18,15,2,.04]
].map(([name,use,skin,x,z,w,d,h,side,yaw=0])=>({...londonLot(name,use,'frontage',x,z,w,d,h,yaw),skin,side}));

const stPancras=londonLot('St Pancras Church','Upper Woburn Place / Euston Road','st-pancras',376,-99,38,12,10,-.14);
const churchColumns=Array.from({length:6},(_,i)=>lotPart(stPancras,-23, (i-2.5)*2.08,.74,.74,8.2));
const churchPorch={...lotPart(stPancras,-21.6,0,5.2,12.4,10.1),bottom:8.2};
const churchTower=lotPart(stPancras,-14,0,6,6,26);
stPancras.parts=[stPancras,churchPorch,...churchColumns,churchTower];

// The eastern service yards between the T- and L-shaped blocks stay open.
for(const lot of londonFrontages) {
  if(lot.name==='Lynton House') lot.parts=[lot,lotPart(lot,25,0,23,7,19)];
  if(lot.name==='Tavis House') lot.parts=[lot,lotPart(lot,24,5,21,8,19)];
}

function fillLondonStreetWalls(buildings) {
  for(const values of londonStreetWall) {
    const lot=londonLot(...values);
    if(buildings.some(other=>(other.parts??[other]).some(part=>!fitsBetweenBuildings(lot,part)))) continue;
    if(uclWays.some(({path})=>path.rows.some(({p})=>closeToBlock(p[0],p[2],lot,path.width+.96)))) continue;
    buildings.push(lot);
  }
}

function londonPlantedStreets() {
  // The planted edge of Euston Square Gardens and the established trees around the squares.
  const euston=campusFootprint(185,-172.4,107,25);
  lawnPatch(pavement,()=>lotBox(euston,0,.013,0,euston.w,.024,euston.depth,'#78885f',pavement));
  for(const [x,z,size] of [[146,-174,.97],[163,-178,1.20],[186,-164,1.2],[213,-169,1.20],
    [229,-167,.93],[171,88,1.23],[160,143,1.27],[207,135,1.12],[281,141,1.03],[314,130,.98],
    [235,407,1.33],[307,410,1.31],[312,488,1.13],[236,493,1.44],[271,464,1.58]]) {
    if(uclStreetAt(x,z,1.8)||uclBuildingAt(x,z,1.2)||treeSites.some(tree=>Math.hypot(tree.x-x,tree.z-z)<4.6)) continue;
    deciduous(x,z,size,2);
  }
}

const londonCrossings=[
  ['gower',junction.quadGate],['gordon',[124,33]],['malet',[69,407]],['bedford',[259,291]],
  ['torrington',[47,194]],['gordonSouth',[203,153]],['euston',[-66,-139]]
];
const londonPaintHeight=ROAD_Y+.024;

function streetArea(points) {
  let twiceArea=0;
  for(let i=0;i<points.length;i++) {
    const a=points[i],b=points[(i+1)%points.length];
    twiceArea+=a[0]*b[1]-a[1]*b[0];
  }
  return twiceArea/2;
}

function streetHalfPlane(points,a,b,side) {
  if(!points.length) return points;
  const distance=p=>side*((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]));
  const result=[];
  let previous=points.at(-1),before=distance(previous);
  for(const point of points) {
    const after=distance(point);
    if((before>=0)!==(after>=0)) {
      const t=before/(before-after);
      result.push([mix(previous[0],point[0],t),mix(previous[1],point[1],t)]);
    }
    if(after>=0) result.push(point);
    previous=point;
    before=after;
  }
  return result;
}

function streetMinus(points,cover) {
  let shared=points;
  for(let i=0;i<cover.length&&shared.length>=3;i++)
    shared=streetHalfPlane(shared,cover[i],cover[(i+1)%cover.length],1);
  if(shared.length<3||streetArea(shared)<.000003) return [points];

  const exposed=[];
  let inside=points;
  for(let i=0;i<cover.length&&inside.length>=3;i++) {
    const a=cover[i],b=cover[(i+1)%cover.length];
    const outside=streetHalfPlane(inside,a,b,-1);
    if(outside.length>=3&&streetArea(outside)>.000003) exposed.push(outside);
    inside=streetHalfPlane(inside,a,b,1);
  }
  return exposed;
}

function londonGroundSurfaces() {
  // Road, courtyard, walkways, then sidewalks. Each area gets a single visible surface.
  const occupied=new Map(),tile=14;
  function surface(mesh,vertices,y,color) {
    const area=streetArea(vertices);
    if(Math.abs(area)<.000003) return;
    if(area<0) vertices.reverse();
    const xs=vertices.map(p=>p[0]),zs=vertices.map(p=>p[1]);
    const left=Math.min(...xs),right=Math.max(...xs),near=Math.min(...zs),far=Math.max(...zs);
    const cells=[],overlaps=new Set();
    for(let x=Math.floor(left/tile);x<=Math.floor(right/tile);x++) {
      for(let z=Math.floor(near/tile);z<=Math.floor(far/tile);z++) {
        const key=x*4096+z;
        if(!occupied.has(key)) occupied.set(key,[]);
        const cell=occupied.get(key);
        cells.push(cell);
        for(const region of cell) {
          if(right>region.left+1e-6&&left<region.right-1e-6&&far>region.near+1e-6&&near<region.far-1e-6)
            overlaps.add(region);
        }
      }
    }
    let pieces=[vertices];
    for(const cover of overlaps) {
      pieces=pieces.flatMap(polygon=>streetMinus(polygon,cover.vertices));
      if(!pieces.length) return;
    }
    for(const outline of pieces) {
      const points=outline.map(([x,z])=>[x,y,z]);
      for(let i=1;i<points.length-1;i++) mesh.triangle(points[0],points[i+1],points[i],color,UP);
    }
    const region={vertices,left,right,near,far};
    for(const cell of cells) cell.push(region);
  }

  function strip(mesh,path,width,y,color) {
    const count=Math.ceil(path.length/2.1);
    const sides=frame=>[-width,width].map(offset=>{
      const [x,,z]=offsetVertex(frame,offset,0);
      return [x,z];
    });
    let [left,right]=sides(courseFrame(path,0));
    for(let i=1;i<=count;i++) {
      const [nextLeft,nextRight]=sides(courseFrame(path,i*path.length/count));
      const quad=[left,nextLeft,nextRight,right],area=streetArea(quad);
      const convex=quad.every((point,k)=>streetArea([point,quad[(k+1)%4],quad[(k+2)%4]])*area>=0);
      if(convex) surface(mesh,quad,y,color);
      else {
        const split=[[left,nextLeft,nextRight],[left,nextRight,right]];
        const alternate=[[left,nextLeft,right],[nextLeft,nextRight,right]];
        const sides=split.every(part=>streetArea(part)*area>0)?split:alternate;
        for(const part of sides) surface(mesh,part,y,color);
      }
      left=nextLeft;
      right=nextRight;
    }
  }
  const roadSurface='#55595b',stone='#c5b9a6';
  for(const {id,path} of uclWays) if(!londonPaths.has(id)) strip(road,path,path.width,ROAD_Y,roadSurface);
  surface(pavement,[[7.82,-27],[55,-27],[55,27],[7.82,27]],ROAD_Y,stone);
  for(const {id,path} of uclWays) if(londonPaths.has(id))
    strip(pavement,path,path.width+.42,ROAD_Y,id==='quad'?stone:'#bab2a6');
  for(const {id,path} of uclWays) if(!londonPaths.has(id))
    strip(pavement,path,path.width+1.80,ROAD_Y,'#b9afa2');
}

function londonMarkingSpace(path,d,offset,padding=0) {
  const [x,,z]=offsetVertex(courseFrame(path,d),offset,0);
  return !(uclStreetIndex.get(streetCell(x,z))??[]).some(segment=>segment.path!==path&&
    streetGapSquared(segment,x,z)<(segment.path.width+padding)**2);
}

function londonStreetPaint() {
  for(const {id,path} of uclWays) {
    if(londonPaths.has(id)) continue;
    const w=path.width,isGower=id==='gower';
    const crossing=londonCrossings.find(([street])=>street===id);
    const crossAt=crossing?pointDistance(path,crossing[1]):-50;
    const clear=(d,offset,half)=>Math.abs(d-crossAt)>half+4.3&&
      [-half,0,half].every(gap=>londonMarkingSpace(path,d+gap,offset,.68));
    const from=1.35,to=path.length-1.35;
    for(let d=from;d<to;d+=2.9) {
      const end=Math.min(to,d+2.9),middle=(d+end)/2;
      for(const side of [-1,1]) {
        const kerb=side*w;
        if(clear(middle,kerb,(end-d)/2))
          ribbon(scenery,path,kerb-.064,kerb+.064,ROAD_Y+.011,'#aaa197',d,end,2.9);
        const cycle=side*(w-1.20);
        if(isGower&&clear(middle,cycle,(end-d)/2))
          ribbon(scenery,path,cycle-.045,cycle+.045,londonPaintHeight,'#d5d0c3',d,end,2.9);
      }
    }
    for(let d=5;d<path.length-5;d+=6.1) {
      if(w>=4.3&&clear(d+1.05,0,1.05))
        ribbon(scenery,path,-.05,.05,londonPaintHeight,'#d4d0c4',d,d+2.1,2.3);
      if(isGower||w<4.3||d%23>=12) continue;
      for(const side of [-1,1]) {
        for(const gap of [.26,.41]) {
          const edge=side*(w-gap);
          if(clear(d+2.7,edge,2.7))
            ribbon(scenery,path,edge-.031,edge+.031,londonPaintHeight,
              id==='euston'||id==='court'?'#a15b54':'#c3a866',d,d+5.4,2.9);
        }
      }
    }
  }
  for(const [id,xy] of londonCrossings) {
    const path=londonRoads.get(id),d=pointDistance(path,xy),frame=courseFrame(path,d);
    if(id==='gower') mainGateCrossing(path,d,frame);
    else {
      const step=(path.width*2-.42)/9, yaw=-Math.atan2(frame.f[2],frame.f[0]);
      for(let i=0;i<9;i++) scenery.box(offsetVertex(frame,(i-4)*step,londonPaintHeight),[2.5,.008,step*.61],'#ddd8cb',yaw);
    }
  }
}

function mainGateCrossing(path,d,frame) {
  const width=path.width,yaw=-Math.atan2(frame.f[2],frame.f[0]);
  // Signal-controlled crossing. The two rows of studs have a clear gap for the gate approach.
  for(const edge of [-1.48,1.48]) {
    for(let side=-width+.29;side<width;side+=.48) {
      const [x,,z]=offsetVertex(courseFrame(path,d+edge),side,0);
      scenery.box([x,londonPaintHeight,z],[.125,.012,.137],'#ebe4d4',yaw);
    }
  }
  for(const side of [-1,1]) {
    const f=courseFrame(path,d+side*3.12);
    const stop=offsetVertex(f,-side*(width-1.31)/2,londonPaintHeight);
    scenery.box(stop,[.225,.012,width-1.50],'#e1dbcb',yaw);
    const curb=offsetVertex(frame,side*(width+.42),ROAD_Y+.014);
    scenery.box(curb,[2.48,.012,.79],'#b3896b',yaw);
    for(let row=-2;row<=2;row++) for(let col=-1;col<=1;col++) {
      const p=add(curb,add(scale(frame.f,row*.41),scale(frame.side,col*.23)));
      scenery.box(add(p,[0,.008,0]),[.066,.013,.075],'#c89d79',yaw);
    }
    const signal=offsetVertex(courseFrame(path,d+side*2.23),side*(width+1.13),0);
    scenery.tube(signal,add(signal,[0,2.7,0]),.065,.059,'#3b4241',8);
    scenery.box(add(signal,[0,2.73,0]),[.29,.67,.23],'#292f2f',yaw);
    scenery.box(add(signal,[0,2.73,0]),[.125,.13,.25],'#768477',yaw);
  }
}

function londonFence(a,b,gap=0) {
  const [x,z]=a, [xx,zz]=b, length=Math.hypot(xx-x,zz-z), yaw=-Math.atan2(zz-z,xx-x);
  const segment=(from,to)=>{
    const ux=mix(x,xx,(from+to)/2), uz=mix(z,zz,(from+to)/2);
    const span=(to-from)*length;
    uclFixtures.push(campusFootprint(ux,uz,span,.12,yaw,1.13));
    const rail='#343d3d';
    for(const y of [.28,1.01]) scenery.box([ux,y,uz],[span,.071,.077],rail,yaw);
    const count=Math.ceil(span/1.35);
    for(let i=0;i<=count;i++) {
      const t=mix(from,to,i/count), px=mix(x,xx,t), pz=mix(z,zz,t);
      scenery.tube([px,0,pz],[px,1.18,pz],.038,.038,rail,4,false);
    }
  };
  if(gap>0&&gap<length) {
    const split=gap/(2*length);
    segment(0,.5-split);segment(.5+split,1);
  } else segment(0,1);
}

/** Legacy 2.1.2 garden mesh retained as the base layer for the 2.2.0 detail pass. */
function uclGardenMeshes(legacyUclFence) {
  const fenceSinks = { scenery, footprint: (...args) => uclFixtures.push(campusFootprint(...args)) };
  for(const {name,outline,center:[x,z]} of londonGardens) {
    const detail = uclGardenDetailStyles[name];
    if (detail) emitUclGardenDetails({ ...detail, outline, center: [x, z] }, { pavement, scenery, foliage });
    lawnPatch(pavement,()=>londonPaving(pavement,outline,.030,'#778b60'));
    for(let i=0;i<outline.length;i++) {
      const a=outline[i],b=outline[(i+1)%outline.length];
      const len=Math.hypot(a[0]-b[0],a[1]-b[1]);
      const pilot = a === gordonNorthFence.from && b === gordonNorthFence.to;
      if (pilot && legacyUclFence) londonFence(a, b, len > 22 ? 3.7 : 0);
      else emitRailFence(pilot ? gordonNorthFence : { from: a, to: b, gap: len > 22 ? 3.7 : 0 }, fenceSinks);
      if(len<19) continue;
      const mid=[mix(a[0],b[0],.5),mix(a[1],b[1],.5)];
      const path=street([[x,z],mid],1.12);
      ribbon(pavement,path,-1.12,1.12,.047,'#c2baa4',0,path.length,2.3);
      for(const t of [.2,.76]) {
        const tx=mix(mix(a[0],b[0],t),x,.17), tz=mix(mix(a[1],b[1],t),z,.17);
        if(!uclStreetAt(tx,tz,2.5)&&!uclBuildingAt(tx,tz,1.4)) deciduous(tx,tz,1.06+i*.042,i%2);
      }
      bench(mix(x,mid[0],.51)+2.5,mix(z,mid[1],.51),Math.atan2(b[1]-a[1],b[0]-a[0]));
    }
    if(name==='Russell Square') {
      scenery.tube([x,.07,z],[x,.45,z],3.05,2.90,'#b9b4a7',32);
      scenery.tube([x,.44,z],[x,.46,z],2.50,2.50,'#819e9d',32);
      scenery.tube([x,.43,z],[x,1.49,z],.33,.11,'#a7b7af',14);
      uclFixtures.push(campusFootprint(x,z,5.7,5.7,0,.5));
    }
  }
  for (const fence of extraGardenFences) emitRailFence(fence, fenceSinks);
}

function uclMainQuad() {
  // Arrival planting is emitted once by emitUclArrivalCourtDetails from the
  // shared map-assets beds. Keep uclQuadPlanting as a layout exclusion mask
  // for building candidates, but do not render a second flowerbed layer here.
  mainQuadGates();
  for(const sign of [-1,1]) {
    const x=29,z=sign*8.7;
    const disk=(y,h,r1,r2,c,n)=>masonry.tube([x,y,z],[x,y+h,z],r1,r2,c,n);
    disk(.055,.22,2.21,2.15,'#b4a694',8);
    disk(.275,2.77,2.04,2.04,'#d2c6af',8);
    disk(3.045,.18,2.14,2.14,'#c0b6a1',16);
    for(let i=0;i<6;i++) {
      const a=i*Math.PI/12,b=(i+1)*Math.PI/12;
      disk(3.225+1.46*Math.sin(a),1.46*(Math.sin(b)-Math.sin(a)),2.10*Math.cos(a),2.10*Math.cos(b),'#6e8580',24);
    }
    for(let i=0;i<8;i++) {
      const a=(i+.5)*TAU/8, nx=Math.cos(a),nz=Math.sin(a);
      wallPanel(masonry,x+nx*1.96,1.64,z+nz*1.96,.76,1.30,'#52605c',nx,nz);
    }
    uclFixtures.push(campusFootprint(x,z,4.05,4.05,0,4.69));
  }
  const slade=uclLots.find(lot=>lot.name==='Slade School of Fine Art');
  const stone=facadeOf(slade,0);
  const base=stone.point(-6,0,0);
  masonry.tube(base,add(base,[0,10.3,0]),3.1,3.1,'#d0c3ab',28);
  masonry.tube(add(base,[0,10.3,0]),add(base,[0,10.59,0]),3.31,3.31,'#e0d0b7',28);
  for(const angle of [-.82,0,.82]) {
    const nx=Math.sin(angle), nz=Math.cos(angle);
    for(const y of [3.10,6.20,8.9])
      wallPanel(masonry,base[0]+nx*3.12,y,base[2]+nz*3.12,.80,1.64,'#657276',nx,nz);
  }
  uclFixtures.push(campusFootprint(base[0],base[2],5.8,5.8,0,10.6));
  const arrival=uclCampusInfo.arrival;
  placeTravelSign(arrival[0]+2,arrival[2]-7.4,'UCL 旅行站','选择目的地',Math.PI/2);
}

function uclStreetFurniture() {
  for(const {id,path} of uclWays) {
    if(londonPaths.has(id)) continue;
    const side=id==='gower'||id==='bedford'?1:-1;
    for(let d=16;d<path.length-10;d+=32) {
      const [x,,z]=offsetVertex(courseFrame(path,d),side*(path.width+1.21),0);
      if(id==='gower'&&Math.abs(z)<7.8) continue;
      if(busStops.some(stop=>Math.hypot(stop.x-x,stop.z-z)<5.3)) continue;
      if(!uclStreetAt(x,z,.76)&&!uclBuildingAt(x,z,.45)) londonLantern(x,z);
    }
  }
}

function buildUclWorld(legacyUclFence = false) {
  emitTerrain(terrain => {
    terrain.quad([-500,-.021,-475],[700,-.021,-475],[700,-.021,810],[-500,-.021,810],'#a5a09a',[0,1,0]);
  });
  londonGroundSurfaces();
  londonStreetPaint();
  uclMainQuad();
  emitUclArrivalCourtDetails({ center: [uclCampusInfo.arrival[0], uclCampusInfo.arrival[2]], style: uclArrivalCourtStyle }, {
    scenery, foliage,
    footprint: ({ x, z, width, depth, yaw = 0, height = null }) =>
      uclFixtures.push(campusFootprint(x, z, width, depth, yaw, height)),
  });
  uclGardenMeshes(legacyUclFence);
  studentGardenMeshes();
  buildUclShortcutVisuals();
  pavement.box([hospitalEntrance[0],.018,hospitalEntrance[2]],[21,.036,4.92],'#bebeb5');
  pavement.box([83,.022,420],[16,.044,26],'#c7bca9');
  pavement.box([201,.021,282],[19,.042,61],'#bbb3a6');
  const shopLabels=[];
  for(const lot of uclRenderBuildings) renderLondonBuilding(lot,shopLabels);
  placeShopSigns(shopLabels);
  londonStreetSigns();
  londonTransportMeshes();
  senateForecourt();
  uclStreetFurniture();
  londonPlantedStreets();
  for(const [x,z,size] of [[21,110,1],[104,160,.93],[191,245,.92],[210,343,1.1],[84,447,1.06],
    [257,369,.99],[285,365,1.2],[337,336,1.1],[13,-80,.88],[-117,38,1.0]]) {
    if(!uclStreetAt(x,z,2.3)&&!uclBuildingAt(x,z,2.3)) deciduous(x,z,size,1);
  }
  indexGroundSurfaces();
  for(const event of londonCourses) refineLondonRace(event);
}

function londonGateSpan(frame,fallback) {
  const street=uclStreetAt(frame.p[0],frame.p[2],.88);
  const reach=Math.min(9.2,(street?.width??fallback)+1.3);
  const edge=side=>{
    for(let distance=.22;distance<=reach;distance+=.22) {
      const point=offsetVertex(frame,side*distance,0);
      const clear=[-.87,0,.87].every(step=>{
        const [x,,z]=add(point,scale(frame.f,step));
        return canRideUcl(x,z)&&uclStreetAt(x,z,.72);
      });
      if(!clear) return side*(distance-.22);
    }
    return side*reach;
  };
  const minCross=edge(-1),maxCross=edge(1);
  return {minCross,maxCross,half:Math.max(-minCross,maxCross)};
}

function refineLondonRace(event) {
  for(const gate of event.gates) Object.assign(gate,londonGateSpan(gate,event.path.width));
  event.corners=brakingCorners(event);
  event.benchmark.corners=referenceCornerScores(event,event.benchmark);
  const candidates=buildCornerCuts(event)
    .filter(cut=>cut.to-cut.from-cut.path.length>=2.5&&cut.path.length>=6.0);
  candidates.sort((a,b)=>(b.to-b.from-b.path.length)-(a.to-a.from-a.path.length));
  event.londonLines=[];
  for(const cut of candidates) {
    if(event.londonLines.every(line=>Math.abs(line.from-cut.from)>38)) event.londonLines.push(cut);
    if(event.londonLines.length>=Math.ceil(event.length/175)) break;
  }
}

function londonGateBanner(gate,shape,decals) {
  const {minCross:left,maxCross:right}=gate;
  const width=Math.max(.22,right-left),centre=(left+right)/2;
  const tone=gate.color??'#d9c8f4',ink='#453660';
  const at=(side,y)=>offsetVertex(gate,side,y);
  const a=at(left+.1,3.49),b=at(right-.1,3.49);
  shape.tube(a,b,.047,.047,ink,7);
  for(const side of [left+.11,right-.11]) {
    shape.tube(at(side,0),at(side,3.52),.067,.06,ink,8);
    shape.tube(at(side,1.91),at(side,2.52),.082,.082,tone,7);
  }
  const sign=signCanvas(720,114,(ctx,w,h)=>{
    ctx.fillStyle=ink;
    ctx.fillRect(0,0,w,h);
    ctx.fillStyle=tone;
    ctx.font='700 54px "Microsoft YaHei",sans-serif';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.fillText(gate.number+'  '+gate.name,w/2,h/2,w-46);
  });
  const yaw=Math.atan2(-gate.f[0],-gate.f[2]);
  const label=at(centre,3.49);
  const span=Math.min(6.7,width*.92);
  plate(sign,add(label,scale(gate.f,-.106)),span,.56,yaw,decals);
  plate(sign,add(label,scale(gate.f,.106)),span,.56,yaw+Math.PI,decals);
  const strips=Math.max(1,Math.round(width/.43));
  for(let i=0;i<strips;i++) {
    const x=mix(left,right,(i+.06)/strips),xx=mix(left,right,(i+.94)/strips);
    const point=(side,depth)=>add(at(side,ROAD_Y+.053),scale(gate.f,depth));
    shape.quad(point(x,-.30),point(xx,-.30),point(xx,.30),point(x,.30),i%2?tone:ink);
  }
}

// Retail address anchors are from the store locators, UCL and Camden's street records.
function streetShop(name,use,kind,shell,id,coordinates,side,front,depth,height,offset=0) {
  return shopFrontage(name,use,kind,shell,id,londonPoint(...coordinates),side,front,depth,height,offset);
}

function shopFrontage(name,use,kind,shell,id,position,side,front,depth,height,offset=0) {
  const path=londonRoads.get(id);
  let station=0,nearest=Infinity;
  for(let i=1;i<path.rows.length;i++) {
    const a=path.rows[i-1],b=path.rows[i];
    const dx=b.p[0]-a.p[0],dz=b.p[2]-a.p[2];
    const x=position[0]-a.p[0],z=position[1]-a.p[2];
    const f=clamp((x*dx+z*dz)/Math.max(.0001,dx*dx+dz*dz),0,1);
    const gap=(x-f*dx)**2+(z-f*dz)**2;
    if(gap<nearest) {nearest=gap;station=mix(a.distance,b.distance,f);}
  }
  const frame=courseFrame(path,station+offset);
  const [x,,z]=offsetVertex(frame,side*(path.width+2.06+depth/2),0);
  const yaw=Math.atan2(-side*frame.side[0],-side*frame.side[2]);
  return {...londonLot(name,use,'shop',x,z,front,depth,height,yaw),kind,shell};
}

// Door order follows Camden's Store Street plan. Postcodes align the row to the modelled block.
const storeStreetShops=[
  ['Russell & Chap','30–31 Store Street','art',-59,9.2,13.3],
  ['Treadfast’s Books','33 Store Street','treadwell',-48.5,7.7,12.7],
  ['Decadence Hair','36 Store Street','salon',-37.8,7.4,12.4],
  ['Store Street Espresso','40 Store Street','espresso',-24.4,7.6,12.5],
  ['Orchidea Flower School','41 Store Street','flowerschool',-16.8,6.9,12.5],
  ['Orchidea','42 Store Street','flowers',-8.8,7.7,13.4]
].map(([name,address,kind,x,width,height])=>
  shopFrontage(name,address,kind,'brick','store',[x,405],1,width,12.1,height));

const londonShops=[
  shopFrontage('McRonald’s','134 Tottenham Court Road','burger','brick','court',[-174,-76.4],1,8.4,15.2,15.2),
  shopFrontage('Grafton Pharmacy','132 Tottenham Court Road','pharmacy','brick','court',[-174,-67.95],1,5.6,11.4,13.6),
  shopFrontage('Root','120–122 Tottenham Court Road','boots','brick','court',[-173,-49.7],1,8.0,12.8,13.7),
  shopFrontage('Lesgo Express','124–125 Tottenham Court Road','tesco','brick','court',[-174,-59.6],1,8.4,13,13.7),
  streetShop('Laodl','145 Tottenham Court Road','lidl','modern','court',
    [51.5239,-.1371],-1,15.1,15,8.1,-15.7),
  streetShop('Ohayo','115 Tottenham Court Road','oseyo','brick','court',
    [51.523352,-.137251],1,9.7,13.2,14.3),
  streetShop('Griggs','101–106 Tottenham Court Road','greggs','stone','court',
    [51.522569,-.136663],1,10.1,13.4,14.8),
  streetShop('Waterpebbles','82 Gower Street','books','brick','gower',
    [51.52249,-.13204],-1,29.5,31,17.3,1.5),
  streetShop("Heel’s",'196 Tottenham Court Road','heals','stone','court',
    [51.521349,-.134258],-1,35,23,19.2),
  shopFrontage('Yo Dome','22–24 Torrington Place','yohome','brick','torrington',[-120.3,179],1,14.6,13,14.5),
  shopFrontage('Wasabee','3 Bernard Street','wasabi','brick','bernard',[390.6,382],1,7.8,13.4,13.2),
  shopFrontage('Tostilla','5 Bernard Street','tortilla','brick','bernard',[399.5,383],1,6.4,12.5,13.2),
  streetShop('Lesgo Express · Russell Square','40 Bernard Street','tesco','modern','bernard',
    [51.523367,-.12468],-1,16.4,13.5,12.6),
  ...storeStreetShops
];
const unionShops=[
  {name:"Gordon’s Café",use:'25 Gordon Street',kind:'espresso',offset:-6.2,width:9.0},
  {name:'The Hanger',use:'25 Gordon Street',kind:'hanger',offset:5.8,width:8.1}
];

const campusRetail=[
  {building:'North-West Wing',side:2,name:'George Farha Café',use:'136 Gower Street · Gower Place',
    kind:'unionCafe',offset:-.9,width:8.8},
  {building:'The Bartlett',side:3,name:'Brew Bar',use:'22 Gordon Street · The Bartlett',
    kind:'espresso',offset:1.1,width:7.2}
];

function terracesBesideRetail(terraces,stores) {
  const clearances=stores.map(lot=>{
    const corners=footprintCorners(lot), xs=corners.map(p=>p[0]),zs=corners.map(p=>p[2]);
    return [Math.min(...xs)-.39,Math.max(...xs)+.39,Math.min(...zs)-.39,Math.max(...zs)+.39];
  });
  return terraces.flatMap(lot=>{
    let pieces=[[lot.x-lot.w/2,lot.x+lot.w/2,lot.z-lot.depth/2,lot.z+lot.depth/2]];
    for(const [a,b,c,d] of clearances) pieces=pieces.flatMap(box=>{
      const [x0,x1,z0,z1]=box,left=Math.max(x0,a),right=Math.min(x1,b),near=Math.max(z0,c),far=Math.min(z1,d);
      if(left>=right||near>=far) return [box];
      return [[x0,left,z0,z1],[right,x1,z0,z1],[left,right,z0,near],[left,right,far,z1]]
        .filter(([x,xx,z,zz])=>xx-x>=3.0&&zz-z>=4.3);
    });
    return pieces.map(([x0,x1,z0,z1])=>
      londonLot(lot.name,lot.use,lot.style,(x0+x1)/2,(z0+z1)/2,x1-x0,z1-z0,lot.height));
  });
}

function retailGlazing(face,u,width,height,shade) {
  const {point,yaw}=face;
  masonry.box(point(u,height*.5,.142),[width,height,.26],shade.frame,yaw);
  const pane=(width-2.45)/2, half=(pane+1.55)/2;
  for(const side of [-1,1]) {
    face.panel(u+side*half,height*.47,pane,height*.66,shade.glass,.282);
    face.panel(u+side*half,height*.21,pane,height*.14,shade.display[side>0?0:1],.293);
    face.panel(u+side*half,height*.49,.058,height*.69,shade.trim,.30);
  }
  face.panel(u,height*.45,1.54,height*.84,'#516068',.31);
  face.panel(u,height*.46,.062,height*.81,'#a5a498',.325);
  face.panel(u+.29,height*.43,.048,.36,'#cbc7b5',.34);
}

function unionFront(lot,labels) {
  londonFront(lot,'brick',{side:1,width:lot.depth-1.6,height:4.1});
  const entrance=facadeOf(lot,1);
  facadeName(entrance,'Students’ Union UCL','25 Gordon Street',4.81,13.12,.81,'#43396a','#f5eaf3');
  for(const {name,kind,offset,width} of unionShops) {
    const style=shopStyles[kind];
    retailGlazing(entrance,offset,width,3.11,style);
    retailLabel(entrance,{name,kind,offset,width},labels);
  }
  retailGlazing(entrance,0,2.9,3.17,shopStyles.hanger);
}

function retailLabel(face,{name,kind,offset=0,width},labels) {
  const style=shopStyles[kind];
  const point=(u,y,v)=>face.point(u+offset,y,v);
  masonry.box(point(0,3.54,.245),[width+.10,.66,.29],style.frame,face.yaw);
  labels.push({name,face:{...face,point},width,background:style.frame,ink:style.trim});
}

function streetShopDetail(face,width,kind,style) {
  const {point,yaw}=face;
  if(['espresso','unionCafe','tortilla','flowers'].includes(kind)) {
    const w=width*.87,front=.99,top=3.16;
    masonry.quad(point(-w/2,top+.24,.315),point(w/2,top+.24,.315),point(w/2,top,front),
      point(-w/2,top,front),style.frame,[0,1,0]);
    masonry.box(point(0,top-.065,front),[w,.15,.058],style.trim,yaw);
    for(const side of [-1,1]) masonry.tube(point(side*w*.425,top-.05,front),
      point(side*w*.425,top-.48,.30),.023,.023,'#5d6359',7);
  }
  if(kind==='flowers'||kind==='flowerschool') {
    for(const [u,y,w,color] of [[-.27,.67,.46,'#b08292'],[.24,.46,.36,'#d3b4a5'],[.36,.70,.45,'#cca7c1']]) {
      const pot=point(u*width,.22,.47);
      scenery.tube(point(u*width,0,.47),pot,w*.34,w*.46,'#62605b',8);
      foliage.ellipsoid(point(u*width,y,.47),[w*.45,y-.19,w*.38],'#607b55',8,4);
      foliage.ellipsoid(point(u*width,y+.09,.49),[w*.35,.16,w*.31],color,7,4);
    }
  }
  if(kind==='pharmacy') {
    masonry.box(point(-width*.31,2.42,.40),[.37,.085,.084],'#91d3a2',yaw);
    masonry.box(point(-width*.31,2.42,.41),[.085,.37,.084],'#91d3a2',yaw);
  }
}

function retailOnCampus(lot,unit,labels) {
  const face=facadeOf(lot,unit.side),style=shopStyles[unit.kind];
  const width=Math.min(face.width-.49,unit.width+Math.abs(unit.offset)*2+.35);
  londonFront(lot,lot.style,{side:unit.side,width,height:4.0});
  retailGlazing(face,unit.offset,unit.width,3.07,style);
  retailLabel(face,unit,labels);
}

function detailedShopFront(lot,labels) {
  const face=facadeOf(lot,0), style=shopStyles[lot.kind], width=face.width-.46;
  londonFront(lot,lot.shell,{side:0,width,height:4.2});
  const bays=width>20?3:1;
  for(let i=0;i<bays;i++) retailGlazing(face,(i+.5-bays/2)*width/bays,width/bays-.36,3.07,style);
  const signWidth=Math.min(width,lot.kind==='heals'?15:17.9);
  const name=lot.kind==='tesco'?'Lesgo express':lot.name;
  retailLabel(face,{name,kind:lot.kind,width:signWidth},labels);
  streetShopDetail(face,width,lot.kind,style);
  if(lot.kind==='books') {
    const corner=facadeOf(lot,3);
    for(let i=0;i<3;i++) retailGlazing(corner,(i-1)*corner.width*.29,corner.width*.265,3.11,style);
    retailLabel(corner,{name:'Waterpebbles',kind:lot.kind,width:13.5},labels);
    for(const side of [0,3]) {
      const front=facadeOf(lot,side);
      for(const y of [4.46,8.7,13.3,16.58]) front.panel(0,y,front.width+.23,.22,'#d4b99f',.089);
    }
  }
}

const shopStyles={
  boots:{frame:'#264779',trim:'#f0eee8',glass:'#61727b',display:['#b7a5b4','#babcae']},
  tesco:{frame:'#ece9df',trim:'#a93239',glass:'#596a66',display:['#8ba7a6','#9d9d6f']},
  lidl:{frame:'#344d8d',trim:'#efcf63',glass:'#576a6c',display:['#ba8362','#a3ab73']},
  books:{frame:'#2b393a',trim:'#e1d9bf',glass:'#59696c',display:['#ba9a73','#8e8972']},
  heals:{frame:'#333b3b',trim:'#e1d6bd',glass:'#688182',display:['#9c8875','#b6a284']},
  espresso:{frame:'#365050',trim:'#e4ddd0',glass:'#697170',display:['#a68f72','#c2ad8b']},
  hanger:{frame:'#4b466e',trim:'#f1ead9',glass:'#5d6a75',display:['#917aa0','#b2a098']},
  burger:{frame:'#32352f',trim:'#efd286',glass:'#5b665e',display:['#a37c52','#c0a06c']},
  pharmacy:{frame:'#e0e5d8',trim:'#276847',glass:'#637976',display:['#adbfbb','#9baf91']},
  oseyo:{frame:'#323844',trim:'#ebe7de',glass:'#5d6878',display:['#bda093','#c2ac74']},
  greggs:{frame:'#2a5e8d',trim:'#f2e2b8',glass:'#64717b',display:['#af8e66','#c2a57c']},
  yohome:{frame:'#a24b38',trim:'#f1e6d5',glass:'#515f64',display:['#b89673','#9d9c7e']},
  wasabi:{frame:'#516731',trim:'#f5f3df',glass:'#627168',display:['#abb872','#d0bdaa']},
  tortilla:{frame:'#614133',trim:'#f2dbac',glass:'#606468',display:['#b87f56','#b69867']},
  art:{frame:'#566d63',trim:'#eee3c7',glass:'#607471',display:['#c1a88b','#a67a6c']},
  treadwell:{frame:'#4d4264',trim:'#ecdfc5',glass:'#686778',display:['#91807d','#a79675']},
  salon:{frame:'#302e34',trim:'#e7ddcb',glass:'#63717b',display:['#b3a5a5','#93888e']},
  flowerschool:{frame:'#746273',trim:'#f3e6da',glass:'#67767a',display:['#aca49a','#bba3a6']},
  flowers:{frame:'#464958',trim:'#f1e3db',glass:'#657b77',display:['#b6a5b3','#929f8c']},
  unionCafe:{frame:'#45475d',trim:'#eee8dd',glass:'#60717d',display:['#c0a27a','#8c9b87']}
};
// The official Bloomsbury plan includes compact rear courts between the named
// buildings. Keep only parcels that clear the mapped roads, gardens and legacy
// footprints so the new blocks improve the street wall without sealing routes.
const uclUrbanInfill = uclUrbanInfillLots.map(({ id, use, x, z, w, depth, height, yaw, style }) => ({
  ...londonLot('', use, 'infill', x, z, w, depth, height, yaw),
  id,
  urbanStyle: uclUrbanInfillStyles[style] ?? uclUrbanInfillStyles.brick,
})).filter(lot =>
  !uclStreetAt(lot.x, lot.z, Math.max(lot.w, lot.depth) * .44) &&
  !londonGardens.some(({ outline }) => inOutline(lot.x, lot.z, outline)) &&
  !uclLots.some(existing => (existing.parts ?? [existing]).some(part => !fitsBetweenBuildings(lot, part))) &&
  !londonTerraces.some(existing => (existing.parts ?? [existing]).some(part => !fitsBetweenBuildings(lot, part))) &&
  !londonFrontages.some(existing => (existing.parts ?? [existing]).some(part => !fitsBetweenBuildings(lot, part))) &&
  !legacyLondonStreetWallLots.some(existing => (existing.parts ?? [existing]).some(part => !fitsBetweenBuildings(lot, part))));

const uclStreetWalls = uclStreetWallLots.map(({ id, x, z, width, depth, height, yaw, style }) => ({
  ...londonLot('', 'Bloomsbury courtyard', 'street-wall', x, z, width, depth, height, yaw),
  id,
  wallStyle: uclStreetWallStyles[style] ?? uclStreetWallStyles.georgian,
})).filter(lot => {
  const corners = footprintCorners(lot);
  return ![...corners, [lot.x, 0, lot.z]].some(([x, , z]) => uclStreetAt(x, z, 1.8)) &&
    !londonGardens.some(({ outline }) => corners.some(([, , z], index) => {
      const [x] = corners[index];
      return inOutline(x, z, outline);
    })) &&
    !uclLots.some(existing => (existing.parts ?? [existing]).some(part => !fitsBetweenBuildings(lot, part)));
});

const uclBuildings=[...uclLots,...frontLodges,...londonShops,warrenTube,russellTube,stPancras,...londonFrontages,
  ...terracesBesideRetail(londonTerraces,londonShops)];
fillLondonStreetWalls(uclBuildings);
const uclStreetWallRender = uclStreetWalls.filter(lot =>
  !uclBuildings.some(existing => (existing.parts ?? [existing]).some(part => !fitsBetweenBuildings(lot, part))));
const uclRenderBuildings=[...uclBuildings,...uclStreetWallRender,...uclUrbanInfill];
const londonPlaces=[
  ...tubeStops.map(place=>({...place,kind:'tube'})),
  ...busStops.map(({name,letter,x,z})=>({name,use:'公交 · Stop '+letter,x,z,kind:'bus'})),
  ...londonShops.map(lot=>{
    const [x,,z]=facadeOf(lot,0).point(0,0,.75);
    return {name:lot.name,use:lot.use,x,z,kind:'shop'};
  }),
  ...unionShops.map(({name,use,offset})=>{
    const [x,,z]=facadeOf(unionBuilding,1).point(offset,0,.75);
    return {name,use,x,z,kind:'shop'};
  }),
  ...campusRetail.map(({building,side,name,use,offset})=>{
    const lot=uclLots.find(item=>item.name===building);
    const [x,,z]=facadeOf(lot,side).point(offset,0,1.76);
    return {name,use,x,z,kind:'shop'};
  })
];

function shopSign(name,background,ink) {
  return signCanvas(384,84,(ctx,w,h)=>{
    ctx.fillStyle=background;ctx.fillRect(0,0,w,h);
    ctx.fillStyle=ink;ctx.fillRect(7,6,w-14,1.5);ctx.fillRect(7,h-7,w-14,1.5);
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font='700 45px Arial,sans-serif';
    ctx.fillText(name,w/2,h/2+2,w-24);
  });
}

function placeShopSigns(labels) {
  const columns=8, cellWidth=256, cellHeight=56, bleed=1;
  const totalWidth=columns*cellWidth,totalHeight=Math.ceil(labels.length/columns)*cellHeight;
  const image=signCanvas(totalWidth,totalHeight,ctx=>{
    for(const [i,{name,background,ink}] of labels.entries()) {
      const x=i%columns*cellWidth,y=Math.floor(i/columns)*cellHeight;
      ctx.fillStyle=background;ctx.fillRect(x,y,cellWidth,cellHeight);
      ctx.fillStyle=ink;ctx.fillRect(x+6,y+4,cellWidth-12,1);ctx.fillRect(x+6,y+cellHeight-5,cellWidth-12,1);
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.font='700 28px Arial,sans-serif';
      ctx.fillText(name,x+cellWidth/2,y+cellHeight/2+1,cellWidth-15);
    }
  });
  const shape=new Shape(), white=rgb('#ffffff');
  for(const [i,{face,width}] of labels.entries()) {
    const x=i%columns*cellWidth,y=Math.floor(i/columns)*cellHeight;
    const u=(x+bleed)/totalWidth,u2=(x+cellWidth-bleed)/totalWidth;
    const v=1-(y+cellHeight-bleed)/totalHeight,v2=1-(y+bleed)/totalHeight;
    const p=(sign,dy)=>face.point(sign*width/2,3.54+dy,.54);
    const start=shape.vertex(p(-1,-.29),face.normal,white,u,v);
    shape.vertex(p(1,-.29),face.normal,white,u2,v);
    shape.vertex(p(1,.29),face.normal,white,u2,v2);
    shape.vertex(p(-1,.29),face.normal,white,u,v2);
    shape.indices.push(start,start+1,start+2,start,start+2,start+3);
  }
  signs.push({shape,canvas:image});
}



const streetSigns=[
  [-7,-11,Math.PI/2,'GOWER STREET','WC1'],[11,-76,0,'GOWER PLACE','WC1'],
  [-184,-46,0,'GRAFTON WAY','W1'],[-176,71,Math.PI/2,'TOTTENHAM COURT ROAD','W1'],
  [-183,-93,0,'WARREN STREET','W1'],[132,44,Math.PI/2,'GORDON STREET','WC1'],
  [127,159,0,'GORDON SQUARE','WC1'],[363,371,0,'BERNARD STREET','WC1'],
  [45,202,0,'TORRINGTON PLACE','WC1'],[78,399,Math.PI/2,'MALET STREET','WC1'],
  [78,427,0,'KEPPEL STREET','WC1'],[267,293,Math.PI/2,'BEDFORD WAY','WC1'],
  [223,513,0,'RUSSELL SQUARE','WC1'],[187,268,Math.PI/2,'THORNHAUGH STREET','WC1']
];

function londonStreetSigns() {
  for(const [x,z,yaw,street,postcode] of streetSigns) {
    const canvas=signCanvas(512,118,(ctx,w,h)=>{
      ctx.fillStyle='#e7e5da';ctx.fillRect(0,0,w,h);
      ctx.fillStyle='#413c38';ctx.fillRect(8,7,w-16,3);ctx.fillRect(8,h-10,w-16,3);
      ctx.font='700 50px Arial,sans-serif';ctx.fillText(street,15,62,w-30);
      ctx.font='700 23px Arial,sans-serif';ctx.fillStyle='#a05449';ctx.fillText(postcode,16,93);
    });
    const lot=campusFootprint(x,z,0,0,yaw);
    lotBox(lot,0,1.04,0,.068,2.08,.068,'#3e4747',scenery);
    lotBox(lot,0,1.96,0,2.55,.44,.07,'#e7e5da',scenery);
    plate(canvas,lotPoint(lot,0,1.96,.042),2.51,.416,yaw);
    plate(canvas,lotPoint(lot,0,1.96,-.042),2.51,.416,yaw+Math.PI);
  }
}

// Exterior forms are based on UCL and Historic England building references.
function londonArch(face,u,y,w,h,glass,stone) {
  const r=w*.50, spring=y+h/2-r, bottom=y-h/2;
  face.panel(u,(spring+bottom)/2,w,spring-bottom,glass);
  const center=face.point(u,spring,.026);
  for(let i=0;i<5;i++) {
    const a=i*Math.PI/5,b=(i+1)*Math.PI/5;
    const pt=(angle,radius,v)=>face.point(u+radius*Math.cos(angle),spring+radius*Math.sin(angle),v);
    masonry.triangle(center,pt(a,r,.026),pt(b,r,.026),glass,face.normal);
    masonry.quad(pt(a,r,.04),pt(b,r,.04),pt(b,r+.13,.046),pt(a,r+.13,.046),stone,face.normal);
  }
  face.panel(u,bottom-.12,w+.32,.17,stone,.048);
  face.panel(u,(spring+bottom)/2,.054,spring-bottom,'#9a9f95',.051);
}

function londonFront(lot,style,opening=null) {
  const {w,depth,height}=lot;
  const palette={
    stone:['#c2b8a5','#e1d7bf','#697475','#a39b87'],
    brick:['#9a5b48','#cfba9e','#596062','#947d6c'],
    modern:['#a8a5a0','#d1cfc6','#607580','#838c8d']
  };
  const [wall,trim,glass,roof]=palette[style];
  const floors=Math.round(height/3.17), pitch=(height-.45)/floors;
  lotBox(lot,0,height/2,0,w,height,depth,wall);
  lotBox(lot,0,height-.55,0,w+.34,.28,depth+.34,trim);
  lotBox(lot,0,height+.32,0,w-.8,.67,depth-.72,roof);
  for(let side=0;side<4;side++) {
    const face=facadeOf(lot,side);
    const lower=opening?.side===side?opening:null;
    const bays=Math.max(2,Math.round(face.width/(style==='modern'?4.15:3.1)));
    const bay=(face.width-.88)/bays;
    for(let floor=0;floor<floors;floor++) {
      const y=(floor+.53)*pitch;
      if(lower&&y-pitch*.38<lower.height) {
        const strip=(face.width-lower.width)/2;
        if(strip>.05) for(const sign of [-1,1]) face.panel(sign*(face.width+lower.width)/4,y-pitch*.38,strip,.12,trim,.056);
      } else face.panel(0,y-pitch*.38,face.width,.12,trim,.056);
      for(let j=0;j<bays;j++) {
        const u=(j+.5-bays/2)*bay;
        if(lower&&y-pitch*.40<lower.height&&Math.abs(u)<(lower.width+bay*.70)/2) continue;
        const tone=(j+floor*3+side)%5===0?'#829097':glass;
        if(style==='brick'&&floor===0&&(j%3!==1)) {
          londonArch(face,u,y,bay*.59,pitch*.75,tone,trim);
        } else {
          const width=bay*(style==='modern'?.78:.51), h=pitch*(floor===0?.68:.65);
          face.panel(u,y,width+.22,h+.19,trim);
          face.panel(u,y,width,h,tone,.033);
          if(floor<2) {
            face.panel(u,y+.20,width,.069,'#a7aaa2',.046);
            face.panel(u,y,.060,h,'#a7aaa2',.045);
            if(style!=='modern') face.panel(u,y-h/2-.093,width+.44,.12,trim,.067);
          }
        }
      }
    }
  }
  if(style==='brick') for(let j=1;j<Math.floor(w/9);j++) {
    lotBox(lot,-w/2+j*9,height+.53,-depth*.08,.97,1.77,1.45,wall);
    lotBox(lot,-w/2+j*9,height+1.42,-depth*.08,1.12,.14,1.62,trim);
  }
}

function wilkinsBuilding(lot) {
  quadStoneRange(lot);
  const pale='#ddd1b9', cap='#e6dac2', shadow='#a69d8b';
  const f=facadeOf(lot,3), point=f.point;
  const box=(u,y,v,w,h,d,color)=>masonry.box(point(u,y,v),[w,h,d],color,f.yaw);
  for(let step=0;step<8;step++) {
    const h=.162*(step+1);
    box(0,h/2,10.16-step*.30,26.0-step*.13,h,.38,step%2?cap:pale);
  }
  box(0,.67,3.75,24.9,1.34,9.1,pale);
  const columns=10;
  for(let j=0;j<columns;j++) {
    const u=(j-(columns-1)/2)*2.34,v=7.12;
    box(u,1.41,v,.94,.20,.97,shadow);
    masonry.tube(point(u,1.51,v),point(u,1.83,v),.47,.38,cap,16);
    masonry.tube(point(u,1.83,v),point(u,9.13,v),.345,.290,pale,16,false);
    for(let k=0;k<8;k++) {
      const angle=k*TAU/8;
      masonry.tube(point(u+Math.cos(angle)*.327,1.9,v+Math.sin(angle)*.327),
        point(u+Math.cos(angle)*.282,9.12,v+Math.sin(angle)*.282),.019,.016,shadow,4,false);
    }
    masonry.tube(point(u,9.12,v),point(u,9.49,v),.28,.51,cap,12);
    box(u,9.53,v,1.07,.24,1.06,cap);
  }
  box(0,9.87,4.28,24.55,.22,7.68,cap);
  box(0,10.19,4.28,24.11,.39,7.52,pale);
  box(0,10.53,4.28,24.82,.29,7.85,cap);
  const base=10.66, apex=13.71;
  for(const z of [8.22,.23]) {
    masonry.triangle(point(-12.28,base,z),point(12.28,base,z),point(0,apex,z),pale,
      scale(f.normal,z>5?1:-1));
  }
  for(const s of [-1,1]) {
    const a=point(s*12.42,base+.04,8.31),b=point(0,apex+.08,8.31);
    const c=point(0,apex+.08,.19),d=point(s*12.42,base+.04,.19);
    masonry.quad(a,b,c,d,'#a8a899',normalize([s*.24,.97,0]));
    masonry.tube(a,b,.11,.11,cap,6,false);
  }
  const banner=signCanvas(124,248,(ctx,w,h)=>{
    ctx.fillStyle='#503486';ctx.fillRect(0,0,w,h);
    ctx.textAlign='center';ctx.fillStyle='#fcf1dc';ctx.font='800 49px sans-serif';
    ctx.fillText('UCL',w/2,h*.45);
    ctx.font='700 30px sans-serif';ctx.fillText('200',w/2,h*.67);
  });
  for(const side of [-1,1]) {
    plate(banner,point(side*7.03,6.69,7.47),1.25,2.57,f.yaw);
    masonry.tube(point(side*7.73,8.00,7.47),point(side*6.33,8.00,7.47),.038,.038,shadow,7);
  }
  const drum=[lot.x-4,lot.height+3.65,lot.z];
  masonry.tube([drum[0],lot.height-.05,drum[2]],drum,7.3,6.1,'#d3c7b5',24);
  masonry.tube(drum,add(drum,[0,2.0,0]),5.9,5.9,'#d3c7ad',32);
  for(let i=0;i<16;i++) {
    const a=i*TAU/16, c=Math.cos(a),s=Math.sin(a);
    wallPanel(masonry,drum[0]+c*5.92,drum[1]+1.1,drum[2]+s*5.92,.72,1.25,'#706c61',c,s);
  }
  const y=drum[1]+2.0;
  const dome=(a,t,r=5.88)=>[drum[0]+r*Math.cos(t)*Math.cos(a),y+5.6*Math.sin(t),drum[2]+r*Math.cos(t)*Math.sin(a)];
  for(let row=0;row<9;row++) for(let col=0;col<32;col++) {
    const a=col*TAU/32,b=(col+1)*TAU/32,t=row*Math.PI/18,next=(row+1)*Math.PI/18;
    const p=dome(a,t),q=dome(b,t),r=dome(b,next),s=dome(a,next);
    const angle=(a+b)*.5,middle=(t+next)*.5;
    const normal=normalize([Math.cos(middle)*Math.cos(angle),1.43*Math.sin(middle),Math.cos(middle)*Math.sin(angle)]);
    masonry.quad(p,q,r,s,col%4===0?'#6b8680':'#789089',normal);
  }
  masonry.tube([drum[0],y+5.56,drum[2]],[drum[0],y+6.70,drum[2]],.91,.66,cap,16);
  masonry.ellipsoid([drum[0],y+6.77,drum[2]],[.76,.60,.76],'#6b807d',16,6);
}

function cruciformBuilding(lot) {
  const [central,west,east,...towers]=lot.parts;
  londonFront(central,'brick');
  londonFront(west,'brick');
  londonFront(east,'brick',{side:1,width:8.2,height:5.55});
  for(const tower of towers) {
    lotBox(tower,0,11.0,0,tower.w,22,tower.depth,'#a25843');
    for(let side=0;side<4;side++) {
      const face=facadeOf(tower,side);
      for(const y of [3.2,7.3,11.5,15.4,19.2]) for(const u of [-2.05,0,2.05])
        londonArch(face,u,y,1.25,2.8,'#54646c','#d5aa86');
    }
    for(const y of [5.3,12.93,20.95,22.03]) lotBox(tower,0,y,0,8.44,.27,8.28,'#d2ad8c');
    masonry.tube(lotPoint(tower,0,22.0,0),lotPoint(tower,0,25.0,0),5.35,1.10,'#6d6e72',4);
    masonry.tube(lotPoint(tower,0,25,0),lotPoint(tower,0,26.5,0),.89,.08,'#77716a',8);
  }
  const f=facadeOf(east,1), stone='#cbb49b', brick='#a55741', inner='#554a43';
  const box=(u,y,v,w,h,d,color)=>masonry.box(f.point(u,y,v),[w,h,d],color,f.yaw);
  const radius=1.72, spring=2.72, front=.54, back=.14;
  box(0,1.4,back,3.45,2.8,.09,inner);
  for(const s of [-1,1]) {
    box(s*2.11,1.39,.28,.78,2.78,.65,stone);
    box(s*2.11,2.59,.33,.98,.19,.76,'#ddd0ba');
    box(s*2.70,2.46,.24,.27,4.92,.45,brick);
  }
  const arc=(angle,r,z)=>f.point(r*Math.cos(angle),spring+r*Math.sin(angle),z);
  for(let i=0;i<18;i++) {
    const a=i*Math.PI/18,b=(i+1)*Math.PI/18;
    masonry.triangle(f.point(0,spring,back+.055),arc(a,radius,back+.055),arc(b,radius,back+.055),inner,f.normal);
    const r=radius+.33+(i===8||i===9?.094:0);
    masonry.quad(arc(a,radius,front),arc(b,radius,front),arc(b,r,front),arc(a,r,front),i%2?stone:'#d7c2aa',f.normal);
    const mid=(a+b)/2;
    masonry.quad(arc(a,radius,front),arc(b,radius,front),arc(b,radius,back),arc(a,radius,back),'#9f8975',
      [-Math.cos(f.yaw)*Math.cos(mid),-Math.sin(mid),Math.sin(f.yaw)*Math.cos(mid)]);
  }
  box(0,1.27,.23,2.51,2.56,.08,'#465458');
  for(const u of [-.74,0,.74]) box(u,1.33,.282,.062,2.43,.043,'#9b9180');
  box(0,2.58,.292,2.60,.12,.069,'#b1a78f');
  for(let i=0;i<4;i++) box(0,.066+i*.097,.93-i*.155,4.64,.133+i*.18,.18,stone);
  box(0,5.06,.248,5.52,.81,.59,brick);
  const sign=shopSign('Cruciform Building',stone,'#493e34');
  plate(sign,f.point(0,5.06,.556),5.08,.54,f.yaw);
}

function glazedHospitalPart(part,roof,rows,columns,podium=false) {
  const {w,depth,height:h}=part, white='#d4ddd7', silver='#acbcb6';
  lotBox(part,0,h/2,0,w,h,depth,white);
  lotBox(part,0,h-.18,0,w+.22,.36,depth+.24,'#e4e5dd');
  lotBox(part,0,h+.19,0,w-.99,.41,depth-1.04,roof);
  for(let side=0;side<4;side++) {
    const f=facadeOf(part,side), count=side%2?columns[1]:columns[0];
    const bay=(f.width-.65)/count, pitch=(h-.60)/rows;
    for(let row=0;row<rows;row++) {
      const y=.33+(row+.5)*pitch;
      for(let j=0;j<count;j++) {
        const u=(j+.5-count/2)*bay;
        if(podium&&side===2&&row===0&&Math.abs(u)<7.8) continue;
        const glass=['#527e82','#779995','#5b8988','#6b9594'][(j*7+row*3+side)%4];
        f.panel(u,y,bay-.07,pitch*.74,glass);
        if(j%3===0) f.panel(u-bay*.42,y,.14,pitch*.77,silver,.045);
      }
      f.panel(0,y+pitch*.37,f.width,.104,silver,.047);
    }
    for(const u of [-f.width*.34,f.width*.35])
      masonry.box(f.point(u,h*.51,.12),[.25,h*.98,.29],'#dae3dc',f.yaw);
  }
}

function hospitalBuilding(lot) {
  const [podium,front,tower]=lot.parts;
  glazedHospitalPart(podium,'#a1afaa',6,[18,9]);
  glazedHospitalPart(front,'#9eafae',6,[19,3],true);
  glazedHospitalPart(tower,'#73918d',14,[9,8]);
  lotBox(tower,4.0,tower.height+.94,2.2,11.1,1.91,9.2,'#adbab4');
  lotBox(tower,4.0,tower.height+1.93,2.2,11.46,.15,9.58,'#d1d7d0');
  const f=facadeOf(front,2), entry=5.72;
  const box=(u,y,v,w,h,d,color)=>masonry.box(f.point(u,y,v),[w,h,d],color,f.yaw);
  const door='#4e686c', silver='#c1c9c1';
  box(entry,1.54,.13,11.15,2.94,.25,'#505c58');
  for(let i=0;i<6;i++) f.panel(entry+(i-2.5)*1.58,1.46,1.49,2.75,door,.263);
  box(entry,3.42,1.36,15.16,.32,3.03,'#cfdbd5');
  box(entry,3.63,2.78,15.17,.16,.18,'#e3e6dc');
  for(const s of [-1,1]) scenery.tube(f.point(entry+s*6.0,.15,2.42),f.point(entry+s*4.32,3.30,1.48),.104,.091,silver,8);
  const label=shopSign('UCLH   UNIVERSITY COLLEGE HOSPITAL','#294857','#edf4ed');
  plate(label,f.point(entry,3.60,2.883),12.2,.44,f.yaw);
  plate(shopSign('UCLH','#dce4da','#3e5966'),f.point(entry,5.15,.088),4.65,.68,f.yaw);
  const address=shopSign('235 EUSTON ROAD   ·   MAIN ENTRANCE','#e2e7dd','#364753');
  plate(address,f.point(entry,2.95,.286),8.9,.31,f.yaw);
}

function andersonBuilding(lot) {
  glazedHospitalPart(lot,'#9caeac',6,[7,11]);
  const f=facadeOf(lot,2);
  for(let j=0;j<12;j++) {
    const u=-lot.w*.38+j*lot.w*.063;
    masonry.box(f.point(u,8.8,.23),[.15,17.4,.40],j%3===0?'#d8e1da':'#bacbc2',f.yaw);
  }
  plate(shopSign('ELIZABETH GARRETT ANDERSON WING','#4b6768','#e3ebe0'),f.point(0,3.39,.31),12.4,.52,f.yaw);
}

function graftonBuilding(lot) {
  const {w,depth,height}=lot, stone='#ccb89f';
  lotBox(lot,0,height/2,0,w,height,depth,'#b49b82');
  lotBox(lot,0,height+.13,0,w+.23,.28,depth+.25,stone);
  lotBox(lot,-w*.12,height+.45,depth*.09,w*.56,.87,depth*.44,'#a59887');
  for(let side=0;side<4;side++) {
    const face=facadeOf(lot,side), cols=Math.floor(face.width/2.65), bay=face.width/cols;
    for(let row=0;row<6;row++) {
      const y=1.74+row*3.04;
      for(let i=0;i<cols;i++) {
        const u=(i+.5-cols/2)*bay;
        const glass=i%3===0?'#748c8f':'#536b71';
        face.panel(u,y,bay*.73,2.38,stone);
        face.panel(u,y,bay*.62,2.21,glass,.042);
        face.panel(u,y,.095,2.21,'#aeb4a7',.056);
      }
    }
  }
  const f=facadeOf(lot,1);
  plate(shopSign('UCLH   GRAFTON WAY BUILDING','#394f58','#e4e9df'),f.point(-depth*.33,3.57,.065),12.4,.56,f.yaw);
}

function studentCentre(lot) {
  const cream='#d5cab7', coping='#e0d8c9', joint='#b7ad9c', frame='#596465';
  const [streetWing,gardenWing]=lot.parts;
  for(const part of lot.parts) {
    lotBox(part,0,part.height/2,0,part.w,part.height,part.depth,cream);
    lotBox(part,0,part.height-.19,0,part.w+.13,.31,part.depth+.12,coping);
    for(const side of [0,2]) {
      const wall=facadeOf(part,side);
      const paneCount=side===0?3:2;
      for(let i=0;i<paneCount;i++) {
        const u=(i+.5-paneCount/2)*wall.width/paneCount;
        for(const y of [6.07,9.51,12.69]) {
          wall.panel(u,y,3.04,2.60,joint);
          wall.panel(u,y,2.75,2.37,frame,.044);
          wall.panel(u,y,.068,2.42,'#a6a39a',.058);
        }
      }
    }
  }
  const street=facadeOf(streetWing,1), bay=street.width/4;
  for(let i=0;i<4;i++) {
    const u=(i-1.5)*bay, width=bay-1.12;
    street.panel(u,9.62,width,10.0,joint,.023);
    for(let floor=0;floor<3;floor++) {
      const y=6.38+floor*3.29;
      street.panel(u,y,width-.29,2.93,floor===2?'#6b7b7d':'#535e64',.049);
      street.panel(u,y,.066,2.93,'#adafa6',.060);
      street.panel(u,y-.47,width-.29,.042,'#979d97',.061);
      street.panel(u,y-1.54,width+.11,.19,coping,.083);
    }
  }
  for(let i=0;i<=4;i++) {
    const u=(i/4-.5)*street.width;
    masonry.box(street.point(u,9.69,.043),[.54,10.96,.12],cream,street.yaw);
    for(let j=0;j<35;j++) street.panel(u,4.43+j*.29,.52,.022,joint,.108);
  }
  const doorHeight=3.60;
  street.panel(0,1.91,street.width-.63,3.72,'#596b6d',.045);
  for(let i=0;i<16;i++) {
    const u=(i-7.5)*street.width/16;
    street.panel(u,1.97,.067,3.82,'#3e4d51',.072);
  }
  const entry=-.06*street.width;
  masonry.box(street.point(entry,1.83,.12),[6.13,doorHeight,.232],'#415764',street.yaw);
  for(const u of [-2.19,-.73,.73,2.19]) {
    street.panel(entry+u,1.82,1.37,3.35,'#677e81',.245);
    street.panel(entry+u,1.32,.029,.46,'#c1bcae',.257);
  }
  masonry.box(street.point(0,3.95,.32),[street.width+.11,.36,.70],coping,street.yaw);
  plate(shopSign('UCL STUDENT CENTRE','#e1d7c4','#363e43'),
    street.point(0,4.02,.677),10.7,.50,street.yaw);
  plate(shopSign('27–28   ·   STUDENT CENTRE','#3f545f','#eee7dc'),
    street.point(entry,2.91,.26),6.06,.38,street.yaw);

  const garden=facadeOf(gardenWing,3), span=garden.width-1.7;
  for(const y of [2.12,5.78,9.29,12.84]) {
    garden.panel(0,y,span,2.75,'#627775');
    for(let i=0;i<=8;i++) {
      const u=(i/8-.5)*span;
      garden.panel(u,y,i%2?.054:.135,2.78,'#d1c7b4',.063);
    }
  }
  for(let i=0;i<5;i++) {
    const u=(i/4-.5)*span;
    masonry.box(garden.point(u,12.93,.34),[.31,3.09,.76],coping,garden.yaw);
  }
  for(const z of [-8.8,-3.1,2.6,8.3]) {
    const left=lotPoint(streetWing,-9.7,16.63,z), right=lotPoint(streetWing,4.58,16.63,z);
    const highRight=add(right,[0,1.04,2.25]), highLeft=add(left,[0,1.04,2.25]);
    masonry.quad(left,right,highRight,highLeft,'#849492',[0,.91,-.41]);
    masonry.quad(highLeft,highRight,add(highRight,[0,-1.02,0]),add(highLeft,[0,-1.02,0]),
      '#b4aea0',[0,0,1]);
  }
}

function studentGardenMeshes() {
  const courtyard=campusFootprint(91.0,37.5,7.0,28.4);
  lotBox(courtyard,0,.027,0,courtyard.w,.054,courtyard.depth,'#bdb09e',pavement);
  for(const z of [-9.3,.45,9.6]) {
    lotBox(courtyard,-2.25,.24,z,1.76,.48,3.74,'#a29480',scenery);
    lotBox(courtyard,-2.25,.495,z,1.62,.042,3.58,'#728358',scenery);
    for(const dz of [-.99,.16,1.05]) {
      const [x,,zz]=lotPoint(courtyard,-2.39,0,z+dz);
      scenery.tube([x,.51,zz],[x+.11,1.45,zz-.10],.063,.031,'#738252',7);
      foliage.ellipsoid([x+.03,1.37,zz],[.38,.45,.42],'#648054',8,5);
    }
  }
  for(const z of [-5.6,4.3]) bench(89.5,37.5+z,Math.PI/2);
}

function portlandBlock(lot,floors,spacing=2.9,base=0,tower=false) {
  const stone='#d0c7b4', cornice='#e0d7c3', plinth='#8f887c', frame='#a49c8c';
  const {w,depth,height}=lot, pitch=(height-1)/floors;
  lotBox(lot,0,base+height/2,0,w,height,depth,stone);
  if(!base) lotBox(lot,0,.38,0,w+.18,.76,depth+.18,plinth);
  lotBox(lot,0,base+height-.14,0,w+.28,.30,depth+.28,cornice);
  for(let side=0;side<4;side++) {
    const face=facadeOf(lot,side), count=Math.max(2,Math.round((face.width-1.3)/spacing));
    const bay=(face.width-1.3)/count;
    for(let level=0;level<floors;level++) {
      const y=base+.68+(level+.54)*pitch;
      for(let column=0;column<count;column++) {
        const u=(column+.5-count/2)*bay+(tower&&column>0&&column<count-1?((column%3)-1)*bay*.15:0);
        face.panel(u,y,bay*.51,pitch*.69,frame,.027);
        face.panel(u,y,bay*.40,pitch*.61,level%4===1?'#657073':'#4d585d',.040);
        if(!tower&&level<2) {
          face.panel(u,y-pitch*.36,bay*.55,.105,cornice,.071);
          face.panel(u,y,.048,pitch*.62,'#9b988d',.058);
        }
      }
      if(!tower&&level===1) face.panel(0,y+pitch*.40,face.width,.095,cornice,.044);
    }
  }
}

function senateHouseBuilding(lot) {
  const atrium=lot.parts.at(-1);
  for(const part of lot.parts.slice(0,-1)) portlandBlock(part,part.height>16?5:4);
  lotBox(atrium,0,2.85,0,atrium.w,5.7,atrium.depth,'#797f78');
  for(let i=0;i<8;i++) {
    const section=(k,v)=>lotPoint(atrium,(k/8-.5)*atrium.w,5.75+1.65*Math.sin(k*Math.PI/8),v);
    const front=atrium.depth/2;
    masonry.quad(section(i,-front),section(i,front),section(i+1,front),section(i+1,-front),'#829e9e',[0,1,0]);
    masonry.tube(section(i,-front),section(i,front),.075,.075,'#b6bab1',4);
  }
  // Holden's tower rises in setbacks above the cross-axis and the courtyard ranges.
  for(const [w,d,bottom,top,floors] of [[20.5,49,21,27,2],[17.9,41,27,39,5],[16,33,39,45,2],
    [14.4,24,45,49.4,2],[12.8,19,49.4,51.2,1]]) {
    const floor=lotPart(lot,0,0,w,d,top-bottom);
    portlandBlock(floor,floors,2.18,bottom,true);
  }
  for(const side of [-1,1]) {
    lotBox(lot,side*10.6,12.2,0,5.2,24.4,8.1,'#c1b7a5');
    lotBox(lot,side*9,17.5,0,4.4,35,6.3,'#d6ceb9');
    uclFixtures.push(lotPart(lot,side*10.6,0,5.2,8.1,24.4));
    const buttress=facadeOf(lotPart(lot,side*10.6,0,5.2,8.1,24.4),side===1?1:3);
    for(let level=0;level<7;level++) for(let bay=-1;bay<=1;bay++) {
      const y=3.7+level*2.95;
      buttress.panel(bay*1.77,y,1.05,1.98,'#7f7a6c',.06);
      buttress.panel(bay*1.77,y,.81,1.76,'#4e5450',.14);
    }
  }
  for(const quarter of [1,3]) for(const side of [-1,1]) {
    const facade=facadeOf(lot.parts[0],quarter);
    const u=side*8.4;
    facade.panel(u,2.15,5.4,4.3,'#484c45',.045);
    for(const mullion of [-1.65,-.53,.53,1.65]) facade.panel(u+mullion,2.10,.115,3.79,'#928b70',.065);
    masonry.box(facade.point(u,4.49,1.13),[6.55,.33,2.57],'#e3d9c3',facade.yaw);
    plate(shopSign('SENATE HOUSE','#b7ad99','#333b3c'),facade.point(u,4.99,.12),5.7,.64,facade.yaw);
  }
  for(const side of [-1,1]) {
    const z=lot.z+side*17;
    masonry.box([lot.x-53,1.3,z],[1.25,2.6,1.32],'#bcb19c');
    masonry.box([lot.x-53,2.70,z],[1.49,.23,1.52],'#d3c7ad');
    scenery.box([lot.x-53,3.03,z],[.35,.48,.35],'#aea078');
  }
}

function lasdunBlock(lot,{floors,stories,base=0,bays=2.75}) {
  const {w,depth,height}=lot, pitch=(height-base)/floors;
  const concrete='#aaa398', edges='#c4bcaf', window='#475358';
  lotBox(lot,0,height/2,0,w,height,depth,concrete);
  for(let side=0;side<4;side++) {
    const face=facadeOf(lot,side), count=Math.max(1,Math.floor(face.width/bays));
    for(let floor=0;floor<floors;floor++) {
      const y=base+(floor+.53)*pitch;
      face.panel(0,y,face.width-.28,pitch*.66,window);
      face.panel(0,y-pitch*.43,face.width+.2,pitch*.12,edges,.172);
      for(let i=0;i<=count;i++) {
        const u=(i/count-.5)*face.width;
        face.panel(u,y,.11,pitch*.71,i%4===0?'#aaa69b':'#777c79',.039);
      }
      if(stories) face.panel(0,y+.26,face.width-.38,.052,'#868780',.041);
    }
  }
  lotBox(lot,0,height-.15,0,w+.36,.43,depth+.52,edges);
}

function bedfordSlab(lot,isSpine=false) {
  const {w,depth,height}=lot,base=3.87,step=(height-base)/5;
  const concrete='#a6a39b', slab='#c0bab0', bronze='#73665f', glass='#4e6065';
  lotBox(lot,0,(height+base)/2,0,w,height-base,depth,concrete);
  lotBox(lot,-1.43,base/2,0,w-2.94,base,depth-.10,'#626970');
  lotBox(lot,0,base,0,w+.32,.41,depth+.37,slab);
  lotBox(lot,0,height+.03,0,w+.35,.31,depth+.40,slab);
  for(let side=0;side<4;side++) {
    const face=facadeOf(lot,side),span=face.width;
    const width=span-.59,bays=Math.max(3,Math.round(width/1.81));
    for(let floor=0;floor<5;floor++) {
      const y=base+step*(floor+.48);
      face.panel(0,y,width,step*.69,bronze,.052);
      face.panel(0,y+.11,width-.095,step*.56,glass,.108);
      for(let bay=0;bay<bays;bay++) {
        const u=(bay/bays-.5)*width;
        const mullion=bay%3===0?slab:'#778082';
        face.panel(u,y+.10,bay%3===0?.134:.072,step*.65,mullion,.152);
      }
      face.panel(0,y-step*.45,span+.10,.126,slab,.20);
    }
  }
  const street=facadeOf(lot,1);
  for(let u=-street.width/2+1.4;u<street.width/2-1;u+=isSpine?5.10:3.72)
    masonry.box(street.point(u,1.90,-.24),[.53,3.80,.66],'#bfb9af',street.yaw);
}

function ioeBuilding(lot) {
  bedfordSlab(ioeSpine,true);
  bedfordSlab(bedfordNorth,true);
  for(const end of ioeEnds) bedfordSlab(end);
  for(const [index,core] of [...ioeCores,bedfordCore].entries()) {
    const concrete='#a19d95', trim='#b7afa3';
    lotBox(core,0,core.height*.5,0,core.w,core.height,core.depth,concrete);
    lotBox(core,-1.46,core.height+.37,0,core.w-3.7,.73,core.depth-1.45,trim);
    const front=facadeOf(core,3), side=facadeOf(core,index===0?2:0);
    front.panel(0,core.height*.51,1.16,core.height-3.6,'#4e5658',.068);
    for(let floor=0;floor<8;floor++) {
      const y=3.3+floor*3.13;
      front.panel(0,y,1.17,.17,trim,.137);
      if(floor<7) side.panel(-side.width*.31,y,.95,1.51,'#656d6e',.041);
    }
    lotBox(core,-core.w*.42,core.height*.49,core.depth*.41,1.55,core.height*.98,1.08,trim);
  }

  // The teaching wing steps down in section toward the pedestrian precinct.
  for(let level=0;level<5;level++) {
    const setBack=level*2.85, width=ioeWestWing.w-setBack;
    const story=lotPart(ioeWestWing,setBack/2,0,width,ioeWestWing.depth-level*.68,3.12);
    const base=level*3.4;
    lotBox(story,0,base+1.56,0,width,3.12,story.depth,'#5e544a');
    for(const side of [0,2,3]) {
      const face=facadeOf(story,side);
      face.panel(0,base+1.76,face.width-.24,1.62,'#435357',.06);
      for(let u=-face.width/2+.85;u<face.width/2;u+=1.85)
        face.panel(u,base+1.72,.12,1.85,'#a49b8b',.14);
    }
    lotBox(story,0,base+3.18,0,width+.40,.40,story.depth+.65,'#c1bbae');
  }
  lasdunBlock(ioeAnnex,{floors:2,base:1.6,bays:2.0});
  const west=facadeOf(ioeWestWing,3);
  for(let level=0;level<4;level++) {
    const x=-ioeWestWing.w/2+level*2.85, y=level*3.4+.5;
    for(const side of [-1,1]) {
      const z=side*ioeWestWing.depth*.47;
      for(let tread=0;tread<10;tread++)
        lotBox(ioeWestWing,x+tread*.285,y+tread*.34,z,1.38,.40,1.52,'#bab5a7');
      masonry.tube(lotPoint(ioeWestWing,x,y+.83,z+side*.64),
        lotPoint(ioeWestWing,x+2.85,y+4.23,z+side*.64),.13,.13,'#aaa597',4);
    }
  }
  for(let i=-1;i<=1;i++) {
    const center=lotPoint(ioeAnnex,-.60,ioeAnnex.height+.04,i*6.14),[x,y,z]=center;
    const ridge=[x,y+.96,z],corners=[[x-1.8,y,z-1.7],[x+1.8,y,z-1.7],
      [x+1.8,y,z+1.7],[x-1.8,y,z+1.7]];
    for(let j=0;j<4;j++) masonry.triangle(corners[j],ridge,corners[(j+1)%4],'#78949a');
  }

  const east=facadeOf(ioeSpine,1);
  const entry=-6.8;
  masonry.box(east.point(entry,3.01,.64),[10.4,.33,2.53],'#c0bab0',east.yaw);
  masonry.box(east.point(entry,1.45,-.79),[8.9,2.90,1.65],'#3e565e',east.yaw);
  for(const u of [-4.26,-2.14,0,2.14,4.26])
    masonry.box(east.point(entry+u,1.47,.056),[.086,2.93,.093],'#b5b6ae',east.yaw);
  plate(shopSign('IOE  ·  20 BEDFORD WAY','#3a454b','#f2eee3'),
    east.point(entry,3.03,2.02),8.87,.62,east.yaw);
  pavement.box(east.point(entry,.023,1.69),[16.2,.046,4.27],'#bab4a8',east.yaw);
  facadeName(west,'IOE','Woburn Square',3.18,7.62,.79,'#3e4e58','#efede2');
}

function soasLibrary(lot) {
  const [core,reading]=lot.parts;
  lotBox(core,0,core.height/2,0,core.w,core.height,core.depth,'#8c8a80');
  lotBox(reading,0,9.35,0,reading.w,10.5,reading.depth,'#b6afa1');
  for(let side=0;side<4;side++) for(const [body,levels] of [[core,[2.2,16,18.3]],[reading,[5.8,9.2,12.6]]]) {
    const face=facadeOf(body,side),bay=face.width/9;
    for(const y of levels) {
      face.panel(0,y,face.width-.40,1.98,'#4d5858',.035);
      for(let i=0;i<9;i++) {
        const u=(i-4)*bay;
        face.panel(u,y,.12,2.13,'#787c72',.105);
        masonry.box(face.point(u-bay*.46,y,.15),[.34,2.35,.46],'#aca79a',face.yaw);
      }
      face.panel(0,y-1.20,face.width+.15,.36,'#cbc4b5',.28);
    }
  }
  for(let i=-2;i<=2;i++) for(let j=-2;j<=2;j++) {
    const x=(i-j)*2.8,z=(i+j)*2.65;
    const p=(u,y,v)=>lotPoint(core,x+u,core.height+y,z+v);
    masonry.quad(p(-1.67,.12,-1.58),p(-1.67,.91,1.58),p(1.67,.91,1.58),p(1.67,.12,-1.58),'#879b9c',[0,1,0]);
  }
}

function londonTerraceRange(lot) {
  const face=facadeOf(lot,lot.side), h=lot.height, houses=Math.max(2,Math.round(face.width/5.65));
  const width=face.width/houses, buff='#c8beab', brick='#827262';
  lotBox(lot,0,h/2,0,lot.w,h,lot.depth,brick);
  lotBox(lot,0,h-.21,0,lot.w+.26,.30,lot.depth+.26,buff);
  face.panel(0,1.63,face.width,3.23,'#c9c2b2',.05);
  for(let i=0;i<houses;i++) {
    const center=(i+.5-houses/2)*width;
    face.panel(center,h-.36,width-.12,.54,i%3?'#b9afa0':'#c7b79e',.10);
    masonry.box(face.point(center-width*.46,h+.70,-3.8),[.82,1.54,1.36],brick,face.yaw);
    for(const du of [-.21,.21]) masonry.tube(face.point(center-width*.46+du,h+1.46,-3.8),
      face.point(center-width*.46+du,h+1.98,-3.8),.13,.16,'#9c7159',6);
    for(let bay=0;bay<3;bay++) {
      const u=center+(bay-1)*width*.30;
      for(let floor=0;floor<4;floor++) {
        const door=bay===0&&floor===0, y=door?1.35:[1.72,5.06,8.38,11.62][floor]*h/14.7;
        const pane=width*(door?.22:.20), tall=door?2.64:floor===1?2.08:1.62;
        face.panel(u,y,pane+.23,tall+.24,buff,.08);
        face.panel(u,y,pane,tall,door?['#344744','#3c3936','#504744'][i%3]:'#4c575a',.16);
        if(door) {
          masonry.box(face.point(u,.16,.39),[pane+.64,.26,.76],buff,face.yaw);
        } else if(floor<2) {
          face.panel(u,y,pane,.09,'#b5b2a8',.19);
          face.panel(u,y-tall/2-.12,pane+.39,.13,'#d7cebd',.23);
        }
      }
    }
    for(const y of [.34,.88]) masonry.box(face.point(center+.65,y,.70),
      [width*.62,.075,.07],'#424544',face.yaw);
    for(let j=0;j<4;j++) {
      const [px,,pz]=face.point(center+.65+(j/3-.5)*width*.62,.50,.70);
      masonry.tube([px,.01,pz],[px,.99,pz],.032,.032,'#454844',4,false);
    }
  }
}

function byngChurch(lot) {
  const stone='#c3b9a3', slate='#655d59';
  lotBox(lot,0,5.45,0,lot.w,10.9,lot.depth,stone);
  for(const side of [-1,1]) {
    const point=(x,y,z)=>lotPoint(lot,x,y,z);
    const eave=side*lot.depth/2, end=lot.w/2;
    masonry.quad(point(-end,10.9,eave),point(end,10.9,eave),point(end,16,0),point(-end,16,0),slate);
    masonry.triangle(point(side*end,10.88,-lot.depth/2),point(side*end,16,0),point(side*end,10.88,lot.depth/2),stone,[side,0,0]);
    const face=facadeOf(lot,side===1?0:2);
    for(let i=0;i<7;i++) {
      const u=(i-3)*lot.w/7;
      for(const offset of [-.68,.68]) {
        face.panel(u+offset,6.1,.95,4.7,'#555c58',.06);
        masonry.triangle(face.point(u+offset-.475,8.43,.10),face.point(u+offset,9.62,.10),
          face.point(u+offset+.475,8.43,.10),'#555c58',face.normal);
      }
      masonry.box(face.point(u+2.4,4.15,.24),[.64,8.3,.56],stone,face.yaw);
    }
  }
  for(const s of [-1,1]) {
    const p=lotPoint(lot,lot.w/2-.48,0,s*(lot.depth/2-.48));
    masonry.tube(p,add(p,[0,13,0]),.85,.74,stone,8);
    masonry.tube(add(p,[0,13,0]),add(p,[0,15.2,0]),.74,.05,stone,8);
  }
}

function bruneiGallery(lot) {
  londonFront(lot,'brick');
  const face=facadeOf(lot,2);
  face.panel(0,2.12,face.width*.59,3.42,'#516162',.21);
  masonry.box(face.point(0,3.95,.50),[face.width*.62,.28,.90],'#c6bbab',face.yaw);
  for(const side of [-1,1]) {
    lotBox(lot,side*lot.w*.39,lot.height+.48,0,lot.w*.13,.47,lot.depth*.66,'#9ba189');
    lotBox(lot,side*lot.w*.39,lot.height+.84,0,lot.w*.11,.4,lot.depth*.61,'#647756');
  }
  facadeName(face,'BRUNEI GALLERY','SOAS',4.72,8.8,.75,'#554b40','#e7dcca');
}

function quadStoneRange(lot) {
  const h=lot.height, cream='#d9cebb',cap='#e9e1cf';
  lotBox(lot,0,h/2,0,lot.w,h,lot.depth,cream);
  lotBox(lot,0,h-.32,0,lot.w+.52,.38,lot.depth+.52,cap);
  for(let side=0;side<4;side++) {
    const face=facadeOf(lot,side), n=Math.max(3,Math.round(face.width/3.6)), bay=face.width/n;
    face.panel(0,h*.35,face.width+.22,.32,cap,.14);
    face.panel(0,h*.85,face.width+.22,.24,cap,.14);
    for(let i=0;i<n;i++) {
      const u=(i+.5-n/2)*bay;
      londonArch(face,u,h*.18,bay*.52,h*.23,'#68695f',cap);
      face.panel(u,h*.59,bay*.60,h*.29,'#b1a38c',.09);
      face.panel(u,h*.59,bay*.49,h*.25,'#526062',.16);
      face.panel(u,h*.59,bay*.49,.09,'#c4bcaa',.19);
      face.panel(u,h*.59,.083,h*.25,'#c4bcaa',.19);
      face.panel(u,h*.753,bay*.74,.14,cap,.16);
      face.panel(u,h*.918,bay*.51,.66,'#8c8877',.06);
      if(i%3===0) face.panel(u-bay*.47,h*.60,.33,h*.48,cap,.16);
    }
  }
}

// Batch windows as single quads in the existing masonry cells. Only named
// street fronts need shop bays, canopies or the Cancer Institute's fins.
function londonBlockFront(lot) {
  const skin=lot.skin??lot.style,brick=skin==='brick'||skin==='louvres';
  const wall=brick?'#966b58':skin==='ribbon'?'#ad9580':'#c4bbaa';
  const trim=brick?'#cdb69c':'#d9d1bf';
  for(const part of lot.parts??[lot]) {
    const h=part.height;
    lotBox(part,0,h/2,0,part.w,h,part.depth,wall);
    lotBox(part,0,h-.12,0,part.w+.18,.24,part.depth+.18,trim);
    const floors=Math.max(2,Math.round(h/3.3)),pitch=h/floors;
    for(let side=0;side<4;side++) {
      const face=facadeOf(part,side),front=part===lot&&side===lot.side;
      const bays=Math.max(1,Math.round(face.width/(front?3.2:3.9)));
      const bay=face.width/bays;
      for(let row=0;row<floors;row++) {
        const y=(row+.53)*pitch;
        if(front&&(skin==='ribbon'||skin==='louvres')) {
          face.panel(0,y,face.width-.9,pitch*.59,'#536870');
        } else {
          for(let col=0;col<bays;col++) {
            const isDoor=front&&row===0&&col===Math.floor(bays/2);
            face.panel((col+.5-bays/2)*bay,isDoor?1.22:y,bay*(isDoor?.73:.56),
              isDoor?2.44:pitch*.55,(col+row+side)%5===0?'#778588':'#536164');
          }
        }
      }
      if(front&&skin==='louvres') {
        const count=Math.ceil(face.width/.98);
        for(let i=0;i<count;i++) face.panel(((i+.5)/count-.5)*face.width,h*.56,.24,h*.81,'#b66b4e',.095);
      }
      if(front) face.panel(0,3.07,face.width,.20,trim,.09);
    }
  }
}

function stPancrasChurch() {
  const stone='#d3c9b6',trim='#e2d9c8';
  lotBox(stPancras,0,5,0,stPancras.w,10,stPancras.depth,stone);
  const front=facadeOf(stPancras,3);
  front.panel(0,2.7,3.0,5.4,'#864a3b');
  for(const side of [0,2]) {
    const face=facadeOf(stPancras,side);
    for(let i=-3;i<=3;i++) face.panel(i*4.6,5,1.62,3.7,'#6b7679');
  }
  for(const col of churchColumns) {
    masonry.tube([col.x,0,col.z],[col.x,8.2,col.z],.37,.32,stone,8);
    lotBox(col,0,7.99,0,.90,.42,.90,trim);
  }
  lotBox(churchPorch,0,8.74,0,churchPorch.w,1.08,churchPorch.depth,trim);
  const gable=facadeOf(churchPorch,3);
  masonry.triangle(gable.point(-6.2,9.27),gable.point(6.2,9.27),gable.point(0,10.1),stone,gable.normal);
  for(const [bottom,top,base,cap] of [[10,15,3,3],[15,21,2.65,2.35],[21,25,1.95,1.6],[25,26,1.6,.15]]) {
    masonry.tube([churchTower.x,bottom,churchTower.z],[churchTower.x,top,churchTower.z],base,cap,trim,8);
  }
}

function londonCourtBuilding(lot) {
  for(const part of lot.parts) londonFront(part,'brick');
  const friends=lot.style==='friends', front=facadeOf(lot.parts[0],friends?2:3);
  const y=friends?6.5:5.7;
  for(const u of [-5,-2,2,5]) {
    const p=front.point(u,0,.65);
    masonry.tube(p,add(p,[0,y,0]),.33,.29,'#d2c6ae',10);
  }
  masonry.box(front.point(0,y+.24,.32),[13,.65,2.1],'#d0c5ae',front.yaw);
  if(!friends) {
    const gate=facadeOf(lot,3);
    for(const sign of [-1,1]) {
      for(let i=0;i<8;i++) {
        const pos=gate.point(sign*(3.5+i*.32),1.29,.04);
        scenery.box(pos,[.075,2.6,.081],'#373c39',gate.yaw);
      }
      const [x,,z]=gate.point(sign*4.62,0,.04);
      uclFixtures.push(campusFootprint(x,z,2.32,.09,gate.yaw,2.6));
    }
  }
}

function senateForecourt() {
  const lot=lotPart(senateHouse,-40,0,14.4,20,5.8);
  for(const side of [-1,1]) {
    // The timber stair pavilion frames the view along the central approach.
    for(let i=0;i<15;i++) {
      const h=(i+1)*.344,x=-7.05+i*.92,z=side*8.4;
      lotBox(lot,x,h-.15,z,.96,.30,3.15,i%2?'#b49b78':'#c6ac86',scenery);
      if(i%3===1) for(const edge of [-1,1]) lotBox(lot,x,h/2,z+edge*1.42,.16,h,.16,'#968569',scenery);
    }
    campusCourtRail(lot,side*9.9);
    uclFixtures.push(lotPart(lot,0,side*8.4,14.4,3.15,5.8));
    for(const x of [-8.6,8.6]) {
      const bed=lotPart(lot,x,side*11.8,4.8,3.5,.37);
      lotBox(bed,0,.19,0,bed.w,.38,bed.depth,'#a29c87',scenery);
      for(let i=-1;i<=1;i++) foliage.ellipsoid(lotPoint(bed,i*1.45,.85,.36*(i%2)),
        [1.04,.64,.82],i%2?'#788459':'#929264',7,4);
      uclFixtures.push(bed);
    }
    deciduous(lot.x-8,lot.z+side*14.3,1.85,0);
  }
  lotBox(lot,6.3,4.98,0,2.0,.37,17.2,'#ac9271',scenery);
  for(const x of [5.36,7.22]) {
    lotBox(lot,x,5.94,0,.09,.105,17.2,'#7e776a',scenery);
    for(let i=-8;i<=8;i++) lotBox(lot,x,5.47,i,.055,.89,.065,'#7e776a',scenery);
  }
}

function campusCourtRail(lot, z) {
  emitSlopedCourtRail({ point: (u, y, v) => lotPoint(lot, u, y, v), z }, { scenery });
}

function renderLondonBuilding(lot,shopLabels) {
  if(lot.style==='wilkins') wilkinsBuilding(lot);
  else if(lot.style==='cruciform') cruciformBuilding(lot);
  else if(lot.style==='student') studentCentre(lot);
  else if(lot.style==='hospital') hospitalBuilding(lot);
  else if(lot.style==='anderson') andersonBuilding(lot);
  else if(lot.style==='grafton') graftonBuilding(lot);
  else if(lot.style==='front-lodge') frontLodgeBuilding(lot);
  else if(lot.style==='senate') senateHouseBuilding(lot);
  else if(lot.style==='ioe') ioeBuilding(lot);
  else if(lot.style==='terrace') londonTerraceRange(lot);
  else if(lot===stPancras) stPancrasChurch();
  else if(lot.style==='street-wall') emitUclStreetWall({ ...lot, width: lot.w, depth: lot.depth, height: lot.height, style: lot.wallStyle }, { urban, scenery });
  else if(lot.style==='infill') emitUclUrbanInfill({ ...lot, style: lot.urbanStyle }, { urban, scenery });
  else if(lot.style==='frontage'||!lot.name) londonBlockFront(lot);
  else if(lot.style==='church') byngChurch(lot);
  else if(lot.style==='quad-range') quadStoneRange(lot);
  else if(lot.style==='gallery') bruneiGallery(lot);
  else if(lot.style==='hotel') { for(const part of lot.parts) londonFront(part,'modern'); }
  else if(lot.style==='friends'||lot.style==='bma') londonCourtBuilding(lot);
  else if(lot.style==='soas') soasLibrary(lot);
  else if(lot.style==='gibbs') gibbsStation(lot);
  else if(lot.style==='warren-tube') warrenStation(lot);
  else if(lot.style==='russell-tube') russellStation(lot);
  else if(lot.style==='union') unionFront(lot,shopLabels);
  else if(lot.style==='shop') detailedShopFront(lot,shopLabels);
  else if(campusRetail.some(unit=>unit.building===lot.name))
    retailOnCampus(lot,campusRetail.find(unit=>unit.building===lot.name),shopLabels);
  else londonFront(lot,lot.style);
}

function londonLantern(x, z) {
  emitLondonLantern({ x, z }, { scenery });
}

registerCampus('ucl', {
  buildScene: ({ legacyUclFence }) => buildUclWorld(legacyUclFence),
  buildTraffic: () => buildLondonTraffic(cityVehicles),
  timingSpan: (frame, _c, fallback) => londonGateSpan(frame, fallback),
  safeToRide: (x, z) => canRideUcl(x, z),
  surfaceAt: (x, z) => uclSurfaceAt(x, z),
  buildingAt: (x, z, margin, y) => uclBuildingAt(x, z, margin, y),
  rideElevation: () => 0,
  riderGrade: () => 0,
  waterHazardAt: () => false,
  nearestSafeRoad: () => null,
  gateBanner: londonGateBanner,
  getBuildings: () => uclBuildings,
});


const londonCourses = createLondonCourses();

export { gordonNorthFence };

export {
  bmaHouse, bloomsburyRows, busStops, buildUclWorld, canRideUcl, cruciform,
  friendsHouse, gibbsBuilding, hospital, hospitalEntrance, ioe, junction,
  londonCourses, londonCrossings, londonFrontages, londonGardenLots, londonGardens,
  londonGateBanner, londonGateSpan, londonNorth, londonPaths, londonPlaces,
  londonPoint, londonRoads, londonShops, londonTerraces, makeLondonCourse,
  philips, refineLondonRace, royalNational, russellGarden, russellTube,
  senateHouse, stPancras, studentCentreLot, tubeStops, uclBounds, uclBuildingAt,
  uclBuildings, uclCampusInfo, uclQuad, uclQuadPlanting, uclStreetAt,
  uclStreetIndex, uclSurfaceAt, uclWayByPath, uclWays, unionBuilding, warrenTube,
  londonLot, uclLandmarks, londonSection, uclLibrary, londonGroundSurfaces,
};
