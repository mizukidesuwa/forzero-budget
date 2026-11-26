import { courseVariantRules } from '../data/race.js';
import { along, makeCourse, travelTable } from '../world/geometry.js';
import { initCourseBenchmarks } from './records.js';

const variants = new WeakMap();

export function courseIsLoop(event) {
  const a = event.gates[0].p, b = event.gates.at(-1).p;
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= courseVariantRules.loopTolerance;
}

export function courseVariantSuffix({ direction, laps } = {}) {
  return (direction === 'reverse' ? ':rev' : '') + (laps > 1 ? ':' + laps + 'lap' : '');
}

export function deriveCourseVariant(event, { direction = 'forward', laps = 1 } = {}) {
  const base = event.baseCourse ?? event;
  const reverse = direction === 'reverse';
  const count = courseIsLoop(base) && courseVariantRules.laps.includes(laps) ? laps : 1;
  if (!reverse && count === 1) return base;
  const length = base.length;
  const positions = [along(base.path, 0), ...base.path.rows.filter(row => row.distance > 0 && row.distance < length)
    .map(row => row.p), along(base.path, length)];
  if (reverse) positions.reverse();
  const repeated = positions.slice();
  for (let lap = 1; lap < count; lap++) repeated.push(...positions.slice(1));
  const path = travelTable(repeated, base.path.width);
  const scaled = path.length / (length * count);
  const inputGates = reverse ? base.gates.slice().reverse() : base.gates;
  const sourceGates = [];
  const spec = [];
  for (let lap = 0; lap < count; lap++) {
    for (const [i, gate] of inputGates.entries()) {
      if (lap && i === 0) continue;
      const distance = ((reverse ? length - gate.distance : gate.distance) + lap * length) * scaled;
      const lapGate = count > 1 && i === inputGates.length - 1;
      spec.push([distance, lapGate ? `第 ${lap + 1} 圈` : gate.name, gate.half]);
      sourceGates.push(gate);
    }
  }
  spec[0][1] = '起点';
  spec.at(-1)[0] = path.length;
  spec.at(-1)[1] = '终点';
  const variant = { direction: reverse ? 'reverse' : 'forward', laps: count };
  const suffix = [reverse && '反向', count > 1 && count + ' 圈'].filter(Boolean);
  const derived = makeCourse(base.id, [base.name, ...suffix].join(' · '), base.description, path, spec, path.length, {
    absolute: true, campus: base.campus, cityAccess: base.cityAccess,
    flyover: base.flyover, thresholds: base.thresholds, revision: base.revision,
  });
  derived.baseCourse = base;
  if (base.seed) derived.seed = base.seed;
  if (base.networkRevision) {
    derived.networkRevision = base.networkRevision;
    derived.networkEdges = base.networkEdges?.map(edge => ({ ...edge }));
  }
  derived.variant = variant;
  derived.environment = base.environment;
  derived.shortcut = base.shortcut;
  if (base.londonLines) {
    derived.londonLines = base.londonLines.map(cut => reverse ? {
      from: (length - cut.to) * scaled, to: (length - cut.from) * scaled,
      path: travelTable(cut.path.rows.slice().reverse().map(row => row.p), cut.path.width),
    } : cut);
  }
  for (const [i, gate] of derived.gates.entries()) {
    const original = sourceGates[i];
    if (original.minCross === undefined || original.maxCross === undefined) continue;
    gate.minCross = reverse ? -original.maxCross : original.minCross;
    gate.maxCross = reverse ? -original.minCross : original.maxCross;
  }
  if (base.elevation) {
    const { profile, gain, loss } = base.elevation;
    const points = reverse ? profile.slice().reverse().map(([distance, height]) => [length - distance, height]) : profile;
    derived.elevation = {
      profile: Array.from({ length: count }, (_, lap) =>
        points.map(([distance, height]) => [(distance + lap * length) * scaled, height])).flat(),
      gain: (reverse ? loss : gain) * count, loss: (reverse ? gain : loss) * count,
    };
  }
  if (count > 1) {
    const intervals = base.gates.length - 1;
    derived.stages = Array.from({ length: count }, (_, index) => {
      const startGate = index * intervals, finishGate = startGate + intervals;
      return { index, startGate, finishGate, name: `第 ${index + 1} 圈`,
        from: derived.gates[startGate].distance, to: derived.gates[finishGate].distance };
    });
  } else if (base.stages?.length) {
    const last = base.gates.length - 1;
    const stages = reverse ? base.stages.slice().reverse() : base.stages;
    derived.stages = stages.map((stage, index) => {
      const startGate = reverse ? last - stage.finishGate : stage.startGate;
      const finishGate = reverse ? last - stage.startGate : stage.finishGate;
      return { ...stage, index, startGate, finishGate,
        from: derived.gates[startGate].distance, to: derived.gates[finishGate].distance };
    });
  }
  // Race support lines use the same derived path and time stations as the timing gates.
  initCourseBenchmarks([derived]);
  return derived;
}

export function getCourseVariant(event, options = {}) {
  const base = event.baseCourse ?? event;
  const direction = options.direction === 'reverse' ? 'reverse' : 'forward';
  const laps = courseIsLoop(base) && courseVariantRules.laps.includes(options.laps) ? options.laps : 1;
  const suffix = courseVariantSuffix({ direction, laps });
  if (!suffix) return base;
  let cache = variants.get(base);
  if (!cache) variants.set(base, cache = new Map());
  if (!cache.has(suffix)) cache.set(suffix, deriveCourseVariant(base, { direction, laps }));
  return cache.get(suffix);
}
