import {
  CITY_ASPHALT, ROAD_Y, TAU, clamp, headingVector, mix, scale,
} from '../core/math.js';
import { getActiveCampus, getPreferences, worldState } from '../core/state.js';
import { flyoverClearance } from '../data/traffic.js';
import { draftingRules } from '../data/race.js';
import { advanceDraft, findWake } from './drafting.js';
import { rivalYieldsContact } from '../race/rivals.js';
import { currentWeather } from '../render/atmosphere.js';
import { rainPuddleAt, shelteredWind } from '../world/environment.js';
import { cityVehicles } from '../world/geometry.js';
import { courseGround, createWorldQuery } from '../world/query.js';
import { trafficWakeAt, trafficPosition } from '../world/traffic.js';
import { TYRE_RADIUS, WHEEL_TEETH_RATIO } from './models.js';
import { bicycleGravelSpeed, buildVehicleTuning, stockBike } from './vehicles.js';

import { surfacePhysics, windPhysics } from '../data/surfaces.js';
import { skillPhysics } from '../data/vehicle-skills.js';
import { poweredDefaults } from '../data/vehicles.js';

export { vehicleSkills } from '../data/vehicle-skills.js';

export function updateBicyclePosture(rider, input, grade, dt) {
  const speed = rider.speed, turn = input.left || input.right;
  const braking = input.brake || rider.brake > .2;
  const stand = rider.sprinting && !braking && speed < 9.5 && (grade > .025 || speed < 6.2 || turn);
  const alreadyLow = rider.posture === 'tuck';
  const tuck = rider.paved && !stand && !braking && !turn && Math.abs(rider.steering) < .25 &&
    speed > (alreadyLow ? 8.1 : 9.1) && (grade < -.018 && !input.gas || grade < .022 && (input.gas || rider.sprinting));
  const blend = 1 - Math.exp(-9 * dt);
  rider.posture = stand ? 'stand' : tuck ? 'tuck' : 'seated';
  rider.tuck = mix(rider.tuck ?? 0, tuck ? 1 : 0, blend);
  rider.stand = mix(rider.stand ?? 0, stand ? 1 : 0, blend);
  const ratio = WHEEL_TEETH_RATIO * (rider.bike.gears === 'short' ? .88 : rider.bike.gears === 'long' ? 1.12 : 1);
  const cadence = input.gas && !braking ? 60 * Math.max(0, speed) / (TAU * TYRE_RADIUS * ratio) : 0;
  rider.cadence = mix(rider.cadence ?? 0, cadence, blend);
  rider.pedalPhase = ((rider.pedalPhase ?? 0) - rider.cadence * (TAU / 60) * dt) % TAU;
}

