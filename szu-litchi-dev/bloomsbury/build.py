from pathlib import Path

here = Path(__file__).resolve().parent
base = (here.parent / 'architecture' / 'szu-litchi-loop.html').read_text(encoding='utf-8')
head, body = base.split('<script>\n', 1)
game, tail = body.rsplit('</script>', 1)


def swap(source, old, new):
    if source.count(old) != 1:
        raise ValueError(f'Expected one source anchor for {old[:100]!r}')
    return source.replace(old, new, 1)


def js(old, new):
    global game
    game = swap(game, old, new)


def html(old, new):
    global head
    head = swap(head, old, new)


html('<div class="location">', '<div class="location" id="campusName">')
html('<div class="references"><a href="https://www.szu.edu.cn/xxgk/xydt.htm"',
     '<div class="references"><span id="szuReferences"><a href="https://www.szu.edu.cn/xxgk/xydt.htm"')
html('>图书馆</a></div></div>',
     '>图书馆</a></span><a id="uclReference" href="https://maps.ucl.ac.uk/downloads/" rel="noopener noreferrer" target="_blank" hidden>UCL 官方校园地图</a></div></div>')
html('aria-label="比赛控制"><div class="course-field">',
     'aria-label="骑行控制"><button class="action travel" id="travel" type="button">到深大站</button><div class="course-field">')
html('<span>个人最佳 <strong', '<span class="best-time">个人最佳 <strong')
html('</style>', '''  .travel { color:#d6f0ed; border-color:#76bbb878; white-space:nowrap; }
  .stage[data-campus="ucl"] + .bar :is(.course-field,#startTrial,.best-time) { display:none; }
</style>''')

content = '\n\n'.join((here / name).read_text(encoding='utf-8').rstrip()
                      for name in ['map.js', 'high-street.js', 'buildings.js', 'chart.js', 'travel.js'])
js('const mapCache = new WeakMap();', content + '\n\nconst mapCache = new WeakMap();')
js('const random = randomSource(30986);', 'let random = randomSource(30986);')
js('function buildingAt(x,z,margin=.38,y=0) {',
   'function buildingAt(x,z,margin=.38,y=0) {\n  if(activeCampus===\'ucl\') return uclBuildingAt(x,z,margin,y);')
js('function safeToRide(x,z,exploring=false) {',
   'function safeToRide(x,z,exploring=false) {\n  if(activeCampus===\'ucl\') return canRideUcl(x,z);')
js('function surfaceAt(x,z,exploring=false) {',
   'function surfaceAt(x,z,exploring=false) {\n  if(activeCampus===\'ucl\') return uclSurfaceAt(x,z);')
js('''    const previous=moveCyclist(this.rider,input,PHYSICS_STEP,this.phase==='free'||this.event.cityAccess);''',
   '''    const exploring=activeCampus==='szu'&&(this.phase==='free'||this.event.cityAccess);
    const previous=moveCyclist(this.rider,input,PHYSICS_STEP,exploring);''')
js('  plate(label,[x,2.85,z+2.43],5.75,.95);',
   "  plate(label,[x,2.85,z+2.43],5.75,.95);\n  placeTravelSign(x+4.3,z+2.53,'校园旅行','前往 UCL');")

js('''      if (image && !labelTextures.has(image)) labelTextures.set(image, canvasTexture(image));
      this.texture = image ? labelTextures.get(image) : flatTexture;''',
   '''      this.image = image;
      if (image && !labelTextures.has(image)) labelTextures.set(image,{texture:canvasTexture(image),uses:0});
      const label=image?labelTextures.get(image):null;
      if(label) label.uses++;
      this.texture = label?.texture ?? flatTexture;''')
js('''  const {vao, texture} = new gpu.Mesh({vertices, indices:packedIndices}, material);
  return ranges.map(range => ({...range, vao, texture, material}));''',
   '''  const owner=new gpu.Mesh({vertices,indices:packedIndices},material);
  const {vao,texture}=owner;
  return ranges.map(range=>({...range,vao,texture,material,owner}));''')
