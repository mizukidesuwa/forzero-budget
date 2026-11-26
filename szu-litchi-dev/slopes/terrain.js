// Terrain centered on Dujuan Hill, east of Upper Wenshan Lake and south of the library.
// The elevations are tuned to the compressed playable campus.
const dujuanHill={x:32,z:140,rx:46,rz:61,height:5.0};
const dujuanFoot=[-2,112], dujuanCrest=[33,144];
const [dujuanEntryX,,dujuanEntryZ]=along(southConnector,pointDistance(southConnector,dujuanFoot));
const dujuanPass=street([[dujuanEntryX,dujuanEntryZ],[.35,120],[4.7,128],[11.7,134.8],
  [21.5,139.1],dujuanCrest,[44,151]],3.40);
roads.push(dujuanPass);
innerSections.push(dujuanPass);

function hillHeight(x,z) {
  const {x:cx,z:cz,rx,rz,height}=dujuanHill;
  const u=(x-cx)/rx,v=(z-cz)/rz;
  const t=1-u*u-v*v;
  return t>0?height*t*t:0;
}

function rideElevation(x,z) {
  return activeCampus==='szu'?hillHeight(x,z):0;
}

function onCampusGround([x,y,z]) {
  return [x,y+rideElevation(x,z),z];
}

function hillGrade(x,z,dx,dz) {
  const step=.56;
  return (hillHeight(x+dx*step,z+dz*step)-hillHeight(x-dx*step,z-dz*step))/(2*step);
}

function riderGrade(position,heading) {
  if(activeCampus!=='szu') return 0;
  const [x,y,z]=position, dx=Math.cos(heading), dz=Math.sin(heading);
  const deck=flyoverAt(x,z);
  if(deck!==null&&y>=deck-.34) {
    const ahead=flyoverAt(x+.56*dx,z+.56*dz)??deck;
    const behind=flyoverAt(x-.56*dx,z-.56*dz)??deck;
    return (ahead-behind)/1.12;
  }
  return hillGrade(x,z,dx,dz);
}

function hillNormal(x,z,nx,ny,nz) {
  const {x:cx,z:cz,rx,rz,height}=dujuanHill;
  const u=(x-cx)/rx,v=(z-cz)/rz,t=Math.max(0,1-u*u-v*v);
  return normalize([nx+ny*4*height*t*u/rx,ny,nz+ny*4*height*t*v/rz]);
}

function raiseHillMesh(shape) {
  if(typeof activeCampus!=='undefined'&&activeCampus!=='szu') return;
  const {vertices}=shape;
  for(let i=0;i<vertices.length;i+=11) {
    const x=vertices[i],z=vertices[i+2];
    if(Math.abs(x-dujuanHill.x)>=dujuanHill.rx||Math.abs(z-dujuanHill.z)>=dujuanHill.rz) continue;
    const height=hillHeight(x,z);
    if(!height) continue;
    vertices[i+1]+=height;
    if(Math.abs(vertices[i+4])>1e-7) {
      const [nx,ny,nz]=hillNormal(x,z,vertices[i+3],vertices[i+4],vertices[i+5]);
      vertices[i+3]=nx;vertices[i+4]=ny;vertices[i+5]=nz;
    }
  }
}

function drawHillGround() {
  const {x,z,rx,rz}=dujuanHill,columns=24,rows=36;
  const start=terrain.vertices.length/11;
  for(let row=0;row<=rows;row++) for(let col=0;col<=columns;col++) {
    const xx=x+rx*(2*col/columns-1),zz=z+rz*(2*row/rows-1);
    const h=hillHeight(xx,zz), normal=hillNormal(xx,zz,0,1,0);
    const shade=Math.min(1,h/dujuanHill.height);
    const grass=rgb('#789454').map((value,i)=>mix(value,[.44,.55,.28][i],shade*.74));
    terrain.vertex([xx,h-.0123,zz],normal,grass);
    if(!row||!col) continue;
    const end=start+row*(columns+1)+col,a=end-columns-2;
    if(h||terrain.vertices[(a+1)*11+1]>-.0123||terrain.vertices[(a+columns+1)*11+1]>-.0123||
      terrain.vertices[a*11+1]>-.0123) terrain.indices.push(a,a+columns+1,end,a,end,a+1);
  }
}

function sculptCampusHill() {
  const frame=courseFrame(dujuanPass,8.5);
  const [x,,z]=offsetVertex(frame,dujuanPass.width+1.1,0);
  placeTravelSign(x,z,'杜鹃山','坡道',Math.atan2(-frame.f[0],-frame.f[2]));
  for(const mesh of [road,pavement,masonry,scenery,foliage]) raiseHillMesh(mesh);
  for(const {shape} of signs) raiseHillMesh(shape);
  drawHillGround();
}

function drawHillContours(ctx,project,compact) {
  for(const height of [1,2.5,4.0]) {
    const r=Math.sqrt(1-Math.sqrt(height/dujuanHill.height));
    const {x,z,rx,rz}=dujuanHill;
    const points=Array.from({length:40},(_,i)=>[x+rx*r*Math.cos(i*TAU/40),0,z+rz*r*Math.sin(i*TAU/40)]);
    mapPath(ctx,project,points,true);
    ctx.lineWidth=.8;
    ctx.strokeStyle=compact?'#c2ce9b5a':'#747f4f8a';
    ctx.stroke();
  }
}
