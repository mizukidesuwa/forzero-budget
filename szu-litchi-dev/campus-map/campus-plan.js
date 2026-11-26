// The Yuehai guide supplies the order, orientation and grouping of the landmarks.
// The lots are fitted to the game streets so the four timed courses share this map.
function campusFootprint(x,z,w,depth,yaw=0,height=null) {
  return {x,z,w,depth,yaw,height,c:Math.cos(yaw),s:Math.sin(yaw)};
}

function lotPoint(lot,u,y,v) {
  return [lot.x+lot.c*u+lot.s*v,y,lot.z-lot.s*u+lot.c*v];
}

function lotPart(lot,u,v,w,depth,height) {
  const [x,,z]=lotPoint(lot,u,0,v);
  return campusFootprint(x,z,w,depth,lot.yaw,height);
}

function landmark(name,use,kind,x,z,w,depth,floors,yaw,palette,priority=8) {
  return {...campusFootprint(x,z,w,depth,yaw),name,use,kind,floors,palette,priority};
}

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
const treeSetbacks = [
  lotPart(huizhi,-1.6,-18.1,28,18.7,0),
  lotPart(huixing,0,13.3,20,11,0),
  campusFootprint(-103,23.9,25.2,33.2)
];
const campusLanes = [
  {name:'立德路',paths:[westToNorth],color:'#a17478',at:[-65,-71]},
  {name:'立功路',paths:[northToSouth],color:'#b28d56',at:[148,-6]},
  {name:'立言路',paths:[southToLake,westReturn],color:'#728199',at:[-115,110]}
];
const laneColors = new Map(campusLanes.flatMap(lane=>lane.paths.map(path=>[path,lane.color])));
const campusFixtures = [];

function footprintCorners(lot) {
  const rect = [[-1,-1],[1,-1],[1,1],[-1,1]];
  if (lot.yaw === undefined) return rect.map(([u,v])=>[lot.x+u*lot.w/2,0,lot.z+v*lot.depth/2]);
  return rect.map(([u,v])=>lotPoint(lot,u*lot.w/2,0,v*lot.depth/2));
}

function closeToBlock(x,z,block,padding=0) {
  const dx=x-block.x, dz=z-block.z;
  if (!block.yaw) return Math.abs(dx)<block.w/2+padding && Math.abs(dz)<block.depth/2+padding;
  return Math.abs(block.c*dx-block.s*dz)<block.w/2+padding &&
    Math.abs(block.s*dx+block.c*dz)<block.depth/2+padding;
}

function fitsBetweenBuildings(a,b) {
  const ac=a.c??1, as=a.s??0, bc=b.c??1, bs=b.s??0;
  const radius=(p,c,s,u,v)=>(Math.abs(c*u-s*v)*p.w+Math.abs(s*u+c*v)*p.depth)/2;
  return [[ac,-as],[as,ac],[bc,-bs],[bs,bc]].some(([u,v])=>
    Math.abs((a.x-b.x)*u+(a.z-b.z)*v)>=1.4+radius(a,ac,as,u,v)+radius(b,bc,bs,u,v));
}