js('''    update(shape) {
      gl.bindVertexArray(this.vao);''',
   '''    dispose() {
      gl.deleteVertexArray(this.vao);
      gl.deleteBuffer(this.vbo);
      gl.deleteBuffer(this.index);
      if(!this.image) return;
      const label=labelTextures.get(this.image);
      if(--label.uses===0) {
        gl.deleteTexture(label.texture);
        labelTextures.delete(this.image);
      }
    }

    update(shape) {
      gl.bindVertexArray(this.vao);''')
js('    const area = waterReflectionArea(camera, frustum, lakeBounds);',
   '    const area = world.hasWater ? waterReflectionArea(camera,frustum,lakeBounds) : null;')

js(",['深大站',metroStop[0]-8,metroStop[1]-9]", '')
js("  if (!exploring || focus) drawCourseMap(ctx,project,compact,event);",
   """  if (exploring&&cityView) travelPin(ctx,project,'szu',compact);
  if (!exploring || focus) drawCourseMap(ctx,project,compact,event);""")
js("  const cityView = exploring && (compact ? !inCampus(race.rider.position[0],race.rider.position[2]) : !focused);",
   "  const cityView=activeCampus==='szu'&&exploring&&(compact?!inCampus(race.rider.position[0],race.rider.position[2]):!focused);")
js('    layout=campusChart(width,height,dpr,compact,event,focused,exploring,cityView);',
   '''    const chart=activeCampus==='ucl'?uclChart:campusChart;
    layout=chart(width,height,dpr,compact,event,focused,exploring,cityView);
    layout.campus=activeCampus;''')
js('layout.exploring!==exploring || layout.cityView!==cityView)', '''layout.exploring!==exploring || layout.cityView!==cityView || layout.campus!==activeCampus ||
      (activeCampus==='ucl'&&layout.hospitalRoute!==uclRouteVisible))''')
js('  ctx.rotate(rider.heading + Math.PI / 2);', '''  const [aheadX,aheadY]=project(add(rider.position,headingVector(rider.heading)));
  ctx.rotate(Math.atan2(aheadY-y,aheadX-x)+Math.PI/2);''')
js('for(const gate of exploring && !focused ? [] : event.gates)', "for(const gate of activeCampus==='ucl'||exploring&&!focused ? [] : event.gates)")
js("  'startTrial','freeRide','pause','best','expand','notice'", "  'startTrial','freeRide','pause','best','expand','notice','travel','campusName','mapTitle','szuReferences','uclReference'")
js('let previousPhase = null,', 'let pendingCampus=null, uclRouteVisible=false;\nlet previousPhase = null,')
js("  const trial=race.phase!=='free';", "  updateTravelButton();\n  const trial=race.phase!=='free';")
js('''  const outside = (!trial||event.cityAccess) && !inCampus(x,z) ? cityStreetAt(x,z) : null;
  setText(ui.surfaceType,outside ? outside.name : !race.rider.paved?'草地减速':race.rider.slip>.275?'抓地接近上限':'路面抓地');''',
   '''  const london=activeCampus==='ucl';
  const outside=!london&&(!trial||event.cityAccess)&&!inCampus(x,z)?cityStreetAt(x,z):null;
  const streetName=london?uclWayByPath.get(uclStreetAt(x,z,1.15)):outside?.name;
  setText(ui.surfaceType,streetName ?? (!race.rider.paved?'草地减速':race.rider.slip>.275?'抓地接近上限':'路面抓地'));''')
js("    setText(ui.mapNext,race.phase==='done'?'完赛':outside ? outside.name : '沿校门可接入校外公路');",
   "    setText(ui.mapNext,race.phase==='done'?'完赛':streetName ?? (london?'返程点位于 Gower Street 校门旁':'沿校门可接入校外公路'));")
