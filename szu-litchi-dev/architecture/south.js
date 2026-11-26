function huizhiBuilding(block) {
  const [entry,reading,annex]=block.parts, white='#efeee5', shadow='#bfc1b9';
  const h=entry.height, base=4.10, wallDepth=.45;
  const inner=lotPart(entry,0,.76,entry.w-1.60,entry.depth-1.68,h-.43);
  lotBox(inner,0,inner.height/2,0,inner.w,inner.height,inner.depth,'#c4ccc7');
  for(let side=0;side<4;side++) {
    const back=facadeOf(inner,side);
    for(let i=0;i<5;i++) glazing(back,1.13+2.25*i,Math.ceil(back.width/1.7),'#476770',1.47);
  }
  // Rays through the oculi reach glazing set behind the white concrete screen.
  // Square cells share their boundaries. The inner reveal has actual depth.
  function screen(side,rows) {
    const face=facadeOf(entry,side), cols=rows[0].length;
    const cw=face.width/cols, ch=(h-base)/rows.length;
    for(let row=0;row<rows.length;row++) for(let col=0;col<cols;col++) {
      const u=(col+.5-cols/2)*cw,y=base+(row+.5)*ch;
      const r=rows[row][col]*Math.min(cw,ch);
      if(r===0) { face.panel(u,y,cw,ch,white,0); continue; }
      for(let i=0;i<24;i++) {
        const sidePoint=(index,rim,v)=>{
          const a=(index/24+.125)*TAU, x=Math.cos(a), dy=Math.sin(a);
          const k=Math.max(Math.abs(x),Math.abs(dy));
          return face.point(u+(rim?x*r:x*cw/(2*k)),y+(rim?dy*r:dy*ch/(2*k)),v);
        };
        const a=sidePoint(i,true,0),b=sidePoint(i+1,true,0);
        masonry.quad(sidePoint(i,false,0),sidePoint(i+1,false,0),b,a,white,face.normal);
        const backA=sidePoint(i,true,-wallDepth),backB=sidePoint(i+1,true,-wallDepth);
        const angle=((i+.5)/24+.125)*TAU;
        const n=[-Math.cos(face.yaw)*Math.cos(angle),-Math.sin(angle),Math.sin(face.yaw)*Math.cos(angle)];
        masonry.quad(a,b,backB,backA,shadow,n);
      }
    }
  }
  screen(2,[[.29,.39,0,.31,.29],[.37,0,.39,.35,0],[0,.29,.35,0,.37]]);
  screen(3,[[0,.32,.39,0,.29,0],[.41,0,.32,.39,0,.35],[0,.32,0,.29,.38,0]]);
  for(const side of [0,1]) {
    const face=facadeOf(entry,side);
    face.panel(0,(base+h)/2,face.width,h-base,white,0);
    for(let i=0;i<3;i++) glazing(face,base+1.20+2.32*i,Math.ceil(face.width/1.82),'#69818a',1.22);
  }
  lotBox(entry,0,h+.04,0,entry.w+.15,.22,entry.depth+.15,white);
  for(const sign of [-1,1]) lotBox(entry,sign*(entry.w/2-.24),base/2,-entry.depth*.43,.48,base,.70,white);
  for(const part of [reading,annex]) {
    lotBox(part,0,part.height/2,0,part.w,part.height,part.depth,white);
    lotBox(part,0,part.height+.08,0,part.w+.21,.24,part.depth+.21,white);
    for(let side=0;side<4;side++) {
      const face=facadeOf(part,side);
      for(let i=0;i<(part===annex?2:5);i++)
        glazing(face,1.18+2.20*i,Math.ceil(face.width/1.60),'#64808b',1.54);
    }
  }
  glassPassage(lotPoint(reading,0,0,-reading.depth/2),lotPoint(annex,0,0,annex.depth/2),4.14,2.43);
  // The entrance canopy is an open orthogonal concrete grid, with the courtyard visible below.
  const canopy=lotPart(block,-2.26,-11.25,17.56,7.85,4.80);
  for(let i=0;i<=8;i++) lotBox(canopy,(i/8-.5)*canopy.w,4.59,0,.27,.44,canopy.depth,white);
  for(let i=0;i<=4;i++) lotBox(canopy,0,4.59,(i/4-.5)*canopy.depth,canopy.w,.44,.28,white);
  for(const u of [-canopy.w/2,canopy.w/2]) {
    lotBox(canopy,u,2.21,-canopy.depth/2+.12,.32,4.42,.35,white);
    campusFixtures.push(lotPart(canopy,u,-canopy.depth/2+.12,.32,.35,4.42));
  }
  const title=facadeOf(entry,2);
  facadeName(title,'图书馆南馆','',base+.31,6.18,.59,white,'#383e3a');
  const court=lotPart(block,-5.85,-12.15,10.55,6.04,0);
  lotBox(court,0,.011,0,court.w,.039,court.depth,'#c4b8aa',pavement);
  const pool=lotPart(block,-8.05,-13.33,4.34,1.37,.38);
  lotBox(pool,0,.19,0,pool.w,.38,pool.depth,'#a9aaa1',scenery);
  lotBox(pool,0,.39,0,pool.w-.24,.037,pool.depth-.23,'#7fa9a7',scenery);
  campusFixtures.push(pool);
}

