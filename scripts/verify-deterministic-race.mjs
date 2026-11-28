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

{
  const previousPreferences = game.getPreferences(), previousStorage = game.getStorage();
  const preferences = { ...previousPreferences, weather: 'day', traffic: 'sparse', collision: false,
    windSpeed: 0, windDir: 0, windMode: 'steady' };
  const records = new Map();
  game.setPreferences(preferences);
  game.setStorage({ getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value) });
  const makeTrial = () => new game.TimeTrial(event, game.stockBike, 'bike', game.createWorldQuery('szu'));
  const step = { gas: false, brake: false, left: false, right: false, sprint: false };
  const finish = (trial, time) => {
    trial.splits = event.gates.map((_, index) => time * index / (event.gates.length - 1));
    trial.finishAt(time);
    assert.equal(trial.lastRun.environment, trial.environmentKey, 'Result uses the environment captured at launch');
    return game.checkpointRecordKey(event, 'bike', trial.environmentKey);
  };
  try {
    const calm = makeTrial();
    calm.start();
    const calmIdentity = calm.environmentKey;
    assert.equal(game.activeWind(calm), null, 'Calm trial starts without wind');
    Object.assign(preferences, { windSpeed: 15, traffic: 'off', collision: true });
    assert.equal(game.activeWind(calm), null, 'Countdown keeps the captured calm environment');
    assert.equal(game.trialTraffic(calm).mode, 'sparse', 'Upcoming traffic does not replace the staged traffic');
    while (calm.phase === 'count') calm.step(step);
    calm.rider.heading = Math.PI;
    calm.step(step);
    assert.equal(calm.feedbackStats.headwindLoad, 0, 'Race physics does not detect the upcoming headwind');
    assert.equal(calm.environmentKey, calmIdentity);
    const calmKey = finish(calm, 90_000);
    assert.equal(JSON.parse(records.get(calmKey)).time, 90_000);

    const legacyKey = game.checkpointRecordKey(event, 'bike');
    const ambiguous = { ...calm.lastRun, environment: null };
    records.set(legacyKey, JSON.stringify(ambiguous));
    const queued = makeTrial();
    queued.start();
    assert.equal(game.activeWind(queued)?.speed, 15, 'The next race captures the updated wind');
    assert.equal(game.trialTraffic(queued).mode, 'off', 'The next race captures the updated traffic');
    Object.assign(preferences, { traffic: 'sparse', collision: false });
    const windy = makeTrial();
    windy.start();
    assert.equal(game.trialTraffic(windy).mode, game.trialTraffic(calm).mode);
    assert.notEqual(windy.environmentKey, calmIdentity);
    assert.equal(windy.best, null, 'Other environments and unverified legacy records cannot seed the personal best');
    while (windy.phase === 'count') windy.step(step);
    windy.rider.heading = Math.PI;
    windy.step(step);
    assert.ok(windy.feedbackStats.headwindLoad > 0, 'The new race actually uses the captured headwind');
    const windyKey = finish(windy, 110_000);
    assert.notEqual(windyKey, calmKey);
    assert.equal(JSON.parse(records.get(windyKey)).time, 110_000, 'Each environment keeps its own result');

    const restoredWind = makeTrial();
    restoredWind.start();
    assert.equal(restoredWind.best, 110_000, 'Identical wind and traffic recover their saved personal best');
    assert.equal(restoredWind.reference.time, 110_000, 'Identical conditions recover the matching shadow');
    const windyRecord = records.get(windyKey);
    records.set(windyKey, records.get(calmKey));
    const mismatchedRecord = makeTrial();
    mismatchedRecord.start();
    assert.equal(mismatchedRecord.best, null, 'A copied result with a different environment cannot seed the personal best');
    records.set(windyKey, windyRecord);
    Object.assign(preferences, { windSpeed: 0, traffic: 'sparse', collision: false });
    const restoredCalm = makeTrial();
    restoredCalm.start();
    assert.equal(restoredCalm.best, 90_000, 'Returning to calm recovers the original result');
    assert.equal(records.get(legacyKey), JSON.stringify(ambiguous), 'Ambiguous archived record is retained');
  } finally {
    game.setPreferences(previousPreferences);
    game.setStorage(previousStorage);
  }
}

{
  const previousPreferences = game.getPreferences();
  const previousRoom = game.worldState.onlineRoom;
  const settings = { weather: 'day', collision: false, windDir: 4 };
  const round = { trafficSeed: 2318273997, windSeed: 2751345711, windMode: 'gust' };
  const makeTrial = () => new game.TimeTrial(event, game.stockBike, 'bike', game.createWorldQuery('szu'));
  try {
    for (const [traffic, windSpeed] of [['sparse', 0], ['sparse', 6], ['off', 6], ['off', 0]]) {
      const conditions = { ...settings, traffic, windSpeed, windMode: 'gust' };
      game.setPreferences({ ...previousPreferences, ...conditions });
      game.worldState.onlineRoom = { state: { ...conditions, round } };
      const online = makeTrial();
      online.online = true;
      assert.notEqual(online.start(), false);
      const onlineFormation = online.raceTraffic.vehicles;
      const onlineWinds = [0, 3, 18].map(clock => game.activeWind(online, clock));
      online.frames = [...event.benchmark.samples];
      online.splits = [...event.benchmark.splits];
      online.finishAt(event.benchmark.time);
      const file = game.makeGhostFile(event, online.lastRun, { name: 'Room QA', paint: 'classic' });
      game.worldState.onlineRoom = null;
      const { opponent } = game.loadFriendGhost(game.readGhostFile(JSON.stringify(file)));
      const solo = makeTrial();
      solo.start();
      assert.equal(solo.environmentKey === opponent.environment, traffic === 'off' && windSpeed === 0,
        'The default solo seeds match only when neither traffic nor gusts use a room seed');
      const duel = makeTrial();
      duel.select(event, opponent);
      assert.notEqual(duel.start(), false, 'Matching settings can replay the recorded room seeds');
      assert.equal(duel.environmentKey, opponent.environment);
      assert.equal(duel.reference, opponent);
      assert.deepEqual(duel.raceTraffic.vehicles, onlineFormation, 'The staged traffic matches the room formation');
      assert.deepEqual([0, 3, 18].map(clock => game.activeWind(duel, clock)), onlineWinds, 'Replay restores the room gust phase');
      if (traffic === 'sparse') {
        const anotherRoomKey = game.raceEnvironmentKey(event, { ...online.rideEnvironment, trafficSeed: round.trafficSeed + 1 });
        const group = makeTrial();
        group.select(event, opponent, [{ ...opponent, environment: anotherRoomKey }]);
        assert.equal(group.start(), false, 'A ghost group cannot mix different room seeds');
      }
      game.getPreferences().weather = 'rain';
      assert.equal(duel.start(), false, 'A room seed cannot override different settings');
      assert.equal(duel.environmentKey, opponent.environment, 'A rejected restart leaves the current environment in place');
    }
  } finally {
    game.worldState.onlineRoom = previousRoom;
    game.setPreferences(previousPreferences);
  }
}

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
console.log('Deterministic traffic, frozen and replayed room environments, scoped personal records, AI, courier targets and race feedback passed.');
