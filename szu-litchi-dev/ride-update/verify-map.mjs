import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

import {resolve} from 'node:path';

const read=name=>readFileSync(name==='game.js'||name==='./game.js'?
  (process.env.FORZERO_GAME_JS?resolve(process.env.FORZERO_GAME_JS):new URL(name,import.meta.url)):new URL(name,import.meta.url),'utf8');
const splitGame=src=>src.split(/const mapCache\s*=\s*(?:\/\*[\s\S]*?\*\/\s*)?new WeakMap\(\);/)[0];
const canvas={getContext:()=>new Proxy({}, {get:(_,key)=>key==='measureText'?s=>({width:s.length*10}):()=>{}})};
const store={getItem:()=>null,setItem:()=>{}};
const context=vm.createContext({console,document:{createElement:()=>canvas},localStorage:store});
const run=code=>vm.runInContext(code,context);
const inspect=code=>JSON.parse(run(`JSON.stringify(${code})`));
run(splitGame(read('./game.js')));

run("activeCampus='szu';buildRidingScene(activeCampus);");
const shenzhen=inspect(`(()=>{
  const entrances=[...cityLinks,...canghaiStreets.filter(way=>canghaiGates.some(gate=>gate.name===way.name))];
  const ways=[...roads.map((path,i)=>({name:'校内道路 '+i,path,city:false})),
    ...[...cityRoads].map(([path,info])=>({name:info.name,path,city:true}))];
  const overlaps=[];
  for(const {name,path,city} of ways) {
    for(let d=.17;d<path.length;d+=.61) {
      const frame=courseFrame(path,d);
      for(const lane of [-.81,0,.81]) {
        const [x,,z]=offsetVertex(frame,lane*path.width,0);
        const solid=city&&citySolid.find(lot=>lot.kind!=='bridge-support'&&
          Math.abs(x-lot.x)<lot.w/2&&Math.abs(z-lot.z)<lot.d/2);
        const lot=buildingAt(x,z,0);
        if(solid||lot) overlaps.push({name,x,z,lot:lot?.name||lot?.district});
      }
    }
  }
  const passages=entrances.map(({name,path})=>{
    let blocked=0;
    for(let d=.11;d<path.length;d+=.42) {
      const frame=courseFrame(path,d);
      for(const lane of [-.61,0,.61]) {
        const [x,,z]=offsetVertex(frame,lane*path.width,0);
        if(!safeToRide(x,z,true)||!surfaceAt(x,z,true)) blocked++;
      }
    }
    return {name,blocked};
  });
  const fields=protectedCampusGrounds.map(site=>campus.every(lot=>(lot.parts??[lot])
    .every(part=>fitsBetweenBuildings(site,part)))&&treeSites.every(tree=>!closeToBlock(tree.x,tree.z,site)));
  const littleWest=campusGates.find(gate=>gate.name==='立业门');
  const linked=cityLinks.find(way=>way.name===littleWest.name).path;
  const guards=campusFixtures.filter(lot=>Math.hypot(lot.x-littleWest.xy[0],lot.z-littleWest.xy[1])<15&&lot.height>1.7);
  const road=cityRoads.get(openStreets[0].path);
  const guardHitsArterial=guards.some(lot=>footprintCorners(lot).some(([x,,z])=>cityRoadContains(road,x,z,0)));
  const fenceAirWalls=[];
  for(const outline of campusOutlines) for(let i=0;i<outline.length;i++) {
    const a=outline[i], b=outline[(i+1)%outline.length];
    const d=Math.hypot(b[0]-a[0],b[1]-a[1]), nx=(b[1]-a[1])/d, nz=-(b[0]-a[0])/d;
    for(let m=0;m<d;m+=3.1) {
      const q=Math.min(d,m+3.06);
      const nearOpening=[m,(m+q)/2,q].some(along=>{
        const t=along/d;
        return fenceOpenAt(mix(a[0],b[0],t),mix(a[1],b[1],t));
      });
      const subs=nearOpening?5:1;
      for(let s=0;s<subs;s++) {
        const sm=mix(m,q,s/subs), sq=mix(m,q,(s+1)/subs);
        const c=(sm+sq)/2/d, x=mix(a[0],b[0],c), z=mix(a[1],b[1],c);
        if(!fenceOpenAt(x,z)||buildingAt(x,z,.35)) continue;
        const sign=inCampus(x+nx*.7,z+nz*.7)?-1:1;
        const ox=x+sign*nx*.7, oz=z+sign*nz*.7;
        if(buildingAt(ox,oz,.35)||cityBlocked(ox,oz)||treeBlocks(ox,oz,.28)||safeToRide(ox,oz,true)) continue;
        if(gateApronAt(x,z)&&!gateApronAt(ox,oz)&&szuBorderClear(ox,oz)) continue;
        fenceAirWalls.push({x:+x.toFixed(2),z:+z.toFixed(2),ox:+ox.toFixed(2),oz:+oz.toFixed(2)});
      }
    }
  }
  const lidePlaza=[[-103,23.9],[-105,23.9],[-105,19],[-105,28.5]]
    .every(([x,z])=>safeToRide(x,z,true)&&surfaceAt(x,z,true));
  const lakeChecks=basins.map(b=>{
    const spot=nearestSafeRoad(b.x,b.z);
    return waterHazardAt(b.x,b.z)&&!safeToRide(b.x,b.z,true,false)&&safeToRide(b.x,b.z,true,true)&&
      Boolean(spot)&&!waterHazardAt(spot.p[0],spot.p[2])&&safeToRide(spot.p[0],spot.p[2],true,false);
  });
  const input={gas:true,brake:false,left:false,right:false,sprint:false};
  const freeTrial=new TimeTrial(courses[0]);
  freeTrial.freeRide();
  // Walk inward across the .25m shoreline buffer into 上文山湖 (-31, 125) without hitting an air wall
  const upper=basins[1], sx=upper.x+upper.rx*1.04*upper.c, sz=upper.z-upper.rx*1.04*upper.s;
  freeTrial.rider.position=[sx,ROAD_Y,sz];
  freeTrial.rider.heading=Math.atan2(upper.z-sz,upper.x-sx);
  freeTrial.rider.speed=7;
  for(let k=0;k<90&&!freeTrial.freeHazardNotice;k++) freeTrial.step(input);
  const freeWater={
    notice:freeTrial.freeHazardNotice?.text||null,
    speed:freeTrial.rider.speed,
    dry:!waterHazardAt(freeTrial.rider.position[0],freeTrial.rider.position[2]),
    safe:safeToRide(freeTrial.rider.position[0],freeTrial.rider.position[2],true,false)
  };
  const raceTrial=new TimeTrial(courses[0]);
  raceTrial.phase='race';
  raceTrial.elapsed=5000;
  raceTrial.rider.position=[upper.x,ROAD_Y,upper.z];
  raceTrial.rider.speed=6;
  raceTrial.step(input);
  const raceWater={
    elapsed:raceTrial.elapsed,
    lastRejoin:raceTrial.lastRejoin,
    rejoinReason:raceTrial.rejoinReason,
    dry:!waterHazardAt(raceTrial.rider.position[0],raceTrial.rider.position[2])
  };
  return {ways:ways.length,overlaps,passages,fields,guards:guards.length,guardHitsArterial,
    littleWestLink:linked.length>10,szuShortcuts:szuHighRiskShortcuts.length,fenceAirWalls,
    lidePlaza,lakeChecks,freeWater,raceWater};
})()`);
assert.deepEqual(shenzhen.overlaps,[],JSON.stringify(shenzhen.overlaps.slice(0,12)));
assert.ok(shenzhen.passages.every(passage=>passage.blocked===0),JSON.stringify(shenzhen.passages));
assert.ok(shenzhen.fields.every(Boolean));
assert.ok(shenzhen.littleWestLink&&shenzhen.guards>=2&&!shenzhen.guardHitsArterial,JSON.stringify(shenzhen));
assert.equal(shenzhen.szuShortcuts,0);
assert.deepEqual(shenzhen.fenceAirWalls,[],JSON.stringify(shenzhen.fenceAirWalls.slice(0,12)));
assert.ok(shenzhen.lidePlaza);
assert.ok(shenzhen.lakeChecks.every(Boolean));
assert.ok(shenzhen.freeWater.notice?.includes('落水')&&shenzhen.freeWater.speed===0&&shenzhen.freeWater.dry&&shenzhen.freeWater.safe,JSON.stringify(shenzhen.freeWater));
assert.ok(shenzhen.raceWater.rejoinReason==='落水'&&shenzhen.raceWater.elapsed===7000&&shenzhen.raceWater.lastRejoin===7000&&shenzhen.raceWater.dry,JSON.stringify(shenzhen.raceWater));

