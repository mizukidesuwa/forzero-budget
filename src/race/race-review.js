// @ts-check

/** @typedef {{name: string, duration: number, delta: number}} Sector */
/** @typedef {{startGate: number, finishGate: number}} Stage */
/**
 * @param {{
 *   practice: unknown,
 *   event: {stages?: Stage[]},
 *   splits: number[],
 *   stageSector: (stage: Stage) => Sector | null,
 *   sector: (index: number) => Sector | null
 * }} race
 */
export function raceReviewRows(race) {
  if (race.practice) return [];
  const rows = race.event.stages
    ? race.event.stages.map(stage => ({
      sector: race.stageSector(stage), fromGate: stage.startGate, toGate: stage.finishGate,
    }))
    : race.splits.map((_, index) => ({
      sector: race.sector(index), fromGate: index, toGate: index + 1,
    }));
  return rows.filter(row => row.sector !== null);
}
