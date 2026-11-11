import { Rng } from '../core/rng';
import type { Game } from './game';

/**
 * Plays a run without a human: used by tests, the balance script and `?auto=1`.
 * Prefers evolutions, then tier-ups, then weapons, then passives; spends salvage in the shop.
 */
export class Bot {
  private rng: Rng;
  constructor(seed = 1, private skill = 1) {
    this.rng = new Rng(seed);
  }

  act(g: Game): void {
    if (g.offer) {
      const prio = { evolve: 4, tier: 2, weapon: 3, passive: 1 } as const;
      let best = 0;
      let bestScore = -Infinity;
      g.offer.forEach((o, i) => {
        const s = prio[o.kind] * this.skill + this.rng.next() * 2;
        if (s > bestScore) {
          bestScore = s;
          best = i;
        }
      });
      g.choose(best);
      return;
    }
    if (g.phase === 'shop' && g.shop) {
      const order = g.shop.stock.map((_, i) => i).sort((a, b) => g.shop!.stock[a].price - g.shop!.stock[b].price);
      for (const i of order) if (!g.shop.stock[i].sold && g.shop.stock[i].price <= g.salvage) g.buy(i);
      g.leaveShop();
      return;
    }
    for (let i = 0; i < g.abilities.length; i++) {
      const a = g.abilities[i];
      if (a.cd > 0 || g.enemies.count < 8) continue;
      if (a.def.targeting === 'none') g.useAbility(i);
      else if (a.def.targeting === 'city') {
        let worst = 0;
        for (let k = 1; k < g.cities.count; k++) if (g.threat[k] > g.threat[worst]) worst = k;
        g.useAbility(i, { city: worst });
      } else {
        const e = g.enemies;
        for (let j = 0; j < e.high; j++) {
          if (!e.alive[j]) continue;
          const r = Math.hypot(e.x[j], e.y[j], e.z[j]);
          if (r < 2) {
            g.useAbility(i, { point: [e.x[j] / r, e.y[j] / r, e.z[j] / r] });
            break;
          }
        }
      }
    }
  }
}
