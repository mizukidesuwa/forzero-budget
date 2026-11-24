import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { openTestBrowser } from './stage6-browser.mjs';

const desktop = resolve(process.env.FORZERO_RELEASE_DIR ??
  (existsSync('forzero-budget-2.1.0/index.html') ? 'forzero-budget-2.1.0' : '.'));
const fixtures = JSON.parse(await readFile(new URL('./fixtures/stage4-maps.json', import.meta.url), 'utf8'));
const { rpc, close } = await openTestBrowser();
try {
  const { targetId } = await rpc('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await rpc('Target.attachToTarget', { targetId, flatten: true });
  await rpc('Page.enable', {}, sessionId);
  await rpc('Page.addScriptToEvaluateOnNewDocument', { source: `
    globalThis.qaErrors = [];
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

  await wait('globalThis.ready===true', 'Game initialization timed out');
  for (const campus of ['szu', 'ucl', 'shunde']) {
    const ghost = fixtures[campus].ghost;
    await evaluate(`(()=>{
      race.freeRide();ui.friendButton.click();
      const upload = new DataTransfer();
      upload.items.add(new File([${JSON.stringify(JSON.stringify(ghost))}], 'stage4.ghost.json', {type:'application/json'}));
      ui.friendFile.files = upload.files;
      ui.friendFile.dispatchEvent(new Event('change'));
    })()`);
    await wait(`activeCampus===${JSON.stringify(campus)} && race.event.id===${JSON.stringify(ghost.course.id)} && race.opponent?.name===${JSON.stringify(ghost.rider.name)} && !ui.friendDialog.open`, `${campus} ghost import or map travel failed`);
    assert.equal(await evaluate('race.opponent.time'), ghost.run.time);
    console.log(campus, 'legacy ghost imported through the packaged browser UI');
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
  assert.deepEqual(await evaluate('qaErrors'), [], 'desktop errors');

  const mobile = resolve(process.env.FORZERO_MOBILE_HTML ?? 'forzero-budget-mobile-2.1.0.html');
  if (existsSync(mobile)) {
    await rpc('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sessionId);
    await rpc('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 }, sessionId);
    const navMobile = await rpc('Page.navigate', { url: pathToFileURL(mobile).href }, sessionId);
    assert.ok(!navMobile.errorText, navMobile.errorText);
    await wait('globalThis.ready===true && navigator.maxTouchPoints===2', 'Mobile build did not load');
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
    assert.deepEqual(await evaluate('qaErrors'), [], 'mobile errors');
  }
  console.log('Desktop race options and mobile touch hold passed.');
} finally {
  await close();
}
