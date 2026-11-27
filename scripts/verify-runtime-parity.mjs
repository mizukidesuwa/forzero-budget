import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

// Mock minimal document/canvas for Shape constructors that accept createElement('canvas')?
// All 34 modules under src/test-exports.js are Node-safe without DOM, though some helpers may query worldState.storage.
import * as sm from '../src/test-exports.js';

const saves = new Map();
sm.setStorage({
  getItem: (key) => saves.get(key) ?? null,
  setItem: (key, value) => saves.set(key, String(value)),
});

function createVmRunner() {
  const vmSaves = new Map();
  const canvas = {
    getContext: () => new Proxy({}, {
      get: (_, key) => (key === 'measureText' ? (text) => ({ width: text.length * 10 }) : () => {}),
    }),
  };
  const store = {
    getItem: (key) => vmSaves.get(key) ?? null,
    setItem: (key, value) => vmSaves.set(key, String(value)),
  };
  const ctx = vm.createContext({
    console,
    performance,
    preferences: { soloBudget: 'open', windSpeed: 0, windDir: 0, windMode: 'gust', traffic: 'sparse', collision: false, weather: 'day' },
    document: { createElement: () => canvas },
    localStorage: store,
  });
  const gameCode = readFileSync(resolve('szu-litchi-dev/ride-update/game.js'), 'utf8')
    .split(/const mapCache\s*=\s*(?:\/\*[\s\S]*?\*\/\s*)?new WeakMap\(\);/)[0];
  const drivePathCode = readFileSync(resolve('scripts/lib/drive-path.js'), 'utf8');
  vm.runInContext(gameCode + '\n' + drivePathCode, ctx);
  return {
    store: vmSaves,
    run: (code) => vm.runInContext(code, ctx),
    inspect: (expr) => JSON.parse(vm.runInContext(`JSON.stringify((()=>{${expr}})())`, ctx)),
  };
}

function rideTestEsm(event, sprint, seconds = 175, bike = sm.stockBike, raceMode = 'solo') {
  const trial = new sm.TimeTrial(event, bike);
  if (raceMode !== 'solo') trial.raceMode = raceMode;
  trial.start();
  const input = { gas: false, brake: false, left: false, right: false, sprint: false };
  trial.advance(3.001, input);
  const path = event.path;
  let index = 0, maxDeviation = 0, passed = 0, nearTurn = false, reserve = false;
  const tick = 1 / 110;
  for (let t = 0; t < seconds && trial.phase === 'race'; t += tick) {
    const r = trial.rider, p = r.position;
    let closest = Infinity;
    for (let i = Math.max(0, index - 7); i < Math.min(path.rows.length, index + 76); i++) {
      const q = path.rows[i].p;
      const distance = (p[0] - q[0]) ** 2 + (p[2] - q[2]) ** 2;
      if (distance < closest) { closest = distance; index = i; }
    }
    const progress = path.rows[index].distance;
    if (t > 2) maxDeviation = Math.max(maxDeviation, Math.sqrt(closest));
    const forward = sm.along(path, Math.min(event.length, progress + sm.clamp(1.7 + r.speed * .29, 1.85, 5.8)));
    const target = sm.subtract(forward, p);
    let delta = Math.atan2(target[2], target[0]) - r.heading - r.yawRate * .085;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    const courseSpeed = sm.plannedSpeed(event, progress + .65);
    if (sprint) {
      const entering = sm.plannedSpeed(event, progress + 8.6);
      nearTurn = entering < 10.8 || Math.abs(delta) > .22;
      if (r.energy > .42) reserve = true;
      if (r.energy < .067) reserve = false;
      input.sprint = !nearTurn && reserve;
    }
    let goal = Math.min(input.sprint ? sm.MAX_SPRINT_SPEED - .15 : sprint ? 11.52 : 10.80, courseSpeed * (sprint ? 1.11 : 1.04));
    if (Math.abs(delta) > .38) goal = Math.min(goal, 7.9);
    if (Math.abs(delta) > .75) goal = Math.min(goal, 5.4);
    input.gas = r.speed < goal - .06 || input.sprint;
    input.brake = r.speed > goal + (sprint ? .46 : .32);
    input.right = delta > .025;
    input.left = delta < -.025;
    trial.advance(tick, input);
    passed = trial.nextGate;
  }
  return {
    id: event.id,
    sprint,
    phase: trial.phase,
    passed,
    elapsed: Math.round(trial.elapsed),
    medal: sm.medalName(event, trial.elapsed),
    goals: event.medalTimes,
    deviation: maxDeviation,
    position: trial.rider.position,
    progress: trial.progressEstimate,
    trial,
  };
}

const legacy = createVmRunner();

