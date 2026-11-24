import { neutralDrive } from '../core/clock.js';
import {
  add, clamp, dot, headingVector, length, lerpPoint, multiply, normalize, perspective, placement,
  random, scale, subtract, transform, unitRight, viewAt,
} from '../core/math.js';
import { Shape } from '../core/shape.js';
import { getActiveCampus, setActiveCampus, setPreferences, worldState } from '../core/state.js';
import { CampusCourier, makeCourierBeaconShape, nearestCourierLandmark } from '../race/courier.js';
import { courseMedalSummary, isPaintUnlocked, liveDeltaMs, splitLabel, trialMedal } from '../race/records.js';
import { aiRank } from '../race/rivals.js';
import { readSeedCode, seedVersion, weeklySeed } from '../race/seed-code.js';
import { TimeTrial } from '../race/time-trial.js';
import { currentWeather, drawRainOverlay, knownWeather, setActiveWeather } from '../render/atmosphere.js';
import { courseDecor, disposeRidingScene, uploadRidingScene } from '../render/scene-upload.js';
import { renderer } from '../render/webgl-renderer.js';
import {
  GhostFileError, MAX_GHOST_BYTES, ghostCourseKey, loadFriendGhost, makeGhostFile,
  readFriendScores, readGhostFile, readSavedFriendGhost, removeSavedFriendGhost,
  replayAt, saveFriendGhost,
} from '../replay/ghost.js';
import { advanceMapReplay, mapReplay, replayGapAt } from '../replay/map-replay.js';
import { soloBudget, workshopBudget } from '../ride/budget.js';
import {
  FRONT, REAR, TYRE_RADIUS, bicycleRigCache, bicycleRock, makeRider, movingParts,
  poweredPose, uploadPoweredRig,
} from '../ride/models.js';
import { speedFov, vehicleSkills } from '../ride/physics.js';
import { tuning190 } from '../ride/tuning-rules.js';
import {
  DEFAULT_RIDER_NAME, bicycleAbility, bicycleAppearance, bicycleGravelSpeed,
  bicyclePaints, bicyclePartKeys, bicyclePresets, bicycleStyle, bicycleStyles, bikeKey,
  bikePartOptions, brakeChoices, buildBike, buildVehicleTuning, chairCheerClock,
  frameChoices, gearChoices, knownPaint, knownVehicle, normalizeVehicleParts,
  readDriverProfile, riderName, savedBike, savedVehicleTunings, sprintChoices, stockBike,
  storeDriverProfile, storeVehicleTunings, tyreChoices, vehicleChoices,
  vehicleTuningChoices, workshopPartTitle, workshopSpeed,
} from '../ride/vehicles.js';
import { knownWindMode, rainPuddleShape, windEffectLabel } from '../world/environment.js';
import { along, clearWorldShapes, plannedSpeed, sceneLists } from '../world/geometry.js';
import {
  bridgeAxis, mountainRoadAt, mountainUp, parkBridgeSide, parkPaved, parkPavilionDeck,
  shundeShortcutAt,
} from '../world/maps/shunde.js';
import { activeStage, campus, cityStreetAt, inCampus } from '../world/maps/szu.js';
import { londonPlaces, uclStreetAt, uclWayByPath } from '../world/maps/ucl.js';
import { buildingAt, cityWallAt, courseGround, rideElevation, riderGrade } from '../world/query.js';
import { buildRidingScene, campuses, courseByCampus, courses, coursesByCampus } from '../world/scene-builder.js';
import { availableCourses, makeSeedCourse } from '../world/seed-courses.js';
import { knownTraffic, raceTrafficTime, trialTraffic } from '../world/traffic.js';
import { prepareTraffic } from '../render/traffic.js';
import {
  bindOnlineApp, findOnlineCourse, getOnlineAppMode, getOnlineRoom, initOnline,
  onlineRaceRank, onlineRiderPoses, showOnlineDialog, syncOnlineProfile, tickOnline,
} from '../online/client.js';
import { draftRenderSpan } from '../ride/drafting.js';
import { applyRaceOptions, installRaceOptions, updateRaceOptions } from './race-options.js';
import { updateDraftHud } from './draft-hud.js';
import { initCustomSounds, setRideAudioMuted, updateRideAudio } from './audio.js';
import { getShowMapComparison, renderCampusMap, setShowMapComparison } from './minimap.js';
import { bindSaveUi, exportSaveFile, importSaveFile, scheduleLocalSave } from './save-sync.js';

export function timeLabel(ms) {
  const centiseconds = Math.max(0,Math.floor(ms/10 + 1e-8));
  const part = (n) => String(n).padStart(2,'0');
  return part(Math.floor(centiseconds/6000)) + ':' + part(Math.floor(centiseconds/100) % 60) + '.' + part(centiseconds % 100);
}

const byId = id => document.getElementById(id);
const stage = byId('stage');
const canvas = byId('world');
const motion = matchMedia('(prefers-reduced-motion: reduce)');

function knownTouchSize(size) { return ['compact','standard','large'].includes(size)?size:'standard'; }
export const PREF_KEY='szu-litchi-display-1';
const defaultPreferences={resolution:'auto',aa:'auto',ghost:true,brakeLine:true,weather:'day',sound:true,collision:false,traffic:'sparse',touchSize:'standard',windSpeed:0,windDir:0};

function readPreferences() {
  try {
    const saved=JSON.parse(localStorage.getItem(PREF_KEY));
    if(!saved||typeof saved!=='object') return {...defaultPreferences};
    return {
      resolution:['auto','sharp','fast'].includes(saved.resolution)?saved.resolution:'auto',
      aa:['auto','off','fxaa','msaa'].includes(saved.aa)?saved.aa:defaultPreferences.aa,
      ghost:typeof saved.ghost==='boolean'?saved.ghost:true,
      brakeLine:typeof saved.brakeLine==='boolean'?saved.brakeLine:true,
      weather:knownWeather(saved.weather),
      sound:typeof saved.sound==='boolean'?saved.sound:true,
      collision:saved.collision===true,
      traffic:knownTraffic(saved.traffic),
      soloBudget:tuning190.normalizeBudget(saved.soloBudget),
      windMode:knownWindMode(saved.windMode),
      touchSize:knownTouchSize(saved.touchSize),
      hudScale:knownHudScale(saved.hudScale),
      windSpeed:Number.isFinite(Number(saved.windSpeed))?Math.round(clamp(Number(saved.windSpeed),0,15)*10)/10:0,
      windDir:Number.isInteger(Number(saved.windDir))?clamp(Number(saved.windDir),0,7):0
    };
  } catch { return {...defaultPreferences}; }
}

const preferences=readPreferences();
let settingsOpen=false, graphicsRevision=0;
setPreferences(preferences);


const driverProfile=readDriverProfile();
const vehicleTunings=savedVehicleTunings();
const race=new TimeTrial(courses[0],savedBike(),driverProfile.vehicle);
const ui = Object.fromEntries([
  'sceneHud','intro','timing','timedTitle','progressLabel','checkpointCount','dots','clock','velocity','surfaceType','courseFacts',
  'mapScreen','mapToggle','mapText','miniButton','bigMap','miniMap','stationList','mapClock','mapNext','mapLegend',
  'riderTag','chairCheer','sprintKeys','gateTag','next','callout','callTitle','callValue','callDetail','callAction',
  'ghostName','splitGap','goldGoal','sprintFill','sprintMeter','sprintHint',
  'sectorFeedback','sectorLabel','sectorGap','exitFeedback','raceReview','reviewReference',
  'slopeGrade','elevationPanel','elevationStats','elevationChart',
  'sectorRows','cornerReview','reviewCornerName','reviewCornerDetail','reviewCornerSpeed',
  'friendButton','friendDialog','friendFile','friendDrop','friendStatus','friendClose','friendReady','friendExport','friendTag',
  'onlineButton','onlineDialog','onlineSetup','onlineLobby','onlineFormat','onlineVehicleRule','onlineWeather','onlineCreate','onlineHostInput','onlineJoinForm','onlineCodeInput',
  'onlineJoin','onlineClose','onlineLeave','onlineTitle','onlineCode','onlinePlayers','onlineStanding','onlineRounds',
  'onlineHostControls','onlineLobbyCampus','onlineLobbyCourse','onlineLobbySeed','onlineLobbyVehicle','onlineLobbyWeather','onlineLobbyTuning','onlineLobbyCollision','onlineTuningBanner','onlineGarage',
  'onlineTuningTime','onlineCollision','settingsTuneBar','settingsTuneText','settingsTuneReady','settingsTuneSkip',
  'onlineInvite','onlineReady','onlineStart','onlineStatus','onlineLatency','onlineRank','onlineBike','onlineHostHint',
  'onlineTag0','onlineTag1','onlineTag2','draftPill','weatherOverlay','settingsWeather','settingsWindSpeed','settingsWindDir','onlineWindSpeed','onlineWindDir','onlineLobbyWindSpeed','onlineLobbyWindDir','mapCompare','reviewMapButton','practiceExit',
  'onlineBudget','onlineBlind','onlineWindMode','onlineLobbyBudget','onlineLobbyBlind','onlineLobbyWindMode','budgetPicker','budgetReadout','budgetHighlight','budgetNotice','soloRulesStatus','raceMode','aiOptions','aiDifficulty','aiWins','courseVariants','courseDirection','courseLaps','mapReplay','replayPlay','replaySpeed','replaySeek','replayDetail','settingsWindMode','puddleStatus','bikePresets','bikePresetName','bikeSprintSpeed','bikeGravel','bikeStyles','bikeAbility','bikeFeedback','bikePosture','bikeGripMeter',
  'bikeFrame','frameNote','bikeSprint','sprintNote','motorTuning','vehLabel0','vehLabel1','vehLabel2','vehSlot0','vehSlot1','vehSlot2','vehNote0','vehNote1','vehNote2',
  'vehTopSpeed','vehGravel','vehGrass','vehAbility','saveExport','saveImport','saveFile','saveStatus',
  'liveDelta','windPill','courierHud','courierTitle','courierDetail','courierTag','courierButton',
  'medalButton','medalDialog','medalClose','medalSummary','medalUnlocks','medalListSzu','medalListUcl',
  'settingsSound','settingsCollision','settingsTraffic','settingsTouchSize','settingsHudScale','settingsGuideBtn','guideSettings','onlineTraffic','onlineLobbyTraffic','friendMultiBar','friendMultiCount','friendMultiPlay',
  'friendFilters','friendCampus','gateFlash','friendCourse','friendVehicle','friendBoardNote','friendScores','friendScoreTemplate',
  'seedButton','seedDialog','seedForm','seedInput','seedCampus','seedStatus','seedRandom','seedClose',
  'weeklyCode','weeklyPlay','weeklyCopy','weeklyBoard','coursePicker','courseBrief','mapZoom','mapPlace','mapCourse','recover','brakeHint','hospitalRoute',
  'settingsButton','settingsDialog','settingsTitle','settingsContinue','settingsState','settingsExit','settingsUnfullscreen',
  'bikeButton','bikeSettings','displaySettings','driverName','bikeLock','vehiclePicker','vehicleNote',
  'bikeParts','bikePaint','bikeTyres','bikeGears','tyreNote','gearNote','bikeBrakes','brakeNote',
  'bikeTopSpeed','bikeGrip','bikeAcceleration','bikeGrass','bikeBrakePower','bikeBrakeGrip',
  'settingsResolution','settingsAA','settingsGhost','settingsBrakeLine','settingsStatus',
  'startTrial','freeRide','pause','best','expand','notice','travel','travelDialog','travelStation','travelChoices','travelClose','campusName','mapTitle','szuReferences','uclReference'
].map(name => [name,byId(name)]));
worldState.driverProfile = driverProfile;
worldState.vehicleTunings = vehicleTunings;
worldState.race = race;
worldState.ui = ui;
let refreshBicycleModels = () => {};
const drive = new Set(), touches = new Map();
const driveChanges = [];
let appliedDrive = neutralDrive;
const driveCodes = new Map([
  ['KeyW','gas'],['ArrowUp','gas'],['KeyS','brake'],['ArrowDown','brake'],
  ['KeyA','left'],['ArrowLeft','left'],['KeyD','right'],['ArrowRight','right'],['ShiftLeft','sprint'],['ShiftRight','sprint']
]);
const touchButtons = Array.from(document.querySelectorAll('[data-drive]'));
const mapRows = [], dotLights = [];
let mapOpen=false, zoomMap=false, ready=false, priorTimestamp, cameraRevision=0;
let pendingCampus=null, uclRouteVisible=false;
let previousPhase = null, previousPaused = null, previousGate = -1;

function setText(element,text) {
  if (element.textContent !== text) element.textContent = text;
}

export function updateDrive() {
  const acts = new Set([...touches.values(),...Array.from(drive,code=>driveCodes.get(code))]);
  return {gas:acts.has('gas')||acts.has('sprint'),brake:acts.has('brake'),left:acts.has('left'),right:acts.has('right'),sprint:acts.has('sprint')};
}

function queueDrive(event) {
  const now = performance.now();
  const stamp = event.timeStamp > 0 && event.timeStamp <= now + 1 ? event.timeStamp : now;
  const time = Math.max(driveChanges.at(-1)?.time ?? 0, stamp);
  driveChanges.push({time, input:updateDrive()});
}

function driveAt(time) {
  while (driveChanges[0]?.time <= time + .0001) appliedDrive = driveChanges.shift().input;
  return appliedDrive;
}

function clearInput() {
  drive.clear();
  touches.clear();
  driveChanges.length = 0;
  appliedDrive = neutralDrive;
  for (const button of touchButtons) button.classList.remove('active');
}

function populateCoursePicker() {
  ui.coursePicker.replaceChildren();
  const group=getActiveCampus()==='ucl'?document.createElement('optgroup'):ui.coursePicker;
  if(group!==ui.coursePicker) {
    group.label='伦敦特别赛事';
    ui.coursePicker.appendChild(group);
  }
  for(const event of availableCourses(getActiveCampus())) {
    const option=document.createElement('option');
    option.value=event.id;option.textContent=event.name;
    (event.seed?ui.coursePicker:group).appendChild(option);
  }
}

function initHud() {
  populateCoursePicker();
  rebuildCourseHud();
}

function rebuildCourseHud() {
  const event=race.event, gates=event.gates, count=event.stages?.length??gates.length-2;
  ui.coursePicker.value=event.id;
  setText(ui.courseBrief,event.description);
  const distance=event.stages?(event.length/1000).toFixed(2)+' 公里':Math.round(event.length)+' 游戏米';
  setText(ui.courseFacts,event.name+' · '+distance);
  updateElevationMap();
  setText(ui.goldGoal,count+(event.stages?' 个赛段':' 个检查点')+' · 金牌 '+timeLabel(race.medalTimes.gold));
  setText(ui.progressLabel,event.stages?'赛段':'检查点');
  setText(ui.mapCourse,race.phase==='free'?'校内外道路':event.name);
  ui.stationList.replaceChildren();ui.dots.replaceChildren();
  mapRows.length=0;dotLights.length=0;
  for(let i=0;i<count;i++) {
    const tick=document.createElement('i');
    dotLights.push(tick);ui.dots.appendChild(tick);
  }
  for(const gate of gates) {
    const row=document.createElement('li'),badge=document.createElement('i'),label=document.createElement('span');
    badge.textContent=gate.number;label.textContent=gate.name;
    row.append(badge,label);mapRows.push(row);ui.stationList.appendChild(row);
  }
  previousPhase=null;previousGate=-1;
  if (typeof renderMapStationExtras === 'function') renderMapStationExtras();
}

function gapTone(delta) {
  return delta === null || Math.abs(delta) < 23 ? '' : delta < 0 ? 'ahead' : 'behind';
}

function signedSeconds(delta) {
  if (Math.abs(delta) < 5) return '0.00';
  return (delta < 0 ? '−' : '+') + (Math.abs(delta) / 1000).toFixed(2);
}

