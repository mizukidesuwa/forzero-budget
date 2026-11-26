const lawnSpans = [];
let groundSurfaces = null;

function lawnPatch(mesh,draw) {
  const from=mesh.indices.length;
  draw();
  lawnSpans.push({mesh,from,to:mesh.indices.length});
}

function indexGroundSurfaces() {
  const index=new Map();
  const addTriangles=(mesh,from,to,hard)=>{
    const {vertices,indices}=mesh;
    for(let i=from;i<to;i+=3) {
      const a=indices[i]*11, b=indices[i+1]*11, c=indices[i+2]*11;
      if(vertices[a+4]+vertices[b+4]+vertices[c+4]<.6) continue;
      const x=vertices[a], z=vertices[a+2], y=vertices[a+1];
      const bx=vertices[b], bz=vertices[b+2], cx=vertices[c], cz=vertices[c+2];
      const dx=bx-x,dz=bz-z,ex=cx-x,ez=cz-z;
      const det=dx*ez-dz*ex;
      if(Math.abs(det)<.000001) continue;
      const minX=Math.min(x,bx,cx), maxX=Math.max(x,bx,cx), minZ=Math.min(z,bz,cz), maxZ=Math.max(z,bz,cz);
      const triangle={x,z,y,dx,dz,ex,ez,dy:vertices[b+1]-y,ey:vertices[c+1]-y,
        inverse:1/det,minX,maxX,minZ,maxZ,hard};
      for(let col=Math.floor(minX/ROAD_CELL);col<=Math.floor(maxX/ROAD_CELL);col++) {
        for(let row=Math.floor(minZ/ROAD_CELL);row<=Math.floor(maxZ/ROAD_CELL);row++) {
          const key=col*4096+row;
          if(!index.has(key)) index.set(key,[]);
          index.get(key).push(triangle);
        }
      }
    }
  };
  addTriangles(pavement,0,pavement.indices.length,true);
  for(const {mesh,from,to} of lawnSpans) addTriangles(mesh,from,to,false);
  lawnSpans.length=0;
  groundSurfaces=index;
}

function pavedGroundAt(x,z) {
  const triangles=groundSurfaces?.get(streetCell(x,z));
  if(!triangles) return false;
  let top=-Infinity, hard=false;
  for(const face of triangles) {
    if(x<face.minX||x>face.maxX||z<face.minZ||z>face.maxZ) continue;
    const dx=x-face.x, dz=z-face.z;
    const u=(dx*face.ez-dz*face.ex)*face.inverse;
    const v=(face.dx*dz-face.dz*dx)*face.inverse;
    if(u<-.00001||v<-.00001||u+v>1.00001) continue;
    const height=face.y+u*face.dy+v*face.ey;
    if(height>=top-.00001) {top=height;hard=face.hard;}
  }
  return hard;
}
