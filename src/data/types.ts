export type Tag =
  | 'kinetic' | 'energy' | 'explosive' | 'gravity'
  | 'beam' | 'chain' | 'drone' | 'area' | 'orbital' | 'ground'
  | 'on-kill' | 'on-hit' | 'dot' | 'slow' | 'stun' | 'pierce' | 'crit'
  | 'single-target' | 'multi-target' | 'economy' | 'defense' | 'evolved';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type AlienRole = 'invader' | 'destroyer' | 'abductor' | 'saboteur' | 'carrier' | 'boss';
export type DamageType = 'kinetic' | 'energy' | 'explosive' | 'gravity';
export type TargetRule =
  | 'nearestToCity' | 'highestHp' | 'lowestHp' | 'abductorsFirst' | 'saboteursFirst'
  | 'fastest' | 'densest' | 'bossFirst' | 'random';

/** How a weapon delivers damage. Behaviour lives in sim/combat.ts, numbers live in tiers. */
export type FireKind =
  | 'projectile' // homing bolt or missile; optional aoe, pierce, split
  | 'beam'       // instant hit along a visible beam
  | 'lineBeam'   // instant hit on everything near the line through the target
  | 'chain'      // instant hit that arcs to nearby enemies
  | 'field'      // persistent area at the target: damage over time, slow, pull
  | 'drone'      // long-lived seekers that retarget after each hit
  | 'nova';      // planet-wide pulse on every enemy inside a shell

export type DeployKind = 'satRing' | 'platform' | 'groundBattery' | 'droneWing';
export type Family = 'kinetic' | 'laser' | 'missile' | 'tesla' | 'gravity' | 'drone' | 'artillery';

export interface WeaponTier {
  damage: number;
  /** Volleys per second. */
  fireRate: number;
  /** Targets engaged per volley. */
  targets: number;
  projectileSpeed?: number;
  /** Splash radius on impact (Earth radii). */
  aoe?: number;
  /** Extra enemies a projectile/drone passes through or retargets to. */
  pierce?: number;
  chain?: { jumps: number; range: number; falloff: number };
  field?: { radius: number; duration: number; slow: number; pull: number };
  dot?: { dps: number; duration: number };
  stun?: { chance: number; duration: number };
  slow?: { amount: number; duration: number };
  /** Projectile splits into this many on impact. */
  split?: number;
  /** Instantly kills non-boss targets below this health fraction. */
  execute?: number;
  /** Hit enemies take this much extra damage from everything for 4 s. */
  mark?: number;
  /** Fraction of max health dealt as extra damage (bosses take a quarter). */
  maxHpDamage?: number;
  /** Copies deployed around Earth. */
  emitters: number;
  /** Kit recipe id; unique per tier. */
  model: string;
}

/** Coded kit parts plus sourced Kenney parts (assets/models/kit). */
export type KitPart =
  | 'box' | 'cyl' | 'barrel' | 'gatling' | 'dish' | 'panel' | 'ring' | 'emitter' | 'fin' | 'coil' | 'pod' | 'orb' | 'spike'
  | 'satelliteDish' | 'satelliteDish_detailed' | 'satelliteDish_large' | 'turret_single' | 'turret_double'
  | 'machine_wireless' | 'machine_generator' | 'machine_generatorLarge' | 'machine_barrel' | 'rocket_topA'
  | 'rocket_topB' | 'rocket_fuelA' | 'rocket_finsA' | 'rocket_sidesA' | 'rocket_baseA' | 'weapon_gun'
  | 'weapon_rifle' | 'pipe_ring' | 'structure_detailed' | 'hangar_roundGlass' | 'rock_crystals';

/** Ingredients the kit builder assembles into one distinct model per tier. */
export interface WeaponLook {
  body: KitPart;
  gun: KitPart;
  hero: KitPart;
  accent: [number, number, number];
}

