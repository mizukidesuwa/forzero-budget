import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync,readFileSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { Readable,Writable } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { createAppShell,createRideServer } from '../online/server.mjs';

const matrix = readFileSync(process.env.FORZERO_GAME_JS?resolve(process.env.FORZERO_GAME_JS):new URL('./game.js',import.meta.url),'utf8').split(/const mapCache\s*=\s*(?:\/\*[\s\S]*?\*\/\s*)?new WeakMap\(\);/)[0];
const desktopEntry=process.env.FORZERO_RELEASE_DIR?join(process.env.FORZERO_RELEASE_DIR,'index.html'):'szu-litchi-dev/ride-update/release/index.html';
const mobileEntry=process.env.FORZERO_MOBILE_HTML??'forzero-budget-mobile-1.9.1.1.html';
const canvasStub = {getContext:()=>new Proxy({},{get:(_,key)=>key==='measureText'?text=>({width:text.length*10}):()=>{}})};
const context = vm.createContext({document:{createElement:()=>canvasStub}});
const run = source=>vm.runInContext(source,context);
run(matrix);
const behaviour = JSON.parse(run(`JSON.stringify((()=>{
  safeToRide=()=>true;
  rideElevation=()=>0;
  surfaceAt=()=>true;
  const original=updateBicyclePosture;
  const input={gas:false,brake:false,left:false,right:false,sprint:false};
  const downhill=(enabled)=>{
    updateBicyclePosture=enabled?original:()=>{};
    riderGrade=()=>-.045;
    const rider=makeCyclist(courses[0],stockBike,'bike');
    rider.speed=11;
    for(let tick=0;tick<360;tick++) moveCyclist(rider,input,PHYSICS_STEP);
    const state={posture:rider.posture,speed:rider.speed,distance:rider.travel};
    moveCyclist(rider,{...input,brake:true},PHYSICS_STEP);
    return {...state,braking:rider.posture};
  };
  const climb=(enabled)=>{
    updateBicyclePosture=enabled?original:()=>{};
    riderGrade=()=>.09;
    const bike=buildBike('stock','short','stock','agile','burst');
    const rider=makeCyclist(courses[0],bike,'bike');
    rider.speed=3.2;
    for(let tick=0;tick<72;tick++) moveCyclist(rider,{...input,gas:true,sprint:true},PHYSICS_STEP);
    return {posture:rider.posture,speed:rider.speed,energy:rider.energy,cadence:rider.cadence};
  };
  return {tuck:downhill(true),upright:downhill(false),standing:climb(true),seated:climb(false)};
})())`));
assert.equal(behaviour.tuck.posture,'tuck');
assert.equal(behaviour.tuck.braking,'seated');
assert.ok(behaviour.tuck.distance>behaviour.upright.distance+.2,JSON.stringify(behaviour));
assert.equal(behaviour.standing.posture,'stand');
assert.ok(behaviour.standing.speed>behaviour.seated.speed&&behaviour.standing.energy<behaviour.seated.energy);
assert.ok(behaviour.standing.cadence>0);
console.log('Posture physics:',JSON.stringify(behaviour));

class Response extends Writable {
  data = '';
  writeHead(status) {this.status=status;return this;}
  flushHeaders() {}
  _write(chunk,_encoding,done) {this.data+=chunk.toString();done();}
  room() {return JSON.parse(this.data.split('\n').filter(line=>line.startsWith('data: ')).at(-1).slice(6));}
}
function emit(server,method,url,body,token) {
  const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);
  Object.assign(req,{method,url,complete:true,headers:{'content-type':'application/json',authorization:'Bearer '+token}});
  const res=new Response();
  server.emit('request',req,res);
  return res;
}
async function request(server,method,url,body,token) {
  const res=emit(server,method,url,body,token);
  await new Promise(resolve=>res.once('finish',resolve));
  assert.equal(res.status,200,res.data);
  return JSON.parse(res.data);
}

const folder=mkdtempSync(join(tmpdir(),'litchi-v16-save-'));
const previousSaveFile=join(folder,'1.5.0-player-data.json');
const app=createAppShell({page:Buffer.from('<title>荔园环骑 1.6.0</title>'),saveDir:folder,previousSaveFile,bootTimeoutMs:0});
const online=createRideServer({page:Buffer.from('test'),iceServers:[]});

