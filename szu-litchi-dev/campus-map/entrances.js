function entranceFrame({xy,facing}) {
  const frame=campusFootprint(xy[0],xy[1],0,0,Math.atan2(facing[0],facing[2]));
  const p=(u,y,v)=>lotPoint(frame,u,y,v);
  const box=(u,y,v,w,h,d,color,mesh=scenery)=>lotBox(frame,u,y,v,w,h,d,color,mesh);
  const solid=(u,v,w,d,h,padding=0)=>campusFixtures.push(lotPart(frame,u,v,w+padding,d+padding,h));
  return {frame,p,box,solid,yaw:frame.yaw};
}

function tiledGatehouse(frame,u,v,mirror) {
  const {p,box,solid}=frame, wide=3.0, deep=2.43, sections=28;
  const tile=['#e3e1d7','#deded6','#eeebe2','#dedbd2'];
  const edge=(a,y,r=1)=>p(u+wide*r*Math.cos(a),y,v+deep*r*Math.sin(a));
  const at=(a,y)=>edge(a,y,y<2.2?1:1.04);
  for(let i=0;i<sections;i++) {
    const a=i*TAU/sections, b=(i+1)*TAU/sections, mid=(a+b)/2;
    const n=[frame.frame.c*Math.cos(mid)+frame.frame.s*Math.sin(mid),0,
      -frame.frame.s*Math.cos(mid)+frame.frame.c*Math.sin(mid)];
    scenery.quad(at(a,.15),at(b,.15),at(b,.68),at(a,.68),'#b7b8ac',n);
    const window=Math.cos(mid)*mirror < .10 || Math.sin(mid) < -.74;
    for(let row=0;row<4;row++) {
      const low=.69+row*.355, high=low+.341;
      scenery.quad(at(a,low),at(b,low),at(b,high),at(a,high),window?'#536b70':tile[(i+row)%4],n);
    }
    if (window && i%2===0) scenery.tube(at(a,.68),at(a,2.10),.024,.024,'#a4aea9',4,false);
    scenery.quad(edge(a,2.11,1.08),edge(b,2.11,1.08),edge(b,2.63,1.055),edge(a,2.63,1.055),tile[i%4],n);
    scenery.triangle(p(u,2.63,v),edge(a,2.63,1.055),edge(b,2.63,1.055),'#c9c9be');
    scenery.quad(edge(a,2.63,1.054),edge(b,2.63,1.054),edge(b,2.76,1.072),edge(a,2.76,1.072),'#f0eee3',n);
    scenery.triangle(p(u,2.76,v),edge(a,2.76,1.072),edge(b,2.76,1.072),'#d9dacd');
  }
  box(u+mirror*2.98,1.35,v-.69,3.17,2.70,3.32,'#dedfd6');
  box(u+mirror*2.97,2.72,v-.76,3.43,.18,3.47,'#efeee3');
  solid(u,v,5.42,3.98,2.76);
  solid(u+mirror*3.02,v-.69,3.15,3.32,2.80);
}

function lideGate(gate) {
  const f=entranceFrame(gate), {p,box,solid,yaw}=f;
  box(0,.009,4.40,27.5,.043,15.8,'#c4c1b4',pavement);
  const median=lotPart(f.frame,-.03,4.03,3.47,8.04,.12);
  scenery.ellipsoid(lotPoint(median,0,.025,0),[1.74,.105,4.02],'#849951',24,4,0,yaw);
  box(-.02,.16,3.53,3.28,.29,1.74,'#b0b3a8');
  box(-.02,.65,3.70,3.10,.84,.75,'#7b827c');
  box(-.02,1.08,3.71,3.18,.093,.84,'#a5aaa1');
  solid(-.02,3.68,3.20,1.53,1.13);
  const title=namedSign('深圳大学','SHENZHEN UNIVERSITY','#858983','#252e2c');
  plate(title,p(-.02,.66,4.085),2.99,.72,yaw);
  plate(title,p(-.02,.66,3.311),2.99,.72,yaw+Math.PI);
  for(const s of [-1,1]) {
    tiledGatehouse(f,s*10.05,8.75,s);
    box(s*13.05,.48,10.95,5.6,.94,1.27,'#b5b8ab');
    box(s*13.05,.95,10.97,5.8,.15,1.43,'#deded1');
    solid(s*13.05,10.95,5.7,1.32,1.05);
    for(let i=0;i<5;i++) foliage.ellipsoid(p(s*(7.45+i*1.28),.49,11.97),[.74,.56,.60],
      i%2?'#718e54':'#789556',8,4);
    for(let i=0;i<6;i++) box(s*5.1,.039,6.30+.49*i,2.45,.014,.19,'#e3e0cc',masonry);
  }
  const name=namedSign('立德门','粤海校区','#e1e0d5','#4b554d');
  plate(name,p(12.85,1.35,9.76),2.49,.62,yaw);
}

