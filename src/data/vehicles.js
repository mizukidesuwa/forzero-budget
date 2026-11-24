export const bicycleBase = {
  roadSpeed: 11.85, sprintSpeed: 15.35, grassSpeed: 6.65,
  roadGrip: 11.15, grassGrip: 6.62,
};

export const MAX_ROAD_SPEED = bicycleBase.roadSpeed;
export const MAX_SPRINT_SPEED = bicycleBase.sprintSpeed;
export const MAX_GRASS_SPEED = bicycleBase.grassSpeed;

export const poweredDefaults = {
  grassRolling: 2.85, grassSlowdown: 8.85, brakeTurnLoss: .145,
};

export const vehicleChoices = {
  bike: { name: '自行车', race: true },
  ebike: {
    name: '电动自行车 · 新国标', race: true, roadSpeed: 48 / 3.6, grassSpeed: 28 / 3.6,
    force: 1.08, roadGrip: 11.4, grassGrip: 7.8, rolling: 1.04, recordLimit: 12 * 60000, recordInterval: 95,
  },
  chair: {
    name: '电动轮椅', race: true, roadSpeed: 36 / 3.6, grassSpeed: 22 / 3.6,
    force: .96, roadGrip: 10.4, grassGrip: 7.4, rolling: 1.06, recordLimit: 15 * 60000, recordInterval: 110,
  },
  trail: {
    name: '越野小摩托', race: true, roadSpeed: 63 / 3.6, grassSpeed: 39 / 3.6,
    force: 1.28, roadGrip: 13.15, grassGrip: 11.70, rolling: 1.02, grassRolling: 1.54, grassSlowdown: 3.90,
  },
};

export const poweredGravel = {
  trail: { speed: .69, grip: .62, rolling: .24, force: 5.00, slowdown: 1.65, brake: .91 },
  ebike: { speed: .45, grip: .46, rolling: .39, force: 4.45, slowdown: 2.10, brake: .82 },
  chair: { speed: .32, grip: .35, rolling: .50, force: 4.05, slowdown: 2.45, brake: .76 },
};
