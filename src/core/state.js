import { browserPlayerStorage } from './browser-storage.js';

export const worldState = {
  activeCampus: 'szu',
  ridingObstacles: null,
  groundSurfaces: null,
  indexedRoads: null,
  trafficSceneRevision: 0,
  coursesByCampus: null,
  campuses: null,
  seedCourses: { szu: null, ucl: null },
  customCourses: { szu: null, ucl: null, shunde: null },
  preferences: {
    weather: 'day',
    traffic: 'sparse',
    collision: false,
    windSpeed: 0,
    windDir: 0,
    windMode: 'gust',
    soloBudget: 'open',
  },
  vehicleTunings: null,
  driverProfile: null,
  onlineRoom: null,
  race: null,
  storage: browserPlayerStorage(),
  ui: null,
  hooks: {
    onWeatherChange: null,
    playSound: null,
    scheduleSave: null,
    onlineDraftingAt: null,
    onlineRiderPoses: null,
    selectCourse: null,
    pauseTrial: null,
    updateHud: null,
    focusStage: null,
    openCourseDialog: null,
    refreshBicycleModels: null,
    setPendingCampus: null,
    getPendingCampus: null,
    makeSeedCourse: null,
    onlineRoundBuild: null,
    riderGrade: null,
  },
};

export function getActiveCampus() {
  return worldState.activeCampus;
}

export function setActiveCampus(campus) {
  worldState.activeCampus = campus;
  return campus;
}

export function getStorage() {
  return worldState.storage ?? browserPlayerStorage();
}

export function setStorage(store) {
  worldState.storage = store ?? null;
}

export function getPreferences() {
  return worldState.preferences;
}

export function setPreferences(prefs) {
  worldState.preferences = prefs;
  return prefs;
}
