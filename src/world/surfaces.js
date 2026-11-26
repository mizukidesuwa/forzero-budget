import { ROAD_Y, clamp } from '../core/math.js';
import { worldState } from '../core/state.js';
import {
  campusFixtures, lawnSpans, masonry, pavement, ribbon, street, streetCell, uclFixtures,
} from './geometry.js';

export function lawnPatch(mesh, draw) {
  const from = mesh.indices.length;
  draw();
  lawnSpans.push({ mesh, from, to: mesh.indices.length });
}

export function indexGroundSurfaces() {
  const index = new Map();
  const addTriangles = (mesh, from, to, hard) => {
    const { vertices, indices } = mesh;
    for (let i = from; i < to; i += 3) {
      const a = indices[i] * 11, b = indices[i + 1] * 11, c = indices[i + 2] * 11;
      if (vertices[a + 4] + vertices[b + 4] + vertices[c + 4] < .6) continue;
      const x = vertices[a], z = vertices[a + 2], y = vertices[a + 1];
      const bx = vertices[b], bz = vertices[b + 2], cx = vertices[c], cz = vertices[c + 2];
      const dx = bx - x, dz = bz - z, ex = cx - x, ez = cz - z;
      const det = dx * ez - dz * ex;
      if (Math.abs(det) < .000001) continue;
      const minX = Math.min(x, bx, cx), maxX = Math.max(x, bx, cx), minZ = Math.min(z, bz, cz), maxZ = Math.max(z, bz, cz);
      const triangle = {
        x, z, y, dx, dz, ex, ez, dy: vertices[b + 1] - y, ey: vertices[c + 1] - y,
        inverse: 1 / det, minX, maxX, minZ, maxZ, hard,
      };
      for (let col = Math.floor(minX / 12); col <= Math.floor(maxX / 12); col++) {
        for (let row = Math.floor(minZ / 12); row <= Math.floor(maxZ / 12); row++) {
          const key = col * 4096 + row;
          if (!index.has(key)) index.set(key, []);
          index.get(key).push(triangle);
        }
      }
    }
  };
  addTriangles(pavement, 0, pavement.indices.length, true);
  for (const { mesh, from, to } of lawnSpans) addTriangles(mesh, from, to, false);
  lawnSpans.length = 0;
  worldState.groundSurfaces = index;
}

export function pavedGroundAt(x, z) {
  const triangles = worldState.groundSurfaces?.get(streetCell(x, z));
  if (!triangles) return false;
  let top = -Infinity, hard = false;
  for (const face of triangles) {
    if (x < face.minX || x > face.maxX || z < face.minZ || z > face.maxZ) continue;
    const dx = x - face.x, dz = z - face.z;
    const u = (dx * face.ez - dz * face.ex) * face.inverse;
    const v = (face.dx * dz - face.dz * dx) * face.inverse;
    if (u < -.00001 || v < -.00001 || u + v > 1.00001) continue;
    const height = face.y + u * face.dy + v * face.ey;
    if (height >= top - .00001) { top = height; hard = face.hard; }
  }
  return hard;
}

export const szuHighRiskShortcuts = [];

export const uclHighRiskShortcuts = [
  {
    name: 'IOE 西侧窄切线',
    width: 1.44,
    points: [[187.4, 257.6], [183.4, 245.5], [179.6, 232.0], [174.4, 217.2]],
    posts: [[180.4, 246.4], [186.2, 244.4]],
  },
];

export function shortcutSegDist(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
  const t = len2 > 1e-8 ? clamp(((x - ax) * dx + (z - az) * dz) / len2, 0, 1) : 0;
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

export function shortcutRibbonContains(list, x, z) {
  for (const cut of list) {
    const half = cut.width * .5;
    for (let i = 1; i < cut.points.length; i++) {
      const [ax, az] = cut.points[i - 1], [bx, bz] = cut.points[i];
      if (shortcutSegDist(x, z, ax, az, bx, bz) <= half) return true;
    }
  }
  return false;
}

export function buildSzuShortcutVisuals() {
  for (const cut of szuHighRiskShortcuts) {
    const strip = street(cut.points, cut.width);
    const half = cut.width * .5;
    ribbon(pavement, strip, -half, half, ROAD_Y + .004, '#8b8878', 0, strip.length);
    for (const [px, pz] of cut.posts) {
      campusFixtures.push({ name: cut.name + '护桩', x: px, z: pz, w: .62, depth: .62, height: 1.05, yaw: 0, c: 1, s: 0 });
      masonry.box([px, .46, pz], [.52, .92, .52], '#b6a88d');
      masonry.box([px, .96, pz], [.58, .12, .58], '#d96b43');
    }
  }
}

export function buildUclShortcutVisuals() {
  for (const cut of uclHighRiskShortcuts) {
    const strip = street(cut.points, cut.width);
    const half = cut.width * .5;
    ribbon(pavement, strip, -half, half, ROAD_Y + .0035, '#9d9788', 0, strip.length);
    for (const [px, pz] of cut.posts) {
      uclFixtures.push({ name: cut.name + '石柱', x: px, z: pz, w: .64, depth: .64, height: 1.05, yaw: 0, c: 1, s: 0 });
      masonry.box([px, .46, pz], [.54, .92, .54], '#b7ad9a');
      masonry.box([px, .96, pz], [.60, .12, .60], '#c96f4b');
    }
  }
}
