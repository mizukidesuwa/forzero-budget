import { ROAD_Y, clamp } from '../core/math.js';
import { getActiveCampus, getStorage, worldState } from '../core/state.js';
import { chaseRules } from '../data/modes.js';
import { replayAt } from '../replay/ghost.js';
import { nearestSafeRoad, rideElevation } from '../world/query.js';
import { courseIsLoop, courseVariantSuffix } from './course-variants.js';
import { knownAiDifficulty } from './rivals.js';

export function chaseCourseKey(event, vehicle = 'bike') {
  const base = event?.baseCourse ?? event;
  const campus = event?.campus ?? getActiveCampus();
  return `${campus}:${base?.id ?? 'route'}:${vehicle}` + courseVariantSuffix(event?.variant);
}

export function defaultChaseProgress() {
  return { wins: 0, attempts: 0, bestByKey: {} };
}

export function readChaseProgress() {
  try {
    const raw = JSON.parse(getStorage()?.getItem(chaseRules.storageKey));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaultChaseProgress();
    const bestByKey = {};
    if (raw.bestByKey && typeof raw.bestByKey === 'object' && !Array.isArray(raw.bestByKey)) {
      for (const [key, value] of Object.entries(raw.bestByKey)) {
        if (typeof key === 'string' && Number.isFinite(value) && value > 0) bestByKey[key] = value;
      }
    }
    return {
      wins: Number.isInteger(raw.wins) && raw.wins >= 0 ? raw.wins : 0,
      attempts: Number.isInteger(raw.attempts) && raw.attempts >= 0 ? raw.attempts : 0,
      bestByKey,
    };
  } catch {
    return defaultChaseProgress();
  }
}

export function saveChaseProgress(progress) {
  try { getStorage()?.setItem(chaseRules.storageKey, JSON.stringify(progress)); } catch {}
  worldState.hooks.scheduleSave?.();
}

export function sampleChaseRunner(event, record, runnerElapsedMs, campus = event?.campus ?? getActiveCampus()) {
  if (!record?.samples?.length) return null;
  const lapDuration = Math.max(1000, record.time ?? 1000);
  const looped = Boolean(event && courseIsLoop(event.baseCourse ?? event));
  const maxMs = looped ? lapDuration * chaseRules.loopLaps : lapDuration;
  const escaped = runnerElapsedMs >= maxMs;
  const lapTime = looped && !escaped ? runnerElapsedMs % lapDuration : Math.min(lapDuration, Math.max(0, runnerElapsedMs));
  const pose = replayAt(record, lapTime, campus);
  if (!pose) return null;
  return {
    ...pose,
    progressRatio: clamp(runnerElapsedMs / maxMs, 0, 1),
    escaped,
  };
}

