import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { checkBuildFile, readBuildManifest } from './build-manifest.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const skipBuild = argv.includes('--skip-build');
const githubMode = argv.includes('--github');
const outIndex = argv.indexOf('--out');
if (outIndex >= 0 && (!argv[outIndex + 1] || argv[outIndex + 1].startsWith('--'))) {
  throw new Error('--out requires a directory path');
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const version = pkg.version;
const defaultOut = githubMode ? `github-upload-${version}` : path.join('dist-v2', 'release', `v${version}`);
const outDir = path.resolve(ROOT, outIndex >= 0 ? argv[outIndex + 1] : defaultOut);
const manifestPath = 'release-assets/MANIFEST.json';
const githubOut = githubMode ? checkedGitHubOutput(outDir) : null;
const buildDir = path.join(ROOT,'dist-v2');

if (!skipBuild) {
  const buildResult = spawnSync(process.execPath, ['scripts/build.mjs', '--release', ...argv.filter(arg=>arg==='--bundle-node')], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (buildResult.status !== 0) process.exit(buildResult.status ?? 1);
}

const desktopRequired = [
  'index.html',
  'style.css',
  'game.js',
  'server.mjs',
  'shared-rules.cjs',
  'room-rules.cjs',
  'district-chase.cjs',
  'route-rules.cjs',
  'tuning-190.cjs',
  'README.md',
  '启动游戏.bat',
  'LICENSE',
];
for (const file of desktopRequired) {
  const fullPath = path.join(buildDir, 'desktop', file);
  assert(fs.existsSync(fullPath) && fs.statSync(fullPath).size > 0, `Missing desktop build output: dist-v2/desktop/${file}`);
}

const requiredReleaseFiles = [
  `forzero-budget-${version}.zip`,
  `forzero-budget-mobile-${version}.html`,
];
const winZipFile = `forzero-budget-windows-x64-${version}.zip`;
const build = readBuildManifest(buildDir,version);
assert.equal(build.kind,'release','Staging requires a completed release build.');
const releaseFiles = build.artifacts.map(entry=>entry.file);
const allowedReleaseFiles = releaseFiles.includes(winZipFile) ? [...requiredReleaseFiles,winZipFile] : requiredReleaseFiles;
assert.deepEqual([...releaseFiles].sort(),[...allowedReleaseFiles].sort(),'Unexpected files in the release build manifest.');
for (const entry of build.artifacts) checkBuildFile(buildDir,entry);

function findPreviouslyStagedPortable(targetDir) {
  const file = path.join(targetDir,winZipFile);
  if (releaseFiles.includes(winZipFile) || !fs.existsSync(file)) return;
  const prior = JSON.parse(fs.readFileSync(path.join(targetDir,'MANIFEST.json'),'utf8'));
  const listed = prior.artifacts?.find(entry=>entry.file===winZipFile);
  assert(prior.name===pkg.name && prior.version===version && listed && fs.lstatSync(file).isFile(),
    `Unrecognized portable archive in the staging directory: ${file}`);
  checkBuildFile(targetDir,listed);
  return file;
}

function stageReleaseArtifacts(targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  const artifacts = [];
  const checksumLines = [];
  const obsoletePortable = findPreviouslyStagedPortable(targetDir);

  for (const entry of build.artifacts) {
    const { file } = entry;
    const srcPath = path.join(buildDir, file);
    const dstPath = path.join(targetDir, file);
    fs.copyFileSync(srcPath, dstPath);
    const { bytes, sha256 } = checkBuildFile(targetDir,entry);
    artifacts.push({file,bytes,sha256});
    checksumLines.push(`${sha256} *${file}`);
  }

  fs.writeFileSync(path.join(targetDir, 'SHA256SUMS.txt'), `${checksumLines.join('\n')}\n`);
  const manifest = {
    name: pkg.name,
    version,
    stagedAt: new Date().toISOString(),
    desktopEntries: desktopRequired.length,
    artifacts,
  };
  fs.writeFileSync(path.join(targetDir, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(targetDir, 'RELEASE-NOTES.md'), buildReleaseNotes(checksumLines));
  if (obsoletePortable) fs.unlinkSync(obsoletePortable);
  return { artifacts, checksumLines };
}

function copyFilteredTree(srcDir, dstDir, stats = { files: 0, bytes: 0 }) {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const name = entry.name;
    if (entry.isDirectory()) {
      if (name === '__pycache__' || name === 'save' || name === '.openai' ||
          name === 'isolated-chrome' || name === 'library-transfer' || name.startsWith('chrome-')) {
        continue;
      }
      copyFilteredTree(path.join(srcDir, name), path.join(dstDir, name), stats);
      continue;
    }
    if (name === 'player-data.json' || /\.(tmp|log|pyc)$/i.test(name)) continue;
    assert(entry.isFile(), `Cannot export a non-regular source file: ${path.join(srcDir, name)}`);
    const srcPath = path.join(srcDir, name);
    const dstPath = path.join(dstDir, name);
    fs.mkdirSync(path.dirname(dstPath), { recursive: true });
    fs.copyFileSync(srcPath, dstPath);
    stats.files += 1;
    stats.bytes += fs.statSync(dstPath).size;
  }
  return stats;
}

function buildReleaseNotes(checksumLines) {
  const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8').replace(/\r\n/g, '\n');
  const lines = changelog.split('\n');
  const start = lines.findIndex(line => line === `## ${version}` || line.startsWith(`## ${version} `));
  let changesBlock = `- See CHANGELOG.md for v${version} details.`;
  if (start >= 0) {
    const rest = lines.slice(start + 1);
    const end = rest.findIndex(line => line.startsWith('## '));
    const slice = (end >= 0 ? rest.slice(0, end) : rest).join('\n').trim();
    if (slice) changesBlock = slice;
  }
  return [
    `# FORZERO: BUDGET · 有限竞速：地贫线 v${version}`,
    '',
    '## 玩家下载说明',
    '',
    ...(releaseFiles.includes(winZipFile)
      ? [`- **Windows 免安装完整版（推荐，内置 Node.js，无需另装运行环境）**：下载 \`${winZipFile}\`，完整解压后双击 **\`启动游戏.bat\`** 即可本地自动存档与建房联机。`]
      : []),
    `- **桌面轻量版（需自备 Node.js 22+）**：下载 \`forzero-budget-${version}.zip\`，解压后双击 **\`启动游戏.bat\`**（支持本地自动存档与局域网 P2P 好友联机；也可直接用浏览器打开 \`index.html\`）。`,
    `- **手机离线单文件版**：下载 \`forzero-budget-mobile-${version}.html\`，直接用手机浏览器打开即可离线游玩。`,
    '',
    `## v${version} 主要更新`,
    '',
    changesBlock,
    '',
    '## 文件校验（SHA-256）',
    '',
    '```text',
    ...checksumLines,
    '```',
    '',
  ].join('\n');
}

function walkCheck(dir, checkFn) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    checkFn(entry, full);
    if (entry.isDirectory()) walkCheck(full, checkFn);
  }
}

