export const TAU = Math.PI * 2;
export const UP = [0, 1, 0];
export const ORIGIN = [0, 0, 0];
export const ROAD_Y = 0.041;
export const WATER_Y = 0.017;
export const CITY_ASPHALT = ROAD_Y - .004;

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const mix = (a, b, t) => a + (b - a) * t;
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const subtract = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (v, s) => [v[0] * s, v[1] * s, v[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = (v) => Math.hypot(v[0], v[1], v[2]);
export const normalize = (v) => scale(v, 1 / Math.max(length(v), 1e-8));
export const lerpPoint = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
export const unitRight = (dir) => [-dir[2], 0, dir[0]];
export const headingVector = (angle) => [Math.cos(angle), 0, Math.sin(angle)];

export function randomSource(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

let _random = randomSource(30986);
export function getRandom() { return _random; }
export function setRandom(fn) {
  const previous = _random;
  _random = fn;
  return previous;
}
export function withRandom(seedOrFn, fn) {
  const previous = _random;
  _random = typeof seedOrFn === 'function' ? seedOrFn : randomSource(seedOrFn);
  try { return fn(); }
  finally { _random = previous; }
}
export function random() { return _random(); }
export const range = (lo, hi) => mix(lo, hi, _random());
export const choose = (items) => items[Math.floor(_random() * items.length)];

const colors = new Map();

export function rgb(hex) {
  if (Array.isArray(hex)) return hex;
  if (!colors.has(hex)) {
    const value = parseInt(hex.replace('#', ''), 16);
    colors.set(hex, [(value >> 16) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255]);
  }
  return colors.get(hex);
}

export function tint(hex, amount) {
  return rgb(hex).map(value => clamp(value * amount, 0, 1));
}

export function identity() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}
export const IDENTITY = identity();

export function multiply(a, b) {
  const result = new Float32Array(16);
  for (let col = 0; col < 16; col += 4) {
    for (let row = 0; row < 4; row++) {
      result[col + row] = a[row] * b[col] + a[row + 4] * b[col + 1] + a[row + 8] * b[col + 2] + a[row + 12] * b[col + 3];
    }
  }
  return result;
}

export function placement(p, rx = 0, ry = 0, rz = 0) {
  const sx = Math.sin(rx), cx = Math.cos(rx);
  const sy = Math.sin(ry), cy = Math.cos(ry);
  const sz = Math.sin(rz), cz = Math.cos(rz);
  return new Float32Array([
    cy * cz + sy * sx * sz, cx * sz, -sy * cz + cy * sx * sz, 0,
    -cy * sz + sy * sx * cz, cx * cz, sy * sz + cy * sx * cz, 0,
    sy * cx, -sx, cy * cx, 0,
    p[0], p[1], p[2], 1
  ]);
}

export function transform(m, p, w = 1) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12] * w,
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13] * w,
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14] * w,
    m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15] * w
  ];
}

export function viewAt(eye, target) {
  const back = normalize(subtract(eye, target));
  const right = normalize(cross(UP, back));
  const up = cross(back, right);
  return {
    back, right, up,
    matrix: new Float32Array([
      right[0], up[0], back[0], 0,
      right[1], up[1], back[1], 0,
      right[2], up[2], back[2], 0,
      -dot(right, eye), -dot(up, eye), -dot(back, eye), 1
    ])
  };
}

export function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov * 0.5);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0]);
}

export function ortho(radius, near, far) {
  return new Float32Array([1 / radius, 0, 0, 0, 0, 1 / radius, 0, 0, 0, 0, -2 / (far - near), 0, 0, 0, -(far + near) / (far - near), 1]);
}
