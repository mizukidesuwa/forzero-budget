import {
  ORIGIN, TAU, add, clamp, lerpPoint, mix, multiply, normalize, placement, scale, subtract, transform,
} from '../core/math.js';
import { Shape } from '../core/shape.js';
import { bicyclePaints, bicycleStyle } from './vehicles.js';

export const HUB_Y = .347;
export const REAR = [-.62, HUB_Y, 0];
export const FRONT = [.65, HUB_Y, 0];
export const CRANK = [-.062, .374, 0];
export const SEAT = [-.226, .92, 0];
export const CRANK_RADIUS = .158;
export const TYRE_RADIUS = .347;
const shirt = '#e87542';
const sleeve = '#e98752';
const skin = '#d59a72';
const hair = '#342b26';
const shorts = '#344650';
export const grips = [.43, 1.052, .238];
export const WHEEL_TEETH_RATIO = 2.14;

export const bicycleTrim = { coal: '#242d2b', brown: '#925c38', orange: '#e28532' };
export const bicycleBars = { campus: [.43, 1.052, .238], road: [.545, .945, .171], climb: [.510, .986, .171], gravel: [.529, .975, .220] };

export function mudguard(mesh, hub, radius, width, color, start = .36, end = Math.PI - .24) {
  const p = (a, s) => [hub[0] + radius * Math.cos(a), hub[1] + radius * Math.sin(a), hub[2] + s * width * .50];
  for (let i = 0; i < 14; i++) {
    const a = mix(start, end, i / 14), b = mix(start, end, (i + 1) / 14);
    mesh.quad(p(a, -1), p(b, -1), p(b, 1), p(a, 1), color, [Math.cos((a + b) / 2), Math.sin((a + b) / 2), 0]);
  }
}

export function frontBasket(mesh, x, y, d, w, h, color) {
  const bottom = (i, j) => [x + i * d * .44, y, j * w * .42], top = (i, j) => [x + i * d * .53, y + h, j * w * .5];
  mesh.box([x, y - .009, 0], [d * .90, .024, w * .86], color);
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) mesh.tube(bottom(side, end), top(side, end), .008, .010, color, 6);
    mesh.tube(top(side, -1), top(side, 1), .010, .010, color, 6);
    mesh.tube(top(-1, side), top(1, side), .010, .010, color, 6);
    for (const i of [-.68, -.34, 0, .34, .68]) {
      mesh.tube(bottom(i, side), top(i, side), .004, .004, color, 4, false);
      mesh.tube(bottom(side, i), top(side, i), .004, .004, color, 4, false);
    }
  }
}

export function poweredWheel(radius, width, rim, tread = false, castor = false) {
  const mesh = new Shape(), tyre = castor ? .019 : tread ? .045 : .035;
  mesh.torus(radius - tyre, tyre, '#303433', 32, 8, width / (tyre * 2));
  mesh.torus(radius - 2 * tyre - .007, .010, rim, 30, 5, 1.5);
  mesh.tube([0, 0, -width * .52], [0, 0, width * .52], radius * .25, radius * .25, '#626b68', 14);
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8, p = [Math.cos(a), Math.sin(a), 0];
    mesh.tube(scale(p, radius * .22), scale(p, radius - tyre * 2), .008, .012, rim, 5, false);
  }
  if (tread) for (let i = 0; i < 22; i++) {
    const a = TAU * i / 22;
    mesh.box([Math.cos(a) * (radius - .006), Math.sin(a) * (radius - .006), 0], [.014, .037, width * .89],
      i % 2 ? '#393a36' : '#464541', 0, a);
  }
  return mesh;
}