run("activeCampus='ucl';buildRidingScene(activeCampus);");
const london=inspect(`(()=>{
  const obstacles=[];
  for(const {id,path} of uclWays) {
    for(let d=.19;d<=path.length;d+=.61) {
      const frame=courseFrame(path,d);
      for(const lane of [-.87,-.43,0,.43,.87]) {
        const [x,,z]=offsetVertex(frame,lane*path.width,0);
        if(!canRideUcl(x,z)) obstacles.push([id,x,z,uclBuildingAt(x,z)?.name]);
      }
    }
  }
  const shops=londonPlaces.filter(place=>place.kind==='shop');
  const lost=shops.filter(place=>!canRideUcl(place.x,place.z)||!uclStreetAt(place.x,place.z,6.1));
  return {ways:uclWays.length,shops:shops.length,lost,obstacles};
})()`);
assert.deepEqual(london.obstacles,[],JSON.stringify(london.obstacles.slice(0,12)));
assert.deepEqual(london.lost,[]);
assert.equal(london.shops,23);

// Inspect the actual planar geometry emitted before signs, paintings and kerbs are applied.
const ground=inspect(`(()=>{
  clearWorldShapes();londonGroundSurfaces();
  const cells=new Map(),step=9;
  const tile=p=>Math.floor(p/step);
  for(const mesh of [road,pavement]) for(let i=0;i<mesh.indices.length;i+=3) {
    const tri=mesh.indices.slice(i,i+3).map(j=>[mesh.vertices[j*11],mesh.vertices[j*11+2]]);
    const xs=tri.map(p=>p[0]),zs=tri.map(p=>p[1]);
    for(let x=tile(Math.min(...xs));x<=tile(Math.max(...xs));x++)
      for(let z=tile(Math.min(...zs));z<=tile(Math.max(...zs));z++) {
        const key=x*4096+z;
        if(!cells.has(key)) cells.set(key,[]);
        cells.get(key).push({tri,road:mesh===road});
      }
  }
  const cross=(a,b,x,z)=>(b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0]);
  const cover=(x,z)=>(cells.get(tile(x)*4096+tile(z))??[]).filter(({tri})=>
    tri.every((a,i)=>cross(a,tri[(i+1)%3],x,z)<-.0000001));
  let scanned=0;
  const faults=[];
  for(const {id,path} of uclWays) {
    for(let d=.237;d<path.length-.34;d+=1.133) {
      const frame=courseFrame(path,d);
      for(const f of [-.73,-.31,.111,.37,.77]) {
        const [x,,z]=offsetVertex(frame,path.width*f,0),hits=cover(x,z);
        scanned++;
        if(hits.length!==1||!londonPaths.has(id)&&!hits[0].road) faults.push([id,x,z,hits.length]);
      }
    }
  }
  return {scanned,faults:faults.slice(0,12),frontGateIsRoad:cover(.193,.317).some(hit=>hit.road),
    pedestrianApproach:cover(7.132,.119).some(hit=>!hit.road)};
})()`);
assert.deepEqual(ground.faults,[],JSON.stringify(ground.faults));
assert.ok(ground.frontGateIsRoad&&ground.pedestrianApproach);
console.log(JSON.stringify({shenzhen,london,ground}));
