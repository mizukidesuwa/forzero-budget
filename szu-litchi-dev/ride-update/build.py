from pathlib import Path


here = Path(__file__).resolve().parent
source = (here.parent / 'london' / 'szu-litchi-loop.html').read_text(encoding='utf-8')
head, body = source.split('<script>\n', 1)
game, tail = body.rsplit('</script>', 1)


def replace_once(source, old, new):
    if source.count(old) != 1:
        raise ValueError(f'Expected one anchor for {old[:90]!r}')
    return source.replace(old, new, 1)


def js(old, new):
    global game
    game = replace_once(game, old, new)


def html(old, new):
    global head
    head = replace_once(head, old, new)


def content(name):
    return (here / name).read_text(encoding='utf-8').rstrip()


def js_span(first, following, replacement):
    start = game.index(first)
    end = game.index(following, start)
    js(game[start:end], replacement)


js("      ...bridge.parts,\n      check(section(nanhaiSouth", """      ...bridge.parts
    ]},
    {name:'双湖内环',color:'#97dbea',parts:[
      check(section(nanhaiSouth""")
js("[-95,19.5],'立德门')\n    ]},\n    {name:'双湖内环',color:'#97dbea',parts:[",
   "[-95,19.5],'立德门'),")
js('flyover:true,revision:6','flyover:true,revision:7')
js('汇文发车，上深南立交，落桥后从西侧折返接南海大道，经双湖和白石路进入南区，再从立心门回校冲线。',
   '深南立交单独计段：桥面长直道适合高齿比，西侧折返可走内线或外侧晚切，出弯后到并线点结算。随后经双湖、白石路和立心门回校。')
start = game.index('const MAX_ROAD_SPEED=')
end = game.index('const REJOIN_MS=', start)
js(game[start:end], content('bike.js')+'\n\n')
js("trail:{name:'越野小摩托', race:false, roadSpeed:48/3.6, grassSpeed:34/3.6,\n    force:1.24, roadGrip:12.5, grassGrip:10.35, rolling:1.02}",
   """trail:{name:'越野小摩托',race:true,roadSpeed:63/3.6,grassSpeed:39/3.6,
     force:1.28,roadGrip:13.15,grassGrip:11.70,rolling:1.02,grassRolling:1.54,grassSlowdown:3.90}""")
js("ebike:{name:'电动自行车 · 新国标', race:true, roadSpeed:25/3.6, grassSpeed:13/3.6,\n    force:.66, roadGrip:9.35, grassGrip:5.38, rolling:1.12, recordLimit:21*60000, recordInterval:185},",
   """ebike:{name:'电动自行车 · 新国标',race:true,roadSpeed:48/3.6,grassSpeed:28/3.6,
    force:1.08,roadGrip:11.4,grassGrip:7.8,rolling:1.04,recordLimit:12*60000,recordInterval:95},""")
js("chair:{name:'电动轮椅', race:true, roadSpeed:10/3.6, grassSpeed:5/3.6,\n    force:.43, roadGrip:7.55, grassGrip:3.8, rolling:1.3, recordLimit:38*60000, recordInterval:300},",
   """chair:{name:'电动轮椅',race:true,roadSpeed:36/3.6,grassSpeed:22/3.6,
    force:.96,roadGrip:10.4,grassGrip:7.4,rolling:1.06,recordLimit:15*60000,recordInterval:110},""")
js('  const drag=(.48+Math.abs(rider.speed)*.047)*(paved?bike.rolling:2.85);',
   '  const drag=(.48+Math.abs(rider.speed)*.047)*(paved?bike.rolling:bike.grassRolling??2.85);')
js('rider.brake*9.3+drag+hillAcceleration', 'rider.brake*9.3*(bike.brakePower??1)+drag+hillAcceleration')
js('    const force=rider.throttle*(rider.sprinting?7.64:paved?5.28:3.40)*bike.force;', '''    const fast=clamp((rider.speed/Math.max(1,limit)-.42)/.56,0,1);
    const gearing=cycling?mix(bike.force,bike.highForce,fast):bike.force;
    const groundForce=paved?5.28:cycling?4.08:3.40;
    const force=rider.throttle*(rider.sprinting?7.64:groundForce)*gearing;''')
js('rider.speed-dt*(paved?3.75:8.85)', 'rider.speed-dt*(paved?3.75:bike.grassSlowdown??8.85)')
js('  const steeringRate = steer === 0 ? mix(20, 17.5, speedFactor) : mix(14, 10, speedFactor);', '''  const trail=vehicle==='trail';
  const steeringRate=steer===0?mix(trail?23:20,17.5,speedFactor):
    mix(trail?17:cycling?15.2:14,trail?9.6:10,speedFactor);''')
js('  const wanted = rider.steering * low * mix(1.75, 1.35, speedFactor);',
   '  const wanted = rider.steering * low * mix(trail?1.88:1.75,trail?1.19:1.35,speedFactor);')
js('  const grip=(paved?bike.roadGrip:bike.grassGrip)*(1-.145*rider.brake);',
   '  const grip=(paved?bike.roadGrip:bike.grassGrip)*(1-(bike.brakeTurnLoss??.145)*rider.brake);')
js("trial?'重新开始':race.vehicle==='trail'?'用自行车参赛':event.stages?", "trial?'重新开始':event.stages?")
js('  const interval=recordingRules(vehicle).interval;\n  let distance=-5.2',
   "  const interval=recordingRules(vehicle).interval;\n  const cornerPace=vehicle==='trail'?Math.sqrt(tuning.roadGrip/stockBike.roadGrip):1;\n  let distance=-5.2")
js('plannedSpeed(event,distance+1.2)*.96+.22', 'plannedSpeed(event,distance+1.2)*.96*cornerPace+.22')
js("  const key=event.campus==='ucl'?", "  const key=event.seed?'seed-race:'+event.seed:event.campus==='ucl'?")
js('  const point=(u,y,v=0)=>[block.x+c*u+s*(depth/2+v-inset),y,block.z-s*u+c*(depth/2+v-inset)];', '''  // Separate close facade layers so the depth buffer can resolve them at oblique angles.
  const point=(u,y,v=0)=>{
    const lift=v>0?v+.10*v/(v+.12):v;
    const outward=depth/2+lift-inset;
    return [block.x+c*u+s*outward,y,block.z-s*u+c*outward];
  };''')
js('perspective(fov,aspect,.205,1350)', 'perspective(fov,aspect,.56,1200)')
marker = "const athleticsField = campusFootprint(205,-102,23,37,-.36);"
js(marker,marker+'\n\n'+content('yuehai-setbacks.js'))
js("at:geo(22.532839,113.937775),w:17.4,depth:13.8", "at:geo(22.532839,113.937775),roadSetback:2,w:14.8,depth:8")
js('].map(({at,...b})=>({...campusFootprint(at[0],at[1],b.w,b.depth),...b}));',
   '].map(({at,roadSetback=0,...b})=>({...campusFootprint(at[0],at[1]-roadSetback,b.w,b.depth),...b}));')
js("at:geo(22.529596,113.934016), w:20, depth:11", "at:geo(22.529596,113.934016), roadSetback:2.04, w:17.2, depth:10.2")
js('  const lot={...campusFootprint(at[0],at[1],block.w,block.depth),...block};', '''  const {roadSetback=0,...details}=block;
  const lot={...campusFootprint(at[0]+roadSetback,at[1],block.w,block.depth),...details};''')
js('const campus = [...originalCampus,...documentedBlocks,...featuredCampus,...canghaiBuildings];', '''const campus = [
  ...originalCampus.filter(block=>block.name||clearCampusLand(block)),
  ...documentedBlocks,...featuredCampus,...canghaiBuildings
];''')
js('  if (closeToBlock(block.x,block.z,athleticsField,Math.max(block.w,block.depth)*.60)) return false;',
   '  if (!clearCampusLand(block)) return false;')
js('  return roads.every(path=>path.rows.every(({p})=>!closeToBlock(p[0],p[2],block,path.width+.95)));', '  return true;')
js('  return [...cityRoads.values()].every(info=>info.path.rows.every(({p})=>{', '''  for(const gate of [...campusGates,...canghaiGates]) {
    const [gx,gz]=gate.xy;
    const reach=gate.name==='立德门'?32:23;
    const dx=Math.max(0,Math.abs(x-gx)-halfW),dz=Math.max(0,Math.abs(z-gz)-halfD);
    if(dx*dx+dz*dz<reach*reach) return false;
  }
  return [...cityRoads.values()].every(info=>info.path.rows.every(({p})=>{''')
js("  else if(gate.name==='立言门') liyanGate(gate);", "  else if(gate.name==='立言门') liyanGate(gate);\n  else if(gate.name==='立业门') newLiyemen(gate);")
js('function liyanGate(gate) {\n  const f=entranceFrame(gate),', '''function liyanGate(gate) {
  const [x,z]=gate.xy;
  const f=entranceFrame({...gate,xy:[x-1.12,z+2.19]}),''')
js("gateBooth(f,s*5.58,-.83,2.60,3.10", "gateBooth(f,s*6.64,-.83,2.60,3.10")
js("box(0,3.66,-.86,13.3,.41,3.47", "box(0,3.66,-.86,15.6,.41,3.47")
js("box(0,3.88,-.86,13.57,.14,3.67", "box(0,3.88,-.86,15.87,.14,3.67")
js('  gateBooth(f,side*10.13,4.30,2.45,2.22', '  gateBooth(f,side*10.62,5.96,2.45,2.22')
js("  solid(side*15.08,6.59,3.55,1.62,3.35);", "  solid(side*15.08,7.49,3.37,1.12,3.35);")
js('  const [x,z]=metroStop;\n  citySolid.push({x,z,w:10.7,d:4.9});', '''  const main=openStreets[1].path;
  const anchor=courseFrame(main,pointDistance(main,metroStop));
  const [x,,z]=offsetVertex(anchor,-(main.width+6.4),0);
  citySolid.push({x,z,w:10.7,d:4.9});''')
js('const pillar={x,z,w:2.10,d:2.18};','const pillar={x,z,w:2.10,d:2.18,kind:\'bridge-support\'};')
js('function deciduous(x, z, s, variant = 0) {', '''function deciduous(x, z, s, variant = 0, light = true) {
  if(activeCampus==='szu'&&protectedCampusGrounds.some(site=>closeToBlock(x,z,site,1.05))) return;''')
js('function palm(x, z, size) {', '''function palm(x, z, size, light = true) {
  if(activeCampus==='szu'&&protectedCampusGrounds.some(site=>closeToBlock(x,z,site,1.05))) return;''')
js("  const [x,z]=sportsCenter;\n  scenery.box([x,.035,z],[27,.06,29]", "  const {x,z,w,depth}=yuehaiSportsPlaza;\n  scenery.box([x,.035,z],[w,.06,depth]")
plaza_start=game.index("  scenery.box([x,.070,z],[22,.016,24]")
plaza_end=game.index("\n}",plaza_start)
js(game[plaza_start:plaza_end],content('tennis-courts.js'))
js("  const oval = (width,length,y) => Array.from({length:50},(_,i)=>", '''  mapPath(ctx,project,footprintCorners(yuehaiSportsPlaza),true);
  ctx.fillStyle=compact?'#a77963':'#b67656';ctx.fill();
  for(const offset of [-6.35,6.35]) {
    mapPath(ctx,project,footprintCorners(lotPart(yuehaiSportsPlaza,offset,0,10,21.5,0)),true);
    ctx.fillStyle=compact?'#52694e':'#80a196';ctx.fill();
  }
  const oval = (width,length,y) => Array.from({length:50},(_,i)=>''')
js('    if(gate.distance>=from && gate.distance<=to) trackBanner(gate,arches,decals,event.gates.length);', '''    if(gate.distance<from||gate.distance>to) continue;
    if(event.campus==='ucl') londonGateBanner(gate,arches,decals);
    else trackBanner(gate,arches,decals,event.gates.length);''')
js('  const braking=brakingPaint(event,from,to);', '''  for(const cut of event.londonLines??[]) {
    if(cut.from<from-2||cut.to>to) continue;
    for(let d=1.4;d<cut.path.length-1.2;d+=2.1) {
      ribbon(arches,cut.path,-.105,.105,ROAD_Y+.046,'#e9ba72',d,Math.min(d+1.05,cut.path.length-.8));
    }
  }
  const braking=brakingPaint(event,from,to);''')
js('[gate.p[0],6.04,gate.p[2]],gate.rise', "[gate.p[0],race.event.campus==='ucl'?4.36:6.04,gate.p[2]],gate.rise")
js('      if (!routeMeshes.has(key)) routeMeshes.set(key,courseDecor(gpu,race.event,leg));', '''      if(!routeMeshes.has(key)) {
        for(const [old,{arrows,braking}] of routeMeshes) {
          if(!old.seed||old===seedCourses[activeCampus]) continue;
          const meshes=new Set([...arrows,...braking].map(([mesh])=>mesh.owner??mesh));
          for(const mesh of meshes) mesh.dispose();
          routeMeshes.delete(old);
        }
        routeMeshes.set(key,courseDecor(gpu,race.event,leg));
      }''')

js('const mapCache = new WeakMap();',
   content('seed-roads.js')+'\n\n'+content('seed-races.js')+'\n\nconst mapCache = new WeakMap();')
js("  'coursePicker','courseBrief','mapZoom'", """  'seedButton','seedDialog','seedForm','seedInput','seedCampus','seedStatus','seedRandom','seedClose',
  'weeklyCode','weeklyPlay','weeklyCopy','weeklyBoard','coursePicker','courseBrief','mapZoom'""")
js("  'bikeParts','bikePaint','bikeTyres','bikeGears','tyreNote','gearNote',\n  'bikeTopSpeed','bikeGrip','bikeAcceleration',", """  'bikeParts','bikePaint','bikeTyres','bikeGears','tyreNote','gearNote','bikeBrakes','brakeNote',
  'bikeTopSpeed','bikeGrip','bikeAcceleration','bikeGrass','bikeBrakePower','bikeBrakeGrip',""")
js('function initHud() {\n  ui.coursePicker.replaceChildren();', 'function populateCoursePicker() {\n  ui.coursePicker.replaceChildren();')
js('  for(const event of coursesByCampus[activeCampus]) {', '  for(const event of availableCourses(activeCampus)) {')
js('    group.appendChild(option);\n  }\n  rebuildCourseHud();\n}', '''    (event.seed?ui.coursePicker:group).appendChild(option);
  }
}

function initHud() {
  populateCoursePicker();
  rebuildCourseHud();
}''')
js('function initInput() {', content('seed-ui.js')+'''

function selectCourse(event) {
  courseByCampus[activeCampus]=event;
  clearInput();
  race.select(event);
  cameraRevision++;
  ui.mapPlace.hidden=true;
  rebuildCourseHud();
  updateHud();
  focusStage();
}

function initInput() {''')
js('const next=coursesByCampus[activeCampus].find(event=>event.id===ui.coursePicker.value);',
   'const next=availableCourses(activeCampus).find(event=>event.id===ui.coursePicker.value);')
js('    courseByCampus[activeCampus]=next;\n    clearInput();race.select(next);cameraRevision++;ui.mapPlace.hidden=true;rebuildCourseHud();updateHud();focusStage();',
   '    selectCourse(next);')
js("  window.addEventListener('keydown',event => {\n    if(event.code==='Escape'", "  window.addEventListener('keydown',event => {\n    if(ui.seedDialog.open) return;\n    if(event.code==='Escape'")
js('  initInput();\n  initSettings();', '  initInput();\n  initSeedDialog();\n  initSettings();')
js('    if (!settingsOpen&&!pendingCampus) {', '    if (!settingsOpen&&!pendingCampus&&!ui.seedDialog.open) {')
js("    ui.coursePicker.disabled=race.phase==='race'||race.phase==='count';",
   "    ui.seedButton.disabled=ui.coursePicker.disabled=race.phase==='race'||race.phase==='count';")
js('  ui.bikeGears.value = bike.gears;\n  ui.bikeTyres.disabled=ui.bikeGears.disabled=locked||!bicycle;', '''  ui.bikeGears.value = bike.gears;
  ui.bikeBrakes.value = bike.brakes;
  ui.bikeTyres.disabled=ui.bikeGears.disabled=ui.bikeBrakes.disabled=locked||!bicycle;''')
js('  setText(ui.gearNote, gearChoices[bike.gears].note);', '''  setText(ui.gearNote, gearChoices[bike.gears].note);
  setText(ui.brakeNote, brakeChoices[bike.brakes].note);
  setText(ui.bikeGrass,(bike.grassSpeed*3.6).toFixed(1)+' km/h');
  setText(ui.bikeBrakePower,Math.round(bike.brakePower*100)+'%');
  setText(ui.bikeBrakeGrip,Math.round(bike.roadGrip*(1-bike.brakeTurnLoss)/stockBike.roadGrip*100)+'%');''')
js('buildBike(ui.bikeTyres.value,ui.bikeGears.value)', 'buildBike(ui.bikeTyres.value,ui.bikeGears.value,ui.bikeBrakes.value)')
js('  const {tyres, gears} = race.bike;\n  try { localStorage.setItem(bikeKey, JSON.stringify({tyres, gears})); } catch {}',
   '  const {tyres,gears,brakes}=race.bike;\n  try { localStorage.setItem(bikeKey,JSON.stringify({tyres,gears,brakes})); } catch {}')
js("  ui.bikeGears.addEventListener('change',installBikeParts);", """  ui.bikeGears.addEventListener('change',installBikeParts);
  ui.bikeBrakes.addEventListener('change',installBikeParts);""")

html('<option value="traction">抓地胎</option>', '<option value="traction">越野胎</option>')
html('<option value="short">短齿比</option>', '<option value="short">短链 · 低齿比</option>')
html('        <p class="bike-note" id="gearNote"></p>', '''        <p class="bike-note" id="gearNote"></p>
        <div class="setting-line"><label for="bikeBrakes">刹车</label><select id="bikeBrakes">
          <option value="stock">均衡刹车</option><option value="control">渐进刹车</option><option value="power">强力刹车</option>
        </select></div>
        <p class="bike-note" id="brakeNote"></p>''')
html('          <div><dt>加速动力</dt><dd id="bikeAcceleration"></dd></div>', '''          <div><dt>低速推力</dt><dd id="bikeAcceleration"></dd></div>
          <div><dt>草地极速</dt><dd id="bikeGrass"></dd></div>
          <div><dt>直线制动</dt><dd id="bikeBrakePower"></dd></div>
          <div><dt>带刹抓地</dt><dd id="bikeBrakeGrip"></dd></div>''')
html('    </dialog>\n    <div class="touch"', '    </dialog>\n'+content('seed-dialog.html')+'\n    <div class="touch"')
html('      <button class="action primary" id="startTrial"', '''      <button class="action seed-button" id="seedButton" type="button" aria-haspopup="dialog">种子赛道</button>
      <button class="action primary" id="startTrial"''')
html('aria-haspopup="dialog">种子赛道</button>', 'aria-haspopup="dialog">每周挑战 / 种子</button>')
html('  .travel { color:#d6f0ed;', '''  .seed-button { white-space:nowrap; }
  .bar { flex-wrap:wrap; }
  .bar .actions { flex-wrap:wrap; max-width:100%; }
  .course-field label { white-space:nowrap; }
  .seed-actions { flex-wrap:wrap; }
  #seedTitle { margin:0 0 15px; font-size:1.15rem; }
  #seedStatus { margin:10px 0 0; min-height:2em; }
  .travel { color:#d6f0ed;''')

js_span('function notePublicMarkers(', 'function makeCourse(', '')
js_span('function projectLondonCourse(', 'function refineLondonRace(', '')
js('''  for(const event of courses) {
    event.cuts=buildCornerCuts(event);
    if(event.cityAccess) notePublicMarkers(event);
  }
''', '')
js_span('function shortcutProjection(', 'function buildCornerCuts(', '')
js_span('function matchCornerCut(', 'const MAX_ROAD_SPEED=', '')
js('  nextGate:libraryEvent.gates.findIndex(gate => gate.distance > libraryCutTo),\n', '')
js('cutEndpoint(libraryCutTo)], 2.85),\n  exitDirection:courseFrame(libraryRoute, libraryCutTo).f',
   'cutEndpoint(libraryCutTo)], 2.85)')
js('''  const cuts = event.gates.map(() => []);
  if (event.shortcut) cuts[event.shortcut.nextGate].push(event.shortcut);''', '  const cuts = [];')
js('''        const cut = {from, to, path:travelTable([start, end], 2.4), exitDirection:courseFrame(event.path, to).f};
        cuts[gateIndex].push(cut);
        if (crossesCheckpoint) cuts[gateIndex + 1].push(cut);''',
   '        cuts.push({from, to, path:travelTable([start, end], 2.4)});')
js('''  event.cuts=buildCornerCuts(event);
  const candidates=[...new Set(event.cuts.flat())]''', '  const candidates=buildCornerCuts(event)')

js('class TimeTrial {', content('route-progress.js')+'\n\n'+content('gameplay-170.js')+'\n\nclass TimeTrial {')
js('''  return readRecord(event,recordKey(event,vehicle),vehicle)??''',
   '''  return readRecord(event,checkpointRecordKey(event,vehicle),vehicle)??
    readRecord(event,recordKey(event,vehicle),vehicle)??''')
js('function loadBest(event,vehicle=', '''// Preserve previous records and use complete checkpoint runs as references.
const checkpointRecordKey = (event,vehicle) => 'checkpoints:'+recordKey(event,vehicle);

function loadBest(event,vehicle=''')
js('    const key=recordKey(this.event,entry);', '    const key=checkpointRecordKey(this.event,entry);')
js('    const key=recordKey(this.event,this.rider.vehicle);', '    const key=checkpointRecordKey(this.event,this.rider.vehicle);')
js_span('  get progressEstimate() {', '  setBike(bike) {',
        "  get progressEstimate() { return this.routeAnchor; }\n\n")
js('    this.event.cuts??=buildCornerCuts(this.event);\n    if(this.event.cityAccess&&!this.event.markers[0].publicRoads) notePublicMarkers(this.event);\n', '')
js('    this.routeMark = 0;\n    this.cornerCut = this.publicProgress = null;', '    this.routeAnchor = 0;')
js('    this.paused = this.record = this.offRoute = false;', '    this.paused = this.record = this.onGuide = false;')
js_span('  markCourse() {', '  measureCorner(', content('trial-progress.js')+'\n\n')
js('    if (this.offRoute || this.nextGate === 0) return;', '''    if (!this.onGuide || this.nextGate === 0) {
      this.cornerEntryAt = null;
      return;
    }''')
js('    this.cornerCut = this.publicProgress = null;\n    this.rider.speed = 0;', '    this.onGuide = false;\n    this.rider.speed = 0;')
js("    const exploring=activeCampus==='szu'&&(this.phase==='free'||this.event.cityAccess);",
   "    const exploring=activeCampus==='szu';")
js_span('    this.markCourse();\n    const event = this.event, gate = event.gates[this.nextGate];',
        '    this.elapsed += STEP_MS;', '''    this.markCourse();
    this.measureCorner(previous,speedBefore,this.routeAnchor);
    if (this.recordCheckpoint(previous)) return;
''')

js_span('  if(race.offRoute&&event.markers[race.routeMark]) {', '  mapPin(ctx,layout.project,race.rider,compact);', '')
js("  const cityView=activeCampus==='szu'&&exploring&&(compact?!inCampus(race.rider.position[0],race.rider.position[2]):!focused);",
   """  const outside = activeCampus==='szu'&&!inCampus(race.rider.position[0],race.rider.position[2]);
  const cityView=activeCampus==='szu'&&(exploring&&!compact&&!focused || outside&&(exploring||!event.cityAccess));""")
js("  const running = race.phase === 'race' && !race.paused && !race.offRoute;",
   "  const running = race.phase === 'race' && !race.paused && race.onGuide;")
js('  const progress = running && preferences.brakeLine && race.nextGate > 0 && !race.cornerCut ? race.progressEstimate : -1;',
   '  const progress = running && preferences.brakeLine && race.nextGate > 0 ? race.progressEstimate : -1;')
js("  ui.recover.hidden=race.phase!=='race'||race.paused||!race.offRoute;\n", '')
js('  const outside=!london&&(!trial||event.cityAccess)&&!inCampus(x,z)?cityStreetAt(x,z):null;',
   '  const outside=!london&&!inCampus(x,z)?cityStreetAt(x,z):null;')
js("  setText(ui.timedTitle,leg?timedName+' · 余 '+remainingLabel:timedName);",
   "  setText(ui.timedTitle,leg&&race.onGuide?timedName+' · 余 '+remainingLabel:timedName);")
js('    const remains=leg?Math.max(0,Math.round(current.distance-routeProgress)):',
   '    const remains=leg&&race.onGuide?Math.max(0,Math.round(current.distance-routeProgress)):')
js_span('    if (race.offRoute && race.event.markers[race.routeMark]) {',
        "  } else {\n    setText(ui.mapNext,race.phase==='done'", '')
js('''  if(!ready||!race.rejoin()) return;
  clearInput();cameraRevision++;priorTimestamp=performance.now();focusStage();updateHud();''', '''  if(!ready||!race.rejoin()) return;
  if(settingsOpen) closeSettings();
  clearInput();cameraRevision++;priorTimestamp=performance.now();focusStage();updateHud();''')
js('''    if(race.phase==='race'&&!race.offRoute&&race.nextGate>0) {
      const path = race.cornerCut?.cut.path ?? race.event.path;
      const distance = race.cornerCut?.distance ?? race.progressEstimate;
      const ahead = along(path, distance + 9.5 + Math.max(0, rider.speed) * .23);''',
   '''    if(race.phase==='race'&&race.onGuide&&race.nextGate>0) {
      const ahead = along(race.event.path, race.progressEstimate + 9.5 + Math.max(0, rider.speed) * .23);''')
js_span("    if (race.phase==='race' && race.offRoute && race.event.markers[race.routeMark]) {",
        "      setText(ui.gateTag,gate.index", '''    if (race.phase === 'race' && gate && length(subtract(p,gate.p)) < 96) {
''')
js("  ui.settingsExit.hidden=race.phase==='free';", "  ui.recover.hidden=race.phase!=='race';\n  ui.settingsExit.hidden=race.phase==='free';")

html('<button class="float-button recovery" id="recover" type="button" aria-keyshortcuts="F" hidden>回到赛道 · 加 2 秒</button>', '')
html('        <button class="action exit" id="settingsExit"', '''        <button class="action" id="recover" type="button" aria-keyshortcuts="F" hidden>回到赛道 · 加 2 秒</button>
        <button class="action exit" id="settingsExit"''')
html('  .recovery { position:absolute; z-index:2; bottom:69px; left:50%; transform:translateX(-50%); min-height:38px; color:#f4d7a7; }\n', '')
html('  @media (pointer:coarse) { .recovery { bottom:123px; } }\n', '')
html('    .recovery { bottom:186px; left:11px; transform:none; }\n', '')

js('const mapCache = new WeakMap();', content('friend-ghost.js')+'\n\n'+content('friend-store.js')+'\n\nconst mapCache = new WeakMap();')
js('''    if(!r||!Number.isFinite(r.time)||r.time<=4000||r.time>recordingRules(vehicle).limit||
      !Array.isArray(r.splits)||r.splits.length!==event.gates.length ||
      !r.splits.every((v,i)=>Number.isFinite(v)&&v>=0&&v<=r.time&&(i===0||v>r.splits[i-1]))||
      !Array.isArray(r.samples)||r.samples.length<2||r.samples.length>8200||
      !r.samples.every((a,i)=>Array.isArray(a)&&a.length===8&&a.every(Number.isFinite)&&a[0]>=0&&a[0]<=r.time+1&&(i===0||a[0]>r.samples[i-1][0]))) return null;''',
   '    if(!validReplay(r,event.gates.length)||r.time<=4000||r.time>recordingRules(vehicle).limit) return null;')
js('  const jump=Math.hypot(a[1]-b[1],a[3]-b[3])>18;',
   '''  const gap=Math.hypot(a[1]-b[1],a[3]-b[3]);
  const jump=gap>Math.max(18,(b[0]-a[0])*.05) || gap>1&&b[0]-a[0]>=REJOIN_MS-.01&&a[6]===b[6];''')
js('  select(event) {\n    this.event = event;', '  select(event,opponent=null) {\n    this.event = event;\n    this.opponent = opponent;')
js("  get entryVehicle() { return vehicleChoices[this.vehicle].race?this.vehicle:'bike'; }",
   "  get entryVehicle() { return this.opponent?.vehicle??(vehicleChoices[this.vehicle].race?this.vehicle:'bike'); }")
js("    if(this.phase==='race'||this.phase==='count'||!Object.hasOwn(vehicleChoices,vehicle)) return false;",
   "    if(this.opponent||this.phase==='race'||this.phase==='count'||!Object.hasOwn(vehicleChoices,vehicle)) return false;")
js('    this.nextRecording=this.recordRules.interval;',
   '    this.replayInterval=this.recordRules.interval;\n    this.nextRecording=this.replayInterval;')
js('''    if(this.rider.vehicle!==this.vehicle) {
      const {position,heading,paved}=this.rider;
      this.rider={...makeCyclist(this.event,this.bike,this.vehicle),position,heading,paved};''',
   '''    const vehicle=this.opponent?.vehicle??this.vehicle;
    if(this.rider.vehicle!==vehicle) {
      const {position,heading,paved}=this.rider;
      this.rider={...makeCyclist(this.event,this.bike,vehicle),position,heading,paved};''')
js('    this.reference=this.bestRun??run;', '    this.lastRun=null;\n    this.reference=this.opponent??this.bestRun??run;')
js('  finishAt(time) {', '''  saveReplayFrame(time) {
    const frame=packPose(time,this.rider);
    if (this.frames.at(-1)?.[0]===frame[0]) {
      this.frames[this.frames.length-1]=frame;
      return;
    }
    if (this.frames.length>=MAX_REPLAY_SAMPLES) {
      // Record long attempts within the same file and memory budget.
      this.frames=this.frames.filter((_sample,i)=>i%2===0||i===this.frames.length-1);
      this.replayInterval*=2;
    }
    this.frames.push(frame);
  }

  finishAt(time) {''')
js('''    this.record = (this.best === null || time < this.best) &&time<=this.recordRules.limit;
    if (!this.record) return;
    if (this.frames.at(-1)?.[0] >= time - .001) this.frames.pop();
    this.frames.push(packPose(time, this.rider));
    this.best = time;
    this.bestRun = {
      time, splits:this.splits.slice(), samples:this.frames.slice(), corners:this.cornerScores.slice(), kind:'个人最佳影子'
    };''', '''    this.saveReplayFrame(time);
    this.lastRun = {
      time,vehicle:this.rider.vehicle,splits:this.splits.slice(),samples:this.frames,corners:this.cornerScores.slice()
    };
    this.record = (this.best === null || time < this.best) &&time<=this.recordRules.limit;
    if (!this.record) return;
    this.best = time;
    this.bestRun = {...this.lastRun,kind:'个人最佳影子'};''')
js('''    if(this.elapsed>=this.nextRecording&&this.elapsed<=this.recordRules.limit) {
      this.frames.push(packPose(this.elapsed,this.rider));
      this.nextRecording=this.elapsed+this.recordRules.interval;
    }''', '''    if(this.elapsed>=this.nextRecording) {
      this.saveReplayFrame(this.elapsed);
      this.nextRecording=this.elapsed+this.replayInterval;
    }''')
js("  'seedButton','seedDialog','seedForm',", """  'friendButton','friendDialog','friendFile','friendDrop','friendStatus','friendClose','friendReady','friendExport','friendTag',
  'friendFilters','friendCampus','friendCourse','friendVehicle','friendBoardNote','friendScores','friendScoreTemplate',
  'seedButton','seedDialog','seedForm',""")
js('  if(!seedAvailable()||ui.seedDialog.open) return;', '  if(!seedAvailable()||ui.seedDialog.open||ui.friendDialog.open) return;')
js("    if(ui.seedDialog.open) return;", "    if(ui.seedDialog.open||ui.friendDialog.open) return;")
js('function selectCourse(event) {', content('friend-board.js')+'\n\n'+content('friend-ui.js')+'''

function selectCourse(event,opponent=null) {''')
js('  race.select(event);\n  cameraRevision++;', '  race.select(event,opponent);\n  cameraRevision++;')
js('  initSeedDialog();\n  initSettings();', '  initSeedDialog();\n  initFriendDuel();\n  initSettings();')
js('    if (!settingsOpen&&!pendingCampus&&!ui.seedDialog.open) {',
   '    if (!settingsOpen&&!pendingCampus&&!ui.seedDialog.open&&!ui.friendDialog.open) {')
js('  ui.startTrial.disabled = ui.freeRide.disabled = ui.pause.disabled = ui.travel.disabled = true;',
   '  ui.startTrial.disabled = ui.freeRide.disabled = ui.pause.disabled = ui.travel.disabled = ui.friendButton.disabled = true;')
js("    ui.seedButton.disabled=ui.coursePicker.disabled=race.phase==='race'||race.phase==='count';",
   "    ui.friendButton.disabled=ui.seedButton.disabled=ui.coursePicker.disabled=race.phase==='race'||race.phase==='count';")
