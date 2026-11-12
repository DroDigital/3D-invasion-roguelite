import { ABILITIES } from '../data/abilities';
import { PASSIVES, RELICS } from '../data/passives';
import { SHOP_ITEMS, SHOP_RULES } from '../data/shop';
import type { AbilityDef, Rarity, ShopItemDef, UpgradeDef } from '../data/types';
import { WAVE_RULES } from '../data/aliens';
import { healCities, healCity } from './damage';
import type { Game } from './game';
import { rarityWeight } from './offers';
import { isMaxTier, updateEmitters } from './weapons';
import { CITY_MAX_HEALTH } from '../data/cities';
import { DEFENSE_RULES } from '../data/defenses';
import { ARMORY_RULES, CONSUMABLES } from '../data/consumables';
import type { ConsumableDef } from '../data/types';
import { defenseIsMax } from './defense';
import { addItem } from './consumables';

export interface ShopStock {
  def: ShopItemDef;
  name: string;
  text: string;
  rarity: Rarity;
  price: number;
  upgrade?: UpgradeDef;
  ability?: AbilityDef;
  /** For tier-up: the weapon slot it will refit. */
  slot?: number;
  sold: boolean;
}

export interface ArmoryStock {
  def: ConsumableDef;
  price: number;
  bought: number;
}

export interface ShopState {
  stock: ShopStock[];
  /** Consumables: never sell out, but each copy bought this visit costs more. */
  armory: ArmoryStock[];
  rerolls: number;
  freeReroll: boolean;
}

function price(g: Game, base: number, rarity: Rarity): number {
  return Math.max(1, Math.round(base * SHOP_RULES.rarityMul[rarity] * (1 + SHOP_RULES.perWave * (g.wave - 1)) * (1 - g.build.shopDiscount)));
}

function lowestTierSlot(g: Game): number {
  let best = -1;
  g.arsenal.weapons.forEach((w, i) => {
    if (w.def.evolved || isMaxTier(w)) return;
    if (best < 0 || w.tier < g.arsenal.weapons[best].tier) best = i;
  });
  return best;
}

/** Resolve a stock slot into a concrete item, or null if nothing of that kind is available. */
function resolve(g: Game, def: ShopItemDef, taken: Set<string>): ShopStock | null {
  const r = g.shopRng;
  const base = { def, name: def.name, text: def.text, rarity: def.rarity, sold: false };
  switch (def.kind) {
    case 'passive': {
      const pool = PASSIVES.filter((p) => g.build.stacksOf(p.id) < p.maxStacks && g.isUnlocked(p.id, p.unlock) && !g.banished.has(`p:${p.id}`) && !taken.has(p.id));
      if (!pool.length) return null;
      const p = pool[r.weighted(pool.map((x) => rarityWeight(g, x.rarity)))];
      taken.add(p.id);
      return { ...base, name: p.name, rarity: p.rarity, upgrade: p, text: '', price: price(g, def.basePrice, p.rarity) };
    }
    case 'relic': {
      const pool = RELICS.filter((p) => g.build.stacksOf(p.id) === 0 && g.isUnlocked(p.id, p.unlock) && !taken.has(p.id));
      if (!pool.length) return null;
      const p = pool[r.int(pool.length)];
      taken.add(p.id);
      return { ...base, name: p.name, rarity: p.rarity, upgrade: p, text: p.text ?? '', price: price(g, def.basePrice, p.rarity) };
    }
    case 'ability': {
      if (g.abilities.length >= g.abilitySlots) return null;
      const pool = ABILITIES.filter((a) => !g.abilities.some((s) => s.def.id === a.id) && !taken.has(a.id));
      if (!pool.length) return null;
      const a = pool[r.int(pool.length)];
      taken.add(a.id);
      return { ...base, name: a.name, text: a.text, ability: a, price: Math.round(a.shopPrice * (1 + 0.05 * g.wave) * (1 - g.build.shopDiscount)) };
    }
    case 'slot': {
      if (g.arsenal.slots >= SHOP_RULES.maxSlots || taken.has('slot')) return null;
      taken.add('slot');
      return { ...base, price: Math.round(price(g, def.basePrice, def.rarity) * Math.pow(SHOP_RULES.slotStep, g.extraSlots)) };
    }
    case 'tierUp': {
      const slot = lowestTierSlot(g);
      if (slot < 0 || taken.has('tierUp')) return null;
      taken.add('tierUp');
      const w = g.arsenal.weapons[slot];
      return { ...base, slot, text: `${w.def.name}: tier ${w.tier + 1} > ${w.tier + 2}.`, price: price(g, def.basePrice, def.rarity) };
    }
    case 'repair':
    case 'repairAll': {
      const hurt = g.cities.health.some((h) => h > 0 && h < CITY_MAX_HEALTH);
      if (!hurt || taken.has(def.id)) return null;
      taken.add(def.id);
      return { ...base, price: price(g, def.basePrice, def.rarity) };
    }
    case 'defenseSlot': {
      if (g.defense.slots >= DEFENSE_RULES.maxSlots || taken.has('defenseSlot')) return null;
      taken.add('defenseSlot');
      return { ...base, price: Math.round(price(g, def.basePrice, def.rarity) * Math.pow(1.5, g.defense.slots - DEFENSE_RULES.slots)) };
    }
    case 'defenseRefit': {
      const mods = g.defense.modules.filter((m) => !defenseIsMax(m));
      if (!mods.length || taken.has('defenseRefit')) return null;
      taken.add('defenseRefit');
      let low = mods[0];
      for (const m of mods) if (m.tier < low.tier) low = m;
      const slot = g.defense.modules.indexOf(low);
      return { ...base, slot, name: `${low.def.name} Refit`, text: `${low.def.name}: tier ${low.tier + 1} > ${low.tier + 2}. ${low.def.tiers[low.tier + 1].text}.`, price: price(g, def.basePrice, def.rarity) };
    }
    case 'rerolls':
      if (taken.has(def.id)) return null;
      taken.add(def.id);
      return { ...base, price: price(g, def.basePrice, def.rarity) };
  }
}

