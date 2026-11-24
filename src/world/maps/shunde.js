import { signCanvas } from '../../core/canvas.js';
import {
  ROAD_Y, TAU, WATER_Y, clamp, cross, lerpPoint, mix, normalize, random, scale, subtract,
} from '../../core/math.js';
import { Shape } from '../../core/shape.js';
import { worldState } from '../../core/state.js';
import { treeBlocks } from '../collision-index.js';
import {
  bench, campusFixtures, cityVehicles, closeToBlock, courseFrame, deciduous, foliage,
  masonry, nearestPathSpot, offsetVertex, palm, pavement, placeTravelSign, plate, road,
  scenery, signs, street, streetCell, streetGapSquared, terrain, water,
} from '../geometry.js';
import { registerCampus } from '../registry.js';

import { createShundeCourses, parkStops } from './shunde/courses.js';
import {
  mountainDown, mountainIndex, mountainRoadByPath, mountainRoads, mountainUp, parkBounds,
  parkHills, parkNodes, parkPath, parkPavilion, parkSegments, parkSpline, parkTower,
  pavilionDeckY, pavilionRim, pavilionWalk, pavilionWalkIndex, shundeCampusInfo, shundeHighRiskShortcuts,
} from './shunde/layout.js';

export {
  mountainDown, mountainIndex, mountainRoadByPath, mountainRoads, mountainUp, parkBounds,
  parkHills, parkNodes, parkPath, parkPavilion, parkSegments, parkSpline, parkTower,
  pavilionDeckY, pavilionRim, pavilionWalk, pavilionWalkIndex, shundeCampusInfo, shundeHighRiskShortcuts, parkStops,
};

export function bridgeAxis(x, z) { return (x - 153) * .6 - (z - 186) * .8; }
export function onBridgeAxis(x, z) { return Math.abs((x - 153) * .8 + (z - 186) * .6) < 8; }
export function parkBridgeHeight(x, z) {
  if (!onBridgeAxis(x, z)) return 0;
  const a = Math.abs(bridgeAxis(x, z));
  if (a >= 42) return 0;
  return .86 * (1 + Math.cos(Math.PI * a / 42));
}
export function pavilionWalkY(distance) {
  const t = clamp((distance - 5.5) / 32, 0, 1);
  return mix(ROAD_Y, pavilionDeckY, t * t * (3 - 2 * t));
}
export function parkPavilionDeck(x, z) {
  if (x < parkPavilion[0] - 6.3 || x > parkNodes[30][0] + pavilionWalk.width ||
      z < parkNodes[30][1] - pavilionWalk.width || z > parkPavilion[1] + 6.3) return null;
  if (Math.abs(x - parkPavilion[0]) <= 6.3 && Math.abs(z - parkPavilion[1]) <= 6.3 && pointInPoly2D(x, z, pavilionRim)) return pavilionDeckY;
  let distance = null, best = pavilionWalk.width ** 2;
  for (const { x: ax, z: az, dx, dz, ratio, row } of pavilionWalkIndex.get(streetCell(x, z)) ?? []) {
    const tx = x - ax, tz = z - az, t = clamp((tx * dx + tz * dz) * ratio, 0, 1);
    const gap = (tx - dx * t) ** 2 + (tz - dz * t) ** 2;
    if (gap > best) continue;
    best = gap;
    distance = mix(pavilionWalk.rows[row - 1].distance, pavilionWalk.rows[row].distance, t);
  }
  return distance === null ? null : pavilionWalkY(distance);
}
export function parkHeight(x, z) {
  const deck = parkPavilionDeck(x, z);
  return deck === null ? parkBridgeHeight(x, z) + mountainHeight(x, z) : deck - ROAD_Y;
}
export function parkWidth(x, z) {
  if (onBridgeAxis(x, z)) return 3.35 + .8 * clamp((Math.abs(bridgeAxis(x, z)) - 36) / 13, 0, 1);
  return 4.15 - 1.13 * Math.max(0, 1 - Math.abs(z - 166) / 44) * clamp((-x - 80) / 45, 0, 1);
}
export function parkPaved(x, z, margin = 0) {
  if (Math.abs(x) <= 21 - margin && Math.abs(z) <= 26 - margin) return true;
  const width = parkWidth(x, z) - margin;
  return parkSegments.get(streetCell(x, z))?.some(seg => streetGapSquared(seg, x, z) <= width * width) ?? false;
}
export function parkFixture(x, z, margin, y) {
  const obs = worldState.ridingObstacles;
  const candidates = obs?.region === 'shunde' ? obs.buildings.get(streetCell(x, z)) : null;
  return candidates?.find(({ part }) => y < part.height && closeToBlock(x, z, part, margin))?.lot;
}
export function pointInPoly2D(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) inside = !inside;
  }
  return inside;
}
export function parkBridgeSide(x, z) { return (x - 153) * .8 + (z - 186) * .6; }
export function parkBridgeRailBlocked(x, z) {
  const along = Math.abs(bridgeAxis(x, z)), side = Math.abs(parkBridgeSide(x, z));
  return along < 36.5 && side >= 3.01 && side <= 4.35 && !parkPaved(x, z, .34);
}
export function parkInWater(x, z) {
  const along = bridgeAxis(x, z), side = parkBridgeSide(x, z);
  if (Math.abs(along) < 40 && Math.abs(side) < 3.05) return false;
  if (parkPaved(x, z, .05)) return false;
  if (parkPavilionDeck(x, z) !== null) return false;
  if (x >= parkWaterBounds.minX && x <= parkWaterBounds.maxX && z >= parkWaterBounds.minZ && z <= parkWaterBounds.maxZ && pointInPoly2D(x, z, parkWaterPoly)) return true;
  if (Math.abs(along) < 39 && side > 3.1) {
    const crossing = clamp((39 - Math.abs(along)) / 9, 0, 1);
    const outerWater = 3.5 + crossing * (44 + 28 * Math.cos(along * .052) + 8 * Math.sin(along * .094));
    if (side < outerWater) return true;
  }
  return false;
}
export function parkMountainDropOff(x, z, prevY = null) {
  const h = parkHeight(x, z), elev = prevY !== null ? Math.max(prevY, h) : h;
  if (elev <= 2.4) return false;
  if (parkPaved(x, z, -.5)) return false;
  if (parkPavilionDeck(x, z) !== null) return false;
  const near = mountainRoadAt(x, z);
  if (near && near.gap <= near.lane.path.width + 4.2) return false;
  const sc = shundeShortcutSample(x, z);
  if (sc && sc.gap <= sc.cut.width * .5 + 3.5) return false;
  return true;
}
export function parkNearestRoad(x, z) {
  return nearestPathSpot([parkPath, mountainUp, mountainDown], x, z, parkHeight);
}
export function parkSurfaceKind(x, z) {
  if (parkPaved(x, z) || parkPavilionDeck(x, z) !== null) return 'paved';
  const branch = mountainRoadAt(x, z);
  if (branch && branch.gap <= branch.lane.path.width) return mountainIsGravel(branch.lane, branch.distance) ? 'gravel' : 'paved';
  const sc = shundeShortcutAt(x, z);
  if (sc) return sc.firm ? 'paved' : 'gravel';
  return 'grass';
}
export function parkRideable(x, z, skipHazard = false) {
  if (x < -185 || x > 505 || z < -76 || z > 332) return false;
  if (parkBridgeRailBlocked(x, z)) return false;
  if (!skipHazard && parkInWater(x, z)) return false;
  if (!skipHazard && parkMountainDropOff(x, z)) return false;
  if (parkFixture(x, z, .28, parkHeight(x, z))) return false;
  if (treeBlocks(x, z, .28)) return false;
  if (parkPaved(x, z, .1)) return true;
  const branch = mountainRoadAt(x, z, true);
  if (branch && branch.gap <= branch.lane.path.width) return true;
  if (shundeShortcutAt(x, z)) return true;
  if (((x - parkTower[0]) / 21) ** 2 + ((z - parkTower[1]) / 19) ** 2 < 1) return false;
  for (const [hx, hz, rx, rz] of parkHills) {
    if (((x - hx) / (rx * .88)) ** 2 + ((z - hz) / (rz * .88)) ** 2 < 1) return false;
  }
  return true;
}
export function parkFirmSurface(x, z) {
  return parkSurfaceKind(x, z) === 'paved';
}

