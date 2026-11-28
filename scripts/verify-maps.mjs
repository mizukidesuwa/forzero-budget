import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { alternateCamera } from '../src/data/interface.js';
import { rideCamera } from '../src/render/ride-camera.js';
import * as game from '../src/test-exports.js';

const fixture = new URL('./fixtures/map-regression.json', import.meta.url);
const campuses = ['szu', 'ucl', 'shunde'];
const selected = process.argv.slice(2);
const drive = { gas: true, brake: false, left: false, right: false, sprint: false };
const terrainProbes = { szu: [32, 140, 4.9877], ucl: [0, 0, -.021], shunde: [0, 168, -.18] };

function driveFrom(query, spawn, heading, exploring = false) {
  const rider = game.makeCyclist({ campus: query.campus, spawn, heading }, game.stockBike, 'ebike', null, query);
  rider.speed = 12;
  game.moveCyclist(rider, drive, game.PHYSICS_STEP, exploring, null, null, [], query);
  return rider;
}

function pathSnapshot(path) {
  return { length: path.length, width: path.width, rows: path.rows };
}

function courseSnapshot(event) {
  return {
    id: event.id, name: event.name, description: event.description, layout: game.ghostCourseKey(event),
    path: pathSnapshot(event.path), gates: event.gates, spawn: event.spawn, heading: event.heading,
    elevation: event.elevation, stages: event.stages, flyover: event.flyover, cityAccess: event.cityAccess,
    revision: event.revision, oldKey: event.oldKey, recordKey: game.recordKey(event),
    targetTimes: event.medalTimes, cuts: event.londonLines?.map(cut => [cut.from, cut.to, pathSnapshot(cut.path)]),
  };
}

function mapSnapshot(campus) {
  game.setActiveCampus(campus);
  game.buildRidingScene(campus);
  const query = game.createWorldQuery(campus);
  const [gx, gz, height] = terrainProbes[campus];
  assert.ok(Math.abs(query.terrainMeshHeight(gx, gz) - height) < 1e-8, campus + ' indexes its rendered ground');
  assertFirstPersonEyeHeight(campus);
  const routes = game.coursesByCampus[campus];
  const roads = campus === 'szu' ? [...game.roads, ...game.cityRoads.keys()]
    : campus === 'ucl' ? game.uclWays.map(way => way.path)
      : [game.parkPath, game.pavilionWalk, game.mountainUp, game.mountainDown];
  const collisionProbes = [];
  for (const path of roads) {
    for (let d = .21; d < path.length; d += 3.7) {
      const frame = game.courseFrame(path, d);
      for (const lane of [-1.05, -.72, 0, .72, 1.05]) {
        const [x, , z] = game.offsetVertex(frame, path.width * lane, 0);
        const y = query.rideElevation(x, z), heading = Math.atan2(frame.f[2], frame.f[0]);
        collisionProbes.push([
          query.safeToRide(x, z, true), query.surfaceKindAt(x, z, true), query.waterHazardAt(x, z),
          y, query.riderGrade([x, y, z], heading), query.flyoverAt(x, z),
        ]);
      }
    }
  }
  const seed = campus === 'shunde' ? [] : ['326', 'W20261123'].map(code => {
    const event = game.makeSeedCourse(game.readSeedCode(code, campus), campus);
    assert.ok(event, campus + ' seed ' + code);
    return [courseSnapshot(event), event.environment];
  });
  const route = routes.find(event => event.id === { szu: 'ring', ucl: 'alleyway-slalom', shunde: 'qingyun-lake' }[campus]);
  const { time, splits, samples } = route.benchmark;
  const ghost = JSON.parse(JSON.stringify(game.makeGhostFile(route, {
    vehicle: 'bike', time, splits, samples: [samples[0], samples[samples.length >> 1], samples.at(-1)],
  }, { name: 'map-regression', paint: 'classic' })));
  return {
    digest: createHash('sha256').update(JSON.stringify({
      courses: routes.map(courseSnapshot), roads: roads.map(pathSnapshot), collisionProbes, seed,
    })).digest('hex'),
    routes: routes.length, roads: roads.length, probes: collisionProbes.length, ghost,
  };
}

