const uclFixtures=[];

function londonPaving(mesh,outline,y,color) {
  const points=outline.map(([x,z])=>[x,y,z]);
  for(let i=1;i<points.length-1;i++) mesh.triangle(points[0],points[i],points[i+1],color,[0,1,0]);
}

function londonFence(a,b,gap=0) {
  const [x,z]=a, [xx,zz]=b, length=Math.hypot(xx-x,zz-z), yaw=-Math.atan2(zz-z,xx-x);
  const segment=(from,to)=>{
    const ux=mix(x,xx,(from+to)/2), uz=mix(z,zz,(from+to)/2);
    const span=(to-from)*length;
    uclFixtures.push(campusFootprint(ux,uz,span,.12,yaw,1.13));
    const rail='#343d3d';
    for(const y of [.28,1.01]) scenery.box([ux,y,uz],[span,.071,.077],rail,yaw);
    const count=Math.ceil(span/.77);
    for(let i=0;i<=count;i++) {
      const t=mix(from,to,i/count);
      scenery.box([mix(x,xx,t),.59,mix(z,zz,t)],[.065,1.17,.065],rail);
    }
  };
  if(gap>0&&gap<length) {
    const split=gap/(2*length);
    segment(0,.5-split);segment(.5+split,1);
  } else segment(0,1);
}

function uclGardenMeshes() {
  for(const {name,outline,center:[x,z]} of londonGardens) {
    lawnPatch(pavement,()=>londonPaving(pavement,outline,.030,'#778b60'));
    for(let i=0;i<outline.length;i++) {
      const a=outline[i],b=outline[(i+1)%outline.length];
      const len=Math.hypot(a[0]-b[0],a[1]-b[1]);
      londonFence(a,b,len>22?3.7:0);
      if(len<19) continue;
      const mid=[mix(a[0],b[0],.5),mix(a[1],b[1],.5)];
      const path=street([[x,z],mid],1.12);
      ribbon(pavement,path,-1.12,1.12,.047,'#c2baa4',0,path.length,2.3);
      for(const t of [.2,.76]) {
        const tx=mix(mix(a[0],b[0],t),x,.17), tz=mix(mix(a[1],b[1],t),z,.17);
        if(!uclStreetAt(tx,tz,2.5)&&!uclBuildingAt(tx,tz,1.4)) deciduous(tx,tz,1.06+i*.042,i%2);
      }
      bench(mix(x,mid[0],.51)+2.5,mix(z,mid[1],.51),Math.atan2(b[1]-a[1],b[0]-a[0]));
    }
    if(name==='Russell Square') {
      scenery.tube([x,.07,z],[x,.45,z],3.05,2.90,'#b9b4a7',32);
      scenery.tube([x,.44,z],[x,.46,z],2.50,2.50,'#819e9d',32);
      scenery.tube([x,.43,z],[x,1.49,z],.33,.11,'#a7b7af',14);
      uclFixtures.push(campusFootprint(x,z,5.7,5.7,0,.5));
    }
  }
}

