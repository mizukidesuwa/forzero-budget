import { clamp, lerpPoint } from '../../core/math.js';

function bounds(outline) {
  const xs = outline.map(([x]) => x), zs = outline.map(([, z]) => z);
  return {
    minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs),
  };
}

function emitLowTree({ x, z, size, crown }, { scenery, foliage }) {
  const h = 2.45 * size;
  scenery.tube([x, .02, z], [x, h, z], .13 * size, .07 * size, '#6d5d45', 6, false);
  foliage.ellipsoid([x, h + .18 * size, z], [1.15 * size, .92 * size, 1.04 * size], crown, 8, 4);
  foliage.ellipsoid([x - .42 * size, h - .05 * size, z + .18 * size],
    [.72 * size, .58 * size, .70 * size], crown, 7, 3);
  foliage.ellipsoid([x + .38 * size, h + .06 * size, z - .16 * size],
    [.68 * size, .55 * size, .64 * size], crown, 7, 3);
}

function emitPlanter({ x, z, width, depth, paving, planter }, { pavement, scenery }) {
  pavement.box([x, .035, z], [width, .07, depth], paving);
  scenery.box([x, .19, z - depth * .47], [width, .30, .18], planter);
  scenery.box([x, .19, z + depth * .47], [width, .30, .18], planter);
  scenery.box([x - width * .47, .19, z], [.18, .30, depth], planter);
  scenery.box([x + width * .47, .19, z], [.18, .30, depth], planter);
}

function emitBench({ x, z, yaw = 0 }, { scenery }) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const point = (u, y, v = 0) => [x + c * u - s * v, y, z + s * u + c * v];
  for (const side of [-.72, .72]) scenery.box(point(side, .27), [.12, .54, .54], '#46564e', yaw);
  for (let i = 0; i < 4; i++) scenery.box(point(0, .47, -.19 + i * .125), [1.95, .08, .09], i % 2 ? '#b78455' : '#c3925e', yaw);
  scenery.box(point(0, .75, -.21), [1.95, .08, .08], '#a6754e', yaw);
}

// Formal gardens and squares from the UCL campus map receive a central axis,
// clipped planters and small tree groups. The detail layer is visual-only so
// existing routes and collision snapshots stay stable.
export function emitUclGardenDetails(spec, sinks) {
  const { outline, center: [cx, cz], treeRows = 2, treeScale = 1, planter, paving, crown } = spec;
  const box = bounds(outline);
  const width = clamp(box.maxX - box.minX, 18, 82), depth = clamp(box.maxZ - box.minZ, 18, 82);
  const axis = Math.min(width, depth) * .50;
  emitPlanter({ x: cx, z: cz, width: Math.max(4.2, width * .12), depth: Math.max(3.2, depth * .08), paving, planter }, sinks);
  emitBench({ x: cx - axis * .42, z: cz, yaw: Math.PI / 2 }, sinks);
  emitBench({ x: cx + axis * .42, z: cz, yaw: -Math.PI / 2 }, sinks);
  for (let row = 0; row < treeRows; row++) {
    const t = (row + 1) / (treeRows + 1);
    const span = Math.max(4, width * (.28 + row * .08));
    for (const side of [-1, 1]) {
      const x = cx + side * span;
      const z = cz + (t - .5) * depth * .62;
      emitLowTree({ x, z, size: treeScale * (1 - row * .07), crown }, sinks);
    }
  }
}

function emitFacadeBand({ x, z, width, depth, height, style }, { urban }) {
  urban.box([x, height * .23, z], [width + .35, .26, depth + .35], style.canopy);
  urban.box([x, height * .52, z + depth * .5 + .05], [width, .16, .12], style.frame);
  urban.box([x, height * .83, z + depth * .5 + .07], [width, .12, .10], style.frame);
  const bays = Math.max(3, Math.floor(width / 3.4));
  for (let i = 1; i < bays; i++) {
    const u = -width / 2 + width * i / bays;
    urban.box([x + u, height * .57, z + depth * .5 + .09], [.11, height * .63, .15], style.frame);
  }
  for (let i = 0; i < bays; i++) {
    const u = -width / 2 + width * (i + .5) / bays;
    urban.box([x + u, height * .42, z + depth * .5 + .11], [width / bays * .67, height * .24, .08], style.glass);
  }
}

function emitInfillWindow({ position, width, height, yaw, color }, { urban }) {
  const [x, y, z] = position;
  urban.box([x, y, z], [width, height, .08], color, yaw);
  urban.box([x, y, z + .055], [.055, height + .06, .045], '#d2c7b1', yaw);
}

