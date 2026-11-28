// @ts-check
import { TAU } from '../core/math.js';
import { customWindLimits } from '../data/environment.js';
import { courseVariantRules } from '../data/race.js';
import { trafficRules } from '../data/traffic.js';
import { knownWeather } from '../render/atmosphere.js';
import { knownWindMode } from '../world/ride-environment.js';
import { knownTraffic, trafficSeedFor } from '../world/traffic.js';

// The preceding identity omitted weather on calm runs, collision and gust inputs.
const prefix = 'env2|';

/** @typedef {{ speed: number, angle: number }} BaseWind */
/** @typedef {BaseWind & { weather?: string, seed?: string | number }} CourseEnvironment */
/** @typedef {{ campus?: string, id?: string, seed?: string | null, variant?: {direction?: string, laps?: number}, environment?: CourseEnvironment | null }} RaceCourse */
/** @typedef {{ weather?: string, trafficSeed?: string | number | null, trafficMode?: string, collision?: boolean, wind?: BaseWind | null, windMode?: string, windSeed?: string | number | null }} RaceEnvironmentOptions */
/** @typedef {{ campus: string, course: string, direction: 'forward' | 'reverse', laps: number, weather: string, trafficMode: 'off' | 'sparse' | 'standard', trafficSeed: string | null, collision: boolean, wind: (BaseWind & { mode: 'gust' | 'steady', seed: string | null }) | null }} RaceEnvironmentIdentity */

/** @param {RaceCourse} event @param {RaceEnvironmentOptions} [options] @returns {string} */
export function raceEnvironmentKey(event, options = {}) {
  const courseEnvironment = event?.environment;
  const trafficMode = knownTraffic(options.trafficMode);
  const trafficSeed = options.trafficSeed ?? trafficSeedFor(event, null);
  const wind = options.wind === undefined ? courseEnvironment : options.wind;
  const windMode = knownWindMode(options.windMode);
  const phaseSeed = options.windSeed ?? courseEnvironment?.seed ?? trafficSeed;
  const angle = wind ? wind.angle % TAU : 0;
  const windFields = wind && wind.speed > 0
    ? [wind.speed, angle < 0 ? angle + TAU : angle, windMode, windMode === 'gust' ? String(phaseSeed) : null]
    : null;
  return prefix + JSON.stringify([
    event?.campus ?? 'unknown', event?.seed ?? event?.id ?? 'course',
    event?.variant?.direction === 'reverse' ? 'reverse' : 'forward', event?.variant?.laps ?? 1,
    knownWeather(options.weather ?? courseEnvironment?.weather), trafficMode,
    trafficMode === 'off' ? null : String(trafficSeed), Boolean(options.collision), windFields,
  ]);
}

/** @param {unknown} value @returns {value is string} */
function nonemptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

/** @param {unknown} value @returns {RaceEnvironmentIdentity | null} */
export function readRaceEnvironmentKey(value) {
  if (typeof value !== 'string' || !value.startsWith(prefix)) return null;
  try {
    const fields = JSON.parse(value.slice(prefix.length));
    if (!Array.isArray(fields) || fields.length !== 9 || prefix + JSON.stringify(fields) !== value) return null;
    const [campus, course, direction, laps, weather, mode, trafficSeed, collision, wind] = fields;
    if (!nonemptyString(campus) || !nonemptyString(course) || (direction !== 'forward' && direction !== 'reverse') ||
        !courseVariantRules.laps.includes(laps) || knownWeather(weather) !== weather || knownTraffic(mode) !== mode ||
        (mode === 'off' ? trafficSeed !== null : !nonemptyString(trafficSeed)) || typeof collision !== 'boolean') return null;
    const base = { campus, course, direction, laps, weather, trafficMode: mode, trafficSeed, collision };
    if (wind === null) return { ...base, wind: null };
    if (!Array.isArray(wind) || wind.length !== 4) return null;
    const [speed, angle, windMode, seed] = wind;
    if (!Number.isFinite(speed) || speed <= 0 || speed > customWindLimits.maxSpeed ||
        !Number.isFinite(angle) || angle < 0 || angle >= TAU || knownWindMode(windMode) !== windMode ||
        (windMode === 'gust' ? !nonemptyString(seed) : seed !== null)) return null;
    return { ...base, wind: { speed, angle, mode: windMode, seed } };
  } catch { return null; }
}

/** @param {unknown} value @returns {string | null} */
export function knownRaceEnvironmentKey(value) {
  return typeof value === 'string' && readRaceEnvironmentKey(value) ? value : null;
}

/** @param {string | null | undefined} seed @returns {seed is string} */
function isRoomSeed(seed) {
  return typeof seed === 'string' && seed === String(Number(seed) >>> 0);
}

/**
 * Room rounds publish unsigned 32-bit traffic and gust seeds. A solo ghost race
 * can replay them when its actual settings and resulting identity match.
 * @param {RaceCourse} event
 * @param {import('../world/ride-environment.js').RideEnvironment} environment
 * @param {unknown} referenceKey
 * @returns {import('../world/ride-environment.js').RideEnvironment | null}
 */
export function matchRecordedEnvironment(event, environment, referenceKey) {
  if (raceEnvironmentKey(event, environment) === referenceKey) return environment;
  const recorded = readRaceEnvironmentKey(referenceKey);
  if (!recorded) return null;
  const trafficSeed = isRoomSeed(recorded.trafficSeed) ? recorded.trafficSeed : environment.trafficSeed;
  const windSeed = isRoomSeed(recorded.wind?.seed) ? recorded.wind.seed : environment.windSeed;
  if (trafficSeed === environment.trafficSeed && windSeed === environment.windSeed) return null;
  const replay = { ...environment, trafficSeed, windSeed };
  return raceEnvironmentKey(event, replay) === referenceKey ? Object.freeze(replay) : null;
}

/**
 * Preserve the original metadata in synthetic benchmarks and archived ghosts.
 * @param {RaceCourse} event
 * @param {{ trafficSeed?: string | number | null, wind?: (CourseEnvironment & {custom?: boolean}) | null }} [options]
 */
export function legacyRaceEnvironmentKey(event, { trafficSeed = null, wind = null } = {}) {
  const variant = event?.variant ? `${event.variant.direction ?? 'forward'}:${event.variant.laps ?? 1}` : 'forward:1';
  const course = event?.seed ?? event?.id ?? 'course';
  const traffic = trafficSeed ?? event?.seed ?? trafficSeedFor(event, null);
  const source = wind ?? event?.environment;
  /** @param {unknown} value @param {number} digits */
  const round = (value, digits) => Number.isFinite(Number(value)) ? Number(Number(value).toFixed(digits)) : 0;
  const windKey = source ? [
    source.weather ?? 'day', round(source.speed, 1), round(source.angle, 3),
    'custom' in source && source.custom ? 'custom' : 'course',
  ].join(',') : 'none';
  return [`env${trafficRules.seedVersion}`, event?.campus ?? 'unknown', course, variant, `traffic=${traffic}`, `wind=${windKey}`].join('|');
}
