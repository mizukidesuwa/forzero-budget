import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function campusVersion(path) {
  const html=readFileSync(new URL(path,import.meta.url),'utf8');
  const source=html.split('<script>\n')[1].split('const mapCache = new WeakMap();')[0];
  const canvas={getContext:()=>new Proxy({}, {get:()=>()=>{}})};
  const ctx=vm.createContext({document:{createElement:()=>canvas}});
  vm.runInContext(source,ctx);
  const run=expr=>JSON.parse(vm.runInContext('JSON.stringify('+expr+')',ctx));
  const routes=run('courses.map(e=>[e.id,e.spawn,e.length,e.gates.map(g=>g.distance)])');
  vm.runInContext('campusUrbanWorld()',ctx);
  const triangles=run('[terrain,road,pavement,scenery,masonry,foliage,water,urban].reduce((n,s)=>n+s.indices.length/3,0)');
  return {routes,triangles,run};
}

const old=campusVersion('../garage/szu-litchi-loop.html'), current=campusVersion('./szu-litchi-loop.html');
assert.deepEqual(current.routes,old.routes);
const stats=current.run(`(()=>{
  const office=campus.find(b=>b.kind==='huiyuan'), dial=[centralSquare[0]-5.05,centralSquare[1]];
  const p=lotPoint(huizhi,-2.26,0,-12.30);
  const rims=cityLinks.filter(g=>g.name==='立德门').map(({path})=>{
    let tested=0;
    for(let d=.6;d<path.length-.6;d+=.30) for(const fraction of [-.64,0,.64]) {
      const at=offsetVertex(courseFrame(path,d),fraction*path.width,ROAD_Y);
      if(!safeToRide(at[0],at[2],true)||!surfaceAt(at[0],at[2],true)) throw Error('West gate obstructed at '+at);
      tested++;
    }
    return tested;
  });
  return {
    west:rims, dial:!!buildingAt(...dial), lawn:surfaceAt(dial[0]+3.10,dial[1]),
    canopy:safeToRide(p[0],p[2],true),
    office:buildingAt(office.x,office.z)===office,
    roundCorner:!!buildingAt(office.x-office.w/2+.62,office.z-office.depth/2+.62),
    valid:[masonry,scenery,foliage].every(m=>m.vertices.every(Number.isFinite)),
    cutLines:courses.map(e=>new Set(e.cuts.flat()).size)
  };
})()`);
assert.equal(stats.dial,true);
assert.equal(stats.lawn,false);
assert.equal(stats.canopy,true);
assert.equal(stats.office,true);
assert.equal(stats.roundCorner,false);
assert.equal(stats.valid,true);
assert.equal(stats.west.length,2);
assert.ok(stats.west.every(n=>n>40));

const recovery=current.run(`(()=>{
  const input={gas:false,brake:false,left:false,right:false,sprint:false};
  return [courseFrame(throughCenter,45).p,[-70,ROAD_Y,-198]].map(position=>
    ['endurance','libraries','free'].map(mode=>{
      const trial=new TimeTrial(selectedCourses.get(mode==='free'?'endurance':mode));
      if(mode==='free') trial.freeRide();
      else { trial.start(); trial.advance(3,input); }
      const [x,,z]=position;
      Object.assign(trial.rider,{position:position.slice(),energy:.2,paved:surfaceAt(x,z)});
      for(let i=0;i<120;i++) trial.step(input);
      return trial.rider.energy-.2;
    })
  );
})()`);
for(const [gains,expected] of [[recovery[0],.052],[recovery[1],.035]]) {
  for(const gain of gains) assert.ok(Math.abs(gain-expected)<1e-9,JSON.stringify(gains));
}
console.log(JSON.stringify({stats,recovery,oldTriangles:old.triangles,newTriangles:current.triangles}));
