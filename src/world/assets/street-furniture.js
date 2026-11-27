// @ts-check
import { placement, transform } from '../../core/math.js';

/**
 * @typedef {{ box: Function }} FurnitureBoxSink
 */

/**
 * Emit a wooden park bench with dark metal legs and three backrest slats.
 * @param {{ x: number, z: number, yaw?: number }} spec
 * @param {{ scenery: FurnitureBoxSink }} sinks
 */
export function emitParkBench({ x, z, yaw = 0 }, { scenery }) {
  const m = placement([x, 0, z], 0, yaw);
  /**
   * @param {readonly [number, number, number]} p
   * @param {readonly [number, number, number]} size
   * @param {string} color
   */
  const box = (p, size, color) => scenery.box(transform(m, p), size, color, yaw);
  for (const d of [-.79, .79]) {
    box([d, .235, 0], [.10, .47, .58], '#3f5145');
    box([d, .59, -.23], [.075, .67, .072], '#3c4b3f');
  }
  for (let i = 0; i < 5; i++) box([0, .451, -.245 + i * .112], [2.07, .078, .088], i % 2 ? '#b88755' : '#c68c59');
  for (let i = 0; i < 3; i++) box([0, .65 + i * .14, -.25], [2.07, .102, .069], '#ab784d');
}

/**
 * Emit a courtyard bench with four seat slats and a single backrest rail.
 * @param {{ x: number, z: number, yaw?: number }} spec
 * @param {{ scenery: FurnitureBoxSink }} sinks
 */
export function emitCourtyardBench({ x, z, yaw = 0 }, { scenery }) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  /**
   * @param {number} u
   * @param {number} y
   * @param {number} [v]
   */
  const point = (u, y, v = 0) => [x + c * u - s * v, y, z + s * u + c * v];
  for (const side of [-.72, .72]) scenery.box(point(side, .27), [.12, .54, .54], '#46564e', yaw);
  for (let i = 0; i < 4; i++) scenery.box(point(0, .47, -.19 + i * .125), [1.95, .08, .09], i % 2 ? '#b78455' : '#c3925e', yaw);
  scenery.box(point(0, .75, -.21), [1.95, .08, .08], '#a6754e', yaw);
}

/**
 * Emit a bordered courtyard planter bed over an infill paving slab.
 * @param {{ x: number, z: number, width: number, depth: number, paving: string, planter: string }} spec
 * @param {{ pavement: FurnitureBoxSink, scenery: FurnitureBoxSink }} sinks
 */
export function emitPlanter({ x, z, width, depth, paving, planter }, { pavement, scenery }) {
  pavement.box([x, .035, z], [width, .07, depth], paving);
  scenery.box([x, .19, z - depth * .47], [width, .30, .18], planter);
  scenery.box([x, .19, z + depth * .47], [width, .30, .18], planter);
  scenery.box([x - width * .47, .19, z], [.18, .30, depth], planter);
  scenery.box([x + width * .47, .19, z], [.18, .30, depth], planter);
}

/**
 * Emit a capped trail/shortcut warning bollard post at elevated terrain height `y`.
 * @param {{ x: number, y: number, z: number, firm?: boolean }} spec
 * @param {{ masonry: FurnitureBoxSink }} sinks
 */
export function emitTrailPost({ x, y, z, firm = true }, { masonry }) {
  masonry.box([x, y + .46, z], [.50, .92, .50], firm ? '#b6a88d' : '#7d6850');
  masonry.box([x, y + .96, z], [.56, .12, .56], '#d96b43');
}
