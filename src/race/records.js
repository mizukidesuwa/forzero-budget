import { ROAD_Y, add, clamp, cross, dot, lerpPoint, mix, scale } from '../core/math.js';
import { courseVariantSuffix } from './course-variants.js';
import { knownRaceEnvironmentKey, raceEnvironmentKey } from './environment-key.js';
import { Shape } from '../core/shape.js';
import { getStorage, worldState } from '../core/state.js';
import {
  crossesGate, packPose, recordingRules, referenceCornerScores, validCornerScores, validReplay,
} from '../replay/ghost.js';
import {
  MAX_ROAD_SPEED, bicycleGravelSpeed, bicyclePaints, stockBike, vehicleChoices,
} from '../ride/vehicles.js';
import {
  along, courseFrame, indexStreets, plannedSpeed, ribbon, streetCell, timingSpan, travelTable,
} from '../world/geometry.js';
import { courseGround, createWorldQuery, rideElevation, safeToRide, surfaceAt } from '../world/query.js';

import {
  CORNER_SPEED_LIMIT, MEDAL_LABELS, MEDAL_RANKS, benchmarkRules, recordRules,
} from '../data/race.js';

export { CORNER_SPEED_LIMIT, MEDAL_LABELS, MEDAL_RANKS } from '../data/race.js';

export function recordKey(event, vehicle = 'bike') {
  const key = event.campus === 'shunde'
    ? 'shunde-qingyun-1:' + event.id
    : event.seed
      ? 'seed-race:' + event.seed
      : event.campus === 'ucl'
        ? 'london-bloomsbury-2:' + event.id
        : event.id === 'ring'
          ? 'szu-yuehai-courses-4:ring'
          : 'szu-yuehai-long-courses-' + (event.revision ?? 5) + ':' + event.id;
  return key + (vehicle === 'bike' ? '' : ':' + vehicle) + courseVariantSuffix(event.variant);
}

const environmentRecordMarker = ':environment:';

/** An omitted environment addresses the historical, unscoped archive. @param {string | null} [environment] */
export function checkpointRecordKey(event, vehicle, environment = null) {
  const courseKey = 'checkpoints:' + recordKey(event, vehicle);
  return environment === null ? courseKey : courseKey + environmentRecordMarker + encodeURIComponent(environment);
}

/** @param {string} key @returns {string | null} */
export function checkpointRecordEnvironment(key) {
  if (!key.startsWith('checkpoints:')) return null;
  const marker = key.lastIndexOf(environmentRecordMarker);
  if (marker < 0) return null;
  const encoded = key.slice(marker + environmentRecordMarker.length);
  try {
    const environment = knownRaceEnvironmentKey(decodeURIComponent(encoded));
    return environment && encodeURIComponent(environment) === encoded ? environment : null;
  } catch { return null; }
}

export function brakingCorners(event) {
  const { raw, spacing } = event.plan;
  const zones = [];
  for (let i = 0; i < raw.length; i++) {
    const distance = i * spacing;
    const speed = raw[i];
    if (speed > CORNER_SPEED_LIMIT || distance < 4 || distance > event.length - 3) continue;
    const last = zones.at(-1);
    if (last && distance - last.end <= 10.6) {
      last.end = distance;
      last.speed = Math.min(last.speed, speed);
    } else zones.push({ start: distance, end: distance, speed });
  }
  const waypoint = distance => {
    const frame = courseFrame(event.path, distance);
    return { ...frame, distance, ...timingSpan(frame, event.cityAccess, event.path.width, 0, event.campus) };
  };
  let previousExit = 0;
  return zones.map((zone, index) => {
    const brakeDistance = clamp((MAX_ROAD_SPEED ** 2 - zone.speed ** 2) / (2 * 4.65), 4, 14);
    const entry = Math.max(previousExit + .45, zone.start - brakeDistance);
    const exit = Math.min(event.length - .8, zone.end + 5.4);
    const approach = Math.max(previousExit, entry - 6.1);
    previousExit = exit;
    return {
      index, approach, entry: waypoint(entry), exit: waypoint(exit), speed: zone.speed,
      holdUntil: zone.end + 2.1,
      station: event.gates.find(gate => gate.distance >= exit).name,
    };
  });
}

