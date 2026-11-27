import { signCanvas } from '../core/canvas.js';
import {
  ROAD_Y, add, clamp, dot, length, lerpPoint, mix,
  normalize, placement, random, range, scale, subtract, tint, transform, unitRight,
} from '../core/math.js';
import { Shape } from '../core/shape.js';
import { getActiveCampus } from '../core/state.js';
import { getCampusProvider } from './registry.js';
import { emitStreetLamp } from './assets/lamps.js';
import { emitParkBench } from './assets/street-furniture.js';
import { emitDeciduous, emitPalm } from './assets/trees.js';

export const terrain = new Shape();
export const masonry = new Shape();
export const pavement = new Shape();
export const road = new Shape();
export const foliage = new Shape();
export const scenery = new Shape();
export const water = new Shape();
export const urban = new Shape();

export const signs = [];
export const treeSites = [];
export const cityJunctions = [];
export const cityVehicles = [];
export const citySolid = [];
export const campusFixtures = [];
export const uclFixtures = [];
export const lawnSpans = [];

export const worldShapes = [masonry, scenery, urban, foliage, road, pavement, water, terrain];
export const sceneLists = [cityJunctions, cityVehicles, citySolid, campusFixtures, treeSites, lawnSpans, uclFixtures];

export function clearWorldShapes() {
  for (const shape of worldShapes) shape.vertices.length = shape.indices.length = 0;
  signs.length = 0;
}

export const ROAD_CELL = 12;
export const streetCell = (x, z) => Math.floor(x / ROAD_CELL) * 4096 + Math.floor(z / ROAD_CELL);

export function putObstacle(index, entry, x, z, halfWidth, halfDepth) {
  const minX = Math.floor((x - halfWidth) / ROAD_CELL), maxX = Math.floor((x + halfWidth) / ROAD_CELL);
  const minZ = Math.floor((z - halfDepth) / ROAD_CELL), maxZ = Math.floor((z + halfDepth) / ROAD_CELL);
  for (let column = minX; column <= maxX; column++) {
    for (let row = minZ; row <= maxZ; row++) {
      const key = column * 4096 + row;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(entry);
    }
  }
}

export function indexFootprint(index, entry, part, margin) {
  const w = part.w / 2 + margin, d = part.depth / 2 + margin;
  const c = Math.abs(part.c ?? 1), s = Math.abs(part.s ?? 0);
  putObstacle(index, entry, part.x, part.z, c * w + s * d, s * w + c * d);
}

export function indexStreets(paths) {
  const index = new Map();
  for (const path of paths) for (let i = 1; i < path.rows.length; i++) {
    const a = path.rows[i - 1].p, b = path.rows[i].p;
    const dx = b[0] - a[0], dz = b[2] - a[2];
    const ratio = 1 / Math.max(.000001, dx * dx + dz * dz);
    const edge = path.width + 7.5;
    const minX = Math.floor((Math.min(a[0], b[0]) - edge) / ROAD_CELL);
    const maxX = Math.floor((Math.max(a[0], b[0]) + edge) / ROAD_CELL);
    const minZ = Math.floor((Math.min(a[2], b[2]) - edge) / ROAD_CELL);
    const maxZ = Math.floor((Math.max(a[2], b[2]) + edge) / ROAD_CELL);
    const segment = { path, x: a[0], z: a[2], dx, dz, ratio, row: i };
    for (let X = minX; X <= maxX; X++) for (let Z = minZ; Z <= maxZ; Z++) {
      const key = X * 4096 + Z;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(segment);
    }
  }
  return index;
}

export function streetGapSquared(segment, x, z) {
  const dx = x - segment.x, dz = z - segment.z;
  const t = clamp((dx * segment.dx + dz * segment.dz) * segment.ratio, 0, 1);
  return (dx - segment.dx * t) ** 2 + (dz - segment.dz * t) ** 2;
}

