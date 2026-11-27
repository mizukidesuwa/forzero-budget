import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { englishText } from '../src/data/english-text.js';
import * as game from '../src/test-exports.js';

const require = createRequire(import.meta.url);
const shared = require('../server/tuning-190.cjs');
const { roomBuildProblem } = require('../server/room-rules.cjs');
assert.equal(game.tuning190, shared);
assert.deepEqual([...shared.illegalParts].sort(), ['capacitor', 'glue', 'gravity', 'rocket']);
assert.equal(shared.prices.bike.tyres.usedSlick, 60);
assert.equal(shared.prices.bike.frame.usedFrame, 80);
assert.equal(shared.prices.trail.suspension.usedFrame, 80);
assert.equal(shared.prices.chair.caster.usedFrame, 80);
assert.equal(shared.prices.bike.sprint.rocket, 400);
assert.equal(shared.prices.bike.sprint.capacitor, 360);
assert.deepEqual(shared.prices.ebike.motor, {
  stock: 0, standard: 120, torque: 230, smooth: 190, rocket: 400, capacitor: 360,
});

for (const [vehicle, prices] of Object.entries(shared.prices)) {
  const options = vehicle === 'bike'
    ? game.bikePartOptions
    : Object.fromEntries(game.vehicleTuningChoices[vehicle].map(slot => [slot.key, slot.options]));
  assert.deepEqual(Object.keys(options), Object.keys(prices), vehicle);
  for (const [slot, parts] of Object.entries(prices)) {
    assert.deepEqual(Object.keys(options[slot]).sort(), Object.keys(parts).sort(), vehicle + '/' + slot);
    assert.equal(parts.stock, 0, vehicle + '/' + slot);
    for (const [part, price] of Object.entries(parts)) {
      const selection = { [slot]: part };
      const build = shared.summarize(vehicle, selection);
      const illegal = shared.illegalParts.has(part);
      assert.equal(build.total, price);
      assert.equal(build.illegal, illegal);
      assert.equal(shared.violation(vehicle, selection, 'open') !== '', illegal);
      assert.equal(shared.violation(vehicle, selection, 'party'), '');
    }
  }
}

const poweredBudgetCounts = { trail: [63, 272], ebike: [65, 270], chair: [80, 301] };
const extraSlots = { trail: ['brakes', 'traction'], ebike: ['geometry', 'thermal'], chair: ['brakes', 'motorSplit'] };
for (const [vehicle, slots] of Object.entries(extraSlots)) {
  const catalog = shared.prices[vehicle];
  assert.equal(Object.keys(catalog).length, 5, vehicle);
  const oldParts = Object.fromEntries(Object.entries(catalog).slice(0, 3).map(([slot, options]) => [slot, Object.keys(options).find(part => part !== 'stock' && !shared.illegalParts.has(part))]));
  const restored = game.normalizeVehicleParts(vehicle, oldParts);
  assert.deepEqual(restored, { ...oldParts, [slots[0]]: 'stock', [slots[1]]: 'stock' });
  assert.deepEqual(game.buildVehicleTuning(vehicle, oldParts), game.buildVehicleTuning(vehicle, restored));
  const legalTotals = Object.values(catalog).reduce((totals, options) =>
    totals.flatMap(total => Object.entries(options).filter(([part]) => !shared.illegalParts.has(part))
      .map(([, price]) => total + price)), [0]);
  assert.equal(legalTotals.length, 432, vehicle);
  assert.deepEqual([400, 700].map(budget => legalTotals.filter(total => total <= budget).length), poweredBudgetCounts[vehicle]);
}

for (const [vehicle, budget, parts, alternative, over] of [
  ['trail', '400', { tyres: 'road', traction: 'longDrive' }, { traction: 'quickEngage' }, 60],
  ['ebike', '700', { tyres: 'grip', motor: 'standard', brakes: 'combo', thermal: 'regenTuning' }, { thermal: 'quickCooling' }, 10],
  ['chair', '400', { brakes: 'progressive', motorSplit: 'sustained' }, { brakes: 'power' }, 40],
]) {
  const room = { vehicleRule: vehicle, budget };
  assert.equal(roomBuildProblem(room, { tuning: parts }), '超预算 ¥' + over);
  assert.equal(roomBuildProblem(room, { tuning: { ...parts, ...alternative } }), '');
}

