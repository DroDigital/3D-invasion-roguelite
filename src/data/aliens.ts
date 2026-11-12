import type { AlienDef, AlienRole, AlienTierDef, DirectiveDef, ModifierDef, SpeciesDef, WaveDef } from './types';

export const SPECIES: readonly SpeciesDef[] = [
  {
    id: 'insectoid', shot: 'acid', name: 'Skitter Swarm', minWave: 1,
    palette: [[0.08, 0.12, 0.02], [0.75, 0.9, 0.2]], movement: 'swarm',
    resist: { kinetic: 1, energy: 1, explosive: 1.25, gravity: 1 },
    hpMul: 0.7, speedMul: 1.3, clusterMul: 2,
    text: 'Chitinous swarmers. Fragile, fast, and never alone. Splash damage tears them apart.',
  },
  {
    id: 'crystal', shot: 'laser', name: 'Lattice Choir', minWave: 3,
    palette: [[0.05, 0.1, 0.25], [0.55, 0.95, 1.0]], movement: 'spiral',
    resist: { kinetic: 0.6, energy: 1.35, explosive: 0.9, gravity: 1 },
    hpMul: 1, speedMul: 0.95, clusterMul: 1, shield: 0.5,
    text: 'Crystalline ships wrapped in regenerating shields. Kinetic rounds glance off; energy shatters them.',
  },
  {
    id: 'greys', shot: 'plasma', name: 'Grey Collective', minWave: 5,
    palette: [[0.12, 0.12, 0.14], [0.8, 0.82, 0.9]], movement: 'blink',
    resist: { kinetic: 1, energy: 0.8, explosive: 1, gravity: 1.3 },
    hpMul: 0.9, speedMul: 1, clusterMul: 1, cloak: { period: 6, duration: 2 },
    text: 'Cloaking saucer crews that blink across the sky. They vanish from targeting every few seconds.',
  },
  {
    id: 'hulk', shot: 'missile', name: 'Ironvein Brood', minWave: 7,
    palette: [[0.18, 0.04, 0.03], [0.85, 0.45, 0.3]], movement: 'lumber',
    resist: { kinetic: 0.9, energy: 1, explosive: 0.75, gravity: 1.4 },
    hpMul: 2.2, speedMul: 0.55, clusterMul: 0.7, armor: 4, regen: 0.008,
    text: 'Slow biomechanical hulks under thick plating. Flat armour shrugs off small hits; gravity crushes them.',
  },
  {
    id: 'abyssal', shot: 'void', name: 'The Outer Dark', minWave: 10, creature: true,
    palette: [[0.08, 0.02, 0.1], [0.55, 0.9, 0.75]], movement: 'lumber',
    resist: { kinetic: 1.1, energy: 0.85, explosive: 1, gravity: 0.7 },
    hpMul: 1.6, speedMul: 0.75, clusterMul: 0.8, regen: 0.006,
    text: 'Things from between the stars. Flesh, eyes and tentacles that reach down and tear at the cities themselves.',
  },
];

/** Role templates; each species gets one of each, scaled by its multipliers. */
const ROLE: Record<AlienRole, Omit<AlienDef, 'id' | 'name' | 'species' | 'model' | 'role'>> = {
  invader: { hp: 20, speed: 0.36, roleParams: { siegeDps: 1.6 }, attack: { dmg: 0.8, period: 4, speed: 1.6, range: 1.2 }, scale: 0.06, xp: 1, salvage: 1, threat: 1, minWave: 1 },
  destroyer: { hp: 70, speed: 0.26, roleParams: { hoverAlt: 1.45 }, attack: { dmg: 3.5, period: 2.4, speed: 1.3, volley: 2 }, scale: 0.085, xp: 3, salvage: 3, threat: 4, minWave: 2 },
  abductor: { hp: 45, speed: 0.3, roleParams: { hoverAlt: 1.09, abductRate: 120000, capacity: 1500000 }, scale: 0.08, xp: 3, salvage: 3, threat: 3, minWave: 3 },
  saboteur: { hp: 35, speed: 0.42, roleParams: { jam: 0.6 }, scale: 0.06, xp: 2, salvage: 3, threat: 3, minWave: 4 },
  carrier: { hp: 260, speed: 0.16, roleParams: { hoverAlt: 1.75, spawnPeriod: 4, spawnCount: 3 }, scale: 0.13, xp: 8, salvage: 8, threat: 10, minWave: 6 },
  boss: { hp: 2400, speed: 0.12, roleParams: { hoverAlt: 1.6, spawnPeriod: 6, spawnCount: 4 }, attack: { dmg: 5, period: 1.4, speed: 1.2, volley: 3 }, scale: 0.26, xp: 60, salvage: 60, threat: 0, minWave: 5 },
  gunship: { hp: 60, speed: 0.34, roleParams: { hoverAlt: 0.35 }, attack: { dmg: 1, period: 1.6, speed: 2.4, target: 'weapon' }, scale: 0.075, xp: 3, salvage: 3, threat: 5, minWave: 9 },
  horror: { hp: 2600, speed: 0.09, roleParams: { hoverAlt: 1.5, tentacles: 4, regrow: 11, reach: 0.55 }, attack: { dmg: 2.5, period: 2.2, speed: 1.1, volley: 2 }, tentacles: 8, scale: 0.3, xp: 50, salvage: 30, threat: 0, minWave: 10 },
  tentacle: { hp: 420, speed: 0, roleParams: { slamDmg: 5, slamPeriod: 3.4 }, scale: 0.05, xp: 6, salvage: 3, threat: 0, minWave: 10 },
};

