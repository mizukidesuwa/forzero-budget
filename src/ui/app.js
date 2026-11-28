import { neutralDrive } from '../core/clock.js';
import { add, clamp, length, multiply, normalize, placement, scale, subtract, transform } from '../core/math.js';
import { Shape } from '../core/shape.js';
import { getActiveCampus, getStorage, setActiveCampus, setPreferences, worldState } from '../core/state.js';
import { CampusCourier, makeCourierBeaconShape, nearestCourierLandmark } from '../race/courier.js';
import { ShadowChase } from '../race/chase.js';
import { BlindNav } from '../race/blind-nav.js';
import { knownLaunchMode } from '../data/modes.js';
import { raceLaunchOptions } from '../race/launch-options.js';
import { raceReviewRows } from '../race/race-review.js';
import { liveDeltaMs, vehicleBenchmark } from '../race/records.js';
import { aiRank } from '../race/rivals.js';
import { TimeTrial } from '../race/time-trial.js';
import { currentWeather, drawRainOverlay, getActiveWeatherId, knownWeather, setActiveWeather } from '../render/atmosphere.js';
import { rideCamera } from '../render/ride-camera.js';
import { courseDecor, disposeRidingScene, uploadRidingScene } from '../render/scene-upload.js';
import { renderer } from '../render/webgl-renderer.js';
import { loadFriendGhost, replayAt } from '../replay/ghost.js';
import { advanceMapReplay, mapReplay, replayGapAt } from '../replay/map-replay.js';
import { soloBudget } from '../ride/budget.js';
import {
  FRONT, REAR, TYRE_RADIUS, bicycleRigCache, bicycleRock, movingParts,
  movingPoweredSkinArms, poweredPose, riderSkinBodyCache, uploadPoweredRig,
} from '../ride/models.js';
import { tuning190 } from '../ride/tuning-rules.js';
import {
  DEFAULT_RIDER_NAME, bicycleAppearance, chairCheerClock, knownVehicle,
  readDriverProfile, savedBike, savedVehicleTunings, stockBike, vehicleChoices,
} from '../ride/vehicles.js';
import { knownWindMode, rainPuddleShape, windEffectLabel } from '../world/environment.js';
import { clearWorldShapes, plannedSpeed, sceneLists } from '../world/geometry.js';
import {
  bridgeAxis, mountainRoadAt, mountainUp, parkBridgeSide, parkPaved, parkPavilionDeck,
  shundeShortcutAt,
} from '../world/maps/shunde.js';
import { activeStage, cityStreetAt, inCampus } from '../world/maps/szu.js';
import { uclStreetAt, uclWayByPath } from '../world/maps/ucl.js';
import { courseGround, rideElevation, riderGrade } from '../world/query.js';
import { buildRidingScene, courseByCampus, courses, coursesByCampus } from '../world/scene-builder.js';
import { availableCourses } from '../world/seed-courses.js';
import { knownTraffic, raceTrafficTime, trialTraffic } from '../world/traffic.js';
import { prepareTraffic } from '../render/traffic.js';
import {
  bindOnlineApp, findOnlineCourse, getOnlineAppMode, getOnlineChaseSnapshot, getOnlineChaseView, getOnlineRoom, initOnline,
  onlineRaceRank, onlineRiderPoses, renderOnline, tickOnline,
} from '../online/client.js';
import { draftRenderSpan } from '../ride/drafting.js';
import { interfaceScale, knownCameraView, knownHudScale, knownTouchSize } from '../data/interface.js';
import { skinForProfile, skinAllowedOnVehicle } from '../ride/rider-skin.js';
import { installRaceOptions, updateRaceOptions } from './race-options.js';
import { getBlindHud, getChaseHud, getCourierHud, getOnlineChaseHud } from './mode-hud.js';
import { describeCheckpoint, describeRaceCallout, describeRaceNavigation } from './race-hud.js';
import { createSceneHud } from './scene-hud.js';
import { createSeedDialogController } from './seed-dialog.js';
import { createMapControls } from './map-controls.js';
import { createFriendDuelController } from './friend-duel.js';
import { createMedalTravelController } from './medal-travel.js';
import { createWorkshopController } from './workshop-ui.js';
import { createSettingsController } from './settings-dialog.js';
import { initCustomSounds, playCustomSound, updateRideAudio } from './audio.js';
import { getShowMapComparison, renderCampusMap, setShowMapComparison } from './minimap.js';
import { applyPendingSaveVehicle, bindSaveUi } from './save-sync.js';
import { createDrivingHud, observeStageControls, showCameraMode } from './hud-controls.js';
import {
  checkpointLabel, courseDescription, courseTitle, initLanguage, message,
  setLanguageAttribute, setLabel as setText, setText as setRawText, translate,
} from './language.js';
import { deltaLabel, feedbackLabel, gapTone, ghostLabel, signedSeconds } from './presentation-text.js';

export function timeLabel(ms) {
  const centiseconds = Math.max(0,Math.floor(ms/10 + 1e-8));
  const part = (n) => String(n).padStart(2,'0');
  return part(Math.floor(centiseconds/6000)) + ':' + part(Math.floor(centiseconds/100) % 60) + '.' + part(centiseconds % 100);
}

const byId = id => document.getElementById(id);
const stage = byId('stage');
const canvas = byId('world');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const touchDriving = matchMedia('(pointer: coarse)');

export const PREF_KEY='szu-litchi-display-1';
const defaultPreferences={resolution:'auto',aa:'auto',ghost:true,brakeLine:true,weather:'day',sound:true,collision:false,traffic:'sparse',touchSize:interfaceScale.normal,hudScale:'auto',cameraView:'third',windSpeed:0,windDir:0,fps:true};