for (const [motor, roadKph] of [['stock', 25], ['standard', 45], ['torque', 42], ['smooth', 42]]) {
  const tuning = game.buildVehicleTuning('ebike', { motor });
  assert.ok(Math.abs(tuning.roadSpeed * 3.6 - roadKph) < 1e-9, `e-bike ${motor} nominal limit`);
}

game.setActiveCampus('szu');
game.buildRidingScene('szu');
const query = game.createWorldQuery('szu');
const event = game.coursesByCampus.szu[0];
const prices = shared.prices.bike.tyres;
const originalPrice = prices.race;
const prefs = game.getPreferences();
game.setPreferences({ ...prefs, soloBudget: '400' });
try {
  prices.race = 401;
  const trial = new game.TimeTrial(event, game.buildBike('race'));
  assert.equal(game.soloBudget(trial).over, 1);
  assert.equal(trial.start(), false);
  assert.equal(roomBuildProblem({ vehicleRule: 'bike', budget: '400' }, { bike: trial.bike }), '超预算 ¥1');
  prices.race = 400;
  assert.equal(game.soloBudget(trial).over, 0);
  assert.equal(roomBuildProblem({ vehicleRule: 'bike', budget: '400' }, { bike: trial.bike }), '');
} finally {
  prices.race = originalPrice;
  game.setPreferences(prefs);
}

const part = game.tyreChoices.traction;
const originalGrip = part.grip;
const site = game.rainPuddleSites('szu')[0];
game.setActiveWeather('rain');
try {
  const checkWetGrip = () => {
    const bike = game.buildBike('traction', 'stock', 'control', 'agile');
    assert.equal(bike.roadGrip, game.bicycleBase.roadGrip * part.grip * game.frameChoices.agile.grip);
    const rider = game.makeCyclist(event, bike, 'bike', null, query);
    Object.assign(rider, { position: [site.x, query.rideElevation(site.x, site.z) + game.ROAD_Y, site.z], speed: 8 });
    game.moveCyclist(rider, { gas: false, brake: true, left: false, right: true, sprint: false },
      game.PHYSICS_STEP, false, null, null, [], query);
    assert.equal(rider.inPuddle, true);
    const wet = game.mix(game.weatherTraction.rain.gripScale, 1, part.wetMitigate);
    const grip = bike.roadGrip * wet * (1 - bike.brakeTurnLoss * rider.brake) * game.surfacePhysics.puddle.gripScale;
    assert.equal(rider.gripLoad, Math.abs(rider.yawRate) * rider.speed / grip);
    return grip;
  };
  const before = checkWetGrip();
  part.grip += .1;
  assert.ok(checkWetGrip() > before);
} finally {
  part.grip = originalGrip;
  game.setActiveWeather('day');
}

const rocketRoad = {
  campus: 'szu',
  courseGround: () => [100_000, game.ROAD_Y, 100_000],
  riderGrade: () => 0,
  rideElevation: () => 0,
  safeToRide: () => true,
  waterHazardAt: () => false,
  cliffHazardAt: () => false,
  surfaceAt: () => true,
};
const cruise = { gas: true, brake: false, left: false, right: true, sprint: false };
const skillPressed = { ...cruise, sprint: true };
const stepRocketRoad = (rider, input) =>
  game.moveCyclist(rider, input, game.PHYSICS_STEP, false, null, null, [], rocketRoad);
const framesFor = seconds => Math.round(seconds / game.PHYSICS_STEP);
function tunedRider(vehicle, parts, speed = 6) {
  const rider = game.makeCyclist(event, game.stockBike, vehicle, game.buildVehicleTuning(vehicle, parts), rocketRoad);
  rider.speed = speed;
  return rider;
}