export function plate(canvas, center, width, height, yaw = 0, layer = signs) {
  const shape = new Shape();
  const m = placement(center, 0, yaw);
  const p = ([x, y]) => transform(m, [x * width / 2, y * height / 2, 0]);
  shape.quad(p([-1, -1]), p([1, -1]), p([1, 1]), p([-1, 1]), '#ffffff', transform(m, [0, 0, 1], 0));
  layer.push({ shape, canvas });
}

export function bench(x, z, yaw) {
  emitParkBench({ x, z, yaw }, { scenery });
}

export function lamppost(x, z, dir) {
  emitStreetLamp({ x, z, direction: dir }, { scenery });
}

// The scene supplies its current random stream and retains map-specific placement guards.
const treeSinks = { scenery, foliage, treeSites, range };

export function deciduous(x, z, size, variant = 0, light = true) {
  if (getActiveCampus() === 'szu' && getCampusProvider('szu')?.isProtectedGround?.(x, z)) return;
  emitDeciduous({ x, z, size, variant, light }, treeSinks);
}

export function palm(x, z, size, light = true) {
  if (getActiveCampus() === 'szu' && getCampusProvider('szu')?.isProtectedGround?.(x, z)) return;
  emitPalm({ x, z, size, light }, treeSinks);
}

export function wallPanel(shape, x, y, z, w, h, color, nx, nz) {
  const dx = nz * w * .5, dz = -nx * w * .5, lo = y - h * .5, hi = y + h * .5;
  shape.quad([x - dx, lo, z - dz], [x + dx, lo, z + dz], [x + dx, hi, z + dz], [x - dx, hi, z - dz], color, [nx, 0, nz]);
}

export function academicBlock({ x, z, w, depth, floors, palette }) {
  const [plaster, trim, dark, roof] = palette;
  const front = z + depth / 2, back = z - depth / 2, postH = 2.48, spacing = 1.93;
  const h = postH + floors * spacing;
  const bayCount = Math.floor(w / 2.1);
  const bay = w / bayCount;
  masonry.box([x, .16, z + .7], [w + 1.6, .32, depth + 2.9], '#b6b295');
  masonry.box([x, .34, z + .4], [w + .83, .23, depth + 1.8], trim);
  masonry.box([x, 1.38, z - .28], [w - .2, 2.34, depth - .80], dark);
  masonry.box([x, (postH + h) / 2, z], [w, h - postH, depth], plaster);
  masonry.box([x, postH, z], [w + .38, .28, depth + .48], trim);
  for (let i = 0; i <= bayCount; i++) {
    const p = x - w / 2 + .12 + (w - .24) * i / bayCount;
    masonry.box([p, 1.37, front - .02], [.35, 2.18, .50], trim);
    masonry.box([p, .37, front], [.45, .29, .61], tint(trim, .8));
  }
  for (let f = 0; f < floors; f++) {
    const y = postH + .91 + spacing * f;
    masonry.box([x, y - .71, front + .065], [w, .13, .22], tint(trim, .92));
    masonry.box([x, y + .8, back - .05], [w, .15, .20], trim);
    for (let i = 0; i < bayCount; i++) {
      const p = x - w / 2 + bay * (i + .5);
      const shade = random();
      const glass = shade > .61 ? '#809592' : shade > .21 ? '#6d8884' : '#526c6b';
      wallPanel(masonry, p, y, front + .062, bay * .74, 1.30, trim, 0, 1);
      wallPanel(masonry, p, y, front + .113, bay * .65, 1.15, dark, 0, 1);
      wallPanel(masonry, p, y + .013, front + .138, bay * .61, 1.08, glass, 0, 1);
      wallPanel(masonry, p, y + .34, front + .162, bay * .61, .075, tint(glass, 1.24), 0, 1);
      wallPanel(masonry, p, y, front + .172, .053, 1.10, dark, 0, 1);
      wallPanel(masonry, p, y, back - .089, bay * .64, 1.16, glass, 0, -1);
      if (f === 0) {
        masonry.box([p, 1.50, front - .67], [bay * .73, 1.75, .11], '#3c5651');
        masonry.box([p, 1.5, front - .59], [.08, 1.76, .045], '#a2a087');
      }
    }
    for (const side of [-1, 1]) {
      for (let i = 0; i < Math.floor(depth / 2.07); i++) {
        const p = back + 1.3 + i * 1.9;
        wallPanel(masonry, x + side * (w / 2 + .105), y, p, 1.39, 1.20, trim, side, 0);
        wallPanel(masonry, x + side * (w / 2 + .149), y, p, 1.23, 1.04, '#6d8581', side, 0);
      }
    }
  }
  masonry.box([x, h + .12, z], [w + .6, .28, depth + .57], trim);
  masonry.box([x, h + .37, z], [w + .45, .27, depth + .36], roof);
  masonry.box([x, h + .54, z], [w + .73, .10, depth + .57], tint(roof, 1.12));
  masonry.box([x, h + .74, z], [w - 1.67, .35, depth - 1.34], tint(plaster, .94));
  for (let i = 0; i < Math.floor(w / 8); i++) {
    const sx = x - w / 2 + 3.6 + i * 7.3;
    masonry.box([sx, h + 1.02, z - 1.6], [2.15, .56, 2.75], '#a6aaa0');
    masonry.box([sx, h + 1.37, z - 1.6], [2.34, .15, 2.91], tint(roof, 1.09));
  }
}

