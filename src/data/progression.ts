import type { Rarity } from './types';

export const PROGRESSION = {
  /** XP needed to go from `level` to the next. */
  xpBase: 4,
  xpPerLevel: 3,
  xpQuad: 0.15,
  choices: 3,
  maxChoices: 5,
  rerolls: 3,
  banishes: 2,
  /** Offer weight of a tier upgrade for an owned weapon. */
  tierWeight: 70,
  baseCritMult: 2,
} as const;

export const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 100,
  uncommon: 55,
  rare: 26,
  epic: 10,
  legendary: 3,
};

export function xpForLevel(level: number): number {
  // Quadratic so late-game kill floods don't hand out hundreds of levels.
  return Math.round(PROGRESSION.xpBase + PROGRESSION.xpPerLevel * level + PROGRESSION.xpQuad * level * level);
}
