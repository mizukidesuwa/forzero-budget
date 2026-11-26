let showMapComparison = true;
const mapReplay={run:null,time:0,speed:1,playing:false,lastDraw:null};

function replayGapAt(run,reference,time) {
  const index=run.splits.findIndex(split=>split>=time);
  if(index<0||!Number.isFinite(reference.splits?.[index])) {
    const shared=Math.min(run.splits.length,reference.splits?.length??0)-1;
    return shared<0?null:run.splits[shared]-reference.splits[shared];
  }
  const from=run.splits[index-1]??0, refFrom=reference.splits[index-1]??0;
  const fraction=clamp((time-from)/Math.max(1,run.splits[index]-from),0,1);
  return time-mix(refFrom,reference.splits[index],fraction);
}

function advanceMapReplay(state,dt,max) {
  if(state.playing) {
    state.time=Math.min(max,state.time+dt*1000*state.speed);
    if(state.time>=max) state.playing=false;
  }
}

function initMapReplay() {
  ui.replayPlay.addEventListener('click',()=>{
    if(mapReplay.time>=Number(ui.replaySeek.max)) mapReplay.time=0;
    mapReplay.playing=!mapReplay.playing;
  });
  ui.replaySpeed.addEventListener('change',()=>{mapReplay.speed=Number(ui.replaySpeed.value);});
  ui.replaySeek.addEventListener('input',()=>{
    mapReplay.time=Number(ui.replaySeek.value);mapReplay.playing=false;
  });
}

function updateMapReplay(dt) {
  const run=race.lastRun, ref=run?.comparison??race.reference;
  ui.mapReplay.hidden=!mapOpen||race.phase!=='done'||!run?.samples?.length||!ref?.samples?.length;
  if(ui.mapReplay.hidden) {
    mapReplay.playing=false;
    mapReplay.lastDraw=null;
    return;
  }
  if(mapReplay.run!==run) {
    Object.assign(mapReplay,{run,time:0,playing:false,lastDraw:null});
    ui.replaySeek.max=Math.ceil(Math.max(run.time,ref.time));
  }
  advanceMapReplay(mapReplay,dt,Number(ui.replaySeek.max));
  ui.replaySeek.value=mapReplay.time;
  setText(ui.replayPlay,mapReplay.playing?'暂停':'播放');
  if(mapReplay.lastDraw===mapReplay.time) return;
  mapReplay.lastDraw=mapReplay.time;
  const a=replayAt(run,Math.min(mapReplay.time,run.time)), b=replayAt(ref,Math.min(mapReplay.time,ref.time));
  const gap=replayGapAt(run,ref,mapReplay.time);
  setText(ui.replayDetail,`速度差 ${((a.speed-b.speed)*3.6).toFixed(1)} km/h`+(gap===null?'':` · 秒差 ${signedSeconds(gap)}`));
  renderCampusMap(ui.bigMap,race,false,zoomMap);
}

function drawReplayPins(ctx,project,race,compact) {
  if(compact||!mapReplay.run||mapReplay.run!==race.lastRun||race.phase!=='done') return false;
  const run=race.lastRun, ref=run.comparison??race.reference;
  mapPin(ctx,project,replayAt(ref,Math.min(mapReplay.time,ref.time)),false,true);
  mapPin(ctx,project,replayAt(run,Math.min(mapReplay.time,run.time)),false);
  return true;
}

function drawComparisonTraces(ctx, project, race, compact) {
  if (compact || !showMapComparison || !race.lastRun?.samples?.length) return;
  const drawPolyline = (samples, fromTime, toTime, color, width, dash = []) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(dash);
    ctx.beginPath();
    let prev = null;
    for (const sample of samples) {
      if (sample[0] < fromTime - 1 || sample[0] > toTime + 1) continue;
      if (prev && Math.hypot(sample[1] - prev[1], sample[3] - prev[3]) > 15) {
        ctx.stroke();
        ctx.beginPath();
        prev = null;
      }
      const [x, y] = project([sample[1], 0, sample[3]]);
      if (!prev) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      prev = sample;
    }
    ctx.stroke();
    ctx.restore();
  };

  const ref=race.lastRun.comparison??race.reference;
  if (ref?.samples?.length) {
    drawPolyline(ref.samples, 0, ref.time + 1, 'rgba(126, 224, 232, 0.78)', 2.4, [6, 5]);
  }
  const splits = race.lastRun.splits ?? [];
  const refSplits = ref?.splits ?? [];
  let startMs = 0;
  for (let i = 0; i < splits.length; i++) {
    const endMs = splits[i];
    const dur = endMs - startMs;
    const refDur = refSplits[i] !== undefined ? refSplits[i] - (refSplits[i - 1] ?? 0) : null;
    const color = refDur === null || Math.abs(dur - refDur) < 25 ? '#f5b85b' : dur < refDur ? '#7ef089' : '#ff8c69';
    drawPolyline(race.lastRun.samples, startMs, endMs, color, 3.1);
    startMs = endMs;
  }
}

function startSectorPractice(fromGate, toGate) {
  if (!ready || onlineRoom || pendingCampus || race.event.campus !== activeCampus) return;
  const gates = race.event.gates;
  if (fromGate < 0 || toGate <= fromGate || toGate >= gates.length) return;
  clearInput();
  race.startPractice(fromGate, toGate);
  zoomMap = true;
  cameraRevision++;
  priorTimestamp = performance.now();
  openMap(false);
  focusStage();
  updateHud();
}

function renderMapStationExtras() {
  const canPractice = !onlineRoom && race.phase !== 'race' && race.phase !== 'count';
  const showSplits = Boolean(race.lastRun?.splits?.length && race.splits.length);
  for (let i = 0; i < mapRows.length; i++) {
    const row = mapRows[i];
    row.querySelector('.map-sector-meta')?.remove();
    if (i === 0) continue;
    const meta = document.createElement('span');
    meta.className = 'map-sector-meta';
    if (showSplits && race.splits[i] !== undefined) {
      const sec = race.sector(i);
      if (sec) {
        const badge = document.createElement('span');
        badge.className = 'map-sector-delta';
        badge.dataset.gap = gapTone(sec.delta);
        badge.textContent = `${(sec.duration / 1000).toFixed(2)}s ${signedSeconds(sec.delta)}`;
        meta.append(badge);
      }
    }
    if (canPractice) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'practice-btn';
      btn.textContent = '单练';
      btn.addEventListener('click', () => startSectorPractice(i - 1, i));
      meta.append(btn);
    }
    if (meta.childNodes.length) row.append(meta);
  }
}

function exitSectorPractice() {
  if (!race.practice) return;
  clearInput();
  race.practice = null;
  race.freeRide();
  rebuildCourseHud();
  updateHud();
  focusStage();
}
