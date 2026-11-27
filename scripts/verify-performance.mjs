import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { openTestBrowser } from './browser-runner.mjs';

const args = process.argv.slice(2);
const baselineArg = args.find(arg => arg.startsWith('--baseline='));
const baselineDir = baselineArg?.slice('--baseline='.length) ?? (args.includes('--baseline') ? process.env.FORZERO_BASELINE_DIR : null);
if ((baselineArg || args.includes('--baseline')) && !baselineDir) throw Error('Provide a directory with --baseline=<directory> or FORZERO_BASELINE_DIR');
const { version: currentVersion } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const editions = [
  ...(baselineDir ? [['historical baseline', join(baselineDir, 'index.html')]] : []),
  [currentVersion, join(process.env.FORZERO_RELEASE_DIR ?? 'dist-v2/desktop', 'index.html')],
];
for (const [version, file] of editions) assert.ok(existsSync(file), `${version}: missing browser build at ${resolve(file)}`);
if (process.env.FORZERO_PERF_ORDER === 'reverse') editions.reverse();
const output = [];
const execFileAsync = promisify(execFile);
const measureMemory = args.includes('--memory');
const followRoute = args.includes('--route');
const cycles = args.includes('--repeat-maps') ? 4 : 1;
const mib = 1024 ** 2;
const currentBudget = { hardwareP95Ms: 120, softwareP95Ms: 250, jsHeapBytes: 640 * mib, processBytes: 3072 * mib };
const usesSoftware = renderer => /swiftshader|software|llvmpipe/i.test(renderer);

async function sampleProcessMemory(ids) {
  if (process.platform !== 'win32') {
    const { stdout } = await execFileAsync('ps', ['-o', 'rss=', '-p', ids.join(',')], { timeout: 5000 });
    return stdout.trim().split(/\s+/).reduce((total, rss) => total + Number(rss) * 1024, 0);
  }
  const command = `Get-Process | Where-Object { $_.Id -in @(${ids.join(',')}) } | Measure-Object -Property WorkingSet64 -Sum | Select-Object -ExpandProperty Sum`;
  const options = ['-NoProfile', '-NonInteractive', '-Command', command];
  let result;
  try {
    result = await execFileAsync('pwsh', options, { timeout: 5000 });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    result = await execFileAsync('powershell', options, { timeout: 5000 });
  }
  return Number(result.stdout.trim());
}

