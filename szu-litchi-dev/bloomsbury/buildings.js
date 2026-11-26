// Exterior forms are based on UCL and Historic England building references.
function londonArch(face,u,y,w,h,glass,stone) {
  const r=w*.50, spring=y+h/2-r, bottom=y-h/2;
  face.panel(u,(spring+bottom)/2,w,spring-bottom,glass);
  const center=face.point(u,spring,.026);
  for(let i=0;i<8;i++) {
    const a=i*Math.PI/8,b=(i+1)*Math.PI/8;
    const pt=(angle,radius,v)=>face.point(u+radius*Math.cos(angle),spring+radius*Math.sin(angle),v);
    masonry.triangle(center,pt(a,r,.026),pt(b,r,.026),glass,face.normal);
    masonry.quad(pt(a,r,.04),pt(b,r,.04),pt(b,r+.13,.046),pt(a,r+.13,.046),stone,face.normal);
  }
  face.panel(u,bottom-.12,w+.32,.17,stone,.048);
  face.panel(u,(spring+bottom)/2,.054,spring-bottom,'#9a9f95',.051);
}

function londonFront(lot,style,opening=null) {
  const {w,depth,height}=lot;
  const palette={
    stone:['#c2b8a5','#e1d7bf','#697475','#a39b87'],
    brick:['#9a5b48','#cfba9e','#596062','#947d6c'],
    modern:['#a8a5a0','#d1cfc6','#607580','#838c8d']
  };
  const [wall,trim,glass,roof]=palette[style];
  const floors=Math.round(height/3.17), pitch=(height-.45)/floors;
  lotBox(lot,0,height/2,0,w,height,depth,wall);
  lotBox(lot,0,height-.55,0,w+.34,.28,depth+.34,trim);
  lotBox(lot,0,height+.32,0,w-.8,.67,depth-.72,roof);
  for(let side=0;side<4;side++) {
    const face=facadeOf(lot,side);
    const lower=opening?.side===side?opening:null;
    const bays=Math.max(2,Math.round(face.width/(style==='modern'?4.15:3.1)));
    const bay=(face.width-.88)/bays;
    for(let floor=0;floor<floors;floor++) {
      const y=(floor+.53)*pitch;
      if(lower&&y-pitch*.38<lower.height) {
        const strip=(face.width-lower.width)/2;
        if(strip>.05) for(const sign of [-1,1]) face.panel(sign*(face.width+lower.width)/4,y-pitch*.38,strip,.12,trim,.056);
      } else face.panel(0,y-pitch*.38,face.width,.12,trim,.056);
      for(let j=0;j<bays;j++) {
        const u=(j+.5-bays/2)*bay;
        if(lower&&y-pitch*.40<lower.height&&Math.abs(u)<(lower.width+bay*.70)/2) continue;
        const tone=(j+floor*3+side)%5===0?'#829097':glass;
        if(style==='brick'&&floor===0&&(j%3!==1)) {
          londonArch(face,u,y,bay*.59,pitch*.75,tone,trim);
        } else {
          const width=bay*(style==='modern'?.78:.51), h=pitch*(floor===0?.68:.65);
          face.panel(u,y,width+.22,h+.19,trim);
          face.panel(u,y,width,h,tone,.033);
          face.panel(u,y+.20,width,.069,'#a7aaa2',.046);
          face.panel(u,y,.060,h,'#a7aaa2',.045);
          if(style!=='modern') face.panel(u,y-h/2-.093,width+.44,.12,trim,.067);
        }
      }
    }
  }
  if(style==='brick') for(let j=1;j<Math.floor(w/9);j++) {
    lotBox(lot,-w/2+j*9,height+.53,-depth*.08,.97,1.77,1.45,wall);
    lotBox(lot,-w/2+j*9,height+1.42,-depth*.08,1.12,.14,1.62,trim);
  }
}

