import { MAX_RUN_MS, REJOIN_MS, SAMPLE_MS } from '../core/clock.js';
import { clamp, dot, lerpPoint, mix, subtract } from '../core/math.js';
import { getActiveCampus, worldState } from '../core/state.js';
import { recordRules } from '../data/race.js';
import { readSeedCode } from '../race/seed-code.js';
import {
  bicycleAppearance, bicycleStyle, frameChoices, knownPaint, maxBikeSpeed,
  riderName, tyreChoices, vehicleChoices,
} from '../ride/vehicles.js';
import { onCampusGround, rideElevation } from '../world/query.js';

export const GHOST_FORMAT = 'litchi-ghost';
export const GHOST_VERSION = 1;
export const MAX_GHOST_BYTES = recordRules.maxBytes;
export const MAX_REPLAY_SAMPLES = 8200;

export function recordingRules(vehicle) {
  return {
    limit: vehicleChoices[vehicle].recordLimit ?? MAX_RUN_MS,
    interval: vehicleChoices[vehicle].recordInterval ?? SAMPLE_MS,
  };
}

export function crossesGate(gate, previous, next, margin = 0) {
  const a = dot(subtract(previous, gate.p), gate.f), b = dot(subtract(next, gate.p), gate.f);
  if (a > 0 || b <= 0) return null;
  const at = -a / (b - a), hit = lerpPoint(previous, next, at);
  if (gate.rise > .4 && Math.abs(hit[1] - gate.p[1] - gate.rise) > .85) return null;
  const offset = dot(subtract(hit, gate.p), gate.side);
  return offset >= (gate.minCross ?? -gate.half) - margin && offset <= (gate.maxCross ?? gate.half) + margin ? at : null;
}

export function packPose(t, r, heightAt = (x, z) => rideElevation(x, z)) {
  const q = (x, f) => Math.round(x * f) / f;
  return [
    q(t, 1000), q(r.position[0], 1000), q(r.position[1] - heightAt(r.position[0], r.position[2]), 1000), q(r.position[2], 1000),
    q(r.heading, 10000), q(r.speed, 1000), q(r.travel, 1000), q(r.steering, 1000),
  ];
}

export function replayAt(record, time, campus = getActiveCampus()) {
  if (!record || time < 0 || time > record.time + 1400) return null;
  const points = record.samples, t = clamp(time, 0, record.time);
  let lo = 0, hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] <= t) lo = mid;
    else hi = mid;
  }
  const a = points[lo], b = points[hi];
  const f = clamp((t - a[0]) / Math.max(.00001, b[0] - a[0]), 0, 1);
  const gap = Math.hypot(a[1] - b[1], a[3] - b[3]);
  const jump = gap > Math.max(18, (b[0] - a[0]) * .05) || gap > 1 && b[0] - a[0] >= REJOIN_MS - .01 && a[6] === b[6];
  const q = jump ? (f < 1 ? 0 : 1) : f;
  const angle = Math.atan2(Math.sin(b[4] - a[4]), Math.cos(b[4] - a[4]));
  return {
    position: onCampusGround([mix(a[1], b[1], q), mix(a[2], b[2], q), mix(a[3], b[3], q)], campus),
    heading: a[4] + angle * q, speed: mix(a[5], b[5], q), travel: mix(a[6], b[6], q), steering: mix(a[7], b[7], q),
  };
}

export function validReplay(record, gateCount) {
  return record && Number.isFinite(record.time) && record.time > 0 && Number.isSafeInteger(Math.ceil(record.time)) &&
    gateCount >= 2 && Array.isArray(record.splits) && record.splits.length === gateCount &&
    record.splits.every((time, i) => Number.isFinite(time) && time >= 0 && time <= record.time && (i === 0 || time > record.splits[i - 1])) &&
    Array.isArray(record.samples) && record.samples.length >= 2 && record.samples.length <= MAX_REPLAY_SAMPLES &&
    record.samples.every((sample, i) => Array.isArray(sample) && sample.length === 8 && sample.every(Number.isFinite) &&
      sample[0] >= 0 && sample[0] <= record.time + 1 && (i === 0 || sample[0] > record.samples[i - 1][0]));
}

export function referenceCornerScores(event, record, vehicle = 'bike') {
  const sampleGap = Math.max(300, recordingRules(vehicle).interval * 1.75);
  const locate = mark => {
    const i = event.gates.findIndex(gate => gate.distance >= mark.distance);
    const earliest = (record.splits[i - 1] ?? 0) - 350;
    const latest = record.splits[i] + 350;
    const samples = record.samples;
    for (let j = 1; j < samples.length; j++) {
      const a = samples[j - 1], b = samples[j];
      if (b[0] < earliest) continue;
      if (a[0] > latest) break;
      if (b[0] - a[0] > sampleGap || b[6] <= a[6]) continue;
      const fraction = crossesGate(mark, [a[1], a[2], a[3]], [b[1], b[2], b[3]]);
      if (fraction !== null) return { time: mix(a[0], b[0], fraction), speed: mix(a[5], b[5], fraction) };
    }
    return null;
  };
  return event.corners.map(corner => {
    const entry = locate(corner.entry), exit = locate(corner.exit);
    if (!exit) return null;
    return { speed: exit.speed, duration: entry && exit.time > entry.time ? exit.time - entry.time : null };
  });
}

