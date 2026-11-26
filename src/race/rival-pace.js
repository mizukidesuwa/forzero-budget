import { rivalRules as rules, benchmarkRules } from '../data/race.js';
import { createWorldQuery } from '../world/query.js';

export function rivalPaceProfile(event, run, vehicle, targetMs, difficulty = 'standard', driverIndex = 0) {
  const query = createWorldQuery(event.campus);
  const skill = rules.skill[vehicle];
  const behavior = rules.behavior[difficulty] ?? rules.behavior.standard;
  const samples = [run.samples[0].slice()];
  const bursts = [];
  let clock = 0;
  for (let i = 1; i < run.samples.length; i++) {
    const sample = run.samples[i], previous = run.samples[i - 1];
    const [time, x, y, z, heading, speed, travel, steering] = sample;
    const progress = travel - benchmarkRules.startOffset;
    const grade = query.riderGrade([x, y, z], heading);
    const window = progress % rules.skillPeriod;
    const curve = Math.abs(steering) >= rules.maximumCurve;
    const straight = !curve && window < rules.straightWindow;
    const climb = vehicle !== 'trail' && grade > rules.minimumGrade && window < rules.climbWindow;
    const useSkill = speed >= rules.minimumSkillSpeed && progress > rules.gridMerge && (straight || climb);
    const controlledMistake = curve && behavior.mistake > 0 &&
      (i + driverIndex * 5) % behavior.mistakePeriod === 0;
    const cornerPace = curve ? behavior.curvePace * (controlledMistake ? behavior.mistake : 1) : 1;
    const skillDelay = behavior.skillDelay;
    const skillReady = progress > rules.gridMerge + skillDelay;
    clock += (time - previous[0]) / (useSkill && skillReady ? skill.rate : 1) / cornerPace;
    samples.push([clock, ...sample.slice(1)]);
    if (useSkill) {
      const last = bursts.at(-1);
      if (last?.end === samples[i - 1][0]) last.end = clock;
      else bursts.push({ start: samples[i - 1][0], end: clock });
    }
  }
  const scale = targetMs / clock;
  for (const sample of samples) sample[0] *= scale;
  for (const burst of bursts) {
    burst.start *= scale;
    burst.end *= scale;
  }
  return { time: targetMs, samples, bursts, skill: skill.name };
}
