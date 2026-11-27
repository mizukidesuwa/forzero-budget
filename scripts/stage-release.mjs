import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const skipBuild = argv.includes('--skip-build');
const githubMode = argv.includes('--github');
const outIndex = argv.indexOf('--out');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const version = pkg.version;
const defaultOut = githubMode ? `github-upload-${version}` : path.join('dist-v2', 'release', `v${version}`);
const outDir = path.resolve(ROOT, outIndex >= 0 && argv[outIndex + 1] ? argv[outIndex + 1] : defaultOut);

if (!skipBuild) {
  const buildResult = spawnSync(process.execPath, ['scripts/build.mjs', '--release'], {
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
  'route-rules.cjs',
  'tuning-190.cjs',
  'README.md',
  '启动游戏.bat',
  'LICENSE',
];
for (const file of desktopRequired) {
  const fullPath = path.join(ROOT, 'dist-v2', 'desktop', file);
  assert(fs.existsSync(fullPath) && fs.statSync(fullPath).size > 0, `Missing desktop build output: dist-v2/desktop/${file}`);
}

const releaseFiles = [
  `forzero-budget-${version}.zip`,
  `forzero-budget-mobile-${version}.html`,
];
for (const file of releaseFiles) {
  const fullPath = path.join(ROOT, 'dist-v2', file);
  assert(fs.existsSync(fullPath) && fs.statSync(fullPath).size > 0, `Missing release archive: dist-v2/${file}`);
}

function stageReleaseArtifacts(targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  const artifacts = [];
  const checksumLines = [];

  for (const file of releaseFiles) {
    const srcPath = path.join(ROOT, 'dist-v2', file);
    const dstPath = path.join(targetDir, file);
    fs.copyFileSync(srcPath, dstPath);
    const bytes = fs.statSync(dstPath).size;
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(dstPath)).digest('hex');
    artifacts.push({ file, bytes, sha256 });
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
    `- **电脑完整版**：下载 \`forzero-budget-${version}.zip\`，解压后双击 **\`启动游戏.bat\`**（支持本地自动存档与局域网 P2P 好友联机；也可直接用浏览器打开 \`index.html\`）。`,
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

if (!githubMode) {
  const { artifacts } = stageReleaseArtifacts(outDir);
  console.log(`Staged v${version} release artifacts to ${path.relative(ROOT, outDir)}:`);
  for (const item of artifacts) {
    console.log(`  - ${item.file} (${(item.bytes / 1024).toFixed(1)} KB) sha256:${item.sha256.slice(0, 12)}...`);
  }
  process.exit(0);
}

const repoDir = path.join(outDir, 'repo');
const releaseAssetsDir = path.join(outDir, 'release-assets');
fs.rmSync(outDir, { recursive: true, force: true });
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
  assert(!/^(?:save|node_modules|dist-v2|legacy|szu-litchi-dev|szu-litchi-loop|\.openai)(?:[\\/]|$)/.test(rel), `Forbidden entry in repo/: ${rel}`);
  if (!entry.isDirectory()) {
    assert(!entry.name.endsWith('.zip') && !/^forzero-budget-mobile-.*\.html$/.test(entry.name), `Built archive unexpectedly inside repo/: ${rel}`);
    assert(entry.name !== 'player-data.json' && entry.name !== 'forzero-shunde2-fork.zip', `Excluded file in repo/: ${rel}`);
  }
});

const hygiene = spawnSync(process.execPath, ['scripts/verify-hygiene.mjs'], {
  cwd: repoDir,
  stdio: 'inherit',
});
if (hygiene.status !== 0) process.exit(hygiene.status ?? 1);

const { artifacts } = stageReleaseArtifacts(releaseAssetsDir);
const assetStats = artifacts.reduce((acc, item) => ({ files: acc.files + 1, bytes: acc.bytes + item.bytes }), { files: 3, bytes: 0 });
for (const meta of ['SHA256SUMS.txt', 'MANIFEST.json', 'RELEASE-NOTES.md']) {
  assetStats.bytes += fs.statSync(path.join(releaseAssetsDir, meta)).size;
}

console.log(`Staged v${version} split GitHub upload package to ${path.relative(ROOT, outDir)}:`);
console.log(`  - repo/: ${repoStats.files} files (${(repoStats.bytes / 1048576).toFixed(2)} MB)`);
console.log(`  - release-assets/: ${assetStats.files} files (${(assetStats.bytes / 1048576).toFixed(2)} MB)`);
for (const item of artifacts) {
  console.log(`    * ${item.file} (${(item.bytes / 1024).toFixed(1)} KB) sha256:${item.sha256.slice(0, 12)}...`);
}
