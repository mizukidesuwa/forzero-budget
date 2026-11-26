import { trafficRules } from '../data/traffic.js';

const round = (value, digits = 3) => Number.isFinite(Number(value))
  ? Number(Number(value).toFixed(digits))
  : null;

function windKey(wind, fallback = null) {
  const source = wind ?? fallback;
  if (!source) return 'none';
  return [
    source.weather ?? 'day',
    round(source.speed, 1) ?? 0,
    round(source.angle) ?? 0,
    source.custom ? 'custom' : 'course',
  ].join(',');
}

export function raceEnvironmentKey(event, { trafficSeed = null, wind = null } = {}) {
  const variant = event?.variant
    ? `${event.variant.direction ?? 'forward'}:${event.variant.laps ?? 1}`
    : 'forward:1';
  const course = event?.seed ?? event?.id ?? 'course';
  const environment = event?.environment;
  const traffic = trafficSeed ?? (event?.seed ?? [
    trafficRules.seedPrefix,
    trafficRules.seedVersion,
    event?.campus ?? 'unknown',
    course,
    variant,
    environment?.weather ?? 'day',
    environment ? `${Number(environment.speed ?? 0).toFixed(1)}@${Number(environment.angle ?? 0).toFixed(3)}` : 'none',
  ].join(':'));
  return [
    `env${trafficRules.seedVersion}`,
    event?.campus ?? 'unknown',
    course,
    variant,
    `traffic=${traffic}`,
    `wind=${windKey(wind, event?.environment)}`,
  ].join('|');
}