function updateCoach() {
  const running = race.phase === 'race' && !race.paused && race.onGuide;
  const track = race.event;
  const progress = running && preferences.brakeLine && race.nextGate > 0 ? race.progressEstimate : -1;
  const corner = track.corners.find(c => progress >= c.approach && progress < c.holdUntil);
  const drive=race.rider.vehicle==='bike'?race.bike:(race.rider.tuning??vehicleChoices[race.rider.vehicle]);
  const advised=corner?Math.min(drive.roadSpeed,plannedSpeed(track,progress+4.7)*(drive.cornerPace??1)):
    drive.sprintSpeed??drive.roadSpeed;
  ui.brakeHint.hidden = !corner || race.rider.speed < advised + .45;
  if (!ui.brakeHint.hidden) {
    const action = progress < corner.entry.distance ? '收力' : '刹车';
    setText(ui.brakeHint, action + ' · 建议 ' + Math.round(advised * 3.6) + ' km/h');
  }

  const stageIndex=track.stages?.findIndex(stage=>race.nextGate<=stage.finishGate);
  const completed=track.stages?.[stageIndex<0?track.stages.length-1:stageIndex-1];
  const sector=track.stages?(completed?race.stageSector(completed):null):race.sector(race.splits.length-1);
  ui.sectorFeedback.hidden = !sector || race.splits.length < 2;
  if (!ui.sectorFeedback.hidden) {
    setText(ui.sectorLabel, sector.name);
    setText(ui.sectorGap, signedSeconds(sector.delta) + ' 秒');
    ui.sectorGap.dataset.gap = gapTone(sector.delta);
  }

  const exit = race.lastCorner;
  ui.exitFeedback.hidden = !running || !exit || race.elapsed - exit.at > 2550;
  if (!ui.exitFeedback.hidden) {
    const target = race.reference.corners[exit.index];
    const delta = target ? Math.round((exit.speed - target.speed) * 3.6) : 0;
    const compare = delta === 0 ? '' : ' · ' + (delta > 0 ? '+' : '−') + Math.abs(delta);
    setText(ui.exitFeedback, '出弯 ' + Math.round(exit.speed * 3.6) + ' km/h' + compare);
  }
}

function populateRaceReview() {
  const sectors=race.event.stages ? race.event.stages.map(stage=>race.stageSector(stage)) :
    race.splits.map((_split,i)=>race.sector(i));
  setText(ui.reviewReference, '对比' + race.reference.kind);
  const rows = sectors.map((sector, idx) => {
    const row = document.createElement('tr');
    const name = document.createElement('th');
    const time = document.createElement('td');
    const gap = document.createElement('td');
    const act = document.createElement('td');
    name.setAttribute('scope', 'row');
    name.textContent = sector.name;
    time.textContent = (sector.duration / 1000).toFixed(2);
    gap.textContent = signedSeconds(sector.delta);
    gap.dataset.gap = gapTone(sector.delta);
    if (!getOnlineRoom() && !race.practice) {
      const fromG = race.event.stages ? race.event.stages[idx].startGate : idx;
      const toG = race.event.stages ? race.event.stages[idx].finishGate : idx + 1;
      if (toG < race.event.gates.length) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'practice-btn';
        btn.textContent = '单练';
        btn.addEventListener('click', () => startSectorPractice(fromG, toG));
        act.append(btn);
      }
    }
    row.append(name, time, gap, act);
    return row;
  });
  ui.sectorRows.replaceChildren(...rows);
  ui.raceReview.scrollTop = 0;

  let slowest, biggestLoss;
  race.cornerScores.forEach((score, index) => {
    if (!score) return;
    const target = race.reference.corners[index];
    const delta = score.duration !== null && target?.duration != null ? score.duration - target.duration : null;
    const detail = {corner:race.event.corners[index], speed:score.speed, target, delta};
    if (!slowest || detail.speed < slowest.speed) slowest = detail;
    if (delta > 23 && (!biggestLoss || delta > biggestLoss.delta)) biggestLoss = detail;
  });
  const focus = biggestLoss ?? slowest;
  ui.cornerReview.hidden = !focus;
  if (!focus) return;
  const title = (biggestLoss ? '失时最多' : '最慢出弯') + ' · 第 ' + (focus.corner.index + 1) + ' 弯';
  const speeds = '出弯 ' + Math.round(focus.speed * 3.6) + ' km/h' +
    (focus.target ? ' · 影子 ' + Math.round(focus.target.speed * 3.6) + ' km/h' : '');
  setText(ui.reviewCornerName, title);
  setText(ui.reviewCornerDetail, '通往' + focus.corner.station + (biggestLoss ? ' · 慢 ' + (focus.delta / 1000).toFixed(2) + ' 秒' : ''));
  setText(ui.reviewCornerSpeed, speeds);
}

export function updateHud() {
  updateTravelButton();
  const trial=race.phase!=='free';
  const event=race.event,gates=event.gates,checkpointCount=gates.length-2;
  const leg=trial?activeStage(event,race.nextGate):null;
  const actor=race.rider.vehicle, bicycle=actor==='bike';
  if(stage.dataset.vehicle!==actor) {
    stage.dataset.vehicle=actor;
    const {action,meter}=vehicleSkills[actor];
    setText(document.querySelector('.touch [data-drive="sprint"]'),action);
    ui.sprintKeys.lastChild.nodeValue=' '+action+' ';
    ui.sprintMeter.setAttribute('aria-label',meter);
  }
  ui.puddleStatus.hidden=!race.rider.inPuddle;
  setText(ui.riderTag,driverProfile.name);
  const opponent=race.opponent;
  setText(ui.mapLegend,'橙色是'+driverProfile.name+(trial?'，青色是'+(opponent?.kind??'影子'):''));
  ui.friendReady.hidden=trial||!opponent;
  if (!ui.friendReady.hidden) {
    const totalGhosts = 1 + (race.extraOpponents?.length ?? 0);
    setText(ui.friendReady,(totalGhosts>1?`${opponent.kind} 等 ${totalGhosts} 条影子`:opponent.kind)+' · '+timeLabel(opponent.time)+' · '+
      vehicleChoices[opponent.vehicle].name+' · '+event.name);
  }
  ui.friendExport.hidden=race.phase!=='done'||!race.lastRun||race.lastRun.unranked||Boolean(race.practice);
  ui.reviewMapButton.hidden=race.phase!=='done'||!race.lastRun||Boolean(race.practice);
  ui.practiceExit.hidden=!race.practice;
  const online = Boolean(getOnlineRoom());
  ui.seedButton.hidden=getActiveCampus()==='shunde';
  ui.onlineButton.disabled=!online&&(pendingCampus||race.phase==='race'||race.phase==='count');
  setText(ui.onlineButton,online?'房间':'联机');
  ui.friendButton.disabled=ui.seedButton.disabled=ui.coursePicker.disabled=ui.medalButton.disabled=online||race.phase==='race'||race.phase==='count';
  if(ui.courierButton) {
    ui.courierButton.hidden=online||trial;
    ui.courierButton.setAttribute('aria-pressed',String(CampusCourier.active));
  }
  ui.raceMode.disabled=online||trial||Boolean(race.opponent);
  updateRaceOptions(ui, race, online||trial||Boolean(pendingCampus));
  if(!online&&!trial) {
    const {over,illegal}=soloBudget(race);
    ui.soloRulesStatus.hidden=!over&&!illegal;
    setText(ui.soloRulesStatus,over?`超预算 ¥${over} · 到车库调整`:illegal?'娱乐改装 · 本场不计榜':'');
  } else ui.soloRulesStatus.hidden=true;
  ui.startTrial.disabled=ui.freeRide.disabled=online;
  ui.freeRide.hidden=!trial||online;
  if(trial&&!online) {
    const fin=race.phase==='done';
    setText(ui.freeRide,fin?'返回自由骑行':'退出比赛');
    ui.freeRide.title=fin?'结束本场并返回自由骑行':'退出当前比赛并返回自由骑行';
  }
  ui.pause.disabled=online||race.phase==='done';
  updateDraftHud(ui.draftPill, race.rider.draft);
  const liveRank=race.phase==='race'?(online?onlineRaceRank(performance.now()):aiRank(race)):null;
  ui.onlineRank.hidden=!liveRank;
  if (liveRank) setText(ui.onlineRank,`第 ${liveRank.rank} / ${liveRank.total} 名`+(liveRank.gapMeters?` · 落后 ${liveRank.gapMeters} 米`:liveRank.rank===1?' · 领跑':''));
  if (previousPhase !== race.phase || previousPaused !== race.paused) {
    stage.dataset.phase = race.phase;
    ui.intro.hidden = trial || race.moved || (typeof CampusCourier !== 'undefined' && (CampusCourier.active || performance.now() < CampusCourier.summaryUntil));
    ui.timing.hidden = !trial;
    ui.stationList.hidden = !trial && !mapOpen;
    if (mapOpen) renderMapStationExtras();
    setText(ui.mapCourse,trial ? event.name : '校内外道路');

    updateMapZoom();
    ui.freeRide.setAttribute('aria-pressed', String(!trial));
    ui.raceReview.hidden = race.phase !== 'done' || Boolean(race.practice);
    ui.callout.classList.toggle('has-review', race.phase === 'done');
    if (race.phase === 'done' && previousPhase !== 'done') populateRaceReview();

    setText(ui.startTrial,race.phase==='done'?'再跑一次':trial?'重新开始':opponent?'开始对战':event.stages?'开始耐力赛':'开始计时赛');
    setText(ui.pause,race.paused ? '继续' : '暂停');
    ui.pause.setAttribute('aria-pressed',String(race.paused));
    previousPhase = race.phase;
    previousPaused = race.paused;
  }
  if (!trial && (race.moved || (typeof CampusCourier !== 'undefined' && (CampusCourier.active || performance.now() < CampusCourier.summaryUntil)))) ui.intro.hidden = true;
  if (previousGate !== race.nextGate) {
    const passed = clamp(race.nextGate - 1,0,checkpointCount);
    const stages=event.stages, completed=stages?stages.filter(s=>s.finishGate<race.nextGate).length:passed;
    setText(ui.checkpointCount,completed+' / '+(stages?.length??checkpointCount));
    dotLights.forEach((dot,i) => { dot.classList.toggle('passed',i < completed); });
    mapRows.forEach((row,i) => {
      row.classList.toggle('passed',i < race.nextGate);
      if (i === race.nextGate) row.setAttribute('aria-current','step');
      else row.removeAttribute('aria-current');
    });
    previousGate = race.nextGate;
  }
  setText(ui.velocity,String(Math.round(Math.abs(race.rider.speed) * 3.6)));
  const [x,,z] = race.rider.position;
  const grade=(worldState.hooks.riderGrade ?? riderGrade)(race.rider.position,race.rider.heading)*100;
  ui.slopeGrade.hidden=!bicycle;
  ui.bikeFeedback.hidden=!bicycle;
  if(bicycle) {
    const {posture,gripLoad}=race.rider;
    setText(ui.slopeGrade,(grade>.05?'↗ +':grade<-.05?'↘ −':'坡度 ')+Math.abs(grade).toFixed(1)+'%');
    const showPosture=posture==='tuck'||posture==='stand';
    ui.bikePosture.hidden=!showPosture;
    if(showPosture) {
      ui.bikePosture.dataset.posture=posture;
      setText(ui.bikePosture,posture==='tuck'?'伏身破风':'起身摇车');
    } else delete ui.bikePosture.dataset.posture;
    const load=clamp(gripLoad??0,0,1), remaining=Math.round(100*(1-load));
    ui.bikeGripMeter.value=remaining;
    ui.bikeGripMeter.dataset.load = load>.90?'limit':load>.72?'high':'normal';
  } else {
    ui.bikePosture.hidden=true;
    delete ui.bikePosture.dataset.posture;
  }
  const london=getActiveCampus()==='ucl';
  const outside=getActiveCampus()==='szu'&&!inCampus(x,z)?cityStreetAt(x,z):null;
  const streetName=london?uclWayByPath.get(uclStreetAt(x,z,1.15)):outside?.name;
  let roadLoc=streetName;
  const onPavilionWalk=getActiveCampus()==='shunde'&&parkPavilionDeck(x,z)!==null&&!parkPaved(x,z);
  if(getActiveCampus()==='shunde') {
    const sc=typeof shundeShortcutAt==='function'?shundeShortcutAt(x,z):null;
    if(onPavilionWalk) roadLoc='湖心亭';
    else if(sc) roadLoc=sc.name;
    else {
      const branch=typeof mountainRoadAt==='function'?mountainRoadAt(x,z,true):null;
      if(branch&&branch.gap<=branch.lane.path.width+2.5) roadLoc=branch.lane.path===mountainUp?'神步山上山道':'神步山下山道';
      else if(typeof bridgeAxis==='function'&&Math.abs(bridgeAxis(x,z))<40&&Math.abs(parkBridgeSide(x,z))<6) roadLoc='九孔伏波桥';
      else if(race.phase==='free') roadLoc=(typeof nearestCourierLandmark==='function'?nearestCourierLandmark('shunde',x,z,42):null)??(parkPaved(x,z,-2)?'青云湖环线':'顺峰山公园');
      else if(parkPaved(x,z,-1)) roadLoc='青云湖环线';
    }
  } else if(!roadLoc&&race.phase==='free') {
    const near=typeof nearestCourierLandmark==='function'?nearestCourierLandmark(getActiveCampus(),x,z,38):null;
    roadLoc=near??(getActiveCampus()==='szu'&&race.rider.paved?'深大校内道路':null);
  }
  const surfaceShort=onPavilionWalk?'栈道':!race.rider.paved?(race.rider.surfaceKind==='gravel'?'碎石':'草地'):'柏油';
  const surfaceFull=!race.rider.paved?(race.rider.surfaceKind==='gravel'?'碎石路面':'草地减速'):'柏油路面';
  setText(ui.surfaceType,race.phase==='free'?(roadLoc?roadLoc+' · '+surfaceShort:surfaceFull):(!race.rider.paved?surfaceFull:(roadLoc??'柏油路面')));
  updateCoach();
  const energy=Math.round(race.rider.energy*100);
  if (ui.sprintMeter.getAttribute('aria-valuenow')!==String(energy)) {
    ui.sprintFill.style.transform='scaleX('+energy/100+')';
    ui.sprintMeter.setAttribute('aria-valuenow',String(energy));
  }
  const vehicleLabel=actor==='ebike'?'新国标 · 48 km/h':
    actor==='chair'?'电动轮椅 · 36 km/h':'越野小摩托 · 63 km/h';
  ui.sprintMeter.parentElement.toggleAttribute('data-skill-active',Boolean(race.rider.sprinting||race.rider.skill));
  setText(ui.sprintHint,bicycle?(race.rider.sprinting?'冲刺中':'冲刺耐力'):(race.rider.skill||vehicleSkills[actor].meter));
  const clock = timeLabel(race.elapsed);
  setText(ui.clock,clock);
  setText(ui.mapClock,trial ? clock : '');
  setText(ui.best,race.best === null ? '—' : timeLabel(race.best));
  const lastGap=race.lastGap;
  setText(ui.ghostName,race.reference.kind);
  setText(ui.splitGap,lastGap===null?'等待分段':'总差 ' + splitLabel(lastGap));
  ui.splitGap.dataset.gap = gapTone(lastGap);
  if(ui.liveDelta) {
    const ld=trial&&race.phase==='race'?liveDeltaMs(race):null;
    ui.liveDelta.hidden=ld===null;
    if(ld!==null) {
      setText(ui.liveDelta,'实时 '+splitLabel(ld));
      ui.liveDelta.dataset.gap=gapTone(ld);
    }
  }
  if(ui.windPill) {
    const windText=windEffectLabel(race);
    ui.windPill.hidden=!windText;
    if(windText) setText(ui.windPill,windText);
  }
  if(ui.courierHud) {
    const nowMs=performance.now();
    const showCourier=!online&&!trial&&(CampusCourier.active||nowMs<CampusCourier.summaryUntil);
    ui.courierHud.hidden=!showCourier;
    if(CampusCourier.active&&CampusCourier.target) {
      const dx=CampusCourier.target.p[0]-race.rider.position[0],dz=CampusCourier.target.p[2]-race.rider.position[2];
      const distM=Math.round(Math.hypot(dx,dz));
      const bearing=Math.round((Math.atan2(dz,dx)-race.rider.heading)/(Math.PI/4));
      const arrow=['↑','↗','→','↘','↓','↙','←','↖'][((bearing%8)+8)%8];
      const flashMsg=nowMs<CampusCourier.summaryUntil?' · '+CampusCourier.summaryText:'';
      setText(ui.courierTitle,`闪送目标 · ${CampusCourier.target.name}（${CampusCourier.target.district}）`);
      setText(ui.courierDetail,`余 ${Math.ceil(CampusCourier.remaining)}s · ${arrow} ${distM}m · 连单 ${CampusCourier.streak} · 探索 ${CampusCourier.discoveredCount(getActiveCampus())}/10${flashMsg}`);
    } else if (nowMs<CampusCourier.summaryUntil) {
      setText(ui.courierTitle,'校园闪送');
      setText(ui.courierDetail,CampusCourier.summaryText);
    }
  }
  const routeProgress=leg&&race.phase==='race'?race.progressEstimate:0;
  const remaining=race.phase==='done'?0:Math.max(0,event.length-routeProgress);
  const remainingLabel=remaining>=1000?(remaining/1000).toFixed(2)+' 公里':Math.ceil(remaining)+' 米';
  const timedName=race.practice?'区间单练 · '+race.practice.name:online?'联机竞速':opponent?'友人对战':london?(leg?'伦敦耐力赛':'伦敦特别赛'):(leg?'耐力赛':'计时赛');
  setText(ui.timedTitle,leg&&race.onGuide?timedName+' · 余 '+remainingLabel:timedName);
  const current = gates[race.nextGate];
  const freeHazard=!trial&&race.freeHazardNotice&&performance.now()<race.freeHazardNotice.until;
  ui.next.hidden = (!trial || !current || race.phase === 'count') && !freeHazard;
  if (current && trial) {
    const remains=leg&&race.onGuide?Math.max(0,Math.round(current.distance-routeProgress)):
      Math.round(Math.hypot(current.p[0]-race.rider.position[0],current.p[2]-race.rider.position[2]));
    const label=current.index===0?'起点':current.index===gates.length-1?'终点':'下一站';
    const heading=leg?leg.name+' · '+current.name:label+' · '+current.name;
    setText(ui.next,heading+' · '+remains+' 米');
    setText(ui.mapNext,heading);
  } else {
    setText(ui.mapNext,race.phase==='done'?'完赛':streetName ?? (getActiveCampus()==='shunde'?'旅行站位于牌坊广场':london?'旅行站位于 Gower Street 校门旁':'沿校门可接入校外公路'));
  }
  if(freeHazard) {
    setText(ui.next,race.freeHazardNotice.text);
    ui.next.dataset.alert='missed';
  } else if(race.phase==='race'&&race.elapsed-race.lastRejoin<1250) {
    setText(ui.next,race.rejoinReason?race.rejoinReason+'，已强制遣返赛道 · 加 2 秒':'已回到赛道 · 加 2 秒');
    if (race.rejoinReason) ui.next.dataset.alert='missed';
    else delete ui.next.dataset.alert;
  } else if (race.phase==='race'&&current&&race.missedGate) {
    setText(ui.next,'漏过检查点 '+current.number+'（'+current.name+'）· 按 F 回到赛道');
    ui.next.dataset.alert='missed';
  } else {
    delete ui.next.dataset.alert;
  }
  const gatePassAge = race.lastGatePass ? race.elapsed - race.lastGatePass.at : Infinity;
  const showGateFlash = !mapOpen && race.phase === 'race' && gatePassAge < 1450;
  ui.gateFlash.hidden = !showGateFlash;
  ui.timing.classList.toggle('gate-pop', !mapOpen && race.phase === 'race' && gatePassAge < 520);
  if (showGateFlash) {
    if (race.lastGatePass.index === 0) {
      setText(ui.gateFlash, '已过起点 · 计时开始');
      ui.gateFlash.dataset.gap = 'even';
    } else {
      const gap = race.lastGatePass.sectorDelta ?? race.lastGatePass.delta;
      const gapStr = gap === null || gap === undefined ? '' : ' · ' + signedSeconds(gap) + ' 秒';
      setText(ui.gateFlash, '通过检查点 ' + race.lastGatePass.number + ' · ' + race.lastGatePass.name + gapStr);
      ui.gateFlash.dataset.gap = gapTone(gap);
    }
  }
  ui.callout.hidden = mapOpen || !(race.paused || race.phase === 'count' || race.phase === 'done' || (race.phase === 'race' && race.elapsed < 610));
  ui.callout.dataset.mode = race.paused ? 'paused' : race.phase;
  if (race.paused) {
    setText(ui.callTitle,'已暂停');
    setText(ui.callValue,'');
    ui.callDetail.hidden = true;
    ui.callAction.hidden = false;
    setText(ui.callAction,'继续骑行');
  } else if (race.phase === 'done') {
    setText(ui.callTitle,'完赛');
    setText(ui.callValue,clock);
    const ai=aiRank(race);
    const rank=ai?`第 ${ai.rank} / ${ai.total} 名`:trialMedal(race);
    const pBest=race.practice?race.practiceBest.get(race.practice.key):null;
    const record=race.practice?(race.record?'刷新本段最佳':'本段最佳 '+timeLabel(pBest)):online?'房间成绩':race.record?'刷新个人最佳':race.best===null?'挑战完成':'个人最佳 '+timeLabel(race.best);
    let duel=opponent?friendResult(opponent,race.elapsed):'';
    if (opponent && race.extraOpponents?.length) {
      const beatCount = [opponent, ...race.extraOpponents].filter(op => race.elapsed < op.time).length;
      duel = `${duel}（击败 ${beatCount}/${1 + race.extraOpponents.length}）`;
    }
    setText(ui.callDetail,[duel,rank,race.unranked?'娱乐改装 · 不计榜':ai?(race.aiWinCount===null?'AI 独立成绩':`AI 夺冠 · 累计 ${race.aiWinCount} 胜`):record].filter(Boolean).join(' · '));
    ui.callDetail.hidden = false;
    ui.callAction.hidden = online;
    setText(ui.callAction,race.practice?'再练本段':'再跑一次');
  } else if (!ui.callout.hidden) {
    const count = race.phase === 'count' ? Math.ceil(race.countdown) : 0;
    setText(ui.callTitle,count > 0 ? '计时赛即将开始' : '');
    setText(ui.callValue,count > 0 ? String(count) : '出发');
    const showUnranked=count>0&&race.unranked;
    ui.callDetail.hidden=!showUnranked;
    setText(ui.callDetail,showUnranked?'娱乐改装 · 本场不计榜':'');
    ui.callAction.hidden = true;
  }
  ui.callValue.classList.toggle('count-number',!race.paused && race.phase !== 'done');

}

