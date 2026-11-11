import type { AlienDef, AlienRole, AlienTierDef, ModifierDef, SpeciesDef, WaveDef } from './types';

export const SPECIES: readonly SpeciesDef[] = [
  {
    id: 'insectoid', name: 'Skitter Swarm', minWave: 1,
    palette: [[0.08, 0.12, 0.02], [0.75, 0.9, 0.2]], movement: 'swarm',
    resist: { kinetic: 1, energy: 1, explosive: 1.25, gravity: 1 },
    hpMul: 0.7, speedMul: 1.3, clusterMul: 2,
    text: 'Chitinous swarmers. Fragile, fast, and never alone. Splash damage tears them apart.',
  },
  {
    id: 'crystal', name: 'Lattice Choir', minWave: 3,
    palette: [[0.05, 0.1, 0.25], [0.55, 0.95, 1.0]], movement: 'spiral',
    resist: { kinetic: 0.6, energy: 1.35, explosive: 0.9, gravity: 1 },
    hpMul: 1, speedMul: 0.95, clusterMul: 1, shield: 0.5,
    text: 'Crystalline ships wrapped in regenerating shields. Kinetic rounds glance off; energy shatters them.',
  },
  {
    id: 'greys', name: 'Grey Collective', minWave: 5,
    palette: [[0.12, 0.12, 0.14], [0.8, 0.82, 0.9]], movement: 'blink',
    resist: { kinetic: 1, energy: 0.8, explosive: 1, gravity: 1.3 },
    hpMul: 0.9, speedMul: 1, clusterMul: 1, cloak: { period: 6, duration: 2 },
    text: 'Cloaking saucer crews that blink across the sky. They vanish from targeting every few seconds.',
  },
  {
    id: 'hulk', name: 'Ironvein Brood', minWave: 7,
    palette: [[0.18, 0.04, 0.03], [0.85, 0.45, 0.3]], movement: 'lumber',
    resist: { kinetic: 0.9, energy: 1, explosive: 0.75, gravity: 1.4 },
    hpMul: 2.2, speedMul: 0.55, clusterMul: 0.7, armor: 4, regen: 0.008,
    text: 'Slow biomechanical hulks under thick plating. Flat armour shrugs off small hits; gravity crushes them.',
  },
];

/** Role templates; each species gets one of each, scaled by its multipliers. */
const ROLE: Record<AlienRole, Omit<AlienDef, 'id' | 'name' | 'species' | 'model' | 'role'>> = {
  invader: { hp: 20, speed: 0.36, roleParams: { siegeDps: 1.6 }, scale: 0.06, xp: 1, salvage: 1, threat: 1, minWave: 1 },
  destroyer: { hp: 70, speed: 0.26, roleParams: { hoverAlt: 1.38, bombDmg: 4, bombPeriod: 2.5 }, scale: 0.085, xp: 3, salvage: 3, threat: 4, minWave: 2 },
  abductor: { hp: 45, speed: 0.3, roleParams: { hoverAlt: 1.09, abductRate: 120000, capacity: 1500000 }, scale: 0.08, xp: 3, salvage: 3, threat: 3, minWave: 3 },
  saboteur: { hp: 35, speed: 0.42, roleParams: { jam: 0.6 }, scale: 0.06, xp: 2, salvage: 3, threat: 3, minWave: 4 },
  carrier: { hp: 260, speed: 0.16, roleParams: { hoverAlt: 1.75, spawnPeriod: 4, spawnCount: 3 }, scale: 0.13, xp: 8, salvage: 8, threat: 10, minWave: 6 },
  boss: { hp: 2400, speed: 0.12, roleParams: { hoverAlt: 1.6, bombDmg: 6, bombPeriod: 3, spawnPeriod: 6, spawnCount: 4 }, scale: 0.26, xp: 60, salvage: 60, threat: 0, minWave: 5 },
};

