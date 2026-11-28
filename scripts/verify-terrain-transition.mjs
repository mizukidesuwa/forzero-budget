import assert from 'node:assert/strict';
import {
  CITY_ASPHALT, PHYSICS_STEP, ROAD_Y, createWorldQuery, getPreferences,
  makeCyclist, moveCyclist, registerCampus, setPreferences,
} from '../src/test-exports.js';

const roadY = ROAD_Y + .002;
const drive = { gas: true, brake: false, left: false, right: false, sprint: false };
const step = (rider, query, input = drive) => moveCyclist(rider, input, PHYSICS_STEP, false, null, null, [], query);

function terrain(campus, rideElevation, overrides = {}) {
  registerCampus(campus, { rideElevation, safeToRide: () => true, surfaceAt: () => true, ...overrides });
  return createWorldQuery(campus);
}

function riderAt(query, { x, y = ROAD_Y, z = 0, heading = 0, speed = 6, vehicle = 'ebike' }) {
  const rider = makeCyclist({ campus: query.campus, spawn: [x, y, z], heading }, undefined, vehicle, null, query);
  rider.speed = speed;
  return rider;
}

const ledge = x => x >= 0 ? 8 : 0;
const cliff = terrain('test-cliff', ledge, {
  riderGrade: ([x], heading) => ledge(x + .5 * Math.cos(heading)) - ledge(x - .5 * Math.cos(heading)),
});
for (const vehicle of ['bike', 'ebike', 'trail', 'chair']) {
  const rider = riderAt(cliff, { x: -20, speed: 0, vehicle });
  for (let tick = 0; tick < 9 / PHYSICS_STEP; tick++) step(rider, cliff);
  assert.ok(rider.position[0] > -.1 && rider.position[0] < 0, vehicle + ' stops at the cliff');
  assert.ok(Math.abs(rider.position[1] - roadY) < .001, vehicle + ' remains on the lower surface');
  assert.equal(rider.hazard, null);
  assert.ok(Math.abs(rider.travel - (20 + rider.position[0])) < 1e-6, vehicle + ' gains no vertical travel at the wall');
}

const reversing = riderAt(cliff, { x: -.01, heading: Math.PI, speed: -2 });
reversing.stationaryBrake = .3;
step(reversing, cliff, { ...drive, gas: false, brake: true });
assert.equal(reversing.position[0], -.01, 'reverse cannot climb the cliff either');

const alongFace = riderAt(cliff, { x: -.02, heading: Math.PI / 4 });
step(alongFace, cliff);
assert.equal(alongFace.position[0], -.02);
assert.ok(alongFace.position[2] > 0, 'oblique approach slides along the face');

const markedCliff = terrain('test-marked-cliff', ledge, {
  cliffHazardAt: (x, _z, previousY) => x >= 0 || previousY > 4,
});
const belowCliff = riderAt(markedCliff, { x: -.03 });
step(belowCliff, markedCliff);
assert.ok(belowCliff.position[0] < 0);
assert.equal(belowCliff.hazard, null, 'hitting an uphill face is not a fall');
const aboveCliff = riderAt(markedCliff, { x: .03, heading: Math.PI });
step(aboveCliff, markedCliff);
assert.ok(aboveCliff.position[0] < 0);
assert.equal(aboveCliff.hazard, 'cliff', 'descending off a marked cliff still triggers recovery');

const curb = terrain('test-curb', x => x >= 0 ? .15 : 0);
const curbRider = riderAt(curb, { x: -.02 });
step(curbRider, curb);
assert.ok(curbRider.position[0] > 0 && curbRider.position[1] > .15, 'small curb remains passable');

const stepLimit = terrain('test-step-limit', x => x >= 0 ? 8.4 : 8);
const atStepLimit = riderAt(stepLimit, { x: -.02 });
step(atStepLimit, stepLimit);
assert.ok(atStepLimit.position[0] > 0, 'a 0.40 m step remains passable at elevation');

const ramp = terrain('test-ramp', x => 10 * Math.max(0, x));
const rampRider = riderAt(ramp, { x: -.02, speed: 12, vehicle: 'trail' });
step(rampRider, ramp);
assert.ok(rampRider.position[0] > 0 && rampRider.position[1] > .7, 'a continuous rise is passable even with a large rise per tick');