function updateMapZoom() {
  const free = race.phase === 'free';
  updateElevationMap();
  const london=getActiveCampus()==='ucl';
  ui.hospitalRoute.hidden=!london||!free||zoomMap;
  ui.mapCompare.hidden=!race.lastRun;
  ui.mapCompare.setAttribute('aria-pressed',String(getShowMapComparison()));
  ui.hospitalRoute.setAttribute('aria-pressed',String(uclRouteVisible));
  setText(ui.hospitalRoute,uclRouteVisible?'隐藏 UCLH 路线':'标出 UCLH 路线');
  ui.mapZoom.setAttribute('aria-pressed',String(zoomMap));
  setText(ui.mapZoom,zoomMap?(getActiveCampus()==='shunde'?'看全园':london?'看街区':free?'看校外':'看全校'):'看赛道');
  if (free) {
    ui.stationList.hidden = !zoomMap && !mapOpen;
    if (mapOpen) renderMapStationExtras();
    setText(ui.mapCourse,zoomMap?race.event.name:getActiveCampus()==='shunde'?'顺峰山自由骑行':london?'Bloomsbury 自由骑行':'校内外道路');
  }
}

function openMap(show) {
  updateMapZoom();
  mapOpen = show;
  ui.sceneHud.hidden = show;
  ui.mapScreen.hidden = !show;
  ui.callout.hidden = show || !(race.paused || race.phase === 'count' || race.phase === 'done' || (race.phase === 'race' && race.elapsed < 610));
  ui.callout.dataset.mode = race.paused ? 'paused' : race.phase;
  ui.mapToggle.setAttribute('aria-pressed',String(show));
  setText(ui.mapText,show ? (race.phase === 'done' ? '返回结算' : '返回骑行') : '俯视地图');
  if(show) {
    ui.stationList.hidden = false;
    renderMapStationExtras();
    renderCampusMap(ui.bigMap,race,false,zoomMap);
  }
  else {ui.mapPlace.hidden=true;ui.mapReplay.hidden=true;mapReplay.playing=false;mapReplay.lastDraw=null;}
  if(!show&&!ready) ui.notice.hidden=false;
}

function focusStage() { stage.focus({preventScroll:true}); }

function startTrial() {
  if (!ready||getOnlineRoom()||pendingCampus||race.event.campus!==getActiveCampus()) return;
  if (race.practice) { startSectorPractice(race.practice.fromGate, race.practice.toGate); return; }
  beginTrial();
}

export function beginTrial() {
  if (typeof CampusCourier !== 'undefined') CampusCourier.stop(false);
  clearInput();
  applyRaceOptions(ui, race);
  if(race.start()===false) {
    openSettings('bike');
    highlightBudgetParts();
    return;
  }
  refreshBicycleModels();
  zoomMap = false; cameraRevision++;
  priorTimestamp = performance.now();
  openMap(false);
  focusStage();
  updateHud();
}

function enterFreeRide() {
  if (!ready||getOnlineRoom()) return;
  race.practice=null;
  clearInput();
  race.opponent=null;
  race.extraOpponents=[];
  race.freeRide();
  refreshBicycleModels();
  rebuildCourseHud();
  zoomMap = false;
  race.moved = true;
  priorTimestamp = performance.now();
  openMap(false);
  updateHud();
  focusStage();
}

function pauseTrial() {
  if (!ready||getOnlineRoom()||pendingCampus||race.phase==='done') return;
  race.paused = !race.paused;
  clearInput();
  priorTimestamp = performance.now();
  if (!race.paused) focusStage();
  updateHud();
}

function recoverTrial() {
  if(!ready||!race.rejoin()) return;
  if(settingsOpen) closeSettings();
  clearInput();cameraRevision++;priorTimestamp=performance.now();focusStage();updateHud();
}

function updateMapPlace(event) {
  const layout=mapCache.get(ui.bigMap);
  if(!layout||!mapOpen) return;
  const box=ui.bigMap.getBoundingClientRect();
  const [x,z]=layout.unproject(event.clientX-box.left,event.clientY-box.top);
  if(getActiveCampus()==='ucl') {
    let place=null,best=49;
    for(const entry of londonPlaces) {
      const gap=(entry.x-x)**2+(entry.z-z)**2;
      if(gap<best) {best=gap;place=entry;}
    }
    if(place) {
      ui.mapPlace.hidden=false;
      setText(ui.mapPlace,place.name+' · '+place.use);
      return;
    }
  }
  const block=buildingAt(x,z,0);
  ui.mapPlace.hidden=!block;
  if(block) setText(ui.mapPlace,block.name?(block.use?block.name+' · '+block.use:block.name):block.district||'校园楼栋');
}

const seedAvailable=()=>ready&&!getOnlineRoom()&&!pendingCampus&&!settingsOpen&&!['race','count'].includes(race.phase);
const seedStorageKey=campus=>'szu-litchi-last-seed-'+campus;

function openSeedDialog() {
  if(getActiveCampus()==='shunde'||!seedAvailable()||ui.seedDialog.open||ui.friendDialog.open) return;
  let remembered='';
  try { remembered=localStorage.getItem(seedStorageKey(getActiveCampus()))??''; } catch {}
  if(!readSeedCode(remembered,getActiveCampus())) remembered='';
  const prefix=getActiveCampus()==='ucl'?'U':'S';
  ui.seedCampus.textContent=getActiveCampus()==='ucl'?'伦敦 · Bloomsbury':'深圳 · 粤海校区';
  ui.seedInput.placeholder=prefix+seedVersion+'-326';
  ui.seedInput.value=worldState.seedCourses[getActiveCampus()]?.seed??remembered;
  ui.weeklyCode.value=weeklySeed(getActiveCampus());
  ui.seedStatus.textContent='同一张地图输入同一种子码，得到同一条赛道。把种子码发给朋友即可共用赛道。';
  clearInput();
  priorTimestamp=undefined;
  ui.seedDialog.showModal();
  ui.seedInput.select();
}

function chooseSeedCourse(raw) {
  if(!seedAvailable()) return;
  const code=readSeedCode(raw,getActiveCampus());
  if(!code) {
    const prefix=getActiveCampus()==='ucl'?'U':'S';
    ui.seedStatus.textContent='请输入 1–12 位英文字母或数字，或当前地图的完整种子码（'+prefix+seedVersion+'- 开头）。';
    ui.seedInput.focus();
    return;
  }
  const previous=worldState.seedCourses[getActiveCampus()];
  const event=previous?.seed===code?previous:makeSeedCourse(code,getActiveCampus());
  if(!event) {
    ui.seedStatus.textContent='这个种子没有合适的路线，请试试另一个。';
    return;
  }
  worldState.seedCourses[getActiveCampus()]=event;
  try { localStorage.setItem(seedStorageKey(getActiveCampus()),code); } catch {}
  populateCoursePicker();
  selectCourse(event);
  ui.seedDialog.close();
}

function initSeedDialog() {
  let rollover;
  function refreshWeek() {
    clearTimeout(rollover);
    if(!ui.seedDialog.open) return;
    const now=new Date(), next=new Date(now);
    next.setDate(now.getDate()+7-(now.getDay()+6)%7);
    next.setHours(0,0,0,0);
    ui.weeklyCode.value=weeklySeed(getActiveCampus(),now);
    rollover=setTimeout(refreshWeek,Math.max(100,next-now+30));
  }
  ui.seedButton.addEventListener('click',openSeedDialog);
  ui.seedButton.addEventListener('click',refreshWeek);
  window.addEventListener('focus',refreshWeek);
  document.addEventListener('visibilitychange',refreshWeek);
  ui.weeklyPlay.addEventListener('click',()=>{refreshWeek();chooseSeedCourse(ui.weeklyCode.value);});
  ui.weeklyBoard.addEventListener('click',()=>{
    refreshWeek();
    const code = ui.weeklyCode.value;
    ui.seedDialog.close();
    openFriendDialog(code);
  });
  ui.weeklyCopy.addEventListener('click',async()=>{
    refreshWeek();
    try {
      await navigator.clipboard.writeText(ui.weeklyCode.value);
    } catch {
      ui.weeklyCode.focus();
      ui.weeklyCode.select();
      if(!document.execCommand?.('copy')) {
        ui.seedStatus.textContent='种子码已选中，可用系统复制命令。';
        return;
      }
    }
    ui.seedStatus.textContent='已复制 '+ui.weeklyCode.value;
  });
  ui.seedForm.addEventListener('submit',event=>{
    event.preventDefault();
    chooseSeedCourse(ui.seedInput.value);
  });
  ui.seedRandom.addEventListener('click',()=>{
    const value=Math.floor(Math.random()*2**32).toString(36).toUpperCase().padStart(7,'0');
    ui.seedInput.value=value;
    chooseSeedCourse(value);
  });
  ui.seedClose.addEventListener('click',()=>ui.seedDialog.close());
  ui.seedDialog.addEventListener('close',()=>{
    clearTimeout(rollover);
    priorTimestamp=undefined;
    clearInput();
    if (!ui.friendDialog.open) focusStage();
  });
}

let friendScores = [];
let friendBoardMessage = '正在读取友人对战…';
let friendBoardRead = 0;
let selectedFriendIds = [];

function updateFriendMultiBar() {
  if (!ui.friendMultiBar) return;
  const count = selectedFriendIds.length;
  ui.friendMultiBar.hidden = count < 2;
  if (count >= 2) setText(ui.friendMultiCount, `已选 ${count}/3 条同场群跑影子`);
}

function setFriendOptions(select,labels,scores,field,preferred) {
  const counts = new Map();
  for (const score of scores) counts.set(score[field],(counts.get(score[field])??0)+1);
  select.replaceChildren(...Array.from(labels,([key,label])=>{
    const count = counts.get(key);
    return new Option(count?label+'（'+count+'）':label,key);
  }));
  select.value = labels.has(preferred)?preferred:scores[0]?.[field]??labels.keys().next().value;
}

