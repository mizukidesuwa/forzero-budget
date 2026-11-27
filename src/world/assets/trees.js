// @ts-check
import { TAU, add, lerpPoint, scale, tint, unitRight } from '../../core/math.js';

/**
 * @typedef {{ tube: Function, ellipsoid: Function, box: Function }} PropScenerySink
 * @typedef {{ ellipsoid: Function, triangle: Function }} PropFoliageSink
 * @typedef {{ x: number, z: number, r: number, color: number }} TreeSiteEntry
 */

/**
 * Emit a procedural deciduous tree with branching limbs, multi-bulb canopy, and root flares.
 * @param {{ x: number, z: number, size: number, variant?: number, light?: boolean }} spec
 * @param {{ scenery: PropScenerySink, foliage: PropFoliageSink, treeSites: TreeSiteEntry[], range: (lo: number, hi: number) => number }} sinks
 */
export function emitDeciduous({ x, z, size: s, variant = 0, light = true }, { scenery, foliage, treeSites, range }) {
  const b = [x, -.008, z];
  const h = range(3.1, 4.7) * s;
  const bend = [range(-.37, .37) * s, h * .72, range(-.37, .37) * s];
  const crown = add(b, [bend[0] * 1.6, h * .97, bend[2] * 1.6]);
  const palette = variant === 1
    ? ['#66814a', '#79914f', '#6f8745', '#869957', '#4b6b3c']
    : variant === 2
      ? ['#727d4a', '#8c955a', '#9ca36a', '#6c7c45', '#597342']
      : ['#4b7443', '#567f49', '#698b4b', '#487144', '#567b43'];
  const trunk = ['#675c43', '#6c5b42', '#7a6547'][variant];
  scenery.tube(b, add(b, bend), s * .184, s * .101, trunk, light ? 6 : 8);
  scenery.tube(add(b, scale(bend, .85)), crown, s * .095, s * .048, '#786647', light ? 5 : 7);
  const radius = range(1.42, 2.01) * s;
  foliage.ellipsoid(crown, [radius * 1.05, radius * .92, radius], palette[0], light ? 8 : 11, light ? 5 : 7);
  for (let i = 0; i < 7; i++) {
    const a = TAU * i / 7 + range(-.30, .30), r = radius * range(.48, .98);
    const end = add(crown, [Math.cos(a) * r, range(-.5, .73) * s, Math.sin(a) * r]);
    const bulb = radius * range(.49, .79);
    const bt = i < 5 ? range(.66, .99) : 0;
    if (i < 5 && !light) scenery.tube(add(b, scale(bend, bt)), end, s * .085, s * .026, trunk, 6);
    foliage.ellipsoid(end, [bulb * range(.90, 1.27), bulb * range(.66, 1.17), bulb * range(.89, 1.22)], palette[i % palette.length], light ? 6 : 8, light ? 3 : 4, range(-.19, .19), a);
    const high = add(end, [range(-.4, .4) * s, .53 * s, range(-.4, .4) * s]);
    if (i % 2 === 0) foliage.ellipsoid(high, [bulb * .64, bulb * .53, bulb * .72], tint(palette[(i + 1) % palette.length], 1.07), light ? 5 : 7, light ? 3 : 4);
    if (variant === 1 && i % 3 === 0 && s > 1) {
      for (let j = 0; j < 7; j++) {
        const pos = add(end, [range(-.47, .47), -bulb * .62 + range(-.13, .10), range(-.43, .43)]);
        if (j % 2 === 0) scenery.box(pos, [.115, .120, .115], '#b6533e');
      }
    }
  }
  for (let i = 0; i < 4; i++) {
    const a = TAU * i / 4 + variant;
    scenery.tube([x + Math.sin(a) * .42 * s, .018, z + Math.cos(a) * .43 * s], add(b, [0, .31 * s, 0]), .035 * s, .12 * s, trunk, light ? 4 : 5, false);
  }
  treeSites.push({ x, z, r: radius * 1.35, color: variant });
}

/**
 * Emit a curved palm tree with arched frond triangles.
 * @param {{ x: number, z: number, size: number, light?: boolean }} spec
 * @param {{ scenery: PropScenerySink, foliage: PropFoliageSink, treeSites: TreeSiteEntry[], range: (lo: number, hi: number) => number }} sinks
 */
