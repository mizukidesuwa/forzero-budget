from pathlib import Path

here = Path(__file__).parent
baseline = (here.parent / 'street-riding' / 'szu-litchi-loop.html').read_text(encoding='utf-8')
markup, body = baseline.split('<script>\n', 1)
script, tail = body.rsplit('</script>', 1)


def swap(before, after):
    global script
    if script.count(before) != 1:
        raise ValueError(f'Expected one source anchor for {before[:140]!r}')
    script = script.replace(before, after, 1)


def section(start, end, replacement):
    global script
    i = script.index(start)
    j = script.index(end, i)
    script = script[:i] + replacement + script[j:]


def source(name):
    return (here / name).read_text(encoding='utf-8').rstrip() + '\n\n'


script = script.replace('小东门', '立心门')
remove_blocks = ['汇文楼', '汇文楼 H1', '汇星楼', '汇紫楼', '汇典楼', '汇智楼', '校区体育馆', '致理楼']
remove_lots = ['[109,-111]', '[127,-79]', '[110,-57]']
script = ''.join(line for line in script.splitlines(keepends=True)
                 if not any(f"{{name:'{name}'," in line for name in remove_blocks)
                 and not any(f"{{name:'', use:'', at:{lot}," in line for lot in remove_lots))

swap('const groups=[', source('campus-plan.js') + source('canghai-buildings.js') + 'const groups=[')
section('  {district:\'汇文楼组团\'', '  {district:\'北区教学楼群\'', '')
section('const closeToBlock =', 'for(const [groupIndex,group]', '''function fitDistrictBlock(block,existing) {
  if (!inCampus(block.x,block.z) || lakeClearance(block.x,block.z)<Math.min(block.w,block.depth)*.70) return false;
  if (closeToBlock(block.x,block.z,athleticsField,Math.max(block.w,block.depth)*.60)) return false;
  if (existing.some(other=>(other.parts??[other]).some(part=>!fitsBetweenBuildings(block,part)))) return false;
  return roads.every(path=>path.rows.every(({p})=>!closeToBlock(p[0],p[2],block,path.width+.95)));
}

const campus = [...originalCampus,...documentedBlocks,...featuredCampus,...canghaiBuildings];
''')
swap('''function buildingAt(x, z, margin = .38) {
  return campus.find(b => Math.abs(x - b.x) < b.w / 2 + margin && Math.abs(z - b.z) < b.depth / 2 + margin);
}''','''function buildingAt(x,z,margin=.38,y=0) {
  const contains = part => y < (part.height ?? 3.9 + part.floors*1.93) && closeToBlock(x,z,part,margin);
  return campus.find(block=>block.parts ? block.parts.some(contains) : contains(block)) ||
    campusFixtures.find(contains);
}''')
swap('''    const block = buildingAt(point[0],point[2],.3);
    if (block && point[1] < 3.9 + block.floors * 1.93) return clear;''',
     '''    if (buildingAt(point[0],point[2],.3,point[1])) return clear;''')
swap('const openStreets = [', source('canghai-streets.js') + 'const openStreets = [')
swap('[-121,-42],[-113,22],[-139,91]', '[-124,-42],[-122,22],[-139,91]')
swap('const campusBoundary = {minX:-207,maxX:271,minZ:-223,maxZ:250};',
     'const campusBoundary = {minX:-207,maxX:346,minZ:-223,maxZ:264};')
swap('const mapExtent = {minX:-232,maxX:342,minZ:-269,maxZ:287};',
     'const mapExtent = {minX:-232,maxX:366,minZ:-269,maxZ:287};')
swap('''function inCampus(x,z) {
  let inside = false;
  for (let i=0,j=perimeter.length-1;i<perimeter.length;j=i++) {
    const [ax,az]=perimeter[i], [bx,bz]=perimeter[j];''',
     '''function inCampus(x,z) {
  if (inOutline(x,z,perimeter)) return true;
  return x>168 && z>169 && inOutline(x,z,canghaiPerimeter);
}

function inOutline(x,z,outline) {
  let inside = false;
  for (let i=0,j=outline.length-1;i<outline.length;j=i++) {
    const [ax,az]=outline[i], [bx,bz]=outline[j];''')
