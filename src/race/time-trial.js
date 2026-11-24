import { COUNTDOWN_TICKS, PHYSICS_STEP, REJOIN_MS, STEP_MS } from '../core/clock.js';
import { mix } from '../core/math.js';
import { getActiveCampus, getStorage, worldState } from '../core/state.js';
import { MAX_REPLAY_SAMPLES, crossesGate, packPose, recordingRules, replayAt } from '../replay/ghost.js';
import { soloBudget } from '../ride/budget.js';
import { makeCyclist, moveCyclist } from '../ride/physics.js';
import { bicycleAppearance, buildVehicleTuning, knownVehicle, stockBike, vehicleChoices } from '../ride/vehicles.js';
import { activeWind } from '../world/environment.js';
import { courseFrame, plannedSpeed } from '../world/geometry.js';
import { courseGround, nearestSafeRoad, surfaceAt, surfaceKindAt } from '../world/query.js';
import { raceTrafficTime, stageRaceTraffic, trialTraffic } from '../world/traffic.js';
import {
  checkpointRecordKey, crossesRaceLine, guideProgressAt, loadBest, vehicleBenchmark,
} from './records.js';
import { recordAiWin } from './ai-results.js';
import { prepareRivals, rivalComparison, stepRivals } from './rivals.js';

export class TimeTrial {
  constructor(event, bike = stockBike, vehicle = 'bike', worldQuery = null) {
    this.bike = bike;
    this.vehicle = knownVehicle(vehicle);
    this.worldQuery = worldQuery;
    this.sessionRecords = new Map();
    this.practiceBest = new Map();
    this.practice = null;
    this.freeClock = 0;
    this.rejoinReason = null;
    this.freeHazardNotice = null;
    this.extraOpponents = [];
    this.select(event);
  }

  select(event, opponent = null, extraOpponents = []) {
    this.practice = null;
    this.event = event;
    this.opponent = opponent;
    this.extraOpponents = Array.isArray(extraOpponents) ? extraOpponents.slice(0, 2) : [];
    this.abandon();
  }

  get entryVehicle() {
    return this.opponent?.vehicle ?? (vehicleChoices[this.vehicle].race ? this.vehicle : 'bike');
  }

  setVehicle(vehicle) {
    if (this.opponent || this.phase === 'race' || this.phase === 'count' || !Object.hasOwn(vehicleChoices, vehicle)) return false;
    if (this.vehicle !== vehicle) {
      this.vehicle = vehicle;
      this.freeRide();
      if (worldState.race && this === worldState.race) worldState.hooks.refreshBicycleModels?.();
    }
    return true;
  }

  get ghost() { return this.phase === 'race' ? replayAt(this.reference, this.elapsed) : null; }

  get extraGhosts() {
    if (this.phase !== 'race' || !this.extraOpponents.length) return [];
    const list = [];
    for (let i = 0; i < this.extraOpponents.length; i++) {
      const op = this.extraOpponents[i];
      const pose = replayAt(op, this.elapsed);
      if (pose) list.push({ ...pose, id: 'extra-' + i, name: op.name, vehicle: op.vehicle });
    }
    return list;
  }

  get lastGap() {
    const i = this.splits.length - 1;
    return i < 0 ? null : this.splits[i] - this.reference.splits[i];
  }

  get progressEstimate() { return this.routeAnchor; }

  setBike(bike) {
    if (this.phase === 'race' || this.phase === 'count') return false;
    this.bike = this.rider.bike = bike;
    return true;
  }

  sector(index, from = index - 1, name = index === 0 ? '起步' : this.event.gates[index]?.name) {
    const end = this.splits[index];
    if (end === undefined) return null;
    const duration = end - (this.splits[from] ?? 0);
    const target = this.reference.splits[index] - (this.reference.splits[from] ?? 0);
    return { duration, delta: duration - target, name };
  }

  stageSector(stage) {
    return this.sector(stage.finishGate, stage.index ? stage.startGate : -1, stage.name);
  }