function uclMainQuad() {
  for(const lot of uclQuadPlanting) {
    lotBox(lot,0,.051,0,lot.w+.24,.058,lot.depth+.25,'#bfae99',scenery);
    lawnPatch(scenery,()=>lotBox(lot,0,.079,0,lot.w,.031,lot.depth,'#788b58',scenery));
    deciduous(lot.x-4.3,lot.z,1.76,0);
    deciduous(lot.x+11.4,lot.z+Math.sign(lot.z)*2.2,1.57,2);
    bench(lot.x+4.5,lot.z-Math.sign(lot.z)*5.3,lot.z<0?0:Math.PI);
  }
  mainQuadGates();
  for(const sign of [-1,1]) {
    const x=29,z=sign*8.7;
    const disk=(y,h,r1,r2,c,n)=>masonry.tube([x,y,z],[x,y+h,z],r1,r2,c,n);
    disk(.055,.22,2.21,2.15,'#b4a694',8);
    disk(.275,2.77,2.04,2.04,'#d2c6af',8);
    disk(3.045,.18,2.14,2.14,'#c0b6a1',16);
    for(let i=0;i<6;i++) {
      const a=i*Math.PI/12,b=(i+1)*Math.PI/12;
      disk(3.225+1.46*Math.sin(a),1.46*(Math.sin(b)-Math.sin(a)),2.10*Math.cos(a),2.10*Math.cos(b),'#6e8580',24);
    }
    for(let i=0;i<8;i++) {
      const a=(i+.5)*TAU/8, nx=Math.cos(a),nz=Math.sin(a);
      wallPanel(masonry,x+nx*1.96,1.64,z+nz*1.96,.76,1.30,'#52605c',nx,nz);
    }
    uclFixtures.push(campusFootprint(x,z,4.05,4.05,0,4.69));
    for(const center of [17.8,39.6]) {
      const bed=campusFootprint(center,sign*17.5,6.2,3.4);
      lotBox(bed,0,.28,0,bed.w,.52,bed.depth,'#bfafa1',scenery);
      for(let i=-2;i<=2;i++) foliage.ellipsoid(lotPoint(bed,i*1.08,.67,(i%2)*.39),
        [.79,.52+Math.abs(i)*.08,.68],i%2?'#738057':'#82915e',7,4);
      uclFixtures.push(lotPart(bed,0,0,bed.w,bed.depth,.68));
    }
  }
  const slade=uclLots.find(lot=>lot.name==='Slade School of Fine Art');
  const stone=facadeOf(slade,0);
  const base=stone.point(-6,0,0);
  masonry.tube(base,add(base,[0,10.3,0]),3.1,3.1,'#d0c3ab',28);
  masonry.tube(add(base,[0,10.3,0]),add(base,[0,10.59,0]),3.31,3.31,'#e0d0b7',28);
  for(const angle of [-.82,0,.82]) {
    const nx=Math.sin(angle), nz=Math.cos(angle);
    for(const y of [3.10,6.20,8.9])
      wallPanel(masonry,base[0]+nx*3.12,y,base[2]+nz*3.12,.80,1.64,'#657276',nx,nz);
  }
  uclFixtures.push(campusFootprint(base[0],base[2],5.8,5.8,0,10.6));
  const arrival=campuses.ucl.arrival;
  placeTravelSign(arrival[0]+2,arrival[2]-7.4,'UCL 返程点','返回深圳大学',Math.PI/2);
}

function uclStreetFurniture() {
  for(const {id,path} of uclWays) {
    if(londonPaths.has(id)) continue;
    const side=id==='gower'||id==='bedford'?1:-1;
    for(let d=16;d<path.length-10;d+=32) {
      const [x,,z]=offsetVertex(courseFrame(path,d),side*(path.width+1.21),0);
      if(id==='gower'&&Math.abs(z)<7.8) continue;
      if(busStops.some(stop=>Math.hypot(stop.x-x,stop.z-z)<5.3)) continue;
      if(!uclStreetAt(x,z,.76)&&!uclBuildingAt(x,z,.45)) londonLantern(x,z);
    }
  }
}

function buildUclWorld() {
  terrain.quad([-500,-.021,-475],[700,-.021,-475],[700,-.021,810],[-500,-.021,810],'#a5a09a',[0,1,0]);
  londonGroundSurfaces();
  londonStreetPaint();
  uclMainQuad();
  uclGardenMeshes();
  studentGardenMeshes();
  pavement.box([hospitalEntrance[0],.018,hospitalEntrance[2]],[21,.036,4.92],'#bebeb5');
  pavement.box([83,.022,420],[16,.044,26],'#c7bca9');
  pavement.box([201,.021,282],[19,.042,61],'#bbb3a6');
  const shopLabels=[];
  for(const lot of uclBuildings) renderLondonBuilding(lot,shopLabels);
  placeShopSigns(shopLabels);
  londonStreetSigns();
  londonTransportMeshes();
  senateForecourt();
  uclStreetFurniture();
  londonPlantedStreets();
  for(const [x,z,size] of [[21,110,1],[104,160,.93],[191,245,.92],[210,343,1.1],[84,447,1.06],
    [257,369,.99],[285,365,1.2],[337,336,1.1],[13,-80,.88],[-117,38,1.0]]) {
    if(!uclStreetAt(x,z,2.3)&&!uclBuildingAt(x,z,2.3)) deciduous(x,z,size,1);
  }
  indexGroundSurfaces();
  for(const event of londonCourses) refineLondonRace(event);
}
