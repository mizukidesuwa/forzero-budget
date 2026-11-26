// Bloomsbury street grid, calibrated to the UCL Estates map and surveyed landmark positions.
// Local x runs along the Georgian cross streets. Charts rotate it back to geographic north.
const londonNorth=.56;
function londonPoint(lat,lon) {
  const east=(lon+.13455)*69200, south=(51.52435-lat)*111250;
  const c=Math.cos(londonNorth),s=Math.sin(londonNorth);
  return [.80*(c*east-s*south),.80*(s*east+c*south)];
}

const campuses = {
  szu:{name:'深圳大学 · 粤海校区',station:'深大站',arrival:[metroStop[0]-8,ROAD_Y,metroStop[1]+9],heading:0},
  ucl:{name:'伦敦 · Bloomsbury',station:'UCL 返程点',arrival:[11,ROAD_Y,0],heading:0}
};
const uclBounds={minX:-273,maxX:453,minZ:-194,maxZ:566};
const junction={
  eustonGower:[6,-143], eustonGordon:[115,-150], eustonCourt:[-174,-131], eustonWoburn:[337,-126],
  gowerPlaceWest:[1,-81], gowerPlaceEast:[118,-87], quadGate:[0,0],
  graftonGower:[1,-57], graftonCourt:[-173,-39], huntleyGrafton:[-105,-31],
  universityGower:[0,56], universityCourt:[-167,55], universityHuntley:[-104,55],
  torringtonCourt:[-162,178], torringtonGower:[1,184], maletTorrington:[57,197],
  byngGordon:[120,180], byngTorrington:[125,181], byngWoburn:[164,174],
  gordonNW:[120,79], gordonNE:[213,79], gordonSE:[213,152], gordonSW:[120,152],
  bedfordTavistock:[249,153], tavistockWoburn:[336,157],
  maletKeppel:[70,420], maletMontague:[75,505], gowerKeppel:[10,411],
  russellNW:[222,377], russellNE:[327,373], russellSE:[352,513], russellSW:[218,526]
};
const uclWays=[
  ['gower','Gower Street',5.9,junction.eustonGower,junction.gowerPlaceWest,junction.graftonGower,junction.quadGate,
    junction.universityGower,[0,114],junction.torringtonGower,[5,303],junction.gowerKeppel,[15,563]],
  ['gordon','Gordon Street',4.5,junction.eustonGordon,junction.gowerPlaceEast,[124,-40],[126,21],[124,51],junction.gordonNW,
    junction.gordonSW,junction.byngGordon],
  ['studentPassage','Student Centre passage',1.85,[124,51],[119,54.1],[107,57.8],[95,57.2],[85,56]],
  ['euston','Euston Road',10.6,[-271,-119],junction.eustonCourt,[-94,-139],[-58,-139],junction.eustonGower,
    junction.eustonGordon,[195,-145],[267,-133],junction.eustonWoburn,[450,-108]],
  ['gowerPlace','Gower Place',3.7,junction.gowerPlaceWest,[47,-84],[87,-86],junction.gowerPlaceEast],
  ['quad','Main Quad',1.98,junction.quadGate,[18,0],[35,0],[46,0]],
  ['university','University Street',3.9,junction.universityCourt,junction.universityHuntley,junction.universityGower],
  ['torrington','Torrington Place',5,[-270,179],[-236,179],junction.torringtonCourt,[-104,180],[-53,182],
    junction.torringtonGower,junction.maletTorrington],
  ['byng','Byng Place',4.4,junction.maletTorrington,[88,192],junction.byngGordon,junction.byngTorrington,
    [153,175],junction.byngWoburn],
  ['maletPlace','Malet Place',2.6,junction.maletTorrington,[56,171],[53,139],[52,107],[49,83]],
  ['malet','Malet Street',4.5,junction.maletTorrington,[59,251],[61,319],[65,373],junction.maletKeppel,
    junction.maletMontague,[79,563]],
  ['gordonNorth','Gordon Square',3.5,junction.gordonNW,[166,78],junction.gordonNE],
  ['gordonEast','Gordon Square',3.5,junction.gordonNE,[214,119],junction.gordonSE],
  ['gordonSouth','Gordon Square',3.8,junction.gordonSW,[162,153],junction.gordonSE,junction.bedfordTavistock],
  ['endsleigh','Endsleigh Gardens',4.2,[121,-63],[167,-59],[218,-56],[268,-51],[335,-51]],
  ['taviton','Taviton Street',3.5,[174,-58],[177,-11],[180,37],[182,79]],
  ['endsleighStreet','Endsleigh Street',3.4,[217,-56],[216,3],[215,44],junction.gordonNE],
  ['tavistockWest','Tavistock Square',4.6,[257,-52],[253,-2],[252,37],[251,90],junction.bedfordTavistock],
  ['tavistockSouth','Tavistock Place',5.2,junction.bedfordTavistock,[292,155],junction.tavistockWoburn,[390,158]],
  ['bedford','Bedford Way',4.65,junction.bedfordTavistock,[258,183],[260,221],[260,274],[257,317],
    [251,350],[239,368],junction.russellNW],
  ['woburn','Woburn Square',2.4,junction.byngWoburn,[164,198],[164,230],[167,248],[175,254],[185,255]],
  ['torringtonSq','Torrington Square',2.5,junction.byngTorrington,[125,201],[126,231],[126,264]],
  ['soasWalk','Torrington Square',2.2,[126,264],[126,286],[126,312],[126,331]],
  ['galleryWalk','Thornhaugh Street',2.3,[126,331],[153,331],[178,331],[199,331]],
  ['endsleighPlace','Endsleigh Place',3.5,junction.gordonNE,[232,79],[251,79]],
  ['tavistockNorth','Tavistock Square',3.25,[251,79],[292,78],[336,78]],
  ['woburnEast','Woburn Square',2.2,[214,152],[211,177],[201,183],[201,221],[201,239],[198,249],[185,255]],
  ['thornhaugh','Thornhaugh Street',2.7,[185,255],[190,263],[192,287],[196,321],[202,339],
    [206,357],[211,371],junction.russellNW],
  ['woburnPlace','Upper Woburn Place',6.6,junction.eustonWoburn,[335,-51],[336,43],[336,103],junction.tavistockWoburn],
  ['woburnLower','Woburn Place',6.2,junction.tavistockWoburn,[338,209],[334,262],[327,319],junction.russellNE],
  ['russellNorth','Russell Square',5.6,junction.russellNW,[259,376],[293,374],junction.russellNE],
  ['bernard','Bernard Street',4.15,junction.russellNE,[359,377],[398,381],[423,384],[450,388]],
  ['russellEast','Russell Square',6.3,junction.russellNE,[339,396],[344,425],[349,467],junction.russellSE,[358,556]],
  ['russellSouth','Russell Square',4.55,junction.russellSW,[255,525],[300,520],junction.russellSE],
  ['russellWest','Russell Square',4.8,junction.russellNW,[211,384],[201,404],[197.5,423],[200.5,454],
    [205,491],[211,513],junction.russellSW],
  ['keppel','Keppel Street',3.85,junction.gowerKeppel,[38,416],junction.maletKeppel],
  ['montague','Montague Place',4.4,junction.maletMontague,[116,511],[164,516],junction.russellSW],
  ['court','Tottenham Court Road',6.8,junction.eustonCourt,[-174,-87],junction.graftonCourt,[-171,-5],
    junction.universityCourt,[-164,111],junction.torringtonCourt,[-155,253],[-150,280],[-145,391],[-141,564]],
  ['warren','Warren Street',3.8,[-271,-92],[-235,-90],[-203,-87],[-174,-87]],
  ['grafton','Grafton Way',3.8,[-269,-40],[-233,-41],junction.graftonCourt,[-141,-35],
    junction.huntleyGrafton,[-50,-45],junction.graftonGower],
  ['huntley','Huntley Street',3.55,junction.huntleyGrafton,[-105,-6],junction.universityHuntley,
    [-103,119],[-104,180],[-103,238]],
  ['howland','Howland Street',3.8,[-271,55],[-234,54],junction.universityCourt],
  ['whitfield','Whitfield Street',3.35,[-234,-131],[-235,-90],[-233,-41],[-234,54],[-236,179],[-230,288],[-226,417]],
  ['capper','Capper Street',3.1,[-164,111],[-134,113],[-103,119]],
  ['chenies','Chenies Street',3.6,[-230,288],[-150,280],[-62,291],[5,303]],
  ['store','Store Street',3.8,[-145,391],[-105,395],[-55,402],junction.gowerKeppel]
].map(([id,name,width,...nodes])=>({id,name,path:street(nodes,width)}));
const londonRoads=new Map(uclWays.map(way=>[way.id,way.path]));
const uclStreetIndex=indexStreets(londonRoads.values());
const uclWayByPath=new Map(uclWays.map(({path,name})=>[path,name]));

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

