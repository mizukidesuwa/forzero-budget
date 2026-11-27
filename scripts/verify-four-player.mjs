import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { once } from 'node:events';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { openTestBrowser } from './browser-runner.mjs';
import tuning190 from '../server/tuning-190.cjs';

const { protocol } = tuning190;

// Real localhost HTTP, four isolated browser profiles and real WebRTC data
// channels. --drive uses accelerated fixed-step auto-driving; without it finish
// times are simulated API submissions.
const drive = process.argv.includes('--drive');
const networkOnly = process.argv.includes('--network-only');
const desktop = resolve(process.env.FORZERO_RELEASE_DIR ??
  (existsSync('dist-v2/desktop/index.html') ? 'dist-v2/desktop' : '.'));
const serverUrl = pathToFileURL(join(desktop, 'server.mjs')).href;
const { createRideServer, loadStaticAssets } = await import(serverUrl);
const assets = await loadStaticAssets(pathToFileURL(desktop + '/'));
const server = createRideServer({ assets, iceServers: [] });
const eventStreams = new Map();
server.on('request', (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (req.method !== 'GET' || !/^\/online\/rooms\/[A-Z2-9]{8}\/events$/.test(url.pathname)) return;
  const id = url.searchParams.get('id');
  eventStreams.set(id, res);
  res.once('close', () => { if (eventStreams.get(id) === res) eventStreams.delete(id); });
});
console.log('[1/7] Starting local HTTP server...');
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  try {
    const health = await fetch(origin + '/', { signal: AbortSignal.timeout(5000) });
    assert.equal(health.status, 200);
  } catch (error) {
    throw new Error(`Localhost HTTP cannot be reached: ${error.cause?.code ?? error.message}`);
  }
  console.log('[1/7] Local HTTP is reachable. Starting Chrome...');
  browser = await openTestBrowser({timeoutMs:45_000});
  const { rpc } = browser;
  async function open() {
    const { browserContextId } = await rpc('Target.createBrowserContext', { disposeOnDetach: true });
    const { targetId } = await rpc('Target.createTarget', { url: 'about:blank', browserContextId });
    const { sessionId } = await rpc('Target.attachToTarget', { targetId, flatten: true });
    await rpc('Runtime.enable', {}, sessionId);
    await rpc('Page.enable', {}, sessionId);
    await rpc('Network.enable', {}, sessionId);
    const evalPage = async expression => {
      const result = await rpc('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result.value;
    };
    const nav = await rpc('Page.navigate', { url: origin + '/' }, sessionId);
    assert.ok(!nav.errorText, nav.errorText);
    return { evalPage, sessionId };
  }
  async function wait(page, expression, label, timeout = 60_000) {
    const end = Date.now() + timeout;
    let nextUpdate = Date.now() + 10_000;
    while (!await page.evalPage(expression)) {
      if (Date.now() > nextUpdate || Date.now() > end) {
        const state = await page.evalPage(`(()=>{const f=__FORZERO__;return {status:document.getElementById('onlineStatus')?.textContent??'',
          phase:f.onlineRoom?.state?.phase??null,players:f.onlineRoom?.state?.players?.length??0,
          peers:f.onlineRoom?[...f.onlineRoom.peers.values()].map(p=>[p.pc.connectionState,p.channel?.readyState??null]):[]}})()`);
        if (Date.now() > end) throw Error(label + ' timeout: ' + JSON.stringify(state));
        console.log('  Waiting:', label, JSON.stringify(state));
        nextUpdate = Date.now() + 10_000;
      }
      await delay(200);
    }
  }
  const pages = [];
  for (let i = 0; i < 4; i++) {
    console.log(`[2/7] Starting browser ${i + 1}/4...`);
    const page = await open();
    await wait(page, "globalThis.__FORZERO__?.ready===true", 'game initialization');
    // Keep the game's frame loop, physics and WebRTC active without four continuous SwiftShader renders.
    if (networkOnly) {
      await page.evalPage("__FORZERO__.stage.style.setProperty('display','none','important')");
    }
    if (i % 2) await page.evalPage("(()=>{const f=__FORZERO__;f.openSettings();f.ui.settingsLanguage.value='en';f.ui.settingsLanguage.dispatchEvent(new Event('change'));f.closeSettings()})()");
    pages.push(page);
  }
  console.log('[3/7] Creating the test room...');
  await pages[0].evalPage("(()=>{const u=__FORZERO__.ui;u.onlineButton.click();u.onlineFormat.value='bo1';u.onlineTuningTime.value='0';u.onlineCreate.click()})()");
  await wait(pages[0], '__FORZERO__.onlineRoom&&__FORZERO__.onlineRoom.course&&__FORZERO__.onlineRoom.clockReady', 'create room');
  const code = await pages[0].evalPage('__FORZERO__.onlineRoom.state.code');
  assert.match(code, /^[A-Z0-9]{8}$/);
  await pages[1].evalPage(`(()=>{
    const mode=__FORZERO__.ui.raceMode;
    mode.value='chase'; mode.dispatchEvent(new Event('change'));
    if(mode.value!=='chase') throw Error('Failed to preselect Shadow Chase for participant 2');
  })()`);
  for (const page of pages.slice(1)) {
    console.log(`[4/7] Joining participant ${pages.indexOf(page) + 1}/4...`);
    await page.evalPage(`(()=>{const u=__FORZERO__.ui;u.onlineButton.click();u.onlineCodeInput.value=${JSON.stringify(code)};u.onlineJoinForm.requestSubmit()})()`);
    await wait(page, '__FORZERO__.onlineRoom&&__FORZERO__.onlineRoom.course&&__FORZERO__.onlineRoom.clockReady', 'join room');
  }
  console.log('[5/7] Waiting for 12 WebRTC channels (up to two minutes)...');
  for (const page of pages) {
    await wait(page, `(()=>{const r=__FORZERO__.onlineRoom;return r.state.protocol===${protocol} && r.state.players.length===4 && r.peers.size===3 &&
      r.state.players.every(player=>player.raceProgress===true) &&
      [...r.peers.values()].every(p=>p.pc.connectionState==='connected' && p.channel?.readyState==='open' && p.channel.label==='ride-v${protocol}')})()`, 'WebRTC peers', 120_000);
  }
  assert.equal(await pages[0].evalPage('document.documentElement.lang'), 'zh-CN');
  assert.equal(await pages[1].evalPage('document.documentElement.lang'), 'en');
  assert.equal(await pages[0].evalPage('__FORZERO__.ui.onlineReady.textContent'), '准备');
  assert.equal(await pages[1].evalPage('__FORZERO__.ui.onlineReady.textContent'), 'Ready');
  assert.equal(await pages[1].evalPage('/[\\p{Script=Han}]/u.test(__FORZERO__.ui.onlineBike.textContent)'), false);
  console.log(`PASS: real HTTP room, protocol v${protocol}, four browsers and 12 connected peer channels`);
  console.log('[5/7] Interrupting one signaling stream and checking reconnection...');
  const reconnectId = await pages[3].evalPage('__FORZERO__.onlineRoom.id');
  const stream = eventStreams.get(reconnectId);
  assert.ok(stream, 'participant event stream is missing');
  stream.destroy();
  await wait(pages[0], `__FORZERO__.onlineRoom.state.players.find(p=>p.id===${JSON.stringify(reconnectId)})?.online===false`, 'participant offline', 20_000);
  await wait(pages[3], `__FORZERO__.onlineRoom.id===${JSON.stringify(reconnectId)} && __FORZERO__.onlineRoom.events?.readyState===1`, 'participant event stream reconnect', 30_000);
  await wait(pages[0], `__FORZERO__.onlineRoom.state.players.find(p=>p.id===${JSON.stringify(reconnectId)})?.online===true`, 'participant online', 30_000);
  console.log('PASS: interrupted event stream reconnected under the same player identity');
  const [host, guest] = pages;
  const originalRoute = await host.evalPage('__FORZERO__.onlineRoom.state.route');
  const roomCommand = (page, body) => page.evalPage(`(()=>{
    const s=__FORZERO__.onlineRoom;
    return fetch(s.url+'/command?id='+s.id,{method:'POST',headers:{'content-type':'application/json',
      authorization:'Bearer '+s.token},body:${JSON.stringify(JSON.stringify(body))}}).then(r=>r.status);
  })()`);
  await guest.evalPage(`(()=>{
    const requestFrame=window.requestAnimationFrame;
    let latestFrame;
    window.qaFramePaused=false;
    window.requestAnimationFrame=callback=>{latestFrame=callback;window.qaFramePaused=true;return 0};
    window.qaResumeFrame=()=>{window.requestAnimationFrame=requestFrame;if(latestFrame) requestFrame(latestFrame)};
  })()`);
  try {
    await wait(guest,'globalThis.qaFramePaused===true','participant frame paused before changing course');
    await host.evalPage(`(()=>{
      const selector=__FORZERO__.ui.onlineLobbyCampus;
      selector.value='ucl';selector.dispatchEvent(new Event('change'));
    })()`);
    await wait(guest,"__FORZERO__.pendingCampus?.online?.route.id==='quad-sprint'",'first cross-campus course pending');
    await wait(host,"__FORZERO__.onlineRoom.course?.id==='quad-sprint' && !__FORZERO__.ui.onlineLobbyCourse.disabled",'host loaded first course');
    await host.evalPage(`(()=>{
      const selector=__FORZERO__.ui.onlineLobbyCourse;
      selector.value='square-circuit';selector.dispatchEvent(new Event('change'));
    })()`);
    await wait(guest,"__FORZERO__.onlineRoom.state.route.id==='square-circuit'",'newer course arrived during first load');
    assert.equal(await guest.evalPage('__FORZERO__.ui.onlineReady.disabled'),true);
    assert.equal(await roomCommand(guest,{action:'ready',ready:true,routeCode:originalRoute.code,routeLayout:originalRoute.layout}),409,
      'A stale ready request must not ready the player for a different route');
  } finally {
    await guest.evalPage('qaResumeFrame()');
  }
  await wait(guest,"__FORZERO__.onlineRoom.course?.id==='square-circuit' && __FORZERO__.race.event.id==='square-circuit'",'latest route applied without another config update');
  assert.equal(await roomCommand(host,{action:'config',route:originalRoute}),200);
  for (const page of pages) {
    await wait(page, `__FORZERO__.onlineRoom.state.route.code===${JSON.stringify(originalRoute.code)} &&
      __FORZERO__.onlineRoom.course?.campus===${JSON.stringify(originalRoute.campus)} &&
      __FORZERO__.race.event.id===${JSON.stringify(originalRoute.id)}`, 'restore the original course');
  }
  console.log('PASS: overlapping cross-campus course changes converge and stale readiness is rejected');
  console.log('[6/7] Readying players and starting the race...');
  for (const page of pages) {
    await wait(page, '!__FORZERO__.ui.onlineReady.disabled', 'ready button');
    await page.evalPage('__FORZERO__.ui.onlineReady.click()');
    await wait(page, '__FORZERO__.onlineRoom.state.players.find(p=>p.id===__FORZERO__.onlineRoom.id)?.ready', 'ready update');
  }
  await wait(pages[0], '!__FORZERO__.ui.onlineStart.disabled', 'start button');
  await pages[0].evalPage('__FORZERO__.ui.onlineStart.click()');
  for (const page of pages) await wait(page, "__FORZERO__.onlineRoom.state.phase==='race' && __FORZERO__.onlineRoom.state.round", 'race start');
  const goAt = await pages[0].evalPage('__FORZERO__.onlineRoom.state.round.goAt');
  const original = await pages[0].evalPage('(()=>{const s=__FORZERO__.onlineRoom.state;return {route:s.route.code,weather:s.weather,matchId:s.matchId,roundId:s.round.id,poseNumber:s.round.poseNumber}})()');
  await delay(Math.max(0, goAt - Date.now() + 250));
  for (const page of pages) {
    await wait(page, "__FORZERO__.onlineRoom.startedRound===__FORZERO__.onlineRoom.state.round.id && [...__FORZERO__.onlineRoom.peers.values()].every(p=>Number.isFinite(p.samples.at(-1)?.progress))", 'receive race positions and progress', 60_000);
    await wait(page, "__FORZERO__.race.phase==='race' && __FORZERO__.race.elapsed>0", 'local BO1 timing, including the participant who selected Shadow Chase');
    const elapsed = await page.evalPage('__FORZERO__.race.elapsed');
    await wait(page, `__FORZERO__.race.elapsed>${elapsed}`, 'local BO1 timer advances');
  }
  console.log('PASS: all four players received position and progress from all three opponents');
  const hostId = await host.evalPage('__FORZERO__.onlineRoom.id');
  const guestId = await guest.evalPage('__FORZERO__.onlineRoom.id');
  const setGuestProgress = enabled => host.evalPage(`__FORZERO__.onlineRoom.state.players.find(p=>p.id===${JSON.stringify(guestId)}).raceProgress=${enabled}`);
  const guestSample = `__FORZERO__.onlineRoom.peers.get(${JSON.stringify(hostId)}).samples.at(-1)`;
  await setGuestProgress(false);
  try {
    await wait(guest,`${guestSample}?.progress===null`,'legacy peer still receives compatible poses');
  } finally {
    await setGuestProgress(true);
  }
  await wait(guest,`Number.isFinite(${guestSample}?.progress)`,'extended poses resume for supported peers');
  const rank = await pages[0].evalPage(`(()=>{
    const f=__FORZERO__, s=f.onlineRoom, course=s.course, anchor=f.race.routeAnchor;
    const peers=[...s.peers.values()], saved=peers.map(peer=>peer.samples);
    try {
      s.course={...course,path:{rows:[{p:[0,0,0],distance:0},{p:[0,0,100],distance:100}]}};
      f.race.routeAnchor=0;
      for (const [i,peer] of peers.entries()) {
        peer.samples=[{...saved[i].at(-1),position:[0,0,i===0?100:0],speed:0,progress:null,at:performance.now()}];
      }
      f.updateHud();
      return f.ui.onlineRank.textContent;
    } finally {
      s.course=course;
      f.race.routeAnchor=anchor;
      peers.forEach((peer,i)=>{peer.samples=saved[i]});
    }
  })()`);
  assert.match(rank,/第 2 \/ 4 名.*落后 100 米/,'The HUD projects remote world X/Z onto the course');
  const multiLapRank = await pages[0].evalPage(`(()=>{
    const f=__FORZERO__, s=f.onlineRoom, course=s.course, anchor=f.race.routeAnchor;
    const peers=[...s.peers.values()], saved=peers.map(peer=>peer.samples);
    try {
      const rows=Array.from({length:7},(_,i)=>({p:[0,0,(i%2)*100],distance:i*100}));
      s.course={...course,length:600,variant:{direction:'reverse',laps:3},path:{rows}};
      f.race.routeAnchor=10;
      for (const [i,peer] of peers.entries()) {
        peer.samples=[{...saved[i].at(-1),position:[0,0,10],speed:0,progress:i===0?210:0,at:performance.now()}];
      }
      f.updateHud();
      const shown=f.ui.onlineRank.textContent;
      f.race.routeAnchor=410;
      f.updateHud();
      const ahead=f.ui.onlineRank.textContent;
      peers[0].samples[0].progress=null;
      f.updateHud();
      return {shown,ahead,hidden:f.ui.onlineRank.hidden};
    } finally {
      s.course=course;
      f.race.routeAnchor=anchor;
      peers.forEach((peer,i)=>{peer.samples=saved[i]});
    }
  })()`);
  assert.match(multiLapRank.shown,/第 2 \/ 4 名.*落后 200 米/,'Identical positions on different laps must use validated progress');
  assert.match(multiLapRank.ahead,/第 1 \/ 4 名/);
  assert.equal(multiLapRank.hidden,true,'A legacy pose cannot determine a rank on overlapping laps');
  if (drive) {
    console.log('[7/7] Auto-driving four laps with accelerated fixed physics steps...');
    for (const page of pages) {
      await wait(page, "__FORZERO__.race.phase==='race'", 'actual race start');
      await page.evalPage(`(()=>{
        const f=__FORZERO__, race=f.race;
        let nearest=0,steps=0;const advance=race.advance;
        window.qaLap=null;
        race.advance=function(dt,input){
          if(this.phase!=='race')return advance.call(this,dt,input);
          for(let j=0;j<60 && this.phase==='race' && steps<55000;j++,steps++){
            const rider=this.rider,event=this.event,rows=event.path.rows,p=rider.position;
            let error=Infinity;
            for(let k=Math.max(0,nearest-7);k<Math.min(rows.length,nearest+76);k++){
              const q=rows[k].p,d=(p[0]-q[0])**2+(p[2]-q[2])**2;if(d<error){error=d;nearest=k;}
            }
            const distance=rows[nearest].distance;
            const target=f.along(event.path,Math.min(event.length,distance+f.clamp(1.7+rider.speed*.29,1.85,5.8)));
            const turn=Math.atan2(target[2]-p[2],target[0]-p[0])-rider.heading-rider.yawRate*.085;
            const angle=Math.atan2(Math.sin(turn),Math.cos(turn));
            let goal=Math.min(10.8,f.plannedSpeed(event,distance+.65)*1.04);
            if(Math.abs(angle)>.38)goal=Math.min(goal,7.9);if(Math.abs(angle)>.75)goal=Math.min(goal,5.4);
            advance.call(this,1/110,{gas:rider.speed<goal-.06,brake:rider.speed>goal+.32,left:angle<-.025,right:angle>.025,sprint:false});
          }
          if(this.phase==='done'||steps>=55000){window.qaLap={phase:this.phase,steps,elapsed:this.elapsed,
            gates:this.event.gates.length,splits:Array.from(this.splits),rejoined:Number.isFinite(this.lastRejoin)};delete this.advance;}
        };
      })()`);
    }
    for (const page of pages) {
      await wait(page, 'Boolean(window.qaLap)', 'accelerated lap', 180_000);
      const lap = await page.evalPage('window.qaLap');
      assert.equal(lap.phase, 'done', JSON.stringify(lap));
      assert.equal(lap.splits.length, lap.gates, JSON.stringify(lap));
      assert.ok(lap.splits.every((time, index) => index === 0 || time > lap.splits[index - 1]));
      assert.equal(lap.rejoined, false, JSON.stringify(lap));
      console.log('Driven lap:', JSON.stringify(lap));
    }
  } else {
    console.log('[7/7] Submitting simulated finish times and checking ranking...');
    for (let i = 0; i < pages.length; i++) {
      const result = await pages[i].evalPage(`(async()=>{const s=__FORZERO__.onlineRoom;const r=await fetch(s.url+'/command?id='+s.id,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+s.token},body:JSON.stringify({action:'finish',round:s.state.round.number,roundId:s.state.round.id,ms:${35000 + i * 1000}})});return {ok:r.ok,status:r.status}})()`);
      assert.equal(result.ok, true, `simulated finish ${i}: HTTP ${result.status}`);
    }
  }
  for (const page of pages) await wait(page, "__FORZERO__.onlineRoom.state.phase==='done'", 'race settlement', 180_000);
  const standing = await pages[0].evalPage('__FORZERO__.onlineRoom.state.standing.map(p=>({id:p.id,finishes:p.finishes,points:p.points}))');
  assert.equal(standing.length, 4);
  assert.ok(standing.every(p => p.finishes === 1));
  if (!drive) assert.deepEqual(standing.map(p => p.points), [4, 3, 2, 1]);
  console.log(drive ? 'PASS: four accelerated driven laps and room settlement' : 'PASS: four simulated finish submissions and ranking');

  const weather = original.weather==='rain' ? 'day' : 'rain';
  await pages[0].evalPage(`(()=>{const select=__FORZERO__.ui.onlineLobbyWeather;select.value=${JSON.stringify(weather)};select.dispatchEvent(new Event('change'))})()`);
  for (const page of pages) {
    await wait(page, `__FORZERO__.onlineRoom.state.phase==='lobby' && __FORZERO__.onlineRoom.state.weather===${JSON.stringify(weather)}`, 'BO1 rematch lobby');
    await wait(page, '!__FORZERO__.ui.onlineReady.disabled', 'rematch ready button');
    await page.evalPage('__FORZERO__.ui.onlineReady.click()');
    await wait(page, '__FORZERO__.onlineRoom.state.players.find(p=>p.id===__FORZERO__.onlineRoom.id)?.ready', 'rematch ready update');
  }
  await wait(pages[0], '!__FORZERO__.ui.onlineStart.disabled', 'rematch start button');
  await pages[0].evalPage('__FORZERO__.ui.onlineStart.click()');
  for (const page of pages) {
    await wait(page, "__FORZERO__.onlineRoom.state.phase==='race' && __FORZERO__.race.phase==='race' && __FORZERO__.onlineRoom.startedRound===__FORZERO__.onlineRoom.state.round.id && [...__FORZERO__.onlineRoom.peers.values()].every(p=>p.samples.at(-1)?.round===__FORZERO__.onlineRoom.startedRound)", 'same-course BO1 rematch');
    const rematch = await page.evalPage('(()=>{const s=__FORZERO__.onlineRoom.state;return {route:s.route.code,matchId:s.matchId,round:s.round}})()');
    assert.equal(rematch.route,original.route);
    assert.equal(rematch.round.number,1);
    assert.notEqual(rematch.matchId,original.matchId);
    assert.notEqual(rematch.round.id,original.roundId);
    assert.notEqual(rematch.round.poseNumber,original.poseNumber);
  }
  const staleFinish = await pages[0].evalPage(`(async()=>{const s=__FORZERO__.onlineRoom;const r=await fetch(s.url+'/command?id='+s.id,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+s.token},body:JSON.stringify({action:'finish',round:1,roundId:${JSON.stringify(original.roundId)},ms:35000})});return r.ok})()`);
  assert.equal(staleFinish,false,'A delayed finish for round 1 must not settle the next match');
  console.log('PASS: same-course BO1 rematch restarted every browser and rejected a previous finish');
} finally {
  if (browser) await browser.close();
  server.closeAllConnections?.();
  await new Promise(resolve => server.close(resolve));
}
