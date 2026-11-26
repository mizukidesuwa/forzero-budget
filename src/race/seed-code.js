import { randomSource } from '../core/math.js';

export const seedVersion = 2;

export function readSeedCode(value, campus) {
  const code = value.trim().toUpperCase();
  const parts = /^(?:([SU])(\d)-)?([A-Z0-9]{1,12})$/.exec(code);
  if (!parts) return null;
  const [, region, version, token] = parts;
  const prefix = campus === 'ucl' ? 'U' : 'S';
  if (region && (region !== prefix || Number(version) !== seedVersion)) return null;
  return prefix + seedVersion + '-' + token;
}

export function weeklySeed(campus, now = new Date()) {
  const monday = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  return readSeedCode('W' + monday.toISOString().slice(0, 10).replaceAll('-', ''), campus);
}

export function seedRandom(code) {
  let seed = 2166136261;
  for (const symbol of code) seed = Math.imul(seed ^ symbol.charCodeAt(0), 16777619);
  return randomSource(seed);
}
