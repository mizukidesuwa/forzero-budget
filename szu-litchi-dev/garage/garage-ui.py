html('''  .bike-shop-button { color:#e4f0cb; }''',
     '''  .bike-shop-button { color:#e4f0cb; }
  .setting-line input[type="text"] { width:100%; min-height:39px; padding:0 8px; color:var(--ink); background:#2e4334; border:1px solid #dceac638; border-radius:8px; font:inherit; font-size:.9rem; }
  .chair-cheer { color:#203626; background:#eef4d4; border-color:#d8e6b1; font-weight:650; }
  .chair-cheer::before { display:none; }
  .stage[data-vehicle]:not([data-vehicle="bike"]) [data-drive="sprint"] { display:none; }''')
html('aria-controls="settingsDialog">改装</button>','aria-controls="settingsDialog">车库</button>')
html('在深圳大学操控狼骑过湖畔、教学楼与林荫路，挑战四条校园计时赛道。',
     '骑行深圳大学粤海校区，挑战五条校内外计时赛路线。')
html('''      <div class="rider-tag" id="riderTag" hidden>狼</div>''',
     '''      <div class="rider-tag" id="riderTag" hidden>狼</div>
      <div class="rider-tag chair-cheer" id="chairCheer" hidden></div>''')
html('检查点和狼的位置','检查点和骑手位置')
html('''      <div id="displaySettings">''',
     '''      <div id="displaySettings">
      <div class="setting-line"><label for="driverName">骑手姓名</label>
        <input id="driverName" type="text" maxlength="24" value="狼" autocomplete="off" placeholder="狼">
      </div>''')
html('''        <p class="bike-note" id="bikeLock" hidden>本局配件已锁定，完赛或退出后可更换。</p>''',
     '''        <p class="bike-note" id="bikeLock" hidden>完赛或退出后可更换载具与配件。</p>
        <div class="setting-line"><label for="vehiclePicker">载具</label><select id="vehiclePicker"></select></div>
        <p class="bike-note" id="vehicleNote" hidden></p>
        <div id="bikeParts">
        <div class="setting-line"><label for="bikePaint">涂装</label><select id="bikePaint"></select></div>''')
html('''        </dl>
      </div>
      <footer class="settings-actions">''',
     '''        </dl>
        </div>
      </div>
      <footer class="settings-actions">''')
html('<span class="keys discard"><kbd>Shift</kbd> 冲刺 <kbd>Esc</kbd> 设置</span>',
     '<span class="keys discard"><span id="sprintKeys"><kbd>Shift</kbd> 冲刺 </span><kbd>Esc</kbd> 设置</span>')

js('''const race=new TimeTrial(courses[0],savedBike());''',
   '''const driverProfile=readDriverProfile();
const race=new TimeTrial(courses[0],savedBike(),driverProfile.vehicle);''')
js("'riderTag','gateTag','next'","'riderTag','chairCheer','sprintKeys','gateTag','next'")
js("'bikeButton','bikeSettings','displaySettings','bikeLock','bikeTyres','bikeGears','tyreNote','gearNote',",
   "'bikeButton','bikeSettings','displaySettings','driverName','bikeLock','vehiclePicker','vehicleNote',\n"
   "  'bikeParts','bikePaint','bikeTyres','bikeGears','tyreNote','gearNote',")
js("ctx.fillText('狼',x + 10,y + 1);", "ctx.fillText(driverProfile.name,x+10,y+1);")
js("ctx.strokeText('狼',x + 10,y + 1);", "ctx.strokeText(driverProfile.name,x+10,y+1);")
js("timeLabel(event.medalTimes.gold)", "timeLabel(race.medalTimes.gold)")
js("    setText(ui.mapLegend,trial ? '橙色是狼，青色是影子' : '橙色是狼');", "")
js('''  const event=race.event,gates=event.gates,checkpointCount=gates.length-2;
  const leg=trial?activeStage(event,race.nextGate):null;''',
   '''  const event=race.event,gates=event.gates,checkpointCount=gates.length-2;
  const leg=trial?activeStage(event,race.nextGate):null;
  const actor=race.rider.vehicle, bicycle=actor==='bike';
  if(stage.dataset.vehicle!==actor) stage.dataset.vehicle=actor;
  ui.sprintKeys.hidden=ui.sprintMeter.hidden=!bicycle;
  setText(ui.riderTag,driverProfile.name);
  setText(ui.mapLegend,'橙色是'+driverProfile.name+(trial?'，青色是影子':''));''')
