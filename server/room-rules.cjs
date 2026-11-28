const {randomBytes}=require('node:crypto');
const tuning190=require('./tuning-190.cjs');
const {ONLINE_CHASE_RULES,DISTRICT_CHASE_RULES,isChaseFormat}=require('./shared-rules.cjs');
const {districtChaseResults,tallyDistrictChase}=require('./district-chase.cjs');
const ALL_ROUND_VEHICLES = Object.freeze(['bike','ebike','chair','trail']);
const ROOM_ROUNDS = {bo1:1,bo3:3,league:5,random:3,triathlon:ALL_ROUND_VEHICLES.length,chase:ONLINE_CHASE_RULES.rounds,
  [DISTRICT_CHASE_RULES.format]:DISTRICT_CHASE_RULES.rounds};

/** @typedef {'escaped' | 'caught' | 'timeout' | 'retired'} DistrictResult */
/** @typedef {{phase: string, format: string, roster: import('./district-chase.cjs').Rider[], round: {
 *  chase: {hunterId: string, settledReason: DistrictResult | null}, results: import('./district-chase.cjs').DistrictResult[]
 * }}} DistrictRoundRoom */

/** @param {{stream?: {destroyed?: boolean, writableEnded?: boolean} | null}} player */
function roomPlayerOnline({stream}) {
  return Boolean(stream && !stream.destroyed && !stream.writableEnded);
}

/** @param {{players: Map<string, Parameters<typeof roomPlayerOnline>[0]>}} room */
function roomRosterOnline(room) {
  return room.players.size >= 2 && [...room.players.values()].every(roomPlayerOnline);
}

function lockRoomVehicle(room) {
  if (room.format === 'triathlon') {
    room.vehicleRule = ALL_ROUND_VEHICLES[Math.min(room.history.length, ALL_ROUND_VEHICLES.length - 1)];
  }
}

function roomVehicle(room,player) {
  return room.vehicleRule==='any'?player.vehicle:room.vehicleRule;
}

function roomParts(room,player) {
  const vehicle=roomVehicle(room,player);
  return vehicle==='bike'?player.bike:player.tunings?.[vehicle]??player.tuning;
}

function roomBuildProblem(room,player) {
  return tuning190.violation(roomVehicle(room,player),roomParts(room,player),room.budget,
    room.tuning?.budget??tuning190.budgetLimit(room.budget));
}

function roomBudgetProblems(room) {
  return [...room.players.values()].flatMap(player=>{
    const reason=roomBuildProblem(room,player);
    return reason?[{id:player.id,name:player.name,reason}]:[];
  });
}

function blindBudget(seed,policy) {
  const tiers=tuning190.blindBudgetTiers;
  const cap=tuning190.budgetLimit(policy)??tiers.at(-1);
  const choices=tiers.filter(limit=>limit<=cap);
  return choices[(seed>>>0)%choices.length];
}

function tally(room) {
  if (room.format === DISTRICT_CHASE_RULES.format) {
    const {standing,leaders} = tallyDistrictChase(room.roster,room.history);
    room.standing = standing;
    return leaders;
  }
  const totals = new Map(room.roster.map(({id,name})=>[id,{id,name,wins:0,points:0,finishes:0,time:0}]));
  if (room.format === 'chase') {
    for (const round of room.history) {
      const chase = round.chase;
      const caughtCount = chase ? Object.keys(chase.caught ?? {}).length : 0;
      const sweep = chase?.settledReason === 'sweep' && caughtCount > 0;
      for (const result of round.results) {
        const total = totals.get(result.id);
        if (!total || result.retired) continue;
        if (result.role === 'hunter') {
          total.points += caughtCount * ONLINE_CHASE_RULES.pointsPerCatch + (sweep ? ONLINE_CHASE_RULES.sweepBonus : 0);
          if (sweep) {
            total.wins += 1;
            total.finishes += 1;
            if (result.ms != null) total.time += result.ms;
          }
        } else if (result.survived) {
          total.points += ONLINE_CHASE_RULES.survivePoints;
          total.wins += 1;
          total.finishes += 1;
          total.time += result.ms ?? 0;
        } else if (result.caughtAt != null) {
          if (result.caughtAt >= ONLINE_CHASE_RULES.halfSurviveMs) total.points += ONLINE_CHASE_RULES.halfSurvivePoints;
          total.time += result.caughtAt;
        }
      }
    }
    const compare = (a, b) => (b.points - a.points) || (b.wins - a.wins) || (b.finishes - a.finishes) || (a.time - b.time) || a.id.localeCompare(b.id);
    room.standing = [...totals.values()].sort(compare);
    return room.standing.filter(player => (player.points > 0 || player.finishes > 0) && compare(player, room.standing[0]) === 0).map(player => player.id);
  }
  for (const round of room.history) {
    const finishers = round.results.filter(result=>result.ms!==null).sort((a,b)=>a.ms-b.ms);
    let rank = 0;
    for (const [index,result] of finishers.entries()) {
      if (index && result.ms!==finishers[index-1].ms) rank = index;
      const total = totals.get(result.id);
      total.finishes++;
      total.wins += Number(rank===0);
      total.points += room.roster.length-rank;
      total.time += result.ms;
    }
  }
  const compare = (a,b) => {
    const wins = b.wins-a.wins, points = b.points-a.points;
    return ((room.format==='league'||room.format==='random'||room.format==='triathlon')?points||wins:wins||points) || b.finishes-a.finishes || a.time-b.time;
  };
  room.standing = [...totals.values()].sort(compare);
  return room.standing.filter(player=>player.finishes>0 && compare(player,room.standing[0])===0).map(player=>player.id);
}