const [gordonX,gordonZ]=londonPoint(51.52426,-.13087);
const [tavistockX,tavistockZ]=londonPoint(51.52499,-.128997);
const [woburnX,woburnZ]=londonPoint(51.52333,-.12964);
const [holdenX,holdenZ]=londonPoint(51.52105,-.12874);
const [ioeX,ioeZ]=londonPoint(51.523197,-.12822968);
const [uchX,uchZ]=londonPoint(51.52492,-.13668);
const uclQuad=campusFootprint(28,0,53,54);
const uclQuadPlanting=[-1,1].map(side=>lotPart(uclQuad,-4,side*19,28,8,0));
const londonGardenLots=[
  ['Gordon Square',campusFootprint(gordonX,gordonZ,77,59)],
  ['Tavistock Square',campusFootprint(tavistockX,tavistockZ,67,63)],
  ['Woburn Square',campusFootprint(woburnX,woburnZ-2,24,56)],
  ['Malet Street Gardens',campusFootprint(83,359,19,69)],
  ['Friends’ Garden',campusFootprint(162,-102,29,51)]
];

// Russell Square garden perimeter, simplified from Historic England's registered garden polygon.
const russellGarden=[
  [51.52198,-.127444],[51.522054,-.127338],[51.522551,-.126135],[51.522569,-.125973],
  [51.522531,-.125694],[51.521754,-.124682],[51.521615,-.124612],[51.521449,-.124673],
  [51.520867,-.125911],[51.520835,-.126283],[51.520959,-.126605],[51.521636,-.127441],
  [51.521813,-.127513]
].map(([lat,lon])=>londonPoint(lat,lon));
const londonGardens=[
  ...londonGardenLots.map(([name,lot])=>({name,outline:footprintCorners(lot).map(([x,,z])=>[x,z])})),
  {name:'Russell Square',outline:russellGarden}
].map(garden=>{
  const {outline}=garden;
  return {...garden,center:outline.reduce(([x,z],[a,b])=>[x+a/outline.length,z+b/outline.length],[0,0])};
});

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
const gibbsBuilding=londonLot('Wellcome Trust · Gibbs Building','215 Euston Road','gibbs',30.5,-110.7,38,44,28.5);
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

