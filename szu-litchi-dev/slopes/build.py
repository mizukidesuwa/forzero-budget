from pathlib import Path

here = Path(__file__).resolve().parent
base = (here.parent / 'bloomsbury' / 'szu-litchi-loop.html').read_text(encoding='utf-8')
head, body = base.split('<script>\n', 1)
game, tail = body.rsplit('</script>', 1)


def replace_once(source, before, after):
    if source.count(before) != 1:
        raise ValueError(f'Expected one anchor for {before[:100]!r}')
    return source.replace(before, after, 1)


def js(before, after):
    global game
    game = replace_once(game, before, after)


def html(before, after):
    global head
    head = replace_once(head, before, after)


def code(name):
    return (here / name).read_text(encoding='utf-8').rstrip()


js("let activeCampus='szu';\n", '')
js('const WATER_Y = 0.017;', "const WATER_Y = 0.017;\nlet activeCampus='szu';")
js('const innerSections = [',
   'const hillReturn=street([[-64,44],[-43,53],[-25,54],[-13,59],[1,72]],2.81);\nconst innerSections = [')
js('  street([[-64,44],[-43,53],[-25,54],[-13,59],[1,72]],2.81),', '  hillReturn,')
js('roads.push(...innerSections);', 'roads.push(...innerSections);\n\n' + code('terrain.js'))
js('[31,127,13,14,3],[32,145,12,12,3],', '')
js('  indexGroundSurfaces();\n  for(const event of courses)', '  indexGroundSurfaces();\n  sculptCampusHill();\n  for(const event of courses)')
js("  enduranceCourse()\n];", "  enduranceCourse(), ...hillCourses()\n];")
js('const courses=[', code('courses.js') + '\n\nconst courses=[')

js('''    mesh.quad(offsetVertex(a, lo, y), offsetVertex(b, lo, y),
      offsetVertex(b, hi, y), offsetVertex(a, hi, y), color);
    a = b;''', '''    const {x,z,rx,rz}=dujuanHill;
    const slope=activeCampus==='szu'&&(mesh===road||mesh===pavement)&&
      Math.abs(a.p[0]-x)<rx+6&&Math.abs(a.p[2]-z)<rz+6;
    const strips=slope?Math.max(1,Math.ceil((hi-lo)/1.25)):1;
    for(let edge=0;edge<strips;edge++) {
      const left=mix(lo,hi,edge/strips),right=mix(lo,hi,(edge+1)/strips);
      mesh.quad(offsetVertex(a,left,y),offsetVertex(b,left,y),offsetVertex(b,right,y),offsetVertex(a,right,y),color);
    }
    a = b;''')
js('''  const contains = part => y < (part.height ?? 3.9 + part.floors*1.93)''',
   '''  const floor=hillHeight(x,z);
  const contains = part => y < floor+(part.height ?? 3.9 + part.floors*1.93)''')
js('position:event.spawn.slice(),heading:event.heading', 'position:courseGround(event,event.spawn),heading:event.heading')
js('      ride.position = frame.p;', '      ride.position = courseGround(this.event,frame.p);')
pos = game.index('function moveCyclist(')
end = game.index('  const forward=rider.speed<-.04', pos)
old = game[pos:end]
new = old.replace('  const limit=paved?', '''  const grade=riderGrade(p,rider.heading);
  const hillAcceleration=grade*9.81;
  const flatLimit=paved?''')
new = new.replace('  const drag=(.48+', '''  const topSpeedEffect=1-clamp(grade*1.25,0,.22)+(paved&&cycling?clamp(-grade*.92,0,.12):0);
  const limit=flatLimit*topSpeedEffect;
  const drag=(.48+''')
new = new.replace('(rider.brake*9.3+drag)*dt', 'Math.max(0,rider.brake*9.3+drag+hillAcceleration)*dt')
new = new.replace('''    else if (force>drag) rider.speed=Math.min(limit,rider.speed+dt*(force-drag));''',
                  '''    else if(rider.speed>=0&&grade!==0) rider.speed=clamp(rider.speed+dt*(force-drag-hillAcceleration),0,limit);
    else if (force>drag) rider.speed=Math.min(limit,rider.speed+dt*(force-drag));''')
