export const vehicleSkills = {
  bike: { action: '冲刺', meter: '冲刺耐力' },
  trail: { action: '甩尾', meter: '牵引储备' },
  ebike: { action: '超频', meter: '电量 / 温控' },
  chair: { action: '爆发', meter: '扭矩储备' },
};

export const rocketSkill = {
  action: '火箭助推', meter: '火箭充能', ready: '火箭就绪', active: '火箭爆发', cooldown: '火箭冷却',
};

export const skillPhysics = {
  rocket: { boostTime: 2, cooldownTime: 8, force: 1.45, limit: 1.25 },
  trail: {
    driftSpeed: 5, driftMinEnergy: .025, boostMinDriftTime: .4, boostEnergy: .08, boostTime: 1.2,
    driftYaw: 1.34, driftForce: .91, driftDrain: .24, boostForce: 1.24, boostLimit: 1.045, recovery: .07,
    driftGrip: 1.18, driftSlip: .19,
  },
  ebike: {
    regenSpeed: 1, regenDrag: .46, minEnergy: .02, forceAndLimit: 1.18, drain: .42, overheatTime: 2.5,
    regenRecovery: .32, heldRecovery: .02, recovery: .15, overheatForce: .77, overheatLimit: .89,
  },
  chair: {
    lowSpeedYaw: 1.72, yawFadeStart: 2, yawFadeRange: 7, minEnergy: .025,
    lowSpeedForce: 1.78, highSpeedForce: 1.04, forceFadeSpeed: 8, limit: 1.025, drain: .34, recovery: .12,
  },
  bicycleSprint: { minSpeed: 2.6, minEnergy: .045, drain: .193, standDrain: .28,
    draftingRecovery: .070, pavedRecovery: .052, gravelRecovery: .046, grassRecovery: .035,
    force: 7.64, agileStandForce: .20, standForce: .15 },
  magicEnergyRecovery: .63,
  magicUphillGradeScale: .05,
};
