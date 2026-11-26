import { getActiveCampus, getStorage, worldState } from '../core/state.js';
import { blindNavRules } from '../data/modes.js';
import { cliffHazardAt, safeToRide, surfaceAt, waterHazardAt } from '../world/query.js';

const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
const DIRECTIONS = ['正前', '右前', '右侧', '右后', '正后', '左后', '左侧', '左前'];

export function blindCourseKey(event, vehicle = 'bike') {
  const base = event?.baseCourse ?? event;
  const campus = event?.campus ?? getActiveCampus();
  return `${campus}:${base?.id ?? 'route'}:${vehicle}`;
}

export function defaultBlindProgress() {
  return { clears: 0, bestByKey: {} };
}

export function readBlindProgress() {
  try {
    const raw = JSON.parse(getStorage()?.getItem(blindNavRules.storageKey));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaultBlindProgress();
    const bestByKey = {};
    if (raw.bestByKey && typeof raw.bestByKey === 'object' && !Array.isArray(raw.bestByKey)) {
      for (const [key, value] of Object.entries(raw.bestByKey)) {
        if (typeof key === 'string' && Number.isFinite(value) && value > 0) bestByKey[key] = value;
      }
    }
    return {
      clears: Number.isInteger(raw.clears) && raw.clears >= 0 ? raw.clears : 0,
      bestByKey,
    };
  } catch {
    return defaultBlindProgress();
  }
}

export function saveBlindProgress(progress) {
  try { getStorage()?.setItem(blindNavRules.storageKey, JSON.stringify(progress)); } catch {}
  worldState.hooks.scheduleSave?.();
}

export function relativeBearing(rider, targetPosition) {
  if (!rider?.position || !targetPosition) return null;
  const dx = targetPosition[0] - rider.position[0];
  const dz = targetPosition[2] - rider.position[2];
  const distance = Math.round(Math.hypot(dx, dz));
  const angle = Math.atan2(dz, dx) - (rider.heading ?? 0);
  const step = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
  return { arrow: ARROWS[step], label: DIRECTIONS[step], distance };
}

