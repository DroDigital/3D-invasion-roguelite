import { describe, expect, it } from 'vitest';
import { Game, STEP } from '../src/sim/game';
import { Bot } from '../src/sim/bot';
import { WEAPONS, EVOLUTIONS, BASE_WEAPONS, weaponById, evolutionsOf } from '../src/data/weapons';
import { ALIENS, SPECIES, ALIEN_TIERS } from '../src/data/aliens';
import { PASSIVES, RELICS, upgradeById } from '../src/data/passives';
import { ABILITIES } from '../src/data/abilities';
import { Build } from '../src/sim/build';
import { Arsenal } from '../src/sim/weapons';
import { readyEvolutions } from '../src/sim/offers';

/** Plays a run with the bot. `disarm` strips weapons to force a loss. */
function run(seed: string, steps: number, opts: { disarm?: boolean; abilities?: string[] } = {}): Game {
  const g = new Game({ seed, abilities: opts.abilities, abilitySlots: 2 });
  const bot = new Bot(7);
  for (let i = 0; i < steps && g.phase !== 'gameover'; i++) {
    bot.act(g);
    if (opts.disarm && !g.offer) g.arsenal.weapons.length = 0;
    g.step(STEP);
  }
  return g;
}

describe('game sim', () => {
  it('is deterministic for a seed and inputs', () => {
    const a = run('DET1', 60 * 120, { abilities: ['global_emp'] });
    const b = run('DET1', 60 * 120, { abilities: ['global_emp'] });
    expect(a.digest()).toBe(b.digest());
    expect(a.kills).toBe(b.kills);
    expect(a.salvage).toBe(b.salvage);
  });

  it('diverges across seeds', () => {
    expect(run('DET1', 60 * 40).digest()).not.toBe(run('DET2', 60 * 40).digest());
  });

  it('weapons kill enemies and track their damage', () => {
    const g = run('KILL', 60 * 90);
    expect(g.wave).toBeGreaterThanOrEqual(2);
    expect(g.kills).toBeGreaterThan(5);
    expect(g.arsenal.weapons.reduce((a, w) => a + w.damageDealt, 0)).toBeGreaterThan(0);
  });

  it('undefended, cities fall and the run ends', () => {
    const g = run('LOSE', 60 * 60 * 15, { disarm: true });
    expect(g.phase).toBe('gameover');
    expect(g.cities.totalPopulation()).toBeLessThan(g.cities.startPopulation * 0.25);
  });

  it('a long bot run stays healthy: no leaks, no NaN, pending damage bounded', () => {
    const g = run('LEAK', 60 * 60 * 6, { abilities: ['orbital_strike', 'emergency_shield'] });
    expect(g.wave).toBeGreaterThan(3);
    expect(g.projectiles.count).toBeLessThan(1500);
    for (let i = 0; i < g.enemies.high; i++) {
      if (!g.enemies.alive[i]) continue;
      expect(Number.isFinite(g.enemies.x[i])).toBe(true);
      expect(g.enemies.pending[i]).toBeGreaterThanOrEqual(0);
    }
    expect(Number.isFinite(g.cities.totalPopulation())).toBe(true);
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
    // A second starting pick follows, never repeating the first.
    expect(g.offer!.every((o) => o.kind === 'weapon' && o.weapon.id !== g.arsenal.weapons[0].def.id)).toBe(true);
    g.choose(0);
    expect(g.arsenal.weapons.length).toBe(2);
    expect(g.offer).toBeNull();
  });

  it('kills grant XP and level-ups offer distinct choices', () => {
    const g = new Game('LEVEL');
    g.choose(0);
    g.choose(0);
    for (let i = 0; i < 60 * 90 && !g.offer; i++) g.step(STEP);
    expect(g.level).toBeGreaterThanOrEqual(2);
    expect(g.offerKind).toBe('levelup');
    expect(new Set(g.offer!.map((o) => o.key)).size).toBe(g.offer!.length);
  });

  it('rerolls and banishes are limited, and a banished option never returns', () => {
    const g = new Game('BAN');
    g.choose(0);
    g.choose(0);
    for (let i = 0; i < 60 * 90 && !g.offer; i++) g.step(STEP);
    const idx = g.offer!.findIndex((o) => o.kind !== 'tier');
    const key = g.offer![idx].key;
    g.banish(idx);
    expect(g.banishes).toBe(1);
    for (let i = 0; i < 10; i++) g.reroll();
    expect(g.rerolls).toBe(0);
    const bot = new Bot(3);
    for (let i = 0; i < 60 * 240; i++) {
      if (g.offer) expect(g.offer.some((o) => o.key === key)).toBe(false);
      bot.act(g);
      g.step(STEP);
    }
  });

  it('applies stat effects by tag and stacks them', () => {
    const b = new Build();
    const a = new Arsenal();
    const rail = a.add(weaponById('railgun_sat'))!;
    const missile = a.add(weaponById('missile_platform'))!;
    b.add(upgradeById('tungsten_cores'));
    b.add(upgradeById('tungsten_cores'));
    b.add(upgradeById('targeting_uplink'));
    b.recompute(a.weapons);
    expect(rail.stats.damage).toBeCloseTo(10 * 1.4);
    expect(missile.stats.damage).toBeCloseTo(30);
    expect(rail.stats.targets).toBe(3);
  });

  it('two max-tier partners produce an evolution offer that merges them into one slot', () => {
    const g = new Game('EVO');
    g.choose(0);
    g.choose(0);
    g.arsenal.weapons.length = 0;
    const a = g.arsenal.add(weaponById('railgun_sat'))!;
    const b = g.arsenal.add(weaponById('pulse_laser'))!;
    a.tier = 4;
    b.tier = 3;
    expect(readyEvolutions(g).length).toBe(0);
    b.tier = 4;
    const ready = readyEvolutions(g);
    expect(ready.length).toBe(1);
    g.offer = ready;
    g.offerKind = 'levelup';
    g.choose(0);
    expect(g.arsenal.weapons.length).toBe(1);
    expect(g.arsenal.weapons[0].def.id).toBe('gauss_lance');
  });
});

