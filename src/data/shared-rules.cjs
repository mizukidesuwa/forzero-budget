// @ts-check
'use strict';

const ONLINE_CHASE_RULES = Object.freeze({
  rounds: 3,
  headStartMs: 6000,
  durationMs: 120_000,
  catchDistance: 8.5,
  catchHeight: 3.5,
  revealDistance: 55,
  terrorDistance: 85,
  pingIntervalMs: 4000,
  pingFadeMs: 4200,
  pointsPerCatch: 2,
  sweepBonus: 1,
  survivePoints: 3,
  halfSurviveMs: 60_000,
  halfSurvivePoints: 1,
});

const DISTRICT_CHASE_RULES = Object.freeze({
  format: 'district-chase',
  campus: 'ucl',
  courseId: 'square-circuit',
  players: 2,
  rounds: 2,
  headStartMs: 4000,
  durationMs: 85_000,
  clueMs: 3000,
  revealDistance: 28,
  catchDistance: 6,
  catchHeight: 2.5,
  sightHeight: 1.1,
  sightStep: .7,
  zoneRadius: 8,
  start: Object.freeze({ x: 120, z: 180, heading: -Math.PI / 2 }),
  roomSettings: Object.freeze({
    vehicleRule: 'bike', weather: 'day', windSpeed: 0, windDir: 0, windMode: 'steady',
    traffic: 'off', collision: false, tuningSeconds: 0, budget: 'open', blind: false,
  }),
  zones: Object.freeze([
    Object.freeze({ id: '1', kind: 'trigger', name: 'Gordon Square 西北角', x: 120, z: 79 }),
    Object.freeze({ id: '2', kind: 'trigger', name: 'Gordon Square 东北角', x: 213, z: 79 }),
    Object.freeze({ id: 'A', kind: 'exit', name: 'Gower Place 西口', x: 1, z: -81 }),
    Object.freeze({ id: 'B', kind: 'exit', name: 'Upper Woburn Place 东口', x: 335, z: -51 }),
  ]),
});

/** @param {number} x @param {number} z @param {'trigger' | 'exit'} kind */
function districtChaseZoneAt(x, z, kind) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return DISTRICT_CHASE_RULES.zones.find(zone => zone.kind === kind &&
    Math.hypot(zone.x - x, zone.z - z) <= DISTRICT_CHASE_RULES.zoneRadius) ?? null;
}

/** @param {string} format */
function isChaseFormat(format) {
  return format === 'chase' || format === DISTRICT_CHASE_RULES.format;
}

const ROUTE_RULES = Object.freeze({
  schemaVersion: 1,
  codePrefix: 'R',
  maxCodeLength: 1024,
  maxEdges: 64,
  maxWorkshopLength: 3000,
  maxEdgeIdLength: 48,
  maxLaps: 9,
  maxRouteIdLength: 64,
  maxSeedLength: 16,
  maxNetworkRevisionLength: 40,
});

const CAMPUS_NETWORKS = Object.freeze({
  szu: 'szu-network-v1',
  ucl: 'ucl-network-v1',
  shunde: 'shunde-network-v1',
});

