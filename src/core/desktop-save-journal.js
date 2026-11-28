// @ts-check

export const pendingDesktopSaveKey = 'forzero-pending-desktop-save';

/** @param {string | null} raw @returns {Set<string>} */
export function pendingDesktopSaveKeys(raw) {
  const keys = new Set();
  try {
    const journal = JSON.parse(raw ?? 'null');
    if (typeof journal?.revision === 'string' && Array.isArray(journal.keys)) {
      for (const key of journal.keys) if (typeof key === 'string') keys.add(key);
    }
  } catch {}
  return keys;
}

/** @param {string | null} raw @param {string[]} keys */
export function extendDesktopSaveJournal(raw, keys) {
  if (!keys.length) return raw;
  const pending = pendingDesktopSaveKeys(raw);
  for (const key of keys) pending.add(key);
  return JSON.stringify({ revision: crypto.randomUUID(), keys: [...pending] });
}

/** @param {Record<string, string>} before @param {Record<string, string>} after */
export function changedDesktopSaveKeys(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(key => before[key] !== after[key]);
}
