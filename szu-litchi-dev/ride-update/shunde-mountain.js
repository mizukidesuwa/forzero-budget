// The two branches meet at the summit and use different lakeside junctions.
const mountainUp=street([parkNodes[26],[148,81],[166,65],[194,49],[224,33],[252,32],
  [281,43],[312,68],[331,89],[327,107],[306,112],[279,100],[260,103],[258,122],
  [282,143],[315,156],[350,159],[367,145],[383,129],[408,112],[430,103]],3.65);
const mountainDown=street([[430,103],[451,92],[457,73],[447,54],[410,35],[377,16],
  [356,-1],[330,-13],[300,-12],[272,1],[244,6],[214,-9],[180,-30],[143,-48],
  [111,-45],[83,-15],[66,8],parkNodes[34]],4.15);
const mountainRoads=[
  {path:mountainUp, profile:[[0,0],[38,0],[100,4],[178,10],[217,11.7],[290,17.5],
    [333,19.2],[408,26],[483,33.2],[mountainUp.length-18,34],[mountainUp.length,34]],
    gravel:[[138,205],[269,355]], color:'#4b513e'},
  {path:mountainDown, profile:[[0,34],[22,34],[87,31],[150,25],[211,20],
    [263,17],[325,10],[385,4],[mountainDown.length-43,0],[mountainDown.length,0]],
    gravel:[[122,202],[278,328]], color:'#4d5647'}
];
const mountainRoadByPath=new Map(mountainRoads.map(lane=>[lane.path,lane]));
const mountainIndex=indexStreets(mountainRoads.map(lane=>lane.path));

function mountainRoadAt(x,z,fitWidth=false) {
  let best=null,bestScore=Infinity;
  for(const segment of mountainIndex.get(streetCell(x,z))??[]) {
    const dx=x-segment.x,dz=z-segment.z;
    const t=clamp((dx*segment.dx+dz*segment.dz)*segment.ratio,0,1);
    const gap=(dx-segment.dx*t)**2+(dz-segment.dz*t)**2;
    const score=fitWidth?Math.sqrt(gap)-segment.path.width:gap;
    if(score>=bestScore) continue;
    bestScore=score;best={segment,t,gap};
  }
  if(!best) return null;
  const {segment:{path,row},t,gap}=best;
  return {lane:mountainRoadByPath.get(path),distance:mix(path.rows[row-1].distance,path.rows[row].distance,t),
    gap:Math.sqrt(gap)};
}

function mountainProfile(lane,d) {
  const keys=lane.profile;
  for(let i=1;i<keys.length;i++) {
    const [to,high]=keys[i];
    if(d>to) continue;
    const [from,low]=keys[i-1], u=clamp((d-from)/(to-from),0,1);
    // Blend endpoint grades over the first and last 18% of each section.
    const blend=.18;
    const weight=u<blend ? u*u/(2*blend) :
      u>1-blend ? 1-blend-(1-u)**2/(2*blend) : u-blend/2;
    return mix(low,high,weight/(1-blend));
  }
  return keys.at(-1)[1];
}
const mountainIsGravel=(lane,d)=>lane.gravel.some(([from,to])=>d>=from&&d<to);
function mountainBase(x,z) {
  const r=((x-353)/196)**2+((z-76)/151)**2;
  return 31*Math.max(0,1-r)**1.55*clamp((x-195)/53,0,1);
}
const shundeHighRiskShortcuts=[
  {
    name:'牌坊东弯窄切线',
    firm:true,
    width:1.65,
    points:[[34.0,39.5],[38.2,27.5],[40.2,16.0],[39.6,5.2]],
    posts:[[36.7,27.8],[39.7,27.2],[38.7,16.0],[41.7,16.0]]
  },
  {
    name:'神步山林间土坡捷径',
    firm:false,
    width:1.65,
    points:[[328.5,105.0],[313.0,106.5],[294.0,106.8],[274.5,107.2],[258.5,107.7]],
    profile:[14.65,19.10],
    posts:[[313.2,105.0],[312.8,108.0],[274.7,105.7],[274.3,108.7]]
  },
  {
    name:'下山坡脚林荫斜切线',
    firm:true,
    width:1.65,
    points:[[130.1,-49.6],[112.5,-36.5],[96.5,-22.0],[76.8,-6.2]],
    profile:[2.77,0],
    posts:[[113.5,-35.3],[111.5,-37.7],[97.5,-20.8],[95.5,-23.2]]
  }
];
for(const cut of shundeHighRiskShortcuts) {
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity,total=0;
  const segs=[];
  for(let i=0;i<cut.points.length;i++) {
    const [px,pz]=cut.points[i];
    if(px<minX)minX=px; if(px>maxX)maxX=px; if(pz<minZ)minZ=pz; if(pz>maxZ)maxZ=pz;
    if(i>0) {
      const [ax,az]=cut.points[i-1], dx=px-ax, dz=pz-az, len2=dx*dx+dz*dz, len=Math.sqrt(len2)||1;
      segs.push({ax,az,dx,dz,len,invLen2:len2>0?1/len2:0,acc:total});
      total+=len;
    }
  }
  cut._segs=segs; cut._total=total||1;
  cut._bounds={minX:minX-12,maxX:maxX+12,minZ:minZ-12,maxZ:maxZ+12};
}
function shundeShortcutSample(x,z) {
  let bestCut=null, bestD2=Infinity, bestU=0;
  for(const cut of shundeHighRiskShortcuts) {
    const b=cut._bounds;
    if(x<b.minX||x>b.maxX||z<b.minZ||z>b.maxZ) continue;
    for(const s of cut._segs) {
      const t=clamp(((x-s.ax)*s.dx+(z-s.az)*s.dz)*s.invLen2,0,1);
      const ox=x-(s.ax+s.dx*t), oz=z-(s.az+s.dz*t), d2=ox*ox+oz*oz;
      if(d2<bestD2) { bestD2=d2; bestCut=cut; bestU=(s.acc+s.len*t)/cut._total; }
    }
  }
  return bestCut ? {cut:bestCut,gap:Math.sqrt(bestD2),u:bestU} : null;
}
function shundeShortcutAt(x,z,margin=0) {
  const hit=shundeShortcutSample(x,z);
  return hit&&hit.gap<=hit.cut.width*.5-margin?hit.cut:null;
}

