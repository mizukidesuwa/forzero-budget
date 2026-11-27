import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { join, resolve } from 'node:path';
import { checkBuildFile, readBuildManifest } from './build-manifest.mjs';

// Temporary mobile-only test server; it does not expose the workspace or saves.
const buildDir = resolve(process.env.FORZERO_BUILD_DIR ?? 'dist-v2');
const override = process.env.FORZERO_MOBILE_HTML;
let file;
if (override) file = resolve(override);
else {
  const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const { mobile } = readBuildManifest(buildDir, version);
  checkBuildFile(buildDir, mobile);
  file = join(buildDir, mobile.file);
}
const html = await readFile(file);
const port = Number(process.env.FORZERO_PHONE_PORT ?? 8799);
const server = createServer((req, res) => {
  if (req.method !== 'GET' || req.url !== '/') { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(html);
});
server.listen(port, '0.0.0.0', () => {
  console.log('Open one of these addresses on the iPhone, using the same Wi-Fi:');
  for (const entries of Object.values(networkInterfaces())) for (const item of entries ?? []) {
    if (item.family === 'IPv4' && !item.internal) console.log(`http://${item.address}:${port}/`);
  }
  console.log('Test page only. Press Ctrl+C to stop.');
});
