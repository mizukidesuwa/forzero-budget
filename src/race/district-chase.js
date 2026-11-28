// @ts-check
import { mix } from '../core/math.js';
import { districtChaseRules } from '../data/modes.js';
import { buildingAt } from '../world/query.js';

/** @typedef {{triggered: boolean, clueId: string | null}} DistrictChaseView */
/** @typedef {import('./online-chase.js').OnlineChaseActiveSnapshot} ChaseSnapshot */
/** @typedef {import('./online-chase.js').OnlineChaseRemoteRider} RemoteRider */
/** @typedef {import('./online-chase.js').OnlineChasePeerEvaluation} PeerEvaluation */

/**
 * @param {readonly number[]} from
 * @param {readonly number[]} to
 * @returns {{distance: number, visible: boolean}}
 */
export function districtChaseContact(from,to) {
  const rules = districtChaseRules;
  const distance = Math.hypot(to[0]-from[0],to[2]-from[2]);
  if (distance>rules.revealDistance || Math.abs(to[1]-from[1])>rules.catchHeight) return {distance,visible:false};
  const steps = Math.max(2,Math.ceil(distance/rules.sightStep));
  for (let i=1;i<steps;i++) {
    const t = i/steps;
    const x = mix(from[0],to[0],t), z = mix(from[2],to[2],t);
    const y = mix(from[1],to[1],t)+rules.sightHeight;
    if (buildingAt(x,z,0,y,rules.campus)) return {distance,visible:false};
  }
  return {distance,visible:true};
}

/**
 * @param {ChaseSnapshot} snap
 * @param {{id:string,ms:number} | null | undefined} trigger
 * @param {readonly number[] | null | undefined} selfPos
 * @param {readonly RemoteRider[] | null | undefined} remoteRiders
 * @returns {PeerEvaluation}
 */
export function evaluateDistrictChase(snap,trigger,selfPos,remoteRiders) {
  const playing = snap.phase==='race' && !snap.hunterLocked && !snap.isCaught && snap.remainingMs>0;
  const remote = playing ? remoteRiders?.find(r=>!snap.retiredIds.has(r.id)) : null;
  const contact = selfPos && remote ? districtChaseContact(selfPos,remote.position) : null;
  const clueId = trigger && snap.role==='hunter' && snap.elapsedMs-trigger.ms<districtChaseRules.clueMs ? trigger.id : null;
  return {
    snap,
    district:{triggered:Boolean(trigger),clueId},
    visibleRiders:remote && contact?.visible?[remote]:[],
    radarPings:[],
    proximity:contact?.visible?'locked':'far',
    nearestDistance:contact?.distance??Infinity,
    catchCandidate:snap.role==='hunter' && remote && contact?.visible && contact.distance<=districtChaseRules.catchDistance
      ? {id:remote.id,name:remote.name,distance:contact.distance} : null,
  };
}