function mountainHeight(x,z) {
  const base=mountainBase(x,z), near=mountainRoadAt(x,z);
  let roadH=base;
  if(near) {
    const {lane,distance,gap}=near, edge=lane.path.width;
    // indexStreets exposes candidates out to width + 7.5; finish blending inside that bound.
    const w=clamp((gap-edge-4.2)/2.8,0,1);
    roadH=mix(mountainProfile(lane,distance),base,w*w*(3-2*w));
  }
  const rw=near?clamp((near.gap-near.lane.path.width-4.2)/2.2,0,1):1;
  if(rw>0) {
    const sc=shundeShortcutSample(x,z);
    if(sc?.cut.profile&&sc.gap<=sc.cut.width*.5+7.5) {
      const sh=mix(sc.cut.profile[0],sc.cut.profile[1],sc.u);
      const sw=clamp((sc.gap-sc.cut.width*.5-2.0)/5.5,0,1);
      return mix(roadH,mix(sh,base,sw*sw*(3-2*sw)),rw);
    }
  }
  return roadH;
}
function mountainGrade(x,z,dx,dz) {
  return mountainHeight(x+dx*.5,z+dz*.5)-mountainHeight(x-dx*.5,z-dz*.5);
}
function makeMountainCourse(index,id,name,description,from,to,checks) {
  const lane=mountainRoads[index], distances=[from,...checks.map(([d])=>d),to];
  const path=joinTrack([{path:lane.path,start:from,end:to}],[]);
  const labels=checks.map(([,label])=>label);
  const spec=distances.map((d,i)=>[i===distances.length-1?path.length:d-from,
    i===0?(index===0?'伏波桥侧坡脚':'神步山观景台'):
      labels[i-1]??(index===0?'神步山观景台':'牌坊侧坡脚'),lane.path.width-.30]);
  const event=makeCourse(id,name,description,path,spec,path.length,{
    absolute:true,campus:'shunde',thresholds:[.965,1.12,1.32]});
  const profile=[];
  let gain=0,loss=0,previous=null;
  for(const {distance,p:[x,,z]} of path.rows) {
    const h=mountainHeight(x,z);
    if(previous!==null) {gain+=Math.max(0,h-previous);loss+=Math.max(0,previous-h);}
    profile.push([distance,h]);previous=h;
  }
  return Object.assign(event,{elevation:{profile,gain,loss}});
}
const mountainCourses=[
  makeMountainCourse(0,'shenbu-climb','神步山爬坡赛','从伏波桥侧上山，稳踩林荫碎石坡，过两组折返弯，在观景台冲线。',
    26,mountainUp.length-9,[[104,'林荫缓坡'],[177,'碎石长坡'],[246,'山腰短平台'],[343,'林中折返'],[444,'山脊直坡']]),
  makeMountainCourse(1,'shenbu-descent','神步山下坡赛','从观景台下山，过宽弯提速，提前为碎石连弯刹车，最后在接回湖岸前冲线。',
    13,mountainDown.length-19,[[86,'山脊宽弯'],[159,'碎石收速区'],[236,'林间出弯'],[308,'连续碎石弯'],[399,'坡脚减速线']])
];

