import type { DefenseDef } from './types';

/**
 * Planetary defense modules. A second loadout beside the weapons: slotted, tiered I-V,
 * offered on level-up and refitted in the shop. Each answers a different alien threat.
 * Tier values live in `v`; sim/defense.ts reads them by name.
 */
export const DEFENSES: readonly DefenseDef[] = [
  {
    id: 'aegis', name: 'Aegis Shell', rarity: 'rare', icon: 'AG', color: [0.6, 1.4, 2.6],
    text: 'A hex-lattice shield around the planet. Soaks alien shots, falling wrecks and dive-bombers until it breaks.',
    tiers: [
      { text: '40 shield, 3/s regen', v: { cap: 40, regen: 3 } },
      { text: '70 shield, 4.5/s regen', v: { cap: 70, regen: 4.5 } },
      { text: '110 shield, 6.5/s regen', v: { cap: 110, regen: 6.5 } },
      { text: '170 shield, 9/s regen', v: { cap: 170, regen: 9 } },
      { text: '260 shield, 13/s regen, overload pulse when broken', v: { cap: 260, regen: 13, pulse: 1 } },
    ],
  },
  {
    id: 'flak', name: 'Flak Grid', rarity: 'common', icon: 'FK', color: [2.6, 1.6, 0.6],
    text: 'Ground flak batteries shred incoming missiles, acid, wrecks and low-flying swarms.',
    tiers: [
      { text: '6 batteries', v: { sites: 6, period: 0.6, dmg: 10, range: 0.55 } },
      { text: '9 batteries', v: { sites: 9, period: 0.5, dmg: 13, range: 0.6 } },
      { text: '12 batteries, faster', v: { sites: 12, period: 0.4, dmg: 17, range: 0.65 } },
      { text: '16 batteries', v: { sites: 16, period: 0.33, dmg: 22, range: 0.7 } },
      { text: '22 batteries, double bursts', v: { sites: 22, period: 0.25, dmg: 30, range: 0.8, burst: 2 } },
    ],
  },
  {
    id: 'interceptor', name: 'Interceptor Silos', rarity: 'uncommon', icon: 'IS', color: [2.4, 2.4, 2.6],
    text: 'Silos launch hunter missiles at gunships, saboteurs and tentacles before anything else.',
    tiers: [
      { text: '2 missiles every 2.5 s', v: { n: 2, period: 2.5, dmg: 60 } },
      { text: '3 missiles every 2.2 s', v: { n: 3, period: 2.2, dmg: 75 } },
      { text: '4 missiles every 2 s', v: { n: 4, period: 2, dmg: 95 } },
      { text: '6 missiles every 1.8 s', v: { n: 6, period: 1.8, dmg: 120 } },
      { text: '9 missiles every 1.5 s, cluster warheads', v: { n: 9, period: 1.5, dmg: 150, aoe: 0.1 } },
    ],
  },
  {
    id: 'bastion', name: 'Bastion Plating', rarity: 'common', icon: 'BP', color: [2.4, 2, 1.1],
    text: 'Hardened city cores. Cities take less damage and slowly rebuild themselves.',
    tiers: [
      { text: '-12% city damage, 0.3/s rebuild', v: { reduce: 0.12, regen: 0.3 } },
      { text: '-18% city damage, 0.5/s rebuild', v: { reduce: 0.18, regen: 0.5 } },
      { text: '-24% city damage, 0.7/s rebuild', v: { reduce: 0.24, regen: 0.7 } },
      { text: '-30% city damage, 1/s rebuild', v: { reduce: 0.3, regen: 1 } },
      { text: '-38% city damage, 1.4/s rebuild', v: { reduce: 0.38, regen: 1.4 } },
    ],
  },
  {
    id: 'nanites', name: 'Repair Nanites', rarity: 'uncommon', icon: 'RN', color: [0.6, 2.6, 1.2],
    text: 'Nanite clouds patch damaged cities and rebuild destroyed weapon emitters far faster.',
    tiers: [
      { text: 'Heal 0.5/s, emitters rebuild 1.5x faster', v: { heal: 0.5, rebuild: 1.5 } },
      { text: 'Heal 0.8/s, rebuild 2x', v: { heal: 0.8, rebuild: 2 } },
      { text: 'Heal 1.2/s, rebuild 2.6x', v: { heal: 1.2, rebuild: 2.6 } },
      { text: 'Heal 1.7/s, rebuild 3.3x', v: { heal: 1.7, rebuild: 3.3 } },
      { text: 'Heal 2.4/s, rebuild 4.5x', v: { heal: 2.4, rebuild: 4.5 } },
    ],
  },
  {
    id: 'decoy', name: 'Decoy Beacons', rarity: 'uncommon', icon: 'DB', color: [2.6, 0.9, 2.2],
    text: 'Holographic false cities. A share of alien shots and dive-bombers hit empty ground instead.',
    tiers: [
      { text: '15% of attacks diverted', v: { chance: 0.15 } },
      { text: '22% diverted', v: { chance: 0.22 } },
      { text: '29% diverted', v: { chance: 0.29 } },
      { text: '36% diverted', v: { chance: 0.36 } },
      { text: '45% diverted', v: { chance: 0.45 } },
    ],
  },
  {
    id: 'tesla', name: 'Tesla Pylons', rarity: 'rare', icon: 'TP', color: [1.2, 1.8, 3],
    text: 'Pylons at every city arc into anything touching it: besiegers, tentacles, dive-bombers.',
    tiers: [
      { text: '2 arcs per city every 0.8 s', v: { n: 2, period: 0.8, dmg: 18, range: 0.22 } },
      { text: '3 arcs, 24 damage', v: { n: 3, period: 0.75, dmg: 24, range: 0.24 } },
      { text: '4 arcs, 32 damage', v: { n: 4, period: 0.7, dmg: 32, range: 0.27 } },
      { text: '5 arcs, 42 damage', v: { n: 5, period: 0.6, dmg: 42, range: 0.3 } },
      { text: '7 arcs, 56 damage, stuns', v: { n: 7, period: 0.5, dmg: 56, range: 0.34, stun: 0.6 } },
    ],
  },
  {
    id: 'minefield', name: 'Orbital Minefield', rarity: 'uncommon', icon: 'MF', color: [3, 0.7, 0.5],
    text: 'Proximity mines seeded in low orbit. Anything that flies through detonates them; they re-arm.',
    tiers: [
      { text: '24 mines', v: { mines: 24, dmg: 80, radius: 0.12, rearm: 6 } },
      { text: '36 mines', v: { mines: 36, dmg: 100, radius: 0.13, rearm: 5.5 } },
      { text: '48 mines', v: { mines: 48, dmg: 125, radius: 0.14, rearm: 5 } },
      { text: '64 mines', v: { mines: 64, dmg: 155, radius: 0.15, rearm: 4.5 } },
      { text: '90 mines, bigger blasts', v: { mines: 90, dmg: 200, radius: 0.19, rearm: 4 } },
    ],
  },
  {
    id: 'wards', name: 'Hardlight Wards', rarity: 'rare', icon: 'HW', color: [0.5, 2.6, 2.6],
    text: 'Shields every weapon emitter. Gunships need far longer to knock them out; saboteurs jam less.',
    tiers: [
      { text: '+60% emitter armour, -20% jam', v: { hp: 0.6, jam: 0.2 } },
      { text: '+100% armour, -30% jam', v: { hp: 1, jam: 0.3 } },
      { text: '+150% armour, -40% jam', v: { hp: 1.5, jam: 0.4 } },
      { text: '+220% armour, -50% jam', v: { hp: 2.2, jam: 0.5 } },
      { text: '+320% armour, -65% jam', v: { hp: 3.2, jam: 0.65 } },
    ],
  },
  {
    id: 'bunkers', name: 'Deep Bunkers', rarity: 'common', icon: 'DK', color: [1.6, 1.6, 1.3],
    text: 'Shelters under every city. Fewer people die when defenses fall and abductors find fewer to take.',
    tiers: [
      { text: '-15% casualties, -20% abduction', v: { pop: 0.15, abduct: 0.2 } },
      { text: '-22% casualties, -30% abduction', v: { pop: 0.22, abduct: 0.3 } },
      { text: '-30% casualties, -40% abduction', v: { pop: 0.3, abduct: 0.4 } },
      { text: '-38% casualties, -50% abduction', v: { pop: 0.38, abduct: 0.5 } },
      { text: '-48% casualties, -65% abduction', v: { pop: 0.48, abduct: 0.65 } },
    ],
  },
];

export const DEFENSE_RULES = {
  /** Defense slots at the start of a run, and the most the shop can raise it to. */
  slots: 3,
  maxSlots: 6,
  /** Offer weight of a new module / a tier upgrade. */
  newWeight: 0.6,
  tierWeight: 45,
  /** Before the first module is owned, from this level on, modules are pushed hard. */
  firstFromLevel: 3,
  /** Defense damage keeps pace with alien health growth. */
  damageGrowth: 1.085,
};

export function defenseById(id: string): DefenseDef {
  const d = DEFENSES.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown defense: ${id}`);
  return d;
}