export function seatedBody(pose) {
  const mesh = new Shape(), { hip, shoulder, head, foot, hand, feetWidth, seatWidth, armsWidth, helmet } = pose;
  mesh.ellipsoid(hip, [.135, .094, seatWidth], shorts, 12, 7);
  mesh.tube(add(hip, [0, .045, 0]), shoulder, .142, .177, shirt, 12);
  mesh.ellipsoid(shoulder, [.128, .105, seatWidth + .025], shirt, 13, 8);
  mesh.tube(shoulder, head, .054, .052, skin, 9);
  mesh.ellipsoid(head, [.103, .13, .094], skin, 15, 9);
  mesh.ellipsoid(add(head, [.05, -.035, 0]), [.075, .070, .082], skin, 12, 7);
  mesh.ellipsoid(add(head, [.006, .064, 0]), [.111, .077, .102], hair, 12, 8);
  mesh.ellipsoid(add(head, [.025, .088, 0]), [.145, .077, .113], helmet, 16, 8);
  mesh.ellipsoid(add(head, [.139, .049, 0]), [.061, .016, .096], helmet, 12, 6);
  for (const side of [-1, 1]) {
    const arm = add(shoulder, [0, 0, side * armsWidth]);
    const palm = [hand[0], hand[1], side * hand[2]];
    const elbow = [mix(arm[0], palm[0], .48) - .035, mix(arm[1], palm[1], .61) - .065, side * (hand[2] + .029)];
    mesh.tube(arm, lerpPoint(arm, elbow, .63), .066, .052, sleeve, 9);
    mesh.tube(lerpPoint(arm, elbow, .60), elbow, .045, .039, skin, 8);
    mesh.tube(elbow, palm, .040, .026, skin, 8);
    mesh.ellipsoid(palm, [.045, .032, .034], skin, 10, 6);
    mesh.ellipsoid(add(head, [.114, .022, side * .056]), [.008, .009, .007], hair, 7, 5);
    const upper = add(hip, [0, 0, side * (seatWidth * .60)]), ankle = add(foot, [0, .041, side * feetWidth]);
    const knee = [mix(upper[0], ankle[0], .74) + .16, lerpPoint(upper, ankle, .42)[1] + .12, side * (feetWidth + .004)];
    mesh.tube(upper, knee, .082, .055, shorts, 10);
    mesh.tube(knee, ankle, .049, .033, skin, 9);
    mesh.ellipsoid(add(ankle, [.031, -.022, 0]), [.104, .048, .052], '#d9dacb', 12, 6);
  }
  return mesh;
}

export function makeEbike() {
  const frame = new Shape(), steering = new Shape(), rubber = '#303936', trim = '#93aa9f', shell = '#dce4cc';
  const rear = [-.63, .286, 0], front = [.69, .286, 0], pivot = [.46, .61, 0], fork = p => subtract(p, pivot);
  frame.tube(rear, [-.24, .55, 0], .051, .057, '#6d897c', 10);
  frame.tube([-.23, .53, 0], [.22, .34, 0], .064, .059, '#547d6d', 10);
  frame.tube([.22, .34, 0], [.46, .63, 0], .063, .049, '#668b78', 10);
  frame.tube([-.245, .50, 0], [-.23, .78, 0], .027, .027, trim, 9);
  frame.ellipsoid([-.24, .805, 0], [.205, .041, .122], rubber, 15, 7);
  frame.box([-.39, .49, 0], [.21, .289, .161], '#354e47', 0, -.32);
  frame.box([-.365, .53, 0], [.052, .193, .167], '#425d51', 0, -.32);
  frame.box([.091, .355, 0], [.341, .063, .20], '#526458');
  frame.box([-.71, .625, 0], [.43, .039, .21], '#7d9590');
  frame.box([-.923, .622, 0], [.052, .044, .124], '#b45740');
  mudguard(frame, rear, .315, .085, shell);
  mudguard(steering, fork(front), .319, .096, shell);
  steering.tube(fork([.47, .56, 0]), fork([.44, 1.012, 0]), .029, .022, trim, 10);
  for (const s of [-1, 1]) {
    steering.tube(fork([.455, .61, s * .051]), fork([.69, .29, s * .065]), .024, .024, trim, 9);
    steering.tube(fork([.44, 1.01, 0]), fork([.398, 1.027, s * .266]), .018, .018, rubber, 9);
  }
  frontBasket(steering, .687 - pivot[0], .691 - pivot[1], .325, .364, .183, '#52665b');
  steering.box(fork([.817, .635, 0]), [.079, .081, .127], '#e9e7cb');
  return {
    frame, steering, pivot, body: seatedBody({
      hip: [-.24, .871, 0], shoulder: [-.182, 1.19, 0], head: [-.095, 1.401, 0], foot: [.089, .405, 0],
      hand: [.398, 1.038, .25], feetWidth: .125, seatWidth: .166, armsWidth: .142, helmet: '#e6e2c5',
    }), wheels: poweredWheel(.286, .060, '#aab6a9'), mounts: [{ center: rear, radius: .286 }, { center: front, radius: .286, steer: true }],
    tagHeight: 1.76,
  };
}

