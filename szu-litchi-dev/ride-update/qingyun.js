// Local metres. +x points east and +z south. Control points describe the compressed ride,
// not a surveyed GPX. The straight crossing has an explicit longitudinal coordinate.
const parkNodes=[[0,0],[-25,0],[-44,12],[-61,37],[-93,58],[-117,95],
  [-122,136],[-142,158],[-158,190],[-151,229],[-125,254],[-82,272],[-46,279],
  [-16,266],[12,271],[42,296],[68,302],[89,283],[105,250],[126,222],
  [138,206],[153,186],[168,166],[180,150],[186,131],[175,112],[143,99],
  [114,85],[91,84],[66,94],[45,90],[28,68],[31,44],[47,26],[46,10],[27,0]];
const parkSpline=street([parkNodes.at(-1),...parkNodes,parkNodes[0],parkNodes[1]],4);
const parkPath=travelTable(parkSpline.rows.slice(24,-24).map(row=>row.p),4);
const parkSegments=indexStreets([parkPath]);
const parkTower=[59,55], parkPavilion=[-4,149];
const pavilionWalk=street([parkNodes[30],[40,97],[26,113],[14,120],[3,132],parkPavilion],1.4);
const pavilionWalkIndex=indexStreets([pavilionWalk]);
const pavilionDeckY=1.72;
const pavilionRim=Array.from({length:8},(_,i)=>{
  const angle=i*TAU/8;
  return [parkPavilion[0]+6.3*Math.cos(angle),parkPavilion[1]+6.3*Math.sin(angle)];
});
const parkBounds={minX:-162,maxX:460,minZ:-56,maxZ:306};
const parkHills=[[-255,210,69,76,30],[-222,340,79,59,45],[-73,398,95,66,32],
  [252,263,48,52,16],[520,42,37,49,14]];
const parkStops=[[0,'顺峰山公园牌坊'],[4,'桂海芳丛'],[9,'西岸林荫'],[14,'南岸开阔段'],
  [21,'伏波桥'],[29,'青云塔山脚'],[parkNodes.length,'牌坊冲线']];
const parkCourse=makeCourse('qingyun-lake','青云湖环线','穿过牌坊，经桂海芳丛环湖，过九孔伏波桥，沿青云塔山脚回到广场。',
  parkPath,parkStops.map(([i,label])=>[parkPath.rows[i*24].distance,label]),parkPath.length,
  {absolute:true,campus:'shunde',thresholds:[.965,1.11,1.29]});
campuses.shunde={name:'佛山顺德 · 顺峰山公园',station:'牌坊广场',arrival:[10,ROAD_Y,0],heading:Math.PI};