export function emitPalm({ x, z, size, light = true }, { scenery, foliage, treeSites, range }) {
  const base = [x, 0, z], trunk = '#8a8063';
  const top = [x + size * .55, size * 4.8, z - size * .2];
  let root = base;
  const trunkSteps = light ? 6 : 12, trunkSides = light ? 6 : 8, frondSteps = light ? 6 : 10;
  for (let i = 1; i <= trunkSteps; i++) {
    const u = i / trunkSteps, next = lerpPoint(base, top, u);
    next[0] -= .43 * Math.sin(Math.PI * u) * size;
    scenery.tube(root, next, (.168 - u * 12 * .0057) * size, (.163 - u * 12 * .0057) * size, tint(trunk, .91 + .055 * (i % 4)), trunkSides, false);
    root = next;
  }
  scenery.ellipsoid(top, [.31 * size, .41 * size, .31 * size], '#5b7141', light ? 6 : 10, light ? 4 : 5);
  for (let i = 0; i < 12; i++) {
    const bearing = i * 2.39996 + range(-.08, .08);
    const d = [Math.cos(bearing), 0, Math.sin(bearing)], side = unitRight(d);
    const reach = size * range(1.65, 3.13);
    const origin = add(top, [0, size * (i % 4) * .07, 0]);
    /** @param {number} t */
    const point = (t) => add(origin, [d[0] * t * reach, (Math.sin(t * Math.PI) * (.60 + (i % 5) * .16) - t * t * .63) * size, d[2] * t * reach]);
    for (let j = 0; j < frondSteps; j++) {
      const t = j / frondSteps, n = (j + 1) / frondSteps;
      const a = point(t), b = point(n), w = Math.pow(Math.sin(Math.PI * n), .77) * .45 * size;
      foliage.triangle(a, b, add(lerpPoint(a, b, .7), add(scale(side, w), [0, -.14 * size, 0])), i % 2 ? '#638043' : '#839454', [.07, .97, .20]);
      foliage.triangle(b, a, add(lerpPoint(a, b, .7), add(scale(side, -w), [0, -.19 * size, 0])), i % 3 ? '#738c4c' : '#556c39', [-.13, .95, -.20]);
    }
  }
  treeSites.push({ x, z, r: 2.2 * size, color: 1 });
}

/**
 * Emit a compact ornamental courtyard tree without consuming the map RNG stream.
 * @param {{ x: number, z: number, size: number, crown: string }} spec
 * @param {{ scenery: Pick<PropScenerySink, 'tube'>, foliage: Pick<PropFoliageSink, 'ellipsoid'> }} sinks
 */
export function emitLowTree({ x, z, size, crown }, { scenery, foliage }) {
  const h = 2.45 * size;
  scenery.tube([x, .02, z], [x, h, z], .13 * size, .07 * size, '#6d5d45', 6, false);
  foliage.ellipsoid([x, h + .18 * size, z], [1.15 * size, .92 * size, 1.04 * size], crown, 8, 4);
  foliage.ellipsoid([x - .42 * size, h - .05 * size, z + .18 * size],
    [.72 * size, .58 * size, .70 * size], crown, 7, 3);
  foliage.ellipsoid([x + .38 * size, h + .06 * size, z - .16 * size],
    [.68 * size, .55 * size, .64 * size], crown, 7, 3);
}

/**
 * Emit a lightweight hillside tree silhouette with optional LOD trunk detail.
 * @param {{ x: number, y: number, z: number, height: number, roadside?: boolean, withTrunk?: boolean }} spec
 * @param {{ scenery: Pick<PropScenerySink, 'tube'>, foliage: Pick<PropFoliageSink, 'ellipsoid'> }} sinks
 */
export function emitMountainTree({ x, y, z, height, roadside = false, withTrunk = true }, { scenery, foliage }) {
  foliage.ellipsoid([x, y + height * .73, z], [height * .52, height * .47, height * .51],
    height > 5 ? '#4f7245' : '#668248', roadside ? 7 : 6, roadside ? 4 : 3);
  if (withTrunk) scenery.tube([x, y - .13, z], [x, y + height * .73, z], .15, .07, '#756750', 4, false);
}

/**
 * Emit a symmetrical entrance palm using a local frame projection function.
 * @param {{ point: (u: number, y: number, v: number) => number[], u: number, v: number, height: number }} spec
 * @param {{ scenery: Pick<PropScenerySink, 'tube'>, foliage: Pick<PropFoliageSink, 'triangle'>, solid?: ((u: number, v: number, w: number, depth: number, height: number) => void) | null }} sinks
 */
export function emitGatePalm({ point: p, u, v, height: h }, { scenery, foliage, solid = null }) {
  const root = p(u, 0, v), top = p(u + .18, h, v - .15);
  scenery.tube(root, top, .14, .087, '#8e8271', 8);
  for (let i = 0; i < 13; i++) {
    const a = i * 2.39996, len = 1.65 + .22 * (i % 4);
    /**
     * @param {number} t
     * @param {number} off
     */
    const frond = (t, off) => p(u + .18 + Math.cos(a) * len * t - Math.sin(a) * off,
      h + .8 * Math.sin(t * Math.PI) - .46 * t * t, v - .15 + Math.sin(a) * len * t + Math.cos(a) * off);
    for (let j = 0; j < 5; j++) {
      const t = j / 5, next = (j + 1) / 5, wide = .24 * Math.sin(Math.PI * (next - .08));
      const tip = frond(next, 0), base = frond(t, 0);
      for (const side of [-1, 1]) foliage.triangle(base, tip, frond((t + next) / 2, wide * side),
        (i + j) % 3 ? '#557d45' : '#79964e', [.07, .96, .16]);
    }
  }
  solid?.(u, v, .30, .30, h);
}
