import { createWakeLines } from './wake-lines.js';
import { signCanvas } from '../core/canvas.js';
import { WATER_Y, add, identity, multiply, ortho, randomSource, scale, viewAt } from '../core/math.js';
import { currentWeather, SUN } from './atmosphere.js';
import { frustumPlanes, reflectionCrop, seesBounds, shapeBounds, visibleStatic, waterReflectionArea } from './bounds.js';
import { DEPTH_FRAGMENT, DEPTH_VERTEX, FRAGMENT, SKY_FRAGMENT, SKY_VERTEX, VERTEX } from './shaders.js';

export function renderer(canvas, lakeBounds = []) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: true, powerPreference: 'high-performance' });
  if (!gl) throw new Error('WebGL 2 unavailable');
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(.735, .790, .758, 1);

  function shader(name, source) {
    const compiled = gl.createShader(name);
    gl.shaderSource(compiled, source);
    gl.compileShader(compiled);
    if (!gl.getShaderParameter(compiled, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(compiled));
    return compiled;
  }

  function program(vertex, fragment, uniforms) {
    const p = gl.createProgram();
    const sources = [shader(gl.VERTEX_SHADER, vertex), shader(gl.FRAGMENT_SHADER, fragment)];
    sources.forEach(s => gl.attachShader(p, s));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    sources.forEach(s => gl.deleteShader(s));
    const u = Object.fromEntries(uniforms.map(name => [name, gl.getUniformLocation(p, name)]));
    return { p, u };
  }

  const surfaceUniforms = ['uVp', 'uModel', 'uLight', 'uNearLight', 'uEye', 'uSun', 'uDepth', 'uNearDepth',
    'uReflection', 'uDecal', 'uGroundNoise', 'uSize', 'uTime', 'uMaterial', 'uMirror', 'uGhost', 'uReflect',
    'uFogColor', 'uFillLow', 'uFillHigh', 'uSunColor', 'uHeadPos', 'uHeadDir', 'uAtmosphere'];
  const maskedSurface = program(VERTEX, FRAGMENT, surfaceUniforms);
  const opaqueSurface = program(VERTEX, FRAGMENT.replace('precision highp float;', '#define OPAQUE_PASS\nprecision highp float;'), surfaceUniforms);
  // Solid scenery already uses world coordinates and needs only its opaque material.
  const staticVertex = VERTEX.replace('precision highp float;', '#define STATIC_SCENE\nprecision highp float;');
  const staticFragment = FRAGMENT.replace('precision highp float;',
    '#define OPAQUE_PASS\n#define STATIC_SCENE\nprecision highp float;');
  const solidSurface = program(staticVertex, staticFragment, surfaceUniforms);
  const sky = program(SKY_VERTEX, SKY_FRAGMENT, ['uRight', 'uUp', 'uBack', 'uSun', 'uSkyLow', 'uSkyHigh', 'uCloudColor', 'uSunGlow', 'uTangent', 'uCloudAlpha', 'uMirror']);
  const depth = program(DEPTH_VERTEX, DEPTH_FRAGMENT, ['uVp', 'uModel']);

  function canvasTexture(source) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  const labelTextures = new WeakMap();

  class Mesh {
    constructor(shape, material = 0, image = null, dynamic = false) {
      this.material = material;
      this.image = image;
      if (image && !labelTextures.has(image)) labelTextures.set(image, { texture: canvasTexture(image), uses: 0 });
      const label = image ? labelTextures.get(image) : null;
      if (label) label.uses++;
      this.texture = label?.texture ?? flatTexture;
      this.usage = dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW;
      this.dynamic = dynamic;
      this.offset = 0;
      if (!dynamic && !ArrayBuffer.isView(shape.vertices)) this.bounds = shapeBounds(shape.vertices);
      this.vao = gl.createVertexArray();
      this.vbo = gl.createBuffer();
      this.index = gl.createBuffer();
      this.update(shape);
      for (const [pos, size, offset] of [[0, 3, 0], [1, 3, 12], [2, 3, 24], [3, 2, 36]]) {
        gl.enableVertexAttribArray(pos);
        gl.vertexAttribPointer(pos, size, gl.FLOAT, false, 44, offset);
      }
      gl.bindVertexArray(null);
    }

    dispose() {
      gl.deleteVertexArray(this.vao);
      gl.deleteBuffer(this.vbo);
      gl.deleteBuffer(this.index);
      if (!this.image) return;
      const label = labelTextures.get(this.image);
      if (--label.uses === 0) {
        gl.deleteTexture(label.texture);
        labelTextures.delete(this.image);
      }
    }

    update(shape) {
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      let vertices;
      if (this.dynamic) {
        if (this.poseVertices?.length !== shape.vertices.length) {
          this.poseVertices = new Float32Array(shape.vertices.length);
        }
        this.poseVertices.set(shape.vertices);
        vertices = this.poseVertices;
      } else {
        vertices = ArrayBuffer.isView(shape.vertices) ? shape.vertices : new Float32Array(shape.vertices);
      }
      gl.bufferData(gl.ARRAY_BUFFER, vertices, this.usage);
      // The animated rider keeps the same mesh topology between poses.
      if (this.count !== shape.indices.length) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.index);
        const indices = ArrayBuffer.isView(shape.indices) ? shape.indices : new Uint32Array(shape.indices);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
        this.count = shape.indices.length;
      }
    }
  }

  const flatTexture = canvasTexture(signCanvas(1, 1, ctx => {
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 1, 1);
  }));

  function configureTargetTexture(texture, filter = gl.NEAREST) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  function groundNoiseTexture() {
    const size = 512, fill = randomSource(73041), pixels = new Uint8Array(size * size);
    for (let i = 0; i < pixels.length; i++) pixels[i] = Math.floor(fill() * 256);
    const texture = gl.createTexture();
    configureTargetTexture(texture, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, size, size, 0, gl.RED, gl.UNSIGNED_BYTE, pixels);
    return texture;
  }

  const groundNoise = groundNoiseTexture();

  function depthTarget(size) {
    const target = gl.createFramebuffer(), texture = gl.createTexture();
    configureTargetTexture(texture, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, texture, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Shadow framebuffer unavailable');
    return { target, texture, size };
  }

  const worldDepth = depthTarget(Math.min(3072, gl.getParameter(gl.MAX_TEXTURE_SIZE)));
  const riderDepth = depthTarget(384);
  const reflection = {
    target: gl.createFramebuffer(), texture: gl.createTexture(), depth: gl.createRenderbuffer(),
    width: 0, height: 0
  };

  function resizeMirror(width, height) {
    const reduction = Math.min(.44, 640 / Math.max(width, height));
    const w = Math.max(1, Math.round(width * reduction)), h = Math.max(1, Math.round(height * reduction));
    if (reflection.width === w && reflection.height === h) return;
    configureTargetTexture(reflection.texture, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, reflection.depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, reflection.target);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, reflection.texture, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, reflection.depth);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Reflection framebuffer unavailable');
    reflection.width = w;
    reflection.height = h;
  }

  function lightMatrix(center, radius, distance, far) {
    const eye = add(center, scale(SUN, distance));
    return multiply(ortho(radius, .1, far), viewAt(eye, center).matrix);
  }

  const light = lightMatrix([-8, 0, 5], 314, 422, 865);
  const reflectionTransform = identity();
  reflectionTransform[5] = -1;
  reflectionTransform[13] = WATER_Y * 2;

  function drawBatches(objects, setUniforms) {
    let previousMesh, previousModel, offset = 0, count = 0;
    const draw = () => gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_INT, offset);
    for (const [mesh, model] of objects) {
      if (mesh.vao === previousMesh?.vao && model === previousModel &&
          mesh.offset === offset + count * Uint32Array.BYTES_PER_ELEMENT) {
        count += mesh.count;
        continue;
      }
      if (previousMesh) draw();
      if (mesh.vao !== previousMesh?.vao) gl.bindVertexArray(mesh.vao);
      setUniforms(mesh, model, previousMesh, previousModel);
      previousMesh = mesh;
      previousModel = model;
      offset = mesh.offset;
      count = mesh.count;
    }
    if (previousMesh) draw();
  }

  function shadowPass(destination, projection, objects) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, destination.target);
    gl.viewport(0, 0, destination.size, destination.size);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1, 1);
    gl.useProgram(depth.p);
    gl.uniformMatrix4fv(depth.u.uVp, false, projection);
    drawBatches(objects, (_mesh, model, _previous, previousModel) => {
      if (model !== previousModel) gl.uniformMatrix4fv(depth.u.uModel, false, model);
    });
    gl.disable(gl.POLYGON_OFFSET_FILL);
  }

  let headPos = [0, 1, 0], headDir = [1, 0, 0];
  function bindTexture(index, texture) {
    gl.activeTexture(gl.TEXTURE0 + index);
    gl.bindTexture(gl.TEXTURE_2D, texture);
  }

  function surfacePass({ p, u }, projection, eye, nearLight, size, time, objects,
    { isReflection = false, ghost = false, reflect = true } = {}) {
    gl.useProgram(p);
    gl.uniformMatrix4fv(u.uVp, false, projection);
    gl.uniformMatrix4fv(u.uLight, false, light);
    gl.uniformMatrix4fv(u.uNearLight, false, nearLight);
    gl.uniform3fv(u.uEye, eye);
    const weather = currentWeather();
    gl.uniform3fv(u.uSun, weather.sun);
    gl.uniform3fv(u.uFogColor, weather.fog);
    gl.uniform3fv(u.uFillLow, weather.fillLow);
    gl.uniform3fv(u.uFillHigh, weather.fillHigh);
    gl.uniform3fv(u.uSunColor, weather.sunColor);
    gl.uniform3fv(u.uHeadPos, headPos);
    gl.uniform3fv(u.uHeadDir, headDir);
    gl.uniform4f(u.uAtmosphere, weather.fogDensity, weather.headlight, weather.wetness, 0);
    gl.uniform2fv(u.uSize, size);
    gl.uniform1f(u.uTime, time);
    gl.uniform1i(u.uMirror, isReflection ? 1 : 0);
    gl.uniform1i(u.uGhost, ghost === 2 ? 2 : ghost ? 1 : 0);
    gl.uniform1i(u.uReflect, reflect ? 1 : 0);
    bindTexture(0, worldDepth.texture);
    bindTexture(1, riderDepth.texture);
    // The reflection target cannot be bound as an input during its own pass.
    bindTexture(2, isReflection || !reflect ? flatTexture : reflection.texture);
    gl.uniform1i(u.uDepth, 0);
    gl.uniform1i(u.uNearDepth, 1);
    gl.uniform1i(u.uReflection, 2);
    gl.uniform1i(u.uDecal, 3);
    bindTexture(4, groundNoise);
    gl.uniform1i(u.uGroundNoise, 4);
    drawBatches(objects, (mesh, model, previous, previousModel) => {
      if (model !== previousModel) gl.uniformMatrix4fv(u.uModel, false, model);
      if (mesh.material !== previous?.material) gl.uniform1i(u.uMaterial, mesh.material);
      if (mesh.texture !== previous?.texture) bindTexture(3, mesh.texture);
    });
  }

  function skyPass(camera, mirrored) {
    gl.useProgram(sky.p);
    gl.uniform3fv(sky.u.uRight, camera.right);
    gl.uniform3fv(sky.u.uUp, camera.up);
    gl.uniform3fv(sky.u.uBack, camera.back);
    const weather = currentWeather();
    gl.uniform3fv(sky.u.uSun, weather.sun);
    gl.uniform3fv(sky.u.uSkyLow, weather.skyLow);
    gl.uniform3fv(sky.u.uSkyHigh, weather.skyHigh);
    gl.uniform3fv(sky.u.uCloudColor, weather.cloudColor);
    gl.uniform3fv(sky.u.uSunGlow, weather.sunGlow);
    gl.uniform2fv(sky.u.uTangent, camera.tangent);
    gl.uniform1f(sky.u.uCloudAlpha, weather.cloudAlpha);
    gl.uniform1i(sky.u.uMirror, mirrored ? 1 : 0);
    gl.depthMask(false);
    gl.depthFunc(gl.LEQUAL);
    gl.bindVertexArray(null);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
  }

  const smoothing = program(`#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vUv=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
  gl_Position=vec4(vUv*2.0-1.0,0.0,1.0);
}`, `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSource;
uniform vec2 uTexel;
out vec4 pixel;
float luma(vec3 c) { return dot(c,vec3(.299,.587,.114)); }
void main() {
  vec3 center=texture(uSource,vUv).rgb;
  float m=luma(center);
  float nw=luma(texture(uSource,vUv+vec2(-1,1)*uTexel).rgb);
  float ne=luma(texture(uSource,vUv+uTexel).rgb);
  float sw=luma(texture(uSource,vUv-uTexel).rgb);
  float se=luma(texture(uSource,vUv+vec2(1,-1)*uTexel).rgb);
  float lo=min(m,min(min(nw,ne),min(sw,se)));
  float hi=max(m,max(max(nw,ne),max(sw,se)));
  if(hi-lo<max(.024,hi*.115)) { pixel=vec4(center,1.0);return; }
  vec2 direction=vec2(nw+sw-ne-se,nw+ne-sw-se);
  float softness=max(.008,(nw+ne+sw+se)*.028);
  direction=clamp(direction/(min(abs(direction.x),abs(direction.y))+softness),vec2(-6),vec2(6))*uTexel;
  vec3 a=(texture(uSource,vUv-direction*.162).rgb+texture(uSource,vUv+direction*.162).rgb)*.5;
  vec3 b=a*.5+(texture(uSource,vUv-direction*.495).rgb+texture(uSource,vUv+direction*.495).rgb)*.25;
  float ba=luma(b);
  pixel=vec4(ba<lo||ba>hi?a:b,1.0);
}`, ['uSource', 'uTexel']);

  const scenePixels = {
    width: 0, height: 0, mode: '', samples: 0, valid: false,
    resolve: gl.createFramebuffer(), color: gl.createTexture(), depth: gl.createRenderbuffer(),
    msaa: gl.createFramebuffer(), sampleColor: gl.createRenderbuffer(), sampleDepth: gl.createRenderbuffer()
  };

  const supportedSamples = (() => {
    try {
      const colors = Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA8, gl.SAMPLES));
      const depths = Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, gl.SAMPLES));
      return [4, 2].filter(n => colors.includes(n) && depths.includes(n));
    } catch { return []; }
  })();

  function attachSceneBuffer(target, attachment, buffer, colorFormat, width, height, samples = 0) {
    gl.bindRenderbuffer(gl.RENDERBUFFER, buffer);
    if (samples) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, colorFormat, width, height);
    else gl.renderbufferStorage(gl.RENDERBUFFER, colorFormat, width, height);
    gl.framebufferRenderbuffer(target, attachment, gl.RENDERBUFFER, buffer);
  }

  function sceneTarget(width, height, mode) {
    const s = scenePixels;
    if (mode === 'off') return null;
    if (s.width === width && s.height === height && s.mode === mode) return s.valid ? s : null;

    const sizeChanged = s.width !== width || s.height !== height || !s.valid;
    s.width = width; s.height = height; s.mode = mode; s.samples = 0;
    if (sizeChanged) {
      configureTargetTexture(s.color, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, s.resolve);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, s.color, 0);
      attachSceneBuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, s.depth, gl.DEPTH_COMPONENT24, width, height);
      s.valid = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      if (!s.valid) return null;
    }
    if (mode === 'msaa' || mode === 'msaa2') {
      gl.bindFramebuffer(gl.FRAMEBUFFER, s.msaa);
      for (const count of supportedSamples) {
        if (mode === 'msaa2' && count > 2) continue;
        attachSceneBuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, s.sampleColor, gl.RGBA8, width, height, count);
        attachSceneBuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, s.sampleDepth, gl.DEPTH_COMPONENT24, width, height, count);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
          s.samples = count;
          break;
        }
      }
    }
    return s;
  }

  function presentScene(target, width, height) {
    if (!target) return;
    if (target.samples) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.msaa);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, target.resolve);
      gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(smoothing.p);
    bindTexture(0, target.color);
    gl.uniform1i(smoothing.u.uSource, 0);
    gl.uniform2f(smoothing.u.uTexel, 1 / width, 1 / height);
    gl.bindVertexArray(null);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST);
  }

  const drawWake = createWakeLines(gl, program);

  function draw(camera, world, route, riderObjects, riderPosition, time, ghosts, traffic, aa, head = null, ghostStyle = 1, wake = null) {
    if (head) { headPos = head.pos; headDir = head.dir; }
    const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
    const frustum = frustumPlanes(camera.vp);
    const solid = visibleStatic(world.solid, frustum);
    const surfaces = visibleStatic(world.surfaces, frustum);
    const course = [], decals = visibleStatic(world.labels, frustum);
    for (const entry of visibleStatic(route, frustum)) {
      (entry[0].material === 5 ? decals : course).push(entry);
    }
    const nearLight = lightMatrix(add(riderPosition, [0, .56, 0]), 3.6, 9.6, 21);
    shadowPass(riderDepth, nearLight, riderObjects);
    const area = world.hasWater ? waterReflectionArea(camera, frustum, world.waterBounds ?? lakeBounds) : null;
    const reflect = area !== null;
    if (reflect) {
      resizeMirror(width, height);
      const mirrorSize = [reflection.width, reflection.height];
      const reflectedProjection = multiply(camera.vp, reflectionTransform);
      const reflectedEye = [camera.eye[0], 2 * WATER_Y - camera.eye[1], camera.eye[2]];
      const crop = reflectionCrop(reflectedProjection, area, ...mirrorSize);
      gl.bindFramebuffer(gl.FRAMEBUFFER, reflection.target);
      gl.viewport(0, 0, ...mirrorSize);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(crop.x, crop.y, crop.width, crop.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const [ex, , ez] = camera.eye;
      const mirrored = world.mirrored.filter(([mesh]) => {
        const { low, high } = mesh.bounds;
        const dx = ex < low[0] ? low[0] - ex : ex > high[0] ? ex - high[0] : 0;
        const dz = ez < low[2] ? low[2] - ez : ez > high[2] ? ez - high[2] : 0;
        return dx * dx + dz * dz <= 75625 && seesBounds(crop.planes, mesh.bounds);
      });
      surfacePass(maskedSurface, reflectedProjection, reflectedEye, nearLight, mirrorSize, time, mirrored, { isReflection: true });
      skyPass(camera, true);
      gl.disable(gl.SCISSOR_TEST);
    }

    const target = sceneTarget(width, height, aa);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? (target.samples ? target.msaa : target.resolve) : null);
    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const size = [width, height], lighting = { reflect };
    const actors = riderObjects.concat(traffic);
    surfacePass(opaqueSurface, camera.vp, camera.eye, nearLight, size, time, actors, lighting);
    surfacePass(solidSurface, camera.vp, camera.eye, nearLight, size, time, solid, lighting);
    surfacePass(opaqueSurface, camera.vp, camera.eye, nearLight, size, time, surfaces.concat(course, [world.ground]), lighting);
    if (currentWeather().rain && world.rainPuddles) {
      surfacePass(opaqueSurface, camera.vp, camera.eye, nearLight, size, time, world.rainPuddles, { reflect: false });
    }
    if (decals.length) surfacePass(maskedSurface, camera.vp, camera.eye, nearLight, size, time, decals, lighting);
    skyPass(camera, false);
    if (ghosts.length) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      surfacePass(opaqueSurface, camera.vp, camera.eye, nearLight, size, time, ghosts, { ghost: ghostStyle, reflect });
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
    if (wake) drawWake(wake, camera.vp, time);
    presentScene(target, width, height);
    return { width, height, fxaa: Boolean(target), samples: target?.samples ?? 0 };
  }

  return {
    Mesh, draw,
    bake: (objects) => shadowPass(worldDepth, light, visibleStatic(objects, frustumPlanes(light)))
  };
}
