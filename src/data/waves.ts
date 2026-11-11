/** Wave pacing. Composition tables arrive with the full alien roster. */
export const WAVE_CONFIG = {
  firstDelay: 3,
  intermission: 6,
  baseCount: 5,
  countPerWave: 3,
  /** Seconds over which a wave's ships arrive. */
  duration: 14,
  clusterMin: 2,
  clusterMax: 4,
  spawnRadius: 6,
  hpGrowthPerWave: 0.12,
  alien: 'scout_pod',
} as const;
