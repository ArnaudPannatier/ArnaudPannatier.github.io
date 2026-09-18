import { GalaxyGPU } from './gpu.js';
import { Camera } from './camera.js';
import { FrameMeter } from './frame-meter.js';
import { AdaptiveBudget, MIN_PARTICLES } from './adaptive.js';

const canvas = document.querySelector('#galaxy');
const button = document.querySelector('#galaxy-pause');
const label = document.querySelector('#pause-label');
const symbol = document.querySelector('#pause-symbol');
const status = document.querySelector('#galaxy-status');
const particleCount = document.querySelector('#particle-count');
const frameRate = document.querySelector('#fps');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const camera = new Camera(canvas, () => {}, false);
const backgroundLimit = 65536;
const budget = new AdaptiveBudget(16384, backgroundLimit);
const frameMeter = new FrameMeter();
camera.elevation = camera.targetElevation = 0.95;
camera.distance = camera.targetDistance = 30;
let gpu;
let paused = reducedMotion.matches;
let unavailable = false;
let frameHandle = 0;
let last = 0;
let accumulator = 0;
let pixelRatio = 1;
let resolutionScale = 1;
let resolutionElapsed = 0;
let telemetryElapsed = 0;
let measuredFps = null;

function updateTelemetry() {
  particleCount.textContent = unavailable || !gpu ? '—' : gpu.count.toLocaleString('en-US');
  frameRate.textContent = unavailable ? '—' : paused || document.hidden ? '0' : measuredFps === null ? '—' : String(measuredFps);
}

function resize() {
  pixelRatio = Math.min(devicePixelRatio || 1, 1.5) * resolutionScale;
  canvas.width = Math.round(innerWidth * pixelRatio);
  canvas.height = Math.round(innerHeight * pixelRatio);
  if (gpu && !unavailable) render(0);
}
function render(delta) {
  const matrix = camera.matrix(canvas.width / canvas.height, delta);
  gpu.render(matrix, pixelRatio);
}
function updateControl() {
  button.disabled = unavailable;
  button.hidden = unavailable;
  button.setAttribute('aria-pressed', String(paused));
  button.setAttribute('aria-label', paused ? 'Resume background animation' : 'Pause background animation');
  label.textContent = paused ? 'Resume' : 'Pause';
  symbol.textContent = paused ? '▷' : 'Ⅱ';
  status.textContent = unavailable ? 'Static background' : paused ? 'Galaxy paused' : 'Live galaxy';
  updateTelemetry();
}
function schedule() {
  cancelAnimationFrame(frameHandle);
  last = 0;
  accumulator = 0;
  budget.reset();
  frameMeter.reset();
  telemetryElapsed = 0;
  measuredFps = null;
  updateTelemetry();
  if (!paused && !unavailable && !document.hidden) frameHandle = requestAnimationFrame(frame);
}
function frame(now) {
  if (paused || unavailable || document.hidden) return;
  const rawDelta = last ? (now - last) / 1000 : 1 / 60;
  const delta = Math.min(rawDelta, 0.1);
  const measured = last !== 0;
  if (measured) frameMeter.record(rawDelta * 1000);
  measuredFps = frameMeter.fps === null ? null : Math.round(frameMeter.fps);
  telemetryElapsed += rawDelta;
  if (telemetryElapsed >= 0.25) {
    telemetryElapsed = 0;
    updateTelemetry();
  }
  last = now;
  gpu.beginTimer();
  accumulator = Math.min(accumulator + delta * 0.75, 3 / 30);
  while (accumulator >= 1 / 30) {
    gpu.step(1 / 30);
    accumulator -= 1 / 30;
  }
  camera.azimuth += delta * 0.015;
  render(delta);
  gpu.endTimer();
  const nextCount = measured ? budget.update(rawDelta * 1000, gpu.gpuMs, rawDelta) : null;
  if (nextCount !== null) {
    // A background leaves GPU headroom for scrolling and the rest of the page.
    budget.count = gpu.setCount(nextCount);
    budget.limit = Math.min(backgroundLimit, gpu.maxParticles);
    gpu.step(0);
  }
  resolutionElapsed += delta;
  if (resolutionElapsed >= 2) {
    resolutionElapsed = 0;
    if (gpu.count === MIN_PARTICLES && rawDelta > 0.025 && resolutionScale > 0.6) {
      resolutionScale = Math.max(0.6, resolutionScale - 0.1);
      resize();
    }
  }
  frameHandle = requestAnimationFrame(frame);
}
function fallback() {
  unavailable = true;
  cancelAnimationFrame(frameHandle);
  canvas.setAttribute('data-unavailable', '');
  updateControl();
}
function initialize() {
  try {
    gpu = new GalaxyGPU(canvas, budget.count);
    budget.count = gpu.count;
    budget.limit = Math.min(backgroundLimit, gpu.maxParticles);
    unavailable = false;
    canvas.removeAttribute('data-unavailable');
    resize();
    updateControl();
    schedule();
  } catch {
    // Reading and navigation stay available even without a compatible GPU.
    fallback();
  }
}
button.addEventListener('click', () => {
  paused = !paused;
  updateControl();
  schedule();
});
reducedMotion.addEventListener('change', (event) => {
  paused = event.matches;
  updateControl();
  schedule();
});
document.addEventListener('visibilitychange', schedule);
window.addEventListener('resize', resize);
window.addEventListener('pagehide', () => cancelAnimationFrame(frameHandle));
window.addEventListener('pageshow', schedule);
canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  fallback();
});
canvas.addEventListener('webglcontextrestored', initialize);
initialize();
