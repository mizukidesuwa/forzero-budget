// Local street-grid coordinates, from the UCL campus plan, UCLH site map and Camden West End plans.
// The chart rotates this grid to approximate geographic north.
const campuses = {
  szu:{name:'深圳大学 · 粤海校区',station:'深大站',arrival:[metroStop[0]-8,ROAD_Y,metroStop[1]+9],heading:0},
  ucl:{name:'UCL · Bloomsbury',station:'UCL 返程点',arrival:[-52,ROAD_Y,-7],heading:0}
};
let activeCampus='szu';
const uclBounds={minX:-226,maxX:225,minZ:-136,maxZ:183};
const uclWays=[
  ['Gower Street',5.6,[-65,-113],[-65,182]],
  ['Gordon Street',4.4,[59,-114],[59,68]],
  ['Gower Place',3.5,[-65,-73],[59,-73]],
  ['Euston Road',8.5,[-226,-112],[-159,-113],[-65,-113],[59,-114],[133,-119],[225,-126]],
  ['University Street',4.1,[-159,25],[-119,25],[-65,25]],
  ['Torrington Place',5.0,[-159,87],[-119,87],[-65,87],[38,87]],
  ['Byng Place',3.8,[38,87],[59,68]],
  ['Malet Place',2.75,[-8,69],[-8,32],[27,32],[27,13],[59,13]],
  ['Malet Street',3.6,[-8,87],[-8,182]],
  ['Malet Place',2.75,[-8,69],[-8,87]],
  ['Endsleigh Gardens',3.7,[59,-73],[166,-73]],
  ['Taviton Street',3.2,[106,-73],[106,16]],
  ['Gordon Square',3.5,[59,16],[122,16]],
  ['Gordon Square',3.5,[59,68],[122,68]],
  ['Bedford Way',4.1,[122,16],[122,172]],
  ['Tavistock Square',4.0,[122,68],[166,68],[214,68]],
  ['Upper Woburn Place',5.0,[166,-122],[166,-73],[166,68]],
  ['Woburn Place',4.7,[166,68],[166,182]],
  ['Tottenham Court Road',6.6,[-159,-113],[-159,182]],
  ['Warren Street',3.4,[-226,-87],[-159,-87]],
  ['Grafton Way',4.15,[-226,-57],[-159,-61],[-119,-63],[-65,-66]],
  ['Huntley Street',3.0,[-119,-63],[-119,157]],
  ['Capper Street',3.3,[-159,51],[-119,51]],
  ['Howland Street',3.9,[-225,51],[-159,51]],
  ['Whitfield Street',3.0,[-190,-87],[-190,150]],
  ['Tottenham Street',3.4,[-225,118],[-159,118],[-119,118]],
  ['Goodge Street',4.1,[-225,155],[-159,155]],
  ['Chenies Street',3.3,[-159,155],[-119,155],[-65,155],[-8,155]]
].map(([name,width,...points])=>({name,path:street(points,width)}));
const uclStreetIndex=indexStreets(uclWays.map(way=>way.path));
const uclWayByPath=new Map(uclWays.map(way=>[way.path,way.name]));

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