function wilkinsBuilding(lot) {
  londonFront(lot,'stone');
  const pale='#ddd1b9', cap='#e6dac2', shadow='#a69d8b';
  const f=facadeOf(lot,3), point=f.point;
  const box=(u,y,v,w,h,d,color)=>masonry.box(point(u,y,v),[w,h,d],color,f.yaw);
  for(let step=0;step<8;step++) {
    const h=.162*(step+1);
    box(0,h/2,10.16-step*.30,26.0-step*.13,h,.38,step%2?cap:pale);
  }
  box(0,.67,3.75,24.9,1.34,9.1,pale);
  const columns=10;
  for(let j=0;j<columns;j++) {
    const u=(j-(columns-1)/2)*2.34,v=7.12;
    box(u,1.41,v,.94,.20,.97,shadow);
    masonry.tube(point(u,1.51,v),point(u,1.83,v),.47,.38,cap,16);
    masonry.tube(point(u,1.83,v),point(u,9.13,v),.345,.290,pale,16,false);
    for(let k=0;k<8;k++) {
      const angle=k*TAU/8;
      masonry.tube(point(u+Math.cos(angle)*.327,1.9,v+Math.sin(angle)*.327),
        point(u+Math.cos(angle)*.282,9.12,v+Math.sin(angle)*.282),.019,.016,shadow,4,false);
    }
    masonry.tube(point(u,9.12,v),point(u,9.49,v),.28,.51,cap,12);
    box(u,9.53,v,1.07,.24,1.06,cap);
  }
  box(0,9.87,4.28,24.55,.22,7.68,cap);
  box(0,10.19,4.28,24.11,.39,7.52,pale);
  box(0,10.53,4.28,24.82,.29,7.85,cap);
  const base=10.66, apex=13.71;
  for(const z of [8.22,.23]) {
    masonry.triangle(point(-12.28,base,z),point(12.28,base,z),point(0,apex,z),pale,
      scale(f.normal,z>5?1:-1));
  }
  for(const s of [-1,1]) {
    const a=point(s*12.42,base+.04,8.31),b=point(0,apex+.08,8.31);
    const c=point(0,apex+.08,.19),d=point(s*12.42,base+.04,.19);
    masonry.quad(a,b,c,d,'#a8a899',normalize([s*.24,.97,0]));
    masonry.tube(a,b,.11,.11,cap,6,false);
  }
  const drum=[lot.x,lot.height+.3,lot.z];
  masonry.tube(drum,add(drum,[0,2.0,0]),5.9,5.9,'#d3c7ad',32);
  for(let i=0;i<16;i++) {
    const a=i*TAU/16, c=Math.cos(a),s=Math.sin(a);
    wallPanel(masonry,drum[0]+c*5.92,drum[1]+1.1,drum[2]+s*5.92,.72,1.25,'#706c61',c,s);
  }
  const y=drum[1]+2.0;
  const dome=(a,t,r=5.88)=>[drum[0]+r*Math.cos(t)*Math.cos(a),y+4.1*Math.sin(t),drum[2]+r*Math.cos(t)*Math.sin(a)];
  for(let row=0;row<9;row++) for(let col=0;col<32;col++) {
    const a=col*TAU/32,b=(col+1)*TAU/32,t=row*Math.PI/18,next=(row+1)*Math.PI/18;
    const p=dome(a,t),q=dome(b,t),r=dome(b,next),s=dome(a,next);
    const angle=(a+b)*.5,middle=(t+next)*.5;
    const normal=normalize([Math.cos(middle)*Math.cos(angle),1.43*Math.sin(middle),Math.cos(middle)*Math.sin(angle)]);
    masonry.quad(p,q,r,s,col%4===0?'#6b8680':'#789089',normal);
  }
  masonry.tube([lot.x,y+4.02,lot.z],[lot.x,y+5.14,lot.z],.91,.66,cap,16);
  masonry.ellipsoid([lot.x,y+5.2,lot.z],[.76,.60,.76],'#6b807d',16,6);
}

function cruciformBuilding(lot) {
  const [central,west,east,...towers]=lot.parts;
  londonFront(central,'brick');
  londonFront(west,'brick');
  londonFront(east,'brick',{side:1,width:8.2,height:5.55});
  for(const tower of towers) {
    lotBox(tower,0,11.0,0,tower.w,22,tower.depth,'#a25843');
    for(let side=0;side<4;side++) {
      const face=facadeOf(tower,side);
      for(const y of [3.2,7.3,11.5,15.4,19.2]) for(const u of [-2.05,0,2.05])
        londonArch(face,u,y,1.25,2.8,'#54646c','#d5aa86');
    }
    for(const y of [5.3,12.93,20.95,22.03]) lotBox(tower,0,y,0,8.44,.27,8.28,'#d2ad8c');
    masonry.tube(lotPoint(tower,0,22.0,0),lotPoint(tower,0,25.0,0),5.35,1.10,'#6d6e72',4);
    masonry.tube(lotPoint(tower,0,25,0),lotPoint(tower,0,26.5,0),.89,.08,'#77716a',8);
  }
  const f=facadeOf(east,1), stone='#cbb49b', brick='#a55741', inner='#554a43';
  const box=(u,y,v,w,h,d,color)=>masonry.box(f.point(u,y,v),[w,h,d],color,f.yaw);
  const radius=1.72, spring=2.72, front=.54, back=.14;
  box(0,1.4,back,3.45,2.8,.09,inner);
  for(const s of [-1,1]) {
    box(s*2.11,1.39,.28,.78,2.78,.65,stone);
    box(s*2.11,2.59,.33,.98,.19,.76,'#ddd0ba');
    box(s*2.70,2.46,.24,.27,4.92,.45,brick);
  }
  const arc=(angle,r,z)=>f.point(r*Math.cos(angle),spring+r*Math.sin(angle),z);
  for(let i=0;i<18;i++) {
    const a=i*Math.PI/18,b=(i+1)*Math.PI/18;
    masonry.triangle(f.point(0,spring,back+.055),arc(a,radius,back+.055),arc(b,radius,back+.055),inner,f.normal);
    const r=radius+.33+(i===8||i===9?.094:0);
    masonry.quad(arc(a,radius,front),arc(b,radius,front),arc(b,r,front),arc(a,r,front),i%2?stone:'#d7c2aa',f.normal);
    const mid=(a+b)/2;
    masonry.quad(arc(a,radius,front),arc(b,radius,front),arc(b,radius,back),arc(a,radius,back),'#9f8975',
      [-Math.cos(f.yaw)*Math.cos(mid),-Math.sin(mid),Math.sin(f.yaw)*Math.cos(mid)]);
  }
  box(0,1.27,.23,2.51,2.56,.08,'#465458');
  for(const u of [-.74,0,.74]) box(u,1.33,.282,.062,2.43,.043,'#9b9180');
  box(0,2.58,.292,2.60,.12,.069,'#b1a78f');
  for(let i=0;i<4;i++) box(0,.066+i*.097,.93-i*.155,4.64,.133+i*.18,.18,stone);
  box(0,5.06,.248,5.52,.81,.59,brick);
  const sign=shopSign('Cruciform Building',stone,'#493e34');
  plate(sign,f.point(0,5.06,.556),5.08,.54,f.yaw);
}