// Compact Bloomsbury court blocks use the same restrained masonry proportions
// as the surrounding terraces. They are visual urban lots, so the map keeps
// the existing road and gameplay collision index as the authority.
export function emitUclUrbanInfill(spec, sinks) {
  const { x, z, w, depth, height, yaw = 0, style } = spec;
  const { urban, scenery } = sinks;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const point = (u, y, v = 0) => [x + c * u + s * v, y, z - s * u + c * v];
  const front = depth * .5 + .055;
  const back = -depth * .5 - .055;
  urban.box(point(0, .24, 0), [w + .72, .48, depth + .72], style.base, yaw);
  urban.box(point(0, height * .52, 0), [w, height - .96, depth], style.wall, yaw);
  urban.box(point(0, height + .11, 0), [w + .36, .22, depth + .36], style.trim, yaw);
  urban.box(point(0, height + .27, 0), [w - .78, .14, depth - .78], style.roof, yaw);

  const bays = Math.max(3, Math.floor(w / 3.45));
  const floors = Math.max(2, Math.floor(height / 3.15));
  const bay = w / bays;
  for (let floor = 0; floor < floors; floor++) {
    const y = 2.02 + floor * 2.68;
    const windowHeight = floor === 0 ? 1.42 : 1.16;
    for (let i = 0; i < bays; i++) {
      const u = -w * .5 + bay * (i + .5);
      emitInfillWindow({ position: point(u, y, front), width: bay * .60, height: windowHeight, yaw, color: style.window }, sinks);
      emitInfillWindow({ position: point(u, y, back), width: bay * .60, height: windowHeight, yaw: yaw + Math.PI, color: style.window }, sinks);
    }
    for (let i = 1; i < bays; i++) {
      const u = -w * .5 + bay * i;
      urban.box(point(u, y, front + .09), [.10, windowHeight + .18, .12], style.trim, yaw);
      urban.box(point(u, y, back - .09), [.10, windowHeight + .18, .12], style.trim, yaw);
    }
  }

  const sideBays = Math.max(2, Math.floor(depth / 4.2));
  const sideBay = depth / sideBays;
  for (let floor = 1; floor < floors; floor++) {
    const y = 2.02 + floor * 2.68;
    for (const side of [-1, 1]) {
      for (let i = 0; i < sideBays; i++) {
        const v = -depth * .5 + sideBay * (i + .5);
        emitInfillWindow({ position: point(side * (w * .5 + .055), y, v), width: sideBay * .56, height: 1.10,
          yaw: yaw + side * Math.PI * .5, color: style.window }, sinks);
      }
    }
  }

  for (const side of [-1, 1]) {
    const canopy = point(side * (w * .28), 1.45, front + .44);
    urban.box(canopy, [2.4, .13, .88], style.trim, yaw);
    scenery.box(point(side * (w * .28), .55, front + .50), [.15, 1.1, .15], style.roof, yaw);
    scenery.box(point(side * (w * .28), .55, front + .12), [.15, 1.1, .15], style.roof, yaw);
  }
}

// Shallow Georgian and stone shells close the long sight lines beside the
// arrival turn. They are visual-only, so the legacy UCL collision footprints
// and road probes remain the source of truth.
export function emitUclStreetWall(spec, sinks) {
  const { x, z, width, depth, height, yaw = 0, style } = spec;
  const { urban, scenery } = sinks;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const point = (u, y, v = 0) => [x + c * u + s * v, y, z - s * u + c * v];
  const front = depth * .5 + .07;
  urban.box(point(0, height * .5, 0), [width, height, depth], style.wall, yaw);
  urban.box(point(0, height - .13, 0), [width + .22, .26, depth + .22], style.trim, yaw);
  urban.box(point(0, height + .13, 0), [width - .28, .16, depth - .20], style.roof, yaw);

  const floors = Math.max(3, Math.floor(height / 3.45));
  const bays = Math.max(4, Math.min(8, Math.round(width / 4.4)));
  const bay = width / bays;
  for (let floor = 0; floor < floors; floor++) {
    const y = 2.05 + floor * 3.05;
    for (let i = 0; i < bays; i++) {
      const u = -width * .5 + bay * (i + .5);
      urban.box(point(u, y, front), [bay * .56, floor === 0 ? 1.38 : 1.12, .08], style.window, yaw);
    }
  }

  // A restrained canopy and two planter blocks give the shell a courtyard
  // edge without introducing a gameplay fixture or a dense prop field.
  urban.box(point(0, 1.37, front + .17), [width * .48, .14, .34], style.ground, yaw);
  for (const side of [-1, 1]) {
    const u = side * (width * .38);
    scenery.box(point(u, .22, front + .30), [1.8, .44, .22], style.planter, yaw);
  }
}

