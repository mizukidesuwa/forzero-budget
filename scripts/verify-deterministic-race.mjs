import assert from 'node:assert/strict';
import * as game from '../src/test-exports.js';

const event = game.coursesByCampus.szu[0];
assert.equal(game.trafficSeedFor(event), game.trafficSeedFor(event), 'fixed-course traffic seed is stable');
const reverse = game.getCourseVariant(event, { direction: 'reverse', laps: 1 });
assert.notEqual(game.trafficSeedFor(event), game.trafficSeedFor(reverse), 'course variants get distinct traffic seeds');
assert.notEqual(game.raceEnvironmentKey(event), game.raceEnvironmentKey({ ...event, environment: { weather: 'rain', speed: 1.4, angle: 0 } }), 'environment is part of race identity');

const { run } = game.vehicleBenchmark(event, 'bike');
const standard = game.rivalPaceProfile(event, run, 'bike', run.time, 'standard', 0);
const strong = game.rivalPaceProfile(event, run, 'bike', run.time, 'strong', 0);
assert.ok(standard.samples.some((sample, index) => Math.abs(sample[0] - strong.samples[index][0]) > .001), 'AI pace profiles differ by difficulty');

game.setActiveCampus('szu');
game.buildRidingScene('szu');
const trial = new game.TimeTrial(event, game.stockBike, 'bike', game.createWorldQuery('szu'));
trial.raceMode = 'team';
trial.aiDifficulty = 'standard';
trial.start();
const strongTrial = new game.TimeTrial(event, game.stockBike, 'bike', game.createWorldQuery('szu'));
strongTrial.raceMode = 'team';
strongTrial.aiDifficulty = 'strong';
strongTrial.start();
assert.notEqual(trial.rivals[0].lineBias, strongTrial.rivals[0].lineBias, 'AI line selection follows difficulty');
assert.ok(trial.rivals[0].behavior.followGain < strongTrial.rivals[0].behavior.followGain, 'strong AI follows more decisively');

const sites = [
  { name: 'A', p: [0, 0, 0] },
  { name: 'B', p: [100, 0, 0] },
  { name: 'C', p: [0, 0, 100] },
];
const courierSeed = game.courierSeedFor('szu', 'S2-W20261123');
const targetA = game.pickCourierTarget(sites, [0, 0, 0], [], null, game.randomSource(courierSeed));
const targetB = game.pickCourierTarget(sites, [0, 0, 0], [], null, game.randomSource(courierSeed));
assert.equal(targetA.name, targetB.name, 'courier targets are reproducible for a session seed');

const feedback = game.summarizeRaceFeedback({ draftingMs: 1000, looseSurfaceMs: 500, headwindLoad: 5, collisionCount: 1 },
  [{ duration: 1200 }], [{ duration: 1000 }]);
assert.equal(feedback.collisionCount, 1);
assert.ok(feedback.highlights.length >= 2, 'race feedback exposes actionable highlights');
console.log('2.1.2 deterministic traffic/environment keys, differentiated AI, seeded courier targets and race feedback passed.');