registerCampus('shunde', {
  parkPath,
  timingSpan: (frame) => ({ half: parkWidth(frame.p[0], frame.p[2]) - .24 }),
  safeToRide: (x, z, _exploring, skipHazard) => parkRideable(x, z, skipHazard),
  surfaceAt: (x, z) => parkFirmSurface(x, z),
  surfaceKindAt: (x, z) => parkSurfaceKind(x, z),
  buildingAt: (x, z, margin, y) => parkFixture(x, z, margin, y),
  rideElevation: (x, z) => parkHeight(x, z),
  riderGrade: (position, heading) => {
    const [x, , z] = position, dx = .5 * Math.cos(heading), dz = .5 * Math.sin(heading);
    return parkHeight(x + dx, z + dz) - parkHeight(x - dx, z - dz);
  },
  waterHazardAt: (x, z) => parkInWater(x, z),
  nearestSafeRoad: (x, z) => parkNearestRoad(x, z),
  cliffHazardAt: (x, z, y) => parkMountainDropOff(x, z, y),
  raiseMesh: (shape) => {
    const v = shape.vertices;
    for (let i = 0; i < v.length; i += 11) v[i + 1] += parkHeight(v[i], v[i + 2]);
  },
  getReflectionBounds: () => parkReflectionBounds,
});

