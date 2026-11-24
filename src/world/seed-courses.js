import { ROAD_Y, add, clamp, dot, mix, normalize, scale, subtract } from '../core/math.js';
import { getActiveCampus, worldState } from '../core/state.js';
import { brakingCorners, makeBenchmark } from '../race/records.js';
import { readSeedCode, seedRandom, seedVersion } from '../race/seed-code.js';
import { referenceCornerScores } from '../replay/ghost.js';
import { weeklyEnvironment } from './environment.js';
import {
  along, courseFrame, joinTrack, makeCourse, offsetVertex, pointDistance, section, street, travelTable,
} from './geometry.js';
import {
  betweenLakes, campusGates, canghaiStreets, cityLinks, eastTeachingCrossing, hillGrade,
  hillReturn, hospitalCrossing, inCampus, lakeRim, learningLink, lectureCross,
  libraryEastConnector, librarySouth, northSpine, northToSouth, openStreets, parkWalks,
  researchConnector, roads, southConnector, southToLake, sportsConnector, teachingConnector,
  throughCenter, westReturn, westToNorth,
} from './maps/szu.js';
import { junction, londonRoads, refineLondonRace } from './maps/ucl.js';
import { safeToRide, surfaceAt } from './query.js';

export function seedRoadNetwork(points, roadSpecs, endpoints, minimum, maximum) {
  const edges = new Map(Object.keys(points).map(id => [id, []]));
  for (const [path, name, ...stops] of roadSpecs) {
    for (let i = 1; i < stops.length; i++) {
      const from = stops[i - 1], to = stops[i];
      const { start, end } = section(path, points[from], points[to]);
      const span = Math.abs(end - start);
      if (span < 8) continue;
      const nearA = normalize(subtract(along(path, mix(start, end, .08)), along(path, start)));
      const nearB = normalize(subtract(along(path, end), along(path, mix(start, end, .92))));
      edges.get(from).push({ path, start, end, to, name, span, entry: nearA, exit: nearB });
      edges.get(to).push({ path, start: end, end: start, to: from, name, span, entry: scale(nearB, -1), exit: scale(nearA, -1) });
    }
  }
  return { points, edges, endpoints, minimum, maximum };
}

