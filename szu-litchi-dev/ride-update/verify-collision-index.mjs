import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';

const canvas={getContext:()=>new Proxy({},{get:(_,key)=>key==='measureText'?text=>({width:text.length*10}):()=>{}})};
const env=vm.createContext({document:{createElement:()=>canvas},performance});
const source=readFileSync(process.env.FORZERO_GAME_JS?resolve(process.env.FORZERO_GAME_JS):new URL('game.js',import.meta.url),'utf8');
vm.runInContext(source.split(/const mapCache\s*=\s*(?:\/\*[\s\S]*?\*\/\s*)?new WeakMap\(\);/)[0],env);

for (const region of ['szu','ucl','szu']) {
  const result=vm.runInContext(`(()=>{
    activeCampus='${region}';
    buildRidingScene(activeCampus);
    const index=ridingObstacles;
    const lots=activeCampus==='szu'?[...campus,...campusFixtures]:uclBuildings;
    const queries=[];
    for (const lot of lots) {
      for (const part of lot.parts??[lot]) {
        const c=part.yaw?part.c:1, s=part.yaw?part.s:0;
        for (const margin of [0,.30,.38,OBSTACLE_MARGIN,OBSTACLE_MARGIN+.5]) {
          for (const offset of [-.001,.001]) {
            const w=part.w/2+margin+offset, d=part.depth/2+margin+offset;
            for (const [u,v] of [[0,0],[-w,d],[w,-d],[w,0],[0,d]]) {
              const x=part.x+c*u+s*v, z=part.z-s*u+c*v;
              const height=part.height??3.9+part.floors*1.93;
              queries.push([x,z,margin,0],[x,z,margin,Math.max(0,height-.001)],[x,z,margin,height+.001]);
            }
          }
        }
      }
    }
    for (const {x,z} of treeSites) {
      for (const d of [-.311,-.309,-.281,-.279,0,.279,.281,.309,.311]) queries.push([x+d,z-d,.38,0]);
    }
    for (const event of coursesByCampus[activeCampus]) {
      for (const {p:[x,,z]} of event.path.rows) queries.push([x,z,.38,0]);
    }
    const lookup=guard=>queries.map(([x,z,margin,y])=>guard(x,z,margin,y));
    const probes=[
      buildingAt,
      (x,z)=>treeBlocks(x,z,.28),
      (x,z)=>treeBlocks(x,z,.31),
      (x,z)=>safeToRide(x,z,true)
    ];
    for (const probe of probes) {
      ridingObstacles=null;
      const expected=lookup(probe);
      ridingObstacles=index;
      for (let i=0;i<queries.length;i++) {
        if (probe(...queries[i])!==expected[i]) return {mismatch:queries[i]};
      }
    }
    return {queries:queries.length,checks:queries.length*probes.length};
  })()`,env);
  assert.ok(result.queries,JSON.stringify(result));
  console.log(region, result.checks, 'matching collision and rideability checks');
}
