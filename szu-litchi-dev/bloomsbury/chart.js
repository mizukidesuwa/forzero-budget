function travelPin(ctx,project,campus,compact) {
  const [x,y]=project(campuses[campus].arrival), radius=compact?3.2:5.4;
  ctx.beginPath();
  ctx.arc(x,y,radius,0,TAU);
  ctx.fillStyle='#9fd9de';
  ctx.strokeStyle='#183b42';
  ctx.lineWidth=1.5;
  ctx.fill();
  ctx.stroke();
  if(!compact) {
    ctx.font='700 10px "Microsoft YaHei", sans-serif';
    ctx.textAlign='center';
    ctx.lineWidth=2.8;
    ctx.strokeStyle='#e8eee4';
    ctx.fillStyle='#18454c';
    ctx.strokeText(campuses[campus].station,x,y+12);
    ctx.fillText(campuses[campus].station,x,y+12);
  }
}

function uclChart(width,height,dpr,compact,event,focus,exploring,cityView) {
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(width*dpr));
  canvas.height=Math.max(1,Math.round(height*dpr));
  const ctx=canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle=compact?'#354148':'#c6c1b5';
  ctx.fillRect(0,0,width,height);
  const {minX,maxX,minZ,maxZ}=uclBounds,pad=compact?6:17;
  const north=.37,c=Math.cos(north),s=Math.sin(north);
  const turn=(x,z)=>[c*x+s*z,c*z-s*x];
  const corners=[[minX,minZ],[minX,maxZ],[maxX,minZ],[maxX,maxZ]].map(([x,z])=>turn(x,z));
  const lowX=Math.min(...corners.map(p=>p[0])), highX=Math.max(...corners.map(p=>p[0]));
  const lowZ=Math.min(...corners.map(p=>p[1])), highZ=Math.max(...corners.map(p=>p[1]));
  const fit=Math.max(.01,Math.min((width-2*pad)/(highX-lowX),(height-2*pad)/(highZ-lowZ)));
  const left=(width-(highX-lowX)*fit)/2,top=(height-(highZ-lowZ)*fit)/2;
  const project=([x,,z])=>{
    const [u,v]=turn(x,z);
    return [left+(u-lowX)*fit,top+(v-lowZ)*fit];
  };
  const unproject=(x,y)=>{
    const u=lowX+(x-left)/fit,v=lowZ+(y-top)/fit;
    return [c*u-s*v,s*u+c*v];
  };
  mapPath(ctx,project,[[minX,0,minZ],[minX,0,maxZ],[maxX,0,maxZ],[maxX,0,minZ]],true);
  ctx.fillStyle=compact?'#405052':'#d6ccba';ctx.fill();
  for(const [lot,color] of [[uclQuad,'#c6aa87'],[uclGarden,'#91ac7c'],[tavistockGarden,'#93a985']]) {
    mapPath(ctx,project,footprintCorners(lot),true);
    ctx.fillStyle=color;
    ctx.fill();
  }
  ctx.lineJoin=ctx.lineCap='round';
  for(const {path} of uclWays) {
    mapPath(ctx,project,path.rows.map(row=>row.p));
    ctx.strokeStyle=compact?'#899da0':'#737e81';
    ctx.lineWidth=Math.max(1.1,path.width*2*fit);
    ctx.stroke();
  }
  ctx.lineWidth=.65;
  for(const lot of uclBuildings) {
    for(const part of lot.parts??[lot]) {
      mapPath(ctx,project,footprintCorners(part),true);
      ctx.fillStyle=lot.style==='hospital'||lot.style==='anderson'||lot.style==='grafton'?'#59939b':
        lot.style==='shop'?'#aa7451':lot.style==='brick'||lot.style==='cruciform'?(compact?'#95765f':'#aa7d68'):(compact?'#8f9990':'#9a978a');
      ctx.strokeStyle=compact?'#bfc1a338':'#e7dfce90';
      ctx.fill();ctx.stroke();
    }
  }
  if(uclRouteVisible) {
    mapPath(ctx,project,uclHospitalRoute);
    ctx.strokeStyle=compact?'#a4e2de':'#236b76';
    ctx.lineWidth=compact?1.9:3.5;
    ctx.stroke();
  }
  if(!compact) {
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.font='600 10px system-ui,sans-serif';
    for(const [label,x,z,rotate] of [
      ['Gower Street',-65,52,Math.PI/2],['Gordon Street',59,-26,Math.PI/2],['Torrington Place',-43,87,0],
      ['Gower Place',-8,-73,0],['Gordon Square',89,46,0],['Euston Road',-31,-113,0],
      ['Main Quad',-35,-14,0],['Wilkins Building',8,-19,0],['Cruciform',-95,-4,0],
      ['Student Centre',42,-6,0],['Tottenham Court Rd',-159,85,Math.PI/2],['Grafton Way',-128,-61,0],
      ['Huntley St',-119,59,Math.PI/2],['University Street',-122,25,0],['Goodge Street',-195,155,0],
      ['Warren Street',-197,-87,0],['Tavistock Square',145,45,0],['S&M',-177,-65,0],['lesgo',-143,36,0]
    ]) {
      const [px,py]=project([x,0,z]);
      ctx.save();ctx.translate(px,py);
      ctx.rotate(rotate-north);
      ctx.fillStyle='#283e44';ctx.strokeStyle='#e7e4d4';
      ctx.lineWidth=2.8;ctx.strokeText(label,0,0);ctx.fillText(label,0,0);ctx.restore();
    }
  }
  const [hx,hy]=project(hospitalEntrance), radius=compact?5.8:8.5;
  ctx.beginPath();ctx.arc(hx,hy,radius,0,TAU);
  ctx.fillStyle='#245964';ctx.fill();ctx.lineWidth=1.4;ctx.strokeStyle='#d6ece9';ctx.stroke();
  ctx.font=compact?'700 8px sans-serif':'700 11px sans-serif';
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#eff7f1';
  ctx.fillText('H',hx,hy+.2);
  if(!compact) {
    ctx.font='700 11px system-ui,sans-serif';
    ctx.strokeStyle='#eaf1e8';ctx.lineWidth=2.9;ctx.fillStyle='#20515c';
    ctx.strokeText('UCLH 主入口',hx+6,hy-12);ctx.fillText('UCLH 主入口',hx+6,hy-12);
    ctx.fillStyle='#234149';
    ctx.fillText('北 ↑',width-29,20);
  }
  travelPin(ctx,project,'ucl',compact);
  return {canvas,project,unproject,width,height,dpr,event,focus,exploring,cityView,campus:'ucl',hospitalRoute:uclRouteVisible};
}
