import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);

function walkFiles(dir, extensions, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(fullPath, extensions, out);
    else if (extensions.some(ext => entry.name.endsWith(ext))) out.push(fullPath);
  }
  return out;
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const version = pkg.version;
const buildSource = fs.readFileSync(path.join(ROOT, 'scripts', 'build.mjs'), 'utf8');
const buildVersionMatch = buildSource.match(/const VERSION = '([^']+)';/);
assert(buildVersionMatch && buildVersionMatch[1] === version, `scripts/build.mjs VERSION mismatch (${buildVersionMatch?.[1]} !== ${version})`);

const indexHtml = fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8');
assert(indexHtml.split(version).length >= 3, `src/index.html missing ${version} version markers`);

const onlineReadme = fs.readFileSync(path.join(ROOT, 'server', 'README.md'), 'utf8');
assert(onlineReadme.split(version).length >= 3, `server/README.md missing ${version} version markers`);

const srcShared = require(path.join(ROOT, 'src', 'data', 'shared-rules.cjs'));
const onlineShared = require(path.join(ROOT, 'server', 'shared-rules.cjs'));
assert.deepEqual(onlineShared, srcShared, 'server/shared-rules.cjs must match src/data/shared-rules.cjs');

const srcTuning = require(path.join(ROOT, 'src', 'data', 'tuning-190.cjs'));
const onlineTuning = require(path.join(ROOT, 'server', 'tuning-190.cjs'));
assert.deepEqual(onlineTuning, srcTuning, 'server/tuning-190.cjs must match src/data/tuning-190.cjs');

for (const rel of ['src/data/modes.js', 'src/data/routes.js', 'src/data/rider-skins.js']) {
  const source = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  assert(source.includes('./shared-rules.cjs'), `${rel} must import ./shared-rules.cjs`);
}
for (const rel of ['server/room-rules.cjs', 'server/route-rules.cjs', 'server/server.mjs']) {
  const source = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  assert(source.includes('./shared-rules.cjs'), `${rel} must require ./shared-rules.cjs`);
}

const eslintConfigPath = path.join(ROOT, 'eslint.config.mjs');
assert(fs.existsSync(eslintConfigPath), 'Missing eslint.config.mjs');
const eslintConfig = fs.readFileSync(eslintConfigPath, 'utf8');
assert(eslintConfig.includes("'no-undef'"), 'eslint.config.mjs must enforce no-undef');

const jsconfigPath = path.join(ROOT, 'jsconfig.json');
assert(fs.existsSync(jsconfigPath), 'Missing jsconfig.json');
const jsconfig = JSON.parse(fs.readFileSync(jsconfigPath, 'utf8'));
assert.equal(jsconfig.compilerOptions?.checkJs, false, 'jsconfig.json must keep compilerOptions.checkJs === false for progressive @ts-check');
assert(typeof pkg.scripts?.typecheck === 'string' && pkg.scripts.typecheck.includes('tsc -p jsconfig.json --noEmit'),
  'package.json must define scripts.typecheck using tsc -p jsconfig.json --noEmit');

const appSource = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'app.js'), 'utf8');
const appLineCount = appSource.split(/\r?\n/).length;
assert(appLineCount <= 1700, `src/ui/app.js exceeded 1700 lines (${appLineCount})`);

const entrySource = fs.readFileSync(path.join(ROOT, 'src', 'entry.js'), 'utf8');
assert(!/Object\.assign\s*\(\s*globalThis\b/.test(entrySource) && !/Object\.defineProperty\s*\(\s*globalThis\b/.test(entrySource),
  'src/entry.js must not write directly to globalThis; use src/debug-bridge.js');

const assetFiles = walkFiles(path.join(ROOT, 'src', 'world', 'assets'), ['.js']);
for (const file of assetFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);
  assert(!/\b(window|document)\./.test(source), `${rel} must not access DOM/window`);
  assert(!/\bworldState\b/.test(source), `${rel} must not read global worldState`);
  assert(!/Math\.random\s*\(/.test(source), `${rel} must not call Math.random()`);
}

const runtimeFiles = [
  ...walkFiles(path.join(ROOT, 'src'), ['.js']),
  ...walkFiles(path.join(ROOT, 'server'), ['.mjs', '.cjs']),
];
for (const file of runtimeFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);
  for (const match of source.matchAll(/(?:^|\n)\s*import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g)) {
    const spec = match[1];
    assert(spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('node:'), `${rel} has non-local import "${spec}"`);
  }
  for (const match of source.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const spec = match[1];
    assert(spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('node:'), `${rel} has non-local require "${spec}"`);
  }
}

const englishText = fs.readFileSync(path.join(ROOT, 'src', 'data', 'english-text.js'), 'utf8');
const INTENTIONAL_UNTRANSLATED = new Set(['简体中文', '有限竞速：地贫线']);
const missingLabels = [];
for (const match of indexHtml.matchAll(/<(?:button|option|h[23]|label|th|small)[^>]*>([^<]+)</g)) {
  const label = match[1].trim();
  if (!/[\u4e00-\u9fff]/.test(label) || INTENTIONAL_UNTRANSLATED.has(label)) continue;
  if (!englishText.includes(label)) missingLabels.push(label);
}
assert.equal(missingLabels.length, 0, `Missing English translations for src/index.html labels: ${[...new Set(missingLabels)].join(', ')}`);

const pagesWorkflowPath = path.join(ROOT, '.github', 'workflows', 'pages.yml');
assert(fs.existsSync(pagesWorkflowPath), 'Missing .github/workflows/pages.yml');
const pagesWorkflow = fs.readFileSync(pagesWorkflowPath, 'utf8');
for (const token of ['npm run verify:hygiene', 'npm run build', 'dist-v2/desktop/index.html', 'dist-v2/desktop/style.css', 'dist-v2/desktop/game.js']) {
  assert(pagesWorkflow.includes(token), `.github/workflows/pages.yml missing "${token}"`);
}

const releaseWorkflowPath = path.join(ROOT, '.github', 'workflows', 'release.yml');
assert(fs.existsSync(releaseWorkflowPath), 'Missing .github/workflows/release.yml');
const releaseWorkflow = fs.readFileSync(releaseWorkflowPath, 'utf8');
for (const token of ['npm run build:release', 'npm run verify:fast', 'npm run release:stage']) {
  assert(releaseWorkflow.includes(token), `.github/workflows/release.yml missing "${token}"`);
}

const ciWorkflowPath = path.join(ROOT, '.github', 'workflows', 'ci.yml');
assert(fs.existsSync(ciWorkflowPath), 'Missing .github/workflows/ci.yml');
const ciWorkflow = fs.readFileSync(ciWorkflowPath, 'utf8');
for (const token of ['windows-latest', 'npm run lint', 'npm run typecheck', 'npm run build', 'npm test -- --skip-build', 'verify-drafting-ai.mjs', 'verify-deterministic-race.mjs', 'verify:map-assets-perf', 'verify-browser.mjs']) {
  assert(ciWorkflow.includes(token), `.github/workflows/ci.yml missing "${token}"`);
}

console.log(`verify-hygiene passed: v${version}, app.js ${appLineCount} lines, ${assetFiles.length} asset modules, ${runtimeFiles.length} runtime files, 0 untranslated UI labels.`);