js('''  const free = race.phase === 'free';
  ui.mapZoom.setAttribute''',
   '''  const free = race.phase === 'free';
  if(activeCampus==='ucl') {
    ui.mapZoom.setAttribute('aria-pressed',String(uclRouteVisible));
    setText(ui.mapZoom,uclRouteVisible?'隐藏路线':'标出 UCLH 路线');
    setText(ui.mapCourse,'UCL 自由骑行');
    ui.stationList.hidden=true;
    return;
  }
  ui.mapZoom.setAttribute''')
js("    zoomMap=!zoomMap;", "    if(activeCampus==='ucl') uclRouteVisible=!uclRouteVisible;\n    else zoomMap=!zoomMap;")
js('function startTrial() {\n  if (!ready) return;', "function startTrial() {\n  if (!ready||pendingCampus||activeCampus!=='szu') return;")
js("  if (!ready || race.phase === 'done') return;", "  if (!ready||pendingCampus||race.phase==='done') return;")
js("  ui.recover.addEventListener('click',recoverTrial);", "  ui.travel.addEventListener('click',requestTravel);\n  ui.recover.addEventListener('click',recoverTrial);")
js("    if(!next||race.phase==='race'||race.phase==='count')", "    if(!next||pendingCampus||activeCampus!=='szu'||race.phase==='race'||race.phase==='count')")
js('    if(settingsOpen||event.target===ui.coursePicker) return;', '    if(settingsOpen||pendingCampus||event.target===ui.coursePicker) return;')
js("  if(settingsOpen) return;\n  clearInput();priorTimestamp=undefined;settingsOpen=true;", "  if(settingsOpen||pendingCampus) return;\n  clearInput();priorTimestamp=undefined;settingsOpen=true;")
js("  ui.startTrial.disabled = ui.freeRide.disabled = ui.pause.disabled = true;", "  ui.startTrial.disabled = ui.freeRide.disabled = ui.pause.disabled = ui.travel.disabled = true;")
js('function run() {\n  campusUrbanWorld();', 'function run() {\n  buildRidingScene(activeCampus);\n  updateCampusLabels();')

start = game.index('  const solid = meshCells(gpu,[masonry,scenery,urban,foliage])', game.index('function run() {'))
end = game.index('  const model = makeRider();', start)
js(game[start:end], '  let {world,cars}=uploadRidingScene(gpu,activeCampus);\n')
js('''  const cars=new Map();
  for (const actor of cityVehicles) {
    if (!cars.has(actor.model)) cars.set(actor.model,new gpu.Mesh(actor.model));
  }
''', '')
js('''  function update(now) {
    const frameStart''',
   '''  function completeTravel() {
    const previous=activeCampus;
    const previousLists=sceneLists.map(items=>items.slice()), previousGround=groundSurfaces;
    activeCampus=pendingCampus.destination;
    pendingCampus=null;
    try {
      buildRidingScene(activeCampus);
    } catch(error) {
      console.error(error);
      activeCampus=previous;
      for(const [i,items] of sceneLists.entries()) {
        items.length=0;
        for(const item of previousLists[i]) items.push(item);
      }
      groundSurfaces=previousGround;
      clearWorldShapes();
      setText(ui.notice,'目的地暂时无法加载，请重试。');
      return;
    }
    disposeRidingScene(world,cars,routeMeshes);
    ({world,cars}=uploadRidingScene(gpu,activeCampus));
    updateCampusLabels();
    previousPhase=null;
    zoomMap=false;
    arriveAtStation();
    lastMap=undefined;
    ui.notice.hidden=true;
  }

  function update(now) {
    if(pendingCampus&&now>=pendingCampus.at) completeTravel();
    const frameStart''')
js('    if (!settingsOpen) {\n      if (wallTime > 1', '    if (!settingsOpen&&!pendingCampus) {\n      if (wallTime > 1')

(here / 'game.js').write_text(game, encoding='utf-8', newline='\n')
(here / 'szu-litchi-loop.html').write_text(head + '<script>\n' + game + '</script>' + tail,
                                         encoding='utf-8', newline='\n')