export function parkGateModel() {
  const stone = '#bda990', trim = '#e4cda3', roof = '#97522f';
  for (const z of [-19, -7, 7, 19]) for (const x of [-1.8, 1.8]) {
    const h = Math.abs(z) === 7 ? 14.3 : 10.7;
    masonry.box([x, .22, z], [1.75, .44, 1.75], stone);
    masonry.box([x, .62, z], [1.44, .36, 1.44], trim);
    masonry.tube([x, .8, z], [x, h, z], .66, .57, trim, 8);
    campusFixtures.push({ name: '牌坊石柱', x, z, w: 1.75, depth: 1.75, height: h, c: 1, s: 0 });
  }
  for (const [z, w, h] of [[-13, 12, 9.2], [0, 14, 13.2], [13, 12, 9.2]]) {
    for (const x of [-1.8, 1.8]) {
      masonry.box([x, h - .35, z], [.98, 1.45, w], stone);
      masonry.box([x, h - 1.24, z], [1.22, .28, w + .45], trim);
      for (let i = -2; i <= 2; i++) {
        const u = z + i * w / 5.4;
        masonry.box([x, h + .5, u], [1.88, .32, .48], trim);
        masonry.box([x, h + .22, u], [1.51, .34, .35], stone);
        if (i === 0) continue;
        masonry.tube([x, h - 2.32, u], [x, h - 1.26, u], .15, .26, trim, 8);
        masonry.tube([x, h - 2.08, u], [x, h - 1.94, u], .24, .24, stone, 8);
      }
      for (const end of [-1, 1]) {
        const edge = z + end * (w / 2 - .54);
        masonry.tube([x, h - 2.8, edge], [x, h - 1.18, edge - end * 1.58], .20, .30, stone, 8);
      }
    }
    for (const side of [-1, 1]) {
      for (let i = 0; i < 8; i++) {
        const tile = (j, eave) => {
          const t = j / 4 - 1;
          return [side * (eave ? 3.2 : .22), h + (eave ? .53 : 2.35) + Math.abs(t) ** 4 * .75, z + t * (w / 2 + (eave ? 1.55 : .50))];
        };
        masonry.quad(tile(i, true), tile(i + 1, true), tile(i + 1, false), tile(i, false), i % 2 ? roof : '#a05e39');
      }
    }
    masonry.box([0, h + 2.61, z], [.46, .39, w + 1.9], trim);
  }
  const inscription = signCanvas(512, 90, (ctx, w, h) => {
    ctx.fillStyle = '#994c34'; ctx.fillRect(0, 0, w, h); ctx.textAlign = 'center'; ctx.fillStyle = '#f0cf77';
    ctx.font = 'bold 62px serif'; ctx.fillText('顺 峰 山 公 园', w / 2, 68);
  });
  for (const side of [-1, 1]) plate(inscription, [side * 2.32, 12.8, 0], 6, 1.08, side * Math.PI / 2);
}

export function parkPagoda(x, z, base, floors, scaleFactor = 1) {
  let y = base;
  for (let i = 0; i < floors; i++) {
    const r = (3.25 - .27 * i) * scaleFactor, h = (3.2 - .19 * i) * scaleFactor;
    masonry.tube([x, y, z], [x, y + h, z], r, r * .94, '#cfa67c', 8);
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, dx = Math.cos(a) * .91 * r, dz = Math.sin(a) * .91 * r;
      masonry.box([x + dx, y + h * .51, z + dz], [.19, h * .46, r * .30], '#594d44', -a);
    }
    masonry.tube([x, y + h - .15, z], [x, y + h + .59 * scaleFactor, z], r * 1.25, r * .87, '#715748', 8);
    y += h + .45 * scaleFactor;
  }
  masonry.tube([x, y, z], [x, y + 2.5 * scaleFactor, z], .54 * scaleFactor, .05, '#56473d', 8);
}

export function bridgePoint(t, side, y) { return [153 + t * .6 + side * .8, y, 186 - t * .8 + side * .6]; }

export function parkBridge() {
  for (const side of [-1, 1]) {
    const v = (t, y) => bridgePoint(t, side * 3.35, y);
    for (let span = 0; span < 9; span++) {
      const start = -27 + span * 6;
      for (let i = 0; i < 10; i++) {
        const sec = j => {
          const t = start + j * .6, [x, , z] = v(t, 0), top = parkHeight(x, z) + .035;
          return [v(t, -.40 + Math.sin(j * Math.PI / 10) * (top + .18)), v(t, top)];
        };
        const [a, b] = sec(i), [c, d] = sec(i + 1);
        masonry.quad(a, c, d, b, '#afaa96', [.8 * side, 0, .6 * side]);
      }
    }
    for (let t = -36; t <= 36; t += 3) {
      const [x, , z] = v(t, 0), y = parkHeight(x, z);
      masonry.box([x, y + .52, z], [.32, 1.08, .32], '#d2ceba');
      if (t === 36) break;
      const next = v(t + 3, 0), h = parkHeight(next[0], next[2]);
      for (const level of [.36, .85]) masonry.tube(v(t, y + level), v(t + 3, h + level), .10, .10, '#d5d0bf', 6);
    }
  }
}