function yuanpingGym(block) {
  const {w,depth}=block, white='#e9e9e1', blue='#79898c', wall='#c5c6bb';
  lotBox(block,0,2.95,0,w,5.90,depth,wall);
  const roof=(x,z)=>lotPoint(block,x,5.90+3.16*(1-(x/(w*.52))**2),z);
  const panels=16,half=depth*.52;
  for(let i=0;i<panels;i++) {
    const a=(i/panels-.5)*w*1.04,b=((i+1)/panels-.5)*w*1.04;
    const p=roof(a,-half),q=roof(a,half),r=roof(b,half),s=roof(b,-half);
    masonry.quad(p,q,r,s,i%4===0?'#c7ccc8':'#dcdfda',normalize(cross(subtract(q,p),subtract(r,p))));
    for(const sign of [-1,1]) {
      const z=sign*depth/2;
      masonry.quad(lotPoint(block,a,5.86,z),lotPoint(block,b,5.86,z),roof(b,z),roof(a,z),white,[sign*block.s,0,sign*block.c]);
    }
  }
  for(let j=0;j<4;j++) {
    const v=(j-1.5)*depth*.205,extent=w*.46;
    for(const sign of [-1,1]) {
      const outer=roof(sign*extent,v),inner=roof(sign*extent*.34,v);
      const peak=add(inner,[0,1.28,0]);
      const back=roof(sign*extent*.34,v+2.63),tail=roof(sign*extent,v+2.63);
      masonry.triangle(outer,peak,inner,blue,[block.s,0,block.c]);
      masonry.quad(outer,peak,back,tail,white,normalize(cross(subtract(tail,outer),subtract(peak,outer))));
      masonry.tube(outer,peak,.073,.073,'#f1f1e9',5,false);
    }
  }
  for(let side=0;side<4;side++) {
    const face=facadeOf(block,side);
    glazing(face,3.5,Math.ceil(face.width/1.66),'#667f83',1.94);
    for(let i=0;i<=8;i++) {
      const p=face.point((i/8-.5)*(face.width-.5),2.86,.07);
      masonry.box(p,[.26,5.72,.41],white,face.yaw);
    }
  }
  facadeName(facadeOf(block),'元平体育馆','',5.11,7.22,.69,white,'#534d47');
}

function campusAuditorium(block) {
  const {w,depth}=block, brick='#a65e46',trim='#e5dcca';
  lotBox(block,0,2.80,0,w,5.60,depth,brick);
  for(let side=0;side<4;side++) {
    const face=facadeOf(block,side);
    glazing(face,2.49,Math.ceil(face.width/1.72),'#5c7470',2.53);
    for(let i=0;i<=6;i++) {
      const u=(i/6-.5)*(face.width-.45);
      masonry.box(face.point(u,3.08,.085),[.37,6.16,.40],brick,face.yaw);
    }
    face.panel(0,4.23,face.width,.22,trim,.065);
  }
  lotBox(block,0,5.73,0,w+.20,.28,depth+.24,trim);
  lotBox(block,0,5.92,0,w-.85,.24,depth-1.12,'#c78162');
  for(let i=0;i<15;i++) lotBox(block,(i/14-.5)*(w-1.55),6.09,0,.12,.17,depth-1.58,'#dda183');
  for(const sign of [-1,1]) {
    lotBox(block,sign*(w/2-.23),6.23,0,.46,1.18,depth,brick);
    lotBox(block,0,6.23,sign*(depth/2-.23),w,1.18,.46,brick);
  }
  facadeName(facadeOf(block),'演会中心','',4.83,5.1,.67,trim,'#654638');
}
