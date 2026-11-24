import { IDENTITY, ROAD_Y, add, scale } from '../core/math.js';
import { Shape } from '../core/shape.js';
import { brakingPaint } from '../race/records.js';
import {
  cityVehicles, clearWorldShapes, courseFrame, foliage, masonry, offsetVertex,
  pavement, plannedSpeed, ribbon, road, scenery, signs, terrain, trackBanner, urban, water,
} from '../world/geometry.js';
import { getCampusProvider } from '../world/registry.js';
import { meshCells } from './bounds.js';

export function courseDecor(gpu, event, stage) {
  const paint = new Shape(), arches = new Shape(), decals = [];
  const from = stage?.from ?? 0, to = Math.min(event.length, (stage?.to ?? event.length) + 12);
  for (let d = Math.max(5.5, from); d < Math.min(event.length - 3, to); d += 6.65) {
    const frame = courseFrame(event.path, d);
    const bend = plannedSpeed(event, d) <= 9.02;
    for (const side of [-1, 1]) {
      const p = offsetVertex(frame, side * .47, ROAD_Y + .0108);
      const tip = add(offsetVertex(frame, 0, ROAD_Y + .0108), scale(frame.f, .65));
      paint.quad(add(p, scale(frame.f, -.02)), add(p, scale(frame.f, .135)),
        add(tip, scale(frame.f, .135)), tip, bend ? '#f2b35e' : stage?.color ?? '#dcec9f');
    }
  }
  const uclBanner = event.campus === 'ucl' ? getCampusProvider('ucl')?.gateBanner : null;
  for (const gate of event.gates) {
    if (gate.distance < from || gate.distance > to ||
        ((event.id === 'qingyun-lake' || event.id === 'shunde-endurance') && gate.index === 0)) continue;
    if (uclBanner) uclBanner(gate, arches, decals);
    else trackBanner(gate, arches, decals, event.gates.length);
  }
  if (event.shortcut) {
    const path = event.shortcut.path;
    for (let d = .5; d < path.length - .4; d += 1.86) {
      ribbon(arches, path, -.12, .12, ROAD_Y + .023, '#f0d990', d, Math.min(d + 1.1, path.length));
    }
  }
  for (const cut of event.londonLines ?? []) {
    if (cut.from < from - 2 || cut.to > to) continue;
    for (let d = 1.4; d < cut.path.length - 1.2; d += 2.1) {
      ribbon(arches, cut.path, -.105, .105, ROAD_Y + .046, '#e9ba72', d, Math.min(d + 1.05, cut.path.length - .8));
    }
  }
  const braking = brakingPaint(event, from, to);
  if (event.flyover) {
    const deckRiseAt = getCampusProvider('szu')?.deckRiseAt;
    if (deckRiseAt) {
      for (const shape of [paint, braking]) {
        const { vertices } = shape;
        for (let i = 0; i < vertices.length; i += 11) {
          vertices[i + 1] += deckRiseAt([vertices[i], 0, vertices[i + 2]]);
        }
      }
    }
  }
  const raiseMesh = getCampusProvider(event.campus)?.raiseMesh;
  if (raiseMesh) {
    for (const shape of [paint, arches, braking, ...decals.map(decal => decal.shape)]) raiseMesh(shape);
  }
  const marks = [...meshCells(gpu, [arches]), ...decals.map(({ shape, canvas }) => new gpu.Mesh(shape, 5, canvas))];
  const placed = meshes => meshes.map(mesh => [mesh, IDENTITY]);
  return {
    arrows: placed(marks.concat(meshCells(gpu, [paint]))),
    braking: placed(marks.concat(meshCells(gpu, [braking]))),
  };
}

export function uploadRidingScene(gpu, campus) {
  const solid = meshCells(gpu, [masonry, scenery, urban, foliage]).map(mesh => [mesh, IDENTITY]);
  const labels = signs.map(({ shape, canvas }) => [new gpu.Mesh(shape, 5, canvas), IDENTITY]);
  const world = {
    labels,
    solid,
    surfaces: [
      ...meshCells(gpu, [road], 2), ...meshCells(gpu, [pavement], 4), ...meshCells(gpu, [water], 3),
    ].map(mesh => [mesh, IDENTITY]),
    mirrored: solid.concat(labels),
    ground: [new gpu.Mesh(terrain, 1), IDENTITY],
    hasWater: campus !== 'ucl',
    waterBounds: campus === 'shunde' ? getCampusProvider('shunde')?.getReflectionBounds?.() : undefined,
  };
  gpu.bake(solid);
  clearWorldShapes();
  const cars = new Map();
  for (const actor of cityVehicles) {
    if (!cars.has(actor.model)) cars.set(actor.model, new gpu.Mesh(actor.model));
  }
  return { world, cars };
}

export function disposeRidingScene(world, cars, routeMeshes) {
  const meshes = new Set(cars.values());
  for (const [mesh] of [...world.solid, ...world.surfaces, ...world.labels, world.ground]) meshes.add(mesh.owner ?? mesh);
  for (const { arrows, braking } of routeMeshes.values()) {
    for (const [mesh] of [...arrows, ...braking]) meshes.add(mesh.owner ?? mesh);
  }
  for (const mesh of meshes) mesh.dispose();
  routeMeshes.clear();
}
