import { PROGRESSION } from '../data/progression';
import type { ActionDef, Effect, StatId, Tag, TagQuery, UpgradeDef } from '../data/types';
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

export interface Trigger {
  chance: number;
  where?: TagQuery;
  action: ActionDef;
}

/** Everything the player has picked up, and the stats derived from it. */
export class Build {
  /** Owned upgrades in pick order. */
  readonly owned: UpgradeDef[] = [];
  private stacks = new Map<string, number>();
  xpGain = 1;
  /** Fraction of siege damage ignored. */
  cityArmor = 0;
  /** City health restored per second. */
  cityRegen = 0;
  readonly killTriggers: Trigger[] = [];
  readonly waveTriggers: Trigger[] = [];

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
    for (const u of this.owned) {
      const n = this.stacksOf(u.id);
      for (const e of u.effects) {
        if (e.op !== 'stat' || e.stat !== stat || !matches(e.where, tags)) continue;
        if (e.mode === 'add') add += e.value * n;
        else if (e.mode === 'pct') pct += e.value * n;
        else mul *= Math.pow(e.value, n);
      }
    }
    return (base + add) * (1 + pct) * mul;
  }

  /** Recompute all derived stats. Call after any pick or tier change, never per frame. */
  recompute(weapons: OwnedWeapon[]): void {
    for (const w of weapons) {
      const t = tierOf(w);
      const tags = w.def.tags;
      w.stats.damage = this.resolve('damage', t.damage, tags);
      w.stats.fireRate = this.resolve('fireRate', t.fireRate, tags);
      w.stats.targets = Math.round(this.resolve('targets', t.targets, tags));
      w.stats.projectileSpeed = this.resolve('projectileSpeed', t.projectileSpeed ?? 4, tags);
      w.stats.critChance = Math.min(1, this.resolve('critChance', 0, tags));
      w.stats.critMult = this.resolve('critMult', PROGRESSION.baseCritMult, tags);
    }
    this.xpGain = this.resolve('xpGain', 1, NO_TAGS);
    this.cityArmor = Math.min(0.8, this.resolve('cityArmor', 0, NO_TAGS));
    this.cityRegen = this.resolve('cityRegen', 0, NO_TAGS);

    this.killTriggers.length = 0;
    this.waveTriggers.length = 0;
    for (const u of this.owned) {
      const n = this.stacksOf(u.id);
      for (const e of u.effects as Effect[]) {
        if (e.op !== 'trigger') continue;
        const t: Trigger = { chance: Math.min(1, (e.chance ?? 1) * n), where: e.where, action: e.do };
        (e.on === 'kill' ? this.killTriggers : this.waveTriggers).push(t);
      }
    }
  }
}