const royalNational=londonLot('Royal National Hotel','Bedford Way','hotel',296,264,58,188,20);
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

const londonPaths=new Set(['quad','maletPlace','woburn','torringtonSq','soasWalk','galleryWalk','woburnEast','thornhaugh','studentPassage']);
const uclHospitalRoute=joinTrack([
  section(londonRoads.get('quad'),[campuses.ucl.arrival[0],campuses.ucl.arrival[2]],junction.quadGate),
  section(londonRoads.get('gower'),junction.quadGate,junction.eustonGower),
  section(londonRoads.get('euston'),junction.eustonGower,[hospitalEntrance[0],-138])
]).rows.map(row=>row.p).concat([hospitalEntrance]);

function uclBuildingAt(x,z,margin=.38,y=0) {
  for(const lot of uclBuildings) {
    if((lot.parts??[lot]).some(part=>y<part.height&&y+.1>=(part.bottom??0)&&closeToBlock(x,z,part,margin))) return lot;
  }
  return null;
}

function canRideUcl(x,z) {
  const {minX,maxX,minZ,maxZ}=uclBounds;
  return x>minX+.6&&x<maxX-.6&&z>minZ+.6&&z<maxZ-.6&&
    !uclBuildingAt(x,z)&&!uclFixtures.some(lot=>closeToBlock(x,z,lot,.28))&&
    !treeSites.some(tree=>Math.abs(tree.x-x)<.31&&Math.abs(tree.z-z)<.31);
}

function uclSurfaceAt(x,z) {
  return Boolean(uclStreetAt(x,z,.20)||pavedGroundAt(x,z)||
    !uclQuadPlanting.some(lot=>closeToBlock(x,z,lot))&&
    !londonGardens.some(({outline})=>inOutline(x,z,outline)));
}