function readPreferences() {
  try {
    const saved=JSON.parse(getStorage()?.getItem(PREF_KEY));
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
      cameraView:knownCameraView(saved.cameraView),
      windSpeed:Number.isFinite(Number(saved.windSpeed))?Math.round(clamp(Number(saved.windSpeed),0,15)*10)/10:0,
      windDir:Number.isInteger(Number(saved.windDir))?clamp(Number(saved.windDir),0,7):0,
      fps:typeof saved.fps==='boolean'?saved.fps:true
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
  'sceneHud','intro','timing','timedTitle','progressLabel','checkpointCount','dots','clock','velocity','surfaceType','roadName','courseFacts',
  'mapScreen','mapToggle','mapText','miniButton','bigMap','miniMap','stationList','mapClock','mapNext','mapLegend',
  'mapRouteBuild','routeBuilderPanel','routeBuilderStatus','routeBuildUndo','routeBuildLoop','routeBuildClear','routeBuildApply','routeBuildCopy','routeBuilderCode',
  'riderTag','chairCheer','sprintKeys','gateTag','next','routeWarning','callout','callTitle','callValue','callDetail','callAction',
  'ghostName','splitGap','goldGoal','sprintFill','sprintMeter','sprintHint','sprintValue','gripMeter','gripFill','gripValue',
  'sectorFeedback','sectorLabel','sectorGap','exitFeedback','raceReview','reviewReference',
  'slopeGrade','elevationPanel','elevationStats','elevationChart',
  'sectorRows','cornerReview','reviewCornerName','reviewCornerDetail','reviewCornerSpeed',
  'reviewFeedback','reviewFeedbackText',
  'friendButton','friendDialog','friendFile','friendDrop','friendStatus','friendClose','friendReady','friendExport','friendTag',
  'onlineButton','onlineDialog','onlineSetup','onlineLobby','onlineFormat','onlineVehicleRule','onlineWeather','onlineCreate','onlineHostInput','onlineJoinForm','onlineCodeInput',
  'onlineJoin','onlineClose','onlineLeave','onlineTitle','onlineCode','onlinePlayers','onlineStanding','onlineRounds',
  'onlineHostControls','onlineLobbyCampus','onlineLobbyCourse','onlineLobbySeed','onlineLobbyVehicle','onlineLobbyWeather','onlineLobbyTuning','onlineLobbyCollision','onlineTuningBanner','onlineGarage',
  'onlineTuningTime','onlineCollision','settingsTuneBar','settingsTuneText','settingsTuneReady','settingsTuneSkip',
  'onlineInvite','onlineReady','onlineStart','onlineStatus','onlineLatency','onlineRank','onlineBike','onlineHostHint',
  'onlineTag0','onlineTag1','onlineTag2','draftPill','weatherOverlay','settingsWeather','settingsWindSpeed','settingsWindDir','onlineWindSpeed','onlineWindDir','onlineLobbyWindSpeed','onlineLobbyWindDir','mapCompare','reviewMapButton','practiceExit',
  'onlineBudget','onlineBlind','onlineWindMode','onlineLobbyBudget','onlineLobbyBlind','onlineLobbyWindMode','budgetPicker','budgetReadout','budgetHighlight','budgetNotice','soloRulesStatus','raceMode','aiOptions','aiDifficulty','aiWins','courseVariants','courseDirection','courseLaps','mapReplay','replayPlay','replaySpeed','replaySeek','replayDetail','settingsWindMode','puddleStatus','bikePresets','bikePresetName','bikeSprintSpeed','bikeGravel','bikeStyles','bikeAbility','bikePosture',
  'bikeFrame','frameNote','bikeSprint','sprintNote','motorTuning','vehSlots',
  'vehTopSpeed','vehGravel','vehGrass','vehAbility','saveExport','saveImport','saveFile','saveStatus',
  'liveDelta','windPill','activityHud','activityTitle','activityDetail','courierTag','courierButton',
  'blindHint','touchBell',
  'medalButton','medalDialog','medalClose','medalSummary','medalUnlocks','medalListSzu','medalListUcl',
  'settingsSound','settingsCollision','settingsTraffic','settingsTouchSize','settingsTouchSizeValue','settingsHudScale','settingsHudScaleValue','settingsHudAuto','settingsGuideBtn','guideSettings','onlineTraffic','onlineLobbyTraffic','friendMultiBar','friendMultiCount','friendMultiPlay',
  'friendFilters','friendCampus','gateFlash','friendCourse','friendVehicle','friendBoardNote','friendScores','friendScoreTemplate',
  'seedButton','seedDialog','seedForm','seedInput','seedCampus','seedStatus','seedRandom','seedClose',
  'weeklyCode','weeklyPlay','weeklyCopy','weeklyBoard','coursePicker','courseBrief','mapZoom','mapPlace','mapCourse','recover','brakeHint','hospitalRoute',
  'settingsButton','settingsDialog','settingsTitle','settingsContinue','settingsState','settingsExit','settingsUnfullscreen',
  'bikeButton','bikeSettings','displaySettings','driverName','bikeLock','vehiclePicker','vehicleNote',
  'bikeParts','bikePaint','riderSkin','riderSkinFile','riderSkinFileInput','riderSkinImport','riderSkinPrompt','riderSkinClear','riderSkinImportButton','riderSkinStatus','bikeTyres','bikeGears','tyreNote','gearNote','bikeBrakes','brakeNote',
  'bikeTopSpeed','bikeGrip','bikeAcceleration','bikeGrass','bikeBrakePower','bikeBrakeGrip',
  'settingsResolution','settingsAA','settingsGhost','settingsBrakeLine','settingsFps','settingsStatus','settingsLanguage',
  'startTrial','freeRide','pause','best','expand','cameraToggle','cameraModeTag','notice','travel','travelDialog','travelStation','travelChoices','travelClose','campusName','mapTitle','szuReferences','uclReference','fpsCounter'
].map(name => [name,byId(name)]));
const updateDrivingHud = createDrivingHud(stage, ui);
const sceneHud = createSceneHud(ui);
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
let previousPhase = null, previousPaused = null, previousGate = -1, previousLaunchMode = null, previousChasePhase = null;
let previousOnlineChasing = false;
let fpsTime = 0, fpsFrames = 0;

function updateFps(now) {
  if (!ui.fpsCounter) return;
  if (!preferences.fps) {
    ui.fpsCounter.hidden = true;
    fpsTime = now;
    fpsFrames = 0;
    return;
  }
  ui.fpsCounter.hidden = false;
  if (!fpsTime) fpsTime = now;
  fpsFrames++;
  if (now - fpsTime >= 500) {
    const fps = Math.round(fpsFrames * 1000 / (now - fpsTime));
    setText(ui.fpsCounter, 'FPS ' + fps);
    fpsTime = now;
    fpsFrames = 0;
  }
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
    group.label=translate('伦敦特别赛事');
    ui.coursePicker.appendChild(group);
  }
  for(const event of availableCourses(getActiveCampus())) {
    const option=document.createElement('option');
    option.value=event.id;option.textContent=courseTitle(event);
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
  setRawText(ui.courseBrief,courseDescription(event));
  const distance=event.stages?message`${(event.length/1000).toFixed(2)} 公里`:message`${Math.round(event.length)} 游戏米`;
  setRawText(ui.courseFacts,courseTitle(event)+' · '+distance);
  updateElevationMap();
  const goldTime=timeLabel(race.medalTimes.gold);
  setRawText(ui.goldGoal,event.stages?message`${count} 个赛段 · 金牌 ${goldTime}`:message`${count} 个检查点 · 金牌 ${goldTime}`);
  setText(ui.progressLabel,event.stages?'赛段':'检查点');
  setText(ui.mapCourse,race.phase==='free'?'校内外道路':courseTitle(event));
  ui.stationList.replaceChildren();ui.dots.replaceChildren();
  mapRows.length=0;dotLights.length=0;
  for(let i=0;i<count;i++) {
    const tick=document.createElement('i');
    dotLights.push(tick);ui.dots.appendChild(tick);
  }
  for(const gate of gates) {
    const row=document.createElement('li'),badge=document.createElement('i'),label=document.createElement('span');
    badge.textContent=translate(gate.number);label.textContent=checkpointLabel(gate.name);
    row.append(badge,label);mapRows.push(row);ui.stationList.appendChild(row);
  }
  previousPhase=null;previousGate=-1;
  if (typeof renderMapStationExtras === 'function') renderMapStationExtras();
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
    setRawText(ui.brakeHint, message`${translate(action)} · 建议 ${Math.round(advised * 3.6)} km/h`);
  }

  const stageIndex=track.stages?.findIndex(stage=>race.nextGate<=stage.finishGate);
  const completed=track.stages?.[stageIndex<0?track.stages.length-1:stageIndex-1];
  const sector=track.stages?(completed?race.stageSector(completed):null):race.sector(race.splits.length-1);
  ui.sectorFeedback.hidden = !sector || race.splits.length < 2;
  if (!ui.sectorFeedback.hidden) {
    setRawText(ui.sectorLabel, checkpointLabel(sector.name));
    setRawText(ui.sectorGap, message`${signedSeconds(sector.delta)} 秒`);
    ui.sectorGap.dataset.gap = gapTone(sector.delta);
  }

  const exit = race.lastCorner;
  ui.exitFeedback.hidden = !running || !exit || race.elapsed - exit.at > 2550;
  if (!ui.exitFeedback.hidden) {
    const target = race.reference.corners[exit.index];
    const delta = target ? Math.round((exit.speed - target.speed) * 3.6) : 0;
    const compare = delta === 0 ? '' : ' · ' + (delta > 0 ? '+' : '−') + Math.abs(delta);
    setRawText(ui.exitFeedback, message`出弯 ${Math.round(exit.speed * 3.6)} km/h${compare}`);
  }
}

