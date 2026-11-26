function lotBox(block,u,y,v,w,h,d,color,mesh=masonry) {
  mesh.box(lotPoint(block,u,y,v),[w,h,d],color,block.yaw);
}

function facadeOf(block,quarter=0,inset=0) {
  const yaw=block.yaw+quarter*Math.PI/2, c=Math.cos(yaw), s=Math.sin(yaw);
  const width=quarter%2?block.depth:block.w;
  const depth=quarter%2?block.w:block.depth;
  const point=(u,y,v=0)=>[block.x+c*u+s*(depth/2+v-inset),y,block.z-s*u+c*(depth/2+v-inset)];
  const panel=(u,y,w,h,color,v=.022)=>masonry.quad(
    point(u-w/2,y-h/2,v),point(u+w/2,y-h/2,v),
    point(u+w/2,y+h/2,v),point(u-w/2,y+h/2,v),color,[s,0,c]);
  return {panel,point,width,yaw,normal:[s,0,c]};
}

function facadeName({point,yaw},title,subtitle,y,w,h,skin='#d9d8ce',ink='#394847') {
  plate(namedSign(title,subtitle,skin,ink),point(0,y,.051),w,h,yaw);
}

function glazing(face,y,bays,color='#45646a',h=1.02) {
  const w=face.width-.65;
  face.panel(0,y,w,h,color);
  for(let i=1;i<bays;i++) face.panel(w*(i/bays-.5),y,.061,h,'#b7c2bd',.035);
}

function huiwenBuilding(block) {
  const {w,depth,floors,wing}=block;
  const white='#e1dfd3', brick=wing%2?'#a1604d':'#ac705a';
  const h=1.12+floors*2.32;
  lotBox(block,0,.43,0,w+.16,.86,depth+.18,'#b0a69a');
  lotBox(block,0,h/2+.66,0,w,h,depth,brick);
  lotBox(block,0,h+.75,0,w+.42,.34,depth+.42,white);
  lotBox(block,0,h+1.03,0,w-.24,.22,depth-.26,'#b9b8ab');
  lotBox(block,wing%2?w*.29:-w*.29,h+1.42,-depth*.27,2.75,1.01,3.38,white);
  for(let side=0;side<4;side++) {
    const face=facadeOf(block,side);
    const bays=Math.max(3,Math.round(face.width/(side%2?2.05:2.36)));
    for(let floor=0;floor<floors;floor++) {
      const y=2.72+floor*2.32;
      face.panel(0,y-.79,face.width,.18,white);
      for(let col=0;col<bays;col++) {
        const bay=(face.width-.82)/bays, u=(col-(bays-1)/2)*bay;
        face.panel(u,y,bay-.26,1.53,white);
        face.panel(u,y+.075,bay-.51,1.17,(col+floor+wing)%3?'#557174':'#6f8584',.035);
        face.panel(u,y+.085,.069,1.19,'#c4cfc6',.043);
        face.panel(u,y-.64,bay-.18,.103,'#ede8d9',.047);
      }
    }
    if(side%2===0) {
      face.panel(0,1.03,3.6,1.84,'#435755',.033);
      facadeName(face,`汇文楼 H${wing}`,'',1.93,3.42,.49,white,'#624c45');
    }
  }
}

function huiziBuilding(block) {
  const {w,depth,floors,wing}=block;
  const height=floors*2.30+.65, skin='#d9d8cb';
  lotBox(block,0,height/2,0,w,height,depth,skin);
  const tower=lotPart(block,w*.36,0,w*.25,depth+.09,height+1.65);
  lotBox(tower,0,tower.height/2,0,tower.w,tower.height,tower.depth,'#a3a49d');
  lotBox(block,-w*.10,height+.24,0,w*.83,.50,depth+.27,'#e6e3d8');
  lotBox(block,-w*.10,height+.93,-depth*.20,w*.29,.98,depth*.31,'#bbc0b5');
  for(let side=0;side<4;side++) {
    const face=facadeOf(block,side);
    const bays=Math.max(3,Math.round(face.width/2.15));
    for(let i=0;i<floors;i++) {
      const y=1.49+i*2.3;
      glazing(face,y,bays,i%2?'#5b7477':'#4c666b',1.25);
      face.panel(0,y-.74,face.width,.15,'#e3e0d2',.046);
    }
  }
  const face=facadeOf(tower);
  face.panel(0,height*.57,tower.w*.51,height*.75,'#687a79');
  facadeName(facadeOf(block),`汇紫楼 ${wing} 座`,'',2.7,w*.52,.71,skin);
}

