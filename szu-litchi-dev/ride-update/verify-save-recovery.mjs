import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import vm from 'node:vm';
import { createAppShell } from '../online/server.mjs';

function snapshot(name) {
  return {format:'litchi-save',version:1,storage:{'szu-litchi-driver-1':name},friends:[{replay:'archived'}]};
}

async function request(shell, method, body) {
  const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);
  Object.assign(req,{method,url:'/app/save',headers:{}});
  const res=new Writable({write(chunk,encoding,callback){this.body+=chunk.toString();callback();}});
  res.body='';
  res.writeHead=status=>{res.status=status;return res;};
  const done=new Promise(resolve=>res.once('finish',resolve));
  shell.server.emit('request',req,res);
  await done;
  return {status:res.status,body:JSON.parse(res.body)};
}

const folder=await mkdtemp(join(tmpdir(),'litchi-save-recovery-'));
const current=join(folder,'player-data.json'), newest=join(folder,'newest.json'), older=join(folder,'older.json');
const shell=createAppShell({page:Buffer.from('<title>荔园环骑 1.6.6</title>'),saveDir:folder,
  previousSaveFile:[newest,older],bootTimeoutMs:0});
try {
  await writeFile(newest,'{broken snapshot');
  await writeFile(older,JSON.stringify(snapshot('older')));
  const previous=await request(shell,'GET');
  assert.equal(previous.status,200);
  assert.deepEqual(previous.body.data,snapshot('older'));
  await writeFile(newest,JSON.stringify(snapshot('newest')));
  assert.deepEqual((await request(shell,'GET')).body.data,snapshot('newest'));
  assert.equal((await request(shell,'POST',{...snapshot('current'),friends:null})).status,200);
  assert.deepEqual((await request(shell,'GET')).body.data.friends,snapshot('newest').friends);
  await writeFile(current,'{broken current');
  assert.equal((await request(shell,'POST',snapshot('replacement'))).status,409);
  assert.equal(await readFile(current,'utf8'),'{broken current');
} finally {
  await shell.shutdown();
  await rm(folder,{recursive:true,force:true});
}

const source=await readFile(new URL('./save-sync.js',import.meta.url),'utf8');
let sent, status;
const sandbox=vm.createContext({
  onlineAppMode:true,
  localStorage:{length:0},
  readFriendScores:async()=>{throw Error('IndexedDB unavailable');},
  fetch:async(_path,options)=>{sent=JSON.parse(options.body); return {ok:true};},
  ui:{saveStatus:{}},
  setText:(_node,value)=>{status=value;}
});
vm.runInContext(source,sandbox);
await vm.runInContext('flushLocalSave()',sandbox);
assert.equal(sent,undefined);
vm.runInContext('saveHydrated=true;',sandbox);
await vm.runInContext('flushLocalSave()',sandbox);
assert.equal(sent.friends,null);
await vm.runInContext('importSaveFile({size:50,text:async()=>JSON.stringify({format:SAVE_FORMAT,version:1,storage:null})})',sandbox);
assert.match(status,/有效/);
await vm.runInContext(`localStorage.getItem=()=>null;
  localStorage.setItem=()=>{throw Error('Browser storage denied');};
  importSaveFile({size:200,text:async()=>JSON.stringify({
    format:SAVE_FORMAT,version:1,storage:{'szu-litchi-driver-1':'test'}
  })})`,sandbox);
assert.match(status,/无法写入浏览器存档/);
console.log('Save recovery, protected damaged current save, archive read failure, invalid import passed.');
