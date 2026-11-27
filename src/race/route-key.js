// @ts-check
import { normalizeRouteSpec } from './route-code.js';

/**
 * @typedef {{ weather?: string, speed?: number, angle?: number }} RouteWindOptions
 * @typedef {{ trafficSeed?: string | null, weather?: string, wind?: RouteWindOptions | null }} RouteEnvironmentOptions
 */

/**
 * Compute an 8-character FNV-1a hex digest for a string.
 * @param {string} text
 * @returns {string}
 */
function hashText(text) {
  let hash = 2166136261;
  for (const symbol of text) hash = Math.imul(hash ^ symbol.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * @param {unknown} value
 * @returns {Record<string, any> | null}
 */
function routeInput(value) {
  if (!value || typeof value !== 'object') return null;
  const raw = /** @type {Record<string, any>} */ (value);
  if (raw.schemaVersion && raw.campus && raw.source) return raw;
  return {
    schemaVersion: 1,
    campus: raw.campus,
    source: raw.seed ? 'seed' : raw.edges?.length ? 'network' : 'fixed',
    id: raw.id,
    seed: raw.seed,
    networkRevision: raw.networkRevision,
    edges: raw.edges,
    variant: raw.variant,
    layout: raw.layout,
  };
}

/**
 * Build a stable canonical string identifying route geometry and variant.
 * @param {unknown} input
 * @returns {string | null}
 */
export function canonicalRouteKey(input) {
  const route = normalizeRouteSpec(routeInput(input));
  if (!route) return null;
  const payload = route.source === 'fixed' ? route.id : route.source === 'seed' ? route.seed : route.networkRevision;
  const edges = route.edges.map(edge => `${edge.id}:${edge.direction}`).join(',');
  return [route.schemaVersion, route.campus, route.source, payload, route.variant.direction, route.variant.laps, edges].join('|');
}

/**
 * Return an eight-character layout key compatible with Ghost course keys.
 * @param {unknown} input
 * @returns {string | null}
 */
export function routeLayoutKey(input) {
  const route = routeInput(input);
  if (typeof route?.layout === 'string' && /^[0-9a-f]{8}$/i.test(route.layout)) return route.layout.toLowerCase();
  const canonical = canonicalRouteKey(input);
  return canonical ? hashText(canonical) : null;
}

/**
 * Build the combined route + traffic + wind environment key used for Ghost and leaderboards.
 * @param {unknown} input
 * @param {RouteEnvironmentOptions} [options]
 * @returns {string | null}
 */
export function routeEnvironmentKey(input, { trafficSeed = null, weather = 'day', wind = null } = {}) {
  const route = normalizeRouteSpec(routeInput(input));
  if (!route) return null;
  const layout = routeLayoutKey(route);
  const windKey = wind ? [wind.weather ?? weather, Number(wind.speed ?? 0).toFixed(1), Number(wind.angle ?? 0).toFixed(3)].join(',') : 'none';
  const traffic = trafficSeed ?? `${route.campus}:${layout}`;
  return `route1|${route.campus}|${layout}|${route.variant.direction}:${route.variant.laps}|traffic=${traffic}|wind=${windKey}`;
}

export { hashText as routeHash };
