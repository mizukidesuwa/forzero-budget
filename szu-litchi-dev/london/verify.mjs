import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const canvas={getContext:()=>new Proxy({},{
  get:(_,key)=>key==='measureText'?text=>({width:text.length*12}):()=>{}
})};
const code=readFileSync(new URL('./game.js',import.meta.url),'utf8').split('const mapCache = new WeakMap();')[0];
const pilot=readFileSync(new URL('../rounds/drive-path.js',import.meta.url),'utf8');
const context=vm.createContext({document:{createElement:()=>canvas},console});
vm.runInContext(code+'\n'+pilot+"\nactiveCampus='ucl';buildRidingScene(activeCampus);",context);
const audit=snippet=>JSON.parse(vm.runInContext('JSON.stringify('+snippet+')',context));

const streets=audit(`(()=>{
  const lots=[uclLibrary,cruciform,hospital,senateHouse,ioe,studentCentreLot];
  const arrival=campuses.ucl.arrival;
  const [{center:[gardenX,gardenZ]}]=londonGardens;
  const [x,z]=londonPoint(51.52105,-.12874);
  return {
    buildings:lots.map(lot=>uclBuildingAt(lot.x,lot.z)?.name),
    gates:[safeToRide(arrival[0],arrival[2]),surfaceAt(arrival[0],arrival[2])],
    gardenIsGrass:!surfaceAt(gardenX-8,gardenZ-7),
    location:[Math.hypot(senateHouse.x-x,senateHouse.z-z),ioe.z<senateHouse.z,ioe.x>senateHouse.x],
    places:londonPlaces.map(({name,kind,x,z})=>({name,kind,reachable:!uclBuildingAt(x,z,0)&&
      Boolean(uclStreetAt(x,z,6))})),
    shelters:busStops.filter(stop=>stop.shelter).length,
    routes:londonCourses.map(event=>{
      const {id,length,gates,spawn,stages}=event, blocked=[];
      for(let d=0;d<=length;d+=.5) {
        const [x,,z]=along(event.path,d);
        if(!safeToRide(x,z)||!surfaceAt(x,z)) blocked.push(Math.round(d));
      }
      return {id,length,blocked,spawn:safeToRide(spawn[0],spawn[2]),
        ordered:gates.every((gate,i)=>!i||gate.distance>gates[i-1].distance+4),
        key:recordKey(event),gates:gates.length,
        stages:stages?.map(({startGate,finishGate,from,to})=>({startGate,finishGate,from,to}))};
    })
  };
})()`);
assert.deepEqual(streets.buildings,['Wilkins Building','Cruciform Building','University College Hospital',
  'Senate House','IOE · 20 Bedford Way','UCL Student Centre']);
assert.deepEqual(streets.gates,[true,true]);
assert.ok(streets.gardenIsGrass);
assert.ok(streets.location[0]<24&&streets.location[1]&&streets.location[2]);
assert.ok(streets.places.every(place=>place.reachable),JSON.stringify(streets.places));
assert.deepEqual(streets.places.filter(place=>place.kind==='tube').map(place=>place.name),
  ['Euston Square','Warren Street','Russell Square']);
assert.equal(streets.places.filter(place=>place.kind==='bus').length,6);
assert.equal(streets.shelters,2);
assert.equal(streets.places.filter(place=>place.kind==='shop').length,23);
assert.equal(streets.routes.length,7);
assert.equal(new Set(streets.routes.map(route=>route.key)).size,7);
for(const route of streets.routes) {
  assert.deepEqual(route.blocked,[],route.id);
  assert.ok(route.spawn&&route.ordered&&route.key.startsWith('london-bloomsbury-2:'),route.id);
  if(route.stages) {
    assert.equal(route.stages.at(-1).finishGate,route.gates-1,route.id);
    assert.equal(route.stages.at(-1).to,route.length,route.id);
    assert.ok(route.stages.every((stage,i)=>!i||stage.from===route.stages[i-1].to),route.id);
  }
}
const endurance=streets.routes.find(route=>route.id==='bloomsbury-endurance');
assert.equal(endurance.stages.length,3);

const runs=audit('londonCourses.flatMap(event=>[rideTest(event,false,305),rideTest(event,true,305)])');
for(const run of runs) {
  const route=streets.routes.find(candidate=>candidate.id===run.id);
  assert.equal(run.phase,'done',JSON.stringify(run));
  assert.equal(run.passed,route.gates,run.id);
  assert.ok(run.medal,run.id);
}
console.log(JSON.stringify({routes:streets.routes.map(({id,length,gates})=>({id,length:Math.round(length),gates})),
  runs:runs.map(({id,elapsed,medal})=>({id,elapsed,medal}))}));