export function travelTable(positions, width = 3.52) {
  const rows = positions.map((p, i) => ({
    p, distance: i ? length(subtract(p, positions[i - 1])) : 0
  }));
  for (let i = 1; i < rows.length; i++) rows[i].distance += rows[i - 1].distance;
  return { rows, width, length: rows[rows.length - 1].distance };
}

export function street(nodes, width = 3.5) {
  const node = i => nodes[clamp(i, 0, nodes.length - 1)];
  const count = (nodes.length - 1) * 24;
  return travelTable(Array.from({ length: count + 1 }, (_, n) => {
    const t = n / 24, i = Math.floor(t), f = t - i;
    const [a, b, c, d] = [node(i - 1), node(i), node(i + 1), node(i + 2)];
    const axis = j => .5 * (2 * b[j] + (c[j] - a[j]) * f
      + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * f * f
      + (3 * b[j] - a[j] - 3 * c[j] + d[j]) * f * f * f);
    return [axis(0), ROAD_Y, axis(1)];
  }), width);
}

export function along(path, distance) {
  const d = clamp(distance, 0, path.length);
  const rows = path.rows;
  let lo = 0, hi = rows.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].distance < d) lo = mid;
    else hi = mid;
  }
  const a = rows[lo], b = rows[hi];
  return lerpPoint(a.p, b.p, (d - a.distance) / Math.max(b.distance - a.distance, .0001));
}

export function courseFrame(path, d, loop = false) {
  const p = along(path, d);
  const before = d - .67, after = d + .67;
  const f = normalize(subtract(
    along(path, loop && after > path.length ? after - path.length : after),
    along(path, loop && before < 0 ? before + path.length : before),
  ));
  return { p, f, side: unitRight(f) };
}

export function offsetVertex(frame, offset, height) {
  return [frame.p[0] + frame.side[0] * offset, height, frame.p[2] + frame.side[2] * offset];
}

export function ribbon(mesh, path, lo, hi, y, color, from, to, spacing = .72) {
  const sections = Math.max(1, Math.ceil((to - from) / spacing));
  let a = courseFrame(path, from);
  const szuProvider = getCampusProvider('szu');
  for (let i = 1; i <= sections; i++) {
    const b = courseFrame(path, mix(from, to, i / sections));
    const slope = (mesh === road || mesh === pavement) && szuProvider?.shouldSubdivideRibbon?.(a) === true;
    const strips = slope ? Math.max(1, Math.ceil((hi - lo) / 1.25)) : 1;
    for (let edge = 0; edge < strips; edge++) {
      const left = mix(lo, hi, edge / strips), right = mix(lo, hi, (edge + 1) / strips);
      mesh.quad(offsetVertex(a, left, y), offsetVertex(b, left, y), offsetVertex(b, right, y), offsetVertex(a, right, y), color);
    }
    a = b;
  }
}

