import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

import {resolve} from 'node:path';

const read=name=>readFileSync(name==='game.js'||name==='./game.js'?
  (process.env.FORZERO_GAME_JS?resolve(process.env.FORZERO_GAME_JS):new URL(name,import.meta.url)):new URL(name,import.meta.url),'utf8');
const splitGame=src=>src.split(/const mapCache\s*=\s*(?:\/\*[\s\S]*?\*\/\s*)?new WeakMap\(\);/)[0];
const canvas={getContext:()=>new Proxy({},{get:(_,key)=>key==='measureText'?text=>({width:text.length*10}):()=>{}})};
const context=vm.createContext({document:{createElement:()=>canvas}});
const run=source=>vm.runInContext(source,context);
run(splitGame(read('game.js'))+read('../rounds/drive-path.js'));

const result=run(`JSON.stringify((()=>{
  activeCampus='shunde';buildRidingScene(activeCampus);
  const routeController=rideTest.toString().replace('function rideTest(event,sprint,seconds=175)',
    'function rideWithBuild(event,sprint,seconds,bike)').replace('new TimeTrial(event)','new TimeTrial(event,bike)');
  const rideWithBuild=eval('('+routeController+')');
  const report=mountainRoads.map(({path,profile,gravel},i)=>{
    const e=mountainCourses[i], blocked=[],trees=[];
    let low=0,high=0,loose=0,worstOverlap=-Infinity;
    for(let d=0;d<path.length;d+=.5) {
      const frame=courseFrame(path,d),[x,,z]=frame.p;
      const grade=mountainGrade(x,z,frame.f[0],frame.f[2]);
      low=Math.min(low,grade);high=Math.max(high,grade);
      if(!surfaceAt(x,z)) loose+=.5;
      for(const side of [-path.width+.55,0,path.width-.55]) {
        const [px,,pz]=offsetVertex(frame,side,0);
        if(!safeToRide(px,pz)) blocked.push([d,side]);
        if(treeBlocks(px,pz,.31)) trees.push([d,side]);
        // Interpolate the actual ground triangle under the lane.
        const gx=30+Math.floor((px-30)/4)*4, gz=-92+Math.floor((pz+92)/4)*4;
        const u=(px-gx)/4,v=(pz-gz)/4;
        const a=mountainHeight(gx,gz),b=mountainHeight(gx,gz+4);
        const c=mountainHeight(gx+4,gz+4),q=mountainHeight(gx+4,gz);
        const terrain=(u>v?a*(1-u)+q*(u-v)+c*v:a*(1-v)+b*(v-u)+c*u)-.185;
        const roadHeight=mountainHeight(px,pz)+(mountainIsGravel(mountainRoads[i],d)?-.013:ROAD_Y);
        worstOverlap=Math.max(worstOverlap,terrain-roadHeight);
      }
    }
    const lap=rideTest(e,true,220);
    const gravelRide=rideWithBuild(e,true,220,buildBike('traction','short','control','stock','endurance'));
    const roadRide=rideWithBuild(e,true,220,buildBike('race','long','power','aero','burst'));
    const stored=makeGhostFile(e,{...e.benchmark,vehicle:'bike'},{name:'Bench',paint:'classic'});
    const restored=loadFriendGhost(readGhostFile(JSON.stringify(stored)));
    return {length:path.length,distance:e.length,profile:profile.map(p=>p[0]),low,high,loose,
      gain:e.elevation.gain,loss:e.elevation.loss,blocked:blocked.slice(0,12),trees:trees.slice(0,12),
      benchmark:e.benchmark.time,ghost:restored.event.id,lap,worstOverlap,
      tuning:[gravelRide,roadRide].map(({phase,elapsed})=>({phase,elapsed}))};
  });
  return report;
})())`);
const courses=JSON.parse(result);
for(const course of courses) {
  console.log(JSON.stringify(course));
  assert.deepEqual(course.blocked,[]);
  assert.deepEqual(course.trees,[]);
  assert.equal(course.lap.phase,'done');
  assert.equal(course.lap.passed,7);
  assert.ok(course.loose>=90&&course.loose<=170);
  assert.ok(course.profile.every((d,i)=>i===0||d>course.profile[i-1]));
  assert.ok(course.ghost===course.lap.id);
  assert.ok(course.worstOverlap<=0,'Terrain rises into the road');
  assert.ok(course.tuning.every(lap=>lap.phase==='done'));
  assert.ok(course.tuning[0].elapsed<course.tuning[1].elapsed);
}
assert.ok(courses[0].gain>33&&courses[0].loss<.15&&courses[0].high<.14);
assert.ok(courses[1].loss>33&&courses[1].gain<.15&&courses[1].low>-.16);

const powered=JSON.parse(run(`JSON.stringify((()=>{
  const frame=courseFrame(mountainUp,167);
  const [x,,z]=frame.p;
  const input={brake:true,gas:false,left:false,right:false,sprint:false};
  function braking(vehicle,tuned,weather) {
    activeWeatherId=weather;
    const r=makeCyclist(mountainCourses[0],stockBike,vehicle,tuned);
    Object.assign(r,{position:[x,parkHeight(x,z)+ROAD_Y,z],heading:Math.atan2(frame.f[2],frame.f[0]),speed:4,paved:false,brake:1});
    moveCyclist(r,input,PHYSICS_STEP);
    return {surface:r.surfaceKind,decel:4-r.speed};
  }
  return [['trail',{tyres:'mud',suspension:'soft'},{tyres:'road'}],
    ['ebike',{tyres:'grip'},{tyres:'slick'}],['chair',{wheels:'outdoor'},{wheels:'indoor'}]].map(([vehicle,offroad,road])=>{
    const stock=buildVehicleTuning(vehicle), loose=buildVehicleTuning(vehicle,offroad), slick=buildVehicleTuning(vehicle,road);
    return {vehicle,between:stock.gravelSpeed>stock.grassSpeed&&stock.gravelSpeed<stock.roadSpeed,
      grip:loose.gravelGrip>stock.gravelGrip&&stock.gravelGrip>slick.gravelGrip,
      dry:braking(vehicle,stock,'day'),wet:braking(vehicle,stock,'rain'),force:stock.gravelForce,brake:stock.gravelBrake};
  });
})())`));
assert.equal(new Set(powered.map(entry=>entry.force)).size,3);
assert.equal(new Set(powered.map(entry=>entry.brake)).size,3);
for(const entry of powered) {
  assert.ok(entry.between&&entry.grip,JSON.stringify(entry));
  assert.equal(entry.dry.surface,'gravel');
  assert.equal(entry.wet.surface,'gravel');
  assert.ok(entry.dry.decel>entry.wet.decel&&entry.wet.decel>0,JSON.stringify(entry));
}