function stripLocalOnlySections(text) {
  return `${text.replace(/\r?\n?<!-- LOCAL-ONLY-START -->[\s\S]*?<!-- LOCAL-ONLY-END -->\r?\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

function lstatIfPresent(file) {
  return fs.lstatSync(file, { throwIfNoEntry: false });
}

function resolveExistingAncestors(directory) {
  if (lstatIfPresent(directory)) return fs.realpathSync(directory);
  return path.join(resolveExistingAncestors(path.dirname(directory)), path.basename(directory));
}

function exportContents(dir) {
  const contents = [];
  walkCheck(dir, (entry, full) => {
    const rel = path.relative(dir, full).split(path.sep).join('/');
    assert(entry.isDirectory() || entry.isFile(), `Non-regular GitHub export entry: ${rel}`);
    if (rel === manifestPath) return;
    const digest = entry.isDirectory() ? null : crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    contents.push([rel, digest]);
  });
  return contents.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

function checkExistingExport(directory) {
  const stat = lstatIfPresent(directory);
  if (!stat) return false;
  const error = `Refusing to replace an unrecognized or modified GitHub export: ${directory}`;
  assert(stat.isDirectory() && !stat.isSymbolicLink(), error);
  assert.deepEqual(fs.readdirSync(directory).sort(), ['release-assets', 'repo'], error);
  const assets = lstatIfPresent(path.join(directory, 'release-assets'));
  assert(assets?.isDirectory() && lstatIfPresent(path.join(directory, manifestPath))?.isFile(), error);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, manifestPath), 'utf8'));
  assert(manifest.name === pkg.name && manifest.githubExport?.version === 1 &&
    JSON.stringify(manifest.githubExport.contents) === JSON.stringify(exportContents(directory)), error);
  return true;
}

function checkedGitHubOutput(directory) {
  const parent = resolveExistingAncestors(path.dirname(directory));
  const target = path.join(parent, path.basename(directory));
  const source = fs.realpathSync(ROOT);
  const toSource = path.relative(target, source);
  const fromSource = path.relative(source, target);
  const first = fromSource.split(path.sep)[0].toLowerCase();
  assert(toSource && (path.isAbsolute(toSource) || toSource.split(path.sep)[0] === '..') &&
    !['src', 'scripts', 'server', '.github', '.git', 'save', 'node_modules', 'legacy'].includes(first),
    `Unsafe GitHub export directory: ${directory}`);
  checkExistingExport(target);
  return target;
}

if (!githubMode) {
  const { artifacts } = stageReleaseArtifacts(outDir);
  console.log(`Staged v${version} release artifacts to ${path.relative(ROOT, outDir)}:`);
  for (const item of artifacts) {
    console.log(`  - ${item.file} (${(item.bytes / 1024).toFixed(1)} KB) sha256:${item.sha256.slice(0, 12)}...`);
  }
  process.exit(0);
}

function verifyExportedRepo(repoDir, validationDir) {
  const hygiene = spawnSync(process.execPath, ['scripts/verify-hygiene.mjs'], { cwd: repoDir, stdio: 'inherit' });
  assert(hygiene.status === 0, 'Exported repository failed the hygiene check');

  // Build and test an exact copy. Installed dependencies and test outputs stay in the temporary export area.
  const testRepo = path.join(validationDir, 'repo');
  fs.mkdirSync(validationDir);
  fs.cpSync(repoDir, testRepo, { recursive: true });
  const env = { ...process.env, FORZERO_RELEASE_DIR:path.join(testRepo, 'dist-v2', 'desktop') };
  const npmCli = process.env.npm_execpath;
  const runNpm = args => npmCli
    ? spawnSync(process.execPath, [npmCli, ...args], { cwd: testRepo, env, stdio: 'inherit' })
    : spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
      cwd: testRepo, env, stdio: 'inherit', shell: process.platform === 'win32',
    });
  assert(runNpm(['ci', '--include=dev', '--no-audit', '--no-fund']).status === 0,
    'Could not install dependencies in the exported repository');
  assert(runNpm(['test']).status === 0, 'Exported repository failed npm test');
}

function buildGitHubExport(candidate) {
  const repoDir = path.join(candidate, 'repo');
  const releaseAssetsDir = path.join(candidate, 'release-assets');
  fs.mkdirSync(repoDir, { recursive: true });

  const rootFiles = [
    '.editorconfig',
    '.gitattributes',
    '.gitignore',
    'AGENTS.md',
    'CHANGELOG.md',
    'CONTRIBUTING.md',
    'FORZERO-ROUTE-SKIN-DESIGN.md',
    'FORZERO-WORK-GUIDE.md',
    'HISTORY.md',
    'LICENSE',
    'README.md',
    'SECURITY.md',
    'eslint.config.mjs',
    'jsconfig.json',
    'package.json',
    'package-lock.json',
  ];
  const repoStats = { files: 0, bytes: 0 };
  for (const file of rootFiles) {
    const srcPath = path.join(ROOT, file);
    const dstPath = path.join(repoDir, file);
    assert(fs.existsSync(srcPath), `Missing repository root file: ${file}`);
    if (file === 'AGENTS.md') {
      const sanitized = stripLocalOnlySections(fs.readFileSync(srcPath, 'utf8'));
      assert(!sanitized.includes('LOCAL-ONLY-START') && !sanitized.includes('LOCAL-ONLY-END'), 'Exported AGENTS.md leaked LOCAL-ONLY block');
      fs.writeFileSync(dstPath, sanitized, 'utf8');
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
    repoStats.files += 1;
    repoStats.bytes += fs.statSync(dstPath).size;
  }
  for (const dir of ['src', 'server', 'scripts', '.github']) {
    const dirPath = path.join(ROOT, dir);
    if (fs.existsSync(dirPath)) copyFilteredTree(dirPath, path.join(repoDir, dir), repoStats);
  }

  walkCheck(repoDir, (entry, full) => {
    const rel = path.relative(repoDir, full);
    assert(!/^(?:save|node_modules|dist-v2|legacy|szu-litchi-dev|szu-litchi-loop|runtime|\.openai)(?:[\\/]|$)/.test(rel), `Forbidden entry in repo/: ${rel}`);
    if (!entry.isDirectory()) {
      assert(!/\.(?:zip|exe)$/i.test(entry.name) && !/^forzero-budget-mobile-.*\.html$/.test(entry.name), `Built archive or binary unexpectedly inside repo/: ${rel}`);
      assert(entry.name !== 'player-data.json' && entry.name !== 'forzero-shunde2-fork.zip', `Excluded file in repo/: ${rel}`);
    }
  });

  verifyExportedRepo(repoDir, path.join(path.dirname(candidate), 'validation'));

  const { artifacts } = stageReleaseArtifacts(releaseAssetsDir);
  const file = path.join(candidate, manifestPath);
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  manifest.githubExport = { version: 1, contents: exportContents(candidate) };
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  const assetStats = artifacts.reduce((acc, item) => ({ files: acc.files + 1, bytes: acc.bytes + item.bytes }), { files: 3, bytes: 0 });
  for (const meta of ['SHA256SUMS.txt', 'MANIFEST.json', 'RELEASE-NOTES.md']) {
    assetStats.bytes += fs.statSync(path.join(releaseAssetsDir, meta)).size;
  }
  return { artifacts, repoStats, assetStats };
}

function publishGitHubExport(target) {
  const parent = path.dirname(target);
  fs.mkdirSync(parent, { recursive: true });
  const lock = path.join(parent, `.${path.basename(target)}.forzero-export-lock`);
  fs.mkdirSync(lock);
  let temp, retainPrevious = false;
  try {
    temp = fs.mkdtempSync(path.join(parent, '.forzero-github-'));
    const candidate = path.join(temp, 'candidate');
    const previous = path.join(temp, 'previous');
    const stats = buildGitHubExport(candidate);
    const replacing = checkExistingExport(target);
    if (replacing) fs.renameSync(target, previous);
    try {
      fs.renameSync(candidate, target);
    } catch (error) {
      if (replacing) {
        retainPrevious = true;
        fs.renameSync(previous, target);
        retainPrevious = false;
      }
      throw error;
    }
    return stats;
  } finally {
    try {
      if (temp && !retainPrevious) fs.rmSync(temp, { recursive: true, force: true });
      if (retainPrevious) console.error(`Previous GitHub export retained in ${path.join(temp, 'previous')}`);
    } finally {
      fs.rmdirSync(lock);
    }
  }
}

const { artifacts, repoStats, assetStats } = publishGitHubExport(githubOut);
console.log(`Staged v${version} split GitHub upload package to ${path.relative(ROOT, githubOut)}:`);
console.log(`  - repo/: ${repoStats.files} files (${(repoStats.bytes / 1048576).toFixed(2)} MB)`);
console.log(`  - release-assets/: ${assetStats.files} files (${(assetStats.bytes / 1048576).toFixed(2)} MB)`);
for (const item of artifacts) {
  const sizeLabel = item.bytes >= 1048576 ? `${(item.bytes / 1048576).toFixed(2)} MB` : `${(item.bytes / 1024).toFixed(1)} KB`;
  console.log(`    * ${item.file} (${sizeLabel}) sha256:${item.sha256.slice(0, 12)}...`);
}
