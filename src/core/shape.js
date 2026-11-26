import { TAU, UP, add, cross, length, normalize, placement, rgb, scale, subtract, transform } from './math.js';

export class Shape {
  constructor() {
    this.vertices = [];
    this.indices = [];
  }

  vertex(p, n, c, u = 0, v = 0) {
    const index = this.vertices.length / 11;
    this.vertices.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], u, v);
    return index;
  }

  triangle(a, b, c, color, normal = UP) {
    const start = this.vertex(a, normal, rgb(color));
    this.vertex(b, normal, rgb(color));
    this.vertex(c, normal, rgb(color));
    this.indices.push(start, start + 1, start + 2);
  }

  quad(a, b, c, d, color, normal = UP) {
    const start = this.vertex(a, normal, rgb(color), 0, 0);
    this.vertex(b, normal, rgb(color), 1, 0);
    this.vertex(c, normal, rgb(color), 1, 1);
    this.vertex(d, normal, rgb(color), 0, 1);
    this.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }

  box(center, dimensions, color, yaw = 0, roll = 0) {
    const [x, y, z] = scale(dimensions, 0.5);
    const m = placement(center, 0, yaw, roll);
    const coords = [[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]];
    const p = coords.map(point => transform(m, point));
    const faces = [
      [4, 5, 6, 7, [0, 0, 1]], [1, 0, 3, 2, [0, 0, -1]],
      [0, 4, 7, 3, [-1, 0, 0]], [5, 1, 2, 6, [1, 0, 0]],
      [3, 7, 6, 2, UP], [0, 1, 5, 4, [0, -1, 0]]
    ];
    for (const [a, b, c, d, normal] of faces) {
      this.quad(p[a], p[b], p[c], p[d], color, transform(m, normal, 0));
    }
  }

  ellipsoid(p, radii, color, lon = 10, lat = 6, roll = 0, yaw = 0) {
    const m = placement(p, 0, yaw, roll);
    const start = this.vertices.length / 11;
    const c = rgb(color);
    for (let j = 0; j <= lat; j++) {
      const y = Math.cos(Math.PI * j / lat);
      const ring = Math.sin(Math.PI * j / lat);
      for (let i = 0; i <= lon; i++) {
        const angle = TAU * i / lon;
        const n = [Math.cos(angle) * ring, y, Math.sin(angle) * ring];
        const point = n.map((value, dim) => value * radii[dim]);
        const normal = normalize(n.map((value, dim) => value / radii[dim]));
        this.vertex(transform(m, point), transform(m, normal, 0), c);
        if (j && i) {
          const d = start + j * (lon + 1) + i;
          const a = d - lon - 2;
          if (j > 1) this.indices.push(a, a + 1, d);
          if (j < lat) this.indices.push(a, d, d - 1);
        }
      }
    }
  }

  tube(a, b, r1, r2, color, sides = 9, capped = true) {
    const axis = normalize(subtract(b, a));
    const u = normalize(cross(axis, Math.abs(axis[1]) > .85 ? [0, 0, 1] : UP));
    const v = cross(axis, u);
    const c = rgb(color);
    const start = this.vertices.length / 11;
    const taper = (r1 - r2) / Math.max(length(subtract(b, a)), 0.001);
    const bottom = [], top = [];
    for (let i = 0; i <= sides; i++) {
      const angle = TAU * i / sides;
      const n = add(scale(u, Math.cos(angle)), scale(v, Math.sin(angle)));
      const normal = normalize(add(n, scale(axis, taper)));
      bottom.push(add(a, scale(n, r1)));
      top.push(add(b, scale(n, r2)));
      this.vertex(bottom[i], normal, c);
      this.vertex(top[i], normal, c);
      if (i > 0) {
        const current = start + i * 2;
        this.indices.push(current - 2, current, current + 1, current - 2, current + 1, current - 1);
      }
    }
    if (capped) {
      for (let i = 1; i <= sides; i++) {
        this.triangle(a, bottom[i], bottom[i - 1], c, scale(axis, -1));
        this.triangle(b, top[i - 1], top[i], c, axis);
      }
    }
  }

  torus(radius, thickness, color, segments = 48, slices = 7, squash = 1) {
    const start = this.vertices.length / 11;
    const c = rgb(color);
    for (let i = 0; i <= segments; i++) {
      const a = TAU * i / segments;
      const x = Math.cos(a), y = Math.sin(a);
      for (let j = 0; j <= slices; j++) {
        const angle = TAU * j / slices;
        const out = Math.cos(angle);
        const r = radius + thickness * out;
        const side = Math.sin(angle);
        this.vertex([r * x, r * y, thickness * side * squash], [x * out, y * out, side], c);
        if (i && j) {
          const d = start + i * (slices + 1) + j;
          const b = d - slices - 1;
          this.indices.push(b - 1, b, d, b - 1, d, d - 1);
        }
      }
    }
  }
}
