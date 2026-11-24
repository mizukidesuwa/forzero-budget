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
console.log('Shared four-vehicle part catalogs, price through solo/room gates, wet/puddle grip and unranked isolation passed.');