// 1. Suite: verify.mjs (handling, seed courses, UCL gate clearances)
{
  saves.set('szu-litchi-bike-1', JSON.stringify({ tyres: 'traction', gears: 'short' }));
  legacy.store.set('szu-litchi-bike-1', JSON.stringify({ tyres: 'traction', gears: 'short' }));
  assert.equal(sm.savedBike().brakes, 'stock');
  assert.equal(legacy.run('savedBike().brakes'), 'stock');

  const esmHandling = (() => {
    const input = { gas: true, brake: false, right: false, left: false, sprint: false };
    const fast = sm.buildBike('race', 'long'), technical = sm.buildBike('traction', 'short');
    const query = (paved, grade) => ({
      ...sm.createWorldQuery('szu'),
      safeToRide: () => true,
      rideElevation: () => 0,
      surfaceAt: () => paved,
      riderGrade: () => grade,
    });
    const ride = (bike, meters, paved, grade, vehicle = 'bike', entrySpeed = 0) => {
      const q = query(paved, grade);
      const rider = sm.makeCyclist(sm.courses[0], bike, vehicle, null, q);
      Object.assign(rider, { position: [0, sm.ROAD_Y, 0], heading: 0, paved, speed: entrySpeed });
      let ticks = 0;
      while (rider.travel < meters && ticks < 4800) {
        sm.moveCyclist(rider, input, 1 / 120, false, null, null, sm.cityVehicles, q);
        ticks++;
      }
      return { speed: rider.speed, time: ticks / 120 };
    };
    const former = { ...sm.stockBike, grassSpeed: 4.65, grassSlowdown: 8.85, grassRolling: 2.85 };
    const speed = sm.stockBike.roadSpeed;
    return {
      highway: [fast, sm.stockBike, technical].map((b) => ride(b, 180, true, 0)),
      hill: [fast, sm.stockBike, technical].map((b) => ride(b, 18, true, .115)),
      grass: [fast, sm.stockBike, technical].map((b) => ride(b, 38, false, 0)),
      grassEntry: [former, sm.stockBike].map((b) => ride(b, 6, false, 0, 'bike', speed)),
      motor: ride(sm.stockBike, 150, true, 0, 'trail').speed * 3.6,
    };
  })();

  const vmHandling = legacy.inspect(`
    const oldGround={safeToRide,surfaceAt,riderGrade,rideElevation};
    safeToRide=()=>true; rideElevation=()=>0;
    const input={gas:true,brake:false,right:false,left:false,sprint:false};
    const fast=buildBike('race','long'),technical=buildBike('traction','short');
    function ride(bike,meters,paved,grade,vehicle='bike',entrySpeed=0) {
      surfaceAt=()=>paved; riderGrade=()=>grade;
      const rider=makeCyclist(courses[0],bike,vehicle);
      Object.assign(rider,{position:[0,ROAD_Y,0],heading:0,paved,speed:entrySpeed});
      let ticks=0;
      while(rider.travel<meters&&ticks<4800) {moveCyclist(rider,input,1/120);ticks++;}
      return {speed:rider.speed,time:ticks/120};
    }
    try {
      const former={...stockBike,grassSpeed:4.65,grassSlowdown:8.85,grassRolling:2.85};
      const speed=stockBike.roadSpeed;
      return {highway:[fast,stockBike,technical].map(b=>ride(b,180,true,0)),
        hill:[fast,stockBike,technical].map(b=>ride(b,18,true,.115)),
        grass:[fast,stockBike,technical].map(b=>ride(b,38,false,0)),
        grassEntry:[former,stockBike].map(b=>ride(b,6,false,0,'bike',speed)),
        motor:ride(stockBike,150,true,0,'trail').speed*3.6};
    } finally { ({safeToRide,surfaceAt,riderGrade,rideElevation}=oldGround); }
  `);
  assert.deepEqual(esmHandling, vmHandling);
  assert.ok(esmHandling.highway[0].time < esmHandling.highway[1].time);
  assert.ok(esmHandling.hill[2].time < esmHandling.hill[0].time);
  assert.ok(esmHandling.grass[2].time < esmHandling.grass[0].time);
  assert.ok(esmHandling.grassEntry[1].speed > esmHandling.grassEntry[0].speed + 2);
  assert.equal(esmHandling.motor, 63);

  for (const campus of ['szu', 'ucl']) {
    sm.setActiveCampus(campus); sm.buildRidingScene(campus);
    legacy.run(`activeCampus='${campus}';buildRidingScene(activeCampus);`);
    const names = ['326', 'RACE', '607', 'FLOW', 'LONDON', '2026', 'ROCK', '42'];
    const samples = names.map((raw) => sm.makeSeedCourse(sm.readSeedCode(raw, campus), campus));
    const first = samples[0], again = sm.makeSeedCourse(first.seed, campus);
    const sig = (event) => JSON.stringify([event.path.rows, event.gates.map(({ distance, name }) => [distance, name])]);
    const esmSeed = {
      valid: samples.every((ev) => ev && ev.gates.every((g, i) => !i || g.distance > ev.gates[i - 1].distance + 4)),
      repeat: sig(first) === sig(again),
      different: new Set(samples.map(sig)).size,
      recordKeys: ['bike', 'trail'].map((actor) => sm.recordKey(first, actor)),
      motorcycle: new sm.TimeTrial(first, sm.stockBike, 'trail').entryVehicle,
      elapsed: rideTestEsm(first, true, 230).elapsed,
    };
    const vmSeed = legacy.inspect(`
      const names=['326','RACE','607','FLOW','LONDON','2026','ROCK','42'];
      const samples=names.map(raw=>makeSeedCourse(readSeedCode(raw,activeCampus),activeCampus));
      const first=samples[0],again=makeSeedCourse(first.seed,activeCampus);
      const signature=event=>JSON.stringify([event.path.rows,event.gates.map(({distance,name})=>[distance,name])]);
      return {valid:samples.every(e=>e&&e.gates.every((g,i)=>!i||g.distance>e.gates[i-1].distance+4)),
        repeat:signature(first)===signature(again),different:new Set(samples.map(signature)).size,
        recordKeys:['bike','trail'].map(actor=>recordKey(first,actor)),
        motorcycle:new TimeTrial(first,stockBike,'trail').entryVehicle,elapsed:rideTest(first,true,230).elapsed};
    `);
    assert.deepEqual(esmSeed, vmSeed);
  }
  const uclGatesEsm = sm.londonCourses.map((event) => ({
    id: event.id,
    count: event.gates.length,
    clear: event.gates.every((gate) => Array.from({ length: 13 }, (_, i) => sm.mix(gate.minCross, gate.maxCross, i / 12)).every((offset) =>
      [-.87, 0, .87].every((step) => {
        const [x, , z] = sm.add(sm.offsetVertex(gate, offset, 0), sm.scale(gate.f, step));
        return sm.canRideUcl(x, z) && Boolean(sm.uclStreetAt(x, z, .75));
      }))),
    cuts: event.londonLines.length,
  }));
  const uclGatesVm = legacy.inspect(`return londonCourses.map(event=>({id:event.id,count:event.gates.length,
    clear:event.gates.every(gate=>Array.from({length:13},(_,i)=>mix(gate.minCross,gate.maxCross,i/12)).every(offset=>
      [-.87,0,.87].every(step=>{const [x,,z]=add(offsetVertex(gate,offset,0),scale(gate.f,step));return canRideUcl(x,z)&&Boolean(uclStreetAt(x,z,.75));}))),
    cuts:event.londonLines.length}));`);
  assert.deepEqual(uclGatesEsm, uclGatesVm);
  console.log('PASS [1/7] verify parity (handling, seeds, UCL gates)');
}