export function makeWheelchair() {
  const frame = new Shape(), frameColor = '#677f87', fabric = '#343c45', pad = '#536673';
  const rear = [-.15, .263, 0], chairs = [];
  for (const side of [-1, 1]) {
    const p = (x, y, z) => [x, y, z * side];
    frame.tube(p(-.40, .24, .21), p(.46, .20, .20), .026, .024, frameColor, 8);
    frame.tube(p(-.34, .44, .26), p(-.43, .95, .26), .023, .021, frameColor, 8);
    frame.tube(p(-.30, .31, .235), p(-.14, .702, .244), .023, .024, frameColor, 8);
    frame.tube(p(.183, .68, .248), p(.183, .38, .248), .020, .023, frameColor, 8);
    frame.box(p(-.029, .70, .275), [.411, .05, .10], pad);
    frame.tube(p(.421, .26, .213), p(.447, .099, .232), .016, .017, frameColor, 7);
    frame.tube(p(-.405, .235, .22), p(-.56, .108, .24), .015, .014, frameColor, 7);
    mudguard(frame, p(rear[0], rear[1], .325), .280, .096, frameColor, .36, 2.81);
    chairs.push({ center: p(rear[0], rear[1], .325), radius: .263 }, { center: p(.449, .099, .232), radius: .099, caster: true });
  }
  frame.box([-.131, .31, 0], [.487, .20, .389], '#435a59');
  frame.box([-.107, .482, 0], [.495, .103, .465], fabric);
  frame.box([-.340, .715, 0], [.104, .438, .455], fabric, 0, .12);
  frame.box([-.393, .748, 0], [.037, .375, .435], pad, 0, .12);
  frame.box([.415, .137, 0], [.286, .042, .388], '#78868a');
  frame.box([.217, .728, .269], [.135, .054, .099], '#303a3d');
  frame.tube([.201, .747, .269], [.212, .817, .269], .012, .021, '#57676a', 8);
  frame.ellipsoid([.213, .822, .269], [.024, .020, .023], '#2f3b3d', 10, 6);
  return {
    frame, body: seatedBody({
      hip: [-.201, .571, 0], shoulder: [-.205, .925, 0], head: [-.155, 1.12, 0], foot: [.42, .163, 0],
      hand: [.214, .786, .269], feetWidth: .109, seatWidth: .160, armsWidth: .141, helmet: '#e6e2c5',
    }), wheels: poweredWheel(.263, .075, '#8b9d9d'), casters: poweredWheel(.099, .049, '#80908e', false, true),
    mounts: chairs, tagHeight: 1.50,
  };
}

