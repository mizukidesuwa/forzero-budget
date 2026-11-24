import assert from 'node:assert/strict';
import * as game from '../src/test-exports.js';

const { chargeSeconds, burstSeconds, vehicles } = game.draftingRules;
const path = game.travelTable([[0, 0, 0], [100, 0, 0]]);
const actor = { path, start: 40, direction: 1, offset: 0, speed: 8, halfL: 2.25 };
for (const vehicle of Object.keys(vehicles)) {
  const rider = { vehicle, paved: true, heading: 0, speed: 7, position: [30, 0, 0] };
  const find = tracked => game.trafficWakeAt(rider, 0, [actor], null, tracked);
  assert.ok(game.trafficDraftingAt(rider, 0, [actor]), vehicle);
  let draft = null;
  for (let i = 0; i < 150; i++) draft = game.advanceDraft(draft, find(actor), chargeSeconds / 150, true);
  assert.equal(draft.charge, 1, vehicle);
  assert.equal(game.advanceDraft(draft, null, .01, true).burst, 0, 'losing the leader straight ahead does not trigger');
  rider.position[2] = 2;
  const cut = find(actor);
  assert.ok(cut && !cut.inside);
  assert.equal(game.advanceDraft(draft, cut, .01, false).burst, 0, 'braking does not trigger');
  draft = game.advanceDraft(draft, cut, .01, true);
  assert.equal(draft.burst, burstSeconds);
  assert.equal(game.advanceDraft(draft, cut, burstSeconds, true).burst, 0);
  rider.position = [30, 5, 0];
  assert.equal(find(actor), null, 'different bridge level');
  rider.position = [30, 0, 0];
  assert.ok(game.findWake(rider, [{ id: 'opponent', speed: 8, heading: 0, position: [37, 0, 0] }]));
}
console.log('Four-vehicle wake tracking, charge, lateral exit and bridge separation passed.');

const storage = new Map();
game.setStorage({
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
});
game.setActiveCampus('shunde');
game.buildRidingScene('shunde');
const loop = game.parkCourse, query = game.createWorldQuery('shunde');
assert.ok(game.courseIsLoop(loop));
const reverse = game.getCourseVariant(loop, { direction: 'reverse', laps: 3 });
assert.equal(game.getCourseVariant(loop, { direction: 'reverse', laps: 3 }), reverse);
assert.equal(reverse.variant.laps, 3);
assert.ok(Math.abs(reverse.length - loop.length * 3) < .01);
assert.equal(reverse.gates.length, (loop.gates.length - 1) * 3 + 1);
assert.equal(reverse.benchmark.splits.length, reverse.gates.length);
assert.equal(reverse.stages.at(-1).to, reverse.length);
assert.ok(game.recordKey(reverse, 'chair').endsWith(':chair:rev:3lap'));
const { run } = game.vehicleBenchmark(reverse, 'chair');
const file = game.readGhostFile(JSON.stringify(game.makeGhostFile(reverse, { ...run, vehicle: 'chair' }, { name: 'QA', paint: 'classic' })));
assert.equal(game.loadFriendGhost(file, 'shunde').event, reverse);
assert.equal(game.getCourseVariant(game.mountainUpCourse ?? game.coursesByCampus.shunde[1], { laps: 3 }).variant, undefined);

const trial = new game.TimeTrial(reverse, game.stockBike, 'chair', query);
trial.start();
for (const [i, gate] of reverse.gates.entries()) {
  trial.rider.position = game.courseGround(reverse, game.add(gate.p, game.scale(gate.f, .3)), gate.rise);
  const before = game.courseGround(reverse, game.add(gate.p, game.scale(gate.f, -.3)), gate.rise);
  trial.elapsed = 1200 + i * 6000;
  const finished = trial.recordCheckpoint(before);
  assert.equal(trial.nextGate, i + 1, 'ordered gate ' + i);
  assert.equal(finished, i === reverse.gates.length - 1);
}
assert.equal(trial.phase, 'done');
assert.equal(trial.splits.length, reverse.gates.length);
assert.ok(storage.has(game.checkpointRecordKey(reverse, 'chair')));
assert.ok(!storage.has(game.checkpointRecordKey(loop, 'chair')));

for (const vehicle of Object.keys(vehicles)) {
  const team = new game.TimeTrial(loop, game.stockBike, vehicle, query);
  team.raceMode = 'team';
  team.start();
  const [ace, second, third] = team.rivals;
  assert.ok(ace.progress > second.progress && second.progress > third.progress);
  assert.ok(third.progress > -game.benchmarkRules.startOffset);
  assert.ok(ace.pose.startProtected);
  assert.ok(ace.target <= game.vehicleBenchmark(loop, vehicle).medals.gold);
  assert.ok(ace.target >= game.authorMedalTime(loop, vehicle));
  assert.ok(ace.run.bursts.length > 0);
  const strong = new game.TimeTrial(loop, game.stockBike, vehicle, query);
  strong.aiDifficulty = 'strong';
  strong.raceMode = 'duel';
  strong.start();
  assert.ok(strong.rivals[0].target < ace.target);
  assert.ok(strong.rivals[0].target >= game.authorMedalTime(loop, vehicle));
  team.finishAt(72000);
  assert.equal(game.aiWins(loop, vehicle, 'team', 'standard'), 1);
  assert.equal(game.aiWins(loop, vehicle, 'duel', 'strong'), 0);
  team.finishAt(72000);
  strong.unranked = true;
  strong.finishAt(72000);
  assert.equal(game.aiWins(loop, vehicle, 'team', 'standard'), 1);
  assert.ok(!storage.has(game.checkpointRecordKey(loop, vehicle)));
  assert.equal(game.trialMedal(team), '');
}
console.log('Reverse three-lap timing and ghost round-trip, all AI grids and difficulties, and legal win isolation passed.');