js("  setText(ui.mapLegend,'橙色是'+driverProfile.name+(trial?'，青色是影子':''));",
   """  const opponent=race.opponent;
  setText(ui.mapLegend,'橙色是'+driverProfile.name+(trial?'，青色是'+(opponent?.kind??'影子'):''));
  ui.friendReady.hidden=trial||!opponent;
  if (!ui.friendReady.hidden) setText(ui.friendReady,opponent.kind+' · '+timeLabel(opponent.time)+' · '+
    vehicleChoices[opponent.vehicle].name+' · '+event.name);
  ui.friendExport.hidden=race.phase!=='done'||!race.lastRun;""")
js("    setText(ui.startTrial,race.phase==='done'?'再跑一次':trial?'重新开始':event.stages?'开始耐力赛':'开始计时赛');",
   "    setText(ui.startTrial,race.phase==='done'?'再跑一次':trial?'重新开始':opponent?'开始对战':event.stages?'开始耐力赛':'开始计时赛');")
js("  const timedName=london?(leg?'伦敦耐力赛':'伦敦特别赛'):(leg?'耐力赛':'计时赛');",
   "  const timedName=opponent?'友人对战':london?(leg?'伦敦耐力赛':'伦敦特别赛'):(leg?'耐力赛':'计时赛');")
js("    setText(ui.callDetail,[rank,record].filter(Boolean).join(' · '));",
   '''    const duel=opponent?friendResult(opponent,race.elapsed):'';
    setText(ui.callDetail,[duel,rank,record].filter(Boolean).join(' · '));''')
js('  race.freeRide();\n  rebuildCourseHud();', '  race.opponent=null;\n  race.freeRide();\n  rebuildCourseHud();')
js('  race.abandon();cameraRevision++;priorTimestamp=undefined;',
   '  race.opponent=null;\n  race.abandon();cameraRevision++;priorTimestamp=undefined;')
js('  ui.vehiclePicker.disabled=locked;', '  ui.vehiclePicker.disabled=locked||Boolean(race.opponent);')
js('''    const kind=race.rider.vehicle;
    const pitch=Math.atan(riderGrade(ghost.position,ghost.heading));''',
   '''    const kind=race.opponent?.vehicle??race.rider.vehicle;
    const pitch=Math.atan(riderGrade(ghost.position,ghost.heading));''')
js('''    return [
      [frame,root],[wheels,multiply(root,placement(REAR,0,0,spin))],
      [wheels,multiply(root,placement(transform(steer,FRONT),0,turn,spin))],
      [fork,multiply(root,forkPose)],[body,multiply(root,placement([0,pose.bob,0]))],[ghostLimbs,root]
    ];''',
   '''    const paint=getPaint(race.opponent?.paint??'classic');
    return [
      [paint.frame,root],[wheels,multiply(root,placement(REAR,0,0,spin))],
      [wheels,multiply(root,placement(transform(steer,FRONT),0,turn,spin))],
      [paint.fork,multiply(root,forkPose)],[body,multiply(root,placement([0,pose.bob,0]))],[ghostLimbs,root]
    ];''')
js('    const ghosts=preferences.ghost?ghostMeshes(race.ghost):[];',
   '''    const ghost=preferences.ghost?race.ghost:null;
    const ghosts=ghostMeshes(ghost);''')
js('    projectTag(ui.riderTag,previousCamera,transform(root,[-.08,tagHeight,0]),width,height);',
   '''    projectTag(ui.riderTag,previousCamera,transform(root,[-.08,tagHeight,0]),width,height);
    if (race.opponent&&ghosts.length) {
      setText(ui.friendTag,race.opponent.name);
      const tagY=race.opponent.vehicle==='chair'?1.57:1.93;
      projectTag(ui.friendTag,previousCamera,add(ghost.position,[0,tagY,0]),width,height);
    } else ui.friendTag.hidden=true;''')
js('''    activeCampus=pendingCampus.destination;
    pendingCampus=null;
    try {
      buildRidingScene(activeCampus);''',
   '''    const {destination,ghost,archive}=pendingCampus;
    activeCampus=destination;
    pendingCampus=null;
    let challenge;
    try {
      buildRidingScene(activeCampus);
      if (ghost) challenge=loadFriendGhost(ghost);''')
js("      setText(ui.notice,'目的地暂时无法加载，请重试。');",
   "      if (ghost) friendImportFailed(error);\n      else setText(ui.notice,'目的地暂时无法加载，请重试。');")
js('''    race.select(courseByCampus[activeCampus]);
    zoomMap=false;
    initHud();
    arriveAtStation();''', '''    if (challenge) activateFriendChallenge(challenge,archive);
    else {
      race.select(courseByCampus[activeCampus]);
      zoomMap=false;
      initHud();
      arriveAtStation();
    }''')

html('    </dialog>\n    <div class="touch"', '    </dialog>\n'+content('friend-dialog.html')+'\n    <div class="touch"')
html('      <button class="action primary" id="startTrial"', '''      <button class="action" id="friendButton" type="button" aria-haspopup="dialog" aria-controls="friendDialog">友人对战</button>
      <button class="action primary" id="startTrial"''')
html('    <div class="hints">', '    <output id="friendReady" class="friend-ready" aria-live="polite" hidden></output>\n    <div class="hints">')
html('      <button id="callAction" class="action primary" type="button" hidden></button>',
     '''      <div class="finish-actions">
        <button id="callAction" class="action primary" type="button" hidden></button>
        <button id="friendExport" class="action" type="button" hidden>导出影子文件</button>
      </div>''')
html('      <div class="rider-tag chair-cheer"', '      <div class="rider-tag friend-tag" id="friendTag" hidden></div>\n      <div class="rider-tag chair-cheer"')
html('  .seed-button { white-space:nowrap; }', '''  .friend-drop { display:grid; gap:6px; place-content:center; width:100%; min-height:107px; padding:12px;
    border:1px dashed #8eaca4; border-radius:10px; background:#274137; color:var(--ink); font:inherit; cursor:pointer; }
  .friend-drop span { color:#c6d9cc; font-size:.81rem; }
  .friend-drop:hover,.friend-drop.dragging { background:#39594a; border-color:#d7efae; }
  #friendStatus { min-height:1.25em; margin:10px 0 0; }
  .friend-ready { flex-basis:100%; color:#c9e5da; font-size:.83rem; overflow-wrap:anywhere; }
  .split > span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .friend-tag { color:#e0f6f3; background:#193939e8; border-color:#98d5d6; }
  .friend-tag::before { background:#98d5d6; }
  .finish-actions { display:flex; flex-wrap:wrap; justify-content:center; gap:8px; }
  .finish-actions .action { min-width:0; }
'''+content('friend-board.css')+'''
  .seed-button { white-space:nowrap; }''')

js('  const cellWidth = 48;', '  const cellWidth = 32;')
js('''  vec4 world = uModel * vec4(aPosition, 1.0);
  vWorld = world.xyz;
  vNormal = mat3(uModel) * aNormal;''', '''#ifdef STATIC_SCENE
  vec4 world = vec4(aPosition, 1.0);
  vNormal = aNormal;
#else
  vec4 world = uModel * vec4(aPosition, 1.0);
  vNormal = mat3(uModel) * aNormal;
#endif
  vWorld = world.xyz;''')
js('uniform int uMaterial, uMirror, uGhost, uReflect;', '''#ifdef STATIC_SCENE
const int uMaterial = 0, uMirror = 0, uGhost = 0, uReflect = 0;
#else
uniform int uMaterial, uMirror, uGhost, uReflect;
#endif''')
js("  const sky = program(SKY_VERTEX,", """  // Solid scenery already uses world coordinates and needs only its opaque material.
  const staticVertex = VERTEX.replace('precision highp float;', '#define STATIC_SCENE\\nprecision highp float;');
  const staticFragment = FRAGMENT.replace('precision highp float;',
    '#define OPAQUE_PASS\\n#define STATIC_SCENE\\nprecision highp float;');
  const solidSurface = program(staticVertex, staticFragment, surfaceUniforms);
  const sky = program(SKY_VERTEX,""")
js('''  function surfacePass(projection, eye, nearLight, size, time, isReflection, objects, ghost=false, reflect=true, decals=false) {
    const {p,u} = isReflection || decals ? maskedSurface : opaqueSurface;''',
   '''  function surfacePass({p,u}, projection, eye, nearLight, size, time, objects,
    {isReflection=false, ghost=false, reflect=true}={}) {''')
js('    const visible = visibleStatic(world.objects, frustum);',
   '''    const solid = visibleStatic(world.solid, frustum);
    const surfaces = visibleStatic(world.surfaces, frustum);''')
js('''float shadows(highp sampler2DShadow depth, vec4 light, float bias, float spread) {''', '''float shadow1(highp sampler2DShadow depth, vec4 light, float bias) {
  vec3 uvz = light.xyz * .5 + .5;
  if (uvz.x <= .002 || uvz.x >= .998 || uvz.y <= .002 || uvz.y >= .998 || uvz.z > 1.0 || uvz.z < 0.0) return 1.0;
  return texture(depth, vec3(uvz.xy, uvz.z - bias));
}
float shadows(highp sampler2DShadow depth, vec4 light, float bias, float spread) {''')
js('''  if (sun > 0.0) {
    shadow = shadows(uDepth, vShadow, .00044 + .00067 * (1.0 - sun), 1.35);
    if (uMirror == 0) shadow = min(shadow, shadows(uNearDepth, vNearShadow, .0018 + .0015 * (1.0 - sun), 1.5));
  }''', '''  if (sun > 0.0) {
    float bias = .00044 + .00067 * (1.0 - sun);
    vec3 eyeDelta = uEye - vWorld;
    if (uMirror == 1 || dot(eyeDelta, eyeDelta) > 9025.0) {
      shadow = shadow1(uDepth, vShadow, bias);
    } else {
      shadow = shadows(uDepth, vShadow, bias, 1.35);
      if (max(abs(vNearShadow.x), abs(vNearShadow.y)) < .996) {
        shadow = min(shadow, shadows(uNearDepth, vNearShadow, .0018 + .0015 * (1.0 - sun), 1.5));
      }
    }
  }''')
js('      const mirrored = visibleStatic(world.mirrored, crop.planes);', '''      const [ex,,ez] = camera.eye;
      const mirrored = world.mirrored.filter(([mesh]) => {
        const {low, high} = mesh.bounds;
        const dx = ex < low[0] ? low[0] - ex : ex > high[0] ? ex - high[0] : 0;
        const dz = ez < low[2] ? low[2] - ez : ez > high[2] ? ez - high[2] : 0;
        return dx*dx + dz*dz <= 75625 && seesBounds(crop.planes, mesh.bounds);
      });''')
js('      surfacePass(reflectedProjection, reflectedEye, nearLight, mirrorSize, time, true, mirrored);',
   '      surfacePass(maskedSurface, reflectedProjection, reflectedEye, nearLight, mirrorSize, time, mirrored, {isReflection:true});')
js('''    const scene = riderObjects.concat(traffic, visible, course, [world.ground]);
    const size = [width, height];
    surfacePass(camera.vp, camera.eye, nearLight, size, time, false, scene, false, reflect);
    if (decals.length) surfacePass(camera.vp, camera.eye, nearLight, size, time, false, decals, false, reflect, true);''',
   '''    const size = [width, height], lighting = {reflect};
    const actors = riderObjects.concat(traffic);
    surfacePass(opaqueSurface, camera.vp, camera.eye, nearLight, size, time, actors, lighting);
    surfacePass(solidSurface, camera.vp, camera.eye, nearLight, size, time, solid, lighting);
    surfacePass(opaqueSurface, camera.vp, camera.eye, nearLight, size, time, surfaces.concat(course, [world.ground]), lighting);
    if (decals.length) surfacePass(maskedSurface, camera.vp, camera.eye, nearLight, size, time, decals, lighting);''')
js('      surfacePass(camera.vp,camera.eye,nearLight,[width,height],time,false,ghosts,true,reflect);',
   '      surfacePass(opaqueSurface, camera.vp, camera.eye, nearLight, size, time, ghosts, {ghost:true, reflect});')
js('''    objects:solid.concat([
      ...meshCells(gpu,[road],2),...meshCells(gpu,[pavement],4),...meshCells(gpu,[water],3)
    ].map(mesh=>[mesh,IDENTITY])),''', '''    solid,
    surfaces:[
      ...meshCells(gpu,[road],2),...meshCells(gpu,[pavement],4),...meshCells(gpu,[water],3)
    ].map(mesh=>[mesh,IDENTITY]),''')
js('for(const [mesh] of [...world.objects,...world.labels,world.ground])',
   'for(const [mesh] of [...world.solid,...world.surfaces,...world.labels,world.ground])')
js('let indexedRoads;', 'let indexedRoads;\n\n'+content('collision-index.js'))
js('''  return campus.find(block=>block.parts ? block.parts.some(contains) : contains(block)) ||
    campusFixtures.find(contains);''', '''  if (ridingObstacles?.region==='szu' && margin<=OBSTACLE_MARGIN) {
    return ridingObstacles.buildings.get(streetCell(x,z))?.find(entry=>contains(entry.part))?.lot;
  }
  return campus.find(block=>block.parts ? block.parts.some(contains) : contains(block)) ||
    campusFixtures.find(contains);''')
js('''  for(const lot of uclBuildings) {
    if((lot.parts??[lot]).some(part=>y<part.height&&y+.1>=(part.bottom??0)&&closeToBlock(x,z,part,margin))) return lot;
  }
  return null;''', '''  const contains=part=>y<part.height&&y+.1>=(part.bottom??0)&&closeToBlock(x,z,part,margin);
  if (ridingObstacles?.region==='ucl' && margin<=OBSTACLE_MARGIN) {
    return ridingObstacles.buildings.get(streetCell(x,z))?.find(entry=>contains(entry.part))?.lot??null;
  }
  for(const lot of uclBuildings) {
    if((lot.parts??[lot]).some(contains)) return lot;
  }
  return null;''')
js('!treeSites.some(tree=>Math.abs(tree.x-x)<.28 && Math.abs(tree.z-z)<.28)', '!treeBlocks(x,z,.28)')
js('!treeSites.some(tree=>Math.abs(tree.x-x)<.31&&Math.abs(tree.z-z)<.31)', '!treeBlocks(x,z,.31)')
js('function buildRidingScene(campus) {\n  clearWorldShapes();',
   'function buildRidingScene(campus) {\n  ridingObstacles=null;\n  clearWorldShapes();')
js('    else campusUrbanWorld();\n  } finally',
   '    else campusUrbanWorld();\n    ridingObstacles=indexRidingObstacles(campus);\n  } finally')
js('    const previous=activeCampus;\n    const previousLists=',
   '    const previous=activeCampus, previousObstacles=ridingObstacles;\n    const previousLists=')
js('      groundSurfaces=previousGround;\n      clearWorldShapes();',
   '      groundSurfaces=previousGround;\n      ridingObstacles=previousObstacles;\n      clearWorldShapes();')

js('const mapCache = new WeakMap();', 'const mapCache = new WeakMap();\n\n'+
   content('sound.js')+'\n\n'+content('save-sync.js')+'\n\n'+content('practice-review.js')+'\n\n'+
   content('online-rtc.js')+'\n\n'+content('online-ui.js'))

# 1.5.0 Atmosphere, zero-buffer weather/night lighting, and painted multiplayer riders
js('const SUN = normalize([-.55, .63, .54]);', 'const SUN = normalize([-.55, .63, .54]);\n\n'+content('atmosphere.js'))
js('uniform vec3 uEye, uSun;\nuniform highp sampler2DShadow uDepth, uNearDepth;',
   'uniform vec3 uEye, uSun, uFogColor, uFillLow, uFillHigh, uSunColor, uHeadPos, uHeadDir;\nuniform vec4 uAtmosphere;\nuniform highp sampler2DShadow uDepth, uNearDepth;')
js('''  float haze = 1.0 - exp(-max(0.0, d - 16.0) * .00205);
  return mix(color, vec3(.737,.808,.812), haze);''',
   '''  float haze = 1.0 - exp(-max(0.0, d - 16.0) * uAtmosphere.x);
  return mix(color, uFogColor, haze);''')
js('''  if (uGhost == 1) {
    float glow = .84 + .16 * max(dot(n, uSun), 0.0);
    pixel = vec4(fog(vec3(.38,.88,.91) * glow),.46);
    return;
  }''',
   '''  if (uGhost > 0) {
    float glow = .84 + .16 * max(dot(n, uSun), 0.0);
    vec3 tint = uGhost == 2 ? mix(vColor, vec3(.86,.95,.98), .10) : vec3(.38,.88,.91);
    pixel = vec4(fog(tint * glow), uGhost == 2 ? .90 : .46);
    return;
  }''')
js('''  float sky = n.y * .5 + .5;
  vec3 fill = mix(vec3(.55,.65,.68), vec3(.77,.82,.75), sky);
  vec3 light = fill + (vec3(.52,.43,.30) * sun * shadow);
  vec3 shaded = color * light + vec3(.011,.016,.013) * sky;
  pixel = vec4(fog(shaded),1.0);''',
   '''  float sky = n.y * .5 + .5;
  vec3 fill = mix(uFillLow, uFillHigh, sky);
  vec3 light = fill + (uSunColor * sun * shadow);
  if (uAtmosphere.y > .01) {
    vec3 toFrag = vWorld - uHeadPos;
    float dist = length(toFrag);
    if (dist < 30.0) {
      vec3 dir = toFrag / max(dist, .001);
      float cone = smoothstep(.78, .96, dot(dir, uHeadDir));
      float atten = 1.0 / (1.0 + .018 * dist * dist);
      light += vec3(1.05, .96, .76) * (cone * atten * uAtmosphere.y * 1.45);
    }
  }
  vec3 shaded = color * light + vec3(.011,.016,.013) * sky;
  if (uAtmosphere.z > .01 && (uMaterial == 2 || uMaterial == 4)) {
    vec3 viewDir = normalize(uEye - vWorld);
    vec3 halfVec = normalize(uSun + viewDir);
    float wetSpec = pow(max(dot(n, halfVec), 0.0), 36.0) * .28 * uAtmosphere.z;
    shaded = shaded * mix(1.0, .82, uAtmosphere.z) + vec3(.75, .82, .88) * wetSpec;
  }
  pixel = vec4(fog(shaded),1.0);''')
js('uniform vec3 uRight, uUp, uBack, uSun;\nuniform vec2 uTangent;\nuniform int uMirror;',
   'uniform vec3 uRight, uUp, uBack, uSun, uSkyLow, uSkyHigh, uCloudColor, uSunGlow;\nuniform vec2 uTangent;\nuniform float uCloudAlpha;\nuniform int uMirror;')
js('''  vec3 sky = mix(vec3(.866,.858,.746),vec3(.476,.690,.707),pow(above,.66));
  float sunlight = max(dot(ray,uSun),0.0);
  sky += vec3(.20,.164,.088)*pow(sunlight,10.0);
  float glint = smoothstep(.9977,.9990,sunlight);
  sky = mix(sky,vec3(1.0,.974,.821),glint);
  if (above > .02) {
    vec2 cloud = ray.xz / (above + .115) * vec2(1.61,2.24) + vec2(8.9,3.1);
    float f = noise(cloud)*.59 + noise(cloud*2.38)*.26 + noise(cloud*5.13)*.105 + noise(cloud*11.77)*.045;
    float wisp = smoothstep(.53,.74,f) * smoothstep(.02,.16,above);
    sky = mix(sky,vec3(.958,.931,.838),wisp*.64);
  }''',
   '''  vec3 sky = mix(uSkyLow,uSkyHigh,pow(above,.66));
  float sunlight = max(dot(ray,uSun),0.0);
  sky += uSunGlow*pow(sunlight,10.0);
  float glint = smoothstep(.9977,.9990,sunlight);
  sky = mix(sky,vec3(1.0,.974,.821),glint * clamp(uSunGlow.r * 5.0, 0.0, 1.0));
  if (above > .02) {
    vec2 cloud = ray.xz / (above + .115) * vec2(1.61,2.24) + vec2(8.9,3.1);
    float f = noise(cloud)*.59 + noise(cloud*2.38)*.26 + noise(cloud*5.13)*.105 + noise(cloud*11.77)*.045;
    float wisp = smoothstep(.53,.74,f) * smoothstep(.02,.16,above);
    sky = mix(sky,uCloudColor,wisp*uCloudAlpha);
  }''')
js("    'uReflection','uDecal','uGroundNoise','uSize','uTime','uMaterial','uMirror','uGhost','uReflect'];",
   "    'uReflection','uDecal','uGroundNoise','uSize','uTime','uMaterial','uMirror','uGhost','uReflect',\n    'uFogColor','uFillLow','uFillHigh','uSunColor','uHeadPos','uHeadDir','uAtmosphere'];")
js("const sky = program(SKY_VERTEX, SKY_FRAGMENT, ['uRight','uUp','uBack','uSun','uTangent','uMirror']);",
   "const sky = program(SKY_VERTEX, SKY_FRAGMENT, ['uRight','uUp','uBack','uSun','uSkyLow','uSkyHigh','uCloudColor','uSunGlow','uTangent','uCloudAlpha','uMirror']);")
js('''    gl.uniform3fv(u.uSun, SUN);
    gl.uniform2fv(u.uSize, size);
    gl.uniform1f(u.uTime, time);
    gl.uniform1i(u.uMirror, isReflection ? 1 : 0);
    gl.uniform1i(u.uGhost,ghost?1:0);''',
   '''    const weather = currentWeather();
    gl.uniform3fv(u.uSun, weather.sun);
    gl.uniform3fv(u.uFogColor, weather.fog);
    gl.uniform3fv(u.uFillLow, weather.fillLow);
    gl.uniform3fv(u.uFillHigh, weather.fillHigh);
    gl.uniform3fv(u.uSunColor, weather.sunColor);
    gl.uniform3fv(u.uHeadPos, headPos);
    gl.uniform3fv(u.uHeadDir, headDir);
    gl.uniform4f(u.uAtmosphere, weather.fogDensity, weather.headlight, weather.wetness, 0);
    gl.uniform2fv(u.uSize, size);
    gl.uniform1f(u.uTime, time);
    gl.uniform1i(u.uMirror, isReflection ? 1 : 0);
    gl.uniform1i(u.uGhost, ghost === 2 ? 2 : ghost ? 1 : 0);''')
js('''    gl.uniform3fv(sky.u.uSun, SUN);
    gl.uniform2fv(sky.u.uTangent, camera.tangent);
    gl.uniform1i(sky.u.uMirror, mirrored ? 1 : 0);''',
   '''    const weather = currentWeather();
    gl.uniform3fv(sky.u.uSun, weather.sun);
    gl.uniform3fv(sky.u.uSkyLow, weather.skyLow);
    gl.uniform3fv(sky.u.uSkyHigh, weather.skyHigh);
    gl.uniform3fv(sky.u.uCloudColor, weather.cloudColor);
    gl.uniform3fv(sky.u.uSunGlow, weather.sunGlow);
    gl.uniform2fv(sky.u.uTangent, camera.tangent);
    gl.uniform1f(sky.u.uCloudAlpha, weather.cloudAlpha);
    gl.uniform1i(sky.u.uMirror, mirrored ? 1 : 0);''')
js('  function bindTexture(index, texture) {',
   '  let headPos = [0,1,0], headDir = [1,0,0];\n  function bindTexture(index, texture) {')
js('draw(camera, world, route, riderObjects, riderPosition, time, ghosts, traffic, aa) {',
   'draw(camera, world, route, riderObjects, riderPosition, time, ghosts, traffic, aa, head=null, ghostStyle=1) {\n    if (head) { headPos = head.pos; headDir = head.dir; }')
js("surfacePass(opaqueSurface, camera.vp, camera.eye, nearLight, size, time, ghosts, {ghost:true, reflect});",
   "surfacePass(opaqueSurface, camera.vp, camera.eye, nearLight, size, time, ghosts, {ghost:ghostStyle, reflect});")

# 1.5.0 High-risk shortcuts (SZU Dujuan foot & UCL IOE west)
js('function surfaceAt(x,z,exploring=false) {', content('shortcuts.js')+'\n\nfunction surfaceAt(x,z,exploring=false) {')
js('  return Boolean(hit.street&&hit.distance<=hit.street.width+.21 || pavedGroundAt(x,z) ||\n    exploring&&cityStreetAt(x,z));',
   '  return Boolean(hit.street&&hit.distance<=hit.street.width+.21 || pavedGroundAt(x,z) ||\n    shortcutRibbonContains(szuHighRiskShortcuts,x,z) || exploring&&(cityStreetAt(x,z)||onParkWalk(x,z)));')
js('function uclSurfaceAt(x,z) {\n  return Boolean(uclStreetAt(x,z,.20)||pavedGroundAt(x,z)||',
   'function uclSurfaceAt(x,z) {\n  return Boolean(uclStreetAt(x,z,.20)||pavedGroundAt(x,z)||shortcutRibbonContains(uclHighRiskShortcuts,x,z)||')
js('  indexGroundSurfaces();\n  sculptCampusHill();', '  buildSzuShortcutVisuals();\n  indexGroundSurfaces();\n  sculptCampusHill();')
js('  studentGardenMeshes();\n  pavement.box([hospitalEntrance[0]', '  studentGardenMeshes();\n  buildUclShortcutVisuals();\n  pavement.box([hospitalEntrance[0]')

# 1.5.0 Wet pavement physics, bicycle drafting, and all-vehicle balanced tuning
js('''function makeCyclist(event,bike=stockBike,vehicle='bike') {
  return {bike,vehicle,position:courseGround(event,event.spawn),heading:event.heading,speed:0,steering:0,travel:0,paved:true,
    energy:1,sprinting:false,sprintLocked:false,throttle:0,brake:0,yawRate:0,lean:0,slip:0,stationaryBrake:0};
}''',
   '''function makeCyclist(event,bike=stockBike,vehicle='bike',tuning=null) {
  const activeTuning = vehicle==='bike' ? null : (tuning ?? buildVehicleTuning(vehicle, typeof vehicleTunings!=='undefined' ? vehicleTunings[vehicle] : null));
  return {bike,tuning:activeTuning,vehicle,position:courseGround(event,event.spawn),heading:event.heading,speed:0,steering:0,travel:0,paved:true,
    energy:1,sprinting:false,sprintLocked:false,throttle:0,brake:0,yawRate:0,lean:0,slip:0,stationaryBrake:0};
}''')
js('  const bike=cycling?rider.bike:vehicleChoices[vehicle];',
   '  const bike=cycling?rider.bike:(rider.tuning??buildVehicleTuning(vehicle));')
js('''  if (rider.sprinting) {
    rider.energy=Math.max(0,rider.energy-dt*.193);
    if (rider.energy<=.045) rider.sprintLocked=true;
  } else rider.energy=Math.min(1,rider.energy+dt*(paved?.052:.035));
  const grade=riderGrade(p,rider.heading);
  const hillAcceleration=grade*9.81;
  const flatLimit=paved?(rider.sprinting?bike.sprintSpeed:bike.roadSpeed):bike.grassSpeed;
  const topSpeedEffect=1-clamp(grade*1.25,0,.22)+(paved&&cycling?clamp(-grade*.92,0,.12):0);
  const limit=flatLimit*topSpeedEffect;
  const drag=(.48+Math.abs(rider.speed)*.047)*(paved?bike.rolling:bike.grassRolling??2.85);''',
   '''  if (rider.sprinting) {
    rider.energy=Math.max(0,rider.energy-dt*.193*(bike.sprintDrain??1));
    if (rider.energy<=.045) rider.sprintLocked=true;
  } else rider.energy=Math.min(1,rider.energy+dt*(rider.drafting?.070:paved?.052:.035)*(bike.sprintRecover??1));
  const weather=currentWeather();
  const wet=paved&&weather.wetness>0;
  const wetGrip=wet?mix(weather.gripScale,1,bike.wetMitigate??0):1;
  const wetBrake=wet?mix(weather.brakeScale,1,bike.wetBrakeMitigate??0):1;
  rider.drafting=typeof onlineDraftingAt==='function'&&onlineDraftingAt(rider,performance.now());
  const grade=riderGrade(p,rider.heading);
  const hillAcceleration=grade*9.81;
  const flatLimit=paved?(rider.sprinting?bike.sprintSpeed:bike.roadSpeed):bike.grassSpeed;
  const topSpeedEffect=1-clamp(grade*1.25,0,.22)+(paved&&cycling?clamp(-grade*.92,0,.12):0);
  const limit=flatLimit*topSpeedEffect*(rider.drafting?1.045:1);
  const drag=(.48+Math.abs(rider.speed)*.047)*(paved?bike.rolling:bike.grassRolling??2.85)*(rider.drafting?.76:1);''')
js('    const gearing=cycling?mix(bike.force,bike.highForce,fast):bike.force;\n    const groundForce=paved?5.28:cycling?4.08:3.40;\n    const force=rider.throttle*(rider.sprinting?7.64:groundForce)*gearing;',
   '    const gearing=mix(bike.force,bike.highForce??bike.force,fast);\n    const groundForce=paved?5.28:cycling?4.08:3.40;\n    const force=rider.throttle*(rider.sprinting?7.64*(bike.sprintForce??1):groundForce)*gearing;')
js('  const steeringRate=steer===0?mix(trail?23:20,17.5,speedFactor):\n    mix(trail?17:cycling?15.2:14,trail?9.6:10,speedFactor);',
   '  const steeringRate=(steer===0?mix(trail?23:20,17.5,speedFactor):\n    mix(trail?17:cycling?15.2:14,trail?9.6:10,speedFactor))*(bike.steerScale??1);')
js('rider.brake*9.3*(bike.brakePower??1)+drag+hillAcceleration',
   'rider.brake*9.3*(bike.brakePower??1)*wetBrake+drag+hillAcceleration')
js('  const grip=(paved?bike.roadGrip:bike.grassGrip)*(1-(bike.brakeTurnLoss??.145)*rider.brake);',
   '  const grip=(paved?bike.roadGrip*wetGrip:bike.grassGrip)*(1-(bike.brakeTurnLoss??.145)*rider.brake);')

# 1.5.0 Sector Practice Mode & custom sound triggers in TimeTrial
js('    this.sessionRecords = new Map();\n    this.select(event);',
   '    this.sessionRecords = new Map();\n    this.practiceBest = new Map();\n    this.practice = null;\n    this.select(event);')
js('  select(event,opponent=null) {\n    this.event = event;',
   '  select(event,opponent=null) {\n    this.practice = null;\n    this.event = event;')
js('''  start() {
    this.freeRide();''',
   '''  startPractice(fromGate, toGate) {
    this.freeRide();
    const gates = this.event.gates;
    const startGate = gates[fromGate], endGate = gates[toGate];
    const entry = this.entryVehicle;
    const drive = entry === 'bike' ? this.bike : buildVehicleTuning(entry, vehicleTunings[entry]);
    const entrySpeed = fromGate > 0 ? Math.min(drive.roadSpeed * .86, plannedSpeed(this.event, startGate.distance) * .80) : 0;
    this.practice = {
      fromGate, toGate, entrySpeed,
      key: `${checkpointRecordKey(this.event, entry)}:sector:${fromGate}-${toGate}`,
      name: `${startGate.name} → ${endGate.name}`,
    };
    this.rider = makeCyclist(this.event, this.bike, entry);
    if (fromGate > 0) {
      const frame = courseFrame(this.event.path, startGate.distance);
      this.rider.position = courseGround(this.event, frame.p, startGate.rise);
      this.rider.heading = Math.atan2(frame.f[2], frame.f[0]);
      this.rider.paved = surfaceAt(this.rider.position[0], this.rider.position[2], activeCampus === 'szu');
    }
    this.nextGate = fromGate + 1;
    this.routeAnchor = startGate.distance;
    this.phase = 'count';
    this.countdownTicks = Math.round(COUNTDOWN_TICKS * .5);
    this.countdown = this.countdownTicks * PHYSICS_STEP;
    this.frames = [packPose(0, this.rider)];
    this.replayInterval = this.recordRules.interval;
    this.nextRecording = this.replayInterval;
  }

  start() {
    this.practice = null;
    this.freeRide();''')
js('''    this.nextGate++;
    if (this.nextGate < gates.length) return false;
    this.finishAt(split);
    return true;''',
   '''    this.nextGate++;
    const doneGate = this.practice ? this.practice.toGate + 1 : gates.length;
    if (this.nextGate < doneGate) {
      if (typeof playCustomSound === 'function') playCustomSound('checkpoint');
      return false;
    }
    this.finishAt(split);
    return true;''')
js('    const last = gates[this.nextGate-1];',
   '    const last = gates[Math.max(this.practice?.fromGate ?? 0, this.nextGate-1)];')
js('    this.onGuide = true;\n    return true;\n  }',
   '    this.onGuide = true;\n    if (typeof playCustomSound === \'function\') playCustomSound(\'rejoin\');\n    return true;\n  }')
js('    this.record = (this.best === null || time < this.best) &&time<=this.recordRules.limit;',
   '''    if (typeof playCustomSound === 'function') playCustomSound('finish');
    if (this.practice) {
      this.lastRun = null;
      const prev = this.practiceBest.get(this.practice.key);
      this.record = prev === undefined || time < prev;
      if (this.record) this.practiceBest.set(this.practice.key, time);
      return;
    }
    if (this.online) return;
    this.record = (this.best === null || time < this.best) &&time<=this.recordRules.limit;''')
