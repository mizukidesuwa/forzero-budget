// @ts-check
import { add, clamp, lerpPoint, subtract, transform } from '../core/math.js';

/**
 * @typedef {'leftHand' | 'rightHand' | 'leftFoot' | 'rightFoot'} SkinLimbRole
 * @typedef {'none' | 'all' | 'arms'} SkinLimbExclusion
 * @typedef {import('./rider-skin.js').SkinSpec} SkinSpec
 * @typedef {import('./rider-skin.js').SkinModelPrimitive} SkinModelPrimitive
 * @typedef {{
 *   id: string,
 *   primitive: 'ellipsoid' | 'tube' | 'box',
 *   material: string,
 *   color: string,
 *   anchor: string | null,
 *   role: SkinLimbRole | null,
 *   yaw: number,
 *   roll: number,
 *   center?: [number, number, number],
 *   size?: [number, number, number],
 *   from?: [number, number, number],
 *   to?: [number, number, number],
 *   radius?: number,
 *   radius2?: number,
 * }} ScaledSkinPart
 * @typedef {{
 *   staticParts: ScaledSkinPart[],
 *   armParts: { left: ScaledSkinPart[], right: ScaledSkinPart[] },
 *   legParts: { left: ScaledSkinPart[], right: ScaledSkinPart[] },
 *   armSpan: { left: { minX: number, maxX: number, spanX: number }, right: { minX: number, maxX: number, spanX: number } },
 *   legSpan: { left: { hipY: number, footY: number, spanY: number }, right: { hipY: number, footY: number, spanY: number } },
 *   hasArms: boolean,
 *   hasLegs: boolean,
 * }} SkinLimbAnalysis
 */

const RIDER_HIP = [-.222, .990, 0];
const DEFAULT_SHIRT = '#e87542';
const LEG_ID_PATTERN = /(?:leg|foot|feet|thigh|calf|shin|knee|ankle|shoe|boot|sock|hind[_-]?paw)/i;
const ARM_ID_PATTERN = /(?:arm|hand|wrist|sleeve|forearm|shoulder|elbow|front[_-]?paw)/i;
const LEFT_ID_PATTERN = /(?:^|[_-])(?:left|l)(?:$|[_-])|^left/i;
const RIGHT_ID_PATTERN = /(?:^|[_-])(?:right|r)(?:$|[_-])|^right/i;

/**
 * Resolve which animated limb chain (if any) a declarative SkinModelPart belongs to.
 * Explicit `leftHand` / `rightHand` / `leftFoot` / `rightFoot` anchors win first;
 * unanchored parts fall back to unambiguous limb + side IDs so non-limb appendages stay static.
 * @param {Pick<SkinModelPrimitive, 'id' | 'anchor'>} part
 * @returns {SkinLimbRole | null}
 */
export function skinPartLimbRole(part) {
  if (!part?.id || part.id === 'body' || part.id === 'head' || part.id === 'neck') return null;
  if (part.anchor === 'leftHand' || part.anchor === 'rightHand' || part.anchor === 'leftFoot' || part.anchor === 'rightFoot') {
    return part.anchor;
  }
  if (part.anchor && part.anchor !== 'body') return null;
  const isLeft = LEFT_ID_PATTERN.test(part.id);
  const isRight = RIGHT_ID_PATTERN.test(part.id);
  if (isLeft === isRight) return null;
  if (ARM_ID_PATTERN.test(part.id)) return isLeft ? 'leftHand' : 'rightHand';
  if (LEG_ID_PATTERN.test(part.id)) return isLeft ? 'leftFoot' : 'rightFoot';
  return null;
}

/**
 * Resolve hex color and hip-scaled coordinates for a single declarative SkinModelPart.
 * @param {SkinModelPrimitive} part
 * @param {Readonly<Record<string, number>>} proportions
 * @param {Readonly<Record<string, string>>} palette
 * @returns {ScaledSkinPart}
 */