export function validCornerScores(scores, count, total) {
  return Array.isArray(scores) && scores.length === count && scores.every(score => score === null ||
    (score && Number.isFinite(score.speed) && score.speed >= 0 && score.speed <= maxBikeSpeed + 1 &&
      (score.duration === null || Number.isFinite(score.duration) && score.duration > 0 && score.duration <= total)));
}

export function ghostCourseKey(event) {
  let hash = 2166136261;
  const addNumber = value => { hash = Math.imul(hash ^ Math.round(value * 100), 16777619); };
  addNumber(event.length);
  addNumber(event.path.rows.length);
  for (const { p: [x, , z] } of event.path.rows) { addNumber(x); addNumber(z); }
  for (const gate of event.gates) {
    for (const field of [gate.distance, gate.p[0], gate.p[2], gate.f[0], gate.f[2], gate.rise,
      gate.minCross ?? -gate.half, gate.maxCross ?? gate.half]) addNumber(field);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function makeGhostFile(event, run, profile) {
  if (run?.unranked) throw new GhostFileError('这场成绩仅用于娱乐或独立结算，无法导出官方影子。');
  const appearance = run.appearance ?? (run.vehicle === 'bike' && profile.look ? bicycleAppearance(profile, run.bike) : null);
  return {
    format: GHOST_FORMAT, version: GHOST_VERSION,
    course: { campus: event.campus, id: event.id, seed: event.seed ?? null, layout: ghostCourseKey(event) },
    rider: {
      name: riderName(profile.name), vehicle: run.vehicle, paint: knownPaint(appearance?.paint ?? profile.paint),
      ...(appearance ? { look: bicycleStyle(appearance.look), bike: { tyres: appearance.tyres, frame: appearance.frame } } : {}),
    },
    run: { time: run.time, splits: run.splits, samples: run.samples, corners: run.corners },
  };
}

export class GhostFileError extends Error {}

export function readGhostFile(text, coursesMap = worldState.coursesByCampus, campusesMap = worldState.campuses) {
  let file;
  try { file = JSON.parse(text); }
  catch { throw new GhostFileError('文件内容无法读取，请选择游戏导出的影子文件。'); }
  if (file?.format !== GHOST_FORMAT) throw new GhostFileError('请选择 FORZERO: BUDGET（或荔园环骑）导出的影子文件。');
  if (file.version !== GHOST_VERSION) throw new GhostFileError('这个影子文件需要兼容的游戏版本。');

  const { course, rider, run } = file;
  if (typeof course?.campus !== 'string' || !campusesMap || !Object.hasOwn(campusesMap, course.campus) ||
      typeof course.id !== 'string' || typeof course.layout !== 'string' || !/^[0-9a-f]{8}$/.test(course.layout)) {
    throw new GhostFileError('影子文件里的地图信息不完整。');
  }
  const { campus, id, seed } = course;
  const knownCourse = seed === null
    ? (coursesMap?.[campus] ?? []).some(event => event.id === id)
    : campus !== 'shunde' && typeof seed === 'string' && seed.length <= 15 && readSeedCode(seed, campus) === seed && id === 'seed-' + seed;
  if (!knownCourse) throw new GhostFileError('找不到影子文件指定的赛道或种子。');
  if (typeof rider?.name !== 'string' || rider.name.length > 48 ||
      typeof rider.vehicle !== 'string' || !Object.hasOwn(vehicleChoices, rider.vehicle) || !vehicleChoices[rider.vehicle].race) {
    throw new GhostFileError('影子文件里的骑手或车型信息无效。');
  }
  const bounds = campusesMap[campus]?.bounds;
  if (!bounds || !validReplay(run, run?.splits?.length) || run.samples[0][0] !== 0 ||
      Math.abs(run.samples.at(-1)[0] - run.time) > 1 ||
      Math.abs(run.splits.at(-1) - run.time) > 1 ||
      !run.samples.every(([, x, y, z, heading, speed, travel, steer]) =>
        x >= bounds.minX - 10 && x <= bounds.maxX + 10 && z >= bounds.minZ - 10 && z <= bounds.maxZ + 10 &&
        Math.abs(y) <= 40 && Math.abs(heading) <= Math.PI + .01 && Math.abs(speed) <= 50 &&
        Math.abs(travel) <= run.time * .05 + 10 && Math.abs(steer) <= 1.01)) {
    throw new GhostFileError('影子文件里的骑行轨迹或计时数据无效。');
  }
  return file;
}

export function loadFriendGhost({ course, rider, run }, activeCampus = getActiveCampus()) {
  const { campus, id, seed, layout } = course;
  const current = worldState.seedCourses?.[campus];
  const event = seed === null ? worldState.coursesByCampus?.[campus]?.find(item => item.id === id) :
    current?.seed === seed ? current : worldState.hooks.makeSeedCourse?.(seed, campus);
  if (!event || event.campus !== activeCampus || ghostCourseKey(event) !== layout || run.splits.length !== event.gates.length) {
    throw new GhostFileError('这个影子使用的赛道布局与当前游戏版本不同。');
  }
  const name = riderName(rider.name), vehicle = rider.vehicle;
  const corners = validCornerScores(run.corners, event.corners.length, run.time)
    ? run.corners : referenceCornerScores(event, run, vehicle);
  return {
    event,
    opponent: {
      name, vehicle, paint: typeof rider.paint === 'string' ? knownPaint(rider.paint) : 'classic',
      ...(vehicle === 'bike' && rider.look ? {
        look: bicycleStyle(rider.look),
        bike: {
          tyres: Object.hasOwn(tyreChoices, rider.bike?.tyres) ? rider.bike.tyres : 'stock',
          frame: Object.hasOwn(frameChoices, rider.bike?.frame) ? rider.bike.frame : 'stock',
        },
      } : {}),
      kind: name + '的影子', time: run.time, splits: run.splits, samples: run.samples, corners,
    },
  };
}

export const friendScoreKey = ['campus', 'courseId', 'layout', 'vehicle', 'name', 'time'];
let friendArchive;

export function openFriendArchive() {
  if (!friendArchive) {
    friendArchive = new Promise((resolve, reject) => {
      const request = indexedDB.open('szu-litchi-friends', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('scores', { keyPath: 'id', autoIncrement: true }).createIndex('result', friendScoreKey);
        db.createObjectStore('replays');
      };
      request.onerror = () => reject(request.error);
      let blocked = false;
      request.onblocked = () => {
        blocked = true;
        reject(new Error('The friend archive is blocked by another tab.'));
      };
      request.onsuccess = () => {
        const db = request.result;
        if (blocked) { db.close(); return; }
        db.onversionchange = () => {
          db.close();
          friendArchive = undefined;
        };
        resolve(db);
      };
    }).catch(error => {
      friendArchive = undefined;
      throw error;
    });
  }
  return friendArchive;
}

export async function friendArchiveTransaction(stores, mode, operate) {
  const db = await openFriendArchive();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(stores, mode);
    let result;
    transaction.oncomplete = () => resolve(result?.result);
    transaction.onabort = () => reject(transaction.error ?? new Error('The friend archive transaction was aborted.'));
    try { result = operate(transaction); }
    catch (error) {
      transaction.abort();
      reject(error);
    }
  });
}

