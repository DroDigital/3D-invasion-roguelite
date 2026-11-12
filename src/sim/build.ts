import { PROGRESSION } from '../data/progression';
import type { ActionDef, Effect, Rule, StatId, Tag, TagQuery, UpgradeDef } from '../data/types';
import { OwnedWeapon, tierOf } from './weapons';

const NO_TAGS: readonly Tag[] = [];

export function matches(q: TagQuery | undefined, tags: readonly Tag[]): boolean {
  if (!q) return true;
  if (q.all) for (let i = 0; i < q.all.length; i++) if (!tags.includes(q.all[i])) return false;
  if (q.none) for (let i = 0; i < q.none.length; i++) if (tags.includes(q.none[i])) return false;
  if (q.any) {
    for (let i = 0; i < q.any.length; i++) if (tags.includes(q.any[i])) return true;
    return false;
  }
  return true;
}

export type TriggerOn = Extract<Effect, { op: 'trigger' }>['on'];

export interface Trigger {
  chance: number;
  where?: TagQuery;
  action: ActionDef;
}

/** Everything the player has picked up (passives, relics, commander perks), and the stats derived from it. */
export class Build {
  /** Owned upgrades in pick order. */
  readonly owned: UpgradeDef[] = [];
  /** Effects that are always on (commander perks). */
  readonly innate: Effect[] = [];
  private stacks = new Map<string, number>();
  readonly rules = new Set<Rule>();
  readonly triggers: Record<TriggerOn, Trigger[]> = {
    kill: [], hit: [], crit: [], waveStart: [], cityHit: [], levelUp: [], abilityUse: [],
  };
  // Global derived stats.
  xpGain = 1;
  salvageGain = 1;
  cityArmor = 0;
  cityRegen = 0;
  cityDamageTaken = 1;
  enemySpeed = 1;
  abilityCooldown = 1;
  shopDiscount = 0;
  abductRecovery = 0;
  /** Multiplier on defense module and consumable damage. */
  defenseDamage = 1;
  choices: number = PROGRESSION.choices;

  stacksOf(id: string): number {
    return this.stacks.get(id) ?? 0;
  }

  add(def: UpgradeDef): void {
    const n = this.stacksOf(def.id);
    if (n === 0) this.owned.push(def);
    this.stacks.set(def.id, n + 1);
  }

  /** (base + sum add) * (1 + sum pct) * product mul over every matching stat effect. */
  resolve(stat: StatId, base: number, tags: readonly Tag[]): number {
    let add = 0;
    let pct = 0;
    let mul = 1;
    const apply = (e: Effect, n: number): void => {
      if (e.op !== 'stat' || e.stat !== stat || !matches(e.where, tags)) return;
      if (e.mode === 'add') add += e.value * n;
      else if (e.mode === 'pct') pct += e.value * n;
      else mul *= Math.pow(e.value, n);
    };
    for (const e of this.innate) apply(e, 1);
    for (const u of this.owned) {
      const n = this.stacksOf(u.id);
      for (const e of u.effects) apply(e, n);
    }
    return (base + add) * Math.max(0, 1 + pct) * mul;
  }

  /** Global (untagged) stat, e.g. extra slots or rerolls granted so far. */
  global(stat: StatId, base = 0): number {
    return this.resolve(stat, base, NO_TAGS);
  }

  /** Recompute all derived stats. Call after any pick or tier change, never per frame. */
  recompute(weapons: OwnedWeapon[]): void {
    for (const w of weapons) {
      const t = tierOf(w);
      const tags = w.def.tags;
      const s = w.stats;
      s.damage = this.resolve('damage', t.damage, tags);
      s.fireRate = this.resolve('fireRate', t.fireRate, tags);
      s.targets = Math.max(1, Math.round(this.resolve('targets', t.targets, tags)));
      s.projectileSpeed = this.resolve('projectileSpeed', t.projectileSpeed ?? 4, tags);
      s.critChance = Math.min(1, this.resolve('critChance', 0, tags));
      s.critMult = this.resolve('critMult', PROGRESSION.baseCritMult, tags);
      s.aoe = t.aoe ? this.resolve('aoe', t.aoe, tags) : 0;
      s.pierce = t.pierce !== undefined ? Math.round(this.resolve('pierce', t.pierce, tags)) : 0;
      s.chainJumps = t.chain ? Math.round(this.resolve('chainJumps', t.chain.jumps, tags)) : 0;
      s.chainRange = t.chain?.range ?? 0;
      s.chainFalloff = t.chain?.falloff ?? 1;
      s.fieldRadius = t.field ? this.resolve('aoe', t.field.radius, tags) : 0;
      s.fieldDuration = t.field ? this.resolve('fieldDuration', t.field.duration, tags) : 0;
      s.fieldSlow = t.field?.slow ?? 0;
      s.fieldPull = t.field?.pull ?? 0;
      s.dotDps = t.dot ? this.resolve('dotDps', t.dot.dps, tags) * (s.damage / t.damage) : 0;
      s.dotDuration = t.dot?.duration ?? 0;
      s.split = t.split ?? 0;
      s.execute = t.execute ?? 0;
      s.mark = t.mark ?? 0;
      s.maxHpDamage = t.maxHpDamage ?? 0;
      s.stunChance = t.stun?.chance ?? 0;
      s.stunDuration = t.stun?.duration ?? 0;
      s.slowAmount = t.slow?.amount ?? 0;
      s.slowDuration = t.slow?.duration ?? 0;
      s.shieldDamage = this.resolve('shieldDamage', 1, tags);
      s.bossDamage = this.resolve('bossDamage', 1, tags);
      // Overdrive: endless late-game upgrades for maxed weapons, each a little weaker than the last.
      if (w.overdrive > 0) {
        const od = w.overdrive;
        s.damage *= 1 + 0.12 * od - 0.002 * od * od;
        s.dotDps *= 1 + 0.12 * od - 0.002 * od * od;
        s.fireRate *= 1 + 0.04 * Math.min(od, 15);
      }
    }
    this.xpGain = Math.max(0.1, this.global('xpGain', 1));
    this.salvageGain = Math.max(0.1, this.global('salvageGain', 1));
    this.cityArmor = Math.min(0.85, this.global('cityArmor'));
    this.cityRegen = this.global('cityRegen');
    this.cityDamageTaken = Math.max(0.1, this.global('cityDamageTaken', 1));
    this.enemySpeed = Math.max(0.3, this.global('enemySpeed', 1));
    this.abilityCooldown = Math.max(0.3, this.global('abilityCooldown', 1));
    this.shopDiscount = Math.min(0.6, this.global('shopDiscount'));
    this.abductRecovery = Math.min(1, this.global('abductRecovery'));
    this.choices = Math.min(PROGRESSION.maxChoices, Math.round(this.global('choices', PROGRESSION.choices)));

    this.rules.clear();
    for (const k of Object.keys(this.triggers) as TriggerOn[]) this.triggers[k].length = 0;
    const collect = (e: Effect, n: number): void => {
      if (e.op === 'rule') this.rules.add(e.rule);
      else if (e.op === 'trigger') {
        this.triggers[e.on].push({ chance: Math.min(1, (e.chance ?? 1) * n), where: e.where, action: e.do });
      }
    };
    for (const e of this.innate) collect(e, 1);
    for (const u of this.owned) {
      const n = this.stacksOf(u.id);
      for (const e of u.effects) collect(e, n);
    }
  }
}