export function londonSeedRoads() {
  const points = {
    ...junction, quad: [34, 0], hospital: [-61, -139], books: [0, 46], heal: [-148, 353],
    site: [-224, 178], tube: [406, 382], ioe: [260, 234], senate: [67, 392], russell: [272, 523],
    street: [-106, 395], cheniesGower: [5, 303], cheniesCourt: [-150, 280], storeCourt: [-145, 391],
    soas: [185, 255], stPancras: [368, -119], woburnEndsleigh: [335, -51], endsleighGordon: [121, -63],
    endsleighTaviton: [174, -58], endsleighStreetN: [217, -56], endsleighTavistock: [257, -52],
    tavitonGordon: [182, 79], tavistockNW: [251, 79], tavistockNorthMid: [292, 78], tavistockNE: [336, 78],
    capperCourt: [-164, 111], capperHuntley: [-103, 119], huntleyTorrington: [-104, 180], huntleyMed: [-104, 86],
    torringtonSqEnd: [126, 264], soasCorner: [126, 331], brunei: [162, 331], galleryThornhaugh: [199, 331],
    maletCourt: [50, 94], museum: [158, 515],
  };
  const roadList = [
    ['quad', 'Main Quad', 'quadGate', 'quad'],
    ['euston', 'Euston Road', 'eustonCourt', 'hospital', 'eustonGower', 'eustonGordon', 'eustonWoburn', 'stPancras'],
    ['gower', 'Gower Street', 'eustonGower', 'gowerPlaceWest', 'graftonGower', 'quadGate', 'books', 'universityGower',
      'torringtonGower', 'cheniesGower', 'gowerKeppel'],
    ['court', 'Tottenham Court Road', 'eustonCourt', 'graftonCourt', 'universityCourt', 'capperCourt',
      'torringtonCourt', 'cheniesCourt', 'heal', 'storeCourt'],
    ['grafton', 'Grafton Way', 'graftonCourt', 'huntleyGrafton', 'graftonGower'],
    ['huntley', 'Huntley Street', 'huntleyGrafton', 'universityHuntley', 'huntleyMed', 'capperHuntley', 'huntleyTorrington'],
    ['capper', 'Capper Street', 'capperCourt', 'capperHuntley'],
    ['university', 'University Street', 'universityCourt', 'universityHuntley', 'universityGower'],
    ['gowerPlace', 'Gower Place', 'gowerPlaceWest', 'gowerPlaceEast'],
    ['gordon', 'Gordon Street', 'eustonGordon', 'gowerPlaceEast', 'endsleighGordon', 'gordonNW', 'gordonSW', 'byngGordon'],
    ['gordonNorth', 'Gordon Square', 'gordonNW', 'tavitonGordon', 'gordonNE'],
    ['gordonEast', 'Gordon Square', 'gordonNE', 'gordonSE'],
    ['gordonSouth', 'Gordon Square', 'gordonSW', 'gordonSE', 'bedfordTavistock'],
    ['endsleigh', 'Endsleigh Gardens', 'endsleighGordon', 'endsleighTaviton', 'endsleighStreetN', 'endsleighTavistock', 'woburnEndsleigh'],
    ['taviton', 'Taviton Street', 'endsleighTaviton', 'tavitonGordon'],
    ['endsleighStreet', 'Endsleigh Street', 'endsleighStreetN', 'gordonNE'],
    ['endsleighPlace', 'Endsleigh Place', 'gordonNE', 'tavistockNW'],
    ['tavistockWest', 'Tavistock Square', 'endsleighTavistock', 'tavistockNW', 'bedfordTavistock'],
    ['tavistockNorth', 'Tavistock Square', 'tavistockNW', 'tavistockNorthMid', 'tavistockNE'],
    ['torrington', 'Torrington Place', 'site', 'torringtonCourt', 'huntleyTorrington', 'torringtonGower', 'maletTorrington'],
    ['byng', 'Byng Place', 'maletTorrington', 'byngGordon', 'byngTorrington', 'byngWoburn'],
    ['maletPlace', 'Malet Place', 'maletTorrington', 'maletCourt'],
    ['woburn', 'Woburn Square', 'byngWoburn', 'soas'],
    ['woburnEast', 'Woburn Square', 'gordonSE', 'soas'],
    ['torringtonSq', 'Torrington Square', 'byngTorrington', 'torringtonSqEnd'],
    ['soasWalk', 'Torrington Square', 'torringtonSqEnd', 'soasCorner'],
    ['galleryWalk', 'Brunei Gallery', 'soasCorner', 'brunei', 'galleryThornhaugh'],
    ['thornhaugh', 'Thornhaugh Street', 'soas', 'galleryThornhaugh', 'russellNW'],
    ['bedford', 'Bedford Way', 'bedfordTavistock', 'ioe', 'russellNW'],
    ['tavistockSouth', 'Tavistock Place', 'bedfordTavistock', 'tavistockWoburn'],
    ['woburnPlace', 'Upper Woburn Place', 'eustonWoburn', 'woburnEndsleigh', 'tavistockNE', 'tavistockWoburn'],
    ['woburnLower', 'Woburn Place', 'tavistockWoburn', 'russellNE'],
    ['russellNorth', 'Russell Square', 'russellNW', 'russellNE'],
    ['bernard', 'Bernard Street', 'russellNE', 'tube'],
    ['russellEast', 'Russell Square', 'russellNE', 'russellSE'],
    ['russellSouth', 'Russell Square', 'russellSW', 'russell', 'russellSE'],
    ['russellWest', 'Russell Square', 'russellNW', 'russellSW'],
    ['malet', 'Malet Street', 'maletTorrington', 'senate', 'maletKeppel', 'maletMontague'],
    ['montague', 'Montague Place', 'maletMontague', 'museum', 'russellSW'],
    ['keppel', 'Keppel Street', 'gowerKeppel', 'maletKeppel'],
    ['store', 'Store Street', 'storeCourt', 'street', 'gowerKeppel'],
    ['chenies', 'Chenies Street', 'cheniesCourt', 'cheniesGower'],
  ];
  return seedRoadNetwork(points, roadList.map(([id, ...data]) => [londonRoads.get(id), ...data]), {
    quad: 'UCL 主庭院', hospital: 'UCLH · Euston Road', heal: 'Tottenham Court Road',
    senate: 'Senate House', ioe: 'IOE · Bedford Way', tube: 'Russell Square 地铁站', russell: 'Russell Square 南侧',
    stPancras: '圣潘克拉斯教堂', tavistockNorthMid: 'Tavistock Square 北侧', huntleyMed: 'UCL 医学区 · Huntley St',
    brunei: 'SOAS · Brunei Gallery', maletCourt: 'Malet Place 工程院', museum: '大英博物馆 · Montague Pl',
  }, 370, 1280);
}

