import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { routeRules } from '../src/data/routes.js';
import { districtChaseRules } from '../src/data/modes.js';
import { districtChaseContact, evaluateDistrictChase } from '../src/race/district-chase.js';
import { encodeRouteCode, parseRouteCode } from '../src/race/route-code.js';
import {
  buildCustomNetworkRoute,
  buildRidingScene,
  coursesByCampus,
  evaluateOnlineChasePeers,
  isOnlineChaseRoom,
  liveDeltaMs,
  nearestNetworkNode,
  networkForCampus,
  onlineChaseNextHunterId,
  onlineChaseRules,
  onlineChaseSnapshot,
  resolveRouteRef,
  setActiveCampus,
  setStorage,
  tuning190,
  vehicleBenchmark,
  makeNetworkCourse,
  makeSeedCourse,
} from '../src/test-exports.js';
import { createRideServer } from '../server/server.mjs';
import serverRouteRules from '../server/route-rules.cjs';
import { getCourseVariant } from '../src/race/course-variants.js';
import { ghostCourseKey, loadFriendGhost, makeGhostFile, readGhostFile } from '../src/replay/ghost.js';
import { createWorldQuery } from '../src/world/query.js';

const backing = new Map();
setStorage({
  getItem: key => (backing.has(key) ? backing.get(key) : null),
  setItem: (key, value) => backing.set(key, String(value)),
  removeItem: key => backing.delete(key),
});

// 1. liveDeltaMs speed-curve accuracy across steep & mixed sectors (shunde & szu)
{
  setActiveCampus('shunde');
  buildRidingScene('shunde');
  const endurance = coursesByCampus.shunde.find(c => c.id === 'shunde-endurance');
  const climb = coursesByCampus.shunde.find(c => c.id === 'shenbu-climb');
  assert.ok(endurance && climb, 'Expected shunde endurance and climb courses');

  for (const event of [endurance, climb]) {
    const bench = vehicleBenchmark(event, 'bike').run;
    for (let nextGate = 1; nextGate < event.gates.length; nextGate++) {
      const g0 = event.gates[nextGate - 1];
      const g1 = event.gates[nextGate];
      const t0 = bench.splits[g0.index], t1 = bench.splits[g1.index];
      const s0 = bench.samples.find(s => s[0] >= t0) ?? bench.samples[0];
      const s1 = [...bench.samples].reverse().find(s => s[0] <= t1) ?? bench.samples.at(-1);
      const midIdx = Math.floor((bench.samples.indexOf(s0) + bench.samples.indexOf(s1)) / 2);
      const mid = bench.samples[midIdx];
      const travelSpan = Math.max(0.01, s1[6] - s0[6]);
      const progressEstimate = g0.distance + ((mid[6] - s0[6]) / travelSpan) * (g1.distance - g0.distance);
      const delta = liveDeltaMs({
        phase: 'race',
        event,
        reference: bench,
        nextGate,
        elapsed: mid[0],
        progressEstimate,
      });
      assert.ok(delta !== null && Math.abs(delta) < 350, `Expected accurate liveDeltaMs on ${event.id} gate ${nextGate}, got ${delta}ms`);
    }
  }

  // Fallback check when samples are absent
  const fbDelta = liveDeltaMs({
    phase: 'race',
    event: climb,
    reference: { splits: vehicleBenchmark(climb, 'bike').run.splits },
    nextGate: 1,
    elapsed: vehicleBenchmark(climb, 'bike').run.splits[0],
    progressEstimate: climb.gates[0].distance,
  });
  assert.equal(Math.round(fbDelta), 0);
}

