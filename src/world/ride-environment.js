// @ts-check
import { clamp } from '../core/math.js';
import { WIND_LABELS, customWindLimits } from '../data/environment.js';
import { knownWeather } from '../render/atmosphere.js';
import { knownTraffic, trafficSeedFor } from './traffic.js';

/**
 * @typedef {'off' | 'sparse' | 'standard'} TrafficMode
 * @typedef {Readonly<{weather: string, speed: number, angle: number, vector: readonly number[], label?: string, custom?: boolean, dir?: number, seed?: string, grade?: string}>} RideWind
 * @typedef {{id?: string, campus?: string, seed?: string, variant?: {direction?: string, laps?: number}, environment?: RideWind | null}} RideEnvironmentCourse
 * @typedef {{weather?: string, traffic?: string, collision?: boolean, windSpeed?: number, windDir?: number, windMode?: string}} RidePreferences
 * @typedef {RidePreferences & {windSeed?: string | number, round?: {goAt?: number, trafficSeed?: string | number, windMode?: string, windSeed?: string | number}}} RoomEnvironment
 * @typedef {Readonly<{weather: string, trafficSeed: string, trafficMode: TrafficMode, collision: boolean, wind: RideWind | null, windMode: 'steady' | 'gust', windSeed: string}>} RideEnvironment
 */

/** @param {unknown} value */
export const knownWindMode = value => value === 'steady' ? 'steady' : 'gust';

/** @param {unknown} speed @param {unknown} [dir] @param {string} [weather] @returns {RideWind | null} */
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

/**
 * @param {RideEnvironmentCourse} event
 * @param {RidePreferences | null} preferences
 * @param {RoomEnvironment | null} room
 * @param {{seed: string | number, mode: TrafficMode} | null} raceTraffic
 * @param {{weather?: string}} options
 * @returns {RideEnvironment}
 */
export function createRideEnvironment(event, preferences, room, raceTraffic, options) {
  const courseWind = room ? null : event.environment;
  const weather = knownWeather(room ? room.weather : options.weather ?? courseWind?.weather ?? preferences?.weather);
  const trafficSeed = String(raceTraffic?.seed ?? trafficSeedFor(event, room?.round));
  const trafficMode = raceTraffic?.mode ?? knownTraffic(room ? room.traffic : preferences?.traffic);
  const collision = Boolean(room ? room.collision : preferences?.collision);
  const settings = room ?? preferences;
  const wind = courseWind ?? makeCustomWind(settings?.windSpeed, settings?.windDir, weather);
  const windMode = courseWind ? 'gust' : knownWindMode(room?.round?.windMode ?? settings?.windMode);
  const windSeed = String(room ? room.round?.windSeed ?? room.windSeed ?? 0 : courseWind?.seed ?? trafficSeed);
  const frozenWind = wind ? Object.freeze({ ...wind, weather, vector: Object.freeze([...wind.vector]) }) : null;
  return Object.freeze({ weather, trafficSeed, trafficMode, collision, wind: frozenWind, windMode, windSeed });
}
