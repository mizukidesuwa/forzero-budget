import { ROAD_Y, TAU } from '../core/math.js';
import { Shape } from '../core/shape.js';
import { getActiveCampus, getStorage, worldState } from '../core/state.js';
import { stockBike } from '../ride/vehicles.js';
import { rideElevation } from '../world/query.js';

export const COURIER_KEY = 'szu-litchi-explorer-1';

export const COURIER_SITE_SPECS = {
  szu: [
    { name: '汇文楼广场', courseId: 'endurance', gateName: '汇文楼发车', district: '北区书院' },
    { name: '汇典楼 · 北馆', courseId: 'libraries', gateName: '汇典楼', district: '图书馆群' },
    { name: '汇智楼 · 南馆', courseId: 'libraries', gateName: '汇智楼', district: '图书馆群' },
    { name: '演会中心', courseId: 'libraries', gateName: '演会中心', district: '中央广场' },
    { name: '元平体育馆', courseId: 'canghai-tech', gateName: '体育馆北侧', district: '体育中心' },
    { name: '文山湖畔', courseId: 'lakes', gateName: '上文山湖', district: '双湖绿道' },
    { name: '杜鹃山脊', courseId: 'dujuan-climb', gateName: '杜鹃山脊', district: '山地坡道' },
    { name: '立德门', courseId: 'lixiang-park', gateName: '立德门', district: '西门大道' },
    { name: '荔香公园 · 南山明珠', courseId: 'lixiang-park', gateName: '荔香公园南环', district: '市政公园' },
    { name: 'Southizzahut 大厦 · 深南大道', courseId: 'lixiang-park', gateName: 'Southizzahut 大厦 · 深南大道', district: '科技大道' },
  ],
  ucl: [
    { name: 'UCL · Main Quad', courseId: 'quad-sprint', gateName: 'UCL · Main Quad', district: 'Gower St' },
    { name: 'Cruciform Building', courseId: 'quad-sprint', gateName: 'Cruciform 对街', district: 'Gower St' },
    { name: 'Student Centre', courseId: 'alleyway-slalom', gateName: 'UCL 学生中心', district: 'Gordon St' },
    { name: 'Gordon Square', courseId: 'square-circuit', gateName: 'Gordon Square 东侧', district: 'Bloomsbury' },
    { name: 'Tavistock Square', courseId: 'st-pancras-squares', gateName: 'Tavistock 北侧', district: 'Bloomsbury' },
    { name: 'Russell Square', courseId: 'square-circuit', gateName: 'Russell Square 北侧', district: 'Bloomsbury' },
    { name: 'Senate House', courseId: 'store-museum-gp', gateName: 'Senate House', district: 'Malet St' },
    { name: 'IOE · Bedford Way', courseId: 'square-circuit', gateName: 'IOE · Bedford Way', district: 'Bedford Way' },
    { name: 'British Museum · Montague', courseId: 'store-museum-gp', gateName: '大英博物馆 · Montague', district: 'Montague St' },
    { name: 'St Pancras Church', courseId: 'st-pancras-squares', gateName: '圣潘克拉斯教堂', district: 'Euston Rd' },
  ],
  shunde: [
    { name: '顺峰山牌坊广场', courseId: 'qingyun-lake', gateName: '顺峰山公园牌坊', district: '北门广场' },
    { name: '桂海芳丛', courseId: 'qingyun-lake', gateName: '桂海芳丛', district: '花海步道' },
    { name: '西岸林荫', courseId: 'qingyun-lake', gateName: '西岸林荫', district: '青云湖西' },
    { name: '南岸开阔段', courseId: 'qingyun-lake', gateName: '南岸开阔段', district: '青云湖南' },
    { name: '九孔伏波桥', courseId: 'qingyun-lake', gateName: '伏波桥', district: '双湖交汇' },
    { name: '青云塔山脚', courseId: 'qingyun-lake', gateName: '青云塔山脚', district: '塔影湖岸' },
    { name: '林荫缓坡', courseId: 'shenbu-climb', gateName: '林荫缓坡', district: '神步山上山' },
    { name: '山腰短平台', courseId: 'shenbu-climb', gateName: '山腰短平台', district: '神步山腰' },
    { name: '神步山观景台', courseId: 'shenbu-climb', gateName: '神步山观景台', district: '山顶观景' },
    { name: '坡脚减速线', courseId: 'shenbu-descent', gateName: '坡脚减速线', district: '神步山下坡' },
  ],
};