function trailBoost(traction) {
  const rider = tunedRider('trail', { traction });
  for (let frame = 0; frame < framesFor(.5); frame++) game.updateVehicleSkill(rider, skillPressed, game.PHYSICS_STEP);
  game.updateVehicleSkill(rider, cruise, game.PHYSICS_STEP);
  assert.equal(rider.skill, '出弯牵引');
  return rider;
}

const stockTrail = trailBoost('stock');
const quickTrail = trailBoost('quickEngage');
const longTrail = trailBoost('longDrive');
assert.ok(quickTrail.skillForce > stockTrail.skillForce && stockTrail.skillForce > longTrail.skillForce);
assert.ok(quickTrail.exitBoost < stockTrail.exitBoost && stockTrail.exitBoost < longTrail.exitBoost);
longTrail.tuning = quickTrail.tuning;
game.updateVehicleSkill(longTrail, cruise, game.PHYSICS_STEP);
assert.equal(longTrail.exitBoost, 0, 'swapping a free-ride part ends the previous traction boost');
assert.equal(longTrail.skillForce, 1);

function overheatEbike(thermal) {
  const rider = tunedRider('ebike', { motor: 'standard', thermal });
  let frames = 0;
  while (frames < framesFor(5) && !(rider.overheat > 0)) {
    game.updateVehicleSkill(rider, skillPressed, game.PHYSICS_STEP);
    frames++;
  }
  assert.ok(rider.overheat > 0);
  return { frames, overheat: rider.overheat };
}

const stockHeat = overheatEbike('stock');
const quickHeat = overheatEbike('quickCooling');
assert.ok(quickHeat.frames < stockHeat.frames && quickHeat.overheat < stockHeat.overheat);
const stockEbike = tunedRider('ebike', { motor: 'standard' });
const regenEbike = tunedRider('ebike', { motor: 'standard', thermal: 'regenTuning' });
for (const rider of [stockEbike, regenEbike]) game.updateVehicleSkill(rider, skillPressed, game.PHYSICS_STEP);
assert.ok(regenEbike.skillForce < stockEbike.skillForce);
for (const rider of [stockEbike, regenEbike]) {
  rider.energy = .5;
  game.updateVehicleSkill(rider, { ...cruise, gas: false }, game.PHYSICS_STEP);
}
assert.ok(regenEbike.energy > stockEbike.energy);

const hillChair = tunedRider('chair', { motor: 'climb', motorSplit: 'hillPulse' }, 1);
const sustainedChair = tunedRider('chair', { motor: 'climb', motorSplit: 'sustained' }, 1);
for (const rider of [hillChair, sustainedChair]) stepRocketRoad(rider, skillPressed);
assert.ok(hillChair.speed > sustainedChair.speed);
for (const rider of [hillChair, sustainedChair]) {
  rider.energy = .5;
  stepRocketRoad(rider, cruise);
}
assert.ok(sustainedChair.energy > hillChair.energy);

const shortEbike = tunedRider('ebike', { motor: 'standard', geometry: 'shortWheelbase' }, 2);
const stableEbike = tunedRider('ebike', { motor: 'standard', geometry: 'stableWheelbase' }, 2);
for (const rider of [shortEbike, stableEbike]) stepRocketRoad(rider, cruise);
assert.ok(shortEbike.steering > stableEbike.steering, 'short wheelbase responds more quickly at low speed');
for (const rider of [shortEbike, stableEbike]) {
  rider.speed = 12;
  rider.steering = 1;
  rider.yawRate = 0;
  stepRocketRoad(rider, cruise);
}
assert.ok(stableEbike.yawRate > shortEbike.yawRate, 'stable geometry grips better at high speed');