// 2. Plan B: Visual Map Route Builder on szu & ucl + rejection on shunde
{
  assert.equal(buildCustomNetworkRoute('shunde', ['a', 'b']).valid, false);

  for (const campus of ['szu', 'ucl']) {
    setActiveCampus(campus);
    buildRidingScene(campus);
    const network = networkForCampus(campus);
    assert.ok(network, `Expected road network on ${campus}`);

    const entries = Object.entries(network.endpoints);
    assert.ok(entries.length >= 4);
    const wpA = entries[0][0];
    const wpB = entries[1][0];
    const wpC = entries[2][0];

    const ptA = network.points[wpA];
    const snapped = nearestNetworkNode(network, ptA[0] + 4, ptA[1] - 3, 28);
    assert.equal(snapped?.id, wpA, `nearestNetworkNode should snap cleanly on ${campus}`);

    const tooShort = buildCustomNetworkRoute(campus, [wpA], network);
    assert.equal(tooShort.valid, false);

    const draft = buildCustomNetworkRoute(campus, [wpA, wpB, wpC], network);
    assert.equal(draft.valid, true, `Expected valid route on ${campus}, got error=${draft.error}`);
    assert.ok(draft.code?.startsWith(`R1.${campus}.n.`), `Unexpected route code ${draft.code}`);
    assert.ok(draft.polyline.length >= 4);

    const resolved = resolveRouteRef(draft.code, {
      coursesByCampus,
      makeSeedCourse,
      networkFor: networkForCampus,
      makeNetworkCourse,
    });
    assert.ok(resolved?.event, `resolveRouteRef must build runnable course on ${campus}`);
    assert.ok(resolved.event.benchmark?.samples?.length > 10);
    assert.equal(resolved.event.networkEdges.length, draft.edges.length);

    for (const event of [resolved.event, getCourseVariant(resolved.event, { direction: 'reverse' })]) {
      const run = { ...event.benchmark, vehicle: 'bike' };
      const file = makeGhostFile(event, run, { name: 'Route workshop QA', paint: 'classic' });
      assert.match(file.course.routeCode, new RegExp(`^R1\\.${campus}\\.n\\.`));
      const read = readGhostFile(JSON.stringify(file));
      const challenge = loadFriendGhost(read, campus);
      assert.equal(challenge.event.id, event.id);
      assert.equal(ghostCourseKey(challenge.event), ghostCourseKey(event));
      assert.deepEqual(challenge.event.variant, event.variant);
      assert.equal(challenge.opponent.time, run.time);
      assert.throws(() => loadFriendGhost({ ...read, course: { ...read.course, layout: '00000000' } }, campus), /布局/);
    }
  }
}

// Long workshop routes need to fit both the map bounds and the shared R1 limits.
const szuLoop = ['eastTeach', 'eastHosp', 'eastCentre', 'hospital', 'eastSpine'];
const longWaypoints = Array.from({ length: routeRules.maxEdges + 2 }, (_, i) => szuLoop[i % szuLoop.length]);
const longDraft = buildCustomNetworkRoute('szu', longWaypoints.slice(0, -1));
assert.equal(longDraft.maximum, 3000);
assert.equal(longDraft.edges.length, 64);
assert.ok(longDraft.valid && longDraft.totalLength > 1080 && longDraft.code.length > 256, longDraft.error);
assert.deepEqual(parseRouteCode(longDraft.code).edges, longDraft.edges);
assert.deepEqual(serverRouteRules.parseRouteCode(longDraft.code).edges, longDraft.edges);
assert.equal(serverRouteRules.encodeRoute(longDraft.route), longDraft.code);
const longCourse = resolveRouteRef(longDraft.code, { networkFor: networkForCampus, makeNetworkCourse });
assert.equal(Math.round(longCourse.event.length), longDraft.totalLength);

const tooManyEdges = buildCustomNetworkRoute('szu', longWaypoints);
assert.equal(tooManyEdges.valid, false);
assert.equal(tooManyEdges.code, null);
assert.match(tooManyEdges.error, /65.*64/);

const uclLoop = ['endsleighGordon', 'endsleighTaviton', 'endsleighStreetN', 'gordonNE', 'tavitonGordon', 'gordonNW'];
const tooFar = buildCustomNetworkRoute('ucl', [...Array.from({ length: 7 }, () => uclLoop).flat(), uclLoop[0]]);
assert.equal(tooFar.valid, false);
assert.equal(tooFar.code, null);
assert.match(tooFar.error, /超出上限（3000 米）/);
assert.ok(tooFar.edges.length < routeRules.maxEdges, 'Mileage must be checked even within the edge budget');

const oversizedEdges = longDraft.edges.map(edge => ({ ...edge, id: edge.id.padEnd(32, 'x') }));
const oversizedCode = longDraft.code.slice(0, longDraft.code.lastIndexOf('.') + 1) +
  oversizedEdges.map(edge => `${edge.id}~${edge.direction}`).join(',');
assert.ok(oversizedCode.length > routeRules.maxCodeLength);
assert.equal(encodeRouteCode({ ...longDraft.route, edges: oversizedEdges }), null);
assert.equal(serverRouteRules.encodeRoute({ ...longDraft.route, edges: oversizedEdges }), null);
assert.equal(parseRouteCode(oversizedCode), null);
assert.equal(serverRouteRules.parseRouteCode(oversizedCode), null);