/** Pure state machine for Night Blind Run navigation modifier. */
export function createBlindNav() {
  return {
    enabled: false,
    active: false,
    savedWeather: null,
    bellPulseUntilMs: -Infinity,
    bellCooldownUntilMs: -Infinity,
    bellTarget: null,
    hazardLabel: '',
    hazardUntilMs: -Infinity,
    hazardCooldownUntilMs: -Infinity,
    progress: readBlindProgress(),

    refreshProgress() {
      this.progress = readBlindProgress();
      return this.progress;
    },

    setEnabled(flag) {
      this.enabled = Boolean(flag);
      return this.enabled;
    },

    enter(currentWeatherId, setWeather) {
      if (!this.enabled) return false;
      if (!this.active) this.savedWeather = currentWeatherId || 'day';
      this.active = true;
      this.bellPulseUntilMs = -Infinity;
      this.bellCooldownUntilMs = -Infinity;
      this.bellTarget = null;
      this.hazardLabel = '';
      this.hazardUntilMs = -Infinity;
      this.hazardCooldownUntilMs = -Infinity;
      setWeather?.('night');
      return true;
    },

    leave(setWeather) {
      const prior = this.savedWeather;
      const wasActive = this.active;
      this.active = false;
      this.savedWeather = null;
      this.bellPulseUntilMs = -Infinity;
      this.bellCooldownUntilMs = -Infinity;
      this.bellTarget = null;
      this.hazardLabel = '';
      this.hazardUntilMs = -Infinity;
      this.hazardCooldownUntilMs = -Infinity;
      if (wasActive && prior) setWeather?.(prior);
      return wasActive;
    },

    visibility() {
      return {
        hideMinimap: this.active,
        hideBigMap: this.active,
        hideRoute: this.active,
        hideBrakeLine: this.active,
        showTouchBell: this.active,
      };
    },

    clearBellPulse() {
      this.bellPulseUntilMs = -Infinity;
      this.bellCooldownUntilMs = -Infinity;
      this.bellTarget = null;
    },

    triggerBell(nowMs, rider, target = null) {
      if (!this.active || !rider) return { triggered: false, cooldownMs: 0, bearing: null };
      this.hazardLabel = '';
      this.hazardUntilMs = -Infinity;
      if (nowMs < this.bellCooldownUntilMs) {
        if (this.bellTarget) this.bellPulseUntilMs = Math.max(this.bellPulseUntilMs, nowMs + 1500);
        return { triggered: false, cooldownMs: Math.ceil(this.bellCooldownUntilMs - nowMs), bearing: this.bellTarget };
      }
      const bearing = target?.position ? relativeBearing(rider, target.position) : null;
      this.bellTarget = bearing ? { ...bearing, name: target.label ?? '' } : { arrow: '↑', label: '正前', distance: null, name: target?.label ?? '' };
      this.bellPulseUntilMs = nowMs + blindNavRules.bellPulseMs;
      this.bellCooldownUntilMs = nowMs + blindNavRules.bellCooldownMs;
      return { triggered: true, cooldownMs: 0, bearing: this.bellTarget };
    },

    tick(nowMs, rider, query = null, campus = getActiveCampus(), playSound = null) {
      if (!this.active || !rider) return null;
      if (nowMs < this.bellPulseUntilMs) return null;
      const speed = Math.abs(rider.speed ?? 0);
      if (speed < 2.2 || nowMs < this.hazardCooldownUntilMs) return null;
      const heading = rider.heading ?? 0;
      const fx = Math.cos(heading), fz = Math.sin(heading);
      const exploring = campus === 'szu';
      const checkSafe = query?.safeToRide
        ? (x, z) => query.safeToRide(x, z, exploring, false)
        : (x, z) => safeToRide(x, z, exploring, false, campus);
      const checkWater = query?.waterHazardAt
        ? (x, z) => query.waterHazardAt(x, z)
        : (x, z) => waterHazardAt(x, z, campus);
      const checkCliff = query?.cliffHazardAt
        ? (x, z, y) => query.cliffHazardAt(x, z, y)
        : (x, z, y) => cliffHazardAt(x, z, y, campus);

      let label = '';
      const closeDist = blindNavRules.hazardProbeDistances[0];
      for (const dist of blindNavRules.hazardProbeDistances) {
        const px = rider.position[0] + fx * dist;
        const pz = rider.position[2] + fz * dist;
        if (checkWater(px, pz) || checkCliff(px, pz, rider.position[1])) {
          label = '前方水域或崖边';
          break;
        }
        if (dist === closeDist && !checkSafe(px, pz)) {
          label = '前方护栏或急界';
          break;
        }
      }
      if (!label && speed >= blindNavRules.hazardTurnSpeedThreshold && Math.abs(rider.steering ?? 0) >= .85) {
        label = '急弯减速注意';
      }
      if (!label) return null;
      this.hazardLabel = label;
      this.hazardUntilMs = nowMs + blindNavRules.hazardPulseMs;
      this.hazardCooldownUntilMs = nowMs + blindNavRules.hazardCooldownMs;
      playSound?.('hazard');
      return label;
    },

    recordClear(event, vehicle, timeMs, unranked = false) {
      if (unranked || !event || !(timeMs > 0)) return { clears: this.progress.clears, bestMs: null, isBest: false };
      const key = blindCourseKey(event, vehicle);
      const prev = this.progress.bestByKey[key];
      const isBest = prev === undefined || timeMs < prev;
      if (isBest) this.progress.bestByKey[key] = timeMs;
      this.progress.clears += 1;
      saveBlindProgress(this.progress);
      return { clears: this.progress.clears, bestMs: this.progress.bestByKey[key], isBest };
    },
  };
}

export const BlindNav = createBlindNav();