function populateRaceReview() {
  setRawText(ui.reviewReference, message`对比${ghostLabel(race.reference)}`);
  const rows = raceReviewRows(race).map(({ sector, fromGate, toGate }) => {
    const row = document.createElement('tr');
    const name = document.createElement('th');
    const time = document.createElement('td');
    const gap = document.createElement('td');
    const act = document.createElement('td');
    name.setAttribute('scope', 'row');
    name.textContent = checkpointLabel(sector.name);
    time.textContent = (sector.duration / 1000).toFixed(2);
    gap.textContent = signedSeconds(sector.delta);
    gap.dataset.gap = gapTone(sector.delta);
    if (!getOnlineRoom() && toGate < race.event.gates.length) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'practice-btn';
      btn.textContent = translate('单练');
      btn.addEventListener('click', () => startSectorPractice(fromGate, toGate));
      act.append(btn);
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
  if (focus) {
    const title = message`${translate(biggestLoss ? '失时最多' : '最慢出弯')} · 第 ${focus.corner.index + 1} 弯`;
    const comparison = focus.target ? message` · 影子 ${Math.round(focus.target.speed * 3.6)} km/h` : '';
    const speeds = message`出弯 ${Math.round(focus.speed * 3.6)} km/h${comparison}`;
    setText(ui.reviewCornerName, title);
    const loss = biggestLoss ? message` · 慢 ${(focus.delta / 1000).toFixed(2)} 秒` : '';
    setRawText(ui.reviewCornerDetail, message`通往${checkpointLabel(focus.corner.station)}${loss}`);
    setText(ui.reviewCornerSpeed, speeds);
  }
  const highlights = race.lastRun?.feedback?.highlights ?? [];
  ui.reviewFeedback.hidden = !highlights.length;
  setRawText(ui.reviewFeedbackText, highlights.map(feedbackLabel).join(' · '));
}

export function updateHud() {
  applyPendingSaveVehicle();
  updateTravelButton();
  const now = performance.now();
  const campus = getActiveCampus();
  const online = Boolean(getOnlineRoom());
  if (online && (ShadowChase.active || BlindNav.active)) {
    ShadowChase.stop();
    BlindNav.leave(setActiveWeather);
    BlindNav.setEnabled(false);
  }
  const chasing = !online && ShadowChase.active;
  const onlineChaseView = online ? getOnlineChaseView(now) : null;
  const onlineChasing = Boolean(onlineChaseView?.snap?.active);
  const trial = race.phase !== 'free' || chasing;
  const timed = trial && !chasing && !onlineChasing;
  const freeRiding = !trial && !onlineChasing;
  const enteringFinish = previousPhase !== 'done';
  const chaseHud = chasing ? getChaseHud(ShadowChase, timeLabel, race.paused) : getOnlineChaseHud(onlineChaseView, timeLabel);
  const activity = chaseHud?.activity ?? (!online && freeRiding ? getCourierHud(CampusCourier, race.rider, campus, now) : null);
  const event=race.event,gates=event.gates,checkpointCount=gates.length-2;
  const leg=trial?activeStage(event,race.nextGate):null;
  setRawText(ui.riderTag,driverProfile.name);
  const opponent=race.opponent;
  const cyan = trial ? message`，青色是${opponent ? ghostLabel(opponent) : translate('影子')}` : '';
  setRawText(ui.mapLegend,message`橙色是${driverProfile.name}${cyan}`);
  ui.friendReady.hidden=trial||!opponent;
  if (!ui.friendReady.hidden) {
    const totalGhosts = 1 + (race.extraOpponents?.length ?? 0);
    const label = ghostLabel(opponent);
    setRawText(ui.friendReady,(totalGhosts>1?message`${label} 等 ${totalGhosts} 条影子`:label)+' · '+timeLabel(opponent.time)+' · '+
      translate(vehicleChoices[opponent.vehicle].name)+' · '+courseTitle(event));
  }
  ui.friendExport.hidden=!timed||race.phase!=='done'||!race.lastRun||race.lastRun.unranked||Boolean(race.practice);
  ui.reviewMapButton.hidden=!timed||race.phase!=='done'||!race.lastRun||Boolean(race.practice);
  ui.practiceExit.hidden=chasing||onlineChasing||!race.practice;
  const launchMode = knownLaunchMode(ui.raceMode?.value);
  ui.seedButton.hidden=getActiveCampus()==='shunde';
  ui.onlineButton.disabled=!online&&(pendingCampus||race.phase==='race'||race.phase==='count'||ShadowChase.isRunning());
  setText(ui.onlineButton,online?'房间':'联机');
  ui.friendButton.disabled=ui.seedButton.disabled=ui.coursePicker.disabled=ui.medalButton.disabled=online||race.phase==='race'||race.phase==='count'||ShadowChase.isRunning();
  if(ui.courierButton) {
    ui.courierButton.hidden=online||trial;
    ui.courierButton.setAttribute('aria-pressed',String(CampusCourier.active));
  }
  ui.raceMode.disabled=online||trial||Boolean(race.opponent);
  updateRaceOptions(ui, race, online||trial||Boolean(pendingCampus));
  if(!online&&!trial) {
    const {over,illegal}=soloBudget(race);
    ui.soloRulesStatus.hidden=!over&&!illegal;
    setText(ui.soloRulesStatus,over?message`超预算 ¥${over} · 到车库调整`:illegal?'娱乐改装 · 本场不计榜':'');
  } else ui.soloRulesStatus.hidden=true;
  ui.startTrial.disabled=ui.freeRide.disabled=online;
  ui.freeRide.hidden=!trial||online;
  if(trial&&!online) {
    const fin=chasing ? !ShadowChase.isRunning() : race.phase==='done';
    setText(ui.freeRide,fin?'返回自由骑行':(chasing?'退出追捕':'退出比赛'));
    setLanguageAttribute(ui.freeRide,'title',translate(fin?'结束本场并返回自由骑行':(chasing?'退出当前追捕并返回自由骑行':'退出当前比赛并返回自由骑行')));
  }
  ui.pause.disabled=online||race.phase==='done'||(chasing&&!ShadowChase.isRunning());
  const liveRank=timed&&race.phase==='race'?(online?onlineRaceRank(now):aiRank(race)):null;
  ui.onlineRank.hidden=!liveRank;
  if (liveRank) {
    const gap = liveRank.gapMeters ? message` · 落后 ${liveRank.gapMeters} 米` : liveRank.rank===1 ? translate(' · 领跑') : '';
    setRawText(ui.onlineRank,message`第 ${liveRank.rank} / ${liveRank.total} 名`+gap);
  }
  if (previousPhase !== race.phase || previousPaused !== race.paused || previousChasePhase !== ShadowChase.phase || previousLaunchMode !== launchMode || onlineChasing !== previousOnlineChasing) {
    stage.dataset.phase = chasing ? (ShadowChase.isRunning() ? 'race' : 'done') : onlineChasing ? 'race' : race.phase;
    ui.intro.hidden = !freeRiding || race.moved || Boolean(activity);
    ui.stationList.hidden = !timed && !mapOpen;
    if (mapOpen) renderMapStationExtras();
    setText(ui.mapCourse,trial ? courseTitle(event) : '校内外道路');

    updateMapZoom();
    ui.freeRide.setAttribute('aria-pressed', String(!trial));
    setText(ui.startTrial,chasing?(ShadowChase.isRunning()?'重新追捕':'再追一次'):race.phase==='done'?'再跑一次':trial?'重新开始':launchMode==='chase'?'开始追捕':launchMode==='blind'?'开始夜骑盲区':opponent?'开始对战':event.stages?'开始耐力赛':'开始计时赛');
    setText(ui.pause,race.paused ? '继续' : '暂停');
    ui.pause.setAttribute('aria-pressed',String(race.paused));
    previousPhase = race.phase;
    previousPaused = race.paused;
    previousChasePhase = ShadowChase.phase;
    previousLaunchMode = launchMode;
    previousOnlineChasing = onlineChasing;
  }
  if (freeRiding && (race.moved || activity)) ui.intro.hidden = true;
  if (previousGate !== race.nextGate) {
    if (BlindNav.active && race.phase === 'race') BlindNav.clearBellPulse();
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
  const { rider } = race;
  const [x,,z] = rider.position;
  const gradeAt = worldState.hooks.riderGrade ?? race.worldQuery?.riderGrade ?? riderGrade;
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
      else roadLoc=(typeof nearestCourierLandmark==='function'?nearestCourierLandmark('shunde',x,z,42):null)??(parkPaved(x,z,-2)?'青云湖环线':'顺峰山公园');
    }
  } else if(!roadLoc) {
    const near=typeof nearestCourierLandmark==='function'?nearestCourierLandmark(getActiveCampus(),x,z,38):null;
    roadLoc=near??(getActiveCampus()==='szu'&&race.rider.paved?'深大校内道路':null);
  }
  const surface = onPavilionWalk ? 'plank' : rider.paved ? 'paved' : rider.surfaceKind === 'gravel' ? 'gravel' : 'grass';
  updateDrivingHud(rider, {
    grade: gradeAt(rider.position, rider.heading),
    surface, roadName: roadLoc, wind: windEffectLabel(race, translate),
  });
  updateCoach();
  const clock = timeLabel(race.elapsed);
  setText(ui.clock,clock);
  setText(ui.mapClock,trial ? clock : '');
  setText(ui.best,race.best === null ? '—' : timeLabel(race.best));
  const lastGap=race.lastGap;
  setRawText(ui.ghostName,ghostLabel(race.reference));
  setText(ui.splitGap,lastGap===null?'等待分段':message`总差 ${deltaLabel(lastGap)}`);
  ui.splitGap.dataset.gap = gapTone(lastGap);
  if(ui.liveDelta) {
    const ld=trial&&race.phase==='race'?liveDeltaMs(race):null;
    ui.liveDelta.hidden=ld===null;
    if(ld!==null) {
      setRawText(ui.liveDelta,message`实时 ${deltaLabel(ld)}`);
      ui.liveDelta.dataset.gap=gapTone(ld);
    }
  }
  const routeProgress=leg&&race.phase==='race'?race.progressEstimate:0;
  const remaining=race.phase==='done'?0:Math.max(0,event.length-routeProgress);
  const remainingLabel=remaining>=1000?message`${(remaining/1000).toFixed(2)} 公里`:message`${Math.ceil(remaining)} 米`;
  const timedName=race.practice?message`区间单练 · ${checkpointLabel(race.practice.name)}`:
    translate(online?'联机竞速':opponent?'友人对战':london?(leg?'伦敦耐力赛':'伦敦特别赛'):(leg?'耐力赛':'计时赛'));
  setRawText(ui.timedTitle,leg&&race.onGuide?message`${timedName} · 余 ${remainingLabel}`:timedName);
  const touch = touchDriving.matches;
  const navigation = describeRaceNavigation(race, { timed, freeRiding, now, touch });
  if (navigation.mapHint) setRawText(ui.mapNext, navigation.mapHint);
  else setText(ui.mapNext, race.phase === 'done' ? '完赛' : streetName ??
    (campus === 'shunde' ? '旅行站位于牌坊广场' : london ? '旅行站位于 Gower Street 校门旁' : '沿校门可接入校外公路'));
  let blindNote = '';
  if (timed && race.phase === 'done' && race.blindRun) {
    if (!race.blindResult) {
      race.blindResult = BlindNav.recordClear(race.event, race.rider.vehicle, race.elapsed, Boolean(soloBudget(race).illegal || race.rivals?.length));
    }
    const record = race.blindResult?.isBest ? translate('刷新盲区最佳') :
      race.blindResult?.bestMs ? message`盲区最佳 ${timeLabel(race.blindResult.bestMs)}` : '';
    blindNote = [translate('夜骑盲区完赛'), record].filter(Boolean).join(' · ');
  }
  const callout = chaseHud ? chaseHud.callout : describeRaceCallout(race, { clock, online, blindNote, timeLabel, friendResult });
  if (callout?.review && (enteringFinish || ui.raceReview.hidden)) populateRaceReview();
  sceneHud.render({
    panel: timed ? { mode: 'timed' } : activity,
    route: navigation.route, warning: chaseHud?.warning || navigation.warning,
    ...describeCheckpoint(race, timed && !mapOpen),
    blind: getBlindHud(BlindNav, now, online, touch), callout,
  });
}

const mapControls = createMapControls({
  ui,
  race,
  focusStage: () => stage.focus({ preventScroll: true }),
  populateCoursePicker,
  selectCourse,
  updateElevationMap,
  renderMapStationExtras: () => renderMapStationExtras(),
  getMapOpen: () => mapOpen,
  setMapOpen: v => { mapOpen = Boolean(v); sceneHud.setMapOpen(mapOpen); },
  getZoomMap: () => zoomMap,
  setZoomMap: v => { zoomMap = Boolean(v); },
  getUclRouteVisible: () => uclRouteVisible,
  getReady: () => ready,
  getOnlineChaseOverlay: () => {
    const view = getOnlineChaseView(performance.now());
    return view?.snap?.active ? { hideCourse: true, chasePings: view.radarPings } : null;
  },
});

const { updateMapZoom, openMap, updateMapPlace, handleMapClick, initRouteBuilderControls } = mapControls;

function focusStage() { stage.focus({preventScroll:true}); }

function beginOnlineChaseRound() {
  if (typeof CampusCourier !== 'undefined') CampusCourier.stop(false);
  ShadowChase.stop();
  BlindNav.leave(setActiveWeather);
  BlindNav.setEnabled(false);
  clearInput();
  race.freeRide();
  const startGate = race.event.gates[0];
  if (startGate) {
    race.rider.position = courseGround(race.event, startGate.p, startGate.rise ?? 0);
    race.rider.heading = Math.atan2(startGate.f[2], startGate.f[0]);
    race.rider.speed = 0;
  }
  race.moved = true;
  refreshBicycleModels();
  zoomMap = false;
  cameraRevision++;
  priorTimestamp = performance.now();
  openMap(false);
  focusStage();
  updateHud();
}

function startTrial() {
  if (!ready||getOnlineRoom()||pendingCampus||race.event.campus!==getActiveCampus()) return;
  if (race.practice) { startSectorPractice(race.practice.fromGate, race.practice.toGate); return; }
  beginTrial({ mode: ui.raceMode?.value, difficulty: ui.aiDifficulty?.value });
}

export function beginTrial(selection = { mode: ui.raceMode?.value, difficulty: ui.aiDifficulty?.value }) {
  if (typeof CampusCourier !== 'undefined') CampusCourier.stop(false);
  ShadowChase.stop();
  BlindNav.leave(setActiveWeather);
  BlindNav.setEnabled(false);
  applyPendingSaveVehicle({ restarting: true });
  clearInput();
  const { launchMode, raceMode, aiDifficulty } = raceLaunchOptions(selection);
  race.raceMode = raceMode;
  race.aiDifficulty = aiDifficulty;
  if(race.start()===false) {
    openSettings('bike');
    workshop.highlightBudgetParts();
    return;
  }
  if (launchMode === 'chase') {
    const illegal = Boolean(race.unranked);
    const targetVehicle = race.opponent?.vehicle ?? race.entryVehicle;
    const reference = race.opponent ?? vehicleBenchmark(race.event, targetVehicle).run;
    const runnerProfile = race.opponent
      ? { ...race.opponent, vehicle: targetVehicle }
      : { name: '逃跑影子', vehicle: targetVehicle };
    race.freeRide();
    race.moved = true;
    ShadowChase.start({
      event: race.event,
      vehicle: targetVehicle,
      difficulty: aiDifficulty,
      reference,
      runnerProfile,
      unranked: illegal,
      campus: getActiveCampus(),
      landmarkAt: nearestCourierLandmark,
    });
  } else if (launchMode === 'blind' && !getOnlineRoom()) {
    BlindNav.setEnabled(true);
    BlindNav.enter(getActiveWeatherId(), setActiveWeather);
    race.blindRun = BlindNav.active;
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
  ShadowChase.stop();
  BlindNav.leave(setActiveWeather);
  BlindNav.setEnabled(false);
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
  if (!ready||getOnlineRoom()||pendingCampus||race.phase==='done'||(ShadowChase.active&&!ShadowChase.isRunning())) return;
  race.paused = !race.paused;
  clearInput();
  priorTimestamp = performance.now();
  if (!race.paused) focusStage();
  updateHud();
}

function recoverTrial() {
  if (!ready) return;
  if (ShadowChase.active && !getOnlineRoom()) {
    if (!ShadowChase.rejoin(race.rider, null, playCustomSound)) return;
  } else if (!race.rejoin()) {
    return;
  }
  if(settingsOpen) closeSettings();
  clearInput();cameraRevision++;priorTimestamp=performance.now();focusStage();updateHud();
}

const seedAvailable=()=>ready&&!getOnlineRoom()&&!pendingCampus&&!settingsOpen&&!['race','count'].includes(race.phase);
const { initSeedDialog } = createSeedDialogController({
  ui,
  race,
  clearInput,
  focusStage,
  populateCoursePicker,
  selectCourse,
  isSeedAvailable: seedAvailable,
  setPriorTimestamp: v => { priorTimestamp = v; },
});

const friendDuel = createFriendDuelController({
  ui,
  race,
  driverProfile,
  timeLabel,
  clearInput,
  focusStage,
  populateCoursePicker,
  selectCourse,
  openMap,
  isSeedAvailable: seedAvailable,
  getSettingsOpen: () => settingsOpen,
  setPriorTimestamp: v => { priorTimestamp = v; },
  setPendingCampus: v => { pendingCampus = v; },
  setZoomMap: v => { zoomMap = Boolean(v); },
});
const { openFriendDialog, activateFriendChallenge, friendImportFailed, friendResult, updateFriendFilters, initFriendDuel } = friendDuel;

const workshop = createWorkshopController({
  ui,
  race,
  preferences,
  driverProfile,
  vehicleTunings,
  refreshBicycleModels: () => refreshBicycleModels?.(),
  updateHud,
  savePreferences: () => settings.savePreferences(),
});

const settings = createSettingsController({
  ui,
  race,
  stage,
  preferences,
  prefKey: PREF_KEY,
  driverProfile,
  getReady: () => ready,
  getPendingCampus: () => pendingCampus,
  getSettingsOpen: () => settingsOpen,
  setSettingsOpen: v => { settingsOpen = Boolean(v); },
  setPriorTimestamp: v => { priorTimestamp = v; },
  bumpCameraRevision: () => { cameraRevision++; },
  bumpGraphicsRevision: () => { graphicsRevision++; },
  clearInput,
  focusStage,
  openMap,
  rebuildCourseHud,
  updateHud,
  refreshBicycleModels: () => refreshBicycleModels?.(),
  workshop,
});

const medalTravel = createMedalTravelController({
  ui,
  race,
  stage,
  canvas,
  timeLabel,
  clearInput,
  focusStage,
  selectCourse,
  openMap,
  updateHud,
  getReady: () => ready,
  getSettingsOpen: () => settingsOpen,
  getPendingCampus: () => pendingCampus,
  setPendingCampus: v => { pendingCampus = v; },
  setPriorTimestamp: v => { priorTimestamp = v; },
  setCameraRevision: () => { cameraRevision++; },
  getZoomMap: () => zoomMap,
});

export function openSettings(panel = 'display') { return settings.openSettings(panel); }
export function closeSettings() { return settings.closeSettings(); }
export function applyTouchSize() { return settings.applyTouchSize(); }
export function atTravelPoint() { return medalTravel.atTravelPoint(); }
export function arriveAtStation() { return medalTravel.arriveAtStation(); }
function updateElevationMap() { return medalTravel.updateElevationMap(); }
function updateTravelButton() { return medalTravel.updateTravelButton(); }
function updateCampusLabels() { return medalTravel.updateCampusLabels(); }

function selectCourse(event,opponent=null,extraOpponents=[]) {
  if (typeof CampusCourier !== 'undefined') CampusCourier.stop(false);
  ShadowChase.stop();
  BlindNav.leave(setActiveWeather);
  BlindNav.setEnabled(false);
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
  ui.travel.addEventListener('click',medalTravel.requestTravel);
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
  ui.bigMap.addEventListener('click',handleMapClick);
  initRouteBuilderControls();
  ui.startTrial.addEventListener('click',startTrial);
  ui.freeRide.addEventListener('click',enterFreeRide);
  ui.pause.addEventListener('click',pauseTrial);
  ui.callAction.addEventListener('click',() => race.paused ? pauseTrial() : startTrial());
  ui.cycleCamera = settings.cycleCamera;
  const ringBell = () => {
    playCustomSound('bell');
    if (!BlindNav.active || getOnlineRoom()) return;
    const gate = race.phase === 'race' || race.phase === 'count' ? (race.event.gates[race.nextGate] ?? race.event.gates[0]) : null;
    const target = gate ? { position: gate.p, label: gate.name ?? '' } : null;
    BlindNav.triggerBell(performance.now(), race.rider, target);
    updateHud();
  };
  ui.touchBell?.addEventListener('click', () => { ringBell(); focusStage(); });
  ui.mapToggle.addEventListener('click',() => { openMap(!mapOpen); focusStage(); });
  ui.cameraToggle.addEventListener('click',() => { settings.cycleCamera(); focusStage(); });
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
    if (event.code === 'KeyV') { event.preventDefault(); settings.cycleCamera(); }
    else if (event.code === 'KeyM') openMap(!mapOpen);
    else if (event.code === 'KeyR') startTrial();
    else if (event.code === 'KeyP') pauseTrial();
    else if (event.code === 'KeyF') recoverTrial();
    else if (event.code === 'KeyB' || event.code === 'KeyH') ringBell();

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
    pad *= preferences.touchSize / 100;
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
    settings.updateFullscreenLabels(settings.isFullscreen());
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
  setText(ui.notice, message);
  ui.notice.hidden = false;
}

function run() {
  initLanguage(ui.settingsLanguage, () => {
    medalTravel.updateCampusLabels();
    initHud();
    settings.updateSettingsLabels();
    settings.updateSettingsActions();
    settings.updateFullscreenLabels(settings.isFullscreen());
    settings.applyHudScale();
    showCameraMode(stage, ui, preferences.cameraView);
    if (ui.friendCampus.value) updateFriendFilters();
    renderOnline();
    updateHud();
  });
  observeStageControls(stage, stage.querySelector('.stage-controls'));
  buildRidingScene(getActiveCampus());
  medalTravel.updateCampusLabels();
  initHud();
  initInput();
  initSeedDialog();
  initFriendDuel();
  initOnline();
  medalTravel.initMedalDialog();
  ui.courierButton?.addEventListener('click',()=>{
    if(CampusCourier.active) CampusCourier.stop(true);
    else CampusCourier.start(getActiveCampus(),race.rider.position);
    updateHud();
    focusStage();
  });
  settings.initSettings(initMapReplay);
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
  const limbs=new gpu.Mesh(new Shape(),0,null,true);
  const ghostLimbs=new gpu.Mesh(new Shape(),0,null,true), roomLimbs=[];
  const motorRigs=new Map(), bicycleRigs=bicycleRigCache(gpu), riderSkins=riderSkinBodyCache(gpu);
  let ownBicycle,friendBicycle,remoteBicycles=new Map();
  let ownSkin=null,friendSkin=null,remoteSkins=new Map();
  const getRig=kind=>motorRigs.get(kind);
  const resolveSkinEntry=profile=>riderSkins.prepare(skinForProfile(profile));
  const activeSkinMesh=(entry,vehicle)=>entry&&skinAllowedOnVehicle(entry.skin,vehicle)
    ?(vehicle==='bike'?entry.bikeBodyMesh:vehicle==='chair'?entry.mesh:entry.poweredBodyMesh):null;
  function prepareMotor(vehicle) {
    if(vehicle!=='bike'&&!motorRigs.has(vehicle)) motorRigs.set(vehicle,uploadPoweredRig(gpu,vehicle));
  }
  refreshBicycleModels=()=>{
    const selected=bicycleRigs.prepare(bicycleAppearance(driverProfile,race.bike));
    if(ownBicycle!==selected) {ownBicycle=selected;graphicsRevision++;}
    const nextOwnSkin=resolveSkinEntry(driverProfile);
    if(ownSkin!==nextOwnSkin) {ownSkin=nextOwnSkin;graphicsRevision++;}
    const opponent=race.opponent;
    friendBicycle=opponent?.vehicle==='bike'?bicycleRigs.prepare(bicycleAppearance(opponent,opponent.bike)):ownBicycle;
    friendSkin=opponent?resolveSkinEntry(opponent):null;
    prepareMotor(race.rider.vehicle);
    if(opponent) prepareMotor(opponent.vehicle);
    const state=getOnlineRoom()?.state;
    const peers=state?.players.filter(player=>player.id!==getOnlineRoom().id)??[];
    remoteBicycles=new Map();
    remoteSkins=new Map();
    for(const player of peers) {
      const vehicle=state.vehicleRule==='any'?knownVehicle(player.vehicle):knownVehicle(state.vehicleRule);
      if(vehicle==='bike') remoteBicycles.set(player.id,bicycleRigs.prepare(bicycleAppearance(player,player.bike)));
      else prepareMotor(vehicle);
      const entry=resolveSkinEntry(player);
      if(entry) remoteSkins.set(player.id,entry);
    }
    if (!getOnlineRoom()) {
      for (const [idx, extra] of (race.extraOpponents ?? []).entries()) {
        if (extra.vehicle==='bike') remoteBicycles.set('extra-'+idx,bicycleRigs.prepare(bicycleAppearance(extra,extra.bike)));
        else prepareMotor(extra.vehicle);
        const entry=resolveSkinEntry(extra);
        if(entry) remoteSkins.set('extra-'+idx,entry);
      }
    }
    for(const rival of race.rivals??[]) {
      if(rival.vehicle==='bike') remoteBicycles.set(rival.id,bicycleRigs.prepare(bicycleAppearance(rival,stockBike)));
      else prepareMotor(rival.vehicle);
      const entry=resolveSkinEntry(rival);
      if(entry) remoteSkins.set(rival.id,entry);
    }
    if (!getOnlineRoom() && ShadowChase.active) {
      if (ShadowChase.vehicle === 'bike') {
        remoteBicycles.set('chase-runner', bicycleRigs.prepare(bicycleAppearance(ShadowChase.runnerProfile ?? {}, ShadowChase.runnerProfile?.bike)));
      } else {
        prepareMotor(ShadowChase.vehicle);
      }
      const chaseSkin = ShadowChase.runnerProfile ? resolveSkinEntry(ShadowChase.runnerProfile) : null;
      if (chaseSkin) remoteSkins.set('chase-runner', chaseSkin);
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
    const skinEntry=ghost.id?(remoteSkins.get(ghost.id)??(ghost.skin?riderSkins.prepare(ghost.skin):null)):friendSkin;
    const customSkin=activeSkinMesh(skinEntry,kind);
    if(kind!=='bike') {
      const lean=kind==='chair'?0:ghost.steering*clamp(Math.abs(ghost.speed)*.026,0,.216), rig=getRig(kind);
      const armed=(kind==='ebike'||kind==='trail')&&customSkin&&skinEntry?.hasArms;
      if (armed) limbMesh.update(movingPoweredSkinArms(skinEntry.skin,rig,ghost.steering??0));
      return poweredPose(rig,placement(add(ghost.position,[0,.006,0]),lean,-ghost.heading,pitch),ghost,customSkin,armed?limbMesh:null);
    }
    const rig=ghost.id?remoteBicycles.get(ghost.id)??ownBicycle:friendBicycle;
    const turn=-.253*ghost.steering;
    const forkPose=placement(rig.pivot,0,turn,0);
    const steer=multiply(forkPose,placement(scale(rig.pivot,-1)));
    const pose=movingParts(ghost.travel,steer,rig.grip,{skin:customSkin?skinEntry.skin:null});
    limbMesh.update(pose.shape);
    const spin=-ghost.travel/TYRE_RADIUS;
    const lean=ghost.steering*clamp(Math.abs(ghost.speed)*.026,0,.216);
    const root=placement(add(ghost.position,[0,.006,0]),lean,-ghost.heading,pitch);
    return [[rig.frame,root],[rig.wheel,multiply(root,placement(REAR,0,0,spin))],
      [rig.wheel,multiply(root,placement(transform(steer,FRONT),0,turn,spin))],
      [rig.fork,multiply(root,forkPose)],[customSkin??rig.body,multiply(root,pose.bodyPose)],[limbMesh,root]];
  }
  const routeMeshes = new Map(), noRoute = [];
  let renderScale=1,renderedSettings=-1,lastStageWidth=0,lastStageHeight=0;
  let previousCamera, steering=Infinity, parts,bow,facing,waterTime=0,animationId,lastCameraRevision=-1,poseRig,poseSkin,posePhase,poseTuck,poseStand;

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
    const rider = race.rider;
    const poseVisual = race.interpolatedRiderPose();
    const p = poseVisual.position;
    lastStageWidth=width;lastStageHeight=height;renderedSettings=graphicsRevision;
    const rw = Math.max(1,Math.round(width*dpr)), rh = Math.max(1,Math.round(height*dpr));
    if (canvas.width !== rw || canvas.height !== rh) { canvas.width = rw; canvas.height = rh; }
    const pitch=Math.atan(riderGrade(p,poseVisual.heading));
    const root=placement(add(p,[0,.004,0]),poseVisual.lean+(rider.vehicle==='bike'?bicycleRock(rider):0),-poseVisual.heading,pitch);
    const firstPerson = preferences.cameraView === 'first';
    let riderMeshes,tagHeight=1.88;
    const customSkin=activeSkinMesh(ownSkin,rider.vehicle);
    if (firstPerson) riderMeshes = noRoute;
    else if(rider.vehicle==='bike') {
      const rig=ownBicycle, angle=-.253*rider.steering, activeSkinSpec=customSkin?ownSkin.skin:null;
      const phase=rider.pedalPhase??0, tuck=Math.round((rider.tuck??0)*256)/256, stand=Math.round((rider.stand??0)*256)/256;
      if(!parts||poseRig!==rig||poseSkin!==activeSkinSpec||posePhase!==phase||poseTuck!==tuck||poseStand!==stand||steering!==angle) {
        facing=placement(rig.pivot,0,angle,0);
        bow=multiply(facing,placement(scale(rig.pivot,-1)));
        parts=movingParts(poseVisual.travel,bow,rig.grip,{pedalPhase:phase,tuck,stand,skin:activeSkinSpec});
        limbs.update(parts.shape);
        poseRig=rig; poseSkin=activeSkinSpec; posePhase=phase; poseTuck=tuck; poseStand=stand; steering=angle;
      }
      const wheel=-poseVisual.travel/TYRE_RADIUS;
      riderMeshes=[[rig.frame,root],[rig.wheel,multiply(root,placement(REAR,0,0,wheel))],
        [rig.wheel,multiply(root,placement(transform(bow,FRONT),0,angle,wheel))],
        [rig.fork,multiply(root,facing)],[customSkin??rig.body,multiply(root,parts.bodyPose)],[limbs,root]];
      tagHeight+=stand*.11-tuck*.16;
    } else {
      const rig=getRig(rider.vehicle), angle=-.25*rider.steering, armed=(rider.vehicle==='ebike'||rider.vehicle==='trail')&&customSkin&&ownSkin?.hasArms;
      if (armed&&(poseRig!==rig||poseSkin!==ownSkin.skin||steering!==angle)) {
        limbs.update(movingPoweredSkinArms(ownSkin.skin,rig,rider.steering));
        poseRig=rig; poseSkin=ownSkin.skin; steering=angle;
      }
      riderMeshes=poweredPose(rig,root,{ ...rider, travel: poseVisual.travel },customSkin,armed?limbs:null);
      tagHeight=rig.tagHeight;
    }
    if(lastCameraRevision!==cameraRevision){previousCamera=undefined;lastCameraRevision=cameraRevision;}
    previousCamera=rideCamera(race,width/height,previousCamera,dt,preferences.cameraView,motion.matches);
    let route = noRoute;
    if (race.phase !== 'free' && !BlindNav.visibility().hideRoute) {
      const leg=activeStage(race.event,race.nextGate), key=leg??race.event;
      if(!routeMeshes.has(key)) {
        for(const [old,{arrows,braking}] of routeMeshes) {
          const staleSeed = old.seed && old !== worldState.seedCourses[getActiveCampus()];
          const staleCustom = old.networkEdges && old !== worldState.customCourses[getActiveCampus()];
          if (!staleSeed && !staleCustom) continue;
          const meshes=new Set([...arrows,...braking].map(([mesh])=>mesh.owner??mesh));
          for(const mesh of meshes) mesh.dispose();
          routeMeshes.delete(old);
        }
        routeMeshes.set(key,courseDecor(gpu,race.event,leg));
      }
      const decorations=routeMeshes.get(key);
      route = preferences.brakeLine ? decorations.braking : decorations.arrows;
    }
    const ghost=preferences.ghost&&!getOnlineRoom()&&!race.rivals?.length&&!ShadowChase.active?race.ghost:null;
    const ghosts=ghostMeshes(ghost);
    const chasePose=!getOnlineRoom()&&ShadowChase.phase==='active'?ShadowChase.visibleGhostPose():null;
    if(chasePose) ghosts.push(...ghostMeshes(chasePose,ghostLimbs));
    const aiRiders=race.rivals?.map(actor=>actor.pose).filter(Boolean)??[];
    const onlineChaseView = getOnlineRoom() ? getOnlineChaseView(performance.now()) : null;
    const extraRiders=getOnlineRoom()?(onlineChaseView?.snap?.active?onlineChaseView.visibleRiders:onlineRiderPoses(performance.now())):(aiRiders.length?aiRiders:preferences.ghost?race.extraGhosts:[]);
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
    settings.updateGraphicsStatus(renderedFrame);
    if (firstPerson) ui.riderTag.hidden = true;
    else projectTag(ui.riderTag,previousCamera,transform(root,[-.08,tagHeight,0]),width,height);
    if (chasePose) {
      setRawText(ui.friendTag, message`逃跑影子 · ${Math.round(ShadowChase.distance)}m`);
      const tagY = chasePose.vehicle === 'chair' ? 1.57 : 1.93;
      projectTag(ui.friendTag, previousCamera, add(chasePose.position, [0, tagY, 0]), width, height);
    } else if (race.opponent&&ghost&&ghosts.length) {
      setRawText(ui.friendTag, race.opponent.kind === race.opponent.name ? translate(race.opponent.name) : race.opponent.name);
      const tagY=race.opponent.vehicle==='chair'?1.57:1.93;
      projectTag(ui.friendTag,previousCamera,add(ghost.position,[0,tagY,0]),width,height);
    } else ui.friendTag.hidden=true;
    const onlineTags=[ui.onlineTag0,ui.onlineTag1,ui.onlineTag2];
    const maxTagDist = onlineChaseView?.snap?.active ? 95 : 65;
    for (let i=0;i<onlineTags.length;i++) {
      const remote=extraRiders[i], tag=onlineTags[i];
      if (!tag) continue;
      if (remote && length(subtract(remote.position,p))<maxTagDist) {
        const baseLabel = remote.tagLabel ?? (remote.skill ? `${remote.name} · ${translate(remote.skill)}` : remote.name||DEFAULT_RIDER_NAME);
        setRawText(tag, remote.tagLabel ? message`${remote.name} · ${Math.round(remote.chaseDistance)}m` : baseLabel);
        const tagY=remote.vehicle==='chair'?1.57:1.96;
        projectTag(tag,previousCamera,add(remote.position,[0,tagY,0]),width,height);
      } else tag.hidden=true;
    }
    const remark=cheer(dt,rider.vehicle==='chair'&&rider.speed>1.1&&!settingsOpen&&!race.paused);
    if(remark && !firstPerson) {
      setText(ui.chairCheer,remark);
      projectTag(ui.chairCheer,previousCamera,transform(root,[-.08,tagHeight+.31,0]),width,height);
    } else ui.chairCheer.hidden=true;
    if(!getOnlineRoom()&&race.phase==='free'&&CampusCourier.active&&CampusCourier.target&&CampusCourier.campus===getActiveCampus()&&ui.courierTag) {
      setRawText(ui.courierTag,message`闪送 · ${translate(CampusCourier.target.name)}`);
      projectTag(ui.courierTag,previousCamera,add(CampusCourier.target.p,[0,7.5,0]),width,height);
    } else if(ui.courierTag) ui.courierTag.hidden=true;
    const gates=race.event.gates,gate=gates[race.nextGate];
    if (race.phase === 'race' && gate && length(subtract(p,gate.p)) < 96) {
      setText(ui.gateTag,gate.index > 0 && gate.index < gates.length-1 ? message`检查点 ${gate.number}` : gate.number);
      projectTag(ui.gateTag,previousCamera,courseGround(race.event,[gate.p[0],race.event.campus==='ucl'?4.36:6.04,gate.p[2]],gate.rise),width,height);
    } else ui.gateTag.hidden = true;
  }

  function completeTravel() {
    const previous=getActiveCampus(), previousObstacles=worldState.ridingObstacles;
    const previousLists=sceneLists.map(items=>items.slice()), previousGround=worldState.groundSurfaces;
    if (typeof CampusCourier !== 'undefined') CampusCourier.stop(false);
    ShadowChase.stop();
    BlindNav.leave(setActiveWeather);
    BlindNav.setEnabled(false);
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
    updateFps(now);
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
    const dpr = width && height ? settings.graphicsScale(width, height, renderScale) : 1;
    const chaseSnap = getOnlineRoom() ? getOnlineChaseSnapshot(now) : null;
    const roomRacing = getOnlineRoom()?.state.phase==='race' && !getOnlineRoom().retired && (race.phase!=='free' || Boolean(chaseSnap?.active));
    const freeRunning = !getOnlineRoom()&&!settingsOpen&&!pendingCampus&&!ui.seedDialog.open&&!ui.friendDialog.open&&!ui.onlineDialog.open&&!ui.medalDialog?.open&&!ui.travelDialog.open;
    if (roomRacing || freeRunning) {
      if (!roomRacing && wallTime > 1 && (race.phase === 'race' || race.phase === 'count' || ShadowChase.isRunning())) {
        race.paused = true;
        clearInput();
      }
      const simulationTime = race.phase === 'free' ? dt : wallTime;
      const simulationStart = now - simulationTime * 1000;
      const chaseLocked = (!getOnlineRoom() && ShadowChase.phase === 'headstart') ||
        Boolean(chaseSnap && (chaseSnap.phase === 'count' || chaseSnap.hunterLocked || chaseSnap.isCaught));
      if (!(ShadowChase.active && !ShadowChase.isRunning())) {
        race.advance(simulationTime, chaseLocked ? neutralDrive : offset => driveAt(simulationStart + offset * 1000));
      }
      if (freeRunning && !race.paused) {
        if (ShadowChase.isRunning()) {
          ShadowChase.tick(dt, race.rider, { playSound: playCustomSound, landmarkAt: nearestCourierLandmark });
        } else if (race.phase === 'free' && !ShadowChase.active) {
          CampusCourier.tick(dt, race.rider, getActiveCampus(), now);
        }
        if (BlindNav.active && (race.phase === 'race' || ShadowChase.phase === 'active')) {
          BlindNav.tick(now, race.rider, null, getActiveCampus(), playCustomSound);
        }
      }
    }
    if (typeof updateRideAudio === 'function') updateRideAudio(race.rider, dt, !settingsOpen && !race.paused && !mapOpen && !pendingCampus);
    const progressChanged = previousPhase !== race.phase || previousPaused !== race.paused || previousGate !== race.nextGate || previousChasePhase !== ShadowChase.phase;
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
      renderCampusMap(map, race, !mapOpen, mapOpen && zoomMap, mapControls.currentOverlay());
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
  setText(ui.replayDetail,message`速度差 ${((a.speed-b.speed)*3.6).toFixed(1)} km/h`+(gap===null?'':message` · 秒差 ${signedSeconds(gap)}`));
  renderCampusMap(ui.bigMap,race,false,zoomMap);
}

function startSectorPractice(fromGate, toGate) {
  if (!ready || getOnlineRoom() || pendingCampus || race.event.campus !== getActiveCampus()) return;
  const gates = race.event.gates;
  if (fromGate < 0 || toGate <= fromGate || toGate >= gates.length) return;
  applyPendingSaveVehicle({ restarting: true });
  clearInput();
  if(race.startPractice(fromGate,toGate)===false) {
    openSettings('bike');
    workshop.highlightBudgetParts();
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
      btn.textContent = translate('单练');
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
  isVehicleRestoreLocked: () => ShadowChase.active,
  readPreferences,
  fillPreferences: settings.fillPreferences,
  applyTouchSize,
  showBikeSetup: workshop.showBikeSetup,
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
  beginOnlineChaseRound,
  rebuildCourseHud,
  updateHud,
  highlightBudgetParts: workshop.highlightBudgetParts,
  timeLabel,
});

worldState.hooks.selectCourse = (event, opponent = null, extraOpponents = []) => selectCourse(event, opponent, extraOpponents);
worldState.hooks.pauseTrial = pauseTrial;
worldState.hooks.updateHud = updateHud;
worldState.hooks.focusStage = focusStage;
worldState.hooks.refreshBicycleModels = () => refreshBicycleModels?.();
worldState.hooks.setPendingCampus = v => { pendingCampus = v; };
worldState.hooks.getPendingCampus = () => pendingCampus;
worldState.hooks.openFriendDialog = openFriendDialog;
worldState.hooks.isBlindHideBigMap = () => BlindNav.visibility().hideBigMap;

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
    applyHudScale: settings.applyHudScale,
    rebuildCourseHud,
    showBikeSetup: workshop.showBikeSetup,
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
    setMapOpen: v => { mapOpen = Boolean(v); sceneHud.setMapOpen(mapOpen); },
  };
}

export { run };
