import assert from 'node:assert/strict';
import {
  TimeTrial,
  blindCourseKey,
  blindNavRules,
  buildRidingScene,
  chaseCourseKey,
  chaseRules,
  courseIsLoop,
  coursesByCampus,
  createBlindNav,
  createShadowChase,
  createWorldQuery,
  getActiveWeatherId,
  knownLaunchMode,
  loadBest,
  nearestCourierLandmark,
  relativeBearing,
  sampleChaseRunner,
  setActiveCampus,
  setActiveWeather,
  setStorage,
  stockBike,
  vehicleBenchmark,
} from '../src/test-exports.js';

const backing = new Map();
setStorage({
  getItem: key => (backing.has(key) ? backing.get(key) : null),
  setItem: (key, value) => backing.set(key, String(value)),
  removeItem: key => backing.delete(key),
});

assert.equal(knownLaunchMode('solo'), 'solo');
assert.equal(knownLaunchMode('team'), 'team');
assert.equal(knownLaunchMode('duel'), 'duel');
assert.equal(knownLaunchMode('chase'), 'chase');
assert.equal(knownLaunchMode('blind'), 'blind');
assert.equal(knownLaunchMode('turf-war'), 'solo');
assert.equal(knownLaunchMode(null), 'solo');
assert.ok(chaseRules.difficulties.standard.paceScale < 0.75, 'Standard runner must be slower than chaser');
assert.ok(chaseRules.difficulties.strong.paceScale < 0.85, 'Strong runner must still give chaser pace advantage');

setActiveCampus('szu');
buildRidingScene('szu');
const szuQuery = createWorldQuery('szu');

const szuCourses = coursesByCampus.szu;
const allCourses = [...coursesByCampus.szu, ...coursesByCampus.ucl, ...coursesByCampus.shunde];
const loopCourse = allCourses.find(c => courseIsLoop(c));
const p2pCourse = szuCourses.find(c => !courseIsLoop(c));
assert.ok(loopCourse, 'Expected at least one loop course across campuses');
assert.ok(p2pCourse, 'Expected at least one SZU point-to-point course');

const p2pBenchmark = vehicleBenchmark(p2pCourse, 'bike').run;
if (loopCourse.campus !== 'szu') {
  setActiveCampus(loopCourse.campus);
  buildRidingScene(loopCourse.campus);
}
const loopBenchmark = vehicleBenchmark(loopCourse, 'bike').run;
setActiveCampus('szu');
buildRidingScene('szu');
assert.ok(p2pBenchmark?.samples?.length > 2, 'Point-to-point benchmark should have samples');
assert.ok(loopBenchmark?.samples?.length > 2, 'Loop benchmark should have samples');

