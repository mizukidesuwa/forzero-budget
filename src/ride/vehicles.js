import { clamp, mix } from '../core/math.js';
import { getStorage, worldState } from '../core/state.js';
import tuning190 from './tuning-rules.js';
import { surfacePhysics } from '../data/surfaces.js';

import { brakeChoices, frameChoices, gearChoices, sprintChoices, tyreChoices, vehicleTuningChoices } from '../data/parts.js';
import { bicycleBase, poweredDefaults, poweredGravel, vehicleChoices } from '../data/vehicles.js';

export {
  brakeChoices, extraPoweredParts, frameChoices, gearChoices, sprintChoices, tyreChoices, vehicleTuningChoices,
} from '../data/parts.js';
export { MAX_GRASS_SPEED, MAX_ROAD_SPEED, MAX_SPRINT_SPEED, poweredGravel, vehicleChoices } from '../data/vehicles.js';

export const bicyclePaints = {
  classic: { name: '荔园青', color: '#29746d', shade: '#245449', highlight: '#3a887b' },
  shared: { name: '共享单车黄', color: '#e8ad25', shade: '#9e7420', highlight: '#f1cc46' },
  bay: { name: '海湾蓝', color: '#3f79b1', shade: '#2b4b71', highlight: '#6da8da' },
  red: { name: '赤霞红', color: '#b95544', shade: '#77352e', highlight: '#dc7463' },
  white: { name: '云白', color: '#d7d8ce', shade: '#a5ab9e', highlight: '#f2f0e5' },
  amethyst: { name: '紫水晶 · 限定', color: '#7e4cb8', shade: '#4d2b78', highlight: '#b382f0', unlock: '6金/1紫' },
  obsidian: { name: '暗曜金 · 大师', color: '#2a2931', shade: '#18171d', highlight: '#e0b84f', unlock: '紫牌' },
};

export const DRIVER_KEY = 'szu-litchi-driver-1';
export const DEFAULT_RIDER_NAME = 'player';
export const knownVehicle = id => Object.hasOwn(vehicleChoices, id) ? id : 'bike';
export const knownPaint = id => Object.hasOwn(bicyclePaints, id) ? id : 'classic';

export function riderName(value) {
  if (typeof value !== 'string') return DEFAULT_RIDER_NAME;
  const clean = value.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu, '').trim();
  return Array.from(clean).slice(0, 12).join('') || DEFAULT_RIDER_NAME;
}

export const bicycleStyles = {
  category: { label: '自行车门类', choices: { campus: '校园通勤', road: '气动公路', climb: '轻量爬坡', gravel: '砾石越野' } },
  rim: { label: '轮组', choices: { auto: '随门类', spokes: '经典辐条', deep: '深框碳刀' } },
  sidewall: { label: '胎壁', choices: { black: '经典全黑', tan: '复古黄边' } },
  accessory: { label: '配饰', choices: { none: '无配饰', bottle: '车架水壶', basket: '校园前篮', computer: '码表支架' } },
  trim: { label: '把带与坐垫', choices: { coal: '深炭黑', brown: '复古棕', orange: '亮橙' } },
};

export function bicycleStyle(look) {
  return Object.fromEntries(Object.entries(bicycleStyles).map(([key, { choices }]) => {
    const value = look?.[key];
    return [key, typeof value === 'string' && Object.hasOwn(choices, value) ? value : Object.keys(choices)[0]];
  }));
}

export function readDriverProfile() {
  let saved;
  try { saved = JSON.parse(getStorage()?.getItem(DRIVER_KEY)); } catch {}
  return { name: riderName(saved?.name), vehicle: knownVehicle(saved?.vehicle), paint: knownPaint(saved?.paint), look: bicycleStyle(saved?.look) };
}

export function storeDriverProfile(profile) {
  try { getStorage()?.setItem(DRIVER_KEY, JSON.stringify(profile)); } catch {}
  worldState.hooks.scheduleSave?.();
}

export function chairCheerClock(randomFn = Math.random) {
  let movingTime = 0, next = 42 + randomFn() * 28, remaining = 0, message = '';
  return (dt, moving) => {
    remaining = Math.max(0, remaining - dt);
    if (!moving) return '';
    movingTime += dt;
    if (movingTime >= next) {
      message = randomFn() < .56 ? '冲刺♿' : '冲otto冲♿';
      remaining = 2.25;
      next = movingTime + 115 + randomFn() * 105;
    }
    return remaining > 0 ? message : '';
  };
}

