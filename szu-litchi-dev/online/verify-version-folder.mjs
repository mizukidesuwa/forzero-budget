import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { createAppShell, loadStaticAssets } from './server.mjs';

const folder = resolve(process.argv[2] ?? 'szu-litchi-loop-1.5.0');
const folderUrl = pathToFileURL(folder + '/');
const assets = await loadStaticAssets(folderUrl);
const expectedTitle=assets['/index.html'].body.toString('utf8').match(/<title>([^<]+)<\/title>/)[1];
const saveDir = mkdtempSync(join(tmpdir(), 'litchi-save-'));

let shellShutdown = false;
const shell = createAppShell({
  assets,
  saveDir,
  iceServers: [],
  roomPort: 0,
  roomHost: '127.0.0.1',
  allowPortFallback: false,
  idleMs: 1200,
  bootTimeoutMs: 30_000,
  onShutdown: () => { shellShutdown = true; },
});
shell.server.listen(0, '127.0.0.1');
await once(shell.server, 'listening');
const appPort = shell.server.address().port;
const appBase = `http://127.0.0.1:${appPort}`;
const localIndexUrl = new URL('./index.html', folderUrl).href;

const browser = spawn(process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-pipe', '--no-sandbox', '--disable-extensions', '--no-first-run',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=830,560',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  '--user-data-dir=' + mkdtempSync(join(tmpdir(), 'litchi-v14-chrome-')),
], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });

const errors = [], pending = new Map();
let request = 0, buffer = '';
const deadline = setTimeout(() => { console.error('Version-folder browser deadline'); process.exit(1); }, 120_000);
browser.once('error', error => { console.error(error); process.exit(1); });
browser.stdio[4].on('data', chunk => {
  buffer += chunk;
  let end;
  while ((end = buffer.indexOf('\0')) >= 0) {
    const event = JSON.parse(buffer.slice(0, end));
    buffer = buffer.slice(end + 1);
    if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.exception?.description ?? event.params.exceptionDetails.text);
    const respond = pending.get(event.id);
    if (respond) { pending.delete(event.id); respond(event); }
  }
});

function rpc(method, params = {}, sessionId) {
  return new Promise((resolveRpc, rejectRpc) => {
    const id = ++request;
    pending.set(id, event => event.error ? rejectRpc(Error(event.error.message)) : resolveRpc(event.result));
    browser.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0');
  });
}

