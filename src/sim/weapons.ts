import type { WeaponDef, WeaponTier } from '../data/types';

export const MAX_EMITTERS = 16;
export const SAT_RING_RADIUS = 1.45;
export const PLATFORM_RADIUS = 1.85;
export const GROUND_RADIUS = 1.012;
export const DRONE_WING_RADIUS = 1.28;

/** Tier numbers after every owned upgrade is applied. Recomputed when the build changes. */
export interface WeaponStats {
  damage: number;
  fireRate: number;
  targets: number;
  projectileSpeed: number;
  critChance: number;
  critMult: number;
  aoe: number;
  pierce: number;
  chainJumps: number;
  chainRange: number;
  chainFalloff: number;
  fieldRadius: number;
  fieldDuration: number;
  fieldSlow: number;
  fieldPull: number;
  dotDps: number;
  dotDuration: number;
  split: number;
  execute: number;
  mark: number;
  maxHpDamage: number;
  stunChance: number;
  stunDuration: number;
  slowAmount: number;
  slowDuration: number;
  shieldDamage: number;
  bossDamage: number;
}

export function emptyStats(): WeaponStats {
  return {
    damage: 0, fireRate: 0, targets: 1, projectileSpeed: 4, critChance: 0, critMult: 2, aoe: 0, pierce: 0,
    chainJumps: 0, chainRange: 0, chainFalloff: 1, fieldRadius: 0, fieldDuration: 0, fieldSlow: 0, fieldPull: 0,
    dotDps: 0, dotDuration: 0, split: 0, execute: 0, mark: 0, maxHpDamage: 0, stunChance: 0, stunDuration: 0,
    slowAmount: 0, slowDuration: 0, shieldDamage: 1, bossDamage: 1,
  };
}

export interface OwnedWeapon {
  def: WeaponDef;
  /** 0-based tier index. */
  tier: number;
  stats: WeaponStats;
  cooldown: number;
  /** Volleys fired, for the overcharge rule. */
  volleys: number;
  /** Fire-rate loss from attached saboteurs, rebuilt every step. */
  jam: number;
  damageDealt: number;
  kills: number;
  /** Orbit phase of the deployment, radians. */
  phase: number;
  /** Ring inclination, radians; differs per slot so rings don't overlap. */
  tilt: number;
  /** Emitter positions in the Earth-fixed frame, xyz interleaved. */
  emitters: Float32Array;
}

export function tierOf(w: OwnedWeapon): WeaponTier {
  return w.def.tiers[w.tier];
}

export function isMaxTier(w: OwnedWeapon): boolean {
  return w.tier >= w.def.tiers.length - 1;
}

let deploySerial = 0;

export class Arsenal {
  readonly weapons: OwnedWeapon[] = [];
  slots = 6;

  owns(id: string): boolean {
    return this.weapons.some((w) => w.def.id === id);
  }

  get(id: string): OwnedWeapon | undefined {
    return this.weapons.find((w) => w.def.id === id);
  }

  add(def: WeaponDef): OwnedWeapon | null {
    if (this.weapons.length >= this.slots) return null;
    const n = deploySerial++;
    const w: OwnedWeapon = {
      def,
      tier: 0,
      stats: emptyStats(),
      cooldown: 0.5,
      volleys: 0,
      jam: 0,
      damageDealt: 0,
      kills: 0,
      phase: (n * 2.39996) % (Math.PI * 2),
      tilt: 0.35 + ((n * 0.61803) % 1) * 2.4,
      emitters: new Float32Array(MAX_EMITTERS * 3),
    };
    this.weapons.push(w);
    updateEmitters(w, 0);
    return w;
  }

  /** Replace one weapon in place (evolution), keeping its slot index. */
  replace(index: number, def: WeaponDef): OwnedWeapon {
    const old = this.weapons[index];
    const w: OwnedWeapon = { ...old, def, tier: 0, stats: emptyStats(), cooldown: 0.5, volleys: 0, jam: 0, emitters: new Float32Array(MAX_EMITTERS * 3) };
    this.weapons[index] = w;
    updateEmitters(w, 0);
    return w;
  }

  remove(index: number): void {
    this.weapons.splice(index, 1);
  }
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** Advance the deployment and recompute where each emitter is. Cosmetic for
 *  coverage (weapons are global) but it decides where shots visibly come from. */
export function updateEmitters(w: OwnedWeapon, dt: number): void {
  const n = tierOf(w).emitters;
  const em = w.emitters;
  const deploy = w.def.deploy;
  if (deploy === 'groundBattery') {
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
  if (deploy === 'droneWing') {
    // Wings of drones on three crossing low orbits.
    w.phase += 0.22 * dt;
    for (let k = 0; k < n; k++) {
      const ring = k % 3;
      const tilt = w.tilt + ring * 1.05;
      const a = w.phase * (ring === 1 ? -1 : 1) + (Math.floor(k / 3) * Math.PI * 2) / Math.ceil(n / 3) + ring;
      const s = Math.sin(a) * DRONE_WING_RADIUS;
      const st = Math.sin(tilt);
      const ct = Math.cos(tilt);
      em[k * 3] = Math.cos(a) * DRONE_WING_RADIUS;
      em[k * 3 + 1] = s * st;
      em[k * 3 + 2] = s * ct;
    }
    return;
  }
  const platform = deploy === 'platform';
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
