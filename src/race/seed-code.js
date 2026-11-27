// @ts-check
import { randomSource } from '../core/math.js';

export const seedVersion = 2;

/**
 * Normalize a compact or prefixed seed string (`S2-...` / `U2-...`) for a campus.
 * @param {string} value
 * @param {string} [campus]
 * @returns {string | null}
 */
export function readSeedCode(value, campus) {
  const code = value.trim().toUpperCase();
  const parts = /^(?:([SU])(\d)-)?([A-Z0-9]{1,12})$/.exec(code);
  if (!parts) return null;
  const [, region, version, token] = parts;
  const prefix = campus === 'ucl' ? 'U' : 'S';
  if (region && (region !== prefix || Number(version) !== seedVersion)) return null;
  return prefix + seedVersion + '-' + token;
}

/**
 * Compute the canonical Monday UTC weekly seed code for a campus.
 * @param {string} [campus]
 * @param {Date} [now]
 * @returns {string | null}
 */
export function weeklySeed(campus, now = new Date()) {
  const monday = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  return readSeedCode('W' + monday.toISOString().slice(0, 10).replaceAll('-', ''), campus);
}

/**
 * Derive a deterministic PRNG function from a normalized seed string.
 * @param {string} code
 * @returns {() => number}
 */
export function seedRandom(code) {
  let seed = 2166136261;
  for (const symbol of code) seed = Math.imul(seed ^ symbol.charCodeAt(0), 16777619);
  return randomSource(seed);
}
