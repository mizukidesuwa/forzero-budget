// @ts-check
import { relativeBearing } from '../race/blind-nav.js';
import { message, translate } from './language.js';
import { courierSummary } from './presentation-text.js';

/**
 * @typedef {import('./scene-hud.js').HudActivity} ActivityHud
 * @typedef {import('./scene-hud.js').HudCallout} CalloutHud
 * @typedef {{activity: ActivityHud, warning: string, callout: CalloutHud | null}} ChaseHud
 * @typedef {import('./scene-hud.js').HudNotice} BlindHud
 * @typedef {{
 *   active: boolean, phase: string, headStartRemainingMs: number, elapsedMs: number,
 *   lastPing: {atMs: number, landmark?: string | null} | null,
 *   distance: number, visible: boolean, proximity: string, rejoinAtMs: number,
 *   unranked: boolean, isBest: boolean, bestMs: number | null, progress: {wins: number},
 * }} ShadowChaseState
 * @typedef {{
 *   active: boolean, bellPulseUntilMs: number,
 *   bellTarget: {arrow: string, label: string, distance?: number | null, name?: string | null} | null,
 *   hazardUntilMs: number, hazardLabel: string,
 * }} BlindState
 * @typedef {{
 *   active: boolean, target: {p: number[], name: string, district: string} | null,
 *   remaining: number, streak: number, summaryText: string, summaryUntil: number,
 *   discoveredCount: (campus: string) => number,
 * }} CourierState
 * @typedef {import('../race/online-chase.js').OnlineChasePeerEvaluation} OnlineChaseView
 */

/** @param {number} ms */
function secondsRemaining(ms) {
  return Math.max(1, Math.ceil(ms / 1000));
}

/** @param {number} distance */
function approximateDistance(distance) {
  return Math.max(10, Math.round(distance / 10) * 10);
}

/**
 * @param {ShadowChaseState | null | undefined} chase
 * @param {(ms: number) => string} timeLabel
 * @param {boolean} [paused]
 * @returns {ChaseHud | null}
 */
export function getChaseHud(chase, timeLabel, paused = false) {
  if (!chase?.active) return null;

  const elapsed = timeLabel(chase.elapsedMs);
  let title;
  let detail;
  /** @type {CalloutHud | null} */
  let callout = null;
  if (chase.phase === 'headstart') {
    const seconds = secondsRemaining(chase.headStartRemainingMs);
    title = '影子追捕 · 目标先发';
    detail = message`还有 ${seconds} 秒出发追捕`;
    callout = {mode: 'count', title: translate('逃跑者先行中'), value: String(seconds), detail: translate('延迟结束后自由拦截'), large: true};
  } else if (chase.phase === 'active') {
    const pingAge = chase.lastPing ? Math.floor(Math.max(0, chase.elapsedMs - chase.lastPing.atMs) / 1000) : 0;
    const spot = translate(chase.lastPing?.landmark || '未知路段');
    const near = chase.proximity === 'near';
    const status = chase.visible ? message`目标已现形 · ${Math.round(chase.distance)}m`
      : near ? message`雷达逼近 · 约 ${approximateDistance(chase.distance)}m`
        : message`最后扫描 · ${spot}（${pingAge}s 前）`;
    title = chase.visible ? '影子追捕 · 视野锁定' : near ? '影子追捕 · 目标逼近' : '影子追捕';
    detail = `${elapsed} · ${status}`;
  } else if (chase.phase === 'caught') {
    const record = chase.unranked ? translate('娱乐改装 · 本场不计榜')
      : chase.isBest ? translate('刷新追捕最佳')
        : chase.bestMs !== null ? message`追捕最佳 ${timeLabel(chase.bestMs)}` : '';
    const wins = message`累计 ${chase.progress.wins} 次拦截`;
    title = '影子追捕 · 拦截成功';
    detail = elapsed;
    callout = {mode: 'done', title: translate('拦截成功'), value: elapsed, detail: [record, wins].filter(Boolean).join(' · '), action: translate('再追一次')};
  } else {
    title = '影子追捕 · 目标脱逃';
    detail = elapsed;
    if (chase.phase === 'escaped') {
      callout = {mode: 'done', title: translate('目标已脱逃'), value: elapsed, detail: translate('逃跑者已抵达终点'), action: translate('再追一次')};
    }
  }

  const showRejoin = chase.phase === 'active' && chase.elapsedMs - chase.rejoinAtMs < 1250;
  return {
    activity: {mode: 'shadow-chase', title: translate(title), detail},
    warning: showRejoin ? translate('已回到赛道 · 加 2 秒') : '',
    callout: paused ? {mode: 'paused', title: translate('已暂停'), value: translate('按 P 继续'), action: translate('继续骑行')} : callout,
  };
}

