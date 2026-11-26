const CITY_ASPHALT = ROAD_Y - .004;
const CITY_EDGE_MARGIN = .28;
const cityJunctions = [];

function nearestCitySegment(x,z,skip=null,extra=0,shoulders=true) {
  cityRoadIndex ??= indexStreets(cityRoads.keys());
  const cell=cityRoadIndex.get(streetCell(x,z))??[];
  let best=Infinity, selected=null;
  for(const segment of cell) {
    if(segment.path===skip) continue;
    const info=cityRoads.get(segment.path);
    const width=info.width+(shoulders?info.shoulder:0)+extra;
    const gap=streetGapSquared(segment,x,z);
    if(gap<best&&gap<=width*width) {best=gap;selected=info;}
  }
  return selected;
}

function junctionContains(polygon,x,z) {
  return x>=polygon.minX&&x<=polygon.maxX&&z>=polygon.minZ&&z<=polygon.maxZ&&
    inOutline(x,z,polygon.points);
}

function cityStreetAt(x,z) {
  const hit=nearestCitySegment(x,z,null,CITY_EDGE_MARGIN);
  if(hit) return hit;
  return cityJunctions.find(j=>junctionContains(j.paving,x,z))?.roads[0];
}

function cityRoadContains(info,x,z,extra=0) {
  const cell=cityRoadIndex?.get(streetCell(x,z))??[];
  const reach=info.width+info.shoulder+extra;
  return cell.some(segment=>segment.path===info.path&&streetGapSquared(segment,x,z)<=reach*reach);
}

function extendAvenue(path,before,after) {
  const tail=(d,amount,direction)=>{
    const frame=courseFrame(path,d), count=Math.ceil(amount/3.2);
    return Array.from({length:count},(_,i)=>add(frame.p,scale(frame.f,direction*amount*(i+1)/count)));
  };
  return travelTable([...tail(0,before,-1).reverse(),...path.rows.map(row=>row.p),...tail(path.length,after,1)],path.width);
}

function roadClearsBuilding(x,z,halfW,halfD) {
  return [...cityRoads.values()].every(info=>info.path.rows.every(({p})=>{
    const dx=Math.max(0,Math.abs(p[0]-x)-halfW), dz=Math.max(0,Math.abs(p[2]-z)-halfD);
    const edge=info.width+info.shoulder+1.25;
    return dx*dx+dz*dz>edge*edge;
  }));
}

function roadInfoAt(x,z) {
  cityRoadIndex ??= indexStreets(cityRoads.keys());
  const cell=cityRoadIndex.get(streetCell(x,z))??[];
  const hits=new Set();
  for(const segment of cell) {
    const info=cityRoads.get(segment.path);
    if(hits.has(info)) continue;
    const width=info.width+info.shoulder+CITY_EDGE_MARGIN;
    if(streetGapSquared(segment,x,z)<=width*width) hits.add(info);
  }
  for(const junction of cityJunctions) {
    if(junctionContains(junction.paving,x,z)) for(const info of junction.roads) hits.add(info);
  }
  return hits;
}

function roadEdgeCrossing(a,b,da,db,sa,sb,w1,w2) {
  const fa=courseFrame(a,da),fb=courseFrame(b,db);
  const sideA=Math.sign(dot(fa.side,fb.f))*sb;
  const sideB=Math.sign(dot(fb.side,fa.f))*sa;
  const shoulders=[sideA*w1,sideB*w2];
  const edge=(path,station,side,direction)=>{
    const reach=58,count=48;
    return Array.from({length:count+1},(_,i)=>{
      const d=clamp(station+direction*(-2+i*reach/count),0,path.length);
      return {d,p:offsetVertex(courseFrame(path,d),side,0)};
    });
  };
  const points=[edge(a,da,shoulders[0],sa),edge(b,db,shoulders[1],sb)];
  function cross2(a,b) { return a[0]*b[2]-a[2]*b[0]; }
  for(let i=1;i<points[0].length;i++) {
    const start=points[0][i-1], end=points[0][i], u=subtract(end.p,start.p);
    for(let j=1;j<points[1].length;j++) {
      const left=points[1][j-1], right=points[1][j], v=subtract(right.p,left.p);
      const det=cross2(u,v);
      if(Math.abs(det)<.00001) continue;
      const diff=subtract(left.p,start.p), s=cross2(diff,v)/det, t=cross2(diff,u)/det;
      if(s<0||s>1||t<0||t>1) continue;
      return {corner:lerpPoint(start.p,end.p,s),da:mix(start.d,end.d,s),db:mix(left.d,right.d,t),shoulders};
    }
  }
  return null;
}

function cornerApron(a,b,da,db,sa,sb,w1,w2,rounding) {
  const intersection=roadEdgeCrossing(a,b,da,db,sa,sb,w1,w2);
  if(!intersection) return null;
  const {corner,shoulders}=intersection;
  const fa=courseFrame(a,intersection.da+sa*rounding), fb=courseFrame(b,intersection.db+sb*rounding);
  const first=offsetVertex(fa,shoulders[0]*.99,0),last=offsetVertex(fb,shoulders[1]*.99,0);
  const root=add(corner,scale(add(scale(fa.f,sa),scale(fb.f,sb)),-1.8));
  const points=[root];
  for(let i=0;i<=8;i++) {
    const t=i/8;
    points.push(lerpPoint(lerpPoint(first,corner,t),lerpPoint(corner,last,t),t));
  }
  const flat=points.map(([x,,z])=>[x,z]);
  return {points:flat,minX:Math.min(...flat.map(p=>p[0])),maxX:Math.max(...flat.map(p=>p[0])),
    minZ:Math.min(...flat.map(p=>p[1])),maxZ:Math.max(...flat.map(p=>p[1]))};
}

