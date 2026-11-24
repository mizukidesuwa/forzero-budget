export const flyoverClearance = { accessHeight: .40, obstructionHeight: 2.78, deckTolerance: .34 };

export const londonTraffic = {
  routes: [
    { roads: ['euston'], count: 8, speed: 11.8, buses: true },
    { roads: ['gower'], count: 6, speed: 9.5, buses: true },
    { roads: ['court'], count: 7, speed: 10.8, buses: true },
    { roads: ['bedford'], count: 4, speed: 8.7 },
    { roads: ['woburnPlace', 'woburnLower'], count: 6, speed: 10.2, buses: true },
    { roads: ['russellNorth', 'russellEast', 'russellSouth', 'russellWest'], count: 5, speed: 8.3, loop: true },
  ],
  lane: 2.05, wideLane: 2.6, busEvery: 4, busesPerRoute: 1,
  dimensions: { cab: { halfL: 2.25, halfW: .96 }, bus: { halfL: 4.65, halfW: 1.20 } },
};
