export const VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aColor;
layout(location = 3) in vec2 aUv;
#ifdef TRAFFIC_INSTANCES
layout(location = 4) in mat4 aTrafficModel;
layout(location = 8) in float aTrafficOpacity;
flat out float vTrafficOpacity;
#endif
uniform mat4 uVp, uModel, uLight, uNearLight;
out vec3 vWorld, vNormal, vColor;
out vec2 vUv;
out vec4 vShadow, vNearShadow;
void main() {
#ifdef STATIC_SCENE
  vec4 world = vec4(aPosition, 1.0);
  vNormal = aNormal;
#elif defined(TRAFFIC_INSTANCES)
  vec4 world = aTrafficModel * vec4(aPosition, 1.0);
  vNormal = mat3(aTrafficModel) * aNormal;
  vTrafficOpacity = aTrafficOpacity;
#else
  vec4 world = uModel * vec4(aPosition, 1.0);
  vNormal = mat3(uModel) * aNormal;
#endif
  vWorld = world.xyz;
  vColor = aColor;
  vUv = aUv;
  vShadow = uLight * world;
  vNearShadow = uNearLight * world;
  gl_Position = uVp * world;
}`;

export const FRAGMENT = `#version 300 es
precision highp float;
#ifdef TRAFFIC_INSTANCES
flat in float vTrafficOpacity;
#endif
in vec3 vWorld, vNormal, vColor;
in vec2 vUv;
in vec4 vShadow, vNearShadow;
uniform vec3 uEye, uSun, uFogColor, uFillLow, uFillHigh, uSunColor, uHeadPos, uHeadDir;
uniform vec4 uAtmosphere;
uniform highp sampler2DShadow uDepth, uNearDepth;
uniform sampler2D uReflection, uDecal, uGroundNoise;
uniform vec2 uSize;
uniform float uTime;
#ifdef STATIC_SCENE
const int uMaterial = 0, uMirror = 0, uGhost = 0, uReflect = 0;
#else
uniform int uMaterial, uMirror, uGhost, uReflect;
#endif
out vec4 pixel;

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * .1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float noise(vec2 p) {
  vec2 f = fract(p);
  vec2 s = f * f * (3.0 - 2.0 * f);
  return texture(uGroundNoise, (floor(p) + s + .5) / 512.0).r;
}
float shadow1(highp sampler2DShadow depth, vec4 light, float bias) {
  vec3 uvz = light.xyz * .5 + .5;
  if (uvz.x <= .002 || uvz.x >= .998 || uvz.y <= .002 || uvz.y >= .998 || uvz.z > 1.0 || uvz.z < 0.0) return 1.0;
  return texture(depth, vec3(uvz.xy, uvz.z - bias));
}
float shadows(highp sampler2DShadow depth, vec4 light, float bias, float spread) {
  vec3 uvz = light.xyz * .5 + .5;
  if (uvz.x <= .002 || uvz.x >= .998 || uvz.y <= .002 || uvz.y >= .998 || uvz.z > 1.0 || uvz.z < 0.0) return 1.0;
  vec2 px = spread / vec2(textureSize(depth, 0));
  float z = uvz.z - bias;
  float lit=texture(depth,vec3(uvz.xy,z))*2.0;
  lit+=texture(depth,vec3(uvz.xy+px*vec2(-.78,-.52),z));
  lit+=texture(depth,vec3(uvz.xy+px*vec2(.50,-.69),z));
  lit+=texture(depth,vec3(uvz.xy+px*vec2(.79,.57),z));
  lit+=texture(depth,vec3(uvz.xy+px*vec2(-.51,.75),z));
  return lit / 6.0;
}
vec3 fog(vec3 color) {
  vec3 delta = uEye - vWorld;
  float d = length(delta.xz) + abs(delta.y) * .20;
  float haze = 1.0 - exp(-max(0.0, d - 16.0) * uAtmosphere.x);
  return mix(color, uFogColor, haze);
}
void main() {
#ifdef TRAFFIC_INSTANCES
  if (vTrafficOpacity < 1.0) {
    float threshold = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))));
    if (threshold >= vTrafficOpacity) discard;
  }