const HULLS: Record<string, Record<AlienRole, string>> = {
  insectoid: { invader: 'dispatcher', destroyer: 'spitfire', abductor: 'pancake', saboteur: 'zenith', carrier: 'insurgent', boss: 'executioner' },
  crystal: { invader: 'omen', destroyer: 'striker', abductor: 'pancake', saboteur: 'challenger', carrier: 'imperial', boss: 'insurgent' },
  greys: { invader: 'bob', destroyer: 'zenith', abductor: 'pancake', saboteur: 'dispatcher', carrier: 'imperial', boss: 'pancake' },
  hulk: { invader: 'challenger', destroyer: 'executioner', abductor: 'pancake', saboteur: 'omen', carrier: 'insurgent', boss: 'imperial' },
};

const NAMES: Record<string, Record<AlienRole, string>> = {
  insectoid: { invader: 'Skitterling', destroyer: 'Acid Spitter', abductor: 'Hive Harvester', saboteur: 'Wire Mite', carrier: 'Brood Mother', boss: 'Swarm Queen' },
  crystal: { invader: 'Shard', destroyer: 'Prism Lancer', abductor: 'Resonance Dish', saboteur: 'Echo Spike', carrier: 'Choir Spire', boss: 'The Lattice Heart' },
  greys: { invader: 'Drifter', destroyer: 'Grey Warden', abductor: 'Collector', saboteur: 'Phase Imp', carrier: 'Mothership Tender', boss: 'The Overseer' },
  hulk: { invader: 'Ironling', destroyer: 'Siege Leviathan', abductor: 'Gut Hauler', saboteur: 'Rust Borer', carrier: 'Womb Barge', boss: 'Ironvein Colossus' },
};

const ROLES: AlienRole[] = ['invader', 'destroyer', 'abductor', 'saboteur', 'carrier', 'boss'];

export const ALIENS: readonly AlienDef[] = SPECIES.flatMap((sp) =>
  ROLES.map((role) => {
    const t = ROLE[role];
    return {
      ...t,
      id: `${sp.id}_${role}`,
      name: NAMES[sp.id][role],
      species: sp.id,
      role,
      model: HULLS[sp.id][role],
      hp: Math.round(t.hp * sp.hpMul),
      speed: +(t.speed * sp.speedMul).toFixed(3),
      // Swarm species are cheap; hulks are expensive.
      threat: role === 'boss' ? 0 : Math.max(1, Math.round(t.threat * (sp.hpMul < 1 ? 0.7 : sp.hpMul > 1.5 ? 1.8 : 1))),
      minWave: Math.max(t.minWave, sp.minWave),
    };
  }),
);

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
  { wave: 1, budget: 8, roleWeights: { invader: 1 } },
  { wave: 2, budget: 12, roleWeights: { invader: 4, destroyer: 1 } },
  { wave: 3, budget: 17, roleWeights: { invader: 4, destroyer: 1, abductor: 1.5 } },
  { wave: 4, budget: 23, roleWeights: { invader: 4, destroyer: 1.5, abductor: 1.5, saboteur: 1 } },
  { wave: 5, budget: 22, roleWeights: { invader: 4, destroyer: 1.5, abductor: 1.5, saboteur: 1 } },
  { wave: 6, budget: 36, roleWeights: { invader: 4, destroyer: 2, abductor: 1.5, saboteur: 1, carrier: 0.6 } },
];

export const WAVE_RULES = {
  firstDelay: 3,
  /** Countdown after leaving the shop. */
  intermission: 3,
  /** Budget for generated waves: base + linear * wave + quad * wave^2. */
  budgetBase: 8,
  budgetLinear: 1.5,
  budgetQuad: 0.3,
  /** Seconds over which a wave's ships arrive. */
  duration: 16,
  clusterMin: 2,
  clusterMax: 4,
  spawnRadius: 6,
  hpGrowthPerWave: 1.11,
  /** From this wave on, health grows by an extra factor per wave so every run ends eventually. */
  overtimeWave: 28,
  overtimeGrowth: 1.12,
  bossEvery: 5,
  /** Boss health multiplier per boss appearance (wave 5, 10, ...). */
  bossGrowth: 1.9,
  defaultRoleWeights: { invader: 4, destroyer: 2, abductor: 1.6, saboteur: 1.1, carrier: 0.8 } as Partial<Record<AlienRole, number>>,
};
