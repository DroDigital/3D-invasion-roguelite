import { AdditiveBlending, BufferAttribute, BufferGeometry, DynamicDrawUsage, Object3D, Points, ShaderMaterial } from 'three';
import { Rng } from '../core/rng';
import type { Game } from '../sim/game';
import {
  FX_BLAST, FX_BLINK, FX_CITY_FALL, FX_CITY_HIT, FX_CRIT, FX_ESCAPE, FX_EVOLVE, FX_EXPLOSION, FX_FIELD, FX_HIT,
  FX_MUZZLE, FX_SHIELD_HIT, FX_STRIDE, FX_STRIKE, FX_WARP,
} from '../sim/game';

const MAX = 12000;

/**
 * GPU particles: the CPU only writes a particle once, at spawn (origin, velocity, colour,
 * birth time, life). The vertex shader integrates position and fade every frame.
 */
export class Particles {
  private origin = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private color = new Float32Array(MAX * 3);
  private timing = new Float32Array(MAX * 2); // birth, life
  private next = 0;
  private dirtyFrom = MAX;
  private dirtyTo = 0;
  private points: Points;
  private mat: ShaderMaterial;
  private rng = new Rng(1234567);
  private now = 0;

  constructor(private game: Game, parent: Object3D) {
    const geo = new BufferGeometry();
    const attrs: [string, Float32Array, number][] = [['position', this.origin, 3], ['vel', this.vel, 3], ['pcolor', this.color, 3], ['timing', this.timing, 2]];
    for (const [name, arr, size] of attrs) {
      const a = new BufferAttribute(arr, size);
      a.setUsage(DynamicDrawUsage);
      geo.setAttribute(name, a);
    }
    this.timing.fill(-100);
    this.mat = new ShaderMaterial({
      uniforms: { now: { value: 0 }, pxScale: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec3 vel;
        attribute vec3 pcolor;
        attribute vec2 timing;
        uniform float now;
        uniform float pxScale;
        varying vec3 vColor;
        void main() {
          float age = now - timing.x;
          float life = timing.y;
          if (age < 0.0 || age > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vColor = vec3(0.0); return; }
          float t = age / life;
          // Exponential drag: sparks decelerate.
          vec3 pos = position + vel * (1.0 - exp(-3.0 * age)) / 3.0;
          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(9.0 * pxScale / -mv.z, 1.0, 5.0) * (1.0 - t * 0.5);
          vColor = pcolor * (1.0 - t) * vec3(1.0, 1.0 - t * 0.5, 1.0 - t);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() { gl_FragColor = vec4(vColor, 1.0); }`,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    this.points = new Points(geo, this.mat);
    this.points.frustumCulled = false;
    parent.add(this.points);
  }

  dispose(): void {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    this.mat.dispose();
  }

  private burst(x: number, y: number, z: number, n: number, speed: number, life: number, r: number, g: number, b: number): void {
    const rng = this.rng;
    for (let j = 0; j < n; j++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      if (i < this.dirtyFrom) this.dirtyFrom = i;
      if (i + 1 > this.dirtyTo) this.dirtyTo = i + 1;
      const u = rng.range(-1, 1);
      const a = rng.range(0, Math.PI * 2);
      const sn = Math.sqrt(1 - u * u);
      const v = speed * (0.3 + 0.7 * rng.next());
      this.origin[i * 3] = x;
      this.origin[i * 3 + 1] = y;
      this.origin[i * 3 + 2] = z;
      this.vel[i * 3] = sn * Math.cos(a) * v;
      this.vel[i * 3 + 1] = u * v;
      this.vel[i * 3 + 2] = sn * Math.sin(a) * v;
      const k = 0.7 + 0.3 * rng.next();
      this.color[i * 3] = r * k;
      this.color[i * 3 + 1] = g * k;
      this.color[i * 3 + 2] = b * k;
      this.timing[i * 2] = this.now;
      this.timing[i * 2 + 1] = life * (0.5 + 0.5 * rng.next());
    }
  }

  /** Consume the sim's fx events, then upload only what changed. */
  update(dt: number, pxScale: number): void {
    this.now += dt;
    const g = this.game;
    const f = g.fx;
    for (let k = 0; k < g.fxCount; k++) {
      const o = k * FX_STRIDE;
      const x = f[o + 1];
      const y = f[o + 2];
      const z = f[o + 3];
      const p = f[o + 7];
      switch (f[o]) {
        case FX_EXPLOSION: {
          const size = Math.max(0.5, p / 0.06);
          this.burst(x, y, z, Math.min(160, 18 * size), 0.35 * Math.sqrt(size), 0.8, 2.6, 1.3, 0.35);
          this.burst(x, y, z, Math.min(40, 6 * size), 0.15 * Math.sqrt(size), 1.1, 1.4, 1.4, 1.4);
          break;
        }
        case FX_HIT: this.burst(x, y, z, 3, 0.2, 0.22, 2.0, 1.8, 1.0); break;
        case FX_SHIELD_HIT: this.burst(x, y, z, 4, 0.15, 0.3, 0.6, 1.6, 2.6); break;
        case FX_MUZZLE: {
          // Muzzle flash grows with the firing weapon's tier.
          const w = g.arsenal.weapons[p | 0];
          const t = w ? (w.def.evolved ? 5 : w.tier) : 0;
          const sc = w?.def.shot.color ?? [1.2, 1.4, 2.0];
          this.burst(x, y, z, 2 + t, 0.08 + t * 0.02, 0.15 + t * 0.03, sc[0] * 0.6, sc[1] * 0.6, sc[2] * 0.6);
          break;
        }
        case FX_CITY_HIT: this.burst(x, y, z, 14, 0.12, 0.7, 2.6, 0.5, 0.2); break;
        case FX_BLAST: this.burst(x, y, z, Math.min(80, 30 + p * 200), 0.5 + p * 3, 0.45, 3.0, 1.6, 0.4); break;
        case FX_CRIT: this.burst(x, y, z, 8, 0.3, 0.3, 3.0, 3.0, 3.0); break;
        case FX_ESCAPE: this.burst(x, y, z, 30, 0.2, 0.9, 0.6, 2.4, 1.6); break;
        case FX_BLINK: this.burst(x, y, z, 12, 0.12, 0.35, 1.4, 1.4, 2.4); break;
        case FX_WARP: this.burst(x, y, z, 10 + p * 100, 0.18, 0.6, 1.2, 0.8, 2.6); break;
        case FX_FIELD: this.burst(x, y, z, 20, p * 2, 0.6, 0.8, 0.4, 2.0); break;
        case FX_STRIKE: this.burst(x, y, z, 220, 0.9, 1.1, 3.2, 2.0, 0.8); break;
        case FX_CITY_FALL: this.burst(x, y, z, 160, 0.4, 1.6, 3.0, 0.9, 0.3); break;
        case FX_EVOLVE: this.burst(0, 0, 0, 300, 1.8, 1.4, 2.6, 2.2, 1.0); break;
      }
    }

    const geo = this.points.geometry;
    if (this.dirtyTo > this.dirtyFrom) {
      for (const [name, size] of [['position', 3], ['vel', 3], ['pcolor', 3], ['timing', 2]] as const) {
        const a = geo.getAttribute(name) as BufferAttribute;
        a.clearUpdateRanges();
        a.addUpdateRange(this.dirtyFrom * size, (this.dirtyTo - this.dirtyFrom) * size);
        a.needsUpdate = true;
      }
      this.dirtyFrom = MAX;
      this.dirtyTo = 0;
    }
    this.mat.uniforms.now.value = this.now;
    this.mat.uniforms.pxScale.value = pxScale;
  }
}