const HULLS: Record<string, Partial<Record<AlienRole, string>>> = {
  insectoid: { invader: 'dispatcher', destroyer: 'spitfire', abductor: 'pancake', saboteur: 'zenith', carrier: 'insurgent', boss: 'executioner', gunship: 'zenith' },
  crystal: { invader: 'omen', destroyer: 'striker', abductor: 'pancake', saboteur: 'challenger', carrier: 'imperial', boss: 'insurgent', gunship: 'challenger' },
  greys: { invader: 'bob', destroyer: 'zenith', abductor: 'pancake', saboteur: 'dispatcher', carrier: 'imperial', boss: 'pancake', gunship: 'dispatcher' },
  hulk: { invader: 'challenger', destroyer: 'executioner', abductor: 'pancake', saboteur: 'omen', carrier: 'insurgent', boss: 'imperial', gunship: 'omen' },
  // Creature bodies (src/render/creatures.ts), not hulls.
  abyssal: { invader: 'creature:spawn', destroyer: 'creature:watcher', abductor: 'creature:maw', saboteur: 'creature:leech', carrier: 'creature:sac', boss: 'creature:leviathan', gunship: 'creature:lamprey', tentacle: 'creature:none' },
};

const NAMES: Record<string, Partial<Record<AlienRole, string>>> = {
  insectoid: { invader: 'Skitterling', destroyer: 'Acid Spitter', abductor: 'Hive Harvester', saboteur: 'Wire Mite', carrier: 'Brood Mother', boss: 'Swarm Queen', gunship: 'Stinger' },
  crystal: { invader: 'Shard', destroyer: 'Prism Lancer', abductor: 'Resonance Dish', saboteur: 'Echo Spike', carrier: 'Choir Spire', boss: 'The Lattice Heart', gunship: 'Refractor' },
  greys: { invader: 'Drifter', destroyer: 'Grey Warden', abductor: 'Collector', saboteur: 'Phase Imp', carrier: 'Mothership Tender', boss: 'The Overseer', gunship: 'Interdictor' },
  hulk: { invader: 'Ironling', destroyer: 'Siege Leviathan', abductor: 'Gut Hauler', saboteur: 'Rust Borer', carrier: 'Womb Barge', boss: 'Ironvein Colossus', gunship: 'Ram Hulk' },
  abyssal: { invader: 'Spawn of the Deep', destroyer: 'Watcher Eye', abductor: 'Hungering Maw', saboteur: 'Void Leech', carrier: 'Brood Sac', boss: 'The Leviathan Below', gunship: 'Lamprey', horror: 'Star-Spawn Horror', tentacle: 'Grasping Tentacle' },
};

const ROLES: AlienRole[] = ['invader', 'destroyer', 'abductor', 'saboteur', 'carrier', 'boss', 'gunship', 'horror', 'tentacle'];

