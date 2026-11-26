import {
  defaultRiderSkin, riderSkinRules, skinAccessories, skinAnimationProfiles,
  skinBoundsRules, skinClasses, skinHeadModes, skinLimbModes, skinProportionRules,
  skinGeometryRules, skinVehicles,
} from '../data/rider-skins.js';

const BUILTIN_SKINS = Object.freeze({ default: defaultRiderSkin });
const REMOVED_SKIN_IDS = new Set(['yellow-orb']);
const CUSTOM_SKIN_KEY = 'forzero-rider-skins-v1';
let riderSkinRegistry = BUILTIN_SKINS;

function skinStorage() {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

function readCustomSkinSpecs() {
  const storage = skinStorage();
  if (!storage) return [];
  try {
    const value = JSON.parse(storage.getItem(CUSTOM_SKIN_KEY) ?? '[]');
    return Array.isArray(value)
      ? value.map(normalizeSkinSpec).filter(spec => spec && !REMOVED_SKIN_IDS.has(spec.id) && spec.class === 'model')
      : [];
  } catch { return []; }
}

function rebuildRegistry(custom = readCustomSkinSpecs()) {
  const next = { ...BUILTIN_SKINS };
  for (const spec of custom) {
    if (spec?.id && !Object.hasOwn(BUILTIN_SKINS, spec.id)) next[spec.id] = spec;
  }
  riderSkinRegistry = Object.freeze(next);
  return riderSkinRegistry;
}

rebuildRegistry();

export { riderSkinRegistry };

export function riderSkinChoices() {
  return Object.freeze(Object.fromEntries(Object.entries(riderSkinRegistry).map(([id, spec]) => [id, spec.label])));
}

export function knownSkinId(value) {
  return typeof value === 'string' && Object.hasOwn(riderSkinRegistry, value) ? value : 'default';
}

export function skinForProfile(profile) {
  const id = knownSkinId(profile?.skinId);
  const declared = normalizeSkinSpec(profile?.skinSpec);
  if (declared?.class === 'model' && !REMOVED_SKIN_IDS.has(declared.id) && profile?.skinId === declared.id) return declared;
  return riderSkinRegistry[id] ?? defaultRiderSkin;
}

function canonicalSkinText(spec) {
  return JSON.stringify({
    schemaVersion: spec.schemaVersion, id: spec.id, label: spec.label, class: spec.class,
    rig: spec.rig, palette: spec.palette, proportions: spec.proportions, headMode: spec.headMode,
    limbMode: spec.limbMode, animationProfile: spec.animationProfile, accessories: spec.accessories,
    allowedVehicles: spec.allowedVehicles, bounds: spec.bounds, triangleBudget: spec.triangleBudget, model: spec.model ?? null,
    unlock: spec.unlock,
  });
}

export function skinSpecHash(input) {
  const spec = normalizeSkinSpec(input);
  if (!spec) return null;
  let hash = 2166136261;
  for (const char of canonicalSkinText(spec)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return `fnv1a-${hash.toString(16).padStart(8, '0')}`;
}

export function refreshRiderSkinRegistry() {
  return rebuildRegistry();
}

export function registerSkinSpec(input) {
  const spec = normalizeSkinSpec(input);
  if (!spec || spec.class !== 'model' || REMOVED_SKIN_IDS.has(spec.id) || Object.hasOwn(BUILTIN_SKINS, spec.id)) return null;
  const custom = readCustomSkinSpecs().filter(item => item.id !== spec.id);
  custom.push(spec);
  const storage = skinStorage();
  if (storage) {
    try { storage.setItem(CUSTOM_SKIN_KEY, JSON.stringify(custom)); } catch { return null; }
  }
  rebuildRegistry(custom);
  return Object.freeze({ spec, hash: skinSpecHash(spec) });
}

export function removeSkinSpec(id) {
  if (typeof id !== 'string' || Object.hasOwn(BUILTIN_SKINS, id)) return false;
  const custom = readCustomSkinSpecs().filter(spec => spec.id !== id);
  const storage = skinStorage();
  try { storage?.setItem(CUSTOM_SKIN_KEY, JSON.stringify(custom)); } catch { return false; }
  rebuildRegistry(custom);
  return true;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,47}$/;
const ACCESSORY_ANCHORS = new Set(['body', 'head', 'back', 'leftHand', 'rightHand']);
const PROP_KEYS = Object.keys(skinProportionRules);
const BOUNDS_KEYS = Object.keys(skinBoundsRules);
const MODEL_PRIMITIVES = new Set(['ellipsoid', 'tube', 'box']);
const MODEL_MATERIAL = /^[a-z][a-zA-Z0-9_-]{0,23}$/;
const MODEL_ANCHORS = new Set(['body', 'head', 'neck', 'back', 'leftHand', 'rightHand', 'leftFoot', 'rightFoot']);
const FORBIDDEN_MODEL_PART = /helmet|backpack/i;

const numberIn = (value, [min, max]) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const clone = value => JSON.parse(JSON.stringify(value));

function error(path, message) { return `${path}: ${message}`; }

function normalizePalette(value, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(error('palette', '必须是颜色对象'));
    return {};
  }
  const palette = {};
  for (const [key, color] of Object.entries(value).slice(0, riderSkinRules.maxPaletteEntries)) {
    if (!/^[a-z][a-zA-Z0-9_-]{0,23}$/.test(key) || !HEX_COLOR.test(color)) {
      errors.push(error(`palette.${key}`, '必须是 #RRGGBB 颜色'));
      continue;
    }
    palette[key] = color.toLowerCase();
  }
  if (Object.keys(value).length > riderSkinRules.maxPaletteEntries) errors.push(error('palette', '颜色项过多'));
  return palette;
}

function normalizeProportions(value, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(error('proportions', '必须是比例对象'));
    return null;
  }
  const proportions = {};
  for (const key of PROP_KEYS) {
    const fallback = defaultRiderSkin.proportions[key];
    const number = value[key] ?? fallback;
    if (!numberIn(number, skinProportionRules[key])) errors.push(error(`proportions.${key}`, '超出允许范围'));
    proportions[key] = number;
  }
  return proportions;
}

