export function emitStreetLamp({ x, z, direction: dir }, { scenery }) {
  const at = (u, y) => [x + dir[0] * u, y, z + dir[2] * u];
  const paint = '#495a50';
  scenery.tube(at(0, 0), at(0, .27), .115, .083, paint, 6);
  scenery.tube(at(0, .15), at(0, 3.35), .062, .041, paint, 6);
  scenery.tube(at(0, 3.31), at(.29, 3.62), .042, .037, paint, 5);
  scenery.tube(at(.27, 3.61), at(.72, 3.62), .038, .036, paint, 5);
  const yaw = -Math.atan2(dir[2], dir[0]);
  scenery.box(at(.76, 3.615), [.36, .11, .21], '#54635a', yaw);
  scenery.box(at(.80, 3.555), [.25, .045, .15], '#ded9b9', yaw);
}

export function emitLondonLantern({ x, z }, { scenery }) {
  scenery.tube([x,0,z],[x,3.13,z],.093,.046,'#444a49',6,false);
  scenery.box([x,3.37,z],[.34,.42,.34],'#d8c9a4',Math.PI/4);
  scenery.tube([x,3.54,z],[x,3.78,z],.26,.05,'#484e4c',4,false);
}