export function pointDistance(path, xy) {
  let closest = path.rows[0], error = Infinity;
  for (const row of path.rows) {
    const squared = (row.p[0] - xy[0]) ** 2 + (row.p[2] - xy[1]) ** 2;
    if (squared < error) { error = squared; closest = row; }
  }
  return closest.distance;
}

export function section(path, a, b) {
  return { path, start: a ? pointDistance(path, a) : 0, end: b ? pointDistance(path, b) : path.length };
}

export function joinTrack(sections, starts) {
  const positions = [];
  const at = (part, t) => along(part.path, mix(part.start, part.end, t));
  for (let i = 0; i < sections.length; i++) {
    const part = sections[i];
    const span = Math.abs(part.end - part.start);
    const cut = Math.min(.19, 4.2 / Math.max(1, span));
    const from = i === 0 ? 0 : cut, end = i + 1 === sections.length ? 1 : 1 - cut;
    const count = Math.max(3, Math.ceil(span * (end - from) / .61));
    starts?.push(positions.length);
    for (let j = 0; j <= count; j++) positions.push(at(part, mix(from, end, j / count)));
    if (i === sections.length - 1) continue;
    const more = sections[i + 1];
    const toCut = Math.min(.19, 4.2 / Math.max(1, Math.abs(more.end - more.start)));
    const inlet = at(part, end), joint = lerpPoint(at(part, 1), at(more, 0), .5), outlet = at(more, toCut);
    for (let j = 1; j <= 8; j++) {
      const f = j / 9;
      positions.push(lerpPoint(lerpPoint(inlet, joint, f), lerpPoint(joint, outlet, f), f));
    }
  }
  return travelTable(positions);
}

export function maxSafeSpeed(path, d) {
  const at = clamp(d, 2.45, path.length - 2.45);
  const before = courseFrame(path, at - 2.4).f;
  const after = courseFrame(path, at + 2.4).f;
  const curvature = Math.acos(clamp(dot(before, after), -1, 1)) / 4.8;
  return clamp(Math.sqrt(7.9 / Math.max(.001, curvature)), 5.35, 14.9);
}

export function coursePlan(path, length) {
  const count = Math.ceil(length / 2.35) + 1;
  const spacing = length / (count - 1);
  const raw = Array.from({ length: count }, (_, i) => maxSafeSpeed(path, i * spacing));
  const speeds = raw.slice();
  for (let i = count - 2; i >= 0; i--) speeds[i] = Math.min(speeds[i], Math.sqrt(speeds[i + 1] ** 2 + 2 * 4.65 * spacing));
  return { spacing, speeds, raw };
}

export function plannedSpeed(event, distance) {
  const a = event.plan;
  const i = clamp(distance / a.spacing, 0, a.speeds.length - 1);
  return mix(a.speeds[Math.floor(i)], a.speeds[Math.ceil(i)], i % 1);
}

export function campusFootprint(x, z, w, depth, yaw = 0, height = null) {
  return { x, z, w, depth, yaw, height, c: Math.cos(yaw), s: Math.sin(yaw) };
}

export function lotPoint(lot, u, y, v) {
  return [lot.x + lot.c * u + lot.s * v, y, lot.z - lot.s * u + lot.c * v];
}

export function lotPart(lot, u, v, w, depth, height) {
  const [x, , z] = lotPoint(lot, u, 0, v);
  return campusFootprint(x, z, w, depth, lot.yaw, height);
}

