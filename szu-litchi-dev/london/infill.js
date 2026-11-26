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
  ['Hilton London Euston','17–18 Upper Woburn Place','stone',318,-33,17,22,15,1],
  ['Hilton London Euston','Endsleigh Gardens return','stone',286,-35,42,16,14,2],
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