export function lakePavilion(x, z) {
  const rimPoint = ([px, pz], y) => [px, y, pz];
  for (let i = 0; i < pavilionRim.length; i++) {
    const a = pavilionRim[i], b = pavilionRim[(i + 1) % pavilionRim.length];
    masonry.triangle([x, pavilionDeckY, z], rimPoint(b, pavilionDeckY), rimPoint(a, pavilionDeckY), '#d4caba');
    masonry.quad(rimPoint(a, 1.3), rimPoint(b, 1.3), rimPoint(b, pavilionDeckY), rimPoint(a, pavilionDeckY), '#ac9a7e');
  }
  masonry.tube([x, -.28, z], [x, 1.3, z], 4.8, 5.4, '#a9967b', 8);
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4, dx = 4.4 * Math.cos(a), dz = 4.4 * Math.sin(a);
    const px = x + dx, pz = z + dz;
    masonry.tube([px, pavilionDeckY, pz], [px, 5.9, pz], .24, .23, '#964d3b', 8);
    campusFixtures.push({ name: '湖心亭柱', x: px, z: pz, w: .48, depth: .48, height: 5.9, c: 1, s: 0 });
  }
  for (const [y, r] of [[5.8, 6.5], [7.65, 4.35]]) {
    masonry.tube([x, y, z], [x, y + .22, z], r, r, '#bf9856', 8);
    masonry.tube([x, y + .22, z], [x, y + 2.12, z], r, 1.55, '#566e5e', 8);
  }
}

export function buildPavilionWalk() {
  const w = pavilionWalk.width, step = 1.25;
  const shoreEnd = pavilionWalk.length - 4.95;
  let previous = courseFrame(pavilionWalk, 0);
  for (let i = 1; i <= Math.ceil(shoreEnd / step); i++) {
    const distance = Math.min(i * step, shoreEnd), f = courseFrame(pavilionWalk, distance);
    const a = pavilionWalkY(Math.min((i - 1) * step, shoreEnd)) + .004, b = pavilionWalkY(distance) + .004;
    const span = (inner, outer, color) => pavement.quad(offsetVertex(previous, inner, a), offsetVertex(f, inner, b),
      offsetVertex(f, outer, b), offsetVertex(previous, outer, a), color);
    span(-w + .10, w - .10, i % 2 ? '#a3825e' : '#9b7955');
    span(-w, -w + .10, '#d3ba8c');
    span(w - .10, w, '#d3ba8c');
    if (i % 4 === 0 && distance > 6) {
      for (const side of [-.92, .92]) {
        const [x, , z] = offsetVertex(f, side, b);
        masonry.box([x, (b - .3) / 2, z], [.19, b + .3, .19], '#705d4a');
      }
    }
    previous = f;
  }
}

export const parkFrames = Array.from({ length: Math.ceil(parkPath.length / 1.8) + 1 }, (_, i) =>
  courseFrame(parkPath, Math.min(parkPath.length, i * 1.8)));

export function parkEdges(frame) {
  const [x, , z] = frame.p, w = parkWidth(x, z), y = parkBridgeHeight(x, z);
  const alongBridge = bridgeAxis(x, z);
  const crossing = onBridgeAxis(x, z) ? clamp((39 - Math.abs(alongBridge)) / 9, 0, 1) : 0;
  const outerWater = 3.5 + crossing * (44 + 28 * Math.cos(alongBridge * .052) + 8 * Math.sin(alongBridge * .094));
  const inner = w + 2.3 + Math.max(0, 1 - Math.hypot(x, z) / 78) * 26;
  return {
    left: offsetVertex(frame, -w, y + ROAD_Y), right: offsetVertex(frame, w, y + ROAD_Y),
    bank: offsetVertex(frame, -inner, WATER_Y), crossing, outerWater,
  };
}
export const parkEdgesList = parkFrames.map(parkEdges);
export const parkWaterPoly = parkEdgesList.filter((_, i) => i % 2 === 0).map(e => [e.bank[0], e.bank[2]]);
export const parkWaterBounds = (() => {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of parkWaterPoly) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z; }
  return { minX, maxX, minZ, maxZ };
})();
export const parkReflectionBounds = (() => {
  const cells = new Map(), step = 28, center = [-7, WATER_Y, 168];
  const mark = (x, z) => {
    const key = Math.floor(x / step) * 4096 + Math.floor(z / step);
    let b = cells.get(key);
    if (!b) cells.set(key, b = { minX: x, maxX: x, minZ: z, maxZ: z });
    else { b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x); b.minZ = Math.min(b.minZ, z); b.maxZ = Math.max(b.maxZ, z); }
  };
  for (let i = 1; i < parkFrames.length; i++) {
    const a = parkEdgesList[i - 1], b = parkEdgesList[i];
    for (const t of [.18, .42, .66, .86, .99]) {
      const pa = lerpPoint(center, a.bank, t), pb = lerpPoint(center, b.bank, t);
      mark(pa[0], pa[2]); mark(pb[0], pb[2]);
    }
    if (a.crossing > 0 || b.crossing > 0) {
      for (const t of [.05, .35, .65, .95]) {
        const ea = lerpPoint(a.bank, offsetVertex(parkFrames[i - 1], a.outerWater, WATER_Y), t);
        const eb = lerpPoint(b.bank, offsetVertex(parkFrames[i], b.outerWater, WATER_Y), t);
        mark(ea[0], ea[2]); mark(eb[0], eb[2]);
      }
    }
  }
  return Array.from(cells.values(), ({ minX, maxX, minZ, maxZ }) => ({
    x: (minX + maxX) / 2, z: (minZ + maxZ) / 2,
    low: [minX - .5, WATER_Y, minZ - .5], high: [maxX + .5, WATER_Y, maxZ + .5],
  }));
})();

