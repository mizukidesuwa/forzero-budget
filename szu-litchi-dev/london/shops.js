// Retail address anchors are from the store locators, UCL and Camden's street records.
function streetShop(name,use,kind,shell,id,coordinates,side,front,depth,height,offset=0) {
  return shopFrontage(name,use,kind,shell,id,londonPoint(...coordinates),side,front,depth,height,offset);
}

function shopFrontage(name,use,kind,shell,id,position,side,front,depth,height,offset=0) {
  const path=londonRoads.get(id);
  let station=0,nearest=Infinity;
  for(let i=1;i<path.rows.length;i++) {
    const a=path.rows[i-1],b=path.rows[i];
    const dx=b.p[0]-a.p[0],dz=b.p[2]-a.p[2];
    const x=position[0]-a.p[0],z=position[1]-a.p[2];
    const f=clamp((x*dx+z*dz)/Math.max(.0001,dx*dx+dz*dz),0,1);
    const gap=(x-f*dx)**2+(z-f*dz)**2;
    if(gap<nearest) {nearest=gap;station=mix(a.distance,b.distance,f);}
  }
  const frame=courseFrame(path,station+offset);
  const [x,,z]=offsetVertex(frame,side*(path.width+2.06+depth/2),0);
  const yaw=Math.atan2(-side*frame.side[0],-side*frame.side[2]);
  return {...londonLot(name,use,'shop',x,z,front,depth,height,yaw),kind,shell};
}

// Door order follows Camden's Store Street plan. Postcodes align the row to the modelled block.
const storeStreetShops=[
  ['Russell & Chapple','30–31 Store Street','art',-59,9.2,13.3],
  ['Treadwell’s Books','33 Store Street','treadwell',-48.5,7.7,12.7],
  ['Decadence Salon','36 Store Street','salon',-37.8,7.4,12.4],
  ['Store Street Espresso','40 Store Street','espresso',-24.4,7.6,12.5],
  ['Orchidya Flower School','41 Store Street','flowerschool',-16.8,6.9,12.5],
  ['Orchidya','42 Store Street','flowers',-8.8,7.7,13.4]
].map(([name,address,kind,x,width,height])=>
  shopFrontage(name,address,kind,'brick','store',[x,405],1,width,12.1,height));

const londonShops=[
  shopFrontage('McDonald’s','134 Tottenham Court Road','burger','brick','court',[-174,-76.4],1,8.4,15.2,15.2),
  shopFrontage('Grafton Pharmacy','132 Tottenham Court Road','pharmacy','brick','court',[-174,-67.95],1,5.6,11.4,13.6),
  shopFrontage('Boots','120–122 Tottenham Court Road','boots','brick','court',[-173,-49.7],1,8.0,12.8,13.7),
  shopFrontage('Tesco Express','124–125 Tottenham Court Road','tesco','brick','court',[-174,-59.6],1,8.4,13,13.7),
  streetShop('Lidl','145 Tottenham Court Road','lidl','modern','court',
    [51.5239,-.1371],-1,15.1,15,8.1,-15.7),
  streetShop('Oseyo','115 Tottenham Court Road','oseyo','brick','court',
    [51.523352,-.137251],1,9.7,13.2,14.3),
  streetShop('Greggs','101–106 Tottenham Court Road','greggs','stone','court',
    [51.522569,-.136663],1,10.1,13.4,14.8),
  streetShop('Waterstones','82 Gower Street','books','brick','gower',
    [51.52249,-.13204],-1,29.5,31,17.3,1.5),
  streetShop("Heal’s",'196 Tottenham Court Road','heals','stone','court',
    [51.521349,-.134258],-1,35,23,19.2),
  shopFrontage('Yo Home','22–24 Torrington Place','yohome','brick','torrington',[-120.3,179],1,14.6,13,14.5),
  shopFrontage('Wasabi','3 Bernard Street','wasabi','brick','bernard',[390.6,382],1,7.8,13.4,13.2),
  shopFrontage('Tortilla','5 Bernard Street','tortilla','brick','bernard',[399.5,383],1,6.4,12.5,13.2),
  streetShop('Tesco Express · Russell Square','40 Bernard Street','tesco','modern','bernard',
    [51.523367,-.12468],-1,16.4,13.5,12.6),
  ...storeStreetShops
];
const unionShops=[
  {name:"Gordon’s Café",use:'25 Gordon Street',kind:'espresso',offset:-6.2,width:9.0},
  {name:'The Hanger',use:'25 Gordon Street',kind:'hanger',offset:5.8,width:8.1}
];

const campusRetail=[
  {building:'North-West Wing',side:2,name:'George Farha Café',use:'136 Gower Street · Gower Place',
    kind:'unionCafe',offset:-.9,width:8.8},
  {building:'The Bartlett',side:3,name:'Brew Bar',use:'22 Gordon Street · The Bartlett',
    kind:'espresso',offset:1.1,width:7.2}
];

function terracesBesideRetail(terraces,stores) {
  const clearances=stores.map(lot=>{
    const corners=footprintCorners(lot), xs=corners.map(p=>p[0]),zs=corners.map(p=>p[2]);
    return [Math.min(...xs)-.39,Math.max(...xs)+.39,Math.min(...zs)-.39,Math.max(...zs)+.39];
  });
  return terraces.flatMap(lot=>{
    let pieces=[[lot.x-lot.w/2,lot.x+lot.w/2,lot.z-lot.depth/2,lot.z+lot.depth/2]];
    for(const [a,b,c,d] of clearances) pieces=pieces.flatMap(box=>{
      const [x0,x1,z0,z1]=box,left=Math.max(x0,a),right=Math.min(x1,b),near=Math.max(z0,c),far=Math.min(z1,d);
      if(left>=right||near>=far) return [box];
      return [[x0,left,z0,z1],[right,x1,z0,z1],[left,right,z0,near],[left,right,far,z1]]
        .filter(([x,xx,z,zz])=>xx-x>=3.0&&zz-z>=4.3);
    });
    return pieces.map(([x0,x1,z0,z1])=>
      londonLot(lot.name,lot.use,lot.style,(x0+x1)/2,(z0+z1)/2,x1-x0,z1-z0,lot.height));
  });
}