// 2. Suite: verify-map.mjs (SZU + UCL map geometry, passages, lakes, ground triangles)
{
  sm.setActiveCampus('szu'); sm.buildRidingScene('szu');
  legacy.run("activeCampus='szu';buildRidingScene(activeCampus);");
  const szuEsm = (() => {
    const world = sm.worldState;
    const entrances = [...sm.cityLinks, ...sm.canghaiStreets.filter((w) => sm.canghaiGates.some((g) => g.name === w.name))];
    const ways = [...sm.roads.map((path, i) => ({ name: '校内道路 ' + i, path, city: false })),
      ...[...sm.cityRoads].map(([path, info]) => ({ name: info.name, path, city: true }))];
    const overlaps = [];
    for (const { name, path, city } of ways) {
      for (let d = .17; d < path.length; d += .61) {
        const frame = sm.courseFrame(path, d);
        for (const lane of [-.81, 0, .81]) {
          const [x, , z] = sm.offsetVertex(frame, lane * path.width, 0);
          const solid = city && sm.citySolid.find((lot) => lot.kind !== 'bridge-support' &&
            Math.abs(x - lot.x) < lot.w / 2 && Math.abs(z - lot.z) < lot.d / 2);
          const lot = sm.buildingAt(x, z, 0);
          if (solid || lot) overlaps.push({ name, x, z, lot: lot?.name || lot?.district });
        }
      }
    }
    const passages = entrances.map(({ name, path }) => {
      let blocked = 0;
      for (let d = .11; d < path.length; d += .42) {
        const frame = sm.courseFrame(path, d);
        for (const lane of [-.61, 0, .61]) {
          const [x, , z] = sm.offsetVertex(frame, lane * path.width, 0);
          if (!sm.safeToRide(x, z, true) || !sm.surfaceAt(x, z, true)) blocked++;
        }
      }
      return { name, blocked };
    });
    const fields = sm.protectedCampusGrounds.map((site) => sm.campus.every((lot) => (lot.parts ?? [lot])
      .every((part) => sm.fitsBetweenBuildings(site, part))) && sm.treeSites.every((tree) => !sm.closeToBlock(tree.x, tree.z, site)));
    const lakeChecks = sm.basins.map((b) => {
      const spot = sm.nearestSafeRoad(b.x, b.z);
      return sm.waterHazardAt(b.x, b.z) && !sm.safeToRide(b.x, b.z, true, false) && sm.safeToRide(b.x, b.z, true, true) &&
        Boolean(spot) && !sm.waterHazardAt(spot.p[0], spot.p[2]) && sm.safeToRide(spot.p[0], spot.p[2], true, false);
    });
    const input = { gas: true, brake: false, left: false, right: false, sprint: false };
    const freeTrial = new sm.TimeTrial(sm.courses[0]);
    freeTrial.freeRide();
    const upper = sm.basins[1], sx = upper.x + upper.rx * 1.04 * upper.c, sz = upper.z - upper.rx * 1.04 * upper.s;
    freeTrial.rider.position = [sx, sm.ROAD_Y, sz];
    freeTrial.rider.heading = Math.atan2(upper.z - sz, upper.x - sx);
    freeTrial.rider.speed = 7;
    for (let k = 0; k < 90 && !freeTrial.freeHazardNotice; k++) freeTrial.step(input);
    const raceTrial = new sm.TimeTrial(sm.courses[0]);
    raceTrial.phase = 'race';
    raceTrial.elapsed = 5000;
    raceTrial.rider.position = [upper.x, sm.ROAD_Y, upper.z];
    raceTrial.rider.speed = 6;
    raceTrial.step(input);
    assert.ok(world);
    return {
      ways: ways.length,
      overlaps,
      passages,
      fields,
      lakeChecks,
      freeNotice: freeTrial.freeHazardNotice?.text || null,
      raceRejoin: { reason: raceTrial.rejoinReason, elapsed: raceTrial.elapsed, lastRejoin: raceTrial.lastRejoin },
    };
  })();
  assert.deepEqual(szuEsm.overlaps, []);
  assert.ok(szuEsm.passages.every((p) => p.blocked === 0));
  assert.ok(szuEsm.fields.every(Boolean));
  assert.ok(szuEsm.lakeChecks.every(Boolean));
  assert.ok(szuEsm.freeNotice?.includes('落水'));
  assert.deepEqual(szuEsm.raceRejoin, { reason: '落水', elapsed: 7000, lastRejoin: 7000 });

  sm.setActiveCampus('ucl'); sm.buildRidingScene('ucl');
  const uclEsm = (() => {
    const obstacles = [];
    for (const { id, path } of sm.uclWays) {
      for (let d = .19; d <= path.length; d += .61) {
        const frame = sm.courseFrame(path, d);
        for (const lane of [-.87, -.43, 0, .43, .87]) {
          const [x, , z] = sm.offsetVertex(frame, lane * path.width, 0);
          if (!sm.canRideUcl(x, z)) obstacles.push([id, x, z]);
        }
      }
    }
    sm.clearWorldShapes(); sm.londonGroundSurfaces();
    const cells = new Map(), step = 9;
    const tile = (p) => Math.floor(p / step);
    for (const mesh of [sm.road, sm.pavement]) {
      for (let i = 0; i < mesh.indices.length; i += 3) {
        const tri = mesh.indices.slice(i, i + 3).map((j) => [mesh.vertices[j * 11], mesh.vertices[j * 11 + 2]]);
        const xs = tri.map((p) => p[0]), zs = tri.map((p) => p[1]);
        for (let x = tile(Math.min(...xs)); x <= tile(Math.max(...xs)); x++) {
          for (let z = tile(Math.min(...zs)); z <= tile(Math.max(...zs)); z++) {
            const key = x * 4096 + z;
            if (!cells.has(key)) cells.set(key, []);
            cells.get(key).push({ tri, road: mesh === sm.road });
          }
        }
      }
    }
    const cross2 = (a, b, x, z) => (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]);
    const cover = (x, z) => (cells.get(tile(x) * 4096 + tile(z)) ?? []).filter(({ tri }) =>
      tri.every((a, i) => cross2(a, tri[(i + 1) % 3], x, z) < -.0000001));
    const faults = [];
    for (const { id, path } of sm.uclWays) {
      for (let d = .237; d < path.length - .34; d += 1.133) {
        const frame = sm.courseFrame(path, d);
        for (const f of [-.73, -.31, .111, .37, .77]) {
          const [x, , z] = sm.offsetVertex(frame, path.width * f, 0), hits = cover(x, z);
          if (hits.length !== 1 || (!sm.londonPaths.has(id) && !hits[0].road)) faults.push([id, x, z, hits.length]);
        }
      }
    }
    return {
      obstacles,
      shops: sm.londonPlaces.filter((p) => p.kind === 'shop').length,
      faults,
      frontGateIsRoad: cover(.193, .317).some((hit) => hit.road),
      pedestrianApproach: cover(7.132, .119).some((hit) => !hit.road),
    };
  })();
  assert.deepEqual(uclEsm.obstacles, []);
  assert.equal(uclEsm.shops, 23);
  assert.deepEqual(uclEsm.faults, []);
  assert.ok(uclEsm.frontGateIsRoad && uclEsm.pedestrianApproach);
  console.log('PASS [2/7] verify-map parity (SZU ways/lakes/fences, UCL ways/surfaces)');
}

