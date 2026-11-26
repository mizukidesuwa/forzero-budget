// Use the same GCJ-02 projection as the campus gates. Smaller, unnamed
// buildings represent their block's land use on the compressed street grid.
const [parkX,parkZ]=geo(22.536629,113.929473);
const lixiangPark=campusFootprint(parkX,parkZ,130,167);
const parkOutline=[[-65,-68],[-52,-83],[50,-83],[65,-70],[65,62],[49,83],[-48,83],[-65,67]]
  .map(([dx,dz])=>[parkX+dx,parkZ+dz]);
const parkWalks=[
  street([[-176,-176],[-191,-190],[-234,-192],[-261,-170],[-267,-119],[-249,-72],
    [-207,-65],[-178,-84],[-167,-125],[-176,-176]],1.55),
  street([[-131,-124],[-157,-125],[-167,-125],[-198,-124],[-222,-122],[-267,-119]],1.7),
  street([[-227,-241],[-228,-210],[-234,-192]],1.55)
];
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