js('''    if (this.phase === 'count') {
      this.countdown = --this.countdownTicks * PHYSICS_STEP;
      if (this.countdownTicks === 0) this.phase = 'race';
      return;
    }''',
   '''    if (this.phase === 'count') {
      const beforeSec = Math.ceil(this.countdownTicks * PHYSICS_STEP);
      this.countdown = --this.countdownTicks * PHYSICS_STEP;
      const afterSec = Math.ceil(this.countdown);
      if (this.countdownTicks === 0) {
        this.phase = 'race';
        if (this.practice?.entrySpeed) this.rider.speed = this.practice.entrySpeed;
        if (typeof playCustomSound === 'function') playCustomSound('go');
      } else if (afterSec < beforeSec && typeof playCustomSound === 'function') {
        playCustomSound('countdown');
      }
      return;
    }''')

# 1.5.0 Weather preference persistence
js("const defaultPreferences={resolution:'auto',aa:'auto',ghost:true,brakeLine:true};",
   "const defaultPreferences={resolution:'auto',aa:'auto',ghost:true,brakeLine:true,weather:'day'};")
js("      brakeLine:typeof saved.brakeLine==='boolean'?saved.brakeLine:true\n    };",
   "      brakeLine:typeof saved.brakeLine==='boolean'?saved.brakeLine:true,\n      weather:knownWeather(saved.weather)\n    };")
js("  ui.settingsBrakeLine.checked=preferences.brakeLine;\n}",
   "  ui.settingsBrakeLine.checked=preferences.brakeLine;\n  ui.settingsWeather.value=knownWeather(preferences.weather);\n}")
js("  for(const [key,control] of [['resolution',ui.settingsResolution],['aa',ui.settingsAA]]) {",
   "  for(const [key,control] of [['resolution',ui.settingsResolution],['aa',ui.settingsAA],['weather',ui.settingsWeather]]) {")
js("      preferences[key]=control.value;savePreferences();",
   "      preferences[key]=control.value;if(key==='weather'&&!onlineRoom) setActiveWeather(control.value);savePreferences();")

# 1.5.0 Register new UI IDs & vehicleTunings
js('const driverProfile=readDriverProfile();', 'const driverProfile=readDriverProfile();\nconst vehicleTunings=savedVehicleTunings();')
js("  'friendFilters','friendCampus'", """  'onlineButton','onlineDialog','onlineSetup','onlineLobby','onlineFormat','onlineVehicleRule','onlineWeather','onlineCreate','onlineHostInput','onlineJoinForm','onlineCodeInput',
  'onlineJoin','onlineClose','onlineLeave','onlineTitle','onlineCode','onlinePlayers','onlineStanding','onlineRounds',
  'onlineHostControls','onlineLobbyCampus','onlineLobbyCourse','onlineLobbySeed','onlineLobbyVehicle','onlineLobbyWeather','onlineLobbyTuning','onlineLobbyCollision','onlineTuningBanner','onlineGarage',
  'onlineTuningTime','onlineCollision','settingsTuneBar','settingsTuneText','settingsTuneReady','settingsTuneSkip',
  'onlineInvite','onlineReady','onlineStart','onlineStatus','onlineLatency','onlineRank','onlineBike','onlineHostHint',
  'onlineTag0','onlineTag1','onlineTag2','draftPill','weatherOverlay','settingsWeather','settingsWindSpeed','settingsWindDir','onlineWindSpeed','onlineWindDir','onlineLobbyWindSpeed','onlineLobbyWindDir','mapCompare','reviewMapButton','practiceExit',
  'bikeFrame','frameNote','bikeSprint','sprintNote','motorTuning','vehLabel0','vehLabel1','vehLabel2','vehSlot0','vehSlot1','vehSlot2','vehNote0','vehNote1','vehNote2',
  'vehTopSpeed','vehGravel','vehGrass','vehAbility','saveExport','saveImport','saveFile','saveStatus',
  'friendFilters','friendCampus'""")

# 1.5.0 Local save triggers on profile, preferences, PB, friend archive
js('function storeDriverProfile(profile) {\n  try { localStorage.setItem(DRIVER_KEY,JSON.stringify(profile)); } catch {}\n}',
   'function storeDriverProfile(profile) {\n  try { localStorage.setItem(DRIVER_KEY,JSON.stringify(profile)); } catch {}\n  if (typeof scheduleLocalSave === \'function\') scheduleLocalSave();\n}')
js('function savePreferences() {\n  try { localStorage.setItem(PREF_KEY,JSON.stringify(preferences)); } catch {}\n  graphicsRevision++;\n}',
   'function savePreferences() {\n  try { localStorage.setItem(PREF_KEY,JSON.stringify(preferences)); } catch {}\n  graphicsRevision++;\n  if (typeof scheduleLocalSave === \'function\') scheduleLocalSave();\n}')
js('    try { localStorage.setItem(key,JSON.stringify(this.bestRun)); } catch {}',
   '    try { localStorage.setItem(key,JSON.stringify(this.bestRun)); } catch {}\n    if (typeof scheduleLocalSave === \'function\') scheduleLocalSave();')
js("  const drive=race.rider.vehicle==='bike'?race.bike:vehicleChoices[race.rider.vehicle];",
   "  const drive=race.rider.vehicle==='bike'?race.bike:(race.rider.tuning??vehicleChoices[race.rider.vehicle]);")

# 1.5.0 Expanded 5-slot Bike + 3-slot Motor/Ebike/Chair Garage UI
js('  const bike=race.bike, vehicle=race.rider.vehicle, spec=vehicleChoices[vehicle];',
   '  const bike=race.bike, vehicle=race.rider.vehicle;')
js('''  ui.bikeParts.hidden=!bicycle;
  ui.vehicleNote.hidden=bicycle;
  ui.bikePaint.value=driverProfile.paint;
  ui.bikePaint.disabled=locked||!bicycle;
  if(!bicycle) setText(ui.vehicleNote,
    Math.round(spec.roadSpeed*3.6)+' km/h · 草地 '+Math.round(spec.grassSpeed*3.6)+' km/h · '+
    (spec.race?'独立计时成绩':'自由骑行'));''',
   '''  ui.bikeParts.hidden=!bicycle;
  ui.motorTuning.hidden=bicycle;
  ui.vehicleNote.hidden=bicycle;
  ui.bikePaint.value=driverProfile.paint;
  ui.bikePaint.disabled=locked||!bicycle;
  if(!bicycle) {
    const tuned=buildVehicleTuning(vehicle,vehicleTunings[vehicle]);
    race.rider.tuning=tuned;
    setText(ui.vehicleNote,vehicle==='trail'?'长行程越野避震提升碎石抓地。':
      vehicle==='ebike'?'宽齿防滑胎提升碎石抓地。':'户外越野轮提升碎石抓地。');
    const slots=vehicleTuningChoices[vehicle]??[];
    const labels=[ui.vehLabel0,ui.vehLabel1,ui.vehLabel2], selects=[ui.vehSlot0,ui.vehSlot1,ui.vehSlot2], notes=[ui.vehNote0,ui.vehNote1,ui.vehNote2];
    slots.forEach((slot,i)=>{
      setText(labels[i],slot.label);
      const sel=selects[i];
      sel.replaceChildren();
      for(const [val,opt] of Object.entries(slot.options)) {
        const el=document.createElement('option');
        el.value=val; el.textContent=opt.name; sel.append(el);
      }
      const cur=tuned.parts[slot.key]??'stock';
      sel.value=cur;
      sel.disabled=locked;
      setText(notes[i],slot.options[cur]?.note??'');
    });
    renderPoweredWorkshop(vehicle,tuned);
  }''')
js('''  ui.bikeBrakes.value = bike.brakes;
  ui.bikeTyres.disabled=ui.bikeGears.disabled=ui.bikeBrakes.disabled=locked||!bicycle;
  ui.bikeLock.hidden = !locked;
  setText(ui.tyreNote, tyreChoices[bike.tyres].note);
  setText(ui.gearNote, gearChoices[bike.gears].note);
  setText(ui.brakeNote, brakeChoices[bike.brakes].note);''',
   '''  ui.bikeBrakes.value = bike.brakes;
  ui.bikeFrame.value = bike.frame ?? 'stock';
  ui.bikeSprint.value = bike.sprint ?? 'stock';
  ui.bikeTyres.disabled=ui.bikeGears.disabled=ui.bikeBrakes.disabled=ui.bikeFrame.disabled=ui.bikeSprint.disabled=locked||!bicycle;
  ui.bikeLock.hidden = !locked;
  setText(ui.tyreNote, tyreChoices[bike.tyres].note);
  setText(ui.gearNote, gearChoices[bike.gears].note);
  setText(ui.brakeNote, brakeChoices[bike.brakes].note);
  setText(ui.frameNote, frameChoices[bike.frame ?? 'stock'].note);
  setText(ui.sprintNote, sprintChoices[bike.sprint ?? 'stock'].note);''')
js('''function installBikeParts() {
  if(race.rider.vehicle!=='bike'||!race.setBike(buildBike(ui.bikeTyres.value,ui.bikeGears.value,ui.bikeBrakes.value))) return;
  const {tyres,gears,brakes}=race.bike;
  try { localStorage.setItem(bikeKey,JSON.stringify({tyres,gears,brakes})); } catch {}
  showBikeSetup();
}''',
   '''function installBikeParts() {
  if(race.rider.vehicle!=='bike'||!race.setBike(buildBike(ui.bikeTyres.value,ui.bikeGears.value,ui.bikeBrakes.value,ui.bikeFrame.value,ui.bikeSprint.value))) return;
  const {tyres,gears,brakes,frame,sprint}=race.bike;
  try { localStorage.setItem(bikeKey,JSON.stringify({tyres,gears,brakes,frame,sprint})); } catch {}
  if (typeof scheduleLocalSave === 'function') scheduleLocalSave();
  showBikeSetup();
  if (typeof onlineRoom !== 'undefined' && onlineRoom?.state.phase==='tuning') syncOnlineProfile();
}

function installVehicleTuning() {
  const vehicle = race.rider.vehicle;
  const slots = vehicleTuningChoices[vehicle];
  if (!slots || race.phase==='race' || race.phase==='count') return;
  const selects = [ui.vehSlot0, ui.vehSlot1, ui.vehSlot2];
  const next = {};
  slots.forEach((slot, i) => { next[slot.key] = selects[i].value; });
  vehicleTunings[vehicle] = normalizeVehicleParts(vehicle, next);
  race.rider.tuning = buildVehicleTuning(vehicle, vehicleTunings[vehicle]);
  storeVehicleTunings(vehicleTunings);
  showBikeSetup();
  if (typeof onlineRoom !== 'undefined' && onlineRoom?.state.phase==='tuning') syncOnlineProfile();
}''')
js('  ui.bikeBrakes.addEventListener(\'change\',installBikeParts);',
   '''  ui.bikeBrakes.addEventListener('change',installBikeParts);
  ui.bikeFrame.addEventListener('change',installBikeParts);
  ui.bikeSprint.addEventListener('change',installBikeParts);
  for (const sel of [ui.vehSlot0, ui.vehSlot1, ui.vehSlot2]) sel.addEventListener('change', installVehicleTuning);
  ui.saveExport.addEventListener('click', () => void exportSaveFile());
  ui.saveImport.addEventListener('click', () => ui.saveFile.click());
  ui.saveFile.addEventListener('change', () => {
    const f = ui.saveFile.files[0];
    ui.saveFile.value = '';
    void importSaveFile(f);
  });''')

js('  initFriendDuel();\n  initSettings();','  initFriendDuel();\n  initOnline();\n  initSettings();\n  setActiveWeather(preferences.weather);\n  void initCustomSounds();')
js("  return ready&&race.phase==='free'&&!race.paused&&!settingsOpen&&!pendingCampus;",
   "  return ready&&race.phase==='free'&&!race.paused&&!settingsOpen&&!pendingCampus&&!onlineRoom;")
js('const seedAvailable=()=>ready&&!pendingCampus','const seedAvailable=()=>ready&&!onlineRoom&&!pendingCampus')
js('''function startTrial() {
  if (!ready||pendingCampus||race.event.campus!==activeCampus) return;
  clearInput();''','''function startTrial() {
  if (!ready||onlineRoom||pendingCampus||race.event.campus!==activeCampus) return;
  if (race.practice) { startSectorPractice(race.practice.fromGate, race.practice.toGate); return; }
  beginTrial();
}

function beginTrial() {
  clearInput();''')
js('function enterFreeRide() {\n  if (!ready) return;', 'function enterFreeRide() {\n  if (!ready||onlineRoom) return;\n  race.practice=null;')
js("function pauseTrial() {\n  if (!ready||pendingCampus", "function pauseTrial() {\n  if (!ready||onlineRoom||pendingCampus")

# Allow Garage in multiplayer lobby & sync profile on close
js("function openSettings(panel = 'display') {\n  if(settingsOpen||pendingCampus)",
   "function openSettings(panel = 'display') {\n  if(settingsOpen||pendingCampus||(onlineRoom&&(panel!=='bike'||onlineRoom.state.phase==='race')))")
js("  ui.vehiclePicker.disabled=locked||Boolean(race.opponent);",
   "  const roomFixedVeh=Boolean(onlineRoom&&(onlineRoom.state.vehicleRule??'bike')!=='any');\n  ui.vehiclePicker.disabled=locked||Boolean(race.opponent)||roomFixedVeh;")
js("  ui.settingsDialog.close();\n  focusStage();\n}",
   "  ui.settingsDialog.close();\n  if (onlineRoom) { if (onlineRoom.state.phase!=='race') { syncOnlineProfile(); showOnlineDialog(); } else focusStage(); return; }\n  focusStage();\n}")

js("    if(ui.seedDialog.open||ui.friendDialog.open) return;", "    if(ui.seedDialog.open||ui.friendDialog.open||ui.onlineDialog.open) return;")
js("    if(!next||pendingCampus||race.phase==='race'||race.phase==='count')",
   "    if(!next||onlineRoom||pendingCampus||race.phase==='race'||race.phase==='count')")
js("    else if (event.code === 'KeyF') recoverTrial();",
   "    else if (event.code === 'KeyF') recoverTrial();\n    else if (event.code === 'KeyB' || event.code === 'KeyH') playCustomSound('bell');")
js("  document.addEventListener('visibilitychange',() => {\n    priorTimestamp = undefined;",
   "  document.addEventListener('visibilitychange',() => {\n    if (onlineRoom) { clearInput(); return; }\n    priorTimestamp = undefined;")

# Minimap trajectory comparison & review sector practice buttons
js("  if(shadow) mapPin(ctx,layout.project,shadow,compact,true);", """  drawComparisonTraces(ctx,layout.project,race,compact);
  if(shadow&&!onlineRoom) mapPin(ctx,layout.project,shadow,compact,true);
  for (const rider of onlineRiderPoses(performance.now())) mapPin(ctx,layout.project,rider,compact,true);""")
js('''  const rows = sectors.map(sector => {
    const row = document.createElement('tr');
    const name = document.createElement('th');
    const time = document.createElement('td');
    const gap = document.createElement('td');
    name.setAttribute('scope', 'row');
    name.textContent = sector.name;
    time.textContent = (sector.duration / 1000).toFixed(2);
    gap.textContent = signedSeconds(sector.delta);
    gap.dataset.gap = gapTone(sector.delta);
    row.append(name, time, gap);
    return row;
  });''',
   '''  const rows = sectors.map((sector, idx) => {
    const row = document.createElement('tr');
    const name = document.createElement('th');
    const time = document.createElement('td');
    const gap = document.createElement('td');
    const act = document.createElement('td');
    name.setAttribute('scope', 'row');
    name.textContent = sector.name;
    time.textContent = (sector.duration / 1000).toFixed(2);
    gap.textContent = signedSeconds(sector.delta);
    gap.dataset.gap = gapTone(sector.delta);
    if (!onlineRoom && !race.practice) {
      const fromG = race.event.stages ? race.event.stages[idx].startGate : idx;
      const toG = race.event.stages ? race.event.stages[idx].finishGate : idx + 1;
      if (toG < race.event.gates.length) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'practice-btn';
        btn.textContent = '单练';
        btn.addEventListener('click', () => startSectorPractice(fromG, toG));
        act.append(btn);
      }
    }
    row.append(name, time, gap, act);
    return row;
  });''')
js("  ui.mapZoom.addEventListener('click',()=>{", """  ui.mapCompare.addEventListener('click',()=>{
    showMapComparison=!showMapComparison;
    ui.mapCompare.setAttribute('aria-pressed',String(showMapComparison));
    renderCampusMap(ui.bigMap,race,false,zoomMap);
  });
  ui.reviewMapButton.addEventListener('click',()=>{
    showMapComparison=true;
    zoomMap=true;
    openMap(true);
  });
  ui.practiceExit.addEventListener('click',exitSectorPractice);
  ui.mapZoom.addEventListener('click',()=>{""")
js("  ui.hospitalRoute.hidden=!london||!free||zoomMap;",
   "  ui.hospitalRoute.hidden=!london||!free||zoomMap;\n  ui.mapCompare.hidden=!race.lastRun;\n  ui.mapCompare.setAttribute('aria-pressed',String(showMapComparison));")
js("    ui.stationList.hidden = !trial;", "    ui.stationList.hidden = !trial && !mapOpen;\n    if (mapOpen) renderMapStationExtras();")
js("    ui.stationList.hidden = !zoomMap;", "    ui.stationList.hidden = !zoomMap && !mapOpen;\n    if (mapOpen) renderMapStationExtras();")
js('  previousPhase=null;previousGate=-1;\n}', '  previousPhase=null;previousGate=-1;\n  if (typeof renderMapStationExtras === \'function\') renderMapStationExtras();\n}')

# HUD updates: live rank, draft pill, practice finish details, review map button
js("  ui.friendExport.hidden=race.phase!=='done'||!race.lastRun;", """  ui.friendExport.hidden=race.phase!=='done'||!race.lastRun||Boolean(race.practice);
  ui.reviewMapButton.hidden=race.phase!=='done'||!race.lastRun||Boolean(race.practice);
  ui.practiceExit.hidden=!race.practice;
  const online = Boolean(onlineRoom);
  ui.onlineButton.disabled=!online&&(pendingCampus||race.phase==='race'||race.phase==='count');
  setText(ui.onlineButton,online?'房间':'联机');
  ui.friendButton.disabled=ui.seedButton.disabled=ui.coursePicker.disabled=online||race.phase==='race'||race.phase==='count';
  ui.startTrial.disabled=ui.freeRide.disabled=online;
  ui.pause.disabled=online||race.phase==='done';
  ui.draftPill.hidden=!race.rider.drafting;
  const liveRank=online&&race.phase==='race'?onlineRaceRank(performance.now()):null;
  ui.onlineRank.hidden=!liveRank;
  if (liveRank) setText(ui.onlineRank,`第 ${liveRank.rank} / ${liveRank.total} 名`+(liveRank.gapMeters?` · 落后 ${liveRank.gapMeters} 米`:' · 领跑'));""")
js("    ui.pause.disabled=race.phase==='done';\n    ui.friendButton.disabled=ui.seedButton.disabled=ui.coursePicker.disabled=race.phase==='race'||race.phase==='count';", '')
js("  const timedName=opponent?'友人对战'", "  const timedName=race.practice?'区间单练 · '+race.practice.name:online?'联机竞速':opponent?'友人对战'")
js("    ui.raceReview.hidden = race.phase !== 'done';",
   "    ui.raceReview.hidden = race.phase !== 'done' || Boolean(race.practice);")
js("    const record=race.record?'刷新个人最佳'",
   "    const pBest=race.practice?race.practiceBest.get(race.practice.key):null;\n    const record=race.practice?(race.record?'刷新本段最佳':'本段最佳 '+timeLabel(pBest)):online?'房间成绩':race.record?'刷新个人最佳'")
js("    ui.callAction.hidden = false;\n    setText(ui.callAction,'再跑一次');",
   "    ui.callAction.hidden = online;\n    setText(ui.callAction,race.practice?'再练本段':'再跑一次');")
js("  ui.callout.hidden = !(race.paused || race.phase === 'count' || race.phase === 'done' || (race.phase === 'race' && race.elapsed < 610));",
   "  ui.callout.hidden = mapOpen || !(race.paused || race.phase === 'count' || race.phase === 'done' || (race.phase === 'race' && race.elapsed < 610));")
js('''function openMap(show) {
  updateMapZoom();
  mapOpen = show;
  ui.sceneHud.hidden = show;
  ui.mapScreen.hidden = !show;
  ui.mapToggle.setAttribute('aria-pressed',String(show));
  setText(ui.mapText,show ? '返回骑行' : '俯视地图');
  if(show) renderCampusMap(ui.bigMap,race,false,zoomMap);
  else ui.mapPlace.hidden=true;
  if(!show&&!ready) ui.notice.hidden=false;
}''',
   '''function openMap(show) {
  updateMapZoom();
  mapOpen = show;
  ui.sceneHud.hidden = show;
  ui.mapScreen.hidden = !show;
  ui.callout.hidden = show || !(race.paused || race.phase === 'count' || race.phase === 'done' || (race.phase === 'race' && race.elapsed < 610));
  ui.mapToggle.setAttribute('aria-pressed',String(show));
  setText(ui.mapText,show ? (race.phase === 'done' ? '返回结算' : '返回骑行') : '俯视地图');
  if(show) {
    ui.stationList.hidden = false;
    renderMapStationExtras();
    renderCampusMap(ui.bigMap,race,false,zoomMap);
  }
  else ui.mapPlace.hidden=true;
  if(!show&&!ready) ui.notice.hidden=false;
}''')

# 3D remote rider paint/vehicle sync + 3D overhead nameplates + headlight + rain overlay
js('  const ghostLimbs=new gpu.Mesh(new Shape(),0,null,true);',
   '  const ghostLimbs=new gpu.Mesh(new Shape(),0,null,true), roomLimbs=[];')
js('  function ghostMeshes(ghost) {','  function ghostMeshes(ghost,limbMesh=ghostLimbs) {')
js('    const kind=race.opponent?.vehicle??race.rider.vehicle;',
   '    const kind=ghost.vehicle??race.opponent?.vehicle??race.rider.vehicle;')
js("    const paint=getPaint(race.opponent?.paint??'classic');",
   "    const paint=getPaint(ghost.paint??race.opponent?.paint??'classic');")
js('    ghostLimbs.update(pose.shape);','    limbMesh.update(pose.shape);')
js('[ghostLimbs,root]','[limbMesh,root]')
js('    const ghost=preferences.ghost?race.ghost:null;\n    const ghosts=ghostMeshes(ghost);', '''    const ghost=preferences.ghost&&!onlineRoom?race.ghost:null;
    const ghosts=ghostMeshes(ghost);
    const onlineRiders=onlineRiderPoses(performance.now());
    for (const [index,remote] of onlineRiders.entries()) {
      roomLimbs[index]??=new gpu.Mesh(new Shape(),0,null,true);
      ghosts.push(...ghostMeshes(remote,roomLimbs[index]));
    }''')
js('    const renderedFrame=gpu.draw(previousCamera,world,route,riderMeshes,p,waterTime,ghosts,trafficNear(previousCamera.eye,waterTime),currentAA());',
   '''    const head={pos:[p[0],p[1]+.92,p[2]],dir:normalize([Math.cos(rider.heading),-.11,Math.sin(rider.heading)])};
    const renderedFrame=gpu.draw(previousCamera,world,route,riderMeshes,p,waterTime,ghosts,trafficNear(previousCamera.eye,waterTime),currentAA(),head,onlineRoom?2:1);
    if (currentWeather().rain) drawRainOverlay(ui.weatherOverlay, rider.speed, performance.now());''')
js('    } else ui.friendTag.hidden=true;',
   '''    } else ui.friendTag.hidden=true;
    const onlineTags=[ui.onlineTag0,ui.onlineTag1,ui.onlineTag2];
    for (let i=0;i<onlineTags.length;i++) {
      const remote=onlineRiders[i], tag=onlineTags[i];
      if (!tag) continue;
      if (remote && length(subtract(remote.position,p))<65) {
        setText(tag,remote.name||'骑手');
        const tagY=remote.vehicle==='chair'?1.57:1.96;
        projectTag(tag,previousCamera,add(remote.position,[0,tagY,0]),width,height);
      } else tag.hidden=true;
    }''')

js('    const {destination,ghost,archive}=pendingCampus;','    const {destination,ghost,archive,online}=pendingCampus;')
js('    let challenge;\n    try {','    let challenge, onlineCourse;\n    try {')
js('      if (ghost) challenge=loadFriendGhost(ghost);',
   '      if (ghost) challenge=loadFriendGhost(ghost);\n      if (online) onlineCourse=findOnlineCourse(online.route);')
js("      if (ghost) friendImportFailed(error);\n      else setText(ui.notice,", "      if (ghost) friendImportFailed(error);\n      else if (online) online.reject(error);\n      else setText(ui.notice,")
js('      arriveAtStation();\n    }\n    lastMap=undefined;',
   '      arriveAtStation();\n      if (online) online.resolve(onlineCourse);\n    }\n    lastMap=undefined;')
js('    const frameStart = priorTimestamp ?? now;', '    tickOnline(now);\n    const frameStart = priorTimestamp ?? now;')
js('''    if (!settingsOpen&&!pendingCampus&&!ui.seedDialog.open&&!ui.friendDialog.open) {
      if (wallTime > 1 && (race.phase === 'race' || race.phase === 'count')) {''',
   '''    const roomRacing = onlineRoom?.state.phase==='race' && !onlineRoom.retired && race.phase!=='free';
    if (roomRacing || (!onlineRoom&&!settingsOpen&&!pendingCampus&&!ui.seedDialog.open&&!ui.friendDialog.open&&!ui.onlineDialog.open)) {
      if (!roomRacing && wallTime > 1 && (race.phase === 'race' || race.phase === 'count')) {''')

# HTML injections
html('    <canvas id="world" aria-label="深圳大学三维骑行赛道"></canvas>',
     '    <canvas id="world" aria-label="深圳大学三维骑行赛道"></canvas>\n    <canvas id="weatherOverlay" aria-hidden="true" hidden></canvas>')
html('    </dialog>\n    <div class="touch"', '    </dialog>\n'+content('online-dialog.html')+'\n    <div class="touch"')
html('      <button class="action primary" id="startTrial"', '''      <button class="action" id="onlineButton" type="button" aria-haspopup="dialog" aria-controls="onlineDialog">联机</button>
      <button class="action primary" id="startTrial"''')
html('  .seed-button { white-space:nowrap; }',content('online.css')+'\n  .seed-button { white-space:nowrap; }')
html('        <output class="exit-feedback" id="exitFeedback" hidden></output>', '''        <output class="exit-feedback" id="exitFeedback" hidden></output>
        <output id="onlineRank" class="online-rank" hidden></output>
        <output id="onlineLatency" class="online-latency" hidden></output>''')
html('<span class="brake-hint" id="brakeHint" hidden></span>',
     '<span id="draftPill" class="draft-pill" hidden>尾流破风</span><span class="brake-hint" id="brakeHint" hidden></span>')
html('      <div class="rider-tag friend-tag" id="friendTag" hidden></div>',
     '      <div class="rider-tag friend-tag" id="friendTag" hidden></div>\n      <div class="rider-tag online-tag" id="onlineTag0" hidden></div>\n      <div class="rider-tag online-tag" id="onlineTag1" hidden></div>\n      <div class="rider-tag online-tag" id="onlineTag2" hidden></div>')
html('<button class="float-button" id="mapZoom" type="button" aria-pressed="false">看赛道</button>',
     '<button class="float-button" id="mapZoom" type="button" aria-pressed="false">看赛道</button><button class="float-button" id="mapCompare" type="button" aria-pressed="true" hidden>走线对比</button>')
html('<thead><tr><th scope="col">路段</th><th scope="col">用时 (秒)</th><th scope="col">差距 (秒)</th></tr></thead>',
     '<thead><tr><th scope="col">路段</th><th scope="col">用时 (秒)</th><th scope="col">差距 (秒)</th><th scope="col">练习</th></tr></thead>')
html('        <button id="friendExport" class="action" type="button" hidden>导出影子文件</button>',
     '        <button id="reviewMapButton" class="action" type="button" hidden>俯视图走线对比</button>\n        <button id="practiceExit" class="action" type="button" hidden>退出单练</button>\n        <button id="friendExport" class="action" type="button" hidden>导出影子文件</button>')
html('      <div class="setting-line"><label for="settingsAA">抗锯齿</label><select id="settingsAA">\n        <option value="auto">自动</option><option value="fxaa">FXAA</option><option value="msaa">MSAA + FXAA</option><option value="off">关闭</option>\n      </select></div>',
     '      <div class="setting-line"><label for="settingsAA">抗锯齿</label><select id="settingsAA">\n        <option value="auto">自动</option><option value="fxaa">FXAA</option><option value="msaa">MSAA + FXAA</option><option value="off">关闭</option>\n      </select></div>\n      <div class="setting-line"><label for="settingsWeather">时段与天气</label><select id="settingsWeather">\n        <option value="day">正午晴天</option><option value="sunset">黄昏日落</option><option value="night">夜骑灯光</option><option value="rain">小雨湿地</option>\n      </select></div>\n      <div class="setting-line"><label for="settingsWindSpeed">地图风速（m/s）<small>0 为无风，0–15 m/s（周赛自带风场除外）</small></label><input id="settingsWindSpeed" type="number" min="0" max="15" step="0.5" value="0"></div>\n      <div class="setting-line"><label for="settingsWindDir">地图风向</label><select id="settingsWindDir">\n        <option value="0">偏西风</option><option value="1">西北风</option><option value="2">偏北风</option><option value="3">东北风</option><option value="4">偏东风</option><option value="5">东南风</option><option value="6">偏南风</option><option value="7">西南风</option>\n      </select></div>')
html('        <p class="bike-note" id="brakeNote"></p>', '''        <p class="bike-note" id="brakeNote"></p>
        <div class="setting-line"><label for="bikeFrame">车架几何</label><select id="bikeFrame">
          <option value="stock">综合车架</option><option value="aero">气动车架</option><option value="agile">灵活短轴</option>
        </select></div>
        <p class="bike-note" id="frameNote"></p>
        <div class="setting-line"><label for="bikeSprint">冲刺调校</label><select id="bikeSprint">
          <option value="stock">均衡冲刺</option><option value="burst">爆发冲刺</option><option value="endurance">耐力冲刺</option>
        </select></div>
        <p class="bike-note" id="sprintNote"></p>''')
html('''        </dl>
        </div>
      </div>
      <footer class="settings-actions">''', '''        </dl>
        </div>
        <div id="motorTuning" hidden>
          <dl class="bike-stats workshop-speeds" aria-live="polite">
            <div><dt>铺装极速</dt><dd id="vehTopSpeed"></dd></div>
            <div><dt>碎石极速</dt><dd id="vehGravel"></dd></div>
            <div><dt>草地极速</dt><dd id="vehGrass"></dd></div>
          </dl>
          <div class="workshop-ability" id="vehAbility" aria-label="相对原厂能力"></div>
          <details class="workshop-group" open><summary>性能调校</summary>
          <div class="setting-line"><label for="vehSlot0" id="vehLabel0">槽位一</label><select id="vehSlot0"></select></div>
          <p class="bike-note" id="vehNote0"></p>
          <div class="setting-line"><label for="vehSlot1" id="vehLabel1">槽位二</label><select id="vehSlot1"></select></div>
          <p class="bike-note" id="vehNote1"></p>
          <div class="setting-line"><label for="vehSlot2" id="vehLabel2">槽位三</label><select id="vehSlot2"></select></div>
          <p class="bike-note" id="vehNote2"></p>
          </details>
        </div>
      </div>
      <footer class="settings-actions">''')
html('      <div class="settings-result" id="settingsStatus">等待 3D 画面</div>', '''      <div class="settings-result" id="settingsStatus">等待 3D 画面</div>
      <div class="setting-line"><label>存档备份<small>启动器自动写入 save/player-data.json</small></label><div class="save-actions"><button class="action" id="saveExport" type="button">导出备份</button><button class="action" id="saveImport" type="button">导入备份</button><input id="saveFile" type="file" accept=".json,application/json" hidden></div></div>
      <p class="bike-note" id="saveStatus" role="status"></p>''')

# 1.6.0 Bicycle workshop, riding posture, and configuration-driven geometry.
js('const bikeKey=', content('bike-workshop.js')+'\n\n'+content('bike-models.js')+'\n\nconst bikeKey=')
js('paint:knownPaint(saved?.paint)};', 'paint:knownPaint(saved?.paint),look:bicycleStyle(saved?.look)};')
js("function makeRider(paint='classic') {", "function makeRider(paint='classic',look=bicycleStyle(),tyres='stock',geometry='stock',includeBody=true) {")
js("  const chrome='#90a69c',rubber='#242d2b';\n  const head = [.426, .876, 0];",
   """  const chrome='#90a69c',rubber='#242d2b',trim=bicycleTrim[look.trim];
  const aero=look.category==='road'||geometry==='aero', light=look.category==='climb'||geometry==='agile';
  const head = [.426, aero?.846:.876, 0];""")