  startPractice(fromGate, toGate) {
    const budget = soloBudget(this);
    if (budget.over) return false;
    this.freeRide();
    this.unranked = budget.illegal;
    const gates = this.event.gates;
    const startGate = gates[fromGate], endGate = gates[toGate];
    const entry = this.entryVehicle;
    const drive = entry === 'bike' ? this.bike : buildVehicleTuning(entry, worldState.vehicleTunings?.[entry]);
    const entrySpeed = fromGate > 0 ? Math.min(drive.roadSpeed * .86, plannedSpeed(this.event, startGate.distance) * .80) : 0;
    this.practice = {
      fromGate, toGate, entrySpeed,
      key: `${checkpointRecordKey(this.event, entry)}:sector:${fromGate}-${toGate}`,
      name: `${startGate.name} → ${endGate.name}`,
    };
    const campus = this.worldQuery?.campus ?? getActiveCampus();
    this.rider = makeCyclist(this.event, this.bike, entry, null, this.worldQuery);
    if (fromGate > 0) {
      const frame = courseFrame(this.event.path, startGate.distance);
      this.rider.position = courseGround(this.event, frame.p, startGate.rise);
      this.rider.heading = Math.atan2(frame.f[2], frame.f[0]);
      this.rider.paved = this.worldQuery
        ? this.worldQuery.surfaceAt(this.rider.position[0], this.rider.position[2], campus === 'szu')
        : surfaceAt(this.rider.position[0], this.rider.position[2], campus === 'szu', campus);
    }
    this.nextGate = fromGate + 1;
    this.routeAnchor = startGate.distance;
    this.phase = 'count';
    this.countdownTicks = Math.round(COUNTDOWN_TICKS * .5);
    this.countdown = this.countdownTicks * PHYSICS_STEP;
    stageRaceTraffic(this);
    this.frames = [packPose(0, this.rider)];
    this.replayInterval = this.recordRules.interval;
    this.nextRecording = this.replayInterval;
  }

  start() {
    const build = worldState.hooks.onlineRoundBuild?.() ?? null;
    const budget = build ?? soloBudget(this);
    if (budget.over) return false;
    this.practice = null;
    this.freeRide();
    this.unranked = budget.illegal;
    this.rider = makeCyclist(this.event, build?.bike ?? this.bike, build?.vehicle ?? this.entryVehicle, build?.tuning, this.worldQuery);
    this.phase = 'count';
    this.countdownTicks = COUNTDOWN_TICKS;
    this.countdown = this.countdownTicks * PHYSICS_STEP;
    stageRaceTraffic(this);
    this.rivals = prepareRivals(this);
    stepRivals(this, 0);
    this.frames = [packPose(0, this.rider)];
    this.replayInterval = this.recordRules.interval;
    this.nextRecording = this.replayInterval;
  }

  freeRide() {
    this.unranked = false;
    this.rivals = [];
    this.rider.rivalPoses = [];
    this.rider.draft = null;
    this.rider.drafting = false;
    this.aiWinCount = null;
    const vehicle = this.opponent?.vehicle ?? this.vehicle;
    if (this.rider.vehicle !== vehicle) {
      const { position, heading, paved } = this.rider;
      this.rider = { ...makeCyclist(this.event, this.bike, vehicle, null, this.worldQuery), position, heading, paved };
    }
    const entry = this.entryVehicle;
    const key = checkpointRecordKey(this.event, entry);
    const { run, medals } = vehicleBenchmark(this.event, entry);
    this.recordRules = recordingRules(entry);
    this.bestRun = this.sessionRecords.get(key) ?? loadBest(this.event, entry);
    this.best = this.bestRun?.time ?? null;
    this.medalTimes = medals;
    this.phase = 'free';
    this.elapsed = 0;
    this.nextGate = 0;
    this.routeAnchor = 0;
    this.countdown = this.countdownTicks = this.accumulator = 0;
    this.paused = this.record = this.onGuide = false;
    this.splits = [];
    this.frames = [];
    this.lastRejoin = -Infinity;
    this.rejoinReason = null;
    this.freeHazardNotice = null;
    this.lastRun = null;
    this.lastGatePass = null;
    this.missedGate = false;
    this.reference = this.opponent ?? this.bestRun ?? run;
    this.cornerIndex = 0;
    this.cornerEntryAt = null;
    this.lastCorner = null;
    this.cornerScores = new Array(this.event.corners.length).fill(null);
  }

  abandon() {
    this.rider = makeCyclist(this.event, this.bike, this.vehicle, null, this.worldQuery);
    this.rejoinReason = null;
    this.freeHazardNotice = null;
    this.moved = false;
    this.freeRide();
  }

  markCourse() {
    const distance = guideProgressAt(this.event, this.rider.position, this.rider.heading, this.routeAnchor, this.nextGate);
    this.onGuide = distance !== null;
    if (this.onGuide) this.routeAnchor = distance;
  }