const uclLots=[
  ['Wilkins Building', '主图书馆', 'wilkins', 8,-7,25,50,15],
  ['North Wing', 'Slade School of Fine Art', 'stone', -31,-34,55,13,12],
  ['South Wing', 'Wilkins Building', 'stone', -30,20,56,12,12],
  ['Chadwick Building', '土木工程', 'stone', -51,34,15,15,12],
  ['Medical Sciences', '医学教学楼', 'brick', -47,57,22,19,14],
  ['Darwin Building', '生命科学', 'brick', -26,50,14,16,17],
  ['DMS Watson Building', 'Science Library', 'modern', 10,52,25,21,17],
  ['Roberts Building', '工程学院', 'modern', 42,48,19,32,17],
  ['Physics Building', '物理与天文', 'stone', 19,-34,31,14,14],
  ['Kathleen Lonsdale Building', '地球科学', 'stone', -32,-57,50,18,13],
  ['Student Centre', '学生中心', 'student', 45,-13,15,26,17],
  ['Bloomsbury Theatre', '剧院', 'modern', 43,-35,19,12,14],
  ['Students’ Union UCL', '学生会', 'brick', 44,-57,17,20,13],
  ['Christopher Ingold Building', '化学系', 'modern', 78,-30,21,38,18],
  ['The Bartlett', '建筑学院', 'modern', 78,-59,22,11,17],
  ['Gordon House', '教学楼', 'brick', 132,-25,36,43,14],
  ['Institute of Archaeology', '考古研究所', 'stone', 134,4,39,10,16],
  ['Cruciform Building', '生物医学教学楼', 'cruciform', -93,-10,40,48,21],
  ['UCLH · University College Hospital', '235 Euston Road', 'hospital', -120,-85,61,33,22],
  ['UCLH · Elizabeth Garrett Anderson Wing', 'Euston Road', 'anderson', -81.5,-86,17,32,18],
  ['UCLH · Grafton Way Building', 'Huntley Street 路口', 'grafton', -139,-28,24,56,20],
  ['UCLH · Macmillan Cancer Centre', 'Huntley Street', 'modern', -96,47,33,30,20],
  ['UCL Medical School', 'University Street', 'brick', -79.5,35,12.8,8,14],
  ['Gower Street', '', 'brick', -91,75,39,10,15],
  ['Gower Street', '', 'brick', -37,106,39,16,14],
  ['Torrington Place', '', 'stone', 12,111,30,18,16],
  ['Malet Street', '', 'stone', 8,142,17,12,16],
  ['Euston Road', '', 'stone', 2,-91,97,24,16],
  ['Endsleigh Gardens', '', 'brick', 102,-93,69,25,15],
  ['Tavistock Square', '', 'brick', 191,37,31,34,16],
  ['Torrington Place', '', 'brick', -94,105,37,18,15]
].map(([name,use,style,x,z,w,depth,height])=>({...campusFootprint(x,z,w,depth,0,height),name,use,style}));
const uclLibrary=uclLots[0];
uclLibrary.parts=[
  uclLibrary,
  lotPart(uclLibrary,-16.3,0,7.8,23,11),
  lotPart(uclLibrary,-21.3,0,3.2,26,1.3)
];
const cruciform=uclLots.find(lot=>lot.style==='cruciform');
cruciform.parts=[
  lotPart(cruciform,-.5,0,cruciform.w-1,17,cruciform.height),
  lotPart(cruciform,-12,0,11,cruciform.depth,17.0),
  lotPart(cruciform,14.8,0,10.4,cruciform.depth,18.0),
  ...[-15.6,15.6].map(z=>lotPart(cruciform,cruciform.w/2-3.2,z,8.1,7.95,22.0))
];
const hospital=uclLots.find(lot=>lot.style==='hospital');
hospital.parts=[
  lotPart(hospital,1.8,2.07,57.8,28.86,20.6),
  lotPart(hospital,0.35,-13.8,57.0,5.4,20.6),
  lotPart(hospital,-17.3,.98,24,23,48.5)
];
const hospitalEntrance=[-125.4,ROAD_Y,-103.5];
const uclHospitalRoute=[campuses.ucl.arrival,[-65,ROAD_Y,-7],[-65,ROAD_Y,-113],
  [hospitalEntrance[0],ROAD_Y,-114],hospitalEntrance];
const uclGarden=campusFootprint(91,42,47.0,36.8);
const tavistockGarden=campusFootprint(144,41,29.0,32.0);
const uclQuad=campusFootprint(-33,-7,54,34);
const uclLawnLots=[
  lotPart(uclQuad,-1.4,-10.4,33,9,0),lotPart(uclQuad,-1.4,10.4,33,9,0),
  lotPart(uclGarden,0,0,43,32,0),tavistockGarden
];
const uclFence=[
  [-60,-23,-60,-13],[-60,-1,-60,10],
  [68,24,85,24],[97,24,114,24],[68,60,114,60],
  [68,24,68,35],[68,48,68,60],[114,24,114,60]
];