const SKIN_CONSTANTS = Object.freeze({
  schemaVersion: 1,
  rig: 'shared-rider-v1',
  maxAccessories: 6,
  maxTriangleBudget: 2400,
  maxIdLength: 48,
  maxLabelLength: 64,
  maxPaletteEntries: 8,
  maxUnresolvedEntries: 12,
  maxSpecBytes: 50_000,
  modelTriangleCosts: Object.freeze({ ellipsoid: 288, tube: 40, box: 12 }),
  classes: Object.freeze(['palette', 'accessory', 'model']),
  headModes: Object.freeze(['separate', 'integrated']),
  limbModes: Object.freeze(['full', 'simplified', 'hidden']),
  animationProfiles: Object.freeze(['seated', 'seated-soft', 'upright']),
  vehicles: Object.freeze(['bike', 'ebike', 'chair', 'trail']),
  accessories: Object.freeze(['eye', 'belly', 'scarf', 'vest', 'tail', 'antenna']),
  proportionRules: Object.freeze({
    heightScale: Object.freeze([0.94, 1.06]),
    bodyWidthScale: Object.freeze([0.88, 1.14]),
    bodyDepthScale: Object.freeze([0.88, 1.14]),
    headWidthScale: Object.freeze([0.90, 1.12]),
    headHeightScale: Object.freeze([0.90, 1.12]),
    limbRadiusScale: Object.freeze([0.85, 1.12]),
    handScale: Object.freeze([0.85, 1.15]),
    footScale: Object.freeze([0.85, 1.15]),
    neckWidthScale: Object.freeze([0.88, 1.14]),
    neckLengthScale: Object.freeze([0.04, 0.22]),
  }),
  proportionDefaults: Object.freeze({
    heightScale: 1,
    bodyWidthScale: 1,
    bodyDepthScale: 1,
    headWidthScale: 1,
    headHeightScale: 1,
    limbRadiusScale: 1,
    handScale: 1,
    footScale: 1,
    neckWidthScale: 1,
    neckLengthScale: 0.08,
  }),
  boundsRules: Object.freeze({
    width: Object.freeze([0.76, 1.10]),
    height: Object.freeze([1.42, 1.92]),
    depth: Object.freeze([0.60, 0.96]),
  }),
  geometryRules: Object.freeze({
    depth: Object.freeze([0.45, 0.96]),
    height: Object.freeze([1.08, 1.90]),
    width: Object.freeze([0.40, 1.10]),
    bodySpan: Object.freeze([0.26, 0.78]),
    headSpan: Object.freeze([0.18, 0.56]),
    bodyEllipsoid: Object.freeze([
      Object.freeze([0.15, 0.27]), Object.freeze([0.21, 0.35]), Object.freeze([0.14, 0.29]),
    ]),
    bodyBox: Object.freeze([
      Object.freeze([0.30, 0.54]), Object.freeze([0.42, 0.70]), Object.freeze([0.28, 0.58]),
    ]),
    headEllipsoid: Object.freeze([
      Object.freeze([0.11, 0.22]), Object.freeze([0.11, 0.22]), Object.freeze([0.11, 0.22]),
    ]),
    headBox: Object.freeze([
      Object.freeze([0.22, 0.44]), Object.freeze([0.22, 0.44]), Object.freeze([0.22, 0.44]),
    ]),
    bodyCenter: Object.freeze([
      Object.freeze([-0.35, 0.15]), Object.freeze([1.05, 1.30]), Object.freeze([-0.10, 0.10]),
    ]),
    headCenter: Object.freeze([
      Object.freeze([-0.05, 0.20]), Object.freeze([1.45, 1.72]), Object.freeze([-0.10, 0.10]),
    ]),
    hipOffset: Object.freeze({ xFactor: 0.72, xMinimum: 0.76, yFactor: 0.75, zFactor: 0.72 }),
  }),
  riderHip: Object.freeze([-0.222, 0.990, 0]),
});

/**
 * @typedef {'ellipsoid' | 'tube' | 'box'} SkinPrimitiveKind
 * @typedef {object} SkinModelPrimitive
 * @property {string} id
 * @property {SkinPrimitiveKind} primitive
 * @property {string} material
 * @property {string} [anchor]
 * @property {number[]} [center]
 * @property {number[]} [size]
 * @property {number[]} [from]
 * @property {number[]} [to]
 * @property {number} [radius]
 * @property {number} [radius2]
 * @property {number} yaw
 * @property {number} roll
 * @typedef {{ low: number[], high: number[] }} SkinPartBounds
 */

