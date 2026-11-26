from pathlib import Path


here = Path(__file__).resolve().parent
source = (here.parent / 'slopes' / 'szu-litchi-loop.html').read_text(encoding='utf-8')
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


def js_span(start, end, replacement):
    low = game.index(start)
    high = game.index(end, low)
    js(game[low:high], replacement.rstrip()+'\n\n')


def code(name):
    return (here / name).read_text(encoding='utf-8').rstrip()


js_span('// Local street-grid coordinates,', '// Fictional businesses',
        '\n\n'.join(code(name) for name in ['layout.js','transport.js','front-lodges.js','infill.js','street-ground.js','scene.js','race-geometry.js']))
js_span('// Fictional businesses', 'function shopSign(', code('shops.js')+'''

const shopStyles={
  boots:{frame:'#264779',trim:'#f0eee8',glass:'#61727b',display:['#b7a5b4','#babcae']},
  tesco:{frame:'#ece9df',trim:'#a93239',glass:'#596a66',display:['#8ba7a6','#9d9d6f']},
  lidl:{frame:'#344d8d',trim:'#efcf63',glass:'#576a6c',display:['#ba8362','#a3ab73']},
  books:{frame:'#2b393a',trim:'#e1d9bf',glass:'#59696c',display:['#ba9a73','#8e8972']},
  heals:{frame:'#333b3b',trim:'#e1d6bd',glass:'#688182',display:['#9c8875','#b6a284']},
  espresso:{frame:'#365050',trim:'#e4ddd0',glass:'#697170',display:['#a68f72','#c2ad8b']},
  hanger:{frame:'#4b466e',trim:'#f1ead9',glass:'#5d6a75',display:['#917aa0','#b2a098']},
  burger:{frame:'#32352f',trim:'#efd286',glass:'#5b665e',display:['#a37c52','#c0a06c']},
  pharmacy:{frame:'#e0e5d8',trim:'#276847',glass:'#637976',display:['#adbfbb','#9baf91']},
  oseyo:{frame:'#323844',trim:'#ebe7de',glass:'#5d6878',display:['#bda093','#c2ac74']},
  greggs:{frame:'#2a5e8d',trim:'#f2e2b8',glass:'#64717b',display:['#af8e66','#c2a57c']},
  yohome:{frame:'#a24b38',trim:'#f1e6d5',glass:'#515f64',display:['#b89673','#9d9c7e']},
  wasabi:{frame:'#516731',trim:'#f5f3df',glass:'#627168',display:['#abb872','#d0bdaa']},
  tortilla:{frame:'#614133',trim:'#f2dbac',glass:'#606468',display:['#b87f56','#b69867']},
  art:{frame:'#566d63',trim:'#eee3c7',glass:'#607471',display:['#c1a88b','#a67a6c']},
  treadwell:{frame:'#4d4264',trim:'#ecdfc5',glass:'#686778',display:['#91807d','#a79675']},
  salon:{frame:'#302e34',trim:'#e7ddcb',glass:'#63717b',display:['#b3a5a5','#93888e']},
  flowerschool:{frame:'#746273',trim:'#f3e6da',glass:'#67767a',display:['#aca49a','#bba3a6']},
  flowers:{frame:'#464958',trim:'#f1e3db',glass:'#657b77',display:['#b6a5b3','#929f8c']},
  unionCafe:{frame:'#45475d',trim:'#eee8dd',glass:'#60717d',display:['#c0a27a','#8c9b87']}
};
const uclBuildings=[...uclLots,...frontLodges,...londonShops,warrenTube,russellTube,stPancras,...londonFrontages,
  ...terracesBesideRetail(londonTerraces,londonShops)];
fillLondonStreetWalls(uclBuildings);
const londonPlaces=[
  ...tubeStops.map(place=>({...place,kind:'tube'})),
  ...busStops.map(({name,letter,x,z})=>({name,use:'公交 · Stop '+letter,x,z,kind:'bus'})),
  ...londonShops.map(lot=>{
    const [x,,z]=facadeOf(lot,0).point(0,0,.75);
    return {name:lot.name,use:lot.use,x,z,kind:'shop'};
  }),
  ...unionShops.map(({name,use,offset})=>{
    const [x,,z]=facadeOf(unionBuilding,1).point(offset,0,.75);
    return {name,use,x,z,kind:'shop'};
  }),
  ...campusRetail.map(({building,side,name,use,offset})=>{
    const lot=uclLots.find(item=>item.name===building);
    const [x,,z]=facadeOf(lot,side).point(offset,0,1.76);
    return {name,use,x,z,kind:'shop'};
  })
];''')
js("ctx.font=name==='lesgo'?'700 58px Georgia,serif':'600 47px Georgia,serif';",
   "ctx.font='700 45px Arial,sans-serif';")