function assertFirstPersonEyeHeight(campus) {
  const { arrival, heading } = game.campuses[campus];
  for (const [vehicle, expectedHeight] of Object.entries({ bike: 1.78, ebike: 1.72, trail: 1.82, chair: 1.42 })) {
    const rider = { position: arrival, heading, vehicle, speed: 0 };
    for (const aspect of [16 / 9, 9 / 16]) {
      const camera = rideCamera({ phase: 'free', rider }, aspect, null, 1 / 60, 'first', true);
      assert.ok(Math.abs(camera.eye[1] - arrival[1] - expectedHeight) < 1e-8, `${campus} ${vehicle} first-person eye height`);
    }
  }
}

function assertFlyoverSeams() {
  game.setActiveCampus('szu');
  game.buildRidingScene('szu');
  const query = game.createWorldQuery('szu');
  const { path, from, to, crossing } = game.flyover;
  const deck = distance => {
    const [x, , z] = game.along(path, distance);
    assert.ok(query.safeToRide(x, z, true));
    return query.flyoverAt(x, z);
  };
  assert.equal(deck(crossing), 6.82);
  assert.equal(deck(from + .05), deck(to - .05));
  assert.ok(Math.abs(deck(from + .05) - game.CITY_ASPHALT) < .001);
  assert.ok(Math.abs(deck(to - .05) - game.CITY_ASPHALT) < .001);
  for (const distance of [from - .04, crossing, to - .04]) {
    const frame = game.courseFrame(path, distance);
    const [x, , z] = frame.p, heading = Math.atan2(frame.f[2], frame.f[0]);
    const surface = (query.flyoverAt(x, z) ?? game.CITY_ASPHALT) + .006;
    const rider = driveFrom(query, [x, surface, z], heading, true);
    assert.ok(rider.travel > .08 && !rider.hazard, 'rider continues across the flyover');
    if (distance === crossing) {
      assert.ok(Math.abs(rider.position[1] - surface) < .001, 'flyover height');
      const underneath = driveFrom(query, [x, game.ROAD_Y, z], heading, true);
      assert.ok(underneath.travel > .08 && underneath.position[1] < .1, 'road beneath the flyover stays on ground');
    }
  }
}

function assertSzuOpenGround() {
  game.setActiveCampus('szu');
  game.buildRidingScene('szu');
  const query = game.createWorldQuery('szu');
  assert.ok(query.safeToRide(104, -261) && !query.surfaceAt(104, -261));
  assert.ok(query.safeToRide(game.parkX + 22, game.parkZ + 30));
  assert.equal(query.surfaceAt(game.parkX + 22, game.parkZ + 30), false);
  assert.ok(query.safeToRide(-54, -222.2) && query.safeToRide(-54, -223.9));
  assert.equal(query.safeToRide(-54, -223), false, 'north wall must have a fixture');
  assert.ok(query.safeToRide(-98.7, 13.1) && query.safeToRide(-99.6, 9.6));
  for (const { xy: [x, z], facing: [fx, , fz], name } of [...game.campusGates, ...game.canghaiGates]) {
    const lanes = Array.from({ length: 49 }, (_, i) => -6 + i * .25);
    assert.ok(lanes.some(u => [-2, -1, 0, 1, 2, 3, 4].every(v =>
      query.safeToRide(x + fx * v + fz * u, z + fz * v - fx * u))), name + ' should have a rideable apron in campus races');
  }
}