assert old != new
js(old, new)
js('''  const height=deck!==null&&(onUpperRoad||deck<=.40) ? deck+.004 : rider.paved?ROAD_Y+.002:-.006;
  rider.position=[x,mix(p[1],height,1-Math.exp(-13*dt)),z];
  rider.travel+=forward*Math.hypot(x-p[0],z-p[2]);''',
   '''  const nextOnDeck=deck!==null&&(onUpperRoad||deck<=.40);
  const height=rider.paved?ROAD_Y+.002:-.006;
  const heightBefore=rideElevation(p[0],p[2])+(onUpperRoad?onDeck-CITY_ASPHALT:0);
  const heightAfter=rideElevation(x,z)+(nextOnDeck?deck-CITY_ASPHALT:0);
  rider.position=[x,heightAfter+mix(p[1]-heightBefore,height,1-Math.exp(-13*dt)),z];
  rider.travel+=forward*Math.hypot(x-p[0],heightAfter-heightBefore,z-p[2]);''')
js('q(r.position[1],1000)', 'q(r.position[1]-rideElevation(r.position[0],r.position[2]),1000)')
js('position:[mix(a[1],b[1],q),mix(a[2],b[2],q),mix(a[3],b[3],q)]',
   'position:onCampusGround([mix(a[1],b[1],q),mix(a[2],b[2],q),mix(a[3],b[3],q)])')
js('position:add(p,scale(f.side,.92)),heading:', 'position:courseGround(event,add(p,scale(f.side,.92))),heading:')
js('''    const pace=Math.min(top,plannedSpeed(event,distance+1.2)*.96+.22);
    speed+=clamp(pace-speed,-6.85*dt,acceleration*dt);''',
   '''    const sample=event.elevation||event.flyover?courseFrame(path,distance+1.2):null;
    const grade=sample?riderGrade(courseGround(event,sample.p),Math.atan2(sample.f[2],sample.f[0])):0;
    const pace=Math.min(top*(1-clamp(grade*1.45,0,.23)),plannedSpeed(event,distance+1.2)*.96+.22);
    speed+=clamp(pace-speed,-6.85*dt,(acceleration-9.81*grade)*dt);''')

js('  const marks = [...meshCells(gpu, [arches])', '''  const braking=brakingPaint(event,from,to);
  if(event.flyover) for(const shape of [paint,braking]) raiseDeckPaint(shape);
  for(const shape of [paint,arches,braking,...decals.map(decal=>decal.shape)]) raiseHillMesh(shape);
  const marks = [...meshCells(gpu, [arches])''')
js('meshCells(gpu, [brakingPaint(event,from,to)])', 'meshCells(gpu, [braking])')
js('''  ctx.lineJoin = ctx.lineCap = 'round';
  for (const street of roads)''', '''  drawHillContours(ctx,project,compact);
  ctx.lineJoin = ctx.lineCap = 'round';
  for (const street of roads)''')
js("      ['田径运动场',athleticsField.x,athleticsField.z],",
   "      ['田径运动场',athleticsField.x,athleticsField.z],['杜鹃山',dujuanHill.x,dujuanHill.z-7],")
js("  'sectorFeedback','sectorLabel','sectorGap','exitFeedback','raceReview','reviewReference',",
   "  'sectorFeedback','sectorLabel','sectorGap','exitFeedback','raceReview','reviewReference',\n  'slopeGrade','elevationPanel','elevationStats','elevationChart',")
js("  setText(ui.courseFacts,event.name+' · '+distance);",
   "  setText(ui.courseFacts,event.name+' · '+distance);\n  updateElevationMap();")
js('''  const free = race.phase === 'free';
  if(activeCampus==='ucl')''', '''  const free = race.phase === 'free';
  updateElevationMap();
  if(activeCampus==='ucl')''')
js('''  const [x,,z] = race.rider.position;
  const london=activeCampus==='ucl';''', '''  const [x,,z] = race.rider.position;
  const grade=Math.round(riderGrade(race.rider.position,race.rider.heading)*100);
  ui.slopeGrade.hidden=Math.abs(grade)<2;
  if(!ui.slopeGrade.hidden) setText(ui.slopeGrade,(grade>0?'上坡 +':'下坡 −')+Math.abs(grade)+'%');
  const london=activeCampus==='ucl';''')
