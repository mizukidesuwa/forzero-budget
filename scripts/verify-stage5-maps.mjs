import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as game from '../src/test-exports.js';

const fixture = new URL('./fixtures/stage4-maps.json', import.meta.url);
const campuses = ['szu', 'ucl', 'shunde'];
const selected = process.argv.slice(2);

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
  }, { name: 'stage4-fixture', paint: 'classic' })));
  return {
    digest: createHash('sha256').update(JSON.stringify({
      courses: routes.map(courseSnapshot), roads: roads.map(pathSnapshot), collisionProbes, seed,
    })).digest('hex'),
    routes: routes.length, roads: roads.length, probes: collisionProbes.length, ghost,
  };
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
  const input = { gas: true, brake: false, left: false, right: false, sprint: false };
  for (let i = 0; i < 60 && !trial.freeHazardNotice; i++) trial.step(input);
  assert.match(trial.freeHazardNotice?.text ?? '', /落水/);
  const [returnedX, , returnedZ] = trial.rider.position;
  assert.ok(query.surfaceAt(returnedX, returnedZ) && !query.waterHazardAt(returnedX, returnedZ));
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
if (Object.hasOwn(results, 'szu')) assertFlyoverSeams();
if (Object.hasOwn(results, 'ucl')) assertStudentPassage();
if (Object.hasOwn(results, 'shunde')) assertPavilionWaterReturn();
console.log('Targeted map probes passed for the selected maps.');
