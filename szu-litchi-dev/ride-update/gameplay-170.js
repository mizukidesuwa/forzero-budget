const COURIER_KEY = 'szu-litchi-explorer-1';
const WEEKLY_SEED_PATTERN = /^[SU]\d-W\d{8}$/;
const WIND_LABELS = ['偏西风', '西北风', '偏北风', '东北风', '偏东风', '东南风', '偏南风', '西南风'];
const WEEKLY_WEATHERS = ['day', 'sunset', 'night', 'rain'];
const MEDAL_LABELS = { author: '紫牌', gold: '金牌', silver: '银牌', bronze: '铜牌', '': '' };
const MEDAL_RANKS = { author: 4, gold: 3, silver: 2, bronze: 1, '': 0 };

const COURIER_SITE_SPECS = {
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

function liveDeltaMs(raceObj) {
  if (!raceObj || raceObj.phase !== 'race') return null;
  const gates = raceObj.event?.gates;
  const refSplits = raceObj.reference?.splits;
  const next = raceObj.nextGate;
  if (!gates || !refSplits || next <= 0 || next >= gates.length) return null;
  const prevGate = gates[next - 1], nextGate = gates[next];
  const refPrev = refSplits[prevGate.index], refNext = refSplits[nextGate.index];
  if (!Number.isFinite(refPrev) || !Number.isFinite(refNext) || refNext <= refPrev) return null;
  const span = Math.max(1, nextGate.distance - prevGate.distance);
  const frac = clamp((raceObj.progressEstimate - prevGate.distance) / span, 0, 1);
  const practiceOffset = (raceObj.practice?.fromGate > 0) ? (refSplits[raceObj.practice.fromGate] ?? 0) : 0;
  return raceObj.elapsed - (mix(refPrev, refNext, frac) - practiceOffset);
}

function weeklyEnvironment(seedCode) {
  if (typeof seedCode !== 'string' || !WEEKLY_SEED_PATTERN.test(seedCode)) return null;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedCode.length; i++) {
    h ^= seedCode.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const weather = WEEKLY_WEATHERS[h % WEEKLY_WEATHERS.length];
  const dirIdx = (h >>> 3) & 7;
  const angle = dirIdx * (Math.PI / 4);
  const speed = Number((1.0 + ((h >>> 6) % 15) * 0.1).toFixed(1));
  return {
    seed: seedCode,
    weather,
    angle,
    vector: [Math.cos(angle), Math.sin(angle)],
    speed,
    label: WIND_LABELS[dirIdx],
    grade: speed < 1.6 ? '1级风' : '2级风',
  };
}

function makeCustomWind(speed, dir = 0, weather = 'day') {
  const s = Number.isFinite(Number(speed)) ? Math.round(clamp(Number(speed), 0, 15) * 10) / 10 : 0;
  if (s <= 0) return null;
  const dirIdx = Number.isInteger(Number(dir)) ? clamp(Number(dir), 0, 7) : 0;
  const angle = dirIdx * (Math.PI / 4);
  return {
    weather,
    angle,
    vector: [Math.cos(angle), Math.sin(angle)],
    speed: s,
    dir: dirIdx,
    label: WIND_LABELS[dirIdx],
    custom: true,
  };
}

function activeWind(raceObj = typeof race !== 'undefined' ? race : null, clock = raceObj ? raceTrafficTime(raceObj) : 0) {
  const roomActive = typeof onlineRoom !== 'undefined' && Boolean(onlineRoom);
  if (roomActive) {
    const st = onlineRoom.state;
    const w = typeof knownWeather === 'function' ? knownWeather(st?.weather) : (st?.weather ?? 'day');
    return gustWind(makeCustomWind(st?.windSpeed ?? 0, st?.windDir ?? 0, w),clock,st?.round?.windSeed??st?.windSeed,st?.round?.windMode??st?.windMode);
  }
  if (raceObj?.event?.environment) {
    const environment=raceObj.event.environment;
    return gustWind(environment,clock,environment.seed,'gust');
  }
  if (typeof preferences !== 'undefined' && preferences?.windSpeed > 0) {
    const w = typeof activeWeather !== 'undefined' ? activeWeather : preferences.weather;
    return gustWind(makeCustomWind(preferences.windSpeed, preferences.windDir ?? 0, w ?? 'day'),clock,
      raceObj?.raceTraffic?.seed??activeCampus,preferences.windMode);
  }
  return null;
}

function windEffectLabel(raceObj) {
  const wind = activeWind(raceObj);
  if (!wind || !raceObj?.rider) return '';
  const along = Math.cos(raceObj.rider.heading) * wind.vector[0] + Math.sin(raceObj.rider.heading) * wind.vector[1];
  const rel = along > 0.35 ? '顺风' : along < -0.35 ? '逆风' : '侧风';
  const exposure=raceObj.rider.windExposure??1;
  const speed=(wind.speed*exposure).toFixed(1);
  const shelter=exposure<.70?' · 背风':'';
  if (wind.custom) return `${wind.label} ${speed}m/s · ${rel}${shelter}`;
  const weatherName = typeof weatherChoices !== 'undefined' ? (weatherChoices[wind.weather]?.name ?? wind.weather) : wind.weather;
  return `${weatherName} · ${wind.label} ${speed}m/s · ${rel}${shelter}`;
}

function authorMedalTime(event, vehicle = 'bike') {
  const { medals } = vehicleBenchmark(event, vehicle);
  return Math.round(medals.gold * 0.90 / 10) * 10;
}

function trialMedal(trial) {
  return trial.unranked||trial.rivals?.length?'':medalName(trial.event,trial.elapsed,trial.rider.vehicle);
}

function medalTier(event, ms, vehicle = 'bike') {
  if (!Number.isFinite(ms)) return '';
  const { medals } = vehicleBenchmark(event, vehicle);
  if (ms <= authorMedalTime(event, vehicle)) return 'author';
  if (ms <= medals.gold) return 'gold';
  if (ms <= medals.silver) return 'silver';
  if (ms <= medals.bronze) return 'bronze';
  return '';
}

function bestCourseAchievement(event) {
  let bestTier = '';
  let bestBike = null;
  let primaryRun = null;
  for (const veh of ['bike', 'ebike', 'chair', 'trail']) {
    const key = typeof checkpointRecordKey === 'function' ? checkpointRecordKey(event, veh) : recordKey(event, veh);
    const run = (typeof race !== 'undefined' ? race?.sessionRecords?.get(key) : null) ?? loadBest(event, veh);
    if (!run) continue;
    if (veh === 'bike') bestBike = run;
    const tier = medalTier(event, run.time, veh);
    if (MEDAL_RANKS[tier] > MEDAL_RANKS[bestTier] || (!primaryRun && !bestTier)) {
      bestTier = tier;
      primaryRun = run;
    } else if (MEDAL_RANKS[tier] === MEDAL_RANKS[bestTier] && tier && primaryRun && run.time < primaryRun.time) {
      primaryRun = run;
    }
  }
  const displayRun = bestBike ?? primaryRun;
  return {
    tier: bestTier,
    label: MEDAL_LABELS[bestTier] ?? '',
    time: displayRun?.time ?? null,
    authorMs: authorMedalTime(event, 'bike'),
    goldMs: event.medalTimes.gold,
  };
}

function courseMedalSummary() {
  const rows = { szu: [], ucl: [] };
  let total = 0, cleared = 0, bronzePlus = 0, silverPlus = 0, goldPlus = 0, authorCount = 0;
  for (const campus of ['szu', 'ucl']) {
    for (const event of coursesByCampus[campus] ?? []) {
      total++;
      const res = bestCourseAchievement(event);
      if (res.time !== null) cleared++;
      const rank = MEDAL_RANKS[res.tier];
      if (rank >= 1) bronzePlus++;
      if (rank >= 2) silverPlus++;
      if (rank >= 3) goldPlus++;
      if (rank >= 4) authorCount++;
      rows[campus].push({ event, ...res });
    }
  }
  return { total, cleared, bronzePlus, silverPlus, goldPlus, authorCount, rows };
}

function isPaintUnlocked(paintId, summary = null) {
  const paint = bicyclePaints?.[paintId];
  if (!paint?.unlock) return true;
  const stats = summary ?? courseMedalSummary();
  if (paintId === 'amethyst') return stats.goldPlus >= 6 || stats.authorCount >= 1;
  if (paintId === 'obsidian') return stats.authorCount >= 1;
  return true;
}

function renderMedalSection(listEl, items, canJump) {
  if (!listEl) return;
  const nodes = items.map(({ event, tier, label, time, authorMs, goldMs }) => {
    const li = document.createElement('li');
    li.className = 'medal-item';
    const badge = document.createElement('span');
    badge.className = 'medal-pill';
    badge.dataset.tier = tier || 'none';
    badge.textContent = label || '未获';
    const info = document.createElement('div');
    info.className = 'medal-info';
    const title = document.createElement('strong');
    title.textContent = event.name;
    const sub = document.createElement('small');
    sub.textContent = `最佳 ${time === null ? '—' : timeLabel(time)} · 紫 ${timeLabel(authorMs)} / 金 ${timeLabel(goldMs)}`;
    info.append(title, sub);
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'action medal-go';
    go.textContent = '前往';
    go.disabled = !canJump;
    go.addEventListener('click', () => {
      if (ui.medalDialog?.open) ui.medalDialog.close();
      if (event.campus === activeCampus) {
        selectCourse(event);
      } else {
        if (typeof pauseTrial === 'function' && (race.phase === 'race' || race.phase === 'count')) race.abandon();
        pendingCampus = { destination: event.campus, at: performance.now() + 30, targetCourseId: event.id };
        updateHud();
      }
      focusStage();
    });
    li.append(badge, info, go);
    return li;
  });
  listEl.replaceChildren(...nodes);
}

function renderMedalDialog() {
  if (!ui.medalDialog) return;
  const stats = courseMedalSummary();
  setText(ui.medalSummary, `完成 ${stats.cleared}/${stats.total} · 紫牌 ${stats.authorCount} · 金牌 ${stats.goldPlus - stats.authorCount} · 银牌 ${stats.silverPlus - stats.goldPlus} · 铜牌 ${stats.bronzePlus - stats.silverPlus}`);
  const ameOk = isPaintUnlocked('amethyst', stats);
  const obsOk = isPaintUnlocked('obsidian', stats);
  setText(ui.medalUnlocks, `限定车漆：紫水晶${ameOk ? '（已解锁）' : `（需 6 金+ 或 1 紫 · 当前 ${stats.goldPlus}/6）`} · 暗曜金${obsOk ? '（已解锁）' : '（需 1 枚紫牌）'}`);
  const canJump = !onlineRoom && !pendingCampus && race.phase !== 'race' && race.phase !== 'count';
  renderMedalSection(ui.medalListSzu, stats.rows.szu, canJump);
  renderMedalSection(ui.medalListUcl, stats.rows.ucl, canJump);
}

function openMedalDialog() {
  if (!ui.medalDialog || settingsOpen || onlineRoom) return;
  clearInput();
  renderMedalDialog();
  ui.medalDialog.showModal();
  ui.medalClose?.focus({ preventScroll: true });
}

function initMedalDialog() {
  ui.medalButton?.addEventListener('click', openMedalDialog);
  ui.medalClose?.addEventListener('click', () => { ui.medalDialog.close(); focusStage(); });
  ui.medalDialog?.addEventListener('close', () => { priorTimestamp = undefined; clearInput(); });
}

const resolvedCourierSites = { szu: null, ucl: null, shunde: null };

function courierLandmarks(campus) {
  if (resolvedCourierSites[campus]) return resolvedCourierSites[campus];
  const specs = COURIER_SITE_SPECS[campus] ?? [];
  const events = coursesByCampus[campus] ?? [];
  const items = [];
  for (const spec of specs) {
    const course = events.find(c => c.id === spec.courseId);
    const gate = course?.gates.find(g => g.name === spec.gateName);
    if (!gate) continue;
    const gx = gate.p[0], gz = gate.p[2];
    const gy = campus === 'shunde' ? parkHeight(gx, gz) : campus === 'szu' ? hillHeight(gx, gz) : 0;
    items.push({ name: spec.name, district: spec.district, courseId: spec.courseId, gateName: spec.gateName, p: [gx, gy + ROAD_Y, gz] });
  }
  resolvedCourierSites[campus] = items;
  return items;
}

function nearestCourierLandmark(campus, x, z, maxDist = 42) {
  let best = null, bestD2 = maxDist * maxDist;
  for (const site of courierLandmarks(campus)) {
    const dx = site.p[0] - x, dz = site.p[2] - z, d2 = dx * dx + dz * dz;
    if (d2 < bestD2) { bestD2 = d2; best = site.name; }
  }
  return best;
}

function defaultExplorerProgress() {
  return { bestStreak: 0, totalDeliveries: 0, discovered: { szu: [], ucl: [], shunde: [] } };
}

function readExplorerProgress() {
  try {
    const raw = JSON.parse(localStorage.getItem(COURIER_KEY));
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

const CampusCourier = {
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
    try { localStorage.setItem(COURIER_KEY, JSON.stringify(this.progress)); } catch {}
    if (typeof scheduleLocalSave === 'function') scheduleLocalSave();
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
    const drive=rider?.vehicle==='bike'?rider.bike:rider?.tuning;
    const cruise=Math.max(3.6,(drive?.roadSpeed??stockBike.roadSpeed)*.65);
    const detour=this.campus==='shunde'?2.1:1.75;
    const climb=Math.max(0,this.target.p[1]-(rider?.position?.[1]??0));
    return Math.ceil(Math.max(18, this.lastLegDist/cruise*(detour-Math.min(.15,this.streak*.015))+climb*.55+12));
  },

  start(campus = activeCampus, pos = race.rider.position, rider = typeof race==='undefined'?null:race.rider) {
    if (typeof race !== 'undefined' && race.phase !== 'free') return false;
    if (typeof onlineRoom !== 'undefined' && onlineRoom) return false;
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
    if (typeof playCustomSound === 'function') playCustomSound('go');
    return true;
  },

  stop(showSummary = false, now = performance.now()) {
    if (!this.active) return;
    if (showSummary) {
      this.summaryText = `闪送结束 · 完成 ${this.deliveries} 单 · 最高连单 ${this.progress.bestStreak}（探索 ${this.discoveredCount(this.campus)}/${courierLandmarks(this.campus).length || 10}）`;
      this.summaryUntil = now + 4200;
      if (typeof playCustomSound === 'function') playCustomSound('rejoin');
    }
    this.active = false;
    this.target = null;
    this.remaining = 0;
  },

  tick(dt, rider, campus, now) {
    if (!this.active || !this.target) return;
    const roomActive = typeof onlineRoom !== 'undefined' && Boolean(onlineRoom);
    if (roomActive || (typeof race !== 'undefined' && race.phase !== 'free') || campus !== this.campus) {
      this.stop(false, now);
      return;
    }
    this.remaining = Math.max(0, this.remaining - dt);
    const dist = Math.hypot(rider.position[0] - this.target.p[0], rider.position[2] - this.target.p[2]);
    if (dist <= 7.8 && Math.abs(rider.position[1]-this.target.p[1])<3) {
      this.deliveries++;
      this.streak++;
      this.progress.totalDeliveries++;
      if (this.streak > this.progress.bestStreak) this.progress.bestStreak = this.streak;
      const list = this.progress.discovered[campus] ?? (this.progress.discovered[campus] = []);
      if (!list.includes(this.target.name)) list.push(this.target.name);
      this.saveProgress();
      this.summaryText = `已送达 ${this.target.name}`;
      this.summaryUntil = now + 2200;
      if (typeof playCustomSound === 'function') playCustomSound('checkpoint');
      this.target = this.pickTarget(campus, rider.position, this.target.name);
      if(this.target) this.remaining=this.allowance(rider);
      return;
    }
    if (this.remaining <= 0) this.stop(true, now);
  },
};

function makeCourierBeaconShape() {
  const shape = new Shape();
  shape.tube([0, 0.05, 0], [0, 6.3, 0], 0.28, 0.13, '#59e4b4', 8);
  shape.ellipsoid([0, 6.65, 0], [0.7, 0.78, 0.7], '#f7dd78', 10, 6);
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * TAU, a1 = ((i + 1) / 8) * TAU;
    shape.tube([Math.cos(a0) * 2.8, 0.09, Math.sin(a0) * 2.8], [Math.cos(a1) * 2.8, 0.09, Math.sin(a1) * 2.8], 0.09, 0.09, '#7ff5cb', 6);
  }
  return shape;
}

function trafficDraftingAt(rider, time) {
  if (!rider || rider.vehicle !== 'bike' || !rider.paved || rider.speed < 5.0 || typeof cityVehicles === 'undefined' || !cityVehicles.length) return false;
  const rx = rider.position[0], rz = rider.position[2];
  const hx = Math.cos(rider.heading), hz = Math.sin(rider.heading);
  for (const van of cityVehicles) {
    const path = van.path;
    const distance = ((van.start + van.direction * van.speed * time) % path.length + path.length) % path.length;
    const frame = courseFrame(path, distance);
    const point = offsetVertex(frame, van.offset, .042);
    const dx = point[0] - rx, dz = point[2] - rz;
    if (Math.abs(dx) > 16 || Math.abs(dz) > 16) continue;
    const ahead = dx * hx + dz * hz;
    if (ahead < 2.5 || ahead > 14.5) continue;
    const lateral = Math.abs(-dx * hz + dz * hx);
    if (lateral > 1.85) continue;
    const align = hx * (frame.f[0] * van.direction) + hz * (frame.f[2] * van.direction);
    if (align > 0.90) return true;
  }
  return false;
}
