import * as shaders from "./shaders.js";
import {
  INITIAL_TEXTURE_SIZE,
  PARTICLE_BATCH,
  MIN_PARTICLES,
} from "./adaptive.js";

function program(gl, vertex, fragment) {
  const compiled = [];
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, fragment],
  ]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`GPU shader could not compile: ${error}`);
    }
    compiled.push(shader);
  }
  const handle = gl.createProgram();
  compiled.forEach((shader) => gl.attachShader(handle, shader));
  gl.linkProgram(handle);
  compiled.forEach((shader) => gl.deleteShader(shader));
  if (!gl.getProgramParameter(handle, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(handle));
  const locations = new Map();
  return {
    handle,
    uniform(name) {
      if (!locations.has(name))
        locations.set(name, gl.getUniformLocation(handle, name));
      return locations.get(name);
    },
  };
}

function deleteBuffer(gl, buffer) {
  if (!buffer) return;
  buffer.textures.forEach((texture) => gl.deleteTexture(texture));
  gl.deleteFramebuffer(buffer.framebuffer);
}

function stateBuffer(gl, width, height) {
  const buffer = { framebuffer: gl.createFramebuffer(), textures: [] };
  gl.bindFramebuffer(gl.FRAMEBUFFER, buffer.framebuffer);
  try {
    for (let index = 0; index < 2; index++) {
      const texture = gl.createTexture();
      buffer.textures.push(texture);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, width, height);
      if (gl.getError() !== gl.NO_ERROR)
        throw new Error("GPU particle buffer allocation failed.");
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0 + index,
        gl.TEXTURE_2D,
        texture,
        0,
      );
    }
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw new Error("GPU particle buffer is incomplete.");
    return buffer;
  } catch (error) {
    deleteBuffer(gl, buffer);
    throw error;
  }
}

