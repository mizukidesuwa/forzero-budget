import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { createRideServer, loadStaticAssets } from '../online/server.mjs';

const v14Dir = resolve('szu-litchi-loop-1.4.0');
const v15Dir = resolve('szu-litchi-loop-1.5.0');
const assets14 = await loadStaticAssets(pathToFileURL(v14Dir + '/'));
const assets15 = await loadStaticAssets(pathToFileURL(v15Dir + '/'));

const srv14 = createRideServer({ assets: assets14, iceServers: [] });
const srv15 = createRideServer({ assets: assets15, soundDir: join(v15Dir, 'sound'), iceServers: [] });
srv14.listen(0, '127.0.0.1');
srv15.listen(0, '127.0.0.1');
await Promise.all([once(srv14, 'listening'), once(srv15, 'listening')]);
const url14 = `http://127.0.0.1:${srv14.address().port}/`;
const url15 = `http://127.0.0.1:${srv15.address().port}/`;

// Also test custom soundDir with an actual tiny WAV file
const tmpSoundDir = mkdtempSync(join(tmpdir(), 'litchi-sound-'));
writeFileSync(join(tmpSoundDir, 'bell.wav'), Buffer.from('RIFF$\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x44\xac\x00\x00\x88\x58\x01\x00\x02\x00\x10\x00data\x00\x00\x00\x00', 'binary'));
const srvSound = createRideServer({ assets: assets15, soundDir: tmpSoundDir, iceServers: [] });
srvSound.listen(0, '127.0.0.1');
await once(srvSound, 'listening');

const browser = spawn(process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-pipe', '--no-sandbox', '--disable-extensions', '--no-first-run',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=987,522',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  '--user-data-dir=' + mkdtempSync(join(tmpdir(), 'litchi-v15-qa-')),
], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });

const errors = [], pending = new Map();
let reqId = 0, buf = '';
const deadline = setTimeout(() => { console.error('1.5.0 QA deadline'); process.exit(1); }, 180_000);
browser.once('error', e => { console.error(e); process.exit(1); });
browser.stdio[4].on('data', chunk => {
  buf += chunk;
  let end;
  while ((end = buf.indexOf('\0')) >= 0) {
    const ev = JSON.parse(buf.slice(0, end));
    buf = buf.slice(end + 1);
    if (ev.method === 'Runtime.exceptionThrown') errors.push(ev.params.exceptionDetails.exception?.description ?? ev.params.exceptionDetails.text);
    const cb = pending.get(ev.id);
    if (cb) { pending.delete(ev.id); cb(ev); }
  }
});

const rpc = (method, params = {}, sessionId) => new Promise((ok, fail) => {
  const id = ++reqId;
  pending.set(id, ev => ev.error ? fail(Error(ev.error.message)) : ok(ev.result));
  browser.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0');
});

