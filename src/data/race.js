export const CORNER_SPEED_LIMIT = 10.25;
export const MEDAL_LABELS = { author: '紫牌', gold: '金牌', silver: '银牌', bronze: '铜牌', '': '' };
export const MEDAL_RANKS = { author: 4, gold: 3, silver: 2, bronze: 1, '': 0 };

export const rivalDrivers = [
  { name: '稳健控速', paint: 'bay', lane: -1.3, pace: .965, corner: -.11 },
  { name: '直道尾流', paint: 'shared', lane: 0, pace: 1.035, corner: -.19 },
  { name: '激进晚刹', paint: 'red', lane: 1.3, pace: .99, corner: .14 },
];
export const rivalStartProtection = 3;


export const benchmarkRules = {
  step: .034, startOffset: 5.2, tunedBikeSpeedScale: .975, stockBikeSpeed: 11.55,
  poweredSpeedScale: .96, bikeAcceleration: 4.86, poweredAcceleration: 4.34, braking: 6.85,
};

export const recordRules = {
  minTime: 4000, maxBytes: 2200000, medalOrder: ['gold', 'silver', 'bronze'],
  poweredMedalScales: [.985, 1.12, 1.30], authorScale: .90,
};

export const draftingRules = {
  minSpeed: 4.5, minLeaderSpeed: 3, maxHeight: 1.5, minGap: 2, maxGap: 12, maxSide: 1.45, minHeadingDot: .88,
};

export const rivalRules = {
  duel: { name: '街头劲敌', lane: 1.25, pace: 1.015 },
  gridGap: 1.65, reaction: .28, reactionSpacing: .12,
  maxHeight: 1.5, headingDot: .8, minFollowGap: -.15, maxFollowGap: 3.5, maxFollowSide: 1.18,
  yieldGap: .12, draftPace: .055, launchPace: .78, followGap: 1.1, followGain: 1.7,
};
