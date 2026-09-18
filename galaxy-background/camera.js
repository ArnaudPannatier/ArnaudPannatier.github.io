export const MIN_DISTANCE = 0.35;
export const MAX_DISTANCE = 90;

export class Camera {
  constructor(canvas, onDrag, interactive = true) {
    this.azimuth = 0.45;
    this.elevation = 0.68;
    this.distance = 31;
    this.targetElevation = this.elevation;
    this.targetDistance = this.distance;
    this.pointers = new Map();
    if (!interactive) return;
    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    canvas.addEventListener("pointermove", (e) => {
      const old = this.pointers.get(e.pointerId);
      if (!old) return;
      if (this.pointers.size === 2) {
        const other = [...this.pointers.entries()].find(
          ([id]) => id !== e.pointerId,
        )[1];
        const previous = Math.hypot(old.x - other.x, old.y - other.y);
        const next = Math.hypot(e.clientX - other.x, e.clientY - other.y);
        if (previous > 0 && next > 0) this.zoom(previous / next);
      } else {
        this.azimuth -= (e.clientX - old.x) * 0.006;
        this.targetElevation = Math.max(
          -1.5,
          Math.min(1.5, this.targetElevation + (e.clientY - old.y) * 0.006),
        );
        onDrag();
      }
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      canvas.addEventListener(type, (e) => this.pointers.delete(e.pointerId));
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const pixels =
          e.deltaY *
          (e.deltaMode === 1
            ? 16
            : e.deltaMode === 2
              ? canvas.clientHeight
              : 1);
        this.zoom(Math.exp(Math.max(-2, Math.min(2, pixels * 0.001))));
      },
      { passive: false },
    );
  }
  zoom(factor) {
    this.targetDistance = Math.max(
      MIN_DISTANCE,
      Math.min(MAX_DISTANCE, this.targetDistance * factor),
    );
  }
  reset() {
    this.azimuth = 0.45;
    this.targetElevation = 0.68;
    this.targetDistance = 31;
  }
  setView(view) {
    this.targetElevation = { orbit: 0.68, top: 1.55, edge: 0.04 }[view];
  }
  matrix(aspect, dt = 1 / 60) {
    const blend = 1 - Math.exp(-dt * 8);
    this.elevation += (this.targetElevation - this.elevation) * blend;
    this.distance += (this.targetDistance - this.distance) * blend;
    const a = this.azimuth,
      e = this.elevation,
      ca = Math.cos(a),
      sa = Math.sin(a),
      ce = Math.cos(e),
      se = Math.sin(e);
    const view = new Float32Array([
      -sa,
      -ca * se,
      ca * ce,
      0,
      ca,
      -sa * se,
      sa * ce,
      0,
      0,
      ce,
      se,
      0,
      0,
      0,
      -this.distance,
      1,
    ]);
    const f = 1 / Math.tan(0.75 / 2),
      near = Math.max(0.005, this.distance * 0.002),
      far = 150;
    const projection = new Float32Array([
      f / aspect,
      0,
      0,
      0,
      0,
      f,
      0,
      0,
      0,
      0,
      (far + near) / (near - far),
      -1,
      0,
      0,
      (2 * far * near) / (near - far),
      0,
    ]);
    // On phones reserve the lower part of the scene for the controls.
    if (aspect < 0.8) {
      const scale = Math.min(0.64, aspect * 0.82);
      projection[5] *= scale;
      projection[0] *= scale;
      projection[9] = -0.16;
    }
    const out = new Float32Array(16);
    for (let col = 0; col < 4; col++)
      for (let row = 0; row < 4; row++) {
        for (let k = 0; k < 4; k++)
          out[col * 4 + row] += projection[k * 4 + row] * view[col * 4 + k];
      }
    return out;
  }
}