export function updateVehicleSkill(rider, input, dt) {
  const held = Boolean(input.sprint), speed = Math.max(0, rider.speed);
  rider.skill = '';
  rider.skillForce = rider.skillLimit = rider.skillYaw = 1;
  rider.regenDrag = 0;
  if (rider.vehicle === 'trail') {
    const skill = skillPhysics.trail;
    const drifting = held && Boolean(input.left) !== Boolean(input.right) && speed >= skill.driftSpeed && !input.brake && rider.energy > skill.driftMinEnergy;
    if (!held && rider.skillHeld && rider.driftTime >= skill.boostMinDriftTime && rider.energy > skill.boostEnergy) {
      rider.exitBoost = skill.boostTime;
      rider.energy -= skill.boostEnergy;
    }
    rider.driftTime = drifting ? (rider.driftTime ?? 0) + dt : held ? (rider.driftTime ?? 0) : 0;
    rider.exitBoost = Math.max(0, (rider.exitBoost ?? 0) - dt);
    if (drifting) {
      rider.skill = '手刹甩尾'; rider.skillYaw = skill.driftYaw; rider.skillForce = skill.driftForce;
      rider.energy -= skill.driftDrain * dt;
    } else if (rider.exitBoost > 0) {
      rider.skill = '出弯牵引'; rider.skillForce = skill.boostForce; rider.skillLimit = skill.boostLimit;
    } else rider.energy += skill.recovery * dt;
  } else if (rider.vehicle === 'ebike') {
    const skill = skillPhysics.ebike;
    rider.overheat = Math.max(0, (rider.overheat ?? 0) - dt);
    if (!held) rider.overclockLocked = false;
    const windingDown = speed > skill.regenSpeed && (!input.gas || input.brake);
    if (windingDown) rider.regenDrag = skill.regenDrag;
    if (held && input.gas && !input.brake && !rider.overclockLocked && rider.overheat === 0 && rider.energy > skill.minEnergy) {
      rider.skill = '超频'; rider.skillForce = rider.skillLimit = skill.forceAndLimit;
      rider.energy -= skill.drain * dt;
      if (rider.energy <= skill.minEnergy) {
        rider.energy = 0; rider.overheat = skill.overheatTime; rider.overclockLocked = true;
      }
    } else {
      rider.energy += (windingDown ? skill.regenRecovery : held ? skill.heldRecovery : skill.recovery) * dt;
      if (rider.overheat > 0) {
        rider.skill = '过热保护'; rider.skillForce = skill.overheatForce; rider.skillLimit = skill.overheatLimit;
      } else if (windingDown) rider.skill = '动能回收';
    }
  } else {
    const skill = skillPhysics.chair;
    rider.skillYaw = mix(skill.lowSpeedYaw, 1, clamp((speed - skill.yawFadeStart) / skill.yawFadeRange, 0, 1));
    if (held && input.gas && !input.brake && rider.energy > skill.minEnergy) {
      rider.skill = '双电机爆发';
      rider.skillForce = mix(skill.lowSpeedForce, skill.highSpeedForce, clamp(speed / skill.forceFadeSpeed, 0, 1));
      rider.skillLimit = skill.limit;
      rider.energy -= skill.drain * dt;
    } else rider.energy += skill.recovery * dt;
  }
  rider.skillHeld = held;
  rider.energy = clamp(rider.energy, 0, 1);
}

export function speedFov(rider, prior, dt) {
  const speed = clamp((rider.speed - 8) / 10, 0, 1);
  const boost = rider.sprinting || rider.drafting || rider.downwindDescent || (rider.skillForce ?? 1) > 1.06;
  const target = clamp(speed * .072 + (boost ? .049 : 0), 0, 7 * Math.PI / 180);
  return mix(prior?.speedFov ?? 0, target, 1 - Math.exp(-4.8 * dt));
}

export function makeCyclist(event, bike = stockBike, vehicle = 'bike', tuning = null, worldQuery = null) {
  const activeTuning = vehicle === 'bike'
    ? null
    : (tuning ?? buildVehicleTuning(vehicle, worldState.vehicleTunings?.[vehicle] ?? null));
  const position = worldQuery ? worldQuery.courseGround(event, event.spawn) : courseGround(event, event.spawn);
  return {
    bike, tuning: activeTuning, vehicle, position, heading: event.heading, speed: 0, steering: 0, travel: 0, paved: true,
    energy: 1, sprinting: false, sprintLocked: false, throttle: 0, brake: 0, yawRate: 0, lean: 0, slip: 0,
    stationaryBrake: 0, surfaceKind: 'paved', hazard: null,
  };
}

export function vehicleCollisionEnabled() {
  if (worldState.onlineRoom) return Boolean(worldState.onlineRoom.state?.collision);
  return Boolean(getPreferences()?.collision);
}

export function riderCollisionRadius(vehicle) {
  return vehicle === 'chair' ? .54 : vehicle === 'trail' ? .52 : .46;
}

