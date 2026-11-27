// @ts-check
import { readSeedCode } from './seed-code.js';
import {
  routeCampus, routeCampuses, routeRules, routeSources,
} from '../data/routes.js';

/**
 * @typedef {'szu' | 'ucl' | 'shunde'} RouteCampus
 * @typedef {'fixed' | 'seed' | 'network'} RouteSource
 * @typedef {'forward' | 'reverse'} RouteDirection
 * @typedef {{ id: string, direction: 1 | -1 }} RouteEdge
 * @typedef {{ direction: RouteDirection, laps: number }} RouteVariant
 * @typedef {object} RouteRef
 * @property {number} schemaVersion
 * @property {RouteCampus} campus
 * @property {RouteSource} source
 * @property {string | null} id
 * @property {string | null} seed
 * @property {string | null} networkRevision
 * @property {readonly RouteEdge[]} edges
 * @property {Readonly<RouteVariant>} variant
 * @property {string} [layout]
 */

/** @type {Readonly<Record<RouteSource, string>>} */
const SOURCE_CODE = Object.freeze({ fixed: 'f', seed: 's', network: 'n' });
/** @type {Readonly<Record<string, RouteSource>>} */
const SOURCE_BY_CODE = Object.freeze({ f: 'fixed', s: 'seed', n: 'network' });
const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const NETWORK_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;

/**
 * @param {unknown} value
 * @param {number} maxLength
 * @returns {string | null}
 */
function decodeToken(value, maxLength) {
  if (typeof value !== 'string') return null;
  let decoded;
  try { decoded = decodeURIComponent(value); }
  catch { return null; }
  return decoded.length > 0 && decoded.length <= maxLength ? decoded : null;
}

/**
 * @param {unknown} value
 * @returns {RouteDirection | null}
 */
function normalizeDirection(value) {
  if (value === 'reverse' || value === -1 || value === '-1') return 'reverse';
  if (value === 'forward' || value === 1 || value === '1' || value == null) return 'forward';
  return null;
}

/**
 * @param {unknown} value
 * @returns {1 | -1 | null}
 */
function normalizeEdgeDirection(value) {
  if (value === -1 || value === 'reverse' || value === '-1') return -1;
  if (value === 1 || value === 'forward' || value === '1' || value == null) return 1;
  return null;
}

/**
 * @param {unknown} edges
 * @returns {RouteEdge[] | null}
 */
function normalizeEdges(edges) {
  if (edges == null) return [];
  if (!Array.isArray(edges) || edges.length > routeRules.maxEdges) return null;
  /** @type {RouteEdge[]} */
  const normalized = [];
  for (const edge of edges) {
    const id = typeof edge === 'string' ? edge : edge?.id;
    const direction = normalizeEdgeDirection(typeof edge === 'string' ? 1 : edge?.direction);
    if (!direction || typeof id !== 'string' || !TOKEN_PATTERN.test(id) || id.length > routeRules.maxEdgeIdLength || id.includes('~')) {
      return null;
    }
    normalized.push({ id, direction });
  }
  return normalized;
}

/**
 * @param {unknown} value
 * @param {RouteCampus} campus
 * @returns {string | null}
 */
function normalizeSeed(value, campus) {
  if (typeof value !== 'string') return null;
  const seed = readSeedCode(value, campus);
  return seed && seed.length <= routeRules.maxSeedLength ? seed : null;
}

/**
 * @param {RouteRef} route
 * @returns {Readonly<RouteRef>}
 */
function freezeRoute(route) {
  if (route.edges) Object.freeze(route.edges);
  if (route.variant) Object.freeze(route.variant);
  return Object.freeze(route);
}

/**
 * Convert a route-like object to the small, serializable RouteRef contract.
 * This function deliberately does not inspect a map.  Map connectivity and
 * length checks belong to the resolver/validation layer.
 * @param {unknown} input
 * @returns {Readonly<RouteRef> | null}
 */