// 3. Suite: verify-park.mjs (Shunde park lap, pavilion 4-vehicle bridge, Qingyun LoS)
{
  sm.setActiveCampus('shunde'); sm.buildRidingScene('shunde');
  legacy.run("activeCampus='shunde';buildRidingScene(activeCampus);");
  sm.getPreferences().traffic = 'off';
  legacy.run("if(typeof preferences!=='undefined') preferences.traffic='off';");
  const lapEsm = rideTestEsm(sm.parkCourse, true, 240);
  const lapVm = legacy.inspect("return rideTest(parkCourse,true,240);");
  sm.getPreferences().traffic = 'sparse';
  legacy.run("if(typeof preferences!=='undefined') preferences.traffic='sparse';");
  assert.equal(lapEsm.phase, 'done');
  assert.equal(lapEsm.passed, 7);
  assert.equal(lapEsm.elapsed, lapVm.elapsed);

  const pavEsm = ['bike', 'ebike', 'chair', 'trail'].flatMap((vehicle) => [1, -1].map((direction) => {
    const start = sm.courseFrame(sm.pavilionWalk, direction > 0 ? 0 : sm.pavilionWalk.length);
    const trial = new sm.TimeTrial(sm.parkCourse, sm.stockBike, vehicle);
    const r = trial.rider;
    r.position = [start.p[0], sm.parkHeight(start.p[0], start.p[2]) + sm.ROAD_Y, start.p[2]];
    r.heading = Math.atan2(direction * start.f[2], direction * start.f[0]);
    for (let i = 0; i < 3600; i++) {
      let distance = 0, minGap = Infinity;
      for (const { p, distance: d } of sm.pavilionWalk.rows) {
        const gap = (r.position[0] - p[0]) ** 2 + (r.position[2] - p[2]) ** 2;
        if (gap < minGap) { minGap = gap; distance = d; }
      }
      if (trial.freeHazardNotice) return { vehicle, direction, passed: false };
      if ((direction > 0 ? sm.pavilionWalk.length - distance : distance) < .65) {
        return { vehicle, direction, passed: true, height: r.position[1] };
      }
      const p = sm.along(sm.pavilionWalk, sm.clamp(distance + direction * 1.8, 0, sm.pavilionWalk.length));
      const h = Math.atan2(p[2] - r.position[2], p[0] - r.position[0]) - r.heading - r.yawRate * .085;
      const delta = Math.atan2(Math.sin(h), Math.cos(h));
      trial.step({ gas: r.speed < 4.1, brake: r.speed > 4.4, left: delta < -.025, right: delta > .025, sprint: false });
    }
    return { vehicle, direction, passed: false };
  }));
  assert.ok(pavEsm.every((x) => x.passed && Math.abs(x.height - (x.direction > 0 ? 1.72 : .041)) < .025));

  const sightEsm = (() => {
    const v = sm.foliage.vertices, idx = sm.foliage.indices, triangles = [];
    for (let i = 0; i < idx.length; i += 3) {
      const [a, b, c] = [idx[i], idx[i + 1], idx[i + 2]].map((j) => v.slice(11 * j, 11 * j + 3));
      triangles.push({ a, ab: sm.subtract(b, a), ac: sm.subtract(c, a), minX: Math.min(a[0], b[0], c[0]), maxX: Math.max(a[0], b[0], c[0]), minZ: Math.min(a[2], b[2], c[2]), maxZ: Math.max(a[2], b[2], c[2]) });
    }
    const screened = (eye, target) => {
      const ray = sm.subtract(target, eye);
      for (const t of triangles) {
        if (t.maxX < Math.min(eye[0], target[0]) || t.minX > Math.max(eye[0], target[0]) ||
            t.maxZ < Math.min(eye[2], target[2]) || t.minZ > Math.max(eye[2], target[2])) continue;
        const h = sm.cross(ray, t.ac), det = sm.dot(t.ab, h); if (Math.abs(det) < 1e-8) continue;
        const edge = sm.subtract(eye, t.a), u = sm.dot(edge, h) / det; if (u < 0 || u > 1) continue;
        const q = sm.cross(edge, t.ab), w = sm.dot(ray, q) / det; if (w < 0 || u + w > 1) continue;
        const hit = sm.dot(t.ac, q) / det; if (hit > 0 && hit < 1) return true;
      }
      return false;
    };
    const visible = [], partial = [], hidden = [];
    for (let d = 0; d < sm.parkPath.length; d += 4) {
      const { p, f, side } = sm.courseFrame(sm.parkPath, d), eye = sm.add(sm.add(p, sm.scale(f, -8.25)), sm.scale(side, 1.24));
      eye[1] += 4.02 + sm.parkHeight(p[0], p[2]);
      const [x, z] = sm.parkTower;
      if (sm.dot(f, sm.normalize([x - eye[0], 0, z - eye[2]])) < .84 || Math.hypot(x - eye[0], z - eye[2]) > 200) continue;
      const lower = screened(eye, [x, 18, z]), upper = screened(eye, [x, 34, z]);
      (lower && upper ? hidden : lower || upper ? partial : visible).push(d);
    }
    return { visible, partial, hidden };
  })();
  const sightVm = legacy.inspect(`
    const v=foliage.vertices, idx=foliage.indices, triangles=[];
    for(let i=0;i<idx.length;i+=3) {
      const [a,b,c]=[idx[i],idx[i+1],idx[i+2]].map(j=>v.slice(11*j,11*j+3));
      triangles.push({a,ab:subtract(b,a),ac:subtract(c,a),minX:Math.min(a[0],b[0],c[0]),maxX:Math.max(a[0],b[0],c[0]),
        minZ:Math.min(a[2],b[2],c[2]),maxZ:Math.max(a[2],b[2],c[2])});
    }
    function screened(eye,target) {
      const ray=subtract(target,eye);
      for(const t of triangles) {
        if(t.maxX<Math.min(eye[0],target[0])||t.minX>Math.max(eye[0],target[0])||t.maxZ<Math.min(eye[2],target[2])||t.minZ>Math.max(eye[2],target[2])) continue;
        const h=cross(ray,t.ac),det=dot(t.ab,h);if(Math.abs(det)<1e-8) continue;
        const edge=subtract(eye,t.a),u=dot(edge,h)/det;if(u<0||u>1) continue;
        const q=cross(edge,t.ab),w=dot(ray,q)/det;if(w<0||u+w>1) continue;
        const hit=dot(t.ac,q)/det;if(hit>0&&hit<1) return true;
      }
      return false;
    }
    const visible=[],partial=[],hidden=[];
    for(let d=0;d<parkPath.length;d+=4) {
      const {p,f,side}=courseFrame(parkPath,d),eye=add(add(p,scale(f,-8.25)),scale(side,1.24));eye[1]+=4.02+parkHeight(p[0],p[2]);
      const [x,z]=parkTower;
      if(dot(f,normalize([x-eye[0],0,z-eye[2]]))<.84||Math.hypot(x-eye[0],z-eye[2])>200) continue;
      const lower=screened(eye,[x,18,z]),upper=screened(eye,[x,34,z]);
      (lower&&upper?hidden:lower||upper?partial:visible).push(d);
    }
    return {visible,partial,hidden};
  `);
  assert.deepEqual(sightEsm, sightVm);
  console.log('PASS [3/7] verify-park parity (Shunde lap, pavilion, Qingyun LoS)');
}

