export const MIN_PARTICLES = 2048;
export const INITIAL_TEXTURE_SIZE = 512;
export const PARTICLE_BATCH = 512;

// Adjust in small batches. The hardware/allocation limit is supplied by WebGL.
export class AdaptiveBudget {
  constructor(count = 32768, limit = Infinity) {
    this.count = count;
    this.limit = limit;
    this.reset();
  }
  reset() {
    this.samples = [];
    this.gpuSamples = [];
    this.elapsed = 0;
    this.cooldown = 1;
    this.fastWindows = 0;
  }
  update(frameMs, gpuMs, seconds) {
    if (frameMs <= 0 || !Number.isFinite(frameMs)) return null;
    this.cooldown -= Math.min(seconds, 1);
    this.samples.push(frameMs);
    if (gpuMs > 0) this.gpuSamples.push(gpuMs);
    this.elapsed += Math.min(seconds, 1);
    if (this.elapsed < 0.5) return null;
    const sorted = this.samples.sort((a, b) => a - b);
    const frame = sorted[Math.floor(sorted.length * 0.75)];
    const gpu = this.gpuSamples.length
      ? this.gpuSamples.reduce((a, b) => a + b, 0) / this.gpuSamples.length
      : null;
    this.samples = [];
    this.gpuSamples = [];
    this.elapsed = 0;
    if (this.cooldown > 0) return null;
    let next = this.count;
    if (frame > 18.5 || (gpu !== null && gpu > 15)) {
      next *= Math.max(0.55, Math.min(0.8, 15 / Math.max(frame, gpu || 0)));
      this.fastWindows = 0;
    } else if (frame < 17.5 && (gpu === null || gpu < 11)) {
      // Slow probes also work without GPU queries, where vsync hides unused capacity.
      if (++this.fastWindows >= 6) {
        next *= 1.15;
        this.fastWindows = 0;
      }
    } else {
      this.fastWindows = 0;
    }
    next = Math.max(
      MIN_PARTICLES,
      Math.min(this.limit, Math.round(next / PARTICLE_BATCH) * PARTICLE_BATCH),
    );
    if (next === this.count) return null;
    this.count = next;
    this.cooldown = 1;
    return next;
  }
}