function normalizeBounds(value, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(error('bounds', '必须是包围盒对象'));
    return null;
  }
  const bounds = {};
  for (const key of BOUNDS_KEYS) {
    const number = value[key];
    if (!numberIn(number, skinBoundsRules[key])) errors.push(error(`bounds.${key}`, '超出允许范围'));
    bounds[key] = number;
  }
  return bounds;
}

function normalizeAccessory(value, index, errors) {
  const source = typeof value === 'string' ? { type: value } : value;
  if (!source || typeof source !== 'object' || Array.isArray(source) || !skinAccessories.includes(source.type)) {
    errors.push(error(`accessories[${index}]`, '不是已登记的配饰类型'));
    return null;
  }
  const anchor = source.anchor ?? (source.type === 'eye' || source.type === 'antenna' ? 'head' : 'body');
  const scale = source.scale ?? 1;
  const color = source.color ?? null;
  if (!ACCESSORY_ANCHORS.has(anchor)) errors.push(error(`accessories[${index}].anchor`, '挂点未登记'));
  if (!numberIn(scale, [0.5, 1.5])) errors.push(error(`accessories[${index}].scale`, '必须在 0.5–1.5'));
  if (color !== null && !HEX_COLOR.test(color)) errors.push(error(`accessories[${index}].color`, '必须是 #RRGGBB 颜色'));
  return { type: source.type, anchor, scale, ...(color ? { color: color.toLowerCase() } : {}) };
}

function normalizedVehicles(value, errors) {
  const vehicles = Array.isArray(value) ? [...new Set(value)] : [...skinVehicles];
  if (!vehicles.length || vehicles.some(vehicle => !skinVehicles.includes(vehicle))) errors.push(error('allowedVehicles', '包含未知车型或为空'));
  return vehicles;
}