js("ctx.font=name==='lesgo'?'700 38px Georgia,serif':'600 29px Georgia,serif';",
   "ctx.font='700 28px Arial,sans-serif';")
js('const p=(sign,dy)=>face.point(sign*width/2,3.54+dy,.368);',
   'const p=(sign,dy)=>face.point(sign*width/2,3.54+dy,.54);')
js_span('function shopFront(', 'const streetSigns=[','')
js_span('const streetSigns=[','function londonStreetSigns()', '''const streetSigns=[
  [-7,-11,Math.PI/2,'GOWER STREET','WC1'],[11,-76,0,'GOWER PLACE','WC1'],
  [-184,-46,0,'GRAFTON WAY','W1'],[-176,71,Math.PI/2,'TOTTENHAM COURT ROAD','W1'],
  [-183,-93,0,'WARREN STREET','W1'],[132,44,Math.PI/2,'GORDON STREET','WC1'],
  [127,159,0,'GORDON SQUARE','WC1'],[363,371,0,'BERNARD STREET','WC1'],
  [45,202,0,'TORRINGTON PLACE','WC1'],[78,399,Math.PI/2,'MALET STREET','WC1'],
  [78,427,0,'KEPPEL STREET','WC1'],[267,293,Math.PI/2,'BEDFORD WAY','WC1'],
  [223,513,0,'RUSSELL SQUARE','WC1'],[187,268,Math.PI/2,'THORNHAUGH STREET','WC1']
];''')
js_span('function studentCentre(', 'function renderLondonBuilding(',
        code('student.js')+'\n\n'+code('architecture.js'))
js("  else if(lot.style==='shop') shopFront(lot,shopLabels);", '''  else if(lot.style==='front-lodge') frontLodgeBuilding(lot);
  else if(lot.style==='senate') senateHouseBuilding(lot);
  else if(lot.style==='ioe') ioeBuilding(lot);
  else if(lot.style==='terrace') londonTerraceRange(lot);
  else if(lot===stPancras) stPancrasChurch();
  else if(lot.style==='frontage'||!lot.name) londonBlockFront(lot);
  else if(lot.style==='church') byngChurch(lot);
  else if(lot.style==='quad-range') quadStoneRange(lot);
  else if(lot.style==='gallery') bruneiGallery(lot);
  else if(lot.style==='hotel') { for(const part of lot.parts) londonFront(part,'modern'); }
  else if(lot.style==='friends'||lot.style==='bma') londonCourtBuilding(lot);
  else if(lot.style==='soas') soasLibrary(lot);
  else if(lot.style==='gibbs') gibbsStation(lot);
  else if(lot.style==='warren-tube') warrenStation(lot);
  else if(lot.style==='russell-tube') russellStation(lot);
  else if(lot.style==='union') unionFront(lot,shopLabels);
  else if(lot.style==='shop') detailedShopFront(lot,shopLabels);
  else if(campusRetail.some(unit=>unit.building===lot.name))
    retailOnCampus(lot,campusRetail.find(unit=>unit.building===lot.name),shopLabels);''')
js('  const drum=[lot.x,lot.height+.3,lot.z];', '''  const banner=signCanvas(124,248,(ctx,w,h)=>{
    ctx.fillStyle='#503486';ctx.fillRect(0,0,w,h);
    ctx.textAlign='center';ctx.fillStyle='#fcf1dc';ctx.font='800 49px sans-serif';
    ctx.fillText('UCL',w/2,h*.45);
    ctx.font='700 30px sans-serif';ctx.fillText('200',w/2,h*.67);
  });
  for(const side of [-1,1]) {
    plate(banner,point(side*7.03,6.69,7.47),1.25,2.57,f.yaw);
    masonry.tube(point(side*7.73,8.00,7.47),point(side*6.33,8.00,7.47),.038,.038,shadow,7);
  }
  const drum=[lot.x-4,lot.height+3.65,lot.z];
  masonry.tube([drum[0],lot.height-.05,drum[2]],drum,7.3,6.1,'#d3c7b5',24);''')
