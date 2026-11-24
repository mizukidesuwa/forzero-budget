import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as game from '../src/test-exports.js';
import { emitRailFence } from '../src/world/assets/rail-fence.js';

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

// Frozen before the lamp and vegetation moves. Hash geometry in generation order,
// including material channels, and every tree position and radius.
const preExtraction = {
  szu: '282be88ad864699619117badf2bfc819a2a2700922be8f61102ecd5b786b6353',
  ucl: '8aa270c17a7470d8c237f58e816dfec557304b8580026a6db8b8fd953fd4cf9c',
  shunde: 'cb0e6018183df1b9002c98259d2bd10732f283cdf4239bd329b9dc28bac36c64',
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
console.log('All 3 maps match the ordered pre-extraction geometry, materials and tree positions.');