// 4. Suite: verify-mountain.mjs (Shenbu mountain laps, terrain overlap, gravel braking)
{
  const mtnEsm = sm.mountainCourses.map((e, i) => {
    const lap = rideTestEsm(e, true, 220);
    const gravelRide = rideTestEsm(e, true, 220, sm.buildBike('traction', 'short', 'control', 'stock', 'endurance'));
    const roadRide = rideTestEsm(e, true, 220, sm.buildBike('race', 'long', 'power', 'aero', 'burst'));
    const stored = sm.makeGhostFile(e, { ...e.benchmark, vehicle: 'bike' }, { name: 'Bench', paint: 'classic' });
    const restored = sm.loadFriendGhost(sm.readGhostFile(JSON.stringify(stored)));
    return { elapsed: lap.elapsed, gravel: gravelRide.elapsed, road: roadRide.elapsed, ghost: restored.event.id, i };
  });
  assert.ok(mtnEsm.every((m) => m.gravel < m.road));
  const powEsm = [['trail', { tyres: 'mud', suspension: 'soft' }, { tyres: 'road' }],
    ['ebike', { tyres: 'grip' }, { tyres: 'slick' }], ['chair', { wheels: 'outdoor' }, { wheels: 'indoor' }]].map(([v, off, road]) => {
    const stock = sm.buildVehicleTuning(v), loose = sm.buildVehicleTuning(v, off), slick = sm.buildVehicleTuning(v, road);
    const f = sm.courseFrame(sm.mountainUp, 167), [x, , z] = f.p;
    const braking = (w) => {
      sm.setActiveWeather(w);
      const r = sm.makeCyclist(sm.mountainCourses[0], sm.stockBike, v, stock);
      Object.assign(r, { position: [x, sm.parkHeight(x, z) + sm.ROAD_Y, z], heading: Math.atan2(f.f[2], f.f[0]), speed: 4, paved: false, brake: 1 });
      sm.moveCyclist(r, { brake: true, gas: false, left: false, right: false, sprint: false }, sm.PHYSICS_STEP);
      return { surface: r.surfaceKind, decel: 4 - r.speed };
    };
    return { vehicle: v, dry: braking('day'), wet: braking('rain'), grip: loose.gravelGrip > stock.gravelGrip && stock.gravelGrip > slick.gravelGrip };
  });
  sm.setActiveWeather('day');
  const powVm = legacy.inspect(`
    const frame=courseFrame(mountainUp,167), [x,,z]=frame.p;
    const input={brake:true,gas:false,left:false,right:false,sprint:false};
    function braking(vehicle,tuned,weather) {
      activeWeatherId=weather;
      const r=makeCyclist(mountainCourses[0],stockBike,vehicle,tuned);
      Object.assign(r,{position:[x,parkHeight(x,z)+ROAD_Y,z],heading:Math.atan2(frame.f[2],frame.f[0]),speed:4,paved:false,brake:1});
      moveCyclist(r,input,PHYSICS_STEP);
      return {surface:r.surfaceKind,decel:4-r.speed};
    }
    const res = [['trail',{tyres:'mud',suspension:'soft'},{tyres:'road'}],
      ['ebike',{tyres:'grip'},{tyres:'slick'}],['chair',{wheels:'outdoor'},{wheels:'indoor'}]].map(([v,off,road])=>{
      const stock=buildVehicleTuning(v), loose=buildVehicleTuning(v,off), slick=buildVehicleTuning(v,road);
      return {vehicle:v,dry:braking(v,stock,'day'),wet:braking(v,stock,'rain'),grip:loose.gravelGrip>stock.gravelGrip&&stock.gravelGrip>slick.gravelGrip};
    });
    activeWeatherId='day';
    return res;
  `);
  assert.deepEqual(powEsm, powVm);
  console.log('PASS [4/7] verify-mountain parity (climbs/descents + powered wet/dry gravel braking)');
}

