import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

import {resolve} from 'node:path';

const read=name=>readFileSync(name==='game.js'||name==='./game.js'?
  (process.env.FORZERO_GAME_JS?resolve(process.env.FORZERO_GAME_JS):new URL(name,import.meta.url)):new URL(name,import.meta.url),'utf8');
const splitGame=src=>src.split(/const mapCache\s*=\s*(?:\/\*[\s\S]*?\*\/\s*)?new WeakMap\(\);/)[0];
const canvas={getContext:()=>new Proxy({},{get:(_,key)=>key==='measureText'?text=>({width:text.length*10}):()=>{}})};
const map=new Map();
const context=vm.createContext({document:{createElement:()=>canvas},performance,preferences:{soloBudget:'open'},
  localStorage:{getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)}});
const run=source=>vm.runInContext(source,context);
run(splitGame(read('game.js'))+'\n'+read('practice-review.js'));
const check=source=>JSON.parse(run(`JSON.stringify((()=>{${source}})())`));

const vehicles=check(`
  activeCampus='shunde';buildRidingScene(activeCampus);
  const gas={gas:true,brake:false,sprint:false,left:false,right:false};
  const pose=(kind,speed)=>Object.assign(makeCyclist(parkCourse,stockBike,kind),{position:[12,ROAD_Y,0],heading:0,speed});
  const dt=PHYSICS_STEP;
  const trail=pose('trail',8), plain=pose('trail',8);
  for(let i=0;i<52;i++) {
    moveCyclist(trail,{...gas,right:true,sprint:true},dt);
    moveCyclist(plain,{...gas,right:true},dt);
  }
  const drift={state:trail.skill,slip:trail.slip,turn:trail.heading,plain:plain.heading};
  moveCyclist(trail,gas,dt);
  const exit={state:trail.skill,time:trail.exitBoost};

  const electric=pose('ebike',5), coast=pose('ebike',5);
  electric.energy=coast.energy=.4;
  moveCyclist(electric,{...gas,gas:false},dt);
  moveCyclist(coast,gas,dt);
  const regen=electric.energy>coast.energy&&electric.speed<coast.speed&&electric.skill==='动能回收';
  const boost=pose('ebike',5), normal=pose('ebike',5);
  moveCyclist(boost,{...gas,sprint:true},dt);
  moveCyclist(normal,gas,dt);
  const overclock=boost.speed>normal.speed&&boost.skillLimit===1.18;
  boost.energy=.024;
  for(let i=0;i<4;i++) updateVehicleSkill(boost,{...gas,sprint:true},dt);
  const protection=boost.skill==='过热保护'&&boost.overheat>2.4&&boost.skillLimit<1;
  for(let i=0;i<305;i++) updateVehicleSkill(boost,{...gas,gas:false},dt);
  const cooled=boost.overheat===0&&boost.energy>.6;

  const chair=pose('chair',2), compare=pose('ebike',2), torque=pose('chair',2);
  for(let i=0;i<16;i++) {
    moveCyclist(chair,{...gas,right:true},dt);
    moveCyclist(compare,{...gas,right:true},dt);
    moveCyclist(torque,{...gas,sprint:true},dt);
  }
  const activeBike=pose('bike',8);
  moveCyclist(activeBike,{...gas,sprint:true},dt);
  return {drift,exit,regen,overclock,protection,cooled,chairYaw:chair.yawRate,electricYaw:compare.yawRate,
    torque:torque.speed>chair.speed&&torque.skill==='双电机爆发',bike:activeBike.sprinting,
    offroad:['trail','ebike','chair'].map(vehicle=>{const b=buildVehicleTuning(vehicle);return [b.gravelGrip,b.gravelRolling,b.grassGrip];}),
    fov:speedFov({...activeBike,speed:18},null,2)};
`);
assert.equal(vehicles.drift.state,'手刹甩尾');
assert.ok(vehicles.drift.turn>vehicles.drift.plain&&vehicles.drift.slip>0,JSON.stringify(vehicles.drift));
assert.equal(vehicles.exit.state,'出弯牵引');
assert.ok(vehicles.exit.time>1.1&&vehicles.exit.time<=1.2);
assert.ok(vehicles.regen&&vehicles.overclock&&vehicles.protection&&vehicles.cooled&&vehicles.torque&&vehicles.bike);
assert.ok(vehicles.chairYaw>vehicles.electricYaw*1.2);
assert.ok(vehicles.offroad.slice(1).every(row=>vehicles.offroad[0][0]>row[0]&&vehicles.offroad[0][1]<row[1]&&vehicles.offroad[0][2]>row[2]));
assert.ok(vehicles.fov>0&&vehicles.fov<=7*Math.PI/180);
console.log('Phase 1 — four vehicles, drift release, thermal recovery, differential yaw and FOV:',vehicles);

