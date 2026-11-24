export function updateDraftHud(element, draft) {
  const charge = draft?.charge ?? 0;
  const burst = (draft?.burst ?? 0) > 0;
  element.hidden = !charge && !burst;
  if (element.hidden) return;
  const percent = Math.round(charge * 100);
  const text = burst ? '弹弓加速' : charge === 1 ? '弹弓就绪' : '尾流充能';
  if (element.textContent !== text) element.textContent = text;
  element.style.setProperty('--draft-charge', (burst ? 100 : percent) + '%');
  element.setAttribute('aria-label', burst ? text : text + ' ' + percent + '%');
}