// 5. Suite: verify-traffic.mjs (formations, protected starts, countdown/rejoin clock parity)
{
  const trEsm = ['szu', 'shunde', 'ucl'].map((campus) => {
    sm.setActiveCampus(campus); sm.buildRidingScene(campus);
    const event = sm.coursesByCampus[campus][0], trial = new sm.TimeTrial(event);
    const sig = (actors) => JSON.stringify(actors.map((a) => [a.start, a.speed, a.offset, a.direction]));
    const sparse = sm.makeTrafficFormation(sm.cityVehicles, 'sparse', 5, event.spawn);
    const standard = sm.makeTrafficFormation(sm.cityVehicles, 'standard', 5, event.spawn);
    trial.start();
    const countClock = sm.raceTrafficTime(trial);
    for (let i = 0; i < sm.COUNTDOWN_TICKS; i++) trial.step({});
    const goClock = sm.raceTrafficTime(trial);
    trial.step({});
    const firstTick = sm.raceTrafficTime(trial);
    trial.elapsed += sm.REJOIN_MS;
    const penaltyClock = sm.raceTrafficTime(trial);
    return {
      campus, sparse: sparse.length, standard: standard.length,
      off: sm.makeTrafficFormation(sm.cityVehicles, 'off', 5, event.spawn).length,
      same: sig(standard) === sig(sm.makeTrafficFormation(sm.cityVehicles, 'standard', 5, event.spawn)),
      countClock, goClock, firstTick, penaltyClock,
      weekly: sm.trafficSeedFor({ ...event, seed: 'S2-W20261123' }, null),
      draftingOff: trial.rider.drafting,
    };
  });
  const trVm = legacy.inspect(`
    const out=[];
    for(const campus of ['szu','shunde','ucl']) {
      activeCampus=campus;buildRidingScene(campus);
      const event=coursesByCampus[campus][0], trial=new TimeTrial(event);
      const sig=actors=>JSON.stringify(actors.map(a=>[a.start,a.speed,a.offset,a.direction]));
      const sparse=makeTrafficFormation(cityVehicles,'sparse',5,event.spawn);
      const standard=makeTrafficFormation(cityVehicles,'standard',5,event.spawn);
      trial.start();
      const countClock=raceTrafficTime(trial);
      for(let i=0;i<COUNTDOWN_TICKS;i++) trial.step({});
      const goClock=raceTrafficTime(trial);
      trial.step({});
      const firstTick=raceTrafficTime(trial);
      trial.elapsed+=REJOIN_MS;
      const penaltyClock=raceTrafficTime(trial);
      out.push({campus,sparse:sparse.length,standard:standard.length,
        off:makeTrafficFormation(cityVehicles,'off',5,event.spawn).length,
        same:sig(standard)===sig(makeTrafficFormation(cityVehicles,'standard',5,event.spawn)),
        countClock,goClock,firstTick,penaltyClock,
        weekly:trafficSeedFor({...event,seed:'S2-W20261123'},null),
        draftingOff:trafficDraftingAt(trial.rider,0,[])});
    }
    return out;
  `);
  const uclLegacy = trVm.find(probe => probe.campus === 'ucl');
  assert.deepEqual([uclLegacy.sparse, uclLegacy.standard], [0, 0], '1.9.1.1 did not stage UCL traffic');
  const expectedTraffic = trVm.map(probe => probe.campus === 'ucl' ? { ...probe, sparse: 18, standard: 29 } : probe);
  assert.deepEqual(trEsm, expectedTraffic);
  console.log('PASS [5/7] verify-traffic parity (formations & race clock)');
}