export function resolveVehicleCollisions(rider, x, z, y, trafficClock, mayRide, actors = cityVehicles, worldQuery = null) {
  if (!vehicleCollisionEnabled()) return [x, z, false];
  const query = worldQuery ?? createWorldQuery(getActiveCampus());
  const r = riderCollisionRadius(rider.vehicle);
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let hit = false;
  if (trafficClock !== null) {
    for (const van of actors) {
      const { frame, point: vp } = trafficPosition(van, trafficClock);
      if (Math.abs(vp[0] - x) > 10 || Math.abs(vp[2] - z) > 10) continue;
      if (Math.abs(query.rideElevation(vp[0], vp[2]) - y) > 2.2) continue;
      const fx = frame.f[0] * van.direction, fz = frame.f[2] * van.direction, rx = -fz, rz = fx;
      const dx = x - vp[0], dz = z - vp[2], lf = dx * fx + dz * fz, lr = dx * rx + dz * rz;
      const ex = (van.halfL ?? 2.15) + r, ez = (van.halfW ?? .92) + r;
      if (Math.abs(lf) < ex && Math.abs(lr) < ez) {
        const penF = ex - Math.abs(lf), penR = ez - Math.abs(lr);
        let nx = x, nz = z;
        if (penR <= penF) { const s = lr >= 0 ? 1 : -1; nx += rx * s * (penR + .04); nz += rz * s * (penR + .04); }
        else { const s = lf >= 0 ? 1 : -1; nx += fx * s * (penF + .04); nz += fz * s * (penF + .04); }
        if (mayRide(nx, nz)) { x = nx; z = nz; }
        rider.speed = Math.min(rider.speed * .45, van.speed * .85);
        hit = true;
      }
    }
  }
  const onlinePoses = worldState.onlineRoom && worldState.hooks.onlineRiderPoses &&
    worldState.race?.phase === 'race' ? worldState.hooks.onlineRiderPoses(now) : [];
  const nearbyRiders = onlinePoses.length ? onlinePoses : rider.rivalPoses ?? [];
  if (nearbyRiders.length) {
    for (const pose of nearbyRiders) {
      if (rivalYieldsContact(pose, rider, x, z)) continue;
      const pp = pose.position;
      if (!pp || Math.abs(pp[1] - y) > 1.8) continue;
      const dx = x - pp[0], dz = z - pp[2], d = Math.hypot(dx, dz), minD = r + riderCollisionRadius(pose.vehicle);
      if (d < minD) {
        const ux = d > .001 ? dx / d : Math.cos(rider.heading + Math.PI / 2), uz = d > .001 ? dz / d : Math.sin(rider.heading + Math.PI / 2);
        const push = (minD - d) * .68 + .03, nx = x + ux * push, nz = z + uz * push;
        if (mayRide(nx, nz)) { x = nx; z = nz; }
        rider.speed *= .72;
        hit = true;
      }
    }
  }
  if (hit) rider.collidedAt = now;
  return [x, z, hit];
}

