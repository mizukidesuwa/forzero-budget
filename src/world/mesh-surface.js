// @ts-check
import { ROAD_CELL, streetCell } from './geometry.js';

/**
 * @typedef {{ x: number, y: number, z: number, dx: number, dz: number, ex: number, ez: number,
 * dy: number, ey: number, inverse: number, minX: number, maxX: number, minZ: number, maxZ: number,
 * hard: boolean }} SurfaceTriangle
 * @typedef {{ cells: Map<number, SurfaceTriangle[]>, largeFaces: SurfaceTriangle[] }} SurfaceIndex
 */

/** @type {readonly SurfaceTriangle[]} */
const noFaces = [];

/**
 * Index a range of triangles from the scene's actual mesh.
 * @param {{ vertices: ArrayLike<number>, indices: ArrayLike<number> }} mesh
 * @param {number} from
 * @param {number} to
 * @param {{ index?: SurfaceIndex, hard?: boolean, upwardOnly?: boolean, maxCellsPerFace?: number }} [options]
 * @returns {SurfaceIndex}
 */
export function indexSurfaceTriangles(mesh, from, to, {
  index = { cells: new Map(), largeFaces: [] }, hard = false, upwardOnly = false, maxCellsPerFace = Infinity,
} = {}) {
  const { vertices, indices } = mesh;
  for (let i = from; i < to; i += 3) {
    const a = indices[i] * 11, b = indices[i + 1] * 11, c = indices[i + 2] * 11;
    if (upwardOnly && vertices[a + 4] + vertices[b + 4] + vertices[c + 4] < .6) continue;
    const x = vertices[a], z = vertices[a + 2], y = vertices[a + 1];
    const bx = vertices[b], bz = vertices[b + 2], cx = vertices[c], cz = vertices[c + 2];
    const dx = bx - x, dz = bz - z, ex = cx - x, ez = cz - z;
    const det = dx * ez - dz * ex;
    if (Math.abs(det) < .000001) continue;
    const minX = Math.min(x, bx, cx), maxX = Math.max(x, bx, cx);
    const minZ = Math.min(z, bz, cz), maxZ = Math.max(z, bz, cz);
    const triangle = {
      x, z, y, dx, dz, ex, ez, dy: vertices[b + 1] - y, ey: vertices[c + 1] - y,
      inverse: 1 / det, minX, maxX, minZ, maxZ, hard,
    };
    const left = Math.floor(minX / ROAD_CELL), right = Math.floor(maxX / ROAD_CELL);
    const firstRow = Math.floor(minZ / ROAD_CELL), lastRow = Math.floor(maxZ / ROAD_CELL);
    // A map-sized base quad needs only one copy of each face.
    if ((right - left + 1) * (lastRow - firstRow + 1) > maxCellsPerFace) {
      index.largeFaces.push(triangle);
      continue;
    }
    for (let col = left; col <= right; col++) {
      for (let row = firstRow; row <= lastRow; row++) {
        const key = streetCell(col * ROAD_CELL, row * ROAD_CELL);
        let bucket = index.cells.get(key);
        if (!bucket) index.cells.set(key, bucket = []);
        bucket.push(triangle);
      }
    }
  }
  return index;
}

/**
 * @param {SurfaceIndex | null | undefined} index
 * @param {number} x
 * @param {number} z
 * @returns {{ height: number, hard: boolean } | null}
 */
export function sampleMeshSurface(index, x, z) {
  if (!index) return null;
  const local = index.cells.get(streetCell(x, z)) ?? noFaces;
  const { largeFaces } = index, count = largeFaces.length + local.length;
  let top = -Infinity, hard = false;
  for (let i = 0; i < count; i++) {
    const face = i < largeFaces.length ? largeFaces[i] : local[i - largeFaces.length];
    if (x < face.minX || x > face.maxX || z < face.minZ || z > face.maxZ) continue;
    const dx = x - face.x, dz = z - face.z;
    const u = (dx * face.ez - dz * face.ex) * face.inverse;
    const v = (face.dx * dz - face.dz * dx) * face.inverse;
    if (u < -.00001 || v < -.00001 || u + v > 1.00001) continue;
    const height = face.y + u * face.dy + v * face.ey;
    if (height >= top - .00001) {
      top = height;
      hard = face.hard;
    }
  }
  return top === -Infinity ? null : { height: top, hard };
}
