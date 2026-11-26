import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {beginRoomRound} from '../online/room-rules.cjs';

const canvas={getContext:()=>new Proxy({}, {get:(_,key)=>key==='measureText'?text=>({width:text.length*10}):()=>{}})};
const context=vm.createContext({document:{createElement:()=>canvas}});
const game=readFileSync(process.env.FORZERO_GAME_JS?resolve(process.env.FORZERO_GAME_JS):new URL('game.js',import.meta.url),'utf8');
vm.runInContext(game.split(/const mapCache\s*=\s*(?:\/\*[\s\S]*?\*\/\s*)?new WeakMap\(\);/)[0],context);
const report=JSON.parse(vm.runInContext(`JSON.stringify((()=>{
  const out=[];
  for (const campus of ['szu','shunde','ucl']) {
    activeCampus=campus;buildRidingScene(campus);
    const event=coursesByCampus[campus][0],trial=new TimeTrial(event);
    const formation=(mode,seed)=>makeTrafficFormation(cityVehicles,mode,seed,event.spawn);
    const signature=actors=>JSON.stringify(actors.map(a=>[a.start,a.speed,a.offset,a.direction]));
    const sparse=formation('sparse',5), standard=formation('standard',5);
    const protectedStart=standard.every(a=>Array.from({length:21},(_,i)=>i*.25-3).every(t=>{
      const {point}=trafficPosition(a,t);
      return Math.hypot(point[0]-event.spawn[0],point[2]-event.spawn[2])>=28;
    }));
    const grouped=['a','b','c','d','e','f','g','h'].some(seed=>{
      const cars=formation('standard',seed);
      return cars.some((a,i)=>cars.slice(i+1).some(b=>a.path===b.path&&a.direction===b.direction&&
        [22,29].some(gap=>Math.abs(Math.abs(a.start-b.start)-gap)<.001)));
    });
    trial.start();
    const countClock=raceTrafficTime(trial);
    for(let i=0;i<COUNTDOWN_TICKS;i++) trial.step({});
    const goClock=raceTrafficTime(trial);
    trial.step({});
    const firstTick=raceTrafficTime(trial);
    trial.elapsed+=REJOIN_MS;
    const penaltyClock=raceTrafficTime(trial);
    out.push({campus,sparse:sparse.length,standard:standard.length,off:formation('off',5).length,
      same:signature(standard)===signature(formation('standard',5)),
      changes:new Set([5,6,7].map(seed=>signature(formation('standard',seed)))).size,
      protectedStart,grouped,countClock,goClock,firstTick,penaltyClock,
      weekly:trafficSeedFor({...event,seed:'S2-W20261123'},null),
      draftingOff:trafficDraftingAt(trial.rider,0,[])});
  }
  return out;
})())`,context));
for(const row of report) {
  console.log(row);
  assert.ok(row.same&&row.protectedStart);
  assert.equal(row.off,0);
  assert.equal(row.goClock,0);
  assert.equal(row.countClock,-3);
  assert.ok(Math.abs(row.firstTick-1/120)<1e-8);
  assert.equal(row.firstTick,row.penaltyClock);
  assert.equal(row.weekly,'S2-W20261123');
  assert.equal(row.draftingOff,false);
  if(row.campus==='ucl') assert.equal(row.standard,0);
  else {
    assert.ok(row.standard>row.sparse&&row.sparse>0);
    assert.equal(row.changes,3);
    assert.ok(row.grouped);
  }
}
const room={phase:'lobby',format:'bo3',history:[],players:new Map([['p',{id:'p',name:'P'}]])};
beginRoomRound(room,0);
const first=room.round;
assert.ok(Number.isInteger(first.trafficSeed));
room.history.push(first);
beginRoomRound(room,10000);
assert.ok(Number.isInteger(room.round.trafficSeed));
assert.equal(room.round.number,2);
