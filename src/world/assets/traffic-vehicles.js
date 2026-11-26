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