export function buildParkWorld() {
  terrain.quad([-850, -.18, -620], [850, -.18, -620], [850, -.18, 900], [-850, -.18, 900], '#96aa73');
  const center = [-7, WATER_Y, 168];
  for (let i = 1; i < parkFrames.length; i++) {
    const a = parkEdgesList[i - 1], b = parkEdgesList[i];
    road.quad(a.left, b.left, b.right, a.right, '#a99a85');
    const rim = (p) => [p[0], -.003, p[2]];
    if (a.crossing < .99 || b.crossing < .99) pavement.quad(rim(a.left), rim(b.left), b.bank, a.bank, '#849b6e');
    water.triangle(center, a.bank, b.bank, '#6caa99');
    if (a.crossing > 0 || b.crossing > 0) {
      const extent = (f, e) => offsetVertex(f, e.outerWater, WATER_Y);
      water.quad(a.bank, b.bank, extent(parkFrames[i], b), extent(parkFrames[i - 1], a), '#6caa99');
    }
  }
  pavement.quad([-21, .027, -26], [21, .027, -26], [21, .027, 26], [-21, .027, 26], '#c8bcaa');
  parkGateModel(); parkBridge();
  const [tx, tz] = parkTower;
  scenery.ellipsoid([tx, -1, tz], [26, 14, 23], '#678553', 18, 8);
  parkPagoda(tx, tz, 12.9, 7);
  buildPavilionWalk();
  lakePavilion(...parkPavilion);
  for (const [x, z, rx, rz, h] of parkHills) {
    scenery.ellipsoid([x, -3, z], [rx, h, rz], '#738e63', 12, 6);
    const toParkX = 120 - x, toParkZ = 120 - z, toParkLen = Math.hypot(toParkX, toParkZ) || 1;
    for (let k = 0; k < 54; k++) {
      const angle = random() * TAU, r = Math.sqrt(random()) * .98, w = 4 + random() * 3, hh = 3 + random() * 2;
      const ca = Math.cos(angle), sa = Math.sin(angle);
      if (r > .28 && (ca * toParkX + sa * toParkZ) / toParkLen < -.18) continue;
      const cx = x + ca * r * rx, cz = z + sa * r * rz, cy = -3 + h * Math.sqrt(1 - r * r);
      foliage.ellipsoid([cx, cy, cz], [w, hh, 5.4], k % 2 ? '#65855c' : '#779263', 6, 3);
    }
  }
  for (let i = 0; i < 36; i++) {
    const x = -280 + i * 14 + random() * 7, z = -93 - random() * 58, h = 9 + random() * 23;
    const w = 6 + random() * 7;
    scenery.box([x, h / 2, z], [w, h, 9], i % 3 ? '#b7bab0' : '#aca998');
    for (let y = 3; y < h - 1; y += 4) scenery.box([x, y, z + 4.54], [w * .83, .76, .16], '#858f89');
  }
  for (let i = 0; i < 165; i++) {
    const a = TAU * i / 165, r = 1 + random() * .18;
    const x = 5 + Math.cos(a) * 218 * r, z = 148 + Math.sin(a) * 211 * r;
    const s = 3 + random() * 3;
    const branch = mountainRoadAt(x, z);
    if (!branch || branch.gap > branch.lane.path.width + 7)
      foliage.ellipsoid([x, s * .65, z], [s * 1.4, s, s * 1.18], i % 3 ? '#698658' : '#819668', 6, 3);
  }
  const garden = parkNodes[4];
  for (let i = 0; i < 4; i++) {
    const x = garden[0] - 10 - i * 3.5, z = garden[1] - 10 + i * 3.2;
    masonry.box([x, 1.35, z], [4, 2.7, 4], '#e0d5b9');
    masonry.tube([x, 2.7, z], [x, 4.4, z], 3.65, 1.2, '#637067', 4);
  }
  placeTravelSign(12, 5, '牌坊广场', '站点旅行', Math.PI / 2);
  for (const [index, caption] of [[4, '桂海芳丛'], [20, '伏波桥'], [29, '青云塔山脚']]) {
    const f = courseFrame(parkPath, parkPath.rows[index * 24].distance - 14);
    const [x, , z] = offsetVertex(f, 5.4, 0);
    if (parkHeight(x, z) === 0) placeTravelSign(x, z, caption, '青云湖环线', Math.atan2(-f.f[0], -f.f[2]));
  }
  for (const [x, z, s] of [[151, 94, 2.2], [137.5, 88.5, 2.35], [136, 87.8, 2.5], [129, 82.6, 2.0]]) {
    deciduous(x, z, s, 0, true);
  }
  for (let d = 24; d < parkPath.length - 22; d += 7.8) {
    const f = courseFrame(parkPath, d), [x, , z] = f.p;
    if (Math.hypot(x, z) < 33 || onBridgeAxis(x, z) && Math.abs(bridgeAxis(x, z)) < 47) continue;
    const shaded = x < -88 || x > 35 && z < 104, gap = shaded ? 1 : 3;
    if (Math.round(d / 7.8) % gap === 0) {
      const p = offsetVertex(f, parkWidth(x, z) + 2.6 + random() * 2, 0);
      if (Math.hypot(p[0] - tx, p[2] - tz) > 20 && !mountainRoadAt(p[0], p[2]) && !shundeShortcutAt(p[0], p[2], -2)) {
        if (shaded) deciduous(p[0], p[2], 1.05 + random() * .35, 0, true);
        else palm(p[0], p[2], 1.03, true);
      }
    }
    if (Math.round(d / 7.8) % 6 === 0) {
      const p = offsetVertex(f, parkWidth(x, z) + 1.6, 0);
      if (!shundeShortcutAt(p[0], p[2], -2)) bench(p[0], p[2], -Math.atan2(f.f[2], f.f[0]));
    }
    if (shaded && Math.round(d / 7.8) % 2 === 0) {
      const p = offsetVertex(f, -parkWidth(x, z) - 1.24, 0);
      if (!shundeShortcutAt(p[0], p[2], -2)) deciduous(p[0], p[2], .89, 2, true);
    }
  }
  buildMountainWorld();
  buildParkTraffic();
}