export function scaleSkinPart(part, proportions, palette) {
  const height = proportions.heightScale ?? 1;
  const width = proportions.bodyWidthScale ?? 1;
  const depth = proportions.bodyDepthScale ?? 1;
  const headScale = /head|eye/i.test(part.id)
    ? { height: proportions.headHeightScale ?? 1, width: proportions.headWidthScale ?? 1 }
    : { height: 1, width: 1 };
  const limbRadius = proportions.limbRadiusScale ?? 1;
  /**
   * @param {readonly number[]} value
   * @returns {[number, number, number]}
   */
  const point = value => [
    RIDER_HIP[0] + (value[0] - RIDER_HIP[0]) * depth,
    RIDER_HIP[1] + (value[1] - RIDER_HIP[1]) * height,
    value[2] * width,
  ];
  const color = palette[part.material] ?? (part.material.startsWith('#') ? part.material : palette.body ?? DEFAULT_SHIRT);
  const role = skinPartLimbRole(part);
  /** @type {ScaledSkinPart} */
  const scaled = {
    id: part.id,
    primitive: part.primitive,
    material: part.material,
    color,
    anchor: part.anchor ?? null,
    role,
    yaw: part.yaw ?? 0,
    roll: part.roll ?? 0,
  };
  if (part.primitive === 'tube') {
    const baseRadius = part.radius ?? 0;
    scaled.from = point(part.from ?? [0, 0, 0]);
    scaled.to = point(part.to ?? [0, 0, 0]);
    scaled.radius = baseRadius * limbRadius;
    scaled.radius2 = (part.radius2 ?? baseRadius) * limbRadius;
  } else {
    const rawSize = part.size ?? [0, 0, 0];
    scaled.center = point(part.center ?? [0, 0, 0]);
    scaled.size = [rawSize[0] * depth, rawSize[1] * height * headScale.height, rawSize[2] * width * headScale.width];
  }
  return scaled;
}

/**
 * Compute `[min, max]` along a coordinate axis across scaled limb parts.
 * @param {readonly ScaledSkinPart[]} parts
 * @param {0 | 1 | 2} axis
 * @returns {[number, number]}
 */
function axisBounds(parts, axis) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const part of parts) {
    if (part.primitive === 'tube' && part.from && part.to) {
      lo = Math.min(lo, part.from[axis], part.to[axis]);
      hi = Math.max(hi, part.from[axis], part.to[axis]);
    } else if (part.center && part.size) {
      const half = part.primitive === 'ellipsoid' ? part.size[axis] : part.size[axis] * .5;
      lo = Math.min(lo, part.center[axis] - half);
      hi = Math.max(hi, part.center[axis] + half);
    }
  }
  return [lo, hi];
}

/** @type {WeakMap<object, SkinLimbAnalysis>} */
const analysisCache = new WeakMap();

/**
 * Partition declarative `SkinSpec.model.parts` into static body parts and animated limb groups.
 * @param {Readonly<SkinSpec> | null | undefined} spec
 * @returns {SkinLimbAnalysis}
 */