#endif
#ifndef OPAQUE_PASS
  if (uMirror == 1 && vWorld.y < .024) discard;
#endif
  vec3 n = normalize(vNormal);
  if (uGhost > 0) {
    float glow = .84 + .16 * max(dot(n, uSun), 0.0);
    vec3 tint = uGhost == 2 ? mix(vColor, vec3(.86,.95,.98), .10) : vec3(.38,.88,.91);
    pixel = vec4(fog(tint * glow), uGhost == 2 ? .90 : .46);
    return;
  }
  vec3 color = vColor;
  float sun = max(dot(n, uSun), 0.0);
  float shadow = 1.0;
  if (sun > 0.0) {
    float bias = .00044 + .00067 * (1.0 - sun);
    vec3 eyeDelta = uEye - vWorld;
    if (uMirror == 1 || dot(eyeDelta, eyeDelta) > 9025.0) {
      shadow = shadow1(uDepth, vShadow, bias);
    } else {
      shadow = shadows(uDepth, vShadow, bias, 1.35);
      if (max(abs(vNearShadow.x), abs(vNearShadow.y)) < .996) {
        shadow = min(shadow, shadows(uNearDepth, vNearShadow, .0018 + .0015 * (1.0 - sun), 1.5));
      }
    }
  }
  if (uMaterial == 3) {
    vec3 view = normalize(uEye - vWorld);
    float ripple = sin(dot(vWorld.xz, vec2(2.51,4.11)) - 2.7 * uTime);
    float ripple2 = sin(dot(vWorld.xz, vec2(-.67, 6.42)) + 1.92 * uTime);
    float broad = sin(dot(vWorld.xz, vec2(.39,.81)) - .61 * uTime);
    vec3 surface = normalize(vec3(.017 * ripple + .011 * broad, 1.0, .019 * ripple2 - .012 * ripple));
    float edge = smoothstep(.72,1.0,length(vUv));
    vec3 deep = mix(vec3(.142,.406,.357),vec3(.417,.507,.331),edge * edge);
    vec2 screen = gl_FragCoord.xy / uSize;
    vec2 rippleShift = vec2(ripple * .0015 + broad * .0027, ripple2 * .0024 + ripple * .0013);
    vec3 reflected = uReflect == 1 ? texture(uReflection, clamp(screen + rippleShift, .002, .998)).rgb : vec3(.451,.649,.651);
    float fresnel = .31 + .45 * pow(1.0 - max(dot(surface,view),0.0),3.0);
    float shimmer = pow(max(dot(reflect(-uSun,surface),view),0.0),100.0);
    float lines = (ripple2 + broad) * .006;
    vec3 lake = mix(deep, reflected * vec3(.89,.97,.93), fresnel) + vec3(1.0,.92,.65) * shimmer * .32 + lines;
    lake *= .88 + .12 * shadow;
    pixel = vec4(fog(lake),1.0);
    return;
  }
  if (uMaterial == 1) {
    float patches = noise(vWorld.xz * .29) * .15 + noise(vWorld.xz * 1.17) * .105;
    float grain = hash(floor(vWorld.xz * 44.0)) * .036;
    color = color * (.88 + patches + grain);
    color += vec3(.022,.025,-.008) * smoothstep(.32,.77,noise(vWorld.xz * .69));
  } else if (uMaterial == 2) {
    float grain = hash(floor(vWorld.xz * 42.0));
    float cloud = noise(vWorld.xz * .72);
    color *= .93 + .075 * grain + .064 * cloud;
  } else if (uMaterial == 4) {
    vec2 tiles = vec2(vWorld.x * 2.22 + floor(vWorld.z * 3.32) * .5, vWorld.z * 3.32);
    vec2 grout = min(fract(tiles),1.0 - fract(tiles));
    float joints = smoothstep(.016,.041,min(grout.x,grout.y));
    color *= mix(.86,1.0,joints) + .052 * hash(floor(tiles)) + .023 * noise(vWorld.xz * 7.2);
#ifndef OPAQUE_PASS
  } else if (uMaterial == 5) {
    vec4 texel = texture(uDecal, vUv);
    if (texel.a < .24) discard;
    color = texel.rgb;
#endif
  }
  float sky = n.y * .5 + .5;
  vec3 fill = mix(uFillLow, uFillHigh, sky);
  vec3 light = fill + (uSunColor * sun * shadow);
  if (uAtmosphere.y > .01) {
    vec3 toFrag = vWorld - uHeadPos;
    float dist = length(toFrag);
    if (dist < 30.0) {
      vec3 dir = toFrag / max(dist, .001);
      float cone = smoothstep(.78, .96, dot(dir, uHeadDir));
      float atten = 1.0 / (1.0 + .018 * dist * dist);
      light += vec3(1.05, .96, .76) * (cone * atten * uAtmosphere.y * 1.45);
    }
  }
  vec3 shaded = color * light + vec3(.011,.016,.013) * sky;
  if (uAtmosphere.z > .01 && (uMaterial == 2 || uMaterial == 4)) {
    vec3 viewDir = normalize(uEye - vWorld);
    vec3 halfVec = normalize(uSun + viewDir);
    float wetSpec = pow(max(dot(n, halfVec), 0.0), 36.0) * .28 * uAtmosphere.z;
    shaded = shaded * mix(1.0, .82, uAtmosphere.z) + vec3(.75, .82, .88) * wetSpec;
  }
  pixel = vec4(fog(shaded),1.0);
}`;

export const SKY_VERTEX = `#version 300 es
precision highp float;
out vec2 vRay;
void main() {
  vec2 pos = vec2(float((gl_VertexID << 1) & 2),float(gl_VertexID & 2));
  vRay = pos * 2.0 - 1.0;
  gl_Position = vec4(vRay, 1.0, 1.0);
}`;

export const SKY_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vRay;
uniform vec3 uRight, uUp, uBack, uSun, uSkyLow, uSkyHigh, uCloudColor, uSunGlow;
uniform vec2 uTangent;
uniform float uCloudAlpha;
uniform int uMirror;
out vec4 pixel;
float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * .1031);
  q += dot(q,q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 s = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i),hash(i + vec2(1,0)),s.x),mix(hash(i + vec2(0,1)),hash(i + vec2(1)),s.x),s.y);
}
void main() {
  vec3 ray = normalize(-uBack + uRight * vRay.x * uTangent.x + uUp * vRay.y * uTangent.y);
  if (uMirror == 1) ray.y = -ray.y;
  float above = clamp(ray.y, 0.0, 1.0);
  vec3 sky = mix(uSkyLow,uSkyHigh,pow(above,.66));
  float sunlight = max(dot(ray,uSun),0.0);
  sky += uSunGlow*pow(sunlight,10.0);
  float glint = smoothstep(.9977,.9990,sunlight);
  sky = mix(sky,vec3(1.0,.974,.821),glint * clamp(uSunGlow.r * 5.0, 0.0, 1.0));
  if (above > .02) {
    vec2 cloud = ray.xz / (above + .115) * vec2(1.61,2.24) + vec2(8.9,3.1);
    float f = noise(cloud)*.59 + noise(cloud*2.38)*.26 + noise(cloud*5.13)*.105 + noise(cloud*11.77)*.045;
    float wisp = smoothstep(.53,.74,f) * smoothstep(.02,.16,above);
    sky = mix(sky,uCloudColor,wisp*uCloudAlpha);
  }
  pixel = vec4(sky,1.0);
}`;

export const DEPTH_VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
uniform mat4 uVp, uModel;
void main() { gl_Position = uVp * uModel * vec4(aPosition,1.0); }`;

export const DEPTH_FRAGMENT = `#version 300 es
precision highp float;
void main() {}`;