function updateFriendFilters({campus,course,vehicle}={}) {
  const campusLabels = new Map(Object.entries(campuses).map(([key,data])=>[key,data.name]));
  setFriendOptions(ui.friendCampus,campusLabels,friendScores,'campus',campus??ui.friendCampus.value);
  const region = ui.friendCampus.value;
  const campusScores = friendScores.filter(score=>score.campus===region);
  const seedCodes = new Set([region==='shunde'?null:weeklySeed(region),worldState.seedCourses[region]?.seed,...campusScores.map(score=>score.seed)]);
  const courseLabels = new Map(coursesByCampus[region].map(event=>[event.id,event.name]));
  for (const code of seedCodes) {
    if (!code) continue;
    const name = /^[SU]\d-W\d{8}$/.test(code)?'每周挑战 ':'种子赛 ';
    courseLabels.set('seed-'+code,name+code);
  }
  setFriendOptions(ui.friendCourse,courseLabels,campusScores,'courseId',course??ui.friendCourse.value);
  const courseScores = campusScores.filter(score=>score.courseId===ui.friendCourse.value);
  const vehicles = new Map(Object.entries(vehicleChoices).filter(([,data])=>data.race).map(([key,data])=>[key,data.name]));
  setFriendOptions(ui.friendVehicle,vehicles,courseScores,'vehicle',vehicle??ui.friendVehicle.value);
  renderFriendScores(courseScores);
}

function friendScoreRow(score,compatible) {
  const row = ui.friendScoreTemplate.content.firstElementChild.cloneNode(true);
  row.querySelector('.friend-score-name').textContent = score.name;
  const time = timeLabel(score.time);
  row.querySelector('.friend-score-time').textContent = time;
  const description = score.name+' · '+time;
  const pick = row.querySelector('.friend-pick');
  const play = row.querySelector('.friend-play'), remove = row.querySelector('.friend-remove');
  if (pick) {
    pick.disabled = !compatible;
    pick.checked = compatible && selectedFriendIds.includes(score.id);
    pick.addEventListener('change', () => {
      if (pick.checked) {
        if (selectedFriendIds.length >= 3) {
          pick.checked = false;
          setText(ui.friendStatus, '同场群跑最多同时选择 3 条影子。');
          return;
        }
        if (!selectedFriendIds.includes(score.id)) selectedFriendIds.push(score.id);
      } else {
        selectedFriendIds = selectedFriendIds.filter(id => id !== score.id);
      }
      updateFriendMultiBar();
    });
  }
  play.disabled = !compatible;
  play.setAttribute('aria-label','对战 '+description);
  remove.setAttribute('aria-label','移除 '+description);
  play.addEventListener('click',()=>void playSavedFriend(score.id));
  remove.addEventListener('click',()=>void deleteFriendScore(score,remove));
  return row;
}

function renderFriendScores(courseScores) {
  const {value:campus} = ui.friendCampus, {value:course} = ui.friendCourse;
  const scores = courseScores.filter(score=>score.vehicle===ui.friendVehicle.value)
    .sort((a,b)=>a.time-b.time||a.id-b.id);
  const visibleIds = new Set(scores.map(s => s.id));
  selectedFriendIds = selectedFriendIds.filter(id => visibleIds.has(id));
  updateFriendMultiBar();
  const message = friendBoardMessage || (scores.length?'':'这个赛道和车型还没有影子成绩。');
  setText(ui.friendBoardNote,message);
  ui.friendBoardNote.hidden = !message;
  ui.friendScores.replaceChildren();
  if (!scores.length || friendBoardMessage) return;

  const event = coursesByCampus[campus].find(item=>item.id===course)??
    (worldState.seedCourses[campus]?.id===course?worldState.seedCourses[campus]:null);
  const currentLayout = event?ghostCourseKey(event):null;
  const validSeed = !course.startsWith('seed-')||readSeedCode(course.slice(5),campus)===course.slice(5);
  const groups = new Map();
  for (const score of scores) {
    if (!groups.has(score.layout)) groups.set(score.layout,[]);
    groups.get(score.layout).push(score);
  }
  const layouts = [...groups.keys()].sort((a,b)=>Number(b===currentLayout)-Number(a===currentLayout));
  for (const layout of layouts) {
    const compatible = validSeed&&(!currentLayout||layout===currentLayout);
    if (layouts.length>1||!compatible) {
      const title = document.createElement('h3');
      title.textContent = (compatible?'布局 ':'旧版布局 ')+layout;
      ui.friendScores.append(title);
    }
    const list = document.createElement('ol');
    list.className = 'friend-ranking';
    for (const score of groups.get(layout)) list.append(friendScoreRow(score,compatible));
    ui.friendScores.append(list);
  }
}

async function refreshFriendBoard() {
  const read = ++friendBoardRead;
  ui.friendScores.setAttribute('aria-busy','true');
  try {
    const scores = await readFriendScores();
    if (read!==friendBoardRead||!ui.friendDialog.open) return;
    friendScores = scores.reverse();
    friendBoardMessage = '';
  } catch (error) {
    if (read!==friendBoardRead||!ui.friendDialog.open) return;
    console.error(error);
    friendScores = [];
    friendBoardMessage = '暂时无法读取本机友人对战。';
  } finally {
    if (read===friendBoardRead) ui.friendScores.setAttribute('aria-busy','false');
  }
  updateFriendFilters();
}

async function deleteFriendScore(score,button) {
  if (friendImporting) return;
  button.disabled = true;
  try {
    await removeSavedFriendGhost(score.id);
    if (!ui.friendDialog.open) return;
    await refreshFriendBoard();
    if (!ui.friendDialog.open||friendImporting) return;
    setText(ui.friendStatus,'已移除 '+score.name+' 的影子。');
    if (document.activeElement===document.body) ui.friendCourse.focus();
  } catch (error) {
    console.error(error);
    button.disabled = false;
    if (ui.friendDialog.open&&!friendImporting) setText(ui.friendStatus,'暂时无法移除这条影子。');
  }
}

function initFriendBoard() {
  ui.friendCampus.addEventListener('change',()=>{selectedFriendIds=[];updateFriendFilters({course:'',vehicle:''});});
  ui.friendCourse.addEventListener('change',()=>{selectedFriendIds=[];updateFriendFilters({vehicle:''});});
  ui.friendVehicle.addEventListener('change',()=>{selectedFriendIds=[];updateFriendFilters();});
  ui.friendMultiPlay?.addEventListener('click',()=>{
    if (selectedFriendIds.length >= 2) void playSavedMultiFriends(selectedFriendIds.slice(0,3));
  });
}

let friendImporting = false;

function canImportFriend() {
  return seedAvailable()&&!ui.seedDialog.open;
}

function openFriendDialog(week=null) {
  if (!canImportFriend() || ui.friendDialog.open) return;
  clearInput();
  priorTimestamp = undefined;
  const opponent = race.opponent;
  setText(ui.friendStatus,opponent?'已载入 '+opponent.kind+' · '+timeLabel(opponent.time):
    '影子保存在当前浏览器。完赛后可导出自己的影子。');
  updateFriendFilters({campus:getActiveCampus(),course:week?'seed-'+week:race.event.id,vehicle:race.entryVehicle});
  ui.friendDialog.showModal();
  void refreshFriendBoard();
}

function setFriendImporting(active) {
  friendImporting = active;
  ui.friendDrop.disabled = ui.friendClose.disabled = ui.friendFilters.disabled = active;
  ui.friendScores.inert = active;
}

function activateFriendChallenge({event,opponent},archive,extraOpponents=[]) {
  if (event.seed) worldState.seedCourses[getActiveCampus()] = event;
  populateCoursePicker();
  selectCourse(event,opponent,extraOpponents);
  zoomMap = false;
  openMap(false);

  const close = () => {
    setFriendImporting(false);
    ui.friendDialog.close();
  };
  if (!archive) { close(); return; }
  setText(ui.friendStatus,'正在保存影子…');
  void saveFriendGhost({event,opponent}).then(close,error=>{
    console.error(error);
    setFriendImporting(false);
    setText(ui.friendStatus,'影子已载入对战，暂时无法保存到友人对战。');
    ui.friendClose.focus();
  });
}

function friendImportFailed(error) {
  setFriendImporting(false);
  if (!(error instanceof GhostFileError)) console.error(error);
  setText(ui.friendStatus,error instanceof GhostFileError?error.message:'读取影子文件失败，请重新选择。');
}

function prepareFriendChallenge(ghost,archive,extraGhosts=[]) {
  if (ghost.course.campus===getActiveCampus()) {
    const primary = loadFriendGhost(ghost);
    const extras = extraGhosts.map(item => loadFriendGhost(item).opponent);
    activateFriendChallenge(primary,archive,extras);
    return;
  }
  setText(ui.friendStatus,'正在载入 '+campuses[ghost.course.campus].name+'…');
  pendingCampus = {destination:ghost.course.campus,at:performance.now()+30,ghost,archive,extraGhosts};
}

async function importFriendFiles(files) {
  if (!canImportFriend() || friendImporting) return;
  openFriendDialog();
  if (files.length!==1) {
    setText(ui.friendStatus,'一次请选择一个影子文件。');
    return;
  }
  const file = files[0];
  if (file.size>MAX_GHOST_BYTES) {
    setText(ui.friendStatus,'文件过大，请选择游戏导出的影子文件。');
    return;
  }
  clearInput();
  setFriendImporting(true);
  setText(ui.friendStatus,'正在读取影子文件…');
  try {
    const ghost = readGhostFile(await file.text());
    if (!canImportFriend()) {
      setFriendImporting(false);
      return;
    }
    prepareFriendChallenge(ghost,true);
  } catch(error) { friendImportFailed(error); }
}

async function playSavedFriend(id) {
  if (!canImportFriend() || friendImporting) return;
  setFriendImporting(true);
  setText(ui.friendStatus,'正在读取已保存的影子…');
  try {
    const replay = await readSavedFriendGhost(id);
    if (!replay) {
      void refreshFriendBoard();
      throw new GhostFileError('这条影子已被移除。');
    }
    prepareFriendChallenge(readGhostFile(replay),false);
  } catch(error) { friendImportFailed(error); }
}

async function playSavedMultiFriends(ids) {
  if (!canImportFriend() || friendImporting || !Array.isArray(ids) || ids.length < 2) return;
  setFriendImporting(true);
  setText(ui.friendStatus,'正在载入同场群跑影子…');
  try {
    const ghosts = [];
    for (const id of ids.slice(0, 3)) {
      const replay = await readSavedFriendGhost(id);
      if (!replay) {
        void refreshFriendBoard();
        throw new GhostFileError('部分已选影子已被移除，请重新选择。');
      }
      ghosts.push(readGhostFile(replay));
    }
    ghosts.sort((a, b) => a.run.time - b.run.time);
    prepareFriendChallenge(ghosts[0], false, ghosts.slice(1));
  } catch(error) { friendImportFailed(error); }
}