function settle(room) {
  if (room.phase!=='race' || room.round.results.length<room.roster.length) return;
  room.history.push(room.round);
  const leaders = tally(room);
  const count = room.history.length;
  const remaining = ROOM_ROUNDS[room.format]-count;
  const byWins = room.standing.map(player=>player.wins).sort((a,b)=>b-a);
  const clinched = room.format==='bo3' && byWins[0]>byWins[1]+remaining;
  room.phase = (remaining===0 || clinched || room.players.size<2)?'done':'between';
  if (room.phase === 'between') lockRoomVehicle(room);
  room.winners = room.phase==='done'?leaders:[];
  for (const player of room.players.values()) player.ready = false;
}

/**
 * @param {DistrictRoundRoom} room
 * @param {DistrictResult} reason
 * @param {string} winnerId
 * @param {number} ms
 * @param {string | null} [retiredId]
 * @returns {boolean}
 */
function settleDistrictRound(room, reason, winnerId, ms, retiredId = null) {
  if (room.phase !== 'race' || room.format !== DISTRICT_CHASE_RULES.format || !room.round?.chase) return false;
  const chase = room.round.chase;
  chase.settledReason = reason;
  room.round.results = districtChaseResults(room.roster,chase.hunterId,winnerId,ms,retiredId);
  settle(room);
  return true;
}

function settleChaseRound(room, timedOut = false) {
  if (room.phase !== 'race' || !isChaseFormat(room.format) || !room.round?.chase) return false;
  const chase = room.round.chase;
  if (room.format === DISTRICT_CHASE_RULES.format) {
    return settleDistrictRound(room,timedOut?'timeout':'caught',chase.hunterId,
      timedOut?chase.durationMs:Object.values(chase.caught)[0]);
  }
  chase.settledReason = timedOut ? 'timeout' : 'sweep';
  const retiredSet = new Set(room.round.results.filter(r => r.retired || r.ms === null).map(r => r.id));
  const caughtEntries = Object.values(chase.caught);
  const maxCatchMs = caughtEntries.length ? Math.max(...caughtEntries) : null;
  room.round.results = room.roster.map(({ id }) => {
    const role = id === chase.hunterId ? 'hunter' : 'runner';
    const caughtAt = chase.caught[id] ?? null;
    if (retiredSet.has(id)) {
      return { id, role, caughtAt, ms: null, retired: true, survived: false };
    }
    if (role === 'hunter') {
      return { id, role, caughtAt: null, ms: timedOut ? null : maxCatchMs, survived: false };
    }
    const survived = caughtAt === null;
    return { id, role, caughtAt, ms: survived ? chase.durationMs : caughtAt, survived };
  });
  settle(room);
  return true;
}

function tagChaseRunner(room, hunterId, targetId, ms) {
  if (room.phase !== 'race' || !isChaseFormat(room.format) || !room.round?.chase) return false;
  const chase = room.round.chase;
  if (chase.hunterId !== hunterId || targetId === hunterId) return false;
  if (!room.roster.some(player => player.id === targetId)) return false;
  const retiredSet = new Set(room.round.results.filter(r => r.retired || r.ms === null).map(r => r.id));
  if (retiredSet.has(targetId) || retiredSet.has(hunterId)) return false;
  if (chase.caught[targetId] !== undefined) return false;
  chase.caught[targetId] = ms;
  const activeRunners = room.roster.filter(player => player.id !== chase.hunterId && !retiredSet.has(player.id));
  if (activeRunners.every(player => chase.caught[player.id] !== undefined)) {
    settleChaseRound(room, false);
  }
  return true;
}

function retire(room,id) {
  if (room.phase!=='race'||room.round.results.some(result=>result.id===id)) return;
  if (room.format===DISTRICT_CHASE_RULES.format && room.round?.chase) {
    if (!room.roster.some(player=>player.id===id)) return;
    const opponent = room.roster.find(player=>player.id!==id);
    if (opponent) {
      const elapsed = Math.max(0,Math.min(room.round.chase.durationMs,Date.now()-room.round.goAt));
      settleDistrictRound(room,'retired',opponent.id,elapsed,id);
    }
    return;
  }
  if (room.format === 'chase' && room.round?.chase) {
    room.round.results.push({ id, ms: null, retired: true });
    const chase = room.round.chase;
    const retiredSet = new Set(room.round.results.filter(r => r.retired || r.ms === null).map(r => r.id));
    if (id === chase.hunterId) {
      settleChaseRound(room, true);
      return;
    }
    const activeRunners = room.roster.filter(player => player.id !== chase.hunterId && !retiredSet.has(player.id));
    if (!activeRunners.length || activeRunners.every(player => chase.caught[player.id] !== undefined)) {
      settleChaseRound(room, false);
    }
    return;
  }
  room.round.results.push({id,ms:null});
  settle(room);
}

