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

const ROUTE_RULES = Object.freeze({
  schemaVersion: 1,
  codePrefix: 'R',
  maxCodeLength: 256,
  maxEdges: 32,
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

module.exports = {
  MAX_SAVE_BYTES: 10_000_000,
  ONLINE_CHASE_RULES,
  ROUTE_RULES,
  CAMPUS_NETWORKS,
  SKIN_CONSTANTS,
};