for (const [vehicle, chassis, straightBrake, cornerBrake] of [
  ['trail', { suspension: 'stiff' }, 'frontDisc', 'linked'],
  ['chair', { caster: 'steady' }, 'power', 'progressive'],
]) {
  const straight = game.buildVehicleTuning(vehicle, { ...chassis, brakes: straightBrake });
  const corner = game.buildVehicleTuning(vehicle, { ...chassis, brakes: cornerBrake });
  assert.ok(straight.brakePower > corner.brakePower && corner.brakeTurnLoss < straight.brakeTurnLoss);
  assert.ok(straight.brakePower < 1.20, vehicle + ' stacked straight-line brake force');
}

const rocketNativeSkill = { trail: ['traction', 'quickEngage'], ebike: ['thermal', 'regenTuning'], chair: ['motorSplit', 'hillPulse'] };

assert.deepEqual(game.skillPhysics.rocket, { boostTime: 2, cooldownTime: 8, force: 1.45, limit: 1.25 });

for (const [vehicle, slot] of [['trail', 'gears'], ['ebike', 'motor'], ['chair', 'motor']]) {
  assert.equal(shared.prices[vehicle][slot].rocket, 400);
  assert.equal(shared.prices[vehicle][slot].capacitor, 360);
  const [skillSlot, skillOption] = rocketNativeSkill[vehicle];
  const tuning = game.buildVehicleTuning(vehicle, { [slot]: 'rocket', [skillSlot]: skillOption });
  assert.ok(tuning.skillTuning, vehicle + ' tests rocket with a native skill part installed');
  const baseTuning = game.buildVehicleTuning(vehicle, vehicle === 'ebike' ? { motor: 'capacitor' } : {});
  for (const property of ['roadSpeed', 'grassSpeed', 'force', 'highForce']) {
    assert.equal(tuning[property], baseTuning[property], `${vehicle} rocket cruise ${property}`);
  }

  const rocket = game.makeCyclist(event, game.stockBike, vehicle, tuning, rocketRoad);
  const baseline = game.makeCyclist(event, game.stockBike, vehicle, baseTuning, rocketRoad);
  rocket.speed = baseline.speed = 6;
  stepRocketRoad(baseline, cruise);
  stepRocketRoad(rocket, cruise);
  assert.equal(rocket.speed, baseline.speed, `${vehicle} acceleration without skill`);
  assert.equal(rocket.yawRate, baseline.yawRate, `${vehicle} native steering without skill`);

  if (vehicle === 'ebike') {
    stepRocketRoad(baseline, skillPressed);
    assert.equal(baseline.skill, '超频', 'capacitor keeps the native e-bike skill');
    assert.equal(baseline.skillLimit, 1.18);
  }

  stepRocketRoad(rocket, { ...skillPressed, gas: false });
  assert.equal(rocket.skillForce, 1, `${vehicle} requires throttle to launch`);
  stepRocketRoad(rocket, cruise);
  stepRocketRoad(rocket, skillPressed);
  assert.equal(rocket.skill, '火箭爆发', vehicle);
  assert.equal(rocket.skillForce, 1.45, vehicle);
  assert.equal(rocket.skillLimit, 1.25, vehicle);
  stepRocketRoad(rocket, cruise);
  assert.equal(rocket.skillForce, 1.45, `${vehicle} boost survives key release`);

  let boostFrames = 2;
  for (let frame = 2; frame < framesFor(10.125); frame++) {
    // Release and re-press during cooldown, then keep holding past the ready time.
    stepRocketRoad(rocket, frame === framesFor(9.875) ? cruise : skillPressed);
    if (rocket.skill === '火箭爆发') boostFrames++;
  }
  assert.ok(Math.abs(boostFrames - framesFor(2)) <= 1, `${vehicle} burst lasted ${boostFrames} frames`);
  assert.equal(rocket.skillForce, 1, `${vehicle} held key does not re-trigger`);
  assert.equal(rocket.skillLimit, 1, `${vehicle} returns to its cruise limit`);
  stepRocketRoad(rocket, cruise);
  stepRocketRoad(rocket, skillPressed);
  assert.equal(rocket.skillForce, 1.45, `${vehicle} can launch again after cooldown`);
}