function rollStock(g: Game): ShopStock[] {
  const r = g.shopRng;
  const pool = SHOP_ITEMS.filter((d) => (d.minWave ?? 1) <= Math.max(1, g.wave));
  const taken = new Set<string>();
  const out: ShopStock[] = [];
  let guard = 0;
  while (out.length < SHOP_RULES.stock && guard++ < 60) {
    const def = pool[r.weighted(pool.map((d) => d.weight))];
    const item = resolve(g, def, taken);
    if (item) out.push(item);
  }
  // Every boss wave guarantees a relic on the shelf.
  if (g.wave % WAVE_RULES.bossEvery === 0 && !out.some((s) => s.def.kind === 'relic')) {
    const relic = resolve(g, SHOP_ITEMS.find((d) => d.kind === 'relic')!, taken);
    if (relic) out[out.length - 1] = relic;
  }
  return out;
}

function rollArmory(g: Game): ArmoryStock[] {
  const r = g.shopRng;
  const pool = [...CONSUMABLES];
  const out: ArmoryStock[] = [];
  while (out.length < ARMORY_RULES.shelf && pool.length) {
    const i = r.weighted(pool.map((c) => rarityWeight(g, c.rarity)));
    out.push({ def: pool[i], price: 0, bought: 0 });
    pool.splice(i, 1);
  }
  for (const a of out) a.price = armoryPrice(g, a);
  return out;
}

export function armoryPrice(g: Game, a: ArmoryStock): number {
  return Math.round(a.def.price * (1 + ARMORY_RULES.perWave * (g.wave - 1)) * (1 + ARMORY_RULES.repeatBuy * a.bought) * (1 - g.build.shopDiscount));
}

export function buyArmory(g: Game, i: number): boolean {
  const a = g.shop?.armory[i];
  if (!a || g.salvage < a.price) return false;
  if (!addItem(g, a.def)) return false;
  g.salvage -= a.price;
  a.bought++;
  a.price = armoryPrice(g, a);
  return true;
}

export function openShop(g: Game): void {
  g.shop = { stock: rollStock(g), armory: rollArmory(g), rerolls: 0, freeReroll: g.build.rules.has('freeShopReroll') };
  g.phase = 'shop';
}

export function rerollCost(g: Game): number {
  if (!g.shop) return 0;
  if (g.shop.freeReroll) return 0;
  return SHOP_RULES.rerollBase + SHOP_RULES.rerollStep * g.shop.rerolls;
}

export function rerollShop(g: Game): boolean {
  if (!g.shop) return false;
  const cost = rerollCost(g);
  if (g.salvage < cost) return false;
  g.salvage -= cost;
  if (g.shop.freeReroll) g.shop.freeReroll = false;
  else g.shop.rerolls++;
  g.shop.stock = rollStock(g);
  g.shop.armory = rollArmory(g);
  return true;
}

export function buyShopItem(g: Game, i: number): boolean {
  const item = g.shop?.stock[i];
  if (!item || item.sold || g.salvage < item.price) return false;
  switch (item.def.kind) {
    case 'passive':
    case 'relic':
      g.build.add(item.upgrade!);
      break;
    case 'ability':
      if (g.abilities.length >= g.abilitySlots) return false;
      g.abilities.push({ def: item.ability!, cd: 0 });
      break;
    case 'slot':
      g.extraSlots++;
      g.arsenal.slots = Math.min(SHOP_RULES.maxSlots, g.arsenal.slots + 1);
      break;
    case 'tierUp': {
      const w = g.arsenal.weapons[item.slot!];
      if (!w || isMaxTier(w)) return false;
      w.tier++;
      updateEmitters(w, 0);
      break;
    }
    case 'repair': {
      const c = g.cities;
      let worst = -1;
      for (let k = 0; k < c.count; k++) if (c.health[k] > 0 && (worst < 0 || c.health[k] < c.health[worst])) worst = k;
      if (worst >= 0) healCity(g, worst, item.def.amount ?? 50);
      break;
    }
    case 'repairAll':
      healCities(g, item.def.amount ?? 25);
      break;
    case 'rerolls':
      g.rerolls += item.def.amount ?? 2;
      break;
    case 'defenseSlot':
      g.defense.slots = Math.min(DEFENSE_RULES.maxSlots, g.defense.slots + 1);
      break;
    case 'defenseRefit': {
      const m = g.defense.modules[item.slot!];
      if (!m || defenseIsMax(m)) return false;
      m.tier++;
      break;
    }
  }
  g.salvage -= item.price;
  item.sold = true;
  g.recompute();
  return true;
}

export function leaveShop(g: Game): void {
  if (g.phase !== 'shop') return;
  g.shop = null;
  g.phase = 'intermission';
  g.phaseTimer = WAVE_RULES.intermission;
  g.queueLevelUps();
}
