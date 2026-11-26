import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const noop=()=>{};
const context2d=new Proxy({measureText:text=>({width:11*text.length})},{
  get:(object,key)=>object[key]??noop
});
const nodes=new Map(), frames=[];
const resources={Buffer:new Set(), VertexArray:new Set(), Texture:new Set()};
let deleted=0, now=0;
const gl=new Proxy({},{get(_,key){
  if(key==='getInternalformatParameter') return ()=>[4,2];
  if(key==='getParameter') return ()=>4096;
  if(key==='FRAMEBUFFER_COMPLETE') return 1;
  if(key==='checkFramebufferStatus') return ()=>1;
  if(key==='getShaderParameter'||key==='getProgramParameter') return ()=>true;
  if(key==='drawingBufferWidth') return nodes.get('world').width;
  if(key==='drawingBufferHeight') return nodes.get('world').height;
  if(key.toUpperCase()===key) return 34000;
  for(const [type,live] of Object.entries(resources)) {
    if(key==='create'+type) return ()=>{const handle={};live.add(handle);return handle;};
    if(key==='delete'+type) return handle=>{assert.ok(live.delete(handle),key);deleted++;};
  }
  return ()=>({});
}});
class Element {
  constructor(){
    this.clientWidth=1060;this.clientHeight=626;
    this.dataset={};this.events={};this.style={};this.attrs={};this.children=[];
    this.classList={toggle:noop,contains:()=>false,add:noop,remove:noop};
  }
  addEventListener(type,fn){this.events[type]=fn;}
  click(){this.events.click();}
  getContext(type){return type==='webgl2'?gl:context2d;}
  setAttribute(key,value){this.attrs[key]=value;}
  getAttribute(key){return this.attrs[key];}
  removeAttribute(key){delete this.attrs[key];}
  replaceChildren(...elements){this.children=elements;}
  appendChild(child){this.children.push(child);}
  append(...children){this.children.push(...children);}
  focus(){}
}
const element=id=>{
  if(!nodes.has(id)) nodes.set(id,new Element());
  return nodes.get(id);
};
const document=new Element(),window=new Element();
Object.assign(document,{getElementById:element,createElement:()=>new Element(),querySelectorAll:()=>[]});
const storage=new Map();
const env=vm.createContext({
  document,window,Element,devicePixelRatio:1,performance:{now:()=>now},
  matchMedia:()=>({matches:true,addEventListener:noop}),requestAnimationFrame:fn=>frames.push(fn),
  localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},
  console:{error(error){throw error;}}
});
const run=code=>vm.runInContext(code,env);
const stats=()=>Object.fromEntries(Object.entries(resources).map(([type,set])=>[type,set.size]));
const tick=(ms=104)=>{now+=ms;frames.shift()(now);};
const html=readFileSync(new URL('./szu-litchi-loop.html',import.meta.url),'utf8');
run(html.split('<script>\n')[1].split('</script>')[0]);
assert.equal(run('activeCampus'),'szu');
assert.equal(element('travel').textContent,'到深大站');
const shenzhen=stats();
const originalCuts=run('JSON.stringify(courses.map(event=>event.cuts.flat().length))');
const originalTrees=run('JSON.stringify(treeSites)');
run("race.setVehicle('trail'); driverProfile.paint='shared'; driverProfile.name='伦敦骑手'; race.setBike(buildBike('traction','short'))");
const state=run('JSON.stringify({name:driverProfile.name,paint:driverProfile.paint,bike:race.bike,vehicle:race.vehicle})');
element('travel').click();
assert.equal(element('travel').textContent,'前往 UCL');
assert.ok(run('safeToRide(race.rider.position[0],race.rider.position[2],true)&&race.rider.paved'));
element('travel').click();
assert.equal(run('activeCampus'),'szu');
assert.ok(element('travel').disabled);
tick();
assert.equal(run('activeCampus'),'ucl');
assert.equal(element('campusName').textContent,'UCL · Bloomsbury');
assert.equal(element('travel').textContent,'返回深大');
assert.ok(deleted>100);
const london=stats();
assert.ok(london.Buffer<shenzhen.Buffer);
assert.equal(run('JSON.stringify({name:driverProfile.name,paint:driverProfile.paint,bike:race.bike,vehicle:race.vehicle})'),state);
assert.ok(run('safeToRide(race.rider.position[0],race.rider.position[2],true)&&surfaceAt(race.rider.position[0],race.rider.position[2])'));
assert.equal(run('safeToRide(8,-7)'),false);
assert.equal(run('surfaceAt(95,27)'),false);
assert.equal(run('surfaceAt(95,42)'),true);
assert.equal(run('safeToRide(-62,-7)'),true);
assert.equal(run('safeToRide(-60,-19)'),false);
assert.ok(run("uclBuildings.length>=70"));
assert.equal(run("londonShops.some(shop=>shop.name==='lesgo')"),true);
assert.equal(run("londonShops.some(shop=>shop.name==='S&M Foodhall')"),true);
assert.match(run("buildingAt(-135,-88).name"),/University College Hospital/);
assert.equal(run("safeToRide(hospitalEntrance[0],hospitalEntrance[2])&&surfaceAt(hospitalEntrance[0],hospitalEntrance[2])"),true);
assert.ok(run(`uclHospitalRoute.slice(1).every((to,i)=>{
  const from=uclHospitalRoute[i], steps=Math.ceil(length(subtract(to,from)));
  for(let j=0;j<=steps;j++) {
    const [x,,z]=lerpPoint(from,to,j/steps);
    if(!safeToRide(x,z)||!surfaceAt(x,z)) return false;
  }
  return true;
})`));
element('startTrial').click();
assert.equal(run('race.phase'),'free');
element('mapToggle').click();
assert.equal(run('mapCache.get(ui.bigMap).campus'),'ucl');
assert.equal(element('mapZoom').textContent,'标出 UCLH 路线');
assert.equal(run("mapCache.get(ui.bigMap).hospitalRoute"),false);
element('mapZoom').click();
assert.equal(run("mapCache.get(ui.bigMap).hospitalRoute"),true);
assert.equal(run(`(()=>{
  const layout=mapCache.get(ui.bigMap), pos=[-122,0,-107];
  const roundTrip=layout.unproject(...layout.project(pos));
  return Math.hypot(roundTrip[0]-pos[0],roundTrip[1]-pos[2])<.001;
})()`),true);
element('mapToggle').click();

