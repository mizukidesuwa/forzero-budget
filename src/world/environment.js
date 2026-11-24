import { ROAD_Y, TAU, clamp, mix } from '../core/math.js';
import { Shape } from '../core/shape.js';
import { getActiveCampus, getPreferences, worldState } from '../core/state.js';
import { getActiveWeatherId, knownWeather, weatherChoices } from '../render/atmosphere.js';
import { courseFrame } from './geometry.js';
import { createWorldQuery, rideElevation } from './query.js';
import { raceTrafficTime } from './traffic.js';

import { WEEKLY_SEED_PATTERN, WEEKLY_WEATHERS, WIND_LABELS, customWindLimits, puddleCourseStations, puddleRadius } from '../data/environment.js';
import { windPhysics } from '../data/surfaces.js';

export { WEEKLY_SEED_PATTERN, WEEKLY_WEATHERS, WIND_LABELS } from '../data/environment.js';

const puddleCache = new Map();

export function clearPuddleCache() {
  puddleCache.clear();
}

export function rainPuddleSites(campus, coursesMap = worldState.coursesByCampus) {
  if (puddleCache.has(campus)) return puddleCache.get(campus);
  const sites = [];
  for (const [id, ...stations] of puddleCourseStations[campus] ?? []) {
    const path = coursesMap?.[campus]?.find(event => event.id === id)?.path;
    if (!path) continue;
    for (const fraction of stations) {
      const { p: [x, , z] } = courseFrame(path, path.length * fraction);
      const r = puddleRadius.base + (sites.length % puddleRadius.repeats) * puddleRadius.spread;
      sites.push({ x, z, r, r2: r * r });
    }
  }
  puddleCache.set(campus, sites);
  return sites;
}

export function rainPuddleAt(campus, x, z, rain) {
  if (!rain) return false;
  return rainPuddleSites(campus).some(site => (x - site.x) ** 2 + (z - site.z) ** 2 <= site.r2);
}

export function rainPuddleShape(campus) {
  const shape = new Shape();
  for (const { x, z, r } of rainPuddleSites(campus)) {
    const vertex = (dx, dz, offset = 0) => [x + dx, rideElevation(x + dx, z + dz, campus) + ROAD_Y + .006 + offset, z + dz];
    const center = vertex(0, 0);
    const rim = Array.from({ length: 7 }, (_, i) => {
      const a = i * TAU / 7, uneven = r * (.88 + (i % 3) * .053);
      return vertex(Math.cos(a) * uneven, Math.sin(a) * uneven);
    });
    for (let i = 0; i < rim.length; i++) shape.triangle(center, rim[(i + 1) % rim.length], rim[i], i % 2 ? '#859eab' : '#9cb4c0');
    shape.triangle(vertex(-r * .61, 0, .002), vertex(r * .49, r * .08, .002), vertex(r * .48, -r * .09, .002), '#c5d6db');
  }
  return shape;
}

export const knownWindMode = value => value === 'steady' ? 'steady' : 'gust';

export function weeklyEnvironment(seedCode) {
  if (typeof seedCode !== 'string' || !WEEKLY_SEED_PATTERN.test(seedCode)) return null;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedCode.length; i++) {
    h ^= seedCode.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const weather = WEEKLY_WEATHERS[h % WEEKLY_WEATHERS.length];
  const dirIdx = (h >>> 3) & 7;
  const angle = dirIdx * (Math.PI / 4);
  const speed = Number((1.0 + ((h >>> 6) % 15) * 0.1).toFixed(1));
  return {
    seed: seedCode,
    weather,
    angle,
    vector: [Math.cos(angle), Math.sin(angle)],
    speed,
    label: WIND_LABELS[dirIdx],
    grade: speed < 1.6 ? '1级风' : '2级风',
  };
}

