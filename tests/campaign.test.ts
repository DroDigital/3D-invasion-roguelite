import { describe, expect, it } from 'vitest';
import { Game, STEP } from '../src/sim/game';
import { alienIndex, ALIENS } from '../src/data/aliens';
import { spawnAlien } from '../src/sim/aliens';
import { CITIES } from '../src/data/cities';
import { FINAL_WAVE } from '../src/data/campaign';
import { selectTargets, setTargetFocus } from '../src/sim/targeting';
import { damageCity } from '../src/sim/damage';

function fresh(seed: string, threat = 0): Game {
  const g = new Game({ seed, threat });
  while (g.offer) g.choose(0);
  return g;
}

describe('campaign', () => {
  it('the final wave brings the World-Eater, and clearing it wins the run', () => {
    const g = fresh('FINAL');
    g.wave = FINAL_WAVE - 1;
    g.phaseTimer = 0;
    g.step(STEP);
    expect(g.wave).toBe(FINAL_WAVE);
    expect(g.spawnQueue.some((q) => ALIENS[q.def].id === 'final_worldeater')).toBe(true);
    // Skip the fight: nothing left in the sky.
    g.spawnQueue.length = 0;
    for (let i = 0; i < g.enemies.high; i++) g.enemies.kill(i);
    g.phase = 'clearing';
    g.step(STEP);
    expect(g.phase).toBe('victory');
    expect(g.won).toBe(true);
    expect(g.paused).toBe(true);
    g.continueEndless();
    expect(g.endless).toBe(true);
    expect(g.phase).toBe('shop');
  });

  it('threat levels toughen aliens', () => {
    const a = fresh('THR', 0);
    const b = fresh('THR', 5);
    const idx = alienIndex('greys_invader');
    const i = spawnAlien(a, idx, 0, 3, 0, 0, 0, a.combatRng);
    const j = spawnAlien(b, idx, 0, 3, 0, 0, 0, b.combatRng);
    expect(b.enemies.maxHp[j]).toBeGreaterThan(a.enemies.maxHp[i] * 1.15);
  });
});

describe('operations', () => {
  it('the depot offers a standard patrol and riskier operations that add directives and pay on clear', () => {
    const g = fresh('OPS');
    g.wave = 8;
    g.onWaveCleared();
    expect(g.ops.length).toBe(3);
    expect(g.ops[0].risk).toBe(0);
    expect(g.ops[2].directives.length).toBe(2);
    g.chooseOp(2);
    const op = g.ops[2];
    g.leaveShop();
    while (g.offer) g.choose(0);
    g.phaseTimer = 0;
    g.step(STEP);
    for (const d of op.directives) expect(g.directives).toContain(d);
    const salvage = g.salvage;
    const level = g.level;
    g.spawnQueue.length = 0;
    for (let i = 0; i < g.enemies.high; i++) g.enemies.kill(i);
    g.phase = 'clearing';
    g.step(STEP);
    expect(g.salvage > salvage || g.level > level || g.items.length > 0 || g.relicOwed || g.log.some((l) => l.text.includes('COMPLETE'))).toBe(true);
  });
});

describe('focus beacon and city perks', () => {
  it('a focus beacon makes weapons engage aliens under it first', () => {
    const g = fresh('FOCUS');
    g.wave = 5;
    const idx = alienIndex('greys_invader');
    // One alien nearly on a city (normally first), one far from it under the beacon.
    const c = g.cities;
    spawnAlien(g, idx, 0, c.pos[0] * 1.05, c.pos[1] * 1.05, c.pos[2] * 1.05, 0, g.combatRng, { quiet: true });
    const far = spawnAlien(g, idx, 0, -c.pos[0] * 2.5, -c.pos[1] * 2.5, -c.pos[2] * 2.5, 0, g.combatRng, { quiet: true });
    const out = new Int16Array(4);
    setTargetFocus(true, -c.pos[0], -c.pos[1], -c.pos[2]);
    selectTargets('nearestToCity', 1, g.enemies, c, g.combatRng, out);
    setTargetFocus(false);
    expect(out[0]).toBe(far);
  });

  it('cities give perks while they stand and take them when they fall', () => {
    const g = fresh('PERK');
    const tokyo = CITIES.findIndex((x) => x.id === 'tokyo');
    expect(CITIES[tokyo].perk).toBe('research');
    const before = g.build.xpGain;
    damageCity(g, tokyo, 1e6, true);
    expect(g.cities.health[tokyo]).toBe(0);
    expect(g.build.xpGain).toBeLessThan(before);
    expect(g.perkCount('research')).toBe(CITIES.filter((x) => x.perk === 'research').length - 1);
  });
});