function finiteVector(value, length, path, errors, limits = [-2.5, 2.5]) {
  if (!Array.isArray(value) || value.length !== length || value.some(item => typeof item !== 'number' || !Number.isFinite(item))) {
    errors.push(error(path, `必须是 ${length} 个数字`));
    return Array(length).fill(0);
  }
  const result = value.slice();
  if (result.some(item => item < limits[0] || item > limits[1])) errors.push(error(path, '超出骑手局部坐标范围'));
  return result;
}

function normalizeModel(value, errors) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(error('model', '必须是声明式模型对象'));
    return null;
  }
  const version = value.version ?? 1;
  if (version !== 1) errors.push(error('model.version', '模型版本不支持'));
  if (!Array.isArray(value.parts) || value.parts.length < 2 || value.parts.length > 32) {
    errors.push(error('model.parts', '必须包含 2–32 个白名单图元'));
    return null;
  }
  const ids = new Set(), parts = [];
  for (const [index, source] of value.parts.entries()) {
    const path = `model.parts[${index}]`;
    if (!source || typeof source !== 'object' || Array.isArray(source)) { errors.push(error(path, '图元格式无效')); continue; }
    const id = typeof source.id === 'string' && /^[a-z][a-z0-9_-]{0,31}$/.test(source.id) ? source.id : '';
    const primitive = source.primitive;
    const material = typeof source.material === 'string' && MODEL_MATERIAL.test(source.material) ? source.material : '';
    const anchor = source.anchor == null ? null : source.anchor;
    if (!id || ids.has(id) || FORBIDDEN_MODEL_PART.test(id)) errors.push(error(`${path}.id`, '图元 id 无效、重复或包含禁用的头盔/背包部件'));
    if (!MODEL_PRIMITIVES.has(primitive)) errors.push(error(`${path}.primitive`, '图元类型未登记'));
    if (!material) errors.push(error(`${path}.material`, '材质名无效'));
    if (anchor !== null && !MODEL_ANCHORS.has(anchor)) errors.push(error(`${path}.anchor`, '挂点未登记'));
    ids.add(id);
    const part = { id, primitive, material, ...(anchor ? { anchor } : {}) };
    if (primitive === 'tube') {
      part.from = finiteVector(source.from, 3, `${path}.from`, errors);
      part.to = finiteVector(source.to, 3, `${path}.to`, errors);
      part.radius = source.radius;
      part.radius2 = source.radius2 ?? part.radius;
      if (!numberIn(part.radius, [.004, .45]) || !numberIn(part.radius2, [.004, .45])) errors.push(error(path, '半径必须在 0.004–0.45'));
    } else {
      part.center = finiteVector(source.center, 3, `${path}.center`, errors);
      part.size = finiteVector(source.size ?? source.radii, 3, `${path}.size`, errors, [.004, 1.2]);
      if (part.size.some(item => item < .004)) errors.push(error(`${path}.size`, '尺寸必须为正数'));
    }
    part.yaw = source.yaw ?? 0;
    part.roll = source.roll ?? 0;
    if (!Number.isFinite(part.yaw) || !Number.isFinite(part.roll) || Math.abs(part.yaw) > Math.PI * 4 || Math.abs(part.roll) > Math.PI * 4) {
      errors.push(error(path, '旋转必须是有限数字且绝对值不超过 4π'));
    }
    parts.push(part);
  }
  for (const required of ['body', 'head']) if (!ids.has(required)) errors.push(error('model.parts', `缺少 ${required} 图元`));
  return { version, parts };
}

const RIDER_HIP = [-.222, .990, 0];

