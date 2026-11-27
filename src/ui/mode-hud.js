import { message, translate } from './language.js';

export function updateChaseHud(ui, chase, timeLabel, mapOpen = false, online = false, paused = false) {
  if (!chase?.active || online) return false;
  if (ui.courierHud) {
    ui.courierHud.hidden = false;
    if (chase.phase === 'headstart') {
      const waitSec = Math.max(1, Math.ceil(chase.headStartRemainingMs / 1000));
      setTextLabel(ui.courierTitle, '影子追捕 · 目标先发');
      setLabel(ui.courierDetail, message`还有 ${waitSec} 秒出发追捕`);
    } else if (chase.phase === 'active') {
      const pingAge = chase.lastPing ? Math.floor(Math.max(0, chase.elapsedMs - chase.lastPing.atMs) / 1000) : 0;
      const spot = chase.lastPing?.landmark ? translate(chase.lastPing.landmark) : translate('未知路段');
      const approxMeters = Math.max(10, Math.round(chase.distance / 10) * 10);
      const status = chase.visible
        ? message`目标已现形 · ${Math.round(chase.distance)}m`
        : chase.proximity === 'near'
          ? message`雷达逼近 · 约 ${approxMeters}m`
          : message`最后扫描 · ${spot}（${pingAge}s 前）`;
      const title = chase.visible
        ? '影子追捕 · 视野锁定'
        : chase.proximity === 'near'
          ? '影子追捕 · 目标逼近'
          : '影子追捕';
      setTextLabel(ui.courierTitle, title);
      setLabel(ui.courierDetail, `${timeLabel(chase.elapsedMs)} · ${status}`);
    } else if (chase.phase === 'caught') {
      setTextLabel(ui.courierTitle, '影子追捕 · 拦截成功');
      setLabel(ui.courierDetail, timeLabel(chase.elapsedMs));
    } else {
      setTextLabel(ui.courierTitle, '影子追捕 · 目标脱逃');
      setLabel(ui.courierDetail, timeLabel(chase.elapsedMs));
    }
  }

  const showRejoin = chase.phase === 'active' && chase.elapsedMs - chase.rejoinAtMs < 1250;
  if (ui.next) {
    ui.next.hidden = !showRejoin;
    if (showRejoin) {
      setTextLabel(ui.next, '已回到赛道 · 加 2 秒');
      delete ui.next.dataset.alert;
    }
  }

  if (ui.callout) {
    const showCallout = !mapOpen && (paused || chase.phase === 'headstart' || chase.phase === 'caught' || chase.phase === 'escaped');
    ui.callout.hidden = !showCallout;
    ui.callout.dataset.mode = paused ? 'paused' : chase.phase === 'headstart' ? 'count' : 'done';
    ui.callout.classList.remove('has-review');
    if (ui.raceReview) ui.raceReview.hidden = true;
    if (ui.friendExport) ui.friendExport.hidden = true;
    if (ui.reviewMapButton) ui.reviewMapButton.hidden = true;
    if (ui.practiceExit) ui.practiceExit.hidden = true;
    if (showCallout) {
      if (paused) {
        setTextLabel(ui.callTitle, '已暂停');
        setTextLabel(ui.callValue, '按 P 继续');
        ui.callValue.classList.remove('count-number');
        ui.callDetail.hidden = true;
        ui.callAction.hidden = false;
        setTextLabel(ui.callAction, '继续骑行');
      } else if (chase.phase === 'headstart') {
        const sec = Math.max(1, Math.ceil(chase.headStartRemainingMs / 1000));
        setTextLabel(ui.callTitle, '逃跑者先行中');
        setLabel(ui.callValue, String(sec));
        ui.callValue.classList.add('count-number');
        ui.callDetail.hidden = false;
        setTextLabel(ui.callDetail, '延迟结束后自由拦截');
        ui.callAction.hidden = true;
      } else if (chase.phase === 'caught') {
        setTextLabel(ui.callTitle, '拦截成功');
        setLabel(ui.callValue, timeLabel(chase.elapsedMs));
        ui.callValue.classList.remove('count-number');
        const recordText = chase.unranked
          ? translate('娱乐改装 · 本场不计榜')
          : chase.isBest
            ? translate('刷新追捕最佳')
            : chase.bestMs !== null
              ? message`追捕最佳 ${timeLabel(chase.bestMs)}`
              : '';
        const winsText = message`累计 ${chase.progress.wins} 次拦截`;
        ui.callDetail.hidden = false;
        setLabel(ui.callDetail, [recordText, winsText].filter(Boolean).join(' · '));
        ui.callAction.hidden = false;
        setTextLabel(ui.callAction, '再追一次');
      } else {
        setTextLabel(ui.callTitle, '目标已脱逃');
        setLabel(ui.callValue, timeLabel(chase.elapsedMs));
        ui.callValue.classList.remove('count-number');
        ui.callDetail.hidden = false;
        setTextLabel(ui.callDetail, '逃跑者已抵达终点');
        ui.callAction.hidden = false;
        setTextLabel(ui.callAction, '再追一次');
      }
    }
  }
  return true;

  function setLabel(el, value) {
    if (el && el.textContent !== value) el.textContent = value;
  }
  function setTextLabel(el, value) {
    setLabel(el, translate(value));
  }
}