export function shenzhenSeedRoads() {
  const [nanhai, shennan, baishi, cityEast] = openStreets.map(s => s.path);
  const [lideNorth, , lizhi, , liyan, , lixin] = cityLinks.map(s => s.path);
  const lane = (road, offset) => travelTable(road.rows.map(row => offsetVertex(courseFrame(road, row.distance), offset, ROAD_Y)));
  const nanhaiNorth = lane(nanhai, -5.7), shennanEast = lane(shennan, 11.0);
  const baishiEast = lane(baishi, 4.20), eastNorth = lane(cityEast, -3.65);

  const lideCurve = joinTrack([section(lideNorth, [-92.35, 22.3], [-113, 22]),
    section(street([[-113, 22], [-116, 18], [-117, 11], [-117, 2]]))]);
  const parkEntry = joinTrack([section(street([[-125, -112], [-126, -119], [-128, -123], [-131, -124]])),
    section(parkWalks[1], [-131, -124], [-167, -125])]);
  const dIn = pointDistance(parkWalks[0], [-167, -125]), dOut = pointDistance(parkWalks[0], [-234, -192]);
  const parkSouth = joinTrack([{ path: parkWalks[0], start: dIn, end: dOut }]);
  const parkNorth = joinTrack([section(parkWalks[2], [-234, -192], [-227.5, -223]),
    section(street([[-227.5, -223], [-226.5, -228.5], [-222.5, -231.2], [-216, -232], [-206, -232]]))]);
  const lizhiCurve = joinTrack([section(street([[30, -233], [36.5, -232.2], [39.5, -229], [40, -224]])),
    section(lizhi, [40, -224], campusGates[1].xy), section(roads[9], campusGates[1].xy, [11, -149])]);

  const liyanCurve = joinTrack([section(roads[10], [107, 151], campusGates[3].xy),
    section(liyan, campusGates[3].xy, [99.1, 186.8]), section(street([[99.1, 186.8], [105, 191], [114, 191.5], [124, 189.2]]))]);
  const baishiTurn = joinTrack([section(baishiEast, [124, 189.2], [178, 175.5]),
    section(street([[178, 175.5], [184, 171], [188.5, 162], [190.4, 145]]))]);
  const lixinCurve = joinTrack([section(street([[281.5, -124], [283, -130], [282.14, -134.8]])),
    section(lixin, [282.14, -134.8], campusGates[5].xy), section(roads[12], campusGates[5].xy, [247, -142])]);

  const xy = point => [point[0], point[2]];
  const points = {
    west: [-92, 39], westCentre: [-92, 25], westTeach: [-103, -7], northLecture: [-33, -78],
    research: [86, -134], sports: [130, -171], northeast: [149, -185], eastLixin: [247, -142], eastSport: [192, -56], eastTeach: [153, -20],
    eastHosp: [143, 0], eastCentre: [142, 30], eastLibrary: [138, 60], south: [107, 151], southFork: [8, 176],
    lakeSouth: [-62, 188], southwest: [-114, 203], southGate: [-166, 222], westNorth: [-91, -158], north: [-52, -161],
    lecture: [11, -149], spine: [-46, -20], eastSpine: [90, -21], centralLake: [-52, 15], centralSouth: [24, 18],
    hospital: [84, 12], hillWest: [-64, 44], hillEast: [1, 72], lakeWest: [-66, 103], lakeEast: [-2, 91],
    southLibrary: [-3, 107], libraryCorner: [77, 75], library: [102, 33],
    nanhaiLide: xy(lideCurve.rows.at(-1).p), nanhaiPark: xy(parkEntry.rows[0].p),
    parkEast: [-167, -125], parkWest: [-234, -192], shennanPark: xy(parkNorth.rows.at(-1).p),
    tencent: [-12, -234], shennanLizhi: xy(lizhiCurve.rows[0].p),
    baishiLiyan: xy(liyanCurve.rows.at(-1).p), eastCorner: xy(baishiTurn.rows.at(-1).p),
    vup: [252, -70], eastCityLixin: xy(lixinCurve.rows[0].p),
  };
  const network = seedRoadNetwork(points, [
    [westToNorth, '北区环道', 'west', 'westCentre', 'westTeach', 'northLecture', 'research', 'sports', 'northeast'],
    [northToSouth, '东侧环道', 'northeast', 'eastLixin', 'eastSport', 'eastTeach', 'eastHosp', 'eastCentre', 'eastLibrary', 'south'],
    [southToLake, '南侧环道', 'south', 'southFork', 'lakeSouth', 'southwest', 'southGate'],
    [westReturn, '西岸林荫道', 'southwest', 'west'],
    [teachingConnector, '北区教学道', 'westTeach', 'westNorth', 'north', 'lecture'],
    [lectureCross, '汇文楼联络道', 'lecture', 'northLecture'],
    [learningLink, '教学区联络道', 'northLecture', 'spine'],
    [northSpine, '东侧横街', 'westTeach', 'spine', 'eastSpine', 'eastTeach'],
    [sportsConnector, '体育馆外侧', 'sports', 'eastSport'],
    [researchConnector, '研究区联络道', 'research', 'eastSpine'],
    [eastTeachingCrossing, '教学楼外道', 'eastSpine', 'hospital'],
    [hospitalCrossing, '校医院联络道', 'hospital', 'eastHosp'],
    [throughCenter, '中央联络道', 'westCentre', 'centralLake', 'centralSouth', 'hospital', 'eastCentre'],
    [betweenLakes, '双湖之间', 'centralLake', 'hillWest', 'lakeWest', 'lakeSouth'],
    [hillReturn, '杜鹃山坡脚', 'hillWest', 'hillEast'],
    [southConnector, '南馆外道', 'centralSouth', 'hillEast', 'lakeEast', 'southLibrary', 'southFork'],
    [lakeRim, '文山湖畔', 'lakeEast', 'lakeWest'],
    [librarySouth, '南馆外环', 'southLibrary', 'libraryCorner', 'library'],
    [libraryEastConnector, '东侧联络道', 'libraryCorner', 'eastLibrary'],
    [lideCurve, '立德门通道', 'westCentre', 'nanhaiLide'],
    [nanhaiNorth, '南海大道', 'nanhaiLide', 'nanhaiPark'],
    [parkEntry, '荔香公园东口', 'nanhaiPark', 'parkEast'],
    [parkSouth, '荔香公园步道', 'parkEast', 'parkWest'],
    [parkNorth, '荔香公园北口', 'parkWest', 'shennanPark'],
    [shennanEast, '深南大道', 'shennanPark', 'tencent', 'shennanLizhi'],
    [lizhiCurve, '立志门通道', 'shennanLizhi', 'lecture'],
    [liyanCurve, '立言门通道', 'south', 'baishiLiyan'],
    [baishiTurn, '白石路', 'baishiLiyan', 'eastCorner'],
    [eastNorth, '东侧联络路', 'eastCorner', 'vup', 'eastCityLixin'],
    [lixinCurve, '立心门通道', 'eastCityLixin', 'eastLixin'],
  ], {
    north: '北区教学楼', sports: '体育馆北侧', eastCentre: '东侧教学区', lakeWest: '文山湖',
    southGate: '南侧环道', library: '南图书馆',
    parkWest: '荔香公园', tencent: 'Southizzahut 大厦 · 深南大道', vup: '深圳虚拟大学园',
  }, 320, 1080);
  network.cityAccess = true;
  return network;
}

