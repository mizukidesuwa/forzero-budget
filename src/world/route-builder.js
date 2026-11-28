import { dot } from '../core/math.js';
import { routeNetworkRevision, routeRules } from '../data/routes.js';
import { encodeRouteCode } from '../race/route-code.js';
import { validateRouteRef } from '../race/route-validation.js';
import { along, joinTrack } from './geometry.js';
import { networkForCampus } from './seed-courses.js';

/** Return a readable Chinese/local label for a road-network intersection id. */
export function networkNodeLabel(network, nodeId) {
  if (!network || !nodeId) return '';
  if (network.endpoints?.[nodeId]) return network.endpoints[nodeId];
  const outgoing = network.edges?.get(nodeId) ?? [];
  const street = outgoing.find(edge => edge.name)?.name;
  return street ? `${street}路口` : nodeId;
}

/** Find the closest road-network intersection node within maxDist meters. */
export function nearestNetworkNode(network, x, z, maxDist = 28) {
  if (!network?.points) return null;
  let best = null, bestD2 = maxDist * maxDist;
  for (const [id, pt] of Object.entries(network.points)) {
    const outgoing = network.edges?.get(id);
    if (!outgoing?.length) continue;
    const dx = pt[0] - x, dz = pt[1] - z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= bestD2) {
      bestD2 = d2;
      best = { id, x: pt[0], z: pt[1], dist: Math.sqrt(d2), label: networkNodeLabel(network, id) };
    }
  }
  return best;
}

/**
 * Shortest-path Dijkstra between two nodes on a road network, preventing abrupt
 * U-turns against prevEdge while penalizing already-used edges so loops stay clean.
 */
export function shortestNetworkLeg(network, fromId, toId, { prevEdge = null, usedEdgeIds = null } = {}) {
  if (!network?.edges || !fromId || !toId || fromId === toId) return null;
  if (!network.edges.has(fromId) || !network.edges.has(toId)) return null;

  const startKey = `${fromId}|${prevEdge?.id ?? ''}`;
  const dist = new Map([[startKey, 0]]);
  const prevState = new Map();
  const queue = [{ key: startKey, node: fromId, prev: prevEdge, cost: 0 }];
  let goalKey = null;

  while (queue.length) {
    let bestIdx = 0;
    for (let i = 1; i < queue.length; i++) {
      if (queue[i].cost < queue[bestIdx].cost) bestIdx = i;
    }
    const current = queue.splice(bestIdx, 1)[0];
    if (current.cost > (dist.get(current.key) ?? Infinity)) continue;
    if (current.node === toId) {
      goalKey = current.key;
      break;
    }
    const outgoing = network.edges.get(current.node) ?? [];
    for (const edge of outgoing) {
      const immediateBacktrack = current.prev && edge.to === current.prev.from && edge.from === current.prev.to;
      if (immediateBacktrack && outgoing.length > 1) continue;
      const dotTurn = current.prev ? dot(current.prev.exit, edge.entry) : 1;
      if (!immediateBacktrack && dotTurn <= -0.92) continue;
      const baseId = edge.id.endsWith('r') ? edge.id.slice(0, -1) : edge.id;
      const penalty = (usedEdgeIds?.has(baseId) ? 1.35 : 1) + (dotTurn < 0.2 ? 0.08 : 0);
      const nextCost = current.cost + edge.span * penalty;
      const nextKey = `${edge.to}|${edge.id}`;
      if (nextCost < (dist.get(nextKey) ?? Infinity)) {
        dist.set(nextKey, nextCost);
        prevState.set(nextKey, { key: current.key, edge });
        queue.push({ key: nextKey, node: edge.to, prev: edge, cost: nextCost });
      }
    }
  }

  if (!goalKey) return null;
  const pathEdges = [];
  let cursor = goalKey;
  while (prevState.has(cursor)) {
    const step = prevState.get(cursor);
    pathEdges.push(step.edge);
    cursor = step.key;
  }
  pathEdges.reverse();
  return pathEdges;
}

function sampleEdgePolyline(edge) {
  const steps = Math.max(2, Math.ceil(edge.span / 12));
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const d = edge.start + (edge.end - edge.start) * (i / steps);
    const p = along(edge.path, d);
    pts.push([p[0], p[2]]);
  }
  return pts;
}

