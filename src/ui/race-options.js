import { knownLaunchMode } from '../data/modes.js';
import { aiWins } from '../race/ai-results.js';
import { ShadowChase } from '../race/chase.js';
import { courseIsLoop, getCourseVariant } from '../race/course-variants.js';
import { getLanguage, message } from './language.js';

let winsShown = null;

export function updateRaceOptions(ui, race, locked) {
  const { event, opponent, practice } = race;
  const readOnly = locked || Boolean(opponent || practice);
  ui.courseVariants.hidden = readOnly || Boolean(event.seed);
  if (!ui.courseVariants.hidden) {
    ui.courseDirection.value = event.variant?.direction ?? 'forward';
    ui.courseLaps.hidden = !courseIsLoop(event.baseCourse ?? event);
    ui.courseLaps.value = String(event.variant?.laps ?? 1);
  }
  const mode = knownLaunchMode(ui.raceMode.value);
  ui.aiOptions.hidden = readOnly || mode === 'solo' || mode === 'blind';
  if (!ui.aiOptions.hidden) {
    const vehicle = race.entryVehicle, difficulty = ui.aiDifficulty.value;
    const wins = mode === 'chase' ? ShadowChase.progress.wins : aiWins(event, vehicle, mode, difficulty);
    if (winsShown?.event !== event || winsShown.vehicle !== vehicle || winsShown.wins !== wins ||
        winsShown.mode !== mode || winsShown.difficulty !== difficulty || winsShown.language !== getLanguage()) {
      ui.aiWins.textContent = mode === 'chase' ? message`${wins} 拦截` : message`${wins} 胜`;
      winsShown = { event, vehicle, mode, difficulty, wins, language: getLanguage() };
    }
  } else winsShown = null;
}

export function installRaceOptions(ui, race, selectCourse, refresh) {
  function selectVariant() {
    if (ui.courseVariants.hidden) return;
    selectCourse(getCourseVariant(race.event, { direction: ui.courseDirection.value, laps: Number(ui.courseLaps.value) }));
  }
  ui.courseDirection.addEventListener('change', selectVariant);
  ui.courseLaps.addEventListener('change', selectVariant);
  ui.raceMode.addEventListener('change', refresh);
  ui.aiDifficulty.addEventListener('change', refresh);
}