export function analyzeSkinLimbs(spec) {
  if (spec && typeof spec === 'object') {
    const cached = analysisCache.get(spec);
    if (cached) return cached;
  }
  const palette = spec?.palette ?? {};
  const proportions = spec?.proportions ?? {};
  /** @type {ScaledSkinPart[]} */
  const staticParts = [];
  /** @type {{ left: ScaledSkinPart[], right: ScaledSkinPart[] }} */
  const armParts = { left: [], right: [] };
  /** @type {{ left: ScaledSkinPart[], right: ScaledSkinPart[] }} */
  const legParts = { left: [], right: [] };

  for (const rawPart of spec?.model?.parts ?? []) {
    const scaled = scaleSkinPart(rawPart, proportions, palette);
    if (scaled.role === 'leftHand') armParts.left.push(scaled);
    else if (scaled.role === 'rightHand') armParts.right.push(scaled);
    else if (scaled.role === 'leftFoot') legParts.left.push(scaled);
    else if (scaled.role === 'rightFoot') legParts.right.push(scaled);
    else staticParts.push(scaled);
  }

  const armSpanFor = (/** @type {ScaledSkinPart[]} */ list) => {
    if (!list.length) return { minX: 0, maxX: .12, spanX: .12 };
    const [minX, maxX] = axisBounds(list, 0);
    return { minX, maxX, spanX: Math.max(.12, maxX - minX) };
  };
  const legSpanFor = (/** @type {ScaledSkinPart[]} */ list) => {
    if (!list.length) return { hipY: .99, footY: .59, spanY: .40 };
    const [footY, hipY] = axisBounds(list, 1);
    return { hipY, footY, spanY: Math.max(.10, hipY - footY) };
  };

  /** @type {SkinLimbAnalysis} */
  const result = {
    staticParts,
    armParts,
    legParts,
    armSpan: { left: armSpanFor(armParts.left), right: armSpanFor(armParts.right) },
    legSpan: { left: legSpanFor(legParts.left), right: legSpanFor(legParts.right) },
    hasArms: armParts.left.length > 0 || armParts.right.length > 0,
    hasLegs: legParts.left.length > 0 || legParts.right.length > 0,
  };
  if (spec && typeof spec === 'object') analysisCache.set(spec, result);
  return result;
}

/**
 * @param {any} mesh
 * @param {ScaledSkinPart} part
 * @param {[number, number, number]} [center]
 * @param {[number, number, number]} [from]
 * @param {[number, number, number]} [to]
 * @param {number} [yaw]
 * @param {number} [roll]
 */
function emitPartGeometry(mesh, part, center, from, to, yaw = part.yaw, roll = part.roll) {
  if (part.primitive === 'ellipsoid') {
    mesh.ellipsoid(center ?? part.center, part.size, part.color, 16, 10, roll, yaw);
  } else if (part.primitive === 'box') {
    mesh.box(center ?? part.center, part.size, part.color, yaw, roll);
  } else if (part.primitive === 'tube') {
    mesh.tube(from ?? part.from, to ?? part.to, part.radius, part.radius2, part.color, 10);
  }
}

/**
 * Emit the static subset of a declared `SkinSpec` mesh onto a `Shape`.
 * Passing `excludeLimbs = 'none'` matches legacy full static geometry verbatim.
 * @param {any} mesh
 * @param {Readonly<SkinSpec> | null | undefined} spec
 * @param {SkinLimbExclusion} [excludeLimbs]
 */
export function emitStaticSkinParts(mesh, spec, excludeLimbs = 'none') {
  if (!spec?.model?.parts?.length) return;
  const analysis = analyzeSkinLimbs(spec);
  if (excludeLimbs === 'none') {
    const proportions = spec.proportions ?? {};
    const palette = spec.palette ?? {};
    for (const part of spec.model.parts) {
      emitPartGeometry(mesh, scaleSkinPart(part, proportions, palette));
    }
    return;
  }
  for (const part of analysis.staticParts) emitPartGeometry(mesh, part);
  if (excludeLimbs === 'arms') {
    for (const part of analysis.legParts.left) emitPartGeometry(mesh, part);
    for (const part of analysis.legParts.right) emitPartGeometry(mesh, part);
  }
}

/**
 * Emit dynamically deformed arms (handlebar steering) and legs (crank pedaling)
 * for an imported declarative `SkinSpec`, leaving limbless models safely untouched.
 * @param {any} mesh
 * @param {Readonly<SkinSpec> | null | undefined} spec
 * @param {{
 *   bodyPose: Float32Array | number[] | null,
 *   steerTransform: Float32Array | number[],
 *   grip: readonly number[],
 *   spin: number,
 *   mode?: 'bike' | 'powered',
 *   crankRadius?: number,
 *   skinTransform?: Float32Array | number[] | null,
 * }} options
 */
