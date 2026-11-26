import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {setTimeout as sleep} from 'node:timers/promises';

async function travel(page,id) {
  const ev=page.evalPage;
  if(!await ev('atTravelPoint()')) await ev('ui.travel.click()');
  await ev('ui.travel.click()');
  assert.equal(await ev('ui.travelDialog.open&&ui.travelChoices.children.length===2'),true);
  await ev(`ui.travelChoices.querySelector('[data-destination="${id}"]').click()`);
  const deadline=Date.now()+35000;
  while(!await ev(`activeCampus==='${id}'&&!pendingCampus`)) {
    if(Date.now()>deadline) throw Error('Failed to reach '+id);
    await sleep(80);
  }
}

// Advance the real active trial by fixed physics steps between rendered frames.
// Only steering / braking / pedalling are synthesized; no pose or gate is moved.
function rideLoop() {
  const advance=race.advance;
  let nearest=0,frames=0,renderedGates=new Set();
  race.advance=function(dt,input) {
    if(this.phase==='done') return advance.call(this,dt,input);
    frames++;renderedGates.add(this.nextGate);
    for(let i=0;i<80&&this.phase!=='done';i++) {
      const {rider:r,event}=this,rows=event.path.rows;
      let error=Infinity,at=nearest;
      for(let j=Math.max(0,nearest-5);j<Math.min(rows.length,nearest+38);j++) {
        const q=rows[j].p, gap=(q[0]-r.position[0])**2+(q[2]-r.position[2])**2;
        if(gap<error) {error=gap;at=j;}
      }
      nearest=at;
      const d=rows[at].distance,look=along(event.path,d+clamp(2+r.speed*.29,2,5.7));
      const h=Math.atan2(look[2]-r.position[2],look[0]-r.position[0])-r.heading-r.yawRate*.085;
      const delta=Math.atan2(Math.sin(h),Math.cos(h));
      const goal=Math.min(10.8,plannedSpeed(event,d+1),Math.abs(delta)>.38?7.3:12);
      advance.call(this,1/110,{gas:r.speed<goal,brake:r.speed>goal+.32,
        left:delta<-.025,right:delta>.025,sprint:false});
    }
    if(this.phase==='done'||frames>380) {
      window.parkLap={phase:this.phase,splits:Array.from(this.splits),frames,gates:renderedGates.size,
        elapsed:this.elapsed,travel:this.rider.travel,rejoin:Number.isFinite(this.lastRejoin)};
      delete this.advance;
    }
  };
}

