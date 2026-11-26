import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const canvas={getContext:()=>new Proxy({},{get:(_,key)=>key==='measureText'?s=>({width:s.length*10}):()=>{}})};
function scene(path) {
  const env=vm.createContext({document:{createElement:()=>canvas}});
  const source=readFileSync(new URL(path,import.meta.url),'utf8');
  vm.runInContext(source.split('const mapCache = new WeakMap();')[0],env);
  vm.runInContext(readFileSync(new URL('../rounds/drive-path.js',import.meta.url),'utf8'),env);
  vm.runInContext("activeCampus='ucl';buildRidingScene(activeCampus)",env);
  return expr=>JSON.parse(vm.runInContext('JSON.stringify('+expr+')',env));
}

function budget(run) {
  return run(`(()=>{
    const path=londonRoads.get('court');
    let current=0,longest=0,covered=0;
    for(let z=255;z<=434;z++) {
      const frame=courseFrame(path,pointDistance(path,[-148,z]));
      let wall=false;
      for(let n=path.width+1;n<=34;n++) {
        const [x,,pz]=offsetVertex(frame,-n,0);
        if(uclBuildingAt(x,pz,0)) { wall=true;break; }
      }
      current=wall?0:current+1;
      longest=Math.max(longest,current);
      if(wall) covered++;
    }
    return {buildings:uclBuildings.length,triangles:worldShapes.reduce((sum,s)=>sum+s.indices.length/3,0),
      masonry:masonry.indices.length/3,longest,covered};
  })()`);
}
const before=budget(scene('../../szu-litchi-loop-1.6.0/game.js'));
const run=scene('./release/game.js'),after=budget(run);
assert.ok(after.covered>before.covered+100,JSON.stringify({before,after}));
assert.ok(after.longest<30);
assert.ok(after.triangles<before.triangles*.9);

const report=run(`(()=>{
  const changes=[...londonFrontages,stPancras,cruciform,bmaHouse,royalNational,uclLots.find(l=>l.name==='Macmillan Cancer Centre')];
  const violations=[];
  let kerbChecks=0,gardenChecks=0,fixtureChecks=0;
  for(const lot of changes) {
    for(const part of lot.parts??[lot]) {
      for(const other of uclBuildings) {
        if(other!==lot&&(other.parts??[other]).some(b=>!fitsBetweenBuildings(part,b)))
          violations.push([lot.name,'overlap',other.name]);
      }
      for(const {name,outline} of londonGardens) {
        const inside=footprintCorners(part).some(([x,,z])=>inOutline(x,z,outline));
        if(inside) violations.push([lot.name,'garden',name]);
        for(let i=0;i<outline.length;i++) {
          const a=outline[i],b=outline[(i+1)%outline.length];
          const count=Math.ceil(Math.hypot(a[0]-b[0],a[1]-b[1])/.4);
          for(let j=0;j<=count;j++) {
            gardenChecks++;
            if(closeToBlock(mix(a[0],b[0],j/count),mix(a[1],b[1],j/count),part,.10))
              {violations.push([lot.name,'garden boundary',name]);break;}
          }
        }
      }
    }
  }
  const additions=new Set([...londonFrontages,stPancras]);
  for(const {id,path} of uclWays) {
    for(let d=0;d<=path.length;d+=.4) {
      const f=courseFrame(path,d);
      for(const side of [-1,1]) {
        const [x,,z]=offsetVertex(f,side*(path.width+1.2),0);
        kerbChecks++;
        const lot=uclBuildingAt(x,z,.28);
        if(additions.has(lot)) violations.push([id,'pavement',lot.name,x,z]);
      }
    }
  }
  for(const lot of uclFixtures) for(const offset of [-.01,.01]) {
    for(const [u,v] of [[lot.w/2+.28+offset,0],[0,lot.depth/2+.28+offset],[0,0]]) {
      const [x,,z]=lotPoint(lot,u,0,v);
      if(uclFixtureAt(x,z)!==uclFixtures.some(f=>closeToBlock(x,z,f,.28))) violations.push(['fixture index',x,z]);
      fixtureChecks++;
    }
  }
  const porch=lotPoint(stPancras,-22,0,0);
  const access=[canRideUcl(porch[0],porch[2]),uclBuildingAt(porch[0],porch[2],0,9)===stPancras,
    !canRideUcl(churchColumns[0].x,churchColumns[0].z),canRideUcl(381,136),canRideUcl(290,115)];
  return {kerbChecks,gardenChecks,fixtureChecks,access,violations:violations.slice(0,8)};
})()`);
assert.deepEqual(report.violations,[]);
assert.ok(report.access.every(Boolean),JSON.stringify(report));
console.log(JSON.stringify({before,after,...report}));
const finishes=run(`londonCourses.flatMap(event=>[false,true].map(sprint=>{
  const {phase,passed,elapsed}=rideTest(event,sprint,440);
  return {id:event.id,sprint,phase,passed,expected:event.gates.length,elapsed};
}))`);
for(const drive of finishes) {
  assert.equal(drive.phase,'done',JSON.stringify(drive));
  assert.equal(drive.passed,drive.expected);
}
console.log(JSON.stringify(finishes));