  recordCheckpoint(previous) {
    const { gates, flyover } = this.event;
    const gate = gates[this.nextGate];
    const fraction = crossesRaceLine(gate, previous, this.rider.position, flyover);
    if (fraction === null) {
      if (this.nextGate + 1 < gates.length &&
          crossesRaceLine(gates[this.nextGate + 1], previous, this.rider.position, flyover) !== null) {
        this.missedGate = true;
      }
      return false;
    }
    this.missedGate = false;
    const split = this.elapsed + fraction * STEP_MS;
    const passedIndex = this.nextGate;
    this.splits.push(split);
    this.routeAnchor = gate.distance;
    this.nextGate++;
    const stageDone = passedIndex >= 1 ? this.event.stages?.find(s => s.finishGate === passedIndex) : null;
    const sector = passedIndex >= 1 ? (stageDone ? this.stageSector(stageDone) : this.sector(passedIndex)) : null;
    this.lastGatePass = {
      index: passedIndex, number: gate.number, name: gate.name, split,
      delta: this.lastGap, sectorDelta: sector?.delta ?? null, at: split,
    };
    const doneGate = this.practice ? this.practice.toGate + 1 : gates.length;
    if (this.nextGate < doneGate) {
      worldState.hooks.playSound?.('checkpoint');
      return false;
    }
    this.finishAt(split);
    return true;
  }

  rejoin() {
    if (this.phase !== 'race') return false;
    const { gates } = this.event;
    const last = gates[Math.max(this.practice?.fromGate ?? 0, this.nextGate - 1)];
    const ride = makeCyclist(this.event, this.rider.bike, this.rider.vehicle, this.rider.tuning, this.worldQuery);
    const from = last?.distance ?? 0;
    const at = Math.max(from, Math.min(this.routeAnchor - 3.1, gates[this.nextGate].distance - 6.1));
    const campus = this.worldQuery?.campus ?? getActiveCampus();
    if (last) {
      const frame = courseFrame(this.event.path, at);
      ride.position = courseGround(this.event, frame.p);
      ride.heading = Math.atan2(frame.f[2], frame.f[0]);
      ride.paved = this.worldQuery
        ? this.worldQuery.surfaceAt(ride.position[0], ride.position[2], campus === 'szu')
        : surfaceAt(ride.position[0], ride.position[2], campus === 'szu', campus);
    }
    ride.energy = this.rider.energy;
    ride.travel = this.rider.travel;
    this.saveReplayFrame(this.elapsed);
    this.rider = ride;
    this.elapsed += REJOIN_MS;
    this.lastRejoin = this.elapsed;
    this.rejoinReason = null;
    this.saveReplayFrame(this.elapsed);
    this.nextRecording = this.elapsed + this.replayInterval;
    this.routeAnchor = at;
    this.cornerEntryAt = null;
    this.lastCorner = null;
    this.missedGate = false;
    this.onGuide = true;
    worldState.hooks.playSound?.('rejoin');
    return true;
  }

  measureCorner(previous, approachingSpeed, covered) {
    if (!this.onGuide || this.nextGate === 0) {
      this.cornerEntryAt = null;
      return;
    }
    const { corners, markerStep } = this.event;
    let corner = corners[this.cornerIndex];
    while (corner && covered > corner.exit.distance + markerStep) {
      this.cornerEntryAt = null;
      corner = corners[++this.cornerIndex];
    }
    if (!corner || covered < corner.entry.distance - markerStep) return;
    const next = this.rider.position;
    const entered = crossesGate(corner.entry, previous, next);
    if (entered !== null) this.cornerEntryAt = this.elapsed + entered * STEP_MS;
    if (covered < corner.exit.distance - markerStep) return;
    const exited = crossesGate(corner.exit, previous, next);
    if (exited === null) return;
    const at = this.elapsed + exited * STEP_MS;
    const score = {
      speed: Math.max(0, mix(approachingSpeed, this.rider.speed, exited)),
      duration: this.cornerEntryAt === null ? null : at - this.cornerEntryAt,
    };
    this.cornerScores[corner.index] = score;
    this.lastCorner = { ...score, at, index: corner.index };
    this.cornerIndex++;
    this.cornerEntryAt = null;
  }

  saveReplayFrame(time) {
    const frame = packPose(time, this.rider);
    if (this.frames.at(-1)?.[0] === frame[0]) {
      this.frames[this.frames.length - 1] = frame;
      return;
    }
    if (this.frames.length >= MAX_REPLAY_SAMPLES) {
      this.frames = this.frames.filter((_sample, i) => i % 2 === 0 || i === this.frames.length - 1);
      this.replayInterval *= 2;
    }
    this.frames.push(frame);
  }