function retailGlazing(face,u,width,height,shade) {
  const {point,yaw}=face;
  masonry.box(point(u,height*.5,.142),[width,height,.26],shade.frame,yaw);
  const pane=(width-2.45)/2, half=(pane+1.55)/2;
  for(const side of [-1,1]) {
    face.panel(u+side*half,height*.47,pane,height*.66,shade.glass,.282);
    face.panel(u+side*half,height*.21,pane,height*.14,shade.display[side>0?0:1],.293);
    face.panel(u+side*half,height*.49,.058,height*.69,shade.trim,.30);
  }
  face.panel(u,height*.45,1.54,height*.84,'#516068',.31);
  face.panel(u,height*.46,.062,height*.81,'#a5a498',.325);
  face.panel(u+.29,height*.43,.048,.36,'#cbc7b5',.34);
}

function unionFront(lot,labels) {
  londonFront(lot,'brick',{side:1,width:lot.depth-1.6,height:4.1});
  const entrance=facadeOf(lot,1);
  facadeName(entrance,'Students’ Union UCL','25 Gordon Street',4.81,13.12,.81,'#43396a','#f5eaf3');
  for(const {name,kind,offset,width} of unionShops) {
    const style=shopStyles[kind];
    retailGlazing(entrance,offset,width,3.11,style);
    retailLabel(entrance,{name,kind,offset,width},labels);
  }
  retailGlazing(entrance,0,2.9,3.17,shopStyles.hanger);
}

function retailLabel(face,{name,kind,offset=0,width},labels) {
  const style=shopStyles[kind];
  const point=(u,y,v)=>face.point(u+offset,y,v);
  masonry.box(point(0,3.54,.245),[width+.10,.66,.29],style.frame,face.yaw);
  labels.push({name,face:{...face,point},width,background:style.frame,ink:style.trim});
}

function streetShopDetail(face,width,kind,style) {
  const {point,yaw}=face;
  if(['espresso','unionCafe','tortilla','flowers'].includes(kind)) {
    const w=width*.87,front=.99,top=3.16;
    masonry.quad(point(-w/2,top+.24,.315),point(w/2,top+.24,.315),point(w/2,top,front),
      point(-w/2,top,front),style.frame,[0,1,0]);
    masonry.box(point(0,top-.065,front),[w,.15,.058],style.trim,yaw);
    for(const side of [-1,1]) masonry.tube(point(side*w*.425,top-.05,front),
      point(side*w*.425,top-.48,.30),.023,.023,'#5d6359',7);
  }
  if(kind==='flowers'||kind==='flowerschool') {
    for(const [u,y,w,color] of [[-.27,.67,.46,'#b08292'],[.24,.46,.36,'#d3b4a5'],[.36,.70,.45,'#cca7c1']]) {
      const pot=point(u*width,.22,.47);
      scenery.tube(point(u*width,0,.47),pot,w*.34,w*.46,'#62605b',8);
      foliage.ellipsoid(point(u*width,y,.47),[w*.45,y-.19,w*.38],'#607b55',8,4);
      foliage.ellipsoid(point(u*width,y+.09,.49),[w*.35,.16,w*.31],color,7,4);
    }
  }
  if(kind==='pharmacy') {
    masonry.box(point(-width*.31,2.42,.40),[.37,.085,.084],'#91d3a2',yaw);
    masonry.box(point(-width*.31,2.42,.41),[.085,.37,.084],'#91d3a2',yaw);
  }
}

function retailOnCampus(lot,unit,labels) {
  const face=facadeOf(lot,unit.side),style=shopStyles[unit.kind];
  const width=Math.min(face.width-.49,unit.width+Math.abs(unit.offset)*2+.35);
  londonFront(lot,lot.style,{side:unit.side,width,height:4.0});
  retailGlazing(face,unit.offset,unit.width,3.07,style);
  retailLabel(face,unit,labels);
}

function detailedShopFront(lot,labels) {
  const face=facadeOf(lot,0), style=shopStyles[lot.kind], width=face.width-.46;
  londonFront(lot,lot.shell,{side:0,width,height:4.2});
  const bays=width>20?3:1;
  for(let i=0;i<bays;i++) retailGlazing(face,(i+.5-bays/2)*width/bays,width/bays-.36,3.07,style);
  const signWidth=Math.min(width,lot.kind==='heals'?15:17.9);
  const name=lot.kind==='tesco'?'Tesco express':lot.name;
  retailLabel(face,{name,kind:lot.kind,width:signWidth},labels);
  streetShopDetail(face,width,lot.kind,style);
  if(lot.kind==='books') {
    const corner=facadeOf(lot,3);
    for(let i=0;i<3;i++) retailGlazing(corner,(i-1)*corner.width*.29,corner.width*.265,3.11,style);
    retailLabel(corner,{name:'Waterstones',kind:lot.kind,width:13.5},labels);
    for(const side of [0,3]) {
      const front=facadeOf(lot,side);
      for(const y of [4.46,8.7,13.3,16.58]) front.panel(0,y,front.width+.23,.22,'#d4b99f',.089);
    }
  }
}
