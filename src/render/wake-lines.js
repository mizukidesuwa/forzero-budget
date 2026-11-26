import { mix } from '../core/math.js';

const VERTEX = `#version 300 es
layout(location=0) in vec3 aPosition;
uniform mat4 uVp;
void main() { gl_Position = uVp * vec4(aPosition, 1.0); }
`;
const FRAGMENT = `#version 300 es
precision mediump float;
out vec4 color;
void main() { color = vec4(.79, .95, 1.0, .45); }
`;

export function createWakeLines(gl, program) {
  const shader = program(VERTEX, FRAGMENT, ['uVp']);
  const vao = gl.createVertexArray(), buffer = gl.createBuffer();
  const vertices = new Float32Array(3 * 2 * 5);
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  return ({ rear, front }, vp, time) => {
    const dx = front[0] - rear[0], dz = front[2] - rear[2];
    const length = Math.max(.01, Math.hypot(dx, dz));
    let i = 0;
    for (let lane = -2; lane <= 2; lane++) {
      const phase = (time * 1.7 + (lane + 2) * .19) % 1;
      for (const t of [phase * .76, phase * .76 + .21]) {
        const spread = lane * mix(.21, .11, t);
        vertices[i++] = mix(rear[0], front[0], t) - dz / length * spread;
        vertices[i++] = mix(rear[1], front[1], t) + .05 * Math.abs(lane);
        vertices[i++] = mix(rear[2], front[2], t) + dx / length * spread;
      }
    }
    gl.useProgram(shader.p);
    gl.uniformMatrix4fv(shader.u.uVp, false, vp);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.drawArrays(gl.LINES, 0, vertices.length / 3);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  };
}