export const seedNetworks = { szu: shenzhenSeedRoads, ucl: londonSeedRoads };
export const loadedSeedNetworks = new Map();

export function viableSeedTrack(path, network, campus = getActiveCampus()) {
  if (path.length < network.minimum || path.length > network.maximum) return false;
  const access = Boolean(network.cityAccess);
  const clear = (x, z) => safeToRide(x, z, access, false, campus) && surfaceAt(x, z, access, campus);
  const start = courseFrame(path, 0), finish = courseFrame(path, path.length);
  for (const [frame, offset] of [[start, -5.2], [start, -2.6], [finish, .8]]) {
    const [x, , z] = add(frame.p, scale(frame.f, offset));
    if (!clear(x, z)) return false;
  }
  const occupied = new Map();
  for (let distance = 0; distance < path.length; distance += 2.4) {
    const frame = courseFrame(path, distance), [x, , z] = frame.p;
    const grade = campus === 'szu' ? Math.abs(hillGrade(x, z, frame.f[0], frame.f[2])) : 0;
    const turn = dot(courseFrame(path, distance - 2.8).f, courseFrame(path, distance + 2.8).f);
    if (turn < -.31 || grade > .149 || turn < .66 && grade > .082) return false;
    const a = Math.floor(x / 3), b = Math.floor(z / 3);
    for (let i = a - 1; i <= a + 1; i++) for (let j = b - 1; j <= b + 1; j++) {
      const nearby = occupied.get(i + ',' + j) ?? [];
      if (nearby.some(p => distance - p.distance > 15 && Math.hypot(x - p.x, z - p.z) < 2.9)) return false;
    }
    const key = a + ',' + b;
    if (!occupied.has(key)) occupied.set(key, []);
    occupied.get(key).push({ x, z, distance });
  }
  for (let distance = 0; distance <= path.length; distance += .75) {
    const frame = courseFrame(path, distance);
    for (const offset of [-.48, .48]) {
      const [x, , z] = offsetVertex(frame, offset, 0);
      if (!clear(x, z)) return false;
    }
  }
  return clear(finish.p[0], finish.p[2]);
}

