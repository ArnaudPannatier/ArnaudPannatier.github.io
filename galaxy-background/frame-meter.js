// Measure delivered frames / elapsed wall time, including dropped or slow frames.
// Averaging instantaneous (1 / dt) FPS would overstate performance under jitter.
export class FrameMeter {
  constructor(windowMs = 500) {
    this.windowMs = windowMs;
    this.reset();
  }
  reset() {
    this.samples = [];
    this.totalMs = 0;
  }
  record(frameMs) {
    if (!Number.isFinite(frameMs) || frameMs <= 0) return;
    this.samples.push(frameMs);
    this.totalMs += frameMs;
    while (
      this.samples.length > 1 &&
      this.totalMs - this.samples[0] >= this.windowMs
    ) {
      this.totalMs -= this.samples.shift();
    }
  }
  get fps() {
    return this.totalMs >= 100
      ? (this.samples.length * 1000) / this.totalMs
      : null;
  }
  get frameMs() {
    return this.samples.length ? this.totalMs / this.samples.length : null;
  }
}
