import { CITY_ASPHALT, clamp, mix, normalize } from '../../../core/math.js';
import { flyoverClearance } from '../../../data/traffic.js';
import { along, pointDistance, streetCell } from '../../geometry.js';
import { cityRoadIndex, openStreets } from './layout.js';

// Terrain centered on Dujuan Hill, east of Upper Wenshan Lake and south of the library.
// The elevations are tuned to the compressed playable campus.
const dujuanHill={x:32,z:140,rx:46,rz:61,height:5.0};

function hillHeight(x,z) {
  const {x:cx,z:cz,rx,rz,height}=dujuanHill;
  const u=(x-cx)/rx,v=(z-cz)/rz;
  const t=1-u*u-v*v;
  return t>0?height*t*t:0;
}

function hillGrade(x,z,dx,dz) {
  const step=.56;
  return (hillHeight(x+dx*step,z+dz*step)-hillHeight(x-dx*step,z-dz*step))/(2*step);
}

function szuRiderGrade(position, heading) {
  const [x, y, z] = position, dx = Math.cos(heading), dz = Math.sin(heading);
  const deck = flyoverAt(x, z);
  if (deck !== null && y >= deck - flyoverClearance.deckTolerance) {
    const ahead = flyoverAt(x + .56 * dx, z + .56 * dz) ?? deck;
    const behind = flyoverAt(x - .56 * dx, z - .56 * dz) ?? deck;
    return (ahead - behind) / 1.12;
  }
  return hillGrade(x, z, dx, dz);
}

function hillNormal(x,z,nx,ny,nz) {
  const {x:cx,z:cz,rx,rz,height}=dujuanHill;
  const u=(x-cx)/rx,v=(z-cz)/rz,t=Math.max(0,1-u*u-v*v);
  return normalize([nx+ny*4*height*t*u/rx,ny,nz+ny*4*height*t*v/rz]);
}

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

export { dujuanHill, hillHeight, hillGrade, hillNormal, szuRiderGrade, flyover, flyoverHeight, flyoverAt };