export function emitAnimatedSkinLimbs(mesh, spec, {
  bodyPose,
  steerTransform,
  grip,
  spin,
  mode = 'bike',
  crankRadius = .158,
  skinTransform = null,
}) {
  if (!spec?.model?.parts?.length) return;
  const info = analyzeSkinLimbs(spec);

  const skinScale = skinTransform ? Math.max(1e-4, skinTransform[0]) : 1;
  for (const [sideKey, side] of /** @type {const} */ ([['left', -1], ['right', 1]])) {
    const arms = info.armParts[sideKey];
    if (arms.length && steerTransform && grip) {
      const gripPoint = [grip[0], grip[1] + (mode === 'bike' ? .016 : 0), side * grip[2]];
      const steered = transform(steerTransform, gripPoint);
      const rawDelta = subtract(steered, gripPoint);
      const deltaGrip = skinTransform
        ? [rawDelta[0] / skinScale, rawDelta[1] / skinScale, rawDelta[2] / skinScale]
        : rawDelta;
      const gripYaw = Math.atan2(-deltaGrip[2], Math.max(.08, gripPoint[0] - RIDER_HIP[0]));
      const { minX, spanX } = info.armSpan[sideKey];

      /** @param {readonly number[]} p */
      const deformArmPoint = p => {
        const w = clamp((p[0] - minX) / spanX, 0, 1);
        const anchor = bodyPose ? transform(bodyPose, p).slice(0, 3) : p;
        const target = add(p, deltaGrip);
        return lerpPoint(anchor, target, w);
      };

      for (const part of arms) {
        if (part.primitive === 'tube' && part.from && part.to) {
          emitPartGeometry(mesh, part, undefined,
            /** @type {[number, number, number]} */ (deformArmPoint(part.from)),
            /** @type {[number, number, number]} */ (deformArmPoint(part.to)));
        } else if (part.center) {
          const w = clamp((part.center[0] - minX) / spanX, 0, 1);
          const center = /** @type {[number, number, number]} */ (deformArmPoint(part.center));
          const yaw = part.yaw + (w > .65 ? gripYaw : 0);
          emitPartGeometry(mesh, part, center, undefined, undefined, yaw, part.roll);
        }
      }
    }

    if (mode !== 'bike') continue;
    const legs = info.legParts[sideKey];
    if (!legs.length) continue;

    const a = spin + (side < 0 ? Math.PI : 0);
    const { hipY, spanY } = info.legSpan[sideKey];
    const orbit = clamp(spanY * .24, .045, crankRadius * .88);
    const dxFoot = orbit * Math.cos(a);
    const dyFoot = orbit * Math.sin(a);
    const kneeBend = Math.max(0, Math.sin(a)) * orbit * .55;

    /** @param {readonly number[]} p */
    const deformLegPoint = p => {
      const w = clamp((hipY - p[1]) / spanY, 0, 1);
      const hipPos = bodyPose ? transform(bodyPose, p).slice(0, 3) : p;
      const footPos = [p[0] + dxFoot, p[1] + dyFoot, p[2]];
      const base = lerpPoint(hipPos, footPos, w);
      const kneeWeight = 4 * w * (1 - w);
      return /** @type {[number, number, number]} */ ([
        base[0] + kneeBend * kneeWeight,
        base[1] + kneeBend * .25 * kneeWeight,
        base[2],
      ]);
    };

    for (const part of legs) {
      if (part.primitive === 'tube' && part.from && part.to) {
        emitPartGeometry(mesh, part, undefined,
          /** @type {[number, number, number]} */ (deformLegPoint(part.from)),
          /** @type {[number, number, number]} */ (deformLegPoint(part.to)));
      } else if (part.center) {
        const w = clamp((hipY - part.center[1]) / spanY, 0, 1);
        const center = /** @type {[number, number, number]} */ (deformLegPoint(part.center));
        const footRoll = part.roll + (w > .72 ? (.12 * Math.sin(a) - .07) : 0);
        emitPartGeometry(mesh, part, center, undefined, undefined, part.yaw, footRoll);
      }
    }
  }
}