async function open(name, url, hookGl = false) {
  const { browserContextId } = await rpc('Target.createBrowserContext');
  const { targetId } = await rpc('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await rpc('Target.attachToTarget', { targetId, flatten: true });
  await rpc('Runtime.enable', {}, sessionId);
  await rpc('Page.enable', {}, sessionId);
  if (hookGl) {
    await rpc('Page.addScriptToEvaluateOnNewDocument', {
      source: `window.__glStats = { createBuffer: 0, deleteBuffer: 0 };
        const origCreate = WebGL2RenderingContext.prototype.createBuffer;
        const origDelete = WebGL2RenderingContext.prototype.deleteBuffer;
        WebGL2RenderingContext.prototype.createBuffer = function() { window.__glStats.createBuffer++; return origCreate.apply(this, arguments); };
        WebGL2RenderingContext.prototype.deleteBuffer = function() { window.__glStats.deleteBuffer++; return origDelete.apply(this, arguments); };`
    }, sessionId);
  }
  const nav = await rpc('Page.navigate', { url }, sessionId);
  assert.ok(!nav.errorText, nav.errorText);
  const run = async expr => {
    const r = await rpc('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  async function wait(expr) {
    const until = Date.now() + 26_000;
    do { if (await run(expr)) return; await sleep(120); } while (Date.now() < until);
    throw Error(`${name} timed out: ${expr} errors=${JSON.stringify(errors)}`);
  }
  await wait("typeof ready!=='undefined'&&ready");
  await run(`ui.driverName.value=${JSON.stringify(name)};commitDriverName();`);
  return { run, wait, targetId };
}

try {
  // 1. Custom sound/ folder manifest test (empty vs custom wav)
  const emptyManifest = await (await fetch(`${url15}sound/manifest.json`)).json();
  assert.deepEqual(emptyManifest, { files: {} });
  const soundPort = srvSound.address().port;
  const customManifest = await (await fetch(`http://127.0.0.1:${soundPort}/sound/manifest.json`)).json();
  assert.equal(customManifest.files.bell, '/sound/bell.wav');
  const wavRes = await fetch(`http://127.0.0.1:${soundPort}/sound/bell.wav`);
  assert.equal(wavRes.status, 200);
  assert.equal(wavRes.headers.get('content-type'), 'audio/wav');
  console.log('[OK] Custom sound/ folder: empty manifest silent, custom bell.wav discovered and served.');

  // 2. Performance & WebGL Buffer Count Benchmark: 1.4.0 vs 1.5.0 (day / sunset / night / rain)
  const p14 = await open('perf14', url14, true);
  const p15 = await open('perf15', url15, true);
  await p14.run("preferences.aa='fxaa';preferences.resolution='auto';");
  await p15.run("preferences.aa='fxaa';preferences.resolution='auto';");

  async function bench(page, weather) {
    if (weather) await page.run(`setActiveWeather(${JSON.stringify(weather)});`);
    return page.run(`(async () => {
      const gl = canvas.getContext('webgl2');
      const px = new Uint8Array(4);
      const beforeBufs = window.__glStats.createBuffer;
      const runFrames = n => new Promise(res => {
        let i = 0; const times = [];
        function step() {
          const t0 = performance.now();
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          const t1 = performance.now();
          times.push(t1 - t0);
          if (++i < n) requestAnimationFrame(step);
          else res(times);
        }
        requestAnimationFrame(step);
      });
      await runFrames(8);
      const afterWarmup = window.__glStats.createBuffer;
      const tStart = performance.now();
      await runFrames(24);
      const tEnd = performance.now();
      const afterBench = window.__glStats.createBuffer;
      return {
        avgFrameMs: +((tEnd - tStart) / 24).toFixed(2),
        totalBuffers: afterBench,
        leakedBuffersDuringRender: afterBench - afterWarmup,
        liveBuffers: afterBench - window.__glStats.deleteBuffer,
      };
    })()`);
  }

  const b14 = await bench(p14, null);
  const b15Day = await bench(p15, 'day');
  const b15Sunset = await bench(p15, 'sunset');
  const b15Night = await bench(p15, 'night');
  const b15Rain = await bench(p15, 'rain');
  assert.equal(b15Day.leakedBuffersDuringRender, 0);
  assert.equal(b15Sunset.leakedBuffersDuringRender, 0);
  assert.equal(b15Night.leakedBuffersDuringRender, 0);
  assert.equal(b15Rain.leakedBuffersDuringRender, 0);
  assert.equal(b15Day.totalBuffers, b14.totalBuffers, `Buffer count mismatch: 1.4=${b14.totalBuffers} 1.5=${b15Day.totalBuffers}`);
  console.log('[OK] Performance & GPU buffers (SwiftShader 987x522 FXAA):', JSON.stringify({
    v14_day: b14, v15_day: b15Day, v15_sunset: b15Sunset, v15_night: b15Night, v15_rain: b15Rain
  }));

  // 3. Weather physics (wet grip + traction/control advantage) & High-Risk Shortcuts
  const physicsChecks = await p15.run(`(() => {
    setActiveWeather('day');
    const stockDay = makeCyclist(race.event, buildBike('race','long','power'), 'bike');
    stockDay.speed = 11.5;
    for (let i = 0; i < 20; i++) moveCyclist(stockDay, {gas:false,brake:true,left:true,right:false,sprint:false}, PHYSICS_STEP, true);
    const dayBrakeSpeed = stockDay.speed, dayYaw = Math.abs(stockDay.yawRate);

    setActiveWeather('rain');
    const raceRain = makeCyclist(race.event, buildBike('race','long','power'), 'bike');
    raceRain.speed = 11.5;
    for (let i = 0; i < 20; i++) moveCyclist(raceRain, {gas:false,brake:true,left:true,right:false,sprint:false}, PHYSICS_STEP, true);
    const tractionRain = makeCyclist(race.event, buildBike('traction','stock','control'), 'bike');
    tractionRain.speed = 11.5;
    for (let i = 0; i < 20; i++) moveCyclist(tractionRain, {gas:false,brake:true,left:true,right:false,sprint:false}, PHYSICS_STEP, true);

    setActiveWeather('day');
    const szuCutOn = surfaceAt(1.9, 118.2, true) && surfaceAt(-13.2, 100.8, true);
    const szuCutOffGrass = !surfaceAt(6.2, 119.0, true);
    const szuPostBlocks = !safeToRide(6.5, 122.5, true);
    return { dayBrakeSpeed, raceRainSpeed: raceRain.speed, dayYaw, raceRainYaw: Math.abs(raceRain.yawRate),
      tractionRainYaw: Math.abs(tractionRain.yawRate), szuCutOn, szuCutOffGrass, szuPostBlocks,
      soundLoadedCount: customSoundMap.size };
  })()`);
  assert.ok(physicsChecks.raceRainSpeed > physicsChecks.dayBrakeSpeed, 'Rain should reduce braking deceleration');
  assert.ok(physicsChecks.tractionRainYaw > physicsChecks.raceRainYaw, 'Traction+control should hold higher cornering yaw in rain');
  assert.equal(physicsChecks.szuCutOn, true);
  assert.equal(physicsChecks.szuCutOffGrass, true);
  assert.equal(physicsChecks.szuPostBlocks, true);
  assert.equal(physicsChecks.soundLoadedCount, 0);
  console.log('[OK] Wet weather physics, SZU Dujuan high-risk shortcuts, and silent sound/ default passed.');

  // 3b. All-vehicle balanced tuning (5-slot bike + 3-slot trail/ebike/chair, strict nominal speed caps)
  const tuningChecks = await p15.run(`(() => {
    const aero = buildBike('stock', 'stock', 'stock', 'aero', 'stock');
    const agile = buildBike('stock', 'stock', 'stock', 'agile', 'stock');
    const burst = buildBike('stock', 'stock', 'stock', 'stock', 'burst');
    const endur = buildBike('stock', 'stock', 'stock', 'stock', 'endurance');
    const capViolations = [];
    for (const [veh, slots] of Object.entries(vehicleTuningChoices)) {
      const cap = vehicleChoices[veh].roadSpeed;
      for (const a of Object.keys(slots[0].options)) {
        for (const b of Object.keys(slots[1].options)) {
          for (const c of Object.keys(slots[2].options)) {
            const parts = { [slots[0].key]: a, [slots[1].key]: b, [slots[2].key]: c };
            const t = buildVehicleTuning(veh, parts);
            if (t.roadSpeed > cap + 1e-9) capViolations.push({ veh, parts, roadSpeed: t.roadSpeed, cap });
          }
        }
      }
    }
    const trailMud = buildVehicleTuning('trail', { tyres: 'mud', gears: 'climb', suspension: 'soft' });
    const trailRoad = buildVehicleTuning('trail', { tyres: 'road', gears: 'speed', suspension: 'stiff' });
    // Test Garage UI switching between bike (5 slots) and trail (3 slots)
    ui.bikeButton.click();
    const bikeVisible = !ui.bikeParts.hidden && ui.motorTuning.hidden;
    ui.vehiclePicker.value = 'trail';
    ui.vehiclePicker.dispatchEvent(new Event('change'));
    const motorVisible = ui.bikeParts.hidden && !ui.motorTuning.hidden;
    ui.vehSlot0.value = 'mud';
    ui.vehSlot0.dispatchEvent(new Event('change'));
    const savedTrailTyre = vehicleTunings.trail.tyres;
    const riderTuningTyre = race.rider.tuning?.parts?.tyres;
    ui.vehiclePicker.value = 'bike';
    ui.vehiclePicker.dispatchEvent(new Event('change'));
    ui.settingsContinue.click();
    return {
      aeroFaster: aero.roadSpeed > agile.roadSpeed && agile.roadGrip > aero.roadGrip && agile.steerScale > aero.steerScale,
      burstVsEndur: burst.sprintSpeed > endur.sprintSpeed && burst.sprintDrain > endur.sprintDrain && endur.sprintRecover > burst.sprintRecover,
      trailTradeoff: trailMud.grassSpeed > trailRoad.grassSpeed && trailMud.force > trailRoad.force && trailRoad.roadSpeed >= trailMud.roadSpeed && trailRoad.roadGrip > trailMud.roadGrip,
      capViolations, bikeVisible, motorVisible, savedTrailTyre, riderTuningTyre,
    };
  })()`);
  assert.equal(tuningChecks.aeroFaster, true);
  assert.equal(tuningChecks.burstVsEndur, true);
  assert.equal(tuningChecks.trailTradeoff, true);
  assert.deepEqual(tuningChecks.capViolations, []);
  assert.equal(tuningChecks.bikeVisible, true);
  assert.equal(tuningChecks.motorVisible, true);
  assert.equal(tuningChecks.savedTrailTyre, 'mud');
  assert.equal(tuningChecks.riderTuningTyre, 'mud');
  console.log('[OK] All-vehicle balanced tuning (5-slot bike + 3-slot trail/ebike/chair, strict speed caps) passed.');

  // 4. Overview Map free-ride sector practice, trajectory comparison & sidebar review
  await p15.run(`ui.coursePicker.value='lakes';ui.coursePicker.dispatchEvent(new Event('change'));
    openMap(true);`);
  assert.equal(await p15.run('mapOpen && !ui.stationList.hidden && ui.stationList.querySelectorAll(".practice-btn").length >= 3'), true, 'Free-ride map should expose sidebar sector practice buttons');
  await p15.run('ui.stationList.querySelectorAll(".practice-btn")[0].click();');
  assert.equal(await p15.run('!mapOpen && race.practice !== null && race.phase === "count" && race.nextGate === 1'), true, 'Clicking free-ride map sidebar practice button should launch practice');
  await p15.run('exitSectorPractice();');

  const drive = readFileSync(new URL('../rounds/drive-path.js', import.meta.url), 'utf8')
    .replace('const trial=new TimeTrial(event);', 'const trial=race;');
  await p15.run(`startTrial();
    (() => { ${drive}; const res = rideTest(race.event, true, 250); if (res.phase !== 'done') throw Error('Full run failed'); })();
    updateHud();`);
  const fullBest = await p15.run('race.best');
  assert.ok(fullBest > 10_000);
  assert.equal(await p15.run('!ui.reviewMapButton.hidden'), true);
  await p15.run('ui.reviewMapButton.click();');
  assert.equal(await p15.run('mapOpen && !ui.mapCompare.hidden && showMapComparison && ui.callout.hidden'), true, 'Finish callout must hide while viewing trajectory overview map');
  assert.equal(await p15.run('!ui.stationList.hidden && ui.stationList.querySelectorAll(".map-sector-delta").length >= 3 && ui.stationList.querySelectorAll(".practice-btn").length >= 3'), true, 'Map sidebar should display sector delta badges and practice buttons after finish');
  await p15.run('openMap(false);');
  assert.equal(await p15.run('!mapOpen && !ui.callout.hidden'), true, 'Finish callout should reappear when returning from map');
  const practiceBtnCount = await p15.run('ui.sectorRows.querySelectorAll(".practice-btn").length');
  assert.ok(practiceBtnCount >= 3, 'Expected sector practice buttons');
  await p15.run('ui.sectorRows.querySelectorAll(".practice-btn")[1].click();');
  assert.ok(await p15.run('race.practice !== null && race.phase === "count" && race.nextGate === 2'));
  await p15.run(`(() => {
    const startGate = race.practice.fromGate, endGate = race.practice.toGate;
    while (race.phase === 'count') race.step(neutralDrive);
    if (!(race.rider.speed > 4)) throw Error('Rolling entry speed missing: ' + race.rider.speed);
    for (let t = 0; t < 3600 && race.phase === 'race'; t++) {
      const target = race.event.gates[race.nextGate].p;
      const dx = target[0] - race.rider.position[0], dz = target[2] - race.rider.position[2];
      const desired = Math.atan2(dz, dx);
      const diff = Math.atan2(Math.sin(desired - race.rider.heading), Math.cos(desired - race.rider.heading));
      race.step({ gas: true, brake: false, left: diff < -0.06, right: diff > 0.06, sprint: false });
    }
    if (race.phase !== 'done') throw Error('Sector practice did not finish');
    updateHud();
  })()`);
  assert.equal(await p15.run('race.best'), fullBest, 'Sector practice must not overwrite full-course PB');
  assert.equal(await p15.run('ui.friendExport.hidden'), true, 'Sector practice must not offer full ghost export');
  assert.equal(await p15.run('!ui.practiceExit.hidden'), true);
  await p15.run('ui.practiceExit.click();');
  assert.equal(await p15.run('race.practice === null && race.phase === "free"'), true);
  console.log('[OK] Minimap trajectory comparison & isolated rolling-start sector practice passed.');

  // 5. Multiplayer 1.5.0: vehicleRule, weather sync, lobby course/campus/seed switch, in-lobby garage, 3D nameplates, live rank, drafting
  const host = await open('房主甲', url15);
  const guest = await open('客机乙', url15);
  await host.run(`ui.onlineButton.click();
    ui.onlineVehicleRule.value='trail';
    ui.onlineWeather.value='rain';
    ui.onlineCreate.click();`);
  await host.wait("onlineRoom && !onlineBusy && onlineRoom.course");
  const code = await host.run('onlineRoom.state.code');
  await guest.run(`ui.onlineButton.click();
    ui.onlineCodeInput.value=${JSON.stringify(code)};
    ui.onlineJoinForm.requestSubmit();`);
  await Promise.all([host, guest].map(p => p.wait('onlineRoom?.state.players.length===2 && onlineDataLinks(onlineRoom)===1')));
  assert.equal(await guest.run('activeWeatherId'), 'rain');
  assert.equal(await guest.run('race.rider.vehicle'), 'trail');

  // Host switches in lobby to UCL square-circuit, bike rule, night weather (cross-campus without leaving room!)
  await host.run(`ui.onlineLobbyWeather.value='night';ui.onlineLobbyWeather.dispatchEvent(new Event('change'));`);
  await guest.wait("activeWeatherId==='night'");
  await host.run(`ui.onlineLobbyVehicle.value='bike';ui.onlineLobbyVehicle.dispatchEvent(new Event('change'));`);
  await guest.wait("race.rider.vehicle==='bike'");
  await host.run(`ui.onlineLobbyCampus.value='ucl';ui.onlineLobbyCampus.dispatchEvent(new Event('change'));`);
  await Promise.all([host, guest].map(p => p.wait("activeCampus==='ucl' && onlineRoom?.course?.campus==='ucl' && !onlineBusy")));

  // Verify UCL IOE west high-risk shortcut while in UCL
  const uclCut = await host.run('({ on: surfaceAt(183.4, 245.5), postBlocks: !canRideUcl(180.4, 246.4) })');
  assert.deepEqual(uclCut, { on: true, postBlocks: true });

  // Host opens Garage from lobby, switches paint to 'red' and custom 5-slot bike parts, closes garage -> synced to guest!
  await host.run(`ui.onlineGarage.click();
    ui.bikePaint.value='red';ui.bikePaint.dispatchEvent(new Event('change'));
    [ui.bikeTyres.value,ui.bikeGears.value,ui.bikeBrakes.value,ui.bikeFrame.value,ui.bikeSprint.value]=['traction','short','power','aero','burst'];
    ui.bikeSprint.dispatchEvent(new Event('change'));
    ui.settingsContinue.click();`);
  await guest.wait("onlineRoom.state.players.some(p=>p.name==='房主甲' && p.paint==='red' && p.bike?.tyres==='traction' && p.bike?.frame==='aero' && p.bike?.sprint==='burst')");
  assert.match(await guest.run('ui.onlinePlayers.textContent'), /越野胎\/.*低齿比\/强力刹车\/气动车架\/爆发冲刺/);

  // Start race -> verify live rank HUD, 3D nameplate, painted remote rider, and drafting!
  await Promise.all([host, guest].map(p => p.run('ui.onlineReady.click()')));
  await host.wait('!ui.onlineStart.disabled');
  await host.run('ui.onlineStart.click()');
  await Promise.all([host, guest].map(p => p.wait("race.phase==='race' && onlineRiderPoses(performance.now()).length===1")));
  const liveOnline = await guest.run(`(() => {
    const peer = [...onlineRoom.peers.values()][0];
    for (const s of peer.samples) s.speed = 9.0;
    const remote = onlineRiderPoses(performance.now())[0];
    const rank = onlineRaceRank(performance.now());
    const testRider = { ...race.rider, vehicle: 'bike', paved: true, speed: 9.0,
      position: [remote.position[0] - Math.cos(remote.heading) * 5.0, remote.position[1], remote.position[2] - Math.sin(remote.heading) * 5.0],
      heading: remote.heading };
    const drafting = onlineDraftingAt(testRider, performance.now());
    return { remotePaint: remote.paint, remoteName: remote.name, rankText: ui.onlineRank.textContent,
      tagText: ui.onlineTag0.textContent, tagVisible: !ui.onlineTag0.hidden, drafting, rank };
  })()`);
  assert.equal(liveOnline.remotePaint, 'red');
  assert.equal(liveOnline.remoteName, '房主甲');
  assert.match(liveOnline.rankText, /第 [12] \/ 2 名/);
  assert.equal(liveOnline.tagText, '房主甲');
  assert.equal(liveOnline.drafting, true);

  await Promise.all([host, guest].map(p => p.run('ui.onlineLeave.click()')));
  assert.equal(await guest.run('activeWeatherId'), 'day', 'Leaving room should restore local weather');
  assert.deepEqual(errors, []);
  console.log('[OK] Multiplayer 1.5.0: lobby vehicleRule/weather/campus switch, in-lobby garage sync, 3D nameplates, live rank HUD, drafting, and UCL IOE shortcut passed.');
} finally {
  clearTimeout(deadline);
  browser.kill();
  for (const s of [srv14, srv15, srvSound]) { s.closeAllConnections(); s.close(); }
}
