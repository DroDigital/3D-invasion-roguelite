import {
  Color,
  ConeGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Vector3,
} from 'three';
import { CITIES, CITY_MAX_HEALTH } from '../data/cities';
import type { CityState } from '../sim/cities';

const UP = new Vector3(0, 1, 0);
const GOOD = new Color(0x3dff8a);
const WARN = new Color(0xffc23d);
const BAD = new Color(0xff3d3d);

/** City beacons on the globe plus DOM name tags that track them on screen. */
export class CityMarkers {
  readonly mesh: InstancedMesh;
  private labels: HTMLDivElement[] = [];
  private world = new Vector3();
  private ndc = new Vector3();
  private color = new Color();
  private lastHealth: Float32Array;

  constructor(private cities: CityState, private surface: Object3D, labelRoot: HTMLElement) {
    const geo = new ConeGeometry(0.011, 0.05, 4);
    geo.translate(0, 0.025, 0);
    this.mesh = new InstancedMesh(geo, new MeshBasicMaterial(), cities.count);
    const m = new Matrix4();
    const q = new Quaternion();
    const p = new Vector3();
    const s = new Vector3(1, 1, 1);
    for (let i = 0; i < cities.count; i++) {
      p.set(cities.pos[i * 3], cities.pos[i * 3 + 1], cities.pos[i * 3 + 2]);
      q.setFromUnitVectors(UP, p);
      m.compose(p, q, s);
      this.mesh.setMatrixAt(i, m);
      this.mesh.setColorAt(i, GOOD);

      const el = document.createElement('div');
      el.className = 'city-label';
      el.textContent = CITIES[i].name;
      labelRoot.appendChild(el);
      this.labels.push(el);
    }
    this.lastHealth = new Float32Array(cities.count).fill(-1);
    surface.add(this.mesh);
  }

  /** World-space direction of a city right now (the planet spins). */
  worldDir(i: number, out: Vector3): Vector3 {
    const c = this.cities.pos;
    return out.set(c[i * 3], c[i * 3 + 1], c[i * 3 + 2]).applyMatrix4(this.surface.matrixWorld);
  }

  update(camera: PerspectiveCamera, viewW: number, viewH: number): void {
    const cities = this.cities;
    let colorDirty = false;
    for (let i = 0; i < cities.count; i++) {
      const h = cities.health[i];
      if (h !== this.lastHealth[i]) {
        this.lastHealth[i] = h;
        const f = h / CITY_MAX_HEALTH;
        if (f > 0.5) this.color.lerpColors(WARN, GOOD, (f - 0.5) * 2);
        else this.color.lerpColors(BAD, WARN, f * 2);
        this.mesh.setColorAt(i, this.color);
        this.labels[i].classList.toggle('dead', h <= 0);
        colorDirty = true;
      }

      const el = this.labels[i];
      this.worldDir(i, this.world);
      // Visible when the camera is above the city's horizon (planet radius 1).
      const facing = this.world.dot(camera.position) > 1.02;
      if (!facing) {
        if (el.style.display !== 'none') el.style.display = 'none';
        continue;
      }
      this.ndc.copy(this.world).multiplyScalar(1.05).project(camera);
      const x = (this.ndc.x * 0.5 + 0.5) * viewW;
      const y = (-this.ndc.y * 0.5 + 0.5) * viewH;
      if (el.style.display !== 'block') el.style.display = 'block';
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
    }
    if (colorDirty && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