js('  const seatTube = [-.192, .764, 0];', '  const seatTube = [light?-.168:-.192, look.category===\'gravel\'?.719:.764, 0];')
js("  frame.tube(CRANK, fork, .051, .038, teal, 11);",
   """  if(aero) frame.ellipsoid([.261,.545,0],[.378,.047,.025],teal,14,7,.82);
  else frame.tube(CRANK,fork,light?.032:.051,light?.027:.038,teal,11);""")
js('], [.179, .027, .084], rubber, 14, 6);', '], [.179, .027, .084], trim, 14, 6);')
js('], [.083, .026, .105], rubber, 12, 5);', '], [.083, .026, .105], trim, 12, 5);')
js("  frame.tube([-.09, .530, 0], [-.122, .667, .001], .033, .036, '#d5c995', 10);\n  frame.tube([-.123, .658, 0], [-.125, .692, 0], .027, .019, '#4a5e53', 9);\n", '')
js_span('    steering.tube(toFork([.432, 1.008', '  steering.tube(toFork([head[0]', '  }\n  makeBicycleBar(steering,toFork,look);\n')
js_span('  wheels.torus(.325, .022, rubber', '  body.ellipsoid([-.223, .982',
        '  makeBicycleWheel(wheels,look,tyres);\n  addBicycleAccessory(frame,steering,pivot,look,paint);\n  if (includeBody) {\n')
js_span("  if(paint==='shared') {\n    frontBasket(steering", '  return {frame,wheels,steering,body,pivot};', '  }\n')
js('''function movingParts(distance, steerTransform) {
  const shape = new Shape();
  const spin = -distance / TYRE_RADIUS / WHEEL_TEETH_RATIO;
  const bob = .009 * Math.cos(spin * 2);''', '''function movingParts(distance, steerTransform, grip=grips, rider) {
  const shape = new Shape();
  const spin = rider?.pedalPhase??(-distance / TYRE_RADIUS / WHEEL_TEETH_RATIO);
  const tuck=rider?.tuck??0, stand=rider?.stand??0;
  const bob = .009*Math.cos(spin*2)+stand*.012*Math.sin(spin);
  const bodyPose=bicycleBodyTransform({tuck,stand,bob});''')
js('    const hip = [-.222, .990 + bob, side * .109];','    const hip = transform(bodyPose,[-.222,.990,side*.109]);')
js('''    const shoulder = [-.02, 1.347 + bob, side * .143];
    const hand = transform(steerTransform, [grips[0], grips[1] + .016, side * grips[2]]);
    const elbow = [.151, 1.136 + bob * .6, side * .204];''', '''    const shoulder = transform(bodyPose,[-.02,1.347,side*.143]);
    const hand = transform(steerTransform,[grip[0],grip[1]+.016,side*grip[2]]);
    const elbow = lerpPoint(transform(bodyPose,[.151,1.136,side*.204]),hand,tuck*.25);''')
js('  return { shape, bob };', '  return {shape,bodyPose};')

js('''  if (rider.sprinting) {
    rider.energy=Math.max(0,rider.energy-dt*.193*(bike.sprintDrain??1));''', '''  const grade=riderGrade(p,rider.heading);
  if (cycling) updateBicyclePosture(rider,input,grade,dt);
  const tuck=cycling?(rider.tuck??0):0, stand=cycling?(rider.stand??0):0;
  if (rider.sprinting) {
    rider.energy=Math.max(0,rider.energy-dt*.193*(bike.sprintDrain??1)*(1+.28*stand));''')
js('  const grade=riderGrade(p,rider.heading);\n  const hillAcceleration', '  const hillAcceleration')
js('  const limit=flatLimit*topSpeedEffect*(rider.drafting?1.045:1);',
   '  const limit=flatLimit*(topSpeedEffect+tuck*clamp(-grade*.27,0,.032))*(rider.drafting?1.045:1);')
js('*(rider.drafting?.76:1);', '*(rider.drafting?.76:1)*(1-tuck*.36);')
js("    const force=rider.throttle*(rider.sprinting?7.64*(bike.sprintForce??1):groundForce)*gearing;",
   "    const force=rider.throttle*(rider.sprinting?7.64*(bike.sprintForce??1)*(1+stand*(bike.frame==='agile'?.20:.15)):groundForce)*gearing;")
js('*(bike.steerScale??1);\n  rider.steering', '*(bike.steerScale??1)*(1-.14*tuck);\n  rider.steering')
js('  rider.heading+=rider.yawRate*dt;', '  if(cycling) rider.gripLoad=Math.abs(rider.yawRate)*velocity/grip;\n  rider.heading+=rider.yawRate*dt;')

js("  'bikeFrame','frameNote','bikeSprint','sprintNote','motorTuning'", """  'bikePresets','bikePresetName','bikeSprintSpeed','bikeGravel','bikeStyles','bikeAbility','bikeFeedback','bikePosture','bikeGripMeter',
  'bikeFrame','frameNote','bikeSprint','sprintNote','motorTuning'""")
js('  setText(ui.bikeAcceleration, Math.round(bike.force * 100) + \'%\');\n}',
   '''  setText(ui.bikeSprintSpeed, (bike.sprintSpeed * 3.6).toFixed(1) + ' km/h');
  setText(ui.bikeAcceleration, Math.round(bike.force * 100) + '%');
  if(bicycle) renderWorkshop(bike,locked);
  refreshBicycleModels();
}''')
js('function initSettings() {\n  fillPreferences();', 'function initSettings() {\n  initBicycleWorkshop();\n  fillPreferences();')
js("  const grade=Math.round(riderGrade(race.rider.position,race.rider.heading)*100);\n  ui.slopeGrade.hidden=Math.abs(grade)<2;\n  if(!ui.slopeGrade.hidden) setText(ui.slopeGrade,(grade>0?'上坡 +':'下坡 −')+Math.abs(grade)+'%');",
   '''  const grade=riderGrade(race.rider.position,race.rider.heading)*100;
  ui.slopeGrade.hidden=!bicycle;
  ui.bikeFeedback.hidden=!bicycle;
  if(bicycle) {
    const {posture,gripLoad}=race.rider;
    setText(ui.slopeGrade,(grade>.05?'↗ +':grade<-.05?'↘ −':'坡度 ')+Math.abs(grade).toFixed(1)+'%');
    const showPosture=posture==='tuck'||posture==='stand';
    ui.bikePosture.hidden=!showPosture;
    if(showPosture) {
      ui.bikePosture.dataset.posture=posture;
      setText(ui.bikePosture,posture==='tuck'?'伏身破风':'起身摇车');
    } else delete ui.bikePosture.dataset.posture;
    const load=clamp(gripLoad??0,0,1), remaining=Math.round(100*(1-load));
    ui.bikeGripMeter.value=remaining;
    ui.bikeGripMeter.dataset.load = load>.90?'limit':load>.72?'high':'normal';
  } else {
    ui.bikePosture.hidden=true;
    delete ui.bikePosture.dataset.posture;
  }''')

js_span('  const model = makeRider();', '  const cheer=chairCheerClock();', '''  const body=new gpu.Mesh(makeRider().body), limbs=new gpu.Mesh(new Shape(),0,null,true);
  const ghostLimbs=new gpu.Mesh(new Shape(),0,null,true), roomLimbs=[];
  const motorRigs=new Map(), bicycleRigs=bicycleRigCache(gpu);
  let ownBicycle,friendBicycle,remoteBicycles=new Map();
  const getRig=kind=>motorRigs.get(kind);
  function prepareMotor(vehicle) {
    if(vehicle!=='bike'&&!motorRigs.has(vehicle)) motorRigs.set(vehicle,uploadPoweredRig(gpu,vehicle));
  }
  refreshBicycleModels=()=>{
    const selected=bicycleRigs.prepare(bicycleAppearance(driverProfile,race.bike));
    if(ownBicycle!==selected) {ownBicycle=selected;graphicsRevision++;}
    const opponent=race.opponent;
    friendBicycle=opponent?.vehicle==='bike'?bicycleRigs.prepare(bicycleAppearance(opponent,opponent.bike)):ownBicycle;
    prepareMotor(race.rider.vehicle);
    if(opponent) prepareMotor(opponent.vehicle);
    const state=onlineRoom?.state;
    const peers=state?.players.filter(player=>player.id!==onlineRoom.id)??[];
    remoteBicycles=new Map();
    for(const player of peers) {
      const vehicle=state.vehicleRule==='any'?knownVehicle(player.vehicle):knownVehicle(state.vehicleRule);
      if(vehicle==='bike') remoteBicycles.set(player.id,bicycleRigs.prepare(bicycleAppearance(player,player.bike)));
      else prepareMotor(vehicle);
    }
    while(roomLimbs.length<Math.min(3,peers.length)) roomLimbs.push(new gpu.Mesh(new Shape(),0,null,true));
  };
  refreshBicycleModels();
''')
js_span('    const turn=-.253*ghost.steering;', '  function trafficNear(eye,time)', '''    const rig=ghost.id?remoteBicycles.get(ghost.id)??ownBicycle:friendBicycle;
    const turn=-.253*ghost.steering;
    const forkPose=placement(rig.pivot,0,turn,0);
    const steer=multiply(forkPose,placement(scale(rig.pivot,-1)));
    const pose=movingParts(ghost.travel,steer,rig.grip);
    limbMesh.update(pose.shape);
    const spin=-ghost.travel/TYRE_RADIUS;
    const lean=ghost.steering*clamp(Math.abs(ghost.speed)*.026,0,.216);
    const root=placement(add(ghost.position,[0,.006,0]),lean,-ghost.heading,pitch);
    return [[rig.frame,root],[rig.wheel,multiply(root,placement(REAR,0,0,spin))],
      [rig.wheel,multiply(root,placement(transform(steer,FRONT),0,turn,spin))],
      [rig.fork,multiply(root,forkPose)],[body,multiply(root,pose.bodyPose)],[limbMesh,root]];
  }
''')
js('let previousCamera, travel=Infinity, steering=Infinity, parts,bow,facing,waterTime=0,animationId,lastCameraRevision=-1;',
   'let previousCamera, steering=Infinity, parts,bow,facing,waterTime=0,animationId,lastCameraRevision=-1,poseRig,posePhase,poseTuck,poseStand;')
js_span('    const root=placement(add(p,[0,.004,0]),rider.lean,-rider.heading,pitch);', '    if(lastCameraRevision!==cameraRevision)', '''    const root=placement(add(p,[0,.004,0]),rider.lean+(rider.vehicle==='bike'?bicycleRock(rider):0),-rider.heading,pitch);
    let riderMeshes,tagHeight=1.88;
    if(rider.vehicle==='bike') {
      const rig=ownBicycle, angle=-.253*rider.steering;
      const phase=rider.pedalPhase??0, tuck=Math.round((rider.tuck??0)*256)/256, stand=Math.round((rider.stand??0)*256)/256;
      if(!parts||poseRig!==rig||posePhase!==phase||poseTuck!==tuck||poseStand!==stand||steering!==angle) {
        facing=placement(rig.pivot,0,angle,0);
        bow=multiply(facing,placement(scale(rig.pivot,-1)));
        parts=movingParts(rider.travel,bow,rig.grip,{pedalPhase:phase,tuck,stand});
        limbs.update(parts.shape);
        poseRig=rig; posePhase=phase; poseTuck=tuck; poseStand=stand; steering=angle;
      }
      const wheel=-rider.travel/TYRE_RADIUS;
      riderMeshes=[[rig.frame,root],[rig.wheel,multiply(root,placement(REAR,0,0,wheel))],
        [rig.wheel,multiply(root,placement(transform(bow,FRONT),0,angle,wheel))],
        [rig.fork,multiply(root,facing)],[body,multiply(root,parts.bodyPose)],[limbs,root]];
      tagHeight+=stand*.11-tuck*.16;
    } else {
      const rig=getRig(rider.vehicle);
      riderMeshes=poweredPose(rig,root,rider);
      tagHeight=rig.tagHeight;
    }
''')
js('      roomLimbs[index]??=new gpu.Mesh(new Shape(),0,null,true);\n      ghosts.push', '      if(!roomLimbs[index]) continue;\n      ghosts.push')
js('  race.select(event,opponent);\n  cameraRevision++;', '  race.select(event,opponent);\n  refreshBicycleModels();\n  cameraRevision++;')
js('''      this.vehicle=vehicle;
      this.freeRide();''', '''      this.vehicle=vehicle;
      this.freeRide();
      if(typeof race!=='undefined'&&this===race) refreshBicycleModels();''')
js('      time,vehicle:this.rider.vehicle,splits:this.splits.slice(),samples:this.frames,corners:this.cornerScores.slice()',
   '''      time,vehicle:this.rider.vehicle,splits:this.splits.slice(),samples:this.frames,corners:this.cornerScores.slice(),
      ...(this.rider.vehicle==='bike'&&typeof driverProfile!=='undefined'?{appearance:bicycleAppearance(driverProfile,this.rider.bike)}:{})''')

html('<div class="setting-line"><label for="bikePaint">涂装</label><select id="bikePaint"></select></div>',
     '''<div class="workshop-presets" id="bikePresets" aria-label="流派预设"></div>
          <p class="bike-note" id="bikePresetName"></p>
          <dl class="bike-stats workshop-speeds" aria-live="polite">
            <div><dt>铺装极速</dt><dd id="bikeTopSpeed"></dd></div>
            <div><dt>碎石极速</dt><dd id="bikeGravel"></dd></div>
            <div><dt>草地极速</dt><dd id="bikeGrass"></dd></div>
            <div><dt>冲刺极速</dt><dd id="bikeSprintSpeed"></dd></div>
          </dl>
          <div class="workshop-ability" id="bikeAbility" aria-label="相对原厂能力"></div>
          <details class="workshop-group" open><summary>性能调校</summary>''')
html('''        <dl class="bike-stats" aria-live="polite">
          <div><dt>巡航极速</dt><dd id="bikeTopSpeed"></dd></div>
          <div><dt>弯道抓地</dt><dd id="bikeGrip"></dd></div>
          <div><dt>低速推力</dt><dd id="bikeAcceleration"></dd></div>
          <div><dt>草地极速</dt><dd id="bikeGrass"></dd></div>
          <div><dt>直线制动</dt><dd id="bikeBrakePower"></dd></div>
          <div><dt>带刹抓地</dt><dd id="bikeBrakeGrip"></dd></div>
        </dl>''',
     '''        </details>
          <details class="workshop-group"><summary>外观定制</summary>
            <div class="setting-line"><label for="bikePaint">涂装</label><select id="bikePaint"></select></div>
            <div id="bikeStyles"></div>
          </details>
        <dl class="bike-stats" aria-live="polite">
          <div><dt>弯道抓地</dt><dd id="bikeGrip"></dd></div>
          <div><dt>低速推力</dt><dd id="bikeAcceleration"></dd></div>
          <div><dt>直线制动</dt><dd id="bikeBrakePower"></dd></div>
          <div><dt>带刹抓地</dt><dd id="bikeBrakeGrip"></dd></div>
        </dl>''')
html('<div class="speedometer"><span class="speed-mat" id="surfaceType">柏油路</span><strong id="velocity">0</strong><small>km/h</small><span id="slopeGrade" class="slope-grade" hidden></span><div class="sprint-meter" id="sprintMeter" role="meter" aria-label="冲刺耐力" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><i id="sprintFill"></i></div><span class="sprint-hint" id="sprintHint">冲刺耐力</span><span id="draftPill" class="draft-pill" hidden>尾流破风</span><span class="brake-hint" id="brakeHint" hidden></span></div>',
     '''<div class="speedometer"><div class="speed-badges" id="speedBadges"><span id="bikePosture" class="status-pill posture-pill" hidden></span><span id="draftPill" class="draft-pill" hidden>尾流破风</span></div><span class="speed-mat" id="surfaceType">柏油路面</span><div class="speed-readout"><strong id="velocity">0</strong><small>km/h</small><span id="slopeGrade" class="slope-grade" hidden></span></div><div class="sprint-meter" id="sprintMeter" role="meter" aria-label="冲刺耐力" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><i id="sprintFill"></i></div><span class="sprint-hint" id="sprintHint">冲刺耐力</span><div id="bikeFeedback" class="bike-feedback" hidden>
        <label>抓地 <meter id="bikeGripMeter" min="0" max="100" value="100"></meter></label>
      </div><span class="brake-hint" id="brakeHint" hidden></span></div>''')
html('  .seed-button { white-space:nowrap; }',content('bike-workshop.css')+'\n  .seed-button { white-space:nowrap; }')

js('function denseBlocks() {',content('shenzhen-perimeter.js')+'\n\nfunction denseBlocks() {')
# Secondary crown lobes and 13 cm fruit occupy only a few pixels at riding distance.
js('palette[i % palette.length], 9, 5, range(-.19, .19), a);',
   'palette[i % palette.length], 8, 4, range(-.19, .19), a);')
js('tint(palette[(i + 1) % palette.length], 1.07), 8, 5);',
   'tint(palette[(i + 1) % palette.length], 1.07), 7, 4);')
js("[.064, .070, .063], '#b6533e', 6, 4);","[.064, .070, .063], '#b6533e', 5, 3);")
js('''  scenery.tube(b, add(b, bend), s * .184, s * .101, trunk, 8);
  scenery.tube(add(b, scale(bend, .85)), crown, s * .095, s * .048, '#786647', 7);
  const radius = range(1.42, 2.01) * s;
  foliage.ellipsoid(crown, [radius * 1.05, radius * .92, radius], palette[0], 11, 7);
  for (let i = 0; i < 7; i++) {
    const a = TAU * i / 7 + range(-.30, .30), r = radius * range(.48, .98);
    const end = add(crown, [Math.cos(a) * r, range(-.5, .73) * s, Math.sin(a) * r]);
    const bulb = radius * range(.49, .79);
    if (i < 5) scenery.tube(add(b, scale(bend, range(.66, .99))), end, s * .085, s * .026, trunk, 6);
    foliage.ellipsoid(end, [bulb * range(.90, 1.27), bulb * range(.66, 1.17), bulb * range(.89, 1.22)], palette[i % palette.length], 8, 4, range(-.19, .19), a);
    const high = add(end, [range(-.4, .4) * s, .53 * s, range(-.4, .4) * s]);
    if (i % 2 === 0) foliage.ellipsoid(high, [bulb * .64, bulb * .53, bulb * .72], tint(palette[(i + 1) % palette.length], 1.07), 7, 4);
    if (variant === 1 && i % 3 === 0 && s > 1) {
      for (let j = 0; j < 7; j++) {
        scenery.ellipsoid(add(end, [range(-.47, .47), -bulb * .62 + range(-.13, .10), range(-.43, .43)]), [.064, .070, .063], '#b6533e', 5, 3);
      }
    }
  }
  for (let i = 0; i < 4; i++) {
    const a = TAU * i / 4 + variant;
    scenery.tube([x + Math.sin(a) * .42 * s, .018, z + Math.cos(a) * .43 * s], add(b, [0, .31 * s, 0]), .035 * s, .12 * s, trunk, 5, false);
  }''', '''  scenery.tube(b, add(b, bend), s * .184, s * .101, trunk, light ? 6 : 8);
  scenery.tube(add(b, scale(bend, .85)), crown, s * .095, s * .048, '#786647', light ? 5 : 7);
  const radius = range(1.42, 2.01) * s;
  foliage.ellipsoid(crown, [radius * 1.05, radius * .92, radius], palette[0], light ? 8 : 11, light ? 5 : 7);
  for (let i = 0; i < 7; i++) {
    const a = TAU * i / 7 + range(-.30, .30), r = radius * range(.48, .98);
    const end = add(crown, [Math.cos(a) * r, range(-.5, .73) * s, Math.sin(a) * r]);
    const bulb = radius * range(.49, .79);
    const bt = i < 5 ? range(.66, .99) : 0;
    if (i < 5 && !light) scenery.tube(add(b, scale(bend, bt)), end, s * .085, s * .026, trunk, 6);
    foliage.ellipsoid(end, [bulb * range(.90, 1.27), bulb * range(.66, 1.17), bulb * range(.89, 1.22)], palette[i % palette.length], light ? 6 : 8, light ? 3 : 4, range(-.19, .19), a);
    const high = add(end, [range(-.4, .4) * s, .53 * s, range(-.4, .4) * s]);
    if (i % 2 === 0) foliage.ellipsoid(high, [bulb * .64, bulb * .53, bulb * .72], tint(palette[(i + 1) % palette.length], 1.07), light ? 5 : 7, light ? 3 : 4);
    if (variant === 1 && i % 3 === 0 && s > 1) {
      for (let j = 0; j < 7; j++) {
        const pos = add(end, [range(-.47, .47), -bulb * .62 + range(-.13, .10), range(-.43, .43)]);
        if (j % 2 === 0) scenery.box(pos, [.115, .120, .115], '#b6533e');
      }
    }
  }
  for (let i = 0; i < 4; i++) {
    const a = TAU * i / 4 + variant;
    scenery.tube([x + Math.sin(a) * .42 * s, .018, z + Math.cos(a) * .43 * s], add(b, [0, .31 * s, 0]), .035 * s, .12 * s, trunk, light ? 4 : 5, false);
  }''')
js('''  let root = base;
  for (let i = 1; i <= 12; i++) {
    const next = lerpPoint(base, top, i / 12);
    next[0] -= .43 * Math.sin(Math.PI * i / 12) * size;
    scenery.tube(root, next, (.168 - i * .0057) * size, (.163 - i * .0057) * size, tint(trunk, .91 + .055 * (i % 4)), 8, false);
    root = next;
  }
  scenery.ellipsoid(top, [.31 * size, .41 * size, .31 * size], '#5b7141', 10, 5);
  for (let i = 0; i < 12; i++) {
    const bearing = i * 2.39996 + range(-.08, .08);
    const d = [Math.cos(bearing), 0, Math.sin(bearing)], side = unitRight(d);
    const reach = size * range(1.65, 3.13);
    const origin = add(top, [0, size * (i % 4) * .07, 0]);
    const point = (t) => add(origin, [d[0] * t * reach, (Math.sin(t * Math.PI) * (.60 + (i % 5) * .16) - t * t * .63) * size, d[2] * t * reach]);
    for (let j = 0; j < 10; j++) {''', '''  let root = base;
  const trunkSteps = light ? 6 : 12, trunkSides = light ? 6 : 8, frondSteps = light ? 6 : 10;
  for (let i = 1; i <= trunkSteps; i++) {
    const u = i / trunkSteps, next = lerpPoint(base, top, u);
    next[0] -= .43 * Math.sin(Math.PI * u) * size;
    scenery.tube(root, next, (.168 - u * 12 * .0057) * size, (.163 - u * 12 * .0057) * size, tint(trunk, .91 + .055 * (i % 4)), trunkSides, false);
    root = next;
  }
  scenery.ellipsoid(top, [.31 * size, .41 * size, .31 * size], '#5b7141', light ? 6 : 10, light ? 4 : 5);
  for (let i = 0; i < 12; i++) {
    const bearing = i * 2.39996 + range(-.08, .08);
    const d = [Math.cos(bearing), 0, Math.sin(bearing)], side = unitRight(d);
    const reach = size * range(1.65, 3.13);
    const origin = add(top, [0, size * (i % 4) * .07, 0]);
    const point = (t) => add(origin, [d[0] * t * reach, (Math.sin(t * Math.PI) * (.60 + (i % 5) * .16) - t * t * .63) * size, d[2] * t * reach]);
    for (let j = 0; j < frondSteps; j++) {''')
js('      const t = j / 10, n = (j + 1) / 10;', '      const t = j / frondSteps, n = (j + 1) / frondSteps;')
# Performance optimizations: compact lamppost, UCL railings/lanterns, and upper-story facade trim culling.
js('''function lamppost(x, z, dir) {
  const at = (u, y) => [x + dir[0] * u, y, z + dir[2] * u];
  const paint = '#495a50';
  scenery.tube(at(0, 0), at(0, .27), .115, .083, paint, 9);
  scenery.tube(at(0, .15), at(0, 3.35), .062, .041, paint, 8);
  scenery.tube(at(0, 3.31), at(.29, 3.62), .042, .037, paint, 8);
  scenery.tube(at(.27, 3.61), at(.72, 3.62), .038, .036, paint, 8);
  scenery.ellipsoid(at(.76, 3.615), [.21, .071, .13], '#54635a', 12, 6, 0, -Math.atan2(dir[2], dir[0]));
  scenery.ellipsoid(at(.80, 3.576), [.149, .033, .093], '#ded9b9', 12, 6, 0, -Math.atan2(dir[2], dir[0]));
}''', '''function lamppost(x, z, dir) {
  const at = (u, y) => [x + dir[0] * u, y, z + dir[2] * u];
  const paint = '#495a50';
  scenery.tube(at(0, 0), at(0, .27), .115, .083, paint, 6);
  scenery.tube(at(0, .15), at(0, 3.35), .062, .041, paint, 6);
  scenery.tube(at(0, 3.31), at(.29, 3.62), .042, .037, paint, 5);
  scenery.tube(at(.27, 3.61), at(.72, 3.62), .038, .036, paint, 5);
  const yaw = -Math.atan2(dir[2], dir[0]);
  scenery.box(at(.76, 3.615), [.36, .11, .21], '#54635a', yaw);
  scenery.box(at(.80, 3.555), [.25, .045, .15], '#ded9b9', yaw);
}''')
js('''    const count=Math.ceil(span/.77);
    for(let i=0;i<=count;i++) {
      const t=mix(from,to,i/count);
      scenery.box([mix(x,xx,t),.59,mix(z,zz,t)],[.065,1.17,.065],rail);
    }''', '''    const count=Math.ceil(span/1.35);
    for(let i=0;i<=count;i++) {
      const t=mix(from,to,i/count), px=mix(x,xx,t), pz=mix(z,zz,t);
      scenery.tube([px,0,pz],[px,1.18,pz],.038,.038,rail,4,false);
    }''')
js('''function londonLantern(x,z) {
  scenery.tube([x,0,z],[x,3.13,z],.093,.046,'#444a49',8);
  scenery.box([x,3.37,z],[.34,.42,.34],'#d8c9a4',Math.PI/4);
  scenery.tube([x,3.54,z],[x,3.78,z],.26,.05,'#484e4c',4);
}''', '''function londonLantern(x,z) {
  scenery.tube([x,0,z],[x,3.13,z],.093,.046,'#444a49',6,false);
  scenery.box([x,3.37,z],[.34,.42,.34],'#d8c9a4',Math.PI/4);
  scenery.tube([x,3.54,z],[x,3.78,z],.26,.05,'#484e4c',4,false);
}''')
js('''  const center=face.point(u,spring,.026);
  for(let i=0;i<8;i++) {
    const a=i*Math.PI/8,b=(i+1)*Math.PI/8;''', '''  const center=face.point(u,spring,.026);
  for(let i=0;i<5;i++) {
    const a=i*Math.PI/5,b=(i+1)*Math.PI/5;''')
js('''          face.panel(u,y,width+.22,h+.19,trim);
          face.panel(u,y,width,h,tone,.033);
          face.panel(u,y+.20,width,.069,'#a7aaa2',.046);
          face.panel(u,y,.060,h,'#a7aaa2',.045);
          if(style!=='modern') face.panel(u,y-h/2-.093,width+.44,.12,trim,.067);''',
   '''          face.panel(u,y,width+.22,h+.19,trim);
          face.panel(u,y,width,h,tone,.033);
          if(floor<2) {
            face.panel(u,y+.20,width,.069,'#a7aaa2',.046);
            face.panel(u,y,.060,h,'#a7aaa2',.045);
            if(style!=='modern') face.panel(u,y-h/2-.093,width+.44,.12,trim,.067);
          }''')
js('''        } else {
          face.panel(u,y,pane,.09,'#b5b2a8',.19);
          face.panel(u,y-tall/2-.12,pane+.39,.13,'#d7cebd',.23);
        }
      }
    }
    for(const y of [.34,.88]) masonry.box(face.point(center+.65,y,.70),
      [width*.62,.075,.07],'#424544',face.yaw);
    for(let j=0;j<7;j++) masonry.box(face.point(center+.65+(j/6-.5)*width*.62,.50,.70),
      [.055,.98,.06],'#454844',face.yaw);''',
   '''        } else if(floor<2) {
          face.panel(u,y,pane,.09,'#b5b2a8',.19);
          face.panel(u,y-tall/2-.12,pane+.39,.13,'#d7cebd',.23);
        }
      }
    }
    for(const y of [.34,.88]) masonry.box(face.point(center+.65,y,.70),
      [width*.62,.075,.07],'#424544',face.yaw);
    for(let j=0;j<4;j++) {
      const [px,,pz]=face.point(center+.65+(j/3-.5)*width*.62,.50,.70);
      masonry.tube([px,.01,pz],[px,.99,pz],.032,.032,'#454844',4,false);
    }''')
js('''        face.panel(u,y,bay*.51,pitch*.69,frame,.027);
        face.panel(u,y,bay*.40,pitch*.61,level%4===1?'#657073':'#4d585d',.040);
        face.panel(u,y-pitch*.36,bay*.55,.105,cornice,.071);
        face.panel(u,y,.048,pitch*.62,'#9b988d',.058);''',
   '''        face.panel(u,y,bay*.51,pitch*.69,frame,.027);
        face.panel(u,y,bay*.40,pitch*.61,level%4===1?'#657073':'#4d585d',.040);
        if(!tower&&level<2) {
          face.panel(u,y-pitch*.36,bay*.55,.105,cornice,.071);
          face.panel(u,y,.048,pitch*.62,'#9b988d',.058);
        }''')
js('const courts=[', '''// Additional wings in the documented teaching and student residential districts.
const campusEdgeWings=[
  ['西南学生生活区',clay,5,[[-160,232],[-140,232],[-104,232],[-84,236],[-64,236],[-92,208]]],
  ['北区教学组团',limestone,4,[[68,-199],[88,-199],[108,-199],[180,-199],[200,-199],[204,-179]]],
  ['沧海教学组团',sage,5,[[278,196],[254,220],[226,224],[290,224]]]
].flatMap(([district,palette,floors,sites])=>sites.map(([x,z])=>({
  ...campusFootprint(x,z,13,7),name:'',use:'组团配楼',district,palette,floors,priority:0
})));
for(const block of campusEdgeWings) if(fitDistrictBlock(block,campus)) campus.push(block);
const courts=[''')
js('    officeTower(x,z,w,d,clearSkylineView', '''    if(perimeterConflict(x,z,w+8.6,d+8.2)||citySolid.some(b=>
      Math.abs(x-b.x)<(w+3.9+b.w)/2+1&&Math.abs(z-b.z)<(d+2.1+b.d)/2+1)) continue;
    officeTower(x,z,w,d,clearSkylineView''')
js("    officeTower(x,z,w,d,h,'#b4ae9f'", """    if(perimeterConflict(x,z,w+3.9,d+2.1)||citySolid.some(b=>
      Math.abs(x-b.x)<(w+3.9+b.w)/2+1&&Math.abs(z-b.z)<(d+2.1+b.d)/2+1)) continue;
    officeTower(x,z,w,d,h,'#b4ae9f'""")
js('  denseBlocks();\n  shenzhenLandmarks();', '''  denseBlocks();
  for(const lot of perimeterLots) drawStreetBlock(lot);
  drawLixiangPark();
  shenzhenLandmarks();''')
js('citySolid.push({x,z,w:w+3.9,d:d+2.1});',"citySolid.push({x,z,w:w+3.9,d:d+2.1,kind:'tower'});")
js('!exploring || !cityStreetAt(x,z) || cityBlocked(x,z)', '!exploring || !(cityStreetAt(x,z)||onParkWalk(x,z)) || cityBlocked(x,z)')
js('  for(const path of cityRoads.keys()) {\n    mapPath(ctx,project,path.rows.map(r=>r.p));', '''  mapPath(ctx,project,parkOutline.map(([x,z])=>[x,0,z]),true);
  ctx.fillStyle=compact?'#5e804e':'#96b782';ctx.fill();
  for(const path of parkWalks) {
    mapPath(ctx,project,path.rows.map(r=>r.p));
    ctx.lineWidth=Math.max(.7,path.width*2*fit);ctx.strokeStyle='#d9cfb6';ctx.stroke();
  }
  for(const b of citySolid) {
    if(b.kind!=='frontage'&&b.kind!=='tower') continue;
    const [px,py]=project([b.x-b.w/2,0,b.z-b.d/2]);
    ctx.fillStyle=compact?'#6c7977':b.kind==='frontage'?'#9caaa5':'#aab2ac';
    ctx.fillRect(px,py,b.w*fit,b.d*fit);
  }
  for(const path of cityRoads.keys()) {
    mapPath(ctx,project,path.rows.map(r=>r.p));''')
