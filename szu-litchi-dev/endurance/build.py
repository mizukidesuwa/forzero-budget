from pathlib import Path

here = Path(__file__).parent
baseline = (here.parent / 'campus-map' / 'szu-litchi-loop.html').read_text(encoding='utf-8')
markup, body = baseline.split('<script>\n', 1)
script, tail = body.rsplit('</script>', 1)


def js(before, after):
    global script
    if script.count(before) != 1:
        raise ValueError(f'Expected one source anchor for {before[:130]!r}')
    script = script.replace(before, after, 1)


def html(before, after):
    global markup
    if markup.count(before) != 1:
        raise ValueError(f'Expected one markup anchor for {before[:130]!r}')
    markup = markup.replace(before, after, 1)


course = (here / 'course.js').read_text(encoding='utf-8').rstrip()
surfaces = (here / 'surfaces.js').read_text(encoding='utf-8').rstrip()
js('const courses=[', course + '\n\nconst courses=[')
js("ringLength,{absolute:true,oldKey:'szu-yuehai-clockwise-v3',thresholds:[.936,1.08,1.22]})",
   """ringLength,{absolute:true,oldKey:'szu-yuehai-clockwise-v3',thresholds:[.936,1.08,1.22]}),
  enduranceCourse()""")
js('function joinTrack(sections) {','function joinTrack(sections, starts) {')
js('''    for(let j=0;j<=count;j++) positions.push(at(part,mix(from,end,j/count)));''',
   '''    starts?.push(positions.length);
    for(let j=0;j<=count;j++) positions.push(at(part,mix(from,end,j/count)));''')
js('''    const width=nearestStreet(frame.p[0],frame.p[2]).street.width;''',
   '''    const width=timingRoadWidth(frame.p,options.cityAccess,path.width);''')
js('''    thresholds:options.thresholds??[.93,1.04,1.22]};''',
   '''    thresholds:options.thresholds??[.93,1.04,1.22],cityAccess:options.cityAccess??false};''')
js('''  [path, {name:name || '东侧联络路', shoulder:i < openStreets.length ? 2.45 : .67}]));''',
   '''  [path, {name:name || '东侧联络路', width:path.width, shoulder:i < openStreets.length ? 2.8 : .68}]));''')
js('function makeCourse(id,name,description,path,spec,finish,options={}) {',
   '''function timingRoadWidth([x,,z],cityAccess,fallback) {
  const hit=nearestStreet(x,z);
  const publicRoad=cityAccess&&cityStreetAt(x,z);
  if(publicRoad && (!hit.street || hit.distance>hit.street.width+.21)) return Math.min(7,publicRoad.width);
  return hit.street?.width??fallback;
}

function makeCourse(id,name,description,path,spec,finish,options={}) {''')
js('''    const {street} = nearestStreet(frame.p[0], frame.p[2]);
    return {...frame, distance, half:(street?.width ?? event.path.width) + .34};''',
   '''    return {...frame, distance, half:timingRoadWidth(frame.p,event.cityAccess,event.path.width)+.34};''')
js('''        if (!rideableCut(start, end, direct)) continue;''',
   '''        if (!rideableCut(start,end,direct,event.cityAccess)) continue;''')
js('''function rideableCut(start, end, distance) {''',
   '''function rideableCut(start,end,distance,cityAccess=false) {''')
js('''    if (!safeToRide(x, z)) return false;
    if (surfaceAt(x, z)) consecutiveVerge = 0;''',
   '''    if (!safeToRide(x,z,cityAccess)) return false;
    if (surfaceAt(x,z,cityAccess)) consecutiveVerge = 0;''')