js("      if(dot(f,look)>.72) target=lerpPoint(target,[ahead[0],2.49,ahead[2]],.145);",
   "      if(dot(f,look)>.72) target=lerpPoint(target,[ahead[0],p[1]+2.49,ahead[2]],.145);")
js('  if (prior && !motion.matches) {', '''  target[1]+=rideElevation(target[0],target[2])-rideElevation(p[0],p[2]);
  if (prior && !motion.matches) {''')
js('''  eye = avoidWall(origin,eye);
  const fov''', '''  eye[1]=Math.max(eye[1],rideElevation(eye[0],eye[2])+1.45);
  eye = avoidWall(origin,eye);
  const fov''')
js('const root=placement(add(p,[0,.004,0]),rider.lean,-rider.heading);',
   '''const pitch=Math.atan(riderGrade(p,rider.heading));
    const root=placement(add(p,[0,.004,0]),rider.lean,-rider.heading,pitch);''')
js('''    const kind=race.rider.vehicle;
    if(kind!=='bike') {''', '''    const kind=race.rider.vehicle;
    const pitch=Math.atan(riderGrade(ghost.position,ghost.heading));
    if(kind!=='bike') {''')
js('placement(add(ghost.position,[0,.006,0]),lean,-ghost.heading),ghost)',
   'placement(add(ghost.position,[0,.006,0]),lean,-ghost.heading,pitch),ghost)')
js('const root=placement(add(ghost.position,[0,.006,0]),lean,-ghost.heading);',
   'const root=placement(add(ghost.position,[0,.006,0]),lean,-ghost.heading,pitch);')
js('projectTag(ui.gateTag,previousCamera,[point[0],3.21,point[2]],width,height);',
   'projectTag(ui.gateTag,previousCamera,courseGround(race.event,[point[0],3.21,point[2]]),width,height);')
js('projectTag(ui.gateTag,previousCamera,[gate.p[0],6.04,gate.p[2]],width,height);',
   'projectTag(ui.gateTag,previousCamera,courseGround(race.event,[gate.p[0],6.04,gate.p[2]],gate.rise),width,height);')

js('function enduranceCourse() {', code('flyover-race.js') + '\n\nfunction enduranceCourse() {')
js('const [nanhai,shennan,baishi,cityEast]', 'const [nanhai,,baishi,cityEast]')
js('const shennanWest=lane(shennan,-6.15), nanhaiSouth=lane(nanhai,5.7);',
   'const nanhaiSouth=lane(nanhai,5.7);\n  const bridge=enduranceFlyoverParts(nanhaiSouth);')
js("""    {name:'深南大道长直',color:'#f4d079',parts:[
      section(ligong),
      turn([[151,-235],[150.2,-239],[145,-241.9],[135,-242.7]]),
      check(section(shennanWest,[135,-242.7],[-118,-247]),[7,-251],'深南大道'),
      turn([[-118,-247],[-126.5,-246],[-134.5,-242],[-138.2,-235],[-138.5,-221]]),
      check(section(nanhaiSouth,[-138.5,-221],[-128.6,5]),[-132,-56],'南海大道'),""",
   """    {name:'深南立交',color:'#f4d079',parts:[
      section(ligong),
      turn([[151,-235],[150.2,-239],[145,-241.9],[135,-242.7]]),
      ...bridge.parts,
      check(section(nanhaiSouth,bridge.joinSouth,[-128.6,5]),[-132,-56],'南海大道'),""")
js('const {xy:[x,z],name}=part.check;', 'const {xy:[x,z],name,half}=part.check;')
js('spec.push([nearest.distance,name]);', 'spec.push([nearest.distance,name,half]);')
js("""    '汇文发车，经深南大道、双湖和白石路进入南区，再从立心门回校冲线。',
    path,spec,path.length,{absolute:true,cityAccess:true,thresholds:[.966,1.10,1.30]});""",
   """    '汇文发车，上深南立交，落桥后从西侧折返接南海大道，经双湖和白石路进入南区，再从立心门回校冲线。',
    path,spec,path.length,{absolute:true,cityAccess:true,flyover:true,revision:6,thresholds:[.966,1.10,1.30]});""")
