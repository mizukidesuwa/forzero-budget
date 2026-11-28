import { londonTraffic, trafficRules } from '../data/traffic.js';
import { clamp, randomSource } from '../core/math.js';
import { getActiveCampus, getPreferences, worldState } from '../core/state.js';
import { cityVehicles, courseFrame, offsetVertex } from './geometry.js';
import { getCampusProvider } from './registry.js';

export function trafficPosition(actor, time) {
  const { path, start, speed, direction, offset, reentryDistance = 0, terminalFade } = actor;
  const cycle = path.length + reentryDistance;
  const distance = wrapDistance(start + direction * speed * time, cycle);
  if (distance >= path.length) return null;
  const frame = courseFrame(path, distance, actor.loop);
  const opacity = terminalFade ? clamp(Math.min(distance, path.length - distance) / terminalFade, 0, 1) : 1;
  return { frame, point: offsetVertex(frame, offset, .042), opacity };
}

// Physics advances traffic on a fixed clock. Keep the last pose for each actor
// so rendering the same clock value does not repeat the path-frame calculation.
// The uncached function above remains the public pure calculation used when a
// caller needs an independent pose object.
const trafficPoseCache = new WeakMap();

export function cachedTrafficPosition(actor, time) {
  const { path, start, speed, direction, offset, reentryDistance = 0, terminalFade, loop } = actor;
  const cached = trafficPoseCache.get(actor);
  if (cached && cached.time === time && cached.path === path && cached.start === start &&
      cached.speed === speed && cached.direction === direction && cached.offset === offset &&
      cached.reentryDistance === reentryDistance && cached.terminalFade === terminalFade &&
      cached.loop === loop) return cached.pose;
  const pose = trafficPosition(actor, time);
  trafficPoseCache.set(actor, {
    time, path, start, speed, direction, offset, reentryDistance, terminalFade, loop, pose,
  });
  return pose;
}

const wrapDistance = (distance, cycle) => ((distance % cycle) + cycle) % cycle;

export function knownTraffic(mode) {
  return mode === 'off' || mode === 'standard' ? mode : 'sparse';
}

export function trafficSeedFor(event, round) {
  if (round) return round.trafficSeed ?? (event.id + ':' + round.goAt);
  if (event?.seed) return event.seed;
  const variant = event?.variant
    ? `${event.variant.direction ?? 'forward'}:${event.variant.laps ?? 1}`
    : 'forward:1';
  const environment = event?.environment;
  const weather = environment?.weather ?? 'day';
  const wind = environment
    ? `${Number(environment.speed ?? 0).toFixed(1)}@${Number(environment.angle ?? 0).toFixed(3)}`
    : 'none';
  return [trafficRules.seedPrefix, trafficRules.seedVersion, event?.campus ?? 'unknown', event?.id ?? 'course', variant, weather, wind].join(':');
}

export function makeTrafficFormation(actors, mode, seed, spawn = null, countdown = 3, heading = null) {
  if (mode === 'off') return [];
  let hash = 2166136261;
  for (const ch of String(seed)) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  const random = randomSource(hash >>> 0);
  const parkPath = getCampusProvider('shunde')?.parkPath ?? null;
  const groups = new Map(), lineup = [];
  for (const actor of actors) {
    if (!groups.has(actor.path)) groups.set(actor.path, []);
    groups.get(actor.path).push(actor);
  }
  for (const [path, pool] of groups) {
    const park = Boolean(parkPath && path === parkPath);
    const { formation, reentryDistance = 0 } = pool[0];
    const cycle = path.length + reentryDistance;
    const cap = formation?.[mode] ?? (park ? (mode === 'standard' ? 5 : 3) : (mode === 'standard' ? 7 : 4));
    const count = Math.min(cap, pool.length);
    const speedByDirection = {
      1: pool[0].speed * (.86 + random() * .25),
      '-1': pool[0].speed * (.86 + random() * .25),
    };
    const placed = [];
    let busCount = 0;
    const firstDirection = random() < .5 ? -1 : 1;
    for (let i = 0; i < count; i++) {
      const pair = !formation && i % 3 === 1 && (mode === 'standard' || random() < .38);
      const leader = pair ? placed.at(-1) : null;
      const direction = leader?.direction ?? (i % 2 ? -firstDirection : firstDirection);
      const available = pool.filter(actor =>
        actor.direction === direction && (actor.kind !== 'bus' || busCount < londonTraffic.busesPerRoute));
      if (!available.length) continue;
      const pick = available[Math.floor(random() * available.length)];
      const speed = speedByDirection[direction];
      for (let tries = 0; tries < 30; tries++) {
        const ahead = leader && tries === 0 ? leader.start + direction * (park ? 29 : 22) : random() * cycle;
        const start = wrapDistance(ahead, cycle);
        const actor = { ...pick, direction, start, speed };
        if (placed.some(other => {
          if (direction !== other.direction) return false;
          const gap = Math.abs(start - other.start);
          return Math.min(gap, cycle - gap) < (formation?.gap ?? (park ? 27 : 20));
        })) continue;
        if (spawn) {
          let blocked = false;
          for (let t = -countdown; t <= 2; t += .25) {
            const pose = trafficPosition(actor, t);
            if (!pose) continue;
            const dx = pose.point[0] - spawn[0], dz = pose.point[2] - spawn[2];
            const range = Math.hypot(dx, dz);
            if (range < 28 + speed * .125 || (t === -countdown && formation && heading !== null &&
                range < formation.sightDistance && dx * Math.cos(heading) + dz * Math.sin(heading) > range * formation.sightDot)) {
              blocked = true;
              break;
            }
          }
          if (blocked) continue;
        }
        placed.push(actor);
        if (actor.kind === 'bus') busCount++;
        break;
      }
    }
    lineup.push(...placed);
  }
  return lineup;
}

export function trialTraffic(trial) {
  if ((trial.rideEnvironment || trial.phase !== 'free') && trial.raceTraffic) return trial.raceTraffic;
  const session = worldState.onlineRoom;
  const prefs = getPreferences();
  const mode = knownTraffic(session ? session.state.traffic : prefs?.traffic);
  const activeCampus = getActiveCampus();
  const revision = worldState.trafficSceneRevision;
  const cache = trial.freeTraffic;
  if (cache?.mode === mode && cache.campus === activeCampus && cache.revision === revision) return cache;
  return trial.freeTraffic = {
    mode, campus: activeCampus, revision,
    vehicles: makeTrafficFormation(cityVehicles, mode, 'free:' + activeCampus),
  };
}

export function stageRaceTraffic(trial, environment = null) {
  const session = worldState.onlineRoom;
  const prefs = getPreferences();
  const mode = environment?.trafficMode ?? knownTraffic(session ? session.state.traffic : prefs?.traffic);
  const seed = environment?.trafficSeed ?? trafficSeedFor(trial.event, session?.state.round);
  trial.trafficElapsed = 0;
  trial.raceTraffic = {
    mode, seed,
    vehicles: makeTrafficFormation(cityVehicles, mode, seed, trial.rider.position, trial.countdown, trial.rider.heading),
  };
}

export function raceTrafficTime(trial) {
  if (trial.phase === 'count') return -trial.countdown;
  return trial.phase === 'free' ? trial.freeClock : trial.trafficElapsed ?? 0;
}