// The Main Quad is a paved academic court with low stone planting edges and
// clipped trees. This layer gives the arrival turn a believable enclosure
// while keeping the centre line open for riding.
export function emitUclArrivalCourtDetails({ center: [cx, cz], style }, sinks) {
  const { scenery, foliage, footprint } = sinks;
  // The gate beds are shared with the legacy collision layer. Rendering them
  // from this data list keeps one visual and physical footprint per bed.
  for (const side of [-1, 1]) {
    for (const bed of style.beds ?? []) {
      const x = cx + bed.xOffset;
      const z = cz + side * bed.zOffset;
      const yaw = bed.yaw ?? 0;
      scenery.box([x, .28, z], [bed.width, .52, bed.depth], bed.ground ?? style.planter, yaw);
      const crowns = bed.crown ?? [style.crown, style.crown];
      const spacing = bed.spacing ?? Math.min(1.08, bed.width / 4);
      for (let i = -2; i <= 2; i++) {
        const px = x + i * spacing;
        const pz = z + side * ((i % 2) * .39);
        foliage.ellipsoid([px, .67, pz], [.79, .52 + Math.abs(i) * .08, .68], crowns[Math.abs(i) % 2], 7, 4);
        scenery.tube([px, .34, pz], [px, .86, pz], .07, .05, style.trunk, 5, false);
      }
      footprint?.({ x, z, width: bed.width, depth: bed.depth, yaw, height: bed.height ?? .68 });
    }
  }
  for (const z of [cz + 46, cz + 60, cz + 74]) {
    for (const x of [cx - 19, cx + 27]) {
      scenery.box([x, .16, z], [1.85, .20, .72], style.planter);
      scenery.tube([x, .34, z], [x, .94, z], .07, .05, style.trunk, 5, false);
      foliage.ellipsoid([x, 1.36, z], [.92, 1.24, .84], style.crown, 7, 3);
    }
  }
}

// Adds depth to existing Shenzhen street blocks without registering new city
// solids. The source lot remains the sole gameplay footprint.
export function emitSzuFrontageDetails(spec, sinks) {
  const { x, z, width, depth, height, style } = spec;
  emitFacadeBand({ x, z, width, depth, height, style }, sinks);
  for (const side of [-1, 1]) {
    const px = x + side * (width * .38), pz = z - depth * .53;
    sinks.scenery.box([px, .52, pz], [.58, 1.04, .58], style.shade);
    sinks.scenery.box([px, 1.14, pz], [.72, .12, .72], style.canopy);
  }
}

function emitStoneRail({ from, to, height, rail }, { scenery }) {
  const [x, z] = from, [xx, zz] = to;
  const length = Math.hypot(xx - x, zz - z), yaw = -Math.atan2(zz - z, xx - x);
  const count = Math.max(2, Math.ceil(length / 2.2));
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const [px, , pz] = lerpPoint([x, 0, z], [xx, 0, zz], t);
    scenery.box([px, height * .5, pz], [.22, height, .22], rail, yaw);
  }
  scenery.box([(x + xx) / 2, height * .82, (z + zz) / 2], [length, .16, .16], rail, yaw);
}

// The real Shunfengshan gate opens onto a broad paved forecourt with low stone
// bridge rails. These visual rails stop short of the three arch openings.
export function emitShundeGateDetails({ center: [x, z], style }, sinks) {
  const { pavement, scenery } = sinks;
  pavement.box([x, .028, z], [34, .056, 46], '#c7bba6');
  for (const side of [-1, 1]) {
    emitStoneRail({ from: [x + side * 11.8, z - 17], to: [x + side * 11.8, z - 3], height: 1.05, rail: style.rail }, sinks);
    emitStoneRail({ from: [x + side * 11.8, z + 3], to: [x + side * 11.8, z + 17], height: 1.05, rail: style.rail }, sinks);
  }
  for (const bridge of [-1, 1]) {
    const bx = x + bridge * 7.4;
    scenery.box([bx, .21, z], [2.8, .42, 6.1], style.stone);
    scenery.box([bx, .48, z], [2.35, .12, 5.65], style.trim);
    scenery.box([bx, .62, z - 2.72], [2.55, .16, .18], style.roof);
  }
  for (const side of [-1, 1]) {
    scenery.box([x + side * 3.05, 10.62, z], [.12, .16, 9.8], style.roof);
    scenery.box([x + side * 3.05, 10.80, z], [.18, .09, 9.1], style.tile);
  }
}
