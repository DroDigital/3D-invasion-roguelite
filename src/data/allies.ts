/** Earth's own defence squadrons: fighters that launch from surviving cities and dogfight the invasion. */
export const ALLIES = {
  /** Fighters aloft = base + perWave * wave, capped. */
  base: 8,
  perWave: 7,
  max: 320,
  /** Launches per second while below strength. */
  launchRate: 14,
  speed: 0.75,
  turn: 3.5,
  /** Fighters engage inside this range and break off after a pass. */
  range: 0.28,
  fireRate: 2,
  damage: 5,
  /** Damage grows with the wave so squadrons stay relevant. */
  damagePerWave: 0.06,
  sortie: 35,
  models: ['craft_speederA', 'craft_speederD', 'craft_racer'],
};