export function brakingPaint(event, from = 0, to = event.length) {
  const line = new Shape();
  const styles = {
    open: { width: .09, length: 1.25, color: '#a6e184' },
    lift: { width: .15, length: .92, color: '#ffd172' },
    brake: { width: .21, length: 1.65, color: '#ff8172' },
  };
  for (let d = Math.max(1.6, from); d < Math.min(event.length - 1.8, to); d += 2.28) {
    const corner = event.corners.find(c => d >= c.approach && d < c.holdUntil);
    const style = !corner ? styles.open : d < corner.entry.distance ? styles.lift : styles.brake;
    const end = Math.min(event.length - .6, d + style.length);
    const edge = style.width + .035;
    ribbon(line, event.path, -edge, edge, ROAD_Y + .018, '#324736', d, end);
    ribbon(line, event.path, -style.width, style.width, ROAD_Y + .020, style.color, d, end);
  }
  return line;
}

export function makeBenchmark(event, vehicle = 'bike', drive = null) {
  const samples = [], splits = [], dt = benchmarkRules.step, path = event.path;
  const tuning = drive ?? vehicleChoices[vehicle], cycling = vehicle === 'bike';
  const top = cycling ? (drive ? drive.roadSpeed * benchmarkRules.tunedBikeSpeedScale : benchmarkRules.stockBikeSpeed) : tuning.roadSpeed * benchmarkRules.poweredSpeedScale;
  const acceleration = cycling ? benchmarkRules.bikeAcceleration * (drive?.force ?? 1) : benchmarkRules.poweredAcceleration * tuning.force;
  const shunde = event.campus === 'shunde';
  const query = createWorldQuery(event.campus);
  const interval = recordingRules(vehicle).interval;
  const cornerPace = vehicle === 'trail' ? Math.sqrt(tuning.roadGrip / stockBike.roadGrip) : 1;
  let distance = -benchmarkRules.startOffset, speed = 0, time = 0, last = 0, gateIndex = 0;
  const pose = (at, velocity, t) => {
    const f = courseFrame(path, Math.max(0, at));
    const p = at < 0 ? add(event.gates[0].p, scale(event.gates[0].f, at)) : f.p;
    const next = courseFrame(path, Math.max(0, at) + 5).f;
    const turn = Math.atan2(cross(f.f, next)[1], dot(f.f, next));
    return packPose(t, {
      position: courseGround(event, add(p, scale(f.side, .92))), heading: Math.atan2(f.f[2], f.f[0]), speed: velocity,
      travel: at + benchmarkRules.startOffset, steering: clamp(-turn * 2.2, -.86, .86),
    }, query.rideElevation);
  };
  samples.push(pose(distance, speed, 0));
  while (distance < event.length) {
    const sample = event.elevation || event.flyover || shunde ? courseFrame(path, distance + 1.2) : null;
    const grade = shunde
      ? (query.rideElevation(sample.p[0] + sample.f[0] * .5, sample.p[2] + sample.f[2] * .5) -
        query.rideElevation(sample.p[0] - sample.f[0] * .5, sample.p[2] - sample.f[2] * .5))
      : sample ? query.riderGrade(courseGround(event, sample.p), Math.atan2(sample.f[2], sample.f[0])) : 0;
    const loose = shunde && !query.surfaceAt(sample.p[0], sample.p[2]);
    const surfaceTop = loose ? (cycling ? bicycleGravelSpeed(drive ?? stockBike) : tuning.gravelSpeed ?? Math.min(tuning.roadSpeed, tuning.grassSpeed * 1.18)) : top;
    const pace = Math.min(surfaceTop * (1 - clamp(grade * 1.45, 0, .23)), plannedSpeed(event, distance + 1.2) * .96 * cornerPace + .22);
    speed += clamp(pace - speed, -benchmarkRules.braking * dt, (acceleration - 9.81 * grade) * dt);
    const next = distance + speed * dt;
    while (event.gates[gateIndex] && event.gates[gateIndex].distance <= next) {
      const f = clamp((event.gates[gateIndex].distance - distance) / Math.max(.00001, next - distance), 0, 1);
      splits.push(time + f * dt * 1000); gateIndex++;
    }
    distance = next; time += dt * 1000;
    if (time - last >= interval && distance < event.length) {
      samples.push(pose(distance, speed, time)); last = time;
    }
  }
  time = splits.at(-1);
  samples.push(pose(event.length, 0, time));
  return { time, splits, samples, kind: '基准影子' };
}