describe('economy', () => {
  it('clearing a wave opens the shop; buying spends salvage; leaving starts the next wave', () => {
    const g = new Game('SHOP');
    const bot = new Bot(1);
    for (let i = 0; i < 60 * 120 && g.phase !== 'shop'; i++) {
      if (g.offer) bot.act(g);
      g.step(STEP);
    }
    expect(g.phase).toBe('shop');
    expect(g.shop!.stock.length).toBeGreaterThan(0);
    g.salvage = 999;
    const before = g.salvage;
    const i = g.shop!.stock.findIndex((s) => !s.sold);
    expect(g.buy(i)).toBe(true);
    expect(g.salvage).toBeLessThan(before);
    expect(g.shop!.stock[i].sold).toBe(true);
    expect(g.buy(i)).toBe(false);
    g.leaveShop();
    expect(g.phase).toBe('intermission');
  });
});

describe('content tables', () => {
  it('meets the launch content targets', () => {
    expect(BASE_WEAPONS.length).toBe(24);
    expect(EVOLUTIONS.length).toBeGreaterThanOrEqual(12);
    expect(PASSIVES.length).toBeGreaterThanOrEqual(60);
    expect(RELICS.length).toBeGreaterThanOrEqual(15);
    expect(ABILITIES.length).toBeGreaterThanOrEqual(8);
    expect(SPECIES.length).toBeGreaterThanOrEqual(4);
    expect(ALIEN_TIERS.map((t) => t.id)).toEqual(['common', 'elite', 'champion', 'mythic']);
  });

  it('every base weapon has 5 tiers with unique models and at least one evolution partner', () => {
    const models = new Set<string>();
    for (const w of BASE_WEAPONS) {
      expect(w.tiers.length).toBe(5);
      for (const t of w.tiers) {
        expect(models.has(t.model)).toBe(false);
        models.add(t.model);
      }
      expect(evolutionsOf(w.id).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('evolutions reference real weapons and produce evolved one-tier weapons', () => {
    for (const e of EVOLUTIONS) {
      for (const p of e.parents) expect(weaponById(p).evolved).toBeFalsy();
      const r = weaponById(e.result);
      expect(r.evolved).toBe(true);
      expect(r.tiers.length).toBe(1);
    }
  });

  it('ids are unique and every role exists for every species', () => {
    for (const list of [WEAPONS, ALIENS, PASSIVES, RELICS, ABILITIES]) expect(new Set(list.map((x) => x.id)).size).toBe(list.length);
    for (const s of SPECIES) for (const r of ['invader', 'destroyer', 'abductor', 'saboteur', 'carrier', 'boss']) expect(ALIENS.some((a) => a.species === s.id && a.role === r)).toBe(true);
    for (const a of ABILITIES) expect(a.cooldown).toBeGreaterThanOrEqual(45), expect(a.cooldown).toBeLessThanOrEqual(120);
  });
});

describe('evolution bookkeeping', () => {
  it('retires both parents so the same evolution cannot be built twice', () => {
    const g = new Game('RETIRE');
    g.choose(0);
    g.choose(0);
    g.arsenal.weapons.length = 0;
    g.arsenal.add(weaponById('drone_hive'))!.tier = 4;
    g.arsenal.add(weaponById('flak_battery'))!.tier = 4;
    g.offer = readyEvolutions(g);
    g.offerKind = 'levelup';
    g.choose(0);
    expect(g.arsenal.weapons.map((w) => w.def.id)).toEqual(['swarm_carrier']);
    expect(g.retired.has('drone_hive') && g.retired.has('flak_battery')).toBe(true);
    for (let k = 0; k < 50; k++) {
      g.offer = null;
      g.pendingLevels = 1;
      g.queueLevelUps();
      expect(g.offer!.some((o) => o.kind === 'weapon' && (o.weapon.id === 'drone_hive' || o.weapon.id === 'flak_battery'))).toBe(false);
    }
  });
});

describe('every weapon fires safely', () => {
  it('each base and evolved weapon kills a crowd without errors or runaway recursion', () => {
    for (const w of WEAPONS) {
      const g = new Game(`FIRE-${w.id}`);
      g.choose(0);
      g.choose(0);
      g.arsenal.weapons.length = 0;
      const o = g.arsenal.add(w)!;
      o.tier = w.tiers.length - 1;
      g.recompute();
      g.xp = -1e9;
      const bot = new Bot(1);
      for (let i = 0; i < 60 * 40 && g.phase !== 'gameover'; i++) {
        bot.act(g);
        g.step(STEP);
      }
      expect(g.kills, w.id).toBeGreaterThan(0);
    }
  }, 120000);
});

describe('endgame systems', () => {
  it('waves are big from the start and motherships appear on schedule', async () => {
    const { planWave } = await import('../src/sim/waves');
    const g = new Game('HORDE');
    g.choose(0);
    g.choose(0);
    g.wave = 1;
    planWave(g, g.waveRng);
    expect(g.spawnQueue.length).toBeGreaterThan(60);
    g.wave = 8;
    planWave(g, g.waveRng);
    expect(g.spawnQueue.some((q) => ALIENS[q.def].mothership)).toBe(true);
    g.wave = 30;
    planWave(g, g.waveRng);
    expect(g.spawnQueue.length).toBeGreaterThan(1000);
  });

  it('allied squadrons launch during a wave and score kills', () => {
    const g = new Game('ALLIES');
    g.choose(0);
    g.choose(0);
    for (let i = 0; i < 60 * 40; i++) {
      while (g.offer) g.choose(0);
      if (g.phase === 'shop') g.leaveShop();
      g.step(STEP);
    }
    expect(g.allies.kills).toBeGreaterThan(0);
  });
});