export function landmark(name, use, kind, x, z, w, depth, floors, yaw, palette, priority = 8) {
  return { ...campusFootprint(x, z, w, depth, yaw), name, use, kind, floors, palette, priority };
}

export function footprintCorners(lot) {
  if (lot.outline) return lot.outline.map(([u, v]) => lotPoint(lot, u, 0, v));
  const rect = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  if (lot.yaw === undefined) return rect.map(([u, v]) => [lot.x + u * lot.w / 2, 0, lot.z + v * lot.depth / 2]);
  return rect.map(([u, v]) => lotPoint(lot, u * lot.w / 2, 0, v * lot.depth / 2));
}

export function closeToBlock(x, z, block, padding = 0) {
  const dx = x - block.x, dz = z - block.z;
  if (!block.yaw) return Math.abs(dx) < block.w / 2 + padding && Math.abs(dz) < block.depth / 2 + padding;
  return Math.abs(block.c * dx - block.s * dz) < block.w / 2 + padding &&
    Math.abs(block.s * dx + block.c * dz) < block.depth / 2 + padding;
}

export function fitsBetweenBuildings(a, b) {
  const ac = a.c ?? 1, as = a.s ?? 0, bc = b.c ?? 1, bs = b.s ?? 0;
  const radius = (p, c, s, u, v) => (Math.abs(c * u - s * v) * p.w + Math.abs(s * u + c * v) * p.depth) / 2;
  return [[ac, -as], [as, ac], [bc, -bs], [bs, bc]].some(([u, v]) =>
    Math.abs((a.x - b.x) * u + (a.z - b.z) * v) >= 1.4 + radius(a, ac, as, u, v) + radius(b, bc, bs, u, v));
}

export function namedSign(title, subtitle, background, ink) {
  return signCanvas(1050, 205, (ctx, w, h) => {
    ctx.fillStyle = background; ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center'; ctx.fillStyle = ink;
    ctx.font = '700 104px "Microsoft YaHei","PingFang SC",sans-serif';
    ctx.fillText(title, w * .5, 113);
    if (subtitle) {
      ctx.font = '600 34px "Microsoft YaHei","PingFang SC",sans-serif';
      ctx.fillText(subtitle, w * .5, 165);
    }
  });
}

export function lotBox(block, u, y, v, w, h, d, color, mesh = masonry) {
  mesh.box(lotPoint(block, u, y, v), [w, h, d], color, block.yaw);
}

export function facadeOf(block, quarter = 0, inset = 0) {
  const yaw = block.yaw + quarter * Math.PI / 2, c = Math.cos(yaw), s = Math.sin(yaw);
  const width = quarter % 2 ? block.depth : block.w;
  const depth = quarter % 2 ? block.w : block.depth;
  // Separate close facade layers so the depth buffer can resolve them at oblique angles.
  const point = (u, y, v = 0) => {
    const lift = v > 0 ? v + .10 * v / (v + .12) : v;
    const outward = depth / 2 + lift - inset;
    return [block.x + c * u + s * outward, y, block.z - s * u + c * outward];
  };
  const panel = (u, y, w, h, color, v = .022) => masonry.quad(
    point(u - w / 2, y - h / 2, v), point(u + w / 2, y - h / 2, v),
    point(u + w / 2, y + h / 2, v), point(u - w / 2, y + h / 2, v), color, [s, 0, c]);
  return { panel, point, width, yaw, normal: [s, 0, c] };
}

export function facadeName({ point, yaw }, title, subtitle, y, w, h, skin = '#d9d8ce', ink = '#394847') {
  plate(namedSign(title, subtitle, skin, ink), point(0, y, .051), w, h, yaw);
}

export function glazing(face, y, bays, color = '#45646a', h = 1.02) {
  const w = face.width - .65;
  face.panel(0, y, w, h, color);
  for (let i = 1; i < bays; i++) face.panel(w * (i / bays - .5), y, .061, h, '#b7c2bd', .035);
}

