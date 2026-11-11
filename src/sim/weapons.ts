import type { WeaponDef, WeaponTier } from '../data/types';

export const MAX_EMITTERS = 16;
export const SAT_RING_RADIUS = 1.45;
export const PLATFORM_RADIUS = 1.85;
export const GROUND_RADIUS = 1.012;

/** Tier stats after every owned upgrade is applied. Recomputed when the build changes. */
export interface WeaponStats {
  damage: number;
  fireRate: number;
  targets: number;
  projectileSpeed: number;
  critChance: number;
  critMult: number;
}

export interface OwnedWeapon {
  def: WeaponDef;
  /** 0-based tier index. */
  tier: number;
  stats: WeaponStats;
  cooldown: number;
  damageDealt: number;
  kills: number;
  /** Orbit phase of the emitter ring, radians. */
  phase: number;
  /** Ring inclination, radians; differs per slot so rings don't overlap. */
  tilt: number;
  /** Emitter positions in the Earth-fixed frame, xyz interleaved. */
  emitters: Float32Array;
}

export function tierOf(w: OwnedWeapon): WeaponTier {
  return w.def.tiers[w.tier];
}

export class Arsenal {
  readonly weapons: OwnedWeapon[] = [];
  slots = 6;

  owns(id: string): boolean {
    return this.weapons.some((w) => w.def.id === id);
  }

  add(def: WeaponDef): OwnedWeapon | null {
    if (this.weapons.length >= this.slots) return null;
    const slot = this.weapons.length;
    const t = def.tiers[0];
    const w: OwnedWeapon = {
      def,
      tier: 0,
      stats: {
        damage: t.damage, fireRate: t.fireRate, targets: t.targets,
        projectileSpeed: t.projectileSpeed ?? 4, critChance: 0, critMult: 2,
      },
      cooldown: 0.5,
      damageDealt: 0,
      kills: 0,
      phase: slot * 0.9,
      tilt: 0.35 + slot * 0.55,
      emitters: new Float32Array(MAX_EMITTERS * 3),
    };
    this.weapons.push(w);
    updateEmitters(w, 0);
    return w;
  }
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** Advance the deployment and recompute where each emitter is. Cosmetic for
 *  coverage (weapons are global) but it decides where shots visibly come from. */
export function updateEmitters(w: OwnedWeapon, dt: number): void {
  const n = tierOf(w).emitters;
  const em = w.emitters;
  if (w.def.deploy === 'groundBattery') {
    // Fixed sites spread evenly over the whole surface (Fibonacci sphere).
    for (let k = 0; k < n; k++) {
      const y = 1 - (2 * (k + 0.5)) / n;
      const r = Math.sqrt(1 - y * y);
      const a = k * GOLDEN + w.tilt;
      em[k * 3] = Math.cos(a) * r * GROUND_RADIUS;
      em[k * 3 + 1] = y * GROUND_RADIUS;
      em[k * 3 + 2] = Math.sin(a) * r * GROUND_RADIUS;
    }
    return;
  }
  const platform = w.def.deploy === 'platform';
  const radius = platform ? PLATFORM_RADIUS : SAT_RING_RADIUS;
  w.phase += (platform ? 0.03 : 0.06) * dt;
  const st = Math.sin(w.tilt);
  const ct = Math.cos(w.tilt);
  for (let k = 0; k < n; k++) {
    const a = w.phase + (k * Math.PI * 2) / n;
    const s = Math.sin(a) * radius;
    em[k * 3] = Math.cos(a) * radius;
    em[k * 3 + 1] = s * st;
    em[k * 3 + 2] = s * ct;
  }
}

/** Emitter closest to a point: the one that visibly takes the shot. */
export function nearestEmitter(w: OwnedWeapon, x: number, y: number, z: number): number {
  const n = tierOf(w).emitters;
  let best = 0;
  let bd = Infinity;
  for (let k = 0; k < n; k++) {
    const dx = w.emitters[k * 3] - x;
    const dy = w.emitters[k * 3 + 1] - y;
    const dz = w.emitters[k * 3 + 2] - z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bd) {
      bd = d;
      best = k;
    }
  }
  return best;
}
