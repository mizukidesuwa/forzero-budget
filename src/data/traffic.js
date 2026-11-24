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
  reentryDistance: 48, terminalFade: 17, collisionOpacity: .7,
  formation: { sparse: 3, standard: 5, gap: 34, sightDistance: 110, sightDot: .66 },
  render: { detailDistance: 75, fadeDistance: 166, drawDistance: 190 },
  dimensions: { cab: { halfL: 2.25, halfW: .96, height: 1.8 }, bus: { halfL: 4.65, halfW: 1.20, height: 3.8 } },
};
