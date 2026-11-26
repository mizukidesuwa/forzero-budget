import { clamp, identity, mix, multiply, transform } from '../core/math.js';

export function emptyBounds() {
  return { low: [Infinity, Infinity, Infinity], high: [-Infinity, -Infinity, -Infinity] };
}

export function addToBounds({ low, high }, vertices, start) {
  for (let axis = 0; axis < 3; axis++) {
    const coordinate = vertices[start + axis];
    low[axis] = Math.min(low[axis], coordinate);
    high[axis] = Math.max(high[axis], coordinate);
  }
}

export function shapeBounds(vertices) {
  const bounds = emptyBounds();
  for (let i = 0; i < vertices.length; i += 11) addToBounds(bounds, vertices, i);
  return bounds;
}

export function frustumPlanes(matrix) {
  const planes = [];
  for (let axis = 0; axis < 3; axis++) {
    for (const side of [-1, 1]) {
      planes.push(Array.from({ length: 4 }, (_, column) =>
        matrix[column * 4 + 3] + side * matrix[column * 4 + axis]));
    }
  }
  return planes;
}

export function seesBounds(planes, { low, high }) {
  for (const [x, y, z, w] of planes) {
    if (x * (x >= 0 ? high[0] : low[0]) + y * (y >= 0 ? high[1] : low[1]) +
        z * (z >= 0 ? high[2] : low[2]) + w < -.001) return false;
  }
  return true;
}

export function visibleStatic(objects, planes) {
  return objects.filter(([mesh]) => seesBounds(planes, mesh.bounds));
}

export function meshCells(gpu, shapes, material = 0) {
  const cellWidth = 32;
  const cells = new Map();
  const vertices = new Float32Array(shapes.reduce((sum, shape) => sum + shape.vertices.length, 0));
  const packedIndices = new Uint32Array(shapes.reduce((sum, shape) => sum + shape.indices.length, 0));
  let position = 0;
  // Assign each triangle once. Its full extent is included in its cell's bounds.
  for (const shape of shapes) {
    const { indices } = shape, base = position / 11;
    vertices.set(shape.vertices, position);
    position += shape.vertices.length;
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] + base, b = indices[i + 1] + base, c = indices[i + 2] + base;
      const x = Math.floor((vertices[a * 11] + vertices[b * 11] + vertices[c * 11]) / (3 * cellWidth));
      const z = Math.floor((vertices[a * 11 + 2] + vertices[b * 11 + 2] + vertices[c * 11 + 2]) / (3 * cellWidth));
      const key = x * 4096 + z;
      if (!cells.has(key)) cells.set(key, { indices: [], bounds: emptyBounds() });
      const cell = cells.get(key);
      cell.indices.push(a, b, c);
      addToBounds(cell.bounds, vertices, a * 11);
      addToBounds(cell.bounds, vertices, b * 11);
      addToBounds(cell.bounds, vertices, c * 11);
    }
  }
  let first = 0;
  const ranges = Array.from(cells.keys()).sort((a, b) => a - b).map(key => {
    const { indices, bounds } = cells.get(key);
    packedIndices.set(indices, first);
    const range = { offset: first * Uint32Array.BYTES_PER_ELEMENT, count: indices.length, bounds };
    first += indices.length;
    return range;
  });
  if (!ranges.length) return [];
  const owner = new gpu.Mesh({ vertices, indices: packedIndices }, material);
  const { vao, texture } = owner;
  return ranges.map(range => ({ ...range, vao, texture, material, owner }));
}

export function waterReflectionArea(camera, frustum, lakes) {
  let left = Infinity, bottom = Infinity, right = -Infinity, top = -Infinity;
  const extend = ([x, y, , w]) => {
    left = Math.min(left, x / w); right = Math.max(right, x / w);
    bottom = Math.min(bottom, y / w); top = Math.max(top, y / w);
  };
  for (const lake of lakes) {
    if (Math.hypot(lake.x - camera.eye[0], lake.z - camera.eye[2]) >= 116 || !seesBounds(frustum, lake)) continue;
    const { low, high } = lake, y = low[1];
    const corners = [[low[0], y, low[2]], [high[0], y, low[2]], [high[0], y, high[2]], [low[0], y, high[2]]]
      .map(p => transform(camera.vp, p));
    // Clip the perimeter at the near plane before dividing by clip-space w.
    for (let i = 0; i < corners.length; i++) {
      const a = corners[i], b = corners[(i + 1) % corners.length];
      const da = a[2] + a[3], db = b[2] + b[3];
      if (da >= 0) extend(a);
      if ((da < 0) !== (db < 0)) extend(a.map((v, j) => mix(v, b[j], da / (da - db))));
    }
  }
  if (left === Infinity) return null;
  const pad = .030;
  left = clamp(left - pad, -1, 1); right = clamp(right + pad, -1, 1);
  bottom = clamp(bottom - pad, -1, 1); top = clamp(top + pad, -1, 1);
  if (right <= left || top <= bottom) return null;
  return { left, right, bottom, top };
}

export function reflectionCrop(projection, area, width, height) {
  const x0 = Math.max(0, Math.floor((area.left * .5 + .5) * width) - 2);
  const y0 = Math.max(0, Math.floor((area.bottom * .5 + .5) * height) - 2);
  const x1 = Math.min(width, Math.ceil((area.right * .5 + .5) * width) + 2);
  const y1 = Math.min(height, Math.ceil((area.top * .5 + .5) * height) + 2);
  const crop = identity(), w = x1 - x0, h = y1 - y0;
  crop[0] = width / w; crop[5] = height / h;
  crop[12] = (width - x0 - x1) / w; crop[13] = (height - y0 - y1) / h;
  return { x: x0, y: y0, width: w, height: h, planes: frustumPlanes(multiply(crop, projection)) };
}