export function moveCyclist(rider, input, dt, exploring = false, wind = null, trafficClock = null, actors = cityVehicles, worldQuery = null) {
  const query = worldQuery ?? createWorldQuery(getActiveCampus());
  const campus = query.campus;
  const p = rider.position;
  const { paved, vehicle } = rider, cycling = vehicle === 'bike';
  const bike = cycling ? rider.bike : (rider.tuning ?? buildVehicleTuning(vehicle));
  const surfaceKind = campus === 'shunde' ? query.surfaceKindAt(p[0], p[2], exploring) : (paved ? 'paved' : 'grass');
  const gravel = surfaceKind === 'gravel';
  const poweredOnGravel = gravel && !cycling;
  const { bicycleGravel, grass, paved: road, puddle: puddleRules } = surfacePhysics;
  const { bicycleSprint: sprint } = skillPhysics;
  const { traction: windRules } = windPhysics;
  rider.surfaceKind = surfaceKind;
  rider.throttle = mix(rider.throttle, input.gas && !input.brake ? 1 : 0, 1 - Math.exp(-12.6 * dt));
  rider.brake = mix(rider.brake, input.brake ? 1 : 0, 1 - Math.exp(-(input.brake ? 18.0 : 24.0) * dt));

  if (!input.sprint) rider.sprintLocked = false;
  rider.sprinting = cycling && (paved || gravel || bike.magicGrip) && !input.brake && input.sprint && !rider.sprintLocked && rider.speed > sprint.minSpeed && rider.energy > sprint.minEnergy;
  const rawGrade = query.riderGrade(p, rider.heading);
  const grade = bike.magicGravity && rawGrade > 0 ? rawGrade * skillPhysics.magicUphillGradeScale : rawGrade;
  if (cycling) updateBicyclePosture(rider, input, grade, dt);
  const tuck = cycling ? (rider.tuck ?? 0) : 0, stand = cycling ? (rider.stand ?? 0) : 0;
  if (rider.sprinting) {
    rider.energy = Math.max(0, rider.energy - dt * sprint.drain * (bike.sprintDrain ?? 1) * (1 + sprint.standDrain * stand) * (gravel ? bicycleGravel.sprintDrainScale : 1));
    if (rider.energy <= sprint.minEnergy) rider.sprintLocked = true;
  } else if (cycling) rider.energy = Math.min(1, rider.energy + dt * (rider.drafting ? sprint.draftingRecovery : paved ? sprint.pavedRecovery : gravel ? sprint.gravelRecovery : sprint.grassRecovery) * (bike.sprintRecover ?? 1));
  if (!cycling) updateVehicleSkill(rider, input, dt);
  if (bike.magicEnergy) rider.energy = Math.min(1, rider.energy + skillPhysics.magicEnergyRecovery * dt);
  const weather = currentWeather();
  const wet = (paved || poweredOnGravel) && weather.wetness > 0;
  const puddle = rainPuddleAt(campus, p[0], p[2], weather.rain);
  if (puddle && !rider.inPuddle && rider.speed > puddleRules.splashMinSpeed) worldState.hooks.playSound?.('splash');
  rider.inPuddle = puddle;
  wind = shelteredWind(wind, rider, dt, query);
  const wetGrip = wet && !bike.magicGrip ? mix(weather.gripScale, 1, bike.wetMitigate ?? 0) : 1;
  const wetBrake = wet ? mix(weather.brakeScale, 1, bike.wetBrakeMitigate ?? 0) : 1;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const trackedWake = rider.draft?.wake?.id;
  const raceRiders = worldState.onlineRoom && worldState.race?.phase === 'race'
    ? worldState.hooks.onlineRiderPoses?.(now) : rider.rivalPoses;
  const riderWake = raceRiders?.length ? findWake(rider, raceRiders, trackedWake) : null;
  const trafficWake = trafficClock === null ? null : trafficWakeAt(rider, trafficClock, actors, query, trackedWake);
  const wake = trackedWake && trafficWake?.id === trackedWake ? trafficWake : riderWake ?? trafficWake;
  const eligible = paved && !input.brake && !rider.hazard;
  const wasBoosting = (rider.draft?.burst ?? 0) > 0;
  rider.draft = advanceDraft(rider.draft, wake, dt, eligible);
  rider.drafting = Boolean(rider.draft.wake);
  const slingshot = eligible && rider.draft.burst > 0;
  if (slingshot && !wasBoosting) worldState.hooks.playSound?.('slingshot');
  const wakeTuning = draftingRules.vehicles[vehicle] ?? draftingRules.vehicles.bike;
  const hillAcceleration = grade * 9.81;
  const gravelBase = cycling ? bicycleGravelSpeed(bike) : bike.gravelSpeed;
  const gravelSprint = Math.min(bike.sprintSpeed, gravelBase * bicycleGravel.sprintSpeedScale);
  const flatLimit = paved ? (rider.sprinting ? bike.sprintSpeed : bike.roadSpeed) : gravel ? (rider.sprinting ? gravelSprint : gravelBase) : bike.grassSpeed;
  const topSpeedEffect = 1 - clamp(grade * 1.25, 0, .22) + ((paved || gravel) && cycling ? clamp(-grade * (paved ? .92 : .55), 0, paved ? .12 : .07) : 0);
  const windAlong = wind ? Math.cos(rider.heading) * wind.vector[0] + Math.sin(rider.heading) * wind.vector[1] : 0;
  rider.downwindDescent = grade < -.025 && windAlong > .25;
  const windSpeedScale = wind ? clamp(1 + windAlong * wind.speed * windRules.topSpeedEffect, windRules.topSpeedMin, windRules.topSpeedMax) : 1;
  const windDragScale = wind ? clamp(1 - windAlong * wind.speed * windRules.dragEffect, windRules.dragMin, windRules.dragMax) : 1;
  const limit = (bike.magicGrip && !paved ? Math.max(flatLimit, bike.roadSpeed) : flatLimit) *
    (topSpeedEffect + tuck * clamp(-grade * .27, 0, .032)) * (slingshot ? wakeTuning.burstLimit : rider.drafting ? wakeTuning.draftLimit : 1) * windSpeedScale * (rider.skillLimit ?? 1);
  const gravelDrag = cycling ? mix(bike.rolling, bike.grassRolling, bicycleGravel.rollingBlend) : bike.gravelRolling;
  const drag = (.48 + Math.abs(rider.speed) * .047) * (paved ? bike.rolling : gravel ? gravelDrag : bike.grassRolling ?? poweredDefaults.grassRolling) *
    (rider.drafting ? wakeTuning.drag : 1) * (1 - tuck * .36) * windDragScale + (rider.regenDrag ?? 0);

  if (input.brake) {
    if (rider.speed > .03) {
      rider.speed = Math.max(0, rider.speed - Math.max(0, rider.brake * 9.3 * (bike.brakePower ?? 1) * wetBrake * (poweredOnGravel ? bike.gravelBrake : 1) + drag + hillAcceleration) * dt);
      rider.stationaryBrake = 0;
    } else {
      rider.stationaryBrake += dt;
      if (rider.stationaryBrake > .18) rider.speed = Math.max(-2.18, rider.speed - rider.brake * 2.35 * dt);
    }
  } else {
    rider.stationaryBrake = 0;
    const fast = clamp((rider.speed / Math.max(1, limit) - .42) / .56, 0, 1);
    const gearing = mix(bike.force, bike.highForce ?? bike.force, fast);
    const groundForce = paved ? road.force : gravel ? (cycling ? bicycleGravel.force : bike.gravelForce) : cycling ? grass.bicycleForce : grass.poweredForce;
    const force = rider.throttle * (rider.sprinting ? sprint.force * (bike.sprintForce ?? 1) * (1 + stand * (bike.frame === 'agile' ? sprint.agileStandForce : sprint.standForce)) * (gravel ? bicycleGravel.sprintForceScale : 1) : groundForce) *
      gearing * (rider.skillForce ?? 1) + (slingshot ? rider.throttle * wakeTuning.thrust : 0);
    const gravelSlowdown = cycling ? mix(bicycleGravel.slowdownMin, bicycleGravel.slowdownMax,
      clamp((bike.grassSlowdown - bicycleGravel.grassSlowdownMin) / bicycleGravel.grassSlowdownRange, 0, 1)) : bike.gravelSlowdown;
    if (rider.speed > limit) rider.speed = Math.max(limit, rider.speed - dt * (paved ? road.overspeedSlowdown : gravel ? gravelSlowdown : bike.grassSlowdown ?? poweredDefaults.grassSlowdown));
    else if (rider.speed >= 0 && grade !== 0) rider.speed = clamp(rider.speed + dt * (force - drag - hillAcceleration), 0, limit);
    else if (force > drag) rider.speed = Math.min(limit, rider.speed + dt * (force - drag));
    else rider.speed = Math.sign(rider.speed) * Math.max(0, Math.abs(rider.speed) - (drag - force) * dt);
  }

  const forward = rider.speed < -.04 ? -1 : 1, velocity = Math.abs(rider.speed);
  const steer = Number(input.right) - Number(input.left);
  const speedFactor = clamp(velocity / 13.2, 0, 1);
  const trail = vehicle === 'trail';
  const steeringRate = (steer === 0 ? mix(trail ? 23 : 20, 17.5, speedFactor) :
    mix(trail ? 17 : cycling ? 15.2 : 14, trail ? 9.6 : 10, speedFactor)) * (bike.steerScale ?? 1) * (1 - .14 * tuck);
  rider.steering = mix(rider.steering, steer, 1 - Math.exp(-steeringRate * dt));
  const low = mix(.55, 1, clamp(velocity / 2.1, 0, 1));
  const wanted = rider.steering * low * mix(trail ? 1.88 : 1.75, trail ? 1.19 : 1.35, speedFactor) * (rider.skillYaw ?? 1);
  const gravelGrip = cycling ? mix(bike.grassGrip, bike.roadGrip, bicycleGravel.gripBlend) : bike.gravelGrip * wetGrip;
  const grip = (paved ? bike.roadGrip * wetGrip : gravel ? gravelGrip : bike.grassGrip) * (1 - (bike.brakeTurnLoss ?? poweredDefaults.brakeTurnLoss) * rider.brake) *
    (puddle && !bike.magicGrip ? puddleRules.gripScale : 1) * (weather.rain ? (bike.rainGrip ?? 1) : 1) *
    (bike.sideWind && wind ? 1 - clamp(Math.abs(Math.sin(rider.heading - wind.angle)) * wind.speed * windRules.sideGripLoss, 0, windRules.sideGripLossMax) : 1);
  const maxTurn = grip * (rider.skill === '手刹甩尾' ? skillPhysics.trail.driftGrip : 1) / Math.max(vehicle === 'chair' ? 1.45 : 2.75, velocity);
  const load = Math.abs(wanted) / maxTurn;
  rider.slip = mix(rider.slip, clamp((load - .88) * .92 + (rider.skill === '手刹甩尾' ? skillPhysics.trail.driftSlip : 0) + (puddle && !bike.magicGrip ? puddleRules.slipAdded : 0), 0, 1), 1 - Math.exp(-8.6 * dt));
  rider.yawRate = mix(rider.yawRate, clamp(wanted, -maxTurn, maxTurn) * forward, 1 - Math.exp(-16.1 * dt));
  if (cycling) rider.gripLoad = Math.abs(rider.yawRate) * velocity / grip;
  rider.heading += rider.yawRate * dt;
  rider.heading = Math.atan2(Math.sin(rider.heading), Math.cos(rider.heading));
  if (velocity > 4.2 && rider.slip > .04) rider.speed -= forward * rider.slip * (vehicle === 'chair' ? 1.05 : 2.30) * dt;
  const bank = vehicle === 'chair' ? 0 : clamp(Math.atan2(Math.max(0, rider.speed) * rider.yawRate, 16.1), -.40, .40);
  rider.lean = mix(rider.lean, bank, 1 - Math.exp(-9.8 * dt));

  const step = scale(headingVector(rider.heading - rider.yawRate * dt * .5), rider.speed * dt);
  let x = p[0] + step[0], z = p[2] + step[2];
  const onDeck = exploring ? query.flyoverAt(p[0], p[2]) : null;
  const onUpperRoad = onDeck !== null && p[1] >= onDeck - flyoverClearance.deckTolerance;
  const deckAt = (px, pz) => exploring ? query.flyoverAt(px, pz) : null;
  const mayRide = (px, pz) => {
    const deck = deckAt(px, pz);
    if (onUpperRoad && onDeck > flyoverClearance.accessHeight) return deck !== null;
    if (!onUpperRoad && deck !== null && deck > flyoverClearance.accessHeight && deck < flyoverClearance.obstructionHeight) return false;
    return query.safeToRide(px, pz, exploring, true);
  };
  rider.hazard = null;
  if (query.waterHazardAt(x, z)) rider.hazard = 'water';
  else if (query.cliffHazardAt(x, z, p[1])) rider.hazard = 'cliff';
  if (!rider.hazard && !mayRide(x, z)) {
    const slideX = mayRide(x, p[2]), slideZ = mayRide(p[0], z);
    if (slideX && (!slideZ || Math.abs(step[0]) > Math.abs(step[2]))) z = p[2];
    else if (slideZ) x = p[0];
    else { x = p[0]; z = p[2]; }
    rider.speed *= .38;
  }
  if (!rider.hazard) [x, z] = resolveVehicleCollisions(rider, x, z, p[1], trafficClock, mayRide, actors, query);
  if (campus === 'shunde') {
    rider.surfaceKind = query.surfaceKindAt(x, z, exploring);
    rider.paved = rider.surfaceKind === 'paved';
  } else {
    rider.paved = query.surfaceAt(x, z, exploring);
    rider.surfaceKind = rider.paved ? 'paved' : 'grass';
  }
  const deck = deckAt(x, z);
  const nextOnDeck = deck !== null && (onUpperRoad || deck <= flyoverClearance.accessHeight);
  const height = rider.paved ? ROAD_Y + .002 : -.006;
  const heightBefore = query.rideElevation(p[0], p[2]) + (onUpperRoad ? onDeck - CITY_ASPHALT : 0);
  const heightAfter = query.rideElevation(x, z) + (nextOnDeck ? deck - CITY_ASPHALT : 0);
  rider.position = [x, heightAfter + mix(p[1] - heightBefore, height, 1 - Math.exp(-13 * dt)), z];
  rider.travel += forward * Math.hypot(x - p[0], heightAfter - heightBefore, z - p[2]);
  return p;
}
