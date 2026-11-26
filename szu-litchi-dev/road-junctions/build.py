from pathlib import Path

here = Path(__file__).parent
baseline = (here.parent / 'endurance' / 'szu-litchi-loop.html').read_text(encoding='utf-8')
markup, body = baseline.split('<script>\n', 1)
script, tail = body.rsplit('</script>', 1)


def js(before, after):
    global script
    if script.count(before) != 1:
        raise ValueError(f'Expected one source anchor for {before[:130]!r}')
    script = script.replace(before, after, 1)


def source(name):
    return (here / name).read_text(encoding='utf-8').rstrip() + '\n\n'


def section(start, end, replacement):
    global script
    i = script.index(start)
    j = script.index(end, i)
    script = script[:i] + replacement + script[j:]


section('function cityStreetAt(', 'const metroStop', source('public-roads.js') + '''
function cityBlocked(x,z) {
  return citySolid.some(b=>Math.abs(x-b.x)<b.w/2+.34&&Math.abs(z-b.z)<b.d/2+.34);
}

''')
section('function walkBridge()', 'function officeTower(', source('bridges.js'))
js("[path, {name:name || '东侧联络路', width:path.width, shoulder:",
   "[path, {path,name:name || '东侧联络路', width:path.width, shoulder:")
js("name:'南海大道', path:street([[-120,-384]", "name:'南海大道', path:extendAvenue(street([[-120,-384]")
js("[-234,287],[-252,360]],14.0)}", "[-234,287],[-252,360]],14.0),44,101)}")
js("name:'白石路', path:street([[-271,257]", "name:'白石路', path:extendAvenue(street([[-271,257]")
js("[237,162],[362,149]],11.5)}", "[237,162],[362,149]],11.5),124,0)}")
js('const cityExtent = {minX:-448, maxX:437, minZ:-408, maxZ:384};',
   'const cityExtent = {minX:-448, maxX:437, minZ:-448, maxZ:485};')
js('const segment={path,x:a[0],z:a[2],dx,dz,ratio};',
   'const segment={path,x:a[0],z:a[2],dx,dz,ratio,row:i};')
js('''    officeTower(x,z,w,d,clearSkylineView(x,z,h),color,tint(color,c.tint?.72:.81),c.tint);''',
   '''    if(!roadClearsBuilding(x,z,(w+3.9)/2,(d+2.1)/2)) continue;
    officeTower(x,z,w,d,clearSkylineView(x,z,h),color,tint(color,c.tint?.72:.81),c.tint);''')
js('''[[-151,23,24,26,12],[-161,63,24,22,16],[-174,112,21,25,10],[-254,226,34,22,15],[-79,-268,32,12,13],[35,-270,34,16,19]]) {
    officeTower''',
   '''[[-158,23,24,26,12],[-169,63,24,22,16],[-185,112,21,25,10],[-260,226,34,22,15],[-79,-276,32,12,13],[35,-278,34,16,19]]) {
    if(!roadClearsBuilding(x,z,(w+3.9)/2,(d+2.1)/2)) continue;
    officeTower''')
js('''      if (nearestStreet(p[0], p[2], path).distance < 5.32) continue;''',
   '''      if (nearestStreet(p[0],p[2],path).distance<5.32 || pavedJunctionAt(p[0],p[2],path)) continue;''')
js('''      if (nearestStreet(p[0], p[2], path).distance < 6) continue;''',
   '''      if (nearestStreet(p[0],p[2],path).distance<6 || pavedJunctionAt(p[0],p[2],path)) continue;''')
js('''      if(entrances.some(g=>Math.hypot(g.xy[0]-x,g.xy[1]-z)<9.6) ||
         links.some(({path}) => path.rows.some(({p})=>Math.hypot(p[0]-x,p[2]-z)<path.width+1))) continue;''',
   '''      const crossesPublicRoad=[m,(m+q)/2,q].some(along=>{
        const t=along/d, px=mix(a[0],b[0],t), pz=mix(a[1],b[1],t);
        return nearestCitySegment(px,pz,null,.58)||cityStreetAt(px,pz);
      });
      if(crossesPublicRoad || entrances.some(g=>Math.hypot(g.xy[0]-x,g.xy[1]-z)<9.6) ||
         links.some(({path})=>path.rows.some(({p})=>Math.hypot(p[0]-x,p[2]-z)<path.width+1))) continue;''')

section('function timingRoadWidth(', 'function makeCourse(', source('road-timing.js'))
js('''    const width=timingRoadWidth(frame.p,options.cityAccess,path.width);
    return {...frame,distance,name,index:i,number:i===0?'起点':i===spec.length-1?'终点':String(i).padStart(2,'0'),half:Math.max(2.75,width+.34)};''',
   '''    const span=timingSpan(frame,options.cityAccess,path.width,2.75);
    return {...frame,...span,distance,name,index:i,number:i===0?'起点':i===spec.length-1?'终点':String(i).padStart(2,'0')};''')
js('''    return {...frame, distance, half:timingRoadWidth(frame.p,event.cityAccess,event.path.width)+.34};''',
   '''    return {...frame,distance,...timingSpan(frame,event.cityAccess,event.path.width)};''')