const env=check(`
  const base=makeCustomWind(10,0);
  const angle=gustWind(base,14,123,'gust');
  const same=JSON.stringify(angle)===JSON.stringify(gustWind(base,14,123,'gust'));
  const changing=angle.speed!==gustWind(base,18,123,'gust').speed;
  const steady=gustWind(base,18,123,'steady')===base;
  let sheltered=false;
  const audits=['szu','ucl','shunde'].map(campus=>{
    activeCampus=campus;buildRidingScene(campus);
    const sites=rainPuddleSites(campus), site=sites[0];
    const geometry=rainPuddleShape(campus);
    const checkGrip=weather=>{
      activeWeatherId=weather;
      const event=coursesByCampus[campus][0];
      const rider=makeCyclist(event,stockBike,'bike');
      Object.assign(rider,{position:[site.x,rideElevation(site.x,site.z)+ROAD_Y,site.z],heading:0,speed:6,steering:.45,paved:true});
      moveCyclist(rider,{gas:true,brake:false,left:false,right:true,sprint:false},PHYSICS_STEP,campus==='szu');
      return {puddle:rider.inPuddle,grip:Math.abs(rider.yawRate*rider.speed)/rider.gripLoad};
    };
    const dry=checkGrip('day'), wet=checkGrip('rain');
    if(campus==='ucl') {
      outer:for(const {p:[x,,z]} of londonCourses[0].path.rows) for(let d=0;d<8;d++) {
        const wind=makeCustomWind(10,d), rider={position:[x,ROAD_Y,z]};
        if(shelteredWind(wind,rider,2,campus).speed<3.52){sheltered=true;break outer;}
      }
    }
    const slow={vehicle:'chair',tuning:buildVehicleTuning('chair'),position:coursesByCampus[campus][0].spawn};
    CampusCourier.stop();
    const started=CampusCourier.start(campus,slow.position,slow);
    const allowance=CampusCourier.remaining,distance=CampusCourier.lastLegDist;
    const target=CampusCourier.target.p;
    slow.position=[target[0]+7.4,target[1],target[2]];
    CampusCourier.tick(.1,slow,campus,100);
    const delivered=CampusCourier.deliveries===1&&CampusCourier.remaining>=18;
    return {campus,sites:sites.length,triangles:geometry.indices.length/3,dry,wet,
      rideable:sites.every(({x,z})=>safeToRide(x,z,campus==='szu')&&surfaceAt(x,z,campus==='szu')),
      landmarks:courierLandmarks(campus).length,started,allowance,distance,delivered};
  });
  activeWeatherId='day';
  return {same,changing,steady,sheltered,audits};
`);
assert.ok(env.same&&env.changing&&env.steady&&env.sheltered,JSON.stringify(env));
assert.ok(env.audits.reduce((n,row)=>n+row.triangles,0)<250);
for(const row of env.audits) {
  assert.ok(row.sites>=8&&row.sites<=12&&row.rideable,JSON.stringify(row));
  assert.ok(!row.dry.puddle&&row.wet.puddle&&row.wet.grip<row.dry.grip*.69,JSON.stringify(row));
  assert.ok(row.landmarks>=8&&row.started&&row.delivered&&row.allowance>=Math.max(18,row.distance/6.5*1.45+10),JSON.stringify(row));
}
console.log('Phase 2 — 30 puddles, synchronized gusts, wind shelter and courier:',env);

const drive=read('../rounds/drive-path.js').replace('new TimeTrial(event);','new TimeTrial(event); trial.raceMode=testMode;')
  .replace('return {id:event.id','return {ai:aiRank(trial),rivals:trial.rivals.length,comparison:trial.lastRun?.comparison?.samples.length,id:event.id');
run(drive+'\nlet testMode;');
const ai=check(`
  activeCampus='ucl';buildRidingScene(activeCampus);
  const route=londonCourses.find(event=>event.id==='quad-sprint');
  testMode='team';
  const team=rideTest(route,true,180);
  testMode='duel';
  const duel=rideTest(route,true,180);
  const trial=new TimeTrial(route);
  trial.raceMode='team';trial.start();
  const sample=trial.rivals[0].pose, direction=headingVector(sample.heading);
  const rider={...sample,position:add(sample.position,scale(direction,-5)),speed:8};
  return {team,duel,trailingDraft:draftingFrom(rider,[{...sample,speed:8}]),
    leadingDraft:draftingFrom({...sample,speed:8},[rider])};
`);
for(const [name,count] of [['team',3],['duel',1]]) {
  const result=ai[name];
  assert.equal(result.phase,'done',JSON.stringify(result));
  assert.equal(result.rivals,count);
  assert.equal(result.ai.total,count+1);
  assert.ok(result.ai.rank>=1&&result.ai.rank<=count+1&&result.comparison>2);
}
assert.ok(ai.trailingDraft&&!ai.leadingDraft);
console.log('Phase 3 — actual fixed-step finishes and rank:',ai.team.ai,ai.duel.ai);

