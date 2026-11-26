function londonGateSpan(frame,fallback) {
  const street=uclStreetAt(frame.p[0],frame.p[2],.88);
  const reach=Math.min(9.2,(street?.width??fallback)+1.3);
  const edge=side=>{
    for(let distance=.22;distance<=reach;distance+=.22) {
      const point=offsetVertex(frame,side*distance,0);
      const clear=[-.87,0,.87].every(step=>{
        const [x,,z]=add(point,scale(frame.f,step));
        return canRideUcl(x,z)&&uclStreetAt(x,z,.72);
      });
      if(!clear) return side*(distance-.22);
    }
    return side*reach;
  };
  const minCross=edge(-1),maxCross=edge(1);
  return {minCross,maxCross,half:Math.max(-minCross,maxCross)};
}

function projectLondonCourse(event,position,direction,covered,gate) {
  const street=uclStreetAt(position[0],position[2],.95);
  if(!street) return null;
  const reach=Math.min(7.9,street.width+.82),{markers,markerStep}=event;
  const first=Math.max(0,Math.floor((covered-8)/markerStep));
  const last=Math.min(markers.length-1,Math.ceil(Math.min(gate.distance+3.5,covered+20)/markerStep));
  let best=Infinity,progress=null;
  for(let i=first;i<last;i++) {
    const a=markers[i],b=markers[i+1];
    const v=subtract(b.p,a.p),len2=dot(v,v);
    if(len2<.01||dot(v,direction)<-.34*Math.sqrt(len2)) continue;
    const fraction=clamp(dot(subtract(position,a.p),v)/len2,0,1);
    const here=lerpPoint(a.p,b.p,fraction),gap=(here[0]-position[0])**2+(here[2]-position[2])**2;
    if(gap>reach*reach) continue;
    const distance=mix(a.distance,b.distance,fraction);
    if(distance>gate.distance+3.5) continue;
    const score=gap+.026*(distance-covered)**2;
    if(score<best) {best=score;progress=distance;}
  }
  return progress;
}

function refineLondonRace(event) {
  for(const gate of event.gates) Object.assign(gate,londonGateSpan(gate,event.path.width));
  event.corners=brakingCorners(event);
  event.benchmark.corners=referenceCornerScores(event,event.benchmark);
  event.cuts=buildCornerCuts(event);
  const candidates=[...new Set(event.cuts.flat())]
    .filter(cut=>cut.to-cut.from-cut.path.length>=2.5&&cut.path.length>=6.0);
  candidates.sort((a,b)=>(b.to-b.from-b.path.length)-(a.to-a.from-a.path.length));
  event.londonLines=[];
  for(const cut of candidates) {
    if(event.londonLines.every(line=>Math.abs(line.from-cut.from)>38)) event.londonLines.push(cut);
    if(event.londonLines.length>=Math.ceil(event.length/175)) break;
  }
}

function londonGateBanner(gate,shape,decals) {
  const {minCross:left,maxCross:right}=gate;
  const width=Math.max(.22,right-left),centre=(left+right)/2;
  const tone=gate.color??'#d9c8f4',ink='#453660';
  const at=(side,y)=>offsetVertex(gate,side,y);
  const a=at(left+.1,3.49),b=at(right-.1,3.49);
  shape.tube(a,b,.047,.047,ink,7);
  for(const side of [left+.11,right-.11]) {
    shape.tube(at(side,0),at(side,3.52),.067,.06,ink,8);
    shape.tube(at(side,1.91),at(side,2.52),.082,.082,tone,7);
  }
  const sign=signCanvas(720,114,(ctx,w,h)=>{
    ctx.fillStyle=ink;
    ctx.fillRect(0,0,w,h);
    ctx.fillStyle=tone;
    ctx.font='700 54px "Microsoft YaHei",sans-serif';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.fillText(gate.number+'  '+gate.name,w/2,h/2,w-46);
  });
  const yaw=Math.atan2(-gate.f[0],-gate.f[2]);
  const label=at(centre,3.49);
  const span=Math.min(6.7,width*.92);
  plate(sign,add(label,scale(gate.f,-.106)),span,.56,yaw,decals);
  plate(sign,add(label,scale(gate.f,.106)),span,.56,yaw+Math.PI,decals);
  const strips=Math.max(1,Math.round(width/.43));
  for(let i=0;i<strips;i++) {
    const x=mix(left,right,(i+.06)/strips),xx=mix(left,right,(i+.94)/strips);
    const point=(side,depth)=>add(at(side,ROAD_Y+.053),scale(gate.f,depth));
    shape.quad(point(x,-.30),point(xx,-.30),point(xx,.30),point(x,.30),i%2?tone:ink);
  }
}
