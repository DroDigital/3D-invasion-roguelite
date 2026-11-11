import { alienIndex, WAVE_RULES } from './data/aliens';
import { weaponById } from './data/weapons';
import { spawnAlien } from './sim/aliens';
import type { Game } from './sim/game';
import { readyEvolutions } from './sim/offers';
import { updateEmitters } from './sim/weapons';

/** Console/automation helpers, enabled with ?dev=1. Not used by normal play. */
export function devTools(g: Game): Record<string, unknown> {
  return {
    /** Spawn `n` aliens of a type near a world direction (defaults: random). */
    spawn(id: string, tier = 0, n = 1, dir?: [number, number, number], dist = 2.2) {
      const r = g.waveRng;
      for (let k = 0; k < n; k++) {
        const d = dir ?? [r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)];
        const l = Math.hypot(d[0], d[1], d[2]) || 1;
        const j = 0.12;
        const x = (d[0] / l + r.range(-j, j)) * dist;
        const y = (d[1] / l + r.range(-j, j)) * dist;
        const z = (d[2] / l + r.range(-j, j)) * dist;
        spawnAlien(g, alienIndex(id), tier, x, y, z, r.int(g.cities.count), r);
      }
    },
    setWave(n: number) {
      g.wave = n;
    },
    give(id: string, tier = 0) {
      const w = g.arsenal.get(id) ?? g.arsenal.add(weaponById(id));
      if (!w) return;
      w.tier = Math.min(tier, w.def.tiers.length - 1);
      updateEmitters(w, 0);
      g.recompute();
    },
    /** Offer every ready evolution now. */
    offerEvolutions() {
      const o = readyEvolutions(g);
      if (o.length) {
        g.offer = o;
        g.offerKind = 'levelup';
      }
    },
    holdWaves() {
      g.phaseTimer = 1e9;
      g.phase = 'intermission';
      g.spawnQueue.length = 0;
      void WAVE_RULES;
    },
  };
}