function modelEnvelope(model, proportions) {
  const height = proportions.heightScale, width = proportions.bodyWidthScale, depth = proportions.bodyDepthScale;
  const headHeight = proportions.headHeightScale, headWidth = proportions.headWidthScale;
  const limbRadius = proportions.limbRadiusScale;
  const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
  const partBounds = new Map();
  const point = ([x, y, z]) => [
    RIDER_HIP[0] + (x - RIDER_HIP[0]) * depth,
    RIDER_HIP[1] + (y - RIDER_HIP[1]) * height,
    z * width,
  ];
  const include = (id, center, extent) => {
    const lo = center.map((value, axis) => value - extent[axis]);
    const hi = center.map((value, axis) => value + extent[axis]);
    for (let axis = 0; axis < 3; axis++) {
      low[axis] = Math.min(low[axis], lo[axis]);
      high[axis] = Math.max(high[axis], hi[axis]);
    }
    partBounds.set(id, { low: lo, high: hi });
  };
  for (const part of model.parts) {
    const isHead = /head|eye/i.test(part.id);
    const axisScale = [depth, height * (isHead ? headHeight : 1), width * (isHead ? headWidth : 1)];
    if (part.primitive === 'tube') {
      const from = point(part.from), to = point(part.to), radius = Math.max(part.radius, part.radius2 ?? part.radius) * limbRadius;
      include(part.id, from.map((value, axis) => (value + to[axis]) * .5), [
        Math.abs(to[0] - from[0]) * .5 + radius,
        Math.abs(to[1] - from[1]) * .5 + radius,
        Math.abs(to[2] - from[2]) * .5 + radius,
      ]);
      continue;
    }
    const center = point(part.center);
    const scaled = part.size.map((value, axis) => value * axisScale[axis]);
    const rotated = Math.abs(part.yaw) > 1e-6 || Math.abs(part.roll) > 1e-6;
    const extent = part.primitive === 'ellipsoid'
      ? (rotated ? [Math.hypot(...scaled), Math.hypot(...scaled), Math.hypot(...scaled)] : scaled)
      : (rotated ? [Math.hypot(...scaled) * .5, Math.hypot(...scaled) * .5, Math.hypot(...scaled) * .5] : scaled.map(value => value * .5));
    include(part.id, center, extent);
  }
  return { low, high, partBounds };
}

function validateModelEnvelope(model, proportions, bounds, errors) {
  const envelope = modelEnvelope(model, proportions);
  const [minX, minY, minZ] = envelope.low, [maxX, maxY, maxZ] = envelope.high;
  const actual = { depth: maxX - minX, height: maxY - minY, width: maxZ - minZ };
  for (const key of ['depth', 'height', 'width']) {
    if (!numberIn(actual[key], skinGeometryRules[key])) errors.push(error(`model.envelope.${key}`, '超出骑手安全外包络范围'));
    if (actual[key] > bounds[key]) errors.push(error(`model.envelope.${key}`, '超过 bounds 声明的最终尺寸'));
  }
  const body = envelope.partBounds.get('body'), head = envelope.partBounds.get('head');
  for (const [id, part] of [['body', model.parts.find(item => item.id === 'body')], ['head', model.parts.find(item => item.id === 'head')]]) {
    if (!part) continue;
    if (part.primitive === 'tube') {
      errors.push(error(`model.parts.${id}`, '主体和头部必须使用 ellipsoid 或 box 图元'));
      continue;
    }
    const rule = skinGeometryRules[`${id}${part.primitive === 'ellipsoid' ? 'Ellipsoid' : 'Box'}`];
    if (rule) {
      part.size.forEach((value, axis) => {
        if (!numberIn(value, rule[axis])) errors.push(error(`model.parts.${id}.size[${axis}]`, '主体或头部尺寸超出安全范围'));
      });
    }
    const centerRule = skinGeometryRules[`${id}Center`];
    part.center.forEach((value, axis) => {
      if (!numberIn(value, centerRule[axis])) errors.push(error(`model.parts.${id}.center[${axis}]`, '主体或头部中心超出安全范围'));
    });
  }
  if (body) {
    const span = Math.max(...body.high.map((value, axis) => value - body.low[axis]));
    if (!numberIn(span, skinGeometryRules.bodySpan)) errors.push(error('model.parts.body', '主体尺寸过大或过小'));
  }
  if (head) {
    const span = Math.max(...head.high.map((value, axis) => value - head.low[axis]));
    if (!numberIn(span, skinGeometryRules.headSpan)) errors.push(error('model.parts.head', '头部尺寸过大或过小'));
  }
  const offset = skinGeometryRules.hipOffset;
  const depthLimit = Math.max(bounds.depth * offset.xFactor, offset.xMinimum);
  const widthLimit = bounds.width * offset.zFactor, heightLimit = bounds.height * offset.yFactor;
  if (Math.max(Math.abs(minX - RIDER_HIP[0]), Math.abs(maxX - RIDER_HIP[0])) > depthLimit) errors.push(error('model.envelope.x', '主体偏离座位髋部'));
  if (Math.max(Math.abs(minY - RIDER_HIP[1]), Math.abs(maxY - RIDER_HIP[1])) > heightLimit) errors.push(error('model.envelope.y', '主体高度偏离共享骑手范围'));
  if (Math.max(Math.abs(minZ), Math.abs(maxZ)) > widthLimit) errors.push(error('model.envelope.z', '主体横向宽度偏离共享骑手范围'));
}

