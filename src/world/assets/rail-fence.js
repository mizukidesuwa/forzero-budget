// @ts-check
import { add, lerpPoint, mix } from '../../core/math.js';

/**
 * @typedef {{ box: Function, tube: Function }} FenceShapeSink
 * @typedef {(x: number, z: number, w: number, depth: number, yaw: number, height: number) => void} FenceFootprintSink
 */

/**
 * Emit a steel post-and-rail perimeter fence (with optional center pedestrian gap).
 * Endpoint interpolation preserves the same coordinates for posts and collision segments.
 * @param {{ from: readonly [number, number], to: readonly [number, number], gap?: number }} spec
 * @param {{ scenery: FenceShapeSink, footprint?: FenceFootprintSink | null }} sinks
 */
export function emitRailFence({ from: [x, z], to: [xx, zz], gap = 0 }, { scenery, footprint = null }) {
  const length = Math.hypot(xx - x, zz - z), yaw = -Math.atan2(zz - z, xx - x);
  /**
   * @param {number} t
   * @param {number} y
   */
  const point = (t, y) => [mix(x, xx, t), y, mix(z, zz, t)];
  const rail = '#343d3d';
  /**
   * @param {number} from
   * @param {number} to
   */
  const segment = (from, to) => {
    const center = (from + to) / 2;
    const [cx, , cz] = point(center, 0);
    const span = (to - from) * length;
    footprint?.(cx, cz, span, .12, yaw, 1.13);
    for (const y of [.28, 1.01]) scenery.box([cx, y, cz], [span, .071, .077], rail, yaw);
    const count = Math.ceil(span / 1.35);
    for (let i = 0; i <= count; i++) {
      const t = mix(from, to, i / count);
      scenery.tube(point(t, 0), point(t, 1.18), .038, .038, rail, 4, false);
    }
  };
  if (gap > 0 && gap < length) {
    const split = gap / (2 * length);
    segment(0, .5 - split);
    segment(.5 + split, 1);
  } else segment(0, 1);
}

/**
 * Emit a stone balustrade with regularly spaced vertical posts and top coping rail.
 * @param {{ from: readonly [number, number], to: readonly [number, number], height: number, rail: string }} spec
 * @param {{ scenery: Pick<FenceShapeSink, 'box'> }} sinks
 */
export function emitStoneRail({ from, to, height, rail }, { scenery }) {
  const [x, z] = from, [xx, zz] = to;
  const length = Math.hypot(xx - x, zz - z), yaw = -Math.atan2(zz - z, xx - x);
  const count = Math.max(2, Math.ceil(length / 2.2));
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const [px, , pz] = lerpPoint([x, 0, z], [xx, 0, zz], t);
    scenery.box([px, height * .5, pz], [.22, height, .22], rail, yaw);
  }
  scenery.box([(x + xx) / 2, height * .82, (z + zz) / 2], [length, .16, .16], rail, yaw);
}

/**
 * Emit a wrought-iron campus gate railing with pointed pickets and collision footprint.
 * @param {{ from: readonly [number, number], to: readonly [number, number], height?: number, color?: string }} spec
 * @param {{ masonry: FenceShapeSink, footprint?: FenceFootprintSink | null }} sinks
 */
export function emitIronGateRail({ from, to, height = 1.68, color = '#202729' }, { masonry, footprint = null }) {
  const [x, z] = from, [xx, zz] = to, span = Math.hypot(xx - x, zz - z);
  const yaw = -Math.atan2(zz - z, xx - x), iron = color;
  const [cx, cz] = [mix(x, xx, .5), mix(z, zz, .5)];
  for (const y of [.23, height - .21]) masonry.box([cx, y, cz], [span, .056, .063], iron, yaw);
  const bars = Math.ceil(span / .177);
  for (let i = 0; i <= bars; i++) {
    const t = i / bars, bx = mix(x, xx, t), bz = mix(z, zz, t);
    masonry.box([bx, height / 2, bz], [.034, height - .07, .034], iron);
    masonry.tube([bx, height - .045, bz], [bx, height + .047, bz], .033, .002, iron, 5);
  }
  footprint?.(cx, cz, span, .085, yaw, height);
}

/**
 * Emit a low roadside stone curb topped with trimmed hedge border.
 * @param {{ x: number, z: number, length: number, yaw?: number }} spec
 * @param {{ scenery: Pick<FenceShapeSink, 'box'> }} sinks
 */
export function emitLowHedgeBorder({ x, z, length, yaw = 0 }, { scenery }) {
  scenery.box([x, .14, z], [length, .28, .34], '#b4ac95', yaw);
  scenery.box([x, .31, z], [length, .06, .40], '#c8c0a9', yaw);
  scenery.box([x, .53, z], [length, .38, .28], '#63804c', yaw);
}

/**
 * Emit a sloped stepped-court handrail along local `(u, y, v)` lot projection.
 * @param {{ point: (u: number, y: number, v: number) => number[], z: number }} spec
 * @param {{ scenery: Pick<FenceShapeSink, 'tube'> }} sinks
 */
export function emitSlopedCourtRail({ point, z }, { scenery }) {
  const base = point(-7.2, 1.19, z), top = point(6.72, 6.09, z);
  scenery.tube(base, top, .065, .065, '#817867', 6);
  for (let i = 0; i <= 10; i++) {
    const p = point(-7.2 + i * 1.392, 1.19 + i * .49, z);
    scenery.tube(add(p, [0, -.94, 0]), p, .038, .038, '#817867', 5);
  }
}