function glazedHospitalPart(part,roof,rows,columns,podium=false) {
  const {w,depth,height:h}=part, white='#d4ddd7', silver='#acbcb6';
  lotBox(part,0,h/2,0,w,h,depth,white);
  lotBox(part,0,h-.18,0,w+.22,.36,depth+.24,'#e4e5dd');
  lotBox(part,0,h+.19,0,w-.99,.41,depth-1.04,roof);
  for(let side=0;side<4;side++) {
    const f=facadeOf(part,side), count=side%2?columns[1]:columns[0];
    const bay=(f.width-.65)/count, pitch=(h-.60)/rows;
    for(let row=0;row<rows;row++) {
      const y=.33+(row+.5)*pitch;
      for(let j=0;j<count;j++) {
        const u=(j+.5-count/2)*bay;
        if(podium&&side===2&&row===0&&Math.abs(u)<7.8) continue;
        const glass=['#527e82','#779995','#5b8988','#6b9594'][(j*7+row*3+side)%4];
        f.panel(u,y,bay-.07,pitch*.74,glass);
        if(j%3===0) f.panel(u-bay*.42,y,.14,pitch*.77,silver,.045);
      }
      f.panel(0,y+pitch*.37,f.width,.104,silver,.047);
    }
    for(const u of [-f.width*.34,f.width*.35])
      masonry.box(f.point(u,h*.51,.12),[.25,h*.98,.29],'#dae3dc',f.yaw);
  }
}

function hospitalBuilding(lot) {
  const [podium,front,tower]=lot.parts;
  glazedHospitalPart(podium,'#a1afaa',6,[18,9]);
  glazedHospitalPart(front,'#9eafae',6,[19,3],true);
  glazedHospitalPart(tower,'#73918d',14,[9,8]);
  lotBox(tower,4.0,tower.height+.94,2.2,11.1,1.91,9.2,'#adbab4');
  lotBox(tower,4.0,tower.height+1.93,2.2,11.46,.15,9.58,'#d1d7d0');
  const f=facadeOf(front,2), entry=5.72;
  const box=(u,y,v,w,h,d,color)=>masonry.box(f.point(u,y,v),[w,h,d],color,f.yaw);
  const door='#4e686c', silver='#c1c9c1';
  box(entry,1.54,.13,11.15,2.94,.25,'#505c58');
  for(let i=0;i<6;i++) f.panel(entry+(i-2.5)*1.58,1.46,1.49,2.75,door,.263);
  box(entry,3.42,1.36,15.16,.32,3.03,'#cfdbd5');
  box(entry,3.63,2.78,15.17,.16,.18,'#e3e6dc');
  for(const s of [-1,1]) scenery.tube(f.point(entry+s*6.0,.15,2.42),f.point(entry+s*4.32,3.30,1.48),.104,.091,silver,8);
  const label=shopSign('UCLH   UNIVERSITY COLLEGE HOSPITAL','#294857','#edf4ed');
  plate(label,f.point(entry,3.60,2.883),12.2,.44,f.yaw);
  plate(shopSign('UCLH','#dce4da','#3e5966'),f.point(entry,5.15,.088),4.65,.68,f.yaw);
  const address=shopSign('235 EUSTON ROAD   ·   MAIN ENTRANCE','#e2e7dd','#364753');
  plate(address,f.point(entry,2.95,.286),8.9,.31,f.yaw);
}

