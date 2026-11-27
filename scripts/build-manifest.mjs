import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const buildManifestName = 'build-manifest.json';

export function describeBuildFile(directory, file) {
  const content = readFileSync(join(directory, file));
  return { file, bytes:content.length, sha256:createHash('sha256').update(content).digest('hex') };
}

export function readBuildManifest(directory, version) {
  const manifest = JSON.parse(readFileSync(join(directory, buildManifestName), 'utf8'));
  assert(manifest.version===version && ['development','release'].includes(manifest.kind),
    'Expected a completed build manifest for the current version. Run the build again.');
  const mobileName = manifest.kind==='release' ? `forzero-budget-mobile-${version}.html` : 'forzero-budget-mobile.html';
  assert.equal(manifest.mobile?.file,mobileName,'Unexpected mobile build path');
  return manifest;
}

export function checkBuildFile(directory, entry) {
  const actual = describeBuildFile(directory,entry.file);
  assert(actual.bytes>0 && actual.bytes===entry.bytes && actual.sha256===entry.sha256,
    `Build file does not match its manifest: ${entry.file}`);
  return actual;
}