const resolvedCourierSites = { szu: null, ucl: null, shunde: null };

export function courierLandmarks(campus, coursesMap = worldState.coursesByCampus) {
  if (resolvedCourierSites[campus]) return resolvedCourierSites[campus];
  const specs = COURIER_SITE_SPECS[campus] ?? [];
  const events = coursesMap?.[campus] ?? [];
  const items = [];
  for (const spec of specs) {
    const course = events.find(c => c.id === spec.courseId);
    const gate = course?.gates.find(g => g.name === spec.gateName);
    if (!gate) continue;
    const gx = gate.p[0], gz = gate.p[2];
    const gy = rideElevation(gx, gz, campus);
    items.push({ name: spec.name, district: spec.district, courseId: spec.courseId, gateName: spec.gateName, p: [gx, gy + ROAD_Y, gz] });
  }
  resolvedCourierSites[campus] = items;
  return items;
}

export function nearestCourierLandmark(campus, x, z, maxDist = 42) {
  let best = null, bestD2 = maxDist * maxDist;
  for (const site of courierLandmarks(campus)) {
    const dx = site.p[0] - x, dz = site.p[2] - z, d2 = dx * dx + dz * dz;
    if (d2 < bestD2) { bestD2 = d2; best = site.name; }
  }
  return best;
}

export function defaultExplorerProgress() {
  return { bestStreak: 0, totalDeliveries: 0, discovered: { szu: [], ucl: [], shunde: [] } };
}

export function readExplorerProgress() {
  try {
    const raw = JSON.parse(getStorage()?.getItem(COURIER_KEY));
    if (!raw || typeof raw !== 'object') return defaultExplorerProgress();
    return {
      bestStreak: Number.isInteger(raw.bestStreak) && raw.bestStreak >= 0 ? raw.bestStreak : 0,
      totalDeliveries: Number.isInteger(raw.totalDeliveries) && raw.totalDeliveries >= 0 ? raw.totalDeliveries : 0,
      discovered: {
        szu: Array.isArray(raw.discovered?.szu) ? raw.discovered.szu.filter(s => typeof s === 'string') : [],
        ucl: Array.isArray(raw.discovered?.ucl) ? raw.discovered.ucl.filter(s => typeof s === 'string') : [],
        shunde: Array.isArray(raw.discovered?.shunde) ? raw.discovered.shunde.filter(s => typeof s === 'string') : [],
      },
    };
  } catch { return defaultExplorerProgress(); }
}

