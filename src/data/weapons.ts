import type { EvolutionDef, WeaponDef, WeaponTier } from './types';

type Base = Omit<WeaponTier, 'model'>;
type Per = Partial<Record<'damage' | 'fireRate' | 'targets' | 'emitters' | 'aoe' | 'pierce' | 'split' | 'projectileSpeed', number[]>>;

const DMG = [1, 1.45, 2.05, 2.85, 4];
const RATE = [1, 1.1, 1.22, 1.36, 1.55];
const TGT = [0, 0, 1, 1, 2];
const EMIT = [0, 1, 2, 4, 6];

/**
 * Five tiers from a tier-1 baseline. Default growth: damage x4, fire rate x1.55, +2 targets,
 * +6 emitters by tier 5. `per` overrides any numeric column; `extra` adds nested effects per tier.
 */
function grow(id: string, b: Base, per: Per = {}, extra?: (t: number) => Partial<WeaponTier>): WeaponTier[] {
  const out: WeaponTier[] = [];
  for (let t = 0; t < 5; t++) {
    const tier: WeaponTier = {
      ...b,
      damage: +(b.damage * (per.damage?.[t] ?? DMG[t])).toFixed(2),
      fireRate: +(b.fireRate * (per.fireRate?.[t] ?? RATE[t])).toFixed(3),
      targets: b.targets + (per.targets?.[t] ?? TGT[t]),
      emitters: Math.min(16, b.emitters + (per.emitters?.[t] ?? EMIT[t])),
      model: `${id}_${t + 1}`,
    };
    if (b.aoe !== undefined) tier.aoe = +(b.aoe * (per.aoe?.[t] ?? [1, 1.1, 1.2, 1.35, 1.5][t])).toFixed(3);
    if (b.pierce !== undefined) tier.pierce = b.pierce + (per.pierce?.[t] ?? [0, 1, 1, 2, 3][t]);
    if (b.split !== undefined) tier.split = b.split + (per.split?.[t] ?? [0, 0, 1, 1, 2][t]);
    if (b.projectileSpeed !== undefined) tier.projectileSpeed = +(b.projectileSpeed * (per.projectileSpeed?.[t] ?? 1 + t * 0.08)).toFixed(2);
    Object.assign(tier, extra?.(t));
    out.push(tier);
  }
  return out;
}

const one = (id: string, t: Base): WeaponTier[] => [{ ...t, model: `${id}_evo` }];