js('''function surfaceAt(x,z,exploring=false) {
  const hit=nearestStreet(x,z);
  return Boolean(hit.street && hit.distance<=hit.street.width+.21 || exploring && cityStreetAt(x,z));
}''',surfaces + '''

function surfaceAt(x,z,exploring=false) {
  const hit=nearestStreet(x,z);
  return Boolean(hit.street&&hit.distance<=hit.street.width+.21 || pavedGroundAt(x,z) ||
    exploring&&!groundSurfaces&&cityStreetAt(x,z));
}''')
js("  stadiumBand(pavement,lot,w-6.06,d-6.06,(w-6.06)/2,.036,'#709353');",
   "  lawnPatch(pavement,()=>stadiumBand(pavement,lot,w-6.06,d-6.06,(w-6.06)/2,.036,'#709353'));")
js("    lotBox(lot,s*4.85,.042,0,5.58,.036,3.31,'#80965e',pavement);",
   "    lawnPatch(pavement,()=>lotBox(lot,s*4.85,.042,0,5.58,.036,3.31,'#80965e',pavement));")
js("      scenery.box([x,.019,z],[court.w-1.20,.035,court.d-1.18],'#819957');",
   "      lawnPatch(scenery,()=>scenery.box([x,.019,z],[court.w-1.20,.035,court.d-1.18],'#819957'));")
js("  scenery.ellipsoid(lotPoint(median,0,.025,0),[1.74,.105,4.02],'#849951',24,4,0,yaw);",
   "  lawnPatch(scenery,()=>scenery.ellipsoid(lotPoint(median,0,.025,0),[1.74,.105,4.02],'#849951',24,4,0,yaw));")
js('''  modelTraffic();
  canghaiGrounds();''','''  modelTraffic();
  canghaiGrounds();
  indexGroundSurfaces();
  for(const event of courses) event.cuts=buildCornerCuts(event);''')
js('''  event.corners = brakingCorners(event);
  event.cuts = buildCornerCuts(event);''','''  event.corners = brakingCorners(event);''')
js('''  start() {
    this.rider = makeCyclist(this.event,this.bike);''','''  start() {
    this.event.cuts??=buildCornerCuts(this.event);
    this.rider = makeCyclist(this.event,this.bike);''')
js('''function moveCyclist(rider,input,dt,exploring=false) {''',
   '''function moveCyclist(rider,input,dt,exploring=false,recovery=1) {''')
js('''  } else rider.energy=Math.min(1,rider.energy+dt*(paved?.052:.035));''',
   '''  } else rider.energy=Math.min(1,rider.energy+dt*recovery*(paved?.052:.035));''')
js('''    const previous = moveCyclist(this.rider, input, PHYSICS_STEP, this.phase === 'free');''',
   '''    const racing=this.phase==='race';
    const previous=moveCyclist(this.rider,input,PHYSICS_STEP,this.phase==='free'||this.event.cityAccess,
      racing ? this.event.sprintRecovery : 1);''')

js('''function courseDecor(gpu,event) {
  const paint=new Shape(),arches=new Shape(),decals=[];
  for(let d=5.5;d<event.length-3;d+=6.65) {''',
   '''function courseDecor(gpu,event,stage) {
  const paint=new Shape(),arches=new Shape(),decals=[];
  const from=stage?.from??0, to=Math.min(event.length,(stage?.to??event.length)+12);
  for(let d=Math.max(5.5,from);d<Math.min(event.length-3,to);d+=6.65) {''')
js("tip,bend?'#f2b35e':'#dcec9f');", "tip,bend?'#f2b35e':stage?.color??'#dcec9f');")
js('''  for(const gate of event.gates) trackBanner(gate,arches,decals,event.gates.length);''',
   '''  for(const gate of event.gates) {
    if(gate.distance>=from && gate.distance<=to) trackBanner(gate,arches,decals,event.gates.length);
  }''')
js('''meshCells(gpu, [brakingPaint(event)])''', '''meshCells(gpu, [brakingPaint(event,from,to)])''')
js("const tone = terminal ? '#e9eabb' : '#d3e894';","const tone = gate.color ?? (terminal ? '#e9eabb' : '#d3e894');")
js("const color = terminal ? '#e9eabb' : '#cddd97';","const color = gate.color ?? (terminal ? '#e9eabb' : '#cddd97');")
js('function brakingPaint(event) {','function brakingPaint(event,from=0,to=event.length) {')
js('''  for (let d = 1.6; d < event.length - 1.8; d += 2.28) {''',
   '''  for (let d=Math.max(1.6,from); d<Math.min(event.length-1.8,to); d+=2.28) {''')
