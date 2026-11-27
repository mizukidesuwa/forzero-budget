import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import { buildManifestName, describeBuildFile } from './build-manifest.mjs';
import { writeDeterministicZip } from './deterministic-zip.mjs';

export const VERSION = '2.5.5';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const srcDir = join(root, 'src');
const onlineDir = join(root, 'server');

const args = new Set(process.argv.slice(2));
const release = args.has('--release');
const bundleNode = args.has('--bundle-node');
const minify = release || args.has('--minify');
const outArg = process.argv.find((a) => a.startsWith('--out='));
const outBase = resolve(root, outArg ? outArg.slice('--out='.length) : 'dist-v2');
const desktopDir = join(outBase, 'desktop');
const soundDir = join(desktopDir, 'sound');
const mobileFile = join(outBase, release ? `forzero-budget-mobile-${VERSION}.html` : 'forzero-budget-mobile.html');

const entryJs = join(srcDir, 'entry.js');
const manifestFile = join(outBase, buildManifestName);
mkdirSync(outBase, { recursive:true });
writeFileSync(manifestFile, JSON.stringify({ version:VERSION, kind:'incomplete' }));

function portableNodeInputs() {
  const nodeExe = process.env.FORZERO_NODE_EXE || (process.platform === 'win32' && process.arch === 'x64' ? process.execPath : '');
  if (!nodeExe || !existsSync(nodeExe)) {
    throw new Error('Cannot bundle Windows x64 Node.js runtime: run on win32 x64 or set FORZERO_NODE_EXE');
  }
  const licensePath = process.env.FORZERO_NODE_LICENSE || join(dirname(nodeExe), 'LICENSE');
  if (!existsSync(licensePath)) {
    throw new Error(`Missing Node.js LICENSE: ${licensePath}. Use the LICENSE from the same official Windows x64 archive as node.exe.`);
  }
  const license = readFileSync(licensePath);
  const text = license.toString('utf8');
  if (text.length < 100_000 || !text.startsWith('Node.js is licensed for use as follows:') ||
      !text.includes('The externally maintained libraries used by Node.js are:')) {
    throw new Error(`Expected the complete Node.js LICENSE, including third-party notices: ${licensePath}`);
  }
  return { nodeExe, license };
}

const portableNode = release && bundleNode ? portableNodeInputs() : null;
const t0 = performance.now();
const packageVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
if (packageVersion !== VERSION) throw new Error('package.json and build version differ');
if (esbuild.version !== '0.28.2') throw new Error(`Expected esbuild 0.28.2, found ${esbuild.version}`);

// 1. Bundle client ESM entry via esbuild
const jsResult = await esbuild.build({
  entryPoints: [entryJs],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  write: false,
  minify,
  metafile: true,
});
const gameJs = jsResult.outputFiles[0].text;

// 2. Bundle CSS via esbuild
const cssResult = await esbuild.build({
  entryPoints: [join(srcDir, 'styles/main.css')],
  bundle: true,
  write: false,
  minify,
});
const styleCss = cssResult.outputFiles[0].text;

