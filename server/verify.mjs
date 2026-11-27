import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';
import { createRideServer } from './server.mjs';
import tuning190 from './tuning-190.cjs';

const { protocol } = tuning190;

class Response extends Writable {
  chunks = [];
  writeHead(status,headers) { this.status=status; this.headers=headers; return this; }
  flushHeaders() {}
  _write(chunk,_encoding,callback) { this.chunks.push(chunk.toString()); callback(); }
  state() {
    const event = this.chunks.findLast(chunk=>chunk.startsWith('event: room\n'));
    return event && JSON.parse(event.split('\n')[1].slice(6));
  }
}

const server = createRideServer({page:Buffer.from('test html'),iceServers:[],
  turn:{urls:['turn:example.test:3478'],secret:'test-only'}});
let time = Date.now();
const realNow = Date.now;
Date.now = ()=>time;

function emit(method,url,body,token) {
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  Object.assign(req,{method,url,complete:true,headers:{'content-type':'application/json',authorization:'Bearer '+token}});
  const res = new Response();
  server.emit('request',req,res);
  return res;
}

async function request(method,url,body,token,status=200) {
  const response = emit(method,url,body,token);
  await new Promise(resolve=>response.once('finish',resolve));
  const data = JSON.parse(response.chunks.join(''));
  assert.equal(response.status,status,JSON.stringify(data));
  return data;
}

const route = {campus:'ucl',id:'seed-U2-326',seed:'U2-326',layout:'0123abcd'};
async function enter(name,format,code) {
  const payload = code ? {code} : {format,route};
  const result = await request('POST','/online/rooms',{name,protocol,...payload});
  const url = '/online/rooms/'+result.room.code;
  const eventURL = url+'/events?id='+result.id+'&token='+result.token;
  const stream = emit('GET',eventURL);
  assert.equal(stream.status,200);
  return {...result,stream,eventURL,url,command:{url:url+'/command?id='+result.id,token:result.token}};
}

function command(player,action,details={},status=200) {
  return request('POST',player.command.url,{action,...details},player.token,status);
}

async function race(players,times,{checkEarly=false}={}) {
  const host = players[0];
  await Promise.all(players.map(player=>command(player,'ready',{ready:true})));
  await command(host,'start');
  const {round} = host.stream.state();
  if (checkEarly) await command(host,'finish',{round:round.number,ms:times[0]},409);
  time = round.goAt+Math.max(...times)+150;
  await Promise.all(players.map((player,index)=>times[index]===null ? command(player,'retire',{round:round.number}) :
    command(player,'finish',{round:round.number,ms:times[index]})));
  return host.stream.state();
}

