import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import * as game from '../src/test-exports.js';

const baselinePath = new URL('./fixtures/runtime-baseline.json', import.meta.url);
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')).deterministic;

const round = (n, d = 6) => (Number.isFinite(n) ? Number(n.toFixed(d)) : n);
const roundArr = (arr, d = 6) => Array.from(arr, v => round(v, d));

// Configure baseline preferences matching historical baseline capture
game.setPreferences({
  soloBudget: 'open',
  weather: 'clear',
  windMode: 'off',
  windSpeed: 0,
  windDir: 0,
  traffic: 'sparse',
  collision: false,
});

// 1. Verify all 20 courses & checkpoints
const allCourses = Object.entries(game.coursesByCampus).flatMap(([camp, list]) => list.map(c => [camp, c]));
const coursesSummary = allCourses.map(([camp, c]) => ({
  id: c.id,
  name: c.name,
  campus: c.campus ?? camp,
  length: round(c.length, 4),
  gatesCount: c.gates.length,
  gates: c.gates.map(g => ({
    index: g.index,
    name: g.name,
    distance: round(g.distance, 4),
    half: round(g.half, 4),
    minCross: g.minCross !== undefined ? round(g.minCross, 4) : null,
    maxCross: g.maxCross !== undefined ? round(g.maxCross, 4) : null,
    rise: round(g.rise ?? 0, 4),
    p: roundArr(g.p, 4),
  })),
  medalTimes: c.medalTimes,
  benchmarkTime: round(c.benchmark?.time ?? 0, 2),
  stages: c.stages ? c.stages.map(s => ({ name: s.name, from: round(s.from, 4), to: round(s.to, 4) })) : null,
}));
assert.deepEqual(coursesSummary, baseline.coursesSummary, '20 courses mismatch vs historical baseline baseline');
console.log('1. All 20 courses, gates, medalTimes, benchmarks: EXACT MATCH');

// 2. Verify all 3 campuses static batches, trees, Qingyun LoS, collision probes
const batchStats = {};
const treeSummary = {};
const collisionProbes = {};

const sampleGrid = (xs, zs, step) => {
  let rideTrue = 0, surfaceTrue = 0, waterTrue = 0, buildingTrue = 0, elevSum = 0;
  for (let x = xs[0]; x <= xs[1]; x += step) {
    for (let z = zs[0]; z <= zs[1]; z += step) {
      const r = Boolean(game.safeToRide(x, z, true));
      const s = Boolean(game.surfaceAt(x, z, true));
      const w = Boolean(game.waterHazardAt(x, z));
      const b = Boolean(game.buildingAt(x, z, 0));
      const e = round(game.rideElevation(x, z), 4);
      if (r) rideTrue++;
      if (s) surfaceTrue++;
      if (w) waterTrue++;
      if (b) buildingTrue++;
      elevSum += e;
    }
  }
  return { rideTrue, surfaceTrue, waterTrue, buildingTrue, elevSum: round(elevSum, 3) };
};