js("['南海大道',-142,25],['深南大道',-11,-244]", "['荔香公园',parkX,parkZ],...perimeterLots.filter(l=>l.name).map(l=>[l.name,l.x,l.z]),['南海大道',-142,25],['深南大道',-11,-244]")
js('  return citySolid.some(b=>Math.abs(x-b.x)<b.w/2+.34&&Math.abs(z-b.z)<b.d/2+.34);',
   '''  const nearby=ridingObstacles?.region==='szu'?ridingObstacles.city.get(streetCell(x,z)):citySolid;
  return nearby?.some(b=>Math.abs(x-b.x)<b.w/2+.34&&Math.abs(z-b.z)<b.d/2+.34)??false;''')
js('uclFixtures.some(lot=>closeToBlock(x,z,lot,.28))','uclFixtureAt(x,z)')
js('  if(span) return {...span,half:Math.max(-span.minCross,span.maxCross)};',
   '  if(span) return {...span,half:Math.max(-span.minCross,span.maxCross)};\n  if(cityAccess&&!span&&onParkWalk(frame.p[0],frame.p[2])) return {half:1.95};')
js('''  const street=cityStreetAt(frame.p[0],frame.p[2]);
  if(!street) return null;
  const edge=direction=>{
    let inside=0;
    for(let d=.25;d<=42;d+=.25) {
      const [x,,z]=offsetVertex(frame,direction*d,0);
      if(!cityRoadContains(street,x,z,CITY_EDGE_MARGIN)) break;
      inside=d;
    }
    return direction*inside;
  };
  return {minCross:Math.min(-2.75,edge(-1)),maxCross:Math.max(2.75,edge(1))};''',
   '''  const street=cityStreetAt(frame.p[0],frame.p[2]);
  if(!street) return null;
  const ground=flyoverAt(frame.p[0],frame.p[2])===null;
  const edge=direction=>{
    let inside=0;
    for(let d=.25;d<=42;d+=.25) {
      const [x,,z]=offsetVertex(frame,direction*d,0);
      if(!cityRoadContains(street,x,z,CITY_EDGE_MARGIN)||cityBlocked(x,z)||buildingAt(x,z,.35)||(ground&&flyoverAt(x,z)!==null)) break;
      inside=d;
    }
    return direction*inside;
  };
  return {minCross:Math.min(-2.2,edge(-1)),maxCross:Math.max(2.2,edge(1))};''')
js('const courses=[',content('shenzhen-courses.js')+'\n\nconst courses=[')
js('  enduranceCourse(), ...hillCourses()','  enduranceCourse(), ...hillCourses(), ...perimeterCourses()')

# 1.6.4 Camera wall-avoidance stability (continuous raycast + pre-smooth desired eye)
js('''function avoidWall(origin,eye) {
  let clear = origin;
  for (const part of [.24,.43,.62,.81,1]) {
    const point = lerpPoint(origin,eye,part);
    if (buildingAt(point[0],point[2],.3,point[1])) return clear;
    clear = point;
  }
  return clear;
}''', '''function cityWallAt(x, z, y) {
  if (activeCampus !== 'szu' || inCampus(x, z) || y >= 38) return false;
  const nearby = ridingObstacles?.region === 'szu' ? ridingObstacles.city.get(streetCell(x, z)) : citySolid;
  return nearby?.some(b => (b.kind === 'frontage' || b.kind === 'tower') &&
    Math.abs(x - b.x) < b.w / 2 + .34 && Math.abs(z - b.z) < b.d / 2 + .34) ?? false;
}

function cameraWallHit(x, z, y) {
  return Boolean(buildingAt(x, z, .3, y)) || cityWallAt(x, z, y);
}

function avoidWall(origin,eye) {
  const steps = 20;
  let clear = 0;
  for (let i = 1; i <= steps; i++) {
    const part = i / steps;
    const point = lerpPoint(origin, eye, part);
    if (cameraWallHit(point[0], point[2], point[1])) {
      let lo = clear, hi = part;
      for (let k = 0; k < 8; k++) {
        const mid = (lo + hi) * .5;
        const probe = lerpPoint(origin, eye, mid);
        if (cameraWallHit(probe[0], probe[2], probe[1])) hi = mid;
        else lo = mid;
      }
      return lerpPoint(origin, eye, Math.max(0, lo - .006));
    }
    clear = part;
  }
  return eye;
}''')

js('''  target[1]+=rideElevation(target[0],target[2])-rideElevation(p[0],p[2]);
  if (prior && !motion.matches) {
    const smooth = 1 - Math.exp(-dt * (prior.postcard === postcard ? 7.85 : 4.9));
    eye = lerpPoint(prior.eye,eye,smooth);
    target = lerpPoint(prior.target,target,smooth);
  }
  const origin = add(p,add(scale(f,-.57),[0,2.7,0]));
  eye[1]=Math.max(eye[1],rideElevation(eye[0],eye[2])+1.45);
  eye = avoidWall(origin,eye);''', '''  target[1]+=rideElevation(target[0],target[2])-rideElevation(p[0],p[2]);
  let origin = add(p,add(scale(f,-.57),[0,2.7,0]));
  if (cameraWallHit(origin[0],origin[2],origin[1])) origin = [p[0],p[1]+2.15,p[2]];
  eye[1]=Math.max(eye[1],rideElevation(eye[0],eye[2])+1.45);
  eye = avoidWall(origin,eye);
  if (prior && !motion.matches) {
    const smooth = 1 - Math.exp(-dt * (prior.postcard === postcard ? 7.85 : 4.9));
    eye = lerpPoint(prior.eye,eye,smooth);
    target = lerpPoint(prior.target,target,smooth);
    eye[1]=Math.max(eye[1],rideElevation(eye[0],eye[2])+1.45);
    eye = avoidWall(origin,eye);
  }''')

# 1.6.4 Checkpoint lateral forgiveness, missed-gate detection, and pass feedback
js('''function crossesGate(gate,previous,next) {
  const a=dot(subtract(previous,gate.p),gate.f),b=dot(subtract(next,gate.p),gate.f);
  if (a>0||b<=0) return null;
  const at=-a/(b-a),hit=lerpPoint(previous,next,at);
  if(gate.rise>.4&&Math.abs(hit[1]-gate.p[1]-gate.rise)>.85) return null;
  const offset=dot(subtract(hit,gate.p),gate.side);
  return offset>=(gate.minCross??-gate.half)&&offset<=(gate.maxCross??gate.half)?at:null;
}''', '''function crossesGate(gate,previous,next,margin=0) {
  const a=dot(subtract(previous,gate.p),gate.f),b=dot(subtract(next,gate.p),gate.f);
  if (a>0||b<=0) return null;
  const at=-a/(b-a),hit=lerpPoint(previous,next,at);
  if(gate.rise>.4&&Math.abs(hit[1]-gate.p[1]-gate.rise)>.85) return null;
  const offset=dot(subtract(hit,gate.p),gate.side);
  return offset>=(gate.minCross??-gate.half)-margin&&offset<=(gate.maxCross??gate.half)+margin?at:null;
}''')

js('''function crossesRaceLine(gate, previous, position, flyover) {
  const dx = position[0] - gate.p[0], dz = position[2] - gate.p[2];
  if (dx*dx + dz*dz > (gate.half+.25)**2) return null;
  const crossed = crossesGate(gate, previous, position);
  if (crossed === null || !flyover) return crossed;
  const [x,y,z] = lerpPoint(previous, position, crossed);
  return Math.abs(y-rideElevation(x,z)-ROAD_Y-gate.rise) <= .95 ? crossed : null;
}''', '''function crossesRaceLine(gate, previous, position, flyover) {
  const margin = gate.rise > .4 ? .6 : 1.6;
  const dx = position[0] - gate.p[0], dz = position[2] - gate.p[2];
  if (dx*dx + dz*dz > (gate.half+margin+.35)**2) return null;
  const crossed = crossesGate(gate, previous, position, margin);
  if (crossed === null || !flyover) return crossed;
  const [x,y,z] = lerpPoint(previous, position, crossed);
  return Math.abs(y-rideElevation(x,z)-ROAD_Y-gate.rise) <= .95 ? crossed : null;
}''')

js('''    this.lastRejoin = -Infinity;
    this.lastRun=null;''', '''    this.lastRejoin = -Infinity;
    this.lastRun=null;
    this.lastGatePass = null;
    this.missedGate = false;''')

js('''  recordCheckpoint(previous) {
    const {gates,flyover} = this.event;
    const gate = gates[this.nextGate];
    const fraction = crossesRaceLine(gate,previous,this.rider.position,flyover);
    if (fraction === null) return false;
    const split = this.elapsed+fraction*STEP_MS;
    this.splits.push(split);
    this.routeAnchor = gate.distance;
    this.nextGate++;''', '''  recordCheckpoint(previous) {
    const {gates,flyover} = this.event;
    const gate = gates[this.nextGate];
    const fraction = crossesRaceLine(gate,previous,this.rider.position,flyover);
    if (fraction === null) {
      if (this.nextGate + 1 < gates.length &&
          crossesRaceLine(gates[this.nextGate + 1],previous,this.rider.position,flyover) !== null) {
        this.missedGate = true;
      }
      return false;
    }
    this.missedGate = false;
    const split = this.elapsed+fraction*STEP_MS;
    const passedIndex = this.nextGate;
    this.splits.push(split);
    this.routeAnchor = gate.distance;
    this.nextGate++;
    const stageDone = passedIndex >= 1 ? this.event.stages?.find(s => s.finishGate === passedIndex) : null;
    const sector = passedIndex >= 1 ? (stageDone ? this.stageSector(stageDone) : this.sector(passedIndex)) : null;
    this.lastGatePass = {
      index: passedIndex, number: gate.number, name: gate.name, split,
      delta: this.lastGap, sectorDelta: sector?.delta ?? null, at: split,
    };''')

js('''    this.cornerEntryAt = null;
    this.lastCorner = null;
    this.onGuide = true;
    if (typeof playCustomSound === 'function') playCustomSound('rejoin');''', '''    this.cornerEntryAt = null;
    this.lastCorner = null;
    this.missedGate = false;
    this.onGuide = true;
    if (typeof playCustomSound === 'function') playCustomSound('rejoin');''')

js("'friendFilters','friendCampus'", "'friendFilters','friendCampus','gateFlash'")
html('<div class="next" id="next" hidden></div>',
     '<div class="next" id="next" hidden></div>\n      <div class="gate-flash" id="gateFlash" aria-live="polite" hidden></div>')
html('  .seed-button { white-space:nowrap; }', '''  .gate-flash { position:absolute; left:50%; top:68px; transform:translateX(-50%); z-index:4; padding:7px 15px; border-radius:999px; border:1px solid #d5f2989e; background:#14281ded; color:#effbe2; font-size:.86rem; font-weight:700; white-space:nowrap; pointer-events:none; box-shadow:0 8px 24px #07120c88; }
  .gate-flash[data-gap="ahead"] { border-color:#7ce896b8; color:#b8ffbe; }
  .gate-flash[data-gap="behind"] { border-color:#f3b568b8; color:#ffe0b2; }
  .next[data-alert="missed"] { border-color:#f3a858cc; background:#3a2212f2; color:#ffe6c2; }
  .timing.gate-pop { border-color:#cde889b8; box-shadow:0 0 0 2px #b6e06840; }
  @media (max-width:640px) { .gate-flash { top:56px; right:11px; left:auto; transform:none; max-width:calc(100% - 186px); padding:5px 10px; font-size:.74rem; overflow:hidden; text-overflow:ellipsis; } }
  @media (max-height:500px) { .gate-flash { top:48px; left:50%; right:auto; transform:translateX(-50%); max-width:calc(100% - 360px); padding:4px 10px; font-size:.75rem; overflow:hidden; text-overflow:ellipsis; } }
  .seed-button { white-space:nowrap; }''')

js('''  if(race.phase==='race'&&race.elapsed-race.lastRejoin<1250) setText(ui.next,'已回到赛道 · 加 2 秒');
  ui.callout.hidden = mapOpen || !(race.paused || race.phase === 'count' || race.phase === 'done' || (race.phase === 'race' && race.elapsed < 610));''',
   '''  if(race.phase==='race'&&race.elapsed-race.lastRejoin<1250) {
    setText(ui.next,'已回到赛道 · 加 2 秒');
    delete ui.next.dataset.alert;
  } else if (race.phase==='race'&&current&&race.missedGate) {
    setText(ui.next,'漏过检查点 '+current.number+'（'+current.name+'）· 按 F 回到赛道');
    ui.next.dataset.alert='missed';
  } else {
    delete ui.next.dataset.alert;
  }
  const gatePassAge = race.lastGatePass ? race.elapsed - race.lastGatePass.at : Infinity;
  const showGateFlash = !mapOpen && race.phase === 'race' && gatePassAge < 1450;
  ui.gateFlash.hidden = !showGateFlash;
  ui.timing.classList.toggle('gate-pop', !mapOpen && race.phase === 'race' && gatePassAge < 520);
  if (showGateFlash) {
    if (race.lastGatePass.index === 0) {
      setText(ui.gateFlash, '已过起点 · 计时开始');
      ui.gateFlash.dataset.gap = 'even';
    } else {
      const gap = race.lastGatePass.sectorDelta ?? race.lastGatePass.delta;
      const gapStr = gap === null || gap === undefined ? '' : ' · ' + signedSeconds(gap) + ' 秒';
      setText(ui.gateFlash, '通过检查点 ' + race.lastGatePass.number + ' · ' + race.lastGatePass.name + gapStr);
      ui.gateFlash.dataset.gap = gapTone(gap);
    }
  }
  ui.callout.hidden = mapOpen || !(race.paused || race.phase === 'count' || race.phase === 'done' || (race.phase === 'race' && race.elapsed < 610));''')

js("  const vehicleLabel=actor==='ebike'?'新国标 · 25 km/h':\n    actor==='chair'?'电动轮椅 · 10 km/h':'越野小摩托';",
   "  const vehicleLabel=actor==='ebike'?'新国标 · 48 km/h':\n    actor==='chair'?'电动轮椅 · 36 km/h':'越野小摩托 · 63 km/h';")

# 1.7.0 Gameplay Expansion (live delta, weekly environment, author medal & overview, courier, multi-ghost, Web Audio, traffic draft)
html('    </dialog>\n    <div class="touch"', '    </dialog>\n'+content('medal-dialog.html')+'\n    <div class="touch"')
html('        <div class="split"><span id="ghostName"></span><strong id="splitGap"></strong></div>',
     '        <div class="split"><span id="ghostName"></span><strong id="splitGap"></strong></div>\n        <div class="live-delta" id="liveDelta" hidden></div>\n        <div class="wind-pill" id="windPill" hidden></div>')
html('      <div class="next" id="next" hidden></div>',
     '      <div class="courier-hud" id="courierHud" hidden><strong id="courierTitle"></strong><span id="courierDetail"></span></div>\n      <div class="next" id="next" hidden></div>')
html('      <div class="rider-tag chair-cheer" id="chairCheer" hidden></div>',
     '      <div class="rider-tag courier-tag" id="courierTag" hidden></div>\n      <div class="rider-tag chair-cheer" id="chairCheer" hidden></div>')
html('      <button class="float-button bike-shop-button" id="bikeButton"',
     '      <button class="float-button" id="courierButton" type="button" aria-pressed="false" title="自由骑行校园闪送">闪送</button>\n      <button class="float-button" id="medalButton" type="button" aria-haspopup="dialog" aria-controls="medalDialog">勋章</button>\n      <button class="float-button bike-shop-button" id="bikeButton"')
html('      <div class="setting-line">\n        <label for="settingsBrakeLine">刹车线<small>绿可加速 · 黄收力 · 红减速</small></label>\n        <input id="settingsBrakeLine" type="checkbox" checked>\n      </div>',
     '''      <div class="setting-line">
        <label for="settingsBrakeLine">刹车线<small>绿可加速 · 黄收力 · 红减速</small></label>
        <input id="settingsBrakeLine" type="checkbox" checked>
      </div>
      <div class="setting-line">
        <label for="settingsSound">动态骑行音效<small>风噪 · 胎噪 · 飞轮棘轮与提示音</small></label>
        <input id="settingsSound" type="checkbox" checked>
      </div>
      <div class="setting-line">
        <label for="settingsCollision">车辆碰撞箱<small>本局开启后，与巡游车 / 车流产生实体碰撞</small></label>
        <input id="settingsCollision" type="checkbox">
      </div>''')
html('  .seed-button { white-space:nowrap; }', content('gameplay-170.css')+'\n  .seed-button { white-space:nowrap; }')

js("  white:{name:'云白', color:'#d7d8ce', shade:'#a5ab9e', highlight:'#f2f0e5'}\n};",
   """  white:{name:'云白', color:'#d7d8ce', shade:'#a5ab9e', highlight:'#f2f0e5'},
  amethyst:{name:'紫水晶 · 限定', color:'#7e4cb8', shade:'#4d2b78', highlight:'#b382f0', unlock:'6金/1紫'},
  obsidian:{name:'暗曜金 · 大师', color:'#2a2931', shade:'#18171d', highlight:'#e0b84f', unlock:'紫牌'}
};""")

js('''function medalName(event,ms,vehicle='bike') {
  const {medals}=vehicleBenchmark(event,vehicle);
  if(ms<=medals.gold) return '金牌';
  if(ms<=medals.silver) return '银牌';
  if(ms<=medals.bronze) return '铜牌';
  return '';
}''', '''function medalName(event,ms,vehicle='bike') {
  return MEDAL_LABELS[medalTier(event,ms,vehicle)] ?? '';
}''')

js('function moveCyclist(rider,input,dt,exploring=false) {',
   'function moveCyclist(rider,input,dt,exploring=false,wind=null,trafficClock=null) {')
js('  rider.drafting=typeof onlineDraftingAt===\'function\'&&onlineDraftingAt(rider,performance.now());',
   '  rider.drafting=(typeof onlineDraftingAt===\'function\'&&onlineDraftingAt(rider,performance.now()))||(trafficClock!==null&&typeof trafficDraftingAt===\'function\'&&trafficDraftingAt(rider,trafficClock));')
js('''  const limit=flatLimit*(topSpeedEffect+tuck*clamp(-grade*.27,0,.032))*(rider.drafting?1.045:1);
  const drag=(.48+Math.abs(rider.speed)*.047)*(paved?bike.rolling:bike.grassRolling??2.85)*(rider.drafting?.76:1)*(1-tuck*.36);''',
   '''  const windAlong=wind?Math.cos(rider.heading)*wind.vector[0]+Math.sin(rider.heading)*wind.vector[1]:0;
  const windSpeedScale=wind?clamp(1+windAlong*wind.speed*.014,.78,1.22):1;
  const windDragScale=wind?clamp(1-windAlong*wind.speed*.055,.52,1.85):1;
  const limit=flatLimit*(topSpeedEffect+tuck*clamp(-grade*.27,0,.032))*(rider.drafting?1.045:1)*windSpeedScale;
  const drag=(.48+Math.abs(rider.speed)*.047)*(paved?bike.rolling:bike.grassRolling??2.85)*(rider.drafting?.76:1)*(1-tuck*.36)*windDragScale;''')

js('''  constructor(event,bike=stockBike,vehicle='bike') {
    this.bike=bike;
    this.vehicle=knownVehicle(vehicle);
    this.sessionRecords = new Map();
    this.practiceBest = new Map();
    this.practice = null;
    this.select(event);
  }

  select(event,opponent=null) {
    this.practice = null;
    this.event = event;
    this.opponent = opponent;
    this.abandon();
  }''',
   '''  constructor(event,bike=stockBike,vehicle='bike') {
    this.bike=bike;
    this.vehicle=knownVehicle(vehicle);
    this.sessionRecords = new Map();
    this.practiceBest = new Map();
    this.practice = null;
    this.freeClock = 0;
    this.rejoinReason = null;
    this.freeHazardNotice = null;
    this.extraOpponents = [];
    this.select(event);
  }

  select(event,opponent=null,extraOpponents=[]) {
    this.practice = null;
    this.event = event;
    this.opponent = opponent;
    this.extraOpponents = Array.isArray(extraOpponents) ? extraOpponents.slice(0,2) : [];
    this.abandon();
  }''')

js('  get ghost() { return this.phase === \'race\' ? replayAt(this.reference, this.elapsed) : null; }',
   '''  get ghost() { return this.phase === 'race' ? replayAt(this.reference, this.elapsed) : null; }

  get extraGhosts() {
    if (this.phase !== 'race' || !this.extraOpponents.length) return [];
    const list = [];
    for (let i = 0; i < this.extraOpponents.length; i++) {
      const op = this.extraOpponents[i];
      const pose = replayAt(op, this.elapsed);
      if (pose) list.push({ ...pose, id: 'extra-' + i, name: op.name, vehicle: op.vehicle });
    }
    return list;
  }''')

js('''    const speedBefore = this.rider.speed;
    const exploring=activeCampus==='szu';
    const previous=moveCyclist(this.rider,input,PHYSICS_STEP,exploring);''',
   '''    if (this.phase === 'free') this.freeClock += PHYSICS_STEP;
    const speedBefore = this.rider.speed;
    const exploring=activeCampus==='szu';
    const stepClock = this.phase === 'race' ? this.elapsed / 1000 : this.freeClock;
    const stepWind = typeof activeWind === 'function' ? activeWind(this) : ((!this.online && this.event?.environment) ? this.event.environment : null);
    const previous=moveCyclist(this.rider,input,PHYSICS_STEP,exploring,stepWind,stepClock);''')

js('''  if(shadow&&!onlineRoom) mapPin(ctx,layout.project,shadow,compact,true);
  for (const rider of onlineRiderPoses(performance.now())) mapPin(ctx,layout.project,rider,compact,true);''',
   '''  if(shadow&&!onlineRoom) mapPin(ctx,layout.project,shadow,compact,true);
  if(preferences.ghost&&!onlineRoom) for (const extra of race.extraGhosts) mapPin(ctx,layout.project,extra,compact,true);
  for (const rider of onlineRiderPoses(performance.now())) mapPin(ctx,layout.project,rider,compact,true);
  if(!onlineRoom&&CampusCourier.active&&CampusCourier.target&&CampusCourier.campus===activeCampus&&race.phase==='free') {
    const [cx,cy]=layout.project(CampusCourier.target.p);
    ctx.beginPath();ctx.arc(cx,cy,compact?4.5:9,0,TAU);
    ctx.fillStyle='#67f2bf';ctx.strokeStyle='#15392d';ctx.lineWidth=2;ctx.fill();ctx.stroke();
  }''')

js("  'friendFilters','friendCampus'",
   """  'liveDelta','windPill','courierHud','courierTitle','courierDetail','courierTag','courierButton',
  'medalButton','medalDialog','medalClose','medalSummary','medalUnlocks','medalListSzu','medalListUcl',
  'settingsSound','settingsCollision','friendMultiBar','friendMultiCount','friendMultiPlay',
  'friendFilters','friendCampus'""")

js('''  ui.friendReady.hidden=trial||!opponent;
  if (!ui.friendReady.hidden) setText(ui.friendReady,opponent.kind+' · '+timeLabel(opponent.time)+' · '+
    vehicleChoices[opponent.vehicle].name+' · '+event.name);''',
   '''  ui.friendReady.hidden=trial||!opponent;
  if (!ui.friendReady.hidden) {
    const totalGhosts = 1 + (race.extraOpponents?.length ?? 0);
    setText(ui.friendReady,(totalGhosts>1?`${opponent.kind} 等 ${totalGhosts} 条影子`:opponent.kind)+' · '+timeLabel(opponent.time)+' · '+
      vehicleChoices[opponent.vehicle].name+' · '+event.name);
  }''')

js("  ui.friendButton.disabled=ui.seedButton.disabled=ui.coursePicker.disabled=online||race.phase==='race'||race.phase==='count';",
   """  ui.friendButton.disabled=ui.seedButton.disabled=ui.coursePicker.disabled=ui.medalButton.disabled=online||race.phase==='race'||race.phase==='count';
  if(ui.courierButton) {
    ui.courierButton.hidden=online||trial;
    ui.courierButton.setAttribute('aria-pressed',String(CampusCourier.active));
  }""")

js('''    ui.intro.hidden = trial || race.moved;''',
   '''    ui.intro.hidden = trial || race.moved || (typeof CampusCourier !== 'undefined' && (CampusCourier.active || performance.now() < CampusCourier.summaryUntil));''')
js('''  if (!trial && race.moved) ui.intro.hidden = true;''',
   '''  if (!trial && (race.moved || (typeof CampusCourier !== 'undefined' && (CampusCourier.active || performance.now() < CampusCourier.summaryUntil)))) ui.intro.hidden = true;''')

js('''  setText(ui.splitGap,lastGap===null?'等待分段':'总差 ' + splitLabel(lastGap));
  ui.splitGap.dataset.gap = gapTone(lastGap);''',
   '''  setText(ui.splitGap,lastGap===null?'等待分段':'总差 ' + splitLabel(lastGap));
  ui.splitGap.dataset.gap = gapTone(lastGap);
  if(ui.liveDelta) {
    const ld=trial&&race.phase==='race'?liveDeltaMs(race):null;
    ui.liveDelta.hidden=ld===null;
    if(ld!==null) {
      setText(ui.liveDelta,'实时 '+splitLabel(ld));
      ui.liveDelta.dataset.gap=gapTone(ld);
    }
  }
  if(ui.windPill) {
    const windText=windEffectLabel(race);
    ui.windPill.hidden=!windText;
    if(windText) setText(ui.windPill,windText);
  }
  if(ui.courierHud) {
    const nowMs=performance.now();
    const showCourier=!online&&!trial&&(CampusCourier.active||nowMs<CampusCourier.summaryUntil);
    ui.courierHud.hidden=!showCourier;
    if(CampusCourier.active&&CampusCourier.target) {
      const distM=Math.round(Math.hypot(CampusCourier.target.p[0]-race.rider.position[0],CampusCourier.target.p[2]-race.rider.position[2]));
      const flashMsg=nowMs<CampusCourier.summaryUntil?' · '+CampusCourier.summaryText:'';
      setText(ui.courierTitle,`闪送目标 · ${CampusCourier.target.name}（${CampusCourier.target.district}）`);
      setText(ui.courierDetail,`余 ${Math.ceil(CampusCourier.remaining)}s · ${distM}m · 连单 ${CampusCourier.streak} · 探索 ${CampusCourier.discoveredCount(activeCampus)}/10${flashMsg}`);
    } else if (nowMs<CampusCourier.summaryUntil) {
      setText(ui.courierTitle,'校园闪送');
      setText(ui.courierDetail,CampusCourier.summaryText);
    }
  }''')

js('''    const duel=opponent?friendResult(opponent,race.elapsed):'';
    setText(ui.callDetail,[duel,rank,record].filter(Boolean).join(' · '));''',
   '''    let duel=opponent?friendResult(opponent,race.elapsed):'';
    if (opponent && race.extraOpponents?.length) {
      const beatCount = [opponent, ...race.extraOpponents].filter(op => race.elapsed < op.time).length;
      duel = `${duel}（击败 ${beatCount}/${1 + race.extraOpponents.length}）`;
    }
    setText(ui.callDetail,[duel,rank,record].filter(Boolean).join(' · '));''')

js('''function beginTrial() {
  clearInput();''',
   '''function beginTrial() {
  if (typeof CampusCourier !== 'undefined') CampusCourier.stop(false);
  clearInput();''')
js('''  race.opponent=null;
  race.freeRide();''',
   '''  race.opponent=null;
  race.extraOpponents=[];
  race.freeRide();
  refreshBicycleModels();''')
js('''function selectCourse(event,opponent=null) {
  courseByCampus[activeCampus]=event;
  clearInput();
  race.select(event,opponent);''',
   '''function selectCourse(event,opponent=null,extraOpponents=[]) {
  if (typeof CampusCourier !== 'undefined') CampusCourier.stop(false);
  courseByCampus[activeCampus]=event;
  clearInput();
  race.select(event,opponent,extraOpponents);
  if (!onlineRoom) setActiveWeather(event.environment?.weather ?? preferences.weather);''')

js("    if(ui.seedDialog.open||ui.friendDialog.open||ui.onlineDialog.open) return;",
   "    if(ui.seedDialog.open||ui.friendDialog.open||ui.onlineDialog.open||ui.medalDialog?.open) return;")
js('  initOnline();\n  initSettings();',
   '''  initOnline();
  initMedalDialog();
  ui.courierButton?.addEventListener('click',()=>{
    if(CampusCourier.active) CampusCourier.stop(true);
    else CampusCourier.start(activeCampus,race.rider.position);
    updateHud();
    focusStage();
  });
  initSettings();''')

js('''    const state=onlineRoom?.state;
    const peers=state?.players.filter(player=>player.id!==onlineRoom.id)??[];
    remoteBicycles=new Map();
    for(const player of peers) {
      const vehicle=state.vehicleRule==='any'?knownVehicle(player.vehicle):knownVehicle(state.vehicleRule);
      if(vehicle==='bike') remoteBicycles.set(player.id,bicycleRigs.prepare(bicycleAppearance(player,player.bike)));
      else prepareMotor(vehicle);
    }
    while(roomLimbs.length<Math.min(3,peers.length)) roomLimbs.push(new gpu.Mesh(new Shape(),0,null,true));''',
   '''    const state=onlineRoom?.state;
    const peers=state?.players.filter(player=>player.id!==onlineRoom.id)??[];
    remoteBicycles=new Map();
    for(const player of peers) {
      const vehicle=state.vehicleRule==='any'?knownVehicle(player.vehicle):knownVehicle(state.vehicleRule);
      if(vehicle==='bike') remoteBicycles.set(player.id,bicycleRigs.prepare(bicycleAppearance(player,player.bike)));
      else prepareMotor(vehicle);
    }
    if (!onlineRoom) {
      for (const [idx, extra] of (race.extraOpponents ?? []).entries()) {
        if (extra.vehicle==='bike') remoteBicycles.set('extra-'+idx,bicycleRigs.prepare(bicycleAppearance(extra,extra.bike)));
        else prepareMotor(extra.vehicle);
      }
    }
    const extraNeeded = onlineRoom ? peers.length : (race.extraOpponents?.length ?? 0);
    while(roomLimbs.length<Math.min(3,extraNeeded)) roomLimbs.push(new gpu.Mesh(new Shape(),0,null,true));''')

js('  const cheer=chairCheerClock();',
   '  const cheer=chairCheerClock();\n  const courierBeacon=new gpu.Mesh(makeCourierBeaconShape());')
js('''    const ghost=preferences.ghost&&!onlineRoom?race.ghost:null;
    const ghosts=ghostMeshes(ghost);
    const onlineRiders=onlineRiderPoses(performance.now());
    for (const [index,remote] of onlineRiders.entries()) {
      if(!roomLimbs[index]) continue;
      ghosts.push(...ghostMeshes(remote,roomLimbs[index]));
    }
    const head={pos:[p[0],p[1]+.92,p[2]],dir:normalize([Math.cos(rider.heading),-.11,Math.sin(rider.heading)])};
    const renderedFrame=gpu.draw(previousCamera,world,route,riderMeshes,p,waterTime,ghosts,trafficNear(previousCamera.eye,waterTime),currentAA(),head,onlineRoom?2:1);''',
   '''    const ghost=preferences.ghost&&!onlineRoom?race.ghost:null;
    const ghosts=ghostMeshes(ghost);
    const extraRiders=onlineRoom?onlineRiderPoses(performance.now()):(preferences.ghost?race.extraGhosts:[]);
    for (const [index,remote] of extraRiders.entries()) {
      if(!roomLimbs[index]) continue;
      ghosts.push(...ghostMeshes(remote,roomLimbs[index]));
    }
    const trafficClock=race.phase==='race'?race.elapsed/1000:race.freeClock;
    const trafficModels=trafficNear(previousCamera.eye,trafficClock);
    if(!onlineRoom&&race.phase==='free'&&CampusCourier.active&&CampusCourier.target&&CampusCourier.campus===activeCampus) {
      const tp=CampusCourier.target.p;
      trafficModels.push([courierBeacon,placement([tp[0],tp[1],tp[2]],0,waterTime*1.5,0)]);
    }
    const head={pos:[p[0],p[1]+.92,p[2]],dir:normalize([Math.cos(rider.heading),-.11,Math.sin(rider.heading)])};
    const renderedFrame=gpu.draw(previousCamera,world,route,riderMeshes,p,waterTime,ghosts,trafficModels,currentAA(),head,onlineRoom?2:1);''')

js('''    for (let i=0;i<onlineTags.length;i++) {
      const remote=onlineRiders[i], tag=onlineTags[i];''',
   '''    for (let i=0;i<onlineTags.length;i++) {
      const remote=extraRiders[i], tag=onlineTags[i];''')

js('''    } else ui.chairCheer.hidden=true;
    const gates=race.event.gates''',
   '''    } else ui.chairCheer.hidden=true;
    if(!onlineRoom&&race.phase==='free'&&CampusCourier.active&&CampusCourier.target&&CampusCourier.campus===activeCampus&&ui.courierTag) {
      setText(ui.courierTag,'闪送 · '+CampusCourier.target.name);
      projectTag(ui.courierTag,previousCamera,add(CampusCourier.target.p,[0,4.95,0]),width,height);
    } else if(ui.courierTag) ui.courierTag.hidden=true;
    const gates=race.event.gates''')

