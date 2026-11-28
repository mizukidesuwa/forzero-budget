import { splitLabel } from '../race/records.js';
import { getLanguage, message, translate } from './language.js';

export function ghostLabel(ghost) {
  return ghost.name && ghost.kind === ghost.name + '的影子' ? message`${ghost.name}的影子` : translate(ghost.kind);
}

export function deltaLabel(delta) {
  if (getLanguage() !== 'en') return splitLabel(delta);
  if (Math.abs(delta) < 23) return 'Tied with ghost';
  const seconds = (Math.abs(delta) / 1000).toFixed(2);
  return `${seconds} s ${delta < 0 ? 'ahead' : 'behind'}`;
}

export function gapTone(delta) {
  return delta === null || Math.abs(delta) < 23 ? '' : delta < 0 ? 'ahead' : 'behind';
}

export function signedSeconds(delta) {
  if (Math.abs(delta) < 5) return '0.00';
  return (delta < 0 ? '−' : '+') + (Math.abs(delta) / 1000).toFixed(2);
}

export function feedbackLabel(source) {
  const match = /^(.+) (\d+\.\d) 秒$/.exec(source);
  return match ? message`${translate(match[1])} ${match[2]} 秒` : translate(source);
}

export function courierSummary(source) {
  const delivery = /^已送达 (.+)$/.exec(source);
  if (delivery) return message`已送达 ${translate(delivery[1])}`;
  const result = /^闪送结束 · 完成 (\d+) 单 · 最高连单 (\d+)（探索 (\d+)\/(\d+)）$/.exec(source);
  return result ? message`闪送结束 · 完成 ${result[1]} 单 · 最高连单 ${result[2]}（探索 ${result[3]}/${result[4]}）` : source;
}

export function onlineNoticeLabel(source) {
  if (getLanguage() !== 'en' || !source) return source;
  const budget = /^超预算 ¥(\d+)$/.exec(source);
  if (budget) return message`超预算 ¥${budget[1]}`;
  const workshop = /^(.+)，请先在车库调整。$/.exec(source);
  if (workshop) return message`${onlineNoticeLabel(workshop[1])}，请先在车库调整。`;
  const blocked = source.split('；').map(item => /^(.+)：(装有违禁魔改件|超预算 ¥\d+)$/.exec(item));
  if (blocked.every(Boolean)) {
    return blocked.map(([, name, reason]) => message`${name}：${onlineNoticeLabel(reason)}`).join(' · ');
  }
  const invite = /^(邀请链接已复制：|邀请链接 )(.+)$/.exec(source);
  if (invite) return invite[1] === '邀请链接已复制：' ? message`邀请链接已复制：${invite[2]}` : message`邀请链接 ${invite[2]}`;
  return translate(source);
}