function assertLondonTraffic() {
  game.setActiveCampus('ucl');
  game.buildRidingScene('ucl');
  const { cityVehicles } = game;
  assert.deepEqual(new Set(cityVehicles.map(actor => actor.kind)), new Set(['cab', 'bus']));
  assert.equal(new Set(cityVehicles.map(actor => actor.path)).size, 6);
  const { spawn, heading } = game.coursesByCampus.ucl[0];
  const stage = mode => game.makeTrafficFormation(cityVehicles, mode, '2.1-regression', spawn, 3, heading);
  const sparse = stage('sparse'), full = stage('standard');
  assert.equal(stage('off').length, 0);
  assert.ok(sparse.length > 0 && full.length > sparse.length);
  assert.deepEqual(full, stage('standard'));
  for (const path of new Set(full.map(actor => actor.path))) {
    assert.ok(full.filter(actor => actor.path === path && actor.kind === 'bus').length <= 1);
  }
  for (const actor of full) for (let time = -3; time <= 2; time += .125) {
    const pose = game.trafficPosition(actor, time);
    if (!pose) continue;
    const dx = pose.point[0] - spawn[0], dz = pose.point[2] - spawn[2];
    const distance = Math.hypot(dx, dz);
    assert.ok(distance >= 28, 'UCL starting buffer');
    if (time === -3 && distance < actor.formation.sightDistance) {
      assert.ok(dx * Math.cos(heading) + dz * Math.sin(heading) <= distance * actor.formation.sightDot);
    }
  }
  const paths = new Map(cityVehicles.map(actor => [actor.path, actor]));
  assert.equal([...paths.values()].filter(actor => actor.loop).length, 1);
  for (const actor of paths.values()) {
    assert.ok(actor.lodModel.indices.length < actor.model.indices.length / 2);
    for (const direction of [-1, 1]) {
      const cycle = { ...actor, start: direction === 1 ? 0 : actor.path.length, direction };
      const seconds = actor.path.length / actor.speed;
      if (actor.loop) {
        const before = game.trafficPosition(cycle, seconds - .001);
        const after = game.trafficPosition(cycle, seconds + .001);
        assert.ok(game.length(game.subtract(before.point, after.point)) < .2, 'closed-loop seam');
      } else {
        const entry = game.trafficPosition(cycle, .1);
        const exit = game.trafficPosition(cycle, seconds - .1);
        assert.ok(entry.opacity > 0 && entry.opacity < actor.collisionOpacity);
        assert.ok(exit.opacity > 0 && exit.opacity < actor.collisionOpacity);
        assert.equal(game.trafficPosition(cycle, seconds + .2), null, 'off-road reentry interval');
        assert.ok(game.trafficPosition(cycle, seconds + actor.reentryDistance / actor.speed + .1).opacity < actor.collisionOpacity);
      }
    }
  }
}

function assertStudentPassage() {
  game.setActiveCampus('ucl');
  game.buildRidingScene('ucl');
  const query = game.createWorldQuery('ucl');
  const { path } = game.uclWays.find(way => way.id === 'studentPassage');
  for (let d = .19; d < path.length; d += .61) {
    const frame = game.courseFrame(path, d);
    for (const lane of [-.87, 0, .87]) {
      const [x, , z] = game.offsetVertex(frame, path.width * lane, 0);
      assert.ok(query.safeToRide(x, z) && query.surfaceAt(x, z), 'UCL Student Centre passage');
    }
  }
}

function assertShundeGatePassage() {
  game.setActiveCampus('shunde');
  game.buildRidingScene('shunde');
  const query = game.createWorldQuery('shunde');
  for (const z of [-8, -7, -6, -5, 0, 5, 6, 7, 8, 18, 19, 20]) {
    assert.ok(query.safeToRide(0, z, true), 'Shunfengshan gate center opening');
  }
  assert.ok(query.safeToRide(1.2, 7, true), 'Shunfengshan gate inner clearance');
  assert.equal(query.safeToRide(2, 7, true), false, 'Shunfengshan gate pillar remains solid');
}

function assertShundeShortcutTransitions() {
  const query = game.createWorldQuery('shunde');
  for (const cut of game.shundeHighRiskShortcuts) {
    const path = game.street(cut.points, cut.width);
    for (let distance = .2; distance < path.length - .2; distance += .5) {
      const frame = game.courseFrame(path, distance);
      const [x, , z] = frame.p;
      const heading = Math.atan2(frame.f[2], frame.f[0]);
      for (const direction of [heading, heading + Math.PI]) {
        const rider = driveFrom(query, [x, game.ROAD_Y, z], direction);
        const advance = (rider.position[0] - x) * Math.cos(direction) + (rider.position[2] - z) * Math.sin(direction);
        assert.ok(advance > .08 && !rider.hazard, `${cut.name} at ${distance.toFixed(1)} m`);
      }
    }
  }
}

