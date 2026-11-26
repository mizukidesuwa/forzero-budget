// Stop names and curb positions follow the TfL interchange map and NaPTAN stop points.
const busStops=[
  ['University College Hospital / Euston Road','Y','euston',51.52529458,-.13674992,1,false],
  ['University College Hospital / Warren Street','W','euston',51.525222,-.13670963,-1,false],
  ['Warren Street Station','V','euston',51.52457789,-.13918658,-1,true],
  ['Tavistock Square','N','woburnPlace',51.52490442,-.12805874,-1,true],
  ['Tavistock Square','K','woburnPlace',51.52533805,-.12874733,1,false],
  ['Russell Square Station','H','woburnLower',51.52321406,-.12638382,1,false]
].map(([name,letter,id,lat,lon,side,shelter])=>{
  const path=londonRoads.get(id), point=londonPoint(lat,lon);
  const frame=courseFrame(path,pointDistance(path,point));
  const [x,,z]=offsetVertex(frame,side*(path.width+1.05),0);
  return {name,letter,frame,side,shelter,x,z,width:path.width};
});

const warrenTube=londonLot('Warren Street','London Underground · Northern / Victoria','warren-tube',-194,-104.5,24,21.8,16.4);
const russellTube=londonLot('Russell Square','London Underground · Piccadilly','russell-tube',417,402,25,22,10.1);
const tubeStops=[
  {name:'Euston Square',use:'地铁 · Circle / Hammersmith & City / Metropolitan',x:11,z:-124},
  {name:warrenTube.name,use:warrenTube.use,x:-181.4,z:-111.25},
  {name:russellTube.name,use:russellTube.use,x:417,z:390.4}
];

function roundel(ctx,x,y,radius,bus=false) {
  ctx.strokeStyle='#cb2635';ctx.lineWidth=radius*.39;
  ctx.beginPath();ctx.arc(x,y,radius*.80,0,TAU);ctx.stroke();
  ctx.fillStyle=bus?'#cb2635':'#233b70';
  ctx.fillRect(x-radius*1.28,y-radius*.26,radius*2.56,radius*.52);
  ctx.font='800 '+radius*.30+'px Arial,sans-serif';
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff7eb';
  ctx.fillText(bus?'BUS STOP':'UNDERGROUND',x,y+.5,radius*2.45);
}

function londonTubeRoundel() {
  return signCanvas(208,160,(ctx,w,h)=>roundel(ctx,w/2,h/2,72));
}

function londonBusShelter(stop,lot) {
  const side=stop.side;
  const box=(u,y,v,w,h,d,color,mesh=scenery)=>lotBox(lot,u,y,v,w,h,d,color,mesh);
  const steel='#41494d', roof='#3b4144', glass='#748887', back=side*.66;
  box(0,.032,0,7.7,.053,2.4,'#bdb2a4',pavement);
  box(0,2.40,0,6.7,.14,1.76,roof);
  box(0,2.48,0,6.8,.035,1.85,'#676f70');
  box(0,2.31,-back,6.65,.14,.068,steel);
  for(const u of [-3.19,0,3.19]) {
    box(u,1.18,back,.09,2.34,.10,steel);
    if(u) box(u,1.18,-back,.09,2.34,.10,steel);
  }
  for(const u of [-1.60,1.60]) {
    const a=lotPoint(lot,u-1.54,.22,back),b=lotPoint(lot,u+1.54,.22,back);
    const c=lotPoint(lot,u+1.54,2.24,back),d=lotPoint(lot,u-1.54,2.24,back);
    // Keep the rear glazing open between the dot bands with the opaque WebGL materials.
    for(const height of [.28,.72,1.36,2.2]) box(u,height,back,3.07,.049,.034,glass);
    scenery.tube(a,d,.018,.018,'#899998',5,false);
    scenery.tube(b,c,.018,.018,'#899998',5,false);
  }
  box(-.65,.50,back*.56,3.0,.10,.39,'#a92d35');
  for(const u of [-1.98,.62]) box(u,.24,back*.56,.077,.49,.15,steel);
  const notice=signCanvas(176,242,(ctx,w,h)=>{
    ctx.fillStyle='#e7e6db';ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#a02530';ctx.fillRect(0,0,w,45);
    ctx.fillStyle='#fff8eb';ctx.font='700 24px Arial';ctx.textAlign='center';
    ctx.fillText('London buses',w/2,30,w-10);
    ctx.fillStyle='#343c41';ctx.font='700 17px Arial';
    ctx.fillText(stop.name,w/2,73,w-14);ctx.fillText('Stop '+stop.letter,w/2,101);
    for(let i=0;i<6;i++) ctx.fillRect(21,123+i*14,w-42,1.8);
  });
  const facing=side>0?lot.yaw+Math.PI:lot.yaw;
  const board=lotPoint(lot,2.46,1.42,back*.87);
  box(2.46,1.42,back*.95,.74,1.02,.079,steel);
  plate(notice,board,.69,.98,facing);
  const fascia=shopSign(stop.name,'#333a3e','#f4f0e1');
  plate(fascia,lotPoint(lot,0,2.313,-back*1.106),5.99,.133,facing);
  uclFixtures.push(campusFootprint(lot.x,lot.z,6.64,1.42,lot.yaw,2.5));
}