function bridgeAxis(x,z) { return (x-153)*.6-(z-186)*.8; }
function onBridgeAxis(x,z) {return Math.abs((x-153)*.8+(z-186)*.6)<8;}
function parkBridgeHeight(x,z) {
  if(!onBridgeAxis(x,z)) return 0;
  const a=Math.abs(bridgeAxis(x,z));
  if(a>=42) return 0;
  return .86*(1+Math.cos(Math.PI*a/42));
}
function pavilionWalkY(distance) {
  const t=clamp((distance-5.5)/32,0,1);
  return mix(ROAD_Y,pavilionDeckY,t*t*(3-2*t));
}
function parkPavilionDeck(x,z) {
  if(x<parkPavilion[0]-6.3||x>parkNodes[30][0]+pavilionWalk.width||z<parkNodes[30][1]-pavilionWalk.width||z>parkPavilion[1]+6.3) return null;
  if(Math.abs(x-parkPavilion[0])<=6.3&&Math.abs(z-parkPavilion[1])<=6.3&&pointInPoly2D(x,z,pavilionRim)) return pavilionDeckY;
  let distance=null, best=pavilionWalk.width**2;
  for(const {x:ax,z:az,dx,dz,ratio,row} of pavilionWalkIndex.get(streetCell(x,z))??[]) {
    const tx=x-ax,tz=z-az,t=clamp((tx*dx+tz*dz)*ratio,0,1);
    const gap=(tx-dx*t)**2+(tz-dz*t)**2;
    if(gap>best) continue;
    best=gap;
    distance=mix(pavilionWalk.rows[row-1].distance,pavilionWalk.rows[row].distance,t);
  }
  return distance===null?null:pavilionWalkY(distance);
}
function parkHeight(x,z) {
  const deck=parkPavilionDeck(x,z);
  return deck===null?parkBridgeHeight(x,z)+mountainHeight(x,z):deck-ROAD_Y;
}
function parkWidth(x,z) {
  if (onBridgeAxis(x,z)) return 3.35+.8*clamp((Math.abs(bridgeAxis(x,z))-36)/13,0,1);
  return 4.15-1.13*Math.max(0,1-Math.abs(z-166)/44)*clamp((-x-80)/45,0,1);
}
function parkPaved(x,z,margin=0) {
  if(Math.abs(x)<=21-margin&&Math.abs(z)<=26-margin) return true;
  const width=parkWidth(x,z)-margin;
  return parkSegments.get(streetCell(x,z))?.some(seg=>streetGapSquared(seg,x,z)<=width*width)??false;
}
function parkFixture(x,z,margin,y) {
  const candidates=ridingObstacles?.region==='shunde'?ridingObstacles.buildings.get(streetCell(x,z)):null;
  return candidates?.find(({part})=>y<part.height&&closeToBlock(x,z,part,margin))?.lot;
}
function pointInPoly2D(x,z,poly) {
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++) {
    const xi=poly[i][0],zi=poly[i][1],xj=poly[j][0],zj=poly[j][1];
    if(((zi>z)!==(zj>z))&&(x<(xj-xi)*(z-zi)/(zj-zi)+xi)) inside=!inside;
  }
  return inside;
}
function parkBridgeSide(x,z) { return (x-153)*.8+(z-186)*.6; }
function parkBridgeRailBlocked(x,z) {
  const along=Math.abs(bridgeAxis(x,z)), side=Math.abs(parkBridgeSide(x,z));
  return along<36.5&&side>=3.01&&side<=4.35&&!parkPaved(x,z,.34);
}
function parkInWater(x,z) {
  const along=bridgeAxis(x,z), side=parkBridgeSide(x,z);
  if(Math.abs(along)<40&&Math.abs(side)<3.05) return false;
  if(parkPaved(x,z,.05)) return false;
  if(parkPavilionDeck(x,z)!==null) return false;
  if(x>=parkWaterBounds.minX&&x<=parkWaterBounds.maxX&&z>=parkWaterBounds.minZ&&z<=parkWaterBounds.maxZ&&pointInPoly2D(x,z,parkWaterPoly)) return true;
  if(Math.abs(along)<39&&side>3.1) {
    const crossing=clamp((39-Math.abs(along))/9,0,1);
    const outerWater=3.5+crossing*(44+28*Math.cos(along*.052)+8*Math.sin(along*.094));
    if(side<outerWater) return true;
  }
  return false;
}
function parkMountainDropOff(x,z,prevY=null) {
  const h=parkHeight(x,z), elev=prevY!==null?Math.max(prevY,h):h;
  if(elev<=2.4) return false;
  if(parkPaved(x,z,-.5)) return false;
  if(parkPavilionDeck(x,z)!==null) return false;
  const near=mountainRoadAt(x,z);
  if(near&&near.gap<=near.lane.path.width+4.2) return false;
  const sc=shundeShortcutSample(x,z);
  if(sc&&sc.gap<=sc.cut.width*.5+3.5) return false;
  return true;
}
function nearestPathSpot(paths,x,z,elevFn) {
  let bestPath=paths[0], bestRow=paths[0].rows[0], bestD2=Infinity;
  for(const path of paths) {
    const rows=path.rows;
    for(let i=0;i<rows.length;i++) {
      const r=rows[i], dx=r.p[0]-x, dz=r.p[2]-z, d2=dx*dx+dz*dz;
      if(d2<bestD2) { bestD2=d2; bestPath=path; bestRow=r; }
    }
  }
  const f=courseFrame(bestPath,bestRow.distance);
  const [rx,,rz]=f.p;
  return {p:[rx,elevFn(rx,rz)+ROAD_Y,rz],heading:Math.atan2(f.f[2],f.f[0])};
}
function parkNearestRoad(x,z) {
  return nearestPathSpot([parkPath,mountainUp,mountainDown],x,z,parkHeight);
}
function parkSurfaceKind(x,z) {
  if(parkPaved(x,z)||parkPavilionDeck(x,z)!==null) return 'paved';
  const branch=mountainRoadAt(x,z);
  if(branch&&branch.gap<=branch.lane.path.width) return mountainIsGravel(branch.lane,branch.distance)?'gravel':'paved';
  const sc=shundeShortcutAt(x,z);
  if(sc) return sc.firm?'paved':'gravel';
  return 'grass';
}
function parkRideable(x,z,skipHazard=false) {
  if(x<-185||x>505||z<-76||z>332) return false;
  if(parkBridgeRailBlocked(x,z)) return false;
  if(!skipHazard&&parkInWater(x,z)) return false;
  if(!skipHazard&&parkMountainDropOff(x,z)) return false;
  if(parkFixture(x,z,.28,parkHeight(x,z))) return false;
  if(treeBlocks(x,z,.28)) return false;
  if(parkPaved(x,z,.1)) return true;
  const branch=mountainRoadAt(x,z,true);
  if(branch&&branch.gap<=branch.lane.path.width) return true;
  if(shundeShortcutAt(x,z)) return true;
  if(((x-parkTower[0])/21)**2+((z-parkTower[1])/19)**2<1) return false;
  for(const [hx,hz,rx,rz] of parkHills) {
    if(((x-hx)/(rx*.88))**2+((z-hz)/(rz*.88))**2<1) return false;
  }
  return true;
}
function parkFirmSurface(x,z) {
  return parkSurfaceKind(x,z)==='paved';
}
function parkGateModel() {
  const stone='#bda990', trim='#e4cda3', roof='#97522f';
  for(const z of [-19,-7,7,19]) for(const x of [-1.8,1.8]) {
    const h=Math.abs(z)===7?14.3:10.7;
    masonry.box([x,.22,z],[1.75,.44,1.75],stone);
    masonry.box([x,.62,z],[1.44,.36,1.44],trim);
    masonry.tube([x,.8,z],[x,h,z],.66,.57,trim,8);
    campusFixtures.push({name:'牌坊石柱',x,z,w:1.75,depth:1.75,height:h,c:1,s:0});
  }
  for(const [z,w,h] of [[-13,12,9.2],[0,14,13.2],[13,12,9.2]]) {
    for(const x of [-1.8,1.8]) {
      masonry.box([x,h-.35,z],[.98,1.45,w],stone);
      masonry.box([x,h-1.24,z],[1.22,.28,w+.45],trim);
      for(let i=-2;i<=2;i++) {
        const u=z+i*w/5.4;
        masonry.box([x,h+.5,u],[1.88,.32,.48],trim);
        masonry.box([x,h+.22,u],[1.51,.34,.35],stone);
        if(i===0) continue;
        // Carved hanging shafts are suspended beneath the lintel.
        masonry.tube([x,h-2.32,u],[x,h-1.26,u],.15,.26,trim,8);
        masonry.tube([x,h-2.08,u],[x,h-1.94,u],.24,.24,stone,8);
      }
      for(const end of [-1,1]) {
        const edge=z+end*(w/2-.54);
        masonry.tube([x,h-2.8,edge],[x,h-1.18,edge-end*1.58],.20,.30,stone,8);
      }
    }
    // Tiled hip roofs with lifted ends and a contrasting ridge.
    for(const side of [-1,1]) {
      for(let i=0;i<8;i++) {
        const tile=(j,eave)=>{const t=j/4-1;return [side*(eave?3.2:.22),h+(eave?.53:2.35)+Math.abs(t)**4*.75,z+t*(w/2+(eave?1.55:.50))];};
        masonry.quad(tile(i,true),tile(i+1,true),tile(i+1,false),tile(i,false),i%2?roof:'#a05e39');
      }
    }
    masonry.box([0,h+2.61,z],[.46,.39,w+1.9],trim);
  }
  const inscription=signCanvas(512,90,(ctx,w,h)=>{
    ctx.fillStyle='#994c34';ctx.fillRect(0,0,w,h);ctx.textAlign='center';ctx.fillStyle='#f0cf77';
    ctx.font='bold 62px serif';ctx.fillText('顺 峰 山 公 园',w/2,68);
  });
  for(const side of [-1,1]) plate(inscription,[side*2.32,12.8,0],6,1.08,side*Math.PI/2);
}
function parkPagoda(x,z,base,floors,scaleFactor=1) {
  let y=base;
  for(let i=0;i<floors;i++) {
    const r=(3.25-.27*i)*scaleFactor, h=(3.2-.19*i)*scaleFactor;
    masonry.tube([x,y,z],[x,y+h,z],r,r*.94,'#cfa67c',8);
    for(let k=0;k<8;k++) {
      const a=k*Math.PI/4, dx=Math.cos(a)*.91*r,dz=Math.sin(a)*.91*r;
      masonry.box([x+dx,y+h*.51,z+dz],[.19,h*.46,r*.30],'#594d44',-a);
    }
    masonry.tube([x,y+h-.15,z],[x,y+h+.59*scaleFactor,z],r*1.25,r*.87,'#715748',8);
    y+=h+.45*scaleFactor;
  }
  masonry.tube([x,y,z],[x,y+2.5*scaleFactor,z],.54*scaleFactor,.05,'#56473d',8);
}
function bridgePoint(t,side,y) {return [153+t*.6+side*.8,y,186-t*.8+side*.6];}
function parkBridge() {
  // Nine true openings under the fascia. The deck, posts and collision all use parkHeight and parkWidth.
  for(const side of [-1,1]) {
    const v=(t,y)=>bridgePoint(t,side*3.35,y);
    for(let span=0;span<9;span++) {
      const start=-27+span*6;
      for(let i=0;i<10;i++) {
        const section=j=>{
          const t=start+j*.6, [x,,z]=v(t,0),top=parkHeight(x,z)+.035;
          return [v(t,-.40+Math.sin(j*Math.PI/10)*(top+.18)),v(t,top)];
        };
        const [a,b]=section(i),[c,d]=section(i+1);
        masonry.quad(a,c,d,b,'#afaa96',[.8*side,0,.6*side]);
      }
    }
    for(let t=-36;t<=36;t+=3) {
      const [x,,z]=v(t,0),y=parkHeight(x,z);
      masonry.box([x,y+.52,z],[.32,1.08,.32],'#d2ceba');
      if(t===36) break;
      const next=v(t+3,0),h=parkHeight(next[0],next[2]);
      for(const level of [.36,.85]) masonry.tube(v(t,y+level),v(t+3,h+level),.10,.10,'#d5d0bf',6);
    }
  }
}
function lakePavilion(x,z) {
  const rimPoint=([px,pz],y)=>[px,y,pz];
  for(let i=0;i<pavilionRim.length;i++) {
    const a=pavilionRim[i],b=pavilionRim[(i+1)%pavilionRim.length];
    masonry.triangle([x,pavilionDeckY,z],rimPoint(b,pavilionDeckY),rimPoint(a,pavilionDeckY),'#d4caba');
    masonry.quad(rimPoint(a,1.3),rimPoint(b,1.3),rimPoint(b,pavilionDeckY),rimPoint(a,pavilionDeckY),'#ac9a7e');
  }
  masonry.tube([x,-.28,z],[x,1.3,z],4.8,5.4,'#a9967b',8);
  for(let k=0;k<8;k++) {
    const a=k*Math.PI/4,dx=4.4*Math.cos(a),dz=4.4*Math.sin(a);
    const px=x+dx,pz=z+dz;
    masonry.tube([px,pavilionDeckY,pz],[px,5.9,pz],.24,.23,'#964d3b',8);
    campusFixtures.push({name:'湖心亭柱',x:px,z:pz,w:.48,depth:.48,height:5.9,c:1,s:0});
  }
  for(const [y,r] of [[5.8,6.5],[7.65,4.35]]) {
    masonry.tube([x,y,z],[x,y+.22,z],r,r,'#bf9856',8);
    masonry.tube([x,y+.22,z],[x,y+2.12,z],r,1.55,'#566e5e',8);
  }
}
function buildPavilionWalk() {
  const w=pavilionWalk.width, step=1.25;
  const shoreEnd=pavilionWalk.length-4.95;
  let previous=courseFrame(pavilionWalk,0);
  for(let i=1;i<=Math.ceil(shoreEnd/step);i++) {
    const distance=Math.min(i*step,shoreEnd), f=courseFrame(pavilionWalk,distance);
    const a=pavilionWalkY(Math.min((i-1)*step,shoreEnd))+.004,b=pavilionWalkY(distance)+.004;
    const span=(inner,outer,color)=>pavement.quad(offsetVertex(previous,inner,a),offsetVertex(f,inner,b),
      offsetVertex(f,outer,b),offsetVertex(previous,outer,a),color);
    span(-w+.10,w-.10,i%2?'#a3825e':'#9b7955');
    span(-w,-w+.10,'#d3ba8c');
    span(w-.10,w,'#d3ba8c');
    if(i%4===0&&distance>6) {
      for(const side of [-.92,.92]) {
        const [x,,z]=offsetVertex(f,side,b);
        masonry.box([x,(b-.3)/2,z],[.19,b+.3,.19],'#705d4a');
      }
    }
    previous=f;
  }
}
const parkFrames=Array.from({length:Math.ceil(parkPath.length/1.8)+1},(_,i)=>
  courseFrame(parkPath,Math.min(parkPath.length,i*1.8)));
