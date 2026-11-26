export const CORNER_SPEED_LIMIT = 10.25;
export const MEDAL_LABELS = { author: '紫牌', gold: '金牌', silver: '银牌', bronze: '铜牌', '': '' };
export const MEDAL_RANKS = { author: 4, gold: 3, silver: 2, bronze: 1, '': 0 };

export const courseVariantRules = { laps: [1, 2, 3], loopTolerance: .6 };

export const rivalDrivers = [
  { name: '王牌', paint: 'red', lane: 0, target: 1 },
  { name: '直道尾流', paint: 'shared', lane: 1.26, target: 1.075 },
  { name: '稳健学长', paint: 'bay', lane: -1.26, target: 1.16 },
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

export const feedbackRules = {
  draftingBenefit: .14,
  looseSurfaceLoss: .08,
  headwindLoss: 22,
  collisionLossMs: 420,
};

export const draftingRules = {
  minSpeed: 4.5, minLeaderSpeed: 3, maxHeight: 1.5, minGap: 2, maxGap: 12, maxSide: 1.45, minHeadingDot: .88,
  chargeSeconds: 1.5, burstSeconds: 1.5, exitMargin: .85, exitHeadingDot: .78,
  minimumSideChange: .008, riderFront: .63, riderWakeHeight: .47,
  vehicles: {
    bike: { draftLimit: 1.045, drag: .76, burstLimit: 1.08, thrust: 1.30 },
    ebike: { draftLimit: 1.032, drag: .83, burstLimit: 1.07, thrust: 1.13 },
    chair: { draftLimit: 1.037, drag: .79, burstLimit: 1.075, thrust: 1.20 },
    trail: { draftLimit: 1.027, drag: .86, burstLimit: 1.06, thrust: 1.10 },
  },
};

export const rivalRules = {
  duel: { name: '街头劲敌', lane: 1.25, target: 1 },
  gridLead: [4.6, 3.0, 1.55], duelLead: .72, reaction: .16, reactionSpacing: .08,
  difficulty: { standard: .99, strong: .925 },
  behavior: {
    standard: {
      laneBias: .24, lineResponse: .16, curvePace: .95, mistake: .92,
      mistakePeriod: 13, followGain: 1.25, skillDelay: 2.5,
    },
    strong: {
      laneBias: -.10, lineResponse: .08, curvePace: .99, mistake: .985,
      mistakePeriod: 23, followGain: 1.9, skillDelay: 0,
    },
  },
  gridMerge: 34, maximumCurve: .17, minimumSkillSpeed: 3.5, minimumGrade: .022,
  skillPeriod: 90, straightWindow: 23, climbWindow: 17,
  skill: {
    bike: { name: '冲刺', rate: 1.15 }, ebike: { name: '电控助力', rate: 1.10 },
    chair: { name: '超频', rate: 1.13 }, trail: { name: '出弯加速', rate: 1.095 },
  },
  maxHeight: 1.5, headingDot: .8, minFollowGap: -.15, maxFollowGap: 3.5, maxFollowSide: 1.18,
  yieldGap: .12, followGap: 1.1, followGain: 1.7,
};
