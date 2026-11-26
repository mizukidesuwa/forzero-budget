import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

import {resolve} from 'node:path';

const read=name=>readFileSync(name==='game.js'||name==='./game.js'?
  (process.env.FORZERO_GAME_JS?resolve(process.env.FORZERO_GAME_JS):new URL(name,import.meta.url)):new URL(name,import.meta.url),'utf8');
const splitGame=src=>src.split(/const mapCache\s*=\s*(?:\/\*[\s\S]*?\*\/\s*)?new WeakMap\(\);/)[0];
const canvas={getContext:()=>new Proxy({}, {get:(_,key)=>key==='measureText'?s=>({width:s.length*10}):()=>{}})};
const records=new Map();
const context=vm.createContext({console,document:{createElement:()=>canvas},localStorage:{
  getItem:key=>records.get(key)??null,setItem:(key,value)=>records.set(key,value)
}});
const run=js=>vm.runInContext(js,context);
run(splitGame(read('game.js')));
run(read('../rounds/drive-path.js')
  .replace('function rideTest(event,sprint,seconds=175)', 'function rideCut(event,sprint,seconds,route,pending)')
  .replace('new TimeTrial(event)', 'new TimeTrial(route,buildBike("traction","short"))')
  .replace('  let index=0,', '  let detached=false, merged=false;\n  let index=0,')
  .replace('    passed=trial.nextGate;', [
    '    passed=trial.nextGate;',
    '    if(trial.phase==="race" && passed===pending) {',
    '      if(!trial.onGuide) detached=true;',
    '      else if(detached) merged=true;',
    '    }'
  ].join('\n'))
  .replace('return {id:', 'return {detached,merged,splits:trial.splits,timed:trial.elapsed,usedRecovery:trial.lastRejoin!==-Infinity,id:'));

const cuts={
  szu:[
    ['libraries',2,59.55124,125.55124],
    ['teaching',2,85.36498,135.36498]
  ],
  ucl:[
    ['quad-sprint',2,171.19971,237.19971],
    ['bloomsbury-endurance',2,151.53075,269.53075]
  ]
};
for(const [campus,tests] of Object.entries(cuts)){
  run("activeCampus='"+campus+"';buildRidingScene(activeCampus);");
  for(const [id,gate,from,to] of tests){
    records.clear();
    const result=run([
      '(()=>{',
      'const event=coursesByCampus[activeCampus].find(course=>course.id==='+JSON.stringify(id)+');',
      'const xy=d=>{const [x,,z]=along(event.path,d);return [x,z];};',
      'const shortcut=street([xy('+from+'),xy('+to+')]);',
      'const path=joinTrack([{path:event.path,start:0,end:'+from+'},section(shortcut),',
      '  {path:event.path,start:'+to+',end:event.length}]);',
      'const pilot={...event,path,length:path.length,plan:coursePlan(path,path.length)};',
      'const trial=rideCut(pilot,true,520,event,'+gate+'), saved=new TimeTrial(event).bestRun;',
      'return {...trial, count:event.gates.length,saved:saved?.time===trial.timed};',
      '})()'
    ].join('\n'));
    assert.equal(result.phase,'done',JSON.stringify(result));
    assert.equal(result.splits.length,result.count);
    assert.ok(result.splits.every((time,i)=>Number.isFinite(time)&&(i===0||time>result.splits[i-1])));
    assert.ok(result.detached&&result.merged&&!result.usedRecovery&&result.saved,JSON.stringify(result));
    console.log(campus,id,result.elapsed+' ms',result.splits.length+' timing lines');
  }
}

records.clear();
const timing=run(`(()=>{
  activeCampus='szu';buildRidingScene(activeCampus);
  const event=courses.find(course=>course.id==='endurance'),trial=new TimeTrial(event);
  const {gates}=event,finish=gates.at(-1);
  const neutral={gas:false,brake:false,left:false,right:false,sprint:false};
  trial.start();
  trial.advance(3,neutral);
  function line(gate,direction=1,rise=gate.rise) {
    const at=courseGround(event,gate.p,rise);
    return [add(at,scale(gate.f,-.07*direction)),add(at,scale(gate.f,.07*direction))];
  }
  function cross(gate,direction) {
    const [before,after]=line(gate,direction);
    trial.rider.position=after;
    trial.elapsed+=5000;
    trial.recordCheckpoint(before);
  }
  cross(finish);
  const startStillRequired=trial.nextGate===0;
  cross(gates[0]);
  cross(gates[2]);
  cross(finish);
  cross(gates[1],-1);
  const pendingAfterSkip=trial.nextGate, continued=trial.phase==='race';
  // Crossing the correct line is sufficient even when recent navigation progress is stale.
  cross(gates[1]);
  const recognizedFromDetour=trial.nextGate===2;
  for(const gate of gates.slice(2)) cross(gate);
  const finishedWithAll=trial.phase==='done'&&trial.splits.length===gates.length;
  const bridge=gates.find(gate=>gate.name==='深南立交桥面');
  const onBridge=crossesRaceLine(bridge,...line(bridge),true)!==null;
  const belowBridge=crossesRaceLine(bridge,...line(bridge,1,0),true)!==null;
  return {startStillRequired,pendingAfterSkip,continued,recognizedFromDetour,finishedWithAll,onBridge,belowBridge};
})()`);
assert.deepEqual({...timing},{startStillRequired:true,pendingAfterSkip:1,continued:true,
  recognizedFromDetour:true,finishedWithAll:true,onBridge:true,belowBridge:false});

records.clear();
const older=run(`(()=>{
  const event=courses[0], key=recordKey(event,'bike');
  const record=event.benchmark;
  localStorage.setItem(key,JSON.stringify(record));
  const complete=loadBest(event)?.time===record.time;
  const missing=record.splits.slice();missing[2]=null;
  localStorage.setItem(key,JSON.stringify({...record,splits:missing}));
  return {complete,missingRejected:loadBest(event)===null};
})()`);
assert.deepEqual({...older},{complete:true,missingRejected:true});

const outside=run(`(()=>{
  const trial=new TimeTrial(courses.find(course=>course.id==='libraries'));
  const input={gas:true,brake:false,left:false,right:false,sprint:false};
  trial.start();
  trial.advance(3,input);
  const {path}=cityLinks.find(link=>link.name==='立志门');
  const edge=path.rows.findIndex(({p:[x,,z]},i)=>i>0&&inCampus(path.rows[i-1].p[0],path.rows[i-1].p[2])
    &&!inCampus(x,z)&&safeToRide(x,z,true));
  const frame=courseFrame(path,path.rows[edge-1].distance);
  Object.assign(trial.rider,{position:frame.p,heading:Math.atan2(frame.f[2],frame.f[0]),speed:5});
  trial.advance(.52,input);
  const [x,,z]=trial.rider.position, before=trial.elapsed;
  const road=cityStreetAt(x,z);
  const choice=trial.lastRejoin===-Infinity&&trial.rejoin();
  return {road:Boolean(road)&&!inCampus(x,z),cityCourse:trial.event.cityAccess,choice,
    cost:trial.elapsed-before,phase:trial.phase,pending:trial.nextGate};
})()`);
assert.deepEqual({...outside},{road:true,cityCourse:false,choice:true,cost:2000,phase:'race',pending:0});