for (const [version, file] of editions) {
  const { rpc, close } = await openTestBrowser({
    hardwarePreferred: !args.includes('--software'),
    launchArgs: ['--window-size=1280,720', '--enable-precise-memory-info'],
    timeoutMs: 120_000,
  });
  let stopMemory = false;
  const memorySamples = [];
  const memoryMonitor = measureMemory ? (async () => {
    while (!stopMemory) {
      try {
        const { processInfo } = await rpc('SystemInfo.getProcessInfo');
        const ids = processInfo.map(info => info.id).filter(Number.isSafeInteger);
        if (ids.length) {
          const bytes = await sampleProcessMemory(ids);
          if (Number.isFinite(bytes) && bytes > 0) memorySamples.push({ at: performance.now(), bytes, processes: ids.length });
        }
      } catch (error) {
        console.log('Memory sampling warning:', error.message);
      }
      if (!stopMemory) await delay(250);
    }
  })() : null;
  try {
    const { targetId } = await rpc('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await rpc('Target.attachToTarget', { targetId, flatten: true });
    await rpc('Runtime.enable', {}, sessionId);
    await rpc('Page.enable', {}, sessionId);
    await rpc('Performance.enable', {}, sessionId);
    const metrics = async () => Object.fromEntries((await rpc('Performance.getMetrics', {}, sessionId)).metrics.map(item => [item.name, item.value]));
    await rpc('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }, sessionId);
    await rpc('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.gpuAudit={created:0,deleted:0,draws:0,triangles:0};
      for(const [method,key] of [['createBuffer','created'],['deleteBuffer','deleted']]) {
        const original=WebGL2RenderingContext.prototype[method];
        WebGL2RenderingContext.prototype[method]=function(...args){gpuAudit[key]++;return original.apply(this,args)};
      }
      for(const method of ['drawElements','drawArrays']) {
        const original=WebGL2RenderingContext.prototype[method];
        WebGL2RenderingContext.prototype[method]=function(...args){gpuAudit.draws++;if(args[0]===this.TRIANGLES)gpuAudit.triangles+=(method==='drawElements'?args[1]:args[2])/3;return original.apply(this,args)};
      }` }, sessionId);
    const evalPage = async expression => {
      const result = await rpc('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result.value;
    };
    const started = performance.now();
    const nav = await rpc('Page.navigate', { url: pathToFileURL(resolve(file)).href }, sessionId);
    assert.ok(!nav.errorText, nav.errorText);
    const deadline = Date.now() + 60_000;
    while (!await evalPage("globalThis.__FORZERO__?globalThis.__FORZERO__.ready===true:(typeof ready!=='undefined'&&ready)")) {
      if (Date.now() > deadline) throw Error(version + ': initialization timeout');
      await delay(100);
    }
    const coldMs = performance.now() - started;
    const renderer = await evalPage(`(()=>{const c=globalThis.__FORZERO__?globalThis.__FORZERO__.canvas:canvas;const g=c.getContext('webgl2'), e=g.getExtension('WEBGL_debug_renderer_info');return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER)})()`);
    console.log(version, 'renderer:', renderer);
    if (baselineDir && usesSoftware(renderer)) throw Error('Browser selected software rendering; historical hardware GPU comparison requires a hardware renderer');
    await evalPage("(()=>{const f=globalThis.__FORZERO__;if(f){f.preferences.aa='fxaa';f.preferences.resolution='fast';f.setActiveWeather('day');f.race.freeRide()}else{preferences.aa='fxaa';preferences.resolution='fast';setActiveWeather('day');race.freeRide()}})()");
    const scenes = [];
    const campusSequence = Array.from({ length: cycles }, () => ['szu', 'ucl', 'shunde']).flat();
    for (const [index, campus] of campusSequence.entries()) {
      let switchMs = 0;
      let switchWork = null;
      if (index !== 0) {
        const beforeMetrics = await metrics();
        switchMs = await evalPage(`(async()=>{
          const f=globalThis.__FORZERO__, travelUi=f?f.ui:ui;
          (f?f.arriveAtStation:arriveAtStation)();travelUi.travel.click();
          const start=performance.now();
          travelUi.travelChoices.querySelector('[data-destination="${campus}"]').click();
          while((f?f.activeCampus:activeCampus)!=='${campus}'||(f?f.pendingCampus:pendingCampus)){
            if(performance.now()-start>20000)throw Error('Map switch timeout: ${campus}');
            await new Promise(resolve=>requestAnimationFrame(resolve));
          }
          return performance.now()-start;
        })()`);
        const afterMetrics = await metrics();
        switchWork = Object.fromEntries(['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration']
          .map(name => [name, 1000 * ((afterMetrics[name] ?? 0) - (beforeMetrics[name] ?? 0))]));
      }
      const sample = await evalPage(`(async()=>{
        const f=globalThis.__FORZERO__, c=f?f.canvas:canvas, r=f?f.race:race, cf=f?f.courseFrame:courseFrame, cg=f?f.courseGround:courseGround;
        const gl=c.getContext('webgl2'), frame=()=>new Promise(res=>requestAnimationFrame(()=>{gl.finish();res(performance.now())}));
        for(let i=0;i<30;i++) await frame();
        const before={...gpuAudit},times=[];let last=await frame(),peak=performance.memory?.usedJSHeapSize??null;
        for(let i=0;i<300;i++){
          if(${followRoute}) {
            const framePos=cf(r.event.path, r.event.length * i / 300);
            Object.assign(r.rider,{position:cg(r.event,framePos.p),heading:Math.atan2(framePos.f[2],framePos.f[0]),speed:0});
            r.moved=true;if(f){f.cameraRevision++;}else{cameraRevision++;}
          }
          const now=await frame();times.push(now-last);last=now;
          if(peak!==null)peak=Math.max(peak,performance.memory.usedJSHeapSize);
        }
        times.sort((a,b)=>a-b);const delta=Object.fromEntries(Object.keys(before).map(k=>[k,gpuAudit[k]-before[k]]));
        return {p95:times[284],median:times[150],drawCallsPerFrame:delta.draws/301,trianglesPerFrame:delta.triangles/301,
          buffersCreated:delta.created,buffersDeleted:delta.deleted,buffersLive:gpuAudit.created-gpuAudit.deleted,
          sampledJsHeapPeak:peak,glError:gl.getError(),canvas:[c.width,c.height]};
      })()`);
      scenes.push({ campus, cycle: Math.floor(index / 3) + 1, switchMs, switchWork, ...sample });
      console.log(version, campus, JSON.stringify(scenes.at(-1)));
    }
    stopMemory = true;
    await memoryMonitor;
    const sampledProcessPeak = memorySamples.length ? Math.max(...memorySamples.map(sample => sample.bytes)) : null;
    if (measureMemory && sampledProcessPeak === null) throw Error('No browser process memory samples obtained');
    output.push({ version, renderer, coldMs, scenes, ...(measureMemory ? { sampledProcessPeak, memorySamples } : {}) });
    if (measureMemory) console.log(version, 'sampled total working-set peak:', sampledProcessPeak, 'bytes; samples:', memorySamples.length);
  } finally {
    stopMemory = true;
    await memoryMonitor;
    await close();
  }
}
for (const result of output) {
  assert.equal(result.renderer, output[0].renderer, 'Versions must run on the same GPU renderer');
  assert.ok(result.scenes.every(scene => scene.glError === 0), result.version + ' WebGL errors');
  if (result.version !== currentVersion) continue;
  const p95Limit = usesSoftware(result.renderer) ? currentBudget.softwareP95Ms : currentBudget.hardwareP95Ms;
  for (const scene of result.scenes) {
    const label = `${scene.campus} map cycle ${scene.cycle}`;
    assert.ok(Number.isFinite(scene.p95) && scene.p95 <= p95Limit, `${label}: p95 ${scene.p95}ms exceeds ${p95Limit}ms`);
    assert.ok(Number.isFinite(scene.sampledJsHeapPeak) && scene.sampledJsHeapPeak <= currentBudget.jsHeapBytes,
      `${label}: JS heap peak ${scene.sampledJsHeapPeak} bytes exceeds ${currentBudget.jsHeapBytes}`);
  }
  if (measureMemory) assert.ok(result.sampledProcessPeak <= currentBudget.processBytes,
    `Browser memory peak ${result.sampledProcessPeak} bytes exceeds ${currentBudget.processBytes}`);
}
const outFile = resolve(process.env.FORZERO_PERF_OUTPUT ?? 'dist-v2/hardware-perf.verify.json');
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(output, null, 2) + '\n');
console.log('Saved', outFile);
