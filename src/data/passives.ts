import type { UpgradeDef } from './types';

/** Passive upgrades. Effects select weapons by tag, so new weapons pick up synergies for free. */
export const PASSIVES: readonly UpgradeDef[] = [
  {
    id: 'tungsten_cores', name: 'Tungsten Cores', kind: 'passive', rarity: 'common', tags: ['kinetic'], maxStacks: 5,
    effects: [{ op: 'stat', stat: 'damage', mode: 'pct', value: 0.2, where: { any: ['kinetic'] } }],
  },
  {
    id: 'shaped_warheads', name: 'Shaped Warheads', kind: 'passive', rarity: 'common', tags: ['explosive'], maxStacks: 5,
    effects: [{ op: 'stat', stat: 'damage', mode: 'pct', value: 0.25, where: { any: ['explosive'] } }],
  },
  {
    id: 'overclocked_capacitors', name: 'Overclocked Capacitors', kind: 'passive', rarity: 'common', tags: [], maxStacks: 5,
    effects: [{ op: 'stat', stat: 'fireRate', mode: 'pct', value: 0.12 }],
  },
  {
    id: 'high_velocity_rounds', name: 'High-Velocity Rounds', kind: 'passive', rarity: 'common', tags: [], maxStacks: 3,
    effects: [
      { op: 'stat', stat: 'projectileSpeed', mode: 'pct', value: 0.3 },
      { op: 'stat', stat: 'damage', mode: 'pct', value: 0.06 },
    ],
  },
  {
    id: 'hardened_bunkers', name: 'Hardened Bunkers', kind: 'passive', rarity: 'common', tags: [], maxStacks: 4,
    effects: [{ op: 'stat', stat: 'cityArmor', mode: 'add', value: 0.15 }],
  },
  {
    id: 'field_hospitals', name: 'Field Hospitals', kind: 'passive', rarity: 'uncommon', tags: [], maxStacks: 3,
    effects: [{ op: 'stat', stat: 'cityRegen', mode: 'add', value: 0.25 }],
  },
  {
    id: 'salvage_analysis', name: 'Salvage Analysis', kind: 'passive', rarity: 'uncommon', tags: ['on-kill'], maxStacks: 3,
    effects: [{ op: 'stat', stat: 'xpGain', mode: 'pct', value: 0.2 }],
  },
  {
    id: 'critical_algorithms', name: 'Critical Algorithms', kind: 'passive', rarity: 'uncommon', tags: [], maxStacks: 5,
    effects: [{ op: 'stat', stat: 'critChance', mode: 'add', value: 0.08 }],
  },
  {
    id: 'targeting_uplink', name: 'Targeting Uplink', kind: 'passive', rarity: 'rare', tags: ['single-target'], maxStacks: 2,
    effects: [{ op: 'stat', stat: 'targets', mode: 'add', value: 1, where: { any: ['single-target'] } }],
  },
  {
    id: 'volatile_payloads', name: 'Volatile Payloads', kind: 'passive', rarity: 'rare', tags: ['on-kill', 'area'], maxStacks: 3,
    effects: [
      {
        op: 'trigger', on: 'kill', chance: 0.25, where: { any: ['kinetic', 'explosive'] },
        do: { kind: 'explode', radius: 0.22, damageMul: 0.6 },
      },
    ],
  },
];

export function passiveById(id: string): UpgradeDef {
  const p = PASSIVES.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown passive: ${id}`);
  return p;
}
