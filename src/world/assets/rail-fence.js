import { mix } from '../../core/math.js';

// Endpoint interpolation preserves the same coordinates for posts and collision segments.
export function emitRailFence({ from: [x, z], to: [xx, zz], gap }, { scenery, footprint }) {
  const length = Math.hypot(xx - x, zz - z), yaw = -Math.atan2(zz - z, xx - x);
  const point = (t, y) => [mix(x, xx, t), y, mix(z, zz, t)];
  const rail = '#343d3d';
  const segment = (from, to) => {
    const center = (from + to) / 2;
    const [cx, , cz] = point(center, 0);
    const span = (to - from) * length;
    footprint(cx, cz, span, .12, yaw, 1.13);
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