function uclBuildingAt(x,z,margin=.38,y=0) {
  for(const lot of uclBuildings) {
    if((lot.parts??[lot]).some(part=>y<part.height&&closeToBlock(x,z,part,margin))) return lot;
  }
  return null;
}

function canRideUcl(x,z) {
  const {minX,maxX,minZ,maxZ}=uclBounds;
  return x>minX+.6&&x<maxX-.6&&z>minZ+.6&&z<maxZ-.6&&
    !uclBuildingAt(x,z)&&!uclStreetFixtures.some(lot=>closeToBlock(x,z,lot,.34))&&
    !treeSites.some(tree=>Math.abs(tree.x-x)<.31&&Math.abs(tree.z-z)<.31);
}

function uclSurfaceAt(x,z) {
  return Boolean(uclStreetAt(x,z,.20)||pavedGroundAt(x,z)||
    !uclLawnLots.some(lot=>closeToBlock(x,z,lot)));
}

const uclStreetFixtures=uclFence.map(([a,b,c,d])=>
  campusFootprint((a+c)/2,(b+d)/2,Math.max(.18,Math.abs(c-a)),Math.max(.18,Math.abs(d-b)),0,1.2));

function uclStreetMeshes() {
  for(const {path} of uclWays) {
    const w=path.width,sidewalk=w+1.75;
    ribbon(pavement,path,-sidewalk,sidewalk,.019,'#beb3a3',0,path.length,3.2);
    ribbon(road,path,-w,w,ROAD_Y,'#535759',0,path.length,3.2);
    for(let d=3;d<path.length-2;d+=6.6) {
      const frame=courseFrame(path,d);
      const [x,,z]=frame.p;
      const segments=uclStreetIndex.get(streetCell(x,z))??[];
      if(segments.some(s=>s.path!==path&&streetGapSquared(s,x,z)<(s.path.width+2.5)**2)) continue;
      ribbon(masonry,path,-.053,.053,ROAD_Y+.004,'#d5d4cc',d,Math.min(path.length,d+2.55),3.2);
    }
  }
  // Yellow kerb markings and a crossing at the west entrance of the Main Quad.
  for(const [street,from,to] of [['Gower Street',72,125],['Tottenham Court Road',31,45],['Tottenham Court Road',113,146]]) {
    const path=uclWays.find(way=>way.name===street).path;
    for(const side of [-1,1]) {
      const edge=side*(path.width-.30);
      ribbon(masonry,path,edge-.045,edge+.045,.047,'#d4b067',from,to,3);
    }
  }
  for(const [x,z,width] of [[-65,-12,11.0],[-159,-57,12.6],[-159,49,12.6],[-159,148,12.6]]) {
    for(let i=0;i<8;i++) masonry.box([x+(i-3.5)*width/8,.047,z],[width*.054,.011,2.40],'#d4d1c4');
  }
}

function uclRailings() {
  for(const [x,z,xx,zz] of uclFence) {
    const len=Math.hypot(xx-x,zz-z), vertical=x===xx;
    const trim=vertical?[.10,.08,len]:[len,.08,.10];
    for(const y of [.28,1.02]) scenery.box([(x+xx)/2,y,(z+zz)/2],trim,'#41484a');
    const balusters=Math.ceil(len/.64);
    for(let i=0;i<=balusters;i++) {
      const t=i/balusters;
      scenery.box([mix(x,xx,t),.55,mix(z,zz,t)],[.073,1.1,.073],'#41484a');
    }
  }
}