function junctionSurface(mesh,polygon,y,color) {
  const points=polygon.points.map(([x,z])=>[x,y,z]);
  for(let i=1;i<points.length-1;i++) mesh.triangle(points[0],points[i],points[i+1],color);
}

function drawPublicJunctions() {
  const [nanhai,shennan,baishi,east]=openStreets.map(({path})=>path);
  const pairs=[
    [nanhai,shennan,[-132,-240]], [nanhai,baishi,[-223,261]],
    [shennan,east,[295,-216]], [baishi,east,[172,175]]
  ];
  for(const [a,b,xy] of pairs) {
    const distances=[pointDistance(a,xy),pointDistance(b,xy)];
    const fa=courseFrame(a,distances[0]), fb=courseFrame(b,distances[1]);
    const det=fa.f[0]*fb.f[2]-fa.f[2]*fb.f[0];
    if(Math.abs(det)<.38) continue;
    const info=[cityRoads.get(a),cityRoads.get(b)];
    for(const sa of [-1,1]) for(const sb of [-1,1]) {
      const available=(path,d,sign)=>sign<0?d:path.length-d;
      if(available(a,distances[0],sa)<b.width+2 || available(b,distances[1],sb)<a.width+2) continue;
      const [da,db]=distances;
      const asphalt=cornerApron(a,b,da,db,sa,sb,a.width,b.width,5.3);
      const paving=cornerApron(a,b,da,db,sa,sb,a.width+info[0].shoulder,b.width+info[1].shoulder,4.7);
      if(!asphalt||!paving) continue;
      cityJunctions.push({asphalt,paving,roads:info});
      junctionSurface(road,asphalt,CITY_ASPHALT,'#586765');
      junctionSurface(pavement,paving,.017,'#cec9b7');
    }
  }
}

function pavedJunctionAt(x,z,path) {
  return nearestCitySegment(x,z,path,.62,false) ||
    cityJunctions.some(j=>junctionContains(j.asphalt,x,z));
}

function publicMarking(path,offset,width,from,to,color) {
  const clear=d=>{
    const [x,,z]=offsetVertex(courseFrame(path,d),offset,0);
    if(pavedJunctionAt(x,z,path)) return false;
    const hit=nearestStreet(x,z);
    return !hit.street||hit.distance>hit.street.width+.45;
  };
  const count=Math.ceil((to-from)/1.18);
  let start=null;
  for(let i=0;i<count;i++) {
    const a=mix(from,to,i/count), b=mix(from,to,(i+1)/count);
    const paint=clear(a)&&clear((a+b)/2)&&clear(b);
    if(paint) {
      start??=a;
      if(i+1===count) ribbon(masonry,path,offset-width,offset+width,CITY_ASPHALT+.008,color,start,b,2.65);
    } else if(start!==null) {
      ribbon(masonry,path,offset-width,offset+width,CITY_ASPHALT+.008,color,start,a,2.65);
      start=null;
    }
  }
}

function drawCityLinks() {
  for(const {path} of [...cityLinks,...canghaiStreets]) {
    const w=path.width, edge=w+cityRoads.get(path).shoulder;
    ribbon(pavement,path,-edge,edge,.017,'#cec9b7',0,path.length,.80);
    ribbon(road,path,-w,w,CITY_ASPHALT,'#586765',0,path.length,.69);
    for(const side of [-1,1]) publicMarking(path,side*(w-.19),.041,0,path.length,'#d1d2b9');
  }
}

function publicStreetMeshes() {
  drawPublicJunctions();
  for(const {path} of openStreets) {
    const w=path.width, edge=w+cityRoads.get(path).shoulder;
    ribbon(pavement,path,-edge,edge,.017,'#cec9b7',0,path.length,1.45);
    ribbon(road,path,-w,w,CITY_ASPHALT,'#586765',0,path.length,1.45);
    for(const side of [-1,1]) publicMarking(path,side*(w-.33),.047,0,path.length,'#c9cabe');
    for(let d=5;d<path.length-5;d+=9.25) {
      if(path!==flyover.path||d+4.4<flyover.from||d>flyover.to)
        publicMarking(path,0,.058,d,d+4.4,'#d7c692');
      const lanes=w>=12?[.27,.62]:[.46];
      for(const side of [-1,1]) for(const lane of lanes)
        publicMarking(path,side*w*lane,.054,d,d+4.4,'#dddcc5');
    }
    for(let d=14;d<path.length-10;d+=35) {
      const frame=courseFrame(path,d), [x,,z]=offsetVertex(frame,w+1.12,0);
      if(!inCampus(x,z)&&!pavedJunctionAt(x,z,path)) lamppost(x,z,scale(frame.side,-1));
    }
    for(let d=31;d<path.length-14;d+=46) {
      const frame=courseFrame(path,d), [x,,z]=offsetVertex(frame,-w-1.75,0);
      if(inCampus(x,z)) continue;
      const size=range(.82,1.02);
      if(!pavedJunctionAt(x,z,path)) palm(x,z,size);
    }
  }
  drawFlyover();
  for(const [index,distance] of [[0,.51],[1,.64],[2,.51]]) {
    const lane=openStreets[index],frame=courseFrame(lane.path,lane.path.length*distance);
    const p=offsetVertex(frame,lane.path.width+1.8,3.75);
    const yaw=Math.atan2(-frame.f[0],-frame.f[2]);
    urban.tube([p[0],0,p[2]],[p[0],3.8,p[2]],.068,.063,'#677d72',8);
    plate(namedSign(lane.name,'','#577d6f','#eff2db'),p,3.2,.67,yaw);
  }
}