function makeParkEnduranceCourse() {
  const starts=[], d26=parkPath.rows[26*24].distance, d34=parkPath.rows[34*24].distance;
  const path=joinTrack([
    {path:parkPath,start:0,end:d26},
    {path:mountainUp,start:0,end:mountainUp.length},
    {path:mountainDown,start:0,end:mountainDown.length},
    {path:parkPath,start:d34,end:parkPath.length}
  ],starts);
  const upBase=path.rows[starts[1]].distance, dnBase=path.rows[starts[2]].distance;
  const spec=[
    [0,'顺峰山公园牌坊',3.91],
    [parkPath.rows[4*24].distance,'桂海芳丛',3.91],
    [parkPath.rows[9*24].distance,'西岸林荫',3.91],
    [parkPath.rows[21*24].distance,'伏波桥',3.11],
    [upBase+26,'伏波桥北进山',3.35],
    [upBase+340,'林中折返',3.35],
    [dnBase+9,'神步山观景台',3.85],
    [dnBase+304,'下山碎石弯',3.85],
    [path.length,'牌坊冲线',3.91]
  ];
  const event=makeCourse('shunde-endurance','顺峰山环山耐力赛',
    '从牌坊出发经青云湖与九孔伏波桥，进山攀登神步山观景台再高速下山冲回牌坊，串联平路巡航、爬坡与碎石控车（也可尝试高风险窄切捷径）。',
    path,spec,path.length,{absolute:true,campus:'shunde',thresholds:[.965,1.12,1.30]});
  const profile=[];
  let gain=0,loss=0,previous=null;
  for(const {distance,p:[x,,z]} of path.rows) {
    const h=parkHeight(x,z);
    if(previous!==null) {gain+=Math.max(0,h-previous);loss+=Math.max(0,previous-h);}
    profile.push([distance,h]);previous=h;
  }
  return Object.assign(event,{elevation:{profile,gain,loss}});
}
const parkEnduranceCourse=makeParkEnduranceCourse();