export interface WeaponDef {
  id: string;
  name: string;
  /** Two-letter glyph used as the weapon's icon in the UI. */
  icon: string;
  family: Family;
  tags: Tag[];
  rarity: Rarity;
  deploy: DeployKind;
  fire: FireKind;
  damageType: DamageType;
  /** Projectile / beam look: HDR colour plus width/length multipliers. */
  shot: { color: [number, number, number]; width: number; length: number };
  sfx: string;
  look: WeaponLook;
  targeting: { rule: TargetRule };
  /** Five tiers for normal weapons, one for evolutions. */
  tiers: WeaponTier[];
  /** Evolved weapons never appear in offers; they come from merging. */
  evolved?: boolean;
  /** Meta unlock id that gates this weapon. Absent = always in the pool. */
  unlock?: string;
}

export interface EvolutionDef {
  id: string;
  parents: [string, string];
  /** Weapon id of the evolved weapon. */
  result: string;
}

export type StatId =
  | 'damage' | 'fireRate' | 'projectileSpeed' | 'targets' | 'critChance' | 'critMult'
  | 'aoe' | 'pierce' | 'chainJumps' | 'fieldDuration' | 'dotDps' | 'shieldDamage' | 'bossDamage'
  | 'xpGain' | 'salvageGain' | 'cityArmor' | 'cityRegen' | 'cityDamageTaken' | 'enemySpeed'
  | 'abilityCooldown' | 'shopDiscount' | 'slots' | 'rerolls' | 'banishes' | 'choices' | 'abductRecovery';

/** Selects what an effect applies to by tags, never by id. */
export interface TagQuery {
  all?: Tag[];
  any?: Tag[];
  none?: Tag[];
}

export type ActionDef =
  /** Area damage at the event position, as a multiple of the source weapon's damage. */
  | { kind: 'explode'; radius: number; damageMul: number }
  /** Arc to nearby enemies for a multiple of the source weapon's damage. */
  | { kind: 'zap'; jumps: number; damageMul: number }
  | { kind: 'stunArea'; radius: number; duration: number }
  | { kind: 'healCities'; amount: number }
  /** Heal the city the victim was attacking (or the nearest one). */
  | { kind: 'healCity'; amount: number }
  | { kind: 'xp'; amount: number }
  | { kind: 'salvage'; amount: number }
  | { kind: 'cooldown'; seconds: number };

export type Rule =
  | 'overcharge'      // every 8th volley of each weapon crits
  | 'secondWind'      // once per run, at 40% population, every living city is fully repaired
  | 'bountyHunter'    // elite and better kills drop triple salvage
  | 'freeShopReroll'  // first shop reroll each visit is free
  | 'earlyEvolution'  // evolutions unlock at tier 4
  | 'martyr'          // a falling city destroys every non-boss enemy near it
  | 'luckyStar'       // rarer offers roll more often
  | 'insurance'       // lost population pays out salvage
  | 'glassCities'     // marker for relics that trade city safety for power
  | 'abductorBane';   // abductors take double damage

export type Effect =
  /** final = (base + sum of add) * (1 + sum of pct) * product of mul; each scales with stacks. */
  | { op: 'stat'; stat: StatId; mode: 'add' | 'pct' | 'mul'; value: number; where?: TagQuery }
  | { op: 'trigger'; on: 'kill' | 'hit' | 'crit' | 'waveStart' | 'cityHit' | 'levelUp' | 'abilityUse'; chance?: number; where?: TagQuery; do: ActionDef }
  | { op: 'rule'; rule: Rule };

export interface UpgradeDef {
  id: string;
  name: string;
  kind: 'passive' | 'relic';
  rarity: Rarity;
  tags: Tag[];
  maxStacks: number;
  effects: Effect[];
  unlock?: string;
  /** Short flavour line for relics. */
  text?: string;
}

export type AbilityAction =
  | { kind: 'strike'; radius: number; damage: number }
  | { kind: 'stunAll'; duration: number }
  | { kind: 'cityShield'; duration: number }
  | { kind: 'timeScale'; scale: number; duration: number }
  | { kind: 'overclock'; mul: number; duration: number }
  | { kind: 'dropCargo'; stun: number }
  | { kind: 'repairAll'; amount: number }
  | { kind: 'barrage'; maxHpFrac: number };

