import { clamp } from '../core/math.js';
import { onlineChaseRules } from '../data/modes.js';

export function isOnlineChaseRoom(session) {
  return Boolean(session?.state?.format === 'chase');
}

export function onlineChaseNextHunterId(state) {
  if (!state || state.format !== 'chase') return null;
  if (state.phase === 'race' && state.round?.chase?.hunterId) return state.round.chase.hunterId;
  const list = state.roster?.length ? state.roster : state.players;
  if (!list?.length) return null;
  const idx = (state.history?.length ?? 0) % list.length;
  return list[idx].id;
}

export function onlineChaseSnapshot(session, now = performance.now()) {
  if (!isOnlineChaseRoom(session)) return null;
  const state = session.state;
  const round = state.round;
  const chase = round?.chase;
  if (state.phase !== 'race' || !round || !chase) {
    return {
      active: false,
      phase: state.phase,
      hunterId: onlineChaseNextHunterId(state),
      role: onlineChaseNextHunterId(state) === session.id ? 'hunter' : 'runner',
    };
  }
  const serverNow = now + (session.serverOffset ?? 0);
  const countdownMs = Math.max(0, round.goAt - serverNow);
  const elapsedMs = Math.max(0, serverNow - round.goAt);
  const headStartMs = chase.headStartMs ?? onlineChaseRules.headStartMs;
  const durationMs = chase.durationMs ?? onlineChaseRules.durationMs;
  const headStartRemainingMs = Math.max(0, headStartMs - elapsedMs);
  const remainingMs = Math.max(0, durationMs - elapsedMs);
  const role = chase.hunterId === session.id ? 'hunter' : 'runner';
  const caughtMap = chase.caught ?? {};
  const isCaught = role === 'runner' && caughtMap[session.id] !== undefined;
  const rosterIds = state.roster?.length ? state.roster.map(p => p.id) : state.players.map(p => p.id);
  const totalRunners = Math.max(1, rosterIds.filter(id => id !== chase.hunterId).length);
  const caughtCount = Object.keys(caughtMap).length;
  return {
    active: true,
    phase: countdownMs > 0 ? 'count' : 'race',
    role,
    hunterId: chase.hunterId,
    caughtMap,
    isCaught,
    selfCaughtAt: isCaught ? caughtMap[session.id] : null,
    totalRunners,
    caughtCount,
    countdownMs,
    elapsedMs,
    remainingMs,
    headStartRemainingMs,
    hunterLocked: countdownMs === 0 && role === 'hunter' && headStartRemainingMs > 0,
    settledReason: chase.settledReason ?? null,
  };
}

/**
 * Compute asymmetric 3D visibility, proximity radar rings, and tag detection
 * for Online Chase without mutating game physics or DOM.
 */
