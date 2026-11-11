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
  /** Projectile look: HDR colour plus width/length multipliers. */
  shot: { color: [number, number, number]; width: number; length: number };
  targeting: { rule: TargetRule; prefer?: AlienRole[] };
  tiers: [WeaponTier, WeaponTier, WeaponTier, WeaponTier, WeaponTier];
}

export type StatId =
  | 'damage' | 'fireRate' | 'projectileSpeed' | 'targets' | 'critChance' | 'critMult'
  | 'xpGain' | 'cityArmor' | 'cityRegen';

/** Selects what an effect applies to by tags, never by id. */
export interface TagQuery {
  all?: Tag[];
  any?: Tag[];
  none?: Tag[];
}

export type ActionDef =
  /** Area damage around the kill, as a multiple of the killing weapon's damage. */
  | { kind: 'explode'; radius: number; damageMul: number }
  /** Restore health to every living city. */
  | { kind: 'healCities'; amount: number }
  | { kind: 'xp'; amount: number };

export type Effect =
  /** final = (base + sum of add) * (1 + sum of pct) * product of mul; each scales with stacks. */
  | { op: 'stat'; stat: StatId; mode: 'add' | 'pct' | 'mul'; value: number; where?: TagQuery }
  | { op: 'trigger'; on: 'kill' | 'waveStart'; chance?: number; where?: TagQuery; do: ActionDef };

export interface UpgradeDef {
  id: string;
  name: string;
  kind: 'passive' | 'relic';
  rarity: Rarity;
  tags: Tag[];
  maxStacks: number;
  effects: Effect[];
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