const ridge = terrain('test-ridge', x => x >= 0 && x < .10 ? 2 : 0);
const ridgeRider = riderAt(ridge, { x: -.025, speed: 18, vehicle: 'trail' });
step(ridgeRider, ridge);
assert.ok(ridgeRider.position[0] < 0, 'a narrow ridge blocks even when the end point is beyond it');

const deck = terrain('test-deck', () => 0, { flyoverAt: x => x < 0 ? 6 : 14 });
const belowDeck = riderAt(deck, { x: -.02 });
step(belowDeck, deck);
assert.ok(belowDeck.position[0] > 0 && belowDeck.position[1] < .1, 'ground travel ignores the deck overhead');
const onDeck = riderAt(deck, { x: -.02, y: 6 + roadY - CITY_ASPHALT });
step(onDeck, deck);
assert.equal(onDeck.position[0], -.02, 'a step within the active deck surface blocks travel');
assert.ok(Math.abs(onDeck.position[1] - (6 + roadY - CITY_ASPHALT)) < .001);

const bridgeOverCliff = terrain('test-bridge-over-cliff', ledge, { flyoverAt: () => 14 });
const upperRider = riderAt(bridgeOverCliff, { x: -.02, y: 14 + roadY - CITY_ASPHALT });
step(upperRider, bridgeOverCliff);
assert.ok(upperRider.position[0] > 0, 'a cliff below the active bridge does not block it');
assert.ok(Math.abs(upperRider.position[1] - (14 + roadY - CITY_ASPHALT)) < .001);
const lowerRider = riderAt(bridgeOverCliff, { x: -.02 });
step(lowerRider, bridgeOverCliff);
assert.equal(lowerRider.position[0], -.02, 'the bridge does not make the cliff below it passable');

const elevatedGround = terrain('test-elevated-ground', () => 8, { flyoverAt: () => 2 });
const aboveRoad = riderAt(elevatedGround, { x: -.02 });
step(aboveRoad, elevatedGround);
assert.ok(aboveRoad.position[0] > 0 && aboveRoad.position[1] > 8, 'a lower deck does not pull a rider off elevated ground');

const buriedDeck = terrain('test-buried-deck', x => x < 0 ? 8 : 10, { flyoverAt: () => 7.8 });
const ridingAboveDeck = riderAt(buriedDeck, { x: -.02, y: roadY });
step(ridingAboveDeck, buriedDeck);
assert.equal(ridingAboveDeck.position[0], -.02, 'a deck just below the ground cannot hide a step');
assert.ok(Math.abs(ridingAboveDeck.position[1] - (8 + roadY)) < .001);

const cliffAboveDeck = terrain('test-cliff-above-deck', ledge, { flyoverAt: () => 6 });
const ridingIntoCliff = riderAt(cliffAboveDeck, { x: -.02, y: 6 + roadY - CITY_ASPHALT });
step(ridingIntoCliff, cliffAboveDeck);
assert.equal(ridingIntoCliff.position[0], -.02, 'a ground step above an active deck blocks the rider');

const deckEntry = terrain('test-deck-entry', () => 8, { flyoverAt: x => x < 0 ? null : 8.39 });
const enteringDeck = riderAt(deckEntry, { x: -.02 });
step(enteringDeck, deckEntry);
assert.ok(enteringDeck.position[0] > 0 && enteringDeck.position[1] > 8.39, 'the shallow deck entry on elevated terrain stays rideable');

const preferences = getPreferences();
try {
  setPreferences({ ...preferences, collision: true });
  const pushed = riderAt(cliff, { x: -.20 });
  pushed.rivalPoses = [{ id: 'rival', vehicle: 'ebike', heading: 0, position: [-.30, roadY, 0] }];
  step(pushed, cliff);
  assert.equal(pushed.collisionCount, 1, 'rider contact was applied');
  assert.equal(pushed.position[0], -.20, 'rider contact cannot push the player up a cliff');
} finally {
  setPreferences(preferences);
}

console.log('Terrain transitions passed: four stock vehicles, reverse, wall sliding, cliff recovery trigger, curb, steep ramp, swept ridge, bridge layers and rider contact.');
