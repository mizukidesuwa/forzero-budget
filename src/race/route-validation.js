import { normalizeRouteSpec } from './route-code.js';
import { routeNetworkRevision } from '../data/routes.js';

function fail(message) { return { valid: false, route: null, error: message }; }

/**
 * Validate a canonical route reference against injected network metadata.
 * The validator never reads a map or mutates a route.  A network provider may
 * expose edgeById(id), length and min/max bounds for the current revision.
 */
export function validateRouteRef(input, {
  networkFor = null,
  expectedRevision = null,
} = {}) {
  const route = normalizeRouteSpec(input);
  if (!route) return fail('路线引用格式无效。');
  if (route.source !== 'network') return { valid: true, route, length: null, error: null };

  const network = typeof networkFor === 'function' ? networkFor(route.campus) : networkFor?.[route.campus];
  const revision = typeof expectedRevision === 'function'
    ? expectedRevision(route.campus)
    : expectedRevision ?? network?.revision ?? routeNetworkRevision(route.campus);
  if (revision && route.networkRevision !== revision) return fail('道路网络版本不匹配。');
  if (!network || typeof network.edgeById !== 'function') return fail('本机没有这张道路网络。');

  let total = 0;
  let previousTo = null;
  for (const ref of route.edges) {
    const edge = network.edgeById(ref.id, ref.direction);
    if (!edge) return fail(`道路边不存在：${ref.id}`);
    if (previousTo !== null && edge.from !== previousTo) return fail('道路边未首尾连接。');
    const length = Number(edge.length ?? edge.span);
    if (!Number.isFinite(length) || length <= 0) return fail('道路边长度无效。');
    total += length;
    previousTo = edge.to;
  }
  const minimum = Number(network.minimum ?? 0), maximum = Number(network.maximum ?? Infinity);
  if (total < minimum || total > maximum) return fail('路线长度超出道路网络范围。');
  return { valid: true, route, length: total, network, error: null };
}

export function routeValidationError(input, options = {}) {
  return validateRouteRef(input, options).error;
}

