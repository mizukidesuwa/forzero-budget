import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as game from '../src/test-exports.js';
import { emitBarrier } from '../src/world/assets/barriers.js';
import { emitLondonTrafficVehicle } from '../src/world/assets/traffic-vehicles.js';
import { emitRailFence } from '../src/world/assets/rail-fence.js';
import {
  emitCityTrafficVehicle,
  emitCourtyardBench,
  emitGatePalm,
  emitIronGateRail,
  emitLowHedgeBorder,
  emitLowTree,
  emitMountainTree,
  emitParkBench,
  emitParkShuttleVehicle,
  emitPlanter,
  emitSlopedCourtRail,
  emitStoneRail,
  emitTrailPost,
} from '../src/world/assets/index.js';

const fence = game.gordonNorthFence;
const fakeGpu = { Mesh: class { } };
const [x, z] = fence.from;
const [xx, zz] = fence.to;
const length = Math.hypot(xx - x, zz - z);
const point = (t, offset) => [
  game.mix(x, xx, t) - (zz - z) / length * offset,
  game.mix(z, zz, t) + (xx - x) / length * offset,
];
const [cx, cz] = point(.5, 0);
const { matrix: view } = game.viewAt([cx, 5, cz - 14], [cx, .7, cz]);
const planes = game.frustumPlanes(game.multiply(game.perspective(Math.PI / 3, 16 / 9, .1, 180), view));

function digest(shape) {
  return createHash('sha256')
    .update(Buffer.from(Float64Array.from(shape.vertices).buffer))
    .update(Buffer.from(Uint32Array.from(shape.indices).buffer)).digest('hex');
}

const railShape = new game.Shape();
const footprints = [];
game.withRandom(() => { throw new Error('Rail consumed the map random stream'); }, () => {
  emitRailFence(fence, { scenery: railShape, footprint: (...args) => footprints.push(game.campusFootprint(...args)) });
});
assert.equal(footprints.length, 2);
assert.equal(railShape.indices.length / 3, 512);

function snapshot(legacyUclFence) {
  game.setActiveCampus('ucl');
  game.buildRidingScene('ucl', { legacyUclFence });
  const query = game.createWorldQuery('ucl');
  const probes = [0, .25, .5, .75, 1].map(station => {
    const passage = Array.from({ length: 41 }, (_, i) => {
      const p = point(station, (i - 20) / 20);
      const candidates = game.worldState.ridingObstacles.fixtures.get(game.streetCell(...p));
      return {
        safe: query.safeToRide(...p, true),
        fixture: game.uclFixtures.indexOf(candidates?.find(lot => game.closeToBlock(...p, lot, .28))),
      };
    });
    return { firstHit: passage.findIndex(p => !p.safe), passage };
  });
  const drawCells = game.meshCells(fakeGpu, [game.masonry, game.scenery, game.urban, game.foliage]);
  const draw = game.visibleStatic(drawCells.map(mesh => [mesh]), planes);
  assert.ok(draw.length > 0 && draw.length < drawCells.length, 'the fixed camera must exercise frustum culling');
  const railLots = game.uclFixtures.filter(lot => lot.height === 1.13 && lot.depth === .12 &&
    footprints.some(f => f.x === lot.x && f.z === lot.z));
  assert.deepEqual(railLots, footprints);
  assert.equal(probes[2].firstHit, -1, 'the center gap must be traversable');
  for (const [probe, lot] of [[probes[1], railLots[0]], [probes[3], railLots[1]]]) {
    assert.ok(probe.firstHit > 0);
    assert.equal(probe.passage[probe.firstHit].fixture, game.uclFixtures.indexOf(lot));
    assert.equal(probe.passage.at(-1).safe, true);
  }
  return {
    geometry: game.worldShapes.map(digest),
    triangles: game.worldShapes.map(shape => shape.indices.length / 3),
    cells: drawCells.length,
    submissions: draw.length,
    fixtures: structuredClone(game.uclFixtures),
    trees: structuredClone(game.treeSites),
    probes,
  };
}

const modern = snapshot(false);
const rollback = snapshot(true);
assert.deepEqual(modern, rollback);
console.log(`UCL fence and rollback match byte-for-byte: ${railShape.indices.length / 3} fence triangles, ${modern.cells} solid cells, ${modern.submissions} visible submissions, both rail hits and open center gap.`);

