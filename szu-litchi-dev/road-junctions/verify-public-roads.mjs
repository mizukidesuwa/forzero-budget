import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const model=readFileSync(new URL('./game.js',import.meta.url),'utf8').split('const mapCache = new WeakMap();')[0];
const canvas={getContext:()=>new Proxy({}, {get:(_,k)=>k==='measureText'?t=>({width:t.length*12}):()=>{}})};
const env=vm.createContext({console,document:{createElement:()=>canvas}});
vm.runInContext(model,env);
const result=vm.runInContext(`(() => {
  campusUrbanWorld();
  const event=selectedCourses.get('endurance');
  const gas={gas:true,brake:false,right:false,left:false,sprint:false};
  function witness(test,positions) {
    let warned=0, collided=0, hit=false;
    const gate=event.gates[test.nextGate];
    for(let i=1;i<positions.length;i++) {
      const p=positions[i], prev=positions[i-1];
      if(!safeToRide(p[0],p[2],true)||!surfaceAt(p[0],p[2],true)) collided++;
      test.rider.position=p;
      test.rider.heading=Math.atan2(p[2]-prev[2],p[0]-prev[0]);
      test.markCourse();
      const covered=Math.max(event.markers[test.routeMark-1]?.distance??0,test.publicProgress??0);
      if(test.offRoute) warned++;
      if(covered>=gate.distance-event.markerStep-.015&&crossesGate(gate,prev,p)!==null) hit=true;
    }
    return {warned,collided,hit};
  }
  const atCheckpoint=(nextGate,distance)=>{
    const race=new TimeTrial(event);
    race.start();
    race.phase='race';
    race.routeMark=Math.floor(distance/event.markerStep)+1;
    race.nextGate=nextGate;
    return race;
  };
  const outside=event.gates.filter(g=>!inCampus(g.p[0],g.p[2])&&g.half>=12);
  const width=outside.flatMap(gate=>[gate.minCross+.65,gate.maxCross-.65].map(offset=>{
    const from=gate.distance-23, trace=[];
    for(let d=from;d<=gate.distance+4;d+=.31) trace.push(offsetVertex(courseFrame(event.path,d),offset,ROAD_Y));
    return {name:gate.name,offset, ...witness(atCheckpoint(gate.index,from),trace)};
  }));
  const turn=event.corners.find(c=>c.entry.distance>1160&&c.entry.distance<1270);
  const fastCuts=new Set(event.cuts.flat());
  const nearCrossing=[...fastCuts].filter(cut=>cut.from>1190&&cut.to<1290);
  const corner=nearCrossing.map(cut=>{
    const d=cut.from-7, trace=[];
    for(let i=d;i<cut.from;i+=.31) trace.push(along(event.path,i));
    for(let i=0;i<cut.path.length;i+=.31) trace.push(along(cut.path,i));
    for(let i=cut.to;i<cut.to+10;i+=.31) trace.push(along(event.path,i));
    return witness(atCheckpoint(event.gates.findIndex(g=>g.distance>d),d),trace);
  });
  const stray=atCheckpoint(6,1222);
  stray.rider.position=along(openStreets[1].path,pointDistance(openStreets[1].path,[-178,-242]));
  stray.rider.heading=Math.PI;
  stray.markCourse();
  const ride=(path,from,to)=>{
    const r=makeCyclist(event), dir=Math.sign(to-from), start=courseFrame(path,from);
    r.position=start.p.slice();
    r.heading=Math.atan2(dir*start.f[2],dir*start.f[0]); r.speed=7.2;
    let p0=from, highest=0, speed=0, safe=0;
    for(let tick=0;tick<6500;tick++) {
      const p=r.position;
      let gap=Infinity;
      let nearest=p0;
      for(let d=Math.max(0,p0-1.4);d<=Math.min(path.length,p0+1.4);d+=.18) {
        const q=along(path,d), g=(p[0]-q[0])**2+(p[2]-q[2])**2;
        if(g<gap) {gap=g;nearest=d;}
      }
      p0=nearest;
      if(dir*(p0-to)>=-.43) break;
      const toward=along(path,p0+dir*3.75);
      const a=Math.atan2(toward[2]-p[2],toward[0]-p[0])-r.heading-r.yawRate*.082;
      const error=Math.atan2(Math.sin(a),Math.cos(a));
      moveCyclist(r,{...gas,gas:r.speed<9.6,brake:r.speed>10.3,right:error>.021,left:error<-.021},PHYSICS_STEP,true);
      highest=Math.max(highest,r.position[1]);
      speed=Math.max(speed,r.speed);
      if(r.paved) safe++;
    }
    return {highest,endY:r.position[1],goal:p0,difference:Math.abs(p0-to),speed,safe};
  };
  const low=openStreets[0].path, crossing=pointDistance(low,[-132,-240]);
  const upper=ride(flyover.path,flyover.from-7,flyover.to+7);
  const reverse=ride(flyover.path,flyover.to+7,flyover.from-7);
  const ground=ride(low,crossing-32,crossing+32);
  const aprons=cityJunctions.filter(({asphalt,roads})=>{
    const [_,...edge]=asphalt.points;
    const [x,z]=edge[4];
    return roads.every(info=>safeToRide(x,z,true)&&surfaceAt(x,z,true));
  }).length;
  return {width,corner,refTurn:turn?.entry.distance,wrongTurnRejected:stray.offRoute,upper,reverse,ground,
    aprons,expectedAprons:cityJunctions.length};
})()`,env);
console.log(JSON.stringify(result));
assert.equal(result.width.length,8);
assert.ok(result.width.every(result=>result.hit&&!result.collided&&!result.warned));
assert.ok(result.corner.some(result=>!result.collided&&!result.warned));
assert.ok(result.wrongTurnRejected);
for(const bridge of [result.upper,result.reverse]) {
  assert.ok(bridge.highest>6.7&&bridge.difference<.55&&bridge.endY<.12);
}
assert.ok(result.ground.highest<.12&&result.ground.difference<.55);
assert.equal(result.aprons,result.expectedAprons);