swap('''openStreets.concat(cityLinks).map''','''openStreets.concat(cityLinks,canghaiStreets).map''')
swap('''  for (const {path} of cityLinks) {
    const edge = path.width, ramp = edge + .68;''',
     '''  for (const {name,path} of [...cityLinks,...canghaiStreets]) {
    const edge = path.width, ramp = edge + .68;
    const paintEnd=name==='立德门'?path.length-5.7:path.length;''')
swap("ribbon(masonry,path,x-.042,x+.042,ROAD_Y+.004,'#d1d2b9',0,path.length,1.0);",
     "ribbon(masonry,path,x-.042,x+.042,ROAD_Y+.004,'#d1d2b9',0,paintEnd,1.0);")
swap('''      if (!inCampus(p[0],p[2])) lamppost(p[0],p[2],scale(a.side,-1));''',
     '''      const street=cityStreetAt(p[0],p[2]);
      if (!inCampus(p[0],p[2]) && (!street || street===cityRoads.get(path)))
        lamppost(p[0],p[2],scale(a.side,-1));''')
section('// The two 文山湖 basins', 'function inCampus(', '''// Wenshan Lake shorelines follow the guide's long axes and use the same outline for riding and drawing.
const basins = [
  {name:'下文山湖', x:-104,z:164,rx:23.5,rz:12.3,y:.017,angle:.52,yaw:-1.31},
  {name:'上文山湖', x:-31,z:125,rx:25.5,rz:13.3,y:.017,angle:2.2,yaw:.53},
  {name:'', x:-78,z:-125.8,rx:7.9,rz:4.2,y:.017,angle:1.22,yaw:.77}
].map(basin=>({...basin,c:Math.cos(basin.yaw),s:Math.sin(basin.yaw)}));

function bankRatio(basin,angle) {
  return 1+.073*Math.cos(angle*3+basin.angle)+.045*Math.sin(angle*5-basin.angle);
}
function bank(basin,angle,inset=0,y=basin.y) {
  const r = bankRatio(basin,angle);
  return lotPoint(basin,(basin.rx-inset)*Math.cos(angle)*r,y,(basin.rz-inset)*Math.sin(angle)*r);
}
function lakeClearance(x,z) {
  let clearance=Infinity;
  for (const basin of basins) {
    const dx=x-basin.x,dz=z-basin.z;
    const u=(basin.c*dx-basin.s*dz)/basin.rx, v=(basin.s*dx+basin.c*dz)/basin.rz;
    const r=Math.hypot(u,v);
    const gap = r ? Math.hypot(dx,dz)*(1-bankRatio(basin,Math.atan2(v,u))/r) : -basin.rz;
    clearance=Math.min(clearance,gap);
  }
  return clearance;
}

''')
swap('''  const lakeBounds = basins.map(({x, z, rx, rz, y}) => ({
    x, z,
    low: [x - rx * 1.12, y, z - rz * 1.12],
    high: [x + rx * 1.12, y, z + rz * 1.12]
  }));''','''  const lakeBounds = basins.map(({x,z,rx,rz,y,c,s}) => {
    const width=1.12*Math.hypot(c*rx,s*rz), depth=1.12*Math.hypot(s*rx,c*rz);
    return {x,z,low:[x-width,y,z-depth],high:[x+width,y,z+depth]};
  });''')
swap("  {name:'汇文楼前庭',xy:[-53,-170],w:22,d:8.1},",
     "  {name:'汇文楼前庭',xy:[-44,-179],w:15,d:9.1},")
swap("  {name:'体育馆前庭',xy:[194,-86],w:29,d:11.7},",
     "  {name:'元平体育馆前庭',xy:[111,-61],w:17,d:6},\n"
     "  {name:'天人广场',xy:[0,51],w:17,d:9.2},")
