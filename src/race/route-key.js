import { normalizeRouteSpec } from './route-code.js';

function hashText(text) {
  let hash = 2166136261;
  for (const symbol of text) hash = Math.imul(hash ^ symbol.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function routeInput(value) {
  if (value?.schemaVersion && value?.campus && value?.source) return value;
  if (!value || typeof value !== 'object') return null;
  return {
    schemaVersion: 1,
    campus: value.campus,
    source: value.seed ? 'seed' : value.edges?.length ? 'network' : 'fixed',
    id: value.id,
    seed: value.seed,
    networkRevision: value.networkRevision,
    edges: value.edges,
    variant: value.variant,
    layout: value.layout,
  };
}

export function canonicalRouteKey(input) {
  const route = normalizeRouteSpec(routeInput(input));
  if (!route) return null;
  const payload = route.source === 'fixed' ? route.id : route.source === 'seed' ? route.seed : route.networkRevision;
  const edges = route.edges.map(edge => `${edge.id}:${edge.direction}`).join(',');
  return [route.schemaVersion, route.campus, route.source, payload, route.variant.direction, route.variant.laps, edges].join('|');
}

/** Return an eight-character layout key compatible with Ghost course keys. */
export function routeLayoutKey(input) {
  const route = routeInput(input);
  if (typeof route?.layout === 'string' && /^[0-9a-f]{8}$/i.test(route.layout)) return route.layout.toLowerCase();
  const canonical = canonicalRouteKey(input);
  return canonical ? hashText(canonical) : null;
}

export function routeEnvironmentKey(input, { trafficSeed = null, weather = 'day', wind = null } = {}) {
  const route = normalizeRouteSpec(routeInput(input));
  if (!route) return null;
  const layout = routeLayoutKey(route);
  const windKey = wind ? [wind.weather ?? weather, Number(wind.speed ?? 0).toFixed(1), Number(wind.angle ?? 0).toFixed(3)].join(',') : 'none';
  const traffic = trafficSeed ?? `${route.campus}:${layout}`;
  return `route1|${route.campus}|${layout}|${route.variant.direction}:${route.variant.laps}|traffic=${traffic}|wind=${windKey}`;
}

export { hashText as routeHash };