export function updateBlindHud(ui, blind, nowMs, online = false) {
  const active = Boolean(blind?.active && !online);
  if (ui.miniButton) ui.miniButton.hidden = active;
  if (ui.touchBell) ui.touchBell.hidden = !active;
  if (!ui.blindHint) return;
  ui.blindHint.hidden = !active;
  if (!active) return;

  let text;
  if (nowMs < blind.bellPulseUntilMs && blind.bellTarget) {
    const { arrow, label, distance, name } = blind.bellTarget;
    const distPart = distance !== null && distance !== undefined ? ` ${distance}m` : '';
    const namePart = name ? ` · ${translate(name)}` : '';
    text = message`回声 · ${arrow} ${translate(label)}${distPart}${namePart}`;
    ui.blindHint.dataset.alert = 'pulse';
  } else if (nowMs < blind.hazardUntilMs && blind.hazardLabel) {
    text = message`注意 · ${translate(blind.hazardLabel)}`;
    ui.blindHint.dataset.alert = 'hazard';
  } else {
    text = translate('夜骑盲区 · 按 B/H 摇铃听方位');
    delete ui.blindHint.dataset.alert;
  }
  if (ui.blindHint.textContent !== text) ui.blindHint.textContent = text;
}

export function updateOnlineChaseHud(ui, view, timeLabel, mapOpen = false) {
  const snap = view?.snap;
  if (!snap?.active) return false;
  if (ui.courierHud) {
    ui.courierHud.hidden = false;
    const isHunter = snap.role === 'hunter';
    const rem = timeLabel(snap.remainingMs);
    if (snap.phase === 'count') {
      setTextLabel(ui.courierTitle, isHunter ? '联机捉人 · 本轮捉人者' : '联机捉人 · 本轮逃跑者');
      setLabel(ui.courierDetail, message`发车倒计时 ${Math.max(1, Math.ceil(snap.countdownMs / 1000))} 秒`);
    } else if (snap.hunterLocked) {
      setTextLabel(ui.courierTitle, '联机捉人 · 逃跑者先行');
      setLabel(ui.courierDetail, message`还有 ${Math.max(1, Math.ceil(snap.headStartRemainingMs / 1000))} 秒出发拦截`);
    } else if (snap.isCaught) {
      setTextLabel(ui.courierTitle, '联机捉人 · 已被抓获');
      setLabel(ui.courierDetail, message`余 ${rem} · 等待本轮结束`);
    } else if (isHunter) {
      const approx = Number.isFinite(view.nearestDistance) && view.nearestDistance < 9000
        ? message`最近目标约 ${Math.max(10, Math.round(view.nearestDistance / 10) * 10)}m`
        : translate('雷达扫描中');
      setTextLabel(ui.courierTitle, view.visibleRiders?.length ? '联机捉人 · 目标现形' : '联机捉人 · 捉人者');
      setLabel(ui.courierDetail, `${rem} · ${message`已抓 ${snap.caughtCount}/${snap.totalRunners}`} · ${approx}`);
    } else {
      const alertText = view.proximity === 'locked'
        ? translate('危险逼近！')
        : view.proximity === 'near'
          ? message`捉人者接近 · 约 ${Math.max(10, Math.round(view.nearestDistance / 10) * 10)}m`
          : translate('保持隐蔽转移');
      setTextLabel(ui.courierTitle, '联机捉人 · 逃跑者');
      setLabel(ui.courierDetail, `${rem} · ${message`存活 ${snap.remainingRunners}/${snap.totalRunners}`} · ${alertText}`);
    }
  }

  if (ui.callout) {
    const showCallout = !mapOpen && (snap.phase === 'count' || snap.hunterLocked || snap.isCaught);
    ui.callout.hidden = !showCallout;
    ui.callout.dataset.mode = snap.isCaught ? 'done' : 'count';
    ui.callout.classList.remove('has-review');
    if (ui.raceReview) ui.raceReview.hidden = true;
    if (ui.friendExport) ui.friendExport.hidden = true;
    if (ui.reviewMapButton) ui.reviewMapButton.hidden = true;
    if (ui.practiceExit) ui.practiceExit.hidden = true;
    if (showCallout) {
      if (snap.phase === 'count') {
        const sec = Math.max(1, Math.ceil(snap.countdownMs / 1000));
        setTextLabel(ui.callTitle, snap.role === 'hunter' ? '准备出击（捉人者）' : '准备逃脱（逃跑者）');
        setLabel(ui.callValue, String(sec));
        ui.callValue.classList.add('count-number');
        ui.callDetail.hidden = false;
        setTextLabel(ui.callDetail, snap.role === 'hunter' ? '发车后需等待逃跑者先行 6 秒' : '开局即全速拉开距离！');
        ui.callAction.hidden = true;
      } else if (snap.hunterLocked) {
        const sec = Math.max(1, Math.ceil(snap.headStartRemainingMs / 1000));
        setTextLabel(ui.callTitle, '逃跑者先行中');
        setLabel(ui.callValue, String(sec));
        ui.callValue.classList.add('count-number');
        ui.callDetail.hidden = false;
        setTextLabel(ui.callDetail, '倒计时结束后自由追捕');
        ui.callAction.hidden = true;
      } else {
        setTextLabel(ui.callTitle, '已被抓获');
        setLabel(ui.callValue, timeLabel(snap.selfCaughtAt ?? snap.elapsedMs));
        ui.callValue.classList.remove('count-number');
        ui.callDetail.hidden = false;
        setTextLabel(ui.callDetail, '观战中，等待本轮结算');
        ui.callAction.hidden = true;
      }
    }
  }
  return true;

  function setLabel(el, value) {
    if (el && el.textContent !== value) el.textContent = value;
  }
  function setTextLabel(el, value) {
    setLabel(el, translate(value));
  }
}
