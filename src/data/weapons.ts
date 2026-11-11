import type { WeaponDef } from './types';

export const WEAPONS: readonly WeaponDef[] = [
  {
    id: 'railgun_sat',
    name: 'Railgun Satellite',
    family: 'kinetic',
    tags: ['kinetic', 'orbital', 'single-target'],
    rarity: 'common',
    deploy: 'satRing',
    fire: { kind: 'projectile' },
    targeting: { rule: 'nearestToCity' },
    tiers: [
      { damage: 10, damageType: 'kinetic', fireRate: 1.6, targets: 1, projectileSpeed: 4.5, model: 'railgun_1', emitters: 4 },
      { damage: 14, damageType: 'kinetic', fireRate: 1.9, targets: 1, projectileSpeed: 5.0, model: 'railgun_2', emitters: 5 },
      { damage: 19, damageType: 'kinetic', fireRate: 2.2, targets: 2, projectileSpeed: 5.5, model: 'railgun_3', emitters: 6 },
      { damage: 26, damageType: 'kinetic', fireRate: 2.6, targets: 2, projectileSpeed: 6.0, model: 'railgun_4', emitters: 8 },
      { damage: 36, damageType: 'kinetic', fireRate: 3.0, targets: 3, projectileSpeed: 6.5, model: 'railgun_5', emitters: 10 },
    ],
  },
];

export function weaponById(id: string): WeaponDef {
  const w = WEAPONS.find((x) => x.id === id);
  if (!w) throw new Error(`Unknown weapon: ${id}`);
  return w;
}
