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
import { buildCustomNetworkRoute, buildRidingScene, captureRideEnvironment, courseGround, coursesByCampus, createWorldQuery,
  getPreferences, makeNetworkCourse, networkForCampus, raceEnvironmentKey, setActiveCampus, setPreferences } from '../src/test-exports.js';

function roadHudSample(campus, courseId, gateName) {
  const course = coursesByCampus[campus].find(item => item.id === courseId);
  const gate = course.gates.find(item => item.name === gateName);
  const query = createWorldQuery(campus);
  const position = courseGround(course, gate.p);
  const [x, , z] = position;
  return {
    position,
    heading: Math.atan2(gate.f[2], gate.f[0]),
    paved: query.surfaceAt(x, z),
    surfaceKind: query.surfaceKindAt(x, z),
  };
}

const dujuanStart = roadHudSample('szu', 'dujuan-climb', '立德门内侧');
const dujuanSlope = roadHudSample('szu', 'dujuan-climb', '坡脚入口');
const shenbuGravel = roadHudSample('shunde', 'shenbu-climb', '林中折返');

function environmentGhost(event, run, profile, { windSpeed = 0, trafficSeed } = {}) {
  const previous = getPreferences();
  setPreferences({ ...previous, weather:'day', traffic:'sparse', collision:false, windSpeed, windDir:0, windMode:'steady' });
  try {
    const settings = captureRideEnvironment(event);
    const environment = raceEnvironmentKey(event, { ...settings, trafficSeed: trafficSeed ?? settings.trafficSeed });
    return makeGhostFile(event,{ ...run, environment },profile);
  } finally { setPreferences(previous); }
}

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

  async function evaluate(expression, targetSession = sessionId) {
    const result = await rpc('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, targetSession);
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  }

  async function wait(expression, label, targetSession = sessionId) {
    const until = Date.now() + 35_000;
    while (!await evaluate(expression, targetSession)) {
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

  const garage = await evaluate(`(()=>{
    const f=__FORZERO__, u=f.ui;
    const keys=['szu-litchi-driver-1','szu-litchi-bike-1','szu-litchi-tuning-1',f.PREF_KEY];
    const saved=keys.map(key=>localStorage.getItem(key));
    const select=(control,value)=>{
      control.value=value;
      control.dispatchEvent(new Event('change',{bubbles:true}));
    };
    const configure=(controls,values)=>{
      controls.forEach((control,index)=>control.value=values[index]);
      controls[0].dispatchEvent(new Event('change'));
    };
    const labels=['雨地抓地','雨地带刹抓地','雨地直线制动'];
    const poweredParts=()=>Array.from(u.vehSlots.querySelectorAll('select'));
    const choosePowered=(key,value)=>select(u.vehSlots.querySelector('select[name="'+key+'"]'),value);
    const start=${JSON.stringify(dujuanStart)}, slope=${JSON.stringify(dujuanSlope)};
    const readRoadHud=(rider,sample,heading=sample.heading)=>{
      Object.assign(rider,sample,{heading});
      f.updateHud();
      return {
        grade:u.slopeGrade.textContent,
        surface:u.surfaceType.textContent,
        visible:u.slopeGrade.getBoundingClientRect().width>0 && u.surfaceType.getBoundingClientRect().width>0,
        sharedRow:u.slopeGrade.closest('.drive-road-row')===u.surfaceType.closest('.drive-road-row') &&
          Boolean(u.slopeGrade.closest('.speedometer')),
      };
    };
    const visibleWind=()=>u.windPill.getBoundingClientRect().width>0 && Boolean(u.windPill.closest('.speedometer .speed-badges'));
    const read=panel=>{
      const rows=new Map(Array.from(panel.children,row=>[row.firstElementChild.textContent,row.querySelector('output').textContent]));
      return labels.map(label=>rows.get(label));
    };
    const inspectVehicle=(vehicle,panel)=>{
      select(u.vehiclePicker,vehicle);
      const meter=document.querySelector('#gripMeter[role=meter]'), instrument=meter.closest('.speedometer');
      const gripValue=document.querySelector('#gripValue'), gripLabel=document.querySelector('#gripLabel');
      const r=f.race;
      const previous={rider:r.rider,freeClock:r.freeClock,previousRiderPose:r.previousRiderPose,
        moved:r.moved,freeHazardNotice:r.freeHazardNotice};
      const introHidden=u.intro.hidden;
      try {
        r.rider={...r.rider,position:r.rider.position.slice(),speed:6,steering:.9,yawRate:0,draft:null};
        const atRest=Number(meter.getAttribute('aria-valuenow'));
        r.step({gas:false,brake:false,left:false,right:true,sprint:false});
        f.updateHud();
        const turning=Number(meter.getAttribute('aria-valuenow'));
        return {
          vehicle:r.rider.vehicle,
          labels:Array.from(panel.children,row=>row.firstElementChild.textContent),
          slots:vehicle==='bike'?[]:poweredParts().map(control=>control.name),
          hud:Boolean(instrument && instrument.contains(u.sprintMeter) && instrument.contains(gripValue) &&
            instrument.contains(gripLabel) && meter.getBoundingClientRect().width>0 && gripLabel.textContent==='抓地余量'),
          responsive:atRest===100 && turning>0 && turning<atRest && gripValue.textContent===turning+'%',
          road:[readRoadHud(r.rider,slope),readRoadHud(r.rider,slope,slope.heading+Math.PI),readRoadHud(r.rider,start)],
        };
      } finally {
        Object.assign(r,previous);
        f.updateHud();
        u.intro.hidden=introHidden;
      }
    };
    u.bikeButton.click();
    const initialVehicle=u.vehiclePicker.value;
    const initialBudget=u.budgetPicker.value;
    const {windSpeed,windMode}=f.preferences;
    const bikeParts=[u.bikeTyres,u.bikeGears,u.bikeBrakes,u.bikeFrame,u.bikeSprint];
    const initialBike=bikeParts.map(control=>control.value);
    let initialEbike;
    try {
      const vehicles=['bike','ebike','chair','trail'].map(vehicle=>inspectVehicle(vehicle,vehicle==='bike'?u.bikeAbility:u.vehAbility));
      select(u.vehiclePicker,'bike');
      configure(bikeParts,['usedSlick','stock','stock','stock','stock']);
      const usedSlick=read(u.bikeAbility);
      configure(bikeParts,['traction','stock','control','stock','stock']);
      const tractionControl=read(u.bikeAbility);
      const grass=Array.from(u.bikeAbility.children).some(row=>row.firstElementChild.textContent==='草地表现');
      select(u.vehiclePicker,'ebike');
      initialEbike=Object.fromEntries(poweredParts().map(control=>[control.name,control.value]));
      for (const control of poweredParts()) select(control,'stock');
      choosePowered('tyres','grip');
      choosePowered('brakes','combo');
      const powered=read(u.vehAbility);
      const geometry=u.vehSlots.querySelector('select[name=geometry]');
      select(geometry,'shortWheelbase');
      const geometrySaved=f.race.rider.tuning.parts.geometry==='shortWheelbase' &&
        JSON.parse(localStorage.getItem('szu-litchi-tuning-1')).ebike.geometry==='shortWheelbase' && geometry.isConnected;
      select(geometry,'stock');
      choosePowered('motor','standard');
      choosePowered('thermal','regenTuning');
      select(u.budgetPicker,'700');
      const at710=u.budgetReadout.textContent;
      f.closeSettings();
      u.startTrial.click();
      const rejected=f.race.phase==='free' && u.settingsDialog.open && !u.bikeSettings.hidden &&
        u.vehSlots.querySelector('select[name=thermal]').dataset.overBudget==='true';
      choosePowered('thermal','quickCooling');
      const at660=u.budgetReadout.textContent;
      const budgetCleared=u.budgetReadout.dataset.over==='false' && !u.vehSlots.querySelector('[data-over-budget]');
      f.closeSettings();
      Object.assign(f.preferences,{windSpeed:4,windMode:'steady'});
      f.updateHud();
      const freeWind=visibleWind();
      u.startTrial.click();
      const accepted=f.race.phase==='count' && f.race.rider.tuning.parts.thermal==='quickCooling';
      const timedRoad=readRoadHud(f.race.rider,slope);
      const timedWind=visibleWind();
      u.bikeButton.click();
      const locked=poweredParts().length===5 && poweredParts().every(control=>control.disabled);
      return {usedSlick,tractionControl,grass,powered,vehicles,timedRoad,freeWind,timedWind,
        budget:{at710,at660,geometrySaved,rejected,budgetCleared,accepted,locked}};
    } finally {
      Object.assign(f.preferences,{windSpeed,windMode});
      if (f.race.phase!=='free') {
        f.closeSettings();
        u.freeRide.click();
      }
      if (!u.settingsDialog.open) u.bikeButton.click();
      if (initialEbike) {
        select(u.vehiclePicker,'ebike');
        for (const [slot,value] of Object.entries(initialEbike)) choosePowered(slot,value);
      }
      select(u.budgetPicker,initialBudget);
      select(u.vehiclePicker,'bike');
      configure(bikeParts,initialBike);
      select(u.vehiclePicker,initialVehicle);
      keys.forEach((key,index)=>saved[index]===null?localStorage.removeItem(key):localStorage.setItem(key,saved[index]));
      f.closeSettings();
    }
  })()`);
  const { vehicles, budget, timedRoad, freeWind, timedWind, ...rainStats } = garage;
  assert.deepEqual(rainStats, {
    usedSlick:['-48%','-48%','持平'], tractionControl:['+31%','+42%','-5%'],
    grass:true, powered:['+15%','+24%','-3%'],
  }, 'Garage rain grip, braking grip and straight braking deltas');
  const sharedStats = ['铺装抓地','低速推力','直线制动','雨地抓地','雨地带刹抓地','雨地直线制动'];
  const expectedSlots = {
    bike: [],
    ebike: ['tyres','motor','brakes','geometry','thermal'],
    chair: ['wheels','motor','caster','brakes','motorSplit'],
    trail: ['tyres','gears','suspension','brakes','traction'],
  };
  assert.deepEqual(vehicles.map(({ vehicle }) => vehicle), ['bike','ebike','chair','trail']);
  const asphalt = grade => ({grade,surface:'柏油路面',visible:true,sharedRow:true});
  for (const { vehicle, labels, slots, hud, responsive, road } of vehicles) {
    assert.equal(labels.length, sharedStats.length + 2, vehicle + ' garage stat count');
    assert.deepEqual(labels.slice(0, sharedStats.length), sharedStats, vehicle + ' shared garage stats');
    assert.deepEqual(slots, expectedSlots[vehicle], vehicle + ' powered tuning slots');
    assert.ok(hud && responsive, vehicle + ' shared grip HUD did not respond to turning');
    assert.deepEqual(road, ['+5.5%','−5.5%','0.0%'].map(asphalt), vehicle + ' Dujuan uphill/downhill/flat HUD');
  }
  assert.deepEqual(timedRoad, asphalt('+5.5%'), 'Timed and free riding share the same surface and grade row');
  assert.ok(freeWind && timedWind, 'Wind is visible in the main instrument in free and timed riding');
  assert.match(budget.at710, /¥710.*¥700.*¥10/);
  assert.match(budget.at660, /¥660.*¥700/);
  for (const key of ['geometrySaved','rejected','budgetCleared','accepted','locked']) {
    assert.equal(budget[key], true, 'Five-slot powered workshop ' + key);
  }

  const environment = await evaluate(`(()=>{
    const f=__FORZERO__, u=f.ui, r=f.race;
    const controls=[[u.settingsWeather,'weather'],[u.settingsWindSpeed,'windSpeed'],
      [u.settingsWindMode,'windMode'],[u.settingsWindDir,'windDir']];
    const saved=localStorage.getItem(f.PREF_KEY);
    const settings=controls.map(([,key])=>f.preferences[key]);
    const change=(control,value)=>{control.value=String(value);control.dispatchEvent(new Event('change'));};
    const edit=values=>{
      f.openSettings();
      controls.forEach(([control],index)=>change(control,values[index]));
      f.closeSettings();
      f.updateHud();
    };
    const snapshot=()=>({phase:r.phase,environment:r.environmentKey,wind:u.windPill.hidden?'':u.windPill.textContent,
      dry:u.weatherOverlay.hidden});
    try {
      edit(['day',0,'steady',0]);
      u.startTrial.click();
      const initial=snapshot();
      edit(['rain',9,'steady',0]);
      const countdown=snapshot();
      const ticks=r.countdownTicks;
      for(let i=0;i<ticks;i++) r.step();
      edit(['rain',15,'steady',0]);
      r.rider.heading=Math.PI;
      r.step({gas:false,brake:false,left:false,right:false,sprint:false});
      f.updateHud();
      const racing=snapshot(), headwind=r.feedbackStats.headwindLoad;
      u.freeRide.click();
      u.startTrial.click();
      f.updateHud();
      return {initial,countdown,racing,headwind,next:snapshot()};
    } finally {
      if(r.phase!=='free') u.freeRide.click();
      edit(settings);
      if(saved===null) localStorage.removeItem(f.PREF_KEY);
      else localStorage.setItem(f.PREF_KEY,saved);
    }
  })()`);
  assert.deepEqual(environment.initial,{phase:'count',environment:environment.initial.environment,wind:'',dry:true});
  assert.ok(environment.initial.environment, 'Time trial did not capture an environment identity');
  assert.deepEqual(environment.countdown,environment.initial,'Settings reconfigured the live countdown environment');
  assert.deepEqual(environment.racing,{...environment.initial,phase:'race'},'Settings affected live race weather or wind');
  assert.equal(environment.headwind,0,'Mid-race physics used the next race’s headwind');
  assert.equal(environment.next.phase,'count');
  assert.notEqual(environment.next.environment,environment.initial.environment);
  assert.match(environment.next.wind,/15\.0/);
  assert.equal(environment.next.dry,false,'The next launch did not use the saved rain setting');

  const hudModes = await evaluate(`(()=>{
    const {race:r,ui:u,updateHud}=__FORZERO__;
    const previousMode=u.raceMode.value;
    const visible=element=>element.getClientRects().length>0;
    const state=()=>({
      driving:[u.velocity,u.slopeGrade,u.gripMeter,u.sprintMeter].every(visible),
      timing:visible(u.timing),
      activity:visible(u.activityHud)?u.activityHud.dataset.mode:null,
      callout:visible(u.callout)?u.callout.dataset.mode:null,
      warning:visible(u.routeWarning)?u.routeWarning.textContent:null,
    });
    try {
      const free=state();
      u.courierButton.click();
      const courier=state();
      const courierTitle=u.activityTitle.textContent;
      u.raceMode.value='solo';
      u.startTrial.click();
      const countdown=state();
      const ticks=r.countdownTicks;
      for (let i=0;i<ticks;i++) r.step();
      updateHud();
      const next=u.next.textContent;

      // Cross a future checkpoint while the current one is still outstanding.
      const gate=r.event.gates[r.nextGate+1];
      const before=r.rider.position;
      const at=offset=>gate.p.map((axis,index)=>axis+gate.f[index]*offset+(index===1?(gate.rise??0):0));
      r.rider.position=at(.5);
      r.recordCheckpoint(at(-.5));
      r.rider.position=before;
      updateHud();
      const missed={flag:r.missedGate,warning:u.routeWarning.textContent,
        both:visible(u.next)&&visible(u.routeWarning),sameRoute:next===u.next.textContent};
      u.recover.click();
      const rejoined={warning:u.routeWarning.textContent,both:visible(u.next)&&visible(u.routeWarning)};
      u.freeRide.click();
      u.raceMode.value='chase';
      u.startTrial.click();
      const chase=state();
      const chaseTitle=u.activityTitle.textContent;
      u.pause.click();
      const paused=state();
      u.mapToggle.click();
      const mapHidesCallout=!visible(u.callout)&&visible(u.mapScreen);
      u.mapToggle.click();
      const resumedCallout=state();
      u.freeRide.click();
      return {free,courier,courierTitle,countdown,missed,rejoined,chase,chaseTitle,paused,
        mapHidesCallout,resumedCallout,after:state()};
    } finally {
      if (!u.mapScreen.hidden) u.mapToggle.click();
      u.raceMode.value=previousMode;
      updateHud();
    }
  })()`);
  const emptyHud = {driving:true,timing:false,activity:null,callout:null,warning:null};
  assert.deepEqual(hudModes.free, emptyHud);
  assert.deepEqual(hudModes.courier, {...emptyHud,activity:'courier'});
  assert.match(hudModes.courierTitle, /^闪送目标/);
  assert.deepEqual(hudModes.countdown, {...emptyHud,timing:true,callout:'count'});
  assert.match(hudModes.missed.warning, /漏过检查点.*按 F/);
  assert.ok(hudModes.missed.flag && hudModes.missed.both && hudModes.missed.sameRoute,
    'Missed checkpoint warning must coexist with the unchanged route');
  assert.match(hudModes.rejoined.warning, /已回到赛道/);
  assert.ok(hudModes.rejoined.both, 'Rejoin penalty must coexist with route guidance');
  assert.deepEqual(hudModes.chase, {...emptyHud,activity:'shadow-chase',callout:'count'});
  assert.match(hudModes.chaseTitle, /^影子追捕/);
  assert.deepEqual(hudModes.paused, {...hudModes.chase,callout:'paused'});
  assert.ok(hudModes.mapHidesCallout, 'Map must hide the paused chase callout');
  assert.deepEqual(hudModes.resumedCallout, hudModes.paused, 'Closing the map restores the current callout');
  assert.deepEqual(hudModes.after, emptyHud, 'Returning to free ride clears the previous mode');
  console.log('Shared HUD passed mode switching, route warnings and paused chase map transitions.');

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
    const key=f.checkpointRecordKey(r.event, r.rider.vehicle, r.environmentKey);
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
    return [r.record,JSON.parse(localStorage.getItem(f.checkpointRecordKey(r.event,r.rider.vehicle,r.environmentKey))).time,r.rider.bike.tyres];
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

  await evaluate(`(()=>{
    const f=__FORZERO__,u=f.ui;
    f.openSettings();
    for (const [control,value] of [[u.settingsWeather,'day'],[u.settingsTraffic,'sparse'],
      [u.settingsWindSpeed,'0'],[u.settingsWindDir,'0'],[u.settingsWindMode,'steady']]) {
      control.value=value;control.dispatchEvent(new Event('change'));
    }
    u.settingsCollision.checked=false;u.settingsCollision.dispatchEvent(new Event('change'));
    f.closeSettings();
  })()`);
  const calmCourse = coursesByCampus.szu.find(event=>event.id===fixtures.szu.ghost.course.id);
  const windyGhost = environmentGhost(calmCourse,{...fixtures.szu.ghost.run,vehicle:fixtures.szu.ghost.rider.vehicle},
    {...fixtures.szu.ghost.rider,name:'Wind QA'},{ windSpeed:15 });
  await uploadGhost(windyGhost);
  await wait(`__FORZERO__.ui.friendStatus.textContent==='Ghost conditions differ from the current settings. The ghost was archived.'`,
    'Different wind did not report an incompatible ghost');
  assert.deepEqual(await evaluate(`(async()=>{
    const f=__FORZERO__, saved=await f.buildSaveSnapshot(), archived=saved.friends.some(({score})=>score.name===${JSON.stringify(windyGhost.rider.name)});
    return {archived, opponent:f.race.opponent, phase:f.race.phase};
  })()`),{archived:true,opponent:null,phase:'free'},'Different wind file entered live comparison');
  await evaluate('__FORZERO__.ui.friendClose.click()');

  for (const campus of ['szu', 'ucl', 'shunde']) {
    const ghost = fixtures[campus].ghost;
    await uploadGhost(ghost);
    await wait(`__FORZERO__.ui.friendStatus.textContent==='Ghost conditions are unverified. The ghost was archived.'`,
      `${campus} unverified ghost did not report archive status`);
    const archive = await evaluate(`(async()=>{
      const f=__FORZERO__, saved=await f.buildSaveSnapshot();
      const archived=saved.friends.find(({score})=>score.campus===${JSON.stringify(campus)} && score.name===${JSON.stringify(ghost.rider.name)});
      return {layout:archived?JSON.parse(archived.replay).course.layout:null,opponent:f.race.opponent?.name??null};
    })()`);
    assert.equal(archive.layout,ghost.course.layout,`${campus} unverified ghost replay did not survive archival`);
    assert.notEqual(archive.opponent,ghost.rider.name,`${campus} unverified ghost entered live comparison`);
    await evaluate('__FORZERO__.ui.friendClose.click()');
    const legacyEvent = coursesByCampus[campus].find(event=>event.id===ghost.course.id);
    const verified = environmentGhost(legacyEvent,{...ghost.run,vehicle:ghost.rider.vehicle},{...ghost.rider,name:`Verified ${campus} QA`});
    await uploadGhost(verified);
    await wait(`__FORZERO__.activeCampus===${JSON.stringify(campus)} && __FORZERO__.race.event.id===${JSON.stringify(ghost.course.id)} && __FORZERO__.race.opponent?.name===${JSON.stringify(verified.rider.name)} && !__FORZERO__.ui.friendDialog.open`, `${campus} matching ghost import or map travel failed`);
    assert.equal(await evaluate('__FORZERO__.race.opponent.time'), ghost.run.time);
    assert.equal(await evaluate('__FORZERO__.race.opponent.environment'),verified.course.environment);
    assert.equal(await evaluate(`/[\\p{Script=Han}]/u.test(__FORZERO__.ui.courseBrief.textContent + __FORZERO__.ui.stationList.textContent + __FORZERO__.ui.campusName.textContent)`), false, `${campus} course copy or checkpoint names`);
    console.log(campus, 'unverified ghost archived and matching ghost accepted through the packaged browser UI');
    if (campus === 'szu') {
      const roomGhost = environmentGhost(legacyEvent, {...ghost.run, vehicle:ghost.rider.vehicle},
        {...ghost.rider, name:'Room Seed QA'}, { trafficSeed:2318273997 });
      await uploadGhost(roomGhost);
      await wait("__FORZERO__.race.opponent?.name==='Room Seed QA' && !__FORZERO__.ui.friendDialog.open", 'matching room-seeded ghost was archived without starting a challenge');
      await evaluate('__FORZERO__.ui.friendButton.click()');
      await wait("__FORZERO__.ui.friendScores.textContent.includes('Uses the Recorded Room Seeds') && [...__FORZERO__.ui.friendScores.querySelectorAll('.friend-play:not(:disabled)')].some(button=>button.getAttribute('aria-label').includes('Room Seed QA'))",
        'archived room-seeded ghost was unavailable');
      await evaluate("[...__FORZERO__.ui.friendScores.querySelectorAll('.friend-play:not(:disabled)')].find(button=>button.getAttribute('aria-label').includes('Room Seed QA')).click()");
      await wait('!__FORZERO__.ui.friendDialog.open', 'room-seeded replay did not load from archive');
      await evaluate('__FORZERO__.ui.startTrial.click()');
      await wait("__FORZERO__.race.phase==='count'&&__FORZERO__.race.raceTraffic.seed==='2318273997'&&__FORZERO__.race.environmentKey===__FORZERO__.race.opponent.environment",
        'solo race did not use the recorded room formation');
      await evaluate('__FORZERO__.ui.freeRide.click()');
    }
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
    let waypoints = Object.keys(network.endpoints).slice(0, 3);
    if (campus === 'ucl') {
      const loop = ['endsleighGordon', 'endsleighTaviton', 'endsleighStreetN', 'gordonNE', 'tavitonGordon', 'gordonNW'];
      waypoints = [...Array.from({ length: 6 }, () => loop).flat(), loop[0]];
    }
    const route = buildCustomNetworkRoute(campus, waypoints, network);
    assert.equal(route.valid, true);
    const event = makeNetworkCourse(route.route, network);
    if (campus === 'ucl') {
      assert.ok(route.totalLength > 1280 && route.code.length > 256);
      await evaluate('__FORZERO__.ui.mapToggle.click()');
      assert.equal(await evaluate("document.getElementById('hospitalRoute') === null"), true);
      assert.equal(await evaluate('__FORZERO__.ui.mapRouteBuild.hidden'), false);
      await evaluate('__FORZERO__.ui.mapRouteBuild.click()');
      assert.match(await evaluate('__FORZERO__.ui.routeBuilderStatus.textContent'), /max 3000 m and 64 road segments/);
      assert.equal(await evaluate('__FORZERO__.ui.routeBuildApply.disabled'), true);
      await evaluate('__FORZERO__.ui.mapToggle.click();__FORZERO__.ui.seedButton.click();__FORZERO__.ui.seedInput.select()');
      assert.equal(await evaluate('__FORZERO__.ui.seedInput.maxLength'), saveRules.ROUTE_RULES.maxCodeLength);
      await rpc('Input.insertText', { text: route.code }, sessionId);
      assert.equal(await evaluate('__FORZERO__.ui.seedInput.value'), route.code);
      await evaluate('__FORZERO__.ui.seedForm.requestSubmit()');
      await wait(`!__FORZERO__.ui.seedDialog.open && __FORZERO__.race.event.id===${JSON.stringify(event.id)}`, 'UCL long workshop code did not import');
      await evaluate('__FORZERO__.ui.startTrial.click()');
      await wait("__FORZERO__.race.phase==='count'||__FORZERO__.race.phase==='race'", 'UCL long workshop route did not start');
      await evaluate('__FORZERO__.ui.freeRide.click()');
    }
    const networkGhost = environmentGhost(event, { ...event.benchmark, vehicle: 'bike' }, { name: 'Workshop QA', paint: 'classic' });
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
  const variantGhost = environmentGhost(lake,{...lake.benchmark,vehicle:'bike'},{name:'Reverse QA',paint:'classic'});
  await uploadGhost(variantGhost);
  await wait("__FORZERO__.race.opponent?.name==='Reverse QA' && !__FORZERO__.ui.friendDialog.open", 'Reverse three-lap ghost did not import');
  await evaluate('__FORZERO__.ui.friendButton.click()');
  await wait(`[...__FORZERO__.ui.friendScores.querySelectorAll('.friend-play:not(:disabled)')].some(button=>button.getAttribute('aria-label').includes('Reverse'))`, 'Archived reverse three-lap ghost was disabled');
  await evaluate(`[...__FORZERO__.ui.friendScores.querySelectorAll('.friend-play:not(:disabled)')].find(button=>button.getAttribute('aria-label').includes('Reverse')).click()`);
  await wait("!__FORZERO__.ui.friendDialog.open && __FORZERO__.race.opponent?.name?.startsWith('Reverse')", 'Archived reverse three-lap ghost did not launch');
  assert.deepEqual(await evaluate('__FORZERO__.race.event.variant'),{direction:'reverse',laps:3});
  await evaluate(`(()=>{
    const f=__FORZERO__,u=f.ui;
    f.openSettings();u.settingsWindSpeed.value='15';u.settingsWindSpeed.dispatchEvent(new Event('change'));
    f.closeSettings();u.startTrial.click();
  })()`);
  await wait("__FORZERO__.ui.friendDialog.open && __FORZERO__.ui.friendStatus.textContent.includes('conditions differ')",
    'A selected friend ghost did not recheck the environment at race start');
  assert.equal(await evaluate('__FORZERO__.race.phase'),'free');
  assert.ok(await evaluate(`(()=>{
    const f=__FORZERO__,u=f.ui,r=f.race;
    u.friendClose.click();f.openSettings();u.settingsWindSpeed.value='0';u.settingsWindSpeed.dispatchEvent(new Event('change'));
    f.closeSettings();u.startTrial.click();
    const matched=r.phase==='count' && r.opponent?.name==='Reverse QA' && r.opponent.environment===r.environmentKey;
    const frozen = r.environmentKey;
    f.openSettings();u.settingsWindSpeed.value='15';u.settingsWindSpeed.dispatchEvent(new Event('change'));
    f.closeSettings();u.startTrial.click();
    const guarded = r.phase==='count' && r.environmentKey===frozen && !u.notice.hidden && u.notice.textContent.includes('conditions differ');
    f.openSettings();u.settingsWindSpeed.value='0';u.settingsWindSpeed.dispatchEvent(new Event('change'));f.closeSettings();
    u.freeRide.click();
    return matched && guarded;
  })()`),'Matching wind must allow launch and a rejected restart must keep the current countdown');
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
    const explorerKey = 'szu-litchi-explorer-1';
    const explorerProgress = totalDeliveries => JSON.stringify({ totalDeliveries, bestStreak: 1, discovered: {szu:[],ucl:[],shunde:[]} });
    function makeSaveShell(install) {
      const { saveDir, instanceId } = install;
      const shell = createAppShell({assets,saveDir,instanceId,bootTimeoutMs:0,idleMs:0});
      const [handleRequest] = shell.server.listeners('request');
      shell.server.off('request',handleRequest);
      shell.server.on('request',(req,res)=>{
        if (req.method==='POST' && req.url==='/app/save/pending' && install.blockPending) {
          req.resume();
          res.writeHead(500,{'content-type':'application/json'}).end('{"error":"QA pending write failed"}');
          return;
        }
        if (req.method==='POST' && req.url==='/app/save') {
          if (install.blockWrites) {
            req.resume();
            res.writeHead(500,{'content-type':'application/json'}).end('{"error":"QA disk write failed"}');
            return;
          }
          if (install.holdNextSave) {
            install.holdNextSave = false;
            const end = res.end.bind(res);
            res.end = (...args) => {
              install.heldSave = {status: res.statusCode, release: () => {
                if (!res.destroyed && !res.writableEnded) end(...args);
              }};
              return res;
            };
          }
        }
        handleRequest(req,res);
      });
      return shell;
    }
    const makeInstall = async (name, progress = {}) => {
      const saveDir = join(temp,name);
      const file = join(saveDir,'player-data.json');
      const instanceId = createHash('sha256').update(saveDir).digest('hex');
      const snapshot = {
        format:'litchi-save',version:1,updatedAt:'2000-01-01T00:00:00Z',
        storage:{[driver]:JSON.stringify({name}), ...progress},
        friends:[{score:{campus:archiveCourse.campus,courseId:archiveCourse.id,layout:archiveCourse.layout,
          name,vehicle:archiveRider.vehicle,time:archiveRun.time},replay:JSON.stringify(fixtures.szu.ghost)}],
      };
      await mkdir(saveDir);
      await writeFile(file,JSON.stringify(snapshot));
      const install = {saveDir,file,instanceId,shell:null,blockWrites:false,blockPending:false,holdNextSave:false,heldSave:null};
      install.shell = makeSaveShell(install);
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
    async function verifySaveHandoff(closeBeforeAck, restart = null) {
      const name = restart ?? (closeBeforeAck ? 'Close before save acknowledgement' : 'Older save acknowledged after import');
      const install = await makeInstall(name, { [explorerKey]: explorerProgress(1) });
      const tabs = new Set();
      const shells = new Set([install.shell]);
      let browserContextId;
      const diskDeliveries = async () => JSON.parse((await loadSave(install)).storage[explorerKey]).totalDeliveries;
      const browserDeliveries = `(async()=>JSON.parse((await __FORZERO__.buildSaveSnapshot()).storage[${JSON.stringify(explorerKey)}]).totalDeliveries)()`;
      const pendingFile = join(install.saveDir,'player-data.pending.json');
      const pendingSaveOnDisk = () => readFile(pendingFile,'utf8').then(JSON.parse, error => {
        if (error.code !== 'ENOENT') throw error;
        return null;
      });
      const launcherSave = async url => {
        const response = await fetch(`${url}app/save`);
        assert.equal(response.status,200);
        const saved = await response.json();
        assert.equal(saved.instanceId,install.instanceId,`${name}: launcher must recover the same installation`);
        return saved;
      };
      async function closeTab(targetId) {
        const result = await rpc('Target.closeTarget',{targetId});
        assert.equal(result.success,true);
        tabs.delete(targetId);
      }
      async function openTab(url, expectedStatus) {
        const { targetId } = await rpc('Target.createTarget',{url:'about:blank', ...(browserContextId && {browserContextId})});
        tabs.add(targetId);
        const { sessionId: tabSession } = await rpc('Target.attachToTarget',{targetId,flatten:true});
        await rpc('Page.enable',{},tabSession);
        await rpc('Page.addScriptToEvaluateOnNewDocument',{source:`
          globalThis.qaSaveStatuses = [];
          globalThis.qaExplorerAtDocumentStart = localStorage.getItem(${JSON.stringify(`forzero-install:${install.instanceId}:${explorerKey}`)});
          const requestSave = fetch.bind(globalThis);
          globalThis.fetch = async (url, options) => {
            const response = await requestSave(url, options);
            if (url === '/app/save' && options?.method === 'POST') qaSaveStatuses.push(response.status);
            return response;
          };
        `},tabSession);
        const nav = await rpc('Page.navigate',{url},tabSession);
        assert.ok(!nav.errorText,nav.errorText);
        await wait(`globalThis.__FORZERO__?.ready && qaSaveStatuses.includes(${expectedStatus})`,
          `${name}: browser did not hydrate and attempt a save`,tabSession);
        return { targetId, tabSession };
      }
      async function importDeliveries(tab, count, status = '存档已导入') {
        const backup = {format:'litchi-save',version:1,storage:{[explorerKey]:explorerProgress(count)}};
        await evaluate(`(()=>{
          const f=__FORZERO__, upload=new DataTransfer();
          f.openSettings();
          upload.items.add(new File([${JSON.stringify(JSON.stringify(backup))}],'delivery-progress.json',{type:'application/json'}));
          f.ui.saveFile.files=upload.files;
          f.ui.saveFile.dispatchEvent(new Event('change'));
        })()`,tab.tabSession);
        await wait(`(async()=>__FORZERO__.ui.saveStatus.textContent.startsWith(${JSON.stringify(status)}) && (await ${browserDeliveries})===${count})()`,
          `${name}: the UI did not confirm the ${count}-delivery import`,tab.tabSession);
      }
      try {
        const port = await start(install.shell,0);
        let url = `http://127.0.0.1:${port}/`;
        const tab = await openTab(url,200);
        assert.equal(await evaluate(browserDeliveries,tab.tabSession),1);
        const acknowledged = await evaluate('qaSaveStatuses.length',tab.tabSession);
        install.holdNextSave = true;
        await importDeliveries(tab,2);
        const timeout = Date.now()+15_000;
        while (!install.heldSave) {
          assert.ok(Date.now()<timeout,`${name}: the old response was not held`);
          await delay(25);
        }
        assert.equal(install.heldSave.status,200);
        assert.equal(await diskDeliveries(),2,`${name}: the older POST must reach disk before the newer import`);
        assert.equal(await evaluate('qaSaveStatuses.length',tab.tabSession),acknowledged);
        install.blockWrites = true;
        await importDeliveries(tab,134);
        const staged = restart ? await launcherSave(url) : null;
        const persisted = restart ? await pendingSaveOnDisk() : null;
        if (!closeBeforeAck) {
          install.heldSave.release();
          await wait(`qaSaveStatuses.slice(${acknowledged}).includes(200)`,`${name}: the older acknowledgement did not reach Chrome`,tab.tabSession);
        }
        if (restart) assert.equal(await evaluate(`qaSaveStatuses.slice(${acknowledged}).includes(200)`,tab.tabSession),false,
          `${name}: the old save response must still be held when closing the tab`);
        await closeTab(tab.targetId);
        install.heldSave.release();
        assert.equal(await diskDeliveries(),2);
        let recovered;
        if (restart) {
          const original = install.shell, replacement = makeSaveShell(install);
          shells.add(replacement);
          if (restart === 'Different port') {
            // Reserve another port while the original is still bound, then stop the original before navigating.
            const nextPort = await start(replacement,0);
            assert.notEqual(nextPort,port);
            await original.shutdown();
            url = `http://127.0.0.1:${nextPort}/`;
          } else {
            await original.shutdown();
            await start(replacement,port);
            ({ browserContextId } = await rpc('Target.createBrowserContext',{disposeOnDetach:true}));
          }
          install.shell = replacement;
          recovered = await launcherSave(url);
        }
        const reopened = await openTab(url,500);
        if (restart) assert.equal(await evaluate('qaExplorerAtDocumentStart',reopened.tabSession),null,
          `${name}: reopened browser must have no installation progress before hydration`);
        assert.equal(await evaluate(browserDeliveries,reopened.tabSession),134,
          `${name}: reopening must preserve the locally confirmed import even while disk still contains 2 deliveries`);
        if (restart) {
          assert.equal(typeof staged.pendingRevision,'string',`${name}: launcher must persist pending progress before closing`);
          assert.equal(JSON.parse(staged.data.storage[explorerKey]).totalDeliveries,134);
          assert.equal(JSON.parse(persisted?.storage?.[explorerKey] ?? 'null')?.totalDeliveries,134,
            `${name}: the launcher must hold a durable pending copy next to the canonical file`);
          assert.equal(recovered.pendingRevision,staged.pendingRevision,`${name}: launcher restart lost the pending revision`);
          assert.equal(JSON.parse(recovered.data.storage[explorerKey]).totalDeliveries,134);
        }
        assert.equal(await diskDeliveries(),2);
        install.blockWrites = false;
        await wait('qaSaveStatuses.includes(200)',`${name}: reopened page did not resume the pending save`,reopened.tabSession);
        assert.equal(await diskDeliveries(),134,`${name}: recovery must also reach the desktop save file`);
        if (restart) {
          assert.equal((await launcherSave(url)).pendingRevision,null,`${name}: successful canonical save should clear the pending revision`);
          console.log(`${name} ${port} -> ${new URL(url).port}: fresh browser storage, canonical 2, recovered and committed 134.`);
        }
        if (closeBeforeAck && restart !== 'Fresh browser context') {
          await closeTab(reopened.targetId);
          const later = await loadSave(install);
          later.storage[explorerKey] = explorerProgress(135);
          const response = await fetch(`${url}app/save`, {method:'POST', headers:{
            'Content-Type':'application/json', 'X-Forzero-Installation':install.instanceId,
          }, body:JSON.stringify(later)});
          assert.equal(response.status,200);
          if (restart) {
            const originalPort = makeSaveShell(install);
            shells.add(originalPort);
            await install.shell.shutdown();
            await start(originalPort,port);
            url = `http://127.0.0.1:${port}/`;
          }
          const subsequent = await openTab(url,200);
          assert.equal(await evaluate(browserDeliveries,subsequent.tabSession),135,
            'The acknowledged browser revision must not override a later authoritative disk save');
          if (restart) {
            install.blockPending = install.blockWrites = true;
            await importDeliveries(subsequent,136,'存档已在此浏览器生效，启动器暂未保存，正在重试。');
            assert.equal(await diskDeliveries(),135,`${name}: rejected pending write must not advance the canonical save`);
            assert.equal((await launcherSave(url)).pendingRevision,null,`${name}: rejected pending write must not advertise recovery`);
          }
        }
      } finally {
        install.heldSave?.release();
        await Promise.allSettled([...tabs].map(closeTab));
        if (browserContextId) await rpc('Target.disposeBrowserContext',{browserContextId});
        await Promise.all([...shells].map(shell => shell.shutdown()));
      }
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
      return f.checkpointRecordKey(r.event,r.entryVehicle,r.environmentKey);
    })()`);
    const retrying = "__FORZERO__.ui.saveStatus.textContent==='桌面存档写入失败，正在重试。'";
    let first, second;
    try {
      await verifySaveHandoff(true);
      await verifySaveHandoff(false);
      await verifySaveHandoff(true,'Different port');
      await verifySaveHandoff(true,'Fresh browser context');
      console.log('Desktop progress survived tab close with a held or outdated save acknowledgement.');
      console.log('Launcher recovery retained 134 deliveries across a port change and a fresh browser context, then committed them to disk.');
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
    const mobileSlots = await evaluate(`(()=>{
      const f=__FORZERO__, u=f.ui;
      f.openSettings('bike');
      const initialVehicle=u.vehiclePicker.value;
      const selectVehicle=value=>{
        u.vehiclePicker.value=value;
        u.vehiclePicker.dispatchEvent(new Event('change'));
      };
      try {
        selectVehicle('ebike');
        const controls=Array.from(u.vehSlots.querySelectorAll('select'));
        const thermal=u.vehSlots.querySelector('select[name=thermal]');
        thermal.scrollIntoView({block:'center'});
        const rect=thermal.getBoundingClientRect(), dialog=u.settingsDialog.getBoundingClientRect();
        return {
          slotCount:controls.length,
          localized:/^[A-Za-z]/.test(thermal.labels[0]?.textContent) && /^[A-Za-z]/.test(thermal.selectedOptions[0]?.textContent),
          inView:rect.width>0 && rect.left>=dialog.left && rect.right<=dialog.right && rect.top>=dialog.top && rect.bottom<=dialog.bottom,
        };
      } finally {
        selectVehicle(initialVehicle);
        f.closeSettings();
      }
    })()`);
    assert.deepEqual(mobileSlots, {slotCount:5,localized:true,inView:true}, 'Powered workshop fifth slot in English on mobile');
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
    const previousMobileWind = await evaluate(`(()=>{
      const f=__FORZERO__, r=f.race;
      const {windSpeed,windMode}=f.preferences;
      Object.assign(f.preferences,{windSpeed:4,windMode:'steady'});
      f.ui.startTrial.click();
      if(r.phase!=='count' || r.countdownTicks<=0) throw Error('Mobile trial did not start its countdown');
      // Layout checks use the game countdown without relying on frame timing in a headless browser.
      const countdownTicks=r.countdownTicks;
      for(let i=0;i<countdownTicks;i++) r.step();
      f.updateHud();
      return {windSpeed,windMode};
    })()`);
    await wait("__FORZERO__.race.phase==='race' && !__FORZERO__.ui.next.hidden && !__FORZERO__.ui.fpsCounter.hidden", 'Mobile race guidance did not appear');
    for (const [width,height] of [[320,568],[390,844],[844,390],[568,320]]) {
      await rpc('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:2,mobile:true},sessionId);
      await wait(`innerWidth===${width}`, 'Mobile viewport did not resize');
      const fit = await evaluate(`(()=>{
        const f=__FORZERO__, u=f.ui, r=f.race, box=element=>element.getBoundingClientRect();
        const rider=r.rider, campus=f.activeCampus;
        const missedGate=r.missedGate;
        const sample=${JSON.stringify(shenbuGravel)};
        const fitsHorizontally=(inner,outer)=>inner.width>0 && inner.left>=outer.left && inner.right<=outer.right;
        try {
          f.activeCampus='shunde';
          r.rider={...rider,...sample,speed:30,inPuddle:true,draft:{charge:.6}};
          r.missedGate=true;
          f.updateHud();
          const view=box(f.stage), fps=box(u.fpsCounter), next=box(u.next), warning=box(u.routeWarning), camera=box(u.cameraToggle),
            left=box(document.querySelector('.touch-steer')), right=box(document.querySelector('.touch-pedals')),
            speedometer=box(document.querySelector('.speedometer')), grip=box(u.gripMeter),
            speed=box(document.querySelector('.speed-readout')), road=box(document.querySelector('.drive-road-row')),
            surface=box(u.surfaceType), grade=box(u.slopeGrade), roadName=document.querySelector('#roadName');
          return {
            guidance:fps.width>0 && next.width>0 && fps.top>=next.bottom,
            routeFits:next.right <= view.right && next.left >= view.left,
            buttonsFit:left.width>0 && right.width>0 && left.left>=view.left && right.right<=view.right && left.right<=right.left,
            cameraFits:camera.width>0 && camera.left>=view.left && camera.right<=view.right,
            gripFits:fitsHorizontally(grip,speedometer),
            speedFits:u.velocity.textContent==='108' && fitsHorizontally(speed,speedometer),
            roadFits:u.surfaceType.textContent==='Gravel' && u.slopeGrade.textContent==='+8.2%' &&
              fitsHorizontally(surface,road) && fitsHorizontally(grade,road) &&
              (surface.right<=grade.left || grade.right<=surface.left || surface.bottom<=grade.top || grade.bottom<=surface.top),
            roadNameFits:Boolean(roadName && !roadName.hidden && roadName.textContent==='Shenbu Mountain Ascent' &&
              fitsHorizontally(box(roadName),speedometer)),
            statusFits:[u.windPill,u.puddleStatus,u.draftPill].every(element=>!element.hidden &&
              fitsHorizontally(box(element),view)) && u.windPill.textContent.includes('4.0'),
            warningFits:fitsHorizontally(warning,view) && warning.top>=view.top && warning.bottom<=view.bottom &&
              next.height>0 && (warning.bottom<=next.top || next.bottom<=warning.top),
            touchRecovery:u.routeWarning.textContent,
            bounds:[view,next,warning].map(({left,right,top,bottom})=>[left,right,top,bottom]),
          };
        } finally {
          r.rider=rider;
          r.missedGate=missedGate;
          f.activeCampus=campus;
          f.updateHud();
        }
      })()`);
      const { bounds, guidance, routeFits, buttonsFit, cameraFits, warningFits, touchRecovery, ...drivingFit } = fit;
      const layout = `${width}×${height} at 150%, stage/route/warning bounds ${JSON.stringify(bounds)}`;
      assert.deepEqual(drivingFit,{gripFits:true,speedFits:true,roadFits:true,roadNameFits:true,statusFits:true},'Driving HUD: '+layout);
      assert.ok(warningFits,'Route warning and next checkpoint: '+layout);
      assert.match(touchRecovery,/Rejoin in Settings/,'Touch route recovery: '+layout);
      assert.deepEqual({guidance,routeFits,buttonsFit,cameraFits},
        {guidance:true,routeFits:true,buttonsFit:true,cameraFits:true},'Navigation and controls: '+layout);
    }
    await evaluate(`Object.assign(__FORZERO__.preferences,${JSON.stringify(previousMobileWind)})`);
    const timeOrigin = await evaluate('performance.timeOrigin');
    await rpc('Page.reload',{},sessionId);
    await wait(`performance.timeOrigin!==${timeOrigin} && globalThis.__FORZERO__?.ready===true && __FORZERO__.preferences.hudScale===150 && __FORZERO__.preferences.touchSize===150`, 'Custom scales did not survive reload');
    const blindHint = await evaluate(`(() => {
      const { ui, updateHud } = __FORZERO__;
      const previousMode = ui.raceMode.value;
      ui.raceMode.value = 'blind';
      try {
        ui.startTrial.click();
        return { hint: ui.blindHint.textContent, bell: ui.touchBell.getBoundingClientRect().width > 0,
          tone:ui.blindHint.dataset.tone,timing:!ui.timing.hidden,objective:!ui.activityHud.hidden };
      } finally {
        ui.freeRide.click();
        ui.raceMode.value = previousMode;
        updateHud();
      }
    })()`);
    assert.deepEqual(blindHint, { hint: 'Night Blind · Tap the bell for direction', bell: true,
      tone:'info',timing:true,objective:false });
    const mobileCourier = await evaluate(`(()=>{
      const {ui,stage}=__FORZERO__;
      ui.courierButton.click();
      const card=ui.activityHud.getBoundingClientRect(),view=stage.getBoundingClientRect();
      return {mode:ui.activityHud.dataset.mode,timing:!ui.timing.hidden,night:!ui.blindHint.hidden,
        fits:card.width>0 && card.left>=view.left && card.right<=view.right &&
          card.top>=view.top && card.bottom<=view.bottom};
    })()`);
    assert.deepEqual(mobileCourier,{mode:'courier',timing:false,night:false,fits:true});
    assert.deepEqual(await evaluate('qaErrors'), [], 'mobile errors');
  }
  console.log('Desktop language persistence, race UI and mobile English touch controls passed.');
} finally {
  await close();
}