js('''  const labels=spec.map(([at,name],i)=> {
    const distance=options.absolute?at:at*finish;
    const frame=courseFrame(path,distance);
    const span=timingSpan(frame,options.cityAccess,path.width,2.75);
    return {...frame,...span,distance,name,index:i,number:''',
   '''  const labels=spec.map(([at,name,half],i)=> {
    const distance=options.absolute?at:at*finish;
    const frame=courseFrame(path,distance);
    const rise=options.flyover?deckRiseAt(frame.p):0;
    const span=rise>.4?{half:flyover.half-.12}:half?{half}:timingSpan(frame,options.cityAccess,path.width,2.75);
    return {...frame,...span,rise,distance,name,index:i,number:''')
js('''    markers:Array.from({length:Math.floor(finish/6.2)+1},(_,i)=>({distance:i*6.2,p:along(path,i*6.2)})),''',
   '''    markers:Array.from({length:Math.floor(finish/6.2)+1},(_,i)=>{
      const distance=i*6.2,p=along(path,distance);
      return {distance,p,rise:options.flyover?deckRiseAt(p):0};
    }),
    flyover:options.flyover??false,revision:options.revision??5,''')
js("?'szu-yuehai-courses-4:ring':'szu-yuehai-long-courses-5:'+event.id;",
   "?'szu-yuehai-courses-4:ring':'szu-yuehai-long-courses-'+(event.revision??5)+':'+event.id;")
js('''  const p=(o,y)=>offsetVertex(gate,(left+right)/2+o*scaleWidth,y+(y>=3.45?1.38:0));''',
   '''  const p=(o,y)=>offsetVertex(gate,(left+right)/2+o*scaleWidth,y+(gate.rise??0)+(y>=3.45?1.38:0));''')
js('''    const fraction=clamp(t,0,1);
    const distance=mix(a.distance,b.distance,fraction);''',
   '''    const fraction=clamp(t,0,1);
    const rise=mix(a.rise??0,b.rise??0,fraction);
    if(event.flyover&&Math.abs(position[1]-rideElevation(x,z)-ROAD_Y-rise)>1.12) continue;
    const distance=mix(a.distance,b.distance,fraction);''')
js('''  const at=-a/(b-a),hit=lerpPoint(previous,next,at);
  const offset''',
   '''  const at=-a/(b-a),hit=lerpPoint(previous,next,at);
  if(gate.rise>.4&&Math.abs(hit[1]-gate.p[1]-gate.rise)>.85) return null;
  const offset''')
js('''    const gap = marker => Math.hypot(marker.p[0] - p[0], marker.p[2] - p[2]);''',
   '''    const gap = marker => {
      if(marker.rise>.4&&Math.abs(p[1]-marker.p[1]-marker.rise)>1.12) return Infinity;
      return Math.hypot(marker.p[0] - p[0], marker.p[2] - p[2]);
    };''')

html('<small>km/h</small><div class="sprint-meter"', '<small>km/h</small><span id="slopeGrade" class="slope-grade" hidden></span><div class="sprint-meter"')
html('<ol id="stationList"></ol>', '''<figure class="elevation-panel" id="elevationPanel" hidden>
          <figcaption id="elevationStats"></figcaption>
          <canvas id="elevationChart" width="300" height="66" role="img" aria-label="赛道坡度剖面"></canvas>
        </figure>
        <ol id="stationList"></ol>''')
html('</style>', '''  .slope-grade { display:block; font-size:.77rem; font-weight:700; color:#edebb0; white-space:nowrap; }
  .elevation-panel { margin:3px 0 8px; min-width:0; }
  .elevation-panel figcaption { font-size:.79rem; color:#dbe5bf; margin:0 0 4px; }
  .elevation-panel canvas { display:block; width:100%; height:auto; max-height:66px; border-radius:6px; }
</style>''')

(here / 'game.js').write_text(game, encoding='utf-8', newline='\n')
(here / 'szu-litchi-loop.html').write_text(head+'<script>\n'+game+'</script>'+tail,
                                         encoding='utf-8', newline='\n')