/** @param {string | null} [environment] */
export function readRecord(event, key, vehicle = 'bike', environment = null) {
  try {
    const raw = getStorage()?.getItem(key);
    if (!raw || raw.length > recordRules.maxBytes) return null;
    const r = JSON.parse(raw);
    if (!validReplay(r, event.gates.length) || r.time <= recordRules.minTime || r.time > recordingRules(vehicle).limit) return null;
    if (environment !== null && (r.environment !== environment || r.vehicle !== vehicle || r.unranked || r.blind)) return null;
    const corners = validCornerScores(r.corners, event.corners.length, r.time)
      ? r.corners : referenceCornerScores(event, r, vehicle);
    return { ...r, corners, kind: '个人最佳影子' };
  } catch { return null; }
}

/** @param {string | null} [environment] */
export function loadBest(event, vehicle = 'bike', environment = null) {
  if (environment !== null) {
    if (!knownRaceEnvironmentKey(environment)) return null;
    return readRecord(event, checkpointRecordKey(event, vehicle, environment), vehicle, environment);
  }
  return readRecord(event, checkpointRecordKey(event, vehicle), vehicle) ??
    readRecord(event, recordKey(event, vehicle), vehicle) ??
    (vehicle === 'bike' && event.oldKey ? readRecord(event, event.oldKey) : null);
}

export function splitLabel(delta) {
  return Math.abs(delta) < 23 ? '与影子持平' : (delta < 0 ? '领先 ' : '落后 ') + (Math.abs(delta) / 1000).toFixed(2) + ' 秒';
}

const motorBenchmarks = new WeakMap();

export function vehicleBenchmark(event, vehicle) {
  if (vehicle === 'bike') return { run: event.benchmark, medals: event.medalTimes };
  let cache = motorBenchmarks.get(event);
  if (!cache) { cache = new Map(); motorBenchmarks.set(event, cache); }
  if (!cache.has(vehicle)) {
    const run = makeBenchmark(event, vehicle);
    run.corners = referenceCornerScores(event, run, vehicle);
    const medals = Object.fromEntries(recordRules.medalOrder.map((name, i) =>
      [name, Math.round(run.time * recordRules.poweredMedalScales[i] / 10) * 10]));
    cache.set(vehicle, { run, medals });
  }
  return cache.get(vehicle);
}

export function initCourseBenchmarks(courseList) {
  for (const event of courseList) {
    event.corners = brakingCorners(event);
    event.benchmark = makeBenchmark(event);
    event.benchmark.corners = referenceCornerScores(event, event.benchmark);
    event.medalTimes = Object.fromEntries(recordRules.medalOrder.map((m, i) =>
      [m, Math.round(event.benchmark.time * event.thresholds[i] / 10) * 10]));
  }
}

export function authorMedalTime(event, vehicle = 'bike') {
  const { medals } = vehicleBenchmark(event, vehicle);
  return Math.round(medals.gold * recordRules.authorScale / 10) * 10;
}

export function medalTier(event, ms, vehicle = 'bike') {
  if (!Number.isFinite(ms)) return '';
  const { medals } = vehicleBenchmark(event, vehicle);
  if (ms <= authorMedalTime(event, vehicle)) return 'author';
  if (ms <= medals.gold) return 'gold';
  if (ms <= medals.silver) return 'silver';
  if (ms <= medals.bronze) return 'bronze';
  return '';
}

export function medalName(event, ms, vehicle = 'bike') {
  return MEDAL_LABELS[medalTier(event, ms, vehicle)] ?? '';
}

export function trialMedal(trial) {
  return trial.unranked || trial.rivals?.length || trial.environmentKey !== raceEnvironmentKey(trial.event)
    ? '' : medalName(trial.event, trial.elapsed, trial.rider.vehicle);
}

export function bestCourseAchievement(event) {
  let bestTier = '';
  let bestBike = null;
  let primaryRun = null;
  const race = worldState.race;
  const environment = raceEnvironmentKey(event);
  for (const veh of ['bike', 'ebike', 'chair', 'trail']) {
    const key = checkpointRecordKey(event, veh, environment);
    const verified = race?.sessionRecords?.get(key) ?? loadBest(event, veh, environment);
    const historical = loadBest(event, veh);
    const verifiedTier = medalTier(event, verified?.time, veh);
    const historicalTier = medalTier(event, historical?.time, veh);
    const keepHistorical = MEDAL_RANKS[historicalTier] > MEDAL_RANKS[verifiedTier];
    const run = keepHistorical ? historical : verified ?? historical;
    if (!run) continue;
    if (veh === 'bike') bestBike = run;
    const tier = keepHistorical ? historicalTier : verifiedTier;
    if (MEDAL_RANKS[tier] > MEDAL_RANKS[bestTier] || (!primaryRun && !bestTier)) {
      bestTier = tier;
      primaryRun = run;
    } else if (MEDAL_RANKS[tier] === MEDAL_RANKS[bestTier] && tier && primaryRun && run.time < primaryRun.time) {
      primaryRun = run;
    }
  }
  const displayRun = bestBike ?? primaryRun;
  return {
    tier: bestTier,
    label: MEDAL_LABELS[bestTier] ?? '',
    time: displayRun?.time ?? null,
    authorMs: authorMedalTime(event, 'bike'),
    goldMs: event.medalTimes.gold,
  };
}