export function evaluateOnlineChasePeers(session, selfPos, remoteRiders, now, {
  landmarkAt = null,
  pingCache = null,
} = {}) {
  const snap = onlineChaseSnapshot(session, now);
  if (!snap?.active || !selfPos) {
    return {
      snap,
      visibleRiders: remoteRiders ?? [],
      radarPings: [],
      proximity: 'far',
      nearestDistance: Infinity,
      catchCandidate: null,
    };
  }

  const campus = session.course?.campus ?? session.state.route?.campus ?? 'szu';
  const caughtMap = snap.caughtMap;
  const visibleRiders = [];
  const radarPings = [];
  let nearestDistance = Infinity;
  let catchCandidate = null;
  const pingDue = pingCache && (now - (pingCache.lastAt ?? -Infinity) >= onlineChaseRules.pingIntervalMs);
  if (pingDue) {
    pingCache.lastAt = now;
    pingCache.byId = new Map();
  }

  for (const remote of remoteRiders ?? []) {
    const dx = remote.position[0] - selfPos[0];
    const dy = Math.abs(remote.position[1] - selfPos[1]);
    const dz = remote.position[2] - selfPos[2];
    const dist = Math.hypot(dx, dz);

    if (snap.role === 'hunter') {
      if (caughtMap[remote.id] !== undefined) continue;
      if (dist < nearestDistance) nearestDistance = dist;
      const inReveal = dist <= onlineChaseRules.revealDistance;
      if (inReveal) {
        visibleRiders.push({
          ...remote,
          chaseRole: 'runner',
          chaseDistance: dist,
          tagLabel: `${remote.name} · ${Math.round(dist)}m`,
        });
      }
      if (!snap.hunterLocked && dist <= onlineChaseRules.catchDistance && dy <= onlineChaseRules.catchHeight) {
        if (!catchCandidate || dist < catchCandidate.distance) {
          catchCandidate = { id: remote.id, name: remote.name, distance: dist };
        }
      }
      let ping = pingCache?.byId?.get(remote.id);
      if (!ping && pingDue) {
        ping = {
          id: remote.id,
          name: remote.name,
          position: remote.position.slice(),
          heading: remote.heading,
          speed: remote.speed ?? 0,
          atMs: now,
          landmark: landmarkAt ? landmarkAt(campus, remote.position[0], remote.position[2]) : null,
        };
        pingCache.byId.set(remote.id, ping);
      }
      if (ping || inReveal) {
        const src = inReveal ? {
          id: remote.id,
          name: remote.name,
          position: remote.position.slice(),
          heading: remote.heading,
          speed: remote.speed ?? 0,
          atMs: now,
          landmark: ping?.landmark ?? null,
        } : ping;
        radarPings.push({
          ...src,
          ageMs: inReveal ? 0 : Math.max(0, now - src.atMs),
          fadeMs: onlineChaseRules.pingFadeMs,
          role: 'runner',
        });
      }
    } else {
      if (remote.id === snap.hunterId) {
        if (dist < nearestDistance) nearestDistance = dist;
        if (dist <= onlineChaseRules.terrorDistance || snap.isCaught) {
          visibleRiders.push({
            ...remote,
            chaseRole: 'hunter',
            chaseDistance: dist,
            tagLabel: `捉人者 · ${Math.round(dist)}m`,
          });
        }
        let ping = pingCache?.byId?.get(remote.id);
        if (!ping && pingDue) {
          ping = {
            id: remote.id,
            name: remote.name,
            position: remote.position.slice(),
            heading: remote.heading,
            speed: remote.speed ?? 0,
            atMs: now,
            landmark: landmarkAt ? landmarkAt(campus, remote.position[0], remote.position[2]) : null,
          };
          pingCache.byId.set(remote.id, ping);
        }
        const src = dist <= onlineChaseRules.terrorDistance ? {
          id: remote.id,
          name: remote.name,
          position: remote.position.slice(),
          heading: remote.heading,
          speed: remote.speed ?? 0,
          atMs: now,
          landmark: ping?.landmark ?? null,
        } : ping;
        if (src) {
          radarPings.push({
            ...src,
            ageMs: dist <= onlineChaseRules.terrorDistance ? 0 : Math.max(0, now - src.atMs),
            fadeMs: onlineChaseRules.pingFadeMs,
            role: 'hunter',
          });
        }
      } else if (caughtMap[remote.id] === undefined) {
        visibleRiders.push({ ...remote, chaseRole: 'runner', chaseDistance: dist });
      }
    }
  }

  const revealCutoff = snap.role === 'hunter' ? onlineChaseRules.revealDistance : 28;
  const terrorCutoff = onlineChaseRules.terrorDistance;
  const proximity = nearestDistance <= revealCutoff ? 'locked' : nearestDistance <= terrorCutoff ? 'near' : 'far';

  return {
    snap,
    visibleRiders,
    radarPings,
    proximity,
    nearestDistance: clamp(nearestDistance, 0, 9999),
    catchCandidate,
  };
}
