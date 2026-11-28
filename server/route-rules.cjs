const { ROUTE_RULES, CAMPUS_NETWORKS } = require('./shared-rules.cjs');
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const NETWORK = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;

function campus(value) { return Object.hasOwn(CAMPUS_NETWORKS, value) ? value : null; }
function direction(value) {
  if (value === 'reverse' || value === -1 || value === '-1') return 'reverse';
  if (value === 'forward' || value === 1 || value === '1' || value == null) return 'forward';
  return null;
}
function edgeDirection(value) { return value === -1 || value === 'reverse' || value === '-1' ? -1 : value === 1 || value === 'forward' || value === '1' || value == null ? 1 : null; }
function decode(value, max) {
  if (typeof value !== 'string') return null;
  let result;
  try { result = decodeURIComponent(value); } catch { return null; }
  return result && result.length <= max ? result : null;
}
function normalizeEdges(edges) {
  if (edges == null) return [];
  if (!Array.isArray(edges) || edges.length > ROUTE_RULES.maxEdges) return null;
  const result = [];
  for (const item of edges) {
    const id = typeof item === 'string' ? item : item?.id;
    const dir = edgeDirection(typeof item === 'string' ? 1 : item?.direction);
    if (!dir || typeof id !== 'string' || !TOKEN.test(id) || id.length > ROUTE_RULES.maxEdgeIdLength || id.includes('~')) return null;
    result.push({ id, direction: dir });
  }
  return result;
}
function normalizeRoute(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const schemaVersion = Number(input.schemaVersion ?? 1);
  const camp = campus(String(input.campus ?? '').toLowerCase());
  if (schemaVersion !== 1 || !camp) return null;
  const source = input.source ?? (input.networkRevision || input.edges?.length ? 'network' : input.seed ? 'seed' : 'fixed');
  if (!['fixed', 'seed', 'network'].includes(source)) return null;
  const variant = input.variant ?? {};
  const dir = direction(variant.direction ?? input.direction);
  const laps = Number(variant.laps ?? input.laps ?? 1);
  const edges = normalizeEdges(input.edges);
  if (!dir || !Number.isInteger(laps) || laps < 1 || laps > 9 || !edges) return null;
  const route = { schemaVersion: 1, campus: camp, source, id: null, seed: null, networkRevision: null, edges, variant: { direction: dir, laps } };
  if (source === 'fixed') {
    if (typeof input.id !== 'string' || !TOKEN.test(input.id) || input.id.length > 64) return null;
    route.id = input.id;
  } else if (source === 'seed') {
    const seed = typeof input.seed === 'string' ? input.seed : input.id;
    if (!seed || !/^[SU][0-9]-[A-Z0-9]{1,12}$/.test(seed) || seed.length > 16) return null;
    route.seed = seed;
    route.id = typeof input.id === 'string' && TOKEN.test(input.id) ? input.id : `seed-${seed}`;
  } else {
    route.networkRevision = typeof input.networkRevision === 'string' ? input.networkRevision : CAMPUS_NETWORKS[camp];
    if (!NETWORK.test(route.networkRevision) || route.networkRevision.length > 40 || !edges.length) return null;
  }
  return route;
}
function encodeToken(value) { return encodeURIComponent(value).replaceAll('.', '%2E'); }
function encodeRoute(route) {
  const normalized = normalizeRoute(route);
  if (!normalized) return null;
  const sourceCode = { fixed: 'f', seed: 's', network: 'n' }[normalized.source];
  const payload = normalized.source === 'fixed' ? normalized.id : normalized.source === 'seed' ? normalized.seed : normalized.networkRevision;
  const edges = normalized.edges.length ? '.' + normalized.edges.map(edge => `${encodeToken(edge.id)}~${edge.direction}`).join(',') : '';
  const code = `R1.${normalized.campus}.${sourceCode}.${encodeToken(payload)}.${normalized.variant.direction}.${normalized.variant.laps}${edges}`;
  return code.length <= ROUTE_RULES.maxCodeLength ? code : null;
}
function parseRouteCode(text) {
  if (typeof text !== 'string' || text.length > ROUTE_RULES.maxCodeLength) return null;
  const parts = text.trim().split('.');
  if (parts.length < 6 || parts.length > 7 || parts[0] !== 'R1') return null;
  const camp = campus(parts[1]);
  const source = ({ f: 'fixed', s: 'seed', n: 'network' })[parts[2]];
  const max = source === 'network' ? 40 : source === 'seed' ? 16 : 64;
  const payload = decode(parts[3], max);
  const dir = direction(parts[4]), laps = Number(parts[5]);
  if (!camp || !source || !payload || !dir || !Number.isInteger(laps)) return null;
  let edges = [];
  if (parts.length === 7) {
    const chunks = parts[6].split(',');
    edges = normalizeEdges(chunks.map(item => {
      const at = item.lastIndexOf('~');
      return at > 0 ? { id: decode(item.slice(0, at), 48), direction: item.slice(at + 1) } : null;
    }));
    if (!edges) return null;
  }
  return normalizeRoute(source === 'fixed'
    ? { campus: camp, source, id: payload, edges, variant: { direction: dir, laps } }
    : source === 'seed'
      ? { campus: camp, source, seed: payload, edges, variant: { direction: dir, laps } }
      : { campus: camp, source, networkRevision: payload, edges, variant: { direction: dir, laps } });
}
module.exports = { CAMPUS_NETWORKS, normalizeRoute, parseRouteCode, encodeRoute };