section('function facadeFace(', 'function boundaryEdges()', source('landmarks.js') +
        source('entrances.js') + source('grounds.js'))
swap('''  const origin=[0,-.012,-1];
  for (let i=0;i<perimeter.length;i++) {
    const a=perimeter[i],b=perimeter[(i+1)%perimeter.length];
    terrain.triangle(origin,[a[0],-.012,a[1]],[b[0],-.012,b[1]],'#789454');
  }''','''  for(const [outline,origin] of [[perimeter,[0,-.012,-1]],[canghaiPerimeter,[254,-.012,210]]]) {
    for(let i=0;i<outline.length;i++) {
      const a=outline[i],b=outline[(i+1)%outline.length];
      terrain.triangle(origin,[a[0],-.012,a[1]],[b[0],-.012,b[1]],'#789454');
    }
  }''')
swap('''  for(let i=0;i<perimeter.length;i++) {
    const a=perimeter[i],b=perimeter[(i+1)%perimeter.length];
    const d=Math.hypot''','''  const entrances=[...campusGates,...canghaiGates], links=[...cityLinks,...canghaiStreets];
  for(const outline of campusOutlines) for(let i=0;i<outline.length;i++) {
    const a=outline[i],b=outline[(i+1)%outline.length];
    const d=Math.hypot''')
swap('''      if(campusGates.some(g=>Math.hypot(g.xy[0]-x,g.xy[1]-z)<10.6) ||
         cityLinks.some(({path}) => path.rows.some(({p})=>Math.hypot(p[0]-x,p[2]-z)<path.width+1))) continue;''',
     '''      if(entrances.some(g=>Math.hypot(g.xy[0]-x,g.xy[1]-z)<9.6) ||
         links.some(({path}) => path.rows.some(({p})=>Math.hypot(p[0]-x,p[2]-z)<path.width+1))) continue;''')
swap('''  for(const gate of campusGates) schoolGate(gate);''',
     '''  for(const gate of [...campusGates,...canghaiGates]) schoolGate(gate);''')
swap('''  landscapeInterior();
  modelTraffic();''','''  landscapeInterior();
  modelTraffic();
  canghaiGrounds();''')
swap('''  boundaryEdges();
  walkBridge();''','''  boundaryEdges();
  campusGroundDetails();
  walkBridge();''')
swap('''    if (Math.hypot(sportsCenter[0]-x,sportsCenter[1]-z)<23) return;''',
     '''    if (Math.hypot(sportsCenter[0]-x,sportsCenter[1]-z)<23 || !landmarkClearance(x,z)) return;''')
section("  if(block.kind==='library')", "  if(block.kind==='hall')", '')
swap('''        nearestStreet(t[0],t[2],path).distance>5&&!treeSites.some''',
     '''        nearestStreet(t[0],t[2],path).distance>5&&landmarkClearance(t[0],t[2])&&!treeSites.some''')
swap('''    pavement.box([x,.003,z],[court.w,.030,court.d],'#c5b6a3');
    if (court.name === '汇文楼前庭') {''',
     '''    if (court.name==='天人广场') continue;
    pavement.box([x,.003,z],[court.w,.030,court.d],'#c5b6a3');
    if (court.name === '汇文楼前庭') {''')
swap('''    ctx.strokeStyle = compact ? '#a6b99979' : '#e8dfc0';''',
     '''    ctx.strokeStyle = compact ? '#a6b99979' : laneColors.get(street) ?? '#e8dfc0';''')
swap('''  mapPath(ctx,project,perimeter.map(([x,z])=>[x,0,z]),true);
  ctx.fillStyle=compact?'#395747':'#adbf94';
  ctx.fill();
  ctx.strokeStyle=compact?'#89ab8a79':'#728767';
  ctx.lineWidth=compact?1.2:2.15;
  ctx.stroke();''','''  for(const outline of campusOutlines) {
    mapPath(ctx,project,outline.map(([x,z])=>[x,0,z]),true);
    ctx.fillStyle=compact?'#395747':'#adbf94';
    ctx.fill();
    ctx.strokeStyle=compact?'#89ab8a79':'#728767';
    ctx.lineWidth=compact?1.2:2.15;
    ctx.stroke();
  }''')
