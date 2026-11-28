// @ts-check

/** @typedef {{id: string, name: string}} Rider */
/** @typedef {{id: string, role: 'hunter' | 'runner', ms: number | null, won: boolean, retired: boolean}} DistrictResult */
/** @typedef {Rider & {wins: number, points: number, finishes: number, time: number}} Standing */

/**
 * @param {readonly Rider[]} roster
 * @param {string} hunterId
 * @param {string} winnerId
 * @param {number} ms
 * @param {string | null} retiredId
 * @returns {DistrictResult[]}
 */
function districtChaseResults(roster,hunterId,winnerId,ms,retiredId) {
  return roster.map(({id})=>({
    id, role:id===hunterId?'hunter':'runner', ms:id===retiredId?null:ms,
    won:id===winnerId, retired:id===retiredId,
  }));
}

/**
 * @param {readonly Rider[]} roster
 * @param {readonly {results: readonly DistrictResult[]}[]} history
 * @returns {{standing: Standing[], leaders: string[]}}
 */
function tallyDistrictChase(roster,history) {
  const totals = new Map(roster.map(({id,name})=>[id,{id,name,wins:0,points:0,finishes:0,time:0}]));
  for (const round of history) {
    for (const result of round.results) {
      const total = totals.get(result.id);
      if (!total || !result.won) continue;
      total.wins++;
      total.points++;
      total.finishes++;
      total.time += result.ms ?? 0;
    }
  }
  const standing = [...totals.values()].sort((a,b)=>b.wins-a.wins);
  const leaders = standing.filter(player=>player.wins>0&&player.wins===standing[0].wins).map(player=>player.id);
  return {standing,leaders};
}

module.exports = {districtChaseResults,tallyDistrictChase};
