import { describe, expect, it } from 'vitest';
import { Game, STEP } from '../src/sim/game';
import { alienIndex, ALIENS, SPECIES } from '../src/data/aliens';
import { spawnAlien } from '../src/sim/aliens';
import { defenseById, DEFENSES } from '../src/data/defenses';
import { consumableById, CONSUMABLES } from '../src/data/consumables';
import { addItem } from '../src/sim/consumables';
import { fireEnemyShot, SHOT_PLASMA } from '../src/sim/hostile';
import { liveFraction, hitEmitter } from '../src/sim/defense';
import { gainKillSalvage } from '../src/sim/damage';
import { weaponById } from '../src/data/weapons';
import { ROLE_TENTACLE, ST_ATTACHED } from '../src/sim/enemies';
import { rollOffers } from '../src/sim/offers';

/** A run past the opening picks, waves held so tests can stage fights. */
function staged(seed: string, wave = 12): Game {
  const g = new Game(seed);
  while (g.offer) g.choose(0);
  g.wave = wave;
  // Intermission with a frozen countdown: the sim runs but no wave starts or ends.
  g.phase = 'intermission';
  g.phaseTimer = 1e9;
  return g;
}

function steps(g: Game, n: number): void {
  for (let i = 0; i < n; i++) {
    g.step(STEP);
    g.fxCount = 0;
  }
}

describe('late war systems', () => {
  it('ships a new species, horrors, gunships, defenses, consumables and directives', () => {
    expect(SPECIES.some((s) => s.creature)).toBe(true);
    expect(ALIENS.filter((a) => a.role === 'horror').length).toBeGreaterThanOrEqual(5);
    expect(ALIENS.some((a) => a.elder)).toBe(true);
    expect(ALIENS.filter((a) => a.role === 'gunship').length).toBe(SPECIES.length);
    expect(DEFENSES.length).toBe(10);
    expect(CONSUMABLES.length).toBe(10);
    for (const d of DEFENSES) expect(d.tiers.length).toBe(5);
  });

  it('alien shots fly to their city and damage it; the Aegis Shell absorbs them', () => {
    const g = staged('SHOT');
    const c = g.cities;
    const k = 3;
    const before = c.health[k];
    fireEnemyShot(g, SHOT_PLASMA, 0, c.pos[k * 3] * 2, c.pos[k * 3 + 1] * 2, c.pos[k * 3 + 2] * 2, 10, k, -1, -1, 0);
    expect(g.hostile.count).toBe(1);
    steps(g, 60 * 3);
    expect(g.hostile.count).toBe(0);
    expect(c.health[k]).toBeLessThan(before);

    g.defense.add(defenseById('aegis'));
    g.recompute();
    expect(g.defense.aegis).toBeGreaterThan(0);
    const h = c.health[k];
    const shield = g.defense.aegis;
    fireEnemyShot(g, SHOT_PLASMA, 0, c.pos[k * 3] * 2, c.pos[k * 3 + 1] * 2, c.pos[k * 3 + 2] * 2, 10, k, -1, -1, 0);
    steps(g, 60 * 3);
    expect(c.health[k]).toBeCloseTo(h, 3);
    expect(g.defense.aegis).toBeLessThan(shield);
  });

  it('gunship fire knocks out emitters, which cut fire rate and rebuild later', () => {
    const g = staged('EMIT');
    const w = g.arsenal.weapons[0];
    expect(liveFraction(w)).toBe(1);
    hitEmitter(g, 0, 0, 1e6);
    expect(liveFraction(w)).toBeLessThan(1);
    expect(g.wrecks.count).toBe(1);
    steps(g, 60 * 16);
    expect(liveFraction(w)).toBe(1);
  });

  it('horrors grip cities with tentacles that die with their body', () => {
    const g = staged('HORROR', 14);
    const c = g.cities;
    const city = 0;
    const i = spawnAlien(g, alienIndex('horror_spawn'), 0, c.pos[0] * 1.6, c.pos[1] * 1.6, c.pos[2] * 1.6, city, g.combatRng);
    g.arsenal.weapons.length = 0;
    steps(g, 60 * 12);
    const e = g.enemies;
    let attached = 0;
    let tentacles = 0;
    for (let j = 0; j < e.high; j++) {
      if (!e.alive[j] || e.role[j] !== ROLE_TENTACLE) continue;
      tentacles++;
      if (e.state[j] === ST_ATTACHED) attached++;
    }
    expect(tentacles).toBeGreaterThanOrEqual(3);
    expect(attached).toBeGreaterThan(0);
    e.hp[i] = 1;
    g.arsenal.add(weaponById('railgun_sat'));
    g.recompute();
    // Kill the body directly; its limbs wither on the next step.
    e.hp[i] = 0.001;
    e.kill(i);
    steps(g, 2);
    let left = 0;
    for (let j = 0; j < e.high; j++) if (e.alive[j] && e.role[j] === ROLE_TENTACLE) left++;
    expect(left).toBe(0);
  });

  it('defense modules are offered once the run gets going, and maxed weapons get overdrive', () => {
    const g = staged('DEF');
    g.level = 5;
    const o = rollOffers(g, 3);
    expect(o.some((x) => x.kind === 'defense')).toBe(true);
    const w = g.arsenal.weapons[0];
    w.tier = w.def.tiers.length - 1;
    g.recompute();
    const dmg = w.stats.damage;
    w.overdrive = 3;
    g.recompute();
    expect(w.stats.damage).toBeGreaterThan(dmg * 1.3);
  });

  it('consumables stack, and a warhead clears the sky above its target', () => {
    const g = staged('NUKE', 10);
    expect(addItem(g, consumableById('nuke'), 2)).toBe(true);
    expect(g.items[0].count).toBe(2);
    const c = g.cities;
    const p: [number, number, number] = [c.pos[6], c.pos[7], c.pos[8]];
    const idx = alienIndex('greys_invader');
    for (let k = 0; k < 20; k++) spawnAlien(g, idx, 0, p[0] * 1.4, p[1] * 1.4, p[2] * 1.4, 2, g.combatRng, { quiet: true });
    const before = g.enemies.count;
    expect(g.useItem(0, { point: p })).toBe(true);
    expect(g.enemies.count).toBeLessThan(before - 15);
    expect(g.items[0].count).toBe(1);
  });

  it('kill salvage has diminishing returns within a wave', () => {
    const g = staged('SALV', 30);
    gainKillSalvage(g, 10000);
    expect(g.salvage).toBeLessThan(700);
    expect(g.salvage).toBeGreaterThan(100);
  });

  it('late waves bring directives, horrors and gunship packs', () => {
    const g = new Game('LATE');
    while (g.offer) g.choose(0);
    g.wave = 21;
    g.phaseTimer = 0;
    g.phase = 'intermission';
    g.step(STEP);
    expect(g.directives.length).toBeGreaterThanOrEqual(1);
    const roles = new Set(g.spawnQueue.map((q) => ALIENS[q.def].role));
    expect(roles.has('gunship')).toBe(true);
    expect(roles.has('horror')).toBe(true);
  });
});
