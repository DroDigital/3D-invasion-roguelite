import type { CommanderDef, UnlockDef } from './types';

export const COMMANDERS: readonly CommanderDef[] = [
  { id: 'vance', name: 'Cmdr. Vance', metaCost: 0, text: 'Steady hands. No special doctrine.', effects: [] },
  { id: 'ishikawa', name: 'Dr. Ishikawa', metaCost: 60, text: 'Energy weapons +15% damage. +10% XP.', effects: [{ op: 'stat', stat: 'damage', mode: 'pct', value: 0.15, where: { any: ['energy'] } }, { op: 'stat', stat: 'xpGain', mode: 'pct', value: 0.1 }] },
  { id: 'petrov', name: 'Gen. Petrov', metaCost: 60, text: 'Explosive weapons +20% damage. Cities take 10% less damage.', effects: [{ op: 'stat', stat: 'damage', mode: 'pct', value: 0.2, where: { any: ['explosive'] } }, { op: 'stat', stat: 'cityArmor', mode: 'add', value: 0.1 }] },
  { id: 'reyes', name: 'QM Reyes', metaCost: 80, salvage: 40, text: 'Starts with 40 salvage. Shop prices -10%.', effects: [{ op: 'stat', stat: 'shopDiscount', mode: 'add', value: 0.1 }] },
  { id: 'kade', name: 'Marshal Kade', metaCost: 100, text: '+2 rerolls, +1 banish, +5% critical chance.', effects: [{ op: 'stat', stat: 'rerolls', mode: 'add', value: 2 }, { op: 'stat', stat: 'banishes', mode: 'add', value: 1 }, { op: 'stat', stat: 'critChance', mode: 'add', value: 0.05 }] },
  { id: 'okafor', name: 'Adm. Okafor', metaCost: 150, text: 'One extra weapon slot from the start.', effects: [{ op: 'stat', stat: 'slots', mode: 'add', value: 1 }] },
];

/** Content ids (weapons, passives, relics) locked behind a meta unlock. */
export const CONTENT_GATES: Record<string, string[]> = {
  content_gravity: ['gravity_well', 'singularity', 'tidal_ring'],
  content_heavy: ['nuke_silo', 'lance_platform', 'storm_sat'],
};

export const UNLOCKS: readonly UnlockDef[] = [
  { id: 'ability_slot_2', name: 'Second Ability Slot', kind: 'abilitySlot', cost: 120, text: 'Carry two active abilities into every run.' },
  { id: 'ab_tractor_jammer', name: 'Tractor Jammer', kind: 'ability', grants: 'tractor_jammer', cost: 40, text: 'Unlock the Tractor Jammer ability.' },
  { id: 'ab_emergency_shield', name: 'Emergency Shield', kind: 'ability', grants: 'emergency_shield', cost: 50, text: 'Unlock the Emergency Shield ability.' },
  { id: 'ab_orbital_strike', name: 'Orbital Strike', kind: 'ability', grants: 'orbital_strike', cost: 60, text: 'Unlock the Orbital Strike ability.' },
  { id: 'ab_repair_swarm', name: 'Repair Swarm', kind: 'ability', grants: 'repair_swarm', cost: 70, text: 'Unlock the Repair Swarm ability.' },
  { id: 'ab_global_emp', name: 'Global EMP', kind: 'ability', grants: 'global_emp', cost: 80, text: 'Unlock the Global EMP ability.' },
  { id: 'ab_overclock', name: 'Overclock', kind: 'ability', grants: 'overclock', cost: 90, text: 'Unlock the Overclock ability.' },
  { id: 'ab_time_dilation', name: 'Time Dilation', kind: 'ability', grants: 'time_dilation', cost: 110, text: 'Unlock the Time Dilation ability.' },
  { id: 'ab_kinetic_barrage', name: 'Kinetic Barrage', kind: 'ability', grants: 'kinetic_barrage', cost: 140, text: 'Unlock the Kinetic Barrage ability.' },
  { id: 'cmd_ishikawa', name: 'Dr. Ishikawa', kind: 'commander', grants: 'ishikawa', cost: 60, text: 'Energy specialist commander.' },
  { id: 'cmd_petrov', name: 'Gen. Petrov', kind: 'commander', grants: 'petrov', cost: 60, text: 'Explosives and civil defense commander.' },
  { id: 'cmd_reyes', name: 'QM Reyes', kind: 'commander', grants: 'reyes', cost: 80, text: 'Logistics commander: salvage and discounts.' },
  { id: 'cmd_kade', name: 'Marshal Kade', kind: 'commander', grants: 'kade', cost: 100, text: 'Tactical commander: rerolls and crits.' },
  { id: 'cmd_okafor', name: 'Adm. Okafor', kind: 'commander', grants: 'okafor', cost: 150, text: 'Fleet commander: an extra weapon slot.' },
  { id: 'sw_gatling_ring', name: 'Start: Gatling Ring', kind: 'startWeapon', grants: 'gatling_ring', cost: 25, text: 'Gatling Ring can be a starting weapon.' },
  { id: 'sw_photon_battery', name: 'Start: Photon Battery', kind: 'startWeapon', grants: 'photon_battery', cost: 25, text: 'Photon Battery can be a starting weapon.' },
  { id: 'sw_ion_battery', name: 'Start: Ion Battery', kind: 'startWeapon', grants: 'ion_battery', cost: 25, text: 'Ion Battery can be a starting weapon.' },
  { id: 'sw_interceptor_wing', name: 'Start: Interceptor Wing', kind: 'startWeapon', grants: 'interceptor_wing', cost: 25, text: 'Interceptor Wing can be a starting weapon.' },
  { id: 'sw_swarm_pods', name: 'Start: Swarm Pods', kind: 'startWeapon', grants: 'swarm_pods', cost: 35, text: 'Swarm Pods can be a starting weapon.' },
  { id: 'sw_howitzer_net', name: 'Start: Howitzer Network', kind: 'startWeapon', grants: 'howitzer_net', cost: 35, text: 'Howitzer Network can be a starting weapon.' },
  { id: 'sw_hunter_drones', name: 'Start: Hunter Drones', kind: 'startWeapon', grants: 'hunter_drones', cost: 35, text: 'Hunter Drones can be a starting weapon.' },
  { id: 'sw_plasma_mortar', name: 'Start: Plasma Mortar', kind: 'startWeapon', grants: 'plasma_mortar', cost: 35, text: 'Plasma Mortar can be a starting weapon.' },
  { id: 'content_gravity', name: 'Gravity Research', kind: 'content', cost: 70, text: 'Gravity Well, Singularity Projector and Tidal Ring join the weapon pool.' },
  { id: 'content_heavy', name: 'Heavy Weapons Program', kind: 'content', cost: 90, text: 'Nuke Silo, Solar Lance and Storm Satellite join the weapon pool.' },
  { id: 'content_passives2', name: 'Advanced Systems', kind: 'content', cost: 60, text: 'Eight advanced passives join the upgrade pool.' },
  { id: 'content_relics2', name: 'Black Projects', kind: 'content', cost: 100, text: 'Six rare relics join the shop.' },
];

/** Command points awarded at the end of a run. */
export function runReward(wave: number, kills: number, bosses: number): number {
  return Math.round(wave * 4 + kills / 12 + bosses * 15);
}