function huixingBuilding(block) {
  const {w,depth}=block;
  const aluminum='#b1b4ab', ledge='#d9dacf', dark='#587077';
  lotBox(block,0,.35,0,w,.70,depth,'#a8aba1');
  lotBox(block,0,3.0,0,w-.12,5.31,depth-.18,'#758282');
  lotBox(block,0,5.79,0,w+.38,.34,depth+.38,ledge);
  for(let i=0;i<4;i++) {
    const face=facadeOf(block,i,.06);
    for(let level=0;level<4;level++) {
      glazing(face,1.31+level*1.07,Math.ceil(face.width/2.3),dark,.79);
      face.panel(0,1.81+level*1.07,face.width,.20,ledge,.049);
    }
    for(let band=0;band<3;band++) face.panel(0,4.10+band*.62,face.width,.095,'#c6cac2',.066);
  }
  // Two side wings and the lintel leave the upper opening continuous front to back.
  const tower=lotPart(block,1.45,-.38,w*.70,depth*.77,22.6);
  const gap=7.56, sideW=(tower.w-gap)/2, lower=13.15, lintel=20.35;
  const towerBase=5.86;
  lotBox(tower,0,(towerBase+lower)/2,0,tower.w,lower-towerBase,tower.depth,aluminum);
  lotBox(tower,0,(lintel+22.76)/2,0,tower.w,22.76-lintel,tower.depth,aluminum);
  for(const sign of [-1,1]) {
    lotBox(tower,sign*(gap+sideW)/2,(lower+lintel)/2,0,sideW,lintel-lower,tower.depth,aluminum);
    lotBox(tower,sign*(gap/2+.085),(lower+lintel)/2,0,.17,lintel-lower,tower.depth-.05,'#bec3bc');
  }
  lotBox(tower,0,22.79,0,tower.w+.27,.25,tower.depth+.32,ledge);
  lotBox(tower,-tower.w*.28,23.30,-tower.depth*.27,5.5,.98,3.38,'#a5ada7');
  for(let side=0;side<4;side++) {
    const face=facadeOf(tower,side);
    for(let floor=0;floor<9;floor++) {
      const y=6.88+floor*1.73;
      if(side%2===1 || y<lower-.4 || y>lintel+.4) {
        glazing(face,y,Math.ceil(face.width/2.10),floor%2?'#5c767c':'#617b83',.83);
        face.panel(0,y+.49,face.width,.11,'#c6c9bf',.041);
      } else for(const s of [-1,1]) {
        const u=s*(gap+sideW)/2;
        face.panel(u,y,sideW-.34,.86,dark);
        for(let j=-1;j<=1;j++) face.panel(u+j*sideW*.23,y,.075,.85,'#aebbb7',.034);
      }
    }
    if(side%2===0) for(const sign of [-1,1]) face.panel(sign*gap/2,(lower+lintel)/2,.18,lintel-lower,'#d9dad1',.043);
  }
  const face=facadeOf(block);
  face.panel(0,1.39,9.45,2.6,'#3c585b',.075);
  for(let i=0;i<4;i++)
    lotBox(block,0,.089*(i+1),10.65-i*.44,11.6,.178*(i+1),.45,'#c0c4b8');
  lotBox(block,0,.011,12.6,12.5,.039,3.07,'#c1c1af',pavement);
  facadeName(face,'汇星楼','科技楼',3.47,6.1,.96,'#aeb5ae');
}