export const WEAPONS: readonly WeaponDef[] = [
  // ---------------- kinetic ----------------
  {
    id: 'railgun_sat', name: 'Railgun Satellite', icon: 'RG', family: 'kinetic', rarity: 'common',
    tags: ['kinetic', 'orbital', 'single-target'], deploy: 'satRing', fire: 'projectile', damageType: 'kinetic',
    shot: { color: [3.0, 2.2, 0.8], width: 1, length: 1.2 }, sfx: 'shot_kinetic',
    look: { body: 'box', gun: 'barrel', hero: 'satelliteDish', accent: [0.9, 0.7, 0.3] },
    targeting: { rule: 'nearestToCity' },
    tiers: grow('railgun_sat', { damage: 10, fireRate: 1.6, targets: 1, projectileSpeed: 4.5, emitters: 4 }),
  },
  {
    id: 'gatling_ring', name: 'Gatling Ring', icon: 'GR', family: 'kinetic', rarity: 'common',
    tags: ['kinetic', 'orbital', 'multi-target'], deploy: 'satRing', fire: 'projectile', damageType: 'kinetic',
    shot: { color: [2.6, 2.6, 1.2], width: 0.6, length: 0.6 }, sfx: 'shot_kinetic',
    look: { body: 'cyl', gun: 'gatling', hero: 'machine_barrel', accent: [0.8, 0.8, 0.4] },
    targeting: { rule: 'lowestHp' },
    tiers: grow('gatling_ring', { damage: 3.2, fireRate: 5, targets: 1, projectileSpeed: 6, emitters: 5 }, { targets: [0, 1, 1, 2, 2] }),
  },
  {
    id: 'mass_driver', name: 'Mass Driver', icon: 'MD', family: 'kinetic', rarity: 'uncommon',
    tags: ['kinetic', 'orbital', 'pierce', 'single-target'], deploy: 'platform', fire: 'projectile', damageType: 'kinetic',
    shot: { color: [1.6, 2.4, 3.2], width: 1.8, length: 2.2 }, sfx: 'shot_artillery',
    look: { body: 'structure_detailed', gun: 'weapon_rifle', hero: 'pipe_ring', accent: [0.4, 0.6, 0.9] },
    targeting: { rule: 'highestHp' },
    tiers: grow('mass_driver', { damage: 45, fireRate: 0.4, targets: 1, projectileSpeed: 7, pierce: 2, emitters: 2 }, { emitters: [0, 0, 1, 2, 3] }),
  },
  {
    id: 'flechette_pod', name: 'Flechette Pods', icon: 'FP', family: 'kinetic', rarity: 'uncommon',
    tags: ['kinetic', 'orbital', 'area', 'multi-target'], deploy: 'satRing', fire: 'projectile', damageType: 'kinetic',
    shot: { color: [2.2, 1.6, 1.0], width: 1.2, length: 0.8 }, sfx: 'shot_artillery',
    look: { body: 'pod', gun: 'weapon_gun', hero: 'machine_generator', accent: [0.8, 0.5, 0.3] },
    targeting: { rule: 'densest' },
    tiers: grow('flechette_pod', { damage: 5, fireRate: 1.3, targets: 1, projectileSpeed: 4, split: 3, emitters: 4 }),
  },
  // ---------------- laser ----------------
  {
    id: 'pulse_laser', name: 'Pulse Laser', icon: 'PL', family: 'laser', rarity: 'common',
    tags: ['energy', 'beam', 'orbital', 'single-target'], deploy: 'satRing', fire: 'beam', damageType: 'energy',
    shot: { color: [3.2, 0.6, 0.6], width: 1, length: 1 }, sfx: 'shot_laser',
    look: { body: 'box', gun: 'emitter', hero: 'satelliteDish_detailed', accent: [1.0, 0.3, 0.3] },
    targeting: { rule: 'nearestToCity' },
    tiers: grow('pulse_laser', { damage: 7, fireRate: 2, targets: 1, emitters: 4 }),
  },
  {
    id: 'lance_platform', name: 'Solar Lance', icon: 'SL', family: 'laser', rarity: 'rare',
    tags: ['energy', 'beam', 'orbital', 'single-target'], deploy: 'platform', fire: 'beam', damageType: 'energy',
    shot: { color: [3.4, 2.6, 0.8], width: 3, length: 1 }, sfx: 'shot_laser',
    look: { body: 'machine_generatorLarge', gun: 'emitter', hero: 'satelliteDish_large', accent: [1.0, 0.8, 0.3] },
    targeting: { rule: 'highestHp' },
    tiers: grow('lance_platform', { damage: 40, fireRate: 0.5, targets: 1, emitters: 2, mark: 0.1 }, { emitters: [0, 0, 1, 2, 3] }, (t) => ({ mark: 0.1 + t * 0.03 })),
  },
  {
    id: 'prism_array', name: 'Prism Array', icon: 'PA', family: 'laser', rarity: 'uncommon',
    tags: ['energy', 'beam', 'orbital', 'multi-target'], deploy: 'platform', fire: 'beam', damageType: 'energy',
    shot: { color: [1.6, 0.8, 3.2], width: 0.8, length: 1 }, sfx: 'shot_laser',
    look: { body: 'rock_crystals', gun: 'spike', hero: 'hangar_roundGlass', accent: [0.6, 0.4, 1.0] },
    targeting: { rule: 'random' },
    tiers: grow('prism_array', { damage: 5, fireRate: 1, targets: 3, emitters: 3 }, { targets: [0, 1, 2, 3, 4] }),
  },
  {
    id: 'photon_battery', name: 'Photon Battery', icon: 'PB', family: 'laser', rarity: 'common',
    tags: ['energy', 'beam', 'ground', 'slow'], deploy: 'groundBattery', fire: 'beam', damageType: 'energy',
    shot: { color: [0.6, 3.0, 2.6], width: 1.2, length: 1 }, sfx: 'shot_laser',
    look: { body: 'cyl', gun: 'emitter', hero: 'machine_wireless', accent: [0.3, 1.0, 0.8] },
    targeting: { rule: 'fastest' },
    tiers: grow('photon_battery', { damage: 8, fireRate: 1.4, targets: 1, emitters: 6, slow: { amount: 0.25, duration: 1.5 } }, {}, (t) => ({ slow: { amount: 0.25 + t * 0.05, duration: 1.5 } })),
  },
  // ---------------- missile ----------------
  {
    id: 'missile_platform', name: 'Missile Platform', icon: 'MP', family: 'missile', rarity: 'common',
    tags: ['explosive', 'orbital', 'area'], deploy: 'platform', fire: 'projectile', damageType: 'explosive',
    shot: { color: [3.2, 0.9, 0.3], width: 1.8, length: 0.8 }, sfx: 'shot_missile',
    look: { body: 'structure_detailed', gun: 'rocket_topA', hero: 'rocket_fuelA', accent: [1.0, 0.4, 0.2] },
    targeting: { rule: 'highestHp' },
    tiers: grow('missile_platform', { damage: 30, fireRate: 0.55, targets: 1, projectileSpeed: 2.6, aoe: 0.08, emitters: 2 }, { emitters: [0, 1, 1, 2, 4] }),
  },
  {
    id: 'swarm_pods', name: 'Swarm Pods', icon: 'SW', family: 'missile', rarity: 'uncommon',
    tags: ['explosive', 'orbital', 'multi-target', 'area'], deploy: 'satRing', fire: 'projectile', damageType: 'explosive',
    shot: { color: [3.0, 1.4, 0.4], width: 0.9, length: 0.6 }, sfx: 'shot_missile',
    look: { body: 'pod', gun: 'rocket_topB', hero: 'rocket_sidesA', accent: [1.0, 0.6, 0.2] },
    targeting: { rule: 'random' },
    tiers: grow('swarm_pods', { damage: 6, fireRate: 0.8, targets: 3, projectileSpeed: 3, aoe: 0.05, emitters: 4 }, { targets: [0, 1, 1, 2, 3] }),
  },
  {
    id: 'nuke_silo', name: 'Nuke Silo', icon: 'NS', family: 'missile', rarity: 'rare',
    tags: ['explosive', 'ground', 'area'], deploy: 'groundBattery', fire: 'projectile', damageType: 'explosive',
    shot: { color: [3.4, 3.0, 1.0], width: 2.4, length: 1.2 }, sfx: 'shot_missile',
    look: { body: 'rocket_baseA', gun: 'rocket_topA', hero: 'rocket_finsA', accent: [1.0, 0.9, 0.2] },
    targeting: { rule: 'densest' },
    tiers: grow('nuke_silo', { damage: 80, fireRate: 0.18, targets: 1, projectileSpeed: 1.8, aoe: 0.26, emitters: 3 }, { emitters: [0, 1, 1, 2, 3] }),
  },
  {
    id: 'torpedo_bay', name: 'Plasma Torpedo', icon: 'PT', family: 'missile', rarity: 'uncommon',
    tags: ['explosive', 'orbital', 'dot', 'single-target'], deploy: 'platform', fire: 'projectile', damageType: 'explosive',
    shot: { color: [2.8, 0.6, 3.0], width: 2, length: 1 }, sfx: 'shot_missile',
    look: { body: 'machine_generator', gun: 'rocket_topB', hero: 'orb', accent: [0.9, 0.3, 1.0] },
    targeting: { rule: 'bossFirst' },
    tiers: grow('torpedo_bay', { damage: 40, fireRate: 0.35, targets: 1, projectileSpeed: 2.2, emitters: 2, dot: { dps: 8, duration: 4 } }, { emitters: [0, 0, 1, 2, 3] }, (t) => ({ dot: { dps: 8 * DMG[t], duration: 4 } })),
  },
  // ---------------- tesla ----------------
  {
    id: 'arc_coil', name: 'Arc Coil', icon: 'AC', family: 'tesla', rarity: 'common',
    tags: ['energy', 'chain', 'orbital', 'multi-target'], deploy: 'satRing', fire: 'chain', damageType: 'energy',
    shot: { color: [1.2, 2.0, 3.4], width: 1, length: 1 }, sfx: 'shot_tesla',
    look: { body: 'cyl', gun: 'coil', hero: 'machine_wireless', accent: [0.4, 0.7, 1.0] },
    targeting: { rule: 'nearestToCity' },
    tiers: grow('arc_coil', { damage: 9, fireRate: 1, targets: 1, emitters: 4, chain: { jumps: 2, range: 0.35, falloff: 0.8 } }, {}, (t) => ({ chain: { jumps: 2 + t, range: 0.35 + t * 0.03, falloff: 0.8 } })),
  },
  {
    id: 'storm_sat', name: 'Storm Satellite', icon: 'SS', family: 'tesla', rarity: 'rare',
    tags: ['energy', 'chain', 'orbital', 'stun', 'multi-target'], deploy: 'platform', fire: 'chain', damageType: 'energy',
    shot: { color: [2.0, 2.0, 3.6], width: 1.4, length: 1 }, sfx: 'shot_tesla',
    look: { body: 'orb', gun: 'coil', hero: 'pipe_ring', accent: [0.6, 0.6, 1.0] },
    targeting: { rule: 'densest' },
    tiers: grow('storm_sat', { damage: 6, fireRate: 0.8, targets: 1, emitters: 2, chain: { jumps: 5, range: 0.4, falloff: 0.9 }, stun: { chance: 0.1, duration: 0.6 } }, { emitters: [0, 0, 1, 2, 3] }, (t) => ({ chain: { jumps: 5 + t + (t >> 1), range: 0.4, falloff: 0.9 }, stun: { chance: 0.1 + t * 0.03, duration: 0.6 } })),
  },
  {
    id: 'ion_battery', name: 'Ion Battery', icon: 'IB', family: 'tesla', rarity: 'common',
    tags: ['energy', 'chain', 'ground', 'stun'], deploy: 'groundBattery', fire: 'chain', damageType: 'energy',
    shot: { color: [0.8, 3.0, 3.4], width: 1, length: 1 }, sfx: 'shot_tesla',
    look: { body: 'machine_barrel', gun: 'coil', hero: 'satelliteDish', accent: [0.3, 0.9, 1.0] },
    targeting: { rule: 'saboteursFirst' },
    tiers: grow('ion_battery', { damage: 12, fireRate: 0.9, targets: 1, emitters: 6, chain: { jumps: 1, range: 0.3, falloff: 0.7 }, stun: { chance: 0.2, duration: 0.8 } }, {}, (t) => ({ chain: { jumps: 1 + (t >> 1), range: 0.3, falloff: 0.7 } })),
  },
  // ---------------- gravity ----------------
  {
    id: 'gravity_well', name: 'Gravity Well', icon: 'GW', family: 'gravity', rarity: 'uncommon',
    tags: ['gravity', 'area', 'slow', 'orbital'], deploy: 'platform', fire: 'field', damageType: 'gravity',
    shot: { color: [1.0, 0.4, 2.4], width: 1, length: 1 }, sfx: 'shot_gravity',
    look: { body: 'orb', gun: 'ring', hero: 'machine_generatorLarge', accent: [0.6, 0.3, 1.0] },
    targeting: { rule: 'densest' },
    tiers: grow('gravity_well', { damage: 8, fireRate: 0.4, targets: 1, emitters: 2, field: { radius: 0.14, duration: 3, slow: 0.4, pull: 0.08 } }, { emitters: [0, 0, 1, 2, 3] }, (t) => ({ field: { radius: 0.14 + t * 0.015, duration: 3 + t * 0.3, slow: 0.4 + t * 0.04, pull: 0.08 } })),
  },
  {
    id: 'singularity', name: 'Singularity Projector', icon: 'SG', family: 'gravity', rarity: 'rare',
    tags: ['gravity', 'area', 'single-target'], deploy: 'platform', fire: 'field', damageType: 'gravity',
    shot: { color: [0.4, 0.1, 1.2], width: 1, length: 1 }, sfx: 'shot_gravity',
    look: { body: 'machine_generatorLarge', gun: 'orb', hero: 'ring', accent: [0.4, 0.1, 0.8] },
    targeting: { rule: 'highestHp' },
    tiers: grow('singularity', { damage: 28, fireRate: 0.22, targets: 1, emitters: 2, field: { radius: 0.09, duration: 2.5, slow: 0.6, pull: 0.25 } }, { emitters: [0, 0, 1, 1, 2] }, (t) => ({ field: { radius: 0.09 + t * 0.01, duration: 2.5, slow: 0.6, pull: 0.25 + t * 0.04 } })),
  },
  {
    id: 'tidal_ring', name: 'Tidal Ring', icon: 'TR', family: 'gravity', rarity: 'common',
    tags: ['gravity', 'area', 'slow', 'orbital'], deploy: 'satRing', fire: 'field', damageType: 'gravity',
    shot: { color: [0.6, 1.2, 2.4], width: 1, length: 1 }, sfx: 'shot_gravity',
    look: { body: 'ring', gun: 'pipe_ring', hero: 'satelliteDish_large', accent: [0.4, 0.6, 1.0] },
    targeting: { rule: 'fastest' },
    tiers: grow('tidal_ring', { damage: 3, fireRate: 0.5, targets: 1, emitters: 3, field: { radius: 0.2, duration: 3.5, slow: 0.55, pull: 0 } }, {}, (t) => ({ field: { radius: 0.2 + t * 0.02, duration: 3.5, slow: 0.55 + t * 0.04, pull: 0 } })),
  },
  // ---------------- drones ----------------
  {
    id: 'drone_hive', name: 'Drone Hive', icon: 'DH', family: 'drone', rarity: 'common',
    tags: ['drone', 'kinetic', 'multi-target'], deploy: 'droneWing', fire: 'drone', damageType: 'kinetic',
    shot: { color: [1.6, 2.6, 1.4], width: 1, length: 1 }, sfx: 'shot_drone',
    look: { body: 'hangar_roundGlass', gun: 'fin', hero: 'machine_wireless', accent: [0.5, 0.9, 0.4] },
    targeting: { rule: 'nearestToCity' },
    tiers: grow('drone_hive', { damage: 6, fireRate: 0.8, targets: 1, projectileSpeed: 2.2, pierce: 4, emitters: 3 }, { pierce: [0, 1, 2, 4, 6] }),
  },
  {
    id: 'hunter_drones', name: 'Hunter Drones', icon: 'HD', family: 'drone', rarity: 'uncommon',
    tags: ['drone', 'energy', 'single-target'], deploy: 'droneWing', fire: 'drone', damageType: 'energy',
    shot: { color: [3.0, 1.0, 1.6], width: 1, length: 1 }, sfx: 'shot_drone',
    look: { body: 'pod', gun: 'spike', hero: 'turret_single', accent: [1.0, 0.3, 0.5] },
    targeting: { rule: 'abductorsFirst' },
    tiers: grow('hunter_drones', { damage: 12, fireRate: 0.6, targets: 1, projectileSpeed: 3, pierce: 2, emitters: 3 }),
  },
  {
    id: 'interceptor_wing', name: 'Interceptor Wing', icon: 'IW', family: 'drone', rarity: 'common',
    tags: ['drone', 'kinetic', 'multi-target'], deploy: 'droneWing', fire: 'drone', damageType: 'kinetic',
    shot: { color: [2.4, 2.4, 2.4], width: 0.8, length: 1 }, sfx: 'shot_drone',
    look: { body: 'fin', gun: 'weapon_gun', hero: 'rocket_finsA', accent: [0.8, 0.8, 0.9] },
    targeting: { rule: 'fastest' },
    tiers: grow('interceptor_wing', { damage: 4, fireRate: 1.4, targets: 1, projectileSpeed: 3.6, pierce: 3, emitters: 4 }, { targets: [0, 0, 1, 1, 2] }),
  },
  // ---------------- artillery ----------------
  {
    id: 'flak_battery', name: 'Flak Battery', icon: 'FB', family: 'artillery', rarity: 'common',
    tags: ['kinetic', 'ground', 'multi-target'], deploy: 'groundBattery', fire: 'projectile', damageType: 'kinetic',
    shot: { color: [1.0, 2.6, 1.4], width: 0.8, length: 0.5 }, sfx: 'shot_artillery',
    look: { body: 'box', gun: 'turret_double', hero: 'structure_detailed', accent: [0.4, 0.9, 0.5] },
    targeting: { rule: 'lowestHp' },
    tiers: grow('flak_battery', { damage: 4, fireRate: 2.4, targets: 2, projectileSpeed: 5, emitters: 8 }, { emitters: [0, 2, 4, 6, 8] }),
  },
  {
    id: 'howitzer_net', name: 'Howitzer Network', icon: 'HN', family: 'artillery', rarity: 'uncommon',
    tags: ['explosive', 'ground', 'area'], deploy: 'groundBattery', fire: 'projectile', damageType: 'explosive',
    shot: { color: [2.8, 1.8, 0.6], width: 1.6, length: 0.7 }, sfx: 'shot_artillery',
    look: { body: 'machine_barrel', gun: 'turret_single', hero: 'barrel', accent: [0.9, 0.6, 0.3] },
    targeting: { rule: 'nearestToCity' },
    tiers: grow('howitzer_net', { damage: 30, fireRate: 0.5, targets: 1, projectileSpeed: 3, aoe: 0.11, emitters: 6 }),
  },
  {
    id: 'plasma_mortar', name: 'Plasma Mortar', icon: 'PM', family: 'artillery', rarity: 'uncommon',
    tags: ['energy', 'ground', 'area', 'dot'], deploy: 'groundBattery', fire: 'projectile', damageType: 'energy',
    shot: { color: [0.8, 3.2, 1.0], width: 1.6, length: 0.7 }, sfx: 'shot_artillery',
    look: { body: 'cyl', gun: 'turret_single', hero: 'orb', accent: [0.3, 1.0, 0.4] },
    targeting: { rule: 'densest' },
    tiers: grow('plasma_mortar', { damage: 12, fireRate: 0.7, targets: 1, projectileSpeed: 2.6, aoe: 0.08, emitters: 6, dot: { dps: 4, duration: 3 } }, {}, (t) => ({ dot: { dps: 4 * DMG[t], duration: 3 } })),
  },

  // ---------------- evolutions (one tier, never offered directly) ----------------
  {
    id: 'gauss_lance', name: 'Gauss Lance', icon: 'GL', family: 'kinetic', rarity: 'legendary', evolved: true,
    tags: ['kinetic', 'beam', 'pierce', 'orbital', 'evolved'], deploy: 'satRing', fire: 'lineBeam', damageType: 'kinetic',
    shot: { color: [3.4, 2.8, 1.6], width: 2.4, length: 1 }, sfx: 'shot_laser',
    look: { body: 'structure_detailed', gun: 'barrel', hero: 'satelliteDish_large', accent: [1.0, 0.8, 0.4] },
    targeting: { rule: 'densest' },
    tiers: one('gauss_lance', { damage: 140, fireRate: 1.1, targets: 2, emitters: 10 }),
  },
  {
    id: 'bullet_halo', name: 'Bullet Halo', icon: 'BH', family: 'kinetic', rarity: 'legendary', evolved: true,
    tags: ['kinetic', 'drone', 'orbital', 'multi-target', 'evolved'], deploy: 'satRing', fire: 'projectile', damageType: 'kinetic',
    shot: { color: [3.0, 3.0, 1.4], width: 0.8, length: 0.8 }, sfx: 'shot_kinetic',
    look: { body: 'ring', gun: 'gatling', hero: 'rocket_finsA', accent: [1.0, 1.0, 0.5] },
    targeting: { rule: 'lowestHp' },
    tiers: one('bullet_halo', { damage: 16, fireRate: 8, targets: 6, projectileSpeed: 7, emitters: 16, execute: 0.15 }),
  },
  {
    id: 'graviton_driver', name: 'Graviton Driver', icon: 'GD', family: 'gravity', rarity: 'legendary', evolved: true,
    tags: ['kinetic', 'gravity', 'pierce', 'area', 'evolved'], deploy: 'platform', fire: 'projectile', damageType: 'gravity',
    shot: { color: [1.4, 0.8, 3.4], width: 2.4, length: 2.4 }, sfx: 'shot_gravity',
    look: { body: 'machine_generatorLarge', gun: 'weapon_rifle', hero: 'ring', accent: [0.6, 0.4, 1.0] },
    targeting: { rule: 'highestHp' },
    tiers: one('graviton_driver', { damage: 220, fireRate: 0.5, targets: 1, projectileSpeed: 7, pierce: 8, emitters: 6, field: { radius: 0.18, duration: 3, slow: 0.6, pull: 0.2 } }),
  },
  {
    id: 'cluster_storm', name: 'Cluster Storm', icon: 'CS', family: 'missile', rarity: 'legendary', evolved: true,
    tags: ['explosive', 'kinetic', 'area', 'multi-target', 'evolved'], deploy: 'satRing', fire: 'projectile', damageType: 'explosive',
    shot: { color: [3.2, 1.6, 0.6], width: 1.4, length: 0.8 }, sfx: 'shot_missile',
    look: { body: 'pod', gun: 'rocket_sidesA', hero: 'machine_generator', accent: [1.0, 0.5, 0.2] },
    targeting: { rule: 'densest' },
    tiers: one('cluster_storm', { damage: 28, fireRate: 1.2, targets: 4, projectileSpeed: 3.6, split: 8, aoe: 0.07, emitters: 10 }),
  },
  {
    id: 'event_horizon', name: 'Event Horizon', icon: 'EH', family: 'gravity', rarity: 'legendary', evolved: true,
    tags: ['gravity', 'energy', 'area', 'evolved'], deploy: 'platform', fire: 'field', damageType: 'gravity',
    shot: { color: [2.4, 1.4, 0.4], width: 1, length: 1 }, sfx: 'shot_gravity',
    look: { body: 'orb', gun: 'satelliteDish_large', hero: 'ring', accent: [1.0, 0.6, 0.2] },
    targeting: { rule: 'highestHp' },
    tiers: one('event_horizon', { damage: 60, fireRate: 0.3, targets: 1, emitters: 4, maxHpDamage: 0.06, field: { radius: 0.22, duration: 4, slow: 0.75, pull: 0.45 } }),
  },
  {
    id: 'refraction_web', name: 'Refraction Web', icon: 'RW', family: 'laser', rarity: 'legendary', evolved: true,
    tags: ['energy', 'beam', 'chain', 'multi-target', 'evolved'], deploy: 'platform', fire: 'chain', damageType: 'energy',
    shot: { color: [2.6, 1.0, 3.4], width: 1.6, length: 1 }, sfx: 'shot_laser',
    look: { body: 'rock_crystals', gun: 'coil', hero: 'hangar_roundGlass', accent: [0.8, 0.4, 1.0] },
    targeting: { rule: 'densest' },
    tiers: one('refraction_web', { damage: 38, fireRate: 1.1, targets: 2, emitters: 6, mark: 0.25, chain: { jumps: 12, range: 0.5, falloff: 1 } }),
  },
  {
    id: 'aurora_curtain', name: 'Aurora Curtain', icon: 'AU', family: 'laser', rarity: 'legendary', evolved: true,
    tags: ['energy', 'ground', 'stun', 'area', 'evolved'], deploy: 'groundBattery', fire: 'nova', damageType: 'energy',
    shot: { color: [0.6, 3.2, 1.8], width: 1, length: 1 }, sfx: 'emp',
    look: { body: 'machine_wireless', gun: 'emitter', hero: 'satelliteDish_detailed', accent: [0.3, 1.0, 0.6] },
    targeting: { rule: 'nearestToCity' },
    tiers: one('aurora_curtain', { damage: 30, fireRate: 0.33, targets: 1, emitters: 12, stun: { chance: 1, duration: 0.7 } }),
  },
  {
    id: 'seeker_swarm', name: 'Seeker Swarm', icon: 'SK', family: 'drone', rarity: 'legendary', evolved: true,
    tags: ['drone', 'explosive', 'area', 'evolved'], deploy: 'droneWing', fire: 'drone', damageType: 'explosive',
    shot: { color: [3.2, 1.2, 0.6], width: 1.4, length: 1 }, sfx: 'shot_missile',
    look: { body: 'rocket_baseA', gun: 'rocket_topB', hero: 'turret_double', accent: [1.0, 0.4, 0.2] },
    targeting: { rule: 'abductorsFirst' },
    tiers: one('seeker_swarm', { damage: 40, fireRate: 1.2, targets: 3, projectileSpeed: 3.6, pierce: 6, aoe: 0.1, emitters: 8 }),
  },
  {
    id: 'doomsday_battery', name: 'Doomsday Battery', icon: 'DD', family: 'missile', rarity: 'legendary', evolved: true,
    tags: ['explosive', 'ground', 'area', 'evolved'], deploy: 'groundBattery', fire: 'projectile', damageType: 'explosive',
    shot: { color: [3.6, 3.2, 1.6], width: 3.2, length: 1.4 }, sfx: 'explode_big',
    look: { body: 'rocket_baseA', gun: 'turret_double', hero: 'rocket_fuelA', accent: [1.0, 0.9, 0.3] },
    targeting: { rule: 'densest' },
    tiers: one('doomsday_battery', { damage: 420, fireRate: 0.3, targets: 1, projectileSpeed: 2.2, aoe: 0.45, maxHpDamage: 0.08, emitters: 8 }),
  },
  {
    id: 'star_furnace', name: 'Star Furnace', icon: 'SF', family: 'artillery', rarity: 'legendary', evolved: true,
    tags: ['energy', 'explosive', 'dot', 'area', 'evolved'], deploy: 'platform', fire: 'projectile', damageType: 'energy',
    shot: { color: [3.4, 1.6, 2.6], width: 2.2, length: 1 }, sfx: 'shot_missile',
    look: { body: 'machine_generator', gun: 'turret_single', hero: 'orb', accent: [1.0, 0.5, 0.8] },
    targeting: { rule: 'bossFirst' },
    tiers: one('star_furnace', { damage: 90, fireRate: 0.7, targets: 2, projectileSpeed: 2.6, split: 4, aoe: 0.1, emitters: 6, dot: { dps: 50, duration: 5 } }),
  },
  {
    id: 'tempest_engine', name: 'Tempest Engine', icon: 'TE', family: 'tesla', rarity: 'legendary', evolved: true,
    tags: ['energy', 'gravity', 'chain', 'slow', 'evolved'], deploy: 'satRing', fire: 'nova', damageType: 'energy',
    shot: { color: [1.6, 2.2, 3.6], width: 1, length: 1 }, sfx: 'shot_tesla',
    look: { body: 'orb', gun: 'coil', hero: 'pipe_ring', accent: [0.5, 0.7, 1.0] },
    targeting: { rule: 'nearestToCity' },
    tiers: one('tempest_engine', { damage: 22, fireRate: 0.5, targets: 1, emitters: 8, slow: { amount: 0.6, duration: 2.5 }, chain: { jumps: 2, range: 0.3, falloff: 0.8 } }),
  },
  {
    id: 'swarm_carrier', name: 'Swarm Carrier', icon: 'SC', family: 'drone', rarity: 'legendary', evolved: true,
    tags: ['drone', 'kinetic', 'ground', 'multi-target', 'evolved'], deploy: 'droneWing', fire: 'drone', damageType: 'kinetic',
    shot: { color: [1.6, 3.0, 1.6], width: 1, length: 1 }, sfx: 'shot_drone',
    look: { body: 'hangar_roundGlass', gun: 'turret_double', hero: 'structure_detailed', accent: [0.5, 1.0, 0.5] },
    targeting: { rule: 'nearestToCity' },
    tiers: one('swarm_carrier', { damage: 22, fireRate: 2.2, targets: 4, projectileSpeed: 3.4, pierce: 18, emitters: 12 }),
  },
  {
    id: 'kinetic_sovereign', name: 'Kinetic Sovereign', icon: 'KS', family: 'kinetic', rarity: 'legendary', evolved: true,
    tags: ['kinetic', 'orbital', 'pierce', 'single-target', 'evolved'], deploy: 'platform', fire: 'projectile', damageType: 'kinetic',
    shot: { color: [3.4, 3.4, 3.4], width: 2.4, length: 3 }, sfx: 'shot_artillery',
    look: { body: 'structure_detailed', gun: 'barrel', hero: 'pipe_ring', accent: [0.95, 0.95, 1.0] },
    targeting: { rule: 'bossFirst' },
    tiers: one('kinetic_sovereign', { damage: 300, fireRate: 0.9, targets: 2, projectileSpeed: 9, pierce: 6, execute: 0.25, emitters: 6 }),
  },
  {
    id: 'ball_lightning', name: 'Ball Lightning', icon: 'BL', family: 'tesla', rarity: 'legendary', evolved: true,
    tags: ['energy', 'drone', 'chain', 'stun', 'evolved'], deploy: 'droneWing', fire: 'drone', damageType: 'energy',
    shot: { color: [2.0, 2.6, 3.8], width: 2, length: 2 }, sfx: 'shot_tesla',
    look: { body: 'orb', gun: 'coil', hero: 'machine_wireless', accent: [0.6, 0.8, 1.0] },
    targeting: { rule: 'densest' },
    tiers: one('ball_lightning', { damage: 30, fireRate: 0.9, targets: 3, projectileSpeed: 1.8, pierce: 10, emitters: 6, chain: { jumps: 4, range: 0.35, falloff: 0.85 }, stun: { chance: 0.25, duration: 0.6 } }),
  },
  {
    id: 'orbital_tide', name: 'Orbital Tide', icon: 'OT', family: 'gravity', rarity: 'legendary', evolved: true,
    tags: ['gravity', 'area', 'slow', 'orbital', 'evolved'], deploy: 'satRing', fire: 'nova', damageType: 'gravity',
    shot: { color: [0.8, 1.0, 3.0], width: 1, length: 1 }, sfx: 'shot_gravity',
    look: { body: 'ring', gun: 'pipe_ring', hero: 'satelliteDish_large', accent: [0.4, 0.5, 1.0] },
    targeting: { rule: 'nearestToCity' },
    tiers: one('orbital_tide', { damage: 14, fireRate: 0.8, targets: 1, emitters: 10, slow: { amount: 0.7, duration: 1.6 }, maxHpDamage: 0.02 }),
  },
];