export const ALIENS: readonly AlienDef[] = SPECIES.flatMap((sp) =>
  ROLES.filter((role) => HULLS[sp.id][role] !== undefined).map((role) => {
    const t = ROLE[role];
    return {
      ...t,
      id: `${sp.id}_${role}`,
      species: sp.id,
      role,
      model: HULLS[sp.id][role]!,
      name: NAMES[sp.id][role]!,
      hp: Math.round(t.hp * sp.hpMul),
      speed: +(t.speed * sp.speedMul).toFixed(3),
      // Swarm species are cheap; hulks are expensive.
      threat: t.threat === 0 ? 0 : Math.max(1, Math.round(t.threat * (sp.hpMul < 1 ? 0.7 : sp.hpMul > 1.5 ? 1.8 : 1))),
      minWave: Math.max(t.minWave, sp.minWave),
    };
  }),
);

/** Giant motherships: carriers that launch endless swarms until destroyed. One per species. */
const MOTHERSHIPS: Record<string, { name: string; model: string }> = {
  insectoid: { name: 'Hive Ark', model: 'insurgent' },
  crystal: { name: 'Cathedral Shard', model: 'imperial' },
  greys: { name: 'Grand Saucer', model: 'pancake' },
  hulk: { name: 'Leviathan Womb', model: 'executioner' },
  abyssal: { name: 'The Brood Below', model: 'creature:brood' },
};
(ALIENS as AlienDef[]).push(
  ...SPECIES.filter((sp) => MOTHERSHIPS[sp.id]).map((sp): AlienDef => ({
    id: `${sp.id}_mothership`,
    name: MOTHERSHIPS[sp.id].name,
    species: sp.id,
    role: 'carrier',
    mothership: true,
    hp: Math.round(1400 * sp.hpMul),
    speed: 0.07,
    roleParams: { hoverAlt: 2.6, spawnPeriod: 2.2, spawnCount: 9, broods: 60 },
    attack: { dmg: 3, period: 1.8, speed: 1.2, volley: 3 },
    model: MOTHERSHIPS[sp.id].model,
    scale: 0.5,
    xp: 40,
    salvage: 40,
    threat: 0,
    minWave: 8,
  })),
);

/**
 * Eldritch horrors: mini-bosses from the Outer Dark that latch onto the planet with tentacles
 * (separate, killable enemies that slam cities), and Great Old Ones that do it at planetary scale.
 */
const HORRORS: { id: string; name: string; model: string; minWave: number; hp: number; tentacles: number; regrow: number; reach: number; slam: number; scale: number; hoverAlt: number; attack: AlienDef['attack']; elder?: boolean; spawn?: number }[] = [
  { id: 'horror_spawn', name: 'Star-Spawn Horror', model: 'creature:horror', minWave: 10, hp: 2600, tentacles: 4, regrow: 11, reach: 0.55, slam: 5, scale: 0.3, hoverAlt: 1.5, attack: { dmg: 2.5, period: 2.2, speed: 1.1, volley: 2 } },
  { id: 'horror_polyp', name: 'Elder Polyp', model: 'creature:polyp', minWave: 14, hp: 3600, tentacles: 6, regrow: 9, reach: 0.6, slam: 6, scale: 0.34, hoverAlt: 1.42, attack: { dmg: 2, period: 1.4, speed: 1.4, volley: 3 } },
  { id: 'horror_choir', name: 'The Drowned Choir', model: 'creature:choir', minWave: 18, hp: 4600, tentacles: 5, regrow: 8, reach: 0.7, slam: 7, scale: 0.36, hoverAlt: 1.6, attack: { dmg: 4, period: 1.8, speed: 1, volley: 4 }, spawn: 5 },
  { id: 'horror_hollow', name: 'The Hollow King', model: 'creature:hollow', minWave: 24, hp: 7000, tentacles: 8, regrow: 7, reach: 0.8, slam: 9, scale: 0.42, hoverAlt: 1.55, attack: { dmg: 5, period: 1.6, speed: 1.2, volley: 4 } },
  { id: 'elder_dreamer', name: 'The Dreamer in the Dark', model: 'creature:dreamer', minWave: 20, hp: 26000, tentacles: 12, regrow: 6, reach: 1.1, slam: 14, scale: 0.5, hoverAlt: 1.95, attack: { dmg: 7, period: 1.2, speed: 1, volley: 6 }, elder: true, spawn: 8 },
];
(ALIENS as AlienDef[]).push(
  ...HORRORS.map((h): AlienDef => ({
    id: h.id,
    name: h.name,
    species: 'abyssal',
    role: 'horror',
    elder: h.elder,
    hp: h.hp,
    speed: h.elder ? 0.06 : 0.09,
    roleParams: { hoverAlt: h.hoverAlt, tentacles: h.tentacles, regrow: h.regrow, reach: h.reach, slamDmg: h.slam, spawnPeriod: 5, spawnCount: h.spawn ?? 0 },
    attack: h.attack,
    tentacles: h.elder ? 14 : 8,
    model: h.model,
    scale: h.scale,
    xp: h.elder ? 200 : 50,
    salvage: h.elder ? 90 : 30,
    threat: 0,
    minWave: h.minWave,
  })),
);
// The Leviathan Below, the Outer Dark's boss, also grips the planet.
for (const a of ALIENS as AlienDef[]) {
  if (a.species === 'abyssal' && a.role === 'boss') a.roleParams = { ...a.roleParams, tentacles: 6, regrow: 8, reach: 0.75, slamDmg: 8 };
  if (a.species === 'abyssal' && a.role === 'tentacle') a.roleParams = { ...a.roleParams };
}