function huidianBuilding(block) {
  const stone='#e3decf', cap='#ede8db', shade='#b5b0a2';
  const {w,depth}=block;
  lotBox(block,0,1.13,0,w,2.26,depth,shade);
  lotBox(block,0,8.63,0,w,13.14,depth,stone);
  lotBox(block,0,15.20,0,w+.56,.28,depth+.56,cap);
  lotBox(block,-2.2,15.68,-1.7,w*.56,.74,depth*.56,'#b6b7ac');
  lotBox(block,0,1.05,8.30,15.8,2.10,1.70,shade);
  lotBox(block,0,2.11,8.26,17.20,.16,1.86,cap);
  for(const side of [-1,1]) {
    for(let n=0;n<9;n++) {
      const h=(n+1)*.237;
      lotBox(block,side*9.25,h/2,9.45-n*.268,2.64,h,.283,n%2?'#c9c4b6':'#d5cfc1');
    }
    for(const edge of [-1,1]) {
      const u=side*9.25+edge*1.23;
      scenery.tube(lotPoint(block,u,1.02,9.59),lotPoint(block,u,3.05,7.18),.027,.027,'#a8b1ab',5);
      for(let i=0;i<4;i++) lotBox(block,u,1.02+i*.62,9.40-i*.70,.054,.98,.054,'#919d96');
    }
  }
  for(let side=0;side<4;side++) {
    const face=facadeOf(block,side);
    const bays=Math.ceil(face.width/1.66);
    for(let floor=0;floor<5;floor++) {
      const y=4.45+floor*2.17;
      if(side===0 && floor<2) {
        for(const u of [-8.5,8.5]) face.panel(u,y,5.5,1.23,'#718383');
      } else glazing(face,y,bays,floor%2?'#6f898a':'#526e75',1.19);
      face.panel(0,y+1.01,face.width,.13,cap,.040);
    }
    if(side%2) face.panel(face.width*.32,1.13,face.width*.29,1.89,'#647670');
  }
  const face=facadeOf(block);
  face.panel(0,3.44,13.8,2.48,'#4a666a',.044);
  for(let i=-5;i<=5;i++) face.panel(i*1.17,3.44,.065,2.48,'#b6c3bd',.055);
  face.panel(0,7.35,13.81,4.96,'#beccca',.043);
  face.panel(0,7.34,13.25,4.39,'#6b8689',.055);
  for(let i=-4;i<=4;i++) face.panel(i*1.39,7.34,.079,4.40,'#bcc8c5',.061);
  facadeName(face,'深圳大学图书馆','汇典楼 · 北馆',5.02,11.7,.95,cap);
}

function glassPassage(start,end,y,w=2.40) {
  const dx=end[0]-start[0], dz=end[2]-start[2], span=Math.hypot(dx,dz);
  const lot=campusFootprint((start[0]+end[0])/2,(start[2]+end[2])/2,span,w,-Math.atan2(dz,dx));
  lotBox(lot,0,y-.13,0,span,.26,w,'#b5bab2');
  lotBox(lot,0,y+1.29,0,span,2.50,w-.14,'#63858c');
  lotBox(lot,0,y+2.58,0,span+.13,.23,w+.24,'#dcdfd5');
  for(const side of [-1,1]) {
    for(let i=0;i<=Math.ceil(span/1.25);i++)
      lotBox(lot,-span/2+i*span/Math.ceil(span/1.25),y+1.28,side*(w-.09)/2,.077,2.52,.074,'#cdd8d1');
    lotBox(lot,0,y+1.12,side*(w-.061)/2,span,.077,.075,'#b4c7c3');
  }
}

function huiwenWalkways() {
  for(const [a,b,y] of [[0,1,4.62],[1,2,4.91],[3,4,4.68]]) {
    const first=huiwenWings[a], second=huiwenWings[b];
    const axis=normalize([second.x-first.x,0,second.z-first.z]);
    const terrace=(block,sign)=>{
      const distance=Math.min((block.w/2-.27)/Math.abs(axis[0]*block.c-axis[2]*block.s),
        (block.depth/2-.27)/Math.abs(axis[0]*block.s+axis[2]*block.c));
      return add([block.x,0,block.z],scale(axis,sign*distance));
    };
    glassPassage(terrace(first,1),terrace(second,-1),y,2.22);
  }
}

