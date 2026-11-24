import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { once } from 'node:events';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { openTestBrowser } from './stage6-browser.mjs';

// Real localhost HTTP, four isolated browser profiles and real WebRTC data
// channels. --drive uses accelerated fixed-step auto-driving; without it finish
// times are simulated API submissions.
const drive = process.argv.includes('--drive');
const desktop = resolve(process.env.FORZERO_RELEASE_DIR ??
  (existsSync('forzero-budget-2.1.1/index.html') ? 'forzero-budget-2.1.1' : '.'));
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
  browser = await openTestBrowser();
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
        const state = await page.evalPage(`(()=>({status:document.getElementById('onlineStatus')?.textContent??'',
          phase:globalThis.onlineRoom?.state?.phase??null,players:globalThis.onlineRoom?.state?.players?.length??0,
          peers:globalThis.onlineRoom?[...onlineRoom.peers.values()].map(p=>[p.pc.connectionState,p.channel?.readyState??null]):[]}))()`);
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
    await wait(page, "typeof ready!=='undefined'&&ready", 'game initialization');
    pages.push(page);
  }
  console.log('[3/7] Creating the test room...');
  await pages[0].evalPage("ui.onlineButton.click();ui.onlineTuningTime.value='0';ui.onlineCreate.click()");
  await wait(pages[0], 'onlineRoom&&onlineRoom.course&&onlineRoom.clockReady', 'create room');
  const code = await pages[0].evalPage('onlineRoom.state.code');
  assert.match(code, /^[A-Z0-9]{8}$/);
  for (const page of pages.slice(1)) {
    console.log(`[4/7] Joining participant ${pages.indexOf(page) + 1}/4...`);
    await page.evalPage(`ui.onlineButton.click();ui.onlineCodeInput.value=${JSON.stringify(code)};ui.onlineJoinForm.requestSubmit()`);
    await wait(page, 'onlineRoom&&onlineRoom.course&&onlineRoom.clockReady', 'join room');
  }
  console.log('[5/7] Waiting for 12 WebRTC channels (up to two minutes)...');
  for (const page of pages) {
    await wait(page, `onlineRoom.state.protocol===3 && onlineRoom.state.players.length===4 && onlineRoom.peers.size===3 &&
      [...onlineRoom.peers.values()].every(p=>p.pc.connectionState==='connected' && p.channel?.readyState==='open' && p.channel.label==='ride-v3')`, 'WebRTC peers', 120_000);
  }
  console.log('PASS: real HTTP room, protocol v3, four browsers and 12 connected peer channels');
  console.log('[5/7] Interrupting one signaling stream and checking reconnection...');
  const reconnectId = await pages[3].evalPage('onlineRoom.id');
  const stream = eventStreams.get(reconnectId);
  assert.ok(stream, 'participant event stream is missing');
  stream.destroy();
  await wait(pages[0], `onlineRoom.state.players.find(p=>p.id===${JSON.stringify(reconnectId)})?.online===false`, 'participant offline', 20_000);
  await wait(pages[3], `onlineRoom.id===${JSON.stringify(reconnectId)} && onlineRoom.events?.readyState===1`, 'participant event stream reconnect', 30_000);
  await wait(pages[0], `onlineRoom.state.players.find(p=>p.id===${JSON.stringify(reconnectId)})?.online===true`, 'participant online', 30_000);
  console.log('PASS: interrupted event stream reconnected under the same player identity');
  console.log('[6/7] Readying players and starting the race...');
  for (const page of pages) {
    await wait(page, '!ui.onlineReady.disabled', 'ready button');
    await page.evalPage('ui.onlineReady.click()');
    await wait(page, 'onlineRoom.state.players.find(p=>p.id===onlineRoom.id)?.ready', 'ready update');
  }
  await wait(pages[0], '!ui.onlineStart.disabled', 'start button');
  await pages[0].evalPage('ui.onlineStart.click()');
  for (const page of pages) await wait(page, "onlineRoom.state.phase==='race' && onlineRoom.state.round", 'race start');
  const goAt = await pages[0].evalPage('onlineRoom.state.round.goAt');
  await delay(Math.max(0, goAt - Date.now() + 250));
  for (const page of pages) {
    await wait(page, "onlineRoom.startedRound===onlineRoom.state.round.number && [...onlineRoom.peers.values()].every(p=>p.samples.length>0)", 'receive race positions', 60_000);
  }
  console.log('PASS: all four players received position packets from all three opponents');
  if (drive) {
    console.log('[7/7] Auto-driving four laps with accelerated fixed physics steps...');
    for (const page of pages) {
      await wait(page, "race.phase==='race'", 'actual race start');
      await page.evalPage(`(()=>{
        let nearest=0,steps=0;const advance=race.advance;
        window.stage6Lap=null;
        race.advance=function(dt,input){
          if(this.phase!=='race')return advance.call(this,dt,input);
          for(let j=0;j<60 && this.phase==='race' && steps<55000;j++,steps++){
            const rider=this.rider,event=this.event,rows=event.path.rows,p=rider.position;
            let error=Infinity;
            for(let k=Math.max(0,nearest-7);k<Math.min(rows.length,nearest+76);k++){
              const q=rows[k].p,d=(p[0]-q[0])**2+(p[2]-q[2])**2;if(d<error){error=d;nearest=k;}
            }
            const distance=rows[nearest].distance;
            const target=along(event.path,Math.min(event.length,distance+clamp(1.7+rider.speed*.29,1.85,5.8)));
            const turn=Math.atan2(target[2]-p[2],target[0]-p[0])-rider.heading-rider.yawRate*.085;
            const angle=Math.atan2(Math.sin(turn),Math.cos(turn));
            let goal=Math.min(10.8,plannedSpeed(event,distance+.65)*1.04);
            if(Math.abs(angle)>.38)goal=Math.min(goal,7.9);if(Math.abs(angle)>.75)goal=Math.min(goal,5.4);
            advance.call(this,1/110,{gas:rider.speed<goal-.06,brake:rider.speed>goal+.32,left:angle<-.025,right:angle>.025,sprint:false});
          }
          if(this.phase==='done'||steps>=55000){window.stage6Lap={phase:this.phase,steps,elapsed:this.elapsed,
            gates:this.event.gates.length,splits:Array.from(this.splits),rejoined:Number.isFinite(this.lastRejoin)};delete this.advance;}
        };
      })()`);
    }
    for (const page of pages) {
      await wait(page, 'Boolean(window.stage6Lap)', 'accelerated lap', 180_000);
      const lap = await page.evalPage('window.stage6Lap');
      assert.equal(lap.phase, 'done', JSON.stringify(lap));
      assert.equal(lap.splits.length, lap.gates, JSON.stringify(lap));
      assert.ok(lap.splits.every((time, index) => index === 0 || time > lap.splits[index - 1]));
      assert.equal(lap.rejoined, false, JSON.stringify(lap));
      console.log('Driven lap:', JSON.stringify(lap));
    }
  } else {
    console.log('[7/7] Submitting simulated finish times and checking ranking...');
    for (let i = 0; i < pages.length; i++) {
      const result = await pages[i].evalPage(`(async()=>{const s=onlineRoom;const r=await fetch(s.url+'/command?id='+s.id,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+s.token},body:JSON.stringify({action:'finish',round:s.state.round.number,ms:${35000 + i * 1000}})});return {ok:r.ok,status:r.status}})()`);
      assert.equal(result.ok, true, `simulated finish ${i}: HTTP ${result.status}`);
    }
  }
  for (const page of pages) await wait(page, "onlineRoom.state.phase==='done'", 'race settlement', 180_000);
  const standing = await pages[0].evalPage('onlineRoom.state.standing.map(p=>({id:p.id,finishes:p.finishes,points:p.points}))');
  assert.equal(standing.length, 4);
  assert.ok(standing.every(p => p.finishes === 1));
  if (!drive) assert.deepEqual(standing.map(p => p.points), [4, 3, 2, 1]);
  console.log(drive ? 'PASS: four accelerated driven laps and room settlement' : 'PASS: four simulated finish submissions and ranking');
} finally {
  if (browser) await browser.close();
  server.closeAllConnections?.();
  await new Promise(resolve => server.close(resolve));
}