js('''    const {destination,ghost,archive,online}=pendingCampus;
    activeCampus=destination;
    pendingCampus=null;
    let challenge, onlineCourse;
    try {
      buildRidingScene(activeCampus);
      if (ghost) challenge=loadFriendGhost(ghost);
      if (online) onlineCourse=findOnlineCourse(online.route);''',
   '''    if (typeof CampusCourier !== 'undefined') CampusCourier.stop(false);
    const {destination,ghost,archive,online,extraGhosts,targetCourseId}=pendingCampus;
    activeCampus=destination;
    pendingCampus=null;
    let challenge, challengeExtra=[], onlineCourse;
    try {
      buildRidingScene(activeCampus);
      if (ghost) {
        challenge=loadFriendGhost(ghost);
        if (extraGhosts?.length) challengeExtra=extraGhosts.map(item=>loadFriendGhost(item).opponent);
      }
      if (online) onlineCourse=findOnlineCourse(online.route);''')
js('''    if (challenge) activateFriendChallenge(challenge,archive);
    else {
      race.select(courseByCampus[activeCampus]);''',
   '''    if (challenge) activateFriendChallenge(challenge,archive,challengeExtra);
    else {
      if (targetCourseId) {
        const picked=coursesByCampus[activeCampus].find(c=>c.id===targetCourseId);
        if (picked) courseByCampus[activeCampus]=picked;
      }
      race.select(courseByCampus[activeCampus]);
      if (!onlineRoom) setActiveWeather(race.event.environment?.weather ?? preferences.weather);''')

js('''    const roomRacing = onlineRoom?.state.phase==='race' && !onlineRoom.retired && race.phase!=='free';
    if (roomRacing || (!onlineRoom&&!settingsOpen&&!pendingCampus&&!ui.seedDialog.open&&!ui.friendDialog.open&&!ui.onlineDialog.open)) {
      if (!roomRacing && wallTime > 1 && (race.phase === 'race' || race.phase === 'count')) {
        race.paused = true;
        clearInput();
      }
      const simulationTime = race.phase === 'free' ? dt : wallTime;
      const simulationStart = now - simulationTime * 1000;
      race.advance(simulationTime, offset => driveAt(simulationStart + offset * 1000));
    }''',
   '''    const roomRacing = onlineRoom?.state.phase==='race' && !onlineRoom.retired && race.phase!=='free';
    const freeRunning = !onlineRoom&&!settingsOpen&&!pendingCampus&&!ui.seedDialog.open&&!ui.friendDialog.open&&!ui.onlineDialog.open&&!ui.medalDialog?.open;
    if (roomRacing || freeRunning) {
      if (!roomRacing && wallTime > 1 && (race.phase === 'race' || race.phase === 'count')) {
        race.paused = true;
        clearInput();
      }
      const simulationTime = race.phase === 'free' ? dt : wallTime;
      const simulationStart = now - simulationTime * 1000;
      race.advance(simulationTime, offset => driveAt(simulationStart + offset * 1000));
      if (freeRunning && race.phase === 'free' && !race.paused) {
        CampusCourier.tick(dt, race.rider, activeCampus, now);
      }
    }
    if (typeof updateRideAudio === 'function') updateRideAudio(race.rider, dt, !settingsOpen && !race.paused && !mapOpen && !pendingCampus);''')

js("const defaultPreferences={resolution:'auto',aa:'auto',ghost:true,brakeLine:true,weather:'day'};",
   "const defaultPreferences={resolution:'auto',aa:'auto',ghost:true,brakeLine:true,weather:'day',sound:true,collision:false,windSpeed:0,windDir:0};")
js("      weather:knownWeather(saved.weather)\n    };",
   "      weather:knownWeather(saved.weather),\n      sound:typeof saved.sound==='boolean'?saved.sound:true,\n      collision:saved.collision===true,\n      windSpeed:Number.isFinite(Number(saved.windSpeed))?Math.round(clamp(Number(saved.windSpeed),0,15)*10)/10:0,\n      windDir:Number.isInteger(Number(saved.windDir))?clamp(Number(saved.windDir),0,7):0\n    };")
js("  ui.settingsWeather.value=knownWeather(preferences.weather);\n}",
   "  ui.settingsWeather.value=knownWeather(preferences.weather);\n  if(ui.settingsSound) ui.settingsSound.checked=preferences.sound!==false;\n  if(ui.settingsCollision) ui.settingsCollision.checked=preferences.collision===true;\n  if(ui.settingsWindSpeed) ui.settingsWindSpeed.value=String(preferences.windSpeed??0);\n  if(ui.settingsWindDir) ui.settingsWindDir.value=String(preferences.windDir??0);\n}")
js('''  ui.bikePaint.value=driverProfile.paint;
  ui.bikePaint.disabled=locked||!bicycle;''',
   '''  const paintStats = courseMedalSummary();
  for (const opt of ui.bikePaint.options) {
    const info = bicyclePaints[opt.value];
    if (!info) continue;
    const unlocked = isPaintUnlocked(opt.value, paintStats);
    opt.disabled = !unlocked;
    opt.textContent = unlocked ? info.name : info.name + '（需' + info.unlock + '）';
  }
  if (!isPaintUnlocked(driverProfile.paint, paintStats)) {
    driverProfile.paint = 'classic';
    storeDriverProfile(driverProfile);
  }
  ui.bikePaint.value=driverProfile.paint;
  ui.bikePaint.disabled=locked||!bicycle;''')
js('''  race.opponent=null;
  race.abandon();cameraRevision++;priorTimestamp=undefined;''',
   '''  race.opponent=null;
  race.extraOpponents=[];
  race.abandon();cameraRevision++;priorTimestamp=undefined;
  refreshBicycleModels();''')
html('<header class="settings-head"><h2 id="settingsTitle">设置</h2><p id="settingsState" hidden></p></header>',
     '''<header class="settings-head"><h2 id="settingsTitle">设置</h2><p id="settingsState" hidden></p></header>
      <div id="settingsTuneBar" class="online-tuning-banner" hidden>
        <span id="settingsTuneText"></span>
        <div class="online-tuning-actions">
          <button class="action" type="button" id="settingsTuneReady">完成改装</button>
          <button class="action" type="button" id="settingsTuneSkip" hidden>立即发车</button>
        </div>
      </div>''')
js('''  ui.vehiclePicker.addEventListener('change',()=>{
    const choice=ui.vehiclePicker.value;
    if(!race.setVehicle(choice)) {showBikeSetup();return;}
    driverProfile.vehicle=choice;
    storeDriverProfile(driverProfile);
    showBikeSetup();
    rebuildCourseHud();
    updateHud();
    updateSettingsActions();
  });''',
   '''  ui.vehiclePicker.addEventListener('change',()=>{
    const choice=ui.vehiclePicker.value;
    if(!race.setVehicle(choice)) {showBikeSetup();return;}
    driverProfile.vehicle=choice;
    storeDriverProfile(driverProfile);
    showBikeSetup();
    rebuildCourseHud();
    updateHud();
    updateSettingsActions();
    if (typeof onlineRoom !== 'undefined' && onlineRoom?.state.phase==='tuning') syncOnlineProfile();
  });''')
js('''  ui.bikePaint.addEventListener('change',()=>{
    if(race.rider.vehicle!=='bike'||race.phase==='race'||race.phase==='count') {showBikeSetup();return;}
    driverProfile.paint=knownPaint(ui.bikePaint.value);
    storeDriverProfile(driverProfile);
    showBikeSetup();
  });''',
   '''  ui.bikePaint.addEventListener('change',()=>{
    if(race.rider.vehicle!=='bike'||race.phase==='race'||race.phase==='count'||!isPaintUnlocked(ui.bikePaint.value)) {showBikeSetup();return;}
    driverProfile.paint=knownPaint(ui.bikePaint.value);
    storeDriverProfile(driverProfile);
    showBikeSetup();
    if (typeof onlineRoom !== 'undefined' && onlineRoom?.state.phase==='tuning') syncOnlineProfile();
  });''')
js("      preferences[key]=control.value;if(key==='weather'&&!onlineRoom) setActiveWeather(control.value);savePreferences();",
   "      preferences[key]=control.value;if(key==='weather'&&!onlineRoom&&!race.event?.environment) setActiveWeather(control.value);savePreferences();")
js('''  for (const [key, control] of [['ghost',ui.settingsGhost], ['brakeLine',ui.settingsBrakeLine]]) {
    control.addEventListener('change', () => {
      preferences[key] = control.checked;
      savePreferences();
    });
  }''',
   '''  for (const [key, control] of [['ghost',ui.settingsGhost], ['brakeLine',ui.settingsBrakeLine], ['sound',ui.settingsSound], ['collision',ui.settingsCollision]]) {
    if (!control) continue;
    control.addEventListener('change', () => {
      preferences[key] = control.checked;
      if (key === 'sound' && typeof setRideAudioMuted === 'function') setRideAudioMuted(!control.checked);
      savePreferences();
    });
  }
  ui.settingsWindSpeed?.addEventListener('change',()=>{
    const w=Math.round(clamp(Number(ui.settingsWindSpeed.value)||0,0,15)*10)/10;
    ui.settingsWindSpeed.value=String(w);
    preferences.windSpeed=w;
    savePreferences();
    updateHud();
  });
  ui.settingsWindDir?.addEventListener('change',()=>{
    const d=Math.round(clamp(Number(ui.settingsWindDir.value)||0,0,7));
    ui.settingsWindDir.value=String(d);
    preferences.windDir=d;
    savePreferences();
    updateHud();
  });''')

js("  ui.callout.hidden = mapOpen || !(race.paused || race.phase === 'count' || race.phase === 'done' || (race.phase === 'race' && race.elapsed < 610));",
   "  ui.callout.hidden = mapOpen || !(race.paused || race.phase === 'count' || race.phase === 'done' || (race.phase === 'race' && race.elapsed < 610));\n  ui.callout.dataset.mode = race.paused ? 'paused' : race.phase;")
js("  ui.callout.hidden = show || !(race.paused || race.phase === 'count' || race.phase === 'done' || (race.phase === 'race' && race.elapsed < 610));",
   "  ui.callout.hidden = show || !(race.paused || race.phase === 'count' || race.phase === 'done' || (race.phase === 'race' && race.elapsed < 610));\n  ui.callout.dataset.mode = race.paused ? 'paused' : race.phase;")

# Register the park after the course constructors and before per-campus indexes.
js("const coursesByCampus={szu:courses,ucl:londonCourses};",
   content('qingyun.js')+"\n"+content('shunde-mountain.js')+"\nconst coursesByCampus={szu:courses,ucl:londonCourses,shunde:[parkCourse,...mountainCourses,parkEnduranceCourse]};")
js("const courseByCampus={szu:courses[0],ucl:londonCourses[0]};",
   "const courseByCampus=Object.fromEntries(Object.entries(coursesByCampus).map(([key,events])=>[key,events[0]]));")
js("for(const event of londonCourses) {\n  event.corners", "for(const event of [...londonCourses,...coursesByCampus.shunde]) {\n  event.corners")
js("  if(campus==='ucl') return londonGateSpan", "  if(campus==='shunde') return {half:parkWidth(frame.p[0],frame.p[2])-.24};\n  if(campus==='ucl') return londonGateSpan")
js("return activeCampus==='szu'?hillHeight(x,z):0;", "return activeCampus==='shunde'?parkHeight(x,z):activeCampus==='szu'?hillHeight(x,z):0;")
js("  if(activeCampus!=='szu') return 0;\n  const [x,y,z]=position", """  if(activeCampus==='shunde') {
    const [x,,z]=position, dx=.5*Math.cos(heading), dz=.5*Math.sin(heading);
    return parkHeight(x+dx,z+dz)-parkHeight(x-dx,z-dz);
  }
  if(activeCampus!=='szu') return 0;
  const [x,y,z]=position""")
js("  if(activeCampus==='ucl') return uclBuildingAt", "  if(activeCampus==='shunde') return parkFixture(x,z,margin,y);\n  if(activeCampus==='ucl') return uclBuildingAt")
js("const lots=region==='ucl'?uclBuildings:", "const lots=region==='shunde'?campusFixtures:region==='ucl'?uclBuildings:")
js("  if(activeCampus==='ucl') return uclSurfaceAt", "  if(activeCampus==='shunde') return parkFirmSurface(x,z);\n  if(activeCampus==='ucl') return uclSurfaceAt")
js("  if(activeCampus==='ucl') return canRideUcl", "  if(activeCampus==='shunde') return parkRideable(x,z);\n  if(activeCampus==='ucl') return canRideUcl")

# 1.8.7 SZU gate boundary alignment, exterior curbs, and lake water respawn (reusing Shunde hazard flow)
js('function safeToRide(x,z,exploring=false) {', content('szu-boundaries.js') + '\n\nfunction safeToRide(x,z,exploring=false) {')
js("""function safeToRide(x,z,exploring=false) {
  if(activeCampus==='shunde') return parkRideable(x,z);
  if(activeCampus==='ucl') return canRideUcl(x,z);
  const {minX,maxX,minZ,maxZ}=campusBoundary;
  const inside = x>minX+.52 && x<maxX-.52 && z>minZ+.52 && z<maxZ-.52 && inCampus(x,z);
  if (!inside && (!exploring || !(cityStreetAt(x,z)||onParkWalk(x,z)) || cityBlocked(x,z))) return false;
  return lakeClearance(x,z)>.25 && !buildingAt(x,z)
    && !treeBlocks(x,z,.28);
}""",
   """function safeToRide(x,z,exploring=false,skipHazard=false) {
  if(activeCampus==='shunde') return parkRideable(x,z,skipHazard);
  if(activeCampus==='ucl') return canRideUcl(x,z);
  const {minX,maxX,minZ,maxZ}=campusBoundary;
  const inside = x>minX+.52 && x<maxX-.52 && z>minZ+.52 && z<maxZ-.52 && inCampus(x,z);
  if (!inside && (!exploring || !(cityStreetAt(x,z)||onParkWalk(x,z)||gateApronAt(x,z)) || cityBlocked(x,z))) return false;
  return (skipHazard || lakeClearance(x,z)>.25) && !buildingAt(x,z)
    && !treeBlocks(x,z,.28);
}""")
js("shortcutRibbonContains(szuHighRiskShortcuts,x,z) || exploring&&(cityStreetAt(x,z)||onParkWalk(x,z)));",
   "shortcutRibbonContains(szuHighRiskShortcuts,x,z) || exploring&&(cityStreetAt(x,z)||onParkWalk(x,z)||gateApronAt(x,z)));")
js("""function boundaryEdges() {
  const entrances=[...campusGates,...canghaiGates], links=[...cityLinks,...canghaiStreets];
  for(const outline of campusOutlines) for(let i=0;i<outline.length;i++) {
    const a=outline[i],b=outline[(i+1)%outline.length];
    const d=Math.hypot(b[0]-a[0],b[1]-a[1]), yaw=-Math.atan2(b[1]-a[1],b[0]-a[0]);
    for(let m=0;m<d;m+=3.1) {
      const q=Math.min(d,m+3.06), c=(m+q)/2/d;
      const x=mix(a[0],b[0],c), z=mix(a[1],b[1],c);
      const crossesPublicRoad=[m,(m+q)/2,q].some(along=>{
        const t=along/d, px=mix(a[0],b[0],t), pz=mix(a[1],b[1],t);
        return nearestCitySegment(px,pz,null,.58)||cityStreetAt(px,pz);
      });
      if(crossesPublicRoad || entrances.some(g=>Math.hypot(g.xy[0]-x,g.xy[1]-z)<9.6) ||
         links.some(({path})=>path.rows.some(({p})=>Math.hypot(p[0]-x,p[2]-z)<path.width+1))) continue;
      scenery.box([x,.33,z],[q-m,.66,.47],'#b4ac95',yaw);
      scenery.box([x,.68,z],[q-m,.10,.58],'#c8c0a9',yaw);
      if (Math.floor(m/3.1)%2===0) scenery.box([x,.91,z],[.10,.46,.13],'#62796c');
      scenery.box([x,1.12,z],[q-m,.05,.2],'#5f746b',yaw);
    }
  }
}""",
   """function boundaryEdges() {
  for(const outline of campusOutlines) for(let i=0;i<outline.length;i++) {
    const a=outline[i],b=outline[(i+1)%outline.length];
    const d=Math.hypot(b[0]-a[0],b[1]-a[1]), yaw=-Math.atan2(b[1]-a[1],b[0]-a[0]);
    for(let m=0;m<d;m+=3.1) {
      const q=Math.min(d,m+3.06);
      const nearOpening=[m,(m+q)/2,q].some(along=>{
        const t=along/d, px=mix(a[0],b[0],t), pz=mix(a[1],b[1],t);
        return fenceOpenAt(px,pz);
      });
      const subs=nearOpening?5:1;
      for(let s=0;s<subs;s++) {
        const sm=mix(m,q,s/subs), sq=mix(m,q,(s+1)/subs);
        const c=(sm+sq)/2/d, x=mix(a[0],b[0],c), z=mix(a[1],b[1],c), len=sq-sm;
        if(fenceOpenAt(x,z)) continue;
        scenery.box([x,.33,z],[len,.66,.47],'#b4ac95',yaw);
        scenery.box([x,.68,z],[len,.10,.58],'#c8c0a9',yaw);
        if(Math.floor(m/3.1)%2===0 && s===0) scenery.box([x,.91,z],[.10,.46,.13],'#62796c');
        scenery.box([x,1.12,z],[len,.05,.2],'#5f746b',yaw);
      }
    }
  }
}""")
js("  boundaryEdges();\n  campusGroundDetails();\n  walkBridge();",
   "  boundaryEdges();\n  drawGateLinkBorders();\n  campusGroundDetails();\n  walkBridge();")
js("if(!onUpperRoad&&deck!==null&&deck>.40&&deck<2.78) return false;\n    return safeToRide(x,z,exploring);",
   "if(!onUpperRoad&&deck!==null&&deck>.40&&deck<2.78) return false;\n    return safeToRide(x,z,exploring,true);")
js("    if(campus==='ucl') buildUclWorld();","    if(campus==='shunde') buildParkWorld();\n    else if(campus==='ucl') buildUclWorld();")
js("hasWater:campus==='szu'", """hasWater:campus!=='ucl',
    waterBounds:campus==='shunde'?parkReflectionBounds:undefined""")
js("waterReflectionArea(camera,frustum,lakeBounds)", "waterReflectionArea(camera,frustum,world.waterBounds??lakeBounds)")
js("  if(typeof activeCampus!=='undefined'&&activeCampus!=='szu') return;", """  if(activeCampus==='shunde') {
    const v=shape.vertices;
    for(let i=0;i<v.length;i+=11) v[i+1]+=parkHeight(v[i],v[i+2]);
    return;
  }
  if(typeof activeCampus!=='undefined'&&activeCampus!=='szu') return;""")
js("    if(gate.distance<from||gate.distance>to) continue;", """    if(gate.distance<from||gate.distance>to||((event.id==='qingyun-lake'||event.id==='shunde-endurance')&&gate.index===0)) continue;""")
js("const chart=activeCampus==='ucl'?uclChart:campusChart;", "const chart=activeCampus==='shunde'?parkChart:activeCampus==='ucl'?uclChart:campusChart;")
js("const stats=activeCampus==='szu'?race.event.elevation:null;", "const stats=race.event.elevation;")
js("  const [x,y,z]=onCampusGround(p);\n  return [x,y+rise,z];", """  const [x,y,z]=p;
  const height=event.campus==='shunde'?parkHeight(x,z):rideElevation(x,z);
  return [x,y+height+rise,z];""")
js("function packPose(t,r) {", "function packPose(t,r,heightAt=rideElevation) {")
js("q(r.position[1]-rideElevation(r.position[0],r.position[2]),1000)", "q(r.position[1]-heightAt(r.position[0],r.position[2]),1000)")
js("  const acceleration=cycling?4.86:4.34*tuning.force;", """  const acceleration=cycling?4.86:4.34*tuning.force;
  const shunde=event.campus==='shunde';""")
js("travel:at+5.2,steering:clamp(-turn*2.2,-.86,.86)\n    });", """travel:at+5.2,steering:clamp(-turn*2.2,-.86,.86)
    },shunde?parkHeight:undefined);""")
js("    const sample=event.elevation||event.flyover?courseFrame(path,distance+1.2):null;",
   "    const sample=event.elevation||event.flyover||shunde?courseFrame(path,distance+1.2):null;")
js("    const grade=sample?riderGrade(courseGround(event,sample.p),Math.atan2(sample.f[2],sample.f[0])):0;",
   """    const grade=shunde?(parkHeight(sample.p[0]+sample.f[0]*.5,sample.p[2]+sample.f[2]*.5)-parkHeight(sample.p[0]-sample.f[0]*.5,sample.p[2]-sample.f[2]*.5)):
      sample?riderGrade(courseGround(event,sample.p),Math.atan2(sample.f[2],sample.f[0])):0;""")
js("    const pace=Math.min(top*(1-clamp(grade*1.45,0,.23)),plannedSpeed(event,distance+1.2)*.96*cornerPace+.22);",
   """    const loose=shunde&&!parkFirmSurface(sample.p[0],sample.p[2]);
    const surfaceTop=loose?(cycling?Math.min(stockBike.roadSpeed,stockBike.grassSpeed*1.32):Math.min(tuning.roadSpeed,tuning.grassSpeed*1.18)):top;
    const pace=Math.min(surfaceTop*(1-clamp(grade*1.45,0,.23)),plannedSpeed(event,distance+1.2)*.96*cornerPace+.22);""")
# Compacted gravel physics tier + 3-surface HUD + hazard forced respawn + optional vehicle collision box.
js("""      cityVehicles.push({path:p,model:models[i%8===0?models.length-1:i%palette.length],direction:dir,
        offset:dir*p.width*(i%3===0?.67:.42),start:(i+.3)/count*p.length,speed:range(8.3,14.5)});""",
   """      cityVehicles.push({path:p,model:models[i%8===0?models.length-1:i%palette.length],direction:dir,
        offset:dir*p.width*(i%3===0?.67:.42),start:(i+.3)/count*p.length,speed:range(8.3,14.5),
        halfL:i%8===0?4.4:2.25,halfW:i%8===0?1.22:.96});""")
js("function moveCyclist(rider,input,dt,exploring=false,wind=null,trafficClock=null) {",
   """function vehicleCollisionEnabled() {
  if (typeof onlineRoom!=='undefined'&&onlineRoom) return Boolean(onlineRoom.state?.collision);
  return typeof preferences!=='undefined'?Boolean(preferences?.collision):false;
}
function riderCollisionRadius(vehicle) {
  return vehicle==='chair'?.54:vehicle==='trail'?.52:.46;
}
function resolveVehicleCollisions(rider,x,z,y,trafficClock,mayRide) {
  if (!vehicleCollisionEnabled()) return [x,z,false];
  const r=riderCollisionRadius(rider.vehicle), now=typeof performance!=='undefined'?performance.now():Date.now();
  let hit=false;
  if (trafficClock!==null&&Array.isArray(cityVehicles)&&cityVehicles.length) {
    for (const van of cityVehicles) {
      const path=van.path;
      const dist=((van.start+van.direction*van.speed*trafficClock)%path.length+path.length)%path.length;
      const frame=courseFrame(path,dist), vp=offsetVertex(frame,van.offset,.042);
      if (Math.abs(vp[0]-x)>10||Math.abs(vp[2]-z)>10) continue;
      if (Math.abs(rideElevation(vp[0],vp[2])-y)>2.2) continue;
      const fx=frame.f[0]*van.direction, fz=frame.f[2]*van.direction, rx=-fz, rz=fx;
      const dx=x-vp[0], dz=z-vp[2], lf=dx*fx+dz*fz, lr=dx*rx+dz*rz;
      const ex=(van.halfL??2.15)+r, ez=(van.halfW??.92)+r;
      if (Math.abs(lf)<ex&&Math.abs(lr)<ez) {
        const penF=ex-Math.abs(lf), penR=ez-Math.abs(lr);
        let nx=x, nz=z;
        if (penR<=penF) { const s=lr>=0?1:-1; nx+=rx*s*(penR+.04); nz+=rz*s*(penR+.04); }
        else { const s=lf>=0?1:-1; nx+=fx*s*(penF+.04); nz+=fz*s*(penF+.04); }
        if (mayRide(nx,nz)) { x=nx; z=nz; }
        rider.speed=Math.min(rider.speed*.45,van.speed*.85);
        hit=true;
      }
    }
  }
  if (typeof onlineRoom!=='undefined'&&onlineRoom&&typeof onlineRiderPoses==='function'&&typeof race!=='undefined'&&race.phase==='race') {
    for (const pose of onlineRiderPoses(now)) {
      const pp=pose.position;
      if (!pp||Math.abs(pp[1]-y)>1.8) continue;
      const dx=x-pp[0], dz=z-pp[2], d=Math.hypot(dx,dz), minD=r+riderCollisionRadius(pose.vehicle);
      if (d<minD) {
        const ux=d>.001?dx/d:Math.cos(rider.heading+Math.PI/2), uz=d>.001?dz/d:Math.sin(rider.heading+Math.PI/2);
        const push=(minD-d)*.68+.03, nx=x+ux*push, nz=z+uz*push;
        if (mayRide(nx,nz)) { x=nx; z=nz; }
        rider.speed*=.72;
        hit=true;
      }
    }
  }
  if (hit) rider.collidedAt=now;
  return [x,z,hit];
}
function moveCyclist(rider,input,dt,exploring=false,wind=null,trafficClock=null) {""")
js("energy:1,sprinting:false,sprintLocked:false,throttle:0,brake:0,yawRate:0,lean:0,slip:0,stationaryBrake:0};",
   "energy:1,sprinting:false,sprintLocked:false,throttle:0,brake:0,yawRate:0,lean:0,slip:0,stationaryBrake:0,surfaceKind:'paved',hazard:null};")
js("""  const bike=cycling?rider.bike:(rider.tuning??buildVehicleTuning(vehicle));
  rider.throttle=mix(rider.throttle,input.gas&&!input.brake?1:0,1-Math.exp(-12.6*dt));
  rider.brake=mix(rider.brake,input.brake?1:0,1-Math.exp(-(input.brake?18.0:24.0)*dt));

  if (!input.sprint) rider.sprintLocked=false;
  rider.sprinting=cycling && paved && !input.brake && input.sprint && !rider.sprintLocked && rider.speed>2.6 && rider.energy>.045;
  const grade=riderGrade(p,rider.heading);
  if (cycling) updateBicyclePosture(rider,input,grade,dt);
  const tuck=cycling?(rider.tuck??0):0, stand=cycling?(rider.stand??0):0;
  if (rider.sprinting) {
    rider.energy=Math.max(0,rider.energy-dt*.193*(bike.sprintDrain??1)*(1+.28*stand));
    if (rider.energy<=.045) rider.sprintLocked=true;
  } else rider.energy=Math.min(1,rider.energy+dt*(rider.drafting?.070:paved?.052:.035)*(bike.sprintRecover??1));""",
   """  const bike=cycling?rider.bike:(rider.tuning??buildVehicleTuning(vehicle));
  const surfaceKind=activeCampus==='shunde'?parkSurfaceKind(p[0],p[2]):(paved?'paved':'grass');
  const gravel=surfaceKind==='gravel';
  const poweredOnGravel=gravel&&!cycling;
  rider.surfaceKind=surfaceKind;
  rider.throttle=mix(rider.throttle,input.gas&&!input.brake?1:0,1-Math.exp(-12.6*dt));
  rider.brake=mix(rider.brake,input.brake?1:0,1-Math.exp(-(input.brake?18.0:24.0)*dt));

  if (!input.sprint) rider.sprintLocked=false;
  rider.sprinting=cycling && (paved || gravel) && !input.brake && input.sprint && !rider.sprintLocked && rider.speed>2.6 && rider.energy>.045;
  const grade=riderGrade(p,rider.heading);
  if (cycling) updateBicyclePosture(rider,input,grade,dt);
  const tuck=cycling?(rider.tuck??0):0, stand=cycling?(rider.stand??0):0;
  if (rider.sprinting) {
    rider.energy=Math.max(0,rider.energy-dt*.193*(bike.sprintDrain??1)*(1+.28*stand)*(gravel?1.18:1));
    if (rider.energy<=.045) rider.sprintLocked=true;
  } else rider.energy=Math.min(1,rider.energy+dt*(rider.drafting?.070:paved?.052:gravel?.046:.035)*(bike.sprintRecover??1));""")
js("""  if (!mayRide(x,z)) {
    const slideX=mayRide(x,p[2]),slideZ=mayRide(p[0],z);
    if (slideX&&(!slideZ||Math.abs(step[0])>Math.abs(step[2]))) z=p[2];
    else if (slideZ) x=p[0];
    else {x=p[0];z=p[2];}
    rider.speed*=.38;
  }
  rider.paved=surfaceAt(x,z,exploring);""",
   """  rider.hazard=null;
  if (waterHazardAt(x,z)) rider.hazard='water';
  else if (activeCampus==='shunde' && parkMountainDropOff(x,z,p[1])) rider.hazard='cliff';
  if (!rider.hazard && !mayRide(x,z)) {
    const slideX=mayRide(x,p[2]),slideZ=mayRide(p[0],z);
    if (slideX&&(!slideZ||Math.abs(step[0])>Math.abs(step[2]))) z=p[2];
    else if (slideZ) x=p[0];
    else {x=p[0];z=p[2];}
    rider.speed*=.38;
  }
  if (!rider.hazard) [x,z]=resolveVehicleCollisions(rider,x,z,p[1],trafficClock,mayRide);
  if (activeCampus==='shunde') {
    rider.surfaceKind=parkSurfaceKind(x,z);
    rider.paved=rider.surfaceKind==='paved';
  } else {
    rider.paved=surfaceAt(x,z,exploring);
    rider.surfaceKind=rider.paved?'paved':'grass';
  }""")
js("""  const flatLimit=paved?(rider.sprinting?bike.sprintSpeed:bike.roadSpeed):bike.grassSpeed;
  const topSpeedEffect=1-clamp(grade*1.25,0,.22)+(paved&&cycling?clamp(-grade*.92,0,.12):0);
  const windAlong=wind?Math.cos(rider.heading)*wind.vector[0]+Math.sin(rider.heading)*wind.vector[1]:0;
  const windSpeedScale=wind?clamp(1+windAlong*wind.speed*.014,.78,1.22):1;
  const windDragScale=wind?clamp(1-windAlong*wind.speed*.055,.52,1.85):1;
  const limit=flatLimit*(topSpeedEffect+tuck*clamp(-grade*.27,0,.032))*(rider.drafting?1.045:1)*windSpeedScale;
  const drag=(.48+Math.abs(rider.speed)*.047)*(paved?bike.rolling:bike.grassRolling??2.85)*(rider.drafting?.76:1)*(1-tuck*.36)*windDragScale;""",
   """  const gravelBase=cycling?bicycleGravelSpeed(bike):bike.gravelSpeed;
  const gravelSprint=Math.min(bike.sprintSpeed,gravelBase*1.14);
  const flatLimit=paved?(rider.sprinting?bike.sprintSpeed:bike.roadSpeed):gravel?(rider.sprinting?gravelSprint:gravelBase):bike.grassSpeed;
  const topSpeedEffect=1-clamp(grade*1.25,0,.22)+((paved||gravel)&&cycling?clamp(-grade*(paved?.92:.55),0,paved?.12:.07):0);
  const windAlong=wind?Math.cos(rider.heading)*wind.vector[0]+Math.sin(rider.heading)*wind.vector[1]:0;
  const windSpeedScale=wind?clamp(1+windAlong*wind.speed*.014,.78,1.22):1;
  const windDragScale=wind?clamp(1-windAlong*wind.speed*.055,.52,1.85):1;
  const limit=flatLimit*(topSpeedEffect+tuck*clamp(-grade*.27,0,.032))*(rider.drafting?1.045:1)*windSpeedScale;
  const gravelDrag=cycling?mix(bike.rolling,bike.grassRolling,.36):bike.gravelRolling;
  const drag=(.48+Math.abs(rider.speed)*.047)*(paved?bike.rolling:gravel?gravelDrag:bike.grassRolling??2.85)*(rider.drafting?.76:1)*(1-tuck*.36)*windDragScale;""")
js("""    const groundForce=paved?5.28:cycling?4.08:3.40;
    const force=rider.throttle*(rider.sprinting?7.64*(bike.sprintForce??1)*(1+stand*(bike.frame==='agile'?.20:.15)):groundForce)*gearing;
    if (rider.speed>limit) rider.speed=Math.max(limit,rider.speed-dt*(paved?3.75:bike.grassSlowdown??8.85));""",
   """    const groundForce=paved?5.28:gravel?(cycling?4.82:bike.gravelForce):cycling?4.08:3.40;
    const force=rider.throttle*(rider.sprinting?7.64*(bike.sprintForce??1)*(1+stand*(bike.frame==='agile'?.20:.15))*(gravel?.68:1):groundForce)*gearing;
    const gravelSlowdown=cycling?mix(1.55,2.15,clamp((bike.grassSlowdown-2.9)/2.0,0,1)):bike.gravelSlowdown;
    if (rider.speed>limit) rider.speed=Math.max(limit,rider.speed-dt*(paved?3.75:gravel?gravelSlowdown:bike.grassSlowdown??8.85));""")