// 3. Assemble HTML (desktop split & mobile standalone)
const htmlTpl = readFileSync(join(srcDir, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
if (htmlTpl.split(VERSION).length !== 3) throw new Error('Unexpected version markers in src/index.html');
const desktopHtml = htmlTpl
  .replace('<!-- @style -->', () => '<link rel="stylesheet" href="style.css">')
  .replace('<!-- @script -->', () => '<script src="game.js"></script>');

const mobileHtml = htmlTpl
  .replace('<!-- @style -->', () => `<style>\n${styleCss.trimEnd()}\n</style>`)
  .replace('<!-- @script -->', () => `<script>\n${gameJs.trimEnd()}\n</script>`);

// 4. Write outputs
mkdirSync(desktopDir, { recursive: true });
mkdirSync(soundDir, { recursive: true });

writeFileSync(join(desktopDir, 'index.html'), desktopHtml, 'utf8');
writeFileSync(join(desktopDir, 'style.css'), styleCss, 'utf8');
writeFileSync(join(desktopDir, 'game.js'), gameJs, 'utf8');

const serverCopies = [
  ['server.mjs', 'server.mjs', '\n'],
  ['room-rules.cjs', 'room-rules.cjs', '\n'],
  ['route-rules.cjs', 'route-rules.cjs', '\n'],
  ['README.md', 'README.md', '\n'],
  ['start-game.bat', '启动游戏.bat', '\r\n'],
];
for (const [srcName, dstName, eol] of serverCopies) {
  const txt = readFileSync(join(onlineDir, srcName), 'utf8').replace(/\r\n/g, '\n');
  if (srcName === 'README.md' && txt.split(VERSION).length !== 4) throw new Error('Unexpected version markers in online/README.md');
  writeFileSync(join(desktopDir, dstName), eol === '\r\n' ? txt.replace(/\n/g, '\r\n') : txt, 'utf8');
}
writeFileSync(join(desktopDir, 'tuning-190.cjs'), readFileSync(join(srcDir, 'data', 'tuning-190.cjs'), 'utf8').replace(/\r\n/g, '\n'), 'utf8');
writeFileSync(join(desktopDir, 'shared-rules.cjs'), readFileSync(join(srcDir, 'data', 'shared-rules.cjs'), 'utf8').replace(/\r\n/g, '\n'), 'utf8');
const soundReadme = readFileSync(join(onlineDir, 'sound-readme.txt'), 'utf8').replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
writeFileSync(join(soundDir, 'README.txt'), soundReadme, 'utf8');

writeFileSync(mobileFile, mobileHtml, 'utf8');

const mobile = describeBuildFile(outBase,basename(mobileFile));
const artifacts = [];
if (release) {
  writeFileSync(join(desktopDir, 'LICENSE'), readFileSync(join(root, 'LICENSE'), 'utf8').replace(/\r\n/g, '\n'));
  const zipFile = join(outBase, `forzero-budget-${VERSION}.zip`);
  const entries = ['index.html', 'style.css', 'game.js', 'tuning-190.cjs', 'shared-rules.cjs', 'LICENSE',
    'sound/README.txt', ...serverCopies.map(([, dstName]) => dstName)];
  writeDeterministicZip(zipFile, desktopDir, entries);
  const desktop = describeBuildFile(outBase,basename(zipFile));
  artifacts.push(desktop,mobile);
  console.log(`  desktop ZIP:        ${desktop.bytes} bytes`);
  if (portableNode) {
    const winZipFile = join(outBase, `forzero-budget-windows-x64-${VERSION}.zip`);
    writeDeterministicZip(winZipFile, desktopDir, [
      ...entries,
      { name: 'runtime/node.exe', source: portableNode.nodeExe },
      { name: 'runtime/NODE-LICENSE.txt', data: portableNode.license },
    ]);
    const windows = describeBuildFile(outBase,basename(winZipFile));
    artifacts.unshift(windows);
    console.log(`  windows portable:   ${windows.bytes} bytes`);
  }
}
writeFileSync(manifestFile, `${JSON.stringify({version:VERSION,kind:release?'release':'development',mobile,artifacts},null,2)}\n`);

const elapsedMs = Math.round(performance.now() - t0);
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 12);

console.log(`Built ESM outputs (${minify ? 'minified' : 'standard'}) in ${elapsedMs} ms -> ${outBase}`);
console.log(`  desktop/index.html: ${Buffer.byteLength(desktopHtml)} bytes (${sha(desktopHtml)})`);
console.log(`  desktop/style.css:  ${Buffer.byteLength(styleCss)} bytes (${sha(styleCss)})`);
console.log(`  desktop/game.js:    ${Buffer.byteLength(gameJs)} bytes (${sha(gameJs)})`);
console.log(`  mobile.html:        ${Buffer.byteLength(mobileHtml)} bytes (${sha(mobileHtml)})`);
const topInputs = Object.entries(jsResult.metafile?.inputs ?? {})
  .sort((a, b) => b[1].bytes - a[1].bytes)
  .slice(0, 6);
if (topInputs.length) {
  console.log('  top source inputs:  ' + topInputs.map(([file, info]) => `${file.replace(/^src[\\/]/, '')} (${(info.bytes / 1024).toFixed(1)} KB)`).join(', '));
}