function blocksBeyondUcl() {
  const blocks=[
    [-206,-141,27,16],[-172,-148,26,25],[-139,-148,27,25],[-103,-146,32,24],[-61,-150,36,27],
    [-11,-144,36,23],[34,-145,37,25],[79,-150,35,27],[117,-148,29,26],[161,-158,47,31],[208,-161,35,32],
    [-247,-69,34,35],[-245,-20,31,39],[-246,28,30,42],[-245,87,30,46],[-246,143,32,40],
    [239,-91,24,44],[243,-30,28,43],[246,21,32,37],[242,107,28,38],
    [-211,199,28,21],[-174,203,31,28],[-125,201,51,24],[-66,202,39,27],[-11,206,50,31],
    [50,202,48,24],[114,204,48,30],[181,200,36,23]
  ];
  for(const [i,[x,z,w,d]] of blocks.entries()) {
    const tint=i%4===1?'#a89a88':i%4===3?'#b9b3a2':'#956d60';
    const h=12.4+(i%5)*1.93;
    urban.box([x,h/2,z],[w,h,d],tint);
    urban.box([x,h+.13,z],[w+.23,.28,d+.27],'#a7a19a');
    for(const side of [-1,1]) for(let level=0;level<4;level++) {
      const y=2.1+level*(h-2.4)/4;
      wallPanel(urban,x,y,z+side*(d/2+.012),w-.82,.82,'#697073',0,side);
      wallPanel(urban,x+side*(w/2+.012),y,z,d-.68,.82,'#697073',side,0);
    }
  }
}

function buildUclWorld() {
  terrain.quad([-540,-.02,-475],[490,-.02,-475],[490,-.02,485],[-540,-.02,485],'#aaa79e');
  uclStreetMeshes();
  lotBox(uclQuad,0,.006,0,uclQuad.w,.031,uclQuad.depth,'#d2c4ad',pavement);
  lotBox(uclGarden,0,.011,0,uclGarden.w,.042,uclGarden.depth,'#c9bca9',pavement);
  pavement.box([hospitalEntrance[0],.018,-103],[27,.036,3.54],'#c2c2b8');
  lawnPatch(scenery,()=>{
    for(const lawn of uclLawnLots) lotBox(lawn,0,.029,0,lawn.w,.031,lawn.depth,'#83935d',scenery);
  });
  lotBox(uclGarden,0,.050,0,43,.021,3.40,'#c1b6a4',pavement);
  const shopLabels=[];
  for(const lot of uclBuildings) renderLondonBuilding(lot,shopLabels);
  placeShopSigns(shopLabels);
  blocksBeyondUcl();
  londonStreetSigns();
  uclRailings();
  for(const [x,z,s] of [[-52,-18,.77],[-52,4,.77],[-27,-17,.95],[-27,4,.95],
    [45,-45,.84],[-15,-67,.79],[76,27,1.2],[81,34,1.33],[90,54,1.27],[106,30,1.28],
    [108,50,1.36],[141,29,1.28],[78,51,1.23],[111,31,1.27],[141,50,1.20],
    [150,51,1.35],[135,-58,.94],[-72,29,.66]]) {
    if(!uclStreetAt(x,z,1.6)&&!uclBuildingAt(x,z,1)) deciduous(x,z,s,0);
  }
  for(const [x,z,yaw] of [[-37,-14,0],[-37,1,Math.PI],[87,39,0],[118,45,Math.PI]]) bench(x,z,yaw);
  for(const [x,z] of [[-71,-45],[-71,33],[-59,61],[52,-57],[66,-14],[66,44],[-44,63],[-123.5,62],[143,53],
    [-151,-100],[-167,-48],[-151,42],[-167,73],[-151,106],[-167,137],[-173,151],[-208,149],[-106,-104]]) {
    if(!uclBuildingAt(x,z)) londonLantern(x,z);
  }
  const marker=campuses.ucl.arrival;
  placeTravelSign(marker[0],marker[2]-4.0,'UCL 返程点','返回深圳大学',Math.PI/2);
  indexGroundSurfaces();
}