export class GalaxyGPU {
  constructor(canvas, count = 32768) {
    this.canvas = canvas;
    this.solidParticles = false;
    this.solidOpacity = 1;
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: true,
      stencil: false,
      powerPreference: "high-performance",
    });
    if (!gl)
      throw new Error(
        "This simulation needs WebGL 2. Enable hardware acceleration in your browser, or use a browser and device with WebGL 2 support.",
      );
    if (!gl.getExtension("EXT_color_buffer_float"))
      throw new Error(
        "Your GPU needs the EXT_color_buffer_float WebGL extension to compute particle motion. Try enabling hardware acceleration or using a different browser.",
      );
    this.gl = gl;
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    this.renderer = debug
      ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    this.maxPointSize = Math.min(
      48,
      gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1],
    );
    this.timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    this.queries = [];
    this.gpuMs = null;
    this.programs = {
      copy: program(gl, shaders.fullscreen, shaders.copyState),
      init: program(gl, shaders.fullscreen, shaders.initialize),
      step: program(gl, shaders.fullscreen, shaders.integrate),
      particles: program(gl, shaders.particleVertex, shaders.particleFragment),
      glow: program(gl, shaders.glowVertex, shaders.glowFragment),
      background: program(gl, shaders.fullscreen, shaders.background),
    };
    gl.bindVertexArray(gl.createVertexArray());
    const viewportLimit = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
    this.maxDimension = Math.min(
      gl.getParameter(gl.MAX_TEXTURE_SIZE),
      viewportLimit[0],
      viewportLimit[1],
    );
    this.maxParticles = this.maxDimension * this.maxDimension;
    count = Math.max(
      MIN_PARTICLES,
      Math.min(
        this.maxParticles,
        Math.round(count / PARTICLE_BATCH) * PARTICLE_BATCH,
      ),
    );
    this.width = this.height = Math.min(
      INITIAL_TEXTURE_SIZE,
      this.maxDimension,
    );
    while (this.width * this.height < count) {
      if (this.width <= this.height)
        this.width = Math.min(this.width * 2, this.maxDimension);
      else this.height = Math.min(this.height * 2, this.maxDimension);
    }
    this.capacity = this.width * this.height;
    this.memoryLimited = false;
    this.buffers = [];
    try {
      this.buffers.push(stateBuffer(gl, this.width, this.height));
      this.buffers.push(stateBuffer(gl, this.width, this.height));
    } catch (error) {
      this.buffers.forEach((buffer) => deleteBuffer(gl, buffer));
      throw error;
    }
    this.count = count;
    this.previousCount = count;
    this.front = 0;
    this.time = 0;
    this.seed = 42;
    this.reset();
  }
  reset(seed = this.seed) {
    this.seed = seed;
    this.time = 0;
    this.previousCount = this.count;
    const gl = this.gl,
      p = this.programs.init;
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(p.handle);
    gl.uniform1f(p.uniform("uSeed"), seed);
    gl.uniform1i(p.uniform("uTextureWidth"), this.width);
    gl.viewport(0, 0, this.width, Math.ceil(this.count / this.width));
    for (const buffer of this.buffers) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, buffer.framebuffer);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  grow(count) {
    if (count <= this.capacity) return true;
    const gl = this.gl;
    let width = this.width,
      height = this.height;
    while (width * height < count) {
      if (width <= height) width = Math.min(width * 2, this.maxDimension);
      else height = Math.min(height * 2, this.maxDimension);
    }
    const next = [];
    try {
      next.push(stateBuffer(gl, width, height));
      next.push(stateBuffer(gl, width, height));
      const p = this.programs.copy;
      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(p.handle);
      this.textures(p);
      gl.uniform1i(p.uniform("uTextureWidth"), width);
      gl.uniform1i(p.uniform("uSourceWidth"), this.width);
      gl.uniform1i(p.uniform("uCount"), this.count);
      gl.viewport(0, 0, width, Math.ceil(this.count / width));
      for (const buffer of next) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, buffer.framebuffer);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      if (gl.getError() !== gl.NO_ERROR)
        throw new Error("GPU particle transfer failed.");
    } catch (error) {
      next.forEach((buffer) => deleteBuffer(gl, buffer));
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.maxParticles = this.capacity;
      this.memoryLimited = true;
      return false;
    }
    this.buffers.forEach((buffer) => deleteBuffer(gl, buffer));
    this.buffers = next;
    this.front = 0;
    this.width = width;
    this.height = height;
    this.capacity = width * height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return true;
  }
  setCount(count) {
    const desired = Math.max(
      MIN_PARTICLES,
      Math.min(
        this.maxParticles,
        Math.round(count / PARTICLE_BATCH) * PARTICLE_BATCH,
      ),
    );
    if (this.grow(desired)) this.count = desired;
    return this.count;
  }
  textures(p) {
    const gl = this.gl,
      source = this.buffers[this.front];
    for (let i = 0; i < 2; i++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, source.textures[i]);
    }
    gl.uniform1i(p.uniform("uPosition"), 0);
    gl.uniform1i(p.uniform("uVelocity"), 1);
  }
  step(dt) {
    const gl = this.gl,
      p = this.programs.step;
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(p.handle);
    gl.bindFramebuffer(
      gl.FRAMEBUFFER,
      this.buffers[1 - this.front].framebuffer,
    );
    gl.uniform1i(p.uniform("uTextureWidth"), this.width);
    gl.viewport(0, 0, this.width, Math.ceil(this.count / this.width));
    this.textures(p);
    gl.uniform1i(p.uniform("uCount"), this.count);
    gl.uniform1i(p.uniform("uPreviousCount"), this.previousCount);
    gl.uniform1f(p.uniform("uTime"), this.time);
    gl.uniform1f(p.uniform("uDt"), dt);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.front = 1 - this.front;
    this.previousCount = this.count;
    this.time += dt;
  }
  beginTimer() {
    const gl = this.gl;
    if (!this.timer) return;
    if (gl.getParameter(this.timer.GPU_DISJOINT_EXT)) {
      this.queries.forEach((query) => gl.deleteQuery(query));
      this.queries = [];
      this.gpuMs = null;
    }
    while (
      this.queries.length &&
      gl.getQueryParameter(this.queries[0], gl.QUERY_RESULT_AVAILABLE)
    ) {
      const query = this.queries.shift();
      const ms = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
      this.gpuMs = this.gpuMs === null ? ms : this.gpuMs * 0.8 + ms * 0.2;
      gl.deleteQuery(query);
    }
    if (this.queries.length >= 6) return;
    this.activeQuery = gl.createQuery();
    gl.beginQuery(this.timer.TIME_ELAPSED_EXT, this.activeQuery);
  }
  endTimer() {
    if (!this.activeQuery) return;
    this.gl.endQuery(this.timer.TIME_ELAPSED_EXT);
    this.queries.push(this.activeQuery);
    this.activeQuery = null;
  }
  render(matrix, pixelRatio) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.clearDepth(1);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    const bg = this.programs.background;
    gl.useProgram(bg.handle);
    gl.uniform2f(
      bg.uniform("uResolution"),
      this.canvas.width,
      this.canvas.height,
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const p = this.solidParticles
      ? this.programs.particles
      : this.programs.glow;
    gl.useProgram(p.handle);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.buffers[this.front].textures[0]);
    gl.uniform1i(p.uniform("uPosition"), 0);
    gl.uniform1i(p.uniform("uTextureWidth"), this.width);
    gl.uniformMatrix4fv(p.uniform("uViewProjection"), false, matrix);
    gl.uniform1f(p.uniform("uPixelRatio"), pixelRatio);
    if (!this.solidParticles) {
      gl.uniform1f(p.uniform("uCount"), this.count);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.uniform1i(p.uniform("uGlow"), 1);
      gl.drawArrays(gl.POINTS, 0, this.count);
      gl.uniform1i(p.uniform("uGlow"), 0);
      gl.drawArrays(gl.POINTS, 0, this.count);
      gl.disable(gl.BLEND);
      return;
    }
    gl.uniform1f(p.uniform("uMaxPointSize"), this.maxPointSize);
    gl.uniform1f(p.uniform("uOpacity"), this.solidOpacity);
    if (this.solidOpacity < 1) {
      // Translucent circles blend all layers; depth writes would hide particles behind them.
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.POINTS, 0, this.count);
      gl.disable(gl.BLEND);
      gl.depthMask(true);
      return;
    }
    // Write all opaque cores first so the nearest particle wins regardless of draw order.
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.uniform1i(p.uniform("uEdgePass"), 0);
    gl.drawArrays(gl.POINTS, 0, this.count);
    // Blend only the small soft rims. They test against cores but do not obscure
    // later particles by writing transparent pixels into the depth buffer.
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1i(p.uniform("uEdgePass"), 1);
    gl.drawArrays(gl.POINTS, 0, this.count);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.disable(gl.DEPTH_TEST);
  }
  // Explicit diagnostic only; normal animation never reads particle state back to the CPU.
  snapshot() {
    const gl = this.gl,
      rows = Math.ceil(this.count / this.width);
    const data = new Float32Array(this.width * rows * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.buffers[this.front].framebuffer);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.readPixels(0, 0, this.width, rows, gl.RGBA, gl.FLOAT, data);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return data;
  }
}