js("function wilkinsBuilding(lot) {\n  londonFront(lot,'stone');", "function wilkinsBuilding(lot) {\n  quadStoneRange(lot);")
js('y+4.1*Math.sin(t)','y+5.6*Math.sin(t)')
js('[lot.x,y+4.02,lot.z],[lot.x,y+5.14,lot.z]', '[drum[0],y+5.56,drum[2]],[drum[0],y+6.70,drum[2]]')
js('[lot.x,y+5.2,lot.z]', '[drum[0],y+6.77,drum[2]]')
js_span('function uclChart(', 'function canTravel()',code('chart.js'))
js('const mapCache = new WeakMap();',code('races.js')+'\n\nconst mapCache = new WeakMap();')
js('function timingSpan(frame,cityAccess,fallback,minimum=0) {', '''function timingSpan(frame,cityAccess,fallback,minimum=0,campus='szu') {
  if(campus==='ucl') return londonGateSpan(frame,fallback);''')
js('timingSpan(frame,options.cityAccess,path.width,2.75);',
   'timingSpan(frame,options.cityAccess,path.width,2.75,options.campus);')
js('flyover:options.flyover??false,revision:options.revision??5,',
   "campus:options.campus??'szu',flyover:options.flyover??false,revision:options.revision??5,")
js('...timingSpan(frame,event.cityAccess,event.path.width)', '...timingSpan(frame,event.cityAccess,event.path.width,0,event.campus)')
js('    this.publicProgress=this.event.cityAccess?projectPublicCourse(this.event,p,direction,covered,gate):null;', '''    this.publicProgress=this.event.cityAccess?projectPublicCourse(this.event,p,direction,covered,gate):
      this.event.campus==='ucl'?projectLondonCourse(this.event,p,direction,covered,gate):null;''')
js('Math.min(last, from + 40)', "Math.min(last,from+(event.campus==='ucl'?48:40))")
js("  const key=event.id==='ring'?", "  const key=event.campus==='ucl'?'london-bloomsbury-2:'+event.id:event.id==='ring'?")
js('const sceneLists=[cityJunctions,cityVehicles,citySolid,campusFixtures,treeSites,lawnSpans];',
   'const sceneLists=[cityJunctions,cityVehicles,citySolid,campusFixtures,treeSites,lawnSpans,uclFixtures];')
js("  canvas.setAttribute('aria-label',london?'UCL Bloomsbury 三维骑行地图':'深圳大学三维骑行赛道');",
   """  canvas.setAttribute('aria-label',london?'伦敦 Bloomsbury 三维骑行地图':'深圳大学三维骑行赛道');""")
js("    ctx.strokeStyle = compact ? '#d6e697' : '#edeeac';",
   "    ctx.strokeStyle = event.campus==='ucl'?'#dcc8f3':compact?'#d6e697':'#edeeac';")
js("  for(const gate of activeCampus==='ucl'||exploring&&!focused ? [] : event.gates) {",
   '  for(const gate of exploring&&!focused ? [] : event.gates) {')
js("function initHud() {\n  for(const event of courses) {", '''function initHud() {
  ui.coursePicker.replaceChildren();
  const group=activeCampus==='ucl'?document.createElement('optgroup'):ui.coursePicker;
  if(group!==ui.coursePicker) {
    group.label='伦敦特别赛事';
    ui.coursePicker.appendChild(group);
  }
  for(const event of coursesByCampus[activeCampus]) {''')
js('    ui.coursePicker.appendChild(option);','    group.appendChild(option);')
js("'coursePicker','courseBrief','mapZoom','mapPlace','mapCourse','recover','brakeHint',",
   "'coursePicker','courseBrief','mapZoom','mapPlace','mapCourse','recover','brakeHint','hospitalRoute',")
js("  setText(ui.timedTitle,leg?'耐力赛 · 余 '+remainingLabel:'计时赛');",
   """  const timedName=london?(leg?'伦敦耐力赛':'伦敦特别赛'):(leg?'耐力赛':'计时赛');
  setText(ui.timedTitle,leg?timedName+' · 余 '+remainingLabel:timedName);""")
js("""  if(activeCampus==='ucl') {
    ui.mapZoom.setAttribute('aria-pressed',String(uclRouteVisible));
    setText(ui.mapZoom,uclRouteVisible?'隐藏路线':'标出 UCLH 路线');
    setText(ui.mapCourse,'UCL 自由骑行');
    ui.stationList.hidden=true;
    return;
  }""", """  const london=activeCampus==='ucl';
  ui.hospitalRoute.hidden=!london||!free||zoomMap;
  ui.hospitalRoute.setAttribute('aria-pressed',String(uclRouteVisible));
  setText(ui.hospitalRoute,uclRouteVisible?'隐藏 UCLH 路线':'标出 UCLH 路线');""")
