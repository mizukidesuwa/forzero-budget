import { getPreferences, worldState } from '../core/state.js';
import tuning190 from './tuning-rules.js';

export function selectedParts(trial, vehicle = trial.rider.vehicle) {
  if (vehicle === 'bike') return trial.bike;
  if (trial.rider.vehicle === vehicle && trial.rider.tuning?.parts) return trial.rider.tuning.parts;
  return worldState.vehicleTunings?.[vehicle] ?? null;
}

export function soloBudget(trial) {
  const mode = getPreferences()?.soloBudget ?? 'open';
  const limit = tuning190.budgetLimit(mode), vehicle = trial.entryVehicle;
  const build = tuning190.summarize(vehicle, selectedParts(trial, vehicle));
  return { ...build, limit, over: limit === null ? 0 : Math.max(0, build.total - limit) };
}

export function workshopBudget(trial) {
  const room = worldState.onlineRoom?.state ?? null;
  if (!room) return soloBudget(trial);
  const vehicle = trial.rider.vehicle;
  const build = tuning190.summarize(vehicle, selectedParts(trial, vehicle));
  const limit = room.tuning?.budget ?? room.round?.budget ?? tuning190.budgetLimit(room.budget);
  return { ...build, limit, over: limit === null ? 0 : Math.max(0, build.total - limit) };
}
