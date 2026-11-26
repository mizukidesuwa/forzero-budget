const courseGuideIndexes = new WeakMap();

function guideProgressAt(event, position, heading, previousDistance, nextGate) {
  const radius = event.cityAccess ? 15 : 8.5;
  let guide = courseGuideIndexes.get(event);
  if (!guide) {
    const finish = event.gates.at(-1);
    const rows = event.markers.at(-1).distance < finish.distance
      ? [...event.markers, finish] : event.markers;
    guide = indexStreets([{rows, width:radius}]);
    courseGuideIndexes.set(event, guide);
  }

  const [x,y,z] = position, hx = Math.cos(heading), hz = Math.sin(heading);
  const rise = event.flyover ? y - rideElevation(x,z) - ROAD_Y : 0;
  const from = event.gates[nextGate-1]?.distance ?? 0;
  const to = event.gates[nextGate].distance;
  let best = Infinity, progress = null;
  for (const segment of guide.get(streetCell(x,z)) ?? []) {
    const {dx,dz,ratio,path,row} = segment;
    const a = path.rows[row-1], b = path.rows[row];
    if (b.distance < from || a.distance > to) continue;
    const span = b.distance-a.distance;
    const first = Math.max(0,(from-a.distance)/span);
    const last = Math.min(1,(to-a.distance)/span);
    const ox = x - segment.x, oz = z - segment.z;
    const t = clamp((ox*dx + oz*dz)*ratio, first, last);
    const gap = (ox-dx*t)**2 + (oz-dz*t)**2;
    if (gap > radius**2) continue;
    if (event.flyover && Math.abs(rise-mix(a.rise,b.rise,t)) > 1.25) continue;
    const distance = mix(a.distance,b.distance,t);
    // When two legs share a street, prefer the direction and leg already being ridden.
    const alignment = (hx*dx + hz*dz)*Math.sqrt(ratio);
    const score = gap + 17*(1-alignment) + Math.min(28, ((distance-previousDistance)/12)**2);
    if (score < best) {
      best = score;
      progress = distance;
    }
  }
  return progress;
}

function crossesRaceLine(gate, previous, position, flyover) {
  const dx = position[0] - gate.p[0], dz = position[2] - gate.p[2];
  if (dx*dx + dz*dz > (gate.half+.25)**2) return null;
  const crossed = crossesGate(gate, previous, position);
  if (crossed === null || !flyover) return crossed;
  const [x,y,z] = lerpPoint(previous, position, crossed);
  return Math.abs(y-rideElevation(x,z)-ROAD_Y-gate.rise) <= .95 ? crossed : null;
}

