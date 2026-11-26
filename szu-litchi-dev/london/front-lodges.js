// Survey of London, University College London, figure 1 and chapter 4.
const gateLine=8.72;
const frontLodges=[-1,1].map(side=>londonLot(
  side<0?'North Front Lodge':'South Front Lodge','UCL Main Gates · Gower Street',
  'front-lodge',gateLine+1.68,side*6.48,4.38,4.60,4.37));

function lodgeFanlight(face) {
  const spring=2.12;
  function arch(radius,bottom,color,offset) {
    face.panel(0,(spring+bottom)/2,radius*2,spring-bottom,color,offset);
    const centre=face.point(0,spring,offset);
    for(let i=0;i<12;i++) {
      const a=Math.PI*i/12,b=Math.PI*(i+1)/12;
      masonry.triangle(centre,face.point(radius*Math.cos(a),spring+radius*Math.sin(a),offset),
        face.point(radius*Math.cos(b),spring+radius*Math.sin(b),offset),color,face.normal);
    }
  }
  arch(1.12,.55,'#d6cfc0',.041);
  arch(.968,.69,'#52656c',.062);
  face.panel(0,.58,2.31,.12,'#d0c6b5',.08);
  face.panel(0,1.31,.047,1.3,'#dbd5c8',.09);
  for(const y of [1.17,1.63,2.12]) face.panel(0,y,1.94,.052,'#d5cfc2',.094);
  for(const angle of [Math.PI/4,Math.PI/2,3*Math.PI/4]) {
    const onArch=face.point(.95*Math.cos(angle),spring+.95*Math.sin(angle),.099);
    masonry.tube(face.point(0,spring,.099),onArch,.022,.022,'#d5cfc2',6);
  }
}

function frontLodgeBuilding(lot) {
  const {x,z,w,depth}=lot;
  lotBox(lot,0,1.53,0,w,3.06,depth,'#754d40');
  lotBox(lot,0,.11,0,w+.12,.22,depth+.12,'#8e8476');
  lotBox(lot,0,3.065,0,w+.25,.16,depth+.25,'#e4ddd0');
  for(let i=0;i<4;i++) {
    const face=facadeOf(lot,i);
    for(let y=.29;y<2.99;y+=.138) face.panel(0,y,face.width,.012,'#977360',.005);
  }
  const front=facadeOf(lot,3);
  lodgeFanlight(front);
  const back=facadeOf(lot,1);
  back.panel(0,1.29,1.35,2.49,'#cdc5b6',.034);
  back.panel(0,1.26,1.15,2.38,'#344141',.046);
  back.panel(0,1.68,.91,.76,'#708185',.051);
  back.panel(0,1.25,.058,2.31,'#c3b8a7',.056);

  const [left,right]=[x-w/2-.16,x+w/2+.16];
  const [near,far]=[z-depth/2-.16,z+depth/2+.16];
  const eave=3.15,ridge=4.29,l=[x-.70,ridge,z],r=[x+.70,ridge,z];
  masonry.quad([right,eave,near],[left,eave,near],l,r,'#4a5357');
  masonry.quad([left,eave,far],[right,eave,far],r,l,'#515a5c');
  masonry.triangle([left,eave,near],[left,eave,far],l,'#475156');
  masonry.triangle([right,eave,far],[right,eave,near],r,'#515a5e');
  masonry.tube(l,r,.044,.044,'#303737',8);

  const vent=campusFootprint(x-.40,z,.72,1.50,0,.67);
  lotBox(vent,0,4.13,0,vent.w,.87,vent.depth,'#ddd7c9');
  const louvre=facadeOf(vent,3);
  louvre.panel(0,4.26,1.18,.40,'#465154');
  for(let y=4.11;y<4.46;y+=.076) louvre.panel(0,y,1.18,.027,'#bfb9ad',.031);
  lotBox(vent,0,4.61,0,vent.w+.19,.091,vent.depth+.18,'#434d52');
}

function mainGateRail(a,b,tall=1.68) {
  const [x,z]=a,[xx,zz]=b, span=Math.hypot(xx-x,zz-z);
  const yaw=-Math.atan2(zz-z,xx-x),iron='#202729';
  const [cx,cz]=[mix(x,xx,.5),mix(z,zz,.5)];
  for(const y of [.23,tall-.21]) masonry.box([cx,y,cz],[span,.056,.063],iron,yaw);
  const bars=Math.ceil(span/.177);
  for(let i=0;i<=bars;i++) {
    const t=i/bars,bx=mix(x,xx,t),bz=mix(z,zz,t);
    masonry.box([bx,tall/2,bz],[.034,tall-.07,.034],iron);
    masonry.tube([bx,tall-.045,bz],[bx,tall+.047,bz],.033,.002,iron,5);
  }
  uclFixtures.push(campusFootprint(cx,cz,span,.085,yaw,tall));
}

function mainQuadGates() {
  for(const lodge of frontLodges) {
    const side=Math.sign(lodge.z), inner=side*2.13, edge=lodge.x-lodge.w/2;
    mainGateRail([gateLine,inner],[gateLine+1.91,inner]);
    mainGateRail([edge,side*3.79],[edge+.86,side*3.82],1.53);
    mainGateRail([edge,side*8.80],[edge,side*24.9],1.55);
    masonry.box([gateLine,1.07,inner],[.21,2.13,.22],'#202729');
    masonry.tube([gateLine,2.12,inner],[gateLine,2.22,inner],.126,.034,'#252b2e',8);
    masonry.box([edge,.15,side*8.97],[.63,.30,.63],'#ae9f8c');
  }
  const sign=namedSign('UCL','MAIN GATES','#292638','#f2effa');
  plate(sign,[gateLine-.29,1.39,4.90],1.82,.73,-Math.PI/2);
  londonLantern(gateLine-1.05,-9.98);
}