// District markers are on rideable roads, and UCL cover blocks close-range sight.
{
  const query = createWorldQuery('ucl');
  for (const {x,z} of [districtChaseRules.start,...districtChaseRules.zones]) {
    assert.equal(query.safeToRide(x,z),true);
    assert.equal(query.surfaceAt(x,z),true);
  }
  assert.equal(districtChaseContact([30,.041,27],[30,.041,44]).visible,false);
  assert.equal(districtChaseContact([120,.041,180],[120,.041,175]).visible,true);
  assert.equal(districtChaseContact([120,.041,180],[120,.041,145]).visible,false);
  const snap = {
    active:true,phase:'race',role:'hunter',hunterId:'h',caughtMap:{},isCaught:false,selfCaughtAt:null,
    totalRunners:1,caughtCount:0,remainingRunners:1,retiredIds:new Set(),countdownMs:0,elapsedMs:5000,
    remainingMs:80_000,headStartRemainingMs:0,hunterLocked:false,settledReason:null,
  };
  const remote = {id:'r',name:'Runner',position:[120,.041,175],heading:0};
  const fresh = evaluateDistrictChase(snap,{id:'2',ms:4000},[120,.041,180],[remote]);
  assert.equal(fresh.district.clueId,'2');
  assert.deepEqual(fresh.radarPings,[]);
  assert.equal(fresh.catchCandidate?.id,'r');
  const expired = evaluateDistrictChase({...snap,elapsedMs:8000},{id:'2',ms:4000},[120,.041,180],[remote]);
  assert.equal(expired.district.clueId,null);
  assert.equal(evaluateDistrictChase({...snap,hunterLocked:true},null,[120,.041,180],[remote]).catchCandidate,null);
}

