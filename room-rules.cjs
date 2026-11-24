const {randomBytes}=require('node:crypto');
const tuning190=require('./tuning-190.cjs');
const ROOM_ROUNDS = {bo1:1,bo3:3,league:5,random:3,triathlon:3};
const TRIATHLON_VEHICLES = ['bike','chair','trail'];

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
  const totals = new Map(room.roster.map(({id,name})=>[id,{id,name,wins:0,points:0,finishes:0,time:0}]));
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
  if (room.format==='triathlon' && room.phase==='between') {
    room.vehicleRule = TRIATHLON_VEHICLES[room.history.length % TRIATHLON_VEHICLES.length];
  }
  room.winners = room.phase==='done'?leaders:[];
  for (const player of room.players.values()) player.ready = false;
}

function retire(room,id) {
  if (room.phase!=='race'||room.round.results.some(result=>result.id===id)) return;
  room.round.results.push({id,ms:null});
  settle(room);
}

function beginTuning(room,now) {
  if (room.phase==='lobby' || !room.roster?.length) room.roster = [...room.players.values()].map(({id,name})=>({id,name}));
  if (room.format==='triathlon') room.vehicleRule = TRIATHLON_VEHICLES[room.history.length % TRIATHLON_VEHICLES.length];
  const seconds = Math.max(0, Math.min(180, Math.round(Number(room.tuningSeconds ?? 0))))||(room.blind?30:0);
  const seed=randomBytes(4).readUInt32LE();
  const budget=room.blind?blindBudget(seed,room.budget):tuning190.budgetLimit(room.budget);
  room.tuning = {seconds,endsAt:now+seconds*1000,seed,budget};
  room.round = null;
  room.phase = 'tuning';
  for (const player of room.players.values()) player.ready = false;
}

function beginRoomRound(room,now) {
  if(room.format==='triathlon') room.vehicleRule=TRIATHLON_VEHICLES[room.history.length%TRIATHLON_VEHICLES.length];
  const blocked=roomBudgetProblems(room);
  if(blocked.length) {
    if(room.tuning) room.tuning.endsAt=null;
    return blocked;
  }
  if (room.phase==='lobby' || !room.roster?.length || room.history.length===0) {
    room.roster = [...room.players.values()].map(({id,name})=>({id,name}));
  }
  const budget=room.tuning?.budget??tuning190.budgetLimit(room.budget);
  const blindSeed=room.blind?room.tuning?.seed??null:null;
  room.tuning = null;
  const goAt = now+5000;
  room.round = {number:room.history.length+1,goAt,deadline:goAt+20*60_000,
    trafficSeed:randomBytes(4).readUInt32LE(),
    windSeed:randomBytes(4).readUInt32LE(),windMode:room.windMode,budget,blindSeed,
    builds:Object.fromEntries([...room.players.values()].map(player=>[player.id,{
      vehicle:roomVehicle(room,player),parts:roomParts(room,player)
    }])),
    results:room.roster.filter(player=>!room.players.has(player.id)).map(({id})=>({id,ms:null}))};
  room.phase = 'race';
  return [];
}

module.exports = {ROOM_ROUNDS,TRIATHLON_VEHICLES,tally,settle,retire,beginTuning,beginRoomRound,
  roomVehicle,roomParts,roomBuildProblem,roomBudgetProblems,blindBudget};
