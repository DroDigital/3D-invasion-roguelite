import type { WeaponDef, WeaponTier } from '../data/types';

export const MAX_EMITTERS = 16;
export const SAT_RING_RADIUS = 1.45;

export interface OwnedWeapon {
  def: WeaponDef;
  /** 0-based tier index. */
  tier: number;
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

  add(def: WeaponDef): OwnedWeapon | null {
    if (this.weapons.length >= this.slots) return null;
    const slot = this.weapons.length;
    const w: OwnedWeapon = {
      def,
      tier: 0,
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

/** Advance the deployment and recompute where each emitter is. Cosmetic for
 *  coverage (weapons are global) but it decides where shots visibly come from. */
export function updateEmitters(w: OwnedWeapon, dt: number): void {
  w.phase += 0.06 * dt;
  const n = tierOf(w).emitters;
  const st = Math.sin(w.tilt);
  const ct = Math.cos(w.tilt);
  for (let k = 0; k < n; k++) {
    const a = w.phase + (k * Math.PI * 2) / n;
    const cx = Math.cos(a) * SAT_RING_RADIUS;
    const s = Math.sin(a) * SAT_RING_RADIUS;
    w.emitters[k * 3] = cx;
    w.emitters[k * 3 + 1] = s * st;
    w.emitters[k * 3 + 2] = s * ct;
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
