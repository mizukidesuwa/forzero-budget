// Street-level west gate and the planted approach, referenced against the Yuehai campus photographs.
function westGateWing(f,side) {
  const {p,box,solid}=f;
  // A rounded inner end sweeps into a longer curved tile wall along the boundary.
  const profile=[];
  for(let i=0;i<=10;i++) {
    const a=(.5+i/10)*Math.PI;
    profile.push([9.71+2.03*Math.cos(a),7.85+1.67*Math.sin(a)]);
  }
  profile.push([12.40,6.10],[15.05,5.64],[17.00,4.64],[17.34,5.60],
    [15.12,7.40],[12.58,8.94]);
  function skin(scaleAt,low,high,shade) {
    const center=p(side*11.35,high,7.35);
    for(let i=0;i<profile.length;i++) {
      const a=profile[i],b=profile[(i+1)%profile.length];
      const point=([u,v],height)=>p(side*(11.35+(u-11.35)*scaleAt),height,7.35+(v-7.35)*scaleAt);
      const l=point(a,low),r=point(b,low),top=point(b,high),end=point(a,high);
      const n=normalize(scale(cross(subtract(r,l),UP),-side));
      scenery.quad(l,r,top,end,shade,n);
      if(high>=3.25) scenery.triangle(center,end,top,'#dadbd6');
    }
  }
  skin(.98,.04,.47,'#a7a8a0');
  skin(1,.47,3.20,'#e9e9e4');
  for(const y of [.94,1.42,1.9,2.38,2.86]) skin(1.002,y,y+.028,'#c9ccc6');
  skin(1.017,3.20,3.35,'#f7f5ec');
  box(side*11.1,.69,5.79,4.08,1.33,1.07,'#bcbbb0');
  box(side*11.1,1.40,5.79,4.23,.16,1.18,'#e7e7dc');
  solid(side*9.64,7.85,3.73,2.9,3.35);
  solid(side*12.26,7.52,2.90,2.22,3.35);
  solid(side*15.08,6.59,3.55,1.62,3.35);
  // The guard booth sits back on the campus side of the white wall.
  gateBooth(f,side*10.13,4.30,2.45,2.22,'#c8c9c1','#58696a');
  for(let i=0;i<5;i++) box(side*5.01,.039,6.24+.5*i,2.38,.013,.17,'#dedbc7',masonry);
}

function gatePalm(f,u,v,h) {
  const {p,solid}=f,root=p(u,0,v),top=p(u+.18,h,v-.15);
  scenery.tube(root,top,.14,.087,'#8e8271',8);
  for(let i=0;i<13;i++) {
    const a=i*2.39996,len=1.65+.22*(i%4);
    const frond=(t,off)=>p(u+.18+Math.cos(a)*len*t-Math.sin(a)*off,
      h+.8*Math.sin(t*Math.PI)-.46*t*t,v-.15+Math.sin(a)*len*t+Math.cos(a)*off);
    for(let j=0;j<5;j++) {
      const t=j/5,next=(j+1)/5,wide=.24*Math.sin(Math.PI*(next-.08));
      const tip=frond(next,0),base=frond(t,0);
      for(const side of [-1,1]) foliage.triangle(base,tip,frond((t+next)/2,wide*side),
        (i+j)%3?'#557d45':'#79964e',[.07,.96,.16]);
    }
  }
  solid(u,v,.30,.30,h);
}

function lideGate(gate) {
  const f=entranceFrame(gate),{p,box,solid,yaw}=f;
  box(0,.009,4.40,27.5,.043,15.8,'#c4c1b4',pavement);
  lawnPatch(scenery,()=>scenery.ellipsoid(p(0,.026,4.27),[1.85,.105,4.04],'#83a34e',26,4,0,yaw));
  box(0,.22,3.66,3.64,.30,1.75,'#aaa59a');
  box(0,.41,3.66,3.44,.13,1.38,'#855745');
  box(0,1.14,3.68,3.36,1.37,.84,'#a36c58');
  box(0,1.85,3.68,3.40,.075,.87,'#b28069');
  solid(0,3.66,3.62,1.67,1.90);
  const name=signCanvas(768,250,(ctx,w,h)=>{
    ctx.fillStyle='#a66e57';ctx.fillRect(0,0,w,h);
    const grain=randomSource(1983);
    for(let i=0;i<5200;i++){
      ctx.fillStyle=i%3?'rgba(66,39,31,.14)':'rgba(245,219,192,.29)';
      ctx.fillRect(grain()*w,grain()*h,1+grain()*2.6,1+grain()*1.4);
    }
    ctx.fillStyle='#272620';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font='bold 140px KaiTi, STKaiti, FangSong, "Noto Serif CJK SC", serif';
    ctx.fillText('深圳大学',w*.5,h*.50);
  });
  plate(name,p(0,1.15,4.114),3.28,1.25,yaw);
  plate(name,p(0,1.15,3.246),3.28,1.25,yaw+Math.PI);
  for(const side of [-1,1]) {
    westGateWing(f,side);
    gatePalm(f,side*10.85,2.38,4.25);
    gatePalm(f,side*14.35,3.26,4.85);
    for(let j=0;j<4;j++) {
      const u=side*(8.8+j*1.62),v=10.22-j*.49;
      foliage.ellipsoid(p(u,.33,v),[.99,.36,.51],j%2?'#849e54':'#739452',8,4,0,yaw);
    }
  }
  const label=namedSign('立德门','','#e8e9e3','#724941');
  plate(label,p(11.01,1.90,9.37),1.42,.39,yaw);
}

function sundialGarden(court) {
  // Shenzhen University Facilities Department, Campus Walk, 2023: sundial lawn on the west entrance axis.
  const lot=campusFootprint(court.xy[0]-5.05,court.xy[1],9.6,6.45);
  lotBox(lot,0,.01,0,lot.w+1.0,.040,lot.depth+1.0,'#c7c1b2',pavement);
  lawnPatch(scenery,()=>lotBox(lot,0,.039,0,lot.w,.038,lot.depth,'#84a35d',scenery));
  const pos=(x,y,z)=>lotPoint(lot,x,y,z);
  scenery.tube(pos(0,.06,0),pos(0,.25,0),1.61,1.61,'#b8b9b1',32);
  scenery.tube(pos(0,.25,0),pos(0,.43,0),.91,.86,'#a0a6a0',32);
  scenery.ellipsoid(pos(0,1.00,.67),[.90,.82,.87],'#909c99',28,12);
  const center=pos(0,1.84,-.03),tilt=22.53*Math.PI/180;
  const axis=[0,Math.sin(tilt),-Math.cos(tilt)],upInPlane=[0,Math.cos(tilt),Math.sin(tilt)];
  const mark=(a,r,offset)=>add(add(center,scale(axis,offset)),[Math.cos(a)*r,
    Math.sin(a)*r*upInPlane[1],Math.sin(a)*r*upInPlane[2]]);
  scenery.tube(add(center,scale(axis,-.095)),add(center,scale(axis,.095)),1.50,1.50,'#b8bfba',48);
  for(let i=0;i<48;i++) {
    const a=i*TAU/48,length=i%4?.12:.26;
    scenery.quad(mark(a-.007,1.40,.101),mark(a+.007,1.40,.101),
      mark(a+.007,1.40-length,.101),mark(a-.007,1.40-length,.101),'#6a6c5a',axis);
  }
  scenery.tube(add(center,scale(axis,-.32)),add(center,scale(axis,2.12)),.079,.017,'#555e5d',9);
  campusFixtures.push(lotPart(lot,0,0,2.74,2.08,3.12));
}