export function makeTrailBike() {
  const frame = new Shape(), steering = new Shape(), red = '#cf623a', light = '#e8e1cd', steel = '#808d8b';
  const rear = [-.68, .317, 0], front = [.751, .317, 0], pivot = [.48, .67, 0], fork = p => subtract(p, pivot);
  frame.tube(rear, [-.07, .453, 0], .047, .042, steel, 10);
  frame.tube([-.07, .453, 0], [.499, .690, 0], .054, .047, steel, 10);
  frame.tube(rear, [-.36, .691, 0], .030, .035, red, 9);
  frame.ellipsoid([.131, .698, 0], [.334, .113, .138], red, 15, 8, -.12);
  frame.ellipsoid([-.340, .772, 0], [.289, .048, .106], '#37433c', 14, 7);
  frame.box([-.056, .453, 0], [.243, .225, .210], '#53635e');
  for (let i = 0; i < 4; i++) frame.box([-.065, .439 + i * .027, 0], [.245, .010, .242], steel);
  frame.tube([.107, .483, .082], [-.651, .618, .131], .023, .034, '#7a8883', 10);
  frame.tube([-.588, .617, .131], [-.833, .624, .131], .047, .050, '#5b6861', 11);
  frame.tube([-.183, .391, -.177], [-.183, .391, .177], .021, .021, '#465550', 8);
  frame.box([-.500, .662, 0], [.186, .126, .189], light);
  mudguard(frame, add(rear, [0, .086, 0]), .314, .128, red, .31, 2.9);
  mudguard(steering, fork(add(front, [0, .109, 0])), .321, .125, red, .19, 2.93);
  steering.box(fork([.539, .856, 0]), [.053, .195, .179], light, 0, -.12);
  steering.box(fork([.571, .822, 0]), [.032, .061, .093], '#e5ca84', 0, -.10);
  for (const s of [-1, 1]) {
    steering.tube(fork([.501, .686, s * .084]), fork([.650, .453, s * .087]), .035, .029, steel, 10);
    steering.tube(fork([.650, .453, s * .087]), fork([.751, .317, s * .090]), .023, .022, '#9fa9a2', 9);
    steering.tube(fork([.465, 1.008, 0]), fork([.429, 1.041, s * .292]), .023, .025, '#39453f', 9);
    steering.box(fork([.488, 1.044, s * .252]), [.127, .040, .147], red, 0, -.11);
  }
  steering.tube(fork([.478, .698, 0]), fork([.46, 1.016, 0]), .027, .027, steel, 9);
  return {
    frame, steering, pivot, body: seatedBody({
      hip: [-.27, .843, 0], shoulder: [-.123, 1.166, 0], head: [.003, 1.376, 0], foot: [-.17, .43, 0],
      hand: [.429, 1.052, .277], feetWidth: .158, seatWidth: .168, armsWidth: .146, helmet: '#dadecb',
    }), wheels: poweredWheel(.317, .092, '#b2b9ad', true), mounts: [{ center: rear, radius: .317 }, { center: front, radius: .317, steer: true }],
    tagHeight: 1.76,
  };
}

export function uploadPoweredRig(gpu, kind) {
  const model = kind === 'ebike' ? makeEbike() : kind === 'chair' ? makeWheelchair() : makeTrailBike();
  return {
    ...model,
    frame: new gpu.Mesh(model.frame), body: new gpu.Mesh(model.body), wheels: new gpu.Mesh(model.wheels),
    casters: model.casters ? new gpu.Mesh(model.casters) : null,
    steering: model.steering ? new gpu.Mesh(model.steering) : null,
  };
}

export function poweredPose(rig, root, rider) {
  const items = [[rig.frame, root], [rig.body, root]];
  const angle = -.25 * rider.steering;
  const turn = rig.steering ? placement(rig.pivot, 0, angle, 0) : null;
  const steer = turn ? multiply(turn, placement(scale(rig.pivot, -1))) : null;
  if (turn) items.push([rig.steering, multiply(root, turn)]);
  for (const { center, radius, steer: swivels, caster } of rig.mounts) {
    const centerPoint = swivels ? transform(steer, center) : center;
    const yaw = swivels || caster ? angle : 0;
    items.push([caster ? rig.casters : rig.wheels, multiply(root, placement(centerPoint, 0, yaw, -rider.travel / radius))]);
  }
  return items;
}

export function makeBicycleBar(shape, toFork, look) {
  const handle = bicycleBars[look.category], trim = bicycleTrim[look.trim];
  for (const side of [-1, 1]) {
    const part = (x, y, z) => toFork([x, y, side * z]);
    const center = part(.438, 1.033, 0), top = part(.485, 1.047, handle[2] * .73);
    shape.tube(center, top, .016, .017, '#90a69c', 8);
    if (look.category === 'campus') {
      shape.tube(top, part(...handle), .018, .020, trim, 8);
      shape.tube(part(.455, 1.034, .160), part(.495, 1.014, .226), .009, .008, '#849386', 7);
    } else {
      const hood = part(handle[0], 1.032, handle[2] * .88), bottom = part(handle[0] - .068, handle[1] - .033, handle[2] * 1.07);
      shape.tube(top, hood, .019, .020, trim, 8);
      shape.tube(hood, part(...handle), .019, .016, trim, 8);
      shape.tube(part(...handle), bottom, .016, .016, trim, 8);
      shape.tube(hood, part(handle[0] + .024, handle[1] - .006, handle[2] * .90), .010, .008, '#849386', 7);
    }
  }
}