// 1. ShadowChase lifecycle: headstart -> active -> ping -> flyover check -> catch -> storage isolation
{
  backing.clear();
  const chase = createShadowChase();
  const sounds = [];
  const playSound = key => sounds.push(key);

  const started = chase.start({
    event: p2pCourse,
    vehicle: 'bike',
    difficulty: 'standard',
    reference: p2pBenchmark,
    runnerProfile: { name: 'Benchmark Runner', vehicle: 'bike' },
    unranked: false,
    campus: 'szu',
    landmarkAt: nearestCourierLandmark,
  });
  assert.equal(started, true);
  assert.equal(chase.phase, 'headstart');
  assert.equal(chase.isRunning(), true);
  assert.equal(chase.active, true);
  assert.equal(chase.headStartTotalSec, chaseRules.difficulties.standard.countdownSec);
  assert.ok(chase.runnerElapsedMs > 0 && chase.runnerElapsedMs <= p2pBenchmark.time * 0.28 + 1, 'Runner must spawn ahead on the course');
  assert.ok(chase.lastPing?.position?.length === 3, 'Initial ping should exist');
  const overlay = chase.mapOverlay();
  assert.equal(overlay?.hideCourse, true);
  assert.ok(overlay?.chasePing, 'Overlay should expose chasePing');

  const rider = {
    position: [p2pCourse.gates[0].p[0] + 1000, p2pCourse.gates[0].p[1], p2pCourse.gates[0].p[2] + 1000],
    heading: 0,
    speed: 0,
    yawRate: 0,
    throttle: 0,
    brake: 0,
  };

  for (let i = 0; i < chase.headStartTotalSec; i += 1) {
    chase.tick(1.0, rider, { playSound, landmarkAt: nearestCourierLandmark });
  }
  assert.equal(chase.phase, 'active');
  assert.ok(sounds.includes('go'), 'Transition out of headstart must emit go sound');
  assert.ok(sounds.includes('countdown'), 'Headstart seconds must emit countdown sound');

  const pingAtBefore = chase.lastPing.atMs;
  sounds.length = 0;
  chase.tick(chaseRules.difficulties.standard.pingIntervalMs / 1000 + 0.05, rider, {
    playSound,
    landmarkAt: nearestCourierLandmark,
  });
  assert.equal(chase.phase, 'active');
  assert.ok(sounds.includes('ping'), 'Ping interval should trigger ping sound');
  assert.ok(chase.lastPing.atMs > pingAtBefore, 'Ping timestamp should advance');

  // Far away -> invisible & proximity 'far'
  assert.equal(chase.visible, false);
  assert.equal(chase.proximity, 'far');
  assert.equal(chase.visibleGhostPose(), null);

  // Within terrorDistance but outside revealDistance -> invisible & proximity 'near'
  rider.position = [
    chase.runnerPose.position[0] + (chaseRules.difficulties.standard.revealDistance + chaseRules.difficulties.standard.terrorDistance) * 0.5,
    chase.runnerPose.position[1],
    chase.runnerPose.position[2],
  ];
  chase.tick(0.05, rider, { playSound, landmarkAt: nearestCourierLandmark });
  assert.equal(chase.visible, false);
  assert.equal(chase.proximity, 'near');

  // Within revealDistance -> visible & locked, and within catchDistance horizontally but too high vertically -> NO catch
  rider.position = [
    chase.runnerPose.position[0] + 2,
    chase.runnerPose.position[1] + chaseRules.difficulties.standard.catchHeight + 1.5,
    chase.runnerPose.position[2],
  ];
  chase.tick(0.05, rider, { playSound, landmarkAt: nearestCourierLandmark });
  assert.equal(chase.visible, true);
  assert.equal(chase.proximity, 'locked');
  assert.ok(chase.visibleGhostPose(), 'Visible ghost pose should be emitted within revealDistance');
  assert.equal(chase.phase, 'active', 'Flyover vertical gap exceeding catchHeight must not trigger catch');

  // Close within both catchDistance and catchHeight -> caught
  rider.position = [
    chase.runnerPose.position[0] + 1,
    chase.runnerPose.position[1] + 0.5,
    chase.runnerPose.position[2],
  ];
  sounds.length = 0;
  chase.tick(0.05, rider, { playSound, landmarkAt: nearestCourierLandmark });
  assert.equal(chase.phase, 'caught');
  assert.ok(sounds.includes('catch'));
  assert.equal(chase.progress.wins, 1);
  assert.equal(chase.progress.attempts, 1);
  assert.equal(chase.isBest, true);
  assert.ok(chase.progress.bestByKey[chaseCourseKey(p2pCourse, 'bike')] > 0);
  assert.equal(loadBest(p2pCourse, 'bike'), null, 'ShadowChase must never overwrite standard TimeTrial best');

  // Unranked chase does not write wins/best
  const prevWins = chase.progress.wins;
  const prevAttempts = chase.progress.attempts;
  chase.start({
    event: p2pCourse,
    vehicle: 'bike',
    difficulty: 'standard',
    reference: p2pBenchmark,
    unranked: true,
    campus: 'szu',
  });
  for (let i = 0; i < chase.headStartTotalSec; i += 1) chase.tick(1.0, rider);
  rider.position = [...chase.runnerPose.position];
  chase.tick(0.05, rider);
  assert.equal(chase.phase, 'caught');
  assert.equal(chase.progress.wins, prevWins);
  assert.equal(chase.progress.attempts, prevAttempts);
}