const alienIdx = new Map(ALIENS.map((a, i) => [a.id, i]));
export function alienIndex(id: string): number {
  const i = alienIdx.get(id);
  if (i === undefined) throw new Error(`Unknown alien: ${id}`);
  return i;
}
export const speciesIndex = new Map(SPECIES.map((s, i) => [s.id, i]));

export const ALIEN_TIERS: readonly AlienTierDef[] = [
  { id: 'common', hpMul: 1, dmgMul: 1, speedMul: 1, scale: 1, modifiers: [0, 0], rewardMul: 1, weight: { base: 100, perWave: 0, minWave: 1 }, color: [1, 1, 1] },
  { id: 'elite', hpMul: 2.5, dmgMul: 1.4, speedMul: 1.05, scale: 1.2, modifiers: [1, 1], rewardMul: 3, weight: { base: 4, perWave: 1.6, minWave: 2 }, color: [0.4, 0.8, 1.6] },
  { id: 'champion', hpMul: 6, dmgMul: 1.9, speedMul: 1.1, scale: 1.3, modifiers: [2, 2], rewardMul: 8, weight: { base: 1, perWave: 0.5, minWave: 6 }, color: [2.0, 1.4, 0.3] },
  { id: 'mythic', hpMul: 16, dmgMul: 2.6, speedMul: 1.15, scale: 1.5, modifiers: [3, 3], rewardMul: 25, weight: { base: 0.2, perWave: 0.12, minWave: 12 }, color: [2.2, 0.3, 0.6] },
];

export const MODIFIERS: readonly ModifierDef[] = [
  { id: 'shielded', name: 'Shielded', bit: 1, value: 0.6 },
  { id: 'splitting', name: 'Splitting', bit: 2, value: 2 },
  { id: 'regenerating', name: 'Regenerating', bit: 4, value: 0.02 },
  { id: 'fast', name: 'Fast', bit: 8, value: 1.45 },
  { id: 'explosive', name: 'Explosive', bit: 16, value: 0.25 },
];

/** Hand-authored opening; later waves are generated from the seed (see sim/waves.ts). */
export const WAVES: readonly WaveDef[] = [
  { wave: 1, budget: 16, roleWeights: { invader: 1 } },
  { wave: 2, budget: 24, roleWeights: { invader: 4, destroyer: 1 } },
  { wave: 3, budget: 34, roleWeights: { invader: 4, destroyer: 1, abductor: 1.5 } },
  { wave: 4, budget: 46, roleWeights: { invader: 4, destroyer: 1.5, abductor: 1.5, saboteur: 1 } },
  { wave: 5, budget: 44, roleWeights: { invader: 4, destroyer: 1.5, abductor: 1.5, saboteur: 1 } },
  { wave: 6, budget: 72, roleWeights: { invader: 4, destroyer: 2, abductor: 1.5, saboteur: 1, carrier: 0.6 } },
];

