import sharedRules from './shared-rules.cjs';

export const launchModes = Object.freeze(['solo', 'team', 'duel', 'chase', 'blind']);

export const knownLaunchMode = value => launchModes.includes(value) ? value : 'solo';

export const chaseRules = Object.freeze({
  storageKey: 'forzero-chase-v1',
  loopLaps: 2,
  rejoinPenaltyMs: 2000,
  pingFadeMs: 4200,
  difficulties: Object.freeze({
    standard: Object.freeze({
      paceScale: .65,
      countdownSec: 3,
      leadRatio: .18,
      leadMinSec: 2.5,
      leadMaxSec: 13,
      pingIntervalMs: 3000,
      terrorDistance: 85,
      revealDistance: 55,
      catchDistance: 8.5,
      catchHeight: 3.5,
    }),
    strong: Object.freeze({
      paceScale: .75,
      countdownSec: 3,
      leadRatio: .20,
      leadMinSec: 2.5,
      leadMaxSec: 15,
      pingIntervalMs: 4000,
      terrorDistance: 72,
      revealDistance: 45,
      catchDistance: 7.0,
      catchHeight: 3.5,
    }),
  }),
});

export const blindNavRules = Object.freeze({
  storageKey: 'forzero-blind-v1',
  bellCooldownMs: 2000,
  bellPulseMs: 3500,
  hazardCooldownMs: 3500,
  hazardPulseMs: 1200,
  hazardProbeDistances: Object.freeze([5.5, 9.0]),
  hazardTurnSpeedThreshold: 8.0,
});

export const onlineChaseRules = sharedRules.ONLINE_CHASE_RULES;
