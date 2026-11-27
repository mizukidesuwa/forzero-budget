import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { openTestBrowser } from './browser-runner.mjs';
import { makeGhostFile } from '../src/replay/ghost.js';
import { buildCustomNetworkRoute, buildRidingScene, makeNetworkCourse, networkForCampus, setActiveCampus } from '../src/test-exports.js';

const desktop = resolve(process.env.FORZERO_RELEASE_DIR ??
  (existsSync('dist-v2/desktop/index.html') ? 'dist-v2/desktop' : '.'));
const fixtures = JSON.parse(await readFile(new URL('./fixtures/map-regression.json', import.meta.url), 'utf8'));
const { rpc, close } = await openTestBrowser();
try {
  const { targetId } = await rpc('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await rpc('Target.attachToTarget', { targetId, flatten: true });
  await rpc('Page.enable', {}, sessionId);
  await rpc('Page.addScriptToEvaluateOnNewDocument', { source: `
    globalThis.qaErrors = [];
    globalThis.qaTrafficDraws = 0;
    const drawInstances = WebGL2RenderingContext.prototype.drawElementsInstanced;
    WebGL2RenderingContext.prototype.drawElementsInstanced = function (...args) {
      drawInstances.apply(this, args);
      if (this.getError() !== this.NO_ERROR) qaErrors.push('WebGL traffic draw failed');
      qaTrafficDraws++;
    };
    addEventListener('error', event => qaErrors.push(event.message));
    addEventListener('unhandledrejection', event => qaErrors.push(String(event.reason)));
    const error = console.error;
    console.error = (...args) => { qaErrors.push(args.join(' ')); error(...args); };
  ` }, sessionId);
  const nav = await rpc('Page.navigate', { url: pathToFileURL(join(desktop, 'index.html')).href }, sessionId);
  assert.ok(!nav.errorText, nav.errorText);

  async function evaluate(expression) {
    const result = await rpc('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  }

  async function wait(expression, label) {
    const until = Date.now() + 35_000;
    while (!await evaluate(expression)) {
      if (Date.now() >= until) throw Error(label);
      await delay(100);
    }
  }

  async function chooseLanguage(language) {
    await evaluate(`(()=>{const f=__FORZERO__;f.openSettings();f.ui.settingsLanguage.value=${JSON.stringify(language)};
      f.ui.settingsLanguage.dispatchEvent(new Event('change'));})()`);
    assert.equal(await evaluate('document.documentElement.lang'), language);
  }

  async function scaleHud(hud, touch) {
    await evaluate(`(()=>{const f=__FORZERO__;f.openSettings();for (const [control,value] of [[f.ui.settingsHudScale,${hud}],[f.ui.settingsTouchSize,${touch}]]) {
      control.value=value;control.dispatchEvent(new Event('input'));control.dispatchEvent(new Event('change'));
    } f.closeSettings()})()`);
  }

  async function uploadGhost(ghost) {
    await evaluate(`(()=>{
      const f=__FORZERO__;
      f.race.freeRide();f.ui.friendButton.click();
      const upload = new DataTransfer();
      upload.items.add(new File([${JSON.stringify(JSON.stringify(ghost))}], 'regression.ghost.json', {type:'application/json'}));
      f.ui.friendFile.files = upload.files;
      f.ui.friendFile.dispatchEvent(new Event('change'));
    })()`);
  }

  await wait('globalThis.__FORZERO__?.ready===true', 'Game initialization timed out');
  await wait("__FORZERO__.ui.fpsCounter && !__FORZERO__.ui.fpsCounter.hidden && /^FPS [0-9]+$/.test(__FORZERO__.ui.fpsCounter.textContent)", 'FPS HUD did not update');
  assert.equal(await evaluate('document.documentElement.lang'), 'zh-CN');
  const originalCourse = await evaluate('__FORZERO__.race.event.name');
  const originalKey = await evaluate('__FORZERO__.checkpointRecordKey(__FORZERO__.race.event,__FORZERO__.race.rider.vehicle)');
  await chooseLanguage('en');
  assert.equal(await evaluate('__FORZERO__.ui.settingsTitle.textContent'), 'Settings');
  assert.equal(await evaluate("document.querySelector('label[for=settingsLanguage]').textContent"), 'Language');
  assert.equal(await evaluate('__FORZERO__.ui.startTrial.textContent'), 'Start Time Trial');
  assert.equal(await evaluate('__FORZERO__.race.event.name'), originalCourse);
  assert.equal(await evaluate('__FORZERO__.checkpointRecordKey(__FORZERO__.race.event,__FORZERO__.race.rider.vehicle)'), originalKey);
  assert.equal(await evaluate("__FORZERO__.buildSaveSnapshot().then(save => save.storage['forzero-language'])"), undefined);
  await evaluate('__FORZERO__.ui.settingsGuideBtn.click()');
  assert.equal(await evaluate('__FORZERO__.ui.settingsTitle.textContent'), 'How to Play');
  assert.equal(await evaluate('/[\\p{Script=Han}]/u.test(__FORZERO__.ui.guideSettings.innerText)'), false);
  await rpc('Page.reload', {}, sessionId);
  await wait("globalThis.__FORZERO__?.ready===true && document.documentElement.lang==='en'", 'English preference did not survive reload');
  await evaluate(`(async()=>{
    const f=__FORZERO__;
    const save=await f.buildSaveSnapshot();
    save.storage[f.PREF_KEY]=JSON.stringify({...f.preferences,hudScale:'115',touchSize:'large'});
    await f.applySaveSnapshot(save,{preferIncoming:true});
  })()`);
  assert.deepEqual(await evaluate('[__FORZERO__.preferences.hudScale,__FORZERO__.preferences.touchSize,__FORZERO__.preferences.cameraView]'), [115, 110, 'third']);
  await evaluate(`(()=>{
    const f=__FORZERO__, r=f.race;
    globalThis.finishBackupTrial = time => {
      r.splits = r.event.gates.map((_, i) => time * i / (r.event.gates.length - 1));
      r.finishAt(time);
    };
    r.start();
    finishBackupTrial(120000);
    r.start();
    f.openSettings();
    const key=f.checkpointRecordKey(r.event, r.rider.vehicle);
    const previous=JSON.parse(localStorage.getItem(key));
    const restored={...previous, time:100000, splits:previous.splits.map(t=>t*5/6),
      samples:previous.samples.map(([t,...pose])=>[t*5/6,...pose])};
    const backup={format:'litchi-save', version:1, storage:{
      [key]:JSON.stringify(restored), 'szu-litchi-bike-1':JSON.stringify({tyres:'traction'})
    }};
    const upload=new DataTransfer();
    upload.items.add(new File([JSON.stringify(backup)], 'backup.json', {type:'application/json'}));
    f.ui.saveFile.files=upload.files;
    f.ui.saveFile.dispatchEvent(new Event('change'));
  })()`);
  await wait('__FORZERO__.race.best===100000 && __FORZERO__.ui.saveStatus.textContent.length>0', 'Restored personal best did not refresh while a trial was active');
  assert.deepEqual(await evaluate(`(()=>{
    const r=__FORZERO__.race;
    return [r.phase, r.reference.time, r.bike.tyres, r.rider.bike.tyres, r.unranked];
  })()`), ['count', 120000, 'stock', 'stock', false]);
  await evaluate('finishBackupTrial(110000);__FORZERO__.closeSettings()');
  assert.deepEqual(await evaluate(`(()=>{
    const f=__FORZERO__,r=f.race;
    return [r.record,JSON.parse(localStorage.getItem(f.checkpointRecordKey(r.event,r.rider.vehicle))).time,r.rider.bike.tyres];
  })()`), [false, 100000, 'stock']);
  await evaluate('__FORZERO__.ui.freeRide.click()');
  await wait("__FORZERO__.race.phase==='free' && __FORZERO__.race.rider.bike.tyres==='traction'", 'Restored tyres did not apply after returning to free ride');
  await evaluate(`(async()=>{
    const f=__FORZERO__,r=f.race;
    r.start(); f.openSettings();
    await f.applySaveSnapshot({format:'litchi-save',version:1,storage:{'szu-litchi-bike-1':'{"tyres":"race"}'}},{preferIncoming:true});
    if(r.rider.bike.tyres!=='traction') throw Error('Active setup changed on restore');
    finishBackupTrial(110000);
    f.closeSettings();
    f.ui.startTrial.click();
    delete globalThis.finishBackupTrial;
  })()`);
  await wait("__FORZERO__.race.phase==='count' && __FORZERO__.race.rider.bike.tyres==='race'", 'Restored tyres did not apply on direct restart');
  await evaluate('__FORZERO__.ui.freeRide.click()');

  const expand = await evaluate('(()=>{const r=__FORZERO__.ui.expand.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
  await rpc('Input.dispatchMouseEvent',{type:'mousePressed',...expand,button:'left',clickCount:1},sessionId);
  await rpc('Input.dispatchMouseEvent',{type:'mouseReleased',...expand,button:'left',clickCount:1},sessionId);
  await wait("document.fullscreenElement===__FORZERO__.stage||__FORZERO__.stage.classList.contains('expanded')", 'Stage did not go fullscreen');
  assert.equal(await evaluate('__FORZERO__.stage.contains(__FORZERO__.ui.cameraToggle) && __FORZERO__.ui.cameraToggle.getBoundingClientRect().width > 0'), true);
  await evaluate('__FORZERO__.ui.cameraToggle.click()');
  assert.deepEqual(await evaluate('[__FORZERO__.stage.dataset.cameraView,__FORZERO__.ui.cameraModeTag.textContent,__FORZERO__.ui.cameraToggle.getAttribute("aria-label")]'),
    ['first', '1P', 'Switch camera, current: First-person view']);
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyV'}))");
  assert.deepEqual(await evaluate('[__FORZERO__.stage.dataset.cameraView,__FORZERO__.ui.cameraModeTag.textContent]'), ['second', '2P']);
  assert.equal(await evaluate("document.fullscreenElement===__FORZERO__.stage||__FORZERO__.stage.classList.contains('expanded')"), true);
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyV'}));__FORZERO__.ui.expand.click()");
  await wait("!document.fullscreenElement&&!__FORZERO__.stage.classList.contains('expanded')", 'Stage did not leave fullscreen');
  assert.equal(await evaluate('__FORZERO__.stage.dataset.cameraView'), 'third');
  for (const campus of ['szu', 'ucl', 'shunde']) {
    const ghost = fixtures[campus].ghost;
    await uploadGhost(ghost);
    await wait(`__FORZERO__.activeCampus===${JSON.stringify(campus)} && __FORZERO__.race.event.id===${JSON.stringify(ghost.course.id)} && __FORZERO__.race.opponent?.name===${JSON.stringify(ghost.rider.name)} && !__FORZERO__.ui.friendDialog.open`, `${campus} ghost import or map travel failed`);
    assert.equal(await evaluate('__FORZERO__.race.opponent.time'), ghost.run.time);
    assert.equal(await evaluate(`/[\\p{Script=Han}]/u.test(__FORZERO__.ui.courseBrief.textContent + __FORZERO__.ui.stationList.textContent + __FORZERO__.ui.campusName.textContent)`), false, `${campus} course copy or checkpoint names`);
    console.log(campus, 'legacy ghost imported through the packaged browser UI');
    if (campus === 'ucl') {
      await evaluate("Object.assign(__FORZERO__.race.rider, { position: [-245, .043, -119], heading: 0 })");
      await wait('qaTrafficDraws > 0', 'UCL traffic instancing was not exercised');
      console.log('UCL traffic drew through WebGL instancing.');
    }
    if (campus === 'shunde') continue;
    const weeklyCode = await evaluate('__FORZERO__.ui.seedButton.click();__FORZERO__.ui.weeklyCode.value');
    assert.match(weeklyCode, new RegExp(`^${campus[0].toUpperCase()}2-W\\d{8}$`));
    await evaluate('__FORZERO__.ui.weeklyPlay.click()');
    await wait(`__FORZERO__.race.event.seed===${JSON.stringify(weeklyCode)} && !__FORZERO__.ui.seedDialog.open`, `${campus} weekly route was not selected`);
    assert.equal(await evaluate('__FORZERO__.race.opponent===null && Boolean(__FORZERO__.race.event.environment?.weather)'), true);
    await evaluate('__FORZERO__.ui.startTrial.click()');
    await wait("__FORZERO__.race.phase==='count'||__FORZERO__.race.phase==='race'", `${campus} weekly route did not start`);
    await evaluate('__FORZERO__.ui.freeRide.click()');
    await wait("__FORZERO__.race.phase==='free'", `${campus} failed to return to free ride`);
    console.log(campus, 'weekly route selected and started', weeklyCode);

    setActiveCampus(campus);
    buildRidingScene(campus);
    const network = networkForCampus(campus);
    const waypoints = Object.keys(network.endpoints).slice(0, 3);
    const route = buildCustomNetworkRoute(campus, waypoints, network);
    assert.equal(route.valid, true);
    const event = makeNetworkCourse(route.route, network);
    const networkGhost = makeGhostFile(event, { ...event.benchmark, vehicle: 'bike' }, { name: 'Workshop QA', paint: 'classic' });
    await uploadGhost(networkGhost);
    await wait(`__FORZERO__.race.event.id===${JSON.stringify(event.id)} && __FORZERO__.race.opponent?.name==='Workshop QA' && !__FORZERO__.ui.friendDialog.open`,
      `${campus} workshop ghost did not reconstruct its course`);
    await evaluate('__FORZERO__.ui.friendButton.click()');
    await wait("Boolean(__FORZERO__.ui.friendScores.querySelector('.friend-play:not(:disabled)'))", `${campus} workshop ghost was missing from the archive`);
    assert.equal(await evaluate('__FORZERO__.ui.friendCourse.value'), event.id);
    await evaluate("__FORZERO__.ui.friendScores.querySelector('.friend-play').click()");
    await wait("__FORZERO__.race.opponent?.name==='Workshop QA' && !__FORZERO__.ui.friendDialog.open", `${campus} archive could not reload workshop ghost`);
  }
  await evaluate(`(()=>{
    const u=__FORZERO__.ui;
    u.coursePicker.disabled = false;
    u.coursePicker.value = 'qingyun-lake';
    u.coursePicker.dispatchEvent(new Event('change'));
  })()`);
  await wait("!__FORZERO__.ui.courseVariants.hidden && !__FORZERO__.ui.courseLaps.hidden", 'Loop options did not appear');
  await evaluate(`(()=>{
    const u=__FORZERO__.ui;
    u.courseDirection.value = 'reverse';
    u.courseDirection.dispatchEvent(new Event('change'));
    u.courseLaps.value = '3';
    u.courseLaps.dispatchEvent(new Event('change'));
    u.raceMode.value = 'team';
    u.raceMode.dispatchEvent(new Event('change'));
    u.aiDifficulty.value = 'strong';
    u.startTrial.click();
  })()`);
  await wait("__FORZERO__.race.phase==='count' && __FORZERO__.race.rivals.length===3", 'Reverse three-lap AI race failed to start');
  assert.deepEqual(await evaluate('__FORZERO__.race.event.variant'), { direction: 'reverse', laps: 3 });
  assert.equal(await evaluate('__FORZERO__.race.aiDifficulty'), 'strong');
  assert.equal(await evaluate('__FORZERO__.ui.callTitle.textContent'), 'Time Trial Starting');
  await evaluate('(()=>{const f=__FORZERO__;f.race.splits=Array.from(f.race.reference.splits);f.race.nextGate=f.race.event.gates.length;f.race.finishAt(f.race.splits.at(-1));f.updateHud()})()');
  assert.equal(await evaluate('__FORZERO__.ui.callTitle.textContent'), 'Finished');
  assert.equal(await evaluate('/[\\p{Script=Han}]/u.test(__FORZERO__.ui.raceReview.innerText)'), false);
  await chooseLanguage('zh-CN');
  await evaluate('__FORZERO__.closeSettings();__FORZERO__.updateHud()');
  assert.equal(await evaluate('__FORZERO__.ui.callTitle.textContent'), '完赛');
  assert.deepEqual(await evaluate('__FORZERO__.race.event.variant'), { direction: 'reverse', laps: 3 });
  assert.deepEqual(await evaluate('qaErrors'), [], 'desktop errors');

  const pkgVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
  const mobile = resolve(process.env.FORZERO_MOBILE_HTML ??
    (existsSync(`dist-v2/forzero-budget-mobile-${pkgVersion}.html`) ? `dist-v2/forzero-budget-mobile-${pkgVersion}.html` : 'dist-v2/forzero-budget-mobile.html'));
  if (existsSync(mobile)) {
    await rpc('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sessionId);
    await rpc('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 }, sessionId);
    const navMobile = await rpc('Page.navigate', { url: pathToFileURL(mobile).href }, sessionId);
    assert.ok(!navMobile.errorText, navMobile.errorText);
    await wait('globalThis.__FORZERO__?.ready===true && navigator.maxTouchPoints===2', 'Mobile build did not load');
    await chooseLanguage('en');
    await evaluate('__FORZERO__.closeSettings()');
    assert.equal(await evaluate("document.querySelector('[data-drive=gas]').textContent"), 'Accelerate');
    const info = await evaluate(`(()=>{
      const button = document.querySelector('[data-drive="gas"]');
      const input = document.querySelector('input[type="text"], textarea');
      const {x,y,width,height} = button.getBoundingClientRect();
      return {
        x:x+width/2, y:y+height/2, width, height,
        select:getComputedStyle(button).webkitUserSelect,
        inputSelect:getComputedStyle(input).webkitUserSelect,
        overflow:document.documentElement.scrollWidth > innerWidth + 2,
        lapsHidden:__FORZERO__.ui.courseLaps.hidden,
        blocked:['touchstart','contextmenu','selectstart'].map(type =>
          !button.dispatchEvent(new Event(type, {bubbles:true,cancelable:true}))),
      };
    })()`);
    assert.ok(info.width > 30 && info.height > 30 && !info.overflow && info.lapsHidden, JSON.stringify(info));
    assert.equal(info.select, 'none');
    assert.equal(info.inputSelect, 'text');
    assert.deepEqual(info.blocked, [true, true, true]);
    await rpc('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: info.x, y: info.y, id: 1 }] }, sessionId);
    await wait("document.querySelector('[data-drive=gas]').classList.contains('active')", 'Touch did not register');
    await delay(550);
    assert.equal(await evaluate('getSelection().toString()'), '');
    await rpc('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, sessionId);
    await wait("!document.querySelector('[data-drive=gas]').classList.contains('active')", 'Touch did not release');
    await scaleHud(100, 100);
    const normalHeight = await evaluate("document.querySelector('[data-drive=gas]').getBoundingClientRect().height");
    await scaleHud(50, 50);
    const smallHeight = await evaluate("document.querySelector('[data-drive=gas]').getBoundingClientRect().height");
    assert.ok(Math.abs(smallHeight / normalHeight - .5) < .03, 'Touch buttons did not shrink to 50%');
    await scaleHud(150, 150);
    const largeHeight = await evaluate("document.querySelector('[data-drive=gas]').getBoundingClientRect().height");
    assert.ok(Math.abs(largeHeight / normalHeight - 1.5) < .03, 'Touch buttons did not reach 150% height');
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.speedometer')).scale"), '1.5');
    await evaluate('__FORZERO__.ui.startTrial.click()');
    await wait("__FORZERO__.race.phase==='race' && !__FORZERO__.ui.next.hidden && !__FORZERO__.ui.fpsCounter.hidden", 'Mobile race guidance did not appear');
    for (const [width,height] of [[320,568],[390,844],[844,390]]) {
      await rpc('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:2,mobile:true},sessionId);
      await wait(`innerWidth===${width}`, 'Mobile viewport did not resize');
      const fit = await evaluate(`(()=>{
        const f=__FORZERO__, box=element=>element.getBoundingClientRect();
        const view=box(f.stage), fps=box(f.ui.fpsCounter), next=box(f.ui.next), camera=box(f.ui.cameraToggle),
          left=box(document.querySelector('.touch-steer')), right=box(document.querySelector('.touch-pedals'));
        return {
          guidance:fps.width>0 && next.width>0 && fps.top>=next.bottom,
          routeFits:next.right <= view.right && next.left >= view.left,
          buttonsFit:left.width>0 && right.width>0 && left.left>=view.left && right.right<=view.right && left.right<=right.left,
          cameraFits:camera.width>0 && camera.left>=view.left && camera.right<=view.right,
          bounds:[view.left,view.right,next.left,next.right],
        };
      })()`);
      const { bounds, ...fits } = fit;
      assert.deepEqual(fits,{guidance:true,routeFits:true,buttonsFit:true,cameraFits:true},`${width}×${height} at 150%, stage/route bounds ${bounds}`);
    }
    const timeOrigin = await evaluate('performance.timeOrigin');
    await rpc('Page.reload',{},sessionId);
    await wait(`performance.timeOrigin!==${timeOrigin} && globalThis.__FORZERO__?.ready===true && __FORZERO__.preferences.hudScale===150 && __FORZERO__.preferences.touchSize===150`, 'Custom scales did not survive reload');
    assert.deepEqual(await evaluate('qaErrors'), [], 'mobile errors');
  }
  console.log('Desktop language persistence, race UI and mobile English touch controls passed.');
} finally {
  await close();
}