export async function saveFriendGhost({ event, opponent }) {
  const { name, paint, corners } = opponent;
  const run = { ...opponent, corners: corners.map(score => score && { speed: score.speed, duration: score.duration }) };
  const ghost = makeGhostFile(event, run, { name, paint, look: opponent.look });
  const { campus, id: courseId, seed, layout } = ghost.course;
  const score = { campus, courseId, seed, layout, name: ghost.rider.name, vehicle: ghost.rider.vehicle, time: run.time };
  const replay = JSON.stringify(ghost);
  const result = await friendArchiveTransaction(['scores', 'replays'], 'readwrite', transaction => {
    const scores = transaction.objectStore('scores'), replays = transaction.objectStore('replays');
    const matches = scores.index('result').openKeyCursor(friendScoreKey.map(field => score[field]));
    matches.onsuccess = () => {
      const match = matches.result;
      if (!match) {
        const write = scores.add(score);
        write.onsuccess = () => replays.add(replay, write.result);
        return;
      }
      const existing = replays.get(match.primaryKey);
      existing.onsuccess = () => { if (existing.result !== replay) match.continue(); };
    };
  });
  worldState.hooks.scheduleSave?.();
  return result;
}

export function readFriendScores() {
  return friendArchiveTransaction('scores', 'readonly', transaction => transaction.objectStore('scores').getAll());
}

export function readSavedFriendGhost(id) {
  return friendArchiveTransaction('replays', 'readonly', transaction => transaction.objectStore('replays').get(id));
}

export async function removeSavedFriendGhost(id) {
  const result = await friendArchiveTransaction(['scores', 'replays'], 'readwrite', transaction => {
    transaction.objectStore('scores').delete(id);
    transaction.objectStore('replays').delete(id);
  });
  worldState.hooks.scheduleSave?.();
  return result;
}