function parseSkinSpec(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { spec: null, errors: ['SkinSpec 必须是 JSON 对象'] };
  }
  const errors = [];
  const schemaVersion = input.schemaVersion ?? riderSkinRules.schemaVersion;
  if (schemaVersion !== riderSkinRules.schemaVersion) errors.push(error('schemaVersion', '版本不支持'));
  const id = typeof input.id === 'string' ? input.id.trim().toLowerCase() : '';
  if (!ID_PATTERN.test(id)) errors.push(error('id', '格式不合法'));
  const label = typeof input.label === 'string' && input.label.trim().length <= riderSkinRules.maxLabelLength
    ? input.label.trim() : id;
  const skinClass = input.class;
  if (!skinClasses.includes(skinClass)) errors.push(error('class', '类型不支持'));
  if (input.rig !== riderSkinRules.rig) errors.push(error('rig', '动作骨架不支持'));
  const palette = normalizePalette(input.palette, errors);
  const model = normalizeModel(input.model, errors);
  if (skinClass === 'model' && !model) errors.push(error('model', 'model 类型必须包含声明式模型'));
  if (model) {
    for (const [index, part] of model.parts.entries()) {
      if (!Object.hasOwn(palette, part.material)) errors.push(error(`model.parts[${index}].material`, '材质必须引用 palette 中的颜色'));
    }
  }
  const proportions = normalizeProportions(input.proportions, errors);
  const bounds = normalizeBounds(input.bounds, errors);
  const headMode = input.headMode;
  const limbMode = input.limbMode;
  const animationProfile = input.animationProfile;
  if (!skinHeadModes.includes(headMode)) errors.push(error('headMode', '模式不支持'));
  if (!skinLimbModes.includes(limbMode)) errors.push(error('limbMode', '模式不支持'));
  if (!skinAnimationProfiles.includes(animationProfile)) errors.push(error('animationProfile', '动作不支持'));
  const accessoriesInput = input.accessories ?? [];
  if (!Array.isArray(accessoriesInput) || accessoriesInput.length > riderSkinRules.maxAccessories) errors.push(error('accessories', '配饰数量超限'));
  const accessories = Array.isArray(accessoriesInput)
    ? accessoriesInput.slice(0, riderSkinRules.maxAccessories).map((item, index) => normalizeAccessory(item, index, errors)).filter(Boolean)
    : [];
  const allowedVehicles = normalizedVehicles(input.allowedVehicles, errors);
  const triangleBudget = input.triangleBudget;
  if (!Number.isInteger(triangleBudget) || triangleBudget < 1 || triangleBudget > riderSkinRules.maxTriangleBudget) errors.push(error('triangleBudget', '面数预算超限'));
  const modelTriangles = model
    ? model.parts.reduce((sum, part) => sum + (riderSkinRules.modelTriangleCosts[part.primitive] ?? 0), 0)
    : 0;
  if (model && Number.isInteger(triangleBudget) && modelTriangles > triangleBudget) {
    errors.push(error('model.parts', `声明式图元预计 ${modelTriangles} 三角面，超过 triangleBudget ${triangleBudget}`));
  }
  if (model && proportions && bounds) validateModelEnvelope(model, proportions, bounds, errors);
  const unlock = input.unlock == null ? null : typeof input.unlock === 'string' && input.unlock.length <= 80 ? input.unlock : null;
  if (input.unlock != null && unlock === null) errors.push(error('unlock', '解锁条件格式不合法'));
  if (errors.length) return { spec: null, errors };
  return {
    spec: Object.freeze({
      schemaVersion,
      id,
      label,
      class: skinClass,
      rig: riderSkinRules.rig,
      palette: Object.freeze(palette),
      ...(model ? { model: Object.freeze({ version: model.version, parts: Object.freeze(model.parts.map(part => Object.freeze(part))) }) } : {}),
      proportions: Object.freeze(proportions),
      headMode,
      limbMode,
      animationProfile,
      accessories: Object.freeze(accessories),
      allowedVehicles: Object.freeze(allowedVehicles),
      bounds: Object.freeze(bounds),
      triangleBudget,
      unlock,
    }),
    errors: [],
  };
}

