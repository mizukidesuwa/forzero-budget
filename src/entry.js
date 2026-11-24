import { neutralDrive, PHYSICS_STEP } from './core/clock.js';
import { ROAD_Y, clamp } from './core/math.js';
import { getActiveCampus, setActiveCampus, worldState } from './core/state.js';
import { getOnlineBusy, getOnlineRoom } from './online/client.js';
import { checkpointRecordKey } from './race/records.js';
import { loadFriendGhost, makeGhostFile, readFriendScores, readGhostFile } from './replay/ghost.js';
import { mapReplay } from './replay/map-replay.js';
import { setActiveWeather } from './render/atmosphere.js';
import { makeRider } from './ride/models.js';
import { makeCyclist, moveCyclist, resolveVehicleCollisions } from './ride/physics.js';
import { bicycleAppearance, bicycleStyle, buildBike, stockBike } from './ride/vehicles.js';
import { getAppBridge, run } from './ui/app.js';
import { renderCampusMap } from './ui/minimap.js';
import { applySaveSnapshot, buildSaveSnapshot } from './ui/save-sync.js';
import { rainPuddleSites } from './world/environment.js';
import { along, courseFrame, plannedSpeed } from './world/geometry.js';
import { mountainUp, parkCourse, parkHeight, parkPath, parkSurfaceKind } from './world/maps/shunde.js';
import { openStreets } from './world/maps/szu.js';
import { courseGround, rideElevation, riderGrade } from './world/query.js';
import { courses, coursesByCampus } from './world/scene-builder.js';
import { trafficPosition, trialTraffic } from './world/traffic.js';

const bridge = getAppBridge();

const liveAccessors = {
  ready: [bridge.isReady, bridge.setReady],
  activeCampus: [getActiveCampus, setActiveCampus],
  pendingCampus: [bridge.getPendingCampus, bridge.setPendingCampus],
  cameraRevision: [bridge.getCameraRevision, bridge.setCameraRevision],
  zoomMap: [bridge.getZoomMap, bridge.setZoomMap],
  uclRouteVisible: [bridge.getUclRouteVisible, bridge.setUclRouteVisible],
  settingsOpen: [bridge.getSettingsOpen, bridge.setSettingsOpen],
  mapOpen: [bridge.getMapOpen, bridge.setMapOpen],
  onlineRoom: [getOnlineRoom, undefined],
  onlineBusy: [getOnlineBusy, undefined],
  riderGrade: [
    () => worldState.hooks.riderGrade ?? riderGrade,
    (fn) => { worldState.hooks.riderGrade = fn === riderGrade ? null : fn; },
  ],
};

for (const [name, [get, set]] of Object.entries(liveAccessors)) {
  Object.defineProperty(globalThis, name, {
    get,
    ...(set ? { set } : {}),
    configurable: true,
    enumerable: true,
  });
}

Object.assign(globalThis, {
  PREF_KEY: bridge.PREF_KEY,
  race: bridge.race,
  ui: bridge.ui,
  preferences: bridge.preferences,
  driverProfile: bridge.driverProfile,
  vehicleTunings: bridge.vehicleTunings,
  touches: bridge.touches,
  canvas: bridge.canvas,
  stage: bridge.stage,
  beginTrial: bridge.beginTrial,
  updateHud: bridge.updateHud,
  openSettings: bridge.openSettings,
  closeSettings: bridge.closeSettings,
  openMap: bridge.openMap,
  updateMapReplay: bridge.updateMapReplay,
  updateDrive: bridge.updateDrive,
  atTravelPoint: bridge.atTravelPoint,
  arriveAtStation: bridge.arriveAtStation,
  applyTouchSize: bridge.applyTouchSize,
  applyHudScale: bridge.applyHudScale,
  rebuildCourseHud: bridge.rebuildCourseHud,
  showBikeSetup: bridge.showBikeSetup,
  refreshBicycleModels: bridge.refreshBicycleModels,
  selectCourse: bridge.selectCourse,
  pauseTrial: bridge.pauseTrial,
  startTrial: bridge.startTrial,
  enterFreeRide: bridge.enterFreeRide,
  recoverTrial: bridge.recoverTrial,
  initHud: bridge.initHud,
  ROAD_Y,
  PHYSICS_STEP,
  along,
  clamp,
  plannedSpeed,
  courseFrame,
  courseGround,
  rideElevation,
  parkHeight,
  parkSurfaceKind,
  rainPuddleSites,
  setActiveWeather,
  makeRider,
  bicycleAppearance,
  bicycleStyle,
  buildBike,
  stockBike,
  makeCyclist,
  moveCyclist,
  trialTraffic,
  trafficPosition,
  resolveVehicleCollisions,
  neutralDrive,
  courses,
  coursesByCampus,
  openStreets,
  mountainUp,
  parkPath,
  parkCourse,
  mapReplay,
  makeGhostFile,
  loadFriendGhost,
  readGhostFile,
  checkpointRecordKey,
  buildSaveSnapshot,
  applySaveSnapshot,
  readFriendScores,
  renderCampusMap,
});

run();
