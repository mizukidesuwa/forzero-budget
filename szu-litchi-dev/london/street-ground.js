const londonCrossings=[
  ['gower',junction.quadGate],['gordon',[124,33]],['malet',[69,407]],['bedford',[259,291]],
  ['torrington',[47,194]],['gordonSouth',[203,153]],['euston',[-66,-139]]
];
const londonPaintHeight=ROAD_Y+.024;

function streetArea(points) {
  let twiceArea=0;
  for(let i=0;i<points.length;i++) {
    const a=points[i],b=points[(i+1)%points.length];
    twiceArea+=a[0]*b[1]-a[1]*b[0];
  }
  return twiceArea/2;
}

function streetHalfPlane(points,a,b,side) {
  if(!points.length) return points;
  const distance=p=>side*((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]));
  const result=[];
  let previous=points.at(-1),before=distance(previous);
  for(const point of points) {
    const after=distance(point);
    if((before>=0)!==(after>=0)) {
      const t=before/(before-after);
      result.push([mix(previous[0],point[0],t),mix(previous[1],point[1],t)]);
    }
    if(after>=0) result.push(point);
    previous=point;
    before=after;
  }
  return result;
}

function streetMinus(points,cover) {
  let shared=points;
  for(let i=0;i<cover.length&&shared.length>=3;i++)
    shared=streetHalfPlane(shared,cover[i],cover[(i+1)%cover.length],1);
  if(shared.length<3||streetArea(shared)<.000003) return [points];

  const exposed=[];
  let inside=points;
  for(let i=0;i<cover.length&&inside.length>=3;i++) {
    const a=cover[i],b=cover[(i+1)%cover.length];
    const outside=streetHalfPlane(inside,a,b,-1);
    if(outside.length>=3&&streetArea(outside)>.000003) exposed.push(outside);
    inside=streetHalfPlane(inside,a,b,1);
  }
  return exposed;
}

function londonGroundSurfaces() {
  // Road, courtyard, walkways, then sidewalks. Each area gets a single visible surface.
  const occupied=new Map(),tile=14;
  function surface(mesh,vertices,y,color) {
    const area=streetArea(vertices);
    if(Math.abs(area)<.000003) return;
    if(area<0) vertices.reverse();
    const xs=vertices.map(p=>p[0]),zs=vertices.map(p=>p[1]);
    const left=Math.min(...xs),right=Math.max(...xs),near=Math.min(...zs),far=Math.max(...zs);
    const cells=[],overlaps=new Set();
    for(let x=Math.floor(left/tile);x<=Math.floor(right/tile);x++) {
      for(let z=Math.floor(near/tile);z<=Math.floor(far/tile);z++) {
        const key=x*4096+z;
        if(!occupied.has(key)) occupied.set(key,[]);
        const cell=occupied.get(key);
        cells.push(cell);
        for(const region of cell) {
          if(right>region.left+1e-6&&left<region.right-1e-6&&far>region.near+1e-6&&near<region.far-1e-6)
            overlaps.add(region);
        }
      }
    }
    let pieces=[vertices];
    for(const cover of overlaps) {
      pieces=pieces.flatMap(polygon=>streetMinus(polygon,cover.vertices));
      if(!pieces.length) return;
    }
    for(const outline of pieces) {
      const points=outline.map(([x,z])=>[x,y,z]);
      for(let i=1;i<points.length-1;i++) mesh.triangle(points[0],points[i+1],points[i],color,UP);
    }
    const region={vertices,left,right,near,far};
    for(const cell of cells) cell.push(region);
  }

  function strip(mesh,path,width,y,color) {
    const count=Math.ceil(path.length/2.1);
    const sides=frame=>[-width,width].map(offset=>{
      const [x,,z]=offsetVertex(frame,offset,0);
      return [x,z];
    });
    let [left,right]=sides(courseFrame(path,0));
    for(let i=1;i<=count;i++) {
      const [nextLeft,nextRight]=sides(courseFrame(path,i*path.length/count));
      const quad=[left,nextLeft,nextRight,right],area=streetArea(quad);
      const convex=quad.every((point,k)=>streetArea([point,quad[(k+1)%4],quad[(k+2)%4]])*area>=0);
      if(convex) surface(mesh,quad,y,color);
      else {
        const split=[[left,nextLeft,nextRight],[left,nextRight,right]];
        const alternate=[[left,nextLeft,right],[nextLeft,nextRight,right]];
        const sides=split.every(part=>streetArea(part)*area>0)?split:alternate;
        for(const part of sides) surface(mesh,part,y,color);
      }
      left=nextLeft;
      right=nextRight;
    }
  }
  const roadSurface='#55595b',stone='#c5b9a6';
  for(const {id,path} of uclWays) if(!londonPaths.has(id)) strip(road,path,path.width,ROAD_Y,roadSurface);
  surface(pavement,[[7.82,-27],[55,-27],[55,27],[7.82,27]],ROAD_Y,stone);
  for(const {id,path} of uclWays) if(londonPaths.has(id))
    strip(pavement,path,path.width+.42,ROAD_Y,id==='quad'?stone:'#bab2a6');
  for(const {id,path} of uclWays) if(!londonPaths.has(id))
    strip(pavement,path,path.width+1.80,ROAD_Y,'#b9afa2');
}

