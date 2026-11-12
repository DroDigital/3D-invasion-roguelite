import { damageCity, DMG_WRECK } from './damage';
import { aegisAbsorb, AEGIS_R } from './defense';
import type { Game } from './game';
import { FX_IMPACT } from './game';

export const MAX_WRECKS = 700;
/** Gravity strength: acceleration = G / r^2 toward the centre. */
const G = 0.55;

/** Burning debris: every destroyed ship falls, and what reaches the ground hits it. */
export class WreckPool {
  readonly alive = new Uint8Array(MAX_WRECKS);
  readonly x = new Float32Array(MAX_WRECKS);
  readonly y = new Float32Array(MAX_WRECKS);
  readonly z = new Float32Array(MAX_WRECKS);
  readonly vx = new Float32Array(MAX_WRECKS);
  readonly vy = new Float32Array(MAX_WRECKS);
  readonly vz = new Float32Array(MAX_WRECKS);
  readonly size = new Float32Array(MAX_WRECKS);
  /** Damage to cities near the impact point. */
  readonly dmg = new Float32Array(MAX_WRECKS);
  readonly species = new Uint8Array(MAX_WRECKS);
  readonly life = new Float32Array(MAX_WRECKS);
  readonly seed = new Float32Array(MAX_WRECKS);
  count = 0;
  private next = 0;

  spawn(): number {
    for (let n = 0; n < MAX_WRECKS; n++) {
      const i = (this.next + n) % MAX_WRECKS;
      if (!this.alive[i]) {
        this.next = (i + 1) % MAX_WRECKS;
        this.alive[i] = 1;
        this.count++;
        return i;
      }
    }
    return -1;
  }

  kill(i: number): void {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.count--;
  }
}

export function spawnWreck(g: Game, x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, dmg: number, species: number): void {
  const w = g.wrecks;
  const i = w.spawn();
  if (i < 0) return;
  w.x[i] = x;
  w.y[i] = y;
  w.z[i] = z;
  w.vx[i] = vx;
  w.vy[i] = vy;
  w.vz[i] = vz;
  w.size[i] = size;
  w.dmg[i] = dmg;
  w.species[i] = species;
  w.life[i] = 24;
  w.seed[i] = g.combatRng.next() * 100;
}

export function updateWrecks(g: Game, dt: number): void {
  const w = g.wrecks;
  const c = g.cities;
  for (let i = 0; i < MAX_WRECKS; i++) {
    if (!w.alive[i]) continue;
    const x = w.x[i];
    const y = w.y[i];
    const z = w.z[i];
    const r2 = x * x + y * y + z * z;
    const r = Math.sqrt(r2) || 1;
    const a = (G / r2) * dt;
    w.vx[i] -= (x / r) * a;
    w.vy[i] -= (y / r) * a;
    w.vz[i] -= (z / r) * a;
    w.x[i] += w.vx[i] * dt;
    w.y[i] += w.vy[i] * dt;
    w.z[i] += w.vz[i] * dt;
    w.life[i] -= dt;
    const nr = Math.hypot(w.x[i], w.y[i], w.z[i]);
    if (w.life[i] <= 0 || nr > 9) {
      w.kill(i);
      continue;
    }
    if (nr < AEGIS_R && r >= AEGIS_R && aegisAbsorb(g, w.x[i], w.y[i], w.z[i], w.dmg[i] * 0.5 + w.size[i] * 10)) {
      w.kill(i);
      continue;
    }
    if (nr <= 1.0) {
      // Ground strike: crater, fire, and damage to any city close enough.
      const ix = w.x[i] / nr;
      const iy = w.y[i] / nr;
      const iz = w.z[i] / nr;
      g.emitFx(FX_IMPACT, ix, iy, iz, 0, 0, 0, Math.min(0.4, w.size[i] * 0.9 + 0.012));
      if (w.dmg[i] > 0) {
        const R = 0.07 + w.size[i] * 0.9;
        for (let k = 0; k < c.count; k++) {
          if (c.health[k] <= 0) continue;
          const dx = c.pos[k * 3] - ix;
          const dy = c.pos[k * 3 + 1] - iy;
          const dz = c.pos[k * 3 + 2] - iz;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d < R) damageCity(g, k, w.dmg[i] * (1 - d / R), true, DMG_WRECK);
        }
      }
      w.kill(i);
    }
  }
}