/**
 * @param {OnlineChaseView | null | undefined} view
 * @param {(ms: number) => string} timeLabel
 * @returns {ChaseHud | null}
 */
export function getOnlineChaseHud(view, timeLabel) {
  if (!view?.snap?.active) return null;
  const { snap } = view;

  const isHunter = snap.role === 'hunter';
  const remaining = timeLabel(snap.remainingMs);
  let title;
  let detail;
  /** @type {CalloutHud | null} */
  let callout = null;
  if (snap.phase === 'count') {
    const seconds = secondsRemaining(snap.countdownMs);
    title = isHunter ? '联机捉人 · 本轮捉人者' : '联机捉人 · 本轮逃跑者';
    detail = message`发车倒计时 ${seconds} 秒`;
    callout = {
      mode: 'count', title: translate(isHunter ? '准备出击（捉人者）' : '准备逃脱（逃跑者）'), value: String(seconds),
      detail: translate(isHunter ? '发车后需等待逃跑者先行 6 秒' : '开局即全速拉开距离！'), large: true,
    };
  } else if (snap.hunterLocked) {
    const seconds = secondsRemaining(snap.headStartRemainingMs);
    title = '联机捉人 · 逃跑者先行';
    detail = message`还有 ${seconds} 秒出发拦截`;
    callout = {mode: 'count', title: translate('逃跑者先行中'), value: String(seconds), detail: translate('倒计时结束后自由追捕'), large: true};
  } else if (snap.isCaught) {
    title = '联机捉人 · 已被抓获';
    detail = message`余 ${remaining} · 等待本轮结束`;
    callout = {mode: 'done', title: translate('已被抓获'), value: timeLabel(snap.selfCaughtAt ?? snap.elapsedMs), detail: translate('观战中，等待本轮结算')};
  } else if (isHunter) {
    const approx = Number.isFinite(view.nearestDistance) && view.nearestDistance < 9000
      ? message`最近目标约 ${approximateDistance(view.nearestDistance)}m` : translate('雷达扫描中');
    title = view.visibleRiders?.length ? '联机捉人 · 目标现形' : '联机捉人 · 捉人者';
    detail = `${remaining} · ${message`已抓 ${snap.caughtCount}/${snap.totalRunners}`} · ${approx}`;
  } else {
    const alert = view.proximity === 'locked' ? translate('危险逼近！')
      : view.proximity === 'near' ? message`捉人者接近 · 约 ${approximateDistance(view.nearestDistance)}m`
        : translate('保持隐蔽转移');
    title = '联机捉人 · 逃跑者';
    detail = `${remaining} · ${message`存活 ${snap.remainingRunners}/${snap.totalRunners}`} · ${alert}`;
  }
  return {activity: {mode: 'online-chase', title: translate(title), detail}, warning: '', callout};
}

/**
 * @param {BlindState | null | undefined} blind
 * @param {number} nowMs
 * @param {boolean} online
 * @param {boolean} touch
 * @returns {BlindHud | null}
 */
export function getBlindHud(blind, nowMs, online, touch) {
  if (!blind?.active || online) return null;
  if (nowMs < blind.bellPulseUntilMs && blind.bellTarget) {
    const { arrow, label, distance, name } = blind.bellTarget;
    const distPart = distance != null ? ` ${distance}m` : '';
    const namePart = name ? ` · ${translate(name)}` : '';
    return {text: message`回声 · ${arrow} ${translate(label)}${distPart}${namePart}`, tone: 'success'};
  }
  if (nowMs < blind.hazardUntilMs && blind.hazardLabel) {
    return {text: message`注意 · ${translate(blind.hazardLabel)}`, tone: 'warning'};
  }
  return {text: translate(touch ? '夜骑盲区 · 点按摇铃听方位' : '夜骑盲区 · 按 B/H 摇铃听方位'), tone: 'info'};
}

/**
 * @param {CourierState} courier
 * @param {{position: number[], heading: number}} rider
 * @param {string} campus
 * @param {number} nowMs
 * @returns {ActivityHud | null}
 */
export function getCourierHud(courier, rider, campus, nowMs) {
  const showSummary = nowMs < courier.summaryUntil;
  if (courier.active && courier.target) {
    const { p, name, district } = courier.target;
    const bearing = relativeBearing(rider, p);
    if (!bearing) return null;
    const { arrow, distance } = bearing;
    const flash = showSummary ? ' · ' + courierSummary(courier.summaryText) : '';
    return {
      mode: 'courier',
      title: message`闪送目标 · ${translate(name)}（${translate(district)}）`,
      detail: message`余 ${Math.ceil(courier.remaining)}s · ${arrow} ${distance}m · 连单 ${courier.streak} · 探索 ${courier.discoveredCount(campus)}/10${flash}`,
    };
  }
  return showSummary ? {mode: 'courier', title: translate('校园闪送'), detail: courierSummary(courier.summaryText)} : null;
}
