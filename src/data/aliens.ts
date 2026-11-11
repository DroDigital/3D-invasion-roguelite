import type { AlienDef } from './types';

export const ALIENS: readonly AlienDef[] = [
  {
    id: 'scout_pod',
    name: 'Scout Pod',
    species: 'insectoid',
    role: 'invader',
    hp: 20,
    speed: 0.36,
    movement: 'direct',
    roleParams: { siegeDps: 1.6 },
    model: 'pod',
    scale: 1,
    xp: 1,
    salvage: 1,
    threat: 1,
    minWave: 1,
  },
];

export function alienIndex(id: string): number {
  const i = ALIENS.findIndex((a) => a.id === id);
  if (i < 0) throw new Error(`Unknown alien: ${id}`);
  return i;
}
