import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

import {resolve} from 'node:path';

const read=name=>readFileSync(name==='game.js'||name==='./game.js'?
  (process.env.FORZERO_GAME_JS?resolve(process.env.FORZERO_GAME_JS):new URL(name,import.meta.url)):new URL(name,import.meta.url),'utf8');
const splitGame=src=>src.split(/const mapCache\s*=\s*(?:\/\*[\s\S]*?\*\/\s*)?new WeakMap\(\);/)[0];
const canvas={getContext:()=>new Proxy({},{get:(_,k)=>k==='measureText'?t=>({width:t.length*10}):()=>{}})};
const context=vm.createContext({console,document:{createElement:()=>canvas}});
const run=s=>vm.runInContext(s,context);
run(splitGame(read('game.js'))+read('../rounds/drive-path.js'));
const result=run(`(()=>{
  activeCampus='shunde';buildRidingScene(activeCampus);
  const blocked=[],waterErrors=[],terrainHits=[];
  for(let d=0;d<parkCourse.length;d+=.25) {
    const f=courseFrame(parkPath,d), w=parkWidth(f.p[0],f.p[2]);
    for(const offset of [-w+.50,0,w-.50]) {
      const [x,,z]=offsetVertex(f,offset,0);
      if(!safeToRide(x,z)) blocked.push([d,offset]);
      for(const [cx,cz,rx,rz,h] of parkHills) {
        if(((x-cx)/rx)**2+((z-cz)/rz)**2<1-(3/h)**2) terrainHits.push(d);
      }
    }
    if (d>155&&d<690) {
      const [x,,z]=offsetVertex(f,-w-3,0);
      if(safeToRide(x,z)) waterErrors.push(d);
    }
  }
  for(const t of [-25,-15,0,15,25]) for(const edge of [-3.35,3.35]) {
    const [x,,z]=bridgePoint(t,edge,0);
    if(safeToRide(x,z)) blocked.push(['rail',t,edge]);
  }
  const lap=rideTest(parkCourse,true,240);
  return {length:parkPath.length,distances:parkStops.map(([i])=>parkPath.rows[i*24].distance),
    blocked:blocked.slice(0,8),waterErrors:waterErrors.slice(0,8),terrainHits:terrainHits.slice(0,8),lap};
})()`);
console.log(JSON.stringify(result));
assert.equal(result.lap.phase,'done');
assert.equal(result.lap.passed,7);
assert.deepEqual(Array.from(result.blocked),[]);
assert.deepEqual(Array.from(result.waterErrors),[]);
assert.deepEqual(Array.from(result.terrainHits),[]);

