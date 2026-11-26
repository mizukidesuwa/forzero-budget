const flyover = (() => {
  const path=openStreets[1].path, crossing=pointDistance(path,[-132,-240]);
  const from=crossing-104, to=crossing+104;
  const first=along(path,from), last=along(path,to);
  return {path,crossing,from,to,first,last,half:3.68,top:6.82};
})();

function flyoverHeight(distance) {
  const ramp=clamp((104-Math.abs(distance-flyover.crossing))/74,0,1);
  return CITY_ASPHALT+(flyover.top-CITY_ASPHALT)*ramp*ramp*(3-2*ramp);
}

function flyoverAt(x,z) {
  const {first,last,half,from,to,path}=flyover;
  if(x<first[0]-1||x>last[0]+1||z<Math.min(first[2],last[2])-13||z>Math.max(first[2],last[2])+13) return null;
  let nearest=half*half, distance=null;
  const rows=path.rows;
  const candidates=cityRoadIndex?.get(streetCell(x,z))??[];
  for(const segment of candidates) {
    if(segment.path!==path) continue;
    const dx=x-segment.x,dz=z-segment.z;
    const fraction=clamp((dx*segment.dx+dz*segment.dz)*segment.ratio,0,1);
    const gap=(dx-segment.dx*fraction)**2+(dz-segment.dz*fraction)**2;
    if(gap>=nearest) continue;
    const d=mix(rows[segment.row-1].distance,rows[segment.row].distance,fraction);
    if(d<from||d>to) continue;
    nearest=gap;
    distance=d;
  }
  return distance===null?null:flyoverHeight(distance);
}

function drawFlyover() {
  const {path,half,from,to,crossing}=flyover, shoulder=half+.31;
  const surface=(frame,d,offset,rise=0)=>offsetVertex(frame,offset,flyoverHeight(d)+rise);
  const count=Math.ceil((to-from)/2.4);
  for(let i=0;i<count;i++) {
    const a=mix(from,to,i/count), b=mix(from,to,(i+1)/count);
    const fa=courseFrame(path,a), fb=courseFrame(path,b);
    const y1=flyoverHeight(a),y2=flyoverHeight(b);
    const rail=d=>.35*clamp((flyoverHeight(d)-.08)/1.8,0,1);
    const p=(u,h=0)=>surface(fa,a,u,h), q=(u,h=0)=>surface(fb,b,u,h);
    urban.quad(p(-half,.002),q(-half,.002),q(half,.002),p(half,.002),'#5a6765');
    const under=Math.min(.56,Math.max(y1,y2)-CITY_ASPHALT);
    urban.quad(p(shoulder,-under),q(shoulder,-under),q(-shoulder,-under),p(-shoulder,-under),'#89958d',[0,-1,0]);
    for(const s of [-1,1]) {
      const edge=s*shoulder, inner=s*half;
      const n=scale(fa.side,s), h1=rail(a),h2=rail(b);
      urban.quad(p(inner,h1),q(inner,h2),q(edge,h2),p(edge,h1),'#c4c6b8');
      urban.quad(p(inner,0),q(inner,0),q(inner,h2),p(inner,h1),'#b0b6ac',scale(n,-1));
      urban.quad(p(edge,-Math.min(under,y1-CITY_ASPHALT)),q(edge,-Math.min(under,y2-CITY_ASPHALT)),
        q(edge,h2),p(edge,h1),'#aeb4a8',n);
      urban.quad(p(s*(half-.18)-.032,.012),q(s*(half-.18)-.032,.012),
        q(s*(half-.18)+.032,.012),p(s*(half-.18)+.032,.012),'#dfddc3');
    }
  }
  for(let d=from+1.6;d<to-2;d+=6.8) {
    const a=courseFrame(path,d), b=courseFrame(path,d+3.45);
    urban.quad(surface(a,d,-.058,.014),surface(b,d+3.45,-.058,.014),
      surface(b,d+3.45,.058,.014),surface(a,d,.058,.014),'#e1d0a0');
  }
  for(const offset of [-49,-29,32,53]) {
    const d=crossing+offset, [x,,z]=along(path,d), y=flyoverHeight(d);
    const pillar={x,z,w:2.10,d:2.18};
    citySolid.push(pillar);
    urban.box([x,(y-.52)/2,z],[pillar.w,y-.52,pillar.d],'#b6baaf');
    urban.box([x,y-.76,z],[3.55,.48,2.62],'#a5afa6');
    urban.box([x,.18,z],[2.43,.36,2.51],'#c2c4b5');
  }
}

function walkBridge() {
  const path=openStreets[2].path, d=pointDistance(path,[114,185]);
  const frame=courseFrame(path,d), half=path.width+2.8+1.73, top=5.58;
  const yaw=-Math.atan2(frame.side[2],frame.side[0]);
  const p=(on,y,across=0)=>add(offsetVertex(frame,on,y),scale(frame.f,across));
  scenery.box(p(0,top-.27),[half*2+.55,.54,3.26],'#ccd0c3',yaw);
  for(const side of [-1,1]) {
    scenery.box(p(0,top+.91,side*1.57),[half*2+.42,.12,.11],'#c5cbbd',yaw);
    for(let d=-half;d<half+.2;d+=1.75) scenery.box(p(d,top+.44,side*1.55),[.082,.9,.086],'#788f83',yaw);
  }
  for(const side of [-1,1]) {
    const foot=side*half, [x,,z]=p(foot,0);
    scenery.box(p(foot,(top-.27)/2),[1.52,top-.27,2.02],'#b1b9ad',yaw);
    citySolid.push({x,z,w:1.65,d:2.18});
    const stairs=21, run=.38;
    for(let i=0;i<stairs;i++) {
      const h=top*(1-(i+1)/stairs), offset=-(i+.5)*run;
      if(h>0) scenery.box(p(foot,h/2+.012,offset-1.55),[2.80,h,.39],'#c1c4b5',yaw);
    }
    for(const edge of [-1.36,1.36]) {
      const railStart=p(foot+edge,top+.85,-1.53);
      const railEnd=p(foot+edge,.90,-1.53-stairs*run);
      scenery.tube(railStart,railEnd,.047,.047,'#788c83',5);
      for(let i=0;i<=4;i++) {
        const at=lerpPoint(railStart,railEnd,i/4);
        scenery.tube(add(at,[0,-.88,0]),at,.034,.034,'#84958a',5);
      }
    }
    const base=p(foot,.006,-2.75-stairs*run);
    pavement.box(base,[3.15,.034,3.05],'#cec9b7',yaw);
  }
}
