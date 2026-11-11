export type Tag =
  | 'kinetic' | 'energy' | 'explosive' | 'area' | 'chain' | 'gravity' | 'drone' | 'ground' | 'orbital'
  | 'on-kill' | 'on-hit' | 'dot' | 'slow' | 'single-target' | 'multi-target';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type AlienRole = 'invader' | 'destroyer' | 'abductor' | 'saboteur' | 'carrier' | 'boss';
export type DamageType = 'kinetic' | 'energy' | 'explosive' | 'gravity';
export type TargetRule = 'nearestToCity' | 'highestHp' | 'lowestHp';

export interface WeaponTier {
  damage: number;
  damageType: DamageType;
  /** Volleys per second. */
  fireRate: number;
  /** Targets engaged per volley. */
  targets: number;
  projectileSpeed?: number;
  /** Kit recipe id; unique per tier. */
  model: string;
  /** Copies deployed around Earth. */
  emitters: number;
}

export interface WeaponDef {
  id: string;
  name: string;
  family: 'kinetic' | 'laser' | 'missile' | 'tesla' | 'gravity' | 'drone' | 'artillery';
  tags: Tag[];
  rarity: Rarity;
  deploy: 'satRing' | 'platform' | 'groundBattery' | 'droneWing';
  fire: { kind: 'projectile' };
  targeting: { rule: TargetRule; prefer?: AlienRole[] };
  tiers: [WeaponTier, WeaponTier, WeaponTier, WeaponTier, WeaponTier];
}

export interface AlienDef {
  id: string;
  name: string;
  species: string;
  role: AlienRole;
  hp: number;
  /** Earth radii per second. */
  speed: number;
  movement: 'direct';
  /** Role-specific numbers, e.g. siegeDps for invaders (city health per second). */
  roleParams: Record<string, number>;
  model: string;
  scale: number;
  xp: number;
  salvage: number;
  /** Wave budget cost. */
  threat: number;
  minWave: number;
}
