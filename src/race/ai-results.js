import { getStorage, worldState } from '../core/state.js';
import { recordKey } from './records.js';
import { aiRank, knownAiDifficulty, knownRaceMode } from './rivals.js';

const keyFor = (event, vehicle, mode, difficulty) => 'szu-litchi-ai-wins:' +
  recordKey(event, vehicle) + ':' + knownRaceMode(mode) + ':' + knownAiDifficulty(difficulty);

export function aiWins(event, vehicle, mode, difficulty) {
  try {
    const wins = Number(getStorage()?.getItem(keyFor(event, vehicle, mode, difficulty)));
    return Number.isSafeInteger(wins) && wins > 0 ? wins : 0;
  } catch {
    return 0;
  }
}

export function recordAiWin(trial) {
  if (trial.unranked || trial.online || trial.opponent || trial.practice || aiRank(trial)?.rank !== 1) return null;
  const { event, rider: { vehicle }, raceMode, aiDifficulty } = trial;
  const wins = aiWins(event, vehicle, raceMode, aiDifficulty) + 1;
  try { getStorage()?.setItem(keyFor(event, vehicle, raceMode, aiDifficulty), String(wins)); } catch {}
  worldState.hooks.scheduleSave?.();
  return wins;
}
