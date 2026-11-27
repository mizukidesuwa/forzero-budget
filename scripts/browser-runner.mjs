import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

async function openBrowserTcp(path, launchArgs, timeoutMs) {
  const profile = mkdtempSync(join(tmpdir(), 'forzero-cdp-'));
  const child = spawn(path, [
    '--headless=new', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    '--no-sandbox', '--disable-dev-shm-usage', '--disable-extensions', '--no-first-run', ...launchArgs,
    '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--user-data-dir=' + profile,
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '', socket, rpc, serial = 0;
  child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-6000); });
  const pending = new Map();
  const close = async () => {
    if (socket?.readyState === WebSocket.OPEN && rpc) {
      await Promise.race([rpc('Browser.close').catch(() => {}), delay(2000)]);
      socket.close();
    }
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit').catch(() => {});
      child.kill(); await Promise.race([exited, delay(3000)]);
    }
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); }
    catch (error) { console.log('Temporary browser profile could not be removed:', error.code); }
  };
  try {
    await once(child, 'spawn');
    const portFile = join(profile, 'DevToolsActivePort');
    const until = Date.now() + 20_000;
    while (!existsSync(portFile) && Date.now() < until) {
      await delay(100);
    }
    if (!existsSync(portFile)) throw Error(`No DevTools port; browser exit ${child.exitCode}: ${stderr.trim() || '(no stderr)'}`);
    const [port, endpoint] = readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
    assertPort(port, endpoint);
    socket = new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('DevTools WebSocket timeout')), 10_000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(Error('DevTools WebSocket connection failed')); }, { once: true });
    });
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
    });
    socket.addEventListener('close', () => {
      for (const reject of pending.values()) reject({ error: { message: 'DevTools connection closed' } });
      pending.clear();
    });
    rpc = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++serial;
      const timer = setTimeout(() => { pending.delete(id); reject(Error(`${method} timed out`)); }, timeoutMs);
      pending.set(id, result => { clearTimeout(timer); result.error ? reject(Error(result.error.message)) : resolve(result.result); });
      try { socket.send(JSON.stringify({ id, method, params, sessionId })); }
      catch (error) { pending.delete(id); clearTimeout(timer); reject(error); }
    });
    const version = await rpc('Browser.getVersion');
    const context = await rpc('Target.createBrowserContext', { disposeOnDetach: true });
    await rpc('Target.disposeBrowserContext', { browserContextId: context.browserContextId });
    console.log('Browser ready:', version.product, '(local DevTools)');
    return { rpc, close };
  } catch (error) { await close(); throw error; }
}

function assertPort(port, endpoint) {
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535 || !/^\/devtools\/browser\//.test(endpoint ?? '')) {
    throw Error('Invalid DevTools endpoint');
  }
}

export async function openTestBrowser({ hardwarePreferred = false, launchArgs = [], timeoutMs = 20_000 } = {}) {
  const graphicsArgs = hardwarePreferred ? [] : ['--use-gl=angle', '--use-angle=swiftshader'];
  const candidates = process.env.CHROME_PATH ? [process.env.CHROME_PATH] : [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  const failures = [];
  for (const path of (process.env.FORZERO_BROWSER_TRANSPORT === 'tcp' ? [] : candidates.filter(existsSync))) {
    const profile = mkdtempSync(join(tmpdir(), 'forzero-4player-'));
    let stderr = '', serial = 0, buffer = '', failure = null;
    const pending = new Map();
    const child = spawn(path, [
      '--headless=new', '--remote-debugging-pipe', '--no-sandbox', '--disable-dev-shm-usage', '--disable-extensions', '--no-first-run',
      ...graphicsArgs, '--enable-unsafe-swiftshader', '--window-size=987,600', ...launchArgs,
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
      '--user-data-dir=' + profile,
    ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
    child.stdio[3].on('error', () => {});
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-6000); });
    child.on('error', error => { failure = error.message; });
    child.on('exit', (code, signal) => {
      failure = `Browser exited (code ${code}, signal ${signal}): ${stderr.trim() || '(no stderr)'}`;
      for (const reject of pending.values()) reject({ error: { message: failure } });
      pending.clear();
    });
    child.stdio[4].on('data', chunk => {
      buffer += chunk;
      let at;
      while ((at = buffer.indexOf('\0')) >= 0) {
        const message = JSON.parse(buffer.slice(0, at)); buffer = buffer.slice(at + 1);
        if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
      }
    });
    const rpc = (method, params = {}, sessionId) => new Promise((ok, fail) => {
      if (failure) return fail(Error(failure));
      const id = ++serial;
      const timer = setTimeout(() => { pending.delete(id); fail(Error(`${method} timed out after ${timeoutMs}ms`)); }, timeoutMs);
      pending.set(id, message => { clearTimeout(timer); message.error ? fail(Error(message.error.message)) : ok(message.result); });
      child.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0', error => {
        if (error && pending.has(id)) { pending.delete(id); clearTimeout(timer); fail(error); }
      });
    });
    const close = async () => {
      if (child.pid && child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit').catch(() => {});
        child.kill();
        await Promise.race([exited, delay(3000)]);
      }
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    };
    try {
      await once(child, 'spawn');
      const version = await rpc('Browser.getVersion');
      const context = await rpc('Target.createBrowserContext', { disposeOnDetach: true });
      await rpc('Target.disposeBrowserContext', { browserContextId: context.browserContextId });
      console.log('Browser ready:', version.product);
      return { rpc, close };
    } catch (error) {
      failures.push(`${path}: ${error.message}`);
      console.log('Browser unavailable:', path, error.message);
      await close();
    }
  }
  for (const path of candidates.filter(existsSync)) {
    try {
      console.log('Trying local DevTools:', path);
      return await openBrowserTcp(path, [...graphicsArgs, ...launchArgs], timeoutMs);
    }
    catch (error) {
      failures.push(`${path} (local DevTools): ${error.message}`);
      console.log('Browser unavailable:', path, '(local DevTools)', error.message);
    }
  }
  throw new Error('No test browser could start. ' + (failures.join(' | ') || 'Chrome and Edge were not found.'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const browser = await openTestBrowser();
  console.log('PASS: browser and isolated context opened');
  await browser.close();
}
