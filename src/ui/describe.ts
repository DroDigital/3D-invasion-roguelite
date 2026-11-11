import type { Effect, StatId, TagQuery, UpgradeDef, WeaponDef, WeaponTier } from '../data/types';

const STAT_NAME: Record<StatId, string> = {
  damage: 'damage', fireRate: 'fire rate', projectileSpeed: 'projectile speed', targets: 'targets per volley',
  critChance: 'critical chance', critMult: 'critical damage', aoe: 'area radius', pierce: 'pierce',
  chainJumps: 'chain jumps', fieldDuration: 'field duration', dotDps: 'burn damage', shieldDamage: 'damage to shields',
  bossDamage: 'damage to bosses', xpGain: 'XP gained', salvageGain: 'salvage gained', cityArmor: 'damage to cities',
  cityRegen: 'city repair per second', cityDamageTaken: 'damage taken by cities', enemySpeed: 'alien speed',
  abilityCooldown: 'ability cooldowns', shopDiscount: 'shop prices', slots: 'weapon slots', rerolls: 'rerolls',
  banishes: 'banishes', choices: 'level-up choices', abductRecovery: 'of abducted people recovered on escape',
};

function scope(q?: TagQuery): string {
  if (!q) return '';
  const parts: string[] = [];
  if (q.any) parts.push(q.any.join('/'));
  if (q.all) parts.push(q.all.join('+'));
  if (q.none) parts.push(`non-${q.none.join('/')}`);
  return ` (${parts.join(', ')})`;
}

const pct = (v: number): string => `${Math.round(v * 100)}%`;
const sign = (v: number): string => (v >= 0 ? '+' : '-');

/** Card text generated from the effect data, so tables never carry prose. */
export function describeEffect(e: Effect): string {
  if (e.op === 'rule') return '';
  if (e.op === 'stat') {
    const name = STAT_NAME[e.stat];
    const w = scope(e.where);
    if (e.stat === 'cityArmor') return `-${pct(e.value)} ${name}`;
    if (e.stat === 'shopDiscount') return `-${pct(e.value)} ${name}`;
    if (e.stat === 'abductRecovery') return `${pct(e.value)} ${name}`;
    if (e.mode === 'add') return e.stat === 'critChance' ? `${sign(e.value)}${pct(Math.abs(e.value))} ${name}${w}` : e.stat === 'critMult' ? `+${pct(e.value)} ${name}${w}` : `${sign(e.value)}${Math.abs(e.value)} ${name}${w}`;
    if (e.mode === 'pct') return `${sign(e.value)}${pct(Math.abs(e.value))} ${name}${w}`;
    return `x${e.value} ${name}${w}`;
  }
  const when = {
    kill: 'On kill', hit: 'On hit', crit: 'On critical', waveStart: 'Each wave', cityHit: 'When a city is hit',
    levelUp: 'On level-up', abilityUse: 'On ability use',
  }[e.on] + (e.where ? scope(e.where) : '');
  const chance = e.chance !== undefined && e.chance < 1 ? ` (${pct(e.chance)})` : '';
  const a = e.do;
  const what =
    a.kind === 'explode' ? `explode for ${pct(a.damageMul)} weapon damage`
    : a.kind === 'zap' ? `arc to ${a.jumps} aliens for ${pct(a.damageMul)} damage`
    : a.kind === 'stunArea' ? `stun nearby aliens ${a.duration}s`
    : a.kind === 'healCities' ? `repair every city +${a.amount}`
    : a.kind === 'healCity' ? `repair the targeted city +${a.amount}`
    : a.kind === 'salvage' ? `+${a.amount} salvage`
    : a.kind === 'cooldown' ? `abilities recharge ${a.seconds}s`
    : `+${a.amount} XP`;
  return `${when}${chance}: ${what}`;
}

export function describeUpgrade(u: UpgradeDef): string[] {
  const lines = u.effects.map(describeEffect).filter(Boolean);
  if (u.text) lines.unshift(u.text);
  return lines;
}

const RULE: Record<string, string> = {
  nearestToCity: 'closest to a city', highestHp: 'toughest', lowestHp: 'weakest', abductorsFirst: 'abductors first',
  saboteursFirst: 'saboteurs first', fastest: 'fastest', densest: 'densest cluster', bossFirst: 'bosses first', random: 'random',
};
const DEPLOY: Record<string, string> = {
  satRing: 'Satellite ring', platform: 'Orbital platforms', groundBattery: 'Ground battery network', droneWing: 'Drone wings',
};
const FIRE: Record<string, string> = {
  projectile: 'homing rounds', beam: 'instant beam', lineBeam: 'piercing line beam', chain: 'chain lightning',
  field: 'gravity field', drone: 'retargeting drones', nova: 'planet-wide pulse',
};

const n = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1));

function extras(t: WeaponTier): string[] {
  const out: string[] = [];
  if (t.aoe) out.push(`AREA ${n(t.aoe * 100)}`);
  if (t.pierce) out.push(`PIERCE ${t.pierce}`);
  if (t.split) out.push(`SPLIT ${t.split}`);
  if (t.chain) out.push(`CHAIN ${t.chain.jumps}`);
  if (t.field) out.push(`FIELD ${n(t.field.duration)}s SLOW ${pct(t.field.slow)}`);
  if (t.dot) out.push(`BURN ${n(t.dot.dps)}/s`);
  if (t.stun) out.push(`STUN ${pct(t.stun.chance)}`);
  if (t.slow) out.push(`SLOW ${pct(t.slow.amount)}`);
  if (t.mark) out.push(`MARK +${pct(t.mark)}`);
  if (t.execute) out.push(`EXECUTE <${pct(t.execute)}`);
  if (t.maxHpDamage) out.push(`${pct(t.maxHpDamage)} MAX HP`);
  return out;
}

export function describeWeapon(w: WeaponDef, tier = 0): string[] {
  const t = w.tiers[tier];
  const lines = [
    `${DEPLOY[w.deploy]}, ${FIRE[w.fire]}. Targets: ${RULE[w.targeting.rule]}.`,
    `DMG ${n(t.damage)}  //  ${n(t.fireRate)}/s  //  x${t.targets}  //  ${w.damageType.toUpperCase()}`,
  ];
  const x = extras(t);
  if (x.length) lines.push(x.join('  //  '));
  return lines;
}

/** Stat changes when a weapon goes from tier index `to - 1` to `to`. */
export function describeTierUp(w: WeaponDef, to: number): string[] {
  const a = w.tiers[to - 1];
  const b = w.tiers[to];
  const out = [`DMG ${n(a.damage)} > ${n(b.damage)}  //  RATE ${n(a.fireRate)} > ${n(b.fireRate)}/s`];
  const more: string[] = [];
  if (b.targets !== a.targets) more.push(`TARGETS ${a.targets} > ${b.targets}`);
  if (b.emitters !== a.emitters) more.push(`EMITTERS ${a.emitters} > ${b.emitters}`);
  if (b.pierce !== a.pierce && b.pierce) more.push(`PIERCE ${a.pierce} > ${b.pierce}`);
  if (b.chain && a.chain && b.chain.jumps !== a.chain.jumps) more.push(`CHAIN ${a.chain.jumps} > ${b.chain.jumps}`);
  if (more.length) out.push(more.join('  //  '));
  out.push('New deployment model.');
  return out;
}