/**
 * @param {'ellipsoid' | 'box'} primitive
 * @param {number[]} scaledSize
 * @param {number} yaw
 * @param {number} roll
 * @returns {number[]}
 */
function rotatedSkinHalfExtents(primitive, scaledSize, yaw, roll) {
  const [x, y, z] = scaledSize;
  const cosYaw = Math.cos(yaw), sinYaw = Math.sin(yaw);
  const cosRoll = Math.cos(roll), sinRoll = Math.sin(roll);
  // Shape uses placement(center, 0, yaw, roll): roll about Z, then yaw about Y.
  const rows = [
    [cosYaw * cosRoll, -cosYaw * sinRoll, sinYaw],
    [sinRoll, cosRoll, 0],
    [-sinYaw * cosRoll, sinYaw * sinRoll, cosYaw],
  ];
  return rows.map(([rx, ry, rz]) => primitive === 'ellipsoid'
    ? Math.hypot(rx * x, ry * y, rz * z)
    : (Math.abs(rx * x) + Math.abs(ry * y) + Math.abs(rz * z)) * 0.5);
}

/**
 * Compute the scaled model and part bounds used by both skin validators.
 * @param {readonly SkinModelPrimitive[]} parts
 * @param {Readonly<Record<string, number>>} proportions
 * @returns {SkinPartBounds & { partBounds: Map<string, SkinPartBounds> }}
 */
function skinModelEnvelope(parts, proportions) {
  const [hipX, hipY] = SKIN_CONSTANTS.riderHip;
  const { heightScale, bodyWidthScale, bodyDepthScale, headHeightScale, headWidthScale, limbRadiusScale } = proportions;
  const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
  /** @type {Map<string, SkinPartBounds>} */
  const partBounds = new Map();
  /** @param {number[]} coords */
  const point = ([x, y, z]) => [
    hipX + (x - hipX) * bodyDepthScale,
    hipY + (y - hipY) * heightScale,
    z * bodyWidthScale,
  ];
  /**
   * @param {string} id
   * @param {number[]} center
   * @param {number[]} extent
   */
  const include = (id, center, extent) => {
    const lo = center.map((value, axis) => value - extent[axis]);
    const hi = center.map((value, axis) => value + extent[axis]);
    for (let axis = 0; axis < 3; axis++) {
      low[axis] = Math.min(low[axis], lo[axis]);
      high[axis] = Math.max(high[axis], hi[axis]);
    }
    partBounds.set(id, { low: lo, high: hi });
  };
  for (const part of parts) {
    if (part.primitive === 'tube') {
      const from = point(part.from ?? [0, 0, 0]);
      const to = point(part.to ?? [0, 0, 0]);
      const baseRadius = part.radius ?? 0;
      const radius = Math.max(baseRadius, part.radius2 ?? baseRadius) * limbRadiusScale;
      include(part.id, from.map((value, axis) => (value + to[axis]) * 0.5),
        from.map((value, axis) => Math.abs(to[axis] - value) * 0.5 + radius));
      continue;
    }
    const isHead = /head|eye/i.test(part.id);
    const axisScale = [
      bodyDepthScale,
      heightScale * (isHead ? headHeightScale : 1),
      bodyWidthScale * (isHead ? headWidthScale : 1),
    ];
    const center = point(part.center ?? [0, 0, 0]);
    const scaledSize = (part.size ?? [0, 0, 0]).map((value, axis) => value * axisScale[axis]);
    include(part.id, center, rotatedSkinHalfExtents(part.primitive, scaledSize, part.yaw, part.roll));
  }
  return { low, high, partBounds };
}

module.exports = {
  MAX_SAVE_BYTES: 10_000_000,
  ONLINE_CHASE_RULES,
  DISTRICT_CHASE_RULES,
  districtChaseZoneAt,
  isChaseFormat,
  ROUTE_RULES,
  CAMPUS_NETWORKS,
  SKIN_CONSTANTS,
  skinModelEnvelope,
};
