// @ts-check
import { trialMedal } from '../race/records.js';
import { aiRank } from '../race/rivals.js';
import { activeStage } from '../world/maps/szu.js';
import { checkpointLabel, message, translate } from './language.js';
import { gapTone, signedSeconds } from './presentation-text.js';

/** @typedef {import('../race/time-trial.js').TimeTrial} TimeTrial */
/** @typedef {import('./scene-hud.js').HudCheckpoint} HudCheckpoint */
/** @typedef {import('./scene-hud.js').HudCallout} HudCallout */

/** @param {TimeTrial} race @param {{timed: boolean, freeRiding: boolean, now: number, touch: boolean}} context */
export function describeRaceNavigation(race, { timed, freeRiding, now, touch }) {
  let route = '', mapHint = '', warning = '';
  if (timed) {
    const event = race.event;
    const gate = event.gates[race.nextGate];
    if (gate) {
      const leg = activeStage(event, race.nextGate);
      const label = gate.index === 0 ? '起点' : gate.index === event.gates.length - 1 ? '终点' : '下一站';
      mapHint = checkpointLabel(leg?.name ?? label) + ' · ' + checkpointLabel(gate.name);
      if (race.phase !== 'count') {
        const [x, , z] = race.rider.position;
        const distance = leg && race.onGuide ? Math.max(0, Math.round(gate.distance - race.progressEstimate)) :
          Math.round(Math.hypot(gate.p[0] - x, gate.p[2] - z));
        route = mapHint + ' · ' + message`${distance} 米`;
      }
    }
    if (race.phase === 'race' && race.elapsed - race.lastRejoin < 1250) {
      warning = race.rejoinReason ? message`${translate(race.rejoinReason)}，已强制遣返赛道 · 加 2 秒` : translate('已回到赛道 · 加 2 秒');
    } else if (race.phase === 'race' && gate && race.missedGate) {
      const number = translate(gate.number);
      warning = touch ? message`漏过检查点 ${number} · 在设置中返回赛道` :
        message`漏过检查点 ${number}（${checkpointLabel(gate.name)}）· 按 F 回到赛道`;
    }
  } else if (freeRiding && race.freeHazardNotice && now < race.freeHazardNotice.until) {
    warning = translate(race.freeHazardNotice.text);
  }
  return { route, mapHint, warning };
}

/** @param {TimeTrial} race @param {boolean} timed @returns {{checkpoint: HudCheckpoint | null, checkpointPulse: boolean}} */
export function describeCheckpoint(race, timed) {
  const gatePass = race.lastGatePass;
  if (!timed || race.phase !== 'race' || !gatePass || race.elapsed - gatePass.at >= 1450) {
    return { checkpoint: null, checkpointPulse: false };
  }
  const checkpointPulse = race.elapsed - gatePass.at < 520;
  if (gatePass.index === 0) return { checkpoint: { text: translate('已过起点 · 计时开始'), tone: 'even' }, checkpointPulse };
  const gap = gatePass.sectorDelta ?? gatePass.delta;
  const gapText = gap == null ? '' : ' · ' + message`${signedSeconds(gap)} 秒`;
  return {
    checkpoint: { text: message`通过检查点 ${translate(gatePass.number)} · ${checkpointLabel(gatePass.name)}${gapText}`, tone: gapTone(gap) },
    checkpointPulse,
  };
}

/**
 * @param {TimeTrial} race
 * @param {{clock: string, online: boolean, blindNote: string, timeLabel: (ms: number) => string, friendResult: (opponent: NonNullable<TimeTrial['opponent']>, elapsed: number) => string}} context
 * @returns {HudCallout | null}
 */
export function describeRaceCallout(race, { clock, online, blindNote, timeLabel, friendResult }) {
  if (race.paused) return { mode: 'paused', title: translate('已暂停'), value: '', action: translate('继续骑行') };
  if (race.phase === 'done') {
    const ai = aiRank(race);
    const rank = ai ? message`第 ${ai.rank} / ${ai.total} 名` : translate(trialMedal(race));
    const practiceBest = race.practice ? race.practiceBest.get(race.practice.key) : null;
    const record = race.practice ? (race.record ? translate('刷新本段最佳') : message`本段最佳 ${timeLabel(practiceBest)}`) :
      race.blindRun ? blindNote : online || race.record || race.best === null ?
        translate(online ? '房间成绩' : race.record ? '刷新个人最佳' : '挑战完成') : message`个人最佳 ${timeLabel(race.best)}`;
    let duel = race.opponent ? friendResult(race.opponent, race.elapsed) : '';
    if (race.opponent && race.extraOpponents?.length) {
      const beats = [race.opponent, ...race.extraOpponents].filter(opponent => race.elapsed < opponent.time).length;
      duel = message`${duel}（击败 ${beats}/${1 + race.extraOpponents.length}）`;
    }
    const result = race.blindRun ? record : race.unranked ? translate('娱乐改装 · 不计榜') : ai ?
      (race.aiWinCount === null ? translate('AI 独立成绩') : message`AI 夺冠 · 累计 ${race.aiWinCount} 胜`) : record;
    return {
      mode: 'done', title: translate('完赛'), value: clock, detail: [duel, rank, result].filter(Boolean).join(' · '),
      action: online ? '' : translate(race.practice ? '再练本段' : '再跑一次'), review: !race.practice,
    };
  }
  if (race.phase === 'count') {
    const count = Math.ceil(race.countdown ?? 0);
    if (count > 0) {
      return { mode: 'count', title: translate('计时赛即将开始'), value: String(count), large: true,
        detail: race.unranked ? translate('娱乐改装 · 本场不计榜') : '' };
    }
    return { mode: 'count', title: '', value: translate('出发'), large: true };
  }
  if (race.phase === 'race' && race.elapsed < 610) return { mode: 'race', title: '', value: translate('出发'), large: true };
  return null;
}
