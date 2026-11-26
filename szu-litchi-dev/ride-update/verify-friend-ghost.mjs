import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

import {resolve} from 'node:path';

const read=name=>readFileSync(name==='game.js'||name==='./game.js'?
  (process.env.FORZERO_GAME_JS?resolve(process.env.FORZERO_GAME_JS):new URL(name,import.meta.url)):new URL(name,import.meta.url),'utf8');
const splitGame=src=>src.split(/const mapCache\s*=\s*(?:\/\*[\s\S]*?\*\/\s*)?new WeakMap\(\);/)[0];
const canvas={getContext:()=>new Proxy({},{get:(_,key)=>key==='measureText'?s=>({width:s.length*10}):()=>{}})};
const saves=new Map();
const context=vm.createContext({console,document:{createElement:()=>canvas},localStorage:{
  getItem:key=>saves.get(key)??null,setItem:(key,value)=>saves.set(key,value)
}});
const run=code=>vm.runInContext(code,context);
run(splitGame(read('game.js')));
run(read('../rounds/drive-path.js')
  .replace('function rideTest(event,sprint,seconds=175)', 'function rideGhostTest(event,trial,delay)')
  .replace('  const trial=new TimeTrial(event);','  const sprint=true, seconds=300;')
  .replace('trial.advance(3.001,input);','trial.advance(3.001+delay,input);'));

for(const [campus,id,seed,vehicle] of [
  ['szu','dujuan-climb',null,'bike'],['szu',null,'S2-326','trail'],
  ['ucl','quad-sprint',null,'bike'],['ucl',null,'U2-W20261116','trail']
]){
  saves.clear();
  context.meta={campus,id,seed,vehicle};
  const result=run(`(()=>{
    const {campus,id,seed,vehicle}=meta;
    activeCampus=campus;buildRidingScene(campus);
    const event=seed?makeSeedCourse(seed,campus):coursesByCampus[campus].find(item=>item.id===id);
    const rider=new TimeTrial(event,stockBike,vehicle);
    rideGhostTest(event,rider,0);
    const best=rider.best;
    rideGhostTest(event,rider,5.7);
    const latest=rider.lastRun;
    const file=makeGhostFile(event,latest,{name:' 秋山 🦊 ',paint:'bay'});
    const raw=JSON.stringify(file);
    const recordWhenImported=localStorage.getItem(checkpointRecordKey(event,vehicle));
    seedCourses[campus]=null;
    const challenge=loadFriendGhost(readGhostFile(raw));
    const sameRoute=ghostCourseKey(challenge.event)===ghostCourseKey(event);
    const untouched=localStorage.getItem(checkpointRecordKey(event,vehicle))===recordWhenImported;
    const duel=new TimeTrial(event,stockBike,'chair');
    duel.select(challenge.event,challenge.opponent);
    rideGhostTest(duel.event,duel,0);
    const name=duel.reference.name, sameVehicle=duel.rider.vehicle===vehicle;
    const correctGap=duel.lastGap===duel.elapsed-latest.time;
    const fullRun=latest.splits.length===event.gates.length && latest.samples.at(-1)[0]>best;
    const copyAt=replayAt(challenge.opponent,latest.time*.75);
    const originalAt=replayAt(latest,latest.time*.75);
    const replayEqual=JSON.stringify(copyAt)===JSON.stringify(originalAt);
    const errors=[
      () => readGhostFile('{'),
      () => readGhostFile(JSON.stringify({...file,version:2})),
      () => readGhostFile(JSON.stringify({...file,course:{...file.course,campus:'other'}})),
      ...(seed?[() => readGhostFile(JSON.stringify({...file,course:{...file.course,id:'seed-'+seed.replace(/^([SU])2-/,'$11-'),seed:seed.replace(/^([SU])2-/,'$11-')}}))]:[]),
      () => readGhostFile(JSON.stringify({...file,run:{...file.run,samples:[[0,0,0,0,0,0,0,0]]}})),
      () => loadFriendGhost(readGhostFile(JSON.stringify({...file,course:{...file.course,layout:'00000000'}})))
    ].map(f=>{try{f();return false;}catch(error){return error instanceof GhostFileError;}});
    duel.select(event);
    return {
      best,exportTime:latest.time,sameRoute,untouched,name,sameVehicle,correctGap,fullRun,replayEqual,
      previousBestKept:rider.best===best&&!rider.record,ownVehicleRestored:duel.rider.vehicle==='chair',
      metadata:file.course.campus===campus&&file.course.seed===seed&&file.rider.vehicle===vehicle,
      errors:errors.every(Boolean)
    };
  })()`);
  assert.equal(result.name,'秋山 🦊');
  assert.ok(result.exportTime>result.best+5000);
  for(const property of ['sameRoute','untouched','sameVehicle','correctGap','fullRun','replayEqual',
    'previousBestKept','ownVehicleRestored','metadata','errors']) assert.equal(result[property],true,JSON.stringify(result));
  console.log(campus,seed??id,vehicle,Math.round(result.exportTime)+' ms',result.name);
}

const longer=run(`(()=>{
  activeCampus='szu';buildRidingScene(activeCampus);
  const event=courses[0],trial=new TimeTrial(event);
  trial.start();
  const interval=trial.replayInterval;
  for(let i=1;i<MAX_REPLAY_SAMPLES+5;i++) trial.saveReplayFrame(i*interval);
  const time=trial.frames.at(-1)[0]+3*interval;
  trial.splits=event.benchmark.splits.map(split=>split*time/event.benchmark.time);
  trial.splits[trial.splits.length-1]=time;
  trial.finishAt(time);
  const ghost=makeGhostFile(event,trial.lastRun,{name:'长程',paint:'classic'});
  const loaded=loadFriendGhost(readGhostFile(JSON.stringify(ghost)));
  return trial.replayInterval>interval&&trial.lastRun.samples.length<=MAX_REPLAY_SAMPLES&&
    loaded.opponent.time===time&&time>trial.recordRules.limit;
})()`);
assert.equal(longer,true);
