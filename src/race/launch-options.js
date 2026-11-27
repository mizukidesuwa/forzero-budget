// @ts-check
import { knownLaunchMode } from '../data/modes.js';
import { knownAiDifficulty, knownRaceMode } from './rivals.js';

/**
 * @param {{ online?: boolean, mode?: string, difficulty?: string }} selection
 */
export function raceLaunchOptions({ online = false, mode, difficulty }) {
  const launchMode = knownLaunchMode(online ? 'solo' : mode);
  return {
    launchMode,
    raceMode: knownRaceMode(launchMode),
    aiDifficulty: knownAiDifficulty(online ? 'standard' : difficulty),
  };
}
