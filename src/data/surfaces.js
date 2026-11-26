export const weatherTraction = {
  dry: { wetness: 0, gripScale: 1, brakeScale: 1, rain: false },
  rain: { wetness: 1.0, gripScale: .85, brakeScale: .87, rain: true },
};

export const surfacePhysics = {
  paved: { force: 5.28, overspeedSlowdown: 3.75 },
  grass: { bicycleForce: 4.08, poweredForce: 3.40 },
  bicycleGravel: {
    speedFromGrass: 1.32, sprintSpeedScale: 1.14,
    rollingBlend: .36, gripBlend: .40, force: 4.82,
    slowdownMin: 1.55, slowdownMax: 2.15, grassSlowdownMin: 2.9, grassSlowdownRange: 2.0,
    sprintForceScale: .68, sprintDrainScale: 1.18,
  },
  puddle: { gripScale: .63, slipAdded: .12, splashMinSpeed: 2 },
};

export const windPhysics = {
  gust: { frequencyA: .46, frequencyB: .93, phaseB: .71, angleMixB: .73, angleMixA: .27,
    angleDivisor: 15, strengthA: .145, strengthB: .075 },
  shelter: { distances: [7, 16], wallClearance: 2, terrainClearance: 2.5, exposure: .35, response: 5 },
  traction: { topSpeedEffect: .014, topSpeedMin: .78, topSpeedMax: 1.22,
    dragEffect: .055, dragMin: .52, dragMax: 1.85, sideGripLoss: .025, sideGripLossMax: .4 },
};