js("const wet=paved&&weather.wetness>0;", "const wet=(paved||poweredOnGravel)&&weather.wetness>0;")
js("rider.brake*9.3*(bike.brakePower??1)*wetBrake+drag+hillAcceleration",
   "rider.brake*9.3*(bike.brakePower??1)*wetBrake*(poweredOnGravel?bike.gravelBrake:1)+drag+hillAcceleration")
js("  const grip=(paved?bike.roadGrip*wetGrip:bike.grassGrip)*(1-(bike.brakeTurnLoss??.145)*rider.brake);",
   """  const gravelGrip=cycling?mix(bike.grassGrip,bike.roadGrip,.40):bike.gravelGrip*wetGrip;
  const grip=(paved?bike.roadGrip*wetGrip:gravel?gravelGrip:bike.grassGrip)*(1-(bike.brakeTurnLoss??.145)*rider.brake);""")
js("""    const previous=moveCyclist(this.rider,input,PHYSICS_STEP,exploring,stepWind,stepClock);
    this.moved ||= Math.hypot(previous[0] - this.rider.position[0], previous[2] - this.rider.position[2]) > .0001;
    if (this.phase !== 'race') return;""",
   """    const previous=moveCyclist(this.rider,input,PHYSICS_STEP,exploring,stepWind,stepClock);
    this.moved ||= Math.hypot(previous[0] - this.rider.position[0], previous[2] - this.rider.position[2]) > .0001;
    if (this.rider.hazard) {
      const reason=this.rider.hazard;
      this.rider.hazard=null;
      const label=reason==='water'?'落水':'冲出山路';
      if (this.phase==='race') {
        this.rejoin();
        this.rejoinReason=label;
      } else {
        const spot=nearestSafeRoad(this.rider.position[0],this.rider.position[2]);
        if (spot) {
          this.rider.position=[...spot.p];
          this.rider.heading=spot.heading;
          this.rider.speed=0;
          this.rider.yawRate=0;
          this.rider.lean=0;
          this.rider.slip=0;
          this.rider.paved=surfaceAt(spot.p[0],spot.p[2],exploring);
          this.rider.surfaceKind=activeCampus==='shunde'?parkSurfaceKind(spot.p[0],spot.p[2]):(this.rider.paved?'paved':'grass');
          this.freeHazardNotice={text:label+'，已强制遣返最近赛道',until:(typeof performance!=='undefined'?performance.now():Date.now())+2200};
          if (typeof playCustomSound === 'function') playCustomSound('rejoin');
        }
      }
      return;
    }
    if (this.phase !== 'race') return;""")
js("""    this.lastRejoin = -Infinity;
    this.lastRun=null;""",
   """    this.lastRejoin = -Infinity;
    this.rejoinReason = null;
    this.freeHazardNotice = null;
    this.lastRun=null;""")
js("""  abandon() {
    this.rider=makeCyclist(this.event,this.bike,this.vehicle);
    this.moved = false;""",
   """  abandon() {
    this.rider=makeCyclist(this.event,this.bike,this.vehicle);
    this.rejoinReason = null;
    this.freeHazardNotice = null;
    this.moved = false;""")
js("""    this.elapsed += REJOIN_MS;
    this.lastRejoin = this.elapsed;""",
   """    this.elapsed += REJOIN_MS;
    this.lastRejoin = this.elapsed;
    this.rejoinReason = null;""")
js("""  ui.next.hidden = !trial || !current || race.phase === 'count';""",
   """  const freeHazard=!trial&&race.freeHazardNotice&&performance.now()<race.freeHazardNotice.until;
  ui.next.hidden = (!trial || !current || race.phase === 'count') && !freeHazard;""")
js("""  if(race.phase==='race'&&race.elapsed-race.lastRejoin<1250) {
    setText(ui.next,'已回到赛道 · 加 2 秒');
    delete ui.next.dataset.alert;
  } else if (race.phase==='race'&&current&&race.missedGate) {""",
   """  if(freeHazard) {
    setText(ui.next,race.freeHazardNotice.text);
    ui.next.dataset.alert='missed';
  } else if(race.phase==='race'&&race.elapsed-race.lastRejoin<1250) {
    setText(ui.next,race.rejoinReason?race.rejoinReason+'，已强制遣返赛道 · 加 2 秒':'已回到赛道 · 加 2 秒');
    if (race.rejoinReason) ui.next.dataset.alert='missed';
    else delete ui.next.dataset.alert;
  } else if (race.phase==='race'&&current&&race.missedGate) {""")
js("!race.rider.paved?'草地减速'", "!race.rider.paved?(race.rider.surfaceKind==='gravel'?'碎石路面':'草地减速')")
js_span('function requestTravel()', 'const worldShapes=', content('station-travel.js')+'\n\n')
js("'travel','campusName'", "'travel','travelDialog','travelStation','travelChoices','travelClose','campusName'")
js("  ui.travel.addEventListener('click',requestTravel);", """  ui.travel.addEventListener('click',requestTravel);
  ui.travelClose.addEventListener('click',()=>ui.travelDialog.close());
  ui.travelDialog.addEventListener('close',()=>{clearInput();priorTimestamp=undefined;ui.travel.focus();});""")
js("if(ui.seedDialog.open||ui.friendDialog.open||ui.onlineDialog.open||ui.medalDialog?.open) return;",
   "if(ui.travelDialog.open||ui.seedDialog.open||ui.friendDialog.open||ui.onlineDialog.open||ui.medalDialog?.open) return;")
js("&&!ui.medalDialog?.open;", "&&!ui.medalDialog?.open&&!ui.travelDialog.open;")
js("'UCL 返程点','返回深圳大学'", "'UCL 旅行站','选择目的地'")
js("'校园旅行','前往 UCL'", "'站点旅行','选择目的地'")
js("station:'UCL 返程点'", "station:'UCL 旅行站'")
js("label('返程点',campuses.ucl", "label('旅行站',campuses.ucl")
js("london?'返程点位于 Gower Street 校门旁'", "activeCampus==='shunde'?'旅行站位于牌坊广场':london?'旅行站位于 Gower Street 校门旁'")
js("const outside=!london&&!inCampus", "const outside=activeCampus==='szu'&&!inCampus")
js("zoomMap?(london?'看街区'", "zoomMap?(activeCampus==='shunde'?'看全园':london?'看街区'")
js("zoomMap?race.event.name:london?", "zoomMap?race.event.name:activeCampus==='shunde'?'顺峰山自由骑行':london?")
js("""      const frame=courseFrame(path,distance), point=offsetVertex(frame,van.offset,.042);
      if (Math.hypot(point[0]-eye[0],point[2]-eye[2])>190) continue;
      const angle=-Math.atan2(frame.f[2]*van.direction,frame.f[0]*van.direction);
      models.push([cars.get(van.model),placement(point,0,angle,0)]);""",
   """      const frame=courseFrame(path,distance), point=offsetVertex(frame,van.offset,.042);
      if (Math.hypot(point[0]-eye[0],point[2]-eye[2])>190) continue;
      point[1]+=rideElevation(point[0],point[2]);
      const heading=Math.atan2(frame.f[2]*van.direction,frame.f[0]*van.direction);
      const pitch=activeCampus==='shunde'?Math.atan(riderGrade(point,heading)):0;
      models.push([cars.get(van.model),placement(point,0,-heading,pitch)]);""")
js("if(!seedAvailable()||ui.seedDialog.open", "if(activeCampus==='shunde'||!seedAvailable()||ui.seedDialog.open")
js("    ui.courierButton.hidden=online||trial;", "    ui.courierButton.hidden=online||trial;")
js("  ui.onlineButton.disabled=!online&&", """  ui.seedButton.hidden=activeCampus==='shunde';
  ui.onlineButton.disabled=!online&&""")
js("new Set([weeklySeed(region),", "new Set([region==='shunde'?null:weeklySeed(region),")
js("const bounds = campus==='ucl'?uclBounds:cityExtent;", "const bounds = campus==='shunde'?parkBounds:campus==='ucl'?uclBounds:cityExtent;")
js("typeof seed === 'string' && seed.length<=15", "campus!=='shunde' && typeof seed === 'string' && seed.length<=15")
js("const key=event.seed?", "const key=event.campus==='shunde'?'shunde-qingyun-1:'+event.id:event.seed?")
js("const rows = { szu: [], ucl: [] };", "const rows = { szu: [], ucl: [], shunde: [] };")
js("for (const campus of ['szu', 'ucl']) {\n    for (const event", "for (const campus of Object.keys(rows)) {\n    for (const event")
js("renderMedalSection(ui.medalListUcl, stats.rows.ucl, canJump);","renderMedalSection(ui.medalListUcl, stats.rows.ucl, canJump);\n  renderMedalSection(byId('medalListPark'),stats.rows.shunde,canJump);")
html('16条固定路线勋章','20条固定路线勋章')
html('<ul class="medal-list" id="medalListUcl"></ul>', '''<ul class="medal-list" id="medalListUcl"></ul>
        <h3 class="medal-group-title">顺峰山公园（4 条）</h3><ul class="medal-list" id="medalListPark"></ul>''')
html('    <dialog id="medalDialog"', '''    <dialog id="travelDialog" class="settings-dialog" aria-labelledby="travelTitle">
      <header class="settings-head"><h2 id="travelTitle">站点旅行</h2><button class="action" type="button" id="travelClose">返回</button></header>
      <p>当前站点 · <strong id="travelStation"></strong></p><div id="travelChoices"></div>
    </dialog>
    <dialog id="medalDialog"''')
html('id="travel" type="button"', 'id="travel" type="button" aria-haspopup="dialog" aria-controls="travelDialog"')
html('</style>', '#travelDialog{max-width:min(25rem,90vw)}#travelChoices{display:grid;gap:.65rem}#travelChoices button{min-height:44px;text-align:left}\n</style>')

# Traffic uses the same lineup and clock for drawing, collision and drafting.
js("class TimeTrial {", content('traffic.js')+"\n\nclass TimeTrial {")
js("function buildRidingScene(campus) {", "function buildRidingScene(campus) {\n  trafficSceneRevision++;")
js("    this.frames = [packPose(0, this.rider)];\n    this.replayInterval = this.recordRules.interval;", "    stageRaceTraffic(this);\n    this.frames = [packPose(0, this.rider)];\n    this.replayInterval = this.recordRules.interval;")
js("    this.frames = [packPose(0, this.rider)];\n    this.replayInterval=this.recordRules.interval;", "    stageRaceTraffic(this);\n    this.frames = [packPose(0, this.rider)];\n    this.replayInterval=this.recordRules.interval;")
js("const stepClock = this.phase === 'race' ? this.elapsed / 1000 : this.freeClock;", "const stepClock = raceTrafficTime(this);")
js("    if (this.phase === 'free') this.freeClock += PHYSICS_STEP;", """    if (this.phase === 'free') this.freeClock += PHYSICS_STEP;
    if (this.phase === 'race') this.trafficElapsed=(this.trafficElapsed??0)+PHYSICS_STEP;""")
js("PHYSICS_STEP,exploring,stepWind,stepClock);", "PHYSICS_STEP,exploring,stepWind,stepClock,trialTraffic(this).vehicles);")
js("function moveCyclist(rider,input,dt,exploring=false,wind=null,trafficClock=null)", "function moveCyclist(rider,input,dt,exploring=false,wind=null,trafficClock=null,actors=cityVehicles)")
js("trafficDraftingAt(rider,trafficClock)", "trafficDraftingAt(rider,trafficClock,actors)")
js("function trafficDraftingAt(rider, time) {", "function trafficDraftingAt(rider, time, actors=cityVehicles) {")
js("typeof cityVehicles === 'undefined' || !cityVehicles.length", "!actors.length")
js("""  for (const van of cityVehicles) {
    const path = van.path;
    const distance = ((van.start + van.direction * van.speed * time) % path.length + path.length) % path.length;
    const frame = courseFrame(path, distance);
    const point = offsetVertex(frame, van.offset, .042);""",
   """  for (const van of actors) {
    const {frame,point}=trafficPosition(van,time);""")
js("function resolveVehicleCollisions(rider,x,z,y,trafficClock,mayRide)", "function resolveVehicleCollisions(rider,x,z,y,trafficClock,mayRide,actors=cityVehicles)")
js("resolveVehicleCollisions(rider,x,z,p[1],trafficClock,mayRide)", "resolveVehicleCollisions(rider,x,z,p[1],trafficClock,mayRide,actors)")
js("""  if (trafficClock!==null&&Array.isArray(cityVehicles)&&cityVehicles.length) {
    for (const van of cityVehicles) {
      const path=van.path;
      const dist=((van.start+van.direction*van.speed*trafficClock)%path.length+path.length)%path.length;
      const frame=courseFrame(path,dist), vp=offsetVertex(frame,van.offset,.042);""",
   """  if (trafficClock!==null) {
    for (const van of actors) {
      const {frame,point:vp}=trafficPosition(van,trafficClock);""")
js("""  function trafficNear(eye,time) {
    const models=[];
    for(const van of cityVehicles) {
      const path=van.path, distance=((van.start+van.direction*van.speed*time)%path.length+path.length)%path.length;
      const frame=courseFrame(path,distance), point=offsetVertex(frame,van.offset,.042);""",
   """  function trafficNear(eye,time,actors) {
    const models=[];
    for(const van of actors) {
      const {frame,point}=trafficPosition(van,time);""")
js("""    const trafficClock=race.phase==='race'?race.elapsed/1000:race.freeClock;
    const trafficModels=trafficNear(previousCamera.eye,trafficClock);""",
   """    const trafficModels=trafficNear(previousCamera.eye,raceTrafficTime(race),trialTraffic(race).vehicles);""")
js("sound:true,collision:false,windSpeed:0", "sound:true,collision:false,traffic:'sparse',windSpeed:0")
js("      collision:saved.collision===true,", "      collision:saved.collision===true,\n      traffic:knownTraffic(saved.traffic),")
js("'settingsSound','settingsCollision','friendMultiBar'", "'settingsSound','settingsCollision','settingsTraffic','onlineTraffic','onlineLobbyTraffic','friendMultiBar'")
js("  if(ui.settingsCollision) ui.settingsCollision.checked=preferences.collision===true;", """  ui.settingsTraffic.value=preferences.traffic;
  ui.settingsTraffic.disabled=Boolean(onlineRoom)||race.phase==='race'||race.phase==='count';
  ui.settingsCollision.disabled=Boolean(onlineRoom)||trialTraffic(race).mode==='off';
  ui.settingsCollision.checked=preferences.collision===true;""")
js("  ui.settingsWindSpeed?.addEventListener('change',()=>{", """  ui.settingsTraffic.addEventListener('change',()=>{
    preferences.traffic=knownTraffic(ui.settingsTraffic.value);
    ui.settingsCollision.disabled=preferences.traffic==='off';
    savePreferences();
  });
  ui.settingsWindSpeed?.addEventListener('change',()=>{""")
html('<label for="settingsCollision">', '''<label for="settingsTraffic">车流密度<small>计时赛发车前选择</small></label>
        <select id="settingsTraffic"><option value="off">关闭</option><option value="sparse">稀疏（默认）</option><option value="standard">标准</option></select>
      </div><div class="setting-line">
        <label for="settingsCollision">''')
js("collision:ui.onlineCollision?.value==='on',", "collision:ui.onlineCollision?.value==='on',traffic:ui.onlineTraffic.value,")
js("const ruleTags = `碰撞箱：", "const ruleTags = `车流 ${{off:'关闭',sparse:'稀疏',standard:'标准'}[knownTraffic(state.traffic)]} · 碰撞箱：")
js("  if (ui.onlineLobbyCollision) ui.onlineLobbyCollision.value", "  ui.onlineLobbyTraffic.value=knownTraffic(state.traffic);\n  ui.onlineLobbyTraffic.disabled=onlineBusy;\n  if (ui.onlineLobbyCollision) ui.onlineLobbyCollision.value")
js("  ui.onlineLobbyCollision?.addEventListener('change',()=>{", """  ui.onlineLobbyTraffic.addEventListener('change',()=>{
    void hostUpdateOnlineConfig({traffic:knownTraffic(ui.onlineLobbyTraffic.value)});
  });
  ui.onlineLobbyCollision?.addEventListener('change',()=>{""")

# 1.8.6 HUD slimming, surface info, mobile L-pad touch controls, touchSize & secondary guide
js("'settingsTraffic','onlineTraffic','onlineLobbyTraffic','friendMultiBar'",
   "'settingsTraffic','settingsTouchSize','settingsGuideBtn','guideSettings','onlineTraffic','onlineLobbyTraffic','friendMultiBar'")
js("""  const streetName=london?uclWayByPath.get(uclStreetAt(x,z,1.15)):outside?.name;
  setText(ui.surfaceType,streetName ?? (!race.rider.paved?(race.rider.surfaceKind==='gravel'?'碎石路面':'草地减速'):race.rider.slip>.275?'抓地接近上限':'路面抓地'));""",
   """  const streetName=london?uclWayByPath.get(uclStreetAt(x,z,1.15)):outside?.name;
  let roadLoc=streetName;
  const onPavilionWalk=activeCampus==='shunde'&&parkPavilionDeck(x,z)!==null&&!parkPaved(x,z);
  if(activeCampus==='shunde') {
    const sc=typeof shundeShortcutAt==='function'?shundeShortcutAt(x,z):null;
    if(onPavilionWalk) roadLoc='湖心亭';
    else if(sc) roadLoc=sc.name;
    else {
      const branch=typeof mountainRoadAt==='function'?mountainRoadAt(x,z,true):null;
      if(branch&&branch.gap<=branch.lane.path.width+2.5) roadLoc=branch.lane.path===mountainUp?'神步山上山道':'神步山下山道';
      else if(typeof bridgeAxis==='function'&&Math.abs(bridgeAxis(x,z))<40&&Math.abs(parkBridgeSide(x,z))<6) roadLoc='九孔伏波桥';
      else if(race.phase==='free') roadLoc=(typeof nearestCourierLandmark==='function'?nearestCourierLandmark('shunde',x,z,42):null)??(parkPaved(x,z,-2)?'青云湖环线':'顺峰山公园');
      else if(parkPaved(x,z,-1)) roadLoc='青云湖环线';
    }
  } else if(!roadLoc&&race.phase==='free') {
    const near=typeof nearestCourierLandmark==='function'?nearestCourierLandmark(activeCampus,x,z,38):null;
    roadLoc=near??(activeCampus==='szu'&&race.rider.paved?'深大校内道路':null);
  }
  const surfaceShort=onPavilionWalk?'栈道':!race.rider.paved?(race.rider.surfaceKind==='gravel'?'碎石':'草地'):'柏油';
  const surfaceFull=!race.rider.paved?(race.rider.surfaceKind==='gravel'?'碎石路面':'草地减速'):'柏油路面';
  setText(ui.surfaceType,race.phase==='free'?(roadLoc?roadLoc+' · '+surfaceShort:surfaceFull):(!race.rider.paved?surfaceFull:(roadLoc??'柏油路面')));""")
js("  ui.startTrial.disabled=ui.freeRide.disabled=online;", """  ui.startTrial.disabled=ui.freeRide.disabled=online;
  ui.freeRide.hidden=!trial||online;
  if(trial&&!online) {
    const fin=race.phase==='done';
    setText(ui.freeRide,fin?'返回自由骑行':'退出比赛');
    ui.freeRide.title=fin?'结束本场并返回自由骑行':'退出当前比赛并返回自由骑行';
  }""")
html('<button class="float-button mode-button" id="freeRide" type="button" aria-pressed="true" title="切换到自由骑行">自由骑行</button>',
     '<button class="float-button mode-button" id="freeRide" type="button" aria-pressed="true" title="切换到自由骑行" hidden>自由骑行</button>')

js("""  for (const button of touchButtons) {
    button.addEventListener('pointerdown',event => {
      if (!ready) return;
      event.preventDefault();
      touches.set(event.pointerId,button.dataset.drive);
      button.setPointerCapture(event.pointerId);
      button.classList.add('active');
      queueDrive(event);
    });
    const release = event => {
      if (!touches.delete(event.pointerId)) return;
      button.classList.toggle('active', Array.from(touches.values()).includes(button.dataset.drive));
      queueDrive(event);
    };
    button.addEventListener('pointerup',release);
    button.addEventListener('pointercancel',release);
    button.addEventListener('lostpointercapture',release);
  }""",
   """  const touchPad = document.querySelector('.touch');
  const syncTouchButtons = () => {
    const held = new Set(touches.values());
    for (const button of touchButtons) button.classList.toggle('active', held.has(button.dataset.drive));
  };
  const touchDriveAt = (x, y, pad = 10) => {
    let hit = null, bestScore = Infinity;
    for (const button of touchButtons) {
      if (button.hidden || button.disabled) continue;
      const r = button.getBoundingClientRect?.();
      if (!r || !r.width || !r.height) continue;
      if (x < r.left - pad || x > r.right + pad || y < r.top - pad || y > r.bottom + pad) continue;
      const cx = r.left + r.width * .5, cy = r.top + r.height * .5;
      const inside = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      const score = Math.hypot(x - cx, y - cy) + (inside ? 0 : 1000);
      if (score < bestScore) { bestScore = score; hit = button.dataset.drive; }
    }
    return hit;
  };
  if (touchPad) {
    touchPad.addEventListener('pointerdown', event => {
      if (!ready) return;
      const act = Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
        ? (touchDriveAt(event.clientX, event.clientY, 10) ?? event.target?.closest?.('[data-drive]')?.dataset.drive ?? null)
        : (event.target?.closest?.('[data-drive]')?.dataset.drive ?? null);
      if (!act) return;
      event.preventDefault();
      touches.set(event.pointerId, act);
      syncTouchButtons();
      queueDrive(event);
    });
    window.addEventListener('pointermove', event => {
      if (!touches.has(event.pointerId)) return;
      if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
      const next = touchDriveAt(event.clientX, event.clientY, 12);
      if (next !== touches.get(event.pointerId)) {
        touches.set(event.pointerId, next);
        syncTouchButtons();
        queueDrive(event);
      }
    });
    const releaseTouch = event => {
      if (!touches.delete(event.pointerId)) return;
      syncTouchButtons();
      queueDrive(event);
    };
    window.addEventListener('pointerup', releaseTouch);
    window.addEventListener('pointercancel', releaseTouch);
  }""")

html("""    <div class="touch" aria-label="触屏骑行控制">
      <div><button type="button" data-drive="left">左转</button><button type="button" data-drive="right">右转</button></div>
      <div><button type="button" data-drive="brake" title="刹车，停车后长按可倒车">刹车</button><button type="button" class="accent" data-drive="gas">加速</button><button type="button" data-drive="sprint">冲刺</button></div>
    </div>""",
     """    <div class="touch" aria-label="触屏骑行控制">
      <div class="touch-steer"><button type="button" data-drive="left">左转</button><button type="button" data-drive="right">右转</button></div>
      <div class="touch-pedals"><button type="button" data-drive="sprint">冲刺</button><button type="button" data-drive="brake" title="刹车，停车后长按可倒车">刹车</button><button type="button" class="accent" data-drive="gas">加速</button></div>
    </div>""")

js("const PREF_KEY='szu-litchi-display-1';",
   "function knownTouchSize(size) { return ['compact','standard','large'].includes(size)?size:'standard'; }\nconst PREF_KEY='szu-litchi-display-1';")
js("traffic:'sparse',windSpeed:0", "traffic:'sparse',touchSize:'standard',windSpeed:0")
js("traffic:knownTraffic(saved.traffic),", "traffic:knownTraffic(saved.traffic),\n      touchSize:knownTouchSize(saved.touchSize),")
js("  ui.settingsTraffic.value=preferences.traffic;",
   "  if(ui.settingsTouchSize) ui.settingsTouchSize.value=knownTouchSize(preferences.touchSize);\n  applyTouchSize();\n  ui.settingsTraffic.value=preferences.traffic;")
js("function savePreferences() {", "function applyTouchSize() {\n  if (typeof stage !== 'undefined' && stage?.dataset) stage.dataset.touchSize = knownTouchSize(preferences.touchSize);\n}\n\nfunction savePreferences() {")
js("""  ui.settingsTraffic.addEventListener('change',()=>{
    preferences.traffic=knownTraffic(ui.settingsTraffic.value);""",
   """  ui.settingsTouchSize?.addEventListener('change',()=>{
    preferences.touchSize=knownTouchSize(ui.settingsTouchSize.value);
    applyTouchSize();
    savePreferences();
  });
  ui.settingsTraffic.addEventListener('change',()=>{
    preferences.traffic=knownTraffic(ui.settingsTraffic.value);""")
html('      <div class="settings-result" id="settingsStatus">',
     '''      <div class="setting-line"><label for="settingsTouchSize">触屏按键大小<small>仅触屏模式生效，可调节按钮与热区尺寸</small></label><select id="settingsTouchSize">
        <option value="compact">紧凑</option><option value="standard">标准（推荐）</option><option value="large">超大</option>
      </select></div>
      <div class="settings-result" id="settingsStatus">''')

html('<header class="settings-head"><h2 id="settingsTitle">设置</h2><p id="settingsState" hidden></p></header>',
     '<header class="settings-head"><div class="settings-head-main"><h2 id="settingsTitle">设置</h2><p id="settingsState" hidden></p></div><button class="action settings-guide-btn" id="settingsGuideBtn" type="button">玩法说明</button></header>')
html('      <div class="bike-settings" id="bikeSettings" hidden>',
     '''      <div class="guide-panel" id="guideSettings" hidden>
        <section class="guide-card">
          <h3>操控与触屏</h3>
          <ul>
            <li>电脑：<code>W A S D</code> 或方向键骑行，<code>Shift</code> 冲刺，<code>F</code> 回赛道（+2 秒），<code>M</code> 俯视地图，<code>P</code> 暂停，<code>B / H</code> 摇车铃。</li>
            <li>手机：左手「左转 ↔ 右转」支持拇指直接滑动切换；右手「加速」上滑进「冲刺」、左滑切「刹车」，按键外缘自带扩边容错热区。</li>
            <li>触屏手感：可在「设置 → 触屏按键大小」切换紧凑 / 标准 / 超大档位。</li>
          </ul>
        </section>
        <section class="guide-card">
          <h3>姿态与破风</h3>
          <ul>
            <li>高速巡航自动进入「伏身破风」（降风阻、提极速），坡道低速或冲刺触发「起身摇车」（提爆发力）；仅在触发时显示于速度表上方。</li>
            <li>紧跟前方车流或联机对手 2–14 米可触发「尾流破风」，降低空气阻力并加快冲刺耐力回复。</li>
          </ul>
        </section>
        <section class="guide-card">
          <h3>路面、抓地与遣返</h3>
          <ul>
            <li>柏油路面极速最高，碎石路面需提前减速与渐进制动，草地会明显降速；左下角「抓地」进度条变橙/红时表示接近侧滑极限。</li>
            <li>在车库可比较不同载具的碎石极速和抓地。顺峰山湖心亭从青云塔山脚一侧上栈道，低速居中通过。</li>
            <li>顺峰山落水或冲出山路悬崖会触发强制遣返（计时赛 +2 秒罚时，自由骑行传回最近路面）。</li>
          </ul>
        </section>
        <section class="guide-card">
          <h3>模式、工坊与联机</h3>
          <ul>
            <li>支持深圳大学、伦敦 UCL 与顺峰山三站直达，可玩自由骑行 / 闪送打卡 / 计时赛（含区间单练与 0.90× 紫牌大师）/ 周赛种子 / 友人多影子对战。</li>
            <li>「车库」支持流派预设、5 槽配件取舍调校与外观定制；「联机」支持 BO1 / BO3 / 积分联赛 / 盲盒随机 / 铁人三项及赛前改车、车流、风场与碰撞箱规则。</li>
          </ul>
        </section>
      </div>
      <div class="bike-settings" id="bikeSettings" hidden>''')
js("""function openSettings(panel = 'display') {
  if(settingsOpen||pendingCampus||(onlineRoom&&(panel!=='bike'||onlineRoom.state.phase==='race'))) return;
  clearInput();priorTimestamp=undefined;settingsOpen=true;
  const garage = panel === 'bike';
  setText(ui.settingsTitle,garage?'车库':'设置');
  ui.displaySettings.hidden = garage;
  ui.bikeSettings.hidden = !garage;
  if(garage) showBikeSetup();
  else ui.driverName.value=driverProfile.name;
  updateSettingsActions();
  ui.settingsDialog.showModal();
  ui.settingsContinue.focus({preventScroll:true});
}""",
   """function setSettingsPanel(panel = 'display') {
  if(panel !== 'display' && !ui.displaySettings.hidden) commitDriverName();
  const garage = panel === 'bike', guide = panel === 'guide';
  setText(ui.settingsTitle, garage ? '车库' : guide ? '玩法说明' : '设置');
  ui.displaySettings.hidden = garage || guide;
  ui.bikeSettings.hidden = !garage;
  if(ui.guideSettings) ui.guideSettings.hidden = !guide;
  if(ui.settingsGuideBtn) {
    ui.settingsGuideBtn.hidden = garage;
    setText(ui.settingsGuideBtn, guide ? '返回设置' : '玩法说明');
  }
  if(garage) showBikeSetup();
  else if(!guide) ui.driverName.value = driverProfile.name;
}

function openSettings(panel = 'display') {
  if(settingsOpen||pendingCampus||(onlineRoom&&(panel!=='bike'||onlineRoom.state.phase==='race'))) return;
  clearInput();priorTimestamp=undefined;settingsOpen=true;
  setSettingsPanel(panel);
  updateSettingsActions();
  ui.settingsDialog.showModal();
  ui.settingsContinue.focus({preventScroll:true});
}""")
js("  ui.settingsButton.addEventListener('click',() => openSettings());",
   """  ui.settingsButton.addEventListener('click',() => openSettings());
  ui.settingsGuideBtn?.addEventListener('click',()=>setSettingsPanel(ui.guideSettings?.hidden?'guide':'display'));""")

# 1.9.0 Vehicle skills and speed view.
js('function moveCyclist(rider,input,dt,exploring=false,wind=null,trafficClock=null,actors=cityVehicles) {',
   content('vehicle-skills.js')+'\n\nfunction moveCyclist(rider,input,dt,exploring=false,wind=null,trafficClock=null,actors=cityVehicles) {')
js('} else rider.energy=Math.min(1,rider.energy+dt*(rider.drafting?.070:paved?.052:gravel?.046:.035)*(bike.sprintRecover??1));',
   '''} else if(cycling) rider.energy=Math.min(1,rider.energy+dt*(rider.drafting?.070:paved?.052:gravel?.046:.035)*(bike.sprintRecover??1));
  if(!cycling) updateVehicleSkill(rider,input,dt);''')
js('*windSpeedScale;\n  const gravelDrag=', '*windSpeedScale*(rider.skillLimit??1);\n  const gravelDrag=')
js('*windDragScale;\n\n  if (input.brake)', '*windDragScale+(rider.regenDrag??0);\n\n  if (input.brake)')
js('*(gravel?.68:1):groundForce)*gearing;', '*(gravel?.68:1):groundForce)*gearing*(rider.skillForce??1);')
js('mix(trail?1.88:1.75,trail?1.19:1.35,speedFactor);',
   'mix(trail?1.88:1.75,trail?1.19:1.35,speedFactor)*(rider.skillYaw??1);')
js('const maxTurn=grip/Math.max(2.75,velocity);',
   "const maxTurn=grip*(rider.skill==='手刹甩尾'?1.18:1)/Math.max(vehicle==='chair'?1.45:2.75,velocity);")
js('clamp((load-.88)*.92,0,1)', "clamp((load-.88)*.92+(rider.skill==='手刹甩尾'?.19:0),0,1)")
js('rider.slip*2.30*dt;', "rider.slip*(vehicle==='chair'?1.05:2.30)*dt;")
js('  if(stage.dataset.vehicle!==actor) stage.dataset.vehicle=actor;\n  ui.sprintKeys.hidden=ui.sprintMeter.hidden=!bicycle;',
   '''  if(stage.dataset.vehicle!==actor) {
    stage.dataset.vehicle=actor;
    const {action,meter}=vehicleSkills[actor];
    setText(document.querySelector('.touch [data-drive="sprint"]'),action);
    ui.sprintKeys.lastChild.nodeValue=' '+action+' ';
    ui.sprintMeter.setAttribute('aria-label',meter);
  }''')
js("  setText(ui.sprintHint,bicycle?(race.rider.sprinting?'冲刺中':'冲刺耐力'):vehicleLabel);",
   "  setText(ui.sprintHint,bicycle?(race.rider.sprinting?'冲刺中':'冲刺耐力'):(race.rider.skill||vehicleSkills[actor].meter));")
html('  .stage[data-vehicle]:not([data-vehicle="bike"]) [data-drive="sprint"] { display:none; }','')
js('  const fov=postcard?(portrait?.88:.81):(portrait?1.01:.96)+clamp(Math.max(0,rider.speed-10.6)*.009,0,.038);',
   '''  const stretch=motion.matches||postcard?0:speedFov(rider,prior,dt);
  const fov=(postcard?(portrait?.88:.81):portrait?1.01:.96)+stretch;''')
js('return {...view,eye,target,postcard,tangent:', 'return {...view,eye,target,postcard,speedFov:stretch,tangent:')

