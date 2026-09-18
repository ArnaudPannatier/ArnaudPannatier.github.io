export const fullscreen = `#version 300 es
precision highp float;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const common = `
precision highp float;
precision highp int;
uniform int uTextureWidth;
const float PI = 3.14159265359;
float hash(float n) {
  uint x = floatBitsToUint(n);
  x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16;
  return float(x >> 8) / 16777216.0;
}
vec3 random3(float n) { return vec3(hash(n), hash(n + 19.19), hash(n + 73.73)); }
ivec2 address(int id) { return ivec2(id % uTextureWidth, id / uTextureWidth); }
`;

export const initialize = `#version 300 es
${common}
uniform float uSeed;
layout(location = 0) out vec4 position;
layout(location = 1) out vec4 velocity;
void main() {
  float id = floor(gl_FragCoord.y) * float(uTextureWidth) + floor(gl_FragCoord.x);
  vec3 rnd = random3(id + uSeed);
  float radius = 0.4 + 11.6 * pow(rnd.x, 0.65);
  float angle = rnd.y * 2.0 * PI;
  float z = (rnd.z * 2.0 - 1.0) * 6.0 * sqrt(max(0.0, 1.0 - pow(radius / 13.0, 2.0)));
  vec3 p = vec3(cos(angle) * radius, sin(angle) * radius, z);
  vec3 tangent = vec3(-sin(angle), cos(angle), 0.0);
  vec3 turbulence = (random3(id + uSeed + 102.4) - 0.5) * 0.32;
  // Sub-circular angular momentum starts a genuine inward collapse.
  vec3 v = tangent * (0.74 + rnd.x * 0.12) - normalize(p) * 0.10 + turbulence;
  position = vec4(p, hash(id + 11.0));
  velocity = vec4(v, 1.0);
}`;

export const integrate = `#version 300 es
${common}
uniform sampler2D uPosition;
uniform sampler2D uVelocity;
uniform int uCount;
uniform int uPreviousCount;
uniform float uTime;
uniform float uDt;
layout(location = 0) out vec4 position;
layout(location = 1) out vec4 velocity;
void main() {
  int id = int(gl_FragCoord.y) * uTextureWidth + int(gl_FragCoord.x);
  if (id >= uCount) discard;
  int source = id;
  if (id >= uPreviousCount) source = int(hash(float(id) + 51.0) * float(uPreviousCount));
  vec4 state = texelFetch(uPosition, address(source), 0);
  vec3 p = state.xyz;
  vec3 v = texelFetch(uVelocity, address(source), 0).xyz;
  if (id >= uPreviousCount) {
    p += (random3(float(id) + 83.0) - 0.5) * 0.16;
    state.w = hash(float(id) + 11.0);
  }
  float r = max(length(p.xy), 0.10);
  float r2 = dot(p, p);
  // Cored logarithmic halo: approximately flat rotation curve, finite central force.
  vec3 acceleration = -1.65 * p / (r2 + 1.8);
  // Stratified Monte Carlo self-gravity. Total mass stays fixed as resolution changes.
  // Shared representatives improve texture cache locality; the strata rotate in time.
  for (int j = 0; j < 32; ++j) {
    float fraction = (float(j) + hash(float(j) + floor(uTime * 2.0))) / 32.0;
    int other = min(uPreviousCount - 1, int(fraction * float(uPreviousCount)));
    vec3 delta = texelFetch(uPosition, address(other), 0).xyz - p;
    float soft = dot(delta, delta) + 1.2;
    acceleration += (2.0 / 32.0) * delta * inversesqrt(soft * soft * soft);
  }
  float formed = smoothstep(8.0, 32.0, uTime);
  // Rotating logarithmic two-arm potential (a modeled galactic density wave).
  float theta = atan(p.y, p.x);
  float phase = 2.0 * (theta - 0.095 * uTime - 1.65 * log(r / 3.5));
  float envelope = smoothstep(0.7, 2.3, r) * (1.0 - smoothstep(9.0, 13.0, r));
  // As gas becomes a stellar disk, weaken the forcing and cooling so that
  // continued dissipation does not drain the whole galaxy into the nucleus.
  float stellar = smoothstep(30.0, 55.0, uTime);
  float spiral = sin(phase) * mix(0.21, 0.10, stellar) * formed * envelope / r;
  vec2 radial = p.xy / r;
  vec2 tangent = vec2(-radial.y, radial.x);
  acceleration.xy += spiral * (3.3 * radial - 2.0 * tangent);
  // Cooling removes vertical and radial random motion but preserves disk rotation.
  float vr = dot(v.xy, radial);
  acceleration.xy -= radial * vr * mix(0.11 + formed * 0.07, 0.004, stellar);
  acceleration.z += -p.z * 0.09 - v.z * 0.48;
  // Small turbulent pressure keeps the cooled disk genuinely three-dimensional.
  acceleration.z += 0.045 * sin(uTime * 0.7 + state.w * 2.0 * PI);
  v += acceleration * uDt;
  p += v * uDt;
  position = vec4(p, state.w);
  velocity = vec4(v, 1.0);
}`;

export const particleVertex = `#version 300 es
${common}
uniform sampler2D uPosition;
uniform mat4 uViewProjection;
uniform float uPixelRatio;
uniform float uMaxPointSize;
out vec3 vColor;
out float vSoftWidth;
void main() {
  vec4 state = texelFetch(uPosition, address(gl_VertexID), 0);
  vec3 p = state.xyz;
  float r = length(p.xy);
  gl_Position = uViewProjection * vec4(p, 1.0);
  float core = exp(-r * r / 7.0);
  float random = state.w;
  vec3 cool = mix(vec3(0.34, 0.49, 0.85), vec3(0.70, 0.75, 1.0), random);
  vec3 warm = mix(vec3(0.91, 0.54, 0.26), vec3(1.0, 0.89, 0.68), random);
  vColor = mix(cool, warm, clamp(core * 1.3 + random * 0.24, 0.0, 1.0));
  float size = 1.6 + random * 0.7 + core * 0.3;
  gl_PointSize = clamp(size * uPixelRatio * 25.0 / max(gl_Position.w, 0.1), 1.0, uMaxPointSize);
  // A narrow screen-space rim; the interior remains completely opaque.
  vSoftWidth = clamp(2.0 / gl_PointSize, 0.035, 0.45);
}`;

export const particleFragment = `#version 300 es
precision highp float;
uniform bool uEdgePass;
uniform float uOpacity;
in vec3 vColor;
in float vSoftWidth;
out vec4 color;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = dot(p, p);
  if (d >= 1.0) discard;
  float radius = sqrt(d);
  float inner = 1.0 - vSoftWidth;
  float coverage = 1.0;
  if (uOpacity < 1.0) {
    coverage = 1.0 - smoothstep(inner, 1.0, radius);
  } else if (uEdgePass) {
    if (radius <= inner) discard;
    coverage = 1.0 - smoothstep(inner, 1.0, radius);
  } else if (radius > inner) discard;
  // Slight spherical shading gives solid beads without sphere meshes.
  vec3 normal = vec3(p, sqrt(1.0 - d));
  float light = 0.64 + 0.36 * max(0.0, dot(normal, normalize(vec3(-0.3, 0.45, 0.85))));
  color = vec4(vColor * light, coverage * uOpacity);
}`;

// Original luminous rendering: a small star sprite plus a broad, faint halo.
export const glowVertex = `#version 300 es
${common}
uniform sampler2D uPosition;
uniform mat4 uViewProjection;
uniform float uPixelRatio;
uniform float uCount;
uniform bool uGlow;
out vec3 vColor;
out float vAlpha;
void main() {
  vec4 state = texelFetch(uPosition, address(gl_VertexID), 0);
  vec3 p = state.xyz;
  float r = length(p.xy);
  gl_Position = uViewProjection * vec4(p, 1.0);
  float core = exp(-r * r / 7.0);
  float random = state.w;
  vec3 cool = mix(vec3(0.34, 0.49, 0.85), vec3(0.70, 0.75, 1.0), random);
  vec3 warm = mix(vec3(0.91, 0.54, 0.26), vec3(1.0, 0.89, 0.68), random);
  vColor = mix(cool, warm, clamp(core * 1.3 + random * 0.24, 0.0, 1.0));
  float size = (random > 0.995 ? 4.2 : 2.5) + core * 1.2;
  if (uGlow) size *= 3.5;
  gl_PointSize = clamp(size * uPixelRatio * 25.0 / max(gl_Position.w, 1.0), 1.0, 28.0);
  vAlpha = min(26000.0 / max(uCount, 1.0), 3.0) * (0.25 + random * 0.5);
  if (uGlow) vAlpha *= 0.075;
}`;

export const glowFragment = `#version 300 es
precision highp float;
in vec3 vColor;
in float vAlpha;
out vec4 color;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = dot(p, p);
  if (d > 1.0) discard;
  float glow = exp(-d * 3.5) * (1.0 - smoothstep(0.55, 1.0, d));
  color = vec4(vColor * vAlpha * glow, 1.0);
}`;

export const background = `#version 300 es
${common}
uniform vec2 uResolution;
out vec4 color;
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 p = (gl_FragCoord.xy - uResolution * 0.5) / uResolution.y;
  float haze = exp(-dot(p * vec2(1.0, 1.6), p * vec2(1.0, 1.6)) * 3.0);
  vec3 sky = vec3(0.016, 0.022, 0.038) + vec3(0.010, 0.014, 0.029) * haze;
  vec2 grid = floor(gl_FragCoord.xy / 5.0);
  float star = hash(dot(grid, vec2(13.71, 97.13)));
  vec2 local = fract(gl_FragCoord.xy / 5.0) - 0.5;
  if (star > 0.994) sky += vec3(0.32, 0.38, 0.52) * exp(-dot(local, local) * 55.0) * pow((star - 0.994) / 0.006, 3.0);
  color = vec4(sky, 1.0);
}`;

// Repack live state when texture dimensions grow, without CPU particle readback.
export const copyState = `#version 300 es
${common}
uniform sampler2D uPosition;
uniform sampler2D uVelocity;
uniform int uSourceWidth;
uniform int uCount;
layout(location = 0) out vec4 position;
layout(location = 1) out vec4 velocity;
void main() {
  int id = int(gl_FragCoord.y) * uTextureWidth + int(gl_FragCoord.x);
  if (id >= uCount) discard;
  ivec2 source = ivec2(id % uSourceWidth, id / uSourceWidth);
  position = texelFetch(uPosition, source, 0);
  velocity = texelFetch(uVelocity, source, 0);
}`;
