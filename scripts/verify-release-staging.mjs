import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildManifestName, describeBuildFile } from './build-manifest.mjs';

const sandbox = mkdtempSync(join(tmpdir(), 'forzero-release-stage-'));
const root = join(sandbox, 'project');
const output = join(sandbox, 'export');
const version = '0.0.1';
const stageScript = join(root, 'scripts', 'stage-release.mjs');
const hygieneScript = join(root, 'scripts', 'verify-hygiene.mjs');
const manifest = join(output, 'release-assets', 'MANIFEST.json');
const write = (path, text = 'fixture') => writeFileSync(join(root, path), text);
const run = target => spawnSync(process.execPath, [stageScript, '--github', '--skip-build', '--out', target], { encoding: 'utf8' });
const buildDir = join(root,'dist-v2');
const desktopZip = `forzero-budget-${version}.zip`;
const mobileHtml = `forzero-budget-mobile-${version}.html`;
const windowsZip = `forzero-budget-windows-x64-${version}.zip`;
const stage = (target, ...args) => spawnSync(process.execPath,[stageScript,'--out',target,...args],{encoding:'utf8'});

try {
  for (const dir of ['scripts', 'src', 'dist-v2/desktop']) mkdirSync(join(root, dir), { recursive: true });
  copyFileSync(new URL('./stage-release.mjs', import.meta.url), stageScript);
  copyFileSync(new URL('./build-manifest.mjs', import.meta.url), join(root,'scripts','build-manifest.mjs'));
  for (const file of ['.editorconfig', '.gitattributes', '.gitignore', 'AGENTS.md', 'CHANGELOG.md', 'CONTRIBUTING.md',
    'FORZERO-ROUTE-SKIN-DESIGN.md', 'FORZERO-WORK-GUIDE.md', 'HISTORY.md', 'LICENSE', 'README.md', 'SECURITY.md',
    'eslint.config.mjs', 'jsconfig.json']) write(file);
  const metadata = { name: 'forzero-budget', version };
  write('package.json', JSON.stringify({...metadata,scripts:{test:'node scripts/test-export.mjs'}}));
  write('package-lock.json', JSON.stringify({...metadata,lockfileVersion:3,packages:{'':metadata}}));
  write('scripts/test-export.mjs',`import { mkdirSync, writeFileSync } from 'node:fs';\nmkdirSync('dist-v2'); writeFileSync('dist-v2/test-marker','tested');\n`);
  write('src/sentinel.js');
  write('scripts/verify-hygiene.mjs', '');
  for (const file of ['index.html', 'style.css', 'game.js', 'server.mjs', 'shared-rules.cjs', 'room-rules.cjs', 'district-chase.cjs',
    'route-rules.cjs', 'tuning-190.cjs', 'README.md', '启动游戏.bat', 'LICENSE']) write(`dist-v2/desktop/${file}`);
  for (const file of [desktopZip,mobileHtml,windowsZip]) write(`dist-v2/${file}`);
  const retainPortable = join(sandbox,'staged');
  const buildManifest = portable => ({
    version,kind:'release',mobile:describeBuildFile(buildDir,mobileHtml),
    artifacts:(portable?[windowsZip,desktopZip,mobileHtml]:[desktopZip,mobileHtml]).map(file=>describeBuildFile(buildDir,file)),
  });
  write(`dist-v2/${buildManifestName}`,JSON.stringify(buildManifest(true)));
  const portable = stage(retainPortable,'--skip-build');
  assert.equal(portable.status,0,portable.stderr);
  assert.ok(existsSync(join(retainPortable,windowsZip)));
  write('scripts/build.mjs',`import { writeFileSync } from 'node:fs';\nwriteFileSync(new URL('../dist-v2/${buildManifestName}',import.meta.url),${JSON.stringify(JSON.stringify(buildManifest(false)))});\n`);
  const light = stage(retainPortable);
  assert.equal(light.status,0,light.stderr);
  assert.ok(existsSync(join(buildDir,windowsZip)));
  assert.equal(existsSync(join(retainPortable,windowsZip)),false);
  assert.deepEqual(JSON.parse(readFileSync(join(retainPortable,'MANIFEST.json'),'utf8')).artifacts.map(entry=>entry.file),[desktopZip,mobileHtml]);
  write(`dist-v2/${desktopZip}`,'mismatched file');
  const mismatch = stage(join(sandbox,'mismatch'),'--skip-build');
  assert.notEqual(mismatch.status,0);
  assert.match(mismatch.stderr,/does not match its manifest/);
  write(`dist-v2/${desktopZip}`);

  for (const target of [root, sandbox, join(root, 'src', 'new')]) {
    const result = run(target);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unsafe GitHub export directory/);
    assert.equal(readFileSync(join(root, 'src', 'sentinel.js'), 'utf8'), 'fixture');
  }

  const shared = join(sandbox, 'shared');
  mkdirSync(shared);
  writeFileSync(join(shared, 'keep'), 'shared data');
  const sharedResult = run(shared);
  assert.notEqual(sharedResult.status, 0);
  assert.match(sharedResult.stderr, /unrecognized or modified GitHub export/);
  assert.equal(readFileSync(join(shared, 'keep'), 'utf8'), 'shared data');
  const alias = join(sandbox, 'source-alias');
  symlinkSync(join(root, 'src'), alias, 'junction');
  const aliasResult = run(join(alias, 'new'));
  assert.notEqual(aliasResult.status, 0);
  assert.match(aliasResult.stderr, /Unsafe GitHub export directory/);
  assert.equal(existsSync(join(alias, 'new')), false);

  const first = run(output);
  assert.equal(first.status, 0, first.stderr);
  const before = readFileSync(manifest, 'utf8');
  assert.deepEqual(readdirSync(output).sort(), ['release-assets', 'repo']);
  writeFileSync(hygieneScript, 'process.exit(2)');
  const failed = run(output);
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /failed the hygiene check/);
  assert.equal(readFileSync(manifest, 'utf8'), before);

  writeFileSync(hygieneScript, '');
  const exportTest = readFileSync(join(root,'scripts','test-export.mjs'),'utf8');
  write('scripts/test-export.mjs','process.exit(9)');
  const failedTest = run(output);
  assert.notEqual(failedTest.status,0);
  assert.match(failedTest.stderr,/failed npm test/);
  assert.equal(readFileSync(manifest,'utf8'),before);

  write('scripts/test-export.mjs',exportTest);
  write('src/sentinel.js', 'updated fixture');
  const replacement = run(output);
  assert.equal(replacement.status, 0, replacement.stderr);
  assert.equal(readFileSync(join(output, 'repo', 'src', 'sentinel.js'), 'utf8'), 'updated fixture');
  assert.ok(!existsSync(join(output,'repo','dist-v2')));
  assert.ok(!existsSync(join(output,'repo','node_modules')));
  const unrelated = join(output, 'repo', 'notes.txt');
  writeFileSync(unrelated, 'user notes');
  const modified = run(output);
  assert.notEqual(modified.status, 0);
  assert.match(modified.stderr, /unrecognized or modified GitHub export/);
  assert.equal(readFileSync(unrelated, 'utf8'), 'user notes');
  assert.ok(readdirSync(sandbox).every(name => !name.includes('forzero')));
  console.log('GitHub staging rejects unsafe destinations, preserves an old export on failure, and replaces only intact exports.');
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
