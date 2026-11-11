import { describe, expect, it } from 'vitest';
import { Game, STEP } from '../src/sim/game';
import { WEAPONS } from '../src/data/weapons';
import { ALIENS } from '../src/data/aliens';

function run(seed: string, steps: number, disarm = false): Game {
  const g = new Game(seed);
  if (disarm) g.arsenal.weapons.length = 0;
  for (let i = 0; i < steps; i++) g.step(STEP);
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
    expect(g.arsenal.weapons[0].kills).toBe(g.kills);
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

describe('content tables', () => {
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
