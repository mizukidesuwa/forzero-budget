import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

import {resolve} from 'node:path';

const read=name=>readFileSync(name==='game.js'||name==='./game.js'?
  (process.env.FORZERO_GAME_JS?resolve(process.env.FORZERO_GAME_JS):new URL(name,import.meta.url)):new URL(name,import.meta.url),'utf8');
const splitGame=src=>src.split(/const mapCache\s*=\s*(?:\/\*[\s\S]*?\*\/\s*)?new WeakMap\(\);/)[0];
const canvas={getContext:()=>new Proxy({},{get:(_,key)=>key==='measureText'?text=>({width:text.length*10}):()=>{}})};
const saves=new Map();
const store={getItem:key=>saves.get(key)??null,setItem:(key,value)=>saves.set(key,value)};
const context=vm.createContext({console,document:{createElement:()=>canvas},localStorage:store});
const run=source=>vm.runInContext(source,context);
const inspect=source=>JSON.parse(run(`JSON.stringify(${source})`));
run(splitGame(read('./game.js'))+'\n'+read('../rounds/drive-path.js'));

store.setItem('szu-litchi-bike-1',JSON.stringify({tyres:'traction',gears:'short'}));
assert.equal(run('savedBike().brakes'),'stock');

const handling=inspect(`(()=>{
  const oldGround={safeToRide,surfaceAt,riderGrade,rideElevation};
  safeToRide=()=>true;
  rideElevation=()=>0;
  const input={gas:true,brake:false,right:false,left:false,sprint:false};
  const fast=buildBike('race','long'),technical=buildBike('traction','short');
  function ride(bike,meters,paved,grade,vehicle='bike',entrySpeed=0) {
    surfaceAt=()=>paved;
    riderGrade=()=>grade;
    const rider=makeCyclist(courses[0],bike,vehicle);
    Object.assign(rider,{position:[0,ROAD_Y,0],heading:0,paved,speed:entrySpeed});
    let ticks=0;
    while(rider.travel<meters&&ticks<4800) {moveCyclist(rider,input,1/120);ticks++;}
    return {speed:rider.speed,time:ticks/120};
  }
  try {
    const former={...stockBike,grassSpeed:4.65,grassSlowdown:8.85,grassRolling:2.85};
    const speed=stockBike.roadSpeed;
    return {highway:[fast,stockBike,technical].map(bike=>ride(bike,180,true,0)),
      hill:[fast,stockBike,technical].map(bike=>ride(bike,18,true,.115)),
      grass:[fast,stockBike,technical].map(bike=>ride(bike,38,false,0)),
      grassEntry:[former,stockBike].map(bike=>ride(bike,6,false,0,'bike',speed)),
      motor:ride(stockBike,150,true,0,'trail').speed*3.6};
  } finally {
    ({safeToRide,surfaceAt,riderGrade,rideElevation}=oldGround);
  }
})()`);
assert.ok(handling.highway[0].time<handling.highway[1].time);
assert.ok(handling.hill[2].time<handling.hill[0].time);
assert.ok(handling.grass[2].time<handling.grass[0].time);
assert.ok(handling.grassEntry[1].speed>handling.grassEntry[0].speed+2);
assert.equal(handling.motor,63);

const seedResults=[];
for(const campus of ['szu','ucl']) {
  run(`activeCampus='${campus}';buildRidingScene(activeCampus);`);
  const results=inspect(`(()=>{
    const names=['326','RACE','607','FLOW','LONDON','2026','ROCK','42'];
    const samples=names.map(raw=>makeSeedCourse(readSeedCode(raw,activeCampus),activeCampus));
    const first=samples[0],again=makeSeedCourse(first.seed,activeCampus);
    const valid=samples.every(event=>event&&event.gates.every((gate,i)=>!i||gate.distance>event.gates[i-1].distance+4));
    const signature=event=>JSON.stringify([event.path.rows,event.gates.map(({distance,name})=>[distance,name])]);
    return {valid,repeat:signature(first)===signature(again),different:new Set(samples.map(signature)).size,
      recordKeys:['bike','trail'].map(actor=>recordKey(first,actor)),
      motorcycle:new TimeTrial(first,stockBike,'trail').entryVehicle,run:rideTest(first,true,230)};
  })()`);
  assert.ok(results.valid&&results.repeat&&results.different>=6,JSON.stringify(results));
  assert.notEqual(...results.recordKeys);
  assert.equal(results.motorcycle,'trail');
  assert.equal(results.run.phase,'done');
  seedResults.push({campus,length:Math.round(inspect("makeSeedCourse(readSeedCode('326',activeCampus),activeCampus).length")),
    elapsed:results.run.elapsed});
}

const gates=inspect(`londonCourses.map(event=>({id:event.id,count:event.gates.length,
  clear:event.gates.every(gate=>Array.from({length:13},(_,i)=>mix(gate.minCross,gate.maxCross,i/12)).every(offset=>
    [-.87,0,.87].every(step=>{
      const [x,,z]=add(offsetVertex(gate,offset,0),scale(gate.f,step));
      return canRideUcl(x,z)&&Boolean(uclStreetAt(x,z,.75));
    }))),cuts:event.londonLines.length}))`);
assert.ok(gates.every(course=>course.clear&&course.cuts>0),JSON.stringify(gates));
console.log(JSON.stringify({handling,seedResults,gates}));