async function open(name, url) {
  const { browserContextId } = await rpc('Target.createBrowserContext');
  const { targetId } = await rpc('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await rpc('Target.attachToTarget', { targetId, flatten: true });
  await rpc('Runtime.enable', {}, sessionId);
  await rpc('Page.enable', {}, sessionId);
  const navigation = await rpc('Page.navigate', { url }, sessionId);
  assert.ok(!navigation.errorText, navigation.errorText);
  const run = async expression => {
    const result = await rpc('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  async function wait(expression) {
    const until = Date.now() + 26_000;
    do {
      if (await run(expression)) return;
      await sleep(160);
    } while (Date.now() < until);
    const status = await run(`typeof onlineRoom==='undefined'?null:({state:onlineRoom?.state,
      app:onlineAppMode,name:driverProfile?.name,bike:race?.bike?.tyres,trail:vehicleTunings?.trail,
      message:ui.onlineStatus.textContent,peers:onlineRoom&&Array.from(onlineRoom.peers.values(),p=>[p.pc.connectionState,p.channel?.readyState])})`);
    throw Error(name + ' timed out ' + expression + ' ' + JSON.stringify({ status, errors }));
  }
  await wait("typeof ready!=='undefined'&&ready");
  if (name) await run(`ui.driverName.value=${JSON.stringify(name)};commitDriverName();`);
  return { run, wait, targetId };
}

async function equipBike(rider, parts) {
  const [tyres, gears, brakes, frame = 'stock', sprint = 'stock'] = parts;
  await rider.run(`ui.bikeButton.click();
    [ui.bikeTyres.value,ui.bikeGears.value,ui.bikeBrakes.value,ui.bikeFrame.value,ui.bikeSprint.value]=${JSON.stringify([tyres, gears, brakes, frame, sprint])};
    ui.bikeSprint.dispatchEvent(new Event('change'));ui.settingsContinue.click()`);
  assert.deepEqual(await rider.run('[race.bike.tyres,race.bike.gears,race.bike.brakes,race.bike.frame,race.bike.sprint]'), [tyres, gears, brakes, frame, sprint]);
}

const drive = readFileSync(new URL('../rounds/drive-path.js', import.meta.url), 'utf8')
  .replace('const trial=new TimeTrial(event);', 'const trial=race;');

try {
  // 0. Before creating a room, no external host port is open
  assert.equal(shell.hostInfo().hosting, false);

  // 1. Host opens local app shell; even with an old friend IP saved, clicking "创建房间" opens local host on demand
  const host = await open('房主', appBase + '/');
  assert.equal(await host.run('document.title'),expectedTitle);
  assert.ok(await host.run('getComputedStyle(document.body).backgroundImage.includes("radial-gradient")'));
  assert.equal(await host.run("normalizeOnlineHost('26.123.45.67')"), 'http://26.123.45.67:8787');
  assert.equal(await host.run("normalizeOnlineHost('192.168.1.9:9000')"), 'http://192.168.1.9:9000');
  assert.equal(await host.run("normalizeOnlineHost('https://ride.example.com/')"), 'https://ride.example.com');
  await host.wait('onlineAppMode===true');
  assert.equal(shell.hostInfo().hosting, false);

  await equipBike(host, ['traction', 'short', 'power']);
  await host.run(`ui.coursePicker.value='lakes';ui.coursePicker.dispatchEvent(new Event('change'));
    ui.onlineHostInput.value='192.0.2.99';
    ui.onlineButton.click();ui.onlineCreate.click();`);
  await host.wait("onlineRoom?.course?.id==='lakes'&&!onlineBusy");
  assert.equal(shell.hostInfo().hosting, true);
  const roomPort = shell.hostInfo().port;
  assert.ok(roomPort > 0);
  const roomBase = `http://127.0.0.1:${roomPort}`;
  const code = await host.run('onlineRoom.state.code');
  const inviteLink = await host.run('onlineInviteLink(onlineRoom)');
  const hostAddresses = await host.run('onlineRoom.hostAddresses');
  if (hostAddresses.length) {
    assert.ok(!inviteLink.includes('127.0.0.1'), inviteLink);
    assert.ok(inviteLink.startsWith(hostAddresses[0].url + '/#room=' + code), inviteLink);
  }

  // 2. Guest A opens split index.html directly via file:// and joins cross-origin by entering host IP:port
  const fileGuest = await open('本地IP客机', localIndexUrl);
  assert.equal(await fileGuest.run('document.title'),expectedTitle);
  assert.equal(await fileGuest.run('location.protocol'), 'file:');
  await equipBike(fileGuest, ['race', 'long', 'control']);
  await fileGuest.run(`ui.onlineButton.click();
    ui.onlineHostInput.value=${JSON.stringify(`127.0.0.1:${roomPort}`)};
    ui.onlineHostInput.dispatchEvent(new Event('input'));
    ui.onlineCodeInput.value=${JSON.stringify(code)};
    ui.onlineJoinForm.requestSubmit();`);
  await fileGuest.wait("onlineRoom?.course?.id==='lakes'&&!onlineBusy");
  assert.equal(await fileGuest.run('localStorage.getItem(ONLINE_HOST_KEY)'), `127.0.0.1:${roomPort}`);
  assert.match(await fileGuest.run('ui.onlineHostHint.textContent'), new RegExp(`127\\.0\\.0\\.1:${roomPort}`));

  // 3. Guest B opens host's HTTP invite link without having the folder locally
  const webGuest = await open('网页直连客机', `${roomBase}/#room=${code}`);
  assert.equal(await webGuest.run('ui.onlineCodeInput.value'), code);
  await equipBike(webGuest, ['stock', 'stock', 'stock']);
  await webGuest.run('ui.onlineButton.click();ui.onlineJoinForm.requestSubmit();');
  await webGuest.wait("onlineRoom?.course?.id==='lakes'&&!onlineBusy");

  const racers = [host, fileGuest, webGuest];
  await Promise.all(racers.map(rider => rider.wait('onlineRoom?.state.players.length===3&&onlineDataLinks(onlineRoom)===2')));
  await Promise.all(racers.map(rider => rider.run('ui.onlineReady.click()')));
  await host.wait('!ui.onlineStart.disabled');
  await host.run('ui.onlineStart.click()');
  await Promise.all(racers.map(rider => rider.wait("onlineRoom?.state.phase==='tuning'")));
  await host.wait('!ui.settingsTuneSkip?.disabled');
  await host.run('ui.settingsTuneSkip.click()');
  await Promise.all(racers.map(rider => rider.wait("race.phase==='race'&&onlineRiderPoses(performance.now()).length===2")));
  assert.deepEqual(await Promise.all(racers.map(rider => rider.run('[race.rider.bike.tyres,race.rider.bike.gears,race.rider.bike.brakes]'))), [
    ['traction', 'short', 'power'], ['race', 'long', 'control'], ['stock', 'stock', 'stock'],
  ]);

  const times = await Promise.all(racers.map((rider, index) => rider.run(`(()=>{${drive}
    const result=rideTest(race.event,${index === 1},250);
    if(result.phase!=='done') throw Error('Rider did not finish');
    return result.elapsed;
  })()`)));
  await Promise.all(racers.map(rider => rider.wait("onlineRoom.state.phase==='done'&&ui.onlineDialog.open")));
  const winner = await host.run('onlineRoom.state.standing[0].name');
  assert.equal(winner, ['房主', '本地IP客机', '网页直连客机'][times.indexOf(Math.min(...times))]);

  // 4. Host leaves room -> external host port shuts down automatically!
  await Promise.all(racers.map(rider => rider.run('ui.onlineLeave.click()')));
  for (let i = 0; i < 40 && shell.hostInfo().hosting; i++) await sleep(50);
  assert.equal(shell.hostInfo().hosting, false, 'Host server should stop automatically when host leaves room');
  await assert.rejects(fetch(`${roomBase}/online/time`), 'Closed room port should refuse connections');

  // 4b. Option A local folder save (save/player-data.json): flush & hydrate into a fresh browser context
  await host.run(`(async () => {
    ui.bikeButton.click();
    ui.vehiclePicker.value='trail';ui.vehiclePicker.dispatchEvent(new Event('change'));
    ui.vehSlot0.value='mud';ui.vehSlot0.dispatchEvent(new Event('change'));
    ui.vehiclePicker.value='bike';ui.vehiclePicker.dispatchEvent(new Event('change'));
    ui.settingsContinue.click();
    await flushLocalSave(false);
  })()`);
  const saveFile = join(saveDir, 'player-data.json');
  assert.equal(existsSync(saveFile), true, 'Expected save/player-data.json to be written automatically');
  const diskSave = JSON.parse(readFileSync(saveFile, 'utf8'));
  assert.equal(diskSave.format, 'litchi-save');
  assert.ok(diskSave.storage['szu-litchi-driver-1']?.includes('房主'));
  assert.ok(diskSave.storage['szu-litchi-tuning-1']?.includes('mud'));

  // Open a completely fresh browser context (empty localStorage) -> should auto-hydrate from save/player-data.json
  const freshHost = await open(null, appBase + '/');
  await freshHost.wait("driverProfile.name==='房主' && vehicleTunings.trail.tyres==='mud' && race.bike.tyres==='traction'");
  // Also test manual backup snapshot round-trip
  const backupRoundtrip = await freshHost.run(`(async () => {
    const snap = await buildSaveSnapshot();
    snap.storage['szu-litchi-driver-1'] = JSON.stringify({ name: '存档迁移测试', vehicle: 'bike', paint: 'bay' });
    await applySaveSnapshot(snap, { preferIncoming: true });
    return { name: driverProfile.name, paint: driverProfile.paint };
  })()`);
  assert.deepEqual(backupRoundtrip, { name: '存档迁移测试', paint: 'bay' });

  // 5. Closing the host browser tabs shuts down the background app shell after grace period!
  await rpc('Target.closeTarget', { targetId: freshHost.targetId });
  await rpc('Target.closeTarget', { targetId: host.targetId });
  for (let i = 0; i < 50 && !shellShutdown; i++) await sleep(100);
  assert.equal(shellShutdown, true, 'App shell should auto-shutdown when browser tab closes');
  assert.deepEqual(errors, []);
  console.log('Version folder 1.5.0 (--app): on-demand host start, file:// cross-origin IP join, invite link join, 3-player WebRTC race, auto-stop on room close, save/player-data.json hydration & auto-exit on tab close passed.');
} finally {
  clearTimeout(deadline);
  browser.kill();
  await shell.shutdown();
}