js('''  const scaleWidth=(gate.half+.08)/4.13;
  const p=(o,y)=>offsetVertex(gate,o*scaleWidth,y+(y>=3.45?1.38:0));''',
   '''  const left=gate.minCross??-gate.half, right=gate.maxCross??gate.half;
  const scaleWidth=((right-left)/2+.08)/4.13;
  const p=(o,y)=>offsetVertex(gate,(left+right)/2+o*scaleWidth,y+(y>=3.45?1.38:0));''')
js('''  return Math.abs(dot(subtract(hit,gate.p),gate.side))<=gate.half?at:null;''',
   '''  const offset=dot(subtract(hit,gate.p),gate.side);
  return offset>=(gate.minCross??-gate.half)&&offset<=(gate.maxCross??gate.half)?at:null;''')
js('''  for(const event of courses) event.cuts=buildCornerCuts(event);''',
   '''  for(const event of courses) {
    event.cuts=buildCornerCuts(event);
    if(event.cityAccess) notePublicMarkers(event);
  }''')
js('''    this.event.cuts??=buildCornerCuts(this.event);''',
   '''    this.event.cuts??=buildCornerCuts(this.event);
    if(this.event.cityAccess&&!this.event.markers[0].publicRoads) notePublicMarkers(this.event);''')
js('''    if (this.cornerCut) return Math.min(this.cornerCut.progress, this.event.gates[this.nextGate].distance);''',
   '''    if (this.cornerCut) return Math.min(this.cornerCut.progress,this.event.gates[this.nextGate].distance);
    if (this.publicProgress!==null) return this.publicProgress;''')
js('''    this.routeMark = 0;
    this.cornerCut = null;''',
   '''    this.routeMark = 0;
    this.cornerCut = this.publicProgress = null;''')
js('''    const {match, merged} = matchCornerCut(cuts[this.nextGate], p, headingVector(this.rider.heading), covered, markerStep);
    this.cornerCut = match;
    // Commit progress on the outgoing road, even if the rider was close to it on the way in.
    const distance = Math.min(merged, this.event.gates[this.nextGate].distance);
    if (distance > covered) this.routeMark = Math.max(this.routeMark, Math.floor(distance / markerStep) + 1);
    this.offRoute = Boolean(!this.cornerCut && this.nextGate > 0 &&
      markers[this.routeMark] && gap(markers[this.routeMark]) > 13);''',
   '''    const direction=headingVector(this.rider.heading),gate=this.event.gates[this.nextGate];
    const {match,merged}=matchCornerCut(cuts[this.nextGate],p,direction,covered,markerStep);
    this.cornerCut=match;
    this.publicProgress=this.event.cityAccess?projectPublicCourse(this.event,p,direction,covered,gate):null;
    const distance=Math.min(gate.distance,Math.max(merged,this.publicProgress??0));
    if(distance>covered) this.routeMark=Math.max(this.routeMark,Math.floor(distance/markerStep)+1);
    this.offRoute=Boolean(!this.cornerCut&&this.publicProgress===null&&this.nextGate>0&&
      markers[this.routeMark]&&gap(markers[this.routeMark])>13);''')
js('''    this.cornerCut = null;
    this.cornerEntryAt = null;
    this.lastCorner = null;''',
   '''    this.cornerCut = this.publicProgress = null;
    this.cornerEntryAt = null;
    this.lastCorner = null;''')
js('''    this.phase = 'done';
    this.cornerCut = null;''',
   '''    this.phase = 'done';
    this.cornerCut = this.publicProgress = null;''')
js('''    const reachable = Math.max(covered, this.cornerCut?.progress ?? 0);''',
   '''    const reachable=Math.max(covered,this.cornerCut?.progress??0,this.publicProgress??0);''')

js('''    exploring&&!groundSurfaces&&cityStreetAt(x,z));''',
   '''    exploring&&cityStreetAt(x,z));''')
js('''  if (!safeToRide(x,z,exploring)) {
    const slideX=safeToRide(x,p[2],exploring),slideZ=safeToRide(p[0],z,exploring);''',
   '''  const onDeck=exploring?flyoverAt(p[0],p[2]):null;
  const onUpperRoad=onDeck!==null&&p[1]>=onDeck-.34;
  const deckAt=(x,z)=>exploring?flyoverAt(x,z):null;
  const mayRide=(x,z)=>{
    const deck=deckAt(x,z);
    if(onUpperRoad&&onDeck>.40) return deck!==null;
    if(!onUpperRoad&&deck!==null&&deck>.40&&deck<2.78) return false;
    return safeToRide(x,z,exploring);
  };
  if (!mayRide(x,z)) {
    const slideX=mayRide(x,p[2]),slideZ=mayRide(p[0],z);''')
js('''  const height=rider.paved?ROAD_Y+.002:-.006;''',
   '''  const deck=deckAt(x,z);
  const height=deck!==null&&(onUpperRoad||deck<=.40) ? deck+.004 : rider.paved?ROAD_Y+.002:-.006;''')

(here / 'game.js').write_text(script, encoding='utf-8', newline='\n')
(here / 'szu-litchi-loop.html').write_text(markup+'<script>\n'+script+'</script>'+tail,
                                         encoding='utf-8', newline='\n')
