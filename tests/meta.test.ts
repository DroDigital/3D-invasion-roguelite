import { beforeEach, describe, expect, it } from 'vitest';
import { abilitySlots, buyUnlock, defaultProfile, loadProfile, saveProfile, unlockedAbilities, unlockedCommanders } from '../src/core/save';
import { runReward, UNLOCKS } from '../src/data/meta';
import { Game } from '../src/sim/game';
import { BASE_WEAPONS } from '../src/data/weapons';

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null { return this.m.get(k) ?? null; }
  setItem(k: string, v: string): void { this.m.set(k, v); }
  removeItem(k: string): void { this.m.delete(k); }
}

describe('meta progression', () => {
  beforeEach(() => {
    (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();
  });

  it('a fresh profile has no abilities, one slot and the default commander', () => {
    const p = loadProfile();
    expect(unlockedAbilities(p)).toEqual([]);
    expect(abilitySlots(p)).toBe(1);
    expect(unlockedCommanders(p)).toEqual(['vance']);
  });

  it('spends points on unlocks, persists them, and refuses what it cannot afford', () => {
    const p = defaultProfile();
    p.points = 100;
    expect(buyUnlock(p, 'ab_global_emp')).toBe(true);
    expect(p.points).toBe(20);
    expect(p.loadout).toEqual(['global_emp']);
    expect(buyUnlock(p, 'ab_global_emp')).toBe(false);
    expect(buyUnlock(p, 'ability_slot_2')).toBe(false);
    saveProfile(p);
    const q = loadProfile();
    expect(q.unlocks).toContain('ab_global_emp');
    expect(q.points).toBe(20);
  });

  it('runs award more points for going further', () => {
    expect(runReward(10, 300, 2)).toBeGreaterThan(runReward(5, 100, 0));
    expect(runReward(1, 0, 0)).toBeGreaterThan(0);
  });

  it('content unlocks gate weapons out of the offer pool until bought', () => {
    const locked = new Game({ seed: 'GATE' });
    const open = new Game({ seed: 'GATE', unlocks: ['content_gravity'] });
    expect(locked.isUnlocked('singularity')).toBe(false);
    expect(open.isUnlocked('singularity')).toBe(true);
    expect(locked.isUnlocked('railgun_sat')).toBe(true);
  });

  it('commanders apply their perks and abilities load into slots', () => {
    const g = new Game({ seed: 'CMD', commander: 'okafor', abilities: ['global_emp', 'overclock'], abilitySlots: 1 });
    expect(g.arsenal.slots).toBe(7);
    expect(g.abilities.map((a) => a.def.id)).toEqual(['global_emp']);
  });

  it('every unlock is well-formed', () => {
    for (const u of UNLOCKS) {
      expect(u.cost).toBeGreaterThan(0);
      if (u.kind === 'startWeapon') expect(BASE_WEAPONS.some((w) => w.id === u.grants)).toBe(true);
    }
  });
});