# 1.9.0 Weather effects, wind and courier navigation.
wind_city_wall = game[game.index('function cityWallAt('):game.index('function cameraWallHit(')]
js(wind_city_wall, '')
js('const vehicleSkills=', wind_city_wall+content('environment-190.js')+'\n\nconst vehicleSkills=')
js("const wet=(paved||poweredOnGravel)&&weather.wetness>0;",
   """const wet=(paved||poweredOnGravel)&&weather.wetness>0;
  const puddle=rainPuddleAt(activeCampus,p[0],p[2],weather.rain);
  if(puddle&&!rider.inPuddle&&rider.speed>2&&typeof playCustomSound==='function') playCustomSound('splash');
  rider.inPuddle=puddle;
  wind=shelteredWind(wind,rider,dt);""")
js('*(1-(bike.brakeTurnLoss??.145)*rider.brake);',
   '*(1-(bike.brakeTurnLoss??.145)*rider.brake)*(puddle?.63:1);')
js("+(rider.skill==='手刹甩尾'?.19:0),0,1)",
   "+(rider.skill==='手刹甩尾'?.19:0)+(puddle?.12:0),0,1)")
js('    if (decals.length) surfacePass(maskedSurface, camera.vp',
   '''    if(currentWeather().rain&&world.rainPuddles) {
      surfacePass(opaqueSurface,camera.vp,camera.eye,nearLight,size,time,world.rainPuddles,{reflect:false});
    }
    if (decals.length) surfacePass(maskedSurface, camera.vp''')
js('    const renderedFrame=gpu.draw(previousCamera,world,route,riderMeshes,p,waterTime,ghosts,trafficModels,currentAA(),head,onlineRoom?2:1);',
   '''    if(currentWeather().rain&&!world.rainPuddles) {
      world.rainPuddles=[[new gpu.Mesh(rainPuddleShape(activeCampus)),placement([0,0,0],0,0,0)]];
    }
    const renderedFrame=gpu.draw(previousCamera,world,route,riderMeshes,p,waterTime,ghosts,trafficModels,currentAA(),head,onlineRoom?2:1);''')
js("'bikePresets','bikePresetName','bikeSprintSpeed','bikeGravel',", "'settingsWindMode','puddleStatus','bikePresets','bikePresetName','bikeSprintSpeed','bikeGravel',")
html('<span id="draftPill" class="draft-pill" hidden>尾流破风</span>',
     '<span id="draftPill" class="draft-pill" hidden>尾流破风</span><span id="puddleStatus" class="draft-pill" hidden>积水打滑</span>')
js("  setText(ui.riderTag,driverProfile.name);", "  ui.puddleStatus.hidden=!race.rider.inPuddle;\n  setText(ui.riderTag,driverProfile.name);")
html('<div class="setting-line"><label for="settingsWindDir">',
     '<div class="setting-line"><label for="settingsWindMode">风场模式</label><select id="settingsWindMode"><option value="gust">阵风</option><option value="steady">恒定</option></select></div>\n      <div class="setting-line"><label for="settingsWindDir">')
js('  if(ui.settingsWindDir) ui.settingsWindDir.value=String(preferences.windDir??0);',
   '  ui.settingsWindMode.value=knownWindMode(preferences.windMode);\n  if(ui.settingsWindDir) ui.settingsWindDir.value=String(preferences.windDir??0);')
js("  ui.settingsWindDir?.addEventListener('change',()=>{",
   """  ui.settingsWindMode.addEventListener('change',()=>{
    preferences.windMode=knownWindMode(ui.settingsWindMode.value);
    savePreferences();
  });
  ui.settingsWindDir?.addEventListener('change',()=>{""")
js('const distM=Math.round(Math.hypot(CampusCourier.target.p[0]-race.rider.position[0],CampusCourier.target.p[2]-race.rider.position[2]));',
   '''const dx=CampusCourier.target.p[0]-race.rider.position[0],dz=CampusCourier.target.p[2]-race.rider.position[2];
      const distM=Math.round(Math.hypot(dx,dz));
      const bearing=Math.round((Math.atan2(dz,dx)-race.rider.heading)/(Math.PI/4));
      const arrow=['↑','↗','→','↘','↓','↙','←','↖'][((bearing%8)+8)%8];''')
js('${distM}m · 连单', '${arrow} ${distM}m · 连单')
js('add(CampusCourier.target.p,[0,4.95,0])','add(CampusCourier.target.p,[0,7.5,0])')

# 1.9.0 AI opponents and end-of-race replay.
js('class TimeTrial {',content('ai-rivals.js')+'\n\nclass TimeTrial {')
js('''    stageRaceTraffic(this);
    this.frames = [packPose(0, this.rider)];
    this.replayInterval=this.recordRules.interval;''',
   '''    stageRaceTraffic(this);
    this.rivals=prepareRivals(this);
    stepRivals(this,0);
    this.frames = [packPose(0, this.rider)];
    this.replayInterval=this.recordRules.interval;''')
js('  freeRide() {\n    const vehicle=this.opponent', '  freeRide() {\n    this.rivals=[];\n    this.rider.rivalPoses=[];\n    const vehicle=this.opponent')
js("    if (this.phase === 'race') this.trafficElapsed=(this.trafficElapsed??0)+PHYSICS_STEP;",
   "    if (this.phase === 'race') {\n      this.trafficElapsed=(this.trafficElapsed??0)+PHYSICS_STEP;\n      stepRivals(this,PHYSICS_STEP);\n    }")
js("||(trafficClock!==null&&typeof trafficDraftingAt==='function'&&trafficDraftingAt(rider,trafficClock,actors));",
   "||(trafficClock!==null&&typeof trafficDraftingAt==='function'&&trafficDraftingAt(rider,trafficClock,actors))||draftingFrom(rider,rider.rivalPoses??[]);")
js("""  if (typeof onlineRoom!=='undefined'&&onlineRoom&&typeof onlineRiderPoses==='function'&&typeof race!=='undefined'&&race.phase==='race') {
    for (const pose of onlineRiderPoses(now)) {""",
   """  const onlinePoses=typeof onlineRoom!=='undefined'&&onlineRoom&&typeof onlineRiderPoses==='function'&&
    typeof race!=='undefined'&&race.phase==='race'?onlineRiderPoses(now):[];
  const nearbyRiders=onlinePoses.length?onlinePoses:rider.rivalPoses??[];
  if(nearbyRiders.length) {
    for(const pose of nearbyRiders) {
      if (rivalYieldsContact(pose,rider,x,z)) continue;""")
js("    if (typeof playCustomSound === 'function') playCustomSound('finish');",
   """    if (typeof playCustomSound === 'function') playCustomSound('finish');
    if(this.rivals?.length) {
      this.lastRun.comparison=rivalComparison(this);
      return;
    }""")
js("  ui.friendExport.hidden=race.phase!=='done'||!race.lastRun||Boolean(race.practice);",
   "  ui.friendExport.hidden=race.phase!=='done'||!race.lastRun||Boolean(race.practice)||Boolean(race.rivals?.length);")
js("  if (race.phase!=='done' || !race.lastRun) return;", "  if (race.phase!=='done' || !race.lastRun || race.rivals?.length) return;")
js("  const liveRank=online&&race.phase==='race'?onlineRaceRank(performance.now()):null;",
   "  const liveRank=race.phase==='race'?(online?onlineRaceRank(performance.now()):aiRank(race)):null;")
js("if (liveRank) setText(ui.onlineRank,`第 ${liveRank.rank} / ${liveRank.total} 名`+(liveRank.gapMeters?\x60 · 落后 ${liveRank.gapMeters} 米\x60:' · 领跑'));",
   "if (liveRank) setText(ui.onlineRank,`第 ${liveRank.rank} / ${liveRank.total} 名`+(liveRank.gapMeters?\x60 · 落后 ${liveRank.gapMeters} 米\x60:liveRank.rank===1?' · 领跑':''));")
js("    const rank=medalName(event,race.elapsed,race.rider.vehicle);",
   "    const ai=aiRank(race);\n    const rank=ai?`第 ${ai.rank} / ${ai.total} 名`:medalName(event,race.elapsed,race.rider.vehicle);")
js("    setText(ui.callDetail,[duel,rank,record].filter(Boolean).join(' · '));",
   "    setText(ui.callDetail,[duel,rank,ai?'AI 独立成绩':record].filter(Boolean).join(' · '));")
js("  race.start(); zoomMap = false; cameraRevision++;",
   """  race.raceMode=knownRaceMode(ui.raceMode.value);
  race.start();
  refreshBicycleModels();
  zoomMap = false; cameraRevision++;""")
js("  ui.startTrial.disabled=ui.freeRide.disabled=online;", "  ui.raceMode.disabled=online||trial||Boolean(race.opponent);\n  ui.startTrial.disabled=ui.freeRide.disabled=online;")
html('<button class="action primary" id="startTrial"',
     '<label class="race-mode"><select id="raceMode" aria-label="单人比赛模式"><option value="solo">单人计时</option><option value="team">AI 车队赛</option><option value="duel">1v1 街头单挑</option></select></label>\n      <button class="action primary" id="startTrial"')
js("'settingsWindMode','puddleStatus','bikePresets'", "'raceMode','mapReplay','replayPlay','replaySpeed','replaySeek','replayDetail','settingsWindMode','puddleStatus','bikePresets'")
js("    const extraNeeded = onlineRoom ? peers.length : (race.extraOpponents?.length ?? 0);",
   """    for(const rival of race.rivals??[]) {
      if(rival.vehicle==='bike') remoteBicycles.set(rival.id,bicycleRigs.prepare(bicycleAppearance(rival,stockBike)));
      else prepareMotor(rival.vehicle);
    }
    const extraNeeded = onlineRoom ? peers.length : Math.max(race.rivals?.length??0,race.extraOpponents?.length??0);""")
js("    const ghost=preferences.ghost&&!onlineRoom?race.ghost:null;\n    const ghosts=ghostMeshes(ghost);",
   "    const ghost=preferences.ghost&&!onlineRoom&&!race.rivals?.length?race.ghost:null;\n    const ghosts=ghostMeshes(ghost);")
js("    const extraRiders=onlineRoom?onlineRiderPoses(performance.now()):(preferences.ghost?race.extraGhosts:[]);",
   "    const aiRiders=race.rivals?.map(actor=>actor.pose).filter(Boolean)??[];\n    const extraRiders=onlineRoom?onlineRiderPoses(performance.now()):(aiRiders.length?aiRiders:preferences.ghost?race.extraGhosts:[]);")
js("      ghosts.push(...ghostMeshes(remote,roomLimbs[index]));",
   "      if(!aiRiders.length) ghosts.push(...ghostMeshes(remote,roomLimbs[index]));")
js("    const trafficModels=trafficNear(previousCamera.eye,raceTrafficTime(race),trialTraffic(race).vehicles);",
   """    const trafficModels=trafficNear(previousCamera.eye,raceTrafficTime(race),trialTraffic(race).vehicles);
    for(const [index,rival] of aiRiders.entries()) {
      if(roomLimbs[index]) trafficModels.push(...ghostMeshes(rival,roomLimbs[index]));
    }""")
js("  if (race.opponent&&ghosts.length) {", "  if (race.opponent&&ghost&&ghosts.length) {")
js("  if(shadow&&!onlineRoom) mapPin(ctx,layout.project,shadow,compact,true);",
   """  const replay=drawReplayPins(ctx,layout.project,race,compact);
  if(!replay&&shadow&&!onlineRoom&&!race.rivals?.length) mapPin(ctx,layout.project,shadow,compact,true);
  if(!replay) for(const rival of race.rivals??[]) if(rival.pose) mapPin(ctx,layout.project,rival.pose,compact,true);""")
js("  mapPin(ctx,layout.project,race.rider,compact);", "  if(!replay) mapPin(ctx,layout.project,race.rider,compact);")
html('校园俯视地图</canvas><div class="map-tools">',
     '''校园俯视地图</canvas><div id="mapReplay" class="map-replay" hidden><button id="replayPlay" class="action" type="button">播放</button><select id="replaySpeed" aria-label="播放倍速"><option value="1">1×</option><option value="2">2×</option></select><input id="replaySeek" type="range" min="0" max="1" value="0" aria-label="回放时间轴"><output id="replayDetail"></output></div><div class="map-tools">''')
js("  initBicycleWorkshop();", "  initBicycleWorkshop();\n  initMapReplay();")
js("    const dt = Math.min(wallTime, .16);", "    const dt = Math.min(wallTime, .16);\n    if(mapOpen) updateMapReplay(dt);")
js("  else ui.mapPlace.hidden=true;","  else {ui.mapPlace.hidden=true;ui.mapReplay.hidden=true;mapReplay.playing=false;}")

# 1.9.0 Budgets and entertainment-only builds.
js("const MAX_ROAD_SPEED=", content('../../src/data/tuning-190.cjs')+'\n\nconst MAX_ROAD_SPEED=')
js("const grade=riderGrade(p,rider.heading);",
   "const rawGrade=riderGrade(p,rider.heading);\n  const grade=bike.magicGravity&&rawGrade>0?rawGrade*.05:rawGrade;")
js("  if(!cycling) updateVehicleSkill(rider,input,dt);",
   "  if(!cycling) updateVehicleSkill(rider,input,dt);\n  if(bike.magicEnergy) rider.energy=Math.min(1,rider.energy+.63*dt);")
js("const wetGrip=wet?mix(weather.gripScale,1,bike.wetMitigate??0):1;",
   "const wetGrip=wet&&!bike.magicGrip?mix(weather.gripScale,1,bike.wetMitigate??0):1;")
js("const limit=flatLimit*", "const limit=(bike.magicGrip&&!paved?Math.max(flatLimit,bike.roadSpeed):flatLimit)*")
js("*(puddle?.63:1);",
   """*(puddle&&!bike.magicGrip?.63:1)*
    (weather.rain?(bike.rainGrip??1):1)*(bike.sideWind&&wind?1-clamp(Math.abs(Math.sin(rider.heading-wind.angle))*wind.speed*.025,0,.4):1);""")
js("el.value=val; el.textContent=opt.name; sel.append(el);", "el.value=val; el.textContent=workshopPartTitle(vehicle,slot.key,val,opt.name); sel.append(el);")
js("  if(bicycle) renderWorkshop(bike,locked);", "  if(bicycle) renderWorkshop(bike,locked);\n  renderWorkshopBudget();")
html('<div id="bikeParts"', '''<div class="workshop-budget">
          <div class="setting-line"><label for="budgetPicker">单人预算</label><select id="budgetPicker"><option value="open">不限预算</option><option value="400">地贫 ¥400</option><option value="700">紧凑 ¥700</option></select></div>
          <p class="bike-note"><output id="budgetReadout" aria-live="polite"></output> <button class="action" id="budgetHighlight" type="button" hidden>查看超额配件</button></p>
          <p class="mod-warning" id="budgetNotice" hidden>违禁魔改 · 娱乐不计榜</p>
        </div>
        <div id="bikeParts"''')
js("'raceMode','mapReplay'", "'budgetPicker','budgetReadout','budgetHighlight','budgetNotice','soloRulesStatus','raceMode','mapReplay'")
html('<button class="action primary" id="startTrial" type="button" aria-keyshortcuts="R">开始计时赛</button>',
     '<button class="action primary" id="startTrial" type="button" aria-keyshortcuts="R">开始计时赛</button><small id="soloRulesStatus" class="mod-warning" role="status" hidden></small>')
js('  start() {\n    this.practice = null;\n    this.freeRide();',
   '''  start() {
    const budget=soloBudget(this);
    if(budget.over) return false;
    this.practice = null;
    this.freeRide();
    this.unranked=budget.illegal;''')
js('  freeRide() {\n    this.rivals=[];', '  freeRide() {\n    this.unranked=false;\n    this.rivals=[];')
js('  startPractice(fromGate, toGate) {\n    this.freeRide();',
   '''  startPractice(fromGate, toGate) {
    const budget=soloBudget(this);
    if(budget.over) return false;
    this.freeRide();
    this.unranked=budget.illegal;''')
js("time,vehicle:this.rider.vehicle,splits:this.splits.slice(),samples:this.frames,corners:this.cornerScores.slice(),",
   "time,vehicle:this.rider.vehicle,splits:this.splits.slice(),samples:this.frames,corners:this.cornerScores.slice(),\n      unranked:Boolean(this.unranked||this.rivals?.length),")
js("    if (this.practice) {\n      this.lastRun = null;\n      const prev = this.practiceBest.get(this.practice.key);",
   "    if (this.practice) {\n      this.lastRun = null;\n      if(this.unranked) return;\n      const prev = this.practiceBest.get(this.practice.key);")
js('    if (this.online) return;\n    this.record =', '    if (this.online||this.unranked) return;\n    this.record =')
js("  race.start();\n  refreshBicycleModels();",
   """  if(race.start()===false) {
    openSettings('bike');
    highlightBudgetParts();
    return;
  }
  refreshBicycleModels();""")
js("  race.startPractice(fromGate, toGate);\n  zoomMap = true;",
   """  if(race.startPractice(fromGate,toGate)===false) {
    openSettings('bike');
    highlightBudgetParts();
    return;
  }
  zoomMap = true;""")
js("  ui.friendExport.hidden=race.phase!=='done'||!race.lastRun||Boolean(race.practice)||Boolean(race.rivals?.length);",
   "  ui.friendExport.hidden=race.phase!=='done'||!race.lastRun||race.lastRun.unranked||Boolean(race.practice);")
js("  if (race.phase!=='done' || !race.lastRun || race.rivals?.length) return;",
   "  if (race.phase!=='done' || !race.lastRun || race.lastRun.unranked) return;")
js("  ui.raceMode.disabled=online||trial||Boolean(race.opponent);",
   """  ui.raceMode.disabled=online||trial||Boolean(race.opponent);
  if(!online&&!trial) {
    const {over,illegal}=soloBudget(race);
    ui.soloRulesStatus.hidden=!over&&!illegal;
    setText(ui.soloRulesStatus,over?`超预算 ¥${over} · 到车库调整`:illegal?'娱乐改装 · 本场不计榜':'');
  } else ui.soloRulesStatus.hidden=true;""")
js("    const rank=ai?`第 ${ai.rank} / ${ai.total} 名`:medalName(event,race.elapsed,race.rider.vehicle);",
   "    const rank=ai?`第 ${ai.rank} / ${ai.total} 名`:trialMedal(race);")
js("ai?'AI 独立成绩':record", "race.unranked?'娱乐改装 · 不计榜':ai?'AI 独立成绩':record")

js("'budgetPicker','budgetReadout','budgetHighlight',", "'onlineBudget','onlineBlind','onlineWindMode','onlineLobbyBudget','onlineLobbyBlind','onlineLobbyWindMode','budgetPicker','budgetReadout','budgetHighlight',")
js('      traffic:knownTraffic(saved.traffic),', '''      traffic:knownTraffic(saved.traffic),
      soloBudget:tuning190.normalizeBudget(saved.soloBudget),
      windMode:knownWindMode(saved.windMode),''')
js('  start() {\n    const budget=soloBudget(this);',
   '''  start() {
    const build=typeof onlineRoundBuild==='function'?onlineRoundBuild():null;
    const budget=build??soloBudget(this);''')
js('    this.rider=makeCyclist(this.event,this.bike,this.entryVehicle);',
   '    this.rider=makeCyclist(this.event,build?.bike??this.bike,build?.vehicle??this.entryVehicle,build?.tuning);')
js('    const ride = makeCyclist(this.event,this.bike,this.rider.vehicle);',
   '    const ride = makeCyclist(this.event,this.rider.bike,this.rider.vehicle,this.rider.tuning);')
js("function makeBenchmark(event,vehicle='bike') {", "function makeBenchmark(event,vehicle='bike',drive=null) {")
js("  const tuning=vehicleChoices[vehicle], cycling=vehicle==='bike';",
   "  const tuning=drive??vehicleChoices[vehicle], cycling=vehicle==='bike';")
js("  const top=cycling?11.55:tuning.roadSpeed*.96;",
   "  const top=cycling?(drive?drive.roadSpeed*.975:11.55):tuning.roadSpeed*.96;")
js("  const acceleration=cycling?4.86:4.34*tuning.force;",
   "  const acceleration=cycling?4.86*(drive?.force??1):4.34*tuning.force;")
js("cycling?Math.min(stockBike.roadSpeed,stockBike.grassSpeed*1.32):Math.min(tuning.roadSpeed,tuning.grassSpeed*1.18)",
   "cycling?bicycleGravelSpeed(drive??stockBike):tuning.gravelSpeed??Math.min(tuning.roadSpeed,tuning.grassSpeed*1.18)")
js("rider.sprinting=cycling && (paved || gravel)", "rider.sprinting=cycling && (paved || gravel || bike.magicGrip)")
js("+(puddle?.12:0),0,1)", "+(puddle&&!bike.magicGrip?.12:0),0,1)")
js("  const windSpeedScale=wind?clamp", "  rider.downwindDescent=grade<-.025&&windAlong>.25;\n  const windSpeedScale=wind?clamp")
js("  else {ui.mapPlace.hidden=true;ui.mapReplay.hidden=true;mapReplay.playing=false;}",
   "  else {ui.mapPlace.hidden=true;ui.mapReplay.hidden=true;mapReplay.playing=false;mapReplay.lastDraw=null;}")

# Compact HUD and a persistent scale independent of the touch controls.
html('</style>', content('hud-compact.css')+'\n</style>')
mini_button = '<button id="miniButton" class="mini" type="button" aria-label="打开俯视地图"><span>校园小地图</span><canvas id="miniMap" width="382" height="228" aria-hidden="true"></canvas></button>'
html('      '+mini_button+'\n', '')
nav_hud = '''      <div class="next" id="next" hidden></div>
      <div class="gate-flash" id="gateFlash" aria-live="polite" hidden></div>'''
html(nav_hud, '      <div class="hud-navigation">\n'+nav_hud+'\n      '+mini_button+'\n      </div>')
html('      <div class="setting-line"><label for="settingsTouchSize">',
     '''      <div class="setting-line"><label for="settingsHudScale">HUD 缩放<small>计时、速度、小地图和赛道提示</small></label><select id="settingsHudScale">
        <option value="auto">自动（推荐）</option><option value="65">65%</option><option value="80">80%</option><option value="100">100%</option><option value="115">115%</option><option value="130">130%</option>
      </select></div>
      <div class="setting-line"><label for="settingsTouchSize">''')
js("'settingsTouchSize','settingsGuideBtn'", "'settingsTouchSize','settingsHudScale','settingsGuideBtn'")
js("      touchSize:knownTouchSize(saved.touchSize),",
   "      touchSize:knownTouchSize(saved.touchSize),\n      hudScale:knownHudScale(saved.hudScale),")
js("function applyTouchSize() {",
   """function knownHudScale(value) {
  return ['65','80','100','115','130'].includes(value)?value:'auto';
}
function applyHudScale() {
  stage.dataset.hudScale=knownHudScale(preferences.hudScale);
}
function applyTouchSize() {""")
js("  applyTouchSize();\n  ui.settingsTraffic.value",
   "  applyTouchSize();\n  applyHudScale();\n  ui.settingsHudScale.value=knownHudScale(preferences.hudScale);\n  ui.settingsTraffic.value")
js("  ui.settingsTouchSize?.addEventListener('change',()=>{",
   """  ui.settingsHudScale.addEventListener('change',()=>{
    preferences.hudScale=knownHudScale(ui.settingsHudScale.value);
    applyHudScale();
    savePreferences();
  });
  ui.settingsTouchSize?.addEventListener('change',()=>{""")
js("    setText(ui.callValue,count > 0 ? String(count) : '出发');\n    ui.callDetail.hidden = true;",
   """    setText(ui.callValue,count > 0 ? String(count) : '出发');
    const showUnranked=count>0&&race.unranked;
    ui.callDetail.hidden=!showUnranked;
    setText(ui.callDetail,showUnranked?'娱乐改装 · 本场不计榜':'');""")
js("  setText(ui.sprintHint,bicycle?(race.rider.sprinting?'冲刺中':'冲刺耐力'):(race.rider.skill||vehicleSkills[actor].meter));",
   """  ui.sprintMeter.parentElement.toggleAttribute('data-skill-active',Boolean(race.rider.sprinting||race.rider.skill));
  setText(ui.sprintHint,bicycle?(race.rider.sprinting?'冲刺中':'冲刺耐力'):(race.rider.skill||vehicleSkills[actor].meter));""")

release_version = '1.9.1.1'
brand_svg_full = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 150" role="img" aria-label="FORZERO: BUDGET 有限竞速：地贫线">'
    '<g transform="translate(14,0) skewX(-10)" font-family="Arial Black, Arial, sans-serif">'
    '<text x="10" y="65" font-size="59" font-weight="950" letter-spacing="-2" fill="#FFFFFF">FOR<tspan fill="#FF6433">ZERO</tspan>:</text>'
    '<text x="15" y="96" font-size="26" font-weight="900" letter-spacing="9" fill="#FF6433">BUDGET</text>'
    '<text x="15" y="134" font-size="24" font-weight="900" letter-spacing="3.5" fill="#FFFFFF" font-family="\'Microsoft YaHei\', \'PingFang SC\', \'Noto Sans SC\', sans-serif">有限竞速：<tspan fill="#FF6433">地贫线</tspan></text>'
    '</g></svg>'
)
brand_svg_badge = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 108">'
    '<g transform="translate(14,0) skewX(-10)" font-family="Arial Black, Arial, sans-serif">'
    '<text x="10" y="65" font-size="59" font-weight="950" letter-spacing="-2" fill="#FFFFFF">FOR<tspan fill="#FF6433">ZERO</tspan>:</text>'
    '<text x="15" y="96" font-size="26" font-weight="900" letter-spacing="9" fill="#FF6433">BUDGET</text>'
    '</g></svg>'
)
favicon_svg = (
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 340 340'%3E"
    "%3Crect width='340' height='340' rx='52' fill='%230b0d0f'/%3E"
    "%3Cg transform='translate(0,116)'%3E%3Cg transform='translate(14,0) skewX(-10)' font-family='Arial Black, Arial, sans-serif'%3E"
    "%3Ctext x='10' y='65' font-size='59' font-weight='950' letter-spacing='-2' fill='%23ffffff'%3EFOR%3Ctspan fill='%23ff6433'%3EZERO%3C/tspan%3E:%3C/text%3E"
    "%3Ctext x='15' y='96' font-size='26' font-weight='900' letter-spacing='9' fill='%23ff6433'%3EBUDGET%3C/text%3E"
    "%3C/g%3E%3C/g%3E%3C/svg%3E"
)
html('<meta name="theme-color" content="#111913">',
     f'<meta name="theme-color" content="#0b0d0f">\n<link rel="icon" type="image/svg+xml" href="{favicon_svg}">')
html('<title>荔园计时赛 · 粤海环校道</title>',
     f'<title>FORZERO: BUDGET · 有限竞速：地贫线 {release_version}</title>')
html('骑行深圳大学粤海校区，挑战五条校内外计时赛路线。',
     'FORZERO: BUDGET（有限竞速：地贫线）— 在深圳大学、伦敦与顺峰山公园之间自由骑行与计时竞速。')
html('<div class="identity"><i class="mark" aria-hidden="true"></i><div><strong>荔园环骑</strong><small lang="en">LITCHI TIME TRIAL</small></div></div>',
     f'<div class="identity"><span class="brand-badge" aria-hidden="true">{brand_svg_badge}</span><div><strong>有限竞速：地贫线</strong><small lang="en">FORZERO: BUDGET · {release_version}</small></div></div>')
html('aria-label="荔园自行车计时赛"', 'aria-label="FORZERO: BUDGET 有限竞速：地贫线"')
html('aria-label="深圳大学三维骑行赛道"', 'aria-label="FORZERO: BUDGET 三维骑行赛道"')
html('    <canvas id="weatherOverlay" aria-hidden="true" hidden></canvas>',
     f'    <canvas id="weatherOverlay" aria-hidden="true" hidden></canvas>\n    <div class="boot-loader" id="bootLoader" role="status" aria-live="polite">{brand_svg_full}<span>正在构建三维赛道…</span></div>')
html('''      <div class="intro" id="intro">
        <div class="eyebrow">自由骑行</div>
        <h1>荔园<span>计时赛</span></h1>''',
     f'''      <div class="intro" id="intro">
        <div class="eyebrow">自由骑行</div>
        <h1 class="intro-brand" aria-label="FORZERO: BUDGET 有限竞速：地贫线">{brand_svg_full}</h1>''')

# Player name defaults & empty fallback: 'player'
js("const DEFAULT_RIDER_NAME = '狼';", "const DEFAULT_RIDER_NAME = 'player';")
js("remote.name||'骑手'", "remote.name||DEFAULT_RIDER_NAME")
js("  ready = true;\n  update(performance.now());",
   "  ready = true;\n  document.getElementById('bootLoader')?.setAttribute('hidden','');\n  update(performance.now());")
js("function unavailable(message) {",
   "function unavailable(message) {\n  document.getElementById('bootLoader')?.setAttribute('hidden','');")
html('<div class="rider-tag" id="riderTag" hidden>狼</div>',
     '<div class="rider-tag" id="riderTag" hidden>player</div>')
html('<span id="mapLegend">橙色是狼</span>',
     '<span id="mapLegend">橙色是 player</span>')
html('<input id="driverName" type="text" maxlength="24" value="狼" autocomplete="off" placeholder="狼">',
     '<input id="driverName" type="text" maxlength="24" value="player" autocomplete="off" placeholder="player">')

# Non-infringing parody trademarks in world landmarks & shops (preserving UCL / SZU / Shunfengshan)
for old_mark, new_mark in [
    ('腾讯滨海大厦', 'Southizzahut 滨海大厦'),
    ('Hilton London Euston', 'Hiltown London Euston'),
    ('Hilton · Endsleigh Gdns', 'Hiltown · Endsleigh Gdns'),
    ('Royal National Hotel', 'Royale National Hotel'),
    ('Wellcome Trust · Gibbs Building', 'Welcome Trust · Gibbs Building'),
    ('McDonald’s', 'McRonald’s'),
    ('Boots · 商业街北', 'Root · 商业街北'),
    ("'Boots'", "'Root'"),
    ('Tesco Express', 'Lesgo Express'),
    ('Tesco express', 'Lesgo express'),
    ("'Lidl'", "'Laodl'"),
    ("'Oseyo'", "'Ohayo'"),
    ("'Greggs'", "'Griggs'"),
    ('Waterstones', 'Waterpebbles'),
    ('Heal’s', 'Heel’s'),
    ('Yo Home', 'Yo Dome'),
    ("'Wasabi'", "'Wasabee'"),
    ("'Tortilla'", "'Tostilla'"),
    ('Orchidya Flower School', 'Orchidea Flower School'),
    ("'Orchidya'", "'Orchidea'"),
    ('Treadwell’s Books', 'Treadfast’s Books'),
    ('Russell & Chapple', 'Russell & Chap'),
    ('Decadence Salon', 'Decadence Hair'),
]:
    if old_mark not in game:
        raise ValueError(f'Expected trademark anchor {old_mark!r}')
    game = game.replace(old_mark, new_mark)

(here / 'game.js').write_text(game,encoding='utf-8',newline='\n')
standalone_html = head + '<script>\n' + game + '</script>' + tail
(here.parent.parent / f'forzero-budget-mobile-{release_version}.html').write_text(standalone_html, encoding='utf-8', newline='\n')

style_open = '<style>\n'
style_close = '\n</style>'
style_start = head.index(style_open)
style_end = head.index(style_close, style_start)
css_text = head[style_start + len(style_open):style_end]
split_head = head[:style_start] + '<link rel="stylesheet" href="style.css">' + head[style_end + len(style_close):]

release_dir = here / 'release'
release_dir.mkdir(exist_ok=True)
sound_dir = release_dir / 'sound'
sound_dir.mkdir(exist_ok=True)
online_dir = here.parent / 'online'
(release_dir / 'index.html').write_text(split_head + '<script src="game.js"></script>' + tail, encoding='utf-8', newline='\n')
(release_dir / 'style.css').write_text(css_text + '\n', encoding='utf-8', newline='\n')
(release_dir / 'game.js').write_text(game, encoding='utf-8', newline='\n')
(release_dir / 'server.mjs').write_text((online_dir / 'server.mjs').read_text(encoding='utf-8'), encoding='utf-8', newline='\n')
(release_dir / 'room-rules.cjs').write_text((online_dir / 'room-rules.cjs').read_text(encoding='utf-8'), encoding='utf-8', newline='\n')
(release_dir / 'tuning-190.cjs').write_text((here.parent.parent / 'src/data/tuning-190.cjs').read_text(encoding='utf-8'), encoding='utf-8', newline='\n')
(release_dir / 'README.md').write_text((online_dir / 'README.md').read_text(encoding='utf-8'), encoding='utf-8', newline='\n')
(release_dir / '启动游戏.bat').write_text((online_dir / 'start-game.bat').read_text(encoding='utf-8'), encoding='utf-8', newline='\r\n')
(sound_dir / 'README.txt').write_text((online_dir / 'sound-readme.txt').read_text(encoding='utf-8'), encoding='utf-8', newline='\r\n')
