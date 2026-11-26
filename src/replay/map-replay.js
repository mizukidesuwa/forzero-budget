import { clamp, mix } from '../core/math.js';

export const mapReplay = { run: null, time: 0, speed: 1, playing: false, lastDraw: null };

export function replayGapAt(run, reference, time) {
  const index = run.splits.findIndex(split => split >= time);
  if (index < 0 || !Number.isFinite(reference.splits?.[index])) {
    const shared = Math.min(run.splits.length, reference.splits?.length ?? 0) - 1;
    return shared < 0 ? null : run.splits[shared] - reference.splits[shared];
  }
  const from = run.splits[index - 1] ?? 0, refFrom = reference.splits[index - 1] ?? 0;
  const fraction = clamp((time - from) / Math.max(1, run.splits[index] - from), 0, 1);
  return time - mix(refFrom, reference.splits[index], fraction);
}

export function advanceMapReplay(state, dt, max) {
  if (state.playing) {
    state.time = Math.min(max, state.time + dt * 1000 * state.speed);
    if (state.time >= max) state.playing = false;
  }
}
