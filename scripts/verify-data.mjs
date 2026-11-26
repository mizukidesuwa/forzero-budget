import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as game from '../src/test-exports.js';

const require = createRequire(import.meta.url);
const shared = require('../szu-litchi-dev/online/tuning-190.cjs');
const { roomBuildProblem } = require('../szu-litchi-dev/online/room-rules.cjs');
assert.equal(game.tuning190, shared);

for (const [vehicle, prices] of Object.entries(shared.prices)) {
  const options = vehicle === 'bike'
    ? game.bikePartOptions
    : Object.fromEntries(game.vehicleTuningChoices[vehicle].map(slot => [slot.key, slot.options]));
  assert.deepEqual(Object.keys(options), Object.keys(prices), vehicle);
  for (const [slot, parts] of Object.entries(prices)) {
    assert.deepEqual(Object.keys(options[slot]).sort(), Object.keys(parts).sort(), vehicle + '/' + slot);
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

console.log('Shared four-vehicle part catalogs, price through solo/room gates, wet/puddle grip, unranked isolation and SkinSpec checks passed.');
