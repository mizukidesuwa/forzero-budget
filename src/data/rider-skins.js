import sharedRules from './shared-rules.cjs';

const skinSpec = sharedRules.SKIN_CONSTANTS;

export const riderSkinRules = Object.freeze({
  schemaVersion: skinSpec.schemaVersion,
  rig: skinSpec.rig,
  maxAccessories: skinSpec.maxAccessories,
  maxTriangleBudget: skinSpec.maxTriangleBudget,
  maxIdLength: skinSpec.maxIdLength,
  maxLabelLength: skinSpec.maxLabelLength,
  maxPaletteEntries: skinSpec.maxPaletteEntries,
  maxUnresolvedEntries: skinSpec.maxUnresolvedEntries,
  modelTriangleCosts: skinSpec.modelTriangleCosts,
});

export const skinClasses = skinSpec.classes;
export const skinHeadModes = skinSpec.headModes;
export const skinLimbModes = skinSpec.limbModes;
export const skinAnimationProfiles = skinSpec.animationProfiles;
export const skinVehicles = skinSpec.vehicles;

export const skinAccessories = skinSpec.accessories;

export const skinProportionRules = skinSpec.proportionRules;

export const skinBoundsRules = skinSpec.boundsRules;

export const skinGeometryRules = skinSpec.geometryRules;

export const defaultRiderSkin = Object.freeze({
  schemaVersion: riderSkinRules.schemaVersion,
  id: 'default',
  label: '标准骑手',
  class: 'palette',
  rig: riderSkinRules.rig,
  palette: Object.freeze({
    body: '#e87542', belly: '#e87542', eye: '#172719', accent: '#e6e2c5',
  }),
  proportions: Object.freeze({
    heightScale: 1, bodyWidthScale: 1, bodyDepthScale: 1, headWidthScale: 1,
    headHeightScale: 1, limbRadiusScale: 1, handScale: 1, footScale: 1,
    neckWidthScale: 1, neckLengthScale: 0.08,
  }),
  headMode: 'separate',
  limbMode: 'full',
  animationProfile: 'seated',
  accessories: [],
  allowedVehicles: [...skinVehicles],
  bounds: Object.freeze({ width: 0.86, height: 1.76, depth: 0.72 }),
  triangleBudget: 1600,
  unlock: null,
});

