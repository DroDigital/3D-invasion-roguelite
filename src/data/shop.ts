import type { Rarity, ShopItemDef } from './types';

export const SHOP_ITEMS: readonly ShopItemDef[] = [
  { id: 'passive', kind: 'passive', name: 'Passive System', rarity: 'common', basePrice: 18, weight: 40, text: '' },
  { id: 'relic', kind: 'relic', name: 'Relic', rarity: 'rare', basePrice: 70, weight: 7, minWave: 2, text: '' },
  { id: 'repair', kind: 'repair', name: 'Rebuild City', rarity: 'common', basePrice: 10, weight: 12, amount: 60, text: 'The most damaged surviving city regains 60 defense.' },
  { id: 'repair_all', kind: 'repairAll', name: 'National Reconstruction', rarity: 'uncommon', basePrice: 26, weight: 7, amount: 25, text: 'Every surviving city regains 25 defense.' },
  { id: 'slot', kind: 'slot', name: 'Weapon Slot', rarity: 'rare', basePrice: 55, weight: 5, minWave: 2, text: 'One more weapon can deploy around Earth.' },
  { id: 'rerolls', kind: 'rerolls', name: 'Requisition Orders', rarity: 'common', basePrice: 12, weight: 8, amount: 2, text: 'Two more level-up rerolls.' },
  { id: 'tier_up', kind: 'tierUp', name: 'Field Refit', rarity: 'uncommon', basePrice: 30, weight: 9, text: 'Your lowest-tier weapon gains a tier.' },
  { id: 'ability', kind: 'ability', name: 'Active Ability', rarity: 'legendary', basePrice: 0, weight: 1.4, minWave: 3, text: '' },
];

export const SHOP_RULES = {
  stock: 6,
  /** Price multiplier by rarity. */
  rarityMul: { common: 1, uncommon: 1.4, rare: 2, epic: 2.8, legendary: 3.6 } as Record<Rarity, number>,
  /** Prices grow by this fraction per wave. */
  perWave: 0.12,
  rerollBase: 4,
  rerollStep: 3,
  /** Salvage bonus for clearing a wave, plus perWave * wave. */
  clearBonus: 6,
  clearPerWave: 2,
  maxSlots: 9,
  /** Each extra slot bought costs this much more. */
  slotStep: 1.5,
};