export function searchSeedTrack(network, random, campus = getActiveCampus()) {
  const { points, edges, endpoints, minimum, maximum } = network;
  const targets = Object.keys(endpoints);
  const separation = (a, b) => Math.hypot(points[a][0] - points[b][0], points[a][1] - points[b][1]);
  for (let attempt = 0; attempt < 24; attempt++) {
    const start = targets[Math.floor(random() * targets.length)];
    const goals = targets.filter(node => separation(node, start) > minimum * .45);
    const goal = goals[Math.floor(random() * goals.length)];
    const visited = new Set([start]), route = [];
    const preferredLength = mix(minimum, maximum, .21 + random() * .53);
    let budget = 340, checks = 0;
    function visit(node, length) {
      if (--budget < 0 || checks >= 7 || length + separation(node, goal) > maximum + 16) return null;
      if (node === goal) {
        if (route.length < 4 || length < minimum) return null;
        checks++;
        const starts = [], path = joinTrack(route, starts);
        if (viableSeedTrack(path, network, campus)) return { path, route: route.slice(), starts, start, goal };
        return null;
      }
      if (route.length >= 22) return null;
      const previous = route.at(-1);
      const options = edges.get(node).filter(edge => !visited.has(edge.to) &&
        (!previous || dot(previous.exit, edge.entry) > -.57));
      const pull = length + separation(node, goal) > preferredLength ? 1.32 : .22;
      const choices = options.map(edge => ({ edge, score: random() + pull * separation(edge.to, goal) / minimum }));
      choices.sort((a, b) => a.score - b.score);
      for (const { edge } of choices) {
        route.push(edge);
        visited.add(edge.to);
        const candidate = visit(edge.to, length + edge.span);
        if (candidate) return candidate;
        visited.delete(edge.to);
        route.pop();
      }
      return null;
    }
    const course = visit(start, 0);
    if (course) return course;
  }
  return null;
}