js("event.stages?'开始耐力赛':'开始计时赛');",
   "race.vehicle==='trail'?'用自行车参赛':event.stages?'开始耐力赛':'开始计时赛');")
js("  setText(ui.sprintHint,race.rider.sprinting?'冲刺中':'冲刺耐力');",
   """  const vehicleLabel=actor==='ebike'?'新国标 · 25 km/h':
    actor==='chair'?'电动轮椅 · 10 km/h':'越野小摩托';
  setText(ui.sprintHint,bicycle?(race.rider.sprinting?'冲刺中':'冲刺耐力'):vehicleLabel);""")
js("  const advised = corner ? Math.min(race.bike.roadSpeed, plannedSpeed(track, progress + 4.7)*race.bike.cornerPace) : race.bike.sprintSpeed;",
   """  const drive=race.rider.vehicle==='bike'?race.bike:vehicleChoices[race.rider.vehicle];
  const advised=corner?Math.min(drive.roadSpeed,plannedSpeed(track,progress+4.7)*(drive.cornerPace??1)):
    drive.sprintSpeed??drive.roadSpeed;""")
js('medalName(event,race.elapsed)', 'medalName(event,race.elapsed,race.rider.vehicle)')
js('''  race.freeRide();
  zoomMap = false;''',
   '''  race.freeRide();
  rebuildCourseHud();
  zoomMap = false;''')

js('''function showBikeSetup() {
  const bike = race.bike;
  const locked = race.phase === 'count' || race.phase === 'race';''',
   '''function showBikeSetup() {
  const bike=race.bike, vehicle=race.rider.vehicle, spec=vehicleChoices[vehicle];
  const locked=race.phase==='count'||race.phase==='race', bicycle=vehicle==='bike';
  ui.vehiclePicker.value=vehicle;
  ui.vehiclePicker.disabled=locked;
  ui.bikeParts.hidden=!bicycle;
  ui.vehicleNote.hidden=bicycle;
  ui.bikePaint.value=driverProfile.paint;
  ui.bikePaint.disabled=locked||!bicycle;
  if(!bicycle) setText(ui.vehicleNote,
    Math.round(spec.roadSpeed*3.6)+' km/h · 草地 '+Math.round(spec.grassSpeed*3.6)+' km/h · '+
    (spec.race?'独立计时成绩':'自由骑行'));
''')
js("  ui.bikeTyres.disabled = ui.bikeGears.disabled = locked;",
   "  ui.bikeTyres.disabled=ui.bikeGears.disabled=locked||!bicycle;")
js('''  if (!race.setBike(buildBike(ui.bikeTyres.value, ui.bikeGears.value))) return;''',
   '''  if(race.rider.vehicle!=='bike'||!race.setBike(buildBike(ui.bikeTyres.value,ui.bikeGears.value))) return;''')
js("setText(ui.settingsTitle,garage ? '自行车改装' : '设置');",
   "setText(ui.settingsTitle,garage?'车库':'设置');")
js('''  if (garage) showBikeSetup();
  updateSettingsActions();''',
   '''  if(garage) showBikeSetup();
  else ui.driverName.value=driverProfile.name;
  updateSettingsActions();''')
js('''function closeSettings() {
  if(!settingsOpen) return;''',
   '''function commitDriverName() {
  const name=riderName(ui.driverName.value);
  ui.driverName.value=name;
  if(driverProfile.name===name) return;
  driverProfile.name=name;
  storeDriverProfile(driverProfile);
  updateHud();
}

function closeSettings() {
  if(!settingsOpen) return;
  if(!ui.displaySettings.hidden) commitDriverName();''')
js('''function initSettings() {
  fillPreferences();''',
   '''function initSettings() {
  fillPreferences();
  ui.driverName.value=driverProfile.name;
  for(const [choices,select] of [[vehicleChoices,ui.vehiclePicker],[bicyclePaints,ui.bikePaint]]) {
    for(const [value,choice] of Object.entries(choices)) {
      const option=document.createElement('option');
      option.value=value;
      option.textContent=choice.name;
      select.appendChild(option);
    }
  }
  ui.driverName.addEventListener('change',commitDriverName);
  ui.vehiclePicker.addEventListener('change',()=>{
    const choice=ui.vehiclePicker.value;
    if(!race.setVehicle(choice)) {showBikeSetup();return;}
    driverProfile.vehicle=choice;
    storeDriverProfile(driverProfile);
    showBikeSetup();
    rebuildCourseHud();
    updateHud();
    updateSettingsActions();
  });
  ui.bikePaint.addEventListener('change',()=>{
    if(race.rider.vehicle!=='bike'||race.phase==='race'||race.phase==='count') {showBikeSetup();return;}
    driverProfile.paint=knownPaint(ui.bikePaint.value);
    storeDriverProfile(driverProfile);
    showBikeSetup();
  });''')