export function makeCustomWind(speed, dir = 0, weather = 'day') {
  const s = Number.isFinite(Number(speed)) ? Math.round(clamp(Number(speed), 0, customWindLimits.maxSpeed) * 10) / 10 : 0;
  if (s <= 0) return null;
  const dirIdx = Number.isInteger(Number(dir)) ? clamp(Number(dir), 0, customWindLimits.lastDirection) : 0;
  const angle = dirIdx * (Math.PI / 4);
  return {
    weather,
    angle,
    vector: [Math.cos(angle), Math.sin(angle)],
    speed: s,
    dir: dirIdx,
    label: WIND_LABELS[dirIdx],
    custom: true,
  };
}

export function gustWind(base, clock, seed, mode) {
  if (!base || knownWindMode(mode) === 'steady') return base;
  const text = String(seed ?? 0);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  const phase = (hash >>> 0) / 4294967296 * TAU;
  const t = Number.isFinite(clock) ? clock : 0;
  const { gust } = windPhysics;
  const a = Math.sin(t * gust.frequencyA + phase), b = Math.sin(t * gust.frequencyB + phase * gust.phaseB);
  const angle = base.angle + (gust.angleMixB * b + gust.angleMixA * a) * Math.PI / gust.angleDivisor;
  return { ...base, angle, vector: [Math.cos(angle), Math.sin(angle)], speed: base.speed * (1 + gust.strengthA * a + gust.strengthB * b) };
}

export function shelteredWind(wind, rider, dt, worldQuery = null) {
  if (!wind) {
    rider.windExposure = 1;
    return null;
  }
  const query = worldQuery ?? createWorldQuery(getActiveCampus());
  const campus = query.campus;
  const [x, y, z] = rider.position, [dx, dz] = wind.vector;
  const { shelter } = windPhysics;
  const sheltered = shelter.distances.some(distance => {
    const px = x - dx * distance, pz = z - dz * distance;
    return query.buildingAt(px, pz, 0, y + shelter.wallClearance) || query.cityWallAt(px, pz, y + shelter.wallClearance) ||
      (campus === 'shunde' && query.rideElevation(px, pz) > y + shelter.terrainClearance);
  });
  rider.windExposure = mix(rider.windExposure ?? 1, sheltered ? shelter.exposure : 1, 1 - Math.exp(-shelter.response * dt));
  return { ...wind, speed: wind.speed * rider.windExposure };
}

export function activeWind(raceObj = worldState.race, clock = raceObj ? raceTrafficTime(raceObj) : 0) {
  const room = worldState.onlineRoom;
  if (room) {
    const st = room.state;
    const w = knownWeather(st?.weather);
    return gustWind(makeCustomWind(st?.windSpeed ?? 0, st?.windDir ?? 0, w), clock, st?.round?.windSeed ?? st?.windSeed, st?.round?.windMode ?? st?.windMode);
  }
  if (raceObj?.event?.environment) {
    const environment = raceObj.event.environment;
    return gustWind(environment, clock, environment.seed, 'gust');
  }
  const prefs = getPreferences();
  if (prefs?.windSpeed > 0) {
    const w = getActiveWeatherId() ?? prefs.weather;
    return gustWind(makeCustomWind(prefs.windSpeed, prefs.windDir ?? 0, w ?? 'day'), clock,
      raceObj?.raceTraffic?.seed ?? getActiveCampus(), prefs.windMode);
  }
  return null;
}

export function windEffectLabel(raceObj) {
  const wind = activeWind(raceObj);
  if (!wind || !raceObj?.rider) return '';
  const along = Math.cos(raceObj.rider.heading) * wind.vector[0] + Math.sin(raceObj.rider.heading) * wind.vector[1];
  const rel = along > 0.35 ? '顺风' : along < -0.35 ? '逆风' : '侧风';
  const exposure = raceObj.rider.windExposure ?? 1;
  const speed = (wind.speed * exposure).toFixed(1);
  const shelter = exposure < .70 ? ' · 背风' : '';
  if (wind.custom) return `${wind.label} ${speed}m/s · ${rel}${shelter}`;
  const weatherName = weatherChoices[wind.weather]?.name ?? wind.weather;
  return `${weatherName} · ${wind.label} ${speed}m/s · ${rel}${shelter}`;
}