export function makeBicycleWheel(wheel, look, tyres) {
  const depth = look.rim === 'deep' || look.rim === 'auto' && look.category === 'road';
  const width = tyres === 'traction' || look.category === 'gravel' ? .030 : tyres === 'race' ? .013 : .021;
  wheel.torus(.325, .022, '#242d2b', 48, 8, width / .022);
  if (look.sidewall === 'tan') wheel.torus(.320, .016, '#b77c46', 48, 7, (width + .003) / .016);
  if (depth) {
    wheel.torus(.277, .030, '#282e30', 48, 7, .45);
    wheel.torus(.306, .007, '#747a75', 48, 6, 1.55);
  } else {
    wheel.torus(.304, .008, '#9ba79c', 48, 6, 1.2);
    wheel.torus(.297, .004, '#4c5c56', 48, 5, 1.25);
  }
  wheel.tube([0, 0, -.062], [0, 0, .062], .035, .035, '#596b61', 12);
  const radius = depth ? .253 : .297;
  for (let i = 0; i < 20; i++) {
    const angle = TAU * i / 20, side = i % 2 === 0 ? -.038 : .038;
    wheel.tube([Math.cos(angle + .35) * .032, Math.sin(angle + .35) * .032, side],
      [Math.cos(angle) * radius, Math.sin(angle) * radius, 0], .0026, .0028, '#b8bfb0', 5, false);
  }
  if (width >= .030) for (let i = 0; i < 36; i++) {
    const angle = TAU * i / 36;
    wheel.box([Math.cos(angle) * .343, Math.sin(angle) * .343, (i % 2 ? .010 : -.010)], [.010, .008, .020], '#333936', 0, angle);
  }
}

export function addBicycleAccessory(frame, steering, pivot, look, paint) {
  if (look.accessory === 'bottle') {
    frame.tube([-.09, .530, 0], [-.122, .667, .001], .033, .036, '#d5c995', 10);
    frame.tube([-.123, .658, 0], [-.125, .692, 0], .027, .019, '#4a5e53', 9);
  }
  if (look.accessory === 'basket') frontBasket(steering, .66 - pivot[0], .756 - pivot[1], .38, .405, .207, '#384a41');
  if (look.accessory === 'computer') {
    steering.box(subtract([.493, 1.069, 0], pivot), [.072, .030, .080], '#303939', 0, -.12);
    steering.box(subtract([.493, 1.086, 0], pivot), [.050, .004, .056], '#8ea6a6', 0, -.12);
  }
  if (paint === 'shared' && look.category === 'campus') {
    mudguard(frame, REAR, .379, .08, '#d1a739');
    mudguard(steering, subtract(FRONT, pivot), .379, .08, '#d1a739');
    frame.box([-.531, .348, .052], [.293, .145, .049], '#d4a22b', 0, -.045);
  }
}

export function bicycleRigCache(gpu, capacity = 8) {
  const rigs = new Map();
  return {
    prepare(appearance) {
      const { paint, look, tyres, frame } = appearance;
      const key = [paint, tyres, frame, ...Object.values(look)].join('/');
      let rig = rigs.get(key);
      if (rig) rigs.delete(key);
      else {
        const shapes = makeRider(paint, look, tyres, frame, false);
        rig = {
          frame: new gpu.Mesh(shapes.frame), fork: new gpu.Mesh(shapes.steering), wheel: new gpu.Mesh(shapes.wheels),
          pivot: shapes.pivot, grip: bicycleBars[look.category],
        };
      }
      rigs.set(key, rig);
      if (rigs.size > capacity) {
        const [old, build] = rigs.entries().next().value;
        for (const mesh of [build.frame, build.fork, build.wheel]) mesh.dispose();
        rigs.delete(old);
      }
      return rig;
    },
  };
}

