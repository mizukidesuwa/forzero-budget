import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

import {resolve} from 'node:path';

const read=name=>readFileSync(name==='game.js'||name==='./game.js'?
  (process.env.FORZERO_GAME_JS?resolve(process.env.FORZERO_GAME_JS):new URL(name,import.meta.url)):new URL(name,import.meta.url),'utf8');
const splitGame=src=>src.split(/const mapCache\s*=\s*(?:\/\*[\s\S]*?\*\/\s*)?new WeakMap\(\);/)[0];
const canvas={getContext:()=>new Proxy({},{get:(_,k)=>k==='measureText'?s=>({width:s.length*10}):()=>{}})};
const ctx=vm.createContext({console,document:{createElement:()=>canvas}});
const run=code=>vm.runInContext(code,ctx);
run(splitGame(read('game.js')));
const drive=read('../rounds/drive-path.js')
  .replace('seconds=175','seconds=175,vehicle="bike"')
  .replace('new TimeTrial(event)','new TimeTrial(event,stockBike,vehicle)');
run(drive);

for(const [local,expected] of [
  ['2026-11-22T23:59:59','20261116'],['2026-11-23T00:00:00','20261123'],
  ['2027-01-01T09:00:00','20261228'],['2024-02-29T12:00:00','20240226'],
  ['2026-03-29T13:00:00','20260323'],['2026-10-25T13:00:00','20261019']
]) assert.equal(run(`weeklySeed('ucl',new Date('${local}'))`),'U2-W'+expected);

for(const region of ['szu','ucl']) {
  run(`activeCampus='${region}';buildRidingScene(activeCampus)`);
  run(`var publicCode=weeklySeed(activeCampus,new Date(2026,10,22));
    var weeklyEvent=makeSeedCourse(publicCode,activeCampus);
    var copiedEvent=makeSeedCourse(readSeedCode(publicCode.toLowerCase(),activeCampus),activeCampus);`);
  assert.ok(run('JSON.stringify(weeklyEvent.path)===JSON.stringify(copiedEvent.path)'));
  assert.ok(run(`Array.from({length:8},(_,i)=>weeklySeed(activeCampus,new Date(2026,10,22+i*7)))
    .every(code=>makeSeedCourse(code,activeCampus)?.seed===code)`));
  for(const result of run(`[...coursesByCampus[activeCampus],weeklyEvent].flatMap(event=>
    ['bike','trail'].map(actor=>({actor,...rideTest(event,true,620,actor)})))`)) {
    assert.equal(result.phase,'done',JSON.stringify(result));
    console.log(region,result.id,result.actor,result.elapsed);
  }
}

run("activeCampus='szu';buildRidingScene('szu');");
const sections=run(`(()=>{
  const event=courses.find(e=>e.id==='endurance'),track=event.path;
  const gate=name=>event.gates.find(g=>g.name===name).distance;
  const straight=gate('深南立交桥面')-65,launch=gate('立交西侧折返')+19;
  const start=[-57.557211,ROAD_Y,26.751383],angle=2.7545483;
  const verge=travelTable([start,add(start,[35*Math.cos(angle),0,35*Math.sin(angle)])]);
  function drive(bike,path,from,meters,speed) {
    const f=courseFrame(path,from),r=makeCyclist(event,bike);
    r.position=courseGround(event,f.p);r.heading=Math.atan2(f.f[2],f.f[0]);r.speed=speed;
    r.paved=surfaceAt(r.position[0],r.position[2],true);
    let ticks=0,progress=0,grass=0;
    while(progress<meters-.04&&ticks<2400) {
      const target=along(path,Math.min(path.length,from+progress+3.8)),d=subtract(target,r.position);
      const err=Math.atan2(Math.sin(Math.atan2(d[2],d[0])-r.heading),Math.cos(Math.atan2(d[2],d[0])-r.heading));
      moveCyclist(r,{gas:true,sprint:false,brake:false,left:err<-.02,right:err>.02},1/120,true);
      const frame=courseFrame(path,from+progress);
      const delta=dot(subtract(r.position,frame.p),frame.f);
      progress+=Math.max(0,delta);if(!r.paved)grass+=Math.max(0,delta);
      ticks++;
    }
    return {ms:Math.round(ticks/120*1000),grass:Math.round(grass),finished:progress>=meters-.04};
  }
  const build=(tyres,gear)=>buildBike(tyres,gear,'stock');
  return {
    bridge:['long','short'].map(gear=>drive(build('stock',gear),track,straight,165,10)),
    exit:['long','short'].map(gear=>drive(build('stock',gear),track,launch,18,4)),
    mixed:['race','traction'].map(tyre=>drive(build(tyre,'stock'),verge,0,35,8.5))
  };
})()`);
assert.ok(Object.values(sections).flat().every(run=>run.finished));
assert.ok(sections.bridge[0].ms<sections.bridge[1].ms);
assert.ok(sections.exit[1].ms<sections.exit[0].ms);
assert.ok(sections.mixed.every(x=>x.grass>10&&x.grass<30));
assert.ok(sections.mixed[1].ms<sections.mixed[0].ms);
console.log(JSON.stringify(sections));