export const CampusCourier = {
  active: false,
  campus: 'szu',
  target: null,
  remaining: 0,
  deliveries: 0,
  streak: 0,
  lastLegDist: 0,
  summaryText: '',
  summaryUntil: 0,
  progress: readExplorerProgress(),

  saveProgress() {
    try { getStorage()?.setItem(COURIER_KEY, JSON.stringify(this.progress)); } catch {}
    worldState.hooks.scheduleSave?.();
  },

  discoveredCount(campus) {
    return this.progress.discovered[campus]?.length ?? 0;
  },

  pickTarget(campus, pos, excludeName = null) {
    const sites = courierLandmarks(campus);
    if (!sites.length) return null;
    const seen = new Set(this.progress.discovered[campus] ?? []);
    const candidates = sites.filter(s => s.name !== excludeName && Math.hypot(s.p[0] - pos[0], s.p[2] - pos[2]) >= 90);
    const pool = candidates.length ? candidates : sites.filter(s => s.name !== excludeName);
    const list = pool.length ? pool : sites;
    const unseen = list.filter(s => !seen.has(s.name));
    const chosenPool = unseen.length && Math.random() < 0.72 ? unseen : list;
    const picked = chosenPool[Math.floor(Math.random() * chosenPool.length)];
    this.lastLegDist = Math.hypot(picked.p[0] - pos[0], picked.p[2] - pos[2]);
    return picked;
  },

  allowance(rider) {
    const drive = rider?.vehicle === 'bike' ? rider.bike : rider?.tuning;
    const cruise = Math.max(3.6, (drive?.roadSpeed ?? stockBike.roadSpeed) * .65);
    const detour = this.campus === 'shunde' ? 2.1 : 1.75;
    const climb = Math.max(0, this.target.p[1] - (rider?.position?.[1] ?? 0));
    return Math.ceil(Math.max(18, this.lastLegDist / cruise * (detour - Math.min(.15, this.streak * .015)) + climb * .55 + 12));
  },

  start(campus = getActiveCampus(), pos = worldState.race.rider.position, rider = worldState.race?.rider ?? null) {
    if (worldState.race && worldState.race.phase !== 'free') return false;
    if (worldState.onlineRoom) return false;
    const picked = this.pickTarget(campus, pos);
    if (!picked) return false;
    this.active = true;
    this.campus = campus;
    this.target = picked;
    this.deliveries = 0;
    this.streak = 0;
    this.remaining = this.allowance(rider);
    this.summaryText = '';
    this.summaryUntil = 0;
    worldState.hooks.playSound?.('go');
    return true;
  },

  stop(showSummary = false, now = performance.now()) {
    if (!this.active) return;
    if (showSummary) {
      this.summaryText = `闪送结束 · 完成 ${this.deliveries} 单 · 最高连单 ${this.progress.bestStreak}（探索 ${this.discoveredCount(this.campus)}/${courierLandmarks(this.campus).length || 10}）`;
      this.summaryUntil = now + 4200;
      worldState.hooks.playSound?.('rejoin');
    }
    this.active = false;
    this.target = null;
    this.remaining = 0;
  },

  tick(dt, rider, campus, now) {
    if (!this.active || !this.target) return;
    const roomActive = Boolean(worldState.onlineRoom);
    if (roomActive || (worldState.race && worldState.race.phase !== 'free') || campus !== this.campus) {
      this.stop(false, now);
      return;
    }
    this.remaining = Math.max(0, this.remaining - dt);
    const dist = Math.hypot(rider.position[0] - this.target.p[0], rider.position[2] - this.target.p[2]);
    if (dist <= 7.8 && Math.abs(rider.position[1] - this.target.p[1]) < 3) {
      this.deliveries++;
      this.streak++;
      this.progress.totalDeliveries++;
      if (this.streak > this.progress.bestStreak) this.progress.bestStreak = this.streak;
      const list = this.progress.discovered[campus] ?? (this.progress.discovered[campus] = []);
      if (!list.includes(this.target.name)) list.push(this.target.name);
      this.saveProgress();
      this.summaryText = `已送达 ${this.target.name}`;
      this.summaryUntil = now + 2200;
      worldState.hooks.playSound?.('checkpoint');
      this.target = this.pickTarget(campus, rider.position, this.target.name);
      if (this.target) this.remaining = this.allowance(rider);
      return;
    }
    if (this.remaining <= 0) this.stop(true, now);
  },
};

export function makeCourierBeaconShape() {
  const shape = new Shape();
  shape.tube([0, 0.05, 0], [0, 6.3, 0], 0.28, 0.13, '#59e4b4', 8);
  shape.ellipsoid([0, 6.65, 0], [0.7, 0.78, 0.7], '#f7dd78', 10, 6);
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * TAU, a1 = ((i + 1) / 8) * TAU;
    shape.tube([Math.cos(a0) * 2.8, 0.09, Math.sin(a0) * 2.8], [Math.cos(a1) * 2.8, 0.09, Math.sin(a1) * 2.8], 0.09, 0.09, '#7ff5cb', 6);
  }
  return shape;
}
