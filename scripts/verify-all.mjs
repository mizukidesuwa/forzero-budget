import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const args = new Set(process.argv.slice(2));
const fastOnly = args.has('--fast');
const e2eOnly = args.has('--e2e');
const skipBuild = args.has('--skip-build');
const hasLegacyRuntime = fs.existsSync(path.join(ROOT, 'szu-litchi-dev', 'ride-update', 'game.js'));

const FAST_CHECKS = [
  ['hygiene', ['scripts/verify-hygiene.mjs']],
  ['data', ['scripts/verify-data.mjs']],
  ['assets', ['scripts/verify-assets.mjs']],
  ['maps', ['scripts/verify-maps.mjs']],
  ['chase-blind', ['scripts/verify-chase-blind.mjs']],
  ['route-builder-chase', ['scripts/verify-route-builder-chase.mjs']],
  ['save', ['scripts/verify-save.mjs']],
  ['desktop-start', ['scripts/verify-desktop-start.mjs']],
  ['release-staging', ['scripts/verify-release-staging.mjs']],
  ['online', ['server/verify.mjs']],
  ['esm-parity', ['scripts/verify-esm-parity.mjs']],
  ...(hasLegacyRuntime ? [['runtime-parity', ['scripts/verify-runtime-parity.mjs']]] : []),
];

const EXTRA_CHECKS = [
  ['drafting-ai', ['scripts/verify-drafting-ai.mjs']],
  ['deterministic-race', ['scripts/verify-deterministic-race.mjs']],
  ['map-assets-perf', ['scripts/verify-map-assets-perf.mjs']],
];

const E2E_CHECKS = [
  ['browser', ['scripts/verify-browser.mjs']],
  ['four-player', ['scripts/verify-four-player.mjs']],
  ['performance', ['scripts/verify-performance.mjs', '--repeat-maps', '--route', '--memory'], {
    FORZERO_PERF_OUTPUT: path.join(ROOT, 'dist-v2', 'hardware-perf.verify.json'),
  }],
];

function runStep(label, nodeArgs, extraEnv) {
  const started = Date.now();
  const result = spawnSync(process.execPath, nodeArgs, {
    cwd: ROOT,
    stdio: 'inherit',
    ...(extraEnv ? { env: { ...process.env, ...extraEnv } } : {}),
  });
  const elapsed = ((Date.now() - started) / 1000).toFixed(2);
  if (result.status !== 0) {
    console.error(`[FAIL] ${label} (${elapsed}s, exit ${result.status ?? 'null'})`);
    process.exit(result.status ?? 1);
  }
  console.log(`[PASS] ${label} (${elapsed}s)`);
}

const suiteStart = Date.now();
const plan = [];
if (!skipBuild && !e2eOnly) {
  plan.push(['build', ['scripts/build.mjs', ...(fastOnly ? [] : ['--release'])]]);
} else if (!skipBuild && e2eOnly) {
  plan.push(['build-release', ['scripts/build.mjs', '--release']]);
}

if (fastOnly) plan.push(...FAST_CHECKS);
else if (e2eOnly) plan.push(...E2E_CHECKS);
else plan.push(...FAST_CHECKS, ...EXTRA_CHECKS, ...E2E_CHECKS);

for (const [label, nodeArgs, extraEnv] of plan) runStep(label, nodeArgs, extraEnv);
if (!e2eOnly && !hasLegacyRuntime) {
  console.log('[SKIP] runtime-parity (legacy 1.9.1.1 bundle not present in clean repo checkout)');
}

const totalSeconds = ((Date.now() - suiteStart) / 1000).toFixed(2);
console.log(`verify-all passed: ${plan.length} checks in ${totalSeconds}s.`);