// 3. Plan A: Online Chase Server + Client Visibility/Radar/Catch Logic
{
  class MockResponse extends Writable {
    chunks = [];
    writeHead(status, headers) { this.status = status; this.headers = headers; return this; }
    flushHeaders() {}
    _write(chunk, _enc, cb) { this.chunks.push(chunk.toString()); cb(); }
    state() {
      const event = this.chunks.findLast(chunk => chunk.startsWith('event: room\n'));
      return event && JSON.parse(event.split('\n')[1].slice(6));
    }
  }

  let fakeNow = Date.now();
  const realNow = Date.now;
  Date.now = () => fakeNow;
  const server = createRideServer({ page: Buffer.from('test'), iceServers: [] });

  function emitReq(method, url, body, token) {
    const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
    Object.assign(req, {
      method,
      url,
      complete: true,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    });
    const res = new MockResponse();
    server.emit('request', req, res);
    return res;
  }

  async function reqJson(method, url, body, token, expectedStatus = 200) {
    const res = emitReq(method, url, body, token);
    await new Promise(resolve => res.once('finish', resolve));
    const data = JSON.parse(res.chunks.join(''));
    assert.equal(res.status, expectedStatus, JSON.stringify(data));
    return data;
  }

  try {
    const longRoute = { ...longDraft.route, id: longCourse.event.id, layout: longCourse.layout, code: longDraft.code };
    const longRoom = await reqJson('POST', '/online/rooms', { name: '长路线验收', protocol: tuning190.protocol, format: 'bo1', route: longRoute });
    assert.equal(longRoom.room.route.code, longDraft.code);
    assert.deepEqual(longRoom.room.route.edges, longDraft.edges);

    const route = { campus: 'szu', id: 'ring', seed: null, layout: '0123abcd' };
    const p1 = await reqJson('POST', '/online/rooms', { name: '追击甲', protocol: tuning190.protocol, format: 'chase', route });
    const s1 = emitReq('GET', `/online/rooms/${p1.room.code}/events?id=${p1.id}&token=${p1.token}`);
    const p2 = await reqJson('POST', '/online/rooms', { name: '逃跑乙', protocol: tuning190.protocol, code: p1.room.code });
    const s2 = emitReq('GET', `/online/rooms/${p1.room.code}/events?id=${p2.id}&token=${p2.token}`);
    const p3 = await reqJson('POST', '/online/rooms', { name: '逃跑丙', protocol: tuning190.protocol, code: p1.room.code });
    const s3 = emitReq('GET', `/online/rooms/${p1.room.code}/events?id=${p3.id}&token=${p3.token}`);
    const players = [
      { id: p1.id, token: p1.token, stream: s1 },
      { id: p2.id, token: p2.token, stream: s2 },
      { id: p3.id, token: p3.token, stream: s3 },
    ];
    const cmd = (pl, action, details = {}, status = 200) =>
      reqJson('POST', `/online/rooms/${p1.room.code}/command?id=${pl.id}`, { action, ...details }, pl.token, status);

    await Promise.all(players.map(pl => cmd(pl, 'ready', { ready: true })));
    await cmd(players[0], 'start');
    let state = players[0].stream.state();
    assert.equal(state.phase, 'race');
    assert.equal(state.format, 'chase');
    assert.equal(state.round.chase.hunterId, p1.id);

    // Client snapshot & visibility evaluation
    const session = { id: p1.id, serverOffset: 0, state, course: { campus: 'szu' } };
    assert.equal(isOnlineChaseRoom(session), true);
    assert.equal(onlineChaseNextHunterId(state), p1.id);

    // During headstart: hunter locked
    fakeNow = state.round.goAt + 1000;
    const lockSnap = onlineChaseSnapshot(session, fakeNow);
    assert.equal(lockSnap.hunterLocked, true);
    await cmd(players[0], 'tag', { round: 1, targetId: p2.id, ms: 1000 }, 409);

    // After headstart: hunter unlocked, evaluates peers accurately
    fakeNow = state.round.goAt + onlineChaseRules.headStartMs + 2000;
    const pingCache = { lastAt: -Infinity, byId: new Map() };
    const evalRes = evaluateOnlineChasePeers(session, [0, 0, 0], [
      { id: p2.id, name: '逃跑乙', vehicle: 'bike', position: [5, 0, 0], heading: 0, speed: 5 },
      { id: p3.id, name: '逃跑丙', vehicle: 'bike', position: [120, 0, 0], heading: 0, speed: 5 },
    ], fakeNow, { pingCache });
    assert.equal(evalRes.visibleRiders.length, 1);
    assert.equal(evalRes.visibleRiders[0].id, p2.id);
    assert.equal(evalRes.radarPings.length, 2);
    assert.equal(evalRes.catchCandidate?.id, p2.id);

    // Tag both runners -> sweep round ends immediately
    await cmd(players[0], 'tag', { round: 1, targetId: p2.id, ms: 15_000 });
    await cmd(players[1], 'tag', { round: 1, targetId: p3.id, ms: 20_000 }, 403);
    await cmd(players[0], 'tag', { round: 1, targetId: p3.id, ms: 32_000 });
    state = players[0].stream.state();
    assert.equal(state.phase, 'between');
    assert.equal(state.history[0].chase.settledReason, 'sweep');
    assert.equal(state.standing.find(r => r.id === p1.id).points, 5); // 2*2 + 1 sweep bonus

    // Round 2 rotates hunter to p2
    await Promise.all(players.map(pl => cmd(pl, 'ready', { ready: true })));
    await cmd(players[0], 'start');
    state = players[0].stream.state();
    assert.equal(state.round.chase.hunterId, p2.id);

    // The next runner in the rotation leaves between rounds.
    fakeNow = state.round.goAt + onlineChaseRules.headStartMs + 2000;
    await cmd(players[0], 'retire', { round: 2 });
    state = players[2].stream.state();
    assert.equal(state.phase, 'race');
    assert.equal(state.players.length, 3, 'Retiring leaves the runner connected to the room');
    const runnerSnap = onlineChaseSnapshot({ ...session, id: p3.id, state }, fakeNow);
    assert.equal(runnerSnap.totalRunners, 2);
    assert.equal(runnerSnap.remainingRunners, 1);
    const hunterView = evaluateOnlineChasePeers({ ...session, id: p2.id, state }, [0, 0, 0], [
      { id: p1.id, name: '追击甲', position: [1, 0, 0], heading: 0 },
      { id: p3.id, name: '逃跑丙', position: [3, 0, 0], heading: 0 },
    ], fakeNow);
    assert.deepEqual(hunterView.visibleRiders.map(rider => rider.id), [p3.id]);
    assert.equal(hunterView.catchCandidate?.id, p3.id);
    await cmd(players[1], 'tag', { round: 2, targetId: p3.id, ms: 20_000 });
    assert.equal(onlineChaseNextHunterId(players[0].stream.state()), p3.id);
    await cmd(players[2], 'leave');
    state = players[0].stream.state();
    assert.equal(state.phase, 'between');
    assert.equal(state.nextHunterId, p1.id);
    assert.equal(onlineChaseNextHunterId(state), p1.id);
    await Promise.all(players.slice(0, 2).map(pl => cmd(pl, 'ready', { ready: true })));
    await cmd(players[0], 'start');
    state = players[0].stream.state();
    assert.equal(state.round.chase.hunterId, p1.id);
    assert.equal(state.round.results.find(result => result.id === p3.id)?.retired, true);
  } finally {
    Date.now = realNow;
    server.close();
  }
}

console.log('verify-250 passed: liveDeltaMs speed curve, Route Builder, and Online Chase verified.');