// 2. Loop course 2-lap escape vs P2P single-run escape + rejoin penalty
{
  const midLoop = sampleChaseRunner(loopCourse, loopBenchmark, loopBenchmark.time * 1.15, loopCourse.campus);
  assert.ok(midLoop && midLoop.escaped === false, 'Loop chase runner should not escape after lap 1');
  const endLoop = sampleChaseRunner(loopCourse, loopBenchmark, loopBenchmark.time * chaseRules.loopLaps + 100, loopCourse.campus);
  assert.equal(endLoop.escaped, true, 'Loop chase runner should escape after loopLaps');

  const endP2p = sampleChaseRunner(p2pCourse, p2pBenchmark, p2pBenchmark.time + 10, 'szu');
  assert.equal(endP2p.escaped, true, 'Point-to-point chase runner should escape at finish');

  const chase = createShadowChase();
  chase.start({
    event: p2pCourse,
    vehicle: 'bike',
    difficulty: 'strong',
    reference: p2pBenchmark,
    campus: 'szu',
  });
  const farRider = { position: [5000, 0, 5000], heading: 0, speed: 5, yawRate: 1, throttle: 1, brake: 0 };
  for (let i = 0; i < chase.headStartTotalSec; i += 1) chase.tick(1.0, farRider);
  const beforeElapsed = chase.elapsedMs;
  const sounds = [];
  const rejoined = chase.rejoin(farRider, szuQuery, key => sounds.push(key));
  assert.equal(rejoined, true);
  assert.ok(sounds.includes('rejoin'));
  assert.equal(chase.elapsedMs, beforeElapsed + chaseRules.rejoinPenaltyMs);
  assert.equal(farRider.speed, 0);

  // Advance beyond escape time
  const jumpSec = (p2pBenchmark.time / 1000) / chaseRules.difficulties.strong.paceScale + 2;
  farRider.position = [5000, 0, 5000];
  chase.tick(jumpSec, farRider, { playSound: key => sounds.push(key) });
  assert.equal(chase.phase, 'escaped');
}

