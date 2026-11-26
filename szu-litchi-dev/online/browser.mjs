import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { createRideServer, loadStaticAssets } from './server.mjs';

const nativeLoopback = process.argv.includes('--rtc-loopback');
const mock = nativeLoopback||process.argv.includes('--mock');
const targetArg = process.argv.slice(2).find(argument=>!argument.startsWith('--'));
const releaseDir = targetArg ? (statSync(resolve(targetArg)).isDirectory() ? resolve(targetArg) : dirname(resolve(targetArg))) :
  null;
const releaseDirUrl = releaseDir ? pathToFileURL(releaseDir + '/') : new URL('../ride-update/release/',import.meta.url);
const pageURL = targetArg && !statSync(resolve(targetArg)).isDirectory() ? pathToFileURL(resolve(targetArg)) :
  new URL('./index.html',releaseDirUrl);
const server = mock ? null : createRideServer({assets:await loadStaticAssets(releaseDirUrl),iceServers:[]});
if (server) {
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
}
const base = mock?pageURL.href:`http://127.0.0.1:${server.address().port}`;
const browser = spawn(process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',[
  '--headless=new','--remote-debugging-pipe','--no-sandbox','--disable-extensions','--no-first-run',
  '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--window-size=830,560',
  '--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',
  '--user-data-dir='+mkdtempSync(join(tmpdir(),'litchi-online-chrome-')),
],{windowsHide:true,stdio:['ignore','ignore','ignore','pipe','pipe']});
const errors = [], pending = new Map();
let request = 0, buffer = '';
const deadline = setTimeout(()=>{console.error('Browser deadline');process.exit(1);},155_000);
browser.once('error',error=>{console.error(error);process.exit(1);});
browser.stdio[4].on('data',chunk=>{
  buffer += chunk;
  let end;
  while ((end=buffer.indexOf('\0'))>=0) {
    const event = JSON.parse(buffer.slice(0,end));
    buffer = buffer.slice(end+1);
    if (event.method==='Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.exception?.description??event.params.exceptionDetails.text);
    const respond = pending.get(event.id);
    if (respond) { pending.delete(event.id); respond(event); }
  }
});

function rpc(method,params={},sessionId) {
  return new Promise((resolve,reject)=>{
    const id = ++request;
    pending.set(id,event=>event.error?reject(Error(event.error.message)):resolve(event.result));
    browser.stdio[3].write(JSON.stringify({id,method,params,sessionId})+'\0');
  });
}

async function open(name,url) {
  const {browserContextId} = await rpc('Target.createBrowserContext');
  const {targetId} = await rpc('Target.createTarget',{url:'about:blank',browserContextId});
  const {sessionId} = await rpc('Target.attachToTarget',{targetId,flatten:true});
  await rpc('Runtime.enable',{},sessionId);
  await rpc('Page.enable',{},sessionId);
  if (mock) await rpc('Page.addScriptToEvaluateOnNewDocument',{
    source:`window.testNativeWebRtc=${nativeLoopback};\n`+readFileSync(new URL('./browser-mock.js',import.meta.url),'utf8'),
  },sessionId);
  const navigation = await rpc('Page.navigate',{url},sessionId);
  assert.ok(!navigation.errorText,navigation.errorText);
  const run = async expression=>{
    const result = await rpc('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true},sessionId);
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);
    return result.result.value;
  };
  async function wait(expression) {
    const until = Date.now()+26_000;
    do {
      if (await run(expression)) return;
      await sleep(160);
    } while (Date.now()<until);
    const status = await run(`typeof onlineRoom==='undefined'?null:({state:onlineRoom?.state,
      message:ui.onlineStatus.textContent,peers:onlineRoom&&Array.from(onlineRoom.peers.values(),p=>[p.pc.connectionState,p.channel?.readyState])})`);
    const current = await run('({href:location.href,title:document.title,text:document.body?.textContent.slice(0,160)})');
    throw Error(name+' timed out '+expression+' '+JSON.stringify({current,status,errors}));
  }
  const key = (type,code)=>rpc('Input.dispatchKeyEvent',{type,code,key:code.slice(-1).toLowerCase()},sessionId);
  await wait("typeof ready!=='undefined'&&ready");
  await run(`ui.driverName.value=${JSON.stringify(name)};commitDriverName();`);
  return {run,wait,key,sessionId};
}

const drive = readFileSync(new URL('../rounds/drive-path.js',import.meta.url),'utf8')
  .replace('const trial=new TimeTrial(event);','const trial=race;');

async function equipBike(rider,parts) {
  await rider.run(`ui.bikeButton.click();
    [ui.bikeTyres.value,ui.bikeGears.value,ui.bikeBrakes.value]=${JSON.stringify(parts)};
    ui.bikeBrakes.dispatchEvent(new Event('change'));ui.settingsContinue.click()`);
  assert.deepEqual(await rider.run('[race.bike.tyres,race.bike.gears,race.bike.brakes]'),parts);
}

const equippedParts = '[race.rider.bike.tyres,race.rider.bike.gears,race.rider.bike.brakes]';

async function mockTest() {
  const host = await open('房主',base+'#room=ABCD2345');
  const parts=['race','long','control'];
  await equipBike(host,parts);
  assert.equal(await host.run('ui.onlineCodeInput.value'),'ABCD2345');
  await host.run(`onlineSite=()=>true;
    const mockEvent=coursesByCampus.ucl[0];
    window.mockRoute={campus:'ucl',id:mockEvent.id,seed:null,layout:ghostCourseKey(mockEvent)};
    race.setVehicle('trail');
    ui.onlineButton.click();ui.onlineJoinForm.requestSubmit();`);
  await host.wait("activeCampus==='ucl'&&onlineRoom?.course?.id===mockEvent.id&&!onlineBusy&&onlineDataLinks(onlineRoom)===1");
  assert.equal(await host.run('race.entryVehicle'),'bike');
  await host.run('ui.onlineReady.click()');
  await host.wait('!ui.onlineStart.disabled');
  await host.run('ui.onlineStart.click()');
  await host.wait("race.phase==='race'&&mockPackets.length>0");
  assert.deepEqual(await host.run(equippedParts),parts);
  assert.ok(await host.run("mockPackets.some(packet=>packet.byteLength===5)"));
  const samples = "[...onlineRoom.peers.values()][0].samples.map(s=>[s.sequence,s.epoch,s.speed])";
  await host.run('sendMockPose(1,0,2);sendMockPose(3,1,8);sendMockPose(2,0,7);');
  await host.wait(samples+'.some(sample=>sample[0]===3)');
  assert.deepEqual(await host.run(samples),[[3,1,8]]);
  assert.equal(await host.run('onlineRiderPoses(performance.now())[0]?.name'),'访客');
  await host.key('keyDown','KeyW');
  await host.wait('race.rider.speed>1');
  await host.key('keyUp','KeyW');
  await host.key('keyDown','KeyF');
  await host.key('keyUp','KeyF');
  await host.wait('new DataView(mockPackets.at(-1)).getUint16(4)===1');
  const result = await host.run(`(()=>{${drive}return rideTest(race.event,true,250)})()`);
  assert.equal(result.phase,'done');
  assert.equal(await host.run('race.record'),false);
  await host.wait("onlineRoom.state.phase==='done'&&ui.onlineDialog.open");
  assert.match(await host.run('ui.onlineStanding.textContent'),/冠军 · 房主/);
  await host.run('ui.onlineLeave.click()');
  assert.ok(await host.run("!onlineRoom&&race.rider.vehicle==='trail'&&race.phase==='free'"));
  assert.deepEqual(errors,[]);
  console.log(`${nativeLoopback?'Native WebRTC loopback with simulated signaling':'Browser with simulated transports'}: invite, cross-campus course, ready, synchronized race, pose sequence and recovery, real physics finish, winner and garage restoration passed.`);
}

try {
  if (mock) await mockTest();
  else {
    const setups = [['traction','short','power'],['race','long','control'],['stock','stock','stock'],['traction','long','stock']];
    const host = await open('房主',base);
    await equipBike(host,setups[0]);
    await host.run(`ui.freeRide.click();ui.travel.click();if(!pendingCampus)ui.travel.click()`);
    await host.wait("activeCampus==='ucl'&&!pendingCampus");
    await host.run("ui.coursePicker.value='quad-sprint';ui.coursePicker.dispatchEvent(new Event('change'));ui.onlineButton.click();ui.onlineCreate.click();");
    await host.wait("onlineRoom?.course?.id==='quad-sprint'&&!onlineBusy");
    const code = await host.run('onlineRoom.state.code');
    const guests = [];
    for (const [index,name] of ['车手二','车手三','车手四'].entries()) {
      const guest = await open(name,base+'/#room='+code);
      assert.equal(await guest.run('ui.onlineCodeInput.value'),code);
      await equipBike(guest,setups[index+1]);
      await guest.run('ui.onlineButton.click();ui.onlineJoinForm.requestSubmit()');
      await guest.wait("activeCampus==='ucl'&&onlineRoom?.course?.id==='quad-sprint'&&!onlineBusy");
      guests.push(guest);
    }
    const racers = [host,...guests];
    await Promise.all(racers.map(rider=>rider.wait('onlineRoom?.state.players.length===4&&onlineDataLinks(onlineRoom)===3')));
    await host.wait("Array.from(ui.onlinePlayers.querySelectorAll('[data-latency-peer]')).every(label=>/延迟 [0-9]+ ms/.test(label.textContent))");
    assert.match(await host.run('ui.onlineBike.textContent'),/越野胎.*低齿比.*强力刹车/);
    const links = await Promise.all(racers.map(rider=>rider.run(`Promise.all([...onlineRoom.peers.values()].map(async peer=>{
      const stats=await peer.pc.getStats();
      const transport=[...stats.values()].find(item=>item.type==='transport'&&item.selectedCandidatePairId);
      const pair=stats.get(transport.selectedCandidatePairId);
      return [stats.get(pair.localCandidateId).candidateType,stats.get(pair.remoteCandidateId).candidateType];
    }))`)));
    assert.ok(links.flat(2).every(type=>type==='host'),JSON.stringify(links));
    console.log('Four browser profiles joined a cross-campus room with all six WebRTC links direct and live latency probes active.');

    await Promise.all(racers.map(rider=>rider.run('ui.onlineReady.click()')));
    await host.wait('!ui.onlineStart.disabled');
    await host.run('ui.onlineStart.click()');
    await Promise.all(racers.map(rider=>rider.wait("race.phase==='race'&&onlineRiderPoses(performance.now()).length===3")));
    assert.deepEqual(await Promise.all(racers.map(rider=>rider.run(equippedParts))),setups);
    const speeds = await host.run(`(()=>{
      const accelerate=bike=>{
        const rider=makeCyclist(race.event,bike,'bike');
        for(let tick=0;tick<105;tick++) moveCyclist(rider,{...neutralDrive,gas:true},PHYSICS_STEP,true);
        return rider.speed;
      };
      return [accelerate(race.rider.bike),accelerate(stockBike)];
    })()`);
    assert.ok(speeds[0]>speeds[1]+.25,JSON.stringify(speeds));
    await host.wait("!ui.onlineDialog.open&&ui.onlineLatency.offsetWidth>0&&/延迟 [0-9]+ ms/.test(ui.onlineLatency.textContent)");
    const launch = await Promise.all(racers.map(rider=>rider.run('onlineRoom.state.round.goAt')));
    assert.equal(new Set(launch).size,1);
    await host.key('keyDown','KeyW');
    await guests[0].wait("onlineRiderPoses(performance.now()).some(p=>p.name==='房主'&&p.speed>1)");
    await host.key('keyUp','KeyW');
    await host.key('keyDown','KeyF');
    await host.key('keyUp','KeyF');
    await guests[0].wait("[...onlineRoom.peers.values()].some(peer=>peer.samples.at(-1)?.epoch===1)");
    console.log('Common launch, custom bike physics, live movement and recovery epoch crossed the data channels.');

    const times = await Promise.all(racers.map((rider,index)=>rider.run(`(()=>{${drive}
      const result=rideTest(race.event,${index===0},250);
      if(result.phase!=='done') throw Error('Physics replay did not finish');
      return result.elapsed;
    })()`).then(time=>{assert.ok(time>10_000);return time;})));
    await Promise.all(racers.map(rider=>rider.wait("onlineRoom.state.phase==='done'&&ui.onlineDialog.open")));
    const winner = await host.run("onlineRoom.state.standing[0].name");
    assert.equal(winner,['房主','车手二','车手三','车手四'][times.indexOf(Math.min(...times))]);
    assert.ok((await host.run('ui.onlineStanding.textContent')).includes('冠军 · '+winner));
    await Promise.all(racers.map(rider=>rider.run('ui.onlineLeave.click()')));
    assert.equal(await host.run('ui.onlineLatency.hidden'),true);
    assert.deepEqual(await Promise.all(racers.map(rider=>rider.run(equippedParts))),setups);
    assert.deepEqual(errors,[]);
    console.log('All four physics runs finished; BO1 crowned the fastest rider and restored garages.');
  }
} finally {
  clearTimeout(deadline);
  browser.kill();
  server?.closeAllConnections();
  server?.close();
}