const browser = spawn(process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',[
  '--headless=new','--remote-debugging-pipe','--no-sandbox','--disable-extensions','--no-first-run',
  '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--window-size=987,600',
  '--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',
  '--user-data-dir='+mkdtempSync(join(tmpdir(),'litchi-v16-chrome-')),
],{windowsHide:true,stdio:['ignore','ignore','ignore','pipe','pipe']});
const pending=new Map(),errors=[];
let count=0,buffer='';
const deadline=setTimeout(()=>{browser.kill();console.error('Browser QA deadline');process.exit(1);},process.argv.includes('--park')?650_000:145_000);
browser.stdio[4].on('data',chunk=>{
  buffer+=chunk;
  let end;
  while((end=buffer.indexOf('\0'))>=0) {
    const message=JSON.parse(buffer.slice(0,end));
    buffer=buffer.slice(end+1);
    if(message.method==='Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description??message.params.exceptionDetails.text);
    if(pending.has(message.id)) {pending.get(message.id)(message);pending.delete(message.id);}
  }
});
function rpc(method,params={},sessionId) {
  return new Promise((resolve,reject)=>{
    const id=++count;
    pending.set(id,message=>message.error?reject(Error(message.error.message)):resolve(message.result));
    browser.stdio[3].write(JSON.stringify({id,method,params,sessionId})+'\0');
  });
}
async function open(file,{width=987,height=600,mobile=false}={}) {
  const {targetId}=await rpc('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await rpc('Target.attachToTarget',{targetId,flatten:true});
  await rpc('Runtime.enable',{},sessionId);
  await rpc('Page.enable',{},sessionId);
  await rpc('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile},sessionId);
  if(mobile) await rpc('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:3},sessionId);
  await rpc('Page.addScriptToEvaluateOnNewDocument',{source:`
    window.glBuffers={created:0,deleted:0};
    for(const [key,method] of Object.entries({created:'createBuffer',deleted:'deleteBuffer'})) {
      const original=WebGL2RenderingContext.prototype[method];
      WebGL2RenderingContext.prototype[method]=function(...args){glBuffers[key]++;return original.apply(this,args);};
    }`},sessionId);
  const nav=await rpc('Page.navigate',{url:pathToFileURL(resolve(file)).href},sessionId);
  assert.ok(!nav.errorText,nav.errorText);
  const evalPage=async expression=>{
    const result=await rpc('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);
    if(result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);
    return result.result.value;
  };
  const until=Date.now()+26_000;
  while(!await evalPage("typeof ready!=='undefined'&&ready")) {
    if(Date.now()>until) throw Error('Game did not initialize '+file+' '+JSON.stringify(errors));
    await sleep(100);
  }
  return {evalPage,close:()=>rpc('Target.closeTarget',{targetId}),
    touch:(type,points)=>rpc('Input.dispatchTouchEvent',{type,touchPoints:points},sessionId),
    capture:()=>rpc('Page.captureScreenshot',{format:'jpeg',quality:82},sessionId)};
}

async function measure(page) {
  return page.evalPage(`(async()=>{
    preferences.aa='fxaa'; preferences.resolution='fast';
    setActiveWeather('day');
    const gl=canvas.getContext('webgl2'), pixel=new Uint8Array(4);
    const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>{
      // The game's earlier frame callback submitted its draw to the same context.
      gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
      resolve(performance.now());
    }));
    for(let i=0;i<12;i++) await frame();
    const before={...glBuffers}, times=[];
    let last=await frame();
    for(let i=0;i<40;i++) {const now=await frame();times.push(now-last);last=now;}
    times.sort((a,b)=>a-b);
    return {size:[canvas.width,canvas.height],median:+((times[19]+times[20])/2).toFixed(2),p95:+times[37].toFixed(2),
      mean:+(times.reduce((sum,value)=>sum+value,0)/times.length).toFixed(2),
      allocations:glBuffers.created-before.created,deletions:glBuffers.deleted-before.deleted,
      live:glBuffers.created-glBuffers.deleted};
  })()`);
}

async function checkMapRendering(bothMaps) {
  for(const file of ['szu-litchi-loop-1.6.0/index.html','szu-litchi-dev/ride-update/release/index.html']) {
    const page=await open(file);
    try {
      async function sampleViews(views) {
        for(const [street,x,z,heading] of views) {
          await page.evalPage(`Object.assign(race.rider,{position:[${x},ROAD_Y,${z}],heading:${heading},speed:0});cameraRevision++;`);
          const sample=await measure(page);
          assert.deepEqual([sample.allocations,sample.deletions],[0,0]);
          assert.equal(await page.evalPage("canvas.getContext('webgl2').getError()"),0);
          console.log(file,street,JSON.stringify(sample));
        }
      }
      if(bothMaps) {
        await page.evalPage("race.freeRide()");
        await sampleViews([['nanhai',-131,-128,Math.PI],['shennan',-33,-245,-1.57],['baishi',-84,269,1.57]]);
      }
      await page.evalPage(`race.freeRide();arriveAtStation();ui.travel.click();document.querySelector('[data-destination="ucl"]')?.click();`);
      const until=Date.now()+26000;
      while(!await page.evalPage("activeCampus==='ucl'&&!pendingCampus")) {
        if(Date.now()>until) throw Error('UCL travel failed: '+JSON.stringify(errors));
        await sleep(80);
      }
      await sampleViews([['court',-147,340,1.45],['tavistockSouth',311,156,-1.57],['huntley',-104,68,.5]]);
    } finally { await page.close(); }
  }
  assert.deepEqual(errors,[]);
}

async function checkWorkshop() {
  const baseline=await open('szu-litchi-loop-1.5.0/index.html');
  const before=await measure(baseline);
  await baseline.close();
  const current=await open('szu-litchi-dev/ride-update/release/index.html');
  const after=await measure(current);
  assert.deepEqual(after.size,before.size);
  assert.equal(before.allocations,0);
  assert.equal(after.allocations,0);
  assert.equal(after.deletions,0);
  console.log('SwiftShader, same resolution and FXAA:',JSON.stringify({v15:before,v16:after}));
  const checks=await current.evalPage(`(()=>{
    ui.bikeButton.click();
    const categories=Array.from(ui.bikePresets.querySelectorAll('button'),button=>{
      button.click();return driverProfile.look.category;
    });
    ui.bikeStyles.querySelector('[name=trim]').value='orange';
    ui.bikeStyles.querySelector('[name=trim]').dispatchEvent(new Event('change'));
    const customized=ui.bikePresetName.textContent;
    const stats=ui.bikeAbility.querySelectorAll('meter').length;
    const speeds={top:ui.bikeTopSpeed.textContent,sprint:ui.bikeSprintSpeed.textContent,grass:ui.bikeGrass.textContent,
      visible:!ui.bikeTopSpeed.closest('[hidden]')&&getComputedStyle(ui.bikeTopSpeed).display!=='none'&&!ui.bikeStyles.closest('[hidden]'),
      topVisible:getComputedStyle(ui.bikeTopSpeed.closest('.bike-stats')).display!=='none'};
    const vertexSignatures=['campus','road','climb','gravel'].map(category=>{
      const model=makeRider('white',bicycleStyle({category}), 'stock','stock',false);
      return [model.frame.vertices.length,model.steering.vertices.length,model.wheels.vertices.length].join('/');
    });
    const cacheBefore={...glBuffers};
    for(const look of ['campus','road','climb','gravel']) for(const trim of ['coal','brown','orange']) {
      driverProfile.look=bicycleStyle({category:look,trim}); refreshBicycleModels();
    }
    const eviction=glBuffers.deleted-cacheBefore.deleted;
    const retained=(glBuffers.created-glBuffers.deleted)-(cacheBefore.created-cacheBefore.deleted);
    ui.bikePresets.querySelector('[data-preset=gravel]').click();
    ui.settingsContinue.click();
    Object.assign(race.rider,{posture:'cruise',stand:0,tuck:0,gripLoad:.2,pedalPhase:.1});
    updateHud();
    const cruiseHidden=ui.bikePosture.hidden;
    Object.assign(race.rider,{posture:'stand',stand:.8,cadence:81,gripLoad:.93,pedalPhase:.3});
    const oldGrade=riderGrade;riderGrade=()=>.064;updateHud();riderGrade=oldGrade;
    const hud=[ui.slopeGrade.textContent,ui.bikePosture.textContent,Boolean(document.getElementById('bikeCadence')),ui.bikeGripMeter.value,cruiseHidden];
    race.setVehicle('trail');updateHud();
    const poweredHud=ui.bikeFeedback.hidden&&ui.slopeGrade.hidden;
    race.setVehicle('bike');
    const look=driverProfile.look;
    const event=race.event;
    const file=makeGhostFile(event,{...event.benchmark,vehicle:'bike',appearance:bicycleAppearance(driverProfile,race.bike)},driverProfile);
    const ghost=loadFriendGhost(readGhostFile(JSON.stringify(file))).opponent;
    const legacy=makeGhostFile(event,{...event.benchmark,vehicle:'bike'},{name:'旧影子',paint:'classic'});
    const {campus,id:courseId,seed,layout}=legacy.course;
    const storageKey=checkpointRecordKey(event,'bike');
    return {categories,customized,stats,speeds,signatures:new Set(vertexSignatures).size,eviction,retained,hud,poweredHud,look,
      ghost:ghost.look,legacy:{storageKey,record:event.benchmark,archive:{replay:JSON.stringify(legacy),
        score:{campus,courseId,seed,layout,name:'旧影子',vehicle:'bike',time:legacy.run.time}}}};
  })()`);
  assert.deepEqual(checks.categories,['road','climb','gravel','campus']);
  assert.equal(checks.customized,'自定义构筑');
  assert.equal(checks.stats,6);
  assert.equal(checks.speeds.visible,true);
  assert.equal(checks.speeds.topVisible,true);
  assert.match(checks.speeds.top,/km\/h$/);
  assert.match(checks.speeds.sprint,/km\/h$/);
  assert.match(checks.speeds.grass,/km\/h$/);
  assert.equal(checks.signatures,4);
  assert.ok(checks.eviction>=6);
  assert.ok(checks.retained<=48);
  assert.deepEqual(checks.hud,['↗ +6.4%','起身摇车',false,7,true]);
  assert.ok(checks.poweredHud);
  assert.deepEqual(checks.ghost,checks.look);

  const {storageKey,record,archive}=checks.legacy;
  const previous={format:'litchi-save',version:1,storage:{
    'szu-litchi-driver-1':'{"name":"旧骑手","vehicle":"bike","paint":"classic"}',
    'szu-litchi-bike-1':'{"tyres":"race","gears":"long","brakes":"control"}',
    [storageKey]:JSON.stringify(record),
  },friends:[archive]};
  writeFileSync(previousSaveFile,JSON.stringify(previous));
  assert.equal((await request(app.server,'GET','/app/status')).version,'1.6.0');
  const migrated=await request(app.server,'GET','/app/save');
  assert.deepEqual(migrated.data,previous);

  const save=await current.evalPage('buildSaveSnapshot()');
  await request(app.server,'POST','/app/save',save);
  const stored=JSON.parse(readFileSync(join(folder,'player-data.json'),'utf8'));
  assert.deepEqual(JSON.parse(stored.storage['szu-litchi-driver-1']).look,checks.look);
  await current.evalPage(`applySaveSnapshot(${JSON.stringify(migrated.data)},{preferIncoming:true})`);
  assert.deepEqual(await current.evalPage('[driverProfile.look.category,race.bike.tyres,race.bike.frame,race.bike.sprint]'),['campus','race','stock','stock']);
  assert.equal(await current.evalPage(`JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)})).time`),record.time);
  assert.ok(await current.evalPage("readFriendScores().then(rows=>rows.some(row=>row.name==='旧影子'))"));
  assert.deepEqual((await request(app.server,'GET','/app/save')).data,stored);
  const created=await request(online,'POST','/online/rooms',{name:'房主',protocol:3,format:'bo1',look:checks.look,
    route:{campus:'szu',id:'libraries',seed:null,layout:'deadbeef'}});
  assert.deepEqual(created.room.players[0].look,checks.look);
  const playerURL='/online/rooms/'+created.room.code;
  const events=emit(online,'GET',playerURL+'/events?id='+created.id+'&token='+created.token);
  await request(online,'POST',playerURL+'/command?id='+created.id,{action:'profile',look:{...checks.look,category:'road',rim:'unknown'}},created.token);
  assert.equal(events.room().players[0].look.category,'road');
  assert.equal(events.room().players[0].look.rim,'auto');
  events.destroy();
  await current.close();
  assert.deepEqual(errors,[]);
  console.log('Workshop presets, HUD, appearance meshes, Buffer disposal, v1 save migration, ghost and room appearance passed.');
}
async function checkMobileSave() {
  for(const [width,height] of [[390,844],[844,390]]) {
  const tab=await open(mobileEntry,{width,height,mobile:true});
    try {
      const result=await tab.evalPage(`(async()=>{
        ui.settingsButton.click();
        async function importFromPicker(storage,wanted) {
          const data=new DataTransfer();
          data.items.add(new File([JSON.stringify({format:'litchi-save',version:1,storage})],'backup.json'));
          ui.saveStatus.textContent='';
          ui.saveFile.files=data.files;
          ui.saveFile.dispatchEvent(new Event('change'));
          const end=performance.now()+3000;
          while(!ui.saveStatus.textContent.includes(wanted)&&performance.now()<end)
            await new Promise(resolve=>setTimeout(resolve,25));
          return ui.saveStatus.textContent;
        }
        const invalid=await importFromPicker(null,'有效');
        const valid=await importFromPicker({'szu-litchi-driver-1':JSON.stringify({name:'手机存档',vehicle:'bike'})},'已导入');
        return {invalid,valid,name:ui.driverName.value,offline:location.protocol==='file:'};
      })()`);
      assert.ok(result.offline);
      assert.match(result.invalid,/有效/);
      assert.match(result.valid,/已导入/);
      assert.equal(result.name,'手机存档');
      console.log(`Mobile ${width}x${height}: malformed backup rejected, valid backup restored.`);
    } finally { await tab.close(); }
  }
  assert.deepEqual(errors,[]);
}

try {
  if(process.argv.includes('--traffic')) {
    for(const [width,height,mobile] of [[1280,720,false],[390,844,true],[844,390,true]]) {
    const page=await open(mobile?mobileEntry:desktopEntry,{width,height,mobile});
      try {
        const result=await page.evalPage(`(()=>{
          openSettings();
          const select=value=>{
            ui.settingsTraffic.value=value;ui.settingsTraffic.dispatchEvent(new Event('change'));
          };
          select('off');
          const disabled=ui.settingsCollision.disabled, empty=trialTraffic(race).vehicles.length;
          select('standard');
          const enabled=!ui.settingsCollision.disabled,cars=trialTraffic(race).vehicles.length;
          ui.settingsCollision.checked=true;ui.settingsCollision.dispatchEvent(new Event('change'));
          const actor=trialTraffic(race).vehicles[0], {point}=trafficPosition(actor,0);
          const rider={vehicle:'bike',speed:9}, mayRide=()=>true;
          const hit=resolveVehicleCollisions(rider,point[0],point[2],rideElevation(point[0],point[2]),0,mayRide,[actor])[2];
          select('off');
          const invisible=resolveVehicleCollisions(rider,point[0],point[2],rideElevation(point[0],point[2]),0,mayRide,trialTraffic(race).vehicles)[2];
          select('sparse');closeSettings();
          const formations=[];
          for(let i=0;i<3;i++) {beginTrial();formations.push(race.raceTraffic.vehicles.map(a=>a.start).join(','));}
          return {disabled,empty,enabled,cars,hit,invisible,layouts:new Set(formations).size,title:document.title};
        })()`);
        assert.ok(result.title.endsWith(' '+(process.env.FORZERO_EXPECTED_VERSION??'1.9.1.1')), `Unexpected title: ${result.title}`);
        assert.ok(result.disabled&&result.enabled&&result.hit&&!result.invisible&&result.cars>0);
        assert.equal(result.empty,0);assert.equal(result.layouts,3);
        console.log(width,height,result);
      } finally {await page.close();}
    }
    assert.deepEqual(errors,[]);
  } else if(process.argv.includes('--mountain')) {
    const {verifyMountainViews}=await import('./verify-park-browser.mjs');
    await verifyMountainViews(open,errors);
  } else if(process.argv.includes('--park')) {
    const {verifyParkViews}=await import('./verify-park-browser.mjs');
    await verifyParkViews(open,errors);
  } else if(process.argv.includes('--mobile-save')) await checkMobileSave();
  else if(process.argv.includes('--maps')||process.argv.includes('--ucl')) await checkMapRendering(process.argv.includes('--maps'));
  else await checkWorkshop();
} finally {
  clearTimeout(deadline);
  browser.kill();
  online.emit('close');
  await app.shutdown();
}