js('''      if (!routeMeshes.has(race.event)) routeMeshes.set(race.event, courseDecor(gpu, race.event));
      const decorations = routeMeshes.get(race.event);''',
   '''      const leg=activeStage(race.event,race.nextGate), key=leg??race.event;
      if (!routeMeshes.has(key)) routeMeshes.set(key,courseDecor(gpu,race.event,leg));
      const decorations=routeMeshes.get(key);''')

js('''  sector(index) {
    const end = this.splits[index];
    if (end === undefined) return null;
    const duration = end - (this.splits[index - 1] ?? 0);
    const target = this.reference.splits[index] - (this.reference.splits[index - 1] ?? 0);
    return {duration, delta:duration - target, name:index === 0 ? '起步' : this.event.gates[index].name};
  }''',
   '''  sector(index,from=index-1,name=index===0?'起步':this.event.gates[index]?.name) {
    const end = this.splits[index];
    if (end === undefined) return null;
    const duration = end - (this.splits[from] ?? 0);
    const target = this.reference.splits[index] - (this.reference.splits[from] ?? 0);
    return {duration,delta:duration-target,name};
  }

  stageSector(stage) {
    return this.sector(stage.finishGate,stage.index?stage.startGate:-1,stage.name);
  }''')

js('''  ctx.strokeStyle = compact ? '#d6e697' : '#edeeac';
  ctx.lineWidth = compact ? 1.55 : 2.98;
  ctx.stroke();''',
   '''  ctx.lineWidth = compact ? 1.55 : 2.98;
  if(event.stages) {
    for(const stage of event.stages) {
      const points=[along(event.path,stage.from),...event.path.rows
        .filter(row=>row.distance>stage.from&&row.distance<stage.to).map(row=>row.p),along(event.path,stage.to)];
      mapPath(ctx,project,points);
      ctx.strokeStyle=stage.color;
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = compact ? '#d6e697' : '#edeeac';
    ctx.stroke();
  }''')
js('for (let d = 13; d < event.length-7; d += 33)', 'for (let d = 13; d < event.length-7; d += event.stages?79:33)')
js(''' : mapExtent;
  const w=bounds.maxX-bounds.minX,h=bounds.maxZ-bounds.minZ;''',
   ''' : !exploring&&event.cityAccess ? {
    minX:Math.min(mapExtent.minX,event.extent.minX-22),maxX:Math.max(mapExtent.maxX,event.extent.maxX+22),
    minZ:Math.min(mapExtent.minZ,event.extent.minZ-22),maxZ:Math.max(mapExtent.maxZ,event.extent.maxZ+22)
  } : mapExtent;
  const w=bounds.maxX-bounds.minX,h=bounds.maxZ-bounds.minZ;''')

html('<span class="readout-title">计时赛</span>', '<span class="readout-title" id="timedTitle">计时赛</span>')
html('<div class="time-checkpoints"><span>检查点 <b', '<div class="time-checkpoints"><span><span id="progressLabel">检查点</span> <b')
js("'sceneHud','intro','timing','checkpointCount','dots'", "'sceneHud','intro','timing','timedTitle','progressLabel','checkpointCount','dots'")
js('''  const event=race.event, gates=event.gates, count=gates.length-2;''',
   '''  const event=race.event, gates=event.gates, count=event.stages?.length??gates.length-2;''')
js('''  setText(ui.courseFacts,event.name+' · '+Math.round(event.length)+' 游戏米');
  setText(ui.goldGoal,count+' 个检查点 · 金牌 '+timeLabel(event.medalTimes.gold));''',
   '''  const distance=event.stages?(event.length/1000).toFixed(2)+' 公里':Math.round(event.length)+' 游戏米';
  setText(ui.courseFacts,event.name+' · '+distance);
  setText(ui.goldGoal,count+(event.stages?' 个赛段':' 个检查点')+' · 金牌 '+timeLabel(event.medalTimes.gold));
  setText(ui.progressLabel,event.stages?'赛段':'检查点');''')