function exportFriendGhost() {
  if (race.phase!=='done' || !race.lastRun || race.lastRun.unranked) return;
  const ghost = makeGhostFile(race.event,race.lastRun,driverProfile);
  const filename = ghost.rider.name.replace(/[<>:"/\\|?*]/g,'_')+'-'+
    (ghost.course.seed??ghost.course.id)+'-'+timeLabel(ghost.run.time).replaceAll(':','-')+'.ghost.json';
  const url = URL.createObjectURL(new Blob([JSON.stringify(ghost)],{type:'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function friendResult(opponent,time) {
  const gap = time-opponent.time;
  if (Math.abs(gap)<5) return '与 '+opponent.name+' 持平';
  return (gap<0?'领先 ':'落后 ')+opponent.name+' '+(Math.abs(gap)/1000).toFixed(2)+' 秒';
}

function initFriendDuel() {
  initFriendBoard();
  ui.friendButton.addEventListener('click',()=>openFriendDialog());
  ui.friendDrop.addEventListener('click',()=>ui.friendFile.click());
  ui.friendFile.addEventListener('change',()=>{
    const files = Array.from(ui.friendFile.files);
    ui.friendFile.value = '';
    if (files.length) void importFriendFiles(files);
  });
  ui.friendClose.addEventListener('click',()=>ui.friendDialog.close());
  ui.friendDialog.addEventListener('cancel',event=>{if(friendImporting) event.preventDefault();});
  ui.friendDialog.addEventListener('close',()=>{
    clearInput();
    priorTimestamp = undefined;
    if (!settingsOpen&&!ui.seedDialog.open) focusStage();
  });
  window.addEventListener('dragover',event=>{
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    const allowed = canImportFriend()&&!friendImporting;
    event.dataTransfer.dropEffect = allowed?'copy':'none';
    ui.friendDrop.classList.toggle('dragging',allowed&&ui.friendDrop.contains(event.target));
  });
  ui.friendDrop.addEventListener('dragleave',()=>ui.friendDrop.classList.remove('dragging'));
  window.addEventListener('drop',event=>{
    if (!event.dataTransfer?.files.length) return;
    event.preventDefault();
    ui.friendDrop.classList.remove('dragging');
    void importFriendFiles(Array.from(event.dataTransfer.files));
  });
  ui.friendExport.addEventListener('click',exportFriendGhost);
}

function selectCourse(event,opponent=null,extraOpponents=[]) {
  if (typeof CampusCourier !== 'undefined') CampusCourier.stop(false);
  courseByCampus[getActiveCampus()]=event;
  clearInput();
  race.select(event,opponent,extraOpponents);
  if (!getOnlineRoom()) setActiveWeather(event.environment?.weather ?? preferences.weather);
  refreshBicycleModels();
  cameraRevision++;
  ui.mapPlace.hidden=true;
  rebuildCourseHud();
  updateHud();
  focusStage();
}

function initInput() {
  installRaceOptions(ui, race, selectCourse, updateHud);
  ui.travel.addEventListener('click',requestTravel);
  ui.travelClose.addEventListener('click',()=>ui.travelDialog.close());
  ui.travelDialog.addEventListener('close',()=>{clearInput();priorTimestamp=undefined;ui.travel.focus();});
  ui.recover.addEventListener('click',recoverTrial);
  ui.coursePicker.addEventListener('change',()=>{
    const next=availableCourses(getActiveCampus()).find(event=>event.id===ui.coursePicker.value);
    if(!next||getOnlineRoom()||pendingCampus||race.phase==='race'||race.phase==='count') {ui.coursePicker.value=race.event.id;return;}
    selectCourse(next);
  });
  ui.mapCompare.addEventListener('click',()=>{
    setShowMapComparison(!getShowMapComparison());
    ui.mapCompare.setAttribute('aria-pressed',String(getShowMapComparison()));
    renderCampusMap(ui.bigMap,race,false,zoomMap);
  });
  ui.reviewMapButton.addEventListener('click',()=>{
    setShowMapComparison(true);
    zoomMap=true;
    openMap(true);
  });
  ui.practiceExit.addEventListener('click',exitSectorPractice);
  ui.mapZoom.addEventListener('click',()=>{
    zoomMap=!zoomMap;
    updateMapZoom();
    ui.mapPlace.hidden=true;
    renderCampusMap(ui.bigMap,race,false,zoomMap);
  });
  ui.hospitalRoute.addEventListener('click',()=>{
    uclRouteVisible=!uclRouteVisible; worldState.uclRouteVisible=uclRouteVisible;
    updateMapZoom();
    renderCampusMap(ui.bigMap,race,false,zoomMap);
  });
  ui.bigMap.addEventListener('pointermove',event=>{if(event.pointerType==='mouse')updateMapPlace(event);});
  ui.bigMap.addEventListener('pointerleave',()=>{ui.mapPlace.hidden=true;});
  ui.bigMap.addEventListener('click',updateMapPlace);
  ui.startTrial.addEventListener('click',startTrial);
  ui.freeRide.addEventListener('click',enterFreeRide);
  ui.pause.addEventListener('click',pauseTrial);
  ui.callAction.addEventListener('click',() => race.paused ? pauseTrial() : startTrial());
  ui.mapToggle.addEventListener('click',() => { openMap(!mapOpen); focusStage(); });
  ui.miniButton.addEventListener('click',() => { openMap(true); focusStage(); });
  window.addEventListener('keydown',event => {
    if(ui.travelDialog.open||ui.seedDialog.open||ui.friendDialog.open||ui.onlineDialog.open||ui.medalDialog?.open) return;
    if(event.code==='Escape'&&!event.repeat) {
      event.preventDefault();
      if(settingsOpen) closeSettings(); else openSettings();
      return;
    }
    if(settingsOpen||pendingCampus||event.target===ui.coursePicker) return;
    if(driveCodes.has(event.code)) {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      if (ready && !drive.has(event.code)) {
        drive.add(event.code);
        queueDrive(event);
      }
      return;
    }
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.code === 'KeyM') openMap(!mapOpen);
    else if (event.code === 'KeyR') startTrial();
    else if (event.code === 'KeyP') pauseTrial();
    else if (event.code === 'KeyF') recoverTrial();
    else if (event.code === 'KeyB' || event.code === 'KeyH') playCustomSound('bell');

  });
  window.addEventListener('keyup',event => { if (drive.delete(event.code)) queueDrive(event); });
  window.addEventListener('blur',clearInput);
  document.addEventListener('visibilitychange',() => {
    if (getOnlineRoom()) { clearInput(); return; }
    priorTimestamp = undefined;
    if (document.hidden) {
      clearInput();
      if (race.phase === 'race' || race.phase === 'count') race.paused = true;
      updateHud();
    }
  });
  const touchPad = document.querySelector('.touch');
  const syncTouchButtons = () => {
    const held = new Set(touches.values());
    for (const button of touchButtons) button.classList.toggle('active', held.has(button.dataset.drive));
  };
  const touchDriveAt = (x, y, pad = 10) => {
    let hit = null, bestScore = Infinity;
    for (const button of touchButtons) {
      if (button.hidden || button.disabled) continue;
      const r = button.getBoundingClientRect?.();
      if (!r || !r.width || !r.height) continue;
      if (x < r.left - pad || x > r.right + pad || y < r.top - pad || y > r.bottom + pad) continue;
      const cx = r.left + r.width * .5, cy = r.top + r.height * .5;
      const inside = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      const score = Math.hypot(x - cx, y - cy) + (inside ? 0 : 1000);
      if (score < bestScore) { bestScore = score; hit = button.dataset.drive; }
    }
    return hit;
  };
  if (touchPad) {
    const cancelTouchSelection = event => event.preventDefault();
    touchPad.addEventListener('touchstart', cancelTouchSelection, { passive: false });
    touchPad.addEventListener('contextmenu', cancelTouchSelection);
    touchPad.addEventListener('selectstart', cancelTouchSelection);
    touchPad.addEventListener('pointerdown', event => {
      if (!ready) return;
      const act = Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
        ? (touchDriveAt(event.clientX, event.clientY, 10) ?? event.target?.closest?.('[data-drive]')?.dataset.drive ?? null)
        : (event.target?.closest?.('[data-drive]')?.dataset.drive ?? null);
      if (!act) return;
      event.preventDefault();
      touches.set(event.pointerId, act);
      syncTouchButtons();
      queueDrive(event);
    });
    window.addEventListener('pointermove', event => {
      if (!touches.has(event.pointerId)) return;
      if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
      const next = touchDriveAt(event.clientX, event.clientY, 12);
      if (next !== touches.get(event.pointerId)) {
        touches.set(event.pointerId, next);
        syncTouchButtons();
        queueDrive(event);
      }
    });
    const releaseTouch = event => {
      if (!touches.delete(event.pointerId)) return;
      syncTouchButtons();
      queueDrive(event);
    };
    window.addEventListener('pointerup', releaseTouch);
    window.addEventListener('pointercancel', releaseTouch);
  }

  function fullscreenLabel() {
    const expanded = document.fullscreenElement === stage || stage.classList.contains('expanded');
    ui.expand.setAttribute('aria-label',expanded ? '退出全屏' : '全屏');
    ui.expand.title = expanded ? '退出全屏' : '全屏';
  }
  ui.expand.addEventListener('click',async () => {
    if (document.fullscreenElement === stage) await document.exitFullscreen();
    else if (stage.classList.contains('expanded')) { stage.classList.remove('expanded'); fullscreenLabel(); }
    else {
      try { await stage.requestFullscreen(); }
      catch { stage.classList.add('expanded'); fullscreenLabel(); }
    }
    focusStage();
  });
  document.addEventListener('fullscreenchange',fullscreenLabel);
}

function cameraWallHit(x, z, y) {
  return Boolean(buildingAt(x, z, .3, y)) || cityWallAt(x, z, y);
}

function avoidWall(origin,eye) {
  const steps = 20;
  let clear = 0;
  for (let i = 1; i <= steps; i++) {
    const part = i / steps;
    const point = lerpPoint(origin, eye, part);
    if (cameraWallHit(point[0], point[2], point[1])) {
      let lo = clear, hi = part;
      for (let k = 0; k < 8; k++) {
        const mid = (lo + hi) * .5;
        const probe = lerpPoint(origin, eye, mid);
        if (cameraWallHit(probe[0], probe[2], probe[1])) hi = mid;
        else lo = mid;
      }
      return lerpPoint(origin, eye, Math.max(0, lo - .006));
    }
    clear = part;
  }
  return eye;
}

function rideCamera(rider, aspect, prior, dt) {
  const f = headingVector(rider.heading), s = unitRight(f), p = rider.position;
  const portrait = aspect < 1, postcard = race.phase === 'free' && !race.moved;
  let eye, target;
  if (postcard) {
    eye = add(p,add(scale(f,2.35),add(scale(s,8.9),[0,4.15,0])));
    target = add(p,add(scale(f,portrait ? .0 : -1.05),add(scale(s,-3.12),[0,1.64,0])));
  } else {
    const distance=portrait?8.0:8.25;
    eye = add(p,add(scale(f,-distance),add(scale(s,portrait ? .6 : 1.24),[0,4.02,0])));
    target=add(p,add(scale(f,6.25+Math.max(0,rider.speed)*.087),[0,2.49,0]));
    if(race.phase==='race'&&race.onGuide&&race.nextGate>0) {
      const ahead = along(race.event.path, race.progressEstimate + 9.5 + Math.max(0, rider.speed) * .23);
      const look=normalize(subtract(ahead,p));
      if(dot(f,look)>.72) target=lerpPoint(target,[ahead[0],p[1]+2.49,ahead[2]],.145);
    }
  }
  target[1]+=rideElevation(target[0],target[2])-rideElevation(p[0],p[2]);
  let origin = add(p,add(scale(f,-.57),[0,2.7,0]));
  if (cameraWallHit(origin[0],origin[2],origin[1])) origin = [p[0],p[1]+2.15,p[2]];
  eye[1]=Math.max(eye[1],rideElevation(eye[0],eye[2])+1.45);
  eye = avoidWall(origin,eye);
  if (prior && !motion.matches) {
    const smooth = 1 - Math.exp(-dt * (prior.postcard === postcard ? 7.85 : 4.9));
    eye = lerpPoint(prior.eye,eye,smooth);
    target = lerpPoint(prior.target,target,smooth);
    eye[1]=Math.max(eye[1],rideElevation(eye[0],eye[2])+1.45);
    eye = avoidWall(origin,eye);
  }
  const stretch=motion.matches||postcard?0:speedFov(rider,prior,dt);
  const fov=(postcard?(portrait?.88:.81):portrait?1.01:.96)+stretch;
  const view = viewAt(eye,target), tan = Math.tan(fov/2);
  return {...view,eye,target,postcard,speedFov:stretch,tangent:[tan*aspect,tan],
    vp:multiply(perspective(fov,aspect,.56,1200),view.matrix)};
}

function projectTag(element, camera, point, width, height) {
  const clip = transform(camera.vp,point);
  const x = (.5 + .5 * clip[0]/clip[3]) * width;
  const y = (.5 - .5 * clip[1]/clip[3]) * height;
  element.hidden = !(clip[3] > .1 && x > 32 && x < width-32 && y > 42 && y < height-22);
  if (!element.hidden) {
    element.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) +
      'px,0) translate(-50%,-100%)';
  }
}

function unavailable(message) {
  document.getElementById('bootLoader')?.setAttribute('hidden','');
  ready = false;
  ui.startTrial.disabled = ui.freeRide.disabled = ui.pause.disabled = ui.travel.disabled = ui.friendButton.disabled = true;
  ui.notice.textContent = message;
  ui.notice.hidden = false;
}

function run() {
  buildRidingScene(getActiveCampus());
  updateCampusLabels();
  initHud();
  initInput();
  initSeedDialog();
  initFriendDuel();
  initOnline();
  initMedalDialog();
  ui.courierButton?.addEventListener('click',()=>{
    if(CampusCourier.active) CampusCourier.stop(true);
    else CampusCourier.start(getActiveCampus(),race.rider.position);
    updateHud();
    focusStage();
  });
  initSettings();
  setActiveWeather(preferences.weather);
  void initCustomSounds();
  let gpu;
  try { gpu = renderer(canvas); }
  catch (error) {
    console.error(error);
    unavailable('当前浏览器无法启动 3D。请用支持 WebGL 2 的浏览器打开，或查看俯视地图。');
    return;
  }

  let {world,cars}=uploadRidingScene(gpu,getActiveCampus());
  const body=new gpu.Mesh(makeRider().body), limbs=new gpu.Mesh(new Shape(),0,null,true);
  const ghostLimbs=new gpu.Mesh(new Shape(),0,null,true), roomLimbs=[];
  const motorRigs=new Map(), bicycleRigs=bicycleRigCache(gpu);
  let ownBicycle,friendBicycle,remoteBicycles=new Map();
  const getRig=kind=>motorRigs.get(kind);
  function prepareMotor(vehicle) {
    if(vehicle!=='bike'&&!motorRigs.has(vehicle)) motorRigs.set(vehicle,uploadPoweredRig(gpu,vehicle));
  }
  refreshBicycleModels=()=>{
    const selected=bicycleRigs.prepare(bicycleAppearance(driverProfile,race.bike));
    if(ownBicycle!==selected) {ownBicycle=selected;graphicsRevision++;}
    const opponent=race.opponent;
    friendBicycle=opponent?.vehicle==='bike'?bicycleRigs.prepare(bicycleAppearance(opponent,opponent.bike)):ownBicycle;
    prepareMotor(race.rider.vehicle);
    if(opponent) prepareMotor(opponent.vehicle);
    const state=getOnlineRoom()?.state;
    const peers=state?.players.filter(player=>player.id!==getOnlineRoom().id)??[];
    remoteBicycles=new Map();
    for(const player of peers) {
      const vehicle=state.vehicleRule==='any'?knownVehicle(player.vehicle):knownVehicle(state.vehicleRule);
      if(vehicle==='bike') remoteBicycles.set(player.id,bicycleRigs.prepare(bicycleAppearance(player,player.bike)));
      else prepareMotor(vehicle);
    }
    if (!getOnlineRoom()) {
      for (const [idx, extra] of (race.extraOpponents ?? []).entries()) {
        if (extra.vehicle==='bike') remoteBicycles.set('extra-'+idx,bicycleRigs.prepare(bicycleAppearance(extra,extra.bike)));
        else prepareMotor(extra.vehicle);
      }
    }
    for(const rival of race.rivals??[]) {
      if(rival.vehicle==='bike') remoteBicycles.set(rival.id,bicycleRigs.prepare(bicycleAppearance(rival,stockBike)));
      else prepareMotor(rival.vehicle);
    }
    const extraNeeded = getOnlineRoom() ? peers.length : Math.max(race.rivals?.length??0,race.extraOpponents?.length??0);
    while(roomLimbs.length<Math.min(3,extraNeeded)) roomLimbs.push(new gpu.Mesh(new Shape(),0,null,true));
  };
  refreshBicycleModels();
  const cheer=chairCheerClock();
  const courierBeacon=new gpu.Mesh(makeCourierBeaconShape());
  function ghostMeshes(ghost,limbMesh=ghostLimbs) {
    if (!ghost || length(subtract(ghost.position,race.rider.position))>65) return [];
    const kind=ghost.vehicle??race.opponent?.vehicle??race.rider.vehicle;
    const pitch=Math.atan(riderGrade(ghost.position,ghost.heading));
    if(kind!=='bike') {
      const lean=kind==='chair'?0:ghost.steering*clamp(Math.abs(ghost.speed)*.026,0,.216);
      return poweredPose(getRig(kind),placement(add(ghost.position,[0,.006,0]),lean,-ghost.heading,pitch),ghost);
    }
    const rig=ghost.id?remoteBicycles.get(ghost.id)??ownBicycle:friendBicycle;
    const turn=-.253*ghost.steering;
    const forkPose=placement(rig.pivot,0,turn,0);
    const steer=multiply(forkPose,placement(scale(rig.pivot,-1)));
    const pose=movingParts(ghost.travel,steer,rig.grip);
    limbMesh.update(pose.shape);
    const spin=-ghost.travel/TYRE_RADIUS;
    const lean=ghost.steering*clamp(Math.abs(ghost.speed)*.026,0,.216);
    const root=placement(add(ghost.position,[0,.006,0]),lean,-ghost.heading,pitch);
    return [[rig.frame,root],[rig.wheel,multiply(root,placement(REAR,0,0,spin))],
      [rig.wheel,multiply(root,placement(transform(steer,FRONT),0,turn,spin))],
      [rig.fork,multiply(root,forkPose)],[body,multiply(root,pose.bodyPose)],[limbMesh,root]];
  }
  const routeMeshes = new Map(), noRoute = [];
  let renderScale=1,renderedSettings=-1,lastStageWidth=0,lastStageHeight=0;
  let previousCamera, steering=Infinity, parts,bow,facing,waterTime=0,animationId,lastCameraRevision=-1,poseRig,posePhase,poseTuck,poseStand;

  const antialiasLevels = ['fxaa', 'msaa2', 'msaa'];
  let aaLevel = antialiasLevels.length - 1;
  let sampleTime = 0, sampleFrames = 0, stableTime = 0;
  let lastHud = -Infinity, lastMapAt = -Infinity, lastMap;

  function currentAA() {
    return preferences.aa === 'auto' ? antialiasLevels[aaLevel] : preferences.aa;
  }

  function adjustGraphics(dt) {
    if (mapOpen || settingsOpen || race.paused || dt === 0) {
      sampleTime = sampleFrames = stableTime = 0;
      return;
    }
    if (dt < .004) return;
    sampleFrames++;
    sampleTime += dt;
    if (sampleTime < .55) return;
    const frameTime = sampleTime / sampleFrames;
    if (frameTime > .021) {
      stableTime = 0;
      if (preferences.aa === 'auto' && aaLevel > 0) aaLevel--;
      else if (preferences.resolution === 'auto') renderScale = Math.max(.64, renderScale - .09);
    } else if (frameTime < .0178) {
      stableTime += sampleTime;
      if (stableTime >= 6) {
        if (preferences.resolution === 'auto' && renderScale < 1) renderScale = Math.min(1, renderScale + .06);
        else if (preferences.aa === 'auto' && aaLevel < antialiasLevels.length - 1) aaLevel++;
        stableTime = 0;
      }
    } else {
      stableTime = 0;
    }
    sampleTime = sampleFrames = 0;
  }


  function drawScene(dt, width, height, dpr) {
    if (!width || !height) return;
    const rider = race.rider, p = rider.position;
    lastStageWidth=width;lastStageHeight=height;renderedSettings=graphicsRevision;
    const rw = Math.max(1,Math.round(width*dpr)), rh = Math.max(1,Math.round(height*dpr));
    if (canvas.width !== rw || canvas.height !== rh) { canvas.width = rw; canvas.height = rh; }
    const pitch=Math.atan(riderGrade(p,rider.heading));
    const root=placement(add(p,[0,.004,0]),rider.lean+(rider.vehicle==='bike'?bicycleRock(rider):0),-rider.heading,pitch);
    let riderMeshes,tagHeight=1.88;
    if(rider.vehicle==='bike') {
      const rig=ownBicycle, angle=-.253*rider.steering;
      const phase=rider.pedalPhase??0, tuck=Math.round((rider.tuck??0)*256)/256, stand=Math.round((rider.stand??0)*256)/256;
      if(!parts||poseRig!==rig||posePhase!==phase||poseTuck!==tuck||poseStand!==stand||steering!==angle) {
        facing=placement(rig.pivot,0,angle,0);
        bow=multiply(facing,placement(scale(rig.pivot,-1)));
        parts=movingParts(rider.travel,bow,rig.grip,{pedalPhase:phase,tuck,stand});
        limbs.update(parts.shape);
        poseRig=rig; posePhase=phase; poseTuck=tuck; poseStand=stand; steering=angle;
      }
      const wheel=-rider.travel/TYRE_RADIUS;
      riderMeshes=[[rig.frame,root],[rig.wheel,multiply(root,placement(REAR,0,0,wheel))],
        [rig.wheel,multiply(root,placement(transform(bow,FRONT),0,angle,wheel))],
        [rig.fork,multiply(root,facing)],[body,multiply(root,parts.bodyPose)],[limbs,root]];
      tagHeight+=stand*.11-tuck*.16;
    } else {
      const rig=getRig(rider.vehicle);
      riderMeshes=poweredPose(rig,root,rider);
      tagHeight=rig.tagHeight;
    }
    if(lastCameraRevision!==cameraRevision){previousCamera=undefined;lastCameraRevision=cameraRevision;}
    previousCamera=rideCamera(rider,width/height,previousCamera,dt);
    let route = noRoute;
    if (race.phase !== 'free') {
      const leg=activeStage(race.event,race.nextGate), key=leg??race.event;
      if(!routeMeshes.has(key)) {
        for(const [old,{arrows,braking}] of routeMeshes) {
          if(!old.seed||old===worldState.seedCourses[getActiveCampus()]) continue;
          const meshes=new Set([...arrows,...braking].map(([mesh])=>mesh.owner??mesh));
          for(const mesh of meshes) mesh.dispose();
          routeMeshes.delete(old);
        }
        routeMeshes.set(key,courseDecor(gpu,race.event,leg));
      }
      const decorations=routeMeshes.get(key);
      route = preferences.brakeLine ? decorations.braking : decorations.arrows;
    }
    const ghost=preferences.ghost&&!getOnlineRoom()&&!race.rivals?.length?race.ghost:null;
    const ghosts=ghostMeshes(ghost);
    const aiRiders=race.rivals?.map(actor=>actor.pose).filter(Boolean)??[];
    const extraRiders=getOnlineRoom()?onlineRiderPoses(performance.now()):(aiRiders.length?aiRiders:preferences.ghost?race.extraGhosts:[]);
    for (const [index,remote] of extraRiders.entries()) {
      if(!roomLimbs[index]) continue;
      if(!aiRiders.length) ghosts.push(...ghostMeshes(remote,roomLimbs[index]));
    }
    const { models: trafficModels, batches: trafficBatches } = prepareTraffic(
      previousCamera, raceTrafficTime(race), trialTraffic(race).vehicles, cars,
      rideElevation, getActiveCampus()==='shunde' ? riderGrade : null,
    );
    for(const [index,rival] of aiRiders.entries()) {
      if(roomLimbs[index]) trafficModels.push(...ghostMeshes(rival,roomLimbs[index]));
    }
    if(!getOnlineRoom()&&race.phase==='free'&&CampusCourier.active&&CampusCourier.target&&CampusCourier.campus===getActiveCampus()) {
      const tp=CampusCourier.target.p;
      trafficModels.push([courierBeacon,placement([tp[0],tp[1],tp[2]],0,waterTime*1.5,0)]);
    }
    const head={pos:[p[0],p[1]+.92,p[2]],dir:normalize([Math.cos(rider.heading),-.11,Math.sin(rider.heading)])};
    if(currentWeather().rain&&!world.rainPuddles) {
      world.rainPuddles=[[new gpu.Mesh(rainPuddleShape(getActiveCampus())),placement([0,0,0],0,0,0)]];
    }
    const renderedFrame=gpu.draw(previousCamera,world,route,riderMeshes,p,waterTime,ghosts,trafficModels,currentAA(),head,getOnlineRoom()?2:1,motion.matches?null:draftRenderSpan(rider),trafficBatches);
    if (currentWeather().rain) drawRainOverlay(ui.weatherOverlay, rider.speed, performance.now());
    updateGraphicsStatus(renderedFrame);
    projectTag(ui.riderTag,previousCamera,transform(root,[-.08,tagHeight,0]),width,height);
    if (race.opponent&&ghost&&ghosts.length) {
      setText(ui.friendTag,race.opponent.name);
      const tagY=race.opponent.vehicle==='chair'?1.57:1.93;
      projectTag(ui.friendTag,previousCamera,add(ghost.position,[0,tagY,0]),width,height);
    } else ui.friendTag.hidden=true;
    const onlineTags=[ui.onlineTag0,ui.onlineTag1,ui.onlineTag2];
    for (let i=0;i<onlineTags.length;i++) {
      const remote=extraRiders[i], tag=onlineTags[i];
      if (!tag) continue;
      if (remote && length(subtract(remote.position,p))<65) {
        setText(tag,remote.skill ? `${remote.name} · ${remote.skill}` : remote.name||DEFAULT_RIDER_NAME);
        const tagY=remote.vehicle==='chair'?1.57:1.96;
        projectTag(tag,previousCamera,add(remote.position,[0,tagY,0]),width,height);
      } else tag.hidden=true;
    }
    const remark=cheer(dt,rider.vehicle==='chair'&&rider.speed>1.1&&!settingsOpen&&!race.paused);
    if(remark) {
      setText(ui.chairCheer,remark);
      projectTag(ui.chairCheer,previousCamera,transform(root,[-.08,tagHeight+.31,0]),width,height);
    } else ui.chairCheer.hidden=true;
    if(!getOnlineRoom()&&race.phase==='free'&&CampusCourier.active&&CampusCourier.target&&CampusCourier.campus===getActiveCampus()&&ui.courierTag) {
      setText(ui.courierTag,'闪送 · '+CampusCourier.target.name);
      projectTag(ui.courierTag,previousCamera,add(CampusCourier.target.p,[0,7.5,0]),width,height);
    } else if(ui.courierTag) ui.courierTag.hidden=true;
    const gates=race.event.gates,gate=gates[race.nextGate];
    if (race.phase === 'race' && gate && length(subtract(p,gate.p)) < 96) {
      setText(ui.gateTag,gate.index > 0 && gate.index < gates.length-1 ? '检查点 ' + gate.number : gate.number);
      projectTag(ui.gateTag,previousCamera,courseGround(race.event,[gate.p[0],race.event.campus==='ucl'?4.36:6.04,gate.p[2]],gate.rise),width,height);
    } else ui.gateTag.hidden = true;
  }

  function completeTravel() {
    const previous=getActiveCampus(), previousObstacles=worldState.ridingObstacles;
    const previousLists=sceneLists.map(items=>items.slice()), previousGround=worldState.groundSurfaces;
    if (typeof CampusCourier !== 'undefined') CampusCourier.stop(false);
    const {destination,ghost,archive,online,extraGhosts,targetCourseId}=pendingCampus;
    setActiveCampus(destination);
    pendingCampus=null;
    let challenge, challengeExtra=[], onlineCourse;
    try {
      buildRidingScene(getActiveCampus());
      if (ghost) {
        challenge=loadFriendGhost(ghost);
        if (extraGhosts?.length) challengeExtra=extraGhosts.map(item=>loadFriendGhost(item).opponent);
      }
      if (online) onlineCourse=findOnlineCourse(online.route);
    } catch(error) {
      console.error(error);
      setActiveCampus(previous);
      for(const [i,items] of sceneLists.entries()) {
        items.length=0;
        for(const item of previousLists[i]) items.push(item);
      }
      worldState.groundSurfaces=previousGround;
      worldState.ridingObstacles=previousObstacles;
      clearWorldShapes();
      if (ghost) friendImportFailed(error);
      else if (online) online.reject(error);
      else setText(ui.notice,'目的地暂时无法加载，请重试。');
      return;
    }
    disposeRidingScene(world,cars,routeMeshes);
    ({world,cars}=uploadRidingScene(gpu,getActiveCampus()));
    updateCampusLabels();
    if (challenge) activateFriendChallenge(challenge,archive,challengeExtra);
    else {
      if (targetCourseId) {
        const picked=coursesByCampus[getActiveCampus()].find(c=>c.id===targetCourseId);
        if (picked) courseByCampus[getActiveCampus()]=picked;
      }
      race.select(courseByCampus[getActiveCampus()]);
      if (!getOnlineRoom()) setActiveWeather(race.event.environment?.weather ?? preferences.weather);
      zoomMap=false;
      initHud();
      arriveAtStation();
      if (online) online.resolve(onlineCourse);
    }
    lastMap=undefined;
    ui.notice.hidden=true;
  }

  function update(now) {
    if(pendingCampus&&now>=pendingCampus.at) completeTravel();
    tickOnline(now);
    const frameStart = priorTimestamp ?? now;
    const wallTime = Math.max(0, (now - frameStart) / 1000);
    const dt = Math.min(wallTime, .16);
    if(mapOpen) updateMapReplay(dt);
    priorTimestamp = now;
    if(!race.paused&&!settingsOpen) waterTime+=dt;
    adjustGraphics(dt);
    const width = stage.clientWidth, height = stage.clientHeight;
    const dpr = width && height ? graphicsScale(width, height, renderScale) : 1;
    const roomRacing = getOnlineRoom()?.state.phase==='race' && !getOnlineRoom().retired && race.phase!=='free';
    const freeRunning = !getOnlineRoom()&&!settingsOpen&&!pendingCampus&&!ui.seedDialog.open&&!ui.friendDialog.open&&!ui.onlineDialog.open&&!ui.medalDialog?.open&&!ui.travelDialog.open;
    if (roomRacing || freeRunning) {
      if (!roomRacing && wallTime > 1 && (race.phase === 'race' || race.phase === 'count')) {
        race.paused = true;
        clearInput();
      }
      const simulationTime = race.phase === 'free' ? dt : wallTime;
      const simulationStart = now - simulationTime * 1000;
      race.advance(simulationTime, offset => driveAt(simulationStart + offset * 1000));
      if (freeRunning && race.phase === 'free' && !race.paused) {
        CampusCourier.tick(dt, race.rider, getActiveCampus(), now);
      }
    }
    if (typeof updateRideAudio === 'function') updateRideAudio(race.rider, dt, !settingsOpen && !race.paused && !mapOpen && !pendingCampus);
    const progressChanged = previousPhase !== race.phase || previousPaused !== race.paused || previousGate !== race.nextGate;
    if (progressChanged || now - lastHud >= 30) {
      updateHud();
      lastHud = now;
    }
    const graphicsChanged = renderedSettings !== graphicsRevision || width !== lastStageWidth ||
      height !== lastStageHeight || Math.round(width * dpr) !== canvas.width ||
      Math.round(height * dpr) !== canvas.height;
    if ((!mapOpen && !settingsOpen) || (graphicsChanged && (!mapOpen || settingsOpen))) {
      drawScene(settingsOpen ? 0 : dt, width, height, dpr);
    }
    const map = mapOpen ? ui.bigMap : ui.miniMap;
    if (map !== lastMap || progressChanged || (settingsOpen && graphicsChanged) ||
        (!settingsOpen && now - lastMapAt >= (mapOpen ? 30 : 48))) {
      renderCampusMap(map, race, !mapOpen, mapOpen && zoomMap);
      lastMap = map;
      lastMapAt = now;
    }
    animationId = requestAnimationFrame(update);
  }

  canvas.addEventListener('webglcontextlost',event => {
    event.preventDefault();
    cancelAnimationFrame(animationId);
    unavailable('3D 渲染已暂停，等待浏览器恢复。');
  });
  canvas.addEventListener('webglcontextrestored',()=>location.reload(),{once:true});
  ready = true;
  document.getElementById('bootLoader')?.setAttribute('hidden','');
  update(performance.now());
}



function graphicsScale(width,height,adaptive) {
  const screen=Math.min(devicePixelRatio||1,1.60);
  const mode=preferences.resolution;
  const factor=mode==='sharp'?1.25:mode==='fast'?.75:adaptive;
  const budget=mode==='sharp'?2580000:mode==='fast'?930000:1680000;
  return Math.min(screen*factor,Math.sqrt(budget/(width*height)));
}

function updateGraphicsStatus(frame) {
  const aa=frame.samples?frame.samples+'× MSAA + FXAA':frame.fxaa?'FXAA':'抗锯齿已关闭';
  setText(ui.settingsStatus,frame.width+' × '+frame.height+' · '+aa);
}

function fillPreferences() {
  ui.settingsResolution.value=preferences.resolution;
  ui.settingsAA.value=preferences.aa;
  ui.settingsGhost.checked=preferences.ghost;
  ui.settingsBrakeLine.checked=preferences.brakeLine;
  ui.settingsWeather.value=knownWeather(preferences.weather);
  if(ui.settingsSound) ui.settingsSound.checked=preferences.sound!==false;
  if(ui.settingsTouchSize) ui.settingsTouchSize.value=knownTouchSize(preferences.touchSize);
  applyTouchSize();
  applyHudScale();
  ui.settingsHudScale.value=knownHudScale(preferences.hudScale);
  ui.settingsTraffic.value=preferences.traffic;
  ui.settingsTraffic.disabled=Boolean(getOnlineRoom())||race.phase==='race'||race.phase==='count';
  ui.settingsCollision.disabled=Boolean(getOnlineRoom())||trialTraffic(race).mode==='off';
  ui.settingsCollision.checked=preferences.collision===true;
  if(ui.settingsWindSpeed) ui.settingsWindSpeed.value=String(preferences.windSpeed??0);
  ui.settingsWindMode.value=knownWindMode(preferences.windMode);
  if(ui.settingsWindDir) ui.settingsWindDir.value=String(preferences.windDir??0);
}

function knownHudScale(value) {
  return ['65','80','100','115','130'].includes(value)?value:'auto';
}
function applyHudScale() {
  stage.dataset.hudScale=knownHudScale(preferences.hudScale);
}
export function applyTouchSize() {
  if (typeof stage !== 'undefined' && stage?.dataset) stage.dataset.touchSize = knownTouchSize(preferences.touchSize);
}

function savePreferences() {
  try { localStorage.setItem(PREF_KEY,JSON.stringify(preferences)); } catch {}
  graphicsRevision++;
  if (typeof scheduleLocalSave === 'function') scheduleLocalSave();
}

function isFullscreen() {
  return document.fullscreenElement===stage||stage.classList.contains('expanded');
}

function updateSettingsActions() {
  const active=race.phase==='race'||race.phase==='count';
  setText(ui.settingsContinue,active&&!race.paused?'继续比赛':'返回骑行');
  ui.recover.hidden=race.phase!=='race';
  ui.settingsExit.hidden=race.phase==='free';
  setText(ui.settingsExit,active?'退出比赛':'返回自由骑行');
  ui.settingsUnfullscreen.hidden=!isFullscreen();
  setText(ui.settingsState,active?'比赛已暂停，计时停止':'');
  ui.settingsState.hidden=!active;
}

function showBikeSetup() {
  const bike=race.bike, vehicle=race.rider.vehicle;
  const locked=race.phase==='count'||race.phase==='race', bicycle=vehicle==='bike';
  ui.vehiclePicker.value=vehicle;
  const roomFixedVeh=Boolean(getOnlineRoom()&&(getOnlineRoom().state.vehicleRule??'bike')!=='any');
  ui.vehiclePicker.disabled=locked||Boolean(race.opponent)||roomFixedVeh;
  ui.bikeParts.hidden=!bicycle;
  ui.motorTuning.hidden=bicycle;
  ui.vehicleNote.hidden=bicycle;
  const paintStats = courseMedalSummary();
  for (const opt of ui.bikePaint.options) {
    const info = bicyclePaints[opt.value];
    if (!info) continue;
    const unlocked = isPaintUnlocked(opt.value, paintStats);
    opt.disabled = !unlocked;
    opt.textContent = unlocked ? info.name : info.name + '（需' + info.unlock + '）';
  }
  if (!isPaintUnlocked(driverProfile.paint, paintStats)) {
    driverProfile.paint = 'classic';
    storeDriverProfile(driverProfile);
  }
  ui.bikePaint.value=driverProfile.paint;
  ui.bikePaint.disabled=locked||!bicycle;
  if(!bicycle) {
    const tuned=buildVehicleTuning(vehicle,vehicleTunings[vehicle]);
    race.rider.tuning=tuned;
    setText(ui.vehicleNote,vehicle==='trail'?'长行程越野避震提升碎石抓地。':
      vehicle==='ebike'?'宽齿防滑胎提升碎石抓地。':'户外越野轮提升碎石抓地。');
    const slots=vehicleTuningChoices[vehicle]??[];
    const labels=[ui.vehLabel0,ui.vehLabel1,ui.vehLabel2], selects=[ui.vehSlot0,ui.vehSlot1,ui.vehSlot2], notes=[ui.vehNote0,ui.vehNote1,ui.vehNote2];
    slots.forEach((slot,i)=>{
      setText(labels[i],slot.label);
      const sel=selects[i];
      sel.replaceChildren();
      for(const [val,opt] of Object.entries(slot.options)) {
        const el=document.createElement('option');
        el.value=val; el.textContent=workshopPartTitle(vehicle,slot.key,val,opt.name); sel.append(el);
      }
      const cur=tuned.parts[slot.key]??'stock';
      sel.value=cur;
      sel.disabled=locked;
      setText(notes[i],slot.options[cur]?.note??'');
    });
    renderPoweredWorkshop(vehicle,tuned);
  }

  ui.bikeTyres.value = bike.tyres;
  ui.bikeGears.value = bike.gears;
  ui.bikeBrakes.value = bike.brakes;
  ui.bikeFrame.value = bike.frame ?? 'stock';
  ui.bikeSprint.value = bike.sprint ?? 'stock';
  ui.bikeTyres.disabled=ui.bikeGears.disabled=ui.bikeBrakes.disabled=ui.bikeFrame.disabled=ui.bikeSprint.disabled=locked||!bicycle;
  ui.bikeLock.hidden = !locked;
  setText(ui.tyreNote, tyreChoices[bike.tyres].note);
  setText(ui.gearNote, gearChoices[bike.gears].note);
  setText(ui.brakeNote, brakeChoices[bike.brakes].note);
  setText(ui.frameNote, frameChoices[bike.frame ?? 'stock'].note);
  setText(ui.sprintNote, sprintChoices[bike.sprint ?? 'stock'].note);
  setText(ui.bikeGrass,(bike.grassSpeed*3.6).toFixed(1)+' km/h');
  setText(ui.bikeBrakePower,Math.round(bike.brakePower*100)+'%');
  setText(ui.bikeBrakeGrip,Math.round(bike.roadGrip*(1-bike.brakeTurnLoss)/stockBike.roadGrip*100)+'%');
  setText(ui.bikeTopSpeed, (bike.roadSpeed * 3.6).toFixed(1) + ' km/h');
  setText(ui.bikeGrip, Math.round(bike.roadGrip / stockBike.roadGrip * 100) + '%');
  setText(ui.bikeSprintSpeed, (bike.sprintSpeed * 3.6).toFixed(1) + ' km/h');
  setText(ui.bikeAcceleration, Math.round(bike.force * 100) + '%');
  if(bicycle) renderWorkshop(bike,locked);
  renderWorkshopBudget();
  refreshBicycleModels();
}

function installBikeParts() {
  if(race.rider.vehicle!=='bike'||!race.setBike(buildBike(ui.bikeTyres.value,ui.bikeGears.value,ui.bikeBrakes.value,ui.bikeFrame.value,ui.bikeSprint.value))) return;
  const {tyres,gears,brakes,frame,sprint}=race.bike;
  try { localStorage.setItem(bikeKey,JSON.stringify({tyres,gears,brakes,frame,sprint})); } catch {}
  if (typeof scheduleLocalSave === 'function') scheduleLocalSave();
  showBikeSetup();
  if (typeof getOnlineRoom() !== 'undefined' && getOnlineRoom()?.state.phase==='tuning') syncOnlineProfile();
}

function installVehicleTuning() {
  const vehicle = race.rider.vehicle;
  const slots = vehicleTuningChoices[vehicle];
  if (!slots || race.phase==='race' || race.phase==='count') return;
  const selects = [ui.vehSlot0, ui.vehSlot1, ui.vehSlot2];
  const next = {};
  slots.forEach((slot, i) => { next[slot.key] = selects[i].value; });
  vehicleTunings[vehicle] = normalizeVehicleParts(vehicle, next);
  race.rider.tuning = buildVehicleTuning(vehicle, vehicleTunings[vehicle]);
  storeVehicleTunings(vehicleTunings);
  showBikeSetup();
  if (typeof getOnlineRoom() !== 'undefined' && getOnlineRoom()?.state.phase==='tuning') syncOnlineProfile();
}

function setSettingsPanel(panel = 'display') {
  if(panel !== 'display' && !ui.displaySettings.hidden) commitDriverName();
  const garage = panel === 'bike', guide = panel === 'guide';
  setText(ui.settingsTitle, garage ? '车库' : guide ? '玩法说明' : '设置');
  ui.displaySettings.hidden = garage || guide;
  ui.bikeSettings.hidden = !garage;
  if(ui.guideSettings) ui.guideSettings.hidden = !guide;
  if(ui.settingsGuideBtn) {
    ui.settingsGuideBtn.hidden = garage;
    setText(ui.settingsGuideBtn, guide ? '返回设置' : '玩法说明');
  }
  if(garage) showBikeSetup();
  else if(!guide) ui.driverName.value = driverProfile.name;
}

export function openSettings(panel = 'display') {
  if(settingsOpen||pendingCampus||(getOnlineRoom()&&(panel!=='bike'||getOnlineRoom().state.phase==='race'))) return;
  clearInput();priorTimestamp=undefined;settingsOpen=true;
  setSettingsPanel(panel);
  updateSettingsActions();
  ui.settingsDialog.showModal();
  ui.settingsContinue.focus({preventScroll:true});
}

function commitDriverName() {
  const name=riderName(ui.driverName.value);
  ui.driverName.value=name;
  if(driverProfile.name===name) return;
  driverProfile.name=name;
  storeDriverProfile(driverProfile);
  updateHud();
}

export function closeSettings() {
  if(!settingsOpen) return;
  if(!ui.displaySettings.hidden) commitDriverName();
  settingsOpen=false;priorTimestamp=undefined;clearInput();
  ui.settingsDialog.close();
  if (getOnlineRoom()) { if (getOnlineRoom().state.phase!=='race') { syncOnlineProfile(); showOnlineDialog(); } else focusStage(); return; }
  focusStage();
}

async function leaveFullscreen() {
  if(stage.classList.contains('expanded')) stage.classList.remove('expanded');
  if(document.fullscreenElement===stage) {
    try { await document.exitFullscreen(); } catch {}
  }
  const expanded=isFullscreen();
  ui.expand.setAttribute('aria-label',expanded?'退出全屏':'全屏');
  ui.expand.title=expanded?'退出全屏':'全屏';
  if(settingsOpen) updateSettingsActions();
}

function quitTrial() {
  if(race.phase==='free') return;
  clearInput();
  race.opponent=null;
  race.extraOpponents=[];
  race.abandon();cameraRevision++;priorTimestamp=undefined;
  refreshBicycleModels();
  openMap(false);rebuildCourseHud();updateHud();
  closeSettings();focusStage();
  if(isFullscreen()) void leaveFullscreen();
}

function initSettings() {
  initBicycleWorkshop();
  initMapReplay();
  fillPreferences();
  ui.driverName.value=driverProfile.name;
  for(const [choices,select] of [[vehicleChoices,ui.vehiclePicker],[bicyclePaints,ui.bikePaint]]) {
    for(const [value,choice] of Object.entries(choices)) {
      const option=document.createElement('option');
      option.value=value;
      option.textContent=choice.name;
      select.appendChild(option);
    }
  }
  ui.driverName.addEventListener('change',commitDriverName);
  ui.vehiclePicker.addEventListener('change',()=>{
    const choice=ui.vehiclePicker.value;
    if(!race.setVehicle(choice)) {showBikeSetup();return;}
    driverProfile.vehicle=choice;
    storeDriverProfile(driverProfile);
    showBikeSetup();
    rebuildCourseHud();
    updateHud();
    updateSettingsActions();
    if (typeof getOnlineRoom() !== 'undefined' && getOnlineRoom()?.state.phase==='tuning') syncOnlineProfile();
  });
  ui.bikePaint.addEventListener('change',()=>{
    if(race.rider.vehicle!=='bike'||race.phase==='race'||race.phase==='count'||!isPaintUnlocked(ui.bikePaint.value)) {showBikeSetup();return;}
    driverProfile.paint=knownPaint(ui.bikePaint.value);
    storeDriverProfile(driverProfile);
    showBikeSetup();
    if (typeof getOnlineRoom() !== 'undefined' && getOnlineRoom()?.state.phase==='tuning') syncOnlineProfile();
  });
  ui.settingsButton.addEventListener('click',() => openSettings());
  ui.settingsGuideBtn?.addEventListener('click',()=>setSettingsPanel(ui.guideSettings?.hidden?'guide':'display'));
  ui.bikeButton.addEventListener('click',() => openSettings('bike'));
  ui.bikeTyres.addEventListener('change',installBikeParts);
  ui.bikeGears.addEventListener('change',installBikeParts);
  ui.bikeBrakes.addEventListener('change',installBikeParts);
  ui.bikeFrame.addEventListener('change',installBikeParts);
  ui.bikeSprint.addEventListener('change',installBikeParts);
  for (const sel of [ui.vehSlot0, ui.vehSlot1, ui.vehSlot2]) sel.addEventListener('change', installVehicleTuning);
  ui.saveExport.addEventListener('click', () => void exportSaveFile());
  ui.saveImport.addEventListener('click', () => ui.saveFile.click());
  ui.saveFile.addEventListener('change', () => {
    const f = ui.saveFile.files[0];
    ui.saveFile.value = '';
    void importSaveFile(f);
  });
  ui.settingsContinue.addEventListener('click',closeSettings);
  ui.settingsExit.addEventListener('click',quitTrial);
  ui.settingsUnfullscreen.addEventListener('click',leaveFullscreen);
  ui.settingsDialog.addEventListener('cancel',event=>{event.preventDefault();closeSettings();});
  ui.settingsDialog.addEventListener('close',()=>{
    if(settingsOpen) {
      settingsOpen=false;priorTimestamp=undefined;clearInput();focusStage();
    }
  });
  for(const [key,control] of [['resolution',ui.settingsResolution],['aa',ui.settingsAA],['weather',ui.settingsWeather]]) {
    control.addEventListener('change',()=>{
      preferences[key]=control.value;if(key==='weather'&&!getOnlineRoom()&&!race.event?.environment) setActiveWeather(control.value);savePreferences();
    });
  }
  for (const [key, control] of [['ghost',ui.settingsGhost], ['brakeLine',ui.settingsBrakeLine], ['sound',ui.settingsSound], ['collision',ui.settingsCollision]]) {
    if (!control) continue;
    control.addEventListener('change', () => {
      preferences[key] = control.checked;
      if (key === 'sound' && typeof setRideAudioMuted === 'function') setRideAudioMuted(!control.checked);
      savePreferences();
    });
  }
  ui.settingsHudScale.addEventListener('change',()=>{
    preferences.hudScale=knownHudScale(ui.settingsHudScale.value);
    applyHudScale();
    savePreferences();
  });
  ui.settingsTouchSize?.addEventListener('change',()=>{
    preferences.touchSize=knownTouchSize(ui.settingsTouchSize.value);
    applyTouchSize();
    savePreferences();
  });
  ui.settingsTraffic.addEventListener('change',()=>{
    preferences.traffic=knownTraffic(ui.settingsTraffic.value);
    ui.settingsCollision.disabled=preferences.traffic==='off';
    savePreferences();
  });
  ui.settingsWindSpeed?.addEventListener('change',()=>{
    const w=Math.round(clamp(Number(ui.settingsWindSpeed.value)||0,0,15)*10)/10;
    ui.settingsWindSpeed.value=String(w);
    preferences.windSpeed=w;
    savePreferences();
    updateHud();
  });
  ui.settingsWindMode.addEventListener('change',()=>{
    preferences.windMode=knownWindMode(ui.settingsWindMode.value);
    savePreferences();
  });
  ui.settingsWindDir?.addEventListener('change',()=>{
    const d=Math.round(clamp(Number(ui.settingsWindDir.value)||0,0,7));
    ui.settingsWindDir.value=String(d);
    preferences.windDir=d;
    savePreferences();
    updateHud();
  });
  document.addEventListener('fullscreenchange',()=>{if(settingsOpen) updateSettingsActions();});
}


function renderWorkshopBudget() {
  const {total,limit,over,illegal}=workshopBudget(race);
  setText(ui.budgetReadout,`已用 ¥${total} / ${limit===null?'不限预算':`预算 ¥${limit}`}${over?` · 超额 ¥${over}`:''}`);
  ui.budgetReadout.dataset.over=String(over>0);
  ui.budgetHighlight.hidden=over===0;
  ui.budgetNotice.hidden=!illegal;
  setText(ui.budgetNotice,getOnlineRoom()&&getOnlineRoom().state.budget!=='party'?'此房间禁止违禁魔改件':'违禁魔改 · 娱乐不计榜');
  ui.budgetPicker.disabled=Boolean(getOnlineRoom())||race.phase==='count'||race.phase==='race';
  ui.budgetPicker.value=tuning190.normalizeBudget(preferences.soloBudget);
  for(const select of ui.bikeSettings.querySelectorAll('[data-over-budget]')) delete select.dataset.overBudget;
}

function highlightBudgetParts() {
  const {items,over}=workshopBudget(race);
  const vehicle=race.rider.vehicle;
  const selects=vehicle==='bike'
    ?[ui.bikeTyres,ui.bikeGears,ui.bikeBrakes,ui.bikeFrame,ui.bikeSprint]:[ui.vehSlot0,ui.vehSlot1,ui.vehSlot2];
  let excess=over;
  items.map((item,index)=>({...item,select:selects[index]})).sort((a,b)=>b.price-a.price).forEach(item=>{
    if(excess<=0) return;
    item.select.dataset.overBudget='true';
    const group=item.select.closest('details');
    if(group) group.open=true;
    excess-=item.price;
  });
  const first=selects.find(select=>select.dataset.overBudget);
  first?.focus();
}

function renderWorkshopAbility(panel,ratios) {
  ratios.forEach((ratio,index)=>{
    const row=panel.children[index];
    const delta=Math.round((ratio-1)*100);
    row.dataset.change=delta>0?'up':delta<0?'down':'even';
    row.querySelector('meter').value=clamp(ratio,0,1.5);
    setText(row.querySelector('output'),delta===0?'持平':`${delta>0?'+':''}${delta}%`);
  });
}

function renderPoweredWorkshop(vehicle,tuned) {
  const stock=buildVehicleTuning(vehicle);
  setText(ui.vehTopSpeed,workshopSpeed(tuned.roadSpeed));
  setText(ui.vehGravel,workshopSpeed(tuned.gravelSpeed));
  setText(ui.vehGrass,workshopSpeed(tuned.grassSpeed));
  renderWorkshopAbility(ui.vehAbility,[
    tuned.roadGrip/stock.roadGrip,tuned.gravelGrip/stock.gravelGrip,tuned.force/stock.force,
    tuned.brakePower/stock.brakePower,tuned.steerScale/stock.steerScale
  ]);
}

function renderWorkshop(bike,locked) {
  const look=bicycleStyle(driverProfile.look);
  for(const select of ui.bikeStyles.querySelectorAll('select')) {
    select.value=look[select.name];
    select.disabled=locked;
  }
  const preset=Object.entries(bicyclePresets).find(([,option])=>option.paint===driverProfile.paint&&
    option.parts.every((value,index)=>value===bike[bicyclePartKeys[index]])&&
    Object.entries(bicycleStyle(option.look)).every(([key,value])=>look[key]===value));
  setText(ui.bikePresetName,preset?.[1].name??'自定义构筑');
  for(const button of ui.bikePresets.querySelectorAll('button')) {
    button.disabled=locked;
    button.setAttribute('aria-pressed',String(button.dataset.preset===preset?.[0]));
  }
  setText(ui.bikeGravel,workshopSpeed(bicycleGravelSpeed(bike)));
  renderWorkshopAbility(ui.bikeAbility,bicycleAbility(bike));
}

function initWorkshopAbility(panel,names) {
  for(const name of names) {
    const row=document.createElement('div');
    const label=document.createElement('span'); label.id=panel.id+'-'+panel.children.length; label.textContent=name;
    const meter=document.createElement('meter'); meter.max=1.5; meter.value=1; meter.setAttribute('aria-labelledby',label.id);
    const delta=document.createElement('output');
    row.append(label,meter,delta); panel.append(row);
  }
}

function initBicycleWorkshop() {
  const selects=[ui.bikeTyres,ui.bikeGears,ui.bikeBrakes,ui.bikeFrame,ui.bikeSprint];
  bicyclePartKeys.forEach((slot,index)=>{
    selects[index].replaceChildren(...Object.entries(bikePartOptions[slot]).map(([key,{name}])=>
      new Option(workshopPartTitle('bike',slot,key,name),key)));
  });
  ui.budgetPicker.addEventListener('change',()=>{
    preferences.soloBudget=tuning190.normalizeBudget(ui.budgetPicker.value);
    savePreferences();
    renderWorkshopBudget();
    updateHud();
  });
  ui.budgetHighlight.addEventListener('click',highlightBudgetParts);
  for(const [id,preset] of Object.entries(bicyclePresets)) {
    const button=document.createElement('button');
    button.type='button'; button.className='action'; button.dataset.preset=id; button.textContent=preset.name;
    button.addEventListener('click',()=>{
      if(race.rider.vehicle!=='bike'||race.phase==='race'||race.phase==='count') return;
      [ui.bikeTyres.value,ui.bikeGears.value,ui.bikeBrakes.value,ui.bikeFrame.value,ui.bikeSprint.value]=preset.parts;
      driverProfile.look=bicycleStyle(preset.look);
      driverProfile.paint=preset.paint;
      storeDriverProfile(driverProfile);
      installBikeParts();
    });
    ui.bikePresets.append(button);
  }
  for(const [name,{label,choices}] of Object.entries(bicycleStyles)) {
    const row=document.createElement('div'); row.className='setting-line';
    const title=document.createElement('label'); title.htmlFor='bikeStyle-'+name; title.textContent=label;
    const select=document.createElement('select'); select.id=title.htmlFor; select.name=name;
    for(const [key,caption] of Object.entries(choices)) select.append(new Option(caption,key));
    select.addEventListener('change',()=>{
      if(race.rider.vehicle!=='bike'||race.phase==='race'||race.phase==='count') return;
      driverProfile.look=bicycleStyle({...driverProfile.look,[name]:select.value});
      storeDriverProfile(driverProfile);
      showBikeSetup();
      if (typeof getOnlineRoom() !== 'undefined' && getOnlineRoom()?.state.phase==='tuning') syncOnlineProfile();
    });
    row.append(title,select); ui.bikeStyles.append(row);
  }
  initWorkshopAbility(ui.bikeAbility,['直道巡航','冲刺爆发','弯道抓地','爬坡出弯','越野湿地','直线制动']);
  initWorkshopAbility(ui.vehAbility,['铺装抓地','碎石抓地','低速推力','直线制动','转向响应']);
}

function renderMedalSection(listEl, items, canJump) {
  if (!listEl) return;
  const nodes = items.map(({ event, tier, label, time, authorMs, goldMs }) => {
    const li = document.createElement('li');
    li.className = 'medal-item';
    const badge = document.createElement('span');
    badge.className = 'medal-pill';
    badge.dataset.tier = tier || 'none';
    badge.textContent = label || '未获';
    const info = document.createElement('div');
    info.className = 'medal-info';
    const title = document.createElement('strong');
    title.textContent = event.name;
    const sub = document.createElement('small');
    sub.textContent = `最佳 ${time === null ? '—' : timeLabel(time)} · 紫 ${timeLabel(authorMs)} / 金 ${timeLabel(goldMs)}`;
    info.append(title, sub);
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'action medal-go';
    go.textContent = '前往';
    go.disabled = !canJump;
    go.addEventListener('click', () => {
      if (ui.medalDialog?.open) ui.medalDialog.close();
      if (event.campus === getActiveCampus()) {
        selectCourse(event);
      } else {
        if (typeof pauseTrial === 'function' && (race.phase === 'race' || race.phase === 'count')) race.abandon();
        pendingCampus = { destination: event.campus, at: performance.now() + 30, targetCourseId: event.id };
        updateHud();
      }
      focusStage();
    });
    li.append(badge, info, go);
    return li;
  });
  listEl.replaceChildren(...nodes);
}

function renderMedalDialog() {
  if (!ui.medalDialog) return;
  const stats = courseMedalSummary();
  setText(ui.medalSummary, `完成 ${stats.cleared}/${stats.total} · 紫牌 ${stats.authorCount} · 金牌 ${stats.goldPlus - stats.authorCount} · 银牌 ${stats.silverPlus - stats.goldPlus} · 铜牌 ${stats.bronzePlus - stats.silverPlus}`);
  const ameOk = isPaintUnlocked('amethyst', stats);
  const obsOk = isPaintUnlocked('obsidian', stats);
  setText(ui.medalUnlocks, `限定车漆：紫水晶${ameOk ? '（已解锁）' : `（需 6 金+ 或 1 紫 · 当前 ${stats.goldPlus}/6）`} · 暗曜金${obsOk ? '（已解锁）' : '（需 1 枚紫牌）'}`);
  const canJump = !getOnlineRoom() && !pendingCampus && race.phase !== 'race' && race.phase !== 'count';
  renderMedalSection(ui.medalListSzu, stats.rows.szu, canJump);
  renderMedalSection(ui.medalListUcl, stats.rows.ucl, canJump);
  renderMedalSection(byId('medalListPark'),stats.rows.shunde,canJump);
}

function openMedalDialog() {
  if (!ui.medalDialog || settingsOpen || getOnlineRoom()) return;
  clearInput();
  renderMedalDialog();
  ui.medalDialog.showModal();
  ui.medalClose?.focus({ preventScroll: true });
}

function initMedalDialog() {
  ui.medalButton?.addEventListener('click', openMedalDialog);
  ui.medalClose?.addEventListener('click', () => { ui.medalDialog.close(); focusStage(); });
  ui.medalDialog?.addEventListener('close', () => { priorTimestamp = undefined; clearInput(); });
}

function updateElevationMap() {
  const stats=race.event.elevation;
  ui.elevationPanel.hidden=!stats||race.phase==='free'&&!zoomMap;
  if(ui.elevationPanel.hidden) return;
  setText(ui.elevationStats,'爬升 '+stats.gain.toFixed(1)+' m · 下降 '+stats.loss.toFixed(1)+' m');
  const canvas=ui.elevationChart,ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  const maxHeight=Math.max(...stats.profile.map(item=>item[1]),.1);
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle='#1e3026';ctx.fillRect(0,0,w,h);
  ctx.beginPath();ctx.moveTo(0,h-8);
  for(const [distance,elevation] of stats.profile)
    ctx.lineTo(distance/race.event.length*w,h-8-elevation/maxHeight*(h-17));
  ctx.lineTo(w,h-8);ctx.closePath();
  ctx.fillStyle='#6c8b50';ctx.fill();
  ctx.strokeStyle='#dce8b5';ctx.lineWidth=2;ctx.stroke();
  canvas.setAttribute('aria-label','从起点到终点的路线剖面。累计爬升 '+stats.gain.toFixed(1)+' 米，下降 '+stats.loss.toFixed(1)+' 米');
}

function canTravel() {
  return ready&&race.phase==='free'&&!race.paused&&!settingsOpen&&!pendingCampus&&!getOnlineRoom();
}

export function atTravelPoint() {
  const [x,,z]=race.rider.position,[sx,,sz]=campuses[getActiveCampus()].arrival;
  return Math.hypot(x-sx,z-sz)<=11;
}

export function arriveAtStation() {
  const {arrival,heading}=campuses[getActiveCampus()];
  clearInput();
  Object.assign(race.rider,{
    position:arrival.slice(),heading,paved:true,speed:0,steering:0,throttle:0,brake:0,
    yawRate:0,lean:0,slip:0,stationaryBrake:0,sprinting:false,sprintLocked:false
  });
  race.moved=true;
  race.accumulator=0;
  cameraRevision++;
  priorTimestamp=undefined;
  openMap(false);
  focusStage();
}

function requestTravel() {
  if(!canTravel()||ui.travelDialog.open) return;
  clearInput();
  if(!atTravelPoint()) { arriveAtStation();updateHud();return; }
  setText(ui.travelStation,campuses[getActiveCampus()].station);
  const choices=Object.entries(campuses).filter(([id])=>id!==getActiveCampus()).map(([id,site])=>{
    const button=document.createElement('button');
    button.type='button';button.className='action';button.dataset.destination=id;
    button.textContent=site.name+' · '+site.station;
    button.addEventListener('click',()=>{
      if(!canTravel()||!atTravelPoint()||!ui.travelDialog.open) return;
      ui.travelDialog.close();
      pendingCampus={destination:id,at:performance.now()+90};
      ui.notice.hidden=false;setText(ui.notice,'正在前往'+site.name+'…');updateHud();
    });
    return button;
  });
  ui.travelChoices.replaceChildren(...choices);
  ui.travelDialog.showModal();
}
function updateTravelButton() {
  ui.travel.hidden=race.phase!=='free';
  ui.travel.disabled=!canTravel();
  setText(ui.travel,atTravelPoint()?'选择目的地':'到'+campuses[getActiveCampus()].station);
}
function updateCampusLabels() {
  const info=campuses[getActiveCampus()];
  stage.dataset.campus=getActiveCampus();setText(ui.campusName,info.name);
  setText(ui.miniButton.querySelector('span'),getActiveCampus()==='shunde'?'顺峰山导览':getActiveCampus()==='ucl'?'街区小地图':'校园小地图');
  setText(ui.mapTitle,{szu:'校园俯视地图',ucl:'Bloomsbury 地图',shunde:'顺峰山公园导览图'}[getActiveCampus()]);
  ui.szuReferences.hidden=getActiveCampus()!=='szu';
  ui.uclReference.hidden=getActiveCampus()!=='ucl';
  canvas.setAttribute('aria-label',info.name+'三维骑行地图');
}

function initMapReplay() {
  ui.replayPlay.addEventListener('click',()=>{
    if(mapReplay.time>=Number(ui.replaySeek.max)) mapReplay.time=0;
    mapReplay.playing=!mapReplay.playing;
  });
  ui.replaySpeed.addEventListener('change',()=>{mapReplay.speed=Number(ui.replaySpeed.value);});
  ui.replaySeek.addEventListener('input',()=>{
    mapReplay.time=Number(ui.replaySeek.value);mapReplay.playing=false;
  });
}

function updateMapReplay(dt) {
  const run=race.lastRun, ref=run?.comparison??race.reference;
  ui.mapReplay.hidden=!mapOpen||race.phase!=='done'||!run?.samples?.length||!ref?.samples?.length;
  if(ui.mapReplay.hidden) {
    mapReplay.playing=false;
    mapReplay.lastDraw=null;
    return;
  }
  if(mapReplay.run!==run) {
    Object.assign(mapReplay,{run,time:0,playing:false,lastDraw:null});
    ui.replaySeek.max=Math.ceil(Math.max(run.time,ref.time));
  }
  advanceMapReplay(mapReplay,dt,Number(ui.replaySeek.max));
  ui.replaySeek.value=mapReplay.time;
  setText(ui.replayPlay,mapReplay.playing?'暂停':'播放');
  if(mapReplay.lastDraw===mapReplay.time) return;
  mapReplay.lastDraw=mapReplay.time;
  const a=replayAt(run,Math.min(mapReplay.time,run.time)), b=replayAt(ref,Math.min(mapReplay.time,ref.time));
  const gap=replayGapAt(run,ref,mapReplay.time);
  setText(ui.replayDetail,`速度差 ${((a.speed-b.speed)*3.6).toFixed(1)} km/h`+(gap===null?'':` · 秒差 ${signedSeconds(gap)}`));
  renderCampusMap(ui.bigMap,race,false,zoomMap);
}

function startSectorPractice(fromGate, toGate) {
  if (!ready || getOnlineRoom() || pendingCampus || race.event.campus !== getActiveCampus()) return;
  const gates = race.event.gates;
  if (fromGate < 0 || toGate <= fromGate || toGate >= gates.length) return;
  clearInput();
  if(race.startPractice(fromGate,toGate)===false) {
    openSettings('bike');
    highlightBudgetParts();
    return;
  }
  zoomMap = true;
  cameraRevision++;
  priorTimestamp = performance.now();
  openMap(false);
  focusStage();
  updateHud();
}

function renderMapStationExtras() {
  const canPractice = !getOnlineRoom() && race.phase !== 'race' && race.phase !== 'count';
  const showSplits = Boolean(race.lastRun?.splits?.length && race.splits.length);
  for (let i = 0; i < mapRows.length; i++) {
    const row = mapRows[i];
    row.querySelector('.map-sector-meta')?.remove();
    if (i === 0) continue;
    const meta = document.createElement('span');
    meta.className = 'map-sector-meta';
    if (showSplits && race.splits[i] !== undefined) {
      const sec = race.sector(i);
      if (sec) {
        const badge = document.createElement('span');
        badge.className = 'map-sector-delta';
        badge.dataset.gap = gapTone(sec.delta);
        badge.textContent = `${(sec.duration / 1000).toFixed(2)}s ${signedSeconds(sec.delta)}`;
        meta.append(badge);
      }
    }
    if (canPractice) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'practice-btn';
      btn.textContent = '单练';
      btn.addEventListener('click', () => startSectorPractice(i - 1, i));
      meta.append(btn);
    }
    if (meta.childNodes.length) row.append(meta);
  }
}

function exitSectorPractice() {
  if (!race.practice) return;
  clearInput();
  race.practice = null;
  race.freeRide();
  rebuildCourseHud();
  updateHud();
  focusStage();
}

bindSaveUi({
  getOnlineRoom,
  isOnlineAppMode: getOnlineAppMode,
  readPreferences,
  fillPreferences,
  applyTouchSize,
  showBikeSetup,
  rebuildCourseHud,
  updateHud,
  setText,
});

bindOnlineApp({
  setText,
  clearInput,
  focusStage,
  openSettings,
  closeSettings,
  isSettingsOpen: () => settingsOpen,
  getPriorTimestamp: () => priorTimestamp,
  setPriorTimestamp: v => { priorTimestamp = v; },
  isReady: () => ready,
  populateCoursePicker,
  selectCourse,
  beginTrial,
  rebuildCourseHud,
  updateHud,
  highlightBudgetParts,
  timeLabel,
});

worldState.hooks.selectCourse = (event, opponent = null, extraOpponents = []) => selectCourse(event, opponent, extraOpponents);
worldState.hooks.pauseTrial = pauseTrial;
worldState.hooks.updateHud = updateHud;
worldState.hooks.focusStage = focusStage;
worldState.hooks.refreshBicycleModels = () => refreshBicycleModels?.();
worldState.hooks.setPendingCampus = v => { pendingCampus = v; };
worldState.hooks.getPendingCampus = () => pendingCampus;

export function getAppBridge() {
  return {
    PREF_KEY,
    race,
    ui,
    preferences,
    driverProfile,
    vehicleTunings,
    touches,
    canvas,
    stage,
    beginTrial,
    updateHud,
    openSettings,
    closeSettings,
    openMap,
    updateMapReplay,
    updateDrive,
    atTravelPoint,
    arriveAtStation,
    applyTouchSize,
    applyHudScale,
    rebuildCourseHud,
    showBikeSetup,
    refreshBicycleModels: () => refreshBicycleModels?.(),
    selectCourse,
    pauseTrial,
    startTrial,
    enterFreeRide,
    recoverTrial,
    initHud,
    setReady: v => { ready = Boolean(v); },
    isReady: () => ready,
    getPendingCampus: () => pendingCampus,
    setPendingCampus: v => { pendingCampus = v; },
    getCameraRevision: () => cameraRevision,
    setCameraRevision: v => { cameraRevision = v; },
    getZoomMap: () => zoomMap,
    setZoomMap: v => { zoomMap = Boolean(v); },
    getUclRouteVisible: () => uclRouteVisible,
    setUclRouteVisible: v => { uclRouteVisible = Boolean(v); worldState.uclRouteVisible = uclRouteVisible; },
    getSettingsOpen: () => settingsOpen,
    setSettingsOpen: v => { settingsOpen = Boolean(v); },
    getMapOpen: () => mapOpen,
    setMapOpen: v => { mapOpen = Boolean(v); },
  };
}

export { run };
