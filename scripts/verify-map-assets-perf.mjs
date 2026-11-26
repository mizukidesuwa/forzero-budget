import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as game from '../src/test-exports.js';
import { mapDetailPerformanceBudget } from '../src/data/map-assets.js';

const baseline = JSON.parse(readFileSync(new URL('./fixtures/map-assets-2.1.2.json', import.meta.url)));
const fakeGpu = { Mesh: class {} };
const shapeNames = baseline.shapeOrder;
for (const campus of Object.keys(baseline.campuses)) {
  game.setActiveCampus(campus);
  game.buildRidingScene(campus);
  const triangles = game.worldShapes.map(shape => shape.indices.length / 3);
  const expected = baseline.campuses[campus];
  const currentTotal = triangles.reduce((sum, count) => sum + count, 0);
  const baselineTotal = expected.shapeTriangles.reduce((sum, count) => sum + count, 0);
  const cells = game.meshCells(fakeGpu, [game.masonry, game.scenery, game.urban, game.foliage, game.road, game.pavement, game.water, game.terrain]).length;
  assert.equal(triangles.length, shapeNames.length, campus + ' shape order');
  assert.ok(currentTotal <= baselineTotal * mapDetailPerformanceBudget.maxTriangleMultiplier,
    campus + ' triangle budget exceeded');
  assert.ok(cells <= expected.meshCells * mapDetailPerformanceBudget.maxMeshCellMultiplier,
    campus + ' mesh-cell budget exceeded');
  console.log(campus + ': ' + currentTotal + ' triangles, ' + cells + ' mesh cells, baseline ' + baselineTotal + '/' + expected.meshCells);
}
console.log('2.2.0 map asset performance budgets passed.');