js('''  const sector = race.sector(race.splits.length - 1);
  ui.sectorFeedback.hidden = !sector || race.splits.length < 2;''',
   '''  const stageIndex=track.stages?.findIndex(stage=>race.nextGate<=stage.finishGate);
  const completed=track.stages?.[stageIndex<0?track.stages.length-1:stageIndex-1];
  const sector=track.stages?(completed?race.stageSector(completed):null):race.sector(race.splits.length-1);
  ui.sectorFeedback.hidden = !sector || race.splits.length < 2;''')
js('''  const sectors = race.splits.map((_split, i) => race.sector(i));''',
   '''  const sectors=race.event.stages ? race.event.stages.map(stage=>race.stageSector(stage)) :
    race.splits.map((_split,i)=>race.sector(i));''')
js('''  const event=race.event,gates=event.gates,checkpointCount=gates.length-2;''',
   '''  const event=race.event,gates=event.gates,checkpointCount=gates.length-2;
  const leg=trial?activeStage(event,race.nextGate):null;''')
js("    setText(ui.startTrial,race.phase === 'done' ? '再跑一次' : trial ? '重新开始' : '开始计时赛');",
   "    setText(ui.startTrial,race.phase==='done'?'再跑一次':trial?'重新开始':event.stages?'开始耐力赛':'开始计时赛');")
js('''    setText(ui.checkpointCount,passed + ' / ' + checkpointCount);
    dotLights.forEach((dot,i) => { dot.classList.toggle('passed',i < passed); });''',
   '''    const stages=event.stages, completed=stages?stages.filter(s=>s.finishGate<race.nextGate).length:passed;
    setText(ui.checkpointCount,completed+' / '+(stages?.length??checkpointCount));
    dotLights.forEach((dot,i) => { dot.classList.toggle('passed',i < completed); });''')
js("  const outside = !trial && !inCampus(x,z) ? cityStreetAt(x,z) : null;",
   "  const outside = (!trial||event.cityAccess) && !inCampus(x,z) ? cityStreetAt(x,z) : null;")
js('''  const current = gates[race.nextGate];
  ui.next.hidden''',
   '''  const routeProgress=leg&&race.phase==='race'?race.progressEstimate:0;
  const remaining=race.phase==='done'?0:Math.max(0,event.length-routeProgress);
  const remainingLabel=remaining>=1000?(remaining/1000).toFixed(2)+' 公里':Math.ceil(remaining)+' 米';
  setText(ui.timedTitle,leg?'耐力赛 · 余 '+remainingLabel:'计时赛');
  const current = gates[race.nextGate];
  ui.next.hidden''')
js('''    const remains = Math.round(Math.hypot(current.p[0] - race.rider.position[0],current.p[2] - race.rider.position[2]));
    const label = current.index === 0 ? '起点' : current.index === gates.length-1 ? '终点' : '下一站';
    setText(ui.next,label + ' · ' + current.name + ' · ' + remains + ' 米');
    setText(ui.mapNext,label + ' ' + current.name);''',
   '''    const remains=leg?Math.max(0,Math.round(current.distance-routeProgress)):
      Math.round(Math.hypot(current.p[0]-race.rider.position[0],current.p[2]-race.rider.position[2]));
    const label=current.index===0?'起点':current.index===gates.length-1?'终点':'下一站';
    const heading=leg?leg.name+' · '+current.name:label+' · '+current.name;
    setText(ui.next,heading+' · '+remains+' 米');
    setText(ui.mapNext,heading);''')

(here / 'game.js').write_text(script, encoding='utf-8', newline='\n')
(here / 'szu-litchi-loop.html').write_text(markup+'<script>\n'+script+'</script>'+tail,
                                         encoding='utf-8', newline='\n')
