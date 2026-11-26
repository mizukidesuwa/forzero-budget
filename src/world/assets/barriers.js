export function emitBarrier({ x, z, width, yaw = 0, kind = 'works' }, { scenery, footprint }) {
  const low = kind === 'clearance';
  const depth = low ? .48 : .34;
  const height = low ? .58 : 1.02;
  const box = (at, y, w, h, d, color) =>
    scenery.box([x + Math.cos(yaw) * at, y, z - Math.sin(yaw) * at], [w, h, d], color, yaw);
  box(0, height * .67, width, height * .64, depth, low ? '#c6b69b' : '#e3a84b');
  const stripes = Math.ceil(width / 1.1);
  for (let i = 0; i < stripes; i++) {
    const at = width * ((i + .5) / stripes - .5);
    box(at, height * .64, width / stripes * .38, height * .36, depth + .014, '#4b4541');
  }
  for (const side of [-1, 1]) box(side * width * .38, .14, .29, .28, depth + .32, '#696660');
  footprint?.(x, z, width, depth, yaw, height);
}
