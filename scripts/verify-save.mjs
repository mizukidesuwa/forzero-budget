import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const desktop = resolve(process.env.FORZERO_RELEASE_DIR ??
  (existsSync('dist-v2/desktop/index.html') ? 'dist-v2/desktop' : '.'));
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
  const previousDir = join(temp, 'forzero-budget-2.3.1', 'save');
  const v232Dir = join(temp, 'forzero-budget-2.3.2', 'save');
  const v233Dir = join(temp, 'forzero-budget-2.3.3', 'save');
  const v2331Dir = join(temp, 'forzero-budget-2.3.3.1', 'save');
  const v234Dir = join(temp, 'forzero-budget-2.3.4', 'save');
  const latestDir = join(temp, 'forzero-budget-2.4.0', 'save');
  const v250Dir = join(temp, 'forzero-budget-2.5.0', 'save');
  const v251Dir = join(temp, 'forzero-budget-2.5.1', 'save');
  const newDir = join(temp, 'forzero-budget-2.5.1.1');
  await mkdir(previousDir, { recursive: true });
  await mkdir(v232Dir, { recursive: true });
  await mkdir(v233Dir, { recursive: true });
  await mkdir(v2331Dir, { recursive: true });
  await mkdir(v234Dir, { recursive: true });
  await mkdir(latestDir, { recursive: true });
  await mkdir(v250Dir, { recursive: true });
  await mkdir(v251Dir, { recursive: true });
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
  assert.equal(actual.exists, true, '2.5.0 must find the 2.1.0 save when newer saves are absent');
  assert.deepEqual(actual.data, expected, 'The migrated save must match the backup');
  const prior = fixture('2.3.1 QA', '2026-11-20T00:00:00.000Z');
  const priorFile = join(previousDir, 'player-data.json');
  await writeFile(priorFile, JSON.stringify(prior));
  assert.deepEqual((await requestSave(createAppShell, saveDir, previous)).data, prior);
  const v232 = fixture('2.3.2 QA', '2026-11-26T00:00:00.000Z');
  const v232File = join(v232Dir, 'player-data.json');
  await writeFile(v232File, JSON.stringify(v232));
  assert.deepEqual((await requestSave(createAppShell, saveDir, previous)).data, v232);
  const v233 = fixture('2.3.3 QA', '2026-11-26T12:00:00.000Z');
  const v233File = join(v233Dir, 'player-data.json');
  await writeFile(v233File, JSON.stringify(v233));
  assert.deepEqual((await requestSave(createAppShell, saveDir, previous)).data, v233);
  const v2331 = fixture('2.3.3.1 QA', '2026-11-26T13:00:00.000Z');
  const v2331File = join(v2331Dir, 'player-data.json');
  await writeFile(v2331File, JSON.stringify(v2331));
  assert.deepEqual((await requestSave(createAppShell, saveDir, previous)).data, v2331);
  const v234 = fixture('2.3.4 QA', '2026-11-26T14:00:00.000Z');
  const v234File = join(v234Dir, 'player-data.json');
  await writeFile(v234File, JSON.stringify(v234));
  assert.deepEqual((await requestSave(createAppShell, saveDir, previous)).data, v234);
  const latest = fixture('2.4.0 QA', '2026-11-26T18:00:00.000Z');
  const latestFile = join(latestDir, 'player-data.json');
  await writeFile(latestFile, JSON.stringify(latest));
  assert.deepEqual((await requestSave(createAppShell, saveDir, previous)).data, latest);
  const v250 = fixture('2.5.0 QA', '2026-11-26T22:00:00.000Z');
  const v250File = join(v250Dir, 'player-data.json');
  await writeFile(v250File, JSON.stringify(v250));
  assert.deepEqual((await requestSave(createAppShell, saveDir, previous)).data, v250);
  const v251 = fixture('2.5.1 QA', '2026-11-27T08:00:00.000Z');
  const v251File = join(v251Dir, 'player-data.json');
  await writeFile(v251File, JSON.stringify(v251));
  assert.deepEqual((await requestSave(createAppShell, saveDir, previous)).data, v251);
  assert.equal((await requestSave(createAppShell, saveDir, previous, 'POST', v251)).status, 200);
  const migrated = (await requestSave(createAppShell, saveDir, [])).data;
  assert.deepEqual(migrated.storage, v251.storage);
  assert.deepEqual(migrated.friends, v251.friends ?? []);
  assert.deepEqual(JSON.parse(await readFile(v251File, 'utf8')), v251);
  assert.deepEqual(JSON.parse(await readFile(v250File, 'utf8')), v250);
  assert.deepEqual(JSON.parse(await readFile(latestFile, 'utf8')), latest);
  assert.deepEqual(JSON.parse(await readFile(v234File, 'utf8')), v234);
  assert.deepEqual(JSON.parse(await readFile(v2331File, 'utf8')), v2331);
  assert.deepEqual(JSON.parse(await readFile(v233File, 'utf8')), v233);
  assert.deepEqual(JSON.parse(await readFile(v232File, 'utf8')), v232);
  assert.deepEqual(JSON.parse(await readFile(priorFile, 'utf8')), prior);
  await rm(v251File);
  await rm(v250File);
  await rm(latestFile);
  await rm(v234File);
  await rm(v2331File);
  await rm(v233File);
  await rm(v232File);
  await rm(priorFile);
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
  console.log('2.4.0, 2.3.4, 2.3.3.1, 2.3.3, 2.3.2, 2.3.1 and 2.1.0 migration, earlier fallbacks and damaged save protection passed.');
} finally {
  await rm(temp, { recursive: true, force: true });
}