const pavilion=JSON.parse(run(`JSON.stringify((()=>{
  const path=pavilionWalk;
  function cross(vehicle,direction) {
    const start=courseFrame(path,direction>0?0:path.length);
    const trial=new TimeTrial(parkCourse,stockBike,vehicle);
    const r=trial.rider;
    r.position=[start.p[0],parkHeight(start.p[0],start.p[2])+ROAD_Y,start.p[2]];
    r.heading=Math.atan2(direction*start.f[2],direction*start.f[0]);
    for(let i=0;i<3600;i++) {
      let distance=0,minGap=Infinity;
      for(const {p,distance:d} of path.rows) {
        const gap=(r.position[0]-p[0])**2+(r.position[2]-p[2])**2;
        if(gap<minGap){minGap=gap;distance=d;}
      }
      if(trial.freeHazardNotice) return {vehicle,direction,passed:false,hazard:trial.freeHazardNotice.text};
      const remaining=direction>0?path.length-distance:distance;
      if(remaining<.65) return {vehicle,direction,passed:true,height:r.position[1]};
      const p=along(path,clamp(distance+direction*1.8,0,path.length));
      const heading=Math.atan2(p[2]-r.position[2],p[0]-r.position[0])-r.heading-r.yawRate*.085;
      const delta=Math.atan2(Math.sin(heading),Math.cos(heading));
      trial.step({gas:r.speed<4.1,brake:r.speed>4.4,left:delta<-.025,right:delta>.025,sprint:false});
    }
    return {vehicle,direction,passed:false,position:r.position};
  }
  const crossing=[];
  for(const vehicle of ['bike','ebike','chair','trail']) {
    crossing.push(cross(vehicle,1),cross(vehicle,-1));
  }
  const middle=courseFrame(path,path.length/2);
  const safe=offsetVertex(middle,pavilionWalk.width-.18,0);
  const wet=offsetVertex(middle,pavilionWalk.width+.25,0);
  const trial=new TimeTrial(parkCourse);
  trial.rider.position=[safe[0],parkHeight(safe[0],safe[2])+ROAD_Y,safe[2]];
  trial.rider.heading=Math.atan2(middle.side[2],middle.side[0]);
  trial.rider.speed=4;
  for(let i=0;i<60&&!trial.freeHazardNotice;i++) trial.step({gas:true,brake:false,left:false,right:false,sprint:false});
  return {crossing,safe:safeToRide(safe[0],safe[2],true),wet:waterHazardAt(wet[0],wet[2]),
    returned:trial.freeHazardNotice?.text,shore:parkPaved(trial.rider.position[0],trial.rider.position[2])};
})())`));
assert.ok(pavilion.crossing.every(result=>result.passed),JSON.stringify(pavilion));
assert.ok(pavilion.crossing.every(({direction,height})=>Math.abs(height-(direction>0?1.72:.041))<.025));
assert.ok(pavilion.safe&&pavilion.wet&&pavilion.returned?.includes('落水')&&pavilion.shore,JSON.stringify(pavilion));
console.log('Pavilion walk:',pavilion.crossing.length,'successful traversals and a water return');

// Ray tests against the generated canopy triangles, with a moving forward-facing
// follow camera. Sample two levels of the tower to distinguish partial screening.
const sightings=run(`(()=>{
  const v=foliage.vertices, idx=foliage.indices, triangles=[];
  for(let i=0;i<idx.length;i+=3) {
    const [a,b,c]=[idx[i],idx[i+1],idx[i+2]].map(j=>v.slice(11*j,11*j+3));
    triangles.push({a,ab:subtract(b,a),ac:subtract(c,a),minX:Math.min(a[0],b[0],c[0]),maxX:Math.max(a[0],b[0],c[0]),
      minZ:Math.min(a[2],b[2],c[2]),maxZ:Math.max(a[2],b[2],c[2])});
  }
  function screened(eye,target) {
    const ray=subtract(target,eye);
    for(const t of triangles) {
      if(t.maxX<Math.min(eye[0],target[0])||t.minX>Math.max(eye[0],target[0])||
        t.maxZ<Math.min(eye[2],target[2])||t.minZ>Math.max(eye[2],target[2])) continue;
      const h=cross(ray,t.ac),det=dot(t.ab,h);if(Math.abs(det)<1e-8) continue;
      const edge=subtract(eye,t.a),u=dot(edge,h)/det;if(u<0||u>1) continue;
      const q=cross(edge,t.ab),w=dot(ray,q)/det;if(w<0||u+w>1) continue;
      const hit=dot(t.ac,q)/det;if(hit>0&&hit<1) return true;
    }
    return false;
  }
  const visible=[],partial=[],hidden=[];
  for(let d=0;d<parkPath.length;d+=4) {
    const {p,f,side}=courseFrame(parkPath,d),eye=add(add(p,scale(f,-8.25)),scale(side,1.24));eye[1]+=4.02+parkHeight(p[0],p[2]);
    const [x,z]=parkTower;
    if(dot(f,normalize([x-eye[0],0,z-eye[2]]))<.84||Math.hypot(x-eye[0],z-eye[2])>200) continue;
    const lower=screened(eye,[x,18,z]),upper=screened(eye,[x,34,z]);
    (lower&&upper?hidden:lower||upper?partial:visible).push(d);
  }
  return {visible,partial,hidden};
})()`);
console.log('Tower line of sight (game metres):',JSON.stringify(sightings));
assert.ok(sightings.visible.length&&sightings.hidden.length);

