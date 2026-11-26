import { add, clamp, mix, scale } from '../core/math.js';
import { packPose, replayAt } from '../replay/ghost.js';
import { courseFrame } from '../world/geometry.js';
import { courseGround, safeToRide } from '../world/query.js';
import { vehicleBenchmark } from './records.js';

import { rivalPaceProfile } from './rival-pace.js';
import { findWake } from '../ride/drafting.js';
import { benchmarkRules, rivalDrivers, rivalRules, rivalStartProtection } from '../data/race.js';

export { rivalDrivers, rivalStartProtection } from '../data/race.js';
export const knownRaceMode = value => value === 'team' || value === 'duel' ? value : 'solo';

export const knownAiDifficulty = value => value === 'strong' ? 'strong' : 'standard';

export function draftingFrom(rider, others) {
  return Boolean(findWake(rider, others));
}

export function prepareRivals(trial) {
  const mode = knownRaceMode(trial.raceMode);
  if (mode === 'solo' || trial.online || trial.opponent || trial.practice) return [];
  const vehicle = trial.rider.vehicle;
  const { run, medals } = vehicleBenchmark(trial.event, vehicle);
  const difficultyName = knownAiDifficulty(trial.aiDifficulty);
  const difficulty = rivalRules.difficulty[difficultyName];
  const behavior = rivalRules.behavior[difficultyName] ?? rivalRules.behavior.standard;
  const roster = mode === 'duel' ? [{ ...rivalDrivers[0], ...rivalRules.duel }] : rivalDrivers;
  return roster.map((driver, i) => {
    const reaction = rivalRules.reaction + i * rivalRules.reactionSpacing;
    const target = medals.gold * difficulty * driver.target;
    return {
      ...driver, id: 'rival-' + i, vehicle, clock: 0, place: i, nextGate: 0, splits: [], samples: [],
      run: rivalPaceProfile(trial.event, run, vehicle, target - reaction * 1000, difficultyName, i),
      target, reaction, gridLead: mode === 'duel' ? rivalRules.duelLead : rivalRules.gridLead[i],
      behavior, lineBias: behavior.laneBias * (i % 2 ? -1 : 1),
      progress: -benchmarkRules.startOffset, lanePosition: driver.lane, pose: null, finished: null,
    };
  });
}

export function rivalPose(event, actor) {
  const step = replayAt(actor.run, actor.clock, event.campus);
  const merge = clamp(step.travel / rivalRules.gridMerge, 0, 1);
  const progress = step.travel - benchmarkRules.startOffset + actor.gridLead * (1 - merge);
  const frame = courseFrame(event.path, Math.max(0, progress));
  const base = progress < 0 ? add(event.gates[0].p, scale(event.gates[0].f, progress)) : frame.p;
  const line = (actor.lineBias ?? 0) + (actor.behavior?.lineResponse ?? 0) * clamp(step.steering, -1, 1);
  const shifted = add(base, scale(frame.side, actor.lanePosition + line));
  const offsetSafe = safeToRide(shifted[0], shifted[2], event.campus === 'szu', false, event.campus);
  return {
    id: actor.id, name: actor.name, vehicle: actor.vehicle,
    position: courseGround(event, offsetSafe ? shifted : base),
    progress, heading: step.heading, travel: step.travel - actor.gridLead * merge,
    steering: step.steering, nominalSpeed: step.speed, side: frame.side, speed: 0,
    skill: actor.run.bursts.some(({ start, end }) => actor.clock >= start && actor.clock < end) ? actor.run.skill : '',
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
      const turn = Math.min(1, Math.abs(old.steering));
      const crowded = others.some(other => other && Math.abs(other.progress - old.progress) < 2.2 &&
        Math.hypot(other.position[0] - old.position[0], other.position[2] - old.position[2]) < 1.15);
      const player = rivalPlayerAhead(old, trial.rider);
      const passOffset = player ? (player.side >= 0 ? -1.5 : 1.5) : crowded ? (actor.place % 2 ? -.55 : .55) : 0;
      const desired = clamp(actor.lane + passOffset, -1.65, 1.65) * (1 - turn * .42);
      actor.lanePosition = mix(actor.lanePosition, desired, 1 - Math.exp(-3 * dt));
      const followGain = actor.behavior?.followGain ?? rivalRules.followGain;
      const followSpeed = Math.max(0, trial.rider.speed) + Math.max(0, (player?.gap ?? 0) - rivalRules.followGap) * followGain;
      const rate = player ? Math.min(1, followSpeed / Math.max(1, old.speed)) : 1;
      const activeTime = clamp(sinceGo - actor.reaction, 0, dt);
      actor.clock = Math.min(actor.run.time, actor.clock + activeTime * 1000 * rate);
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
