function uclChart(width,height,dpr,compact,event,focus,exploring,cityView) {
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(width*dpr));
  canvas.height=Math.max(1,Math.round(height*dpr));
  const ctx=canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle=compact?'#293137':'#e5dfd2';
  ctx.fillRect(0,0,width,height);
  const c=Math.cos(londonNorth),s=Math.sin(londonNorth);
  const turn=(x,z)=>[c*x+s*z,c*z-s*x];
  const frame=focus?event.extent:uclBounds;
  const corners=[[frame.minX,frame.minZ],[frame.minX,frame.maxZ],
    [frame.maxX,frame.minZ],[frame.maxX,frame.maxZ]].map(([x,z])=>turn(x,z));
  const minX=Math.min(...corners.map(p=>p[0])),maxX=Math.max(...corners.map(p=>p[0]));
  const minY=Math.min(...corners.map(p=>p[1])),maxY=Math.max(...corners.map(p=>p[1]));
  const pad=compact?6:focus?30:16;
  const fit=Math.max(.01,Math.min((width-2*pad)/(maxX-minX),(height-2*pad)/(maxY-minY)));
  const left=(width-(maxX-minX)*fit)/2,top=(height-(maxY-minY)*fit)/2;
  const project=([x,,z])=>{
    const [u,v]=turn(x,z);
    return [left+(u-minX)*fit,top+(v-minY)*fit];
  };
  const unproject=(x,y)=>{
    const u=minX+(x-left)/fit,v=minY+(y-top)/fit;
    return [c*u-s*v,s*u+c*v];
  };
  const plot=(outline)=>mapPath(ctx,project,outline.map(([x,z])=>[x,0,z]),true);
  plot([[uclBounds.minX,uclBounds.minZ],[uclBounds.minX,uclBounds.maxZ],
    [uclBounds.maxX,uclBounds.maxZ],[uclBounds.maxX,uclBounds.minZ]]);
  ctx.fillStyle=compact?'#3e4749':'#dbd3c1';
  ctx.fill();
  for(const {outline} of londonGardens) {
    plot(outline);
    ctx.fillStyle=compact?'#738c70':'#a4b486';
    ctx.fill();
  }
  mapPath(ctx,project,footprintCorners(uclQuad),true);
  ctx.fillStyle=compact?'#989188':'#cbb69f';
  ctx.fill();
  ctx.lineJoin=ctx.lineCap='round';
  for(const {id,path} of uclWays) {
    mapPath(ctx,project,path.rows.map(row=>row.p));
    ctx.strokeStyle=londonPaths.has(id)?(compact?'#7e8b88':'#b9a899'):(compact?'#8c9896':'#f8f5ec');
    ctx.lineWidth=Math.max(compact?1.0:1.35,(path.width*2+1.7)*fit);
    ctx.stroke();
  }
  const buildingColors={
    wilkins:'#c5a988',cruciform:'#a86d60',hospital:'#72949b',ioe:'#8998b1',
    senate:'#a08066',soas:'#9c95a4',student:'#a68a65',shop:'#b78c67',
    'russell-tube':'#9c5755','warren-tube':'#a59d8c'
  };
  for(const lot of uclBuildings) {
    for(const part of lot.parts??[lot]) {
      mapPath(ctx,project,footprintCorners(part),true);
      ctx.fillStyle=buildingColors[lot.style]??(compact?'#656b69':'#b1a597');
      ctx.strokeStyle=compact?'#e9dfce28':'#f4ebda';
      ctx.lineWidth=.55;
      ctx.fill();ctx.stroke();
    }
  }
  if(exploring&&!focus&&uclRouteVisible) {
    mapPath(ctx,project,uclHospitalRoute);
    ctx.strokeStyle=compact?'#a4e2de':'#2b6578';
    ctx.lineWidth=compact?1.9:3;
    ctx.stroke();
  }
  if(!exploring||focus) drawCourseMap(ctx,project,compact,event);
  const reserved=[];
  const [pinX,pinY]=project(campuses.ucl.arrival);
  reserved.push([pinX-14,pinY-10,pinX+14,pinY+10]);
  const label=(name,x,z,rotation,color,size,large=false)=>{
    const [px,py]=project([x,0,z]);
    ctx.font=(large?'700 ':'600 ')+size+'px system-ui,sans-serif';
    const length=ctx.measureText(name).width+5, heightOfText=size+4;
    const dx=(Math.abs(Math.cos(rotation))*length+Math.abs(Math.sin(rotation))*heightOfText)/2;
    const dy=(Math.abs(Math.sin(rotation))*length+Math.abs(Math.cos(rotation))*heightOfText)/2;
    const offsets=compact?[[0,0],[0,-12],[0,12]]:
      [[0,0],[0,-15],[0,16],[0,-30],[0,30],[-23,-17],[23,17]];
    for(const [ox,oy] of offsets) {
      const x0=px+ox,y0=py+oy,bounds=[x0-dx,y0-dy,x0+dx,y0+dy];
      const [left,top,right,bottom]=bounds;
      if(left<7||right>width-7||top<7||bottom>height-7||
        reserved.some(([a,b,c,d])=>left<c&&right>a&&top<d&&bottom>b)) continue;
      reserved.push(bounds);
      if(!compact&&Math.hypot(ox,oy)>16) {
        ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(x0,y0);
        ctx.lineWidth=.8;ctx.strokeStyle='#82776888';ctx.stroke();
      }
      ctx.save();ctx.translate(x0,y0);ctx.rotate(rotation);
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.lineWidth=2.5;ctx.strokeStyle=compact?'#333d41':'#ede8dc';ctx.fillStyle=color;
      ctx.strokeText(name,0,0);ctx.fillText(name,0,0);ctx.restore();
      break;
    }
  };
  if(!compact) {
    const roads=[
      ['Euston Road',47,-147,0],['Gower Street',1,114,Math.PI/2],
      ['Gordon Street',124,-24,Math.PI/2],['Torrington Place',-62,181,0],
      ['Malet Street',64,362,Math.PI/2],['Bedford Way',259,253,Math.PI/2],
      ['Torrington Square',124,223,Math.PI/2],['Woburn Place',337,219,Math.PI/2],
      ['Montague Place',130,514,0],['Tottenham Court Rd',-166,101,Math.PI/2],
      ['Bernard Street',405,380,0]
    ];
    label('UCL · Main Quad',uclQuad.x,uclQuad.z,0,'#382c48',12,true);
    label('UoL · Senate House',senateHouse.x,senateHouse.z,0,'#382c48',12,true);
    label('IOE · 20 Bedford Way',ioe.x,ioe.z,0,'#382c48',12,true);
    for(const place of tubeStops) label(place.name,place.x,place.z+18,0,'#245176',10,true);
    for(const {name,x,z} of uclLandmarks) {
      if(['UCL · Main Quad',senateHouse.name,ioe.name].includes(name)) continue;
      label(name,x,z,0,'#364640',10);
    }
    label('返程点',campuses.ucl.arrival[0]-14,campuses.ucl.arrival[2]-10,0,'#20515d',9);
    for(const [name,x,z,rotation] of roads) label(name,x,z,rotation-londonNorth,'#625953',9);
    if(exploring&&!focus) for(const place of londonPlaces) {
      if(place.kind==='shop') label(place.name,place.x,place.z,0,'#714c32',9);
    }
    ctx.font='700 11px system-ui,sans-serif';
    ctx.fillStyle='#413e3a';ctx.textAlign='center';
    ctx.fillText('北 ↑',width-25,20);
  } else if(exploring) {
    label('UCL',uclQuad.x,uclQuad.z,0,'#f0e2c9',8,true);
    label('UoL',senateHouse.x,senateHouse.z,0,'#f0e2c9',8,true);
    label('IOE',ioe.x,ioe.z,0,'#dde2f2',8,true);
  }
  for(const place of londonPlaces) {
    if((compact||!exploring||focus)&&place.kind!=='tube') continue;
    const [x,y]=project([place.x,0,place.z]);
    if(x<4||x>width-4||y<4||y>height-4) continue;
    if(place.kind==='tube') {
      const r=compact?2.44:4.5;
      ctx.beginPath();ctx.arc(x,y,r,0,TAU);
      ctx.fillStyle='#f6f0e5';ctx.fill();ctx.lineWidth=compact?1.12:1.7;
      ctx.strokeStyle='#bb3440';ctx.stroke();
      ctx.fillStyle='#2c426e';ctx.fillRect(x-r-1,y-.78,2*r+2,1.56);
    } else {
      ctx.fillStyle=place.kind==='bus'?'#a93846':'#906540';
      ctx.fillRect(x-2.1,y-2.1,4.2,4.2);
    }
  }
  travelPin(ctx,project,'ucl',true);
  return {canvas,project,unproject,width,height,dpr,event,focus,exploring,cityView,hospitalRoute:uclRouteVisible};
}