/** Pure state machine for solo Shadow Chase mode across all 3 open campuses. */
export function createShadowChase() {
  return {
    phase: 'idle',
    event: null,
    campus: 'szu',
    vehicle: 'bike',
    difficulty: 'standard',
    rules: chaseRules.difficulties.standard,
    record: null,
    runnerProfile: null,
    unranked: false,
    headStartTotalSec: 0,
    headStartRemainingMs: 0,
    elapsedMs: 0,
    runnerElapsedMs: 0,
    nextPingAtMs: 0,
    runnerPose: null,
    lastPing: null,
    distance: Infinity,
    visible: false,
    proximity: 'far',
    isBest: false,
    bestMs: null,
    rejoinAtMs: -Infinity,
    progress: readChaseProgress(),

    get active() {
      return this.phase !== 'idle';
    },

    isRunning() {
      return this.phase === 'headstart' || this.phase === 'active';
    },

    refreshProgress() {
      this.progress = readChaseProgress();
      return this.progress;
    },

    refreshPing(landmarkAt = null) {
      if (!this.runnerPose) return null;
      const [px, , pz] = this.runnerPose.position;
      this.lastPing = {
        position: this.runnerPose.position.slice(),
        heading: this.runnerPose.heading,
        atMs: this.elapsedMs,
        landmark: landmarkAt ? landmarkAt(this.campus, px, pz) : null,
      };
      return this.lastPing;
    },

    start({
      event, vehicle = 'bike', difficulty = 'standard', reference,
      runnerProfile = null, unranked = false, campus = event?.campus ?? getActiveCampus(),
      landmarkAt = null,
    }) {
      if (!event || !reference?.samples?.length) return false;
      this.difficulty = knownAiDifficulty(difficulty);
      this.rules = chaseRules.difficulties[this.difficulty] ?? chaseRules.difficulties.standard;
      this.event = event;
      this.campus = campus;
      this.vehicle = vehicle;
      this.record = reference;
      this.runnerProfile = runnerProfile ?? { name: reference.kind ?? '逃跑影子', vehicle };
      this.unranked = Boolean(unranked);
      const totalSec = (reference.time ?? 60_000) / 1000;
      const leadSec = clamp(totalSec * this.rules.leadRatio, this.rules.leadMinSec, this.rules.leadMaxSec);
      this.headStartTotalSec = this.rules.countdownSec;
      this.headStartRemainingMs = this.headStartTotalSec * 1000;
      this.elapsedMs = 0;
      this.runnerElapsedMs = Math.min(Math.max(0, (reference.time ?? 60_000) * 0.28), leadSec * 1000);
      this.nextPingAtMs = this.rules.pingIntervalMs;
      this.distance = Infinity;
      this.visible = false;
      this.proximity = 'far';
      this.isBest = false;
      this.bestMs = this.progress.bestByKey[chaseCourseKey(event, vehicle)] ?? null;
      this.rejoinAtMs = -Infinity;
      this.runnerPose = sampleChaseRunner(event, reference, this.runnerElapsedMs, campus);
      this.refreshPing(landmarkAt);
      this.phase = 'headstart';
      return true;
    },

    stop() {
      this.phase = 'idle';
      this.runnerPose = null;
      this.lastPing = null;
      this.distance = Infinity;
      this.visible = false;
      this.proximity = 'far';
    },

    tick(dt, rider, { playSound = null, landmarkAt = null } = {}) {
      if (!this.isRunning() || !rider) return this.phase;
      const stepMs = Math.max(0, dt) * 1000;
      this.runnerElapsedMs += stepMs * this.rules.paceScale;
      this.runnerPose = sampleChaseRunner(this.event, this.record, this.runnerElapsedMs, this.campus);
      if (this.phase === 'headstart') {
        const beforeSec = Math.ceil(this.headStartRemainingMs / 1000);
        this.headStartRemainingMs = Math.max(0, this.headStartRemainingMs - stepMs);
        const afterSec = Math.ceil(this.headStartRemainingMs / 1000);
        if (this.headStartRemainingMs <= 0) {
          this.phase = 'active';
          this.elapsedMs = 0;
          this.nextPingAtMs = this.rules.pingIntervalMs;
          this.refreshPing(landmarkAt);
          playSound?.('go');
        } else if (afterSec < beforeSec && afterSec > 0) {
          playSound?.('countdown');
        }
        return this.phase;
      }

      this.elapsedMs += stepMs;
      if (!this.runnerPose) {
        this.finishEscaped(playSound);
        return this.phase;
      }
      const dx = this.runnerPose.position[0] - rider.position[0];
      const dz = this.runnerPose.position[2] - rider.position[2];
      const dy = Math.abs(this.runnerPose.position[1] - rider.position[1]);
      this.distance = Math.hypot(dx, dz);
      this.visible = this.distance <= this.rules.revealDistance;
      this.proximity = this.visible ? 'locked' : this.distance <= this.rules.terrorDistance ? 'near' : 'far';

      if (this.distance <= this.rules.catchDistance && dy <= this.rules.catchHeight) {
        this.finishCaught(playSound);
        return this.phase;
      }
      if (this.runnerPose.escaped) {
        this.finishEscaped(playSound);
        return this.phase;
      }
      if (this.elapsedMs >= this.nextPingAtMs) {
        this.refreshPing(landmarkAt);
        while (this.nextPingAtMs <= this.elapsedMs) this.nextPingAtMs += this.rules.pingIntervalMs;
        playSound?.('ping');
      }
      return this.phase;
    },

    finishCaught(playSound) {
      if (this.phase !== 'active') return;
      this.phase = 'caught';
      this.visible = true;
      playSound?.('catch');
      if (this.unranked) return;
      const key = chaseCourseKey(this.event, this.vehicle);
      const prev = this.progress.bestByKey[key];
      this.isBest = prev === undefined || this.elapsedMs < prev;
      if (this.isBest) this.progress.bestByKey[key] = this.elapsedMs;
      this.bestMs = this.progress.bestByKey[key];
      this.progress.wins += 1;
      this.progress.attempts += 1;
      saveChaseProgress(this.progress);
    },

    finishEscaped(playSound) {
      if (this.phase !== 'active') return;
      this.phase = 'escaped';
      this.visible = false;
      playSound?.('rejoin');
      if (this.unranked) return;
      this.progress.attempts += 1;
      saveChaseProgress(this.progress);
    },

    rejoin(rider, query = null, playSound = null) {
      if (this.phase !== 'active' || !rider) return false;
      const spot = query?.nearestSafeRoad
        ? query.nearestSafeRoad(rider.position[0], rider.position[2], this.campus)
        : nearestSafeRoad(rider.position[0], rider.position[2], this.campus);
      if (!spot) return false;
      const safe = spot.p ?? spot;
      const y = (query?.rideElevation ? query.rideElevation(safe[0], safe[2], this.campus) : rideElevation(safe[0], safe[2], this.campus)) + ROAD_Y;
      rider.position = [safe[0], y, safe[2]];
      if (Number.isFinite(spot.heading)) rider.heading = spot.heading;
      rider.speed = 0;
      rider.yawRate = 0;
      rider.throttle = 0;
      rider.brake = 0;
      this.elapsedMs += chaseRules.rejoinPenaltyMs;
      this.rejoinAtMs = this.elapsedMs;
      playSound?.('rejoin');
      return true;
    },

    visibleGhostPose() {
      if (this.phase !== 'active' || !this.visible || !this.runnerPose) return null;
      return {
        ...this.runnerPose,
        id: 'chase-runner',
        name: this.runnerProfile?.name ?? '逃跑影子',
        vehicle: this.vehicle,
        skin: this.runnerProfile?.skin ?? null,
      };
    },

    mapOverlay() {
      if (!this.isRunning() || !this.lastPing) return null;
      return {
        hideCourse: true,
        chasePing: {
          ...this.lastPing,
          ageMs: Math.max(0, this.elapsedMs - this.lastPing.atMs),
          fadeMs: chaseRules.pingFadeMs,
        },
      };
    },
  };
}

export const ShadowChase = createShadowChase();