// 3. BlindNav weather save/restore, visibility flags, bell cooldown, hazard detection, storage isolation
{
  backing.clear();
  setActiveWeather('rain');
  assert.equal(getActiveWeatherId(), 'rain');

  const blind = createBlindNav();
  assert.deepEqual(blind.visibility(), {
    hideMinimap: false,
    hideBigMap: false,
    hideRoute: false,
    hideBrakeLine: false,
    showTouchBell: false,
  });

  // Enabled false -> enter does nothing
  assert.equal(blind.enter(getActiveWeatherId(), setActiveWeather), false);
  assert.equal(getActiveWeatherId(), 'rain');

  blind.setEnabled(true);
  assert.equal(blind.enter(getActiveWeatherId(), setActiveWeather), true);
  assert.equal(blind.active, true);
  assert.equal(getActiveWeatherId(), 'night');
  assert.deepEqual(blind.visibility(), {
    hideMinimap: true,
    hideBigMap: true,
    hideRoute: true,
    hideBrakeLine: true,
    showTouchBell: true,
  });

  // Relative bearing directions
  const rider = { position: [0, 0, 0], heading: 0, speed: 9.0, steering: 0.9, paved: true };
  assert.equal(relativeBearing(rider, [20, 0, 0]).label, '正前');
  assert.equal(relativeBearing(rider, [0, 0, 20]).label, '右侧');
  assert.equal(relativeBearing(rider, [-20, 0, 0]).label, '正后');
  assert.equal(relativeBearing(rider, [0, 0, -20]).label, '左侧');

  // Bell pulse and cooldown (updated 2000ms cooldown / 3500ms pulse)
  assert.equal(blindNavRules.bellCooldownMs, 2000);
  assert.equal(blindNavRules.bellPulseMs, 3500);
  const firstBell = blind.triggerBell(1000, rider, { position: [0, 0, 35], label: '演会厅' });
  assert.equal(firstBell.triggered, true);
  assert.equal(firstBell.bearing.label, '右侧');
  assert.equal(firstBell.bearing.distance, 35);
  assert.equal(blind.bellPulseUntilMs, 1000 + blindNavRules.bellPulseMs);

  // Active bell echo must never be overwritten by hazard tick
  const sounds = [];
  assert.equal(blind.tick(2200, rider, szuQuery, 'szu', key => sounds.push(key)), null, 'Bell pulse window must suppress hazards');

  // Cooldown press extends pulse instead of dropping to warning
  const blockedBell = blind.triggerBell(2200, rider, { position: [0, 0, 35], label: '演会厅' });
  assert.equal(blockedBell.triggered, false);
  assert.ok(blockedBell.cooldownMs > 0);
  assert.ok(blind.bellPulseUntilMs >= 2200 + 1500);

  const secondBell = blind.triggerBell(1000 + blindNavRules.bellCooldownMs + 1, rider, { position: [30, 0, 0], label: '南门' });
  assert.equal(secondBell.triggered, true);
  assert.equal(secondBell.bearing.label, '正前');

  // Hazard audio probe fires only after bell pulse expires, and triggerBell clears active hazard immediately
  const hazard = blind.tick(10_000, rider, szuQuery, 'szu', key => sounds.push(key));
  assert.ok(hazard, 'Sharp turn at speed should report a blind navigation hazard');
  assert.ok(sounds.includes('hazard'));
  assert.equal(blind.tick(10_500, rider, szuQuery, 'szu', key => sounds.push(key)), null, 'Hazard cooldown should suppress immediate repeat');
  blind.triggerBell(10_600, rider, { position: [30, 0, 0], label: '南门' });
  assert.equal(blind.hazardLabel, '', 'Pressing bell must immediately clear any displayed hazard');
  assert.equal(blind.hazardUntilMs, -Infinity);

  blind.clearBellPulse();
  assert.equal(blind.bellTarget, null, 'Passing checkpoint clearBellPulse resets target');
  assert.equal(blind.bellPulseUntilMs, -Infinity);
  assert.equal(blind.bellCooldownUntilMs, -Infinity);

  // Clear persistence isolation
  const clear1 = blind.recordClear(p2pCourse, 'bike', 42_000, false);
  assert.equal(clear1.clears, 1);
  assert.equal(clear1.isBest, true);
  assert.equal(clear1.bestMs, 42_000);
  const clearUnranked = blind.recordClear(p2pCourse, 'bike', 30_000, true);
  assert.equal(clearUnranked.clears, 1);
  assert.ok(JSON.parse(backing.get(blindNavRules.storageKey)).bestByKey[blindCourseKey(p2pCourse, 'bike')] === 42_000);

  // TimeTrial with blindRun = true keeps standard personal best clean
  const trial = new TimeTrial(p2pCourse, stockBike, 'bike', null, szuQuery);
  assert.equal(trial.start(), undefined); // void/true (not false)
  trial.phase = 'race';
  trial.blindRun = true;
  trial.finishAt(38_000);
  assert.equal(trial.phase, 'done');
  assert.equal(trial.lastRun.unranked, true);
  assert.equal(trial.lastRun.blind, true);
  assert.equal(loadBest(p2pCourse, 'bike'), null, 'Blind TimeTrial run must not write standard best');

  // Leave restores previous weather
  assert.equal(blind.leave(setActiveWeather), true);
  assert.equal(blind.active, false);
  assert.equal(getActiveWeatherId(), 'rain');
}

// 4. Combo mode: ShadowChase + BlindNav simultaneously
{
  setActiveWeather('sunset');
  const chase = createShadowChase();
  const blind = createBlindNav();
  blind.setEnabled(true);
  chase.start({
    event: p2pCourse,
    vehicle: 'bike',
    difficulty: 'standard',
    reference: p2pBenchmark,
    campus: 'szu',
  });
  blind.enter(getActiveWeatherId(), setActiveWeather);
  assert.equal(chase.active, true);
  assert.equal(blind.active, true);
  assert.equal(getActiveWeatherId(), 'night');
  chase.stop();
  blind.leave(setActiveWeather);
  assert.equal(chase.active, false);
  assert.equal(blind.active, false);
  assert.equal(getActiveWeatherId(), 'sunset');
}

console.log('verify-240 passed: ShadowChase, BlindNav, weather restore, and storage isolation.');
