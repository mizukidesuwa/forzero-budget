import { rivalRules as rules, benchmarkRules } from '../data/race.js';
import { createWorldQuery } from '../world/query.js';

export function rivalPaceProfile(event, run, vehicle, targetMs) {
  const query = createWorldQuery(event.campus);
  const skill = rules.skill[vehicle];
  const samples = [run.samples[0].slice()];
  const bursts = [];
  let clock = 0;
  for (let i = 1; i < run.samples.length; i++) {
    const sample = run.samples[i], previous = run.samples[i - 1];
    const [time, x, y, z, heading, speed, travel, steering] = sample;
    const progress = travel - benchmarkRules.startOffset;
    const grade = query.riderGrade([x, y, z], heading);
    const window = progress % rules.skillPeriod;
    const straight = Math.abs(steering) < rules.maximumCurve && window < rules.straightWindow;
    const climb = vehicle !== 'trail' && grade > rules.minimumGrade && window < rules.climbWindow;
    const useSkill = speed >= rules.minimumSkillSpeed && progress > rules.gridMerge && (straight || climb);
    clock += (time - previous[0]) / (useSkill ? skill.rate : 1);
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