function huizhiBuilding(block) {
  const cream='#edebe2', [entry,reading,annex]=block.parts;
  for(const part of block.parts) {
    lotBox(part,0,part.height/2,0,part.w,part.height,part.depth,part===entry?cream:'#daddd5');
    lotBox(part,0,part.height+.08,0,part.w+.27,.24,part.depth+.27,cream);
  }
  for(let side=0;side<4;side++) {
    const face=facadeOf(reading,side);
    for(let i=0;i<5;i++) {
      glazing(face,1.35+2.03*i,Math.ceil(face.width/1.42),'#68898f',1.25);
      face.panel(0,2.17+2.03*i,face.width,.19,cream,.049);
    }
  }
  for(const side of [1,3]) {
    const face=facadeOf(entry,side);
    for(let i=0;i<4;i++) glazing(face,3.03+i*2.21,7,'#647d80',1.03);
  }
  const face=facadeOf(entry,2);
  face.panel(0,1.39,9.11,2.76,'#516b71');
  face.panel(0,2.98,10.04,.25,'#cdd1c8',.05);
  for(let row=0;row<2;row++) for(let i=0;i<4;i++) {
    const u=(i-1.5)*1.96,y=6.95+row*1.54;
    const center=face.point(u,y,.032);
    for(let k=0;k<10;k++) {
      const a=k*TAU/10,b=(k+1)*TAU/10,r=.51;
      masonry.triangle(center,face.point(u+r*Math.cos(a),y+r*Math.sin(a),.032),
        face.point(u+r*Math.cos(b),y+r*Math.sin(b),.032),'#66878b',face.normal);
    }
  }
  facadeName(face,'图书馆南馆','汇智楼',4.70,8.85,1.02,cream);
  glazing(facadeOf(annex,2),3.17,5,'#517780',1.88);
  glassPassage(lotPoint(reading,0,0,-reading.depth/2),lotPoint(annex,0,0,annex.depth/2),4.3,2.65);
  const court=lotPart(block,-5.85,-12.0,10.5,4.3,0);
  lotBox(court,0,.011,0,court.w,.039,court.depth,'#c3bbae',pavement);
  const fountain=lotPart(block,-8.05,-13.33,4.34,1.37,.38);
  lotBox(fountain,0,.20,0,fountain.w,.40,fountain.depth,'#b4b2a7',scenery);
  lotBox(fountain,0,.408,0,fountain.w-.28,.047,fountain.depth-.25,'#79a9ac',scenery);
  scenery.tube(lotPoint(fountain,0,.41,0),lotPoint(fountain,0,.89,0),.044,.019,'#aadad7',6);
  campusFixtures.push(fountain);
}

function yuanpingGym(block) {
  const {w,depth}=block;
  const wall='#ded7be', bronze='#9c9b73', ribs=14;
  lotBox(block,0,3.15,0,w,6.30,depth,wall);
  const roof=(x,z)=>lotPoint(block,x,6.17+3.30*(1-(x/(w*.52))**2),z);
  for(let i=0;i<ribs;i++) {
    const a=w*1.04*(i/ribs-.5), b=w*1.04*((i+1)/ribs-.5), z=depth*.52;
    const p=roof(a,-z), q=roof(a,z), r=roof(b,z), s=roof(b,-z);
    masonry.quad(p,q,r,s,i%3?bronze:'#a9a986',normalize(cross(subtract(q,p),subtract(r,p))));
    masonry.tube(p,q,.046,.046,'#c0be9c',4,false);
    for(const side of [-1,1]) {
      const v=side*depth*.5;
      masonry.quad(lotPoint(block,a,6.1,v),lotPoint(block,b,6.1,v),roof(b,v),roof(a,v),wall,
        [side*block.s,0,side*block.c]);
    }
  }
  for(let side=0;side<4;side++) {
    const face=facadeOf(block,side);
    glazing(face,3.83,Math.floor(face.width/1.74),'#687776',1.67);
    for(let i=1;i<8;i++) face.panel(face.width*(i/8-.5),3.53,.20,4.06,'#c6bb9d',.048);
  }
  const face=facadeOf(block);
  face.panel(0,1.36,8.58,2.51,'#566c6f',.055);
  facadeName(face,'元平体育馆','',5.78,8.7,.93,wall);
}

function renderCampusLandmark(block) {
  switch(block.kind) {
    case 'huiwen': huiwenBuilding(block); break;
    case 'huizi': huiziBuilding(block); break;
    case 'huixing': huixingBuilding(block); break;
    case 'huidian': huidianBuilding(block); break;
    case 'huizhi': huizhiBuilding(block); break;
    case 'yuanping': yuanpingGym(block); break;
    case 'zhiyi': zhiyiBuilding(block); break;
    case 'academic': {
      const h=block.floors*2.28+1;
      lotBox(block,0,h/2,0,block.w,h,block.depth,'#d7d1bb');
      lotBox(block,0,h+.10,0,block.w+.34,.23,block.depth+.36,'#b4bbad');
      for(let side=0;side<4;side++) {
        const face=facadeOf(block,side);
        for(let i=0;i<block.floors;i++) glazing(face,1.64+2.28*i,Math.floor(face.width/1.68));
      }
      facadeName(facadeOf(block),block.name,block.use,2.66,Math.min(block.w*.58,8.7),.73);
      break;
    }
    default: return false;
  }
  return true;
}