function beginTuning(room,now) {
  if (room.phase==='lobby' || !room.roster?.length) room.roster = [...room.players.values()].map(({id,name})=>({id,name}));
  lockRoomVehicle(room);
  const seconds = Math.max(0, Math.min(180, Math.round(Number(room.tuningSeconds ?? 0))))||(room.blind?30:0);
  const seed=randomBytes(4).readUInt32LE();
  const budget=room.blind?blindBudget(seed,room.budget):tuning190.budgetLimit(room.budget);
  room.tuning = {seconds,endsAt:now+seconds*1000,seed,budget};
  room.round = null;
  room.phase = 'tuning';
  for (const player of room.players.values()) player.ready = false;
}

/**
 * @param {{ format: string, phase: string, roster?: { id: string }[], players: Map<string, { id: string }>,
 *   history: { chase?: { hunterId: string } }[] }} room
 * @param {{ id: string }[]} [roster]
 * @returns {string | null}
 */
function nextChaseHunterId(room, roster = room.roster?.length ? room.roster : [...room.players.values()]) {
  if (!isChaseFormat(room.format) || room.phase === 'done') return null;
  const previous = roster.findIndex(player => player.id === room.history.at(-1)?.chase?.hunterId);
  for (let offset = 1; offset <= roster.length; offset++) {
    const { id } = roster[(previous + offset) % roster.length];
    if (room.players.has(id)) return id;
  }
  return null;
}

/** @returns {{kind: 'connections' | 'budget', message: string} | null} */
function beginRoomRound(room,now) {
  const players = [...room.players.values()];
  const roster = room.phase==='lobby' || !room.roster?.length || room.history.length===0
    ? players.map(({id,name})=>({id,name})) : room.roster;
  const isChase = isChaseFormat(room.format);
  const district = room.format === DISTRICT_CHASE_RULES.format;
  const chaseRules = district ? DISTRICT_CHASE_RULES : ONLINE_CHASE_RULES;
  const hunterId = nextChaseHunterId(room,roster);
  if (!roomRosterOnline(room) || (district && players.length!==DISTRICT_CHASE_RULES.players) ||
      (isChase && (!hunterId || !roster.some(({id})=>id!==hunterId&&room.players.has(id))))) {
    return {kind:'connections',message:'等待骑手重连后再发车。'};
  }
  lockRoomVehicle(room);
  const blocked=roomBudgetProblems(room);
  if(blocked.length) {
    if(room.tuning) room.tuning.endsAt=null;
    return {kind:'budget',message:blocked.map(({name,reason})=>name+'：'+reason).join('；')};
  }
  room.roster = roster;
  const budget=room.tuning?.budget??tuning190.budgetLimit(room.budget);
  const blindSeed=room.blind?room.tuning?.seed??null:null;
  room.tuning = null;
  const goAt = now+5000;
  const number = room.history.length+1;
  room.roundSerial = (room.roundSerial ?? 0) + 1;
  const poseNumber = players.every(player=>player.roundIdentity) ? room.roundSerial & 0xffff : number;
  room.round = {number,id:`${room.matchId}:${number}`,poseNumber,goAt,deadline:goAt+(isChase?chaseRules.durationMs:20*60_000),
    trafficSeed:randomBytes(4).readUInt32LE(),
    windSeed:randomBytes(4).readUInt32LE(),windMode:room.windMode,budget,blindSeed,
    ...(isChase ? {
      chase: {
        hunterId,
        headStartMs: chaseRules.headStartMs,
        durationMs: chaseRules.durationMs,
        caught: {},
        settledReason: null,
        ...(district ? {trigger:null,exit:null} : {}),
      },
    } : {}),
    builds:Object.fromEntries(players.map(player=>[player.id,{
      vehicle:roomVehicle(room,player),parts:roomParts(room,player)
    }])),
    results:room.roster.filter(player=>!room.players.has(player.id)).map(({id})=>isChase?{id,ms:null,retired:true}:{id,ms:null})};
  room.phase = 'race';
  return null;
}

module.exports = {ROOM_ROUNDS,ALL_ROUND_VEHICLES,ONLINE_CHASE_RULES,lockRoomVehicle,tally,settle,settleChaseRound,settleDistrictRound,tagChaseRunner,retire,beginTuning,beginRoomRound,nextChaseHunterId,
  roomVehicle,roomParts,roomBuildProblem,roomBudgetProblems,blindBudget,roomPlayerOnline,roomRosterOnline};
