import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import saveRules from '../src/data/shared-rules.cjs';

const portable = process.argv[2]==='--portable';
if (portable) assert.ok(process.argv[3], 'Provide the extracted portable ZIP directory.');
const source = resolve(portable ? process.argv[3] : process.env.FORZERO_RELEASE_DIR ?? 'dist-v2/desktop');
const { version } = JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
const temp = await mkdtemp(join(tmpdir(),'forzero-desktop-start-'));
const children = [];
const snapshot = name => ({format:'litchi-save',version:1,storage:{'szu-litchi-driver-1':JSON.stringify({name})},friends:[]});

async function reservePort(port) {
  const server = createServer();
  server.listen(port,'127.0.0.1');
  await once(server,'listening');
  return server;
}

async function reserveConsecutivePorts() {
  for (let attempt=0; attempt<20; attempt++) {
    const first = await reservePort(0);
    const {port} = first.address();
    try {
      if (port===65535) continue;
      const second = await reservePort(port+1);
      await new Promise(resolve=>second.close(resolve));
      return port;
    } catch (error) {
      if (!['EADDRINUSE','EACCES'].includes(error.code)) throw error;
    } finally {
      await new Promise(resolve=>first.close(resolve));
    }
  }
  throw Error('Could not reserve two local ports for the desktop launch check.');
}

function launch(installation, port) {
  const node = portable ? join(installation,'runtime','node.exe') : process.execPath;
  const env = {...process.env, APP_PORT:String(port), PORT:'0', HOST:'127.0.0.1', RIDE_OPEN:'0', RIDE_IDLE_MS:'0', RIDE_ICE_SERVERS:'[]'};
  delete env.RIDE_HTML;
  if (portable) {
    for (const key of Object.keys(env)) if (key.toUpperCase()==='PATH') delete env[key];
    env.PATH = '';
  }
  const child = spawn(node,[join(installation,'server.mjs'),'--app'],{cwd:installation,env,windowsHide:true,stdio:['ignore','ignore','pipe']});
  const ended = once(child,'exit');
  children.push({child,ended});
  // Preserve startup diagnostics without writing player data to logs.
  let errorOutput = '';
  child.stderr.on('data',chunk=>{ errorOutput = (errorOutput+chunk.toString()).slice(-3000); });
  return { child, ended, diagnostics:()=>errorOutput };
}

async function request(port, path, body, instanceId) {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    ...(body===undefined ? {} : {method:'POST',headers:{
      'content-type':'application/json',
      ...(instanceId ? {'x-forzero-installation':instanceId} : {}),
    },body:JSON.stringify(body)}),
    signal:AbortSignal.timeout(5000),
  });
}

async function waitForApp(port, process) {
  const deadline = Date.now()+12_000;
  while (Date.now()<deadline) {
    assert.equal(process.child.exitCode,null,process.diagnostics() || 'The app quit before listening.');
    try {
      const result = await request(port,'/app/status');
      if (result.ok) return result.json();
    } catch {}
    await delay(80);
  }
  throw Error('The installed app did not start: '+process.diagnostics());
}

async function seedSave(path, data) {
  await mkdir(join(path,'save'),{recursive:true});
  await writeFile(join(path,'save','player-data.json'),JSON.stringify(data));
}

try {
  const folder = `forzero-budget-windows-x64-${version}`;
  const first = join(temp,folder);
  const second = join(temp,'alternate',folder);
  await Promise.all([first,second].map(path=>cp(source,path,{recursive:true,filter:file=>file!==join(source,'save')})));
  const oldPortable = snapshot('Prior Windows');
  const oldLight = snapshot('Prior light');
  const independent = snapshot('Independent');
  const archive = [{score:{name:'Friend'},replay:'existing archive entry'}];
  await Promise.all([
    seedSave(join(temp,'forzero-budget-windows-x64-2.5.6'),oldPortable),
    seedSave(join(temp,'forzero-budget-2.5.6'),oldLight),
    seedSave(join(temp,'forzero-budget-windows-x64-2.5.4'),snapshot('Older Windows')),
    seedSave(second,{...independent,friends:archive}),
  ]);
  const base = await reserveConsecutivePorts();
  const firstStatus = await waitForApp(base+1,launch(first,base+1));
  assert.equal(firstStatus.version,version);
  assert.deepEqual((await (await request(base+1,'/app/save')).json()).data,oldPortable);
  const secondStatus = await waitForApp(base,launch(second,base));
  assert.equal(secondStatus.version,version);
  assert.notEqual(secondStatus.instanceId,firstStatus.instanceId);
  assert.deepEqual((await (await request(base,'/app/save')).json()).data.storage,independent.storage);

  assert.equal((await request(base,'/app/save',oldPortable,firstStatus.instanceId)).status,409);
  assert.equal((await request(base,'/app/save',oldPortable)).status,409);
  const overflow = await request(base,'/app/save',{...independent,friends:['x'.repeat(saveRules.MAX_SAVE_BYTES)]},secondStatus.instanceId);
  assert.equal(overflow.status,413);
  const saved = snapshot('Personal progress');
  assert.equal((await request(base,'/app/save',{...saved,friends:null},secondStatus.instanceId)).status,200);
  assert.deepEqual((await (await request(base,'/app/save')).json()).data.friends,archive);
  assert.deepEqual((await (await request(base,'/app/save')).json()).data.storage,saved.storage);
  const duplicate = launch(second,base);
  const duplicateTimeout = AbortSignal.timeout(8000);
  const [code] = await Promise.race([
    duplicate.ended,
    once(duplicateTimeout,'abort').then(()=>{ throw Error('A second launch did not reuse the same installation.'); }),
  ]);
  assert.equal(code,0,duplicate.diagnostics());
  const host = await request(base,'/app/host/start',{});
  assert.equal(host.status,200);
  const {port:roomPort} = await host.json();
  const room = await request(roomPort,'/online/rooms',{name:'Desktop QA',protocol:3,format:'bo1',
    route:{campus:'szu',id:'ring',seed:null,layout:'0123abcd'}});
  assert.equal(room.status,200);
  assert.match((await room.json()).room.code,/^[A-Z2-9]{8}$/);
  console.log(portable ? 'Bundled Node.exe launched with an empty PATH, migrated and isolated saves, and hosted a room.'
    : 'Built desktop launches migrate the portable folder, isolate installations, and retain archived friends on personal-only saves.');
} finally {
  for (const { child } of children) if (child.exitCode===null && child.signalCode===null) child.kill();
  await Promise.allSettled(children.map(({ended})=>ended));
  await rm(temp,{recursive:true,force:true});
}