const startSafety=check(`
  preferences.collision=true;
  const route=londonCourses.find(event=>event.id==='quad-sprint');
  const launches=[];
  const input={gas:true,left:false,right:false,brake:false,sprint:false};
  for(const mode of ['team','duel']) for(const vehicle of ['bike','trail','ebike','chair']) {
    const trial=new TimeTrial(route,stockBike,vehicle);
    trial.raceMode=mode;trial.start();
    const grid=trial.rivals[0];
    grid.clock=200;
    const noGridPull=Math.abs(rivalPose(route,grid).progress-(replayAt(grid.run,200).travel-5.2-grid.gridGap))<.001;
    grid.clock=0;
    trial.advance(3.45,input);
    const p=trial.rider.position, gate=route.gates[0], dx=p[0]-gate.p[0],dz=p[2]-gate.p[2];
    const playerProgress=dx*gate.f[0]+dz*gate.f[2];
    launches.push({mode,vehicle,noGridPull,playerAhead:trial.rivals.every(actor=>actor.progress<playerProgress),
      protected:trial.rider.rivalPoses.every(pose=>pose.startProtected),
      collided:Boolean(trial.rider.collidedAt)});
    trial.advance(3,input);
    if(trial.rider.rivalPoses.some(pose=>pose.startProtected)) throw Error('Launch protection did not expire');
  }
  function contact(offset,startProtected,rival) {
    const rider={vehicle:'chair',heading:0,speed:5,rivalPoses:[{
      vehicle:'trail',heading:0,position:[offset,0,0],rival,startProtected
    }]};
    const [x,z,hit]=resolveVehicleCollisions(rider,0,0,0,null,()=>true,[]);
    return {x,z,hit,speed:rider.speed};
  }
  const contacts={start:contact(.2,true,true),rear:contact(-.2,false,true),front:contact(.2,false,true),other:contact(-.2,false,false)};
  preferences.collision=false;
  return {launches,...contacts};
`);
assert.ok(startSafety.launches.every(row=>row.noGridPull&&row.playerAhead&&row.protected&&!row.collided),JSON.stringify(startSafety.launches));
assert.deepEqual(startSafety.start,{x:0,z:0,hit:false,speed:5});
assert.deepEqual(startSafety.rear,{x:0,z:0,hit:false,speed:5});
assert.ok(startSafety.front.hit&&startSafety.other.hit,JSON.stringify(startSafety));
console.log('AI launch — 8 starts, temporary protection, rear yielding and later front contact passed.');

const tuning=check(`
  const route=londonCourses[0], build=buildBike('race','long','power','aero','burst');
  preferences.soloBudget='400';
  const expensive=new TimeTrial(route,build);
  const rejected=expensive.start()===false&&expensive.phase==='free';
  const used=buildBike('usedSlick','stock','stock','usedFrame');
  const fair=new TimeTrial(route,used);
  fair.start();
  preferences.soloBudget='open';
  const illegal=new TimeTrial(route,buildBike('glue','stock','stock','gravity','rocket'));
  const before=localStorage.getItem(checkpointRecordKey(route,'bike'));
  const canUse=illegal.rider.bike.magicGrip&&illegal.rider.bike.magicGravity&&illegal.rider.bike.magicPower;
  illegal.start();
  const canStart=illegal.phase==='count'&&illegal.unranked;
  illegal.finishAt(55000);
  let exportBlocked=false;
  try { makeGhostFile(route,illegal.lastRun,{name:'QA',paint:'classic'}); }
  catch(error) { exportBlocked=error instanceof GhostFileError; }
  const after=localStorage.getItem(checkpointRecordKey(route,'bike'));
  return {rejected,used:tuning190.summarize('bike',used).total,validStarted:fair.phase==='count',
    canUse,canStart,unchanged:before===after,record:illegal.record,medal:trialMedal(illegal),exportBlocked};
`);
assert.deepEqual(tuning,{rejected:true,used:140,validStarted:true,canUse:true,canStart:true,unchanged:true,record:false,medal:'',exportBlocked:true});
console.log('Phase 4 — budget block and moderation isolation:',tuning);

const review=check(`
  const a={time:1000,samples:[[0,0,.04,0,0,4,0,0],[1000,10,.04,0,0,6,10,0]],splits:[0,1000]};
  const b={time:1200,samples:[[0,0,.04,0,0,3,0,0],[1200,12,.04,0,0,5,12,0]],splits:[0,1200]};
  const state={time:0,playing:true,speed:2};
  advanceMapReplay(state,.25,1200);
  const pose=replayAt(a,state.time),gap=replayGapAt(a,b,state.time);
  const mid=state.time;
  advanceMapReplay(state,1,1200);
  return {mid,position:pose.position[0],speed:pose.speed,gap,end:state.time,stopped:!state.playing};
`);
assert.deepEqual(review,{mid:500,position:5,speed:5,gap:-100,end:1200,stopped:true});
console.log('Phase 3 replay — interpolated position, speed, time gap and 2× playback:',review);