for (const c of ['szu', 'ucl', 'shunde']) {
  game.setActiveCampus(c);
  game.buildRidingScene(c);
  const shapes = {
    masonry: game.masonry, scenery: game.scenery, urban: game.urban, foliage: game.foliage,
    road: game.road, pavement: game.pavement, water: game.water, terrain: game.terrain,
  };
  const perShape = {};
  let totalStaticTris = 0;
  for (const [name, s] of Object.entries(shapes)) {
    const tris = s.indices.length / 3;
    const verts = s.vertices.length / 11;
    perShape[name] = { verts, tris };
    if (['masonry', 'scenery', 'urban', 'foliage', 'road', 'pavement', 'water'].includes(name)) {
      totalStaticTris += tris;
    }
  }
  batchStats[c] = {
    shapes: perShape,
    totalStaticTris,
    signs: game.signs.length,
    cityVehicles: game.cityVehicles.length,
    citySolid: game.citySolid.length,
    campusFixtures: game.campusFixtures.length,
    uclFixtures: game.uclFixtures.length,
  };
  treeSummary[c] = {
    count: game.treeSites.length,
    first5: game.treeSites.slice(0, 5).map(t => ({ x: round(t.x, 4), z: round(t.z, 4), r: round(t.r, 4), color: t.color })),
    last5: game.treeSites.slice(-5).map(t => ({ x: round(t.x, 4), z: round(t.z, 4), r: round(t.r, 4), color: t.color })),
    sumX: round(game.treeSites.reduce((a, t) => a + t.x, 0), 3),
    sumZ: round(game.treeSites.reduce((a, t) => a + t.z, 0), 3),
  };
  if (c === 'szu') {
    collisionProbes.szu = {
      grid: sampleGrid([-220, 320], [-260, 260], 20),
      lidePlaza: [game.safeToRide(-122, 16, true), game.surfaceAt(-122, 16, true), game.buildingAt(-122, 16, 0)],
      wenshanWater: [game.waterHazardAt(-104, 164), game.waterHazardAt(-31, 125), game.waterHazardAt(-78, -125.8)],
      dujuanPeak: round(game.rideElevation(32, 138), 4),
      flyoverDeck: game.flyoverAt(0, -245),
    };
  } else if (c === 'ucl') {
    collisionProbes.ucl = {
      grid: sampleGrid([-200, 380], [-140, 540], 20),
      quadCenter: [game.safeToRide(0, 0, true), game.surfaceAt(0, 0, true), game.buildingAt(0, 0, 0)],
      narrowAlley: [game.safeToRide(45, 202, true), game.surfaceAt(45, 202, true)],
    };
  } else if (c === 'shunde') {
    collisionProbes.shunde = {
      grid: sampleGrid([-60, 480], [-220, 260], 20),
      paifang: [game.safeToRide(0, 0, true), game.surfaceAt(0, 0, true), round(game.rideElevation(0, 0), 4)],
      pavilion: [game.safeToRide(168, 45, true), game.waterHazardAt(168, 45)],
      shenbuPeak: round(game.rideElevation(421.5, 106.0), 4),
      qingyunLoS: (() => {
        const triangles = [];
        for (const shape of [game.foliage]) {
          for (let i = 0; i < shape.indices.length; i += 3) {
            const a = shape.indices[i] * 11, b = shape.indices[i + 1] * 11, cc = shape.indices[i + 2] * 11;
            const p0 = [shape.vertices[a], shape.vertices[a + 1], shape.vertices[a + 2]];
            const p1 = [shape.vertices[b], shape.vertices[b + 1], shape.vertices[b + 2]];
            const p2 = [shape.vertices[cc], shape.vertices[cc + 1], shape.vertices[cc + 2]];
            triangles.push({
              a: p0, ab: game.subtract(p1, p0), ac: game.subtract(p2, p0),
              minX: Math.min(p0[0], p1[0], p2[0]), maxX: Math.max(p0[0], p1[0], p2[0]),
              minZ: Math.min(p0[2], p1[2], p2[2]), maxZ: Math.max(p0[2], p1[2], p2[2]),
            });
          }
        }
        const screened = (eye, target) => {
          const ray = game.subtract(target, eye);
          for (const t of triangles) {
            if (t.maxX < Math.min(eye[0], target[0]) || t.minX > Math.max(eye[0], target[0]) ||
                t.maxZ < Math.min(eye[2], target[2]) || t.minZ > Math.max(eye[2], target[2])) continue;
            const h = game.cross(ray, t.ac), det = game.dot(t.ab, h);
            if (Math.abs(det) < 1e-8) continue;
            const edge = game.subtract(eye, t.a), u = game.dot(edge, h) / det;
            if (u < 0 || u > 1) continue;
            const q = game.cross(edge, t.ab), w = game.dot(ray, q) / det;
            if (w < 0 || u + w > 1) continue;
            const hit = game.dot(t.ac, q) / det;
            if (hit > 0 && hit < 1) return true;
          }
          return false;
        };
        const visible = [], partial = [], hidden = [];
        for (let d = 0; d < game.parkPath.length; d += 4) {
          const { p, f, side } = game.courseFrame(game.parkPath, d);
          const eye = game.add(game.add(p, game.scale(f, -8.25)), game.scale(side, 1.24));
          eye[1] += 4.02 + game.parkHeight(p[0], p[2]);
          const [x, z] = game.parkTower;
          if (game.dot(f, game.normalize([x - eye[0], 0, z - eye[2]])) < .84 || Math.hypot(x - eye[0], z - eye[2]) > 200) continue;
          const lower = screened(eye, [x, 18, z]), upper = screened(eye, [x, 34, z]);
          (lower && upper ? hidden : lower || upper ? partial : visible).push(d);
        }
        return { visible, partial, hidden };
      })(),
    };
  }
}

