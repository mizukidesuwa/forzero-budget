from pathlib import Path

here = Path(__file__).resolve().parent
base = (here.parent / 'garage' / 'szu-litchi-loop.html').read_text(encoding='utf-8')
head, body = base.split('<script>\n', 1)
game, tail = body.rsplit('</script>', 1)


def substitute(old, new):
    global game
    if game.count(old) != 1:
        raise ValueError(f'Expected one occurrence of {old[:90]}')
    game = game.replace(old, new, 1)


def models(first, following, filename):
    start = game.index('function ' + first + '(')
    end = game.index('function ' + following + '(', start)
    substitute(game[start:end], (here / filename).read_text(encoding='utf-8').rstrip() + '\n\n')


models('huiwenBuilding', 'glassPassage', 'faculty.js')
models('huizhiBuilding', 'renderCampusLandmark', 'south.js')
models('tiledGatehouse', 'gateBooth', 'west-gate.js')
substitute("    case 'huiwen':", """    case 'auditorium': campusAuditorium(block); break;
    case 'huiyuan': huiyuanBuilding(block); break;
    case 'huiwen':""")
substitute("].map(({at,...block})=>({...block,x:at[0],z:at[1]}));", """].map(({at,...block})=>{
  const lot={...campusFootprint(at[0],at[1],block.w,block.depth),...block};
  if(block.name==='汇元楼') Object.assign(lot,{kind:'huiyuan',outline:huiyuanPlan(lot.w,lot.depth),height:10.55});
  return lot;
});""")
substitute("&& closeToBlock(x,z,part,margin);", """&& closeToBlock(x,z,part,margin) &&
    (!part.outline || insidePlan(x-part.x,z-part.z,part.outline,margin));""")
substitute("  const rect = [[-1,-1]", """  if(lot.outline) return lot.outline.map(([u,v])=>lotPoint(lot,u,0,v));
  const rect = [[-1,-1]""")
substitute("w:21,depth:15,floors:2,palette:limestone,kind:'hall'", "w:21,depth:15,floors:2,palette:limestone,kind:'auditorium'")
substitute(".map(({at,...b})=>({...b,x:at[0],z:at[1]}));", ".map(({at,...b})=>({...campusFootprint(at[0],at[1],b.w,b.depth),...b}));")
substitute("  lotPart(huizhi,-1.6,-18.1,28,18.7,0),", """  lotPart(huizhi,-1.6,-18.1,28,18.7,0),
  lotPart(huidian,0,12.3,17,10.0,0),
  campusFootprint(centralSquare[0]-4.7,centralSquare[1],17,12.6),""")
substitute("    if (court.name==='天人广场') continue;",
           "    if (court.name==='天人广场'||court.name==='时光广场') continue;")
substitute("  athleticsTrack();\n  huiwenWalkways();", "  athleticsTrack();\n  huiwenWalkways();\n  sundialGarden(courts.find(court=>court.name==='时光广场'));")
substitute("    const wing = block.kind==='huiwen'", """    if(!compact && block===huidian) {
      mapPath(ctx,project,footprintCorners(lotPart(block,0,0,5.3,3.35,0)),true);
      ctx.fillStyle='#bdc7b5';ctx.fill();ctx.stroke();
    }
    const wing = block.kind==='huiwen'""")

substitute("冲刺耐力恢复较慢。", "")
substitute("  event.sprintRecovery=.66;\n", "")
substitute("function moveCyclist(rider,input,dt,exploring=false,recovery=1) {",
           "function moveCyclist(rider,input,dt,exploring=false) {")
substitute("rider.energy+dt*recovery*(paved?.052:.035)", "rider.energy+dt*(paved?.052:.035)")
substitute("""    const racing=this.phase==='race';
    const previous=moveCyclist(this.rider,input,PHYSICS_STEP,this.phase==='free'||this.event.cityAccess,
      racing ? this.event.sprintRecovery : 1);""",
           "    const previous=moveCyclist(this.rider,input,PHYSICS_STEP,this.phase==='free'||this.event.cityAccess);")

(here / 'game.js').write_text(game, encoding='utf-8', newline='\n')
(here / 'szu-litchi-loop.html').write_text(head + '<script>\n' + game + '</script>' + tail,
                                         encoding='utf-8', newline='\n')
