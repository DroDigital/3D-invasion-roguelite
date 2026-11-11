import type { AbilityDef } from './types';

export const ABILITIES: readonly AbilityDef[] = [
  { id: 'orbital_strike', name: 'Orbital Strike', cooldown: 60, targeting: 'point', action: { kind: 'strike', radius: 0.28, damage: 900 }, metaCost: 60, shopPrice: 140, sfx: 'explode_big', text: 'Click the globe: a kinetic rod obliterates everything near that point.' },
  { id: 'global_emp', name: 'Global EMP', cooldown: 90, targeting: 'none', action: { kind: 'stunAll', duration: 3 }, metaCost: 80, shopPrice: 160, sfx: 'emp', text: 'Every alien ship is stunned for 3 seconds.' },
  { id: 'emergency_shield', name: 'Emergency Shield', cooldown: 75, targeting: 'city', action: { kind: 'cityShield', duration: 12 }, metaCost: 50, shopPrice: 120, sfx: 'shield', text: 'Click a city: it takes no damage and loses no people for 12 seconds.' },
  { id: 'time_dilation', name: 'Time Dilation', cooldown: 100, targeting: 'none', action: { kind: 'timeScale', scale: 0.35, duration: 8 }, metaCost: 110, shopPrice: 180, sfx: 'ability', text: 'Aliens move and attack at 35% speed for 8 seconds. Your weapons do not.' },
  { id: 'overclock', name: 'Overclock', cooldown: 70, targeting: 'none', action: { kind: 'overclock', mul: 2, duration: 8 }, metaCost: 90, shopPrice: 150, sfx: 'ability', text: 'Every weapon fires twice as fast for 8 seconds.' },
  { id: 'tractor_jammer', name: 'Tractor Jammer', cooldown: 45, targeting: 'none', action: { kind: 'dropCargo', stun: 2.5 }, metaCost: 40, shopPrice: 100, sfx: 'emp', text: 'Abductors drop everyone they are carrying and stall for 2.5 s; saboteurs detach.' },
  { id: 'repair_swarm', name: 'Repair Swarm', cooldown: 90, targeting: 'none', action: { kind: 'repairAll', amount: 35 }, metaCost: 70, shopPrice: 130, sfx: 'shield', text: 'Every surviving city regains 35 defense.' },
  { id: 'kinetic_barrage', name: 'Kinetic Barrage', cooldown: 120, targeting: 'none', action: { kind: 'barrage', maxHpFrac: 0.35 }, metaCost: 140, shopPrice: 200, sfx: 'explode_big', text: 'Every non-boss alien loses 35% of its maximum health.' },
];

export function abilityById(id: string): AbilityDef {
  const a = ABILITIES.find((x) => x.id === id);
  if (!a) throw new Error(`Unknown ability: ${id}`);
  return a;
}