js("setText(ui.mapZoom, zoomMap ? (free ? '看校外' : '看全校') : '看赛道');",
   "setText(ui.mapZoom,zoomMap?(london?'看街区':free?'看校外':'看全校'):'看赛道');")
js("setText(ui.mapCourse,zoomMap ? race.event.name : '校内外道路');",
   "setText(ui.mapCourse,zoomMap?race.event.name:london?'Bloomsbury 自由骑行':'校内外道路');")
js("  if (!ready||pendingCampus||activeCampus!=='szu') return;",
   "  if (!ready||pendingCampus||race.event.campus!==activeCampus) return;")
js("""    const next=selectedCourses.get(ui.coursePicker.value);
    if(!next||pendingCampus||activeCampus!=='szu'||race.phase==='race'||race.phase==='count') {ui.coursePicker.value=race.event.id;return;}
    clearInput();race.select(next);cameraRevision++;ui.mapPlace.hidden=true;rebuildCourseHud();updateHud();focusStage();""",
   """    const next=coursesByCampus[activeCampus].find(event=>event.id===ui.coursePicker.value);
    if(!next||pendingCampus||race.phase==='race'||race.phase==='count') {ui.coursePicker.value=race.event.id;return;}
    courseByCampus[activeCampus]=next;
    clearInput();race.select(next);cameraRevision++;ui.mapPlace.hidden=true;rebuildCourseHud();updateHud();focusStage();""")
js("""    if(activeCampus==='ucl') uclRouteVisible=!uclRouteVisible;
    else zoomMap=!zoomMap;""", "    zoomMap=!zoomMap;")
js("  ui.bigMap.addEventListener('pointermove'", """  ui.hospitalRoute.addEventListener('click',()=>{
    uclRouteVisible=!uclRouteVisible;
    updateMapZoom();
    renderCampusMap(ui.bigMap,race,false,zoomMap);
  });
  ui.bigMap.addEventListener('pointermove'""")
js('''  const [x,z]=layout.unproject(event.clientX-box.left,event.clientY-box.top);
  const block=buildingAt(x,z,0);''', '''  const [x,z]=layout.unproject(event.clientX-box.left,event.clientY-box.top);
  if(activeCampus==='ucl') {
    let place=null,best=49;
    for(const entry of londonPlaces) {
      const gap=(entry.x-x)**2+(entry.z-z)**2;
      if(gap<best) {best=gap;place=entry;}
    }
    if(place) {
      ui.mapPlace.hidden=false;
      setText(ui.mapPlace,place.name+' · '+place.use);
      return;
    }
  }
  const block=buildingAt(x,z,0);''')
js("""    updateCampusLabels();
    previousPhase=null;
    zoomMap=false;
    arriveAtStation();""", """    updateCampusLabels();
    race.select(courseByCampus[activeCampus]);
    zoomMap=false;
    initHud();
    arriveAtStation();""")

html('  .stage[data-campus="ucl"] + .bar :is(.course-field,#startTrial,.best-time) { display:none; }',
     '  .stage[data-campus="ucl"] + .bar .course-field label { color:#e8d9fb; }')
html('>看赛道</button><output class="map-place"', '''>看赛道</button><button class="float-button" id="hospitalRoute"
          type="button" aria-pressed="false" hidden>标出 UCLH 路线</button><output class="map-place"''')
html('''<a id="uclReference" href="https://maps.ucl.ac.uk/downloads/" rel="noopener noreferrer" target="_blank" hidden>UCL 官方校园地图</a>''',
     '''<span id="uclReference" hidden><a href="https://maps.ucl.ac.uk/downloads/" rel="noopener noreferrer" target="_blank">UCL 校园地图</a><span> · </span><a href="https://www.nicholashare.co.uk/projects/view/new-student-centre-ucl" rel="noopener noreferrer" target="_blank">学生中心实景</a><span> · </span><a href="https://www.london.ac.uk/about/history/history-senate-house/senate-house-architecture-design" rel="noopener noreferrer" target="_blank">Senate House</a><span> · </span><a href="https://www.ucl.ac.uk/ioe/about-ioe/contact-ioe/visitor-accessibility" rel="noopener noreferrer" target="_blank">IOE</a><span> · </span><a href="https://tfl.gov.uk/maps/track/tube" rel="noopener noreferrer" target="_blank">TfL</a></span>''')

(here / 'game.js').write_text(game,encoding='utf-8',newline='\n')
(here / 'szu-litchi-loop.html').write_text(head+'<script>\n'+game+'</script>'+tail,encoding='utf-8',newline='\n')