function gateBooth(gate,u,v,w,d,skin,glass) {
  const {box,solid}=gate;
  box(u,.24,v,w,.48,d,skin);
  box(u,1.34,v,w-.16,1.76,d-.15,glass);
  box(u,2.29,v,w+.25,.25,d+.25,skin);
  for(const a of [-1,1]) for(const b of [-1,1])
    box(u+a*(w-.13)/2,1.35,v+b*(d-.13)/2,.084,1.91,.080,skin);
  for(let i=-1;i<=1;i++) box(u+i*w*.24,1.34,v+d*.473,.057,1.8,.040,skin);
  solid(u,v,w,d,2.44);
}

function foldedRoof({p},profile,front,back) {
  for(let i=1;i<profile.length;i++) {
    const [a,ha]=profile[i-1], [b,hb]=profile[i];
    const low=.23, slope=.45;
    const af=p(a,ha,front), bf=p(b,hb,front), ar=p(a,ha+slope,back), br=p(b,hb+slope,back);
    const under=vertex=>add(vertex,[0,-low,0]);
    const n=normalize(cross(subtract(bf,af),subtract(ar,af)));
    scenery.quad(af,bf,br,ar,i%2?'#c9d4d3':'#a4b5b6',n);
    scenery.quad(under(bf),under(af),under(ar),under(br),'#728587',scale(n,-1));
    scenery.quad(af,bf,under(bf),under(af),'#8a9c9c',normalize(cross(subtract(bf,af),[0,1,0])));
    scenery.quad(br,ar,under(ar),under(br),'#90a2a1',normalize(cross(subtract(ar,br),[0,1,0])));
  }
}

function ligongGate(gate) {
  const f=entranceFrame(gate), {p,box,yaw}=f;
  box(0,.009,1.54,20,.043,11.45,'#bebeb3',pavement);
  for(const s of [-1,1]) {
    gateBooth(f,s*6.57,-.42,3.27,3.18,'#d2d7d2','#5b7e83');
    for(const d of [-1.45,1.14]) {
      scenery.tube(p(s*5.82,.15,d),p(s*6.69,4.30,d),.097,.085,'#839493',6);
      scenery.tube(p(s*7.72,1.1,d),p(s*6.65,4.33,d),.068,.067,'#9aabaa',6);
    }
  }
  foldedRoof(f,[[-9.9,4.52],[-5.75,4.11],[-1.35,4.76],[3.05,4.28],[9.88,4.65]],1.52,-2.47);
  const sign=namedSign('深圳大学','立功门','#cbd3ce','#374a4b');
  plate(sign,p(6.57,1.77,1.14),3.02,.65,yaw);
  plate(sign,p(-6.57,1.77,-1.948),3.02,.65,yaw+Math.PI);
}

function liyanGate(gate) {
  const f=entranceFrame(gate), {p,box,yaw}=f;
  box(0,.01,0,15.2,.040,9.1,'#bdbbb0',pavement);
  for(const s of [-1,1]) gateBooth(f,s*5.58,-.83,2.60,3.10,'#b7b0a1','#5f7778');
  box(0,3.66,-.86,13.3,.41,3.47,'#a5aaa3');
  box(0,3.88,-.86,13.57,.14,3.67,'#d9d9ce');
  const sign=namedSign('立言门','','#b8beb5','#3d4e49');
  plate(sign,p(0,3.69,.886),4.19,.43,yaw);
}

function sideGate(gate) {
  const f=entranceFrame(gate), {p,box,solid,yaw}=f;
  const stone=gate.name==='立业门'?'#b7a892':'#c6c9c0';
  box(0,.009,.26,14.4,.040,7.24,'#bfbeb1',pavement);
  gateBooth(f,-5.8,-.71,2.72,2.99,stone,'#526d73');
  box(5.79,.87,.43,2.12,1.74,1.47,stone);
  box(5.79,1.80,.43,2.28,.14,1.61,'#deded2');
  solid(5.79,.43,2.12,1.47,1.87);
  for(const s of [-1,1]) {
    box(s*8.26,.58,0,2.59,1.16,.79,stone);
    solid(s*8.26,0,2.59,.79,1.16);
  }
  const sign=namedSign(gate.name,'深圳大学',stone,'#424c48');
  plate(sign,p(5.79,1.08,1.17),2.02,.68,yaw);
  plate(sign,p(5.79,1.08,-.312),2.02,.68,yaw+Math.PI);
}

function schoolGate(gate) {
  if(gate.name==='立德门') lideGate(gate);
  else if(gate.name==='立功门') ligongGate(gate);
  else if(gate.name==='立言门') liyanGate(gate);
  else sideGate(gate);
}