export function courseMedalSummary(coursesMap = worldState.coursesByCampus) {
  const rows = { szu: [], ucl: [], shunde: [] };
  let total = 0, cleared = 0, bronzePlus = 0, silverPlus = 0, goldPlus = 0, authorCount = 0;
  for (const campus of Object.keys(rows)) {
    for (const event of coursesMap?.[campus] ?? []) {
      total++;
      const res = bestCourseAchievement(event);
      if (res.time !== null) cleared++;
      const rank = MEDAL_RANKS[res.tier];
      if (rank >= 1) bronzePlus++;
      if (rank >= 2) silverPlus++;
      if (rank >= 3) goldPlus++;
      if (rank >= 4) authorCount++;
      rows[campus].push({ event, ...res });
    }
  }
  return { total, cleared, bronzePlus, silverPlus, goldPlus, authorCount, rows };
}

export function isPaintUnlocked(paintId, summary = null) {
  const paint = bicyclePaints?.[paintId];
  if (!paint?.unlock) return true;
  const stats = summary ?? courseMedalSummary();
  if (paintId === 'amethyst') return stats.goldPlus >= 6 || stats.authorCount >= 1;
  if (paintId === 'obsidian') return stats.authorCount >= 1;
  return true;
}

const courseGuideIndexes = new WeakMap();

export function guideProgressAt(event, position, heading, previousDistance, nextGate) {
  const radius = event.cityAccess ? 15 : 8.5;
  let guide = courseGuideIndexes.get(event);
  if (!guide) {
    const finish = event.gates.at(-1);
    const rows = event.markers.at(-1).distance < finish.distance
      ? [...event.markers, finish] : event.markers;
    guide = indexStreets([{ rows, width: radius }]);
    courseGuideIndexes.set(event, guide);
  }

  const [x, y, z] = position, hx = Math.cos(heading), hz = Math.sin(heading);
  const rise = event.flyover ? y - rideElevation(x, z, event.campus) - ROAD_Y : 0;
  const from = event.gates[nextGate - 1]?.distance ?? 0;
  const to = event.gates[nextGate].distance;
  let best = Infinity, progress = null;
  for (const segment of guide.get(streetCell(x, z)) ?? []) {
    const { dx, dz, ratio, path, row } = segment;
    const a = path.rows[row - 1], b = path.rows[row];
    if (b.distance < from || a.distance > to) continue;
    const span = b.distance - a.distance;
    const first = Math.max(0, (from - a.distance) / span);
    const last = Math.min(1, (to - a.distance) / span);
    const ox = x - segment.x, oz = z - segment.z;
    const t = clamp((ox * dx + oz * dz) * ratio, first, last);
    const gap = (ox - dx * t) ** 2 + (oz - dz * t) ** 2;
    if (gap > radius ** 2) continue;
    if (event.flyover && Math.abs(rise - mix(a.rise, b.rise, t)) > 1.25) continue;
    const distance = mix(a.distance, b.distance, t);
    const alignment = (hx * dx + hz * dz) * Math.sqrt(ratio);
    const score = gap + 17 * (1 - alignment) + Math.min(28, ((distance - previousDistance) / 12) ** 2);
    if (score < best) {
      best = score;
      progress = distance;
    }
  }
  return progress;
}

export function crossesRaceLine(gate, previous, position, flyover) {
  const margin = gate.rise > .4 ? .6 : 1.6;
  const dx = position[0] - gate.p[0], dz = position[2] - gate.p[2];
  if (dx * dx + dz * dz > (gate.half + margin + .35) ** 2) return null;
  const crossed = crossesGate(gate, previous, position, margin);
  if (crossed === null || !flyover) return crossed;
  const [x, y, z] = lerpPoint(previous, position, crossed);
  return Math.abs(y - rideElevation(x, z) - ROAD_Y - gate.rise) <= .95 ? crossed : null;
}

