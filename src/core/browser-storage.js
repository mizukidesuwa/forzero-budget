// @ts-check

const installId = globalThis.document?.querySelector('meta[name="forzero-installation"]')?.getAttribute('content');
export const desktopInstallId = installId && /^[a-f0-9]{64}$/.test(installId) ? installId : null;

/** @typedef {Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>} PlayerStorage */

/** @returns {PlayerStorage | null} */
export function browserPlayerStorage() {
  let storage;
  try { storage = globalThis.localStorage; } catch { return null; }
  if (!storage || !desktopInstallId) return storage ?? null;
  const prefix = `forzero-install:${desktopInstallId}:`;
  const keys = () => {
    const own = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(prefix)) own.push(key.slice(prefix.length));
    }
    return own;
  };
  return {
    get length() { return keys().length; },
    key: index => keys()[index] ?? null,
    getItem: key => storage.getItem(prefix + key),
    setItem: (key, value) => storage.setItem(prefix + key, value),
    removeItem: key => storage.removeItem(prefix + key),
  };
}