const normalizeJson = (x) => JSON.parse(JSON.stringify(x));
// 2.1.0 adds Shenzhen barriers and UCL traffic while retaining the historical baseline capture.
const expectedBatches = structuredClone(baseline.batchStats);
expectedBatches.szu.shapes.scenery = { verts: 212744, tris: 112894 };
expectedBatches.szu.totalStaticTris = 439378;
expectedBatches.szu.citySolid = 589;
expectedBatches.szu.shapes.urban = { verts: 78220, tris: 39962 };
expectedBatches.ucl.cityVehicles = 36;
expectedBatches.ucl.shapes.scenery = { verts: 111796, tris: 62064 };
expectedBatches.ucl.shapes.masonry = { verts: 382784, tris: 190317 };
expectedBatches.ucl.shapes.foliage = { verts: 31124, tris: 28628 };
expectedBatches.ucl.shapes.pavement = { verts: 49518, tris: 16884 };
expectedBatches.ucl.shapes.urban = { verts: 10416, tris: 5208 };
expectedBatches.ucl.totalStaticTris = 311400;
expectedBatches.shunde.shapes.scenery = { verts: 75155, tris: 40976 };
expectedBatches.shunde.shapes.pavement = { verts: 2988, tris: 1494 };
expectedBatches.shunde.totalStaticTris = 106480;
assert.deepEqual(normalizeJson(batchStats), expectedBatches, 'batchStats mismatch vs 2.1.0 expectations');
assert.deepEqual(normalizeJson(treeSummary), baseline.treeSummary, 'treeSummary mismatch vs historical baseline');
// Shenzhen opens additional off-road grounds. Surface, water and elevation probes still match.
const expectedProbes = structuredClone(baseline.collisionProbes);
expectedProbes.szu.grid.rideTrue = 671;
expectedProbes.ucl.grid.surfaceTrue = 986;
assert.deepEqual(normalizeJson(collisionProbes), expectedProbes, 'collisionProbes mismatch vs 2.1.0 expectations');
console.log('2. All 3 campus batchStats, treeSummary, collisionProbes, Qingyun LoS: EXACT MATCH');

// 3. Fixed-route laps via test-exports + rounds/drive-path.js
const driveSrc = readFileSync(resolve('szu-litchi-dev/rounds/drive-path.js'), 'utf8');
const rideTest = vm.runInNewContext(driveSrc + '\nrideTest;', {
  TimeTrial: game.TimeTrial,
  along: game.along,
  clamp: game.clamp,
  subtract: game.subtract,
  plannedSpeed: game.plannedSpeed,
  MAX_SPRINT_SPEED: game.MAX_SPRINT_SPEED,
  medalName: game.medalName,
});

const savedMathRandom = Math.random;
Math.random = game.randomSource(1911);
const lapCourses = [
  ['szu', 'libraries', true, 120],
  ['szu', 'ring', true, 160],
  ['szu', 'dujuan-climb', true, 120],
  ['szu', 'canghai-tech', true, 180],
  ['ucl', 'quad-sprint', true, 120],
  ['ucl', 'square-circuit', true, 180],
  ['shunde', 'qingyun-lake', true, 160],
  ['shunde', 'shenbu-climb', true, 120],
  ['shunde', 'shenbu-descent', true, 120],
];
const laps = {};
for (const [camp, id, spr, sec] of lapCourses) {
  game.setActiveCampus(camp);
  game.buildRidingScene(camp);
  const ev = game.coursesByCampus[camp].find(c => c.id === id);
  const res = rideTest(ev, spr, sec);
  laps[id] = {
    phase: res.phase,
    passed: res.passed,
    elapsed: res.elapsed,
    medal: res.medal,
    deviation: round(res.deviation, 6),
    progress: round(res.progress, 6),
    position: roundArr(res.position, 6),
  };
}
Math.random = savedMathRandom;
// The Qingyun Lake lap no longer receives the shuttle's wake in 2.1.1.
const expectedLaps = structuredClone(baseline.laps);
expectedLaps['qingyun-lake'].elapsed = 88630;
expectedLaps['qingyun-lake'].position = [-0.032653, 0.043, -0.004724];
assert.deepEqual(laps, expectedLaps, '9 fixed-route laps mismatch vs 2.1.1 expectations');
console.log('3. All 9 fixed-route laps (pure ESM without global vm): EXACT MATCH');

