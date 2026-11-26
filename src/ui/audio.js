import { getPreferences, worldState } from '../core/state.js';

export const CUSTOM_SOUND_KEYS = ['countdown', 'go', 'checkpoint', 'finish', 'bell', 'rejoin'];
const customSoundMap = new Map();
let customSoundReady = false;
let toneContext = null;
let rideAudioEngine = null;
let audioUnlockInstalled = false;

const BUILTIN_TONES = {
  countdown: [[520, 0, .075, 'sine', .09]],
  go: [[880, 0, .20, 'triangle', .12]],
  checkpoint: [[660, 0, .085, 'triangle', .11], [990, .075, .14, 'triangle', .12]],
  finish: [[523, 0, .09, 'triangle', .10], [659, .085, .09, 'triangle', .10], [784, .17, .09, 'triangle', .11], [1047, .255, .22, 'triangle', .12]],
  bell: [[1760, 0, .22, 'sine', .09], [2637, 0, .18, 'sine', .06]],
  rejoin: [[440, 0, .07, 'sine', .08], [330, .065, .09, 'sine', .08]],
  ping: [[1180, 0, .06, 'sine', .075], [1480, .055, .11, 'sine', .06]],
  catch: [[587, 0, .08, 'triangle', .11], [880, .07, .09, 'triangle', .11], [1175, .14, .19, 'triangle', .12]],
  hazard: [[220, 0, .09, 'sawtooth', .045], [185, .08, .12, 'triangle', .05]],
  splash: [[410, 0, .047, 'triangle', .035], [230, .022, .085, 'sine', .047], [530, .038, .038, 'triangle', .021]],
};

export function isSoundEnabled() {
  return getPreferences()?.sound !== false;
}

function getToneContext(allowCreate = true) {
  try {
    if (!toneContext && allowCreate) {
      const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Ctor) return null;
      toneContext = new Ctor();
    }
    if (toneContext?.state === 'suspended') void toneContext.resume().catch(() => {});
    return toneContext;
  } catch { return null; }
}

export function installAudioUnlock() {
  if (audioUnlockInstalled || typeof window === 'undefined') return;
  audioUnlockInstalled = true;
  const unlock = () => {
    if (!isSoundEnabled()) return;
    getToneContext(true);
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
}

function ensureRideAudioEngine() {
  if (rideAudioEngine) return rideAudioEngine;
  const ctx = getToneContext(false);
  if (!ctx || ctx.state !== 'running') return null;
  try {
    const rate = ctx.sampleRate || 44100;
    const len = Math.floor(rate * 2);
    const buffer = ctx.createBuffer(1, len, rate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.04 * white) / 1.04;
      data[i] = white * 0.55 + last * 1.4;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 420;
    windFilter.Q.value = 0.9;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;

    const surfFilter = ctx.createBiquadFilter();
    surfFilter.type = 'lowpass';
    surfFilter.frequency.value = 320;
    const surfGain = ctx.createGain();
    surfGain.gain.value = 0;

    const masterGain = ctx.createGain();
    masterGain.gain.value = isSoundEnabled() ? 0.55 : 0;

    noise.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(masterGain);

    noise.connect(surfFilter);
    surfFilter.connect(surfGain);
    surfGain.connect(masterGain);

    masterGain.connect(ctx.destination);
    noise.start();

    rideAudioEngine = {
      ctx, noise, windFilter, windGain, surfFilter, surfGain, masterGain,
      freehubPhase: 0, lastTickAt: 0,
    };
    return rideAudioEngine;
  } catch { return null; }
}

function playFreehubTick(ctx, destination, time) {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(2450, time);
    osc.frequency.exponentialRampToValueAtTime(1400, time + 0.014);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.022, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.016);
    osc.connect(gain);
    gain.connect(destination);
    osc.start(time);
    osc.stop(time + 0.02);
  } catch {}
}

export function setRideAudioMuted(muted) {
  if (!rideAudioEngine) return;
  try {
    const t = rideAudioEngine.ctx.currentTime;
    rideAudioEngine.masterGain.gain.setTargetAtTime(muted ? 0 : 0.55, t, 0.04);
  } catch {}
}

