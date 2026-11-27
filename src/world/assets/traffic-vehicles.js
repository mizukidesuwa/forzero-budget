// @ts-check
import { tint } from '../../core/math.js';

/**
 * @typedef {{ box: Function, tube: Function }} VehicleShapeSink
 */

/**
 * Emit a London cab or double-decker bus mesh into `scenery` at `[0, 0, 0]`.
 * @param {{ kind: 'cab' | 'bus' | string, detail?: boolean }} spec
 * @param {{ scenery: VehicleShapeSink }} sinks
 */
export function emitLondonTrafficVehicle({ kind, detail = true }, { scenery }) {
  const bus = kind === 'bus';
  const length = bus ? 9.3 : 4.5, width = bus ? 2.4 : 1.92;
  const body = bus ? '#b52430' : '#25292e';
  const glass = '#465761';
  scenery.box([0, .58, 0], [length, .76, width], body);
  if (!detail) {
    if (bus) {
      scenery.box([0, 2.33, 0], [length * .98, 2.87, width * .99], body);
      for (const y of [1.6, 3.05]) scenery.box([0, y, 0], [length * .985, .67, width], glass);
    } else {
      scenery.box([-.33, 1.24, 0], [2.64, .64, 1.76], glass);
      scenery.box([-.40, 1.59, 0], [2.62, .16, 1.76], body);
      scenery.box([.36, 1.73, 0], [.31, .14, .61], '#ecc469');
    }
    for (const side of [-1, 1]) {
      scenery.box([side * length * .32, .28, 0], [.54, .56, width], '#24262a');
    }
    return;
  }
  for (const side of [-1, 1]) {
    const x = side * length * .48;
    scenery.box([x, .52, 0], [.15, .16, width], bus ? body : '#666b70');
    for (const edge of [-1, 1]) {
      scenery.box([x + side * .09, .69, edge * width * .35], [.055, .16, .28], side > 0 ? '#f4e3b7' : '#ed444d');
      const axle = side * length * .32;
      const z = edge * width * .45;
      scenery.tube([axle, .29, z - .13], [axle, .29, z + .13], .29, .29, '#24262a', 8);
    }
  }
  if (bus) {
    scenery.box([0, 2.33, 0], [length * .98, 2.87, width * .99], body);
    for (const y of [1.6, 3.05]) {
      scenery.box([0, y, 0], [length * .985, .67, width], glass);
      for (const x of [-3, -1.5, 0, 1.5, 3]) {
        scenery.box([x, y, 0], [.10, .69, width + .012], body);
      }
    }
    scenery.box([length * .497, 2.39, 0], [.045, .32, 1.4], '#282a28');
    scenery.box([length * .501, 2.39, -.34], [.026, .12, .49], '#f1c156');
  } else {
    scenery.box([-.33, 1.24, 0], [2.64, .64, 1.76], glass);
    scenery.box([-.40, 1.59, 0], [2.62, .16, 1.76], body);
    for (const x of [-1.58, -.68, .32, .95]) scenery.box([x, 1.24, 0], [.10, .66, 1.78], body);
    scenery.box([.36, 1.73, 0], [.31, .14, .61], '#ecc469');
  }
}

/**
 * Emit a Shenzhen city sedan or transit bus mesh into `shape`.
 * @param {{ paint: string, bus?: boolean }} spec
 * @param {{ shape: VehicleShapeSink }} sinks
 */
export function emitCityTrafficVehicle({ paint, bus = false }, { shape }) {
  const w = bus ? 2.19 : 1.58, l = bus ? 7.9 : 3.78, top = bus ? 2.49 : 1.24;
  shape.box([0, top * .50, 0], [l, top * .73, w], paint);
  shape.box([-.09, top * .82, 0], [l * (bus ? .92 : .53), top * .34, w * .94], '#4e7680');
  shape.box([-.05, top * .989, 0], [l * (bus ? .98 : .53), .085, w * .96], tint(paint, 1.10));
  for (const x of [-l * .29, l * .30]) for (const side of [-1, 1]) {
    shape.tube([x, .30, side * w * .42], [x, .30, side * w * .528], .285, .285, '#363e3d', 9);
  }
  for (const x of [-l * .507, l * .507]) for (const side of [-1, 1]) {
    shape.box([x, .55, w * side * .303], [.058, .10, .22], x < 0 ? '#cf6552' : '#ede8bd');
  }
}

/**
 * Emit an open-canopy park sightseeing shuttle mesh into `shape`.
 * @param {{ paint: string }} spec
 * @param {{ shape: VehicleShapeSink }} sinks
 */
export function emitParkShuttleVehicle({ paint }, { shape }) {
  const l = 3.75, w = 1.42;
  shape.box([0, .42, 0], [l, .34, w], paint);
  shape.box([.25, .84, 0], [l * .68, .46, w * .84], '#e6dec6');
  shape.box([1.48, .76, 0], [.52, .36, w * .92], '#4e6d74');
  shape.box([-.05, 1.80, 0], [l * .84, .09, w * .94], '#f2ede0');
  for (const x of [-1.25, 1.25]) for (const z of [-.58, .58]) shape.box([x, 1.18, z], [.08, 1.22, .08], '#3c4743');
  for (const x of [-1.18, 1.18]) for (const side of [-1, 1]) shape.tube([x, .26, side * .60], [x, .26, side * .74], .24, .24, '#303837', 8);
  for (const x of [-l * .505, l * .505]) for (const side of [-1, 1]) shape.box([x, .44, side * w * .32], [.06, .10, .20], x < 0 ? '#cf6552' : '#ede8bd');
}
