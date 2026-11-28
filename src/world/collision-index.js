import { getActiveCampus, worldState } from '../core/state.js';
import { terrainIndexCellLimit } from '../data/surfaces.js';
import {
  campusFixtures, citySolid, closeToBlock, indexFootprint, indexStreets,
  putObstacle, streetCell, streetGapSquared, terrain, terrainSpans, treeSites, uclFixtures,
} from './geometry.js';
import { indexSurfaceTriangles } from './mesh-surface.js';
import { getCampusProvider } from './registry.js';

export const OBSTACLE_MARGIN = 2;

export function resetStreetIndex() {
  worldState.indexedRoads = null;
}

export function indexRidingObstacles(region) {
  const buildings = new Map(), trees = new Map(), fixtures = new Map(), city = new Map();
  const lots = region === 'shunde'
    ? campusFixtures
    : region === 'ucl'
      ? (getCampusProvider('ucl')?.getBuildings?.() ?? [])
      : [...(getCampusProvider('szu')?.getBuildings?.() ?? []), ...campusFixtures];
  for (const lot of lots) {
    for (const part of lot.parts ?? [lot]) {
      indexFootprint(buildings, { lot, part }, part, part.obstacleMargin ?? OBSTACLE_MARGIN);
    }
  }
  for (const tree of treeSites) putObstacle(trees, tree, tree.x, tree.z, .31, .31);
  if (region === 'ucl') for (const lot of uclFixtures) indexFootprint(fixtures, lot, lot, .28);
  if (region === 'szu') for (const b of citySolid) {
    if (b.depth === undefined) putObstacle(city, b, b.x, b.z, b.w / 2 + .34, b.d / 2 + .34);
    else indexFootprint(city, b, b, .34);
  }
  const maxCellsPerFace = terrainIndexCellLimit;
  const ground = indexSurfaceTriangles(terrain, 0, terrain.indices.length, { maxCellsPerFace });
  for (const { mesh, from, to } of terrainSpans) {
    indexSurfaceTriangles(mesh, from, to, { index: ground, maxCellsPerFace });
  }
  return { region, buildings, trees, fixtures, city, ground };
}

export function uclFixtureAt(x, z) {
  const nearby = worldState.ridingObstacles?.region === 'ucl'
    ? worldState.ridingObstacles.fixtures.get(streetCell(x, z))
    : uclFixtures;
  return nearby?.some(lot => closeToBlock(x, z, lot, .28)) ?? false;
}

export function treeBlocks(x, z, margin) {
  const candidates = worldState.ridingObstacles?.region === getActiveCampus()
    ? worldState.ridingObstacles.trees.get(streetCell(x, z))
    : treeSites;
  return candidates?.some(tree => Math.abs(tree.x - x) < margin && Math.abs(tree.z - z) < margin) ?? false;
}

export function nearestStreet(x, z, skip = null) {
  if (!worldState.indexedRoads) {
    const roads = getCampusProvider('szu')?.getRoads?.() ?? [];
    worldState.indexedRoads = indexStreets(roads);
  }
  const candidates = worldState.indexedRoads.get(streetCell(x, z)) ?? [];
  let best = Infinity, street = null;
  for (const s of candidates) {
    if (s.path === skip) continue;
    const d = streetGapSquared(s, x, z);
    if (d < best) { best = d; street = s.path; }
  }
  return { distance: Math.sqrt(best), street };
}