export async function verifyParkViews(open,errors) {
  const desktopEntry=process.env.FORZERO_RELEASE_DIR?join(process.env.FORZERO_RELEASE_DIR,'index.html'):'szu-litchi-dev/ride-update/release/index.html';
  const mobileEntry=process.env.FORZERO_MOBILE_HTML??'forzero-budget-mobile-1.9.1.1.html';
  const folder=process.env.PARK_QA_DIR??join(tmpdir(),'litchi-180-views');mkdirSync(folder,{recursive:true});
  for(const [width,height,mobile] of [[1280,720,false],[390,844,true],[844,390,true]]) {
    const page=await open(mobile?mobileEntry:desktopEntry,{width,height,mobile});
    const ev=page.evalPage;
    try {
      await ev("preferences.aa='fxaa';preferences.resolution='fast';race.freeRide();");
      await travel(page,'shunde');
      assert.equal(await ev('ui.coursePicker.value'),'qingyun-lake');
      if(mobile) {
        const pos=await ev(`(()=>{const b=document.querySelector('[data-drive="gas"]');b.scrollIntoView({block:'nearest'});
          const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
        await page.touch('touchStart',[pos]);await sleep(550);await page.touch('touchEnd',[]);
        assert.ok(await ev('race.rider.travel>0.025'),'Touch acceleration');
        await ev('arriveAtStation()');
      }
      await ev('ui.mapToggle.click();renderCampusMap(ui.bigMap,race,false);ui.mapToggle.click()');
      await ev('ui.travel.click();ui.travelClose.click()');
      assert.equal(await ev('activeCampus==="shunde"&&!ui.travelDialog.open'),true);
      await ev(`ui.startTrial.click();(${rideLoop.toString()})();`);
      const end=Date.now()+135000;
      while(!await ev('Boolean(window.parkLap)')) {
        if(Date.now()>end||errors.length) throw Error('Timed lap failed '+JSON.stringify(errors)+' '+await ev('[race.phase,race.nextGate,race.rider.position]'));
        await sleep(350);
      }
      const lap=await ev('window.parkLap');
      assert.equal(lap.phase,'done');assert.equal(lap.splits.length,7);
      assert.ok(lap.splits.every((t,i)=>i===0||t>lap.splits[i-1]));
      assert.equal(lap.rejoin,false);assert.ok(lap.gates>=7);
      await ev('ui.freeRide.click();');
      const samples=[];
      for(const [name,d] of [['gate',1048],['forest',299],['bridge',679],['grove',808],['tower',845]]) {
        await ev(`{const f=courseFrame(parkPath,${d});Object.assign(race.rider,{position:courseGround(parkCourse,f.p),heading:Math.atan2(f.f[2],f.f[0]),speed:0});race.moved=true;cameraRevision++;}`);
        const stat=await ev(`(async()=>{
          const frame=()=>new Promise(r=>requestAnimationFrame(()=>{canvas.getContext('webgl2').finish();r(performance.now())}));
          for(let n=0;n<5;n++) await frame();
          const before={...glBuffers},times=[];let then=await frame();
          for(let i=0;i<20;i++){const now=await frame();times.push(now-then);then=now;}
          times.sort((a,b)=>a-b);
          return {p50:+((times[9]+times[10])/2).toFixed(1),p95:+times[18].toFixed(1),
            size:[canvas.width,canvas.height],created:glBuffers.created-before.created,deleted:glBuffers.deleted-before.deleted,
            gl:canvas.getContext('webgl2').getError()};
        })()`);
        assert.deepEqual([stat.created,stat.deleted,stat.gl],[0,0,0]);samples.push({name,...stat});
        const shot=await page.capture();writeFileSync(join(folder,width+'-'+name+'.jpg'),Buffer.from(shot.data,'base64'));
      }
      await travel(page,'ucl');await travel(page,'szu');
      if(!mobile) {await travel(page,'ucl');await travel(page,'shunde');await travel(page,'szu');}
      console.log(JSON.stringify({width,height,lap,samples}));
      assert.deepEqual(errors,[]);
    } finally {await page.close();}
  }
}

export async function verifyMountainViews(open,errors) {
  const desktopEntry=process.env.FORZERO_RELEASE_DIR?join(process.env.FORZERO_RELEASE_DIR,'index.html'):'szu-litchi-dev/ride-update/release/index.html';
  const mobileEntry=process.env.FORZERO_MOBILE_HTML??'forzero-budget-mobile-1.9.1.1.html';
  for(const [width,height,mobile] of [[1280,720,false],[390,844,true],[844,390,true]]) {
    const page=await open(mobile?mobileEntry:desktopEntry,{width,height,mobile});
    const ev=page.evalPage;
    try {
      await ev("preferences.aa='fxaa';preferences.resolution='fast';race.freeRide();");
      await travel(page,'shunde');
      assert.deepEqual(await ev('Array.from(ui.coursePicker.options,o=>o.value)'),
        ['qingyun-lake','shenbu-climb','shenbu-descent','shunde-endurance']);
      const samples=[];
      for(const [route,dist] of [['shenbu-climb',296],['shenbu-descent',105],['shunde-endurance',860]]) {
        const result=await ev(`(async()=>{
          ui.coursePicker.value='${route}';ui.coursePicker.dispatchEvent(new Event('change'));
          ui.mapToggle.click();ui.mapZoom.click();
          const elevation=!ui.elevationPanel.hidden&&/3[45]\\.\\d m/.test(ui.elevationStats.textContent);
          ui.mapToggle.click();
          const frame=courseFrame(race.event.path,${dist}),p=courseGround(race.event,frame.p);
          Object.assign(race.rider,{position:p,heading:Math.atan2(frame.f[2],frame.f[0]),speed:0});
          race.moved=true;cameraRevision++;
          const next=()=>new Promise(resolve=>requestAnimationFrame(resolve));
          for(let i=0;i<6;i++) await next();
          const before={...glBuffers};
          for(let i=0;i<12;i++) await next();
          return {elevation,delta:[glBuffers.created-before.created,glBuffers.deleted-before.deleted],
            error:canvas.getContext('webgl2').getError()};
        })()`);
        assert.equal(result.elevation,true);
        assert.deepEqual(result.delta,[0,0]);assert.equal(result.error,0);
        if(process.env.MOUNTAIN_QA_DIR) {
          mkdirSync(process.env.MOUNTAIN_QA_DIR,{recursive:true});
          const shot=await page.capture();
          writeFileSync(join(process.env.MOUNTAIN_QA_DIR,width+'-'+route+'.jpg'),Buffer.from(shot.data,'base64'));
        }
        samples.push(result);
        await ev('if(zoomMap){ui.mapToggle.click();ui.mapZoom.click();ui.mapToggle.click();}');
      }
      console.log(JSON.stringify({width,height,samples}));
    } finally { await page.close(); }
  }
  assert.deepEqual(errors,[]);
}