export function bicycleBodyTransform(pose) {
  const hip = [-.222, .99, 0];
  return multiply(
    placement(add(hip, [pose.tuck * .086 + pose.stand * .070, pose.bob + pose.stand * .125, 0]), 0, 0, -.26 * pose.tuck + .055 * pose.stand),
    placement(scale(hip, -1)),
  );
}

export function bicycleRock(rider) {
  return (rider.stand ?? 0) * Math.sin(rider.pedalPhase ?? 0) * .045;
}

export function makeRider(paint = 'classic', look = bicycleStyle(), tyres = 'stock', geometry = 'stock', includeBody = true) {
  const frame = new Shape(), wheels = new Shape(), steering = new Shape(), body = new Shape();
  const { color: teal, shade: tealShaded, highlight } = bicyclePaints[paint];
  const chrome = '#90a69c', rubber = '#242d2b', trim = bicycleTrim[look.trim];
  const aero = look.category === 'road' || geometry === 'aero', light = look.category === 'climb' || geometry === 'agile';
  const head = [.426, aero ? .846 : .876, 0];
  const fork = [.51, .684, 0];
  const seatTube = [light ? -.168 : -.192, look.category === 'gravel' ? .719 : .764, 0];

  frame.tube(CRANK, seatTube, .044, .031, teal, 11);
  frame.tube(seatTube, head, paint === 'shared' ? .035 : .028, .034, highlight, 10);
  if (aero) frame.ellipsoid([.261, .545, 0], [.378, .047, .025], teal, 14, 7, .82);
  else frame.tube(CRANK, fork, light ? .032 : .051, light ? .027 : .038, teal, 11);
  frame.tube(head, fork, .044, .054, tealShaded, 12);
  frame.tube(seatTube, SEAT, .019, .019, chrome, 10);
  frame.tube([-.362, .905, 0], [-.157, .905, 0], .013, .013, chrome, 8);
  frame.ellipsoid([-.244, .928, 0], [.179, .027, .084], trim, 14, 6);
  frame.ellipsoid([-.333, .929, 0], [.083, .026, .105], trim, 12, 5);
  for (const side of [-1, 1]) {
    frame.tube([seatTube[0], seatTube[1], side * .029], [REAR[0], REAR[1], side * .066], .018, .013, teal, 8);
    frame.tube([CRANK[0], CRANK[1], side * .046], [REAR[0], REAR[1], side * .061], .024, .013, tealShaded, 8);
  }
  frame.tube([CRANK[0], CRANK[1], -.082], [CRANK[0], CRANK[1], .082], .041, .041, rubber, 11);
  frame.tube([CRANK[0], CRANK[1], .050], [CRANK[0], CRANK[1], .060], .103, .103, chrome, 21);
  frame.tube([CRANK[0], CRANK[1], .062], [CRANK[0], CRANK[1], .067], .077, .077, rubber, 19);
  frame.tube([-.075, .463, .064], [REAR[0], REAR[1] + .047, .065], .007, .007, '#656d61', 5);
  frame.tube([-.071, .286, .064], [REAR[0], REAR[1] - .045, .065], .007, .007, '#656d61', 5);
  frame.tube([-.002, .416, .037], [.336, .593, .033], .007, .007, '#b4bb92', 6);
  frame.ellipsoid([-.427, .906, 0], [.018, .020, .039], '#c44838', 9, 5);

  const pivot = [.483, .756, 0];
  const toFork = (p) => subtract(p, pivot);
  for (const side of [-1, 1]) {
    steering.tube(toFork([.485, .766, side * .046]), toFork([.558, .541, side * .064]), .029, .022, teal, 8);
    steering.tube(toFork([.558, .541, side * .064]), toFork([FRONT[0], FRONT[1], side * .067]), .022, .017, tealShaded, 8);
  }
  makeBicycleBar(steering, toFork, look);
  steering.tube(toFork([head[0], head[1] - .036, 0]), toFork([.392, 1.016, 0]), .024, .020, chrome, 10);
  steering.tube(toFork([.385, 1.015, 0]), toFork([.447, 1.010, 0]), .023, .019, tealShaded, 9);
  steering.ellipsoid(toFork([.491, 1.001, 0]), [.056, .031, .048], '#354d43', 11, 6);
  steering.ellipsoid(toFork([.527, 1.001, 0]), [.030, .024, .035], '#e6d8ae', 10, 5);

  makeBicycleWheel(wheels, look, tyres);
  addBicycleAccessory(frame, steering, pivot, look, paint);
  if (includeBody) {
    body.ellipsoid([-.223, .982, 0], [.139, .116, .177], shorts, 16, 9, -.18);
    body.ellipsoid([-.128, 1.186, 0], [.139, .275, .183], shirt, 18, 12, -.40);
    body.ellipsoid([-.013, 1.351, 0], [.112, .088, .157], '#ec8550', 14, 8, -.38);
    body.ellipsoid([-.178, 1.049, 0], [.109, .062, .165], '#cb613c', 13, 7, -.17);
    body.tube([.006, 1.373, 0], [.066, 1.491, 0], .069, .063, skin, 12);
    body.ellipsoid([.062, 1.514, 0], [.103, .142, .096], skin, 18, 11, -.14);
    body.ellipsoid([.101, 1.481, 0], [.074, .074, .083], '#d99c74', 13, 8, -.17);
    body.ellipsoid([.155, 1.518, 0], [.030, .033, .026], '#dea17a', 10, 7);
    for (const side of [-1, 1]) {
      body.ellipsoid([.038, 1.497, side * .091], [.024, .040, .014], '#c68c67', 10, 6, -.2);
      body.ellipsoid([.136, 1.542, side * .053], [.011, .008, .011], '#3b3329', 8, 5);
      body.tube([.076, 1.625, side * .100], [.041, 1.467, side * .078], .007, .006, '#374439', 6);
      body.tube([.041, 1.470, side * .078], [-.006, 1.606, side * .088], .006, .006, '#374439', 6);
    }
    body.ellipsoid([.031, 1.592, 0], [.121, .093, .111], hair, 16, 9, -.16);
    body.ellipsoid([.055, 1.637, 0], [.157, .102, .122], '#e7e4c7', 20, 12, -.17);
    body.ellipsoid([.182, 1.596, 0], [.058, .025, .104], '#d7d7b9', 14, 7, -.12);
    body.ellipsoid([.049, 1.732, 0], [.11, .010, .028], '#cd6943', 12, 5, -.17);
    for (const side of [-1, 1]) {
      body.ellipsoid([.064, 1.681, side * .093], [.067, .012, .025], '#526456', 10, 6, -.13);
      body.ellipsoid([.004, 1.646, side * .114], [.047, .010, .014], '#667869', 10, 6, -.22);
    }
    body.ellipsoid([-.236, 1.229, 0], [.119, .230, .150], '#68744c', 16, 10, -.44);
    body.ellipsoid([-.275, 1.193, 0], [.103, .175, .126], '#7f8155', 14, 9, -.43);
    body.ellipsoid([-.297, 1.113, 0], [.093, .068, .116], '#74784f', 12, 7, -.43);
    body.box([-.352, 1.211, 0], [.012, .053, .059], '#c4ae73', 0, -.43);
    body.tube([-.200, 1.439, -.044], [-.198, 1.439, .044], .009, .009, '#494f39', 7);
    for (const side of [-1, 1]) {
      body.tube([-.161, 1.402, side * .105], [.018, 1.381, side * .134], .017, .017, '#555d45', 7);
      body.tube([.016, 1.380, side * .134], [.005, 1.249, side * .168], .017, .016, '#596046', 7);
      body.tube([.006, 1.255, side * .164], [-.165, 1.121, side * .150], .016, .015, '#565d44', 7);
    }
  }
  return { frame, wheels, steering, body, pivot };
}

