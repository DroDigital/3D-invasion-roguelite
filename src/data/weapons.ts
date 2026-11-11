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
    shot: { color: [3.0, 2.2, 0.8], width: 1, length: 1 },
    targeting: { rule: 'nearestToCity' },
    tiers: [
      { damage: 10, damageType: 'kinetic', fireRate: 1.6, targets: 1, projectileSpeed: 4.5, model: 'railgun_1', emitters: 4 },
      { damage: 14, damageType: 'kinetic', fireRate: 1.9, targets: 1, projectileSpeed: 5.0, model: 'railgun_2', emitters: 5 },
      { damage: 19, damageType: 'kinetic', fireRate: 2.2, targets: 2, projectileSpeed: 5.5, model: 'railgun_3', emitters: 6 },
      { damage: 26, damageType: 'kinetic', fireRate: 2.6, targets: 2, projectileSpeed: 6.0, model: 'railgun_4', emitters: 8 },
      { damage: 36, damageType: 'kinetic', fireRate: 3.0, targets: 3, projectileSpeed: 6.5, model: 'railgun_5', emitters: 10 },
    ],
  },
  {
    id: 'missile_platform',
    name: 'Missile Platform',
    family: 'missile',
    tags: ['explosive', 'orbital', 'single-target'],
    rarity: 'common',
    deploy: 'platform',
    fire: { kind: 'projectile' },
    shot: { color: [3.2, 0.9, 0.3], width: 1.8, length: 0.7 },
    targeting: { rule: 'highestHp' },
    tiers: [
      { damage: 30, damageType: 'explosive', fireRate: 0.55, targets: 1, projectileSpeed: 2.6, model: 'missile_1', emitters: 2 },
      { damage: 42, damageType: 'explosive', fireRate: 0.65, targets: 1, projectileSpeed: 2.8, model: 'missile_2', emitters: 3 },
      { damage: 58, damageType: 'explosive', fireRate: 0.75, targets: 2, projectileSpeed: 3.0, model: 'missile_3', emitters: 3 },
      { damage: 80, damageType: 'explosive', fireRate: 0.9, targets: 2, projectileSpeed: 3.3, model: 'missile_4', emitters: 4 },
      { damage: 110, damageType: 'explosive', fireRate: 1.05, targets: 3, projectileSpeed: 3.6, model: 'missile_5', emitters: 6 },
    ],
  },
  {
    id: 'flak_battery',
    name: 'Flak Battery',
    family: 'artillery',
    tags: ['kinetic', 'ground', 'multi-target'],
    rarity: 'common',
    deploy: 'groundBattery',
    fire: { kind: 'projectile' },
    shot: { color: [1.0, 2.6, 1.4], width: 0.8, length: 0.5 },
    targeting: { rule: 'lowestHp' },
    tiers: [
      { damage: 4, damageType: 'kinetic', fireRate: 2.4, targets: 2, projectileSpeed: 5.0, model: 'flak_1', emitters: 8 },
      { damage: 5.5, damageType: 'kinetic', fireRate: 2.8, targets: 2, projectileSpeed: 5.4, model: 'flak_2', emitters: 10 },
      { damage: 7, damageType: 'kinetic', fireRate: 3.2, targets: 3, projectileSpeed: 5.8, model: 'flak_3', emitters: 12 },
      { damage: 9.5, damageType: 'kinetic', fireRate: 3.6, targets: 3, projectileSpeed: 6.2, model: 'flak_4', emitters: 14 },
      { damage: 13, damageType: 'kinetic', fireRate: 4.0, targets: 4, projectileSpeed: 6.6, model: 'flak_5', emitters: 16 },
    ],
  },
];

export function weaponById(id: string): WeaponDef {
  const w = WEAPONS.find((x) => x.id === id);
  if (!w) throw new Error(`Unknown weapon: ${id}`);
  return w;
}