export function parkShuttleModel(paint) {
  const m = new Shape(), l = 3.75, w = 1.42;
  m.box([0, .42, 0], [l, .34, w], paint);
  m.box([.25, .84, 0], [l * .68, .46, w * .84], '#e6dec6');
  m.box([1.48, .76, 0], [.52, .36, w * .92], '#4e6d74');
  m.box([-.05, 1.80, 0], [l * .84, .09, w * .94], '#f2ede0');
  for (const x of [-1.25, 1.25]) for (const z of [-.58, .58]) m.box([x, 1.18, z], [.08, 1.22, .08], '#3c4743');
  for (const x of [-1.18, 1.18]) for (const side of [-1, 1]) m.tube([x, .26, side * .60], [x, .26, side * .74], .24, .24, '#303837', 8);
  for (const x of [-l * .505, l * .505]) for (const side of [-1, 1]) m.box([x, .44, side * w * .32], [.06, .10, .20], x < 0 ? '#cf6552' : '#ede8bd');
  return m;
}

export function buildParkTraffic() {
  const models = ['#5c9a79', '#d8ad4d', '#5e8fb2'].map(parkShuttleModel);
  for (let i = 0; i < 6; i++) {
    const dir = i % 2 ? 1 : -1;
    cityVehicles.push({
      path: parkPath, model: models[i % models.length], direction: dir,
      offset: dir * 1.55, start: (i + .25) / 6 * parkPath.length, speed: 6.4 + (i % 3) * .85, halfL: 1.92, halfW: .76,
    });
  }
}

export function mountainRoadAt(x, z, fitWidth = false) {
  let best = null, bestScore = Infinity;
  for (const segment of mountainIndex.get(streetCell(x, z)) ?? []) {
    const dx = x - segment.x, dz = z - segment.z;
    const t = clamp((dx * segment.dx + dz * segment.dz) * segment.ratio, 0, 1);
    const gap = (dx - segment.dx * t) ** 2 + (dz - segment.dz * t) ** 2;
    const score = fitWidth ? Math.sqrt(gap) - segment.path.width : gap;
    if (score >= bestScore) continue;
    bestScore = score; best = { segment, t, gap };
  }
  if (!best) return null;
  const { segment: { path, row }, t, gap } = best;
  return {
    lane: mountainRoadByPath.get(path), distance: mix(path.rows[row - 1].distance, path.rows[row].distance, t),
    gap: Math.sqrt(gap),
  };
}

export function mountainProfile(lane, d) {
  const keys = lane.profile;
  for (let i = 1; i < keys.length; i++) {
    const [to, high] = keys[i];
    if (d > to) continue;
    const [from, low] = keys[i - 1], u = clamp((d - from) / (to - from), 0, 1);
    const blend = .18;
    const weight = u < blend ? u * u / (2 * blend)
      : u > 1 - blend ? 1 - blend - (1 - u) ** 2 / (2 * blend) : u - blend / 2;
    return mix(low, high, weight / (1 - blend));
  }
  return keys.at(-1)[1];
}
export const mountainIsGravel = (lane, d) => lane.gravel.some(([from, to]) => d >= from && d < to);
export function mountainBase(x, z) {
  const r = ((x - 353) / 196) ** 2 + ((z - 76) / 151) ** 2;
  return 31 * Math.max(0, 1 - r) ** 1.55 * clamp((x - 195) / 53, 0, 1);
}

for (const cut of shundeHighRiskShortcuts) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, total = 0;
  const segs = [];
  for (let i = 0; i < cut.points.length; i++) {
    const [px, pz] = cut.points[i];
    if (px < minX) minX = px; if (px > maxX) maxX = px; if (pz < minZ) minZ = pz; if (pz > maxZ) maxZ = pz;
    if (i > 0) {
      const [ax, az] = cut.points[i - 1], dx = px - ax, dz = pz - az, len2 = dx * dx + dz * dz, len = Math.sqrt(len2) || 1;
      segs.push({ ax, az, dx, dz, len, invLen2: len2 > 0 ? 1 / len2 : 0, acc: total });
      total += len;
    }
  }
  cut._segs = segs; cut._total = total || 1;
  cut._bounds = { minX: minX - 12, maxX: maxX + 12, minZ: minZ - 12, maxZ: maxZ + 12 };
}

