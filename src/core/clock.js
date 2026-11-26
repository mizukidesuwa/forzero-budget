export const PHYSICS_STEP = 1 / 120;
export const STEP_MS = 1000 / 120;
export const COUNTDOWN_TICKS = 360;
export const REJOIN_MS = 2000;
export const SAMPLE_MS = 112;
export const MAX_RUN_MS = 15 * 60 * 1000;

export const neutralDrive = { gas: false, brake: false, left: false, right: false, sprint: false };

export function createInputTimeline(initial = neutralDrive) {
  let state = { ...neutralDrive, ...initial };
  return {
    get: () => state,
    set: (next) => { state = { ...neutralDrive, ...next }; return state; },
    clear: () => { state = { ...neutralDrive }; return state; },
  };
}