export function straightGateDistance(path, target, minDist, maxDist) {
  let bestDist = clamp(target, minDist, maxDist), bestScore = -Infinity;
  const lo = Math.max(minDist, target - 30);
  const hi = Math.min(maxDist, target + 30);
  for (let d = lo; d <= hi; d += 2) {
    const f0 = courseFrame(path, d).f;
    let minDot = 1;
    for (const step of [-10, -5, 5, 10]) {
      const q = clamp(d + step, 0, path.length);
      minDot = Math.min(minDot, dot(f0, courseFrame(path, q).f));
    }
    const score = minDot - Math.abs(d - target) * 0.003;
    if (score > bestScore) { bestScore = score; bestDist = d; }
  }
  return bestDist;
}

export function makeSeedCourse(code, campus) {
  if (getActiveCampus() !== campus || readSeedCode(code, campus) !== code) return null;
  if (!loadedSeedNetworks.has(campus)) loadedSeedNetworks.set(campus, seedNetworks[campus]());
  const network = loadedSeedNetworks.get(campus);
  let candidate = searchSeedTrack(network, seedRandom(code), campus);
  const weekly = new RegExp('^[SU]' + seedVersion + '-W\\d{8}$').test(code);
  if (weekly && !candidate) candidate = searchSeedTrack(network, seedRandom(readSeedCode('326', campus)), campus);
  if (!candidate) return null;
  const { path, route, starts, start, goal } = candidate;
  const startName = network.endpoints[start], goalName = network.endpoints[goal];
  const spec = [[0, startName]], count = Math.max(3, Math.round(path.length / 112));
  let prevDist = 0;
  for (let i = 1; i <= count; i++) {
    const raw = path.length * i / (count + 1);
    const minAllowed = Math.max(prevDist + 45, 45);
    const maxAllowed = Math.max(minAllowed, path.length - (count - i + 1) * 45);
    const distance = straightGateDistance(path, raw, minAllowed, maxAllowed);
    prevDist = distance;
    let part = 0;
    while (part < starts.length - 1 && path.rows[starts[part + 1]].distance <= distance) part++;
    spec.push([distance, route[part].name]);
  }
  spec.push([path.length, goalName]);
  const cityAccess = campus === 'szu' && path.rows.some(({ p: [x, , z] }) => !inCampus(x, z));
  const event = makeCourse('seed-' + code, (weekly ? '每周挑战 ' : '种子赛 ') + code,
    startName + ' → ' + goalName + ' · ' + Math.round(path.length) + ' 米', path, spec, path.length,
    { absolute: true, campus, cityAccess, thresholds: [.965, 1.11, 1.29] });
  event.seed = code;
  event.environment = weekly ? weeklyEnvironment(code) : null;
  event.corners = brakingCorners(event);
  event.benchmark = makeBenchmark(event);
  event.benchmark.corners = referenceCornerScores(event, event.benchmark);
  event.medalTimes = Object.fromEntries(['gold', 'silver', 'bronze'].map((name, i) =>
    [name, Math.round(event.benchmark.time * event.thresholds[i] / 10) * 10]));
  if (campus === 'ucl') refineLondonRace(event);
  return event;
}

worldState.hooks.makeSeedCourse = makeSeedCourse;

export const availableCourses = campus => worldState.seedCourses?.[campus]
  ? [...(worldState.coursesByCampus?.[campus] ?? []), worldState.seedCourses[campus]]
  : (worldState.coursesByCampus?.[campus] ?? []);