swap('''    for(const gate of campusGates) {
      const [x,y]=project''','''    for(const gate of [...campusGates,...canghaiGates]) {
      const [x,y]=project''')
swap("['白石路',15,211]", "['白石路',157,177],['粤海南区',297,256]")
swap('''  if (!exploring || focus) drawCourseMap(ctx,project,compact,event);''','''  const oval = (width,length,y) => Array.from({length:50},(_,i)=>
    ovalPoint(athleticsField,(i<25?0:-Math.PI)+.00001+(Math.PI-.00002)*(i%25)/24,width,length,y));
  mapPath(ctx,project,oval(athleticsField.w,athleticsField.depth,0),true);
  ctx.fillStyle=compact?'#a77963':'#b67656';ctx.fill();
  mapPath(ctx,project,oval(athleticsField.w-5.8,athleticsField.depth-5.8,0),true);
  ctx.fillStyle=compact?'#52694e':'#95aa75';ctx.fill();
  if (!exploring || focus) drawCourseMap(ctx,project,compact,event);''')
section('''  for (const block of campus) {
    const [x,y] = project''','''  labels.sort''','''  for(const block of campus) {
    ctx.fillStyle = compact ? '#b5c0a973' : (block.palette === clay ? '#ac8068' : '#879589');
    ctx.strokeStyle = compact ? '#d9e2c32d' : '#fff1cc9e';
    ctx.lineWidth=.85;
    for(const foot of block.parts??[block]) {
      mapPath(ctx,project,footprintCorners(foot),true);
      ctx.fill();ctx.stroke();
    }
    const wing = block.kind==='huiwen' || block.kind==='huizi';
    if(!compact&&labelBuildings&&block.name&&(!wing||focus||fit>1.42||block.priority>=10)) {
      const [x,y]=project([block.x,0,block.z]);
      const name=wing?(focus||fit>1.42 ?
        (block.kind==='huiwen'?'H'+block.wing:block.wing+' 座') :
        (block.kind==='huiwen'?'汇文楼':'汇紫楼')):block.name;
      labels.push({block,x,y,name});
    }
  }
''')
swap('''  for(const {block,x,y} of labels) {
    const w=ctx.measureText(block.name).width+6;''','''  for(const {name,x,y} of labels) {
    const w=ctx.measureText(name).width+6;''')
swap('''    ctx.strokeText(block.name,x,y);ctx.fillText(block.name,x,y);''',
     '''    ctx.strokeText(name,x,y);ctx.fillText(name,x,y);''')
swap('''    for(const c of courts) {
      if(c.name!=='校友广场'&&c.name!=='时光广场') continue;
      const [ax,ay]=project([c.xy[0],0,c.xy[1]]);''','''    const labels=[
      ...courts.filter(c=>['校友广场','时光广场','天人广场'].includes(c.name)).map(c=>[c.name,...c.xy]),
      ['田径运动场',athleticsField.x,athleticsField.z],
      ...(focus||fit>1.42?[['汇文楼组团',-41,-185],['汇紫楼',54,29]]:[]),
      ...campusLanes.map(lane=>[lane.name,...lane.at])
    ];
    for(const [name,x,z] of labels) {
      const [ax,ay]=project([x,0,z]);''')
swap('''      ctx.strokeText(c.name,ax,ay);ctx.fillText(c.name,ax,ay);''',
     '''      ctx.strokeText(name,ax,ay);ctx.fillText(name,ax,ay);''')

(here / 'game.js').write_text(script, encoding='utf-8', newline='\n')
(here / 'szu-litchi-loop.html').write_text(markup + '<script>\n' + script + '</script>' + tail, encoding='utf-8', newline='\n')