export function shundeShortcutSample(x, z) {
  let bestCut = null, bestD2 = Infinity, bestU = 0;
  for (const cut of shundeHighRiskShortcuts) {
    const b = cut._bounds;
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
    for (const s of cut._segs) {
      const t = clamp(((x - s.ax) * s.dx + (z - s.az) * s.dz) * s.invLen2, 0, 1);
      const ox = x - (s.ax + s.dx * t), oz = z - (s.az + s.dz * t), d2 = ox * ox + oz * oz;
      if (d2 < bestD2) { bestD2 = d2; bestCut = cut; bestU = (s.acc + s.len * t) / cut._total; }
    }
  }
  return bestCut ? { cut: bestCut, gap: Math.sqrt(bestD2), u: bestU } : null;
}

export function shundeShortcutAt(x, z, margin = 0) {
  const hit = shundeShortcutSample(x, z);
  return hit && hit.gap <= hit.cut.width * .5 - margin ? hit.cut : null;
}

export function mountainHeight(x, z) {
  const base = mountainBase(x, z), near = mountainRoadAt(x, z);
  let roadH = base;
  if (near) {
    const { lane, distance, gap } = near, edge = lane.path.width;
    const w = clamp((gap - edge - 4.2) / 2.8, 0, 1);
    roadH = mix(mountainProfile(lane, distance), base, w * w * (3 - 2 * w));
  }
  const rw = near ? clamp((near.gap - near.lane.path.width - 4.2) / 2.2, 0, 1) : 1;
  if (rw > 0) {
    const sc = shundeShortcutSample(x, z);
    if (sc?.cut.profile && sc.gap <= sc.cut.width * .5 + 7.5) {
      const sh = mix(sc.cut.profile[0], sc.cut.profile[1], sc.u);
      const sw = clamp((sc.gap - sc.cut.width * .5 - 2.0) / 5.5, 0, 1);
      return mix(roadH, mix(sh, base, sw * sw * (3 - 2 * sw)), rw);
    }
  }
  return roadH;
}

export function mountainGrade(x, z, dx, dz) {
  return mountainHeight(x + dx * .5, z + dz * .5) - mountainHeight(x - dx * .5, z - dz * .5);
}

export const {
  makeMountainCourse, makeParkEnduranceCourse, mountainCourses, parkCourse, parkEnduranceCourse, shundeCourses,
} = createShundeCourses({ mountainHeight, parkHeight });