// 6. Suite: verify-190.mjs (skills, puddles/wind/courier, AI launch & contact, budget & moderation, replay)
{
  sm.setActiveCampus('shunde'); sm.buildRidingScene('shunde');
  const gas = { gas: true, brake: false, sprint: false, left: false, right: false };
  const pose = (kind, speed) => Object.assign(sm.makeCyclist(sm.parkCourse, sm.stockBike, kind), { position: [12, sm.ROAD_Y, 0], heading: 0, speed });
  const dt = sm.PHYSICS_STEP;
  const trail = pose('trail', 8), plain = pose('trail', 8);
  for (let i = 0; i < 52; i++) { sm.moveCyclist(trail, { ...gas, right: true, sprint: true }, dt); sm.moveCyclist(plain, { ...gas, right: true }, dt); }
  assert.equal(trail.skill, '手刹甩尾');
  sm.moveCyclist(trail, gas, dt);
  assert.equal(trail.skill, '出弯牵引');

  const electric = pose('ebike', 5), coast = pose('ebike', 5);
  electric.energy = coast.energy = .4;
  sm.moveCyclist(electric, { ...gas, gas: false }, dt); sm.moveCyclist(coast, gas, dt);
  assert.ok(electric.skill === '动能回收' && electric.energy > coast.energy);

  const boost = pose('ebike', 5);
  boost.energy = .024;
  for (let i = 0; i < 4; i++) sm.updateVehicleSkill(boost, { ...gas, sprint: true }, dt);
  assert.equal(boost.skill, '过热保护');
  for (let i = 0; i < 305; i++) sm.updateVehicleSkill(boost, { ...gas, gas: false }, dt);
  assert.ok(boost.overheat === 0 && boost.energy > .6);

  // Wind, puddles, courier across 3 campuses
  for (const campus of ['szu', 'ucl', 'shunde']) {
    sm.setActiveCampus(campus); sm.buildRidingScene(campus);
    const sites = sm.rainPuddleSites(campus), site = sites[0];
    const checkGrip = (weather) => {
      sm.setActiveWeather(weather);
      const r = sm.makeCyclist(sm.coursesByCampus[campus][0], sm.stockBike, 'bike');
      Object.assign(r, { position: [site.x, sm.rideElevation(site.x, site.z) + sm.ROAD_Y, site.z], heading: 0, speed: 6, steering: .45, paved: true });
      sm.moveCyclist(r, { gas: true, brake: false, left: false, right: true, sprint: false }, dt, campus === 'szu');
      return { puddle: r.inPuddle, grip: Math.abs(r.yawRate * r.speed) / r.gripLoad };
    };
    const dry = checkGrip('day'), wet = checkGrip('rain');
    assert.ok(!dry.puddle && wet.puddle && wet.grip < dry.grip * .69);
    const slow = { vehicle: 'chair', tuning: sm.buildVehicleTuning('chair'), position: sm.coursesByCampus[campus][0].spawn };
    sm.CampusCourier.stop();
    assert.equal(sm.CampusCourier.start(campus, slow.position, slow), true);
    const target = sm.CampusCourier.target.p;
    slow.position = [target[0] + 7.4, target[1], target[2]];
    sm.CampusCourier.tick(.1, slow, campus, 100);
    assert.equal(sm.CampusCourier.deliveries, 1);
  }
  sm.setActiveWeather('day');

  // AI team/duel, launch protection, collision contacts, budget/moderation isolation
  sm.setActiveCampus('ucl'); sm.buildRidingScene('ucl');
  const route = sm.londonCourses.find((e) => e.id === 'quad-sprint');
  for (const [mode, count] of [['team', 3], ['duel', 1]]) {
    const res = rideTestEsm(route, true, 180, sm.stockBike, mode);
    assert.equal(res.phase, 'done');
    assert.equal(res.trial.rivals.length, count);
    assert.equal(sm.aiRank(res.trial).total, count + 1);
  }

  sm.getPreferences().collision = true;
  for (const mode of ['team', 'duel']) for (const vehicle of ['bike', 'trail', 'ebike', 'chair']) {
    const trial = new sm.TimeTrial(route, sm.stockBike, vehicle);
    trial.raceMode = mode; trial.start();
    trial.advance(3.45, { gas: true, left: false, right: false, brake: false, sprint: false });
    assert.ok(trial.rider.rivalPoses.every((p) => p.startProtected));
    assert.equal(Boolean(trial.rider.collidedAt), false);
    trial.advance(3, { gas: true, left: false, right: false, brake: false, sprint: false });
    assert.equal(trial.rider.rivalPoses.some((p) => p.startProtected), false);
  }
  sm.getPreferences().collision = false;

  sm.getPreferences().soloBudget = '400';
  const expensive = new sm.TimeTrial(route, sm.buildBike('race', 'long', 'power', 'aero', 'burst'));
  assert.ok(expensive.start() === false && expensive.phase === 'free');
  sm.getPreferences().soloBudget = 'open';
  const illegal = new sm.TimeTrial(route, sm.buildBike('glue', 'stock', 'stock', 'gravity', 'rocket'));
  const beforeRec = sm.getStorage().getItem(sm.checkpointRecordKey(route, 'bike'));
  assert.ok(illegal.start() !== false && illegal.unranked);
  illegal.finishAt(55000);
  assert.throws(() => sm.makeGhostFile(route, illegal.lastRun, { name: 'QA', paint: 'classic' }), sm.GhostFileError);
  assert.equal(sm.trialMedal(illegal), '');
  assert.equal(sm.getStorage().getItem(sm.checkpointRecordKey(route, 'bike')), beforeRec);

  const a = { time: 1000, samples: [[0, 0, .04, 0, 0, 4, 0, 0], [1000, 10, .04, 0, 0, 6, 10, 0]], splits: [0, 1000] };
  const b = { time: 1200, samples: [[0, 0, .04, 0, 0, 3, 0, 0], [1200, 12, .04, 0, 0, 5, 12, 0]], splits: [0, 1200] };
  const rep = { time: 0, playing: true, speed: 2 };
  sm.advanceMapReplay(rep, .25, 1200);
  assert.equal(rep.time, 500);
  assert.equal(sm.replayAt(a, rep.time).position[0], 5);
  assert.equal(sm.replayGapAt(a, b, rep.time), -100);
  console.log('PASS [6/7] verify-190 parity (skills, puddles/wind/courier, AI launch, moderation, replay)');
}

