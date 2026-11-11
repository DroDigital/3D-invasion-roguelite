import { AdditiveBlending, BufferAttribute, BufferGeometry, DynamicDrawUsage, Object3D, Points, ShaderMaterial } from 'three';
import { Rng } from '../core/rng';
import { FX_CITY_HIT, FX_EXPLOSION, FX_HIT, FX_MUZZLE, Game } from '../sim/game';

const MAX = 4000;

/** Cosmetic spark pool. Fed by the sim's one-frame fx events; never feeds back. */
export class Particles {
  private pos = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private base = new Float32Array(MAX * 3);
  private next = 0;
  private points: Points;
  private rng = new Rng(1234567);

  constructor(private game: Game, parent: Object3D) {
    const geo = new BufferGeometry();
    const pa = new BufferAttribute(this.pos, 3);
    const ca = new BufferAttribute(this.col, 3);
    pa.setUsage(DynamicDrawUsage);
    ca.setUsage(DynamicDrawUsage);
    geo.setAttribute('position', pa);
    geo.setAttribute('color', ca);
    this.points = new Points(
      geo,
      new ShaderMaterial({
        vertexShader: /* glsl */ `
          attribute vec3 color;
          varying vec3 vColor;
          void main() {
            vColor = color;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = clamp(7.0 / -mv.z, 1.0, 4.0);
          }`,
        fragmentShader: /* glsl */ `
          varying vec3 vColor;
          void main() { gl_FragColor = vec4(vColor, 1.0); }`,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.points.frustumCulled = false;
    parent.add(this.points);
  }

  private burst(x: number, y: number, z: number, n: number, speed: number, life: number, r: number, g: number, b: number): void {
    const rng = this.rng;
    for (let j = 0; j < n; j++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const u = rng.range(-1, 1);
      const a = rng.range(0, Math.PI * 2);
      const sn = Math.sqrt(1 - u * u);
      const v = speed * (0.3 + 0.7 * rng.next());
      this.pos[i * 3] = x;
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3 + 2] = z;
      this.vel[i * 3] = sn * Math.cos(a) * v;
      this.vel[i * 3 + 1] = u * v;
      this.vel[i * 3 + 2] = sn * Math.sin(a) * v;
      this.base[i * 3] = r;
      this.base[i * 3 + 1] = g;
      this.base[i * 3 + 2] = b;
      this.life[i] = this.maxLife[i] = life * (0.5 + 0.5 * rng.next());
    }
  }

  /** Consume the sim's fx events, then advance all sparks. */
  update(dt: number): void {
    const g = this.game;
    for (let k = 0; k < g.fxCount; k++) {
      const o = k * 4;
      const kind = g.fx[o];
      const x = g.fx[o + 1];
      const y = g.fx[o + 2];
      const z = g.fx[o + 3];
      if (kind === FX_EXPLOSION) this.burst(x, y, z, 22, 0.28, 0.7, 2.4, 1.2, 0.3);
      else if (kind === FX_HIT) this.burst(x, y, z, 4, 0.18, 0.25, 2.0, 1.8, 1.0);
      else if (kind === FX_MUZZLE) this.burst(x, y, z, 2, 0.08, 0.15, 1.2, 1.4, 2.0);
      else if (kind === FX_CITY_HIT) this.burst(x, y, z, 10, 0.12, 0.6, 2.5, 0.4, 0.2);
    }
    g.fxCount = 0;

    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const f = this.life[i] > 0 ? this.life[i] / this.maxLife[i] : 0;
      const o = i * 3;
      this.pos[o] += this.vel[o] * dt;
      this.pos[o + 1] += this.vel[o + 1] * dt;
      this.pos[o + 2] += this.vel[o + 2] * dt;
      this.col[o] = this.base[o] * f;
      this.col[o + 1] = this.base[o + 1] * f * f;
      this.col[o + 2] = this.base[o + 2] * f * f;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