export function buildMountainWorld() {
  const step = 4, rows = [];
  for (let z = -92; z <= 232; z += step) {
    const row = [];
    for (let x = 30; x <= 542; x += step) row.push([x, mountainHeight(x, z) - .185, z]);
    rows.push(row);
  }
  for (let j = 1; j < rows.length; j++) for (let i = 1; i < rows[j].length; i++) {
    const a = rows[j - 1][i - 1], b = rows[j][i - 1], c = rows[j][i], d = rows[j - 1][i];
    if (Math.max(a[1], b[1], c[1], d[1]) <= -.18) continue;
    const n = normalize(cross(subtract(b, a), subtract(d, a)));
    scenery.quad(a, b, c, d, n[1] < .85 ? '#7e865c' : '#82965e', n);
  }

  const stone = '#c7bd9c', wood = '#7d6850';
  for (const lane of mountainRoads) {
    const { path } = lane, w = path.width;
    const edge = (d, s, y) => {
      const f = courseFrame(path, d), p = offsetVertex(f, s, y);
      p[1] += mountainHeight(p[0], p[2]);
      return p;
    };
    const crown = (d) => mountainIsGravel(lane, d) ? -.013 : ROAD_Y + .003;
    const stations = Array.from({ length: Math.ceil(path.length / 1.1) + 1 }, (_, i) => Math.min(i * 1.1, path.length));
    stations.push(...lane.gravel.flat());
    stations.sort((a, b) => a - b);
    for (let i = 1; i < stations.length; i++) {
      const a = stations[i - 1], b = stations[i], d = (a + b) / 2;
      if (b - a < .0001) continue;
      const gravel = mountainIsGravel(lane, d), y = crown(d), leftA = edge(a, -w, y), leftB = edge(b, -w, y);
      const rightA = edge(a, w, y), rightB = edge(b, w, y);
      const normal = normalize(cross(subtract(leftB, leftA), subtract(rightA, leftA)));
      const col = gravel ? (Math.floor(d / 3) % 3 === 0 ? '#ac956b' : '#a58b62') : lane.color;
      road.quad(leftA, leftB, rightB, rightA, col, normal[1] < 0 ? scale(normal, -1) : normal);
      if (gravel && (i & 1)) {
        for (const s of [-w + .32, w - .32]) scenery.box(edge(d, s, .013), [.12, .08, .20], (i >> 1) % 2 ? '#7f765d' : '#c7af80');
      }
    }
    const railZones = lane === mountainRoads[0] ? [[186, 239], [278, 345], [455, path.length - 11]] : [[19, 70], [113, 194], [273, 316]];
    for (const [from, to] of railZones) {
      for (let d = from; d <= to - 3.1; d += 3.1) for (const s of [-w, w]) {
        const low = edge(d, s, .025), high = edge(d, s, .73), next = edge(d + 3.1, s, .73);
        if (shundeShortcutAt(low[0], low[2], -1.45) || shundeShortcutAt(next[0], next[2], -1.45)) continue;
        scenery.box([low[0], (low[1] + high[1]) / 2, low[2]], [.15, .86, .15], wood);
        scenery.tube(high, next, .09, .09, wood, 5);
      }
    }
    for (let d = 25; d < path.length - 18; d += 7.3) {
      const f = courseFrame(path, d), side = (Math.round(d / 7.3) % 3) ? 1 : -1;
      const t = offsetVertex(f, side * (w + 4.5 + random() * 5), 0);
      plantMountainTree(t[0], t[2], 2.7 + random() * 3.3);
    }
  }
  for (let i = 0; i < 620; i++) {
    const x = 105 + random() * 435, z = -82 + random() * 288, s = 2.8 + random() * 4;
    if (mountainBase(x, z) > 1.0) plantMountainTree(x, z, s);
  }

  for (const [lane, d, label] of [[mountainRoads[0], 15, '神步山爬坡'], [mountainRoads[1], mountainDown.length - 13, '神步山下坡道'],
    [mountainRoads[0], mountainUp.length - 15, '神步山观景台'], [mountainRoads[1], 105, '碎石连弯 · 提前刹车']]) {
    const f = courseFrame(lane.path, d), [x, , z] = offsetVertex(f, lane.path.width + .85, 0);
    const start = scenery.vertices.length;
    const labels = signs.length;
    placeTravelSign(x, z, label, '顺峰山公园', Math.atan2(-f.f[0], -f.f[2]));
    const dy = mountainHeight(x, z);
    for (let i = start + 1; i < scenery.vertices.length; i += 11) scenery.vertices[i] += dy;
    for (const { shape } of signs.slice(labels)) for (let i = 1; i < shape.vertices.length; i += 11) shape.vertices[i] += dy;
  }
  const f = courseFrame(mountainUp, mountainUp.length - 7);
  const [x, , z] = offsetVertex(f, 9, 0), y = mountainHeight(x, z);
  masonry.tube([x, y - .7, z], [x, y + .1, z], 4.6, 4.6, stone, 8);
  for (const dx of [-2.2, 2.2]) for (const dz of [-2.2, 2.2]) {
    masonry.box([x + dx, y + 1.65, z + dz], [.28, 3.4, .28], '#995743');
  }
  masonry.tube([x, y + 3.3, z], [x, y + 4.9, z], 4.6, 1.3, '#455d54', 8);
  buildShundeShortcutVisuals();
}

export function buildShundeShortcutVisuals() {
  for (const cut of shundeHighRiskShortcuts) {
    const strip = street(cut.points, cut.width), half = cut.width * .5, step = 1.4;
    const sample = (d, s) => {
      const f = courseFrame(strip, d), p = offsetVertex(f, s, ROAD_Y + (cut.firm ? .005 : .003));
      p[1] += parkHeight(p[0], p[2]);
      return p;
    };
    const count = Math.max(4, Math.ceil(strip.length / step));
    for (let i = 1; i <= count; i++) {
      const a = (i - 1) * strip.length / count, b = i * strip.length / count;
      const la = sample(a, -half), lb = sample(b, -half), rb = sample(b, half), ra = sample(a, half);
      const normal = normalize(cross(subtract(lb, la), subtract(ra, la)));
      const col = cut.firm ? '#8f8978' : (i % 2 ? '#b49768' : '#a88a5d');
      road.quad(la, lb, rb, ra, col, normal[1] < 0 ? scale(normal, -1) : normal);
    }
    for (const [px, pz] of cut.posts) {
      const h = parkHeight(px, pz);
      campusFixtures.push({ name: cut.name + '护桩', x: px, z: pz, w: .60, depth: .60, height: h + 1.05, yaw: 0, c: 1, s: 0 });
      masonry.box([px, h + .46, pz], [.50, .92, .50], cut.firm ? '#b6a88d' : '#7d6850');
      masonry.box([px, h + .96, pz], [.56, .12, .56], '#d96b43');
    }
  }
}

export function plantMountainTree(x, z, height) {
  const near = mountainRoadAt(x, z);
  if (near && near.gap < near.lane.path.width + 2.8) return;
  if (x < 194 && parkPaved(x, z, -4)) return;
  if (shundeShortcutAt(x, z, -2.2)) return;
  const y = mountainHeight(x, z), roadside = near && near.gap < 15;
  foliage.ellipsoid([x, y + height * .73, z], [height * .52, height * .47, height * .51],
    height > 5 ? '#4f7245' : '#668248', roadside ? 7 : 6, roadside ? 4 : 3);
  if (roadside || !near || height >= 4.5) scenery.tube([x, y - .13, z], [x, y + height * .73, z], .15, .07, '#756750', 4, false);
}
