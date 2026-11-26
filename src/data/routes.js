import sharedRules from './shared-rules.cjs';

// Versioned limits for declarative route references.  The route encoder and
// resolver consume this data so that input limits do not drift into UI code.
export const routeRules = sharedRules.ROUTE_RULES;

export const routeCampuses = Object.freeze({
  szu: Object.freeze({ networkRevision: sharedRules.CAMPUS_NETWORKS.szu }),
  ucl: Object.freeze({ networkRevision: sharedRules.CAMPUS_NETWORKS.ucl }),
  shunde: Object.freeze({ networkRevision: sharedRules.CAMPUS_NETWORKS.shunde }),
});

export const routeSources = Object.freeze(['fixed', 'seed', 'network']);
export const routeDirections = Object.freeze(['forward', 'reverse']);

export function routeCampus(value) {
  const campus = String(value ?? '').trim().toLowerCase();
  return Object.hasOwn(routeCampuses, campus) ? campus : null;
}

export function routeNetworkRevision(campus) {
  return routeCampuses[routeCampus(campus)]?.networkRevision ?? null;
}
