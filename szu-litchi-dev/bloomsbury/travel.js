function canTravel() {
  return ready&&race.phase==='free'&&!race.paused&&!settingsOpen&&!pendingCampus;
}

function atTravelPoint() {
  const [x,,z]=race.rider.position,[sx,,sz]=campuses[activeCampus].arrival;
  return Math.hypot(x-sx,z-sz)<=11;
}

function arriveAtStation() {
  const {arrival,heading}=campuses[activeCampus];
  clearInput();
  Object.assign(race.rider,{
    position:arrival.slice(),heading,paved:true,speed:0,steering:0,throttle:0,brake:0,
    yawRate:0,lean:0,slip:0,stationaryBrake:0,sprinting:false,sprintLocked:false
  });
  race.moved=true;
  race.accumulator=0;
  cameraRevision++;
  priorTimestamp=undefined;
  openMap(false);
  focusStage();
}

function requestTravel() {
  if(!canTravel()) return;
  if(!atTravelPoint()) {
    arriveAtStation();
    updateHud();
    return;
  }
  const destination=activeCampus==='szu'?'ucl':'szu';
  clearInput();
  pendingCampus={destination,at:performance.now()+90};
  ui.notice.hidden=false;
  setText(ui.notice,destination==='ucl'?'正在前往 UCL Bloomsbury…':'正在返回深圳大学…');
  updateHud();
}

function updateTravelButton() {
  ui.travel.hidden=race.phase!=='free';
  ui.travel.disabled=!canTravel();
  setText(ui.travel,atTravelPoint()?(activeCampus==='szu'?'前往 UCL':'返回深大'):
    (activeCampus==='szu'?'到深大站':'到 UCL 返程点'));
}

function updateCampusLabels() {
  const london=activeCampus==='ucl';
  stage.dataset.campus=activeCampus;
  setText(ui.campusName,campuses[activeCampus].name);
  setText(ui.mapTitle,london?'Bloomsbury 地图':'校园俯视地图');
  ui.szuReferences.hidden=london;
  ui.uclReference.hidden=!london;
  canvas.setAttribute('aria-label',london?'UCL Bloomsbury 三维骑行地图':'深圳大学三维骑行赛道');
}

const worldShapes=[masonry,scenery,urban,foliage,road,pavement,water,terrain];
const sceneLists=[cityJunctions,cityVehicles,citySolid,campusFixtures,treeSites,lawnSpans];

function clearWorldShapes() {
  for(const shape of worldShapes) shape.vertices.length=shape.indices.length=0;
  signs.length=0;
}

function buildRidingScene(campus) {
  clearWorldShapes();
  for(const items of sceneLists) items.length=0;
  const simulationRandom=random;
  random=randomSource(campus==='ucl'?248091:30986);
  try {
    if(campus==='ucl') buildUclWorld();
    else campusUrbanWorld();
  } finally {
    random=simulationRandom;
  }
}

function uploadRidingScene(gpu,campus) {
  const solid=meshCells(gpu,[masonry,scenery,urban,foliage]).map(mesh=>[mesh,IDENTITY]);
  const labels=signs.map(({shape,canvas})=>[new gpu.Mesh(shape,5,canvas),IDENTITY]);
  const world={
    labels,
    objects:solid.concat([
      ...meshCells(gpu,[road],2),...meshCells(gpu,[pavement],4),...meshCells(gpu,[water],3)
    ].map(mesh=>[mesh,IDENTITY])),
    mirrored:solid.concat(labels),
    ground:[new gpu.Mesh(terrain,1),IDENTITY],
    hasWater:campus==='szu'
  };
  gpu.bake(solid);
  clearWorldShapes();
  const cars=new Map();
  for(const actor of cityVehicles) {
    if(!cars.has(actor.model)) cars.set(actor.model,new gpu.Mesh(actor.model));
  }
  return {world,cars};
}

function disposeRidingScene(world,cars,routeMeshes) {
  const meshes=new Set(cars.values());
  for(const [mesh] of [...world.objects,...world.labels,world.ground]) meshes.add(mesh.owner??mesh);
  for(const {arrows,braking} of routeMeshes.values()) {
    for(const [mesh] of [...arrows,...braking]) meshes.add(mesh.owner??mesh);
  }
  for(const mesh of meshes) mesh.dispose();
  routeMeshes.clear();
}
