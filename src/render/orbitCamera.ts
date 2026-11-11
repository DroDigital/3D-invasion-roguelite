import { PerspectiveCamera, Vector3 } from 'three';

const MIN_DIST = 1.75;
const MAX_DIST = 7;
const MAX_PITCH = 1.45;

/** Drag to rotate, scroll or pinch to zoom, both with inertia. */
export class OrbitCamera {
  readonly camera: PerspectiveCamera;
  yaw = 0.6;
  pitch = 0.35;
  dist = 3.4;
  private targetDist = 3.4;
  private yawVel = 0;
  private pitchVel = 0;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private lastT = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  private focusYaw: number | null = null;
  private focusPitch = 0;

  constructor(private el: HTMLElement, aspect: number) {
    this.camera = new PerspectiveCamera(42, aspect, 0.05, 1000);
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.apply();
  }

  /** Smoothly turn to look at a world-space direction from the planet centre. */
  focusOn(dir: Vector3): void {
    this.focusYaw = Math.atan2(dir.x, dir.z);
    this.focusPitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, Math.asin(dir.y / dir.length())));
    this.yawVel = this.pitchVel = 0;
  }

  private onDown = (e: PointerEvent): void => {
    this.el.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.focusYaw = null;
    if (this.pointers.size === 1) {
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.lastT = e.timeStamp;
      this.yawVel = this.pitchVel = 0;
    } else if (this.pointers.size === 2) {
      this.dragging = false;
      this.pinchDist = this.pinchSpan();
    }
  };

  private onMove = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.pointers.size === 2) {
      const span = this.pinchSpan();
      if (this.pinchDist > 0) this.zoomBy(this.pinchDist / span);
      this.pinchDist = span;
      return;
    }
    if (!this.dragging) return;
    // Rotate less per pixel when zoomed in so the surface tracks the cursor.
    const k = (0.0045 * (this.dist - 0.9)) / 2.5;
    const dx = (e.clientX - this.lastX) * k;
    const dy = (e.clientY - this.lastY) * k;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.yaw -= dx;
    this.pitch += dy;
    // Smoothed angular velocity (rad/s) from real event timing, for the coast.
    const dtE = Math.max(0.004, (e.timeStamp - this.lastT) / 1000);
    this.lastT = e.timeStamp;
    const MAX_V = 4;
    this.yawVel += (Math.max(-MAX_V, Math.min(MAX_V, -dx / dtE)) - this.yawVel) * 0.5;
    this.pitchVel += (Math.max(-MAX_V, Math.min(MAX_V, dy / dtE)) - this.pitchVel) * 0.5;
  };

  private onUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 0) this.dragging = false;
    this.pinchDist = 0;
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.zoomBy(Math.exp(Math.max(-150, Math.min(150, e.deltaY)) * 0.0015));
  };

  private pinchSpan(): number {
    const it = this.pointers.values();
    const a = it.next().value!;
    const b = it.next().value!;
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  }

  private zoomBy(f: number): void {
    this.targetDist = Math.max(MIN_DIST, Math.min(MAX_DIST, this.targetDist * f));
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    if (this.focusYaw !== null) {
      let dy = this.focusYaw - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const k = 1 - Math.exp(-6 * dt);
      this.yaw += dy * k;
      this.pitch += (this.focusPitch - this.pitch) * k;
      if (Math.abs(dy) < 0.002 && Math.abs(this.focusPitch - this.pitch) < 0.002) this.focusYaw = null;
    } else if (!this.dragging) {
      this.yaw += this.yawVel * dt;
      this.pitch += this.pitchVel * dt;
      const damp = Math.exp(-3.2 * dt);
      this.yawVel *= damp;
      this.pitchVel *= damp;
    } else {
      // Held still while dragging: bleed off velocity so release doesn't fling.
      const damp = Math.exp(-14 * dt);
      this.yawVel *= damp;
      this.pitchVel *= damp;
    }
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch));
    this.dist += (this.targetDist - this.dist) * (1 - Math.exp(-9 * dt));
    this.apply();
  }

  private apply(): void {
    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      this.dist * cp * Math.sin(this.yaw),
      this.dist * Math.sin(this.pitch),
      this.dist * cp * Math.cos(this.yaw),
    );
    this.camera.lookAt(0, 0, 0);
  }
}