function buildMountainWorld() {
  // A single tiled heightfield sits under both road ribbons, indexed meshes and collision.
  const step=4, rows=[];
  for(let z=-92;z<=232;z+=step) {
    const row=[];
    for(let x=30;x<=542;x+=step) row.push([x,mountainHeight(x,z)-.185,z]);
    rows.push(row);
  }
  for(let j=1;j<rows.length;j++) for(let i=1;i<rows[j].length;i++) {
    const a=rows[j-1][i-1],b=rows[j][i-1],c=rows[j][i],d=rows[j-1][i];
    if(Math.max(a[1],b[1],c[1],d[1])<=-.18) continue;
    const n=normalize(cross(subtract(b,a),subtract(d,a)));
    // Short triangles follow cuts along the road benches and slopes below them.
    scenery.quad(a,b,c,d,n[1]<.85?'#7e865c':'#82965e',n);
  }

  const stone='#c7bd9c', wood='#7d6850';
  for(const lane of mountainRoads) {
    const {path}=lane, w=path.width;
    const edge=(d,s,y)=>{
      const f=courseFrame(path,d), p=offsetVertex(f,s,y);
      p[1]+=mountainHeight(p[0],p[2]);
      return p;
    };
    const crown=(d)=>mountainIsGravel(lane,d)?-.013:ROAD_Y+.003;
    const stations=Array.from({length:Math.ceil(path.length/1.1)+1},(_,i)=>Math.min(i*1.1,path.length));
    stations.push(...lane.gravel.flat());
    stations.sort((a,b)=>a-b);
    for(let i=1;i<stations.length;i++) {
      const a=stations[i-1],b=stations[i], d=(a+b)/2;
      if(b-a<.0001) continue;
      const gravel=mountainIsGravel(lane,d), y=crown(d), leftA=edge(a,-w,y),leftB=edge(b,-w,y);
      const rightA=edge(a,w,y),rightB=edge(b,w,y);
      const normal=normalize(cross(subtract(leftB,leftA),subtract(rightA,leftA)));
      const col=gravel?(Math.floor(d/3)%3===0?'#ac956b':'#a58b62'):lane.color;
      road.quad(leftA,leftB,rightB,rightA,col,normal[1]<0?scale(normal,-1):normal);
      if(gravel&&(i&1)) {
        for(const s of [-w+.32,w-.32]) scenery.box(edge(d,s,.013),[.12,.08,.20],(i>>1)%2?'#7f765d':'#c7af80');
      }
    }
    // Rails guide the sharp turns and line the exposed downhill approach.
    const railZones=lane===mountainRoads[0]?[[186,239],[278,345],[455,path.length-11]]:[[19,70],[113,194],[273,316]];
    for(const [from,to] of railZones) {
      for(let d=from;d<=to-3.1;d+=3.1) for(const s of [-w,w]) {
        const low=edge(d,s,.025), high=edge(d,s,.73), next=edge(d+3.1,s,.73);
        if(shundeShortcutAt(low[0],low[2],-1.45)||shundeShortcutAt(next[0],next[2],-1.45)) continue;
        scenery.box([low[0],(low[1]+high[1])/2,low[2]],[.15,.86,.15],wood);
        scenery.tube(high,next,.09,.09,wood,5);
      }
    }
    for(let d=25;d<path.length-18;d+=7.3) {
      const f=courseFrame(path,d), side=(Math.round(d/7.3)%3)?1:-1;
      const t=offsetVertex(f,side*(w+4.5+random()*5),0);
      plantMountainTree(t[0],t[2],2.7+random()*3.3);
    }
  }
  for(let i=0;i<620;i++) {
    const x=105+random()*435,z=-82+random()*288,s=2.8+random()*4;
    if(mountainBase(x,z)>1.0) plantMountainTree(x,z,s);
  }

  for(const [lane,d,label] of [[mountainRoads[0],15,'神步山爬坡'],[mountainRoads[1],mountainDown.length-13,'神步山下坡道'],
    [mountainRoads[0],mountainUp.length-15,'神步山观景台'],[mountainRoads[1],105,'碎石连弯 · 提前刹车']]) {
    const f=courseFrame(lane.path,d), [x,,z]=offsetVertex(f,lane.path.width+.85,0);
    const start=scenery.vertices.length;
    const labels=signs.length;
    placeTravelSign(x,z,label,'顺峰山公园',Math.atan2(-f.f[0],-f.f[2]));
    const dy=mountainHeight(x,z);
    for(let i=start+1;i<scenery.vertices.length;i+=11) scenery.vertices[i]+=dy;
    for(const {shape} of signs.slice(labels)) for(let i=1;i<shape.vertices.length;i+=11) shape.vertices[i]+=dy;
  }
  // A pavilion outside the riding line identifies the crest from both sides.
  const f=courseFrame(mountainUp,mountainUp.length-7);
  const [x,,z]=offsetVertex(f,9,0), y=mountainHeight(x,z);
  masonry.tube([x,y-.7,z],[x,y+.1,z],4.6,4.6,stone,8);
  for(const dx of [-2.2,2.2]) for(const dz of [-2.2,2.2]) {
    masonry.box([x+dx,y+1.65,z+dz],[.28,3.4,.28],'#995743');
  }
  masonry.tube([x,y+3.3,z],[x,y+4.9,z],4.6,1.3,'#455d54',8);
  buildShundeShortcutVisuals();
}
function buildShundeShortcutVisuals() {
  for(const cut of shundeHighRiskShortcuts) {
    const strip=street(cut.points,cut.width), half=cut.width*.5, step=1.4;
    const sample=(d,s)=>{
      const f=courseFrame(strip,d), p=offsetVertex(f,s,ROAD_Y+(cut.firm?.005:.003));
      p[1]+=parkHeight(p[0],p[2]);
      return p;
    };
    const count=Math.max(4,Math.ceil(strip.length/step));
    for(let i=1;i<=count;i++) {
      const a=(i-1)*strip.length/count, b=i*strip.length/count;
      const la=sample(a,-half), lb=sample(b,-half), rb=sample(b,half), ra=sample(a,half);
      const normal=normalize(cross(subtract(lb,la),subtract(ra,la)));
      const col=cut.firm?'#8f8978':(i%2?'#b49768':'#a88a5d');
      road.quad(la,lb,rb,ra,col,normal[1]<0?scale(normal,-1):normal);
    }
    for(const [px,pz] of cut.posts) {
      const h=parkHeight(px,pz);
      campusFixtures.push({name:cut.name+'护桩',x:px,z:pz,w:.60,depth:.60,height:h+1.05,yaw:0,c:1,s:0});
      masonry.box([px,h+.46,pz],[.50,.92,.50],cut.firm?'#b6a88d':'#7d6850');
      masonry.box([px,h+.96,pz],[.56,.12,.56],'#d96b43');
    }
  }
}
function plantMountainTree(x,z,height) {
  const near=mountainRoadAt(x,z);
  if(near&&near.gap<near.lane.path.width+2.8) return;
  if(x<194&&parkPaved(x,z,-4)) return;
  if(shundeShortcutAt(x,z,-2.2)) return;
  const y=mountainHeight(x,z), roadside=near&&near.gap<15;
  foliage.ellipsoid([x,y+height*.73,z],[height*.52,height*.47,height*.51],
    height>5?'#4f7245':'#668248',roadside?7:6,roadside?4:3);
  if(roadside||!near||height>=4.5) scenery.tube([x,y-.13,z],[x,y+height*.73,z],.15,.07,'#756750',4,false);
}
