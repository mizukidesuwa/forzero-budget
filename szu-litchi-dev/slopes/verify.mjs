import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const canvas={getContext:()=>new Proxy({}, {get:()=>()=>{}})};
const context=vm.createContext({console,document:{createElement:()=>canvas}});
const source=readFileSync(new URL('./game.js',import.meta.url),'utf8').split('const mapCache = new WeakMap();')[0];
const pilot=readFileSync(new URL('../rounds/drive-path.js',import.meta.url),'utf8');
vm.runInContext(source+'\n'+pilot+'\nbuildRidingScene("szu");',context);
const model=snippet=>JSON.parse(vm.runInContext('JSON.stringify('+snippet+')',context));
const routes=model(`courses.map(event=>{
  const {id,path,elevation,gates}=event;
  const grades=[0,0],obstructions=[];
  let metersOnSlope=0;
  for(let distance=.5;distance<event.length;distance+=.5) {
    const {p,f}=courseFrame(path,distance), [x,,z]=p;
    const grade=hillGrade(x,z,f[0],f[2]);
    grades[0]=Math.min(grades[0],grade);grades[1]=Math.max(grades[1],grade);
    if(Math.abs(grade)>.05) metersOnSlope+=.5;
    const bridge=event.flyover&&deckRiseAt(p)>.4;
    if((!bridge&&!safeToRide(x,z,event.cityAccess))||!surfaceAt(x,z,event.cityAccess)) obstructions.push([distance,x,z]);
  }
  return {id,length:event.length,elevation:elevation&&{gain:elevation.gain,loss:elevation.loss},grades,
    metersOnSlope,gates:gates.map(g=>[g.name,g.distance]),obstructions:obstructions.slice(0,8)};
})`);
console.log(JSON.stringify({routes}));
for(const route of routes) {
  assert.deepEqual(route.obstructions,[],route.id);
  assert.ok(route.gates.every(([,distance],i)=>i===0||distance>route.gates[i-1][1]+4),route.id);
}
const runs=model(`courses.filter(event=>event.elevation).flatMap(event=>[rideTest(event,false),rideTest(event,true)])`);
console.log(JSON.stringify({runs}));
for(const run of runs) assert.equal(run.phase,'done',JSON.stringify(run));
for(const route of routes.filter(r=>r.elevation)) {
  assert.ok(route.length>225&&route.metersOnSlope>35);
  assert.ok(runs.filter(run=>run.id===route.id).every(run=>run.passed===route.gates.length));
}

const riding=model(`(()=>{
  const [climb,down]=hillCourses(),neutral={gas:false,brake:false,left:false,right:false,sprint:false};
  const peak=dujuanHill.height;
  let selected={grade:0};
  const section=climb.path;
  for(let d=5;d<section.length-10;d++){
    const frame=courseFrame(section,d),[x,,z]=frame.p;
    const grade=hillGrade(x,z,frame.f[0],frame.f[2]);
    if(grade>selected.grade&&grade<.19) selected={d,grade,...frame};
  }
  function coast(direction,vehicle='bike',brake=false) {
    const rider=makeCyclist(climb,stockBike,vehicle);
    rider.heading=Math.atan2(selected.f[2]*direction,selected.f[0]*direction);
    rider.position=onCampusGround(selected.p);rider.speed=vehicle==='bike'?5.5:vehicleChoices[vehicle].roadSpeed;
    const initial=rider.speed;
    for(let i=0;i<36;i++) moveCyclist(rider,{...neutral,brake},PHYSICS_STEP);
    return {speedChange:rider.speed-initial,height:rider.position[1]-rideElevation(rider.position[0],rider.position[2]),position:rider.position};
  }
  const uphill=coast(1),downhill=coast(-1),braking=coast(-1,'bike',true),motor=coast(-1,'ebike');
  const start=makeCyclist(down);
  const old=[0,start.position[0],ROAD_Y,start.position[2],start.heading,0,0,0];
  const ghost=replayAt({time:0,samples:[old]},0);
  const saved=packPose(0,start);
  const londonGrade=(()=>{
    activeCampus='ucl';
    try {return riderGrade(selected.p,start.heading);}
    finally {activeCampus='szu';}
  })();
  return {grade:selected.grade,uphill,downhill,braking,motor,start:start.position,ghost:ghost.position,
    saved,peak,londonGrade};
})()`);
console.log(JSON.stringify({riding}));
assert.ok(riding.grade>.10);
assert.ok(riding.uphill.speedChange<-.4);
assert.ok(riding.downhill.speedChange>.14);
assert.ok(riding.braking.speedChange<-.8);
assert.ok(riding.motor.speedChange<=1e-6);
assert.ok(Math.abs(riding.downhill.height-.043)<.002);
assert.ok(riding.start[1]>4.0);
assert.ok(Math.abs(riding.start[1]-riding.ghost[1])<.001);
assert.ok(Math.abs(riding.saved[2]-.041)<.001);
assert.equal(riding.londonGrade,0);

const design=model(`(()=>{
  const [climb,down]=hillCourses();
  const bounds=[climb.gates.find(g=>g.name==='坡脚入口').distance,climb.length];
  const hill={grade:0,minSpeed:Infinity,descentRise:down.elevation.gain};
  for(let d=bounds[0];d<bounds[1];d+=.5) {
    const {p:[x,,z],f}=courseFrame(climb.path,d);
    hill.grade=Math.max(hill.grade,hillGrade(x,z,f[0],f[2]));
    hill.minSpeed=Math.min(hill.minSpeed,maxSafeSpeed(climb.path,d));
  }
  const event=selectedCourses.get('endurance');
  const gate=event.gates.find(g=>g.name==='深南立交桥面');
  const crossing=onDeck=>{
    const p=onDeck?courseGround(event,gate.p,gate.rise):gate.p;
    return crossesGate(gate,add(p,scale(gate.f,-1)),add(p,gate.f))!==null;
  };
  const trial=new TimeTrial(event);
  trial.start();
  trial.phase='race';
  trial.nextGate=gate.index;
  trial.routeMark=Math.floor((gate.distance-10)/event.markerStep)+1;
  trial.rejoin();
  return {hill,deck:{rise:gate.rise,half:gate.half,stage:activeStage(event,gate.index).name,
    checkpoint:crossing(true),underpass:crossing(false),rejoin:trial.rider.position[1],
    ghost:replayAt(event.benchmark,event.benchmark.splits[gate.index]).position[1]}};
})()`);
console.log(JSON.stringify(design));
assert.ok(design.hill.grade>.10&&design.hill.grade<.17);
assert.ok(design.hill.minSpeed>10.25&&design.hill.descentRise<.1);
assert.ok(design.deck.rise>6&&design.deck.half<3.68&&design.deck.stage==='深南立交');
assert.ok(design.deck.checkpoint&&!design.deck.underpass);
assert.ok(design.deck.rejoin>6&&design.deck.ghost>6);