export function normalizeRouteSpec(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = /** @type {Record<string, any>} */ (input);
  const schemaVersion = Number(raw.schemaVersion ?? routeRules.schemaVersion);
  if (schemaVersion !== routeRules.schemaVersion) return null;
  const campus = /** @type {RouteCampus | null} */ (routeCampus(raw.campus));
  if (!campus) return null;
  let source = raw.source;
  if (!source) source = raw.edges?.length ? 'network' : raw.seed ? 'seed' : 'fixed';
  if (!routeSources.includes(source)) return null;
  const routeSource = /** @type {RouteSource} */ (source);

  const variantInput = raw.variant ?? {};
  const direction = normalizeDirection(variantInput.direction ?? raw.direction);
  const laps = Number(variantInput.laps ?? raw.laps ?? 1);
  if (!direction || !Number.isInteger(laps) || laps < 1 || laps > routeRules.maxLaps) return null;
  const edges = normalizeEdges(raw.edges);
  if (!edges) return null;

  /** @type {RouteRef} */
  const route = {
    schemaVersion,
    campus,
    source: routeSource,
    id: null,
    seed: null,
    networkRevision: null,
    edges,
    variant: { direction, laps },
  };
  if (routeSource === 'fixed') {
    if (typeof raw.id !== 'string' || !TOKEN_PATTERN.test(raw.id) || raw.id.length > routeRules.maxRouteIdLength) return null;
    route.id = raw.id;
  } else if (routeSource === 'seed') {
    route.seed = normalizeSeed(raw.seed ?? raw.id, campus);
    if (!route.seed) return null;
    route.id = typeof raw.id === 'string' && TOKEN_PATTERN.test(raw.id) ? raw.id : `seed-${route.seed}`;
  } else {
    const rev = typeof raw.networkRevision === 'string' ? raw.networkRevision : routeCampuses[campus].networkRevision;
    route.networkRevision = rev;
    if (!NETWORK_PATTERN.test(rev) || rev.length > routeRules.maxNetworkRevisionLength || !edges.length) return null;
  }
  if (typeof raw.layout === 'string' && /^[0-9a-f]{8}$/i.test(raw.layout)) route.layout = raw.layout.toLowerCase();
  return freezeRoute(route);
}

/**
 * @param {string} value
 * @returns {RouteEdge[] | null}
 */
function decodeEdges(value) {
  if (!value) return [];
  const parts = value.split(',');
  if (parts.length > routeRules.maxEdges) return null;
  return normalizeEdges(parts.map(part => {
    const split = part.lastIndexOf('~');
    if (split <= 0) return null;
    const id = decodeToken(part.slice(0, split), routeRules.maxEdgeIdLength);
    const direction = part.slice(split + 1);
    return id == null ? null : { id, direction };
  }));
}

/**
 * Parse the compact `R1.campus.source.payload.direction.laps[.edges]` form.
 * @param {unknown} text
 * @returns {Readonly<RouteRef> | null}
 */
export function parseRouteCode(text) {
  if (typeof text !== 'string' || text.length > routeRules.maxCodeLength) return null;
  const parts = text.trim().split('.');
  if (parts.length < 6 || parts.length > 7 || parts[0] !== `${routeRules.codePrefix}${routeRules.schemaVersion}`) return null;
  const campus = routeCampus(parts[1]);
  const source = SOURCE_BY_CODE[parts[2]];
  if (!campus || !source) return null;
  const payload = decodeToken(parts[3], source === 'network' ? routeRules.maxNetworkRevisionLength : source === 'seed' ? routeRules.maxSeedLength : routeRules.maxRouteIdLength);
  const direction = normalizeDirection(parts[4]);
  const laps = Number(parts[5]);
  if (!payload || !direction || !Number.isInteger(laps)) return null;
  const edges = parts.length === 7 ? decodeEdges(parts[6]) : [];
  if (!edges) return null;
  return normalizeRouteSpec(source === 'fixed'
    ? { schemaVersion: routeRules.schemaVersion, campus, source, id: payload, edges, variant: { direction, laps } }
    : source === 'seed'
      ? { schemaVersion: routeRules.schemaVersion, campus, source, seed: payload, edges, variant: { direction, laps } }
      : { schemaVersion: routeRules.schemaVersion, campus, source, networkRevision: payload, edges, variant: { direction, laps } });
}

/** @param {string} value */
function encodeToken(value) {
  // Dot separates route fields and is left untouched by encodeURIComponent.
  return encodeURIComponent(value).replaceAll('.', '%2E');
}

/**
 * Encode a route spec into a shareable `R1...` code string.
 * @param {unknown} input
 * @returns {string | null}
 */
export function encodeRouteCode(input) {
  const route = normalizeRouteSpec(input);
  if (!route) return null;
  const payload = /** @type {string} */ (
    route.source === 'fixed' ? route.id : route.source === 'seed' ? route.seed : route.networkRevision
  );
  const edges = route.edges.length
    ? '.' + route.edges.map(edge => `${encodeToken(edge.id)}~${edge.direction}`).join(',')
    : '';
  const code = `${routeRules.codePrefix}${route.schemaVersion}.${route.campus}.${SOURCE_CODE[route.source]}.${encodeToken(payload)}.${route.variant.direction}.${route.variant.laps}${edges}`;
  return code.length <= routeRules.maxCodeLength ? code : null;
}

/**
 * @param {unknown} input
 * @returns {boolean}
 */
export function isValidRouteSpec(input) {
  return normalizeRouteSpec(input) !== null;
}

export { normalizeDirection as normalizeRouteDirection };