/**
 * Stitch ordered waypoint ids into a canonical R1 network route draft with
 * validation, shareable code, total distance, and 2D map preview polyline.
 */
export function buildCustomNetworkRoute(campus, waypointIds, network = networkForCampus(campus)) {
  if (!network) {
    return {
      valid: false,
      error: '当前地图暂不支持道路网点选建线。',
      campus,
      waypoints: [],
      edges: [],
      totalLength: 0,
      minimum: 0,
      maximum: 0,
      route: null,
      code: null,
      polyline: [],
    };
  }

  const waypoints = Array.isArray(waypointIds) ? waypointIds.filter(id => Boolean(network.points?.[id])) : [];
  if (waypoints.length < 2) {
    const formatError = waypoints.length ? null
      : format => format`请点击至少 2 个路口（上限 ${network.maximum} 米、${routeRules.maxEdges} 段道路）。`;
    return {
      valid: false,
      error: formatError ? formatError(String.raw) : '请再点击地图上的下一个路口或地标作为终点。',
      formatError,
      campus,
      waypoints,
      edges: [],
      totalLength: 0,
      minimum: network.minimum,
      maximum: network.maximum,
      route: null,
      code: null,
      polyline: waypoints.length ? [network.points[waypoints[0]].slice()] : [],
    };
  }

  const stitched = [];
  const usedEdgeIds = new Set();
  for (let i = 1; i < waypoints.length; i++) {
    if (waypoints[i] === waypoints[i - 1]) continue;
    const leg = shortestNetworkLeg(network, waypoints[i - 1], waypoints[i], {
      prevEdge: stitched.at(-1) ?? null,
      usedEdgeIds,
    });
    if (!leg?.length) {
      return {
        valid: false,
        error: '这两个路口之间无法顺畅连线，请换一个邻近路口。',
        campus,
        waypoints,
        edges: stitched.map(edge => ({ id: edge.id, direction: 1 })),
        totalLength: Math.round(stitched.reduce((sum, edge) => sum + edge.span, 0)),
        minimum: network.minimum,
        maximum: network.maximum,
        route: null,
        code: null,
        polyline: stitched.flatMap(sampleEdgePolyline),
      };
    }
    for (const edge of leg) {
      stitched.push(edge);
      usedEdgeIds.add(edge.id.endsWith('r') ? edge.id.slice(0, -1) : edge.id);
    }
  }

  const edges = stitched.map(edge => ({ id: edge.id, direction: 1 }));
  const polyline = [];
  for (const edge of stitched) {
    for (const pt of sampleEdgePolyline(edge)) {
      const prev = polyline.at(-1);
      if (!prev || Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) > 0.5) polyline.push(pt);
    }
  }

  const routeSpec = {
    schemaVersion: 1,
    campus,
    source: 'network',
    networkRevision: routeNetworkRevision(campus),
    edges,
    variant: { direction: 'forward', laps: 1 },
  };
  const validation = validateRouteRef(routeSpec, { networkFor: () => network });
  // The joined path accounts for the bends between road edges.
  const length = validation.valid
    ? joinTrack(stitched).length
    : stitched.reduce((sum, edge) => sum + edge.span, 0);
  const totalLength = Math.round(length);
  let formatError = null;
  if (edges.length > routeRules.maxEdges) {
    formatError = format => format`当前路线有 ${edges.length} 段道路（上限 ${routeRules.maxEdges} 段），请撤销几段。`;
  } else if (length < network.minimum) {
    formatError = format => format`当前路线仅 ${Math.floor(length)} 米（需至少 ${network.minimum} 米），请继续选点。`;
  } else if (length > network.maximum) {
    formatError = format => format`当前路线 ${Math.ceil(length)} 米超出上限（${network.maximum} 米），请撤销几段。`;
  }
  let error = formatError ? formatError(String.raw) : validation.error;
  const code = !error ? encodeRouteCode(validation.route) : null;
  if (!error && !code) error = '路线过长无法生成分享码，请适当精简拐点。';

  return {
    valid: Boolean(validation.valid && code),
    error,
    formatError,
    campus,
    waypoints,
    edges,
    totalLength,
    minimum: network.minimum,
    maximum: network.maximum,
    route: validation.route,
    code,
    polyline,
  };
}