js('''  const ghostLimbs=new gpu.Mesh(new Shape(),0,null,true);
  const cars=new Map();''',
   '''  const ghostLimbs=new gpu.Mesh(new Shape(),0,null,true);
  const motorRigs=new Map(), paintMeshes=new Map([['classic',{frame,fork}]]);
  const getRig=kind=>{
    if(!motorRigs.has(kind)) motorRigs.set(kind,uploadPoweredRig(gpu,kind));
    return motorRigs.get(kind);
  };
  const getPaint=kind=>{
    if(!paintMeshes.has(kind)) {
      const paint=makeRider(kind);
      paintMeshes.set(kind,{frame:new gpu.Mesh(paint.frame),fork:new gpu.Mesh(paint.steering)});
    }
    return paintMeshes.get(kind);
  };
  const cheer=chairCheerClock();
  const cars=new Map();''')
js('''    const turn=-.253*ghost.steering;''',
   '''    const kind=race.rider.vehicle;
    if(kind!=='bike') {
      const lean=kind==='chair'?0:ghost.steering*clamp(Math.abs(ghost.speed)*.026,0,.216);
      return poweredPose(getRig(kind),placement(add(ghost.position,[0,.006,0]),lean,-ghost.heading),ghost);
    }
    const turn=-.253*ghost.steering;''')
js('''    const angle = -.253 * rider.steering;
    if (!parts || travel !== rider.travel || steering !== angle) {
      facing = placement(model.pivot,0,angle,0);
      bow = multiply(facing,placement(scale(model.pivot,-1)));
      parts = movingParts(rider.travel,bow);
      limbs.update(parts.shape);
      travel = rider.travel; steering = angle;
    }
    const wheel = -rider.travel/TYRE_RADIUS;
    const lean=rider.lean;
    const root = placement(add(p,[0,.004,0]),lean,-rider.heading);
    const riderMeshes = [
      [frame,root],[wheels,multiply(root,placement(REAR,0,0,wheel))],
      [wheels,multiply(root,placement(transform(bow,FRONT),0,angle,wheel))],
      [fork,multiply(root,facing)],[body,multiply(root,placement([0,parts.bob,0]))],[limbs,root]
    ];''',
   '''    const root=placement(add(p,[0,.004,0]),rider.lean,-rider.heading);
    let riderMeshes,tagHeight=1.88;
    if(rider.vehicle==='bike') {
      const angle=-.253*rider.steering;
      if(!parts||travel!==rider.travel||steering!==angle) {
        facing=placement(model.pivot,0,angle,0);
        bow=multiply(facing,placement(scale(model.pivot,-1)));
        parts=movingParts(rider.travel,bow);
        limbs.update(parts.shape);
        travel=rider.travel;
        steering=angle;
      }
      const wheel=-rider.travel/TYRE_RADIUS, paint=getPaint(driverProfile.paint);
      riderMeshes=[
        [paint.frame,root],[wheels,multiply(root,placement(REAR,0,0,wheel))],
        [wheels,multiply(root,placement(transform(bow,FRONT),0,angle,wheel))],
        [paint.fork,multiply(root,facing)],[body,multiply(root,placement([0,parts.bob,0]))],[limbs,root]
      ];
    } else {
      const rig=getRig(rider.vehicle);
      riderMeshes=poweredPose(rig,root,rider);
      tagHeight=rig.tagHeight;
    }''')
js('''    projectTag(ui.riderTag,previousCamera,transform(root,[-.08,1.88,0]),width,height);''',
   '''    projectTag(ui.riderTag,previousCamera,transform(root,[-.08,tagHeight,0]),width,height);
    const remark=cheer(dt,rider.vehicle==='chair'&&rider.speed>1.1&&!settingsOpen&&!race.paused);
    if(remark) {
      setText(ui.chairCheer,remark);
      projectTag(ui.chairCheer,previousCamera,transform(root,[-.08,tagHeight+.31,0]),width,height);
    } else ui.chairCheer.hidden=true;''')