function parkEdges(frame) {
  const [x,,z]=frame.p,w=parkWidth(x,z),y=parkBridgeHeight(x,z);
  const alongBridge=bridgeAxis(x,z);
  const crossing=onBridgeAxis(x,z)?clamp((39-Math.abs(alongBridge))/9,0,1):0;
  const outerWater=3.5+crossing*(44+28*Math.cos(alongBridge*.052)+8*Math.sin(alongBridge*.094));
  const inner=w+2.3+Math.max(0,1-Math.hypot(x,z)/78)*26;
  return {left:offsetVertex(frame,-w,y+ROAD_Y),right:offsetVertex(frame,w,y+ROAD_Y),
    bank:offsetVertex(frame,-inner,WATER_Y), crossing,outerWater};
}
const parkEdgesList=parkFrames.map(parkEdges);
const parkWaterPoly=parkEdgesList.filter((_,i)=>i%2===0).map(e=>[e.bank[0],e.bank[2]]);
const parkWaterBounds=(()=>{
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(const [x,z] of parkWaterPoly) { if(x<minX)minX=x; if(x>maxX)maxX=x; if(z<minZ)minZ=z; if(z>maxZ)maxZ=z; }
  return {minX,maxX,minZ,maxZ};
})();
const parkReflectionBounds=(()=>{
  const cells=new Map(), step=28, center=[-7,WATER_Y,168];
  const mark=(x,z)=>{
    const key=Math.floor(x/step)*4096+Math.floor(z/step);
    let b=cells.get(key);
    if(!b) cells.set(key,b={minX:x,maxX:x,minZ:z,maxZ:z});
    else { b.minX=Math.min(b.minX,x); b.maxX=Math.max(b.maxX,x); b.minZ=Math.min(b.minZ,z); b.maxZ=Math.max(b.maxZ,z); }
  };
  for(let i=1;i<parkFrames.length;i++) {
    const a=parkEdgesList[i-1], b=parkEdgesList[i];
    for(const t of [.18,.42,.66,.86,.99]) {
      const pa=lerpPoint(center,a.bank,t), pb=lerpPoint(center,b.bank,t);
      mark(pa[0],pa[2]); mark(pb[0],pb[2]);
    }
    if(a.crossing>0||b.crossing>0) {
      for(const t of [.05,.35,.65,.95]) {
        const ea=lerpPoint(a.bank,offsetVertex(parkFrames[i-1],a.outerWater,WATER_Y),t);
        const eb=lerpPoint(b.bank,offsetVertex(parkFrames[i],b.outerWater,WATER_Y),t);
        mark(ea[0],ea[2]); mark(eb[0],eb[2]);
      }
    }
  }
  return Array.from(cells.values(),({minX,maxX,minZ,maxZ})=>({
    x:(minX+maxX)/2, z:(minZ+maxZ)/2,
    low:[minX-.5,WATER_Y,minZ-.5], high:[maxX+.5,WATER_Y,maxZ+.5]
  }));
})();
function buildParkWorld() {
  terrain.quad([-850,-.18,-620],[850,-.18,-620],[850,-.18,900],[-850,-.18,900],'#96aa73');
  const center=[-7,WATER_Y,168];
  for(let i=1;i<parkFrames.length;i++) {
    const a=parkEdgesList[i-1],b=parkEdgesList[i];
    road.quad(a.left,b.left,b.right,a.right,'#a99a85');
    const rim=(p)=>[p[0],-.003,p[2]];
    if(a.crossing<.99||b.crossing<.99) pavement.quad(rim(a.left),rim(b.left),b.bank,a.bank,'#849b6e');
    water.triangle(center,a.bank,b.bank,'#6caa99');
    if(a.crossing>0||b.crossing>0) {
      const extent=(f,e)=>offsetVertex(f,e.outerWater,WATER_Y);
      water.quad(a.bank,b.bank,extent(parkFrames[i],b),extent(parkFrames[i-1],a),'#6caa99');
    }
  }
  pavement.quad([-21,.027,-26],[21,.027,-26],[21,.027,26],[-21,.027,26],'#c8bcaa');
  parkGateModel();parkBridge();
  const [tx,tz]=parkTower;
  scenery.ellipsoid([tx,-1,tz],[26,14,23],'#678553',18,8);
  parkPagoda(tx,tz,12.9,7);
  buildPavilionWalk();
  lakePavilion(...parkPavilion);
  for(const [x,z,rx,rz,h] of parkHills) {
    scenery.ellipsoid([x,-3,z],[rx,h,rz],'#738e63',12,6);
    const toParkX=120-x, toParkZ=120-z, toParkLen=Math.hypot(toParkX,toParkZ)||1;
    for(let k=0;k<54;k++) {
      const angle=random()*TAU,r=Math.sqrt(random())*.98,w=4+random()*3,hh=3+random()*2;
      const ca=Math.cos(angle), sa=Math.sin(angle);
      if(r>.28 && (ca*toParkX+sa*toParkZ)/toParkLen<-.18) continue;
      const cx=x+ca*r*rx,cz=z+sa*r*rz,cy=-3+h*Math.sqrt(1-r*r);
      foliage.ellipsoid([cx,cy,cz],[w,hh,5.4],k%2?'#65855c':'#779263',6,3);
    }
  }
  // Low-detail city edge and tree belts behind the north entrance.
  for(let i=0;i<36;i++) {
    const x=-280+i*14+random()*7,z=-93-random()*58,h=9+random()*23;
    const w=6+random()*7;
    scenery.box([x,h/2,z],[w,h,9],i%3?'#b7bab0':'#aca998');
    for(let y=3;y<h-1;y+=4) scenery.box([x,y,z+4.54],[w*.83,.76,.16],'#858f89');
  }
  for(let i=0;i<165;i++) {
    const a=TAU*i/165,r=1+random()*.18;
    const x=5+Math.cos(a)*218*r,z=148+Math.sin(a)*211*r;
    const s=3+random()*3;
    const branch=mountainRoadAt(x,z);
    if(!branch||branch.gap>branch.lane.path.width+7)
      foliage.ellipsoid([x,s*.65,z],[s*1.4,s,s*1.18],i%3?'#698658':'#819668',6,3);
  }
  const garden=parkNodes[4];
  for(let i=0;i<4;i++) {
    const x=garden[0]-10-i*3.5,z=garden[1]-10+i*3.2;
    masonry.box([x,1.35,z],[4,2.7,4],'#e0d5b9');
    masonry.tube([x,2.7,z],[x,4.4,z],3.65,1.2,'#637067',4);
  }
  placeTravelSign(12,5,'牌坊广场','站点旅行',Math.PI/2);
  for(const [index,caption] of [[4,'桂海芳丛'],[20,'伏波桥'],[29,'青云塔山脚']]) {
    const f=courseFrame(parkPath,parkPath.rows[index*24].distance-14);
    const [x,,z]=offsetVertex(f,5.4,0);
    // Keep the sign on land outside the bridge approach.
    if(parkHeight(x,z)===0) placeTravelSign(x,z,caption,'青云湖环线',Math.atan2(-f.f[0],-f.f[2]));
  }
  // The grove between the bridge and hill breaks up the tower view.
  // Trunks stay on the landward verge, with wider crowns above the rider.
  for(const [x,z,s] of [[151,94,2.2],[137.5,88.5,2.35],[136,87.8,2.5],[129,82.6,2.0]]) {
    deciduous(x,z,s,0,true);
  }
  for(let d=24;d<parkPath.length-22;d+=7.8) {
    const f=courseFrame(parkPath,d),[x,,z]=f.p;
    if(Math.hypot(x,z)<33||onBridgeAxis(x,z)&&Math.abs(bridgeAxis(x,z))<47) continue;
    const shaded=x<-88||x>35&&z<104, gap=shaded?1:3;
    if(Math.round(d/7.8)%gap===0) {
      const p=offsetVertex(f,parkWidth(x,z)+2.6+random()*2,0);
      if(Math.hypot(p[0]-tx,p[2]-tz)>20&&!mountainRoadAt(p[0],p[2])&&!shundeShortcutAt(p[0],p[2],-2)) {
        if(shaded) deciduous(p[0],p[2],1.05+random()*.35,0,true);
        else palm(p[0],p[2],1.03,true);
      }
    }
    if(Math.round(d/7.8)%6===0) {
      const p=offsetVertex(f,parkWidth(x,z)+1.6,0);
      if(!shundeShortcutAt(p[0],p[2],-2)) bench(p[0],p[2],-Math.atan2(f.f[2],f.f[0]));
    }
    if(shaded&&Math.round(d/7.8)%2===0) {
      const p=offsetVertex(f,-parkWidth(x,z)-1.24,0);
      if(!shundeShortcutAt(p[0],p[2],-2)) deciduous(p[0],p[2],.89,2,true);
    }
  }
  buildMountainWorld();
  buildParkTraffic();
}
function parkShuttleModel(paint) {
  const m=new Shape(), l=3.75, w=1.42;
  m.box([0,.42,0],[l,.34,w],paint);
  m.box([.25,.84,0],[l*.68,.46,w*.84],'#e6dec6');
  m.box([1.48,.76,0],[.52,.36,w*.92],'#4e6d74');
  m.box([-.05,1.80,0],[l*.84,.09,w*.94],'#f2ede0');
  for(const x of [-1.25,1.25]) for(const z of [-.58,.58]) m.box([x,1.18,z],[.08,1.22,.08],'#3c4743');
  for(const x of [-1.18,1.18]) for(const side of [-1,1]) m.tube([x,.26,side*.60],[x,.26,side*.74],.24,.24,'#303837',8);
  for(const x of [-l*.505,l*.505]) for(const side of [-1,1]) m.box([x,.44,side*w*.32],[.06,.10,.20],x<0?'#cf6552':'#ede8bd');
  return m;
}
function buildParkTraffic() {
  const models=['#5c9a79','#d8ad4d','#5e8fb2'].map(parkShuttleModel);
  for(let i=0;i<6;i++) {
    const dir=i%2?1:-1;
    cityVehicles.push({path:parkPath,model:models[i%models.length],direction:dir,
      offset:dir*1.55,start:(i+.25)/6*parkPath.length,speed:6.4+(i%3)*.85,halfL:1.92,halfW:.76});
  }
}
function parkChart(width,height,dpr,compact,event,focus,exploring,cityView) {
  const canvas=document.createElement('canvas');canvas.width=width*dpr;canvas.height=height*dpr;
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
  const pad=compact?8:24;
  const {minX,maxX,minZ,maxZ}=focus?event.extent:parkBounds;
  const centerX=(minX+maxX)/2,centerZ=(minZ+maxZ)/2;
  const k=Math.min((width-2*pad)/(maxX-minX+18),(height-2*pad)/(maxZ-minZ+18));
  const project=([x,,z])=>[width/2+(x-centerX)*k,height/2+(z-centerZ)*k];
  const unproject=(x,y)=>[(x-width/2)/k+centerX,(y-height/2)/k+centerZ];
  const path=(points,closed=true)=>{ctx.beginPath();points.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](...project(p)));if(closed) ctx.closePath();};
  ctx.fillStyle='#304f40';ctx.fillRect(0,0,width,height);
  path(parkEdgesList.map(e=>e.bank));ctx.fillStyle='#477e77';ctx.fill();
  const channel=parkFrames.map((f,i)=>[f,parkEdgesList[i]]).filter(([,e])=>e.crossing>0);
  path([...channel.map(([,e])=>e.bank),...channel.reverse().map(([f,e])=>offsetVertex(f,e.outerWater,0))]);ctx.fill();
  path(parkFrames.map(f=>f.p));ctx.strokeStyle='#e2d5ab';ctx.lineWidth=compact?1.7:3.4;ctx.stroke();
  path(pavilionWalk.rows.map(r=>r.p),false);ctx.strokeStyle='#e2bc89';ctx.lineWidth=compact?1.2:2.2;ctx.stroke();
  for(const [lane,tone] of [[mountainRoads[0],'#e8aa6d'],[mountainRoads[1],'#92cfd0']]) {
    path(lane.path.rows.map(r=>r.p),false);ctx.strokeStyle=tone;ctx.stroke();
  }
  if(!compact) {
    ctx.save();
    ctx.setLineDash([4,4]);ctx.lineWidth=1.8;ctx.strokeStyle='#ff9a52';
    for(const cut of shundeHighRiskShortcuts) {
      path(cut.points.map(([x,z])=>[x,0,z]),false);ctx.stroke();
    }
    ctx.restore();
  }
  if(!exploring||focus) {
    path(event.path.rows.map(r=>r.p),false);ctx.strokeStyle='#fff0b0';ctx.lineWidth=compact?2:4.4;ctx.stroke();
  }
  travelPin(ctx,project,'shunde',compact);
  if(!compact) {
    ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.fillStyle='#eafaec';
    for(const [x,z,label] of [[-104,58,'桂海芳丛'],[-28,175,'青云湖'],[153,186,'伏波桥'],[...parkTower,'青云塔'],[...parkPavilion,'湖心亭'],
      [322,150,'上山 · 林荫折返'],[311,-28,'下山 · 碎石连弯'],[430,103,'神步山观景台']]) {
      const [sx,sy]=project([x,0,z]);ctx.fillText(label,sx,sy-9);
    }
  }
  return {canvas,width,height,dpr,event,focus,exploring,cityView,project,unproject};
}

