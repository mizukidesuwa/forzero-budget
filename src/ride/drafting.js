import { clamp } from '../core/math.js';
import { draftingRules as rules } from '../data/race.js';

export function sampleWake(rider, leader, limits = rules, tracked = false) {
  if (!leader || rider.speed < (limits.minSpeed ?? rules.minSpeed) || leader.speed < rules.minLeaderSpeed) return null;
  const [x, y, z] = leader.position, [rx, ry, rz] = rider.position;
  if (Math.abs(y - ry) > limits.maxHeight) return null;
  const fx = Math.cos(leader.heading), fz = Math.sin(leader.heading);
  const dx = x - rx, dz = z - rz;
  const rear = leader.halfL ?? rules.riderFront;
  const gap = dx * fx + dz * fz - (leader.halfL ?? 0);
  const side = Math.abs(dx * fz - dz * fx);
  const heading = Math.cos(rider.heading - leader.heading);
  const maxSide = limits.maxSide + (leader.extraWakeWidth ?? 0);
  if (gap < limits.minGap || gap > limits.maxGap || side > maxSide + (tracked ? rules.exitMargin : 0) ||
      heading < (tracked ? rules.exitHeadingDot : limits.minHeadingDot)) return null;
  const inside = side <= maxSide && heading > limits.minHeadingDot;
  if (!inside && !tracked) return null;
  return {
    id: leader.id ?? leader, gap, side, maxSide, inside,
    rear: [x - fx * rear, y + rules.riderWakeHeight, z - fz * rear],
  };
}

export function findWake(rider, leaders, tracked = null) {
  let best = null;
  for (const leader of leaders) {
    const same = Boolean(tracked && leader && (leader.id ?? leader) === tracked);
    const wake = sampleWake(rider, leader, rules, same);
    if (!wake) continue;
    if (same) return wake;
    if (!best || wake.gap < best.gap) best = wake;
  }
  return best;
}

export function advanceDraft(previous, wake, dt, eligible) {
  const burst = Math.max(0, (previous?.burst ?? 0) - dt);
  if (!eligible || !wake || burst > 0) return { burst, charge: 0, wake: null };
  const same = previous?.wake?.id === wake.id;
  if (wake.inside) {
    const charge = clamp((same ? previous.charge : 0) + dt / rules.chargeSeconds, 0, 1);
    return { burst, charge: charge > 1 - Number.EPSILON * 8 ? 1 : charge, wake };
  }
  const cutOut = same && previous.charge === 1 && wake.side > wake.maxSide &&
    wake.side > previous.wake.side + rules.minimumSideChange;
  return { burst: cutOut ? rules.burstSeconds : burst, charge: 0, wake: null };
}

export function draftRenderSpan(rider) {
  const rear = rider.draft?.wake?.rear;
  if (!rear) return null;
  const [x, y, z] = rider.position;
  return { rear, front: [
    x + Math.cos(rider.heading) * rules.riderFront, y + rules.riderWakeHeight,
    z + Math.sin(rider.heading) * rules.riderFront,
  ] };
}
