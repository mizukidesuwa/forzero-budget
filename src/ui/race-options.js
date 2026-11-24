import { aiWins } from '../race/ai-results.js';
import { courseIsLoop, getCourseVariant } from '../race/course-variants.js';
import { knownAiDifficulty, knownRaceMode } from '../race/rivals.js';

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
  const mode = knownRaceMode(ui.raceMode.value);
  ui.aiOptions.hidden = readOnly || mode === 'solo';
  if (!ui.aiOptions.hidden) {
    const vehicle = race.entryVehicle, difficulty = ui.aiDifficulty.value;
    if (winsShown?.event !== event || winsShown.vehicle !== vehicle ||
        winsShown.mode !== mode || winsShown.difficulty !== difficulty) {
      ui.aiWins.textContent = aiWins(event, vehicle, mode, difficulty) + ' 胜';
      winsShown = { event, vehicle, mode, difficulty };
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

export function applyRaceOptions(ui, race) {
  race.raceMode = knownRaceMode(ui.raceMode.value);
  race.aiDifficulty = knownAiDifficulty(ui.aiDifficulty.value);
}