export interface AbilityDef {
  id: string;
  name: string;
  /** Seconds, 45-120. */
  cooldown: number;
  targeting: 'none' | 'point' | 'city';
  action: AbilityAction;
  /** Meta-progression cost; absent = cannot be unlocked through meta. */
  metaCost?: number;
  /** Appears rarely in the shop at this base price. */
  shopPrice: number;
  sfx: string;
  text: string;
}

export interface MovementDef {
  kind: 'direct' | 'swarm' | 'spiral' | 'blink' | 'lumber';
}

export interface SpeciesDef {
  id: string;
  name: string;
  /** Hull tint: dark and light ends of a gradient map applied over the hull's baked colours. */
  palette: [[number, number, number], [number, number, number]];
  movement: MovementDef['kind'];
  /** Damage taken multipliers by damage type (1 = normal). */
  resist: Record<DamageType, number>;
  hpMul: number;
  speedMul: number;
  /** Ships per attack cluster multiplier. */
  clusterMul: number;
  /** Fraction of max health granted as a regenerating shield. */
  shield?: number;
  /** Flat damage removed from every hit. */
  armor?: number;
  /** Health regenerated per second as a fraction of max. */
  regen?: number;
  /** Periodically untargetable. */
  cloak?: { period: number; duration: number };
  text: string;
  unlock?: string;
  minWave: number;
}

export interface AlienDef {
  id: string;
  name: string;
  species: string;
  role: AlienRole;
  hp: number;
  /** Earth radii per second. */
  speed: number;
  /**
   * Role numbers. invader: siegeDps. destroyer: hoverAlt, bombDmg, bombPeriod.
   * abductor: hoverAlt, abductRate (people/s), capacity. saboteur: jam (fire-rate loss).
   * carrier: hoverAlt, spawnPeriod, spawnCount. boss: hoverAlt, bombDmg, bombPeriod, spawnPeriod, spawnCount.
   */
  roleParams: Record<string, number>;
  /** Hull model id (assets/models/hulls). */
  model: string;
  scale: number;
  xp: number;
  salvage: number;
  /** Wave budget cost. */
  threat: number;
  minWave: number;
  /** Giant carrier that appears on a schedule rather than from the budget. */
  mothership?: boolean;
}

export type AlienTier = 'common' | 'elite' | 'champion' | 'mythic';
export interface AlienTierDef {
  id: AlienTier;
  hpMul: number;
  dmgMul: number;
  speedMul: number;
  scale: number;
  modifiers: [number, number];
  rewardMul: number;
  /** Roll weight = base + perWave * (wave - 1), from minWave. */
  weight: { base: number; perWave: number; minWave: number };
  color: [number, number, number];
}

export type ModifierId = 'shielded' | 'splitting' | 'regenerating' | 'fast' | 'explosive';
export interface ModifierDef {
  id: ModifierId;
  name: string;
  bit: number;
  /** shielded: shield fraction; regenerating: hp/s fraction; fast: speed mul; explosive: city damage radius; splitting: children. */
  value: number;
}

export interface WaveDef {
  wave: number;
  /** Threat points spent on the wave. */
  budget: number;
  roleWeights: Partial<Record<AlienRole, number>>;
  /** Species allowed this wave (others still unlocked by minWave). */
  species?: string[];
}

export type ShopKind = 'passive' | 'relic' | 'repair' | 'repairAll' | 'slot' | 'rerolls' | 'tierUp' | 'ability';
export interface ShopItemDef {
  id: string;
  kind: ShopKind;
  name: string;
  rarity: Rarity;
  basePrice: number;
  /** Roll weight in the stock pool. */
  weight: number;
  amount?: number;
  minWave?: number;
  text: string;
}

export interface CommanderDef {
  id: string;
  name: string;
  text: string;
  effects: Effect[];
  /** Starting salvage. */
  salvage?: number;
  metaCost: number;
}

export interface UnlockDef {
  id: string;
  name: string;
  kind: 'ability' | 'abilitySlot' | 'startWeapon' | 'commander' | 'content';
  cost: number;
  text: string;
  /** For ability/commander/startWeapon unlocks: the id it grants. */
  grants?: string;
  requires?: string;
}