/** Normalize and validate a declarative SkinSpec. Returns null for unsafe data. */
export function normalizeSkinSpec(input) {
  return parseSkinSpec(input).spec;
}

export function validateSkinSpec(input) {
  const { spec, errors } = parseSkinSpec(input);
  return { valid: spec !== null, spec, errors };
}

/** Validate the JSON envelope produced by an offline AI SkinModelSpec tool. */
export function validateSkinProposal(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, proposal: null, errors: ['SkinProposal 必须是 JSON 对象'] };
  }
  const errors = [];
  const confidence = input.confidence;
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    errors.push(error('confidence', '必须在 0–1'));
  }
  const { spec, errors: specErrors } = parseSkinSpec(input.spec);
  errors.push(...specErrors);
  if (errors.length || !spec) {
    return { valid: false, proposal: null, errors };
  }
  const unresolved = Array.isArray(input.unresolved) ? input.unresolved.filter(item => typeof item === 'string').slice(0, riderSkinRules.maxUnresolvedEntries) : [];
  const previewNotes = Array.isArray(input.previewNotes) ? input.previewNotes.filter(item => typeof item === 'string').slice(0, riderSkinRules.maxUnresolvedEntries) : [];
  return {
    valid: true,
    proposal: Object.freeze({ spec, confidence, unresolved: Object.freeze(unresolved), previewNotes: Object.freeze(previewNotes) }),
    errors: [],
  };
}

export function normalizeSkinProposal(input) {
  return validateSkinProposal(input).proposal;
}

export function isSkinSpec(input) {
  return normalizeSkinSpec(input) !== null;
}

export function skinCacheKey(input, quality = 'default') {
  const spec = normalizeSkinSpec(input);
  return spec ? `${spec.id}@${spec.schemaVersion}:${skinSpecHash(spec)}:${String(quality).slice(0, 16)}` : null;
}

export function skinAppearance(input) {
  const spec = normalizeSkinSpec(input);
  if (!spec) return null;
  return {
    id: spec.id,
    schemaVersion: spec.schemaVersion,
    paint: spec.palette.body ?? defaultRiderSkin.palette.body,
    palette: { ...spec.palette },
    proportions: clone(spec.proportions),
    model: spec.model ? clone(spec.model) : null,
    accessories: clone(spec.accessories),
    bounds: clone(spec.bounds),
    triangleBudget: spec.triangleBudget,
    headMode: spec.headMode,
    limbMode: spec.limbMode,
    animationProfile: spec.animationProfile,
  };
}

export function extractSkinJsonText(raw) {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {}
  const cleaned = trimmed
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B-\u200D\u2060]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/^(?:```[a-zA-Z0-9_-]*[ \t]*\r?\n)/, '')
    .replace(/\r?\n```[ \t]*$/, '')
    .replace(/&#x20;|&#32;|&nbsp;/gi, ' ')
    .replace(/[ \t]*\\[ \t]*(\r?\n)/g, '$1')
    .trim();
  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch {}
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) return cleaned.slice(start, end + 1).trim();
  return cleaned;
}

export function skinAllowedOnVehicle(skin, vehicle) {
  return Boolean(skin && skin.id !== 'default' && (!Array.isArray(skin.allowedVehicles) || skin.allowedVehicles.includes(vehicle)));
}

export { ACCESSORY_ANCHORS, MODEL_ANCHORS, MODEL_PRIMITIVES };
