import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { openTestBrowser } from './browser-runner.mjs';

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
    await evaluate(`openSettings();ui.settingsLanguage.value=${JSON.stringify(language)};
      ui.settingsLanguage.dispatchEvent(new Event('change'));`);
    assert.equal(await evaluate('document.documentElement.lang'), language);
  }

  async function scaleHud(hud, touch) {
    await evaluate(`openSettings();for (const [control,value] of [[ui.settingsHudScale,${hud}],[ui.settingsTouchSize,${touch}]]) {
      control.value=value;control.dispatchEvent(new Event('input'));control.dispatchEvent(new Event('change'));
    } closeSettings()`);
  }

  await wait('globalThis.ready===true', 'Game initialization timed out');
  await wait("ui.fpsCounter && !ui.fpsCounter.hidden && /^FPS [0-9]+$/.test(ui.fpsCounter.textContent)", 'FPS HUD did not update');
  assert.equal(await evaluate('document.documentElement.lang'), 'zh-CN');
  const originalCourse = await evaluate('race.event.name');
  const originalKey = await evaluate('checkpointRecordKey(race.event,race.rider.vehicle)');
  await chooseLanguage('en');
  assert.equal(await evaluate('ui.settingsTitle.textContent'), 'Settings');
  assert.equal(await evaluate("document.querySelector('label[for=settingsLanguage]').textContent"), 'Language');
  assert.equal(await evaluate('ui.startTrial.textContent'), 'Start Time Trial');
  assert.equal(await evaluate('race.event.name'), originalCourse);
  assert.equal(await evaluate('checkpointRecordKey(race.event,race.rider.vehicle)'), originalKey);
  assert.equal(await evaluate("buildSaveSnapshot().then(save => save.storage['forzero-language'])"), undefined);
  await evaluate('ui.settingsGuideBtn.click()');
  assert.equal(await evaluate('ui.settingsTitle.textContent'), 'How to Play');
  assert.equal(await evaluate('/[\\p{Script=Han}]/u.test(ui.guideSettings.innerText)'), false);
  await rpc('Page.reload', {}, sessionId);
  await wait("globalThis.ready===true && document.documentElement.lang==='en'", 'English preference did not survive reload');
  await evaluate(`(async()=>{
    const save=await buildSaveSnapshot();
    save.storage[PREF_KEY]=JSON.stringify({...preferences,hudScale:'115',touchSize:'large'});
    await applySaveSnapshot(save,{preferIncoming:true});
  })()`);
  assert.deepEqual(await evaluate('[preferences.hudScale,preferences.touchSize,preferences.cameraView]'), [115, 110, 'third']);
  const expand = await evaluate('(()=>{const r=ui.expand.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
  await rpc('Input.dispatchMouseEvent',{type:'mousePressed',...expand,button:'left',clickCount:1},sessionId);
  await rpc('Input.dispatchMouseEvent',{type:'mouseReleased',...expand,button:'left',clickCount:1},sessionId);
  await wait("document.fullscreenElement===stage||stage.classList.contains('expanded')", 'Stage did not go fullscreen');
  assert.equal(await evaluate('stage.contains(ui.cameraToggle) && ui.cameraToggle.getBoundingClientRect().width > 0'), true);
  await evaluate('ui.cameraToggle.click()');
  assert.deepEqual(await evaluate('[stage.dataset.cameraView,ui.cameraModeTag.textContent,ui.cameraToggle.getAttribute("aria-label")]'),
    ['first', '1P', 'Switch camera, current: First-person view']);
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyV'}))");
  assert.deepEqual(await evaluate('[stage.dataset.cameraView,ui.cameraModeTag.textContent]'), ['second', '2P']);
  assert.equal(await evaluate("document.fullscreenElement===stage||stage.classList.contains('expanded')"), true);
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyV'}));ui.expand.click()");
  await wait("!document.fullscreenElement&&!stage.classList.contains('expanded')", 'Stage did not leave fullscreen');
  assert.equal(await evaluate('stage.dataset.cameraView'), 'third');
  for (const campus of ['szu', 'ucl', 'shunde']) {
    const ghost = fixtures[campus].ghost;
    await evaluate(`(()=>{
      race.freeRide();ui.friendButton.click();
      const upload = new DataTransfer();
      upload.items.add(new File([${JSON.stringify(JSON.stringify(ghost))}], 'regression.ghost.json', {type:'application/json'}));
      ui.friendFile.files = upload.files;
      ui.friendFile.dispatchEvent(new Event('change'));
    })()`);
    await wait(`activeCampus===${JSON.stringify(campus)} && race.event.id===${JSON.stringify(ghost.course.id)} && race.opponent?.name===${JSON.stringify(ghost.rider.name)} && !ui.friendDialog.open`, `${campus} ghost import or map travel failed`);
    assert.equal(await evaluate('race.opponent.time'), ghost.run.time);
    assert.equal(await evaluate(`/[\\p{Script=Han}]/u.test(ui.courseBrief.textContent + ui.stationList.textContent + ui.campusName.textContent)`), false, `${campus} course copy or checkpoint names`);
    console.log(campus, 'legacy ghost imported through the packaged browser UI');
    if (campus === 'ucl') {
      await evaluate("Object.assign(race.rider, { position: [-245, .043, -119], heading: 0 })");
      await wait('qaTrafficDraws > 0', 'UCL traffic instancing was not exercised');
      console.log('UCL traffic drew through WebGL instancing.');
    }
    if (campus === 'shunde') continue;
    const weeklyCode = await evaluate('ui.seedButton.click();ui.weeklyCode.value');
    assert.match(weeklyCode, new RegExp(`^${campus[0].toUpperCase()}2-W\\d{8}$`));
    await evaluate('ui.weeklyPlay.click()');
    await wait(`race.event.seed===${JSON.stringify(weeklyCode)} && !ui.seedDialog.open`, `${campus} weekly route was not selected`);
    assert.equal(await evaluate('race.opponent===null && Boolean(race.event.environment?.weather)'), true);
    await evaluate('ui.startTrial.click()');
    await wait("race.phase==='count'||race.phase==='race'", `${campus} weekly route did not start`);
    await evaluate('ui.freeRide.click()');
    await wait("race.phase==='free'", `${campus} failed to return to free ride`);
    console.log(campus, 'weekly route selected and started', weeklyCode);
  }
  await evaluate(`(()=>{
    ui.coursePicker.disabled = false;
    ui.coursePicker.value = 'qingyun-lake';
    ui.coursePicker.dispatchEvent(new Event('change'));
  })()`);
  await wait("!ui.courseVariants.hidden && !ui.courseLaps.hidden", 'Loop options did not appear');
  await evaluate(`(()=>{
    ui.courseDirection.value = 'reverse';
    ui.courseDirection.dispatchEvent(new Event('change'));
    ui.courseLaps.value = '3';
    ui.courseLaps.dispatchEvent(new Event('change'));
    ui.raceMode.value = 'team';
    ui.raceMode.dispatchEvent(new Event('change'));
    ui.aiDifficulty.value = 'strong';
    ui.startTrial.click();
  })()`);
  await wait("race.phase==='count' && race.rivals.length===3", 'Reverse three-lap AI race failed to start');
  assert.deepEqual(await evaluate('race.event.variant'), { direction: 'reverse', laps: 3 });
  assert.equal(await evaluate('race.aiDifficulty'), 'strong');
  assert.equal(await evaluate('ui.callTitle.textContent'), 'Time Trial Starting');
  await evaluate('race.splits=Array.from(race.reference.splits);race.nextGate=race.event.gates.length;race.finishAt(race.splits.at(-1));updateHud()');
  assert.equal(await evaluate('ui.callTitle.textContent'), 'Finished');
  assert.equal(await evaluate('/[\\p{Script=Han}]/u.test(ui.raceReview.innerText)'), false);
  await chooseLanguage('zh-CN');
  await evaluate('closeSettings();updateHud()');
  assert.equal(await evaluate('ui.callTitle.textContent'), '完赛');
  assert.deepEqual(await evaluate('race.event.variant'), { direction: 'reverse', laps: 3 });
  assert.deepEqual(await evaluate('qaErrors'), [], 'desktop errors');

  const mobile = resolve(process.env.FORZERO_MOBILE_HTML ??
    (existsSync('dist-v2/forzero-budget-mobile-2.5.0.html') ? 'dist-v2/forzero-budget-mobile-2.5.0.html' : 'dist-v2/forzero-budget-mobile.html'));
  if (existsSync(mobile)) {
    await rpc('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sessionId);
    await rpc('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 }, sessionId);
    const navMobile = await rpc('Page.navigate', { url: pathToFileURL(mobile).href }, sessionId);
    assert.ok(!navMobile.errorText, navMobile.errorText);
    await wait('globalThis.ready===true && navigator.maxTouchPoints===2', 'Mobile build did not load');
    await chooseLanguage('en');
    await evaluate('closeSettings()');
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
        lapsHidden:ui.courseLaps.hidden,
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
    await evaluate('ui.startTrial.click()');
    await wait("race.phase==='race' && !ui.next.hidden && !ui.fpsCounter.hidden", 'Mobile race guidance did not appear');
    for (const [width,height] of [[320,568],[390,844],[844,390]]) {
      await rpc('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:2,mobile:true},sessionId);
      await wait(`innerWidth===${width}`, 'Mobile viewport did not resize');
      const fit = await evaluate(`(()=>{
        const box=element=>element.getBoundingClientRect();
        const view=box(stage), fps=box(ui.fpsCounter), next=box(ui.next), camera=box(ui.cameraToggle),
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
    await wait(`performance.timeOrigin!==${timeOrigin} && globalThis.ready===true && preferences.hudScale===150 && preferences.touchSize===150`, 'Custom scales did not survive reload');
    assert.deepEqual(await evaluate('qaErrors'), [], 'mobile errors');
  }
  console.log('Desktop language persistence, race UI and mobile English touch controls passed.');
} finally {
  await close();
}
