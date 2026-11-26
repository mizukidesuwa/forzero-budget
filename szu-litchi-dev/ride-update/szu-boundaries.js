let cachedSzuAprons = null;
function szuAprons() {
  if (cachedSzuAprons) return cachedSzuAprons;
  cachedSzuAprons = [...campusGates, ...canghaiGates].map(gate => {
    const frame = campusFootprint(gate.xy[0], gate.xy[1], 0, 0, Math.atan2(gate.facing[0], gate.facing[2]));
    let v = .26, w = 14.4, d = 7.24;
    if (gate.name === '立德门') { v = 4.40; w = 27.5; d = 15.8; }
    else if (gate.name === '立功门') { v = 1.54; w = 20.0; d = 11.45; }
    else if (gate.name === '立言门') { v = 0; w = 15.2; d = 9.1; }
    return { ...lotPart(frame, 0, v, w, d, 0), name: gate.name };
  });
  return cachedSzuAprons;
}

function gateApronAt(x, z) {
  return szuAprons().some(lot => closeToBlock(x, z, lot, 0));
}

let cachedSzuLakeBoxes = null;
function szuWaterBoxes() {
  if (cachedSzuLakeBoxes) return cachedSzuLakeBoxes;
  cachedSzuLakeBoxes = basins.map(({x, z, rx, rz, c, s}) => ({
    minX: x - 1.18 * Math.hypot(c * rx, s * rz) - .2,
    maxX: x + 1.18 * Math.hypot(c * rx, s * rz) + .2,
    minZ: z - 1.18 * Math.hypot(s * rx, c * rz) - .2,
    maxZ: z + 1.18 * Math.hypot(s * rx, c * rz) + .2
  }));
  return cachedSzuLakeBoxes;
}

function szuInWater(x, z) {
  if (!szuWaterBoxes().some(b => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ)) return false;
  return lakeClearance(x, z) <= .08;
}

function waterHazardAt(x, z) {
  if (activeCampus === 'shunde') return parkInWater(x, z);
  if (activeCampus === 'szu') return szuInWater(x, z);
  return false;
}

function nearestSafeRoad(x, z) {
  if (activeCampus === 'shunde') return parkNearestRoad(x, z);
  if (activeCampus === 'szu') return nearestPathSpot(roads, x, z, rideElevation);
  return null;
}

function fenceOpenAt(x, z) {
  return Boolean(cityStreetAt(x, z) || gateApronAt(x, z) || buildingAt(x, z, .35));
}

function drawLowBorder(x, z, len, yaw) {
  scenery.box([x, .14, z], [len, .28, .34], '#b4ac95', yaw);
  scenery.box([x, .31, z], [len, .06, .40], '#c8c0a9', yaw);
  scenery.box([x, .53, z], [len, .38, .28], '#63804c', yaw);
}

function szuBorderClear(x, z) {
  return !inCampus(x, z) && !gateApronAt(x, z) && !cityStreetAt(x, z) &&
    !buildingAt(x, z, .45) && !cityBlocked(x, z);
}

function drawGateLinkBorders() {
  const gateLinks = [...cityLinks, ...canghaiStreets.filter(w => canghaiGates.some(g => g.name === w.name))];
  for (const {path} of gateLinks) {
    for (let d = .8; d < path.length - .8; d += 1.2) {
      const len = Math.min(1.16, path.length - .8 - d);
      if (len < .45) continue;
      const f = courseFrame(path, d + len * .5), yaw = -Math.atan2(f.f[2], f.f[0]);
      for (const side of [-1, 1]) {
        const [px, , pz] = offsetVertex(f, side * (path.width + 1.08), 0);
        const hx = f.f[0] * len * .45, hz = f.f[2] * len * .45;
        if (szuBorderClear(px, pz) && szuBorderClear(px - hx, pz - hz) && szuBorderClear(px + hx, pz + hz)) {
          drawLowBorder(px, pz, len, yaw);
        }
      }
    }
  }
  for (const lot of szuAprons()) {
    const hw = lot.w * .5, hd = lot.depth * .5;
    const edges = [
      [[-hw, -hd], [hw, -hd]],
      [[hw, -hd], [hw, hd]],
      [[hw, hd], [-hw, hd]],
      [[-hw, hd], [-hw, -hd]]
    ];
    for (const [p1, p2] of edges) {
      const edgeLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const ux = (p2[0] - p1[0]) / edgeLen, uz = (p2[1] - p1[1]) / edgeLen;
      const nx = uz, nz = -ux;
      const outSign = (Math.abs((p1[0] + p2[0]) * .5 + nx * .4) < hw && Math.abs((p1[1] + p2[1]) * .5 + nz * .4) < hd) ? -1 : 1;
      const dx = lot.c * ux + lot.s * uz, dz = -lot.s * ux + lot.c * uz;
      const yaw = -Math.atan2(dz, dx);
      for (let m = 0; m < edgeLen; m += 1.4) {
        const len = Math.min(1.36, edgeLen - m);
        if (len < .45) continue;
        const c = m + len * .5;
        const u = p1[0] + ux * c + outSign * nx * .26, v = p1[1] + uz * c + outSign * nz * .26;
        const [wx, , wz] = lotPoint(lot, u, 0, v);
        const hx = dx * len * .45, hz = dz * len * .45;
        if (szuBorderClear(wx, wz) && szuBorderClear(wx - hx, wz - hz) && szuBorderClear(wx + hx, wz + hz)) {
          drawLowBorder(wx, wz, len, yaw);
        }
      }
    }
  }
}