const originalTunings = game.worldState.vehicleTunings;
game.worldState.vehicleTunings = { ...originalTunings, trail: { gears: 'rocket' } };
try {
  const trial = new game.TimeTrial(event, game.stockBike, 'trail', query);
  assert.notEqual(trial.start(), false);
  assert.equal(trial.phase, 'count');
  for (let frame = 0; frame < game.COUNTDOWN_TICKS; frame++) trial.step(skillPressed);
  assert.equal(trial.phase, 'race');
  trial.step(skillPressed);
  assert.equal(trial.rider.skillForce, 1, 'holding the rocket key through countdown does not start its boost');
  trial.step(cruise);
  trial.step(skillPressed);
  assert.equal(trial.rider.skillForce, 1.45);
  const remaining = trial.rider.rocketTime;
  assert.ok(trial.rejoin());
  assert.equal(trial.rider.rocketTime, remaining, 'rejoin preserves the rocket timer');
  assert.equal(trial.rider.skillHeld, true, 'rejoin preserves the pressed skill key');
} finally {
  game.worldState.vehicleTunings = originalTunings;
}

const stored = new Map();
game.setStorage({ getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) });
let saves = 0;
game.worldState.hooks.scheduleSave = () => saves++;
const illegal = new game.TimeTrial(event, game.buildBike('glue', 'stock', 'stock', 'gravity', 'rocket'));
illegal.start();
assert.equal(illegal.phase, 'count');
illegal.finishAt(55_000);
assert.equal(illegal.lastRun.unranked, true);
assert.equal(illegal.record, false);
assert.equal(illegal.sessionRecords.size, 0);
assert.equal(stored.size, 0);
assert.equal(saves, 0);
assert.equal(game.trialMedal(illegal), '');
assert.throws(() => game.makeGhostFile(event, illegal.lastRun, { name: 'QA', paint: 'classic' }), /官方影子/);

const baseSkin = {
  schemaVersion: 1,
  id: 'qa_camel_skin',
  label: 'QA CamelCase Skin',
  class: 'model',
  rig: 'shared-rider-v1',
  palette: { bodyMain: '#112233', eyeWhite: '#ffffff' },
  proportions: { ...game.defaultRiderSkin.proportions },
  headMode: 'integrated',
  limbMode: 'full',
  animationProfile: 'seated-soft',
  accessories: [],
  allowedVehicles: ['bike', 'ebike', 'chair', 'trail'],
  bounds: { width: 0.90, height: 1.60, depth: 0.80 },
  triangleBudget: 2400,
  model: {
    version: 1,
    parts: [
      { id: 'body', primitive: 'ellipsoid', material: 'bodyMain', center: [-0.15, 1.15, 0], size: [0.20, 0.28, 0.20] },
      { id: 'head', primitive: 'ellipsoid', material: 'bodyMain', center: [0.05, 1.55, 0], size: [0.15, 0.16, 0.15] },
      { id: 'left_eye', primitive: 'tube', material: 'eyeWhite', from: [0.14, 1.58, 0.06], to: [0.18, 1.58, 0.06], radius: 0.02, radius2: 0.04 },
      { id: 'foot_anchor', primitive: 'box', material: 'bodyMain', center: [-0.20, 0.55, 0], size: [0.10, 0.06, 0.10] },
    ],
  },
  unlock: null,
};
const camelResult = game.validateSkinSpec(baseSkin);
assert.equal(camelResult.valid, true, JSON.stringify(camelResult.errors));
const taperedExceeded = {
  ...baseSkin,
  bounds: { width: 0.80, height: 1.42, depth: 0.60 },
  model: {
    version: 1,
    parts: [
      ...baseSkin.model.parts,
      { id: 'tail_flare', primitive: 'tube', material: 'bodyMain', from: [-0.30, 0.95, 0], to: [-0.38, 0.95, 0], radius: 0.03, radius2: 0.35 },
    ],
  },
};
const taperedResult = game.validateSkinSpec(taperedExceeded);
assert.equal(taperedResult.valid, false);
assert.ok(taperedResult.errors.some(msg => msg.includes('model.envelope.depth')));
const invalidProposal = game.validateSkinProposal({
  confidence: 2,
  spec: { ...baseSkin, triangleBudget: 100 },
});
assert.equal(invalidProposal.valid, false);
assert.ok(invalidProposal.errors.some(msg => msg.includes('confidence')));
assert.ok(invalidProposal.errors.some(msg => msg.includes('model.parts')));

