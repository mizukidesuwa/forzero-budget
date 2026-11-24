import { add, clamp, mix, scale } from '../core/math.js';
import { worldState } from '../core/state.js';
import { packPose, replayAt } from '../replay/ghost.js';
import { courseFrame } from '../world/geometry.js';
import { courseGround, safeToRide } from '../world/query.js';
import { makeBenchmark, vehicleBenchmark } from './records.js';

import { benchmarkRules, draftingRules, rivalDrivers, rivalRules, rivalStartProtection } from '../data/race.js';

export { rivalDrivers, rivalStartProtection } from '../data/race.js';
export const knownRaceMode = value => value === 'team' || value === 'duel' ? value : 'solo';

export function draftingFrom(rider, others) {
  if (rider.speed < draftingRules.minSpeed) return false;
  const [rx, ry, rz] = rider.position, hx = Math.cos(rider.heading), hz = Math.sin(rider.heading);
  return others.some(other => {
    if (!other || other.speed < draftingRules.minLeaderSpeed || Math.abs(other.position[1] - ry) > draftingRules.maxHeight) return false;
    const dx = other.position[0] - rx, dz = other.position[2] - rz, ahead = dx * hx + dz * hz;
    return ahead >= draftingRules.minGap && ahead <= draftingRules.maxGap && Math.abs(dx * hz - dz * hx) < draftingRules.maxSide && Math.cos(rider.heading - other.heading) > draftingRules.minHeadingDot;
  });
}

export function prepareRivals(trial) {
  const mode = knownRaceMode(trial.raceMode);
  if (mode === 'solo' || trial.online || trial.opponent || trial.practice) return [];
  const vehicle = trial.rider.vehicle;
  const drive = vehicle === 'bike' ? trial.rider.bike : trial.rider.tuning;
  const run = drive && !drive.illegal ? makeBenchmark(trial.event, vehicle, drive) : vehicleBenchmark(trial.event, vehicle).run;
  const roster = mode === 'duel' ? [{ ...rivalDrivers[1], ...rivalRules.duel }] : rivalDrivers;
  return roster.map((driver, i) => ({
    ...driver, id: 'rival-' + i, vehicle, run, clock: 0, progress: -benchmarkRules.startOffset, place: i, nextGate: 0, splits: [], samples: [],
    gridGap: (i + 1) * rivalRules.gridGap, reaction: rivalRules.reaction + i * rivalRules.reactionSpacing,
    lanePosition: driver.lane, pose: null, finished: null,
  }));
}

export function rivalPose(event, actor) {
  const step = replayAt(actor.run, actor.clock, event.campus);
  const mergeStart = Math.min(20, event.length * .18);
  const merge = clamp((step.travel - mergeStart) / Math.max(1, Math.min(90, event.length - mergeStart)), 0, 1);
  const progress = step.travel - benchmarkRules.startOffset - actor.gridGap * (1 - merge);
  const frame = courseFrame(event.path, Math.max(0, progress));
  const base = progress < 0 ? add(event.gates[0].p, scale(event.gates[0].f, progress)) : frame.p;
  const shifted = add(base, scale(frame.side, actor.lanePosition));
  const offsetSafe = safeToRide(shifted[0], shifted[2], event.campus === 'szu', false, event.campus);
  return {
    id: actor.id, name: actor.name, vehicle: actor.vehicle,
    position: courseGround(event, offsetSafe ? shifted : base),
    progress, heading: step.heading, travel: step.travel + actor.gridGap * merge, steering: step.steering,
    nominalSpeed: step.speed, side: frame.side, speed: 0,
  };
}

export function rivalPlayerAhead(pose, rider) {
  const [x, y, z] = rider.position;
  const dx = x - pose.position[0], dz = z - pose.position[2];
  if (Math.abs(y - pose.position[1]) > rivalRules.maxHeight || Math.cos(pose.heading - rider.heading) < rivalRules.headingDot) return null;
  const gap = dx * Math.cos(pose.heading) + dz * Math.sin(pose.heading);
  const side = dx * pose.side[0] + dz * pose.side[2];
  return gap >= rivalRules.minFollowGap && gap < rivalRules.maxFollowGap && Math.abs(side) < rivalRules.maxFollowSide ? { gap, side } : null;
}

