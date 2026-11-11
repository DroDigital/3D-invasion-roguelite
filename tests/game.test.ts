import { describe, expect, it } from 'vitest';
import { Game, STEP } from '../src/sim/game';
import { WEAPONS } from '../src/data/weapons';
import { ALIENS } from '../src/data/aliens';
import { PASSIVES, passiveById } from '../src/data/passives';
import { weaponById } from '../src/data/weapons';
import { Build } from '../src/sim/build';
import { Arsenal } from '../src/sim/weapons';

/** Plays a run, always taking the first card. `disarm` strips weapons to force a loss. */
function run(seed: string, steps: number, disarm = false): Game {
  const g = new Game(seed);
  for (let i = 0; i < steps; i++) {
    while (g.offer) g.choose(0);
    if (disarm) g.arsenal.weapons.length = 0;
    g.step(STEP);
  }
  return g;
}

describe('game sim', () => {
  it('is deterministic for a seed', () => {
    const a = run('DET1', 60 * 90);
    const b = run('DET1', 60 * 90);
    expect(a.digest()).toBe(b.digest());
    expect(a.kills).toBe(b.kills);
    expect(a.wave).toBe(b.wave);
  });

  it('diverges across seeds', () => {
    expect(run('DET1', 60 * 40).digest()).not.toBe(run('DET2', 60 * 40).digest());
  });

  it('the starting weapon kills enemies and tracks its damage', () => {
    const g = run('KILL', 60 * 60);
    expect(g.wave).toBeGreaterThanOrEqual(2);
    expect(g.kills).toBeGreaterThan(5);
    expect(g.arsenal.weapons[0].damageDealt).toBeGreaterThan(0);
    expect(g.arsenal.weapons.reduce((a, w) => a + w.kills, 0)).toBe(g.kills);
  });

  it('undefended, cities take damage and the run ends', () => {
    const g = run('LOSE', 60 * 60 * 12, true);
    expect(g.phase).toBe('gameover');
    expect(g.cities.totalPopulation()).toBeLessThan(g.cities.startPopulation * 0.25);
  });

  it('never leaves pending damage on dead targets or leaks projectiles', () => {
    const g = run('LEAK', 60 * 120);
    for (let i = 0; i < g.enemies.high; i++) {
      if (g.enemies.alive[i]) expect(g.enemies.pending[i]).toBeGreaterThanOrEqual(-1e-3);
    }
    expect(g.projectiles.count).toBeLessThan(100);
  });
});

describe('progression', () => {
  it('opens with a choice of three starting weapons and stays paused until one is picked', () => {
    const g = new Game('START');
    expect(g.offer?.length).toBe(3);
    expect(g.offer!.every((o) => o.kind === 'weapon')).toBe(true);
    g.step(STEP);
    expect(g.time).toBe(0);
    g.choose(1);
    expect(g.arsenal.weapons.length).toBe(1);
    expect(g.offer).toBeNull();
  });

  it('kills grant XP and level-ups offer distinct choices', () => {
    const g = new Game('LEVEL');
    g.choose(0);
    for (let i = 0; i < 60 * 60 && !g.offer; i++) g.step(STEP);
    expect(g.level).toBe(2);
    expect(g.offerKind).toBe('levelup');
    expect(new Set(g.offer!.map((o) => o.key)).size).toBe(g.offer!.length);
  });

  it('rerolls and banishes are limited, and a banished option never returns', () => {
    const g = new Game('BAN');
    g.choose(0);
    for (let i = 0; i < 60 * 60 && !g.offer; i++) g.step(STEP);
    const idx = g.offer!.findIndex((o) => o.kind !== 'tier');
    const key = g.offer![idx].key;
    g.banish(idx);
    expect(g.banishes).toBe(1);
    for (let i = 0; i < 10; i++) g.reroll();
    expect(g.rerolls).toBe(0);
    for (let i = 0; i < 60 * 240; i++) {
      if (g.offer) {
        expect(g.offer.some((o) => o.key === key)).toBe(false);
        g.choose(0);
      }
      g.step(STEP);
    }
  });

  it('applies stat effects by tag and stacks them', () => {
    const b = new Build();
    const a = new Arsenal();
    const rail = a.add(weaponById('railgun_sat'))!;
    const missile = a.add(weaponById('missile_platform'))!;
    b.add(passiveById('tungsten_cores'));
    b.add(passiveById('tungsten_cores'));
    b.add(passiveById('targeting_uplink'));
    b.recompute(a.weapons);
    expect(rail.stats.damage).toBeCloseTo(10 * 1.4);
    expect(missile.stats.damage).toBeCloseTo(30);
    expect(rail.stats.targets).toBe(2);
  });
});

describe('content tables', () => {
  it('has at least 10 upgrades with unique ids and sane stacks', () => {
    expect(PASSIVES.length).toBeGreaterThanOrEqual(10);
    expect(new Set(PASSIVES.map((p) => p.id)).size).toBe(PASSIVES.length);
    for (const p of PASSIVES) {
      expect(p.maxStacks).toBeGreaterThan(0);
      expect(p.effects.length).toBeGreaterThan(0);
    }
  });
  it('weapons have 5 tiers with unique models', () => {
    for (const w of WEAPONS) {
      expect(w.tiers.length).toBe(5);
      expect(new Set(w.tiers.map((t) => t.model)).size).toBe(5);
    }
  });
  it('alien ids are unique', () => {
    expect(new Set(ALIENS.map((a) => a.id)).size).toBe(ALIENS.length);
  });
});