const roads=run(`JSON.stringify(uclWays.map(({name,path})=>{
  let samples=0,blocked=[];
  for(let d=1.5;d<path.length-1.5;d+=1) for(const offset of [-.75,0,.75]) {
    const [x,,z]=offsetVertex(courseFrame(path,d),offset*path.width,ROAD_Y);
    if(!surfaceAt(x,z)||!safeToRide(x,z)) blocked.push([Math.round(x),Math.round(z)]);
    samples++;
  }
  return {name,samples,blocked};
}))`);
for(const street of JSON.parse(roads)) assert.deepEqual(street.blocked,[],JSON.stringify(street));
const startingX=run('race.rider.position[0]');
window.events.keydown({code:'KeyW',timeStamp:now,preventDefault:noop});
for(let i=0;i<17;i++) tick(90);
window.events.keyup({code:'KeyW',timeStamp:now});
assert.ok(run('race.rider.position[0]')>startingX+5);
element('travel').click();
tick();
assert.equal(run('activeCampus'),'szu');
assert.equal(element('travel').textContent,'前往 UCL');
assert.equal(run('JSON.stringify(treeSites)'),originalTrees);
assert.equal(run('JSON.stringify(courses.map(event=>event.cuts.flat().length))'),originalCuts);
assert.equal(run('JSON.stringify({name:driverProfile.name,paint:driverProfile.paint,bike:race.bike,vehicle:race.vehicle})'),state);
const shenzhenWithRider=stats();
element('travel').click();tick();
assert.deepEqual(stats(),london);
element('travel').click();tick();
assert.deepEqual(stats(),shenzhenWithRider);
element('startTrial').click();
assert.equal(run('race.phase'),'count');
assert.ok(element('travel').hidden);
element('travel').click();
assert.equal(run('pendingCampus'),null);
console.log(JSON.stringify({london,shenzhen,deleted,roadSamples:JSON.parse(roads).reduce((n,s)=>n+s.samples,0)}));