export function rivalYieldsContact(pose, rider, x, z) {
  if (!pose.rival) return false;
  if (pose.startProtected) return true;
  const ahead = (x - pose.position[0]) * Math.cos(pose.heading) + (z - pose.position[2]) * Math.sin(pose.heading);
  return ahead > rivalRules.yieldGap && Math.cos(rider.heading - pose.heading) > rivalRules.headingDot;
}

export function stepRivals(trial, dt) {
  const rivals = trial.rivals;
  if (!rivals?.length) return;
  const poses = rivals.map(actor => actor.pose);
  const sinceGo = trial.trafficElapsed ?? 0;
  for (const [i, actor] of rivals.entries()) {
    if (actor.finished !== null) continue;
    const old = actor.pose;
    if (old) {
      const others = poses.filter((_, j) => i !== j);
      const drafting = draftingFrom(old, [trial.rider, ...others]);
      const turn = Math.min(1, Math.abs(old.steering));
      const crowded = others.some(other => other && Math.abs(other.progress - old.progress) < 2.2 &&
        Math.hypot(other.position[0] - old.position[0], other.position[2] - old.position[2]) < 1.15);
      const player = rivalPlayerAhead(old, trial.rider);
      const passOffset = player ? (player.side >= 0 ? -1.5 : 1.5) : crowded ? (actor.place % 2 ? -.55 : .55) : 0;
      const desired = clamp(actor.lane + passOffset, -1.65, 1.65) * (1 - turn * .42);
      actor.lanePosition = mix(actor.lanePosition, desired, 1 - Math.exp(-3 * dt));
      const pace = actor.pace + actor.corner * turn + (drafting ? rivalRules.draftPace : 0);
      const launchPace = mix(rivalRules.launchPace, pace, clamp((sinceGo - actor.reaction) / rivalStartProtection, 0, 1));
      const followSpeed = Math.max(0, trial.rider.speed) + Math.max(0, (player?.gap ?? 0) - rivalRules.followGap) * rivalRules.followGain;
      const rate = player ? Math.min(launchPace, followSpeed / Math.max(1, old.nominalSpeed)) : launchPace;
      if (sinceGo > actor.reaction) actor.clock = Math.min(actor.run.time, actor.clock + dt * 1000 * rate);
    }
    const pose = actor.pose = rivalPose(trial.event, actor);
    pose.rival = true;
    pose.startProtected = sinceGo < rivalStartProtection;
    if (old && dt > 0 && actor.clock < actor.run.time) pose.speed = Math.max(0, (pose.progress - old.progress) / dt);
    actor.progress = pose.progress;
    const time = trial.elapsed + dt * 1000;
    while (trial.event.gates[actor.nextGate]?.distance <= actor.progress + .002) actor.splits[actor.nextGate++] = time;
    if (actor.clock >= actor.run.time) actor.finished = time;
    if (!actor.samples.length || time - actor.samples.at(-1)[0] >= 100 || actor.finished !== null) {
      actor.samples.push(packPose(actor.samples.length ? time : 0, pose));
    }
  }
  trial.rider.rivalPoses = rivals.filter(actor => actor.finished === null).map(actor => actor.pose);
}

export function aiRank(trial) {
  if (!trial.rivals?.length) return null;
  const done = trial.phase === 'done';
  const progress = trial.nextGate === 0 ? -benchmarkRules.startOffset : trial.progressEstimate;
  const ahead = trial.rivals.filter(actor => actor.finished !== null
    ? !done || actor.finished < trial.elapsed : !done && actor.progress > progress).length;
  return { rank: 1 + ahead, total: 1 + trial.rivals.length };
}

export function rivalComparison(trial) {
  const rival = trial.rivals?.reduce((best, x) => !best || x.progress > best.progress ||
    (x.finished !== null && (best.finished === null || x.finished < best.finished)) ? x : best, null);
  if (!rival || rival.samples.length < 2) return null;
  return { name: rival.name, kind: rival.name, samples: rival.samples, splits: rival.splits, time: rival.samples.at(-1)[0] };
}