const fencedJson = '```json\n' + JSON.stringify({ confidence: 0.9, spec: baseSkin, unresolved: [], previewNotes: [] }, null, 2) + '\n```';
assert.equal(game.validateSkinProposal(JSON.parse(game.extractSkinJsonText(fencedJson))).valid, true);
const markdownEscaped = fencedJson.split('\n').map(line => line.replace(/^ +/, s => '&#x20;'.repeat(s.length)) + '\\').join('\n');
assert.equal(game.validateSkinProposal(JSON.parse(game.extractSkinJsonText(markdownEscaped))).valid, true);
const noisyWrapped = '\uFEFF说明文字\n' + markdownEscaped + '\n结尾说明';
assert.equal(game.validateSkinProposal(JSON.parse(game.extractSkinJsonText(noisyWrapped))).valid, true);

const customSkinBody = game.makeRiderSkinBody(camelResult.spec);
assert.ok(customSkinBody.vertices.length > 0);
const limblessSpec = game.normalizeSkinSpec({
  schemaVersion: 1,
  id: 'orb-blob-test',
  label: '无肢圆球测试',
  class: 'model',
  rig: 'shared-rider-v1',
  palette: { body: '#66bb88', eye: '#18241d' },
  proportions: camelResult.spec.proportions,
  headMode: 'integrated',
  limbMode: 'hidden',
  animationProfile: 'seated-soft',
  accessories: [],
  allowedVehicles: ['bike', 'ebike', 'chair', 'trail'],
  bounds: { width: 1.04, height: 1.80, depth: 0.96 },
  triangleBudget: 2400,
  model: {
    version: 1,
    parts: [
      { id: 'body', primitive: 'ellipsoid', material: 'body', center: [-0.10, 1.06, 0], size: [0.24, 0.34, 0.24] },
      { id: 'head', primitive: 'ellipsoid', material: 'body', center: [0.02, 1.62, 0], size: [0.18, 0.20, 0.18] },
      { id: 'tail', primitive: 'tube', material: 'eye', anchor: 'back', from: [-0.26, 1.02, 0], to: [-0.36, 1.18, 0], radius: 0.04, radius2: 0.02 },
    ],
  },
  unlock: null,
});
assert.ok(limblessSpec, 'Limbless custom sphere spec must validate cleanly');
const limblessLimbs = game.analyzeSkinLimbs(limblessSpec);
assert.equal(limblessLimbs.hasArms, false);
assert.equal(limblessLimbs.hasLegs, false);
assert.equal(game.makeRiderSkinBody(limblessSpec, { excludeLimbs: 'all' }).vertices.length,
  game.makeRiderSkinBody(limblessSpec).vertices.length);