function assertPavilionWaterReturn() {
  game.setActiveCampus('shunde');
  game.buildRidingScene('shunde');
  const query = game.createWorldQuery('shunde');
  const path = game.pavilionWalk;
  const middle = game.courseFrame(path, path.length / 2);
  const [x, , z] = game.offsetVertex(middle, path.width - .18, 0);
  const [wx, , wz] = game.offsetVertex(middle, path.width + .25, 0);
  assert.ok(query.safeToRide(x, z, true));
  assert.ok(query.waterHazardAt(wx, wz));
  const trial = new game.TimeTrial(game.parkCourse, game.stockBike, 'bike', query);
  Object.assign(trial.rider, {
    position: [x, query.rideElevation(x, z) + game.ROAD_Y, z],
    heading: Math.atan2(middle.side[2], middle.side[0]), speed: 4,
  });
  for (let i = 0; i < 60 && !trial.freeHazardNotice; i++) trial.step(drive);
  assert.match(trial.freeHazardNotice?.text ?? '', /落水/);
  assert.equal(trial.interpolatedRiderPose(), trial.rider, 'recovery resets the rendered rider immediately');
  const [returnedX, , returnedZ] = trial.rider.position;
  assert.ok(query.surfaceAt(returnedX, returnedZ) && !query.waterHazardAt(returnedX, returnedZ));
}

function assertShundeCliffApproach() {
  const query = game.createWorldQuery('shunde');
  // Foot of the lower Shenbu descent shoulder.
  const x = 227.617, z = -13.608, heading = 2.117489460348395;
  const y = query.rideElevation(x, z) + game.ROAD_Y;
  assert.ok(query.safeToRide(x, z, true));
  const brake = { ...drive, gas: false, brake: true };
  for (const vehicle of ['bike', 'ebike', 'trail', 'chair']) {
    const trial = new game.TimeTrial(game.parkCourse, game.stockBike, vehicle, query);
    Object.assign(trial.rider, { position: [x, y, z], heading, speed: 8, paved: false });
    for (let tick = 0; tick < 50; tick++) {
      trial.step(drive);
      assert.equal(trial.freeHazardNotice, null, vehicle + ' does not rejoin on top of the cliff');
      assert.ok(trial.rider.position[1] < y + .2, vehicle + ' stays below the cliff');
    }
    const before = trial.rider.position.slice();
    for (let tick = 0; tick < 90; tick++) trial.step(brake);
    const [dx, , dz] = game.subtract(trial.rider.position, before);
    assert.ok(dx * Math.cos(heading) + dz * Math.sin(heading) < -.25, vehicle + ' can back away from the cliff');
  }
}

function assertShundeCliffDrop() {
  const query = game.createWorldQuery('shunde');
  const path = game.mountainUp, frame = game.courseFrame(path, 82.5);
  const [x, , z] = game.offsetVertex(frame, -(path.width + 4.12), 0);
  const heading = Math.atan2(-frame.side[2], -frame.side[0]);
  const trial = new game.TimeTrial(game.mountainCourses[0], game.stockBike, 'bike', query);
  trial.start();
  for (let tick = 0; tick < game.COUNTDOWN_TICKS; tick++) trial.step({ ...drive, gas: false });
  assert.equal(trial.phase, 'race');
  trial.nextGate = 1;
  trial.routeAnchor = game.pointDistance(trial.event.path, [x, z]);
  Object.assign(trial.rider, {
    position: [x, query.rideElevation(x, z) + game.ROAD_Y, z], heading, speed: 12, paved: false,
  });
  trial.step(drive);
  assert.equal(trial.rejoinReason, '冲出山路');
  assert.equal(trial.elapsed, game.REJOIN_MS);
  assert.equal(trial.nextGate, 1, 'recovery does not advance race checkpoints');
}

