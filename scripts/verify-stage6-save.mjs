import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const desktop = resolve(process.env.FORZERO_RELEASE_DIR ??
  (existsSync('forzero-budget-2.1.1/index.html') ? 'forzero-budget-2.1.1' : '.'));
const fixture = (name, updatedAt) => ({
  format: 'litchi-save', version: 1, updatedAt,
  storage: { 'szu-litchi-driver': JSON.stringify({ name }) }, friends: [],
});
const temp = await mkdtemp(join(tmpdir(), 'forzero-save-check-'));
class Response extends Writable {
  chunks = [];
  writeHead(status) { this.status = status; return this; }
  _write(chunk, _encoding, callback) { this.chunks.push(chunk); callback(); }
}
async function requestSave(createAppShell, saveDir, previousSaveFile, method = 'GET', body) {
  const shell = createAppShell({ page: Buffer.from('test'), saveDir, previousSaveFile, bootTimeoutMs: 0 });
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  Object.assign(req, { method, url: '/app/save', headers: {} });
  const res = new Response();
  try {
    const done = new Promise(resolve => res.once('finish', resolve));
    shell.server.emit('request', req, res);
    await done;
    return { status: res.status, ...JSON.parse(Buffer.concat(res.chunks).toString()) };
  } finally {
    await shell.shutdown();
  }
}
try {
  const oldDir = join(temp, 'forzero-budget-2.1.0', 'save');
  const v200Dir = join(temp, 'forzero-budget-2.0.0', 'save');
  const legacyDir = join(temp, 'forzero-budget-1.9.1.1', 'save');
  const newDir = join(temp, 'forzero-budget-2.1.1');
  await mkdir(oldDir, { recursive: true });
  await mkdir(v200Dir, { recursive: true });
  await mkdir(legacyDir, { recursive: true });
  const backup = join(oldDir, 'player-data.json');
  const expected = fixture('Current QA', '2026-02-01T00:00:00.000Z');
  const v200 = fixture('Previous QA', '2026-01-15T00:00:00.000Z');
  const legacy = fixture('Legacy QA', '2026-01-01T00:00:00.000Z');
  await writeFile(backup, JSON.stringify(expected));
  const v200File = join(v200Dir, 'player-data.json');
  await writeFile(v200File, JSON.stringify(v200));
  const legacyFile = join(legacyDir, 'player-data.json');
  await writeFile(legacyFile, JSON.stringify(legacy));
  await cp(desktop, newDir, { recursive: true, filter: source => source !== join(desktop, 'save') });
  const serverPath = join(newDir, 'server.mjs');
  const serverUrl = pathToFileURL(serverPath).href;
  const source = await readFile(serverPath, 'utf8');
  const expression = source.match(/previousSaveFile\s*=\s*(\[[\s\S]*?\n\s*\]);/)?.[1];
  assert.ok(expression, 'Cannot find candidate server migration list');
  const previous = vm.runInNewContext(expression.replaceAll('import.meta.url', JSON.stringify(serverUrl)), { URL });
  const { createAppShell } = await import(serverUrl);
  const saveDir = join(newDir, 'save');
  const control = await requestSave(createAppShell, saveDir, [pathToFileURL(backup)]);
  assert.deepEqual(control.data, expected, 'The 2.1.0 fixture save must be readable');
  const older = { ...expected, updatedAt: '2020-01-01T00:00:00.000Z', storage: {} };
  const olderDir = join(temp, 'forzero-budget-1.9.1', 'save');
  await mkdir(olderDir, { recursive: true });
  await writeFile(join(olderDir, 'player-data.json'), JSON.stringify(older));
  const actual = await requestSave(createAppShell, saveDir, previous);
  assert.equal(actual.exists, true, '2.1.1 must find the 2.1.0 save when its own save is absent');
  assert.deepEqual(actual.data, expected, 'The migrated save must match the backup');
  assert.equal((await requestSave(createAppShell, saveDir, previous, 'POST', expected)).status, 200);
  const migrated = (await requestSave(createAppShell, saveDir, [])).data;
  assert.deepEqual(migrated.storage, expected.storage);
  assert.deepEqual(migrated.friends, expected.friends ?? []);
  await writeFile(backup, '{damaged');
  assert.deepEqual((await requestSave(createAppShell, saveDir, previous)).data, migrated);
  assert.deepEqual((await requestSave(createAppShell, join(newDir, 'empty-save'), previous)).data, v200);
  await writeFile(v200File, '{damaged');
  assert.deepEqual((await requestSave(createAppShell, join(newDir, 'empty-save'), previous)).data, legacy);
  await writeFile(legacyFile, '{damaged');
  assert.deepEqual((await requestSave(createAppShell, join(newDir, 'empty-save'), previous)).data, older);
  const current = join(saveDir, 'player-data.json');
  await writeFile(current, '{damaged current');
  assert.equal((await requestSave(createAppShell, saveDir, previous, 'POST', expected)).status, 409);
  assert.equal(await readFile(current, 'utf8'), '{damaged current');
  console.log('2.1.0 migration, 2.0.0 and 1.9.1.1 fallbacks, persistence and damaged save protection passed.');
} finally {
  await rm(temp, { recursive: true, force: true });
}