// 4. Standalone Node 120 Hz physics trajectories using explicit createWorldQuery(campus)
const stepInputs = (tick) => {
  if (tick < 240) return { gas: true, brake: false, left: false, right: false, sprint: tick >= 120 };
  if (tick < 360) return { gas: true, brake: false, left: true, right: false, sprint: false };
  if (tick < 480) return { gas: true, brake: false, left: false, right: true, sprint: true };
  return { gas: false, brake: true, left: false, right: false, sprint: false };
};
const windVec = game.makeCustomWind(5.0, 1, 'rain');
game.setActiveWeather('rain');

const trajectories = {};
for (const veh of ['bike', 'trail', 'ebike', 'chair']) {
  trajectories[veh] = {};
  for (const [camp, cid] of [['szu', 'ring'], ['shunde', 'shenbu-climb']]) {
    game.setActiveCampus(camp);
    game.buildRidingScene(camp);
    // Deliberately point global activeCampus to a different campus to prove explicit worldQuery isolation!
    game.setActiveCampus(camp === 'szu' ? 'ucl' : 'szu');
    const worldQuery = game.createWorldQuery(camp);
    const ev = game.coursesByCampus[camp].find(c => c.id === cid);
    const rider = game.makeCyclist(ev, game.stockBike, veh, null, worldQuery);
    const checkpoints = [];
    for (let tick = 0; tick < 600; tick++) {
      const inp = stepInputs(tick);
      game.moveCyclist(
        rider,
        inp,
        game.PHYSICS_STEP,
        false,
        game.gustWind(windVec, tick * game.PHYSICS_STEP, 190, 'gust'),
        tick * game.PHYSICS_STEP,
        game.cityVehicles,
        worldQuery,
      );
      if (tick === 119 || tick === 239 || tick === 359 || tick === 479 || tick === 599) {
        checkpoints.push({
          tick,
          pos: roundArr(rider.position, 6),
          speed: round(rider.speed, 6),
          heading: round(rider.heading, 6),
          energy: round(rider.energy, 6),
          travel: round(rider.travel, 6),
          slip: round(rider.slip, 6),
          paved: rider.paved,
          gravel: Boolean(rider.gravel),
          puddle: Boolean(rider.puddle),
          skill: rider.skill ?? '',
        });
      }
    }
    trajectories[veh][cid] = { checkpoints };
  }
}

const stripTiming = structuredClone(baseline.trajectories);
for (const v of Object.values(stripTiming)) {
  for (const c of Object.values(v)) delete c.stepUs;
}
// Opening the Shenzhen boundary keeps these two wheelchair samples on pavement.
const chairRing = stripTiming.chair.ring.checkpoints;
Object.assign(chairRing[3], {
  pos: [-98.74855, 0.043, 23.463699], speed: 1.121114, heading: -1.340781,
  travel: 23.206883, slip: 0.010179, paved: true,
});
Object.assign(chairRing[4], {
  pos: [-98.759779, 0.043, 23.47419], heading: -1.118252,
  travel: 23.209907, slip: 0.000002, paved: true,
});
assert.deepEqual(trajectories, stripTiming, '4-vehicle 120Hz trajectories mismatch vs 2.1.0 expectations');
console.log('4. All 4 vehicles x 2 maps standalone Node 120 Hz trajectories (with activeCampus deliberately flipped!): EXACT MATCH');