function londonMarkingSpace(path,d,offset,padding=0) {
  const [x,,z]=offsetVertex(courseFrame(path,d),offset,0);
  return !(uclStreetIndex.get(streetCell(x,z))??[]).some(segment=>segment.path!==path&&
    streetGapSquared(segment,x,z)<(segment.path.width+padding)**2);
}

function londonStreetPaint() {
  for(const {id,path} of uclWays) {
    if(londonPaths.has(id)) continue;
    const w=path.width,isGower=id==='gower';
    const crossing=londonCrossings.find(([street])=>street===id);
    const crossAt=crossing?pointDistance(path,crossing[1]):-50;
    const clear=(d,offset,half)=>Math.abs(d-crossAt)>half+4.3&&
      [-half,0,half].every(gap=>londonMarkingSpace(path,d+gap,offset,.68));
    const from=1.35,to=path.length-1.35;
    for(let d=from;d<to;d+=2.9) {
      const end=Math.min(to,d+2.9),middle=(d+end)/2;
      for(const side of [-1,1]) {
        const kerb=side*w;
        if(clear(middle,kerb,(end-d)/2))
          ribbon(scenery,path,kerb-.064,kerb+.064,ROAD_Y+.011,'#aaa197',d,end,2.9);
        const cycle=side*(w-1.20);
        if(isGower&&clear(middle,cycle,(end-d)/2))
          ribbon(scenery,path,cycle-.045,cycle+.045,londonPaintHeight,'#d5d0c3',d,end,2.9);
      }
    }
    for(let d=5;d<path.length-5;d+=6.1) {
      if(w>=4.3&&clear(d+1.05,0,1.05))
        ribbon(scenery,path,-.05,.05,londonPaintHeight,'#d4d0c4',d,d+2.1,2.3);
      if(isGower||w<4.3||d%23>=12) continue;
      for(const side of [-1,1]) {
        for(const gap of [.26,.41]) {
          const edge=side*(w-gap);
          if(clear(d+2.7,edge,2.7))
            ribbon(scenery,path,edge-.031,edge+.031,londonPaintHeight,
              id==='euston'||id==='court'?'#a15b54':'#c3a866',d,d+5.4,2.9);
        }
      }
    }
  }
  for(const [id,xy] of londonCrossings) {
    const path=londonRoads.get(id),d=pointDistance(path,xy),frame=courseFrame(path,d);
    if(id==='gower') mainGateCrossing(path,d,frame);
    else {
      const step=(path.width*2-.42)/9, yaw=-Math.atan2(frame.f[2],frame.f[0]);
      for(let i=0;i<9;i++) scenery.box(offsetVertex(frame,(i-4)*step,londonPaintHeight),[2.5,.008,step*.61],'#ddd8cb',yaw);
    }
  }
}

function mainGateCrossing(path,d,frame) {
  const width=path.width,yaw=-Math.atan2(frame.f[2],frame.f[0]);
  // Signal-controlled crossing. The two rows of studs have a clear gap for the gate approach.
  for(const edge of [-1.48,1.48]) {
    for(let side=-width+.29;side<width;side+=.48) {
      const [x,,z]=offsetVertex(courseFrame(path,d+edge),side,0);
      scenery.box([x,londonPaintHeight,z],[.125,.012,.137],'#ebe4d4',yaw);
    }
  }
  for(const side of [-1,1]) {
    const f=courseFrame(path,d+side*3.12);
    const stop=offsetVertex(f,-side*(width-1.31)/2,londonPaintHeight);
    scenery.box(stop,[.225,.012,width-1.50],'#e1dbcb',yaw);
    const curb=offsetVertex(frame,side*(width+.42),ROAD_Y+.014);
    scenery.box(curb,[2.48,.012,.79],'#b3896b',yaw);
    for(let row=-2;row<=2;row++) for(let col=-1;col<=1;col++) {
      const p=add(curb,add(scale(frame.f,row*.41),scale(frame.side,col*.23)));
      scenery.box(add(p,[0,.008,0]),[.066,.013,.075],'#c89d79',yaw);
    }
    const signal=offsetVertex(courseFrame(path,d+side*2.23),side*(width+1.13),0);
    scenery.tube(signal,add(signal,[0,2.7,0]),.065,.059,'#3b4241',8);
    scenery.box(add(signal,[0,2.73,0]),[.29,.67,.23],'#292f2f',yaw);
    scenery.box(add(signal,[0,2.73,0]),[.125,.13,.25],'#768477',yaw);
  }
}