  finishAt(time) {
    if (this.phase === 'done') return;
    this.elapsed = time;
    this.phase = 'done';
    this.onGuide = false;
    this.rider.speed = 0;
    this.saveReplayFrame(time);
    this.lastRun = {
      time, vehicle: this.rider.vehicle, splits: this.splits.slice(), samples: this.frames, corners: this.cornerScores.slice(),
      unranked: Boolean(this.unranked || this.rivals?.length),
      ...(this.rider.vehicle === 'bike' && worldState.driverProfile ? { appearance: bicycleAppearance(worldState.driverProfile, this.rider.bike) } : {}),
    };
    worldState.hooks.playSound?.('finish');
    if (this.rivals?.length) {
      this.lastRun.comparison = rivalComparison(this);
      this.aiWinCount = recordAiWin(this);
      return;
    }
    if (this.practice) {
      this.lastRun = null;
      if (this.unranked) return;
      const prev = this.practiceBest.get(this.practice.key);
      this.record = prev === undefined || time < prev;
      if (this.record) this.practiceBest.set(this.practice.key, time);
      return;
    }
    if (this.online || this.unranked) return;
    this.record = (this.best === null || time < this.best) && time <= this.recordRules.limit;
    if (!this.record) return;
    this.best = time;
    this.bestRun = { ...this.lastRun, kind: '个人最佳影子' };
    const key = checkpointRecordKey(this.event, this.rider.vehicle);
    this.sessionRecords.set(key, this.bestRun);
    try { getStorage()?.setItem(key, JSON.stringify(this.bestRun)); } catch {}
    worldState.hooks.scheduleSave?.();
  }

  step(input) {
    if (this.phase === 'count') {
      const beforeSec = Math.ceil(this.countdownTicks * PHYSICS_STEP);
      this.countdown = --this.countdownTicks * PHYSICS_STEP;
      const afterSec = Math.ceil(this.countdown);
      if (this.countdownTicks === 0) {
        this.phase = 'race';
        if (this.practice?.entrySpeed) this.rider.speed = this.practice.entrySpeed;
        worldState.hooks.playSound?.('go');
      } else if (afterSec < beforeSec) {
        worldState.hooks.playSound?.('countdown');
      }
      return;
    }
    if (this.phase === 'free') this.freeClock += PHYSICS_STEP;
    if (this.phase === 'race') {
      this.trafficElapsed = (this.trafficElapsed ?? 0) + PHYSICS_STEP;
      stepRivals(this, PHYSICS_STEP);
    }
    const speedBefore = this.rider.speed;
    const campus = this.worldQuery?.campus ?? getActiveCampus();
    const exploring = campus === 'szu';
    const stepClock = raceTrafficTime(this);
    const stepWind = activeWind(this);
    const previous = moveCyclist(this.rider, input, PHYSICS_STEP, exploring, stepWind, stepClock, trialTraffic(this).vehicles, this.worldQuery);
    this.moved ||= Math.hypot(previous[0] - this.rider.position[0], previous[2] - this.rider.position[2]) > .0001;
    if (this.rider.hazard) {
      const reason = this.rider.hazard;
      this.rider.hazard = null;
      const label = reason === 'water' ? '落水' : '冲出山路';
      if (this.phase === 'race') {
        this.rejoin();
        this.rejoinReason = label;
      } else {
        const spot = this.worldQuery
          ? this.worldQuery.nearestSafeRoad(this.rider.position[0], this.rider.position[2])
          : nearestSafeRoad(this.rider.position[0], this.rider.position[2], campus);
        if (spot) {
          this.rider.position = [...spot.p];
          this.rider.heading = spot.heading;
          this.rider.speed = 0;
          this.rider.yawRate = 0;
          this.rider.lean = 0;
          this.rider.slip = 0;
          this.rider.paved = this.worldQuery
            ? this.worldQuery.surfaceAt(spot.p[0], spot.p[2], exploring)
            : surfaceAt(spot.p[0], spot.p[2], exploring, campus);
          this.rider.surfaceKind = campus === 'shunde'
            ? (this.worldQuery ? this.worldQuery.surfaceKindAt(spot.p[0], spot.p[2], exploring) : surfaceKindAt(spot.p[0], spot.p[2], exploring, campus))
            : (this.rider.paved ? 'paved' : 'grass');
          const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
          this.freeHazardNotice = { text: label + '，已强制遣返最近赛道', until: now + 2200 };
          worldState.hooks.playSound?.('rejoin');
        }
      }
      return;
    }
    if (this.phase !== 'race') return;
    this.markCourse();
    this.measureCorner(previous, speedBefore, this.routeAnchor);
    if (this.recordCheckpoint(previous)) return;
    this.elapsed += STEP_MS;
    if (this.elapsed >= this.nextRecording) {
      this.saveReplayFrame(this.elapsed);
      this.nextRecording = this.elapsed + this.replayInterval;
    }
  }

  advance(dt, input) {
    if (this.paused || this.phase === 'done' || !(dt > 0)) return;
    const carried = this.accumulator;
    const available = carried + dt;
    const ticks = Math.floor((available + 1e-9) / PHYSICS_STEP);
    this.accumulator = Math.max(0, available - ticks * PHYSICS_STEP);
    const sample = typeof input === 'function' ? input : () => input;
    for (let tick = 1; tick <= ticks && this.phase !== 'done'; tick++) {
      this.step(sample(tick * PHYSICS_STEP - carried));
    }
  }
}