export const bicyclePresets = {
  aero: { name: '深南气动公路', parts: ['race', 'long', 'stock', 'aero', 'burst'], paint: 'bay', look: { category: 'road', rim: 'deep', accessory: 'computer' } },
  climb: { name: '杜鹃轻量爬坡', parts: ['stock', 'short', 'power', 'agile', 'burst'], paint: 'red', look: { category: 'climb', rim: 'spokes', accessory: 'bottle' } },
  gravel: { name: '全地形越野瓜车', parts: ['traction', 'short', 'control', 'stock', 'endurance'], paint: 'white', look: { category: 'gravel', rim: 'spokes', sidewall: 'tan', accessory: 'bottle', trim: 'brown' } },
  campus: { name: '经典荔园校园', parts: ['stock', 'stock', 'stock', 'stock', 'stock'], paint: 'shared', look: { category: 'campus', rim: 'spokes', sidewall: 'tan', accessory: 'basket', trim: 'brown' } },
};

export const bicyclePartKeys = ['tyres', 'gears', 'brakes', 'frame', 'sprint'];

export const bicycleAppearance = (profile, bike) => ({
  paint: knownPaint(profile?.paint),
  look: bicycleStyle(profile?.look),
  tyres: Object.hasOwn(tyreChoices, bike?.tyres) ? bike.tyres : 'stock',
  frame: Object.hasOwn(frameChoices, bike?.frame) ? bike.frame : 'stock',
});

export function bicycleAbility(bike) {
  return [
    bike.roadSpeed / stockBike.roadSpeed, bike.sprintForce * bike.force, bike.roadGrip / stockBike.roadGrip,
    bike.force / bike.rolling, (bike.grassGrip / stockBike.grassGrip + bike.grassSpeed / stockBike.grassSpeed + bike.wetMitigate * .3) / 2,
    bike.brakePower,
  ];
}

export const workshopSpeed = speed => (speed * 3.6).toFixed(1) + ' km/h';

export const bikePartOptions = { tyres: tyreChoices, gears: gearChoices, brakes: brakeChoices, frame: frameChoices, sprint: sprintChoices };
export const workshopPartLabels = {
  tyres: '轮胎', gears: '传动', brakes: '刹车', frame: '车架', sprint: '冲刺',
  wheels: '驱动轮', motor: '电机', caster: '前轮阻尼', suspension: '悬挂',
};

export function workshopPartTitle(vehicle, slot, key, name) {
  const price = tuning190.prices[vehicle][slot][key];
  return `${name} · ¥${price}${tuning190.illegalParts.has(key) ? ' · 违禁' : ''}`;
}

export const bikeKey = 'szu-litchi-bike-1';
export const tuningKey = 'szu-litchi-tuning-1';

export function tuningTraits(parts) {
  const selected = Object.values(parts);
  return {
    illegal: selected.some(key => tuning190.illegalParts.has(key)),
    magicGrip: selected.includes('glue'),
    magicPower: selected.includes('rocket'),
    magicGravity: selected.includes('gravity'),
    magicEnergy: selected.includes('capacitor'),
    sideWind: selected.includes('usedFrame'),
  };
}

export function buildBike(tyres = 'stock', gears = 'stock', brakes = 'stock', frame = 'stock', sprint = 'stock') {
  if (!Object.hasOwn(tyreChoices, tyres)) tyres = 'stock';
  if (!Object.hasOwn(gearChoices, gears)) gears = 'stock';
  if (!Object.hasOwn(brakeChoices, brakes)) brakes = 'stock';
  if (!Object.hasOwn(frameChoices, frame)) frame = 'stock';
  if (!Object.hasOwn(sprintChoices, sprint)) sprint = 'stock';
  const t = tyreChoices[tyres], g = gearChoices[gears], b = brakeChoices[brakes], f = frameChoices[frame], s = sprintChoices[sprint];
  return {
    tyres, gears, brakes, frame, sprint,
    roadSpeed: bicycleBase.roadSpeed * t.road * g.top * f.top,
    sprintSpeed: bicycleBase.sprintSpeed * t.road * g.top * f.sprintTop * s.top,
    grassSpeed: bicycleBase.grassSpeed * t.grass,
    force: g.force * f.force, highForce: g.highForce, roadGrip: bicycleBase.roadGrip * t.grip * f.grip, grassGrip: bicycleBase.grassGrip * t.loose,
    cornerPace: Math.sqrt(t.grip * f.grip), rolling: t.drag * f.drag, grassRolling: t.grassDrag, grassSlowdown: t.grassSlowdown,
    brakePower: b.power, brakeTurnLoss: b.turnLoss,
    steerScale: f.steer, sprintForce: s.force, sprintDrain: s.drain, sprintRecover: s.recover,
    wetMitigate: t.wetMitigate ?? 0, wetBrakeMitigate: b.wetBrakeMitigate ?? 0, rainGrip: t.rainGrip ?? 1,
    ...tuningTraits({ tyres, frame, sprint }),
  };
}