export const EVOLUTIONS: readonly EvolutionDef[] = [
  { id: 'evo_gauss_lance', parents: ['railgun_sat', 'pulse_laser'], result: 'gauss_lance' },
  { id: 'evo_kinetic_sovereign', parents: ['railgun_sat', 'mass_driver'], result: 'kinetic_sovereign' },
  { id: 'evo_bullet_halo', parents: ['gatling_ring', 'interceptor_wing'], result: 'bullet_halo' },
  { id: 'evo_graviton_driver', parents: ['mass_driver', 'gravity_well'], result: 'graviton_driver' },
  { id: 'evo_cluster_storm', parents: ['flechette_pod', 'swarm_pods'], result: 'cluster_storm' },
  { id: 'evo_event_horizon', parents: ['lance_platform', 'singularity'], result: 'event_horizon' },
  { id: 'evo_refraction_web', parents: ['prism_array', 'arc_coil'], result: 'refraction_web' },
  { id: 'evo_aurora_curtain', parents: ['photon_battery', 'ion_battery'], result: 'aurora_curtain' },
  { id: 'evo_seeker_swarm', parents: ['missile_platform', 'hunter_drones'], result: 'seeker_swarm' },
  { id: 'evo_doomsday_battery', parents: ['nuke_silo', 'howitzer_net'], result: 'doomsday_battery' },
  { id: 'evo_star_furnace', parents: ['torpedo_bay', 'plasma_mortar'], result: 'star_furnace' },
  { id: 'evo_tempest_engine', parents: ['storm_sat', 'tidal_ring'], result: 'tempest_engine' },
  { id: 'evo_ball_lightning', parents: ['arc_coil', 'storm_sat'], result: 'ball_lightning' },
  { id: 'evo_orbital_tide', parents: ['gravity_well', 'tidal_ring'], result: 'orbital_tide' },
  { id: 'evo_swarm_carrier', parents: ['drone_hive', 'flak_battery'], result: 'swarm_carrier' },
];

const byId = new Map(WEAPONS.map((w) => [w.id, w]));

export function weaponById(id: string): WeaponDef {
  const w = byId.get(id);
  if (!w) throw new Error(`Unknown weapon: ${id}`);
  return w;
}

/** Normal (non-evolved) weapons. */
export const BASE_WEAPONS: readonly WeaponDef[] = WEAPONS.filter((w) => !w.evolved);

/** Evolutions a weapon takes part in, with the partner id. */
export function evolutionsOf(id: string): { evo: EvolutionDef; partner: string }[] {
  const out: { evo: EvolutionDef; partner: string }[] = [];
  for (const e of EVOLUTIONS) {
    if (e.parents[0] === id) out.push({ evo: e, partner: e.parents[1] });
    else if (e.parents[1] === id) out.push({ evo: e, partner: e.parents[0] });
  }
  return out;
}

/** Weapons available as a starting pick before any meta unlocks. */
export const DEFAULT_START_WEAPONS = ['railgun_sat', 'pulse_laser', 'missile_platform', 'flak_battery', 'arc_coil', 'drone_hive'];