// 7. Suite: verify-1.6.0.mjs posture physics parity
{
  const flatQuery = (grade) => ({
    ...sm.createWorldQuery('szu'),
    safeToRide: () => true,
    rideElevation: () => 0,
    surfaceAt: () => true,
    riderGrade: () => grade,
  });
  const input = { gas: false, brake: false, left: false, right: false, sprint: false };
  const downhill = (() => {
    const q = flatQuery(-.045);
    const rider = sm.makeCyclist(sm.courses[0], sm.stockBike, 'bike', null, q);
    rider.speed = 11;
    for (let t = 0; t < 360; t++) sm.moveCyclist(rider, input, sm.PHYSICS_STEP, false, null, null, sm.cityVehicles, q);
    const st = { posture: rider.posture, speed: rider.speed, distance: rider.travel };
    sm.moveCyclist(rider, { ...input, brake: true }, sm.PHYSICS_STEP, false, null, null, sm.cityVehicles, q);
    return { ...st, braking: rider.posture };
  })();
  const climb = (() => {
    const q = flatQuery(.09);
    const rider = sm.makeCyclist(sm.courses[0], sm.buildBike('stock', 'short', 'stock', 'agile', 'burst'), 'bike', null, q);
    rider.speed = 3.2;
    for (let t = 0; t < 72; t++) sm.moveCyclist(rider, { ...input, gas: true, sprint: true }, sm.PHYSICS_STEP, false, null, null, sm.cityVehicles, q);
    return { posture: rider.posture, speed: rider.speed, energy: rider.energy, cadence: rider.cadence };
  })();
  const vmPosture = legacy.inspect(`
    safeToRide=()=>true; rideElevation=()=>0; surfaceAt=()=>true;
    const input={gas:false,brake:false,left:false,right:false,sprint:false};
    riderGrade=()=>-.045;
    const dRider=makeCyclist(courses[0],stockBike,'bike'); dRider.speed=11;
    for(let t=0;t<360;t++) moveCyclist(dRider,input,PHYSICS_STEP);
    const ds={posture:dRider.posture,speed:dRider.speed,distance:dRider.travel};
    moveCyclist(dRider,{...input,brake:true},PHYSICS_STEP);
    const downhill={...ds,braking:dRider.posture};
    riderGrade=()=>.09;
    const cRider=makeCyclist(courses[0],buildBike('stock','short','stock','agile','burst'),'bike'); cRider.speed=3.2;
    for(let t=0;t<72;t++) moveCyclist(cRider,{...input,gas:true,sprint:true},PHYSICS_STEP);
    return {downhill,climb:{posture:cRider.posture,speed:cRider.speed,energy:cRider.energy,cadence:cRider.cadence}};
  `);
  assert.deepEqual({ downhill, climb }, vmPosture);
  console.log('PASS [7/7] verify-1.6.0 posture physics parity (downhill tuck & standing climb)');
}