export const stockBike = buildBike();
export const maxBikeSpeed = buildBike('race', 'long', 'stock', 'aero', 'burst').sprintSpeed;
export const bicycleGravelSpeed = bike => Math.min(bike.roadSpeed, bike.grassSpeed * surfacePhysics.bicycleGravel.speedFromGrass);

export function savedBike() {
  try {
    const chosen = JSON.parse(getStorage()?.getItem(bikeKey));
    return buildBike(chosen?.tyres, chosen?.gears, chosen?.brakes, chosen?.frame, chosen?.sprint);
  } catch { return stockBike; }
}

export function normalizeVehicleParts(vehicle, parts) {
  const slots = vehicleTuningChoices[vehicle];
  if (!slots) return {};
  const out = {};
  for (const slot of slots) {
    const val = parts?.[slot.key];
    out[slot.key] = Object.hasOwn(slot.options, val) ? val : 'stock';
  }
  return out;
}

export function buildVehicleTuning(vehicle, parts) {
  const base = vehicleChoices[vehicle];
  if (!base || vehicle === 'bike') return stockBike;
  const slots = vehicleTuningChoices[vehicle] ?? [];
  const clean = normalizeVehicleParts(vehicle, parts);
  let roadSpeed = base.roadSpeed, grassSpeed = base.grassSpeed, force = base.force, highForce = base.force;
  let roadGrip = base.roadGrip, grassGrip = base.grassGrip, rolling = base.rolling, gravelGripScale = 1;
  let grassRolling = base.grassRolling ?? poweredDefaults.grassRolling, grassSlowdown = base.grassSlowdown ?? poweredDefaults.grassSlowdown;
  let brakePower = 1, brakeTurnLoss = poweredDefaults.brakeTurnLoss, steerScale = 1, wetMitigate = 0, wetBrakeMitigate = 0, rainGrip = 1;
  for (const slot of slots) {
    const m = slot.options[clean[slot.key]];
    if (!m) continue;
    if (m.roadSpeed) roadSpeed *= m.roadSpeed;
    if (m.grassSpeed) grassSpeed *= m.grassSpeed;
    if (m.force) force *= m.force;
    if (m.highForce) highForce *= m.highForce;
    if (m.roadGrip) roadGrip *= m.roadGrip;
    if (m.grassGrip) grassGrip *= m.grassGrip;
    if (m.gravelGrip) gravelGripScale *= m.gravelGrip;
    if (m.rolling) rolling *= m.rolling;
    if (m.grassSlowdown) grassSlowdown *= m.grassSlowdown;
    if (m.brakePower) brakePower *= m.brakePower;
    if (m.brakeTurnLoss) brakeTurnLoss *= m.brakeTurnLoss;
    if (m.steerScale) steerScale *= m.steerScale;
    if (m.wetMitigate) wetMitigate = Math.max(wetMitigate, m.wetMitigate);
    if (m.wetBrakeMitigate) wetBrakeMitigate = Math.max(wetBrakeMitigate, m.wetBrakeMitigate);
    if (m.rainGrip) rainGrip *= m.rainGrip;
  }
  const traits = tuningTraits(clean);
  if (!traits.magicPower) roadSpeed = Math.min(base.roadSpeed, roadSpeed);
  const gravel = poweredGravel[vehicle];
  return {
    ...base,
    parts: clean,
    roadSpeed, grassSpeed, force, highForce, roadGrip, grassGrip, rolling,
    grassRolling, grassSlowdown, brakePower, brakeTurnLoss, steerScale, wetMitigate, wetBrakeMitigate,
    gravelSpeed: traits.magicGrip ? roadSpeed : mix(Math.min(grassSpeed, roadSpeed), roadSpeed, gravel.speed),
    gravelGrip: Math.min(roadGrip, mix(grassGrip, roadGrip, gravel.grip) * gravelGripScale),
    gravelRolling: mix(rolling, grassRolling, gravel.rolling),
    gravelForce: gravel.force, gravelSlowdown: gravel.slowdown, gravelBrake: gravel.brake,
    rainGrip, ...traits,
    cornerPace: Math.sqrt(roadGrip / base.roadGrip),
  };
}

export function savedVehicleTunings() {
  let saved = {};
  try { saved = JSON.parse(getStorage()?.getItem(tuningKey)) ?? {}; } catch {}
  return {
    trail: normalizeVehicleParts('trail', saved?.trail),
    ebike: normalizeVehicleParts('ebike', saved?.ebike),
    chair: normalizeVehicleParts('chair', saved?.chair),
  };
}

export function storeVehicleTunings(tunings) {
  try { getStorage()?.setItem(tuningKey, JSON.stringify(tunings)); } catch {}
  worldState.hooks.scheduleSave?.();
}
