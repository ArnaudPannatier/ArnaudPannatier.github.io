(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e=`#version 300 es
precision highp float;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,t=`
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
`,n=`#version 300 es
${t}
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
}`,r=`#version 300 es
${t}
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
}`,i=`#version 300 es
${t}
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
}`,a=`#version 300 es
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
}`,o=`#version 300 es
${t}
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
}`,s=`#version 300 es
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
}`,c=`#version 300 es
${t}
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
}`,l=`#version 300 es
${t}
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
}`,u=2048,d=class{constructor(e=32768,t=1/0){this.count=e,this.limit=t,this.reset()}reset(){this.samples=[],this.gpuSamples=[],this.elapsed=0,this.cooldown=1,this.fastWindows=0}update(e,t,n){if(e<=0||!Number.isFinite(e)||(this.cooldown-=Math.min(n,1),this.samples.push(e),t>0&&this.gpuSamples.push(t),this.elapsed+=Math.min(n,1),this.elapsed<.5))return null;let r=this.samples.sort((e,t)=>e-t),i=r[Math.floor(r.length*.75)],a=this.gpuSamples.length?this.gpuSamples.reduce((e,t)=>e+t,0)/this.gpuSamples.length:null;if(this.samples=[],this.gpuSamples=[],this.elapsed=0,this.cooldown>0)return null;let o=this.count;return i>18.5||a!==null&&a>15?(o*=Math.max(.55,Math.min(.8,15/Math.max(i,a||0))),this.fastWindows=0):i<17.5&&(a===null||a<11)?++this.fastWindows>=6&&(o*=1.15,this.fastWindows=0):this.fastWindows=0,o=Math.max(u,Math.min(this.limit,Math.round(o/512)*512)),o===this.count?null:(this.count=o,this.cooldown=1,o)}};function f(e,t,n){let r=[];for(let[i,a]of[[e.VERTEX_SHADER,t],[e.FRAGMENT_SHADER,n]]){let t=e.createShader(i);if(e.shaderSource(t,a),e.compileShader(t),!e.getShaderParameter(t,e.COMPILE_STATUS)){let n=e.getShaderInfoLog(t);throw e.deleteShader(t),Error(`GPU shader could not compile: ${n}`)}r.push(t)}let i=e.createProgram();if(r.forEach(t=>e.attachShader(i,t)),e.linkProgram(i),r.forEach(t=>e.deleteShader(t)),!e.getProgramParameter(i,e.LINK_STATUS))throw Error(e.getProgramInfoLog(i));let a=new Map;return{handle:i,uniform(t){return a.has(t)||a.set(t,e.getUniformLocation(i,t)),a.get(t)}}}function p(e,t){t&&(t.textures.forEach(t=>e.deleteTexture(t)),e.deleteFramebuffer(t.framebuffer))}function m(e,t,n){let r={framebuffer:e.createFramebuffer(),textures:[]};e.bindFramebuffer(e.FRAMEBUFFER,r.framebuffer);try{for(let i=0;i<2;i++){let a=e.createTexture();if(r.textures.push(a),e.bindTexture(e.TEXTURE_2D,a),e.texStorage2D(e.TEXTURE_2D,1,e.RGBA32F,t,n),e.getError()!==e.NO_ERROR)throw Error(`GPU particle buffer allocation failed.`);e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+i,e.TEXTURE_2D,a,0)}if(e.drawBuffers([e.COLOR_ATTACHMENT0,e.COLOR_ATTACHMENT1]),e.checkFramebufferStatus(e.FRAMEBUFFER)!==e.FRAMEBUFFER_COMPLETE)throw Error(`GPU particle buffer is incomplete.`);return r}catch(t){throw p(e,r),t}}var h=class{constructor(t,d=32768){this.canvas=t,this.solidParticles=!1,this.solidOpacity=1;let h=t.getContext(`webgl2`,{alpha:!1,antialias:!1,depth:!0,stencil:!1,powerPreference:`high-performance`});if(!h)throw Error(`This simulation needs WebGL 2. Enable hardware acceleration in your browser, or use a browser and device with WebGL 2 support.`);if(!h.getExtension(`EXT_color_buffer_float`))throw Error(`Your GPU needs the EXT_color_buffer_float WebGL extension to compute particle motion. Try enabling hardware acceleration or using a different browser.`);this.gl=h;let g=h.getExtension(`WEBGL_debug_renderer_info`);this.renderer=g?h.getParameter(g.UNMASKED_RENDERER_WEBGL):h.getParameter(h.RENDERER),this.maxPointSize=Math.min(48,h.getParameter(h.ALIASED_POINT_SIZE_RANGE)[1]),this.timer=h.getExtension(`EXT_disjoint_timer_query_webgl2`),this.queries=[],this.gpuMs=null,this.programs={copy:f(h,e,l),init:f(h,e,n),step:f(h,e,r),particles:f(h,i,a),glow:f(h,o,s),background:f(h,e,c)},h.bindVertexArray(h.createVertexArray());let _=h.getParameter(h.MAX_VIEWPORT_DIMS);for(this.maxDimension=Math.min(h.getParameter(h.MAX_TEXTURE_SIZE),_[0],_[1]),this.maxParticles=this.maxDimension*this.maxDimension,d=Math.max(u,Math.min(this.maxParticles,Math.round(d/512)*512)),this.width=this.height=Math.min(512,this.maxDimension);this.width*this.height<d;)this.width<=this.height?this.width=Math.min(this.width*2,this.maxDimension):this.height=Math.min(this.height*2,this.maxDimension);this.capacity=this.width*this.height,this.memoryLimited=!1,this.buffers=[];try{this.buffers.push(m(h,this.width,this.height)),this.buffers.push(m(h,this.width,this.height))}catch(e){throw this.buffers.forEach(e=>p(h,e)),e}this.count=d,this.previousCount=d,this.front=0,this.time=0,this.seed=42,this.reset()}reset(e=this.seed){this.seed=e,this.time=0,this.previousCount=this.count;let t=this.gl,n=this.programs.init;t.disable(t.BLEND),t.disable(t.DEPTH_TEST),t.useProgram(n.handle),t.uniform1f(n.uniform(`uSeed`),e),t.uniform1i(n.uniform(`uTextureWidth`),this.width),t.viewport(0,0,this.width,Math.ceil(this.count/this.width));for(let e of this.buffers)t.bindFramebuffer(t.FRAMEBUFFER,e.framebuffer),t.drawArrays(t.TRIANGLES,0,3);t.bindFramebuffer(t.FRAMEBUFFER,null)}grow(e){if(e<=this.capacity)return!0;let t=this.gl,n=this.width,r=this.height;for(;n*r<e;)n<=r?n=Math.min(n*2,this.maxDimension):r=Math.min(r*2,this.maxDimension);let i=[];try{i.push(m(t,n,r)),i.push(m(t,n,r));let e=this.programs.copy;t.disable(t.BLEND),t.disable(t.DEPTH_TEST),t.useProgram(e.handle),this.textures(e),t.uniform1i(e.uniform(`uTextureWidth`),n),t.uniform1i(e.uniform(`uSourceWidth`),this.width),t.uniform1i(e.uniform(`uCount`),this.count),t.viewport(0,0,n,Math.ceil(this.count/n));for(let e of i)t.bindFramebuffer(t.FRAMEBUFFER,e.framebuffer),t.drawArrays(t.TRIANGLES,0,3);if(t.getError()!==t.NO_ERROR)throw Error(`GPU particle transfer failed.`)}catch{return i.forEach(e=>p(t,e)),t.bindFramebuffer(t.FRAMEBUFFER,null),this.maxParticles=this.capacity,this.memoryLimited=!0,!1}return this.buffers.forEach(e=>p(t,e)),this.buffers=i,this.front=0,this.width=n,this.height=r,this.capacity=n*r,t.bindFramebuffer(t.FRAMEBUFFER,null),!0}setCount(e){let t=Math.max(u,Math.min(this.maxParticles,Math.round(e/512)*512));return this.grow(t)&&(this.count=t),this.count}textures(e){let t=this.gl,n=this.buffers[this.front];for(let e=0;e<2;e++)t.activeTexture(t.TEXTURE0+e),t.bindTexture(t.TEXTURE_2D,n.textures[e]);t.uniform1i(e.uniform(`uPosition`),0),t.uniform1i(e.uniform(`uVelocity`),1)}step(e){let t=this.gl,n=this.programs.step;t.disable(t.BLEND),t.disable(t.DEPTH_TEST),t.useProgram(n.handle),t.bindFramebuffer(t.FRAMEBUFFER,this.buffers[1-this.front].framebuffer),t.uniform1i(n.uniform(`uTextureWidth`),this.width),t.viewport(0,0,this.width,Math.ceil(this.count/this.width)),this.textures(n),t.uniform1i(n.uniform(`uCount`),this.count),t.uniform1i(n.uniform(`uPreviousCount`),this.previousCount),t.uniform1f(n.uniform(`uTime`),this.time),t.uniform1f(n.uniform(`uDt`),e),t.drawArrays(t.TRIANGLES,0,3),this.front=1-this.front,this.previousCount=this.count,this.time+=e}beginTimer(){let e=this.gl;if(this.timer){for(e.getParameter(this.timer.GPU_DISJOINT_EXT)&&(this.queries.forEach(t=>e.deleteQuery(t)),this.queries=[],this.gpuMs=null);this.queries.length&&e.getQueryParameter(this.queries[0],e.QUERY_RESULT_AVAILABLE);){let t=this.queries.shift(),n=e.getQueryParameter(t,e.QUERY_RESULT)/1e6;this.gpuMs=this.gpuMs===null?n:this.gpuMs*.8+n*.2,e.deleteQuery(t)}this.queries.length>=6||(this.activeQuery=e.createQuery(),e.beginQuery(this.timer.TIME_ELAPSED_EXT,this.activeQuery))}}endTimer(){this.activeQuery&&=(this.gl.endQuery(this.timer.TIME_ELAPSED_EXT),this.queries.push(this.activeQuery),null)}render(e,t){let n=this.gl;n.bindFramebuffer(n.FRAMEBUFFER,null),n.viewport(0,0,this.canvas.width,this.canvas.height),n.disable(n.BLEND),n.disable(n.DEPTH_TEST),n.depthMask(!0),n.clearDepth(1),n.clear(n.DEPTH_BUFFER_BIT);let r=this.programs.background;n.useProgram(r.handle),n.uniform2f(r.uniform(`uResolution`),this.canvas.width,this.canvas.height),n.drawArrays(n.TRIANGLES,0,3);let i=this.solidParticles?this.programs.particles:this.programs.glow;if(n.useProgram(i.handle),n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,this.buffers[this.front].textures[0]),n.uniform1i(i.uniform(`uPosition`),0),n.uniform1i(i.uniform(`uTextureWidth`),this.width),n.uniformMatrix4fv(i.uniform(`uViewProjection`),!1,e),n.uniform1f(i.uniform(`uPixelRatio`),t),!this.solidParticles){n.uniform1f(i.uniform(`uCount`),this.count),n.enable(n.BLEND),n.blendFunc(n.ONE,n.ONE),n.uniform1i(i.uniform(`uGlow`),1),n.drawArrays(n.POINTS,0,this.count),n.uniform1i(i.uniform(`uGlow`),0),n.drawArrays(n.POINTS,0,this.count),n.disable(n.BLEND);return}if(n.uniform1f(i.uniform(`uMaxPointSize`),this.maxPointSize),n.uniform1f(i.uniform(`uOpacity`),this.solidOpacity),this.solidOpacity<1){n.depthMask(!1),n.enable(n.BLEND),n.blendFunc(n.SRC_ALPHA,n.ONE_MINUS_SRC_ALPHA),n.drawArrays(n.POINTS,0,this.count),n.disable(n.BLEND),n.depthMask(!0);return}n.enable(n.DEPTH_TEST),n.depthFunc(n.LEQUAL),n.uniform1i(i.uniform(`uEdgePass`),0),n.drawArrays(n.POINTS,0,this.count),n.depthMask(!1),n.enable(n.BLEND),n.blendFunc(n.SRC_ALPHA,n.ONE_MINUS_SRC_ALPHA),n.uniform1i(i.uniform(`uEdgePass`),1),n.drawArrays(n.POINTS,0,this.count),n.disable(n.BLEND),n.depthMask(!0),n.disable(n.DEPTH_TEST)}snapshot(){let e=this.gl,t=Math.ceil(this.count/this.width),n=new Float32Array(this.width*t*4);return e.bindFramebuffer(e.FRAMEBUFFER,this.buffers[this.front].framebuffer),e.readBuffer(e.COLOR_ATTACHMENT0),e.readPixels(0,0,this.width,t,e.RGBA,e.FLOAT,n),e.bindFramebuffer(e.FRAMEBUFFER,null),n}},g=class{constructor(e=500){this.windowMs=e,this.reset()}reset(){this.samples=[],this.totalMs=0}record(e){if(!(!Number.isFinite(e)||e<=0))for(this.samples.push(e),this.totalMs+=e;this.samples.length>1&&this.totalMs-this.samples[0]>=this.windowMs;)this.totalMs-=this.samples.shift()}get fps(){return this.totalMs>=100?this.samples.length*1e3/this.totalMs:null}get frameMs(){return this.samples.length?this.totalMs/this.samples.length:null}},_=.35,v=class{constructor(e,t){this.azimuth=.45,this.elevation=.68,this.distance=31,this.targetElevation=this.elevation,this.targetDistance=this.distance,this.pointers=new Map,e.addEventListener(`pointerdown`,t=>{e.setPointerCapture(t.pointerId),this.pointers.set(t.pointerId,{x:t.clientX,y:t.clientY})}),e.addEventListener(`pointermove`,e=>{let n=this.pointers.get(e.pointerId);if(n){if(this.pointers.size===2){let t=[...this.pointers.entries()].find(([t])=>t!==e.pointerId)[1],r=Math.hypot(n.x-t.x,n.y-t.y),i=Math.hypot(e.clientX-t.x,e.clientY-t.y);r>0&&i>0&&this.zoom(r/i)}else this.azimuth-=(e.clientX-n.x)*.006,this.targetElevation=Math.max(-1.5,Math.min(1.5,this.targetElevation+(e.clientY-n.y)*.006)),t();this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY})}});for(let t of[`pointerup`,`pointercancel`,`lostpointercapture`])e.addEventListener(t,e=>this.pointers.delete(e.pointerId));e.addEventListener(`wheel`,t=>{t.preventDefault();let n=t.deltaY*(t.deltaMode===1?16:t.deltaMode===2?e.clientHeight:1);this.zoom(Math.exp(Math.max(-2,Math.min(2,n*.001))))},{passive:!1})}zoom(e){this.targetDistance=Math.max(_,Math.min(90,this.targetDistance*e))}reset(){this.azimuth=.45,this.targetElevation=.68,this.targetDistance=31}setView(e){this.targetElevation={orbit:.68,top:1.55,edge:.04}[e]}matrix(e,t=1/60){let n=1-Math.exp(-t*8);this.elevation+=(this.targetElevation-this.elevation)*n,this.distance+=(this.targetDistance-this.distance)*n;let r=this.azimuth,i=this.elevation,a=Math.cos(r),o=Math.sin(r),s=Math.cos(i),c=Math.sin(i),l=new Float32Array([-o,-a*c,a*s,0,a,-o*c,o*s,0,0,s,c,0,0,0,-this.distance,1]),u=1/Math.tan(.75/2),d=Math.max(.005,this.distance*.002),f=new Float32Array([u/e,0,0,0,0,u,0,0,0,0,(150+d)/(d-150),-1,0,0,300*d/(d-150),0]);if(e<.8){let t=Math.min(.64,e*.82);f[5]*=t,f[0]*=t,f[9]=-.16}let p=new Float32Array(16);for(let e=0;e<4;e++)for(let t=0;t<4;t++)for(let n=0;n<4;n++)p[e*4+t]+=f[n*4+t]*l[e*4+n];return p}},y=class{constructor(){this.active=!1,this.reason=null}start(e,t){this.active=!0,this.reason=null,this.count=e,this.limit=t,this.lastGood=null,this.peak=e,this.settle()}settle(){this.cooldown=.25,this.frames=[],this.elapsed=0}stop(e=`stopped`){this.active=!1,this.reason=e}update(e){if(!this.active||!Number.isFinite(e)||e<=0)return null;if(this.cooldown>0)return this.cooldown-=e/1e3,null;if(this.frames.push(e),this.elapsed+=e,this.elapsed<400)return null;let t=this.elapsed/this.frames.length;if(t>17.5)return this.stop(`fps`),this.count=this.lastGood??Math.max(2048,Math.floor(this.count*Math.min(.8,16/t)/512)*512),this.count;this.lastGood=this.count;let n=Math.min(this.limit,this.count*2);return n<=this.count?(this.stop(`hardware`),null):(this.count=n,this.peak=Math.max(this.peak,n),this.settle(),n)}},b=e=>document.getElementById(e),x=b(`universe`),S=new d,C=new y,w=new g,T=new v(x,()=>document.querySelectorAll(`[data-view]`).forEach(e=>e.setAttribute(`aria-pressed`,`false`))),E,D=!1,O=!1,k=!0,A=1,j=0,M=0,N=0,P=null,F=1,I=1,L;function R(e){O=!0,cancelAnimationFrame(L),b(`error-message`).textContent=e,b(`error`).hidden=!1,document.querySelector(`.panel`).inert=!0}function z(){F=Math.min(window.devicePixelRatio||1,1.75)*I,x.width=Math.round(innerWidth*F),x.height=Math.round(innerHeight*F)}function B(){j=0,M=0,N=0,S.reset(),C.active&&C.settle(),w.reset(),P=null}function V(e){E.setCount(e),S.count=E.count,S.limit=E.maxParticles,C.active&&E.count!==e&&C.stop(`memory`),C.count=E.count,C.limit=E.maxParticles,b(`particles`).max=Math.floor(Math.log2(E.capacity)),E.step(0),b(`particle-count`).textContent=E.count.toLocaleString(`en-US`),b(`budget-output`).value=E.count.toLocaleString(`en-US`)}function H(){D=!D,D&&C.active&&C.stop(),b(`pause-label`).textContent=D?`Resume`:`Pause`,b(`pause-icon`).textContent=D?`▶`:`Ⅱ`,b(`pause`).setAttribute(`aria-label`,D?`Resume simulation`:`Pause simulation`),B()}function U(){E&&!O&&(E.reset(Math.random()*1e3),B(),W())}function W(){b(`gpu-renderer`).textContent=E.renderer,b(`fps`).textContent=P===null?`—`:Math.round(P),b(`frame-time`).textContent=P===null?`Measuring frames…`:`${w.frameMs.toFixed(1)} ms / frame`,b(`gpu-time`).textContent=E.gpuMs===null?`GPU timing unavailable`:`GPU ${E.gpuMs.toFixed(1)} ms`,b(`elapsed`).textContent=`${E.time.toFixed(1)} s`,b(`phase`).textContent=E.time<10?`01 — PRIMORDIAL CLOUD`:E.time<30?`02 — GRAVITATIONAL COLLAPSE`:`03 — SPIRAL GALAXY`,b(`progress`).style.width=`${Math.min(100,E.time/45*100)}%`;let e=b(`performance-status`);e.textContent=D?`Simulation paused`:C.active?`Full perf: ramping up…`:k?E.memoryLimited?`GPU allocation limit reached`:P===null?`Measuring live performance`:P<53?E.count===2048?`At this device’s limit`:`Adjusting particle budget`:E.count===E.maxParticles?`WebGL texture limit reached`:C.reason===`fps`?`Full perf: FPS limit found`:E.gpuMs!==null&&E.gpuMs>=11?`Frame budget balanced`:`Adding detail when ready`:`Manual particle budget`,b(`full-perf`).textContent=C.active?`Stop ramp`:`Full perf`,b(`full-perf`).setAttribute(`aria-pressed`,String(C.active)),b(`performance-dot`).style.background=!D&&P!==null&&P<53?`#c7a06f`:`#9ac3a4`}function G(e){if(O||document.hidden)return;let t=j!==0,n=t?(e-j)/1e3:1/60;j=e;let r=Math.min(n,.1);if(t&&w.record(n*1e3),P=w.fps,N+=n,E.beginTimer(),!D)for(M=Math.min(M+r*A,4/30);M>=1/30;)E.step(1/30),M-=1/30;if(E.render(T.matrix(x.width/x.height,r),F),E.endTimer(),k&&!D&&t){let e=C.active,t=e?C.update(n*1e3):S.update(n*1e3,E.gpuMs,n);t!==null&&V(t),e&&!C.active&&S.reset(),N>=.25&&E.count===2048&&P!==null&&P<50&&I>.55?(I=Math.max(.55,I-.05),z()):N>=.25&&P>=59&&I<1&&(I=Math.min(1,I+.01),z())}N>=.25&&(N=0,W()),L=requestAnimationFrame(G)}b(`full-perf`).addEventListener(`click`,()=>{C.active?(C.stop(),S.reset()):(k=!0,b(`adaptive`).checked=!0,b(`manual-control`).hidden=!0,D&&H(),C.start(E.count,E.maxParticles)),W()}),b(`solid-opacity`).addEventListener(`input`,e=>{E.solidOpacity=Number(e.target.value),b(`opacity-output`).value=`${Math.round(E.solidOpacity*100)}%`,S.reset(),C.active&&C.start(E.count,E.maxParticles)}),b(`solid-particles`).checked=!1,b(`solid-particles`).addEventListener(`change`,e=>{E.solidParticles=e.target.checked,b(`opacity-control`).hidden=!e.target.checked,S.reset(),C.active&&C.start(E.count,E.maxParticles)}),b(`zoom-in`).addEventListener(`click`,()=>T.zoom(.65)),b(`zoom-out`).addEventListener(`click`,()=>T.zoom(1/.65)),b(`reset-view`).addEventListener(`click`,()=>{T.reset(),document.querySelectorAll(`[data-view]`).forEach(e=>e.setAttribute(`aria-pressed`,String(e.dataset.view===`orbit`)))}),b(`pause`).addEventListener(`click`,H),b(`restart`).addEventListener(`click`,U),b(`adaptive`).addEventListener(`change`,e=>{k=e.target.checked,C.stop(),b(`manual-control`).hidden=k,S.reset(),k||(b(`particles`).value=Math.log2(E.count),b(`budget-output`).value=E.count.toLocaleString(`en-US`)),W()}),b(`particles`).addEventListener(`input`,e=>{V(2**Number(e.target.value))}),b(`speed`).addEventListener(`input`,e=>{A=Number(e.target.value),b(`speed-output`).value=`${A.toFixed(2).replace(/0$/,``)}×`,S.reset(),C.active&&C.settle(),w.reset(),P=null}),document.querySelectorAll(`[data-view]`).forEach(e=>e.addEventListener(`click`,()=>{T.setView(e.dataset.view),document.querySelectorAll(`[data-view]`).forEach(t=>t.setAttribute(`aria-pressed`,String(t===e)))}));function K(e){b(`about`).hidden=!e,b(`about-button`).setAttribute(`aria-expanded`,String(e)),b(e?`close-about`:`about-button`).focus()}b(`about-button`).addEventListener(`click`,()=>K(b(`about`).hidden)),b(`close-about`).addEventListener(`click`,()=>K(!1)),document.addEventListener(`keydown`,e=>{e.code===`Escape`&&!b(`about`).hidden&&K(!1),!(/^(INPUT|BUTTON|TEXTAREA|SELECT|A)$/.test(e.target.tagName)||e.repeat)&&(e.code===`Space`&&(e.preventDefault(),H()),e.code===`KeyR`&&U())}),window.addEventListener(`resize`,z),document.addEventListener(`visibilitychange`,()=>{cancelAnimationFrame(L),B(),!document.hidden&&!O&&(L=requestAnimationFrame(G))}),x.addEventListener(`webglcontextlost`,e=>{e.preventDefault(),R(`The GPU context was lost. Restore the browser window or reload to start a new cloud.`)}),x.addEventListener(`webglcontextrestored`,()=>{try{C.stop(),E=new h(x),S.count=E.count,S.limit=E.maxParticles,b(`particle-count`).textContent=E.count.toLocaleString(`en-US`),E.solidParticles=b(`solid-particles`).checked,E.solidOpacity=Number(b(`solid-opacity`).value),O=!1,b(`error`).hidden=!0,document.querySelector(`.panel`).inert=!1,B(),z(),L=requestAnimationFrame(G)}catch(e){R(e.message)}});try{E=new h(x),S.limit=E.maxParticles,z(),W(),L=requestAnimationFrame(G)}catch(e){R(e.message),console.error(e)}