import { clamp, placement } from '../core/math.js';
import { londonTraffic } from '../data/traffic.js';
import { trafficPosition } from '../world/traffic.js';
import { frustumPlanes, seesBounds } from './bounds.js';

export function prepareTraffic(camera, time, actors, meshes, elevation, grade = null) {
  const { detailDistance, fadeDistance, drawDistance } = londonTraffic.render;
  const [ex, , ez] = camera.eye;
  const models = [], batches = new Map();
  const planes = actors[0]?.lodModel ? frustumPlanes(camera.vp) : null;
  for (const actor of actors) {
    const pose = trafficPosition(actor, time);
    if (!pose || pose.opacity <= 0) continue;
    const { frame, point } = pose;
    const dx = point[0] - ex, dz = point[2] - ez, distanceSq = dx * dx + dz * dz;
    if (distanceSq >= drawDistance * drawDistance) continue;
    point[1] += elevation(point[0], point[2]);
    if (planes) {
      const [x, y, z] = point;
      const radius = Math.hypot(actor.halfL, actor.halfW);
      if (!seesBounds(planes, {
        low: [x - radius, y - .1, z - radius], high: [x + radius, y + actor.height, z + radius],
      })) continue;
    }
    const heading = Math.atan2(frame.f[2] * actor.direction, frame.f[0] * actor.direction);
    const transform = placement(point, 0, -heading, grade ? Math.atan(grade(point, heading)) : 0);
    if (!actor.lodModel) {
      models.push([meshes.get(actor.model), transform]);
      continue;
    }
    const mesh = meshes.get(distanceSq < detailDistance * detailDistance ? actor.model : actor.lodModel);
    const rangeOpacity = clamp((drawDistance - Math.sqrt(distanceSq)) / (drawDistance - fadeDistance), 0, 1);
    if (!batches.has(mesh)) batches.set(mesh, []);
    batches.get(mesh).push([transform, Math.min(pose.opacity, rangeOpacity)]);
  }
  return { models, batches };
}

export function createTrafficBatchDrawer(gl) {
  const buffer = gl.createBuffer();
  const configured = new WeakSet();
  const stride = 17;
  let data = new Float32Array(0);
  return (batches, setUniforms) => {
    for (const [mesh, instances] of batches) {
      gl.bindVertexArray(mesh.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      if (!configured.has(mesh)) {
        for (let column = 0; column < 5; column++) {
          const location = 4 + column;
          gl.enableVertexAttribArray(location);
          gl.vertexAttribPointer(location, column === 4 ? 1 : 4, gl.FLOAT, false, stride * 4, column * 16);
          gl.vertexAttribDivisor(location, 1);
        }
        configured.add(mesh);
      }
      const count = instances.length, size = count * stride;
      if (data.length < size) data = new Float32Array(size);
      for (let index = 0; index < count; index++) {
        const [matrix, opacity] = instances[index], offset = index * stride;
        data.set(matrix, offset);
        data[offset + 16] = opacity;
      }
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW, 0, size);
      setUniforms(mesh, null, null, null);
      gl.drawElementsInstanced(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, mesh.offset, count);
    }
  };
}
