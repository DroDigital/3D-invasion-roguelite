import type { ConsumableDef } from './types';

/** Tactical one-shot items: bought in the shop's armory with salvage, stacked, placed on the globe. */
export const CONSUMABLES: readonly ConsumableDef[] = [
  { id: 'nuke', name: 'Thermonuclear Warhead', rarity: 'rare', price: 55, maxStack: 3, targeting: 'point', icon: 'NK', sfx: 'explode_big', action: { kind: 'nuke', radius: 0.42, damage: 2600, collateral: 12 }, text: 'Click the globe: a warhead detonates in low orbit, erasing everything near it. Scorches the ground and hurts nearby cities.' },
  { id: 'turret', name: 'Sentry Drop', rarity: 'common', price: 22, maxStack: 6, targeting: 'point', icon: 'ST', sfx: 'ability', action: { kind: 'turret', duration: 45, range: 0.85, damage: 40, period: 0.18 }, text: 'Drop an autocannon on the surface. Shreds everything within reach for 45 seconds.' },
  { id: 'mines', name: 'Mine Cluster', rarity: 'common', price: 18, maxStack: 6, targeting: 'point', icon: 'MC', sfx: 'ability', action: { kind: 'mines', count: 16, damage: 140, duration: 60 }, text: 'Seed 16 proximity mines in orbit above a point for 60 seconds.' },
  { id: 'decoy', name: 'Decoy City', rarity: 'uncommon', price: 26, maxStack: 4, targeting: 'point', icon: 'DC', sfx: 'shield', action: { kind: 'decoy', duration: 25, radius: 0.7 }, text: 'A holographic city. For 25 s, alien fire aimed at cities near it hits the decoy instead.' },
  { id: 'cryo', name: 'Cryo Bomb', rarity: 'common', price: 20, maxStack: 5, targeting: 'point', icon: 'CB', sfx: 'emp', action: { kind: 'cryo', radius: 0.55, duration: 5 }, text: 'Freeze every alien near a point solid for 5 seconds (bosses and horrors briefly).' },
  { id: 'well', name: 'Gravity Well', rarity: 'uncommon', price: 34, maxStack: 4, targeting: 'point', icon: 'GW', sfx: 'ability', action: { kind: 'well', radius: 0.5, duration: 10, dps: 160, pull: 0.5 }, text: 'A collapsing gravity well drags aliens in and grinds them for 10 seconds.' },
  { id: 'shield', name: 'Shield Capacitor', rarity: 'common', price: 16, maxStack: 6, targeting: 'city', icon: 'SC', sfx: 'shield', action: { kind: 'shield', duration: 15 }, text: 'Click a city: invulnerable for 15 seconds.' },
  { id: 'squadron', name: 'Strike Squadron', rarity: 'uncommon', price: 30, maxStack: 4, targeting: 'point', icon: 'SQ', sfx: 'ability', action: { kind: 'squadron', count: 16 }, text: 'Scramble 16 extra fighters that launch toward a point and stay for the wave.' },
  { id: 'repair', name: 'Rebuild Crews', rarity: 'common', price: 14, maxStack: 6, targeting: 'city', icon: 'RC', sfx: 'shield', action: { kind: 'repair', amount: 60 }, text: 'Click a city: it regains 60 defense and nearby weapon emitters come back online.' },
  { id: 'singularity', name: 'Singularity Charge', rarity: 'legendary', price: 90, maxStack: 2, targeting: 'point', icon: 'SG', sfx: 'explode_big', action: { kind: 'singularity', radius: 0.36, duration: 6, dps: 900 }, text: 'Open a black hole for 6 seconds. Lesser aliens near it are torn apart; giants are badly hurt.' },
];

export const ARMORY_RULES = {
  /** Consumables on the armory shelf per shop visit. */
  shelf: 5,
  /** Prices rise by this fraction per wave, and by repeatBuy per copy bought this visit. */
  perWave: 0.07,
  repeatBuy: 0.3,
  /** Distinct consumables held at once (dock buttons 1-6). */
  maxKinds: 6,
};

export function consumableById(id: string): ConsumableDef {
  const c = CONSUMABLES.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown consumable: ${id}`);
  return c;
}