try {
  const legacyBuild = await request('POST','/online/rooms',{name:'Old',protocol:3,format:'bo1',route},undefined,400);
  assert.match(JSON.stringify(legacyBuild), /协议 v4/);
  await request('POST','/online/rooms',{name:'A',protocol,format:'bo1',route:{...route,seed:'S2-326'}},undefined,400);
  const a = await enter('甲','bo1');
  const b = await enter('乙',null,a.room.code);
  const c = await enter('丙',null,a.room.code);
  const d = await enter('丁',null,a.room.code);
  assert.match(a.iceServers[0].username,new RegExp(':'+a.id+'$'));
  assert.ok(a.iceServers[0].credential);
  await request('POST','/online/rooms',{name:'E',protocol,code:a.room.code},undefined,409);
  await request('POST',a.command.url,{action:'start'},'invalid',403);
  await command(b,'start',{},409);
  await command(a,'start',{},409);
  await command(a,'signal',{to:b.id,data:{type:'offer',sdp:'test offer'}});
  assert.ok(b.stream.chunks.some(chunk=>chunk.startsWith('event: signal\n')&&chunk.includes(a.id)));
  const first = await race([a,b,c,d],[35_000,35_000,40_000,null],{checkEarly:true});
  assert.deepEqual(first.standing.map(row=>[row.wins,row.points,row.finishes]),[[1,4,1],[1,4,1],[0,2,1],[0,0,0]]);
  assert.deepEqual(first.winners,[a.id,b.id]);
  assert.equal(first.phase,'done');

  const x = await enter('甲','bo3');
  const y = await enter('乙',null,x.room.code);
  const firstHeat = await race([x,y],[10_000,11_000]);
  assert.equal(firstHeat.phase,'between');
  await request('POST','/online/rooms',{name:'新',protocol,code:x.room.code},undefined,409);
  assert.equal((await race([x,y],[12_000,13_000])).phase,'done');
  assert.deepEqual(x.stream.state().winners,[x.id]);
  assert.equal(x.stream.state().history.length,2);

  const u = await enter('甲','bo3');
  const v = await enter('乙',null,u.room.code);
  await race([u,v],[10_000,11_000]);
  assert.equal((await race([u,v],[12_000,11_000])).phase,'between');
  assert.deepEqual((await race([u,v],[13_000,11_000])).winners,[v.id]);

  const i = await enter('冠军','league');
  const j = await enter('亚军',null,i.room.code);
  const k = await enter('第三',null,i.room.code);
  for (let round=0;round<5;round++) {
    const league = await race([i,j,k],round===2?[11_000,10_000,null]:[10_000,11_000,12_000]);
    assert.equal(league.history.length,round+1);
    assert.equal(league.phase,round===4?'done':'between');
  }
  assert.deepEqual(i.stream.state().standing.map(row=>row.points),[14,11,4]);
  assert.deepEqual(i.stream.state().winners,[i.id]);

  const oldHost = await enter('原房主','bo1');
  const newHost = await enter('新房主',null,oldHost.room.code);
  oldHost.stream.destroy();
  await new Promise(resolve=>oldHost.stream.once('close',resolve));
  assert.equal(newHost.stream.state().players.find(player=>player.id===oldHost.id).online,false);
  const reconnected = emit('GET',oldHost.eventURL);
  assert.equal(reconnected.state().players.find(player=>player.id===oldHost.id).online,true);
  await command(oldHost,'leave');
  assert.equal(newHost.stream.state().host,newHost.id);
  const expired = emit('GET',oldHost.eventURL);
  assert.equal(expired.status,204);

  const endA = await enter('A','bo1');
  const endB = await enter('B',null,endA.room.code);
  await Promise.all([endA,endB].map(player=>command(player,'ready',{ready:true})));
  await command(endA,'start');
  const {round} = endA.stream.state();
  time = round.goAt+40_000;
  await command(endA,'finish',{round:round.number,ms:25_000});
  await command(endA,'finish',{round:round.number,ms:10_000});
  time = round.deadline+1;
  await sleep(1650);
  assert.equal(endA.stream.state().phase,'done');
  assert.deepEqual(endA.stream.state().history[0].results,[{id:endA.id,ms:25_000},{id:endB.id,ms:null}]);

  const preflight = emit('OPTIONS','/online/rooms');
  await new Promise(resolve=>preflight.once('finish',resolve));
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers['Access-Control-Allow-Origin'],'*');
  assert.equal(preflight.headers['Access-Control-Allow-Private-Network'],'true');
  const hostInfo = await request('GET','/online/host-info');
  assert.ok(Number.isInteger(hostInfo.port) && Array.isArray(hostInfo.addresses));

  const assetServer = createRideServer({assets:{
    '/index.html':{contentType:'text/html; charset=utf-8',body:Buffer.from('<!doctype html><script src="game.js"></script>')},
    '/style.css':{contentType:'text/css; charset=utf-8',body:Buffer.from('body{margin:0}')},
    '/game.js':{contentType:'application/javascript; charset=utf-8',body:Buffer.from('window.ok=1;')},
  }});
  try {
    for (const [route,type,snippet] of [['/','text/html','game.js'],['/style.css','text/css','margin:0'],['/game.js','application/javascript','window.ok=1']]) {
      const req = Readable.from([]);
      Object.assign(req,{method:'GET',url:route,complete:true,headers:{}});
      const res = new Response();
      assetServer.emit('request',req,res);
      await new Promise(resolve=>res.once('finish',resolve));
      assert.equal(res.status,200);
      assert.ok(res.headers['Content-Type'].startsWith(type));
      assert.ok(res.chunks.join('').includes(snippet));
    }
  } finally {
    assetServer.emit('close');
  }

  await request('POST','/online/rooms',{name:'BadShunde',protocol,format:'bo1',route:{campus:'shunde',id:'seed-S2-123',seed:'S2-123',layout:'0123abcd'}},undefined,400);
  const shundeRoute = {campus:'shunde',id:'shunde-endurance',seed:null,layout:'deadbeef'};
  const tHostRes = await request('POST','/online/rooms',{name:'TuneH',protocol,vehicleRule:'any',traffic:'standard',format:'bo1',route:shundeRoute,tuningSeconds:2,collision:true,windSpeed:6.5,windDir:3});
  assert.equal(tHostRes.room.tuningSeconds,2);
  assert.equal(tHostRes.room.collision,true);
  assert.equal(tHostRes.room.windSpeed,6.5);
  assert.equal(tHostRes.room.windDir,3);
  assert.equal(tHostRes.room.route.campus,'shunde');
  const tUrl = '/online/rooms/'+tHostRes.room.code;
  const tHost = {...tHostRes,stream:emit('GET',tUrl+'/events?id='+tHostRes.id+'&token='+tHostRes.token),command:{url:tUrl+'/command?id='+tHostRes.id,token:tHostRes.token}};
  await command(tHost,'config',{windSpeed:8,windDir:5});
  assert.equal(tHost.stream.state().windSpeed,8);
  assert.equal(tHost.stream.state().windDir,5);
  assert.equal(tHostRes.room.traffic,'standard');
  await request('POST','/online/rooms',{name:'Old',protocol:2,code:tHostRes.room.code},undefined,400);
  const tGuestRes = await request('POST','/online/rooms',{name:'TuneG',protocol,code:tHostRes.room.code});
  const tGuest = {...tGuestRes,stream:emit('GET',tUrl+'/events?id='+tGuestRes.id+'&token='+tGuestRes.token),command:{url:tUrl+'/command?id='+tGuestRes.id,token:tGuestRes.token}};
  await Promise.all([tHost,tGuest].map(p=>command(p,'ready',{ready:true})));
  await command(tHost,'start');
  assert.equal(tHost.stream.state().phase,'tuning');
  assert.ok(tHost.stream.state().tuning.endsAt>time);
  await command(tGuest,'profile',{paint:'bay',vehicle:'ebike',bike:{tyres:'race',gears:'long',brakes:'power'},tuning:{motor:'standard'}});
  assert.equal(tHost.stream.state().players.find(p=>p.id===tGuest.id).tuning.motor,'standard');
  await command(tHost,'ready',{ready:true});
  assert.equal(tHost.stream.state().phase,'tuning');
  await command(tGuest,'ready',{ready:true});
  assert.equal(tHost.stream.state().phase,'race');
  assert.equal(tHost.stream.state().round.number,1);
  assert.equal(tGuest.stream.state().traffic,'standard');
  assert.ok(Number.isInteger(tHost.stream.state().round.trafficSeed));
  assert.equal(tGuest.stream.state().round.trafficSeed,tHost.stream.state().round.trafficSeed);
  assert.equal(tHost.stream.state().players.length,2);

  const aHostRes = await request('POST','/online/rooms',{name:'AutoH',protocol,format:'bo1',route:shundeRoute,tuningSeconds:1,collision:false});
  const aUrl = '/online/rooms/'+aHostRes.room.code;
  const aHost = {...aHostRes,stream:emit('GET',aUrl+'/events?id='+aHostRes.id+'&token='+aHostRes.token),command:{url:aUrl+'/command?id='+aHostRes.id,token:aHostRes.token}};
  const aGuestRes = await request('POST','/online/rooms',{name:'AutoG',protocol,code:aHostRes.room.code});
  const aGuest = {...aGuestRes,stream:emit('GET',aUrl+'/events?id='+aGuestRes.id+'&token='+aGuestRes.token),command:{url:aUrl+'/command?id='+aGuestRes.id,token:aGuestRes.token}};
  await Promise.all([aHost,aGuest].map(p=>command(p,'ready',{ready:true})));
  await command(aHost,'start');
  assert.equal(aHost.stream.state().phase,'tuning');
  time = aHost.stream.state().tuning.endsAt + 20;
  await sleep(650);
  assert.equal(aHost.stream.state().phase,'race');

  const sHostRes = await request('POST','/online/rooms',{name:'SkipH',protocol,format:'bo1',route:shundeRoute,tuningSeconds:45});
  const sUrl = '/online/rooms/'+sHostRes.room.code;
  const sHost = {...sHostRes,stream:emit('GET',sUrl+'/events?id='+sHostRes.id+'&token='+sHostRes.token),command:{url:sUrl+'/command?id='+sHostRes.id,token:sHostRes.token}};
  const sGuestRes = await request('POST','/online/rooms',{name:'SkipG',protocol,code:sHostRes.room.code});
  const sGuest = {...sGuestRes,stream:emit('GET',sUrl+'/events?id='+sGuestRes.id+'&token='+sGuestRes.token),command:{url:sUrl+'/command?id='+sGuestRes.id,token:sGuestRes.token}};
  await Promise.all([sHost,sGuest].map(p=>command(p,'ready',{ready:true})));
  await command(sHost,'start');
  assert.equal(sHost.stream.state().phase,'tuning');
  await command(sHost,'skipTuning');
  assert.equal(sHost.stream.state().phase,'race');

  const budgetHost=await enter('BudgetH','bo1');
  const budgetGuest=await enter('BudgetG',null,budgetHost.room.code);
  assert.equal(budgetHost.room.protocol,protocol);
  await command(budgetHost,'config',{budget:'400',blind:true,windMode:'steady'});
  await command(budgetGuest,'profile',{bike:{tyres:'race',gears:'long',frame:'aero'}});
  await Promise.all([budgetHost,budgetGuest].map(p=>command(p,'ready',{ready:true})));
  await command(budgetHost,'start');
  const tuning=budgetHost.stream.state().tuning;
  assert.ok([300,400].includes(tuning.budget));
  assert.equal(budgetGuest.stream.state().tuning.budget,tuning.budget);
  await command(budgetHost,'skipTuning',{},409);
  await command(budgetGuest,'ready',{ready:true},409);
  time=Math.max(time,tuning.endsAt)+300;
  await sleep(650);
  assert.equal(budgetHost.stream.state().phase,'tuning');
  assert.match(budgetGuest.stream.state().budgetProblems.find(entry=>entry.id===budgetGuest.id).reason,/超预算/);
  await command(budgetGuest,'profile',{bike:{tyres:'usedSlick',frame:'usedFrame'}});
  await command(budgetHost,'ready',{ready:true});
  await command(budgetGuest,'ready',{ready:true});
  const budgetRound=budgetHost.stream.state().round;
  assert.equal(budgetRound.budget,tuning.budget);
  assert.equal(budgetRound.blindSeed,tuning.seed);
  assert.equal(budgetRound.windMode,'steady');
  assert.equal(budgetRound.windSeed,budgetGuest.stream.state().round.windSeed);
  assert.equal(budgetRound.builds[budgetGuest.id].parts.tyres,'usedSlick');

  const allHost = await enter('AllH', 'triathlon');
  const allGuest = await enter('AllG', null, allHost.room.code);
  const entrants = [allHost, allGuest];
  const rotation = ['bike', 'ebike', 'chair', 'trail'];
  assert.equal(allHost.room.roundsTotal, 4);
  assert.deepEqual(allHost.room.vehicleRotation, rotation);
  await command(allHost, 'config', { budget: '400', tuningSeconds: 20, vehicleRule: 'any' });
  for (const [index, vehicle] of rotation.entries()) {
    assert.equal(allHost.stream.state().vehicleRule, vehicle);
    await Promise.all(entrants.map(player => command(player, 'ready', { ready: true })));
    await command(allHost, 'start');
    assert.equal(allGuest.stream.state().phase, 'tuning');
    assert.equal(allGuest.stream.state().vehicleRule, vehicle);
    if (vehicle === 'ebike') {
      await command(allGuest, 'profile', { tuning: { tyres: 'grip', motor: 'standard', brakes: 'disc' } });
      await command(allGuest, 'ready', { ready: true }, 409);
      assert.match(allHost.stream.state().budgetProblems[0].reason, /超预算/);
      await command(allGuest, 'profile', { tuning: { motor: 'standard' } });
    }
    await Promise.all(entrants.map(player => command(player, 'ready', { ready: true })));
    const { round } = allHost.stream.state();
    assert.equal(round.number, index + 1);
    assert.equal(round.budget, 400);
    assert.equal(allGuest.stream.state().round.trafficSeed, round.trafficSeed);
    for (const player of entrants) assert.equal(round.builds[player.id].vehicle, vehicle);
    if (vehicle === 'ebike') {
      assert.equal(round.builds[allHost.id].parts.motor, 'stock');
      assert.equal(round.builds[allGuest.id].parts.motor, 'standard');
    }
    time = round.goAt + 12_000;
    await command(allHost, 'finish', { round: round.number, ms: 10_000 });
    await command(allGuest, 'finish', { round: round.number, ms: 11_000 });
    assert.equal(allHost.stream.state().phase, index === 3 ? 'done' : 'between');
  }
  assert.deepEqual(allHost.stream.state().winners, [allHost.id]);
  assert.deepEqual(allHost.stream.state().standing.map(row => row.points), [8, 4]);
  console.log('Four all-round heats, vehicle locks, stock ebike, legal controller upgrade and budget rejection passed.');

  const fiveSlotHost = await enter('FiveSlotH','bo1');
  const fiveSlotGuest = await enter('FiveSlotG',null,fiveSlotHost.room.code);
  await request('POST','/online/rooms',{name:'Old',protocol:3,code:fiveSlotHost.room.code},undefined,400);
  await command(fiveSlotHost,'config',{vehicleRule:'ebike',budget:'700',tuningSeconds:0});
  const ebikeBuild = {tyres:'grip',motor:'standard',brakes:'combo',thermal:'regenTuning'};
  await command(fiveSlotGuest,'profile',{tuning:ebikeBuild});
  const tooExpensive = await command(fiveSlotGuest,'ready',{ready:true},409);
  assert.match(JSON.stringify(tooExpensive), /超预算 ¥10/);
  const legalEbikeBuild = {...ebikeBuild,geometry:'stock',thermal:'quickCooling'};
  await command(fiveSlotGuest,'profile',{tuning:legalEbikeBuild});
  await Promise.all([fiveSlotHost,fiveSlotGuest].map(player=>command(player,'ready',{ready:true})));
  await command(fiveSlotHost,'start');
  assert.deepEqual(fiveSlotHost.stream.state().round.builds[fiveSlotGuest.id].parts,legalEbikeBuild);
  assert.equal(fiveSlotHost.stream.state().round.builds[fiveSlotHost.id].parts.thermal,'stock');
  await command(fiveSlotGuest,'profile',{tuning:ebikeBuild},409);
  console.log('Five-slot ebike budget, frozen profile and legacy client exclusion passed.');

  const partyHost=await enter('PartyH','bo1');
  const partyGuest=await enter('PartyG',null,partyHost.room.code);
  await command(partyGuest,'profile',{bike:{sprint:'rocket'}});
  await command(partyGuest,'ready',{ready:true},409);
  await command(partyHost,'config',{budget:'party'});
  await Promise.all([partyHost,partyGuest].map(p=>command(p,'ready',{ready:true})));
  await command(partyHost,'start');
  assert.equal(partyHost.stream.state().round.builds[partyGuest.id].parts.sprint,'rocket');
  console.log('Shared blind budget, over-budget block, frozen gear, seed and party-only mods passed.');
  console.log('Room API: capacity and auth, signal routing, BO1 tie, BO3 2–0 and 2–1, five league rounds, reconnect, host transfer, timeout, tuning phase, shunde route, collision rule, CORS, host-info and static assets passed.');
} finally {
  Date.now = realNow;
  server.emit('close');
}
