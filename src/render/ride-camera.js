import { add, clamp, dot, headingVector, lerpPoint, multiply, normalize, perspective, scale, subtract, unitRight, viewAt } from '../core/math.js';
import { alternateCamera } from '../data/interface.js';
import { speedFov } from '../ride/physics.js';
import { along } from '../world/geometry.js';
import { buildingAt, cityWallAt, rideElevation } from '../world/query.js';

function cameraWallHit(x, z, y) {
  return Boolean(buildingAt(x, z, .3, y)) || cityWallAt(x, z, y);
}

function avoidWall(origin,eye) {
  const steps = 20;
  let clear = 0;
  for (let i = 1; i <= steps; i++) {
    const part = i / steps;
    const point = lerpPoint(origin, eye, part);
    if (cameraWallHit(point[0], point[2], point[1])) {
      let lo = clear, hi = part;
      for (let k = 0; k < 8; k++) {
        const mid = (lo + hi) * .5;
        const probe = lerpPoint(origin, eye, mid);
        if (cameraWallHit(probe[0], probe[2], probe[1])) hi = mid;
        else lo = mid;
      }
      return lerpPoint(origin, eye, Math.max(0, lo - .006));
    }
    clear = part;
  }
  return eye;
}

function cameraProjection(eye, target, aspect, fov, near, postcard, stretch) {
  const view = viewAt(eye,target), tan = Math.tan(fov/2);
  return {...view,eye,target,postcard,speedFov:stretch,tangent:[tan*aspect,tan],
    vp:multiply(perspective(fov,aspect,near,1200),view.matrix)};
}

export function rideCamera(race, aspect, prior, dt, mode, reducedMotion) {
  const rider = race.rider;
  const f = headingVector(rider.heading), s = unitRight(f), p = rider.position;
  const portrait = aspect < 1, postcard = mode === 'third' && race.phase === 'free' && !race.moved;
  if (mode === 'first') {
    const { eye: heights, forward, look, near } = alternateCamera.first;
    const origin = add(p, [0, heights[rider.vehicle] ?? heights.bike, 0]);
    const eye = avoidWall(origin, add(origin, scale(f, forward)));
    const target = add(eye, scale(f, look));
    target[1] += clamp((rideElevation(target[0],target[2]) - rideElevation(p[0],p[2])) * .5, -2, 2);
    const stretch = reducedMotion ? 0 : speedFov(rider, prior, dt);
    return cameraProjection(eye, target, aspect, (portrait ? 1.05 : .99) + stretch, near, false, stretch);
  }
  let eye, target;
  if (mode === 'second') {
    const { forward, side, height, lookHeight } = alternateCamera.second;
    eye = add(p, add(scale(f, forward), add(scale(s, side), [0, height, 0])));
    target = add(p, [0, lookHeight, 0]);
  } else if (postcard) {
    eye = add(p,add(scale(f,2.35),add(scale(s,8.9),[0,4.15,0])));
    target = add(p,add(scale(f,portrait ? .0 : -1.05),add(scale(s,-3.12),[0,1.64,0])));
  } else {
    const distance=portrait?8.0:8.25;
    eye = add(p,add(scale(f,-distance),add(scale(s,portrait ? .6 : 1.24),[0,4.02,0])));
    target=add(p,add(scale(f,6.25+Math.max(0,rider.speed)*.087),[0,2.49,0]));
    if(race.phase==='race'&&race.onGuide&&race.nextGate>0) {
      const ahead = along(race.event.path, race.progressEstimate + 9.5 + Math.max(0, rider.speed) * .23);
      const look=normalize(subtract(ahead,p));
      if(dot(f,look)>.72) target=lerpPoint(target,[ahead[0],p[1]+2.49,ahead[2]],.145);
    }
  }
  target[1]+=rideElevation(target[0],target[2])-rideElevation(p[0],p[2]);
  let origin = add(p,add(scale(f,-.57),[0,2.7,0]));
  if (cameraWallHit(origin[0],origin[2],origin[1])) origin = [p[0],p[1]+2.15,p[2]];
  eye[1]=Math.max(eye[1],rideElevation(eye[0],eye[2])+1.45);
  eye = avoidWall(origin,eye);
  if (prior && !reducedMotion) {
    const smooth = 1 - Math.exp(-dt * (prior.postcard === postcard ? 7.85 : 4.9));
    eye = lerpPoint(prior.eye,eye,smooth);
    target = lerpPoint(prior.target,target,smooth);
    eye[1]=Math.max(eye[1],rideElevation(eye[0],eye[2])+1.45);
    eye = avoidWall(origin,eye);
  }
  const stretch=reducedMotion||postcard?0:speedFov(rider,prior,dt);
  const fov=(postcard?(portrait?.88:.81):portrait?1.01:.96)+stretch;
  return cameraProjection(eye, target, aspect, fov, .56, postcard, stretch);
}

