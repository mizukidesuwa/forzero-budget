import { getCourseVariant } from '../race/course-variants.js';
import { encodeRouteCode, normalizeRouteSpec, parseRouteCode } from '../race/route-code.js';
import { canonicalRouteKey, routeLayoutKey } from '../race/route-key.js';
import { validateRouteRef } from '../race/route-validation.js';

function asRouteRef(value) {
  if (typeof value === 'string') return parseRouteCode(value);
  return normalizeRouteSpec(value);
}

/** Resolve a compact RouteRef against injected course lists and seed factory. */
export function resolveRouteRef(value, {
  coursesByCampus = {},
  makeSeedCourse = null,
  networkFor = null,
  makeNetworkCourse = null,
  expectedRevision = null,
  layoutOf = routeLayoutKey,
} = {}) {
  const suppliedCode = typeof value === 'object' && value ? value.code : null;
  const route = asRouteRef(value);
  if (!route) return null;
  if (route.source === 'network') {
    const validation = validateRouteRef(route, { networkFor, expectedRevision });
    if (!validation.valid || typeof makeNetworkCourse !== 'function') return null;
    const baseEvent = makeNetworkCourse({ ...route, variant: { direction: 'forward', laps: 1 } }, validation.network);
    const event = baseEvent ? getCourseVariant(baseEvent, route.variant) : null;
    if (!event || event.campus !== route.campus) return null;
    const actualVariant = event.variant ?? { direction: 'forward', laps: 1 };
    if (actualVariant.direction !== route.variant.direction || actualVariant.laps !== route.variant.laps) return null;
    const layout = layoutOf(event);
    if (route.layout && layout && route.layout !== layout) return null;
    const code = encodeRouteCode(route);
    if (suppliedCode && suppliedCode !== code) return null;
    return Object.freeze({ route, event, code, key: canonicalRouteKey(route), layout });
  }
  const courses = coursesByCampus[route.campus] ?? [];
  const base = route.source === 'seed'
    ? (typeof makeSeedCourse === 'function' ? makeSeedCourse(route.seed, route.campus) : null)
    : courses.find(course => course.id === route.id);
  if (!base) return null;
  const event = getCourseVariant(base, route.variant);
  if (!event || event.campus !== route.campus) return null;
  const actualVariant = event.variant ?? { direction: 'forward', laps: 1 };
  if (actualVariant.direction !== route.variant.direction || actualVariant.laps !== route.variant.laps) return null;
  const layout = layoutOf(event);
  if (route.layout && layout && route.layout !== layout) return null;
  const code = encodeRouteCode(route);
  if (suppliedCode && suppliedCode !== code) return null;
  return Object.freeze({ route, event, code, key: canonicalRouteKey(route), layout });
}

export function routeRefForCourse(event, { direction = 'forward', laps = 1, layoutOf = routeLayoutKey } = {}) {
  if (!event?.campus || !event.id) return null;
  const source = event.networkRevision && Array.isArray(event.networkEdges) ? 'network' : event.seed ? 'seed' : 'fixed';
  const route = normalizeRouteSpec({
    campus: event.campus, source, id: event.id, seed: event.seed,
    networkRevision: event.networkRevision, edges: event.networkEdges,
    variant: { direction, laps }, layout: layoutOf(event),
  });
  return route ? Object.freeze({ route, code: encodeRouteCode(route), key: canonicalRouteKey(route) }) : null;
}