function londonTransportMeshes() {
  for(const stop of busStops) {
    const {name,letter,frame,side,shelter,x,z,width}=stop;
    const yaw=-Math.atan2(frame.f[2],frame.f[0]);
    const flagLot=campusFootprint(x,z,0,0,yaw);
    lotBox(flagLot,0,1.14,0,.081,2.28,.081,'#494e50',scenery);
    lotBox(flagLot,0,2.08,0,.48,.65,.046,'#eae6d8',scenery);
    const flag=signCanvas(172,226,(ctx,w,h)=>{
      ctx.fillStyle='#faf7ef';ctx.fillRect(0,0,w,h);
      roundel(ctx,w/2,69,44,true);
      ctx.fillStyle='#b62332';ctx.fillRect(0,126,w,39);
      ctx.fillStyle='#fff6e9';ctx.textAlign='center';ctx.font='800 29px Arial';
      ctx.fillText(letter,w/2,154);
      ctx.fillStyle='#333a40';ctx.font='700 14px Arial';
      ctx.fillText(name.slice(0,29),w/2,188,w-11);
      if(name.length>29) ctx.fillText(name.slice(29).trim(),w/2,208,w-11);
    });
    const signHeight=2.08;
    plate(flag,lotPoint(flagLot,0,signHeight,.026),.47,.64,yaw);
    plate(flag,lotPoint(flagLot,0,signHeight,-.026),.47,.64,yaw+Math.PI);
    uclFixtures.push(campusFootprint(x,z,.11,.11,0,2.32));
    const box=(u,v,w,d)=>scenery.box(add(offsetVertex(frame,side*(width-v),.049),scale(frame.f,u)),
      [w,.009,d],'#d3ae55',yaw);
    box(0,2.12,13.6,.065);
    for(const u of [-6.77,6.77]) box(u,1.06,.065,2.12);
    if(shelter) {
      const [cx,,cz]=add(offsetVertex(frame,side*(width+2.32),0),scale(frame.f,-4.9));
      londonBusShelter(stop,campusFootprint(cx,cz,0,0,yaw));
    }
  }
}

function tubePortal(face,name,u,width,stone,frame,projecting=false) {
  const {point,yaw}=face;
  const box=(x,y,v,w,h,d,color)=>masonry.box(point(x,y,v),[w,h,d],color,yaw);
  box(u,1.68,.16,width,3.34,.26,frame);
  for(let i=0;i<5;i++) {
    const bay=width/5, x=u+(i-2)*bay;
    face.panel(x,1.49,bay-.078,2.80,i===2?'#52686d':'#617879',.307);
    face.panel(x,1.33,.044,.48,'#c9c7b9',.320);
  }
  box(u,3.44,.63,width+.62,.23,1.28,stone);
  plate(shopSign(name.toUpperCase(),'#243e68','#f3efe5'),
    point(u,3.63,.332),width*.96,.39,yaw);
  const offset=projecting?width*.55:0, v=projecting?.74:.341;
  plate(londonTubeRoundel(),point(u+offset,4.59,v),1.87,1.45,yaw+(projecting?Math.PI/2:0));
  if(projecting) plate(londonTubeRoundel(),point(u+offset-.04,4.59,v),1.87,1.45,yaw-Math.PI/2);
}

function gibbsStation(lot) {
  glazedHospitalPart(lot,'#687d81',9,[14,17]);
  const street=facadeOf(lot,3);
  const u=-13.2;
  for(const side of [-1,1])
    masonry.box(street.point(u+side*4.87,2.37,.38),[.46,4.74,.78],'#8b9897',street.yaw);
  tubePortal(street,'Euston Square Station',u,8.85,'#a5afab','#37454a',true);
  pavement.box([10.72,.061,lot.z+u],[1.03,.048,9.21],'#cec3a8');
}

function warrenStation(lot) {
  portlandBlock(lot,5,3.05);
  const facing=facadeOf(lot,1);
  facing.panel(0,2.1,facing.width,4.13,'#d3c6ad',.038);
  tubePortal(facing,'Warren Street Station',5.25,9.5,'#c3b79e','#3c4e53',true);
  tubePortal(facadeOf(lot,2),'Warren Street',1.9,6.9,'#c3b79e','#374149');
}

function russellStation(lot) {
  const tile='#783c38', moulding='#934b40', seam='#5a3231';
  const {height,w,depth}=lot;
  lotBox(lot,0,height/2,0,w,height,depth,tile);
  lotBox(lot,0,height+.14,0,w+.35,.31,depth+.34,moulding);
  const face=facadeOf(lot,2);
  for(let i=1;i<=22;i++) face.panel(0,i*.43,w,.022,seam,.033);
  face.panel(0,4.93,w,.27,moulding,.071);
  face.panel(0,8.93,w,.20,moulding,.072);
  for(const u of [-9.35,-3.14,3.14,9.35]) {
    londonArch(face,u,6.77,3.35,3.08,'#546063',moulding);
    face.panel(u,6.62,2.80,.067,'#9b9683',.075);
    face.panel(u,6.62,.066,2.49,'#9b9683',.075);
    masonry.box(face.point(u-2.75,4.93,.12),[.55,9.85,.32],moulding,face.yaw);
  }
  plate(shopSign('RUSSELL SQUARE STATION',tile,'#f1d8b4'),
    face.point(0,9.42,.059),13.25,.54,face.yaw);
  tubePortal(face,'Russell Square',.25,8.26,'#273b64','#392b30',true);
  for(const u of [-8.0,8.0]) face.panel(u,1.98,3.34,3.69,'#4e4242',.042);
}
