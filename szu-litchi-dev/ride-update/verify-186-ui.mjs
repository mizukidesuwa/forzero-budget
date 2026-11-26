import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const chrome = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const releaseDir = resolve(process.env.FORZERO_RELEASE_DIR ?? 'forzero-budget-1.9.1.1');
const mobilePage = process.env.FORZERO_MOBILE_HTML ?? 'forzero-budget-mobile-1.9.1.1.html';
const inProcessHttp = process.argv.includes('--http-in-process');
const testOrigin = 'http://127.0.0.1:8788';
let desktopPage = join(releaseDir,'index.html'), app;
if(process.argv.includes('--http') || inProcessHttp) {
  const { createAppShell, loadStaticAssets } = await import(pathToFileURL(join(releaseDir, 'server.mjs')).href);
  const assets = await loadStaticAssets(pathToFileURL(releaseDir + '/'));
  const saveDir = mkdtempSync(join(tmpdir(), 'litchi-ui186-'));
  app = createAppShell({
    assets,
    saveDir,
    iceServers: [],
    roomPort: 0,
    roomHost: '127.0.0.1',
    allowPortFallback: false,
    idleMs: 120_000,
    bootTimeoutMs: 30_000,
  });
  if (inProcessHttp) {
    desktopPage = testOrigin + '/';
  } else {
    app.server.listen(0, '127.0.0.1');
    await once(app.server, 'listening');
    desktopPage = `http://127.0.0.1:${app.server.address().port}/`;
  }
}

const browser = spawn(chrome, [
  '--headless=new', '--remote-debugging-pipe', '--no-sandbox', '--disable-extensions', '--no-first-run',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720',
  '--user-data-dir=' + mkdtempSync(join(tmpdir(), 'litchi-ui186-chrome-')),
], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });

const errors = [], pending = new Map();
let reqId = 0, buf = '';
const deadline = setTimeout(() => { console.error('UI 186 verify timeout'); process.exit(1); }, 120_000);
browser.once('error', e => { console.error(e); process.exit(1); });
browser.stdio[4].on('data', chunk => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\0')) >= 0) {
    const msg = JSON.parse(buf.slice(0, idx));
    buf = buf.slice(idx + 1);
    if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
    }
    if (msg.method === 'Fetch.requestPaused') {
      void fulfillInProcess(msg);
    }
    const cb = pending.get(msg.id);
    if (cb) { pending.delete(msg.id); cb(msg); }
  }
});

async function fulfillInProcess({ params, sessionId }) {
  let method = 'Fetch.fulfillRequest', response;
  try {
    response = await serveInProcess(params);
  } catch (error) {
    errors.push(String(error));
    method = 'Fetch.failRequest';
    response = { requestId: params.requestId, errorReason: 'Failed' };
  }
  try {
    await rpc(method, response, sessionId);
  } catch (error) {
    // Closing the test context cancels pending save and keepalive requests.
    if (!/Session with given id not found|Invalid InterceptionId|Target closed/.test(error.message)) {
      errors.push(String(error));
    }
  }
}

function serveInProcess({ requestId, request }) {
  const url = new URL(request.url);
  assert.equal(url.origin, testOrigin);
  const req = Readable.from(request.postData ? [Buffer.from(request.postData)] : []);
  Object.assign(req, {
    method: request.method,
    url: url.pathname + url.search,
    headers: Object.fromEntries(Object.entries(request.headers).map(([key, value]) => [key.toLowerCase(), value])),
  });
  const chunks = [];
  const res = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk);
      callback();
      if (url.pathname === '/app/keepalive') queueMicrotask(() => res.end());
    },
  });
  let responseCode, responseHeaders;
  res.writeHead = (status, headers) => {
    responseCode = status;
    responseHeaders = Object.entries(headers).map(([name, value]) => ({ name, value: String(value) }));
    return res;
  };
  res.flushHeaders = () => {};
  const completed = once(res, 'finish').then(() => ({
    requestId, responseCode, responseHeaders, body: Buffer.concat(chunks).toString('base64'),
  }));
  app.server.emit('request', req, res);
  return completed;
}