function andersonBuilding(lot) {
  glazedHospitalPart(lot,'#9caeac',6,[7,11]);
  const f=facadeOf(lot,2);
  for(let j=0;j<12;j++) {
    const u=-lot.w*.38+j*lot.w*.063;
    masonry.box(f.point(u,8.8,.23),[.15,17.4,.40],j%3===0?'#d8e1da':'#bacbc2',f.yaw);
  }
  plate(shopSign('ELIZABETH GARRETT ANDERSON WING','#4b6768','#e3ebe0'),f.point(0,3.39,.31),12.4,.52,f.yaw);
}

function graftonBuilding(lot) {
  const {w,depth,height}=lot, stone='#ccb89f';
  lotBox(lot,0,height/2,0,w,height,depth,'#b49b82');
  lotBox(lot,0,height+.13,0,w+.23,.28,depth+.25,stone);
  lotBox(lot,-w*.12,height+.45,depth*.09,w*.56,.87,depth*.44,'#a59887');
  for(let side=0;side<4;side++) {
    const face=facadeOf(lot,side), cols=Math.floor(face.width/2.65), bay=face.width/cols;
    for(let row=0;row<6;row++) {
      const y=1.74+row*3.04;
      for(let i=0;i<cols;i++) {
        const u=(i+.5-cols/2)*bay;
        const glass=i%3===0?'#748c8f':'#536b71';
        face.panel(u,y,bay*.73,2.38,stone);
        face.panel(u,y,bay*.62,2.21,glass,.042);
        face.panel(u,y,.095,2.21,'#aeb4a7',.056);
      }
    }
  }
  const f=facadeOf(lot,1);
  plate(shopSign('UCLH   GRAFTON WAY BUILDING','#394f58','#e4e9df'),f.point(-depth*.33,3.57,.065),12.4,.56,f.yaw);
}

function studentCentre(lot) {
  const pale='#d9cdbc', dark='#566976', shell='#b8a48d';
  const {height,w,depth}=lot;
  lotBox(lot,0,height/2,0,w,height,depth,shell);
  lotBox(lot,0,height-.44,0,w+.28,.30,depth+.28,pale);
  for(let side=0;side<4;side++) {
    const f=facadeOf(lot,side), bays=side%2?4:3;
    const unit=(f.width-.75)/bays;
    for(let i=0;i<bays;i++) {
      const u=(i+.5-bays/2)*unit;
      for(let level=0;level<5;level++) {
        const y=1.65+level*3.08;
        f.panel(u,y,unit*.84,2.70,pale,.04);
        f.panel(u,y,unit*.73,2.51,level%2?dark:'#6e7f87',.057);
        f.panel(u,y,unit*.73,.10,'#c3bbab',.070);
        f.panel(u,y,.083,2.51,'#b3ae9f',.070);
      }
      masonry.box(f.point(u-unit*.46,8.24,.095),[.22,16.3,.28],pale,f.yaw);
    }
  }
  facadeName(facadeOf(lot,1),'Student Centre','',3.24,9.7,.70,pale,'#494540');
}

function renderLondonBuilding(lot,shopLabels) {
  if(lot.style==='wilkins') wilkinsBuilding(lot);
  else if(lot.style==='cruciform') cruciformBuilding(lot);
  else if(lot.style==='student') studentCentre(lot);
  else if(lot.style==='hospital') hospitalBuilding(lot);
  else if(lot.style==='anderson') andersonBuilding(lot);
  else if(lot.style==='grafton') graftonBuilding(lot);
  else if(lot.style==='shop') shopFront(lot,shopLabels);
  else londonFront(lot,lot.style);
}

function londonLantern(x,z) {
  scenery.tube([x,0,z],[x,3.13,z],.093,.046,'#444a49',8);
  scenery.box([x,3.37,z],[.34,.42,.34],'#d8c9a4',Math.PI/4);
  scenery.tube([x,3.54,z],[x,3.78,z],.26,.05,'#484e4c',4);
}

function placeTravelSign(x,z,title,subtitle,yaw=0) {
  const image=namedSign(title,subtitle,'#243945','#f2e8d1');
  scenery.box([x,1.03,z],[.085,2.06,.085],'#444b47');
  scenery.box([x,1.88,z],[2.75,.58,.13],'#243945',yaw);
  const dx=.069*Math.sin(yaw),dz=.069*Math.cos(yaw);
  plate(image,[x+dx,1.88,z+dz],2.70,.53,yaw);
  plate(image,[x-dx,1.88,z-dz],2.70,.53,yaw+Math.PI);
}
