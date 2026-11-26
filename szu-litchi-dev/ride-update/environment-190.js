const puddleCourseStations={
  szu:[['libraries',.13,.32,.61,.83],['lakes',.16,.39,.67],['lixiang-park',.23,.49,.75]],
  ucl:[['quad-sprint',.18,.40,.69],['square-circuit',.17,.38,.63,.86],['store-museum-gp',.24,.49,.76]],
  shunde:[['qingyun-lake',.075,.18,.30,.42,.53,.66,.79,.91],['shenbu-climb',.12],['shenbu-descent',.90]]
};
const puddleCache=new Map();

function rainPuddleSites(campus) {
  if(puddleCache.has(campus)) return puddleCache.get(campus);
  const sites=[];
  for(const [id,...stations] of puddleCourseStations[campus]??[]) {
    const path=coursesByCampus[campus].find(event=>event.id===id)?.path;
    if(!path) continue;
    for(const fraction of stations) {
      const {p:[x,,z]}=courseFrame(path,path.length*fraction);
      const r=1.06+(sites.length%3)*.12;
      sites.push({x,z,r,r2:r*r});
    }
  }
  puddleCache.set(campus,sites);
  return sites;
}

function rainPuddleAt(campus,x,z,rain) {
  if(!rain) return false;
  return rainPuddleSites(campus).some(site=>(x-site.x)**2+(z-site.z)**2<=site.r2);
}

function rainPuddleShape(campus) {
  const shape=new Shape();
  for(const {x,z,r} of rainPuddleSites(campus)) {
    const vertex=(dx,dz,offset=0)=>[x+dx,rideElevation(x+dx,z+dz)+ROAD_Y+.006+offset,z+dz];
    const center=vertex(0,0);
    const rim=Array.from({length:7},(_,i)=>{
      const a=i*TAU/7, uneven=r*(.88+(i%3)*.053);
      return vertex(Math.cos(a)*uneven,Math.sin(a)*uneven);
    });
    for(let i=0;i<rim.length;i++) shape.triangle(center,rim[(i+1)%rim.length],rim[i],i%2?'#859eab':'#9cb4c0');
    shape.triangle(vertex(-r*.61,0,.002),vertex(r*.49,r*.08,.002),vertex(r*.48,-r*.09,.002),'#c5d6db');
  }
  return shape;
}

const knownWindMode=value=>value==='steady'?'steady':'gust';

function gustWind(base,clock,seed,mode) {
  if(!base||knownWindMode(mode)==='steady') return base;
  const text=String(seed??0);
  let hash=2166136261;
  for(let i=0;i<text.length;i++) hash=Math.imul(hash^text.charCodeAt(i),16777619);
  const phase=(hash>>>0)/4294967296*TAU;
  const t=Number.isFinite(clock)?clock:0;
  const a=Math.sin(t*.46+phase), b=Math.sin(t*.93+phase*.71);
  const angle=base.angle+(.73*b+.27*a)*Math.PI/15;
  return {...base,angle,vector:[Math.cos(angle),Math.sin(angle)],speed:base.speed*(1+.145*a+.075*b)};
}

function shelteredWind(wind,rider,dt,campus=activeCampus) {
  if(!wind) {
    rider.windExposure=1;
    return null;
  }
  const [x,y,z]=rider.position, [dx,dz]=wind.vector;
  const sheltered=[7,16].some(distance=>{
    const px=x-dx*distance,pz=z-dz*distance;
    return buildingAt(px,pz,0,y+2)||cityWallAt(px,pz,y+2)||
      (campus==='shunde'&&parkHeight(px,pz)>y+2.5);
  });
  rider.windExposure=mix(rider.windExposure??1,sheltered?.35:1,1-Math.exp(-5*dt));
  return {...wind,speed:wind.speed*rider.windExposure};
}
