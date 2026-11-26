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
