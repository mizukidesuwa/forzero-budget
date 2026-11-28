import { getActiveCampus, worldState } from '../core/state.js';
import { sampleMeshSurface } from './mesh-surface.js';
import { getCampusProvider } from './registry.js';

export function safeToRide(x, z, exploring = false, skipHazard = false, campus = getActiveCampus()) {
  const p = getCampusProvider(campus);
  return p?.safeToRide ? p.safeToRide(x, z, exploring, skipHazard) : false;
}

export function surfaceAt(x, z, exploring = false, campus = getActiveCampus()) {
  const p = getCampusProvider(campus);
  return p?.surfaceAt ? p.surfaceAt(x, z, exploring) : false;
}

export function surfaceKindAt(x, z, exploring = false, campus = getActiveCampus()) {
  const p = getCampusProvider(campus);
  if (p?.surfaceKindAt) return p.surfaceKindAt(x, z, exploring);
  return surfaceAt(x, z, exploring, campus) ? 'paved' : 'grass';
}

export function buildingAt(x, z, margin = .38, y = 0, campus = getActiveCampus()) {
  const p = getCampusProvider(campus);
  return p?.buildingAt ? p.buildingAt(x, z, margin, y) : null;
}

export function cityWallAt(x, z, y = 0, campus = getActiveCampus()) {
  const p = getCampusProvider(campus);
  return p?.cityWallAt ? p.cityWallAt(x, z, y) : false;
}

export function rideElevation(x, z, campus = getActiveCampus()) {
  const p = getCampusProvider(campus);
  return p?.rideElevation ? p.rideElevation(x, z) : terrainMeshHeight(x, z, campus) ?? 0;
}

/** World-space height sampled from the rendered terrain, when available. */
export function terrainMeshHeight(x, z, campus = getActiveCampus()) {
  const obstacles = worldState.ridingObstacles;
  return obstacles?.region === campus ? sampleMeshSurface(obstacles.ground, x, z)?.height ?? null : null;
}

export function onCampusGround([x, y, z], campus = getActiveCampus()) {
  return [x, y + rideElevation(x, z, campus), z];
}

export function riderGrade(position, heading, campus = getActiveCampus()) {
  const p = getCampusProvider(campus);
  return p?.riderGrade ? p.riderGrade(position, heading) : 0;
}

export function waterHazardAt(x, z, campus = getActiveCampus()) {
  const p = getCampusProvider(campus);
  return p?.waterHazardAt ? p.waterHazardAt(x, z) : false;
}

export function nearestSafeRoad(x, z, campus = getActiveCampus()) {
  const p = getCampusProvider(campus);
  return p?.nearestSafeRoad ? p.nearestSafeRoad(x, z) : null;
}

export function flyoverAt(x, z, campus = getActiveCampus()) {
  const p = getCampusProvider(campus);
  return p?.flyoverAt ? p.flyoverAt(x, z) : null;
}

export function cliffHazardAt(x, z, y = 0, campus = getActiveCampus()) {
  const p = getCampusProvider(campus);
  return p?.cliffHazardAt ? p.cliffHazardAt(x, z, y) : null;
}

export function courseGround(event, p, rise = event?.flyover ? (getCampusProvider('szu')?.deckRiseAt?.(p) ?? 0) : 0) {
  const [x, y, z] = p;
  const camp = event?.campus ?? 'szu';
  return [x, y + rideElevation(x, z, camp) + rise, z];
}

export function createWorldQuery(campus = getActiveCampus()) {
  return {
    campus,
    safeToRide: (x, z, exploring = false, skipHazard = false) => safeToRide(x, z, exploring, skipHazard, campus),
    surfaceAt: (x, z, exploring = false) => surfaceAt(x, z, exploring, campus),
    surfaceKindAt: (x, z, exploring = false) => surfaceKindAt(x, z, exploring, campus),
    buildingAt: (x, z, margin = .38, y = 0) => buildingAt(x, z, margin, y, campus),
    cityWallAt: (x, z, y = 0) => cityWallAt(x, z, y, campus),
    rideElevation: (x, z) => rideElevation(x, z, campus),
    terrainMeshHeight: (x, z) => terrainMeshHeight(x, z, campus),
    onCampusGround: (pt) => onCampusGround(pt, campus),
    riderGrade: (position, heading) => riderGrade(position, heading, campus),
    waterHazardAt: (x, z) => waterHazardAt(x, z, campus),
    nearestSafeRoad: (x, z) => nearestSafeRoad(x, z, campus),
    flyoverAt: (x, z) => flyoverAt(x, z, campus),
    cliffHazardAt: (x, z, y = 0) => cliffHazardAt(x, z, y, campus),
    courseGround,
  };
}