export const WAVE_RULES = {
  firstDelay: 2,
  /** Countdown after leaving the shop. */
  intermission: 3,
  /** Budget for generated waves: base + linear * wave + quad * wave^2. */
  budgetBase: 16,
  budgetLinear: 3,
  budgetQuad: 0.95,
  /** Seconds over which a wave's ships arrive. */
  duration: 18,
  clusterMin: 3,
  clusterMax: 6,
  /** Share of every wave's budget spent on cheap swarm fodder (invaders at reduced health). */
  fodderShare: 0.42,
  fodderThreat: 0.12,
  fodderHp: 0.5,
  /** XP multiplier for fodder kills; their salvage is far lower still. */
  fodderReward: 0.12,
  fodderSalvage: 0.03,
  /** Fodder health grows on its own gentler curve so hordes keep dying in droves late in a run. */
  fodderHpGrowth: 1.075,
  /** Fodder volume multiplier: 1 + max(0, wave - fodderSwellFrom) / fodderSwell. */
  fodderSwell: 9,
  fodderSwellFrom: 10,
  /** Fodder arrives in big clusters spread over the globe. */
  fodderClusterMin: 8,
  fodderClusterMax: 18,
  /** Warp-in shell: ships arrive anywhere between these distances from Earth's centre. */
  spawnRadius: 4.2,
  spawnRadiusMax: 7.5,
  /** Abductors and spent carriers escape past this distance. */
  escapeRadius: 4.2,
  /** Weapons can only engage inside this radius; beyond it ships close in at cruise speed. */
  engageRadius: 3.8,
  /** Horrors (eldritch mini-bosses): first wave, then every Nth wave; more later. */
  horrorFrom: 10,
  horrorEvery: 4,
  /** From this wave on, every boss wave brings the Leviathan Below. */
  /** From this wave on, every boss wave also wakes a Great Old One. */
  elderFrom: 20,
  /** Wave directives: count active = 1 from directiveFrom, +1 every directiveStep waves. */
  directiveFrom: 9,
  directiveStep: 7,
  gunshipsPerWave: 0.25,
  hpGrowthPerWave: 1.115,
  /** From this wave on, health grows by an extra factor per wave so every run ends eventually. */
  overtimeWave: 24,
  overtimeGrowth: 1.13,
  bossEvery: 5,
  /** Motherships: first wave, then every Nth wave; more of them later. */
  mothershipFrom: 8,
  mothershipEvery: 3,
  /** Boss health multiplier per boss appearance (wave 5, 10, ...). */
  bossGrowth: 1.45,
  defaultRoleWeights: { invader: 4, destroyer: 2, abductor: 1.6, saboteur: 1.1, carrier: 0.8 } as Partial<Record<AlienRole, number>>,
};

/** Wave directives: the late game changes how waves fight, not just how much health aliens have. */
export const DIRECTIVES: readonly DirectiveDef[] = [
  { id: 'iron_tide', name: 'IRON TIDE', text: 'Every alien carries +4 armour.', minWave: 12, weight: 10, armorAdd: 4 },
  { id: 'frenzy', name: 'FRENZY', text: 'Aliens move 35% faster.', minWave: 9, weight: 10, speedMul: 1.35 },
  { id: 'bombardment', name: 'BOMBARDMENT', text: 'Alien weapons fire twice as fast.', minWave: 9, weight: 10, fireRateMul: 2 },
  { id: 'hunter_killers', name: 'HUNTER-KILLERS', text: 'Gunship packs hunt your satellites.', minWave: 12, weight: 8, gunships: 10 },
  { id: 'kamikaze', name: 'KAMIKAZE', text: 'Swarms dive straight into cities.', minWave: 10, weight: 8, kamikaze: true },
  { id: 'eclipse', name: 'ECLIPSE', text: 'All aliens phase out of targeting.', minWave: 14, weight: 7, cloakAll: true },
  { id: 'brood_storm', name: 'BROOD STORM', text: 'Half again as many swarms, and they split when killed.', minWave: 14, weight: 7, fodderMul: 1.5, splitFodder: true },
  { id: 'from_below', name: 'FROM THE DEEP', text: 'Horrors rise from between the stars.', minWave: 14, weight: 6, horrors: 2 },
  { id: 'colossi', name: 'COLOSSI', text: 'Aliens have 60% more health.', minWave: 15, weight: 7, hpMul: 1.6 },
  { id: 'scarcity', name: 'SCARCITY', text: 'Wrecks yield half the salvage.', minWave: 10, weight: 6, salvageMul: 0.5 },
];