const animatedSkinSpec = game.normalizeSkinSpec({
  schemaVersion: 1,
  id: 'humanoid-rider-test',
  label: '人形四肢测试',
  class: 'model',
  rig: 'shared-rider-v1',
  palette: { body: '#5a8f6c', skin: '#e0b394', shoe: '#2c3330' },
  proportions: camelResult.spec.proportions,
  headMode: 'separate',
  limbMode: 'full',
  animationProfile: 'seated-soft',
  accessories: [],
  allowedVehicles: ['bike', 'ebike', 'chair', 'trail'],
  bounds: { width: 1.04, height: 1.80, depth: 0.96 },
  triangleBudget: 2400,
  model: {
    version: 1,
    parts: [
      { id: 'body', primitive: 'ellipsoid', material: 'body', center: [-0.10, 1.18, 0], size: [0.17, 0.24, 0.19] },
      { id: 'head', primitive: 'ellipsoid', material: 'skin', center: [0.05, 1.56, 0], size: [0.13, 0.14, 0.13] },
      { id: 'left_ear', primitive: 'box', material: 'body', anchor: 'body', center: [0.04, 1.72, -0.10], size: [0.04, 0.08, 0.04] },
      { id: 'tail', primitive: 'tube', material: 'body', anchor: 'body', from: [-0.24, 1.02, 0], to: [-0.35, 1.15, 0], radius: 0.03, radius2: 0.02 },
      { id: 'left_arm', primitive: 'tube', material: 'body', anchor: 'body', from: [-0.02, 1.32, -0.15], to: [0.38, 1.06, -0.23], radius: 0.04, radius2: 0.03 },
      { id: 'right_arm', primitive: 'tube', material: 'skin', anchor: 'rightHand', from: [-0.02, 1.32, 0.15], to: [0.38, 1.06, 0.23], radius: 0.04, radius2: 0.03 },
      { id: 'left_leg', primitive: 'tube', material: 'body', anchor: 'leftFoot', from: [-0.18, 0.98, -0.12], to: [-0.06, 0.60, -0.14], radius: 0.05, radius2: 0.035 },
      { id: 'right_leg', primitive: 'tube', material: 'body', anchor: 'body', from: [-0.18, 0.98, 0.12], to: [-0.06, 0.60, 0.14], radius: 0.05, radius2: 0.035 },
      { id: 'left_shoe', primitive: 'box', material: 'shoe', anchor: 'leftFoot', center: [-0.03, 0.56, -0.14], size: [0.12, 0.06, 0.08] },
      { id: 'right_shoe', primitive: 'box', material: 'shoe', anchor: 'rightFoot', center: [-0.03, 0.56, 0.14], size: [0.12, 0.06, 0.08] },
    ],
  },
  unlock: null,
});
assert.ok(animatedSkinSpec, 'Humanoid animated limb skin spec must validate cleanly');
assert.equal(game.skinPartLimbRole({ id: 'left_ear', anchor: 'body' }), null);
assert.equal(game.skinPartLimbRole({ id: 'tail', anchor: 'body' }), null);
assert.equal(game.skinPartLimbRole({ id: 'left_arm', anchor: 'body' }), 'leftHand');
assert.equal(game.skinPartLimbRole({ id: 'right_leg', anchor: 'body' }), 'rightFoot');
const animatedAnalysis = game.analyzeSkinLimbs(animatedSkinSpec);
assert.equal(animatedAnalysis.hasArms, true);
assert.equal(animatedAnalysis.hasLegs, true);
assert.ok(game.makeRiderSkinBody(animatedSkinSpec, { excludeLimbs: 'all' }).vertices.length < game.makeRiderSkinBody(animatedSkinSpec).vertices.length);
const poseA = game.movingParts(0, game.IDENTITY, game.grips, { pedalPhase: 0, tuck: 0, stand: 0, skin: animatedSkinSpec });
const poseB = game.movingParts(0, game.IDENTITY, game.grips, { pedalPhase: Math.PI * 0.5, tuck: 0, stand: 0, skin: animatedSkinSpec });
const steerPivot = [0.483, 0.756, 0];
const steerLeft = game.multiply(game.placement(steerPivot, 0, 0.25, 0), game.placement(game.scale(steerPivot, -1)));
const poseSteered = game.movingParts(0, steerLeft, game.grips, { pedalPhase: 0, tuck: 0, stand: 0, skin: animatedSkinSpec });
assert.ok(poseA.shape.vertices.length > 0 && poseA.shape.vertices.every(Number.isFinite));
assert.notDeepEqual(poseA.shape.vertices, poseB.shape.vertices, 'Custom bike legs/cranks must animate with pedalPhase');
assert.notDeepEqual(poseA.shape.vertices, poseSteered.shape.vertices, 'Custom bike arms must respond to steering');
const limblessBikePose = game.movingParts(0, game.IDENTITY, game.grips, { pedalPhase: 0, tuck: 0, stand: 0, skin: limblessSpec });
assert.ok(limblessBikePose.shape.vertices.length > 0, 'Limbless skin on bike must still render bicycle cranks/pedals');
const fakeEbike = { kind: 'ebike', pivot: [0.46, 0.61, 0], grip: [0.398, 1.038, 0.25], steering: true, skinTransform: game.vehicleSkinTransform('ebike') };
const poweredArm0 = game.movingPoweredSkinArms(animatedSkinSpec, fakeEbike, 0);
const poweredArmTurn = game.movingPoweredSkinArms(animatedSkinSpec, fakeEbike, 0.8);
assert.ok(poweredArm0.vertices.length > 0 && poweredArm0.vertices.every(Number.isFinite));
assert.notDeepEqual(poweredArm0.vertices, poweredArmTurn.vertices, 'Custom arms on ebike must steer with handlebars');
assert.equal(game.movingPoweredSkinArms(limblessSpec, fakeEbike, 0.8).vertices.length, 0);
for (const kind of ['ebike', 'chair', 'trail']) {
  const mountTransform = game.vehicleSkinTransform(kind);
  assert.equal(mountTransform.length, 16);
  const rig = { kind, skinTransform: mountTransform, frame: 'f', body: 'defaultBody', wheels: 'w', mounts: [], steering: null, pivot: [0, 0, 0] };
  const defaultPose = game.poweredPose(rig, game.IDENTITY, { steering: 0, travel: 0 });
  assert.equal(defaultPose[1][0], 'defaultBody');
  const customPose = game.poweredPose(rig, game.IDENTITY, { steering: 0, travel: 0 }, 'customSkinMesh');
  assert.equal(customPose[1][0], 'customSkinMesh');
  const ghost = game.makeGhostFile(event, {
    vehicle: kind, time: 60_000, splits: Array(event.gates.length).fill(60_000),
    samples: [[0, 0, 0, 0, 0, 0, 0, 0], [60_000, 1, 0, 1, 0, 5, 1, 0]], corners: [],
  }, { name: 'SkinQA', paint: 'classic', skinId: camelResult.spec.id, skinSpec: camelResult.spec });
  assert.equal(ghost.rider.skinId, camelResult.spec.id);
  assert.equal(ghost.rider.skinSpec.id, camelResult.spec.id);
}