function rpc(method, params = {}, sessionId) {
  return new Promise((res, rej) => {
    const id = ++reqId;
    pending.set(id, e => e.error ? rej(Error(e.error.message)) : res(e.result));
    browser.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0');
  });
}

async function openPage(pathOrUrl, { width = 1280, height = 720, mobile = false } = {}) {
  const { browserContextId } = await rpc('Target.createBrowserContext');
  const { targetId } = await rpc('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await rpc('Target.attachToTarget', { targetId, flatten: true });
  await rpc('Runtime.enable', {}, sessionId);
  await rpc('Page.enable', {}, sessionId);
  await rpc('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: mobile ? 2 : 1, mobile,
  }, sessionId);
  if (mobile) await rpc('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, sessionId);
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : pathToFileURL(resolve(pathOrUrl)).href;
  if (inProcessHttp && url.startsWith(testOrigin)) {
    await rpc('Fetch.enable', { patterns: [{ urlPattern: testOrigin + '/*' }] }, sessionId);
  }
  const navigation = await rpc('Page.navigate', { url }, sessionId);
  assert.ok(!navigation.errorText, navigation.errorText);
  const evalPage = async expression => {
    const r = await rpc('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  let started = false;
  for (let i = 0; i < 120; i++) {
    started=await evalPage("typeof ready!=='undefined'&&ready");
    if (started) break;
    await sleep(150);
  }
  assert.ok(started, `Game failed to start at ${url}: ${errors.join('\n') || await evalPage('document.title')}`);
  const touch = (type, touchPoints) => rpc('Input.dispatchTouchEvent', { type, touchPoints }, sessionId);
  const close = () => rpc('Target.closeTarget', { targetId });
  return { evalPage, touch, close };
}

function overlaps(a, b, tol = 2) {
  return a.right - tol > b.left && b.right - tol > a.left && a.bottom - tol > b.top && b.bottom - tol > a.top;
}

try {
  // 1. Desktop test: HUD slimming, surface info, posture badges above speedometer, guide secondary menu, freeRide Option 1
  const desk = await openPage(desktopPage);
  try {
    const deskRes = await desk.evalPage(`(() => {
      const noCadence = !document.getElementById('bikeCadence') && !('bikeCadence' in ui);
      const barTop = document.querySelector('.stage-controls').querySelectorAll('button').length;
      const freeHiddenInitially = ui.freeRide.hidden;
      openSettings('bike');
      const workshop = ['trail','ebike','chair','bike'].map(vehicle => {
        ui.vehiclePicker.value=vehicle;
        ui.vehiclePicker.dispatchEvent(new Event('change'));
        const bicycle=vehicle==='bike', panel=bicycle?ui.bikeParts:ui.motorTuning;
        const meters=bicycle?ui.bikeAbility:ui.vehAbility;
        const top=bicycle?ui.bikeTopSpeed:ui.vehTopSpeed;
        const gravel=bicycle?ui.bikeGravel:ui.vehGravel;
        const grass=bicycle?ui.bikeGrass:ui.vehGrass;
        const vehicleShown=race.rider.vehicle===vehicle&&!panel.hidden&&ui.settingsTitle.textContent==='车库';
        const sharedStyle=panel.querySelector('.workshop-speeds')&&panel.querySelector('.workshop-group[open]');
        const speedOrder=parseFloat(top.textContent)>parseFloat(gravel.textContent)&&parseFloat(gravel.textContent)>parseFloat(grass.textContent);
        const before=meters.children[1].querySelector('meter').value;
        if(!bicycle) {
          ui.vehSlot0.value={trail:'mud',ebike:'grip',chair:'outdoor'}[vehicle];
          ui.vehSlot0.dispatchEvent(new Event('change'));
        }
        return Boolean(vehicleShown&&sharedStyle&&speedOrder&&(bicycle||meters.children[1].querySelector('meter').value>before));
      });
      const choose=(select,value)=>{
        select.value=value;select.dispatchEvent(new Event('change'));
      };
      choose(ui.budgetPicker,'400');
      choose(ui.bikeTyres,'race');
      choose(ui.bikeFrame,'aero');
      ui.budgetHighlight.click();
      const budgetUI=ui.budgetReadout.textContent.includes('超额 ¥240')&&ui.bikeFrame.dataset.overBudget==='true';
      choose(ui.bikeTyres,'stock');
      choose(ui.bikeFrame,'stock');
      choose(ui.budgetPicker,'open');
      ui.settingsContinue.click();

      // Test posture badges above speedometer & no redundant grip text
      const speedRect = document.querySelector('.speedometer').getBoundingClientRect();
      Object.assign(race.rider, { posture: 'cruise', drafting: false, paved: true, surfaceKind: 'paved' });
      updateHud();
      const cruisePostureHidden = ui.bikePosture.hidden;
      const freeSurface = ui.surfaceType.textContent;

      Object.assign(race.rider, { posture: 'tuck', drafting: true, slip: 0.35 });
      updateHud();
      const tuckVisible = !ui.bikePosture.hidden && ui.bikePosture.textContent === '伏身破风';
      const draftVisible = !ui.draftPill.hidden && ui.draftPill.textContent === '尾流破风';
      const badgesRect = document.getElementById('speedBadges').getBoundingClientRect();
      const badgesAboveSpeed = badgesRect.bottom <= speedRect.top + 1;
      const slipSurface = ui.surfaceType.textContent; // Must NOT say 抓地接近上限 / 路面抓地

      // Check UCL street name & Shunde mountain/bridge in free mode
      const fNan = courseFrame(openStreets[0].path, 120).p;
      race.rider.position = [fNan[0], ROAD_Y, fNan[2]];
      race.rider.paved = true;
      updateHud();
      const nanhaiSurface = ui.surfaceType.textContent;

      // Check race mode freeRide button & settingsExit
      beginTrial();
      const raceBtnVisible = !ui.freeRide.hidden && ui.freeRide.textContent === '退出比赛';
      ui.settingsButton.click();
      const settingsExitVisible = !ui.settingsExit.hidden && ui.settingsExit.textContent === '退出比赛';
      // Secondary guide toggle inside settings
      const guideBtnTextBefore = ui.settingsGuideBtn.textContent;
      ui.settingsGuideBtn.click();
      const guideVisible = !ui.guideSettings.hidden && ui.displaySettings.hidden && ui.settingsTitle.textContent === '玩法说明';
      const guideBtnTextDuring = ui.settingsGuideBtn.textContent;
      ui.settingsGuideBtn.click();
      const backToDisplay = ui.guideSettings.hidden && !ui.displaySettings.hidden && ui.settingsTitle.textContent === '设置';
      ui.settingsContinue.click();

      // Finish state -> freeRide shows 返回自由骑行 -> click returns to free & hides
      race.phase = 'done'; race.elapsed = 12345;
      updateHud();
      const doneBtnText = ui.freeRide.textContent;
      const doneBtnVisible = !ui.freeRide.hidden;
      ui.freeRide.click();
      const afterExitHidden = ui.freeRide.hidden && race.phase === 'free';
      ui.raceMode.value='team';
      beginTrial();
      const aiMenu=race.rivals.length===3;
      race.finishAt(55000);
      openMap(true);
      updateMapReplay(0);
      ui.replaySpeed.value='2';
      ui.replaySpeed.dispatchEvent(new Event('change'));
      ui.replayPlay.click();
      updateMapReplay(.25);
      const replayUI=!ui.mapReplay.hidden&&Number(ui.replaySeek.value)===500&&ui.replayDetail.textContent.includes('速度差');
      openMap(false);
      race.freeRide();
      ui.raceMode.value='solo';
      race.setBike(buildBike('glue'));
      updateHud();
      const beforeStart=!ui.soloRulesStatus.hidden&&ui.soloRulesStatus.textContent.includes('不计榜');
      beginTrial();
      const countdown=!ui.callDetail.hidden&&ui.callDetail.textContent.includes('不计榜');
      race.phase='race';
      race.elapsed=8000;
      updateHud();
      const noRaceWarning=ui.soloRulesStatus.hidden&&ui.callout.hidden&&
        !document.querySelector('#speedBadges .mod-warning');
      race.finishAt(55000);
      updateHud();
      const finishWarning=!ui.callDetail.hidden&&ui.callDetail.textContent.includes('不计榜');

      return {
        noCadence, barTop, freeHiddenInitially, workshop, budgetUI, aiMenu, replayUI, cruisePostureHidden, freeSurface,
        beforeStart,countdown,noRaceWarning,finishWarning,
        tuckVisible, draftVisible, badgesAboveSpeed, slipSurface, nanhaiSurface,
        raceBtnVisible, settingsExitVisible, guideBtnTextBefore, guideVisible,
        guideBtnTextDuring, backToDisplay, doneBtnText, doneBtnVisible, afterExitHidden,
      };
    })()`);
    assert.equal(deskRes.noCadence, true);
    assert.deepEqual(deskRes.workshop,[true,true,true,true]);
    assert.ok(deskRes.budgetUI&&deskRes.aiMenu&&deskRes.replayUI,JSON.stringify(deskRes));
    assert.ok(deskRes.beforeStart&&deskRes.countdown&&deskRes.noRaceWarning&&deskRes.finishWarning,JSON.stringify(deskRes));
    assert.equal(deskRes.freeHiddenInitially, true);
    assert.equal(deskRes.cruisePostureHidden, true);
    assert.equal(deskRes.tuckVisible, true);
    assert.equal(deskRes.draftVisible, true);
    assert.equal(deskRes.badgesAboveSpeed, true);
    assert.ok(!/路面抓地|抓地接近上限/.test(deskRes.freeSurface), deskRes.freeSurface);
    assert.ok(!/路面抓地|抓地接近上限/.test(deskRes.slipSurface), deskRes.slipSurface);
    assert.match(deskRes.nanhaiSurface, /南海大道/);
    assert.equal(deskRes.raceBtnVisible, true);
    assert.equal(deskRes.settingsExitVisible, true);
    assert.equal(deskRes.guideBtnTextBefore, '玩法说明');
    assert.equal(deskRes.guideVisible, true);
    assert.equal(deskRes.guideBtnTextDuring, '返回设置');
    assert.equal(deskRes.backToDisplay, true);
    assert.equal(deskRes.doneBtnText, '返回自由骑行');
    assert.equal(deskRes.doneBtnVisible, true);
    assert.equal(deskRes.afterExitHidden, true);
    console.log('Desktop checks passed:', deskRes);
  } finally {
    await desk.close();
  }

  // 2. Mobile portrait & landscape tests: touch sizes, L-shape layout, non-overlap, touchSize setting, slide switching, multi-touch
  for (const [width, height] of [[390, 844], [844, 390]]) {
    const mob = await openPage(mobilePage, { width, height, mobile: true });
    try {
      const rectInfo = await mob.evalPage(`(() => {
        const box = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height }; };
        const rects = {};
        for (const k of ['left','right','brake','gas','sprint']) {
          rects[k] = box(document.querySelector('[data-drive="'+k+'"]'));
        }
        const hud = {
          speed: box(document.querySelector('.speedometer')),
          mini: box(document.querySelector('.mini')),
          stage: box(document.getElementById('stage')),
        };
        // Also test touchSize setting switches: compact -> large -> standard
        const sizes = {};
        for (const sz of ['compact','large','standard']) {
          ui.settingsButton.click();
          ui.settingsTouchSize.value = sz;
          ui.settingsTouchSize.dispatchEvent(new Event('change'));
          ui.settingsContinue.click();
          const gr = document.querySelector('[data-drive="gas"]').getBoundingClientRect();
          sizes[sz] = { w: Math.round(gr.width), h: Math.round(gr.height), dataset: stage.dataset.touchSize };
        }
        const saved = JSON.parse(localStorage.getItem(PREF_KEY)).touchSize;
        return { rects, hud, sizes, saved };
      })()`);

      console.log('Mobile rectInfo', width, height, rectInfo);
      assert.equal(rectInfo.saved, 'standard');
      assert.ok(rectInfo.sizes.compact.w < rectInfo.sizes.standard.w);
      assert.ok(rectInfo.sizes.standard.w < rectInfo.sizes.large.w);
      assert.ok(rectInfo.rects.gas.w >= 70 && rectInfo.rects.gas.h >= 56, JSON.stringify(rectInfo.rects.gas));
      // L-shape check: sprint sits above gas, brake sits left of gas
      assert.ok(rectInfo.rects.sprint.bottom < rectInfo.rects.gas.top);
      assert.ok(rectInfo.rects.brake.right < rectInfo.rects.gas.left);
      // No overlap between speedometer / mini and touch buttons
      for (const k of ['left', 'right', 'brake', 'gas', 'sprint']) {
        assert.equal(overlaps(rectInfo.rects[k], rectInfo.hud.speed), false, `${width}x${height} ${k} overlaps speedometer`);
        assert.equal(overlaps(rectInfo.rects[k], rectInfo.hud.mini), false, `${width}x${height} ${k} overlaps mini`);
      }

      // Real touch slide tests:
      // A) Touch left and slide to right -> switches steering seamlessly
      const pt = name => ({
        x: (rectInfo.rects[name].left + rectInfo.rects[name].right) / 2,
        y: (rectInfo.rects[name].top + rectInfo.rects[name].bottom) / 2,
      });
      const pLeft = pt('left'), pRight = pt('right'), pGas = pt('gas'), pSprint = pt('sprint');
      await mob.touch('touchStart', [{ ...pLeft, id: 1 }]);
      assert.equal(await mob.evalPage('updateDrive().left && !updateDrive().right'), true, 'left down');
      await mob.touch('touchMove', [{ ...pRight, id: 1 }]);
      assert.equal(await mob.evalPage('!updateDrive().left && updateDrive().right'), true, 'slid to right');
      await mob.touch('touchEnd', []);
      assert.equal(await mob.evalPage('!updateDrive().left && !updateDrive().right'), true, 'released after slide');
      // B) Two-finger touch: finger 1 on right steer while finger 2 touches gas then slides up to sprint
      await mob.touch('touchStart', [{ ...pRight, id: 1 }, { ...pGas, id: 2 }]);
      assert.equal(await mob.evalPage('updateDrive().right && updateDrive().gas && !updateDrive().sprint'), true, 'multi-touch right + gas');
      await mob.touch('touchMove', [{ ...pRight, id: 1 }, { ...pSprint, id: 2 }]);
      const sprintState = await mob.evalPage('({drive:updateDrive(),touches:[...touches.entries()]})');
      assert.equal(sprintState.drive.right && sprintState.drive.gas && sprintState.drive.sprint, true, 'slid up to sprint keeping gas: ' + JSON.stringify(sprintState));
      await mob.touch('touchEnd', []);
      assert.equal(await mob.evalPage('!updateDrive().left && !updateDrive().right && !updateDrive().gas && !updateDrive().sprint'), true, 'all released');

      // C) Hit-area expansion check: tap 4px outside gas outer left-top edge inside ::after halo
      const haloPt = { x: rectInfo.rects.gas.left - 3, y: rectInfo.rects.gas.top - 3, id: 3 };
      await mob.touch('touchStart', [haloPt]);
      const haloHit = await mob.evalPage('updateDrive().gas');
      await mob.touch('touchEnd', []);
      assert.equal(haloHit, true, 'halo outer edge activates gas');

      // The same skill button stays reachable for every vehicle and touch size.
      const extraCheck = await mob.evalPage(`(() => {
        beginTrial();
        Object.assign(race.rider, { posture: 'tuck', drafting: true });
        updateHud();
        ui.settingsButton.click();
        ui.settingsTouchSize.value = 'large';
        ui.settingsTouchSize.dispatchEvent(new Event('change'));
        ui.settingsContinue.click();
        const box = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height }; };
        const sp = box(document.querySelector('.speedometer')), mn = box(document.querySelector('.mini'));
        const nx = box(document.getElementById('next')), bg = box(document.getElementById('speedBadges'));
        const ov = (a, b) => a.w > 0 && b.w > 0 && a.right - 2 > b.left && b.right - 2 > a.left && a.bottom - 2 > b.top && b.bottom - 2 > a.top;
        const hits = ['left','right','brake','gas','sprint'].filter(k => {
          const r = box(document.querySelector('[data-drive="'+k+'"]'));
          return ov(r, sp) || ov(r, mn) || ov(r, nx) || ov(r, bg);
        });
        const nextHit = ov(nx, sp) || ov(nx, mn) || ov(nx, bg);
        ui.freeRide.click();
        const skills=[];
        for(const vehicle of ['bike','trail','ebike','chair']) {
          race.setVehicle(vehicle);
          for(const size of ['compact','standard','large']) {
            preferences.touchSize=size;
            applyTouchSize();
            updateHud();
            const button=document.querySelector('[data-drive="sprint"]');
            const obstructions=['.speedometer','.mini','#next','#speedBadges'].map(selector=>box(document.querySelector(selector)));
            const controls=[...document.querySelectorAll('.touch [data-drive]')].map(box);
            skills.push({vehicle,size,label:button.textContent,width:box(button).w,energy:!ui.sprintMeter.hidden,
              overlaps:controls.some(control=>obstructions.some(obstruction=>ov(control,obstruction)))});
          }
        }
        race.setVehicle('bike');
        ui.settingsButton.click();
        ui.settingsTouchSize.value = 'standard';
        ui.settingsTouchSize.dispatchEvent(new Event('change'));
        ui.settingsContinue.click();
        return { hits, nextHit, skills };
      })()`);
      assert.deepEqual(extraCheck.hits, [], `Large touchSize overlaps HUD on ${width}x${height}: ${JSON.stringify(extraCheck)}`);
      assert.equal(extraCheck.nextHit, false, `next overlaps HUD on ${width}x${height}: ${JSON.stringify(extraCheck)}`);
      const labels={bike:'冲刺',trail:'甩尾',ebike:'超频',chair:'爆发'};
      for(const skill of extraCheck.skills) {
        assert.equal(skill.label,labels[skill.vehicle],JSON.stringify(skill));
        assert.ok(skill.width>0&&skill.energy&&!skill.overlaps,JSON.stringify(skill));
      }

      // D) Shunde mountain surface info check in free mode
      await mob.evalPage(`race.freeRide(); arriveAtStation(); ui.travel.click(); document.querySelector('[data-destination="shunde"]')?.click();`);
      for (let i = 0; i < 60; i++) {
        if (await mob.evalPage("activeCampus==='shunde'&&!pendingCampus&&ready")) break;
        await sleep(120);
      }
      const shundeSurf = await mob.evalPage(`(() => {
        const f = courseFrame(mountainUp, 160).p;
        race.rider.position = [f[0], parkHeight(f[0], f[2]) + ROAD_Y, f[2]];
        race.rider.surfaceKind = parkSurfaceKind(f[0], f[2]);
        race.rider.paved = race.rider.surfaceKind === 'paved';
        updateHud();
        return ui.surfaceType.textContent;
      })()`);
      assert.match(shundeSurf, /神步山上山道 · 碎石/);
      const puddle = await mob.evalPage(`(() => {
        const {x,z}=rainPuddleSites('shunde')[0];
        setActiveWeather('rain');
        Object.assign(race.rider,{position:[x,parkHeight(x,z)+ROAD_Y,z],paved:true,speed:4});
        race.step({gas:true,brake:false,left:false,right:false,sprint:false});
        updateHud();
        return !ui.puddleStatus.hidden;
      })()`);
      assert.ok(puddle);
      await sleep(120);

      console.log(`Mobile ${width}x${height} checks passed:`, rectInfo.sizes, shundeSurf);
    } finally {
      await mob.close();
    }
  }
  for(const [width,height] of [[320,568],[375,667],[568,320],[667,375]]) {
    const mob=await openPage(mobilePage,{width,height,mobile:true});
    try {
      const result=await mob.evalPage(`(()=>{
        beginTrial();
        race.phase='race';
        race.elapsed=8000;
        Object.assign(race.rider,{speed:17,posture:'tuck',drafting:true});
        updateHud();
        const box=selector=>document.querySelector(selector).getBoundingClientRect().toJSON();
        const panel=()=>['.timing','.speedometer','.mini','.next','.speed-badges'].map(box);
        ui.gateFlash.textContent='通过检查点 04';
        ui.gateFlash.hidden=false;
        const auto=panel();
        const flash=box('#gateFlash'), buttons=box('.stage-controls');
        const gas=box('[data-drive="gas"]');
        const view=box('#stage');
        ui.settingsButton.click();
        const choose=value=>{
          ui.settingsHudScale.value=value;
          ui.settingsHudScale.dispatchEvent(new Event('change'));
          return panel();
        };
        const large=choose('100'), larger=choose('130'), small=choose('65');
        const saved=JSON.parse(localStorage.getItem(PREF_KEY)).hudScale;
        ui.settingsContinue.click();
        const touchFits=[];
        for(const touchSize of ['compact','standard','large']) {
          preferences.touchSize=touchSize;
          applyTouchSize();
          for(const value of ['auto','65','80','100','115','130']) {
            preferences.hudScale=value;
            applyHudScale();
            touchFits.push({
              touchSize,scale:value,hud:panel(),
              keys:['left','right','brake','gas','sprint'].map(key=>box('[data-drive="'+key+'"]'))
            });
          }
        }
        return {auto,large,larger,small,view,flash,buttons,saved,gas,gasAfter:touchFits[6].keys[3],
          centerTagHidden:getComputedStyle(ui.riderTag).display==='none',touchFits};
      })()`);
      const {auto,large,larger,small,view,flash,buttons,saved,gas,gasAfter,centerTagHidden,touchFits}=result;
      assert.equal(saved,'65');
      assert.ok(centerTagHidden);
      assert.equal(gas.width,gasAfter.width);
      assert.equal(gas.height,gasAfter.height);
      assert.ok(auto[0].width<105&&auto[0].height<65,JSON.stringify(auto[0]));
      const next=auto[3];
      assert.ok(next.width>0&&next.top>=buttons.bottom&&next.top<view.top+70&&next.right>view.right-12,
        JSON.stringify({width,height,next,buttons,view}));
      assert.ok(flash.top>=next.bottom&&!overlaps(flash,next),JSON.stringify({next,flash}));
      if(width<height) {
        const mini=auto[2];
        assert.ok(Math.abs(mini.right-next.right)<2&&mini.top>=flash.bottom&&mini.bottom<view.top+155,
          JSON.stringify({width,height,next,flash,mini,view}));
      }
      const center={left:view.left+view.width*.42,right:view.left+view.width*.58,top:view.top+view.height*.36,bottom:view.top+view.height*.63};
      assert.ok(auto.every(card=>!overlaps(card,center)), 'Automatic HUD covers the center of the race view');
      assert.ok([0,1,2].every(i=>Math.abs(small[i].width/large[i].width-.65)<.012));
      assert.ok([0,1,2].every(i=>Math.abs(larger[i].width/large[i].width-1.3)<.012));
      for(const {touchSize,scale,hud,keys} of touchFits) {
        assert.ok(keys.every(key=>hud.every(card=>!overlaps(key,card))),JSON.stringify({width,height,touchSize,scale,hud,keys}));
        assert.ok(keys[1].right<keys[2].left,JSON.stringify({width,height,touchSize,scale}));
        assert.ok(!overlaps(hud[0],hud[3])&&!overlaps(hud[1],hud[2]),JSON.stringify({width,height,touchSize,scale,hud}));
      }
      console.log(`Small screen ${width}×${height}: automatic timer ${auto[0].width.toFixed(1)}×${auto[0].height.toFixed(1)} px, scale persisted, all touch/HUD combinations clear`);
    } finally {
      await mob.close();
    }
  }
  assert.deepEqual(errors, []);
  console.log('Workshop, HUD, touch, guide and free ride checks passed with 0 errors.');
} finally {
  clearTimeout(deadline);
  browser.kill();
  await app?.shutdown();
}
