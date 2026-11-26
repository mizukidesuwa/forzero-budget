import { englishText } from '../data/english-text.js';

const storageKey = 'forzero-language';
const attributes = ['aria-label', 'title', 'placeholder', 'alt'];
const staticBindings = [];
const managedText = new WeakSet();
const translatedAttributes = new WeakMap();
const messageKeys = new WeakMap();
let language = 'zh-CN';

export const getLanguage = () => language;

export function translate(text) {
  return language === 'en' && Object.hasOwn(englishText, text) ? englishText[text] : text;
}

export function message(parts, ...values) {
  let key = messageKeys.get(parts);
  if (!key) {
    key = parts.reduce((text, part, index) => index ? `${text}{${index - 1}}${part}` : part, '');
    messageKeys.set(parts, key);
  }
  return translate(key).replace(/\{(\d+)\}/g, (_, index) => values[index]);
}

export function courseTitle(event) {
  if (language !== 'en') return event.name;
  const base = event.baseCourse ?? event;
  const { direction, laps } = event.variant ?? {};
  const start = translate(base.gates[0].name);
  const finish = translate(base.gates.at(-1).name);
  const title = base.seed ? (base.environment ? `Weekly Challenge ${base.seed}` : `Seeded Race ${base.seed}`) :
    base.networkRevision ? `Road Route · ${start} → ${finish}` : translate(base.name);
  return [title, direction === 'reverse' && 'Reverse', laps > 1 && `${laps} Laps`].filter(Boolean).join(' · ');
}

export function courseDescription(event) {
  if (language !== 'en' || (!event.seed && !event.networkRevision)) return translate(event.description);
  const base = event.baseCourse ?? event;
  const start = translate(base.gates[0].name);
  const finish = translate(base.gates.at(-1).name);
  return `${start} → ${finish} · ${Math.round(event.length)} m`;
}

export function checkpointLabel(source) {
  const lap = /^第 (\d+) 圈$/.exec(source);
  if (lap) return message`第 ${lap[1]} 圈`;
  return source?.includes(' → ') ? source.split(' → ').map(translate).join(' → ') : translate(source);
}

function capture(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.parentElement?.closest('style,script,.brand-zh')) continue;
      const source = node.data.trim();
      if (node.parentElement?.localName === 'title') {
        const versionedTitle = /^(FORZERO: BUDGET · 有限竞速：地贫线)( \S+)$/.exec(source);
        if (versionedTitle) staticBindings.push(() => { node.data = translate(versionedTitle[1]) + versionedTitle[2]; });
      } else if (Object.hasOwn(englishText, source)) {
        const original = node.data;
        staticBindings.push(() => {
          if (node.parentNode && !managedText.has(node.parentNode)) node.data = original.replace(source, () => translate(source));
        });
      }
      continue;
    }
    for (const attribute of attributes) {
      const source = node.getAttribute(attribute);
      if (source && Object.hasOwn(englishText, source)) {
        staticBindings.push(() => {
          if (!translatedAttributes.get(node)?.has(attribute)) node.setAttribute(attribute, translate(source));
        });
      }
    }
    if (node instanceof HTMLTemplateElement) capture(node.content);
  }
}

export function setText(element, text) {
  managedText.add(element);
  if (element.textContent !== text) element.textContent = text;
}

export function setLabel(element, text) {
  setText(element, translate(text));
}

// For UI nodes created once during setup, such as Garage options.
export function bindText(element, render) {
  const update = () => setText(element, render());
  staticBindings.push(update);
  update();
}

export function setLanguageAttribute(element, attribute, text) {
  let owned = translatedAttributes.get(element);
  if (!owned) translatedAttributes.set(element, owned = new Set());
  owned.add(attribute);
  element.setAttribute(attribute, text);
}

function applyLanguage(next) {
  language = next === 'en' ? 'en' : 'zh-CN';
  document.documentElement.lang = language;
  for (const render of staticBindings) render();
}

export function initLanguage(select, refresh) {
  capture(document.documentElement);
  let saved;
  try { saved = localStorage.getItem(storageKey); } catch {}
  applyLanguage(saved);
  select.value = language;
  select.addEventListener('change', () => {
    applyLanguage(select.value);
    try { localStorage.setItem(storageKey, language); } catch {}
    refresh();
  });
}