for (const key of [
  '当前为 HTTPS 网页，浏览器会拦截明文 HTTP 房主地址。请改用桌面版「启动游戏.bat」或由房主提供 HTTPS 联机地址。',
  '连接联机服务超时，请检查房主是否在线、防火墙放行或代理设置。',
  '无法连接本机联机服务。请通过「启动游戏.bat」重启游戏，并检查代理是否绕过 127.0.0.1 或防火墙是否放行。',
  '无法连接房主地址，请确认房主已开房、IP/端口正确，且未被防火墙或代理拦截。',
  '当前在线网页为静态站点，无法直接开房。请下载桌面版并通过「启动游戏.bat」建房，或填入 HTTPS 房主地址加入。',
  '离线网页模式无法在本机建房。请下载内置 Node.js 的 Windows 完整版并通过「启动游戏.bat」打开（或安装 Node.js 22+）。',
  '当前为离线网页模式，无法在本机建房。请通过「启动游戏.bat」打开游戏（Windows 完整版已内置 Node.js，或自备 Node.js 22+）；若要加入好友，请填入房主 IP 和房间码。',
]) {
  assert.equal(typeof englishText[key], 'string', `Missing English translation: ${key}`);
  assert.ok(englishText[key].trim().length > 0, `Empty English translation: ${key}`);
}

console.log('Shared four-vehicle part catalogs, solo/room prices, wet/puddle grip, five-slot trade-offs, powered skill and rocket timing, unranked isolation and SkinSpec checks passed.');