function sampleTravelAtTime(samples, time) {
  let lo = 0, hi = samples.length - 1;
  if (time <= samples[0][0]) return { idx: 0, travel: samples[0][6] };
  if (time >= samples[hi][0]) return { idx: hi, travel: samples[hi][6] };
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid][0] <= time) lo = mid;
    else hi = mid;
  }
  const a = samples[lo], b = samples[hi];
  const f = clamp((time - a[0]) / Math.max(1e-5, b[0] - a[0]), 0, 1);
  return { idx: lo, travel: mix(a[6], b[6], f) };
}

function sampleTimeAtTravel(samples, targetTravel, loIdx, hiIdx) {
  let lo = loIdx, hi = hiIdx;
  if (targetTravel <= samples[lo][6]) return samples[lo][0];
  if (targetTravel >= samples[hi][6]) return samples[hi][0];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid][6] <= targetTravel) lo = mid;
    else hi = mid;
  }
  const a = samples[lo], b = samples[hi];
  const f = clamp((targetTravel - a[6]) / Math.max(1e-5, b[6] - a[6]), 0, 1);
  return mix(a[0], b[0], f);
}

export function liveDeltaMs(raceObj) {
  if (!raceObj || raceObj.phase !== 'race') return null;
  const gates = raceObj.event?.gates;
  const refSplits = raceObj.reference?.splits;
  const next = raceObj.nextGate;
  if (!gates || !refSplits || next <= 0 || next >= gates.length) return null;
  const prevGate = gates[next - 1], nextGate = gates[next];
  const refPrev = refSplits[prevGate.index], refNext = refSplits[nextGate.index];
  if (!Number.isFinite(refPrev) || !Number.isFinite(refNext) || refNext <= refPrev) return null;
  const span = Math.max(1, nextGate.distance - prevGate.distance);
  const frac = clamp((raceObj.progressEstimate - prevGate.distance) / span, 0, 1);
  let refTime = mix(refPrev, refNext, frac);
  const samples = raceObj.reference?.samples;
  if (Array.isArray(samples) && samples.length >= 2) {
    const start = sampleTravelAtTime(samples, refPrev);
    const end = sampleTravelAtTime(samples, refNext);
    const hiIdx = Math.min(samples.length - 1, end.idx + 1);
    if (end.travel > start.travel + 0.5 && hiIdx > start.idx) {
      const targetTravel = mix(start.travel, end.travel, frac);
      refTime = clamp(sampleTimeAtTravel(samples, targetTravel, start.idx, hiIdx), refPrev, refNext);
    }
  }
  const practiceOffset = (raceObj.practice?.fromGate > 0) ? (refSplits[raceObj.practice.fromGate] ?? 0) : 0;
  return raceObj.elapsed - (refTime - practiceOffset);
}

export function rideableCut(start, end, distance, cityAccess = false, campus = 'szu') {
  const steps = Math.ceil(distance / .82);
  let totalVerge = 0, consecutiveVerge = 0;
  for (let i = 0; i <= steps; i++) {
    const [x, , z] = lerpPoint(start, end, i / steps);
    if (!safeToRide(x, z, cityAccess, false, campus)) return false;
    if (surfaceAt(x, z, cityAccess, campus)) consecutiveVerge = 0;
    else {
      totalVerge += distance / steps;
      consecutiveVerge += distance / steps;
      if (consecutiveVerge > 3.4 || totalVerge > Math.min(5, distance * .32)) return false;
    }
  }
  return true;
}

export function buildCornerCuts(event) {
  const cuts = [];
  const spacing = event.markerStep * .5;
  for (const bend of event.corners) {
    const first = Math.max(.5, bend.approach - spacing);
    const last = Math.min(event.length - 1, bend.exit.distance + 11);
    for (let from = first; from <= bend.holdUntil - 2; from += spacing) {
      const start = along(event.path, from);
      const gateIndex = event.gates.findIndex(gate => gate.distance > from);
      for (let to = from + 4 * spacing; to <= Math.min(last, from + (event.campus === 'ucl' ? 48 : 40)); to += spacing) {
        const end = along(event.path, to);
        const direct = Math.hypot(end[0] - start[0], end[2] - start[2]);
        const saved = to - from - direct;
        if (direct < 4 || saved < Math.min(2.65, (to - from) * .075)) continue;
        const gate = event.gates[gateIndex];
        const crossesCheckpoint = to >= gate.distance;
        if (crossesCheckpoint &&
            (to >= event.gates[gateIndex + 1].distance || crossesGate(gate, start, end) === null)) continue;
        if (!rideableCut(start, end, direct, event.cityAccess, event.campus)) continue;
        cuts.push({ from, to, path: travelTable([start, end], 2.4) });
      }
    }
  }
  return cuts;
}