const sampleBarrier = new game.Shape();
const sampleCab = new game.Shape(), sampleBus = new game.Shape();
const barrierFootprints = [];
game.withRandom(() => { throw Error('2.1 assets consumed the map random stream'); }, () => {
  emitBarrier({ x: 0, z: 0, width: 8, yaw: .5 }, { scenery: sampleBarrier, footprint: (...args) => barrierFootprints.push(args) });
  emitLondonTrafficVehicle({ kind: 'cab' }, { scenery: sampleCab });
  emitLondonTrafficVehicle({ kind: 'bus' }, { scenery: sampleBus });
});
assert.deepEqual(barrierFootprints[0].slice(0, 5), [0, 0, 8, .34, .5]);
for (const shape of [sampleBarrier, sampleCab, sampleBus]) {
  assert.ok(shape.indices.length > 0 && shape.indices.length / 3 <= 480);
  assert.ok(shape.vertices.every(Number.isFinite));
}

const propShapes = Array.from({ length: 12 }, () => new game.Shape());
const gateRailFootprints = [];
const gatePalmSolids = [];
game.withRandom(() => { throw new Error('Pure prop consumed the map random stream'); }, () => {
  emitLowTree({ x: 0, z: 0, size: 1, crown: '#5f8148' }, { scenery: propShapes[0], foliage: propShapes[0] });
  emitMountainTree({ x: 0, y: 1, z: 0, height: 4.5, roadside: true, withTrunk: true }, { scenery: propShapes[1], foliage: propShapes[1] });
  emitGatePalm({ point: (u, y, v) => [u, y, v], u: 0, v: 0, height: 3.4 }, { scenery: propShapes[2], foliage: propShapes[2], solid: (...args) => gatePalmSolids.push(args) });
  emitStoneRail({ from: [0, 0], to: [0, 6], height: 1.05, rail: '#c8bea7' }, { scenery: propShapes[3] });
  emitIronGateRail({ from: [0, 0], to: [4, 0], height: 1.68 }, { masonry: propShapes[4], footprint: (...args) => gateRailFootprints.push(args) });
  emitLowHedgeBorder({ x: 0, z: 0, length: 2.4, yaw: .25 }, { scenery: propShapes[5] });
  emitSlopedCourtRail({ point: (u, y, v) => [u, y, v], z: 0 }, { scenery: propShapes[6] });
  emitParkBench({ x: 0, z: 0, yaw: .4 }, { scenery: propShapes[7] });
  emitCourtyardBench({ x: 0, z: 0, yaw: -.4 }, { scenery: propShapes[8] });
  emitPlanter({ x: 0, z: 0, width: 4, depth: 3, paving: '#c8c0ad', planter: '#b6aa94' }, { pavement: propShapes[9], scenery: propShapes[9] });
  emitTrailPost({ x: 0, y: .5, z: 0, firm: true }, { masonry: propShapes[10] });
  emitCityTrafficVehicle({ paint: '#5d9f92', bus: false }, { shape: propShapes[11] });
  emitCityTrafficVehicle({ paint: '#5d9f92', bus: true }, { shape: propShapes[11] });
  emitParkShuttleVehicle({ paint: '#5c9a79' }, { shape: propShapes[11] });
});
assert.equal(gatePalmSolids.length, 1);
assert.equal(gateRailFootprints.length, 1);
assert.deepEqual(gateRailFootprints[0].slice(0, 4), [2, 0, 4, .085]);
assert.equal(gateRailFootprints[0][5], 1.68);
for (const shape of propShapes) {
  assert.ok(shape.indices.length > 0);
  assert.ok(shape.vertices.every(Number.isFinite));
}

// 2.2.0 adds the reference-based map detail layer. UCL traffic is uploaded separately.
// Hash geometry in generation order,
// including material channels, and every tree position and radius.
const preExtraction = {
  szu: '2b53aa1d0ea7f218008cc00bb64df39e2205123cd50420bebfed27c982430d18',
  ucl: '86fbedbf7e6d4669aa3512b927dadad207f8276b62f5c0d0e8f3f6806a96cd3e',
  shunde: '9b7bbef85f0a9d002af41ec6609b927fc768ab55e77428f95174ede4c6dfdc0f',
};
for (const campus of ['shunde', 'szu', 'ucl']) {
  game.setActiveCampus(campus);
  game.buildRidingScene(campus);
  const hash = createHash('sha256');
  for (const shape of game.worldShapes) {
    hash.update(Buffer.from(Float64Array.from(shape.vertices).buffer));
    hash.update(Buffer.from(Uint32Array.from(shape.indices).buffer));
  }
  hash.update(JSON.stringify(game.treeSites));
  assert.equal(hash.digest('hex'), preExtraction[campus], campus);
}
console.log('All 3 maps match the ordered geometry snapshots, materials and tree positions.');