export function bendLeg(hip, ankle) {
  const upper = .402, lower = .405;
  const direction = normalize([ankle[0] - hip[0], ankle[1] - hip[1], 0]);
  const d = clamp(Math.hypot(ankle[0] - hip[0], ankle[1] - hip[1]), .12, upper + lower - .004);
  const along = (upper * upper - lower * lower + d * d) / (2 * d);
  const bend = Math.sqrt(Math.max(0, upper * upper - along * along));
  const forward = [-direction[1], direction[0], 0];
  const knee = add(hip, add(scale(direction, along), scale(forward, bend)));
  knee[2] = (hip[2] + ankle[2]) * .5 + Math.sign(hip[2]) * .018;
  return knee;
}

export function movingParts(distance, steerTransform, grip = grips, rider) {
  const shape = new Shape();
  const spin = rider?.pedalPhase ?? (-distance / TYRE_RADIUS / WHEEL_TEETH_RATIO);
  const tuck = rider?.tuck ?? 0, stand = rider?.stand ?? 0;
  const bob = .009 * Math.cos(spin * 2) + stand * .012 * Math.sin(spin);
  const bodyPose = bicycleBodyTransform({ tuck, stand, bob });
  for (const side of [-1, 1]) {
    const a = spin + (side < 0 ? Math.PI : 0);
    const pedal = [CRANK[0] + CRANK_RADIUS * Math.cos(a), CRANK[1] + CRANK_RADIUS * Math.sin(a), side * .146];
    const footAngle = .12 * Math.sin(a) - .07;
    const shoePlacement = placement(add(pedal, [.037, .032, 0]), 0, 0, footAngle);
    const hip = transform(bodyPose, [-.222, .990, side * .109]);
    const ankle = transform(shoePlacement, [-.076, .048, 0]);
    const knee = bendLeg(hip, ankle);
    const cuff = lerpPoint(hip, knee, .82);
    const shoeCuff = lerpPoint(ankle, knee, .29);
    shape.tube([CRANK[0], CRANK[1], side * .076], [pedal[0], pedal[1], side * .103], .020, .017, '#b4baab', 8);
    shape.tube([pedal[0], pedal[1], side * .095], [pedal[0], pedal[1], side * .189], .011, .011, '#6b7c70', 9);
    shape.box(pedal, [.108, .028, .106], '#354742');
    shape.box([pedal[0], pedal[1], side * .2], [.068, .018, .010], '#d1a05a');
    shape.tube(hip, cuff, .080, .060, shorts, 11);
    shape.tube(lerpPoint(cuff, knee, -.17), cuff, .064, .059, '#42535a', 11);
    shape.tube(cuff, knee, .056, .050, skin, 11, false);
    shape.ellipsoid(knee, [.053, .049, .054], skin, 10, 6);
    shape.tube(knee, shoeCuff, .050, .031, skin, 11, false);
    shape.tube(shoeCuff, ankle, .033, .028, '#d9d8b9', 10);
    shape.ellipsoid(transform(shoePlacement, ORIGIN), [.115, .043, .050], '#e8e2c8', 14, 7, footAngle);
    shape.ellipsoid(transform(shoePlacement, [.010, -.028, 0]), [.118, .020, .051], '#536758', 15, 7, footAngle);
    shape.tube(transform(shoePlacement, [-.033, .038, side * .035]), transform(shoePlacement, [.061, .015, side * .043]), .007, .005, '#567c6f', 6);

    const shoulder = transform(bodyPose, [-.02, 1.347, side * .143]);
    const hand = transform(steerTransform, [grip[0], grip[1] + .016, side * grip[2]]);
    const elbow = lerpPoint(transform(bodyPose, [.151, 1.136, side * .204]), hand, tuck * .25);
    const hem = lerpPoint(shoulder, elbow, .57);
    shape.ellipsoid(shoulder, [.067, .075, .071], sleeve, 13, 7, -.22);
    shape.tube(shoulder, hem, .070, .058, sleeve, 11);
    shape.tube(hem, elbow, .052, .041, skin, 10, false);
    shape.ellipsoid(elbow, [.043, .048, .042], skin, 10, 6);
    shape.tube(elbow, hand.slice(0, 3), .045, .028, '#d59a71', 11);
    shape.ellipsoid(hand, [.048, .029, .038], '#cc926a', 11, 7, -.12);
  }
  return { shape, bodyPose };
}
