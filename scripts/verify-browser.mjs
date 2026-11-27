import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { readFileSync, statSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { openTestBrowser } from './browser-runner.mjs';
import { checkBuildFile, readBuildManifest } from './build-manifest.mjs';
import { createAppShell, loadStaticAssets } from '../server/server.mjs';
import { defaultRiderSkin } from '../src/data/rider-skins.js';
import saveRules from '../src/data/shared-rules.cjs';
import { getCourseVariant } from '../src/race/course-variants.js';
import { makeGhostFile } from '../src/replay/ghost.js';
import { buildCustomNetworkRoute, buildRidingScene, coursesByCampus, makeNetworkCourse, networkForCampus, setActiveCampus } from '../src/test-exports.js';

const buildDir = resolve(process.env.FORZERO_BUILD_DIR ?? 'dist-v2');
const desktop = resolve(process.env.FORZERO_RELEASE_DIR ?? join(buildDir,'desktop'));
const pkgVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const mobileEntry = process.env.FORZERO_MOBILE_HTML ? null : readBuildManifest(buildDir,pkgVersion).mobile;
const mobile = resolve(process.env.FORZERO_MOBILE_HTML || join(buildDir,mobileEntry.file));
assert.ok(statSync(mobile,{throwIfNoEntry:false})?.isFile(), `Missing mobile build: ${mobile}`);
if (mobileEntry) checkBuildFile(buildDir,mobileEntry);
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
  await evaluate(`(()=>{
    const f=__FORZERO__, driver='szu-litchi-driver-1', bike='szu-litchi-bike-1';
    const previous=[localStorage.getItem(driver),localStorage.getItem(bike)];
    localStorage.setItem(driver,JSON.stringify({name:'Original QA Rider'}));
    localStorage.setItem(bike,JSON.stringify({tyres:'stock'}));
    const setItem=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value) {
      if (key===bike && JSON.parse(value).tyres==='race') throw new DOMException('QA quota','QuotaExceededError');
      return setItem.call(this,key,value);
    };
    const upload=new DataTransfer();
    upload.items.add(new File([JSON.stringify({format:'litchi-save',version:1,storage:{
      [driver]:JSON.stringify({name:'Imported QA Rider'}),[bike]:JSON.stringify({tyres:'race'}),
    }})],'quota-backup.json'));
    f.openSettings();
    f.ui.saveFile.files=upload.files;
    f.ui.saveFile.dispatchEvent(new Event('change'));
    globalThis.restoreQaStorage=()=>{
      Storage.prototype.setItem=setItem;
      [driver,bike].forEach((key,i)=>previous[i]===null?localStorage.removeItem(key):localStorage.setItem(key,previous[i]));
      f.closeSettings();
    };
  })()`);
  await wait("__FORZERO__.ui.saveStatus.textContent==='无法写入浏览器存档。'", 'Quota error did not surface');
  assert.deepEqual(await evaluate(`[
    JSON.parse(localStorage.getItem('szu-litchi-driver-1')).name,
    JSON.parse(localStorage.getItem('szu-litchi-bike-1')).tyres,
  ]`), ['Original QA Rider','stock'], 'A quota error rolled back the earlier driver write');
  await evaluate('restoreQaStorage()');

  await evaluate(`(()=>{
    const f=__FORZERO__,u=f.ui,r=f.race;
    const originalCourse=u.coursePicker.value;
    u.coursePicker.value='endurance';u.coursePicker.dispatchEvent(new Event('change'));
    u.mapToggle.click();
    const start=u.stationList.querySelector('.practice-btn');
    if (!start || r.event.id!=='endurance' || !r.event.stages?.length) throw Error('Endurance map practice is missing');
    start.click();
    if (r.phase!=='count' || r.practice?.fromGate!==0 || r.practice?.toGate!==1) throw Error('First segment did not start');
    // Run the real countdown and physics with fixed steps so a slow renderer cannot pause practice.
    const countdownTicks=r.countdownTicks;
    for (let i=0;i<countdownTicks;i++) r.step();
    let nearest=0;
    for (let step=0;r.phase==='race' && step<5400;step++) {
      const {rider,event}=r, rows=event.path.rows, p=rider.position;
      let error=Infinity;
      for (let k=Math.max(0,nearest-7);k<Math.min(rows.length,nearest+76);k++) {
        const q=rows[k].p,d=(p[0]-q[0])**2+(p[2]-q[2])**2;
        if (d<error) { error=d;nearest=k; }
      }
      const distance=rows[nearest].distance;
      const target=f.along(event.path,Math.min(event.length,distance+f.clamp(1.7+rider.speed*.29,1.85,5.8)));
      const turn=Math.atan2(target[2]-p[2],target[0]-p[0])-rider.heading-rider.yawRate*.085;
      const angle=Math.atan2(Math.sin(turn),Math.cos(turn));
      let goal=Math.min(10.8,f.plannedSpeed(event,distance+.65)*1.04);
      if (Math.abs(angle)>.38) goal=Math.min(goal,7.9);
      if (Math.abs(angle)>.75) goal=Math.min(goal,5.4);
      r.step({gas:rider.speed<goal-.06,brake:rider.speed>goal+.32,left:angle<-.025,right:angle>.025,sprint:false});
    }
    if (r.phase!=='done') throw Error('Practice driver missed the finish gate at '+r.progressEstimate+' m');

    // Observe actual game frames after the finish. An exception in the finish HUD stops this count.
    const advance=r.advance;
    globalThis.qaPractice={framesAfterFinish:0,originalCourse};
    r.advance=function(dt,input) {
      if (this.phase==='done' && ++qaPractice.framesAfterFinish===3) delete this.advance;
      return advance.call(this,dt,input);
    };
  })()`);
  await wait('qaPractice.framesAfterFinish===3', 'Game frame loop did not continue after endurance practice');
  assert.deepEqual(await evaluate(`(()=>{
    const {race:r,ui:u}=__FORZERO__;
    return [r.phase,r.practiceBest.get(r.practice.key)>0,u.raceReview.hidden,u.practiceExit.hidden,u.callTitle.textContent];
  })()`), ['done',true,true,false,'完赛']);
  assert.deepEqual(await evaluate('qaErrors'), [], 'Endurance segment practice errors');
  await evaluate(`(()=>{
    const u=__FORZERO__.ui;
    u.practiceExit.click();
    u.coursePicker.value=qaPractice.originalCourse;
    u.coursePicker.dispatchEvent(new Event('change'));
  })()`);
  console.log('Endurance map practice finished through physics and the game continued running.');
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
  const model = {
    ...defaultRiderSkin, id:'qa_save_skin', label:'Save QA', class:'model',
    headMode:'integrated', limbMode:'full', accessories:[],
    bounds:{width:.90,height:1.60,depth:.80},triangleBudget:2400,
    model:{version:1,parts:[
      {id:'body',primitive:'ellipsoid',material:'bodyMain',center:[-.15,1.15,0],size:[.20,.28,.20]},
      {id:'head',primitive:'ellipsoid',material:'bodyMain',center:[.05,1.55,0],size:[.15,.16,.15]},
      {id:'foot_anchor',primitive:'box',material:'bodyMain',center:[-.20,.55,0],size:[.10,.06,.10]},
    ]},
    palette:{bodyMain:'#112233'},
  };
  assert.deepEqual(await evaluate(`(async()=>{
    const f=__FORZERO__, model=${JSON.stringify(model)}, extra={...model,id:'qa_second_skin'};
    const library='forzero-rider-skins-v1', driver='szu-litchi-driver-1';
    const snapshot=storage=>({format:'litchi-save',version:1,storage});
    const options=()=>Array.from(f.ui.riderSkin.options,option=>option.value);
    localStorage.removeItem(library);
    await f.applySaveSnapshot(snapshot({[driver]:JSON.stringify({skinId:model.id,skinSpec:model})}),{preferIncoming:true});
    const embedded=[f.ui.riderSkin.value,options().includes(model.id)];
    await f.applySaveSnapshot(snapshot({[library]:JSON.stringify([model,extra]),[driver]:JSON.stringify({skinId:extra.id})}),{preferIncoming:true});
    const saved=await f.buildSaveSnapshot();
    localStorage.removeItem(library);localStorage.removeItem(driver);
    await f.applySaveSnapshot(saved,{preferIncoming:true});
    const restored=[f.ui.riderSkin.value,JSON.parse(saved.storage[library]).length,options().includes(model.id)];
    return [embedded,restored];
  })()`), [['qa_save_skin',true],['qa_second_skin',2,true]]);

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
  setActiveCampus('shunde');
  buildRidingScene('shunde');
  const lake = getCourseVariant(coursesByCampus.shunde.find(event=>event.id==='qingyun-lake'),{direction:'reverse',laps:3});
  const variantGhost = makeGhostFile(lake,{...lake.benchmark,vehicle:'bike'},{name:'Reverse QA',paint:'classic'});
  await uploadGhost(variantGhost);
  await wait("__FORZERO__.race.opponent?.name==='Reverse QA' && !__FORZERO__.ui.friendDialog.open", 'Reverse three-lap ghost did not import');
  await evaluate('__FORZERO__.ui.friendButton.click()');
  await wait(`[...__FORZERO__.ui.friendScores.querySelectorAll('.friend-play:not(:disabled)')].some(button=>button.getAttribute('aria-label').includes('Reverse'))`, 'Archived reverse three-lap ghost was disabled');
  await evaluate(`[...__FORZERO__.ui.friendScores.querySelectorAll('.friend-play:not(:disabled)')].find(button=>button.getAttribute('aria-label').includes('Reverse')).click()`);
  await wait("!__FORZERO__.ui.friendDialog.open && __FORZERO__.race.opponent?.name?.startsWith('Reverse')", 'Archived reverse three-lap ghost did not launch');
  assert.deepEqual(await evaluate('__FORZERO__.race.event.variant'),{direction:'reverse',laps:3});
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

  const {course:archiveCourse,rider:archiveRider,run:archiveRun} = fixtures.szu.ghost;
  const exported = await evaluate(`(async()=>{
    const f=__FORZERO__, course=${JSON.stringify(archiveCourse)}, rider=${JSON.stringify(archiveRider)};
    const time=${archiveRun.time}, pose=${JSON.stringify(archiveRun.samples[0].slice(1))};
    const splits=${JSON.stringify(archiveRun.splits)};
    const samples=Array.from({length:8100},(_,i)=>[i===8099?time:i*time/8099,...pose]);
    const friends=Array.from({length:40},(_,i)=>{
      const name='Archive '+i;
      return {score:{campus:course.campus,courseId:course.id,seed:course.seed,layout:course.layout,name,vehicle:rider.vehicle,time},
        replay:JSON.stringify({format:'litchi-ghost',version:1,course,rider:{...rider,name},run:{time,splits,samples}})};
    });
    await f.applySaveSnapshot({format:'litchi-save',version:1,storage:{},friends});
    f.openSettings();
    const create=URL.createObjectURL, click=HTMLAnchorElement.prototype.click;
    let blob;
    URL.createObjectURL=value=>{blob=value;return create.call(URL,value)};
    HTMLAnchorElement.prototype.click=()=>{};
    try {
      f.ui.saveExport.click();
      const deadline=performance.now()+10000;
      while(!blob && performance.now()<deadline) await new Promise(resolve=>setTimeout(resolve,25));
      if(!blob) throw Error('Oversized archive export did not produce an importable personal save');
      const data=JSON.parse(await blob.text());
      await f.applySaveSnapshot(data,{preferIncoming:true});
      return {size:blob.size,format:data.format,friends:data.friends,status:f.ui.saveStatus.textContent};
    } finally {
      URL.createObjectURL=create;HTMLAnchorElement.prototype.click=click;f.closeSettings();
    }
  })()`);
  assert.ok(exported.size>0 && exported.size<=saveRules.MAX_SAVE_BYTES);
  assert.equal(exported.format,'litchi-save');
  assert.equal(exported.friends,null);
  assert.equal(exported.status,'友人对战档案过大，已导出个人成绩、车库和皮肤库。');
  assert.deepEqual(await evaluate('qaErrors'), [], 'desktop save export errors');

  {
    const temp = await mkdtemp(join(tmpdir(),'forzero-install-saves-'));
    const assets = await loadStaticAssets(new URL('./',pathToFileURL(join(desktop,'index.html'))));
    const driver = 'szu-litchi-driver-1';
    const makeInstall = async name => {
      const saveDir = join(temp,name);
      const file = join(saveDir,'player-data.json');
      const instanceId = createHash('sha256').update(saveDir).digest('hex');
      const snapshot = {
        format:'litchi-save',version:1,updatedAt:'2000-01-01T00:00:00Z',
        storage:{[driver]:JSON.stringify({name})},
        friends:[{score:{campus:archiveCourse.campus,courseId:archiveCourse.id,layout:archiveCourse.layout,
          name,vehicle:archiveRider.vehicle,time:archiveRun.time},replay:JSON.stringify(fixtures.szu.ghost)}],
      };
      await mkdir(saveDir);
      await writeFile(file,JSON.stringify(snapshot));
      const shell = createAppShell({assets,saveDir,instanceId,bootTimeoutMs:0,idleMs:0});
      const install = {file,instanceId,shell,blockWrites:false};
      const [handleRequest] = shell.server.listeners('request');
      shell.server.off('request',handleRequest);
      shell.server.on('request',(req,res)=>{
        if (install.blockWrites && req.method==='POST' && req.url==='/app/save') {
          req.resume();
          res.writeHead(500,{'content-type':'application/json'}).end('{"error":"QA disk write failed"}');
        } else handleRequest(req,res);
      });
      return install;
    };
    const loadSave = async install => JSON.parse(await readFile(install.file,'utf8'));
    async function waitForAutosave(install, name) {
      const deadline = Date.now()+12_000;
      for (;;) {
        const saved = await loadSave(install);
        if (saved.updatedAt!=='2000-01-01T00:00:00Z') {
          assert.equal(JSON.parse(saved.storage[driver]).name,name);
          assert.deepEqual(saved.friends.map(({score})=>score.name),[name]);
          return;
        }
        if (Date.now()>=deadline) throw Error('Desktop autosave did not run for '+name);
        await delay(100);
      }
    }
    async function start(shell, port) {
      shell.server.listen(port,'127.0.0.1');
      await once(shell.server,'listening');
      return shell.server.address().port;
    }
    async function openInstall(url, name) {
      const oldTime = await evaluate('performance.timeOrigin');
      const nav = await rpc('Page.navigate',{url},sessionId);
      assert.ok(!nav.errorText,nav.errorText);
      await wait(`performance.timeOrigin!==${oldTime} && globalThis.__FORZERO__?.ready===true && __FORZERO__.ui.driverName.value===${JSON.stringify(name)}`,
        'Desktop did not restore its own driver: '+name);
    }
    async function waitForDiskBest(install, key, time) {
      const deadline = Date.now()+15_000;
      while (JSON.parse((await loadSave(install)).storage[key] ?? 'null')?.time !== time) {
        if (Date.now() >= deadline) throw Error(`Desktop save did not write personal best ${time}`);
        await delay(100);
      }
    }
    const finishTrial = time => evaluate(`(()=>{
      const f=__FORZERO__, r=f.race;
      r.start();
      r.splits=r.event.gates.map((_,i)=>${time}*i/(r.event.gates.length-1));
      r.finishAt(${time});
      return f.checkpointRecordKey(r.event,r.entryVehicle);
    })()`);
    const retrying = "__FORZERO__.ui.saveStatus.textContent==='桌面存档写入失败，正在重试。'";
    let first, second;
    try {
      first = await makeInstall('Driver A');
      second = await makeInstall('Driver B');
      const port = await start(first.shell,0);
      const url = `http://127.0.0.1:${port}/`;
      await openInstall(url,'Driver A');
      await waitForAutosave(first,'Driver A');
      const recordKey = await finishTrial(100000);
      await waitForDiskBest(first,recordKey,100000);
      first.blockWrites = true;
      assert.equal(await finishTrial(90000),recordKey);
      await wait(retrying,'Failed desktop autosave did not show its retry status');
      await openInstall(url,'Driver A');
      await wait(retrying,'Reload did not finish hydration and attempt an autosave');
      assert.equal(await evaluate('__FORZERO__.race.best'),90000,'Same-install reload lost the faster personal best');
      assert.equal(JSON.parse((await loadSave(first)).storage[recordKey]).time,100000);
      first.blockWrites = false;
      await waitForDiskBest(first,recordKey,90000);

      first.blockWrites = true;
      await evaluate(`(async()=>{
        const f=__FORZERO__, backup=await f.buildSaveSnapshot(), key=${JSON.stringify(recordKey)};
        const record=JSON.parse(backup.storage[key]);
        const scale=110000/record.time;
        record.time=110000;
        record.splits=record.splits.map(t=>Math.min(record.time,t*scale));
        record.samples=record.samples.map(([t,...pose])=>[Math.min(record.time,t*scale),...pose]);
        backup.storage[key]=JSON.stringify(record);
        const upload=new DataTransfer();
        upload.items.add(new File([JSON.stringify(backup)],'desktop-save.json',{type:'application/json'}));
        f.ui.saveFile.files=upload.files;
        f.ui.saveFile.dispatchEvent(new Event('change'));
      })()`);
      await wait('__FORZERO__.race.best===110000','Explicit desktop import did not overwrite the best');
      await wait(retrying,'The imported desktop save did not attempt a disk write');
      await openInstall(url,'Driver A');
      await wait(retrying,'Reload did not reattempt the imported desktop save');
      assert.equal(await evaluate('__FORZERO__.race.best'),110000,'Reload lost the deliberate slower import');
      assert.equal(JSON.parse((await loadSave(first)).storage[recordKey]).time,90000);
      first.blockWrites = false;
      await waitForDiskBest(first,recordKey,110000);
      const savedA = await loadSave(first);
      await first.shell.shutdown();
      await start(second.shell,port);
      assert.equal(await evaluate(`fetch('/app/save',{method:'POST',headers:{'content-type':'application/json',
        'x-forzero-installation':${JSON.stringify(first.instanceId)}},body:${JSON.stringify(JSON.stringify(savedA))}}).then(r=>r.status)`),409);
      await openInstall(url,'Driver B');
      await waitForAutosave(second,'Driver B');
      assert.equal((await loadSave(second)).storage[recordKey],undefined,'Desktop installs must keep their personal bests separate');
      assert.deepEqual(await loadSave(first),savedA);
      const savedB = await loadSave(second);
      await assert.rejects(evaluate(`(async()=>{
        const driver='szu-litchi-driver-1', bike='szu-litchi-bike-1';
        const setItem=Storage.prototype.setItem;
        Storage.prototype.setItem=function(key,value) {
          if (key.endsWith(':'+bike) || (key.endsWith(':'+driver) && JSON.parse(value).name==='Driver B')) {
            throw new DOMException('QA quota during import and rollback','QuotaExceededError');
          }
          return setItem.call(this,key,value);
        };
        try {
          await __FORZERO__.applySaveSnapshot({format:'litchi-save',version:1,storage:{
            [driver]:JSON.stringify({name:'Failed import'}),[bike]:JSON.stringify({tyres:'race'}),
          }},{preferIncoming:true});
        } finally { Storage.prototype.setItem=setItem; }
      })()`), /浏览器拒绝还原旧存档/);
      await evaluate("dispatchEvent(new PageTransitionEvent('pagehide'))");
      await delay(600);
      assert.deepEqual(await loadSave(second),savedB,'Failed rollback must also stop desktop autosave');
      assert.deepEqual(await evaluate('qaErrors'), [], 'desktop installation switch errors');
      console.log('Desktop installs reused the same browser origin and kept their own drivers and friend archives on disk.');
    } finally {
      await Promise.all([first?.shell.shutdown(),second?.shell.shutdown()]);
      await rm(temp,{recursive:true,force:true});
    }
  }

  {
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
    await evaluate(`(()=>{
      const f=__FORZERO__, r=f.race;
      f.ui.startTrial.click();
      if(r.phase!=='count' || r.countdownTicks<=0) throw Error('Mobile trial did not start its countdown');
      // Layout checks use the game countdown without relying on frame timing in a headless browser.
      const countdownTicks=r.countdownTicks;
      for(let i=0;i<countdownTicks;i++) r.step();
      f.updateHud();
    })()`);
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