export function updateRideAudio(rider, dt, active = true) {
  installAudioUnlock();
  const engine = ensureRideAudioEngine();
  if (!engine) return;
  try {
    const ctx = engine.ctx;
    const now = ctx.currentTime;
    const enabled = active && isSoundEnabled() && rider;
    engine.masterGain.gain.setTargetAtTime(enabled ? 0.55 : 0, now, 0.05);
    if (!enabled) {
      engine.windGain.gain.setTargetAtTime(0, now, 0.05);
      engine.surfGain.gain.setTargetAtTime(0, now, 0.05);
      return;
    }
    const spd = Math.abs(rider.speed ?? 0);
    const windAmt = Math.pow(Math.min(spd / 17.5, 1.15), 1.6) * 0.11;
    const wake = rider.draft?.charge ?? 0;
    const windFreq = (260 + Math.min(spd, 20) * 68) * (1 - wake * .38);
    engine.windFilter.frequency.setTargetAtTime(windFreq, now, 0.08);
    engine.windGain.gain.setTargetAtTime(windAmt * (1 + wake * .34), now, 0.08);

    const braking = (rider.brake ?? 0) > 0.25 && spd > 2.2;
    const offroad = !rider.paved && spd > 1.2;
    const surfAmt = braking ? 0.075 * Math.min(1, spd / 12) : offroad ? 0.085 * Math.min(1, spd / 10) : 0;
    const surfFreq = braking ? 920 : 280;
    engine.surfFilter.frequency.setTargetAtTime(surfFreq, now, 0.06);
    engine.surfGain.gain.setTargetAtTime(surfAmt, now, 0.06);

    if (rider.vehicle === 'bike' && spd > 2.8 && (rider.throttle ?? 0) < 0.08 && (rider.brake ?? 0) < 0.1) {
      const rate = Math.min(16, 4 + spd * 0.72);
      engine.freehubPhase += dt * rate;
      if (engine.freehubPhase >= 1 && now - engine.lastTickAt >= 0.045) {
        engine.freehubPhase %= 1;
        engine.lastTickAt = now;
        playFreehubTick(ctx, engine.masterGain, now + 0.004);
      }
    } else {
      engine.freehubPhase = 0;
    }
  } catch {}
}

function playSlingshot() {
  const engine = ensureRideAudioEngine();
  if (!engine) return false;
  const { ctx, noise, masterGain } = engine;
  const filter = ctx.createBiquadFilter(), gain = ctx.createGain();
  const now = ctx.currentTime;
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(460, now);
  filter.frequency.exponentialRampToValueAtTime(2200, now + .26);
  gain.gain.setValueAtTime(.001, now);
  gain.gain.exponentialRampToValueAtTime(.17, now + .065);
  gain.gain.exponentialRampToValueAtTime(.001, now + .35);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  setTimeout(() => {
    noise.disconnect(filter);
    filter.disconnect();
    gain.disconnect();
  }, 420);
  return true;
}

export function playBuiltInTone(key) {
  if (!isSoundEnabled()) return false;
  if (key === 'slingshot') return playSlingshot();
  const notes = BUILTIN_TONES[key];
  if (!notes) return false;
  try {
    const ctx = getToneContext(true);
    if (!ctx) return false;
    const start = ctx.currentTime + 0.005;
    for (const [freq, delay, duration, type, peak] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start + delay);
      gain.gain.setValueAtTime(0.0001, start + delay);
      gain.gain.linearRampToValueAtTime(peak, start + delay + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + delay + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start + delay);
      osc.stop(start + delay + duration + 0.02);
    }
    return true;
  } catch { return false; }
}

export async function initCustomSounds() {
  installAudioUnlock();
  if (customSoundReady) return;
  customSoundReady = true;
  if (!/^https?:$/.test(location.protocol)) return;
  try {
    const response = await fetch('/sound/manifest.json', { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json().catch(() => null);
    if (!data?.files || typeof data.files !== 'object') return;
    for (const key of CUSTOM_SOUND_KEYS) {
      const url = data.files[key];
      if (typeof url !== 'string' || !url.startsWith('/sound/')) continue;
      const audio = new Audio(url);
      audio.preload = 'auto';
      customSoundMap.set(key, audio);
    }
  } catch {}
}

export function playCustomSound(key) {
  if (!isSoundEnabled()) return false;
  const base = customSoundMap.get(key);
  if (!base) return playBuiltInTone(key);
  try {
    const clip = base.paused ? base : base.cloneNode();
    clip.currentTime = 0;
    clip.volume = key === 'bell' ? 0.85 : 0.72;
    void clip.play().catch(() => {});
    return true;
  } catch { return false; }
}

worldState.hooks.playSound = playCustomSound;