function assertShundeRenderedBank() {
  const query = game.createWorldQuery('shunde');
  const frame = game.courseFrame(game.mountainUp, 221.5);
  const [x, , z] = game.offsetVertex(frame, -6.38, 0);
  const [insideX, , insideZ] = game.offsetVertex(frame, -7.55, 0);
  assert.ok(query.safeToRide(insideX, insideZ, true));
  assert.ok(query.terrainMeshHeight(insideX, insideZ) - query.rideElevation(insideX, insideZ) > 3);
  const heading = Math.atan2(-frame.side[2], -frame.side[0]);
  const trial = new game.TimeTrial(game.parkCourse, game.stockBike, 'trail', query);
  Object.assign(trial.rider, {
    position: [x, query.rideElevation(x, z) + game.ROAD_Y, z], heading, speed: 8, paved: false,
  });
  for (let tick = 0; tick < 60; tick++) {
    trial.step(drive);
    const [px, py, pz] = trial.rider.position;
    assert.ok(query.terrainMeshHeight(px, pz) - py < .43, 'movement stops outside the rendered mountain');
    assert.equal(trial.freeHazardNotice, null);
  }
  const [dx, , dz] = game.subtract(trial.rider.position, [x, 0, z]);
  assert.ok(dx * Math.cos(heading) + dz * Math.sin(heading) > .15, 'the open road shoulder remains rideable');
}

function assertShundeCameraClearance() {
  const query = game.createWorldQuery('shunde');
  const x = 315.103, z = 81.098, towardBank = 2.327942062451687;
  const rider = { position: [x, query.rideElevation(x, z) + game.ROAD_Y, z], vehicle: 'trail', speed: 2 };
  const focus = game.add(rider.position, [0, alternateCamera.second.lookHeight, 0]);
  const race = { phase: 'free', moved: true, rider };
  assert.ok(query.terrainMeshHeight(x, z) < rider.position[1]);
  for (const [mode, heading] of [['second', towardBank], ['third', towardBank + Math.PI]]) {
    rider.heading = heading + Math.PI;
    const prior = rideCamera(race, 16 / 9, null, 1 / 60, mode, false);
    rider.heading = heading;
    for (const previous of [null, prior]) {
      const camera = rideCamera(race, 16 / 9, previous, 1 / 60, mode, false);
      assert.ok(Math.hypot(...camera.right) > .99, mode + ' view keeps a valid basis');
      for (let step = 1; step <= 100; step++) {
        const [px, py, pz] = game.lerpPoint(focus, camera.eye, step / 100);
        const ground = Math.max(query.rideElevation(px, pz), query.terrainMeshHeight(px, pz) ?? -Infinity);
        assert.ok(py >= ground, mode + ' camera line of sight clears the rendered terrain');
      }
    }
  }
}

const results = Object.fromEntries((selected.length ? selected : campuses).map(campus => {
  assert.ok(campuses.includes(campus), campus);
  return [campus, mapSnapshot(campus)];
}));

const baseline = JSON.parse(readFileSync(fixture, 'utf8'));
for (const [campus, actual] of Object.entries(results)) {
  assert.deepEqual(actual, baseline[campus], campus);
  game.setActiveCampus(campus);
  const file = game.readGhostFile(JSON.stringify(baseline[campus].ghost));
  const { event, opponent } = game.loadFriendGhost(file, campus);
  assert.equal(opponent.time, file.run.time);
  assert.equal(game.ghostCourseKey(event), file.course.layout);
  assert.ok(game.replayAt(opponent, opponent.time / 2, campus).position.every(Number.isFinite));
  console.log(`${campus}: ${actual.routes} fixed routes, ${actual.roads} roads, ${actual.probes} terrain/collision probes, seeded routes where supported and pre-migration ghost match.`);
}
if (Object.hasOwn(results, 'szu')) {
  assertFlyoverSeams();
  assertSzuOpenGround();
}
if (Object.hasOwn(results, 'ucl')) {
  assertStudentPassage();
  assertLondonTraffic();
}
if (Object.hasOwn(results, 'shunde')) {
  assertPavilionWaterReturn();
  assertShundeGatePassage();
  assertShundeShortcutTransitions();
  assertShundeCliffApproach();
  assertShundeCliffDrop();
  assertShundeRenderedBank();
  assertShundeCameraClearance();
}
console.log('Targeted map probes passed for the selected maps.');
