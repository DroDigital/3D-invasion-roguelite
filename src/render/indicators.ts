import {
  AdditiveBlending,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  RingGeometry,
  Vector3,
} from 'three';
import { CITIES } from '../data/cities';
import type { Game } from '../sim/game';

const FWD = new Vector3(0, 0, 1);
const m = new Matrix4();
const q = new Quaternion();
const p = new Vector3();
const s = new Vector3();
const v = new Vector3();

/** Threat feedback: a pulsing ring on the globe at every besieged city, plus an
 *  edge-of-screen arrow when that city is off-screen or behind the planet. */
export class Indicators {
  private rings: InstancedMesh;
  private arrows: HTMLDivElement[] = [];
  private shown: boolean[] = [];

  constructor(private game: Game, private surface: Object3D, root: HTMLElement) {
    const n = game.cities.count;
    this.rings = new InstancedMesh(
      new RingGeometry(0.026, 0.034, 20),
      new MeshBasicMaterial({ color: 0xff2a2a, side: DoubleSide, blending: AdditiveBlending, depthWrite: false, transparent: true }),
      n,
    );
    this.rings.frustumCulled = false;
    surface.add(this.rings);
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div');
      el.className = 'threat-arrow';
      const tip = document.createElement('i');
      const label = document.createElement('span');
      label.textContent = CITIES[i].name;
      el.append(tip, label);
      root.appendChild(el);
      this.arrows.push(el);
      this.shown.push(false);
    }
  }

  update(camera: PerspectiveCamera, time: number, viewW: number, viewH: number): void {
    const c = this.game.cities;
    const siege = this.game.siege;
    const pulse = 1 + ((time * 1.4) % 1) * 2.2;
    for (let i = 0; i < c.count; i++) {
      const active = siege[i] > 0 && c.health[i] > 0;
      p.set(c.pos[i * 3], c.pos[i * 3 + 1], c.pos[i * 3 + 2]);
      q.setFromUnitVectors(FWD, p);
      s.setScalar(active ? pulse : 0);
      v.copy(p).multiplyScalar(1.006);
      m.compose(v, q, s);
      this.rings.setMatrixAt(i, m);

      const el = this.arrows[i];
      let show = false;
      if (active) {
        // City in world space, then camera space.
        v.copy(p).applyMatrix4(this.surface.matrixWorld);
        const facing = v.dot(camera.position) > 1.0;
        v.applyMatrix4(camera.matrixWorldInverse);
        const tan = Math.tan((camera.fov * Math.PI) / 360);
        const nx = v.x / (-v.z * tan * camera.aspect);
        const ny = v.y / (-v.z * tan);
        const onScreen = facing && Math.abs(nx) < 0.92 && Math.abs(ny) < 0.86;
        if (!onScreen) {
          show = true;
          // Direction from screen centre toward the city, clamped to the screen edge.
          let dx = v.x;
          let dy = v.y;
          const l = Math.hypot(dx, dy) || 1;
          dx /= l;
          dy /= l;
          const hw = viewW / 2 - 46;
          const hh = viewH / 2 - 64;
          const k = Math.min(hw / Math.max(1e-4, Math.abs(dx)), hh / Math.max(1e-4, Math.abs(dy)));
          const x = viewW / 2 + dx * k;
          const y = viewH / 2 - dy * k + 12;
          const ang = Math.atan2(dx, dy);
          el.style.transform = `translate3d(${x.toFixed(0)}px, ${y.toFixed(0)}px, 0) translate(-50%, -50%)`;
          (el.firstChild as HTMLElement).style.transform = `rotate(${ang.toFixed(2)}rad)`;
        }
      }
      if (show !== this.shown[i]) {
        this.shown[i] = show;
        el.style.display = show ? 'flex' : 'none';
      }
    }
    this.rings.instanceMatrix.needsUpdate = true;
  }
}
