import type { Effect, StatId, TagQuery, UpgradeDef, WeaponDef } from '../data/types';

const STAT_NAME: Record<StatId, string> = {
  damage: 'damage',
  fireRate: 'fire rate',
  projectileSpeed: 'projectile speed',
  targets: 'targets per volley',
  critChance: 'critical chance',
  critMult: 'critical damage',
  xpGain: 'XP gained',
  cityArmor: 'siege damage to cities',
  cityRegen: 'city repair per second',
};

function scope(q?: TagQuery): string {
  if (!q) return '';
  const parts: string[] = [];
  if (q.any) parts.push(q.any.join(' or '));
  if (q.all) parts.push(q.all.join(' and '));
  if (q.none) parts.push(`not ${q.none.join(', ')}`);
  return ` for ${parts.join(', ')} weapons`;
}

const pct = (v: number): string => `${Math.round(v * 100)}%`;

/** Human-readable text generated from the effect data, so tables never carry prose. */
export function describeEffect(e: Effect): string {
  if (e.op === 'stat') {
    if (e.stat === 'cityArmor') return `-${pct(e.value)} ${STAT_NAME[e.stat]}`;
    if (e.stat === 'critChance') return `+${pct(e.value)} ${STAT_NAME[e.stat]}${scope(e.where)}`;
    if (e.mode === 'add') return `+${e.value} ${STAT_NAME[e.stat]}${scope(e.where)}`;
    if (e.mode === 'pct') return `+${pct(e.value)} ${STAT_NAME[e.stat]}${scope(e.where)}`;
    return `x${e.value} ${STAT_NAME[e.stat]}${scope(e.where)}`;
  }
  const when = e.on === 'kill' ? `On kill${scope(e.where).replace(' for ', ' by ')}` : 'At wave start';
  const chance = e.chance !== undefined && e.chance < 1 ? `, ${pct(e.chance)} chance` : '';
  const a = e.do;
  const what =
    a.kind === 'explode' ? `explode for ${pct(a.damageMul)} weapon damage in an area`
    : a.kind === 'healCities' ? `repair every city by ${a.amount}`
    : `gain ${a.amount} XP`;
  return `${when}${chance}: ${what}`;
}

export function describeUpgrade(u: UpgradeDef): string[] {
  return u.effects.map(describeEffect);
}

const RULE: Record<string, string> = {
  nearestToCity: 'closest to a city',
  highestHp: 'toughest target',
  lowestHp: 'weakest target',
};
const DEPLOY: Record<string, string> = {
  satRing: 'Satellite ring',
  platform: 'Orbital platforms',
  groundBattery: 'Ground battery network',
  droneWing: 'Drone wings',
};

const n = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1));

export function describeWeapon(w: WeaponDef): string[] {
  const t = w.tiers[0];
  return [
    `${DEPLOY[w.deploy]}. Targets: ${RULE[w.targeting.rule]}.`,
    `DMG ${n(t.damage)}  //  RATE ${n(t.fireRate)}/s  //  TARGETS ${t.targets}`,
  ];
}

/** Stat changes when a weapon goes from tier index `to - 1` to `to`. */
export function describeTierUp(w: WeaponDef, to: number): string[] {
  const a = w.tiers[to - 1];
  const b = w.tiers[to];
  const out = [`DMG ${n(a.damage)} > ${n(b.damage)}  //  RATE ${n(a.fireRate)} > ${n(b.fireRate)}/s`];
  const extra: string[] = [];
  if (b.targets !== a.targets) extra.push(`TARGETS ${a.targets} > ${b.targets}`);
  if (b.emitters !== a.emitters) extra.push(`EMITTERS ${a.emitters} > ${b.emitters}`);
  if (extra.length) out.push(extra.join('  //  '));
  return out;
}