export function buildingNameplate(block) {
  const canvas = signCanvas(820, 196, (ctx, w, h) => {
    ctx.fillStyle = '#314a41';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f0e8c9';
    ctx.font = '700 94px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.fillText(block.name, w / 2, 101);
    ctx.font = '500 35px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.fillStyle = '#d5dbbd';
    ctx.fillText(block.use, w / 2, 153);
  });
  const w = Math.max(3.3, 1.12 * block.name.length);
  plate(canvas, [block.x, 2.87, block.z + block.depth / 2 + .22], w, .90);
  if (block.x > 37) plate(canvas, [block.x + block.w / 2 + .176, 3.36, block.z], w, .90, Math.PI / 2);
}

export function trackBanner(gate, mesh, decals, total) {
  const terminal = gate.index === 0 || gate.index === total - 1;
  const tone = gate.color ?? (terminal ? '#e9eabb' : '#d3e894');
  const left = gate.minCross ?? -gate.half, right = gate.maxCross ?? gate.half;
  const scaleWidth = ((right - left) / 2 + .08) / 4.13;
  const p = (o, y) => offsetVertex(gate, (left + right) / 2 + o * scaleWidth, y + (gate.rise ?? 0) + (y >= 3.45 ? 1.38 : 0));
  const yaw = -Math.atan2(gate.f[0], -gate.f[2]);
  const lateralYaw = Math.atan2(-gate.f[0], -gate.f[2]);
  mesh.tube(p(-4.15, 3.71), p(4.15, 3.71), .082, .082, '#314a3f', 8);
  mesh.tube(p(-4.15, 4.14), p(4.15, 4.14), .079, .079, '#3a5646', 8);
  for (const side of [-1, 1]) {
    mesh.tube(p(side * 4.13, .008), p(side * 4.13, 4.32), .109, .091, '#375747', 9);
    mesh.tube(p(side * 4.13, 3.50), p(side * 4.13, 4.34), .118, .118, tone, 9);
    mesh.box(p(side * 4.13, .078), [.58, .156, .49], '#626553', yaw);
    mesh.box(p(side * 4.13, 1.26), [.27, .54, .23], '#cfddac', yaw);
  }
  const color = gate.color ?? (terminal ? '#e9eabb' : '#cddd97');
  const backdrop = signCanvas(1220, 142, (ctx, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2f4936';
    ctx.fillRect(0, 0, 199, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f4efd3';
    ctx.font = '700 76px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.fillText(gate.number, 99, 99);
    ctx.fillStyle = '#283c2c';
    ctx.font = '700 75px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.fillText(gate.name, w * .61, 99);
  });
  const front = add(p(0, 3.93), scale(gate.f, -.096));
  plate(backdrop, front, 7.94 * scaleWidth, .53, lateralYaw, decals);
  const rear = add(p(0, 3.93), scale(gate.f, .096));
  plate(backdrop, rear, 7.94 * scaleWidth, .53, lateralYaw + Math.PI, decals);
  for (let i = 0; i < 13; i++) {
    const col = terminal ? (i % 2 ? '#f2e7c6' : '#34443d') : (i % 2 ? '#dae6b0' : '#ccd99e');
    const x = -3.4 + i * .525;
    const q = (o, depth) => add(p(o, ROAD_Y + .018), scale(gate.f, depth));
    mesh.quad(q(x - .20, -.30), q(x + .20, -.30), q(x + .20, .30), q(x - .20, .30), col);
  }
}

export function timingSpan(frame, cityAccess, fallback, minimum = 0, campus = 'szu') {
  const provider = getCampusProvider(campus);
  if (provider?.timingSpan) return provider.timingSpan(frame, cityAccess, fallback, minimum);
  return { half: Math.max(minimum, fallback + .34) };
}

export function makeCourse(id, name, description, path, spec, finish, options = {}) {
  const campus = options.campus ?? 'szu';
  const szuProvider = getCampusProvider('szu');
  const labels = spec.map(([at, gateName, half], i) => {
    const distance = options.absolute ? at : at * finish;
    const frame = courseFrame(path, distance);
    const rise = options.flyover ? (szuProvider?.deckRiseAt?.(frame.p) ?? 0) : 0;
    const span = rise > .4
      ? { half: (szuProvider?.flyoverHalf ?? 0) - .12 }
      : half
        ? { half }
        : timingSpan(frame, options.cityAccess, path.width, 2.75, campus);
    return { ...frame, ...span, rise, distance, name: gateName, index: i, number: i === 0 ? '起点' : i === spec.length - 1 ? '终点' : String(i).padStart(2, '0') };
  });
  const extent = path.rows.reduce((b, r) => {
    if (r.distance > finish) return b;
    return {
      minX: Math.min(b.minX, r.p[0]), maxX: Math.max(b.maxX, r.p[0]),
      minZ: Math.min(b.minZ, r.p[2]), maxZ: Math.max(b.maxZ, r.p[2])
    };
  }, { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
  const first = labels[0];
  return {
    id, name, description, path, length: finish, gates: labels, extent, markerStep: 6.2, oldKey: options.oldKey ?? null,
    markers: Array.from({ length: Math.floor(finish / 6.2) + 1 }, (_, i) => {
      const distance = i * 6.2, p = along(path, distance);
      return { distance, p, rise: options.flyover ? (szuProvider?.deckRiseAt?.(p) ?? 0) : 0 };
    }),
    campus, flyover: options.flyover ?? false, revision: options.revision ?? 5,
    plan: coursePlan(path, finish), heading: Math.atan2(first.f[2], first.f[0]), spawn: add(first.p, scale(first.f, -5.2)),
    thresholds: options.thresholds ?? [.93, 1.04, 1.22], cityAccess: options.cityAccess ?? false
  };
}

export function nearestPathSpot(paths, x, z, elevFn) {
  let bestPath = paths[0], bestRow = paths[0].rows[0], bestD2 = Infinity;
  for (const path of paths) {
    const rows = path.rows;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i], dx = r.p[0] - x, dz = r.p[2] - z, d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { bestD2 = d2; bestPath = path; bestRow = r; }
    }
  }
  const f = courseFrame(bestPath, bestRow.distance);
  const [rx, , rz] = f.p;
  return { p: [rx, elevFn(rx, rz) + ROAD_Y, rz], heading: Math.atan2(f.f[2], f.f[0]) };
}

export function inOutline(x, z, outline) {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [ax, az] = outline[i], [bx, bz] = outline[j];
    if ((az > z) !== (bz > z) && x < ax + (bx - ax) * (z - az) / (bz - az)) inside = !inside;
  }
  return inside;
}

export function londonPaving(mesh, outline, y, color) {
  const points = outline.map(([x, z]) => [x, y, z]);
  for (let i = 1; i < points.length - 1; i++) mesh.triangle(points[0], points[i], points[i + 1], color, [0, 1, 0]);
}

export function placeTravelSign(x, z, title, subtitle, yaw = 0) {
  const image = namedSign(title, subtitle, '#243945', '#f2e8d1');
  scenery.box([x, 1.03, z], [.085, 2.06, .085], '#444b47');
  scenery.box([x, 1.88, z], [2.75, .58, .13], '#243945', yaw);
  const dx = .069 * Math.sin(yaw), dz = .069 * Math.cos(yaw);
  plate(image, [x + dx, 1.88, z + dz], 2.70, .53, yaw);
  plate(image, [x - dx, 1.88, z - dz], 2.70, .53, yaw + Math.PI);
}

export function namedCourse(id, name, description, path, start, stations, finish, thresholds) {
  const gates = [[0, start], ...stations.map(([xy, label]) => [pointDistance(path, xy), label]), [path.length, finish]];
  return makeCourse(id, name, description, path, gates, path.length, { absolute: true, thresholds });
}
